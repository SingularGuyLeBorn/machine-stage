import * as THREE from "three";
import type { InstanceLayout } from "../../../assembler/assembler";
import type { ExpectedContactRule, GeometrySpec, ModelRegistry, PartDefinition } from "../../../registry/types";
import { MBT, MBT_TRACK_LINKS_PER_SIDE, MBT_TRACK_PERIMETER, mbtTrackPose, wheelCenter } from "../constants";
import { MBT_MATERIALS } from "../materials";

// ============================================================================
// models/mbt/running/registry —— 行动装置（L2）
//
// 7 对负重轮（14 只，独立液气悬挂）+ 后置主动轮 + 前置诱导轮 + 4 对拖带轮/侧；
// 履带板、橡胶衬垫、履带销、端部连接器全部实例化成族。
// 节点：Wheel_i（滚动）、Sprocket/Idler/Roller_i（滚动）、Arm_i（摆臂）、Rod_i（液压杆）。
// ============================================================================

const P = "mbt90.running.";
const A = (position: [number, number, number], rotation?: [number, number, number]) =>
  rotation ? { type: "absolute" as const, position, rotation } : { type: "absolute" as const, position };
const B = (w: number, h: number, d: number, at: [number, number, number] = [0, 0, 0], bevel = 0.003): GeometrySpec & { at: [number, number, number] } => ({ type: "box", w, h, d, bevel, at });
const C = (r: number, h: number, at: [number, number, number] = [0, 0, 0], segments = 16, rTop = r): GeometrySpec & { at: [number, number, number] } => ({ type: "cylinder", r, h, rTop, segments, bevel: 0.0015, at });
const T = (ro: number, ri: number, h: number, at: [number, number, number] = [0, 0, 0], seg = 22): GeometrySpec & { at: [number, number, number] } => ({ type: "tube", rOuter: ro, rInner: ri, h, segments: seg, at });
const MERGE = (...items: Array<GeometrySpec & { at?: [number, number, number] }>): GeometrySpec => ({ type: "merge", parts: items });

const wheelNode = (index: number) => `MBT_Wheel_${index}`;
const armNode = (index: number) => `MBT_Arm_${index}`;
const rodNode = (index: number) => `MBT_Rod_${index}`;
const rollerNode = (index: number) => `MBT_Roller_${index}`;

export const RUNNING_NODES = {
  wheel: wheelNode,
  arm: armNode,
  rod: rodNode,
  roller: rollerNode,
  sprocketL: "MBT_Sprocket_L",
  sprocketR: "MBT_Sprocket_R",
  idlerL: "MBT_Idler_L",
  idlerR: "MBT_Idler_R",
} as const;

function trackMatrix(index: number, side: 1 | -1, local?: THREE.Matrix4): THREE.Matrix4 {
  const per = MBT_TRACK_LINKS_PER_SIDE;
  const k = index % per;
  const pose = mbtTrackPose((k / per) * MBT_TRACK_PERIMETER);
  const m = new THREE.Matrix4()
    .makeRotationX(pose.angle)
    .setPosition(side * MBT.WHEEL_X, pose.y, pose.z);
  if (local) m.multiply(local);
  return m;
}

