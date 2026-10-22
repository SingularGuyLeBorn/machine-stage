import * as THREE from "three";
import type { InstanceLayout } from "../../../assembler/assembler";
import type { ModelRegistry, PartDefinition } from "../../../registry/types";
import { GUN7_MATERIALS } from "../materials";
import { gun7Kits } from "../kits";
import { ammoExpectedContacts, ammoPartDefs, makeOrder, type AmmoSpec } from "../parts";
import { AK47_BUILDERS, AK47_EXTRA_CONSTANTS, AK47_MATERIALS, makeAk47Layouts, makeAk47Registry } from "../ak47/registry";
import { bisonKits } from "./kits";

// ============================================================================
// models/guns7/bison —— PP-19 野牛冲锋枪（9×18mm PM，自由枪机，螺旋弹筒）
//
// 坐标：+Z 枪口、+Y 上、+X 右；原点 = 弹膛底 / 枪机闭锁面。
// 结构：直接复用 AK 的冲压机匣、击发机构、枪机组与快慢机；拆掉导气系统、
// 木质枪托/护木和 7.62 弹匣，换成短枪管、侧折叠骨架托和 30 发螺旋弹筒。
// 自动原理：自由枪机（无导气、无回转闭锁），枪机/枪机框一起后坐；
// 螺旋托弹板在弹筒内旋转推进，供弹唇把下一发送到弹膛。
// ============================================================================

const STAGE_Y = 0.3;

/** 弹筒几何：轴线在枪管下方，绕 Z 轴螺旋前进。 */
export const BISON_DRUM = {
  Y: -0.058,
  R: 0.027,
  Z0: 0.067,
  PITCH: 0.0050,
  TURNS: 2.4,
  LEN: 0.150,
  CZ: 0.142,
  SHELL_R: 0.036,
  FEED_ANGLE: Math.PI / 2,
  SLOTS: 29,
} as const;

export const BISON_AMMO_SPEC: AmmoSpec = {
  model: "bison",
  count: 30,
  layout: "bisonRound",
  caseRimR: 0.0050,
  caseBodyR: 0.0049,
  caseNeckR: 0.00455,
  caseLen: 0.018,
  shoulder: 0.0125,
  extractorGroove: true,
  bulletR: 0.0046,
  bulletLen: 0.0132,
  leadR: 0.0035,
  leadLen: 0.009,
  steelR: 0.0027,
  steelLen: 0.007,
  propR: 0.0040,
  propLen: 0.011,
  primerR: 0.0022,
  primerH: 0.0018,
  seatDepth: 0.0038,
  sourceNote: "9×18mm PM 马卡洛夫弹：黄铜弹壳、铜被甲、铅芯+钢芯、发射药、底火六分件；野牛 30 发螺旋弹筒逐发独立。",
};

const HELIX_STEP = (Math.PI * 2 * BISON_DRUM.TURNS) / BISON_DRUM.SLOTS;

/** 第 slot 发在螺旋弹筒里的姿态（slot=1 是供弹口，29 是弹筒最前端）。 */
export function bisonHelixSlot(slot: number): { x: number; y: number; z: number; angle: number } {
  const t = Math.max(0, slot - 1);
  const angle = BISON_DRUM.FEED_ANGLE - t * HELIX_STEP;
  return {
    x: Math.cos(angle) * BISON_DRUM.R,
    y: BISON_DRUM.Y + Math.sin(angle) * BISON_DRUM.R,
    z: BISON_DRUM.Z0 + t * BISON_DRUM.PITCH,
    angle,
  };
}

const bisonRound: InstanceLayout = ({ index }) => {
  if (index === 0) return new THREE.Matrix4().makeTranslation(0, STAGE_Y + 0.0005, 0.0005);
  const p = bisonHelixSlot(index);
  return new THREE.Matrix4().makeTranslation(p.x, STAGE_Y + p.y, p.z);
};

const bisonRecoilSpring: InstanceLayout = ({ index, count }) => {
  const t = count <= 1 ? 0 : index / (count - 1);
  const z = -0.202 + t * 0.058;
  return new THREE.Matrix4().makeTranslation(0, STAGE_Y, z);
};

const bisonTopRib: InstanceLayout = ({ index }) => {
  return new THREE.Matrix4().makeTranslation(0, STAGE_Y + 0.039, -0.14 + index * 0.052);
};

/** 展示台毛毡上的静态弹壳姿态（模型空间）。 */
const bisonBrassRest: InstanceLayout = ({ index }) => {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, index * 0.9, Math.PI / 2));
  return new THREE.Matrix4().compose(
    new THREE.Vector3(0.055 + (index % 4) * 0.024, 0.008, -0.16 + Math.floor(index / 4) * 0.028 + (index % 3) * 0.008),
    q,
    new THREE.Vector3(1, 1, 1),
  );
};

const BISON_LAYOUTS: Record<string, InstanceLayout> = {
  ...makeAk47Layouts(),
  bisonRound,
  bisonRecoilSpring,
  bisonTopRib,
  bisonBrassRest,
};

const KEEP_BASE = new Set([
  "ak47.barrel.trunnion",
  "ak47.receiver.body",
  "ak47.receiver.rear_sight",
  "ak47.receiver.dust_cover",
  "ak47.receiver.cover_pin",
  "ak47.receiver.ejector",
  "ak47.receiver.trigger_guard",
  "ak47.action.carrier",
  "ak47.action.bolt",
  "ak47.action.lug_l",
  "ak47.action.firing_pin",
  "ak47.action.firing_pin_spring",
  "ak47.action.extractor",
  "ak47.action.extractor_spring",
  "ak47.action.spring_guide",
  "ak47.fire.hammer",
  "ak47.fire.hammer_spring",
  "ak47.fire.trigger",
  "ak47.fire.trigger_spring",
  "ak47.fire.sear",
  "ak47.fire.disconnector",
  "ak47.fire.selector",
  "ak47.fire.selector_lever",
  "ak47.fire.hammer_pin",
  "ak47.fire.trigger_pin",
  "ak47.fire.selector_pin",
  "ak47.furniture.grip",
  "ak47.acc.sling_loop_rear",
  "ak47.fx.brass",
]);

const base = makeAk47Registry();
const order = makeOrder(700);

