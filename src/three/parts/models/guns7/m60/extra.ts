import type { ModelRegistry } from "../../../registry/types";

// ============================================================================
// models/guns7/m60/extra — M60 通用机枪派生改动
//
// M249 基座：导气式 + 回转闭锁 + 弹链供弹；M60 改 7.62×51、长枪管、
// 固定枪托、受弹机盖、手枪握把和 M60 两脚架。自动机节点沿用 Ak*。
// ============================================================================

function find(parts: ModelRegistry["parts"], id: string): ModelRegistry["parts"][number] | undefined {
  return parts.find((item) => item.id === id);
}

function move(parts: ModelRegistry["parts"], id: string, position: [number, number, number]): void {
  const part = find(parts, id);
  if (part?.mate?.type === "absolute") part.mate.position = position;
}

export function applyM60Mods(parts: ModelRegistry["parts"]): void {
  const barrel = find(parts, "m60.barrel.barrel");
  if (barrel) {
    barrel.geometry = {
      type: "kit",
      kit: "rifledBarrel",
      params: {
        profile: [
          [0.0090, 0],
          [0.0090, 0.46],
          [0.0086, 0.54],
          [0.0082, 0.56],
        ],
        boreR: 0.00381,
        landR: 0.00395,
        lands: 4,
        twistTurns: 2.33,
        chamberR: 0.0059,
        chamberLen: 0.051,
        segments: 24,
        ridgeSegments: 32,
      },
    };
    barrel.name_cn = "枪管（7.62×51 NATO，560mm）";
    barrel.name_en = "Barrel, 7.62×51 NATO, 560mm";
    barrel.source = "M60 枪管 560mm，4 条右旋膛线，缠距 305mm；弹膛容纳 7.62×51 NATO。";
  }

  move(parts, "m60.barrel.gas_regulator", [0, 0, 0.300]);
  move(parts, "m60.barrel.gas_tube", [0, 0.014, 0.150]);
  move(parts, "m60.barrel.carry_handle", [0, 0.0081, 0.345]);
  move(parts, "m60.barrel.flash_hider", [0, 0, 0.570]);
  const gasTube = find(parts, "m60.barrel.gas_tube");
  if (gasTube?.geometry.type === "tube") gasTube.geometry.h = 0.300;
  const gasBlock = find(parts, "m60.barrel.gas_regulator");
  if (gasBlock) gasBlock.source = "M60 导气箍位于枪管 300mm 处；导气孔 ⌀4.0，燃气推长行程活塞。";
  const carry = find(parts, "m60.barrel.carry_handle");
  if (carry) {
    carry.name_cn = "提把（含准星座）";
    carry.source = "M60 提把：固定在枪管上方，换枪管时提枪；前端准星座带护耳。";
  }

  const stock = find(parts, "m60.furniture.stock");
  if (stock) {
    stock.name_cn = "固定枪托";
    stock.name_en = "Fixed buttstock";
    stock.geometry = { type: "box", w: 0.040, h: 0.074, d: 0.230, bevel: 0.008 };
    stock.mate = { type: "absolute", position: [0, 0.018, -0.300] };
    stock.source = "M60 固定枪托：直托身 + 托底板，抵肩面高于枪膛轴线；内部让出复进簧通道。";
  }

  const bipod = find(parts, "m60.furniture.bipod");
  if (bipod) {
    bipod.name_cn = "两脚架卡箍";
    bipod.name_en = "Bipod clamp";
    bipod.geometry = { type: "box", w: 0.030, h: 0.020, d: 0.024, bevel: 0.0012 };
  }

  const ammo: Array<[string, Record<string, number | string | boolean>]> = [
    ["m60.belt.case", { rimR: 0.006, neckR: 0.0039, bodyR: 0.0059, baseR: 0.006, len: 0.051, shoulder: 0.72 }],
    ["m60.belt.bullet", { r: 0.0039, len: 0.033 }],
    ["m60.belt.core_lead", { r: 0.0026, len: 0.015 }],
    ["m60.belt.core_steel", { r: 0.0017, len: 0.010, pointed: true }],
    ["m60.belt.propellant", { rimR: 0.0046, neckR: 0.0044, bodyR: 0.0046, baseR: 0.0046, len: 0.032, shoulder: 0.8 }],
  ];
  for (const [id, params] of ammo) {
    const part = find(parts, id);
    if (part) part.geometry = { type: "kit", kit: part.geometry.type === "kit" ? part.geometry.kit : "cartridgeCase", params };
  }
  const casePart = find(parts, "m60.belt.case");
  if (casePart) casePart.source = "链上弹壳：7.62×51 NATO 黄铜弹壳（壳长 51mm）。";
  const bulletPart = find(parts, "m60.belt.bullet");
  if (bulletPart) bulletPart.source = "链上弹头：M80 7.62×51 被甲弹头。";
  const box = find(parts, "m60.belt.ammo_box");
  if (box) {
    box.name_cn = "100 发弹链箱";
    box.mate = { type: "absolute", position: [-0.078, -0.058, -0.080] };
    box.source = "M60 弹链箱：100 发 7.62×51 可散链，挂机匣左下，链从箱口进入受弹托盘。";
  }

  // M60 用手枪握把，拆掉 M249 的下方握把，避免两套握把重叠。
  const oldGrip = parts.findIndex((item) => item.id === "m60.fire.grip");
  if (oldGrip >= 0) parts.splice(oldGrip, 1);
}

