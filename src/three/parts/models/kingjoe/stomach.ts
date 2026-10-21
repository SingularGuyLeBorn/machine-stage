import {
  KingJoeParts,
  addAntigravity,
  addNozzles,
  boltRingPart,
  absMate,
  pid,
  rivetStripPart,
} from "./helpers";

// ============================================================================
// models/kingjoe/stomach —— King Stomach（腹部飞船）
//
// 腰部是整台机器人的第二自由度：外露的腰鼓、上下轴承、齿圈、减速器、编码器、
// 密封圈逐件；腹部外壳用四立柱框而不是实心块，侧面格栅能看见反重力线圈。
// 对接：腹部底面是插入腿部的上模块（锥销/锁环），顶面是承接胸部的下模块
// （环座/锥销座/锁钩）；两侧各 2 只喷口。
// ============================================================================

export function addStomachParts(builder: KingJoeParts): void {
  const A = "stomach";
  const U = "waist";
  const upperMate = (p: [number, number, number], r?: [number, number, number]) =>
    absMate([p[0], p[1] - 0.49, p[2]], r);

  // —— 腰鼓 / 轴承 / 齿圈 / 驱动 ——
  builder.add({
    id: pid(A, "waist_drum"),
    name_cn: "腰鼓",
    name_en: "waist drum",
    assembly: A,
    layer: 1,
    geometry: { type: "tube", rOuter: 0.4, rInner: 0.18, h: 0.24, segments: 36 },
    material: "silver_dark",
    node: A,
    mate: absMate([0, 0.48, 0]),
    source: "腰鼓同时是上下轴承内圈与齿圈轮毂；鼓顶降到 0.60，给上盖 4cm 摆动间隙",
  });
  builder.add({
    id: pid(A, "waist_motor"),
    name_cn: "腰部驱动电机",
    name_en: "waist drive motor",
    assembly: A,
    layer: 2,
    geometry: { type: "cylinder", r: 0.11, h: 0.26, segments: 20, bevel: 0.006 },
    material: "joint_steel",
    node: A,
    mate: absMate([0, 0.49, 0]),
  });
  builder.add({
    id: pid(A, "waist_motor_mount"),
    name_cn: "电机安装环",
    name_en: "motor mount ring",
    assembly: A,
    layer: 2,
    geometry: { type: "tube", rOuter: 0.178, rInner: 0.112, h: 0.04, segments: 24 },
    material: "gold_dark",
    node: A,
    mate: absMate([0, 0.61, 0]),
  });
  builder.add({
    id: pid(A, "waist_reducer"),
    name_cn: "腰部减速器",
    name_en: "waist reducer",
    assembly: A,
    layer: 2,
    geometry: { type: "tube", rOuter: 0.178, rInner: 0.112, h: 0.08, segments: 20 },
    material: "copper",
    node: A,
    mate: absMate([0, 0.38, 0]),
  });
  builder.add({
    id: pid(A, "waist_encoder"),
    name_cn: "腰部编码器",
    name_en: "waist encoder",
    assembly: A,
    layer: 2,
    geometry: { type: "cylinder", r: 0.065, h: 0.035, segments: 16, bevel: 0.003 },
    material: "sensor_red",
    node: A,
    mate: absMate([0, 0.6, 0]),
  });
  builder.add({
    id: pid(A, "waist_bearing_lower"),
    name_cn: "腰部下轴承",
    name_en: "waist lower bearing",
    assembly: A,
    layer: 2,
    geometry: { type: "tube", rOuter: 0.5, rInner: 0.405, h: 0.05, segments: 32 },
    material: "joint_steel",
    node: A,
    mate: absMate([0, 0.37, 0]),
  });
  builder.add({
    id: pid(A, "waist_bearing_upper"),
    name_cn: "腰部上轴承",
    name_en: "waist upper bearing",
    assembly: A,
    layer: 2,
    geometry: { type: "tube", rOuter: 0.5, rInner: 0.405, h: 0.05, segments: 32 },
    material: "joint_steel",
    node: A,
    mate: absMate([0, 0.56, 0]),
  });
  builder.add({
    id: pid(A, "waist_gear"),
    name_cn: "腰部齿圈",
    name_en: "waist ring gear",
    assembly: A,
    layer: 2,
    geometry: { type: "tube", rOuter: 0.62, rInner: 0.405, h: 0.06, segments: 40 },
    material: "silver_worn",
    node: A,
    mate: absMate([0, 0.43, 0]),
  });
  builder.add({
    id: pid(A, "waist_gear_teeth"),
    name_cn: "腰部齿圈齿",
    name_en: "waist gear teeth",
    assembly: A,
    layer: 5,
    geometry: { type: "tube", rOuter: 0.665, rInner: 0.622, h: 0.07, segments: 40 },
    material: "gold",
    node: A,
    mate: absMate([0, 0.43, 0]),
  });
  builder.add({
    id: pid(A, "waist_seal_lower"),
    name_cn: "腰部下密封",
    name_en: "waist seal lower",
    assembly: A,
    layer: 4,
    geometry: { type: "kit", kit: "kjTorus", params: { radius: 0.422, tube: 0.01, segments: 32 } },
    material: "rubber",
    node: A,
    mate: absMate([0, 0.308, 0]),
  });
  builder.add({
    id: pid(A, "waist_seal_upper"),
    name_cn: "腰部上密封",
    name_en: "waist seal upper",
    assembly: A,
    layer: 4,
    geometry: { type: "kit", kit: "kjTorus", params: { radius: 0.422, tube: 0.01, segments: 32 } },
    material: "rubber",
    node: A,
    mate: absMate([0, 0.6, 0]),
  });
  builder.add({
    id: pid(A, "waist_flange"),
    name_cn: "腰鼓下法兰",
    name_en: "waist lower flange",
    assembly: A,
    layer: 1,
    geometry: { type: "cylinder", r: 0.52, h: 0.06, segments: 36, bevel: 0.008 },
    material: "silver_dark",
    node: A,
    mate: absMate([0, 0.308, 0]),
  });
  builder.add({
    id: pid(A, "waist_top_plate"),
    name_cn: "腰鼓上盖",
    name_en: "waist upper plate",
    assembly: A,
    layer: 1,
    geometry: { type: "cylinder", r: 0.52, h: 0.04, segments: 36, bevel: 0.006 },
    material: "silver",
    node: U,
    mate: upperMate([0, 0.662, 0]),
  });
  boltRingPart(builder, {
    id: pid(A, "waist_bolts"),
    name_cn: "腰盖螺栓圈",
    name_en: "waist cap bolts",
    assembly: A,
    node: U,
    world: [0, 3.68 + 0.682, 0],
    count: 16,
    radius: 0.42,
    boltR: 0.011,
    boltH: 0.014,
    layer: 4,
  });

  // —— 腹部骨架：四立柱 + 上下框（中间留给反重力发生器）——
  builder.add({
    id: pid(A, "abdomen_post"),
    name_cn: "腹部立柱",
    name_en: "abdomen frame post",
    assembly: A,
    layer: 1,
    geometry: { type: "cylinder", r: 0.045, h: 0.27, segments: 14 },
    material: "joint_steel",
    node: U,
    mate: upperMate([0, 0.82, 0]),
    instances: 4,
    indexed: true,
    instance_layout: "kjAgPosts",
  });
  builder.add({
    id: pid(A, "abdomen_top_ring"),
    name_cn: "腹部上框",
    name_en: "abdomen top ring",
    assembly: A,
    layer: 1,
    geometry: { type: "tube", rOuter: 0.5, rInner: 0.34, h: 0.04, segments: 32 },
    material: "silver_dark",
    node: U,
    mate: upperMate([0, 0.945, 0]),
  });
  builder.add({
    id: pid(A, "abdomen_top_plate"),
    name_cn: "腹部顶承盘",
    name_en: "abdomen top plate",
    assembly: A,
    layer: 1,
    geometry: { type: "cylinder", r: 0.78, h: 0.03, segments: 40, bevel: 0.004 },
    material: "silver_dark",
    node: U,
    mate: upperMate([0, 0.98, 0]),
    hint: "承托胸部对接基盘；基盘底面 y=1.0",
  });

  // —— 腹部外壳（前后左右装甲板 + 侧格栅）——
  builder.add({
    id: pid(A, "abdomen_front"),
    name_cn: "腹前装甲",
    name_en: "abdomen front armor",
    assembly: A,
    layer: 4,
    geometry: { type: "kit", kit: "kjChamferPlate", params: { w: 0.86, h: 0.22, t: 0.045, corner: 0.08 } },
    material: "silver",
    node: U,
    mate: upperMate([0, 0.85, 0.53]),
  });
  builder.add({
    id: pid(A, "abdomen_back"),
    name_cn: "腹后装甲",
    name_en: "abdomen rear armor",
    assembly: A,
    layer: 4,
    geometry: { type: "kit", kit: "kjChamferPlate", params: { w: 0.8, h: 0.22, t: 0.04, corner: 0.08 } },
    material: "silver_dark",
    node: U,
    mate: upperMate([0, 0.85, -0.53]),
  });
  builder.add({
    id: pid(A, "abdomen_side"),
    name_cn: "腹侧装甲",
    name_en: "abdomen side armor",
    assembly: A,
    layer: 4,
    geometry: { type: "kit", kit: "kjChamferPlate", params: { w: 0.62, h: 0.22, t: 0.04, corner: 0.08 } },
    material: "silver",
    node: U,
    mate: upperMate([0, 0.82, 0]),
    instances: 2,
    indexed: true,
    instance_layout: "kjSidePanels",
  });
  builder.add({
    id: pid(A, "abdomen_louver"),
    name_cn: "腹侧散热格栅",
    name_en: "abdomen side louver",
    assembly: A,
    layer: 4,
    geometry: { type: "louver", count: 6, w: 0.3, h: 0.24, slantDeg: 35, t: 0.008 },
    material: "black_metal",
    node: U,
    mate: upperMate([0, 0.82, 0]),
    instances: 2,
    indexed: true,
    instance_layout: "kjSideLouvers",
  });
  rivetStripPart(builder, {
    id: pid(A, "abdomen_rivets"),
    name_cn: "腹甲铆钉",
    name_en: "abdomen rivets",
    assembly: A,
    node: U,
    world: [-0.3, 3.68 + 0.95, 0.554],
    count: 4,
    spacing: 0.08,
    rotation: [90, 0, 0],
  });
  boltRingPart(builder, {
    id: pid(A, "abdomen_top_bolts"),
    name_cn: "腹顶螺栓圈",
    name_en: "abdomen top bolts",
    assembly: A,
    node: U,
    world: [0, 3.68 + 1.013, 0],
    count: 12,
    radius: 0.66,
    boltR: 0.012,
    boltH: 0.016,
    layer: 4,
  });

  addAntigravity(builder, A, [0, 0.5, 0], 0.4, U);
  addNozzles(builder, A, { parentNode: U, yOffset: -0.49 });
}
