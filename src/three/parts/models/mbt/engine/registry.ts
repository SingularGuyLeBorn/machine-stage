import * as THREE from "three";
import type { InstanceLayout } from "../../../assembler/assembler";
import type {
  GeometrySpec,
  ModelRegistry,
  NodeDef,
  PartDefinition,
} from "../../../registry/types";
import { MBT } from "../constants";
import { MBT_MATERIALS } from "../materials";
import { MBT_ENGINE_ALL_EXPECTED_CONTACTS } from "./expectedContactsExtra";
import { MBT_ENGINE_CONTACT_FIXES } from "./expectedContactsFixes";
import {
  V12,
  bankAxis,
  cylinderInfo,
  enginePoint,
  solveCylinder,
} from "./kinematics";

// ============================================================================
// models/mbt/engine/registry —— MBT-90 的 V12 双涡轮增压柴油机（L1 动力核心）
//
// 设计口径（虚构但工程自洽，参照 MTU MB 873 / 豹 2 动力包一级）：
//   90° V12、缸径 145 × 行程 160、排量 47.6L、1500 PS、额定 2600 rpm、
//   每缸 4 气门（2 进 2 排，共 48）、SOHC＋桥式摇臂、双涡轮增压 + 中冷、
//   高压共轨、干式油底壳、电起动。
// 发动机安装在车体后部（MBT.ENGINE_Y / ENGINE_Z），曲轴沿 X 横置。
// 零件坐标：几何在发动机局部系建模；mate 的装配点用 enginePoint() 换算到车体。
// 构建层：L1 曲轴箱/曲轴/活塞连杆 → L2 缸盖配气 → L3 供油/增压/冷却/润滑/起动。
// ============================================================================

const DEG = Math.PI / 180;
const R3 = (v: number) => Math.round(v * 1000) / 1000;

const A = (position: [number, number, number], rotation?: [number, number, number]) =>
  rotation
    ? { type: "absolute" as const, position, rotation }
    : { type: "absolute" as const, position };

const B = (
  w: number,
  h: number,
  d: number,
  at: [number, number, number] = [0, 0, 0],
  bevel = 0.004,
): GeometrySpec & { at: [number, number, number] } => ({ type: "box", w, h, d, bevel, at });

const C = (
  r: number,
  h: number,
  at: [number, number, number] = [0, 0, 0],
  segments = 20,
  rTop = r,
): GeometrySpec & { at: [number, number, number] } => ({
  type: "cylinder",
  r,
  h,
  rTop,
  segments,
  bevel: 0.0015,
  at,
});

const T = (
  rOuter: number,
  rInner: number,
  h: number,
  at: [number, number, number] = [0, 0, 0],
  segments = 24,
): GeometrySpec & { at: [number, number, number] } => ({
  type: "tube",
  rOuter,
  rInner,
  h,
  segments,
  at,
});

const MERGE = (...items: Array<GeometrySpec & { at?: [number, number, number] }>): GeometrySpec => ({
  type: "merge",
  parts: items,
});

const bankBeta = (side: 1 | -1) => side * V12.HALF_V;

/** 缸列局部 (x, 沿缸轴 h, 侧向 lateral) → 车体坐标。 */
function bankPoint(side: 1 | -1, x: number, h: number, lateral: number): [number, number, number] {
  const beta = bankBeta(side) * DEG;
  return enginePoint([
    x,
    h * Math.cos(beta) - lateral * Math.sin(beta),
    h * Math.sin(beta) + lateral * Math.cos(beta),
  ]);
}

const bankRot = (side: 1 | -1): [number, number, number] => [bankBeta(side), 0, 0];

// ---------------------------------------------------------------------------
// 节点名（motion / 测试共用）
// ---------------------------------------------------------------------------

export const pistonNodeName = (ordinal: number) => `MBT_Piston_${ordinal}`;
export const rodNodeName = (ordinal: number) => `MBT_Rod_${ordinal}`;
export const valveNodeName = (ordinal: number, kind: "I1" | "I2" | "E1" | "E2") =>
  `MBT_Valve_${kind}_${ordinal}`;
export const springNodeName = (ordinal: number, kind: "I1" | "I2" | "E1" | "E2") =>
  `MBT_Spring_${kind}_${ordinal}`;
export const rockerNodeName = (ordinal: number, kind: "I" | "E") =>
  `MBT_Rocker_${kind}_${ordinal}`;
export const pushrodNodeName = (ordinal: number, kind: "I" | "E") =>
  `MBT_Pushrod_${kind}_${ordinal}`;

export const ENGINE_CRANK_NODE = "MBT_Crank";
export const ENGINE_CAM_NODES = ["MBT_Cam_L", "MBT_Cam_R"] as const;
export const ENGINE_TURBO_NODES = ["MBT_Turbo_L", "MBT_Turbo_R"] as const;
export const ENGINE_FAN_NODES = ["MBT_Fan_L", "MBT_Fan_R"] as const;
export const ENGINE_IDLER_NODE = "MBT_Timing_Idler";

const valveXOffsets: Record<"I1" | "I2" | "E1" | "E2", number> = {
  I1: -0.035,
  I2: 0.035,
  E1: -0.035,
  E2: 0.035,
};
const valveLateral = (kind: "I1" | "I2" | "E1" | "E2") =>
  kind.startsWith("I") ? V12.VALVE_LATERAL : -V12.VALVE_LATERAL;

// ---------------------------------------------------------------------------
// 布局
// ---------------------------------------------------------------------------

export const ENGINE_LAYOUTS: Record<string, InstanceLayout> = {
  "mbt.engine.crankJournal": ({ index }) =>
    new THREE.Matrix4().makeRotationZ(-Math.PI / 2).setPosition(0.48 - index * 0.16, 0, 0),
  "mbt.engine.crankPin": ({ index }) => {
    const alpha = (index * 60 * Math.PI) / 180;
    return new THREE.Matrix4()
      .makeRotationZ(-Math.PI / 2)
      .setPosition(
        V12.CYL_X1 - index * V12.CYL_PITCH,
        V12.CRANK_R * Math.cos(alpha),
        V12.CRANK_R * Math.sin(alpha),
      );
  },
  "mbt.engine.crankWeb": ({ index }) => {
    const pin = Math.floor(index / 2);
    const sideOffset = index % 2 === 0 ? -0.032 : 0.032;
    const alpha = (pin * 60 * Math.PI) / 180;
    return new THREE.Matrix4()
      .makeRotationX(alpha)
      .multiply(new THREE.Matrix4().makeRotationZ(-Math.PI / 2))
      .setPosition(V12.CYL_X1 - pin * V12.CYL_PITCH + sideOffset, 0, 0);
  },
  "mbt.engine.flywheelBolt": ({ index }) => {
    const a = (index / 8) * Math.PI * 2;
    return new THREE.Matrix4()
      .makeRotationZ(-Math.PI / 2)
      .setPosition(0.635, Math.cos(a) * 0.125, Math.sin(a) * 0.125);
  },
  "mbt.engine.pumpElement": ({ index }) =>
    new THREE.Matrix4().makeTranslation(index * 0.022, 0, 0),
};

// ---------------------------------------------------------------------------
// 节点
// ---------------------------------------------------------------------------

export function makeEngineNodes(): NodeDef[] {
  const nodes: NodeDef[] = [
    {
      name: ENGINE_CRANK_NODE,
      parent: "root",
      pivot: enginePoint([0, 0, 0]),
      motion: "rotate",
      axis: "x",
      note: "曲轴（横置，轴线沿车体 X）",
    },
    {
      name: "MBT_Cam_L",
      parent: "root",
      pivot: bankPoint(-1, 0, V12.CAM_BASE, V12.CAM_LATERAL),
      motion: "rotate",
      axis: "x",
      note: "左列凸轮轴（半速）",
    },
    {
      name: "MBT_Cam_R",
      parent: "root",
      pivot: bankPoint(1, 0, V12.CAM_BASE, V12.CAM_LATERAL),
      motion: "rotate",
      axis: "x",
      note: "右列凸轮轴（半速）",
    },
    {
      name: ENGINE_IDLER_NODE,
      parent: "root",
      pivot: enginePoint([-0.52, 0.24, 0]),
      motion: "rotate",
      axis: "x",
      note: "正时惰轮",
    },
    {
      name: "MBT_Turbo_L",
      parent: "root",
      pivot: enginePoint([-0.66, 0.02, -0.48]),
      motion: "rotate",
      axis: "x",
      note: "左涡轮增压器转子",
    },
    {
      name: "MBT_Turbo_R",
      parent: "root",
      pivot: enginePoint([0.66, 0.02, -0.48]),
      motion: "rotate",
      axis: "x",
      note: "右涡轮增压器转子",
    },
    {
      name: "MBT_Fan_L",
      parent: "root",
      pivot: enginePoint([-0.8, 0.38, -0.72]),
      motion: "rotate",
      axis: "x",
      note: "左散热风扇",
    },
    {
      name: "MBT_Fan_R",
      parent: "root",
      pivot: enginePoint([0.8, 0.38, -0.72]),
      motion: "rotate",
      axis: "x",
      note: "右散热风扇",
    },
    {
      name: "MBT_WaterPump",
      parent: "root",
      pivot: enginePoint([0.56, 0.02, 0.28]),
      motion: "rotate",
      axis: "x",
      note: "水泵叶轮",
    },
  ];

  for (let i = 0; i < 12; i++) {
    const ordinal = i + 1;
    const info = cylinderInfo(i);
    const pose = solveCylinder(i, 0);
    const wrist = enginePoint([pose.wristPin.x, pose.wristPin.y, pose.wristPin.z]);
    const rodAngle =
      Math.atan2(-pose.rodDir.z, -pose.rodDir.y) / DEG;
    nodes.push({
      name: pistonNodeName(ordinal),
      parent: "root",
      pivot: wrist,
      rest_rotation: bankRot(info.side),
      motion: "translate",
      note: `缸 ${ordinal}（${info.side === 1 ? "右" : "左"}列）活塞 · θ=0`,
    });
    nodes.push({
      name: rodNodeName(ordinal),
      parent: "root",
      pivot: wrist,
      rest_rotation: [R3(rodAngle), 0, 0],
      motion: "rotate",
      axis: "x",
      note: `缸 ${ordinal} 连杆（大端随曲柄销，小端随活塞销）`,
    });
    for (const kind of ["I1", "I2", "E1", "E2"] as const) {
      const pivot = bankPoint(
        info.side,
        info.x + valveXOffsets[kind],
        V12.VALVE_SEAT_Y,
        valveLateral(kind),
      );
      nodes.push({
        name: valveNodeName(ordinal, kind),
        parent: "root",
        pivot,
        rest_rotation: bankRot(info.side),
        motion: "translate",
        axis: "y",
        note: `缸 ${ordinal} ${kind.startsWith("I") ? "进气" : "排气"}门 ${kind.slice(1)}`,
      });
      const springBase = bankPoint(
        info.side,
        info.x + valveXOffsets[kind],
        0.505,
        valveLateral(kind),
      );
      nodes.push({
        name: springNodeName(ordinal, kind),
        parent: "root",
        pivot: springBase,
        rest_rotation: bankRot(info.side),
        motion: "scalar",
        note: `缸 ${ordinal} 气门弹簧（随升程压缩）`,
      });
    }
    for (const kind of ["I", "E"] as const) {
      const lateral = kind === "I" ? V12.ROCKER_LATERAL : -V12.ROCKER_LATERAL;
      nodes.push({
        name: rockerNodeName(ordinal, kind),
        parent: "root",
        pivot: bankPoint(info.side, info.x, V12.ROCKER_Y, lateral),
        rest_rotation: bankRot(info.side),
        motion: "rotate",
        axis: "x",
        note: `缸 ${ordinal} ${kind === "I" ? "进" : "排"}气桥式摇臂`,
      });
      const rodLateral = kind === "I" ? V12.PUSHROD_LATERAL : -V12.PUSHROD_LATERAL;
      nodes.push({
        name: pushrodNodeName(ordinal, kind),
        parent: "root",
        pivot: bankPoint(info.side, info.x, 0.5, rodLateral),
        rest_rotation: bankRot(info.side),
        motion: "translate",
        axis: "y",
        note: `缸 ${ordinal} ${kind === "I" ? "进" : "排"}气推杆/挺杆`,
      });
    }
  }
  return nodes;
}

