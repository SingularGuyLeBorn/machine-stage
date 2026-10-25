import { CV } from "./constants";
import { deckEdgeAt } from "./kits";
import { LANDING_RUNWAY_POLYGON, TAKEOFF_RUNWAY_POLYGON, type PlanPoint } from "./runwayPlan";

export type DeckSpan = [number, number];
export type DeckRect = [number, number, number, number];

/** 平面点是否在多边形内（射线法，含边上点按需由调用方加容差）。 */
export function pointInPlan(polygon: ReadonlyArray<readonly [number, number]>, x: number, z: number): boolean {
  let hit = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, zi] = polygon[i]!;
    const [xj, zj] = polygon[j]!;
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) hit = !hit;
  }
  return hit;
}

export function distanceToPlanEdge(
  polygon: ReadonlyArray<readonly [number, number]>,
  x: number,
  z: number,
): number {
  let best = Infinity;
  for (let i = 0; i < polygon.length; i++) {
    const [ax, az] = polygon[i]!;
    const [bx, bz] = polygon[(i + 1) % polygon.length]!;
    const dx = bx - ax;
    const dz = bz - az;
    const len2 = dx * dx + dz * dz;
    const t = len2 > 1e-9 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2)) : 0;
    best = Math.min(best, Math.hypot(x - (ax + dx * t), z - (az + dz * t)));
  }
  return best;
}

/** 水平线 z 与凸多边形的交段（返回 [xMin, xMax]）。 */
export function planSpanAtZ(
  polygon: ReadonlyArray<readonly [number, number]>,
  z: number,
): DeckSpan | null {
  const xs: number[] = [];
  for (let i = 0; i < polygon.length; i++) {
    const [ax, az] = polygon[i]!;
    const [bx, bz] = polygon[(i + 1) % polygon.length]!;
    if ((az > z) === (bz > z)) continue;
    const t = (z - az) / (bz - az);
    xs.push(ax + (bx - ax) * t);
  }
  if (xs.length < 2) return null;
  return [Math.min(...xs), Math.max(...xs)];
}

function subtractSpan(spans: DeckSpan[], cut: DeckSpan): DeckSpan[] {
  const out: DeckSpan[] = [];
  for (const [a, b] of spans) {
    if (cut[1] <= a || cut[0] >= b) {
      out.push([a, b]);
      continue;
    }
    if (cut[0] > a) out.push([a, Math.min(b, cut[0])]);
    if (cut[1] < b) out.push([Math.max(a, cut[1]), b]);
  }
  return out.filter(([a, b]) => b - a > 1e-5);
}

export interface DeckFreeOptions {
  /** 与跑道/舱口/甲板边缘的额外净距。 */
  margin?: number;
  /** 需要避让的矩形 [xMin, zMin, xMax, zMax]。 */
  exclude?: ReadonlyArray<DeckRect>;
}

/** 某条横线上可用的甲板区间：扣除着舰/起飞跑道、指定矩形和舷缘净距。 */
export function freeDeckSpans(z: number, options: DeckFreeOptions = {}): DeckSpan[] {
  const margin = options.margin ?? 0.12;
  const port = deckEdgeAt(z, -1).x + margin;
  const star = deckEdgeAt(z, 1).x - margin;
  if (star - port <= 1e-4) return [];
  let spans: DeckSpan[] = [[port, star]];
  for (const polygon of [LANDING_RUNWAY_POLYGON, TAKEOFF_RUNWAY_POLYGON] as PlanPoint[][]) {
    const span = planSpanAtZ(polygon, z);
    if (span) spans = subtractSpan(spans, [span[0] - margin, span[1] + margin]);
  }
  for (const [x0, z0, x1, z1] of options.exclude ?? []) {
    if (z < z0 - margin || z > z1 + margin) continue;
    spans = subtractSpan(spans, [x0 - margin, x1 + margin]);
  }
  return spans;
}

/** 在可用区间内均匀放 count 个点，返回甲板坐标 x。 */
export function freeDeckColumns(z: number, count: number, options: DeckFreeOptions = {}): number[] {
  const spans = freeDeckSpans(z, options);
  const lengths = spans.map(([a, b]) => b - a);
  const total = lengths.reduce((sum, length) => sum + length, 0);
  if (total <= 1e-6) return [];
  const result: number[] = [];
  for (let i = 0; i < count; i++) {
    let target = ((i + 0.5) / count) * total;
    let x = spans[spans.length - 1]![1];
    for (let s = 0; s < spans.length; s++) {
      if (target <= lengths[s]! || s === spans.length - 1) {
        x = spans[s]![0] + Math.min(target, lengths[s]!);
        break;
      }
      target -= lengths[s]!;
    }
    result.push(x);
  }
  return result;
}

/** 离期望位置最近的、足够放下半宽 halfWidth 的甲板坐标；没有可用位置时返回 null。 */
export function nearestDeckX(
  preferredX: number,
  z: number,
  halfWidth: number,
  options: DeckFreeOptions = {},
): number | null {
  const spans = freeDeckSpans(z, {
    margin: (options.margin ?? 0.12) + halfWidth,
    exclude: options.exclude,
  });
  if (spans.length === 0) return null;
  let bestX = spans[0]![0];
  let bestDistance = Infinity;
  for (const [a, b] of spans) {
    const x = Math.max(a, Math.min(b, preferredX));
    const distance = Math.abs(x - preferredX);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestX = x;
    }
  }
  return bestX;
}

/** 点是否在两条跑道之外并保留 margin 净距。 */
export function clearOfRunways(x: number, z: number, margin = 0): boolean {
  for (const polygon of [LANDING_RUNWAY_POLYGON, TAKEOFF_RUNWAY_POLYGON] as PlanPoint[][]) {
    if (pointInPlan(polygon, x, z)) return false;
    if (margin > 0 && distanceToPlanEdge(polygon, x, z) < margin) return false;
  }
  return true;
}

/** 甲板设备布局需要避让的固定结构：舰岛、两个升降机坑口。 */
export function carrierDeckExclusions(): DeckRect[] {
  const island: DeckRect = [
    CV.ISLAND_X - CV.ISLAND_W / 2,
    CV.ISLAND_Z - CV.ISLAND_L / 2,
    CV.ISLAND_X + CV.ISLAND_W / 2,
    CV.ISLAND_Z + CV.ISLAND_L / 2,
  ];
  const elevators = CV.ELEVATOR_Z.map((z, index): DeckRect => {
    const x = CV.ELEVATOR_X_BY_INDEX[index]!;
    return [
      x - CV.ELEVATOR_W / 2 - 0.08,
      z - CV.ELEVATOR_L / 2 - 0.08,
      x + CV.ELEVATOR_W / 2 + 0.08,
      z + CV.ELEVATOR_L / 2 + 0.08,
    ];
  });
  return [island, ...elevators];
}
