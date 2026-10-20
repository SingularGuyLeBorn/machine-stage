import * as THREE from "three";
import type { InstanceLayout } from "../../../assembler/assembler";
import type { ModelRegistry, PartDefinition } from "../../../registry/types";

// ============================================================================
// models/tiger/interior —— 虎式 I 内衬内饰（L3 第一批：驾驶舱 + 无线电员席）
//
// 坐标系沿用 L1/L2：+X 车尾、+Y 上、+Z 车体右侧；地面 -1.10，曲轴轴线 y = 0。
// 本批锚点全部来自 L2 已提交接口：
//   地板顶面            y = -0.305（扭杆 y = -0.585 在地板之下）
//   车体侧板内表面      z = ±0.90（外表面 ±0.9625，板厚 62.5mm）
//   前装甲板内表面      x = -4.40
//   顶甲板下表面        y = +1.05（L4 待建；车内净高 1.355m）
//   转向柱上端          (x -3.80, z -0.42)，顶面 y = +0.36（B3 输出）
//   预选阀联动臂上端    y = +0.28（B3 输出，兼作驾驶员变速杆）
//
// 乘员布置（公开资料：虎式驾驶员在左前、无线电员在右前，变速箱在两人之间隆起）：
//   驾驶员   z = -0.67；无线电员 z = +0.67；座椅中心 x = -3.32（转向盘中心 x = -3.82）
//   座椅坐垫顶 0.20（离地板 0.505），坐姿眼高 ≈ 0.95（顶甲板下 1.05，头顶留 0.10）
//
// 建模口径（简化记录，M-C 待补）：
//   1. 座椅按「基座 + 座盆 + 坐垫 + 靠背 + 调角手柄 + 安全带」六件建，坐垫/靠背面料
//      用 canvas_black（帆布），骨架用 interior_red（防锈红），其余内饰件 ivory 白。
//   2. 仪表/开关/旋钮/潜望镜棱镜均为装饰件，表盘刻度和光学镜组待 M-C；所有贴合面
//      按 2~3mm 名义缝离开基面（L4 落地后不产生贴合报告）。
//   3. 航向机枪只做机匣段（枪管穿前装甲球座，L4 需开 ⌀100 球孔），弹鼓/握把分件。
//   4. 方向盘轮缘 φ380、后倾 12°，轮毂轴头插进转向柱上端的联轴套（径向 3mm 缝）。
// ============================================================================

export const INTERIOR_LAYOUTS = {
  seatPair: "interior.seatPair",
  gauge: "interior.gauge",
  toggle: "interior.toggle",
  strap: "interior.strap",
  pedal: "interior.pedal",
  controlLever: "interior.controlLever",
  periscope: "interior.periscope",
  eyepiece: "interior.eyepiece",
  clamp: "interior.clamp",
  lamp: "interior.lamp",
  radioKnob: "interior.radioKnob",
  mgGrip: "interior.mgGrip",
} as const;

const IN_CONSTANTS: Record<string, number> = {
  // —— 车体接口（L4 落地基准）——
  IN_FLOOR_Y: -0.305,
  IN_WALL_Z: 0.9,
  IN_DECK_Y: 1.05,
  IN_FRONT_X: -4.4,

  // —— 乘员席 ——
  IN_SEAT_X: -3.32,
  IN_SEAT_Z: 0.67,
  IN_EYE_Y: 0.95,

  // —— 方向盘 / 仪表板 ——
  IN_WHEEL_X: -3.82,
  IN_WHEEL_Y: 0.49,
  IN_WHEEL_Z: -0.42,
  IN_WHEEL_TILT: -12,
  IN_DASH_X: -4.375,
  IN_DASH_Y: 0.23,
  IN_DASH_Z: -0.51,
};

const AXIS_Z: [number, number, number] = [90, 0, 0];

