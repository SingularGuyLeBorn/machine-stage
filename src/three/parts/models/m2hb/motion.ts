import * as THREE from "three";
import { ease, seg } from "../guns/motionKit";
import { beltRoundPos, M2_OFFSET, BELT_PITCH, BELT_LINKS, BELT_Z0 } from "./belt";
import { M2HB_CONSTANTS } from "./constants";
import type { AssembledModel } from "@/three/parts";

// ============================================================================
// models/m2hb/motion —— M2HB 完整射击循环（枪管短后坐 + 半自由枪机）
//
// 相位（2.2s/发，约 270 发/分）：
//   0.00–0.08 击发：枪机已在最前（开闩待击）→ 释放 → 撞针击底火
//   0.08–0.30 短后坐：**枪管+延伸部整体后坐 12mm**（闭锁环抱紧枪机）
//   0.30–0.45 加速传能：加速子摆臂下压 → 枪机获得 100mm 行程能量
//   0.45–0.95 枪机后坐 100mm：拉壳槽螺面带动撞针边退边抽壳（L 形退壳杠杆放大退壳力）
//   0.95–1.05 抛壳：空弹壳靠重力从枪身底部排出（无弹簧，重力掉落）
//   1.05–1.75 复进：复进簧推枪机回前 → 供弹杠杆组把 M9 链步进一节 → 推弹入膛
//   1.75–2.20 闭锁待击（下一发循环）
// ============================================================================

const PERIOD = 2.2;
const T_FIRE = 0.08;
const T_BARREL0 = 0.1;
const T_BARREL1 = 0.32;
const T_ACCEL = 0.42;
const T_BOLT0 = 0.42;
const T_BOLT1 = 0.95;
const T_RETURN0 = 1.05;
const T_RETURN1 = 1.75;
const BARREL_STROKE = 0.012;
const BOLT_STROKE = 0.1;
const CHAMBER_Z = 0.052; // 膛内弹心
const MUZZLE_Z = 0.85;
const CASES = 12;
const SY = M2HB_CONSTANTS.STAGE_Y;

/** 后坐层：整枪后坐（重机枪后坐猛，位移大）。 */
function recoilPose(tau: number): { dz: number } {
  const decay = Math.exp(-tau * 6);
  return { dz: 0.02 * Math.sin(Math.PI * Math.min(1, tau / 0.6)) * decay };
}

/** 枪管短后坐行程：0 → 12mm → 0（先于枪机启动）。 */
function barrelTravel(tau: number): number {
  if (tau < T_BARREL0) return 0;
  if (tau < T_BARREL1) return BARREL_STROKE * ease.inOutCubic(seg(tau, T_BARREL0, T_BARREL1));
  if (tau < T_RETURN0) return BARREL_STROKE;
  if (tau < T_RETURN1) return BARREL_STROKE * (1 - ease.inOutCubic(seg(tau, T_RETURN0, T_RETURN1)));
  return 0;
}

/** 枪机行程：加速子传能后才启动（半自由枪机的时序核心）。 */
function boltTravel(tau: number): number {
  if (tau < T_BOLT0) return 0;
  if (tau < T_BOLT1) return BOLT_STROKE * ease.inOutCubic(seg(tau, T_BOLT0, T_BOLT1));
  if (tau < T_RETURN0) return BOLT_STROKE;
  if (tau < T_RETURN1) return BOLT_STROKE * (1 - ease.inOutCubic(seg(tau, T_RETURN0, T_RETURN1)));
  return 0;
}

/** 确定性伪随机（mulberry32）：弹壳散落/弹跳。 */
function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 弹壳池散布：M2 空弹壳从枪身底部排出，落地弹跳后静置。 */
export function brassPose(shot: number): { position: THREE.Vector3; quaternion: THREE.Quaternion } {
  const rand = mulberry(0x2b50 + shot * 733);
  const vx = (rand() - 0.5) * 0.6;
  const vz = -(0.2 + rand() * 0.4);
  const t = 0.7 + rand() * 0.3;
  const x = vx * t - 0.01;
  const z = -0.2 + vz * t;
  const y = SY - 0.05 - 4.9 * t * t * 0.6;
  const finalY = Math.max(y, 0.01);
  const quat = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(rand() * Math.PI * 2, rand() * Math.PI * 2, rand() * Math.PI * 2),
  );
  return { position: new THREE.Vector3(x, finalY, z), quaternion: quat };
}

