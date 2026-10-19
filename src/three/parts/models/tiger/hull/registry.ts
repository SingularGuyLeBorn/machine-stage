import * as THREE from "three";
import type { InstanceLayout } from "../../../assembler/assembler";
import type { ModelRegistry, PartDefinition } from "../../../registry/types";

// ============================================================================
// models/tiger/hull —— 虎式 I 车体外壳（L4 第一批：地板 + 侧板 + 前后装甲板 + 发动机隔板）
//
// 坐标系沿用 L1/L2/L3：+X 朝车尾（风扇端）、+Y 上（曲轴轴线 y = 0）、+Z 车体右侧；
// 地面 GROUND_Y = -1.10。
//
// 本批只做「地板以上」的车体箱——它同时是前三层的落地依据：
//   地板顶面 y -0.305（B3 变速箱机脚 / 转向机耳 / 中间支承座、L3 座椅底座都坐这个面）
//   侧板内表面 z ±0.90（L3 内饰口径）、外表面 ±0.9625（B3 终传输入壳体净空口径）
//   前装甲板内表面 x -4.40（L3 仪表板 / 踏板 / 航向机枪球孔基准）
//   板顶 y 1.045（离 L4-b 顶甲板下表面 1.05 留 5mm）
//
// 数据出处（公开资料，Jentz《Germany's Tiger Tanks》/ 实车 Tiger 131 照片）：
//   1. 车体为焊接箱型：前装甲 100mm、侧装甲 60mm、后装甲 80mm、地板 26mm；
//      实车首上装甲有 9° 倾角，本模型按垂直板建（L3 内饰全部按垂直面定位）。
//   2. 侧传动轴（B3 的 L 600 C 转向输出）自车体侧板穿出接前置终传——实车此处为
//      侧板上的大开孔 + 终传输入壳体，本批按 B3 契约开 ⌀110 过孔。
//   3. 发动机隔板（Motorschott）把后置发动机舱与战斗室分开，传动轴经隔板孔进入发动机
//      飞轮——本批开 ⌀180 过孔（万向节 ⌀150 与孔留 15mm 环缝）。
//
// 建模口径（简化记录，M-C / L4-f / L5 待补）：
//   1. 已完成：地板 / 侧板 / 前后装甲板 / 隔板（L4-a）、顶甲板 + 发动机舱盖 + 座圈（L4-b）、
//      驾驶员-无线电员舱盖盖板（打开 90°）/ 潜望镜窗框 / 驾驶员观察窗 / 座圈螺栓圈（L4-d）、
//      航向机枪球形枪座 + MG34 枪管 / 首上备用履带板 ×3 / 焊接吊环 ×3（L4-e）。
//   2. 本批不含：翼子板与前后挡泥板（L4-f）、近防武器与随车工具（L5）、
//      焊缝与暗黄涂装（L5）。
//   2. 下部车体（腹板 + 扭杆通道 + 车底侧裙）未建：扭杆（y -0.585）与摆臂枢轴（z ±1.10）
//      在实车位于车体侧壁之内，本模型 L2 把它们放在「地板之下、侧板之外」，
//      底板落地时需一并重排（M-C）。
//   3. 板与板之间一律 3mm 名义缝（不接触、不报缺陷）；内饰面象牙白内衬板随 L5 涂装批处理。
// ============================================================================

export const HULL_LAYOUTS = {
  sidePlate: "hull.sidePlate",
  engineCoaming: "hull.engineCoaming",
  mirrorZ: "hull.mirrorZ",
  ringBolts: "hull.ringBolts",
  glacisSpare: "hull.glacisSpare",
  roofEyes: "hull.roofEyes",
  trackGuard: "hull.trackGuard",
} as const;

