import * as THREE from "three";
import type { InstanceLayout } from "../../../assembler/assembler";
import type { ModelRegistry, NodeDef, PartDefinition } from "../../../registry/types";

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
  // —— L3 第三批：线束 / 战斗室 / 生活痕迹 ——
  cableClamp: "interior.cableClamp",
  junctionBox: "interior.junctionBox",
  relayBox: "interior.relayBox",
  breaker: "interior.breaker",
  dataPlate: "interior.dataPlate",
  warningLabel: "interior.warningLabel",
  grabHandle: "interior.grabHandle",
  floorMat: "interior.floorMat",
  personalKit: "interior.personalKit",
  toolRow: "interior.toolRow",
  cupolaPeriscope: "interior.cupolaPeriscope",
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

  // —— 仪表组（5 只表 + 真指针）——
  // 表心 x 比仪表板面（IN_DASH_X + 20mm）再前 12mm：表背与板面留 2mm。
  IN_GAUGE_X: -4.343,
  IN_GAUGE_Y: 0.27,
  IN_GAUGE_Z0: -0.8,
  IN_GAUGE_PITCH: 0.14,
  /** 指针盘面：表圈前端面（+16mm）+ 1.5mm 间隙 → 指针体中心。 */
  IN_GAUGE_FACE_DX: 0.0175,
  /** 指针有效长度：表盘内径 32mm，指针尖留 4mm 余量。 */
  IN_GAUGE_NEEDLE_LEN: 0.026,

  // —— 战斗室基准（L4 炮塔接口，本批线束 / 待发弹 / 塔内设备用）——
  IN_RING_X: -1.65,
  IN_CUPOLA_X: -1.3,
  IN_CUPOLA_Z: -0.42,
  IN_BULKHEAD_X: -0.78,
};

/** 仪表序号 → 表心世界坐标（布局与节点共用同一份派生，禁止两处各写一遍）。 */
function gaugeCenter(index: number, c: Record<string, number>): [number, number, number] {
  return [c.IN_GAUGE_X!, c.IN_GAUGE_Y!, c.IN_GAUGE_Z0! + index * c.IN_GAUGE_PITCH!];
}

/** 仪表指针节点名（5 只表各一个：针绕 X 轴摆动）。 */
export function gaugeNodeName(index: number): string {
  return `Gauge_${index + 1}`;
}

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

  layouts[INTERIOR_LAYOUTS.gauge] = ({ index, constants }) => {
    const [x, y, z] = gaugeCenter(index, constants);
    return laid(RX, x, y, z);
  };

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

  layouts[INTERIOR_LAYOUTS.clamp] = ({ index }) => {
    // 4 只：左右两侧各一具灭火器（瓶心 z ±0.83），每具上下两道箍；右侧箍转 180° 让耳板朝壁
    const side = index < 2 ? -1 : 1;
    const y = index % 2 === 0 ? -0.09 : 0.09;
    const rot = side > 0 ? new THREE.Matrix4().makeRotationY(Math.PI) : null;
    return laid(rot, -2.95, y, side * 0.83);
  };
  layouts["interior.extinguisherPair"] = ({ index }) =>
    new THREE.Matrix4().makeTranslation(-2.95, 0, (index % 2 === 0 ? -1 : 1) * 0.83);
  // 吊篮支柱 4 根：从护栏带上沿（1.335）顶到顶甲内表面（1.811）下 6mm，绕座圈 r 0.80 均布，
  // 避开前方复进机开口（135°~225°）与右后排风管。
  layouts["interior.basketStrut"] = ({ index }) => {
    const spots: [number, number, number][] = [
      [-0.957, 1.34, 0.4],
      [-1.789, 1.34, 0.788],
      [-2.216, 1.34, -0.566],
      [-1.25, 1.34, -0.693],
    ];
    const [x, y, z] = spots[index % spots.length]!;
    return new THREE.Matrix4().makeTranslation(x, y, z);
  };

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
      [-1.95, 1.163, -0.38],
      [-1.95, 1.163, 0.43],
    ];
    const [x, y, z] = list[index] ?? list[0]!;
    const m = new THREE.Matrix4().makeTranslation(x, y, z);
    if (index === 2) m.multiply(new THREE.Matrix4().makeRotationY(Math.PI));
    return m;
  };

  // ===================== L3 第三批：线束 / 战斗室 / 生活痕迹 =====================
  // 这一批的坐标全部按「贴壁留 2mm 名义缝」的口径给，走线沿侧板内表面（z ±0.90）
  // 高走 y 0.88，绕开潜望镜体（y 0.868~1.048 / z ±0.74）与座椅靠背（顶 0.57）。
  const atList =
    (
      list: readonly (readonly [number, number, number])[],
      rot: THREE.Matrix4 | null = null,
    ): InstanceLayout =>
    ({ index }) => {
      const [x, y, z] = list[index % list.length]!;
      return laid(rot, x, y, z);
    };

  // 线束卡箍：左右壁各 4 只（280mm 一只，末端让位给接线盒）
  const clampSpots: (readonly [number, number, number])[] = [];
  for (let i = 0; i < 3; i++) clampSpots.push([-4.05 + i * 0.28, 0.88, -0.898]);
  layouts[INTERIOR_LAYOUTS.cableClamp] = atList(clampSpots);
  layouts["interior.cableClampR"] = atList(
    clampSpots.map(([x, y, z]) => [x, y, -z] as const),
    new THREE.Matrix4().makeRotationY(Math.PI),
  );
  // 液压管左右两组（双管沿 Z 并排，贴地板走；转向机壳体宽到 z ±0.66，故走 z ±0.72）
  layouts["interior.brakePipe"] = atList([
    [0, 0, -0.72],
    [0, 0, 0.72],
  ]);

  // 接线盒：左壁 / 右壁 / 后隔板，各自转朝向让背板贴壁
  const boxSpots: [number, number, number][] = [
    [-2.92, 0.88, -0.868],
    [-2.92, 0.88, 0.868],
    [-0.81, 0.86, -0.55],
  ];
  const boxRots = [0, Math.PI, -Math.PI / 2];
  layouts[INTERIOR_LAYOUTS.junctionBox] = ({ index }) =>
    new THREE.Matrix4()
      .makeRotationY(boxRots[index % 3]!)
      .setPosition(boxSpots[index % 3]![0], boxSpots[index % 3]![1], boxSpots[index % 3]![2]);
  // 继电器盒 3 只 + 断路器 6 只：都在前装甲板内侧、仪表板上方（仪表顶 0.38）
  layouts[INTERIOR_LAYOUTS.relayBox] = atList(
    [-0.78, -0.66, -0.54].map((z) => [-4.36, 0.56, z] as const),
  );
  layouts[INTERIOR_LAYOUTS.breaker] = atList(
    [0, 1, 2, 3, 4, 5].map((i) => [-4.368, 0.42, 0.33 + i * 0.042] as const),
  );

  // 待发弹：炮塔后壁前、吊篮内的横置弹架 2 层 ×2 列（弹体沿 Z 横放）
  // 旋转必须写在 layout 里：layout 平移是叠在 mate 之上的，把旋转放 mate 会把
  // 平移量一起转走（本批一开始就踩了这个坑，弹全部飞到车外）。
  const RX90 = new THREE.Matrix4().makeRotationX(Math.PI / 2);
  const RY90 = new THREE.Matrix4().makeRotationY(Math.PI / 2);
  const RYm90 = new THREE.Matrix4().makeRotationY(-Math.PI / 2);
  const RZ90 = new THREE.Matrix4().makeRotationZ(Math.PI / 2);
  const readyXs = [-1.25, -1.13, -1.25, -1.13];
  const readyZs = [0.22, 0.22, 0.36, 0.36];
  layouts["interior.readyCase"] = ({ index }) =>
    new THREE.Matrix4().makeTranslation(readyXs[index % 4]!, 1.4, readyZs[index % 4]!);
  // 车长塔周向潜望镜 7 具：绕塔口 r 0.19（筒壁内表面 r 0.225、观察缝盒 r 0.234 之内）
  layouts[INTERIOR_LAYOUTS.cupolaPeriscope] = ({ index }) => {
    const deg = -55 + index * 50;
    return new THREE.Matrix4().makeTranslation(
      c.IN_CUPOLA_X! + 0.19 * Math.cos(THREE.MathUtils.degToRad(deg)),
      1.92,
      c.IN_CUPOLA_Z! + 0.19 * Math.sin(THREE.MathUtils.degToRad(deg)),
    );
  };
  // 吊篮里的储物箱 / 弹鼓都只有地板上一个空位，坐标直接写进各自零件的 mate（见下）
  // 后隔板（战斗室侧，面 x -0.780）：所有挂件按「离板面 2mm」给 x
  layouts[INTERIOR_LAYOUTS.toolRow] = atList([
    [-0.806, 0.3, -0.24],
    [-0.806, 0.3, -0.14],
    [-0.806, 0.3, -0.04],
    [-0.806, 0.3, 0.16],
    [-0.806, 0.3, 0.26],
  ]);
  layouts["interior.toolRowRot"] = atList(
    [
      [-0.818, 0.3, -0.24],
      [-0.818, 0.3, -0.14],
      [-0.818, 0.3, -0.04],
      [-0.818, 0.3, 0.16],
      [-0.818, 0.3, 0.26],
    ],
    RX90,
  );
  layouts[INTERIOR_LAYOUTS.personalKit] = atList([
    [-0.825, 0.62, -0.68],
    [-0.825, 0.62, 0.68],
  ]);
  layouts["interior.messTin"] = atList([
    [-0.801, 0.46, -0.62],
    [-0.801, 0.46, 0.62],
  ]);
  layouts["interior.hookRow"] = atList([
    [-0.788, 0.76, -0.68],
    [-0.788, 0.76, 0.68],
    [-0.788, 0.76, -0.45],
  ]);
  layouts["interior.breadBag"] = atList([
    [-0.812, 0.66, -0.3],
    [-0.812, 0.66, 0.18],
  ]);
  // 扶手：两侧壁各一只（杆沿 Y、支座补到壁面）、后隔板两只（杆沿 Z、挂在个人物品上方）
  layouts[INTERIOR_LAYOUTS.grabHandle] = ({ index }) => {
    const list: [number, number, number, THREE.Matrix4][] = [
      [-2.62, 0.62, -0.896, RY90],
      [-0.782, 0.8, -0.38, RX90],
      [-0.782, 0.8, 0.38, RX90],
      [-2.62, 0.62, 0.896, RYm90],
    ];
    const [x, y, z, rot] = list[index % 4]!;
    return laid(rot, x, y, z);
  };
  // 铭牌 / 警示标签：板面法线沿 X → 绕 Z 转 90°
  const plateSpots: [number, number, number, THREE.Matrix4 | null][] = [
    [-0.783, 0.86, -0.42, null],
    [-0.783, 0.86, 0.42, null],
    [-4.396, 0.72, -0.3, null],
    [-3.198, 0.99, -0.896, RY90],
    [-3.198, 0.99, 0.896, RYm90],
    [-3.05, 0.414, 0.24, RZ90],
  ];
  layouts[INTERIOR_LAYOUTS.dataPlate] = ({ index }) => {
    const [x, y, z, rot] = plateSpots[index % plateSpots.length]!;
    return laid(rot, x, y, z);
  };
  layouts[INTERIOR_LAYOUTS.warningLabel] = atList(
    [
      [-4.3955, 0.66, -0.62],
      [-0.783, 0.99, 0],
      [-4.132, 0.2, -0.5],
      [-2.87, 0.24, -0.868],
    ] as const,
  );
  layouts[INTERIOR_LAYOUTS.floorMat] = atList([
    [-3.9, -0.299, -0.67],
    [-3.9, -0.299, 0.67],
  ]);
  return layouts;
}

