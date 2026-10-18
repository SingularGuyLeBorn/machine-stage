import type { BuildLayer, ModelRegistry, PartDefinition } from "../registry/types";
import { instanceRef } from "../registry/types";
import type { PartHandle } from "../assembler/assembler";

// ============================================================================
// solver/report —— 穿模报告格式与提示生成（格式基线见框架文档第 6 节）
//
// 报告必须可定位到实例：a/b 为 `零件ID[实例下标]`，禁止匿名 mesh 名。
// hint 由检测器按零件的 mate / constants 引用自动生成，指到「该改哪个常量」。
// ============================================================================

export type ClippingPhase = "static" | "animation" | "param_scan";

export interface ClippingReport {
  type: "clipping";
  phase: ClippingPhase;
  /** 实例级引用：`tiger.track.link[42]`。 */
  a: string;
  b: string;
  /** 估算重叠深度（毫米）。 */
  depth_mm: number;
  /** 代表性穿透点（模型空间，米）。 */
  point: [number, number, number];
  /** 动画扫掠帧号（静态检测为 null）。 */
  frame: number | null;
  severity: "error" | "warn";
  hint: string;
  /** 深度为几何近似（无顶点落入对方体内时的退化情形）时标记。 */
  estimated?: boolean;
  aLayer?: BuildLayer;
  bLayer?: BuildLayer;
}

const IDENTIFIER = /[A-Za-z_][A-Za-z0-9_]*/g;

/** 收集零件声明中引用到的常量名（用于自动生成「该改哪个常量」提示）。 */
export function referencedConstants(def: PartDefinition, constants: Record<string, number>): string[] {
  const names = new Set<string>();
  const visit = (value: unknown) => {
    if (typeof value === "string") {
      for (const match of value.matchAll(IDENTIFIER)) {
        if (Object.prototype.hasOwnProperty.call(constants, match[0])) names.add(match[0]);
      }
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (value && typeof value === "object") {
      for (const item of Object.values(value)) visit(item);
    }
  };
  visit(def.mate);
  visit(def.geometry);
  return [...names].sort();
}

export interface HintContext {
  registry?: ModelRegistry;
  constants: Record<string, number>;
  defA?: PartDefinition;
  defB?: PartDefinition;
}

/** 自动提示：优先人工 hint，其次列出双方引用的常量，最后给出泛化建议。 */
export function buildHint(context: HintContext, depthMm: number): string {
  const { defA, defB, constants } = context;
  const authored = [...new Set([defA?.hint, defB?.hint].filter((item): item is string => Boolean(item)))];
  if (authored.length > 0) return authored.join("；");
  const refsA = defA ? referencedConstants(defA, constants) : [];
  const refsB = defB ? referencedConstants(defB, constants) : [];
  const nameA = defA ? `${defA.name_cn}(${defA.id})` : "A";
  const nameB = defB ? `${defB.name_cn}(${defB.id})` : "B";
  const parts: string[] = [`${nameA} 与 ${nameB} 重叠 ${depthMm.toFixed(2)}mm。`];
  if (refsA.length > 0 || refsB.length > 0) {
    const clauses: string[] = [];
    if (refsA.length > 0) clauses.push(`${refsA.join("/")}`);
    if (refsB.length > 0) clauses.push(`${refsB.join("/")}`);
    parts.push(`检查常量 ${clauses.join(" 与 ")} 派生的位置/尺寸是否留出装配间隙。`);
  } else {
    parts.push("检查双方 mate 偏移与几何尺寸是否留出装配间隙。");
  }
  return parts.join("");
}

export function formatReportRef(handle: PartHandle, index: number): string {
  return instanceRef(handle.partId, handle.instanced ? index : null);
}

/** 报告排序：深度大者在前（越深越严重）；同深度按 id 稳定排序。 */
export function sortReports(reports: ClippingReport[]): ClippingReport[] {
  return [...reports].sort(
    (left, right) =>
      right.depth_mm - left.depth_mm || left.a.localeCompare(right.a) || left.b.localeCompare(right.b),
  );
}

/** 汇总统计（UI 徽标使用）。 */
export function summarizeReports(reports: ClippingReport[]): {
  total: number;
  errors: number;
  warns: number;
  deepestMm: number;
} {
  let errors = 0;
  let warns = 0;
  let deepestMm = 0;
  for (const report of reports) {
    if (report.severity === "error") errors++;
    else warns++;
    deepestMm = Math.max(deepestMm, report.depth_mm);
  }
  return { total: reports.length, errors, warns, deepestMm };
}
