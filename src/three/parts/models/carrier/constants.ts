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

  CAT_X: 1.7,
  CAT_Z0: 4.0,
  CAT_Z1: 17.0,
  CAT_SEGMENTS: 16,
  CAT_TRACK_W: 0.16,

  WIRE_Z: [-7, -9, -11, -13] as const,
  WIRE_HALF: 3.0,
  WIRE_Y: 4.62,

  ELEVATOR_X: 3.76,
  ELEVATOR_Z: [2.0, -12.8] as const,
  ELEVATOR_W: 2.0,
  ELEVATOR_L: 3.4,

  AIRCRAFT_PARK: [-2.1, -2.2] as const,
  AIRCRAFT_LEN: 2.5,
  AIRCRAFT_SPAN: 2.0,
  AIRCRAFT_FOLD_SPAN: 1.05,
  AIRCRAFT_H: 0.72,
} as const;

export const CV_CONSTANTS: Record<string, number> = Object.fromEntries(
  Object.entries(CV).filter(([, value]) => typeof value === "number"),
) as Record<string, number>;

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
