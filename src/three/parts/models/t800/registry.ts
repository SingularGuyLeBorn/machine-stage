import type { InstanceLayout } from "../../assembler/assembler";
import type { GeometryBuilder } from "../../assembler/geometry";
import type { KitParam } from "../../registry/types";
import type { ModelRegistry, NodeDef } from "../../registry/types";
import { PartBuilder } from "./build";
import { JOINTS, MISSING_PARENTS, NODE_PIVOTS, nodeNameOf } from "./spec";
import { MECH_NAMES, boneName } from "./names";
import { meshPartGeometryByIndex } from "./mesh/geometry";
import {
  HYDRAULICS,
  hydraulicGeometry,
  hydraulicPlans,
  rodNodeName,
  type HydKind,
} from "./hydraulics";

// ============================================================================
// t800/registry —— T-800 内骨骼（真实网格切分 + 关节液压缸）
//
// 零件 = 真实网格按蒙皮切出的 76 个骨骼部位（每件独立 partId）
//      + 14 根关节驱动缸 × 7 件（缸体/活塞/活塞杆/耳环×2/导向套/密封）
// 几何来自 mesh/assets.ts（120854 顶点 / 130884 面，站立姿态，身高 1.90m）。
// ============================================================================

/** 铬钢骨架材质库（银亮金属，关节深色，眼为红色）。 */
const materials: ModelRegistry["materials"] = {
  chrome: { base: "#d7dce2", metalness: 0.98, roughness: 0.14, preset: "steel", envMapIntensity: 1.5 },
  mirror: { base: "#eef1f4", metalness: 1, roughness: 0.04, preset: "steel", envMapIntensity: 1.8 },
  gunmetal: { base: "#3f454d", metalness: 0.86, roughness: 0.42, preset: "steel_rough" },
  dark_chrome: { base: "#6d747d", metalness: 0.9, roughness: 0.32, preset: "steel" },
  servo: { base: "#8f1f26", metalness: 0.55, roughness: 0.4, preset: "none" },
  rubber: { base: "#101216", metalness: 0.02, roughness: 0.9, preset: "rubber" },
  brass: { base: "#b08a4a", metalness: 0.9, roughness: 0.28, preset: "none" },
};

const ASM_LABEL: Record<string, { cn: string; en: string }> = {
  pelvis: { cn: "骨盆", en: "Pelvis" },
  spine: { cn: "脊柱", en: "Spine" },
  neck: { cn: "颈部", en: "Neck" },
  head: { cn: "头部", en: "Head" },
  shoulder: { cn: "肩带", en: "Shoulder girdle" },
  arm: { cn: "手臂", en: "Arm" },
  hand: { cn: "手部", en: "Hand" },
  leg: { cn: "下肢", en: "Leg" },
  foot: { cn: "足部", en: "Foot" },
  hydraulics: { cn: "液压系统", en: "Hydraulic System" },
};

const assemblies: ModelRegistry["assemblies"] = Object.entries(ASM_LABEL).map(([id, v]) => ({
  id,
  name_cn: v.cn,
  name_en: v.en,
  explode: [0, 0.2, 0],
}));

/** 节点 = 每个蒙皮部位一个 + 每根缸一个活塞杆节点。 */
function buildNodes(): NodeDef[] {
  const nodes: NodeDef[] = [];
  for (const joint of JOINTS) {
    nodes.push({
      name: nodeNameOf(joint.name),
      parent: "root",
      pivot: joint.pivot,
      note: `${joint.name}（${ASM_LABEL[joint.asm].cn}）`,
    });
  }
  for (const def of HYDRAULICS) {
    nodes.push({
      name: rodNodeName(def.key),
      parent: "root",
      pivot: def.b,
      note: `${def.key} 活塞杆（随关节角真实伸缩）`,
    });
  }
  return nodes;
}

interface T800Bundle {
  registry: ModelRegistry;
  layouts: Record<string, InstanceLayout>;
}

let bundle: T800Bundle | null = null;

