// 胸甲与头屏的可拆光学内构：共用外表面的轮廓和曲率，分瓣而非再放一层完整外壳。
// [OM-FREEPLAY] 分段承座、光导瓣、集能母线与背驱动是原创佩丹光学结构；尺寸由既有窗面向内退层。
import * as THREE from "three";
import type { GeometryBuilder } from "../../assembler/geometry";
import type { ModelRegistry, PartDefinition } from "../../registry/types";
import type { AssembledModel } from "../../assembler/assembler";
import { chestWindowProfile } from "./chest-windows";
import { visorProfile } from "./visor";
import { VISOR_GRID } from "./visor-grid";
import { pedanPower, type PedanActivity } from "./machinery";
import { displayMaterialSource } from "../../kernel/displayMaterial";

export const opticalBuilders: Record<string, GeometryBuilder> = {};
const opticalGeometryFactories = new Map<string, () => THREE.BufferGeometry>();
export const opticalParts: PartDefinition[] = [];
export const opticalMaterials: ModelRegistry["materials"] = {
  pedan_optic_cells: { base: "#274843", roughness: 0.6, metalness: 0.12 },
};
export const opticalVisorIds: string[] = [];
// 接口随实体创建，避免能量特效另猜坐标；两端均取实际零件表面。
export const opticalContactFaces: {
  owner: string;
  label: string;
  faces: [string, string];
  a: [number, number, number];
  b: [number, number, number];
  radius: number;
}[] = [];

// 先在 XY 轮廓上挤出有厚度的零件，再映射到现有光学曲面；前后都跟随曲率。
function plate(
  points: THREE.Vector2[],
  surface: (x: number, y: number) => number,
  depth: number,
  thickness: number,
) {
  // 环带按内外一一对应的弧点铺四边面，避免狭窄母线交给多边形耳切后产生退化三角形。
  if (points.length === 26) {
    const positions: number[] = [],
      indices: number[] = [];
    const n = points.length;
    for (const offset of [0, thickness])
      for (const p of points) positions.push(p.x, p.y, surface(p.x, p.y) - depth - offset);
    for (let i = 0; i < 12; i++) {
      indices.push(i, i + 1, n - 2 - i, i, n - 2 - i, n - 1 - i);
    }
    const front = [...indices];
    for (let i = 0; i < front.length; i += 3)
      indices.push(front[i]! + n, front[i + 2]! + n, front[i + 1]! + n);
    for (let i = 0; i < n; i++) {
      const next = (i + 1) % n;
      indices.push(i, i + n, next, next, i + n, next + n);
    }
    if (THREE.ShapeUtils.isClockWise(points))
      for (let i = 0; i < indices.length; i += 3)
        [indices[i + 1], indices[i + 2]] = [indices[i + 2]!, indices[i + 1]!];
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }
  const shape = new THREE.Shape(points);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    steps: 1,
    bevelEnabled: false,
    curveSegments: 8,
  });
  const positions = geometry.getAttribute("position");
  for (let i = 0; i < positions.count; i++)
    positions.setZ(i, surface(positions.getX(i), positions.getY(i)) - depth - thickness + positions.getZ(i));
  geometry.computeVertexNormals();
  return geometry;
}

function segment(
  center: THREE.Vector2,
  edge: THREE.Vector2[],
  index: number,
  count: number,
  inner: number,
  outer: number,
) {
  const at = (t: number, radius: number) => {
    const f = (((t % 1) + 1) % 1) * edge.length;
    const p = edge[Math.floor(f)]!.clone().lerp(edge[(Math.floor(f) + 1) % edge.length]!, f % 1);
    return center.clone().lerp(p, radius);
  };
  const points: THREE.Vector2[] = [];
  // 每个弧段留出真实装配缝，能区分多个零件，又保留连续的整体轮廓。
  for (let i = 0; i <= 12; i++) points.push(at((index + 0.035 + (i / 12) * 0.93) / count, outer));
  for (let i = 12; i >= 0; i--) points.push(at((index + 0.035 + (i / 12) * 0.93) / count, inner));
  return points;
}

function add(
  name: string,
  label: string,
  module: string,
  material: string,
  builder: () => THREE.BufferGeometry,
) {
  const kit = `pedanOptic_${name}`;
  opticalBuilders[kit] = builder;
  const id = `kingjoemodules.${module}.internal_optic_${name}`;
  opticalGeometryFactories.set(id, builder);
  opticalParts.push({
    id,
    name_cn: label,
    name_en: name,
    assembly: module,
    node: `Module_${module}`,
    build_layer: 3,
    build_order: 80 + opticalParts.length,
    geometry: { type: "kit", kit },
    material,
    mate: { type: "absolute", position: [0, 0, 0] },
    tags: ["internal", "optical-interior"],
    source: "共享胸窗/头屏轮廓；向内退层的原创分段光学总成",
  });
  return id;
}