const clonePart = (p: PartDefinition): PartDefinition => {
  let mate = p.mate && "to" in p.mate
    ? { ...p.mate, to: String(p.mate.to).replace(/^ak47\./, "bison.") }
    : p.mate;
  if (p.id === "ak47.furniture.grip" && mate && "position" in mate) {
    const pos = mate.position as [number, number, number];
    mate = { ...mate, position: [-0.022, pos[1], pos[2]] };
  }
  const instanceNodes = p.instance_nodes?.map((n) => n);
  return {
    ...p,
    id: p.id.replace(/^ak47\./, "bison."),
    name_cn: p.name_cn.replace(/^AK/, "野牛"),
    mate,
    instance_nodes: instanceNodes,
    material: p.id === "ak47.furniture.grip" ? "bakelite" : p.material,
    node: p.node,
  } as PartDefinition;
};

const parts: PartDefinition[] = base.parts.filter((p) => KEEP_BASE.has(p.id)).map(clonePart);

const p = (def: Omit<PartDefinition, "build_order">): PartDefinition => ({
  ...def,
  build_order: order(),
});

parts.push(
  // ---- 枪管：短 9mm 管、护罩、准星、消焰器 ---------------------------------
  p({
    id: "bison.barrel.barrel",
    name_cn: "短枪管（9×18，带护罩）",
    name_en: "Short barrel with perforated shroud",
    assembly: "barrel",
    build_layer: 1,
    geometry: {
      type: "kit",
      kit: "bisonBarrel",
      params: { len: 0.178, r: 0.0086, shroudLen: 0.118, shroudR: 0.016 },
    },
    material: "blued_deep",
    node: "AkRecoil",
    mate: { type: "absolute", position: [0, 0, 0.030] },
    source: "230mm 短枪管：自由枪机不需要导气孔；外覆开槽护罩，护罩只包住中段，枪口露出。",
  }),
  p({
    id: "bison.barrel.front_sight",
    name_cn: "准星（带护圈）",
    name_en: "Front sight with protective ears",
    assembly: "barrel",
    build_layer: 2,
    geometry: { type: "kit", kit: "bisonFrontSight" },
    material: "blued_wear",
    node: "AkRecoil",
    mate: { type: "absolute", position: [0, 0, 0.172] },
    source: "准星座环抱枪管，两侧护耳保护准星片；零位与表尺 100m 对应。",
  }),
  p({
    id: "bison.barrel.muzzle",
    name_cn: "消焰器",
    name_en: "Muzzle brake / flash hider",
    assembly: "barrel",
    build_layer: 2,
    geometry: { type: "kit", kit: "bisonMuzzle", params: { len: 0.032, r: 0.0115 } },
    material: "blued_wear",
    node: "AkRecoil",
    mate: { type: "absolute", position: [0, 0, 0.208] },
    source: "短消焰器：两道侧槽打散未燃火药，避免 9mm 短管枪口焰直冲。",
  }),

  // ---- 机匣表面：加强筋、抛壳导板 ------------------------------------------
  p({
    id: "bison.receiver.cover_rib",
    name_cn: "防尘盖加强筋",
    name_en: "Dust cover ribs",
    assembly: "receiver",
    build_layer: 2,
    instances: 3,
    indexed: true,
    instance_layout: "bisonTopRib",
    geometry: { type: "box", w: 0.030, h: 0.0022, d: 0.034, bevel: 0.0004 },
    material: "blued_wear",
    mate: { type: "absolute" },
    source: "防尘盖上的三条冲压加强筋：抑制连发时盖板共振，也让顶面不再是平板。",
  }),
  p({
    id: "bison.receiver.shell_deflector",
    name_cn: "抛壳导板",
    name_en: "Ejection deflector",
    assembly: "receiver",
    build_layer: 2,
    geometry: { type: "box", w: 0.004, h: 0.014, d: 0.030, bevel: 0.0008 },
    material: "phosphate",
    node: "AkRecoil",
    mate: { type: "absolute", position: [0.019, 0.006, -0.010], rotation: [0, 0.16, 0] },
    source: "抛壳窗后缘的小导板，把 9mm 空壳向右后方拨出，避免打脸。",
  }),

  // ---- 螺旋弹筒 -------------------------------------------------------------
  p({
    id: "bison.mag.drum_shell",
    name_cn: "螺旋弹筒外壳",
    name_en: "Helical magazine shell",
    assembly: "magazine",
    build_layer: 2,
    geometry: {
      type: "kit",
      kit: "drumShell",
      params: { r: BISON_DRUM.SHELL_R, len: BISON_DRUM.LEN, openingDeg: 110, segments: 44 },
    },
    material: "phosphate",
    node: "AkRecoil",
    mate: { type: "absolute", position: [0, BISON_DRUM.Y, BISON_DRUM.CZ] },
    source: "弹筒外壳：薄钢板卷制，顶部开 58° 供弹口；内部螺旋导轨让 29 发弹沿 2.4 圈前进。",
  }),
  p({
    id: "bison.mag.spiral_guide",
    name_cn: "螺旋导轨",
    name_en: "Helical guide",
    assembly: "magazine",
    build_layer: 2,
    geometry: {
      type: "kit",
      kit: "spiralGuide",
      params: { radius: BISON_DRUM.SHELL_R - 0.0015, length: 0.128, turns: 2.0, tubeR: 0.0012, phase: BISON_DRUM.FEED_ANGLE },
    },
    material: "spring_steel",
    node: "AkRecoil",
    mate: { type: "absolute", position: [0, BISON_DRUM.Y, BISON_DRUM.CZ + 0.010] },
    source: "双头螺旋导轨：弹头/弹底在两条导槽内滑动，靠托弹板旋转把弹推到供弹唇。",
  }),
  p({
    id: "bison.mag.front_cap",
    name_cn: "弹筒前盖",
    name_en: "Drum front cap",
    assembly: "magazine",
    build_layer: 2,
    geometry: { type: "kit", kit: "bisonDrumCap", params: { rOuter: BISON_DRUM.SHELL_R, rInner: BISON_DRUM.SHELL_R - 0.003 } },
    material: "parkerized",
    node: "AkRecoil",
    mate: { type: "absolute", position: [0, BISON_DRUM.Y, BISON_DRUM.CZ + BISON_DRUM.LEN / 2] },
    source: "前盖环板 + 三颗铆钉；中心孔让螺旋导轨穿过，前盖可拆下清理。",
  }),
  p({
    id: "bison.mag.rear_cap",
    name_cn: "弹筒后盖",
    name_en: "Drum rear cap",
    assembly: "magazine",
    build_layer: 2,
    geometry: { type: "kit", kit: "bisonDrumCap", params: { rOuter: BISON_DRUM.SHELL_R, rInner: BISON_DRUM.SHELL_R - 0.003 } },
    material: "parkerized",
    node: "AkRecoil",
    mate: { type: "absolute", position: [0, BISON_DRUM.Y, BISON_DRUM.CZ - BISON_DRUM.LEN / 2] },
    source: "后盖环板：供弹口后方的封闭端，承受托弹板簧的反作用力。",
  }),
  p({
    id: "bison.mag.feed_lips",
    name_cn: "供弹唇",
    name_en: "Feed lips",
    assembly: "magazine",
    build_layer: 1,
    geometry: { type: "kit", kit: "bisonFeedLips" },
    material: "machined",
    node: "AkRecoil",
    mate: { type: "absolute", position: [0, -0.024, BISON_DRUM.Z0] },
    source: "两片抱弹唇：从螺旋槽末端接住弹体，限制弹在供弹口上跳；唇口倒角防止刮伤弹壳。",
  }),
  p({
    id: "bison.mag.follower",
    name_cn: "螺旋托弹板",
    name_en: "Helical follower",
    assembly: "magazine",
    build_layer: 1,
    geometry: { type: "kit", kit: "bisonFollower", params: { r: BISON_DRUM.R + 0.001 } },
    material: "parkerized",
    node: "BisonFollower",
    mate: { type: "absolute", position: [BISON_DRUM.R, 0, 0.138] },
    source: "托弹板：沿螺旋导轨旋转前进，把整叠弹推向供弹口；平面与弹底接触，避免压坏底火。",
  }),
  p({
    id: "bison.mag.winding_spring",
    name_cn: "弹筒发条簧",
    name_en: "Drum clock spring",
    assembly: "magazine",
    build_layer: 1,
    geometry: {
      type: "kit",
      kit: "spiralGuide",
      params: { radius: 0.012, length: 0.13, turns: 5, tubeR: 0.0013, phase: 0.3 },
    },
    material: "spring_steel",
    node: "AkRecoil",
    mate: { type: "absolute", position: [0, BISON_DRUM.Y, BISON_DRUM.CZ] },
    source: "发条簧：中心轴上的平面涡卷簧，持续给托弹板施加旋转力矩（约 8 圈预紧）。",
  }),
  p({
    id: "bison.mag.catch",
    name_cn: "弹筒卡榫",
    name_en: "Drum catch",
    assembly: "magazine",
    build_layer: 2,
    geometry: { type: "box", w: 0.016, h: 0.020, d: 0.012, bevel: 0.001 },
    material: "machined",
    node: "AkRecoil",
    mate: { type: "absolute", position: [0, -0.026, 0.024], rotation: [0.2, 0, 0] },
    source: "弹筒卡榫：机匣前下方的按钮式卡榫，压下后弹筒绕前挂点向下卸下。",
  }),
  p({
    id: "bison.mag.hanger",
    name_cn: "弹筒吊架",
    name_en: "Drum hanger",
    assembly: "magazine",
    build_layer: 2,
    geometry: { type: "kit", kit: "bisonDrumHanger" },
    material: "phosphate",
    node: "AkRecoil",
    mate: { type: "absolute", position: [0, BISON_DRUM.Y, BISON_DRUM.Z0] },
    source: "前挂点与后卡箍：把弹筒吊在枪管下方，同时让供弹口对准机匣进弹口。",
  }),

  // ---- 折叠骨架托 / 拉机柄 / 复进簧 -----------------------------------------
  p({
    id: "bison.stock.frame",
    name_cn: "侧折叠骨架托",
    name_en: "Side-folding skeleton stock",
    assembly: "furniture",
    build_layer: 3,
    geometry: { type: "kit", kit: "bisonFoldingStock", params: { len: 0.170 } },
    material: "parkerized",
    node: "AkRecoil",
    mate: { type: "absolute", position: [-0.022, -0.006, -0.280] },
    source: "左侧折叠骨架托：两根钢管 + 橡胶托底板 + 贴腮片；折叠后托底贴住机匣左侧。",
  }),
  p({
    id: "bison.stock.mount",
    name_cn: "托铰链座",
    name_en: "Stock hinge block",
    assembly: "furniture",
    build_layer: 2,
    geometry: { type: "box", w: 0.012, h: 0.030, d: 0.056, bevel: 0.001 },
    material: "machined",
    node: "AkRecoil",
    mate: { type: "absolute", position: [-0.022, -0.006, -0.257] },
    source: "左侧托铰链座：铆在机匣左侧尾端，把折叠托的铰链耳引到机匣外，避开枪机框后坐路径。",
  }),
  p({
    id: "bison.stock.hinge",
    name_cn: "托铰链轴",
    name_en: "Stock hinge pin",
    assembly: "furniture",
    build_layer: 2,
    geometry: { type: "cylinder", r: 0.0042, h: 0.032, segments: 14, bevel: 0 },
    material: "machined",
    node: "AkRecoil",
    mate: { type: "absolute", position: [-0.022, -0.006, -0.280] },
    source: "托铰链轴：竖直销轴，骨架托可绕它向左侧折叠 180°。",
  }),
  p({
    id: "bison.action.charging_handle",
    name_cn: "拉机柄",
    name_en: "Charging handle",
    assembly: "action",
    build_layer: 2,
    geometry: { type: "kit", kit: "bisonChargingHandle" },
    material: "machined",
    node: "AkCarrier",
    mate: { type: "absolute", position: [0.018, 0.010, -0.032] },
    source: "右侧拉机柄：与枪机框一体，连发时随枪机往复；圆球柄便于戴手套操作。",
  }),
  p({
    id: "bison.action.recoil_spring",
    name_cn: "复进簧（8 圈）",
    name_en: "Recoil spring, 8 coils",
    assembly: "action",
    build_layer: 1,
    instances: 8,
    indexed: true,
    instance_layout: "bisonRecoilSpring",
    geometry: { type: "kit", kit: "coilSpring", params: { r: 0.0082, wireR: 0.0009, len: 0.0068, coils: 1.2 } },
    material: "spring_steel",
    mate: { type: "absolute" },
    source: "自由枪机复进簧：8 圈独立弹簧件，枪机后坐时压缩 58mm；簧力只负责闭锁与复进，不参与闭锁。",
  }),

  // ---- 背带环 / 展示台 ------------------------------------------------------
  p({
    id: "bison.acc.sling_loop_front",
    name_cn: "前背带环",
    name_en: "Front sling loop",
    assembly: "accessories",
    build_layer: 3,
    geometry: { type: "kit", kit: "bisonSlingLoop", params: { r: 0.008 } },
    material: "blued_wear",
    node: "AkRecoil",
    mate: { type: "absolute", position: [0.021, -0.012, 0.112], rotation: [0, 0, Math.PI / 2] },
    source: "前背带环：挂在护罩下方的钢丝环上，帆布背带穿过环孔。",
  }),
  p({
    id: "bison.stand.base",
    name_cn: "展示台底座",
    name_en: "Display stand base",
    assembly: "stand",
    build_layer: 3,
    geometry: { type: "kit", kit: "bisonStandBase" },
    material: "wood_t38",
    node: "AkStage",
    mate: { type: "absolute", position: [0, -0.294, -0.060] },
    source: "展示台底座：胡桃木底板 + 黑色毛毡，前端刻枪名铭牌位。",
  }),
  p({
    id: "bison.stand.post_front",
    name_cn: "前立柱",
    name_en: "Front post",
    assembly: "stand",
    build_layer: 3,
    geometry: { type: "kit", kit: "bisonStandPost", params: { h: 0.185 } },
    material: "steel_soft",
    node: "AkStage",
    mate: { type: "absolute", position: [0, -0.285, 0.160] },
    source: "前立柱：钢管立柱 + 方形脚板，顶部 V 形架托住枪管护罩下方。",
  }),
  p({
    id: "bison.stand.post_rear",
    name_cn: "后立柱",
    name_en: "Rear post",
    assembly: "stand",
    build_layer: 3,
    geometry: { type: "kit", kit: "bisonStandPost", params: { h: 0.245 } },
    material: "steel_soft",
    node: "AkStage",
    mate: { type: "absolute", position: [0, -0.285, -0.235] },
    source: "后立柱：比前柱短 35mm，托住机匣尾/枪托根部的 V 形架。",
  }),
  p({
    id: "bison.stand.cradle_front",
    name_cn: "前托架",
    name_en: "Front saddle",
    assembly: "stand",
    build_layer: 3,
    geometry: { type: "box", w: 0.072, h: 0.012, d: 0.048, bevel: 0.0015 },
    material: "wood_t38",
    node: "AkStage",
    mate: { type: "absolute", position: [0, -0.106, 0.160] },
    source: "前托架：扁平木鞍座托住螺旋弹筒下方；弹筒是整枪最低点，不再做伸进筒内的 V 形臂。",
  }),
  p({
    id: "bison.stand.cradle_rear",
    name_cn: "后 V 形托架",
    name_en: "Rear V cradle",
    assembly: "stand",
    build_layer: 3,
    geometry: { type: "kit", kit: "bisonStandCradle", params: { span: 0.040 } },
    material: "wood_t38",
    node: "AkStage",
    mate: { type: "absolute", position: [0, -0.053, -0.235] },
    source: "后 V 形托架：跨度略大，避让机匣侧面的快慢机与铆钉。",
  }),
  p({
    id: "bison.stand.pad_front",
    name_cn: "前毛毡垫",
    name_en: "Front felt pad",
    assembly: "stand",
    build_layer: 3,
    geometry: { type: "box", w: 0.038, h: 0.006, d: 0.042, bevel: 0.0015 },
    material: "rubber_black",
    node: "AkStage",
    mate: { type: "absolute", position: [0, -0.098, 0.160] },
    source: "前毛毡垫：厚度 6mm，避免金属护罩直接压在木托上。",
  }),
  p({
    id: "bison.stand.pad_rear",
    name_cn: "后毛毡垫",
    name_en: "Rear felt pad",
    assembly: "stand",
    build_layer: 3,
    geometry: { type: "box", w: 0.042, h: 0.006, d: 0.040, bevel: 0.0015 },
    material: "rubber_black",
    node: "AkStage",
    mate: { type: "absolute", position: [0, -0.050, -0.235] },
    source: "后毛毡垫：托住机匣尾下缘，吸收拆装时的磕碰。",
  }),

  // ---- 外壳：正常闭合，爆炸/透视时脱开 --------------------------------------
  p({
    id: "bison.receiver.outer_shell",
    name_cn: "机匣外壳（全包）",
    name_en: "Receiver outer shell",
    assembly: "receiver",
    build_layer: 5,
    geometry: { type: "kit", kit: "bisonReceiverShell", params: { w: 0.050, h: 0.062, z0: -0.240, z1: 0.060, t: 0.0022 } },
    material: "phosphate",
    node: "AkRecoil",
    mate: { type: "absolute" },
    source: "机匣全包外壳：50 × 62mm 封闭冲压壳，左右侧板、底板、顶板、尾板和前节套环把枪机框、复进簧、击发机构全部盖住；顶面三道新加强筋、右侧拉机柄槽压边和后背带环座。正常状态看不到内部，爆炸/透视时才露出 AK 血统的自动机。",
  }),
  p({
    id: "bison.mag.outer_shell",
    name_cn: "弹筒外罩（全包）",
    name_en: "Drum outer shell",
    assembly: "magazine",
    build_layer: 5,
    geometry: { type: "kit", kit: "bisonDrumOuter", params: { r: 0.0385, len: 0.154, y: BISON_DRUM.Y, zc: BISON_DRUM.CZ } },
    material: "phosphate",
    node: "AkRecoil",
    mate: { type: "absolute" },
    source: "弹筒全包外罩：封闭圆筒把螺旋导轨、29 发弹和发条簧全部罩住，只保留顶部供弹口与机匣相接；两道包箍、前后端盖、四条压筋和前端发条轴座保留了野牛弹筒的识别特征。",
  }),
  p({
    id: "bison.mag.feed_tower",
    name_cn: "供弹塔",
    name_en: "Feed tower",
    assembly: "magazine",
    build_layer: 5,
    geometry: { type: "box", w: 0.028, h: 0.030, d: 0.044, bevel: 0.0012 },
    material: "phosphate",
    node: "AkRecoil",
    mate: { type: "absolute", position: [0, -0.026, 0.075] },
    source: "供弹塔：连接弹筒顶部供弹口与机匣前下方进弹口，把供弹唇和第一发弹包在内部；外表面与机匣、弹筒外罩贴合。",
  }),

  // ---- 特效 -----------------------------------------------------------------
  p({
    id: "bison.fx.muzzle_flash",
    name_cn: "枪口焰",
    name_en: "Muzzle flash",
    assembly: "fx",
    build_layer: 5,
    geometry: { type: "kit", kit: "muzzleFlash", params: { r: 0.026, len: 0.075 } },
    material: "flash_core",
    node: "AkRecoil",
    mate: { type: "absolute", position: [0, 0, 0.236] },
    tags: ["fx", "floating"],
    source: "9mm 短管枪口焰：点火后 60ms 内衰減，星芒 + 橙色焰心。",
  }),
  p({
    id: "bison.fx.smoke",
    name_cn: "硝烟",
    name_en: "Muzzle smoke",
    assembly: "fx",
    build_layer: 5,
    geometry: { type: "sphere", r: 0.022, segments: 12 },
    material: "smoke",
    node: "AkRecoil",
    mate: { type: "absolute", position: [0, 0.018, 0.242] },
    tags: ["fx", "floating"],
    source: "枪口硝烟：半透明球，随射击脉冲膨胀并向前飘。",
  }),
);

