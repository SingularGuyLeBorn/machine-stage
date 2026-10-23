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
import { T38_AMMO_SPEC } from "./registry";

// ============================================================================
// models/guns7/type38/motion —— 三八式步枪完整手动循环
//
// 2.6s 一个循环（视觉放慢；真实熟练射手约 1.2s/发）：
//   0.00–0.10 扣扳机 → 阻铁释放击针尾 → 击针前冲 8mm → 击发
//   0.10–0.28 后坐、枪口上跳；弹头出膛，弹壳仍贴在弹膛里
//   0.28–0.42 拉机柄上抬 90°，枪机开锁；击针被重新待击
//   0.42–0.72 枪机后拉 100mm，抽壳钩把弹壳拉出弹膛
//   0.66     抛壳挺撞壳底，弹壳从右侧抛出，交给弹壳池
//   0.92–1.22 枪机复进，推弹坡把下一发从弹仓顶入弹膛
//   1.22–1.34 拉机柄下压闭锁；1.35–1.55 扳机复位
//
// 6 发（膛内 1 + 弹仓 5）打空后停在空仓、闭锁状态；切回 idle 再
// 进 running 会从头开始。动画是时间的纯函数，扫掠检测可复现。
// ============================================================================

const STAGE_Y = 0.3;
const PERIOD = 2.6;
const T_FIRE = 0.1;
const T_LIFT0 = 0.28;
const T_LIFT1 = 0.42;
const T_BACK0 = 0.42;
const T_BACK1 = 0.72;
const T_EJECT = 0.66;
const T_FWD0 = 0.92;
const T_FWD1 = 1.22;
const T_LOCK0 = 1.22;
const T_LOCK1 = 1.34;
const T_RESET0 = 1.35;
const T_RESET1 = 1.55;
const BOLT_TRAVEL = 0.1;
const MAG_Z = -0.075;
/** 托弹板/弹仓簧中心：在弹仓几何中段，避开前唇与仓壁。 */
const FOLLOWER_Z = -0.11;
const ROUND_Y0 = -0.02;
const ROUND_PITCH = 0.0125;
const MUZZLE_Z = 0.797;
const SHOTS = 6;
const RECOIL_PIVOT_Z = -0.25;
const TRIGGER_PULL = 0.16;
const FEED_TILT = 0.18;

const AMMO_IDS = ammoPartIds("type38");
const AMMO_OFFSETS = ammoOffsets(T38_AMMO_SPEC);
const OFFSET_BY_ID: Record<string, number> = {};
for (const id of AMMO_IDS) {
  OFFSET_BY_ID[id] = AMMO_OFFSETS[id.slice("type38.ammo.".length)] ?? 0;
}

/** 抛壳口：机匣右侧、弹膛后方；弹壳向后方偏右落在展示台底座上。 */
const BRASS: BrassOptions = {
  pool: 8,
  period: PERIOD,
  ejectTime: T_EJECT,
  port: new THREE.Vector3(0.025, 0.31, -0.06),
  throwDir: new THREE.Vector3(0.12, 0.62, -0.98),
  floorY: 0.0062,
  flightTime: 0.5,
  spread: 0.07,
  forward: new THREE.Vector3(0, 0, 1),
};

const scratch = new THREE.Matrix4();
const scratch2 = new THREE.Matrix4();
const scratch3 = new THREE.Matrix4();
const recoilMatrix = new THREE.Matrix4();
const roundMatrix = new THREE.Matrix4();
const zeroMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
const one = new THREE.Vector3(1, 1, 1);
const muzzleOrigin = new THREE.Vector3(0, STAGE_Y, MUZZLE_Z);
const magQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));

function roundPose(out: THREE.Matrix4, y: number, z: number, pitch: number, offset: number): THREE.Matrix4 {
  // 弹药实例是模型空间（无 instance_nodes），布局里带 STAGE_Y；动画也要带上。
  out.makeTranslation(0, STAGE_Y + y, z);
  if (pitch !== 0) out.multiply(scratch2.makeRotationX(pitch));
  if (offset !== 0) out.multiply(scratch3.makeTranslation(0, 0, offset));
  return out;
}

