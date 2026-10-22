import * as THREE from "three";
import type { AssembledModel } from "../../assembler/assembler";
import { KJ } from "./constants";
import { HYDRAULICS, hydraulicLength, hydraulicNodeName, nodeOrigin, type Side } from "./rig";
import { getKingJoeAudio } from "./audio";
import { getKingJoeFx, type KingJoeFxFrame } from "./fx";

// ============================================================================
// models/kingjoe/motion —— 三形态运动学 + 合体导演
//
// 状态：
//   idle      合体待机（装配态，供静态检测/看零件）
//   formation 四体分开悬浮编队
//   combining 阻尼合体：编队收敛 → 自下而上三段式对接 → 锁环咬合 → 双臂展开
//   robot     机器人步行（髋/膝/踝 + 腰部，液压杆真实伸缩）
//   firing    怪光线（眼部/胸部充能 → 发射）
//   separation 分离回避（解锁 → 电弧拉断 → 四散）
//   crippled  残缺合体（腿体丢失，躯干落地靠双臂撑）
//
// 每帧顺序：resetNodes（框架）→ 姿态 → 液压求解 → syncInstances → FX。
// ============================================================================

export type KingJoeState =
  | "idle"
  | "formation"
  | "combining"
  | "robot"
  | "firing"
  | "separation"
  | "crippled"
  | "damaged"
  | "scanning";

export const KINGJOE_ANIMATED_STATES: KingJoeState[] = [
  "formation",
  "combining",
  "robot",
  "firing",
  "separation",
  "crippled",
  "damaged",
];

export const KINGJOE_STATE_LABELS: Array<{ id: KingJoeState; label: string; hint: string }> = [
  { id: "idle", label: "合体待机", hint: "四体锁死成机器人；静态装配零穿模，可拖构建滑杆" },
  { id: "formation", label: "编队巡航", hint: "四艘飞船独立悬浮，纵队↔楔形变换、喷口摆动，双臂收拢" },
  { id: "combining", label: "阻尼合体", hint: "自下而上逐对对接：锥销入槽、电弧接通、锁环咔哒" },
  { id: "robot", label: "机器人步行", hint: "髋/膝/踝液压随角度伸缩，腰部微转，重踏步" },
  { id: "firing", label: "怪光线", hint: "眼部 + 胸口发射口充能 → 发射" },
  { id: "separation", label: "分离回避", hint: "解锁 → 电弧拉断 → 四体四散再编队" },
  { id: "crippled", label: "残缺合体", hint: "腿体被击落：躯干落地，双臂撑地爬行" },
  { id: "damaged", label: "机器人受击", hint: "左大腿外挂装甲崩落、肘部液压喷溅、插接座短路" },
  { id: "scanning", label: "穿模扫描", hint: "静态 / 动画扫掠检测进行中" },
];

const DEG = Math.PI / 180;
const TAU = Math.PI * 2;

const REST = {
  legs: new THREE.Vector3(0, 0, 0),
  stomach: new THREE.Vector3(0, KJ.STOMACH_Y, 0),
  chest: new THREE.Vector3(0, KJ.CHEST_Y, 0),
  ship: new THREE.Vector3(0, KJ.SHIP_Y, 0),
};

type FormationName = "legs" | "stomach" | "chest" | "ship";
type FormationOffsets = Record<FormationName, THREE.Vector3>;
const FORMATION_MODULES: FormationName[] = ["legs", "stomach", "chest", "ship"];

/** 纵队：四体沿纵深错开；楔形：头部在前，胸/腹两翼，腿体殿后。 */
const FORMATION_COLUMN: FormationOffsets = {
  legs: new THREE.Vector3(0, 0.55, 0),
  stomach: new THREE.Vector3(-2.7, 1.7, -2.2),
  chest: new THREE.Vector3(2.9, 2.1, -2.5),
  ship: new THREE.Vector3(0, 2.85, -3.25),
};
const FORMATION_WEDGE: FormationOffsets = {
  legs: new THREE.Vector3(0, 0.35, 1.6),
  stomach: new THREE.Vector3(-3.6, 1.25, -0.9),
  chest: new THREE.Vector3(3.6, 1.6, -0.9),
  ship: new THREE.Vector3(0, 2.55, -4.8),
};
const FORMATION_YAW: Record<FormationName, number> = { legs: 0, stomach: 18, chest: -18, ship: 0 };
const FORMATION_MORPH_RATE = 0.55;

interface FormationState {
  offsets: FormationOffsets;
  blend: number;
}

const formationSnapshots = new WeakMap<AssembledModel, FormationState>();

function formationBlend(seconds: number): number {
  return 0.5 - 0.5 * Math.cos(Math.max(0, seconds) * FORMATION_MORPH_RATE);
}

/** 用连续绝对时钟混合两种编队，避免状态切换时重置相位。 */
function formationState(seconds: number): FormationState {
  const blend = formationBlend(seconds);
  const offsets = {} as FormationOffsets;
  for (const name of FORMATION_MODULES) {
    offsets[name] = FORMATION_COLUMN[name].clone().lerp(FORMATION_WEDGE[name], blend);
  }
  return { offsets, blend };
}

