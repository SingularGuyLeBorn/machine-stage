import * as THREE from "three";

// ============================================================================
// models/m2hb/belt —— M9 可散弹链排布（.50 BMG，左进右出空链）
// 与 m249/belt 同约定：root 空间 = 模型坐标 + STAGE_Y。
// ============================================================================

export const BELT_LINKS = 17;
export const BELT_PITCH = 0.035; // M9 链节距
export const BELT_PATH_Y = 0.026; // 供弹通道高
export const BELT_Z0 = 0.005; // 抱弹位（最前一发弹心）
export const BELT_LINK_DY = -0.009; // 链节相对弹心下偏
export const BELT_STAGE_Y = 0.3;
export const BELT_ROUND_TOTAL = 0.105; // .50 BMG 全弹长
export const BELT_ROUND_CENTER = 0.0525; // 底缘到弹心

/** 第 i 发在链上的弹心位置（模型坐标）。 */
export function beltRoundPos(i: number): [number, number, number] {
  return [0, BELT_PATH_Y, BELT_Z0 - i * BELT_PITCH];
}

/** 第 i 节链节的位置。 */
export function beltLinkPos(i: number): [number, number, number] {
  const [x, y, z] = beltRoundPos(i);
  return [x, y + BELT_LINK_DY, z];
}

/** 链上第 i 发的姿态矩阵（root 空间；origin = 弹壳底缘）。 */
export function beltRoundMatrix(i: number, _zOffset: number): THREE.Matrix4 {
  const pos = beltRoundPos(i);
  return new THREE.Matrix4().makeTranslation(pos[0], pos[1] + BELT_STAGE_Y, pos[2]);
}

/** 第 i 节链节的姿态矩阵。 */
export function beltLinkMatrix(i: number): THREE.Matrix4 {
  const pos = beltLinkPos(i);
  return new THREE.Matrix4().makeTranslation(pos[0], pos[1] + BELT_STAGE_Y, pos[2]);
}

/** 弹药子件相对弹壳底缘的沿轴偏移（.50 BMG：全弹 105mm）。 */
export const M2_OFFSET = {
  case: 0,
  primer: 0.0003,
  propellant: 0.036, // 发射药（壳内中部）
  bullet: 0.079, // 被甲中心（壳口外）
  lead: 0.077,
  steel: 0.068,
} as const;
