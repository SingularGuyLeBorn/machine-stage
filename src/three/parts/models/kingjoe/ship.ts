import { KJ } from "./constants";
import {
  KingJoeParts,
  absMate,
  addAntigravity,
  addNozzles,
  mateAt,
  pid,
  rivetStripPart,
  tubeBetween,
} from "./helpers";

// ============================================================================
// models/kingjoe/ship —— King Ship（头部飞船）
//
// 参考图：银色头盔、单条百叶式黄色眼带、额头发光体、两侧耳荚、顶部五片冠鳍。
// 飞船形态 = 头部本体 + 后部四喷口 + 两侧小翼，靠反重力悬浮。
// 对接：底面是插入胸部的上模块（承力块 / 锥形销×4 / 锁环 / 导轨 / 传感器）。
// ============================================================================

export function addShipParts(builder: KingJoeParts): void {
  const A = "ship";
  const headY = (y: number): number => KJ.SHIP_Y + y;

  // —— 颈圈 / 头部壳体（五面板 + 下巴，留 5mm 装配缝）——
  builder.add({
    id: pid(A, "neck_collar"),
    name_cn: "颈圈",
    name_en: "neck collar",
    assembly: A,
    layer: 1,
    geometry: { type: "tube", rOuter: 0.92, rInner: 0.782, h: 0.16, segments: 40 },
    material: "silver_dark",
    node: A,
    mate: mateAt(A, [0, headY(0.11), 0]),
    hint: "颈圈内孔 1560mm 套在对接承力块 1560mm 外缘；接触面即承力面",
  });
  builder.add({
    id: pid(A, "neck_gold_band"),
    name_cn: "颈圈金带",
    name_en: "neck gold band",
    assembly: A,
    layer: 5,
    geometry: { type: "tube", rOuter: 0.947, rInner: 0.922, h: 0.05, segments: 40 },
    material: "gold",
    node: A,
    mate: mateAt(A, [0, headY(0.14), 0]),
  });
  builder.add({
    id: pid(A, "face_plate"),
    name_cn: "面部装甲",
    name_en: "face plate",
    assembly: A,
    layer: 4,
    geometry: { type: "kit", kit: "kjChamferPlate", params: { w: 1.34, h: 0.6, t: 0.05, corner: 0.1 } },
    material: "silver",
    node: A,
    mate: mateAt(A, [0, headY(0.58), 0.5625]),
  });
  builder.add({
    id: pid(A, "back_plate"),
    name_cn: "后脑装甲",
    name_en: "skull back plate",
    assembly: A,
    layer: 4,
    geometry: { type: "kit", kit: "kjChamferPlate", params: { w: 1.3, h: 0.55, t: 0.05, corner: 0.1 } },
    material: "silver_dark",
    node: A,
    mate: mateAt(A, [0, headY(0.58), -0.55]),
  });
  builder.add({
    id: pid(A, "top_plate"),
    name_cn: "头顶装甲",
    name_en: "head top plate",
    assembly: A,
    layer: 4,
    geometry: { type: "box", w: 1.3, h: 0.05, d: 1.0, bevel: 0.02 },
    material: "silver",
    node: A,
    mate: mateAt(A, [0, headY(0.87), 0]),
  });
  builder.add({
    id: pid(A, "cheek_plate"),
    name_cn: "头侧装甲",
    name_en: "head cheek plate",
    assembly: A,
    layer: 4,
    geometry: { type: "kit", kit: "kjChamferPlate", params: { w: 1.0, h: 0.56, t: 0.045, corner: 0.1 } },
    material: "silver",
    node: A,
    mate: mateAt(A, [0, headY(0.58), 0]),
    instances: 2,
    indexed: true,
    instance_layout: "kjShipCheeks",
  });
  builder.add({
    id: pid(A, "visor_recess"),
    name_cn: "眼带凹槽",
    name_en: "visor recess",
    assembly: A,
    layer: 4,
    geometry: { type: "box", w: 0.98, h: 0.22, d: 0.03, bevel: 0.008 },
    material: "black_metal",
    node: A,
    mate: mateAt(A, [0, headY(0.64), 0.605]),
  });
  builder.add({
    id: pid(A, "visor_lens"),
    name_cn: "眼带发光体",
    name_en: "eye visor lens",
    assembly: A,
    layer: 5,
    geometry: { type: "box", w: 0.92, h: 0.16, d: 0.02, bevel: 0.004 },
    material: "eye_glow",
    node: A,
    mate: mateAt(A, [0, headY(0.64), 0.635]),
  });
  builder.add({
    id: pid(A, "visor_slat"),
    name_cn: "眼带百叶",
    name_en: "visor slat",
    assembly: A,
    layer: 5,
    geometry: { type: "box", w: 0.018, h: 0.19, d: 0.014, bevel: 0.002 },
    material: "silver_bright",
    node: A,
    mate: mateAt(A, [0, headY(0.64), 0.655]),
    instances: 7,
    indexed: true,
    instance_layout: "kjVisorSlats",
  });
  builder.add({
    id: pid(A, "visor_frame"),
    name_cn: "眼带框",
    name_en: "visor frame",
    assembly: A,
    layer: 4,
    geometry: {
      type: "merge",
      parts: [
        { type: "box", w: 1.06, h: 0.035, d: 0.04, bevel: 0.005, at: [0, 0.135, 0] },
        { type: "box", w: 1.06, h: 0.035, d: 0.04, bevel: 0.005, at: [0, -0.135, 0] },
        { type: "box", w: 0.035, h: 0.25, d: 0.04, bevel: 0.005, at: [-0.535, 0, 0] },
        { type: "box", w: 0.035, h: 0.25, d: 0.04, bevel: 0.005, at: [0.535, 0, 0] },
      ],
    },
    material: "silver_dark",
    node: A,
    mate: mateAt(A, [0, headY(0.64), 0.61]),
  });

  // —— 两只圆形副眼 / 额头发光体 ——
  for (const [suffix, x] of [
    ["l", -0.22],
    ["r", 0.22],
  ] as const) {
    builder.add({
      id: pid(A, `sensor_housing_${suffix}`),
      name_cn: "副眼座",
      name_en: "sensor eye housing",
      assembly: A,
      layer: 4,
      geometry: { type: "tube", rOuter: 0.06, rInner: 0.04, h: 0.04, segments: 20 },
      material: "black_metal",
      node: A,
      mate: mateAt(A, [x, headY(0.42), 0.61], [90, 0, 0]),
    });
    builder.add({
      id: pid(A, `sensor_lens_${suffix}`),
      name_cn: "副眼",
      name_en: "sensor eye",
      assembly: A,
      layer: 5,
      geometry: { type: "cylinder", r: 0.038, h: 0.02, segments: 18 },
      material: "sensor_red",
      node: A,
      mate: mateAt(A, [x, headY(0.42), 0.62], [90, 0, 0]),
    });
  }
  builder.add({
    id: pid(A, "forehead_bezel"),
    name_cn: "额头发射体座",
    name_en: "forehead emitter bezel",
    assembly: A,
    layer: 4,
    geometry: { type: "box", w: 0.16, h: 0.04, d: 0.04, bevel: 0.008 },
    material: "gold_dark",
    node: A,
    mate: mateAt(A, [0, headY(0.82), 0.62]),
  });
  builder.add({
    id: pid(A, "forehead_lens"),
    name_cn: "额头发光体",
    name_en: "forehead emitter",
    assembly: A,
    layer: 5,
    geometry: { type: "box", w: 0.1, h: 0.09, d: 0.02, bevel: 0.004 },
    material: "forehead_glow",
    node: A,
    mate: mateAt(A, [0, headY(0.82), 0.655]),
  });

  // —— 顶部冠鳍 / 耳荚 / 天线 / 侧翼 ——
  builder.add({
    id: pid(A, "crest_fin"),
    name_cn: "冠鳍",
    name_en: "crest fin",
    assembly: A,
    layer: 4,
    geometry: { type: "box", w: 0.09, h: 0.2, d: 0.28, bevel: 0.02 },
    material: "silver",
    node: A,
    mate: mateAt(A, [0, headY(1.0), 0.06]),
    instances: 5,
    indexed: true,
    instance_layout: "kjCrestFins",
  });
  for (const [suffix, sx] of [
    ["l", -1],
    ["r", 1],
  ] as const) {
    builder.add({
      id: pid(A, `ear_pod_${suffix}`),
      name_cn: "耳荚",
      name_en: "ear pod",
      assembly: A,
      layer: 4,
      geometry: { type: "cylinder", r: 0.14, h: 0.13, segments: 24, bevel: 0.012 },
      material: "silver_dark",
      node: A,
      mate: mateAt(A, [sx * 0.78, headY(0.62), 0], [0, 0, 90]),
    });
    builder.add({
      id: pid(A, `ear_ring_${suffix}`),
      name_cn: "耳荚金环",
      name_en: "ear gold ring",
      assembly: A,
      layer: 5,
      geometry: { type: "tube", rOuter: 0.165, rInner: 0.142, h: 0.045, segments: 24 },
      material: "gold",
      node: A,
      mate: mateAt(A, [sx * 0.85, headY(0.62), 0], [0, 0, 90]),
    });
  }
  builder.add({
    id: pid(A, "antenna_stalk"),
    name_cn: "天线杆",
    name_en: "antenna mast",
    assembly: A,
    layer: 4,
    geometry: { type: "cylinder", r: 0.014, h: 0.22, segments: 10 },
    material: "silver_bright",
    node: A,
    mate: mateAt(A, [0, headY(1.09), -0.1]),
    instances: 2,
    indexed: true,
    instance_layout: "kjShipAntennae",
  });
  builder.add({
    id: pid(A, "antenna_tip"),
    name_cn: "天线端",
    name_en: "antenna tip",
    assembly: A,
    layer: 4,
    geometry: { type: "cylinder", r: 0.024, rTop: 0.002, h: 0.08, segments: 10 },
    material: "sensor_red",
    node: A,
    mate: mateAt(A, [0, headY(1.24), -0.1]),
    instances: 2,
    indexed: true,
    instance_layout: "kjShipAntennae",
  });
  // —— 后部姿态舵面 ×4 + 作动器；控制板 / 线束 ——
  for (const [rudder, name, x] of [
    ["shipRudder0", "左水平舵面", -0.16],
    ["shipRudder1", "右水平舵面", 0.16],
  ] as const) {
    builder.add({
      id: pid(A, x < 0 ? "ship_rudder_h0" : "ship_rudder_h1"),
      name_cn: name,
      name_en: "horizontal attitude rudder",
      assembly: A,
      layer: 4,
      geometry: { type: "box", w: 0.32, h: 0.03, d: 0.2, bevel: 0.008 },
      material: "silver_dark",
      node: rudder,
      mate: absMate([x, 0, -0.11]),
      hint: "铰点在背板上缘外侧，舵面在喷口上方 35mm；编队时绕 X 轴小角度摆动",
    });
  }
  for (const [rudder, name, id] of [
    ["shipRudder2", "左垂直舵面", "ship_rudder_v0"],
    ["shipRudder3", "右垂直舵面", "ship_rudder_v1"],
  ] as const) {
    builder.add({
      id: pid(A, id),
      name_cn: name,
      name_en: "vertical attitude rudder",
      assembly: A,
      layer: 4,
      geometry: { type: "box", w: 0.03, h: 0.24, d: 0.2, bevel: 0.006 },
      material: "silver_dark",
      node: rudder,
      mate: absMate([0, 0.12, -0.1]),
      hint: "铰点在背板上缘，舵面向上/后伸出；编队时绕 Y 轴小角度摆动",
    });
  }
  for (const [x, y] of [
    [-0.6, 0.8],
    [0.6, 0.8],
    [-0.27, 0.82],
    [0.27, 0.82],
  ] as const) {
    builder.add({
      id: pid(A, `ship_rudder_actuator_${x < 0 ? "l" : "r"}_${y === 0.8 ? "h" : "v"}`),
      name_cn: "舵面作动器",
      name_en: "rudder actuator can",
      assembly: A,
      layer: 2,
      geometry: { type: "cylinder", r: 0.03, h: 0.04, segments: 16, bevel: 0.004 },
      material: "joint_steel",
      node: A,
      mate: mateAt(A, [x, headY(y), -0.595], [90, 0, 0]),
      hint: "作动筒贴背板，伸缩端到舵面铰点 5mm；同时作为舵面支撑",
    });
  }
  builder.add({
    id: pid(A, "ship_control_panel"),
    name_cn: "船体控制板",
    name_en: "ship control board",
    assembly: A,
    layer: 4,
    geometry: { type: "box", w: 0.28, h: 0.12, d: 0.02, bevel: 0.006 },
    material: "black_metal",
    node: A,
    mate: mateAt(A, [0, headY(0.76), -0.612]),
    hint: "上背板外挂控制板，离背板 10mm；线束从两侧引到颈圈",
  });
  builder.add({
    id: pid(A, "ship_control_led"),
    name_cn: "控制板状态灯",
    name_en: "control board status led",
    assembly: A,
    layer: 5,
    geometry: { type: "cylinder", r: 0.012, h: 0.012, segments: 10, bevel: 0.002 },
    material: "sensor_red",
    node: A,
    mate: mateAt(A, [0.09, headY(0.79), -0.632], [90, 0, 0]),
  });
  for (const [index, sx] of [
    [0, -1],
    [1, 1],
  ] as const) {
    tubeBetween(builder, {
      id: pid(A, `ship_harness_${index}`),
      name_cn: "控制线束",
      name_en: "control harness",
      assembly: A,
      node: A,
      from: [sx * 0.155, headY(0.72), -0.622],
      to: [sx * 0.33, headY(0.66), -0.61],
      radius: 0.01,
      material: "rubber",
      layer: 3,
    });
  }

  rivetStripPart(builder, {
    id: pid(A, "face_rivets"),
    name_cn: "面部铆钉",
    name_en: "face rivets",
    assembly: A,
    node: A,
    world: [-0.45, headY(0.33), 0.589],
    count: 5,
    spacing: 0.08,
    rotation: [90, 0, 0],
  });
  addAntigravity(builder, A, [0, 0.58, -0.35], 0.5);
  addNozzles(builder, A);
}
