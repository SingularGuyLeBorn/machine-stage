import * as THREE from "three";
import type { AssembledModel } from "@/three/parts";

// ============================================================================
// models/guns7/cycle —— 七把枪共享的「射击循环数学」
//
// 动画是时间纯函数：同一 t 永远得到同一姿态，扫掠检测可复现。
// 自动机一律「慢启动 → 加速 → 过冲 → 回稳」，阻尼来自欠阻尼二阶响应，
// 不用匀速插值——枪机很快，但它有质量。
// ============================================================================

export type GunMode = "idle" | "semi" | "auto";

const modes = new Map<string, GunMode>();

export function setGunMode(gunId: string, mode: GunMode): void {
  modes.set(gunId, mode);
}

export function getGunMode(gunId: string): GunMode {
  return modes.get(gunId) ?? "idle";
}

export const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t);

export function seg(t: number, t0: number, t1: number): number {
  return clamp01((t - t0) / Math.max(t1 - t0, 1e-9));
}

export const ease = {
  inQuad: (t: number) => t * t,
  outQuad: (t: number) => t * (2 - t),
  inOutQuad: (t: number) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  inCubic: (t: number) => t * t * t,
  outCubic: (t: number) => 1 - (1 - t) ** 3,
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  inQuart: (t: number) => t ** 4,
  outQuart: (t: number) => 1 - (1 - t) ** 4,
  outQuint: (t: number) => 1 - (1 - t) ** 5,
  /** 过冲回弹：枪机复进到位 / 闭锁凸榫咬合 / 阻铁挂住击锤。 */
  outBack: (t: number, overshoot = 1.25) => {
    const c3 = overshoot + 1;
    return 1 + c3 * (t - 1) ** 3 + overshoot * (t - 1) ** 2;
  },
  /** 欠阻尼二阶响应：0 → 1，允许一次可见过冲。 */
  damped: (t: number, omega = 28, zeta = 0.34) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    const w = omega;
    return 1 - Math.exp(-zeta * w * t) * Math.cos(w * Math.sqrt(Math.max(0, 1 - zeta * zeta)) * t);
  },
  /** 快速衰减振荡（枪口上跳 / 弹壳弹跳）。 */
  ring: (t: number, omega = 44, decay = 12) => {
    if (t <= 0) return 0;
    return Math.exp(-decay * t) * Math.sin(omega * t);
  },
} as const;

/** 当前循环状态：第几发、循环内相位、已发射数。 */
export interface CycleClock {
  t: number;
  shotIndex: number;
  tau: number;
  shotsFired: number;
}

export function cycleClock(seconds: number, period: number, mode: GunMode, maxShots = Infinity): CycleClock {
  if (mode === "idle") return { t: -1, shotIndex: 0, tau: 0, shotsFired: 0 };
  const t = mode === "semi" ? Math.min(seconds, period * 0.999) : seconds;
  const shotIndex = Math.max(0, Math.floor(t / period));
  const tau = t - shotIndex * period;
  return { t, shotIndex, tau, shotsFired: Math.min(shotIndex, maxShots) };
}

/** 整枪后坐：沿 -Z + 枪口上跳，阻尼振荡。 */
export function recoilKick(tau: number, fireTime: number, strength = 1) {
  const u = seg(tau, fireTime, fireTime + 0.5);
  const body = ease.damped(u, 34, 0.36);
  const ring = ease.ring(Math.max(0, tau - fireTime), 52, 15);
  return {
    dz: -0.007 * strength * (body * 0.75 + ring * 0.35),
    pitch: -0.018 * strength * (body + ring * 0.5),
    lift: 0.0035 * strength * (body + ring * 0.5),
  };
}

// ---------------------------------------------------------------------------
// 抛壳 / 弹壳池
// ---------------------------------------------------------------------------