const PRE_DOCK = {
  stomach: new THREE.Vector3(0, KJ.STOMACH_Y + 1.7, 0),
  chest: new THREE.Vector3(0, KJ.CHEST_Y + 2.7, 0),
  ship: new THREE.Vector3(0, KJ.SHIP_Y + 3.5, 0),
};

const DOCK_TIMES: Record<string, { start: number; lock: number }> = {
  stomach_legs: { start: 1.4, lock: 3.0 },
  chest_stomach: { start: 3.2, lock: 5.0 },
  neck: { start: 5.2, lock: 7.2 },
};

const SEPARATION_LOCK = 0.55;
const COMBINE_ARMS_START = 7.4;
const COMBINE_ARMS_END = 9.0;

const scratchV = new THREE.Vector3();
const scratchQ = new THREE.Quaternion();
const scratchE = new THREE.Euler();
const rootInv = new THREE.Matrix4();

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp01((value - edge0) / (edge1 - edge0 || 1));
  return t * t * (3 - 2 * t);
}

/** 临界阻尼接近：起步快、末端慢；返回 0..1（略过冲后回收）。 */
function damped(t: number): number {
  const u = clamp01(t);
  const base = 1 - (1 + 7 * u) * Math.exp(-7 * u);
  const settle = Math.sin(u * 26) * 0.012 * Math.exp(-6 * u);
  return clamp01(base + settle);
}

function lockAngle(timeSinceLock: number): number {
  if (timeSinceLock < 0) return 0;
  const base = 30;
  if (timeSinceLock > 0.5) return base;
  return base + Math.sin(timeSinceLock * 38) * 6 * Math.exp(-timeSinceLock * 13);
}

function flashOf(timeSinceLock: number): number {
  if (timeSinceLock < 0) return 0;
  return Math.exp(-timeSinceLock * 10);
}

/** 脚落地后的冲击包络：0.14s 衰减，超出 0.4 个步态周期归零。 */
function stepImpulse(phase: number, cycle: number): number {
  if (phase > 0.4) return 0;
  return Math.exp(-Math.pow((phase * cycle) / 0.14, 2));
}

function setNode(
  assembled: AssembledModel,
  name: string,
  position?: THREE.Vector3,
  rotationDeg?: [number, number, number],
): THREE.Object3D | undefined {
  const node = assembled.getNode(name);
  if (!node) return undefined;
  if (position) node.position.copy(position);
  if (rotationDeg) node.rotation.set(rotationDeg[0] * DEG, rotationDeg[1] * DEG, rotationDeg[2] * DEG);
  return node;
}

function setRotation(assembled: AssembledModel, name: string, rotationDeg: [number, number, number]): void {
  const node = assembled.getNode(name);
  if (!node) return;
  node.rotation.set(rotationDeg[0] * DEG, rotationDeg[1] * DEG, rotationDeg[2] * DEG);
}

function setArm(
  assembled: AssembledModel,
  side: Side,
  shoulderX: number,
  shoulderZ: number,
  elbowX: number,
  handX: number,
  fingerCurl = 12,
): void {
  const s = side === "r" ? 1 : -1;
  setRotation(assembled, `arm_${side}`, [shoulderX, 0, shoulderZ * s]);
  setRotation(assembled, `forearm_${side}`, [elbowX, 0, 0]);
  setRotation(assembled, `hand_${side}`, [handX, 0, 0]);
  for (let finger = 0; finger < 3; finger++) {
    setRotation(assembled, `finger_${side}_${finger}`, [-fingerCurl, 0, 0]);
  }
}

function setLeg(assembled: AssembledModel, side: Side, hipX: number, kneeX: number, ankleX: number): void {
  setRotation(assembled, `hip_${side}`, [hipX, 0, 0]);
  setRotation(assembled, `knee_${side}`, [kneeX, 0, 0]);
  setRotation(assembled, `ankle_${side}`, [ankleX, 0, 0]);
}

function chainTorso(
  assembled: AssembledModel,
  stomachPos: THREE.Vector3,
  waistRot: [number, number, number],
  chestExtra: [number, number, number],
  headExtra: [number, number, number],
): void {
  const waistQuat = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(waistRot[0] * DEG, waistRot[1] * DEG, waistRot[2] * DEG, "XYZ"),
  );
  const chestRot: [number, number, number] = [
    waistRot[0] + chestExtra[0],
    waistRot[1] + chestExtra[1],
    waistRot[2] + chestExtra[2],
  ];
  const chestQuat = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(chestRot[0] * DEG, chestRot[1] * DEG, chestRot[2] * DEG, "XYZ"),
  );
  const chestPos = stomachPos
    .clone()
    .add(new THREE.Vector3(0, KJ.STOMACH_H + KJ.DOCK_H, 0).applyQuaternion(waistQuat));
  const headRot: [number, number, number] = [
    chestRot[0] + headExtra[0],
    chestRot[1] + headExtra[1],
    chestRot[2] + headExtra[2],
  ];
  const shipPos = chestPos
    .clone()
    .add(new THREE.Vector3(0, KJ.CHEST_H + KJ.DOCK_H, 0).applyQuaternion(chestQuat));
  setNode(assembled, "stomach", stomachPos, waistRot);
  setNode(assembled, "chest", chestPos, chestRot);
  setNode(assembled, "ship", shipPos, headRot);
}

