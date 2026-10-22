import * as THREE from "three";
import type { InstanceLayout } from "../../../assembler/assembler";
import type { ExpectedContactRule, GeometrySpec, ModelRegistry, PartDefinition } from "../../../registry/types";
import { MBT } from "../constants";
import { MBT_MATERIALS } from "../materials";

// ============================================================================
// models/mbt/interior/registry —— L3 内饰 / 战斗室 / 自动装弹机 / 弹药
//
// 三人乘员组（车长、炮长、驾驶员）+ 炮塔吊篮 + 苏式转盘自动装弹机（22 发待发弹）
// + 尾舱弹药架（18 发）+ 泄压板。弹药 40 发，APFSDS/HEAT/HE/HESH 四类，
// 弹芯、弹托、药型罩、弹丸、药筒、发射药、底火逐件建模。
// 炮塔内零件用 TL() 换算到 Turret 节点局部系（pivot z=0.1）。
// ============================================================================

const P = "mbt90.interior.";
const A = (position: [number, number, number], rotation?: [number, number, number]) =>
  rotation ? { type: "absolute" as const, position, rotation } : { type: "absolute" as const, position };
const B = (w: number, h: number, d: number, at: [number, number, number] = [0, 0, 0], bevel = 0.004): GeometrySpec & { at: [number, number, number] } => ({ type: "box", w, h, d, bevel, at });
const C = (r: number, h: number, at: [number, number, number] = [0, 0, 0], segments = 16, rTop = r): GeometrySpec & { at: [number, number, number] } => ({ type: "cylinder", r, h, rTop, segments, bevel: 0.0015, at });
const T = (ro: number, ri: number, h: number, at: [number, number, number] = [0, 0, 0], seg = 22): GeometrySpec & { at: [number, number, number] } => ({ type: "tube", rOuter: ro, rInner: ri, h, segments: seg, at });
const MERGE = (...items: Array<GeometrySpec & { at?: [number, number, number] }>): GeometrySpec => ({ type: "merge", parts: items });

/** 炮塔本地坐标（Turret 节点 pivot z=0.1）。 */
const TL = (x: number, y: number, z: number): [number, number, number] => [x, y, z - MBT.TURRET_Z];

export const CAROUSEL_NODE = "MBT_Carousel";
export const LOAD_ARM_NODE = "MBT_LoadArm";
export const RAMMER_NODE = "MBT_Rammer";
export const LOAD_ROUND_NODE = "MBT_LoadRound";
export const EJECTED_CASE_NODE = "MBT_EjectedCase";
export const BLOWOUT_L = "MBT_Blowout_L";
export const BLOWOUT_R = "MBT_Blowout_R";
export const CITV_NODE = "MBT_CITV";

function carouselLayout(offset: number): InstanceLayout {
  return ({ index }) => {
    const a = ((offset + index) / 22) * Math.PI * 2;
    return new THREE.Matrix4().makeTranslation(Math.cos(a) * 0.7, 0, Math.sin(a) * 0.7);
  };
}
function rackLayout(offset: number): InstanceLayout {
  return ({ index }) => {
    const slot = offset + index;
    const col = slot % 3;
    const row = Math.floor(slot / 3) % 3;
    const depth = Math.floor(slot / 9) % 2;
    return new THREE.Matrix4()
      .makeRotationZ(Math.PI / 2)
      .setPosition(-0.85 + col * 0.85, 1.87 + row * 0.2, -1.82 - depth * 0.34);
  };
}

export const INTERIOR_LAYOUTS: Record<string, InstanceLayout> = {
  "mbt.interior.carousel0": carouselLayout(0),
  "mbt.interior.carousel12": carouselLayout(12),
  "mbt.interior.carousel18": carouselLayout(18),
  "mbt.interior.rack0": rackLayout(0),
  "mbt.interior.rack4": rackLayout(4),
  "mbt.interior.rack10": rackLayout(10),
  "mbt.interior.rack14": rackLayout(14),
  "mbt.interior.cassette": carouselLayout(0),
  "mbt.interior.rackTube": rackLayout(0),
};

function buildNodes() {
  return [
    { name: CAROUSEL_NODE, parent: "root", pivot: [0, 0.8, 0.15] as [number, number, number], motion: "rotate" as const, axis: "y" as const, note: "自动装弹机转盘" },
    { name: LOAD_ARM_NODE, parent: "Turret", pivot: [0, 1.0, 0.35] as [number, number, number], motion: "rotate" as const, axis: "x" as const, note: "提弹机/装填臂（随炮塔回转）" },
    { name: RAMMER_NODE, parent: "Turret", pivot: [0, MBT.GUN_Y, 0.38] as [number, number, number], motion: "translate" as const, axis: "z" as const, note: "推弹杆（随炮塔回转）" },
    { name: LOAD_ROUND_NODE, parent: "Turret", pivot: [0, 1.0, 0.35] as [number, number, number], motion: "translate" as const, axis: "z" as const, note: "装填演示弹（fx，随炮塔回转）" },
    { name: EJECTED_CASE_NODE, parent: "Turret", pivot: [0, MBT.GUN_Y, 0.6] as [number, number, number], motion: "translate" as const, axis: "z" as const, note: "抛壳（fx，随炮塔回转）" },
    { name: BLOWOUT_L, parent: "Turret", pivot: TL(-1.02, 2.47, -1.62), motion: "rotate" as const, axis: "z" as const, note: "左泄压板铰链" },
    { name: BLOWOUT_R, parent: "Turret", pivot: TL(1.02, 2.47, -1.62), motion: "rotate" as const, axis: "z" as const, note: "右泄压板铰链" },
    { name: CITV_NODE, parent: "Turret", pivot: TL(1.25, 2.74, -0.25), motion: "rotate" as const, axis: "y" as const, note: "车长独立热像仪（猎-歼）" },
  ];
}

