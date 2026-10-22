import type { BuildLayer, ModelRegistry, PartDefinition } from "../registry/types";
import { instanceRef } from "../registry/types";
import type { PartHandle } from "../assembler/assembler";

// ============================================================================
// solver/report —— 穿模报告格式与提示生成（格式基线见框架文档第 6 节）
//
// 报告必须可定位到实例：a/b 为 `零件ID[实例下标]`，禁止匿名 mesh 名。
// hint 由检测器按零件的 mate / constants 引用自动生成，指到「该改哪个常量」。
//
// 深度语义（监工口径，detect.ts 三修）：
//   · depth_mm 只报「真实穿透深度」（落入对方实体的采样点到对方表面的最大距离）；
//   · 测不出时 depth_mm = null + estimated=true，卡片改显示「交线 XXmm（形态）」——
//     禁止再拿 AABB 交叠尺寸冒充深度（旧的 125.60mm 假数字）。
//
// 形态语义（form，判定树的形状分流）——null 不等于放行：
//   · 相交判定（bvhcast）本身可信，要分类的是「相交之后」：共面贴合 / 同心配合面 / 存疑穿透；
//   · 可靠尺子是交线（intersectsTriangle 截线）：贴合退化、绕轴闭合、还是成团横穿。
// ============================================================================

export type ClippingPhase = "static" | "animation" | "param_scan";

/**
 * 相交形态（detect.ts 按交线长度 + 分布尺寸分类；whitelist.ts 只认前两类为构造性接触）：
 *   · face_mate：交线退化（≈ 0，共面贴合）→ 装配接触，可豁免；
 *   · bearing_overlap：交线绕轴闭合、且由贴合壁对贡献（同心配合面）→ 可豁免；
 *   · displaced：实测出深度且交线成团 → 错位穿透（未豁免，必报）；
 *   · suspect：交线成团 / 超长 / 分布超标（横穿薄板、管路穿支架）→ 存疑穿透（未豁免，必报）。
 * suspect / displaced 永不进豁免区：白名单守门对这两级无效。
 */
export type OverlapForm = "face_mate" | "bearing_overlap" | "suspect" | "displaced";

export interface ClippingReport {
  type: "clipping";
  phase: ClippingPhase;
  /** 实例级引用：`tiger.track.link[42]`。 */
  a: string;
  b: string;
  /**
   * 实测穿透深度（毫米）。只报真实穿透；面贴合 / 同心配合面测不出时为 null，
   * 卡片显示「交线 XXmm（形态）」而不是假深度。
   */
  depth_mm: number | null;
  /** 交线总长（毫米）：所有相交三角面对的交线段长度之和（配合面尺度）。 */
  intersection_mm?: number;
  /** 交线分布包围盒尺寸（毫米 [x, y, z]）。 */
  extent_mm?: [number, number, number];
  /** 相交形态（见 OverlapForm）。 */
  form?: OverlapForm;
  /** 代表性穿透点（模型空间，米）。 */
  point: [number, number, number];
  /** 动画扫掠帧号（静态检测为 null）。 */
  frame: number | null;
  severity: "error" | "warn";
  hint: string;
  /** 深度为估算（未详细分析 / 测不出用交线形态兜底）时标记。 */
  estimated?: boolean;
  aLayer?: BuildLayer;
  bLayer?: BuildLayer;
  /**
   * 扫掠期两件是否存在相对运动：
   * false = 全程刚性同行（同节点/父子且无相对转动），静态构造接触仍可豁免；
   * true/缺省 = 相对运动，staticOnly 白名单不得覆盖。
   */
  relativeMotion?: boolean;
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
export function buildHint(context: HintContext, depthMm: number | null, lineMm = 0): string {
  const { defA, defB, constants } = context;
  const authored = [...new Set([defA?.hint, defB?.hint].filter((item): item is string => Boolean(item)))];
  if (authored.length > 0) return authored.join("；");
  const refsA = defA ? referencedConstants(defA, constants) : [];
  const refsB = defB ? referencedConstants(defB, constants) : [];
  const nameA = defA ? `${defA.name_cn}(${defA.id})` : "A";
  const nameB = defB ? `${defB.name_cn}(${defB.id})` : "B";
  const parts: string[] = [
    depthMm === null
      ? `${nameA} 与 ${nameB} 交线 ${lineMm.toFixed(1)}mm（面级接触，未测出穿透深度）。`
      : `${nameA} 与 ${nameB} 重叠 ${depthMm.toFixed(2)}mm。`,
  ];
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

/** 排序用深度序：测不出深度的排在实测之后（按 -1 处理，再按交线长度排）。 */
function depthRank(report: ClippingReport): number {
  return report.depth_mm === null ? -1 : report.depth_mm;
}

/** 报告排序：实测深度大者在前；未测出深度的按交线长度排（贴合/配合级）。 */
export function sortReports(reports: ClippingReport[]): ClippingReport[] {
  return [...reports].sort(
    (left, right) =>
      depthRank(right) - depthRank(left) ||
      (right.intersection_mm ?? 0) - (left.intersection_mm ?? 0) ||
      left.a.localeCompare(right.a) ||
      left.b.localeCompare(right.b),
  );
}

/** 汇总统计（UI 徽标使用）：最深只统计实测深度。 */
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
    deepestMm = Math.max(deepestMm, report.depth_mm ?? 0);
  }
  return { total: reports.length, errors, warns, deepestMm };
}