/**
 * 腰部关节链：腰鼓/齿轮/下轴承留在 stomach；上腹/胸/头绕 waist 枢轴旋转。
 * 胸↔腹接口两侧同步旋转；腿↔腹接口在腰下，不受影响。
 */
function waistTorso(
  assembled: AssembledModel,
  stomachPos: THREE.Vector3,
  waistRot: [number, number, number],
): void {
  setNode(assembled, "stomach", stomachPos, [0, 0, 0]);
  setNode(assembled, "waist", undefined, waistRot);
  const waistQuat = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(waistRot[0] * DEG, waistRot[1] * DEG, waistRot[2] * DEG, "XYZ"),
  );
  const pivot = new THREE.Vector3(stomachPos.x, stomachPos.y + 0.49, stomachPos.z);
  const chestOffset = new THREE.Vector3(0, KJ.CHEST_Y - (KJ.STOMACH_Y + 0.49), 0).applyQuaternion(waistQuat);
  const chestPos = pivot.clone().add(chestOffset);
  setNode(assembled, "chest", chestPos, waistRot);
  const chestQuat = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(waistRot[0] * DEG, waistRot[1] * DEG, waistRot[2] * DEG, "XYZ"),
  );
  const shipPos = chestPos
    .clone()
    .add(new THREE.Vector3(0, KJ.CHEST_H + KJ.DOCK_H, 0).applyQuaternion(chestQuat));
  setNode(assembled, "ship", shipPos, waistRot);
}

function setAxialLocks(assembled: AssembledModel, angleDeg: number): void {
  setRotation(assembled, "stomachLock", [0, angleDeg, 0]);
  setRotation(assembled, "chestLock", [0, angleDeg, 0]);
  setRotation(assembled, "shipLock", [0, angleDeg, 0]);
}

function setShoulderLocks(assembled: AssembledModel, angleDeg: number): void {
  setRotation(assembled, "shoulderLockL", [angleDeg, 0, 0]);
  setRotation(assembled, "shoulderLockR", [angleDeg, 0, 0]);
}

function setLegVisibility(assembled: AssembledModel, visible: boolean): void {
  const legsNode = assembled.getNode("legs");
  if (legsNode) legsNode.visible = visible;
  for (const spec of HYDRAULICS) {
    if (!spec.id.startsWith("hip") && !spec.id.startsWith("knee") && !spec.id.startsWith("ankle")) continue;
    const rod = assembled.getNode(hydraulicNodeName(spec.id, spec.side));
    if (rod) rod.visible = visible;
  }
}

/** 液压杆求解：耳环永远落在 C'，回缩量滑进缸筒内孔。 */
function solveHydraulics(assembled: AssembledModel): void {
  assembled.root.updateMatrixWorld(true);
  rootInv.copy(assembled.root.matrixWorld).invert();
  for (const spec of HYDRAULICS) {
    const rod = assembled.getNode(hydraulicNodeName(spec.id, spec.side));
    const barrelNode = assembled.getNode(spec.barrelNode);
    const tipNode = assembled.getNode(spec.tipNode);
    if (!rod || !barrelNode || !tipNode) continue;
    const exitOrigin = nodeOrigin(spec.barrelNode);
    const tipOrigin = nodeOrigin(spec.tipNode);
    const exit = new THREE.Vector3(
      spec.exit[0] - exitOrigin[0],
      spec.exit[1] - exitOrigin[1],
      spec.exit[2] - exitOrigin[2],
    ).applyMatrix4(barrelNode.matrixWorld);
    const tip = new THREE.Vector3(
      spec.tip[0] - tipOrigin[0],
      spec.tip[1] - tipOrigin[1],
      spec.tip[2] - tipOrigin[2],
    ).applyMatrix4(tipNode.matrixWorld);
    exit.applyMatrix4(rootInv);
    tip.applyMatrix4(rootInv);
    const delta = scratchV.copy(tip).sub(exit);
    const distance = delta.length();
    if (distance < 1e-5) continue;
    const dir = delta.normalize().clone();
    const length = hydraulicLength(spec);
    rod.position.copy(exit).addScaledVector(dir, distance - length);
    rod.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  }
  assembled.root.updateMatrixWorld(true);
}

