import * as THREE from "three";
import { MBT } from "../constants";

// ============================================================================
// models/mbt/engine/kinematics —— MBT-90 V12 柴油机曲柄连杆 / 配气运动学
//
// 发动机局部坐标（+X = 曲轴轴向 / 车体右侧，+Y 上，+Z 车头）：
//   V 角 90°，每列 6 缸，缸心距 160mm；曲柄销 6 个每 60° 一个。
//   缸号 1..12：奇数 = 左列（β = -45°），偶数 = 右列（β = +45°）。
//   曲柄角 φ = pinAlpha - β；活塞销沿缸轴距离 s(φ) = r·cosφ + √(l² − r²sin²φ)。
// 整机安装：ENGINE_Y / ENGINE_Z 为曲轴中心在车体坐标中的位置。
// ============================================================================

export const V12 = {
  HALF_V: 45,
  CYL_X1: 0.4,
  CYL_PITCH: 0.16,
  PIN_COUNT: 6,
  BORE: 0.145,
  STROKE: 0.16,
  CRANK_R: 0.08,
  ROD_L: 0.335,
  LINER_BOTTOM: 0.18,
  LINER_TOP: 0.465,
  PISTON_R: 0.0721,
  PISTON_CROWN: 0.043,
  PISTON_SKIRT: 0.056,
  RING_Y: [0.038, 0.024, 0.01],
  RING_R_OUT: 0.0722,
  RING_R_IN: 0.0694,
  RING_H: 0.004,
  PIN_R: 0.019,
  PIN_LEN: 0.07,
  ROD_BIG_R: 0.052,
  ROD_BIG_BORE: 0.0305,
  ROD_SMALL_R: 0.027,
  ROD_SMALL_BORE: 0.0192,
  CAM_BASE: 0.67,
  CAM_LATERAL: 0.0,
  ROCKER_Y: 0.62,
  ROCKER_LATERAL: 0.075,
  PUSHROD_LATERAL: 0.098,
  VALVE_LATERAL: 0.036,
  VALVE_SEAT_Y: 0.485,
  VALVE_LIFT: 0.01,
  VALVE_DISC_R: 0.026,
  VALVE_STEM_R: 0.007,
  VALVE_STEM_LEN: 0.115,
  SPRING_BASE_Y: 0.49,
  SPRING_FREE: 0.075,
  INJECTOR_Y: 0.57,
  RATED_RPM: 2600,
  IDLE_RPM: 620,
  RATED_POWER_PS: 1500,
  RATED_TORQUE: 4700,
  DISPLACEMENT_L: 47.6,
} as const;

const TAU = Math.PI * 2;
const RAD = Math.PI / 180;

/** 缸号（0-based）→ 曲柄销 / 列别 / 缸心 X / 列倾角。 */
export function cylinderInfo(index: number): {
  ordinal: number;
  pin: number;
  side: 1 | -1;
  betaDeg: number;
  x: number;
} {
  const ordinal = index + 1;
  const pin = Math.floor(index / 2);
  const side: 1 | -1 = ordinal % 2 === 1 ? -1 : 1;
  return {
    ordinal,
    pin,
    side,
    betaDeg: side * V12.HALF_V,
    x: V12.CYL_X1 - pin * V12.CYL_PITCH,
  };
}

/** 发动机局部点 → 车体坐标。 */
export function enginePoint(local: [number, number, number]): [number, number, number] {
  return [local[0], MBT.ENGINE_Y + local[1], MBT.ENGINE_Z + local[2]];
}

/** 缸列单位轴（发动机局部系）。 */
export function bankAxis(betaDeg: number): THREE.Vector3 {
  const beta = betaDeg * RAD;
  return new THREE.Vector3(0, Math.cos(beta), Math.sin(beta));
}

/** 曲柄转角（弧度）。 */
export function crankAngleAt(seconds: number, rpm: number): number {
  return seconds * (rpm / 60) * TAU;
}

/** 活塞销沿缸轴距离（米）。φ 为曲柄相对该缸轴线的转角。 */
export function pistonTravel(phi: number): number {
  const r = V12.CRANK_R;
  const l = V12.ROD_L;
  return r * Math.cos(phi) + Math.sqrt(Math.max(l * l - (r * Math.sin(phi)) ** 2, 1e-12));
}

