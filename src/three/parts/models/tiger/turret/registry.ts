import * as THREE from "three";
import type { InstanceLayout } from "../../../assembler/assembler";
import type { KitParam, ModelRegistry, PartDefinition } from "../../../registry/types";

// ============================================================================
// models/tiger/turret —— 虎式 I 炮塔（L4-c ~ L4-i：壳体 / 炮盾 / 炮管 / 炮闩 / 车长塔枪座）
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
//   3. 主炮 8,8 cm KwK 36 L/56 经炮盾（Blende）中央开口伸出，炮口带双室制退器；炮管轴线
//      y 1.45（座圈顶面以上 342mm），炮口到 x -6.47。
//   4. 炮塔后段悬在发动机舱盖前段上方（实车同样如此）：壳体下沿 1.111 离舱盖顶面 1.105
//      只有 6mm，但两者不接触——吃完这一 6mm 余量之前不要抬发动机舱盖。
//
// 建模口径（L4-i 现状）：
//   1. 已完成：壳体 + 指挥塔 + 炮盾 + 炮管（L4-c）、装填手舱口 / 车长塔顶盖 / 后部逃生门 /
//      手枪孔 ×2 / 抛壳窗 / 同轴机枪球座 + 枪管 / 炮长瞄准镜开口（L4-d）、
//      烟雾弹发射器 ×6 / 左壁备用履带板 ×4 / 顶盖吊环 ×2（L4-e）、车顶环形枪座 + MG34 +
//      防盾（L4-f / L4-i）、炮闩 / 摇架 / 制退 / 复进 / 击针 / 抽壳 / 保险（L4-i）。
//   2. 炮塔前壁拆成「U 形侧后壁 + 带 ⌀270 炮口的前壁板」，炮盾开 ⌀320 孔 + 空心炮口套环；
//      炮管中空（膛径 ⌀88）并向后延伸 0.406m 穿墙进入药室。后坐/开闩/击发由
//      GunCradle → GunRecoil → BreechBlock → FiringPin 节点驱动（测试已覆盖 450mm 后坐行程）。
//   3. 炮塔内壁（r 0.86）与座圈内孔（r 0.825）之间留 35mm 环形台阶——战斗舱内饰（弹药架 /
//      炮闩 / 吊篮）按内壁 r 0.86、顶盖下表面 1.811 定位。
//   4. 炮盾 / 炮管按静止姿态建模（炮管水平、俯仰角 0）；俯仰动画需要更大的炮盾开口 +
//      活动炮口盖，随 P3 炮塔回转/俯仰一起做（当前节点只有耳轴，不做旋转驱动）。
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
  TR_COLLAR_RI: 0.15,
  TR_COLLAR_L: 0.1,
  TR_BARREL_L: 3.34,
  TR_BARREL_R: 0.105,
  TR_GUN_BORE_R: 0.044,
  TR_GUN_PORT_R: 0.135,
  TR_GUN_TAIL_EXT: 0.406,

  // —— 炮闩 / 摇架 / 后坐机（P0）——
  TR_GUN_PIVOT_X: -2.4,
  TR_BREECH_LEN: 0.42,
  TR_BREECH_H: 0.2,
  TR_BREECH_W: 0.32,
  TR_CHAMBER_R: 0.078,
  TR_CHAMBER_WALL: 0.017,
  TR_CHAMBER_LEN: 0.35,
  TR_BLOCK_LEN: 0.08,
  TR_BLOCK_H: 0.15,
  TR_BLOCK_W: 0.26,
  TR_BLOCK_DROP: 0.16,
  TR_CRADLE_FRONT: -2.657,
  TR_CRADLE_REAR: -2.18,
  TR_CRADLE_Z: 0.22,
  TR_CRADLE_HH: 0.265,
  TR_BREECH_X: -2.43,
  TR_BLOCK_X: -2.26,
  TR_FIRING_PIN_X: -2.14,
  TR_EXTRACTOR_X: -2.32,
  TR_EXTRACTOR_Y: 1.5,
  TR_EXTRACTOR_Z: 0.115,
  TR_SAFETY_X: -2.36,
  TR_SAFETY_Y: 1.39,
  TR_SAFETY_Z: -0.163,
  TR_BRAKE_X: -2.387,
  TR_BRAKE_Y: 1.66,
  TR_RECUP_X: -2.492,
  TR_RECUP_Y: 1.275,

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

  // —— 顶盖附件：对空 MG34 / 近防武器管 / 装填手潜望镜 / 排烟风扇罩（L4-f）——
  // 对空枪移到车长塔环形枪座：枪口在车长正前方 0.46m，枪托伸到塔口上方（人探身可及）。
  TR_AA_ARM: 0.46,
  TR_AA_Z_OFF: 0.13,
  TR_AA_PIVOT_UP: 0.329,
  TR_AA_SHIELD_DX: 0.68,
  TR_AA_SHIELD_UP: 0.369,
  TR_AA_PITCH: 10,
  TR_CD_X: -0.95,
  TR_CD_Z: 0.35,
  TR_LP_X: -1.35,
  TR_LP_Z: 0.5,
  TR_VENT_X: -0.92,
  TR_VENT_Z: -0.2,
};

export const TURRET_LAYOUTS = {
  pistolPort: "turret.pistolPort",
  smokeDischarger: "turret.smokeDischarger",
  spareTrack: "turret.spareTrack",
  roofEyes: "turret.roofEyes",
  aaCases: "turret.aaCases",
} as const;

