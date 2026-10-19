import * as THREE from "three";
import type { InstanceLayout } from "../../../assembler/assembler";
import type { ModelRegistry, PartDefinition } from "../../../registry/types";

// ============================================================================
// models/tiger/turret —— 虎式 I 炮塔（L4 第三批：壳体 + 车长指挥塔 + 炮盾 + 炮管）
//
// 坐标系沿用 L1~L4：+X 朝车尾、+Y 上、+Z 车体右侧；地面 GROUND_Y = -1.10。
//
// 本批的落地依据是 L4-b 的炮塔座圈（对外接口）：圆心 x -1.65 / z 0，内 ⌀1650、外 ⌀1750、
// 顶面 y 1.108。炮塔壳体下沿坐在它上方 3mm（实车炮塔经滚道坐在座圈上，模型按名义缝浮放）。
//
// 口径（公开资料 + 本模型换算）：
//   1. 虎 I 炮塔为马蹄形焊接壳体：正面 120mm、侧后 80mm、顶盖 25mm；平面外廓 1.88 宽
//      （车体 1.925，实车炮塔略窄于车体），壁高 700 —— 顶盖顶面 1.836，指挥塔顶 1.999。
//   2. 车长指挥塔在炮塔左后（车长位于火炮左侧），5 个周向观察缝；实车塔内另有潜望镜。
//   3. 主炮 8.8 cm KwK 36 L/56 经炮盾（Blende）中央开口伸出，炮口带双室制退器；炮管轴线
//      y 1.45（座圈顶面以上 342mm），炮口到 x -6.47。
//   4. 炮塔后段悬在发动机舱盖前段上方（实车同样如此）：壳体下沿 1.111 离舱盖顶面 1.105
//      只有 6mm，但两者不接触——吃完这一 6mm 余量之前不要抬发动机舱盖。
//
// 建模口径（简化记录，L4-f / L5 待补）：
//   1. 已完成：壳体 + 指挥塔 + 炮盾 + 炮管（L4-c）、装填手舱口 / 车长塔顶盖 / 后部逃生门 /
//      手枪孔 ×2 / 抛壳窗 / 同轴机枪球座 + 枪管 / 炮长瞄准镜开口（L4-d）、
//      烟雾弹发射器 ×6 / 左壁备用履带板 ×5 / 顶盖吊环 ×2（L4-e）。
//   2. 本批不含：塔内潜望镜与顶盖内侧锁扣（L4-f）、炮管抽烟装置与俯仰耳轴 / 后坐复进机
//      （L4-f）、车顶 MG34 防空枪架（L4-f）、焊缝与暗黄涂装（L5）。
//   3. 炮塔内壁（r 0.86）与座圈内孔（r 0.825）之间留 35mm 环形台阶——战斗舱内饰（弹药架 /
//      炮闩 / 吊篮，L3 第二批）按内壁 r 0.86、顶盖下表面 1.811 定位。
//   4. 炮盾 / 炮管按静止姿态建模（炮管水平、俯仰角 0）；俯仰耳轴与后坐复进机随 L4-e。
// ============================================================================

