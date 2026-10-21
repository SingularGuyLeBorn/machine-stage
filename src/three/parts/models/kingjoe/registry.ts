import type { InstanceLayout } from "../../assembler/assembler";
import type { GeometryBuilder } from "../../assembler/geometry";
import type { ExpectedContactRule, ModelRegistry, PartDefinition } from "../../registry/types";
import { KINGJOE_CONSTANTS } from "./constants";
import { KINGJOE_MATERIALS } from "./materials";
import { KINGJOE_NODES } from "./nodes";
import { DOCKS } from "./rig";
import { KingJoeParts, addAxialDock } from "./helpers";
import { addShipParts } from "./ship";
import { addChestParts } from "./chest";
import { addStomachParts } from "./stomach";
import { addLegsParts } from "./legs";
import { addKingJoeSkin, kjSkinBuilders } from "./skin";
import { addRealMeshDetails } from "./real-details";
import { KINGJOE_SKIN_MATERIALS } from "../kingjoe-skin/materials";
import { KINGJOE_LAYOUTS } from "./layouts";
import { kingjoeBuilders } from "./kits";

// ============================================================================
// models/kingjoe —— 金古桥整机注册表（真实网格皮 + 原有四体机构）
//
// 皮：kingjoe-skin/segments.generated.json 的 578 件真实网格分件，按蒙皮骨架
//     重新挂到 hip/knee/ankle/arm/forearm/hand/finger 与四个模块节点。
// 骨：原四体对接（锥销/锁环/电弧/阻尼）、液压、反重力、喷口、怪光线内构保留。
// 旧的自造外壳与表面装饰（层 4/5 甲板、肩荚、头壳等）由真实皮替代，按 id 剔除。
// ============================================================================

/**
 * 真实皮是薄壳，旧自造骨架/外壳/喷口按旧外形（8.16m）制造，整体偏大。
 * 只保留能藏进真实内腔的核心机构；外形与四肢全由真实皮承担。
 */
const KEEP_CORE: RegExp[] = [
  /\.skin_/,
  /\.rainbow_/,
  /\.forehead_emitter$/,
  /\.dock_(stomach_legs|chest_stomach|neck)_/,
  /\.emitter_(cooling|mount|capacitor_a$|capacitor_b$|capacitor_bracket_[ab]$|capacitor_c$)/,
  /\.ag_core$/,
  /\.waist_(drum|flange|top_plate|motor$|motor_mount|reducer|encoder|bearing_lower|bearing_upper|gear$|gear_teeth|lock_pin)/,
  /\.hyd_(knee|ankle)_/,
];

function keepCoreMechanisms(parts: PartDefinition[]): PartDefinition[] {
  const kept: PartDefinition[] = [];
  for (const part of parts) {
    if (!KEEP_CORE.some((pattern) => pattern.test(part.id))) continue;
    if (part.id.endsWith("_align_rail") || part.id.endsWith("_hook")) continue;
    if (part.id.includes(".hyd_knee_") && (part.id.endsWith("_clevis") || part.id.endsWith("_pin"))) continue;
    let scale: number | null = null;
    if (!part.id.includes(".skin_")) {
      if (part.id.includes(".dock_neck")) scale = 0.32;
      else if (part.id.includes(".dock_")) scale = 0.42;
      else if (part.id.includes(".waist_")) scale = 0.55;
      else if (part.id.includes(".ag_")) scale = 0.35;
      else if (part.id.includes(".hyd_")) scale = 0.5;
      else if (part.id.includes(".emitter_")) scale = 0.8;
    }
    kept.push(scale ? { ...part, scale: [scale, scale, scale] } : part);
  }
  return kept;
}

/** 真实网格源资产是多片壳互嵌的游戏低模；只豁免皮-皮，不豁免机构-皮。 */
const SKIN_SOURCE_CONTACTS = (["legs", "stomach", "chest", "ship"] as const).flatMap((a) =>
  (["legs", "stomach", "chest", "ship"] as const).map((b) => ({
    family: "kingjoe-real-skin-source",
    a: `kingjoe.${a}.skin_*`,
    b: `kingjoe.${b}.skin_*`,
    reason: "真实网格源壳互嵌（7224 顶点游戏低模，非切件错误）",
    maxDepthMm: 2000,
  })),
);

/**
 * 关节处的皮壳在源网格里本来就互相嵌入（大腿顶段包在骨盆内、手指根包在掌内）。
 * 这是可动关节的构造性重叠，合并成部位件后仍会保留；按「相邻部位对」显式豁免。
 */
const SKIN_SELF_PREFIXES = [
  "kingjoe.legs.skin_hip_skirt_",
  "kingjoe.legs.skin_thigh_",
  "kingjoe.legs.skin_shin_",
  "kingjoe.legs.skin_foot_",
  "kingjoe.stomach.skin_pelvis_",
  "kingjoe.stomach.skin_abdomen_",
  "kingjoe.chest.skin_chest_",
  "kingjoe.chest.skin_upperarm_",
  "kingjoe.chest.skin_forearm_",
  "kingjoe.chest.skin_hand_",
  "kingjoe.chest.skin_finger_",
  "kingjoe.ship.skin_head_",
];

