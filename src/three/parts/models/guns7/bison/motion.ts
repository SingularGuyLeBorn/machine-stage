import * as THREE from "three";
import type { AssembledModel } from "@/three/parts";
import { ammoOffsets, ammoPartIds } from "../parts";
import {
  ease,
  flashPulse,
  projectileMatrix,
  recoilKick,
  seg,
  showFxParts,
  smokePulse,
  updateBrassPool,
} from "../cycle";
import type { BrassOptions } from "../cycle";
import {
  BISON_AMMO_SPEC,
  BISON_DRUM,
  bisonHelixSlot,
} from "./registry";

// ============================================================================
// models/guns7/bison/motion —— 自由枪机 + 螺旋弹筒完整循环
//
// 1.15s 一个视觉循环（真实约 700 发/分）：
//   0.00–0.06 扣扳机 → 击锤打击击针 → 击发
//   0.06–0.30 枪机/枪机框一起后坐 58mm，抽壳钩抽壳，复进簧压缩
//   0.30–0.36 抛壳挺把 9mm 空壳抛出右侧
//   0.40–0.70 复进簧推枪机复进；螺旋托弹板旋转一个槽距，下一发从
//             供弹唇进入弹膛
//   0.78–1.05 扳机/击锤复位，等待下一发
//
// 30 发打完停在空仓、枪机闭锁状态；idle 回到满仓。动画是时间的纯函数。
// ============================================================================

const STAGE_Y = 0.3;
const PERIOD = 1.15;
const T_FIRE = 0.06;
const T_BACK0 = 0.09;
const T_BACK1 = 0.29;
const T_EJECT = 0.34;
const T_FWD0 = 0.40;
const T_FWD1 = 0.70;
const T_RESET0 = 0.78;
const T_RESET1 = 1.02;
const BOLT_TRAVEL = 0.058;
const MUZZLE_Z = 0.24;
const SHOTS = 30;
const RECOIL_PIVOT_Z = -0.25;
const SPRING_REAR = -0.202;
const SPRING_FRONT = -0.144;
const HELIX_STEP = (Math.PI * 2 * BISON_DRUM.TURNS) / BISON_DRUM.SLOTS;
/** 托弹板静止角（slot 30，弹筒最前端）。 */
const FOLLOWER_REST_ANGLE = BISON_DRUM.FEED_ANGLE - BISON_DRUM.SLOTS * HELIX_STEP;

const AMMO_IDS = ammoPartIds("bison");
const AMMO_OFFSETS = ammoOffsets(BISON_AMMO_SPEC);
const OFFSET_BY_ID: Record<string, number> = {};
for (const id of AMMO_IDS) {
  OFFSET_BY_ID[id] = AMMO_OFFSETS[id.slice("bison.ammo.".length)] ?? 0;
}

/** 抛壳口在机匣右侧、弹膛后方；空壳落在展示台底座上。 */
const BRASS: BrassOptions = {
  pool: 12,
  period: PERIOD,
  ejectTime: T_EJECT,
  port: new THREE.Vector3(0.027, 0.31, -0.018),
  throwDir: new THREE.Vector3(0.42, 0.58, -0.86),
  floorY: 0.0062,
  flightTime: 0.42,
  spread: 0.055,
  forward: new THREE.Vector3(0, 0, 1),
};

const scratch = new THREE.Matrix4();
const scratch2 = new THREE.Matrix4();
const scratch3 = new THREE.Matrix4();
const recoilMatrix = new THREE.Matrix4();
const roundMatrix = new THREE.Matrix4();
const zeroMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
const muzzleOrigin = new THREE.Vector3(0, STAGE_Y, MUZZLE_Z);

function roundPose(
  out: THREE.Matrix4,
  x: number,
  y: number,
  z: number,
  offset: number,
): THREE.Matrix4 {
  out.makeTranslation(x, STAGE_Y + y, z);
  if (offset !== 0) out.multiply(scratch3.makeTranslation(0, 0, offset));
  return out;
}

