import * as THREE from "three";
import type { GeometryBuilder } from "../../assembler/geometry";
import type { AssembledModel } from "../../assembler/assembler";
import type { ModelRegistry } from "../../registry/types";
import data from "./split.generated.json";

// 截面验证使用闭合内核，不混入原外皮、补缝片或旧合体机构。
function decode(value: string): ArrayBuffer {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0)).buffer;
}

export const kingjoePlaneBuilders: Record<string, GeometryBuilder> = Object.fromEntries(
  data.parts.map((part) => [
    `kjPlane_${part.key}`,
    () => {
      const indexed = new THREE.BufferGeometry();
      indexed.setAttribute("position", new THREE.BufferAttribute(new Float32Array(decode(part.position)), 3));
      indexed.setIndex(new THREE.BufferAttribute(new Uint32Array(decode(part.index)), 1));
      indexed.computeVertexNormals();
      const geometry = indexed.toNonIndexed();
      indexed.dispose();
      const normals = geometry.getAttribute("normal");
      // 封口独立法线：切面保持平整，不能与外壳平均成圆滑边。
      for (let i = part.surface_indices; i < normals.count; i++) {
        normals.setXYZ(i, 0, part.key === "lower" ? 1 : -1, 0);
      }
      geometry.addGroup(0, part.surface_indices, 0);
      geometry.addGroup(part.surface_indices, part.cap_indices, 1);
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      return geometry;
    },
  ]),
);

export function makeKingJoePlaneRegistry(): ModelRegistry {
  return {
    model: "kingjoeplane",
    title: "金古桥 · 平面分体验证",
    subtitle: "闭合内核横切 · 铜色平整截面",
    constants: {
      // 切面来自离线几何，按已有派生常量模式只读显示。
      CUT_HEIGHT: String(data.height),
      // [OM-FREEPLAY] 静态展开 1.8m 便于观察上下封口，不引入新的合体动画。
      INSPECTION_GAP: 1.8,
    },
    assemblies: [
      { id: "lower", name_cn: "下半部", name_en: "lower", explode: [0, 0, 0] },
      { id: "upper", name_cn: "上半部", name_en: "upper", explode: [0, 1, 0] },
    ],
    nodes: [{ name: "PlaneUpper", parent: "root", pivot: [0, 0, 0], motion: "translate" }],
    // [OM-FREEPLAY] 素色显示几何，铜色区分新封口与原表面。
    materials: {
      body: { base: "#8e949a", metalness: 0.48, roughness: 0.58 },
      cap: { base: "#c88c53", metalness: 0.35, roughness: 0.65 },
    },
    parts: data.parts.map((part, i) => ({
      id: `kingjoeplane.${part.key}.body`,
      name_cn: part.key === "lower" ? "下半部（闭合）" : "上半部（闭合）",
      name_en: part.key,
      assembly: part.key,
      build_layer: 1,
      build_order: 100 + i,
      geometry: { type: "kit", kit: `kjPlane_${part.key}` },
      material: "body",
      materialGroups: ["body", "cap"],
      ...(part.key === "upper" ? { node: "PlaneUpper" } : {}),
      mate: { type: "absolute", position: [0, 0, 0] },
      source: `闭合内核平面切割；${part.components} 个闭合连通块；边界边 0`,
    })),
    expectedContacts: [],
  };
}

export function poseKingJoePlane(model: AssembledModel, _seconds: number, state?: string): void {
  const upper = model.getNode("PlaneUpper");
  if (upper) upper.position.y = state === "closed" ? 0 : model.constants.INSPECTION_GAP!;
}

export const planeStats = data;
