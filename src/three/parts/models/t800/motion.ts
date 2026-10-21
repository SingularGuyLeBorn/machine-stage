import * as THREE from "three";
import type { AssembledModel } from "../../assembler/assembler";
import { JOINT_BY_NAME, JOINTS, jointChain, nodeNameOf } from "./spec";
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

/** 步态相位（0..1）。 */
export function gaitPhase(seconds: number): number {
  return (((seconds % CYCLE) + CYCLE) % CYCLE) / CYCLE;
}

/** 关节角（度）。z = 矢状面屈伸，y = 水平面扭转。 */
interface Angles {
  z: Map<string, number>;
  y: Map<string, number>;
}

/** 屈伸幅度（度）。 */
const HIP_MAX = 17;
const KNEE_MAX = 68;
const ANKLE_MAX = 22;
const TOE_MAX = 20;
const SHOULDER_MAX = 15;
const ELBOW_MAX = 48;
const WRIST_MAX = 16;
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
  // 踝：踩平 + 蹬地
  z.set("bip_foot_R_081", 8 * kneeR - ANKLE_MAX * 0.25 * hipR);
  z.set("bip_foot_L_089", 8 * kneeL - ANKLE_MAX * 0.25 * hipL);
  // 趾：蹬地
  z.set("bip_toe_R_085", -TOE_MAX * pulse(right + 0.45));
  z.set("bip_toe_L_093", -TOE_MAX * pulse(left + 0.45));

  // 肩/肘/腕：与同侧腿反相
  z.set("bip_upperArm_R_08", -SHOULDER_MAX * hipR);
  z.set("bip_upperArm_L_047", -SHOULDER_MAX * hipL);
  z.set("LeftElbow_helper_035", ELBOW_MAX * (0.22 + 0.78 * pulse(right + 0.1)));
  z.set("RightElbow_helper_075", ELBOW_MAX * (0.22 + 0.78 * pulse(left + 0.1)));
  z.set("bip_hand_R_016", -WRIST_MAX * pulse(right + 0.1));
  z.set("bip_hand_L_055", -WRIST_MAX * pulse(left + 0.1));

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

  // 五指：抓握（握拳相位与摆动相关）
  const gripR = pulse(right + 0.35);
  const gripL = pulse(left + 0.35);
  for (const joint of JOINTS) {
    const m = /^bip_(thumb|index|middle|ring|pinky)_([0-2])_(R|L)_/.exec(joint.name);
    if (!m) continue;
    const seg = Number(m[2]);
    const grip = m[3] === "R" ? gripR : gripL;
    z.set(joint.name, FINGER_CURL * (0.3 + 0.32 * seg) * grip);
  }

  for (const joint of JOINTS) {
    if (!z.has(joint.name)) z.set(joint.name, 0);
    if (!y.has(joint.name)) y.set(joint.name, 0);
  }
  return { z, y };
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
export function animateT800(model: AssembledModel, seconds: number): void {
  lastSeconds = seconds;
  model.resetNodes();
  const angles = jointAngles(seconds);
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
  model.root.updateMatrixWorld(true);
}

let lastSeconds = 0;

/** 液压缸读数（几何解）。 */
export function t800CylinderReadout(_model: AssembledModel): CylinderState[] {
  const world = solveWorld(jointAngles(lastSeconds));
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
