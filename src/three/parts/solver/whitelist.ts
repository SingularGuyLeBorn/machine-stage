import { parseInstanceRef, type ExpectedContactRule } from "../registry/types";
import type { ClippingReport } from "./report";

// ============================================================================
// solver/whitelist —— 报告分层（未豁免 / 已豁免）
//
// 目标函数是「未豁免报告 = 0」，不是「总报告 = 0」：
//   · 已豁免 = 构造性接触（轴承配合/过盈压装/剖分贴合/管端插接…），是正确装配；
//   · 未豁免 = 真缺陷候选（不该接触的零件叠在一起 = 位置或尺寸算错）。
// 两道守门（形态 + 深度），缺一不可：
//   · 形态守门：只豁免 face_mate（共面贴合）/ bearing_overlap（同心配合面）两类；
//     suspect（成团 / 超长横穿交线）与 displaced（错位穿透）无视豁免规则，永远进未豁免区。
//   · 深度守门：豁免族里若冒出「明显超过贴面量级」的实测深度，判为真缺陷照报——
//     所以往豁免族里注入 5mm 真重叠时，只报那一条。
//   · depth_mm = null 不再等于放行：null 必须过形态分流，分不出的一律进未豁免区人工审。
//     旧实现拿「测不出深度」当放行条，水管横穿支架（交线 112.56mm）就是这么漏掉的。
// ============================================================================

/** 豁免族允许的最大深度（mm）：超过即不再豁免（0.5mm 是检测阈值下限）。 */
export const DEFAULT_MAX_DEPTH_MM = 2;

/** 报告 + 在报告数组中的原始下标（飞到穿透点 / 隔离对比要用原下标）。 */
export interface ReportRef {
  report: ClippingReport;
  index: number;
}

export interface ExpectedContactHit extends ReportRef {
  rule: ExpectedContactRule;
}

export interface ContactPartition {
  /** 未豁免：真缺陷候选。 */
  active: ReportRef[];
  /** 已豁免：构造性接触（带命中规则）。 */
  expected: ExpectedContactHit[];
}

/** 零件 id 模式匹配：`*` 结尾 = 前缀匹配，否则精确匹配；实例下标先剥掉。 */
export function matchesPartId(pattern: string, ref: string): boolean {
  const { partId } = parseInstanceRef(ref);
  if (pattern.endsWith("*")) return partId.startsWith(pattern.slice(0, -1));
  return partId === pattern;
}

/** 单条报告 → 命中规则（A/B 顺序无关）。形态守门 + 深度守门，两道都过才豁免。 */
export function matchExpectedContact(
  report: ClippingReport,
  rules: readonly ExpectedContactRule[],
): ExpectedContactRule | null {
  for (const rule of rules) {
    // 形态守门：默认只收 face_mate / bearing_overlap；
    // 族里显式声明 allowDisplaced 时才额外收 displaced（构造性配合常被判成 displaced）。
    const formOk =
      report.form === "face_mate" ||
      report.form === "bearing_overlap" ||
      (report.form === "displaced" && rule.allowDisplaced === true);
    if (!formOk) continue;
    const forward = matchesPartId(rule.a, report.a) && matchesPartId(rule.b, report.b);
    const backward = matchesPartId(rule.a, report.b) && matchesPartId(rule.b, report.a);
    if (!forward && !backward) continue;
    const limit = rule.maxDepthMm ?? DEFAULT_MAX_DEPTH_MM;
    // 深度守门：可测深度必须落在族限内；测不出（null）由上面的形态分类兜底。
    if (report.depth_mm !== null && report.depth_mm > limit) continue;
    return rule;
  }
  return null;
}

/** 报告分层（保持输入顺序与原始下标）。 */
export function partitionExpectedContacts(
  reports: readonly ClippingReport[],
  rules: readonly ExpectedContactRule[],
): ContactPartition {
  const active: ReportRef[] = [];
  const expected: ExpectedContactHit[] = [];
  reports.forEach((report, index) => {
    const rule = matchExpectedContact(report, rules);
    if (rule) expected.push({ report, index, rule });
    else active.push({ report, index });
  });
  return { active, expected };
}

/** 已豁免报告按豁免族聚合（面板「已豁免」区、QA 截图清单共用同一口径）。 */
export function expectedContactFamilies(hits: readonly ExpectedContactHit[]): Array<{
  family: string;
  reason: string;
  items: ExpectedContactHit[];
}> {
  const families = new Map<string, { family: string; reason: string; items: ExpectedContactHit[] }>();
  for (const hit of hits) {
    const row = families.get(hit.rule.family) ?? {
      family: hit.rule.family,
      reason: hit.rule.reason,
      items: [],
    };
    row.items.push(hit);
    families.set(hit.rule.family, row);
  }
  return [...families.values()];
}
