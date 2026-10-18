import * as THREE from "three";

// ============================================================================
// models/tiger/engine/kinematics —— HL230 曲柄连杆机构运动学（求解器）
//
// 这是 M-B 的「真实数字」来源：曲轴转角 → 活塞销位置 → 连杆摆角。
// 动画（animate.ts）与读数（readouts）都只调用这里，不在别处重复公式。
//
// 坐标系（发动机局部系，与注册表 constants 同源）：
//   +X = 曲轴轴向（前端 / 皮带轮侧）      +Y = 上      +Z = 右侧
//   曲轴轴线 = X 轴；两列缸围绕 X 轴各倾斜 ±HALF_V（60° 夹角 → 各 30°）
//
// 公式（标准曲柄连杆机构）：
//   令 φ = 曲柄相对该列缸轴线的转角，r = 曲柄半径，l = 连杆中心距
//   活塞销沿缸轴线的距离      s(φ) = r·cosφ + √(l² − r²sin²φ)
//   连杆方向（相对缸轴线）    ψ − β = −asin((r/l)·sinφ)
//   φ = 0 为 TDC（上止点），φ = π 为 BDC（下止点）
//
// 规格出处：Maybach HL230 P45 —— 缸径 130mm × 行程 145mm、12 缸、排量 23095cc、
//   压缩比 6.8:1、700PS @ 3000rpm、1850N·m @ 2100rpm、干重 1200kg、
//   外形 1000×1190×1310mm、SOHC、隧道式曲轴、四台 Solex 52JFF 双喉化油器、两台磁电机。
//   （Wikipedia "Maybach HL230" / Jentz & Doyle《Germany's Tiger Tanks》近似值）
// ============================================================================

export interface CrankTrainGeometry {
  /** 曲柄半径（= 行程 / 2，米）。 */
  crankR: number;
  /** 连杆中心距（大端中心 → 小端中心，米）。 */
  rodLength: number;
  /** 每列缸轴线相对竖直方向的倾角（度）：-30 为左列，+30 为右列。 */
  bankAngleDeg: number;
}

/** 曲轴转角（弧度）：ω = 2π·rpm/60，t 为秒。 */
export function crankAngleAt(seconds: number, rpm: number): number {
  return seconds * (rpm / 60) * Math.PI * 2;
}

/** 曲柄销相位：6 个曲柄销沿圆周每 60° 一个（60° V12 等间隔点火）。 */
export function pinPhaseRad(pinIndex: number, phaseStepDeg = 60): number {
  return THREE.MathUtils.degToRad(pinIndex * phaseStepDeg);
}

/** 活塞销沿缸轴线的距离（米）：φ = 曲柄相对缸轴线的转角。s(φ) = r·cosφ + √(l² − r²sin²φ)。 */
export function pistonPinTravel(
  phi: number,
  geometry: Pick<CrankTrainGeometry, "crankR" | "rodLength">,
): number {
  const { crankR: r, rodLength: l } = geometry;
  return r * Math.cos(phi) + Math.sqrt(Math.max(l * l - (r * Math.sin(phi)) ** 2, 1e-12));
}

/** 连杆摆角（弧度，相对 +Y 向 +Z 为正）：ψ = β − asin((r/l)·sinφ)。 */
export function rodSwingRad(phi: number, geometry: CrankTrainGeometry): number {
  const { crankR: r, rodLength: l, bankAngleDeg } = geometry;
  const beta = THREE.MathUtils.degToRad(bankAngleDeg);
  return beta - Math.asin(THREE.MathUtils.clamp((r / l) * Math.sin(phi), -1, 1));
}

/** 缸轴线单位向量（在 YZ 平面内，从曲轴轴线指向缸盖方向）。 */
export function bankAxis(bankAngleDeg: number): THREE.Vector3 {
  const beta = THREE.MathUtils.degToRad(bankAngleDeg);
  return new THREE.Vector3(0, Math.cos(beta), Math.sin(beta));
}

/** 曲柄销中心（发动机系，X 由调用方给出）。 */
export function crankPinCenter(
  x: number,
  pinAlpha: number,
  geometry: Pick<CrankTrainGeometry, "crankR">,
  target = new THREE.Vector3(),
): THREE.Vector3 {
  return target.set(x, geometry.crankR * Math.cos(pinAlpha), geometry.crankR * Math.sin(pinAlpha));
}

/** 活塞销中心（发动机系）：沿缸轴线 s 处。 */
export function pistonPinCenter(
  x: number,
  s: number,
  bankAngleDeg: number,
  target = new THREE.Vector3(),
): THREE.Vector3 {
  const axis = bankAxis(bankAngleDeg);
  return target.set(x, s * axis.y, s * axis.z);
}