const TURRET_CONSTANTS: Record<string, number> = {
  // —— 基准（L4-b 座圈，对外接口）——
  TR_RING_X: -1.65,
  TR_RING_TOP: 1.108,
  TR_RING_RO: 0.875,

  // —— 缝（沿用 HULL_JOINT 口径）——
  TR_JOINT: 0.003,

  // —— 壳体 ——
  TR_R_OUT: 0.94,
  TR_R_IN: 0.86,
  TR_FRONT_OUT: -2.78,
  TR_FRONT_T: 0.12,
  TR_WALL_H: 0.7,
  TR_ROOF_T: 0.025,

  // —— 车长指挥塔 ——
  TR_CUPOLA_X: -1.3,
  TR_CUPOLA_Z: -0.42,
  TR_CUPOLA_R: 0.26,
  TR_CUPOLA_H: 0.13,
  TR_CUPOLA_CAP_T: 0.03,

  // —— 火炮 ——
  TR_GUN_Y: 1.45,
  TR_MANTLET_W: 0.24,
  TR_MANTLET_H: 0.56,
  TR_MANTLET_D: 0.86,
  TR_COLLAR_R: 0.16,
  TR_COLLAR_L: 0.1,
  TR_BARREL_L: 3.34,
  TR_BARREL_R: 0.105,

  // —— 舱口 / 门 / 孔（L4-d）——
  TR_LOADER_HATCH_X: -1.25,
  TR_LOADER_HATCH_Z: 0.5,
  TR_LOADER_HATCH_R: 0.2,
  TR_LOADER_HATCH_T: 0.022,
  TR_CUPOLA_HATCH_R: 0.17,
  TR_CUPOLA_HATCH_T: 0.02,
  TR_ESCAPE_Y1: 1.29,
  TR_PORT_Y: 1.55,
  TR_PORT_ANGLE: 55,
  TR_PORT_R: 0.045,
  TR_PORT_H: 0.022,
  TR_PORT_RMID: 0.954,
  TR_EJECT_X: -2.1,
  TR_EJECT_Y: 1.42,
  TR_COAX_Z: 0.24,
  TR_COAX_R: 0.075,
  TR_COAX_L: 0.12,
  TR_COAX_BARREL_R: 0.022,
  TR_COAX_BARREL_L: 0.3,
  TR_SIGHT_Z: -0.24,
  TR_SIGHT_Y: 1.58,

  // —— 烟雾弹发射器 / 备用履带板 / 吊环（L4-e）——
  TR_SMOKE_X: -2.6,
  TR_SMOKE_Y1: 1.66,
  TR_SMOKE_DY: 0.11,
  TR_SMOKE_R: 0.045,
  TR_SMOKE_LEN: 0.15,
  TR_SMOKE_AXIS_Z: 0.075,
  TR_SPARE_X: -2.15,
  TR_SPARE_Y1: 1.2,
  TR_SPARE_COUNT: 4,
  TR_EYE_X: -2.55,
  TR_EYE_Z: 0.7,
};

export const TURRET_LAYOUTS = {
  pistolPort: "turret.pistolPort",
  smokeDischarger: "turret.smokeDischarger",
  spareTrack: "turret.spareTrack",
  roofEyes: "turret.roofEyes",
} as const;

