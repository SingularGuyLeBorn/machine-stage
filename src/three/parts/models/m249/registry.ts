import * as THREE from "three";
import type { InstanceLayout } from "../../assembler/assembler";
import type { GeometryBuilder } from "../../assembler/geometry";
import type { ModelRegistry } from "../../registry/types";
import { GUN_MATERIALS } from "../guns/materials";
import { gunKitBuilders } from "../guns/kits";
import { gunHardwareBuilders } from "../guns/hardware";
import { m249KitBuilders } from "./kits";
import { M249_CONSTANTS } from "./constants";
import { beltRoundMatrix, beltLinkMatrix, M855_OFFSET, BELT_LINKS } from "./belt";
import { brassPose } from "./motion";

const C = M249_CONSTANTS;
const SY = M249_CONSTANTS.STAGE_Y;

// ============================================================================
// models/m249/registry —— M249 轻机枪（导气式 + 弹链供弹）
// 机构：火药燃气经导气孔推活塞（操作杆）→ 枪机框后坐 → 回转闭锁枪机开锁 →
// 抽壳（向下抛壳）→ 复进 → 拨弹齿/供弹滑板把弹链步进一节 → 推弹入膛。
// ============================================================================

export const M249_NODES: ModelRegistry["nodes"] = [
  { name: "AkStage", parent: "root", pivot: [0, "STAGE_Y", 0], note: "展示台基准" },
  { name: "AkRecoil", parent: "AkStage", motion: "translate", note: "后坐层：整枪后坐" },
  { name: "AkCarrier", parent: "AkRecoil", motion: "translate", axis: "z", note: "枪机框（携枪机/活塞后坐复进）" },
  { name: "AkBolt", parent: "AkCarrier", motion: "rotate", axis: "z", note: "枪机回转闭锁（±30°）" },
  { name: "AkFiringPin", parent: "AkBolt", motion: "translate", axis: "z", note: "击针前冲" },
  { name: "AkPiston", parent: "AkCarrier", note: "活塞 = 操作杆（与枪机框一体后坐）" },
  { name: "AkFeedPawl", parent: "AkCarrier", motion: "translate", axis: "z", note: "拨弹齿（随枪机步进，一个节距）" },
  { name: "AkFeedSlider", parent: "AkCarrier", motion: "translate", axis: "z", note: "供弹滑板（随枪机往复）" },
  { name: "AkHammer", parent: "AkRecoil", pivot: [0, "HAMMER_Y", "HAMMER_PIVOT_Z"], motion: "rotate", axis: "x", note: "击锤（待击→打击）" },
  { name: "AkTrigger", parent: "AkRecoil", pivot: [0, "TRIGGER_Y", "TRIGGER_PIVOT_Z"], motion: "rotate", axis: "x", note: "扳机" },
  { name: "AkSelector", parent: "AkRecoil", pivot: [0, "SELECTOR_PIVOT_Y", "SELECTOR_PIVOT_Z"], motion: "rotate", axis: "x", note: "保险/单发/连发" },
];

export const M249_ASSEMBLIES: ModelRegistry["assemblies"] = [
  { id: "barrel", name_cn: "枪管组", name_en: "Barrel group", explode: [0, 0.1, 1.0] },
  { id: "gas", name_cn: "导气系统", name_en: "Gas system", explode: [0, 1.1, 0.2] },
  { id: "action", name_cn: "枪机组", name_en: "Bolt carrier group", explode: [0, 1.2, -0.5] },
  { id: "fire", name_cn: "发射机组", name_en: "Fire control group", explode: [0, -1.1, -0.4] },
  { id: "feed", name_cn: "供弹机构", name_en: "Feed mechanism", explode: [0, 1.4, 0.1] },
  { id: "belt", name_cn: "弹链", name_en: "Ammunition belt", explode: [0, -0.6, 0.9] },
  { id: "furniture", name_cn: "外部件", name_en: "Furniture", explode: [0, -1.0, 0.6] },
  { id: "fx", name_cn: "特效", name_en: "Effects", explode: [0, 1.5, 1.2] },
];

export const M249_BUILDERS: Record<string, GeometryBuilder> = {
  ...gunKitBuilders,
  ...gunHardwareBuilders,
  ...m249KitBuilders,
};