export const RUNNING_LAYOUTS: Record<string, InstanceLayout> = {
  "mbt.running.track": ({ index }) => trackMatrix(index, index % 2 === 0 ? 1 : -1),
  "mbt.running.trackPad": ({ index }) =>
    trackMatrix(index, index % 2 === 0 ? 1 : -1, new THREE.Matrix4().makeTranslation(0, 0.022, 0)),
  "mbt.running.trackPin": ({ index }) =>
    trackMatrix(index, index % 2 === 0 ? 1 : -1, new THREE.Matrix4().makeTranslation(0, 0, 0.056)),
  "mbt.running.trackConnectorL": ({ index }) =>
    trackMatrix(index, index % 2 === 0 ? 1 : -1, new THREE.Matrix4().makeTranslation(-0.17, 0, 0.05)),
  "mbt.running.trackConnectorR": ({ index }) =>
    trackMatrix(index, index % 2 === 0 ? 1 : -1, new THREE.Matrix4().makeTranslation(0.17, 0, 0.05)),
  "mbt.running.trackBolt": ({ index }) => {
    const link = Math.floor(index / 2);
    const bolt = index % 2;
    return trackMatrix(link, link % 2 === 0 ? 1 : -1, new THREE.Matrix4().makeTranslation(bolt === 0 ? -0.12 : 0.12, 0.018, -0.028));
  },
  "mbt.running.wheelBolt": ({ index }) => {
    const wheel = Math.floor(index / 8);
    const bolt = index % 8;
    const side = wheel % 2 === 0 ? 1 : -1;
    const a = (bolt / 8) * Math.PI * 2;
    return new THREE.Matrix4()
      .makeRotationZ(-Math.PI / 2)
      .setPosition(side * (MBT.WHEEL_W / 2 + 0.015), Math.cos(a) * 0.09, Math.sin(a) * 0.09);
  },
  "mbt.running.sprocketBolt": ({ index }) => {
    const a = ((index % 10) / 10) * Math.PI * 2;
    return new THREE.Matrix4().makeRotationZ(-Math.PI / 2).setPosition(-0.05, Math.cos(a) * 0.1, Math.sin(a) * 0.1);
  },
  "mbt.running.rollerBracket": ({ index }) => {
    const side = index < 4 ? 1 : -1;
    const k = index % 4;
    return new THREE.Matrix4().makeTranslation(side * MBT.WHEEL_X, MBT.RETURN_ROLLER_Y, 2.1 - k * 1.25);
  },
};

function buildNodes() {
  const nodes = [];
  for (let i = 0; i < 14; i++) {
    const c = wheelCenter(i);
    nodes.push({
      name: wheelNode(i),
      parent: "root" as const,
      pivot: [c.x, c.y, c.z] as [number, number, number],
      motion: "rotate" as const,
      axis: "x" as const,
      note: `负重轮 ${i + 1}（${c.side === 1 ? "右" : "左"}侧第 ${Math.floor(i / 2) + 1} 轴）`,
    });
    const station = Math.floor(i / 2);
    const side = c.side;
    const z = MBT.WHEEL_Z_FIRST - station * MBT.WHEEL_PITCH;
    nodes.push({
      name: armNode(i),
      parent: "root" as const,
      pivot: [side * (MBT.WHEEL_X - 0.48), 0.56, z] as [number, number, number],
      motion: "rotate" as const,
      axis: "z" as const,
      note: `平衡肘 ${i + 1}`,
    });
    nodes.push({
      name: rodNode(i),
      parent: "root" as const,
      pivot: [side * (MBT.WHEEL_X - 0.46), 0.62, z] as [number, number, number],
      motion: "translate" as const,
      axis: "y" as const,
      note: `液气悬挂活塞杆 ${i + 1}`,
    });
  }
  for (const side of [-1, 1] as const) {
    nodes.push({
      name: side === 1 ? "MBT_Sprocket_R" : "MBT_Sprocket_L",
      parent: "root" as const,
      pivot: [side * MBT.WHEEL_X, MBT.WHEEL_Y, MBT.SPROCKET_Z] as [number, number, number],
      motion: "rotate" as const,
      axis: "x" as const,
      note: "主动轮",
    });
    nodes.push({
      name: side === 1 ? "MBT_Idler_R" : "MBT_Idler_L",
      parent: "root" as const,
      pivot: [side * MBT.WHEEL_X, MBT.WHEEL_Y, MBT.IDLER_Z] as [number, number, number],
      motion: "rotate" as const,
      axis: "x" as const,
      note: "诱导轮",
    });
  }
  for (let side = 0; side < 2; side++) {
    for (let k = 0; k < 4; k++) {
      nodes.push({
        name: rollerNode(side * 4 + k),
        parent: "root" as const,
        pivot: [(side === 0 ? 1 : -1) * MBT.WHEEL_X, MBT.RETURN_ROLLER_Y, 2.1 - k * 1.25] as [number, number, number],
        motion: "rotate" as const,
        axis: "x" as const,
        note: "拖带轮",
      });
    }
  }
  return nodes;
}