export function makeInteriorLayouts(): Record<string, InstanceLayout> {
  const layouts: Record<string, InstanceLayout> = {};
  const c = IN_CONSTANTS;
  const side = (index: number): 1 | -1 => (index % 2 === 0 ? 1 : -1);

  // 注意：layout 叠加在 mate 之上（mate × layout），带朝向的零件必须把旋转移进 layout，
  // 否则 layout 的平移量会被 mate 的旋转再转一次（曾导致仪表/开关全部飞到车外）。
  const RX = new THREE.Matrix4().makeRotationZ(-Math.PI / 2); // 局部 +Y → 世界 +X
  const RZ = new THREE.Matrix4().makeRotationX(Math.PI / 2); // 局部 +Y → 世界 +Z
  const laid = (rot: THREE.Matrix4 | null, x: number, y: number, z: number) => {
    const m = rot ? rot.clone() : new THREE.Matrix4();
    m.setPosition(x, y, z);
    return m;
  };

  layouts[INTERIOR_LAYOUTS.seatPair] = ({ index }) =>
    new THREE.Matrix4().makeTranslation(c.IN_SEAT_X, 0, side(index) * c.IN_SEAT_Z);

  layouts[INTERIOR_LAYOUTS.gauge] = ({ index }) => laid(RX, -4.343, 0.27, -0.8 + index * 0.14);

  layouts[INTERIOR_LAYOUTS.toggle] = ({ index }) => laid(RX, -4.343, 0.155, -0.8 + index * (0.565 / 7));

  layouts[INTERIOR_LAYOUTS.strap] = ({ index }) => {
    const list = [-0.78, -0.56, 0.56, 0.78];
    return new THREE.Matrix4().makeTranslation(c.IN_SEAT_X, 0, list[index] ?? list[0]!);
  };

  layouts[INTERIOR_LAYOUTS.pedal] = ({ index }) => {
    const list = [-0.66, -0.42, -0.18];
    return new THREE.Matrix4().makeTranslation(0, 0, list[index] ?? list[0]!);
  };

  layouts[INTERIOR_LAYOUTS.controlLever] = ({ index }) => {
    const list = [-0.62, -0.22];
    return new THREE.Matrix4().makeTranslation(-4.05, 0, list[index] ?? list[0]!);
  };

  layouts[INTERIOR_LAYOUTS.periscope] = ({ index }) =>
    new THREE.Matrix4().makeTranslation(-3.95, 0, side(index) * 0.66);

  layouts[INTERIOR_LAYOUTS.eyepiece] = ({ index }) => laid(RX, -3.855, 0.93, side(index) * 0.66);

  layouts[INTERIOR_LAYOUTS.clamp] = ({ index }) =>
    new THREE.Matrix4().makeTranslation(-2.95, index === 0 ? -0.09 : 0.09, -0.83);

  layouts[INTERIOR_LAYOUTS.lamp] = ({ index }) => {
    const list: [number, number][] = [
      [-3.3, -0.55],
      [-2.7, 0.55],
    ];
    const [x, z] = list[index] ?? list[0]!;
    return new THREE.Matrix4().makeTranslation(x, 0.98, z);
  };

  layouts[INTERIOR_LAYOUTS.radioKnob] = ({ index }) => {
    const xs = [-3.9, -3.7];
    const ys = [0.36, 0.48];
    return laid(RZ, xs[Math.floor(index / 2) % 2]!, ys[index % 2]!, 0.666);
  };

  layouts[INTERIOR_LAYOUTS.mgGrip] = ({ index }) => {
    const list = [0.745, 0.815];
    return new THREE.Matrix4().makeTranslation(-3.945, 0.1, list[index] ?? list[0]!);
  };

  // —— L3 第二批：战斗舱（弹药 / 吊篮 / 座席）——
  // 92 发基数：左右各 46，内外两排各 23；内排全 APCBC，外排前 2 发 APCBC、其余 HE
  //（AP 50 / HE 42）。三个弹件共用同一套弹位表，药筒与弹丸严格同轴。
  const ammoSlots: { x: number; z: number; ap: boolean }[] = [];
  for (const sd of [1, -1] as const) {
    for (const row of [0, 1] as const) {
      for (let n = 0; n < 23; n++) {
        ammoSlots.push({
          x: -4.05 + n * 0.145,
          z: sd * (row === 0 ? 1.18 : 1.42),
          ap: row === 0 || n < 2,
        });
      }
    }
  }
  const ammoAp = ammoSlots.filter((slot) => slot.ap);
  const ammoHe = ammoSlots.filter((slot) => !slot.ap);

  layouts["interior.ammoCase"] = ({ index }) => {
    const slot = ammoSlots[index] ?? ammoSlots[0]!;
    return new THREE.Matrix4().makeTranslation(slot.x, 0.153, slot.z);
  };

  layouts["interior.ammoProjectileAp"] = ({ index }) => {
    const slot = ammoAp[index] ?? ammoAp[0]!;
    return new THREE.Matrix4().makeTranslation(slot.x, 0.723, slot.z);
  };

  layouts["interior.ammoProjectileHe"] = ({ index }) => {
    const slot = ammoHe[index] ?? ammoHe[0]!;
    return new THREE.Matrix4().makeTranslation(slot.x, 0.723, slot.z);
  };

  layouts["interior.ammoRack"] = ({ index }) =>
    index === 0
      ? new THREE.Matrix4().makeTranslation(0, 0, 1.3)
      : new THREE.Matrix4().makeTranslation(0, 0, -1.3).multiply(new THREE.Matrix4().makeRotationY(Math.PI));

  layouts["interior.turretSeat"] = ({ index }) => {
    const list: [number, number, number][] = [
      [-1.32, 1.163, -0.44],
      [-1.95, 1.163, -0.3],
      [-1.95, 1.163, 0.35],
    ];
    const [x, y, z] = list[index] ?? list[0]!;
    const m = new THREE.Matrix4().makeTranslation(x, y, z);
    if (index === 2) m.multiply(new THREE.Matrix4().makeRotationY(Math.PI));
    return m;
  };

  return layouts;
}

// ---------------------------------------------------------------------------
// 零件
// ---------------------------------------------------------------------------