export interface BrassOptions {
  /** 弹壳池槽位（循环复用）。 */
  pool: number;
  /** 每发周期（秒）。 */
  period: number;
  /** 循环内抛壳时刻（秒）。 */
  ejectTime: number;
  /** 抛壳口位置（模型空间，含展示台高度）。 */
  port: THREE.Vector3;
  /** 抛壳主方向（+X 右 / -Y 下 / 等），会自动归一。 */
  throwDir: THREE.Vector3;
  /** 落地高度（模型空间）。 */
  floorY: number;
  /** 飞行时间（秒）。 */
  flightTime?: number;
  /** 落点散布半径。 */
  spread?: number;
  /** 落点相对枪口向前/后的偏移方向。 */
  forward?: THREE.Vector3;
}

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface BrassRest {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
}

/** 第 shot 发弹壳的静置位姿（绕抛壳口扇形散落、侧躺）。 */
export function brassRest(shot: number, options: BrassOptions): BrassRest {
  const rand = mulberry(0x51ed + shot * 2654435761);
  const dir = options.throwDir.clone().setY(0);
  if (dir.lengthSq() < 1e-8) dir.set(1, 0, 0);
  dir.normalize();
  const side = new THREE.Vector3(-dir.z, 0, dir.x);
  const forward = options.forward?.clone() ?? new THREE.Vector3(0, 0, 1);
  const spread = options.spread ?? 0.22;
  const dist = 0.04 + rand() * spread;
  const lateral = (rand() - 0.5) * spread * 1.2;
  const fwd = (rand() - 0.5) * spread * 0.8;
  const position = options.port
    .clone()
    .addScaledVector(dir, dist)
    .addScaledVector(side, lateral)
    .addScaledVector(forward, fwd);
  position.y = options.floorY;
  const quaternion = new THREE.Quaternion()
    .setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * Math.PI * 2)
    .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2))
    .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), rand() * Math.PI * 2));
  return { position, quaternion };
}

/** 弹壳飞行（u ∈ 0..1）：抛出 → 第一次触地 → 小跳 → 静止。 */
export function caseFlight(shot: number, u: number, options: BrassOptions, out: BrassRest): BrassRest {
  const rest = brassRest(shot, options);
  const uu = clamp01(u);
  const flightTime = options.flightTime ?? 0.5;
  const dir = options.throwDir.clone().normalize();
  const first = rest.position.clone().addScaledVector(dir, -0.035);
  if (uu < 0.62) {
    const s = uu / 0.62;
    const apex = options.port
      .clone()
      .lerp(first, 0.5)
      .add(new THREE.Vector3(0, Math.max(0.12, (options.port.y - options.floorY) * 0.42), 0))
      .addScaledVector(dir, 0.04);
    const a = (1 - s) * (1 - s);
    const b = 2 * (1 - s) * s;
    const c = s * s;
    out.position.set(
      a * options.port.x + b * apex.x + c * first.x,
      a * options.port.y + b * apex.y + c * first.y,
      a * options.port.z + b * apex.z + c * first.z,
    );
  } else {
    const s = (uu - 0.62) / 0.38;
    out.position.copy(first).addScaledVector(dir, 0.05 * s);
    out.position.y = options.floorY + 0.045 * Math.sin(Math.PI * s) * Math.max(0.2, 1 - s);
  }
  const tumble = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(1, 0.3, 0.15).normalize(),
    -uu * Math.PI * 2.4,
  );
  out.quaternion.copy(tumble).slerp(rest.quaternion, Math.min(1, uu * 1.6));
  void flightTime;
  return out;
}

const scratchRest: BrassRest = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() };
const scratchMatrix = new THREE.Matrix4();

/**
 * 更新弹壳池的实例矩阵。
 * shotsFired：已经击发的发数（含当前这发）；t：连续时钟（秒）。
 * 当前这发在 ejectTime 之前不交给池子（枪机还在抽壳）。
 */
