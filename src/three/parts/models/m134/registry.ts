import * as THREE from "three";
import type { InstanceLayout } from "../../assembler/assembler";
import type { GeometryBuilder } from "../../assembler/geometry";
import type { ModelRegistry } from "../../registry/types";
import { GUN_MATERIALS } from "../guns/materials";
import { gunKitBuilders } from "../guns/kits";
import { gunHardwareBuilders } from "../guns/hardware";
import { m134KitBuilders } from "./kits";
import { M134_CONSTANTS } from "./constants";
import { beltLinkMatrix, beltRoundMatrix, M134_OFFSET, BELT_LINKS } from "./belt";
import { M134_EXTRA_PARTS, m134BarrelDetail, m134GearTeeth } from "./extra";
import { brassPose } from "./motion";

void M134_CONSTANTS.STAGE_Y;
const COUNT = M134_CONSTANTS.BARREL_COUNT;

// ============================================================================
// models/m134/registry —— M134 加特林（6 管旋转 + 每管独立枪机 + 外能源）
//
// 转管式自动原理：电机经减速齿轮组驱动 6 管束绕中心轴旋转；
// 每根枪管配独立枪机，枪机导销插在旋转机匣的凸轮槽里——
// 旋转中枪机依次完成 装填→闭锁→击发→抽壳→抛壳，射速 = 6 × 转速。
// ============================================================================

export const M134_NODES: ModelRegistry["nodes"] = [
  { name: "M134Stage", parent: "root", pivot: [0, "STAGE_Y", 0], note: "展示台基准" },
  { name: "M134Body", parent: "M134Stage", note: "固定机匣层（不转）" },
  { name: "M134Rotor", parent: "M134Stage", motion: "rotate", axis: "z", note: "旋转机匣 + 6 管束（转管核心）" },
  { name: "M134Gear", parent: "M134Stage", motion: "rotate", axis: "z", note: "减速大齿轮（与转子同转）" },
];

export const M134_ASSEMBLIES: ModelRegistry["assemblies"] = [
  { id: "rotor", name_cn: "旋转机匣 + 管束", name_en: "Rotor & barrel cluster", explode: [0, 0.4, 0.4] },
  { id: "bolts", name_cn: "枪机组（6 套）", name_en: "Bolt group ×6", explode: [0, 1.2, -0.4] },
  { id: "housing", name_cn: "固定机匣", name_en: "Housing", explode: [0, -0.2, -0.6] },
  { id: "drive", name_cn: "驱动系统", name_en: "Drive system", explode: [0, -1.0, -0.9] },
  { id: "feed", name_cn: "供弹系统", name_en: "Feed system", explode: [0, 1.3, 0.2] },
  { id: "mount", name_cn: "枪架", name_en: "Mount", explode: [0, -1.4, 0] },
  { id: "fx", name_cn: "特效", name_en: "Effects", explode: [0, 1.5, 1.2] },
];

export const M134_BUILDERS: Record<string, GeometryBuilder> = {
  ...gunKitBuilders,
  ...gunHardwareBuilders,
  ...m134KitBuilders,
};

