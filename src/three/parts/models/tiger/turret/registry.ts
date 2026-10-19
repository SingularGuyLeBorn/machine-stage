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
// 建模口径（简化记录，L4-d / L5 待补）：
//   1. 本批不含：装填手舱口 / 车长塔顶盖口 / 后部逃生门 / 手枪孔 / 抛壳窗 / 焊接吊环（L4-d）；
//      座圈滚道与座圈螺栓圈（L4-d）、焊缝与暗黄涂装（L5）。
//   2. 炮塔内壁（r 0.86）与座圈内孔（r 0.825）之间留 35mm 环形台阶——战斗舱内饰（弹药架 /
//      炮闩 / 吊篮，L3 第二批）按内壁 r 0.86、顶盖下表面 1.811 定位。
//   3. 炮盾 / 炮管按静止姿态建模（炮管水平、俯仰角 0）；俯仰耳轴与后坐复进机随 L4-d。
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
};

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
  return {};
}
