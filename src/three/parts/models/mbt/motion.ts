import * as THREE from "three";
import type { AssembledModel } from "../../assembler/assembler";
import { MBT, MBT_TRACK_LINKS_PER_SIDE, MBT_TRACK_PERIMETER, mbtTrackPose } from "./constants";
import {
  V12,
  bankAxis,
  crankAngleForTime,
  cylinderInfo,
  enginePoint,
  solveCylinder,
  valveLiftFactor,
} from "./engine/kinematics";
import {
  ENGINE_CAM_NODES,
  ENGINE_CRANK_NODE,
  ENGINE_FAN_NODES,
  ENGINE_IDLER_NODE,
  ENGINE_TURBO_NODES,
  pistonNodeName,
  pushrodNodeName,
  rockerNodeName,
  rodNodeName,
  springNodeName,
  valveNodeName,
} from "./engine/registry";
import { TRANS_NODES } from "./transmission/registry";
import {
  BLOWOUT_L,
  BLOWOUT_R,
  CAROUSEL_NODE,
  CITV_NODE,
  EJECTED_CASE_NODE,
  LOAD_ARM_NODE,
  LOAD_ROUND_NODE,
  RAMMER_NODE,
} from "./interior/registry";

// ============================================================================
// models/mbt/motion —— 整机交互动画
//
// 状态：
//   engine_start 起动电机拖动 → 逐缸点火 → 怠速
//   running      怠速（曲轴/活塞/48 气门/凸轮/双涡轮/风扇全动）
//   drive        行进（差速履带/14 轮滚动/悬挂起伏/传动齿轮）
//   suspension   悬挂演示（14 站独立液气悬挂）
//   aim          炮塔回转 + 火炮俯仰（带阻尼）
//   loading      自动装弹机：转盘选弹 → 提弹 → 推弹入膛 → 关闩
//   fire         击发：后坐 → 炮口焰 → 抽烟装置排烟 → 抛壳
//   era_hit      ERA 被击中：单块爆炸 + 来袭弹被推开
//   blowout      尾舱弹药架中弹：泄压板掀开 + 喷火泄压
//   detonation   泄压失败：炮塔掀飞 + 殉爆火球
//   hunter_killer 车长热像仪发现 → 炮塔转向 → 炮长击发
// ============================================================================

export const MBT_MOTION_PARTS = [
  "mbt90.running.track_link",
  "mbt90.running.track_pad",
  "mbt90.running.track_pin",
  "mbt90.running.end_connector_l",
  "mbt90.running.end_connector_r",
  "mbt90.running.track_bolt",
];

const TRACK_PARTS = MBT_MOTION_PARTS;
const FX_PARTS = [
  "mbt90.interior.muzzle_flash",
  "mbt90.interior.evacuator_smoke",
  "mbt90.interior.era_fireball",
  "mbt90.interior.era_debris",
  "mbt90.interior.incoming_round",
  "mbt90.interior.blowout_fire",
  "mbt90.interior.blowout_smoke",
  "mbt90.interior.detonation_fire",
  "mbt90.interior.demo_penetrator",
  "mbt90.interior.demo_sabot",
  "mbt90.interior.demo_case",
  "mbt90.interior.ejected_case",
];
const ERA_PARTS = [
  "mbt90.hull.era_glacis_casing",
  "mbt90.hull.era_glacis_liner",
  "mbt90.hull.era_glacis_explosive",
  "mbt90.hull.era_glacis_flyer",
  "mbt90.hull.era_glacis_cover",
  "mbt90.hull.era_glacis_bolt",
];
const HIT_BLOCK = 12;

const DOWN = new THREE.Vector3(0, -1, 0);
const X_AXIS = new THREE.Vector3(1, 0, 0);
const scratchQuat = new THREE.Quaternion();

function setPartVisible(assembled: AssembledModel, id: string, visible: boolean): void {
  const handle = assembled.getPart(id);
  if (handle) handle.object.visible = visible;
}

function hideFx(assembled: AssembledModel): void {
  for (const id of FX_PARTS) setPartVisible(assembled, id, false);
}

function restorePart(assembled: AssembledModel, id: string): void {
  const handle = assembled.getPart(id);
  if (!handle) return;
  for (const instance of handle.instances) handle.setInstanceMatrix(instance.index, instance.restMatrix);
}

function restoreEra(assembled: AssembledModel): void {
  for (const id of ERA_PARTS) restorePart(assembled, id);
}

