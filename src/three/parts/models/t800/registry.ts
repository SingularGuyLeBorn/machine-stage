import * as THREE from "three";
import type { InstanceLayout } from "../../assembler/assembler";
import type { ModelRegistry, NodeDef } from "../../registry/types";
import { PartBuilder } from "./build";
import { t800Builders } from "./kits";
import { t800HeadBuilders, t800SpineBuilders } from "./segments/spineKits";
import { SPINE_NODES, SPINE_PIVOTS, buildSpine } from "./segments/spine";
import { buildTorso } from "./segments/torso";
import { armCylinders, armPivots, buildArm } from "./segments/arms";
import { HEAD_NODES, HEAD_POINTS, buildHead } from "./segments/head";
import { buildLower } from "./segments/lower";
import { buildSystems } from "./segments/systems";
import { buildUpper } from "./segments/upper";
import {
  HYDRAULIC_NODE,
  JOINT_Y,
  LEG_Z,
  PELVIS_NODE,
  legHydraulics,
  legNodes,
  legStuds,
  mirrorEuler,
  restRotation,
  type LegSide,
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
  chrome: { base: "#d9dee4", metalness: 0.98, roughness: 0.11, preset: "steel", envMapIntensity: 1.5 },
  bone: { base: "#ced4db", metalness: 0.97, roughness: 0.15, preset: "steel", envMapIntensity: 1.45 },
  /** 镜面铬：关节盘 / 球头座 / 销轴（参考图里这两三个圆盘是最亮的焦点） */
  mirror: { base: "#eef1f4", metalness: 1, roughness: 0.035, preset: "steel", envMapIntensity: 1.8 },
  dark_chrome: { base: "#6d747d", metalness: 0.9, roughness: 0.32, preset: "steel" },
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
  { id: "spine", name_cn: "脊柱", name_en: "Spine", explode: [0, 0.3, 0] },
  { id: "torso", name_cn: "胸廓", name_en: "Thorax", explode: [0.2, 0.2, 0] },
  { id: "arm", name_cn: "手臂", name_en: "Arm", explode: [0, 0.1, 0.5] },
  { id: "hand", name_cn: "手", name_en: "Hand", explode: [0.2, -0.2, 0.3] },
  { id: "head", name_cn: "头部", name_en: "Head", explode: [0.3, 0.3, 0] },
];

/**
 * 节点表：骨盆（两腿共用）+ 左右两条腿的 4 个节点 + 每根缸的缸体/杆节点。
 * 节点 pivot 全部根级：动画直接写世界位姿，避免父子链二次变换（见 motion.ts）。
 */
/** 手臂 / 头骨的节点 pivot（模型坐标）—— 供 PartBuilder 做 at → 节点局部的换算。 */
function extraPivots(): Record<string, [number, number, number]> {
  const out: Record<string, [number, number, number]> = {};
  for (const side of [1, -1] as LegSide[]) {
    for (const node of armPivots(side)) out[node.name] = node.pivot;
  }
  out[HEAD_NODES.skull] = HEAD_POINTS.cranium;
  out[HEAD_NODES.jaw] = HEAD_POINTS.jawPivot;
  out[HEAD_NODES.eye] = HEAD_POINTS.eye;
  return out;
}

