// 局部调试：某个零件对的几何关系（打印包围盒 / 内外判定）
import * as THREE from "three";
import { buildModel } from "../src/three/parts/assembler/assembler";
import { getBVH } from "../src/three/parts/solver/detect";
import { makeT800Layouts, makeT800Registry, t800Builders } from "../src/three/parts/models/t800/registry";

const registry = makeT800Registry();
const model = buildModel(registry, {
  builders: t800Builders,
  instanceLayouts: makeT800Layouts(),
  warnMissingLayout: false,
});
model.resetNodes();
model.root.updateMatrixWorld(true);

const RAY_DIRS = [
  new THREE.Vector3(0.5773, 0.5774, 0.5773),
  new THREE.Vector3(-0.3015, 0.7745, 0.5547),
  new THREE.Vector3(0.1231, -0.6002, 0.7902),
].map((d) => d.normalize());

function insideSolid(point: THREE.Vector3, matrix: THREE.Matrix4, geometry: THREE.BufferGeometry): boolean {
  const bvh = getBVH(geometry);
  const local = point.clone().applyMatrix4(new THREE.Matrix4().copy(matrix).invert());
  let votes = 0;
  let tested = 0;
  for (const dir of RAY_DIRS) {
    const ray = new THREE.Ray(local, dir);
    const hits = bvh.raycast(ray, THREE.DoubleSide);
    let onSurface = false;
    for (const hit of hits) {
      if (hit.distance < 1e-6) {
        onSurface = true;
        break;
      }
    }
    if (onSurface) continue;
    tested++;
    if (hits.length % 2 === 1) votes++;
  }
  return tested > 0 && votes * 2 > tested;
}

function worldBox(handle: { geometry: THREE.BufferGeometry; instances: Array<{ index: number }> }, index: number) {
  const box = new THREE.Box3();
  if (!handle.geometry.boundingBox) handle.geometry.computeBoundingBox();
  const m = new THREE.Matrix4();
  model.instanceMatrix(handle, index, m);
  box.copy(handle.geometry.boundingBox!).applyMatrix4(m);
  return box;
}

const pairs: Array<[string, number, string, number, THREE.Vector3]> = [
  ["t800.thigh.femur", 0, "t800.fasteners.stud", 1, new THREE.Vector3(0.031, 1.09, 0.05)],
  ["t800.knee.disc", 0, "t800.knee.boot", 0, new THREE.Vector3(0, 0.685, 0)],
];

// 管腔内外判定：管腔中心必须在实体外（孔），骨壁内必须在实体内
// 侧护甲与骨面：沿 +Z 射线找骨面位置
const tibia = model.getPart("t800.shin.tibia")!;
const tibiaMatrix = new THREE.Matrix4();
model.instanceMatrix(tibia, 0, tibiaMatrix);
const tibiaBVH = getBVH(tibia.geometry);
for (const x of [0, 0.017, 0.03, 0.04]) {
  const origin = new THREE.Vector3(x, 0.293, 0.2);
  const ray = new THREE.Ray(origin, new THREE.Vector3(0, 0, -1));
  const hit = tibiaBVH.raycastFirst(ray, THREE.DoubleSide);
  console.log(`  胫骨面 x=${(x * 1000).toFixed(0)}mm → z=${hit ? (hit.point.z * 1000).toFixed(2) : "—"}mm`);
}
const armor = model.getPart("t800.shin.armor_side")!;
const armorMatrix = new THREE.Matrix4();
model.instanceMatrix(armor, 0, armorMatrix);
if (!armor.geometry.boundingBox) armor.geometry.computeBoundingBox();
const armorBox = armor.geometry.boundingBox!.clone().applyMatrix4(armorMatrix);
console.log(
  `  侧护甲[0] 包围盒 z[${(armorBox.min.z * 1000).toFixed(2)},${(armorBox.max.z * 1000).toFixed(2)}]mm` +
    ` x[${(armorBox.min.x * 1000).toFixed(0)},${(armorBox.max.x * 1000).toFixed(0)}]mm`,
);

// 叉耳与衬套：沿 X 射线找叉耳孔壁
const socket = model.getPart("t800.knee.socket")!;
const socketMatrix = new THREE.Matrix4();
model.instanceMatrix(socket, 0, socketMatrix);
const socketBVH = getBVH(socket.geometry);
const ray2 = new THREE.Ray(new THREE.Vector3(0.06, 0.72, 0.04), new THREE.Vector3(-1, 0, 0));
const hits2 = socketBVH.raycast(ray2, THREE.DoubleSide);
console.log(`  膝叉耳沿 -X 射线命中 ${hits2.length} 处:`);
for (const hit of hits2.slice(0, 6)) {
  console.log(`    x=${(hit.point.x * 1000).toFixed(2)}mm dist=${(hit.distance * 1000).toFixed(2)}mm`);
}
const bush = model.getPart("t800.knee.bushings")!;
const bushMatrix = new THREE.Matrix4();
model.instanceMatrix(bush, 0, bushMatrix);
if (!bush.geometry.boundingBox) bush.geometry.computeBoundingBox();
const bushBox = bush.geometry.boundingBox!.clone().applyMatrix4(bushMatrix);
console.log(
  `  膝衬套[0] 包围盒 x[${(bushBox.min.x * 1000).toFixed(2)},${(bushBox.max.x * 1000).toFixed(2)}]mm` +
    ` z[${(bushBox.min.z * 1000).toFixed(2)},${(bushBox.max.z * 1000).toFixed(2)}]mm`,
);

for (const [aId, aIdx, bId, bIdx, probe] of pairs) {
  const a = model.getPart(aId)!;
  const b = model.getPart(bId)!;
  console.log(`\n=== ${aId} vs ${bId}[${bIdx}] ===`);
  const boxA = worldBox(a, aIdx);
  const boxB = worldBox(b, bIdx);
  const fmt = (box: THREE.Box3) =>
    `x[${(box.min.x * 1000).toFixed(0)},${(box.max.x * 1000).toFixed(0)}] ` +
    `y[${(box.min.y * 1000).toFixed(0)},${(box.max.y * 1000).toFixed(0)}] ` +
    `z[${(box.min.z * 1000).toFixed(0)},${(box.max.z * 1000).toFixed(0)}]`;
  console.log(`  ${aId}: ${fmt(boxA)}`);
  console.log(`  ${bId}: ${fmt(boxB)}`);
  const mA = new THREE.Matrix4();
  model.instanceMatrix(a, aIdx, mA);
  const mB = new THREE.Matrix4();
  model.instanceMatrix(b, bIdx, mB);
  console.log(`  探针 ${probe.toArray().map((v) => (v * 1000).toFixed(0)).join(",")}mm`);
  console.log(`    在 ${aId} 内? ${insideSolid(probe, mA, a.geometry)}`);
  console.log(`    在 ${bId} 内? ${insideSolid(probe, mB, b.geometry)}`);
}

// 骨段局部坐标里的凸台包围盒
const femur = model.getPart("t800.thigh.femur")!;
if (!femur.geometry.boundingBox) femur.geometry.computeBoundingBox();
console.log("\nfemur local bbox:", femur.geometry.boundingBox!.min.toArray(), femur.geometry.boundingBox!.max.toArray());