for (const side of [-1, 1]) {
  const suffix = side < 0 ? "l" : "r";
  const center = chestWindowProfile.center.clone();
  center.x *= side;
  const edge = chestWindowProfile.edge.map((p) => new THREE.Vector2(p.x * side, p.y));
  const surface = (x: number) => chestWindowProfile.front(x);
  for (let i = 0; i < 12; i++)
    add(
      `chest_${suffix}_seat_${i}`,
      `${suffix === "l" ? "左" : "右"}胸光学分段承座 ${i + 1}`,
      "chest",
      i % 3 === 0 ? "pedan_coil" : "pedan_titanium",
      () => plate(segment(center, edge, i, 12, 0.83, 0.95), surface, 0.018, 0.055),
    );
  for (let i = 0; i < 8; i++) {
    // 光导瓣外缘到分段承座内缘；避开承座自身的分段缝。
    const t = (i + 0.5) / 8;
    const f = t * edge.length;
    const boundary = edge[Math.floor(f)]!.clone().lerp(edge[(Math.floor(f) + 1) % edge.length]!, f % 1);
    const guide = center.clone().lerp(boundary, 0.75);
    const seat = center.clone().lerp(boundary, 0.83);
    opticalContactFaces.push({
      owner: "chest",
      label: `${suffix === "l" ? "左" : "右"}胸光导接口 ${i + 1}`,
      faces: [
        `kingjoemodules.chest.internal_optic_chest_${suffix}_guide_${i}`,
        `kingjoemodules.chest.internal_optic_chest_${suffix}_seat_${Math.floor(t * 12)}`,
      ],
      a: [guide.x, guide.y, surface(guide.x) - 0.03],
      b: [seat.x, seat.y, surface(seat.x) - 0.03],
      radius: 0.009,
    });
    add(`chest_${suffix}_cassette_${i}`, `胸窗分瓣光导背匣 ${i + 1}`, "chest", "pedan_ceramic", () =>
      plate(segment(center, edge, i, 8, 0.13, 0.81), surface, 0.075, 0.045),
    );
    const material = `pedan_optic_modulator_${suffix}_${i % 3}`;
    const color = ["#448c94", "#a88851", "#666d9e"][i % 3]!;
    opticalMaterials[material] = {
      base: color,
      emissive: color,
      emissiveIntensity: 0.2,
      roughness: 0.4,
      metalness: 0.3,
    };
    add(`chest_${suffix}_guide_${i}`, `胸窗独立光导瓣 ${i + 1}`, "chest", material, () =>
      plate(segment(center, edge, i, 8, 0.23, 0.75), surface, 0.022, 0.016),
    );
    add(`chest_${suffix}_bus_${i}`, `胸窗径向集能母线 ${i + 1}`, "chest", "pedan_coil", () =>
      plate(segment(center, edge, i * 8 + 4, 64, 0.12, 0.76), surface, 0.012, 0.012),
    );
  }
  add(`chest_${suffix}_hub`, "胸窗光学汇流座", "chest", "pedan_titanium", () => {
    const g = new THREE.CylinderGeometry(0.065, 0.075, 0.09, 24);
    g.rotateX(Math.PI / 2);
    g.translate(center.x, center.y, surface(center.x) - 0.09);
    return g;
  });
  add(`chest_${suffix}_coupler`, "核心至胸窗场耦合端环", "chest", `pedan_power_modulator_${suffix}`, () => {
    const g = new THREE.TorusGeometry(0.045, 0.009, 8, 28);
    g.translate(center.x, center.y, surface(center.x) - 0.035);
    return g;
  });
}

const visorCenter = new THREE.Vector2(visorProfile.center.x, visorProfile.center.y);
const visorEdge = visorProfile.boundary.map((p) => new THREE.Vector2(p.x, p.y));
for (let i = 0; i < 12; i++)
  add(
    `visor_seat_${i}`,
    `头屏分段内框 ${i + 1}`,
    "head_arms",
    i % 3 === 0 ? "pedan_coil" : "pedan_titanium",
    () => plate(segment(visorCenter, visorEdge, i, 12, 0.84, 0.98), visorProfile.surface, 0.03, 0.035),
  );