export interface CylinderPose {
  pinAlpha: number;
  phi: number;
  travel: number;
  crankPin: THREE.Vector3;
  wristPin: THREE.Vector3;
  rodDir: THREE.Vector3;
}

/** 单缸解算（发动机局部系）。 */
export function solveCylinder(index: number, crankAngle: number): CylinderPose {
  const info = cylinderInfo(index);
  const pinAlpha = info.pin * (Math.PI / 3) + crankAngle;
  const phi = pinAlpha - info.betaDeg * RAD;
  const travel = pistonTravel(phi);
  const axis = bankAxis(info.betaDeg);
  const crankPin = new THREE.Vector3(
    info.x,
    V12.CRANK_R * Math.cos(pinAlpha),
    V12.CRANK_R * Math.sin(pinAlpha),
  );
  const wristPin = axis.clone().multiplyScalar(travel).setX(info.x);
  const rodDir = crankPin.clone().sub(wristPin).normalize();
  return { pinAlpha, phi, travel, crankPin, wristPin, rodDir };
}

/** 四冲程配气相位：曲轴转角 720° 一个循环。返回 0..1 升程系数。 */
export function valveLiftFactor(index: number, kind: "intake" | "exhaust", crankAngle: number): number {
  const info = cylinderInfo(index);
  const deg = (((crankAngle * 180) / Math.PI - info.pin * 60) % 720 + 720) % 720;
  // 进气：上止点前 12° 开，下止点后 40° 关（约 232°）；排气：下止点前 40° 开，上止点后 12° 关。
  const window = kind === "intake" ? { open: 348, close: 580 } : { open: 140, close: 372 };
  if (deg < window.open || deg > window.close) return 0;
  const u = (deg - window.open) / (window.close - window.open);
  return Math.sin(Math.PI * u);
}

/** 转速曲线：起动 → 怠速 → 运转（演示用，和 animate 的相位一致）。 */
export function engineRpmAt(seconds: number, state: string): number {
  if (state === "engine_start") {
    if (seconds < 0.9) return 0;
    if (seconds < 1.8) return 140 + (seconds - 0.9) * 220;
    if (seconds < 3.0) return 340 + (seconds - 1.8) * 90;
    return V12.IDLE_RPM;
  }
  if (state === "running" || state === "idle_running") return V12.IDLE_RPM;
  if (state === "drive" || state === "suspension") return 1100;
  if (state === "hunter_killer" || state === "loading" || state === "fire") return V12.IDLE_RPM;
  return 0;
}

/** 曲轴累计转角（含起动阶段的非匀速积分）。 */
export function crankAngleForTime(seconds: number, state: string): number {
  if (state === "engine_start") {
    const t2 = Math.max(0, Math.min(seconds, 1.8) - 0.9);
    const t3 = Math.max(0, Math.min(seconds, 3.0) - 1.8);
    const t4 = Math.max(0, seconds - 3.0);
    const a1 = 0;
    const a2 = a1 + TAU * (140 * t2 + 110 * t2 * t2) / 60;
    const a3 = a2 + TAU * (340 * t3 + 45 * t3 * t3) / 60;
    const a4 = a3 + TAU * (V12.IDLE_RPM / 60) * t4;
    return a4;
  }
  return crankAngleAt(seconds, engineRpmAt(seconds, state));
}

/** 活塞瞬时速度（m/s）。 */
export function pistonSpeed(phi: number, rpm: number): number {
  const r = V12.CRANK_R;
  const l = V12.ROD_L;
  const omega = (rpm / 60) * TAU;
  const sin = Math.sin(phi);
  const cos = Math.cos(phi);
  const root = Math.sqrt(Math.max(l * l - (r * sin) ** 2, 1e-12));
  return -omega * (r * sin + (r * r * sin * cos) / root);
}

/** 排量（升）。 */
export const DISPLACEMENT_LITRES =
  (Math.PI / 4) * V12.BORE * V12.BORE * V12.STROKE * 12 * 1000;
