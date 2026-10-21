import * as THREE from "three";
import type { GeometryBuilder } from "../../assembler/geometry";
import { buildGeometry } from "../../assembler/geometry";
import type { AssembledModel } from "../../assembler/assembler";
import type { ModelRegistry, PartDefinition } from "../../registry/types";
import { KINGJOE_SKIN_MATERIALS } from "../kingjoe-skin/materials";
import { makeKingJoeSkinDetails } from "../kingjoe-skin/details";
import data from "./modules.generated.json";

// 原装甲与内部连接结构布尔融合；每个主体单独连通，阶梯凹凸接口由同一模具切出。
function decode(value: string): ArrayBuffer {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0)).buffer;
}

export const kingjoeModuleBuilders: Record<string, GeometryBuilder> = Object.fromEntries(
  data.parts.map((part) => [
    `kjModule_${part.key}`,
    () => {
      const geometry = new THREE.BufferGeometry();
      for (const [name, encoded, size] of [
        ["position", part.position, 3],
        ["normal", part.normal, 3],
        ["uv", part.uv, 2],
      ] as const) {
        geometry.setAttribute(name, new THREE.BufferAttribute(new Float32Array(decode(encoded)), size));
      }
      geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(decode(part.index)), 1));
      part.groups.forEach((group, i) => geometry.addGroup(group.start, group.count, i));
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      return geometry;
    },
  ]),
);

// 原倒角细节含零面积三角形；仅在本卡清除退化面，旧模型及旧动画几何保持不变。
for (const detail of makeKingJoeSkinDetails()) {
  kingjoeModuleBuilders[`kjDetail_${detail.id}`] = (_spec, context) => {
    const geometry = buildGeometry(detail.geometry, context);
    const position = geometry.getAttribute("position");
    if (detail.geometry.type === "cylinder") {
      // 旧回转体把轴心半径钳到 0.0002m，眼部两端因此有针孔。将轴心环收至轴线，保留全部外侧倒角。
      for (let i = 0; i < position.count; i++) {
        if (Math.hypot(position.getX(i), position.getZ(i)) <= 0.000201) {
          position.setXYZ(i, 0, position.getY(i), 0);
        }
      }
    }
    const original = geometry.index;
    const indices: number[] = [];
    const a = new THREE.Vector3(),
      b = new THREE.Vector3(),
      c = new THREE.Vector3();
    for (let i = 0; i < (original?.count ?? position.count); i += 3) {
      const ids = [0, 1, 2].map((j) => (original ? original.getX(i + j) : i + j));
      a.fromBufferAttribute(position, ids[0]!);
      b.fromBufferAttribute(position, ids[1]!);
      c.fromBufferAttribute(position, ids[2]!);
      if (b.sub(a).cross(c.sub(a)).length() > 1e-12) indices.push(...ids);
    }
    geometry.setIndex(indices);
    geometry.clearGroups();
    return geometry;
  };
}

const NAMES: Record<string, string> = {
  legs: "腿部模块",
  pelvis: "腹盆模块",
  chest: "胸甲模块",
  head_arms: "头肩与完整双臂",
};

// [OM-FREEPLAY] 展开布局沿参考图排列；注册表静止姿态与查看姿态共用，初始取景才能包含全部模块。
function moduleOffsets(gap: number): Record<string, [number, number, number]> {
  return {
    head_arms: [-gap, -1.3, 0],
    chest: [0, -0.1, 1.5],
    pelvis: [0, -1.3, 1.5],
    legs: [gap, 0, 0],
  };
}

export function makeKingJoeModuleRegistry(): ModelRegistry {
  const bodies: PartDefinition[] = data.parts.map((part, i) => ({
    id: `kingjoemodules.${part.key}.body`,
    name_cn: NAMES[part.key]!,
    name_en: part.key,
    assembly: part.key,
    node: `Module_${part.key}`,
    build_layer: 1,
    build_order: i + 1,
    geometry: { type: "kit", kit: `kjModule_${part.key}` },
    material: part.groups[0]!.material,
    materialGroups: part.groups.map((g) => g.material),
    mate: { type: "absolute", position: [0, 0, 0] },
    source: "原 GLB 表面与法线、UV；内部补实并融合为单实体，共用模具切出阶梯嵌合接口",
  }));
  const details: PartDefinition[] = makeKingJoeSkinDetails().map((part, i) => ({
    ...part,
    geometry: { type: "kit", kit: `kjDetail_${part.id}` },
    id: part.id.replace("kingjoeskin.", "kingjoemodules."),
    assembly: part.assembly === "ship" ? "head_arms" : "chest",
    node: part.assembly === "ship" ? "ModuleHeadDetails" : "ModuleChestDetails",
    build_order: 5 + i,
  }));
  return {
    model: "kingjoemodules",
    title: "金古桥 · 参考图分体",
    subtitle: "完整双臂 · 连通主体 · 阶梯嵌合接口",
    constants: {
      HIP_SEAM: String(data.hip),
      WAIST_SEAM: String(data.waist),
      NECK_SEAM: String(data.neck),
      // [OM-FREEPLAY] 沿参考图横向摆放便于检查；这里只设静态姿态，不接入旧合体动画。
      DISPLAY_SPACING: 3.8,
    },
    assemblies: data.parts.map((part) => ({
      id: part.key,
      name_cn: NAMES[part.key]!,
      name_en: part.key,
      explode: [0, 0, 0],
    })),
    nodes: [
      ...data.parts.map((part) => ({
        name: `Module_${part.key}`,
        parent: "root",
        pivot: [
          part.key === "head_arms" ? "-DISPLAY_SPACING" : part.key === "legs" ? "DISPLAY_SPACING" : 0,
          moduleOffsets(0)[part.key]![1],
          moduleOffsets(0)[part.key]![2],
        ] as [string | number, number, number],
        motion: "translate" as const,
      })),
      // 原叠加细节沿用原皮模块坐标；主体生成数据已经旋转到 +Z。
      { name: "ModuleChestDetails", parent: "Module_chest", pivot: [0, 4.55, 0], rest_rotation: [0, 180, 0] },
      {
        name: "ModuleHeadDetails",
        parent: "Module_head_arms",
        pivot: [0, 5.65, 0],
        rest_rotation: [0, 180, 0],
      },
    ],
    materials: {
      ...KINGJOE_SKIN_MATERIALS,
      // [OM-FREEPLAY] 新封口以低反光深银区分，保留原表面的银灰外观。
      kjr_cap: { base: "#606a73", metalness: 0.45, roughness: 0.65 },
    },
    parts: [...bodies, ...details],
    expectedContacts: [],
  };
}

export function poseKingJoeModules(model: AssembledModel, _seconds: number, state?: string): void {
  const gap = model.constants.DISPLAY_SPACING!;
  const offsets = moduleOffsets(gap);
  for (const part of data.parts) {
    const node = model.getNode(`Module_${part.key}`);
    if (node) {
      const offset = state === "closed" ? [0, 0, 0] : offsets[part.key]!;
      node.position.set(offset[0]!, offset[1]!, offset[2]!);
    }
  }
}

export const moduleData = data;
