import * as THREE from "three";
import type { InstanceLayout } from "../../../assembler/assembler";
import type { ExpectedContactRule, GeometrySpec, ModelRegistry, NodeDef, PartDefinition } from "../../../registry/types";
import { MBT } from "../constants";
import { MBT_MATERIALS } from "../materials";

// ============================================================================
// models/mbt/hull/registry —— L4 外壳 / 复合装甲 / ERA / 滑膛炮 + L5 表面
//
// 车体：大倾角首上（33°）、复合装甲分层（钢面板 + 陶瓷 + 间隔 + 背板）、
// 楔形炮塔（±24° 前斜板）、120mm 滑膛炮（热护套 + 抽烟装置）、
// 90 块 ERA（首上 30 / 炮塔前 20 / 炮塔侧 16 / 侧裙 24），每块三层。
// ============================================================================

const P = "mbt90.hull.";
const A = (position: [number, number, number], rotation?: [number, number, number]) =>
  rotation ? { type: "absolute" as const, position, rotation } : { type: "absolute" as const, position };
const B = (w: number, h: number, d: number, at: [number, number, number] = [0, 0, 0], bevel = 0.006): GeometrySpec & { at: [number, number, number] } => ({ type: "box", w, h, d, bevel, at });
const C = (r: number, h: number, at: [number, number, number] = [0, 0, 0], segments = 20, rTop = r): GeometrySpec & { at: [number, number, number] } => ({ type: "cylinder", r, h, rTop, segments, bevel: 0.002, at });
const T = (ro: number, ri: number, h: number, at: [number, number, number] = [0, 0, 0], seg = 28): GeometrySpec & { at: [number, number, number] } => ({ type: "tube", rOuter: ro, rInner: ri, h, segments: seg, at });
const MERGE = (...items: Array<GeometrySpec & { at?: [number, number, number] }>): GeometrySpec => ({ type: "merge", parts: items });
const TL = (x: number, y: number, z: number): [number, number, number] => [x, y, z - MBT.TURRET_Z];
const CITV_NODE = "MBT_CITV";

function rotated(rot: [number, number, number], v: [number, number, number]): [number, number, number] {
  const vec = new THREE.Vector3(...v).applyEuler(new THREE.Euler(...rot.map((d) => (d * Math.PI) / 180)));
  return [vec.x, vec.y, vec.z];
}
function plus(a: [number, number, number], b: [number, number, number]): [number, number, number] {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

// ERA 布局：类型 × 网格
type EraGroup = { key: string; cols: number; rows: number; base: [number, number, number]; rot: [number, number, number]; stepX: number; stepY: number; size: [number, number, number]; node?: string };
const ERA_GROUPS: EraGroup[] = [
  { key: "glacis", cols: 5, rows: 6, base: [0, 1.38, 2.55], rot: [33, 0, 0], stepX: 0.5, stepY: 0.27, size: [0.44, 0.24, 0.13] },
  { key: "cheek_r", cols: 5, rows: 4, base: [0.64, 2.08, 1.02], rot: [-8, -24, 0], stepX: 0.22, stepY: 0.14, size: [0.2, 0.13, 0.12], node: "Turret" },
  { key: "cheek_l", cols: 5, rows: 4, base: [-0.64, 2.08, 1.02], rot: [-8, 24, 0], stepX: 0.22, stepY: 0.14, size: [0.2, 0.13, 0.12], node: "Turret" },
  { key: "side_r", cols: 8, rows: 2, base: [1.3, 2.12, 0.1], rot: [0, 90, 0], stepX: 0.32, stepY: 0.16, size: [0.3, 0.14, 0.12], node: "Turret" },
  { key: "side_l", cols: 8, rows: 2, base: [-1.3, 2.12, 0.1], rot: [0, -90, 0], stepX: 0.32, stepY: 0.16, size: [0.3, 0.14, 0.12], node: "Turret" },
  { key: "skirt_r", cols: 12, rows: 1, base: [1.9, 1.08, -2.45], rot: [0, 90, 0], stepX: 0.46, stepY: 0, size: [0.42, 0.58, 0.12] },
  { key: "skirt_l", cols: 12, rows: 1, base: [-1.9, 1.08, -2.45], rot: [0, -90, 0], stepX: 0.46, stepY: 0, size: [0.42, 0.58, 0.12] },
];
function eraLayout(group: EraGroup): InstanceLayout {
  return ({ index }) => {
    const col = index % group.cols;
    const row = Math.floor(index / group.cols);
    const cx = (col - (group.cols - 1) / 2) * group.stepX;
    const cy = (row - (group.rows - 1) / 2) * group.stepY;
    const local: [number, number, number] = [cx, cy, 0.1];
    const offset = rotated(group.rot, local);
    const pos = plus(group.base, offset);
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(...pos),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...group.rot.map((d) => (d * Math.PI) / 180))),
      new THREE.Vector3(1, 1, 1),
    );
    if (group.node === "Turret") m.setPosition(pos[0], pos[1], pos[2] - MBT.TURRET_Z);
    return m;
  };
}

export const HULL_LAYOUTS: Record<string, InstanceLayout> = Object.fromEntries(
  ERA_GROUPS.map((g) => [`mbt.hull.era_${g.key}`, eraLayout(g)]),
);