// ---------------------------------------------------------------------------
// 零件
// ---------------------------------------------------------------------------

function buildParts(): PartDefinition[] {
  const parts: PartDefinition[] = [];
  const add = (part: PartDefinition) => parts.push(part);

  // ======================= 曲轴箱 / 机体 =======================
  add({
    id: "mbt90.engine.crankcase",
    name_cn: "曲轴箱壳体",
    name_en: "crankcase",
    assembly: "engine_block",
    build_layer: 1,
    build_order: 100,
    geometry: MERGE(
      B(1.08, 0.3, 0.03, [0, 0, -0.4], 0.006),
      B(1.08, 0.3, 0.03, [0, 0, 0.4], 0.006),
      B(0.03, 0.3, 0.8, [-0.54, 0, 0], 0.006),
      B(0.03, 0.3, 0.8, [0.54, 0, 0], 0.006),
      B(1.04, 0.025, 0.74, [0, -0.15, 0], 0.006),
    ),
    material: "mbt_cast",
    mate: A(enginePoint([0, 0, 0])),
    source: "隧道式曲轴箱：两侧主壁 + 前后端板 + 底板，主轴承座由两根纵梁吊住。",
  });
  add({
    id: "mbt90.engine.oil_pan",
    name_cn: "油底壳",
    name_en: "oil sump",
    assembly: "engine_block",
    build_layer: 1,
    build_order: 101,
    geometry: MERGE(
      B(0.82, 0.11, 0.4, [0, -0.235, 0], 0.012),
      B(0.72, 0.05, 0.32, [0, -0.3, 0], 0.01),
    ),
    material: "mbt_cast_dark",
    mate: A(enginePoint([0, 0, 0])),
    source: "湿式油底壳 0.82×0.16×0.40（展示简化：真实为干式油底壳 + 回油泵）。",
  });
  add({
    id: "mbt90.engine.oil_pan_gasket",
    name_cn: "油底壳衬垫",
    name_en: "sump gasket",
    assembly: "engine_block",
    build_layer: 1,
    build_order: 102,
    geometry: MERGE(B(0.84, 0.008, 0.42, [0, -0.172, 0])),
    material: "mbt_rubber",
    mate: A(enginePoint([0, 0, 0])),
  });
  add({
    id: "mbt90.engine.oil_drain_plug",
    name_cn: "放油螺塞",
    name_en: "oil drain plug",
    assembly: "engine_block",
    build_layer: 1,
    build_order: 103,
    geometry: MERGE(C(0.022, 0.03, [0, -0.33, 0], 16)),
    material: "mbt_steel",
    mate: A(enginePoint([0.22, 0, 0.08])),
  });
  add({
    id: "mbt90.engine.timing_cover",
    name_cn: "正时齿轮盖",
    name_en: "timing gear cover",
    assembly: "engine_block",
    build_layer: 1,
    build_order: 104,
    geometry: MERGE(
      B(0.03, 0.68, 0.54, [-0.565, 0.2, 0], 0.008),
      B(0.024, 0.18, 0.2, [-0.582, 0, 0], 0.006),
    ),
    material: "mbt_cast",
    mate: A(enginePoint([0, 0, 0])),
  });
  add({
    id: "mbt90.engine.flywheel_housing",
    name_cn: "飞轮壳",
    name_en: "flywheel housing",
    assembly: "engine_block",
    build_layer: 1,
    build_order: 105,
    geometry: MERGE(
      B(0.1, 0.6, 0.6, [0.575, 0, 0], 0.01),
      B(0.06, 0.5, 0.5, [0.62, 0, 0], 0.01),
    ),
    material: "mbt_cast",
    mate: A(enginePoint([0, 0, 0])),
  });
  for (const z of [-0.095, 0.095]) {
    add({
      id: `mbt90.engine.bearing_rail_${z > 0 ? "r" : "l"}`,
      name_cn: "主轴承梁",
      name_en: "main bearing rail",
      assembly: "crankcase",
      build_layer: 1,
      build_order: 106,
      geometry: MERGE(B(1.0, 0.028, 0.022, [0, -0.066, z], 0.004)),
      material: "mbt_cast",
      mate: A(enginePoint([0, 0, 0])),
    });
  }
  for (let j = 0; j < 7; j++) {
    const x = 0.48 - j * 0.16;
    const id = `mbt90.engine.main_saddle_${j + 1}`;
    add({
      id,
      name_cn: `主轴承座 ${j + 1}`,
      name_en: `main bearing saddle ${j + 1}`,
      assembly: "crankcase",
      build_layer: 1,
      build_order: 110,
      geometry: MERGE(
        T(0.078, 0.047, 0.052, [0, 0, 0], 28),
        B(0.05, 0.07, 0.2, [0, -0.055, 0], 0.006),
      ),
      material: "mbt_cast",
      mate: A(enginePoint([x, 0, 0])),
    });
    add({
      id: `mbt90.engine.main_shell_${j + 1}`,
      name_cn: `主轴瓦 ${j + 1}`,
      name_en: `main bearing shell ${j + 1}`,
      assembly: "crankcase",
      build_layer: 1,
      build_order: 111,
      geometry: MERGE(T(0.0472, 0.0432, 0.04, [0, 0, 0], 28)),
      material: "mbt_steel_dark",
      mate: A(enginePoint([x, 0, 0])),
      source: "主轴瓦：内径比轴颈大 1.2mm（油膜），外径与座孔留 0.8mm 装配间隙。",
    });
  }
  for (const side of [-1, 1] as const) {
    add({
      id: `mbt90.engine.bank_block_${side === 1 ? "r" : "l"}`,
      name_cn: `${side === 1 ? "右" : "左"}列缸体`,
      name_en: `${side === 1 ? "right" : "left"} cylinder bank`,
      assembly: "engine_block",
      build_layer: 1,
      build_order: 115,
      geometry: {
        type: "kit",
        kit: "bankBlock",
        params: { length: 1.02, width: 0.21, height: 0.32, wall: 0.02 },
      },
      material: "mbt_cast",
      mate: A(bankPoint(side, 0, 0.305, 0), bankRot(side)),
      source: "V 列缸体：U 形水套壁（长 1.02、宽 0.21、高 0.32），内腔容 6 只缸套。",
    });
  }
  for (let k = 0; k < 6; k++) {
    add({
      id: `mbt90.engine.case_rib_${k + 1}`,
      name_cn: `机体加强肋 ${k + 1}`,
      name_en: `crankcase rib ${k + 1}`,
      assembly: "crankcase",
      build_layer: 1,
      build_order: 116,
      geometry: MERGE(B(0.024, 0.1, 0.52, [0, -0.22, 0], 0.003)),
      material: "mbt_cast",
      mate: A(enginePoint([-0.44 + k * 0.176, 0, 0])),
    });
  }
  for (let m = 0; m < 4; m++) {
    const x = m % 2 === 0 ? -0.46 : 0.46;
    const z = m < 2 ? -0.28 : 0.28;
    add({
      id: `mbt90.engine.mount_${m + 1}`,
      name_cn: `发动机机脚 ${m + 1}`,
      name_en: `engine mount ${m + 1}`,
      assembly: "engine_block",
      build_layer: 1,
      build_order: 117,
      geometry: MERGE(
        B(0.18, 0.04, 0.12, [0, -0.32, 0], 0.006),
        B(0.05, 0.26, 0.05, [-0.06, -0.45, 0], 0.004),
        B(0.05, 0.26, 0.05, [0.06, -0.45, 0], 0.004),
        B(0.22, 0.03, 0.14, [0, -0.59, 0], 0.006),
      ),
      material: "mbt_steel_dark",
      mate: A(enginePoint([x, 0, z])),
      source: "机脚：橡胶垫上方托架 + 两根立柱落到车体底甲板（y=0.46）。",
    });
  }
  add({
    id: "mbt90.engine.front_eye",
    name_cn: "前端吊装耳",
    name_en: "front lifting eye",
    assembly: "engine_block",
    build_layer: 1,
    build_order: 118,
    geometry: MERGE(B(0.16, 0.03, 0.06, [0, 0, 0], 0.004), B(0.05, 0.1, 0.05, [0, -0.05, 0], 0.003)),
    material: "mbt_steel",
    mate: A(enginePoint([-0.1, 0.45, 0.55])),
  });
  add({
    id: "mbt90.engine.rear_eye",
    name_cn: "后端吊装耳",
    name_en: "rear lifting eye",
    assembly: "engine_block",
    build_layer: 1,
    build_order: 118,
    geometry: MERGE(B(0.16, 0.03, 0.06, [0, 0, 0], 0.004), B(0.05, 0.1, 0.05, [0, -0.05, 0], 0.003)),
    material: "mbt_steel",
    mate: A(enginePoint([0.4, 0.18, 0.2])),
  });

  // ======================= 曲轴 =======================
  add({
    id: "mbt90.engine.main_journals",
    name_cn: "主轴颈 ×7",
    name_en: "main journals",
    assembly: "crankshaft",
    build_layer: 1,
    build_order: 130,
    geometry: MERGE(C(0.042, 0.05, [0, 0, 0], 24)),
    material: "mbt_steel",
    node: ENGINE_CRANK_NODE,
    mate: A([0, 0, 0]),
    instances: 7,
    indexed: true,
    instance_nodes: Array.from({ length: 7 }, () => ENGINE_CRANK_NODE),
    instance_layout: "mbt.engine.crankJournal",
  });
  add({
    id: "mbt90.engine.crank_pins",
    name_cn: "曲柄销 ×6",
    name_en: "crank pins",
    assembly: "crankshaft",
    build_layer: 1,
    build_order: 131,
    geometry: MERGE(C(0.03, 0.06, [0, 0, 0], 24)),
    material: "mbt_steel",
    node: ENGINE_CRANK_NODE,
    mate: A([0, 0, 0]),
    instances: 6,
    indexed: true,
    instance_nodes: Array.from({ length: 6 }, () => ENGINE_CRANK_NODE),
    instance_layout: "mbt.engine.crankPin",
  });
  add({
    id: "mbt90.engine.crank_webs",
    name_cn: "曲柄臂 ×12",
    name_en: "crank webs",
    assembly: "crankshaft",
    build_layer: 1,
    build_order: 132,
    geometry: MERGE(
      C(0.096, 0.026, [0, 0, 0], 28),
      B(0.026, 0.12, 0.085, [0, -0.105, 0], 0.008),
    ),
    material: "mbt_steel",
    node: ENGINE_CRANK_NODE,
    mate: A([0, 0, 0]),
    instances: 12,
    indexed: true,
    instance_nodes: Array.from({ length: 12 }, () => ENGINE_CRANK_NODE),
    instance_layout: "mbt.engine.crankWeb",
  });
  add({
    id: "mbt90.engine.crank_nose",
    name_cn: "曲轴前端轴颈",
    name_en: "crank nose",
    assembly: "crankshaft",
    build_layer: 1,
    build_order: 133,
    geometry: MERGE(C(0.034, 0.1, [0, 0, 0], 20)),
    material: "mbt_steel",
    node: ENGINE_CRANK_NODE,
    mate: A([-0.6, 0, 0], [0, 0, -90]),
  });
  add({
    id: "mbt90.engine.damper_pulley",
    name_cn: "减振皮带轮",
    name_en: "vibration damper pulley",
    assembly: "crankshaft",
    build_layer: 1,
    build_order: 134,
    geometry: { type: "kit", kit: "pulley", params: { r: 0.085, w: 0.05 } },
    material: "mbt_cast_dark",
    node: ENGINE_CRANK_NODE,
    mate: A([-0.65, 0, 0], [0, 0, -90]),
  });
  add({
    id: "mbt90.engine.flywheel",
    name_cn: "飞轮",
    name_en: "flywheel",
    assembly: "crankshaft",
    build_layer: 1,
    build_order: 135,
    geometry: { type: "kit", kit: "flywheelAssembly", params: { r: 0.18, teeth: 118 } },
    material: "mbt_cast_dark",
    node: ENGINE_CRANK_NODE,
    mate: A([0.635, 0, 0]),
    source: "飞轮 ⌀360 + 118 齿起动齿圈，与起动机小齿轮啮合。",
  });
  add({
    id: "mbt90.engine.flywheel_bolts",
    name_cn: "飞轮螺栓 ×8",
    name_en: "flywheel bolts",
    assembly: "crankshaft",
    build_layer: 1,
    build_order: 136,
    geometry: MERGE(C(0.012, 0.024, [0, 0, 0], 10), C(0.018, 0.008, [0, 0, 0], 6)),
    material: "mbt_steel",
    node: ENGINE_CRANK_NODE,
    mate: A([0, 0, 0]),
    instances: 8,
    indexed: true,
    instance_nodes: Array.from({ length: 8 }, () => ENGINE_CRANK_NODE),
    instance_layout: "mbt.engine.flywheelBolt",
  });
  add({
    id: "mbt90.engine.crank_gear",
    name_cn: "曲轴正时齿轮",
    name_en: "crank timing gear",
    assembly: "timing",
    build_layer: 1,
    build_order: 137,
    geometry: { type: "kit", kit: "gearBlank", params: { teeth: 28, r: 0.075, w: 0.026, bore: 0.035 } },
    material: "mbt_steel",
    node: ENGINE_CRANK_NODE,
    mate: A([-0.45, 0, 0]),
  });
  add({
    id: "mbt90.engine.cam_gear_l",
    name_cn: "左凸轮轴正时齿轮",
    name_en: "left cam timing gear",
    assembly: "timing",
    build_layer: 2,
    build_order: 138,
    geometry: { type: "kit", kit: "gearBlank", params: { teeth: 56, r: 0.13, w: 0.024, bore: 0.03 } },
    material: "mbt_steel",
    node: ENGINE_CAM_NODES[0],
    mate: A([-0.45, 0, 0]),
  });
  add({
    id: "mbt90.engine.cam_gear_r",
    name_cn: "右凸轮轴正时齿轮",
    name_en: "right cam timing gear",
    assembly: "timing",
    build_layer: 2,
    build_order: 138,
    geometry: { type: "kit", kit: "gearBlank", params: { teeth: 56, r: 0.13, w: 0.024, bore: 0.03 } },
    material: "mbt_steel",
    node: ENGINE_CAM_NODES[1],
    mate: A([-0.45, 0, 0]),
  });
  add({
    id: "mbt90.engine.timing_idler_gear",
    name_cn: "正时惰轮",
    name_en: "timing idler gear",
    assembly: "timing",
    build_layer: 2,
    build_order: 139,
    geometry: { type: "kit", kit: "gearBlank", params: { teeth: 36, r: 0.095, w: 0.026, bore: 0.026 } },
    material: "mbt_steel",
    node: ENGINE_IDLER_NODE,
    mate: A([0, 0, 0]),
  });
  add({
    id: "mbt90.engine.timing_chain",
    name_cn: "正时链条",
    name_en: "timing chain",
    assembly: "timing",
    build_layer: 2,
    build_order: 139,
    geometry: MERGE(
      B(0.012, 0.02, 0.14, [-0.56, 0.12, 0], 0.002),
      B(0.012, 0.14, 0.02, [-0.56, 0.32, 0], 0.002),
      B(0.012, 0.08, 0.02, [-0.56, 0.42, 0.08], 0.002),
    ),
    material: "mbt_steel_dark",
    mate: A(enginePoint([0, 0, 0])),
  });

  // ======================= 活塞连杆（每缸独立成件） =======================
  for (let i = 0; i < 12; i++) {
    const ord = i + 1;
    const info = cylinderInfo(i);
    const side = info.side;
    const x = info.x;
    const beta = bankRot(side);
    const pad = String(ord).padStart(2, "0");

    add({
      id: `mbt90.engine.cyl${pad}_liner`,
      name_cn: `缸套 ${ord}`,
      name_en: `cylinder liner ${ord}`,
      assembly: "cylinder",
      build_layer: 1,
      build_order: 150,
      geometry: {
        type: "kit",
        kit: "liner",
        params: { inner: V12.BORE / 2, outer: 0.078, h: V12.LINER_TOP - V12.LINER_BOTTOM },
      },
      material: "mbt_cast",
      mate: A(bankPoint(side, x, (V12.LINER_TOP + V12.LINER_BOTTOM) / 2, 0), beta),
      source: "湿式缸套：内径 145、壁厚 5.5，顶缘法兰坐在缸体上平面。",
    });
    add({
      id: `mbt90.engine.cyl${pad}_piston`,
      name_cn: `活塞 ${ord}`,
      name_en: `piston ${ord}`,
      assembly: "piston_rod",
      build_layer: 1,
      build_order: 151,
      geometry: { type: "kit", kit: "dieselPiston", params: { r: V12.PISTON_R, crown: V12.PISTON_CROWN, skirt: V12.PISTON_SKIRT, grooveR: 0.0694 } },
      material: "mbt_alu",
      node: pistonNodeName(ord),
      mate: A([0, 0, 0]),
      source: "铝活塞：平顶、三道环槽；活塞销中心即节点原点，动画沿缸轴平移。",
    });
    for (let r = 0; r < 3; r++) {
      add({
        id: `mbt90.engine.cyl${pad}_ring${r + 1}`,
        name_cn: `活塞环 ${ord}-${r + 1}`,
        name_en: `piston ring ${ord}-${r + 1}`,
        assembly: "piston_rod",
        build_layer: 1,
        build_order: 152,
        geometry: MERGE(T(V12.RING_R_OUT, V12.RING_R_IN, V12.RING_H, [0, V12.RING_Y[r]!, 0], 28)),
        material: "mbt_steel_dark",
        node: pistonNodeName(ord),
        mate: A([0, 0, 0]),
      });
    }
    add({
      id: `mbt90.engine.cyl${pad}_piston_pin`,
      name_cn: `活塞销 ${ord}`,
      name_en: `piston pin ${ord}`,
      assembly: "piston_rod",
      build_layer: 1,
      build_order: 153,
      geometry: MERGE(C(V12.PIN_R, V12.PIN_LEN, [0, 0, 0], 20)),
      material: "mbt_steel",
      node: pistonNodeName(ord),
      mate: A([0, 0, 0], [0, 0, -90]),
    });
    for (const s of [-1, 1] as const) {
      add({
        id: `mbt90.engine.cyl${pad}_circlip_${s > 0 ? "r" : "l"}`,
        name_cn: `活塞销卡簧 ${ord}-${s > 0 ? "右" : "左"}`,
        name_en: `piston pin circlip ${ord}-${s > 0 ? "right" : "left"}`,
        assembly: "piston_rod",
        build_layer: 1,
        build_order: 154,
        geometry: MERGE(T(0.0215, 0.0195, 0.003, [0, s * 0.036, 0], 20)),
        material: "mbt_steel_dark",
        node: pistonNodeName(ord),
        mate: A([0, 0, 0], [0, 0, -90]),
      });
    }
    add({
      id: `mbt90.engine.cyl${pad}_connecting_rod`,
      name_cn: `连杆 ${ord}`,
      name_en: `connecting rod ${ord}`,
      assembly: "piston_rod",
      build_layer: 2,
      build_order: 160,
      geometry: { type: "kit", kit: "conRod", params: { length: V12.ROD_L, bigR: V12.ROD_BIG_R, bigBore: V12.ROD_BIG_BORE, smallR: V12.ROD_SMALL_R, smallBore: V12.ROD_SMALL_BORE, shankW: 0.032, shankT: 0.024 } },
      material: "mbt_steel",
      node: rodNodeName(ord),
      mate: A([0, 0, 0]),
      source: "锻钢连杆：大端剖分、小端压装衬套；节点原点在活塞销，局部 -Y 指向曲柄销。",
    });
    add({
      id: `mbt90.engine.cyl${pad}_rod_cap`,
      name_cn: `连杆盖 ${ord}`,
      name_en: `connecting rod cap ${ord}`,
      assembly: "piston_rod",
      build_layer: 2,
      build_order: 161,
      geometry: { type: "kit", kit: "rodCap", params: { bigR: V12.ROD_BIG_R, bigBore: V12.ROD_BIG_BORE, width: 0.032 } },
      material: "mbt_steel",
      node: rodNodeName(ord),
      mate: A([0, -V12.ROD_L, 0]),
    });
    for (const half of ["upper", "lower"] as const) {
      add({
        id: `mbt90.engine.cyl${pad}_rod_bearing_${half}`,
        name_cn: `连杆轴瓦 ${ord}-${half === "upper" ? "上" : "下"}`,
        name_en: `rod bearing ${ord}-${half}`,
        assembly: "piston_rod",
        build_layer: 2,
        build_order: 162,
        geometry: { type: "kit", kit: "rodBearing", params: { outer: 0.038, inner: 0.0315, width: 0.027 } },
        material: "mbt_steel_dark",
        node: rodNodeName(ord),
        mate: A([0, -V12.ROD_L, 0]),
      });
    }
    for (const s of [-1, 1] as const) {
      add({
        id: `mbt90.engine.cyl${pad}_rod_bolt_${s > 0 ? "r" : "l"}`,
        name_cn: `连杆螺栓 ${ord}-${s > 0 ? "右" : "左"}`,
        name_en: `rod bolt ${ord}-${s > 0 ? "right" : "left"}`,
        assembly: "piston_rod",
        build_layer: 2,
        build_order: 163,
        geometry: MERGE(C(0.0065, 0.06, [0, 0, 0], 10), C(0.011, 0.01, [0, 0.032, 0], 6)),
        material: "mbt_steel",
        node: rodNodeName(ord),
        mate: A([0, -V12.ROD_L, 0]),
      });
    }

    // 缸盖 / 气门座圈组
    add({
      id: `mbt90.engine.cyl${pad}_head`,
      name_cn: `缸盖 ${ord}`,
      name_en: `cylinder head ${ord}`,
      assembly: "cylinder",
      build_layer: 2,
      build_order: 200,
      geometry: { type: "kit", kit: "cylinderHead", params: { w: 0.152, d: 0.15, h: 0.078, wall: 0.012, vx: 0.035, vz: V12.VALVE_LATERAL } },
      material: "mbt_cast",
      mate: A(bankPoint(side, x, 0.485, 0), beta),
      source: "每缸独立缸盖（四气门）：四面壁 + 4 只气门座圈/导管，上下贯通便于观察气门动作。",
    });
    add({
      id: `mbt90.engine.cyl${pad}_head_gasket`,
      name_cn: `缸垫 ${ord}`,
      name_en: `head gasket ${ord}`,
      assembly: "cylinder",
      build_layer: 2,
      build_order: 199,
      geometry: MERGE(T(0.081, 0.0725, 0.004, [0, 0, 0], 32)),
      material: "mbt_steel_dark",
      mate: A(bankPoint(side, x, 0.469, 0), beta),
    });
    for (let b = 0; b < 4; b++) {
      const bx = b % 2 === 0 ? -0.062 : 0.062;
      const bz = b < 2 ? -0.062 : 0.062;
      add({
        id: `mbt90.engine.cyl${pad}_head_bolt_${b + 1}`,
        name_cn: `缸盖螺栓 ${ord}-${b + 1}`,
        name_en: `head bolt ${ord}-${b + 1}`,
        assembly: "cylinder",
        build_layer: 2,
        build_order: 201,
        geometry: MERGE(C(0.007, 0.1, [0, 0.05, 0], 12), C(0.011, 0.01, [0, 0.1, 0], 6)),
        material: "mbt_steel",
        mate: A(bankPoint(side, x + bx, 0.475, bz), beta),
      });
    }
    add({
      id: `mbt90.engine.cyl${pad}_injector`,
      name_cn: `喷油器 ${ord}`,
      name_en: `fuel injector ${ord}`,
      assembly: "fuel",
      build_layer: 3,
      build_order: 400,
      geometry: { type: "kit", kit: "injectorBody", params: { h: 0.14 } },
      material: "mbt_steel",
      mate: A(bankPoint(side, x, 0.57, 0), beta),
      source: "电控高压共轨喷油器：顶部电磁阀 + 中段高压接头 + 针阀偶件。",
    });
    add({
      id: `mbt90.engine.cyl${pad}_injector_sleeve`,
      name_cn: `喷油器护套 ${ord}`,
      name_en: `injector sleeve ${ord}`,
      assembly: "fuel",
      build_layer: 3,
      build_order: 401,
      geometry: MERGE(T(0.026, 0.022, 0.08, [0, 0, 0], 20)),
      material: "mbt_steel_dark",
      mate: A(bankPoint(side, x, 0.535, 0), beta),
    });
    add({
      id: `mbt90.engine.cyl${pad}_glow_plug`,
      name_cn: `预热塞 ${ord}`,
      name_en: `glow plug ${ord}`,
      assembly: "fuel",
      build_layer: 3,
      build_order: 402,
      geometry: MERGE(C(0.007, 0.06, [0, 0, 0], 12), C(0.011, 0.015, [0, 0.03, 0], 8)),
      material: "mbt_glow",
      mate: A(bankPoint(side, x - 0.065, 0.51, 0), beta),
    });
    add({
      id: `mbt90.engine.cyl${pad}_intake_port`,
      name_cn: `进气道 ${ord}`,
      name_en: `intake port ${ord}`,
      assembly: "cylinder",
      build_layer: 3,
      build_order: 403,
      geometry: MERGE(C(0.03, 0.07, [0, 0, 0], 18)),
      material: "mbt_alu",
      mate: A(bankPoint(side, x, 0.52, side * 0.14), [side * V12.HALF_V + 90, 0, 0]),
    });
    add({
      id: `mbt90.engine.cyl${pad}_exhaust_port`,
      name_cn: `排气道 ${ord}`,
      name_en: `exhaust port ${ord}`,
      assembly: "cylinder",
      build_layer: 3,
      build_order: 404,
      geometry: MERGE(C(0.032, 0.07, [0, 0, 0], 18)),
      material: "mbt_cast_dark",
      mate: A(bankPoint(side, x, 0.44, side * 0.14), [side * V12.HALF_V + 90, 0, 0]),
    });
    add({
      id: `mbt90.engine.cyl${pad}_pressure_sensor`,
      name_cn: `缸压传感器 ${ord}`,
      name_en: `cylinder pressure sensor ${ord}`,
      assembly: "fuel",
      build_layer: 3,
      build_order: 405,
      geometry: MERGE(C(0.009, 0.045, [0, 0, 0], 12), C(0.013, 0.012, [0, 0.026, 0], 6)),
      material: "mbt_brass",
      mate: A(bankPoint(side, x + 0.06, 0.5, -side * 0.07), beta),
    });

    // 4 气门 / 弹簧 / 弹簧座 / 桥式摇臂 / 推杆
    for (const kind of ["I1", "I2", "E1", "E2"] as const) {
      add({
        id: `mbt90.engine.cyl${pad}_valve_${kind.toLowerCase()}`,
        name_cn: `气门 ${ord}-${kind}`,
        name_en: `valve ${ord}-${kind}`,
        assembly: "valvetrain",
        build_layer: 2,
        build_order: 300,
        geometry: { type: "kit", kit: "dieselValve", params: { discR: V12.VALVE_DISC_R, stemR: V12.VALVE_STEM_R, len: V12.VALVE_STEM_LEN } },
        material: "mbt_steel",
        node: valveNodeName(ord, kind),
        mate: A([0, 0, 0]),
        source: "进气门头部直径 52mm，排气门 48mm（展示统一 52）；升程 10mm。",
      });
      add({
        id: `mbt90.engine.cyl${pad}_spring_${kind.toLowerCase()}`,
        name_cn: `气门弹簧 ${ord}-${kind}`,
        name_en: `valve spring ${ord}-${kind}`,
        assembly: "valvetrain",
        build_layer: 2,
        build_order: 301,
        geometry: { type: "kit", kit: "valveSpring", params: { r: 0.019, free: V12.SPRING_FREE } },
        material: "mbt_steel",
        node: springNodeName(ord, kind),
        mate: A([0, 0, 0]),
      });
      add({
        id: `mbt90.engine.cyl${pad}_retainer_${kind.toLowerCase()}`,
        name_cn: `气门弹簧座 ${ord}-${kind}`,
        name_en: `valve retainer ${ord}-${kind}`,
        assembly: "valvetrain",
        build_layer: 2,
        build_order: 302,
        geometry: MERGE(T(0.019, 0.0085, 0.008, [0, 0, 0], 20), C(0.011, 0.008, [0, 0.006, 0], 14)),
        material: "mbt_steel_dark",
        node: valveNodeName(ord, kind),
        mate: A([0, 0.098, 0]),
      });
    }
    for (const kind of ["I", "E"] as const) {
      add({
        id: `mbt90.engine.cyl${pad}_rocker_${kind.toLowerCase()}`,
        name_cn: `桥式摇臂 ${ord}-${kind}`,
        name_en: `bridged rocker ${ord}-${kind}`,
        assembly: "valvetrain",
        build_layer: 2,
        build_order: 303,
        geometry: {
          type: "kit",
          kit: "rockerBridge",
          params: { arm: 0.039, span: 0.07 },
          ...(kind === "I" ? { mirror: "z" as const } : {}),
        },
        material: "mbt_steel_dark",
        node: rockerNodeName(ord, kind),
        mate: A([0, 0, 0]),
      });
      add({
        id: `mbt90.engine.cyl${pad}_pushrod_${kind.toLowerCase()}`,
        name_cn: `推杆/挺杆 ${ord}-${kind}`,
        name_en: `pushrod & tappet ${ord}-${kind}`,
        assembly: "valvetrain",
        build_layer: 2,
        build_order: 304,
        geometry: { type: "kit", kit: "pushrodAssembly", params: { length: 0.13, r: 0.007 } },
        material: "mbt_steel",
        node: pushrodNodeName(ord, kind),
        mate: A([0, 0, 0]),
      });
    }
  }

  // ======================= 凸轮轴 / 摇臂轴 =======================
  for (const side of [-1, 1] as const) {
    const tag = side === 1 ? "r" : "l";
    add({
      id: `mbt90.engine.camshaft_${tag}`,
      name_cn: `${side === 1 ? "右" : "左"}列凸轮轴`,
      name_en: `${side === 1 ? "right" : "left"} camshaft`,
      assembly: "valvetrain",
      build_layer: 2,
      build_order: 310,
      geometry: { type: "kit", kit: "camshaftAssembly", params: { length: 0.94, shaftR: 0.022, lobeR: 0.029, lobeW: 0.016, pitch: V12.CYL_PITCH, x1: V12.CYL_X1 } },
      material: "mbt_steel",
      node: side === 1 ? "MBT_Cam_R" : "MBT_Cam_L",
      mate: A([0, 0, 0]),
      source: "整体式凸轮轴（半速）：12 对凸轮分别驱动进/排气桥式摇臂。",
    });
    for (let j = 0; j < 7; j++) {
      add({
        id: `mbt90.engine.cam_cap_${tag}_${j + 1}`,
        name_cn: `${side === 1 ? "右" : "左"}凸轮轴轴承盖 ${j + 1}`,
        name_en: `cam bearing cap ${tag}-${j + 1}`,
        assembly: "valvetrain",
        build_layer: 2,
        build_order: 311,
        geometry: MERGE(
          T(0.032, 0.0235, 0.03, [0, 0, 0], 20),
          B(0.06, 0.08, 0.03, [0, -0.05, 0], 0.004),
        ),
        material: "mbt_cast",
        mate: A(bankPoint(side, 0.48 - j * 0.16, V12.CAM_BASE, 0)),
      });
    }
    for (const kind of ["I", "E"] as const) {
      const lat = kind === "I" ? V12.ROCKER_LATERAL : -V12.ROCKER_LATERAL;
      add({
        id: `mbt90.engine.rocker_shaft_${tag}_${kind.toLowerCase()}`,
        name_cn: `${side === 1 ? "右" : "左"}${kind === "I" ? "进" : "排"}气摇臂轴`,
        name_en: `${tag} ${kind} rocker shaft`,
        assembly: "valvetrain",
        build_layer: 2,
        build_order: 312,
        geometry: MERGE(C(0.012, 1.0, [0, 0, 0], 16)),
        material: "mbt_steel",
        mate: A(bankPoint(side, 0, V12.ROCKER_Y, lat), [0, 0, -90]),
        source: "摇臂轴贯穿 6 缸，桥式摇臂在轴上摆动。",
      });
    }
  }

  // ======================= 供油系统 =======================
  add({
    id: "mbt90.engine.high_pressure_pump",
    name_cn: "高压油泵",
    name_en: "high-pressure fuel pump",
    assembly: "fuel",
    build_layer: 3,
    build_order: 410,
    geometry: MERGE(
      B(0.3, 0.18, 0.18, [0, 0, 0], 0.012),
      C(0.055, 0.12, [0.18, 0, 0], 20),
      C(0.04, 0.08, [-0.18, 0, 0], 16),
    ),
    material: "mbt_alu",
    mate: A(enginePoint([-0.72, 0.05, 0.3])),
  });
  add({
    id: "mbt90.engine.pump_elements",
    name_cn: "高压泵柱塞 ×12",
    name_en: "pump elements",
    assembly: "fuel",
    build_layer: 3,
    build_order: 411,
    geometry: MERGE(C(0.014, 0.06, [0, 0, 0], 14), C(0.02, 0.012, [0, 0.03, 0], 8)),
    material: "mbt_steel",
    mate: A(enginePoint([-0.82, 0.18, 0.3])),
    instances: 12,
    indexed: true,
    instance_layout: "mbt.engine.pumpElement",
  });
  add({
    id: "mbt90.engine.fuel_rail",
    name_cn: "共轨油管",
    name_en: "common fuel rail",
    assembly: "fuel",
    build_layer: 3,
    build_order: 412,
    geometry: MERGE(C(0.026, 1.0, [0, 0, 0], 16)),
    material: "mbt_steel",
    mate: A(enginePoint([-0.7, 0.36, 0.3]), [0, 0, -90]),
  });
  add({
    id: "mbt90.engine.fuel_filter",
    name_cn: "燃油滤清器",
    name_en: "fuel filter",
    assembly: "fuel",
    build_layer: 3,
    build_order: 413,
    geometry: MERGE(
      C(0.06, 0.22, [0, 0, 0], 20),
      C(0.07, 0.03, [0, 0.11, 0], 20),
      C(0.07, 0.03, [0, -0.11, 0], 20),
    ),
    material: "mbt_paint_dark",
    mate: A(enginePoint([-0.62, 0.0, 0.33])),
  });
  add({
    id: "mbt90.engine.water_separator",
    name_cn: "油水分离器",
    name_en: "water separator",
    assembly: "fuel",
    build_layer: 3,
    build_order: 414,
    geometry: MERGE(C(0.05, 0.16, [0, 0, 0], 18), C(0.058, 0.025, [0, 0.08, 0], 18)),
    material: "mbt_alu",
    mate: A(enginePoint([-0.72, -0.1, 0.38])),
  });
  add({
    id: "mbt90.engine.lift_pump",
    name_cn: "输油泵",
    name_en: "lift pump",
    assembly: "fuel",
    build_layer: 3,
    build_order: 415,
    geometry: MERGE(C(0.04, 0.1, [0, 0, 0], 16), C(0.045, 0.02, [0, 0.055, 0], 16)),
    material: "mbt_steel_dark",
    mate: A(enginePoint([-0.58, -0.02, 0.4])),
  });
  for (const [tag, from, to] of [
    ["supply", enginePoint([-0.5, 0.02, 0.36]), enginePoint([0.32, 0.02, 0.4])],
    ["return", enginePoint([0.32, -0.1, 0.38]), enginePoint([-0.52, 0.04, 0.3])],
  ] as const) {
    add({
      id: `mbt90.engine.fuel_line_${tag}`,
      name_cn: `燃油${tag === "supply" ? "供" : "回"}油管`,
      name_en: `${tag} fuel line`,
      assembly: "fuel",
      build_layer: 3,
      build_order: 416,
      geometry: { type: "weld", from, to, radius: 0.009, seed: tag === "supply" ? 3 : 4 },
      material: "mbt_steel_dark",
      mate: A(enginePoint([0, 0, 0])),
    });
  }
  add({
    id: "mbt90.engine.shutoff_solenoid",
    name_cn: "断油电磁阀",
    name_en: "shutoff solenoid",
    assembly: "fuel",
    build_layer: 3,
    build_order: 417,
    geometry: MERGE(C(0.026, 0.07, [0, 0, 0], 16), C(0.012, 0.03, [0, 0.05, 0], 10)),
    material: "mbt_alu",
    mate: A(enginePoint([-0.52, 0.22, 0.24])),
  });
  // 12 根高压油管：泵 → 缸盖喷油器（沿发动机顶部走线）
  for (let i = 0; i < 12; i++) {
    const info = cylinderInfo(i);
    const to = bankPoint(info.side, info.x, 0.64, 0);
    add({
      id: `mbt90.engine.injector_line_${String(i + 1).padStart(2, "0")}`,
      name_cn: `高压油管 ${i + 1}`,
      name_en: `injector line ${i + 1}`,
      assembly: "fuel",
      build_layer: 3,
      build_order: 418,
      geometry: MERGE(
        { type: "weld", from: enginePoint([-0.46 - i * 0.01, 0.72, 0.34]), to: enginePoint([0, 0.72, 0.34]), radius: 0.006, seed: i + 10 },
        { type: "weld", from: enginePoint([0, 0.72, 0.34]), to, radius: 0.006, seed: i + 20 },
      ),
      material: "mbt_steel",
      mate: A(enginePoint([0, 0, 0])),
    });
  }

  // ======================= 涡轮增压 / 进排气 =======================
  for (const side of [-1, 1] as const) {
    const tag = side === 1 ? "r" : "l";
    const turbo = enginePoint([side * 0.66, 0.02, -0.48]);
    add({
      id: `mbt90.engine.turbine_housing_${tag}`,
      name_cn: `${side === 1 ? "右" : "左"}涡轮壳`,
      name_en: `${tag} turbine housing`,
      assembly: "turbo",
      build_layer: 3,
      build_order: 450,
      geometry: { type: "kit", kit: "turboHousing", params: { r: 0.082, w: 0.085 } },
      material: "mbt_cast_dark",
      mate: A(turbo),
    });
    add({
      id: `mbt90.engine.compressor_housing_${tag}`,
      name_cn: `${side === 1 ? "右" : "左"}压气机壳`,
      name_en: `${tag} compressor housing`,
      assembly: "turbo",
      build_layer: 3,
      build_order: 451,
      geometry: { type: "kit", kit: "turboHousing", params: { r: 0.078, w: 0.075 } },
      material: "mbt_alu",
      mate: A([turbo[0] + (side === 1 ? 0.02 : -0.02), turbo[1], turbo[2] + 0.02]),
    });
    add({
      id: `mbt90.engine.turbo_rotor_${tag}`,
      name_cn: `${side === 1 ? "右" : "左"}增压器转子（涡轮+压气机叶轮）`,
      name_en: `${tag} turbo rotor`,
      assembly: "turbo",
      build_layer: 3,
      build_order: 452,
      geometry: { type: "kit", kit: "turboRotor", params: { hubR: 0.018, wheelR: 0.052, bladeCount: 9 } },
      material: "mbt_tungsten",
      node: side === 1 ? "MBT_Turbo_R" : "MBT_Turbo_L",
      mate: A([0, 0, 0]),
    });
    add({
      id: `mbt90.engine.turbo_bearing_${tag}`,
      name_cn: `${side === 1 ? "右" : "左"}增压器浮动轴承`,
      name_en: `${tag} turbo bearing`,
      assembly: "turbo",
      build_layer: 3,
      build_order: 453,
      geometry: MERGE(T(0.024, 0.019, 0.045, [0, 0, 0], 20)),
      material: "mbt_brass",
      mate: A(turbo),
    });
    add({
      id: `mbt90.engine.wastegate_${tag}`,
      name_cn: `${side === 1 ? "右" : "左"}废气旁通阀`,
      name_en: `${tag} wastegate`,
      assembly: "turbo",
      build_layer: 3,
      build_order: 454,
      geometry: MERGE(C(0.032, 0.04, [0, 0, 0], 18), C(0.008, 0.08, [0, 0.05, 0], 8)),
      material: "mbt_cast_dark",
      mate: A([turbo[0], turbo[1] + 0.09, turbo[2]]),
    });
    add({
      id: `mbt90.engine.wastegate_actuator_${tag}`,
      name_cn: `${side === 1 ? "右" : "左"}旁通阀执行器`,
      name_en: `${tag} wastegate actuator`,
      assembly: "turbo",
      build_layer: 3,
      build_order: 455,
      geometry: MERGE(C(0.034, 0.05, [0, 0, 0], 18)),
      material: "mbt_alu",
      mate: A([turbo[0], turbo[1] + 0.14, turbo[2] + 0.02]),
    });
    add({
      id: `mbt90.engine.turbo_oil_feed_${tag}`,
      name_cn: `${side === 1 ? "右" : "左"}增压器进油管`,
      name_en: `${tag} turbo oil feed`,
      assembly: "turbo",
      build_layer: 3,
      build_order: 456,
      geometry: { type: "weld", from: [turbo[0], turbo[1] + 0.12, turbo[2]], to: [turbo[0], enginePoint([0, 0.1, 0.2])[1], enginePoint([0, 0.1, 0.2])[2]], radius: 0.008, seed: side + 30 },
      material: "mbt_copper",
      mate: A(enginePoint([0, 0, 0])),
    });
    add({
      id: `mbt90.engine.exhaust_manifold_${tag}`,
      name_cn: `${side === 1 ? "右" : "左"}排气总管`,
      name_en: `${tag} exhaust manifold`,
      assembly: "turbo",
      build_layer: 3,
      build_order: 457,
      geometry: MERGE(C(0.045, 0.9, [0, 0, 0], 20), C(0.055, 0.05, [side * 0.42, 0, 0], 18)),
      material: "mbt_rust",
      mate: A(bankPoint(side, 0, 0.39, side * 0.16), [0, 0, -90]),
    });
    add({
      id: `mbt90.engine.exhaust_downpipe_${tag}`,
      name_cn: `${side === 1 ? "右" : "左"}增压器排气管`,
      name_en: `${tag} turbo downpipe`,
      assembly: "turbo",
      build_layer: 3,
      build_order: 458,
      geometry: { type: "weld", from: bankPoint(side, side * 0.42, 0.39, side * 0.16), to: turbo, radius: 0.042, seed: side + 40 },
      material: "mbt_rust",
      mate: A(enginePoint([0, 0, 0])),
    });
    add({
      id: `mbt90.engine.intake_plenum_${tag}`,
      name_cn: `${side === 1 ? "右" : "左"}进气总管`,
      name_en: `${tag} intake plenum`,
      assembly: "turbo",
      build_layer: 3,
      build_order: 459,
      geometry: MERGE(B(0.86, 0.1, 0.12, [0, 0, 0], 0.012), C(0.06, 0.16, [side * 0.42, 0.02, 0], 18)),
      material: "mbt_alu",
      mate: A(bankPoint(side, 0, 0.55, side * 0.19)),
    });
    add({
      id: `mbt90.engine.boost_pipe_${tag}`,
      name_cn: `${side === 1 ? "右" : "左"}增压管`,
      name_en: `${tag} boost pipe`,
      assembly: "turbo",
      build_layer: 3,
      build_order: 460,
      geometry: { type: "weld", from: [turbo[0] + (side === 1 ? 0.08 : -0.08), turbo[1], turbo[2]], to: bankPoint(side, side * 0.42, 0.55, side * 0.15), radius: 0.028, seed: side + 50 },
      material: "mbt_alu",
      mate: A(enginePoint([0, 0, 0])),
    });
  }
  add({
    id: "mbt90.engine.intercooler_core",
    name_cn: "中冷器芯",
    name_en: "intercooler core",
    assembly: "turbo",
    build_layer: 3,
    build_order: 461,
    geometry: { type: "kit", kit: "intercoolerCore", params: { w: 0.52, h: 0.4, d: 0.11 } },
    material: "mbt_alu",
    mate: A(enginePoint([0, 0.32, -0.72])),
    source: "空-空中冷器：增压空气从压气机进入芯体，冷却后进左右进气总管。",
  });
  for (const side of [-1, 1] as const) {
    add({
      id: `mbt90.engine.intercooler_tank_${side === 1 ? "r" : "l"}`,
      name_cn: `${side === 1 ? "右" : "左"}中冷器气室`,
      name_en: `${side === 1 ? "right" : "left"} intercooler tank`,
      assembly: "turbo",
      build_layer: 3,
      build_order: 462,
      geometry: MERGE(B(0.06, 0.36, 0.1, [0, 0, 0], 0.008)),
      material: "mbt_alu",
      mate: A(enginePoint([side * 0.28, 0.32, -0.72])),
    });
  }

  // ======================= 冷却 =======================
  for (const side of [-1, 1] as const) {
    const tag = side === 1 ? "r" : "l";
    add({
      id: `mbt90.engine.radiator_core_${tag}`,
      name_cn: `${side === 1 ? "右" : "左"}散热器芯`,
      name_en: `${tag} radiator core`,
      assembly: "cooling",
      build_layer: 3,
      build_order: 500,
      geometry: { type: "kit", kit: "radiatorCore", params: { w: 0.44, h: 0.58, d: 0.09 } },
      material: "mbt_copper",
      mate: A(enginePoint([side * 0.86, 0.32, -0.76])),
    });
    add({
      id: `mbt90.engine.fan_${tag}`,
      name_cn: `${side === 1 ? "右" : "左"}冷却风扇`,
      name_en: `${tag} cooling fan`,
      assembly: "cooling",
      build_layer: 3,
      build_order: 501,
      geometry: { type: "kit", kit: "v12Fan", params: { r: 0.22 } },
      material: "mbt_alu",
      node: side === 1 ? "MBT_Fan_R" : "MBT_Fan_L",
      mate: A([0, 0, 0]),
      source: "两台 ⌀440 轴流风扇，由曲轴皮带经 1.55 增速驱动。",
    });
    add({
      id: `mbt90.engine.fan_shroud_${tag}`,
      name_cn: `${side === 1 ? "右" : "左"}风扇导风罩`,
      name_en: `${tag} fan shroud`,
      assembly: "cooling",
      build_layer: 3,
      build_order: 502,
      geometry: MERGE(T(0.235, 0.22, 0.16, [0, 0, 0], 28)),
      material: "mbt_paint_dark",
      mate: A(enginePoint([side * 0.8, 0.38, -0.68]), [0, 0, 90]),
    });
    add({
      id: `mbt90.engine.radiator_tank_top_${tag}`,
      name_cn: `${side === 1 ? "右" : "左"}散热器上水室`,
      name_en: `${tag} radiator top tank`,
      assembly: "cooling",
      build_layer: 3,
      build_order: 503,
      geometry: MERGE(B(0.46, 0.05, 0.1, [0, 0, 0], 0.008)),
      material: "mbt_alu",
      mate: A(enginePoint([side * 0.86, 0.63, -0.76])),
    });
    add({
      id: `mbt90.engine.radiator_tank_bottom_${tag}`,
      name_cn: `${side === 1 ? "右" : "左"}散热器下水室`,
      name_en: `${tag} radiator bottom tank`,
      assembly: "cooling",
      build_layer: 3,
      build_order: 504,
      geometry: MERGE(B(0.46, 0.05, 0.1, [0, 0, 0], 0.008)),
      material: "mbt_alu",
      mate: A(enginePoint([side * 0.86, 0.01, -0.76])),
    });
  }
  add({
    id: "mbt90.engine.water_pump",
    name_cn: "冷却水泵",
    name_en: "coolant pump",
    assembly: "cooling",
    build_layer: 3,
    build_order: 505,
    geometry: MERGE(
      C(0.065, 0.08, [0, 0, 0], 22),
      C(0.07, 0.012, [0, -0.045, 0], 22),
      C(0.02, 0.12, [0.09, 0, 0], 12),
    ),
    material: "mbt_cast",
    mate: A(enginePoint([0.78, 0.05, 0.25])),
  });
  add({
    id: "mbt90.engine.water_pump_impeller",
    name_cn: "水泵叶轮",
    name_en: "coolant pump impeller",
    assembly: "cooling",
    build_layer: 3,
    build_order: 506,
    geometry: MERGE(C(0.055, 0.018, [0, 0, 0], 24), ...Array.from({ length: 6 }, (_, i) => {
      const a = (i / 6) * Math.PI * 2;
      return B(0.02, 0.02, 0.05, [Math.cos(a) * 0.03, 0, Math.sin(a) * 0.03], 0.003);
    })),
    material: "mbt_brass",
    node: "MBT_WaterPump",
    mate: A([0, 0.02, 0], [0, 0, -90]),
  });
  add({
    id: "mbt90.engine.thermostat_housing",
    name_cn: "节温器壳",
    name_en: "thermostat housing",
    assembly: "cooling",
    build_layer: 3,
    build_order: 507,
    geometry: MERGE(C(0.05, 0.08, [0, 0, 0], 18), C(0.06, 0.02, [0, 0.05, 0], 18), C(0.02, 0.06, [0.05, 0, 0], 12)),
    material: "mbt_alu",
    mate: A(enginePoint([0.74, 0.16, 0.25])),
  });
  add({
    id: "mbt90.engine.thermostat",
    name_cn: "节温器",
    name_en: "thermostat",
    assembly: "cooling",
    build_layer: 3,
    build_order: 508,
    geometry: MERGE(T(0.04, 0.032, 0.03, [0, 0, 0], 20), C(0.01, 0.05, [0, 0.04, 0], 10)),
    material: "mbt_brass",
    mate: A(enginePoint([0.74, 0.16, 0.25])),
  });
  for (let h = 0; h < 2; h++) {
    for (const side of [-1, 1] as const) {
      add({
        id: `mbt90.engine.coolant_hose_${h}_${side === 1 ? "r" : "l"}`,
        name_cn: `冷却水管 ${h + 1}（${side === 1 ? "右" : "左"}）`,
        name_en: `coolant hose ${h + 1} ${side === 1 ? "right" : "left"}`,
        assembly: "cooling",
        build_layer: 3,
        build_order: 509,
        geometry: {
          type: "weld",
          from: enginePoint([side * 0.86, h === 0 ? 0.66 : 0.04, -0.7]),
          to: enginePoint([0.42, h === 0 ? 0.22 : 0.0, 0.26]),
          radius: 0.022,
          seed: 60 + h * 2 + (side === 1 ? 1 : 0),
        },
        material: "mbt_rubber_worn",
        mate: A(enginePoint([0, 0, 0])),
      });
    }
  }
  add({
    id: "mbt90.engine.expansion_tank",
    name_cn: "膨胀水箱",
    name_en: "expansion tank",
    assembly: "cooling",
    build_layer: 3,
    build_order: 510,
    geometry: MERGE(C(0.09, 0.2, [0, 0, 0], 20), C(0.035, 0.04, [0, 0.12, 0], 12)),
    material: "mbt_alu",
    mate: A(enginePoint([0.56, 0.38, -0.7])),
  });

  // ======================= 润滑 =======================
  add({
    id: "mbt90.engine.oil_pump",
    name_cn: "机油泵",
    name_en: "oil pump",
    assembly: "lube",
    build_layer: 3,
    build_order: 520,
    geometry: MERGE(
      C(0.06, 0.08, [0, 0, 0], 20),
      C(0.03, 0.06, [0.07, 0, 0], 14),
      B(0.1, 0.1, 0.08, [0, -0.06, 0], 0.008),
    ),
    material: "mbt_cast",
    mate: A(enginePoint([-0.3, -0.2, 0.12])),
  });
  add({
    id: "mbt90.engine.oil_pickup",
    name_cn: "机油集滤器",
    name_en: "oil pickup",
    assembly: "lube",
    build_layer: 3,
    build_order: 521,
    geometry: MERGE(C(0.025, 0.16, [0, 0, 0], 14), B(0.14, 0.02, 0.12, [0, -0.09, 0], 0.004)),
    material: "mbt_steel_dark",
    mate: A(enginePoint([-0.3, -0.2, 0.12])),
  });
  add({
    id: "mbt90.engine.oil_filter_housing",
    name_cn: "机油滤清器座",
    name_en: "oil filter housing",
    assembly: "lube",
    build_layer: 3,
    build_order: 522,
    geometry: MERGE(C(0.07, 0.12, [0, 0, 0], 20), C(0.05, 0.05, [0, 0.06, 0], 16)),
    material: "mbt_alu",
    mate: A(enginePoint([0.4, -0.08, 0.3])),
  });
  add({
    id: "mbt90.engine.oil_filter",
    name_cn: "机油滤清器",
    name_en: "oil filter element",
    assembly: "lube",
    build_layer: 3,
    build_order: 523,
    geometry: MERGE(C(0.055, 0.18, [0, 0, 0], 20), C(0.06, 0.02, [0, 0.1, 0], 20)),
    material: "mbt_paint_dark",
    mate: A(enginePoint([0.4, -0.16, 0.3])),
  });
  add({
    id: "mbt90.engine.oil_cooler",
    name_cn: "机油冷却器",
    name_en: "oil cooler",
    assembly: "lube",
    build_layer: 3,
    build_order: 524,
    geometry: MERGE(B(0.24, 0.1, 0.1, [0, 0, 0], 0.008), C(0.02, 0.16, [0.1, 0, 0], 12)),
    material: "mbt_copper",
    mate: A(enginePoint([0.36, 0.06, -0.4])),
  });
  add({
    id: "mbt90.engine.oil_pressure_sender",
    name_cn: "机油压力传感器",
    name_en: "oil pressure sender",
    assembly: "lube",
    build_layer: 3,
    build_order: 525,
    geometry: MERGE(C(0.018, 0.05, [0, 0, 0], 14), C(0.012, 0.02, [0, 0.03, 0], 8)),
    material: "mbt_brass",
    mate: A(enginePoint([0.42, 0.1, 0.24])),
  });
  add({
    id: "mbt90.engine.dipstick",
    name_cn: "机油尺",
    name_en: "dipstick",
    assembly: "lube",
    build_layer: 3,
    build_order: 526,
    geometry: MERGE(C(0.006, 0.42, [0, 0, 0], 8), T(0.018, 0.006, 0.02, [0, 0.21, 0], 12)),
    material: "mbt_steel",
    mate: A(enginePoint([-0.2, 0.02, 0.28]), [0, 0, 18]),
  });
  add({
    id: "mbt90.engine.oil_cooler_line",
    name_cn: "机油冷却器油管",
    name_en: "oil cooler line",
    assembly: "lube",
    build_layer: 3,
    build_order: 527,
    geometry: { type: "weld", from: enginePoint([0.3, -0.02, -0.36]), to: enginePoint([0.38, -0.14, 0.26]), radius: 0.012, seed: 70 },
    material: "mbt_steel_dark",
    mate: A(enginePoint([0, 0, 0])),
  });

  // ======================= 起动 / 附件 =======================
  add({
    id: "mbt90.engine.starter_body",
    name_cn: "起动机",
    name_en: "starter motor",
    assembly: "starting",
    build_layer: 3,
    build_order: 540,
    geometry: MERGE(C(0.07, 0.22, [0, 0, 0], 20), C(0.08, 0.03, [0, 0.1, 0], 20), C(0.05, 0.04, [0, -0.11, 0], 16)),
    material: "mbt_cast_dark",
    mate: A(enginePoint([0.58, -0.2, 0.34]), [0, 0, 90]),
    source: "24V 电起动机 7.5kW，小齿轮与飞轮齿圈啮合。",
  });
  add({
    id: "mbt90.engine.starter_solenoid",
    name_cn: "起动机电磁开关",
    name_en: "starter solenoid",
    assembly: "starting",
    build_layer: 3,
    build_order: 541,
    geometry: MERGE(C(0.04, 0.12, [0, 0, 0], 16), C(0.025, 0.06, [0, 0.08, 0], 12)),
    material: "mbt_cast_dark",
    mate: A(enginePoint([0.58, -0.06, 0.38]), [0, 0, 90]),
  });
  add({
    id: "mbt90.engine.alternator",
    name_cn: "发电机",
    name_en: "alternator",
    assembly: "starting",
    build_layer: 3,
    build_order: 542,
    geometry: MERGE(C(0.08, 0.16, [0, 0, 0], 20), C(0.03, 0.05, [0, 0.1, 0], 14)),
    material: "mbt_alu",
    mate: A(enginePoint([-0.58, 0.16, -0.34]), [0, 0, 90]),
  });
  add({
    id: "mbt90.engine.alternator_pulley",
    name_cn: "发电机皮带轮",
    name_en: "alternator pulley",
    assembly: "starting",
    build_layer: 3,
    build_order: 543,
    geometry: { type: "kit", kit: "pulley", params: { r: 0.05, w: 0.03 } },
    material: "mbt_steel",
    node: "MBT_Crank",
    mate: A([-0.68, 0.16, -0.34], [0, 0, -90]),
  });
  add({
    id: "mbt90.engine.drive_belt",
    name_cn: "附件驱动皮带",
    name_en: "accessory drive belt",
    assembly: "starting",
    build_layer: 3,
    build_order: 544,
    geometry: MERGE(
      B(0.02, 0.035, 0.3, [-0.67, 0.1, -0.17], 0.003),
      B(0.02, 0.035, 0.18, [-0.67, -0.005, -0.09], 0.003),
    ),
    material: "mbt_rubber",
    mate: A(enginePoint([0, 0, 0])),
  });
  add({
    id: "mbt90.engine.battery_l",
    name_cn: "蓄电池（左）",
    name_en: "battery left",
    assembly: "starting",
    build_layer: 3,
    build_order: 545,
    geometry: MERGE(B(0.3, 0.22, 0.22, [0, 0, 0], 0.01), C(0.012, 0.03, [-0.09, 0.12, 0], 8), C(0.012, 0.03, [0.09, 0.12, 0], 8)),
    material: "mbt_paint_dark",
    mate: A([-0.62, 0.62, -1.5]),
  });
  add({
    id: "mbt90.engine.battery_r",
    name_cn: "蓄电池（右）",
    name_en: "battery right",
    assembly: "starting",
    build_layer: 3,
    build_order: 545,
    geometry: MERGE(B(0.3, 0.22, 0.22, [0, 0, 0], 0.01), C(0.012, 0.03, [-0.09, 0.12, 0], 8), C(0.012, 0.03, [0.09, 0.12, 0], 8)),
    material: "mbt_paint_dark",
    mate: A([0.62, 0.62, -1.5]),
  });
  add({
    id: "mbt90.engine.air_filter_l",
    name_cn: "空气滤清器（左）",
    name_en: "air filter left",
    assembly: "turbo",
    build_layer: 3,
    build_order: 546,
    geometry: MERGE(C(0.13, 0.34, [0, 0, 0], 24), C(0.14, 0.03, [0, 0.17, 0], 24)),
    material: "mbt_paint_dark",
    mate: A([-0.98, 1.35, -2.35], [0, 0, 90]),
  });
  add({
    id: "mbt90.engine.air_filter_r",
    name_cn: "空气滤清器（右）",
    name_en: "air filter right",
    assembly: "turbo",
    build_layer: 3,
    build_order: 546,
    geometry: MERGE(C(0.13, 0.34, [0, 0, 0], 24), C(0.14, 0.03, [0, 0.17, 0], 24)),
    material: "mbt_paint_dark",
    mate: A([0.98, 1.35, -2.35], [0, 0, 90]),
  });
  add({
    id: "mbt90.engine.battery_tray",
    name_cn: "蓄电池托架",
    name_en: "battery tray",
    assembly: "starting",
    build_layer: 3,
    build_order: 546,
    geometry: MERGE(B(1.4, 0.05, 0.3, [0, 0, 0], 0.006), B(0.04, 0.14, 0.3, [-0.82, 0.08, 0], 0.004), B(0.04, 0.14, 0.3, [0.82, 0.08, 0], 0.004)),
    material: "mbt_steel_dark",
    mate: A([0, 0.485, -1.5]),
    source: "蓄电池托架坐在车体底甲板上，两只 24V 蓄电池前后串联。",
  });
  add({
    id: "mbt90.engine.air_filter_bracket_l",
    name_cn: "空气滤清器支架（左）",
    name_en: "air filter bracket left",
    assembly: "turbo",
    build_layer: 3,
    build_order: 546,
    geometry: MERGE(B(0.48, 0.05, 0.06, [0, 0, 0], 0.004), B(0.05, 0.18, 0.05, [0.2, 0.08, 0], 0.003)),
    material: "mbt_steel_dark",
    mate: A([-0.74, 1.35, -2.35]),
  });
  add({
    id: "mbt90.engine.air_filter_bracket_r",
    name_cn: "空气滤清器支架（右）",
    name_en: "air filter bracket right",
    assembly: "turbo",
    build_layer: 3,
    build_order: 546,
    geometry: MERGE(B(0.48, 0.05, 0.06, [0, 0, 0], 0.004), B(0.05, 0.18, 0.05, [-0.2, 0.08, 0], 0.003)),
    material: "mbt_steel_dark",
    mate: A([0.74, 1.35, -2.35]),
  });
  add({
    id: "mbt90.engine.exhaust_outlet_l",
    name_cn: "排气出口（左）",
    name_en: "exhaust outlet left",
    assembly: "turbo",
    build_layer: 3,
    build_order: 547,
    geometry: MERGE(C(0.09, 0.16, [0, 0, 0], 20), T(0.1, 0.085, 0.04, [0, 0.08, 0], 20)),
    material: "mbt_rust",
    mate: A([-1.15, 1.1, -3.0], [0, 0, 90]),
  });
  add({
    id: "mbt90.engine.exhaust_outlet_r",
    name_cn: "排气出口（右）",
    name_en: "exhaust outlet right",
    assembly: "turbo",
    build_layer: 3,
    build_order: 547,
    geometry: MERGE(C(0.09, 0.16, [0, 0, 0], 20), T(0.1, 0.085, 0.04, [0, 0.08, 0], 20)),
    material: "mbt_rust",
    mate: A([1.15, 1.1, -3.0], [0, 0, 90]),
  });

  return parts;
}

