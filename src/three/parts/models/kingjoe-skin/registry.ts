import type { ModelRegistry, PartDefinition } from "../../registry/types";
import raw from "./segments.generated.json";
import { KINGJOE_SKIN_MATERIALS } from "./materials";
import { kingjoeSkinBuilders } from "./kits";
import { makeKingJoeSkinDetails } from "./details";

// ============================================================================
// models/kingjoe-skin/registry —— 真实网格按蒙皮权重切成零件
//
// 数据来自 scripts/generate-kingjoe-skin.py：
//   7224 顶点 / 7258 三角 / 459 个连通壳 → 578 个真实分件。
//   每个分件由面级主导骨骼命名，几何在所属模块局部坐标。
// 四段飞船用 KJModelRoot 下的四个 translate 模块分组；阻尼/对接后续接入。
// 奥特曼 IP：个人参考，不做商用。
// ============================================================================

interface GeneratedMeta {
  vertices: number;
  triangles: number;
  components: number;
  bbox: number[];
}

interface GeneratedPart {
  key: string;
  assembly: string;
  node: string;
  semantic: string;
  bone: string;
  name_cn: string;
  name_en: string;
  material: string;
  faces: number;
  verts: number;
  bbox: number[];
}

const GENERATED = raw as unknown as { meta: GeneratedMeta; parts: GeneratedPart[] };

const ASSEMBLY_NAMES: Record<string, [string, string]> = {
  legs: ["King Legs 腿部飞船", "King Legs"],
  stomach: ["King Stomach 腹部飞船", "King Stomach"],
  chest: ["King Chest 胸部飞船 + 双臂", "King Chest"],
  ship: ["King Ship 头部飞船", "King Ship"],
};

export const KINGJOE_SKIN_CONSTANTS: Record<string, number> = {
  MODEL_HEIGHT: 6.618,
  MODEL_WIDTH: 3.683,
  MODEL_DEPTH: 2.086,
  STOMACH_SEAM: 3.45,
  CHEST_SEAM: 4.55,
  SHIP_SEAM: 5.65,
  SOURCE_VERTS: GENERATED.meta.vertices,
  SOURCE_TRIS: GENERATED.meta.triangles,
  SOURCE_COMPONENTS: GENERATED.meta.components,
};

