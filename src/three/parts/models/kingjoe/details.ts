import { KJ } from "./constants";
import type { Side } from "./rig";
import { KingJoeParts, boltRingPart, mateAt, pid, rivetStripPart } from "./helpers";

// ============================================================================
// models/kingjoe/details —— L4/L5 表面细节（第二轮细节补全）
//
// 目的：把四体从「机构完整」补到「表面也有 T-800 级的接缝/紧固件/散热片密度」。
// 所有细节都贴在既有装甲面外侧 2–10mm，不改变任何机构；新增件全部是独立 partId，
// 不是合并进装甲的装饰。放置原则：
//   · 只贴外表面（背/前/侧/顶），不进入对接面或关节行程；
//   · 与母面留 2–10mm，支撑检测有邻居、穿模检测不重叠；
//   · 细长接缝用黑金属，徽章/环带用金，能量缝用发光材质。
// ============================================================================

function shipWorld(x: number, y: number, z: number): [number, number, number] {
  return [x, KJ.SHIP_Y + y, z];
}

function stomachWorld(x: number, y: number, z: number): [number, number, number] {
  return [x, KJ.STOMACH_Y + y, z];
}

function chestWorld(x: number, y: number, z: number): [number, number, number] {
  return [x, KJ.CHEST_Y + y, z];
}

function box(
  builder: KingJoeParts,
  options: {
    id: string;
    name_cn: string;
    name_en: string;
    assembly: string;
    node: string;
    world: [number, number, number];
    size: [number, number, number];
    rotation?: [number, number, number];
    material: string;
    layer: 4 | 5;
  },
): void {
  builder.add({
    id: pid(options.assembly, options.id),
    name_cn: options.name_cn,
    name_en: options.name_en,
    assembly: options.assembly,
    layer: options.layer,
    geometry: {
      type: "box",
      w: options.size[0],
      h: options.size[1],
      d: options.size[2],
      bevel: Math.min(0.004, Math.min(...options.size) * 0.2),
    },
    material: options.material,
    node: options.node,
    mate: mateAt(options.node, options.world, options.rotation),
  });
}

/** 单件金质徽章：底盘 + 外环 + 十字（面朝 +Z 时 rotation X=90°）。 */
function emblem(
  builder: KingJoeParts,
  options: {
    id: string;
    name_cn: string;
    name_en: string;
    assembly: string;
    node: string;
    world: [number, number, number];
    rotation?: [number, number, number];
    size?: number;
  },
): void {
  const r = options.size ?? 0.1;
  builder.add({
    id: pid(options.assembly, options.id),
    name_cn: options.name_cn,
    name_en: options.name_en,
    assembly: options.assembly,
    layer: 5,
    geometry: {
      type: "merge",
      parts: [
        { type: "cylinder", r: r, h: 0.014, segments: 28 },
        { type: "tube", rOuter: r, rInner: r * 0.78, h: 0.018, segments: 28 },
        { type: "box", w: r * 1.5, h: 0.012, d: r * 0.22, bevel: 0.002 },
        { type: "box", w: r * 0.22, h: 0.012, d: r * 1.5, bevel: 0.002 },
      ],
    },
    material: "gold",
    node: options.node,
    mate: mateAt(options.node, options.world, options.rotation ?? [90, 0, 0]),
  });
}

