/* eslint-disable */
// ============================================================================
// t800/mesh/classes —— 76 个蒙皮部位的分类表
//
// 真实网格的骨骼名（Blender 原名）→ 装配分组 / 动画父链 / 材质。
//
// 注意：源模型里 **helper 骨的左右前缀是反的**（"LeftArmRoll_helper_010" 实际在
// +Z 侧 = 右臂，"RightArmRoll_helper_049" 在 -Z 侧 = 左臂）。下表按**几何实测
// 位置**确定父子关系，不看名字前缀。
//
// 父链即动画层级：
//   骨盆(根) → 腰椎 → 胸椎 → 胸廓 → 颈 → 头(+下颌/眼)；
//   骨盆 → 髋 → 大腿 → 膝标记 → 胫段 → 小腿 → 足 → 趾；
//   胸廓 → 锁骨 → 上臂 → 上臂下段 → 肘标记 → 前臂三段 → 手 → 五指(各三节)。
// ============================================================================

export type JointAsm =
  | "pelvis"
  | "spine"
  | "neck"
  | "head"
  | "shoulder"
  | "arm"
  | "hand"
  | "leg"
  | "foot";

export type JointMat = "chrome" | "mirror" | "gunmetal" | "dark_chrome" | "servo" | "rubber";

export interface JointClass {
  /** 装配分组 */
  asm: JointAsm;
  /** 动画父部位（null = 根） */
  parent: string | null;
  /** 材质 */
  mat: JointMat;
}

const C = (asm: JointAsm, parent: string | null, mat: JointMat = "chrome"): JointClass => ({
  asm,
  parent,
  mat,
});