export const M134_PARTS: ModelRegistry["parts"] = [
  // ===================== L1 旋转机匣 + 6 管束 =====================
  {
    id: "m134.rotor.body",
    name_cn: "旋转机匣（含凸轮槽）",
    name_en: "Rotor with cam track",
    assembly: "rotor",
    build_layer: 1,
    build_order: 101,
    geometry: { type: "kit", kit: "m134Rotor", params: { r: 0.052, len: 0.16, ringR: 0.032, count: 6 } },
    material: "steel_phosphate",
    node: "M134Rotor",
    mate: { type: "absolute", position: [0, 0, -0.16] },
    source: "旋转机匣：中空筒 + 6 个枪管孔座 + 尾端凸轮槽环——枪机导销在槽内滑动，旋转中把枪机推前拉后（转管机构的心脏）。",
  },
  {
    id: "m134.barrel.barrel",
    name_cn: "枪管（6 根，旋转）",
    name_en: "Barrel ×6",
    assembly: "rotor",
    build_layer: 1,
    build_order: 102,
    instances: COUNT,
    indexed: true,
    instance_layout: "m134BarrelRing",
    geometry: {
      type: "kit",
      kit: "rifledBarrel",
      params: {
        profile: [
          [0.0072, 0],
          [0.0072, 0.5],
          [0.0068, 0.54],
          [0.0065, 0.56],
        ],
        boreR: 0.00381,
        landR: 0.00395,
        lands: 4,
        twistTurns: 12,
        chamberR: 0.0052,
        chamberLen: 0.041,
        segments: 18,
        ridgeSegments: 22,
      },
    },
    material: "steel_blued",
    node: "M134Rotor",
    mate: { type: "absolute" },
    source: "枪管 ×6：绕中心轴均布（分布半径 32mm），随转子旋转；每根 4 条右旋膛线。",
  },
  {
    id: "m134.barrel.clamp_mid",
    name_cn: "枪管中箍",
    name_en: "Mid barrel clamp",
    assembly: "rotor",
    build_layer: 2,
    build_order: 103,
    geometry: {
      type: "lathe",
      profile: [
        [0.0385, 0],
        [0.045, 0],
        [0.045, 0.014],
        [0.0385, 0.014],
        [0.0385, 0],
      ],
      segments: 22,
    },
    material: "steel_phosphate",
    node: "M134Rotor",
    mate: { type: "absolute", position: [0, 0, 0.3], rotation: [90, 0, 0] },
    source: "枪管中箍：6 管在 300mm 处箍成一束（抑制旋转时的振动）。",
  },
  {
    id: "m134.barrel.clamp_muzzle",
    name_cn: "枪口箍",
    name_en: "Muzzle clamp",
    assembly: "rotor",
    build_layer: 2,
    build_order: 104,
    geometry: {
      type: "lathe",
      profile: [
        [0.0385, 0],
        [0.043, 0],
        [0.043, 0.012],
        [0.0385, 0.012],
        [0.0385, 0],
      ],
      segments: 22,
    },
    material: "steel_phosphate",
    node: "M134Rotor",
    mate: { type: "absolute", position: [0, 0, 0.55], rotation: [90, 0, 0] },
    source: "枪口箍：6 管在枪口端箍紧，保证弹道一致。",
  },
  // ===================== L1 枪机组（6 套独立枪机） =====================
  {
    id: "m134.bolt.bolt",
    name_cn: "独立枪机（每管一套）",
    name_en: "Bolt ×6",
    assembly: "bolts",
    build_layer: 1,
    build_order: 111,
    instances: COUNT,
    indexed: true,
    instance_layout: "m134BoltRing",
    geometry: { type: "kit", kit: "m134Bolt", params: { r: 0.0092, len: 0.085 } },
    material: "steel_machined",
    node: "M134Rotor",
    mate: { type: "absolute" },
    source: "独立枪机 ×6：每根枪管一套（导销插在转子凸轮槽里）——旋转中依次装填→闭锁→击发→抽壳→抛壳。",
  },
  // ===================== L1 固定机匣 =====================
  {
    id: "m134.housing.body",
    name_cn: "固定机匣（抛壳口/供弹座）",
    name_en: "Housing",
    assembly: "housing",
    build_layer: 1,
    build_order: 121,
    geometry: { type: "kit", kit: "m134Housing", params: { w: 0.13, h: 0.15, z0: -0.34, z1: 0.06 } },
    material: "steel_phosphate",
    node: "M134Body",
    mate: { type: "absolute" },
    source: "固定机匣：不转的外壳（上下板 + 两侧后板），左侧开抛壳口（弹壳瀑布式抛出）。",
  },
  // ===================== L1 外能源驱动 =====================
  {
    id: "m134.drive.motor",
    name_cn: "驱动电机（外能源）",
    name_en: "Drive motor",
    assembly: "drive",
    build_layer: 1,
    build_order: 131,
    geometry: { type: "kit", kit: "m134Motor", params: { r: 0.038, len: 0.11, gearR: 0.05, teeth: 36 } },
    material: "steel_phosphate",
    node: "M134Gear",
    mate: { type: "absolute", position: [0, 0, -0.34] },
    source: "驱动电机 + 减速齿轮组：加特林是**外能源**武器——没有导气/后坐自动机，全靠电机转（M134 的射速由油门/电机转速决定）。",
  },
  {
    id: "m134.drive.gear",
    name_cn: "减速大齿轮（36 齿）",
    name_en: "Reduction gear",
    assembly: "drive",
    build_layer: 1,
    build_order: 132,
    geometry: {
      type: "merge",
      parts: [
        {
          type: "lathe",
          profile: [
            [0.014, 0],
            [0.046, 0],
            [0.046, 0.01],
            [0.014, 0.01],
            [0.014, 0],
          ],
          segments: 26,
        },
      ],
    },
    material: "steel_machined",
    node: "M134Gear",
    mate: { type: "absolute", position: [0, 0, -0.2], rotation: [90, 0, 0] },
    source: "减速大齿轮：36:10 减速比——电机高转速转成转子可用的扭矩。",
  },
  // ===================== L1 供弹 =====================
  {
    id: "m134.feed.delinker",
    name_cn: "供弹机（脱链器）",
    name_en: "Delinker / feeder",
    assembly: "feed",
    build_layer: 1,
    build_order: 141,
    geometry: { type: "kit", kit: "m134Delinker", params: { w: 0.075 } },
    material: "steel_phosphate",
    node: "M134Body",
    mate: { type: "absolute", position: [0, 0.078, -0.02] },
    source: "供弹机：弹链从左侧进入，拨链轮把弹逐节送进旋转机匣的进弹位（6000 发/分需要极强的供弹）。",
  },
  {
    id: "m134.belt.link",
    name_cn: "弹链节（M13 链）",
    name_en: "Belt link",
    assembly: "feed",
    build_layer: 2,
    build_order: 142,
    instances: BELT_LINKS,
    indexed: true,
    instance_layout: "m134BeltLink",
    geometry: { type: "kit", kit: "beltLink", params: { pitch: 0.015, w: 0.019, t: 0.0012, throatR: 0.0062 } },
    material: "steel_blued",
    node: "M134Body",
    mate: { type: "absolute" },
    source: "M13 可散链节：7.62×51 弹链，从供弹机上方垂入。",
  },
  {
    id: "m134.feed.case",
    name_cn: "弹壳（7.62×51，链上）",
    name_en: "Case on belt",
    assembly: "feed",
    build_layer: 2,
    build_order: 143,
    instances: BELT_LINKS,
    indexed: true,
    instance_layout: "m134BeltCase",
    geometry: {
      type: "kit",
      kit: "cartridgeCase",
      params: { rimR: 0.006, neckR: 0.0044, bodyR: 0.0059, baseR: 0.0059, len: 0.051, shoulder: 0.68 },
    },
    material: "brass",
    node: "M134Body",
    mate: { type: "absolute" },
    source: "链上弹壳：7.62×51 NATO。",
  },
  {
    id: "m134.feed.bullet",
    name_cn: "弹头（链上）",
    name_en: "Bullet on belt",
    assembly: "feed",
    build_layer: 2,
    build_order: 144,
    instances: BELT_LINKS,
    indexed: true,
    instance_layout: "m134BeltBullet",
    geometry: { type: "kit", kit: "ammoBullet", params: { r: 0.0039, len: 0.0245 } },
    material: "copper",
    node: "M134Body",
    mate: { type: "absolute" },
    source: "链上弹头：M80 被甲弹。",
  },
  {
    id: "m134.feed.core_lead",
    name_cn: "铅套（链上）",
    name_en: "Lead core",
    assembly: "feed",
    build_layer: 2,
    build_order: 145,
    instances: BELT_LINKS,
    indexed: true,
    instance_layout: "m134BeltLead",
    geometry: { type: "kit", kit: "ammoCore", params: { r: 0.0028, len: 0.011 } },
    material: "lead",
    node: "M134Body",
    mate: { type: "absolute" },
    source: "铅套。",
  },
  {
    id: "m134.feed.core_steel",
    name_cn: "钢芯（链上）",
    name_en: "Steel core",
    assembly: "feed",
    build_layer: 2,
    build_order: 146,
    instances: BELT_LINKS,
    indexed: true,
    instance_layout: "m134BeltSteel",
    geometry: { type: "kit", kit: "ammoCore", params: { r: 0.0017, len: 0.007, pointed: true } },
    material: "steel_machined",
    node: "M134Body",
    mate: { type: "absolute" },
    source: "钢芯穿甲体。",
  },
  {
    id: "m134.feed.propellant",
    name_cn: "发射药（链上）",
    name_en: "Propellant",
    assembly: "feed",
    build_layer: 2,
    build_order: 147,
    instances: BELT_LINKS,
    indexed: true,
    instance_layout: "m134BeltPowder",
    geometry: {
      type: "kit",
      kit: "cartridgeCase",
      params: { rimR: 0.0048, neckR: 0.0046, bodyR: 0.0048, baseR: 0.0048, len: 0.034, shoulder: 0.75 },
    },
    material: "propellant",
    node: "M134Body",
    mate: { type: "absolute" },
    source: "发射药。",
  },
  // ===================== L1 枪架 =====================
  {
    id: "m134.mount.post",
    name_cn: "枪架（耳轴座）",
    name_en: "Mount",
    assembly: "mount",
    build_layer: 4,
    build_order: 151,
    geometry: { type: "kit", kit: "m134Mount", params: { drop: 0.18 } },
    material: "olive_drab",
    node: "M134Body",
    mate: { type: "absolute", position: [0, -0.09, -0.14] },
    source: "枪架：立柱 + 耳轴座（加特林装在载具/舱门上，可俯仰）。",
  },
  // ===================== L5 特效 =====================
  {
    id: "m134.fx.muzzle_flash",
    name_cn: "枪口焰（击发位）",
    name_en: "Muzzle flash",
    assembly: "fx",
    build_layer: 5,
    build_order: 161,
    geometry: { type: "kit", kit: "muzzleFlash", params: { r: 0.022, len: 0.06, petals: 6 } },
    material: "muzzle_flash",
    node: "M134Body",
    mate: { type: "absolute", position: [0, 0.032, 0.62] },
    tags: ["fx"],
    source: "枪口焰：只在**击发位**（正上方那根枪管）出现——转管枪的枪口焰是间歇的。",
  },
  {
    id: "m134.fx.tracer",
    name_cn: "曳光弹迹",
    name_en: "Tracer trace",
    assembly: "fx",
    build_layer: 5,
    build_order: 162,
    geometry: { type: "lathe", profile: [[0.0001, 0], [0.0035, 0], [0.0035, 1], [0.0001, 1]], segments: 6 },
    material: "tracer",
    node: "M134Body",
    mate: { type: "absolute", position: [0, 0.032, 0.64], rotation: [90, 0, 0] },
    tags: ["fx"],
    source: "曳光弹迹：自击发位枪口穿出（6000 发/分时是一道连续光带）。",
  },
  {
    id: "m134.fx.brass",
    name_cn: "弹壳池（瀑布式抛出）",
    name_en: "Brass pool",
    assembly: "fx",
    build_layer: 5,
    build_order: 163,
    instances: 14,
    indexed: true,
    instance_layout: "m134BrassRest",
    geometry: {
      type: "kit",
      kit: "cartridgeCase",
      params: { rimR: 0.006, neckR: 0.0044, bodyR: 0.0059, baseR: 0.0059, len: 0.051, shoulder: 0.68 },
    },
    material: "brass",
    node: "M134Body",
    mate: { type: "absolute" },
    tags: ["fx"],
    source: "弹壳池：转管枪每管抛一发——弹壳从左侧抛壳口**瀑布式**连续抛出（14 槽循环）。",
  },
];