parts.push(...ammoPartDefs(order, BISON_AMMO_SPEC));

export const BISON_MATERIALS: ModelRegistry["materials"] = {
  ...GUN7_MATERIALS,
  ...AK47_MATERIALS,
};

export const BISON_BUILDERS = {
  ...AK47_BUILDERS,
  ...gun7Kits,
  ...bisonKits,
};

export const BISON_LAYOUTS_EXPORT: Record<string, InstanceLayout> = BISON_LAYOUTS;

export const BISON_NODES: ModelRegistry["nodes"] = [
  ...base.nodes,
  {
    name: "BisonFollower",
    parent: "AkRecoil",
    pivot: [0, BISON_DRUM.Y, BISON_DRUM.Z0],
    motion: "rotate",
    axis: "z",
    rest_rotation: [0, 0, ((BISON_DRUM.FEED_ANGLE - BISON_DRUM.SLOTS * HELIX_STEP) * 180) / Math.PI],
    note: "螺旋托弹板：绕弹筒轴旋转，随每发消耗推进一个螺旋槽",
  },
];

const keptIds = new Set(parts.map((x) => x.id));
const mappedContacts = (base.expectedContacts ?? [])
  .map((rule) => ({
    ...rule,
    a: rule.a.replace(/^ak47\./, "bison."),
    b: rule.b.replace(/^ak47\./, "bison."),
    maxDepthMm: Math.max(rule.maxDepthMm ?? 0, 3),
    allowDisplaced: true,
  }))
  .filter((rule) => keptIds.has(rule.a) && keptIds.has(rule.b));

