import * as THREE from "three";
import { ease, seg } from "../guns/motionKit";
import { beltRoundPos, M855_OFFSET, BELT_PITCH, BELT_LINKS, BELT_Z0 } from "./belt";
import { M249_CONSTANTS } from "./constants";
import type { AssembledModel } from "@/three/parts";

// ============================================================================
// models/m249/motion —— M249 完整射击循环（导气式 + 弹链步进供弹）
//
// 相位（1.4s/发，约 430 发/分——M249 实际 700-1000，这里取可读值）：
//   0.00–0.06 击发：击锤→击针→底火→发射药燃
//   0.06–0.12 弹头出膛（枪口焰 + 曳光）
//   0.12–0.42 自动循环：燃气推活塞→枪机框后坐→回转开锁→抽壳→向下抛壳
//   0.42–0.72 复进：复进簧推回→拨弹齿/供弹滑板把弹链步进一节→推弹入膛
//   0.72–1.40 闭锁待击（下一发循环）
// ============================================================================

const PERIOD = 1.4;
const T_FIRE = 0.06;
const T_RECOIL0 = 0.1;
const T_RECOIL1 = 0.42;
const T_RETURN0 = 0.5;
const T_RETURN1 = 0.78;
const CARRIER_STROKE = 0.075;
const BOLT_LOCK_ANGLE = (30 * Math.PI) / 180;
const FEED_TRAVEL = 0.015; // 拨弹齿步进（一个节距）
const CHAMBER_Z = 0.023; // 膛内弹心位置
const MUZZLE_Z = 0.495;
const CASES = 12;
const SY = M249_CONSTANTS.STAGE_Y;
const HAMMER_COCK = -(65 * Math.PI) / 180;

/** 后坐层：整枪后坐位移+z 与上跳（随击发数累积）。 */
function recoilPose(tau: number): { dz: number; pitch: number } {
  const decay = Math.exp(-tau * 9);
  return { dz: 0.012 * Math.sin(Math.PI * Math.min(1, tau / 0.35)) * decay, pitch: 0 };
}

/** 枪机框行程（mm→m）：后坐 0.075，带阻尼起停。 */
function carrierTravel(tau: number): number {
  if (tau < T_RECOIL0) return 0;
  if (tau < T_RECOIL1) return CARRIER_STROKE * ease.inOutCubic(seg(tau, T_RECOIL0, T_RECOIL1));
  if (tau < T_RETURN0) return CARRIER_STROKE;
  if (tau < T_RETURN1) return CARRIER_STROKE * (1 - ease.inOutCubic(seg(tau, T_RETURN0, T_RETURN1)));
  return 0;
}

/** 回转闭锁角：闭锁 0 → 开锁 -30° → 复进回到 0。 */
function boltAngle(travel: number): number {
  const opening = Math.min(1, travel / 0.03);
  return -BOLT_LOCK_ANGLE * ease.inOutCubic(opening);
}

/** 确定性伪随机（mulberry32）：弹壳散落/弹跳用。 */
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

/** 弹壳池散布：从抛壳口斜下抛出，落地弹跳两下后静置。 */
export function brassPose(shot: number): { position: THREE.Vector3; quaternion: THREE.Quaternion } {
  const rand = mulberry(0x51f2 + shot * 977);
  const side = rand() < 0.35 ? 1 : -1;
  const vx = side * (0.25 + rand() * 0.3);
  const vz = -(0.3 + rand() * 0.35);
  const t = 0.55 + rand() * 0.2;
  const x = 0.02 + vx * t;
  const z = -0.05 + vz * t;
  const y = SY - 0.02 - 4.9 * t * t * 0.55;
  const floorY = 0.008;
  const finalY = Math.max(y, floorY);
  const quat = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(rand() * Math.PI * 2, rand() * Math.PI * 2, rand() * Math.PI * 2),
  );
  return { position: new THREE.Vector3(x, finalY, z), quaternion: quat };
}

