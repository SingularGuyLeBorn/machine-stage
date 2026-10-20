import * as THREE from "three";
import type { InstanceLayout } from "../../../assembler/assembler";
import type { ModelRegistry, PartDefinition } from "../../../registry/types";

// ============================================================================
// models/tiger/transmission —— 虎式 I 传动装置（L2 第二批：变速箱 + 传动轴 + 转向机）
//
// 坐标系沿用 L1/L2：+X 朝车尾（风扇端），+Y 上，+Z 车体右侧；地面 GROUND_Y = -1.10，
// 曲轴轴线 y = 0。传动链：HL230 尾轴（x ≈ -0.68）→ 传动轴（2 段管 + 3 个万向节 + 中间支承）
// → 输入法兰（x = -2.63）→ Olvar 40 12 16（x -2.72 ~ -3.58，y -0.28 ~ +0.32）→ L 600 C
// 转向机（x -3.60 ~ -4.10，横置）→ 左右侧传动轴（x = -4.05，y = 0，z ±0.735 ~ ±0.985，
// 轴上有 φ550 Argus 制动盘）→ 终传输入壳体（x = -4.25，z = ±1.08）→ 前置终传（L2 第一批
// 已建，x = -4.45）。
//
// 数据出处（公开资料，Jentz / alanhamby / Research Squad 剖面图）：
//   1. 变速箱 Maybach Olvar 40 12 16：8 前 4 倒、液压预选、带转向机与油泵取力；
//      实车装在驾驶员右侧，功率经主舱地板下的传动轴从后置发动机引来。
//   2. 转向机 Henschel L 600 C：双半径再生式，横向装配在变速箱前端，减速比 1:16；
//      输出经两侧传动轴送往前置终传（终传内另有 1:10.75 减速）。
//   3. 侧传动轴上有 φ550mm Argus 盘式制动器；终传由 Henschel 制造、螺栓固定在车体侧板上。
//
// 建模口径（简化记录，M-C 待补）：
//   1. 壳体按「盒板拼壳 + 竖肋 + 机脚」建；内部轴系（中间轴/主轴/拨叉/拨叉轴）悬在腔内，
//      与内壁留 18~108mm 间隙——轴承座、齿轮啮合齿形、换挡离合齿随 M-C 补。
//   2. 各法兰/联轴节/螺栓一律 2~5mm 名义缝（不接触、不报缺陷），对穿螺栓与贴合面待 M-C。
//   3. 变速箱实际位于驾驶员右侧（偏置），本模型壳体居中（与传动轴同轴，便于剖切观察）。
//   4. 接口（L3/L4 落地时必须满足）：变速箱机脚底 -0.303、转向机支承耳底 -0.302、
//      中间支承底座底 -0.303 → L4 地板顶面 -0.305（扭杆 y = -0.585 位于地板之下）；
//      侧传动轴穿车体侧板（x = -4.05，y = 0，z = ±0.90）须开 ⌀110 过孔；
//      转向柱上端（x -3.80，z -0.42，顶面 y +0.36）接 L3 方向盘；预选阀联动臂上端
//      y +0.28 接 L3 预选杆。
// ============================================================================

export const TRANSMISSION_LAYOUTS = {
  propShaft: "transmission.propShaft",
  propJoint: "transmission.propJoint",
  coverScrew: "transmission.coverScrew",
  inputBolt: "transmission.inputBolt",
  shiftRail: "transmission.shiftRail",
  steeringOutput: "transmission.steeringOutput",
  sideShaft: "transmission.sideShaft",
  sideBolt: "transmission.sideBolt",
  brakeDisc: "transmission.brakeDisc",
  inputCase: "transmission.inputCase",
} as const;

