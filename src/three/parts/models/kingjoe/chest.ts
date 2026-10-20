import { KJ } from "./constants";
import { HYDRAULICS, type Side, sideSign } from "./rig";
import {
  KingJoeParts,
  absMate,
  addAntigravity,
  addHydraulic,
  addNozzles,
  boltRingPart,
  mateAt,
  pid,
  rivetStripPart,
} from "./helpers";
import { MOSAIC_COUNTS } from "./layouts";

// ============================================================================
// models/kingjoe/chest —— King Chest（胸部飞船 + 双臂）
//
// 参考图：胸口两块彩色镶嵌板、中央胸骨、巨型肩荚（顶面四联短筒 + 侧刺）、
// 金色肩环、三指爪、前臂粗壮。双臂是胸体的一部分，但肩/肘/腕各有独立
// 转轴与液压缸；肩部是「胸荚轴 + 臂叉耳」的真实铰链。
// 对接：底面承接腹部的上模块（锥销/锁环），顶面是承接头部的下模块
// （环座/锥销座/锁钩）。
// ============================================================================

const A = "chest";

function addChestShell(builder: KingJoeParts): void {
  builder.add({
    id: pid(A, "lower_frame"),
    name_cn: "胸体下框",
    name_en: "chest lower frame",
    assembly: A,
    layer: 1,
    geometry: { type: "tube", rOuter: 0.78, rInner: 0.44, h: 0.04, segments: 40 },
    material: "silver_dark",
    node: A,
    mate: mateAt(A, [0, KJ.CHEST_Y + 0.28, 0]),
  });
  builder.add({
    id: pid(A, "core"),
    name_cn: "胸体核心",
    name_en: "chest core",
    assembly: A,
    layer: 1,
    geometry: { type: "box", w: 1.5, h: 1.0, d: 1.0, bevel: 0.06 },
    material: "joint_steel",
    node: A,
    mate: mateAt(A, [0, KJ.CHEST_Y + 0.82, 0]),
  });
  builder.add({
    id: pid(A, "pectoral_housing"),
    name_cn: "胸肌承力盒",
    name_en: "pectoral housing",
    assembly: A,
    layer: 1,
    geometry: { type: "box", w: 0.78, h: 0.72, d: 0.1, bevel: 0.02 },
    material: "joint_steel",
    node: A,
    mate: mateAt(A, [0, KJ.CHEST_Y + 0.92, 0.55]),
    instances: 2,
    indexed: true,
    instance_layout: "kjMirrorX066",
  });
  builder.add({
    id: pid(A, "front_backing"),
    name_cn: "胸甲背板",
    name_en: "chest backing plate",
    assembly: A,
    layer: 4,
    geometry: { type: "kit", kit: "kjChamferPlate", params: { w: 1.9, h: 0.9, t: 0.025, corner: 0.1 } },
    material: "silver",
    node: A,
    mate: mateAt(A, [0, KJ.CHEST_Y + 0.92, 0.6275]),
  });
  builder.add({
    id: pid(A, "upper_plate"),
    name_cn: "胸上装甲",
    name_en: "upper chest armor",
    assembly: A,
    layer: 4,
    geometry: { type: "kit", kit: "kjChamferPlate", params: { w: 1.5, h: 0.3, t: 0.03, corner: 0.08 } },
    material: "silver",
    node: A,
    mate: mateAt(A, [0, KJ.CHEST_Y + 1.58, 0.65]),
  });
  builder.add({
    id: pid(A, "lower_plate"),
    name_cn: "胸下装甲",
    name_en: "lower chest armor",
    assembly: A,
    layer: 4,
    geometry: { type: "kit", kit: "kjChamferPlate", params: { w: 1.7, h: 0.28, t: 0.03, corner: 0.08 } },
    material: "silver",
    node: A,
    mate: mateAt(A, [0, KJ.CHEST_Y + 0.46, 0.66]),
  });
  builder.add({
    id: pid(A, "sternum"),
    name_cn: "胸骨中板",
    name_en: "sternum",
    assembly: A,
    layer: 4,
    geometry: { type: "kit", kit: "kjChamferPlate", params: { w: 0.22, h: 0.34, t: 0.035, corner: 0.04 } },
    material: "silver",
    node: A,
    mate: mateAt(A, [0, KJ.CHEST_Y + 0.93, 0.67]),
  });
  builder.add({
    id: pid(A, "upper_block"),
    name_cn: "上胸块",
    name_en: "upper chest block",
    assembly: A,
    layer: 1,
    geometry: { type: "box", w: 1.5, h: 0.35, d: 0.9, bevel: 0.04 },
    material: "joint_steel",
    node: A,
    mate: mateAt(A, [0, KJ.CHEST_Y + 1.5, 0]),
  });
  builder.add({
    id: pid(A, "neck_pedestal"),
    name_cn: "颈部基座",
    name_en: "neck pedestal",
    assembly: A,
    layer: 1,
    geometry: { type: "box", w: 0.7, h: 0.15, d: 0.5, bevel: 0.03 },
    material: "silver_dark",
    node: A,
    mate: mateAt(A, [0, KJ.CHEST_Y + 1.755, 0]),
  });
  builder.add({
    id: pid(A, "neck_collar"),
    name_cn: "颈环",
    name_en: "neck collar",
    assembly: A,
    layer: 4,
    geometry: { type: "tube", rOuter: 0.62, rInner: 0.5, h: 0.2, segments: 32 },
    material: "silver",
    node: A,
    mate: mateAt(A, [0, KJ.CHEST_Y + 1.84, 0]),
  });
  builder.add({
    id: pid(A, "neck_gold_ring"),
    name_cn: "颈环金圈",
    name_en: "neck gold ring",
    assembly: A,
    layer: 5,
    geometry: { type: "tube", rOuter: 0.647, rInner: 0.622, h: 0.045, segments: 32 },
    material: "gold",
    node: A,
    mate: mateAt(A, [0, KJ.CHEST_Y + 1.9, 0]),
  });
  builder.add({
    id: pid(A, "top_plate"),
    name_cn: "胸顶承盘",
    name_en: "chest top plate",
    assembly: A,
    layer: 1,
    geometry: { type: "cylinder", r: 0.78, h: 0.05, segments: 40, bevel: 0.005 },
    material: "silver_dark",
    node: A,
    mate: mateAt(A, [0, KJ.CHEST_Y + 1.97, 0]),
  });
  builder.add({
    id: pid(A, "back_plate"),
    name_cn: "背部装甲",
    name_en: "back armor",
    assembly: A,
    layer: 4,
    geometry: { type: "kit", kit: "kjChamferPlate", params: { w: 1.7, h: 1.0, t: 0.04, corner: 0.1 } },
    material: "silver_dark",
    node: A,
    mate: mateAt(A, [0, KJ.CHEST_Y + 0.92, -0.56]),
  });
  builder.add({
    id: pid(A, "back_rib"),
    name_cn: "背部加强肋",
    name_en: "back rib",
    assembly: A,
    layer: 1,
    geometry: { type: "box", w: 0.1, h: 0.8, d: 0.02, bevel: 0.004 },
    material: "joint_steel",
    node: A,
    mate: mateAt(A, [0, KJ.CHEST_Y + 0.92, -0.515]),
    instances: 3,
    indexed: true,
    instance_layout: "kjBackRibs",
  });
  builder.add({
    id: pid(A, "back_louver"),
    name_cn: "背部散热格栅",
    name_en: "back louver",
    assembly: A,
    layer: 4,
    geometry: { type: "louver", count: 7, w: 0.9, h: 0.5, slantDeg: 32, t: 0.008 },
    material: "black_metal",
    node: A,
    mate: mateAt(A, [0, KJ.CHEST_Y + 0.92, -0.605], [0, 180, 0]),
  });
  builder.add({
    id: pid(A, "side_plate"),
    name_cn: "胸侧装甲",
    name_en: "chest side armor",
    assembly: A,
    layer: 4,
    geometry: { type: "kit", kit: "kjChamferPlate", params: { w: 0.7, h: 0.8, t: 0.04, corner: 0.08 } },
    material: "silver",
    node: A,
    mate: mateAt(A, [0, KJ.CHEST_Y + 0.9, 0]),
    instances: 2,
    indexed: true,
    instance_layout: "kjChestSides",
  });
  rivetStripPart(builder, {
    id: pid(A, "chest_rivets"),
    name_cn: "胸甲铆钉",
    name_en: "chest rivets",
    assembly: A,
    node: A,
    world: [-0.46, KJ.CHEST_Y + 1.33, 0.641],
    count: 6,
    spacing: 0.08,
    rotation: [90, 0, 0],
  });
  boltRingPart(builder, {
    id: pid(A, "top_bolts"),
    name_cn: "胸顶螺栓圈",
    name_en: "chest top bolts",
    assembly: A,
    node: A,
    world: [0, KJ.CHEST_Y + 2.002, 0],
    count: 16,
    radius: 0.67,
    boltR: 0.012,
    boltH: 0.016,
    layer: 4,
  });

  // —— 胸口彩色镶嵌（2 面板 × 3×4 瓷片）——
  builder.add({
    id: pid(A, "mosaic_back"),
    name_cn: "镶嵌底板",
    name_en: "mosaic backplate",
    assembly: A,
    layer: 4,
    geometry: { type: "box", w: 0.64, h: 0.56, d: 0.015, bevel: 0.004 },
    material: "black_metal",
    node: A,
    mate: mateAt(A, [0, KJ.CHEST_Y + 0.95, 0.6575]),
    instances: 2,
    indexed: true,
    instance_layout: "kjMirrorX072",
  });
  builder.add({
    id: pid(A, "mosaic_frame"),
    name_cn: "镶嵌框",
    name_en: "mosaic frame",
    assembly: A,
    layer: 4,
    geometry: {
      type: "merge",
      parts: [
        { type: "box", w: 0.74, h: 0.05, d: 0.03, bevel: 0.005, at: [0, 0.31, 0] },
        { type: "box", w: 0.74, h: 0.05, d: 0.03, bevel: 0.005, at: [0, -0.31, 0] },
        { type: "box", w: 0.05, h: 0.64, d: 0.03, bevel: 0.005, at: [-0.37, 0, 0] },
        { type: "box", w: 0.05, h: 0.64, d: 0.03, bevel: 0.005, at: [0.37, 0, 0] },
      ],
    },
    material: "silver_dark",
    node: A,
    mate: mateAt(A, [0, KJ.CHEST_Y + 0.95, 0.6875]),
    instances: 2,
    indexed: true,
    instance_layout: "kjMirrorX072",
  });
  const tileGeometry = { type: "box", w: 0.16, h: 0.105, d: 0.02, bevel: 0.003 } as const;
  builder.add({
    id: pid(A, "tile_blue"),
    name_cn: "胸甲蓝瓷片",
    name_en: "chest blue tile",
    assembly: A,
    layer: 5,
    geometry: tileGeometry,
    material: "chest_glow_blue",
    node: A,
    mate: absMate([0, 0, 0]),
    instances: MOSAIC_COUNTS.blue,
    indexed: true,
    instance_layout: "kjMosaicBlue",
  });
  builder.add({
    id: pid(A, "tile_rose"),
    name_cn: "胸甲玫红瓷片",
    name_en: "chest rose tile",
    assembly: A,
    layer: 5,
    geometry: tileGeometry,
    material: "chest_glow_rose",
    node: A,
    mate: absMate([0, 0, 0]),
    instances: MOSAIC_COUNTS.rose,
    indexed: true,
    instance_layout: "kjMosaicRose",
  });
  builder.add({
    id: pid(A, "tile_amber"),
    name_cn: "胸甲琥珀瓷片",
    name_en: "chest amber tile",
    assembly: A,
    layer: 5,
    geometry: tileGeometry,
    material: "chest_glow_amber",
    node: A,
    mate: absMate([0, 0, 0]),
    instances: MOSAIC_COUNTS.amber,
    indexed: true,
    instance_layout: "kjMosaicAmber",
  });
  for (const [suffix, px] of [
    ["l", -0.72],
    ["r", 0.72],
  ] as const) {
    builder.add({
      id: pid(A, `mosaic_frame_bolt_${suffix}`),
      name_cn: "镶嵌框螺栓",
      name_en: "mosaic frame bolts",
      assembly: A,
      layer: 4,
      geometry: { type: "boltCircle", count: 10, radius: 0.4, boltR: 0.01, boltH: 0.012 },
      material: "silver_bright",
      node: A,
      mate: mateAt(A, [px, KJ.CHEST_Y + 0.95, 0.705], [90, 0, 0]),
    });
  }

  // —— 胸口主发射口：冷却套 / 双充能环 / 四聚焦透镜 / 发光体 / 安装环 ——
  builder.add({
    id: pid(A, "emitter_lens"),
    name_cn: "胸口发光体",
    name_en: "chest emitter lens",
    assembly: A,
    layer: 5,
    geometry: { type: "cylinder", r: 0.045, h: 0.03, segments: 20, bevel: 0.004 },
    material: "forehead_glow",
    node: A,
    mate: mateAt(A, [0, KJ.CHEST_Y + 1.28, 0.7], [90, 0, 0]),
  });
  for (let index = 0; index < 4; index++) {
    const angle = Math.PI / 4 + (index / 4) * Math.PI * 2;
    builder.add({
      id: pid(A, `emitter_focus_${index}`),
      name_cn: "胸口聚焦透镜",
      name_en: "chest focus lens",
      assembly: A,
      layer: 5,
      geometry: { type: "cylinder", r: 0.022, h: 0.025, segments: 12, bevel: 0.002 },
      material: "gold",
      node: A,
      mate: mateAt(
        A,
        [Math.cos(angle) * 0.075, KJ.CHEST_Y + 1.28 + Math.sin(angle) * 0.075, 0.7],
        [90, 0, 0],
      ),
    });
  }
  builder.add({
    id: pid(A, "emitter_charge_outer"),
    name_cn: "胸口充能环外",
    name_en: "chest charge ring outer",
    assembly: A,
    layer: 5,
    geometry: { type: "kit", kit: "kjTorus", params: { radius: 0.145, tube: 0.014, segments: 30 } },
    material: "gold",
    node: A,
    mate: mateAt(A, [0, KJ.CHEST_Y + 1.28, 0.675], [90, 0, 0]),
  });
  builder.add({
    id: pid(A, "emitter_charge_inner"),
    name_cn: "胸口充能环内",
    name_en: "chest charge ring inner",
    assembly: A,
    layer: 5,
    geometry: { type: "kit", kit: "kjTorus", params: { radius: 0.12, tube: 0.012, segments: 28 } },
    material: "servo_blue",
    node: A,
    mate: mateAt(A, [0, KJ.CHEST_Y + 1.28, 0.69], [90, 0, 0]),
  });
  for (const [suffix, sx] of [
    ["l", -1],
    ["r", 1],
  ] as const) {
    builder.add({
      id: pid(A, `shoulder_pod_${suffix}`),
      name_cn: "肩荚鼓筒",
      name_en: "shoulder drum pod",
      assembly: A,
      layer: 4,
      geometry: { type: "cylinder", r: 0.49, h: 0.86, segments: 40, bevel: 0.025 },
      material: "silver",
      node: A,
      mate: mateAt(A, [sx * 1.62, KJ.CHEST_Y + 1.56, 0], [0, 0, 90]),
      source: "参考图肩荚是巨型圆筒+金色端环，不是方盒；筒径 980mm，与胸侧承力梁同轴",
    });
    builder.add({
      id: pid(A, `shoulder_pod_ring_inner_${suffix}`),
      name_cn: "肩荚内金环",
      name_en: "shoulder drum inner gold ring",
      assembly: A,
      layer: 5,
      geometry: { type: "tube", rOuter: 0.535, rInner: 0.492, h: 0.08, segments: 40 },
      material: "gold",
      node: A,
      mate: mateAt(A, [sx * 1.25, KJ.CHEST_Y + 1.56, 0], [0, 0, 90]),
    });
    builder.add({
      id: pid(A, `shoulder_pod_ring_outer_${suffix}`),
      name_cn: "肩荚外金环",
      name_en: "shoulder drum outer gold ring",
      assembly: A,
      layer: 5,
      geometry: { type: "tube", rOuter: 0.535, rInner: 0.492, h: 0.08, segments: 40 },
      material: "gold",
      node: A,
      mate: mateAt(A, [sx * 1.99, KJ.CHEST_Y + 1.56, 0], [0, 0, 90]),
    });
  }
  builder.add({
    id: pid(A, "shoulder_cowl"),
    name_cn: "肩荚前檐甲",
    name_en: "shoulder cowl",
    assembly: A,
    layer: 4,
    geometry: { type: "kit", kit: "kjChamferPlate", params: { w: 0.6, h: 0.5, t: 0.035, corner: 0.09 } },
    material: "silver",
    node: A,
    mate: mateAt(A, [0, KJ.CHEST_Y + 1.86, 0.51]),
    instances: 2,
    indexed: true,
    instance_layout: "kjMirrorX162",
  });
  builder.add({
    id: pid(A, "shoulder_brace"),
    name_cn: "肩荚承力梁",
    name_en: "shoulder brace",
    assembly: A,
    layer: 1,
    geometry: { type: "box", w: 0.42, h: 0.5, d: 0.7, bevel: 0.03 },
    material: "joint_steel",
    node: A,
    mate: mateAt(A, [0, KJ.CHEST_Y + 1.55, 0]),
    instances: 2,
    indexed: true,
    instance_layout: "kjMirrorX098",
  });
  builder.add({
    id: pid(A, "shoulder_boss"),
    name_cn: "肩轴套",
    name_en: "shoulder boss",
    assembly: A,
    layer: 1,
    geometry: { type: "tube", rOuter: 0.34, rInner: 0.21, h: 0.08, segments: 30 },
    material: "silver_dark",
    node: A,
    mate: mateAt(A, [0, KJ.CHEST_Y + 1.55, 0]),
    instances: 2,
    indexed: true,
    instance_layout: "kjShoulderBosses",
  });
  builder.add({
    id: pid(A, "shoulder_axle"),
    name_cn: "肩轴",
    name_en: "shoulder axle",
    assembly: A,
    layer: 1,
    geometry: { type: "cylinder", r: 0.2, h: 0.5, segments: 20, bevel: 0.004 },
    material: "joint_steel",
    node: A,
    mate: mateAt(A, [0, KJ.CHEST_Y + 1.55, 0]),
    instances: 2,
    indexed: true,
    instance_layout: "kjShoulderAxles",
  });
  builder.add({
    id: pid(A, "shoulder_stack"),
    name_cn: "肩荚四联短筒",
    name_en: "shoulder quad stack",
    assembly: A,
    layer: 4,
    geometry: { type: "cylinder", r: 0.085, h: 0.3, segments: 18, bevel: 0.008 },
    material: "silver_dark",
    node: A,
    mate: mateAt(A, [0, KJ.CHEST_Y + 2.21, 0]),
    instances: 8,
    indexed: true,
    instance_layout: "kjPodStacks",
  });
  builder.add({
    id: pid(A, "shoulder_spike"),
    name_cn: "肩荚侧刺",
    name_en: "shoulder spike",
    assembly: A,
    layer: 5,
    geometry: { type: "cylinder", r: 0.025, rTop: 0.002, h: 0.28, segments: 12 },
    material: "gold",
    node: A,
    mate: mateAt(A, [0, KJ.CHEST_Y + 1.55, 0]),
    instances: 4,
    indexed: true,
    instance_layout: "kjPodSpikes",
  });
  addAntigravity(builder, "chest", [0, 0.9, -0.91], 0.8);
  addNozzles(builder, "chest");
}

