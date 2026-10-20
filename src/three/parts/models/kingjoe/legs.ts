import { KJ } from "./constants";
import { HYDRAULICS, jointOrigin, type Side, type Vec3 } from "./rig";
import {
  KingJoeParts,
  absMate,
  addHydraulic,
  addNozzles,
  addAntigravity,
  boltRingPart,
  local,
  mateAt,
  pid,
  rivetStripPart,
  tubeBetween,
} from "./helpers";

// ============================================================================
// models/kingjoe/legs —— King Legs（腿部飞船）
//
// 造型（refs/kingjoe-official-list.jpg / kingjoe-55th.jpg）：
//   短粗双腿、鼓形髋荚、金色膝甲、粗圆小腿、上翘宽足；银色大块装甲 + 黑缝。
// 机构：
//   髋球在髋座内（1cm 油膜间隙）、膝球在膝筒内、踝筒在足毂内；
//   髋/膝/踝各一根真实液压缸（缸体、活塞、活塞杆、耳环、销轴逐件），
//   行走时活塞杆按关节角真实伸缩。
// ============================================================================

const LEGS_COMMON = "legs";

function addLegStructure(builder: KingJoeParts, side: Side): void {
  const s = side === "r" ? 1 : -1;
  const joints = jointOrigin(side);
  const hip = `hip_${side}`;
  const knee = `knee_${side}`;
  const ankle = `ankle_${side}`;
  const legX = KJ.LEG_X * s;

  // —— 髋：球头 / 髋座 / 压环 / 鼓形髋荚 ——
  builder.add({
    id: pid("legs", `hip_socket_${side}`),
    name_cn: "髋座",
    name_en: "hip socket",
    assembly: "legs",
    layer: 1,
    geometry: { type: "tube", rOuter: 0.34, rInner: 0.24, h: 0.34, segments: 28 },
    material: "joint_steel",
    node: "legs",
    mate: mateAt("legs", [legX, KJ.HIP_Y, 0], [0, 0, 90]),
    hint: "球头半径 230mm，髋座内孔 240mm —— 单边 10mm 油膜间隙",
  });
  builder.add({
    id: pid("legs", `hip_ball_${side}`),
    name_cn: "髋轴头",
    name_en: "hip spool",
    assembly: "legs",
    layer: 1,
    geometry: { type: "cylinder", r: 0.23, h: 0.3, segments: 28, bevel: 0.02 },
    material: "silver_bright",
    node: hip,
    mate: mateAt(hip, [legX, KJ.HIP_Y, 0], [0, 0, 90]),
    hint: "髋轴头 460mm 装在髋座 480mm 内孔，单边 10mm 油膜；髋座长 340mm 让轴头两端各留 20mm",
  });
  builder.add({
    id: pid("legs", `hip_pod_${side}`),
    name_cn: "髋荚鼓筒",
    name_en: "hip drum",
    assembly: "legs",
    layer: 4,
    geometry: { type: "cylinder", r: 0.4, h: 0.36, segments: 30, bevel: 0.02 },
    material: "silver",
    node: "legs",
    mate: mateAt("legs", [legX + 0.61 * s, KJ.HIP_Y - 0.26, 0], [0, 0, 90]),
  });
  builder.add({
    id: pid("legs", `hip_pod_cap_${side}`),
    name_cn: "髋荚端盖",
    name_en: "hip drum cap",
    assembly: "legs",
    layer: 4,
    geometry: { type: "cylinder", r: 0.34, h: 0.06, segments: 30, bevel: 0.012 },
    material: "silver_dark",
    node: "legs",
    mate: mateAt("legs", [legX + 0.82 * s, KJ.HIP_Y - 0.26, 0], [0, 0, 90]),
  });
  builder.add({
    id: pid("legs", `hip_pod_rim_${side}`),
    name_cn: "髋荚金环",
    name_en: "hip drum gold rim",
    assembly: "legs",
    layer: 5,
    geometry: { type: "tube", rOuter: 0.432, rInner: 0.404, h: 0.055, segments: 30 },
    material: "gold",
    node: "legs",
    mate: mateAt("legs", [legX + 0.4 * s, KJ.HIP_Y - 0.26, 0], [0, 0, 90]),
  });
  builder.add({
    id: pid("legs", `hip_axle_${side}`),
    name_cn: "髋荚短轴",
    name_en: "hip drum axle",
    assembly: "legs",
    layer: 1,
    geometry: { type: "cylinder", r: 0.08, h: 0.06, segments: 18, bevel: 0.004 },
    material: "joint_steel",
    node: "legs",
    mate: mateAt("legs", [legX + 0.4 * s, KJ.HIP_Y - 0.26, 0], [0, 0, 90]),
  });
  boltRingPart(builder, {
    id: pid("legs", `hip_pod_bolts_${side}`),
    name_cn: "髋荚螺栓圈",
    name_en: "hip drum bolts",
    assembly: "legs",
    node: "legs",
    world: [legX + 0.868 * s, KJ.HIP_Y - 0.26, 0],
    rotation: [0, 0, -90],
    count: 12,
    radius: 0.27,
    layer: 4,
  });

  builder.add({
    id: pid("legs", `thigh_bone_${side}`),
    name_cn: "股骨主筒",
    name_en: "thigh main cylinder",
    assembly: "legs",
    layer: 1,
    geometry: { type: "cylinder", r: KJ.THIGH_R, h: 0.79, segments: 24, bevel: 0.008 },
    material: "silver",
    node: hip,
    mate: mateAt(hip, [legX, (KJ.HIP_Y - 0.38 + KJ.KNEE_Y + 0.33) / 2, 0]),
    source: "大腿主筒上端接髋球，下端接膝筒；中段留给液压缸与装甲",
  });
  builder.add({
    id: pid("legs", `hip_yoke_${side}`),
    name_cn: "髋叉耳",
    name_en: "hip yoke plate",
    assembly: "legs",
    layer: 1,
    geometry: { type: "box", w: 0.03, h: 0.38, d: 0.2, bevel: 0.008 },
    material: "silver_dark",
    node: hip,
    mate: mateAt(hip, [legX, KJ.HIP_Y - 0.19, 0]),
    instances: 2,
    indexed: true,
    instance_layout: "kjMirrorX019",
    hint: "髋叉耳在髋座两端外 5mm，把髋轴头与股骨主筒连起来；不穿过髋座筒壁",
  });
  // 大腿四片装甲：前后左右（板面贴主筒外径，留 2–10mm）
  const thighPlateY = (KJ.HIP_Y + KJ.KNEE_Y) / 2 + 0.12;
  builder.add({
    id: pid("legs", `thigh_plate_front_${side}`),
    name_cn: "大腿前甲板",
    name_en: "thigh front armor",
    assembly: "legs",
    layer: 4,
    geometry: { type: "kit", kit: "kjChamferPlate", params: { w: 0.58, h: 0.9, t: 0.04, corner: 0.09 } },
    material: "silver",
    node: hip,
    mate: mateAt(hip, [legX, thighPlateY, 0.345]),
  });
  builder.add({
    id: pid("legs", `thigh_plate_outer_${side}`),
    name_cn: "大腿外甲板",
    name_en: "thigh outer armor",
    assembly: "legs",
    layer: 4,
    geometry: { type: "kit", kit: "kjChamferPlate", params: { w: 0.62, h: 0.9, t: 0.04, corner: 0.09 } },
    material: "silver_dark",
    node: hip,
    mate: mateAt(hip, [legX + 0.345 * s, thighPlateY, 0], [0, 90 * s, 0]),
  });
  builder.add({
    id: pid("legs", `thigh_plate_back_${side}`),
    name_cn: "大腿后甲板",
    name_en: "thigh rear armor",
    assembly: "legs",
    layer: 4,
    geometry: { type: "kit", kit: "kjChamferPlate", params: { w: 0.46, h: 0.28, t: 0.03, corner: 0.05 } },
    material: "silver",
    node: hip,
    mate: mateAt(hip, [legX, thighPlateY + 0.25, -0.335]),
  });
  if (side === "l") {
    // 战损演示件：外挂板浮贴在大腿外甲外 2mm，可在 damagePanelL 节点上整块脱落
    builder.add({
      id: pid("legs", "thigh_applique"),
      name_cn: "左大腿外挂装甲板",
      name_en: "left thigh applique armor",
      assembly: "legs",
      layer: 4,
      geometry: { type: "kit", kit: "kjChamferPlate", params: { w: 0.44, h: 0.4, t: 0.03, corner: 0.05 } },
      material: "silver_bright",
      node: "damagePanelL",
      mate: absMate([0, 0, 0], [0, -90, 0]),
      source: "外挂板内表面距大腿外甲 2mm，由四颗暗销固定；受击时沿外下方脱落",
    });
    builder.add({
      id: pid("legs", "thigh_applique_stripe"),
      name_cn: "外挂板金饰条",
      name_en: "applique gold stripe",
      assembly: "legs",
      layer: 5,
      geometry: { type: "box", w: 0.09, h: 0.3, d: 0.01, bevel: 0.002 },
      material: "gold",
      node: "damagePanelL",
      mate: absMate([0, 0, 0.021], [0, -90, 0]),
      source: "贴在外挂板外表面 1mm 处，随装甲板一起脱落",
    });
  }
  // —— 膝：筒 / 球 / 衬套 / 金色膝甲 ——
  builder.add({
    id: pid("legs", `knee_tube_${side}`),
    name_cn: "膝筒",
    name_en: "knee joint barrel",
    assembly: "legs",
    layer: 1,
    geometry: { type: "tube", rOuter: 0.33, rInner: 0.24, h: 0.33, segments: 28 },
    material: "joint_steel",
    node: hip,
    mate: mateAt(hip, [legX, KJ.KNEE_Y, 0], [0, 0, 90]),
  });
  builder.add({
    id: pid("legs", `knee_ball_${side}`),
    name_cn: "膝轴头",
    name_en: "knee spool",
    assembly: "legs",
    layer: 1,
    geometry: { type: "cylinder", r: 0.23, h: 0.3, segments: 28, bevel: 0.02 },
    material: "silver_bright",
    node: knee,
    mate: mateAt(knee, [legX, KJ.KNEE_Y, 0], [0, 0, 90]),
  });
  builder.add({
    id: pid("legs", `knee_guard_${side}`),
    name_cn: "金色膝甲",
    name_en: "gold knee guard",
    assembly: "legs",
    layer: 5,
    geometry: { type: "kit", kit: "kjChamferPlate", params: { w: 0.42, h: 0.34, t: 0.045, corner: 0.1 } },
    material: "gold",
    node: knee,
    mate: mateAt(knee, [legX, KJ.KNEE_Y + 0.16, 0.355]),
  });
  rivetStripPart(builder, {
    id: pid("legs", `knee_guard_rivets_${side}`),
    name_cn: "膝甲铆钉",
    name_en: "knee guard rivets",
    assembly: "legs",
    node: knee,
    world: [legX, KJ.KNEE_Y + 0.03, 0.39],
    count: 5,
    spacing: 0.06,
    layer: 5,
  });

  builder.add({
    id: pid("legs", `calf_bone_${side}`),
    name_cn: "胫骨主筒",
    name_en: "calf main cylinder",
    assembly: "legs",
    layer: 1,
    geometry: { type: "cylinder", r: KJ.CALF_R, h: 0.63, segments: 24, bevel: 0.008 },
    material: "silver",
    node: knee,
    mate: mateAt(knee, [legX, (KJ.KNEE_Y - 0.33 + KJ.ANKLE_Y + 0.26) / 2, 0]),
  });
  builder.add({
    id: pid("legs", `knee_yoke_${side}`),
    name_cn: "膝叉耳",
    name_en: "knee yoke plate",
    assembly: "legs",
    layer: 1,
    geometry: { type: "box", w: 0.03, h: 0.35, d: 0.18, bevel: 0.008 },
    material: "silver_dark",
    node: knee,
    mate: mateAt(knee, [legX, KJ.KNEE_Y - 0.155, 0]),
    instances: 2,
    indexed: true,
    instance_layout: "kjMirrorX018",
  });
  const calfPlateY = (KJ.KNEE_Y + KJ.ANKLE_Y) / 2 + 0.1;
  builder.add({
    id: pid("legs", `calf_plate_front_${side}`),
    name_cn: "小腿前甲板",
    name_en: "calf front armor",
    assembly: "legs",
    layer: 4,
    geometry: { type: "kit", kit: "kjChamferPlate", params: { w: 0.56, h: 0.8, t: 0.04, corner: 0.09 } },
    material: "silver",
    node: knee,
    mate: mateAt(knee, [legX, calfPlateY - 0.03, 0.333]),
  });
  builder.add({
    id: pid("legs", `calf_plate_outer_${side}`),
    name_cn: "小腿外甲板",
    name_en: "calf outer armor",
    assembly: "legs",
    layer: 4,
    geometry: { type: "kit", kit: "kjChamferPlate", params: { w: 0.56, h: 0.86, t: 0.04, corner: 0.09 } },
    material: "silver_dark",
    node: knee,
    mate: mateAt(knee, [legX + 0.333 * s, calfPlateY, 0], [0, 90 * s, 0]),
  });
  builder.add({
    id: pid("legs", `calf_plate_inner_${side}`),
    name_cn: "小腿内甲板",
    name_en: "calf inner armor",
    assembly: "legs",
    layer: 4,
    geometry: { type: "kit", kit: "kjChamferPlate", params: { w: 0.52, h: 0.8, t: 0.035, corner: 0.08 } },
    material: "silver_dark",
    node: knee,
    mate: mateAt(knee, [legX - 0.333 * s, calfPlateY, 0], [0, -90 * s, 0]),
  });
  builder.add({
    id: pid("legs", `shin_gold_strip_${side}`),
    name_cn: "胫前金饰条",
    name_en: "gold shin strip",
    assembly: "legs",
    layer: 5,
    geometry: { type: "box", w: 0.16, h: 0.58, d: 0.025, bevel: 0.006 },
    material: "gold",
    node: knee,
    mate: mateAt(knee, [legX, calfPlateY - 0.04, 0.37]),
  });
  rivetStripPart(builder, {
    id: pid("legs", `calf_rivets_${side}`),
    name_cn: "小腿甲板铆钉",
    name_en: "calf armor rivets",
    assembly: "legs",
    node: knee,
    world: [legX - 0.16, calfPlateY - 0.34, 0.354],
    count: 5,
    spacing: 0.07,
    rotation: [90, 0, 0],
  });

  // —— 踝筒 / 足毂 / 宽足 ——
  builder.add({
    id: pid("legs", `ankle_tube_${side}`),
    name_cn: "踝筒",
    name_en: "ankle joint tube",
    assembly: "legs",
    layer: 1,
    geometry: { type: "tube", rOuter: 0.18, rInner: 0.13, h: 0.28, segments: 24 },
    material: "joint_steel",
    node: knee,
    mate: mateAt(knee, [legX, KJ.ANKLE_Y, 0], [0, 0, 90]),
  });
  builder.add({
    id: pid("legs", `foot_hub_${side}`),
    name_cn: "足毂",
    name_en: "foot hub",
    assembly: "legs",
    layer: 1,
    geometry: { type: "tube", rOuter: 0.23, rInner: 0.182, h: 0.3, segments: 26 },
    material: "silver_dark",
    node: ankle,
    mate: mateAt(ankle, [legX, KJ.ANKLE_Y, 0], [0, 0, 90]),
    hint: "足毂内孔 364mm 套在 360mm 踝筒外，单边 1mm 视觉油膜",
  });
  builder.add({
    id: pid("legs", `foot_sole_${side}`),
    name_cn: "足底承力板",
    name_en: "foot sole",
    assembly: "legs",
    layer: 1,
    geometry: { type: "box", w: KJ.FOOT_W, h: KJ.SOLE_T, d: KJ.FOOT_L, bevel: 0.02 },
    material: "joint_steel",
    node: ankle,
    mate: mateAt(ankle, [legX, KJ.SOLE_T / 2, 0.12]),
  });
  builder.add({
    id: pid("legs", `foot_mid_plate_${side}`),
    name_cn: "足中承板",
    name_en: "foot mid plate",
    assembly: "legs",
    layer: 1,
    geometry: { type: "box", w: 0.56, h: 0.03, d: 0.76, bevel: 0.01 },
    material: "silver_dark",
    node: ankle,
    mate: mateAt(ankle, [legX, 0.095, 0.1]),
  });
  builder.add({
    id: pid("legs", `foot_instep_${side}`),
    name_cn: "足背",
    name_en: "foot instep",
    assembly: "legs",
    layer: 4,
    geometry: { type: "box", w: 0.5, h: 0.18, d: 0.3, bevel: 0.03 },
    material: "silver",
    node: ankle,
    mate: mateAt(ankle, [legX, 0.2, 0.38]),
  });
  builder.add({
    id: pid("legs", `foot_toe_${side}`),
    name_cn: "上翘趾甲",
    name_en: "toe cap",
    assembly: "legs",
    layer: 4,
    geometry: { type: "box", w: 0.54, h: 0.12, d: 0.2, bevel: 0.03 },
    material: "silver",
    node: ankle,
    mate: mateAt(ankle, [legX, 0.14, 0.635], [6, 0, 0]),
  });
  builder.add({
    id: pid("legs", `foot_heel_${side}`),
    name_cn: "足跟",
    name_en: "heel block",
    assembly: "legs",
    layer: 4,
    geometry: { type: "box", w: 0.46, h: 0.16, d: 0.2, bevel: 0.03 },
    material: "silver_dark",
    node: ankle,
    mate: mateAt(ankle, [legX, 0.19, -0.35]),
  });
  builder.add({
    id: pid("legs", `foot_toe_plate_${side}`),
    name_cn: "足尖金板",
    name_en: "toe gold plate",
    assembly: "legs",
    layer: 5,
    geometry: { type: "box", w: 0.5, h: 0.02, d: 0.08, bevel: 0.006 },
    material: "gold",
    node: ankle,
    mate: mateAt(ankle, [legX, 0.22, 0.62], [6, 0, 0]),
  });
  builder.add({
    id: pid("legs", `foot_side_plate_${side}`),
    name_cn: "足侧甲",
    name_en: "foot side armor",
    assembly: "legs",
    layer: 4,
    geometry: { type: "kit", kit: "kjChamferPlate", params: { w: 1.0, h: 0.18, t: 0.03, corner: 0.06 } },
    material: "silver_dark",
    node: ankle,
    mate: mateAt(ankle, [legX + 0.34 * s, 0.16, 0.1], [0, 90 * s, 0]),
  });
  boltRingPart(builder, {
    id: pid("legs", `foot_bolts_${side}`),
    name_cn: "足背螺栓圈",
    name_en: "foot instep bolts",
    assembly: "legs",
    layer: 4,
    node: ankle,
    world: [legX, 0.292, 0.38],
    count: 6,
    radius: 0.14,
    boltR: 0.01,
    boltH: 0.012,
  });

  // —— 足底四角减震垫（站立支撑 + 重踏步吸震）——
  for (const [corner, dx, dz, cn] of [
    ["front_outer", 0.2, 0.38, "前外"],
    ["front_inner", -0.2, 0.38, "前内"],
    ["rear_outer", 0.2, -0.38, "后外"],
    ["rear_inner", -0.2, -0.38, "后内"],
  ] as const) {
    builder.add({
      id: pid("legs", `foot_damper_${corner}_${side}`),
      name_cn: `足底${cn}减震垫`,
      name_en: `foot damper pad ${corner}`,
      assembly: "legs",
      layer: 4,
      geometry: { type: "box", w: 0.16, h: 0.024, d: 0.2, bevel: 0.006 },
      material: "rubber",
      node: ankle,
      mate: mateAt(ankle, [legX + dx, -0.013, 0.12 + dz]),
      source: "上表面与足底承力板留 1mm 装配缝；四角独立吸震，重踏步时先触地",
    });
  }

  // —— 管线 / 传感器 ——
  tubeBetween(builder, {
    id: pid("legs", `hip_hose_${side}`),
    name_cn: "髋部液压软管",
    name_en: "hip hydraulic hose",
    assembly: "legs",
    node: hip,
    from: [legX - 0.22 * s, KJ.HIP_Y - 0.18, 0.27],
    to: [legX - 0.22 * s, KJ.KNEE_Y + 0.42, 0.27],
    radius: 0.022,
  });
  tubeBetween(builder, {
    id: pid("legs", `knee_hose_${side}`),
    name_cn: "膝部液压软管",
    name_en: "knee hydraulic hose",
    assembly: "legs",
    node: knee,
    from: [legX + 0.21 * s, KJ.KNEE_Y - 0.1, 0.26],
    to: [legX + 0.21 * s, KJ.ANKLE_Y + 0.35, 0.26],
    radius: 0.02,
  });
  builder.add({
    id: pid("legs", `hip_sensor_${side}`),
    name_cn: "髋角传感器",
    name_en: "hip encoder",
    assembly: "legs",
    layer: 4,
    geometry: { type: "cylinder", r: 0.05, h: 0.06, segments: 14, bevel: 0.004 },
    material: "sensor_red",
    node: "legs",
    mate: mateAt("legs", [legX + 0.33 * s, KJ.HIP_Y + 0.02, 0.14], [0, 0, 90]),
  });
  builder.add({
    id: pid("legs", `knee_sensor_${side}`),
    name_cn: "膝角传感器",
    name_en: "knee encoder",
    assembly: "legs",
    layer: 4,
    geometry: { type: "cylinder", r: 0.04, h: 0.055, segments: 14, bevel: 0.004 },
    material: "sensor_red",
    node: hip,
    mate: mateAt(hip, [legX + 0.225 * s, KJ.KNEE_Y + 0.06, 0], [0, 0, 90]),
  });
  builder.add({
    id: pid("legs", `ankle_sensor_${side}`),
    name_cn: "踝角传感器",
    name_en: "ankle encoder",
    assembly: "legs",
    layer: 4,
    geometry: { type: "cylinder", r: 0.035, h: 0.05, segments: 14, bevel: 0.003 },
    material: "sensor_red",
    node: knee,
    mate: mateAt(knee, [legX + 0.155 * s, KJ.ANKLE_Y + 0.04, 0], [0, 0, 90]),
  });

  // —— 液压缸（4 根/腿）——
  for (const spec of HYDRAULICS.filter(
    (item) => item.side === side && ["hip_main", "hip_abd", "knee_main", "ankle_main"].includes(item.id),
  )) {
    addHydraulic(builder, spec);
  }

  // 本地变量留作布局/截图标注
  void joints;
  void local;
}