export const M249_PARTS: ModelRegistry["parts"] = [
  // ===================== L1 枪管组 =====================
  {
    id: "m249.barrel.barrel",
    name_cn: "枪管（5.56×45，快拆）",
    name_en: "Barrel, quick-change",
    assembly: "barrel",
    build_layer: 1,
    build_order: 101,
    geometry: {
      type: "kit",
      kit: "rifledBarrel",
      params: {
        profile: [
          [0.0081, 0],
          [0.0081, 0.4],
          [0.0078, 0.45],
          [0.0076, 0.465],
        ],
        boreR: 0.00286,
        landR: 0.003,
        lands: 6,
        twistTurns: 7,
        chamberR: 0.0051,
        chamberLen: 0.046,
        segments: 22,
        ridgeSegments: 26,
      },
    },
    material: "steel_phosphate",
    node: "AkRecoil",
    mate: { type: "absolute" },
    source: "枪管：冷锻 6 条右旋膛线（缠距 178mm），尾部弹膛容纳 5.56×45 弹壳；快拆设计——捏提把旋转 1/4 圈即可更换过热枪管。",
  },
  {
    id: "m249.barrel.extension",
    name_cn: "枪管延伸部",
    name_en: "Barrel extension",
    assembly: "barrel",
    build_layer: 1,
    build_order: 102,
    geometry: {
      type: "lathe",
      profile: [
        [0.0001, -0.032],
        [0.011, -0.032],
        [0.011, 0.018],
        [0.0104, 0.021],
        [0.0051, 0.021],
        [0.0051, 0],
        [0.0001, 0],
      ],
      segments: 20,
    },
    material: "steel_phosphate",
    node: "AkRecoil",
    mate: { type: "absolute" },
    source: "延伸部：枪管尾部的加厚节套，内藏闭锁凸笋槽（枪机头双凸笋在此回转闭锁）。",
  },
  {
    id: "m249.barrel.carry_handle",
    name_cn: "枪管提把（含准星座）",
    name_en: "Carrying handle with front sight",
    assembly: "barrel",
    build_layer: 1,
    build_order: 103,
    geometry: { type: "kit", kit: "sawCarryHandle", params: { r: 0.0105, len: 0.05 } },
    material: "steel_machined",
    node: "AkRecoil",
    mate: { type: "absolute", position: [0, 0.0081, 0.235] },
    source: "提把：快换枪管的抓手（换枪管时免烫手）；前端座上是准星柱。",
  },
  {
    id: "m249.barrel.gas_regulator",
    name_cn: "导气箍（两档调节器）",
    name_en: "Gas regulator",
    assembly: "barrel",
    build_layer: 1,
    build_order: 104,
    geometry: { type: "kit", kit: "sawGasRegulator", params: { r: 0.0095, len: 0.042 } },
    material: "steel_phosphate",
    node: "AkRecoil",
    mate: { type: "absolute", position: [0, 0, 0.19] },
    source: "导气箍：⌀3.8 导气孔 + 两档导气调节器（正常/大量——调节燃气量保证污垢下可靠循环）。",
  },
  {
    id: "m249.barrel.gas_tube",
    name_cn: "导气管",
    name_en: "Gas tube",
    assembly: "barrel",
    build_layer: 1,
    build_order: 105,
    geometry: { type: "tube", rOuter: 0.0042, rInner: 0.0032, h: 0.2, segments: 14 },
    material: "steel_phosphate",
    node: "AkRecoil",
    mate: { type: "absolute", position: [0, 0.014, 0.09], rotation: [90, 0, 0] },
    source: "导气管：罩住活塞杆，从导气箍通到机匣前部。",
  },
  {
    id: "m249.barrel.flash_hider",
    name_cn: "鸟笼形枪口装置",
    name_en: "Birdcage flash hider",
    assembly: "barrel",
    build_layer: 1,
    build_order: 106,
    geometry: { type: "kit", kit: "flashHider", params: { r: 0.0115, len: 0.033, boreR: 0.0083, style: "birdcage" } },
    material: "steel_phosphate",
    node: "AkRecoil",
    mate: { type: "absolute", position: [0, 0, 0.462], rotation: [180, 0, 0] },
    source: "鸟笼消焰器：5 槽开孔，压制枪口焰。",
  },
  // ===================== L1 导气/枪机组 =====================
  {
    id: "m249.gas.piston",
    name_cn: "导气活塞（操作杆）",
    name_en: "Gas piston (operating rod)",
    assembly: "gas",
    build_layer: 1,
    build_order: 120,
    geometry: {
      type: "merge",
      parts: [
        { type: "cylinder", r: 0.004, h: 0.23, segments: 12, at: [0, 0, 0.115] },
        { type: "cylinder", r: 0.0044, h: 0.03, segments: 12, at: [0, 0, 0.245] },
      ],
    },
    material: "steel_machined",
    node: "AkPiston",
    mate: { type: "absolute", position: [0, 0.014, -0.07] },
    source: "活塞：头 ⌀8.8 × 30 在导气缸内受燃气推力；杆（操作杆）后拉枪机框——导气式核心传动链。",
  },
  {
    id: "m249.action.carrier",
    name_cn: "枪机框",
    name_en: "Bolt carrier",
    assembly: "action",
    build_layer: 1,
    build_order: 130,
    geometry: {
      type: "merge",
      parts: [
        { type: "box", w: 0.016, h: 0.014, d: 0.16, bevel: 0.001, at: [0, 0, 0] },
        // 顶部活塞杆结合座
        { type: "box", w: 0.012, h: 0.006, d: 0.02, bevel: 0.0008, at: [0, 0.009, 0.06] },
        // 复进簧腔（尾部）
        { type: "tube", rOuter: 0.0085, rInner: 0.0068, h: 0.03, segments: 12, at: [0, 0, -0.075] },
        // 拉机柄（右侧）
        { type: "box", w: 0.006, h: 0.008, d: 0.02, bevel: 0.001, at: [0.011, 0.002, 0.04] },
      ],
    },
    material: "steel_machined",
    node: "AkCarrier",
    mate: { type: "absolute", position: [0, 0, -0.09] },
    source: "枪机框：携枪机后坐/复进；顶部接受活塞杆冲击；尾腔内容复进簧。",
  },
  {
    id: "m249.action.bolt",
    name_cn: "枪机头（回转闭锁）",
    name_en: "Bolt, rotating",
    assembly: "action",
    build_layer: 1,
    build_order: 131,
    geometry: {
      type: "merge",
      parts: [
        {
          type: "lathe",
          profile: [
            [0.0001, 0],
            [0.0072, 0],
            [0.0072, -0.05],
            [0.0058, -0.055],
            [0.0022, -0.055],
            [0.0022, 0],
          ],
          segments: 16,
        },
        // 双闭锁凸笋（回转 30° 锁入延伸部）
        { type: "box", w: 0.004, h: 0.007, d: 0.009, bevel: 0.0006, at: [-0.009, 0, -0.014] },
        { type: "box", w: 0.004, h: 0.007, d: 0.009, bevel: 0.0006, at: [0.009, 0, -0.014] },
      ],
    },
    material: "steel_machined",
    node: "AkBolt",
    mate: { type: "absolute", position: [0, 0, 0.046] },
    source: "枪机头：双凸笋在延伸部闭锁窗内回转 30°；弹底窝抱住弹壳底缘。",
  },
  {
    id: "m249.action.firing_pin",
    name_cn: "击针",
    name_en: "Firing pin",
    assembly: "action",
    build_layer: 1,
    build_order: 132,
    geometry: {
      type: "lathe",
      profile: [
        [0.0001, 0],
        [0.0022, 0],
        [0.0022, 0.052],
        [0.0038, 0.056],
        [0.0038, 0.06],
        [0.0001, 0.06],
      ],
      segments: 10,
    },
    material: "steel_core",
    node: "AkFiringPin",
    mate: { type: "absolute", position: [0, 0, -0.008], rotation: [90, 0, 0] },
    source: "击针：尾端伸到枪机框内容受击锤打击，前端击发底火。",
  },
  {
    id: "m249.action.extractor",
    name_cn: "抽壳钩",
    name_en: "Extractor",
    assembly: "action",
    build_layer: 1,
    build_order: 133,
    geometry: { type: "box", w: 0.0035, h: 0.009, d: 0.012, bevel: 0.0005 },
    material: "steel_core",
    node: "AkBolt",
    mate: { type: "absolute", position: [0.0085, 0, 0.052] },
    source: "抽壳钩：抱住弹壳底缘，随枪机后退把弹壳拉出弹膛（向下抛壳）。",
  },
  {
    id: "m249.action.ejector",
    name_cn: "抛壳挺（下抛式）",
    name_en: "Ejector, downward",
    assembly: "action",
    build_layer: 1,
    build_order: 134,
    geometry: { type: "box", w: 0.004, h: 0.006, d: 0.01, bevel: 0.0005 },
    material: "steel_core",
    node: "AkRecoil",
    mate: { type: "absolute", position: [0.0075, -0.011, -0.012] },
    source: "抛壳挺：固定在机匣底板上——M249 弹壳向下抛出（方便车内射击时弹壳不砸人）。",
  },
  {
    id: "m249.action.recoil_spring",
    name_cn: "复进簧",
    name_en: "Recoil spring",
    assembly: "action",
    build_layer: 1,
    build_order: 135,
    instances: 8,
    indexed: true,
    instance_layout: "m249RecoilSpringCoil",
    geometry: { type: "kit", kit: "coilSpring", params: { r: 0.0062, wireR: 0.0009, len: 0.0099, coils: 1 } },
    material: "steel_spring",
    node: "AkRecoil",
    mate: { type: "absolute" },
    source: "复进簧：8 圈，从机匣尾支座推到枪机框簧肩，把枪机组推回前方。",
  },
  {
    id: "m249.action.spring_guide",
    name_cn: "复进簧导杆",
    name_en: "Spring guide rod",
    assembly: "action",
    build_layer: 1,
    build_order: 136,
    geometry: {
      type: "lathe",
      profile: [
        [0.0001, 0],
        [0.0065, 0],
        [0.0065, 0.008],
        [0.0052, 0.009],
        [0.0052, 0.105],
        [0.0001, 0.105],
      ],
      segments: 12,
    },
    material: "steel_machined",
    node: "AkRecoil",
    mate: { type: "absolute", position: [0, 0, -0.215], rotation: [90, 0, 0] },
    source: "导杆：从机匣尾支座穿过复进簧，引导压缩方向。",
  },
  // ===================== L1 发射机组 =====================
  {
    id: "m249.fire.hammer",
    name_cn: "击锤",
    name_en: "Hammer",
    assembly: "fire",
    build_layer: 1,
    build_order: 141,
    geometry: {
      type: "merge",
      parts: [
        { type: "box", w: 0.008, h: 0.004, d: 0.03, bevel: 0.0006, at: [0, -0.002, -0.008] },
        { type: "box", w: 0.008, h: 0.01, d: 0.006, bevel: 0.0006, at: [0, 0.004, -0.005] },
        { type: "box", w: 0.006, h: 0.008, d: 0.008, bevel: 0.0006, at: [0, -0.011, 0.011] },
      ],
    },
    material: "steel_machined",
    node: "AkHammer",
    mate: { type: "absolute" },
    source: "击锤：待击 65° ↔ 打击 0°，弹簧释放时前端击打击针尾盘。",
  },
  {
    id: "m249.fire.hammer_spring",
    name_cn: "击锤簧",
    name_en: "Hammer spring",
    assembly: "fire",
    build_layer: 2,
    build_order: 142,
    instances: 4,
    indexed: true,
    instance_layout: "m249HammerSpringCoil",
    geometry: { type: "kit", kit: "coilSpring", params: { r: 0.003, wireR: 0.0003, len: 0.005, coils: 1 } },
    material: "steel_spring",
    node: "AkHammer",
    mate: { type: "absolute", position: [0, -0.02, 0.014] },
    source: "击锤簧：推动尾齿使击锤回转待发。",
  },
  {
    id: "m249.fire.trigger",
    name_cn: "扳机",
    name_en: "Trigger",
    assembly: "fire",
    build_layer: 1,
    build_order: 143,
    geometry: {
      type: "merge",
      parts: [
        { type: "box", w: 0.036, h: 0.008, d: 0.008, bevel: 0.0008 },
        { type: "box", w: 0.007, h: 0.008, d: 0.04, bevel: 0.0008, at: [0, -0.026, -0.016] },
        { type: "box", w: 0.007, h: 0.011, d: 0.014, bevel: 0.0009, at: [0, -0.019, 0.012] },
      ],
    },
    material: "steel_machined",
    node: "AkTrigger",
    mate: { type: "absolute" },
    source: "扳机：扣引 → 压下阻铁后端 → 释放击锤。",
  },
  {
    id: "m249.fire.sear",
    name_cn: "阻铁",
    name_en: "Sear",
    assembly: "fire",
    build_layer: 1,
    build_order: 144,
    geometry: {
      type: "merge",
      parts: [
        { type: "box", w: 0.005, h: 0.011, d: 0.011, bevel: 0.0006 },
        { type: "box", w: 0.004, h: 0.006, d: 0.018, bevel: 0.0005, at: [0, -0.007, 0.009] },
      ],
    },
    material: "steel_worn",
    node: "AkRecoil",
    mate: { type: "absolute", position: [0, -0.03, -0.044] },
    source: "阻铁：挂住击锤尾齿；扳机压下时后端下沉释放。",
  },
  {
    id: "m249.fire.selector",
    name_cn: "快慢机（保险/单发/连发）",
    name_en: "Selector switch",
    assembly: "fire",
    build_layer: 1,
    build_order: 145,
    geometry: {
      type: "merge",
      parts: [
        { type: "cylinder", r: 0.0045, h: 0.058, segments: 12 },
        { type: "box", w: 0.006, h: 0.012, d: 0.014, bevel: 0.0008, at: [0.05, 0, 0] },
      ],
    },
    material: "steel_blued",
    node: "AkSelector",
    mate: { type: "absolute" },
    source: "快慢机：三档——保险 / 单发（阻铁）+ 连发（连发阻铁）。",
  },
  {
    id: "m249.fire.grip",
    name_cn: "握把",
    name_en: "Pistol grip",
    assembly: "fire",
    build_layer: 4,
    build_order: 146,
    geometry: {
      type: "merge",
      parts: [
        { type: "box", w: 0.026, h: 0.062, d: 0.03, bevel: 0.004, at: [0, -0.043, -0.118] },
        { type: "box", w: 0.03, h: 0.012, d: 0.034, bevel: 0.002, at: [0, -0.075, -0.117] },
      ],
    },
    material: "polymer",
    node: "AkRecoil",
    mate: { type: "absolute" },
    source: "握把：聚合塑料，后倾 18° 便于握持。",
  },
  // ===================== L1 供弹机构（弹链步进） =====================
  {
    id: "m249.feed.tray",
    name_cn: "受弹托盘（含抱弹唇）",
    name_en: "Feed tray",
    assembly: "feed",
    build_layer: 1,
    build_order: 151,
    geometry: {
      type: "merge",
      parts: [
        { type: "box", w: 0.042, h: 0.003, d: 0.09, bevel: 0.0006, at: [0, 0.019, -0.015] },
        { type: "box", w: 0.0016, h: 0.008, d: 0.09, bevel: 0.0004, at: [-0.0202, 0.023, -0.015] },
        { type: "box", w: 0.0016, h: 0.008, d: 0.09, bevel: 0.0004, at: [0.0202, 0.023, -0.015] },
      ],
    },
    material: "steel_machined",
    node: "AkRecoil",
    mate: { type: "absolute" },
    source: "受弹托盘：机匣顶部长条通道，弹链在其上滑行；两侧抱弹唇定位弹列。",
  },
  {
    id: "m249.feed.tray_cover",
    name_cn: "受弹机盖",
    name_en: "Feed tray cover",
    assembly: "feed",
    build_layer: 2,
    build_order: 152,
    geometry: { type: "merge", parts: [{ type: "box", w: 0.044, h: 0.002, d: 0.085, bevel: 0.0005, at: [0, 0.0335, -0.015] }] },
    material: "steel_blued",
    node: "AkRecoil",
    mate: { type: "absolute" },
    source: "受弹机盖：盖住弹链通道（防尘/防抛），分解时翻开。",
  },
  {
    id: "m249.feed.pawl",
    name_cn: "拨弹齿",
    name_en: "Feed pawl",
    assembly: "feed",
    build_layer: 1,
    build_order: 153,
    geometry: {
      type: "merge",
      parts: [
        { type: "box", w: 0.012, h: 0.006, d: 0.014, bevel: 0.0006 },
        { type: "box", w: 0.014, h: 0.0035, d: 0.004, bevel: 0.0004, at: [0, 0.004, 0.0075] },
      ],
    },
    material: "steel_machined",
    node: "AkFeedPawl",
    mate: { type: "absolute", position: [0, 0.0265, -0.03] },
    source: "拨弹齿：随枪机往复，每次把弹链钩进一个节距（15mm）。",
  },
  {
    id: "m249.feed.slider",
    name_cn: "供弹滑板",
    name_en: "Feed slider",
    assembly: "feed",
    build_layer: 1,
    build_order: 154,
    geometry: { type: "merge", parts: [{ type: "box", w: 0.03, h: 0.004, d: 0.02, bevel: 0.0006, at: [0, 0.0145, -0.052] }] },
    material: "steel_machined",
    node: "AkFeedSlider",
    mate: { type: "absolute" },
    source: "供弹滑板：把链节从托盘入口推到抱弹位置。",
  },
  {
    id: "m249.feed.hold_down",
    name_cn: "压弹板",
    name_en: "Hold-down plate",
    assembly: "feed",
    build_layer: 2,
    build_order: 155,
    geometry: { type: "merge", parts: [{ type: "box", w: 0.026, h: 0.0022, d: 0.05, bevel: 0.0005, at: [0, 0.0285, -0.02] }] },
    material: "steel_spring",
    node: "AkRecoil",
    mate: { type: "absolute" },
    source: "压弹板：簧压住弹链，防跳动。",
  },
  // ===================== L1 弹链 + 弹 =====================
  {
    id: "m249.belt.link",
    name_cn: "M27 弹链节",
    name_en: "M27 belt link",
    assembly: "belt",
    build_layer: 2,
    build_order: 161,
    instances: BELT_LINKS,
    indexed: true,
    instance_layout: "m249BeltLink",
    geometry: { type: "kit", kit: "beltLink", params: { pitch: 0.015, w: 0.02, t: 0.0012, throatR: 0.0062 } },
    material: "steel_blued",
    node: "AkRecoil",
    mate: { type: "absolute" },
    source: "M27 可散弹链节：链节兜住弹壳，射击后从另一侧脱落（可散）。",
  },
  {
    id: "m249.belt.case",
    name_cn: "弹壳（黄铜，链上）",
    name_en: "Cartridge case on belt",
    assembly: "belt",
    build_layer: 2,
    build_order: 162,
    instances: BELT_LINKS,
    indexed: true,
    instance_layout: "m249BeltCase",
    geometry: {
      type: "kit",
      kit: "cartridgeCase",
      params: { rimR: 0.0048, neckR: 0.003, bodyR: 0.0048, baseR: 0.0048, len: 0.045, shoulder: 0.72 },
    },
    material: "brass",
    node: "AkRecoil",
    mate: { type: "absolute" },
    source: "链上弹壳：5.56×45 黄铜弹壳。",
  },
  {
    id: "m249.belt.bullet",
    name_cn: "弹头（被甲，链上）",
    name_en: "Bullet on belt",
    assembly: "belt",
    build_layer: 2,
    build_order: 163,
    instances: BELT_LINKS,
    indexed: true,
    instance_layout: "m249BeltBullet",
    geometry: { type: "kit", kit: "ammoBullet", params: { r: 0.0029, len: 0.0225 } },
    material: "copper",
    node: "AkRecoil",
    mate: { type: "absolute" },
    source: "链上弹头：SS109/M855 被甲弹。",
  },
  {
    id: "m249.belt.core_lead",
    name_cn: "铅套（链上）",
    name_en: "Lead core on belt",
    assembly: "belt",
    build_layer: 2,
    build_order: 164,
    instances: BELT_LINKS,
    indexed: true,
    instance_layout: "m249BeltLead",
    geometry: { type: "kit", kit: "ammoCore", params: { r: 0.002, len: 0.009 } },
    material: "lead",
    node: "AkRecoil",
    mate: { type: "absolute" },
    source: "铅套。",
  },
  {
    id: "m249.belt.core_steel",
    name_cn: "钢芯（链上）",
    name_en: "Steel core on belt",
    assembly: "belt",
    build_layer: 2,
    build_order: 165,
    instances: BELT_LINKS,
    indexed: true,
    instance_layout: "m249BeltSteel",
    geometry: { type: "kit", kit: "ammoCore", params: { r: 0.0013, len: 0.0065, pointed: true } },
    material: "steel_machined",
    node: "AkRecoil",
    mate: { type: "absolute" },
    source: "钢芯穿甲体。",
  },
  {
    id: "m249.belt.propellant",
    name_cn: "发射药（链上）",
    name_en: "Propellant on belt",
    assembly: "belt",
    build_layer: 2,
    build_order: 166,
    instances: BELT_LINKS,
    indexed: true,
    instance_layout: "m249BeltPowder",
    geometry: {
      type: "kit",
      kit: "cartridgeCase",
      params: { rimR: 0.0036, neckR: 0.0034, bodyR: 0.0036, baseR: 0.0036, len: 0.026, shoulder: 0.8 },
    },
    material: "propellant",
    node: "AkRecoil",
    mate: { type: "absolute" },
    source: "发射药： WC 844 双基球形药。",
  },
  {
    id: "m249.belt.ammo_box",
    name_cn: "200 发弹链箱",
    name_en: "200-round ammo box",
    assembly: "belt",
    build_layer: 4,
    build_order: 167,
    geometry: { type: "kit", kit: "sawAmmoBox", params: { w: 0.088, h: 0.058, d: 0.13 } },
    material: "polymer",
    node: "AkRecoil",
    mate: { type: "absolute", position: [-0.024, -0.052, -0.075] },
    source: "弹链箱：挂机匣左下，200 发 M27 链；链从箱前嘴进受弹托盘。",
  },
  // ===================== L4 外部件 =====================
  {
    id: "m249.furniture.handguard",
    name_cn: "护木",
    name_en: "Handguard",
    assembly: "furniture",
    build_layer: 4,
    build_order: 171,
    geometry: { type: "kit", kit: "handguardShell", params: { r: 0.024, len: 0.14, slotDeg: 120 } },
    material: "polymer",
    node: "AkRecoil",
    mate: { type: "absolute", position: [0, 0, C.HANDGUARD_Z] },
    source: "护木：聚合塑料壳，罩住枪管前段（快拆枪管时随提把取下）。",
  },
  {
    id: "m249.furniture.stock",
    name_cn: "管状枪托",
    name_en: "Tubular stock",
    assembly: "furniture",
    build_layer: 4,
    build_order: 172,
    geometry: { type: "kit", kit: "sawStock", params: { tubeR: 0.011, tubeLen: 0.17 } },
    material: "steel_blued",
    node: "AkRecoil",
    mate: { type: "absolute", position: [0, 0.012, C.STOCK_Z] },
    source: "枪托：钢管 + 塑料托底板（M249 早期型为固定托）。",
  },
  {
    id: "m249.furniture.bipod",
    name_cn: "两脚架",
    name_en: "Bipod",
    assembly: "furniture",
    build_layer: 4,
    build_order: 173,
    geometry: { type: "kit", kit: "sawBipod", params: { legLen: C.BIPOD_LEG_LEN, spread: 22 } },
    material: "steel_machined",
    node: "AkRecoil",
    mate: { type: "absolute", position: [0, -0.026, C.BIPOD_Z] },
    source: "两脚架：护木前下，轻机枪腰射/架设射击。",
  },
  // ===================== L5 附件与特效 =====================
  {
    id: "m249.acc.rear_sight",
    name_cn: "表尺",
    name_en: "Rear sight",
    assembly: "furniture",
    build_layer: 5,
    build_order: 181,
    geometry: {
      type: "merge",
      parts: [
        { type: "box", w: 0.016, h: 0.008, d: 0.02, bevel: 0.001, at: [0, 0.03, -0.045] },
        { type: "box", w: 0.006, h: 0.01, d: 0.008, bevel: 0.0008, at: [0, 0.038, -0.045] },
      ],
    },
    material: "steel_blued",
    node: "AkRecoil",
    mate: { type: "absolute" },
    source: "表尺：机匣顶后部，100–1000m 鼓形分划。",
  },
  {
    id: "m249.fx.muzzle_flash",
    name_cn: "枪口焰",
    name_en: "Muzzle flash",
    assembly: "fx",
    build_layer: 5,
    build_order: 191,
    geometry: { type: "kit", kit: "muzzleFlash", params: { r: 0.012, len: 0.04, petals: 5 } },
    material: "muzzle_flash",
    node: "AkRecoil",
    mate: { type: "absolute", position: [0, 0, 0.515] },
    tags: ["fx"],
    source: "枪口焰：点火瞬间的燃气光球（特效层）。",
  },
  {
    id: "m249.fx.tracer",
    name_cn: "曳光弹迹",
    name_en: "Tracer trace",
    assembly: "fx",
    build_layer: 5,
    build_order: 192,
    geometry: { type: "lathe", profile: [[0.0001, 0], [0.0032, 0], [0.0032, 1], [0.0001, 1]], segments: 6 },
    material: "tracer",
    node: "AkRecoil",
    mate: { type: "absolute", position: [0, 0, 0.535], rotation: [90, 0, 0] },
    tags: ["fx"],
    source: "曳光弹迹：弹头出膛后的红色光柱（特效层）。",
  },
  {
    id: "m249.fx.brass",
    name_cn: "弹壳池",
    name_en: "Brass pool",
    assembly: "fx",
    build_layer: 5,
    build_order: 193,
    instances: 12,
    indexed: true,
    instance_layout: "m249BrassRest",
    geometry: {
      type: "kit",
      kit: "cartridgeCase",
      params: { rimR: 0.0048, neckR: 0.003, bodyR: 0.0048, baseR: 0.0048, len: 0.045, shoulder: 0.72 },
    },
    material: "brass",
    node: "AkRecoil",
    mate: { type: "absolute" },
    tags: ["fx"],
    source: "弹壳池：向下抛出的弹壳落地堆积（12 槽循环 + 确定性伪随机）。",
  },
];

