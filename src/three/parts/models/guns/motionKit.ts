import * as THREE from "three";

// ============================================================================
// models/guns/motionKit —— 射击循环共享运动学
//
// 设计口径（四把枪共用）：
//   1. 动画是「时间的纯函数」：pose(t, mode) 不依赖外部状态。扫掠检测
//      （30fps × 3s 逐帧 applyPose）因此可复现，enter/leave 状态也不会
//      把模型留在一个Intermediate位姿上。
//   2. 一切运动「慢启动 → 加速 → 减速 → 过冲回弹」：easeOutBack/overshoot
//      系列；枪械机构快但有惯性，不用匀速直线。
//   3. 弹药 / 弹壳 / 弹丸全部是实例件，动画写实例矩阵；枪身挂在节点上。
// ============================================================================

/** 缓动集合（t ∈ [0,1]）。 */
export const ease = {
  inQuad: (t: number) => t * t,
  outQuad: (t: number) => t * (2 - t),
  inOutQuad: (t: number) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  inCubic: (t: number) => t * t * t,
  outCubic: (t: number) => 1 - (1 - t) ** 3,
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  /** 加速冲出：自动机后坐/复进（先慢后快再缓，带惯性）。 */
  outQuint: (t: number) => 1 - (1 - t) ** 5,
  /** 过冲回弹（过冲 ~10% 后弹回）：枪机复进到位、阻铁挂住击锤。 */
  outBack: (t: number, overshoot = 1.4) => {
    const c3 = overshoot + 1;
    return 1 + c3 * (t - 1) ** 3 + overshoot * (t - 1) ** 2;
  },
  /** 快速衰减振荡（后坐力消散、弹壳落地）。 */
  damped: (t: number, omega = 26, zeta = 0.32) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    const w = omega;
    return 1 - Math.exp(-zeta * w * t) * Math.cos(w * Math.sqrt(1 - zeta * zeta) * t);
  },
} as const;

export function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/** 子相位进度：把 [t0, t1] 归一化到 0..1（区间外为 0 或 1）。 */
export function seg(t: number, t0: number, t1: number): number {
  return clamp01((t - t0) / Math.max(t1 - t0, 1e-9));
}

/** 弹道：p = p0 + v0·t + ½·g·t²（v 为三维速度，g 取 [0, -9.81, 0]）。 */
const GRAVITY = new THREE.Vector3(0, -9.81, 0);

export function ballistic(
  out: THREE.Vector3,
  origin: THREE.Vector3,
  velocity: THREE.Vector3,
  t: number,
): THREE.Vector3 {
  return out
    .copy(origin)
    .addScaledVector(velocity, t)
    .addScaledVector(GRAVITY, 0.5 * t * t);
}

/** 弹道速度（给起点/终点求初速，水平抛物线）。 */
export function ballisticVelocity(
  out: THREE.Vector3,
  from: THREE.Vector3,
  to: THREE.Vector3,
  flightTime: number,
): THREE.Vector3 {
  out.set(
    (to.x - from.x) / flightTime,
    (to.y - from.y) / flightTime + 0.5 * 9.81 * flightTime,
    (to.z - from.z) / flightTime,
  );
  return out;
}