function addLegsCommon(builder: KingJoeParts): void {
  builder.add({
    id: pid(LEGS_COMMON, "pelvis_core"),
    name_cn: "骨盆核心",
    name_en: "pelvis core",
    assembly: "legs",
    layer: 1,
    geometry: { type: "box", w: 1.04, h: 0.5, d: 0.92, bevel: 0.04 },
    material: "joint_steel",
    node: "legs",
    mate: mateAt("legs", [0, 3.15, 0]),
  });
  builder.add({
    id: pid(LEGS_COMMON, "pelvis_front"),
    name_cn: "骨盆前甲",
    name_en: "pelvis front armor",
    assembly: "legs",
    layer: 4,
    geometry: { type: "kit", kit: "kjChamferPlate", params: { w: 0.96, h: 0.36, t: 0.05, corner: 0.1 } },
    material: "silver",
    node: "legs",
    mate: mateAt("legs", [0, 3.14, 0.49]),
  });
  builder.add({
    id: pid(LEGS_COMMON, "pelvis_back"),
    name_cn: "骨盆后甲",
    name_en: "pelvis rear armor",
    assembly: "legs",
    layer: 4,
    geometry: { type: "kit", kit: "kjChamferPlate", params: { w: 0.9, h: 0.34, t: 0.045, corner: 0.1 } },
    material: "silver_dark",
    node: "legs",
    mate: mateAt("legs", [0, 3.14, -0.49]),
  });
  builder.add({
    id: pid(LEGS_COMMON, "pelvis_belt"),
    name_cn: "骨盆腰带",
    name_en: "pelvis belt",
    assembly: "legs",
    layer: 5,
    geometry: {
      type: "merge",
      parts: [
        { type: "box", w: 1.24, h: 0.1, d: 0.025, bevel: 0.006, at: [0, 0, 0.475] },
        { type: "box", w: 1.24, h: 0.1, d: 0.025, bevel: 0.006, at: [0, 0, -0.475] },
      ],
    },
    material: "black_metal",
    node: "legs",
    mate: mateAt("legs", [0, 3.37, 0]),
  });
  builder.add({
    id: pid(LEGS_COMMON, "pelvis_top_ring"),
    name_cn: "骨盆顶承盘",
    name_en: "pelvis top ring",
    assembly: "legs",
    layer: 1,
    geometry: { type: "tube", rOuter: 0.95, rInner: 0.4, h: 0.03, segments: 40 },
    material: "silver_dark",
    node: "legs",
    mate: mateAt("legs", [0, 3.445, 0]),
  });
  boltRingPart(builder, {
    id: pid(LEGS_COMMON, "pelvis_bolts"),
    name_cn: "骨盆顶盘螺栓",
    name_en: "pelvis top bolts",
    assembly: "legs",
    layer: 4,
    node: "legs",
    world: [0, 3.465, 0],
    count: 16,
    radius: 0.72,
    boltR: 0.014,
    boltH: 0.018,
  });
  rivetStripPart(builder, {
    id: pid(LEGS_COMMON, "pelvis_rivets"),
    name_cn: "骨盆甲缝铆钉",
    name_en: "pelvis rivets",
    assembly: "legs",
    layer: 4,
    node: "legs",
    world: [-0.36, 3.2, 0.53],
    count: 5,
    spacing: 0.085,
  });
}

export function addLegsParts(builder: KingJoeParts): void {
  addLegsCommon(builder);
  addLegStructure(builder, "l");
  addLegStructure(builder, "r");
  addAntigravity(builder, "legs", [0, 2.655, -0.1], 0.8);
  addNozzles(builder, "legs");
}

export type { Vec3 };