// ---------------------------------------------------------------------------
// 实例布局（root 空间：模型坐标 + STAGE_Y）
// ---------------------------------------------------------------------------

/** 复进簧圈：静止态等距铺在机匣尾支座（z -0.215）与枪机框簧肩（z -0.06）之间。 */
const recoilSpringCoil: InstanceLayout = ({ index, count }) => {
  const lo = -0.215;
  const hi = -0.06;
  const pitch = (hi - lo) / count;
  return new THREE.Matrix4().makeTranslation(0, SY, lo + (index + 0.5) * pitch);
};

/** 击锤簧圈：绕击锤铰点铺 4 圈。 */
const hammerSpringCoil: InstanceLayout = ({ index, count }) => {
  const lo = -0.03;
  const hi = -0.01;
  const pitch = (hi - lo) / count;
  return new THREE.Matrix4().makeTranslation(0, -0.026 + lo + (index + 0.5) * pitch, -0.13 + 0.014);
};

/** 弹链节静止布局：沿受弹托盘向后排。 */
const beltLinkLayout: InstanceLayout = ({ index }) => beltLinkMatrix(index);

/** 链上弹六分件：共用弧位姿态，沿弹轴的局部偏移不同。 */
function beltRoundLayout(key: keyof typeof M855_OFFSET): InstanceLayout {
  return ({ index }) => beltRoundMatrix(index, M855_OFFSET[key]);
}