function setRound(
  assembled: AssembledModel,
  partId: string,
  index: number,
  y: number,
  z: number,
  pitch: number,
): void {
  const handle = assembled.getPart(partId);
  if (!handle) return;
  roundPose(roundMatrix, y, z, pitch, OFFSET_BY_ID[partId] ?? 0);
  roundMatrix.premultiply(recoilMatrix);
  handle.setInstanceMatrix(index, roundMatrix);
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

export const T38_MOTION_PARTS: string[] = [
  ...AMMO_IDS,
  "type38.barrel.rifling",
  "type38.bolt.firing_pin_spring",
  "type38.magazine.spring",
  "type38.fx.brass",
  "type38.fx.muzzle_flash",
  "type38.fx.smoke",
];

export function animateType38(
  assembled: AssembledModel,
  seconds: number,
  mode: "auto" | "semi" | "idle" = "idle",
): void {
  showFxParts(assembled, [
    "type38.fx.muzzle_flash",
    "type38.fx.smoke",
    "type38.fx.brass",
  ]);

  const recoil = assembled.getNode("T38Recoil");
  const bolt = assembled.getNode("T38Bolt");
  const boltRot = assembled.getNode("T38BoltRot");
  const firingPin = assembled.getNode("T38FiringPin");
  const trigger = assembled.getNode("T38Trigger");
  const sear = assembled.getNode("T38Sear");
  const follower = assembled.getNode("T38Follower");

  // ---- idle：回到满仓、闭锁、待击 ----
  if (mode === "idle") {
    for (const id of AMMO_IDS) setRestInstances(assembled, id);
    setRestInstances(assembled, "type38.barrel.rifling");
    setRestInstances(assembled, "type38.bolt.firing_pin_spring");
    setRestInstances(assembled, "type38.magazine.spring");
    updateBrassPool(assembled, "type38.fx.brass", 0, -1, BRASS);
    const flash = assembled.getPart("type38.fx.muzzle_flash");
    if (flash) flash.setInstanceMatrix(0, zeroMatrix);
    const smoke = assembled.getPart("type38.fx.smoke");
    if (smoke) smoke.setInstanceMatrix(0, zeroMatrix);
    if (recoil) {
      recoil.position.y = 0;
      recoil.position.z = 0;
      recoil.rotation.x = 0;
    }
    if (bolt) bolt.position.z = 0;
    if (boltRot) boltRot.rotation.z = 0;
    if (firingPin) firingPin.position.z = 0;
    if (trigger) trigger.rotation.x = 0;
    if (sear) sear.rotation.x = 0;
    if (follower) follower.position.y = -0.072;
    return;
  }

  // ---- 时钟：semi 只打一发；auto 打到第 6 发后停住 ----
  const t = mode === "semi" ? Math.min(seconds, PERIOD * 0.999) : Math.min(seconds, SHOTS * PERIOD - 0.001);
  const shotIndex = Math.max(0, Math.min(SHOTS - 1, Math.floor(t / PERIOD)));
  const tau = t - shotIndex * PERIOD;
  const fired = Math.min(shotIndex + 1, SHOTS);

  // ---- 后坐层：绕枪托支点旋转，枪口上跳 ----
  const kick = recoilKick(tau, T_FIRE, 0.85);
  const pitch = kick.pitch * 0.45;
  const dz = kick.dz;
  const sinPitch = Math.sin(pitch);
  const cosPitch = Math.cos(pitch);
  if (recoil) {
    // 节点 pivot 保持 0：用 T(p)·R·T(-p) 的等价平移绕枪托支点旋转，
    // 这样不会改变所有 absolute mate 的装配原点。
    recoil.position.y = sinPitch * RECOIL_PIVOT_Z;
    recoil.position.z = RECOIL_PIVOT_Z * (1 - cosPitch) + dz;
    recoil.rotation.x = pitch;
  }
  recoilMatrix.makeTranslation(
    0,
    sinPitch * RECOIL_PIVOT_Z,
    RECOIL_PIVOT_Z * (1 - cosPitch) + dz,
  );
  recoilMatrix.multiply(scratch.makeRotationX(pitch));

  // 膛线是模型空间实例；必须逐帧乘后坐矩阵，否则枪管后坐/上跳时膛线留在原地。
  const rifling = assembled.getPart("type38.barrel.rifling");
  if (rifling) {
    for (let i = 0; i < rifling.instances.length; i++) {
      scratch.multiplyMatrices(recoilMatrix, rifling.instances[i].restMatrix);
      rifling.setInstanceMatrix(i, scratch);
    }
  }

  // ---- 枪机：上抬 → 后拉 → 复进 → 下压 ----
  let lift = 0;
  if (tau >= T_LIFT0 && tau < T_LIFT1) lift = ease.inOutCubic(seg(tau, T_LIFT0, T_LIFT1));
  else if (tau >= T_LIFT1 && tau < T_LOCK0) lift = 1;
  else if (tau >= T_LOCK0 && tau < T_LOCK1) lift = 1 - ease.inOutCubic(seg(tau, T_LOCK0, T_LOCK1));
  if (boltRot) boltRot.rotation.z = (Math.PI / 2) * lift;

  let back = 0;
  if (tau >= T_BACK0 && tau < T_BACK1) back = ease.inOutCubic(seg(tau, T_BACK0, T_BACK1));
  else if (tau >= T_BACK1 && tau < T_FWD0) back = 1;
  else if (tau >= T_FWD0 && tau < T_FWD1) back = 1 - ease.inOutCubic(seg(tau, T_FWD0, T_FWD1));
  const boltZ = -BOLT_TRAVEL * back;
  if (bolt) bolt.position.z = boltZ;

  // ---- 击针：击发前冲，开锁时被击针尾重新待击 ----
  let pin = 0;
  // 击针尖只凸出弹底窝约 1.5mm，够击发底火，不能继续穿进发射药。
  if (tau >= 0.04 && tau < T_LIFT0) pin = 0.0035 * ease.outCubic(seg(tau, 0.04, T_FIRE));
  else if (tau >= T_LIFT0 && tau < T_LIFT1) pin = 0.0035 * (1 - ease.inOutCubic(seg(tau, T_LIFT0, T_LIFT1)));
  if (firingPin) firingPin.position.z = pin;

  // ---- 扳机 / 阻铁：扣引 → 释放 → 复位 ----
  let trig = 0;
  if (tau >= 0.02 && tau < T_FIRE) trig = TRIGGER_PULL * ease.outCubic(seg(tau, 0.02, T_FIRE));
  else if (tau >= T_FIRE && tau < T_RESET0) trig = TRIGGER_PULL;
  else if (tau >= T_RESET0 && tau < T_RESET1) trig = TRIGGER_PULL * (1 - ease.inOutCubic(seg(tau, T_RESET0, T_RESET1)));
  if (trigger) trigger.rotation.x = trig;

  let searAngle = 0;
  if (tau >= 0.06 && tau < 0.12) searAngle = -0.1 * seg(tau, 0.06, 0.12);
  else if (tau >= 0.12 && tau < T_LIFT0) searAngle = -0.1;
  else if (tau >= T_LIFT0 && tau < T_LIFT1) searAngle = -0.1 * (1 - seg(tau, T_LIFT0, T_LIFT1));
  if (sear) sear.rotation.x = searAngle;

  // ---- 供弹：枪机复进到 -75mm 时接触弹仓顶弹，推上坡道 ----
  const next = shotIndex + 1;
  // 推弹只在复进行程发生；闭锁/待击阶段下一发必须留在弹仓里，
  // 否则会和膛内那发叠在一起（弹底、底火、发射药互相穿模）。
  // 推弹起点用缓动后的实际 boltZ，不能用线性行程，否则弹底会落到枪机头后面。
  const feedZ = tau >= T_FWD0 ? Math.max(MAG_Z, boltZ + 0.0005) : MAG_Z;
  const feedU = Math.min(1, Math.max(0, (feedZ - MAG_Z) / (0.0005 - MAG_Z)));
  const feedT = seg(tau, 0.995, T_FWD1);
  const feedProgress = ease.inOutCubic(feedT);
  const nextY = ROUND_Y0 * (1 - ease.inOutCubic(feedU));
  const nextPitch = -FEED_TILT * Math.sin(Math.PI * feedT);

  // 托弹板：每剥出一发上升一个节距；空仓后停在 4.5 节距，
  // 给后坐的枪机头/闭锁凸榫留出 3mm 以上运动间隙。
  const followerPitch = Math.min(4.5, shotIndex + (next < SHOTS ? feedProgress : 0));
  if (follower) follower.position.y = -0.072 + ROUND_PITCH * followerPitch;

  // ---- 弹药 6 发 × 6 件 ----
  for (const id of AMMO_IDS) {
    const handle = assembled.getPart(id);
    if (!handle) continue;
    const isCase = id === "type38.ammo.case";
    const isProjectile =
      id === "type38.ammo.bullet" ||
      id === "type38.ammo.lead_core" ||
      id === "type38.ammo.steel_core";
    const isPropellant = id === "type38.ammo.propellant";
    const isPrimer = id === "type38.ammo.primer";

    for (let i = 0; i < handle.instances.length; i++) {
      let visible = true;
      if (i < shotIndex) {
        // 已击发：弹壳交给弹壳池，弹头已飞走
        visible = false;
      } else if (i === shotIndex) {
        // 本轮膛内那发
        if (tau < T_FIRE) {
          setRound(assembled, id, i, 0, 0.0005, 0);
        } else if (isCase) {
          if (tau < T_EJECT) setRound(assembled, id, i, 0, 0.0005 + boltZ, 0);
          else visible = false;
        } else if (isPrimer) {
          if (tau < T_EJECT) setRound(assembled, id, i, 0, 0.0005 + boltZ, 0);
          else visible = false;
        } else if (isProjectile) {
          const dt = tau - T_FIRE;
          if (dt > 0.42) visible = false;
          else {
            projectileMatrix(scratch, muzzleOrigin, dt, 8, 0.35);
            handle.setInstanceMatrix(i, scratch);
            continue;
          }
        } else if (isPropellant) {
          visible = tau < T_FIRE + 0.03;
          if (visible) setRound(assembled, id, i, 0, 0.0005, 0);
        } else {
          visible = false;
        }
      } else if (i === next) {
        // 下一发：弹仓顶 → 推弹坡 → 弹膛
        setRound(assembled, id, i, nextY, feedZ, nextPitch);
      } else {
        // 仍在弹仓：随托弹板上升一个节距
        const slot = i - shotIndex - 1;
        const y = ROUND_Y0 - slot * ROUND_PITCH + ROUND_PITCH * feedProgress;
        setRound(assembled, id, i, y, MAG_Z, 0);
      }
      if (!visible) hideRound(assembled, id, i);
    }
  }

  // ---- 击针簧：随枪机后坐 / 击针前冲压缩 ----
  const firingSpring = assembled.getPart("type38.bolt.firing_pin_spring");
  if (firingSpring) {
    const z0 = -0.16 + boltZ;
    const z1 = -0.058 + boltZ + pin;
    const count = firingSpring.instances.length;
    for (let i = 0; i < count; i++) {
      const u = (i + 0.5) / count;
      scratch.makeTranslation(0, STAGE_Y, z0 + (z1 - z0) * u);
      scratch.premultiply(recoilMatrix);
      firingSpring.setInstanceMatrix(i, scratch);
    }
  }

  // ---- 弹仓簧：顶面跟着托弹板上升 ----
  const magSpring = assembled.getPart("type38.magazine.spring");
  if (magSpring) {
    const y0 = -0.092;
    const y1 = -0.077 + ROUND_PITCH * followerPitch;
    const count = magSpring.instances.length;
    for (let i = 0; i < count; i++) {
      const u = (i + 0.5) / count;
      scratch.compose(
        new THREE.Vector3(0, STAGE_Y + y0 + (y1 - y0) * u, FOLLOWER_Z),
        magQuat,
        one,
      );
      scratch.premultiply(recoilMatrix);
      magSpring.setInstanceMatrix(i, scratch);
    }
  }

  // ---- 抛壳池：抛出 → 飞行 → 落地弹跳 → 侧躺 ----
  updateBrassPool(assembled, "type38.fx.brass", fired, t, BRASS);

  // ---- 枪口焰 / 硝烟 ----
  const flash = assembled.getPart("type38.fx.muzzle_flash");
  if (flash) {
    const s = flashPulse(tau, T_FIRE, 0.06);
    scratch.copy(recoilMatrix).multiply(scratch2.makeTranslation(0, STAGE_Y, MUZZLE_Z));
    if (s > 0) scratch.multiply(scratch3.makeScale(s * 1.15, s * 1.15, s * 1.15));
    else scratch.multiply(zeroMatrix);
    flash.setInstanceMatrix(0, scratch);
  }
  const smoke = assembled.getPart("type38.fx.smoke");
  if (smoke) {
    const s = smokePulse(tau, T_FIRE, 0.8);
    const drift = seg(tau, T_FIRE, T_FIRE + 0.8);
    scratch.copy(recoilMatrix).multiply(
      scratch2.makeTranslation(0, STAGE_Y + 0.01 + 0.04 * drift, 0.84 + 0.06 * drift),
    );
    if (s > 0) scratch.multiply(scratch3.makeScale(0.4 + 1.1 * s, 0.4 + 1.1 * s, 0.4 + 1.1 * s));
    else scratch.multiply(zeroMatrix);
    smoke.setInstanceMatrix(0, scratch);
  }
}
