// ============================================================================
// 用户 lnj-coordinates.json（1353×403，原点左下）→ 航母编辑坐标。
// 像素长轴 x → 编辑 z：艏 +20.7 / 艉 −20；像素 y → 编辑 x：
// 图像 y 中心 202.5 对应舰体中轴，39 px = 1 编辑单位（低 y = 右舷 +x）。
// 这里保留原始像素点，派生跑道/弹射器/挡焰板坐标全部由同一映射生成。
// ============================================================================

const X0 = 39.6;
const X1 = 1274.2;
const BOW_Z = 20.7;
const STERN_Z = -20;
const Y_CENTER = 202.5;
const Y_SCALE = 39;

export type PlanPoint = [number, number];

export function mapLnJPixel(px: number, py: number): PlanPoint {
  return [(Y_CENTER - py) / Y_SCALE, BOW_Z - ((px - X0) / (X1 - X0)) * (BOW_Z - STERN_Z)];
}

function mapPolygon(points: ReadonlyArray<readonly [number, number]>): PlanPoint[] {
  return points.map(([px, py]) => mapLnJPixel(px, py));
}

/** 降落跑道：艏端窄、艉端略宽，几乎沿舰体中线。点序：艏右、艏左、艉左、艉右。 */
export const LANDING_RUNWAY_POLYGON = mapPolygon([
  [326, 230.3],
  [365.8, 297.1],
  [1266.8, 297.1],
  [1274.2, 209.9],
]);

/** 起飞跑道：右舷舰艏的楔形窄跑道。点序：艏右、艉右、艉左、艏左。 */
export const TAKEOFF_RUNWAY_POLYGON = mapPolygon([
  [39.6, 147.7],
  [368.9, 181.1],
  [371.5, 107.2],
  [40.9, 102.8],
]);

export const TAKEOFF_CAT_X = [0.9, 2.0] as const;
// 飞机挂上滑梭时机体原点会落后滑梭约 1.1，机尾再向后约 1.2；起点前移到
// 10.8 才能让机尾在挡焰板（z≈8.0）之前，避免挡焰板顶到机尾。
export const TAKEOFF_CAT_Z0 = 10.8;
export const TAKEOFF_JBD_S = -2.8;

/** 两段电磁弹射器起始箱体（仅用于校验/标注，轨道本体仍由 CAT_TRACKS 生成）。 */
export const TAKEOFF_CAT_START_POLYGONS = [
  mapPolygon([[343.1, 178.4], [343.5, 151.4], [369.5, 154.4], [370.1, 182.3]]),
  mapPolygon([[342.2, 137.3], [342.5, 106.6], [372.3, 106.9], [370.8, 140.3]]),
];

export const LANDING_RUNWAY = (() => {
  const [foreStar, forePort, aftPort, aftStar] = LANDING_RUNWAY_POLYGON as [
    PlanPoint,
    PlanPoint,
    PlanPoint,
    PlanPoint,
  ];
  const fore: PlanPoint = [(foreStar[0] + forePort[0]) / 2, (foreStar[1] + forePort[1]) / 2];
  const aft: PlanPoint = [(aftPort[0] + aftStar[0]) / 2, (aftPort[1] + aftStar[1]) / 2];
  const len = Math.hypot(fore[0] - aft[0], fore[1] - aft[1]);
  const deg = (Math.atan2(aft[0] - fore[0], fore[1] - aft[1]) * 180) / Math.PI;
  const widthFore = Math.hypot(foreStar[0] - forePort[0], foreStar[1] - forePort[1]);
  const widthAft = Math.hypot(aftPort[0] - aftStar[0], aftPort[1] - aftStar[1]);
  return {
    aftX: aft[0],
    aftZ: aft[1],
    foreX: fore[0],
    foreZ: fore[1],
    len,
    deg,
    width: (widthFore + widthAft) / 2,
    widthFore,
    widthAft,
  };
})();

/** 舰艏两段弹射器挡焰板：与 JSON 挡焰板 1/2 对齐，均在各自弹射器起点后方 2.0。 */
export const TAKEOFF_JBD = mapPolygon([
  [410.6, 187.7],
  [411.5, 151.6],
  [437.5, 151.6],
  [437, 190.7],
]);

/** 舰岛与舰载机 3 的重叠参考区（用于验收对照，不直接生成几何）。 */
export const ISLAND_AIRCRAFT_OVERLAP = mapPolygon([
  [923.3, 99.8],
  [927.7, 60.1],
  [956.7, 67],
  [952.3, 99.2],
]);