function restPos(assembled: AssembledModel, name: string): THREE.Vector3 {
  const matrix = assembled.nodeRest.get(name);
  if (!matrix) return new THREE.Vector3();
  const p = new THREE.Vector3();
  matrix.decompose(p, new THREE.Quaternion(), new THREE.Vector3());
  return p;
}
function restQuat(assembled: AssembledModel, name: string): THREE.Quaternion {
  const matrix = assembled.nodeRest.get(name);
  if (!matrix) return new THREE.Quaternion();
  const q = new THREE.Quaternion();
  matrix.decompose(new THREE.Vector3(), q, new THREE.Vector3());
  return q;
}

// ---------------------------------------------------------------------------
// 发动机
// ---------------------------------------------------------------------------
function animateEngine(assembled: AssembledModel, t: number, state: string): void {
  const angle = crankAngleForTime(t, state);
  const crank = assembled.getNode(ENGINE_CRANK_NODE);
  if (crank) crank.rotation.x = angle;
  for (const name of ENGINE_CAM_NODES) {
    const cam = assembled.getNode(name);
    if (cam) cam.rotation.x = angle / 2;
  }
  const idler = assembled.getNode(ENGINE_IDLER_NODE);
  if (idler) idler.rotation.x = -angle * 0.7;
  for (const name of ENGINE_TURBO_NODES) {
    const turbo = assembled.getNode(name);
    if (turbo) turbo.rotation.x = angle * 4.2;
  }
  for (const name of ENGINE_FAN_NODES) {
    const fan = assembled.getNode(name);
    if (fan) fan.rotation.x = angle * 2.4;
  }
  const pump = assembled.getNode("MBT_WaterPump");
  if (pump) pump.rotation.x = angle * 1.4;

  for (let i = 0; i < 12; i++) {
    const ord = i + 1;
    const info = cylinderInfo(i);
    const pose = solveCylinder(i, angle);
    const wrist = new THREE.Vector3(...enginePoint([pose.wristPin.x, pose.wristPin.y, pose.wristPin.z]));
    const piston = assembled.getNode(pistonNodeName(ord));
    if (piston) piston.position.copy(wrist);
    const rod = assembled.getNode(rodNodeName(ord));
    if (rod) {
      rod.position.copy(wrist);
      rod.quaternion.setFromUnitVectors(DOWN, pose.rodDir);
    }
    const axis = bankAxis(info.betaDeg);
    for (const kind of ["I1", "I2", "E1", "E2"] as const) {
      const intake = kind.startsWith("I");
      const f = valveLiftFactor(i, intake ? "intake" : "exhaust", angle);
      const lift = f * V12.VALVE_LIFT;
      const valve = assembled.getNode(valveNodeName(ord, kind));
      if (valve) {
        const base = restPos(assembled, valveNodeName(ord, kind));
        valve.position.copy(base).addScaledVector(axis, -lift);
      }
      const spring = assembled.getNode(springNodeName(ord, kind));
      if (spring) spring.scale.y = 1 - (lift / V12.SPRING_FREE) * 0.9;
      const pushrod = assembled.getNode(pushrodNodeName(ord, intake ? "I" : "E"));
      if (pushrod) {
        const base = restPos(assembled, pushrodNodeName(ord, intake ? "I" : "E"));
        pushrod.position.copy(base).addScaledVector(axis, lift * 0.4);
      }
    }
    for (const kind of ["I", "E"] as const) {
      const rocker = assembled.getNode(rockerNodeName(ord, kind));
      if (!rocker) continue;
      const f1 = valveLiftFactor(i, "intake", angle);
      const f2 = valveLiftFactor(i, "exhaust", angle);
      const amount = (kind === "I" ? f1 : f2) * 0.16;
      const sign = kind === "I" ? -1 : 1;
      rocker.quaternion.copy(restQuat(assembled, rockerNodeName(ord, kind)));
      scratchQuat.setFromAxisAngle(X_AXIS, sign * amount);
      rocker.quaternion.multiply(scratchQuat);
    }
  }

  const running = state !== "idle" && state !== "aim" && state !== "loading" && state !== "fire";
  if (!running) {
    // 非发动机状态：曲轴/活塞回到静止姿态（resetNodes 已做，这里不覆盖）
  }
}