function makeLayouts(): Record<string, InstanceLayout> {
  const layouts: Record<string, InstanceLayout> = {};

  // 手枪孔 ×2：按后部圆弧 ±55° 摆放（几何轴沿 +X，随圆周转向）
  layouts[TURRET_LAYOUTS.pistolPort] = ({ index }) => {
    const deg = index === 0 ? TURRET_CONSTANTS.TR_PORT_ANGLE! : -TURRET_CONSTANTS.TR_PORT_ANGLE!;
    const a = THREE.MathUtils.degToRad(deg);
    return new THREE.Matrix4()
      .makeRotationY(-a)
      .multiply(new THREE.Matrix4().makeTranslation(TURRET_CONSTANTS.TR_PORT_RMID!, 0, 0));
  };

  // 烟雾弹发射器 ×6：每侧 3 具挂在炮塔前侧壁（x -2.60 由 mate 装配位给出），扇形张开——
  // 上管近水平、中管俯 12° / 外张 15°、下管俯 24° / 外张 26°（实车「上管朝前、下管逐级下俯外张」）。
  // 左侧按 rotX(180°) 镜像（kit 关于局部 XY 面对称，镜像不可察觉），保证球形脚仍在车外一侧；
  // 镜像会翻转仰角符号，所以左侧的俯仰角改用 +pitch 抵消。
  layouts[TURRET_LAYOUTS.smokeDischarger] = ({ index }) => {
    const side = index < 3 ? 1 : -1;
    const k = index % 3;
    const elev = [0, -12, -24][k];
    const out = [5, 15, 26][k];
    const y = TURRET_CONSTANTS.TR_SMOKE_Y1! - k * TURRET_CONSTANTS.TR_SMOKE_DY!;
    const z = side * (TURRET_CONSTANTS.TR_R_OUT! + TURRET_CONSTANTS.TR_JOINT!);
    const yaw = THREE.MathUtils.degToRad(out);
    const pitch = THREE.MathUtils.degToRad(elev);
    const m = new THREE.Matrix4();
    if (side > 0) m.makeRotationY(yaw);
    else m.makeRotationX(Math.PI).multiply(new THREE.Matrix4().makeRotationY(yaw));
    m.multiply(new THREE.Matrix4().makeRotationZ(side > 0 ? -pitch : pitch));
    // 平移只给 y / z——x 由 mate 的装配位（TR_SMOKE_X）提供，避免复合两次
    m.setPosition(0, y, z);
    return m;
  };

  // 备用履带板 ×4：挂在炮塔左壁（z -0.94）——板面贴壁、导向齿朝外，4 块沿竖直方向叠成一列。
  // 含铰接耳的总高 = 4 × 节距 + 0.182 ≈ 574mm（壁高 700，上下各留 63mm），不会顶到顶盖 / 座圈。
  // 局部系 → 世界：+X（节距方向）→ +Y；+Y（触地面）→ +Z（朝壁）；+Z（板宽）→ +X。
  layouts[TURRET_LAYOUTS.spareTrack] = ({ index, constants }) => {
    const pitch = constants.TRACK_PIN_PITCH ?? 0.13;
    const basis = new THREE.Matrix4().makeBasis(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(1, 0, 0),
    );
    basis.setPosition(
      TURRET_CONSTANTS.TR_SPARE_X!,
      TURRET_CONSTANTS.TR_SPARE_Y1! + index * pitch,
      -(TURRET_CONSTANTS.TR_R_OUT! + TURRET_CONSTANTS.TR_JOINT! + 0.032),
    );
    return basis;
  };

  // 顶部吊环 ×2：炮塔顶盖前段两角（z ±0.70）
  layouts[TURRET_LAYOUTS.roofEyes] = ({ index }) => {
    const z = TURRET_CONSTANTS.TR_EYE_Z!;
    return new THREE.Matrix4().makeTranslation(0, 0, index === 0 ? z : -z);
  };

  return layouts;
}

// ---------------------------------------------------------------------------
// 零件
// ---------------------------------------------------------------------------

