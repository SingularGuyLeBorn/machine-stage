// 打印「手臂垂手」姿态修正后的关键坐标：
//   · 需要写进 spec.ts 的关节 pivot
//   · 需要写进 hydraulics.ts 的缸 A/B 点
import { MESH_META } from "../src/three/parts/models/t800/mesh/assets";
import {
  ARM_POSE_DEG,
  rotateAboutX,
  shoulderPivot,
} from "../src/three/parts/models/t800/mesh/pose";
import { HYDRAULICS } from "../src/three/parts/models/t800/hydraulics";

const center = (name: string): [number, number, number] => {
  const m = MESH_META.find((x) => x.n === name)!;
  return [m.b[0] + m.b[3] / 2, m.b[1] + m.b[4] / 2, m.b[2] + m.b[5] / 2];
};

console.log("=== 关节 pivot（修正后）===");
for (const name of [
  "bip_upperArm_R_08",
  "bip_upperArm_L_047",
  "LeftElbow_helper_035",
  "RightElbow_helper_075",
  "bip_hand_R_016",
  "bip_hand_L_055",
]) {
  const c = center(name);
  console.log(`${name.padEnd(26)} [${c.map((v) => v.toFixed(4)).join(", ")}]`);
}

console.log("\n=== 手臂三根缸的 A/B（修正后）===");
for (const key of ["shoulder_r", "shoulder_l", "elbow_r", "elbow_l", "wrist_r", "wrist_l"]) {
  const def = HYDRAULICS.find((h) => h.key === key)!;
  const side = def.b[2] >= 0 ? 1 : -1;
  const pivot = shoulderPivot(side);
  const deg = side > 0 ? ARM_POSE_DEG : -ARM_POSE_DEG;
  // A 在锁骨/上臂下段（手臂侧）→ 要转；B 在前臂/手（手臂侧）→ 要转
  const aArm = /collar/.test(def.parent) ? false : true;
  const a = aArm ? rotateAboutX(def.a, pivot, deg) : def.a;
  const b = rotateAboutX(def.b, pivot, deg);
  console.log(
    `${key.padEnd(11)} a: [${a.map((v) => v.toFixed(4)).join(", ")}]  b: [${b.map((v) => v.toFixed(4)).join(", ")}]` +
      `   (parent=${def.parent} child=${def.child})`,
  );
}
