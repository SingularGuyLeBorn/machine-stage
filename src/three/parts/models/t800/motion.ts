import * as THREE from "three";
import type { AssembledModel } from "../../assembler/assembler";
import { JOINT_BY_NAME, JOINTS, jointChain, nodeNameOf } from "./spec";
import { FINGER_BONES } from "./tendon";
import { tendonNodeName } from "./registry";
import { HYDRAULICS, cylinderAxis, rodNodeName, type HydraulicDef } from "./hydraulics";

// ============================================================================
// t800/motion —— 整机运动学
//
// 每个蒙皮部位一个节点（根级），按"父链"逐级摆：
//   关节角 → 绕自身转轴旋转 → 子节点跟随（世界位姿直接算，避免父子二次变换）。
//
// 轴向约定（模型坐标 +X 前 / +Y 上 / +Z 右）：
//   · 矢状面内的屈伸（髋/膝/踝/肩/肘/腕/脊椎/下颌/手指）→ 绕 **Z** 轴；
//   · 水平面内的扭转（头颈转头、眼珠扫视、脊椎拧转）→ 绕 **Y** 轴。
//
// 液压缸的活塞杆节点每帧重算：杆端永远指住缸口方向，露出长度 = |AB| - 缸长。
// 阻尼：欠阻尼二阶阶跃（慢启动 → 加速 → 减速 → 过冲 → 回稳）。
// ============================================================================

/** 步态周期（秒）：左右各一步。 */
const CYCLE = 6.4;

const AXIS_VEC: Record<string, THREE.Vector3> = {
  x: new THREE.Vector3(1, 0, 0),
  y: new THREE.Vector3(0, 1, 0),
  z: new THREE.Vector3(0, 0, 1),
};

/** 欠阻尼阶跃：t=0 初速 0，约 t=0.55 过冲 ~3%，t=1 收敛。 */
function dampedStep(u: number): number {
  if (u <= 0) return 0;
  if (u >= 1) return 1;
  return 1 - Math.exp(-5 * u) * (Math.cos(6 * u) + (5 / 6) * Math.sin(6 * u));
}

/** 0→1→0 的钟形（带阻尼过冲）：u=0/1 处为 0，中段接近 1。 */
function pulse(u: number): number {
  const w = ((u % 1) + 1) % 1;
  const half = 0.5;
  if (w < half) return dampedStep(w / (half * 0.86));
  return 1 - dampedStep((w - half) / (half * 0.86));
}

/**
 * 落地冲击响应：u=0 是脚跟触地那一下，之后是快速衰减的振荡。
 * 机械腿落地应该"咚"一下沉到位再回弹，而不是平滑过渡。
 */
function impact(u: number): number {
  const w = ((u % 1) + 1) % 1;
  if (w < 0) return 0;
  return Math.exp(-7 * w) * Math.sin(19 * w);
}

/** 步态相位（0..1）。 */
export function gaitPhase(seconds: number): number {
  return (((seconds % CYCLE) + CYCLE) % CYCLE) / CYCLE;
}

/** 关节角（度）。z = 矢状面屈伸，y = 水平面扭转。 */
interface Angles {
  z: Map<string, number>;
  y: Map<string, number>;
  /** 落地冲击强度（左右各一），脚跟触地那一下最大 */
  land: { r: number; l: number };
  /** 整机转身（水平面偏转，度） */
  turn: number;
}

/** 屈伸幅度（度）。 */
const HIP_MAX = 17;
const KNEE_MAX = 68;
const TOE_MAX = 20;
const SHOULDER_MAX = 15;
const ELBOW_MAX = 48;
/** 手指卷曲角（度，每节）。 */
const FINGER_CURL = 30;
/** 脊椎静态前倾（度）：腰 → 胸 → 颈，配合步态起伏。 */
const SPINE_BEND: Record<string, number> = {
  bip_spine_1_04: -7,
  bip_spine_2_05: 6,
  bip_spine_3_06: 4,
  bip_neck_039: 2,
};

