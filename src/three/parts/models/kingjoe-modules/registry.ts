import * as THREE from "three";
import { MeshBVH } from "three-mesh-bvh";
import type { GeometryBuilder } from "../../assembler/geometry";
import { buildGeometry } from "../../assembler/geometry";
import type { ModelRegistry, PartDefinition } from "../../registry/types";
import { moduleOffsets, animateKingJoeModules } from "./motion";
import { KINGJOE_SKIN_MATERIALS } from "../kingjoe-skin/materials";
import { makeKingJoeSkinDetails } from "../kingjoe-skin/details";
import data from "./modules.generated.json";
import { chestWindowBuilders, chestWindowParts } from "./chest-windows";
import { makeVisorBuilders, visorParts } from "./visor";
import pedan from "./pedan.generated.json";
import { interiorBuilders, INTERIOR_MATERIALS, makeInteriors } from "./interiors";

// 四分体沿用原阶梯接口，外壳加工设备舱；肩肘分件保留原外表面，贴壳内骨架由实际内壁生成。
function decode(value: string): ArrayBuffer {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0)).buffer;
}

export const kingjoeModuleBuilders: Record<string, GeometryBuilder> = Object.fromEntries(
  [...pedan.parts, ...pedan.structure].map((part) => [
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
for (const detail of makeKingJoeSkinDetails().filter((p) => p.assembly === "ship")) {
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
Object.assign(kingjoeModuleBuilders, chestWindowBuilders);
Object.assign(kingjoeModuleBuilders, interiorBuilders);
Object.assign(kingjoeModuleBuilders, makeVisorBuilders(kingjoeModuleBuilders.kjModule_head_arms!));

const NAMES: Record<string, string> = {
  legs: "腿部模块",
  pelvis: "腹盆模块",
  chest: "胸甲模块",
  head_arms: "头肩与完整双臂",
};

// 闭合旋转体：圆头、细杆与根部套筒同一张封闭网格，沿节点 Y 轴伸缩。
function closedLathe(profile: number[][]) {
  const geometry = new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(r, y)),
    20,
  );
  const p = geometry.getAttribute("position"),
    index = geometry.index!,
    kept: number[] = [];
  for (let i = 0; i < index.count; i += 3) {
    const ids = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
    const [a, b, c] = ids.map((j) => new THREE.Vector3().fromBufferAttribute(p, j));
    if (b!.sub(a!).cross(c!.sub(a!)).length() > 1e-12) kept.push(...ids);
  }
  geometry.setIndex(kept);
  return geometry;
}
kingjoeModuleBuilders.kjAntenna = () =>
  closedLathe([
    [0, 0],
    [0.027, 0],
    [0.027, 0.14],
    [0.018, 0.82],
    [0.041, 0.85],
    [0.05, 0.88],
    [0.041, 0.915],
    [0, 0.93],
  ]);
kingjoeModuleBuilders.kjSocket = () =>
  closedLathe([
    [0, -0.115],
    [0.055, -0.115],
    [0.067, -0.085],
    [0.067, -0.035],
    [0.05, 0],
    [0, 0],
  ]);
kingjoeModuleBuilders.kjVane = () =>
  closedLathe([
    [0, -0.0125],
    [0.095, -0.0125],
    [0.11, -0.004],
    [0.11, 0.004],
    [0.095, 0.0125],
    [0, 0.0125],
  ]).scale(1, 1, 0.77);

// [OM-FREEPLAY] 天线根部依照参考图配置；尺寸按原 GLB 的模块宽度换算。
const ANTENNAS = [
  { key: "head_arms", base: [1.55, 5.71, -0.03], direction: [1, 0.15, 0] },
  { key: "chest", base: [0.58, 5.28, 0.65], direction: [0.2, 1, 0] },
  { key: "pelvis", base: [0.4, 4.34, -0.04], direction: [0.55, 1, -0.06] },
  // 原圆盖的中心和主轴，来自源网格圆盖的平面拟合；不是髋鼓包围盒中心。
  { key: "legs", base: [0.9043, 3.2765, 0.8636], direction: [0.718, -0.048, 0.694] },
] as const;

export function makeKingJoeModuleRegistry(): ModelRegistry {
  const interiors = makeInteriors();
  const antennaNodes: ModelRegistry["nodes"] = [];
  const antennaParts: PartDefinition[] = [];
  for (const spec of ANTENNAS)
    for (const side of [-1, 1]) {
      const name = `Antenna_${spec.key}_${side < 0 ? "l" : "r"}`;
      const direction = new THREE.Vector3(
        side * spec.direction[0],
        spec.direction[1],
        spec.direction[2],
      ).normalize();
      const e = new THREE.Euler().setFromQuaternion(
        new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction),
      );
      // 安装点取当前实际外壳；头部补全后不能继续吸附到旧网格表面。
      const source = pedan.parts.find((p) => p.key === spec.key)!;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.BufferAttribute(new Float32Array(decode(source.position)), 3),
      );
      geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(decode(source.index)), 1));
      const tree = new MeshBVH(geometry);
      const seed = new THREE.Vector3(side * spec.base[0], spec.base[1], spec.base[2]);
      const hit = tree.raycastFirst(
        new THREE.Ray(seed.clone().addScaledVector(direction, 2), direction.clone().negate()),
        THREE.DoubleSide,
      );
      if (!hit) throw new Error(`${name} 未找到本体安装面`);
      const mount = hit.point;
      geometry.dispose();
      const mountName = `Mount_${spec.key}_${side < 0 ? "l" : "r"}`;
      antennaNodes.push({
        name: mountName,
        parent: `Module_${spec.key}`,
        pivot: mount.toArray(),
        rest_rotation: [(e.x * 180) / Math.PI, (e.y * 180) / Math.PI, (e.z * 180) / Math.PI],
      });
      antennaNodes.push({ name, parent: mountName, pivot: [0, -0.035, 0], motion: "scalar" });
      antennaParts.push({
        id: `kingjoemodules.${spec.key}.antenna_${side < 0 ? "l" : "r"}`,
        name_cn: `${NAMES[spec.key]}伸缩天线`,
        name_en: "telescopic antenna",
        assembly: spec.key,
        build_layer: 3,
        build_order: 30 + antennaParts.length,
        node: name,
        geometry: { type: "kit", kit: "kjAntenna" },
        material: "kjr_silver",
        mate: { type: "absolute", position: [0, 0, 0] },
      });
      antennaParts.push({
        id: `kingjoemodules.${spec.key}.socket_${side < 0 ? "l" : "r"}`,
        name_cn: `${NAMES[spec.key]}天线套筒`,
        name_en: "embedded antenna socket",
        assembly: spec.key,
        build_layer: 3,
        build_order: 30 + antennaParts.length,
        node: mountName,
        geometry: { type: "kit", kit: "kjSocket" },
        material: "kjr_silver_dark",
        mate: { type: "absolute", position: [0, 0, 0] },
      });
    }
  for (const side of [-1, 1]) {
    antennaNodes.push({
      name: `LegVane_${side < 0 ? "l" : "r"}`,
      parent: `Mount_legs_${side < 0 ? "l" : "r"}`,
      pivot: [side * 0.14, -0.005, 0],
      motion: "rotate",
    });
    antennaParts.push({
      id: `kingjoemodules.legs.vane_${side < 0 ? "l" : "r"}`,
      name_cn: "髋鼓展开护片",
      name_en: "hip flight vane",
      assembly: "legs",
      build_layer: 3,
      build_order: 30 + antennaParts.length,
      node: `LegVane_${side < 0 ? "l" : "r"}`,
      geometry: { type: "kit", kit: "kjVane" },
      material: "kjr_silver_dark",
      mate: { type: "absolute", position: [-side * 0.11, 0, 0] },
    });
  }
  const bodies: PartDefinition[] = pedan.parts
    .filter((part) => part.key in NAMES)
    .map((part, i) => ({
      id: `kingjoemodules.${part.key}.body`,
      name_cn: NAMES[part.key]!,
      name_en: part.key,
      assembly: part.key,
      node: `Module_${part.key}`,
      build_layer: 4,
      build_order: 500 + i,
      geometry: { type: "kit", kit: `kjModule_${part.key}` },
      material: part.groups[0]!.material,
      materialGroups: part.groups.map((g) => g.material),
      mate: { type: "absolute", position: [0, 0, 0] },
      source: "保留原 GLB 外表面与配合面，内部加工设备舱，肩肘切出可动外壳",
    }));
  const jointParts: PartDefinition[] = pedan.joints.map((joint, i) => {
    const part = pedan.parts.find((p) => p.key === joint.key)!;
    return {
      id: `kingjoemodules.${joint.module}.${joint.key}`,
      name_cn: joint.key.startsWith("upper")
        ? "上臂关节外壳"
        : joint.key.startsWith("fore")
          ? "前臂与手掌外壳"
          : "腿足关节外壳",
      name_en: joint.key,
      assembly: joint.module,
      node: `Joint_${joint.key}`,
      build_layer: 4,
      build_order: 510 + i,
      geometry: { type: "kit", kit: `kjModule_${joint.key}` },
      material: part.groups[0]!.material,
      materialGroups: part.groups.map((g) => g.material),
      mate: { type: "absolute", position: joint.pivot.map((n) => -n) as [number, number, number] },
      source: "从已确认外壳沿关节切分，零位拼回保持原表面",
    };
  });
  const details: PartDefinition[] = makeKingJoeSkinDetails()
    .filter((p) => p.assembly === "ship" && !p.id.includes(".visor_"))
    .map((part, i) => ({
      ...part,
      geometry: { type: "kit", kit: `kjDetail_${part.id}` },
      id: part.id.replace("kingjoeskin.", "kingjoemodules."),
      assembly: "head_arms",
      node: "ModuleHeadDetails",
      build_order: 5 + i,
    }));
  const parts: PartDefinition[] = [
    ...interiors.parts,
    ...bodies,
    ...jointParts,
    ...details,
    ...visorParts,
    ...chestWindowParts,
    ...antennaParts,
  ];
  // 本卡早期用 1..47 的局部 build_order；并入主线后统一抬到 ≥100，
  // 保留原有先后顺序（main 的 validate 以 <100 为错误）。
  parts.sort((a, b) => a.build_layer - b.build_layer || a.build_order - b.build_order);
  parts.forEach((part, index) => {
    part.build_order = 100 + index * 10;
  });

  return {
    model: "kingjoemodules",
    title: "金古桥 · 参考图分体",
    subtitle: "佩丹设备舱 · 肩肘联动 · 阶梯嵌合接口",
    constants: {
      ...interiors.constants,
      HIP_SEAM: String(data.hip),
      WAIST_SEAM: String(data.waist),
      NECK_SEAM: String(data.neck),
      // [OM-FREEPLAY] 分离终态沿参考图横向摆放，便于查看四个完整分体。
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
          part.key === "head_arms"
            ? "-DISPLAY_SPACING"
            : part.key === "legs"
              ? "DISPLAY_SPACING"
              : moduleOffsets(0)[part.key as keyof ReturnType<typeof moduleOffsets>][0],
          moduleOffsets(0)[part.key as keyof ReturnType<typeof moduleOffsets>][1],
          moduleOffsets(0)[part.key as keyof ReturnType<typeof moduleOffsets>][2],
        ] as [string | number, number, number],
        motion: "translate" as const,
      })),
      // 原叠加细节沿用原皮模块坐标；主体生成数据已经旋转到 +Z。
      {
        name: "ModuleHeadDetails",
        parent: "Module_head_arms",
        pivot: [0, 5.65, 0],
        rest_rotation: [0, 180, 0],
      },
      ...antennaNodes,
      ...pedan.joints.map((joint) => {
        const parent = pedan.joints.find((p) => `Joint_${p.key}` === joint.parent);
        return {
          name: `Joint_${joint.key}`,
          parent: joint.parent,
          pivot: joint.pivot.map((n, i) => n - (parent?.pivot[i] ?? 0)) as [number, number, number],
          motion: "rotate" as const,
        };
      }),
      ...interiors.nodes,
    ],
    materials: {
      ...KINGJOE_SKIN_MATERIALS,
      // 用户要求偏黄色金属外观；仅本分体模型改色，不改旧卡片的共用材质。
      kjr_silver: { ...KINGJOE_SKIN_MATERIALS.kjr_silver, base: "#cbb374", metalness: 0.62, roughness: 0.5 },
      kjr_silver_dark: { ...KINGJOE_SKIN_MATERIALS.kjr_silver_dark, base: "#968254", metalness: 0.58 },
      kjr_dark: { ...KINGJOE_SKIN_MATERIALS.kjr_dark, base: "#514a36" },
      ...INTERIOR_MATERIALS,
      kjm_glass_l: {
        base: "#ffffff",
        metalness: 0.18,
        roughness: 0.34,
        vertexColors: true,
        clearcoat: 0.65,
        clearcoatRoughness: 0.2,
      },
      kjm_glass_r: {
        base: "#ffffff",
        metalness: 0.18,
        roughness: 0.34,
        vertexColors: true,
        clearcoat: 0.65,
        clearcoatRoughness: 0.2,
      },
      kjm_window_rim: { base: "#13191a", metalness: 0.12, roughness: 0.46 },
      kjm_visor_seal: { base: "#34443e", metalness: 0.12, roughness: 0.5 },
      kjm_visor_glass: {
        base: "#ffffff",
        metalness: 0.08,
        roughness: 0.3,
        vertexColors: true,
        clearcoat: 0.8,
        clearcoatRoughness: 0.19,
      },
      // [OM-FREEPLAY] 新封口以低反光深银区分，保留原表面的银灰外观。
      kjr_cap: { base: "#606a73", metalness: 0.45, roughness: 0.65 },
    },
    parts,
    expectedContacts: [
      ...(interiors.expectedContacts ?? []),
      ...["l", "r"].map((side) => ({
        family: "shoulder_rest_seam",
        a: "kingjoemodules.head_arms.body",
        b: `kingjoemodules.head_arms.upper_${side}`,
        reason: "垂手时肩部水平分件面贴合；158 个实际运动姿态的实体求交检查为零体积",
        maxDepthMm: 0.1,
        allowSuspect: true,
        staticOnly: true,
      })),
      ...["l", "r"].map((side) => ({
        family: "elbow_rest_seam",
        a: `kingjoemodules.head_arms.upper_${side}`,
        b: `kingjoemodules.head_arms.fore_${side}`,
        reason: "垂手时原分件平面贴合；实体布尔复核无交叠体积，仅允许亚毫米接触",
        maxDepthMm: 0.1,
        allowSuspect: true,
        staticOnly: true,
      })),
      ...[
        ["housing", "seal"],
        ["seal", "glass"],
      ].map(([a, b]) => ({
        family: "visor_lamination",
        a: `kingjoemodules.ship.visor_${a}`,
        b: `kingjoemodules.ship.visor_${b}`,
        reason: "同一拟合曲面的层叠贴合面，离散网格允许亚毫米级交叠",
        maxDepthMm: 1,
        anyForm: true,
      })),
      {
        family: "visor_mount",
        a: "kingjoemodules.head_arms.body",
        b: "kingjoemodules.ship.visor_housing",
        reason: "薄金属框逐点贴合头壳，背面嵌入 8 毫米固定",
        maxDepthMm: 9,
        anyForm: true,
      },
      {
        family: "hip_hinge",
        a: "kingjoemodules.legs.body",
        b: "kingjoemodules.legs.vane*",
        reason: "护片铰接边埋入髋鼓圆盖，转动时保持连接",
        maxDepthMm: 10,
        anyForm: true,
      },
      ...ANTENNAS.flatMap((spec) =>
        [-1, 1].flatMap((side) => {
          const suffix = side < 0 ? "l" : "r",
            prefix = `kingjoemodules.${spec.key}`;
          return [
            {
              family: "antenna_mount",
              a: `${prefix}.body`,
              b: `${prefix}.socket_${suffix}`,
              reason: "固定套筒完全埋入本体，顶端与安装面齐平",
              maxDepthMm: 130,
              anyForm: true,
            },
            {
              family: "antenna_mount",
              a: `${prefix}.body`,
              b: `${prefix}.antenna_${suffix}`,
              reason: "伸缩杆根部始终埋在本体内",
              maxDepthMm: 60,
              anyForm: true,
            },
            {
              family: "antenna_mount",
              a: `${prefix}.socket_${suffix}`,
              b: `${prefix}.antenna_${suffix}`,
              reason: "伸缩杆穿过固定套筒",
              maxDepthMm: 100,
              anyForm: true,
            },
          ];
        }),
      ),
      {
        family: "chest_frame",
        a: "kingjoemodules.chest.body",
        b: "kingjoemodules.chest.rim*",
        reason: "圆润黑边嵌入胸甲，前后曲率沿胸甲外壳贴合",
        maxDepthMm: 16,
        anyForm: true,
      },
    ],
  };
}

export const poseKingJoeModules = animateKingJoeModules;

export const moduleData = data;