function applyMaterialDefaults(assembled: AssembledModel): void {
  for (const part of assembled.parts) {
    const material = part.def.material;
    if (
      material !== "eye_glow" &&
      material !== "forehead_glow" &&
      material !== "chest_glow_blue" &&
      material !== "chest_glow_rose" &&
      material !== "chest_glow_amber" &&
      material !== "sensor_red" &&
      material !== "servo_blue"
    ) {
      continue;
    }
    const target = part.object.material as THREE.MeshStandardMaterial;
    if (material === "eye_glow") target.emissiveIntensity = 2.2;
    else if (material === "forehead_glow") target.emissiveIntensity = 2.4;
    else if (material.startsWith("chest_glow")) target.emissiveIntensity = 2.4;
    else if (material === "sensor_red") target.emissiveIntensity = 1.1;
    else target.emissiveIntensity = 0.9;
  }
}

function setMaterialIntensity(assembled: AssembledModel, name: string, intensity: number): void {
  for (const part of assembled.parts) {
    if (part.def.material === name) {
      (part.object.material as THREE.MeshStandardMaterial).emissiveIntensity = intensity;
    }
  }
}

const localClock = new WeakMap<AssembledModel, { state: string; start: number }>();

function stateSeconds(assembled: AssembledModel, seconds: number, state: string): number {
  let entry = localClock.get(assembled);
  if (!entry || entry.state !== state) {
    entry = { state, start: seconds };
    localClock.set(assembled, entry);
  }
  return Math.max(0, seconds - entry.start);
}

function poseFormation(assembled: AssembledModel, t: number, formation: FormationState): void {
  const bob = 0.06;
  const modules: Array<[FormationName, number]> = [
    ["legs", 0],
    ["stomach", 1.7],
    ["chest", 3.1],
    ["ship", 4.4],
  ];
  for (const [name, phase] of modules) {
    const base = REST[name];
    const offset = formation.offsets[name];
    const bobY = Math.sin(t * 1.15 + phase) * bob;
    const driftX = Math.sin(t * 0.8 + phase * 0.7) * 0.015;
    const driftZ = Math.cos(t * 0.65 + phase * 1.1) * 0.015;
    setNode(
      assembled,
      name,
      new THREE.Vector3(base.x + offset.x + driftX, base.y + offset.y + bobY, base.z + offset.z + driftZ),
      [
        Math.sin(t * 0.9 + phase) * 1.4,
        Math.cos(t * 0.7 + phase) * 2.0 + formation.blend * FORMATION_YAW[name],
        Math.sin(t * 1.2 + phase) * 1.4,
      ],
    );
    for (let nozzle = 0; nozzle < 4; nozzle++) {
      setRotation(assembled, `${name}Nozzle${nozzle}`, [
        Math.sin(t * 2.1 + nozzle + phase) * 2.4,
        0,
        Math.cos(t * 1.7 + nozzle) * 2.4,
      ]);
    }
  }
  setLeg(assembled, "l", 0, 0, 0);
  setLeg(assembled, "r", 0, 0, 0);
  setArm(assembled, "l", 20, 12, 0, 0, 5);
  setArm(assembled, "r", 20, 12, 0, 0, 5);
  setAxialLocks(assembled, 0);
  setShoulderLocks(assembled, 0);
  for (let i = 0; i < 2; i++) {
    setRotation(assembled, `shipRudder${i}`, [Math.sin(t * 1.8 + i * 1.7) * 6, 0, 0]);
  }
  for (let i = 2; i < 4; i++) {
    setRotation(assembled, `shipRudder${i}`, [0, Math.sin(t * 1.4 + i) * 5, 0]);
  }
}