function setRound(
  assembled: AssembledModel,
  partId: string,
  index: number,
  x: number,
  y: number,
  z: number,
): void {
  const handle = assembled.getPart(partId);
  if (!handle) return;
  roundPose(roundMatrix, x, y, z, OFFSET_BY_ID[partId] ?? 0);
  roundMatrix.premultiply(recoilMatrix);
  handle.setInstanceMatrix(index, roundMatrix);
}

function setHelixRound(
  assembled: AssembledModel,
  partId: string,
  index: number,
  slot: number,
): void {
  const p = bisonHelixSlot(slot);
  setRound(assembled, partId, index, p.x, p.y, p.z);
}

function hideRound(assembled: AssembledModel, partId: string, index: number): void {
  const handle = assembled.getPart(partId);
  if (handle) handle.setInstanceMatrix(index, zeroMatrix);
}

function setRestInstances(assembled: AssembledModel, partId: string): void {
  const handle = assembled.getPart(partId);
  if (!handle) return;
  for (let i = 0; i < handle.instances.length; i++) {
    handle.setInstanceMatrix(i, handle.instances[i].restMatrix);
  }
}

export const BISON_MOTION_PARTS: string[] = [
  ...AMMO_IDS,
  "bison.action.recoil_spring",
  "bison.fx.brass",
  "bison.fx.muzzle_flash",
  "bison.fx.smoke",
];