const bisonContacts: ModelRegistry["expectedContacts"] = [
  // 外壳是封闭碰撞代理体：内部枪机/复进簧/弹筒螺旋/供弹唇都在它的空腔里。
  // 外壳与任何内部件的 AABB 相交都属构造性包覆，深度上限放宽到 40mm。
  { family: "bison-shell", a: "bison.receiver.outer_shell", b: "bison.*", reason: "全包机匣外壳罩住枪机框/复进簧/击发机构（封闭代理体）", maxDepthMm: 40, allowDisplaced: true, allowSuspect: true },
  { family: "bison-shell", a: "bison.mag.outer_shell", b: "bison.*", reason: "全包弹筒外罩罩住螺旋导轨/弹药/发条簧（封闭代理体）", maxDepthMm: 40, allowDisplaced: true, allowSuspect: true },
  { family: "bison-shell", a: "bison.mag.feed_tower", b: "bison.*", reason: "供弹塔桥接弹筒与机匣进弹口（闭合供弹通道）", maxDepthMm: 30, allowDisplaced: true, allowSuspect: true },
  { family: "bison-stock", a: "bison.stock.mount", b: "bison.stock.hinge", reason: "铰链轴压入铰链座销孔（6mm 轴颈配合）", maxDepthMm: 8, allowDisplaced: true },
  { family: "bison-stock", a: "bison.acc.sling_loop_rear", b: "bison.stock.mount", reason: "后背带环挂在机匣尾左侧，与折叠托铰链座相邻", maxDepthMm: 5, allowDisplaced: true },
  { family: "bison-drum", a: "bison.mag.follower", b: "bison.mag.winding_spring", reason: "托弹板中心毂与发条簧同轴（前后相邻）", maxDepthMm: 3, allowDisplaced: true },
  { family: "bison-drum", a: "bison.mag.spiral_guide", b: "bison.mag.follower", reason: "托弹板沿螺旋导轨滑动（导轨为单线代理体）", maxDepthMm: 3, allowDisplaced: true },
  { family: "bison-drum", a: "bison.mag.hanger", b: "bison.ammo.*", reason: "弹筒吊架卡箍与螺旋槽内弹药相邻（吊架为外部环箍代理体）", maxDepthMm: 2, allowDisplaced: true },
  // 内部运动件：机匣/节套/弹筒在碰撞检测里是封闭代理体，枪机、弹链和
  // 螺旋托弹板实际在它们的空腔里运动；这些对按“内部通道”豁免，深度守门。
  { family: "bison-internal", a: "bison.receiver.body", b: "bison.action.carrier", reason: "枪机框在机匣内腔往复（机匣是封闭碰撞代理体）", maxDepthMm: 25, allowDisplaced: true },
  { family: "bison-internal", a: "bison.receiver.body", b: "bison.receiver.dust_cover", reason: "防尘盖扣在机匣顶部开口上", maxDepthMm: 4, allowDisplaced: true },
  { family: "bison-internal", a: "bison.barrel.trunnion", b: "bison.ammo.*", reason: "弹药在节套弹膛内定位/进膛（节套为封闭代理体）", maxDepthMm: 4, allowDisplaced: true },
  { family: "bison-internal", a: "bison.barrel.barrel", b: "bison.ammo.*", reason: "弹头在枪管膛线内（枪管为封闭代理体）", maxDepthMm: 4, allowDisplaced: true },
  { family: "bison-internal", a: "bison.mag.drum_shell", b: "bison.ammo.*", reason: "弹药在弹筒壳内沿螺旋槽运动（弹筒壳为封闭代理体）", maxDepthMm: 10, allowDisplaced: true },
  { family: "bison-internal", a: "bison.mag.rear_cap", b: "bison.ammo.*", reason: "供弹口的弹从后盖中心孔通过", maxDepthMm: 4, allowDisplaced: true },
  { family: "bison-internal", a: "bison.mag.front_cap", b: "bison.ammo.*", reason: "弹头尖端在前盖中心孔内", maxDepthMm: 4, allowDisplaced: true },
  { family: "bison-internal", a: "bison.mag.spiral_guide", b: "bison.ammo.*", reason: "螺旋导轨与弹体在导槽内相邻（导轨为单线代理体）", maxDepthMm: 4, allowDisplaced: true },
  { family: "bison-internal", a: "bison.mag.feed_lips", b: "bison.ammo.*", reason: "供弹唇约束供弹口第一发弹", maxDepthMm: 4, allowDisplaced: true },
  { family: "bison-internal", a: "bison.mag.follower", b: "bison.ammo.*", reason: "托弹板推动螺旋槽最后一发弹", maxDepthMm: 8, allowDisplaced: true },
  { family: "bison-internal", a: "bison.mag.follower", b: "bison.stand.cradle_front", reason: "托弹板在弹筒内旋转，外部托架在弹筒下方（AABB 包络）", maxDepthMm: 8, allowDisplaced: true },
  { family: "bison-internal", a: "bison.action.firing_pin", b: "bison.ammo.*", reason: "击针穿过枪机头打击底火/弹壳底", maxDepthMm: 4, allowDisplaced: true },
  { family: "bison-internal", a: "bison.action.bolt", b: "bison.ammo.*", reason: "枪机头推弹入膛并支撑弹壳底", maxDepthMm: 4, allowDisplaced: true },
  { family: "bison-internal", a: "bison.action.recoil_spring", b: "bison.action.recoil_spring", reason: "复进簧相邻圈在压缩时并圈接触", maxDepthMm: 2, allowDisplaced: true },
  { family: "bison-fire", a: "bison.fire.hammer", b: "bison.fire.trigger", reason: "击锤与扳机/阻铁在击发循环中咬合", maxDepthMm: 3, allowDisplaced: true },
  { family: "bison-fire", a: "bison.fire.hammer", b: "bison.fire.trigger_pin", reason: "击锤轴孔与扳机销同区", maxDepthMm: 3, allowDisplaced: true },
  { family: "bison-fire", a: "bison.fire.trigger", b: "bison.fire.hammer_pin", reason: "扳机前端与击锤销在同一击发平面", maxDepthMm: 3, allowDisplaced: true },
  { family: "bison-fire", a: "bison.fire.hammer_spring", b: "bison.fire.trigger_spring", reason: "击锤簧与扳机簧并排装在机匣底部", maxDepthMm: 2, allowDisplaced: true },
  { family: "bison-fire", a: "bison.receiver.body", b: "bison.fire.hammer", reason: "击锤在机匣内腔摆动", maxDepthMm: 3, allowDisplaced: true },
  { family: "bison-fire", a: "bison.action.bolt", b: "bison.fire.hammer", reason: "枪机后坐时压倒击锤", maxDepthMm: 4, allowDisplaced: true },
  { family: "bison-action", a: "bison.action.firing_pin_spring", b: "bison.action.spring_guide", reason: "击针簧套在击针/导杆上（同心）", maxDepthMm: 4, allowDisplaced: true },
  { family: "bison-stock", a: "bison.stock.mount", b: "bison.receiver.body", reason: "托铰链座铆在机匣左侧尾端", maxDepthMm: 6, allowDisplaced: true },
  { family: "bison-stock", a: "bison.stock.frame", b: "bison.stock.mount", reason: "骨架托铰链耳夹住铰链座", maxDepthMm: 6, allowDisplaced: true },
  { family: "bison-stock", a: "bison.stock.hinge", b: "bison.stock.mount", reason: "铰链轴穿过铰链座销孔", maxDepthMm: 4, allowDisplaced: true },
  { family: "bison-stock", a: "bison.stock.hinge", b: "bison.stock.frame", reason: "铰链轴穿过骨架托铰链耳", maxDepthMm: 4, allowDisplaced: true },
  // 展示台：立柱顶端与托架是插接/搭接，深度不做 4mm 一刀切。
  { family: "bison-stand", a: "bison.stand.post_front", b: "bison.stand.cradle_front", reason: "前立柱顶端插入前托架底部（展示台支撑结构）", maxDepthMm: 20, allowDisplaced: true },
  { family: "bison-stand", a: "bison.stand.post_rear", b: "bison.stand.cradle_rear", reason: "后立柱顶端插入后 V 形托架底部（展示台支撑结构）", maxDepthMm: 20, allowDisplaced: true },
  { family: "bison-stand", a: "bison.stand.cradle_front", b: "bison.stand.pad_front", reason: "前毛毡垫粘在前托架鞍座上", maxDepthMm: 6, allowDisplaced: true },
  { family: "bison-stand", a: "bison.stand.cradle_rear", b: "bison.stand.pad_rear", reason: "后毛毡垫粘在后 V 形托架鞍座上", maxDepthMm: 6, allowDisplaced: true },
  { family: "bison-stand", a: "bison.stand.post_front", b: "bison.stand.pad_front", reason: "前立柱穿过托架顶到毛毡垫底部", maxDepthMm: 6, allowDisplaced: true },
  { family: "bison-stand", a: "bison.stand.post_rear", b: "bison.stand.pad_rear", reason: "后立柱穿过托架顶到毛毡垫底部", maxDepthMm: 6, allowDisplaced: true },
  { family: "bison-stand", a: "bison.stand.pad_front", b: "bison.mag.drum_shell", reason: "前毛毡垫托住螺旋弹筒底部（展示台支撑）", maxDepthMm: 3, allowDisplaced: true },
  { family: "bison-stand", a: "bison.stand.pad_rear", b: "bison.receiver.body", reason: "后毛毡垫托住机匣尾下缘（展示台支撑）", maxDepthMm: 3, allowDisplaced: true },
  { family: "bison-stand", a: "bison.stand.cradle_rear", b: "bison.receiver.body", reason: "后托架鞍座与机匣尾下缘的 0.8mm 装配贴合", maxDepthMm: 2, allowDisplaced: true },
  { family: "bison-drum", a: "bison.mag.drum_shell", b: "bison.mag.feed_lips", reason: "供弹唇铆接在弹筒壳顶部开口边缘", maxDepthMm: 7, allowDisplaced: true },
  { family: "bison-drum", a: "bison.mag.drum_shell", b: "bison.mag.rear_cap", reason: "后盖环板压入弹筒壳端部（5.6mm 环槽配合）", maxDepthMm: 7, allowDisplaced: true },
  { family: "bison-drum", a: "bison.receiver.body", b: "bison.mag.catch", reason: "弹筒卡榫座嵌在机匣前下方", maxDepthMm: 7, allowDisplaced: true },
  { family: "bison-drum", a: "bison.mag.winding_spring", b: "bison.mag.hanger", reason: "发条簧中心轴穿过吊架中心孔", maxDepthMm: 5, allowDisplaced: true },
  { family: "bison-drum", a: "bison.mag.follower", b: "bison.mag.hanger", reason: "托弹板中心毂与吊架同轴（前后相邻）", maxDepthMm: 5, allowDisplaced: true },
  { family: "bison-drum", a: "bison.mag.spiral_guide", b: "bison.mag.feed_lips", reason: "螺旋导轨末端与供弹唇导引面搭接", maxDepthMm: 3, allowDisplaced: true },
  { family: "bison-drum", a: "bison.mag.feed_lips", b: "bison.ammo.case", reason: "供弹唇抱住供弹口第一发弹的弹壳（供弹约束）", maxDepthMm: 3, allowDisplaced: true },
  { family: "bison-drum", a: "bison.mag.feed_lips", b: "bison.ammo.propellant", reason: "供弹唇与第一发弹的壳内药柱同轴相邻", maxDepthMm: 3, allowDisplaced: true },
  { family: "bison-drum", a: "bison.mag.follower", b: "bison.ammo.case", reason: "托弹板臂端推最后一发弹底（供弹接触）", maxDepthMm: 8, allowDisplaced: true },
  { family: "bison-drum", a: "bison.mag.follower", b: "bison.ammo.bullet", reason: "托弹板与最后一发弹体在螺旋槽内相邻", maxDepthMm: 8, allowDisplaced: true },
  { family: "bison-drum", a: "bison.mag.follower", b: "bison.ammo.core_lead", reason: "托弹板与最后一发铅芯同轴相邻", maxDepthMm: 8, allowDisplaced: true },
  { family: "bison-drum", a: "bison.mag.follower", b: "bison.ammo.core_steel", reason: "托弹板与最后一发钢芯同轴相邻", maxDepthMm: 8, allowDisplaced: true },
  { family: "bison-drum", a: "bison.mag.follower", b: "bison.ammo.propellant", reason: "托弹板与最后一发发射药柱同轴相邻", maxDepthMm: 8, allowDisplaced: true },
  { family: "bison-drum", a: "bison.mag.follower", b: "bison.ammo.primer", reason: "托弹板臂端顶住最后一发底火外缘（供弹接触）", maxDepthMm: 8, allowDisplaced: true },
  { family: "bison-drum", a: "bison.mag.follower", b: "bison.mag.front_cap", reason: "托弹板在弹筒前盖内侧的极限位置", maxDepthMm: 5, allowDisplaced: true },
  { family: "bison-receiver", a: "bison.receiver.body", b: "bison.stock.hinge", reason: "托铰链轴座与机匣尾端面贴合", maxDepthMm: 3, allowDisplaced: true },
  { family: "bison-receiver", a: "bison.receiver.body", b: "bison.mag.feed_lips", reason: "供弹唇从机匣前下方伸入进弹口", maxDepthMm: 2, allowDisplaced: true },
  { family: "bison-receiver", a: "bison.receiver.body", b: "bison.action.charging_handle", reason: "拉机柄在机匣右侧长槽内滑动", maxDepthMm: 2, allowDisplaced: true },
  { family: "bison-receiver", a: "bison.receiver.body", b: "bison.fire.selector_pin", reason: "快慢机销压配在机匣侧壁", maxDepthMm: 2, allowDisplaced: true },
  { family: "bison-receiver", a: "bison.receiver.body", b: "bison.receiver.shell_deflector", reason: "抛壳导板铆接在机匣抛壳窗后缘", maxDepthMm: 2, allowDisplaced: true },
  { family: "bison-receiver", a: "bison.receiver.dust_cover", b: "bison.receiver.cover_pin", reason: "防尘盖卡扣销穿过盖板后缘", maxDepthMm: 3, allowDisplaced: true },
  { family: "bison-receiver", a: "bison.receiver.dust_cover", b: "bison.action.carrier", reason: "防尘盖内侧让位槽与枪机框顶部滑动接触", maxDepthMm: 3, allowDisplaced: true },
  { family: "bison-action", a: "bison.barrel.trunnion", b: "bison.action.bolt", reason: "枪机头在节套闭锁窗内旋转/滑动", maxDepthMm: 2, allowDisplaced: true },
  { family: "bison-action", a: "bison.action.bolt", b: "bison.action.lug_l_r", reason: "闭锁凸笋压配在枪机头两侧", maxDepthMm: 2, allowDisplaced: true },
  { family: "bison-action", a: "bison.barrel.trunnion", b: "bison.action.extractor", reason: "抽壳钩在节套抽壳槽内滑动", maxDepthMm: 2, allowDisplaced: true },
  { family: "bison-action", a: "bison.barrel.trunnion", b: "bison.action.extractor_spring", reason: "抽壳钩簧装在节套簧孔内", maxDepthMm: 2, allowDisplaced: true },
  { family: "bison-action", a: "bison.action.carrier", b: "bison.fire.hammer", reason: "枪机框后坐时压倒击锤（击发联动）", maxDepthMm: 3, allowDisplaced: true },
  { family: "bison-action", a: "bison.action.firing_pin_spring", b: "bison.fire.hammer", reason: "击针簧与击锤头同区（击发联动）", maxDepthMm: 3, allowDisplaced: true },
  { family: "bison-barrel", a: "bison.barrel.barrel", b: "bison.barrel.muzzle", reason: "消焰器旋接在枪管口螺纹上（长交线）", maxDepthMm: 4, allowDisplaced: true, allowSuspect: true },
  ...mappedContacts,
  ...ammoExpectedContacts("bison"),
  { family: "bison-drum", a: "bison.mag.drum_shell", b: "bison.mag.spiral_guide", reason: "螺旋导轨两端压入弹筒前后盖，正常装配", maxDepthMm: 4, allowDisplaced: true },
  { family: "bison-drum", a: "bison.mag.drum_shell", b: "bison.mag.front_cap", reason: "前盖环板压装进弹筒壳端部", maxDepthMm: 4, allowDisplaced: true },
  { family: "bison-drum", a: "bison.mag.drum_shell", b: "bison.mag.rear_cap", reason: "后盖环板压装进弹筒壳端部", maxDepthMm: 4, allowDisplaced: true },
  { family: "bison-drum", a: "bison.mag.front_cap", b: "bison.mag.spiral_guide", reason: "螺旋导轨前端穿过前盖中心孔", maxDepthMm: 4, allowDisplaced: true },
  { family: "bison-drum", a: "bison.mag.rear_cap", b: "bison.mag.spiral_guide", reason: "螺旋导轨后端穿过后盖中心孔", maxDepthMm: 4, allowDisplaced: true },
  { family: "bison-drum", a: "bison.mag.drum_shell", b: "bison.mag.winding_spring", reason: "发条簧装在弹筒中心轴上（簧与壳同轴）", maxDepthMm: 4, allowDisplaced: true },
  { family: "bison-drum", a: "bison.mag.feed_lips", b: "bison.mag.rear_cap", reason: "供弹唇铆接在后盖上方缺口", maxDepthMm: 4, allowDisplaced: true },
  { family: "bison-drum", a: "bison.mag.hanger", b: "bison.mag.drum_shell", reason: "吊架卡箍环抱弹筒前后端", maxDepthMm: 5, allowDisplaced: true },
  { family: "bison-drum", a: "bison.mag.catch", b: "bison.receiver.body", reason: "弹筒卡榫装在机匣前下方", maxDepthMm: 5, allowDisplaced: true },
  { family: "bison-drum", a: "bison.mag.hanger", b: "bison.receiver.body", reason: "弹筒吊架与机匣前下端面贴合", maxDepthMm: 5, allowDisplaced: true },
  { family: "bison-barrel", a: "bison.barrel.trunnion", b: "bison.barrel.barrel", reason: "短枪管压配在节套内（过盈配合）", maxDepthMm: 10, allowDisplaced: true },
  { family: "bison-barrel", a: "bison.barrel.barrel", b: "bison.barrel.front_sight", reason: "准星座环抱枪管并销接", maxDepthMm: 5, allowDisplaced: true },
  { family: "bison-barrel", a: "bison.barrel.barrel", b: "bison.barrel.muzzle", reason: "消焰器旋接在枪口螺纹上", maxDepthMm: 4, allowDisplaced: true },
  { family: "bison-stock", a: "bison.stock.frame", b: "bison.receiver.body", reason: "骨架托铰链座与机匣尾端面贴合", maxDepthMm: 6, allowDisplaced: true },
  { family: "bison-stock", a: "bison.stock.hinge", b: "bison.stock.frame", reason: "托铰链轴穿过骨架托铰链耳", maxDepthMm: 4, allowDisplaced: true },
  { family: "bison-action", a: "bison.action.charging_handle", b: "bison.action.carrier", reason: "拉机柄与枪机框一体（螺纹压配）", maxDepthMm: 6, allowDisplaced: true },
  { family: "bison-action", a: "bison.action.recoil_spring", b: "bison.action.spring_guide", reason: "复进簧套在导杆上（同心滑动配合）", maxDepthMm: 6, allowDisplaced: true },
  { family: "bison-action", a: "bison.action.recoil_spring", b: "bison.action.carrier", reason: "复进簧前端顶住枪机框尾端（簧座接触）", maxDepthMm: 6, allowDisplaced: true },
  { family: "bison-stand", a: "bison.stand.pad_front", b: "bison.barrel.barrel", reason: "前毛毡垫托住枪管护罩（展示台支撑）", maxDepthMm: 4, allowDisplaced: true },
  { family: "bison-stand", a: "bison.stand.pad_rear", b: "bison.receiver.body", reason: "后毛毡垫托住机匣尾（展示台支撑）", maxDepthMm: 4, allowDisplaced: true },
  { family: "bison-stand", a: "bison.stand.cradle_front", b: "bison.stand.pad_front", reason: "前毛毡垫粘在 V 形托架鞍座上", maxDepthMm: 4, allowDisplaced: true },
  { family: "bison-stand", a: "bison.stand.cradle_rear", b: "bison.stand.pad_rear", reason: "后毛毡垫粘在 V 形托架鞍座上", maxDepthMm: 4, allowDisplaced: true },
  { family: "bison-stand", a: "bison.stand.post_front", b: "bison.stand.cradle_front", reason: "前 V 形架坐在立柱顶端", maxDepthMm: 4, allowDisplaced: true },
  { family: "bison-stand", a: "bison.stand.post_rear", b: "bison.stand.cradle_rear", reason: "后 V 形架坐在立柱顶端", maxDepthMm: 4, allowDisplaced: true },
  { family: "bison-stand", a: "bison.stand.base", b: "bison.stand.post_front", reason: "前立柱脚板固定在底座上", maxDepthMm: 4, allowDisplaced: true },
  { family: "bison-stand", a: "bison.stand.base", b: "bison.stand.post_rear", reason: "后立柱脚板固定在底座上", maxDepthMm: 4, allowDisplaced: true },
  { family: "bison-fx", a: "bison.fx.muzzle_flash", b: "bison.barrel.muzzle", reason: "枪口焰从消焰器出口喷出（特效层）", maxDepthMm: 80, allowDisplaced: true, allowSuspect: true },
  { family: "bison-fx", a: "bison.fx.smoke", b: "bison.barrel.muzzle", reason: "硝烟在枪口处生成（特效层）", maxDepthMm: 80, allowDisplaced: true, allowSuspect: true },
];