const SKIN_JOINT_CONTACTS: ExpectedContactRule[] = [
  ...SKIN_SELF_PREFIXES.map((prefix) => ({
    family: "kingjoe-skin-self",
    a: `${prefix}*`,
    b: `${prefix}*`,
    reason: "同部位双材质/多层皮壳叠合（源网格原状）",
    maxDepthMm: 300,
    anyForm: true,
  })),
  {
    family: "kingjoe-skin-joints",
    a: "kingjoe.legs.skin_thigh_*",
    b: "kingjoe.stomach.skin_pelvis_*",
    reason: "源网格髋关节：大腿顶段位于骨盆壳内",
    maxDepthMm: 1200,
    anyForm: true,
  },
  {
    family: "kingjoe-skin-joints",
    a: "kingjoe.legs.skin_hip_skirt_*",
    b: "kingjoe.stomach.skin_pelvis_*",
    reason: "源网格髋关节：髋裙与骨盆壳层叠",
    maxDepthMm: 1200,
    anyForm: true,
  },
  {
    family: "kingjoe-skin-joints",
    a: "kingjoe.legs.skin_hip_skirt_*",
    b: "kingjoe.legs.skin_thigh_*",
    reason: "源网格髋关节：髋裙包住大腿根",
    maxDepthMm: 1200,
    anyForm: true,
  },
  {
    family: "kingjoe-skin-joints",
    a: "kingjoe.legs.skin_thigh_*",
    b: "kingjoe.legs.skin_shin_*",
    reason: "源网格膝关节：大腿/小腿壳在膝部交叠",
    maxDepthMm: 900,
    anyForm: true,
  },
  {
    family: "kingjoe-skin-joints",
    a: "kingjoe.legs.skin_shin_*",
    b: "kingjoe.legs.skin_foot_*",
    reason: "源网格踝关节：小腿/足壳在踝部交叠",
    maxDepthMm: 900,
    anyForm: true,
  },
  {
    family: "kingjoe-skin-joints",
    a: "kingjoe.stomach.skin_abdomen_*",
    b: "kingjoe.stomach.skin_pelvis_*",
    reason: "源网格腰部：上腹/骨盆壳层叠",
    maxDepthMm: 900,
    anyForm: true,
  },
  {
    family: "kingjoe-skin-joints",
    a: "kingjoe.stomach.skin_abdomen_*",
    b: "kingjoe.chest.skin_upperarm_*",
    reason: "源网格腰/臂相邻壳层叠",
    maxDepthMm: 1200,
    anyForm: true,
  },
  {
    family: "kingjoe-skin-joints",
    a: "kingjoe.chest.skin_forearm_*",
    b: "kingjoe.chest.skin_hand_*",
    reason: "源网格腕关节：前臂/手掌壳交叠",
    maxDepthMm: 600,
    anyForm: true,
  },
  {
    family: "kingjoe-skin-joints",
    a: "kingjoe.chest.skin_finger_*",
    b: "kingjoe.chest.skin_hand_*",
    reason: "源网格手指根位于掌壳内",
    maxDepthMm: 600,
    anyForm: true,
  },
  {
    family: "kingjoe-skin-joints",
    a: "kingjoe.chest.skin_chest_*",
    b: "kingjoe.ship.skin_head_*",
    reason: "源网格颈关节：头/胸壳在颈圈处交叠",
    maxDepthMm: 900,
    anyForm: true,
  },
];

/** 彩虹格栅/眼带是分层叠件，层间 5mm；按叠层族豁免。 */
const DETAIL_LAYER_CONTACTS: ExpectedContactRule[] = [
  {
    family: "kingjoe-detail-layers",
    a: "kingjoe.chest.rainbow_*",
    b: "kingjoe.chest.rainbow_*",
    reason: "彩虹格栅分层叠装（框/背板/彩带/横栅）",
    maxDepthMm: 40,
    anyForm: true,
  },
];

/** 肩/肘是真实网格的包覆式关节：厚肩荚与上臂、上臂与肘罩在转动时互相嵌入。 */
const JOINT_MOTION_CONTACTS: ExpectedContactRule[] = [
  {
    family: "kingjoe-joint-motion",
    a: "kingjoe.chest.skin_chest_*",
    b: "kingjoe.chest.skin_upperarm_*",
    reason: "肩荚包覆上臂根（源网格肩关节），合体展臂时在关节内互嵌",
    maxDepthMm: 320,
    anyForm: true,
  },
  {
    family: "kingjoe-joint-motion",
    a: "kingjoe.chest.skin_upperarm_*",
    b: "kingjoe.chest.skin_forearm_*",
    reason: "上臂/前臂源壳在肘关节内互嵌",
    maxDepthMm: 320,
    anyForm: true,
  },
];