function makeLayouts(): Record<string, InstanceLayout> {
  const layouts: Record<string, InstanceLayout> = {};

  // 手枪孔 ×2：按后部圆弧 ±55° 摆放（几何轴沿 +X，随圆周转向）。
  // 挂 Turret 节点后布局是节点局部：把 mate 的座圈圆心/高度也包含进来。
  layouts[TURRET_LAYOUTS.pistolPort] = ({ index }) => {
    const deg = index === 0 ? TURRET_CONSTANTS.TR_PORT_ANGLE! : -TURRET_CONSTANTS.TR_PORT_ANGLE!;
    const a = THREE.MathUtils.degToRad(deg);
    return new THREE.Matrix4()
      .makeTranslation(TURRET_CONSTANTS.TR_RING_X!, TURRET_CONSTANTS.TR_PORT_Y!, 0)
      .multiply(new THREE.Matrix4().makeRotationY(-a))
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
    // 挂 Turret 节点后布局自行包含 mate 的 x（TR_SMOKE_X）
    m.setPosition(TURRET_CONSTANTS.TR_SMOKE_X!, y, z);
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

  // 顶部吊环 ×2：炮塔顶盖前段两角（z ±0.70）。
  // 挂 Turret 节点后布局是节点局部：包含 mate 的 x / 顶盖高度。
  layouts[TURRET_LAYOUTS.roofEyes] = ({ index }) => {
    const z = TURRET_CONSTANTS.TR_EYE_Z!;
    const y =
      TURRET_CONSTANTS.TR_RING_TOP! +
      TURRET_CONSTANTS.TR_JOINT! +
      TURRET_CONSTANTS.TR_WALL_H! +
      TURRET_CONSTANTS.TR_ROOF_T! +
      TURRET_CONSTANTS.TR_JOINT!;
    return new THREE.Matrix4().makeTranslation(
      TURRET_CONSTANTS.TR_EYE_X!,
      y,
      index === 0 ? z : -z,
    );
  };

  // MG 弹壳静态落点（fx，构建时隐藏）：装填手舱口右前侧顶盖，2×6 一排
  layouts[TURRET_LAYOUTS.aaCases] = ({ index }) => {
    const col = index % 6;
    const row = Math.floor(index / 6);
    return new THREE.Matrix4().makeTranslation(-1.82 + col * 0.07, 1.843, 0.8 + row * 0.07);
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
        gunPortR: c.TR_GUN_PORT_R!,
        gunPortY: c.TR_GUN_Y! - shellBottom,
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
        collarRi: c.TR_COLLAR_RI!,
        collarL: c.TR_COLLAR_L!,
      },
    },
    material: "armor_steel",
    mate: { type: "absolute", position: [mantletCX, c.TR_GUN_Y!, 0] },
    damage: {
      damaged: {
        type: "merge",
        parts: [
          {
            type: "kit",
            kit: "turretMantlet",
            params: {
              w: c.TR_MANTLET_W!,
              h: c.TR_MANTLET_H!,
              d: c.TR_MANTLET_D!,
              collarR: c.TR_COLLAR_R!,
              collarRi: c.TR_COLLAR_RI!,
              collarL: c.TR_COLLAR_L!,
            },
          },
          {
            type: "kit",
            kit: "damageScarV",
            params: { t: c.TR_MANTLET_W!, at: [0.18, 0.14], r: 0.09, plane: "x-" },
          },
        ],
      },
      broken: {
        type: "kit",
        kit: "mantletBroken",
        params: {
          w: c.TR_MANTLET_W!,
          h: c.TR_MANTLET_H!,
          d: c.TR_MANTLET_D!,
          collarR: c.TR_COLLAR_R!,
          collarRi: c.TR_COLLAR_RI!,
          collarL: c.TR_COLLAR_L!,
        },
      },
    },
    source:
      "炮盾（Blende，120mm 铸造装甲）：860 宽 × 560 高 × 240 厚，盖住炮塔前壁中央（z ±0.43，两侧到壳体外面各剩 510mm 前壁直段）；内面离炮塔前壁外面 3mm（x -2.783 ~ -3.023）。**中央炮口是通孔**：炮盾板挖 ⌀320 孔 + ⌀320/⌀256 × 100 空心套环，炮管 ⌀210 基段从套环内穿过（环缝 45mm；为 ±3.5° 俯仰留量），后坐 450mm 全程不接触。竖直方向盖住壳体高度（1.111 ~ 1.811）的 1.17 ~ 1.73 段，下留 59mm、上留 81mm 板边。战损变体：破损 = 铸造面凹陷 + 裂痕；破碎 = 右上角撕裂缺块，露出耳轴座、后坐机筒与线束。",
  });

  // ===================== 8,8 cm KwK 36 炮管（中空） =====================
  add({
    id: "tiger.turret.gun_barrel",
    name_cn: "8,8 cm KwK 36 炮管",
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
        boreR: c.TR_GUN_BORE_R!,
        tailExt: c.TR_GUN_TAIL_EXT!,
      },
    },
    material: "steel",
    node: "GunRecoil",
    mate: { type: "absolute", position: [barrelX - c.TR_GUN_PIVOT_X!, 0, 0] },
    source:
      "8,8 cm KwK 36 L/56 炮管（Rohr）：炮口段外径 ⌀210 → ⌀168 → ⌀124、双室制退器 ⌀184 × 320；炮口 x -6.466（伸出首装甲外面 1.97 m）。**炮膛是通的**：内径 ⌀88 从炮口一直通到尾端面，尾端再向后延伸 0.406m 穿进炮塔前壁炮口（x -2.72，止于闩室药室前 20mm）——从炮口看进去能看到闩室/药室。炮管与炮塔前壁炮口、炮盾炮口套环各留 ≥23mm 环缝；后坐时沿炮口滑动。轴线 y 1.45。",
  });

  // ===================== 炮闩 / 摇架 / 后坐机（P0） =====================
  // 坐标基准：GunCradle 节点 = 耳轴中心（x -2.40 / y 1.45 / z 0）。
  // 炮身（炮管 + 闩室 + 闩体 + 击针）挂在 GunRecoil（沿炮轴平移），
  // 摇架 / 制退机 / 复进机挂在 GunCradle（不随炮身后坐）。
  const gunPivotX = c.TR_GUN_PIVOT_X!;
  const gunY = c.TR_GUN_Y!;

  add({
    id: "tiger.turret.gun_cradle",
    name_cn: "火炮摇架",
    name_en: "Wiege",
    assembly: "turret",
    build_layer: 4,
    build_order: 514,
    geometry: {
      type: "kit",
      kit: "gunCradle",
      params: {
        frontX: c.TR_CRADLE_FRONT! - gunPivotX,
        rearX: c.TR_CRADLE_REAR! - gunPivotX,
        halfH: c.TR_CRADLE_HH!,
        zMid: c.TR_CRADLE_Z!,
      },
    },
    material: "steel",
    node: "GunCradle",
    mate: { type: "absolute" },
    source:
      "火炮摇架（Wiege）：两片侧颊 477 × 560 × 30（内距 410）+ 耳轴座 ⌀100 + 下横梁；耳轴中心 (x -2.40, y 1.45)，炮身/闩室在颊板之间后坐 450mm。前缘 x -2.657 离炮塔前壁内面（-2.66）3mm；下缘 1.17 离吊篮地板面（1.16）10mm；上缘 1.73 离顶盖内表面（1.811）81mm。侧颊 z ±0.205~0.235，与闩室（z ±0.16）留 45mm，与炮手/装填手座椅留 ≥390mm。",
  });

  add({
    id: "tiger.turret.recoil_brake",
    name_cn: "制退机",
    name_en: "Rücklaufbremse",
    assembly: "turret",
    build_layer: 4,
    build_order: 515,
    geometry: {
      type: "kit",
      kit: "recoilCylinder",
      params: { r: 0.06, len: 0.44, flangeR: 0.068 },
    },
    material: "steel",
    node: "GunCradle",
    mate: { type: "absolute", position: [c.TR_BRAKE_X! - gunPivotX, c.TR_BRAKE_Y! - gunY, 0] },
    source:
      "制退机（Rücklaufbremse）：⌀120 × 440 液压筒（前后端盖 ⌀136 + 两侧安装耳），装在摇架上方、炮膛轴线上方 210mm；筒底离闩室顶面 50mm、顶离顶盖内表面 91mm。火炮后坐时，制退机筒固定在摇架上、活塞随炮身运动，液压阻尼让后坐「先快后慢」。安装耳外端离摇架颊板 5mm。",
  });

  add({
    id: "tiger.turret.recuperator",
    name_cn: "复进机",
    name_en: "Vorholer",
    assembly: "turret",
    build_layer: 4,
    build_order: 516,
    geometry: {
      type: "kit",
      kit: "recoilCylinder",
      params: { r: 0.055, len: 0.3, flangeR: 0.063 },
    },
    material: "steel",
    node: "GunCradle",
    mate: { type: "absolute", position: [c.TR_RECUP_X! - gunPivotX, c.TR_RECUP_Y! - gunY, 0] },
    source:
      "复进机（Vorholer）：⌀110 × 300 弹簧/液压复进筒（前后端盖 ⌀126 + 安装耳），装在摇架下方、炮膛轴线下方 175mm；筒顶离闩室底面 45mm、筒底离摇架下横梁 20mm、离吊篮地板 115mm。位置在闩体之前（后缘 -2.33）——闩体下落后不会撞到复进机，这是立楔式闩体能在本模型里全行程下落的前提；前端面离炮塔前壁内面 6mm。",
  });

  add({
    id: "tiger.turret.breech_ring",
    name_cn: "炮尾闩室",
    name_en: "Verschlussstück",
    assembly: "turret",
    build_layer: 4,
    build_order: 517,
    geometry: {
      type: "kit",
      kit: "gunBreechRing",
      params: {
        len: c.TR_BREECH_LEN!,
        h: c.TR_BREECH_H!,
        w: c.TR_BREECH_W!,
        chamberR: c.TR_CHAMBER_R!,
        chamberWall: c.TR_CHAMBER_WALL!,
        chamberLen: c.TR_CHAMBER_LEN!,
        chamberCX: -0.095,
      },
    },
    material: "steel",
    node: "GunRecoil",
    mate: { type: "absolute", position: [c.TR_BREECH_X! - gunPivotX, 0, 0] },
    source:
      "炮尾闩室（Verschlussstück）：420 × 200 × 320 框式闩室 + 药室筒（内 ⌀156、长 350、壁 17），药室筒前端伸进炮塔前壁炮口（x -2.70，外径 ⌀190 < 炮口 ⌀270）；后端面开闩口。闩室中心 x -2.43、炮膛轴线 y 1.45；顶面 1.55 离制退机筒底 50mm，底面 1.35 离复进机筒顶 45mm，两侧 z ±0.16 离开摇架颊板 45mm。**药室在炮管尾端面之后 20mm**：炮管炮膛 ⌀88 与药室 ⌀156 在闩室前方形成台阶，从炮口可以一直看进药室。",
  });

  add({
    id: "tiger.turret.breech_block",
    name_cn: "闩体",
    name_en: "Verschlussblock (Fallblock)",
    assembly: "turret",
    build_layer: 4,
    build_order: 518,
    geometry: {
      type: "kit",
      kit: "breechBlock",
      params: { len: c.TR_BLOCK_LEN!, h: c.TR_BLOCK_H!, w: c.TR_BLOCK_W! },
    },
    material: "steel",
    node: "BreechBlock",
    mate: { type: "absolute" },
    source:
      "立楔式闩体（Fallblock）：80 × 150 × 260 闩体 + 后端 ⌀80 击针座 + 两侧滑轨。静止时闭锁药室尾端（闩体前端 -2.30 离药室尾端 -2.35 留 50mm 装弹空间）；闩室框内上下各留 5mm、两侧各 10mm，闩体沿框内导轨下落 160mm 即完全让开药室（前快后慢、末端缓冲）。下落到最低点时闩体底面 1.21，仍高于吊篮地板（1.16）50mm，前方 20mm 处是复进机尾端（不撞）。",
  });

  add({
    id: "tiger.turret.firing_pin",
    name_cn: "击针与击针簧",
    name_en: "Schlagbolzen mit Feder",
    assembly: "turret",
    build_layer: 4,
    build_order: 519,
    geometry: {
      type: "kit",
      kit: "firingPin",
      params: { len: 0.09 },
    },
    material: "steel_worn",
    node: "FiringPin",
    mate: { type: "absolute", position: [c.TR_FIRING_PIN_X! - c.TR_BLOCK_X!, 0, 0] },
    source:
      "击针与击针簧（Schlagbolzen）：⌀12 × 90 击针 + ⌀34 弹簧（9 圈、丝径 ⌀7）+ 前端挡盘 ⌀52 + 后端击发帽 ⌀36。装在闩体后端击针座之后 15mm，与闩体同步后坐/下落；击发时击针沿炮轴前冲约 8mm 击打底火，簧压缩蓄能、击发后复位（节点 FiringPin 可平移驱动）。",
  });

  add({
    id: "tiger.turret.breech_extractor",
    name_cn: "抽壳钩",
    name_en: "Auszieher",
    assembly: "turret",
    build_layer: 4,
    build_order: 524,
    geometry: { type: "kit", kit: "breechExtractor", params: {} },
    material: "steel_worn",
    node: "BreechBlock",
    mate: {
      type: "absolute",
      position: [c.TR_EXTRACTOR_X! - c.TR_BLOCK_X!, c.TR_EXTRACTOR_Y! - gunY, c.TR_EXTRACTOR_Z!],
    },
    source:
      "抽壳钩（Auszieher）：轴座 ⌀36 + 钩臂 + 钩爪，装在闩体前面上缘 z +0.115；爪尖离药室尾缘 6mm、离药室外圆 5mm（不接触）。开闩时钩爪先勾住药筒底缘，闩体下落把空药筒从药室抽出，再沿闩体下缘斜面抛出。",
  });

  add({
    id: "tiger.turret.breech_safety",
    name_cn: "炮闩保险",
    name_en: "Sicherung",
    assembly: "turret",
    build_layer: 4,
    build_order: 525,
    geometry: { type: "kit", kit: "breechSafety", params: { shaftLen: 0.027 } },
    material: "steel_worn",
    node: "GunRecoil",
    mate: {
      type: "absolute",
      position: [c.TR_SAFETY_X! - gunPivotX, c.TR_SAFETY_Y! - gunY, c.TR_SAFETY_Z!],
    },
    source:
      "炮闩保险（Sicherung）：轴 ⌀16 + 拨柄 18 × 70 + 球头 ⌀22，装在闩室右侧外壁（z -0.163，轴外伸 27mm）。拨到「保险」位时挡住闩体下落与击针行程；炮手在炮尾右侧可直接操作。",
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
    instance_nodes: ["Turret", "Turret"],
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
    node: "CoaxBarrel",
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

  // 同轴机枪枪口焰（fx）
  add({
    id: "tiger.turret.coax_flash",
    name_cn: "同轴机枪枪口焰",
    name_en: "MG 34 Mündungsfeuer (koaxial, FX)",
    assembly: "turret",
    build_layer: 5,
    build_order: 613,
    geometry: { type: "kit", kit: "aaMgFlash" },
    material: "muzzle_flash",
    node: "CoaxBarrel",
    mate: {
      type: "absolute",
      position: [mantletFace - c.TR_JOINT! - c.TR_COAX_L! - c.TR_JOINT! - c.TR_COAX_BARREL_L! - 0.005, c.TR_GUN_Y!, c.TR_COAX_Z!],
    },
    tags: ["fx"],
    source:
      "同轴 MG34 枪口焰（fx）：在枪口前方 5mm；每发 30ms，随 CoaxBarrel 短后坐 2mm。构建时隐藏；与车顶 MG34 共用 muzzle_flash 材质。",
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
    instance_nodes: ["Turret", "Turret", "Turret", "Turret", "Turret", "Turret"],
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
    instance_nodes: ["Turret", "Turret", "Turret", "Turret"],
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
    instance_nodes: ["Turret", "Turret"],
    instance_layout: TURRET_LAYOUTS.roofEyes,
    mate: {
      type: "absolute",
      position: [c.TR_EYE_X!, roofTop + c.TR_JOINT!, 0],
    },
    source:
      "焊接吊环（Anschlagpunkt）×2：底板 100 × 70 × 12 + 两片立板 + ⌀16 横销，焊在炮塔顶盖前段两角（x -2.55 / z ±0.70，离顶面 3mm），供吊装炮塔总成。避让车长塔（-1.30 / -0.42）、装填手舱口（-1.25 / +0.50）与炮盾（z ±0.43）；到顶盖前缘（x -2.78）留 230mm、到侧壁外缘（z ±0.94）留 240mm。",
  });

  // ---------------------------------------------------------------------------
  // L4-f：顶盖附件（对空 MG34 / 近防武器管 / 装填手潜望镜 / 排烟风扇罩）
  // ---------------------------------------------------------------------------

  // ===================== 装填手舱口环形枪座 + 拆分 MG34（P3 火力） =====================
  parts.push({
    id: "tiger.turret.aa_ring_mount",
    name_cn: "装填手舱口环形枪座",
    name_en: "Flieger-MG-Drehring (Ladeschützen-Luke)",
    assembly: "turret",
    build_layer: 4,
    build_order: 547,
    geometry: {
      type: "kit",
      kit: "aaRingMount",
      params: {
        ringR: 0.315,
        ringW: 0.03,
        ringH: 0.036,
        gapDeg: 70,
        gapCenterDeg: 27,
        armEndX: -c.TR_AA_ARM!,
        pintleZ: -c.TR_AA_Z_OFF!,
        armTop: c.TR_AA_PIVOT_UP! - 0.019,
      },
    },
    material: "steel",
    mate: {
      type: "absolute",
      position: [c.TR_LOADER_HATCH_X!, roofTop, c.TR_LOADER_HATCH_Z!],
    },
    source:
      "装填手舱口环形枪座（Flieger-MG-Drehring）：抱装填手舱口（⌀400，中心 x -1.25 / z +0.50）的环带 ⌀630/⌀570 × 36 + 3 只支脚（底面离顶盖 3mm）+ 前立柱 + 悬臂 + 枪座立柱 ⌀48。环朝右后近防武器管方向留 70° 开口（整圈会切进近防管），环内径与舱口外缘留 85mm。枪座在舱口正前方 0.46m；装填手从舱口探身即可握到枪尾（枪托端 x -1.22，正在舱口上方 0.3m），车长塔只留观察。",
  });

  // 拆分 MG34：机匣 / 枪托 / 握把 / 弹鼓 / 枪管 / 弹链 / 枪口焰 / 弹壳
  const mgParts: Array<{
    id: string;
    name_cn: string;
    name_en: string;
    kit: string;
    order: number;
    node?: string;
    material?: string;
    count?: number;
    layout?: string;
    instanceNodes?: string[];
    tags?: string[];
    position?: [number, number, number];
    params?: Record<string, KitParam>;
    source: string;
  }> = [
    {
      id: "tiger.turret.aa_mg_body",
      name_cn: "车顶 MG34 机匣",
      name_en: "MG 34 Gehäuse",
      kit: "aaMgBody",
      order: 564,
      node: "AaGun",
      material: "steel",
      source:
        "MG34 机匣组：机匣 260 × 80 × 75 + 供弹盖 + 照门 + 枪管延伸套（内 ⌀42，枪管尾段在孔内短后坐 6mm 不碰机匣）+ 耳轴座。机匣后榫与独立枪托留 3mm 装配缝；枪管延伸套与枪管留 1.5mm 环缝。",
    },
    {
      id: "tiger.turret.aa_mg_stock",
      name_cn: "MG34 枪托",
      name_en: "MG 34 Schulterstütze",
      kit: "aaMgStock",
      order: 565,
      node: "AaGun",
      material: "wood",
      source:
        "MG34 木质枪托 + 托底板，独立零件（旧版与机匣合并成一件，枪托前脸离机匣 100mm，是「枪把悬空」的根因）。枪托前脸 x 0.18 与机匣后榫（x 0.177）留 3mm 装配缝，托底 x 0.502；握把/扳机护圈另件。",
    },
    {
      id: "tiger.turret.aa_mg_grip",
      name_cn: "MG34 握把",
      name_en: "MG 34 Pistolengriff",
      kit: "aaMgGrip",
      order: 566,
      node: "AaGun",
      material: "wood",
      source:
        "MG34 握把 + 扳机护圈 + 连接块，独立零件；握把后倾 15°，顶面离机匣底面 3mm，握持端与机匣/枪托通过连接块连成一体。旧版握把在合并件里，支撑检测看不到它。",
    },
    {
      id: "tiger.turret.aa_mg_drums",
      name_cn: "MG34 双联弹鼓",
      name_en: "Gurttrommel 34",
      kit: "aaMgDrums",
      order: 567,
      node: "AaGun",
      material: "steel",
      source:
        "Gurttrommel 34 双联弹鼓：两只 ⌀176 × 52、中间留 3mm、箍带 ⌀188 + 中央轴；弹鼓底缘离供弹盖 3mm（旧版合并件里浮空 15mm，支撑检测看不到）。",
    },
    {
      id: "tiger.turret.aa_mg_barrel",
      name_cn: "MG34 枪管",
      name_en: "MG 34 Lauf",
      kit: "aaMgBarrel",
      order: 568,
      node: "AaBarrel",
      material: "steel",
      params: { barrelLen: 0.44 },
      source:
        "MG34 快换枪管：⌀39 × 440 + ⌀66 散热套 + 两道箍 + 枪口助退器 + 准星。枪管尾段伸进机匣的枪管延伸套内（1.5mm 环缝）；射击时沿 X 短后坐 6mm 后复进。",
    },
    {
      id: "tiger.turret.aa_mg_belt",
      name_cn: "MG34 供弹链",
      name_en: "MG 34 Gurt",
      kit: "aaMgBelt",
      order: 569,
      node: "AaFeed",
      material: "brass_dull",
      source:
        "可见供弹链：7 节 M9 链节沿弹鼓左下 → 供弹盖的斜向路径；AaFeed 节点每发沿链路方向步进 14mm（整条链周期排列，回位时视觉上是「下一节到位」）。链带离弹鼓/供弹盖 3mm。",
    },
    {
      id: "tiger.turret.aa_mg_flash",
      name_cn: "MG34 枪口焰",
      name_en: "MG 34 Mündungsfeuer (FX)",
      kit: "aaMgFlash",
      order: 570,
      node: "AaBarrel",
      material: "muzzle_flash",
      tags: ["fx"],
      position: [-0.62, 0.04, 0],
      source:
        "MG34 枪口焰（fx）：小星芒，在枪口前方 5mm；每发只亮约 30ms，随 AaBarrel 短后坐。构建时隐藏，不参与支撑/取景。",
    },
    {
      id: "tiger.turret.aa_mg_case",
      name_cn: "MG34 弹壳",
      name_en: "Patronenhülse 7,92 × 57",
      kit: "mgCase",
      order: 571,
      material: "case_brass",
      count: 12,
      layout: TURRET_LAYOUTS.aaCases,
      instanceNodes: Array.from({ length: 12 }, () => "Turret"),
      tags: ["fx"],
      source:
        "7.92 × 57mm 弹壳 ×12（fx，构建时隐藏）：静态排布在装填手舱口右前顶盖（y 1.843，离顶盖 3mm）；机枪连射时由 AaGun 抛壳口抛出，做重力抛物线 + 顶盖弹跳，落点留在顶盖上。",
    },
  ];
  for (const item of mgParts) {
    const mate =
      item.position !== undefined
        ? { type: "absolute" as const, position: item.position }
        : { type: "absolute" as const };
    parts.push({
      id: item.id,
      name_cn: item.name_cn,
      name_en: item.name_en,
      assembly: "turret",
      build_layer: 4,
      build_order: item.order,
      geometry: item.params
        ? { type: "kit", kit: item.kit, params: item.params }
        : { type: "kit", kit: item.kit },
      material: item.material ?? "steel",
      ...(item.node ? { node: item.node } : {}),
      ...(item.count ? { instances: item.count, indexed: true } : {}),
      ...(item.layout ? { instance_layout: item.layout } : {}),
      ...(item.instanceNodes ? { instance_nodes: item.instanceNodes } : {}),
      ...(item.tags ? { tags: item.tags } : {}),
      mate,
      source: item.source,
    });
  }

  parts.push({
    id: "tiger.turret.aa_shield",
    name_cn: "枪座防盾",
    name_en: "Schutzschild (Flieger-MG)",
    assembly: "turret",
    build_layer: 4,
    build_order: 572,
    geometry: {
      type: "kit",
      kit: "aaShield",
      params: { w: 0.42, h: 0.34, t: 0.008, slotW: 0.1, bottomH: 0.12, bracketLen: 0.176 },
    },
    material: "armor_steel",
    mate: {
      type: "absolute",
      position: [
        c.TR_LOADER_HATCH_X! - c.TR_AA_SHIELD_DX!,
        roofTop + c.TR_AA_SHIELD_UP!,
        c.TR_LOADER_HATCH_Z! - c.TR_AA_Z_OFF!,
      ],
    },
    source:
      "枪座防盾（Schutzschild）：420 × 340 × 8 钢板，中央 100 宽顶部开口让炮管俯仰穿出；下挡板 120 高遮住装填手胸腹。装在装填手舱口环形枪座悬臂前端（x -1.93 / z +0.50），盾面离炮管 17mm；后支架接枪座横臂（留 5mm 装配缝），枪座又抱在装填手舱口上——防盾的载荷链是「盾 → 悬臂 → 舱口环 → 顶盖」，不再是浮在枪前一整块板。",
  });

  // 炮口焰（特效）：炮口前 35mm 起，动画 in/out 只切 visible/scale；fx 标签豁免支撑检测
  add({
    id: "tiger.turret.muzzle_flash",
    name_cn: "炮口焰（特效）",
    name_en: "Mündungsfeuer (FX)",
    assembly: "turret",
    build_layer: 5,
    build_order: 612,
    geometry: { type: "kit", kit: "muzzleFlash", params: { coreR: 0.1 } },
    material: "muzzle_flash",
    node: "GunRecoil",
    mate: {
      type: "absolute",
      position: [barrelX - c.TR_BARREL_L! - c.TR_GUN_PIVOT_X! - 0.005, 0, 0],
    },
    tags: ["fx"],
    source:
      '炮口焰（Mündungsfeuer，特效件）：核心球 ⌀200 + 前向锥 ⌀240 × 420 + 6 片径向星芒，几何整体在炮口前方 35mm 之外（不碰炮管制退器）；挂 GunRecoil 节点，随炮身后坐。只由击发动画切 visible 与 scale（1.16–1.55s），不参与静态装配语义；tags: ["fx"] 让悬空检测豁免。',
  });

  parts.push({
    id: "tiger.turret.close_defense",
    name_cn: "近防武器管",
    name_en: "Nahverteidigungswaffe",
    assembly: "turret",
    build_layer: 4,
    build_order: 550,
    geometry: {
      type: "kit",
      kit: "closeDefense",
      params: { baseR: 0.078, baseT: 0.014, tubeR: 0.045, tubeL: 0.13 },
    },
    material: "armor_steel",
    mate: {
      type: "absolute",
      position: [c.TR_CD_X!, roofTop + c.TR_JOINT!, c.TR_CD_Z!],
    },
    source:
      "近防武器管（Nahverteidigungswaffe）：底座圈 ⌀156 × 14 + 6 颗螺栓 + ⌀90 短管（壁厚 6 / 长 130）+ 铰链顶盖 ⌀104 × 18（离管口 3mm）。装在炮塔顶盖右后（x -0.95 / z +0.35），离车长塔外缘 335mm、离装填手舱口 340mm、离顶盖后缘 79mm。实车 1943 年起装于炮塔顶，发射 92mm 破片弹 / 烟幕弹，用于近距离自卫。",
  });

  parts.push({
    id: "tiger.turret.loader_periscope",
    name_cn: "装填手潜望镜",
    name_en: "Winkelspiegel (Ladeschütze)",
    assembly: "turret",
    build_layer: 4,
    build_order: 551,
    geometry: {
      type: "kit",
      kit: "loaderPeriscope",
      params: { baseR: 0.054, baseT: 0.028 },
    },
    material: "armor_steel",
    mate: {
      type: "absolute",
      position: [c.TR_LP_X!, loaderHatchY + c.TR_LOADER_HATCH_T! + 0.012 + c.TR_JOINT!, c.TR_LP_Z!],
    },
    source:
      "装填手舱盖潜望镜（Winkelspiegel）：底座转盘 ⌀108 × 28 + 转头 90 × 64 × 72（前壁 45° 斜切）+ 前窗 64 × 32 × 12 + 提手。装在装填手舱盖隆起顶面（y 1.873）上方 3mm，位于舱盖中心前 100mm（x -1.35 / z +0.50），转头可水平旋转，前窗朝向车头。实车装填手舱盖带旋转潜望镜，用于不开舱观察。",
  });

  parts.push({
    id: "tiger.turret.vent_cowl",
    name_cn: "排烟风扇罩",
    name_en: "Entlüftungshaube",
    assembly: "turret",
    build_layer: 4,
    build_order: 526,
    geometry: {
      type: "kit",
      kit: "ventCowl",
      params: { r: 0.15, h: 0.038, wall: 0.008 },
    },
    material: "armor_steel",
    mate: {
      type: "absolute",
      position: [c.TR_VENT_X!, roofTop + c.TR_JOINT!, c.TR_VENT_Z!],
    },
    source:
      "顶盖排烟风扇罩：⌀300 罩圈（壁厚 8 / 高 38）+ 蘑菇顶盖 ⌀324 × 10（离罩圈 3mm，4 根支撑爪）。装在顶盖后部（x -0.92 / z -0.20），离车长塔外缘 5mm、离顶盖后缘 21mm。实车炮塔顶后部有排烟风扇，抽除火炮发射后的硝烟（KwK 36 炮管无抽烟装置，故本批不设炮管抽烟装置）。",
  });

  // 所有没有自己骨骼节点的炮塔零件挂到 Turret：炮塔回转时壳体/舱盖/枪座一起动
  return parts.map((part) => (part.node ? part : { ...part, node: "Turret" }));
}

export function makeTurretRegistry(): ModelRegistry {
  return {
    model: "tiger",
    title: "虎式 I 炮塔（L4）",
    subtitle: "炮塔壳体（壁 + 顶盖）/ 车长指挥塔 / 炮盾 / 8,8 cm 炮管",
    source_notes: [
      "公开资料：虎 I 炮塔为马蹄形焊接壳体，正面 120mm、侧后 80mm、顶盖 25mm；座圈内 ⌀1650（opening 即炮塔回转直径），车长指挥塔在左后、带 5 个观察缝；主炮 8,8 cm KwK 36 L/56 经炮盾伸出，炮口带双室制退器，全车炮口向前总长 8.45 m（车体 6.32 m）。",
      "本模型口径（与 L4-b 座圈接口一致）：座圈圆心 x -1.65 / z 0、顶面 1.108；壳体下沿 1.111（离座圈 3mm）、壁高 700、顶盖顶面 1.836；炮塔外廓 1.88 宽（车体 1.925）、前壁外面 x -2.78；炮管轴线 y 1.45、炮口 x -6.466。",
      "实车与模型的差异（压缩比）：实车车体长 6.32 m、本模型 5.41 m，所以炮塔相对车体显得略靠后——座圈后缘离发动机隔板 45mm 是 L4-b 的既定口径，炮塔后段（半圆外缘 x -0.71）因此悬在发动机舱盖前段上方，与实车「炮塔后悬于发动机舱」一致。",
      "本模型口径（L4-i）：主炮统一写 8,8 cm KwK 36（德军官方 cm）；炮管膛径 88mm、药室 156mm、闩体 80×150×260，后坐 450mm、闩体下落 160mm。车长塔环形枪座抱塔环 ⌀630/⌀570（朝排烟风扇罩留 70° 开口），MG34 枪尾落在塔口上方 0.34m 处，防盾 420×340 遮住探出的上半身。简化记录（待补）：塔内潜望镜 5 具 / 顶盖内侧锁扣 / 炮管俯仰动画 / 战术编号（L5）。",
    ].join("\n"),
    constants: TURRET_CONSTANTS,
    assemblies: [{ id: "turret", name_cn: "炮塔", name_en: "turret", explode: [0, 2.6, 0] }],
    nodes: [
      {
        name: "Turret",
        parent: "root",
        pivot: [0, 0, 0],
        motion: "rotate",
        axis: "y",
        note: "炮塔回转节点：动画绕座圈中心 (-1.65, 0) 做「R·p + C - R·C」枢轴旋转",
      },
      {
        name: "GunShift",
        parent: "Turret",
        pivot: [0.03, 0, 0],
        note: "火炮总成后移 30mm 静态让位：给摇架/复进机 ±3.4° 俯仰留出前壁净空",
      },
      {
        name: "GunCradle",
        parent: "GunShift",
        pivot: ["TR_GUN_PIVOT_X", "TR_GUN_Y", 0],
        note: "火炮摇架 / 耳轴：炮身、闩室、闩体在它上面后坐；俯仰（P3）绕此轴",
      },
      {
        name: "GunRecoil",
        parent: "GunCradle",
        pivot: [0, 0, 0],
        motion: "translate",
        axis: "x",
        note: "炮身后坐节点：+X 为后坐方向（击发循环驱动 0 → 450mm → 复进）",
      },
      {
        name: "BreechBlock",
        parent: "GunRecoil",
        pivot: ["TR_BLOCK_X - TR_GUN_PIVOT_X", 0, 0],
        motion: "translate",
        axis: "y",
        note: "立楔式闩体：沿 -Y 下落 160mm 开闩（前快后慢 + 末端缓冲）",
      },
      {
        name: "FiringPin",
        parent: "BreechBlock",
        pivot: [0, 0, 0],
        motion: "translate",
        axis: "x",
        note: "击针：-X 前冲 8mm 击发底火，簧力复位（节点原点与闩体中心重合，位移即绝对行程）",
      },
      {
        name: "AaGun",
        parent: "Turret",
        pivot: [
          "TR_LOADER_HATCH_X - TR_AA_ARM",
          "TR_RING_TOP + TR_JOINT + TR_WALL_H + TR_ROOF_T + TR_AA_PIVOT_UP",
          "TR_LOADER_HATCH_Z - TR_AA_Z_OFF",
        ],
        rest_rotation: [0, 0, "-TR_AA_PITCH"],
        motion: "rotate",
        axis: "z",
        note: "装填手舱口环形枪座上的 MG34：静止抬头 10°；连射时叠加枪口上跳",
      },
      {
        name: "AaBarrel",
        parent: "AaGun",
        pivot: [0, 0, 0],
        motion: "translate",
        axis: "x",
        note: "MG34 枪管短后坐节点：每发 +X 6mm，复进回位",
      },
      {
        name: "AaFeed",
        parent: "AaGun",
        pivot: [-0.13, 0.13, 0.03],
        motion: "translate",
        axis: "x",
        note: "MG34 供弹链步进节点：沿链路方向每发一节距 14mm",
      },
      {
        name: "CoaxBarrel",
        parent: "Turret",
        pivot: [0, 0, 0],
        motion: "translate",
        axis: "x",
        note: "同轴 MG34 枪管短后坐节点：每发 +X 2mm",
      },
    ],
    materials: {
      muzzle_flash: {
        base: "#ffe2a8",
        metalness: 0,
        roughness: 0.9,
        preset: "none",
        envMapIntensity: 0.2,
        emissive: "#ff9a33",
        emissiveIntensity: 5,
      },
      case_brass: {
        base: "#b08d57",
        metalness: 0.9,
        roughness: 0.32,
        preset: "none",
        envMapIntensity: 1.1,
      },
      brass_dull: {
        base: "#9a7a4b",
        metalness: 0.75,
        roughness: 0.5,
        preset: "none",
        envMapIntensity: 0.8,
      },
      wood: {
        base: "#6e4a2f",
        metalness: 0.02,
        roughness: 0.82,
        preset: "none",
        envMapIntensity: 0.4,
      },
    },
    parts: buildTurretParts(),
  };
}

export function makeTurretLayouts(): Record<string, InstanceLayout> {
  return makeLayouts();
}
