// 诊断：T-800 右腿 —— 静态/屈伸扫掠穿模 + 悬空（支撑邻接）+ 液压行程核算
// 用法：npx tsx scripts/diag-t800.ts [--write]
import { writeFileSync } from "node:fs";
import * as THREE from "three";
import { buildModel } from "../src/three/parts/assembler/assembler";
import { makeT800Layouts, makeT800Registry, t800Builders } from "../src/three/parts/models/t800/registry";
import { animateT800, t800Pose, t800Stroke } from "../src/three/parts/models/t800/motion";
import { CYL, T800_HYDRAULICS, cylinderDims, cylinderLayout } from "../src/three/parts/models/t800/spec";
import { detectStatic } from "../src/three/parts/solver/detect";
import { partitionExpectedContacts } from "../src/three/parts/solver/whitelist";
import { validateRegistry } from "../src/three/parts/registry/validate";
import type { PartHandle } from "../src/three/parts/assembler/assembler";

const registry = makeT800Registry();
const issues = validateRegistry(registry);
const errors = issues.filter((issue) => issue.level === "error");
console.log(`注册表校验：${errors.length} 错误 / ${issues.length - errors.length} 警告`);
for (const issue of issues.slice(0, 12)) console.log(`  [${issue.level}] ${issue.code} ${issue.message}`);

const model = buildModel(registry, {
  builders: t800Builders,
  instanceLayouts: makeT800Layouts(),
  warnMissingLayout: false,
});

const SUPPORT_MM = 2;
const CYCLE = 5.4;
const FRAMES = 24;

const atRest = (t: number) => {
  model.resetNodes();
  animateT800(model, t);
  model.syncInstances();
  model.root.updateMatrixWorld(true);
};

// ---- 静态 ----
atRest(0);
const staticReports = detectStatic(model, { minDepthM: 0.0005 });
const rules = registry.expectedContacts ?? [];
const staticPartition = partitionExpectedContacts(staticReports, rules);
const instanceCount = model.parts.reduce((n, p) => n + p.instances.length, 0);
console.log(`零件定义 ${registry.parts.length} / 实例 ${instanceCount}`);
console.log(
  `静态穿模报告 ${staticReports.length}（未豁免 ${staticPartition.active.length} / 已豁免 ${staticPartition.expected.length}）`,
);
for (const r of staticPartition.active.slice(0, 25)) {
  console.log(
    `  ${r.report.a} ↔ ${r.report.b}  ${r.report.depth_mm?.toFixed(2) ?? "?"}mm  ${r.report.form ?? ""}  ` +
      `@(${r.report.point.map((v) => (v * 1000).toFixed(0)).join(",")})mm  交线${(r.report.intersection_mm ?? 0).toFixed(1)}mm`,
  );
}

// ---- 屈伸扫掠 ----
const sweepReports: typeof staticReports = [];
for (let i = 0; i < FRAMES; i++) {
  atRest((i / FRAMES) * CYCLE);
  const reports = detectStatic(model, { minDepthM: 0.0005 });
  for (const r of reports) sweepReports.push(r);
}
const sweepPartition = partitionExpectedContacts(sweepReports, rules);
console.log(
  `扫掠 ${FRAMES} 帧穿模报告 ${sweepReports.length}（未豁免 ${sweepPartition.active.length} / 已豁免 ${sweepPartition.expected.length}）`,
);
const seen = new Set<string>();
for (const r of sweepPartition.active) {
  const key = `${r.report.a}|${r.report.b}`;
  if (seen.has(key)) continue;
  seen.add(key);
  console.log(
    `  ${r.report.a} ↔ ${r.report.b}  ${r.report.depth_mm?.toFixed(2) ?? "?"}mm  ${r.report.form ?? ""}  ` +
      `@(${r.report.point.map((v) => (v * 1000).toFixed(0)).join(",")})mm`,
  );
}

