import * as THREE from "three";
import type { AssembledModel } from "../../assembler/assembler";
import { CV } from "./constants";
import { AIRCRAFT_NODE, HOOK_NODE, WING_FOLD_L, WING_FOLD_R } from "./aircraft";
import { SHUTTLE_NODE, JBD_NODES, WIRE_NODES } from "./flightdeck";
import { RADAR_NODE, CIWS_NODES } from "./island";
import { AMMO_ELEVATOR_NODE, HANGAR_DOOR_NODES } from "./hangar";

// ============================================================================
// models/carrier/motion —— 状态动画
//
// idle   系泊检查（折叠翼/挡焰板平放）
// engine 动力运转（堆芯控制棒/主泵/涡轮/双桨/旋转雷达）
// flight_ops 核心闭环：折叠翼展开 → 弹射滑跑 → 离舰爬升 → 航线回转 →
//            进近放下尾钩 → 钩住第 2 道拦阻索 → 减速停住 → 复位系留
// hangar 机库作业（防火门/弹药升降机）
// ciws   近防（1130 转管 + 随动跟踪）
// ============================================================================

const DECK_TOP = CV.DECK_Y + CV.DECK_T;
const PARK = new THREE.Vector3(CV.AIRCRAFT_PARK[0], DECK_TOP, CV.AIRCRAFT_PARK[1]);
const CAT_START = new THREE.Vector3(CV.CAT_X, DECK_TOP, CV.CAT_Z0);
const CATCH_CENTER_Z = -7.5;
const WIRE_PULL_MAX = 1.5;

const FLIGHT_CURVE = new THREE.CatmullRomCurve3(
  [
    new THREE.Vector3(CV.CAT_X, DECK_TOP + 0.55, CV.CAT_Z1),
    new THREE.Vector3(4.6, DECK_TOP + 4.6, 22.5),
    new THREE.Vector3(-3.6, DECK_TOP + 8.4, 17.0),
    new THREE.Vector3(-8.6, DECK_TOP + 7.4, -4.0),
    new THREE.Vector3(-5.4, DECK_TOP + 4.2, -24.0),
    new THREE.Vector3(0, DECK_TOP + 1.0, -17.5),
  ],
  false,
  "catmullrom",
  0.35,
);

const TAXI_END = 2.5;
const LAUNCH_END = 4.6;
const AIRBORNE_END = 15.8;
const TOUCHDOWN = 16.8;
const CATCH = 17.6;
const STOP = 19.6;
const PARKED = 24.4;
const CYCLE = 30;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const smooth = (v: number) => {
  const u = clamp01(v);
  return u * u * (3 - 2 * u);
};
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;

function setWings(assembled: AssembledModel, fold: number): void {
  const left = assembled.getNode(WING_FOLD_L);
  const right = assembled.getNode(WING_FOLD_R);
  if (left) left.rotation.z = -fold;
  if (right) right.rotation.z = fold;
}

function setAircraftPose(
  assembled: AssembledModel,
  position: THREE.Vector3,
  pitch = 0,
  yaw = 0,
  roll = 0,
): void {
  const aircraft = assembled.getNode(AIRCRAFT_NODE);
  if (!aircraft) return;
  aircraft.position.copy(position);
  aircraft.quaternion.setFromEuler(new THREE.Euler(pitch, yaw, roll, "YXZ"));
}

function setHook(assembled: AssembledModel, angle: number): void {
  const hook = assembled.getNode(HOOK_NODE);
  if (hook) hook.rotation.x = angle;
}

function setWirePull(assembled: AssembledModel, pull: number): void {
  const angle = Math.asin(Math.min(0.94, Math.max(0, pull) / CV.WIRE_HALF));
  const [left, right] = WIRE_NODES[1]!;
  const leftNode = assembled.getNode(left);
  const rightNode = assembled.getNode(right);
  if (leftNode) leftNode.rotation.y = -angle;
  if (rightNode) rightNode.rotation.y = angle;
}

function setJbd(assembled: AssembledModel, raised: number): void {
  const angle = lerp(-Math.PI / 2, 0, raised);
  for (const node of JBD_NODES) {
    const jbd = assembled.getNode(node);
    if (jbd) jbd.rotation.x = angle;
  }
}

function setShuttle(assembled: AssembledModel, z: number): void {
  const shuttle = assembled.getNode(SHUTTLE_NODE);
  if (shuttle) shuttle.position.z = z;
}

function setRotors(assembled: AssembledModel, seconds: number, speed: number): void {
  for (const tag of ["l", "r"] as const) {
    for (const stage of ["hp", "lp"] as const) {
      const rotor = assembled.getNode(`CV_Turbine_${tag}_${stage}`);
      if (rotor) rotor.rotation.z = seconds * speed;
    }
  }
  for (const tag of ["l", "r"] as const) {
    const prop = assembled.getNode(`CV_Prop_${tag}`);
    if (prop) prop.rotation.z = seconds * speed * 1.2;
  }
}