function poseCombining(
  assembled: AssembledModel,
  t: number,
  startFormation: FormationState,
): { arcs: Record<string, number>; flashes: Record<string, number>; thruster: number } {
  const arcs: Record<string, number> = {};
  const flashes: Record<string, number> = {};

  // 阶段 A：编队位置 → 预对接柱（1.4s）
  const converge = smoothstep(0, 1.4, t);
  const arcLift = Math.sin(Math.PI * converge) * 0.22;
  const prePositions: Record<"stomach" | "chest" | "ship", THREE.Vector3> = {
    stomach: PRE_DOCK.stomach,
    chest: PRE_DOCK.chest,
    ship: PRE_DOCK.ship,
  };
  const modules: Array<"stomach" | "chest" | "ship"> = ["stomach", "chest", "ship"];
  const targetY: Record<string, number> = {
    stomach: KJ.STOMACH_Y,
    chest: KJ.CHEST_Y,
    ship: KJ.SHIP_Y,
  };
  for (const name of modules) {
    const formation = new THREE.Vector3().copy(REST[name]).add(startFormation.offsets[name]);
    formation.y += Math.sin(t * 1.15 + (name === "stomach" ? 1.7 : name === "chest" ? 3.1 : 4.4)) * 0.06;
    const pre = prePositions[name];
    const timing =
      DOCK_TIMES[name === "stomach" ? "stomach_legs" : name === "chest" ? "chest_stomach" : "neck"]!;
    const start = new THREE.Vector3().lerpVectors(formation, pre, converge);
    start.y += arcLift;
    // 横向/纵深靠拢持续到本轮对接前 0.25s：等待中的模块一路缓慢平移，
    // 而不是在 1.4s 内就全部钉到对接轴正上方。飞行弧线在中途抬高，
    // 避免手臂/头部扫过下方尚未对接的模块。
    const horizontalProgress = smoothstep(0, Math.max(0.7, timing.start - 0.25), t);
    const horizontal = new THREE.Vector3().lerpVectors(formation, pre, horizontalProgress);
    const cruiseLift =
      (name === "chest" ? 1.6 : name === "ship" ? 0.8 : 0) * Math.sin(Math.PI * horizontalProgress);
    const descent = clamp01((t - timing.start) / (timing.lock - timing.start - 0.2));
    const finalY = targetY[name]!;

    // 还没轮到的模块不能钉死在预对接柱上：持续上下浮动 + 飞行姿态倾斜，
    // 并沿横向/纵向缓慢向对接轴靠拢（对齐量在轮到前衰减到 0）。
    const hoverPhase = name === "chest" ? 1.7 : name === "ship" ? 4.4 : 0.9;
    const hoverAmp = name === "ship" ? 0.24 : name === "chest" ? 0.2 : 0.12;
    const hoverFade = 1 - smoothstep(timing.start - 0.55, timing.start, t);
    const unDocked = t < timing.lock ? 1 : 0;
    const flight = hoverFade * unDocked;
    const creep = name === "stomach" ? 0 : smoothstep(0.9, timing.start, t) * 0.24;
    const approachY = (finalY - pre.y) * creep;
    const bob =
      (Math.sin(t * 1.35 + hoverPhase) * hoverAmp +
        Math.sin(t * 0.53 + hoverPhase * 2.3) * hoverAmp * 0.4 +
        Math.sin(t * 0.27 + hoverPhase * 3.1) * hoverAmp * 0.22) *
      flight;
    const driftX = Math.sin(t * 0.71 + hoverPhase * 1.4) * 0.09 * flight;
    const driftZ = Math.cos(t * 0.63 + hoverPhase) * 0.07 * flight;
    const flightPitch =
      (Math.sin(t * 0.85 + hoverPhase) * 3.2 + Math.sin(t * 0.37 + hoverPhase * 1.7) * 1.4) * flight;
    const flightRoll =
      (Math.cos(t * 0.68 + hoverPhase) * 4.3 + Math.sin(t * 1.12 + hoverPhase * 0.8) * 1.7) * flight;
    const flightYaw = Math.sin(t * 0.55 + hoverPhase * 1.3) * 2.6 * flight;

    let y = start.y + approachY + bob + cruiseLift;
    let x = horizontal.x + driftX;
    let z = horizontal.z + driftZ;
    if (t >= timing.start) {
      const yFrom = pre.y + approachY;
      const yTo = finalY;
      const p = damped(descent);
      const stickSlip = t < timing.lock ? Math.sin(descent * 92) * 0.0015 * smoothstep(0.7, 1, descent) : 0;
      y = yFrom + (yTo - yFrom) * p + stickSlip;
      const micro = (1 - p) * 0.0035;
      x = Math.sin(t * 41 + (name === "chest" ? 1.7 : name === "ship" ? 3.1 : 0)) * micro;
      z = Math.cos(t * 37 + (name === "chest" ? 2.3 : name === "ship" ? 4.1 : 0)) * micro;
      if (descent >= 1) {
        const settle = Math.exp(-(t - timing.lock) * 9) * Math.sin((t - timing.lock) * 30) * 0.006;
        y += settle;
      }
    }
    const wobble = (1 - converge) * 1.2;
    setNode(assembled, name, new THREE.Vector3(x, y, z), [
      Math.sin(t * 2.3 + (name === "ship" ? 0.8 : 0)) * wobble +
        (t < timing.start ? 0 : Math.sin(t * 28) * 0.25 * (1 - descent)) +
        flightPitch,
      (1 - converge) * startFormation.blend * FORMATION_YAW[name] + flightYaw,
      Math.cos(t * 1.9 + (name === "stomach" ? 1.4 : 0)) * wobble + flightRoll,
    ]);
    const timeSinceLock = t - timing.lock;
    const lock = lockAngle(timeSinceLock);
    const lockNode = name === "stomach" ? "stomachLock" : name === "chest" ? "chestLock" : "shipLock";
    setRotation(assembled, lockNode, [0, lock, 0]);
    flashes[name] = Math.max(0, flashOf(timeSinceLock) * (t >= timing.lock ? 1 : 0));
    const lowerTop = name === "stomach" ? KJ.LEGS_TOP : name === "chest" ? KJ.STOMACH_TOP : KJ.CHEST_TOP;
    const gap = y - lowerTop;
    const arcActive = t >= timing.start - 0.25 && t <= timing.lock + 0.05 && gap < 0.95;
    arcs[name === "stomach" ? "stomach_legs" : name === "chest" ? "chest_stomach" : "neck"] = arcActive
      ? smoothstep(0.95, 0.12, gap) * (1 - smoothstep(timing.lock - 0.15, timing.lock, t))
      : 0;
  }
  // 腿体从当前编队位置起飞后落到最终位
  const legsConverge = smoothstep(0, 1.4, t);
  const legsStart = startFormation.offsets.legs;
  setNode(
    assembled,
    "legs",
    new THREE.Vector3(
      legsStart.x * (1 - legsConverge),
      legsStart.y * (1 - legsConverge),
      legsStart.z * (1 - legsConverge),
    ),
    [0, 0, 0],
  );
  setLeg(assembled, "l", 0, 0, 0);
  setLeg(assembled, "r", 0, 0, 0);

  // 双臂：合体前段收拢，最后 1.6s 展开并锁肩
  const unfold = smoothstep(COMBINE_ARMS_START, COMBINE_ARMS_END, t);
  const shoulderX = 20 * (1 - unfold);
  const shoulderZ = 12 * (1 - unfold);
  const elbowX = 0;
  setArm(assembled, "l", shoulderX, shoulderZ, elbowX, 0, 0);
  setArm(assembled, "r", shoulderX, shoulderZ, elbowX, 0, 0);
  setShoulderLocks(assembled, 18 * unfold);
  const thruster = 0.75 * (1 - smoothstep(0.0, 1.6, t));
  return { arcs, flashes, thruster };
}

