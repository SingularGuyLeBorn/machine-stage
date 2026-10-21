import * as THREE from "three";
import type { InstanceLayout } from "../../../assembler/assembler";
import type { ExpectedContactRule, GeometrySpec, ModelRegistry, PartDefinition } from "../../../registry/types";
import { MBT } from "../constants";
import { MBT_MATERIALS } from "../materials";

// ============================================================================
// models/mbt/transmission/registry —— 液力机械综合传动（L1 传动）
//
// 布置：发动机在 z=-2.2 横置；飞轮输出经万向节/弹性联轴器到 z=-1.6 的输入轴，
// 主变速箱在 z=-1.15，两侧终传（行星减速）在 x=±1.21，转向差速器在变速箱上方。
// 7 前 2 倒，每档齿轮独立，同步器换档，液力转向；主动轮后置。
// 齿轮/轴/行星排都在节点上，drive 状态可看到输入轴和终传转动。
// ============================================================================

const P = "mbt90.transmission.";
const A = (position: [number, number, number], rotation?: [number, number, number]) =>
  rotation ? { type: "absolute" as const, position, rotation } : { type: "absolute" as const, position };

const B = (w: number, h: number, d: number, at: [number, number, number] = [0, 0, 0], bevel = 0.004): GeometrySpec & { at: [number, number, number] } => ({ type: "box", w, h, d, bevel, at });
const C = (r: number, h: number, at: [number, number, number] = [0, 0, 0], segments = 20, rTop = r): GeometrySpec & { at: [number, number, number] } => ({ type: "cylinder", r, h, rTop, segments, bevel: 0.0015, at });
const T = (rOuter: number, rInner: number, h: number, at: [number, number, number] = [0, 0, 0], segments = 24): GeometrySpec & { at: [number, number, number] } => ({ type: "tube", rOuter, rInner, h, segments, at });
const MERGE = (...items: Array<GeometrySpec & { at?: [number, number, number] }>): GeometrySpec => ({ type: "merge", parts: items });

export const TRANS_NODES = {
  input: "MBT_Trans_Input",
  main: "MBT_Trans_Main",
  finalL: "MBT_Final_L",
  finalR: "MBT_Final_R",
  steer: "MBT_Steer",
} as const;

const FORWARD_GEAR_R = [0.075, 0.083, 0.091, 0.1, 0.109, 0.118, 0.128];