// ---------------------------------------------------------------------------
// 注册表
// ---------------------------------------------------------------------------

const ASSEMBLIES: ModelRegistry["assemblies"] = [
  { id: "engine_block", name_cn: "发动机机体", name_en: "engine block", explode: [0, 1, 0] },
  { id: "crankcase", name_cn: "曲轴箱与主轴承", name_en: "crankcase & main bearings", explode: [0, 0.9, 0] },
  { id: "crankshaft", name_cn: "曲轴总成", name_en: "crankshaft", explode: [1, 0.3, 0] },
  { id: "cylinder", name_cn: "缸套与缸盖", name_en: "liners & heads", explode: [0, 1.2, 0] },
  { id: "piston_rod", name_cn: "活塞连杆总成", name_en: "pistons & rods", explode: [0, 1.4, 0] },
  { id: "valvetrain", name_cn: "配气机构", name_en: "valvetrain", explode: [0, 1.7, 0.3] },
  { id: "fuel", name_cn: "燃油系统", name_en: "fuel system", explode: [0.6, 1.1, 0.4] },
  { id: "turbo", name_cn: "涡轮增压与进排气", name_en: "turbo & induction", explode: [0.8, 1.2, -0.4] },
  { id: "cooling", name_cn: "冷却系统", name_en: "cooling", explode: [0.9, 1.0, -0.6] },
  { id: "lube", name_cn: "润滑系统", name_en: "lubrication", explode: [0.4, 0.6, 0.6] },
  { id: "starting", name_cn: "起动与电气", name_en: "starting & electrical", explode: [0.8, 0.7, 0.4] },
  { id: "timing", name_cn: "正时齿轮系", name_en: "timing train", explode: [0.2, 0.9, 0.2] },
];