/** 骨骼原名 → 分类（76 个部位全覆盖）。 */
export const JOINT_CLASS: Record<string, JointClass> = {
  // ---- 躯干中轴 ----
  bip_pelvis_02: C("pelvis", null),
  bip_spine_1_04: C("spine", "bip_pelvis_02"),
  bip_spine_2_05: C("spine", "bip_spine_1_04"),
  bip_spine_3_06: C("spine", "bip_spine_2_05"),
  bip_neck_039: C("neck", "bip_spine_3_06"),
  "9_091": C("neck", "bip_neck_039"),
  // ---- 头 ----
  bip_head_040: C("head", "bip_neck_039"),
  Bip_jaw_041: C("head", "bip_head_040", "gunmetal"),
  Bip_Eyeball_R_045: C("head", "bip_head_040", "servo"),
  Bip_Eyeball_L_043: C("head", "bip_head_040", "servo"),
  // 眼部"镜片"骨的左右前缀同样是反的：按 z 坐标配对
  EXT_LeftEyeCine_02_046: C("head", "Bip_Eyeball_R_045", "servo"),
  EXT_RightEyeCine_02_044: C("head", "Bip_Eyeball_L_043", "servo"),
  // ---- 右肩带 / 右臂（helper 骨前缀是 "Left"）----
  bip_collar_R_07: C("shoulder", "bip_spine_3_06"),
  bip_upperArm_R_08: C("arm", "bip_collar_R_07"),
  LeftArmRoll_helper_010: C("arm", "bip_upperArm_R_08"),
  LeftArmBicep_helper_011: C("arm", "bip_upperArm_R_08", "dark_chrome"),
  LeftElbow_helper_035: C("arm", "LeftArmRoll_helper_010", "dark_chrome"),
  LeftUpperForeArm_helper_037: C("arm", "LeftElbow_helper_035"),
  LeftForeArm_helper_014: C("arm", "LeftUpperForeArm_helper_037"),
  LeftLowerForeArm_helper_015: C("arm", "LeftForeArm_helper_014"),
  bip_hand_R_016: C("hand", "LeftLowerForeArm_helper_015"),
  LeftInHandPinky_028: C("hand", "bip_hand_R_016"),
  // ---- 左肩带 / 左臂（helper 骨前缀是 "Right"）----
  bip_collar_L_042: C("shoulder", "bip_spine_3_06"),
  bip_upperArm_L_047: C("arm", "bip_collar_L_042"),
  RightArmRoll_helper_049: C("arm", "bip_upperArm_L_047"),
  RightArmBicep_helper_050: C("arm", "bip_upperArm_L_047", "dark_chrome"),
  RightElbow_helper_075: C("arm", "RightArmRoll_helper_049", "dark_chrome"),
  RightUpperForeArm_helper_077: C("arm", "RightElbow_helper_075"),
  RightForeArm_helper_053: C("arm", "RightUpperForeArm_helper_077"),
  RightLowerForeArm_helper_054: C("arm", "RightForeArm_helper_053"),
  bip_hand_L_055: C("hand", "RightLowerForeArm_helper_054"),
  RightInHandPinky_067: C("hand", "bip_hand_L_055"),
  // ---- 右手指（各三节）----
  bip_thumb_0_R_00: C("hand", "bip_hand_R_016"),
  bip_thumb_1_R_032: C("hand", "bip_thumb_0_R_00"),
  bip_thumb_2_R_033: C("hand", "bip_thumb_1_R_032"),
  bip_index_0_R_017: C("hand", "bip_hand_R_016"),
  bip_index_1_R_018: C("hand", "bip_index_0_R_017"),
  bip_index_2_R_019: C("hand", "bip_index_1_R_018"),
  bip_middle_0_R_020: C("hand", "bip_hand_R_016"),
  bip_middle_1_R_021: C("hand", "bip_middle_0_R_020"),
  bip_middle_2_R_022: C("hand", "bip_middle_1_R_021"),
  bip_ring_0_R_025: C("hand", "bip_hand_R_016"),
  bip_ring_1_R_026: C("hand", "bip_ring_0_R_025"),
  bip_ring_2_R_027: C("hand", "bip_ring_1_R_026"),
  bip_pinky_0_R_029: C("hand", "bip_hand_R_016"),
  bip_pinky_1_R_030: C("hand", "bip_pinky_0_R_029"),
  bip_pinky_2_R_031: C("hand", "bip_pinky_1_R_030"),
  // ---- 左手指 ----
  bip_thumb_0_L_071: C("hand", "bip_hand_L_055"),
  bip_thumb_1_L_072: C("hand", "bip_thumb_0_L_071"),
  bip_thumb_2_L_073: C("hand", "bip_thumb_1_L_072"),
  bip_index_0_L_056: C("hand", "bip_hand_L_055"),
  bip_index_1_L_057: C("hand", "bip_index_0_L_056"),
  bip_index_2_L_058: C("hand", "bip_index_1_L_057"),
  bip_middle_0_L_059: C("hand", "bip_hand_L_055"),
  bip_middle_1_L_060: C("hand", "bip_middle_0_L_059"),
  bip_middle_2_L_061: C("hand", "bip_middle_1_L_060"),
  bip_ring_0_L_064: C("hand", "bip_hand_L_055"),
  bip_ring_1_L_065: C("hand", "bip_ring_0_L_064"),
  bip_ring_2_L_066: C("hand", "bip_ring_1_L_065"),
  bip_pinky_0_L_068: C("hand", "bip_hand_L_055"),
  bip_pinky_1_L_069: C("hand", "bip_pinky_0_L_068"),
  bip_pinky_2_L_070: C("hand", "bip_pinky_1_L_069"),
  // ---- 右腿（helper 骨前缀是 "Left"）----
  bip_hip_R_078: C("leg", "bip_pelvis_02"),
  LeftUpLegRoll_084: C("leg", "bip_hip_R_078"),
  LeftKnee_helper_086: C("leg", "LeftUpLegRoll_084", "dark_chrome"),
  bip_knee_R_079: C("leg", "LeftKnee_helper_086"),
  LeftLegRoll_080: C("leg", "bip_knee_R_079"),
  bip_foot_R_081: C("foot", "LeftLegRoll_080"),
  bip_toe_R_085: C("foot", "bip_foot_R_081"),
  // ---- 左腿（helper 骨前缀是 "Right"）----
  bip_hip_L_082: C("leg", "bip_pelvis_02"),
  RightUpLegRoll_092: C("leg", "bip_hip_L_082"),
  RightKnee_helper_094: C("leg", "RightUpLegRoll_092", "dark_chrome"),
  bip_knee_L_087: C("leg", "RightKnee_helper_094"),
  RightLegRoll_088: C("leg", "bip_knee_L_087"),
  bip_foot_L_089: C("foot", "RightLegRoll_088"),
  bip_toe_L_093: C("foot", "bip_foot_L_089"),
};

/** 分类表里没有的部位（兜底）：按名字猜分组。 */
export function classifyJoint(name: string): JointClass {
  const hit = JOINT_CLASS[name];
  if (hit) return hit;
  if (/thumb|index|middle|ring|pinky|hand/i.test(name)) return C("hand", null);
  if (/forearm|elbow|bicep|arm/i.test(name)) return C("arm", null);
  if (/knee/i.test(name)) return C("leg", null);
  if (/roll|leg|hip/i.test(name)) return C("leg", null);
  if (/foot|toe/i.test(name)) return C("foot", null);
  if (/collar|shoulder/i.test(name)) return C("shoulder", null);
  if (/head|jaw|eye/i.test(name)) return C("head", null);
  if (/neck/i.test(name)) return C("neck", null);
  return C("spine", null);
}
