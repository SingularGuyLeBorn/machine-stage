import type { ModelRegistry } from "../../registry/types";
import whole from "./whole.generated.json";
import { KINGJOE_SKIN_MATERIALS } from "../kingjoe-skin/materials";

// ============================================================================
// models/kingjoe-whole —— 整机单件（阶段1 外观基座）
//
// 把真实网格分件的 578 源件 + 21 个叠加细节原样合并成 1 个 partId：
// 不焊接顶点、不做布尔/体素重拓扑，保留原三角形/UV/12 组材质，
// 因此外观与「真实网格分件」合体态一致；只是不再按装甲片逐个 partId 高亮。
// 这是单件外观体，不是水密实体；水密/剖切需要另行重拓扑。
// ============================================================================

interface WholeData {
  meta: {
    source_handles: number;
    source_triangles: number;
    verts: number;
    tris: number;
    materials: string[];
    bbox: number[];
  };
}

const DATA = whole as unknown as WholeData;

export function makeKingJoeWholeRegistry(): ModelRegistry {
  return {
    model: "kingjoewhole",
    title: "金古桥 King Joe · 整体实心（单件）",
    subtitle: "578 源件 + 细节合并为 1 个 partId · 外观同真实网格分件",
    source_notes: [
      "整机单件：把真实网格分件的 578 源件 + 21 个叠加细节（15,248 个三角形）原样合并为 1 个 partId。",
      "保留原三角形/UV/12 组材质（亮银/银灰/暗钢/黑/彩虹/发光眼），不做焊接、布尔或体素重拓扑。",
      "表面即真实网格的合体态；单件后不再按肩筒/胸甲装甲片逐个高亮，避免分件边缘看起来像刺。",
      "内部仍是源壳层叠，不是水密实体；若要做水密/剖切，需要另行重拓扑并接受细节损失。",
      "分离/合体/怪光线在主卡「金古桥 King Joe」；578 分件查看在「真实网格分件」卡。",
      "版权：奥特曼 IP，个人参考，不做商用。",
    ].join("\n"),
    constants: {
      MODEL_HEIGHT: 6.618,
      MODEL_WIDTH: 3.683,
      MODEL_DEPTH: 2.086,
      SOURCE_PARTS: 578,
      SOURCE_HANDLES: DATA.meta.source_handles,
      SOURCE_TRIANGLES: DATA.meta.source_triangles,
      TRIANGLES: DATA.meta.tris,
      MATERIAL_GROUPS: DATA.meta.materials.length,
    },
    assemblies: [{ id: "whole", name_cn: "整机（单件）", name_en: "whole body", explode: [0, 0, 0] }],
    nodes: [],
    materials: KINGJOE_SKIN_MATERIALS,
    parts: [
      {
        id: "kingjoewhole.whole.body",
        name_cn: "金古桥整体（单件实心）",
        name_en: "King Joe whole body (single part)",
        assembly: "whole",
        build_layer: 1,
        build_order: 100,
        geometry: { type: "kit", kit: "kjWhole" },
        material: DATA.meta.materials[0]!,
        materialGroups: DATA.meta.materials,
        mate: { type: "absolute", position: [0, 0, 0] },
        tags: ["solid", "single-part"],
        source: `真实网格分件原三角形合并：${DATA.meta.tris} 三角 / ${DATA.meta.materials.length} 材质组，未重拓扑`,
      },
    ],
    expectedContacts: [],
  };
}