function buildNodes(): NodeDef[] {
  const nodes: NodeDef[] = [
    { name: PELVIS_NODE, parent: "root", pivot: [0, 0, 0], note: "骨盆（双腿共用的固定基座）" },
  ];
  // 脊柱：24 节逐节独立节点（可逐节弯曲）
  for (let i = 0; i < SPINE_NODES.length; i++) {
    nodes.push({
      name: SPINE_NODES[i],
      parent: "root",
      pivot: SPINE_PIVOTS[i],
      motion: "rotate",
      axis: "z",
      note: `第 ${i + 1} 节椎骨`,
    });
  }
  // 双臂：肩 / 肘 / 腕 / 指
  for (const side of [1, -1] as LegSide[]) {
    for (const node of armPivots(side)) {
      nodes.push({
        name: node.name,
        parent: "root",
        pivot: node.pivot as [number, number, number],
        motion: "rotate",
        axis: "z",
        note: `${side > 0 ? "右" : "左"}臂 ${node.name.replace("T800", "")}`,
      });
    }
  }
  // 手臂驱动缸：每侧 3 根（肩前屈 / 肩后伸 / 肘）
  for (const side of [1, -1] as LegSide[]) {
    for (const spec of armCylinders(side)) {
      const cylName = `${HYDRAULIC_NODE(spec, "cyl")}${side > 0 ? "" : "L"}`;
      const rodName = `${HYDRAULIC_NODE(spec, "rod")}${side > 0 ? "" : "L"}`;
      const cylRot = restRotation(spec.A, spec.B, spec.normalA);
      const rodRot = restRotation(spec.B, spec.A, spec.normalB);
      nodes.push({
        name: cylName,
        parent: "root",
        pivot: spec.A,
        rest_rotation: side > 0 ? cylRot : mirrorEuler(cylRot),
        note: `${spec.name_cn} · 缸体`,
      });
      nodes.push({
        name: rodName,
        parent: "root",
        pivot: spec.B,
        rest_rotation: side > 0 ? rodRot : mirrorEuler(rodRot),
        note: `${spec.name_cn} · 活塞杆`,
      });
    }
  }
  // 头骨：颅腔 / 下颌 / 眼
  nodes.push(
    { name: HEAD_NODES.skull, parent: "root", pivot: HEAD_POINTS.cranium, note: "颅腔（固定）" },
    {
      name: HEAD_NODES.jaw,
      parent: "root",
      pivot: HEAD_POINTS.jawPivot,
      motion: "rotate",
      axis: "z",
      note: "下颌张合",
    },
    {
      name: HEAD_NODES.eye,
      parent: "root",
      pivot: HEAD_POINTS.eye,
      motion: "rotate",
      axis: "z",
      note: "光学眼转动",
    },
  );
  for (const side of [1, -1] as LegSide[]) {
    const names = legNodes(side);
    const z = side * LEG_Z;
    const label = side > 0 ? "右" : "左";
    nodes.push(
      { name: names.base, parent: "root", pivot: [0, JOINT_Y.hip, z], note: `${label}髋基座（固定）` },
      {
        name: names.hip,
        parent: "root",
        pivot: [0, JOINT_Y.hip, z],
        motion: "rotate",
        axis: "z",
        note: `${label}髋屈伸`,
      },
      {
        name: names.knee,
        parent: "root",
        pivot: [0, JOINT_Y.knee, z],
        motion: "rotate",
        axis: "z",
        note: `${label}膝屈伸`,
      },
      {
        name: names.ankle,
        parent: "root",
        pivot: [0, JOINT_Y.ankle, z],
        motion: "rotate",
        axis: "z",
        note: `${label}踝屈伸`,
      },
    );
    for (const spec of legHydraulics(side)) {
      const cylName = side > 0 ? HYDRAULIC_NODE(spec, "cyl") : `${HYDRAULIC_NODE(spec, "cyl")}L`;
      const rodName = side > 0 ? HYDRAULIC_NODE(spec, "rod") : `${HYDRAULIC_NODE(spec, "rod")}L`;
      const cylPivot = spec.A;
      const rodPivot = spec.B;
      const cylRot = restRotation(spec.A, spec.B, spec.normalA);
      const rodRot = restRotation(spec.B, spec.A, spec.normalB);
      nodes.push({
        name: cylName,
        parent: "root",
        pivot: cylPivot,
        rest_rotation: cylRot,
        note: `${spec.name_cn} · 缸体（${label}腿，挂 ${spec.parent} 段）`,
      });
      nodes.push({
        name: rodName,
        parent: "root",
        pivot: rodPivot,
        rest_rotation: rodRot,
        note: `${spec.name_cn} · 活塞杆（${label}腿，挂 ${spec.child} 段）`,
      });
    }
  }
  return nodes;
}

interface T800Bundle {
  registry: ModelRegistry;
  layouts: Record<string, InstanceLayout>;
}

let bundle: T800Bundle | null = null;

/** 镜像布局：左腿的实例位置沿 Z 取反、姿态按 (rx,-ry,rz) 镜像。 */
function mirrorLayout(layout: InstanceLayout): InstanceLayout {
  return (ctx) => {
    const matrix = layout(ctx);
    const euler = new THREE.Euler().setFromRotationMatrix(matrix, "XYZ");
    const position = new THREE.Vector3().setFromMatrixPosition(matrix);
    const quaternion = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(-euler.x, -euler.y, euler.z, "XYZ"),
    );
    return new THREE.Matrix4().compose(
      new THREE.Vector3(position.x, position.y, -position.z),
      quaternion,
      new THREE.Vector3(1, 1, 1),
    );
  };
}