const TR_CONSTANTS: Record<string, number> = {
  // —— 传动轴（两段等长 0.83m；管端与万向节材料面一律 5mm 名义缝）——
  TR_SHAFT_R: 0.042,
  TR_TUBE_LEN: 0.83,
  TR_TUBE_A_X: -1.1905,
  TR_TUBE_B_X: -2.1225,
  TR_JOINT_X1: -0.7085,
  TR_JOINT_X2: -1.6405,
  TR_JOINT_X3: -2.5725,
  TR_JOINT_FLANGE_R: 0.075,
  TR_JOINT_BOLT_R: 0.055,
  TR_CB_X: -1.6405,
  TR_IN_X: -2.6505,
  TR_IN_FLANGE_R: 0.095,
  TR_IN_HUB_R: 0.048,
  TR_IN_BOLT_R: 0.07,

  // —— 竖向基准（与 L2 第一批扭杆层自洽）——
  TR_FLOOR_Y: -0.305,

  // —— 变速箱壳体（机脚底 -0.303，坐地板顶面 -0.305）——
  TR_GB_X_REAR: -2.72,
  TR_GB_X_FRONT: -3.58,
  TR_GB_HALF_W: 0.35,
  TR_GB_WALL: 0.022,
  TR_GB_Y_BOTTOM: -0.28,
  TR_GB_Y_TOP: 0.32,
  TR_GB_Y_FOOT: -0.303,
  TR_COVER_TOP: 0.364,

  // —— 内部轴系（腔内）——
  TR_LAY_X: -3.15,
  TR_LAY_Y: -0.08,
  TR_LAY_Z: -0.16,
  TR_MAIN_X: -3.1,
  TR_MAIN_Y: 0.16,
  TR_MAIN_Z: 0.16,
  TR_RAIL_Y1: 0.22,
  TR_RAIL_Y2: 0.14,
  TR_RAIL_Z: -0.28,

  // —— 转向机 L 600 C（横置，耳底 -0.302）——
  TR_ST_X_REAR: -3.6,
  TR_ST_X_FRONT: -4.1,
  TR_ST_HALF_W: 0.66,
  TR_ST_Y_BOTTOM: -0.24,
  TR_ST_Y_TOP: 0.22,
  TR_ST_OUT_X: -4.05,
  TR_ST_OUT_Y: 0,
  TR_ST_OUT_Z: 0.674,
  TR_ST_COL_X: -3.8,
  TR_ST_COL_Z: -0.42,

  // —— 侧传动轴 / 制动盘（与传动轴同高 y = 0）——
  TR_SIDE_R: 0.038,
  TR_SIDE_CX: -4.05,
  TR_SIDE_CY: 0,
  TR_SIDE_Z_IN: 0.735,
  TR_SIDE_Z_OUT: 0.982,
  TR_SIDE_BOLT_R: 0.035,
  TR_BRAKE_Z: 0.86,
  TR_BRAKE_R: 0.275,

  // —— 终传输入壳体（布局随终传壳轴心；z 站距受车体侧板与履带销内端限制）——
  TR_INCASE_Z: 1.039,
};

// ---------------------------------------------------------------------------
// 布局：万向节/轴管的局部 +Y = 轴向，布局矩阵负责转到 X（+Y → +X）
// ---------------------------------------------------------------------------

/** 回转体轴件（+Y 建模）→ 轴向 X、位置 (x,y,z)。 */
function axialX(x: number, y: number, z: number): THREE.Matrix4 {
  const m = new THREE.Matrix4().makeRotationZ(-Math.PI / 2);
  m.setPosition(x, y, z);
  return m;
}

/** 回转体轴件（+Y 建模）→ 轴向 Z、位置 (x,y,z)（+Y → +Z，两种侧别共用同一几何）。 */
function axialZ(x: number, y: number, z: number): THREE.Matrix4 {
  const m = new THREE.Matrix4().makeRotationX(Math.PI / 2);
  m.setPosition(x, y, z);
  return m;
}