function buildParts(): PartDefinition[] {
  const parts: PartDefinition[] = [];
  const add = (p: PartDefinition) => parts.push(p);

  // ================= 驾驶舱 =================
  add({
    id: `${P}driver_seat_pan`,
    name_cn: "驾驶员座垫",
    name_en: "driver seat pan",
    assembly: "driver",
    build_layer: 3,
    build_order: 700,
    geometry: MERGE(B(0.46, 0.08, 0.44, [0, 0, 0], 0.02), B(0.44, 0.05, 0.4, [0, -0.06, 0], 0.01)),
    material: "mbt_seat",
    mate: A([-0.55, 0.93, 2.25]),
  });
  add({
    id: `${P}driver_seat_back`,
    name_cn: "驾驶员靠背",
    name_en: "driver seat backrest",
    assembly: "driver",
    build_layer: 3,
    build_order: 701,
    geometry: MERGE(B(0.44, 0.5, 0.09, [0, 0, 0], 0.02), B(0.34, 0.18, 0.06, [0, 0.2, -0.04], 0.012)),
    material: "mbt_seat",
    mate: A([-0.55, 1.18, 2.05], [-8, 0, 0]),
  });
  add({
    id: `${P}driver_headrest`,
    name_cn: "驾驶员头枕",
    name_en: "driver headrest",
    assembly: "driver",
    build_layer: 3,
    build_order: 702,
    geometry: MERGE(B(0.26, 0.16, 0.08, [0, 0, 0], 0.02)),
    material: "mbt_seat",
    mate: A([-0.55, 1.47, 2.0], [-8, 0, 0]),
  });
  add({
    id: `${P}driver_seat_frame`,
    name_cn: "驾驶员座椅骨架",
    name_en: "driver seat frame",
    assembly: "driver",
    build_layer: 3,
    build_order: 703,
    geometry: MERGE(B(0.4, 0.06, 0.36, [0, 0, 0], 0.006), B(0.05, 0.3, 0.05, [-0.17, -0.2, -0.12], 0.004), B(0.05, 0.3, 0.05, [0.17, -0.2, -0.12], 0.004)),
    material: "mbt_steel_dark",
    mate: A([-0.55, 0.82, 2.25]),
  });
  add({
    id: `${P}driver_wheel`,
    name_cn: "驾驶员方向盘",
    name_en: "driver steering wheel",
    assembly: "driver",
    build_layer: 3,
    build_order: 704,
    geometry: MERGE(T(0.2, 0.175, 0.03, [0, 0, 0], 28), C(0.04, 0.06, [0, 0, 0], 14), B(0.36, 0.03, 0.03, [0, 0, 0], 0.004), B(0.03, 0.36, 0.03, [0, 0, 0], 0.004)),
    material: "mbt_steel_dark",
    mate: A([-0.55, 1.12, 1.9], [-18, 0, 0]),
  });
  add({
    id: `${P}driver_column`,
    name_cn: "转向柱",
    name_en: "steering column",
    assembly: "driver",
    build_layer: 3,
    build_order: 705,
    geometry: MERGE(C(0.03, 0.3, [0, 0, 0], 14), C(0.05, 0.08, [0, 0.15, 0], 14)),
    material: "mbt_steel",
    mate: A([-0.55, 1.08, 1.75], [72, 0, 0]),
  });
  for (let s = 0; s < 2; s++) {
    add({
      id: `${P}driver_tiller_${s + 1}`,
      name_cn: `操纵杆 ${s + 1}`,
      name_en: `steering tiller ${s + 1}`,
      assembly: "driver",
      build_layer: 3,
      build_order: 706,
      geometry: MERGE(C(0.018, 0.28, [0, 0, 0], 12), C(0.035, 0.06, [0, 0.14, 0], 12), B(0.05, 0.08, 0.03, [0, 0.14, 0], 0.004)),
      material: "mbt_steel_dark",
      mate: A([-0.55 + (s === 0 ? -0.28 : 0.28), 1.05, 1.95], [18, 0, s === 0 ? 6 : -6]),
    });
  }
  for (let p = 0; p < 3; p++) {
    const x = -0.72 + p * 0.17;
    add({
      id: `${P}driver_pedal_${p + 1}`,
      name_cn: `踏板 ${p + 1}`,
      name_en: `pedal ${p + 1}`,
      assembly: "driver",
      build_layer: 3,
      build_order: 707,
      geometry: MERGE(B(0.1, 0.02, 0.16, [0, 0, 0], 0.004), B(0.07, 0.18, 0.02, [0, -0.09, -0.05], 0.003), C(0.02, 0.03, [0, -0.17, -0.05], 10)),
      material: "mbt_steel_dark",
      mate: A([x, 0.64, 2.02], [-24, 0, 0]),
    });
  }
  add({
    id: `${P}driver_dashboard`,
    name_cn: "驾驶员仪表板",
    name_en: "driver dashboard",
    assembly: "driver",
    build_layer: 3,
    build_order: 708,
    geometry: MERGE(B(0.52, 0.24, 0.08, [0, 0, 0], 0.008), B(0.48, 0.18, 0.03, [0, 0.01, 0.06], 0.004)),
    material: "mbt_paint_dark",
    mate: A([-0.55, 1.3, 2.0], [12, 0, 0]),
  });
  for (let g = 0; g < 6; g++) {
    add({
      id: `${P}driver_gauge_${g + 1}`,
      name_cn: `仪表 ${g + 1}`,
      name_en: `driver gauge ${g + 1}`,
      assembly: "driver",
      build_layer: 3,
      build_order: 709,
      geometry: MERGE(C(0.04, 0.018, [0, 0, 0], 20), C(0.034, 0.01, [0, 0.013, 0], 18)),
      material: "mbt_glass",
      mate: A([-0.75 + (g % 3) * 0.12, 1.35 + Math.floor(g / 3) * 0.1, 2.04], [90, 0, 0]),
    });
    add({
      id: `${P}driver_needle_${g + 1}`,
      name_cn: `仪表指针 ${g + 1}`,
      name_en: `gauge needle ${g + 1}`,
      assembly: "driver",
      build_layer: 3,
      build_order: 710,
      geometry: MERGE(B(0.004, 0.028, 0.006, [0, 0.014, 0], 0.001)),
      material: "mbt_mark_red",
      mate: A([-0.75 + (g % 3) * 0.12, 1.35 + Math.floor(g / 3) * 0.1, 2.055], [90, 0, 20 + g * 15]),
    });
  }
  add({
    id: `${P}driver_switch_panel`,
    name_cn: "驾驶员开关板",
    name_en: "driver switch panel",
    assembly: "driver",
    build_layer: 3,
    build_order: 711,
    geometry: MERGE(B(0.26, 0.16, 0.04, [0, 0, 0], 0.005)),
    material: "mbt_paint_dark",
    mate: A([-0.18, 1.28, 2.04], [12, 0, 0]),
  });
  for (let k = 0; k < 6; k++) {
    add({
      id: `${P}driver_switch_${k + 1}`,
      name_cn: `开关 ${k + 1}`,
      name_en: `switch ${k + 1}`,
      assembly: "driver",
      build_layer: 3,
      build_order: 712,
      geometry: MERGE(C(0.012, 0.02, [0, 0, 0], 10), C(0.006, 0.022, [0, 0.02, 0], 8)),
      material: "mbt_brass",
      mate: A([-0.28 + (k % 3) * 0.09, 1.24 + Math.floor(k / 3) * 0.07, 2.07], [90, 0, 0]),
    });
  }
  for (let p = 0; p < 3; p++) {
    add({
      id: `${P}driver_periscope_${p + 1}`,
      name_cn: `驾驶员潜望镜 ${p + 1}`,
      name_en: `driver periscope ${p + 1}`,
      assembly: "driver",
      build_layer: 3,
      build_order: 713,
      geometry: MERGE(B(0.14, 0.1, 0.12, [0, 0, 0], 0.008), B(0.1, 0.06, 0.02, [0, 0.02, 0.07], 0.003), C(0.028, 0.05, [0, -0.06, 0], 12)),
      material: "mbt_glass",
      mate: A([-0.62 + p * 0.14, 1.63, 1.85]),
    });
  }
  add({
    id: `${P}driver_fire_extinguisher`,
    name_cn: "驾驶舱灭火器",
    name_en: "driver fire extinguisher",
    assembly: "driver",
    build_layer: 3,
    build_order: 714,
    geometry: MERGE(C(0.06, 0.32, [0, 0, 0], 18), C(0.03, 0.06, [0, 0.19, 0], 12), T(0.03, 0.02, 0.02, [0, 0.23, 0], 10)),
    material: "mbt_mark_red",
    mate: A([-1.12, 1.0, 2.15], [0, 0, 0]),
  });
  add({
    id: `${P}driver_footrest`,
    name_cn: "驾驶员脚凳",
    name_en: "driver footrest",
    assembly: "driver",
    build_layer: 3,
    build_order: 715,
    geometry: MERGE(B(0.4, 0.04, 0.22, [0, 0, 0], 0.006)),
    material: "mbt_steel_dark",
    mate: A([-0.55, 0.58, 2.2]),
  });

  // ================= 炮长 =================
  add({
    id: `${P}gunner_seat`,
    name_cn: "炮长座椅",
    name_en: "gunner seat",
    assembly: "turret_interior",
    build_layer: 3,
    build_order: 720,
    geometry: MERGE(B(0.44, 0.08, 0.4, [0, 0, 0], 0.02), B(0.42, 0.46, 0.08, [0, 0.24, -0.18], 0.02), B(0.26, 0.14, 0.07, [0, 0.5, -0.2], 0.02)),
    material: "mbt_seat",
    node: "Turret",
    mate: A(TL(-0.42, 1.24, -0.18)),
  });
  add({
    id: `${P}gunner_seat_pedestal`,
    name_cn: "炮长座椅支座",
    name_en: "gunner seat pedestal",
    assembly: "turret_interior",
    build_layer: 3,
    build_order: 721,
    geometry: MERGE(C(0.06, 0.5, [0, 0, 0], 16), C(0.16, 0.04, [0, -0.25, 0], 16)),
    material: "mbt_steel_dark",
    node: "Turret",
    mate: A(TL(-0.42, 1.0, -0.18)),
  });
  add({
    id: `${P}gunner_day_sight`,
    name_cn: "炮长昼间瞄准镜",
    name_en: "gunner day sight",
    assembly: "turret_interior",
    build_layer: 3,
    build_order: 722,
    geometry: MERGE(B(0.2, 0.16, 0.32, [0, 0, 0], 0.008), C(0.06, 0.08, [0, 0.02, 0.18], 18), C(0.025, 0.1, [0, 0, -0.12], 12)),
    material: "mbt_optic",
    node: "Turret",
    mate: A(TL(-0.55, 1.78, 0.45)),
  });
  add({
    id: `${P}gunner_thermal_sight`,
    name_cn: "炮长热像仪",
    name_en: "gunner thermal sight",
    assembly: "turret_interior",
    build_layer: 3,
    build_order: 723,
    geometry: MERGE(B(0.24, 0.22, 0.36, [0, 0, 0], 0.01), C(0.08, 0.08, [0, 0, 0.2], 20), C(0.06, 0.1, [0, 0.16, -0.04], 14), B(0.18, 0.08, 0.1, [0, -0.16, 0], 0.006)),
    material: "mbt_thermal_lens",
    node: "Turret",
    mate: A(TL(-0.5, 1.95, 0.35)),
  });
  add({
    id: `${P}gunner_display`,
    name_cn: "炮长火控显示器",
    name_en: "gunner fire-control display",
    assembly: "turret_interior",
    build_layer: 3,
    build_order: 724,
    geometry: MERGE(B(0.26, 0.18, 0.04, [0, 0, 0], 0.006), B(0.22, 0.14, 0.01, [0, 0, 0.025], 0.002)),
    material: "mbt_glass",
    node: "Turret",
    mate: A(TL(-0.28, 1.46, 0.42), [0, -18, 0]),
  });
  add({
    id: `${P}gunner_fcs`,
    name_cn: "弹道计算机",
    name_en: "ballistic computer",
    assembly: "turret_interior",
    build_layer: 3,
    build_order: 725,
    geometry: MERGE(B(0.34, 0.26, 0.3, [0, 0, 0], 0.008), C(0.03, 0.1, [0.1, 0.16, 0], 12), C(0.03, 0.1, [-0.1, 0.16, 0], 12)),
    material: "mbt_paint_dark",
    node: "Turret",
    mate: A(TL(-0.15, 1.78, -0.55)),
  });
  add({
    id: `${P}gunner_panel`,
    name_cn: "炮长控制面板",
    name_en: "gunner control panel",
    assembly: "turret_interior",
    build_layer: 3,
    build_order: 726,
    geometry: MERGE(B(0.3, 0.16, 0.06, [0, 0, 0], 0.005), B(0.24, 0.02, 0.02, [0, 0.05, 0.035], 0.002)),
    material: "mbt_paint_dark",
    node: "Turret",
    mate: A(TL(-0.2, 1.25, 0.2), [0, -10, 0]),
  });
  for (let k = 0; k < 8; k++) {
    add({
      id: `${P}gunner_button_${k + 1}`,
      name_cn: `炮长按钮 ${k + 1}`,
      name_en: `gunner button ${k + 1}`,
      assembly: "turret_interior",
      build_layer: 3,
      build_order: 727,
      geometry: MERGE(C(0.012, 0.018, [0, 0, 0], 10)),
      material: k % 3 === 0 ? "mbt_mark_red" : "mbt_glass",
      node: "Turret",
      mate: A(TL(-0.3 + (k % 4) * 0.07, 1.2 - Math.floor(k / 4) * 0.06, 0.235), [90, 0, 0]),
    });
  }
  add({
    id: `${P}gunner_traverse_handwheel`,
    name_cn: "炮长方向机手轮",
    name_en: "gunner traverse handwheel",
    assembly: "turret_interior",
    build_layer: 3,
    build_order: 728,
    geometry: MERGE(T(0.11, 0.085, 0.035, [0, 0, 0], 22), C(0.022, 0.08, [0, 0, 0], 12), B(0.16, 0.02, 0.02, [0, 0.05, 0], 0.003)),
    material: "mbt_steel_dark",
    node: "Turret",
    mate: A(TL(-0.68, 1.24, -0.35), [0, 90, 0]),
  });
  add({
    id: `${P}gunner_elevation_handwheel`,
    name_cn: "炮长高低机手轮",
    name_en: "gunner elevation handwheel",
    assembly: "turret_interior",
    build_layer: 3,
    build_order: 729,
    geometry: MERGE(T(0.11, 0.085, 0.035, [0, 0, 0], 22), C(0.022, 0.08, [0, 0, 0], 12), B(0.16, 0.02, 0.02, [0, 0.05, 0], 0.003)),
    material: "mbt_steel_dark",
    node: "Turret",
    mate: A(TL(-0.68, 1.42, -0.2), [0, 90, 0]),
  });
  add({
    id: `${P}gunner_joystick`,
    name_cn: "炮长测距/激光按钮",
    name_en: "gunner laser joystick",
    assembly: "turret_interior",
    build_layer: 3,
    build_order: 730,
    geometry: MERGE(C(0.015, 0.1, [0, 0, 0], 10), C(0.025, 0.03, [0, 0.06, 0], 10)),
    material: "mbt_steel_dark",
    node: "Turret",
    mate: A(TL(-0.36, 1.3, -0.2)),
  });

  // ================= 车长 =================
  add({
    id: `${P}commander_seat`,
    name_cn: "车长座椅",
    name_en: "commander seat",
    assembly: "turret_interior",
    build_layer: 3,
    build_order: 740,
    geometry: MERGE(B(0.46, 0.08, 0.42, [0, 0, 0], 0.02), B(0.44, 0.48, 0.08, [0, 0.25, -0.2], 0.02), B(0.26, 0.14, 0.07, [0, 0.52, -0.22], 0.02)),
    material: "mbt_seat",
    node: "Turret",
    mate: A(TL(0.45, 1.24, -0.25)),
  });
  add({
    id: `${P}commander_seat_pedestal`,
    name_cn: "车长座椅支座",
    name_en: "commander seat pedestal",
    assembly: "turret_interior",
    build_layer: 3,
    build_order: 741,
    geometry: MERGE(C(0.06, 0.5, [0, 0, 0], 16), C(0.16, 0.04, [0, -0.25, 0], 16)),
    material: "mbt_steel_dark",
    node: "Turret",
    mate: A(TL(0.45, 1.0, -0.25)),
  });
  add({
    id: `${P}commander_cupola_ring`,
    name_cn: "车长塔内环",
    name_en: "cupola inner ring",
    assembly: "turret_interior",
    build_layer: 3,
    build_order: 742,
    geometry: MERGE(T(0.34, 0.31, 0.2, [0, 0, 0], 28)),
    material: "mbt_paint_dark",
    node: "Turret",
    mate: A(TL(0.55, 2.55, -0.18)),
  });
  for (let p = 0; p < 6; p++) {
    const a = (p / 6) * Math.PI * 2;
    add({
      id: `${P}commander_periscope_${p + 1}`,
      name_cn: `车长周视潜望镜 ${p + 1}`,
      name_en: `commander periscope ${p + 1}`,
      assembly: "turret_interior",
      build_layer: 3,
      build_order: 743,
      geometry: MERGE(B(0.1, 0.08, 0.05, [0, 0, 0], 0.005), C(0.025, 0.06, [0, 0, 0.03], 12)),
      material: "mbt_glass",
      node: "Turret",
      mate: A(TL(0.55 + Math.cos(a) * 0.3, 2.56, -0.18 + Math.sin(a) * 0.3), [0, Math.PI / 2 - a, 0]),
    });
  }
  add({
    id: `${P}commander_display`,
    name_cn: "车长热像仪显示器",
    name_en: "commander thermal display",
    assembly: "turret_interior",
    build_layer: 3,
    build_order: 744,
    geometry: MERGE(B(0.26, 0.2, 0.05, [0, 0, 0], 0.006), B(0.22, 0.16, 0.01, [0, 0, 0.03], 0.002)),
    material: "mbt_glass",
    node: "Turret",
    mate: A(TL(0.34, 1.55, 0.1), [0, 10, 0]),
  });
  add({
    id: `${P}commander_override`,
    name_cn: "车长超越控制手柄",
    name_en: "commander override grip",
    assembly: "turret_interior",
    build_layer: 3,
    build_order: 745,
    geometry: MERGE(C(0.022, 0.16, [0, 0, 0], 12), C(0.04, 0.04, [0, 0.09, 0], 12), B(0.04, 0.03, 0.06, [0, 0.11, 0.03], 0.003)),
    material: "mbt_steel_dark",
    node: "Turret",
    mate: A(TL(0.32, 1.35, 0.05)),
  });
  add({
    id: `${P}commander_radio_1`,
    name_cn: "车长电台 1",
    name_en: "commander radio 1",
    assembly: "turret_interior",
    build_layer: 3,
    build_order: 746,
    geometry: MERGE(B(0.3, 0.22, 0.24, [0, 0, 0], 0.008), C(0.02, 0.1, [0.1, 0.16, 0], 10), B(0.22, 0.04, 0.02, [0, 0.04, 0.13], 0.002)),
    material: "mbt_paint_dark",
    node: "Turret",
    mate: A(TL(0.95, 1.4, -0.7)),
  });
  add({
    id: `${P}commander_radio_2`,
    name_cn: "车长电台 2",
    name_en: "commander radio 2",
    assembly: "turret_interior",
    build_layer: 3,
    build_order: 747,
    geometry: MERGE(B(0.24, 0.18, 0.2, [0, 0, 0], 0.008), C(0.018, 0.08, [0.08, 0.13, 0], 10)),
    material: "mbt_paint_dark",
    node: "Turret",
    mate: A(TL(0.95, 1.62, -0.72)),
  });
  add({
    id: `${P}commander_intercom`,
    name_cn: "车内通话器",
    name_en: "intercom box",
    assembly: "turret_interior",
    build_layer: 3,
    build_order: 748,
    geometry: MERGE(B(0.16, 0.1, 0.08, [0, 0, 0], 0.006), C(0.02, 0.06, [0, 0.05, 0], 10)),
    material: "mbt_alu",
    node: "Turret",
    mate: A(TL(0.38, 1.3, -0.25)),
  });
  add({
    id: `${P}commander_map_board`,
    name_cn: "车长图板",
    name_en: "commander map board",
    assembly: "turret_interior",
    build_layer: 3,
    build_order: 749,
    geometry: MERGE(B(0.36, 0.02, 0.26, [0, 0, 0], 0.004), B(0.02, 0.03, 0.24, [-0.17, -0.03, 0], 0.002), B(0.02, 0.03, 0.24, [0.17, -0.03, 0], 0.002)),
    material: "mbt_canvas",
    node: "Turret",
    mate: A(TL(0.55, 1.3, 0.8), [18, 0, 0]),
  });

  // ================= 炮塔吊篮 =================
  add({
    id: `${P}basket_floor_ring`,
    name_cn: "炮塔吊篮地板环",
    name_en: "basket floor ring",
    assembly: "basket",
    build_layer: 3,
    build_order: 760,
    geometry: MERGE(T(1.02, 0.8, 0.06, [0, 0, 0], 40), T(1.03, 0.99, 0.1, [0, 0.16, 0], 40)),
    material: "mbt_steel_dark",
    node: "Turret",
    mate: A(TL(0, 0.92, 0)),
  });
  add({
    id: `${P}basket_mesh`,
    name_cn: "吊篮网格地板",
    name_en: "basket mesh floor",
    assembly: "basket",
    build_layer: 3,
    build_order: 761,
    geometry: MERGE(
      ...Array.from({ length: 9 }, (_, i) => B(1.9, 0.012, 0.018, [0, 0, -0.76 + i * 0.19], 0.001)),
      ...Array.from({ length: 7 }, (_, i) => B(0.018, 0.012, 1.5, [-0.72 + i * 0.24, 0.01, 0], 0.001)),
    ),
    material: "mbt_steel_dark",
    node: "Turret",
    mate: A(TL(0, 0.9, 0)),
  });
  for (let s = 0; s < 8; s++) {
    const a = (s / 8) * Math.PI * 2;
    add({
      id: `${P}basket_stanchion_${s + 1}`,
      name_cn: `吊篮立柱 ${s + 1}`,
      name_en: `basket stanchion ${s + 1}`,
      assembly: "basket",
      build_layer: 3,
      build_order: 762,
      geometry: MERGE(C(0.025, 0.72, [0, 0.36, 0], 12), C(0.03, 0.02, [0, 0, 0], 12)),
      material: "mbt_steel",
      node: "Turret",
      mate: A(TL(Math.cos(a) * 0.98, 0.92, Math.sin(a) * 0.98)),
    });
  }
  add({
    id: `${P}basket_guardrail`,
    name_cn: "吊篮护栏",
    name_en: "basket guard rail",
    assembly: "basket",
    build_layer: 3,
    build_order: 763,
    geometry: MERGE(T(1.03, 1.0, 0.035, [0, 0, 0], 40)),
    material: "mbt_steel",
    node: "Turret",
    mate: A(TL(0, 1.55, 0)),
  });
  for (let k = 0; k < 4; k++) {
    add({
      id: `${P}basket_footrest_${k + 1}`,
      name_cn: `吊篮脚踏 ${k + 1}`,
      name_en: `basket footrest ${k + 1}`,
      assembly: "basket",
      build_layer: 3,
      build_order: 764,
      geometry: MERGE(B(0.26, 0.03, 0.1, [0, 0, 0], 0.004), B(0.04, 0.12, 0.04, [0, -0.08, 0], 0.003)),
      material: "mbt_steel_dark",
      node: "Turret",
      mate: A(TL(-0.3 + k * 0.2, 0.7, -0.5)),
    });
  }

  // ================= 自动装弹机 =================
  add({
    id: `${P}carousel_ring`,
    name_cn: "自动装弹机转盘",
    name_en: "autoloader carousel",
    assembly: "autoloader",
    build_layer: 3,
    build_order: 780,
    geometry: MERGE(T(0.86, 0.7, 0.08, [0, 0, 0], 44), T(0.9, 0.86, 0.05, [0, 0.12, 0], 44), C(0.1, 0.2, [0, 0, 0], 20)),
    material: "mbt_steel_dark",
    node: CAROUSEL_NODE,
    mate: A([0, 0, 0]),
  });
  add({
    id: `${P}carousel_drive_motor`,
    name_cn: "转盘驱动电机",
    name_en: "carousel drive motor",
    assembly: "autoloader",
    build_layer: 3,
    build_order: 781,
    geometry: MERGE(C(0.07, 0.16, [0, 0, 0], 18), C(0.02, 0.1, [0.08, 0, 0], 10)),
    material: "mbt_cast_dark",
    mate: A([0, 0.7, 1.0]),
  });
  add({
    id: `${P}carousel_gearbox`,
    name_cn: "转盘减速器",
    name_en: "carousel gearbox",
    assembly: "autoloader",
    build_layer: 3,
    build_order: 782,
    geometry: MERGE(B(0.2, 0.2, 0.2, [0, 0, 0], 0.008), C(0.02, 0.12, [0.12, 0, 0], 10)),
    material: "mbt_alu",
    mate: A([0.7, 0.72, 0.9]),
  });
  add({
    id: `${P}carousel_index_sensor`,
    name_cn: "转盘选弹传感器",
    name_en: "carousel index sensor",
    assembly: "autoloader",
    build_layer: 3,
    build_order: 783,
    geometry: MERGE(C(0.03, 0.06, [0, 0, 0], 14), C(0.008, 0.03, [0, 0.05, 0], 8)),
    material: "mbt_brass",
    mate: A([0.42, 0.72, 0.9]),
  });
  add({
    id: `${P}carousel_cassette`,
    name_cn: "待发弹筒 ×22",
    name_en: "ammo cassette",
    assembly: "autoloader",
    build_layer: 3,
    build_order: 784,
    geometry: MERGE(T(0.09, 0.078, 0.82, [0, 0.41, 0], 22), T(0.1, 0.078, 0.03, [0, 0.82, 0], 22), C(0.06, 0.03, [0, 0.01, 0], 16)),
    material: "mbt_steel_dark",
    node: CAROUSEL_NODE,
    mate: A([0, 0, 0]),
    instances: 22,
    indexed: true,
    instance_nodes: Array.from({ length: 22 }, () => CAROUSEL_NODE),
    instance_layout: "mbt.interior.cassette",
  });
  add({
    id: `${P}autoloader_lift_motor`,
    name_cn: "提弹机液压马达",
    name_en: "autoloader lift motor",
    assembly: "autoloader",
    build_layer: 3,
    build_order: 785,
    geometry: MERGE(C(0.06, 0.14, [0, 0, 0], 18), C(0.03, 0.08, [0.1, 0, 0], 12)),
    material: "mbt_alu",
    mate: A([0.35, 1.0, 0.35]),
  });
  add({
    id: `${P}autoloader_arm`,
    name_cn: "提弹臂",
    name_en: "autoloader lift arm",
    assembly: "autoloader",
    build_layer: 3,
    build_order: 786,
    geometry: MERGE(B(0.08, 0.9, 0.08, [0, 0.45, 0], 0.006), C(0.04, 0.12, [0, 0, 0], 14), C(0.04, 0.12, [0, 0.9, 0], 14)),
    material: "mbt_steel_dark",
    node: LOAD_ARM_NODE,
    mate: A([0, 0, 0]),
  });
  add({
    id: `${P}autoloader_cradle`,
    name_cn: "提弹机托弹槽",
    name_en: "autoloader cradle",
    assembly: "autoloader",
    build_layer: 3,
    build_order: 787,
    geometry: MERGE(B(0.2, 0.12, 0.7, [0, 0, 0], 0.008), B(0.24, 0.04, 0.16, [0, -0.06, -0.22], 0.004), B(0.24, 0.04, 0.16, [0, -0.06, 0.22], 0.004)),
    material: "mbt_steel_dark",
    node: LOAD_ARM_NODE,
    mate: A([0, 0.9, 0]),
  });
  add({
    id: `${P}autoloader_rammer`,
    name_cn: "推弹杆",
    name_en: "autoloader rammer",
    assembly: "autoloader",
    build_layer: 3,
    build_order: 788,
    geometry: MERGE(C(0.025, 0.9, [0, 0, 0], 14), C(0.06, 0.05, [0, 0.46, 0], 16), C(0.04, 0.06, [0, -0.46, 0], 12)),
    material: "mbt_steel",
    node: RAMMER_NODE,
    mate: A([0, 0, 0], [90, 0, 0]),
  });
  add({
    id: `${P}autoloader_blast_door`,
    name_cn: "弹药隔舱防爆门",
    name_en: "ammo blast door",
    assembly: "autoloader",
    build_layer: 3,
    build_order: 789,
    geometry: MERGE(B(0.6, 0.5, 0.05, [0, 0, 0], 0.008), B(0.08, 0.08, 0.08, [0, 0, 0.05], 0.004)),
    material: "mbt_steel_dark",
    mate: A([0, 1.25, 1.30]),
  });
  add({
    id: `${P}autoloader_control_box`,
    name_cn: "自动装弹机控制盒",
    name_en: "autoloader control box",
    assembly: "autoloader",
    build_layer: 3,
    build_order: 790,
    geometry: MERGE(B(0.24, 0.18, 0.12, [0, 0, 0], 0.006), B(0.18, 0.06, 0.02, [0, 0.04, 0.07], 0.002)),
    material: "mbt_paint_dark",
    mate: A([-0.78, 0.7, 0.8]),
  });
  add({
    id: `${P}autoloader_hydraulic_unit`,
    name_cn: "装弹机液压泵站",
    name_en: "autoloader hydraulic unit",
    assembly: "autoloader",
    build_layer: 3,
    build_order: 791,
    geometry: MERGE(B(0.26, 0.2, 0.2, [0, 0, 0], 0.008), C(0.05, 0.12, [0.16, 0, 0], 14), C(0.03, 0.18, [0, 0.14, 0], 10)),
    material: "mbt_alu",
    mate: A([0.78, 0.95, 0.85]),
  });
  add({
    id: `${P}autoloader_select_actuator`,
    name_cn: "选弹执行器",
    name_en: "round select actuator",
    assembly: "autoloader",
    build_layer: 3,
    build_order: 792,
    geometry: MERGE(C(0.04, 0.12, [0, 0, 0], 16), C(0.015, 0.1, [0, 0.1, 0], 10)),
    material: "mbt_brass",
    mate: A([-0.7, 1.08, 0.6]),
  });

  // ================= 尾舱弹药架 + 泄压板 =================
  add({
    id: `${P}bustle_rack_tube`,
    name_cn: "尾舱弹筒 ×18",
    name_en: "bustle ammo tube",
    assembly: "bustle_ammo",
    build_layer: 3,
    build_order: 800,
    geometry: MERGE(T(0.085, 0.074, 0.82, [0, 0.41, 0], 20), T(0.095, 0.074, 0.03, [0, 0.82, 0], 20)),
    material: "mbt_steel_dark",
    node: "Turret",
    mate: A(TL(0, 0, 0)),
    instances: 18,
    indexed: true,
    instance_nodes: Array.from({ length: 18 }, () => "Turret"),
    instance_layout: "mbt.interior.rackTube",
  });
  add({
    id: `${P}bustle_rack_frame`,
    name_cn: "尾舱弹药架框架",
    name_en: "bustle ammo rack frame",
    assembly: "bustle_ammo",
    build_layer: 3,
    build_order: 801,
    geometry: MERGE(
      B(2.1, 0.05, 0.05, [0, 0, -1.75], 0.004),
      B(2.1, 0.05, 0.05, [0, 0.7, -1.75], 0.004),
      B(0.05, 0.75, 0.05, [-1.05, 0.35, -1.75], 0.004),
      B(0.05, 0.75, 0.05, [1.05, 0.35, -1.75], 0.004),
      ...Array.from({ length: 4 }, (_, i) => B(0.03, 0.72, 0.03, [-0.75 + i * 0.5, 0.35, -1.75], 0.003)),
    ),
    material: "mbt_steel",
    node: "Turret",
    mate: A(TL(0, 1.95, 0)),
  });
  for (const side of [-1, 1] as const) {
    add({
      id: `${P}blowout_${side === 1 ? "r" : "l"}`,
      name_cn: `${side === 1 ? "右" : "左"}泄压板`,
      name_en: `${side === 1 ? "right" : "left"} blowout panel`,
      assembly: "bustle_ammo",
      build_layer: 4,
      build_order: 802,
      geometry: MERGE(B(0.98, 0.03, 0.8, [0, 0, 0], 0.006), B(0.92, 0.02, 0.03, [0, 0.02, 0.27], 0.003), ...Array.from({ length: 4 }, (_, i) => B(0.06, 0.03, 0.5, [-0.36 + i * 0.24, 0.01, 0], 0.002))),
      material: "mbt_paint_dark",
      node: side === 1 ? BLOWOUT_R : BLOWOUT_L,
      mate: A([-side * 0.49, 0, 0]),
      tags: ["blowout"],
    });
    for (let h = 0; h < 2; h++) {
      add({
        id: `${P}blowout_hinge_${side === 1 ? "r" : "l"}_${h + 1}`,
        name_cn: `泄压板铰链 ${side === 1 ? "右" : "左"}-${h + 1}`,
        name_en: `blowout hinge ${h + 1}`,
        assembly: "bustle_ammo",
        build_layer: 4,
        build_order: 803,
        geometry: MERGE(C(0.018, 0.08, [0, 0, 0], 10), B(0.06, 0.02, 0.06, [0.03, -0.03, 0], 0.002)),
        material: "mbt_steel",
        node: "Turret",
        mate: A(TL(side * (1.0 + h * 0.06), 2.47, -1.62)),
      });
    }
    add({
      id: `${P}blowout_latch_${side === 1 ? "r" : "l"}`,
      name_cn: `泄压板锁扣 ${side === 1 ? "右" : "左"}`,
      name_en: `blowout latch ${side === 1 ? "right" : "left"}`,
      assembly: "bustle_ammo",
      build_layer: 4,
      build_order: 804,
      geometry: MERGE(B(0.08, 0.04, 0.05, [0, 0, 0], 0.003), C(0.012, 0.05, [0, -0.04, 0], 8)),
      material: "mbt_brass",
      node: "Turret",
      mate: A(TL(side * 0.55, 2.46, -2.32)),
    });
  }
  add({
    id: `${P}blowout_vent`,
    name_cn: "泄压板通风格栅",
    name_en: "blowout vent grille",
    assembly: "bustle_ammo",
    build_layer: 4,
    build_order: 805,
    geometry: { type: "louver", count: 6, w: 0.7, h: 0.5, slantDeg: 35, t: 0.02 },
    material: "mbt_steel_dark",
    node: "Turret",
    mate: A(TL(0, 2.45, -2.2)),
  });
  add({
    id: `${P}bustle_fire_sensor`,
    name_cn: "弹药舱温度/火光传感器",
    name_en: "ammo bay fire sensor",
    assembly: "bustle_ammo",
    build_layer: 4,
    build_order: 806,
    geometry: MERGE(C(0.03, 0.06, [0, 0, 0], 12), C(0.008, 0.04, [0, 0.04, 0], 8)),
    material: "mbt_brass",
    node: "Turret",
    mate: A(TL(0.95, 2.3, -2.3)),
  });

  // ================= 弹药（40 发，零件级） =================
  type AmmoGroup = {
    tag: string;
    count: number;
    where: "carousel" | "rack";
    layout: string;
    offset: number;
  };
  const groups: AmmoGroup[] = [
    { tag: "ap_carousel", count: 12, where: "carousel", layout: "mbt.interior.carousel0", offset: 0 },
    { tag: "heat_carousel", count: 6, where: "carousel", layout: "mbt.interior.carousel12", offset: 12 },
    { tag: "he_carousel", count: 4, where: "carousel", layout: "mbt.interior.carousel18", offset: 18 },
    { tag: "ap_rack", count: 4, where: "rack", layout: "mbt.interior.rack0", offset: 0 },
    { tag: "heat_rack", count: 6, where: "rack", layout: "mbt.interior.rack4", offset: 4 },
    { tag: "he_rack", count: 4, where: "rack", layout: "mbt.interior.rack10", offset: 10 },
    { tag: "hesh_rack", count: 4, where: "rack", layout: "mbt.interior.rack14", offset: 14 },
  ];
  const nodeOf = (where: "carousel" | "rack") => (where === "carousel" ? CAROUSEL_NODE : "Turret");
  const addAmmo = (
    group: AmmoGroup,
    key: string,
    nameCn: string,
    nameEn: string,
    geometry: GeometrySpec,
    material: string,
  ) => {
    add({
      id: `${P}ammo_${group.tag}_${key}`,
      name_cn: `${nameCn}（${group.tag.startsWith("ap") ? "APFSDS" : group.tag.startsWith("heat") ? "HEAT" : group.tag.startsWith("hesh") ? "HESH" : "HE"}）`,
      name_en: nameEn,
      assembly: "ammunition",
      build_layer: 3,
      build_order: 820,
      geometry,
      material,
      node: nodeOf(group.where),
      mate: A([0, 0, 0]),
      instances: group.count,
      indexed: true,
      instance_nodes: Array.from({ length: group.count }, () => nodeOf(group.where)),
      instance_layout: group.layout,
    });
  };
  for (const g of groups) {
    const isAp = g.tag.startsWith("ap");
    const isHeat = g.tag.startsWith("heat");
    addAmmo(g, "case", "药筒", "cartridge case", MERGE(T(0.058, 0.05, 0.32, [0, 0.16, 0], 24), C(0.06, 0.02, [0, 0.32, 0], 24), T(0.062, 0.05, 0.02, [0, 0.01, 0], 24)), "mbt_brass_ammo");
    addAmmo(g, "propellant", "发射药柱", "propellant charge", MERGE(C(0.052, 0.28, [0, 0.17, 0], 18), C(0.02, 0.03, [0, 0.33, 0], 10)), "mbt_propellant");
    addAmmo(g, "primer", "底火", "primer", MERGE(C(0.018, 0.022, [0, -0.005, 0], 12), C(0.022, 0.006, [0, 0.006, 0], 12)), "mbt_brass");
    if (isAp) {
      addAmmo(g, "penetrator", "钨合金弹芯", "tungsten penetrator", MERGE(C(0.014, 0.52, [0, 0.62, 0], 14), C(0.01, 0.08, [0, 0.92, 0], 10)), "mbt_tungsten");
      addAmmo(g, "windscreen", "风帽", "windscreen", MERGE(C(0.019, 0.06, [0, 0.96, 0], 14, 0.004)), "mbt_alu");
      addAmmo(g, "sabot", "弹托（3 瓣）", "sabot petals", MERGE(...Array.from({ length: 3 }, (_, i) => {
        const a = (i / 3) * Math.PI * 2;
        return B(0.018, 0.2, 0.03, [Math.cos(a) * 0.028, 0.44, Math.sin(a) * 0.028], 0.003);
      })), "mbt_alu");
      addAmmo(g, "fins", "尾翼（4 片）", "fins", MERGE(...Array.from({ length: 4 }, (_, i) => {
        const a = (i / 4) * Math.PI * 2;
        return B(0.05, 0.09, 0.006, [Math.cos(a) * 0.03, 0.34, Math.sin(a) * 0.03], 0.002);
      })), "mbt_steel_dark");
    } else if (isHeat) {
      addAmmo(g, "liner", "药型罩", "shaped-charge liner", MERGE({ type: "lathe", profile: [[0, 0.42], [0.036, 0.5], [0.046, 0.6], [0.04, 0.62]], segments: 24 }), "mbt_copper");
      addAmmo(g, "body", "弹体", "projectile body", MERGE(C(0.05, 0.3, [0, 0.53, 0], 22), C(0.045, 0.08, [0, 0.72, 0], 18, 0.02)), "mbt_steel");
      addAmmo(g, "fuze", "引信", "fuze", MERGE(C(0.022, 0.08, [0, 0.78, 0], 14), C(0.016, 0.03, [0, 0.83, 0], 10)), "mbt_brass");
      addAmmo(g, "fins", "尾翼", "fins", MERGE(...Array.from({ length: 4 }, (_, i) => {
        const a = (i / 4) * Math.PI * 2;
        return B(0.045, 0.08, 0.006, [Math.cos(a) * 0.04, 0.38, Math.sin(a) * 0.04], 0.002);
      })), "mbt_steel_dark");
    } else {
      addAmmo(g, "body", "弹体", "projectile body", MERGE(C(0.054, 0.34, [0, 0.52, 0], 22, 0.03), C(0.04, 0.1, [0, 0.73, 0], 18, 0.012)), "mbt_steel");
      addAmmo(g, "shell", g.tag.startsWith("hesh") ? "碎甲弹头" : "榴弹弹头", g.tag.startsWith("hesh") ? "HESH head" : "HE head", MERGE(C(0.056, 0.16, [0, 0.68, 0], 22, 0.02)), "mbt_paint_dark");
      addAmmo(g, "fuze", "引信", "fuze", MERGE(C(0.02, 0.07, [0, 0.79, 0], 14), C(0.014, 0.03, [0, 0.84, 0], 10)), "mbt_brass");
    }
  }

  // 装填演示弹（fx，构建时隐藏）
  add({
    id: `${P}demo_penetrator`,
    name_cn: "演示弹芯（APFSDS）",
    name_en: "demo penetrator",
    assembly: "autoloader",
    build_layer: 3,
    build_order: 900,
    geometry: MERGE(C(0.014, 0.52, [0, 0, 0], 14), C(0.01, 0.08, [0, 0.3, 0], 10)),
    material: "mbt_tungsten",
    node: LOAD_ROUND_NODE,
    mate: A([0, 0.6, 0]),
    tags: ["fx"],
  });
  add({
    id: `${P}demo_sabot`,
    name_cn: "演示弹托",
    name_en: "demo sabot",
    assembly: "autoloader",
    build_layer: 3,
    build_order: 901,
    geometry: MERGE(...Array.from({ length: 3 }, (_, i) => {
      const a = (i / 3) * Math.PI * 2;
      return B(0.02, 0.22, 0.03, [Math.cos(a) * 0.03, 0.4, Math.sin(a) * 0.03], 0.003);
    })),
    material: "mbt_alu",
    node: LOAD_ROUND_NODE,
    mate: A([0, 0.6, 0]),
    tags: ["fx"],
  });
  add({
    id: `${P}demo_case`,
    name_cn: "演示药筒",
    name_en: "demo cartridge case",
    assembly: "autoloader",
    build_layer: 3,
    build_order: 902,
    geometry: MERGE(T(0.058, 0.05, 0.34, [0, 0, 0], 22), C(0.06, 0.02, [0, 0.17, 0], 22)),
    material: "mbt_brass_ammo",
    node: LOAD_ROUND_NODE,
    mate: A([0, 0.18, 0]),
    tags: ["fx"],
  });
  add({
    id: `${P}ejected_case`,
    name_cn: "抛出的空药筒",
    name_en: "ejected empty case",
    assembly: "autoloader",
    build_layer: 3,
    build_order: 903,
    geometry: MERGE(T(0.058, 0.05, 0.34, [0, 0, 0], 22), C(0.06, 0.02, [0, 0.17, 0], 22)),
    material: "mbt_brass_ammo",
    node: EJECTED_CASE_NODE,
    mate: A([0, 0, 0]),
    tags: ["fx"],
  });
  add({
    id: `${P}muzzle_flash`,
    name_cn: "炮口焰（特效）",
    name_en: "muzzle flash fx",
    assembly: "fx",
    build_layer: 5,
    build_order: 950,
    geometry: MERGE({ type: "sphere", r: 0.3, segments: 16 }, { type: "sphere", r: 0.16, segments: 12, at: [0, 0, 0.4] }),
    material: "mbt_flash",
    node: "GunRecoil",
    mate: A([0, 0, MBT.BARREL_LEN + 0.1]),
    tags: ["fx"],
  });
  add({
    id: `${P}evacuator_smoke`,
    name_cn: "抽烟装置排烟（特效）",
    name_en: "evacuator smoke fx",
    assembly: "fx",
    build_layer: 5,
    build_order: 951,
    geometry: MERGE({ type: "sphere", r: 0.14, segments: 12 }, { type: "sphere", r: 0.22, segments: 12, at: [0.3, 0.15, 0.3] }, { type: "sphere", r: 0.3, segments: 12, at: [0.5, 0.3, 0.5] }),
    material: "mbt_smoke",
    node: "Gun",
    mate: A([0, 0.16, 2.55]),
    tags: ["fx"],
  });
  add({
    id: `${P}era_fireball`,
    name_cn: "ERA 爆炸火球（特效）",
    name_en: "ERA fireball fx",
    assembly: "fx",
    build_layer: 5,
    build_order: 952,
    geometry: MERGE({ type: "sphere", r: 0.34, segments: 16 }, { type: "sphere", r: 0.2, segments: 12, at: [0.3, 0.2, 0.1] }),
    material: "mbt_fire",
    node: "Turret",
    mate: A([1.0, 2.1, 2.1]),
    tags: ["fx"],
  });
  add({
    id: `${P}era_debris`,
    name_cn: "ERA 抛出的面板碎片（特效）",
    name_en: "ERA debris fx",
    assembly: "fx",
    build_layer: 5,
    build_order: 953,
    geometry: MERGE(B(0.2, 0.14, 0.06, [0, 0, 0], 0.006), B(0.12, 0.06, 0.03, [0.04, 0.02, 0.01], 0.003)),
    material: "mbt_debris",
    node: "Turret",
    mate: A([1.0, 2.1, 2.1]),
    tags: ["fx"],
  });
  add({
    id: `${P}incoming_round`,
    name_cn: "来袭穿甲弹（特效）",
    name_en: "incoming APFSDS fx",
    assembly: "fx",
    build_layer: 5,
    build_order: 954,
    geometry: MERGE(C(0.015, 0.6, [0, 0, 0], 12), B(0.06, 0.09, 0.006, [0, 0, 0], 0.002)),
    material: "mbt_tungsten",
    mate: A([1.0, 2.1, 2.2], [0, 0, 90]),
    tags: ["fx"],
  });
  add({
    id: `${P}blowout_fire`,
    name_cn: "泄压喷火（特效）",
    name_en: "blowout fire jet fx",
    assembly: "fx",
    build_layer: 5,
    build_order: 955,
    geometry: MERGE({ type: "sphere", r: 0.25, segments: 14 }, { type: "sphere", r: 0.38, segments: 14, at: [0, 0.5, 0] }, { type: "sphere", r: 0.5, segments: 12, at: [0.2, 1.0, 0] }),
    material: "mbt_fire",
    node: "Turret",
    mate: A(TL(0, 2.6, -1.9)),
    tags: ["fx"],
  });
  add({
    id: `${P}blowout_smoke`,
    name_cn: "泄压黑烟（特效）",
    name_en: "blowout smoke fx",
    assembly: "fx",
    build_layer: 5,
    build_order: 956,
    geometry: MERGE({ type: "sphere", r: 0.35, segments: 12 }, { type: "sphere", r: 0.55, segments: 12, at: [0.4, 0.7, 0] }, { type: "sphere", r: 0.8, segments: 12, at: [0.9, 1.4, 0] }),
    material: "mbt_smoke",
    node: "Turret",
    mate: A(TL(0, 2.7, -1.9)),
    tags: ["fx"],
  });
  add({
    id: `${P}detonation_fire`,
    name_cn: "殉爆火球（特效）",
    name_en: "detonation fireball fx",
    assembly: "fx",
    build_layer: 5,
    build_order: 957,
    geometry: MERGE({ type: "sphere", r: 0.8, segments: 18 }, { type: "sphere", r: 1.2, segments: 18, at: [0, 0.8, 0] }),
    material: "mbt_fire",
    node: "Turret",
    mate: A(TL(0, 2.7, -1.6)),
    tags: ["fx"],
  });
  add({
    id: `${P}loader_hatch_inner`,
    name_cn: "装填手舱口内盖",
    name_en: "loader hatch inner",
    assembly: "turret_interior",
    build_layer: 4,
    build_order: 810,
    geometry: MERGE(T(0.3, 0.27, 0.05, [0, 0, 0], 24), C(0.1, 0.04, [0, 0, 0], 16)),
    material: "mbt_paint_dark",
    node: "Turret",
    mate: A(TL(-0.45, 2.43, -0.95)),
  });
  add({
    id: `${P}commander_hatch_inner`,
    name_cn: "车长舱口内盖",
    name_en: "commander hatch inner",
    assembly: "turret_interior",
    build_layer: 4,
    build_order: 811,
    geometry: MERGE(T(0.31, 0.28, 0.05, [0, 0, 0], 24), C(0.1, 0.04, [0, 0, 0], 16)),
    material: "mbt_paint_dark",
    node: "Turret",
    mate: A(TL(0.55, 2.43, -0.18)),
  });
  return parts;
}

