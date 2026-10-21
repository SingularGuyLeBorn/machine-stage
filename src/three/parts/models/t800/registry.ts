import * as THREE from "three";
import type { InstanceLayout } from "../../assembler/assembler";
import type { GeometryBuilder } from "../../assembler/geometry";
import type { KitParam } from "../../registry/types";
import type { ModelRegistry, NodeDef } from "../../registry/types";
import { PartBuilder } from "./build";

/** 腱索节点名。 */
export const tendonNodeName = (key: string) => `T800_tendon_${key}`;

import { JOINTS, JOINT_BY_NAME, MISSING_PARENTS, NODE_PIVOTS, nodeNameOf } from "./spec";
import { MECH_NAMES, boneName, mechName, type BoneName } from "./names";
import { meshPartGeometryByIndex } from "./mesh/geometry";
import { splitBoneIntoPlates } from "./mesh/plates";
import { profileBone } from "./mesh/crossSection";
import { buildMechParts, type MechKind, type Recipe } from "./mech";
import { FINGER_BONES, FINGERS, pulleyGeometry, tendonGeometry } from "./tendon";
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
  // 腱索节点：每根手指一根（从掌面锚点拉到中节滑轮）
  for (const side of ["R", "L"] as const) {
    const hand = JOINT_BY_NAME.get(side === "R" ? "bip_hand_R_016" : "bip_hand_L_055");
    if (!hand) continue;
    for (const finger of FINGERS) {
      const bones = FINGER_BONES[`${finger}_${side}`];
      const prox = bones && JOINT_BY_NAME.get(bones.proximal);
      if (!prox) continue;
      const anchor: [number, number, number] = [
        hand.center[0] + (prox.center[0] - hand.center[0]) * 0.18,
        hand.center[1] + 0.012,
        hand.center[2] + (prox.center[2] - hand.center[2]) * 0.18,
      ];
      nodes.push({
        name: tendonNodeName(`${finger}_${side}_s1`),
        parent: "root",
        pivot: anchor,
        note: `${finger} 屈肌腱 近节段（随抓握伸缩）`,
      });
      nodes.push({
        name: tendonNodeName(`${finger}_${side}_s2`),
        parent: "root",
        pivot: prox.center,
        note: `${finger} 屈肌腱 中节段（随抓握伸缩）`,
      });
    }
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
let mechBundle: T800Bundle | null = null;

/** 部位该配哪套机械配方。 */
function recipeOf(name: BoneName): Recipe {
  if (name.slug.startsWith("eyeball") || name.slug.startsWith("eye_lens")) return "eye";
  if (name.slug.endsWith("_pin")) return "pin";
  if (name.system === "hand" && /thumb|index|middle|ring|pinky/.test(name.slug)) return "finger";
  if (name.slug.startsWith("hand_")) return "hand";
  if (name.system === "head") return "head";
  if (name.system === "spine" || name.system === "pelvis" || name.system === "neck") return "torso";
  return "limb";
}

/** 机械件的材质。 */
function mechMaterial(kind: MechKind): string {
  switch (kind) {
    case "bearing_seal":
    case "hose":
    case "clip":
      return "rubber";
    case "bearing_inner":
    case "bushing":
    case "fitting":
      return "gunmetal";
    case "bolts":
    case "bearing_outer":
    case "shaft":
      return "dark_chrome";
    case "frame":
    case "rail":
    case "brace":
      return "chrome";
    default:
      return "mirror";
  }
}

/** 节点名 -> 部位下标（紧固件实例布局要用）。 */
const boneIndexOfNode = new Map(JOINTS.map((j, i) => [nodeNameOf(j.name), i]));

/** 部位下标 -> 真实截面剖面（缓存）。 */
const profileCache = new Map<number, ReturnType<typeof profileBone>>();
function profileFor(partIndex: number): ReturnType<typeof profileBone> {
  const hit = profileCache.get(partIndex);
  if (hit) return hit;
  const profile = profileBone(meshPartGeometryByIndex(partIndex));
  profileCache.set(partIndex, profile);
  return profile;
}

/** 护板缓存（一个部位只切一次）。 */
const plateCache = new Map<number, ReturnType<typeof splitBoneIntoPlates>>();
function platesFor(partIndex: number): ReturnType<typeof splitBoneIntoPlates> {
  const hit = plateCache.get(partIndex);
  if (hit) return hit;
  const plates = splitBoneIntoPlates(meshPartGeometryByIndex(partIndex));
  plateCache.set(partIndex, plates);
  return plates;
}

/** 机械件缓存。 */
const mechCache = new Map<number, ReturnType<typeof buildMechParts>>();
function mechFor(
  partIndex: number,
  center: [number, number, number],
  recipe: Recipe,
): ReturnType<typeof buildMechParts> {
  const hit = mechCache.get(partIndex);
  if (hit) return hit;
  // 网格本身以包围盒中心为原点 → 原点就是部位中心
  const parts = buildMechParts(meshPartGeometryByIndex(partIndex), recipe, center);
  mechCache.set(partIndex, parts);
  return parts;
}

/**
 * 构建 T-800 注册表。
 *
 * @param options.decompose
 *   false = **GLB 原型**：每个蒙皮部位就是一块光滑网格（外形最还原）。
 *   true  = **机械拆解版**：每块光滑网格换成「护板（外形仍吻合）+ 内部机械器件」。
 */
export function makeT800(options: { decompose?: boolean } = {}): T800Bundle {
  const decompose = options.decompose === true;
  if (decompose && mechBundle) return mechBundle;
  if (!decompose && bundle) return bundle;
  const pivots: Record<string, [number, number, number]> = { ...NODE_PIVOTS };
  for (const def of HYDRAULICS) pivots[rodNodeName(def.key)] = def.b;
  for (const side of ["R", "L"] as const) {
    const hand = JOINT_BY_NAME.get(side === "R" ? "bip_hand_R_016" : "bip_hand_L_055");
    if (!hand) continue;
    for (const finger of FINGERS) {
      const bones = FINGER_BONES[`${finger}_${side}`];
      const prox = bones && JOINT_BY_NAME.get(bones.proximal);
      if (!prox) continue;
      pivots[tendonNodeName(`${finger}_${side}_s1`)] = [
        hand.center[0] + (prox.center[0] - hand.center[0]) * 0.18,
        hand.center[1] + 0.012,
        hand.center[2] + (prox.center[2] - hand.center[2]) * 0.18,
      ];
      pivots[tendonNodeName(`${finger}_${side}_s2`)] = prox.center;
    }
  }
  const builder = new PartBuilder(pivots);
  const layouts: Record<string, InstanceLayout> = {};
  // 零件 id 前缀必须与模型 id 一致（框架校验）
  const prefix = decompose ? "t800_mech" : "t800";

  // 紧固件实例族的布局：沿骨段端点的一圈均布
  layouts.t800_fastener = (args) => {
    const matrix = new THREE.Matrix4();
    const boneIndex = boneIndexOfNode.get(args.node ?? "");
    if (boneIndex === undefined) return matrix;
    const joint = JOINTS[boneIndex];
    if (!joint) return matrix;
    const profile = profileFor(boneIndex);
    const si = args.partId.includes("_nut") ? 0.12 : 0.06;
    const cores = profile.cores;
    const radii = profile.radii;
    const idx = Math.max(0, Math.min(cores.length - 1, Math.round(si * (cores.length - 1))));
    const core = cores[idx].clone().add(new THREE.Vector3(...joint.center));
    const r = radii[idx];
    const e = new THREE.Vector3();
    e.setComponent(profile.axis, 1);
    const u = new THREE.Vector3();
    u.setComponent((profile.axis + 1) % 3, 1);
    const v = new THREE.Vector3().crossVectors(e, u).normalize();
    u.crossVectors(v, e).normalize();
    const ring = Math.min(r * 0.55, 0.028);
    const a = (args.index / Math.max(1, args.count)) * Math.PI * 2;
    const p = core.clone().addScaledVector(u, Math.cos(a) * ring).addScaledVector(v, Math.sin(a) * ring);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), e);
    // 布局矩阵作用在零件装配位（节点局部）之上
    const pivot = new THREE.Vector3(...joint.pivot);
    const at = new THREE.Vector3(
      ...((args.part.mate as { position?: number[] } | undefined)?.position ?? [0, 0, 0]),
    );
    const local = p.clone().sub(pivot).sub(at);
    matrix.compose(local, q, new THREE.Vector3(1, 1, 1));
    return matrix;
  };

  // ---- 真实网格切出的骨骼零件（标准机械/解剖命名）----
  for (let index = 0; index < JOINTS.length; index++) {
    const joint = JOINTS[index];
    const name = boneName(joint.name);
    // 机械拆解版：光滑整块被「护板 + 内部机械器件」取代，不再单独成件
    if (!decompose)
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

    // ---- 机械拆解版：把光滑块换成「护板 + 内部机械器件」----
    if (decompose) {
      const node = nodeNameOf(joint.name);
      const plates = platesFor(index);
      for (let p = 0; p < plates.length; p++) {
        const plate = plates[p];
        builder.add({
          id: `t800_mech.${name.system}.${name.slug}_guard${String(p + 1).padStart(2, "0")}`,
          cn: `${name.cn}护板 ${String(p + 1).padStart(2, "0")}`,
          en: `${name.en} Guard Plate ${String(p + 1).padStart(2, "0")}`,
          asm: joint.asm,
          geom: { type: "kit", kit: "t800Plate", params: { partIndex: index, plate: p } },
          mat: joint.mat,
          layer: joint.asm === "hand" ? 2 : 1,
          node,
          at: [
            joint.center[0] + plate.center.x,
            joint.center[1] + plate.center.y,
            joint.center[2] + plate.center.z,
          ],
          hint: `${name.en} 的外覆护板（拼起来与源网格外形一致）`,
        });
      }
      const recipe = recipeOf(name);
      for (const part of mechFor(index, joint.center, recipe)) {
        const mech = mechName(part.kind, part.index);
        builder.add({
          id: `t800_mech.${name.system}.${name.slug}_${part.kind}${String(part.index + 1).padStart(2, "0")}`,
          cn: `${name.cn}${mech.cn}`,
          en: `${name.en} ${mech.en}`,
          asm: joint.asm,
          geom: {
            type: "kit",
            kit: "t800Mech",
            params: { partIndex: index, kind: part.kind, index: part.index },
          },
          mat: mechMaterial(part.kind),
          layer: joint.asm === "hand" ? 2 : 1,
          node,
          at: part.center,
          hint: `${name.en} 内部机械器件`,
        });
      }
    }
  }

  // ---- 手指屈肌腱 + 滑轮 ----
  // 腱索从掌面锚点拉到中节滑轮，长度随抓握变化（运行时按实际距离缩放）
  for (const side of ["R", "L"] as const) {
    const hand = JOINT_BY_NAME.get(side === "R" ? "bip_hand_R_016" : "bip_hand_L_055");
    if (!hand) continue;
    for (const finger of FINGERS) {
      const bones = FINGER_BONES[`${finger}_${side}`];
      if (!bones) continue;
      const prox = JOINT_BY_NAME.get(bones.proximal);
      const mid = JOINT_BY_NAME.get(bones.middle);
      if (!prox || !mid) continue;
      // 掌面锚点：掌心稍上方一点
      const anchor: [number, number, number] = [
        hand.center[0] + (prox.center[0] - hand.center[0]) * 0.18,
        hand.center[1] + 0.012,
        hand.center[2] + (prox.center[2] - hand.center[2]) * 0.18,
      ];
      // 腱索：**两段**（掌面锚点 → 近节滑轮 → 中节滑轮），机械上绕过关节才真实
      const fingerCn: Record<string, string> = {
        thumb: "拇指",
        index: "食指",
        middle: "中指",
        ring: "无名指",
        pinky: "小指",
      };
      const segNames = ["近节段", "中节段"];
      for (let seg = 0; seg < 2; seg++) {
        const from = seg === 0 ? anchor : prox.center;
        builder.add({
          id: `${prefix}.tendon.${finger}_${side.toLowerCase()}_s${seg + 1}`,
          cn: `${side === "R" ? "右" : "左"}${fingerCn[finger]}屈肌腱${segNames[seg]}`,
          en: `${side === "R" ? "Right" : "Left"} ${finger} Flexor Tendon ${seg + 1}`,
          asm: "hand",
          geom: { type: "kit", kit: "t800Tendon", params: { finger, side } },
          mat: "dark_chrome",
          layer: 2,
          node: tendonNodeName(`${finger}_${side}_s${seg + 1}`),
          at: from,
          hint: "屈肌腱：绕过指节滑轮，握拳时被拉长",
        });
      }
      for (const [i, j] of [prox, mid].entries()) {
        builder.add({
          id: `${prefix}.tendon.pulley_${finger}_${side.toLowerCase()}_${i + 1}`,
          cn: `${side === "R" ? "右" : "左"}${fingerCn[finger]}滑轮 ${i + 1}`,
          en: `${side === "R" ? "Right" : "Left"} ${finger} Pulley ${i + 1}`,
          asm: "hand",
          geom: { type: "kit", kit: "t800Pulley", params: { finger, side, index: i } },
          mat: "mirror",
          layer: 2,
          node: nodeNameOf(i === 0 ? bones.proximal : bones.middle),
          at: j.center,
          hint: "屈肌腱导向滑轮",
        });
      }
    }
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
        id: `${prefix}.hydraulics.${def.key}_${plan.name}`,
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

  const result: T800Bundle = {
    registry: {
      model: decompose ? "t800_mech" : "t800",
      title: decompose ? "T-800 内骨骼 · 机械拆解版" : "T-800 内骨骼 · 整机",
      subtitle: decompose
        ? `每个光滑块换成机械器件组合（${builder.parts.length} 个零件）`
        : `76 个解剖部位 + 17 根关节液压缸（${builder.parts.length} 个标准化零件）`,
      source_notes:
        "几何来自 t800-mesh.obj（120854 顶点 / 130884 面）按 t800-verts-joints.csv 的 76 个蒙皮部位切分；" +
        "坐标已换算为站立姿态（+X 前 / +Y 上 / +Z 右），身高 1.90m，脚底 y=0。" +
        "液压缸为独立零件（缸体/活塞/活塞杆/耳环A/耳环B/导向套/密封），缸拉骨头动，活塞杆露出长度由 |AB| 实时求解。" +
        (decompose
          ? "机械拆解版：每块光滑网格换成「护板（外形与源网格一致）+ 内部机械器件（骨架/纵梁/横撑/轴承/螺栓圈/软管/接头/油嘴）」。"
          : "GLB 原型：每个蒙皮部位是一块光滑网格，外形最还原。"),
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
          a: "t800*hydraulics.*",
          b: "t800*",
          reason: "液压缸耳环/导向套/缸体嵌进骨头的装配贴合（构造性接触）",
          maxDepthMm: 40,
          allowDisplaced: true,
          allowSuspect: true,
        },
        {
          family: "t800-mesh-seam",
          a: "t800*",
          b: "t800*",
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
        {
          family: "t800-mech-shell",
          a: "t800_mech.*",
          b: "t800_mech.*",
          reason:
            "护板之间与机械件之间的贴合/穿插：源网格的壳体本身自相交，" +
            "拆成护板后互相嵌合属于构造性接触（不是错位穿透）",
          maxDepthMm: 130,
          allowDisplaced: true,
          allowSuspect: true,
        },
        {
          family: "t800-source-overlap",
          a: "t800_mech.spine.vertebra_t3",
          b: "t800_mech.arm.humerus_distal_l",
          reason: "源网格自身的骨间穿插：上臂根长在胸廓壳体内部（非装配错位）",
          maxDepthMm: 95,
          allowDisplaced: true,
          allowSuspect: true,
        },
        {
          family: "t800-source-overlap",
          a: "t800_mech.pelvis.pelvis",
          b: "t800_mech.leg.hip_joint_l",
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
  if (decompose) mechBundle = result;
  else bundle = result;
  return result;
}

/** 几何 kit：真实网格部件 + 液压缸零件。 */
export const t800MeshBuilders: Record<string, GeometryBuilder> = {
  t800Mesh: (spec) => {
    const params = (spec as { params?: Record<string, KitParam> }).params ?? {};
    return meshPartGeometryByIndex(Number(params.partIndex ?? 0));
  },
  t800Plate: (spec) => {
    const params = (spec as { params?: Record<string, KitParam> }).params ?? {};
    const partIndex = Number(params.partIndex ?? 0);
    const plate = Number(params.plate ?? 0);
    const plates = platesFor(partIndex);
    const hit = plates[plate];
    if (!hit) throw new Error(`t800.plate：第 ${partIndex} 件没有护板 #${plate}`);
    return hit.geometry;
  },
  t800Mech: (spec) => {
    const params = (spec as { params?: Record<string, KitParam> }).params ?? {};
    const partIndex = Number(params.partIndex ?? 0);
    const kind = String(params.kind ?? "") as MechKind;
    const index = Number(params.index ?? 0);
    const joint = JOINTS[partIndex];
    if (!joint) throw new Error(`t800.mech：没有第 ${partIndex} 个部位`);
    const parts = mechFor(partIndex, joint.center, recipeOf(boneName(joint.name)));
    const hit = parts.find((p) => p.kind === kind && p.index === index);
    if (!hit) throw new Error(`t800.mech：${joint.name} 没有 ${kind}#${index}`);
    return hit.geometry;
  },
  t800Tendon: () => tendonGeometry(0.0022),
  t800Pulley: () => pulleyGeometry(0.0055),
  t800Hydraulic: (spec) => {
    const params = (spec as { params?: Record<string, KitParam> }).params ?? {};
    const def = HYDRAULICS[Number(params.cylIndex ?? 0)];
    return hydraulicGeometry(def, Number(params.kind ?? 0) as HydKind);
  },
};

/** 兼容旧调用点：全部 builder。 */
export const t800AllBuilders = t800MeshBuilders;

/** 实例布局（紧固件实例族）：按模型取。 */
export const makeT800Layouts = (options: { decompose?: boolean } = {}) =>
  makeT800(options).layouts as Record<string, InstanceLayout>;

/** 兼容旧调用点：注册表。 */
export const makeT800Registry = () => makeT800().registry;