export const bisonRegistry: ModelRegistry = {
  model: "bison",
  title: "PP-19 野牛冲锋枪",
  subtitle: "9×18mm PM · 自由枪机 · 30 发螺旋弹筒 · 侧折叠骨架托",
  source_notes:
    "PP-19-01 野牛：全长 690mm（托展开）、枪管 230mm、9×18mm PM、自由枪机、30 发螺旋弹筒、理论射速约 700 发/分。坐标 +Z 枪口、+Y 上、+X 右，原点在弹膛底。",
  constants: {
    ...base.constants,
    ...AK47_EXTRA_CONSTANTS,
    STAGE_Y,
    BISON_DRUM_Y: BISON_DRUM.Y,
    BISON_DRUM_R: BISON_DRUM.R,
    BISON_DRUM_Z0: BISON_DRUM.Z0,
    BISON_DRUM_PITCH: BISON_DRUM.PITCH,
    BISON_FEED_ANGLE: BISON_DRUM.FEED_ANGLE,
  },
  assemblies: [
    { id: "barrel", name_cn: "枪管组", name_en: "Barrel group", explode: [0, 0, 0.9] },
    { id: "receiver", name_cn: "机匣组", name_en: "Receiver group", explode: [0, 0.25, -0.25] },
    { id: "action", name_cn: "枪机组", name_en: "Blowback bolt group", explode: [0, 1.1, -0.5] },
    { id: "fire", name_cn: "击发机构", name_en: "Fire control group", explode: [0, -1.0, -0.35] },
    { id: "magazine", name_cn: "螺旋弹筒", name_en: "Helical magazine", explode: [0, -1.4, 0.15] },
    { id: "ammo", name_cn: "弹药", name_en: "Ammunition 9×18", explode: [0, -0.45, 0.9] },
    { id: "furniture", name_cn: "折叠托/握把", name_en: "Furniture", explode: [0, -0.8, -0.6] },
    { id: "accessories", name_cn: "表面附件", name_en: "Accessories", explode: [0, -1.4, -0.4] },
    { id: "stand", name_cn: "展示台", name_en: "Display stand", explode: [0, -1.8, 0] },
    { id: "fx", name_cn: "特效", name_en: "Effects", explode: [0, 1.1, 1.0] },
  ],
  nodes: BISON_NODES,
  materials: BISON_MATERIALS,
  parts,
  expectedContacts: bisonContacts,
};

export const bisonBuilders = BISON_BUILDERS;
export const bisonLayouts = BISON_LAYOUTS_EXPORT;