function buildParts(): PartDefinition[] {
  const parts: PartDefinition[] = [];
  const add = (p: PartDefinition) => parts.push(p);

  // ---------------- 壳体 / 安装 ----------------
  add({
    id: `${P}bell_housing`,
    name_cn: "飞轮壳/离合器壳",
    name_en: "bell housing",
    assembly: "transmission",
    build_layer: 1,
    build_order: 100,
    geometry: MERGE(T(0.30, 0.25, 0.18), T(0.31, 0.27, 0.02, [0, 0.09, 0], 28), T(0.31, 0.27, 0.02, [0, -0.09, 0], 28)),
    material: "mbt_cast",
    mate: A([0, 1.0, -1.56]),
  });
  add({
    id: `${P}gearbox_housing`,
    name_cn: "变速箱壳体",
    name_en: "gearbox housing",
    assembly: "transmission",
    build_layer: 1,
    build_order: 101,
    geometry: MERGE(
      B(0.72, 0.02, 0.66, [0, -0.27, 0], 0.006),
      B(0.72, 0.02, 0.66, [0, 0.27, 0], 0.006),
      B(0.02, 0.54, 0.66, [-0.35, 0, 0], 0.006),
      B(0.02, 0.54, 0.66, [0.35, 0, 0], 0.006),
      B(0.72, 0.54, 0.02, [0, 0, -0.32], 0.006),
      B(0.72, 0.54, 0.02, [0, 0, 0.32], 0.006),
      B(0.76, 0.05, 0.7, [0, 0.3, 0], 0.01),
    ),
    material: "mbt_cast",
    mate: A([0, 1.0, -1.15]),
  });
  add({
    id: `${P}valve_body`,
    name_cn: "液压阀体",
    name_en: "hydraulic valve body",
    assembly: "transmission",
    build_layer: 1,
    build_order: 102,
    geometry: MERGE(B(0.32, 0.2, 0.42, [0, 0, 0], 0.008), C(0.03, 0.12, [0.1, 0.12, 0.12], 12), C(0.03, 0.12, [-0.1, 0.12, 0.12], 12)),
    material: "mbt_alu",
    mate: A([0.46, 1.18, -1.15]),
  });
  add({
    id: `${P}oil_pan`,
    name_cn: "传动油底壳",
    name_en: "transmission oil pan",
    assembly: "transmission",
    build_layer: 1,
    build_order: 103,
    geometry: MERGE(B(0.62, 0.12, 0.56, [0, 0, 0], 0.01)),
    material: "mbt_cast_dark",
    mate: A([0, 0.66, -1.15]),
  });
  add({
    id: `${P}oil_filter`,
    name_cn: "传动油滤清器",
    name_en: "transmission oil filter",
    assembly: "transmission",
    build_layer: 1,
    build_order: 104,
    geometry: MERGE(C(0.05, 0.16, [0, 0, 0], 18), C(0.055, 0.02, [0, 0.09, 0], 18)),
    material: "mbt_paint_dark",
    mate: A([0.44, 1.0, -1.42]),
  });
  for (let m = 0; m < 4; m++) {
    const x = m % 2 === 0 ? -0.36 : 0.36;
    const z = m < 2 ? -1.4 : -0.9;
    add({
      id: `${P}mount_${m + 1}`,
      name_cn: `传动箱机脚 ${m + 1}`,
      name_en: `transmission mount ${m + 1}`,
      assembly: "transmission",
      build_layer: 1,
      build_order: 105,
      geometry: MERGE(B(0.14, 0.05, 0.14, [0, 0, 0], 0.006), B(0.05, 0.28, 0.05, [0, -0.16, 0], 0.004), B(0.16, 0.04, 0.16, [0, -0.32, 0], 0.006)),
      material: "mbt_steel_dark",
      mate: A([x, 0.72, z]),
    });
  }

  // ---------------- 主离合器 ----------------
  add({
    id: `${P}clutch_drum`,
    name_cn: "离合器鼓",
    name_en: "clutch drum",
    assembly: "clutch",
    build_layer: 1,
    build_order: 110,
    geometry: MERGE(T(0.2, 0.18, 0.1, [0, 0, 0], 28)),
    material: "mbt_steel_dark",
    mate: A([0, 0, 0]),
    node: TRANS_NODES.input,
  });
  for (let i = 0; i < 5; i++) {
    add({
      id: `${P}friction_disc_${i + 1}`,
      name_cn: `离合器摩擦片 ${i + 1}`,
      name_en: `friction disc ${i + 1}`,
      assembly: "clutch",
      build_layer: 1,
      build_order: 111,
      geometry: MERGE(T(0.185, 0.13, 0.006, [0, 0, 0], 28)),
      material: "mbt_rubber_worn",
      node: TRANS_NODES.input,
      mate: A([0, 0, -0.08 + i * 0.015]),
    });
    add({
      id: `${P}steel_disc_${i + 1}`,
      name_cn: `离合器钢片 ${i + 1}`,
      name_en: `steel disc ${i + 1}`,
      assembly: "clutch",
      build_layer: 1,
      build_order: 112,
      geometry: MERGE(T(0.18, 0.13, 0.004, [0, 0, 0], 28)),
      material: "mbt_steel",
      node: TRANS_NODES.input,
      mate: A([0, 0, -0.075 + i * 0.015]),
    });
  }
  add({
    id: `${P}pressure_plate`,
    name_cn: "离合器压盘",
    name_en: "clutch pressure plate",
    assembly: "clutch",
    build_layer: 1,
    build_order: 113,
    geometry: MERGE(T(0.19, 0.13, 0.02, [0, 0, 0], 28), B(0.1, 0.02, 0.08, [0, 0, 0], 0.004)),
    material: "mbt_cast_dark",
    node: TRANS_NODES.input,
    mate: A([0, 0, 0.005]),
  });
  add({
    id: `${P}diaphragm_spring`,
    name_cn: "膜片弹簧",
    name_en: "diaphragm spring",
    assembly: "clutch",
    build_layer: 1,
    build_order: 114,
    geometry: MERGE(T(0.16, 0.06, 0.012, [0, 0, 0], 24)),
    material: "mbt_steel",
    node: TRANS_NODES.input,
    mate: A([0, 0, 0.02]),
  });
  add({
    id: `${P}release_bearing`,
    name_cn: "分离轴承",
    name_en: "release bearing",
    assembly: "clutch",
    build_layer: 1,
    build_order: 115,
    geometry: MERGE(T(0.09, 0.065, 0.03, [0, 0, 0], 24)),
    material: "mbt_steel_dark",
    node: TRANS_NODES.input,
    mate: A([0, 0, 0.04]),
  });
  add({
    id: `${P}clutch_slave`,
    name_cn: "离合器助力缸",
    name_en: "clutch slave cylinder",
    assembly: "clutch",
    build_layer: 1,
    build_order: 116,
    geometry: MERGE(C(0.03, 0.14, [0, 0, 0], 16), C(0.012, 0.08, [0, 0.1, 0], 10)),
    material: "mbt_alu",
    mate: A([0.2, 1.25, -1.5], [90, 0, 0]),
  });

  // ---------------- 输入轴 / 齿轮 ----------------
  add({
    id: `${P}input_shaft`,
    name_cn: "输入轴",
    name_en: "input shaft",
    assembly: "gearbox",
    build_layer: 1,
    build_order: 120,
    geometry: MERGE(C(0.038, 0.78, [0, 0, 0], 20)),
    material: "mbt_steel",
    node: TRANS_NODES.input,
    mate: A([0, 0, 0.15], [90, 0, 0]),
  });
  add({
    id: `${P}reverse_shaft`,
    name_cn: "倒档轴",
    name_en: "reverse idler shaft",
    assembly: "gearbox",
    build_layer: 1,
    build_order: 121,
    geometry: MERGE(C(0.03, 0.5, [0, 0, 0], 18)),
    material: "mbt_steel",
    mate: A([-0.2, 1.07, -0.92], [90, 0, 0]),
  });
  for (let g = 0; g < 7; g++) {
    const inputZ = 0.14 + g * 0.08;
    const mainZ = -0.27 + g * 0.08;
    add({
      id: `${P}drive_gear_${g + 1}`,
      name_cn: `${g + 1} 档主动齿轮`,
      name_en: `forward ${g + 1} drive gear`,
      assembly: "gearbox",
      build_layer: 1,
      build_order: 122,
      geometry: { type: "kit", kit: "gearBlank", params: { teeth: 18 + g * 2, r: 0.06 + g * 0.006, w: 0.026, bore: 0.039 } },
      material: "mbt_steel",
      node: TRANS_NODES.input,
      mate: A([0, 0, inputZ], [0, 90, 0]),
    });
    add({
      id: `${P}driven_gear_${g + 1}`,
      name_cn: `${g + 1} 档从动齿轮`,
      name_en: `forward ${g + 1} driven gear`,
      assembly: "gearbox",
      build_layer: 1,
      build_order: 123,
      geometry: { type: "kit", kit: "gearBlank", params: { teeth: 42 - g * 3, r: FORWARD_GEAR_R[g]!, w: 0.024, bore: 0.036 } },
      material: "mbt_steel_dark",
      node: TRANS_NODES.main,
      mate: A([0, 0, mainZ], [0, 90, 0]),
    });
    add({
      id: `${P}synchro_ring_${g + 1}`,
      name_cn: `${g + 1} 档同步环`,
      name_en: `synchronizer ring ${g + 1}`,
      assembly: "gearbox",
      build_layer: 1,
      build_order: 124,
      geometry: MERGE(T(FORWARD_GEAR_R[g]! + 0.002, FORWARD_GEAR_R[g]! - 0.008, 0.012, [0, 0, 0], 24)),
      material: "mbt_brass",
      node: TRANS_NODES.main,
      mate: A([0, 0, mainZ + 0.02]),
    });
  }
  for (let r = 0; r < 2; r++) {
    add({
      id: `${P}reverse_gear_${r + 1}`,
      name_cn: `倒档齿轮 ${r + 1}`,
      name_en: `reverse gear ${r + 1}`,
      assembly: "gearbox",
      build_layer: 1,
      build_order: 125,
      geometry: { type: "kit", kit: "gearBlank", params: { teeth: 24 + r * 4, r: 0.07 + r * 0.01, w: 0.028, bore: 0.032 } },
      material: "mbt_steel",
      mate: A([-0.2 + r * 0.24, 1.07, -0.92], [0, 90, 0]),
    });
  }
  add({
    id: `${P}main_shaft`,
    name_cn: "主轴（输出轴）",
    name_en: "main shaft",
    assembly: "gearbox",
    build_layer: 1,
    build_order: 126,
    geometry: MERGE(C(0.04, 0.8, [0, 0, 0], 20)),
    material: "mbt_steel",
    node: TRANS_NODES.main,
    mate: A([0, 0, 0], [90, 0, 0]),
  });
  for (let h = 0; h < 4; h++) {
    add({
      id: `${P}synchro_hub_${h + 1}`,
      name_cn: `同步器齿毂 ${h + 1}`,
      name_en: `synchronizer hub ${h + 1}`,
      assembly: "gearbox",
      build_layer: 1,
      build_order: 127,
      geometry: MERGE(T(0.045, 0.04, 0.05, [0, 0, 0], 20), C(0.02, 0.06, [0, 0, 0], 12)),
      material: "mbt_steel_dark",
      node: TRANS_NODES.main,
      mate: A([0, 0, -0.25 + h * 0.16], [0, 90, 0]),
    });
  }
  for (let f = 0; f < 4; f++) {
    add({
      id: `${P}shift_fork_${f + 1}`,
      name_cn: `换档拨叉 ${f + 1}`,
      name_en: `shift fork ${f + 1}`,
      assembly: "gearbox",
      build_layer: 1,
      build_order: 128,
      geometry: MERGE(B(0.03, 0.12, 0.04, [0, 0, 0], 0.004), C(0.06, 0.03, [0, 0, 0], 18), C(0.06, 0.03, [0, 0, 0.06], 18)),
      material: "mbt_steel_dark",
      mate: A([0.12, 1.24, -1.34 + f * 0.26]),
    });
    add({
      id: `${P}shift_rail_${f + 1}`,
      name_cn: `换档导轨 ${f + 1}`,
      name_en: `shift rail ${f + 1}`,
      assembly: "gearbox",
      build_layer: 1,
      build_order: 129,
      geometry: MERGE(C(0.012, 0.55, [0, 0, 0], 10)),
      material: "mbt_steel",
      mate: A([0.12, 1.24, -1.34 + f * 0.26], [90, 0, 0]),
    });
  }
  for (let b = 0; b < 10; b++) {
    add({
      id: `${P}shaft_bearing_${b + 1}`,
      name_cn: `齿轮轴轴承 ${b + 1}`,
      name_en: `shaft bearing ${b + 1}`,
      assembly: "gearbox",
      build_layer: 1,
      build_order: 130,
      geometry: MERGE(T(0.055, 0.039, 0.022, [0, 0, 0], 20)),
      material: "mbt_brass",
      mate: A([b % 2 === 0 ? 0 : 0, 1.0, -1.5 + b * 0.062], [90, 0, 0]),
    });
  }

  // ---------------- 终传 / 转向 ----------------
  for (const side of [-1, 1] as const) {
    const tag = side === 1 ? "r" : "l";
    const x = side * 1.0;
    const node = side === 1 ? TRANS_NODES.finalR : TRANS_NODES.finalL;
    add({
      id: `${P}final_housing_${tag}`,
      name_cn: `${side === 1 ? "右" : "左"}终传壳体`,
      name_en: `${tag} final drive housing`,
      assembly: "final_drive",
      build_layer: 1,
      build_order: 140,
      geometry: MERGE(T(0.24, 0.2, 0.16, [0, 0, 0], 28), B(0.16, 0.44, 0.4, [side * 0.14, 0, 0], 0.012)),
      material: "mbt_cast",
      mate: A([x, 0.82, -1.2], [0, 0, 90]),
    });
    add({
      id: `${P}final_ring_${tag}`,
      name_cn: `${side === 1 ? "右" : "左"}终传齿圈`,
      name_en: `${tag} final ring gear`,
      assembly: "final_drive",
      build_layer: 1,
      build_order: 141,
      geometry: { type: "kit", kit: "gearBlank", params: { teeth: 52, r: 0.2, w: 0.04, bore: 0.055 } },
      material: "mbt_steel",
      node,
      mate: A([0, 0, 0]),
    });
    add({
      id: `${P}final_pinion_${tag}`,
      name_cn: `${side === 1 ? "右" : "左"}终传主动齿轮`,
      name_en: `${tag} final pinion`,
      assembly: "final_drive",
      build_layer: 1,
      build_order: 142,
      geometry: { type: "kit", kit: "gearBlank", params: { teeth: 13, r: 0.06, w: 0.05, bore: 0.028 } },
      material: "mbt_steel",
      node,
      mate: A([0, 0.17, 0], [0, 90, 0]),
    });
    add({
      id: `${P}planet_carrier_${tag}`,
      name_cn: `${side === 1 ? "右" : "左"}行星架`,
      name_en: `${tag} planet carrier`,
      assembly: "final_drive",
      build_layer: 1,
      build_order: 143,
      geometry: MERGE(T(0.15, 0.06, 0.05, [0, 0, 0], 24), ...Array.from({ length: 3 }, (_, i) => {
        const a = (i / 3) * Math.PI * 2;
        return C(0.026, 0.16, [Math.cos(a) * 0.11, 0, Math.sin(a) * 0.11], 12);
      })),
      material: "mbt_steel_dark",
      node,
      mate: A([0, 0, 0], [0, 0, 90]),
    });
    add({
      id: `${P}planet_gear_${tag}`,
      name_cn: `${side === 1 ? "右" : "左"}行星轮 ×3`,
      name_en: `${tag} planet gears`,
      assembly: "final_drive",
      build_layer: 1,
      build_order: 144,
      geometry: { type: "kit", kit: "gearBlank", params: { teeth: 18, r: 0.05, w: 0.05, bore: 0.026 } },
      material: "mbt_steel",
      node,
      mate: A([0, 0, 0]),
      instances: 3,
      indexed: true,
      instance_nodes: [node, node, node],
      instance_layout: "mbt.transmission.planet",
    });
    add({
      id: `${P}final_brake_disc_${tag}`,
      name_cn: `${side === 1 ? "右" : "左"}制动盘`,
      name_en: `${tag} brake disc`,
      assembly: "final_drive",
      build_layer: 1,
      build_order: 145,
      geometry: MERGE(T(0.23, 0.09, 0.03, [0, 0, 0], 28)),
      material: "mbt_steel_dark",
      node,
      mate: A([0, 0, 0], [0, 0, 90]),
    });
    add({
      id: `${P}final_brake_caliper_${tag}`,
      name_cn: `${side === 1 ? "右" : "左"}制动钳`,
      name_en: `${tag} brake caliper`,
      assembly: "final_drive",
      build_layer: 1,
      build_order: 146,
      geometry: MERGE(B(0.08, 0.18, 0.12, [0, 0, 0], 0.006), C(0.03, 0.06, [0, 0.1, 0], 12)),
      material: "mbt_cast_dark",
      mate: A([x, 1.08, -1.2]),
    });
    add({
      id: `${P}final_output_shaft_${tag}`,
      name_cn: `${side === 1 ? "右" : "左"}终传输出轴`,
      name_en: `${tag} final output shaft`,
      assembly: "final_drive",
      build_layer: 1,
      build_order: 147,
      geometry: MERGE(C(0.05, 0.5, [0, 0, 0], 18)),
      material: "mbt_steel",
      node,
      mate: A([side * 0.52, 0, 0], [0, 0, 90]),
    });
  }
  add({
    id: `${P}steering_diff`,
    name_cn: "转向差速器",
    name_en: "steering differential",
    assembly: "steering",
    build_layer: 1,
    build_order: 150,
    geometry: MERGE(T(0.2, 0.08, 0.12, [0, 0, 0], 28), C(0.06, 0.24, [0, 0, 0], 18)),
    material: "mbt_cast",
    mate: A([0, 1.28, -1.0]),
  });
  add({
    id: `${P}steering_pump`,
    name_cn: "转向液压泵",
    name_en: "steering pump",
    assembly: "steering",
    build_layer: 1,
    build_order: 151,
    geometry: MERGE(C(0.06, 0.12, [0, 0, 0], 18), C(0.03, 0.1, [0.09, 0, 0], 14)),
    material: "mbt_alu",
    mate: A([0.36, 1.28, -0.95]),
  });
  add({
    id: `${P}steering_motor`,
    name_cn: "转向液压马达",
    name_en: "steering motor",
    assembly: "steering",
    build_layer: 1,
    build_order: 152,
    geometry: MERGE(C(0.07, 0.14, [0, 0, 0], 18), C(0.08, 0.03, [0, 0.08, 0], 18)),
    material: "mbt_cast_dark",
    mate: A([-0.3, 1.28, -1.0]),
  });
  add({
    id: `${P}steering_valve`,
    name_cn: "转向控制阀",
    name_en: "steering control valve",
    assembly: "steering",
    build_layer: 1,
    build_order: 153,
    geometry: MERGE(B(0.2, 0.1, 0.14, [0, 0, 0], 0.006), C(0.02, 0.06, [0.06, 0.07, 0], 10)),
    material: "mbt_alu",
    mate: A([0.3, 1.38, -1.2]),
  });
  for (let l = 0; l < 2; l++) {
    add({
      id: `${P}steering_line_${l + 1}`,
      name_cn: `转向油管 ${l + 1}`,
      name_en: `steering line ${l + 1}`,
      assembly: "steering",
      build_layer: 1,
      build_order: 154,
      geometry: { type: "weld", from: [l === 0 ? 0.36 : -0.3, 1.28, -0.95], to: [0, 1.28, -1.0], radius: 0.014, seed: 80 + l },
      material: "mbt_steel_dark",
      mate: A([0, 0, 0]),
    });
  }
  add({
    id: `${P}oil_pump`,
    name_cn: "传动油泵",
    name_en: "transmission oil pump",
    assembly: "transmission",
    build_layer: 1,
    build_order: 155,
    geometry: MERGE(C(0.05, 0.1, [0, 0, 0], 18), C(0.02, 0.08, [0.06, 0, 0], 10)),
    material: "mbt_cast_dark",
    mate: A([-0.3, 1.0, -1.5]),
  });
  add({
    id: `${P}oil_cooler`,
    name_cn: "传动油冷却器",
    name_en: "transmission oil cooler",
    assembly: "transmission",
    build_layer: 1,
    build_order: 156,
    geometry: MERGE(B(0.3, 0.1, 0.12, [0, 0, 0], 0.008), C(0.018, 0.18, [0.1, 0, 0], 10)),
    material: "mbt_copper",
    mate: A([-0.42, 1.25, -1.3]),
  });
  return parts;
}