/**
 * 单缸一次完整解算：曲柄销、活塞销、连杆摆角。
 * φ = pinAlpha − 缸轴线倾角。
 */
export interface CylinderPose {
  /** 曲柄相对该缸轴线的转角（弧度）。 */
  phi: number;
  /** 曲柄销中心（发动机系）。 */
  crankPin: THREE.Vector3;
  /** 活塞销中心（发动机系）。 */
  pistonPin: THREE.Vector3;
  /** 活塞销沿缸轴线的距离（米，从曲轴轴线量起）。 */
  travel: number;
  /** 连杆摆角（弧度）。 */
  rodSwing: number;
}

export function solveCylinder(
  x: number,
  pinAlpha: number,
  geometry: CrankTrainGeometry,
  target: CylinderPose = {
    phi: 0,
    crankPin: new THREE.Vector3(),
    pistonPin: new THREE.Vector3(),
    travel: 0,
    rodSwing: 0,
  },
): CylinderPose {
  const phi = pinAlpha - THREE.MathUtils.degToRad(geometry.bankAngleDeg);
  const travel = pistonPinTravel(phi, geometry);
  crankPinCenter(x, pinAlpha, geometry, target.crankPin);
  pistonPinCenter(x, travel, geometry.bankAngleDeg, target.pistonPin);
  target.phi = phi;
  target.travel = travel;
  target.rodSwing = rodSwingRad(phi, geometry);
  return target;
}

/**
 * 活塞瞬时速度（m/s）：s(φ) 对 φ 求导 × ω。
 *   ds/dφ = −r·sinφ − r²·sinφ·cosφ / √(l² − r²sin²φ)
 */
export function pistonSpeed(
  phi: number,
  omega: number,
  geometry: Pick<CrankTrainGeometry, "crankR" | "rodLength">,
): number {
  const { crankR: r, rodLength: l } = geometry;
  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);
  const root = Math.sqrt(Math.max(l * l - (r * sinPhi) ** 2, 1e-12));
  return -omega * (r * sinPhi + (r * r * sinPhi * cosPhi) / root);
}

/** 活塞平均速度（m/s）：2·行程·(rpm/60)。 */
export function meanPistonSpeed(rpm: number, stroke: number): number {
  return (2 * stroke * rpm) / 60;
}

/** 排量（升）：π/4·缸径²·行程·缸数。 */
export function displacementLitres(bore: number, stroke: number, cylinders: number): number {
  return (Math.PI / 4) * bore * bore * stroke * cylinders * 1000;
}

/** 皮带传动比 → 被动轮转速。rDriven > rDriving 时被动轮更慢。 */
export function beltDrivenRpm(rpm: number, rDriving: number, rDriven: number): number {
  return (rpm * rDriving) / rDriven;
}

/** 凸轮轴转速 = 曲轴转速 / 2（四冲程）。 */
export function camshaftRpm(rpm: number): number {
  return rpm / 2;
}

export interface BeltGeometryResult {
  /** 皮带中线长度（米）。 */
  centerlineLength: number;
  /** 切线直线段长度（米）。 */
  tangentLength: number;
  /** 切线相对中心连线的夹角（弧度）。 */
  psi: number;
  /** 主动轮包角（弧度）。 */
  wrapDriving: number;
  /** 被动轮包角（弧度）。 */
  wrapDriven: number;
}

/**
 * 开口皮带（外切）几何：两轮中心距 d，半径 r1 / r2（r1 为主动轮）。
 * 中线长度 L = 2·√(d² − (r2−r1)²) + r1·(π + 2ψ) + r2·(π − 2ψ)，ψ = asin((r2−r1)/d)。
 * 皮带几何（kits.beltLoop）与读数都调用此函数，保证「图上画的」与「读数写的」同源。
 */
export function beltGeometry(rDriving: number, rDriven: number, centerDistance: number): BeltGeometryResult {
  const d = Math.max(centerDistance, Math.abs(rDriven - rDriving) + 1e-6);
  const psi = Math.asin(THREE.MathUtils.clamp((rDriven - rDriving) / d, -1, 1));
  const tangentLength = Math.sqrt(Math.max(d * d - (rDriven - rDriving) ** 2, 1e-12));
  const wrapDriving = Math.PI + 2 * psi;
  const wrapDriven = Math.PI - 2 * psi;
  return {
    centerlineLength: 2 * tangentLength + rDriving * wrapDriving + rDriven * wrapDriven,
    tangentLength,
    psi,
    wrapDriving,
    wrapDriven,
  };
}
