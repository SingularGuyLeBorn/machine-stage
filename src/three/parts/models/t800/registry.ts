import type { InstanceLayout } from "../../assembler/assembler";
import type { ModelRegistry, NodeDef } from "../../registry/types";
import { PartBuilder } from "./build";
import { t800Builders } from "./kits";
import { buildLower } from "./segments/lower";
import { buildSystems } from "./segments/systems";
import { buildUpper } from "./segments/upper";
import {
  HYDRAULIC_NODE,
  JOINT_Y,
  MOUNTS,
  NODE_PIVOT,
  NODES,
  T800_HYDRAULICS,
  T800_STUDS,
  restRotation,
} from "./spec";

// ============================================================================
// t800/registry —— T-800 内骨骼 · 右腿（零件级）
//
// 一条腿 = 3 个转动副 + 6 根驱动缸 + 液压站 + 足部。
// 粒度基准：每根驱动缸 10 件（缸体 / 缸底盖 / 导向套 / 杆密封 / 防尘圈 /
// 耳环A / 活塞杆 / 活塞 / 活塞密封 / 耳环B），六根共 60 件；球头螺栓 12 件实例化；
// 衬套 / 卡环 / 密封 / 接头 / 护甲 / 硬管 全部拆成独立件或实例族。
//
// 坐标：+X 前、+Y 上、+Z 右；髋 1.30 / 膝 0.72 / 踝 0.14，脚底 y≈0。
// 关节节点全部根级：动画直接写世界位姿，避免父子链二次变换（见 motion.ts）。
// ============================================================================

/** 铬钢骨架材质库。 */
const materials: ModelRegistry["materials"] = {
  chrome: { base: "#c9ced4", metalness: 0.95, roughness: 0.18, preset: "steel", envMapIntensity: 1.35 },
  bone: { base: "#aab3bd", metalness: 0.93, roughness: 0.24, preset: "steel", envMapIntensity: 1.25 },
  dark_chrome: { base: "#7c838c", metalness: 0.92, roughness: 0.3, preset: "steel" },
  gunmetal: { base: "#3f454d", metalness: 0.86, roughness: 0.42, preset: "steel_rough" },
  frame: { base: "#23272d", metalness: 0.72, roughness: 0.55, preset: "steel_rough" },
  rubber: { base: "#101216", metalness: 0.02, roughness: 0.9, preset: "rubber" },
  brass: { base: "#b08a4a", metalness: 0.9, roughness: 0.28, preset: "none" },
  servo: { base: "#8f1f26", metalness: 0.55, roughness: 0.4, preset: "none" },
};

const assemblies: ModelRegistry["assemblies"] = [
  { id: "hip", name_cn: "髋关节", name_en: "Hip joint", explode: [0, 0.4, 0] },
  { id: "thigh", name_cn: "大腿", name_en: "Thigh", explode: [0, 0.2, 0.3] },
  { id: "knee", name_cn: "膝关节", name_en: "Knee joint", explode: [0, 0.1, 0.5] },
  { id: "shin", name_cn: "小腿", name_en: "Shin", explode: [0, -0.2, 0.3] },
  { id: "ankle", name_cn: "踝关节", name_en: "Ankle joint", explode: [0, -0.4, 0.2] },
  { id: "foot", name_cn: "足部", name_en: "Foot", explode: [0.4, -0.5, 0] },
  { id: "hydraulics", name_cn: "液压站", name_en: "Hydraulic station", explode: [-0.3, 0.5, -0.3] },
  { id: "fasteners", name_cn: "紧固与密封", name_en: "Fasteners", explode: [0, 0.6, -0.4] },
];

/** 关节节点 + 每根缸的缸体/杆节点。 */
function buildNodes(): NodeDef[] {
  const nodes: NodeDef[] = [
    { name: NODES.base, parent: "root", pivot: NODE_PIVOT[NODES.base], note: "固定基座（骨盆段）" },
    {
      name: NODES.hip,
      parent: "root",
      pivot: NODE_PIVOT[NODES.hip],
      motion: "rotate",
      axis: "z",
      note: "髋屈伸",
    },
    {
      name: NODES.knee,
      parent: "root",
      pivot: NODE_PIVOT[NODES.knee],
      motion: "rotate",
      axis: "z",
      note: "膝屈伸",
    },
    {
      name: NODES.ankle,
      parent: "root",
      pivot: NODE_PIVOT[NODES.ankle],
      motion: "rotate",
      axis: "z",
      note: "踝屈伸",
    },
  ];
  for (const spec of T800_HYDRAULICS) {
    const normalA = MOUNTS[`${spec.key}_a`].normal;
    const normalB = MOUNTS[`${spec.key}_b`].normal;
    nodes.push({
      name: HYDRAULIC_NODE(spec, "cyl"),
      parent: "root",
      pivot: spec.A,
      rest_rotation: restRotation(spec.A, spec.B, normalA),
      note: `${spec.name_cn} · 缸体（挂 ${spec.parent} 段）`,
    });
    nodes.push({
      name: HYDRAULIC_NODE(spec, "rod"),
      parent: "root",
      pivot: spec.B,
      rest_rotation: restRotation(spec.B, spec.A, normalB),
      note: `${spec.name_cn} · 活塞杆（挂 ${spec.child} 段）`,
    });
  }
  return nodes;
}

