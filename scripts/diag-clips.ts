// 诊断：静态穿模报告构成分析（监工临时文件）
import { makeEngineRegistry, makeEngineLayouts } from "../src/three/parts/models/tiger/engine/registry";
import { tigerKitBuilders } from "../src/three/parts/models/tiger/engine/kits";
import { buildModel } from "../src/three/parts/assembler/assembler";
import { detectStatic } from "../src/three/parts/solver/detect";

const registry = makeEngineRegistry();
const model = buildModel(registry, {
  builders: tigerKitBuilders,
  instanceLayouts: makeEngineLayouts(),
  warnMissingLayout: false,
});

// 可选参数：只统计 buildLayer ≤ N 的零件对（任务书 §3.4「该层穿模验收」口径）
const layerLimit = Number(process.argv[2] ?? 0);
const reports = detectStatic(model, {
  minDepthM: 0.0005,
  ...(layerLimit > 0 ? { filter: (h: { buildLayer: number }) => h.buildLayer <= layerLimit } : {}),
});
console.log(`总报告数: ${reports.length}${layerLimit > 0 ? `（仅 L1..L${layerLimit} 零件对）` : "（全部）"}`);

// 按深度分层（字段口径修正：ClippingReport.depth_mm 本就是毫米；旧稿误读 depthM 米制，导致分层恒为 0）
const deep = reports.filter((r) => r.depth_mm > 10);
const mid = reports.filter((r) => r.depth_mm > 2 && r.depth_mm <= 10);
const shallow = reports.filter((r) => r.depth_mm <= 2);
console.log(
  `深度 >10mm(真缺陷级): ${deep.length}  2-10mm: ${mid.length}  ≤2mm(装配接触级): ${shallow.length}`,
);

// 深度前 12 名
const sorted = [...reports].sort((a, b) => b.depth_mm - a.depth_mm);
console.log("--- 深度 TOP12 ---");
for (const r of sorted.slice(0, 12)) {
  console.log(`${r.depth_mm.toFixed(1)}mm  ${r.a}  ↔  ${r.b}`);
}

// 按零件家族聚合（看哪个家族最多）
const fam = new Map<string, number>();
for (const r of reports) {
  const key = `${r.a.split("[")[0]} ↔ ${r.b.split("[")[0]}`;
  fam.set(key, (fam.get(key) ?? 0) + 1);
}
console.log("--- 报告家族 TOP10 ---");
for (const [k, v] of [...fam.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
  console.log(`${v}  ${k}`);
}

console.log("--- 报告家族（全部，数量降序；含家族最大深度） ---");
for (const [k, v] of [...fam.entries()].sort((a, b) => b[1] - a[1])) {
  const famReports = reports.filter((r) => `${r.a.split("[")[0]} ↔ ${r.b.split("[")[0]}` === k);
  const maxDepth = Math.max(...famReports.map((r) => r.depth_mm));
  console.log(`${String(v).padStart(3)}  max ${maxDepth.toFixed(1).padStart(6)}mm  ${k}`);
}