/** 关节链深度（用于拓扑排序）。 */
const DEPTH = new Map<string, number>(JOINTS.map((j) => [j.name, jointChain(j.name).length]));

/** 按链深排序的部位（父先子后）。 */
const ORDERED = [...JOINTS].sort((a, b) => (DEPTH.get(a.name) ?? 0) - (DEPTH.get(b.name) ?? 0));

/** 计算所有关节的目标角度（度）。 */
function jointAngles(seconds: number): Angles {
  const p = gaitPhase(seconds);
  const right = p;
  const left = (p + 0.5) % 1;
  const z = new Map<string, number>();
  const y = new Map<string, number>();

  const hipR = Math.sin(2 * Math.PI * right);
  const hipL = Math.sin(2 * Math.PI * left);
  const kneeR = pulse(right + 0.25);
  const kneeL = pulse(left + 0.25);

  // 髋：大腿绕髋关节前后摆（绕 Z，正 = 前摆）
  z.set("LeftUpLegRoll_084", HIP_MAX * hipR);
  z.set("RightUpLegRoll_092", HIP_MAX * hipL);
  // 膝：屈曲（负 = 小腿向后收）
  z.set("LeftKnee_helper_086", -KNEE_MAX * kneeR);
  z.set("RightKnee_helper_094", -KNEE_MAX * kneeL);
  // 踝/腕/趾：留到链式求解时按"父级累计角"补偿（脚掌贴地、手掌不歪）
  // 趾：蹬地
  z.set("bip_toe_R_085", -TOE_MAX * pulse(right + 0.45));
  z.set("bip_toe_L_093", -TOE_MAX * pulse(left + 0.45));

  // 肩/肘：与同侧腿反相
  z.set("bip_upperArm_R_08", -SHOULDER_MAX * hipR);
  z.set("bip_upperArm_L_047", -SHOULDER_MAX * hipL);
  z.set("LeftElbow_helper_035", ELBOW_MAX * (0.22 + 0.78 * pulse(right + 0.1)));
  z.set("RightElbow_helper_075", ELBOW_MAX * (0.22 + 0.78 * pulse(left + 0.1)));

  // 脊椎：前倾 + 水平拧转（腰弯随步态起伏）
  const twist = 5 * Math.sin(2 * Math.PI * p);
  const lean = 4 * Math.sin(2 * Math.PI * p);
  z.set("bip_spine_1_04", SPINE_BEND.bip_spine_1_04 + lean * 0.6);
  z.set("bip_spine_2_05", SPINE_BEND.bip_spine_2_05 + lean * 0.3);
  z.set("bip_spine_3_06", SPINE_BEND.bip_spine_3_06);
  z.set("bip_neck_039", SPINE_BEND.bip_neck_039 - lean * 0.2);
  y.set("bip_spine_2_05", twist * 0.5);
  y.set("bip_spine_3_06", -twist * 0.5);
  y.set("bip_neck_039", -twist * 0.6);
  y.set("bip_head_040", twist * 0.5);

  // 下颌：随步态微张
  z.set("Bip_jaw_041", 13 * pulse(right + 0.25));

  // 眼珠：缓慢扫视（水平面 = 绕 Y）
  const gaze = 14 * Math.sin(2 * Math.PI * p * 0.5);
  y.set("Bip_Eyeball_R_045", gaze);
  y.set("Bip_Eyeball_L_043", gaze);

  // 眨眼：终结者的光学眼是**机械快门**（镜片翻下来挡住光路），
  // 每 4.2 秒一次，翻下 62° 再翻回来。
  const BLINK_PERIOD = 4.2;
  const bt = (seconds % BLINK_PERIOD) / BLINK_PERIOD;
  const shut = bt < 0.035 ? bt / 0.035 : bt < 0.09 ? 1 - (bt - 0.035) / 0.055 : 0;
  const eyeShut = 62 * shut;
  z.set("EXT_LeftEyeCine_02_046", eyeShut);
  z.set("EXT_RightEyeCine_02_044", eyeShut);

  // 五指：抓握 —— **腱索联动**
  // 屈肌腱从掌面跨过近节关节拉到中节：近节卷多少，中节被动跟着卷；
  // 末节有自己的屈肌（小指节由中节带一点）。所以是**比例链**，不是各自独立。
  const gripR = pulse(right + 0.35);
  const gripL = pulse(left + 0.35);
  /** 每根手指的节间传动比（近 → 中 → 末）。 */
  const FINGER_RATIO = [1.0, 1.35, 0.72];
  for (const joint of JOINTS) {
    const m = /^bip_(thumb|index|middle|ring|pinky)_([0-2])_(R|L)_/.exec(joint.name);
    if (!m) continue;
    const seg = Number(m[2]);
    const grip = m[3] === "R" ? gripR : gripL;
    // 传动比的累乘 → 末节 = 近节 × 1.35 × 0.72
    let ratio = 1;
    for (let k = 0; k < seg; k++) ratio *= FINGER_RATIO[k];
    z.set(joint.name, FINGER_CURL * ratio * grip);
  }

  for (const joint of JOINTS) {
    if (!z.has(joint.name)) z.set(joint.name, 0);
    if (!y.has(joint.name)) y.set(joint.name, 0);
  }
  // 落地冲击：脚跟触地（膝屈到位的瞬间）
  // 转身：整机的水平面缓慢偏转（机械行走时躯干带一点偏摆）
  return {
    z,
    y,
    land: { r: impact(right + 0.25), l: impact(left + 0.25) },
    turn: 6 * Math.sin(2 * Math.PI * p),
  };
}