function poseSeparation(
  assembled: AssembledModel,
  t: number,
  targetFormation: FormationState,
): { arcs: Record<string, number>; flashes: Record<string, number>; thruster: number } {
  const arcs: Record<string, number> = {};
  const flashes: Record<string, number> = {};
  // 先抬臂再解锁：真实手臂粗，若在模块横向散开时才折叠会扫进腹部。
  const fold = smoothstep(0.05, 0.55, t);
  setArm(assembled, "l", 78 * fold, 8 * fold, 0, 0, 5 * fold);
  setArm(assembled, "r", 78 * fold, 8 * fold, 0, 0, 5 * fold);
  setShoulderLocks(assembled, 18 * (1 - smoothstep(0.1, 0.6, t)));
  setLeg(assembled, "l", 0, 0, 0);
  setLeg(assembled, "r", 0, 0, 0);

  const lift = smoothstep(0.45, 1.4, t);
  const fly = smoothstep(1.4, 3.4, t);
  const unlock = 1 - smoothstep(0, SEPARATION_LOCK, t);
  const modules: Array<"stomach" | "chest" | "ship"> = ["stomach", "chest", "ship"];
  for (const name of modules) {
    const timing =
      DOCK_TIMES[name === "stomach" ? "stomach_legs" : name === "chest" ? "chest_stomach" : "neck"]!;
    const rest = REST[name];
    const formation = new THREE.Vector3().copy(rest).add(targetFormation.offsets[name]);
    const liftY = (name === "stomach" ? 0.55 : name === "chest" ? 0.85 : 1.1) * lift;
    const target = new THREE.Vector3(
      rest.x + (formation.x - rest.x) * fly,
      rest.y + (formation.y - rest.y) * fly + liftY,
      rest.z + (formation.z - rest.z) * fly,
    );
    setNode(assembled, name, target, [
      Math.sin(t * 2.1 + (name === "ship" ? 0.8 : 0)) * 2.5 * fly,
      targetFormation.blend * FORMATION_YAW[name] * fly,
      Math.cos(t * 1.7) * 2.5 * fly,
    ]);
    const lowerTop = name === "stomach" ? KJ.LEGS_TOP : name === "chest" ? KJ.STOMACH_TOP : KJ.CHEST_TOP;
    const gap = target.y - lowerTop;
    const arc =
      t < 1.8 ? smoothstep(0.0, 0.8, t) * (1 - smoothstep(1.3, 1.9, t)) * clamp01(1 - gap / 1.4) : 0;
    arcs[name === "stomach" ? "stomach_legs" : name === "chest" ? "chest_stomach" : "neck"] = arc;
    flashes[name] = 0;
    const lockNode = name === "stomach" ? "stomachLock" : name === "chest" ? "chestLock" : "shipLock";
    setRotation(assembled, lockNode, [0, 30 * unlock, 0]);
    void timing;
  }
  const legsFly = smoothstep(0.9, 3.0, t);
  const legsTarget = targetFormation.offsets.legs;
  setNode(
    assembled,
    "legs",
    new THREE.Vector3(legsTarget.x * legsFly, legsTarget.y * legsFly, legsTarget.z * legsFly),
    [0, 0, 0],
  );
  const bob = 0.05;
  if (t > 3.2) {
    for (const name of modules) {
      const formation = new THREE.Vector3().copy(REST[name]).add(targetFormation.offsets[name]);
      formation.y += Math.sin(t * 1.2) * bob;
      setNode(assembled, name, formation, [
        Math.sin(t) * 1.2,
        Math.cos(t * 0.8) * 1.5 + targetFormation.blend * FORMATION_YAW[name],
        Math.sin(t * 1.1) * 1.2,
      ]);
    }
  }
  const thruster = smoothstep(0.5, 2.2, t);
  return { arcs, flashes, thruster };
}