// ---------------------------------------------------------------------------
// 行进 / 悬挂 / 履带
// ---------------------------------------------------------------------------
function trackOffset(partId: string, index: number): [number, number, number] {
  if (partId.includes("track_pad")) return [0, 0.022, 0];
  if (partId.includes("track_pin")) return [0, 0, 0.056];
  if (partId.includes("end_connector_l")) return [-0.17, 0, 0.05];
  if (partId.includes("end_connector_r")) return [0.17, 0, 0.05];
  if (partId.includes("track_bolt")) return [index % 2 === 0 ? -0.12 : 0.12, 0.018, -0.028];
  return [0, 0, 0];
}

function animateTrack(assembled: AssembledModel, distance: number): void {
  for (const id of TRACK_PARTS) {
    const handle = assembled.getPart(id);
    if (!handle) continue;
    const bolt = id.includes("track_bolt");
    for (const instance of handle.instances) {
      const link = bolt ? Math.floor(instance.index / 2) : instance.index;
      const side = link % 2 === 0 ? 1 : -1;
      const k = link % MBT_TRACK_LINKS_PER_SIDE;
      const pose = mbtTrackPose((k / MBT_TRACK_LINKS_PER_SIDE) * MBT_TRACK_PERIMETER - distance);
      const off = trackOffset(id, instance.index);
      const matrix = new THREE.Matrix4()
        .makeRotationX(pose.angle)
        .setPosition(side * MBT.WHEEL_X, pose.y, pose.z)
        .multiply(new THREE.Matrix4().makeTranslation(off[0], off[1], off[2]));
      handle.setInstanceMatrix(instance.index, matrix);
    }
  }
}

function suspend(assembled: AssembledModel, t: number, amount: number): void {
  for (let i = 0; i < 14; i++) {
    const station = Math.floor(i / 2);
    const side = i % 2 === 0 ? 1 : -1;
    const travel = Math.sin(t * 2.2 + station * 0.9 + (side === 1 ? 0 : 0.7)) * amount;
    const wheel = assembled.getNode(`MBT_Wheel_${i}`);
    if (wheel) {
      wheel.position.y = MBT.WHEEL_Y + travel;
      wheel.rotation.x = wheel.rotation.x; // 旋转由行进状态设置
    }
    const arm = assembled.getNode(`MBT_Arm_${i}`);
    if (arm) arm.rotation.z = (-side * travel) / 0.48;
    const rod = assembled.getNode(`MBT_Rod_${i}`);
    if (rod) rod.position.y = 0.62 + travel * 0.8;
  }
}

function spinWheels(assembled: AssembledModel, distance: number): void {
  const spin = distance / MBT.WHEEL_R;
  for (let i = 0; i < 14; i++) {
    const wheel = assembled.getNode(`MBT_Wheel_${i}`);
    if (wheel) wheel.rotation.x = -spin;
  }
  for (const name of ["MBT_Sprocket_L", "MBT_Sprocket_R"]) {
    const node = assembled.getNode(name);
    if (node) node.rotation.x = -spin;
  }
  for (const name of ["MBT_Idler_L", "MBT_Idler_R"]) {
    const node = assembled.getNode(name);
    if (node) node.rotation.x = spin * 1.15;
  }
  for (let i = 0; i < 8; i++) {
    const node = assembled.getNode(`MBT_Roller_${i}`);
    if (node) node.rotation.x = spin * 1.3;
  }
  const input = assembled.getNode(TRANS_NODES.input);
  if (input) input.rotation.z = spin * 1.6;
  const main = assembled.getNode(TRANS_NODES.main);
  if (main) main.rotation.z = spin * 0.9;
  const finalL = assembled.getNode(TRANS_NODES.finalL);
  if (finalL) finalL.rotation.x = -spin * 0.6;
  const finalR = assembled.getNode(TRANS_NODES.finalR);
  if (finalR) finalR.rotation.x = -spin * 0.6;
  const steer = assembled.getNode(TRANS_NODES.steer);
  if (steer) steer.rotation.z = spin * 0.3;
}

// ---------------------------------------------------------------------------
// 主炮 / 装填 / 特效
// ---------------------------------------------------------------------------
function applyDamped(node: THREE.Object3D | undefined, target: number, dt = 1): void {
  if (!node) return;
  node.rotation.y += (target - node.rotation.y) * Math.min(1, dt * 0.18);
}