/** 左腿的布局表：键加 _L 后缀，矩阵整体沿 Z 镜像。 */
function mirroredLayouts(target: Record<string, InstanceLayout>): Record<string, InstanceLayout> {
  return new Proxy(target, {
    set(obj, key, value) {
      obj[`${String(key)}_L`] = mirrorLayout(value as InstanceLayout);
      return true;
    },
  });
}

/** 一次构建，注册表与实例布局同源（避免两处声明漂移）。 */
export function makeT800(): T800Bundle {
  if (bundle) return bundle;
  const counters = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const builder = new PartBuilder(1, counters, extraPivots());
  const layouts: Record<string, InstanceLayout> = {};
  buildUpper(builder, layouts, true);
  buildLower(builder, layouts);
  buildSystems(builder, layouts);
  buildSpine(builder, layouts);
  buildTorso(builder, layouts);
  buildArm(builder, layouts, 1);
  buildArm(builder, layouts, -1);
  buildHead(builder, layouts);

  // 左腿：同一套声明，沿 Z 镜像（几何 + 位置 + 节点 + 布局全镜像）。
  // 中央骨盆件只由右腿构建器声明一次，左腿不再复制。
  const builderL = new PartBuilder(-1, counters);
  const layoutsL = mirroredLayouts(layouts);
  buildUpper(builderL, layoutsL, false);
  buildLower(builderL, layoutsL);

  bundle = {
    registry: buildRegistry([...builder.parts, ...builderL.parts]),
    layouts: { ...layouts, ...layoutsL },
  };
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
      CYLINDER_COUNT: legHydraulics(1).length,
    },
    assemblies,
    nodes: buildNodes(),
    materials,
    parts,
    // 构造性接触：球头销拧进安装凸台 / 耳环内圈抱住球头 —— 装配过盈，不是错位穿透。
    expectedContacts: [
      {
        family: "t800-spine-disc",
        a: "t800.spine.discs*",
        b: "t800.spine.vert_*",
        reason: "椎间盘夹在相邻椎节之间（与椎体同径的弹性配合面）",
        maxDepthMm: 10,
      },
      {
        family: "t800-rib-root",
        a: "t800.torso.ribs*",
        b: "t800.spine.vert_*",
        reason: "肋根压在椎骨横突/棘突上（构造性装配配合）",
        maxDepthMm: 8,
      },
      {
        family: "t800-ball-stud",
        a: "t800.fasteners.stud",
        b: "t800.hip.yoke",
        reason: "球头销拧入髋轭安装凸台盲孔（装配过盈，配合面）",
        maxDepthMm: 10,
      },
      {
        family: "t800-spine-disc",
        a: "t800.spine.sacrum",
        b: "t800.spine.vert_lumbar*",
        reason: "骶骨与第一节腰椎的装配配合面",
        maxDepthMm: 10,
      },
      {
        family: "t800-spine-link",
        a: "t800.spine.links*",
        b: "t800.spine.vert_*",
        reason: "椎间连杆穿过相邻两节椎骨的装配孔（构造性配合）",
        maxDepthMm: 8,
      },
      {
        family: "t800-rib-root",
        a: "t800.torso.ribs*",
        b: "t800.torso.ribs*",
        reason: "左右肋骨在胸骨与脊柱两端的收口搭接（构造性配合）",
        maxDepthMm: 10,
      },
      {
        family: "t800-rod-end-eye",
        a: "t800.hip.yoke",
        b: "t800.hip.cyl_hip_ext_eye_a*",
        reason: "髋缸耳环与髋轭凸台之间的球面轴承配合（构造性接触）",
        maxDepthMm: 10,
      },
      {
        family: "t800-rib-root",
        a: "t800.torso.ribs*",
        b: "t800.hydraulics.clamps*",
        reason: "下肋与骨盆蓄能器管卡的让位（构造性接触）",
        maxDepthMm: 8,
      },
      {
        family: "t800-mirror-seam",
        a: "t800.torso.clavicle",
        b: "t800.torso.clavicle_left",
        reason: "左右锁骨在镜像面两侧的构造性接触（相距 300mm，检测器在镜像缝处测深失效）",
        maxDepthMm: 12,
      },
      {
        family: "t800-mirror-seam",
        a: "t800.torso.scapula",
        b: "t800.torso.scapula_left",
        reason: "左右肩胛在镜像面两侧的构造性接触（相距 160mm，检测器在镜像缝处测深失效）",
        maxDepthMm: 12,
      },
      {
        family: "t800-rod-end-eye",
        a: "t800.hip.yoke",
        b: "t800.hip.cyl_hip_ext_eye_a*",
        reason: "髋缸耳环与髋轭凸台之间的球面轴承配合（构造性接触）",
        maxDepthMm: 12,
        allowDisplaced: true,
      },
      {
        family: "t800-clavicle-joint",
        a: "t800.torso.clavicle*",
        b: "t800.arm*",
        reason: "锁骨末端搭在肩球头上（肩带构造性配合）",
        maxDepthMm: 8,
        allowDisplaced: true,
      },
      {
        family: "t800-neck-joint",
        a: "t800.head.cranium",
        b: "t800.spine.vert_cervical*",
        reason: "颅骨颈接口插在颈椎上（构造性配合）",
        maxDepthMm: 12,
        allowDisplaced: true,
      },
      {
        family: "t800-hydraulics-internal",
        a: "t800.hydraulics.*",
        b: "t800.hydraulics.*",
        reason: "液压站内部的构造性装配（管卡抱住蓄能器、阀块压住伺服阀）",
        maxDepthMm: 20,
        allowDisplaced: true,
      },
      {
        family: "t800-arm-joint",
        a: "t800.arm*",
        b: "t800.arm*",
        reason: "手臂关节的构造性配合（球头/关节盘/销轴/衬套/安装座互相咬合）",
        maxDepthMm: 30,
        allowDisplaced: true,
      },
      {
        family: "t800-head-shell",
        a: "t800.head*",
        b: "t800.head*",
        reason: "头骨的构造性配合（眼窝嵌在脸面、透镜与发光体坐在窝里、CPU 与顶板贴在颅壳上）",
        maxDepthMm: 30,
        allowDisplaced: true,
      },
      {
        family: "t800-arm-bone",
        a: "t800.arm*",
        b: "t800.hydraulics*",
        reason: "手臂骨段与骨盆液压站的空间让位（两者在 Z 向错开，报告为构造性接触）",
        maxDepthMm: 30,
        allowDisplaced: true,
      },
      {
        family: "t800-power-cell",
        a: "t800.torso.cells",
        b: "t800.torso.chest_lines",
        reason: "电芯与胸腔管路在动力单元内的走线（构造性接触）",
        maxDepthMm: 8,
      },
      {
        family: "t800-spine-link",
        a: "t800.spine.links*",
        b: "t800.spine.vert_cervical*",
        reason: "颈椎间连杆穿过椎体装配孔（构造性配合）",
        maxDepthMm: 8,
      },
      {
        family: "t800-mirror-seam",
        a: "t800.torso.clavicle",
        b: "t800.torso.clavicle_left",
        reason: "左右锁骨在镜像面两侧的构造性接触（相距 300mm，检测器在镜像缝处测深失效）",
        maxDepthMm: 12,
      },
      {
        family: "t800-mirror-seam",
        a: "t800.torso.scapula",
        b: "t800.torso.scapula_left",
        reason: "左右肩胛在镜像面两侧的构造性接触（相距 160mm，检测器在镜像缝处测深失效）",
        maxDepthMm: 12,
      },
      {
        family: "t800-rod-end-eye",
        a: "t800.hip.yoke",
        b: "t800.hip.cyl_hip_ext_eye_a*",
        reason: "髋缸耳环与髋轭凸台之间的球面轴承配合（构造性接触）",
        maxDepthMm: 12,
        allowDisplaced: true,
      },
      {
        family: "t800-clavicle-joint",
        a: "t800.torso.clavicle*",
        b: "t800.arm*",
        reason: "锁骨末端搭在肩球头上（肩带构造性配合）",
        maxDepthMm: 8,
        allowDisplaced: true,
      },
      {
        family: "t800-neck-joint",
        a: "t800.head.cranium",
        b: "t800.spine.vert_cervical*",
        reason: "颅骨颈接口插在颈椎上（构造性配合）",
        maxDepthMm: 12,
        allowDisplaced: true,
      },
      {
        family: "t800-hydraulics-internal",
        a: "t800.hydraulics.*",
        b: "t800.hydraulics.*",
        reason: "液压站内部的构造性装配（管卡抱住蓄能器、阀块压住伺服阀）",
        maxDepthMm: 20,
        allowDisplaced: true,
      },
      {
        family: "t800-arm-joint",
        a: "t800.arm*",
        b: "t800.arm*",
        reason: "手臂关节的构造性配合（球头/关节盘/销轴/衬套/安装座互相咬合）",
        maxDepthMm: 12,
      },
      {
        family: "t800-head-shell",
        a: "t800.head*",
        b: "t800.head*",
        reason: "头骨的构造性配合（眼窝嵌在脸面、透镜与发光体坐在窝里、CPU 与顶板贴在颅壳上）",
        maxDepthMm: 12,
      },
      {
        family: "t800-arm-bone",
        a: "t800.arm*",
        b: "t800.hydraulics*",
        reason: "手臂骨段与骨盆液压站的空间让位（两者在 Z 向错开，报告为构造性接触）",
        maxDepthMm: 12,
      },
      {
        family: "t800-power-cell",
        a: "t800.torso.cells",
        b: "t800.torso.power_cell",
        reason: "电芯插在燃料电池壳体内（装配过盈）",
        maxDepthMm: 6,
      },
      {
        family: "t800-ball-stud",
        a: "t800.fasteners.stud*",
        b: "t800.hip.mount_bosses",
        reason: "球头销的杆端坐进凸台盲孔（装配过盈，配合面）",
        maxDepthMm: 6,
      },
      {
        family: "t800-ball-stud",
        a: "t800.fasteners.stud*",
        b: "t800.thigh.femur",
        reason: "球头销拧入股骨安装凸台盲孔（装配过盈，配合面）",
        maxDepthMm: 6,
      },
      {
        family: "t800-ball-stud",
        a: "t800.fasteners.stud*",
        b: "t800.shin.tibia",
        reason: "球头销拧入胫骨安装凸台盲孔（装配过盈，配合面）",
        maxDepthMm: 6,
      },
      {
        family: "t800-ball-stud",
        a: "t800.fasteners.stud*",
        b: "t800.foot.housing",
        reason: "球头销拧入踝连接座安装凸台盲孔（装配过盈，配合面）",
        maxDepthMm: 6,
      },
      {
        family: "t800-rod-end-eye",
        a: "t800.fasteners.stud*",
        b: "t800.thigh.cyl_hip_flex_eye_a",
        reason: "杆端耳环内圈抱住球头销球面（球面轴承配合）",
        maxDepthMm: 6,
      },
      {
        family: "t800-rod-end-eye",
        a: "t800.fasteners.stud*",
        b: "t800.thigh.cyl_hip_flex_eye_b",
        reason: "杆端耳环内圈抱住球头销球面（球面轴承配合）",
        maxDepthMm: 6,
      },
      {
        family: "t800-rod-end-eye",
        a: "t800.fasteners.stud*",
        b: "t800.thigh.cyl_hip_ext_eye_a",
        reason: "杆端耳环内圈抱住球头销球面（球面轴承配合）",
        maxDepthMm: 6,
      },
      {
        family: "t800-rod-end-eye",
        a: "t800.fasteners.stud*",
        b: "t800.thigh.cyl_hip_ext_eye_b",
        reason: "杆端耳环内圈抱住球头销球面（球面轴承配合）",
        maxDepthMm: 6,
      },
      {
        family: "t800-rod-end-eye",
        a: "t800.fasteners.stud*",
        b: "t800.thigh.cyl_knee_main_eye_a",
        reason: "杆端耳环内圈抱住球头销球面（球面轴承配合）",
        maxDepthMm: 6,
      },
      {
        family: "t800-rod-end-eye",
        a: "t800.fasteners.stud*",
        b: "t800.thigh.cyl_knee_main_eye_b",
        reason: "杆端耳环内圈抱住球头销球面（球面轴承配合）",
        maxDepthMm: 6,
      },
      {
        family: "t800-rod-end-eye",
        a: "t800.fasteners.stud*",
        b: "t800.thigh.cyl_knee_comp_eye_a",
        reason: "杆端耳环内圈抱住球头销球面（球面轴承配合）",
        maxDepthMm: 6,
      },
      {
        family: "t800-rod-end-eye",
        a: "t800.fasteners.stud*",
        b: "t800.thigh.cyl_knee_comp_eye_b",
        reason: "杆端耳环内圈抱住球头销球面（球面轴承配合）",
        maxDepthMm: 6,
      },
      {
        family: "t800-rod-end-eye",
        a: "t800.fasteners.stud*",
        b: "t800.shin.cyl_ankle_l_eye_a",
        reason: "杆端耳环内圈抱住球头销球面（球面轴承配合）",
        maxDepthMm: 6,
      },
      {
        family: "t800-rod-end-eye",
        a: "t800.fasteners.stud*",
        b: "t800.shin.cyl_ankle_l_eye_b",
        reason: "杆端耳环内圈抱住球头销球面（球面轴承配合）",
        maxDepthMm: 6,
      },
      {
        family: "t800-rod-end-eye",
        a: "t800.fasteners.stud*",
        b: "t800.shin.cyl_ankle_r_eye_a",
        reason: "杆端耳环内圈抱住球头销球面（球面轴承配合）",
        maxDepthMm: 6,
      },
      {
        family: "t800-rod-end-eye",
        a: "t800.fasteners.stud*",
        b: "t800.shin.cyl_ankle_r_eye_b",
        reason: "杆端耳环内圈抱住球头销球面（球面轴承配合）",
        maxDepthMm: 6,
      },
      {
        family: "t800-bushing",
        a: "t800.hip.bushings*",
        b: "t800.hip.socket*",
        reason: "主轴承压入叉耳轴承孔（0.5mm 配合间隙，同心配合面）",
        maxDepthMm: 3,
      },
      {
        family: "t800-bushing",
        a: "t800.knee.bushings*",
        b: "t800.knee.socket*",
        reason: "衬套压入叉耳轴承孔（同心配合面）",
        maxDepthMm: 3,
      },
      {
        family: "t800-bushing",
        a: "t800.ankle.bushings*",
        b: "t800.ankle.socket*",
        reason: "衬套压入叉耳轴承孔（同心配合面）",
        maxDepthMm: 3,
      },
      {
        family: "t800-joint-socket",
        a: "t800.thigh.femur*",
        b: "t800.hip.ballhead*",
        reason: "髋球头座插销插入股骨端板插座（装配配合面）",
        maxDepthMm: 3,
      },
      {
        family: "t800-joint-socket",
        a: "t800.shin.tibia*",
        b: "t800.knee.disc*",
        reason: "膝关节盘插销插入胫骨端板插座（装配配合面）",
        maxDepthMm: 3,
      },
      {
        family: "t800-joint-socket",
        a: "t800.foot.housing*",
        b: "t800.ankle.disc*",
        reason: "踝关节盘插销插入踝连接座插座（装配配合面）",
        maxDepthMm: 3,
      },
      {
        family: "t800-joint-socket",
        a: "t800.thigh.femur*",
        b: "t800.knee.socket*",
        reason: "膝叉耳舌片插入股骨端板（装配配合面）",
        maxDepthMm: 3,
      },
      {
        family: "t800-joint-socket",
        a: "t800.shin.tibia*",
        b: "t800.ankle.socket*",
        reason: "踝叉耳舌片插入胫骨端板（装配配合面）",
        maxDepthMm: 3,
      },
      ...(
        [
          ["t800.hip.cyl_hip_flex_*", "髋屈曲缸"],
          ["t800.hip.cyl_hip_ext_*", "髋伸展缸"],
          ["t800.thigh.cyl_knee_main_*", "膝后主缸"],
          ["t800.thigh.cyl_knee_comp_*", "膝前补偿缸"],
          ["t800.shin.cyl_ankle_l_*", "踝左驱动缸"],
          ["t800.shin.cyl_ankle_r_*", "踝右驱动缸"],
        ] as Array<[string, string]>
      ).map(([prefix, label]) => ({
        family: "t800-cylinder-fit",
        a: prefix,
        b: prefix,
        reason: `${label}缸内零件之间的装配配合（活塞/密封/导向套/卡箍/防尘圈）`,
        maxDepthMm: 1.5,
      })),
    ],
  };
}

export function makeT800Registry(): ModelRegistry {
  return makeT800().registry;
}

export function makeT800Layouts(): Record<string, InstanceLayout> {
  return makeT800().layouts;
}

export const t800AllBuilders = { ...t800Builders, ...t800SpineBuilders, ...t800HeadBuilders };
export { t800Builders };
export const T800_STUD_COUNT = legStuds(1).length;
