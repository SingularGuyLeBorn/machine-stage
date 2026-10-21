// ============================================================================
// t800/names —— 标准化零件名称表
//
// 零件名用**正式机械 / 解剖术语**（中英文），不用过程性描述。
// 命名规范：`t800.<系统>.<零件>_<侧别>`（三段，符合框架的 part id 规则）。
//
// 源网格的 helper 骨左右前缀是反的（Left* 在 +Z 侧），
// 本表按**几何实测侧别**命名，名字和模型里的左右永远一致。
// ============================================================================

/** 零件名（中文 / 英文）。 */
export interface PartName {
  cn: string;
  en: string;
}

/** 骨骼原名 → 标准零件名 + id 词根。 */
export interface BoneName extends PartName {
  /** id 的第 2 段：系统/部位分组 */
  system:
    | "pelvis"
    | "spine"
    | "neck"
    | "head"
    | "shoulder"
    | "arm"
    | "hand"
    | "leg"
    | "foot";
  /** id 的第 3 段：零件代号（含侧别） */
  slug: string;
}

/** 五指的标准名（近节 / 中节 / 远节）。 */
const FINGER_NAMES: Record<string, { cn: string; en: string }> = {
  thumb: { cn: "拇指", en: "Thumb" },
  index: { cn: "食指", en: "Index Finger" },
  middle: { cn: "中指", en: "Middle Finger" },
  ring: { cn: "无名指", en: "Ring Finger" },
  pinky: { cn: "小指", en: "Little Finger" },
};

/** 指节的标准名。 */
const PHALANX_NAMES: Record<number, { cn: string; en: string }> = {
  0: { cn: "近节", en: "Proximal Phalanx" },
  1: { cn: "中节", en: "Intermediate Phalanx" },
  2: { cn: "远节", en: "Distal Phalanx" },
};

const N = (system: BoneName["system"], slug: string, cn: string, en: string): BoneName => ({
  system,
  slug,
  cn,
  en,
});

/** 76 个蒙皮部位 → 标准名。 */
export const BONE_NAMES: Record<string, BoneName> = {
  // ---- 躯干中轴 ----
  bip_pelvis_02: N("pelvis", "pelvis", "骨盆", "Pelvis"),
  bip_spine_1_04: N("spine", "vertebra_l1", "腰椎 L1 椎体", "Lumbar Vertebra L1"),
  bip_spine_2_05: N("spine", "vertebra_t1", "胸椎 T1 椎体", "Thoracic Vertebra T1"),
  bip_spine_3_06: N("spine", "vertebra_t3", "胸椎 T3 椎体与胸廓", "Thoracic Vertebra T3 & Thoracic Cage"),
  "9_091": N("neck", "throat_assembly", "喉部组件", "Throat Assembly"),
  bip_neck_039: N("neck", "cervical_column", "颈椎柱", "Cervical Column"),
  // ---- 头部 ----
  bip_head_040: N("head", "cranium", "颅骨", "Cranium"),
  Bip_jaw_041: N("head", "mandible", "下颌骨", "Mandible"),
  Bip_Eyeball_R_045: N("head", "eyeball_r", "右眼球", "Right Eyeball"),
  Bip_Eyeball_L_043: N("head", "eyeball_l", "左眼球", "Left Eyeball"),
  EXT_LeftEyeCine_02_046: N("head", "eye_lens_r", "右眼光学镜片", "Right Eye Lens"),
  EXT_RightEyeCine_02_044: N("head", "eye_lens_l", "左眼光学镜片", "Left Eye Lens"),
  // ---- 右肩带 / 右臂 ----
  bip_collar_R_07: N("shoulder", "clavicle_r", "右锁骨", "Right Clavicle"),
  bip_upperArm_R_08: N("arm", "humerus_r", "右肱骨", "Right Humerus"),
  LeftArmRoll_helper_010: N("arm", "humerus_distal_r", "右肱骨下段", "Right Distal Humerus"),
  LeftArmBicep_helper_011: N("arm", "biceps_actuator_r", "右肱二头肌缸", "Right Biceps Actuator"),
  LeftElbow_helper_035: N("arm", "elbow_pin_r", "右肘关节轴销", "Right Elbow Pivot Pin"),
  LeftUpperForeArm_helper_037: N("arm", "radius_proximal_r", "右桡骨近段", "Right Proximal Radius"),
  LeftForeArm_helper_014: N("arm", "radius_r", "右桡骨", "Right Radius"),
  LeftLowerForeArm_helper_015: N("arm", "radius_distal_r", "右桡骨远段", "Right Distal Radius"),
  bip_hand_R_016: N("hand", "hand_r", "右手掌骨架", "Right Hand Frame"),
  LeftInHandPinky_028: N("hand", "hypothenar_r", "右手小指侧掌板", "Right Hypothenar Plate"),
  // ---- 左肩带 / 左臂 ----
  bip_collar_L_042: N("shoulder", "clavicle_l", "左锁骨", "Left Clavicle"),
  bip_upperArm_L_047: N("arm", "humerus_l", "左肱骨", "Left Humerus"),
  RightArmRoll_helper_049: N("arm", "humerus_distal_l", "左肱骨下段", "Left Distal Humerus"),
  RightArmBicep_helper_050: N("arm", "biceps_actuator_l", "左肱二头肌缸", "Left Biceps Actuator"),
  RightElbow_helper_075: N("arm", "elbow_pin_l", "左肘关节轴销", "Left Elbow Pivot Pin"),
  RightUpperForeArm_helper_077: N("arm", "radius_proximal_l", "左桡骨近段", "Left Proximal Radius"),
  RightForeArm_helper_053: N("arm", "radius_l", "左桡骨", "Left Radius"),
  RightLowerForeArm_helper_054: N("arm", "radius_distal_l", "左桡骨远段", "Left Distal Radius"),
  bip_hand_L_055: N("hand", "hand_l", "左手掌骨架", "Left Hand Frame"),
  RightInHandPinky_067: N("hand", "hypothenar_l", "左手小指侧掌板", "Left Hypothenar Plate"),
  // ---- 右腿 ----
  bip_hip_R_078: N("leg", "hip_joint_r", "右髋关节", "Right Hip Joint"),
  LeftUpLegRoll_084: N("leg", "femur_r", "右股骨骨架", "Right Femur Frame"),
  LeftKnee_helper_086: N("leg", "knee_pin_r", "右膝关节轴销", "Right Knee Pivot Pin"),
  bip_knee_R_079: N("leg", "knee_joint_r", "右膝关节", "Right Knee Joint"),
  LeftLegRoll_080: N("leg", "tibia_r", "右胫骨骨架", "Right Tibia Frame"),
  bip_foot_R_081: N("foot", "foot_r", "右足骨架", "Right Foot Frame"),
  bip_toe_R_085: N("foot", "toe_r", "右趾骨", "Right Toe Bones"),
  // ---- 左腿 ----
  bip_hip_L_082: N("leg", "hip_joint_l", "左髋关节", "Left Hip Joint"),
  RightUpLegRoll_092: N("leg", "femur_l", "左股骨骨架", "Left Femur Frame"),
  RightKnee_helper_094: N("leg", "knee_pin_l", "左膝关节轴销", "Left Knee Pivot Pin"),
  bip_knee_L_087: N("leg", "knee_joint_l", "左膝关节", "Left Knee Joint"),
  RightLegRoll_088: N("leg", "tibia_l", "左胫骨骨架", "Left Tibia Frame"),
  bip_foot_L_089: N("foot", "foot_l", "左足骨架", "Left Foot Frame"),
  bip_toe_L_093: N("foot", "toe_l", "左趾骨", "Left Toe Bones"),
};