export const M60_EXTRA_PARTS: ModelRegistry["parts"] = [
  {
    id: "m60.receiver.body",
    name_cn: "机匣外壳（全包）",
    name_en: "Receiver shell, full",
    assembly: "receiver",
    build_layer: 5,
    build_order: 156,
    geometry: { type: "kit", kit: "m60ReceiverShell", params: { w: 0.060, h: 0.094, z0: -0.250, z1: 0.060, t: 0.0024 } },
    material: "steel_phosphate",
    node: "AkRecoil",
    mate: { type: "absolute" },
    source: "M60 全包机匣外壳：60 × 94mm 冲压矩管，左右侧板、底板、尾板与前节套环围成完整机匣；中段顶部留受弹口，由大机盖封住。正常状态看不到枪机框/击锤/供弹滑板，爆炸或透视时才露出内部机构。",
  },
  {
    id: "m60.furniture.handguard_cap_rear",
    name_cn: "护木后箍",
    name_en: "Handguard rear ferrule",
    assembly: "furniture",
    build_layer: 5,
    build_order: 185,
    geometry: { type: "tube", rOuter: 0.0265, rInner: 0.0235, h: 0.008, segments: 28 },
    material: "steel_machined",
    node: "AkRecoil",
    mate: { type: "absolute", position: [0, 0, 0.080], rotation: [90, 0, 0] },
    source: "护木后箍：钢环包住聚合物护木尾端，防止护木口开裂并把它定位在枪管上。",
  },
  {
    id: "m60.furniture.handguard_cap_front",
    name_cn: "护木前箍",
    name_en: "Handguard front ferrule",
    assembly: "furniture",
    build_layer: 5,
    build_order: 186,
    geometry: { type: "tube", rOuter: 0.0265, rInner: 0.0235, h: 0.008, segments: 28 },
    material: "steel_machined",
    node: "AkRecoil",
    mate: { type: "absolute", position: [0, 0, 0.220], rotation: [90, 0, 0] },
    source: "护木前箍：与后箍一起把护木夹在枪管上，前端承接两脚架卡箍。",
  },
  {
    id: "m60.feed.cover",
    name_cn: "受弹机盖（M60 大盖）",
    name_en: "M60 feed cover",
    assembly: "feed",
    build_layer: 5,
    build_order: 160,
    geometry: {
      type: "merge",
      parts: [
        { type: "box", w: 0.060, h: 0.019, d: 0.154, bevel: 0.003, at: [0, 0.0555, -0.055] },
        { type: "box", w: 0.052, h: 0.004, d: 0.124, bevel: 0.001, at: [0, 0.067, -0.060] },
        { type: "box", w: 0.004, h: 0.012, d: 0.146, bevel: 0.0008, at: [-0.030, 0.049, -0.055] },
        { type: "box", w: 0.004, h: 0.012, d: 0.146, bevel: 0.0008, at: [0.030, 0.049, -0.055] },
      ],
    },
    material: "steel_phosphate",
    node: "AkRecoil",
    mate: { type: "absolute" },
    source: "M60 受弹机盖：整体冲压大盖，宽 60mm，两侧下裙边包住机匣上沿；铰接在机匣后上方，打开后可整体取下弹链。",
  },
  {
    id: "m60.feed.cover_hinge",
    name_cn: "机盖铰链轴",
    name_en: "Feed cover hinge pin",
    assembly: "feed",
    build_layer: 5,
    build_order: 260,
    geometry: { type: "cylinder", r: 0.0032, h: 0.060, segments: 12, bevel: 0 },
    material: "steel_machined",
    node: "AkRecoil",
    mate: { type: "absolute", position: [0, 0.058, -0.132], rotation: [0, 0, 90] },
    source: "受弹机盖铰链轴：横穿机匣后部耳座，机盖可绕它翻开。",
  },
  {
    id: "m60.feed.cover_latch",
    name_cn: "机盖卡榫",
    name_en: "Feed cover latch",
    assembly: "feed",
    build_layer: 5,
    build_order: 261,
    geometry: { type: "box", w: 0.020, h: 0.012, d: 0.016, bevel: 0.001 },
    material: "steel_machined",
    node: "AkRecoil",
    mate: { type: "absolute", position: [0, 0.058, 0.012] },
    source: "机盖卡榫：机盖前端锁在机匣上，按下卡榫才能打开。",
  },
  {
    id: "m60.furniture.pistol_grip",
    name_cn: "手枪握把",
    name_en: "Pistol grip",
    assembly: "furniture",
    build_layer: 4,
    build_order: 175,
    geometry: { type: "box", w: 0.030, h: 0.095, d: 0.038, bevel: 0.006 },
    material: "polymer",
    node: "AkRecoil",
    mate: { type: "absolute", position: [0, -0.080, -0.125], rotation: [18, 0, 0] },
    source: "M60 手枪握把：独立于枪托的垂直握把，底部带背带环座。",
  },
  {
    id: "m60.furniture.butt_plate",
    name_cn: "托底板",
    name_en: "Butt plate",
    assembly: "furniture",
    build_layer: 4,
    build_order: 176,
    geometry: { type: "box", w: 0.044, h: 0.078, d: 0.008, bevel: 0.002 },
    material: "rubber",
    node: "AkRecoil",
    mate: { type: "absolute", position: [0, 0.018, -0.418], rotation: [4, 0, 0] },
    source: "M60 橡胶托底板：抵肩缓冲，表面有防滑纹。",
  },
  {
    id: "m60.bipod.leg_l",
    name_cn: "左脚架",
    name_en: "Bipod leg, left",
    assembly: "furniture",
    build_layer: 4,
    build_order: 177,
    geometry: { type: "merge", parts: [{ type: "box", w: 0.012, h: 0.260, d: 0.012, bevel: 0.002, at: [0, -0.130, 0] }] },
    material: "steel_machined",
    node: "AkRecoil",
    mate: { type: "absolute", position: [-0.014, -0.026, 0.320], rotation: [0, 0, -14] },
    source: "M60 左脚架：260mm 钢管腿，展开后与枪管轴线约 14°；可折叠到枪管下方。",
  },
  {
    id: "m60.bipod.leg_r",
    name_cn: "右脚架",
    name_en: "Bipod leg, right",
    assembly: "furniture",
    build_layer: 4,
    build_order: 178,
    geometry: { type: "merge", parts: [{ type: "box", w: 0.012, h: 0.260, d: 0.012, bevel: 0.002, at: [0, -0.130, 0] }] },
    material: "steel_machined",
    node: "AkRecoil",
    mate: { type: "absolute", position: [0.014, -0.026, 0.320], rotation: [0, 0, 14] },
    source: "M60 右脚架：与左腿镜像，两腿由横撑和回位簧限位。",
  },
  {
    id: "m60.bipod.foot_l",
    name_cn: "左脚座",
    name_en: "Bipod foot, left",
    assembly: "furniture",
    build_layer: 4,
    build_order: 179,
    geometry: { type: "box", w: 0.024, h: 0.014, d: 0.034, bevel: 0.002 },
    material: "rubber",
    node: "AkRecoil",
    mate: { type: "absolute", position: [-0.077, -0.278, 0.320] },
    source: "M60 左脚座：橡胶底，硬地/雪地可换钢爪。",
  },
  {
    id: "m60.bipod.foot_r",
    name_cn: "右脚座",
    name_en: "Bipod foot, right",
    assembly: "furniture",
    build_layer: 4,
    build_order: 180,
    geometry: { type: "box", w: 0.024, h: 0.014, d: 0.034, bevel: 0.002 },
    material: "rubber",
    node: "AkRecoil",
    mate: { type: "absolute", position: [0.077, -0.278, 0.320] },
    source: "M60 右脚座：与左脚座同规格，独立球铰。",
  },
  {
    id: "m60.bipod.hinge",
    name_cn: "两脚架销轴",
    name_en: "Bipod hinge pin",
    assembly: "furniture",
    build_layer: 4,
    build_order: 266,
    geometry: { type: "cylinder", r: 0.0030, h: 0.044, segments: 12, bevel: 0 },
    material: "steel_machined",
    node: "AkRecoil",
    mate: { type: "absolute", position: [0, -0.026, 0.320], rotation: [0, 0, 90] },
    source: "两脚架销轴：横穿卡箍耳和两条腿的铰链孔。",
  },
  {
    id: "m60.bipod.spring",
    name_cn: "两脚架回位簧",
    name_en: "Bipod return spring",
    assembly: "furniture",
    build_layer: 4,
    build_order: 182,
    geometry: { type: "cylinder", r: 0.0050, h: 0.080, segments: 10, bevel: 0 },
    material: "steel_spring",
    node: "AkRecoil",
    mate: { type: "absolute", position: [0, -0.120, 0.320], rotation: [0, 0, 0] },
    source: "两脚架回位簧：折叠时蓄力，展开到位后把腿压紧在锁定槽内。",
  },
  {
    id: "m60.receiver.trigger_guard",
    name_cn: "扳机护圈",
    name_en: "Trigger guard",
    assembly: "fire",
    build_layer: 2,
    build_order: 140,
    geometry: { type: "box", w: 0.034, h: 0.008, d: 0.085, bevel: 0.002 },
    material: "steel_phosphate",
    node: "AkRecoil",
    mate: { type: "absolute", position: [0, -0.050, -0.105] },
    source: "M60 扳机护圈：与手枪握把一体，护住扳机。",
  },
  {
    id: "m60.fire.hammer_pin",
    name_cn: "击锤轴销",
    name_en: "Hammer pin",
    assembly: "fire",
    build_layer: 2,
    build_order: 262,
    geometry: { type: "cylinder", r: 0.0024, h: 0.046, segments: 10, bevel: 0 },
    material: "steel_machined",
    node: "AkRecoil",
    mate: { type: "absolute", position: [0, -0.026, -0.130], rotation: [0, 0, 90] },
    source: "击锤轴销：横穿机匣和击锤，击锤绕它回转。",
  },
  {
    id: "m60.fire.trigger_pin",
    name_cn: "扳机轴销",
    name_en: "Trigger pin",
    assembly: "fire",
    build_layer: 2,
    build_order: 263,
    geometry: { type: "cylinder", r: 0.0022, h: 0.044, segments: 10, bevel: 0 },
    material: "steel_machined",
    node: "AkRecoil",
    mate: { type: "absolute", position: [0, -0.024, -0.115], rotation: [0, 0, 90] },
    source: "扳机轴销：横穿机匣和扳机。",
  },
  {
    id: "m60.feed.cartridge_stop",
    name_cn: "阻弹齿",
    name_en: "Cartridge stop",
    assembly: "feed",
    build_layer: 2,
    build_order: 264,
    geometry: { type: "box", w: 0.010, h: 0.008, d: 0.012, bevel: 0.001 },
    material: "steel_machined",
    node: "AkRecoil",
    mate: { type: "absolute", position: [0, 0.032, -0.020] },
    source: "阻弹齿：阻止弹链在枪机后坐时后退，保证每发只进一个节距。",
  },
  {
    id: "m60.feed.link_guide",
    name_cn: "链节导板",
    name_en: "Link guide",
    assembly: "feed",
    build_layer: 2,
    build_order: 265,
    geometry: { type: "box", w: 0.034, h: 0.006, d: 0.060, bevel: 0.001 },
    material: "steel_machined",
    node: "AkRecoil",
    mate: { type: "absolute", position: [-0.018, 0.026, -0.040] },
    source: "链节导板：约束 M13 可散链节在受弹托盘内沿直线运动。",
  },
  {
    id: "m60.acc.sling_loop_front",
    name_cn: "前背带环",
    name_en: "Front sling loop",
    assembly: "furniture",
    build_layer: 5,
    build_order: 183,
    geometry: { type: "box", w: 0.018, h: 0.010, d: 0.016, bevel: 0.001 },
    material: "steel_machined",
    node: "AkRecoil",
    mate: { type: "absolute", position: [0, -0.020, 0.300] },
    source: "前背带环：挂在两脚架卡箍下方。",
  },
  {
    id: "m60.acc.sling_loop_rear",
    name_cn: "后背带环",
    name_en: "Rear sling loop",
    assembly: "furniture",
    build_layer: 5,
    build_order: 184,
    geometry: { type: "box", w: 0.014, h: 0.010, d: 0.012, bevel: 0.001 },
    material: "steel_machined",
    node: "AkRecoil",
    mate: { type: "absolute", position: [-0.022, 0.010, -0.300] },
    source: "后背带环：装在枪托左侧，背带从此绕过。",
  },
];
