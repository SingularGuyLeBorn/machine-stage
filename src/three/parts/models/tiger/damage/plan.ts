// ============================================================================
// damage/plan —— 战损破口的「随机规划」
//
// 每块装甲板不是固定一个洞：按当前 damageSeed 在安全范围内随机中心，
// 并在 3 种形态里选一种：
//   penetration：单穿孔（当前形态）
//   blast：大口径炸裂（更大的入口/出口翻卷）
//   double：主孔 + 邻近副孔
// seed=0 固定返回原始中心/单孔，保证测试与既有截图可复现。
// 几何 kit 与 VFX 热影响圈读同一份计划，避免贴花和洞错位。
// ============================================================================

export type DamagePlanKey = "front" | "roof" | "deck";
export type BreachKind = "penetration" | "blast" | "double";

export interface BreachPlan {
  kind: BreachKind;
  x: number;
  y: number;
  radius: number;
  /** 副孔（double）：位置/半径 */
  secondary?: { x: number; y: number; radius: number };
  /** 不规则轮廓的随机种子 */
  seed: number;
}

interface PlanBase {
  x: number;
  y: number;
  radius: number;
  seed: number;
  /** 随机中心的安全抖动范围（局部板坐标） */
  dx: number;
  dy: number;
  /** blast 的半径倍率 */
  blast: number;
  /** double 副孔离主孔的最大偏移 */
  secondary: number;
}

const BASE: Record<DamagePlanKey, PlanBase> = {
  // 首上：板面宽裕，允许前后/左右移动
  front: { x: 0.42, y: 0.12, radius: 0.2, seed: 11, dx: 0.16, dy: 0.13, blast: 1.45, secondary: 0.2 },
  // 顶甲板：靠近板边，收窄抖动，避免破口切出板外
  roof: { x: -1.35, y: 0.15, radius: 0.22, seed: 23, dx: 0.08, dy: 0.1, blast: 1.25, secondary: 0.15 },
  // 发动机舱盖：后缘余量最小
  deck: { x: 0.545, y: 0.35, radius: 0.19, seed: 37, dx: 0.03, dy: 0.12, blast: 1.15, secondary: 0.13 },
};

let currentSeed = 0;

/** 由状态层在重建前写入；kit 在装配时读取。 */
export function setDamageSeed(seed: number): void {
  currentSeed = Math.max(0, Math.floor(seed));
}

export function getDamageSeed(): number {
  return currentSeed;
}

function rand01(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function getDamagePlan(key: DamagePlanKey, seed = currentSeed): BreachPlan {
  const base = BASE[key];
  if (seed <= 0) {
    return { kind: "penetration", x: base.x, y: base.y, radius: base.radius, seed: base.seed };
  }
  const rand = rand01(seed * 2654435761 + base.seed * 97);
  const roll = rand();
  const kind: BreachKind = roll < 0.5 ? "penetration" : roll < 0.78 ? "blast" : "double";
  const x = base.x + (rand() * 2 - 1) * base.dx;
  const y = base.y + (rand() * 2 - 1) * base.dy;
  const scale = kind === "blast" ? base.blast : kind === "double" ? 0.9 : 1;
  const radius = base.radius * scale * (0.95 + rand() * 0.15);
  let secondary: BreachPlan["secondary"];
  if (kind === "double") {
    const angle = rand() * Math.PI * 2;
    const distance = (0.55 + rand() * 0.45) * base.secondary;
    secondary = {
      x: x + Math.cos(angle) * distance,
      y: y + Math.sin(angle) * distance,
      radius: radius * (0.34 + rand() * 0.1),
    };
  }
  return { kind, x, y, radius, secondary, seed: base.seed + seed * 37 };
}