/** 弹壳排出（底部出口向下坠 + 弹跳）。 */
const EJECT_ORIGIN = new THREE.Vector3(0, -0.04 + SY, -0.16);
const FLIGHT_END = 0.7;

function caseFlight(shot: number, u: number, out: { pos: THREE.Vector3; quat: THREE.Quaternion }): void {
  const rand = mulberry(0x99cc + shot * 419);
  const vx = (rand() - 0.5) * 0.8;
  const vz = -(0.3 + rand() * 0.5);
  const t = u * FLIGHT_END;
  out.pos.set(
    EJECT_ORIGIN.x + vx * t,
    EJECT_ORIGIN.y + vz * t * 0.5 - 4.9 * t * t * 0.5,
    EJECT_ORIGIN.z + vz * t,
  );
  out.quat.setFromEuler(new THREE.Euler(rand() * 10 * t, rand() * 10 * t, rand() * 10 * t));
}

/** 射击模式 holder。 */
let m2hbMode: "auto" | "semi" | "idle" = "idle";
export function setM2hbMode(mode: "auto" | "semi" | "idle"): void {
  m2hbMode = mode;
}
export function getM2hbMode(): "auto" | "semi" | "idle" {
  return m2hbMode;
}

export function animateM2hb(
  assembled: AssembledModel,
  seconds: number,
  mode: "auto" | "semi" | "idle" = "auto",
): void {
  const recoil = assembled.getNode("M2Recoil");
  const barrel = assembled.getNode("M2Barrel");
  const bolt = assembled.getNode("M2Bolt");
  const accel = assembled.getNode("M2Accelerator");
  const pawl = assembled.getNode("M2FeedPawl");
  const trigger = assembled.getNode("M2Trigger");
  const teV = assembled.getNode("M2TEWheelV");
  const teH = assembled.getNode("M2TEWheelH");

  const t = mode === "idle" ? -1 : mode === "semi" ? Math.min(seconds, PERIOD * 0.999) : seconds;
  const shotIndex = t < 0 ? 0 : Math.max(0, Math.floor(t / PERIOD));
  const tau = t < 0 ? 0 : t - shotIndex * PERIOD;
  const fired = Math.min(shotIndex, BELT_LINKS);

  // ---- 后坐层 ----
  const kick = recoilPose(tau);
  if (recoil) recoil.position.z = kick.dz;

  // ---- 枪管短后坐 / 枪机后坐（半自由枪机的两级时序）----
  const bTravel = barrelTravel(tau);
  const qTravel = boltTravel(tau);
  if (barrel) barrel.position.z = -bTravel;
  if (bolt) bolt.position.z = -qTravel;

  // ---- 加速子摆臂：枪管后坐末段下压传能，枪机启动后回摆 ----
  if (accel) {
    const swing =
      tau < T_BARREL0 ? 0 : tau < T_ACCEL ? ease.inOutCubic(seg(tau, T_BARREL0, T_ACCEL)) : 1 - ease.inOutCubic(seg(tau, T_ACCEL, T_BOLT0 + 0.2));
    accel.rotation.x = swing * 0.5;
  }

  // ---- 拨弹齿：复进段步进一节（M9 链距 35mm）----
  const feed = ease.inOutCubic(seg(tau, T_RETURN0, T_RETURN1));
  if (pawl) pawl.position.z = feed * BELT_PITCH;

  // ---- 扳机：随击发周期性拍压（M2 用掌根拍）----
  if (trigger) {
    trigger.rotation.x = tau < 0.85 ? 0.15 * Math.sin(Math.PI * Math.min(1, seg(tau, 0, 0.08) * 8)) : 0;
  }

  // ---- T&E 手轮：慢速演示转动（50 密位/点击的刻度感）----
  if (teV && t >= 0) teV.rotation.x = Math.sin(t * 0.4) * 0.3;
  if (teH && t >= 0) teH.rotation.y = Math.sin(t * 0.3) * 0.4;

  // ---- 弹链：每发整体前移一节（循环带：打掉的节让位给后链）----
  const beltShift = feed * BELT_PITCH + fired * BELT_PITCH;
  const link = assembled.getPart("m2hb.belt.link");
  const matrix = new THREE.Matrix4();
  if (link) {
    for (let i = 0; i < link.instances.length; i++) {
      const total = i + fired;
      const idx = total % (BELT_LINKS + 2);
      const z = BELT_Z0 - (idx - 2) * BELT_PITCH + beltShift;
      matrix.makeTranslation(0, 0.026 - 0.009 + SY, z);
      link.setInstanceMatrix(i, matrix);
    }
  }

  // ---- 链上弹：第 fired 发被推进膛，其余随链前移 ----
  const roundParts = [
    { id: "m2hb.belt.case", offset: 0 },
    { id: "m2hb.belt.propellant", offset: 0.036 },
    { id: "m2hb.belt.bullet", offset: 0.079 },
    { id: "m2hb.belt.core_lead", offset: 0.077 },
    { id: "m2hb.belt.core_steel", offset: 0.068 },
  ];
  const pending = fired;
  for (const { id, offset } of roundParts) {
    const handle = assembled.getPart(id);
    if (!handle) continue;
    for (let i = 0; i < handle.instances.length; i++) {
      let visible = true;
      let m: THREE.Matrix4;
      if (i === pending) {
        // 被推进膛：从抱弹口直线推到膛内，高度从供弹通道升到轴线
        const p = tau >= T_RETURN0 ? ease.inOutCubic(seg(tau, T_RETURN0, T_RETURN1)) : 0;
        const z = BELT_Z0 + (CHAMBER_Z - BELT_Z0) * p;
        const y = 0.026 + (0 - 0.026) * p + SY;
        m = new THREE.Matrix4().makeTranslation(0, y, z + offset);
      } else if (i < pending) {
        visible = false;
        m = new THREE.Matrix4();
      } else {
        const z = BELT_Z0 - (i - pending) * BELT_PITCH + beltShift;
        const y = 0.026 + SY;
        m = new THREE.Matrix4().makeTranslation(0, y, z + offset);
      }
      if (!visible) m = new THREE.Matrix4().makeScale(0, 0, 0);
      handle.setInstanceMatrix(i, m);
    }
  }

  // ---- 弹头出膛（曳光 + 下坠）----
  const bullet = assembled.getPart("m2hb.belt.bullet");
  if (bullet && tau > T_FIRE && tau < T_FIRE + 0.9) {
    const dt = tau - T_FIRE;
    const z = MUZZLE_Z + dt * 3.2;
    const y = SY - 4.9 * dt * dt * 0.25;
    matrix.makeTranslation(0, y, z);
    bullet.setInstanceMatrix(pending, matrix);
  }

  // ---- 弹壳池：弹出 → 坠落 → 堆积（12 槽循环）----
  const brass = assembled.getPart("m2hb.fx.brass");
  if (brass) {
    for (let i = 0; i < brass.instances.length; i++) {
      let shot = i;
      while (shot + CASES <= fired) shot += CASES;
      if (t < 0 || fired < shot) {
        matrix.makeScale(0, 0, 0);
      } else {
        const dt = t - shot * PERIOD - 0.95;
        if (dt < 0) matrix.makeScale(0, 0, 0);
        else if (dt < FLIGHT_END) {
          const out = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() };
          caseFlight(shot, dt / FLIGHT_END, out);
          matrix.compose(out.pos, out.quat, new THREE.Vector3(1, 1, 1));
        } else {
          const { position, quaternion } = brassPose(shot);
          matrix.compose(position, quaternion, new THREE.Vector3(1, 1, 1));
        }
      }
      brass.setInstanceMatrix(i, matrix);
    }
  }
}

/** motionParts：由 animate 直接改写实例矩阵的零件。 */
export const M2HB_MOTION_PARTS = [
  "m2hb.belt.link",
  "m2hb.belt.case",
  "m2hb.belt.bullet",
  "m2hb.belt.core_lead",
  "m2hb.belt.core_steel",
  "m2hb.belt.propellant",
  "m2hb.fx.brass",
];

export { beltRoundPos, M2_OFFSET };
