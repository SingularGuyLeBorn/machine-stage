import * as THREE from "three";
import type { AssembledModel } from "../../assembler/assembler";
import {
  CYLINDER_PART_SUFFIXES,
  HYDRAULIC_NODE,
  JOINT_Y,
  NODES,
  T800_HYDRAULICS,
  aimQuaternion,
  cylinderDims,
  cylinderLayout,
  type HydraulicSpec,
  type Segment,
  type Vec3,
} from "./spec";

// ============================================================================
// t800/motion —— 屈伸循环 + 液压缸真实行程
//
// 关节角只驱动三段刚体（髋 / 膝 / 踝），缸的两端锚点 A、B 各自跟着父/子段走；
// 每帧把缸体节点放到 A、活塞杆节点放到 B，并把各自 +Y 指向对方。
// 因此「露出杆长 = |AB| - 缸长」是几何结果，不是写死的位移——关节转多少度，
// 活塞就伸缩多少毫米（scripts/diag-t800.ts 会逐帧核算）。
//
// 阻尼：每段用零初速的二阶欠阻尼阶跃响应（慢启动→加速→减速→过冲回弹），
// 不是匀速插值。
// ============================================================================

export const T800_MOTION_PARTS: string[] = [];

const CYCLE = 5.4;
const STROKE = 2.3;
const HOLD = 0.4;

/** 关节角上限（rad）：髋屈伸 / 膝屈伸 / 踝屈伸。 */
export const JOINT_RANGE = {
  hip: 0.35,
  knee: -1.05,
  ankle: 0.38,
};

/** 0..1 的欠阻尼阶跃响应：t=0 初速 0，约 t=0.55 过冲 ~3%，t=1 基本收敛。 */
function dampedStep(u: number): number {
  if (u <= 0) return 0;
  if (u >= 1) return 1;
  return 1 - Math.exp(-5 * u) * (Math.cos(6 * u) + (5 / 6) * Math.sin(6 * u));
}

export function t800Stroke(seconds: number): number {
  const p = ((seconds % CYCLE) + CYCLE) % CYCLE;
  if (p < STROKE) return dampedStep(p / STROKE);
  if (p < STROKE + HOLD) return 1;
  if (p < STROKE * 2 + HOLD) return 1 - dampedStep((p - STROKE - HOLD) / STROKE);
  return 0;
}

export interface T800Pose {
  hipDeg: number;
  kneeDeg: number;
  ankleDeg: number;
  /** 膝主缸当前露出杆长（mm） */
  kneeExposedMm: number;
  /** 每根缸的实时行程审计 */
  extensions: Array<{ key: string; name: string; exposedMm: number; lengthMm: number }>;
}

let lastPose: T800Pose = {
  hipDeg: 0,
  kneeDeg: 0,
  ankleDeg: 0,
  kneeExposedMm: 0,
  extensions: [],
};

const Z = new THREE.Vector3(0, 0, 1);

