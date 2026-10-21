import * as THREE from "three";

// ============================================================================
// models/m134/belt —— 供弹机弹链排布（7.62×51 M13 链，从左侧横向进入供弹机）
// 弹链沿 -X 方向铺开，弹轴平行枪管（+Z）；链节绕 Y 转 90° 让链道朝 X。
// root 空间 = 模型坐标 + STAGE_Y。
// ============================================================================

export const BELT_LINKS = 16;
export const BELT_PITCH = 0.015;
export const BELT_Y = 0.078; // 供弹机高度（机匣顶）
export const BELT_X0 = 0.008; // 最前一节（进弹位）x
export const BELT_Z = -0.02; // 链道 z
export const BELT_STAGE_Y = 0.42;

/** 第 i 节链节的位置（模型坐标）。 */
export function beltLinkPos(i: number): [number, number, number] {
  return [BELT_X0 - i * BELT_PITCH, BELT_Y, BELT_Z];
}

/** 第 i 节链节姿态矩阵（root 空间；绕 Y 转 90° 让链道沿 X）。 */
export function beltLinkMatrix(i: number): THREE.Matrix4 {
  const [x, y, z] = beltLinkPos(i);
  const m = new THREE.Matrix4().makeRotationY(Math.PI / 2);
  m.setPosition(x, y + BELT_STAGE_Y, z);
  return m;
}

/** 链上第 i 发的姿态矩阵（root 空间；弹轴 +Z，origin = 弹壳底缘）。 */
export function beltRoundMatrix(i: number, zOffset: number): THREE.Matrix4 {
  const [x, y, z] = beltLinkPos(i);
  return new THREE.Matrix4().makeTranslation(x, y + BELT_STAGE_Y, z - 0.0285 + zOffset);
}

/** 弹药子件相对弹壳底缘的沿轴偏移（7.62×51：全弹 71mm）。 */
export const M134_OFFSET = {
  case: 0,
  primer: 0.0002,
  propellant: 0.026,
  bullet: 0.057,
  lead: 0.0555,
  steel: 0.049,
} as const;
