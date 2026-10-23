// ============================================================================
// models/type055/constants —— 055 型驱逐舰单一真值源（展示 1 单位 = 1 米）
//
// 公开资料：舰长 ~180m、舷宽 ~20m、吃水 ~6.6m；112 单元 VLS（前 64 + 后 48）；
// 130mm 主炮、346B 四面阵、1130 近防、双机库、COGAG 四燃双轴双桨。
// 坐标：+X 右舷、+Y 上、+Z 舰艏；y=0 为龙骨基线，水线 y=6.6，主甲板 y=14。
// ============================================================================

export const T55 = {
  LENGTH: 180,
  BEAM: 20,
  DECK_BEAM: 16.8,
  DECK_Y: 14.0,
  WATERLINE: 6.6,
  DRAFT: 6.6,
  BOW_Z: 90,
  STERN_Z: -90,

  VLS_FWD: 64,
  VLS_AFT: 48,
  GUN_Z: 72,
  CIWS_FWD_Z: 34,
  CIWS_AFT_Z: -52,
  HANGAR_Z0: -72,
  HANGAR_Z1: -54,
  HELIPAD_Z: -82,

  TURBINE_COUNT: 4,
  SHAFT_X: 3.0,
} as const;

/** 水线处半宽（z 从艉 -90 到艏 +90）。 */
export function t55BaseHalf(z: number): number {
  if (z >= 55) {
    const t = Math.min(1, (z - 55) / 35);
    return 10 * Math.max(0.03, 1 - Math.pow(t, 1.45) * 0.97);
  }
  if (z <= -50) {
    const t = Math.min(1, (-z - 50) / 40);
    return 10 - 2.6 * Math.pow(t, 1.25);
  }
  return 10;
}

/** 任意高度 y 的船壳半宽：水线下椭圆舭部，水线以上内倾（隐身）。 */
export function t55HalfAt(z: number, y: number): number {
  const base = t55BaseHalf(z);
  if (y <= T55.WATERLINE) {
    const u = Math.min(1, Math.max(0, (y - 0.4) / (T55.WATERLINE - 0.4)));
    return Math.max(0.18, base * 0.9 * Math.sqrt(Math.max(0, 2 * u - u * u)));
  }
  const t = Math.min(1, (y - T55.WATERLINE) / (T55.DECK_Y - T55.WATERLINE));
  // 内倾舷侧：甲板处半宽比水线小 18%。
  return base * (1 - 0.18 * t);
}

/** 主甲板半宽（含内倾收窄）。 */
export function t55DeckHalf(z: number): number {
  return t55HalfAt(z, T55.DECK_Y);
}

/** 主甲板外轮廓（顺时针：右舷艏→艉，左舷艉→艏）。 */
export function t55DeckPlan(): Array<[number, number]> {
  const points: Array<[number, number]> = [];
  const bow = T55.BOW_Z;
  const stern = T55.STERN_Z;
  for (let i = 0; i <= 24; i++) {
    const z = stern + ((bow - stern) * i) / 24;
    points.push([t55DeckHalf(z), z]);
  }
  for (let i = 24; i >= 0; i--) {
    const z = stern + ((bow - stern) * i) / 24;
    points.push([-t55DeckHalf(z), z]);
  }
  return points;
}

export const T55_CONSTANTS: Record<string, number> = Object.fromEntries(
  Object.entries(T55)
    .filter(([, value]) => typeof value === "number")
    .map(([key, value]) => [`T55_${key}`, value as number]),
);