interface T800Bundle {
  registry: ModelRegistry;
  layouts: Record<string, InstanceLayout>;
}

let bundle: T800Bundle | null = null;

/** 一次构建，注册表与实例布局同源（避免两处声明漂移）。 */
export function makeT800(): T800Bundle {
  if (bundle) return bundle;
  const builder = new PartBuilder();
  const layouts: Record<string, InstanceLayout> = {};
  buildUpper(builder, layouts);
  buildLower(builder, layouts);
  buildSystems(builder, layouts);
  bundle = { registry: buildRegistry(builder.parts), layouts };
  return bundle;
}

function buildRegistry(parts: ModelRegistry["parts"]): ModelRegistry {
  return {
    model: "t800",
    title: "T-800 内骨骼 · 右腿",
    subtitle: "髋 / 膝 / 踝 + 6 根驱动缸（零件级）",
    source_notes:
      "站姿 1.60m；大腿 0.50m、小腿 0.50m、足长 0.30m。液压缸 |AB| 由关节坐标算出，" +
      "露出杆长 = |AB| - 缸长（几何结果，非动画写死）。球头销球心在安装面外 28mm，" +
      "耳环孔轴与销轴同轴。",
    constants: {
      HIP_Y: JOINT_Y.hip,
      KNEE_Y: JOINT_Y.knee,
      ANKLE_Y: JOINT_Y.ankle,
      BALL_OFFSET: 0.028,
      CYLINDER_COUNT: T800_HYDRAULICS.length,
    },
    assemblies,
    nodes: buildNodes(),
    materials,
    parts,
    // 构造性接触：球头销拧进安装凸台 / 耳环内圈抱住球头 —— 装配过盈，不是错位穿透。
    expectedContacts: [
      {
        family: "t800-ball-stud",
        a: "t800.fasteners.stud",
        b: "t800.hip.mount_bosses",
        reason: "球头销的杆端坐进凸台盲孔（装配过盈，配合面）",
        maxDepthMm: 6,
      },
      {
        family: "t800-ball-stud",
        a: "t800.fasteners.stud",
        b: "t800.thigh.femur",
        reason: "球头销拧入股骨安装凸台盲孔（装配过盈，配合面）",
        maxDepthMm: 6,
      },
      {
        family: "t800-ball-stud",
        a: "t800.fasteners.stud",
        b: "t800.shin.tibia",
        reason: "球头销拧入胫骨安装凸台盲孔（装配过盈，配合面）",
        maxDepthMm: 6,
      },
      {
        family: "t800-ball-stud",
        a: "t800.fasteners.stud",
        b: "t800.foot.housing",
        reason: "球头销拧入踝连接座安装凸台盲孔（装配过盈，配合面）",
        maxDepthMm: 6,
      },
      {
        family: "t800-rod-end-eye",
        a: "t800.fasteners.stud",
        b: "t800.thigh.cyl_hip_flex_eye_a",
        reason: "杆端耳环内圈抱住球头销球面（球面轴承配合）",
        maxDepthMm: 6,
      },
      {
        family: "t800-rod-end-eye",
        a: "t800.fasteners.stud",
        b: "t800.thigh.cyl_hip_flex_eye_b",
        reason: "杆端耳环内圈抱住球头销球面（球面轴承配合）",
        maxDepthMm: 6,
      },
      {
        family: "t800-rod-end-eye",
        a: "t800.fasteners.stud",
        b: "t800.thigh.cyl_hip_ext_eye_a",
        reason: "杆端耳环内圈抱住球头销球面（球面轴承配合）",
        maxDepthMm: 6,
      },
      {
        family: "t800-rod-end-eye",
        a: "t800.fasteners.stud",
        b: "t800.thigh.cyl_hip_ext_eye_b",
        reason: "杆端耳环内圈抱住球头销球面（球面轴承配合）",
        maxDepthMm: 6,
      },
      {
        family: "t800-rod-end-eye",
        a: "t800.fasteners.stud",
        b: "t800.thigh.cyl_knee_main_eye_a",
        reason: "杆端耳环内圈抱住球头销球面（球面轴承配合）",
        maxDepthMm: 6,
      },
      {
        family: "t800-rod-end-eye",
        a: "t800.fasteners.stud",
        b: "t800.thigh.cyl_knee_main_eye_b",
        reason: "杆端耳环内圈抱住球头销球面（球面轴承配合）",
        maxDepthMm: 6,
      },
      {
        family: "t800-rod-end-eye",
        a: "t800.fasteners.stud",
        b: "t800.thigh.cyl_knee_comp_eye_a",
        reason: "杆端耳环内圈抱住球头销球面（球面轴承配合）",
        maxDepthMm: 6,
      },
      {
        family: "t800-rod-end-eye",
        a: "t800.fasteners.stud",
        b: "t800.thigh.cyl_knee_comp_eye_b",
        reason: "杆端耳环内圈抱住球头销球面（球面轴承配合）",
        maxDepthMm: 6,
      },
      {
        family: "t800-rod-end-eye",
        a: "t800.fasteners.stud",
        b: "t800.shin.cyl_ankle_l_eye_a",
        reason: "杆端耳环内圈抱住球头销球面（球面轴承配合）",
        maxDepthMm: 6,
      },
      {
        family: "t800-rod-end-eye",
        a: "t800.fasteners.stud",
        b: "t800.shin.cyl_ankle_l_eye_b",
        reason: "杆端耳环内圈抱住球头销球面（球面轴承配合）",
        maxDepthMm: 6,
      },
      {
        family: "t800-rod-end-eye",
        a: "t800.fasteners.stud",
        b: "t800.shin.cyl_ankle_r_eye_a",
        reason: "杆端耳环内圈抱住球头销球面（球面轴承配合）",
        maxDepthMm: 6,
      },
      {
        family: "t800-rod-end-eye",
        a: "t800.fasteners.stud",
        b: "t800.shin.cyl_ankle_r_eye_b",
        reason: "杆端耳环内圈抱住球头销球面（球面轴承配合）",
        maxDepthMm: 6,
      },
      {
        family: "t800-bushing",
        a: "t800.hip.bushings",
        b: "t800.hip.socket",
        reason: "主轴承压入叉耳轴承孔（0.5mm 配合间隙，同心配合面）",
        maxDepthMm: 3,
      },
      {
        family: "t800-bushing",
        a: "t800.knee.bushings",
        b: "t800.knee.socket",
        reason: "衬套压入叉耳轴承孔（同心配合面）",
        maxDepthMm: 3,
      },
      {
        family: "t800-bushing",
        a: "t800.ankle.bushings",
        b: "t800.ankle.socket",
        reason: "衬套压入叉耳轴承孔（同心配合面）",
        maxDepthMm: 3,
      },
      {
        family: "t800-joint-socket",
        a: "t800.thigh.femur",
        b: "t800.hip.ballhead",
        reason: "髋球头座插销插入股骨端板插座（装配配合面）",
        maxDepthMm: 3,
      },
      {
        family: "t800-joint-socket",
        a: "t800.shin.tibia",
        b: "t800.knee.disc",
        reason: "膝关节盘插销插入胫骨端板插座（装配配合面）",
        maxDepthMm: 3,
      },
      {
        family: "t800-joint-socket",
        a: "t800.foot.housing",
        b: "t800.ankle.disc",
        reason: "踝关节盘插销插入踝连接座插座（装配配合面）",
        maxDepthMm: 3,
      },
      {
        family: "t800-joint-socket",
        a: "t800.thigh.femur",
        b: "t800.knee.socket",
        reason: "膝叉耳舌片插入股骨端板（装配配合面）",
        maxDepthMm: 3,
      },
      {
        family: "t800-joint-socket",
        a: "t800.shin.tibia",
        b: "t800.ankle.socket",
        reason: "踝叉耳舌片插入胫骨端板（装配配合面）",
        maxDepthMm: 3,
      },
    ],
  };
}

export function makeT800Registry(): ModelRegistry {
  return makeT800().registry;
}

export function makeT800Layouts(): Record<string, InstanceLayout> {
  return makeT800().layouts;
}

export { t800Builders };
export const T800_STUD_COUNT = T800_STUDS.length;