function buildInteriorParts(): PartDefinition[] {
  const parts: PartDefinition[] = [];
  const add = (part: PartDefinition) => parts.push(part);

  // ===================== 驾驶席：座椅（左右各一） =====================
  add({
    id: "tiger.interior.seat_frame",
    name_cn: "座椅骨架",
    name_en: "seat frame",
    assembly: "interior",
    build_layer: 3,
    build_order: 400,
    geometry: {
      type: "merge",
      parts: [
        { type: "box", w: 0.24, h: 0.02, d: 0.26, at: [0, -0.293, 0], bevel: 0.004 },
        { type: "tube", rOuter: 0.055, rInner: 0.04, h: 0.4, at: [0, -0.083, 0], segments: 20 },
        { type: "box", w: 0.34, h: 0.02, d: 0.34, at: [0, 0.115, 0], bevel: 0.004 },
        { type: "box", w: 0.03, h: 0.36, d: 0.04, at: [0.215, 0.295, 0.1], bevel: 0.003 },
        { type: "box", w: 0.03, h: 0.36, d: 0.04, at: [0.215, 0.295, -0.1], bevel: 0.003 },
      ],
    },
    material: "interior_red",
    instances: 2,
    indexed: true,
    instance_layout: INTERIOR_LAYOUTS.seatPair,
    mate: { type: "absolute" },
    source:
      "座椅骨架（钢）：底座板 0.24×0.26 落在地板上方（y -0.303，2mm 名义缝），中央立柱 ф110，座盆 0.34×0.38；靠背由两根后立柱承托（立柱面与靠背留 5mm）。左右席同一几何，按 z = ±0.67 平移。",
  });

  add({
    id: "tiger.interior.seat_cushion",
    name_cn: "坐垫",
    name_en: "seat cushion",
    assembly: "interior",
    build_layer: 3,
    build_order: 401,
    geometry: {
      type: "merge",
      parts: [
        { type: "box", w: 0.32, h: 0.07, d: 0.36, at: [0, 0.165, 0], bevel: 0.012 },
        { type: "box", w: 0.3, h: 0.004, d: 0.01, at: [0, 0.201, -0.08], bevel: 0.001 },
        { type: "box", w: 0.3, h: 0.004, d: 0.01, at: [0, 0.201, 0], bevel: 0.001 },
        { type: "box", w: 0.3, h: 0.004, d: 0.01, at: [0, 0.201, 0.08], bevel: 0.001 },
      ],
    },
    material: "canvas_black",
    instances: 2,
    indexed: true,
    instance_layout: INTERIOR_LAYOUTS.seatPair,
    mate: { type: "absolute" },
    source:
      "坐垫（帆布包覆，0.32×0.36，厚 70）：座面顶 y 0.20（离地板 0.505）；底面与座盆留 5mm，顶面三道缝线凸起 0.5mm。",
  });

  add({
    id: "tiger.interior.seat_backrest",
    name_cn: "靠背",
    name_en: "seat backrest",
    assembly: "interior",
    build_layer: 3,
    build_order: 402,
    geometry: {
      type: "merge",
      parts: [
        { type: "box", w: 0.03, h: 0.39, d: 0.36, at: [0.18, 0.355, 0], bevel: 0.01 },
        { type: "box", w: 0.03, h: 0.03, d: 0.3, at: [0.18, 0.555, 0], bevel: 0.006 },
      ],
    },
    material: "canvas_black",
    instances: 2,
    indexed: true,
    instance_layout: INTERIOR_LAYOUTS.seatPair,
    mate: { type: "absolute" },
    source:
      "靠背（0.36 宽 × 0.39 高，厚 30）：后倾 0°，底边 y 0.16、顶边 0.57；与坐垫后缘留 20mm，与骨架后立柱留 5mm。",
  });

  add({
    id: "tiger.interior.seat_adjuster",
    name_cn: "座椅调角手柄",
    name_en: "seat adjuster handle",
    assembly: "interior",
    build_layer: 3,
    build_order: 403,
    geometry: {
      type: "merge",
      parts: [
        { type: "box", w: 0.08, h: 0.02, d: 0.02, at: [-0.21, 0.105, 0], bevel: 0.003 },
        { type: "cylinder", r: 0.016, h: 0.06, at: [-0.25, 0.13, 0], segments: 16, bevel: 0.002 },
      ],
    },
    material: "steel",
    instances: 2,
    indexed: true,
    instance_layout: INTERIOR_LAYOUTS.seatPair,
    mate: { type: "absolute" },
    source: "调角手柄：从座盆前缘伸出的横杆 + 立式握柄（ф32 × 60），供乘员调座椅前后/靠背角。",
  });

  add({
    id: "tiger.interior.seat_strap",
    name_cn: "安全带",
    name_en: "seat strap",
    assembly: "interior",
    build_layer: 3,
    build_order: 404,
    geometry: {
      type: "merge",
      parts: [
        { type: "box", w: 0.006, h: 0.3, d: 0.05, at: [0.158, 0.38, 0], bevel: 0.002 },
        { type: "box", w: 0.008, h: 0.05, d: 0.06, at: [0.152, 0.3, 0], bevel: 0.003 },
      ],
    },
    material: "canvas_black",
    instances: 4,
    indexed: true,
    instance_layout: INTERIOR_LAYOUTS.strap,
    mate: { type: "absolute" },
    source: "安全带（帆布织带 50 × 6，带扣 60×50）：两条一带挂在靠背前方，带面与靠背留 2mm；左右席各两条。",
  });

  // ===================== 转向：方向盘 + 联轴套 =====================
  add({
    id: "tiger.interior.steering_wheel",
    name_cn: "方向盘",
    name_en: "steering wheel",
    assembly: "interior",
    build_layer: 3,
    build_order: 405,
    geometry: {
      type: "kit",
      kit: "steeringWheel",
      params: { rimR: 0.19, hubR: 0.045, shaftR: 0.022 },
    },
    material: "bakelite",
    mate: {
      type: "absolute",
      position: [-3.8, 0.49, -0.42],
    },
    source:
      "方向盘 φ380（轮缘截面 26、3 辐条、轮毂 ф90、喇叭按钮 ф60）：盘面水平（虎式实车接近水平，如大客车），中心 (x -3.80, y 0.49, z -0.42)，与转向柱同轴；轮缘最靠驾驶员点 (-3.597, 0.49)，距其胸口约 0.30m。轴头 r22 垂直插入下方联轴套 30mm。",
  });

  add({
    id: "tiger.interior.steering_link",
    name_cn: "转向联轴套",
    name_en: "steering coupling",
    assembly: "interior",
    build_layer: 3,
    build_order: 406,
    geometry: {
      type: "merge",
      parts: [
        { type: "tube", rOuter: 0.058, rInner: 0.046, h: 0.062, at: [0, 0, 0], segments: 20 },
        { type: "box", w: 0.02, h: 0.05, d: 0.04, at: [0.066, 0, 0], bevel: 0.003 },
        { type: "box", w: 0.02, h: 0.05, d: 0.04, at: [-0.066, 0, 0], bevel: 0.003 },
      ],
    },
    material: "steel_worn",
    mate: { type: "absolute", position: [-3.8, 0.396, -0.42] },
    source:
      "转向联轴套（内径 92、壁厚 12）：套在 B3 转向柱上端（顶面 y 0.36，留 5mm 缝），方向盘轴头 r22 从上方斜插（径向 6mm 缝）；两侧夹紧耳板为分件前的简化。",
  });

  // ===================== 仪表板 =====================
  add({
    id: "tiger.interior.dashboard",
    name_cn: "仪表板",
    name_en: "instrument panel",
    assembly: "interior",
    build_layer: 3,
    build_order: 407,
    geometry: {
      type: "merge",
      parts: [
        { type: "box", w: 0.04, h: 0.26, d: 0.7, at: [-4.375, 0.23, -0.51], bevel: 0.004 },
        { type: "box", w: 0.06, h: 0.02, d: 0.7, at: [-4.365, 0.37, -0.51], bevel: 0.004 },
      ],
    },
    material: "interior_paint",
    mate: { type: "absolute" },
    source:
      "驾驶员仪表板（0.70 × 0.26，厚 40，带遮光檐）：装在前装甲板内表面（x -4.40）前方 5mm；面向驾驶员一面装 5 只表 + 8 个开关。",
  });

  add({
    id: "tiger.interior.gauge",
    name_cn: "仪表",
    name_en: "gauge",
    assembly: "interior",
    build_layer: 3,
    build_order: 408,
    geometry: {
      type: "merge",
      parts: [
        { type: "cylinder", r: 0.034, h: 0.018, at: [0, 0, 0], segments: 24, bevel: 0.002 },
        { type: "tube", rOuter: 0.038, rInner: 0.032, h: 0.008, at: [0, 0.012, 0], segments: 24 },
        { type: "box", w: 0.03, h: 0.002, d: 0.004, at: [0.008, 0.02, 0], bevel: 0.001 },
      ],
    },
    material: "steel",
    instances: 5,
    indexed: true,
    instance_layout: INTERIOR_LAYOUTS.gauge,
    mate: { type: "absolute" },
    source:
      "仪表 ф76（车速/转速/油温/水温/油量 5 只）：轴向 +X 面向驾驶员，表背与仪表板面留 2mm；刻度与指针为装饰，真表芯待 M-C。",
  });

  add({
    id: "tiger.interior.toggle",
    name_cn: "开关",
    name_en: "toggle switch",
    assembly: "interior",
    build_layer: 3,
    build_order: 409,
    geometry: {
      type: "merge",
      parts: [
        { type: "cylinder", r: 0.012, h: 0.018, at: [0, 0, 0], segments: 14, bevel: 0.002 },
        { type: "cylinder", r: 0.009, h: 0.014, at: [0, 0.014, 0], segments: 12, bevel: 0.002 },
      ],
    },
    material: "bakelite",
    instances: 8,
    indexed: true,
    instance_layout: INTERIOR_LAYOUTS.toggle,
    mate: { type: "absolute" },
    source: "开关组 8 只（ф24 底座 + ф18 拨钮）：装在仪表板下排（y 0.155），底座面与板面留 2mm。",
  });

  // ===================== 操纵件 =====================
  add({
    id: "tiger.interior.pedal",
    name_cn: "踏板",
    name_en: "pedal",
    assembly: "interior",
    build_layer: 3,
    build_order: 410,
    geometry: {
      type: "merge",
      parts: [
        { type: "box", w: 0.1, h: 0.02, d: 0.06, at: [-4.24, 0.235, 0], bevel: 0.004 },
        { type: "box", w: 0.03, h: 0.18, d: 0.03, at: [-4.19, 0.335, 0], bevel: 0.003 },
        { type: "box", w: 0.225, h: 0.03, d: 0.03, at: [-4.2825, 0.42, 0], bevel: 0.003 },
      ],
    },
    material: "steel_worn",
    instances: 3,
    indexed: true,
    instance_layout: INTERIOR_LAYOUTS.pedal,
    mate: { type: "absolute" },
    source:
      "踏板（离合/制动/油门，踏板面 100×60）：踏板面顶 y 0.245，吊臂挂在 y 0.42 的横轴上；横轴前端离前装甲板内表面 5mm，整组在转向机前盖（x -4.122）之前 78mm。",
  });

  add({
    id: "tiger.interior.control_lever",
    name_cn: "操纵杆",
    name_en: "control lever",
    assembly: "interior",
    build_layer: 3,
    build_order: 411,
    geometry: {
      type: "merge",
      parts: [
        { type: "box", w: 0.09, h: 0.03, d: 0.09, at: [0, 0.26, 0], bevel: 0.004 },
        { type: "box", w: 0.03, h: 0.26, d: 0.03, at: [0, 0.395, 0], bevel: 0.003 },
        { type: "cylinder", r: 0.024, h: 0.09, at: [0, 0.515, 0], segments: 16, bevel: 0.003 },
      ],
    },
    material: "steel_worn",
    instances: 2,
    indexed: true,
    instance_layout: INTERIOR_LAYOUTS.controlLever,
    mate: { type: "absolute" },
    source:
      "副操纵杆 2 根（转向机顶部 x -4.05、z -0.62 / -0.22）：底座面 y 0.245（转向机顶加强台 0.24，留 5mm），杆顶 y 0.560；与方向盘前缘（x -4.006）留 20mm。",
  });

  add({
    id: "tiger.interior.handbrake",
    name_cn: "手制动杆",
    name_en: "handbrake lever",
    assembly: "interior",
    build_layer: 3,
    build_order: 412,
    geometry: {
      type: "merge",
      parts: [
        { type: "box", w: 0.24, h: 0.04, d: 0.1, at: [-3.3, 0.2, -0.42], bevel: 0.004 },
        { type: "box", w: 0.03, h: 0.26, d: 0.03, at: [-3.3, 0.35, -0.42], bevel: 0.003 },
        { type: "cylinder", r: 0.022, h: 0.1, at: [-3.3, 0.5, -0.42], segments: 16, bevel: 0.003 },
      ],
    },
    material: "steel_worn",
    mate: { type: "absolute" },
    source:
      "手制动杆（长 0.55）：支架贴变速箱壳体左侧面（z -0.35，留 20mm 装拆缝），杆在驾驶员右前方（z -0.42），与座椅坐垫内缘（z -0.49）留 55mm。",
  });

  // ===================== 潜望镜（驾驶员 + 无线电员） =====================
  add({
    id: "tiger.interior.periscope_body",
    name_cn: "潜望镜壳体",
    name_en: "periscope housing",
    assembly: "interior",
    build_layer: 3,
    build_order: 413,
    geometry: {
      type: "merge",
      parts: [
        { type: "box", w: 0.14, h: 0.18, d: 0.1, at: [0, 0.958, 0], bevel: 0.006 },
        { type: "box", w: 0.16, h: 0.015, d: 0.12, at: [0, 1.0375, 0], bevel: 0.004 },
      ],
    },
    material: "cast_iron_dark",
    instances: 2,
    indexed: true,
    instance_layout: INTERIOR_LAYOUTS.periscope,
    mate: { type: "absolute" },
    source:
      "潜望镜壳体（140 × 180 × 100，顶部安装法兰 160×120）：法兰顶面 1.045，离顶甲板下表面（1.05）5mm；L4 需在甲板对应位置开 160×120 窗。",
  });

  add({
    id: "tiger.interior.periscope_prism",
    name_cn: "潜望镜棱镜",
    name_en: "periscope prism",
    assembly: "interior",
    build_layer: 3,
    build_order: 414,
    geometry: {
      type: "merge",
      parts: [{ type: "box", w: 0.05, h: 0.06, d: 0.08, at: [-0.1, 0.99, 0], bevel: 0.003 }],
    },
    material: "optic_glass",
    instances: 2,
    indexed: true,
    instance_layout: INTERIOR_LAYOUTS.periscope,
    mate: { type: "absolute" },
    source: "潜望镜棱镜（50 × 60 × 80，光学玻璃）：装在壳体前上方窗口外 5mm，向车头方向观察。",
  });

  add({
    id: "tiger.interior.periscope_eyepiece",
    name_cn: "潜望镜目镜",
    name_en: "periscope eyepiece",
    assembly: "interior",
    build_layer: 3,
    build_order: 415,
    geometry: { type: "tube", rOuter: 0.032, rInner: 0.024, h: 0.04, segments: 20 },
    material: "bakelite",
    instances: 2,
    indexed: true,
    instance_layout: INTERIOR_LAYOUTS.eyepiece,
    mate: { type: "absolute" },
    source:
      "目镜筒（ф64/ф48 × 40，轴向后倾）：装在壳体后下方、y 0.93（坐姿眼高 0.95 上方 20mm 处），与壳体后面留 5mm。",
  });

  // ===================== 无线电员席：Fu 5 电台 =====================
  add({
    id: "tiger.interior.radio_body",
    name_cn: "Fu 5 电台",
    name_en: "Fu 5 radio set",
    assembly: "interior",
    build_layer: 3,
    build_order: 416,
    geometry: {
      type: "merge",
      parts: [
        { type: "box", w: 0.3, h: 0.24, d: 0.2, at: [0, 0, 0], bevel: 0.01 },
        { type: "box", w: 0.1, h: 0.08, d: 0.006, at: [0, 0, -0.104], bevel: 0.002 },
        { type: "box", w: 0.28, h: 0.02, d: 0.22, at: [0, 0.13, 0], bevel: 0.004 },
      ],
    },
    material: "cast_iron_dark",
    mate: { type: "absolute", position: [-3.8, 0.42, 0.78] },
    source:
      "Fu 5 收发报机（300 × 240 × 200）：高位挂在无线电员右前方（x -3.95 ~ -3.65、z 0.68 ~ 0.88、y 0.30 ~ 0.54），背面离侧板内表面 20mm；正面 4 只旋钮 + 中央刻度窗；抬高是为避让 z = 0.86 站的 φ550 制动盘（盘顶 y 0.275）。",
  });

  add({
    id: "tiger.interior.radio_mount",
    name_cn: "电台支架",
    name_en: "radio mount",
    assembly: "interior",
    build_layer: 3,
    build_order: 417,
    geometry: {
      type: "merge",
      parts: [
        { type: "box", w: 0.04, h: 0.24, d: 0.016, at: [0.1, 0.42, 0.891], bevel: 0.003 },
        { type: "box", w: 0.04, h: 0.24, d: 0.016, at: [-0.1, 0.42, 0.891], bevel: 0.003 },
        { type: "box", w: 0.34, h: 0.02, d: 0.2, at: [0, 0.288, 0.78], bevel: 0.004 },
      ],
    },
    material: "steel_worn",
    mate: { type: "absolute" },
    source:
      "电台支架（两条竖撑 + 托板）：竖撑后面离侧板内表面 2mm、离电台背面 2mm；托板顶面 0.298，离电台底面（0.30）2mm。",
  });

  add({
    id: "tiger.interior.radio_knob",
    name_cn: "电台旋钮",
    name_en: "radio knob",
    assembly: "interior",
    build_layer: 3,
    build_order: 418,
    geometry: {
      type: "merge",
      parts: [
        { type: "cylinder", r: 0.022, h: 0.024, at: [0, 0, 0], segments: 18, bevel: 0.002 },
        { type: "cylinder", r: 0.014, h: 0.012, at: [0, -0.016, 0], segments: 14, bevel: 0.002 },
      ],
    },
    material: "bakelite",
    instances: 4,
    indexed: true,
    instance_layout: INTERIOR_LAYOUTS.radioKnob,
    mate: { type: "absolute" },
    source: "电台旋钮 4 只（ф44 + ф28 捏手）：轴向 Z 面朝车内，底座面与电台正面留 2mm。",
  });

  // ===================== 航向机枪（机匣段） =====================
  add({
    id: "tiger.interior.bow_mg_body",
    name_cn: "航向机枪机匣",
    name_en: "bow MG receiver",
    assembly: "interior",
    build_layer: 3,
    build_order: 419,
    geometry: {
      type: "kit",
      kit: "bowMg",
      params: { receiverL: 0.32, receiverH: 0.1, receiverW: 0.09, barrelL: 0.2 },
    },
    material: "cast_iron_dark",
    mate: { type: "absolute", position: [-4.14, 0.16, 0.78] },
    source:
      "MG 34 航向机枪机匣段（机匣 320 × 100 × 90，枪管 ф44 × 200）：枪口朝 -X，枪管穿入前装甲板 ⌀100 球孔（L4-a 开孔，球心 y 0.16 / z 0.78）；枪口 x -4.49（孔内，距板外面 4mm、距 L4-e 球座底面 13mm），孔与枪管留 28mm 环缝。车外可见的球座与枪管由 L4-e（tiger.hull.mg_mount / mg34_barrel）负责，本件只做车内机匣段。枪管套（ф64，前端 -4.395）与板内表面 -4.40 留 5mm。整枪站在转向机壳体（半宽 0.66）之外侧，并抬到侧传动轴法兰（z 0.735、顶 0.11）上方 50mm。",
  });

  add({
    id: "tiger.interior.bow_mg_drum",
    name_cn: "机枪弹鼓",
    name_en: "MG drum magazine",
    assembly: "interior",
    build_layer: 3,
    build_order: 420,
    geometry: {
      type: "merge",
      parts: [
        { type: "cylinder", r: 0.075, h: 0.05, at: [0, 0, 0], segments: 28, bevel: 0.004 },
        { type: "cylinder", r: 0.06, h: 0.012, at: [0, 0.028, 0], segments: 24, bevel: 0.003 },
      ],
    },
    material: "cast_iron_dark",
    mate: { type: "absolute", position: [-4.12, 0.294, 0.78], rotation: AXIS_Z },
    source: "弹鼓（ф150 × 50，轴向 Z）：坐在机匣顶部（顶面 0.15）上方 4mm，鼓心 y 0.294。",
  });

  add({
    id: "tiger.interior.bow_mg_grip",
    name_cn: "机枪握把",
    name_en: "MG grip",
    assembly: "interior",
    build_layer: 3,
    build_order: 421,
    geometry: {
      type: "merge",
      parts: [{ type: "box", w: 0.025, h: 0.06, d: 0.03, at: [0, 0, 0], bevel: 0.004 }],
    },
    material: "bakelite",
    instances: 2,
    indexed: true,
    instance_layout: INTERIOR_LAYOUTS.mgGrip,
    mate: { type: "absolute" },
    source: "双握把（25 × 60 × 30）：装在机匣后板之后 12mm，两把间距 70mm，供无线电员操作航向机枪。",
  });

  // ===================== 杂项 =====================
  add({
    id: "tiger.interior.fire_extinguisher",
    name_cn: "灭火器",
    name_en: "fire extinguisher",
    assembly: "interior",
    build_layer: 3,
    build_order: 422,
    geometry: {
      type: "merge",
      parts: [
        { type: "cylinder", r: 0.055, h: 0.28, at: [0, 0, 0], segments: 24, bevel: 0.004 },
        { type: "cylinder", r: 0.058, h: 0.02, at: [0, -0.15, 0], segments: 24, bevel: 0.003 },
        { type: "cylinder", r: 0.025, h: 0.04, at: [0, 0.16, 0], segments: 16, bevel: 0.002 },
        { type: "box", w: 0.05, h: 0.03, d: 0.05, at: [0, 0.19, 0], bevel: 0.004 },
      ],
    },
    material: "interior_red",
    mate: { type: "absolute", position: [-2.95, 0, -0.83] },
    source:
      "手提灭火器（瓶体 ф110 × 280，阀头 50×30）：挂在左侧板内表面（z -0.90）前 40mm，瓶底 y -0.17；两只卡箍分上下抱住瓶体。",
  });

  add({
    id: "tiger.interior.extinguisher_clamp",
    name_cn: "灭火器卡箍",
    name_en: "extinguisher clamp",
    assembly: "interior",
    build_layer: 3,
    build_order: 423,
    geometry: {
      type: "merge",
      parts: [
        { type: "tube", rOuter: 0.062, rInner: 0.057, h: 0.03, at: [0, 0, 0], segments: 24 },
        { type: "box", w: 0.03, h: 0.03, d: 0.01, at: [0, 0, -0.063], bevel: 0.003 },
      ],
    },
    material: "steel",
    instances: 2,
    indexed: true,
    instance_layout: INTERIOR_LAYOUTS.clamp,
    mate: { type: "absolute" },
    source:
      "卡箍（内径 114，环抱 ф110 瓶体，径向 2mm）：两只（y -0.09 / +0.09），耳板外侧 -0.898 —— 离侧板内表面（L4-a 的 z -0.90）2mm、离瓶体表面（-0.885）3mm。",
  });

  add({
    id: "tiger.interior.lamp",
    name_cn: "舱内照明灯",
    name_en: "interior lamp",
    assembly: "interior",
    build_layer: 3,
    build_order: 424,
    geometry: {
      type: "merge",
      parts: [
        { type: "cylinder", r: 0.04, h: 0.03, at: [0, -0.01, 0], segments: 20, bevel: 0.004 },
        { type: "cylinder", r: 0.01, h: 0.06, at: [0, 0.035, 0], segments: 12, bevel: 0.002 },
      ],
    },
    material: "lamp_glass",
    instances: 2,
    indexed: true,
    instance_layout: INTERIOR_LAYOUTS.lamp,
    mate: { type: "absolute" },
    source:
      "舱内照明灯（灯罩 ф80 × 30 + 吊杆 ф20 × 60）：吊装在顶甲板下方（吊杆顶 1.045，离甲板 5mm），两盏分别照驾驶席与无线电员席。",
  });

  add({
    id: "tiger.interior.stowage_box",
    name_cn: "杂件箱",
    name_en: "stowage box",
    assembly: "interior",
    build_layer: 3,
    build_order: 425,
    geometry: {
      type: "merge",
      parts: [
        { type: "box", w: 0.3, h: 0.2, d: 0.18, at: [0, 0, 0], bevel: 0.006 },
        { type: "box", w: 0.32, h: 0.02, d: 0.2, at: [0, 0.105, 0], bevel: 0.004 },
        { type: "box", w: 0.02, h: 0.04, d: 0.03, at: [0.0, 0.09, -0.095], bevel: 0.002 },
      ],
    },
    material: "interior_red",
    mate: { type: "absolute", position: [-2.55, -0.2, 0.79] },
    source:
      "杂件箱（300 × 200 × 180 + 盖沿 320×200）：放在地板上（箱底 -0.30，离地板 5mm），靠右侧板内表面 20mm，在变速箱尾端之后 20mm。",
  });

  // ===================== L3 第二批：战斗舱（弹药 / 吊篮 / 座席） =====================

  add({
    id: "tiger.interior.ammo_case",
    name_cn: "88mm 药筒",
    name_en: "8,8 cm Treibladungshülse",
    assembly: "interior",
    build_layer: 3,
    build_order: 430,
    geometry: {
      type: "merge",
      parts: [
        { type: "cylinder", r: 0.058, h: 0.02, at: [0, 0.01, 0], bevel: 0.002 },
        { type: "cylinder", r: 0.052, h: 0.55, at: [0, 0.295, 0], bevel: 0.002 },
      ],
    },
    material: "brass",
    instances: 92,
    indexed: true,
    instance_layout: "interior.ammoCase",
    mate: { type: "absolute" },
    source:
      "88mm 药筒（8,8 cm KwK 36 定装弹）：⌀105×570、底缘 ⌀116×20，全高 590，底面 y 0.153（赞助板地板面 0.15，留 3mm）。92 发基数：左右赞助板各 46 发、内外两排（z ±1.18 / ±1.42）各 23 发、纵向间距 145（x -4.05 ~ -0.86），后排离防火隔板 27mm。药筒与弹丸分为两个零件，便于殉爆连锁时逐发抛出。",
  });

  add({
    id: "tiger.interior.ammo_projectile_ap",
    name_cn: "88mm 穿甲弹丸（APCBC）",
    name_en: "8,8 cm Pzgr. 39",
    assembly: "interior",
    build_layer: 3,
    build_order: 431,
    geometry: {
      type: "merge",
      parts: [
        { type: "cylinder", r: 0.044, h: 0.19, at: [0, 0.095, 0], bevel: 0.002 },
        { type: "cylinder", r: 0.044, h: 0.08, rTop: 0.02, at: [0, 0.23, 0], bevel: 0.002 },
        { type: "cylinder", r: 0.0455, h: 0.02, at: [0, 0.01, 0], bevel: 0.001 },
      ],
    },
    material: "steel_worn",
    instances: 50,
    indexed: true,
    instance_layout: "interior.ammoProjectileAp",
    mate: { type: "absolute" },
    source:
      "穿甲弹丸（Pzgr. 39，APCBC）：弹体 ⌀88×190、风帽锥 80（顶 ⌀40）、弹带 ⌀91×20。弹底 y 0.723（药筒口 0.723），弹尖 1.033。50 发：内排 46 发全穿甲 + 外排每侧前 2 发，弹带与风帽按钢色区分 HE。",
  });

  add({
    id: "tiger.interior.ammo_projectile_he",
    name_cn: "88mm 榴弹丸（HE）",
    name_en: "8,8 cm Sprgr. 43",
    assembly: "interior",
    build_layer: 3,
    build_order: 432,
    geometry: {
      type: "merge",
      parts: [
        { type: "cylinder", r: 0.044, h: 0.19, at: [0, 0.095, 0], bevel: 0.002 },
        { type: "cylinder", r: 0.044, h: 0.075, rTop: 0.026, at: [0, 0.2275, 0], bevel: 0.002 },
        { type: "cylinder", r: 0.0455, h: 0.02, at: [0, 0.01, 0], bevel: 0.001 },
      ],
    },
    material: "paint",
    instances: 42,
    indexed: true,
    instance_layout: "interior.ammoProjectileHe",
    mate: { type: "absolute" },
    source:
      "榴弹丸（Sprgr. 43，HE）：弹体 ⌀88×190、弹头锥 75（顶 ⌀52，比穿甲弹钝）、弹带 ⌀91×20，整体按暗黄涂装区分弹种。42 发全部在外排（每侧 21 发）。弹底 y 0.723、弹尖 1.0255。",
  });

  add({
    id: "tiger.interior.ammo_rack",
    name_cn: "弹药架",
    name_en: "Munitionshalterung",
    assembly: "interior",
    build_layer: 3,
    build_order: 433,
    geometry: {
      type: "merge",
      parts: [
        { type: "box", w: 3.3, h: 0.04, d: 0.05, at: [0, 0.35, -0.245], bevel: 0.005 },
        { type: "box", w: 3.3, h: 0.04, d: 0.05, at: [0, 0.35, 0.245], bevel: 0.005 },
        { type: "box", w: 3.3, h: 0.04, d: 0.05, at: [0, 0.75, -0.245], bevel: 0.005 },
        { type: "box", w: 3.3, h: 0.04, d: 0.05, at: [0, 0.75, 0.245], bevel: 0.005 },
        { type: "box", w: 0.04, h: 0.46, d: 0.05, at: [-1.5, 0.55, -0.245], bevel: 0.004 },
        { type: "box", w: 0.04, h: 0.46, d: 0.05, at: [-0.9, 0.55, -0.245], bevel: 0.004 },
        { type: "box", w: 0.04, h: 0.46, d: 0.05, at: [-0.3, 0.55, -0.245], bevel: 0.004 },
        { type: "box", w: 0.04, h: 0.46, d: 0.05, at: [0.3, 0.55, -0.245], bevel: 0.004 },
        { type: "box", w: 0.04, h: 0.46, d: 0.05, at: [0.9, 0.55, -0.245], bevel: 0.004 },
        { type: "box", w: 0.04, h: 0.46, d: 0.05, at: [1.5, 0.55, -0.245], bevel: 0.004 },
        { type: "box", w: 0.04, h: 0.46, d: 0.05, at: [-1.5, 0.55, 0.245], bevel: 0.004 },
        { type: "box", w: 0.04, h: 0.46, d: 0.05, at: [-0.9, 0.55, 0.245], bevel: 0.004 },
        { type: "box", w: 0.04, h: 0.46, d: 0.05, at: [-0.3, 0.55, 0.245], bevel: 0.004 },
        { type: "box", w: 0.04, h: 0.46, d: 0.05, at: [0.3, 0.55, 0.245], bevel: 0.004 },
        { type: "box", w: 0.04, h: 0.46, d: 0.05, at: [0.9, 0.55, 0.245], bevel: 0.004 },
        { type: "box", w: 0.04, h: 0.46, d: 0.05, at: [1.5, 0.55, 0.245], bevel: 0.004 },
      ],
    },
    material: "steel",
    instances: 2,
    indexed: true,
    instance_layout: "interior.ammoRack",
    mate: { type: "absolute", position: [-2.455, 0, 0] },
    source:
      "弹药架（Munitionshalterung）：上下两层横梁（40×50、长 3300）夹住两排弹，横梁中心 y 0.35 / 0.75，内外侧 z 距架中心 ±245（离弹体最外缘 13mm）；6 组立柱（40×460×50）把横梁连成框架。左右各一，架中心 z ±1.30、x -2.455。",
  });

  add({
    id: "tiger.interior.basket_floor",
    name_cn: "炮塔吊篮地板",
    name_en: "Turmboden",
    assembly: "interior",
    build_layer: 3,
    build_order: 434,
    geometry: { type: "tube", rOuter: 0.8, rInner: 0.34, h: 0.02, segments: 40 },
    material: "armor_steel",
    mate: { type: "absolute", position: [-1.65, 1.15, 0] },
    source:
      "炮塔吊篮地板（Turmboden）：环形板 ⌀1600 / 内孔 ⌀680、厚 20，中心 (x -1.65, z 0)，板面 y 1.14 ~ 1.16。外缘离炮塔内壁 60mm，底面离座圈上表面 1.108 留 32mm；中孔让开炮闩与炮手膝部。",
  });

  add({
    id: "tiger.interior.basket_rail",
    name_cn: "吊篮护栏",
    name_en: "Turmboden Geländer",
    assembly: "interior",
    build_layer: 3,
    build_order: 435,
    geometry: {
      type: "merge",
      parts: [
        { type: "tube", rOuter: 0.82, rInner: 0.79, h: 0.03, at: [0, 1.32, 0], segments: 40 },
        { type: "box", w: 0.03, h: 0.16, d: 0.03, at: [0.8, 1.245, 0], bevel: 0.003 },
        { type: "box", w: 0.03, h: 0.16, d: 0.03, at: [-0.8, 1.245, 0], bevel: 0.003 },
        { type: "box", w: 0.03, h: 0.16, d: 0.03, at: [0, 1.245, 0.8], bevel: 0.003 },
        { type: "box", w: 0.03, h: 0.16, d: 0.03, at: [0, 1.245, -0.8], bevel: 0.003 },
      ],
    },
    material: "steel",
    mate: { type: "absolute", position: [-1.65, 0, 0] },
    source:
      "吊篮护栏（Turmboden Geländer）：扶手环 ⌀1640/⌀1580×30、中心 y 1.32；4 根立柱 30×160×30 落在吊篮地板面上方 5mm。护栏外缘离炮塔内壁 40mm，不随炮塔旋转卡死。",
  });

  add({
    id: "tiger.interior.traverse_motor",
    name_cn: "炮塔回转电机",
    name_en: "Turmdrehwerk",
    assembly: "interior",
    build_layer: 3,
    build_order: 436,
    geometry: {
      type: "merge",
      parts: [
        { type: "box", w: 0.26, h: 0.22, d: 0.2, at: [0, 0, 0], bevel: 0.008 },
        { type: "cylinder", r: 0.08, h: 0.16, at: [0, 0.19, 0], bevel: 0.004 },
        { type: "cylinder", r: 0.03, h: 0.12, at: [0, 0.33, 0], bevel: 0.003 },
      ],
    },
    material: "steel",
    mate: { type: "absolute", position: [-2.28, 1.3, 0] },
    source:
      "炮塔回转电机（Turmdrehwerk）：机体 260×220×200、上方法兰 ⌀160×160、输出轴 ⌀60×120，中心 (x -2.4, z 0)，底面 y 1.19（离吊篮地板面 1.16 留 30mm，实车坐在变速箱上）。位于炮闩正下方、炮手与装填手之间。",
  });

  add({
    id: "tiger.interior.roof_fan",
    name_cn: "炮塔排烟风扇",
    name_en: "Turmlüfter",
    assembly: "interior",
    build_layer: 3,
    build_order: 437,
    geometry: {
      type: "merge",
      parts: [
        { type: "tube", rOuter: 0.14, rInner: 0.126, h: 0.06, at: [0, 0, 0], segments: 24 },
        { type: "cylinder", r: 0.125, h: 0.012, at: [0, -0.005, 0], bevel: 0.002 },
        { type: "cylinder", r: 0.03, h: 0.04, at: [0, 0.005, 0], bevel: 0.004 },
      ],
    },
    material: "armor_steel",
    mate: { type: "absolute", position: [-0.98, 1.78, -0.1] },
    source:
      "炮塔排烟风扇（Turmlüfter）：外罩筒 ⌀280/⌀252×60、叶轮盘 ⌀250×12、轮毂 ⌀60×60，中心 (x -0.98, z -0.10)，装在炮塔顶盖下方 31mm（顶盖内表面 1.811，风扇顶 1.81）。外观罩（L4-f）已在其正上方。",
  });

  add({
    id: "tiger.interior.turret_seat",
    name_cn: "炮塔座席",
    name_en: "Turmsitz",
    assembly: "interior",
    build_layer: 3,
    build_order: 438,
    geometry: {
      type: "merge",
      parts: [
        { type: "cylinder", r: 0.055, h: 0.3, at: [0, 0.15, 0], bevel: 0.004 },
        { type: "box", w: 0.36, h: 0.06, d: 0.36, at: [0, 0.32, 0], bevel: 0.01 },
        { type: "box", w: 0.06, h: 0.28, d: 0.36, at: [0.16, 0.47, 0], bevel: 0.008 },
      ],
    },
    material: "canvas_black",
    instances: 3,
    indexed: true,
    instance_layout: "interior.turretSeat",
    mate: { type: "absolute" },
    source:
      "炮塔座席（Turmsitz）：立柱 ⌀110×300、座垫 360×60×360、靠背 60×340×360。三席：车长 (-1.32, -0.44) 在指挥塔正下方、炮手 (-1.95, -0.30) 朝前、装填手 (-1.95, +0.35) 朝后（转 180°）。座面 y 1.485、靠背顶 1.833，离顶盖内表面 1.811 留 22mm；立柱底离吊篮地板面 3mm。",
  });

  return parts;
}