function buildParts(): PartDefinition[] {
  const parts: PartDefinition[] = [];
  const add = (p: PartDefinition) => parts.push(p);
  const wheelNodes = Array.from({ length: 14 }, (_, i) => wheelNode(i));
  const wheelBoltNodes = wheelNodes.flatMap((node) => Array.from({ length: 8 }, () => node));
  const sprocketNodes = ["MBT_Sprocket_L", "MBT_Sprocket_R"];

  // ---------------- 履带 ----------------
  add({
    id: `${P}track_link`,
    name_cn: "履带板",
    name_en: "track link",
    assembly: "track",
    build_layer: 2,
    build_order: 300,
    geometry: { type: "kit", kit: "trackLink", params: { pitch: MBT.TRACK_PITCH, width: 0.42 } },
    material: "mbt_track",
    mate: A([0, 0, 0]),
    instances: MBT_TRACK_LINKS_PER_SIDE * 2,
    indexed: true,
    instance_layout: "mbt.running.track",
    source: "双销耳挂胶履带板：节距 160，宽 420，中央导向齿；每侧约 100 块，全实例化。",
  });
  add({
    id: `${P}track_pad`,
    name_cn: "履带橡胶衬垫",
    name_en: "track rubber pad",
    assembly: "track",
    build_layer: 2,
    build_order: 301,
    geometry: { type: "kit", kit: "trackPad", params: { pitch: MBT.TRACK_PITCH, width: 0.42 } },
    material: "mbt_rubber",
    mate: A([0, 0, 0]),
    instances: MBT_TRACK_LINKS_PER_SIDE * 2,
    indexed: true,
    instance_layout: "mbt.running.trackPad",
  });
  add({
    id: `${P}track_pin`,
    name_cn: "履带销",
    name_en: "track pin",
    assembly: "track",
    build_layer: 2,
    build_order: 302,
    geometry: { type: "kit", kit: "trackPin", params: { width: 0.42, r: 0.018 } },
    material: "mbt_steel",
    mate: A([0, 0, 0]),
    instances: MBT_TRACK_LINKS_PER_SIDE * 2,
    indexed: true,
    instance_layout: "mbt.running.trackPin",
  });
  for (const [tag, layout] of [
    ["l", "mbt.running.trackConnectorL"],
    ["r", "mbt.running.trackConnectorR"],
  ] as const) {
    add({
      id: `${P}end_connector_${tag}`,
      name_cn: `端部连接器（${tag === "l" ? "内" : "外"}侧）`,
      name_en: `end connector ${tag}`,
      assembly: "track",
      build_layer: 2,
      build_order: 303,
      geometry: { type: "kit", kit: "endConnector", params: {} },
      material: "mbt_steel_dark",
      mate: A([0, 0, 0]),
      instances: MBT_TRACK_LINKS_PER_SIDE * 2,
      indexed: true,
      instance_layout: layout,
    });
  }
  add({
    id: `${P}track_bolt`,
    name_cn: "履带板螺栓",
    name_en: "track bolt",
    assembly: "track",
    build_layer: 2,
    build_order: 304,
    geometry: MERGE(C(0.012, 0.03, [0, 0, 0], 8), C(0.018, 0.006, [0, 0.018, 0], 8)),
    material: "mbt_steel",
    mate: A([0, 0, 0]),
    instances: MBT_TRACK_LINKS_PER_SIDE * 4,
    indexed: true,
    instance_layout: "mbt.running.trackBolt",
  });

  // ---------------- 负重轮 ----------------
  add({
    id: `${P}wheel_tire`,
    name_cn: "负重轮胶胎",
    name_en: "road wheel tire",
    assembly: "wheels",
    build_layer: 2,
    build_order: 310,
    geometry: { type: "kit", kit: "roadWheel", params: { r: MBT.WHEEL_R, w: MBT.WHEEL_W } },
    material: "mbt_rubber",
    mate: A([0, 0, 0]),
    instances: 14,
    indexed: true,
    instance_nodes: wheelNodes,
    source: "双联胶胎负重轮 ⌀800 × 170，14 只独立悬挂。",
  });
  add({
    id: `${P}wheel_hub`,
    name_cn: "负重轮轮毂",
    name_en: "road wheel hub",
    assembly: "wheels",
    build_layer: 2,
    build_order: 311,
    geometry: MERGE(T(0.15, 0.06, 0.2, [0, 0, 0], 24), C(0.06, 0.24, [0, 0, 0], 16)),
    material: "mbt_steel",
    mate: A([0, 0, 0]),
    instances: 14,
    indexed: true,
    instance_nodes: wheelNodes,
  });
  add({
    id: `${P}wheel_bolt`,
    name_cn: "轮毂螺栓",
    name_en: "hub bolt",
    assembly: "wheels",
    build_layer: 2,
    build_order: 312,
    geometry: { type: "kit", kit: "hubBolt", params: { r: 0.014 } },
    material: "mbt_steel",
    mate: A([0, 0, 0]),
    instances: 112,
    indexed: true,
    instance_nodes: wheelBoltNodes,
    instance_layout: "mbt.running.wheelBolt",
    source: "每轮 8 颗（共 112），头面贴轮毂盘外表面，随轮转动。",
  });
  add({
    id: `${P}wheel_bearing`,
    name_cn: "负重轮轴承",
    name_en: "road wheel bearing",
    assembly: "wheels",
    build_layer: 2,
    build_order: 313,
    geometry: MERGE(T(0.075, 0.055, 0.07, [0, 0, 0], 20)),
    material: "mbt_brass",
    mate: A([0, 0, 0]),
    instances: 14,
    indexed: true,
    instance_nodes: wheelNodes,
  });
  add({
    id: `${P}wheel_seal`,
    name_cn: "负重轮油封",
    name_en: "road wheel seal",
    assembly: "wheels",
    build_layer: 2,
    build_order: 314,
    geometry: MERGE(T(0.085, 0.07, 0.015, [0, 0, 0], 20)),
    material: "mbt_rubber_worn",
    mate: A([0, 0, 0]),
    instances: 14,
    indexed: true,
    instance_nodes: wheelNodes,
  });
  add({
    id: `${P}wheel_cap`,
    name_cn: "轮毂盖",
    name_en: "hub cap",
    assembly: "wheels",
    build_layer: 2,
    build_order: 315,
    geometry: MERGE(C(0.08, 0.04, [0, 0, 0], 20), C(0.03, 0.03, [0, 0, 0], 12)),
    material: "mbt_steel_dark",
    mate: A([0, 0, 0], [0, 0, 90]),
    instances: 14,
    indexed: true,
    instance_nodes: wheelNodes,
  });

  // ---------------- 主动轮 / 诱导轮 ----------------
  add({
    id: `${P}sprocket`,
    name_cn: "主动轮（12 齿）",
    name_en: "drive sprocket",
    assembly: "sprockets",
    build_layer: 2,
    build_order: 320,
    geometry: { type: "kit", kit: "sprocket", params: { r: MBT.SPROCKET_R, w: 0.17 } },
    material: "mbt_track",
    mate: A([0, 0, 0]),
    instances: 2,
    indexed: true,
    instance_nodes: sprocketNodes,
    source: "后置主动轮，12 齿，节圆 ⌀810，齿顶与履带环内缘啮合。",
  });
  add({
    id: `${P}sprocket_hub`,
    name_cn: "主动轮轮毂",
    name_en: "sprocket hub",
    assembly: "sprockets",
    build_layer: 2,
    build_order: 321,
    geometry: MERGE(T(0.14, 0.08, 0.22, [0, 0, 0], 22)),
    material: "mbt_cast_dark",
    mate: A([0, 0, 0], [0, 0, 90]),
    instances: 2,
    indexed: true,
    instance_nodes: sprocketNodes,
  });
  add({
    id: `${P}sprocket_bolt`,
    name_cn: "主动轮螺栓",
    name_en: "sprocket bolt",
    assembly: "sprockets",
    build_layer: 2,
    build_order: 322,
    geometry: { type: "kit", kit: "hubBolt", params: { r: 0.013 } },
    material: "mbt_steel",
    mate: A([0, 0, 0]),
    instances: 20,
    indexed: true,
    instance_nodes: sprocketNodes.flatMap((node) => Array.from({ length: 10 }, () => node)),
    instance_layout: "mbt.running.sprocketBolt",
  });
  add({
    id: `${P}idler`,
    name_cn: "诱导轮",
    name_en: "idler wheel",
    assembly: "sprockets",
    build_layer: 2,
    build_order: 323,
    geometry: { type: "kit", kit: "idlerWheel", params: { r: MBT.IDLER_R, w: 0.17 } },
    material: "mbt_rubber",
    mate: A([0, 0, 0]),
    instances: 2,
    indexed: true,
    instance_nodes: ["MBT_Idler_L", "MBT_Idler_R"],
  });
  add({
    id: `${P}idler_hub`,
    name_cn: "诱导轮轮毂",
    name_en: "idler hub",
    assembly: "sprockets",
    build_layer: 2,
    build_order: 324,
    geometry: MERGE(T(0.12, 0.06, 0.2, [0, 0, 0], 20)),
    material: "mbt_cast_dark",
    mate: A([0, 0, 0], [0, 0, 90]),
    instances: 2,
    indexed: true,
    instance_nodes: ["MBT_Idler_L", "MBT_Idler_R"],
  });
  add({
    id: `${P}idler_arm`,
    name_cn: "诱导轮张紧臂",
    name_en: "idler tension arm",
    assembly: "sprockets",
    build_layer: 2,
    build_order: 325,
    geometry: MERGE(B(0.05, 0.42, 0.08, [0, -0.2, 0], 0.006), C(0.06, 0.1, [0, 0, 0], 16)),
    material: "mbt_steel_dark",
    mate: A([MBT.WHEEL_X, MBT.WHEEL_Y, MBT.IDLER_Z], [0, 0, 0]),
    dual: true,
  });
  add({
    id: `${P}idler_tensioner`,
    name_cn: "履带张紧器",
    name_en: "track tensioner",
    assembly: "sprockets",
    build_layer: 2,
    build_order: 326,
    geometry: MERGE(C(0.045, 0.28, [0, 0, 0], 18), C(0.02, 0.18, [0, 0.2, 0], 12), C(0.06, 0.05, [0, -0.16, 0], 18)),
    material: "mbt_steel_dark",
    mate: A([MBT.WHEEL_X - 0.35, 0.85, MBT.IDLER_Z - 0.25], [0, 0, 0]),
    dual: true,
  });

  // ---------------- 拖带轮 ----------------
  add({
    id: `${P}roller`,
    name_cn: "拖带轮",
    name_en: "return roller",
    assembly: "rollers",
    build_layer: 2,
    build_order: 330,
    geometry: { type: "kit", kit: "returnRoller", params: { r: 0.12, w: 0.1 } },
    material: "mbt_rubber",
    mate: A([0, 0, 0]),
    instances: 8,
    indexed: true,
    instance_nodes: Array.from({ length: 8 }, (_, i) => rollerNode(i)),
  });
  add({
    id: `${P}roller_bearing`,
    name_cn: "拖带轮轴承",
    name_en: "return roller bearing",
    assembly: "rollers",
    build_layer: 2,
    build_order: 331,
    geometry: MERGE(T(0.045, 0.028, 0.05, [0, 0, 0], 16)),
    material: "mbt_brass",
    mate: A([0, 0, 0], [0, 0, 90]),
    instances: 8,
    indexed: true,
    instance_nodes: Array.from({ length: 8 }, (_, i) => rollerNode(i)),
  });
  add({
    id: `${P}roller_bracket`,
    name_cn: "拖带轮支架",
    name_en: "return roller bracket",
    assembly: "rollers",
    build_layer: 2,
    build_order: 332,
    geometry: MERGE(B(0.08, 0.15, 0.06, [0, 0.085, 0], 0.005), C(0.04, 0.12, [0, 0, 0], 14)),
    material: "mbt_steel_dark",
    mate: A([0, 0, 0]),
    instances: 8,
    indexed: true,
    instance_layout: "mbt.running.rollerBracket",
  });

  // ---------------- 液气悬挂（14 站） ----------------
  for (let i = 0; i < 14; i++) {
    const c = wheelCenter(i);
    const side = c.side;
    const z = c.z;
    const station = i + 1;
    const reach = 0.48;
    add({
      id: `${P}susp_${station}_arm`,
      name_cn: `平衡肘 ${station}`,
      name_en: `trailing arm ${station}`,
      assembly: "suspension",
      build_layer: 2,
      build_order: 340,
      geometry: { type: "kit", kit: "suspensionArm", params: { reach, sign: side } },
      material: "mbt_steel_dark",
      node: armNode(i),
      mate: A([0, 0, 0]),
    });
    add({
      id: `${P}susp_${station}_pivot`,
      name_cn: `平衡肘枢轴 ${station}`,
      name_en: `arm pivot ${station}`,
      assembly: "suspension",
      build_layer: 2,
      build_order: 341,
      geometry: MERGE(C(0.055, 0.22, [0, 0, 0], 18)),
      material: "mbt_steel",
      mate: A([side * (MBT.WHEEL_X - 0.48), 0.56, z], [90, 0, 0]),
    });
    add({
      id: `${P}susp_${station}_bush`,
      name_cn: `枢轴衬套 ${station}`,
      name_en: `pivot bushing ${station}`,
      assembly: "suspension",
      build_layer: 2,
      build_order: 342,
      geometry: MERGE(T(0.075, 0.055, 0.16, [0, 0, 0], 20)),
      material: "mbt_brass",
      mate: A([side * (MBT.WHEEL_X - 0.48), 0.56, z], [90, 0, 0]),
    });
    add({
      id: `${P}susp_${station}_cyl`,
      name_cn: `液气悬挂液压缸 ${station}`,
      name_en: `hydropneumatic cylinder ${station}`,
      assembly: "suspension",
      build_layer: 2,
      build_order: 343,
      geometry: { type: "kit", kit: "hydraulicCylinder", params: { r: 0.045, h: 0.26 } },
      material: "mbt_cast_dark",
      mate: A([side * (MBT.WHEEL_X - 0.46), 0.85, z]),
    });
    add({
      id: `${P}susp_${station}_rod`,
      name_cn: `悬挂活塞杆 ${station}`,
      name_en: `suspension piston rod ${station}`,
      assembly: "suspension",
      build_layer: 2,
      build_order: 344,
      geometry: { type: "kit", kit: "pistonRod", params: { r: 0.022, h: 0.24 } },
      material: "mbt_steel",
      node: rodNode(i),
      mate: A([0, 0, 0]),
    });
    add({
      id: `${P}susp_${station}_accumulator`,
      name_cn: `氮气蓄能器 ${station}`,
      name_en: `nitrogen accumulator ${station}`,
      assembly: "suspension",
      build_layer: 2,
      build_order: 345,
      geometry: { type: "kit", kit: "accumulator", params: { r: 0.07 } },
      material: "mbt_paint_dark",
      mate: A([side * (MBT.WHEEL_X - 0.44), 1.06, z + 0.16]),
    });
    add({
      id: `${P}susp_${station}_clamp`,
      name_cn: `蓄能器卡箍 ${station}`,
      name_en: `accumulator clamp ${station}`,
      assembly: "suspension",
      build_layer: 2,
      build_order: 346,
      geometry: MERGE(T(0.076, 0.07, 0.04, [0, 0, 0], 20), B(0.08, 0.03, 0.04, [0, -0.04, 0], 0.003)),
      material: "mbt_steel",
      mate: A([side * (MBT.WHEEL_X - 0.44), 1.06, z + 0.16]),
    });
    add({
      id: `${P}susp_${station}_hose`,
      name_cn: `悬挂油管 ${station}`,
      name_en: `suspension hose ${station}`,
      assembly: "suspension",
      build_layer: 2,
      build_order: 347,
      geometry: { type: "weld", from: [side * (MBT.WHEEL_X - 0.44), 0.99, z + 0.16], to: [side * (MBT.WHEEL_X - 0.46), 0.88, z], radius: 0.012, seed: 90 + i },
      material: "mbt_steel_dark",
      mate: A([0, 0, 0]),
    });
    add({
      id: `${P}susp_${station}_damper`,
      name_cn: `减震器 ${station}`,
      name_en: `damper ${station}`,
      assembly: "suspension",
      build_layer: 2,
      build_order: 348,
      geometry: { type: "kit", kit: "damper", params: { r: 0.035, h: 0.24 } },
      material: "mbt_steel_dark",
      mate: A([side * (MBT.WHEEL_X - 0.42), 0.7, z - 0.16]),
    });
    add({
      id: `${P}susp_${station}_bump`,
      name_cn: `限位缓冲块 ${station}`,
      name_en: `bump stop ${station}`,
      assembly: "suspension",
      build_layer: 2,
      build_order: 349,
      geometry: MERGE(C(0.06, 0.08, [0, 0, 0], 16), C(0.04, 0.02, [0, 0.05, 0], 12)),
      material: "mbt_rubber",
      mate: A([side * (MBT.WHEEL_X - 0.4), 0.47, z]),
    });
    add({
      id: `${P}susp_${station}_sensor`,
      name_cn: `悬挂行程传感器 ${station}`,
      name_en: `suspension travel sensor ${station}`,
      assembly: "suspension",
      build_layer: 2,
      build_order: 350,
      geometry: MERGE(C(0.02, 0.08, [0, 0, 0], 12), C(0.012, 0.03, [0, 0.05, 0], 8)),
      material: "mbt_brass",
      mate: A([side * (MBT.WHEEL_X - 0.4), 0.64, z + 0.13]),
    });
  }

  // ---------------- 侧裙 / 挡泥板 / 终传护罩 ----------------
  for (const side of [-1, 1] as const) {
    add({
      id: `${P}skirt_${side === 1 ? "r" : "l"}`,
      name_cn: `${side === 1 ? "右" : "左"}侧裙板`,
      name_en: `${side === 1 ? "right" : "left"} side skirt`,
      assembly: "skirts",
      build_layer: 2,
      build_order: 360,
      geometry: { type: "kit", kit: "skirtPanel", params: { w: 5.7, h: 0.72 } },
      material: "mbt_paint",
      mate: A([side * MBT.SKIRT_X, MBT.SKIRT_Y, -0.2], [0, 90, 0]),
    });
    add({
      id: `${P}fender_front_${side === 1 ? "r" : "l"}`,
      name_cn: `${side === 1 ? "右" : "左"}前翼子板`,
      name_en: `${side === 1 ? "right" : "left"} front fender`,
      assembly: "skirts",
      build_layer: 2,
      build_order: 361,
      geometry: MERGE(B(0.46, 0.04, 0.82, [0, 0, 0], 0.006), B(0.04, 0.16, 0.8, [0.21, -0.08, 0], 0.004), B(0.1, 0.08, 0.12, [-0.16, -0.02, -0.28], 0.004)),
      material: "mbt_paint",
      mate: A([side * 1.56, 1.21, 3.02]),
    });
    add({
      id: `${P}mudflap_${side === 1 ? "r" : "l"}`,
      name_cn: `${side === 1 ? "右" : "左"}后挡泥板`,
      name_en: `${side === 1 ? "right" : "left"} mud flap`,
      assembly: "skirts",
      build_layer: 2,
      build_order: 362,
      geometry: B(0.46, 0.42, 0.03, [0, 0, 0], 0.006),
      material: "mbt_rubber",
      mate: A([side * 1.55, 0.42, -3.2]),
    });
    add({
      id: `${P}final_cover_${side === 1 ? "r" : "l"}`,
      name_cn: `${side === 1 ? "右" : "左"}终传护罩`,
      name_en: `${side === 1 ? "right" : "left"} final drive cover`,
      assembly: "skirts",
      build_layer: 2,
      build_order: 363,
      geometry: MERGE(T(0.24, 0.18, 0.1, [0, 0, 0], 24)),
      material: "mbt_cast",
      mate: A([side * (MBT.WHEEL_X + 0.13), MBT.WHEEL_Y, MBT.SPROCKET_Z], [0, 0, 90]),
    });
  }
  // 侧裙安装支座（把裙板挂到车体侧甲）
  for (let k = 0; k < 8; k++) {
    const side = k < 4 ? 1 : -1;
    const idx = k % 4;
    add({
      id: `${P}skirt_bracket_${k + 1}`,
      name_cn: `侧裙支座 ${k + 1}`,
      name_en: `skirt bracket ${k + 1}`,
      assembly: "skirts",
      build_layer: 2,
      build_order: 364,
      geometry: MERGE(B(0.56, 0.08, 0.1, [0, 0, 0], 0.005), B(0.06, 0.2, 0.1, [-0.26, 0.1, 0], 0.004), B(0.06, 0.18, 0.1, [0.24, -0.08, 0], 0.004)),
      material: "mbt_steel_dark",
      mate: A([side * 1.6, 1.22, 1.9 - idx * 1.4]),
    });
  }
  return parts;
}

