// ============================================================================
// models/mbt/constants —— MBT-90 单一真值源（整机坐标系）
//
// 坐标：+X 右、+Y 上、+Z 车头；地面 y = 0。所有层共用这一张表。
// 尺寸按现代主战坦克（豹 2A6 / M1A2 / 99A 一级）取近似值：
//   全长（含炮）约 10.5m、车体宽 2.68m、车底距地 0.46m、炮塔顶 2.46m。
// ============================================================================

export const MBT = {
  // 行走装置
  WHEEL_R: 0.4,
  WHEEL_W: 0.18,
  WHEEL_X: 1.52,
  WHEEL_Y: 0.47,
  WHEEL_COUNT: 7,
  WHEEL_Z_FIRST: 2.52,
  WHEEL_PITCH: 0.88,
  SPROCKET_Z: -3.48,
  SPROCKET_R: 0.32,
  IDLER_Z: 3.3,
  IDLER_R: 0.31,
  RETURN_ROLLER_Y: 1.34,
  TRACK_PITCH: 0.16,
  TRACK_ARC_R: 0.46,
  TRACK_ARC_Y: 0.47,

  // 车体
  HULL_FLOOR: 0.46,
  HULL_DECK: 1.72,
  HULL_HALF_W: 1.34,
  HULL_Z_REAR: -3.25,
  HULL_Z_FRONT: 3.08,
  GLACIS_Z_BOTTOM: 3.08,
  GLACIS_Z_TOP: 2.02,
  GLACIS_Y_BOTTOM: 1.05,
  GLACIS_Y_TOP: 1.72,
  GLACIS_ANGLE_DEG: 33,
  LOWER_FRONT_Y: 0.76,

  // 炮塔
  TURRET_Z: 0.1,
  TURRET_FLOOR: 1.72,
  TURRET_ROOF: 2.46,
  TURRET_HALF_W: 1.3,
  TURRET_Z_FRONT: 1.58,
  TURRET_Z_REAR: -1.62,
  TURRET_RING_R: 1.06,

  // 主炮
  GUN_Y: 1.98,
  GUN_ROOT_Z: 1.62,
  BARREL_LEN: 5.6,
  GUN_BORE_R: 0.0625,

  // 侧裙
  SKIRT_X: 1.86,
  SKIRT_Y: 1.04,

  // 动力舱（发动机输出轴中心）
  ENGINE_Y: 1.0,
  ENGINE_Z: -2.2,
} as const;

export const MBT_TRACK_LINKS_PER_SIDE = Math.round(
  (2 * (MBT.IDLER_Z - MBT.SPROCKET_Z) + 2 * Math.PI * MBT.TRACK_ARC_R) / MBT.TRACK_PITCH,
);

export const MBT_TRACK_PERIMETER =
  2 * (MBT.IDLER_Z - MBT.SPROCKET_Z) + 2 * Math.PI * MBT.TRACK_ARC_R;

/** 履带环上弧长 s 处的点与切线角（绕 X 的旋转，使履带板 +Z 对准切向）。 */
export function mbtTrackPose(s: number): { z: number; y: number; angle: number } {
  const z1 = MBT.SPROCKET_Z;
  const z2 = MBT.IDLER_Z;
  const R = MBT.TRACK_ARC_R;
  const yc = MBT.TRACK_ARC_Y;
  const L = z2 - z1;
  const arc = Math.PI * R;
  const total = 2 * L + 2 * arc;
  let u = ((s % total) + total) % total;
  if (u < L) return { z: z1 + u, y: yc + R, angle: 0 };
  u -= L;
  if (u < arc) {
    const phi = u / R;
    return { z: z2 + R * Math.sin(phi), y: yc + R * Math.cos(phi), angle: phi };
  }
  u -= arc;
  if (u < L) return { z: z2 - u, y: yc - R, angle: Math.PI };
  u -= L;
  const phi = u / R;
  return { z: z1 - R * Math.sin(phi), y: yc - R * Math.cos(phi), angle: Math.PI + phi };
}

/** 负重轮中心（整机坐标）。 */
export function wheelCenter(index: number): { x: number; y: number; z: number; side: 1 | -1 } {
  const side: 1 | -1 = index % 2 === 0 ? 1 : -1;
  const station = Math.floor(index / 2);
  return {
    x: side * MBT.WHEEL_X,
    y: MBT.WHEEL_Y,
    z: MBT.WHEEL_Z_FIRST - station * MBT.WHEEL_PITCH,
    side,
  };
}

/** 炮塔前斜板：绕 X 后倾 8°、绕 Y 内收 24° 的局部坐标 → 整机坐标。 */
export function turretCheekPoint(side: 1 | -1, local: [number, number, number]): [number, number, number] {
  const yaw = side * -24 * (Math.PI / 180);
  const pitch = -8 * (Math.PI / 180);
  const [lx, ly, lz] = local;
  // 先绕 Y 偏航，再绕 X 后倾
  const x1 = lx * Math.cos(yaw) + lz * Math.sin(yaw);
  const z1 = -lx * Math.sin(yaw) + lz * Math.cos(yaw);
  const y2 = ly * Math.cos(pitch) - z1 * Math.sin(pitch);
  const z2 = ly * Math.sin(pitch) + z1 * Math.cos(pitch);
  return [side * 0.64 + x1, 2.08 + y2, 1.02 + z2];
}

export const TURRET_CHEEK_ROT: [number, number, number] = [-8, -24, 0];