export function makeTransmissionLayouts(): Record<string, InstanceLayout> {
  const layouts: Record<string, InstanceLayout> = {};
  const c = TR_CONSTANTS;
  const side = (index: number): 1 | -1 => (index % 2 === 0 ? 1 : -1);

  layouts[TRANSMISSION_LAYOUTS.propShaft] = ({ index }) =>
    axialX(index === 0 ? c.TR_TUBE_A_X : c.TR_TUBE_B_X, 0, 0);

  layouts[TRANSMISSION_LAYOUTS.propJoint] = ({ index }) =>
    axialX([c.TR_JOINT_X1, c.TR_JOINT_X2, c.TR_JOINT_X3][index] ?? c.TR_JOINT_X1, 0, 0);

  layouts[TRANSMISSION_LAYOUTS.coverScrew] = ({ index }) => {
    const xc = (c.TR_GB_X_REAR + c.TR_GB_X_FRONT) / 2;
    const zEdge = c.TR_GB_HALF_W - 0.045;
    const list: [number, number][] = [];
    for (const x of [xc - 0.28, xc, xc + 0.28]) for (const z of [zEdge, -zEdge]) list.push([x, z]);
    for (const x of [c.TR_GB_X_FRONT + 0.045, c.TR_GB_X_REAR - 0.045]) {
      for (const z of [zEdge, 0, -zEdge]) list.push([x, z]);
    }
    const [x, z] = list[index] ?? list[0]!;
    return new THREE.Matrix4().makeTranslation(x, c.TR_COVER_TOP + 0.013, z);
  };

  layouts[TRANSMISSION_LAYOUTS.inputBolt] = ({ index }) => {
    const angle = (index / 6) * Math.PI * 2;
    return axialX(c.TR_IN_X - 0.021, Math.cos(angle) * c.TR_IN_BOLT_R, Math.sin(angle) * c.TR_IN_BOLT_R);
  };

  layouts[TRANSMISSION_LAYOUTS.shiftRail] = ({ index }) =>
    axialX(c.TR_LAY_X, index === 0 ? c.TR_RAIL_Y1 : c.TR_RAIL_Y2, c.TR_RAIL_Z);

  // 齿圈：主轴 3 只齿轮坯 + 中间轴 4 只齿轮坯。几何基准 r 0.11、齿顶 +11mm，
  // 布局按坯半径等比缩放；齿圈轴局部 +Z → 绕 Y 转 90° 对齐世界 X。
  layouts["transmission.gearRim"] = ({ index }) => {
    const list: [number, number, number, number][] = [
      [c.TR_MAIN_X + 0.24, c.TR_MAIN_Y, c.TR_MAIN_Z, 0.07 / 0.11],
      [c.TR_MAIN_X + 0.08, c.TR_MAIN_Y, c.TR_MAIN_Z, 0.09 / 0.11],
      [c.TR_MAIN_X - 0.08, c.TR_MAIN_Y, c.TR_MAIN_Z, 1.0],
      [c.TR_LAY_X + 0.24, c.TR_LAY_Y, c.TR_LAY_Z, 0.09 / 0.11],
      [c.TR_LAY_X + 0.08, c.TR_LAY_Y, c.TR_LAY_Z, 1.0],
      [c.TR_LAY_X - 0.08, c.TR_LAY_Y, c.TR_LAY_Z, 0.13 / 0.11],
      [c.TR_LAY_X - 0.24, c.TR_LAY_Y, c.TR_LAY_Z, 0.15 / 0.11],
    ];
    const [x, y, z, scale] = list[index] ?? list[0]!;
    return new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0)),
      new THREE.Vector3(scale, scale, scale),
    );
  };

  layouts[TRANSMISSION_LAYOUTS.steeringOutput] = ({ index }) => {
    const s = side(index);
    // 回转体轴向对称，法兰盘居中（±0.011），轴头朝车外侧：± 两侧用相反旋向 → 轴头都朝外。
    const m = new THREE.Matrix4().makeRotationX((s * Math.PI) / 2);
    m.setPosition(c.TR_ST_OUT_X, c.TR_ST_OUT_Y, s * c.TR_ST_OUT_Z);
    return m;
  };

  layouts[TRANSMISSION_LAYOUTS.sideShaft] = ({ index }) =>
    axialZ(c.TR_SIDE_CX, c.TR_SIDE_CY, side(index) * ((c.TR_SIDE_Z_IN + c.TR_SIDE_Z_OUT) / 2));

  layouts[TRANSMISSION_LAYOUTS.sideBolt] = ({ index }) => {
    const s: 1 | -1 = index < 4 ? 1 : -1;
    const k = index % 4;
    const angle = (k / 4) * Math.PI * 2 + Math.PI / 4;
    return axialZ(
      c.TR_SIDE_CX + Math.cos(angle) * c.TR_SIDE_BOLT_R,
      c.TR_SIDE_CY + Math.sin(angle) * c.TR_SIDE_BOLT_R,
      s * (c.TR_SIDE_Z_OUT + 0.009),
    );
  };

  layouts[TRANSMISSION_LAYOUTS.brakeDisc] = ({ index }) =>
    axialZ(c.TR_SIDE_CX, c.TR_SIDE_CY, side(index) * c.TR_BRAKE_Z);

  layouts[TRANSMISSION_LAYOUTS.inputCase] = ({ index, constants }) =>
    new THREE.Matrix4().makeTranslation(
      constants.SPROCKET_X,
      constants.GROUND_Y + constants.TRACK_PIN_OFFSET + constants.SPROCKET_R,
      side(index) * c.TR_INCASE_Z,
    );

  return layouts;
}

export function makeTransmissionRegistry(): ModelRegistry {
  return {
    model: "tiger",
    title: "虎式 I 传动装置（L2）",
    subtitle: "Olvar 40 12 16 变速箱 / 传动轴 / L 600 C 转向机",
    source_notes: [
      "公开资料：Olvar 40 12 16 液压预选变速箱（8 前 4 倒，带转向机与油泵取力，实车位于驾驶员右侧）；Henschel L 600 C 双半径再生式转向机横向装在变速箱前端；两侧传动轴各带 φ550mm Argus 盘式制动器；功率由后置 HL230 经地板下传动轴前送。",
      "布置（本模型口径）：传动轴 y = 0（与 L1 曲轴同轴），两段管各 0.83m、3 个万向节（发动机尾轴 x -0.71 / 中间支承 -1.64 / 变速箱输入 -2.57）；变速箱壳体 x -3.58 ~ -2.72、y -0.28 ~ +0.32、半宽 0.35；转向机 x -4.10 ~ -3.60、横置半宽 0.66、y -0.24 ~ +0.22；侧传动轴与传动轴同高 y = 0（x = -4.05），φ550 制动盘站 z = ±0.86（盘底 -0.275）。",
      "竖向接口（L4 落地）：扭杆 y = -0.585（顶面 -0.557）位于地板之下，地板顶面 -0.305；变速箱机脚底 -0.303、转向机支承耳底 -0.302、中间支承底座底 -0.303，三者坐地板面（2~3mm 名义缝）。侧传动轴穿车体侧板（侧板外表面 z = ±0.9625，轴 x = -4.05、y = 0）须开 ⌀110 过孔；终传输入壳体占 z ±(0.991~1.087)，外侧留履带销内端（z = ±1.094）7mm；转向柱上端（x -3.80，z -0.42）顶面 y = +0.36 接 L3 方向盘；预选阀联动臂上端 y = +0.28 接 L3 预选杆。",
      "简化记录（M-C 待补）：壳体居中（实车偏驾驶员右侧）；内部轴系悬在腔内 18~108mm（轴承座/齿形/离合齿待补）；所有法兰与联轴节按 2~5mm 名义缝；终传输入壳体只做卡圈/立柱/轴端，终传内部齿轮组仍缺。",
    ].join("\n"),
    constants: TR_CONSTANTS,
    assemblies: [{ id: "transmission", name_cn: "传动装置", name_en: "transmission", explode: [0, 0.9, 0] }],
    nodes: [],
    materials: {},
    expectedContacts: [
      {
        family: "gear-rim-on-blank",
        a: "tiger.transmission.gear_rim",
        b: "tiger.transmission.main_shaft",
        reason: "齿圈过盈套在主轴齿轮坯外（内孔比坯小 1mm，压装；齿圈按坯径等比缩放，齿根会探入坯体 ≤2.4mm）",
        maxDepthMm: 3,
      },
      {
        family: "gear-rim-on-blank",
        a: "tiger.transmission.gear_rim",
        b: "tiger.transmission.layshaft",
        reason: "齿圈过盈套在中间轴齿轮坯外（内孔比坯小 1mm，压装；齿圈按坯径等比缩放，齿根会探入坯体 ≤2.4mm）",
        maxDepthMm: 3,
      },
    ],
    parts: buildTransmissionParts(),
  };
}

