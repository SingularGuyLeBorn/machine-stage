// ============================================================================
// diag-t800 —— T-800 内骨骼整机门禁
//
//   · 注册表校验（0 错 0 警）
//   · 静态装配零穿模（未豁免）
//   · 屈伸/步态扫掠全程零穿模（未豁免）
//   · 悬空：真实表面间距 > 3mm 的零件（BVH 最近面点，双向量测量）
//   · 液压缸行程：每根缸露出杆长 = |AB| - 缸长（几何解，非动画写死）
//
// 用法：npx tsx scripts/diag-t800.ts [--write]
// ============================================================================
import * as THREE from "three";
import { validateRegistry, formatIssues } from "../src/three/parts/registry/validate";
import { buildModel } from "../src/three/parts/assembler/assembler";
import { detectStatic, getBVH } from "../src/three/parts/solver/detect";
import { partitionExpectedContacts } from "../src/three/parts/solver/whitelist";
import { makeT800Layouts, makeT800Registry, t800AllBuilders } from "../src/three/parts/models/t800/registry";
import { JOINT_BY_NAME, JOINTS, jointChain } from "../src/three/parts/models/t800/spec";
import { animateT800, t800CylinderReadout } from "../src/three/parts/models/t800/motion";
import { writeFileSync } from "node:fs";

// ---------------------------------------------------------------- 注册表
const registry = makeT800Registry();
const issues = validateRegistry(registry);
const errors = issues.filter((i) => i.level === "error");
const warns = issues.filter((i) => i.level === "warn");
console.log(`注册表校验：${errors.length} 错 / ${warns.length} 警`);
if (errors.length) console.log(formatIssues(errors.slice(0, 10)));
if (warns.length) console.log(formatIssues(warns.slice(0, 10)));

// ---------------------------------------------------------------- 装配
const model = buildModel(registry, {
  builders: t800AllBuilders,
  instanceLayouts: makeT800Layouts(),
  warnMissingLayout: false,
});
const instanceCount = model.parts.reduce((n, p) => n + p.instances.length, 0);
console.log(`零件定义 ${registry.parts.length} / 实例 ${instanceCount}`);

const rules = registry.expectedContacts ?? [];

// ---------------------------------------------------------------- 静态穿模
animateT800(model, 0);
const staticReports = detectStatic(model, { minDepthM: 0.0005 });
const staticPartition = partitionExpectedContacts(staticReports, rules);
console.log(
  `静态穿模报告 ${staticReports.length}（未豁免 ${staticPartition.active.length} / 已豁免 ${staticPartition.expected.length}）`,
);
for (const r of staticPartition.active.slice(0, 20)) {
  console.log(
    `  ${r.report.a} ↔ ${r.report.b}  ${r.report.depth_mm?.toFixed(2) ?? "?"}mm  ${r.report.form ?? ""}  ` +
      `@(${r.report.point.map((v) => (v * 1000).toFixed(0)).join(",")})mm`,
  );
}

// ---------------------------------------------------------------- 扫掠
const FRAMES = 16;
const CYCLE = 6.4;
const sweepReports: typeof staticReports = [];
for (let i = 0; i < FRAMES; i++) {
  animateT800(model, (i / FRAMES) * CYCLE);
  const reports = detectStatic(model, { minDepthM: 0.0005 });
  for (const r of reports) sweepReports.push(r);
}
const sweepPartition = partitionExpectedContacts(sweepReports, rules);
console.log(
  `扫掠 ${FRAMES} 帧穿模报告 ${sweepReports.length}（未豁免 ${sweepPartition.active.length} / 已豁免 ${sweepPartition.expected.length}）`,
);
{
  const seen = new Set<string>();
  for (const r of sweepPartition.active) {
    const key = `${r.report.a}|${r.report.b}`;
    if (seen.has(key)) continue;
    seen.add(key);
    console.log(`  ${r.report.a} ↔ ${r.report.b}  ${r.report.depth_mm?.toFixed(2) ?? "?"}mm  ${r.report.form ?? ""}`);
  }
  console.log(`  （唯一对 ${seen.size} 个）`);
}

