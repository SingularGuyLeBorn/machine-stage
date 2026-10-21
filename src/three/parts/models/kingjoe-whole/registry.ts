import type { ModelRegistry } from "../../registry/types";
import type { MaterialSpec } from "../../kernel/textures";
import whole from "./whole.generated.json";
import core from "./core.generated.json";
import patch from "./patch.generated.json";
import { KINGJOE_SKIN_MATERIALS } from "../kingjoe-skin/materials";

// ============================================================================
// models/kingjoe-whole —— 整机单件（原皮表面 + 内部实心）
//
// 表面：578 源件 + 21 个细节原三角形（15,248 三角 / 12 材质组），外观不变。
// 内部：Blender 体素重网格得到的闭合实体核（41,836 三角 / 9.8 m³，边界边 0，
//       内缩 1% 藏在原皮里），与表面合并到同一个 partId，真正填满内部体积。
// 不是薄壳；没有拆分/切分/榫卯/新增外部零件。
// ============================================================================

interface ShellData {
  meta: {
    source_handles: number;
    source_triangles: number;
    verts: number;
    tris: number;
    materials: string[];
    bbox: number[];
  };
}

interface PatchData {
  meta: {
    tris: number;
    boundary_tris: number;
    gap_tris: number;
    boundary_before: number;
    boundary_after: number;
  };
}

interface CoreData {
  meta: {
    voxel: number;
    shrink: number;
    tris: number;
    verts: number;
    bbox: number[];
    closed: boolean;
    boundary_edges: number;
    nonmanifold_edges: number;
    volume: number;
  };
}

const SHELL = whole as unknown as ShellData;
const CORE = core as unknown as CoreData;
const PATCH = patch as unknown as PatchData;

const WHOLE_MATERIALS: Record<string, MaterialSpec> = {
  ...KINGJOE_SKIN_MATERIALS,
  kjr_core: {
    base: "#8e949a",
    metalness: 0.48,
    roughness: 0.58,
    preset: "steel_rough",
    repeat: [2, 2],
    envMapIntensity: 1.0,
  },
};

export function makeKingJoeWholeRegistry(): ModelRegistry {
  return {
    model: "kingjoewhole",
    title: "金古桥 King Joe · 整体实心（单件）",
    subtitle: "原皮表面 + 内部闭合实心核 + 缝隙补面 · 1 个 partId · 不是中空壳",
    source_notes: [
      "整机单件：表面仍是真实网格 578 源件 + 21 个叠加细节的 15,248 个原三角形，保留原 UV/12 组材质，外观不变。",
      "内部实心：用 0.06m 体素把整机重网格成闭合实体（41,836 三角，边界边 0，体积约 9.8 m³），内缩 1% 后与原皮表面合并到同一个 partId。",
      "补缝：外壳边界补面 82 三角；下半身甲片缝隙/脚部空档用 1.0 外包络补实心膜 14,107 三角（胸甲彩虹区与双手区不补，避免盖住细节）。",
      "这不是「表面一层、内部空的」薄壳：内部体积被闭合实体填满；护甲开口/脚部空档再用实心外包络补面，尽量看不到深缝。",
      "单件仍是 1 个 partId；没有拆分、三体、横切、榫卯或新增外部零件。两体/三体/实心横切卡已按要求移除。",
      "x-ray 透视可以看到原皮内部的实心核；合体外观与原皮单件一致。",
      "版权：奥特曼 IP，个人参考，不做商用。",
    ].join("\n"),
    constants: {
      MODEL_HEIGHT: 6.618,
      MODEL_WIDTH: 3.683,
      MODEL_DEPTH: 2.086,
      SOURCE_PARTS: 578,
      SOURCE_HANDLES: SHELL.meta.source_handles,
      SOURCE_TRIANGLES: SHELL.meta.source_triangles,
      SHELL_TRIANGLES: SHELL.meta.tris,
      CORE_TRIANGLES: CORE.meta.tris,
      PATCH_TRIANGLES: PATCH.meta.tris,
      TRIANGLES: SHELL.meta.tris + CORE.meta.tris + PATCH.meta.tris,
      MATERIAL_GROUPS: SHELL.meta.materials.length + 2,
      CORE_VOLUME: CORE.meta.volume,
      CORE_VOXEL: CORE.meta.voxel,
      CORE_SHRINK: CORE.meta.shrink,
      CORE_BOUNDARY_EDGES: CORE.meta.boundary_edges,
    },
    assemblies: [{ id: "whole", name_cn: "整机（单件）", name_en: "whole body", explode: [0, 0, 0] }],
    nodes: [],
    materials: WHOLE_MATERIALS,
    parts: [
      {
        id: "kingjoewhole.whole.body",
        name_cn: "金古桥整体（单件实心）",
        name_en: "King Joe whole body (single part, solid)",
        assembly: "whole",
        build_layer: 1,
        build_order: 100,
        geometry: { type: "kit", kit: "kjWhole" },
        material: SHELL.meta.materials[0]!,
        materialGroups: [...SHELL.meta.materials, "kjr_core", "kjr_silver"],
        mate: { type: "absolute", position: [0, 0, 0] },
        tags: ["solid", "single-part"],
        source: `表面 ${SHELL.meta.tris} 三角 / ${SHELL.meta.materials.length} 材质组 + 实心核 ${CORE.meta.tris} 三角（${CORE.meta.volume.toFixed(2)} m³）+ 补缝 ${PATCH.meta.tris} 三角（边界 ${PATCH.meta.boundary_tris} / 缝隙 ${PATCH.meta.gap_tris}）`,
      },
    ],
    expectedContacts: [],
  };
}