// ---------------------------------------------------------------------------
// 实例布局（root 空间：模型坐标 + STAGE_Y）
// ---------------------------------------------------------------------------

/** 6 管束：绕中心轴均布（分布半径 32mm）；随 M134Rotor 节点旋转。 */
const barrelRing: InstanceLayout = ({ index, count }) => {
  const angle = (index / count) * Math.PI * 2;
  return new THREE.Matrix4().makeTranslation(
    Math.cos(angle) * M134_CONSTANTS.BARREL_RING_R,
    Math.sin(angle) * M134_CONSTANTS.BARREL_RING_R + M134_CONSTANTS.STAGE_Y,
    0,
  );
};

/** 6 套独立枪机：初始位（转子 0° 时）沿环均布；motion 逐帧重写。 */
const boltRing: InstanceLayout = ({ index, count }) => {
  const angle = (index / count) * Math.PI * 2;
  const m = new THREE.Matrix4().makeRotationZ(angle);
  m.setPosition(
    Math.cos(angle) * M134_CONSTANTS.BARREL_RING_R,
    Math.sin(angle) * M134_CONSTANTS.BARREL_RING_R + M134_CONSTANTS.STAGE_Y,
    -0.02,
  );
  return m;
};

/** 弹链节静止布局。 */
const beltLinkLayout: InstanceLayout = ({ index }) => beltLinkMatrix(index);

