// ============================================================================
// models/kingjoe/constants —— 金古桥（King Joe）单一真值源
//
// 原作：宇宙机器人キングジョー（ウルトラセブン 第14/15話，1968）。
// 公开设定：身高 55m，由佩丹星人制造，四体分离合体（King Ship / King Chest /
// King Stomach / King Legs），银色佩丹尼姆合金，额头破坏光线，四体均可独立飞行。
// 本模型按 1:6.7 展示尺度建模：合体全高 8.14m。
//
// 造型依据（refs/kingjoe-55th.jpg、refs/kingjoe-official-list.jpg、
// refs/kingjoe-two-types.jpg）：
//   · 大块银色装甲 + 黑色接缝 + 金色环带/膝甲；单条百叶式黄色眼带 +
//     红色额头发光体；双胸彩色镶嵌板；巨型肩荚（顶部四联装短筒）；
//     三指爪；鼓形髋荚；粗圆小腿与上翘宽足。
// 坐标系：+X 右、+Y 上、+Z 前（机器人面朝 +Z），地面 y = 0。
// ============================================================================

export const KJ = {
  // —— 整机堆叠（四个对接面自下而上：腿↔腹、腹↔胸、胸↔头）——
  // 真实网格实测：模块切面 3.45 / 4.55 / 5.65，站立高 6.615。每道接缝留 120mm
  // 露出锁环与锥销；外形轮廓仍是真实网格（皮按同样切面分组）。
  DOCK_H: 0.12, // 对接环座高度（上模块底面坐在环座顶面）
  LEGS_TOP: 3.45,
  STOMACH_Y: 3.57,
  STOMACH_H: 1.1,
  STOMACH_TOP: 4.67,
  CHEST_Y: 4.79,
  CHEST_H: 1.1,
  CHEST_TOP: 5.89,
  SHIP_Y: 6.01,
  SHIP_H: 0.965,
  TOTAL_H: 6.975,

  // —— 腿/足（关节坐标来自 GLB 蒙皮骨架；LEG_X 只作为旧机构中线）——
  LEG_X: 0.6,
  HIP_X: 0.3454,
  KNEE_X: 0.5381,
  ANKLE_X: 0.7318,
  HIP_Z: 0.0006,
  KNEE_Z: 0.0203,
  ANKLE_Z: -0.207,
  FOOT_W: 0.93,
  FOOT_L: 1.22,
  FOOT_H: 0.64,
  SOLE_T: 0.075,
  ANKLE_Y: 0.4735,
  KNEE_Y: 1.6971,
  HIP_Y: 2.9377,
  THIGH_L: 1.2406,
  CALF_L: 1.2236,
  THIGH_R: 0.42,
  CALF_R: 0.42,
  ANKLE_R: 0.3,

  // —— 髋荚（参考图两侧鼓形圆筒）——
  HIP_POD_R: 0.43,
  HIP_POD_LEN: 0.66,

  // —— 腰 ——
  WAIST_R: 0.4,
  WAIST_Y0: 0.18,
  WAIST_Y1: 0.78,

  // —— 胸（真实网格：胸廓宽约 1.8m、肩关节在 x±0.70 / y4.87）——
  CHEST_W: 1.6,
  CHEST_D: 1.2,
  SHOULDER_X: 0.7043,
  SHOULDER_Y: 0.3218,
  SHOULDER_Z: 0.0503,
  SHOULDER_POD_CX: 1.0,
  SHOULDER_POD_W: 0.4,
  SHOULDER_POD_H: 0.55,
  SHOULDER_POD_D: 0.7,
  NECK_R: 0.35,
  CHEST_PANEL_W: 0.4,
  CHEST_PANEL_H: 0.6,

  // —— 臂（肩→肘 0.9151、肘→腕 0.5736；外张量 / 前后偏移来自骨架）——
  UPPER_ARM_L: 0.9151,
  UPPER_ARM_R: 0.18,
  FOREARM_L: 0.5736,
  FOREARM_R: 0.17,
  ELBOW_R: 0.19,
  WRIST_R: 0.13,
  ELBOW_DX: 0.486,
  ELBOW_DZ: -0.0106,
  WRIST_DX: 0.2863,
  WRIST_DZ: 0.3179,
  PALM_W: 0.3,
  PALM_H: 0.24,
  PALM_D: 0.26,
  FINGER_LEN: [0.12, 0.1, 0.08] as const,
  FINGER_R: 0.035,
  ARM_REST_OUT_DEG: 0,
  // 手指根相对腕关节（左臂；右臂 x 取反）
  FINGER_PIVOT_DX: [0.0449, -0.1512, -0.1809] as const,
  FINGER_PIVOT_DY: [-0.181, -0.3244, -0.403] as const,
  FINGER_PIVOT_DZ: [0.3014, 0.255, 0.0548] as const,
  WAIST_OFFSET: 0.49,

  // —— 头（真实网格头高约 1.25m、宽 1.34m；旧壳件已由真实皮替代）——
  HEAD_W: 1.2,
  HEAD_H: 0.9,
  HEAD_D: 1.2,
  VISOR_W: 0.6,
  VISOR_H: 0.12,
  VISOR_Y: 0.35,
  VISOR_Z: 0.62,
  FOREHEAD_Y: 0.62,
  FOREHEAD_Z: 0.55,
  NECK_COLLAR_H: 0.1,
  CREST_H: 0.16,

  // —— 对接接口（轴向三对 + 双肩）——
  DOCK_R_PIN: 0.34,
  DOCK_R_DOWEL: 0.24,
  DOCK_RING_RO: 0.64,
  DOCK_RING_RI: 0.55,
  PIN_R: 0.045,
  PIN_LEN: 0.2,
  SOCKET_RO: 0.075,
  SOCKET_RI: 0.056,
  DOWEL_R: 0.036,
  DOWEL_LEN: 0.14,
  BORE_RO: 0.058,
  BORE_RI: 0.045,
  SHOULDER_PIN_R: 0.026,
  SHOULDER_PIN_LEN: 0.12,
  SHOULDER_LOCK_R: 0.235,

  // —— 喷口（每体 4 只，喷管 + 3 叶片 + 作动器）——
  NOZZLE_R: 0.13,
  NOZZLE_L: 0.34,
  NOZZLE_BLADE_L: 0.16,
  NOZZLE_BLADE_W: 0.085,
  NOZZLE_BLADE_T: 0.016,

  // —— 反重力发生器（每体一套）——
  AG_R: 0.3,
  AG_H: 0.55,
  AG_COIL_R: 0.2,
  AG_COIL_TUBE: 0.035,
  AG_COIL_COUNT: 6,

  // —— 液压缸 ——
  HYD_BARREL_R: 0.065,
  HYD_BARREL_RI: 0.053,
  HYD_BARREL_L: 0.46,
  HYD_ROD_R: 0.034,
  HYD_ROD_L: 0.55,
  HYD_PISTON_R: 0.049,
  HYD_PISTON_H: 0.05,
  HYD_GLAND_R: 0.085,
  HYD_CLEVIS_W: 0.12,
  HYD_CLEVIS_H: 0.14,
  HYD_HOSE_R: 0.022,

  // —— 站位（动画/特效共用）——
  DOCK_SHIP_Y: 7.12,
  DOCK_CHEST_Y: 4.9,
  DOCK_STOMACH_Y: 3.68,
  FORMATION_SHIP: [0, 2.8, -3.2] as const,
  FORMATION_CHEST: [2.9, 2.1, -2.5] as const,
  FORMATION_STOMACH: [-2.7, 1.7, -2.2] as const,
  FORMATION_LEGS: [0, 0.52, 0] as const,
} as const;

export const KINGJOE_CONSTANTS: Record<string, number> = Object.fromEntries(
  Object.entries(KJ).filter(([, value]) => typeof value === "number"),
) as Record<string, number>;