function addArm(builder: KingJoeParts, side: Side): void {
  const s = sideSign(side);
  const arm = `arm_${side}`;
  const fore = `forearm_${side}`;
  const hand = `hand_${side}`;

  // —— 肩转毂（绕胸荚固定轴旋转）+ 锁环 + 转毂到上臂的连接柱 ——
  builder.add({
    id: pid(A, `arm_sh_hub_${side}`),
    name_cn: "肩转毂",
    name_en: "shoulder rotating hub",
    assembly: A,
    layer: 1,
    geometry: { type: "tube", rOuter: 0.26, rInner: 0.21, h: 0.14, segments: 28 },
    material: "silver_dark",
    node: arm,
    mate: absMate([0, 0, 0], [0, 0, 90]),
    hint: "肩转毂内孔 420mm / 肩轴 400mm，单边 10mm 轴承间隙；转毂随臂旋转",
  });
  builder.add({
    id: pid(A, `arm_sh_link_${side}`),
    name_cn: "肩臂连接柱",
    name_en: "shoulder arm link",
    assembly: A,
    layer: 1,
    geometry: { type: "cylinder", r: 0.07, h: 0.12, segments: 16, bevel: 0.004 },
    material: "joint_steel",
    node: arm,
    mate: absMate([0, -0.34, 0]),
  });
  builder.add({
    id: pid(A, `arm_sh_lock_ring_${side}`),
    name_cn: "肩锁环",
    name_en: "shoulder lock ring",
    assembly: A,
    layer: 2,
    geometry: { type: "tube", rOuter: 0.28, rInner: 0.22, h: 0.05, segments: 28 },
    material: "gold",
    node: `shoulderLock${side.toUpperCase()}`,
    mate: absMate([-0.11 * s, 0, 0], [0, 0, 90]),
    hint: "肩锁环绕 X 轴旋 18°；锁环内孔 440mm / 肩轴 400mm，单边 20mm",
  });
  builder.add({
    id: pid(A, `arm_sh_lock_lug_${side}`),
    name_cn: "肩锁环凸爪",
    name_en: "shoulder lock lug",
    assembly: A,
    layer: 2,
    geometry: { type: "box", w: 0.05, h: 0.05, d: 0.06, bevel: 0.006 },
    material: "gold_dark",
    node: `shoulderLock${side.toUpperCase()}`,
    mate: absMate([-0.11 * s, 0, 0]),
    instances: 2,
    indexed: true,
    instance_nodes: [`shoulderLock${side.toUpperCase()}`, `shoulderLock${side.toUpperCase()}`],
    instance_layout: "kjShoulderLugs",
  });
  builder.add({
    id: pid(A, `arm_sh_sensor_${side}`),
    name_cn: "肩角传感器",
    name_en: "shoulder encoder",
    assembly: A,
    layer: 4,
    geometry: { type: "cylinder", r: 0.04, h: 0.05, segments: 14, bevel: 0.003 },
    material: "sensor_red",
    node: arm,
    mate: absMate([0.23 * s, 0.24, 0], [0, 0, 90]),
  });

  // —— 上臂 ——
  builder.add({
    id: pid(A, `arm_upper_sleeve_${side}`),
    name_cn: "上臂主筒",
    name_en: "upper arm sleeve",
    assembly: A,
    layer: 1,
    geometry: { type: "cylinder", r: 0.235, h: 0.32, segments: 26, bevel: 0.008 },
    material: "silver",
    node: arm,
    mate: absMate([0, -0.56, 0]),
  });
  builder.add({
    id: pid(A, `arm_upper_ring_${side}`),
    name_cn: "上臂金箍",
    name_en: "upper arm gold collar",
    assembly: A,
    layer: 5,
    geometry: { type: "tube", rOuter: 0.265, rInner: 0.24, h: 0.04, segments: 26 },
    material: "gold",
    node: arm,
    mate: absMate([0, -0.73, 0]),
  });
  builder.add({
    id: pid(A, `arm_upper_plate_${side}`),
    name_cn: "上臂前甲",
    name_en: "upper arm front armor",
    assembly: A,
    layer: 4,
    geometry: { type: "kit", kit: "kjChamferPlate", params: { w: 0.42, h: 0.32, t: 0.03, corner: 0.06 } },
    material: "silver",
    node: arm,
    mate: absMate([0, -0.55, 0.255]),
  });
  builder.add({
    id: pid(A, `arm_upper_side_${side}`),
    name_cn: "上臂外甲",
    name_en: "upper arm side armor",
    assembly: A,
    layer: 4,
    geometry: { type: "kit", kit: "kjChamferPlate", params: { w: 0.4, h: 0.3, t: 0.03, corner: 0.05 } },
    material: "silver_dark",
    node: arm,
    mate: absMate([0.25 * s, -0.56, 0], [0, 90 * s, 0]),
  });
  builder.add({
    id: pid(A, `arm_upper_pipe_${side}`),
    name_cn: "上臂液压硬管",
    name_en: "upper arm hard line",
    assembly: A,
    layer: 3,
    geometry: {
      type: "weld",
      from: [0.285 * s, -0.32, 0.03],
      to: [0.285 * s, -0.7, 0.03],
      radius: 0.013,
      seed: 9,
    },
    material: "rubber",
    node: arm,
    mate: absMate([0, 0, 0]),
  });

  // —— 肘 ——
  builder.add({
    id: pid(A, `arm_elbow_drum_${side}`),
    name_cn: "肘轴鼓",
    name_en: "elbow drum",
    assembly: A,
    layer: 1,
    geometry: { type: "tube", rOuter: 0.2, rInner: 0.11, h: 0.28, segments: 26 },
    material: "joint_steel",
    node: arm,
    mate: absMate([0, -KJ.UPPER_ARM_L, 0], [0, 0, 90]),
  });
  builder.add({
    id: pid(A, `arm_fore_clevis_${side}`),
    name_cn: "前臂叉耳",
    name_en: "forearm clevis",
    assembly: A,
    layer: 1,
    geometry: { type: "box", w: 0.028, h: 0.3, d: 0.32, bevel: 0.01 },
    material: "silver_dark",
    node: fore,
    mate: absMate([0, -0.13, 0]),
    instances: 2,
    indexed: true,
    instance_layout: "kjForearmClevis",
  });
  builder.add({
    id: pid(A, `arm_fore_sleeve_${side}`),
    name_cn: "前臂主筒",
    name_en: "forearm sleeve",
    assembly: A,
    layer: 1,
    geometry: { type: "cylinder", r: 0.26, h: 0.55, segments: 26, bevel: 0.008 },
    material: "silver",
    node: fore,
    mate: absMate([0, -0.555, 0]),
  });
  builder.add({
    id: pid(A, `arm_fore_ring_${side}`),
    name_cn: "前臂金箍",
    name_en: "forearm gold collar",
    assembly: A,
    layer: 5,
    geometry: { type: "tube", rOuter: 0.29, rInner: 0.265, h: 0.045, segments: 26 },
    material: "gold",
    node: fore,
    mate: absMate([0, -0.83, 0]),
  });
  builder.add({
    id: pid(A, `arm_fore_plate_${side}`),
    name_cn: "前臂前甲",
    name_en: "forearm front armor",
    assembly: A,
    layer: 4,
    geometry: { type: "kit", kit: "kjChamferPlate", params: { w: 0.5, h: 0.44, t: 0.03, corner: 0.06 } },
    material: "silver",
    node: fore,
    mate: absMate([0, -0.57, 0.28]),
  });
  builder.add({
    id: pid(A, `arm_fore_back_${side}`),
    name_cn: "前臂后甲",
    name_en: "forearm back plate",
    assembly: A,
    layer: 4,
    geometry: { type: "kit", kit: "kjChamferPlate", params: { w: 0.42, h: 0.38, t: 0.02, corner: 0.06 } },
    material: "silver_dark",
    node: fore,
    mate: absMate([0, -0.58, -0.28]),
  });
  builder.add({
    id: pid(A, `arm_fore_side_${side}`),
    name_cn: "前臂外甲",
    name_en: "forearm side armor",
    assembly: A,
    layer: 4,
    geometry: { type: "kit", kit: "kjChamferPlate", params: { w: 0.46, h: 0.42, t: 0.03, corner: 0.06 } },
    material: "silver_dark",
    node: fore,
    mate: absMate([0.28 * s, -0.58, 0], [0, 90 * s, 0]),
  });

  // —— 腕 / 手 ——
  builder.add({
    id: pid(A, `arm_wrist_drum_${side}`),
    name_cn: "腕轴鼓",
    name_en: "wrist drum",
    assembly: A,
    layer: 1,
    geometry: { type: "tube", rOuter: 0.15, rInner: 0.08, h: 0.24, segments: 22 },
    material: "joint_steel",
    node: fore,
    mate: absMate([0, -KJ.FOREARM_L, 0], [0, 0, 90]),
  });
  builder.add({
    id: pid(A, `arm_hand_clevis_${side}`),
    name_cn: "手叉耳",
    name_en: "hand clevis",
    assembly: A,
    layer: 1,
    geometry: { type: "box", w: 0.025, h: 0.22, d: 0.24, bevel: 0.008 },
    material: "silver_dark",
    node: hand,
    mate: absMate([0, -0.1, 0]),
    instances: 2,
    indexed: true,
    instance_layout: "kjHandClevis",
  });
  builder.add({
    id: pid(A, `arm_palm_${side}`),
    name_cn: "掌座",
    name_en: "palm block",
    assembly: A,
    layer: 1,
    geometry: { type: "box", w: 0.46, h: 0.2, d: 0.36, bevel: 0.03 },
    material: "silver_dark",
    node: hand,
    mate: absMate([0, -0.32, 0]),
  });
  builder.add({
    id: pid(A, `arm_palm_plate_${side}`),
    name_cn: "掌背甲",
    name_en: "palm back plate",
    assembly: A,
    layer: 4,
    geometry: { type: "kit", kit: "kjChamferPlate", params: { w: 0.4, h: 0.16, t: 0.02, corner: 0.04 } },
    material: "silver",
    node: hand,
    mate: absMate([0, -0.32, -0.195]),
  });

  for (let finger = 0; finger < 3; finger++) {
    const fingerNode = `finger_${side}_${finger}`;
    const prefix = pid(A, `arm_finger_${finger + 1}_${side}`);
    builder.add({
      id: `${prefix}_proximal`,
      name_cn: `第 ${finger + 1} 指近节`,
      name_en: `finger ${finger + 1} proximal`,
      assembly: A,
      layer: 1,
      geometry: { type: "box", w: 0.09, h: 0.17, d: 0.095, bevel: 0.012 },
      material: "silver",
      node: fingerNode,
      mate: absMate([0, -0.085, 0]),
    });
    builder.add({
      id: `${prefix}_middle`,
      name_cn: `第 ${finger + 1} 指中节`,
      name_en: `finger ${finger + 1} middle`,
      assembly: A,
      layer: 1,
      geometry: { type: "box", w: 0.085, h: 0.15, d: 0.085, bevel: 0.01 },
      material: "silver_dark",
      node: fingerNode,
      mate: absMate([0, -0.25, 0]),
    });
    builder.add({
      id: `${prefix}_distal`,
      name_cn: `第 ${finger + 1} 指末节`,
      name_en: `finger ${finger + 1} distal`,
      assembly: A,
      layer: 1,
      geometry: { type: "box", w: 0.075, h: 0.12, d: 0.075, bevel: 0.01 },
      material: "silver",
      node: fingerNode,
      mate: absMate([0, -0.39, 0]),
    });
    builder.add({
      id: `${prefix}_claw`,
      name_cn: `第 ${finger + 1} 爪尖`,
      name_en: `finger ${finger + 1} claw`,
      assembly: A,
      layer: 5,
      geometry: { type: "cylinder", r: 0.04, rTop: 0.002, h: 0.1, segments: 12 },
      material: "gold",
      node: fingerNode,
      mate: absMate([0, -0.52, 0], [180, 0, 0]),
    });
    builder.add({
      id: `${prefix}_tendon`,
      name_cn: `第 ${finger + 1} 指驱动腱`,
      name_en: `finger ${finger + 1} tendon`,
      assembly: A,
      layer: 2,
      geometry: {
        type: "weld",
        from: [0, -0.02, -0.065],
        to: [0, -0.43, -0.065],
        radius: 0.008,
        seed: 21,
      },
      material: "rubber",
      node: fingerNode,
      mate: absMate([0, 0, 0]),
    });
  }

  for (const spec of HYDRAULICS.filter(
    (item) => item.side === side && (item.id === "shoulder_main" || item.id === "elbow_main"),
  )) {
    addHydraulic(builder, spec);
  }
}

export function addChestParts(builder: KingJoeParts): void {
  addChestShell(builder);
  addArm(builder, "l");
  addArm(builder, "r");
}