/** 弹壳飞行（抛出口 → 池）。向下抛壳：y 掉、z 稍前。 */
const EJECT_ORIGIN = new THREE.Vector3(0.004, -0.012 + SY, -0.03);
const FLIGHT_END = 0.5;

function caseFlight(shot: number, u: number, out: { pos: THREE.Vector3; quat: THREE.Quaternion }): void {
  const rand = mulberry(0x77aa + shot * 613);
  const vx = (rand() - 0.5) * 0.5;
  const vy = -(0.5 + rand() * 0.5);
  const vz = -(0.2 + rand() * 0.4);
  const t = u * FLIGHT_END;
  out.pos.set(
    EJECT_ORIGIN.x + vx * t,
    EJECT_ORIGIN.y + vy * t - 4.9 * t * t * 0.5,
    EJECT_ORIGIN.z + vz * t,
  );
  out.quat.setFromEuler(new THREE.Euler(rand() * 8 * t, rand() * 8 * t, rand() * 8 * t));
}

/** 射击模式 holder。 */
let m249Mode: "auto" | "semi" | "idle" = "idle";
export function setM249Mode(mode: "auto" | "semi" | "idle"): void {
  m249Mode = mode;
}
export function getM249Mode(): "auto" | "semi" | "idle" {
  return m249Mode;
}