export function addShipDetails(builder: KingJoeParts): void {
  const A = "ship";

  // 背部 7 条纵向接缝（背板外 5mm）
  for (let i = 0; i < 7; i++) {
    const x = -0.54 + i * 0.18;
    box(builder, {
      id: `seam_back_${i}`,
      name_cn: "头背接缝",
      name_en: "skull back seam",
      assembly: A,
      node: A,
      world: shipWorld(x, 0.6, -0.59),
      size: [0.024, 0.4, 0.018],
      material: "black_metal",
      layer: 4,
    });
  }
  // 头顶 3 条横向接缝
  for (let i = 0; i < 3; i++) {
    const z = -0.42 + i * 0.12;
    box(builder, {
      id: `seam_top_${i}`,
      name_cn: "头顶接缝",
      name_en: "crown top seam",
      assembly: A,
      node: A,
      world: shipWorld(0, 0.905, z),
      size: [0.8, 0.014, 0.03],
      material: "black_metal",
      layer: 4,
    });
  }
  // 面部两侧接缝（4 条）
  for (const [suffix, sx] of [
    ["l", -1],
    ["r", 1],
  ] as const) {
    for (let i = 0; i < 2; i++) {
      box(builder, {
        id: `seam_face_${suffix}_${i}`,
        name_cn: "面部接缝",
        name_en: "face panel seam",
        assembly: A,
        node: A,
        world: shipWorld(sx * 0.55, 0.32 + i * 0.11, 0.6),
        size: [0.028, 0.08, 0.018],
        material: "black_metal",
        layer: 4,
      });
    }
  }
  // 头侧 4 条接缝
  for (const [suffix, sx] of [
    ["l", -1],
    ["r", 1],
  ] as const) {
    for (let i = 0; i < 2; i++) {
      box(builder, {
        id: `seam_cheek_${suffix}_${i}`,
        name_cn: "头侧接缝",
        name_en: "cheek panel seam",
        assembly: A,
        node: A,
        world: shipWorld(sx * 0.715, 0.42 + i * 0.3, i === 0 ? 0.18 : -0.18),
        size: [0.018, 0.25, 0.038],
        material: "black_metal",
        layer: 4,
      });
    }
  }
  // 耳荚端盖/散热口
  for (const [suffix, sx] of [
    ["l", -1],
    ["r", 1],
  ] as const) {
    builder.add({
      id: pid(A, `ear_cap_${suffix}`),
      name_cn: "耳荚端盖",
      name_en: "ear pod cap",
      assembly: A,
      layer: 4,
      geometry: { type: "cylinder", r: 0.1, h: 0.03, segments: 24, bevel: 0.005 },
      material: "silver_dark",
      node: A,
      mate: mateAt(A, shipWorld(sx * 0.89, 0.62, 0), [0, 0, 90]),
    });
    builder.add({
      id: pid(A, `ear_vent_${suffix}`),
      name_cn: "耳荚散热口",
      name_en: "ear pod vent",
      assembly: A,
      layer: 5,
      geometry: { type: "cylinder", r: 0.04, h: 0.05, segments: 14, bevel: 0.003 },
      material: "sensor_red",
      node: A,
      mate: mateAt(A, shipWorld(sx * 0.93, 0.62, 0), [0, 0, 90]),
    });
    boltRingPart(builder, {
      id: pid(A, `ear_cap_bolts_${suffix}`),
      name_cn: "耳荚端盖螺栓",
      name_en: "ear cap bolts",
      assembly: A,
      node: A,
      world: shipWorld(sx * 0.915, 0.62, 0),
      rotation: [0, 0, -90],
      count: 8,
      radius: 0.07,
      boltR: 0.008,
      boltH: 0.01,
      layer: 4,
    });
  }
  // 颈圈上下两圈紧固件
  boltRingPart(builder, {
    id: pid(A, "neck_bolts_upper"),
    name_cn: "颈圈上螺栓圈",
    name_en: "neck upper bolts",
    assembly: A,
    node: A,
    world: shipWorld(0, 0.203, 0),
    count: 20,
    radius: 0.86,
    boltR: 0.009,
    boltH: 0.012,
    layer: 4,
  });
  boltRingPart(builder, {
    id: pid(A, "neck_bolts_lower"),
    name_cn: "颈圈下螺栓圈",
    name_en: "neck lower bolts",
    assembly: A,
    node: A,
    world: shipWorld(0, 0.178, 0),
    count: 12,
    radius: 0.94,
    boltR: 0.01,
    boltH: 0.013,
    layer: 4,
  });
  // 颈部左右作动器
  for (const [suffix, sx] of [
    ["l", -1],
    ["r", 1],
  ] as const) {
    builder.add({
      id: pid(A, `neck_actuator_${suffix}`),
      name_cn: "颈部作动器",
      name_en: "neck actuator",
      assembly: A,
      layer: 2,
      geometry: { type: "cylinder", r: 0.03, h: 0.08, segments: 14, bevel: 0.003 },
      material: "joint_steel",
      node: A,
      mate: mateAt(A, shipWorld(sx * 0.75, 0.235, 0.42)),
    });
  }
  // 天线基座
  for (const [suffix, sx] of [
    ["l", -1],
    ["r", 1],
  ] as const) {
    builder.add({
      id: pid(A, `antenna_base_${suffix}`),
      name_cn: "天线基座",
      name_en: "antenna base",
      assembly: A,
      layer: 4,
      geometry: { type: "tube", rOuter: 0.04, rInner: 0.015, h: 0.05, segments: 16 },
      material: "gold_dark",
      node: A,
      mate: mateAt(A, shipWorld(sx * 0.55, 0.985, -0.1)),
    });
  }
  // 冠鳍两端支架 + 顶部金条
  for (const [suffix, sx] of [
    ["l", -1],
    ["r", 1],
  ] as const) {
    box(builder, {
      id: `crest_bracket_${suffix}`,
      name_cn: "冠鳍端支架",
      name_en: "crest end bracket",
      assembly: A,
      node: A,
      world: shipWorld(sx * 0.46, 0.955, 0.06),
      size: [0.05, 0.12, 0.24],
      material: "gold_dark",
      layer: 4,
    });
  }
  box(builder, {
    id: "crest_gold_strip",
    name_cn: "冠鳍顶金条",
    name_en: "crest gold strip",
    assembly: A,
    node: A,
    world: shipWorld(0, 1.115, 0.06),
    size: [0.8, 0.02, 0.04],
    material: "gold",
    layer: 5,
  });
  // 顶部小传感器罩
  builder.add({
    id: pid(A, "top_sensor_dome"),
    name_cn: "顶部传感器罩",
    name_en: "top sensor dome",
    assembly: A,
    layer: 4,
    geometry: { type: "sphere", r: 0.05, segments: 16 },
    material: "sensor_red",
    node: A,
    mate: mateAt(A, shipWorld(0, 0.95, -0.49)),
  });
  // 面部下方散热口 + 两侧铆钉
  box(builder, {
    id: "face_vent",
    name_cn: "面部下散热口",
    name_en: "lower face vent",
    assembly: A,
    node: A,
    world: shipWorld(0, 0.32, 0.6),
    size: [0.5, 0.05, 0.018],
    material: "black_metal",
    layer: 4,
  });
  for (const [suffix, sx] of [
    ["l", -1],
    ["r", 1],
  ] as const) {
    rivetStripPart(builder, {
      id: pid(A, `face_rivets_${suffix}`),
      name_cn: "面侧铆钉",
      name_en: "face side rivets",
      assembly: A,
      node: A,
      world: shipWorld(sx * 0.35, 0.47, 0.6),
      count: 3,
      spacing: 0.06,
      rotation: [90, 0, 0],
      layer: 4,
    });
  }
  // 眼带上下压条
  for (const [suffix, y] of [
    ["top", 0.745],
    ["bottom", 0.54],
  ] as const) {
    box(builder, {
      id: `visor_rail_${suffix}`,
      name_cn: "眼带压条",
      name_en: "visor rail",
      assembly: A,
      node: A,
      world: shipWorld(0, y, 0.63),
      size: [0.9, 0.02, 0.02],
      material: "silver_bright",
      layer: 4,
    });
  }
  // 面颊传感器
  for (const [suffix, sx] of [
    ["l", -1],
    ["r", 1],
  ] as const) {
    builder.add({
      id: pid(A, `cheek_sensor_${suffix}`),
      name_cn: "面颊传感器",
      name_en: "cheek sensor",
      assembly: A,
      layer: 4,
      geometry: { type: "cylinder", r: 0.04, h: 0.05, segments: 14, bevel: 0.003 },
      material: "sensor_red",
      node: A,
      mate: mateAt(A, shipWorld(sx * 0.73, 0.42, 0.45), [0, 0, 90]),
    });
  }
  // 顶部金徽（身份）
  box(builder, {
    id: "crest_badge_plate",
    name_cn: "头顶金徽板",
    name_en: "crown badge plate",
    assembly: A,
    node: A,
    world: shipWorld(0, 0.91, 0.35),
    size: [0.22, 0.018, 0.12],
    material: "gold",
    layer: 5,
  });
  // 颈部能量缝（左右各一）
  for (const [suffix, sx] of [
    ["l", -1],
    ["r", 1],
  ] as const) {
    box(builder, {
      id: `neck_glow_${suffix}`,
      name_cn: "颈部能量缝",
      name_en: "neck glow seam",
      assembly: A,
      node: A,
      world: shipWorld(sx * 0.93, 0.06, 0.3),
      size: [0.012, 0.05, 0.3],
      material: "seam_glow",
      layer: 5,
    });
  }
}

