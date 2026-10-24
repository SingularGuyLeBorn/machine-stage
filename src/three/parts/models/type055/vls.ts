// ============================================================================
// models/type055/vls —— H/HT-1 通用垂发单元与公开弹种数据
//
// 公开资料：112 单元（前 64 + 后 48），单元 850×850mm，井深 9m，冷热共架。
// 单元间距取 0.95m（0.85m 井口 + 0.10m 结构/密封），保证井盖之间有真实框条。
// 导弹长度/直径取公开可查的代表值；模型直接由这些数据驱动，不靠目测缩放。
// ============================================================================

export const VLS = {
  PITCH: 0.95,
  HATCH: 0.86,
  TUBE_RADIUS: 0.425,
  DEPTH: 9.0,
  BOTTOM: 5.2,
  TOP: 14.2,
  COLS: 8,
  FWD_ROWS: 8,
  AFT_ROWS: 6,
  FWD_Z: 44.5,
  AFT_Z: -52.5,
} as const;

export interface VlsCell {
  x: number;
  z: number;
  bank: "fwd" | "aft";
  row: number;
  col: number;
}

export function vlsCells(): VlsCell[] {
  const cells: VlsCell[] = [];
  for (let r = 0; r < VLS.FWD_ROWS; r++) {
    for (let c = 0; c < VLS.COLS; c++) {
      cells.push({
        x: -((VLS.COLS - 1) * VLS.PITCH) / 2 + c * VLS.PITCH,
        z: VLS.FWD_Z + r * VLS.PITCH,
        bank: "fwd",
        row: r,
        col: c,
      });
    }
  }
  for (let r = 0; r < VLS.AFT_ROWS; r++) {
    for (let c = 0; c < VLS.COLS; c++) {
      cells.push({
        x: -((VLS.COLS - 1) * VLS.PITCH) / 2 + c * VLS.PITCH,
        z: VLS.AFT_Z + r * VLS.PITCH,
        bank: "aft",
        row: r,
        col: c,
      });
    }
  }
  return cells;
}

export type MissileType = "hhq9b" | "yj18" | "yj21";

export interface MissileSpec {
  label: string;
  length: number;
  diameter: number;
  launch: "cold" | "hot";
  /** 井深需求（m），用于验收时核对。 */
  cellDepth: number;
}

export const MISSILES: Record<MissileType, MissileSpec> = {
  hhq9b: { label: "海红旗-9B", length: 6.5, diameter: 0.5, launch: "cold", cellDepth: 7 },
  yj18: { label: "鹰击-18", length: 8.0, diameter: 0.5, launch: "hot", cellDepth: 9 },
  yj21: { label: "鹰击-21", length: 8.8, diameter: 0.82, launch: "cold", cellDepth: 9 },
};

export interface HeroCell {
  tag: string;
  bank: "fwd" | "aft";
  row: number;
  col: number;
  type: MissileType;
}

/**
 * 前/后各一整排 8 格为动态井：按真实混装顺序展示防空/反舰/高超三类弹，
 * 发射时形成逐格错开的 8 单元齐射，而不是固定 3 格。
 * 列号与 x 坐标一一对应，便于按列分配弹种与弹道。
 */
export const VLS_HERO_TYPES: MissileType[] = [
  "hhq9b",
  "yj18",
  "hhq9b",
  "yj18",
  "yj21",
  "hhq9b",
  "yj18",
  "yj21",
];

export const VLS_HEROES: HeroCell[] = (["fwd", "aft"] as const).flatMap((bank) =>
  VLS_HERO_TYPES.map((type, col) => ({
    tag: `${bank}_${col}`,
    bank,
    row: bank === "fwd" ? 7 : 0,
    col,
    type,
  })),
);

/** 导弹在井内的静止中心高度：弹顶正好落在井口下方 0.2m。 */
export function missileRestY(type: MissileType): number {
  return VLS.TOP - 0.2 - MISSILES[type].length / 2;
}