export function updateBrassPool(
  assembled: AssembledModel,
  partId: string,
  shotsFired: number,
  t: number,
  options: BrassOptions,
): void {
  const handle = assembled.getPart(partId);
  if (!handle || !handle.instanced) return;
  const pool = Math.min(options.pool, handle.instances.length);
  for (let i = 0; i < handle.instances.length; i++) {
    let shot = i;
    let visible = false;
    if (i < pool) {
      while (shot + pool < shotsFired) shot += pool;
      if (shot < shotsFired) {
        const dt = t - (shot * options.period + options.ejectTime);
        if (dt >= 0) {
          visible = true;
          if (dt < (options.flightTime ?? 0.5)) {
            caseFlight(shot, dt / (options.flightTime ?? 0.5), options, scratchRest);
            scratchMatrix.compose(scratchRest.position, scratchRest.quaternion, new THREE.Vector3(1, 1, 1));
          } else {
            const rest = brassRest(shot, options);
            scratchMatrix.compose(rest.position, rest.quaternion, new THREE.Vector3(1, 1, 1));
          }
        }
      }
    }
    if (!visible) scratchMatrix.makeScale(0, 0, 0);
    handle.setInstanceMatrix(i, scratchMatrix);
  }
}

/** 曳光/弹头飞行：从枪口 + 曳光起点沿 +Z 飞，带重力下坠。 */
export function projectileMatrix(
  out: THREE.Matrix4,
  origin: THREE.Vector3,
  secondsSinceFire: number,
  speed: number,
  drop = 0.35,
): THREE.Matrix4 {
  const z = origin.z + Math.max(0, secondsSinceFire) * speed;
  const y = origin.y - drop * 9.81 * 0.5 * Math.max(0, secondsSinceFire) ** 2;
  out.makeTranslation(origin.x, y, z);
  return out;
}

/** 枪口焰缩放脉冲（两段：核心短、瓣长）。 */
export function flashPulse(tau: number, fireTime: number, duration = 0.06): number {
  const u = seg(tau, fireTime, fireTime + duration);
  return u > 0 && u < 1 ? Math.sin(Math.PI * u) : 0;
}

/** 硝烟：两三团慢扩散的球，线性衰减。 */
export function smokePulse(tau: number, fireTime: number, duration = 0.7): number {
  const u = seg(tau, fireTime, fireTime + duration);
  return u > 0 && u < 1 ? Math.sin(Math.PI * u) * (1 - u * 0.35) : 0;
}

/** 把零件实例矩阵设为隐藏（缩放 0）。 */
export function hideInstance(assembled: AssembledModel, partId: string, index: number): void {
  const handle = assembled.getPart(partId);
  if (!handle) return;
  handle.setInstanceMatrix(index, new THREE.Matrix4().makeScale(0, 0, 0));
}

/** 确保 fx 零件可见（StageCanvas 构建时把 tags: fx 默认隐藏了）。 */
export function showFxParts(assembled: AssembledModel, ids: readonly string[]): void {
  for (const id of ids) {
    const handle = assembled.getPart(id);
    if (handle) handle.object.visible = true;
  }
}

/** 枪械零件实例矩阵（无节点）便捷写入。 */
export function setInstance(
  assembled: AssembledModel,
  partId: string,
  index: number,
  x: number,
  y: number,
  z: number,
): void {
  const handle = assembled.getPart(partId);
  if (!handle) return;
  handle.setInstanceMatrix(index, scratchMatrix.makeTranslation(x, y, z));
}

/** 弹簧压缩：把一根沿 Z 的螺旋簧实例化，按 [z0,z1] 均匀铺开。 */
export function layoutSpringZ(
  assembled: AssembledModel,
  partId: string,
  z0: number,
  z1: number,
  centerX = 0,
  centerY = 0,
): void {
  const handle = assembled.getPart(partId);
  if (!handle) return;
  const count = handle.instances.length;
  for (let i = 0; i < count; i++) {
    const p = (i + 0.5) / count;
    handle.setInstanceMatrix(
      i,
      scratchMatrix.makeTranslation(centerX, centerY, z0 + (z1 - z0) * p),
    );
  }
}

/** 角度插值（弧度）：a→b 按 u 缓动。 */
export function angleLerp(a: number, b: number, u: number): number {
  return a + (b - a) * u;
}

export { THREE };