export function addStomachDetails(builder: KingJoeParts): void {
  const A = "stomach";
  const U = "waist";
  // 腹前 5 条纵向接缝
  for (const [i, x] of [-0.32, -0.16, 0.16, 0.32].entries()) {
    box(builder, {
      id: `seam_front_${i}`,
      name_cn: "腹前接缝",
      name_en: "abdomen front seam",
      assembly: A,
      node: U,
      world: stomachWorld(x, 0.85, 0.565),
      size: [0.022, 0.2, 0.018],
      material: "black_metal",
      layer: 4,
    });
  }
  // 腹后 5 条
  for (let i = 0; i < 5; i++) {
    const x = -0.32 + i * 0.16;
    box(builder, {
      id: `seam_back_${i}`,
      name_cn: "腹后接缝",
      name_en: "abdomen back seam",
      assembly: A,
      node: U,
      world: stomachWorld(x, 0.85, -0.565),
      size: [0.022, 0.2, 0.018],
      material: "black_metal",
      layer: 4,
    });
  }
  // 腹部四角加强块（贴四根立柱）
  const gussets: Array<[number, number]> = [
    [0.26, 0],
    [-0.26, 0],
    [0, 0.26],
    [0, -0.26],
  ];
  gussets.forEach(([gx, gz], index) => {
    box(builder, {
      id: `abdomen_gusset_${index}`,
      name_cn: "腹框角撑",
      name_en: "abdomen frame gusset",
      assembly: A,
      node: U,
      world: stomachWorld(gx, 0.8, gz),
      size: [0.06, 0.08, 0.06],
      material: "gold_dark",
      layer: 4,
    });
  });
  // 腰顶板装饰 + 两圈紧固件

  // 齿圈检修盖（腹后）
  builder.add({
    id: pid(A, "gear_cover"),
    name_cn: "齿圈检修盖",
    name_en: "ring gear access cover",
    assembly: A,
    layer: 4,
    geometry: { type: "kit", kit: "kjChamferPlate", params: { w: 0.44, h: 0.18, t: 0.03, corner: 0.05 } },
    material: "silver_dark",
    node: A,
    mate: mateAt(A, stomachWorld(0, 0.43, 0.69)),
  });
  for (const [suffix, sx] of [
    ["l", -1],
    ["r", 1],
  ] as const) {
    box(builder, {
      id: `gear_cover_bracket_${suffix}`,
      name_cn: "齿圈检修盖卡扣",
      name_en: "gear cover latch",
      assembly: A,
      node: A,
      world: stomachWorld(sx * 0.18, 0.43, 0.72),
      size: [0.04, 0.04, 0.02],
      material: "gold_dark",
      layer: 4,
    });
  }
  // 腹部传感器 + 徽章 + 能量缝
  for (const [suffix, sx] of [
    ["l", -1],
    ["r", 1],
  ] as const) {
    builder.add({
      id: pid(A, `belly_sensor_${suffix}`),
      name_cn: "腹部传感器",
      name_en: "abdomen sensor",
      assembly: A,
      layer: 4,
      geometry: { type: "cylinder", r: 0.04, h: 0.05, segments: 14, bevel: 0.003 },
      material: "sensor_red",
      node: U,
      mate: mateAt(U, stomachWorld(sx * 0.4, 0.92, 0.59), [90, 0, 0]),
    });
  }
  emblem(builder, {
    id: "belly_emblem",
    name_cn: "佩丹星腹部徽章",
    name_en: "Pedan abdomen emblem",
    assembly: A,
    node: U,
    world: stomachWorld(0, 0.85, 0.57),
    size: 0.1,
  });
  for (const [suffix, sx] of [
    ["l", -1],
    ["r", 1],
  ] as const) {
    box(builder, {
      id: `belly_glow_${suffix}`,
      name_cn: "腹部能量缝",
      name_en: "abdomen glow seam",
      assembly: A,
      node: U,
      world: stomachWorld(sx * 0.12, 0.85, 0.56),
      size: [0.008, 0.2, 0.01],
      material: "seam_glow",
      layer: 5,
    });
  }
  // 髋部护板 + 侧面检修口 + 背部螺栓圈
  for (const [suffix, sx] of [
    ["l", -1],
    ["r", 1],
  ] as const) {
    box(builder, {
      id: `front_trim_${suffix}`,
      name_cn: "腹前金饰条",
      name_en: "abdomen front trim",
      assembly: A,
      node: U,
      world: stomachWorld(sx * 0.42, 0.7, 0.565),
      size: [0.03, 0.15, 0.02],
      material: "gold_dark",
      layer: 5,
    });
    box(builder, {
      id: `side_access_${suffix}`,
      name_cn: "腹侧检修口",
      name_en: "side access panel",
      assembly: A,
      node: U,
      world: stomachWorld(sx * 0.57, 0.85, -0.35),
      size: [0.016, 0.18, 0.12],
      material: "black_metal",
      layer: 4,
    });
  }
  boltRingPart(builder, {
    id: pid(A, "back_bolts"),
    name_cn: "腹后螺栓圈",
    name_en: "abdomen back bolts",
    assembly: A,
    node: U,
    world: stomachWorld(0, 0.78, -0.59),
    rotation: [90, 0, 0],
    count: 10,
    radius: 0.25,
    boltR: 0.009,
    boltH: 0.012,
    layer: 4,
  });
  // 下端腹板
  box(builder, {
    id: "lower_belly_plate",
    name_cn: "下腹板",
    name_en: "lower belly plate",
    assembly: A,
    node: U,
    world: stomachWorld(0, 0.715, 0.565),
    size: [0.4, 0.05, 0.018],
    material: "silver_dark",
    layer: 4,
  });
  box(builder, {
    id: "back_center_trim",
    name_cn: "腹后中金条",
    name_en: "abdomen back center trim",
    assembly: A,
    node: U,
    world: stomachWorld(0, 0.9, -0.59),
    size: [0.2, 0.04, 0.018],
    material: "gold_dark",
    layer: 5,
  });
  // 腹框上段 4 根纵向角撑（贴四根立柱上半段）
  const upperGussets: Array<[number, number]> = [
    [0.26, 0],
    [-0.26, 0],
    [0, 0.26],
    [0, -0.26],
  ];
  upperGussets.forEach(([gx, gz], index) => {
    box(builder, {
      id: `abdomen_upper_rib_${index}`,
      name_cn: "腹框上段角撑",
      name_en: "abdomen upper frame rib",
      assembly: A,
      node: U,
      world: stomachWorld(gx, 0.9, gz),
      size: [0.04, 0.06, 0.04],
      material: "gold_dark",
      layer: 4,
    });
  });
  // 腰部两侧制动块（贴齿圈外缘）
  for (const [suffix, sx] of [
    ["l", -1],
    ["r", 1],
  ] as const) {
    box(builder, {
      id: `waist_brake_${suffix}`,
      name_cn: "腰部制动块",
      name_en: "waist brake shoe",
      assembly: A,
      node: A,
      world: stomachWorld(sx * 0.7, 0.43, 0),
      size: [0.05, 0.1, 0.08],
      material: "silver_dark",
      layer: 4,
    });
  }
  // 下腹板前方两只小传感器
  for (const [suffix, sx] of [
    ["l", -1],
    ["r", 1],
  ] as const) {
    builder.add({
      id: pid(A, `lower_sensor_${suffix}`),
      name_cn: "下腹传感器",
      name_en: "lower belly sensor",
      assembly: A,
      layer: 4,
      geometry: { type: "cylinder", r: 0.025, h: 0.04, segments: 12, bevel: 0.002 },
      material: "sensor_red",
      node: U,
      mate: mateAt(U, stomachWorld(sx * 0.12, 0.715, 0.6), [90, 0, 0]),
    });
  }
  // 腰部锁销
  builder.add({
    id: pid(A, "waist_lock_pin"),
    name_cn: "腰锁销",
    name_en: "waist lock pin",
    assembly: A,
    layer: 2,
    geometry: { type: "cylinder", r: 0.025, h: 0.05, segments: 12, bevel: 0.002 },
    material: "silver_bright",
    node: U,
    mate: mateAt(U, stomachWorld(0.2, 0.708, 0.1)),
  });
  // 腹后两侧铆钉
  for (const [suffix, sx] of [
    ["l", -1],
    ["r", 1],
  ] as const) {
    rivetStripPart(builder, {
      id: pid(A, `back_rivets_${suffix}`),
      name_cn: "腹后铆钉",
      name_en: "abdomen back rivets",
      assembly: A,
      node: U,
      world: stomachWorld(sx * 0.3, 0.9, -0.59),
      count: 3,
      spacing: 0.06,
      rotation: [-90, 0, 0],
      layer: 4,
    });
  }
}