const CONTACTS: ExpectedContactRule[] = [
  {
    family: "running-track",
    a: `${P}track*`,
    b: `${P}track*`,
    reason: "履带板/衬垫/履带销/端部连接器成链（销耳互插、衬垫压在板面）",
    maxDepthMm: 40,
    allowDisplaced: true,
    allowSuspect: true,
  },
  {
    family: "running-end-connector",
    a: `${P}end_connector*`,
    b: `${P}track*`,
    reason: "端部连接器夹住履带销与相邻履带板销耳",
    maxDepthMm: 30,
    allowDisplaced: true,
    allowSuspect: true,
  },
  {
    family: "running-track-wheel",
    a: `${P}track*`,
    b: `${P}wheel*`,
    reason: "履带板压在负重轮胶胎上（履带环包住轮缘）",
    maxDepthMm: 35,
    allowDisplaced: true,
  },
  {
    family: "running-track-sprocket",
    a: `${P}track*`,
    b: `${P}sprocket*`,
    reason: "履带销耳卡在主动轮齿槽里（12 齿啮合）",
    maxDepthMm: 40,
    allowDisplaced: true,
  },
  {
    family: "running-track-idler",
    a: `${P}track*`,
    b: `${P}idler*`,
    reason: "履带包在诱导轮外缘（导向接触）",
    maxDepthMm: 35,
    allowDisplaced: true,
  },
  {
    family: "running-track-roller",
    a: `${P}track*`,
    b: `${P}roller*`,
    reason: "回程履带压在拖带轮上",
    maxDepthMm: 30,
    allowDisplaced: true,
  },
  {
    family: "running-wheel-internals",
    a: `${P}wheel*`,
    b: `${P}wheel*`,
    reason: "胶胎、轮辋、轮毂、轴承、油封同轴压装（轮毂螺栓穿过轮盘）",
    maxDepthMm: 40,
    allowDisplaced: true,
  },
  {
    family: "running-sprocket-internals",
    a: `${P}sprocket*`,
    b: `${P}sprocket*`,
    reason: "主动轮齿圈/轮毂/螺栓同轴装配",
    maxDepthMm: 45,
    allowDisplaced: true,
  },
  {
    family: "running-idler-internals",
    a: `${P}idler*`,
    b: `${P}idler*`,
    reason: "诱导轮/轮毂/张紧臂/张紧器同轴与铰接",
    maxDepthMm: 80,
    allowDisplaced: true,
  },
  {
    family: "running-roller-internals",
    a: `${P}roller*`,
    b: `${P}roller*`,
    reason: "拖带轮胶圈/轴承/支架同轴装配",
    maxDepthMm: 45,
    allowDisplaced: true,
  },
  {
    family: "running-suspension",
    a: `${P}susp_*`,
    b: `${P}susp_*`,
    reason: "平衡肘/枢轴/衬套/液压缸/活塞杆/蓄能器/减震器/限位块同站装配",
    maxDepthMm: 70,
    allowDisplaced: true,
    allowSuspect: true,
  },
  {
    family: "running-suspension-wheel",
    a: `${P}susp_*`,
    b: `${P}wheel*`,
    reason: "平衡肘端部与负重轮轮毂铰接；缓冲块顶住平衡肘",
    maxDepthMm: 35,
    allowDisplaced: true,
  },
  {
    family: "running-skirt",
    a: `${P}skirt*`,
    b: `${P}susp_*`,
    reason: "侧裙板与悬挂/负重轮在车体侧面相邻（裙板挂在支座上）",
    maxDepthMm: 35,
    allowDisplaced: true,
    allowSuspect: true,
  },
  {
    family: "running-final-cover",
    a: `${P}final_cover*`,
    b: `${P}sprocket*`,
    reason: "终传护罩罩住主动轮轮毂",
    maxDepthMm: 40,
    allowDisplaced: true,
  },
];

