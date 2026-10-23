import type { ModelRegistry } from "../../../registry/types";

// ============================================================================
// models/guns7/rpk/extra — RPK 派生改动
//
// RPK 由 AK-47 派生：590mm 长枪管、两脚架、固定木托、加长表尺。
// 机匣/枪机/击发机构/弹匣沿用 AK；这里只改枪管组并追加 RPK 专有零件。
// ============================================================================

function moveZ(parts: ModelRegistry["parts"], id: string, z: number): void {
  const part = parts.find((item) => item.id === id);
  if (!part || part.mate?.type !== "absolute") return;
  const p = part.mate.position;
  part.mate.position = [p?.[0] ?? 0, p?.[1] ?? 0, z];
}

export function applyRpkMods(parts: ModelRegistry["parts"]): void {
  const barrel = parts.find((item) => item.id === "rpk.barrel.barrel");
  if (barrel) {
    barrel.geometry = {
      type: "kit",
      kit: "rifledBarrel",
      params: {
        profile: [
          [0.0087, 0],
          [0.0087, 0.18],
          [0.0084, 0.45],
          [0.008, 0.57],
          [0.0078, 0.59],
        ],
        boreR: 0.00381,
        landR: 0.00395,
        lands: 4,
        twistTurns: 2.46,
        chamberR: 0.0052,
        chamberLen: 0.041,
        segments: 26,
        ridgeSegments: 36,
      },
    };
    barrel.name_cn = "长枪管（590mm，4 条右旋膛线）";
    barrel.name_en = "Barrel, 590mm, 4 grooves RH 1:240mm";
    barrel.source = "RPK 590mm 长枪管：比 AK-47 长 175mm，缠距 240mm；枪口初速约 745m/s。";
  }

  moveZ(parts, "rpk.barrel.gas_block", 0.400);
  moveZ(parts, "rpk.barrel.gas_tube", 0.285);
  moveZ(parts, "rpk.barrel.front_sight", 0.503);
  moveZ(parts, "rpk.barrel.flash_hider", 0.590);
  moveZ(parts, "rpk.acc.muzzle_carbon", 0.610);

  const gasTube = parts.find((item) => item.id === "rpk.barrel.gas_tube");
  if (gasTube?.geometry.type === "tube") gasTube.geometry.h = 0.300;
  const gasBlock = parts.find((item) => item.id === "rpk.barrel.gas_block");
  if (gasBlock) gasBlock.source = "RPK 导气箍前移到长枪管 400mm 处；导气孔仍为 4.4mm，燃气推活塞。";
  const frontSight = parts.find((item) => item.id === "rpk.barrel.front_sight");
  if (frontSight) frontSight.source = "RPK 准星座位于枪口后方 109mm；护耳与 AK 相同，表尺射程 1000m。";
}

