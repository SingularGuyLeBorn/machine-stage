import * as THREE from "three";
import { BELT_PITCH, BELT_LINKS, BELT_X0, BELT_Y, BELT_Z } from "./belt";
import { M134_CONSTANTS } from "./constants";
import { M134_BOLT_DETAIL_OFFSETS } from "./extra";
import type { AssembledModel } from "@/three/parts";

// ============================================================================
// models/m134/motion —— M134 加特林（转管式）射击循环
//
// 机构本质：**没有传统自动机**——电机经减速齿轮驱动转子恒速旋转，
// 6 根枪管 + 6 套独立枪机随转子一起转，枪机导销在凸轮槽里被迫往复：
//   每转 60° = 一个枪机的完整循环：装填→闭锁→击发→抽壳→抛壳
// 射速 = 6 × 转子转速（演示取 300 rpm 转子 → 1800 发/分，可读）
// ============================================================================

const RPM = 300; // 演示转子转速（真机 1000 rpm → 6000 发/分）
const OMEGA = (RPM / 60) * Math.PI * 2; // rad/s
const BOLT_STROKE = M134_CONSTANTS.BOLT_STROKE;
const RING_R = M134_CONSTANTS.BARREL_RING_R;
const CASES = 14;
const SY = M134_CONSTANTS.STAGE_Y;
const COUNT = M134_CONSTANTS.BARREL_COUNT;

/** 确定性伪随机（mulberry32）。 */
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

/** 弹壳池散布（瀑布式抛出：左侧抛壳口连续外抛）。 */
export function brassPose(shot: number): { position: THREE.Vector3; quaternion: THREE.Quaternion } {
  const rand = mulberry(0x6a13 + shot * 811);
  const vx = -(0.5 + rand() * 0.5); // 向左抛
  const vz = -(0.1 + rand() * 0.3);
  const t = 0.55 + rand() * 0.25;
  const x = -0.07 + vx * t;
  const z = -0.02 + vz * t;
  const y = SY - 0.02 - 4.9 * t * t * 0.5;
  const finalY = Math.max(y, 0.012);
  const quat = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(rand() * Math.PI * 2, rand() * Math.PI * 2, rand() * Math.PI * 2),
  );
  return { position: new THREE.Vector3(x, finalY, z), quaternion: quat };
}

/** 弹壳飞行（抛壳口 → 地面）。 */
const EJECT_ORIGIN = new THREE.Vector3(-0.055, 0.01 + SY, -0.02);
const FLIGHT_END = 0.5;

function caseFlight(shot: number, u: number, out: { pos: THREE.Vector3; quat: THREE.Quaternion }): void {
  const rand = mulberry(0x31bd + shot * 257);
  const vx = -(0.4 + rand() * 0.6);
  const vy = -(0.1 + rand() * 0.3);
  const vz = (rand() - 0.5) * 0.3;
  const t = u * FLIGHT_END;
  out.pos.set(
    EJECT_ORIGIN.x + vx * t,
    EJECT_ORIGIN.y + vy * t - 4.9 * t * t * 0.5,
    EJECT_ORIGIN.z + vz * t,
  );
  out.quat.setFromEuler(new THREE.Euler(rand() * 9 * t, rand() * 9 * t, rand() * 9 * t));
}

/** 射击模式 holder。 */
let m134Mode: "auto" | "semi" | "idle" = "idle";
export function setM134Mode(mode: "auto" | "semi" | "idle"): void {
  m134Mode = mode;
}
export function getM134Mode(): "auto" | "semi" | "idle" {
  return m134Mode;
}