/** 弹壳池静止布局（动画逐帧改写；这里给可检验的基准散布）。 */
const brassRest: InstanceLayout = ({ index }) => {
  const { position, quaternion } = brassPose(index);
  return new THREE.Matrix4().compose(position, quaternion, new THREE.Vector3(1, 1, 1));
};

export function makeM249Layouts(): Record<string, InstanceLayout> {
  return {
    m249RecoilSpringCoil: recoilSpringCoil,
    m249HammerSpringCoil: hammerSpringCoil,
    m249BeltLink: beltLinkLayout,
    m249BeltCase: beltRoundLayout("case"),
    m249BeltBullet: beltRoundLayout("bullet"),
    m249BeltLead: beltRoundLayout("lead"),
    m249BeltSteel: beltRoundLayout("steel"),
    m249BeltPowder: beltRoundLayout("propellant"),
    m249BrassRest: brassRest,
  };
}

export const M249_MATERIALS: ModelRegistry["materials"] = {
  ...GUN_MATERIALS,
  polymer: { base: "#2b2f33", metalness: 0.05, roughness: 0.62, preset: "steel_rough" },
};

export function makeM249Registry(): ModelRegistry {
  return {
    model: "m249",
    title: "M249 班用自动武器",
    subtitle: "FN Minimi / M249 SAW——导气式 + 弹链供弹",
    constants: { ...M249_CONSTANTS },
    nodes: M249_NODES,
    assemblies: M249_ASSEMBLIES,
    materials: M249_MATERIALS,
    parts: M249_PARTS,
    expectedContacts: [
      { family: "bullet-core", a: "m249.belt.bullet", b: "m249.belt.core_lead", reason: "铅套压装在弹头被甲内", maxDepthMm: 5 },
      { family: "bullet-core", a: "m249.belt.bullet", b: "m249.belt.core_steel", reason: "钢芯压装在弹头被甲底部", maxDepthMm: 5 },
      { family: "case-loading", a: "m249.belt.case", b: "m249.belt.propellant", reason: "发射药装满弹壳", maxDepthMm: 5 },
      { family: "case-loading", a: "m249.belt.case", b: "m249.belt.bullet", reason: "弹头底缘坐于发射药面上（卡收）", maxDepthMm: 5 },
      { family: "belt-cradle", a: "m249.belt.link", b: "m249.belt.case", reason: "M27 链节兜住弹壳（链弹一体的必然嵌套）", maxDepthMm: 4 },
      { family: "press-fit", a: "m249.barrel.barrel", b: "m249.barrel.gas_regulator", reason: "导气箍销接在枪管上", maxDepthMm: 10 },
      { family: "press-fit", a: "m249.barrel.barrel", b: "m249.barrel.carry_handle", reason: "提把座销接在枪管上", maxDepthMm: 10 },
      { family: "press-fit", a: "m249.barrel.barrel", b: "m249.barrel.flash_hider", reason: "枪口装置套接枪管口部", maxDepthMm: 10 },
      { family: "firing-pin-slide", a: "m249.action.bolt", b: "m249.action.firing_pin", reason: "击针在枪机通孔内滑动", maxDepthMm: 2 },
      { family: "extractor-fit", a: "m249.action.bolt", b: "m249.action.extractor", reason: "抽壳钩抱装在枪机头", maxDepthMm: 2 },
      { family: "muzzle-fx", a: "m249.fx.muzzle_flash", b: "m249.fx.tracer", reason: "枪口焰与曳光同源叠加", maxDepthMm: 60 },
      { family: "muzzle-fx", a: "m249.barrel.flash_hider", b: "m249.fx.tracer", reason: "曳光弹迹自枪口装置穿出", maxDepthMm: 60 },
    ],
  };
}