// ---- 五指（各三节，左右各 30 件）----
// 指骨编号不规则（拇指尤其：右手 00/032/033，左手 071/072/073），
// 所以按名字模式在**部位清单**里找，而不是按编号推算。
export function registerFingerNames(boneNames: readonly string[]): void {
  const fingerKeys = ["thumb", "index", "middle", "ring", "pinky"] as const;
  for (const finger of fingerKeys) {
    const names = FINGER_NAMES[finger];
    for (const side of ["R", "L"] as const) {
      for (let seg = 0; seg < 3; seg++) {
        const prefix = `bip_${finger}_${seg}_${side}_`;
        const bone = boneNames.find((b) => b.startsWith(prefix));
        if (!bone) continue;
        const ph = PHALANX_NAMES[seg];
        const slug = `${finger}_${["proximal", "intermediate", "distal"][seg]}_${side.toLowerCase()}`;
        BONE_NAMES[bone] = N(
          "hand",
          slug,
          `${side === "R" ? "右" : "左"}${names.cn}${ph.cn}`,
          `${side === "R" ? "Right" : "Left"} ${names.en} ${ph.en}`,
        );
      }
    }
  }
}

/** 机械子件的零件名（拆解出来的骨架/轴承/护板/紧固件…）。 */
export const MECH_NAMES: Record<string, PartName> = {
  frame: { cn: "承力骨架", en: "Load Frame" },
  rail: { cn: "纵梁", en: "Longitudinal Rail" },
  brace: { cn: "横撑", en: "Cross Brace" },
  shaft: { cn: "传动轴", en: "Drive Shaft" },
  bushing: { cn: "衬套", en: "Bushing" },
  bearing_outer: { cn: "轴承外圈", en: "Bearing Outer Race" },
  bearing_inner: { cn: "轴承内圈", en: "Bearing Inner Race" },
  bearing_seal: { cn: "轴承密封圈", en: "Bearing Seal" },
  clip: { cn: "卡环", en: "Retaining Clip" },
  bolts: { cn: "螺栓圈", en: "Bolt Circle" },
  guard: { cn: "护板", en: "Guard Plate" },
  hose: { cn: "液压软管", en: "Hydraulic Hose" },
  fitting: { cn: "管接头", en: "Pipe Fitting" },
  nipple: { cn: "油嘴", en: "Grease Nipple" },
  panel: { cn: "装甲板", en: "Armor Panel" },
  // 液压缸七件
  barrel: { cn: "液压缸体", en: "Hydraulic Cylinder Barrel" },
  piston: { cn: "活塞", en: "Piston" },
  rod: { cn: "活塞杆", en: "Piston Rod" },
  eye_a: { cn: "杆端耳环 A", en: "Rod Eye A" },
  eye_b: { cn: "杆端耳环 B", en: "Rod Eye B" },
  sleeve: { cn: "导向套", en: "Guide Sleeve" },
  seal: { cn: "密封圈", en: "Seal" },
};

/** 取骨骼名的标准名（没有登记的走兜底）。 */
export function boneName(bone: string): BoneName {
  const hit = BONE_NAMES[bone];
  if (hit) return hit;
  const lower = bone.toLowerCase();
  return { system: "spine", slug: lower, cn: bone, en: bone };
}

/** 机械子件名（带序号后缀，如「护板 03」）。 */
export function mechName(kind: string, index?: number): PartName {
  const base = MECH_NAMES[kind] ?? { cn: kind, en: kind };
  if (index === undefined) return base;
  const suffix = String(index).padStart(2, "0");
  return { cn: `${base.cn} ${suffix}`, en: `${base.en} ${suffix}` };
}
