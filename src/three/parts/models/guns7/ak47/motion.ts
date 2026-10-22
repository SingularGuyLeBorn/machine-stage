import * as THREE from "three";
import { ease, seg } from "../../guns/motionKit";
import { magRoundTransform, magSlotTransform, magRoundArc, AK47_CONSTANTS } from "./constants";
import type { AssembledModel } from "@/three/parts";

// ============================================================================
// models/ak47/motion —— AK-47 完整射击循环（导气式 + 枪机回转闭锁）
//
// 动画是「时间的纯函数」pose(t, mode)：不依赖跨帧状态，扫掠检测
// （30fps × 3s 逐帧 applyPose）因此可复现，切换状态也不会把模型留在
// 中间位姿上。
//
// 循环节奏（视觉放慢 ~3 倍；真实 AK 为 600 发/分 = 0.1s/发）：
//   0.00–0.05 扣扳机（10°）→ 阻铁解脱击锤
//   0.05–0.10 击锤回转 70° → 击针前冲 3mm
//   0.10      ★击发：弹头出膛（弹头与弹壳分离）+ 枪口焰 + 全枪后坐
//   0.14–0.52 导气自动机后坐 85mm：行程 6→30mm 间枪机回转 38° 开锁，
//             抽壳钩随枪机把弹壳抽出弹膛
//   ~0.39     弹壳底缘撞抛壳挺 → 抛出（抛物线 + 落地弹跳 + 侧躺堆积）
//   0.42–0.58 枪机框压过击锤 → 重新待击；0.52–0.60 后坐到底缓冲回弹
//   0.60–1.02 复进：推弹入膛（弹匣托弹板上抬）→ 末端回转闭锁（过冲回弹）
//   1.02–1.80 待击（扳机复位）
// ============================================================================

const SY = AK47_CONSTANTS.STAGE_Y; // root 空间的整枪高度（与实例布局同源）
const PERIOD = 1.8;
const T_FIRE = 0.1;
const T_RECOIL0 = 0.14;
const T_RECOIL1 = 0.52;
const T_RETURN0 = 0.6;
const T_RETURN1 = 1.02;
const CARRIER_STROKE = 0.085;
const LOCK_TRAVEL0 = 0.006;
const LOCK_TRAVEL1 = 0.03;
const BOLT_LOCK_ANGLE = (38 * Math.PI) / 180;
const STRIP_TRAVEL = 0.0615; // 枪机面追上弹底的行程
const CASES = 12; // 弹壳池槽位
const ROUNDS = 30;
const HAMMER_COCK = -(70 * Math.PI) / 180;
const TRIGGER_PULL = (10 * Math.PI) / 180;
const MUZZLE_Z = 0.467;
const FLIGHT_END = 0.85;
const FEED_Y = -0.016;

/** 后坐（整枪）：0.10 击发 → 阻尼衰减，末段轻微回弹。 */
function recoilPose(t: number) {
  const k = ease.damped(seg(t, T_FIRE, 0.45), 30, 0.34);
  const os = Math.exp(-14 * Math.max(0, t - T_FIRE)) * Math.sin(60 * (t - T_FIRE)) * 0.22;
  return { dz: -0.006 * (k + os), pitch: -0.02 * (k + os * 0.4) };
}

/** 枪机框行程（米，向后为正）。 */
function carrierTravel(t: number): number {
  if (t < T_RECOIL0) return 0;
  if (t < T_RECOIL1) return CARRIER_STROKE * ease.inOutCubic(seg(t, T_RECOIL0, T_RECOIL1));
  if (t < T_RETURN0) {
    const s = seg(t, T_RECOIL1, T_RETURN0);
    return CARRIER_STROKE - 0.004 * Math.sin(Math.PI * s);
  }
  if (t < T_RETURN1) return CARRIER_STROKE * (1 - ease.outBack(seg(t, T_RETURN0, T_RETURN1), 1.2));
  return 0;
}

