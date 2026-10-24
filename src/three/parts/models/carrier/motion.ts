import * as THREE from "three";
import type { AssembledModel } from "../../assembler/assembler";
import { CAT_TRACKS, CV, catPoint } from "./constants";
import { AIRCRAFT_NODE, AIRCRAFT_SCALE_Z, HOOK_NODE, WING_FOLD_L, WING_FOLD_R } from "./aircraft";
import { SHUTTLE_NODE, JBD_NODES, WIRE_NODES } from "./flightdeck";
import { RADAR_NODE, CIWS_NODES } from "./island";
import { AMMO_ELEVATOR_NODE, HANGAR_DOOR_NODES } from "./hangar";
import {
  BRIDGE_GAUGE_NODES,
  BRIDGE_HELM_NODE,
  BRIDGE_RADAR_SWEEP_NODE,
  BRIDGE_TELEGRAPH_NODE,
} from "./bridge";
import { ENGINE_GAUGE_NODES, MAGAZINE_GAUGE_NODES, REACTOR_GAUGE_NODES } from "./interiors";
import { CIC_SWEEP_NODE } from "./cic";

// ============================================================================
// models/carrier/motion —— 状态动画
//
// idle   系泊检查（折叠翼/挡焰板平放）
// engine 动力运转（堆芯控制棒/主泵/涡轮/双桨/旋转雷达）
// flight_ops 核心闭环：折叠翼展开 → 弹射滑跑 → 离舰爬升 → 航线回转 →
//            进近放下尾钩 → 钩住第 3 道拦阻索 → 减速停住 → 复位系留
// hangar 机库作业（防火门/弹药升降机）
// ciws   近防（1130 转管 + 随动跟踪）
// ============================================================================

const DECK_TOP = CV.DECK_Y + CV.DECK_T;
const PARK = new THREE.Vector3(CV.AIRCRAFT_PARK[0], DECK_TOP, CV.AIRCRAFT_PARK[1]);
const LAUNCH_TRACK = CAT_TRACKS[1]!;
const LAUNCH_YAW = (LAUNCH_TRACK.yawDeg * Math.PI) / 180;
// 前起落架/弹射杆前端到机体原点的纵向距离（机体节点沿 z 缩放过）。
// 滑梭必须顶在弹射杆上，机体原点要落后滑梭这么多；否则机身/机翼会压在滑梭上。
export const CAT_NOSE_ENGAGE = AIRCRAFT_SCALE_Z * 1.13;
const LAUNCH_START_POINT = catPoint(LAUNCH_TRACK, -CAT_NOSE_ENGAGE);
const LAUNCH_END_POINT = catPoint(LAUNCH_TRACK, LAUNCH_TRACK.length - CAT_NOSE_ENGAGE);
const CAT_START = new THREE.Vector3(LAUNCH_START_POINT.x, DECK_TOP, LAUNCH_START_POINT.z);
// 斜角着舰跑道：与甲板标线同一坐标系（艉端 x=-0.576/z=-19.9，向左舷偏 3.59°）。
// 进近/滑跑/拦阻全部贴跑道中线，不能再用 x=0 的直线。
const RUNWAY_DEG = 3.59;
const RUNWAY_YAW = (-RUNWAY_DEG * Math.PI) / 180;
const RUNWAY_AFT_X = -0.5756;
const RUNWAY_AFT_Z = -19.9;
const RUNWAY_COS = Math.cos((RUNWAY_DEG * Math.PI) / 180);
const RUNWAY_SIN = Math.sin((RUNWAY_DEG * Math.PI) / 180);
const runwayX = (z: number): number => RUNWAY_AFT_X - ((z - RUNWAY_AFT_Z) / RUNWAY_COS) * RUNWAY_SIN;
const TAXI_BACK_MID = new THREE.Vector3(1.8, DECK_TOP, 3.9);
// 绕网第二拐点：越过已收起的拦阻网槽后回到右舷停机位。路线保持在 x≈2.2，
// 否则展开的右翼尖会扫到右舷停放 J-15 的左翼。
const TAXI_BACK_FWD = new THREE.Vector3(1.8, DECK_TOP, 7.2);
// 尾钩比机体原点靠后约 1.5，机体停在第三道索前方；着舰区比旧版更长，
// 落点后移后不再压到 3 号弹射器的待发滑梭/挡焰板。
const CATCH_WIRE = 2;
const CATCH_Z = CV.WIRE_Z[CATCH_WIRE]! + 1.5;
const RELEASE_Z = CATCH_Z + 0.8;
const WIRE_PULL_MAX = 1.5;