function buildTurretParts(): PartDefinition[] {
  const parts: PartDefinition[] = [];
  const add = (part: PartDefinition) => parts.push(part);

  const c = TURRET_CONSTANTS;
  // 由基准面推出的复合尺寸
  const shellBottom = c.TR_RING_TOP! + c.TR_JOINT!; // 1.111
  const shellTop = shellBottom + c.TR_WALL_H!; // 1.811
  const roofTop = shellTop + c.TR_ROOF_T!; // 1.836
  const cupolaBase = roofTop + c.TR_JOINT!; // 1.839
  const mantletFront = c.TR_FRONT_OUT! - c.TR_JOINT!; // -2.783
  const mantletCX = mantletFront - c.TR_MANTLET_W! / 2; // -2.903
  const collarFront = mantletCX - c.TR_MANTLET_W! / 2 - c.TR_COLLAR_L!; // -3.123
  const barrelX = collarFront - c.TR_JOINT!; // -3.126

  // ===================== 炮塔壳体（壁 + 顶盖） =====================
  add({
    id: "tiger.turret.shell",
    name_cn: "炮塔壳体",
    name_en: "Turmschale",
    assembly: "turret",
    build_layer: 4,
    build_order: 510,
    geometry: {
      type: "kit",
      kit: "turretShell",
      params: {
        rOut: c.TR_R_OUT!,
        rIn: c.TR_R_IN!,
        frontOut: c.TR_FRONT_OUT! - c.TR_RING_X!,
        frontTh: c.TR_FRONT_T!,
        wallH: c.TR_WALL_H!,
        roofT: c.TR_ROOF_T!,
      },
    },
    material: "armor_steel",
    mate: { type: "absolute", position: [c.TR_RING_X!, shellTop, 0], rotation: [90, 0, 0] },
    source:
      "炮塔壳体（Turmschale）：马蹄形平面——前壁 120mm + 两侧 80mm 平行壁 + 后部半圆 80mm，外廓 1.88 宽（车体半宽 0.9625，实车炮塔略窄于车体）、壁高 700 + 顶盖 25。下沿坐在炮塔座圈（顶面 1.108）上方 3mm：y 1.111 ~ 1.811、顶盖顶面 1.836。后部半圆外缘到 x -0.71，悬在发动机舱盖（顶 1.105）上方 6mm、发动机隔板（顶 1.045）上方 66mm——实车炮塔后段同样悬在发动机舱盖前段上方。前壁外面 x -2.78，离驾驶员舱盖孔后缘（x -3.10）320mm。装填手舱口 / 后部逃生门 / 手枪孔 / 抛壳窗随 L4-d。",
  });

  // ===================== 车长指挥塔 =====================
  add({
    id: "tiger.turret.cupola",
    name_cn: "车长指挥塔",
    name_en: "Kommandantenkuppel",
    assembly: "turret",
    build_layer: 4,
    build_order: 511,
    geometry: {
      type: "kit",
      kit: "turretCupola",
      params: {
        r: c.TR_CUPOLA_R!,
        h: c.TR_CUPOLA_H!,
        capR: c.TR_CUPOLA_R! + 0.012,
        capT: c.TR_CUPOLA_CAP_T!,
        slits: 5,
      },
    },
    material: "armor_steel",
    mate: { type: "absolute", position: [c.TR_CUPOLA_X!, cupolaBase, c.TR_CUPOLA_Z!] },
    source:
      "车长指挥塔（Kommandantenkuppel）：圆筒 ⌀520 × 130 + 顶盖 ⌀544 × 30，坐在炮塔顶盖（1.836）上方 3mm（y 1.839 ~ 1.999，全车最高点），5 个 100 × 55 观察缝沿周向均布。平面位置取炮塔左后（x -1.30、z -0.42）——车长位于火炮左侧、无线电员在车体右侧，塔底离炮塔内壁 53mm。顶盖口 / 铰链 / 塔内潜望镜随 L4-d。",
  });

  // ===================== 炮盾 =====================
  add({
    id: "tiger.turret.mantlet",
    name_cn: "炮盾",
    name_en: "Blende",
    assembly: "turret",
    build_layer: 4,
    build_order: 512,
    geometry: {
      type: "kit",
      kit: "turretMantlet",
      params: {
        w: c.TR_MANTLET_W!,
        h: c.TR_MANTLET_H!,
        d: c.TR_MANTLET_D!,
        collarR: c.TR_COLLAR_R!,
        collarL: c.TR_COLLAR_L!,
      },
    },
    material: "armor_steel",
    mate: { type: "absolute", position: [mantletCX, c.TR_GUN_Y!, 0] },
    source:
      "炮盾（Blende，120mm 铸造装甲）：860 宽 × 560 高 × 240 厚，盖住炮塔前壁中央（z ±0.43，两侧到壳体外面各剩 510mm 前壁直段）；内面离炮塔前壁外面 3mm（x -2.783 ~ -3.023）。中央炮口套环 ⌀320 × 100 前伸，炮管自套环前面 3mm 处起（x -3.126）。竖直方向盖住壳体高度（1.111 ~ 1.811）的 1.17 ~ 1.73 段，下留 59mm、上留 81mm 板边。同轴 MG34 球口 / 瞄准镜开口随 L4-d。",
  });

  // ===================== 8.8cm 炮管 =====================
  add({
    id: "tiger.turret.gun_barrel",
    name_cn: "8.8cm 炮管",
    name_en: "8,8 cm KwK 36 L/56",
    assembly: "turret",
    build_layer: 4,
    build_order: 513,
    geometry: {
      type: "kit",
      kit: "turretGunBarrel",
      params: {
        length: c.TR_BARREL_L!,
        rBase: c.TR_BARREL_R!,
        rMid: 0.084,
        rFront: 0.062,
        brakeR: 0.092,
      },
    },
    material: "steel",
    mate: { type: "absolute", position: [barrelX, c.TR_GUN_Y!, 0] },
    source:
      "8,8 cm KwK 36 L/56 炮管：基段 ⌀210 → 中段 ⌀168 → 前段 ⌀124，炮口双室制退器 ⌀184 × 320（全长 3.34 m，自炮盾套环前面起）。炮口 x -6.466——伸出首装甲外面（-4.50）1.97 m（实车约 2.1 m）。轴线 y 1.45（座圈顶面以上 342mm）：炮管下缘离战斗室顶甲板（顶面 1.075）270mm、离驾驶员潜望镜（顶 1.048）无干涉。抽烟装置 / 俯仰耳轴 / 后坐复进机随 L4-d。",
  });

  // ===================== 舱口 / 门 / 炮盾附件（L4-d） =====================
  const loaderHatchY = roofTop + c.TR_JOINT!; // 顶盖顶面 + 3mm
  const cupolaHatchY = cupolaBase + c.TR_CUPOLA_H! + c.TR_CUPOLA_CAP_T! + c.TR_JOINT!; // 1.999 + 3mm
  const mantletFace = mantletCX - c.TR_MANTLET_W! / 2; // -3.023

  // 装填手舱口盖板（闭式）
  add({
    id: "tiger.turret.loader_hatch",
    name_cn: "装填手舱口盖板",
    name_en: "Ladeluke (Deckel)",
    assembly: "turret",
    build_layer: 4,
    build_order: 530,
    geometry: {
      type: "kit",
      kit: "hatchDisc",
      params: { r: c.TR_LOADER_HATCH_R!, t: c.TR_LOADER_HATCH_T! },
    },
    material: "armor_steel",
    mate: {
      type: "absolute",
      position: [c.TR_LOADER_HATCH_X!, loaderHatchY, c.TR_LOADER_HATCH_Z!],
    },
    source:
      "装填手舱口盖板（Ladeluke）：⌀400 × 22 盖板 + 隆起 + 铰链座（+X 侧，朝车尾开）+ 两个锁扣，平放在炮塔顶盖上（离顶盖 3mm，y 1.839 ~ 1.875）。平面位置取炮塔右后（x -1.25、z +0.50，装填手位于火炮右侧）——舱口外缘离炮塔内壁 20mm、离车长塔外缘 450mm。实车装填手舱口带潜望镜，本模型随 L4-e。",
  });

  // 车长塔顶盖
  add({
    id: "tiger.turret.cupola_hatch",
    name_cn: "车长塔顶盖",
    name_en: "Kuppeldeckel",
    assembly: "turret",
    build_layer: 4,
    build_order: 531,
    geometry: {
      type: "kit",
      kit: "hatchDisc",
      params: { r: c.TR_CUPOLA_HATCH_R!, t: c.TR_CUPOLA_HATCH_T! },
    },
    material: "armor_steel",
    mate: {
      type: "absolute",
      position: [c.TR_CUPOLA_X!, cupolaHatchY, c.TR_CUPOLA_Z!],
    },
    source:
      "车长塔顶盖（Kuppeldeckel）：⌀340 × 20 盖板 + 隆起 + 铰链座 + 两个锁扣，坐在车长塔顶面（1.999）上方 3mm（y 2.002 ~ 2.034）——全车最高点。盖板外缘离塔顶边缘（⌀544）85mm，铰链朝车尾一侧。塔内潜望镜 / 顶盖内侧锁扣随 L4-e。",
  });

  // 后部逃生门（曲面壁板）
  add({
    id: "tiger.turret.escape_door",
    name_cn: "炮塔后部逃生门",
    name_en: "Notausstieg (Turmschale hinten)",
    assembly: "turret",
    build_layer: 4,
    build_order: 532,
    geometry: { type: "kit", kit: "curvedPanel", params: {} },
    material: "armor_steel",
    mate: { type: "absolute", position: [c.TR_RING_X!, c.TR_ESCAPE_Y1!, 0] },
    source:
      "后部逃生门（Notausstieg）：随炮塔后部圆弧的环扇形门——内层 440 宽 × 440 高 × 12（门框）、外层 400 × 400 × 10（门板，两级叠合），贴着壳体外面 3mm（r 0.943 ~ 0.965）。门板下沿 1.29、上沿 1.73——下留 179mm、上留 81mm 板边。铰链在右侧、门把手随 L5。",
  });

  // 手枪孔 ×2
  add({
    id: "tiger.turret.pistol_port",
    name_cn: "手枪孔",
    name_en: "Pistolenport",
    assembly: "turret",
    build_layer: 4,
    build_order: 533,
    geometry: {
      type: "kit",
      kit: "radialPort",
      params: { r: c.TR_PORT_R!, h: c.TR_PORT_H! },
    },
    material: "steel",
    instances: 2,
    indexed: true,
    instance_layout: TURRET_LAYOUTS.pistolPort,
    mate: { type: "absolute", position: [c.TR_RING_X!, c.TR_PORT_Y!, 0] },
    source:
      "手枪孔（Pistolenport，⌀90 盖）：径向凸起 + ⌀117 凸缘，沿后部圆弧 ±55° 各一个（z ±0.78 一带、y 1.55），离壳体外面 3.5mm。实车两个手枪孔位于炮塔侧后壁，供乘员在车内用手枪向车外射击。",
  });

  // 抛壳窗（右侧壁平面口盖）
  add({
    id: "tiger.turret.ejection_port",
    name_cn: "抛壳窗",
    name_en: "Auswurfklappe",
    assembly: "turret",
    build_layer: 4,
    build_order: 534,
    geometry: { type: "box", w: 0.26, h: 0.16, d: 0.022, bevel: 0.003 },
    material: "armor_steel",
    mate: {
      type: "absolute",
      position: [c.TR_EJECT_X!, c.TR_EJECT_Y!, c.TR_R_OUT! + c.TR_JOINT! + 0.011],
    },
    source:
      "抛壳窗（Auswurfklappe）：260 × 160 × 22 口盖，装在炮塔右侧壁上（z 0.943 ~ 0.965，离壁面 3mm），中心 x -2.10 / y 1.42——在炮盾后方的装填手一侧，与实车「火炮右侧抛壳」的位置一致。",
  });

  // 同轴 MG34：球座 + 枪管
  add({
    id: "tiger.turret.coax_mount",
    name_cn: "同轴机枪球座",
    name_en: "MG34 (Blendenkugel)",
    assembly: "turret",
    build_layer: 4,
    build_order: 535,
    geometry: { type: "cylinder", r: c.TR_COAX_R!, h: c.TR_COAX_L!, segments: 28, bevel: 0.003 },
    material: "steel",
    mate: {
      type: "absolute",
      position: [mantletFace - c.TR_JOINT! - c.TR_COAX_L! / 2, c.TR_GUN_Y!, c.TR_COAX_Z!],
      rotation: [0, 0, 90],
    },
    source:
      "同轴机枪球座（MG34 Blendenkugel）：⌀150 × 120 座体，装在炮盾前面（x -3.026 ~ -3.146，离盾面 3mm）、主炮轴线右侧 z +0.24（离炮口套环外缘 5mm）。实车 MG34 经球座装于火炮右侧、由炮长脚踩击发；枪管见下一件。",
  });

  add({
    id: "tiger.turret.coax_barrel",
    name_cn: "同轴机枪枪管",
    name_en: "MG34 Lauf (koaxial)",
    assembly: "turret",
    build_layer: 4,
    build_order: 536,
    geometry: {
      type: "cylinder",
      r: c.TR_COAX_BARREL_R!,
      h: c.TR_COAX_BARREL_L!,
      segments: 20,
      bevel: 0.001,
    },
    material: "steel",
    mate: {
      type: "absolute",
      position: [
        mantletFace - c.TR_JOINT! - c.TR_COAX_L! - c.TR_JOINT! - c.TR_COAX_BARREL_L! / 2,
        c.TR_GUN_Y!,
        c.TR_COAX_Z!,
      ],
      rotation: [0, 0, 90],
    },
    source:
      "同轴机枪枪管（MG34 Lauf）：⌀44 × 300 枪管，自球座前面 3mm 起（x -3.149 ~ -3.449），与主炮平行。枪口 x -3.449，比主炮炮口（-6.466）短 3.02m——符合实车同轴机枪不伸出炮盾太远的比例。",
  });

  // 炮长瞄准镜开口
  add({
    id: "tiger.turret.gunner_sight",
    name_cn: "炮长瞄准镜开口",
    name_en: "Zielfernrohröffnung (TZF 9b)",
    assembly: "turret",
    build_layer: 4,
    build_order: 537,
    geometry: { type: "box", w: 0.03, h: 0.09, d: 0.18, bevel: 0.003 },
    material: "steel",
    mate: {
      type: "absolute",
      position: [mantletFace - c.TR_JOINT! - 0.015, c.TR_SIGHT_Y!, c.TR_SIGHT_Z!],
    },
    source:
      "炮长瞄准镜开口（Zielfernrohröffnung）：300 × 90 × 180 镜框，装在炮盾前面 z -0.24 / y 1.58（主炮轴线左上，炮长位于火炮左侧），离盾面 3mm。实车为 TZF 9b 双目瞄准镜的防危板开口；镜筒与防危板随 L4-e。",
  });

  // ===================== L4-e：烟雾弹发射器 / 备用履带板 / 吊环 =====================
  add({
    id: "tiger.turret.smoke_discharger",
    name_cn: "烟雾弹发射器",
    name_en: "Nebelwurfgerät",
    assembly: "turret",
    build_layer: 4,
    build_order: 544,
    geometry: {
      type: "kit",
      kit: "smokeTube",
      params: {
        rOut: c.TR_SMOKE_R!,
        len: c.TR_SMOKE_LEN!,
        axisZ: c.TR_SMOKE_AXIS_Z!,
      },
    },
    material: "steel",
    instances: 6,
    indexed: true,
    instance_layout: TURRET_LAYOUTS.smokeDischarger,
    mate: { type: "absolute", position: [c.TR_SMOKE_X!, 0, 0] },
    source:
      "烟雾弹发射器（Nebelwurfgerät）×6：每侧 3 具（管 ⌀90 × 150、内径 ⌀78、尾底厚 26）挂在炮塔前侧壁的安装柱上（柱底铸球座 ⌀60，球极点落在壁面外 3mm；锥形立柱 ⌀60→⌀42，管轴离壁 75mm）。扇形布置：上管近水平、中管俯 12°/外张 15°、下管俯 24°/外张 26°。实车 1942-08 起在炮塔两侧各装三具（Brackets 先焊、1942-10 起整机装），1943-06 因「被弹片点燃后烟雾罩住本车」而撤装；每具管长 150、口径 90，发射 Schnellnebelkerze 39 发烟弹。",
  });

  add({
    id: "tiger.turret.spare_track",
    name_cn: "备用履带板",
    name_en: "Ersatzkette (Turm)",
    assembly: "turret",
    build_layer: 4,
    build_order: 545,
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
    instances: c.TR_SPARE_COUNT!,
    indexed: true,
    instance_layout: TURRET_LAYOUTS.spareTrack,
    mate: { type: "absolute" },
    source:
      "随车备用履带板 ×4（Ersatzkette）：复用 L2 履带板 kit（同一块 Kgs 63/725/130），挂在炮塔左壁外侧——板面贴壁 3mm、导向齿朝外，4 块沿竖直方向叠成一列（列心 x -2.15、贴壁面 z -0.943、含铰接耳总高 y 1.174 ~ 1.748，上下各留 63mm 板边）。实车 1942-05 就定了「把备用履带挂到炮塔两侧」，1943-04 起改为止动销＋挂钩的正式支架，多数照片是每侧 4 块；右侧壁被抛壳窗（x -2.10）占位，故只挂左侧。",
  });

  add({
    id: "tiger.turret.lifting_eye",
    name_cn: "焊接吊环",
    name_en: "Anschlagpunkt (Turm)",
    assembly: "turret",
    build_layer: 4,
    build_order: 546,
    geometry: {
      type: "kit",
      kit: "liftingEye",
      params: { w: 0.1, d: 0.07, t: 0.012 },
    },
    material: "steel",
    instances: 2,
    indexed: true,
    instance_layout: TURRET_LAYOUTS.roofEyes,
    mate: {
      type: "absolute",
      position: [c.TR_EYE_X!, roofTop + c.TR_JOINT!, 0],
    },
    source:
      "焊接吊环（Anschlagpunkt）×2：底板 100 × 70 × 12 + 两片立板 + ⌀16 横销，焊在炮塔顶盖前段两角（x -2.55 / z ±0.70，离顶面 3mm），供吊装炮塔总成。避让车长塔（-1.30 / -0.42）、装填手舱口（-1.25 / +0.50）与炮盾（z ±0.43）；到顶盖前缘（x -2.78）留 230mm、到侧壁外缘（z ±0.94）留 240mm。",
  });

  return parts;
}