export const RPK_EXTRA_PARTS: ModelRegistry["parts"] = [
  {
    id: "rpk.furniture.butt_plate",
    name_cn: "钢制托底板",
    name_en: "Steel butt plate",
    assembly: "furniture",
    build_layer: 3,
    build_order: 900,
    geometry: { type: "box", w: 0.036, h: 0.100, d: 0.008, bevel: 0.0015 },
    material: "worn_blued",
    node: "AkRecoil",
    mate: { type: "absolute", position: [0, -0.008, -0.440], rotation: [0.06, 0, 0] },
    source: "RPK 固定木托的钢制托底板：抵肩面刻防滑纹，下缘有背带环座。",
  },
  {
    id: "rpk.receiver.rear_sight_leaf",
    name_cn: "表尺板（RPK 长表尺）",
    name_en: "Rear sight leaf",
    assembly: "receiver",
    build_layer: 2,
    build_order: 901,
    geometry: { type: "kit", kit: "rpkRearSight" },
    material: "gunsteel",
    node: "AkRecoil",
    mate: { type: "absolute", position: [0, 0.044, -0.070] },
    source: "RPK 表尺板：射程 100–1000m，缺口式照门；与 AK 的表尺座同位置但叶片更长。",
  },
  {
    id: "rpk.bipod.clamp",
    name_cn: "两脚架卡箍",
    name_en: "Bipod clamp",
    assembly: "accessories",
    build_layer: 2,
    build_order: 902,
    geometry: { type: "kit", kit: "rpkBipodClamp" },
    material: "gunsteel",
    node: "AkRecoil",
    mate: { type: "absolute", position: [0, -0.006, 0.500] },
    source: "两脚架卡箍：环抱长枪管，销轴让两腿可折叠到枪管下方；行军时由弹簧卡扣锁住。",
  },
  {
    id: "rpk.bipod.leg_l",
    name_cn: "左脚架",
    name_en: "Bipod leg, left",
    assembly: "accessories",
    build_layer: 2,
    build_order: 903,
    geometry: { type: "kit", kit: "rpkBipodLeg", params: { len: 0.260, sign: -1 } },
    material: "gunsteel",
    node: "AkRecoil",
    mate: { type: "absolute", position: [-0.014, -0.020, 0.500], rotation: [0, 0, -12.6] },
    source: "左脚架：矩形钢管，展开后与枪管轴线成 12.6°；长度 260mm，可锁在 0°/90°。",
  },
  {
    id: "rpk.bipod.leg_r",
    name_cn: "右脚架",
    name_en: "Bipod leg, right",
    assembly: "accessories",
    build_layer: 2,
    build_order: 904,
    geometry: { type: "kit", kit: "rpkBipodLeg", params: { len: 0.260, sign: 1 } },
    material: "gunsteel",
    node: "AkRecoil",
    mate: { type: "absolute", position: [0.014, -0.020, 0.500], rotation: [0, 0, 12.6] },
    source: "右脚架：与左腿镜像，底部脚座可独立调平；两腿由横撑弹簧限位。",
  },
  {
    id: "rpk.bipod.foot_l",
    name_cn: "左脚座",
    name_en: "Bipod foot, left",
    assembly: "accessories",
    build_layer: 2,
    build_order: 905,
    geometry: { type: "kit", kit: "rpkBipodFoot" },
    material: "rubber",
    node: "AkRecoil",
    mate: { type: "absolute", position: [-0.071, -0.274, 0.500] },
    source: "左脚座：橡胶底 + 钢爪，硬地抓地/雪地防滑；可 360° 自位。",
  },
  {
    id: "rpk.bipod.foot_r",
    name_cn: "右脚座",
    name_en: "Bipod foot, right",
    assembly: "accessories",
    build_layer: 2,
    build_order: 906,
    geometry: { type: "kit", kit: "rpkBipodFoot" },
    material: "rubber",
    node: "AkRecoil",
    mate: { type: "absolute", position: [0.071, -0.274, 0.500] },
    source: "右脚座：与左脚座同规格，独立球铰。",
  },
  {
    id: "rpk.bipod.spring_l",
    name_cn: "左腿回位簧",
    name_en: "Bipod spring, left",
    assembly: "accessories",
    build_layer: 2,
    build_order: 907,
    geometry: { type: "kit", kit: "rpkBipodSpring", params: { r: 0.0065, len: 0.100, wireR: 0.0009, coils: 9 } },
    material: "steel_spring",
    node: "AkRecoil",
    mate: { type: "absolute", position: [-0.040, -0.120, 0.500], rotation: [0, 0, -12.6] },
    source: "左腿回位簧：折叠时蓄力，展开到位后把腿压紧在锁定槽内。",
  },
  {
    id: "rpk.bipod.spring_r",
    name_cn: "右腿回位簧",
    name_en: "Bipod spring, right",
    assembly: "accessories",
    build_layer: 2,
    build_order: 908,
    geometry: { type: "kit", kit: "rpkBipodSpring", params: { r: 0.0065, len: 0.100, wireR: 0.0009, coils: 9 } },
    material: "steel_spring",
    node: "AkRecoil",
    mate: { type: "absolute", position: [0.040, -0.120, 0.500], rotation: [0, 0, 12.6] },
    source: "右腿回位簧：与左簧对称，套在腿管外侧。",
  },
  {
    id: "rpk.bipod.hinge",
    name_cn: "两脚架销轴",
    name_en: "Bipod hinge pin",
    assembly: "accessories",
    build_layer: 2,
    build_order: 909,
    geometry: { type: "cylinder", r: 0.0030, h: 0.042, segments: 12, bevel: 0 },
    material: "steel_machined",
    node: "AkRecoil",
    mate: { type: "absolute", position: [0, -0.016, 0.500], rotation: [0, 0, 90] },
    source: "两脚架销轴：横穿卡箍耳与两条腿的铰链孔，两端铆死。",
  },
];
