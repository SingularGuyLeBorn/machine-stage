import * as THREE from "three";
import type { AssembledModel } from "../../assembler/assembler";
import { MBT, MBT_TRACK_LINKS_PER_SIDE, MBT_TRACK_PERIMETER, mbtTrackPose } from "../mbt/constants";
import { MBT_MOTION_PARTS, animateMbt } from "../mbt/motion";
import {
  CHARGE_FLAP_NODE,
  ED,
  EV_FX,
  HIT_PACK,
  MOTOR_L_NODE,
  MOTOR_R_NODE,
  packCenter,
} from "./constants";

// ============================================================================
// models/edrive/motion —— 电驱特性动画
//
// 共享底盘/炮塔/装填/击发逻辑仍由 animateMbt 驱动：用一个 ID 代理把 mbt90.*
// 映射到 ed90.*（节点名不变），因此不需要复制 MBT 的运动代码。
// 这里补：双电机差速、静音/瞬扭/回收、快充桩与热失控 FX、电量遥测。
// ============================================================================

export const EDRIVE_MOTION_PARTS = MBT_MOTION_PARTS.map((id) => id.replace(/^mbt90\./, "ed90."));
const TRACK_PARTS = EDRIVE_MOTION_PARTS;

const CHARGE_FX = [EV_FX.chargerPost, EV_FX.chargeCable, EV_FX.chargePlug, EV_FX.chargeArc];
const REGEN_FX = [EV_FX.regenGlowL, EV_FX.regenGlowR];
const FIRE_FX = [EV_FX.batteryFire, EV_FX.batterySmoke, EV_FX.batterySparks];
const ALL_EV_FX = [...CHARGE_FX, ...REGEN_FX, ...FIRE_FX, EV_FX.powerFlow];