function animateLoading(assembled: AssembledModel, t: number): void {
  const cycle = t % 6;
  const carousel = assembled.getNode(CAROUSEL_NODE);
  if (carousel) carousel.rotation.y = -Math.floor(cycle / 1.1) * (Math.PI * 2) / 22;
  const arm = assembled.getNode(LOAD_ARM_NODE);
  const round = assembled.getNode(LOAD_ROUND_NODE);
  const rammer = assembled.getNode(RAMMER_NODE);
  const breech = assembled.getNode("MBT_BreechBlock");
  const lift = THREE.MathUtils.smoothstep(cycle, 0.8, 2.2);
  const push = THREE.MathUtils.smoothstep(cycle, 2.4, 3.4);
  if (arm) arm.rotation.x = -lift * 1.15;
  if (round) {
    const y = 1.0 + lift * 0.98;
    const z = 0.45 + push * 0.75;
    round.position.set(0, y, z);
    round.quaternion.setFromEuler(new THREE.Euler(lift * Math.PI * 0.5, 0, 0));
  }
  if (rammer) rammer.position.z = 0.48 + push * 0.62;
  if (breech) breech.position.y = -0.14 * THREE.MathUtils.smoothstep(cycle, 3.4, 3.9);
  const show = cycle > 0.7 && cycle < 4.2;
  for (const id of ["mbt90.interior.demo_penetrator", "mbt90.interior.demo_sabot", "mbt90.interior.demo_case"]) {
    setPartVisible(assembled, id, show);
  }
}

function animateFire(assembled: AssembledModel, t: number): void {
  const u = t % 4.5;
  const kick = u < 0.12 ? u / 0.12 : Math.exp(-6 * (u - 0.12)) * Math.cos(24 * Math.max(0, u - 0.12));
  const recoil = assembled.getNode("GunRecoil");
  if (recoil) recoil.position.z = -0.34 * kick;
  const flash = assembled.getPart("mbt90.interior.muzzle_flash");
  if (flash) {
    const visible = u < 0.09;
    flash.object.visible = visible;
    if (visible) flash.object.scale.setScalar(0.9 + u * 8);
  }
  const smoke = assembled.getPart("mbt90.interior.evacuator_smoke");
  if (smoke) {
    smoke.object.visible = u > 0.12 && u < 2.2;
    if (smoke.object.visible) smoke.object.scale.setScalar(0.6 + (u - 0.12) * 1.2);
  }
  const breech = assembled.getNode("MBT_BreechBlock");
  if (breech) breech.position.y = u > 0.8 && u < 2.8 ? -0.16 : 0;
  const ejected = assembled.getNode(EJECTED_CASE_NODE);
  if (ejected) {
    const show = u > 1.2 && u < 4.3;
    setPartVisible(assembled, "mbt90.interior.ejected_case", show);
    if (show) {
      const k = u - 1.2;
      ejected.position.set(0.15 + k * 0.25, 1.98 - 2.2 * k * k, 0.9 + k * 0.6);
      ejected.rotation.set(k * 4, k * 2, 0);
    }
  }
}

function animateEraHit(assembled: AssembledModel, t: number): void {
  for (const id of ERA_PARTS) {
    const handle = assembled.getPart(id);
    if (!handle) continue;
    for (const instance of handle.instances) {
      if (instance.index === HIT_BLOCK) {
        const m = new THREE.Matrix4().copy(instance.restMatrix).scale(new THREE.Vector3(0.001, 0.001, 0.001));
        handle.setInstanceMatrix(instance.index, m);
      }
    }
  }
  const fire = assembled.getPart("mbt90.interior.era_fireball");
  if (fire) {
    fire.object.visible = t < 2.6;
    fire.object.scale.setScalar(0.6 + Math.min(1.8, t * 2.2));
  }
  const debris = assembled.getPart("mbt90.interior.era_debris");
  if (debris) {
    debris.object.visible = t < 2.8;
    debris.object.position.set(0.9 + t * 0.8, 0.2 + t * 0.5, 0.8);
    debris.object.rotation.set(t * 3, t * 2, t * 4);
  }
  const incoming = assembled.getPart("mbt90.interior.incoming_round");
  if (incoming) {
    incoming.object.visible = t < 1.0;
    const k = Math.min(1, t / 0.55);
    incoming.object.position.set(3.2 - 2.0 * k, 2.2 - 0.15 * k, 4.5 - 2.1 * k);
    incoming.object.rotation.set(0, 0, Math.PI / 2);
  }
}