const FLIGHT_CURVE = new THREE.CatmullRomCurve3(
  [
    new THREE.Vector3(LAUNCH_END_POINT.x, DECK_TOP + 0.55, LAUNCH_END_POINT.z),
    new THREE.Vector3(4.6, DECK_TOP + 4.6, 22.5),
    new THREE.Vector3(-3.6, DECK_TOP + 8.4, 17.0),
    new THREE.Vector3(-8.6, DECK_TOP + 7.4, -4.0),
    new THREE.Vector3(-5.4, DECK_TOP + 4.2, -24.0),
    new THREE.Vector3(runwayX(-17.5), DECK_TOP + 1.0, -17.5),
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
  const safe = Math.min(fold, 1.45);
  if (left) left.rotation.z = -safe;
  if (right) right.rotation.z = safe;
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
  const [left, right] = WIRE_NODES[CATCH_WIRE]!;
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

function setBridgeMotion(assembled: AssembledModel, t: number): void {
  BRIDGE_GAUGE_NODES.forEach((name, index) => {
    const node = assembled.getNode(name);
    if (node) node.rotation.z = Math.sin(t * 0.35 + index * 0.9) * (0.34 + index * 0.045) + (index % 2 === 0 ? 0.18 : -0.26);
  });
  const helm = assembled.getNode(BRIDGE_HELM_NODE);
  if (helm) helm.rotation.z = Math.sin(t * 0.55) * 0.85;
  const telegraph = assembled.getNode(BRIDGE_TELEGRAPH_NODE);
  if (telegraph) telegraph.rotation.z = Math.sin(t * 0.4) * 0.45;
  const sweep = assembled.getNode(BRIDGE_RADAR_SWEEP_NODE);
  if (sweep) sweep.rotation.z = (t * 1.05) % (Math.PI * 2);
  const cicSweep = assembled.getNode(CIC_SWEEP_NODE);
  if (cicSweep) cicSweep.rotation.z = (t * 0.75) % (Math.PI * 2);
  ENGINE_GAUGE_NODES.forEach((name, index) => {
    const node = assembled.getNode(name);
    if (node) node.rotation.z = Math.sin(t * 0.7 + index * 1.2) * 0.5 + 0.2 * index;
  });
  REACTOR_GAUGE_NODES.forEach((name, index) => {
    const node = assembled.getNode(name);
    if (node) node.rotation.z = Math.sin(t * 0.28 + index * 1.5) * 0.42 - 0.15 * index;
  });
  MAGAZINE_GAUGE_NODES.forEach((name, index) => {
    const node = assembled.getNode(name);
    if (node) node.rotation.z = Math.sin(t * 0.45 + index * 0.9) * 0.46;
  });
}

function setShuttle(assembled: AssembledModel, z: number): void {
  const shuttle = assembled.getNode(SHUTTLE_NODE);
  if (!shuttle) return;
  shuttle.position.x = LAUNCH_TRACK.x0 + Math.tan(LAUNCH_YAW) * (z - LAUNCH_TRACK.z0);
  shuttle.position.z = z;
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
    yaw = LAUNCH_YAW * smooth(u);
    jbd = smooth((t - 2.0) / 0.5);
  } else if (t < LAUNCH_END) {
    phase = "launch";
    const u = clamp01((t - TAXI_END) / (LAUNCH_END - TAXI_END));
    const run = Math.pow(u, 1.55);
    const stroke = lerp(0, LAUNCH_TRACK.length, run);
    const p = catPoint(LAUNCH_TRACK, stroke - CAT_NOSE_ENGAGE);
    position.set(p.x, DECK_TOP + 0.045 * smooth((u - 0.55) / 0.45), p.z);
    pitch = -0.12 * smooth((u - 0.55) / 0.45);
    yaw = LAUNCH_YAW;
    jbd = 1;
    shuttleZ = catPoint(LAUNCH_TRACK, stroke).z;
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
    const z = lerp(-17.5, -14.5, u);
    position.set(runwayX(z), lerp(DECK_TOP + 1.0, DECK_TOP, u), z);
    yaw = RUNWAY_YAW;
    pitch = 0.03 * (1 - u);
    hook = -0.41 * smooth((t - AIRBORNE_END) / 0.9);
  } else if (t < CATCH) {
    phase = "rollout";
    const u = smooth((t - TOUCHDOWN) / (CATCH - TOUCHDOWN));
    const z = lerp(-14.5, CATCH_Z, u);
    position.set(runwayX(z), DECK_TOP, z);
    yaw = RUNWAY_YAW;
    hook = -0.41;
    pitch = 0.02 * (1 - u);
  } else if (t < STOP) {
    phase = "arrested";
    const u = smooth((t - CATCH) / (STOP - CATCH));
    const z = lerp(CATCH_Z, RELEASE_Z, u);
    position.set(runwayX(z), DECK_TOP - 0.02 * Math.sin(u * Math.PI), z);
    yaw = RUNWAY_YAW;
    hook = -0.41;
    wirePull = WIRE_PULL_MAX * u;
    pitch = 0.02 * (1 - u);
  } else if (t < PARKED) {
    phase = "taxi_back";
    const u = smooth((t - STOP) / (PARKED - STOP));
    // 返航滑行绕过仍竖起的拦阻网：先滑到网前右侧，沿右舷越过网线，再横越回停机区。
    if (u < 0.4) {
      position.lerpVectors(new THREE.Vector3(runwayX(RELEASE_Z), DECK_TOP, RELEASE_Z), TAXI_BACK_MID, smooth(u / 0.4));
      yaw = RUNWAY_YAW * (1 - smooth(u / 0.4));
    } else if (u < 0.62) {
      position.lerpVectors(TAXI_BACK_MID, TAXI_BACK_FWD, smooth((u - 0.4) / 0.22));
      yaw = 0;
    } else {
      position.lerpVectors(TAXI_BACK_FWD, PARK, smooth((u - 0.62) / 0.38));
      yaw = -0.16 * (1 - smooth((u - 0.62) / 0.38));
    }
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

  // 默认姿态：舰载机系留、机翼展开（便于看清整机外形）、挡焰板平放、拦阻索复位。
  setAircraftPose(assembled, PARK, 0, 0, 0);
  setWings(assembled, 0);
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
  setBridgeMotion(assembled, t);

  if (state === "engine") {
    setRotors(assembled, t, 6.0);
    setControlRods(assembled, 0.16 * Math.sin(t * 0.55));
    setRadar(assembled, t * 1.15);
    return;
  }
  if (state === "hangar") {
    // 机库作业时防火门保持全开，第一人称才能看见纵深停机位与停放机。
    setDoors(assembled, 1);
    // 船壳收窄后弹药升降机井与下层弹架/肋骨净空不足，平台停在机库层（行程不再下探）。
    setAmmoElevator(assembled, 0);
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
  { id: "flight_ops", label: "弹射/拦阻闭环", hint: "30s 循环：滑行到位 → 电磁弹射 → 离舰爬升 → 回转进近 → 尾钩钩住第 3 道拦阻索 → 减速停住" },
  { id: "hangar", label: "机库作业", hint: "机库防火门开合 + 弹药升降机在弹药库与机库层之间升降" },
  { id: "ciws", label: "近防拦截", hint: "1130 近防炮随动 + 11 管转管" },
] as const;

export const CARRIER_ANIMATED_STATES = ["engine", "flight_ops", "hangar", "ciws"];

export function carrierBounds(): THREE.Box3 {
  return new THREE.Box3(new THREE.Vector3(-6, 0, -21.5), new THREE.Vector3(6, 11, 21.5));
}

export function carrierFlightPhase(seconds: number): string {
  return flightPose(seconds % CYCLE).phase;
}