const AXIS_X: [number, number, number] = [0, 0, -90]; // +Y → +X

function buildTransmissionParts(): PartDefinition[] {
  const parts: PartDefinition[] = [];
  const add = (def: PartDefinition) => parts.push(def);

  // ================= 传动轴（发动机 → 变速箱） =================
  add({
    id: "tiger.transmission.prop_shaft",
    name_cn: "传动轴管",
    name_en: "propeller shaft tube",
    assembly: "transmission",
    build_layer: 2,
    build_order: 342,
    geometry: {
      type: "merge",
      parts: [
        { type: "cylinder", r: "TR_SHAFT_R", h: "TR_TUBE_LEN", segments: 20, bevel: 0.002 },
        { type: "cylinder", r: 0.05, h: 0.02, segments: 20, at: [0, 0.4, 0] },
        { type: "cylinder", r: 0.05, h: 0.02, segments: 20, at: [0, -0.4, 0] },
      ],
    },
    material: "steel",
    instances: 2,
    indexed: true,
    instance_layout: TRANSMISSION_LAYOUTS.propShaft,
    mate: { type: "absolute" },
    source: "两段等长传动轴管（ф84×0.83m）、带平衡环；段间为万向节与滑键，2~5mm 名义缝。",
  });
  add({
    id: "tiger.transmission.prop_joint",
    name_cn: "万向节",
    name_en: "propeller shaft universal joint",
    assembly: "transmission",
    build_layer: 2,
    build_order: 343,
    geometry: {
      type: "merge",
      parts: [
        {
          type: "lathe",
          profile: [
            [0, 0],
            ["TR_JOINT_FLANGE_R", 0],
            ["TR_JOINT_FLANGE_R", 0.03],
            [0, 0.03],
          ],
          segments: 24,
        },
        { type: "box", w: 0.028, h: 0.06, d: 0.03, at: [0, -0.03, 0.045], bevel: 0.004 },
        { type: "box", w: 0.028, h: 0.06, d: 0.03, at: [0, -0.03, -0.045], bevel: 0.004 },
        { type: "box", w: 0.1, h: 0.028, d: 0.028, at: [0, -0.048, 0], bevel: 0.004 },
        {
          type: "boltCircle",
          count: 6,
          radius: "TR_JOINT_BOLT_R",
          boltR: 0.011,
          boltH: 0.016,
          at: [0, 0.014, 0],
        },
      ],
    },
    material: "steel_worn",
    instances: 3,
    indexed: true,
    instance_layout: TRANSMISSION_LAYOUTS.propJoint,
    mate: { type: "absolute" },
    source: "十字轴式万向节（ф150 法兰 + 6 颗 M12）；实车三处：发动机尾轴、中间支承、变速箱输入。",
  });
  add({
    id: "tiger.transmission.center_bearing",
    name_cn: "传动轴中间支承",
    name_en: "propeller shaft centre bearing",
    assembly: "transmission",
    build_layer: 2,
    build_order: 344,
    geometry: {
      type: "merge",
      parts: [
        { type: "tube", rOuter: 0.11, rInner: 0.085, h: 0.06, segments: 24 },
        { type: "box", w: 0.185, h: 0.05, d: 0.07, at: [0.1925, 0, 0], bevel: 0.005 },
        { type: "box", w: 0.02, h: 0.18, d: 0.14, at: [0.293, 0, 0], bevel: 0.005 },
      ],
    },
    material: "cast_iron",
    mate: { type: "absolute", position: ["TR_CB_X", 0, 0], rotation: AXIS_X },
    source:
      "中间支承：轴承座环（内径 ф170，环抱中间万向节）+ 立柱 + 底板；底板底面 -0.303，坐 L4 地板顶面 -0.305。",
  });
  add({
    id: "tiger.transmission.input_shaft",
    name_cn: "变速箱输入法兰",
    name_en: "gearbox input flange",
    assembly: "transmission",
    build_layer: 2,
    build_order: 345,
    geometry: {
      type: "merge",
      parts: [
        {
          type: "lathe",
          segments: 24,
          profile: [
            [0, -0.011],
            ["TR_IN_FLANGE_R", -0.011],
            ["TR_IN_FLANGE_R", 0.011],
            [0, 0.011],
          ],
        },
        { type: "cylinder", r: "TR_IN_HUB_R", h: 0.038, at: [0, -0.03, 0], segments: 20, bevel: 0.002 },
      ],
    },
    material: "steel_worn",
    mate: { type: "absolute", position: ["TR_IN_X", 0, 0], rotation: AXIS_X },
    source:
      "输入轴法兰（ф190 盘 + ф96 轴头）：盘 x -2.6615 ~ -2.6395（与前端万向节叉材料面留 5mm），轴头前端 -2.6995 与壳后端面座 -2.702 留 2.5mm 缝；花键与轴承待 M-C。",
  });
  add({
    id: "tiger.transmission.input_flange_bolt",
    name_cn: "输入法兰螺栓",
    name_en: "input flange bolt",
    assembly: "transmission",
    build_layer: 2,
    build_order: 346,
    geometry: { type: "cylinder", r: 0.012, h: 0.016, segments: 6 },
    material: "steel",
    instances: 6,
    indexed: true,
    instance_layout: TRANSMISSION_LAYOUTS.inputBolt,
    mate: { type: "absolute" },
    source: "法兰 6 颗 M12 六角头（头底与法兰面留 2mm 名义缝）；对穿螺栓与螺母待 M-C。",
  });

  // ================= 变速箱（Olvar 40 12 16） =================
  add({
    id: "tiger.transmission.gearbox_housing",
    name_cn: "变速箱壳体",
    name_en: "gearbox housing",
    assembly: "transmission",
    build_layer: 2,
    build_order: 347,
    geometry: {
      type: "kit",
      kit: "gearboxCase",
      params: {
        xRear: "TR_GB_X_REAR",
        xFront: "TR_GB_X_FRONT",
        halfW: "TR_GB_HALF_W",
        wall: "TR_GB_WALL",
        yBottom: "TR_GB_Y_BOTTOM",
        yTop: "TR_GB_Y_TOP",
        yFoot: "TR_GB_Y_FOOT",
      },
    },
    material: "aluminium",
    mate: { type: "absolute" },
    source:
      "轻合金铸造壳体（长 0.86 × 高 0.60 × 宽 0.70m，y -0.28 ~ +0.32，壁 22mm）：腔壳 + 6 条竖肋 + 2 个机脚 + 输入座 + 预选阀座 + 油泵座；腔内部轴系为独立零件。",
  });
  add({
    id: "tiger.transmission.gearbox_cover",
    name_cn: "变速箱上盖",
    name_en: "gearbox top cover",
    assembly: "transmission",
    build_layer: 2,
    build_order: 348,
    geometry: {
      type: "kit",
      kit: "gearboxCover",
      params: {
        xRear: "TR_GB_X_REAR",
        xFront: "TR_GB_X_FRONT",
        halfW: "TR_GB_HALF_W",
        yTop: "TR_GB_Y_TOP",
      },
    },
    material: "aluminium",
    mate: { type: "absolute" },
    source:
      "上盖板（螺栓窝台 ×12 + 吊环 ×2 + 通气器 + 内侧筋）：盖板底面 0.33 与壳顶法兰面 0.326 留 4mm 名义缝，螺栓窝台顶面 0.364。",
  });
  add({
    id: "tiger.transmission.gearbox_cover_screw",
    name_cn: "上盖螺钉",
    name_en: "gearbox cover screw",
    assembly: "transmission",
    build_layer: 2,
    build_order: 349,
    geometry: { type: "cylinder", r: 0.013, h: 0.02, segments: 6 },
    material: "steel",
    instances: 12,
    indexed: true,
    instance_layout: TRANSMISSION_LAYOUTS.coverScrew,
    mate: { type: "absolute" },
    source: "12 颗 M14 六角头（头底与螺栓窝台面留 3mm 名义缝）；螺柱段待 M-C。",
  });
  add({
    id: "tiger.transmission.layshaft",
    name_cn: "变速箱中间轴",
    name_en: "gearbox layshaft",
    assembly: "transmission",
    build_layer: 2,
    build_order: 350,
    geometry: {
      type: "merge",
      parts: [
        { type: "cylinder", r: 0.032, h: 0.7, segments: 18, bevel: 0.002 },
        ...[
          [0.24, 0.09],
          [0.08, 0.11],
          [-0.08, 0.13],
          [-0.24, 0.15],
        ].map(([y, r]) => ({
          type: "lathe" as const,
          segments: 24,
          at: [0, y, 0] as [number, number, number],
          profile: [
            [0, -0.035],
            [0.075, -0.035],
            [0.075, -0.02],
            [r, -0.02],
            [r, 0.02],
            [0.075, 0.02],
            [0.075, 0.035],
            [0, 0.035],
          ] as [number, number][],
        })),
      ],
    },
    material: "steel",
    mate: { type: "absolute", position: ["TR_LAY_X", "TR_LAY_Y", "TR_LAY_Z"], rotation: AXIS_X },
    source:
      "中间轴总成（ф64 轴 + 4 个齿轮，ф180/220/260/300，带轮毂台阶）；轴颈坐在壳体轴承里（轴承待 M-C），腔内间隙 ≥18mm。",
  });
  add({
    id: "tiger.transmission.main_shaft",
    name_cn: "变速箱主轴",
    name_en: "gearbox main shaft",
    assembly: "transmission",
    build_layer: 2,
    build_order: 351,
    geometry: {
      type: "merge",
      parts: [
        { type: "cylinder", r: 0.035, h: 0.7, segments: 18, bevel: 0.002 },
        ...[
          [0.24, 0.07],
          [0.08, 0.09],
          [-0.08, 0.11],
        ].map(([y, r]) => ({
          type: "lathe" as const,
          segments: 24,
          at: [0, y, 0] as [number, number, number],
          profile: [
            [0, -0.035],
            [0.08, -0.035],
            [0.08, -0.02],
            [r, -0.02],
            [r, 0.02],
            [0.08, 0.02],
            [0.08, 0.035],
            [0, 0.035],
          ] as [number, number][],
        })),
        {
          type: "lathe",
          segments: 24,
          at: [0, -0.3, 0],
          profile: [
            [0, -0.02],
            [0.07, -0.02],
            [0.07, 0.02],
            [0, 0.02],
          ],
        },
      ],
    },
    material: "steel",
    mate: { type: "absolute", position: ["TR_MAIN_X", "TR_MAIN_Y", "TR_MAIN_Z"], rotation: AXIS_X },
    source:
      "主轴总成（ф70 轴 + 3 个齿轮 ф140/180/220 + 前端输出法兰，接转向机输入）；轴长 0.70m，与中间轴中心距 0.412m。",
  });
  add({
    id: "tiger.transmission.shift_fork_lo",
    name_cn: "1/2 挡拨叉",
    name_en: "1st/2nd gear shift fork",
    assembly: "transmission",
    build_layer: 2,
    build_order: 352,
    geometry: {
      type: "merge",
      parts: [
        { type: "tube", rOuter: 0.138, rInner: 0.122, h: 0.024, segments: 24 },
        { type: "box", w: 0.05, h: 0.03, d: 0.3, at: [0.02, 0, -0.27], bevel: 0.004 },
      ],
    },
    material: "steel_worn",
    mate: { type: "absolute", position: [-3.18, "TR_MAIN_Y", "TR_MAIN_Z"], rotation: AXIS_X },
    source:
      "拨叉（环抱主轴 ф220 齿轮的离合齿），叉脚伸到拨叉轴 2（y=0.14）上方 8mm；换挡离合齿与同步器待 M-C。",
  });
  add({
    id: "tiger.transmission.shift_fork_hi",
    name_cn: "3/4 挡拨叉",
    name_en: "3rd/4th gear shift fork",
    assembly: "transmission",
    build_layer: 2,
    build_order: 353,
    geometry: {
      type: "merge",
      parts: [
        { type: "tube", rOuter: 0.138, rInner: 0.122, h: 0.024, segments: 24 },
        { type: "box", w: 0.05, h: 0.03, d: 0.3, at: [-0.06, 0, -0.27], bevel: 0.004 },
      ],
    },
    material: "steel_worn",
    mate: { type: "absolute", position: [-3.02, "TR_MAIN_Y", "TR_MAIN_Z"], rotation: AXIS_X },
    source: "拨叉（环抱主轴 ф180 齿轮），叉脚伸到拨叉轴 1（y=0.22）上方 8mm。",
  });
  add({
    id: "tiger.transmission.shift_rail",
    name_cn: "拨叉轴",
    name_en: "shift rail",
    assembly: "transmission",
    build_layer: 2,
    build_order: 354,
    geometry: { type: "cylinder", r: 0.012, h: 0.62, segments: 12, bevel: 0.001 },
    material: "steel_worn",
    instances: 2,
    indexed: true,
    instance_layout: TRANSMISSION_LAYOUTS.shiftRail,
    mate: { type: "absolute" },
    source: "两根拨叉轴（ф24 × 0.62m，y = 0.22 / 0.14，z = -0.28）；液压预选阀推动拨叉的活塞与联动杆待 M-C。",
  });

  // ================= 转向机（L 600 C）与侧传动 =================
  add({
    id: "tiger.transmission.steering_housing",
    name_cn: "转向机壳体",
    name_en: "steering unit housing",
    assembly: "transmission",
    build_layer: 2,
    build_order: 355,
    geometry: {
      type: "kit",
      kit: "steeringCase",
      params: {
        xRear: "TR_ST_X_REAR",
        xFront: "TR_ST_X_FRONT",
        halfW: "TR_ST_HALF_W",
        yBottom: "TR_ST_Y_BOTTOM",
        yTop: "TR_ST_Y_TOP",
      },
    },
    material: "cast_iron",
    mate: { type: "absolute" },
    source:
      "L 600 C 横置壳体（宽 1.32 × 长 0.50 × 高 0.46m，y -0.24 ~ +0.22，装变速箱前端面，1:16 减速）：腔体 + 前盖 + 转向柱座 + 支承耳 ×2（耳底 -0.302）；双半径行星排与制动鼓待 M-C。",
  });
  add({
    id: "tiger.transmission.steering_output",
    name_cn: "转向机输出法兰",
    name_en: "steering output flange",
    assembly: "transmission",
    build_layer: 2,
    build_order: 356,
    geometry: {
      type: "merge",
      parts: [
        {
          type: "lathe",
          segments: 24,
          profile: [
            [0, -0.011],
            [0.085, -0.011],
            [0.085, 0.011],
            [0, 0.011],
          ],
        },
        { type: "cylinder", r: 0.048, h: 0.03, at: [0, 0.026, 0], segments: 20, bevel: 0.002 },
      ],
    },
    material: "steel",
    instances: 2,
    indexed: true,
    instance_layout: TRANSMISSION_LAYOUTS.steeringOutput,
    mate: { type: "absolute" },
    source:
      "侧输出法兰（ф170 盘 + ф96 轴头），盘面与壳体侧面留 3mm 名义缝；与侧传动轴内端法兰相对（20mm 缝）。",
  });
  add({
    id: "tiger.transmission.side_shaft",
    name_cn: "侧传动轴",
    name_en: "side drive shaft",
    assembly: "transmission",
    build_layer: 2,
    build_order: 357,
    geometry: {
      type: "merge",
      parts: [
        { type: "cylinder", r: "TR_SIDE_R", h: 0.247, segments: 20, bevel: 0.002 },
        {
          type: "lathe",
          segments: 24,
          at: [0, 0.116, 0],
          profile: [
            [0, -0.0075],
            [0.055, -0.0075],
            [0.055, 0.0075],
            [0, 0.0075],
          ],
        },
        {
          type: "lathe",
          segments: 24,
          at: [0, -0.116, 0],
          profile: [
            [0, -0.0075],
            [0.055, -0.0075],
            [0.055, 0.0075],
            [0, 0.0075],
          ],
        },
        { type: "cylinder", r: 0.05, h: 0.02, at: [0, 0.075, 0], segments: 20 },
        { type: "cylinder", r: 0.05, h: 0.02, at: [0, -0.075, 0], segments: 20 },
      ],
    },
    material: "steel",
    instances: 2,
    indexed: true,
    instance_layout: TRANSMISSION_LAYOUTS.sideShaft,
    mate: { type: "absolute" },
    source: "侧传动轴（ф76 × 0.247m，两端带 ф110 法兰与平衡环）；几何沿轴对称，左右两侧共用同一几何。",
  });
  add({
    id: "tiger.transmission.side_flange_bolt",
    name_cn: "侧传动轴法兰螺栓",
    name_en: "side shaft flange bolt",
    assembly: "transmission",
    build_layer: 2,
    build_order: 358,
    geometry: { type: "cylinder", r: 0.009, h: 0.012, segments: 6 },
    material: "steel",
    instances: 8,
    indexed: true,
    instance_layout: TRANSMISSION_LAYOUTS.sideBolt,
    mate: { type: "absolute" },
    source: "每端 4 颗 M10（头底与法兰面留 3mm 名义缝），共 8 颗；对穿螺栓与终传输入轴端待 M-C。",
  });
  add({
    id: "tiger.transmission.brake_disc",
    name_cn: "侧传动制动盘",
    name_en: "side drive brake disc",
    assembly: "transmission",
    build_layer: 2,
    build_order: 359,
    geometry: {
      type: "merge",
      parts: [
        {
          type: "lathe",
          segments: 28,
          profile: [
            [0.07, -0.011],
            ["TR_BRAKE_R", -0.011],
            ["TR_BRAKE_R", 0.011],
            [0.07, 0.011],
          ],
        },
        { type: "tube", rOuter: 0.075, rInner: 0.04, h: 0.05, segments: 24 },
        { type: "boltCircle", count: 6, radius: 0.055, boltR: 0.01, boltH: 0.018, at: [0, 0.02, 0] },
        { type: "boltCircle", count: 6, radius: 0.055, boltR: 0.01, boltH: 0.018, at: [0, 0.002, 0] },
      ],
    },
    material: "cast_iron_dark",
    instances: 2,
    indexed: true,
    instance_layout: TRANSMISSION_LAYOUTS.brakeDisc,
    mate: { type: "absolute" },
    source:
      "φ550mm Argus 盘式制动器（盘体环 r 70~275，轮毂 ф150/ф80 套在侧传动轴上，径向 2mm 名义间隙）；制动时盘与钳贴合，属 M-C。",
  });
  add({
    id: "tiger.transmission.brake_caliper",
    name_cn: "制动钳",
    name_en: "brake caliper",
    assembly: "transmission",
    build_layer: 2,
    build_order: 360,
    geometry: {
      type: "merge",
      parts: [
        { type: "box", w: 0.06, h: 0.02, d: 0.055, at: [0, 0.023, -0.2725], bevel: 0.004 },
        { type: "box", w: 0.06, h: 0.02, d: 0.055, at: [0, -0.023, -0.2725], bevel: 0.004 },
        { type: "box", w: 0.06, h: 0.066, d: 0.03, at: [0, 0, -0.305], bevel: 0.004 },
        { type: "box", w: 0.05, h: 0.04, d: 0.1, at: [0, 0, -0.36], bevel: 0.004 },
      ],
    },
    material: "cast_iron",
    instances: 2,
    indexed: true,
    instance_layout: TRANSMISSION_LAYOUTS.brakeDisc,
    mate: { type: "absolute" },
    source:
      "跨在盘缘上的制动钳（两片摩擦块 + 桥 + 摆臂，块面离盘面 2mm）；钳体支架固定车体侧壁（L4 未建，钳摆臂为自由端）。",
  });

  // ================= 变速箱附件 =================
  add({
    id: "tiger.transmission.preselector",
    name_cn: "液压预选阀",
    name_en: "hydraulic preselector valve",
    assembly: "transmission",
    build_layer: 2,
    build_order: 361,
    geometry: {
      type: "merge",
      parts: [
        { type: "box", w: 0.32, h: 0.16, d: 0.09, at: [-3.13, 0.04, -0.439], bevel: 0.006 },
        { type: "box", w: 0.02, h: 0.16, d: 0.025, at: [-3.13, 0.2, -0.439], bevel: 0.003 },
        { type: "cylinder", r: 0.018, h: 0.03, at: [-3.13, 0.295, -0.439], segments: 16 },
      ],
    },
    material: "cast_iron_dark",
    mate: { type: "absolute" },
    source:
      "预选阀体（0.32 × 0.16 × 0.09）+ 联动臂（上端 y = 0.28 接 L3 预选杆）；阀面与壳侧阀座留 2mm 名义缝，油道/液压缸待 M-C。",
  });
  add({
    id: "tiger.transmission.oil_pump",
    name_cn: "变速箱油泵",
    name_en: "gearbox oil pump",
    assembly: "transmission",
    build_layer: 2,
    build_order: 362,
    geometry: {
      type: "merge",
      parts: [
        { type: "cylinder", r: 0.05, h: 0.06, at: [0, 0.03, 0], segments: 20, bevel: 0.002 },
        {
          type: "lathe",
          segments: 24,
          profile: [
            [0, -0.008],
            [0.075, -0.008],
            [0.075, 0.008],
            [0, 0.008],
          ],
        },
        { type: "box", w: 0.024, h: 0.024, d: 0.07, at: [0, 0.03, 0.065], bevel: 0.003 },
      ],
    },
    material: "cast_iron",
    mate: { type: "absolute", position: [-2.6, -0.2, -0.2], rotation: AXIS_X },
    source:
      "齿轮泵（ф100 泵体 + ф150 端盖）：端盖面 -2.616 与壳后泵座面 -2.62 留 4mm 缝，出油盒朝 -Z；吸油管与滤网待 M-C。",
  });

  // ================= 终传输入壳体（L2 第一批终传的接口件） =================
  add({
    id: "tiger.final_drive.input_case",
    name_cn: "终传输入壳体",
    name_en: "final drive input case",
    assembly: "final_drive",
    build_layer: 2,
    build_order: 363,
    geometry: {
      type: "kit",
      kit: "inputCase",
      params: { caseW: 0.3, caseH: 0.48, caseD: 0.096, hubR: 0.06, hubY: 0.654 },
    },
    material: "cast_iron",
    instances: 2,
    indexed: true,
    instance_layout: TRANSMISSION_LAYOUTS.inputCase,
    mate: { type: "absolute" },
    source:
      "终传输入壳体（0.30 × 0.48 × 0.096；局部原点 = 终传壳轴心 z = ±1.039，卡圈环抱终传壳内端法兰、径向 5mm 缝，立柱四角离轴心 ≥0.25）：输入凸台内端面 z = ±1.00，与侧传动轴外端留 18mm 缝、与法兰螺栓头面留 3mm；外侧离履带销内端 7mm。",
  });

  add({
    id: "tiger.transmission.gear_rim",
    name_cn: "齿轮齿圈",
    name_en: "Zahnkranz",
    assembly: "transmission",
    build_layer: 2,
    build_order: 364,
    geometry: {
      type: "kit",
      kit: "spurGear",
      params: { teeth: 30, r: 0.11, w: 0.044, bore: 0.109, bevel: 0.0006 },
    },
    material: "steel",
    instances: 7,
    indexed: true,
    instance_layout: "transmission.gearRim",
    mate: { type: "absolute" },
    source:
      "齿轮齿圈 7 只（30 齿，梯形齿廓 + 倒角）：主轴 3 只齿轮坯（ф140/ф180/ф220）与中间轴 4 只（ф180/ф220/ф260/ф300）各套一圈，齿顶 = 坯半径 + 11mm，按坯半径等比缩放。内孔比坯外径小 1mm（过盈套合）；ф220 齿圈齿顶 121 与换挡拨叉内径 122 留 1mm。齿圈让原来的「光坯齿轮」在剖视里真正有齿。",
  });

  return parts;
}