function poseRobot(assembled: AssembledModel, t: number): { left: number; right: number } {
  const cycle = 6;
  const u = (t % cycle) / cycle;
  const step = Math.sin(u * TAU);
  const leftSwing = Math.max(0, Math.sin(u * TAU));
  const rightSwing = Math.max(0, Math.sin(u * TAU + Math.PI));
  const leftHip = -8 * leftSwing + 3 * rightSwing;
  const rightHip = -8 * rightSwing + 3 * leftSwing;
  const leftKnee = 16 * leftSwing;
  const rightKnee = 16 * rightSwing;
  const leftAnkle = -8 * leftSwing;
  const rightAnkle = -8 * rightSwing;
  setLeg(assembled, "l", leftHip, leftKnee, leftAnkle);
  setLeg(assembled, "r", rightHip, rightKnee, rightAnkle);
  const bob = 0.008 * (1 - Math.cos(u * TAU * 2)) + 0.003 * Math.abs(step);
  setNode(assembled, "legs", new THREE.Vector3(0, bob, 0), [0, 0, 0]);
  const lean = 1.2 * Math.sin(u * TAU * 2);
  const sway = 4 * Math.sin(u * TAU);
  waistTorso(assembled, new THREE.Vector3(0, KJ.STOMACH_Y + bob, 0), [lean, sway, 0]);
  const armSwing = -step * 3;
  setArm(assembled, "l", armSwing, 4, 5 + 2 * Math.abs(step), 0, 6);
  setArm(assembled, "r", -armSwing, 4, 5 + 2 * Math.abs(step), 0, 6);
  setAxialLocks(assembled, 30);
  setShoulderLocks(assembled, 18);
  return {
    left: stepImpulse((u - 0.5 + 1) % 1, cycle),
    right: t < 0.5 ? 0 : stepImpulse(u, cycle),
  };
}

function fireCycle(t: number): { beam: number; charge: number } {
  const cycle = t % 2.8;
  if (cycle < 1.05) return { beam: 0, charge: cycle / 1.05 };
  if (cycle < 1.4) return { beam: 1, charge: 1 };
  if (cycle < 1.9) return { beam: 1 - (cycle - 1.4) / 0.5, charge: 1 - (cycle - 1.4) / 0.5 };
  return { beam: 0, charge: 0 };
}

function poseFiring(assembled: AssembledModel, t: number): { beam: number; charge: number } {
  const fire = fireCycle(t);
  const recoil = fire.beam > 0 ? 0.018 : 0;
  const waistPitch = -1.2 * fire.beam - 0.4 * fire.charge;
  waistTorso(assembled, new THREE.Vector3(0, KJ.STOMACH_Y, -recoil), [waistPitch, 0, 0]);
  setNode(assembled, "legs", new THREE.Vector3(0, 0, -recoil), [0, 0, 0]);
  setLeg(assembled, "l", 0, 0, 0);
  setLeg(assembled, "r", 0, 0, 0);
  setArm(assembled, "l", -8, 6, 8, 0, 10);
  setArm(assembled, "r", -8, 6, 8, 0, 10);
  setAxialLocks(assembled, 30);
  setShoulderLocks(assembled, 18);
  const charge = fire.charge;
  setMaterialIntensity(assembled, "eye_glow", 2.2 + charge * 3.4 + fire.beam * 2);
  setMaterialIntensity(assembled, "forehead_glow", 2.4 + charge * 4 + fire.beam * 2);
  setMaterialIntensity(assembled, "chest_glow_blue", 1.3 + charge * 2.2 + fire.beam);
  setMaterialIntensity(assembled, "chest_glow_rose", 1.3 + charge * 1.8 + fire.beam);
  setMaterialIntensity(assembled, "chest_glow_amber", 1.3 + charge * 2 + fire.beam);
  return fire;
}

function poseCrippled(assembled: AssembledModel, t: number): void {
  setNode(assembled, "legs", new THREE.Vector3(0, -40, 0), [0, 0, 0]);
  setLegVisibility(assembled, false);
  const breathe = Math.sin(t * 1.4) * 0.012;
  const stomachPos = new THREE.Vector3(0, 0.35 + breathe, 0.38);
  chainTorso(assembled, stomachPos, [-45, 0, 2], [0, 0, 0], [0, 0, 0]);
  const sway = Math.sin(t * 0.9) * 8;
  setArm(assembled, "l", 0, 0, 0, 0, 10);
  setArm(assembled, "r", 0, 0, 0, 0, 10);
  void sway;
  setAxialLocks(assembled, 30);
  setShoulderLocks(assembled, 18);
}