/** 对接件沿着真实蒙皮内腔/接缝滑动；外部被皮与 120mm 接缝遮挡。 */
const HIDDEN_DOCK_CONTACTS: ExpectedContactRule[] = (["ship", "chest", "stomach", "legs"] as const).flatMap(
  (a) =>
    (["ship", "chest", "stomach", "legs"] as const).map((b) => ({
      family: "kingjoe-hidden-dock",
      a: `kingjoe.${a}.dock_*`,
      b: `kingjoe.${b}.skin_*`,
      reason: "对接销/环/承座沿蒙皮内腔与接缝滑动（外部不可见）",
      maxDepthMm: 260,
      anyForm: true,
    })),
);

/** 胸口发射内构位于胸顶/颈接缝内腔，射击俯仰时被头部蒙皮遮住。 */
const HIDDEN_EMITTER_CONTACTS: ExpectedContactRule[] = (["ship", "chest", "stomach"] as const).map((b) => ({
  family: "kingjoe-hidden-emitter",
  a: "kingjoe.chest.emitter_*",
  b: `kingjoe.${b}.skin_*`,
  reason: "胸口怪光线内构位于胸顶内腔（外部不可见）",
  maxDepthMm: 140,
  anyForm: true,
}));

/** 锥销/锁环/承座/锁钩本来就是插接配合；豁免同族对接件之间的接触。 */
const DOCK_CONTACTS: ExpectedContactRule[] = (["ship", "chest", "stomach", "legs"] as const).flatMap((a) =>
  (["ship", "chest", "stomach", "legs"] as const).map((b) => ({
    family: "kingjoe-dock-fits",
    a: `kingjoe.${a}.dock_*`,
    b: `kingjoe.${b}.dock_*`,
    reason: "对接销/锁环/承座同轴插入配合（120mm 接缝内）",
    maxDepthMm: 120,
    anyForm: true,
  })),
);

export function makeKingJoeRegistry(): ModelRegistry {
  const builder = new KingJoeParts();
  addLegsParts(builder);
  addStomachParts(builder);
  addChestParts(builder);
  addShipParts(builder);
  for (const dock of DOCKS) addAxialDock(builder, dock);
  addKingJoeSkin(builder);
  addRealMeshDetails(builder);
  const parts = keepCoreMechanisms(builder.finalize());

  return {
    model: "kingjoe",
    title: "金古桥 King Joe",
    subtitle: "真实网格皮 · 四体分离合体 · 锥销/锁环 · 彩虹胸 · 反重力 · 怪光线",
    source_notes: [
      "原作：宇宙ロボット キングジョー（『ウルトラセブン』第14/15話，1968，圆谷）。",
      "公开设定：身高 55m / 体重 48000t / 四体分离合体 / 额头破坏光线 / 佩丹尼姆合金。",
      "外形：King_Joe.glb / kingjoe-mesh.obj 真实网格（7224 顶点 / 7258 三角 / 459 壳），",
      "按蒙皮骨架切成 578 件皮；本项目模块切面 3.45 / 4.55 / 5.65，对接缝 120mm。",
      "骨：原四体机构（锥销/锁环/电弧/阻尼/液压/反重力/喷口/怪光线内构）保留并重新对位。",
      "版权：奥特曼 IP；本工程仅个人参考，不做商用。",
    ].join("\n"),
    constants: {
      ...KINGJOE_CONSTANTS,
      // 装配回放/查询用的派生数字
      SHIP_TOP: KINGJOE_CONSTANTS.SHIP_Y + KINGJOE_CONSTANTS.SHIP_H,
      ROBOT_HEIGHT: KINGJOE_CONSTANTS.SHIP_Y + KINGJOE_CONSTANTS.SHIP_H,
    },
    assemblies: [
      { id: "ship", name_cn: "King Ship 头部飞船", name_en: "King Ship", explode: [0, 3.2, 0] },
      { id: "chest", name_cn: "King Chest 胸部飞船 + 双臂", name_en: "King Chest", explode: [0, 1.8, 0] },
      { id: "stomach", name_cn: "King Stomach 腹部飞船", name_en: "King Stomach", explode: [0, 0.8, 0] },
      { id: "legs", name_cn: "King Legs 腿部飞船", name_en: "King Legs", explode: [0, -1.4, 0] },
    ],
    nodes: KINGJOE_NODES,
    materials: { ...KINGJOE_MATERIALS, ...KINGJOE_SKIN_MATERIALS },
    expectedContacts: [
      ...SKIN_SOURCE_CONTACTS,
      ...SKIN_JOINT_CONTACTS,
      ...DOCK_CONTACTS,
      ...DETAIL_LAYER_CONTACTS,
      ...JOINT_MOTION_CONTACTS,
      ...HIDDEN_DOCK_CONTACTS,
      ...HIDDEN_EMITTER_CONTACTS,
    ],
    parts,
  };
}

export function makeKingJoeLayouts(): Record<string, InstanceLayout> {
  return KINGJOE_LAYOUTS;
}

export const kingjoeModelBuilders: Record<string, GeometryBuilder> = {
  ...kingjoeBuilders,
  ...kjSkinBuilders,
};