// ---------------------------------------------------------------- 悬空
//
// 真实网格里每块骨头是**独立对象**（源模型如此），块与块之间的缝从几毫米到 200 毫米不等，
// 用几何间距判"悬空"会满屏误报。有意义的是**骨架连通性**：
// 每个部位都必须挂在一棵父子链上、链必须通到骨盆（根）——挂不上的就是真的"零件掉了"。
// 同时报告每个部位到**动画父部位**的几何间隙（装配上有多紧）。
const disconnected = JOINTS.filter((j) => {
  const chain = jointChain(j.name);
  return chain[0] !== "bip_pelvis_02";
});
console.log(`悬空候选（未挂到骨架的部位）：${disconnected.length}`);
for (const j of disconnected.slice(0, 20)) console.log(`  ${j.name}`);

/** 两个包围盒（中心 + 尺寸）之间的最近距离（mm）。 */
function boxGapMm(
  ca: [number, number, number],
  sa: [number, number, number],
  cb: [number, number, number],
  sb: [number, number, number],
): number {
  let sum = 0;
  for (let k = 0; k < 3; k++) {
    const d = Math.max(Math.abs(ca[k] - cb[k]) - (sa[k] + sb[k]) / 2, 0);
    sum += d * d;
  }
  return Math.sqrt(sum) * 1000;
}

const parentGap: Array<{ name: string; gapMm: number }> = [];
for (const j of JOINTS) {
  if (!j.parent) continue;
  const parent = JOINT_BY_NAME.get(j.parent);
  if (!parent) continue;
  // 用**几何**间距（包围盒最近距离），不用转轴间距：脊柱/胸廓这类大件的
  // 转轴在底端，轴距会被误报成"脱开"。
  parentGap.push({ name: j.name, gapMm: boxGapMm(j.center, j.size, parent.center, parent.size) });
}
const loose = parentGap.filter((g) => g.gapMm > 120).sort((a, b) => b.gapMm - a.gapMm);
console.log(`父子骨骼几何间隙 > 120mm 的部位：${loose.length}`);
for (const g of loose.slice(0, 10)) console.log(`  ${g.name}  ${g.gapMm.toFixed(0)}mm`);

// ---------------------------------------------------------------- 液压行程
const cylinders = t800CylinderReadout(model);
console.log("液压缸行程（几何解）：");
for (const c of cylinders) {
  console.log(`  ${c.key}  |AB|=${c.lengthMm.toFixed(1)}mm  露出杆长=${c.exposedMm.toFixed(1)}mm`);
}
const cylOk = cylinders.every((c) => c.exposedMm > -0.001 && c.exposedMm < c.lengthMm);
console.log(`液压行程判定：${cylOk ? "PASS" : "FAIL"}`);

// ---------------------------------------------------------------- 汇总
const unexempt = staticPartition.active.length + sweepPartition.active.length;
console.log(
  `\n未豁免穿模 ${unexempt}（静态 ${staticPartition.active.length} + 扫掠 ${sweepPartition.active.length}）` +
    `  悬空 ${disconnected.length}  液压行程 ${cylOk ? "PASS" : "FAIL"}  零件 ${registry.parts.length} PASS`,
);

if (process.argv.includes("--write")) {
  const lines: string[] = [];
  lines.push("# T-800 内骨骼整机 · 装配 / 穿模 / 悬空 / 液压行程审计");
  lines.push("");
  lines.push(`- 零件定义：${registry.parts.length}，实例：${instanceCount}`);
  lines.push(`- 注册表校验：${errors.length} 错 / ${warns.length} 警`);
  lines.push(`- 静态穿模：${staticReports.length}（未豁免 ${staticPartition.active.length}）`);
  lines.push(`- 扫掠 ${FRAMES} 帧：${sweepReports.length}（未豁免 ${sweepPartition.active.length}）`);
  lines.push(`- 悬空候选（未挂到骨架的部位）：${disconnected.length}`);
  lines.push("");
  lines.push("## 悬空清单");
  lines.push("");
  lines.push("| 零件 | 最近邻居 | 间距 |");
  lines.push("|---|---|---|");
  for (const j of disconnected) lines.push(`| ${j.name} | — | — |`);
  lines.push("");
  lines.push("## 液压缸行程（几何解，非动画写死）");
  lines.push("");
  lines.push("| 缸 | \\|AB\\| | 露出杆长 |");
  lines.push("|---|---|---|");
  for (const c of cylinders) {
    lines.push(`| ${c.key} | ${c.lengthMm.toFixed(1)}mm | ${c.exposedMm.toFixed(1)}mm |`);
  }
  lines.push("");
  lines.push(`液压行程判定：**${cylOk ? "PASS" : "FAIL"}**`);
  writeFileSync("docs/qa/t800-leg-audit.md", lines.join("\n"), "utf8");
}