function setControlRods(assembled: AssembledModel, lift: number): void {
  for (let i = 1; i <= 8; i++) {
    const node = assembled.getNode(`CV_CR_${String(i).padStart(2, "0")}`);
    if (!node) continue;
    const rest = new THREE.Vector3();
    assembled.nodeRest.get(node.name)?.decompose(rest, new THREE.Quaternion(), new THREE.Vector3());
    node.position.y = rest.y + lift;
  }
}

function setRadar(assembled: AssembledModel, angle: number): void {
  const radar = assembled.getNode(RADAR_NODE);
  if (radar) radar.rotation.y = angle;
}

function setDoors(assembled: AssembledModel, open: number): void {
  const fold = 1 - smooth(open) * 0.92;
  for (const name of HANGAR_DOOR_NODES) {
    for (const nodeName of [name, `${name}_R`]) {
      const door = assembled.getNode(nodeName);
      if (door) door.scale.x = fold;
    }
  }
}

function setAmmoElevator(assembled: AssembledModel, drop: number): void {
  const platform = assembled.getNode(AMMO_ELEVATOR_NODE);
  if (!platform) return;
  const rest = new THREE.Vector3();
  assembled.nodeRest.get(AMMO_ELEVATOR_NODE)?.decompose(rest, new THREE.Quaternion(), new THREE.Vector3());
  platform.position.y = rest.y + drop;
}

function setCiws(assembled: AssembledModel, seconds: number, active: boolean): void {
  CIWS_NODES.forEach((name, index) => {
    const phase = index * 1.7;
    const turret = assembled.getNode(name);
    if (turret) turret.rotation.y = active ? Math.sin(seconds * 0.55 + phase) * 0.55 : 0;
    const elev = assembled.getNode(`CV_CiwsElev_${index + 1}`);
    if (elev) elev.rotation.x = active ? Math.sin(seconds * 0.8 + phase) * 0.22 : 0;
    const rotor = assembled.getNode(`CV_CiwsRotor_${index + 1}`);
    if (rotor) rotor.rotation.z = active ? seconds * 18 : 0;
  });
}

function flightPose(t: number): {
  position: THREE.Vector3;
  pitch: number;
  yaw: number;
  roll: number;
  shuttleZ: number;
  jbd: number;
  hook: number;
  wingFold: number;
  wirePull: number;
  phase: string;
} {
  const position = PARK.clone();
  let pitch = 0;
  let yaw = 0;
  let roll = 0;
  let shuttleZ: number = CV.CAT_Z0;
  let jbd = 0;
  let hook = 0;
  let wingFold = 0;
  let wirePull = 0;
  let phase = "parked";

  if (t < TAXI_END) {
    // 展开机翼 + 滑行到弹射位。
    phase = "taxi";
    const u = smooth(t / TAXI_END);
    position.lerpVectors(PARK, CAT_START, u);
    position.y = DECK_TOP;
    wingFold = 1.72 * (1 - smooth(t / 1.25));
    yaw = 0.06 * Math.sin(u * Math.PI);
    jbd = smooth((t - 2.0) / 0.5);
  } else if (t < LAUNCH_END) {
    phase = "launch";
    const u = clamp01((t - TAXI_END) / (LAUNCH_END - TAXI_END));
    const run = Math.pow(u, 1.55);
    position.set(CV.CAT_X, DECK_TOP + 0.045 * smooth((u - 0.55) / 0.45), lerp(CV.CAT_Z0, CV.CAT_Z1, run));
    pitch = -0.12 * smooth((u - 0.55) / 0.45);
    jbd = 1;
    shuttleZ = position.z;
  } else if (t < AIRBORNE_END) {
    phase = "airborne";
    const u = clamp01((t - LAUNCH_END) / (AIRBORNE_END - LAUNCH_END));
    position.copy(FLIGHT_CURVE.getPointAt(u));
    const tangent = FLIGHT_CURVE.getTangentAt(u).normalize();
    yaw = Math.atan2(tangent.x, tangent.z);
    pitch = -Math.asin(THREE.MathUtils.clamp(tangent.y, -0.9, 0.9));
    roll = Math.sin(u * Math.PI * 2) * 0.35 * Math.sin(u * Math.PI);
    shuttleZ = CV.CAT_Z0;
    jbd = 0;
    wirePull = 0;
  } else if (t < TOUCHDOWN) {
    phase = "approach";
    const u = smooth((t - AIRBORNE_END) / (TOUCHDOWN - AIRBORNE_END));
    position.set(lerp(0, 0, u), lerp(DECK_TOP + 1.0, DECK_TOP, u), lerp(-17.5, -14.5, u));
    yaw = 0;
    pitch = 0.03 * (1 - u);
    hook = -0.41 * smooth((t - AIRBORNE_END) / 0.9);
  } else if (t < CATCH) {
    phase = "rollout";
    const u = smooth((t - TOUCHDOWN) / (CATCH - TOUCHDOWN));
    position.set(0, DECK_TOP, lerp(-14.5, CATCH_CENTER_Z, u));
    hook = -0.41;
    pitch = 0.02 * (1 - u);
  } else if (t < STOP) {
    phase = "arrested";
    const u = smooth((t - CATCH) / (STOP - CATCH));
    position.set(0, DECK_TOP - 0.02 * Math.sin(u * Math.PI), lerp(CATCH_CENTER_Z, -6.0, u));
    hook = -0.41;
    wirePull = WIRE_PULL_MAX * u;
    pitch = 0.02 * (1 - u);
  } else if (t < PARKED) {
    phase = "taxi_back";
    const u = smooth((t - STOP) / (PARKED - STOP));
    position.set(lerp(0, PARK.x, u), DECK_TOP, lerp(-6.0, PARK.z, u));
    hook = -0.41 * (1 - smooth((t - STOP) / 0.7));
    wingFold = 1.72 * smooth((t - (PARKED - 1.4)) / 1.4);
    wirePull = 0;
  } else {
    phase = "secured";
    position.copy(PARK);
    wingFold = 1.72;
    hook = 0;
  }
  return { position, pitch, yaw, roll, shuttleZ, jbd, hook, wingFold, wirePull, phase };
}