/**
 * 末端补偿：踝/腕按**父链累计角**反向补偿，脚掌贴地、手掌随臂不歪。
 * 必须在链式顺序里算（父先子后），所以单独跑一遍。
 *
 * 脚：抵掉整条腿链（髋 + 膝）的累计角 → 支撑期脚掌与地面平行。
 * 手：只抵掉**肩**的摆角（不含肘的屈曲）——手是挂在小臂上的，
 * 肘弯多少手就跟着转多少，只是手腕本身保持中立位。
 */
function refineAngles(angles: Angles): void {
  const accum = new Map<string, number>();
  for (const joint of ORDERED) {
    const parentAccum = joint.parent ? (accum.get(joint.parent) ?? 0) : 0;
    let local = angles.z.get(joint.name) ?? 0;
    if (joint.name.startsWith("bip_foot_")) {
      // 踝：抵掉整条腿链的累计角 + 落地冲击（顶一下再回弹）
      const land = joint.name.endsWith("_R_081") ? angles.land.r : angles.land.l;
      local = -parentAccum + 4 + 9 * land;
    } else if (joint.name.startsWith("bip_hand_")) {
      // 腕：只抵掉肩的摆角（沿父链往上找 upperArm）
      const shoulder = jointChain(joint.name).find((n) => /upperArm/i.test(n));
      const shoulderAccum = shoulder ? (accum.get(shoulder) ?? 0) : 0;
      local = -shoulderAccum;
    }
    angles.z.set(joint.name, local);
    accum.set(joint.name, parentAccum + local);
  }
}

/** 关节姿态（世界位姿）。 */
interface Pose {
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
}