const CONTACTS: ExpectedContactRule[] = [
  {
    family: "interior-driver",
    a: `${P}driver_*`,
    b: `${P}driver_*`,
    reason: "驾驶席：座椅骨架/坐垫/靠背、转向柱/方向盘、踏板、仪表板/仪表、开关板、潜望镜同处驾驶舱（相邻安装）",
    maxDepthMm: 50,
    allowDisplaced: true,
    allowSuspect: true,
  },
  {
    family: "interior-turret-crew",
    a: `${P}gunner_*`,
    b: `${P}gunner_*`,
    reason: "炮长席：座椅、昼/热像镜、显示器、火控计算机、控制面板、手轮同处炮塔左前（紧凑布置）",
    maxDepthMm: 70,
    allowDisplaced: true,
    allowSuspect: true,
  },
  {
    family: "interior-commander",
    a: `${P}commander_*`,
    b: `${P}commander_*`,
    reason: "车长席：座椅、指挥塔内环、周视镜、显示器、超越手柄、电台同处炮塔右后",
    maxDepthMm: 50,
    allowDisplaced: true,
    allowSuspect: true,
  },
  {
    family: "interior-crew-cross",
    a: `${P}gunner_*`,
    b: `${P}commander_*`,
    reason: "炮长/车长席位在战斗室内相邻（座椅与显控台交错布置）",
    maxDepthMm: 40,
    allowDisplaced: true,
    allowSuspect: true,
  },
  {
    family: "interior-basket",
    a: `${P}basket_*`,
    b: `${P}basket_*`,
    reason: "吊篮地板环/网格/立柱/护栏/脚踏互相连接（焊接框架）",
    maxDepthMm: 40,
    allowDisplaced: true,
    allowSuspect: true,
  },
  {
    family: "interior-crew-basket",
    a: `${P}gunner_*`,
    b: `${P}basket_*`,
    reason: "炮长座椅/显控台安装在吊篮地板上",
    maxDepthMm: 45,
    allowDisplaced: true,
    allowSuspect: true,
  },
  {
    family: "interior-commander-basket",
    a: `${P}commander_*`,
    b: `${P}basket_*`,
    reason: "车长座椅/电台安装在吊篮地板上",
    maxDepthMm: 45,
    allowDisplaced: true,
    allowSuspect: true,
  },
  {
    family: "interior-autoloader",
    a: `${P}autoloader_*`,
    b: `${P}autoloader_*`,
    reason: "自动装弹机：转盘/提弹臂/托弹槽/推弹杆/防爆门/液压站同机构装配",
    maxDepthMm: 60,
    allowDisplaced: true,
    allowSuspect: true,
  },
  {
    family: "interior-carousel",
    a: `${P}carousel_*`,
    b: `${P}carousel_*`,
    reason: "转盘环/驱动/减速器/选弹传感器/待发弹筒同轴装配",
    maxDepthMm: 50,
    allowDisplaced: true,
    allowSuspect: true,
  },
  {
    family: "interior-ammo",
    a: `${P}ammo_*`,
    b: `${P}ammo_*`,
    reason: "弹药：弹芯/弹托/药型罩/弹体/药筒/发射药/底火在弹筒内同轴装填",
    maxDepthMm: 60,
    allowDisplaced: true,
    allowSuspect: true,
  },
  {
    family: "interior-ammo-carousel",
    a: `${P}ammo_*`,
    b: `${P}carousel_cassette*`,
    reason: "待发弹装在转盘弹筒内（弹筒内径与弹体间隙）",
    maxDepthMm: 40,
    allowDisplaced: true,
    allowSuspect: true,
  },
  {
    family: "interior-ammo-bustle",
    a: `${P}ammo_*`,
    b: `${P}bustle_*`,
    reason: "尾舱弹药装在弹筒/弹架内（弹筒内径与弹体间隙）",
    maxDepthMm: 40,
    allowDisplaced: true,
    allowSuspect: true,
  },
  {
    family: "interior-bustle",
    a: `${P}bustle_*`,
    b: `${P}bustle_*`,
    reason: "尾舱弹架/泄压板/格栅/传感器/铰链锁扣同处炮塔尾舱",
    maxDepthMm: 45,
    allowDisplaced: true,
    allowSuspect: true,
  },
  {
    family: "interior-blowout",
    a: `${P}blowout_*`,
    b: `${P}blowout_*`,
    reason: "泄压板与铰链/锁扣/格栅的装配（板盖在尾舱顶上）",
    maxDepthMm: 30,
    allowDisplaced: true,
    allowSuspect: true,
  },
  {
    family: "interior-hatch",
    a: `${P}loader_hatch_*`,
    b: `${P}commander_hatch_*`,
    reason: "舱口内盖与炮塔顶板开口（座圈压住开口边）",
    maxDepthMm: 30,
    allowDisplaced: true,
  },
];

