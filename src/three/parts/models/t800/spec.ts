import { classifyJoint, type JointAsm, type JointMat } from "./mesh/classes";
import { MESH_META } from "./mesh/assets";

// ============================================================================
// t800/spec —— 真实网格模型的单一真值源
//
// 数据来源：scripts/import-t800-mesh.ts 从 t800-mesh.obj + t800-verts-joints.csv
// 切出的 76 个蒙皮部位（几何在 mesh/assets.ts，分类在 mesh/classes.ts）。
//
// 坐标：+X 前、+Y 上、+Z 右；模型已换算为站立姿态，身高 1.90m，脚底 y=0。
// ============================================================================

/** 部位定义（一个蒙皮部位 = 一个零件）。 */
export interface JointDef {
  /** 骨骼原名（Blender） */
  name: string;
  /** 零件 id */
  partId: string;
  /** 装配分组 */
  asm: JointAsm;
  /** 动画父部位 */
  parent: string | null;
  /** 材质 */
  mat: JointMat;
  /** 旋转中心（模型坐标）—— 关节转动绕此点 */
  pivot: [number, number, number];
  /** 装配中心（模型坐标）—— 零件包围盒中心 */
  center: [number, number, number];
  /** 包围盒尺寸 */
  size: [number, number, number];
  /** 部位类型 */
  kind: "bone" | "barrel" | "rod";
}

/**
 * 关节旋转中心覆盖表。
 * 默认用包围盒中心（多数骨骼这样就够），但**可动关节**必须用真实关节点：
 * 膝、肘、髋、肩、踝、腕、脊椎各节、颈、头、下颌——否则弯曲时骨骼会绕中部转，
 * 看起来像"断成两截"。
 * 数值来自 mesh 的实测包围盒与关节标记骨（*_helper_*）。
 */
export const PIVOT_OVERRIDE: Record<string, [number, number, number]> = {
  // 右腿（+Z 侧）
  bip_hip_R_078: [0.015, 0.9, 0.115],
  LeftUpLegRoll_084: [0.015, 0.9, 0.115],
  LeftKnee_helper_086: [0.035, 0.544, 0.135],
  bip_foot_R_081: [0.0, 0.11, 0.196],
  bip_toe_R_085: [0.124, 0.03, 0.212],
  // 左腿（-Z 侧）
  bip_hip_L_082: [0.015, 0.9, -0.135],
  RightUpLegRoll_092: [0.015, 0.9, -0.135],
  RightKnee_helper_094: [0.035, 0.542, -0.155],
  bip_foot_L_089: [0.0, 0.11, -0.216],
  bip_toe_L_093: [0.124, 0.03, -0.232],
  // 右臂（+Z 侧）
  bip_upperArm_R_08: [0.0, 1.53, 0.2],
  LeftElbow_helper_035: [0.0237, 1.2639, 0.2368],
  bip_hand_R_016: [0.15, 1.09, 0.25],
  // 左臂（−Z 侧）
  bip_upperArm_L_047: [0.0, 1.53, -0.22],
  RightElbow_helper_075: [0.0237, 1.2642, -0.2564],
  bip_hand_L_055: [0.15, 1.09, -0.27],
  // 躯干中轴
  bip_spine_1_04: [-0.03, 1.16, -0.01],
  bip_spine_2_05: [-0.03, 1.19, -0.01],
  bip_spine_3_06: [0.0, 1.16, -0.01],
  bip_neck_039: [0.02, 1.65, -0.01],
  bip_head_040: [0.035, 1.67, -0.01],
  Bip_jaw_041: [0.05, 1.72, -0.01],
};

/** Blender 原名 → 零件 id（零件 id 必须小写、字母开头）。 */
export function partIdOf(name: string): string {
  const safe = name.toLowerCase().replace(/^([0-9])/, "b$1");
  return `t800.mesh.${safe}`;
}

/** 由资产清单 + 分类表生成部位表。 */
export const JOINTS: JointDef[] = MESH_META.map((meta) => {
  const cls = classifyJoint(meta.n);
  const [minX, minY, minZ, extX, extY, extZ] = meta.b;
  const center: [number, number, number] = [
    minX + extX / 2,
    minY + extY / 2,
    minZ + extZ / 2,
  ];
  return {
    name: meta.n,
    partId: partIdOf(meta.n),
    asm: cls.asm,
    parent: cls.parent,
    mat: cls.mat,
    pivot: PIVOT_OVERRIDE[meta.n] ?? center,
    center,
    size: [extX, extY, extZ],
    kind: meta.k,
  };
});

/** 部位名 → 定义。 */
export const JOINT_BY_NAME = new Map(JOINTS.map((j) => [j.name, j]));

/** 节点名（部位名加前缀，避免与别的模型的节点重名）。 */
export const nodeNameOf = (joint: string) => `T800_${joint}`;

/** 全部节点 pivot（模型坐标）。 */
export const NODE_PIVOTS: Record<string, [number, number, number]> = Object.fromEntries(
  JOINTS.map((j) => [nodeNameOf(j.name), j.pivot]),
);

/** 分类表里引用了但网格里没有的父部位（拼写/命名不一致）——列出来便于排查。 */
export const MISSING_PARENTS = JOINTS.filter(
  (j) => j.parent && !JOINT_BY_NAME.has(j.parent),
).map((j) => `${j.name} → ${j.parent}`);

/** 关节链：从根到该部位的部位名序列。 */
export function jointChain(name: string): string[] {
  const chain: string[] = [];
  let cur: string | null = name;
  const guard = new Set<string>();
  while (cur && !guard.has(cur)) {
    guard.add(cur);
    chain.unshift(cur);
    cur = JOINT_BY_NAME.get(cur)?.parent ?? null;
  }
  return chain;
}

/** 五指各节（用于抓握）。 */
export const FINGER_JOINTS = JOINTS.filter((j) => /^bip_(thumb|index|middle|ring|pinky)_/.test(j.name)).map(
  (j) => j.name,
);