export const TRANSMISSION_LAYOUTS: Record<string, InstanceLayout> = {
  "mbt.transmission.planet": ({ index }) => {
    const a = (index / 3) * Math.PI * 2;
    return new THREE.Matrix4().makeTranslation(Math.cos(a) * 0.11, 0.113, Math.sin(a) * 0.11);
  },
};

export function makeTransmissionNodes() {
  return [
    { name: TRANS_NODES.input, parent: "root", pivot: [0, 1.0, -1.56] as [number, number, number], motion: "rotate" as const, axis: "z" as const, note: "变速箱输入轴/离合器" },
    { name: TRANS_NODES.main, parent: "root", pivot: [0, 1.0, -1.15] as [number, number, number], motion: "rotate" as const, axis: "z" as const, note: "主轴/从动齿轮" },
    { name: TRANS_NODES.finalL, parent: "root", pivot: [-1.0, 0.82, -1.2] as [number, number, number], motion: "rotate" as const, axis: "x" as const, note: "左终传" },
    { name: TRANS_NODES.finalR, parent: "root", pivot: [1.0, 0.82, -1.2] as [number, number, number], motion: "rotate" as const, axis: "x" as const, note: "右终传" },
    { name: TRANS_NODES.steer, parent: "root", pivot: [0, 1.28, -1.0] as [number, number, number], motion: "rotate" as const, axis: "z" as const, note: "转向差速器" },
  ];
}