// ---- 悬空：AABB 支撑邻接（≤2mm 或包含）----
atRest(0);
interface Body {
  ref: string;
  handle: PartHandle;
  box: THREE.Box3;
  exempt: boolean;
}
const bodies: Body[] = [];
for (const handle of model.parts) {
  const geom = handle.geometry;
  if (!geom.boundingBox) geom.computeBoundingBox();
  const local = geom.boundingBox!;
  const m = new THREE.Matrix4();
  for (const inst of handle.instances) {
    model.instanceMatrix(handle, inst.index, m);
    const box = local.clone().applyMatrix4(m);
    bodies.push({
      ref: inst.index === 0 && handle.instances.length === 1 ? handle.partId : `${handle.partId}[${inst.index}]`,
      handle,
      box,
      exempt: (handle.def.tags ?? []).some((tag) =>
        ["fixed-base", "effect", "fx", "hotspot", "flight", "flyer", "projectile"].includes(tag),
      ),
    });
  }
}

function gapMm(a: THREE.Box3, b: THREE.Box3): number {
  const dx = Math.max(a.min.x - b.max.x, b.min.x - a.max.x, 0);
  const dy = Math.max(a.min.y - b.max.y, b.min.y - a.max.y, 0);
  const dz = Math.max(a.min.z - b.max.z, b.min.z - a.max.z, 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz) * 1000;
}

const floating: Array<{ ref: string; nearest: string; gap: number }> = [];
for (const body of bodies) {
  if (body.exempt) continue;
  let best = Infinity;
  let bestRef = "";
  for (const other of bodies) {
    if (other === body) continue;
    if (other.handle === body.handle && other.ref === body.ref) continue;
    const g = gapMm(body.box, other.box);
    if (g < best) {
      best = g;
      bestRef = other.ref;
    }
  }
  if (best > SUPPORT_MM) floating.push({ ref: body.ref, nearest: bestRef, gap: best });
}
console.log(`悬空候选（无 ≤${SUPPORT_MM}mm 支撑邻居）: ${floating.length}`);
for (const f of floating.slice(0, 40)) {
  console.log(`  ${f.ref}  最近 ${f.nearest} = ${f.gap.toFixed(1)}mm`);
  const body = bodies.find((item) => item.ref === f.ref);
  const other = bodies.find((item) => item.ref === f.nearest);
  if (body && other) {
    const fmt = (box: THREE.Box3) =>
      `x[${(box.min.x * 1000).toFixed(0)},${(box.max.x * 1000).toFixed(0)}] ` +
      `y[${(box.min.y * 1000).toFixed(0)},${(box.max.y * 1000).toFixed(0)}] ` +
      `z[${(box.min.z * 1000).toFixed(0)},${(box.max.z * 1000).toFixed(0)}]`;
    console.log(`      ${f.ref} ${fmt(body.box)}`);
    console.log(`      ${f.nearest} ${fmt(other.box)}`);
  }
}