/** 枪机回转角（开锁为负；行程 6→30mm 之间完成 38°）。 */
function boltAngle(travel: number): number {
  if (travel <= LOCK_TRAVEL0) return 0;
  if (travel >= LOCK_TRAVEL1) return -BOLT_LOCK_ANGLE;
  return -BOLT_LOCK_ANGLE * ease.inOutCubic((travel - LOCK_TRAVEL0) / (LOCK_TRAVEL1 - LOCK_TRAVEL0));
}

/** 抛壳时刻：行程到 STRIP_TRAVEL+12mm（弹壳完全脱离弹膛）对应 τ。 */
const EJECT_T = (() => {
  const target = STRIP_TRAVEL + 0.012;
  let lo = T_RECOIL0;
  let hi = T_RECOIL1;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (carrierTravel(mid) < target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
})();

// ---------------------------------------------------------------------------
// 弹壳飞行 / 静置（纯函数：扫掠可复现）
// ---------------------------------------------------------------------------
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

/** 第 shot 发弹壳的静置位姿：绕抛壳窗扇形散落 + 侧躺（绕自身轴滚转）。 */
export function brassPose(shot: number): { position: THREE.Vector3; quaternion: THREE.Quaternion } {
  const rand = mulberry(0x9e37 + shot * 2654435761);
  const angle = (rand() - 0.5) * 1.5;
  const dist = 0.07 + rand() * 0.38;
  const lateral = Math.sin(angle) * dist;
  const forward = Math.cos(angle) * dist * 0.7;
  const position = new THREE.Vector3(0.021 + lateral, 0.0045, -0.03 + forward);
  const dir = new THREE.Vector3(lateral, 0, forward).normalize();
  const quaternion = new THREE.Quaternion()
    .setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(dir.x, dir.z))
    .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2))
    .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), rand() * Math.PI * 2));
  return { position, quaternion };
}

const EJECT_ORIGIN = new THREE.Vector3(0.021, -0.028 + AK47_CONSTANTS.STAGE_Y, -0.03);

/** 弹壳从抛出到静置的连续飞行动画（u ∈ [0,1]）。 */
function caseFlight(shot: number, u: number, out: { pos: THREE.Vector3; quat: THREE.Quaternion }) {
  const { position, quaternion } = brassPose(shot);
  const hop = new THREE.Vector3(0.05, 0, 0.03);
  const first = position.clone().sub(hop);
  if (u < 0.55) {
    // 第一段：抛物线飞出抛壳窗（二次贝塞尔，中部上抛）
    const s = u / 0.55;
    const apex = EJECT_ORIGIN.clone().lerp(first, 0.5).add(new THREE.Vector3(0, 0.22, 0.02));
    const a = (1 - s) * (1 - s);
    const b = 2 * (1 - s) * s;
    const c = s * s;
    out.pos.set(
      a * EJECT_ORIGIN.x + b * apex.x + c * first.x,
      a * EJECT_ORIGIN.y + b * apex.y + c * first.y,
      a * EJECT_ORIGIN.z + b * apex.z + c * first.z,
    );
  } else {
    // 第二段：落地弹跳（前跳一小步 + 起落抛物线）
    const s = (u - 0.55) / 0.45;
    out.pos.copy(first).addScaledVector(hop, s);
    out.pos.y = first.y + 0.055 * Math.sin(Math.PI * s);
  }
  // 姿态：从抛出时的翻滚连续过渡到侧躺静置
  const tumble = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -6 * u * Math.PI * 0.5);
  out.quat.copy(tumble).slerp(quaternion, Math.min(1, u * 1.4));
}

// ---------------------------------------------------------------------------
// 弹匣堆叠助手（与 constants.ts 同源）
// ---------------------------------------------------------------------------
/** 弧长 u 处：堆叠位置 + 堆叠方向倾角（托弹板 / 托弹簧 / 弹匣壳定向用）。 */
function magSlot(u: number): { pos: [number, number, number]; alpha: number } {
  const out = magSlotTransform(u);
  return { pos: [out.pos[0], out.pos[1], out.pos[2]], alpha: out.alpha };
}