const proxies = new WeakMap<AssembledModel, AssembledModel>();
function motionView(assembled: AssembledModel): AssembledModel {
  const cached = proxies.get(assembled);
  if (cached) return cached;
  const proxy = new Proxy(assembled, {
    get(target, prop) {
      if (prop === "getPart") return (id: string) => target.getPart(id.replace(/^mbt90\./, "ed90."));
      const value = Reflect.get(target, prop, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  proxies.set(assembled, proxy);
  return proxy;
}

function setVisible(assembled: AssembledModel, id: string, visible: boolean): void {
  const handle = assembled.getPart(id);
  if (handle) handle.object.visible = visible;
}

function hideEvFx(assembled: AssembledModel): void {
  for (const id of ALL_EV_FX) setVisible(assembled, id, false);
}

function trackOffset(partId: string, index: number): [number, number, number] {
  if (partId.includes("track_pad")) return [0, 0.022, 0];
  if (partId.includes("track_pin")) return [0, 0, 0.056];
  if (partId.includes("end_connector_l")) return [-0.17, 0, 0.05];
  if (partId.includes("end_connector_r")) return [0.17, 0, 0.05];
  if (partId.includes("track_bolt")) return [index % 2 === 0 ? -0.12 : 0.12, 0.018, -0.028];
  return [0, 0, 0];
}

/** 左右履带以不同距离推进（电机独立驱动）。 */
function animateDifferential(assembled: AssembledModel, left: number, right: number): void {
  for (const id of TRACK_PARTS) {
    const handle = assembled.getPart(id);
    if (!handle) continue;
    const bolt = id.includes("track_bolt");
    for (const instance of handle.instances) {
      const link = bolt ? Math.floor(instance.index / 2) : instance.index;
      const side = link % 2 === 0 ? 1 : -1;
      const k = link % MBT_TRACK_LINKS_PER_SIDE;
      const distance = side === 1 ? right : left;
      const pose = mbtTrackPose((k / MBT_TRACK_LINKS_PER_SIDE) * MBT_TRACK_PERIMETER - distance);
      const off = trackOffset(id, instance.index);
      const matrix = new THREE.Matrix4()
        .makeRotationX(pose.angle)
        .setPosition(side * MBT.WHEEL_X, pose.y, pose.z)
        .multiply(new THREE.Matrix4().makeTranslation(off[0], off[1], off[2]));
      handle.setInstanceMatrix(instance.index, matrix);
    }
  }
  for (let i = 0; i < 14; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    const distance = side === 1 ? right : left;
    const node = assembled.getNode(`MBT_Wheel_${i}`);
    if (node) node.rotation.x = -distance / MBT.WHEEL_R;
  }
  for (const [name, side] of [
    ["MBT_Sprocket_L", -1],
    ["MBT_Sprocket_R", 1],
  ] as const) {
    const node = assembled.getNode(name);
    if (node) node.rotation.x = -((side === 1 ? right : left) / MBT.WHEEL_R) * 0.8;
  }
  for (const [name, side] of [
    ["MBT_Idler_L", -1],
    ["MBT_Idler_R", 1],
  ] as const) {
    const node = assembled.getNode(name);
    if (node) node.rotation.x = ((side === 1 ? right : left) / MBT.WHEEL_R) * 0.9;
  }
  for (let i = 0; i < 8; i++) {
    const side = i < 4 ? 1 : -1;
    const node = assembled.getNode(`MBT_Roller_${i}`);
    if (node) node.rotation.x = ((side === 1 ? right : left) / MBT.WHEEL_R) * 1.3;
  }
  const ml = assembled.getNode(MOTOR_L_NODE);
  if (ml) ml.rotation.x = -left / 0.135;
  const mr = assembled.getNode(MOTOR_R_NODE);
  if (mr) mr.rotation.x = -right / 0.135;
}

export const EDRIVE_TELEMETRY: {
  soc: number;
  powerKw: number;
  rpmL: number;
  rpmR: number;
  tempC: number;
  noiseDb: number;
  mode: string;
} = {
  soc: ED.SOC_START,
  powerKw: 0,
  rpmL: 0,
  rpmR: 0,
  tempC: 32,
  noiseDb: 38,
  mode: "静音待机",
};

let lastState = "idle";
let lastT = 0;

function updateTelemetry(state: string, t: number): void {
  const dt = state === lastState ? Math.max(0, Math.min(0.15, t - lastT)) : 0;
  lastState = state;
  lastT = t;
  const tel = EDRIVE_TELEMETRY;
  if (state === "charging") {
    tel.soc = Math.min(100, tel.soc + dt * 3.2);
    tel.powerKw = 350;
    tel.rpmL = 0;
    tel.rpmR = 0;
    tel.tempC = 30 + Math.min(8, t * 0.3);
    tel.noiseDb = 35;
    tel.mode = "快充 · 800V";
  } else if (state === "regen") {
    tel.soc = Math.min(100, tel.soc + dt * 0.45);
    tel.powerKw = -420;
    tel.rpmL = 1800;
    tel.rpmR = 1800;
    tel.tempC = 40;
    tel.noiseDb = 40;
    tel.mode = "能量回收";
  } else if (state === "silent_drive") {
    tel.soc = Math.max(5, tel.soc - dt * 0.05);
    tel.powerKw = 260;
    tel.rpmL = 2200;
    tel.rpmR = 2200;
    tel.tempC = 38;
    tel.noiseDb = 42;
    tel.mode = "静音行驶";
  } else if (state === "boost") {
    tel.soc = Math.max(5, tel.soc - dt * 0.18);
    tel.powerKw = 1200;
    tel.rpmL = 5200;
    tel.rpmR = 5200;
    tel.tempC = 55;
    tel.noiseDb = 48;
    tel.mode = "瞬时扭矩";
  } else if (state === "e_steer_left") {
    tel.soc = Math.max(5, tel.soc - dt * 0.08);
    tel.powerKw = 700;
    tel.rpmL = 900;
    tel.rpmR = 3200;
    tel.tempC = 44;
    tel.noiseDb = 44;
    tel.mode = "电动差速左转";
  } else if (state === "e_steer_right") {
    tel.soc = Math.max(5, tel.soc - dt * 0.08);
    tel.powerKw = 700;
    tel.rpmL = 3200;
    tel.rpmR = 900;
    tel.tempC = 44;
    tel.noiseDb = 44;
    tel.mode = "电动差速右转";
  } else if (state === "battery_hit" || state === "thermal_runaway") {
    tel.soc = Math.max(0, tel.soc - dt * (state === "battery_hit" ? 4 : 1.2));
    tel.powerKw = 0;
    tel.rpmL = 0;
    tel.rpmR = 0;
    tel.tempC = Math.min(900, 32 + t * (state === "battery_hit" ? 180 : 80));
    tel.noiseDb = 60;
    tel.mode = "电池热失控";
  } else if (state === "aim" || state === "fire" || state === "loading") {
    tel.powerKw = 0;
    tel.rpmL = 0;
    tel.rpmR = 0;
    tel.tempC = tel.tempC > 45 ? tel.tempC - dt * 10 : 32;
    tel.noiseDb = 36;
    tel.mode = "火炮工况";
  } else {
    tel.powerKw = 0;
    tel.rpmL = 0;
    tel.rpmR = 0;
    tel.tempC = tel.tempC > 32 ? Math.max(32, tel.tempC - dt * 6) : 32;
    tel.noiseDb = 36;
    tel.mode = "静音待机";
  }
}

export function edriveReadouts(): Array<{ label: string; value: string }> {
  const tel = EDRIVE_TELEMETRY;
  return [
    { label: "电量", value: `${tel.soc.toFixed(0)}%` },
    { label: "母线", value: "800V" },
    { label: "功率", value: `${tel.powerKw >= 0 ? "+" : ""}${tel.powerKw.toFixed(0)}kW` },
    { label: "电机L/R", value: `${tel.rpmL.toFixed(0)} / ${tel.rpmR.toFixed(0)} rpm` },
    { label: "电池温度", value: `${tel.tempC.toFixed(0)}°C` },
    { label: "模式", value: tel.mode },
  ];
}

function animateChargeFx(assembled: AssembledModel, t: number): void {
  for (const id of CHARGE_FX) setVisible(assembled, id, true);
  const arc = assembled.getPart(EV_FX.chargeArc);
  if (arc) {
    arc.object.visible = Math.sin(t * 18) > 0.2;
    arc.object.scale.setScalar(0.7 + Math.sin(t * 22) * 0.3);
  }
  const cable = assembled.getPart(EV_FX.chargeCable);
  if (cable) cable.object.visible = true;
  const flap = assembled.getNode(CHARGE_FLAP_NODE);
  if (flap) flap.rotation.z = -1.25;
}

function animateThermalFx(assembled: AssembledModel, t: number, hit: boolean): void {
  for (const id of FIRE_FX) setVisible(assembled, id, true);
  const fire = assembled.getPart(EV_FX.batteryFire);
  if (fire) {
    fire.object.visible = t < (hit ? 6 : 14);
    fire.object.scale.setScalar(0.7 + Math.min(1.3, t * 0.45));
  }
  const smoke = assembled.getPart(EV_FX.batterySmoke);
  if (smoke) {
    smoke.object.visible = t < (hit ? 8 : 16);
    smoke.object.scale.setScalar(0.7 + Math.min(1.2, t * 0.3));
  }
  const sparks = assembled.getPart(EV_FX.batterySparks);
  if (sparks) sparks.object.visible = Math.sin(t * 20) > -0.2;
  const top = assembled.getPart(`ed90.battery.pack${HIT_PACK + 1}_shell_top`);
  if (top) top.object.visible = false;
  const glow = assembled.getPart(EV_FX.powerFlow);
  if (glow) glow.object.visible = hit && t < 2.5;
}

export function animateEdrive(assembled: AssembledModel, seconds: number, state?: string): void {
  const current = state ?? "idle";
  const view = motionView(assembled);
  hideEvFx(assembled);
  const flap = assembled.getNode(CHARGE_FLAP_NODE);
  if (flap) flap.rotation.z = 0;
  updateTelemetry(current, seconds);

  if (current === "silent_drive" || current === "boost" || current === "regen" || current === "e_steer_left" || current === "e_steer_right") {
    animateMbt(view, seconds, "drive");
    let left = seconds * 1.7;
    let right = seconds * 1.7;
    if (current === "boost") {
      left = right = seconds * 4.2;
    } else if (current === "regen") {
      left = right = seconds * 0.7;
    } else if (current === "e_steer_left") {
      left = seconds * 0.75;
      right = seconds * 2.7;
    } else if (current === "e_steer_right") {
      left = seconds * 2.7;
      right = seconds * 0.75;
    }
    animateDifferential(assembled, left, right);
    assembled.root.rotation.y =
      current === "e_steer_left" ? -0.16 : current === "e_steer_right" ? 0.16 : 0;
    if (current === "regen") {
      for (const id of REGEN_FX) setVisible(assembled, id, true);
      setVisible(assembled, EV_FX.powerFlow, true);
    }
    if (current === "boost") setVisible(assembled, EV_FX.powerFlow, true);
    return;
  }

  if (current === "charging") {
    animateMbt(view, seconds, "idle");
    animateChargeFx(assembled, seconds);
    const ml = assembled.getNode(MOTOR_L_NODE);
    const mr = assembled.getNode(MOTOR_R_NODE);
    if (ml) ml.rotation.x = 0;
    if (mr) mr.rotation.x = 0;
    return;
  }

  if (current === "battery_hit" || current === "thermal_runaway") {
    animateMbt(view, seconds, "idle");
    animateThermalFx(assembled, seconds, current === "battery_hit");
    return;
  }

  const shared = current === "aim" || current === "loading" || current === "fire" || current === "hunter_killer"
    ? current
    : "idle";
  animateMbt(view, seconds, shared);
  const ml = assembled.getNode(MOTOR_L_NODE);
  const mr = assembled.getNode(MOTOR_R_NODE);
  if (ml) ml.rotation.x = 0;
  if (mr) mr.rotation.x = 0;
}

export function edriveChargeStateOf(): { packCenter: [number, number, number] } {
  return { packCenter: packCenter(HIT_PACK) };
}