/** 链上弹六分件。 */
function beltRoundLayout(key: keyof typeof M134_OFFSET): InstanceLayout {
  return ({ index }) => beltRoundMatrix(index, M134_OFFSET[key]);
}

/** 弹壳池静止布局（motion 逐帧改写）。 */
const brassRest: InstanceLayout = ({ index }) => {
  const { position, quaternion } = brassPose(index);
  return new THREE.Matrix4().compose(position, quaternion, new THREE.Vector3(1, 1, 1));
};

export function makeM134Layouts(): Record<string, InstanceLayout> {
  return {
    m134BarrelRing: barrelRing,
    m134BoltRing: boltRing,
    m134BeltLink: beltLinkLayout,
    m134BeltCase: beltRoundLayout("case"),
    m134BeltBullet: beltRoundLayout("bullet"),
    m134BeltLead: beltRoundLayout("lead"),
    m134BeltSteel: beltRoundLayout("steel"),
    m134BeltPowder: beltRoundLayout("propellant"),
    m134BrassRest: brassRest,
    m134BarrelDetail: m134BarrelDetail,
    m134GearTeeth: m134GearTeeth,
  };
}

export const M134_MATERIALS: ModelRegistry["materials"] = {
  ...GUN_MATERIALS,
  olive_drab: { base: "#a9b189", metalness: 1, roughness: 0.52, preset: "steel_rough", pbr: "plates", anisotropy: 0.15, repeat: [2, 2], envMapIntensity: 1.1 },
};