// 表面/附件实例布局（非节点件：模型坐标；节点件：节点局部坐标）
const SURFACE_LAYOUTS: Record<string, InstanceLayout> = {
  "mbt.hull.headlight": ({ index }) =>
    new THREE.Matrix4().makeTranslation(index === 0 ? -1.22 : 1.22, 1.42, 2.95),
  "mbt.hull.towHook": ({ index }) =>
    new THREE.Matrix4().makeTranslation(index === 0 ? -0.92 : 0.92, 0.78, 3.18),
  "mbt.hull.liftingEyes": ({ index }) => {
    const spots: [number, number, number][] = [
      [-1.1, 1.79, 1.8], [1.1, 1.79, 1.8], [-1.1, 1.79, -0.7],
      [1.1, 1.79, -0.7], [-0.95, 1.5, -3.15], [0.95, 1.5, -3.15],
    ];
    const [x, y, z] = spots[index] ?? spots[0]!;
    return new THREE.Matrix4().makeTranslation(x, y, z);
  },
  "mbt.hull.fuelCap": ({ index }) =>
    new THREE.Matrix4().makeTranslation(index === 0 ? -0.85 : 0.85, 1.79, -2.45),
  "mbt.hull.torsion": ({ index }) => {
    const side = index % 2 === 0 ? 1 : -1;
    const k = Math.floor(index / 2);
    return new THREE.Matrix4().makeTranslation(side * 1.04, 0.56, MBT.WHEEL_Z_FIRST - k * MBT.WHEEL_PITCH);
  },
  "mbt.hull.welds": ({ index }) => {
    const spots: [number, number, number, number][] = [
      [-1.28, 1.45, 2.2, 55], [1.28, 1.45, 2.2, 55], [-1.28, 1.45, -0.6, 0],
      [1.28, 1.45, -0.6, 0], [-1.1, 1.72, 1.1, 90], [1.1, 1.72, 1.1, 90],
      [-1.07, 2.3, 0.4, 90], [1.07, 2.3, 0.4, 90], [-1.07, 2.3, -1.2, 90],
      [1.07, 2.3, -1.2, 90], [0, 2.46, 0.7, 0], [0, 2.46, -0.8, 0],
      [-0.9, 1.72, -2.4, 0], [0.9, 1.72, -2.4, 0], [0, 1.72, -3.0, 90],
      [-0.6, 1.75, 1.8, 90], [0.6, 1.75, 1.8, 90], [0, 1.8, -2.9, 0],
    ];
    const [x, y, z, yaw] = spots[index] ?? spots[0]!;
    return new THREE.Matrix4().makeRotationY((yaw * Math.PI) / 180).setPosition(x, y, z);
  },
  "mbt.hull.steps": ({ index }) => {
    const spots: [number, number, number][] = [
      [-1.38, 0.9, 1.6], [1.38, 0.9, 1.6], [-1.38, 0.9, -1.8], [1.38, 0.9, -1.8],
    ];
    const [x, y, z] = spots[index] ?? spots[0]!;
    return new THREE.Matrix4().makeTranslation(x, y, z);
  },
  "mbt.hull.eraRail": ({ index }) =>
    new THREE.Matrix4().makeTranslation(index === 0 ? -1.35 : 1.35, 1.55, -0.3),
  "mbt.hull.insignia": ({ index }) =>
    new THREE.Matrix4().makeRotationY(index === 0 ? Math.PI / 2 : -Math.PI / 2).setPosition(index === 0 ? 1.29 : -1.29, 2.2, 0.4),
  "mbt.hull.mud": ({ index }) => {
    const a = (index / 18) * Math.PI * 2;
    return new THREE.Matrix4().makeTranslation(
      Math.cos(a) * 1.4,
      0.42 + (index % 3) * 0.04,
      -2.6 + (index / 18) * 5.2,
    );
  },
  "mbt.hull.wear": ({ index }) => {
    const side = index < 6 ? 1 : -1;
    return new THREE.Matrix4().makeRotationY(side * Math.PI / 2).setPosition(side * 1.35, 1.05 + (index % 3) * 0.16, 2.2 - (index % 6) * 0.9);
  },
  "mbt.hull.antislip": ({ index }) => {
    const side = index % 2 === 0 ? 1 : -1;
    return new THREE.Matrix4().makeTranslation(side * 0.7, 1.76 + (index % 3) * 0.002, 1.5 - Math.floor(index / 2) * 0.35);
  },
  "mbt.hull.handles": ({ index }) => {
    const spots: [number, number, number][] = [
      [-1.36, 1.45, 1.0], [1.36, 1.45, 1.0], [-1.36, 1.45, -0.2], [1.36, 1.45, -0.2],
      [-0.9, 1.8, 1.3], [0.9, 1.8, 1.3], [-0.9, 1.8, -1.0], [0.9, 1.8, -1.0],
      [-1.1, 1.6, -2.6], [1.1, 1.6, -2.6],
    ];
    const [x, y, z] = spots[index] ?? spots[0]!;
    return new THREE.Matrix4().makeTranslation(x, y, z);
  },
  "mbt.hull.tarps": ({ index }) =>
    new THREE.Matrix4().makeTranslation(index === 0 ? -0.55 : 0.55, 2.25, -2.5 - MBT.TURRET_Z),
  "mbt.hull.antennas": ({ index }) =>
    new THREE.Matrix4().makeTranslation(index === 0 ? -1.0 : 1.0, 2.55, -1.4 - MBT.TURRET_Z),
  "mbt.hull.stowage": ({ index }) =>
    new THREE.Matrix4().makeTranslation(index === 0 ? -0.62 : 0.62, 2.25, -2.6 - MBT.TURRET_Z),
  "mbt.hull.spareTrack": ({ index }) =>
    new THREE.Matrix4().makeTranslation(1.33, 2.02, -0.75 + index * 0.18 - MBT.TURRET_Z),
};
Object.assign(HULL_LAYOUTS, SURFACE_LAYOUTS);

const HULL_NODES: NodeDef[] = [
  { name: "Turret", parent: "root", pivot: [0, 0, MBT.TURRET_Z], motion: "rotate", axis: "y", note: "炮塔回转（座圈中心 z=0.1）" },
  { name: "Gun", parent: "Turret", pivot: [0, MBT.GUN_Y, MBT.GUN_ROOT_Z - MBT.TURRET_Z], motion: "rotate", axis: "x", note: "火炮俯仰（耳轴 y=1.98,z=1.62）" },
  { name: "GunRecoil", parent: "Gun", pivot: [0, 0, 0], motion: "translate", axis: "z", note: "后坐（-Z）" },
  { name: "MBT_BreechBlock", parent: "GunRecoil", pivot: [0, 0, -0.92], motion: "translate", axis: "y", note: "炮闩开闭（向下）" },
];

