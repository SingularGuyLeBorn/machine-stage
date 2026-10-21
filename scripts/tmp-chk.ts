import * as THREE from "three";
import { buildModel } from "../src/three/parts/assembler/assembler";
import { makeT800Layouts, makeT800Registry, t800AllBuilders } from "../src/three/parts/models/t800/registry";
import { animateT800 } from "../src/three/parts/models/t800/motion";
const reg = makeT800Registry();
const model = buildModel(reg, { builders: t800AllBuilders, instanceLayouts: makeT800Layouts(), warnMissingLayout: false });
animateT800(model, 0);
model.root.updateMatrixWorld(true);
const m = new THREE.Matrix4();
for (const id of ["t800.mesh.bip_pelvis_02", "t800.mesh.bip_head_040", "t800.mesh.bip_hand_r_016", "t800.mesh.bip_foot_r_081", "t800.mesh.bip_thigh"]) {
  const h = model.getPart(id);
  if (!h) { console.log(id, "missing"); continue; }
  model.instanceMatrix(h, 0, m);
  const b = new THREE.Box3().setFromBufferAttribute(h.geometry.attributes.position).applyMatrix4(m);
  console.log(id, "x", b.min.x.toFixed(3), b.max.x.toFixed(3), "y", b.min.y.toFixed(3), b.max.y.toFixed(3), "z", b.min.z.toFixed(3), b.max.z.toFixed(3));
}