export function makeInteriorRegistry(): ModelRegistry {
  return {
    model: "tiger",
    title: "虎式 I 内衬内饰（L3）",
    subtitle: "驾驶舱 / 无线电员席：座椅、仪表板、方向盘、潜望镜、Fu 5 电台",
    source_notes: [
      "公开资料：虎式 I 前部战斗室左侧为驾驶员席（方向盘 + 预选杆 + 仪表板 + 两具潜望镜），右侧为无线电员席（Fu 5 电台、航向机枪、潜望镜）；两席之间是隆起的变速箱盖，地板下为扭杆与传动轴。",
      "布置（本模型口径）：驾驶员 z = -0.67、无线电员 z = +0.67，座椅中心 x = -3.32；地板顶面 -0.305、侧板内表面 ±0.90、前装甲板内表面 -4.40、顶甲板下表面 +1.05（L4 接口）。方向盘 φ380、盘面水平，中心 (x -3.80, y 0.49, z -0.42)，与 B3 转向柱（x -3.80、z -0.42、顶面 y 0.36）同轴经联轴套相接。",
      "落座（L4 落地）：仪表板离前板 5mm；潜望镜壳体法兰离顶甲板 5mm（甲板需开 160×120 窗，两处 z = ±0.66、x -3.95）；航向机枪枪管需 ⌀100 球孔（球心 y 0.16 / z 0.78，枪口伸出车头外板 0.09m）；座椅底座、灭火器、杂件箱与地板留 2~5mm 名义缝；电台背面离侧板内表面 20mm、灭火器离左侧板内表面 40mm。",
      "简化记录（M-C 待补）：表盘刻度/指针、开关档位、光学镜组、电台内部与线缆、安全带锁扣、座椅软包分块；预选杆（B3 已建）兼作驾驶员变速杆，本批不重复。",
      "待校（L4 前甲板 / 甲板定案时一并复核）：航向机枪（z 0.78、y 0.16）与 Fu 5 电台（y 0.30 ~ 0.54）在前后方向上串列，从车后 / 俯视看电台挡住机枪；且球心 y 0.16 低于制动盘盘顶（0.275）。可选方案：机枪抬到 y ≈ 0.36、内移到 z ≈ 0.62（转向机半宽 0.66 与制动盘站 z 0.86 之间的通道，与转向机顶加强台留 0.12），或电台下移到 y 0.10 ~ 0.34 贴右壁前段。",
    ].join("\n"),
    constants: IN_CONSTANTS,
    assemblies: [{ id: "interior", name_cn: "内衬内饰", name_en: "interior", explode: [0, 0.6, 0] }],
    nodes: [],
    materials: {
      interior_paint: {
        base: "#c8c1af",
        metalness: 0.14,
        roughness: 0.72,
        preset: "primer",
        envMapIntensity: 0.9,
      },
      interior_red: {
        base: "#7a3d33",
        metalness: 0.1,
        roughness: 0.8,
        preset: "primer",
        envMapIntensity: 0.85,
      },
      canvas_black: {
        base: "#2b2b28",
        metalness: 0.02,
        roughness: 0.95,
        preset: "rubber",
        envMapIntensity: 0.5,
      },
      optic_glass: {
        base: "#9ec4c8",
        metalness: 0.55,
        roughness: 0.08,
        preset: "none",
        envMapIntensity: 1.4,
      },
      lamp_glass: {
        base: "#e8d7b0",
        metalness: 0.1,
        roughness: 0.25,
        preset: "none",
        envMapIntensity: 0.8,
        emissive: "#ffcf87",
        emissiveIntensity: 0.35,
      },
    },
    parts: buildInteriorParts(),
  };
}