// ---- 液压行程：逐帧核对露出杆长 / 活塞在缸内余量 / 杆端插入余量 ----
interface Audit {
  key: string;
  name: string;
  L: number;
  Lc: number;
  Lr: number;
  minSpan: number;
  maxSpan: number;
  minExposed: number;
  maxExposed: number;
  minEngagement: number;
  minTipClearance: number;
}
const audit: Audit[] = T800_HYDRAULICS.map((spec) => {
  const dims = cylinderDims(spec);
  const layout = cylinderLayout(spec);
  return {
    key: spec.key,
    name: spec.name_cn,
    L: dims.L,
    Lc: layout.barrelEnd - layout.barrelStart,
    Lr: spec.lr * dims.L,
    minSpan: Infinity,
    maxSpan: -Infinity,
    minExposed: Infinity,
    maxExposed: -Infinity,
    minEngagement: Infinity,
    minTipClearance: Infinity,
  };
});
const byKey = new Map(audit.map((a) => [a.key, a]));
for (let i = 0; i <= 96; i++) {
  atRest((i / 96) * CYCLE);
  for (const e of t800Pose().extensions) {
    const a = byKey.get(e.key);
    if (!a) continue;
    const span = e.lengthMm / 1000;
    const layout = cylinderLayout(T800_HYDRAULICS.find((s) => s.key === e.key)!);
    a.minSpan = Math.min(a.minSpan, span);
    a.maxSpan = Math.max(a.maxSpan, span);
    a.minExposed = Math.min(a.minExposed, e.exposedMm);
    a.maxExposed = Math.max(a.maxExposed, e.exposedMm);
    // 活塞中心距 A 端（缸底内壁 barrelStart .. 缸口）
    const pistonFromA = span - layout.pistonFromB;
    a.minEngagement = Math.min(a.minEngagement, (pistonFromA - layout.barrelStart) * 1000);
    a.minTipClearance = Math.min(
      a.minTipClearance,
      (span - layout.rodStart - a.Lr - layout.barrelStart) * 1000,
    );
  }
}
console.log("液压行程核算（mm）：");
for (const a of audit) {
  console.log(
    `  ${a.key.padEnd(10)} |AB|=${(a.L * 1000).toFixed(1)} 行程 ${((a.maxSpan - a.minSpan) * 1000).toFixed(1)}` +
      ` (${(a.minSpan * 1000).toFixed(1)}–${(a.maxSpan * 1000).toFixed(1)})` +
      ` 露出 ${a.minExposed.toFixed(1)}→${a.maxExposed.toFixed(1)}` +
      ` 活塞余量≥${a.minEngagement.toFixed(1)}  杆端余量≥${a.minTipClearance.toFixed(1)}`,
  );
}

// ---- 结论 ----
const unexempt = staticPartition.active.length + sweepPartition.active.length;
const hydraulicOk = audit.every(
  (a) => a.minEngagement > 5 && a.minTipClearance > 5 && a.minExposed > 5,
);
const partsOk = registry.parts.length >= 130;
console.log(
  `\n门禁：未豁免穿模 ${unexempt}（静态 ${staticPartition.active.length} + 扫掠 ${sweepPartition.active.length}）· ` +
    `悬空候选 ${floating.length} · 液压行程 ${hydraulicOk ? "PASS" : "FAIL"} · ` +
    `零件数 ${registry.parts.length} ${partsOk ? "PASS" : "FAIL"}`,
);

if (process.argv.includes("--write")) {
  const lines = [
    "# T-800 右腿 · 装配 / 悬空 / 液压行程审计",
    "",
    `- 零件定义：${registry.parts.length}，实例：${instanceCount}`,
    `- 静态穿模：${staticReports.length}；扫掠 ${FRAMES} 帧：${sweepReports.length}`,
    `- 悬空候选（无 ≤${SUPPORT_MM}mm AABB 支撑邻居）：${floating.length}`,
    "",
    "## 悬空清单（人工审）",
    "",
    "| 零件 | 最近邻居 | 间隙 |",
    "|---|---|---|",
    ...(floating.length
      ? floating.map((f) => `| \`${f.ref}\` | \`${f.nearest}\` | ${f.gap.toFixed(1)}mm |`)
      : ["| （无） | — | — |"]),
    "",
    "## 液压缸行程（几何解，非动画写死）",
    "",
    "| 缸 | 静止 \\|AB\\| | 行程 | 缸长 | 杆长 | 露出范围 | 活塞余量 | 杆端余量 |",
    "|---|---|---|---|---|---|---|---|",
    ...audit.map(
      (a) =>
        `| ${a.name} | ${(a.L * 1000).toFixed(1)} | ${((a.maxSpan - a.minSpan) * 1000).toFixed(1)} | ` +
        `${(a.Lc * 1000).toFixed(1)} | ${(a.Lr * 1000).toFixed(1)} | ` +
        `${a.minExposed.toFixed(1)}–${a.maxExposed.toFixed(1)}mm | ${a.minEngagement.toFixed(1)}mm | ${a.minTipClearance.toFixed(1)}mm |`,
    ),
    "",
    `液压行程判定：**${hydraulicOk ? "PASS" : "FAIL"}**`,
    "",
  ];
  writeFileSync("docs/qa/t800-leg-audit.md", lines.join("\n"), "utf8");
  console.log("已写 docs/qa/t800-leg-audit.md");
}

void t800Stroke;
void CYL;