export function animateM249(assembled: AssembledModel, seconds: number, mode: "auto" | "semi" | "idle" = "auto"): void {
  const carrier = assembled.getNode("AkCarrier");
  const bolt = assembled.getNode("AkBolt");
  const hammer = assembled.getNode("AkHammer");
  const trigger = assembled.getNode("AkTrigger");
  const recoil = assembled.getNode("AkRecoil");
  const pawl = assembled.getNode("AkFeedPawl");
  const slider = assembled.getNode("AkFeedSlider");

  const t = mode === "idle" ? -1 : mode === "semi" ? Math.min(seconds, PERIOD * 0.999) : seconds;
  const shotIndex = t < 0 ? 0 : Math.max(0, Math.floor(t / PERIOD));
  const tau = t < 0 ? 0 : t - shotIndex * PERIOD;
  const fired = Math.min(shotIndex, BELT_LINKS);

  // ---- 后坐层 ----
  const kick = recoilPose(tau);
  if (recoil) {
    recoil.position.z = kick.dz;
  }

  // ---- 枪机框 / 枪机 ----
  const travel = carrierTravel(tau);
  if (carrier) carrier.position.z = -travel;
  if (bolt) bolt.rotation.z = boltAngle(travel);

  // ---- 击锤 ----
  if (hammer) {
    let angle = HAMMER_COCK;
    if (tau >= 0.02 && tau < T_FIRE) angle = HAMMER_COCK * (1 - ease.inCubic(seg(tau, 0.02, T_FIRE)));
    else if (tau >= T_FIRE && tau < 0.4) angle = 0;
    else if (tau >= 0.4 && tau < 0.6) angle = HAMMER_COCK * ease.inOutCubic(seg(tau, 0.4, 0.6));
    hammer.rotation.x = angle;
  }
  // ---- 扳机（随击发周期性扣引）----
  if (trigger) {
    const pull = tau < 0.8 ? 0.12 * Math.sin(Math.PI * Math.min(1, seg(tau, 0, 0.06) * 10)) : 0;
    trigger.rotation.x = pull;
  }

  // ---- 拨弹齿 / 供弹滑板：复进段把一个节距的弹链步进到位 ----
  const feed = ease.inOutCubic(seg(tau, T_RETURN0, T_RETURN1));
  if (pawl) pawl.position.z = feed * FEED_TRAVEL;
  if (slider) slider.position.z = carrierTravel(tau) > 0.01 ? -0.008 : feed * FEED_TRAVEL;

  // ---- 弹链：整体随时间前移一个节距（fired 发后链前进 fired×pitch）----
  const beltShift = (tau >= T_RETURN0 ? feed : 0) * BELT_PITCH + fired * BELT_PITCH;
  const link = assembled.getPart("m249.belt.link");
  const matrix = new THREE.Matrix4();
  if (link) {
    for (let i = 0; i < link.instances.length; i++) {
      const total = i + fired; // 链是循环带：已打掉的节让位给后面的
      const idx = total % (BELT_LINKS + 2);
      const z = BELT_Z0 - (idx - 2) * BELT_PITCH + beltShift;
      matrix.makeTranslation(0, 0.019 - 0.0075 + SY, z);
      link.setInstanceMatrix(i, matrix);
    }
  }

  // ---- 链上弹：最前一发被推进膛（fired 后所有弹前移）----
  const roundParts = [
    { id: "m249.belt.case", offset: 0 },
    { id: "m249.belt.propellant", offset: 0.023 },
    { id: "m249.belt.bullet", offset: 0.043 },
    { id: "m249.belt.core_lead", offset: 0.0415 },
    { id: "m249.belt.core_steel", offset: 0.036 },
  ];
  // 第 0 发（当前处于抱弹口的那发）单独驱动：从托盘被推入膛
  const pending = fired; // 即将进膛的是链上第 fired 发
  for (const { id, offset } of roundParts) {
    const handle = assembled.getPart(id);
    if (!handle) continue;
    for (let i = 0; i < handle.instances.length; i++) {
      let visible = true;
      let m: THREE.Matrix4;
      if (i === pending) {
        // 被推进膛：从抱弹口（BELT_Z0）直线推到膛内（CHAMBER_Z），高度从托盘升到轴线
        const p = tau >= T_RETURN0 ? ease.inOutCubic(seg(tau, T_RETURN0, T_RETURN1)) : 0;
        const z = BELT_Z0 + (CHAMBER_Z - BELT_Z0) * p + beltShift * 0;
        const y = (0.019 + (0 - 0.019) * p) + SY;
        m = new THREE.Matrix4().makeTranslation(0, y, z + offset);
      } else if (i < pending) {
        // 已击发：弹头飞离/弹壳下抛——由弹壳池与飞行另行表达，本体隐藏
        visible = false;
        m = new THREE.Matrix4();
      } else {
        // 其余在链：随链前移
        const z = BELT_Z0 - (i - pending) * BELT_PITCH + beltShift;
        const y = 0.019 + SY;
        m = new THREE.Matrix4().makeTranslation(0, y, z + offset);
      }
      if (!visible) m = new THREE.Matrix4().makeScale(0, 0, 0);
      handle.setInstanceMatrix(i, m);
    }
  }

  // ---- 弹头出膛（曳光 + 抛物线下坠）----
  const bullet = assembled.getPart("m249.belt.bullet");
  if (bullet && tau > T_FIRE && tau < T_FIRE + 0.7) {
    const dt = tau - T_FIRE;
    const z = MUZZLE_Z + dt * 3.0;
    const y = SY - 4.9 * dt * dt * 0.3;
    matrix.makeTranslation(0, y, z);
    bullet.setInstanceMatrix(pending, matrix);
  }

  // ---- 弹壳池：抛出 → 飞行 → 堆积（12 槽循环）----
  const brass = assembled.getPart("m249.fx.brass");
  if (brass) {
    for (let i = 0; i < brass.instances.length; i++) {
      let shot = i;
      while (shot + CASES <= fired) shot += CASES;
      if (t < 0 || fired < shot) {
        matrix.makeScale(0, 0, 0);
      } else {
        const dt = t - shot * PERIOD - 0.14;
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

/** motionParts：由 animate 直接改写实例矩阵的零件（pose 层爆炸据此取本帧位姿）。 */
export const M249_MOTION_PARTS = [
  "m249.belt.link",
  "m249.belt.case",
  "m249.belt.bullet",
  "m249.belt.core_lead",
  "m249.belt.core_steel",
  "m249.belt.propellant",
  "m249.fx.brass",
];

// 供 belt.ts 之外复用（避免循环导入的类型逃逸）
export { beltRoundPos, M855_OFFSET };