/** 第 r 发（剩余弹序）的位置：所有弹平行 +Z，只差平移。 */
function magRound(r: number): { pos: [number, number, number] } {
  const { pos } = magRoundTransform(r);
  return { pos: [pos[0], pos[1], pos[2]] };
}

/** 射击模式（由 StageCanvas 依据 machineState 设置，避免 catalog↔store 循环依赖）。 */
let ak47Mode: "auto" | "semi" | "idle" = "idle";

export function setAk47Mode(mode: "auto" | "semi" | "idle"): void {
  ak47Mode = mode;
}

export function getAk47Mode(): "auto" | "semi" | "idle" {
  return ak47Mode;
}

export function animateAk47(
  assembled: AssembledModel,
  seconds: number,
  mode: "auto" | "semi" | "idle" = "auto",
): void {
  const carrier = assembled.getNode("AkCarrier");
  const bolt = assembled.getNode("AkBolt");
  const pin = assembled.getNode("AkFiringPin");
  const hammer = assembled.getNode("AkHammer");
  const trigger = assembled.getNode("AkTrigger");
  const selector = assembled.getNode("AkSelector");
  const follower = assembled.getNode("AkFollower");
  const recoil = assembled.getNode("AkRecoil");

  // ---- 归一化：idle → 首发前；semi → 只打一发 ----
  const t = mode === "idle" ? -1 : mode === "semi" ? Math.min(seconds, PERIOD * 0.999) : seconds;
  const shotIndex = t < 0 ? 0 : Math.max(0, Math.floor(t / PERIOD));
  const tau = t < 0 ? 0 : t - shotIndex * PERIOD;
  const fired = Math.min(shotIndex, ROUNDS);

  // ---- 后坐层（整枪后坐 + 连射枪口上跳）----
  const climb = Math.min(shotIndex, 12) * 0.0015;
  const kick = recoilPose(tau);
  if (recoil) {
    recoil.position.z = kick.dz;
    recoil.rotation.x = kick.pitch - climb;
  }

  // ---- 枪机框 / 枪机 / 击针 ----
  const travel = carrierTravel(tau);
  if (carrier) carrier.position.z = -travel;
  if (bolt) bolt.rotation.z = boltAngle(travel);
  const pinStrike = Math.sin(Math.PI * seg(tau, 0.05, T_FIRE)) * 0.003;
  if (pin) pin.position.z = pinStrike;

  // ---- 击锤：待击(-70°) ↔ 打击(0°) ----
  if (hammer) {
    let angle = HAMMER_COCK;
    if (tau >= 0.05 && tau < T_FIRE) angle = HAMMER_COCK * (1 - ease.inCubic(seg(tau, 0.05, T_FIRE)));
    else if (tau >= T_FIRE && tau < 0.42) angle = 0;
    else if (tau >= 0.42 && tau < 0.58) angle = HAMMER_COCK * ease.inOutCubic(seg(tau, 0.42, 0.58));
    hammer.rotation.x = angle;
  }
  // ---- 扳机：扣引 → 复位 ----
  if (trigger) {
    const pull =
      tau < 1.02 ? TRIGGER_PULL * Math.sin(Math.PI * Math.min(1, seg(tau, 0, 0.05) * 12)) : TRIGGER_PULL * (1 - ease.inOutCubic(seg(tau, 1.02, 1.25)));
    trigger.rotation.x = tau >= 1.25 ? 0 : pull;
  }
  // ---- 快慢机：演示档位缓慢摆动 ----
  if (selector) selector.rotation.z = t < 0 ? 0 : Math.sin(t * 0.12) * 0.5;

  // ---- 托弹板沿弧上升（满弹弧位 14.5 → 空匣到抱弹口）----
  if (follower) {
    const u = Math.min(magRoundArc(ROUNDS - 1 - fired) + 0.0051, magRoundArc(29) + 0.0051);
    const slot = magSlot(u);
    follower.position.set(slot.pos[0], slot.pos[1], slot.pos[2]);
    // 托弹板 +Z 沿堆叠方向（弹被推向抱弹口的方向）
    follower.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -slot.alpha + Math.PI);
  }

  // ---- 弹药 30 发 × 6 件 ----
  const parts = [
    { id: "ak47.ammo.case", offset: 0 },
    { id: "ak47.ammo.primer", offset: 0.0002 },
    { id: "ak47.ammo.propellant", offset: 0.019 },
    { id: "ak47.ammo.bullet", offset: 0.0425 },
    { id: "ak47.ammo.core_lead", offset: 0.0405 },
    { id: "ak47.ammo.core_steel", offset: 0.0345 },
  ];
  const matrix = new THREE.Matrix4();
  const recoilZ = kick.dz;
  const pending = fired + 1 <= ROUNDS - 1 ? fired + 1 : -1; // 本轮被推进膛的那发

  for (const { id, offset } of parts) {
    const handle = assembled.getPart(id);
    if (!handle) continue;
    const isCase = id === "ak47.ammo.case";
    const isProjectile = id === "ak47.ammo.bullet" || id === "ak47.ammo.core_lead" || id === "ak47.ammo.core_steel";
    for (let i = 0; i < handle.instances.length; i++) {
      // 默认：静止布局（弹匣弧位）
      let m = handle.instances[i].restMatrix.clone();
      let visible = true;
      if (t >= 0) {
        if (i < fired) {
          // 已击发：随弹壳抛出 / 弹头飞离 —— 由弹壳池与弹头飞行另行表达
          visible = false;
        } else if (i === fired) {
          // 本轮被击发的那发
          if (tau < T_FIRE) {
            // 击发前：在膛内（随全枪后坐）
            m = new THREE.Matrix4().makeTranslation(0, SY, recoilZ + offset);
          } else if (isCase) {
            // 弹壳：抽壳（随枪机）→ 抛出 → 飞行 → 交给弹壳池
            if (tau < EJECT_T) m = new THREE.Matrix4().makeTranslation(0, 0, -travel);
            else if (tau < EJECT_T + FLIGHT_END) {
              const out = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() };
              caseFlight(fired, (tau - EJECT_T) / FLIGHT_END, out);
              m = new THREE.Matrix4().compose(out.pos, out.quat, new THREE.Vector3(1, 1, 1));
            } else visible = false; // 已交棒给弹壳池
          } else if (isProjectile) {
            // 弹头：出膛飞行（抛物线 + 曳光）
            const dt = tau - T_FIRE;
            if (dt > 0.6) visible = false;
            else {
              const z = MUZZLE_Z + dt * 3.2;
              const y = -4.9 * dt * dt * 0.35;
              m = new THREE.Matrix4().makeTranslation(0, y + SY, z + offset);
            }
          } else if (id === "ak47.ammo.propellant") {
            visible = tau < T_FIRE + 0.03; // 发射药点火即「烧完」
          } else {
            visible = false; // 底火随弹壳走（弹壳段已由 case 表达）
          }
        } else if (i === pending) {
          // 正被推进膛的那发：抱弹口 → 枪机面推着走 → 抬上进弹膛
          if (t >= 0 && travel < STRIP_TRAVEL + 0.02) {
            const p = Math.max(0, Math.min(1, 1 - travel / STRIP_TRAVEL));
            const y = FEED_Y * (1 - ease.inOutCubic(p));
            m = new THREE.Matrix4().makeTranslation(0, y + SY + recoilZ * 0, -travel + offset);
          }
        } else {
          // 其余在匣：剩余弹序 r = i - fired - 1（fired 越大，弧位越小 → 逐发上移）
          const r = i - fired - 1;
          if (r >= 0) {
            const slot = magRound(r);
            m = new THREE.Matrix4().makeTranslation(slot.pos[0], slot.pos[1] + SY, slot.pos[2]);
            // 弧位中心到弹壳底缘 28.1mm；缺这一项会让整列弹前移一个弹长。
            m.multiply(new THREE.Matrix4().makeTranslation(0, 0, -0.0281 + offset));
          } else visible = false;
        }
      }
      if (!visible) m = new THREE.Matrix4().makeScale(0, 0, 0);
      handle.setInstanceMatrix(i, m);
    }
  }

  // ---- 复进簧：后坐压缩（前端随枪机框簧肩，后端坐机匣支座）----
  const recoilSpring = assembled.getPart("ak47.action.recoil_spring");
  if (recoilSpring) {
    const lo = -0.215;
    const hi = -0.135 - travel + recoilZ;
    const span = Math.max(0.016, hi - lo);
    for (let i = 0; i < recoilSpring.instances.length; i++) {
      const p = (i + 0.5) / recoilSpring.instances.length;
      matrix.makeTranslation(0, SY, lo + p * span);
      recoilSpring.setInstanceMatrix(i, matrix);
    }
  }
  // ---- 托弹簧：随 fired 张开 ----
  const magSpring = assembled.getPart("ak47.mag.spring");
  if (magSpring) {
    const from = Math.min(magRoundArc(ROUNDS - 1 - fired) + 0.0051, magRoundArc(29) + 0.0051);
    for (let i = 0; i < magSpring.instances.length; i++) {
      const s = from + ((i + 0.5) / magSpring.instances.length) * (magRoundArc(29) + 0.028 - from);
      const slot = magSlot(s);
      matrix.makeTranslation(slot.pos[0], slot.pos[1] + SY, slot.pos[2]);
      magSpring.setInstanceMatrix(i, matrix);
    }
  }

  // ---- 弹壳池：抛出 → 飞行 → 弹跳 → 堆积（12 槽循环）----
  const brass = assembled.getPart("ak47.fx.brass");
  if (brass) {
    for (let i = 0; i < brass.instances.length; i++) {
      // 槽位 i 服务「最近一发满足 k mod CASES == i 的击发」
      let shot = i;
      while (shot + CASES <= fired) shot += CASES;
      if (t < 0 || fired < shot) {
        matrix.makeScale(0, 0, 0);
      } else {
        const dt = (t - shot * PERIOD) - EJECT_T;
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

  // ---- 枪口焰 / 曳光弹迹 ----
  const flash = assembled.getPart("ak47.fx.muzzle_flash");
  if (flash) {
    const p = seg(tau, T_FIRE, T_FIRE + 0.05);
    const s = p > 0 && p < 1 ? Math.sin(Math.PI * p) : 0;
    matrix.makeTranslation(0, 0, MUZZLE_Z + recoilZ);
    flash.setInstanceMatrix(0, matrix.multiply(new THREE.Matrix4().makeScale(s, s, s)));
  }
  const tracer = assembled.getPart("ak47.fx.tracer");
  if (tracer) {
    const p = seg(tau, T_FIRE, T_FIRE + 0.35);
    const len = p > 0 && p < 1 ? 0.25 + 0.9 * (1 - p) : 0;
    matrix.makeTranslation(0, 0, MUZZLE_Z + recoilZ + len / 2);
    tracer.setInstanceMatrix(0, matrix.multiply(new THREE.Matrix4().makeScale(1, len, 1)));
  }
}

/** 受动画直接改写实例矩阵的零件（pose 层据此取本帧位姿）。 */
export const AK47_MOTION_PARTS = [
  "ak47.ammo.case",
  "ak47.ammo.primer",
  "ak47.ammo.propellant",
  "ak47.ammo.bullet",
  "ak47.ammo.core_lead",
  "ak47.ammo.core_steel",
  "ak47.action.recoil_spring",
  "ak47.mag.spring",
  "ak47.fx.brass",
];