export function makeM134Registry(): ModelRegistry {
  return {
    model: "m134",
    title: "M134 加特林",
    subtitle: "6 管旋转 · 每管独立枪机 · 外能源电机驱动",
    constants: { ...M134_CONSTANTS },
    nodes: M134_NODES,
    assemblies: M134_ASSEMBLIES,
    materials: M134_MATERIALS,
    parts: [...M134_PARTS, ...M134_EXTRA_PARTS],
    expectedContacts: [
      // 转管机构的封闭代理体：供弹机/固定机匣/弹链/转子/枪机在旋转与
      // 步进时互相交叠；按族声明构造性接触，深度超限仍会进 ACTIVE。
      { family: "m134-feed", a: "m134.feed.*", b: "m134.housing.*", reason: "供弹机/弹链从固定机匣顶部进入", maxDepthMm: 18, allowDisplaced: true, allowSuspect: true },
      { family: "m134-feed", a: "m134.feed.*", b: "m134.belt.*", reason: "弹链在供弹机拨链轮内", maxDepthMm: 18, allowDisplaced: true, allowSuspect: true },
      { family: "m134-feed", a: "m134.feed.*", b: "m134.feed.*", reason: "供弹机/弹链/弹药同族接触", maxDepthMm: 18, allowDisplaced: true, allowSuspect: true },
      { family: "m134-belt", a: "m134.belt.*", b: "m134.housing.*", reason: "弹链穿过固定机匣供弹口", maxDepthMm: 12, allowDisplaced: true, allowSuspect: true },
      { family: "m134-rotor", a: "m134.rotor.*", b: "m134.bolt.*", reason: "枪机导销在转子凸轮槽内（转管核心配合）", maxDepthMm: 12, allowDisplaced: true, allowSuspect: true },
      { family: "m134-barrel", a: "m134.barrel.*", b: "m134.barrel.*", reason: "6 根枪管与中箍/枪口箍/准星同轴装配", maxDepthMm: 8, allowDisplaced: true, allowSuspect: true },
      { family: "m134-drive", a: "m134.housing.*", b: "m134.drive.*", reason: "电机/减速齿轮固定在机匣尾部", maxDepthMm: 20, allowDisplaced: true, allowSuspect: true },
      { family: "m134-mount", a: "m134.housing.*", b: "m134.mount.*", reason: "固定机匣坐在枪架立柱上", maxDepthMm: 15, allowDisplaced: true, allowSuspect: true },
      { family: "m134-rotor", a: "m134.rotor.*", b: "m134.housing.*", reason: "转子的前后轴承在固定机匣内", maxDepthMm: 10, allowDisplaced: true, allowSuspect: true },
      { family: "m134-barrel", a: "m134.barrel.*", b: "m134.rotor.*", reason: "枪管穿过转子前端孔座", maxDepthMm: 10, allowDisplaced: true, allowSuspect: true },
      { family: "m134-bolt", a: "m134.bolt.*", b: "m134.bolt.*", reason: "枪机框/击针/抽壳钩/导销/滚轮同组装配", maxDepthMm: 10, allowDisplaced: true, allowSuspect: true },
      { family: "m134-bolt", a: "m134.bolt.*", b: "m134.barrel.*", reason: "枪机在枪管节套后方闭锁", maxDepthMm: 10, allowDisplaced: true, allowSuspect: true },
      { family: "m134-drive", a: "m134.drive.*", b: "m134.drive.*", reason: "减速大齿轮 36 齿与电机小齿轮啮合", maxDepthMm: 12, allowDisplaced: true, allowSuspect: true },
      { family: "bullet-core", a: "m134.feed.bullet", b: "m134.feed.core_lead", reason: "铅套压装在弹头被甲内", maxDepthMm: 5 },
      { family: "bullet-core", a: "m134.feed.bullet", b: "m134.feed.core_steel", reason: "钢芯压装在弹头被甲底部", maxDepthMm: 5 },
      { family: "case-loading", a: "m134.feed.case", b: "m134.feed.propellant", reason: "发射药装满弹壳", maxDepthMm: 5 },
      { family: "case-loading", a: "m134.feed.case", b: "m134.feed.bullet", reason: "弹头底缘坐于发射药面上", maxDepthMm: 5 },
      { family: "belt-cradle", a: "m134.belt.link", b: "m134.feed.case", reason: "M13 链节兜住弹壳", maxDepthMm: 4 },
      { family: "press-fit", a: "m134.rotor.body", b: "m134.barrel.barrel", reason: "枪管穿过旋转机匣的孔座（6 管一体）", maxDepthMm: 10 },
      { family: "press-fit", a: "m134.barrel.barrel", b: "m134.barrel.clamp_mid", reason: "中箍箍紧 6 管束", maxDepthMm: 10 },
      { family: "press-fit", a: "m134.barrel.barrel", b: "m134.barrel.clamp_muzzle", reason: "枪口箍箍紧 6 管束", maxDepthMm: 10 },
      { family: "bolt-track", a: "m134.bolt.bolt", b: "m134.rotor.body", reason: "枪机导销在转子凸轮槽内滑动（转管核心配合）", maxDepthMm: 6 },
      { family: "muzzle-fx", a: "m134.fx.muzzle_flash", b: "m134.fx.tracer", reason: "击发位枪口焰与曳光同源", maxDepthMm: 60 },
    ],
  };
}