export function animateBison(
  assembled: AssembledModel,
  seconds: number,
  mode: "auto" | "semi" | "idle" = "idle",
): void {
  showFxParts(assembled, ["bison.fx.muzzle_flash", "bison.fx.smoke", "bison.fx.brass"]);

  const recoil = assembled.getNode("AkRecoil");
  const carrier = assembled.getNode("AkCarrier");
  const bolt = assembled.getNode("AkBolt");
  const firingPin = assembled.getNode("AkFiringPin");
  const trigger = assembled.getNode("AkTrigger");
  const hammer = assembled.getNode("AkHammer");
  const follower = assembled.getNode("BisonFollower");

  // ---- idle：满仓、闭锁、待击 ----
  if (mode === "idle") {
    for (const id of AMMO_IDS) setRestInstances(assembled, id);
    setRestInstances(assembled, "bison.action.recoil_spring");
    updateBrassPool(assembled, "bison.fx.brass", 0, -1, BRASS);
    for (const id of ["bison.fx.muzzle_flash", "bison.fx.smoke"]) {
      const p = assembled.getPart(id);
      if (p) p.setInstanceMatrix(0, zeroMatrix);
    }
    if (recoil) {
      recoil.position.y = 0;
      recoil.position.z = 0;
      recoil.rotation.x = 0;
    }
    if (carrier) carrier.position.z = 0;
    if (bolt) bolt.rotation.z = 0;
    if (firingPin) firingPin.position.z = 0;
    if (trigger) trigger.rotation.x = 0;
    if (hammer) hammer.rotation.x = 0;
    if (follower) {
      // node.rotation 用弧度；rest_rotation 是角度制，idle 必须把弧度绝对角写回去。
      follower.rotation.z = FOLLOWER_REST_ANGLE;
      follower.position.z = 0;
    }
    return;
  }

  // ---- 时钟：semi 打一发；auto 打到第 30 发后停住 ----
  const t = mode === "semi"
    ? Math.min(seconds, PERIOD * 0.999)
    : Math.min(seconds, SHOTS * PERIOD - 0.001);
  const shotIndex = Math.max(0, Math.min(SHOTS - 1, Math.floor(t / PERIOD)));
  const tau = t - shotIndex * PERIOD;
  const fired = Math.min(shotIndex + 1, SHOTS);

  // ---- 后坐：整枪绕托底支点上跳，枪机随后坐 ----
  const kick = recoilKick(tau, T_FIRE, 0.55);
  const pitch = kick.pitch * 0.34;
  const sinPitch = Math.sin(pitch);
  const cosPitch = Math.cos(pitch);
  if (recoil) {
    recoil.position.y = sinPitch * RECOIL_PIVOT_Z;
    recoil.position.z = RECOIL_PIVOT_Z * (1 - cosPitch) + kick.dz;
    recoil.rotation.x = pitch;
  }
  recoilMatrix.makeTranslation(
    0,
    sinPitch * RECOIL_PIVOT_Z,
    RECOIL_PIVOT_Z * (1 - cosPitch) + kick.dz,
  );
  recoilMatrix.multiply(scratch.makeRotationX(pitch));

  let back = 0;
  if (tau >= T_BACK0 && tau < T_BACK1) back = ease.inOutCubic(seg(tau, T_BACK0, T_BACK1));
  else if (tau >= T_BACK1 && tau < T_FWD0) back = 1;
  else if (tau >= T_FWD0 && tau < T_FWD1) back = 1 - ease.inOutCubic(seg(tau, T_FWD0, T_FWD1));
  const boltZ = -BOLT_TRAVEL * back;
  if (carrier) carrier.position.z = boltZ;
  // 自由枪机不回转：枪机节点保持 0°，随枪机框一起平移。
  if (bolt) bolt.rotation.z = 0;

  // ---- 击针：击发瞬间前冲 3.2mm，随后复位 ----
  let pin = 0;
  if (tau >= 0.02 && tau < T_FIRE) pin = 0.0032 * ease.outCubic(seg(tau, 0.02, T_FIRE));
  else if (tau >= T_FIRE && tau < T_BACK0) pin = 0.0032 * (1 - ease.inOutCubic(seg(tau, T_FIRE, T_BACK0)));
  if (firingPin) firingPin.position.z = pin;

  // ---- 扳机 / 击锤：扣引、击发、后坐待击、复位 ----
  let trig = 0;
  if (tau >= 0.01 && tau < T_FIRE) trig = 0.18 * ease.outCubic(seg(tau, 0.01, T_FIRE));
  else if (tau >= T_FIRE && tau < T_RESET0) trig = 0.18;
  else if (tau >= T_RESET0 && tau < T_RESET1) trig = 0.18 * (1 - ease.inOutCubic(seg(tau, T_RESET0, T_RESET1)));
  if (trigger) trigger.rotation.x = trig;

  let hammerAngle = 0;
  if (tau >= T_FIRE && tau < T_BACK1) hammerAngle = 0.55 * ease.inOutCubic(seg(tau, T_FIRE, T_BACK1));
  else if (tau >= T_BACK1 && tau < T_RESET0) hammerAngle = 0.55;
  else if (tau >= T_RESET0 && tau < T_RESET1) hammerAngle = 0.55 * (1 - ease.inOutCubic(seg(tau, T_RESET0, T_RESET1)));
  if (hammer) hammer.rotation.x = hammerAngle;

  // ---- 螺旋托弹板：每打一发推进一个螺旋槽；复进段连续旋转，避免跳变 ----
  const feedT = ease.inOutCubic(seg(tau, T_FWD0, T_FWD1));
  if (follower) {
    const slot = 30 - (shotIndex + feedT);
    follower.rotation.z = BISON_DRUM.FEED_ANGLE - (slot - 1) * HELIX_STEP;
    follower.position.z = -(shotIndex + feedT) * BISON_DRUM.PITCH;
  }

  // ---- 弹药：膛内 1 发 + 螺旋筒 29 发 ----
  const next = shotIndex + 1;
  for (const id of AMMO_IDS) {
    const handle = assembled.getPart(id);
    if (!handle) continue;
    const isCase = id === "bison.ammo.case";
    const isPrimer = id === "bison.ammo.primer";
    const isProjectile =
      id === "bison.ammo.bullet" ||
      id === "bison.ammo.core_lead" ||
      id === "bison.ammo.core_steel";
    const isPropellant = id === "bison.ammo.propellant";

    for (let i = 0; i < handle.instances.length; i++) {
      let visible = true;
      if (i < shotIndex) {
        visible = false;
      } else if (i === shotIndex) {
        // 当前膛内弹
        if (tau < T_FIRE) {
          setRound(assembled, id, i, 0, 0.0005, 0.0005);
        } else if (isCase || isPrimer) {
          if (tau < T_EJECT) setRound(assembled, id, i, 0, 0.0005, 0.0005 + boltZ);
          else visible = false;
        } else if (isProjectile) {
          const dt = tau - T_FIRE;
          if (dt > 0.5) visible = false;
          else {
            projectileMatrix(scratch, muzzleOrigin, dt, 11, 0.45);
            scratch.multiply(scratch2.makeTranslation(0, 0, OFFSET_BY_ID[id] ?? 0));
            handle.setInstanceMatrix(i, scratch);
            continue;
          }
        } else if (isPropellant) {
          visible = tau < T_FIRE + 0.025;
          if (visible) setRound(assembled, id, i, 0, 0.0005, 0.0005);
        } else {
          visible = false;
        }
      } else if (i === next) {
        // 下一发：先在供弹唇内抬升到枪膛轴线，再由枪机推入弹膛。
        // 不能一边横移一边前冲，否则弹体斜着扎进节套。
        const slot = bisonHelixSlot(1);
        const liftT = Math.min(1, feedT / 0.35);
        const advanceT = ease.inOutCubic(Math.max(0, (feedT - 0.35) / 0.65));
        const x = slot.x * (1 - ease.outCubic(liftT));
        const y = slot.y * (1 - ease.outCubic(liftT));
        const z = slot.z + (0.0005 - slot.z) * advanceT;
        setRound(assembled, id, i, x, y, z);
      } else {
        // 仍在螺旋筒：整叠随托弹板向供弹口连续移动一个槽距
        setHelixRound(assembled, id, i, i - shotIndex - feedT);
      }
      if (!visible) hideRound(assembled, id, i);
    }
  }

  // ---- 复进簧：后坐时压缩，前端跟着枪机尾 ----
  const spring = assembled.getPart("bison.action.recoil_spring");
  if (spring) {
    const front = SPRING_FRONT + boltZ;
    const count = spring.instances.length;
    for (let i = 0; i < count; i++) {
      const u = (i + 0.5) / count;
      scratch.makeTranslation(0, STAGE_Y, SPRING_REAR + (front - SPRING_REAR) * u);
      scratch.premultiply(recoilMatrix);
      spring.setInstanceMatrix(i, scratch);
    }
  }

  // ---- 抛壳池 / 枪口焰 / 硝烟 ----
  updateBrassPool(assembled, "bison.fx.brass", fired, t, BRASS);

  const flash = assembled.getPart("bison.fx.muzzle_flash");
  if (flash) {
    const s = flashPulse(tau, T_FIRE, 0.055);
    scratch.copy(recoilMatrix).multiply(scratch2.makeTranslation(0, STAGE_Y, 0.236));
    if (s > 0) scratch.multiply(scratch3.makeScale(s * 1.05, s * 1.05, s * 1.05));
    else scratch.multiply(zeroMatrix);
    flash.setInstanceMatrix(0, scratch);
  }
  const smoke = assembled.getPart("bison.fx.smoke");
  if (smoke) {
    const s = smokePulse(tau, T_FIRE, 0.75);
    const drift = seg(tau, T_FIRE, T_FIRE + 0.75);
    scratch.copy(recoilMatrix).multiply(
      scratch2.makeTranslation(0, STAGE_Y + 0.012 + 0.04 * drift, 0.244 + 0.055 * drift),
    );
    if (s > 0) scratch.multiply(scratch3.makeScale(0.35 + 1.0 * s, 0.35 + 1.0 * s, 0.35 + 1.0 * s));
    else scratch.multiply(zeroMatrix);
    smoke.setInstanceMatrix(0, scratch);
  }
}
