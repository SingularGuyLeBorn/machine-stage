// ============================================================================
// models/carrier/constants —— 福建舰（Type 003）单一真值源
//
// 编辑尺度 1:8，展示时由 presentationScale=7.9 换算为米：真实舰长约 316m。
// 坐标：+X 右舷（舰岛侧）、+Y 上、+Z 舰艏；龙骨底面 y=0，飞行甲板面 y=4.4（编辑单位）。
// ============================================================================

export const CV = {
  SCALE: 8,
  LENGTH: 40,
  DECK_BEAM: 9.6,
  DECK_Y: 4.4,
  DECK_T: 0.18,
  DECK_Z_BOW: 20,
  DECK_Z_STERN: -20,

  HULL_LEN: 37,
  HULL_BEAM: 7.2,
  HULL_BOTTOM: 0.42,
  HULL_TOP: 3.9,
  HULL_Z_BOW: 18.5,
  HULL_Z_STERN: -18.5,

  KEEL_Y: 0.2,
  LOWER_DECK_Y: 1.25,
  HANGAR_Y: 2.65,
  HANGAR_HEIGHT: 2.0,

  ISLAND_X: 3.15,
  ISLAND_Z: -5.0,
  ISLAND_W: 1.7,
  ISLAND_L: 6.2,
  ISLAND_H: 3.6,

  // 2 号弹射器起点/终点仍是动画基准；三条弹射器的真实摆放见下方 CAT_TRACKS。
  CAT_X: 1.55,
  CAT_Z0: 10.0,
  CAT_Z1: 18.4,
  CAT_SEGMENTS: 16,
  CAT_TRACK_W: 0.16,

  WIRE_Z: [-7, -9, -11, -13] as const,
  WIRE_HALF: 3.0,
  WIRE_Y: 4.62,

  ELEVATOR_X: 3.76,
  ELEVATOR_Z: [2.0, -12.8] as const,
  ELEVATOR_W: 2.0,
  ELEVATOR_L: 3.4,

  // 演示机停在艏部左舷停机区（拦阻网前方），滑行到 2 号弹射位时不穿网。
  AIRCRAFT_PARK: [-3.5, 8.5] as const,
  AIRCRAFT_LEN: 2.5,
  AIRCRAFT_SPAN: 2.0,
  AIRCRAFT_FOLD_SPAN: 1.05,
  AIRCRAFT_H: 0.72,
} as const;

export const CV_CONSTANTS: Record<string, number> = Object.fromEntries(
  Object.entries(CV).filter(([, value]) => typeof value === "number"),
) as Record<string, number>;

/** 三条电磁弹射器：x0/z0 为起点，yawDeg 为相对 +Z 的偏航，长度统一。 */
export type CatTrack = {
  id: number;
  x0: number;
  z0: number;
  yawDeg: number;
  length: number;
};

export const CAT_TRACKS: readonly CatTrack[] = [
  // 舰艏两条：整体内收 1.5°，合计 3° 夹角（与真实福建舰一致），起点前移到拦阻网/着舰区前方。
  { id: 1, x0: -1.55, z0: 10.0, yawDeg: 1.5, length: 8.4 },
  { id: 2, x0: 1.55, z0: 10.0, yawDeg: -1.5, length: 8.4 },
  // 腰部三号：与斜角着舰跑道平行，放在跑道右侧（靠舰岛一侧），不再横跨跑道。
  { id: 3, x0: 2.62, z0: -8.6, yawDeg: -9.3, length: 8.4 },
];

export function catPoint(track: CatTrack, s: number): { x: number; z: number } {
  const yaw = (track.yawDeg * Math.PI) / 180;
  return {
    x: track.x0 + Math.sin(yaw) * s,
    z: track.z0 + Math.cos(yaw) * s,
  };
}

/** 沿轨道法向偏移（用于车道线/机柜等横向定位）。 */
export function catAcross(track: CatTrack, s: number, distance: number): { x: number; z: number } {
  const p = catPoint(track, s);
  const yaw = (track.yawDeg * Math.PI) / 180;
  return {
    x: p.x + Math.cos(yaw) * distance,
    z: p.z - Math.sin(yaw) * distance,
  };
}

/** 舰体平面轮廓半宽随 z 变化（HULL_BEAM 是全宽，这里返回半宽）。 */
export function hullHalfBeamAt(z: number): number {
  const half = CV.HULL_BEAM / 2;
  const t = (z - CV.HULL_Z_STERN) / (CV.HULL_Z_BOW - CV.HULL_Z_STERN);
  if (t < 0.12) return half * (0.62 + 0.38 * (t / 0.12));
  if (t < 0.72) return half;
  const bow = (t - 0.72) / 0.28;
  // 艏部型线按真实舰体收窄：先慢后快，最后一段收成尖艏；宽艏会顶出窄甲板轮廓。
  return half * Math.max(0.03, 1 - Math.pow(bow, 1.5) * 0.9 - Math.pow(bow, 10) * 0.07);
}