export function animateM134(
  assembled: AssembledModel,
  seconds: number,
  mode: "auto" | "semi" | "idle" = "auto",
): void {
  const rotor = assembled.getNode("M134Rotor");
  const gear = assembled.getNode("M134Gear");
  const t = mode === "idle" ? 0 : seconds;

  // ---- 转子 + 减速齿轮恒速旋转（外能源：没有往复，只有转）----
  const angle = t * OMEGA;
  if (rotor) rotor.rotation.z = angle;
  if (gear) gear.rotation.z = angle * 0.28; // 36:10 减速比的反向表达

  // ---- 6 套独立枪机：随转子公转 + 凸轮槽驱动的往复 ----
  const bolt = assembled.getPart("m134.bolt.bolt");
  const matrix = new THREE.Matrix4();
  const tmp = new THREE.Matrix4();
  const detailMatrix = new THREE.Matrix4();
  const detailOffset = new THREE.Matrix4();
  if (bolt) {
    for (let i = 0; i < bolt.instances.length; i++) {
      const theta = angle + (i / COUNT) * Math.PI * 2;
      // 凸轮槽：击发位（+90°，正上方）枪机最前；抛壳位（-90°）最后
      const cam = 0.5 - 0.5 * Math.cos(theta - Math.PI / 2);
      const z = -BOLT_STROKE * cam;
      matrix.makeRotationZ(theta);
      matrix.setPosition(Math.cos(theta) * RING_R, Math.sin(theta) * RING_R + SY, -0.02 + z);
      tmp.makeRotationZ(theta);
      matrix.multiply(tmp.invert());
      bolt.setInstanceMatrix(i, matrix);
      // 每套枪机的子件跟随同一公转/往复矩阵，只叠加各自的局部偏移。
      for (const [id, offset] of Object.entries(M134_BOLT_DETAIL_OFFSETS)) {
        const handle = assembled.getPart(id);
        if (!handle) continue;
        detailOffset.makeTranslation(offset[0], offset[1], offset[2]);
        detailMatrix.copy(matrix).multiply(detailOffset);
        handle.setInstanceMatrix(i, detailMatrix);
      }
    }
  }

  // ---- 击发：每根枪管经过击发位（+90°）时击发 ----
  const shotsPerSec = (COUNT * RPM) / 60; // 30 发/秒
  const totalShots = Math.floor(t * shotsPerSec);
  const sinceShot = (t * shotsPerSec) % 1;
  const firing = mode !== "idle" && sinceShot < 0.35; // 击发瞬间的焰光脉冲

  // 枪口焰 / 曳光：只在击发位闪
  const flash = assembled.getPart("m134.fx.muzzle_flash");
  if (flash) {
    const s = firing ? 1 : 0.0001;
    matrix.makeScale(s, s, s);
    flash.setInstanceMatrix(0, matrix);
  }

  // ---- 供弹：弹链随射速步进（每发一节）----
  const shift = (totalShots % BELT_LINKS) * BELT_PITCH;
  const link = assembled.getPart("m134.belt.link");
  if (link) {
    for (let i = 0; i < link.instances.length; i++) {
      const idx = (i + totalShots) % BELT_LINKS;
      const x = BELT_X0 - (idx - BELT_LINKS + 1) * BELT_PITCH;
      matrix.makeRotationY(Math.PI / 2);
      matrix.setPosition(x - shift * 0, BELT_Y + SY, BELT_Z);
      link.setInstanceMatrix(i, matrix);
    }
  }
  // 链上弹：随链走 + 进弹位那发被拉入转子
  const roundParts = [
    { id: "m134.feed.case", offset: 0 },
    { id: "m134.feed.propellant", offset: 0.026 },
    { id: "m134.feed.bullet", offset: 0.057 },
    { id: "m134.feed.core_lead", offset: 0.0555 },
    { id: "m134.feed.core_steel", offset: 0.049 },
  ];
  for (const { id, offset } of roundParts) {
    const handle = assembled.getPart(id);
    if (!handle) continue;
    for (let i = 0; i < handle.instances.length; i++) {
      const idx = (i + totalShots) % BELT_LINKS;
      const x = BELT_X0 - (idx - BELT_LINKS + 1) * BELT_PITCH;
      matrix.makeTranslation(x, BELT_Y + SY, BELT_Z - 0.0285 + offset);
      handle.setInstanceMatrix(i, matrix);
    }
  }

  // ---- 弹壳瀑布：连续抛出（14 槽循环）----
  const brass = assembled.getPart("m134.fx.brass");
  if (brass) {
    for (let i = 0; i < brass.instances.length; i++) {
      // 槽 i 服务最近一次「编号 mod 14 == i」的击发
      let shot = totalShots - ((totalShots - i) % CASES);
      if (shot < 0) shot = i;
      const shotTime = shot / shotsPerSec;
      const dt = t - shotTime;
      if (mode === "idle" || shot <= 0 || dt < 0 || dt > 2.5) {
        matrix.makeScale(0, 0, 0);
      } else if (dt < FLIGHT_END) {
        const out = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() };
        caseFlight(shot, dt / FLIGHT_END, out);
        matrix.compose(out.pos, out.quat, new THREE.Vector3(1, 1, 1));
      } else {
        const { position, quaternion } = brassPose(shot);
        matrix.compose(position, quaternion, new THREE.Vector3(1, 1, 1));
      }
      brass.setInstanceMatrix(i, matrix);
    }
  }
}

/** motionParts：由 animate 直接改写实例矩阵的零件。 */
export const M134_MOTION_PARTS = [
  "m134.bolt.bolt",
  "m134.bolt.carrier",
  "m134.bolt.firing_pin",
  "m134.bolt.extractor",
  "m134.bolt.cam_pin",
  "m134.bolt.return_spring",
  "m134.bolt.locking_lug",
  "m134.bolt.roller",
  "m134.bolt.roller_pin",
  "m134.bolt.extractor_spring",
  "m134.belt.link",
  "m134.feed.case",
  "m134.feed.bullet",
  "m134.feed.core_lead",
  "m134.feed.core_steel",
  "m134.feed.propellant",
  "m134.fx.brass",
  "m134.fx.muzzle_flash",
];