export function animateT800(model: AssembledModel, seconds: number): void {
  const s = t800Stroke(seconds);
  const hip = JOINT_RANGE.hip * s;
  const knee = JOINT_RANGE.knee * s;
  const ankle = JOINT_RANGE.ankle * s;

  const H = new THREE.Vector3(0, JOINT_Y.hip, 0);
  const K = new THREE.Vector3(0, JOINT_Y.knee, 0);
  const A = new THREE.Vector3(0, JOINT_Y.ankle, 0);

  const qHip = new THREE.Quaternion().setFromAxisAngle(Z, hip);
  const qKnee = new THREE.Quaternion().setFromAxisAngle(Z, hip + knee);
  const qAnkle = new THREE.Quaternion().setFromAxisAngle(Z, hip + knee + ankle);

  const K2 = K.clone().sub(H).applyQuaternion(qHip).add(H);
  const A2 = A.clone().sub(K).applyQuaternion(qKnee).add(K2);

  const setJoint = (name: string, pos: THREE.Vector3, quat: THREE.Quaternion) => {
    const node = model.getNode(name);
    if (!node) return;
    node.position.copy(pos);
    node.quaternion.copy(quat);
  };
  setJoint(NODES.hip, H, qHip);
  setJoint(NODES.knee, K2, qKnee);
  setJoint(NODES.ankle, A2, qAnkle);

  const pointAt = (seg: Segment, p: Vec3): THREE.Vector3 => {
    const v = new THREE.Vector3(...p);
    if (seg === "base") return v;
    if (seg === "hip") return v.sub(H).applyQuaternion(qHip).add(H);
    if (seg === "knee") return v.sub(K).applyQuaternion(qKnee).add(K2);
    return v.sub(A).applyQuaternion(qAnkle).add(A2);
  };
  const rotateNormal = (seg: Segment, n: Vec3): THREE.Vector3 => {
    const v = new THREE.Vector3(...n);
    if (seg === "hip") v.applyQuaternion(qHip);
    else if (seg === "knee") v.applyQuaternion(qKnee);
    else if (seg === "ankle") v.applyQuaternion(qAnkle);
    return v;
  };

  const extensions: T800Pose["extensions"] = [];
  for (const spec of T800_HYDRAULICS) {
    const Aw = pointAt(spec.parent, spec.A);
    const Bw = pointAt(spec.child, spec.B);
    const span = Aw.distanceTo(Bw);
    const layout = cylinderLayout(spec);
    // 露出杆长：导向套口部（layout.mouth）到杆端球心（B）的距离
    const exposedMm = (span - layout.mouth) * 1000;
    extensions.push({
      key: spec.key,
      name: spec.name_cn,
      exposedMm,
      lengthMm: span * 1000,
    });

    const cyl = model.getNode(HYDRAULIC_NODE(spec, "cyl"));
    if (cyl) {
      cyl.position.copy(Aw);
      cyl.quaternion.copy(
        aimQuaternion(vec(Aw), vec(Bw), vec(rotateNormal(spec.parent, normalOf(spec, "A")))),
      );
    }
    const rod = model.getNode(HYDRAULIC_NODE(spec, "rod"));
    if (rod) {
      rod.position.copy(Bw);
      rod.quaternion.copy(
        aimQuaternion(vec(Bw), vec(Aw), vec(rotateNormal(spec.child, normalOf(spec, "B")))),
      );
    }
  }

  lastPose = {
    hipDeg: THREE.MathUtils.radToDeg(hip),
    kneeDeg: THREE.MathUtils.radToDeg(knee),
    ankleDeg: THREE.MathUtils.radToDeg(ankle),
    kneeExposedMm: extensions.find((item) => item.key === "knee_main")?.exposedMm ?? 0,
    extensions,
  };

  model.syncInstances();
  model.root.updateMatrixWorld(true);
}

const vec = (v: THREE.Vector3): Vec3 => [v.x, v.y, v.z];

/** 安装面法线（缸的 A / B 端）。 */
function normalOf(spec: HydraulicSpec, end: "A" | "B"): Vec3 {
  return spec[`normal${end}`];
}

export function t800Readouts(): Array<{ label: string; value: string }> {
  return [
    {
      label: "髋 / 膝 / 踝",
      value: `${lastPose.hipDeg.toFixed(1)}° / ${lastPose.kneeDeg.toFixed(1)}° / ${lastPose.ankleDeg.toFixed(1)}°`,
    },
    { label: "膝主缸露出杆长", value: `${lastPose.kneeExposedMm.toFixed(1)} mm` },
    {
      label: "驱动缸",
      value:
        `${T800_HYDRAULICS.length} 根 · ${CYLINDER_PART_SUFFIXES.length} 件/根 · ` +
        `球头销 ${T800_HYDRAULICS.length * 2} 只`,
    },
  ];
}

/** 诊断用：当前帧各缸露出杆长（mm）。 */
export function t800Pose(): T800Pose {
  return lastPose;
}

/** 诊断用：静止状态下每根缸的 |AB| 与设计行程（mm）。 */
export function t800RestLengths(): Array<{ key: string; name: string; lengthMm: number }> {
  return T800_HYDRAULICS.map((spec) => ({
    key: spec.key,
    name: spec.name_cn,
    lengthMm: cylinderDims(spec).L * 1000,
  }));
}