/** 求解所有关节的世界位姿。 */
function solveWorld(angles: Angles): Map<string, Pose> {
  const world = new Map<string, Pose>();
  const zero = new THREE.Vector3();
  for (const joint of ORDERED) {
    const parentJoint = joint.parent ? JOINT_BY_NAME.get(joint.parent) : undefined;
    const parent = joint.parent ? world.get(joint.parent) : undefined;
    const rest = new THREE.Vector3(...joint.pivot);
    const parentRest = parentJoint ? new THREE.Vector3(...parentJoint.pivot) : zero;
    const offset = rest.clone().sub(parentRest);
    // 局部旋转 = 矢状面屈伸（绕 Z）× 水平面扭转（绕 Y）
    const local = new THREE.Quaternion()
      .setFromAxisAngle(
        AXIS_VEC.z,
        THREE.MathUtils.degToRad(angles.z.get(joint.name) ?? 0),
      )
      .multiply(
        new THREE.Quaternion().setFromAxisAngle(
          AXIS_VEC.y,
          THREE.MathUtils.degToRad(angles.y.get(joint.name) ?? 0),
        ),
      );
    const quat = parent ? parent.quat.clone().multiply(local) : local;
    const pos = parent
      ? parent.pos.clone().add(offset.clone().applyQuaternion(parent.quat))
      : rest.clone();
    // 骨盆：落地时下沉一下（机械腿的重量感）
    if (!joint.parent) pos.y -= 0.009 * (angles.land.r + angles.land.l);
    // 骨盆：整机的**转身**（水平面缓慢偏转），子链跟着转
    if (!joint.parent) {
      quat.premultiply(
        new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(0, 1, 0),
          THREE.MathUtils.degToRad(angles.turn),
        ),
      );
    }
    world.set(joint.name, { pos, quat });
  }
  return world;
}

/** 缸的实时几何解：两端世界坐标、轴向、长度、露出杆长。 */
export interface CylinderState {
  key: string;
  /** 两端距离（mm） */
  lengthMm: number;
  /** 露出的活塞杆长度（mm） = |AB| - 缸长 */
  exposedMm: number;
  /** 当前轴向（单位向量） */
  axis: [number, number, number];
}

/** 计算缸两端的世界坐标。 */
function cylinderEnds(def: HydraulicDef, world: Map<string, Pose>): {
  a: THREE.Vector3;
  b: THREE.Vector3;
} {
  const parentPose = world.get(def.parent)!;
  const childPose = world.get(def.child)!;
  const parentRest = new THREE.Vector3(...JOINT_BY_NAME.get(def.parent)!.pivot);
  const childRest = new THREE.Vector3(...JOINT_BY_NAME.get(def.child)!.pivot);
  const a = parentPose.pos
    .clone()
    .add(new THREE.Vector3(...def.a).sub(parentRest).applyQuaternion(parentPose.quat));
  const b = childPose.pos
    .clone()
    .add(new THREE.Vector3(...def.b).sub(childRest).applyQuaternion(childPose.quat));
  return { a, b };
}

function cylinderState(def: HydraulicDef, world: Map<string, Pose>): CylinderState {
  const { a, b } = cylinderEnds(def, world);
  const delta = b.clone().sub(a);
  const length = delta.length();
  const axis = delta.clone().normalize();
  return {
    key: def.key,
    lengthMm: length * 1000,
    exposedMm: (length - def.barrel) * 1000,
    axis: [axis.x, axis.y, axis.z],
  };
}

/** 驱动整机姿态。 */
export function animateT800(
  model: AssembledModel,
  seconds: number,
  options: { idle?: boolean } = {},
): void {
  lastSeconds = seconds;
  model.resetNodes();
  // 待机：站姿（不迈步）—— 步态循环里总有一条腿屈着，静止展示用站姿更干净
  const angles: Angles = options.idle
    ? { z: new Map(), y: new Map(), land: { r: 0, l: 0 }, turn: 0 }
    : jointAngles(seconds);
  if (options.idle) {
    for (const [name, deg] of Object.entries(SPINE_BEND)) angles.z.set(name, deg);
  }
  refineAngles(angles);
  const world = solveWorld(angles);

  for (const joint of JOINTS) {
    const node = model.getNode(nodeNameOf(joint.name));
    if (!node) continue;
    const pose = world.get(joint.name)!;
    node.position.copy(pose.pos);
    node.quaternion.copy(pose.quat);
  }

  // 液压缸：活塞杆节点每帧重算（杆端指住缸口，露出长度由 |AB| 决定）
  for (const def of HYDRAULICS) {
    const node = model.getNode(rodNodeName(def.key));
    if (!node) continue;
    const { a, b } = cylinderEnds(def, world);
    const axis = b.clone().sub(a).normalize();
    node.position.copy(b);
    node.quaternion.setFromUnitVectors(cylinderAxis(def), axis);
  }

  model.syncInstances();
  updateTendons(model, world);
  model.root.updateMatrixWorld(true);
}

