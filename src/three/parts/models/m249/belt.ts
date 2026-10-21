import * as THREE from "three";

// ============================================================================
// models/m249/belt —— M27 可散弹链的堆叠排布（弹链沿受弹托盘步进）
// 约定：所有弹轴平行枪膛轴（+Z），弹心即排布点；0 号轮在最前（抱弹口）。
// root 空间 = 模型坐标 + STAGE_Y（与零件 mate 的节点空间对齐）。
// ============================================================================

export const BELT_LINKS = 20; // 可见链节数（盒内另供）
export const BELT_PITCH = 0.015; // M27 节距
export const BELT_TRAY_Y = 0.019; // 托盘（弹链通道）高度
export const BELT_Z0 = 0.005; // 最前一发（0 号）的弹心 z
export const BELT_LINK_DY = -0.0075; // 链节相对弹心的下偏（链节兜住弹）
export const BELT_STAGE_Y = 0.3;
export const BELT_ROUND_TOTAL = 0.057; // 5.56×45 全弹长（底缘到弹尖）
export const BELT_ROUND_CENTER = 0.0285; // 底缘到弹心

/** 第 i 发在链上的弹心位置（模型坐标）。 */
export function beltRoundPos(i: number): [number, number, number] {
  return [0, BELT_TRAY_Y, BELT_Z0 - i * BELT_PITCH];
}

/** 第 i 节链节的位置（模型坐标；链节在弹下方）。 */
export function beltLinkPos(i: number): [number, number, number] {
  const [x, y, z] = beltRoundPos(i);
  return [x, y + BELT_LINK_DY, z];
}

/** 链上第 i 发的姿态矩阵（root 空间）。origin = 弹壳底缘。 */
export function beltRoundMatrix(i: number, zOffset: number): THREE.Matrix4 {
  const pos = beltRoundPos(i);
  return new THREE.Matrix4().makeTranslation(pos[0], pos[1] + BELT_STAGE_Y, pos[2] - BELT_ROUND_CENTER + zOffset);
}

/** 第 i 节链节的姿态矩阵（root 空间；X/Y 平移沿链平面）。 */
export function beltLinkMatrix(i: number): THREE.Matrix4 {
  const pos = beltLinkPos(i);
  return new THREE.Matrix4().makeTranslation(pos[0], pos[1] + BELT_STAGE_Y, pos[2]);
}

/** 弹药子件相对弹壳底缘的沿轴偏移（5.56×45）。 */
export const M855_OFFSET = {
  case: 0,
  primer: 0.0002,
  propellant: 0.023, // 发射药（壳内 23mm 处）
  bullet: 0.043, // 被甲中心（壳口内 10mm 卡收）
  lead: 0.0415,
  steel: 0.036,
} as const;