/** 一次构建：注册表与几何同源（每件几何 = 真实网格的一个蒙皮部位 / 一件缸零件）。 */
export function makeT800(): T800Bundle {
  if (bundle) return bundle;
  const pivots: Record<string, [number, number, number]> = { ...NODE_PIVOTS };
  for (const def of HYDRAULICS) pivots[rodNodeName(def.key)] = def.b;
  const builder = new PartBuilder(pivots);
  const layouts: Record<string, InstanceLayout> = {};

  // ---- 真实网格切出的骨骼零件（标准机械/解剖命名）----
  for (let index = 0; index < JOINTS.length; index++) {
    const joint = JOINTS[index];
    const name = boneName(joint.name);
    builder.add({
      id: `t800.${name.system}.${name.slug}`,
      cn: name.cn,
      en: name.en,
      asm: joint.asm,
      geom: {
        type: "kit",
        kit: "t800Mesh",
        params: { partIndex: index },
      },
      mat: joint.mat,
      layer: joint.asm === "hand" ? 2 : 1,
      node: nodeNameOf(joint.name),
      at: joint.center,
      hint: `${name.en} · ${joint.size.map((v) => (v * 1000).toFixed(0)).join("×")} mm`,
    });
  }

  // ---- 关节驱动液压缸 ----
  for (let cylIndex = 0; cylIndex < HYDRAULICS.length; cylIndex++) {
    const def = HYDRAULICS[cylIndex];
    const plans = hydraulicPlans(def);
    for (const plan of plans) {
      const node =
        plan.attach === "parent"
          ? nodeNameOf(def.parent)
          : plan.attach === "child"
            ? nodeNameOf(def.child)
            : rodNodeName(def.key);
      const mech = MECH_NAMES[plan.name] ?? { cn: plan.name, en: plan.name };
      const jointCn = boneName(def.child).cn;
      builder.add({
        id: `t800.hydraulics.${def.key}_${plan.name}`,
        cn: `${jointCn}液压${mech.cn}`,
        en: `${boneName(def.child).en} ${mech.en}`,
        asm: "hydraulics",
        geom: {
          type: "kit",
          kit: "t800Hydraulic",
          params: { cylIndex, kind: plan.kind },
        },
        mat: plan.material,
        layer: 2,
        node,
        at: plan.center,
        hint: `跨 ${def.parent} → ${def.child}；露出杆长 = |AB| - 缸长（几何解）`,
      });
    }
  }

  bundle = {
    registry: {      model: "t800",
      title: "T-800 内骨骼 · 整机",
      subtitle: "76 个解剖部位 + 17 根关节液压缸（195 个标准化零件）",
      source_notes:
        "几何来自 t800-mesh.obj（120854 顶点 / 130884 面）按 t800-verts-joints.csv 的 76 个蒙皮部位切分；" +
        "坐标已换算为站立姿态（+X 前 / +Y 上 / +Z 右），身高 1.90m，脚底 y=0。" +
        "液压缸为独立零件（缸体/活塞/活塞杆/耳环×2/导向套/密封），缸拉骨头动，活塞杆露出长度由 |AB| 实时求解。",
      constants: {
        MODEL_HEIGHT: 1.9,
        JOINT_COUNT: JOINTS.length,
        VERTEX_COUNT: 120854,
        FACE_COUNT: 130884,
        CYLINDER_COUNT: HYDRAULICS.length,
      },
      assemblies,
      nodes: buildNodes(),
      materials,
      parts: builder.parts,
      expectedContacts: [
        {
          family: "t800-hydraulic-fit",
          a: "t800.hydraulics.*",
          b: "t800.*",
          reason: "液压缸耳环/导向套/缸体嵌进骨头的装配贴合（构造性接触）",
          maxDepthMm: 40,
          allowDisplaced: true,
          allowSuspect: true,
        },
        {
          family: "t800-mesh-seam",
          a: "t800.*",
          b: "t800.*",
          reason:
            "同一真实网格按蒙皮切分的相邻部位：源网格里各骨本来就在同一原物体上互相穿插" +
            "（躯干壳体与锁骨重叠 60mm 量级），切开后接缝处的重叠是构造性的，不是错位穿透",
          maxDepthMm: 70,
          allowDisplaced: true,
          allowSuspect: true,
        },
        {
          // 源网格里这两对骨本来就互相埋进去（同一个原物体被拆成两骨）：
          //   · 胸廓壳体 ↔ 左上臂段（上臂根就长在胸廓里）
          //   · 骨盆 ↔ 左髋（髋球座就在骨盆内部）
          // 深度超出上面"接缝族"的常规量级，单独立条写明，避免整族放水。
          family: "t800-source-overlap",
          a: "t800.spine.vertebra_t3",
          b: "t800.arm.humerus_distal_l",
          reason: "源网格自身的骨间穿插：上臂根长在胸廓壳体内部（非装配错位）",
          maxDepthMm: 95,
          allowDisplaced: true,
          allowSuspect: true,
        },
        {
          family: "t800-source-overlap",
          a: "t800.pelvis.pelvis",
          b: "t800.leg.hip_joint_l",
          reason: "源网格自身的骨间穿插：髋球座嵌在骨盆内部（非装配错位）",
          maxDepthMm: 95,
          allowDisplaced: true,
          allowSuspect: true,
        },
      ],
    },
    layouts,
  };
  if (MISSING_PARENTS.length) {
    console.warn("t800：分类表里有找不到的父部位", MISSING_PARENTS);
  }
  return bundle;
}

/** 几何 kit：真实网格部件 + 液压缸零件。 */
export const t800MeshBuilders: Record<string, GeometryBuilder> = {
  t800Mesh: (spec) => {
    const params = (spec as { params?: Record<string, KitParam> }).params ?? {};
    return meshPartGeometryByIndex(Number(params.partIndex ?? 0));
  },
  t800Hydraulic: (spec) => {
    const params = (spec as { params?: Record<string, KitParam> }).params ?? {};
    const def = HYDRAULICS[Number(params.cylIndex ?? 0)];
    return hydraulicGeometry(def, Number(params.kind ?? 0) as HydKind);
  },
};

/** 兼容旧调用点：全部 builder。 */
export const t800AllBuilders = t800MeshBuilders;

/** 兼容旧调用点：本模型没有实例布局。 */
export const makeT800Layouts = () => ({} as Record<string, InstanceLayout>);

/** 兼容旧调用点：注册表。 */
export const makeT800Registry = () => makeT800().registry;
