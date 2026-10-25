// ============================================================================
// models/carrier/constants —— 福建舰（Type 003）单一真值源
//
// 编辑尺度 1:8，展示时由 presentationScale=7.9 换算为米：真实舰长约 316m。
// 坐标：+X 右舷（舰岛侧）、+Y 上、+Z 舰艏；龙骨底面 y=0，飞行甲板面 y=4.4（编辑单位）。
// ============================================================================

import { TAKEOFF_CAT_Z0, TAKEOFF_JBD_S } from "./runwayPlan";

export const CV = {
  SCALE: 8,
  LENGTH: 40,
  DECK_BEAM: 9.6,
  DECK_Y: 4.4,
  DECK_T: 0.18,
  DECK_Z_BOW: 20,
  DECK_Z_STERN: -20,

  HULL_LEN: 37,
  // 水线型宽 40m：5.06 编辑单位 / 0.88（舭部椭圆系数）≈ 5.76 总宽。
  HULL_BEAM: 5.76,
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
  // 着舰跑道偏左舷，左端滑轮必须放到左舷外飘甲板边缘（而不是跑道边线内）。
  WIRE_HALF_PORT: 4.45,
  WIRE_Y: 4.62,

  // 舷侧升降机整体收在甲板折线以内：两个站位处的甲板半宽不同，不能共用一个 x。
  ELEVATOR_X: 2.98,
  ELEVATOR_X_BY_INDEX: [2.98, 2.46] as const,
  ELEVATOR_Z: [2.0, -12.8] as const,
  ELEVATOR_W: 2.53,
  ELEVATOR_L: 3.4,

  // 演示机停在艏部右舷停机位（弹射跑道外侧、拦阻网前方），滑行到 2 号弹射位时不穿网。
  AIRCRAFT_PARK: [2.95, 8.8] as const,
  AIRCRAFT_LEN: 2.5,
  AIRCRAFT_SPAN: 2.0,
  AIRCRAFT_FOLD_SPAN: 1.05,
  AIRCRAFT_H: 0.72,
} as const;

export const CV_CONSTANTS: Record<string, number> = Object.fromEntries(
  Object.entries(CV).filter(([, value]) => typeof value === "number"),
) as Record<string, number>;

/** 舰艏上翘：从平甲板最后一段开始，用二次曲线抬到艏端，艏部甲板本体连续起翘。
 *  起点放在弹射器末端之后，弹射轨/滑梭/挡焰板仍落在平甲板上。 */
export const BOW_RAMP_Z0 = 19.4;
export const BOW_RAMP_Z1 = 20.669;
export const BOW_RAMP_RISE = 0.3;

/** 甲板面高度：平甲板区恒为 DECK_Y+DECK_T，艏部按二次弧线抬起。 */
export function deckTopAt(z: number): number {
  const flat = CV.DECK_Y + CV.DECK_T;
  if (z <= BOW_RAMP_Z0) return flat;
  const t = Math.min(1, (z - BOW_RAMP_Z0) / (BOW_RAMP_Z1 - BOW_RAMP_Z0));
  return flat + BOW_RAMP_RISE * t * t;
}

/** 甲板纵坡 dy/dz（用于让舷墙/标线/设备随弧面俯仰）。 */
export function deckSlopeAt(z: number): number {
  if (z <= BOW_RAMP_Z0 || z >= BOW_RAMP_Z1) return 0;
  const t = (z - BOW_RAMP_Z0) / (BOW_RAMP_Z1 - BOW_RAMP_Z0);
  return (2 * BOW_RAMP_RISE * t) / (BOW_RAMP_Z1 - BOW_RAMP_Z0);
}

export function deckPitchDegAt(z: number): number {
  return (-Math.atan(deckSlopeAt(z)) * 180) / Math.PI;
}

/** 三条电磁弹射器：x0/z0 为起点，yawDeg 为相对 +Z 的偏航，长度统一。 */
export type CatTrack = {
  id: number;
  x0: number;
  z0: number;
  yawDeg: number;
  length: number;
};

export const CAT_TRACKS: readonly CatTrack[] = [
  // 舰艏两条：均匀分在前甲板中线两侧（不再一起挤在右舷）。前甲板到艏端
  // 只剩 3.2~3.6 宽，0.1/2.1 的轨道宽度仍能完整落在甲板内。
  { id: 1, x0: 2.1, z0: TAKEOFF_CAT_Z0, yawDeg: 0.0, length: 8.4 },
  { id: 2, x0: 0.1, z0: TAKEOFF_CAT_Z0, yawDeg: 0.0, length: 8.4 },
  // 腰部三号：移到着舰区左舷外侧的净空条带，与甲板中线平行。
  // 旧位置在斜角着舰区内部，和着舰跑道重叠；再向外就是着舰区边界，
  // 因此改成平行艏艉线，JBD/滑梭/喷流区随轨道整体平移。
  // 腰部三号横穿斜角着舰区，必须后移并外靠到左舷净空条带；否则轨道/挡焰板
  // 会直接铺在着舰滑跑线上。现在整条轨道位于着舰区左舷外，JBD 也完全让开。
  { id: 3, x0: -3.82, z0: -12.4, yawDeg: 0, length: 8.4 },
];

/** 挡焰板在各自轨道上的纵向位置：舰艏两条按用户 JSON 后移，三号保持原位。 */
export function carrierJbdOffset(trackId: number): number {
  return trackId === 3 ? -2.2 : TAKEOFF_JBD_S;
}

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
  if (t < 0.62) return half;
  const bow = (t - 0.62) / 0.38;
  // 艏部型线从舯前就开始收窄：真实福建舰的艏段甲板只有约 37m 宽，水下舰体
  // 必须同步收窄，不能比甲板还宽；最后一段快速收成尖艏。
  return half * Math.max(0.03, 1 - Math.pow(bow, 1.2) * 0.92 - Math.pow(bow, 10) * 0.06);
}