export function makeRunningRegistry(): ModelRegistry {
  return {
    model: "mbt90",
    title: "MBT-90 行动装置",
    constants: {
      ...MBT,
      TRACK_LINKS_PER_SIDE: MBT_TRACK_LINKS_PER_SIDE,
      TRACK_PERIMETER: MBT_TRACK_PERIMETER,
    },
    assemblies: [
      { id: "track", name_cn: "履带", name_en: "track", explode: [0, -0.4, 0] },
      { id: "wheels", name_cn: "负重轮", name_en: "road wheels", explode: [1.2, 0, 0] },
      { id: "sprockets", name_cn: "主动轮/诱导轮", name_en: "sprockets & idlers", explode: [1.0, 0, 0] },
      { id: "rollers", name_cn: "拖带轮", name_en: "return rollers", explode: [0.8, 0.2, 0] },
      { id: "suspension", name_cn: "液气悬挂", name_en: "hydropneumatic suspension", explode: [0.9, 0.4, 0] },
      { id: "skirts", name_cn: "侧裙与护罩", name_en: "skirts & guards", explode: [1.4, 0, 0] },
    ],
    nodes: buildNodes(),
    materials: MBT_MATERIALS,
    parts: buildParts(),
    source_notes:
      "行动装置按现代主战坦克 7 对负重轮布置：14 只独立液气悬挂（液压缸 + 氮气蓄能器 + 减震器 + 平衡肘），" +
      "后置主动轮 12 齿、前置诱导轮与履带张紧器、每侧 4 只拖带轮；履带板/橡胶衬垫/履带销/端部连接器全部实例化。",
    expectedContacts: CONTACTS,
  };
}