function animateBlowout(assembled: AssembledModel, t: number, detonation: boolean): void {
  const angle = detonation ? 0 : THREE.MathUtils.smoothstep(t, 0.25, 1.1) * 1.75;
  const left = assembled.getNode(BLOWOUT_L);
  const right = assembled.getNode(BLOWOUT_R);
  if (left) left.rotation.z = angle;
  if (right) right.rotation.z = -angle;
  const fire = assembled.getPart("mbt90.interior.blowout_fire");
  if (fire) {
    fire.object.visible = t < 4.5;
    fire.object.scale.setScalar(0.5 + Math.min(2.2, t * 1.6));
  }
  const smoke = assembled.getPart("mbt90.interior.blowout_smoke");
  if (smoke) {
    smoke.object.visible = t < 5.2;
    smoke.object.scale.setScalar(0.6 + Math.min(2.4, t * 1.1));
  }
  if (detonation) {
    const turret = assembled.getNode("Turret");
    if (turret) {
      turret.position.y = Math.min(0.22, t * 0.8);
      turret.rotation.z = Math.sin(t * 8) * 0.01;
    }
    const boom = assembled.getPart("mbt90.interior.detonation_fire");
    if (boom) {
      boom.object.visible = t < 5;
      boom.object.scale.setScalar(0.7 + Math.min(2.6, t * 1.4));
    }
  }
}

function animateHunterKiller(assembled: AssembledModel, t: number): void {
  const citv = assembled.getNode(CITV_NODE);
  if (citv) citv.rotation.y = Math.sin(Math.min(t, 2.2) * 2.2) * 0.7;
  const turret = assembled.getNode("Turret");
  if (turret) {
    const target = t < 2.6 ? 0 : 0.42;
    applyDamped(turret, target, 1 / 30);
  }
  const gun = assembled.getNode("Gun");
  if (gun) {
    const target = t < 3.4 ? 0 : 0.055;
    gun.rotation.x += (target - gun.rotation.x) * 0.08;
  }
  if (t > 5.2) animateFire(assembled, t - 5.2);
}

// ---------------------------------------------------------------------------
// 主入口
// ---------------------------------------------------------------------------
export function animateMbt(assembled: AssembledModel, seconds: number, state?: string): void {
  const t = seconds;
  const current = state ?? "idle";
  hideFx(assembled);
  restoreEra(assembled);
  assembled.root.position.set(0, 0, 0);
  const turret = assembled.getNode("Turret");
  if (turret) turret.position.y = 0;
  const recoil = assembled.getNode("GunRecoil");
  if (recoil) recoil.position.z = 0;
  const breech = assembled.getNode("MBT_BreechBlock");
  if (breech) breech.position.y = 0;
  const rammer = assembled.getNode(RAMMER_NODE);
  if (rammer) rammer.position.z = 0.48;
  const loadRound = assembled.getNode(LOAD_ROUND_NODE);
  if (loadRound) {
    loadRound.position.set(0, 1.0, 0.45);
    loadRound.quaternion.identity();
  }
  const carousel = assembled.getNode(CAROUSEL_NODE);
  if (carousel) carousel.rotation.y = 0;
  const arm = assembled.getNode(LOAD_ARM_NODE);
  if (arm) arm.rotation.x = 0;

  if (current === "engine_start" || current === "running" || current === "drive" || current === "suspension") {
    animateEngine(assembled, t, current);
  }
  if (current === "drive") {
    const distance = t * 2.4;
    animateTrack(assembled, distance);
    spinWheels(assembled, distance);
    suspend(assembled, t, 0.012);
    assembled.root.position.z = Math.sin(t * 0.25) * 0.35;
    assembled.root.position.y = Math.sin(t * 3.2) * 0.004;
  } else if (current === "suspension") {
    animateTrack(assembled, 0.6);
    spinWheels(assembled, 0.6);
    suspend(assembled, t, 0.045);
    assembled.root.position.y = Math.sin(t * 1.8) * 0.01;
  } else if (current === "aim") {
    if (turret) turret.rotation.y = Math.sin(t * 0.45) * 0.4;
    const gun = assembled.getNode("Gun");
    if (gun) gun.rotation.x = Math.sin(t * 0.8) * 0.06;
  } else if (current === "loading") {
    animateLoading(assembled, t);
  } else if (current === "fire") {
    animateFire(assembled, t);
  } else if (current === "era_hit") {
    animateEraHit(assembled, t);
  } else if (current === "blowout") {
    animateBlowout(assembled, t, false);
  } else if (current === "detonation") {
    animateBlowout(assembled, t, true);
  } else if (current === "hunter_killer") {
    animateHunterKiller(assembled, t);
    animateEngine(assembled, t, "running");
  } else if (current !== "idle") {
    // 其它状态：保持装配态
  }

  if (current !== "drive" && current !== "suspension") {
    for (const id of TRACK_PARTS) restorePart(assembled, id);
  }
}
