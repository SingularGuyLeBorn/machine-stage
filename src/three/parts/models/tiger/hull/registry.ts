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
// 建模口径（简化记录，M-C / L4-b / L5 待补）：
//   1. 本批不含：顶甲板与炮塔座圈（L4-b）、炮塔壳体（L4-c）、舱盖 / 观察窗 / 手枪孔 /
//      Kugelblende 50 球形枪座 / 翼子板（L4-c/d）、焊缝与暗黄涂装（L5）。
//   2. 下部车体（腹板 + 扭杆通道 + 车底侧裙）未建：扭杆（y -0.585）与摆臂枢轴（z ±1.10）
//      在实车位于车体侧壁之内，本模型 L2 把它们放在「地板之下、侧板之外」，
//      底板落地时需一并重排（M-C）。
//   3. 板与板之间一律 3mm 名义缝（不接触、不报缺陷）；内饰面象牙白内衬板随 L5 涂装批处理。
// ============================================================================

export const HULL_LAYOUTS = {
  sidePlate: "hull.sidePlate",
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
      "前装甲板（Bugplatte，厚 100；实车 9° 倾角，本模型垂直）：内表面 x -4.40（L3 仪表板 / 踏板 / 机枪球孔基准）、外表面 -4.50，z ±0.9625（贯通全宽）、y -0.335 ~ 1.045。⌀100 航向机枪球孔（y 0.16、z 0.78）：枪管 ⌀44 自孔中穿出车头外板 0.12m；Kugelblende 50 球形枪座、驾驶员观察窗、手枪孔随 L4-c。",
  });

  // ===================== 后装甲板 =====================
  add({
    id: "tiger.hull.rear_plate",
    name_cn: "后装甲板",
    name_en: "Heckplatte",
    assembly: "hull",
    build_layer: 4,
    build_order: 503,
    geometry: { type: "box", w: c.HULL_REAR_T!, h: shellH, d: sideOuter * 2, bevel: 0.004 },
    material: "armor_steel",
    mate: { type: "absolute", position: [(c.HULL_REAR_INNER! + rearOuter) / 2, shellCY, 0] },
    source:
      "后装甲板（Heckplatte，厚 80）：内表面 x 0.83、外表面 0.91，z ±0.9625、y -0.335 ~ 1.045；离发动机风扇后端（x 0.726）104mm。排气管 / 尾灯 / 逃生门随 L5 表面附件。",
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

  return parts;
}

export function makeHullRegistry(): ModelRegistry {
  return {
    model: "tiger",
    title: "虎式 I 车体外壳（L4）",
    subtitle: "地板 / 侧装甲板 / 前后装甲板 / 发动机隔板",
    source_notes: [
      "公开资料：虎式 I 车体为焊接箱型结构，前装甲 100mm、侧装甲 60mm、后装甲 80mm、地板 26mm、顶甲板 25mm；首上装甲 9° 倾角；发动机舱在后、战斗室居中、驾驶舱在前，传动轴沿车体中线穿过发动机隔板。",
      "本模型口径（与 L1/L2/L3 接口一致）：地板顶面 -0.305、侧板内表面 ±0.90 / 外表面 ±0.9625、前装甲板内表面 -4.40、板顶 1.045（顶甲板下表面 1.05，L4-b）；车体箱 x -4.50 ~ 0.91、z ±0.9625、y -0.335 ~ 1.045。",
      "开孔（对外契约）：侧板 ⌀110 ×2（侧传动轴，x -4.05、y 0）、前板 ⌀100 ×1（航向机枪球孔，y 0.16、z 0.78）、发动机隔板 ⌀180 ×1（传动轴，y 0、z 0）。",
      "简化记录（待补）：顶甲板 / 座圈 / 舱盖 / 观察窗 / 手枪孔 / Kugelblende 50 球座 / 翼子板（L4-b~d）；焊缝、暗黄涂装、铁十字与战术编号（L5）；下部车体（腹板 + 扭杆通道 + 车底侧裙）与内饰面象牙白内衬板（M-C）。",
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
