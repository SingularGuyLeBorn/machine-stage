// 诊断：几何解码是否与清单一致 + 零件世界位置是否等于装配位
import * as THREE from "three";
import { MESH_META } from "../src/three/parts/models/t800/mesh/assets";
import { meshPartGeometry } from "../src/three/parts/models/t800/mesh/geometry";
import { buildModel } from "../src/three/parts/assembler/assembler";
import { makeT800Layouts, makeT800Registry, t800AllBuilders } from "../src/three/parts/models/t800/registry";
import { animateT800 } from "../src/three/parts/models/t800/motion";

// ---- 1) 几何 vs 清单 ----
console.log("=== 几何解码核对（中心应为 0，尺寸应等于清单）===");
let bad = 0;
for (const meta of MESH_META) {
  const g = meshPartGeometry(meta.n);
  g.computeBoundingBox();
  const size = g.boundingBox!.getSize(new THREE.Vector3());
  const expect = [meta.b[3], meta.b[4], meta.b[5]];
  const err = Math.max(
    Math.abs(size.x - expect[0]),
    Math.abs(size.y - expect[1]),
    Math.abs(size.z - expect[2]),
  );
  if (err > 0.002) {
    bad++;
    if (bad <= 12) {
      console.log(
        `${meta.n.padEnd(28)} 几何尺寸=(${size.x.toFixed(3)},${size.y.toFixed(3)},${size.z.toFixed(3)})` +
          ` 清单尺寸=(${expect[0].toFixed(3)},${expect[1].toFixed(3)},${expect[2].toFixed(3)}) v=${meta.v}`,
      );
    }
  }
}
console.log(`尺寸不符的部位：${bad} / ${MESH_META.length}`);

// ---- 2) 零件世界位置 vs 装配位 ----
const registry = makeT800Registry();
const model = buildModel(registry, {
  builders: t800AllBuilders,
  instanceLayouts: makeT800Layouts(),
  warnMissingLayout: false,
});
model.resetNodes();
animateT800(model, 0, { idle: true });
model.syncInstances();
model.root.updateMatrixWorld(true);

const m = new THREE.Matrix4();
const local = new THREE.Matrix4();
console.log("\n=== 零件在所属节点局部系里的位置 vs 声明装配位（差 > 5mm 算错位）===");
let off = 0;
for (const def of registry.parts) {
  const h = model.getPart(def.id);
  if (!h) continue;
  // 节点局部矩阵（相对节点的装配偏移）—— 节点自身转动不影响这一项
  const node = def.node ? model.getNode(def.node) : null;
  const at = (def.mate as { position?: number[] } | undefined)?.position ?? [0, 0, 0];
  model.instanceMatrix(h, 0, m);
  if (node) {
    const inv = new THREE.Matrix4().copy(node.matrixWorld).invert();
    local.multiplyMatrices(inv, m);
  } else {
    local.copy(m);
  }
  const c = new THREE.Vector3().setFromMatrixPosition(local);
  const want = new THREE.Vector3(at[0], at[1], at[2]);
  const d = c.distanceTo(want);
  if (d > 0.005) {
    off++;
    if (off <= 15) {
      console.log(
        `${def.id.padEnd(42)} 局部实际=(${c.x.toFixed(3)},${c.y.toFixed(3)},${c.z.toFixed(3)})` +
          ` 声明=(${want.x.toFixed(3)},${want.y.toFixed(3)},${want.z.toFixed(3)}) 差 ${(d * 1000).toFixed(1)}mm`,
      );
    }
  }
}
console.log(`错位的零件：${off} / ${registry.parts.length}`);