const HULL_CONSTANTS: Record<string, number> = {
  // —— 基准面（对外接口）——
  HULL_FLOOR_TOP: -0.305,
  HULL_SIDE_INNER: 0.9,
  HULL_FRONT_INNER: -4.4,
  HULL_PLATE_TOP: 1.045,

  // —— 板厚 ——
  HULL_FLOOR_T: 0.03,
  HULL_SIDE_T: 0.0625,
  HULL_FRONT_T: 0.1,
  HULL_REAR_T: 0.08,
  HULL_SCHOTT_T: 0.06,

  // —— 车体后边界与隔板 ——
  HULL_REAR_INNER: 0.83,
  HULL_SCHOTT_X1: -0.78,
  HULL_SCHOTT_X2: -0.72,

  // —— 开孔 ——
  HULL_JOINT: 0.003,
  HULL_MG_HOLE_R: 0.05,
  HULL_MG_HOLE_Y: 0.16,
  HULL_MG_HOLE_Z: 0.78,
  HULL_SHAFT_X: -4.05,
  HULL_SHAFT_Y: 0,
  HULL_SHAFT_HOLE_R: 0.055,
  HULL_PROP_HOLE_R: 0.09,

  // —— 顶甲板 / 发动机舱盖 / 炮塔座圈（L4-b）——
  HULL_ROOF_UNDER: 1.05,
  HULL_ROOF_T: 0.025,
  HULL_DECK_UNDER: 1.08,
  HULL_DECK_T: 0.025,
  HULL_TURRET_X: -1.65,
  HULL_TURRET_R: 0.825,
  HULL_RING_RO: 0.875,
  HULL_RING_T: 0.03,
  HULL_HATCH_X: -3.32,
  HULL_HATCH_Z: 0.66,
  HULL_HATCH_R: 0.22,
  HULL_PERI_X: -3.95,
  HULL_PERI_Z: 0.66,
  HULL_PERI_W: 0.17,
  HULL_PERI_H: 0.13,

  // —— 舱盖 / 观察窗 / 座圈螺栓（L4-d）——
  HULL_HATCH_LID_R: 0.215,
  HULL_HATCH_LID_T: 0.022,
  HULL_PERI_BEZEL: 0.008,
  HULL_VISOR_X: -4.5205,
  HULL_VISOR_Y: 0.93,
  HULL_RING_BOLT_R: 0.8425,
  HULL_RING_BOLT_HEAD_R: 0.012,
  HULL_RING_BOLT_COUNT: 24,

  // —— 航向机枪球座 / 随车履带板 / 吊环（L4-e）——
  HULL_MG_BALL_RO: 0.14,
  HULL_MG_BALL_RI: 0.085,
  HULL_MG_BALL_T: 0.03,
  HULL_MG_BALL_RB: 0.115,
  HULL_MG_BALL_PROTRUDE: 0.1,
  HULL_MG_BARREL_R: 0.012,
  HULL_MG_BARREL_L: 0.3,
  HULL_SPARE_X: -4.535,
  HULL_SPARE_Y: 0.55,
  HULL_SPARE_COUNT: 3,
  HULL_SPARE_W: 0.3625,
  HULL_EYE_X: -4.15,
  HULL_EYE_Z: 0.85,
  HULL_EYE2_X: -2.62,
};

function sideOf(index: number): 1 | -1 {
  return index === 0 ? 1 : -1;
}

function makeLayouts(): Record<string, InstanceLayout> {
  const layouts: Record<string, InstanceLayout> = {};

  // 左右侧板同一几何（板上过孔同心于侧传动轴），只按 z 平移
  layouts[HULL_LAYOUTS.sidePlate] = ({ index }) => {
    const z = HULL_CONSTANTS.HULL_SIDE_INNER + HULL_CONSTANTS.HULL_SIDE_T / 2;
    return new THREE.Matrix4().makeTranslation(0, 0, sideOf(index) * z);
  };

  // 发动机舱侧围同理：左右同几何、按 z 平移
  layouts[HULL_LAYOUTS.engineCoaming] = ({ index }) => {
    const z = HULL_CONSTANTS.HULL_SIDE_INNER + HULL_CONSTANTS.HULL_SIDE_T / 2;
    return new THREE.Matrix4().makeTranslation(0, 0, sideOf(index) * z);
  };

  // 左右对称件（驾驶员 / 无线电员舱盖、潜望镜窗框）：按 z ±0.66 平移
  layouts[HULL_LAYOUTS.mirrorZ] = ({ index }) => {
    const z = HULL_CONSTANTS.HULL_HATCH_Z!;
    return new THREE.Matrix4().makeTranslation(0, 0, index === 0 ? z : -z);
  };

  // 座圈螺栓圈 ×24：绕座圈圆心均布，螺栓头随圆周转向
  layouts[HULL_LAYOUTS.ringBolts] = ({ index, count }) => {
    const a = (index / Math.max(count, 1)) * Math.PI * 2;
    return new THREE.Matrix4()
      .makeRotationY(-a)
      .multiply(new THREE.Matrix4().makeTranslation(HULL_CONSTANTS.HULL_RING_BOLT_R!, 0, 0));
  };

  // 首装甲板备用履带板 ×3：板面贴板面（触地面朝车体）、导向齿朝车头（-X），三块上下叠成一列。
  // 局部系 → 世界：履带板 +X（节距方向）→ +Y；+Y（触地面）→ +X（朝车体）；+Z（板宽）→ -Z（板宽对称，居中即 z 0）。
  layouts[HULL_LAYOUTS.glacisSpare] = ({ index, constants }) => {
    const pitch = constants.TRACK_PIN_PITCH ?? 0.13;
    const basis = new THREE.Matrix4().makeBasis(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 0, -1),
    );
    basis.setPosition(HULL_CONSTANTS.HULL_SPARE_X!, HULL_CONSTANTS.HULL_SPARE_Y! + index * pitch, 0);
    return basis;
  };

  // 顶部吊环 ×3：两个前角（z ±0.85）+ 一个前段中央
  layouts[HULL_LAYOUTS.roofEyes] = ({ index }) => {
    const z = HULL_CONSTANTS.HULL_EYE_Z!;
    const m = new THREE.Matrix4();
    if (index === 0) m.setPosition(0, 0, z);
    else if (index === 1) m.setPosition(0, 0, -z);
    else m.setPosition(HULL_CONSTANTS.HULL_EYE2_X! - HULL_CONSTANTS.HULL_EYE_X!, 0, 0);
    return m;
  };

  // 履带挡板 ×2：右件直接外伸；左件绕 Y 转 180° 再平移（板件全对称，翻面后轮廓一致）
  layouts[HULL_LAYOUTS.trackGuard] = ({ index }) =>
    index === 0
      ? new THREE.Matrix4().makeTranslation(0, 0, 0.9655)
      : new THREE.Matrix4()
          .makeTranslation(5.41, 0, -0.9655)
          .multiply(new THREE.Matrix4().makeRotationY(Math.PI));

  return layouts;
}