export function addChestDetails(builder: KingJoeParts): void {
  const A = "chest";
  // 肩鼓四道束带
  for (const [suffix, sx] of [
    ["l", -1],
    ["r", 1],
  ] as const) {
    for (const x of [1.32, 1.9]) {
      builder.add({
        id: pid(A, `pod_band_${suffix}_${x === 1.32 ? "a" : "b"}`),
        name_cn: "肩鼓束带",
        name_en: "shoulder drum band",
        assembly: A,
        layer: 4,
        geometry: { type: "tube", rOuter: 0.515, rInner: 0.492, h: 0.03, segments: 40 },
        material: "silver_bright",
        node: A,
        mate: mateAt(A, chestWorld(sx * x, 1.56, 0), [0, 0, 90]),
      });
    }
  }
  // 肩檐金徽
  for (const [suffix, sx] of [
    ["l", -1],
    ["r", 1],
  ] as const) {
    emblem(builder, {
      id: `shoulder_emblem_${suffix}`,
      name_cn: "佩丹星肩徽",
      name_en: "Pedan shoulder emblem",
      assembly: A,
      node: A,
      world: chestWorld(sx * 1.62, 1.86, 0.55),
      size: 0.09,
    });
  }
  // 颈环两侧能量缝
  for (const [suffix, sx] of [
    ["l", -1],
    ["r", 1],
  ] as const) {
    box(builder, {
      id: `collar_glow_${suffix}`,
      name_cn: "颈环能量缝",
      name_en: "collar glow seam",
      assembly: A,
      node: A,
      world: chestWorld(sx * 0.63, 1.82, 0.1),
      size: [0.012, 0.1, 0.2],
      material: "seam_glow",
      layer: 5,
    });
  }
}