// ---------------------------------------------------------------------------
// 零件
// ---------------------------------------------------------------------------

function buildInteriorParts(): PartDefinition[] {
  const parts: PartDefinition[] = [];
  const add = (part: PartDefinition) => parts.push(part);
  const c = IN_CONSTANTS;

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
      ],
    },
    material: "steel",
    instances: 5,
    indexed: true,
    instance_layout: INTERIOR_LAYOUTS.gauge,
    mate: { type: "absolute" },
    source:
      "仪表 ф76（车速/转速/油温/水温/油量 5 只）：轴向 +X 面向驾驶员，表背与仪表板面留 2mm；" +
      "表圈内孔 ф64，表盘（gauge_dial）坐在孔内、指针（gauge_needle）由节点驱动。",
  });

  add({
    id: "tiger.interior.gauge_dial",
    name_cn: "仪表表盘",
    name_en: "gauge dial",
    assembly: "interior",
    build_layer: 3,
    build_order: 409,
    geometry: {
      type: "merge",
      parts: [
        { type: "cylinder", r: 0.03, h: 0.002, at: [0, 0.013, 0], segments: 32, bevel: 0.0006 },
      ],
    },
    material: "interior_paint",
    instances: 5,
    indexed: true,
    instance_layout: INTERIOR_LAYOUTS.gauge,
    mate: { type: "absolute" },
    source:
      "表盘 ф60×2，坐在表圈内孔（ф64）里，径向留 2mm；正面在表圈前端面（+16mm）之后 2mm，" +
      "指针压在盘面上。刻度留待贴图批次，本批只做盘面与真指针。",
  });

  add({
    id: "tiger.interior.gauge_needle",
    name_cn: "仪表指针",
    name_en: "gauge needle",
    assembly: "interior",
    build_layer: 3,
    build_order: 410,
    geometry: {
      type: "merge",
      parts: [
        // 轴套：压在盘面上（盘面前端面 x +14mm，留 0.2mm 间隙），沿 +X 出 5mm。
        // 注意 merge 子件不支持旋转，圆柱轴恒为 +Y；轴套要沿 X，故用方块（倒角后近似圆台）。
        {
          type: "box",
          w: 0.005,
          h: 0.009,
          d: 0.009,
          at: ["IN_GAUGE_FACE_DX-0.0008", 0, 0],
          bevel: 0.0015,
        },
        // 针体：沿 +Z 出针，绕 X 轴摆动 240°（-120°..+120°）。
        {
          type: "box",
          w: 0.0018,
          h: 0.004,
          d: "IN_GAUGE_NEEDLE_LEN",
          at: ["IN_GAUGE_FACE_DX", 0, "IN_GAUGE_NEEDLE_LEN/2+0.001"],
          bevel: 0.0004,
        },
      ],
    },
    material: "interior_red",
    instances: 5,
    indexed: true,
    instance_nodes: Array.from({ length: 5 }, (_, i) => gaugeNodeName(i)),
    mate: { type: "absolute" },
    source:
      "真指针（替代原装饰针）：轴套 ф9×5 + 针体 1.8×4×26，红色。几何按世界朝向建（针沿 +Z、轴套沿 +X），" +
      "节点绕 X 摆动即可在表盘平面内扫过；行程 240° 对应满量程。",
  });

  add({
    id: "tiger.interior.toggle",
    name_cn: "开关",
    name_en: "toggle switch",
    assembly: "interior",
    build_layer: 3,
    build_order: 411,
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
    build_order: 412,
    geometry: {
      type: "kit",
      kit: "perforatedPedal",
      params: { d: 0.1, w: 0.06, t: 0.02, holes: 8, holeR: 0.0085, armH: 0.185 },
    },
    material: "steel_worn",
    instances: 3,
    indexed: true,
    instance_layout: INTERIOR_LAYOUTS.pedal,
    mate: { type: "absolute", position: [-4.24, 0.225, 0] },
    source:
      "踏板（离合/制动/油门，踏板面 100×60×20 铝板）：面顶 y 0.245，面上 8 个 ⌀17 防滑孔（真孔，不是贴花）；吊臂挂在踏板面后缘、套在 ⌀22 悬挂横轴（y 0.42 / x -4.28）上；横轴前端离前装甲板内表面 5mm，整组在转向机前盖（x -4.122）之前 78mm。",
  });

  add({
    id: "tiger.interior.control_lever",
    name_cn: "操纵杆",
    name_en: "control lever",
    assembly: "interior",
    build_layer: 3,
    build_order: 413,
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
    build_order: 414,
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
    build_order: 415,
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
    build_order: 416,
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
    build_order: 417,
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
    build_order: 418,
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
    build_order: 419,
    geometry: {
      type: "merge",
      parts: [
        { type: "box", w: 0.04, h: 0.24, d: 0.006, at: [-3.7, 0.42, 0.895], bevel: 0.002 },
        { type: "box", w: 0.04, h: 0.24, d: 0.006, at: [-3.9, 0.42, 0.895], bevel: 0.002 },
        { type: "box", w: 0.34, h: 0.02, d: 0.2, at: [-3.8, 0.288, 0.78], bevel: 0.004 },
      ],
    },
    material: "steel_worn",
    mate: { type: "absolute" },
    source:
      "电台支架（两条竖撑 + 托板）：托板 340×20×200 顶面 0.298、离电台底面（0.30）2mm；两条竖撑 40×240×6 贴在电台背面与侧板内表面之间的 10mm 夹缝里（z 0.892~0.898，离电台背面 2mm、离侧板 2mm）。",
  });

  add({
    id: "tiger.interior.radio_knob",
    name_cn: "电台旋钮",
    name_en: "radio knob",
    assembly: "interior",
    build_layer: 3,
    build_order: 420,
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
    build_order: 421,
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
    build_order: 422,
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
    build_order: 423,
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
    build_order: 424,
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
    instances: 2,
    indexed: true,
    instance_layout: "interior.extinguisherPair",
    mate: { type: "absolute" },
    source:
      "手提灭火器 2 只（瓶体 ф110 × 280，阀头 50×30）：左右侧板内表面（z ±0.90）前 40mm 各一具，瓶底 y -0.17；两具各用上下两道卡箍抱住。左侧靠近装填手席、右侧靠近机电员席，两舷乘员都能一步拿到。",
  });

  add({
    id: "tiger.interior.extinguisher_clamp",
    name_cn: "灭火器卡箍",
    name_en: "extinguisher clamp",
    assembly: "interior",
    build_layer: 3,
    build_order: 425,
    geometry: {
      type: "merge",
      parts: [
        { type: "tube", rOuter: 0.062, rInner: 0.057, h: 0.03, at: [0, 0, 0], segments: 24 },
        { type: "box", w: 0.03, h: 0.03, d: 0.01, at: [0, 0, -0.063], bevel: 0.003 },
      ],
    },
    material: "steel",
    instances: 4,
    indexed: true,
    instance_layout: INTERIOR_LAYOUTS.clamp,
    mate: { type: "absolute" },
    source:
      "卡箍 4 只（内径 114，环抱 ф110 瓶体，径向 2mm）：两具灭火器各上下两道（y ∓0.09），右侧两只绕 Y 转 180° 让耳板朝壁；耳板外侧 -0.898，离侧板内表面（z ±0.90）2mm、离瓶体表面 3mm。",
  });

  add({
    id: "tiger.interior.lamp",
    name_cn: "舱内照明灯",
    name_en: "interior lamp",
    assembly: "interior",
    build_layer: 3,
    build_order: 426,
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
    build_order: 427,
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
    id: "tiger.interior.fuse_box",
    name_cn: "保险丝盒",
    name_en: "Sicherungskasten",
    assembly: "interior",
    build_layer: 3,
    build_order: 441,
    geometry: {
      type: "merge",
      parts: [
        { type: "box", w: 0.1, h: 0.16, d: 0.18, at: [0, 0, 0], bevel: 0.004 },
        { type: "box", w: 0.012, h: 0.13, d: 0.15, at: [-0.058, 0, 0], bevel: 0.002 },
        { type: "cylinder", r: 0.012, h: 0.03, at: [0.06, 0.03, 0.055], segments: 12, bevel: 0.002 },
        { type: "cylinder", r: 0.012, h: 0.03, at: [0.06, 0.03, -0.055], segments: 12, bevel: 0.002 },
        { type: "box", w: 0.008, h: 0.12, d: 0.12, at: [-0.095, 0, 0], bevel: 0.001 },
        { type: "box", w: 0.03, h: 0.03, d: 0.04, at: [-0.075, 0.05, 0], bevel: 0.001 },
      ],
    },
    material: "bakelite",
    mate: { type: "absolute", position: [-4.30, 0.25, 0.45] },
    source:
      "保险丝盒（Sicherungskasten）：100×160×180 胶木盒 + 前盖 + 2 个接线柱 + 下支架，装在首上装甲内表面驾驶员右侧（x -4.32 / y 0.25 / z +0.45），背面挂架离装甲板 1mm，避开转向柱与航向机枪。",
  });
  add({
    id: "tiger.interior.ammo_case",
    name_cn: "8,8 cm 药筒",
    name_en: "8,8 cm Treibladungshülse",
    assembly: "interior",
    build_layer: 3,
    build_order: 432,
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
      "8,8 cm 药筒（8,8 cm KwK 36 定装弹）：⌀105×570、底缘 ⌀116×20，全高 590，底面 y 0.153（赞助板地板面 0.15，留 3mm）。92 发基数：左右赞助板各 46 发、内外两排（z ±1.18 / ±1.42）各 23 发、纵向间距 145（x -4.05 ~ -0.86），后排离防火隔板 27mm。药筒与弹丸分为两个零件，便于殉爆连锁时逐发抛出。",
  });

  add({
    id: "tiger.interior.ammo_projectile_ap",
    name_cn: "8,8 cm 穿甲弹丸（APCBC）",
    name_en: "8,8 cm Pzgr. 39",
    assembly: "interior",
    build_layer: 3,
    build_order: 433,
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
    name_cn: "8,8 cm 榴弹丸（HE）",
    name_en: "8,8 cm Sprgr. 43",
    assembly: "interior",
    build_layer: 3,
    build_order: 434,
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
    build_order: 435,
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
    build_order: 436,
    geometry: { type: "tube", rOuter: 0.8, rInner: 0.34, h: 0.02, segments: 40 },
    node: "Turret",
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
    build_order: 437,
    geometry: {
      type: "kit",
      kit: "basketRail",
      params: { rOuter: 0.82, rInner: 0.79, h: 0.03, gapDeg: 90, gapCenterDeg: 180 },
    },
    node: "Turret",
    material: "steel",
    mate: { type: "absolute", position: [-1.65, 0, 0] },
    source:
      "吊篮护栏（Turmboden Geländer）：扶手带 ⌀1640/⌀1580×30、中心 y 1.32，前方 90° 开口（开口朝炮闩/摇架，避免横穿复进机与摇架侧颊）；4 根立柱 30×160×30 落在吊篮地板面上方 5mm。护栏外缘离炮塔内壁 40mm，不随炮塔旋转卡死。",
  });

  add({
    id: "tiger.interior.traverse_motor",
    name_cn: "炮塔回转电机",
    name_en: "Turmdrehwerk",
    assembly: "interior",
    build_layer: 3,
    build_order: 438,
    geometry: {
      type: "merge",
      parts: [
        { type: "box", w: 0.26, h: 0.22, d: 0.2, at: [0, 0, 0], bevel: 0.008 },
        { type: "cylinder", r: 0.08, h: 0.16, at: [0, 0.19, 0], bevel: 0.004 },
        { type: "cylinder", r: 0.03, h: 0.12, at: [0, 0.33, 0], bevel: 0.003 },
      ],
    },
    node: "Turret",
    material: "steel",
    mate: { type: "absolute", position: [-1.65, 1.3, -0.66] },
    source:
      "炮塔回转电机（Turmdrehwerk）：机体 260×220×200、上方法兰 ⌀160×160、输出轴 ⌀60×120，中心 (x -1.65, z -0.66)，底面 y 1.19（离吊篮地板面 1.16 留 30mm）。旧位置 (x -2.28, z 0) 正在闩室/复进机正下方，补炮闩时让位到吊篮左侧、炮手席外侧：机体 x -1.78~-1.52、z -0.76~-0.56，整体落在吊篮地板（r 0.8）内；离炮手座垫外缘（x -1.77 / z -0.56）10mm、离护栏带内缘 30mm、离炮闩轴线 0.66m。",
  });

  add({
    id: "tiger.interior.roof_fan",
    name_cn: "炮塔排烟风扇",
    name_en: "Turmlüfter",
    assembly: "interior",
    build_layer: 3,
    build_order: 439,
    geometry: {
      type: "merge",
      parts: [
        { type: "tube", rOuter: 0.14, rInner: 0.126, h: 0.06, at: [0, 0, 0], segments: 24 },
        { type: "cylinder", r: 0.125, h: 0.012, at: [0, -0.005, 0], bevel: 0.002 },
        { type: "cylinder", r: 0.03, h: 0.04, at: [0, 0.005, 0], bevel: 0.004 },
      ],
    },
    node: "Turret",
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
    build_order: 440,
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
    instance_nodes: ["Turret", "Turret", "Turret"],
    instance_layout: "interior.turretSeat",
    mate: { type: "absolute" },
    source:
      "炮塔座席（Turmsitz）：立柱 ⌀110×300、座垫 360×60×360、靠背 60×340×360。三席：车长 (-1.32, -0.44) 在指挥塔正下方、炮手 (-1.95, -0.38) 朝前、装填手 (-1.95, +0.43) 朝后（转 180°）。座面 y 1.485、靠背顶 1.833，离顶盖内表面 1.811 留 22mm；立柱底离吊篮地板面 3mm。炮手/装填手席各外移 80mm——炮身 450mm 后坐终点（闩体后缘 x -1.77）要穿过两席之间，座背内缘留 ≥40mm 净空。",
  });

  // ===================== L3 第三批 A：线束 / 管路（先布线，后装设备） =====================
  // 走线口径：主束沿两侧板内表面高走（y 0.88 / z ±0.86，离壁 33mm），在前壁上方横穿连成
  // 一路（绕驾驶舱三面一周），后隔板另走一趟 U 形；束子 3 股**竖向叠放**（spread = Y），
  // 所以贴壁不鼓包、卡箍口只要 25mm 宽。炮塔内束绕吊篮外缘 r 0.755，遇到回转电机（r
  // 0.56~0.77 / y 1.19 起）向内凹到 r 0.50 让位。
  const bundle = (
    points: readonly (readonly [number, number, number])[],
    extra?: Record<string, number | number[]>,
  ) => ({
    type: "kit" as const,
    kit: "cableRun",
    params: { points: points.map((p) => [...p]), strands: 3, r: 0.0125, pitch: 0.028, spread: [0, 1, 0], ...extra },
  });

  add({
    id: "tiger.interior.harness_trunk",
    name_cn: "驾驶舱主电缆束",
    name_en: "Kabelstrang (Haupt)",
    assembly: "interior",
    build_layer: 3,
    build_order: 464,
    geometry: bundle([
      [-2.92, 0.915, -0.812],
      [-3.4, 0.88, -0.86],
      [-4.05, 0.88, -0.86],
      [-4.24, 0.8, -0.855],
      [-4.28, 0.72, -0.72],
      [-4.28, 0.72, -0.3],
      [-4.28, 0.72, 0.15],
      [-4.28, 0.72, 0.6],
      [-4.24, 0.8, 0.855],
      [-4.05, 0.88, 0.86],
      [-3.4, 0.88, 0.86],
      [-2.92, 0.915, 0.812],
    ]),
    material: "cable_rubber",
    mate: { type: "absolute" },
    source:
      "驾驶舱主电缆束：3 股 ⌀25 竖向叠成一束（束宽 25mm、高 84mm），从左侧接线盒上过线套前 8mm（x -2.92 / y 0.915 / z -0.812）起，沿左壁高位（y 0.88、离侧板内表面 33mm）向前，在仪表板上方 340mm 处横穿前壁（x -4.28，离继电器盒 42mm、离断路器 73mm），再沿右壁回到右侧接线盒。避开：潜望镜体（横向 120mm）、座椅靠背顶（竖向 310mm）、照明灯（62mm）。",
  });

  add({
    id: "tiger.interior.harness_rear",
    name_cn: "后隔板环形电缆束",
    name_en: "Kabelstrang Schottwand",
    assembly: "interior",
    build_layer: 3,
    build_order: 465,
    geometry: bundle([
      [-2.92, 0.805, -0.812],
      [-2.6, 0.86, -0.86],
      [-1.8, 0.86, -0.86],
      [-1.05, 0.86, -0.86],
      [-0.86, 0.86, -0.66],
      [-0.86, 0.86, 0],
      [-0.86, 0.86, 0.66],
      [-1.05, 0.86, 0.86],
      [-2.6, 0.86, 0.86],
      [-2.92, 0.805, 0.812],
    ]),
    material: "cable_rubber",
    mate: { type: "absolute" },
    source:
      "后隔板环形束：沿战斗室后壁（隔板面 x -0.78）前 66mm 绕 U 形，从同一只盒子的下过线套进出，把两侧主束在车尾侧连通，中途经过后隔板接线盒（盒面 x -0.83，束子外缘 -0.8475，净空 17mm）。与主束在两只壁盒处「各自 terminating 于盒面留 2mm」，不互相穿插。",
  });

  add({
    id: "tiger.interior.harness_radio",
    name_cn: "电台分支电缆",
    name_en: "Kabelabzweig Funkgerät",
    assembly: "interior",
    build_layer: 3,
    build_order: 466,
    geometry: bundle(
      [
        [-3.7, 0.845, 0.828],
        [-3.66, 0.72, 0.8],
        [-3.62, 0.64, 0.76],
      ],
      { strands: 2, r: 0.01, pitch: 0.023 },
    ),
    material: "cable_rubber",
    mate: { type: "absolute" },
    source:
      "电台分支（2 股 ⌀20）：从右壁主束 x -3.70 处内侧引下（起点 z 0.828，离主束外皮 20mm，不与主束穿插），落到 Fu 5 电台后上方（末端 x -3.62 / y 0.64 / z 0.76）——电台顶面 0.56（竖向净空 80mm）、电台后面 x -3.65（横向 30mm）。",
  });

  add({
    id: "tiger.interior.harness_turret",
    name_cn: "炮塔吊篮下电缆束",
    name_en: "Turmkabelstrang",
    assembly: "interior",
    build_layer: 3,
    build_order: 467,
    geometry: bundle(
      Array.from({ length: 16 }, (_, i) => {
        const deg = 200 + i * 12;
        // 遇到炮塔回转电机（r 0.56~0.77）向内凹到 r 0.50 让位
        const dip = deg > 246 && deg < 296 ? 0.5 : 0.755;
        const a = THREE.MathUtils.degToRad(deg);
        return [c.IN_RING_X! + dip * Math.cos(a), 1.205, dip * Math.sin(a)] as [number, number, number];
      }),
      { r: 0.011, pitch: 0.025 },
    ),
    node: "Turret",
    material: "cable_rubber",
    mate: { type: "absolute" },
    source:
      "炮塔内电缆束（随炮塔转）：3 股 ⌀22，绕座圈中心 r 0.755、y 1.205 从 200° 走到 380°（正前方 180° 是炮闩与摇架，不走）。在 252°~288° 之间向内凹到 r 0.50 绕开炮塔回转电机（机体 x -1.78~-1.52 / z -0.76~-0.56 / y 1.19 起）；其余段卡在吊篮地板（面 y 1.16）之上、护栏带（r 0.79~0.82 / y 1.305~1.335）之下、座垫立柱（r ≤ 0.605）之外。",
  });

  add({
    id: "tiger.interior.harness_sight",
    name_cn: "瞄具与炮闩电缆",
    name_en: "Kabel Zielgerät/Verschluss",
    assembly: "interior",
    build_layer: 3,
    build_order: 468,
    geometry: bundle(
      [
        [c.IN_RING_X! + 0.66 * Math.cos(THREE.MathUtils.degToRad(212)), 1.21, 0.66 * Math.sin(THREE.MathUtils.degToRad(212))],
        [-2.32, 1.34, -0.44],
        [-2.32, 1.46, -0.39],
        [-2.3, 1.53, -0.36],
      ],
      { strands: 2, r: 0.01, pitch: 0.023 },
    ),
    node: "Turret",
    material: "cable_rubber",
    mate: { type: "absolute" },
    source:
      "瞄具/炮闩电缆（2 股 ⌀20）：从塔内束 212° 处**内侧**（r 0.66，离束子外皮 75mm，绕开样条弯角的过冲）引出抬到炮长瞄具目镜端（x -2.30 / y 1.53 / z -0.36）。离摇架侧颊（z -0.235）105mm、离闩体侧面 130mm。",
  });

  add({
    id: "tiger.interior.vent_duct",
    name_cn: "炮塔通风波纹软管",
    name_en: "Belüftungsschlauch",
    assembly: "interior",
    build_layer: 3,
    build_order: 469,
    geometry: {
      type: "kit",
      kit: "cableRun",
      params: {
        points: [
          [-0.98, 1.68, -0.1],
          [-0.95, 1.56, -0.15],
          [-0.98, 1.46, -0.2],
          [-1.06, 1.36, -0.26],
        ].map((p) => [...p]),
        strands: 1,
        r: 0.046,
        corrugate: 0.026,
      },
    },
    node: "Turret",
    material: "cable_rubber",
    mate: { type: "absolute" },
    source:
      "炮塔通风软管 ⌀92：从排烟风扇（底面 1.75）下方 11mm 起，沿塔体右后壁下到吊篮上方（末端 y 1.36）。整条走线到座圈中心的水平距离 ≤ 0.72，加上 ⌀118 波环仍在护栏带（r 0.79~0.82）以内 70mm。波纹环每 26mm 一道——就是内部照片里那根黑色可弯软管。",
  });

  add({
    id: "tiger.interior.brake_pipe",
    name_cn: "制动液压管",
    name_en: "Bremsleitung",
    assembly: "interior",
    build_layer: 3,
    build_order: 470,
    geometry: {
      type: "kit",
      kit: "cableRun",
      params: {
        points: [
          [-4.32, -0.28, 0],
          [-4.05, -0.28, 0],
          [-3.8, -0.28, 0],
          [-3.55, -0.27, 0.03],
        ].map((p) => [...p]),
        strands: 2,
        r: 0.0075,
        pitch: 0.019,
        spread: [0, 0, 1],
      },
    },
    material: "brass_dull",
    instances: 2,
    indexed: true,
    instance_layout: "interior.brakePipe",
    mate: { type: "absolute" },
    source:
      "制动/转向液压钢管 2×2 路（⌀15 双管并排）：贴地板上方 17.5mm（管心 y -0.28、管底 -0.2875）从转向机前盖下方拉到变速箱壳体后方；左右两组走在 z ±0.72——转向机壳体宽到 z ±0.66（横向净空 45mm）、座椅骨架（x -3.49 起）之后 60mm 收尾、离脚垫外缘 12mm。铜色，与黑色电缆一眼分得开。",
  });

  add({
    id: "tiger.interior.cable_clamp",
    name_cn: "线束卡箍",
    name_en: "Kabelschelle",
    assembly: "interior",
    build_layer: 3,
    build_order: 471,
    geometry: {
      type: "merge",
      parts: [
        { type: "box", w: 0.036, h: 0.1, d: 0.006, at: [0, 0, 0.003], bevel: 0.0015 },
        { type: "box", w: 0.024, h: 0.006, d: 0.036, at: [0, -0.047, 0.024], bevel: 0.0015 },
        { type: "box", w: 0.024, h: 0.006, d: 0.036, at: [0, 0.047, 0.024], bevel: 0.0015 },
        { type: "box", w: 0.024, h: 0.1, d: 0.006, at: [0, 0, 0.057], bevel: 0.0015 },
        { type: "cylinder", r: 0.004, h: 0.012, at: [0.014, 0.03, 0.009], bevel: 0.001 },
      ],
    },
    material: "steel_worn",
    instances: 3,
    indexed: true,
    instance_layout: INTERIOR_LAYOUTS.cableClamp,
    mate: { type: "absolute" },
    source:
      "线束卡箍（左壁 3 只，280mm 一只，只装在直线段上）：底板 36×100×6 贴侧板内表面（z -0.898，离壁 2mm）+ 上下两颊 + 压带（z 0.054~0.060，离束子外皮 6mm）；束子竖叠 84mm 高，正好卡在两颊之间。螺栓 ⌀8 打在底板上方。",
  });

  add({
    id: "tiger.interior.cable_clamp_right",
    name_cn: "线束卡箍（右）",
    name_en: "Kabelschelle rechts",
    assembly: "interior",
    build_layer: 3,
    build_order: 472,
    geometry: {
      type: "merge",
      parts: [
        { type: "box", w: 0.036, h: 0.1, d: 0.006, at: [0, 0, 0.003], bevel: 0.0015 },
        { type: "box", w: 0.024, h: 0.006, d: 0.036, at: [0, -0.047, 0.024], bevel: 0.0015 },
        { type: "box", w: 0.024, h: 0.006, d: 0.036, at: [0, 0.047, 0.024], bevel: 0.0015 },
        { type: "box", w: 0.024, h: 0.1, d: 0.006, at: [0, 0, 0.057], bevel: 0.0015 },
        { type: "cylinder", r: 0.004, h: 0.012, at: [0.014, 0.03, 0.009], bevel: 0.001 },
      ],
    },
    material: "steel_worn",
    instances: 3,
    indexed: true,
    instance_layout: "interior.cableClampR",
    mate: { type: "absolute" },
    source:
      "线束卡箍（右壁 3 只）：与左壁同一几何，绕 Y 转 180° 让底板贴 z +0.898、压带朝车内。",
  });

  add({
    id: "tiger.interior.junction_box",
    name_cn: "电缆接线盒",
    name_en: "Kabelverteilerdose",
    assembly: "interior",
    build_layer: 3,
    build_order: 473,
    geometry: {
      type: "merge",
      parts: [
        { type: "box", w: 0.12, h: 0.1, d: 0.04, at: [0, 0, 0], bevel: 0.004 },
        { type: "box", w: 0.128, h: 0.108, d: 0.008, at: [0, 0, -0.024], bevel: 0.002 },
        { type: "box", w: 0.03, h: 0.012, d: 0.012, at: [0, -0.056, 0.026], bevel: 0.002 },
        { type: "box", w: 0.026, h: 0.026, d: 0.012, at: [0, 0.04, 0.026], bevel: 0.003 },
        { type: "box", w: 0.026, h: 0.026, d: 0.012, at: [0, -0.04, 0.026], bevel: 0.003 },
      ],
    },
    material: "bakelite",
    instances: 3,
    indexed: true,
    instance_layout: INTERIOR_LAYOUTS.junctionBox,
    mate: { type: "absolute" },
    source:
      "电缆接线盒 ×3（胶木 120×100×40 + 安装背板 128×108×8 + 底部出线舌 + 盒面上下两只橡胶过线套 26×26×12）：左右壁各一只（y 0.86，主束进上套、环形束进下套）、后隔板左侧一只（x -0.81，背板贴隔板面 -0.782）。三只分别绕 Y 转 0°/180°/-90°，保证背板永远贴着墙。",
  });

  add({
    id: "tiger.interior.relay_box",
    name_cn: "继电器盒",
    name_en: "Relaiskasten",
    assembly: "interior",
    build_layer: 3,
    build_order: 474,
    geometry: {
      type: "merge",
      parts: [
        { type: "box", w: 0.05, h: 0.11, d: 0.09, at: [0, 0, 0], bevel: 0.004 },
        { type: "box", w: 0.012, h: 0.02, d: 0.07, at: [-0.026, 0.03, 0], bevel: 0.002 },
        { type: "box", w: 0.056, h: 0.008, d: 0.096, at: [0, 0.059, 0], bevel: 0.002 },
      ],
    },
    material: "bakelite",
    instances: 3,
    indexed: true,
    instance_layout: INTERIOR_LAYOUTS.relayBox,
    mate: { type: "absolute" },
    source:
      "继电器盒 3 只并排（50×110×90 胶木盒 + 侧面标牌条 + 压盖）：装在前装甲板内侧、仪表板（顶 0.38）上方的空档，中心 x -4.36（离板面 35mm）、z -0.78/-0.66/-0.54；顶面 0.615 离主束（y 0.72 下缘 0.6725）57mm。",
  });

  add({
    id: "tiger.interior.circuit_breaker",
    name_cn: "断路器",
    name_en: "Sicherungsschalter",
    assembly: "interior",
    build_layer: 3,
    build_order: 475,
    geometry: {
      type: "merge",
      parts: [
        { type: "box", w: 0.03, h: 0.06, d: 0.026, at: [0, 0, 0], bevel: 0.003 },
        { type: "box", w: 0.012, h: 0.02, d: 0.01, at: [-0.018, 0.012, 0], bevel: 0.0015 },
      ],
    },
    material: "bakelite",
    instances: 6,
    indexed: true,
    instance_layout: INTERIOR_LAYOUTS.breaker,
    mate: { type: "absolute" },
    source:
      "断路器 6 只一排（30×60×26 黑胶木 + 侧面拨钮）：装在保险丝盒（顶 0.332）上方 58mm、前装甲板内侧，z 0.33 起每 42mm 一只——与保险丝盒、继电器盒一起构成「一排电门」的观感。",
  });

  add({
    id: "tiger.interior.pedal_crossshaft",
    name_cn: "踏板横轴",
    name_en: "Pedalwellenlager",
    assembly: "interior",
    build_layer: 3,
    build_order: 476,
    geometry: {
      type: "merge",
      parts: [
        { type: "cylinder", r: 0.011, h: 0.62, at: [0, 0, 0], segments: 16, bevel: 0.002 },
        { type: "box", w: 0.024, h: 0.03, d: 0.024, at: [0, -0.3, 0], bevel: 0.002 },
        { type: "box", w: 0.024, h: 0.03, d: 0.024, at: [0, 0.3, 0], bevel: 0.002 },
      ],
    },
    material: "steel_worn",
    mate: { type: "absolute", position: [-4.28, 0.42, -0.42], rotation: [90, 0, 0] },
    source:
      "踏板悬挂横轴 ⌀22×620（两端轴承座 24×30×24）：三只踏板的吊臂都套在这根轴上（轴心 y 0.42、x -4.28），从离合（z -0.66）到油门（z -0.18）贯通；后端离前装甲板内表面 78mm。",
  });

  // ===================== L3 第三批 B：炮塔战斗室（瞄具 / 手轮 / 待发弹 / 塔口） =====================
  add({
    id: "tiger.interior.gunner_sight",
    name_cn: "炮长瞄准镜 TZF 9b",
    name_en: "Turmzielgerät TZF 9b",
    assembly: "interior",
    build_layer: 3,
    build_order: 442,
    geometry: {
      type: "merge",
      parts: [
        { type: "box", w: 0.24, h: 0.075, d: 0.07, at: [0, 0, 0], bevel: 0.005 },
        { type: "box", w: 0.06, h: 0.05, d: 0.055, at: [0.145, -0.008, 0], bevel: 0.003 },
        { type: "box", w: 0.03, h: 0.09, d: 0.075, at: [-0.135, -0.01, 0], bevel: 0.003 },
      ],
    },
    material: "steel_worn",
    node: "Turret",
    mate: { type: "absolute", position: [-2.5, 1.6, -0.325] },
    source:
      "炮长瞄准镜（TZF 9b）镜体 240×75×70 + 物镜端座 + 后支座：装在摇架左侧（镜体 z -0.36~-0.29，离摇架侧颊 -0.264 留 26mm），前端顶到炮塔左壁的瞄具开口（TR_SIGHT x -2.78 / y 1.58 / z -0.24）后方 80mm；顶面 1.6375 离复进机（底 1.592）横向错开 90mm，不与其重叠。",
  });

  add({
    id: "tiger.interior.gunner_sight_tube",
    name_cn: "瞄具目镜筒",
    name_en: "Zielrohr (OK 15)",
    assembly: "interior",
    build_layer: 3,
    build_order: 443,
    geometry: {
      type: "merge",
      parts: [
        { type: "cylinder", r: 0.026, h: 0.1, at: [0, 0, 0], segments: 20, bevel: 0.003 },
        { type: "cylinder", r: 0.031, h: 0.016, at: [0, -0.05, 0], segments: 20, bevel: 0.002 },
        { type: "cylinder", r: 0.022, h: 0.02, at: [0, 0.058, 0], segments: 16, bevel: 0.002 },
      ],
    },
    material: "steel_worn",
    node: "Turret",
    mate: { type: "absolute", position: [-2.25, 1.6, -0.33], rotation: [0, 0, 90] },
    source:
      "瞄具目镜筒 ⌀52×100（绕 Z 转 90° → 轴向沿 X）：接在镜体后端，出射端 x -2.2 正对炮长席（座面 x -1.95）方向，炮长低头即可贴目。离闩体后面（x -2.178）22mm。",
  });

  add({
    id: "tiger.interior.gunner_sight_drum",
    name_cn: "瞄具距离分划鼓",
    name_en: "Entfernungstrommel",
    assembly: "interior",
    build_layer: 3,
    build_order: 444,
    geometry: {
      type: "merge",
      parts: [
        { type: "cylinder", r: 0.045, h: 0.03, at: [0, 0, 0], segments: 24, bevel: 0.003 },
        { type: "cylinder", r: 0.048, h: 0.006, at: [0, 0.018, 0], segments: 24, bevel: 0.0015 },
        { type: "box", w: 0.012, h: 0.014, d: 0.012, at: [0.044, 0, 0], bevel: 0.0015 },
      ],
    },
    material: "aluminium",
    node: "Turret",
    mate: { type: "absolute", position: [-2.52, 1.535, -0.33] },
    source:
      "距离分划鼓 ⌀90×30（银白色，带 0~4000m 刻度环与拨钮）：挂在镜体下方 1.5mm，鼓面 y 1.528~1.562；离摇架侧颊 21mm、离吊篮护栏带 250mm，炮长左手正好够到。",
  });

  add({
    id: "tiger.interior.traverse_handwheel",
    name_cn: "炮塔手轮",
    name_en: "Turmdrehkurbel",
    assembly: "interior",
    build_layer: 3,
    build_order: 445,
    geometry: { type: "kit", kit: "spokedWheel", params: { rimR: 0.09, barR: 0.008, spokes: 6, hubR: 0.02, pin: 0.034 } },
    material: "steel_worn",
    node: "Turret",
    mate: { type: "absolute", position: [-2.36, 1.4, 0.33], rotation: [0, -90, 0] },
    source:
      "炮塔手动摇轮 ⌀180（6 辐条 + 木质握销）：绕 Y 转 -90° 让轮面竖直、轴沿 Z，装在炮手右侧（z 0.32~0.34），离摇架侧颊（z 0.264）56mm、离炮塔内壁（r 0.86）120mm；与回转电机（另一侧 z -0.66）分列炮身两侧。",
  });

  add({
    id: "tiger.interior.ready_rack",
    name_cn: "待发弹架",
    name_en: "Schnellfeuerraum",
    assembly: "interior",
    build_layer: 3,
    build_order: 446,
    geometry: {
      type: "merge",
      parts: [
        { type: "box", w: 0.3, h: 0.012, d: 0.3, at: [0, 0.006, 0], bevel: 0.003 },
        { type: "box", w: 0.02, h: 0.44, d: 0.02, at: [-0.14, 0.23, -0.14], bevel: 0.002 },
        { type: "box", w: 0.02, h: 0.44, d: 0.02, at: [0.14, 0.23, -0.14], bevel: 0.002 },
        { type: "box", w: 0.02, h: 0.44, d: 0.02, at: [-0.14, 0.23, 0.14], bevel: 0.002 },
        { type: "box", w: 0.02, h: 0.44, d: 0.02, at: [0.14, 0.23, 0.14], bevel: 0.002 },
        { type: "box", w: 0.3, h: 0.012, d: 0.02, at: [0, 0.42, -0.14], bevel: 0.002 },
        { type: "box", w: 0.3, h: 0.012, d: 0.02, at: [0, 0.42, 0.14], bevel: 0.002 },
        { type: "box", w: 0.02, h: 0.012, d: 0.3, at: [-0.14, 0.42, 0], bevel: 0.002 },
        { type: "box", w: 0.02, h: 0.012, d: 0.3, at: [0.14, 0.42, 0], bevel: 0.002 },
      ],
    },
    material: "interior_paint",
    mate: { type: "absolute", position: [-1.19, 1.162, 0.29] },
    node: "Turret",
    source:
      "待发弹架（弹笼 300×440×300：底板 + 4 根立柱 + 上沿四道压条）：站在吊篮地板上（底板面 1.162，离地板 2mm），位于装填手一侧（x -1.19 / z +0.29，离座圈中心 r 0.56）——离塔内电缆束（r 0.744）134mm、离护栏带（r 0.79）180mm、离车长席靠背（x -1.19）60mm。",
  });

  add({
    id: "tiger.interior.ready_round_case",
    name_cn: "待发药筒",
    name_en: "Patronenhülse (schußfertig)",
    assembly: "interior",
    build_layer: 3,
    build_order: 447,
    geometry: {
      type: "merge",
      parts: [
        { type: "cylinder", r: 0.051, h: 0.4, at: [0, 0, 0], segments: 20, bevel: 0.003 },
        { type: "cylinder", r: 0.055, h: 0.022, at: [0, -0.19, 0], segments: 20, bevel: 0.002 },
        { type: "tube", rOuter: 0.052, rInner: 0.044, h: 0.05, at: [0, 0.215, 0], segments: 20 },
      ],
    },
    material: "case_brass",
    instances: 4,
    indexed: true,
    instance_nodes: Array.from({ length: 4 }, () => "Turret"),
    instance_layout: "interior.readyCase",
    mate: { type: "absolute" },
    source:
      "待发药筒 ⌀102×400（黄铜，底缘 ⌀110、弹口收口环 ⌀104/⌀88）立放在待发弹架的 4 个格里（x -1.25/-1.13、z 0.22/0.36，筒身 y 1.20~1.60）；弹丸按实车由装填手从两侧弹架取来现装，故这里只放药筒。离弹架立柱最近 27mm。",
  });

  add({
    id: "tiger.interior.cupola_periscope",
    name_cn: "车长塔周向潜望镜",
    name_en: "Rundumblick (Kuppel)",
    assembly: "interior",
    build_layer: 3,
    build_order: 449,
    geometry: {
      type: "merge",
      parts: [
        { type: "box", w: 0.036, h: 0.05, d: 0.03, at: [0, 0, 0], bevel: 0.003 },
        { type: "cylinder", r: 0.011, h: 0.022, at: [0, -0.032, 0], segments: 12, bevel: 0.0015 },
        { type: "box", w: 0.02, h: 0.008, d: 0.034, at: [0, 0.028, 0], bevel: 0.0015 },
      ],
    },
    material: "interior_paint",
    instances: 7,
    indexed: true,
    instance_nodes: Array.from({ length: 7 }, () => "Turret"),
    instance_layout: INTERIOR_LAYOUTS.cupolaPeriscope,
    mate: { type: "absolute" },
    source:
      "车长塔周向潜望镜 7 具（镜箱 36×50×30 + 目镜 ⌀22 + 压条）：绕塔口 r 0.19 均布（-55°~245°，车尾侧留顶盖铰链缺口），目镜朝下对着车长眼睛高度（y 1.89）；筒壁内表面 r 0.225、观察缝盒 r 0.234，各留 21~34mm。",
  });

  add({
    id: "tiger.interior.cupola_grip",
    name_cn: "车长塔顶盖内把手",
    name_en: "Kuppeldeckel-Griff (innen)",
    assembly: "interior",
    build_layer: 3,
    build_order: 450,
    geometry: {
      type: "merge",
      parts: [
        { type: "cylinder", r: 0.009, h: 0.05, at: [0, 0.025, 0], segments: 12, bevel: 0.0015 },
        { type: "cylinder", r: 0.013, h: 0.07, at: [0, 0, 0], segments: 14, bevel: 0.002 },
      ],
    },
    material: "steel_worn",
    node: "Turret",
    mate: { type: "absolute", position: [-1.42, 1.945, -0.42], rotation: [0, 0, 90] },
    source:
      "顶盖内开启把手（握杆 ⌀26×70 + 螺杆 ⌀18×50，绕 Z 转 90° 让杆轴沿 X）：挂在车长塔顶盖（内表面 1.969）下方，塔口前缘一侧（x -1.42），车长从塔口探出前先在车内顶盖；离周向潜望镜最近 86mm。",
  });

  add({
    id: "tiger.interior.turret_bin",
    name_cn: "吊篮储物箱",
    name_en: "Turmgerätkasten",
    assembly: "interior",
    build_layer: 3,
    build_order: 451,
    geometry: {
      type: "merge",
      parts: [
        { type: "box", w: 0.24, h: 0.13, d: 0.18, at: [0, 0.065, 0], bevel: 0.006 },
        { type: "box", w: 0.248, h: 0.014, d: 0.188, at: [0, 0.137, 0], bevel: 0.003 },
        { type: "box", w: 0.03, h: 0.02, d: 0.012, at: [0.135, 0.1, 0], bevel: 0.002 },
      ],
    },
    material: "interior_paint",
    mate: { type: "absolute", position: [-1.717, 1.162, 0.637] },
    node: "Turret",
    source:
      "吊篮储物箱（240×130×180 + 翻盖 + 搭扣）：站在吊篮地板（面 1.16）上、装填手侧后方（r 0.64 / 96°），顶面 1.301 刚好压在护栏带（1.305）之下 4mm。",
  });

  add({
    id: "tiger.interior.gearbox_bin",
    name_cn: "变速箱盖储物箱",
    name_en: "Getriebegerätkasten",
    assembly: "interior",
    build_layer: 3,
    build_order: 477,
    geometry: {
      type: "merge",
      parts: [
        { type: "box", w: 0.24, h: 0.13, d: 0.18, at: [0, 0.065, 0], bevel: 0.006 },
        { type: "box", w: 0.248, h: 0.014, d: 0.188, at: [0, 0.137, 0], bevel: 0.003 },
        { type: "box", w: 0.03, h: 0.02, d: 0.012, at: [0.135, 0.1, 0], bevel: 0.002 },
      ],
    },
    material: "interior_paint",
    mate: { type: "absolute", position: [-3.15, 0.414, 0] },
    source:
      "变速箱检查盖（面 y 0.412）上的工具箱（同款 240×130×180）：驾驶室内传动件顶面就是唯一的置物台，左右离两侧壁 ≥ 500mm、后方离转向单元 30mm；随车工具与油料单据放这里。单独一个零件是因为它属车体、不随炮塔回转。",
  });

  add({
    id: "tiger.interior.spare_drum",
    name_cn: "备用弹鼓",
    name_en: "Reserve-Trommelmagazin",
    assembly: "interior",
    build_layer: 3,
    build_order: 452,
    geometry: {
      type: "merge",
      parts: [
        { type: "cylinder", r: 0.11, h: 0.13, at: [0, 0, 0], segments: 24, bevel: 0.004 },
        { type: "cylinder", r: 0.045, h: 0.016, at: [0, 0.07, 0], segments: 16, bevel: 0.002 },
        { type: "box", w: 0.03, h: 0.018, d: 0.024, at: [0.108, 0.03, 0], bevel: 0.002 },
      ],
    },
    material: "steel_worn",
    mate: { type: "absolute", position: [-1.431, 1.23, 0.601] },
    node: "Turret",
    source:
      "MG 34 弹鼓（⌀220×130 直弹鼓 + 上盖轴头 + 侧卡舌）1 只：吊篮地板上唯一的空位在读弹手席与待发弹架之间（r 0.64 / 70°），鼓底坐地板（1.165）、鼓顶 1.308 离护栏带（1.305）按半径让开 27mm，离弹架 39mm、离储物箱 42mm、离回转电机 590mm。",
  });

  add({
    id: "tiger.interior.first_aid_kit",
    name_cn: "急救箱",
    name_en: "Verbandskasten",
    assembly: "interior",
    build_layer: 3,
    build_order: 453,
    geometry: {
      type: "merge",
      parts: [
        { type: "box", w: 0.05, h: 0.16, d: 0.2, at: [0, 0, 0], bevel: 0.005 },
        { type: "box", w: 0.008, h: 0.03, d: 0.06, at: [-0.028, 0.05, 0], bevel: 0.002 },
      ],
    },
    material: "safety_red",
    mate: { type: "absolute", position: [-0.805, 0.6, 0.5] },
    source:
      "急救箱（红 50×160×200 + 白色十字提手）：挂在战斗室后隔板（面 x -0.779）前 30mm、z +0.34、y 0.52~0.68——正好在后隔板环形束（y 0.86）下方 180mm，谁都能伸手拿到。",
  });

  // ===================== L3 第三批 C：标识 / 工具 / 生活痕迹 =====================
  add({
    id: "tiger.interior.grab_handle",
    name_cn: "扶手",
    name_en: "Haltegriff",
    assembly: "interior",
    build_layer: 3,
    build_order: 454,
    geometry: {
      type: "merge",
      parts: [
        { type: "cylinder", r: 0.011, h: 0.16, at: [-0.032, 0, 0], segments: 14, bevel: 0.002 },
        { type: "box", w: 0.032, h: 0.02, d: 0.02, at: [-0.016, -0.086, 0], bevel: 0.002 },
        { type: "box", w: 0.032, h: 0.02, d: 0.02, at: [-0.016, 0.086, 0], bevel: 0.002 },
      ],
    },
    material: "steel_worn",
    instances: 4,
    indexed: true,
    instance_layout: INTERIOR_LAYOUTS.grabHandle,
    mate: { type: "absolute" },
    source:
      "扶手 ⌀22×160（杆离壁 32mm，两端支座 32×20×20 补到板面）4 只：后隔板两只（y 0.80、z ±0.38，杆沿 Z，正好在面包袋/个人物品上方 75mm、侧壁线束带（y 0.767~0.901）之外）；两侧壁各一只（x -2.62、y 0.62、z ±0.896，杆沿 Y，走线线束带下方 120mm、离顶甲板内表面（1.05）210mm）。朝向全部走 layout 旋转。",
  });

  add({
    id: "tiger.interior.data_plate",
    name_cn: "铭牌",
    name_en: "Typenschild",
    assembly: "interior",
    build_layer: 3,
    build_order: 455,
    geometry: {
      type: "merge",
      parts: [
        { type: "box", w: 0.002, h: 0.04, d: 0.06, at: [0, 0, 0], bevel: 0.0005 },
        { type: "cylinder", r: 0.003, h: 0.004, at: [0, 0.014, -0.024], segments: 8, bevel: 0.0005 },
        { type: "cylinder", r: 0.003, h: 0.004, at: [0, 0.014, 0.024], segments: 8, bevel: 0.0005 },
        { type: "cylinder", r: 0.003, h: 0.004, at: [0, -0.014, -0.024], segments: 8, bevel: 0.0005 },
        { type: "cylinder", r: 0.003, h: 0.004, at: [0, -0.014, 0.024], segments: 8, bevel: 0.0005 },
      ],
    },
    material: "aluminium",
    instances: 6,
    indexed: true,
    instance_layout: INTERIOR_LAYOUTS.dataPlate,
    mate: { type: "absolute" },
    source:
      "铭牌 60×40×2 铝板 + 4 颗铆钉（朝向全部走 layout 旋转）：后隔板 2 块（法线沿 X）、前装甲板 1 块、两侧壁各 1 块（绕 Y 转 90°贴壁）、变速箱检查盖 1 块平铺（绕 Z 转 90°，法线朝上，坐盖面 y 0.412 上 2mm、x -3.05 / z 0.24，离箱体 250mm）。实车的工时/弹药/油料数据牌就钉在这些位置。",
  });

  add({
    id: "tiger.interior.warning_label",
    name_cn: "警示标签",
    name_en: "Warntafel",
    assembly: "interior",
    build_layer: 3,
    build_order: 456,
    geometry: {
      type: "merge",
      parts: [
        { type: "box", w: 0.0015, h: 0.022, d: 0.05, at: [0, 0, 0], bevel: 0.0004 },
        { type: "box", w: 0.0015, h: 0.006, d: 0.05, at: [-0.0016, 0.008, 0], bevel: 0.0004 },
      ],
    },
    material: "safety_red",
    instances: 4,
    indexed: true,
    instance_layout: INTERIOR_LAYOUTS.warningLabel,
    mate: { type: "absolute" },
    source:
      "警示标签 50×22（红底 + 上沿白条）4 张：前装甲板（灭火器/弹药提示）、后隔板（发动机启动前鸣笛）、变速箱盖（预选杆档位）、左壁（燃油）。",
  });

  add({
    id: "tiger.interior.floor_mat",
    name_cn: "驾驶席脚垫",
    name_en: "Gummimatte",
    assembly: "interior",
    build_layer: 3,
    build_order: 457,
    geometry: {
      type: "merge",
      parts: [
        { type: "box", w: 0.44, h: 0.012, d: 0.36, at: [0, 0, 0], bevel: 0.004 },
        { type: "box", w: 0.4, h: 0.004, d: 0.32, at: [0, 0.008, 0], bevel: 0.002 },
      ],
    },
    material: "canvas_black",
    instances: 2,
    indexed: true,
    instance_layout: INTERIOR_LAYOUTS.floorMat,
    mate: { type: "absolute" },
    source:
      "橡胶脚垫 2 块（440×12×360 + 上沿防滑台）：铺在驾驶/机电员席前（x -4.12~-3.68，z ±0.67），面顶 y -0.283；离踏板后缘 30mm、离座椅骨架前缘 60mm、离液压管（y -0.2875）竖向 12.5mm。",
  });

  add({
    id: "tiger.interior.canteen",
    name_cn: "水壶",
    name_en: "Feldflasche",
    assembly: "interior",
    build_layer: 3,
    build_order: 458,
    geometry: {
      type: "merge",
      parts: [
        { type: "cylinder", r: 0.045, h: 0.19, at: [0, 0, 0], segments: 20, bevel: 0.004 },
        { type: "cylinder", r: 0.014, h: 0.03, at: [0, 0.105, 0], segments: 12, bevel: 0.002 },
      ],
    },
    material: "canvas_black",
    instances: 2,
    indexed: true,
    instance_layout: INTERIOR_LAYOUTS.personalKit,
    mate: { type: "absolute" },
    source:
      "帆布套水壶 ⌀90×190 + 铝盖：后隔板挂钩下沿吊挂 2 只（z ±0.68，壶身 y 0.525~0.715），离急救箱（z 0.34）240mm。",
  });

  add({
    id: "tiger.interior.mess_tin",
    name_cn: "饭盒",
    name_en: "Essgeschirr",
    assembly: "interior",
    build_layer: 3,
    build_order: 459,
    geometry: {
      type: "merge",
      parts: [
        { type: "box", w: 0.035, h: 0.09, d: 0.12, at: [0, 0, 0], bevel: 0.006 },
        { type: "box", w: 0.041, h: 0.012, d: 0.126, at: [0, 0.05, 0], bevel: 0.003 },
      ],
    },
    material: "aluminium",
    instances: 2,
    indexed: true,
    instance_layout: "interior.messTin",
    mate: { type: "absolute" },
    source:
      "铝制饭盒 35×90×120 + 盖：挂在后隔板下沿挂钩上（z ±0.62，y 0.415~0.505），在水壶内侧 60mm，不与水壶、急救箱重叠。",
  });

  add({
    id: "tiger.interior.hook",
    name_cn: "挂钩",
    name_en: "Haken",
    assembly: "interior",
    build_layer: 3,
    build_order: 460,
    geometry: {
      type: "merge",
      parts: [
        { type: "box", w: 0.012, h: 0.02, d: 0.02, at: [0, 0, 0], bevel: 0.0015 },
        { type: "box", w: 0.03, h: 0.011, d: 0.011, at: [-0.02, -0.006, 0], bevel: 0.0015 },
        { type: "box", w: 0.011, h: 0.02, d: 0.011, at: [-0.03, 0.006, 0], bevel: 0.0015 },
      ],
    },
    material: "steel_worn",
    instances: 3,
    indexed: true,
    instance_layout: "interior.hookRow",
    mate: { type: "absolute" },
    source:
      "后隔板挂钩 3 只（底座 8×20×20 + ⌀10 钩杆前伸 30mm）：y 0.76，z -0.68 / 0.68（挂水壶）与 -0.3（挂面包袋）；钩杆前端 x -0.79，离后隔板环形束（y 0.86）竖向 100mm。",
  });

  add({
    id: "tiger.interior.bread_bag",
    name_cn: "面包袋",
    name_en: "Brotbeutel",
    assembly: "interior",
    build_layer: 3,
    build_order: 461,
    geometry: {
      type: "merge",
      parts: [
        { type: "box", w: 0.05, h: 0.17, d: 0.15, at: [0, -0.02, 0], bevel: 0.014 },
        { type: "box", w: 0.056, h: 0.03, d: 0.156, at: [0, 0.075, 0], bevel: 0.006 },
      ],
    },
    material: "canvas_black",
    instances: 2,
    indexed: true,
    instance_layout: "interior.breadBag",
    mate: { type: "absolute" },
    source:
      "帆布面包袋（⌀50×170 收口包 + 翻盖）2 只：一只挂后隔板中钩（z -0.3），一只挂在左壁灭火器旁的钉子上（x -2.74 / z -0.62）——车内「有人住」的痕迹。",
  });

  add({
    id: "tiger.interior.tool_rack",
    name_cn: "工具架",
    name_en: "Werkzeugbrett",
    assembly: "interior",
    build_layer: 3,
    build_order: 462,
    geometry: {
      type: "merge",
      parts: [
        { type: "box", w: 0.012, h: 0.06, d: 0.62, at: [0, 0, 0], bevel: 0.003 },
        { type: "box", w: 0.016, h: 0.012, d: 0.62, at: [-0.01, -0.03, 0], bevel: 0.002 },
      ],
    },
    material: "wood",
    mate: { type: "absolute", position: [-0.792, 0.33, 0.06] },
    source:
      "工具挂板（12×60×620 木托条 + 下沿挡条）：钉在战斗室后隔板（面 x -0.779）前，z -0.25~0.37；扳手/螺丝刀插在其上的 5 个卡槽里。",
  });

  add({
    id: "tiger.interior.hand_tool",
    name_cn: "随机工具",
    name_en: "Bordsatz",
    assembly: "interior",
    build_layer: 3,
    build_order: 463,
    geometry: {
      type: "merge",
      parts: [
        { type: "box", w: 0.016, h: 0.02, d: 0.2, at: [0, 0, 0], bevel: 0.003 },
        { type: "cylinder", r: 0.014, h: 0.024, at: [0, 0.012, -0.108], segments: 12, bevel: 0.002 },
        { type: "box", w: 0.022, h: 0.022, d: 0.03, at: [0, 0.012, 0.112], bevel: 0.003 },
      ],
    },
    material: "steel",
    instances: 5,
    indexed: true,
    instance_layout: "interior.toolRowRot",
    mate: { type: "absolute" },
    source:
      "随机工具 5 件（扳手/梅花扳手/螺丝刀等，长 240，朝向走 layout：绕 X 转 90° 让长度沿 Z 横插）：插在工具架的 5 个卡槽里（y 0.3，z -0.24~-0.04 与 0.16~0.26），杆面离挡条前缘 6mm、离后隔板 26mm。",
  });

  // ===================== 第四批：吊篮支柱 / 同轴机枪 / 油压管路 =====================
  add({
    id: "tiger.interior.basket_strut",
    name_cn: "吊篮支柱",
    name_en: "Turmbodenstrebe",
    assembly: "interior",
    build_layer: 3,
    build_order: 478,
    geometry: {
      type: "merge",
      parts: [
        { type: "cylinder", r: 0.02, h: 0.44, at: [0, 0.24, 0], segments: 14, bevel: 0.002 },
        { type: "box", w: 0.07, h: 0.02, d: 0.07, at: [0, 0.01, 0], bevel: 0.003 },
        { type: "box", w: 0.06, h: 0.02, d: 0.06, at: [0, 0.45, 0], bevel: 0.003 },
      ],
    },
    material: "interior_paint",
    instances: 4,
    indexed: true,
    instance_nodes: Array.from({ length: 4 }, () => "Turret"),
    instance_layout: "interior.basketStrut",
    mate: { type: "absolute" },
    source:
      "吊篮支柱 ⌀40 × 440，4 根绕座圈 r 0.80 均布（30°/100°/225°/300°），从护栏带上沿（1.335）上方 5mm 顶到顶甲内表面（1.811）下 6mm；顶板 60×20×60 托住顶甲、底板 70×20×70 坐在护栏上。前方 135°~225° 的复进机开口不设柱；避开车长塔周向潜望镜、瞄具线管与右后排风管。",
  });

  add({
    id: "tiger.interior.coax_mg",
    name_cn: "同轴机枪机匣",
    name_en: "MG 34 Gehäuse (koaxial)",
    assembly: "interior",
    build_layer: 3,
    build_order: 479,
    geometry: {
      type: "merge",
      parts: [
        // 机匣 300×100×90：位于炮架后方的炮长/装填手之间，与 L4 球座同一枪线（z +0.24）
        { type: "box", w: 0.3, h: 0.1, d: 0.09, at: [0, 0, 0], bevel: 0.005 },
        { type: "box", w: 0.22, h: 0.02, d: 0.07, at: [0, 0.058, 0], bevel: 0.004 },
        // 供弹口（朝炮架一侧，弹链从帆布袋横向送入）
        { type: "box", w: 0.1, h: 0.05, d: 0.03, at: [0.01, 0.02, -0.055], bevel: 0.003 },
        // 握把 + 扳机
        { type: "box", w: 0.04, h: 0.09, d: 0.03, at: [0.19, -0.03, 0], bevel: 0.003 },
        { type: "box", w: 0.03, h: 0.012, d: 0.022, at: [0.16, 0.02, 0], bevel: 0.002 },
        // 枪架摇臂：从机匣前脸接到炮架后缘（x -2.15）
        { type: "box", w: 0.09, h: 0.04, d: 0.03, at: [-0.195, -0.005, 0.0], bevel: 0.003 },
        // 照门
        { type: "box", w: 0.016, h: 0.03, d: 0.01, at: [0.13, 0.04, 0], bevel: 0.002 },
      ],
    },
    material: "steel_worn",
    // 挂在火炮摇架上（俯仰时随机炮一起动）：mate 是 GunCradle 节点局部系
    // （摇架转轴 x -2.4 / y 1.45 / z 0），世界坐标 -1.91 / 1.36 / 0.24
    mate: { type: "absolute", position: [0.49, -0.15, 0.24] },
    node: "GunCradle",
    source:
      "同轴 MG34 机匣（300×100×90 + 供弹口 + 握把 + 枪架）：紧贴在炮架后缘（机匣前脸 -2.06，离炮架 40mm），与 L4 球座同一枪线 z +0.24、低 30mm——枪管/球座在防盾外，机匣在防盾内，两者之间被炮架与防盾挡住，看不到断口。供弹口朝炮架一侧（弹链袋挂在装填手侧），机匣顶 1.37 离装填手坐垫 83mm（俯仰 ±3.4° 时抬 30mm 仍不碰）。",
  });

  add({
    id: "tiger.interior.oil_pressure_line",
    name_cn: "机油压力管",
    name_en: "Öldruckleitung",
    assembly: "interior",
    build_layer: 3,
    build_order: 481,
    geometry: {
      type: "kit",
      kit: "cableRun",
      params: {
        points: [
          [-0.88, 0.78, -0.62],
          [-1.0, 0.72, -0.66],
          [-1.6, 0.66, -0.72],
          [-2.4, 0.64, -0.74],
          [-3.2, 0.62, -0.72],
          [-3.9, 0.58, -0.62],
          [-4.22, 0.52, -0.45],
          [-4.31, 0.46, -0.3],
        ],
        strands: 1,
        r: 0.006,
        segments: 96,
      },
    },
    material: "cable_rubber",
    mate: { type: "absolute" },
    source:
      "机油压力管 ⌀12：从后隔板接线盒底部左角（盒底 0.79，起点离盒 15mm）沿左侧板内表面下沿一路向前，过座椅靠背顶（0.57）上方 50mm、方向盘轮缘（0.526）上方 48mm，在仪表板左上角接管；全程离壁 160~180mm，避开采暖/线束带（y 0.767 以上）。",
  });

  // ---- 装填链演示件（fx：构建时隐藏，不参与穿模/支撑检测，由 motion.ts 摆位）----
  add({
    id: "tiger.interior.loading_round_case",
    name_cn: "装填药筒（演示）",
    name_en: "Treibladungshülse (Ladevorgang)",
    assembly: "interior",
    build_layer: 3,
    build_order: 482,
    geometry: {
      type: "merge",
      parts: [
        { type: "cylinder", r: 0.051, h: 0.4, at: [0, 0, 0], segments: 20, bevel: 0.003 },
        { type: "cylinder", r: 0.055, h: 0.022, at: [0, -0.19, 0], segments: 20, bevel: 0.002 },
        { type: "tube", rOuter: 0.052, rInner: 0.044, h: 0.05, at: [0, 0.215, 0], segments: 20 },
      ],
    },
    material: "case_brass",
    mate: { type: "absolute", position: [-1.15, 1.7, 0.3] },
    node: "Turret",
    tags: ["fx"],
    source:
      "装填演示药筒（与待发药筒同口径 ⌀102×400，筒口收口环 ⌀104/⌀88）：局部 +Y = 弹头方向，动画里整支横转 90° 送进炮膛；它是演示件（tags fx），构建时隐藏、不参与穿模/支撑检测。",
  });

  add({
    id: "tiger.interior.loading_round_shell",
    name_cn: "装填弹丸（演示）",
    name_en: "Panzergranate (Ladevorgang)",
    assembly: "interior",
    build_layer: 3,
    build_order: 483,
    geometry: {
      type: "merge",
      parts: [
        { type: "cylinder", r: 0.044, h: 0.19, at: [0, 0.385, 0], segments: 20, bevel: 0.002 },
        { type: "cylinder", r: 0.044, h: 0.08, rTop: 0.02, at: [0, 0.52, 0], segments: 20, bevel: 0.002 },
        { type: "cylinder", r: 0.0455, h: 0.02, at: [0, 0.3, 0], segments: 20, bevel: 0.001 },
      ],
    },
    material: "steel_worn",
    mate: { type: "absolute", position: [-1.15, 1.7, 0.3] },
    node: "Turret",
    tags: ["fx"],
    source:
      "装填演示弹丸（Pzgr. 39 ⌀88×190 + 风帽锥 80 + 弹带）：与药筒同一演示坐标，动画中与药筒同步（同一条矩阵），弹底坐在筒口 y 0.29。",
  });

  add({
    id: "tiger.interior.ejected_case",
    name_cn: "抛出的空药筒",
    name_en: "Auswurfhülse",
    assembly: "interior",
    build_layer: 3,
    build_order: 484,
    geometry: {
      type: "merge",
      parts: [
        { type: "cylinder", r: 0.051, h: 0.4, at: [0, 0, 0], segments: 20, bevel: 0.003 },
        { type: "cylinder", r: 0.055, h: 0.022, at: [0, -0.19, 0], segments: 20, bevel: 0.002 },
      ],
    },
    material: "case_brass",
    mate: { type: "absolute", position: [-2.25, 1.42, 0] },
    node: "Turret",
    tags: ["fx"],
    source:
      "抛壳演示件：击发后闩体下开，抽筒钩把空筒从膛底拉到 x -2.25 后自由落体，翻滚落到吊篮地板（面 1.16）上停住；演示件（tags fx），构建时隐藏。",
  });

  return parts;
}