const rectangle = (x: number, y: number, w: number, h: number) => [
  new THREE.Vector2(x - w / 2, y - h / 2),
  new THREE.Vector2(x + w / 2, y - h / 2),
  new THREE.Vector2(x + w / 2, y + h / 2),
  new THREE.Vector2(x - w / 2, y + h / 2),
];
for (let row = 0; row < VISOR_GRID.rows; row++) {
  const y = VISOR_GRID.centerY + ((row + 0.5) / VISOR_GRID.rows - 0.5) * VISOR_GRID.height;
  add(`visor_driver_${row}`, `头屏第 ${row + 1} 排驱动背板`, "head_arms", "pedan_ceramic", () =>
    plate(
      rectangle(0, y, VISOR_GRID.width + 0.045, (VISOR_GRID.height / VISOR_GRID.rows) * 0.92),
      visorProfile.surface,
      0.068,
      0.035,
    ),
  );
  for (let col = 0; col < VISOR_GRID.columns; col++) {
    const x = ((col + 0.5) / VISOR_GRID.columns - 0.5) * VISOR_GRID.width;
    if (col === 0 || col === VISOR_GRID.columns - 1)
      opticalContactFaces.push({
        owner: "head_arms",
        label: `头屏第 ${row + 1} 排${col === 0 ? "左" : "右"}背板接口`,
        faces: [
          `kingjoemodules.head_arms.internal_optic_visor_driver_${row}`,
          `kingjoemodules.head_arms.internal_optic_visor_cell_${row}_${col}`,
        ],
        a: [x, y, visorProfile.surface(x, y) - 0.068],
        b: [x, y, visorProfile.surface(x, y) - 0.03 - 0.025],
        radius: 0.009,
      });
    opticalVisorIds.push(
      add(
        `visor_cell_${row}_${col}`,
        `头屏光学单元 ${row + 1} 排 ${col + 1} 列`,
        "head_arms",
        "pedan_optic_cells",
        () =>
          plate(
            rectangle(
              x,
              y,
              (VISOR_GRID.width / VISOR_GRID.columns) * 0.84,
              (VISOR_GRID.height / VISOR_GRID.rows) * 0.78,
            ),
            visorProfile.surface,
            0.03,
            0.025,
          ),
      ),
    );
  }
}

// 头屏背板是有限三角面，不等于拟合曲面本身。沿 Z 取实际前/后表面，
// 防止用拟合 z 值放端口时，接口浮在背板前方（宽背板两侧尤为明显）。
const contactMaterial = new THREE.MeshBasicMaterial();
for (const contact of opticalContactFaces.filter((p) => p.owner === "head_arms")) {
  for (const [i, point] of [contact.a, contact.b].entries()) {
    const geometry = opticalGeometryFactories.get(contact.faces[i]!)!();
    const direction = i === 0 ? -1 : 1;
    const ray = new THREE.Raycaster(
      new THREE.Vector3(point[0], point[1], -direction * 10),
      new THREE.Vector3(0, 0, direction),
    );
    const hit = ray.intersectObject(new THREE.Mesh(geometry, contactMaterial), false)[0];
    if (!hit) throw new Error(`光学接口未命中安装面：${contact.label}`);
    point[2] = hit.point.z;
    geometry.dispose();
  }
}
contactMaterial.dispose();
opticalGeometryFactories.clear();

const caches = new WeakMap<AssembledModel, { material: THREE.MeshStandardMaterial; channel: string }[]>();
export function updateOpticalInteriors(model: AssembledModel, seconds: number, activity: PedanActivity) {
  let lights = caches.get(model);
  if (!lights) {
    const seen = new Set<THREE.Material>();
    lights = [];
    for (const part of model.parts) {
      const name = part.def.material;
      if (typeof name !== "string" || !name.startsWith("pedan_optic_modulator_")) continue;
      for (const display of Array.isArray(part.object.material)
        ? part.object.material
        : [part.object.material]) {
        const material = displayMaterialSource(display);
        if (material instanceof THREE.MeshStandardMaterial && !seen.has(material)) {
          seen.add(material);
          lights.push({ material, channel: name.includes("_l_") ? "modulator_l" : "modulator_r" });
        }
      }
    }
    caches.set(model, lights);
  }
  for (const { material, channel } of lights)
    material.emissiveIntensity = 0.06 + pedanPower(seconds, channel, activity) * 0.55;
}