export function addLegDetails(builder: KingJoeParts): void {
  const A = "legs";
  for (const side of ["l", "r"] as const) {
    const s: Side = side;
    const sx = s === "r" ? 1 : -1;
    const legX = KJ.LEG_X * sx;
    // 大腿前甲两条接缝
    for (let i = 0; i < 2; i++) {
      box(builder, {
        id: `thigh_seam_${side}_${i}`,
        name_cn: "大腿甲接缝",
        name_en: "thigh armor seam",
        assembly: A,
        node: `hip_${side}`,
        world: [legX + (i === 0 ? -0.18 : 0.18), 2.4, 0.38],
        size: [0.016, 0.35, 0.018],
        material: "black_metal",
        layer: 4,
      });
    }
    // 小腿前甲两条接缝
    for (let i = 0; i < 2; i++) {
      box(builder, {
        id: `calf_seam_${side}_${i}`,
        name_cn: "小腿甲接缝",
        name_en: "calf armor seam",
        assembly: A,
        node: `knee_${side}`,
        world: [legX + (i === 0 ? -0.16 : 0.16), 1.0, 0.365],
        size: [0.016, 0.3, 0.018],
        material: "black_metal",
        layer: 4,
      });
    }
    // 髋荚束带
    builder.add({
      id: pid(A, `hip_band_${side}`),
      name_cn: "髋荚束带",
      name_en: "hip drum band",
      assembly: A,
      layer: 4,
      geometry: { type: "tube", rOuter: 0.43, rInner: 0.402, h: 0.04, segments: 30 },
      material: "gold_dark",
      node: "legs",
      mate: mateAt("legs", [legX + 0.61 * sx, KJ.HIP_Y - 0.26, 0], [0, 0, 90]),
    });
  }
}

export function addKingJoeDetails(builder: KingJoeParts): void {
  addShipDetails(builder);
  addStomachDetails(builder);
  addChestDetails(builder);
  addLegDetails(builder);
}