export function makeInteriorRegistry(): ModelRegistry {
  return {
    model: "mbt90",
    title: "MBT-90 战斗室与自动装弹机",
    constants: { ...MBT },
    assemblies: [
      { id: "driver", name_cn: "驾驶舱", name_en: "driver station", explode: [0, 0.6, 1.0] },
      { id: "turret_interior", name_cn: "炮塔内饰", name_en: "turret interior", explode: [0, 1.0, 0.4] },
      { id: "basket", name_cn: "炮塔吊篮", name_en: "turret basket", explode: [0, 0.7, 0.2] },
      { id: "autoloader", name_cn: "自动装弹机", name_en: "autoloader", explode: [0, 0.5, 0.6] },
      { id: "ammunition", name_cn: "弹药", name_en: "ammunition", explode: [0, 0.8, -0.6] },
      { id: "bustle_ammo", name_cn: "尾舱弹药架/泄压板", name_en: "bustle ammo & blowout panels", explode: [0, 1.0, -0.8] },
      { id: "fx", name_cn: "演示特效", name_en: "demo effects", explode: [0, 1.2, 0] },
    ],
    nodes: buildNodes(),
    materials: MBT_MATERIALS,
    parts: buildParts(),
    source_notes:
      "三人乘员组（车长/炮长/驾驶员）；炮塔吊篮随炮塔旋转；苏式转盘自动装弹机 22 发待发弹 + 尾舱弹药架 18 发，共 40 发。" +
      "弹药按 APFSDS/HEAT/HE/HESH 四类零件级拆解：钨芯、弹托、风帽、尾翼、药型罩、弹体、引信、药筒、发射药、底火。尾舱顶部泄压板 + 通风格栅。",
    expectedContacts: CONTACTS,
  };
}