function buildParts(): PartDefinition[] {
  const parts: PartDefinition[] = [];
  const add = (p: PartDefinition) => parts.push(p);

  // ================= 车体主结构 =================
  add({
    id: `${P}floor`,
    name_cn: "车体底甲板",
    name_en: "hull floor",
    assembly: "hull_structure",
    build_layer: 4,
    build_order: 400,
    geometry: MERGE(B(2.68, 0.12, 6.2, [0, 0, 0], 0.02), B(2.3, 0.04, 5.8, [0, 0.08, 0], 0.01)),
    material: "mbt_paint",
    mate: A([0, MBT.HULL_FLOOR, -0.1]),
  });
  add({
    id: `${P}belly_plate`,
    name_cn: "防雷底甲",
    name_en: "belly plate",
    assembly: "hull_structure",
    build_layer: 4,
    build_order: 401,
    geometry: MERGE(B(2.2, 0.05, 4.6, [0, 0, 0], 0.01), ...Array.from({ length: 5 }, (_, i) => B(2.24, 0.08, 0.12, [0, -0.02, -1.8 + i * 0.9], 0.006))),
    material: "mbt_steel_dark",
    mate: A([0, 0.38, 0.0]),
  });
  add({
    id: `${P}side_wall`,
    name_cn: "车体侧甲",
    name_en: "hull side wall",
    assembly: "hull_structure",
    build_layer: 4,
    build_order: 402,
    geometry: MERGE(B(0.08, 1.2, 5.8, [0, 0, 0], 0.01), B(0.04, 0.18, 5.6, [0.03, -0.42, 0], 0.006)),
    material: "mbt_paint",
    dual: true,
    mate: A([1.3, 1.1, -0.1]),
  });
  add({
    id: `${P}sponson`,
    name_cn: "履带翼子板",
    name_en: "track sponson",
    assembly: "hull_structure",
    build_layer: 4,
    build_order: 403,
    geometry: MERGE(B(0.5, 0.06, 5.8, [0, 0, 0], 0.006), B(0.04, 0.24, 5.8, [0.24, -0.12, 0], 0.004)),
    material: "mbt_paint",
    dual: true,
    mate: A([1.56, 1.2, -0.1]),
  });
  add({
    id: `${P}glacis`,
    name_cn: "首上装甲（基板）",
    name_en: "glacis base plate",
    assembly: "hull_structure",
    build_layer: 4,
    build_order: 404,
    geometry: MERGE(B(2.56, 1.18, 0.08, [0, 0, 0], 0.012), B(2.5, 0.08, 0.05, [0, 0.5, 0], 0.005)),
    material: "mbt_paint",
    mate: A([0, 1.38, 2.55], [33, 0, 0]),
  });
  add({
    id: `${P}lower_front`,
    name_cn: "首下装甲",
    name_en: "lower front plate",
    assembly: "hull_structure",
    build_layer: 4,
    build_order: 405,
    geometry: MERGE(B(2.5, 0.7, 0.07, [0, 0, 0], 0.01)),
    material: "mbt_paint",
    mate: A([0, 0.82, 3.06], [12, 0, 0]),
  });
  add({
    id: `${P}rear_plate`,
    name_cn: "尾甲板",
    name_en: "rear plate",
    assembly: "hull_structure",
    build_layer: 4,
    build_order: 406,
    geometry: MERGE(B(2.6, 1.16, 0.08, [0, 0, 0], 0.01), B(0.7, 0.4, 0.05, [0.5, 0.1, -0.07], 0.006), B(0.7, 0.4, 0.05, [-0.5, 0.1, -0.07], 0.006)),
    material: "mbt_paint",
    mate: A([0, 1.16, MBT.HULL_Z_REAR], [-8, 0, 0]),
  });
  add({
    id: `${P}front_deck`,
    name_cn: "前甲板",
    name_en: "front deck",
    assembly: "hull_structure",
    build_layer: 4,
    build_order: 407,
    geometry: MERGE(B(2.66, 0.08, 1.9, [0, 0, 0], 0.01), B(2.5, 0.03, 1.7, [0, 0.055, 0], 0.006)),
    material: "mbt_paint",
    mate: A([0, MBT.HULL_DECK, 0.95]),
  });
  add({
    id: `${P}engine_deck`,
    name_cn: "动力舱甲板",
    name_en: "engine deck",
    assembly: "hull_structure",
    build_layer: 4,
    build_order: 408,
    geometry: MERGE(B(2.66, 0.08, 2.9, [0, 0, 0], 0.01), B(2.5, 0.03, 2.6, [0, 0.055, 0], 0.006)),
    material: "mbt_paint",
    mate: A([0, MBT.HULL_DECK, -1.65]),
  });
  for (const [tag, x] of [
    ["l", -0.55],
    ["r", 0.55],
  ] as const) {
    add({
      id: `${P}engine_grille_${tag}`,
      name_cn: `动力舱格栅（${tag === "l" ? "左" : "右"}）`,
      name_en: `engine grille ${tag}`,
      assembly: "hull_structure",
      build_layer: 4,
      build_order: 409,
      geometry: { type: "louver", count: 9, w: 0.86, h: 1.0, slantDeg: 32, t: 0.028 },
      material: "mbt_steel_dark",
      mate: A([x, 1.79, -2.9], [-90, 0, 0]),
    });
  }
  add({
    id: `${P}exhaust_grille`,
    name_cn: "排气百叶",
    name_en: "exhaust grille",
    assembly: "hull_structure",
    build_layer: 4,
    build_order: 410,
    geometry: { type: "louver", count: 7, w: 1.4, h: 0.5, slantDeg: 28, t: 0.025 },
    material: "mbt_rust",
    mate: A([0, 1.79, -3.05], [-90, 0, 0]),
  });
  add({
    id: `${P}driver_hatch`,
    name_cn: "驾驶员舱盖",
    name_en: "driver hatch",
    assembly: "hull_structure",
    build_layer: 4,
    build_order: 411,
    geometry: MERGE(C(0.29, 0.06, [0, 0, 0], 24, 0.29), T(0.31, 0.28, 0.05, [0, 0, 0], 24), C(0.07, 0.03, [0, 0.05, 0], 16)),
    material: "mbt_paint",
    mate: A([-0.55, 1.77, 2.05], [33, 0, 0]),
  });
  for (let p = 0; p < 3; p++) {
    add({
      id: `${P}driver_periscope_${p + 1}`,
      name_cn: `驾驶员潜望镜 ${p + 1}`,
      name_en: `driver periscope ${p + 1}`,
      assembly: "hull_structure",
      build_layer: 4,
      build_order: 412,
      geometry: MERGE(B(0.15, 0.1, 0.08, [0, 0, 0], 0.008), B(0.12, 0.06, 0.02, [0, 0.01, 0.05], 0.003)),
      material: "mbt_glass",
      mate: A([-0.74 + p * 0.16, 1.83, 2.12], [33, 0, 0]),
    });
  }
  add({
    id: `${P}headlight`,
    name_cn: "前大灯 ×2",
    name_en: "headlight",
    assembly: "hull_structure",
    build_layer: 4,
    build_order: 413,
    geometry: MERGE(C(0.11, 0.12, [0, 0, 0], 20), C(0.095, 0.02, [0, 0.06, 0], 20), B(0.28, 0.03, 0.03, [0, 0.15, 0], 0.004), B(0.03, 0.22, 0.03, [0, 0, 0], 0.003)),
    material: "mbt_lamp",
    mate: A([0, 0, 0]),
    instances: 2,
    indexed: true,
    instance_layout: "mbt.hull.headlight",
  });
  add({
    id: `${P}tow_hook`,
    name_cn: "拖钩 ×2",
    name_en: "tow hook",
    assembly: "hull_structure",
    build_layer: 4,
    build_order: 414,
    geometry: MERGE(B(0.2, 0.18, 0.12, [0, 0, 0], 0.008), B(0.08, 0.12, 0.06, [0, -0.08, 0.06], 0.005)),
    material: "mbt_steel",
    mate: A([0, 0, 0]),
    instances: 2,
    indexed: true,
    instance_layout: "mbt.hull.towHook",
  });
  add({
    id: `${P}lifting_eye`,
    name_cn: "车体吊装耳 ×6",
    name_en: "hull lifting eye",
    assembly: "hull_structure",
    build_layer: 4,
    build_order: 415,
    geometry: MERGE(B(0.18, 0.03, 0.07, [0, 0, 0], 0.005), B(0.05, 0.1, 0.05, [0, -0.05, 0], 0.003)),
    material: "mbt_steel",
    mate: A([0, 0, 0]),
    instances: 6,
    indexed: true,
    instance_layout: "mbt.hull.liftingEyes",
  });
  add({
    id: `${P}fuel_cap`,
    name_cn: "燃油加注口 ×2",
    name_en: "fuel filler cap",
    assembly: "hull_structure",
    build_layer: 4,
    build_order: 416,
    geometry: MERGE(C(0.12, 0.05, [0, 0, 0], 20), C(0.08, 0.03, [0, 0.035, 0], 16)),
    material: "mbt_steel",
    mate: A([0, 0, 0]),
    instances: 2,
    indexed: true,
    instance_layout: "mbt.hull.fuelCap",
  });
  add({
    id: `${P}torsion_cover`,
    name_cn: "扭杆端盖 ×14",
    name_en: "torsion bar cover",
    assembly: "hull_structure",
    build_layer: 4,
    build_order: 417,
    geometry: MERGE(C(0.09, 0.04, [0, 0, 0], 18), C(0.04, 0.05, [0, 0, 0], 12)),
    material: "mbt_cast_dark",
    mate: A([0, 0, 0]),
    instances: 14,
    indexed: true,
    instance_layout: "mbt.hull.torsion",
  });
  add({
    id: `${P}bulkhead_front`,
    name_cn: "前隔板",
    name_en: "front bulkhead",
    assembly: "hull_structure",
    build_layer: 4,
    build_order: 418,
    geometry: MERGE(B(2.5, 1.1, 0.06, [0, 0, 0], 0.008), B(0.8, 0.7, 0.03, [0.5, 0, 0.04], 0.004)),
    material: "mbt_paint_dark",
    mate: A([0, 1.16, 1.35]),
  });
  add({
    id: `${P}bulkhead_engine`,
    name_cn: "动力舱隔板",
    name_en: "engine bulkhead",
    assembly: "hull_structure",
    build_layer: 4,
    build_order: 419,
    geometry: MERGE(B(2.5, 1.1, 0.06, [0, 0, 0], 0.008), B(0.6, 0.5, 0.03, [0, 0.1, 0.04], 0.004)),
    material: "mbt_paint_dark",
    mate: A([0, 1.16, -1.62]),
  });
  add({
    id: `${P}weld_seam`,
    name_cn: "焊缝 ×18",
    name_en: "weld seam",
    assembly: "hull_structure",
    build_layer: 5,
    build_order: 600,
    geometry: { type: "kit", kit: "weldSeam", params: { len: 1.2, r: 0.012 } },
    material: "mbt_steel_dark",
    mate: A([0, 0, 0]),
    instances: 18,
    indexed: true,
    instance_layout: "mbt.hull.welds",
  });
  add({
    id: `${P}step`,
    name_cn: "车体踏步 ×4",
    name_en: "hull step",
    assembly: "hull_structure",
    build_layer: 5,
    build_order: 601,
    geometry: MERGE(B(0.36, 0.04, 0.18, [0, 0, 0], 0.004), B(0.03, 0.2, 0.18, [0, -0.1, 0], 0.003)),
    material: "mbt_steel_dark",
    mate: A([0, 0, 0]),
    instances: 4,
    indexed: true,
    instance_layout: "mbt.hull.steps",
  });

  // ================= 复合装甲分层 =================
  add({
    id: `${P}armor_glacis_outer`,
    name_cn: "首上复合装甲：外层钢面板",
    name_en: "glacis composite outer steel",
    assembly: "composite_armor",
    build_layer: 4,
    build_order: 430,
    geometry: { type: "kit", kit: "compositePlate", params: { w: 2.52, h: 1.14, outer: 0.04, ceramic: 0.07, backing: 0.04, gap: 0.012 } },
    material: "mbt_paint",
    mate: A(plus([0, 1.38, 2.55], rotated([33, 0, 0], [0, 0, 0.11])), [33, 0, 0]),
    source: "首上复合装甲包：40mm 钢面板 + 70mm 陶瓷/复合夹层 + 12mm 间隔 + 40mm 钢背板，总厚约 160mm，倾角 33°。",
  });
  add({
    id: `${P}armor_lower_outer`,
    name_cn: "首下装甲层",
    name_en: "lower front composite layer",
    assembly: "composite_armor",
    build_layer: 4,
    build_order: 431,
    geometry: { type: "kit", kit: "compositePlate", params: { w: 2.46, h: 0.66, outer: 0.035, ceramic: 0.05, backing: 0.035, gap: 0.01 } },
    material: "mbt_paint",
    mate: A(plus([0, 0.82, 3.06], rotated([12, 0, 0], [0, 0, 0.1])), [12, 0, 0]),
  });
  for (const side of [-1, 1] as const) {
    const tag = side === 1 ? "r" : "l";
    add({
      id: `${P}armor_side_${tag}`,
      name_cn: `车体侧复合装甲（${tag === "r" ? "右" : "左"}）`,
      name_en: `hull side composite armor ${tag}`,
      assembly: "composite_armor",
      build_layer: 4,
      build_order: 432,
      geometry: { type: "kit", kit: "compositePlate", params: { w: 5.4, h: 1.0, outer: 0.035, ceramic: 0.06, backing: 0.035, gap: 0.012 } },
      material: "mbt_paint",
      mate: A([side * 1.4, 1.12, -0.1], [0, side * 90, 0]),
    });
  }
  add({
    id: `${P}armor_floor`,
    name_cn: "底甲复合层",
    name_en: "floor composite layer",
    assembly: "composite_armor",
    build_layer: 4,
    build_order: 433,
    geometry: MERGE(B(2.3, 0.04, 4.8, [0, 0, 0], 0.006), B(2.3, 0.02, 4.8, [0, -0.03, 0], 0.004)),
    material: "mbt_liner",
    mate: A([0, 0.44, -0.2]),
  });
  add({
    id: `${P}armor_roof`,
    name_cn: "顶甲复合层",
    name_en: "roof composite layer",
    assembly: "composite_armor",
    build_layer: 4,
    build_order: 434,
    geometry: MERGE(B(2.5, 0.03, 4.4, [0, 0, 0], 0.006)),
    material: "mbt_liner",
    mate: A([0, 1.70, -0.7]),
  });

  // ================= 炮塔 =================
  add({
    id: `${P}turret_cheek_outer`,
    name_cn: "炮塔前斜板（外层钢）",
    name_en: "turret cheek outer",
    assembly: "turret",
    build_layer: 4,
    build_order: 450,
    geometry: MERGE(B(1.12, 0.58, 0.045, [0, 0, 0], 0.01)),
    material: "mbt_paint",
    dual: true,
    node: "Turret",
    mate: A(TL(0.64, 2.08, 1.02), [-8, -24, 0]),
  });
  add({
    id: `${P}turret_cheek_ceramic`,
    name_cn: "炮塔前斜板（陶瓷夹层）",
    name_en: "turret cheek ceramic",
    assembly: "turret",
    build_layer: 4,
    build_order: 451,
    geometry: MERGE(B(1.06, 0.54, 0.08, [0, 0, 0], 0.008)),
    material: "mbt_ceramic",
    dual: true,
    node: "Turret",
    mate: A(TL(...plus([0.64, 2.08, 1.02], rotated([-8, -24, 0], [0, 0, 0.07])) as [number, number, number]), [-8, -24, 0]),
  });
  add({
    id: `${P}turret_cheek_backing`,
    name_cn: "炮塔前斜板（内层背板）",
    name_en: "turret cheek backing",
    assembly: "turret",
    build_layer: 4,
    build_order: 452,
    geometry: MERGE(B(1.08, 0.56, 0.04, [0, 0, 0], 0.008)),
    material: "mbt_steel_dark",
    dual: true,
    node: "Turret",
    mate: A(TL(...plus([0.64, 2.08, 1.02], rotated([-8, -24, 0], [0, 0, 0.13])) as [number, number, number]), [-8, -24, 0]),
  });
  add({
    id: `${P}turret_side`,
    name_cn: "炮塔侧板",
    name_en: "turret side",
    assembly: "turret",
    build_layer: 4,
    build_order: 453,
    geometry: MERGE(B(0.09, 0.58, 3.0, [0, 0, 0], 0.01), B(0.04, 0.1, 2.9, [0.06, -0.18, 0], 0.005)),
    material: "mbt_paint",
    dual: true,
    node: "Turret",
    mate: A(TL(1.26, 2.08, -0.1)),
  });
  add({
    id: `${P}turret_side_ceramic`,
    name_cn: "炮塔侧复合夹层",
    name_en: "turret side ceramic",
    assembly: "turret",
    build_layer: 4,
    build_order: 454,
    geometry: MERGE(B(0.06, 0.5, 2.8, [0, 0, 0], 0.008)),
    material: "mbt_ceramic",
    dual: true,
    node: "Turret",
    mate: A(TL(1.33, 2.08, -0.1)),
  });
  add({
    id: `${P}turret_rear`,
    name_cn: "炮塔尾板",
    name_en: "turret rear",
    assembly: "turret",
    build_layer: 4,
    build_order: 455,
    geometry: MERGE(B(2.4, 0.58, 0.09, [0, 0, 0], 0.01), B(0.9, 0.4, 0.06, [0, -0.05, -0.07], 0.006)),
    material: "mbt_paint",
    node: "Turret",
    mate: A(TL(0, 2.08, -1.62), [8, 0, 0]),
  });
  add({
    id: `${P}turret_rear_layer`,
    name_cn: "炮塔尾板复合层",
    name_en: "turret rear composite",
    assembly: "turret",
    build_layer: 4,
    build_order: 456,
    geometry: MERGE(B(2.32, 0.5, 0.06, [0, 0, 0], 0.006)),
    material: "mbt_ceramic",
    node: "Turret",
    mate: A(TL(0.0, 2.08, -1.71), [8, 0, 0]),
  });
  add({
    id: `${P}turret_roof`,
    name_cn: "炮塔顶甲",
    name_en: "turret roof",
    assembly: "turret",
    build_layer: 4,
    build_order: 457,
    geometry: MERGE(B(2.6, 0.08, 3.0, [0, 0, 0], 0.012), B(2.3, 0.03, 2.7, [0, 0.06, 0], 0.008)),
    material: "mbt_paint",
    node: "Turret",
    mate: A(TL(0, MBT.TURRET_ROOF, 0.02)),
  });
  add({
    id: `${P}turret_roof_layer`,
    name_cn: "炮塔顶甲复合层",
    name_en: "turret roof composite",
    assembly: "turret",
    build_layer: 4,
    build_order: 458,
    geometry: MERGE(B(2.4, 0.025, 2.8, [0, 0, 0], 0.006)),
    material: "mbt_liner",
    node: "Turret",
    mate: A(TL(0, MBT.TURRET_ROOF - 0.06, 0.02)),
  });
  add({
    id: `${P}turret_ring`,
    name_cn: "炮塔座圈",
    name_en: "turret ring",
    assembly: "turret",
    build_layer: 4,
    build_order: 459,
    geometry: MERGE(T(1.08, 0.98, 0.12, [0, 0, 0], 48), T(1.12, 1.04, 0.03, [0, 0.07, 0], 48)),
    material: "mbt_steel",
    node: "Turret",
    mate: A(TL(0, MBT.TURRET_FLOOR, 0.02)),
  });
  add({
    id: `${P}turret_floor`,
    name_cn: "炮塔地板",
    name_en: "turret floor",
    assembly: "turret",
    build_layer: 4,
    build_order: 460,
    geometry: MERGE(T(1.05, 0.85, 0.04, [0, 0, 0], 40)),
    material: "mbt_steel_dark",
    node: "Turret",
    mate: A(TL(0, 1.73, 0.02)),
  });
  add({
    id: `${P}bustle_shell`,
    name_cn: "尾舱装甲盒",
    name_en: "bustle shell",
    assembly: "turret",
    build_layer: 4,
    build_order: 461,
    geometry: MERGE(
      B(2.4, 0.03, 1.0, [0, 0.36, 0], 0.006),
      B(2.4, 0.03, 1.0, [0, -0.36, 0], 0.006),
      B(0.03, 0.72, 1.0, [-1.18, 0, 0], 0.006),
      B(0.03, 0.72, 1.0, [1.18, 0, 0], 0.006),
      B(2.4, 0.72, 0.03, [0, 0, -0.48], 0.006),
      B(2.2, 0.05, 0.8, [0, 0.36, 0], 0.008),
    ),
    material: "mbt_paint",
    node: "Turret",
    mate: A(TL(0, 2.1, -1.97)),
  });
  add({
    id: `${P}bustle_roof`,
    name_cn: "尾舱顶盖",
    name_en: "bustle roof",
    assembly: "turret",
    build_layer: 4,
    build_order: 462,
    geometry: MERGE(B(2.2, 0.06, 0.9, [0, 0, 0], 0.008)),
    material: "mbt_paint",
    node: "Turret",
    mate: A(TL(0, 2.47, -1.95)),
  });
  add({
    id: `${P}bustle_rack`,
    name_cn: "尾篮",
    name_en: "bustle rack",
    assembly: "turret",
    build_layer: 4,
    build_order: 463,
    geometry: { type: "kit", kit: "bustleRack", params: { w: 2.3, h: 0.55, d: 0.85 } },
    material: "mbt_steel",
    node: "Turret",
    mate: A(TL(0, 2.12, -2.6)),
  });
  add({
    id: `${P}turret_mantlet`,
    name_cn: "炮盾",
    name_en: "mantlet",
    assembly: "turret",
    build_layer: 4,
    build_order: 464,
    geometry: MERGE(T(0.24, 0.11, 0.44, [0, 0, 0], 32), B(0.5, 0.5, 0.12, [0, 0, -0.1], 0.008), B(0.38, 0.38, 0.08, [0, 0, -0.18], 0.006)),
    material: "mbt_paint",
    node: "Gun",
    mate: A([0, 0, 0], [90, 0, 0]),
  });
  add({
    id: `${P}turret_mantlet_layer`,
    name_cn: "炮盾复合层",
    name_en: "mantlet composite",
    assembly: "turret",
    build_layer: 4,
    build_order: 465,
    geometry: MERGE(B(0.46, 0.46, 0.06, [0, 0, 0], 0.006)),
    material: "mbt_ceramic",
    node: "Gun",
    mate: A([0, 0, -0.06]),
  });
  add({
    id: `${P}cupola`,
    name_cn: "车长指挥塔",
    name_en: "commander cupola",
    assembly: "turret",
    build_layer: 4,
    build_order: 466,
    geometry: MERGE(T(0.44, 0.31, 0.2, [0, 0, 0], 32), C(0.31, 0.06, [0, 0.13, 0], 28), T(0.36, 0.32, 0.05, [0, 0.17, 0], 28)),
    material: "mbt_paint",
    node: "Turret",
    mate: A(TL(0.55, 2.59, -0.18)),
  });
  for (let p = 0; p < 6; p++) {
    const a = (p / 6) * Math.PI * 2;
    add({
      id: `${P}cupola_periscope_${p + 1}`,
      name_cn: `车长周视镜 ${p + 1}`,
      name_en: `cupola periscope ${p + 1}`,
      assembly: "turret",
      build_layer: 4,
      build_order: 467,
      geometry: MERGE(B(0.11, 0.1, 0.06, [0, 0, 0], 0.006), B(0.08, 0.05, 0.02, [0, 0, 0.04], 0.003)),
      material: "mbt_glass",
      node: "Turret",
      mate: A(TL(0.55 + Math.cos(a) * 0.41, 2.63, -0.18 + Math.sin(a) * 0.41), [0, Math.PI / 2 - a, 0]),
    });
  }
  add({
    id: `${P}cupola_mg_mount`,
    name_cn: "车长机枪架",
    name_en: "cupola MG mount",
    assembly: "turret",
    build_layer: 4,
    build_order: 468,
    geometry: MERGE(C(0.09, 0.12, [0, 0, 0], 16), B(0.08, 0.3, 0.08, [0, 0.12, 0], 0.004), C(0.03, 0.1, [0, 0.28, 0], 12)),
    material: "mbt_steel_dark",
    node: "Turret",
    mate: A(TL(0.55, 2.73, -0.18)),
  });
  add({
    id: `${P}loader_hatch`,
    name_cn: "装填手舱盖",
    name_en: "loader hatch",
    assembly: "turret",
    build_layer: 4,
    build_order: 469,
    geometry: MERGE(C(0.27, 0.05, [0, 0, 0], 24), T(0.3, 0.27, 0.05, [0, 0, 0], 24)),
    material: "mbt_paint",
    node: "Turret",
    mate: A(TL(-0.45, 2.46, -0.95)),
  });
  add({
    id: `${P}gunner_sight`,
    name_cn: "炮长主瞄准镜（外）",
    name_en: "gunner sight housing",
    assembly: "turret",
    build_layer: 4,
    build_order: 470,
    geometry: MERGE(B(0.4, 0.28, 0.52, [0, 0, 0], 0.012), B(0.28, 0.2, 0.02, [0, 0, 0.27], 0.004), B(0.34, 0.08, 0.3, [0, -0.12, 0], 0.006)),
    material: "mbt_paint",
    node: "Turret",
    mate: A(TL(-0.68, 2.64, 0.62)),
  });
  add({
    id: `${P}citv_housing`,
    name_cn: "车长独立热像仪（外）",
    name_en: "CITV housing",
    assembly: "turret",
    build_layer: 4,
    build_order: 471,
    geometry: MERGE(B(0.3, 0.32, 0.36, [0, 0, 0], 0.014), C(0.13, 0.12, [0, 0.02, 0.06], 22), B(0.22, 0.14, 0.02, [0, 0.02, 0.24], 0.004), C(0.05, 0.16, [0, -0.16, 0], 12)),
    material: "mbt_paint",
    node: CITV_NODE,
    mate: A([0, 0, 0]),
  });
  for (const [tag, x] of [
    ["l", -1.42],
    ["r", 1.42],
  ] as const) {
    add({
      id: `${P}smoke_launcher_${tag}`,
      name_cn: `烟幕发射器（${tag === "l" ? "左" : "右"}）`,
      name_en: `smoke launcher ${tag}`,
      assembly: "turret",
      build_layer: 5,
      build_order: 610,
      geometry: { type: "kit", kit: "smokeCluster", params: { r: 0.038, len: 0.24 } },
      material: "mbt_steel_dark",
      node: "Turret",
      mate: A(TL(x, 2.14, -0.55), [0, tag === "l" ? -90 : 90, 0]),
    });
  }
  add({
    id: `${P}antenna`,
    name_cn: "电台天线 ×2",
    name_en: "antenna",
    assembly: "turret",
    build_layer: 5,
    build_order: 611,
    geometry: MERGE(C(0.05, 0.1, [0, 0, 0], 14), C(0.009, 1.1, [0, 0.6, 0], 8), T(0.04, 0.02, 0.04, [0, 0.08, 0], 12)),
    material: "mbt_steel",
    node: "Turret",
    mate: A([0, 0, 0]),
    instances: 2,
    indexed: true,
    instance_layout: "mbt.hull.antennas",
    instance_nodes: ["Turret", "Turret"],
  });
  add({
    id: `${P}stowage_box`,
    name_cn: "尾篮储物箱 ×2",
    name_en: "stowage box",
    assembly: "turret",
    build_layer: 5,
    build_order: 612,
    geometry: MERGE(B(0.8, 0.42, 0.7, [0, 0, 0], 0.012), B(0.82, 0.04, 0.72, [0, 0.23, 0], 0.006)),
    material: "mbt_canvas",
    node: "Turret",
    mate: A([0, 0, 0]),
    instances: 2,
    indexed: true,
    instance_layout: "mbt.hull.stowage",
    instance_nodes: ["Turret", "Turret"],
  });
  add({
    id: `${P}spare_track`,
    name_cn: "备用履带板 ×6",
    name_en: "spare track link",
    assembly: "turret",
    build_layer: 5,
    build_order: 613,
    geometry: MERGE(B(0.04, 0.4, 0.16, [0, 0, 0], 0.006)),
    material: "mbt_track",
    node: "Turret",
    mate: A([0, 0, 0]),
    instances: 6,
    indexed: true,
    instance_layout: "mbt.hull.spareTrack",
    instance_nodes: Array.from({ length: 6 }, () => "Turret"),
  });

  // ================= 滑膛炮 =================
  add({
    id: `${P}gun_barrel`,
    name_cn: "120mm 滑膛炮身管",
    name_en: "120 mm smoothbore barrel",
    assembly: "armament",
    build_layer: 4,
    build_order: 480,
    geometry: { type: "kit", kit: "smoothboreBarrel", params: { len: MBT.BARREL_LEN, r: MBT.GUN_BORE_R } },
    material: "mbt_steel",
    node: "GunRecoil",
    mate: A([0, 0, 0]),
    source: "120mm 滑膛炮（无膛线）：炮尾 + 身管 + 两段热护套 + 中段抽烟装置 + 炮口段。",
  });
  add({
    id: `${P}thermal_sleeve_front`,
    name_cn: "前段热护套",
    name_en: "thermal sleeve front",
    assembly: "armament",
    build_layer: 4,
    build_order: 481,
    geometry: MERGE(T(MBT.GUN_BORE_R + 0.026, MBT.GUN_BORE_R + 0.002, 1.15, [0, 0, 0], 28)),
    material: "mbt_paint_dark",
    node: "GunRecoil",
    mate: A([0, 0, 3.78], [90, 0, 0]),
  });
  add({
    id: `${P}thermal_sleeve_rear`,
    name_cn: "后段热护套",
    name_en: "thermal sleeve rear",
    assembly: "armament",
    build_layer: 4,
    build_order: 482,
    geometry: MERGE(T(MBT.GUN_BORE_R + 0.026, MBT.GUN_BORE_R + 0.002, 1.18, [0, 0, 0], 28)),
    material: "mbt_paint_dark",
    node: "GunRecoil",
    mate: A([0, 0, 1.55], [90, 0, 0]),
  });
  add({
    id: `${P}evacuator`,
    name_cn: "抽烟装置",
    name_en: "bore evacuator",
    assembly: "armament",
    build_layer: 4,
    build_order: 483,
    geometry: MERGE(T(MBT.GUN_BORE_R + 0.06, MBT.GUN_BORE_R + 0.005, 0.42, [0, 0, 0], 28), T(MBT.GUN_BORE_R + 0.05, MBT.GUN_BORE_R + 0.005, 0.03, [0, 0, 0.21], 28)),
    material: "mbt_steel_dark",
    node: "GunRecoil",
    mate: A([0, 0, 2.55], [90, 0, 0]),
  });
  add({
    id: `${P}muzzle`,
    name_cn: "炮口段",
    name_en: "muzzle end",
    assembly: "armament",
    build_layer: 4,
    build_order: 484,
    geometry: MERGE(C(MBT.GUN_BORE_R + 0.015, 0.28, [0, 0, 0], 24), C(MBT.GUN_BORE_R + 0.01, 0.04, [0, 0, 0.14], 24)),
    material: "mbt_steel_dark",
    node: "GunRecoil",
    mate: A([0, 0, MBT.BARREL_LEN - 0.14], [90, 0, 0]),
  });
  add({
    id: `${P}breech_block`,
    name_cn: "炮闩体",
    name_en: "breech block",
    assembly: "armament",
    build_layer: 4,
    build_order: 485,
    geometry: MERGE(B(0.34, 0.34, 0.16, [0, 0, 0], 0.012), C(0.05, 0.1, [0, 0.19, 0], 14), B(0.18, 0.06, 0.06, [0, 0, 0.11], 0.004)),
    material: "mbt_steel",
    node: "MBT_BreechBlock",
    mate: A([0, 0, 0]),
  });
  add({
    id: `${P}breech_ring`,
    name_cn: "炮尾环",
    name_en: "breech ring",
    assembly: "armament",
    build_layer: 4,
    build_order: 486,
    geometry: MERGE(T(0.2, 0.085, 0.3, [0, 0, 0], 28)),
    material: "mbt_steel_dark",
    node: "GunRecoil",
    mate: A([0, 0, -0.9], [90, 0, 0]),
  });
  for (const side of [-1, 1] as const) {
    add({
      id: `${P}recoil_cylinder_${side === 1 ? "r" : "l"}`,
      name_cn: `${side === 1 ? "右" : "左"}制退机`,
      name_en: `${side === 1 ? "right" : "left"} recoil brake`,
      assembly: "armament",
      build_layer: 4,
      build_order: 487,
      geometry: MERGE(C(0.055, 0.62, [0, 0, 0], 20), C(0.035, 0.18, [0, 0, -0.38], 14), T(0.06, 0.045, 0.04, [0, 0, 0.3], 20)),
      material: "mbt_steel_dark",
      node: "Gun",
      mate: A([side * 0.20, -0.18, -0.55], [90, 0, 0]),
    });
    add({
      id: `${P}recoil_rod_${side === 1 ? "r" : "l"}`,
      name_cn: `${side === 1 ? "右" : "左"}复进杆`,
      name_en: `${side === 1 ? "right" : "left"} recuperator rod`,
      assembly: "armament",
      build_layer: 4,
      build_order: 488,
      geometry: MERGE(C(0.018, 0.55, [0, 0, 0], 14), C(0.03, 0.03, [0, 0, 0.27], 12)),
      material: "mbt_steel",
      node: "Gun",
      mate: A([side * 0.2, -0.18, -0.5], [90, 0, 0]),
    });
  }
  add({
    id: `${P}recuperator`,
    name_cn: "复进机",
    name_en: "recuperator",
    assembly: "armament",
    build_layer: 4,
    build_order: 489,
    geometry: MERGE(C(0.06, 0.5, [0, 0, 0], 20), T(0.065, 0.05, 0.04, [0, 0, 0.24], 20)),
    material: "mbt_steel_dark",
    node: "Gun",
    mate: A([0, 0.22, -0.5], [90, 0, 0]),
  });
  add({
    id: `${P}cradle`,
    name_cn: "火炮摇架",
    name_en: "gun cradle",
    assembly: "armament",
    build_layer: 4,
    build_order: 490,
    geometry: MERGE(B(0.5, 0.1, 0.9, [0, 0, 0], 0.008), B(0.1, 0.36, 0.3, [0.25, -0.15, 0], 0.006), B(0.1, 0.36, 0.3, [-0.25, -0.15, 0], 0.006)),
    material: "mbt_steel_dark",
    node: "Gun",
    mate: A([0, -0.2, -0.3]),
  });
  for (const side of [-1, 1] as const) {
    add({
      id: `${P}trunnion_${side === 1 ? "r" : "l"}`,
      name_cn: `${side === 1 ? "右" : "左"}耳轴`,
      name_en: `${side === 1 ? "right" : "left"} trunnion`,
      assembly: "armament",
      build_layer: 4,
      build_order: 491,
      geometry: MERGE(C(0.05, 0.18, [0, 0, 0], 18, 0.05)),
      material: "mbt_steel",
      mate: A([side * 0.3, MBT.GUN_Y, MBT.GUN_ROOT_Z]),
    });
  }
  add({
    id: `${P}coax_body`,
    name_cn: "并列机枪",
    name_en: "coaxial machine gun",
    assembly: "armament",
    build_layer: 4,
    build_order: 492,
    geometry: MERGE(B(0.16, 0.16, 0.56, [0, 0, 0], 0.008), C(0.022, 0.5, [0, 0, 0.4], 12), C(0.05, 0.12, [0, 0.12, 0.18], 12)),
    material: "mbt_steel_dark",
    node: "Gun",
    mate: A([0.34, 0.04, 0]),
  });
  add({
    id: `${P}gunner_sight_lens`,
    name_cn: "炮长瞄准镜镜头",
    name_en: "gunner sight lens",
    assembly: "armament",
    build_layer: 4,
    build_order: 493,
    geometry: MERGE(C(0.11, 0.03, [0, 0, 0], 24), T(0.12, 0.1, 0.04, [0, 0, 0], 24)),
    material: "mbt_optic",
    node: "Turret",
    mate: A(TL(-0.68, 2.64, 0.9), [90, 0, 0]),
  });
  add({
    id: `${P}citv_lens`,
    name_cn: "车长热像仪镜头",
    name_en: "CITV lens",
    assembly: "armament",
    build_layer: 4,
    build_order: 494,
    geometry: MERGE(C(0.11, 0.03, [0, 0, 0], 24), T(0.13, 0.1, 0.05, [0, 0, 0], 24)),
    material: "mbt_thermal_lens",
    node: CITV_NODE,
    mate: A([0, 0.02, 0.28], [90, 0, 0]),
  });

  // ================= ERA 反应装甲 =================
  for (const g of ERA_GROUPS) {
    const layout = `mbt.hull.era_${g.key}`;
    const [w, h, d] = g.size;
    for (const [key, name, mat] of [
      ["casing", "外壳", "mbt_era_steel"],
      ["explosive", "钝感炸药", "mbt_explosive"],
      ["liner", "钝感夹层", "mbt_ERA"],
    ] as const) {
      add({
        id: `${P}era_${g.key}_${key}`,
        name_cn: `ERA ${g.key} ${name}`,
        name_en: `ERA ${g.key} ${key}`,
        assembly: "era",
        build_layer: 5,
        build_order: 620,
        geometry: key === "casing" ? { type: "kit", kit: "eraCasing", params: { w, h, d } } : key === "explosive" ? { type: "kit", kit: "eraExplosive", params: { w: w * 0.9, h: h * 0.82, d: d * 0.7 } } : { type: "kit", kit: "eraLiner", params: { w: w * 0.95, h: h * 0.9, d: d * 0.1 } },
        material: key === "liner" ? "mbt_steel_dark" : mat,
        node: g.node,
        mate: A([0, 0, 0]),
        instances: g.cols * g.rows,
        indexed: true,
        instance_layout: layout,
        instance_nodes: g.node ? Array.from({ length: g.cols * g.rows }, () => g.node!) : undefined,
        source: "ERA 反应装甲块：外壳 + 钝感炸药 + 背层；被击中时整块爆炸，推开来袭弹。",
      });
    }
    add({
      id: `${P}era_${g.key}_bolt`,
      name_cn: `ERA ${g.key} 安装螺栓`,
      name_en: `ERA ${g.key} bolt`,
      assembly: "era",
      build_layer: 5,
      build_order: 621,
      geometry: MERGE(C(0.012, 0.03, [0, 0, 0], 8), C(0.017, 0.006, [0, 0.018, 0], 8)),
      material: "mbt_steel",
      node: g.node,
      mate: A([0, 0, 0]),
      instances: g.cols * g.rows,
      indexed: true,
      instance_layout: layout,
      instance_nodes: g.node ? Array.from({ length: g.cols * g.rows }, () => g.node!) : undefined,
    });
  }
  add({
    id: `${P}era_rail`,
    name_cn: "ERA 安装轨 ×2",
    name_en: "ERA mounting rail",
    assembly: "era",
    build_layer: 5,
    build_order: 622,
    geometry: MERGE(B(0.06, 0.3, 2.3, [0, 0, 0], 0.004)),
    material: "mbt_steel_dark",
    mate: A([0, 0, 0]),
    instances: 2,
    indexed: true,
    instance_layout: "mbt.hull.eraRail",
  });

  // ================= 表面 / 附件 =================
  for (let i = 0; i < 24; i++) {
    add({
      id: `${P}surface_camo_${i + 1}`,
      name_cn: `三色迷彩斑块 ${i + 1}`,
      name_en: `camo patch ${i + 1}`,
      assembly: "surface",
      build_layer: 5,
      build_order: 630,
      geometry: { type: "kit", kit: "camoPatch", params: { w: 0.6 + (i % 3) * 0.2, h: 0.35 + (i % 4) * 0.1 } },
      material: i % 2 === 0 ? "mbt_mud" : "mbt_paint_dark",
      mate: A([0, 0, 0]),
    });
  }
  for (let i = 0; i < 8; i++) {
    add({
      id: `${P}surface_tool_${i + 1}`,
      name_cn: `随车工具 ${i + 1}`,
      name_en: `onboard tool ${i + 1}`,
      assembly: "surface",
      build_layer: 5,
      build_order: 631,
      geometry: MERGE(B(0.06, 0.04, 0.6 + (i % 3) * 0.2, [0, 0, 0], 0.006), C(0.03, 0.06, [0, 0, 0.3], 10)),
      material: "mbt_steel_dark",
      mate: A([0, 0, 0]),
    });
  }
  add({
    id: `${P}fuel_drum_l`,
    name_cn: "车尾油桶（左）",
    name_en: "fuel drum left",
    assembly: "surface",
    build_layer: 5,
    build_order: 632,
    geometry: { type: "kit", kit: "fuelDrum", params: { r: 0.3, h: 0.8 } },
    material: "mbt_paint_dark",
    mate: A([-0.55, 1.38, -3.45], [-10, 0, 0]),
  });
  add({
    id: `${P}fuel_drum_r`,
    name_cn: "车尾油桶（右）",
    name_en: "fuel drum right",
    assembly: "surface",
    build_layer: 5,
    build_order: 633,
    geometry: { type: "kit", kit: "fuelDrum", params: { r: 0.3, h: 0.8 } },
    material: "mbt_paint_dark",
    mate: A([0.55, 1.38, -3.45], [-10, 0, 0]),
  });
  add({
    id: `${P}tow_cable`,
    name_cn: "拖车缆绳",
    name_en: "tow cable",
    assembly: "surface",
    build_layer: 5,
    build_order: 634,
    geometry: MERGE(C(0.03, 2.2, [0, 0, 0], 12), C(0.03, 0.3, [0, 0, 0], 12)),
    material: "mbt_steel_dark",
    mate: A([1.2, 1.55, -2.5], [0, 0, 90]),
  });
  add({
    id: `${P}surface_number`,
    name_cn: "战术编号（3 位）",
    name_en: "tactical number",
    assembly: "surface",
    build_layer: 5,
    build_order: 635,
    geometry: MERGE(B(0.42, 0.22, 0.01, [0, 0, 0], 0.002)),
    material: "mbt_mark",
    mate: A([1.27, 2.15, 0.55], [0, 90, 0]),
  });
  add({
    id: `${P}surface_insignia`,
    name_cn: "部队徽记 ×2",
    name_en: "unit insignia",
    assembly: "surface",
    build_layer: 5,
    build_order: 636,
    geometry: MERGE(C(0.12, 0.01, [0, 0, 0], 24), C(0.08, 0.012, [0, 0, 0], 20)),
    material: "mbt_mark_red",
    mate: A([0, 0, 0]),
    instances: 2,
    indexed: true,
    instance_layout: "mbt.hull.insignia",
  });
  add({
    id: `${P}surface_mud`,
    name_cn: "泥污块 ×18",
    name_en: "mud clod",
    assembly: "surface",
    build_layer: 5,
    build_order: 637,
    geometry: MERGE({ type: "sphere", r: 0.07, segments: 10 }, { type: "sphere", r: 0.045, segments: 8, at: [0.06, 0.02, 0.03] }),
    material: "mbt_mud",
    mate: A([0, 0, 0]),
    instances: 18,
    indexed: true,
    instance_layout: "mbt.hull.mud",
  });
  add({
    id: `${P}surface_wear`,
    name_cn: "磨损露漆 ×12",
    name_en: "paint wear patch",
    assembly: "surface",
    build_layer: 5,
    build_order: 638,
    geometry: MERGE(B(0.24, 0.12, 0.008, [0, 0, 0], 0.004)),
    material: "mbt_steel_dark",
    mate: A([0, 0, 0]),
    instances: 12,
    indexed: true,
    instance_layout: "mbt.hull.wear",
  });
  add({
    id: `${P}surface_antislip`,
    name_cn: "防滑条 ×16",
    name_en: "anti-slip strip",
    assembly: "surface",
    build_layer: 5,
    build_order: 639,
    geometry: MERGE(B(0.5, 0.008, 0.05, [0, 0, 0], 0.002)),
    material: "mbt_steel_dark",
    mate: A([0, 0, 0]),
    instances: 16,
    indexed: true,
    instance_layout: "mbt.hull.antislip",
  });
  add({
    id: `${P}surface_handle`,
    name_cn: "扶手 ×10",
    name_en: "handrail",
    assembly: "surface",
    build_layer: 5,
    build_order: 640,
    geometry: MERGE(C(0.016, 0.34, [0, 0, 0], 10), C(0.016, 0.08, [0, 0.15, 0.05], 8)),
    material: "mbt_steel",
    mate: A([0, 0, 0]),
    instances: 10,
    indexed: true,
    instance_layout: "mbt.hull.handles",
  });
  add({
    id: `${P}surface_tarp`,
    name_cn: "帆布捆 ×2",
    name_en: "tarp bundle",
    assembly: "surface",
    build_layer: 5,
    build_order: 641,
    geometry: MERGE(C(0.16, 0.9, [0, 0, 0], 16), T(0.17, 0.15, 0.03, [0, 0.3, 0], 16), T(0.17, 0.15, 0.03, [0, -0.3, 0], 16)),
    material: "mbt_canvas",
    node: "Turret",
    mate: A([0, 0, 0]),
    instances: 2,
    indexed: true,
    instance_layout: "mbt.hull.tarps",
    instance_nodes: ["Turret", "Turret"],
  });

  return parts;
}

