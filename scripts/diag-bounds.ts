// 诊断：装配 tiger 发动机，输出整机包围盒 + 找离群/漂浮零件（监工脚本，持续维护）
// 用法：npx tsx scripts/diag-bounds.ts
// 判定：
//   离群   —— 零件中心距整机中心 > 1.5m
//   超大   —— 零件对角线 > 2m
//   漂浮   —— 实例盒到「其余所有实例盒」的最小距离 > 8mm（逐实例判定，能抓到叠错位的实例）
import * as THREE from "three";
import { makeEngineRegistry, makeEngineLayouts } from "../src/three/parts/models/tiger/engine/registry";
import { tigerKitBuilders } from "../src/three/parts/models/tiger/engine/kits";
import { buildModel } from "../src/three/parts/assembler/assembler";

const registry = makeEngineRegistry();
const model = buildModel(registry, {
  builders: tigerKitBuilders,
  instanceLayouts: makeEngineLayouts(),
  warnMissingLayout: false,
});

/** 一个零件的世界包围盒（实例级展开；矩阵列主序手算，不依赖 Box3 实例）。 */
interface PartBox {
  name: string;
  min: [number, number, number];
  max: [number, number, number];
}

const mul = (m: ArrayLike<number>, p: [number, number, number]): [number, number, number] => [
  m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
  m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
  m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
];

model.root.updateMatrixWorld(true);
const partBoxes: PartBox[] = [];
/** 逐实例盒（单实例零件就是零件盒本身）：漂浮检测的判定单位。 */
const floatBoxes: PartBox[] = [];
model.root.traverse((o) => {
  const mesh = o as THREE.Mesh & { count?: number };
  if (!mesh.isMesh && !(mesh as THREE.InstancedMesh).isInstancedMesh) return;
  if (!mesh.geometry) return;
  if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
  const bb = mesh.geometry.boundingBox!;
  const corners: Array<[number, number, number]> = [];
  for (const x of [bb.min.x, bb.max.x])
    for (const y of [bb.min.y, bb.max.y]) for (const z of [bb.min.z, bb.max.z]) corners.push([x, y, z]);
  const world = mesh.matrixWorld.elements;
  const instanced = mesh as THREE.InstancedMesh;
  const count = instanced.isInstancedMesh ? instanced.count : 1;
  const instArr = instanced.isInstancedMesh ? instanced.instanceMatrix.array : null;
  const name = mesh.name || "(anon)";
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < count; i++) {
    const inst = instArr ? Array.from(instArr.slice(i * 16, i * 16 + 16)) : null;
    const imin: [number, number, number] = [Infinity, Infinity, Infinity];
    const imax: [number, number, number] = [-Infinity, -Infinity, -Infinity];
    for (const c of corners) {
      const p = mul(world, inst ? mul(inst, c) : c);
      for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k], p[k]);
        max[k] = Math.max(max[k], p[k]);
        imin[k] = Math.min(imin[k], p[k]);
        imax[k] = Math.max(imax[k], p[k]);
      }
    }
    if (count > 1) floatBoxes.push({ name: `${name}[${i}]`, min: imin, max: imax });
  }
  if (count === 1) floatBoxes.push({ name, min, max });
  partBoxes.push({ name, min, max });
});

const total = new THREE.Box3();
for (const b of partBoxes) {
  total.expandByPoint(new THREE.Vector3(...b.min));
  total.expandByPoint(new THREE.Vector3(...b.max));
}
const center = total.getCenter(new THREE.Vector3());
const size = total.getSize(new THREE.Vector3());
console.log(
  "WHOLE min=",
  total.min.toArray().map((v) => v.toFixed(3)),
);
console.log(
  "WHOLE max=",
  total.max.toArray().map((v) => v.toFixed(3)),
);
console.log(
  "WHOLE center=",
  center.toArray().map((v) => v.toFixed(3)),
  " size=",
  size.toArray().map((v) => v.toFixed(3)),
);

const perPart = partBoxes.map((b) => {
  const c = [0, 1, 2].map((k) => (b.min[k] + b.max[k]) / 2) as [number, number, number];
  const s = [0, 1, 2].map((k) => b.max[k] - b.min[k]);
  return {
    name: b.name,
    c,
    size: Math.hypot(...s),
    dist: Math.hypot(c[0] - center.x, c[1] - center.y, c[2] - center.z),
  };
});

// 极值件：整机包围盒由谁撑出来（低位/前位最可疑，多半是错位零件）
const lowest = [...partBoxes].sort((a, b) => a.min[1] - b.min[1]).slice(0, 5);
const frontmost = [...partBoxes].sort((a, b) => b.max[0] - a.max[0]).slice(0, 5);
console.log("--- 最低 5 件:");
for (const b of lowest) console.log(`  ${b.name}  minY=${b.min[1].toFixed(3)}`);
console.log("--- 最前（+X）5 件:");
for (const b of frontmost) console.log(`  ${b.name}  maxX=${b.max[0].toFixed(3)}`);

// 离群零件：中心距原点 > 1.5m（发动机本身约 1.3m）
const outliers = perPart.filter((p) => p.dist > 1.5).sort((a, b) => b.dist - a.dist);
console.log("--- 离群零件（中心距 > 1.5m）:", outliers.length);
for (const p of outliers.slice(0, 15)) {
  console.log(`  ${p.name}  center=(${p.c.map((v) => v.toFixed(2)).join(",")})  dist=${p.dist.toFixed(2)}`);
}
// 超大零件：尺寸 > 2m（异常拉伸也会撑爆包围盒）
const giants = perPart.filter((p) => p.size > 2).sort((a, b) => b.size - a.size);
console.log("--- 超大零件（对角线 > 2m）:", giants.length);
for (const p of giants.slice(0, 15)) {
  console.log(`  ${p.name}  size=${p.size.toFixed(2)}`);
}

// 漂浮实例：与「最近的其它实例」也隔着空隙（阈值 8mm）
const gap = (a: PartBox, b: PartBox): number => {
  let s = 0;
  for (let k = 0; k < 3; k++) {
    const g = Math.max(b.min[k] - a.max[k], a.min[k] - b.max[k]);
    if (g > 0) s += g * g;
  }
  return Math.sqrt(s);
};
const floats: Array<{ name: string; gap_mm: number; nearest: string }> = [];
for (let i = 0; i < floatBoxes.length; i++) {
  let best = Infinity;
  let nearest = "";
  for (let j = 0; j < floatBoxes.length; j++) {
    if (i === j) continue;
    const d = gap(floatBoxes[i], floatBoxes[j]);
    if (d < best) {
      best = d;
      nearest = floatBoxes[j].name;
    }
  }
  if (best > 0.008) floats.push({ name: floatBoxes[i].name, gap_mm: +(best * 1000).toFixed(1), nearest });
}
floats.sort((a, b) => b.gap_mm - a.gap_mm);
console.log("--- 漂浮实例（与最近实例仍有 > 8mm 空隙）:", floats.length);
for (const f of floats.slice(0, 20)) {
  console.log(`  ${f.name}  空隙=${f.gap_mm}mm  最近=${f.nearest}`);
}

if (outliers.length || giants.length || floats.length) {
  process.exitCode = 1; // 供 CI/监工脚本判定
}