export function animateCarrier(assembled: AssembledModel, seconds: number, state = "idle"): void {
  const t = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;

  // 默认姿态：舰载机系留、机翼折叠、挡焰板平放、拦阻索复位。
  setAircraftPose(assembled, PARK, 0, 0, 0);
  setWings(assembled, 1.72);
  setHook(assembled, 0);
  setWirePull(assembled, 0);
  setShuttle(assembled, CV.CAT_Z0);
  setJbd(assembled, 0);
  setDoors(assembled, 0);
  setAmmoElevator(assembled, 0);
  setCiws(assembled, t, false);
  setRadar(assembled, 0);
  setControlRods(assembled, 0);
  setRotors(assembled, 0, 0);

  if (state === "engine") {
    setRotors(assembled, t, 6.0);
    setControlRods(assembled, 0.16 * Math.sin(t * 0.55));
    setRadar(assembled, t * 1.15);
    return;
  }
  if (state === "hangar") {
    const cycle = t % 8;
    const open = cycle < 2.5 ? smooth(cycle / 1.0) : cycle < 5.5 ? 1 : 1 - smooth((cycle - 5.5) / 1.0);
    setDoors(assembled, open);
    const drop = -1.1 * (0.5 - 0.5 * Math.cos((Math.min(cycle, 6) / 6) * Math.PI * 2));
    setAmmoElevator(assembled, drop);
    setRadar(assembled, t * 0.5);
    return;
  }
  if (state === "ciws") {
    setCiws(assembled, t, true);
    setRadar(assembled, t * 1.15);
    setRotors(assembled, t, 4);
    return;
  }
  if (state !== "flight_ops") return;

  const loop = t % CYCLE;
  const pose = flightPose(loop);
  setAircraftPose(assembled, pose.position, pose.pitch, pose.yaw, pose.roll);
  setWings(assembled, pose.wingFold);
  setHook(assembled, pose.hook);
  setWirePull(assembled, pose.wirePull);
  setShuttle(assembled, pose.shuttleZ);
  setJbd(assembled, pose.jbd);
  setRotors(assembled, t, 5.0);
  setRadar(assembled, t * 1.1);
  setControlRods(assembled, 0.08 * Math.sin(t * 0.4));
}

export const CARRIER_STATE_LABELS = [
  { id: "idle", label: "系泊检查", hint: "全舰静态装配；舰载机折叠翼系留在甲板，挡焰板平放" },
  { id: "engine", label: "动力运转", hint: "控制棒插抽、主泵/涡轮/双桨转动、旋转雷达扫描" },
  { id: "flight_ops", label: "弹射/拦阻闭环", hint: "30s 循环：滑行到位 → 电磁弹射 → 离舰爬升 → 回转进近 → 尾钩钩住第 2 道拦阻索 → 减速停住" },
  { id: "hangar", label: "机库作业", hint: "机库防火门开合 + 弹药升降机在弹药库与机库层之间升降" },
  { id: "ciws", label: "近防拦截", hint: "1130 近防炮随动 + 11 管转管" },
] as const;

export const CARRIER_ANIMATED_STATES = ["engine", "flight_ops", "hangar", "ciws"];

export function carrierBounds(): THREE.Box3 {
  return new THREE.Box3(new THREE.Vector3(-10, 0, -30), new THREE.Vector3(10, DECK_TOP + 9.5, 24));
}

export function carrierFlightPhase(seconds: number): string {
  return flightPose(seconds % CYCLE).phase;
}
