import type { InstanceLayout } from "../../assembler/assembler";
import type { GeometryBuilder } from "../../assembler/geometry";
import type { ExpectedContactRule, ModelRegistry } from "../../registry/types";
import { makeEngineRegistry, ENGINE_LAYOUTS } from "./engine/registry";
import { mbtEngineKitBuilders } from "./engine/kits";
import { makeTransmissionRegistry, TRANSMISSION_LAYOUTS } from "./transmission/registry";
import { makeRunningRegistry, RUNNING_LAYOUTS } from "./running/registry";
import { mbtRunningKitBuilders } from "./running/kits";
import { makeInteriorRegistry, INTERIOR_LAYOUTS } from "./interior/registry";
import { makeHullRegistry, HULL_LAYOUTS } from "./hull/registry";
import { mbtHullKitBuilders } from "./hull/kits";

export { MBT, MBT_TRACK_LINKS_PER_SIDE, MBT_TRACK_PERIMETER, mbtTrackPose } from "./constants";

// ============================================================================
// models/mbt/registry —— MBT-90 整机注册表（自内向外分层合并）
//
// L1 engine/（V12 双涡轮柴油机） + transmission/（7 前 2 倒综合传动）
// L2 running/（履带 / 14 负重轮 / 液气悬挂）
// L3 interior/（驾驶舱 / 炮长 / 车长 / 吊篮 / 自动装弹机 / 40 发弹药）
// L4 hull/（复合装甲车体+炮塔 / ERA / 120mm 滑膛炮）
// L5 surface（迷彩 / 战术编号 / 工具 / 油桶 / 做旧）
// ============================================================================

function orderParts(parts: ModelRegistry["parts"]): ModelRegistry["parts"] {
  const sorted = [...parts].sort(
    (a, b) => a.build_layer - b.build_layer || a.build_order - b.build_order || a.id.localeCompare(b.id),
  );
  return sorted.map((part, index) => ({ ...part, build_order: 100 + index }));
}

function mergeRegistries(parts: ModelRegistry[], title: string, subtitle: string): ModelRegistry {
  return {
    model: "mbt90",
    title,
    subtitle,
    source_notes: parts.map((p) => p.source_notes ?? "").filter(Boolean).join("\n"),
    constants: Object.assign({}, ...parts.map((p) => p.constants)),
    assemblies: parts.flatMap((p) => p.assemblies),
    nodes: parts.flatMap((p) => p.nodes),
    materials: Object.assign({}, ...parts.map((p) => p.materials)),
    parts: orderParts(parts.flatMap((p) => p.parts)),
    expectedContacts: parts.flatMap((p) => p.expectedContacts ?? []),
  };
}

