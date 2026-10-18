// 诊断：装配 tiger 发动机，输出整机包围盒 + 找出离群零件（监工临时文件）
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

const total = new THREE.Box3();
const perPart: { name: string; c: THREE.Vector3; size: number; dist: number }[] = [];

model.root.traverse((o) => {
  const mesh = o as THREE.Mesh;
  if (!mesh.isMesh || !mesh.geometry) return;
  mesh.geometry.computeBoundingBox();
  const box = mesh.geometry.boundingBox!.clone();
  box.applyMatrix4(mesh.matrixWorld);
  total.union(box);
  const c = box.getCenter(new THREE.Vector3());
  const s = box.getSize(new THREE.Vector3()).length();
  perPart.push({ name: mesh.name || "(anon)", c, size: s, dist: c.length() });
});

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

// 离群零件：中心距原点 > 1.5m（发动机本身约 1.3m）
const outliers = perPart.filter((p) => p.dist > 1.5).sort((a, b) => b.dist - a.dist);
console.log("--- 离群零件（中心距 > 1.5m）:", outliers.length);
for (const p of outliers.slice(0, 15)) {
  console.log(
    `${p.name}  center=(${p.c.x.toFixed(2)},${p.c.y.toFixed(2)},${p.c.z.toFixed(2)})  dist=${p.dist.toFixed(2)}  size=${p.size.toFixed(2)}`,
  );
}
// 超大零件：尺寸 > 2m（异常拉伸也会撑爆包围盒）
const giants = perPart.filter((p) => p.size > 2).sort((a, b) => b.size - a.size);
console.log("--- 超大零件（对角线 > 2m）:", giants.length);
for (const p of giants.slice(0, 15)) {
  console.log(
    `${p.name}  size=${p.size.toFixed(2)}  center=(${p.c.x.toFixed(2)},${p.c.y.toFixed(2)},${p.c.z.toFixed(2)})`,
  );
}