/**
 * 内饰节点：5 只仪表指针各一个旋转节点（绕车体 X 轴摆动 = 在表盘平面内扫过）。
 * 指针零件用 instance_nodes 骑在节点上，节点由 motion.ts 的 animateTigerGauges 驱动。
 */
function buildInteriorNodes(): NodeDef[] {
  return Array.from({ length: 5 }, (_, i) => ({
    name: gaugeNodeName(i),
    parent: "root",
    pivot: ["IN_GAUGE_X", "IN_GAUGE_Y", `IN_GAUGE_Z0+${i}*IN_GAUGE_PITCH`] as [
      string,
      string,
      string,
    ],
    motion: "rotate" as const,
    axis: "x" as const,
    note: `第 ${i + 1} 只仪表指针（车速/转速/油温/水温/油量）`,
  }));
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
    nodes: buildInteriorNodes(),
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
      cable_rubber: {
        base: "#1c1e21",
        metalness: 0.06,
        roughness: 0.78,
        preset: "rubber",
        envMapIntensity: 0.5,
      },
      bakelite: {
        base: "#2f2621",
        metalness: 0.12,
        roughness: 0.52,
        preset: "none",
        envMapIntensity: 0.7,
      },
      safety_red: {
        base: "#9e2f24",
        metalness: 0.15,
        roughness: 0.55,
        preset: "primer",
        envMapIntensity: 0.8,
      },
    },
    parts: buildInteriorParts(),
  };
}