export function makeEngineRegistry(): ModelRegistry {
  return {
    model: "mbt90",
    title: "MBT-90 动力包",
    constants: {
      ...MBT,
      ...Object.fromEntries(Object.entries(V12).map(([k, v]) => [k, Array.isArray(v) ? v[0]! : v])),
      ENGINE_RPM: V12.IDLE_RPM,
      RATED_RPM: V12.RATED_RPM,
      RATED_TORQUE: V12.RATED_TORQUE,
      DISPLACEMENT: V12.DISPLACEMENT_L,
    },
    assemblies: ASSEMBLIES,
    nodes: makeEngineNodes(),
    materials: MBT_MATERIALS,
    parts: buildParts(),
    source_notes:
      "V12 双涡轮增压柴油机（虚构 MBT-90 动力包，参考 MTU MB 873 Ka-501 的总体布置）：" +
      "90° V12 / 缸径 145mm × 行程 160mm / 47.6L / 1500PS @ 2600rpm / 4700N·m；" +
      "每缸 4 气门（48 气门）、SOHC + 桥式摇臂、双涡轮 + 空空中冷、高压共轨、电起动。" +
      "活塞/连杆/气门/弹簧/摇臂/推杆逐件建模，曲柄连杆与配气相位由 engine/kinematics.ts 求解。",
    expectedContacts: [...MBT_ENGINE_ALL_EXPECTED_CONTACTS, ...MBT_ENGINE_CONTACT_FIXES],
  };
}

// 工具：供 motion/test 使用
export function engineBankAxis(side: 1 | -1): THREE.Vector3 {
  return bankAxis(bankBeta(side));
}