const CONTACTS: ExpectedContactRule[] = [
  {
    family: "transmission-internals",
    a: `${P}*`,
    b: `${P}*`,
    reason: "传动箱内部：齿轮啮合、同步器/拨叉、轴颈在轴承内、离合器片组压紧（同一总成内构造性接触）",
    maxDepthMm: 90,
    allowDisplaced: true,
    allowSuspect: true,
  },
];

export function makeTransmissionRegistry(): ModelRegistry {
  return {
    model: "mbt90",
    title: "MBT-90 传动",
    constants: { ...MBT },
    assemblies: [
      { id: "transmission", name_cn: "变速箱", name_en: "gearbox", explode: [0, 0.8, 0] },
      { id: "clutch", name_cn: "主离合器", name_en: "main clutch", explode: [0, 1.0, 0.2] },
      { id: "gearbox", name_cn: "齿轮组", name_en: "gear train", explode: [0, 1.2, 0.2] },
      { id: "final_drive", name_cn: "侧传动", name_en: "final drives", explode: [1, 0.3, 0] },
      { id: "steering", name_cn: "转向装置", name_en: "steering", explode: [0, 1.4, -0.2] },
    ],
    nodes: makeTransmissionNodes(),
    materials: MBT_MATERIALS,
    parts: buildParts(),
    source_notes:
      "液力机械综合传动（虚构 MBT-90，参考现代主战坦克 7 前 2 倒、液力转向、行星侧传动的总体方案）：" +
      "主离合器片组、7 组独立齿轮、同步器、换档拨叉/导轨、两侧行星终传、转向差速器与液压泵/马达。",
    expectedContacts: CONTACTS,
  };
}