/** 确定性伪随机（mulberry32 同源；每个实例一个种子 → 可复现）。 */
export function seededRandom(seed: number): () => number {
  let value = seed | 0;
  return () => {
    value |= 0;
    value = (value + 0x6d2b79f5) | 0;
    let t = Math.imul(value ^ (value >>> 15), 1 | value);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 池化槽位映射：第 shot 发占用 slot = shot % pool。 */
export function poolSlot(shot: number, pool: number): number {
  return ((shot % pool) + pool) % pool;
}

/** 藏起（缩放归零 = 不渲染，但不动 visibility，构建滑杆的显隐仍然有效）。 */
export function hideMatrix(out: THREE.Matrix4): THREE.Matrix4 {
  return out.makeScale(0, 0, 0);
}

/**
 * 绕任意中心旋转（模型空间）：先把中心平到原点、旋转、再平移回去。
 * 用于「枪机绕闭锁凸笋轴回转」这类必须以局部特征点为轴的姿态改写。
 */
export function rotateAround(
  out: THREE.Matrix4,
  base: THREE.Matrix4,
  center: THREE.Vector3,
  axis: THREE.Vector3,
  angle: number,
): THREE.Matrix4 {
  const offset = new THREE.Vector3().subVectors(center, new THREE.Vector3().setFromMatrixPosition(base));
  const translateTo = new THREE.Matrix4().makeTranslation(-offset.x, -offset.y, -offset.z);
  const rotate = new THREE.Matrix4().makeRotationAxis(axis, angle);
  const translateBack = new THREE.Matrix4().makeTranslation(offset.x, offset.y, offset.z);
  // 组合：T_back · R · T_to · base
  return out.multiplyMatrices(translateBack, rotate).multiply(translateTo).multiply(base);
}

/** 沿模型空间平移叠加在位姿上（实例矩阵 = 平移 · base）。 */
export function translateBy(out: THREE.Matrix4, base: THREE.Matrix4, dx: number, dy: number, dz: number): THREE.Matrix4 {
  const t = new THREE.Matrix4().makeTranslation(dx, dy, dz);
  return out.multiplyMatrices(t, base);
}

/**
 * 弹壳落地弹跳模型：抛出 → 首次触地 → 1~2 次衰减弹跳 → 静止侧躺。
 * 返回 [x, y, z] 落地静位 + 滚动朝向（绕自身轴的随机角）。
 * pure(t) 由调用方按弹道使用；这里给「已静置」的最终位姿。
 */
export interface BrassRestPose {
  position: THREE.Vector3;
  /** 绕弹壳轴（局部 Y）的滚动角（rad）。 */
  roll: number;
}

/** 第 shot 发弹壳的静置位姿：围绕抛壳窗下方的扇形区域确定性散落。 */
export function brassRestPose(
  shot: number,
  portPosition: THREE.Vector3,
  dirRight: THREE.Vector3,
  dirForward: THREE.Vector3,
  options: { minR?: number; maxR?: number; floorY?: number; jitter?: number } = {},
): BrassRestPose {
  const rand = seededRandom(0x9e37 + shot * 2654435761);
  const minR = options.minR ?? 0.05;
  const maxR = options.maxR ?? 0.42;
  const angle = (rand() - 0.5) * 1.5; // 抛壳扇面 ±43°
  const dist = minR + rand() * (maxR - minR);
  const lateral = Math.sin(angle) * dist;
  const forward = Math.cos(angle) * dist * 0.8;
  const position = new THREE.Vector3()
    .copy(portPosition)
    .addScaledVector(dirRight, lateral)
    .addScaledVector(dirForward, forward);
  position.y = options.floorY ?? portPosition.y - 0.5;
  return { position, roll: rand() * Math.PI * 2 };
}

/** 射击循环相位表（秒）：导气式通用节奏；后坐/转管式在各自 motion 里覆盖。 */
export interface CyclePhase {
  /** 扳机拉动。 */
  trigger: [number, number];
  /** 击锤打击击针。 */
  hammer: [number, number];
  /** 击发瞬间（弹头出膛 / 枪口焰 / 后坐开始）。 */
  fire: number;
  /** 自动机后坐（导气推动 / 枪管后坐）。 */
  recoil: [number, number];
  /** 复进（供弹 + 闭锁）。 */
  return: [number, number];
  /** 整发循环长度。 */
  period: number;
}

/** 导气式节奏（AK-47 / M249 视觉节奏：比真实 600rpm 慢 ~3 倍以便观察机构）。 */
export const GAS_CYCLE: CyclePhase = {
  trigger: [0, 0.05],
  hammer: [0.05, 0.1],
  fire: 0.1,
  recoil: [0.14, 0.52],
  return: [0.6, 1.02],
  period: 1.8,
};

/** 当前处于第几发循环（t 从 entryTime 起算，已扣除装填好的首发）。 */
export function cycleIndexOf(t: number, period: number): number {
  return Math.max(0, Math.floor(t / period));
}