/**
 * 屈肌腱：每根手指**两段**（掌面锚点 → 近节滑轮 → 中节滑轮），
 * 绕过关节才符合机械。每帧按实际距离重算方向与长度（握拳时索被拉长）。
 */
function updateTendons(model: AssembledModel, world: Map<string, Pose>): void {
  const up = new THREE.Vector3(0, 1, 0);
  const dir = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const matrix = new THREE.Matrix4();
  for (const side of ["R", "L"] as const) {
    const hand = JOINT_BY_NAME.get(side === "R" ? "bip_hand_R_016" : "bip_hand_L_055");
    if (!hand) continue;
    const handPose = world.get(hand.name);
    if (!handPose) continue;
    for (const finger of ["thumb", "index", "middle", "ring", "pinky"]) {
      const bones = FINGER_BONES[`${finger}_${side}`];
      if (!bones) continue;
      const prox = JOINT_BY_NAME.get(bones.proximal);
      const mid = JOINT_BY_NAME.get(bones.middle);
      if (!prox || !mid) continue;
      const proxPose = world.get(prox.name);
      const midPose = world.get(mid.name);
      if (!proxPose || !midPose) continue;
      // 掌面锚点（跟手掌一起动）
      const anchorRest = new THREE.Vector3(
        hand.center[0] + (prox.center[0] - hand.center[0]) * 0.18,
        hand.center[1] + 0.012,
        hand.center[2] + (prox.center[2] - hand.center[2]) * 0.18,
      );
      const anchor = anchorRest
        .clone()
        .sub(new THREE.Vector3(...hand.pivot))
        .applyQuaternion(handPose.quat)
        .add(handPose.pos);
      // 两段：锚点→近节、近节→中节
      const chain = [anchor, proxPose.pos, midPose.pos];
      for (let seg = 0; seg < 2; seg++) {
        const node = model.getNode(tendonNodeName(`${finger}_${side}_s${seg + 1}`));
        if (!node) continue;
        const a = chain[seg];
        const b = chain[seg + 1];
        dir.copy(b).sub(a);
        const length = Math.max(dir.length(), 1e-4);
        dir.divideScalar(length);
        quat.setFromUnitVectors(up, dir);
        node.position.copy(a);
        node.quaternion.copy(quat);
        const handle =
          model.getPart(`${prefixOf(model)}.tendon.${finger}_${side.toLowerCase()}_s${seg + 1}`);
        if (handle) {
          scale.set(1, length, 1);
          matrix.compose(new THREE.Vector3(), new THREE.Quaternion(), scale);
          handle.setInstanceMatrix(0, matrix);
        }
      }
    }
  }
}

/** 从模型 id 推出零件 id 前缀（GLB 原型 / 机械拆解版）。 */
function prefixOf(model: AssembledModel): string {
  return model.registry.model === "t800_mech" ? "t800_mech" : "t800";
}

let lastSeconds = 0;

/** 液压缸读数（几何解）。 */
export function t800CylinderReadout(_model: AssembledModel): CylinderState[] {
  const angles = jointAngles(lastSeconds);
  refineAngles(angles);
  const world = solveWorld(angles);
  return HYDRAULICS.map((def) => cylinderState(def, world));
}

/** 前端读数：关节角 / 步态相位。 */
export function t800Readouts(): Array<{ label: string; value: string }> {
  return [
    { label: "步态相位", value: `${(gaitPhase(lastSeconds) * 100).toFixed(0)} %` },
    { label: "蒙皮部位", value: `${JOINTS.length} 件 · 120854 顶点` },
    { label: "液压缸", value: `${HYDRAULICS.length} 根` },
    { label: "模型高度", value: "1.90 m" },
  ];
}

/** 诊断用：当前姿态描述。 */
export function t800Pose(): { phase: number; bend: number } {
  return { phase: gaitPhase(lastSeconds), bend: 0 };
}
