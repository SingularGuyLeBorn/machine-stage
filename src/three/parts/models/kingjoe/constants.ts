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
  DOCK_H: 0.22, // 对接环座高度（上模块底面坐在环座顶面）
  LEGS_TOP: 3.46,
  STOMACH_Y: 3.68,
  STOMACH_H: 1.0,
  STOMACH_TOP: 4.68,
  CHEST_Y: 4.9,
  CHEST_H: 2.0,
  CHEST_TOP: 6.9,
  SHIP_Y: 7.12,
  SHIP_H: 1.02,
  TOTAL_H: 8.16,

  // —— 腿/足 ——
  LEG_X: 0.74,
  FOOT_W: 0.64,
  FOOT_L: 1.04,
  FOOT_H: 0.3,
  SOLE_T: 0.075,
  ANKLE_Y: 0.34,
  KNEE_Y: 1.56,
  HIP_Y: 3.06,
  THIGH_L: 1.5,
  CALF_L: 1.22,
  THIGH_R: 0.31,
  CALF_R: 0.3,
  ANKLE_R: 0.22,

  // —— 髋荚（参考图两侧鼓形圆筒）——
  HIP_POD_R: 0.43,
  HIP_POD_LEN: 0.66,

  // —— 腰 ——
  WAIST_R: 0.4,
  WAIST_Y0: 0.18,
  WAIST_Y1: 0.78,

  // —— 胸 ——
  CHEST_W: 2.3,
  CHEST_D: 1.24,
  SHOULDER_X: 2.32,
  SHOULDER_Y: 1.55,
  SHOULDER_POD_CX: 1.62,
  SHOULDER_POD_W: 0.86,
  SHOULDER_POD_H: 0.88,
  SHOULDER_POD_D: 1.02,
  NECK_R: 0.5,
  CHEST_PANEL_W: 0.62,
  CHEST_PANEL_H: 0.56,

  // —— 臂 ——
  UPPER_ARM_L: 0.92,
  UPPER_ARM_R: 0.235,
  FOREARM_L: 0.98,
  FOREARM_R: 0.285,
  ELBOW_R: 0.27,
  WRIST_R: 0.2,
  PALM_W: 0.42,
  PALM_H: 0.3,
  PALM_D: 0.34,
  FINGER_LEN: [0.2, 0.17, 0.14] as const,
  FINGER_R: 0.052,
  ARM_REST_OUT_DEG: 6,

  // —— 头 ——
  HEAD_W: 1.46,
  HEAD_H: 0.66,
  HEAD_D: 1.12,
  VISOR_W: 0.9,
  VISOR_H: 0.19,
  VISOR_Y: 0.74,
  VISOR_Z: 0.575,
  FOREHEAD_Y: 0.9,
  FOREHEAD_Z: 0.55,
  NECK_COLLAR_H: 0.16,
  CREST_H: 0.3,

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
