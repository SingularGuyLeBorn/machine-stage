// 诊断：t=0（待机站姿）与步态帧里，各骨骼件的世界位置
import * as THREE from "three";
import { buildModel } from "../src/three/parts/assembler/assembler";
import { makeT800Layouts, makeT800Registry, t800AllBuilders } from "../src/three/parts/models/t800/registry";
import { animateT800 } from "../src/three/parts/models/t800/motion";

const registry = makeT800Registry();
const model = buildModel(registry, {
  builders: t800AllBuilders,
  instanceLayouts: makeT800Layouts(),
  warnMissingLayout: false,
});

const WATCH = [
  "bip_head_040",
  "bip_collar_R_07",
  "bip_upperArm_R_08",
  "bip_upperArm_L_047",
  "LeftArmRoll_helper_010",
  "RightArmRoll_helper_049",
  "LeftElbow_helper_035",
  "RightElbow_helper_075",
  "bip_hand_R_016",
  "bip_hand_L_055",
  "bip_index_0_R_017",
  "bip_pelvis_02",
  "LeftUpLegRoll_084",
  "RightUpLegRoll_092",
  "bip_knee_R_079",
  "bip_knee_L_087",
  "LeftLegRoll_080",
  "RightLegRoll_088",
  "bip_foot_R_081",
  "bip_foot_L_089",
];

function dump(label: string, seconds: number, idle = false) {
  model.resetNodes();
  animateT800(model, seconds, { idle });
  model.syncInstances();
  model.root.updateMatrixWorld(true);
  const m = new THREE.Matrix4();
  console.log(`\n=== ${label} (t=${seconds}${idle ? ", idle" : ""}) ===`);
  for (const id of WATCH) {
    const h = model.getPart(`t800.mesh.${id}`);
    if (!h) {
      console.log(`${id.padEnd(26)} (缺)`);
      continue;
    }
    model.instanceMatrix(h, 0, m);
    const box = new THREE.Box3().setFromBufferAttribute(h.geometry.attributes.position).applyMatrix4(m);
    console.log(
      `${id.padEnd(26)} c=(${(box.min.x + box.max.x) / 2}, ${(box.min.y + box.max.y) / 2}, ${(box.min.z + box.max.z) / 2})` +
        `  y[${box.min.y.toFixed(3)},${box.max.y.toFixed(3)}]`,
    );
  }
}

dump("待机站姿", 0, true);
dump("步态 t=0", 0);
dump("步态 t=0.3", 0.3);