export function makeTurretRegistry(): ModelRegistry {
  return {
    model: "tiger",
    title: "虎式 I 炮塔（L4）",
    subtitle: "炮塔壳体（壁 + 顶盖）/ 车长指挥塔 / 炮盾 / 8.8cm 炮管",
    source_notes: [
      "公开资料：虎 I 炮塔为马蹄形焊接壳体，正面 120mm、侧后 80mm、顶盖 25mm；座圈内 ⌀1650（opening 即炮塔回转直径），车长指挥塔在左后、带 5 个观察缝；主炮 8.8 cm KwK 36 L/56 经炮盾伸出，炮口带双室制退器，全车炮口向前总长 8.45 m（车体 6.32 m）。",
      "本模型口径（与 L4-b 座圈接口一致）：座圈圆心 x -1.65 / z 0、顶面 1.108；壳体下沿 1.111（离座圈 3mm）、壁高 700、顶盖顶面 1.836；炮塔外廓 1.88 宽（车体 1.925）、前壁外面 x -2.78；炮管轴线 y 1.45、炮口 x -6.466。",
      "实车与模型的差异（压缩比）：实车车体长 6.32 m、本模型 5.41 m，所以炮塔相对车体显得略靠后——座圈后缘离发动机隔板 45mm 是 L4-b 的既定口径，炮塔后段（半圆外缘 x -0.71）因此悬在发动机舱盖前段上方，与实车「炮塔后悬于发动机舱」一致。",
      "简化记录（待补）：装填手舱口 / 后部逃生门 / 手枪孔 / 抛壳窗 / 焊接吊环 / 座圈滚道与螺栓圈（L4-d）；焊缝、暗黄涂装、战术编号（L5）；炮塔内部战斗舱（弹药架 / 炮闩 / 吊篮，L3 第二批）。",
    ].join("\n"),
    constants: TURRET_CONSTANTS,
    assemblies: [{ id: "turret", name_cn: "炮塔", name_en: "turret", explode: [0, 2.6, 0] }],
    nodes: [],
    materials: {},
    parts: buildTurretParts(),
  };
}

export function makeTurretLayouts(): Record<string, InstanceLayout> {
  return makeLayouts();
}