// ---------------------------------------------------------------------------
// 零件
// ---------------------------------------------------------------------------

function buildHullParts(): PartDefinition[] {
  const parts: PartDefinition[] = [];
  const add = (part: PartDefinition) => parts.push(part);

  const c = HULL_CONSTANTS;
  // 由基准面推出的复合尺寸（避免手算数字散落在各零件里）
  const floorBottom = c.HULL_FLOOR_TOP! - c.HULL_FLOOR_T!;
  const frontOuter = c.HULL_FRONT_INNER! - c.HULL_FRONT_T!;
  const sideOuter = c.HULL_SIDE_INNER! + c.HULL_SIDE_T!;
  const rearOuter = c.HULL_REAR_INNER! + c.HULL_REAR_T!;

  const innerX1 = c.HULL_FRONT_INNER! + c.HULL_JOINT!;
  const innerX2 = c.HULL_REAR_INNER! - c.HULL_JOINT!;
  const innerZ = c.HULL_SIDE_INNER! - c.HULL_JOINT!;

  const innerW = innerX2 - innerX1;
  const innerCX = (innerX1 + innerX2) / 2;

  const wallY1 = c.HULL_FLOOR_TOP! + c.HULL_JOINT!;
  const wallH = c.HULL_PLATE_TOP! - wallY1;
  const wallCY = (wallY1 + c.HULL_PLATE_TOP!) / 2;

  const shellH = c.HULL_PLATE_TOP! - floorBottom;
  const shellCY = (floorBottom + c.HULL_PLATE_TOP!) / 2;

  const schottCX = (c.HULL_SCHOTT_X1! + c.HULL_SCHOTT_X2!) / 2;
  const schottY1 = c.HULL_FLOOR_TOP! + c.HULL_JOINT!;
  const schottH = c.HULL_PLATE_TOP! - schottY1;
  const schottCY = (schottY1 + c.HULL_PLATE_TOP!) / 2;

  // ===================== 地板 =====================
  add({
    id: "tiger.hull.floor",
    name_cn: "车体地板",
    name_en: "Wannenboden",
    assembly: "hull",
    build_layer: 4,
    build_order: 500,
    geometry: { type: "box", w: innerW, h: c.HULL_FLOOR_T!, d: innerZ * 2, bevel: 0.004 },
    material: "armor_steel",
    mate: { type: "absolute", position: [innerCX, c.HULL_FLOOR_TOP! - c.HULL_FLOOR_T! / 2, 0] },
    source:
      "车体地板（Wannenboden，厚 30）：顶面 y -0.305（B3/L3 统一基准面）、底面 -0.335，x -4.397 ~ 0.827、z ±0.897（四周留 3mm 名义缝）。板上 2mm 名义缝承接变速箱机脚（-0.303）、转向机支承耳（-0.302）、中间支承座（-0.303）与 L3 座椅底座板；地板之下是扭杆（y -0.585）与腹板，随 M-C 建。",
  });

  // ===================== 左右侧装甲板 =====================
  add({
    id: "tiger.hull.side_plate",
    name_cn: "侧装甲板",
    name_en: "Seitenpanzer",
    assembly: "hull",
    build_layer: 4,
    build_order: 501,
    geometry: {
      type: "kit",
      kit: "hullPlate",
      params: {
        w: innerW,
        h: wallH,
        t: c.HULL_SIDE_T!,
        holes: [[c.HULL_SHAFT_X! - innerCX, c.HULL_SHAFT_Y! - wallCY, c.HULL_SHAFT_HOLE_R!]],
      },
    },
    material: "armor_steel",
    instances: 2,
    indexed: true,
    instance_layout: HULL_LAYOUTS.sidePlate,
    mate: { type: "absolute", position: [innerCX, wallCY, 0] },
    source:
      "侧装甲板（Seitenpanzer，厚 62.5）：内表面 z ±0.90（L3 内饰口径）、外表面 ±0.9625，x -4.397 ~ 0.827、y -0.302 ~ 1.045。⌀110 侧传动轴过孔（x -4.05、y 0，B3 契约）：轴体 ⌀76 与孔留 17mm 环缝、外侧法兰面（z ±0.967）与板外面留 4.5mm。左右同几何、按 z ±0.93125 平移。",
  });

  // ===================== 前装甲板 =====================
  add({
    id: "tiger.hull.front_plate",
    name_cn: "前装甲板",
    name_en: "Bugplatte",
    assembly: "hull",
    build_layer: 4,
    build_order: 502,
    geometry: {
      type: "kit",
      kit: "hullPlate",
      params: {
        w: sideOuter * 2,
        h: shellH,
        t: c.HULL_FRONT_T!,
        holes: [[c.HULL_MG_HOLE_Z!, c.HULL_MG_HOLE_Y! - shellCY, c.HULL_MG_HOLE_R!]],
      },
    },
    material: "armor_steel",
    mate: {
      type: "absolute",
      position: [(c.HULL_FRONT_INNER! + frontOuter) / 2, shellCY, 0],
      rotation: [0, -90, 0],
    },
    source:
      "前装甲板（Bugplatte，厚 100；实车 9° 倾角，本模型垂直）：内表面 x -4.40（L3 仪表板 / 踏板 / 机枪球孔基准）、外表面 -4.50，z ±0.9625（贯通全宽）、y -0.335 ~ 1.045。⌀100 航向机枪球孔（y 0.16、z 0.78）：车内枪管段穿入孔内 90mm（枪口 -4.49），车外由 L4-e 的 Kugelblende 50 球座 + MG34 枪管接出；驾驶员观察窗见 L4-d。",
  });

  // ===================== 后装甲板 =====================
  // 发动机舱段的后板一直顶到舱盖下表面（3mm 缝），否则舱盖与后板之间会露出 35mm 高的通缝
  const rearTop = c.HULL_DECK_UNDER! - c.HULL_JOINT!;
  add({
    id: "tiger.hull.rear_plate",
    name_cn: "后装甲板",
    name_en: "Heckplatte",
    assembly: "hull",
    build_layer: 4,
    build_order: 503,
    geometry: {
      type: "box",
      w: c.HULL_REAR_T!,
      h: rearTop - floorBottom,
      d: sideOuter * 2,
      bevel: 0.004,
    },
    material: "armor_steel",
    mate: {
      type: "absolute",
      position: [(c.HULL_REAR_INNER! + rearOuter) / 2, (floorBottom + rearTop) / 2, 0],
    },
    source:
      "后装甲板（Heckplatte，厚 80）：内表面 x 0.83、外表面 0.91，z ±0.9625、y -0.335 ~ 1.077（发动机舱段顶到舱盖下表面 1.08 留 3mm，避免舱盖与后板之间露 35mm 通缝）；离发动机风扇后端（x 0.726）104mm。排气管 / 尾灯 / 逃生门随 L5 表面附件。",
  });

  // ===================== 发动机隔板 =====================
  add({
    id: "tiger.hull.firewall",
    name_cn: "发动机隔板",
    name_en: "Motorschott",
    assembly: "hull",
    build_layer: 4,
    build_order: 504,
    geometry: {
      type: "kit",
      kit: "hullPlate",
      params: {
        w: innerZ * 2,
        h: schottH,
        t: c.HULL_SCHOTT_T!,
        holes: [[0, -schottCY, c.HULL_PROP_HOLE_R!]],
      },
    },
    material: "armor_steel",
    mate: { type: "absolute", position: [schottCX, schottCY, 0], rotation: [0, -90, 0] },
    source:
      "发动机隔板（Motorschott，厚 60）：x -0.78 ~ -0.72、z ±0.897、y -0.302 ~ 1.045（离地板顶面 3mm 名义缝）；⌀180 传动轴过孔（轴心 y 0、z 0）：万向节 ⌀150 与孔留 15mm 环缝、隔板后面离发动机飞轮端（x -0.677）43mm。隔板上方的走线 / 油管穿套随 M-C。",
  });

  // ===================== 战斗室顶甲板（L4-b） =====================
  // 顶甲板盖住四壁上缘（前后板 / 侧板顶面），所以外廓取满车体箱：x -4.50 ~ -0.783、z ±0.9625
  const roofX1 = c.HULL_FRONT_INNER! - c.HULL_FRONT_T!;
  const roofX2 = c.HULL_SCHOTT_X2! - c.HULL_JOINT!;
  const roofUnder = c.HULL_ROOF_UNDER!;
  const roofTop = roofUnder + c.HULL_ROOF_T!;
  const roofW = roofX2 - roofX1;
  const roofCX = (roofX1 + roofX2) / 2;

  // 发动机舱盖比战斗室顶高 30mm（阶梯甲板）：台阶立板占隔板前半厚度，舱盖从立板后缘起
  const stepX1 = c.HULL_SCHOTT_X2!;
  const stepX2 = stepX1 + 0.036;
  const deckUnder = c.HULL_DECK_UNDER!;
  const deckTop = deckUnder + c.HULL_DECK_T!;
  const deckX1 = stepX2 + c.HULL_JOINT!;
  const deckX2 = rearOuter;
  const deckW = deckX2 - deckX1;
  const deckCX = (deckX1 + deckX2) / 2;
  const stepY1 = c.HULL_PLATE_TOP! + c.HULL_JOINT!;

  // 顶甲板局部系（装配位 rotX(90°)：局部 x → 世界 x，局部 y → 世界 z，厚度 → 世界 y）
  const roofLocalX = (worldX: number) => worldX - roofCX;

  add({
    id: "tiger.hull.fighting_roof",
    name_cn: "战斗室顶甲板",
    name_en: "Dachplatte",
    assembly: "hull",
    build_layer: 4,
    build_order: 505,
    geometry: {
      type: "kit",
      kit: "hullPlate",
      params: {
        w: roofW,
        h: sideOuter * 2,
        t: c.HULL_ROOF_T!,
        holes: [
          [roofLocalX(c.HULL_TURRET_X!), 0, c.HULL_TURRET_R!],
          [roofLocalX(c.HULL_HATCH_X!), c.HULL_HATCH_Z!, c.HULL_HATCH_R!],
          [roofLocalX(c.HULL_HATCH_X!), -c.HULL_HATCH_Z!, c.HULL_HATCH_R!],
        ],
        rects: [
          [roofLocalX(c.HULL_PERI_X!), c.HULL_PERI_Z!, c.HULL_PERI_W!, c.HULL_PERI_H!],
          [roofLocalX(c.HULL_PERI_X!), -c.HULL_PERI_Z!, c.HULL_PERI_W!, c.HULL_PERI_H!],
        ],
      },
    },
    material: "armor_steel",
    mate: { type: "absolute", position: [roofCX, (roofUnder + roofTop) / 2, 0], rotation: [90, 0, 0] },
    source:
      "战斗室顶甲板（Dachplatte，厚 25）：下表面 y 1.05（L3 潜望镜法兰顶 1.048 留 2mm、吊灯杆顶 1.045 留 5mm）、上表面 1.075，x -4.50 ~ -0.783、z ±0.9625 —— 边线取满车体箱、盖住前板与侧板上缘（各留 5mm 板缝），避免板边与墙顶之间露通缝。开炮塔座圈孔 ⌀1650（圆心 x -1.65 / z 0）：后缘离顶甲板后边 42mm、两侧到侧板外面各留 137.5mm；开驾驶员 / 无线电员舱盖孔 ⌀440 ×2（x -3.32、z ±0.66）；开潜望镜窗 170 × 130 ×2（x -3.95、z ±0.66，比潜望镜体 160 × 120 每边放大 5mm）。舱盖盖板 / 铰链 / 观察窗随 L4-d。",
  });

  // ===================== 发动机舱盖（阶梯甲板，L4-b） =====================
  add({
    id: "tiger.hull.engine_deck",
    name_cn: "发动机舱盖",
    name_en: "Motorabdeckung",
    assembly: "hull",
    build_layer: 4,
    build_order: 506,
    geometry: { type: "box", w: deckW, h: c.HULL_DECK_T!, d: sideOuter * 2, bevel: 0.004 },
    material: "armor_steel",
    mate: { type: "absolute", position: [deckCX, (deckUnder + deckTop) / 2, 0] },
    source:
      "发动机舱盖（Motorabdeckung，厚 25）：下表面 y 1.08、上表面 1.105，x -0.741 ~ 0.91，z 取满宽 ±0.9625（后缘盖住后装甲板顶面、两侧盖住发动机舱侧围，俯视无透缝；后边线与车尾外面齐平）。抬高 30mm 的原因：L1 空滤顶 1.056 / 卡箍顶 1.053 高于战斗室顶下表面 1.05，整体抬高后留 24mm（阶梯甲板，对应实车发动机舱盖高出车体顶面的做法）。散热格栅 / 风扇盖 / 排气口随 L5。",
  });

  add({
    id: "tiger.hull.deck_step",
    name_cn: "甲板台阶立板",
    name_en: "Deckabsatz",
    assembly: "hull",
    build_layer: 4,
    build_order: 507,
    geometry: {
      type: "box",
      w: stepX2 - stepX1,
      h: deckTop - stepY1,
      d: sideOuter * 2,
      bevel: 0.003,
    },
    material: "armor_steel",
    mate: {
      type: "absolute",
      position: [(stepX1 + stepX2) / 2, (stepY1 + deckTop) / 2, 0],
    },
    source:
      "甲板台阶立板（厚 36）：x -0.780 ~ -0.744、y 1.048 ~ 1.105、z ±0.9625 —— 封住战斗室顶（1.075）与发动机舱盖（1.105）之间 30mm 高差；下缘离隔板顶（1.045）3mm、前面离顶甲板后缘（-0.783）3mm、后面离舱盖前缘（-0.741）3mm。",
  });

  const coamingTop = deckUnder - c.HULL_JOINT!;
  // 侧围只到侧板后端（innerX2），后端与后板内表面留 3mm —— 舱盖才盖到车尾外面（rearOuter）
  const coamingW = innerX2 - deckX1;
  const coamingCX = (deckX1 + innerX2) / 2;

  add({
    id: "tiger.hull.engine_coaming",
    name_cn: "发动机舱侧围",
    name_en: "Motorraumbrüstung",
    assembly: "hull",
    build_layer: 4,
    build_order: 508,
    geometry: {
      type: "box",
      w: coamingW,
      h: coamingTop - stepY1,
      d: c.HULL_SIDE_T!,
      bevel: 0.003,
    },
    material: "armor_steel",
    instances: 2,
    indexed: true,
    instance_layout: HULL_LAYOUTS.engineCoaming,
    mate: { type: "absolute", position: [coamingCX, (stepY1 + coamingTop) / 2, 0] },
    source:
      "发动机舱侧围（厚 62.5 ×2）：z ±0.90 ~ ±0.9625、x -0.741 ~ 0.827、y 1.048 ~ 1.077 —— 侧装甲板顶（1.045）到发动机舱盖下表面（1.08）之间的侧壁；顶面被舱盖盖住（留 3mm），所以俯视看不到缝，侧面是「侧板 / 侧围 / 舱盖边」三层叠合的板缝。左右同几何、按 z ±0.93125 平移。",
  });

  // ===================== 炮塔座圈（L4-b） =====================
  add({
    id: "tiger.hull.turret_ring",
    name_cn: "炮塔座圈",
    name_en: "Turmdrehkranz",
    assembly: "hull",
    build_layer: 4,
    build_order: 509,
    geometry: {
      type: "tube",
      rOuter: c.HULL_RING_RO!,
      rInner: c.HULL_TURRET_R!,
      h: c.HULL_RING_T!,
      segments: 64,
    },
    material: "steel",
    mate: { type: "absolute", position: [c.HULL_TURRET_X!, roofTop + c.HULL_JOINT! + c.HULL_RING_T! / 2, 0] },
    source:
      "炮塔座圈（Turmdrehkranz，⌀1750 / ⌀1650 × 30）：坐在顶甲板上方 3mm（y 1.078 ~ 1.108），圆心 x -1.65 / z 0；外径 1.75 比座圈孔大 50mm 形成压边，两侧各留 22mm 顶甲板板边。滚道 / 炮塔防盾随 L4-c，座圈螺栓圈见下（L4-d）。",
  });

  // ===================== 顶甲板附件（L4-d） =====================
  const ringTop = roofTop + c.HULL_JOINT! + c.HULL_RING_T!; // 1.108

  add({
    id: "tiger.hull.hatch_lid",
    name_cn: "驾驶员 / 无线电员舱盖盖板",
    name_en: "Fahrer- und Funkerluke (Deckel)",
    assembly: "hull",
    build_layer: 4,
    build_order: 520,
    geometry: {
      type: "kit",
      kit: "hatchLid",
      params: { r: c.HULL_HATCH_LID_R!, t: c.HULL_HATCH_LID_T! },
    },
    material: "armor_steel",
    instances: 2,
    indexed: true,
    instance_layout: HULL_LAYOUTS.mirrorZ,
    mate: {
      type: "absolute",
      position: [c.HULL_HATCH_X! - c.HULL_HATCH_R!, roofTop + c.HULL_JOINT!, 0],
      rotation: [0, 0, 90],
    },
    source:
      "驾驶员 / 无线电员舱盖盖板（Fahrer- und Funkerluke）：⌀430 × 22 圆盘 + 隆起 + 铰链节（⌀30）+ 把手 + 锁扣，按「打开 90°（立起）」姿态摆放——铰链线在舱口前缘（x -3.54）、离顶甲板 3mm，盖板立起后最高点 y 1.508，离炮塔前壁（x -2.78）无干涉。打开姿态同时保留 L3 座席的俯视可见性。盖板内侧的锁扣 / 密封圈随 L5。",
  });

  add({
    id: "tiger.hull.periscope_bezel",
    name_cn: "潜望镜窗框",
    name_en: "Periskopfenster (Rahmen)",
    assembly: "hull",
    build_layer: 4,
    build_order: 521,
    geometry: {
      type: "kit",
      kit: "rectBezel",
      params: {
        wo: c.HULL_PERI_W! + 2 * 0.008,
        ho: c.HULL_PERI_H! + 2 * 0.008,
        wi: c.HULL_PERI_W!,
        hi: c.HULL_PERI_H!,
        t: c.HULL_PERI_BEZEL!,
      },
    },
    material: "steel",
    instances: 2,
    indexed: true,
    instance_layout: HULL_LAYOUTS.mirrorZ,
    mate: {
      type: "absolute",
      position: [c.HULL_PERI_X!, roofTop + c.HULL_JOINT! + c.HULL_PERI_BEZEL! / 2, 0],
    },
    source:
      "潜望镜窗框（Periskopfenster）：186 × 146 外廓、170 × 130 内口、8 高，落在潜望镜窗四周（窗比 L3 潜望镜体 160 × 120 每边放大 5mm，窗框再压 8mm 边）。离顶甲板上表面 3mm——窗框是薄框，俯视时正好把开孔的板边盖住。",
  });

  add({
    id: "tiger.hull.driver_visor",
    name_cn: "驾驶员观察窗",
    name_en: "Fahrersehklappe",
    assembly: "hull",
    build_layer: 4,
    build_order: 522,
    geometry: {
      type: "kit",
      kit: "visorPlate",
      params: { w: 0.035, h: 0.16, d: 0.36 },
    },
    material: "armor_steel",
    mate: { type: "absolute", position: [c.HULL_VISOR_X!, c.HULL_VISOR_Y!, -0.67] },
    source:
      "驾驶员观察窗（Fahrersehklappe）：360 × 160 × 35 装甲块 + 上部压条 + 下部遮光檐，装在前装甲板外面（x -4.503 ~ -4.553，离板面 3mm），中心高 y 0.93（L3 驾驶员座面 0.57 + 坐姿视线高）。z -0.67 与驾驶员座对齐；右侧 z +0.78 是航向机枪球孔（Kugelblende 50，随 L4-e）。",
  });

  add({
    id: "tiger.hull.ring_bolts",
    name_cn: "座圈螺栓圈",
    name_en: "Turmdrehkranz-Schrauben",
    assembly: "hull",
    build_layer: 4,
    build_order: 523,
    geometry: {
      type: "kit",
      kit: "hexBolt",
      params: { r: c.HULL_RING_BOLT_HEAD_R!, h: 0.01 },
    },
    material: "steel",
    instances: c.HULL_RING_BOLT_COUNT!,
    indexed: true,
    instance_layout: HULL_LAYOUTS.ringBolts,
    mate: { type: "absolute", position: [c.HULL_TURRET_X!, ringTop + c.HULL_JOINT!, 0] },
    source:
      "座圈螺栓圈（Turmdrehkranz-Schrauben，六角头 ⌀24 × 10）：沿 r 0.8425 的圆周均布 24 颗（周向间距 221mm），落在座圈内孔（r 0.825）与炮塔内壁（r 0.86）之间的环形台阶上，离座圈顶面 3mm、离炮塔内壁 5.5mm。实车座圈螺栓为 M20 级、连接炮塔防盾与座圈滚道；装配状态下被炮塔壳体覆盖，仅拆解 / 隔离时可见——与 L1/L2 的箱内零件同一处理口径。",
  });

  // ===================== L4-e：航向机枪球座 / 备用履带板 / 吊环 =====================
  const frontOut = c.HULL_FRONT_INNER! - c.HULL_FRONT_T!; // -4.50

  add({
    id: "tiger.hull.mg_mount",
    name_cn: "航向机枪球形枪座",
    name_en: "Kugelblende 50",
    assembly: "hull",
    build_layer: 4,
    build_order: 540,
    geometry: {
      type: "kit",
      kit: "mgBall",
      params: {
        rOuter: c.HULL_MG_BALL_RO!,
        rInner: c.HULL_MG_BALL_RI!,
        t: c.HULL_MG_BALL_T!,
        rBall: c.HULL_MG_BALL_RB!,
        protrude: c.HULL_MG_BALL_PROTRUDE!,
        gap: c.HULL_JOINT!,
      },
    },
    material: "armor_steel",
    mate: {
      type: "absolute",
      position: [frontOut, c.HULL_MG_HOLE_Y!, c.HULL_MG_HOLE_Z!],
    },
    source:
      "航向机枪球形枪座（Kugelblende 50）：座圈 ⌀280 / 内孔 ⌀170 × 30 + 球冠 ⌀230（凸出 100，底 φ229 止于板面前 3mm）+ 座圈螺栓 8 颗；与首装甲板 ⌀100 机枪球孔同心（y 0.16 / z 0.78）。实车 Kugelblende 50 是 50mm 厚的球形防盾，MG34 经球座万向转动、由无线电员操作；座圈外缘到驾驶员观察窗（z -0.67）的净空 1.20m。球冠顶点 x -4.605。",
  });

  add({
    id: "tiger.hull.mg34_barrel",
    name_cn: "航向机枪枪管",
    name_en: "MG34 Lauf (Bug-MG)",
    assembly: "hull",
    build_layer: 4,
    build_order: 541,
    geometry: {
      type: "kit",
      kit: "mgBarrel",
      params: { r: c.HULL_MG_BARREL_R!, len: c.HULL_MG_BARREL_L! },
    },
    material: "steel",
    mate: {
      type: "absolute",
      position: [
        frontOut - c.HULL_MG_BALL_PROTRUDE! - 2 * c.HULL_JOINT!,
        c.HULL_MG_HOLE_Y!,
        c.HULL_MG_HOLE_Z!,
      ],
    },
    source:
      "航向机枪枪管（MG34）：枪管 ⌀24 × 300 + 散热套 ⌀54 × 160（前后两道箍）+ 枪口助退器（⌀36 / ⌀26 两级）+ 准星座，自球冠顶点前 3mm 起（x -4.606 ~ -4.968）。实车 MG34 全长 1.22m，车装机枪枪管伸出车头约 0.4m；枪口比首装甲板外表面前伸 0.468m。",
  });

  add({
    id: "tiger.hull.spare_track",
    name_cn: "备用履带板",
    name_en: "Ersatzkette (Bug)",
    assembly: "hull",
    build_layer: 4,
    build_order: 542,
    geometry: {
      type: "kit",
      kit: "trackLink",
      params: {
        pitch: "TRACK_PIN_PITCH",
        halfWidth: "TRACK_HALF_W",
        hornInner: "TRACK_HORN_INNER",
        hornOuter: "TRACK_HORN_OUTER",
        hornDepth: "TRACK_HORN_DEPTH",
        holeR: "TRACK_PIN_HOLE_R",
      },
    },
    material: "steel_worn",
    instances: c.HULL_SPARE_COUNT!,
    indexed: true,
    instance_layout: HULL_LAYOUTS.glacisSpare,
    mate: { type: "absolute" },
    source:
      "随车备用履带板 ×3（Ersatzkette）：复用 L2 履带板 kit（Kgs 63/725/130 同一块板），板面贴首装甲板外面 3mm、触地面朝车体、导向齿朝车头，3 块沿竖直方向叠成一列（列心 x -4.535、y 0.557 ~ 0.933、车宽中段）。实车虎 I 在首上装甲与炮塔侧壁都挂备用履带板（725 × 130、约 60kg / 块）：既备损件、又给正面加一层「附加装甲」。",
  });

  add({
    id: "tiger.hull.lifting_eye",
    name_cn: "焊接吊环",
    name_en: "Anschlagpunkt",
    assembly: "hull",
    build_layer: 4,
    build_order: 543,
    geometry: {
      type: "kit",
      kit: "liftingEye",
      params: { w: 0.1, d: 0.07, t: 0.012 },
    },
    material: "steel",
    instances: 3,
    indexed: true,
    instance_layout: HULL_LAYOUTS.roofEyes,
    mate: {
      type: "absolute",
      position: [c.HULL_EYE_X!, c.HULL_ROOF_UNDER! + c.HULL_ROOF_T! + c.HULL_JOINT!, 0],
    },
    source:
      "焊接吊环（Anschlagpunkt）×3：底板 100 × 70 × 12 + 两片立板 + ⌀16 横销，焊在战斗室顶甲板上表面（离面 3mm）——两个前角（x -4.15 / z ±0.85）+ 前段中央（x -2.62 / z 0）；吊环供吊装炮塔 / 车体、以及野战检修时起吊总成。实车虎 I 的吊点在车体四角与发动机舱两侧，本模型按「两前角 + 中前」三只简化，避让潜望镜窗框（x -4.043 起）与舱盖孔（z ±0.66）。",
  });

  parts.push({
    id: "tiger.hull.track_guard",
    name_cn: "履带挡板 / 前后挡泥板",
    name_en: "Kotflügel",
    assembly: "hull",
    build_layer: 4,
    build_order: 552,
    geometry: {
      type: "kit",
      kit: "trackGuard",
      params: { len: 5.41, width: 0.94, t: 0.015, flapLen: 0.26, flapAngle: 35, ribH: 0.1 },
    },
    material: "armor_steel",
    instances: 2,
    indexed: true,
    instance_layout: HULL_LAYOUTS.trackGuard,
    mate: {
      type: "absolute",
      position: [c.HULL_FRONT_INNER! - c.HULL_FRONT_T!, 0.1, 0],
    },
    source:
      "履带挡板（Kotflügel）：5.41 m × 0.94 m × 15mm 薄钢板 + 前后各一块 260mm 活页挡泥板（下折 35°）+ 内侧 5 道支撑肋（18 × 100 × 520，贴车体侧留 3mm）。内缘离车体侧壁 3mm（z ±0.9655），外缘到 z ±1.905（履带外缘 1.8525 外 52mm），板面 y 0.10（履带顶 −0.24 上方 340mm）。实车挡板挂在赞助板（z ±1.78）下缘、宽约 300mm；本模型上部车体尚未补，先按下部车体侧壁外伸的整块挡板做，L4-g 上部车体落地后缩到 300mm 并改挂 z ±1.78。",
  });

  return parts;
}

