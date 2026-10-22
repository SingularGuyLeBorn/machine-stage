import * as THREE from "three";
import type { InstanceLayout } from "../../../assembler/assembler";
import type { ExpectedContactRule, GeometrySpec, ModelRegistry, NodeDef, PartDefinition } from "../../../registry/types";
import { MBT } from "../constants";
import { MBT_MATERIALS } from "../materials";

// ============================================================================
// models/mbt/hull/registry —— L4 外壳 / 复合装甲 / ERA / 滑膛炮 + L5 表面
//
// 车体：33.7° 浅倾角首上、复合装甲分层（钢面板 + 陶瓷 + 间隔 + 背板）、
// 外凸楔形炮塔（±26° 前斜板）、120mm 滑膛炮（热护套 + 抽烟装置）、
// 132 块 ERA（首上 20 / 炮塔前 16×2 / 炮塔侧 16×2 / 侧裙 24×2），每块三层。
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
type EraGroup = { key: string; cols: number; rows: number; base: [number, number, number]; rot: [number, number, number]; stepX: number; stepY: number; size: [number, number, number]; normal?: number; node?: string };
const ERA_GROUPS: EraGroup[] = [
  { key: "glacis", cols: 5, rows: 4, base: [0, 1.36, 2.54], rot: [MBT.GLACIS_PITCH_DEG, 0, 0], stepX: 0.5, stepY: 0.26, size: [0.44, 0.21, 0.13], normal: 0.105 },
  { key: "cheek_r", cols: 4, rows: 4, base: [0.831, 2.14, 1.147], rot: [-8, 26, 0], stepX: 0.23, stepY: 0.11, size: [0.2, 0.13, 0.12], normal: 0.12, node: "Turret" },
  { key: "cheek_l", cols: 4, rows: 4, base: [-0.831, 2.14, 1.147], rot: [-8, -26, 0], stepX: 0.23, stepY: 0.11, size: [0.2, 0.13, 0.12], normal: 0.12, node: "Turret" },
  { key: "side_r", cols: 8, rows: 2, base: [1.3, 2.12, -0.35], rot: [0, 90, 0], stepX: 0.3, stepY: 0.16, size: [0.3, 0.14, 0.12], node: "Turret" },
  { key: "side_l", cols: 8, rows: 2, base: [-1.3, 2.12, -0.35], rot: [0, -90, 0], stepX: 0.3, stepY: 0.16, size: [0.3, 0.14, 0.12], node: "Turret" },
  { key: "skirt_r", cols: 12, rows: 2, base: [1.84, 1.04, -0.2], rot: [0, 90, 0], stepX: 0.44, stepY: 0.28, size: [0.4, 0.26, 0.1] },
  { key: "skirt_l", cols: 12, rows: 2, base: [-1.84, 1.04, -0.2], rot: [0, -90, 0], stepX: 0.44, stepY: 0.28, size: [0.4, 0.26, 0.1] },
];
function eraLayout(group: EraGroup): InstanceLayout {
  return ({ index }) => {
    const col = index % group.cols;
    const row = Math.floor(index / group.cols);
    const cx = (col - (group.cols - 1) / 2) * group.stepX;
    const cy = (row - (group.rows - 1) / 2) * group.stepY;
    const local: [number, number, number] = [cx, cy, group.normal ?? 0.1];
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
    new THREE.Matrix4().makeTranslation(index === 0 ? -1.45 : 1.45, 1.36, 2.74),
  "mbt.hull.towHook": ({ index }) =>
    new THREE.Matrix4().makeTranslation(index === 0 ? -0.92 : 0.92, 0.78, 3.18),
  "mbt.hull.liftingEyes": ({ index }) => {
    const spots: [number, number, number][] = [
      [-1.2, 1.79, 1.78], [1.2, 1.79, 1.78], [-1.2, 1.79, -2.0],
      [1.2, 1.79, -2.0], [-0.95, 1.5, -3.15], [0.95, 1.5, -3.15],
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
      [-0.9, 1.72, -2.4, 0], [0.9, 1.72, -2.4, 0], [0, 1.72, -3.0, 90],
      [-1.25, 1.75, 2.05, 90], [1.25, 1.75, 2.05, 90], [0, 1.8, -2.9, 0],
    ];
    const [x, y, z, yaw] = spots[index] ?? spots[0]!;
    return new THREE.Matrix4().makeRotationY((yaw * Math.PI) / 180).setPosition(x, y, z);
  },
  "mbt.hull.weldsTurret": ({ index }) => {
    const spots: [number, number, number, number][] = [
      [-1.315, 2.3, 0.3, 90], [1.315, 2.3, 0.3, 90],
      [-1.315, 2.3, -1.3, 90], [1.315, 2.3, -1.3, 90],
      [0, 2.505, 0.6, 0], [0, 2.505, -0.9, 0],
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
    new THREE.Matrix4().makeTranslation(index === 0 ? -1.35 : 1.35, 2.12, -0.45),
  "mbt.hull.insignia": ({ index }) => {
    const side = index === 0 ? 1 : -1;
    const m = new THREE.Matrix4().makeRotationZ(side * -Math.PI / 2);
    m.setPosition(side * 1.315, 2.2, 0.3);
    return m;
  },
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
  "mbt.hull.handles": ({ index }) => {
    const spots: [number, number, number][] = [
      [-1.36, 1.45, 1.0], [1.36, 1.45, 1.0], [-1.36, 1.45, -0.2], [1.36, 1.45, -0.2],
      [-1.36, 1.45, -1.4], [1.36, 1.45, -1.4], [-1.36, 1.45, 2.4], [1.36, 1.45, 2.4],
      [-1.36, 1.45, -2.6], [1.36, 1.45, -2.6],
    ];
    const [x, y, z] = spots[index] ?? spots[0]!;
    return new THREE.Matrix4().makeTranslation(x, y, z);
  },
  "mbt.hull.tarps": ({ index }) =>
    new THREE.Matrix4().makeRotationZ(Math.PI / 2).setPosition(0, 2.42, -2.72 - index * 0.26),
  "mbt.hull.antennas": ({ index }) =>
    new THREE.Matrix4().makeTranslation(index === 0 ? -1.0 : 1.0, 2.55, -1.4 - MBT.TURRET_Z),
  "mbt.hull.stowage": ({ index }) =>
    new THREE.Matrix4().makeTranslation(index === 0 ? -0.55 : 0.55, 2.05, -2.82),
  "mbt.hull.spareTrack": ({ index }) =>
    new THREE.Matrix4().makeTranslation(1.33, 2.02, -0.75 + index * 0.18 - MBT.TURRET_Z),
};
Object.assign(HULL_LAYOUTS, SURFACE_LAYOUTS);

const HULL_NODES: NodeDef[] = [
  { name: "Turret", parent: "root", pivot: [0, 0, MBT.TURRET_Z], motion: "rotate", axis: "y", note: "炮塔回转（座圈中心 z=0.1）" },
  { name: "Gun", parent: "Turret", pivot: [0, MBT.GUN_Y, MBT.GUN_ROOT_Z - MBT.TURRET_Z], motion: "rotate", axis: "x", note: "火炮俯仰（耳轴 y=2.10,z=1.62）" },
  { name: "GunRecoil", parent: "Gun", pivot: [0, 0, 0], motion: "translate", axis: "z", note: "后坐（-Z）" },
  { name: "MBT_BreechBlock", parent: "GunRecoil", pivot: [0, 0, -0.92], motion: "translate", axis: "y", note: "炮闩开闭（向下）" },
  {
    name: "MBT_DriverHatch",
    parent: "root",
    pivot: [-0.68, 1.792, 1.55],
    motion: "rotate",
    axis: "x",
    note: "驾驶员舱盖后铰链（0=闭合；负角前缘抬起）",
  },
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
    geometry: MERGE(B(2.56, 1.28, 0.08, [0, 0, 0], 0.012), B(2.5, 0.08, 0.05, [0, 0.53, 0], 0.005)),
    material: "mbt_paint",
    mate: A([0, 1.36, 2.54], [MBT.GLACIS_PITCH_DEG, 0, 0]),
  });
  add({
    id: `${P}lower_front`,
    name_cn: "首下装甲",
    name_en: "lower front plate",
    assembly: "hull_structure",
    build_layer: 4,
    build_order: 405,
    geometry: MERGE(B(2.5, 0.6, 0.07, [0, 0, 0], 0.01)),
    material: "mbt_paint",
    mate: A([0, 0.77, 3.13], [-10, 0, 0]),
  });
  add({
    id: `${P}rear_plate`,
    name_cn: "尾甲板（全高封闭）",
    name_en: "rear plate",
    assembly: "hull_structure",
    build_layer: 4,
    build_order: 406,
    geometry: MERGE(
      B(2.72, 1.36, 0.08, [0, 0, 0], 0.01),
      // 顶封板：接到动力舱甲板后缘，封住倾斜尾板上方的楔形开口。
      B(2.7, 0.04, 0.26, [0, 0.64, 0.12], 0.006),
      // 两侧回折板：加宽到包住侧甲外缘，并向后延伸到侧甲末端，封死角缝。
      B(0.12, 1.36, 0.34, [-1.31, 0, 0.13], 0.006),
      B(0.12, 1.36, 0.34, [1.31, 0, 0.13], 0.006),
      // 底封板：封住尾板与底甲/侧甲的下角缝。
      B(2.7, 0.06, 0.34, [0, -0.65, 0.13], 0.006),
      B(0.7, 0.4, 0.05, [0.5, 0.1, -0.07], 0.006),
      B(0.7, 0.4, 0.05, [-0.5, 0.1, -0.07], 0.006),
    ),
    material: "mbt_paint",
    mate: A([0, 1.15, MBT.HULL_Z_REAR]),
  });
  add({
    id: `${P}front_deck`,
    name_cn: "前甲板",
    name_en: "front deck",
    assembly: "hull_structure",
    build_layer: 4,
    build_order: 407,
    geometry: MERGE(B(2.66, 0.08, 2.2, [0, 0, 0.1], 0.01), B(2.5, 0.03, 2.04, [0, 0.055, 0.15], 0.006)),
    material: "mbt_paint",
    mate: A([0, MBT.HULL_DECK, 1.0]),
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
    geometry: MERGE(C(0.29, 0.02, [0, 0, 0], 24, 0.29), T(0.31, 0.28, 0.015, [0, 0, 0], 24), C(0.06, 0.008, [0, 0.016, 0], 16)),
    material: "mbt_paint",
    node: "MBT_DriverHatch",
    mate: A([0, 0.01, 0.31]),
  });
  for (let p = 0; p < 3; p++) {
    add({
      id: `${P}driver_periscope_${p + 1}`,
      name_cn: `驾驶员潜望镜 ${p + 1}`,
      name_en: `driver periscope ${p + 1}`,
      assembly: "hull_structure",
      build_layer: 4,
      build_order: 412,
      geometry: MERGE(B(0.15, 0.02, 0.08, [0, 0, 0], 0.003), B(0.12, 0.008, 0.01, [0, 0.004, 0.045], 0.002), B(0.1, 0.012, 0.03, [0, 0, -0.05], 0.002)),
      material: "mbt_glass",
      node: "MBT_DriverHatch",
      mate: A([-0.2 + p * 0.17, 0.02, 0.47]),
    });
  }
  add({
    id: `${P}headlight`,
    name_cn: "前大灯 ×2",
    name_en: "headlight",
    assembly: "hull_structure",
    build_layer: 4,
    build_order: 413,
    geometry: { type: "kit", kit: "headlight", params: { r: 0.105, len: 0.16 } },
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
    name_cn: "焊缝 ×12",
    name_en: "weld seam",
    assembly: "hull_structure",
    build_layer: 5,
    build_order: 600,
    geometry: { type: "kit", kit: "weldSeam", params: { len: 1.2, r: 0.012 } },
    material: "mbt_steel_dark",
    mate: A([0, 0, 0]),
    instances: 12,
    indexed: true,
    instance_layout: "mbt.hull.welds",
  });
  add({
    id: `${P}weld_seam_turret`,
    name_cn: "炮塔焊缝 ×6",
    name_en: "turret weld seam",
    assembly: "turret",
    build_layer: 5,
    build_order: 600,
    geometry: { type: "kit", kit: "weldSeam", params: { len: 1.2, r: 0.012 } },
    material: "mbt_steel_dark",
    node: "Turret",
    mate: A([0, 0, 0]),
    instances: 6,
    indexed: true,
    instance_layout: "mbt.hull.weldsTurret",
    instance_nodes: Array.from({ length: 6 }, () => "Turret"),
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
    geometry: { type: "kit", kit: "compositePlate", params: { w: 2.52, h: 1.22, outer: 0.04, ceramic: 0.07, backing: 0.04, gap: 0.012 } },
    material: "mbt_paint",
    mate: A(plus([0, 1.36, 2.54], rotated([MBT.GLACIS_PITCH_DEG, 0, 0], [0, 0, -0.12])), [MBT.GLACIS_PITCH_DEG, 0, 0]),
    source: "首上复合装甲包：40mm 钢面板 + 70mm 陶瓷/复合夹层 + 12mm 间隔 + 40mm 钢背板，总厚约 160mm；基甲板面与水平面成 33.7°，板顶后倾。",
  });
  add({
    id: `${P}armor_lower_outer`,
    name_cn: "首下装甲层",
    name_en: "lower front composite layer",
    assembly: "composite_armor",
    build_layer: 4,
    build_order: 431,
    geometry: { type: "kit", kit: "compositePlate", params: { w: 2.46, h: 0.56, outer: 0.035, ceramic: 0.05, backing: 0.035, gap: 0.01 } },
    material: "mbt_paint",
    mate: A(plus([0, 0.77, 3.13], rotated([-10, 0, 0], [0, 0, -0.1])), [-10, 0, 0]),
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
    geometry: MERGE(B(1.0, 0.5, 0.045, [0, 0, 0], 0.01)),
    material: "mbt_paint",
    dual: true,
    node: "Turret",
    mate: A(TL(0.88, 2.12, 1.25), [-8, 26, 0]),
  });
  add({
    id: `${P}turret_cheek_ceramic`,
    name_cn: "炮塔前斜板（陶瓷夹层）",
    name_en: "turret cheek ceramic",
    assembly: "turret",
    build_layer: 4,
    build_order: 451,
    geometry: MERGE(B(0.96, 0.46, 0.08, [0, 0, 0], 0.008)),
    material: "mbt_ceramic",
    dual: true,
    node: "Turret",
    mate: A(TL(...plus([0.88, 2.12, 1.25], rotated([-8, 26, 0], [0, 0, -0.075])) as [number, number, number]), [-8, 26, 0]),
  });
  add({
    id: `${P}turret_cheek_backing`,
    name_cn: "炮塔前斜板（内层背板）",
    name_en: "turret cheek backing",
    assembly: "turret",
    build_layer: 4,
    build_order: 452,
    geometry: MERGE(B(0.98, 0.48, 0.04, [0, 0, 0], 0.008)),
    material: "mbt_steel_dark",
    dual: true,
    node: "Turret",
    mate: A(TL(...plus([0.88, 2.12, 1.25], rotated([-8, 26, 0], [0, 0, -0.14])) as [number, number, number]), [-8, 26, 0]),
  });
  add({
    id: `${P}turret_side`,
    name_cn: "炮塔侧板",
    name_en: "turret side",
    assembly: "turret",
    build_layer: 4,
    build_order: 453,
    geometry: MERGE(B(0.09, 0.58, 2.5, [0, 0, 0], 0.01), B(0.04, 0.1, 2.4, [0.06, -0.18, -0.03], 0.005)),
    material: "mbt_paint",
    dual: true,
    node: "Turret",
    mate: A(TL(1.26, 2.08, -0.37)),
  });
  add({
    id: `${P}turret_side_ceramic`,
    name_cn: "炮塔侧复合夹层",
    name_en: "turret side ceramic",
    assembly: "turret",
    build_layer: 4,
    build_order: 454,
    geometry: MERGE(B(0.06, 0.5, 2.3, [0, 0, 0], 0.008)),
    material: "mbt_ceramic",
    dual: true,
    node: "Turret",
    mate: A(TL(1.33, 2.08, -0.37)),
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
      B(2.4, 0.03, 1.0, [0, 0.27, 0], 0.006),
      B(2.4, 0.03, 1.0, [0, -0.27, 0], 0.006),
      B(0.03, 0.54, 1.0, [-1.18, 0, 0], 0.006),
      B(0.03, 0.54, 1.0, [1.18, 0, 0], 0.006),
      B(2.4, 0.54, 0.03, [0, 0, -0.48], 0.006),
      B(2.2, 0.05, 0.8, [0, 0.27, 0], 0.008),
    ),
    material: "mbt_paint",
    node: "Turret",
    mate: A(TL(0, 2.19, -1.97)),
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
    mate: A(TL(0, 2.16, -2.6)),
  });
  add({
    id: `${P}turret_mantlet`,
    name_cn: "炮盾",
    name_en: "mantlet",
    assembly: "turret",
    build_layer: 4,
    build_order: 464,
    geometry: { type: "kit", kit: "mantlet", params: { w: 0.68, h: 0.48, d: 0.26, bore: 0.17 } },
    material: "mbt_paint",
    node: "Gun",
    mate: A([0, 0, -0.02]),
  });
  add({
    id: `${P}turret_mantlet_layer`,
    name_cn: "炮盾复合层",
    name_en: "mantlet composite",
    assembly: "turret",
    build_layer: 4,
    build_order: 465,
    geometry: MERGE(
      B(0.19, 0.48, 0.06, [-0.185, 0, 0], 0.006),
      B(0.19, 0.48, 0.06, [0.185, 0, 0], 0.006),
      B(0.18, 0.15, 0.06, [0, 0.165, 0], 0.006),
      B(0.18, 0.15, 0.06, [0, -0.165, 0], 0.006),
    ),
    material: "mbt_ceramic",
    node: "Gun",
    mate: A([0, 0, -0.17]),
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
  // 车长 M2HB 12.7mm 重机枪：架在现有枪架顶部的枢轴上，随炮塔回转。
  add({
    id: `${P}cupola_mg_cradle`,
    name_cn: "车长机枪轭架/高低机",
    name_en: "cupola MG cradle & elevation gear",
    assembly: "turret",
    build_layer: 4,
    build_order: 469,
    geometry: { type: "kit", kit: "cupolaM2Cradle" },
    material: "mbt_steel_dark",
    node: "Turret",
    mate: A(TL(0.55, 3.02, -0.18)),
  });
  add({
    id: `${P}cupola_mg_receiver`,
    name_cn: "车长机枪机匣",
    name_en: "cupola MG receiver",
    assembly: "turret",
    build_layer: 4,
    build_order: 469,
    geometry: { type: "kit", kit: "cupolaM2Receiver" },
    material: "mbt_steel_dark",
    node: "Turret",
    mate: A(TL(0.55, 3.16, -0.04)),
  });
  add({
    id: `${P}cupola_mg_barrel`,
    name_cn: "车长机枪重枪管",
    name_en: "cupola MG heavy barrel",
    assembly: "turret",
    build_layer: 4,
    build_order: 469,
    geometry: { type: "kit", kit: "cupolaM2Barrel" },
    material: "mbt_steel",
    node: "Turret",
    mate: A(TL(0.55, 3.16, 0.19)),
  });
  add({
    id: `${P}cupola_mg_grips`,
    name_cn: "车长机枪双握把/扳机",
    name_en: "cupola MG spade grips",
    assembly: "turret",
    build_layer: 4,
    build_order: 469,
    geometry: { type: "kit", kit: "cupolaM2Grips" },
    material: "mbt_steel_dark",
    node: "Turret",
    mate: A(TL(0.55, 3.14, -0.33)),
  });
  add({
    id: `${P}cupola_mg_ammo_box`,
    name_cn: "车长机枪弹箱",
    name_en: "cupola MG ammo box",
    assembly: "turret",
    build_layer: 4,
    build_order: 469,
    geometry: { type: "kit", kit: "cupolaM2AmmoBox" },
    material: "mbt_paint_dark",
    node: "Turret",
    mate: A(TL(0.73, 2.98, -0.06)),
  });
  add({
    id: `${P}cupola_mg_belt`,
    name_cn: "车长机枪弹链",
    name_en: "cupola MG ammo belt",
    assembly: "turret",
    build_layer: 4,
    build_order: 469,
    geometry: { type: "kit", kit: "cupolaM2Belt" },
    material: "mbt_brass",
    node: "Turret",
    mate: A(TL(0.62, 3.25, -0.09)),
  });
  add({
    id: `${P}cupola_mg_rear_sight`,
    name_cn: "车长机枪照门",
    name_en: "cupola MG rear sight",
    assembly: "turret",
    build_layer: 4,
    build_order: 469,
    geometry: MERGE(
      B(0.06, 0.03, 0.06, [0, 0.015, 0], 0.002),
      B(0.008, 0.07, 0.008, [-0.03, 0.06, 0], 0.001),
      B(0.008, 0.07, 0.008, [0.03, 0.06, 0], 0.001),
      B(0.068, 0.012, 0.012, [0, 0.095, 0], 0.001),
    ),
    material: "mbt_steel_dark",
    node: "Turret",
    mate: A(TL(0.55, 3.26, -0.24)),
  });
  add({
    id: `${P}cupola_mg_spent_bag`,
    name_cn: "车长机枪抛壳袋",
    name_en: "cupola MG spent case bag",
    assembly: "turret",
    build_layer: 4,
    build_order: 469,
    geometry: MERGE(B(0.14, 0.18, 0.16, [0, 0, 0], 0.02), B(0.03, 0.04, 0.08, [0, 0.11, -0.05], 0.005)),
    material: "mbt_canvas",
    node: "Turret",
    mate: A(TL(0.43, 3.0, -0.06)),
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
    mate: A(TL(-0.45, 2.56, -0.95)),
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
    ["l", -0.92],
    ["r", 0.92],
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
      mate: A(TL(x, 2.785, 1.1), [-8, tag === "l" ? -25 : 25, 0]),
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
    geometry: MERGE(B(0.8, 0.42, 0.5, [0, 0, 0], 0.012), B(0.82, 0.04, 0.52, [0, 0.23, 0], 0.006)),
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
    geometry: MERGE(T(MBT.GUN_BORE_R + 0.06, MBT.GUN_BORE_R + 0.005, 0.42, [0, 0, 0], 28), T(MBT.GUN_BORE_R + 0.05, MBT.GUN_BORE_R + 0.005, 0.03, [0, 0.21, 0], 28)),
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
    geometry: MERGE(C(MBT.GUN_BORE_R + 0.015, 0.28, [0, 0, 0], 24), C(MBT.GUN_BORE_R + 0.01, 0.04, [0, 0.14, 0], 24)),
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
    geometry: MERGE(B(0.34, 0.34, 0.16, [0, 0, 0], 0.012), C(0.05, 0.05, [0, 0.16, 0], 14), B(0.18, 0.06, 0.06, [0, 0, 0.11], 0.004)),
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
    geometry: MERGE(T(0.18, 0.085, 0.3, [0, 0, 0], 28)),
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
      geometry: MERGE(C(0.055, 0.62, [0, 0, 0], 20), C(0.035, 0.18, [0, -0.38, 0], 14), T(0.06, 0.045, 0.04, [0, 0.3, 0], 20)),
      material: "mbt_steel_dark",
      node: "Gun",
      mate: A([side * 0.20, -0.08, -0.55], [90, 0, 0]),
    });
    add({
      id: `${P}recoil_rod_${side === 1 ? "r" : "l"}`,
      name_cn: `${side === 1 ? "右" : "左"}复进杆`,
      name_en: `${side === 1 ? "right" : "left"} recuperator rod`,
      assembly: "armament",
      build_layer: 4,
      build_order: 488,
      geometry: MERGE(C(0.018, 0.55, [0, 0, 0], 14), C(0.03, 0.03, [0, 0.27, 0], 12)),
      material: "mbt_steel",
      node: "Gun",
      mate: A([side * 0.2, -0.08, -0.5], [90, 0, 0]),
    });
  }
  add({
    id: `${P}recuperator`,
    name_cn: "复进机",
    name_en: "recuperator",
    assembly: "armament",
    build_layer: 4,
    build_order: 489,
    geometry: MERGE(C(0.06, 0.5, [0, 0, 0], 20), T(0.065, 0.05, 0.04, [0, 0.24, 0], 20)),
    material: "mbt_steel_dark",
    node: "Gun",
    mate: A([0, 0.14, -0.5], [90, 0, 0]),
  });
  add({
    id: `${P}cradle`,
    name_cn: "火炮摇架",
    name_en: "gun cradle",
    assembly: "armament",
    build_layer: 4,
    build_order: 490,
    geometry: MERGE(B(0.5, 0.08, 0.9, [0, -0.02, 0], 0.008), B(0.1, 0.24, 0.3, [0.25, 0, 0], 0.006), B(0.1, 0.24, 0.3, [-0.25, 0, 0], 0.006)),
    material: "mbt_steel_dark",
    node: "Gun",
    mate: A([0, -0.11, -0.3]),
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
      node: "Gun",
      mate: A([side * 0.3, 0, 0]),
    });
  }
  add({
    id: `${P}coax_body`,
    name_cn: "并列机枪",
    name_en: "coaxial machine gun",
    assembly: "armament",
    build_layer: 4,
    build_order: 492,
    geometry: MERGE(B(0.12, 0.12, 0.22, [0, 0, 0], 0.006), B(0.026, 0.026, 0.5, [0, 0, 0.35], 0.004), B(0.05, 0.05, 0.06, [0, 0.06, 0.12], 0.003)),
    material: "mbt_steel_dark",
    node: "Gun",
    mate: A([0.28, 0.04, -0.3]),
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
  // 每块是盒式夹层：壳体框架 → 背板/钝感夹层 → 钝感炸药 → 前飞板 → 可拆前盖 → 螺栓。
  // 零件级 explode 让爆炸视图沿各自法线分层展开，而不是整块一起平移。
  const eraLayers = [
    { key: "casing", name: "壳体框架", material: "mbt_era_steel", kit: "eraCasing", distance: 0.1 },
    { key: "liner", name: "背板/钝感夹层", material: "mbt_steel_dark", kit: "eraLiner", distance: 0.14 },
    { key: "explosive", name: "钝感炸药", material: "mbt_explosive", kit: "eraExplosive", distance: 0.2 },
    { key: "flyer", name: "前飞板", material: "mbt_steel", kit: "eraFlyer", distance: 0.26 },
    { key: "cover", name: "可拆前盖", material: "mbt_era_steel", kit: "eraCover", distance: 0.32 },
  ] as const;
  for (const g of ERA_GROUPS) {
    const layout = `mbt.hull.era_${g.key}`;
    const [w, h, d] = g.size;
    const explodeDir = rotated(g.rot, [0, 0, 1]);
    for (const layer of eraLayers) {
      add({
        id: `${P}era_${g.key}_${layer.key}`,
        name_cn: `ERA ${g.key} ${layer.name}`,
        name_en: `ERA ${g.key} ${layer.key}`,
        assembly: "era",
        build_layer: 5,
        build_order: 620,
        geometry: { type: "kit", kit: layer.kit, params: { w, h, d } },
        material: layer.material,
        node: g.node,
        mate: A([0, 0, 0]),
        instances: g.cols * g.rows,
        indexed: true,
        instance_layout: layout,
        instance_nodes: g.node ? Array.from({ length: g.cols * g.rows }, () => g.node!) : undefined,
        explode: { direction: explodeDir, distance: layer.distance },
        source: "ERA 反应装甲块：壳体框架/背板/钝感炸药/前飞板/可拆前盖/螺栓，被击中时整块爆炸并推开来袭弹。",
      });
    }
    add({
      id: `${P}era_${g.key}_bolt`,
      name_cn: `ERA ${g.key} 前盖螺栓`,
      name_en: `ERA ${g.key} bolt`,
      assembly: "era",
      build_layer: 5,
      build_order: 621,
      geometry: { type: "kit", kit: "eraBolt", params: { w, h, d } },
      material: "mbt_steel",
      node: g.node,
      mate: A([0, 0, 0]),
      instances: g.cols * g.rows,
      indexed: true,
      instance_layout: layout,
      instance_nodes: g.node ? Array.from({ length: g.cols * g.rows }, () => g.node!) : undefined,
      explode: { direction: explodeDir, distance: 0.32 },
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
    node: "Turret",
    mate: A([0, 0, 0]),
    instances: 2,
    indexed: true,
    instance_layout: "mbt.hull.eraRail",
    instance_nodes: ["Turret", "Turret"],
    explode: { direction: [0, 1.2, 0.8], distance: 0 },
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
    mate: A([-0.55, 1.38, -3.66], [10, 0, 0]),
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
    mate: A([0.55, 1.38, -3.66], [10, 0, 0]),
  });
  add({
    id: `${P}tow_cable`,
    name_cn: "拖车缆绳",
    name_en: "tow cable",
    assembly: "surface",
    build_layer: 5,
    build_order: 634,
    geometry: MERGE(C(0.03, 2.2, [0, 0, 0], 12), C(0.03, 0.3, [0, 0, 0], 12), B(0.08, 0.06, 0.08, [0, 0.75, 0], 0.003), B(0.08, 0.06, 0.08, [0, -0.75, 0], 0.003)),
    material: "mbt_steel_dark",
    mate: A([-1.6, 1.26, -0.3], [90, 0, 0]),
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
    node: "Turret",
    mate: A(TL(1.31, 2.15, 0.55), [0, 90, 0]),
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
    node: "Turret",
    mate: A([0, 0, 0]),
    instances: 2,
    indexed: true,
    instance_layout: "mbt.hull.insignia",
    instance_nodes: ["Turret", "Turret"],
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
    reason: "静态装配：车体/炮塔/复合装甲/ERA/表面件互相贴合与叠层（钢板叠焊、ERA 压条、附件螺栓固定）",
    maxDepthMm: 90,
    allowDisplaced: true,
    allowSuspect: true,
    // 瞄准/装填等动画里，火炮、舱盖、耳轴会相对车体运动；这层静态安装白名单
    // 曾把「炮盾扫过驾驶员舱盖」一并豁免。动画必须走独立的窄规则。
    staticOnly: true,
  },
  // 炮塔座圈/地板压在车体甲板座圈孔上回转：相对运动会持续产生座圈承压接触，
  // 属于真实回转配合面，单独豁免（限深 45mm，仍能兜住错位下坐）。
  {
    family: "turret-bearing",
    a: `${P}turret_ring`,
    b: `${P}front_deck`,
    reason: "炮塔座圈在前甲板座圈孔上回转（承压贴合 + 旋转配合面）",
    maxDepthMm: 45,
    allowDisplaced: true,
  },
  {
    family: "turret-bearing",
    a: `${P}turret_ring`,
    b: `${P}engine_deck`,
    reason: "炮塔座圈在动力舱甲板座圈孔上回转（承压贴合 + 旋转配合面）",
    maxDepthMm: 45,
    allowDisplaced: true,
  },
  {
    family: "turret-bearing",
    a: `${P}turret_floor`,
    b: `${P}front_deck`,
    reason: "炮塔地板与前甲板在座圈内侧的静态层叠（随炮塔回转）",
    maxDepthMm: 45,
    allowDisplaced: true,
  },
  {
    family: "turret-bearing",
    a: `${P}turret_floor`,
    b: `${P}engine_deck`,
    reason: "炮塔地板与动力舱甲板在座圈内侧的静态层叠（随炮塔回转）",
    maxDepthMm: 45,
    allowDisplaced: true,
  },
  {
    family: "turret-bearing",
    a: `${P}turret_floor`,
    b: `${P}armor_roof`,
    reason: "炮塔地板与车体顶甲复合层在座圈内侧的静态层叠（随炮塔回转）",
    maxDepthMm: 45,
    allowDisplaced: true,
  },
  {
    family: "turret-bearing",
    a: `${P}turret_rear`,
    b: `${P}engine_deck`,
    reason: "炮塔尾板下缘与动力舱甲板的回转避让间隙（静态贴合）",
    maxDepthMm: 45,
    allowDisplaced: true,
  },
  // 火炮总成内部配合：炮闩在炮尾环内上下滑动、身管坐在摇架里、
  // 制退机/复进机随炮尾后坐穿过摇架导槽。这些是设计行程，不是运动穿模。
  {
    family: "gun-breech-guide",
    a: `${P}breech_block`,
    b: `${P}breech_ring`,
    reason: "炮闩体在炮尾环内上下滑动（开闩/闭锁行程）",
    maxDepthMm: 65,
    allowDisplaced: true,
  },
  {
    family: "gun-breech-guide",
    a: `${P}breech_block`,
    b: `${P}recoil_cylinder_l`,
    reason: "炮闩体与制退机之间的安装贴合（炮尾组件）",
    maxDepthMm: 25,
    allowDisplaced: true,
  },
  {
    family: "gun-breech-guide",
    a: `${P}breech_block`,
    b: `${P}recoil_cylinder_r`,
    reason: "炮闩体与制退机之间的安装贴合（炮尾组件）",
    maxDepthMm: 25,
    allowDisplaced: true,
  },
  {
    family: "gun-recoil-guide",
    a: `${P}breech_ring`,
    b: `${P}cradle`,
    reason: "炮尾环随火炮后坐在摇架导槽内滑动",
    maxDepthMm: 60,
    allowDisplaced: true,
  },
  {
    family: "gun-recoil-guide",
    a: `${P}breech_ring`,
    b: `${P}recuperator`,
    reason: "炮尾环与复进机的同轴安装配合（后坐行程）",
    maxDepthMm: 60,
    allowDisplaced: true,
  },
  {
    family: "gun-recoil-guide",
    a: `${P}breech_ring`,
    b: `${P}recoil_cylinder_l`,
    reason: "炮尾环与制退机的同轴安装配合（后坐行程）",
    maxDepthMm: 25,
    allowDisplaced: true,
  },
  {
    family: "gun-recoil-guide",
    a: `${P}breech_ring`,
    b: `${P}recoil_cylinder_r`,
    reason: "炮尾环与制退机的同轴安装配合（后坐行程）",
    maxDepthMm: 25,
    allowDisplaced: true,
  },
  {
    family: "gun-cradle-fit",
    a: `${P}gun_barrel`,
    b: `${P}cradle`,
    reason: "身管坐在摇架托座上（俯仰支承面）",
    maxDepthMm: 15,
    allowDisplaced: true,
  },
  {
    family: "gun-recoil-guide",
    a: `${P}breech_block`,
    b: `${P}cradle`,
    reason: "炮闩体随炮尾后坐滑入摇架尾部（后坐导向面）",
    maxDepthMm: 70,
    allowDisplaced: true,
  },
  {
    family: "gun-recoil-guide",
    a: `${P}breech_block`,
    b: `${P}recuperator`,
    reason: "炮闩体/炮尾在后坐行程内与复进机壳体相邻（同总成安装）",
    maxDepthMm: 60,
    allowDisplaced: true,
  },
  {
    family: "gun-recoil-guide",
    a: `${P}gun_barrel`,
    b: `${P}recuperator`,
    reason: "身管后坐下沉时与复进机的同总成间隙",
    maxDepthMm: 30,
    allowDisplaced: true,
  },
  {
    family: "gun-recoil-guide",
    a: `${P}turret_mantlet*`,
    b: `${P}gun_barrel`,
    reason: "身管在后坐行程内穿过炮盾孔（炮盾孔与身管的滑动间隙）",
    maxDepthMm: 15,
    allowDisplaced: true,
  },
  {
    family: "detonation-turret-lift",
    a: "mbt90.interior.basket_footrest_1",
    b: "mbt90.interior.carousel_ring",
    reason: "脚本化殉爆：炮塔被掀飞 0.22m 时吊篮脚蹬扫过固定转盘座圈（非机构运动）",
    maxDepthMm: 45,
    allowDisplaced: true,
    allowSuspect: true,
  },
  {
    family: "engine-alt-belt-fit",
    a: "mbt90.engine.alternator_pulley",
    b: "mbt90.engine.drive_belt",
    reason: "附件皮带嵌在发电机皮带轮槽内（轮槽深度内的包角配合）",
    maxDepthMm: 10,
    allowDisplaced: true,
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
      "现代主战坦克外壳：首上 33.7° 浅倾角、外凸楔形炮塔（±26° 前斜板）、复合装甲分层（钢/陶瓷/间隔/背板）、132 块盒式 ERA（壳体/背板/炸药/飞板/前盖）、120mm 滑膛炮：无膛线身管、两段热护套、中段抽烟装置、炮闩/制退机/复进机/摇臂；车长 M2HB 12.7mm 机枪（轭架/机匣/重枪管/握把/弹箱/弹链）；三色迷彩、战术编号、随车工具、油桶、缆绳。",
    expectedContacts: CONTACTS,
  };
}