const CONTACTS: ExpectedContactRule[] = [
  {
    family: "hull-armor",
    a: `${P}*`,
    b: `${P}*`,
    reason: "车体/炮塔/复合装甲/ERA/表面件互相贴合与叠层（钢板叠焊、ERA 压条、附件螺栓固定）",
    maxDepthMm: 90,
    allowDisplaced: true,
    allowSuspect: true,
  },
];

export function makeHullRegistry(): ModelRegistry {
  return {
    model: "mbt90",
    title: "MBT-90 外壳与武器",
    constants: { ...MBT },
    assemblies: [
      { id: "hull_structure", name_cn: "车体结构", name_en: "hull structure", explode: [0, 0.4, -0.8] },
      { id: "composite_armor", name_cn: "复合装甲", name_en: "composite armor", explode: [0, 0.9, 0.4] },
      { id: "turret", name_cn: "炮塔", name_en: "turret", explode: [0, 1.6, 0] },
      { id: "armament", name_cn: "武器", name_en: "armament", explode: [0, 1.8, 0.4] },
      { id: "era", name_cn: "反应装甲", name_en: "ERA", explode: [0, 1.2, 0.8] },
      { id: "surface", name_cn: "表面与附件", name_en: "surface & accessories", explode: [0, 0.8, -0.4] },
    ],
    nodes: HULL_NODES,
    materials: MBT_MATERIALS,
    parts: buildParts(),
    source_notes:
      "现代主战坦克外壳：首上 33° 大倾角、楔形炮塔（±24° 前斜板）、复合装甲分层（钢/陶瓷/间隔/背板）、90 块 ERA（每块外壳+炸药+夹层）。" +
      "120mm 滑膛炮：无膛线身管、两段热护套、中段抽烟装置、炮闩/制退机/复进机/摇臂；三色迷彩、战术编号、随车工具、油桶、缆绳。",
    expectedContacts: CONTACTS,
  };
}