export function makeHullRegistry(): ModelRegistry {
  return {
    model: "tiger",
    title: "虎式 I 车体外壳（L4）",
    subtitle: "地板 / 侧装甲板 / 前后装甲板 / 发动机隔板 / 战斗室顶甲板 / 发动机舱盖 / 炮塔座圈",
    source_notes: [
      "公开资料：虎式 I 车体为焊接箱型结构，前装甲 100mm、侧装甲 60mm、后装甲 80mm、地板 26mm、顶甲板 25mm；首上装甲 9° 倾角；发动机舱在后、战斗室居中、驾驶舱在前，传动轴沿车体中线穿过发动机隔板。",
      "本模型口径（与 L1/L2/L3 接口一致）：地板顶面 -0.305、侧板内表面 ±0.90 / 外表面 ±0.9625、前装甲板内表面 -4.40、战斗室顶下表面 1.05、板顶 1.045；车体箱 x -4.50 ~ 0.91、z ±0.9625、y -0.335 ~ 1.105（发动机舱盖顶）。",
      "开孔（对外契约）：侧板 ⌀110 ×2（侧传动轴，x -4.05、y 0）、前板 ⌀100 ×1（航向机枪球孔，y 0.16、z 0.78）、发动机隔板 ⌀180 ×1（传动轴，y 0、z 0）、顶甲板 ⌀1650 ×1（炮塔座圈，x -1.65、z 0）+ ⌀440 舱盖孔 ×2（x -3.32、z ±0.66）+ 170 × 130 潜望镜窗 ×2（x -3.95、z ±0.66）。",
      "阶梯甲板：发动机舱盖（下表面 1.08 / 上表面 1.105）比战斗室顶（1.05 / 1.075）高 30mm，为 L1 空滤（顶 1.056）与卡箍（顶 1.053）让高；台阶立板在隔板上方、两侧用发动机舱侧围封边。",
      "简化记录（待补）：焊接吊环 ×3（L4-e）、首上备用履带板（L4-e）、翼子板与挡泥板（L4-e）、焊缝、暗黄涂装、铁十字与战术编号（L5）；下部车体（腹板 + 扭杆通道 + 车底侧裙）与内饰面象牙白内衬板（M-C）。",
    ].join("\n"),
    constants: HULL_CONSTANTS,
    assemblies: [{ id: "hull", name_cn: "车体外壳", name_en: "hull shell", explode: [0, 1.5, 0] }],
    nodes: [],
    materials: {
      armor_steel: {
        base: "#8b9199",
        metalness: 0.46,
        roughness: 0.5,
        preset: "steel",
        envMapIntensity: 1.2,
      },
    },
    parts: buildHullParts(),
  };
}

export function makeHullLayouts(): Record<string, InstanceLayout> {
  return makeLayouts();
}
