// 诊断：静态穿模报告构成分析 + 零件对展开口径（唯一保留的门禁脚本，见 scripts/README）
//
// 用法：
//   npx tsx scripts/diag-clips.ts        # 全模型
//   npx tsx scripts/diag-clips.ts 1      # 只统计 buildLayer ≤ 1 的零件对（层验收口径）
import { buildModel } from "../src/three/parts/assembler/assembler";
import { tigerEngineExpectedContacts } from "../src/three/parts/models/tiger/engine/expectedContacts";
import { tigerKitBuilders } from "../src/three/parts/models/tiger/engine/kits";
import { makeEngineLayouts, makeEngineRegistry } from "../src/three/parts/models/tiger/engine/registry";
import { detectStatic, planPairs } from "../src/three/parts/solver/detect";
import type { ClippingReport } from "../src/three/parts/solver/report";
import { partitionExpectedContacts } from "../src/three/parts/solver/whitelist";

const registry = makeEngineRegistry();
const model = buildModel(registry, {
  builders: tigerKitBuilders,
  instanceLayouts: makeEngineLayouts(),
  warnMissingLayout: false,
});

// 可选参数：只统计 buildLayer ≤ N 的零件对（任务书 §3.4「该层穿模验收」口径）
const layerLimit = Number(process.argv[2] ?? 0);
const filter =
  layerLimit > 0 ? (handle: { buildLayer: number }) => handle.buildLayer <= layerLimit : undefined;

const started = performance.now();
const reports = detectStatic(model, { minDepthM: 0.0005, ...(filter ? { filter } : {}) });
const elapsed = Math.round(performance.now() - started);

// ---- 零件对展开口径：报告数是「实例级」，零件对去重是另一口径 ----
const plan = planPairs(model, { ...(filter ? { filter } : {}) });
const partIdOf = (ref: string) => ref.split("[")[0];
const distinctPartPairs = new Set(reports.map((r) => [partIdOf(r.a), partIdOf(r.b)].sort().join(" ↔ ")));
console.log(`耗时: ${elapsed} ms`);
console.log(
  `总报告数（实例级）: ${reports.length}${layerLimit > 0 ? `（仅 L1..L${layerLimit} 零件对）` : "（全部）"}`,
);
console.log(
  `零件对展开: 实例(body) ${plan.bodies.length} → AABB 候选对 ${plan.pairs.length} → ` +
    `相交报告 ${reports.length}（实例级）→ 去重零件对 ${distinctPartPairs.size} 组`,
);

// ---- 深度口径：只统计实测深度；null = 测不出（贴合 / 同心配合面），不参与数值分层 ----
const depthOf = (report: ClippingReport) => report.depth_mm ?? -1;
const shapeTally = { bearing_overlap: 0, face_contact: 0, displaced: 0 } as Record<string, number>;
let measured = 0;
for (const report of reports) {
  shapeTally[report.shape ?? "unknown"] = (shapeTally[report.shape ?? "unknown"] ?? 0) + 1;
  if (report.depth_mm !== null) measured++;
}
console.log(
  `深度口径: 实测 ${measured} / 测不出 ${reports.length - measured}；` +
    `形态: 绕轴闭合(配合面) ${shapeTally.bearing_overlap} · 贴合面 ${shapeTally.face_contact} · 局部成团(错位) ${shapeTally.displaced}`,
);

const deep = reports.filter((r) => depthOf(r) > 10);
const mid = reports.filter((r) => depthOf(r) > 2 && depthOf(r) <= 10);
const shallow = reports.filter((r) => depthOf(r) > 0 && depthOf(r) <= 2);
console.log(
  `深度 >10mm(真缺陷级): ${deep.length}  2-10mm: ${mid.length}  ≤2mm(装配接触级): ${shallow.length}`,
);

// ---- 实测深度 TOP12 ----
const byDepth = [...reports].filter((r) => r.depth_mm !== null).sort((a, b) => depthOf(b) - depthOf(a));
console.log("--- 实测深度 TOP12 ---");
const pointText = (report: ClippingReport) =>
  `@(${report.point.map((v) => (v * 1000).toFixed(0)).join(",")})mm`;
for (const r of byDepth.slice(0, 12)) {
  console.log(
    `${r.depth_mm!.toFixed(2).padStart(7)}mm  [${r.shape}] 交线 ${(r.intersection_mm ?? 0).toFixed(1)}mm  ${pointText(r)}  ${r.a}  ↔  ${r.b}`,
  );
}

// ---- 未测出深度（贴合/配合面）交线 TOP8 ----
const byLine = [...reports]
  .filter((r) => r.depth_mm === null)
  .sort((a, b) => (b.intersection_mm ?? 0) - (a.intersection_mm ?? 0));
if (byLine.length > 0) {
  console.log("--- 未测出深度 · 交线 TOP8（配合面尺度） ---");
  for (const r of byLine.slice(0, 8)) {
    console.log(`${(r.intersection_mm ?? 0).toFixed(1).padStart(7)}mm  [${r.shape}]  ${r.a}  ↔  ${r.b}`);
  }
}

// ---- 按零件家族聚合 ----
const fam = new Map<string, ClippingReport[]>();
for (const r of reports) {
  const key = `${partIdOf(r.a)} ↔ ${partIdOf(r.b)}`;
  fam.set(key, [...(fam.get(key) ?? []), r]);
}
console.log("--- 报告家族 TOP10 ---");
for (const [k, v] of [...fam.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 10)) {
  console.log(`${v.length}  ${k}`);
}

console.log("--- 报告家族（全部，数量降序；max = 家族内最深实测深度） ---");
for (const [k, v] of [...fam.entries()].sort((a, b) => b[1].length - a[1].length)) {
  const depths = v.map((r) => r.depth_mm).filter((d): d is number => d !== null);
  const maxDepth = depths.length > 0 ? `${Math.max(...depths).toFixed(2)}mm` : "—（测不出）";
  const shape = v[0].shape ?? "?";
  console.log(`${String(v.length).padStart(3)}  max ${maxDepth.padStart(12)}  [${shape}]  ${k}`);
}

// ---- 白名单分层：未豁免 = 真缺陷候选（验收口径「未豁免报告 = 0」） ----
const split = partitionExpectedContacts(reports, tigerEngineExpectedContacts);
console.log(`--- 白名单分层: 未豁免 ${split.active.length} / 已豁免 ${split.expected.length} ---`);
if (split.active.length > 0) {
  console.log("--- 未豁免（真缺陷候选，按深度降序） ---");
  const activeSorted = [...split.active].sort((a, b) => depthOf(b.report) - depthOf(a.report));
  for (const item of activeSorted) {
    const r = item.report;
    const depth = r.depth_mm === null ? "  未测出" : `${r.depth_mm.toFixed(2)}mm`;
    console.log(`${depth.padStart(10)}  [${r.shape}]  ${pointText(r)}  ${r.a}  ↔  ${r.b}`);
  }
}
const famTally = new Map<string, number>();
for (const hit of split.expected) famTally.set(hit.rule.family, (famTally.get(hit.rule.family) ?? 0) + 1);
console.log("--- 已豁免族计数（docs/qa/whitelist/README.md 表格口径） ---");
for (const rule of tigerEngineExpectedContacts) {
  console.log(`${String(famTally.get(rule.family) ?? 0).padStart(3)}  ${rule.family}`);
}

model.dispose();