export function makeKingJoeSkinRegistry(): ModelRegistry {
  const generatedParts: PartDefinition[] = GENERATED.parts.map((part, index) => ({
    id: `kingjoeskin.${part.assembly}.src_${part.key}`,
    name_cn: part.name_cn,
    name_en: part.name_en,
    assembly: part.assembly,
    build_layer: 3,
    build_order: 100 + index,
    geometry: { type: "kit", kit: "kjrSegment", params: { key: part.key } },
    material: part.material,
    node: part.node,
    mate: { type: "absolute", position: [0, 0, 0] },
    source: `真实网格蒙皮分件：主导骨 ${part.bone}，${part.faces} 面 / ${part.verts} 顶点`,
  }));

  const detailParts = makeKingJoeSkinDetails().map((part, index) => ({
    ...part,
    build_order: 100 + generatedParts.length + index,
  }));

  return {
    model: "kingjoeskin",
    title: "金古桥 King Joe · 真实网格分件",
    subtitle: "蒙皮权重切件 578 件 · 四段飞船模块 · 哑光银灰 + 彩虹胸",
    source_notes: [
      "真实网格：King_Joe.glb / kingjoe-mesh.obj，7224 顶点、7258 三角、459 连通壳。",
      "分件：按面级蒙皮主导骨骼 + 空间区域切成 578 件（大腿/小腿/足/骨盆/胸/头/锁骨/臂/手/手指/护甲）。",
      "OBJ 与 GLB 顶点顺序核对：最大误差 0.00005。",
      "四段飞船：King Legs / King Stomach / King Chest / King Ship，以模块节点分组；机构与阻尼后续接入。",
      "胸口彩虹格栅与头部眼带为叠加细节，不改真实网格。",
      "版权：奥特曼 IP；本工程仅个人参考，不做商用。",
    ].join("\n"),
    constants: KINGJOE_SKIN_CONSTANTS,
    assemblies: (["legs", "stomach", "chest", "ship"] as const).map((id) => ({
      id,
      name_cn: ASSEMBLY_NAMES[id][0],
      name_en: ASSEMBLY_NAMES[id][1],
      explode: id === "legs" ? [0, -1.4, 0] : id === "stomach" ? [0, -0.5, 0] : id === "chest" ? [0, 0.9, 0] : [0, 2.2, 0],
    })),
    nodes: [
      { name: "KJModelRoot", parent: "root", rest_rotation: [0, 180, 0], note: "源网格正面 -Z，转到 +Z" },
      { name: "KJLegsModule", parent: "KJModelRoot", pivot: [0, 0, 0], motion: "translate" },
      { name: "KJStomachModule", parent: "KJModelRoot", pivot: [0, 3.45, 0], motion: "translate" },
      { name: "KJChestModule", parent: "KJModelRoot", pivot: [0, 4.55, 0], motion: "translate" },
      { name: "KJShipModule", parent: "KJModelRoot", pivot: [0, 5.65, 0], motion: "translate" },
    ],
    expectedContacts: [
      // 源网格是多片装甲/关节壳互相嵌合的游戏低模；源内接触是构造性的，不是切件错误。
      // 添加的彩虹胸/眼带不带 src_ 前缀，因此不会被这组规则豁免。
      { family: "kingjoeskin-source-overlap", a: "kingjoeskin.legs.src_*", b: "kingjoeskin.legs.src_*", reason: "真实网格源壳互嵌", maxDepthMm: 2000 },
      { family: "kingjoeskin-source-overlap", a: "kingjoeskin.legs.src_*", b: "kingjoeskin.stomach.src_*", reason: "真实网格源壳互嵌", maxDepthMm: 2000 },
      { family: "kingjoeskin-source-overlap", a: "kingjoeskin.legs.src_*", b: "kingjoeskin.chest.src_*", reason: "真实网格源壳互嵌", maxDepthMm: 2000 },
      { family: "kingjoeskin-source-overlap", a: "kingjoeskin.legs.src_*", b: "kingjoeskin.ship.src_*", reason: "真实网格源壳互嵌", maxDepthMm: 2000 },
      { family: "kingjoeskin-source-overlap", a: "kingjoeskin.stomach.src_*", b: "kingjoeskin.stomach.src_*", reason: "真实网格源壳互嵌", maxDepthMm: 2000 },
      { family: "kingjoeskin-source-overlap", a: "kingjoeskin.stomach.src_*", b: "kingjoeskin.chest.src_*", reason: "真实网格源壳互嵌", maxDepthMm: 2000 },
      { family: "kingjoeskin-source-overlap", a: "kingjoeskin.stomach.src_*", b: "kingjoeskin.ship.src_*", reason: "真实网格源壳互嵌", maxDepthMm: 2000 },
      { family: "kingjoeskin-source-overlap", a: "kingjoeskin.chest.src_*", b: "kingjoeskin.chest.src_*", reason: "真实网格源壳互嵌", maxDepthMm: 2000 },
      { family: "kingjoeskin-source-overlap", a: "kingjoeskin.chest.src_*", b: "kingjoeskin.ship.src_*", reason: "真实网格源壳互嵌", maxDepthMm: 2000 },
      { family: "kingjoeskin-source-overlap", a: "kingjoeskin.ship.src_*", b: "kingjoeskin.ship.src_*", reason: "真实网格源壳互嵌", maxDepthMm: 2000 },
    ],
    materials: KINGJOE_SKIN_MATERIALS,
    parts: [...generatedParts, ...detailParts],
  };
}

export { kingjoeSkinBuilders };