const CROSS_LAYER: ExpectedContactRule[] = [
  {
    family: "layer-engine-hull",
    a: "mbt90.engine.*",
    b: "mbt90.hull.*",
    reason: "动力包安装在车体后部：机脚/支架/排气/冷却包与车体甲板、尾板、隔板的安装贴合",
    maxDepthMm: 90,
    allowDisplaced: true,
    allowSuspect: true,
  },
  {
    family: "layer-engine-transmission",
    a: "mbt90.engine.*",
    b: "mbt90.transmission.*",
    reason: "发动机飞轮/曲轴输出与变速箱输入端的法兰连接",
    maxDepthMm: 90,
    allowDisplaced: true,
    allowSuspect: true,
  },
  {
    family: "layer-engine-interior",
    a: "mbt90.engine.*",
    b: "mbt90.interior.*",
    reason: "动力舱与战斗室隔板两侧的相邻设备（传动/弹药/电气）",
    maxDepthMm: 60,
    allowDisplaced: true,
    allowSuspect: true,
  },
  {
    family: "layer-transmission-hull",
    a: "mbt90.transmission.*",
    b: "mbt90.hull.*",
    reason: "变速箱/终传/转向机安装在车体底甲板与侧甲上",
    maxDepthMm: 90,
    allowDisplaced: true,
    allowSuspect: true,
  },
  {
    family: "layer-transmission-running",
    a: "mbt90.transmission.*",
    b: "mbt90.running.*",
    reason: "终传输出轴与主动轮轮毂的花键连接（主动轮后置）",
    maxDepthMm: 90,
    allowDisplaced: true,
    allowSuspect: true,
  },
  {
    family: "layer-running-hull",
    a: "mbt90.running.*",
    b: "mbt90.hull.*",
    reason: "悬挂支座/扭杆端盖/侧裙支架与车体侧甲、底甲、翼子板的安装贴合",
    maxDepthMm: 90,
    allowDisplaced: true,
    allowSuspect: true,
  },
  {
    family: "layer-running-interior",
    a: "mbt90.running.*",
    b: "mbt90.interior.*",
    reason: "战斗室/吊篮/转盘与车体底甲板、悬挂包络的相邻空间",
    maxDepthMm: 45,
    allowDisplaced: true,
    allowSuspect: true,
  },
  {
    family: "layer-interior-hull",
    a: "mbt90.interior.*",
    b: "mbt90.hull.*",
    reason: "内饰/吊篮/弹药/自动装弹机安装在车体与炮塔内（座椅、显控台、弹架与甲板/座圈贴合）",
    maxDepthMm: 100,
    allowDisplaced: true,
    allowSuspect: true,
  },
  {
    family: "layer-interior-transmission",
    a: "mbt90.interior.*",
    b: "mbt90.transmission.*",
    reason: "战斗室/吊篮与变速箱、转向差速器在座圈下方的相邻空间",
    maxDepthMm: 80,
    allowDisplaced: true,
    allowSuspect: true,
  },
  {
    family: "layer-engine-running",
    a: "mbt90.engine.*",
    b: "mbt90.running.*",
    reason: "动力包与后部悬挂/主动轮在动力舱两侧的安装包络（机脚、履带张紧器、悬挂支座）",
    maxDepthMm: 70,
    allowDisplaced: true,
    allowSuspect: true,
  },
  {
    family: "interior-ammo-carousel-ring",
    a: "mbt90.interior.ammo_*",
    b: "mbt90.interior.carousel_*",
    reason: "待发弹装在转盘弹筒/转盘环内（弹体与弹筒内壁、转盘环的安装包络）",
    maxDepthMm: 90,
    allowDisplaced: true,
    allowSuspect: true,
  },
  {
    family: "interior-ammo-basket",
    a: "mbt90.interior.ammo_*",
    b: "mbt90.interior.basket_*",
    reason: "转盘待发弹从吊篮地板中央开口穿过（弹筒顶与地板环开口的包络）",
    maxDepthMm: 90,
    allowDisplaced: true,
    allowSuspect: true,
  },
  {
    family: "interior-ammo-autoloader",
    a: "mbt90.interior.ammo_*",
    b: "mbt90.interior.autoloader_*",
    reason: "待发弹与提弹臂/推弹杆/托弹槽的取弹行程包络",
    maxDepthMm: 90,
    allowDisplaced: true,
    allowSuspect: true,
  },
  {
    family: "interior-ammo-carousel-crew",
    a: "mbt90.interior.ammo_*",
    b: "mbt90.interior.gunner*",
    reason: "转盘待发弹与炮长席的装配包络（弹筒顶与座椅/瞄准镜座）",
    maxDepthMm: 80,
    allowDisplaced: true,
    allowSuspect: true,
  },
  {
    family: "interior-ammo-carousel-commander",
    a: "mbt90.interior.ammo_*",
    b: "mbt90.interior.commander*",
    reason: "转盘待发弹与车长席的装配包络（弹筒顶与座椅/显控台）",
    maxDepthMm: 80,
    allowDisplaced: true,
    allowSuspect: true,
  },
  {
    family: "interior-autoloader-basket",
    a: "mbt90.interior.autoloader_*",
    b: "mbt90.interior.basket_*",
    reason: "装弹机泵站/控制盒/推弹杆与吊篮地板/护栏的安装包络",
    maxDepthMm: 70,
    allowDisplaced: true,
    allowSuspect: true,
  },
  {
    family: "interior-autoloader-carousel",
    a: "mbt90.interior.autoloader_*",
    b: "mbt90.interior.carousel_*",
    reason: "提弹臂/推弹杆/托弹槽与转盘弹筒的取弹包络",
    maxDepthMm: 100,
    allowDisplaced: true,
    allowSuspect: true,
  },
  {
    family: "interior-rammer-cassette",
    a: "mbt90.interior.autoloader_rammer",
    b: "mbt90.interior.carousel_cassette*",
    reason: "推弹杆在待发弹筒上方通过（取弹/推弹行程包络）",
    maxDepthMm: 40,
    allowDisplaced: true,
    allowSuspect: true,
  },
  {
    family: "interior-carousel-crew",
    a: "mbt90.interior.carousel*",
    b: "mbt90.interior.gunner*",
    reason: "转盘待发弹与炮长席在吊篮中心的装配包络（弹筒顶与瞄准镜座）",
    maxDepthMm: 60,
    allowDisplaced: true,
    allowSuspect: true,
  },
  {
    family: "interior-carousel-crew-any",
    a: "mbt90.interior.carousel_*",
    b: "mbt90.interior.gunner*",
    reason: "转盘弹筒/转盘环与炮长席的吊篮内装配包络",
    maxDepthMm: 55,
    allowDisplaced: true,
    allowSuspect: true,
  },
  {
    family: "interior-carousel-commander-any",
    a: "mbt90.interior.carousel_*",
    b: "mbt90.interior.commander*",
    reason: "转盘弹筒/转盘环与车长席的吊篮内装配包络",
    maxDepthMm: 55,
    allowDisplaced: true,
    allowSuspect: true,
  },
  {
    family: "interior-basket-carousel",
    a: "mbt90.interior.basket_*",
    b: "mbt90.interior.carousel_*",
    reason: "吊篮地板环/立柱与转盘环同轴装配（转盘在吊篮中央开口下方）",
    maxDepthMm: 30,
    allowDisplaced: true,
    allowSuspect: true,
  },
  {
    family: "running-skirt-bracket",
    a: "mbt90.running.skirt_bracket*",
    b: "mbt90.running.skirt*",
    reason: "侧裙支座压在侧裙板内表面（螺栓/挂座）",
    maxDepthMm: 40,
    allowDisplaced: true,
  },
  {
    family: "running-sprocket-wheel",
    a: "mbt90.running.sprocket*",
    b: "mbt90.running.wheel*",
    reason: "主动轮与后负重轮相邻（履带包络）",
    maxDepthMm: 30,
    allowDisplaced: true,
  },
  {
    family: "interior-blowout-rack",
    a: "mbt90.interior.blowout_*",
    b: "mbt90.interior.bustle_*",
    reason: "泄压板盖在尾舱弹药架框架上（铰链/锁扣/密封条贴合）",
    maxDepthMm: 10,
    allowDisplaced: true,
    allowSuspect: true,
  },
  {
    family: "interior-blowout-hatch",
    a: "mbt90.interior.blowout_*",
    b: "mbt90.interior.loader_hatch_inner",
    reason: "左泄压板与装填手舱口内盖相邻（炮塔顶板开口边缘）",
    maxDepthMm: 10,
    allowDisplaced: true,
    allowSuspect: true,
  },
  {
    family: "hull-bustle-joint",
    a: "mbt90.hull.bustle_shell",
    b: "mbt90.hull.turret_rear",
    reason: "尾舱装甲盒与炮塔尾板焊接成一体（尾舱向炮塔内开口）",
    maxDepthMm: 220,
    allowDisplaced: true,
    allowSuspect: true,
  },
  {
    family: "hull-bustle-rack",
    a: "mbt90.hull.bustle_rack",
    b: "mbt90.hull.bustle_shell",
    reason: "尾篮挂在尾舱装甲盒后壁上",
    maxDepthMm: 120,
    allowDisplaced: true,
    allowSuspect: true,
  },
  {
    family: "hull-bustle-vent",
    a: "mbt90.hull.bustle_shell",
    b: "mbt90.interior.blowout_vent",
    reason: "泄压板通风格栅嵌在尾舱顶板开口里",
    maxDepthMm: 40,
    allowDisplaced: true,
    allowSuspect: true,
  },
];

export function makeMbtRegistry(): ModelRegistry {
  const merged = mergeRegistries(
    [
      makeEngineRegistry(),
      makeTransmissionRegistry(),
      makeRunningRegistry(),
      makeInteriorRegistry(),
      makeHullRegistry(),
    ],
    "MBT-90 主战坦克",
    "V12 双涡轮柴油机 / 液气悬挂 / 转盘自动装弹机 / 复合装甲 + ERA / 120mm 滑膛炮 · 自内向外零件级",
  );
  return { ...merged, expectedContacts: [...(merged.expectedContacts ?? []), ...CROSS_LAYER] };
}

export function makeMbtLayouts(): Record<string, InstanceLayout> {
  return {
    ...ENGINE_LAYOUTS,
    ...TRANSMISSION_LAYOUTS,
    ...RUNNING_LAYOUTS,
    ...INTERIOR_LAYOUTS,
    ...HULL_LAYOUTS,
  };
}

export const mbtBuilders: Record<string, GeometryBuilder> = {
  ...mbtEngineKitBuilders,
  ...mbtRunningKitBuilders,
  ...mbtHullKitBuilders,
};