function poseDamaged(assembled: AssembledModel, t: number): { spray: number; sparks: number } {
  setLegVisibility(assembled, true);
  setNode(assembled, "legs", REST.legs, [0, 0, 0]);
  setLeg(assembled, "l", 0, 6, -3);
  setLeg(assembled, "r", 0, 0, 0);
  const shock = Math.exp(-t * 3.2) * Math.sin(t * 16);
  const lean = smoothstep(0.15, 1.2, t);
  waistTorso(assembled, new THREE.Vector3(0, KJ.STOMACH_Y, 0), [
    -2.6 * lean + shock * 1.2,
    3.4 * lean + shock * 0.6,
    0,
  ]);
  setArm(assembled, "l", 6 * lean + shock * 3, 0, 8 * lean, 6, 10);
  setArm(assembled, "r", -8 * lean, 0, 12 * lean, 6, 16);
  setAxialLocks(assembled, 30);
  setShoulderLocks(assembled, 18);
  setMaterialIntensity(assembled, "sensor_red", 0.18);

  // 外挂板：先向外弹出 0.6m，再落到左足外侧地面（世界 y≈0.1）。
  const blow = smoothstep(0.25, 0.6, t);
  const fall = smoothstep(0.5, 1.5, t);
  setNode(
    assembled,
    "damagePanelL",
    new THREE.Vector3(-0.382 - 0.6 * blow, -0.91 - 2.05 * fall, 0.55 * blow + 0.2 * fall),
    [15 * fall, 0, 70 * fall],
  );
  const spray = smoothstep(0.3, 0.6, t) * (1 - smoothstep(3.5, 5, t)) + 0.12;
  const sparks = smoothstep(0.35, 0.55, t) * (1 - smoothstep(2.6, 3.4, t));
  return { spray, sparks };
}

function poseIdle(assembled: AssembledModel): void {
  setLegVisibility(assembled, true);
  setNode(assembled, "legs", REST.legs, [0, 0, 0]);
  waistTorso(assembled, new THREE.Vector3(0, KJ.STOMACH_Y, 0), [0, 0, 0]);
  setLeg(assembled, "l", 0, 0, 0);
  setLeg(assembled, "r", 0, 0, 0);
  setArm(assembled, "l", 0, 0, 0, 0, 0);
  setArm(assembled, "r", 0, 0, 0, 0, 0);
  setAxialLocks(assembled, 30);
  setShoulderLocks(assembled, 18);
}

export function animateKingJoe(
  assembled: AssembledModel,
  seconds: number,
  state: KingJoeState = "idle",
): void {
  const effective = state === "scanning" ? "idle" : state;
  const t = stateSeconds(assembled, seconds, effective);
  const formation = formationState(seconds);
  if (effective === "formation") formationSnapshots.set(assembled, formation);
  const combiningFormation = formationSnapshots.get(assembled) ?? formation;
  applyMaterialDefaults(assembled);
  setLegVisibility(assembled, true);

  const fxFrame: KingJoeFxFrame = {
    time: t,
    arcs: {},
    thrusters: { ship: 0, chest: 0, stomach: 0, legs: 0 },
    beamShip: 0,
    beamChest: 0,
    charge: 0,
    flashes: {},
    floor: false,
  };

  switch (effective) {
    case "formation": {
      poseFormation(assembled, t, formation);
      fxFrame.thrusters = { ship: 0.75, chest: 0.8, stomach: 0.8, legs: 0.9 };
      break;
    }
    case "combining": {
      const result = poseCombining(assembled, t, combiningFormation);
      fxFrame.arcs = result.arcs;
      fxFrame.flashes = result.flashes;
      fxFrame.thrusters = {
        ship: result.thruster,
        chest: result.thruster,
        stomach: result.thruster,
        legs: result.thruster * 0.6,
      };
      break;
    }
    case "robot": {
      fxFrame.steps = poseRobot(assembled, t);
      break;
    }
    case "firing": {
      const fire = poseFiring(assembled, t);
      fxFrame.beamShip = fire.beam;
      fxFrame.beamChest = fire.beam;
      fxFrame.charge = fire.charge;
      break;
    }
    case "separation": {
      const result = poseSeparation(assembled, t, formation);
      fxFrame.arcs = result.arcs;
      fxFrame.flashes = result.flashes;
      fxFrame.thrusters = {
        ship: result.thruster,
        chest: result.thruster,
        stomach: result.thruster,
        legs: result.thruster * 0.6,
      };
      break;
    }
    case "crippled": {
      poseCrippled(assembled, t);
      fxFrame.floor = true;
      break;
    }
    case "damaged": {
      const damage = poseDamaged(assembled, t);
      fxFrame.spray = { node: "forearm_l", strength: damage.spray };
      fxFrame.arcs = { chest_stomach: damage.sparks * 0.45 };
      break;
    }
    default: {
      poseIdle(assembled);
      break;
    }
  }

  solveHydraulics(assembled);
  assembled.syncInstances();
  assembled.root.updateMatrixWorld(true);
  getKingJoeFx(assembled).update(assembled, fxFrame);
  getKingJoeAudio(assembled).update(effective, t);
  void scratchQ;
  void scratchE;
  void TAU;
}

export const KINGJOE_STATE_IDS = KINGJOE_STATE_LABELS.map((state) => state.id);
