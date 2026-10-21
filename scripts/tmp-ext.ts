import { MESH_META } from "../src/three/parts/models/t800/mesh/assets";
const want = ["bip_upperArm_R_08","bip_upperArm_L_047","bip_collar_R_07","bip_collar_L_042","bip_foot_R_081","bip_foot_L_089","bip_hand_R_016","bip_hand_L_055","LeftLowerForeArm_helper_015","RightLowerForeArm_helper_054","bip_hip_R_078","bip_hip_L_082","bip_knee_R_079","bip_knee_L_087","LeftUpLegRoll_084","RightUpLegRoll_092","LeftLegRoll_080","RightLegRoll_088","LeftArmRoll_helper_010","RightArmRoll_helper_049","LeftUpperForeArm_helper_037","RightUpperForeArm_helper_077","LeftForeArm_helper_014","RightForeArm_helper_053","bip_spine_1_04","bip_spine_2_05","bip_spine_3_06","bip_pelvis_02","bip_neck_039","bip_head_040","bip_toe_R_085","bip_toe_L_093","LeftKnee_helper_086","RightKnee_helper_094","LeftElbow_helper_035","RightElbow_helper_075"];
for (const m of MESH_META) {
  if (!want.includes(m.n)) continue;
  const c = [m.b[0]+m.b[3]/2, m.b[1]+m.b[4]/2, m.b[2]+m.b[5]/2];
  const lo = [m.b[0], m.b[1], m.b[2]];
  const hi = [m.b[0]+m.b[3], m.b[1]+m.b[4], m.b[2]+m.b[5]];
  console.log(m.n.padEnd(28), "c=(" + c.map((v)=>v.toFixed(3)).join(",") + ")", "min=(" + lo.map((v)=>v.toFixed(3)).join(",") + ")", "max=(" + hi.map((v)=>v.toFixed(3)).join(",") + ")");
}
