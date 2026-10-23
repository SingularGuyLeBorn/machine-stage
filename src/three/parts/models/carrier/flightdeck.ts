import * as THREE from "three";
import { CV } from "./constants";
import { deckEdgeAt, hullSurfaceHalfAt } from "./kits";
import { A, B, C, M, S, T, pad, type CarrierCtx } from "./common";

// ============================================================================
// L3 飞行甲板：装甲甲板 + 防滑层 + 3 条电磁弹射器（定子/线圈/冷却/滑梭/
// 挡焰板/储能）+ 4 道拦阻索（左右半索/滑轮/弹簧）+ 2 部舷侧升降机 + 甲板标记。
// ============================================================================

const ASSEMBLY = "flightdeck";
export const SHUTTLE_NODE = "CV_Shuttle";
export const JBD_NODES = ["CV_JBD_1", "CV_JBD_2", "CV_JBD_3"] as const;
export const ELEVATOR_NODES = ["CV_Elevator_1", "CV_Elevator_2"] as const;
export const WIRE_NODES = [
  ["CV_Wire_1_L", "CV_Wire_1_R"],
  ["CV_Wire_2_L", "CV_Wire_2_R"],
  ["CV_Wire_3_L", "CV_Wire_3_R"],
  ["CV_Wire_4_L", "CV_Wire_4_R"],
] as const;

const CAT_TRACKS = [
  { id: 1, x: -1.7, z0: CV.CAT_Z0, z1: CV.CAT_Z1 },
  { id: 2, x: 1.7, z0: CV.CAT_Z0, z1: CV.CAT_Z1 },
  { id: 3, x: -3.15, z0: -1.0, z1: 9.0 },
] as const;

export function addFlightDeck(ctx: CarrierCtx): void {
  const add = (part: Parameters<CarrierCtx["add"]>[0]) => ctx.add(part);
  const P = "carrier.deck.";
  const deckTop = CV.DECK_Y + CV.DECK_T;

  add({
    id: `${P}flight_deck`,
    name_cn: "飞行甲板装甲板",
    name_en: "flight deck armor",
    assembly: ASSEMBLY,
    build_layer: 3,
    geometry: { type: "kit", kit: "carrierFlightDeck" },
    material: "cv_deck",
    mate: A([0, 0, 0]),
    source: "1:8 展示尺度；平直甲板 + 斜角艏 + 左舷外飘，甲板面 y=4.58m。",
  });
  // 甲板面不再铺 18 块横向矩形装甲板——那样俯视像货船甲板，还会把斜角轮廓盖成方盒。
  // 只保留细的纵向/横向拼板缝，甲板面本身由 carrierFlightDeck 的连续外飘轮廓承担。
  for (let s = 0; s < 8; s++) {
    add({
      id: `${P}deck_seam_cross_${pad(s + 1)}`,
      name_cn: `甲板横向拼缝 ${s + 1}`,
      name_en: `deck transverse seam ${s + 1}`,
      assembly: ASSEMBLY,
      build_layer: 3,
      geometry: M(B(5.0, 0.004, 0.035, [0, 0, 0], 0.001)),
      material: "cv_deck_plate",
      mate: A([0, deckTop + 0.002, -14 + s * 2.6]),
    });
  }
  for (let s = 0; s < 3; s++) {
    add({
      id: `${P}deck_seam_long_${pad(s + 1)}`,
      name_cn: `甲板纵向拼缝 ${s + 1}`,
      name_en: `deck longitudinal seam ${s + 1}`,
      assembly: ASSEMBLY,
      build_layer: 3,
      geometry: M(B(0.035, 0.004, 20.0, [0, 0, 0], 0.001)),
      material: "cv_deck_plate",
      mate: A([-2.6 + s * 2.6, deckTop + 0.002, -5.0]),
    });
  }

  // ---- 电磁弹射器 ×3 ----
  for (const track of CAT_TRACKS) {
    const tag = pad(track.id);
    const segLen = (track.z1 - track.z0) / CV.CAT_SEGMENTS;
    for (let s = 0; s < CV.CAT_SEGMENTS; s++) {
      const z = track.z0 + segLen * (s + 0.5);
      add({
        id: `${P}cat_${tag}_stator_${pad(s + 1)}`,
        name_cn: `弹射器 ${track.id} 定子段 ${s + 1}`,
        name_en: `catapult ${track.id} stator ${s + 1}`,
        assembly: ASSEMBLY,
        build_layer: 3,
        geometry: M(
          B(0.07, 0.05, segLen + 0.02, [-0.17, 0, 0], 0.004),
          B(0.07, 0.05, segLen + 0.02, [0.17, 0, 0], 0.004),
          B(0.3, 0.014, segLen + 0.02, [0, 0.004, 0], 0.002),
        ),
        material: "cv_steel",
        mate: A([track.x, deckTop + 0.026, z]),
      });
      add({
        id: `${P}cat_${tag}_coil_${pad(s + 1)}`,
        name_cn: `弹射器 ${track.id} 铜导体轨 ${s + 1}`,
        name_en: `catapult ${track.id} conductor rail ${s + 1}`,
        assembly: ASSEMBLY,
        build_layer: 3,
        geometry: M(B(0.04, 0.024, segLen * 0.92, [-0.235, 0, 0], 0.002), B(0.04, 0.024, segLen * 0.92, [0.235, 0, 0], 0.002)),
        material: "cv_copper",
        mate: A([track.x, deckTop + 0.044, z]),
      });
      add({
        id: `${P}cat_${tag}_cooling_${pad(s + 1)}`,
        name_cn: `弹射器 ${track.id} 水冷管槽 ${s + 1}`,
        name_en: `catapult ${track.id} cooling duct ${s + 1}`,
        assembly: ASSEMBLY,
        build_layer: 3,
        geometry: M(B(0.06, 0.04, segLen * 0.96, [-0.305, 0, 0], 0.003), B(0.06, 0.04, segLen * 0.96, [0.305, 0, 0], 0.003)),
        material: "cv_steel",
        mate: A([track.x, deckTop + 0.022, z]),
      });
    }
    // 弹射槽中心铜轨 + 两侧白色界线：俯视时一眼分辨这是弹射器而不是普通车道。
    add({
      id: `${P}cat_${tag}_center_rail`,
      name_cn: `弹射器 ${track.id} 中心铜轨`,
      name_en: `catapult ${track.id} center conductor`,
      assembly: ASSEMBLY,
      build_layer: 3,
      geometry: M(B(0.05, 0.024, track.z1 - track.z0 - 0.1, [0, 0, 0], 0.002)),
      material: "cv_copper",
      mate: A([track.x, deckTop + 0.04, (track.z0 + track.z1) / 2]),
    });
    for (const side of [-1, 1] as const) {
      add({
        id: `${P}cat_${tag}_lane_${side === -1 ? "l" : "r"}`,
        name_cn: `弹射器 ${track.id} 车道边线 ${side === -1 ? "左" : "右"}`,
        name_en: `catapult ${track.id} lane edge ${side === -1 ? "l" : "r"}`,
        assembly: ASSEMBLY,
        build_layer: 4,
        geometry: M(B(0.035, 0.004, track.z1 - track.z0, [0, 0, 0], 0.001)),
        material: "cv_deck_line",
        mate: A([track.x + side * 0.43, deckTop + 0.012, (track.z0 + track.z1) / 2]),
      });
    }
    add({
      id: `${P}cat_${tag}_end_marks`,
      name_cn: `弹射器 ${track.id} 起止横线`,
      name_en: `catapult ${track.id} end marks`,
      assembly: ASSEMBLY,
      build_layer: 4,
      geometry: M(
        B(0.9, 0.004, 0.08, [0, 0, -(track.z1 - track.z0) / 2 - 0.18], 0.001),
        B(0.9, 0.004, 0.08, [0, 0, (track.z1 - track.z0) / 2 + 0.18], 0.001),
      ),
      material: "cv_deck_line",
      mate: A([track.x, deckTop + 0.013, (track.z0 + track.z1) / 2]),
    });
    // 轨道两侧盖板/端部缓冲。
    for (const side of [-1, 1] as const) {
      add({
        id: `${P}cat_${tag}_rail_${side === -1 ? "l" : "r"}`,
        name_cn: `弹射器 ${track.id} 导轨盖板 ${side === -1 ? "左" : "右"}`,
        name_en: `catapult ${track.id} rail cover ${side === -1 ? "l" : "r"}`,
        assembly: ASSEMBLY,
        build_layer: 3,
        geometry: M(B(0.06, 0.018, track.z1 - track.z0, [0, 0, 0], 0.003)),
        material: "cv_steel",
        mate: A([track.x + side * 0.355, deckTop + 0.01, (track.z0 + track.z1) / 2]),
      });
    }
    add({
      id: `${P}cat_${tag}_end_stop`,
      name_cn: `弹射器 ${track.id} 末端缓冲`,
      name_en: `catapult ${track.id} end stop`,
      assembly: ASSEMBLY,
      build_layer: 3,
      geometry: M(B(0.5, 0.12, 0.22, [0, 0.06, 0], 0.01), C(0.07, 0.1, [0, 0.07, 0], 12)),
      material: "cv_steel_dark",
      mate: A([track.x, deckTop, track.z1 + 0.12]),
    });
  }
  // 弹射位编号：白色大号数字刷在轨道旁，俯视一眼能区分 1/2/3 号弹射器。
  const digitDefs: Record<string, Array<[number, number, number, number]>> = {
    "1": [[0.05, 0.34, 0.0, 0.0], [0.18, 0.05, -0.03, -0.17]],
    "2": [[0.26, 0.05, 0, 0.2], [0.05, 0.16, 0.1, 0.12], [0.26, 0.05, 0, 0], [0.05, 0.16, -0.1, -0.12], [0.26, 0.05, 0, -0.2]],
    "3": [[0.26, 0.05, 0, 0.2], [0.05, 0.16, 0.1, 0.12], [0.26, 0.05, 0, 0], [0.05, 0.16, 0.1, -0.12], [0.26, 0.05, 0, -0.2]],
  };
  const catNumberSpots: Array<[number, number, string]> = [
    [-0.95, 5.2, "1"],
    [2.6, 5.2, "2"],
    [-4.0, -3.6, "3"],
  ];
  catNumberSpots.forEach(([x, z, digit]) => {
    const bars = digitDefs[digit]!.map(([w, h, dx, dz]) => B(w * 1.5, 0.012, h * 1.5, [dx * 1.5, 0, dz * 1.5], 0.002));
    add({
      id: `${P}cat_number_${digit}`,
      name_cn: `弹射位编号 ${digit}`,
      name_en: `catapult number ${digit}`,
      assembly: ASSEMBLY,
      build_layer: 4,
      geometry: M(...bars),
      material: "cv_deck_yellow",
      mate: A([x, deckTop + 0.02, z]),
    });
  });

  // 挡焰板：铰接节点，待机平放，弹射时竖起。
  CAT_TRACKS.forEach((track, index) => {
    const node = JBD_NODES[index]!;
    const z = track.z0 - 3.2;
    ctx.node({ name: node, parent: "root", pivot: [track.x, deckTop + 0.05, z], motion: "rotate", axis: "x", rest_rotation: [-90, 0, 0], note: `弹射器 ${track.id} 挡焰板` });
    add({
      id: `${P}cat_${pad(track.id)}_jbd_panel`,
      name_cn: `弹射器 ${track.id} 挡焰板`,
      name_en: `jet blast deflector ${track.id}`,
      assembly: ASSEMBLY,
      build_layer: 3,
      geometry: M(
        B(1.08, 0.92, 0.07, [0, 0.46, 0], 0.01),
        B(0.96, 0.035, 0.04, [0, 0.2, 0.045], 0.004),
        B(1.0, 0.045, 0.06, [0, 0.36, 0.05], 0.004),
        B(1.0, 0.045, 0.06, [0, 0.68, 0.05], 0.004),
        B(1.0, 0.045, 0.06, [0, 0.9, 0.05], 0.004),
        B(0.055, 0.84, 0.055, [-0.4, 0.5, 0.055], 0.004),
        B(0.055, 0.84, 0.055, [0.4, 0.5, 0.055], 0.004),
        B(1.0, 0.07, 0.075, [0, 0.035, 0.02], 0.004),
        B(0.09, 0.13, 0.11, [-0.36, 0.03, 0.02], 0.004),
        B(0.09, 0.13, 0.11, [0.36, 0.03, 0.02], 0.004),
      ),
      material: "cv_steel_dark",
      node,
      mate: A([0, 0, 0]),
    });
    add({
      id: `${P}cat_${pad(track.id)}_jbd_actuator`,
      name_cn: `弹射器 ${track.id} 挡焰板作动筒`,
      name_en: `JBD actuator ${track.id}`,
      assembly: ASSEMBLY,
      build_layer: 3,
      geometry: M(C(0.04, 0.3, [0, 0, 0], 12), C(0.022, 0.22, [0, 0.18, 0], 10)),
      material: "cv_steel",
      node,
      mate: A([0.38, 0.16, -0.06], [0, 0, 25]),
    });
  });
  // 滑梭（唯一被动画驱动的是 2 号弹射器）。
  ctx.node({ name: SHUTTLE_NODE, parent: "root", pivot: [CV.CAT_X, deckTop + 0.09, CV.CAT_Z0], motion: "translate", axis: "z", note: "电磁弹射滑梭" });
  add({
    id: `${P}shuttle_body`,
    name_cn: "弹射滑梭",
    name_en: "catapult shuttle",
    assembly: ASSEMBLY,
    build_layer: 3,
    geometry: M(B(0.34, 0.12, 0.38, [0, 0, 0], 0.01), B(0.12, 0.08, 0.2, [0, 0.1, -0.08], 0.006), C(0.04, 0.1, [0, -0.01, 0.12], 10)),
    material: "cv_steel",
    node: SHUTTLE_NODE,
    mate: A([0, 0, 0]),
  });
  for (const side of [-1, 1] as const) {
    add({
      id: `${P}shuttle_wheel_${side === -1 ? "l" : "r"}`,
      name_cn: `滑梭导向轮 ${side === -1 ? "左" : "右"}`,
      name_en: `shuttle roller ${side === -1 ? "l" : "r"}`,
      assembly: ASSEMBLY,
      build_layer: 3,
      geometry: M(C(0.055, 0.04, [0, 0, 0], 14), T(0.04, 0.02, 0.045, [0, 0, 0], 12)),
      material: "cv_steel_dark",
      node: SHUTTLE_NODE,
      mate: A([side * 0.23, -0.03, 0.05], [0, 0, 90]),
    });
  }
  add({
    id: `${P}shuttle_towbar`,
    name_cn: "滑梭牵引杆",
    name_en: "shuttle tow bar",
    assembly: ASSEMBLY,
    build_layer: 3,
    geometry: M(C(0.035, 0.42, [0, 0, 0], 10), C(0.06, 0.06, [0, 0.24, 0], 10)),
    material: "cv_steel",
    node: SHUTTLE_NODE,
    mate: A([0, 0.08, 0.25], [90, 0, 0]),
  });
  // 1、3 号弹射器各放一枚待发滑梭（2 号由动画节点驱动）。
  for (const track of [CAT_TRACKS[0]!, CAT_TRACKS[2]!]) {
    const tag = pad(track.id);
    add({
      id: `${P}cat_${tag}_shuttle_parked`,
      name_cn: `弹射器 ${track.id} 待发滑梭`,
      name_en: `catapult ${track.id} shuttle`,
      assembly: ASSEMBLY,
      build_layer: 3,
      geometry: M(
        B(0.3, 0.1, 0.34, [0, 0, 0], 0.01),
        B(0.1, 0.07, 0.18, [0, 0.09, -0.07], 0.006),
        C(0.035, 0.1, [0, -0.01, 0.1], 10),
      ),
      material: "cv_steel",
      mate: A([track.x, deckTop + 0.09, track.z0 + 0.1]),
    });
  }
  // ---- 电磁弹射器甲板下机构：直线电机隧道 / 反应轨 / 水冷 / 变流 / 储能 / 母线 ----
  // 全部吊在飞行甲板底面（y∈4.08~4.40），在透视模式下可见，不占机库净高。
  CAT_TRACKS.forEach((track) => {
    const tag = pad(track.id);
    const len = track.z1 - track.z0;
    const zc = (track.z0 + track.z1) / 2;
    const E = `${P}emals_${tag}_`;
    add({
      id: `${E}channel`,
      name_cn: `弹射器 ${track.id} 直线电机隧道`,
      name_en: `catapult ${track.id} linear motor tunnel`,
      assembly: ASSEMBLY,
      build_layer: 3,
      geometry: M(
        B(0.05, 0.24, len, [-0.26, 0, 0], 0.004),
        B(0.05, 0.24, len, [0.26, 0, 0], 0.004),
        B(0.57, 0.03, len, [0, 0.12, 0], 0.004),
      ),
      material: "cv_steel_dark",
      mate: A([track.x, 4.28, zc]),
    });
    add({
      id: `${E}armature`,
      name_cn: `弹射器 ${track.id} 直线电机电枢`,
      name_en: `catapult ${track.id} linear motor armature`,
      assembly: ASSEMBLY,
      build_layer: 3,
      geometry: M(B(0.05, 0.08, len * 0.98, [-0.1, 0, 0], 0.002), B(0.05, 0.08, len * 0.98, [0.1, 0, 0], 0.002)),
      material: "cv_copper",
      mate: A([track.x, 4.27, zc]),
    });
    add({
      id: `${E}reaction_rail`,
      name_cn: `弹射器 ${track.id} 反应轨`,
      name_en: `catapult ${track.id} reaction rail`,
      assembly: ASSEMBLY,
      build_layer: 3,
      geometry: M(B(0.08, 0.045, len, [0, 0, 0], 0.003)),
      material: "cv_steel",
      mate: A([track.x, 4.19, zc]),
    });
    add({
      id: `${E}coolant`,
      name_cn: `弹射器 ${track.id} 水冷主管`,
      name_en: `catapult ${track.id} coolant manifold`,
      assembly: ASSEMBLY,
      build_layer: 3,
      geometry: M(B(0.06, 0.06, len * 0.98, [-0.3, 0, 0], 0.003), B(0.06, 0.06, len * 0.98, [0.3, 0, 0], 0.003)),
      material: "cv_copper",
      mate: A([track.x, 4.22, zc]),
    });
    const hangerGeos: Parameters<typeof M>[0][] = [];
    for (let h = 0; h < 5; h++) {
      hangerGeos.push(B(0.54, 0.05, 0.08, [0, -0.105, -len / 2 + 0.8 + (h * (len - 1.6)) / 4], 0.003));
    }
    add({
      id: `${E}hangers`,
      name_cn: `弹射器 ${track.id} 隧道吊架`,
      name_en: `catapult ${track.id} tunnel hangers`,
      assembly: ASSEMBLY,
      build_layer: 3,
      geometry: M(...hangerGeos),
      material: "cv_steel",
      mate: A([track.x, 4.28, zc]),
    });
    // 变流/储能机柜靠弹射器后端外侧，顶面吊在甲板底面。
    // 1 号机的变流柜必须让开 3 号机的水冷管（两套弹射器在此段并排）。
    const cabinetX = track.id === 1 ? track.x - 0.72 : track.x + 0.92;
    const cabinetZ = track.z0 - 1.7;
    add({
      id: `${E}converter`,
      name_cn: `弹射器 ${track.id} 变流器机柜`,
      name_en: `catapult ${track.id} converter cabinet`,
      assembly: ASSEMBLY,
      build_layer: 3,
      geometry: M(
        B(0.8, 0.3, 0.46, [0, 0, 0], 0.008),
        B(0.86, 0.035, 0.52, [0, 0.15, 0], 0.004),
        B(0.34, 0.16, 0.015, [0, 0.01, 0.235], 0.003),
      ),
      material: "cv_steel_dark",
      mate: A([cabinetX, 4.235, cabinetZ]),
    });
    add({
      id: `${E}flywheel`,
      name_cn: `弹射器 ${track.id} 飞轮储能`,
      name_en: `catapult ${track.id} flywheel energy storage`,
      assembly: ASSEMBLY,
      build_layer: 3,
      geometry: M(
        C(0.26, 0.22, [0, 0, 0], 24),
        T(0.3, 0.08, 0.035, [0, 0.125, 0], 24),
        C(0.07, 0.28, [0, 0.01, 0], 14),
      ),
      material: "cv_steel",
      // 飞轮放在变流柜正后方，避开前向母线槽（原偏移位置会与 busway 相交）。
      mate: A([cabinetX, 4.27, cabinetZ - 0.7]),
    });
    add({
      id: `${E}capacitors`,
      name_cn: `弹射器 ${track.id} 脉冲电容组`,
      name_en: `catapult ${track.id} capacitor bank`,
      assembly: ASSEMBLY,
      build_layer: 3,
      geometry: M(
        B(0.72, 0.035, 0.42, [0, 0, 0], 0.004),
        ...Array.from({ length: 6 }, (_, k) => C(0.055, 0.24, [-0.26 + (k % 3) * 0.26, -0.14, -0.09 + Math.floor(k / 3) * 0.18], 12)),
      ),
      material: "cv_copper",
      mate: A([cabinetX, 4.38, cabinetZ + 0.9]),
    });
    add({
      id: `${E}busway`,
      name_cn: `弹射器 ${track.id} 母线槽`,
      name_en: `catapult ${track.id} busway`,
      assembly: ASSEMBLY,
      build_layer: 3,
      geometry: M(B(0.2, 0.12, 1.6, [0, 0, 0], 0.004), B(0.24, 0.02, 1.62, [0, -0.062, 0], 0.002)),
      material: "cv_steel_dark",
      mate: A([track.x, 4.34, track.z0 - 0.8]),
    });
    add({
      id: `${E}busbars`,
      name_cn: `弹射器 ${track.id} 母线铜排`,
      name_en: `catapult ${track.id} busbars`,
      assembly: ASSEMBLY,
      build_layer: 3,
      geometry: M(
        B(0.035, 0.018, 1.48, [-0.05, 0, 0], 0.001),
        B(0.035, 0.018, 1.48, [0, 0, 0], 0.001),
        B(0.035, 0.018, 1.48, [0.05, 0, 0], 0.001),
      ),
      material: "cv_copper",
      mate: A([track.x, 4.2725, track.z0 - 0.8]),
    });
  });

  // ---- 拦阻索 ×4（左右半索绕甲板边缘滑轮摆动） ----
  CV.WIRE_Z.forEach((z, index) => {
    const tag = pad(index + 1);
    for (const side of [-1, 1] as const) {
      const node = WIRE_NODES[index]![side === -1 ? 0 : 1];
      ctx.node({ name: node, parent: "root", pivot: [side * CV.WIRE_HALF, CV.WIRE_Y, z], motion: "rotate", axis: "y", note: `第 ${index + 1} 道拦阻索 ${side === -1 ? "左" : "右"}半索` });
      add({
        id: `${P}wire_${tag}_${side === -1 ? "l" : "r"}_cable`,
        name_cn: `拦阻索 ${index + 1} ${side === -1 ? "左" : "右"}半索`,
        name_en: `arresting wire ${index + 1} ${side === -1 ? "l" : "r"}`,
        assembly: ASSEMBLY,
        build_layer: 3,
        geometry: M(C(0.022, CV.WIRE_HALF, [0, 0, 0], 10), C(0.05, 0.1, [0, -CV.WIRE_HALF / 2, 0], 12)),
        material: "cv_steel",
        node,
        mate: A([-side * CV.WIRE_HALF / 2, 0, 0], [0, 0, 90]),
      });
      add({
        id: `${P}wire_${tag}_${side === -1 ? "l" : "r"}_sheave`,
        name_cn: `拦阻索 ${index + 1} 滑轮 ${side === -1 ? "左" : "右"}`,
        name_en: `wire sheave ${index + 1} ${side === -1 ? "l" : "r"}`,
        assembly: ASSEMBLY,
        build_layer: 3,
        geometry: M(T(0.13, 0.07, 0.07, [0, 0, 0], 20), C(0.05, 0.14, [0, 0, 0], 12)),
        material: "cv_steel_dark",
        node,
        mate: A([0, -0.07, 0], [90, 0, 0]),
      });
    }
    add({
      id: `${P}wire_${tag}_spring_l`,
      name_cn: `拦阻索 ${index + 1} 左支撑弹簧片`,
      name_en: `wire ${index + 1} spring left`,
      assembly: ASSEMBLY,
      build_layer: 3,
      geometry: M(B(0.9, 0.035, 0.16, [0, 0, 0], 0.006)),
      material: "cv_steel",
      mate: A([-3.4, deckTop + 0.08, z]),
    });
    add({
      id: `${P}wire_${tag}_spring_r`,
      name_cn: `拦阻索 ${index + 1} 右支撑弹簧片`,
      name_en: `wire ${index + 1} spring right`,
      assembly: ASSEMBLY,
      build_layer: 3,
      geometry: M(B(0.9, 0.035, 0.16, [0, 0, 0], 0.006)),
      material: "cv_steel",
      mate: A([3.4, deckTop + 0.08, z]),
    });
  });
  // 液压拦阻机（甲板下）。
  for (const side of [-1, 1] as const) {
    add({
      id: `${P}arrestor_${side === -1 ? "l" : "r"}_cylinder`,
      name_cn: `液压拦阻机缸体 ${side === -1 ? "左" : "右"}`,
      name_en: `arrestor cylinder ${side === -1 ? "l" : "r"}`,
      assembly: ASSEMBLY,
      build_layer: 3,
      geometry: M(C(0.25, 1.6, [0, 0, 0], 22), T(0.28, 0.25, 0.1, [0, 0.8, 0], 22)),
      material: "cv_steel_dark",
      mate: A([side * 2.0, CV.DECK_Y - 0.25, -10.2], [90, 0, 0]),
    });
    add({
      id: `${P}arrestor_${side === -1 ? "l" : "r"}_piston`,
      name_cn: `拦阻机活塞杆 ${side === -1 ? "左" : "右"}`,
      name_en: `arrestor piston ${side === -1 ? "l" : "r"}`,
      assembly: ASSEMBLY,
      build_layer: 3,
      geometry: M(C(0.1, 1.2, [0, 0, 0], 16)),
      material: "cv_steel",
      mate: A([side * 2.0, CV.DECK_Y - 0.25, -11.6], [90, 0, 0]),
    });
    add({
      id: `${P}arrestor_${side === -1 ? "l" : "r"}_valve`,
      name_cn: `拦阻机可调节流阀 ${side === -1 ? "左" : "右"}`,
      name_en: `arrestor valve ${side === -1 ? "l" : "r"}`,
      assembly: ASSEMBLY,
      build_layer: 3,
      geometry: M(B(0.3, 0.24, 0.24, [0, 0, 0], 0.008), C(0.06, 0.1, [0, 0.16, 0], 12)),
      material: "cv_brass",
      mate: A([side * 2.0, CV.DECK_Y - 0.1, -10.2]),
    });
  }
  // ---- 应急拦阻网：布置在斜角着舰区前端（不是舰艉），由左右支柱 + 交叉网带组成 ----
  {
    const netZ = 6.0;
    const netRad = (9.3 * Math.PI) / 180;
    const netSin = Math.sin(netRad);
    const netCos = Math.cos(netRad);
    const netCenterX = 0.5 - ((netZ + 18.5) / netCos) * netSin;
    const netHalf = 1.5;
    const netYaw = -9.3;
    const postAt = (side: -1 | 1): [number, number] => [
      netCenterX + side * netHalf * netCos,
      netZ + side * netHalf * netSin,
    ];
    for (const side of [-1, 1] as const) {
      const [px, pz] = postAt(side);
      const tag = side === -1 ? "l" : "r";
      add({
        id: `${P}arrestor_net_post_${tag}`,
        name_cn: `拦阻网支柱 ${side === -1 ? "左" : "右"}`,
        name_en: `barrier net post ${tag}`,
        assembly: ASSEMBLY,
        build_layer: 3,
        geometry: M(C(0.07, 1.2, [0, 0, 0], 12), B(0.32, 0.08, 0.32, [0, -0.58, 0], 0.008)),
        material: "cv_steel_dark",
        mate: A([px, deckTop + 0.6, pz]),
      });
      add({
        id: `${P}arrestor_net_brace_${tag}`,
        name_cn: `拦阻网支柱斜撑 ${side === -1 ? "左" : "右"}`,
        name_en: `barrier net post brace ${tag}`,
        assembly: ASSEMBLY,
        build_layer: 3,
        geometry: M({ type: "weld", from: [px, deckTop + 1.08, pz], to: [px - side * 0.7, deckTop + 0.06, pz], radius: 0.032 }),
        material: "cv_steel_dark",
        mate: A([0, 0, 0]),
      });
    }
    // 网带：7 道横带 + 11 道竖带 + 顶部张紧杆，合并成一个零件，避免网带互相穿模报告。
    const netBands: Array<ReturnType<typeof B>> = [];
    for (let h = 0; h < 9; h++) {
      netBands.push(B(netHalf * 2, 0.012, 0.012, [0, 0.14 + h * 0.12, 0], 0.0006));
    }
    for (let v = 0; v < 15; v++) {
      netBands.push(B(0.012, 0.96, 0.012, [-netHalf + v * (netHalf * 2) / 14, 0.62, 0], 0.0006));
    }
    netBands.push(B(netHalf * 2 + 0.14, 0.06, 0.06, [0, 1.2, 0], 0.002));
    netBands.push(B(netHalf * 2, 0.05, 0.05, [0, 0.05, 0], 0.002));
    add({
      id: `${P}arrestor_net`,
      name_cn: "拦阻网（网带式，可升起）",
      name_en: "barrier net mesh",
      assembly: ASSEMBLY,
      build_layer: 3,
      geometry: M(...netBands),
      material: "cv_canvas",
      mate: A([netCenterX, deckTop, netZ], [0, netYaw, 0]),
    });
  }

  // ---- 右舷艉部航空吊车：基座/回转齿圈/桅柱/司机室/桁架吊臂/绞车/吊钩 ----
  {
    const cx = 3.55;
    const cz = -15.8;
    const baseY = deckTop;
    add({
      id: `${P}crane_base`,
      name_cn: "航空吊车基座",
      name_en: "deck crane base",
      assembly: ASSEMBLY,
      build_layer: 4,
      geometry: M(B(0.95, 0.08, 0.95, [0, 0, 0], 0.008), B(1.05, 0.05, 1.05, [0, -0.04, 0], 0.006)),
      material: "cv_steel_dark",
      mate: A([cx, baseY + 0.04, cz]),
    });
    for (let g = 0; g < 4; g++) {
      const a = (g / 4) * Math.PI * 2;
      add({
        id: `${P}crane_gusset_${g + 1}`,
        name_cn: `吊车基座加强肘板 ${g + 1}`,
        name_en: `crane base gusset ${g + 1}`,
        assembly: ASSEMBLY,
        build_layer: 4,
        geometry: M(B(0.16, 0.3, 0.06, [0, 0, 0], 0.004)),
        material: "cv_steel",
        mate: A([cx + Math.cos(a) * 0.36, baseY + 0.2, cz + Math.sin(a) * 0.36], [0, -a * 180 / Math.PI, 0]),
      });
    }
    add({
      id: `${P}crane_slew_ring`,
      name_cn: "吊车回转齿圈",
      name_en: "crane slew ring",
      assembly: ASSEMBLY,
      build_layer: 4,
      geometry: M(T(0.34, 0.27, 0.12, [0, 0, 0], 24), C(0.3, 0.06, [0, 0.09, 0], 20)),
      material: "cv_brass",
      mate: A([cx, baseY + 0.16, cz]),
    });
    add({
      id: `${P}crane_pedestal`,
      name_cn: "吊车回转台",
      name_en: "crane pedestal",
      assembly: ASSEMBLY,
      build_layer: 4,
      geometry: M(C(0.28, 0.22, [0, 0, 0], 20), B(0.5, 0.08, 0.5, [0, 0.14, 0], 0.006)),
      material: "cv_steel_dark",
      mate: A([cx, baseY + 0.33, cz]),
    });
    add({
      id: `${P}crane_post`,
      name_cn: "吊车桅柱",
      name_en: "crane post",
      assembly: ASSEMBLY,
      build_layer: 4,
      geometry: M(C(0.15, 1.15, [0, 0, 0], 16), T(0.17, 0.12, 0.06, [0, 0.56, 0], 16)),
      material: "cv_steel",
      mate: A([cx, baseY + 1.0, cz]),
    });
    add({
      id: `${P}crane_cab`,
      name_cn: "吊车司机室",
      name_en: "crane cab",
      assembly: ASSEMBLY,
      build_layer: 4,
      geometry: M(B(0.46, 0.44, 0.5, [0, 0, 0], 0.012), B(0.34, 0.26, 0.02, [0, 0.06, 0.26], 0.003), B(0.4, 0.04, 0.54, [0, 0.24, 0], 0.006)),
      material: "cv_hull_dark",
      mate: A([cx + 0.42, baseY + 0.72, cz + 0.16], [0, -20, 0]),
    });
    add({
      id: `${P}crane_cab_bracket`,
      name_cn: "吊车司机室托架",
      name_en: "crane cab bracket",
      assembly: ASSEMBLY,
      build_layer: 4,
      geometry: M(B(0.26, 0.1, 0.22, [0, 0, 0], 0.004), B(0.06, 0.26, 0.06, [-0.02, -0.16, 0], 0.003)),
      material: "cv_steel",
      mate: A([cx + 0.28, baseY + 0.52, cz + 0.1]),
    });
    // 桁架吊臂：4 根弦杆 + 8 根斜撑，向港内伸 2.2m。
    add({
      id: `${P}crane_boom_root`,
      name_cn: "吊臂根部铰座",
      name_en: "crane boom root hinge",
      assembly: ASSEMBLY,
      build_layer: 4,
      geometry: M(B(0.5, 0.22, 0.26, [0, 0, 0], 0.006), B(0.08, 0.3, 0.08, [0, 0.02, 0], 0.003)),
      material: "cv_steel",
      mate: A([cx + 0.1, baseY + 1.55, cz]),
    });
    for (const [sy, sz] of [[-0.1, -0.1], [-0.1, 0.1], [0.1, -0.1], [0.1, 0.1]] as const) {
      add({
        id: `${P}crane_boom_chord_${sy < 0 ? "b" : "t"}${sz < 0 ? "f" : "a"}`,
        name_cn: `吊臂弦杆 ${sy < 0 ? "下" : "上"}${sz < 0 ? "前" : "后"}`,
        name_en: `crane boom chord ${sy < 0 ? "lower" : "upper"}${sz < 0 ? "fwd" : "aft"}`,
        assembly: ASSEMBLY,
        build_layer: 4,
        geometry: M({ type: "weld", from: [cx + 0.15, baseY + 1.55 + sy, cz + sz], to: [cx - 2.05, baseY + 2.1 + sy * 0.7, cz + sz * 0.6], radius: 0.028, seed: 500 + sy * 10 + sz }),
        material: "cv_steel",
        mate: A([0, 0, 0]),
      });
    }
    for (let b = 0; b < 8; b++) {
      const t0 = 0.12 + b * 0.1;
      const t1 = t0 + 0.1;
      const y0 = baseY + 1.55 + t0 * 0.55;
      const y1 = baseY + 1.55 + t1 * 0.55;
      const x0 = cx + 0.15 - t0 * 2.2;
      const x1 = cx + 0.15 - t1 * 2.2;
      add({
        id: `${P}crane_boom_brace_${b + 1}`,
        name_cn: `吊臂斜撑 ${b + 1}`,
        name_en: `crane boom brace ${b + 1}`,
        assembly: ASSEMBLY,
        build_layer: 4,
        geometry: M({ type: "weld", from: [x0, y0, cz - 0.1], to: [x1, y1, cz + 0.1], radius: 0.016, seed: 600 + b }),
        material: "cv_steel_dark",
        mate: A([0, 0, 0]),
      });
    }
    add({
      id: `${P}crane_winch_saddle`,
      name_cn: "吊车绞车支座",
      name_en: "crane winch saddle",
      assembly: ASSEMBLY,
      build_layer: 4,
      geometry: M(B(0.3, 0.12, 0.26, [0, 0, 0], 0.004), B(0.05, 0.18, 0.05, [0.12, -0.12, 0], 0.002)),
      material: "cv_steel",
      mate: A([cx + 0.05, baseY + 1.72, cz + 0.06]),
    });
    add({
      id: `${P}crane_winch`,
      name_cn: "吊车绞车",
      name_en: "crane winch",
      assembly: ASSEMBLY,
      build_layer: 4,
      geometry: M(C(0.12, 0.2, [0, 0, 0], 14), C(0.06, 0.24, [0, 0, 0], 12)),
      material: "cv_brass",
      mate: A([cx + 0.05, baseY + 1.8, cz + 0.12], [0, 0, 90]),
    });
    add({
      id: `${P}crane_hook_block`,
      name_cn: "吊车吊钩滑轮组",
      name_en: "crane hook block",
      assembly: ASSEMBLY,
      build_layer: 4,
      geometry: M(B(0.16, 0.22, 0.1, [0, 0, 0], 0.006), C(0.025, 0.18, [0, -0.2, 0], 10), { type: "torus", radius: 0.07, tube: 0.018, radialSegments: 8, tubularSegments: 16 }),
      material: "cv_steel_dark",
      mate: A([cx - 1.9, baseY + 1.3, cz], [0, 0, 90]),
    });
    for (const sz of [-0.04, 0.04] as const) {
      add({
        id: `${P}crane_fall_${sz < 0 ? "f" : "a"}`,
        name_cn: `吊车起升索 ${sz < 0 ? "前" : "后"}`,
        name_en: `crane hoist fall ${sz < 0 ? "fwd" : "aft"}`,
        assembly: ASSEMBLY,
        build_layer: 4,
        geometry: M({ type: "weld", from: [cx - 1.9, baseY + 2.0, cz + sz], to: [cx - 1.9, baseY + 1.36, cz + sz], radius: 0.008 }),
        material: "cv_steel",
        mate: A([0, 0, 0]),
      });
    }
  }

  // ---- 菲涅尔光学助降系统（FLOLS）：透镜箱阵列 + 基准灯 + 平台/机柜 ----
  {
    const fx = -4.0;
    const fz = -2.2;
    add({
      id: `${P}flols_platform`,
      name_cn: "光学助降平台",
      name_en: "FLOLS platform",
      assembly: ASSEMBLY,
      build_layer: 4,
      geometry: M(B(0.55, 0.06, 0.85, [0, 0, 0], 0.006)),
      material: "cv_grate",
      mate: A([fx, deckTop + 0.03, fz]),
    });
    for (let l = 0; l < 4; l++) {
      add({
        id: `${P}flols_leg_${l + 1}`,
        name_cn: `光学助降平台支腿 ${l + 1}`,
        name_en: `FLOLS platform leg ${l + 1}`,
        assembly: ASSEMBLY,
        build_layer: 4,
        geometry: M(C(0.025, 0.3, [0, 0, 0], 8)),
        material: "cv_steel",
        mate: A([fx + (l % 2 === 0 ? -0.2 : 0.2), deckTop - 0.12, fz + (l < 2 ? -0.3 : 0.3)]),
      });
    }
    add({
      id: `${P}flols_cabinet`,
      name_cn: "光学助降机柜",
      name_en: "FLOLS cabinet",
      assembly: ASSEMBLY,
      build_layer: 4,
      geometry: M(B(0.34, 0.42, 0.5, [0, 0, 0], 0.006), B(0.26, 0.06, 0.02, [0, 0.12, 0.26], 0.003)),
      material: "cv_steel_dark",
      mate: A([fx + 0.05, deckTop + 0.27, fz + 0.18]),
    });
    add({
      id: `${P}flols_column`,
      name_cn: "光学助降透镜立柱",
      name_en: "FLOLS lens column",
      assembly: ASSEMBLY,
      build_layer: 4,
      geometry: M(B(0.1, 1.05, 0.1, [0, 0, 0], 0.004)),
      material: "cv_steel",
      mate: A([fx, deckTop + 0.55, fz - 0.18]),
    });
    for (let c = 0; c < 5; c++) {
      add({
        id: `${P}flols_lens_${c + 1}`,
        name_cn: `菲涅尔透镜箱 ${c + 1}`,
        name_en: `FLOLS lens cell ${c + 1}`,
        assembly: ASSEMBLY,
        build_layer: 4,
        geometry: M(B(0.26, 0.12, 0.1, [0, 0, 0], 0.006), B(0.2, 0.075, 0.02, [0, 0, 0.06], 0.003)),
        material: c === 2 ? "cv_warning" : "cv_glow",
        mate: A([fx, deckTop + 0.48 + c * 0.15, fz - 0.26], [-8, 0, 0]),
      });
    }
    for (const side of [-1, 1] as const) {
      add({
        id: `${P}flols_datum_${side === -1 ? "l" : "r"}`,
        name_cn: `光学助降基准灯 ${side === -1 ? "左" : "右"}`,
        name_en: `FLOLS datum light ${side === -1 ? "l" : "r"}`,
        assembly: ASSEMBLY,
        build_layer: 4,
        geometry: M(C(0.045, 0.16, [0, 0, 0], 10), B(0.05, 0.12, 0.06, [0, 0.1, 0], 0.003)),
        material: side === -1 ? "cv_deck_red" : "cv_deck_line",
        mate: A([fx + side * 0.26, deckTop + 0.03, fz - 0.18]),
      });
    }
  }

  // ---- 着舰区舷侧安全网：实体网格 + 外伸撑杆（6 段） ----
  for (let n = 0; n < 6; n++) {
    const nz = -12.6 + n * 1.15;
    const netEdge = deckEdgeAt(nz, -1).x;
    const netParts: Parameters<typeof M>[0][] = [];
    for (let v = 0; v < 6; v++) {
      const x = -0.75 + v * 0.15;
      netParts.push({ type: "weld", from: [x, -0.18, -0.5], to: [x, -0.22, 0.5], radius: 0.008, seed: 200 + n * 10 + v });
    }
    for (let h = 0; h < 5; h++) {
      const z = -0.5 + h * 0.25;
      netParts.push({ type: "weld", from: [-0.75, -0.18, z], to: [-0.02, -0.23, z], radius: 0.008, seed: 300 + n * 10 + h });
    }
    for (const side of [-1, 1] as const) {
      netParts.push({ type: "weld", from: [-0.78, -0.18, side * 0.46], to: [-0.16, 0.02, side * 0.46], radius: 0.018, seed: 400 + n * 2 + (side === -1 ? 0 : 1) });
    }
    add({
      id: `${P}safety_net_${pad(n + 1)}`,
      name_cn: `着舰区安全网 ${n + 1}`,
      name_en: `deck safety net ${n + 1}`,
      assembly: ASSEMBLY,
      build_layer: 4,
      geometry: M(...netParts),
      material: "cv_steel",
      mate: A([netEdge, deckTop, nz]),
    });
  }

  // ---- 舷侧升降机 ×2 ----
  CV.ELEVATOR_Z.forEach((z, index) => {
    const node = ELEVATOR_NODES[index]!;
    ctx.node({ name: node, parent: "root", pivot: [CV.ELEVATOR_X, deckTop, z], motion: "translate", axis: "y", note: `舷侧升降机 ${index + 1}` });
    add({
      id: `${P}elevator_${index + 1}_platform`,
      name_cn: `升降机 ${index + 1} 平台`,
      name_en: `aircraft elevator ${index + 1} platform`,
      assembly: ASSEMBLY,
      build_layer: 3,
      geometry: M(B(CV.ELEVATOR_W, 0.1, CV.ELEVATOR_L, [0, 0.02, 0], 0.008), B(CV.ELEVATOR_W - 0.12, 0.025, CV.ELEVATOR_L - 0.12, [0, 0.083, 0], 0.004)),
      material: "cv_deck_plate",
      node,
      mate: A([0, 0, 0]),
    });
    add({
      id: `${P}elevator_${index + 1}_frame`,
      name_cn: `升降机 ${index + 1} 支撑框`,
      name_en: `elevator ${index + 1} frame`,
      assembly: ASSEMBLY,
      build_layer: 3,
      geometry: M(B(CV.ELEVATOR_W + 0.08, 0.08, 0.12, [0, 0.035, CV.ELEVATOR_L / 2], 0.006), B(CV.ELEVATOR_W + 0.08, 0.08, 0.12, [0, 0.035, -CV.ELEVATOR_L / 2], 0.006), B(0.12, 0.08, CV.ELEVATOR_L, [-CV.ELEVATOR_W / 2, 0.035, 0], 0.006)),
      material: "cv_steel_dark",
      node,
      mate: A([0, 0, 0]),
    });
    for (let w = 0; w < 6; w++) {
      add({
        id: `${P}elevator_${index + 1}_roller_${w + 1}`,
        name_cn: `升降机 ${index + 1} 导向轮 ${w + 1}`,
        name_en: `elevator ${index + 1} roller ${w + 1}`,
        assembly: ASSEMBLY,
        build_layer: 3,
        geometry: M(C(0.09, 0.06, [0, 0, 0], 14)),
        material: "cv_steel",
        node,
        mate: A([w % 2 === 0 ? -CV.ELEVATOR_W / 2 - 0.05 : CV.ELEVATOR_W / 2 + 0.05, 0.02, -1.0 + Math.floor(w / 2) * 1.0], [0, 0, 90]),
      });
    }
    for (const side of [-1, 1] as const) {
      add({
        id: `${P}elevator_${index + 1}_rail_${side === -1 ? "l" : "r"}`,
        name_cn: `升降机 ${index + 1} 导轨 ${side === -1 ? "左" : "右"}`,
        name_en: `elevator ${index + 1} rail ${side === -1 ? "l" : "r"}`,
        assembly: ASSEMBLY,
        build_layer: 3,
        geometry: M(B(0.08, 2.2, 0.12, [0, 0, 0], 0.006)),
        material: "cv_steel_dark",
        mate: A([CV.ELEVATOR_X + side * (CV.ELEVATOR_W / 2 + 0.06), deckTop - 1.05, z + CV.ELEVATOR_L / 2 + 0.06]),
      });
      add({
        id: `${P}elevator_${index + 1}_cylinder_${side === -1 ? "l" : "r"}`,
        name_cn: `升降机 ${index + 1} 液压缸 ${side === -1 ? "左" : "右"}`,
        name_en: `elevator ${index + 1} hydraulic cylinder ${side === -1 ? "l" : "r"}`,
        assembly: ASSEMBLY,
        build_layer: 3,
        geometry: M(C(0.11, 1.4, [0, 0, 0], 18), C(0.045, 0.6, [0, 0.4, 0], 12)),
        material: "cv_steel",
        mate: A([CV.ELEVATOR_X + side * 0.75, 3.7, z - CV.ELEVATOR_L / 2 - 0.2]),
      });
    }
  });

  // ---- 甲板标记与系留点 ----
  const markY = deckTop + 0.014;
  // 斜角着舰跑道：右舷艉部向舰艏左舷斜置 9.3°（福建舰实测 ~9.5°，落在 6°~14° 区间）。
  // 所有标线都按跑道坐标系（沿跑道 s / 横跨跑道 d）生成并随跑道同角度旋转，保证平行、前后对齐。
  const RUNWAY_DEG = 9.3;
  const RUNWAY_RAD = (RUNWAY_DEG * Math.PI) / 180;
  const RUNWAY_SIN = Math.sin(RUNWAY_RAD);
  const RUNWAY_COS = Math.cos(RUNWAY_RAD);
  const RUNWAY_YAW = -RUNWAY_DEG;
  const RUNWAY_AFT_X = 1.05;
  const RUNWAY_AFT_Z = -18.5;
  const RUNWAY_LEN = 25.0;
  const runwayAt = (s: number): [number, number] => [RUNWAY_AFT_X - s * RUNWAY_SIN, RUNWAY_AFT_Z + s * RUNWAY_COS];
  const runwayAcross = (s: number, side: number, distance: number): [number, number] => {
    const [x, z] = runwayAt(s);
    return [x + side * distance * RUNWAY_COS, z + side * distance * RUNWAY_SIN];
  };
  // 斜角跑道底层浅灰漆带：给所有白色标线提供连续附着面，同时形成真实跑道底色。
  // 用 cv_runway（比甲板浅一档）而不是甲板板材质——俯视时能一眼认出是斜跑道。
  const underlay = runwayAt(RUNWAY_LEN / 2);
  add({
    id: `${P}runway_underlay`,
    name_cn: "斜角着舰跑道底色",
    name_en: "angled runway underlay",
    assembly: ASSEMBLY,
    build_layer: 4,
    geometry: M(B(3.0, 0.004, RUNWAY_LEN + 0.5, [0, 0, 0], 0.0015)),
    material: "cv_runway",
    mate: A([underlay[0], deckTop + 0.006, underlay[1]], [0, RUNWAY_YAW, 0]),
  });
  // 中线虚线：沿跑道纵向等距 1.22，22 段从头到尾严格一条直线。
  for (let d = 0; d < 20; d++) {
    const [x, z] = runwayAt(0.75 + d * 1.22);
    add({
      id: `${P}runway_center_${pad(d + 1)}`,
      name_cn: `斜角跑道中线 ${d + 1}`,
      name_en: `angled runway centerline ${d + 1}`,
      assembly: ASSEMBLY,
      build_layer: 4,
      geometry: M(B(0.14, 0.006, 0.7, [0, 0, 0], 0.002)),
      material: "cv_deck_line",
      mate: A([x, markY + 0.004, z], [0, RUNWAY_YAW, 0]),
    });
  }
  // 跑道两侧边线：9 段实线沿跑道横向 ±1.35，与中线同角度。
  for (const side of [-1, 1] as const) {
    for (let s = 0; s < 8; s++) {
      const [x, z] = runwayAcross(2.25 + s * 3.0, side, 1.3);
      add({
        id: `${P}runway_edge_${side === -1 ? "p" : "s"}_${pad(s + 1)}`,
        name_cn: `斜角跑道${side === -1 ? "左" : "右"}边线 ${s + 1}`,
        name_en: `angled runway edge ${side === -1 ? "p" : "s"} ${s + 1}`,
        assembly: ASSEMBLY,
        build_layer: 4,
        geometry: M(B(0.14, 0.006, 2.5, [0, 0, 0], 0.0015)),
        material: "cv_deck_line",
        mate: A([x, markY + 0.004, z], [0, RUNWAY_YAW, 0]),
      });
    }
  }
  // 着舰区“钢琴键”：8 根纵向条带横跨跑道，全部按跑道角度排齐。
  for (let bar = 0; bar < 8; bar++) {
    const [x, z] = runwayAcross(2.4, 1, -1.36 + bar * 0.3886);
    add({
      id: `${P}runway_threshold_${pad(bar + 1)}`,
      name_cn: `着舰区钢琴键 ${bar + 1}`,
      name_en: `landing threshold piano key ${bar + 1}`,
      assembly: ASSEMBLY,
      build_layer: 4,
      geometry: M(B(0.16, 0.006, 1.1, [0, 0, 0], 0.0015)),
      material: "cv_deck_line",
      mate: A([x, markY + 0.005, z], [0, RUNWAY_YAW, 0]),
    });
  }
  // 接地点：两列 × 三排，沿跑道横向 ±0.58。
  for (let row = 0; row < 3; row++) {
    for (const side of [-1, 1] as const) {
      const [x, z] = runwayAcross(8.2 + row * 1.4, side, 0.58);
      add({
        id: `${P}runway_touchdown_${pad(row * 2 + (side === -1 ? 1 : 2))}`,
        name_cn: `着舰接地点标记 ${row * 2 + (side === -1 ? 1 : 2)}`,
        name_en: `touchdown mark ${row * 2 + (side === -1 ? 1 : 2)}`,
        assembly: ASSEMBLY,
        build_layer: 4,
        geometry: M(B(0.42, 0.006, 0.16, [0, 0, 0], 0.0015)),
        material: "cv_deck_line",
        mate: A([x, markY + 0.005, z], [0, RUNWAY_YAW, 0]),
      });
    }
  }
  for (const [tag, s] of [["aft", 0.35], ["fwd", RUNWAY_LEN - 0.35]] as const) {
    const [cx, cz] = runwayAt(s);
    add({
      id: `${P}runway_end_${tag}`,
      name_cn: `斜角跑道端线 ${tag === "aft" ? "艉" : "艏"}`,
      name_en: `angled runway end ${tag}`,
      assembly: ASSEMBLY,
      build_layer: 4,
      geometry: M(B(2.8, 0.006, 0.12, [0, 0, 0], 0.0015)),
      material: "cv_deck_line",
      mate: A([cx, markY + 0.006, cz], [0, RUNWAY_YAW, 0]),
    });
  }
  // 舰艏直通起飞区：一整条浅灰跑道底色 + 两条弹射轨 + 中线 + 起飞位横线，
  // 俯视时与左侧 9.3° 斜角着舰跑道形成清晰的“直通 + 斜角”双跑道。
  add({
    id: `${P}launch_runway`,
    name_cn: "舰艏直通起飞跑道",
    name_en: "bow launch runway",
    assembly: ASSEMBLY,
    build_layer: 4,
    geometry: M(B(3.4, 0.004, 9.2, [0, 0, 0], 0.0015)),
    material: "cv_runway",
    mate: A([0, deckTop + 0.005, 12.4]),
  });
  for (const side of [-1, 1] as const) {
    add({
      id: `${P}launch_edge_${side === -1 ? "p" : "s"}`,
      name_cn: `直通起飞跑道${side === -1 ? "左" : "右"}边线`,
      name_en: `bow launch edge ${side === -1 ? "p" : "s"}`,
      assembly: ASSEMBLY,
      build_layer: 4,
      geometry: M(B(0.12, 0.004, 8.6, [0, 0, 0], 0.0015)),
      material: "cv_deck_line",
      mate: A([side * 1.62, markY, 12.6]),
    });
  }
  for (let d = 0; d < 10; d++) {
    add({
      id: `${P}launch_center_${pad(d + 1)}`,
      name_cn: `舰艏起飞区中线 ${d + 1}`,
      name_en: `bow launch centerline ${d + 1}`,
      assembly: ASSEMBLY,
      build_layer: 4,
      geometry: M(B(0.11, 0.004, 0.55, [0, 0, 0], 0.0015)),
      material: "cv_deck_line",
      mate: A([0, markY, 8.2 + d * 0.92]),
    });
  }
  add({
    id: `${P}launch_threshold`,
    name_cn: "舰艏起飞位横线",
    name_en: "bow launch threshold",
    assembly: ASSEMBLY,
    build_layer: 4,
    geometry: M(B(3.6, 0.004, 0.12, [0, 0, 0], 0.0015)),
    material: "cv_deck_line",
    mate: A([0, markY + 0.001, 7.55]),
  });
  // 舰艏甲板舷号“18”：真实福建舰舰艏刷有 18，俯视一眼可辨。
  const bowNumberY = markY + 0.002;
  const deckBar = (id: string, x: number, z: number, w: number, l: number) =>
    add({
      id: `${P}bow_number_${id}`,
      name_cn: `舰艏舷号笔画 ${id}`,
      name_en: `bow hull number stroke ${id}`,
      assembly: ASSEMBLY,
      build_layer: 4,
      geometry: M(B(w, 0.004, l, [0, 0, 0], 0.0015)),
      material: "cv_deck_line",
      mate: A([x, bowNumberY, z]),
    });
  deckBar("1_stem", -0.82, 18.1, 0.28, 2.45);
  deckBar("1_base", -0.78, 16.95, 0.92, 0.22);
  deckBar("8_top", 0.68, 19.12, 1.12, 0.22);
  deckBar("8_mid", 0.68, 18.1, 1.12, 0.22);
  deckBar("8_bot", 0.68, 17.08, 1.12, 0.22);
  deckBar("8_left_up", 0.23, 18.62, 0.22, 0.86);
  deckBar("8_left_lo", 0.23, 17.58, 0.22, 0.86);
  deckBar("8_right_up", 1.13, 18.62, 0.22, 0.86);
  deckBar("8_right_lo", 1.13, 17.58, 0.22, 0.86);
  // 甲板使用痕迹：着舰轮胎擦痕（两列）、停机位油污、挡焰板烧蚀。
  for (const side of [-1, 1] as const) {
    for (let t = 0; t < 11; t++) {
      const [x, z] = runwayAcross(4.4 + t * 0.85, side, 0.62);
      add({
        id: `${P}tire_streak_${side === -1 ? "l" : "r"}_${pad(t + 1)}`,
        name_cn: `着舰轮胎擦痕 ${side === -1 ? "左" : "右"} ${t + 1}`,
        name_en: `landing tire streak ${side === -1 ? "l" : "r"} ${t + 1}`,
        assembly: ASSEMBLY,
        build_layer: 4,
        geometry: M(B(0.085, 0.003, 0.5 + (t % 3) * 0.12, [0, 0, 0], 0.001)),
        material: "cv_deck_wear",
        mate: A([x, markY + 0.002, z], [0, RUNWAY_YAW, 0]),
      });
    }
  }
  const oilSpots: Array<[number, number, number]> = [
    [2.2, -15.8, 0.26], [-2.4, -11.5, 0.24], [-2.4, -14.4, 0.24], [-2.0, -16.8, 0.24],
    [1.2, 4.0, 0.18], [0.4, 8.0, 0.18], [-3.0, 2.0, 0.18], [0.8, -2.0, 0.16],
  ];
  oilSpots.forEach(([x, z, r], index) => {
    add({
      id: `${P}oil_stain_${pad(index + 1)}`,
      name_cn: `甲板油污 ${index + 1}`,
      name_en: `deck oil stain ${index + 1}`,
      assembly: ASSEMBLY,
      build_layer: 4,
      geometry: M(C(r, 0.002, [0, 0, 0], 20), C(r * 0.45, 0.002, [r * 0.5, 0, r * 0.35], 14)),
      material: "cv_deck_wear",
      mate: A([x, deckTop + 0.009, z]),
    });
  });
  CAT_TRACKS.forEach((track, index) => {
    add({
      id: `${P}jbd_scorch_${index + 1}`,
      name_cn: `挡焰板烧蚀区 ${index + 1}`,
      name_en: `JBD scorch mark ${index + 1}`,
      assembly: ASSEMBLY,
      build_layer: 4,
      geometry: M(B(1.35, 0.003, 0.95, [0, 0, 0], 0.002)),
      material: "cv_deck_wear",
      mate: A([track.x, markY + 0.001, track.z0 - 4.55]),
    });
  });

  // 直通起飞区：中线 + 两侧边线（黄色）。
  for (let d = 0; d < 10; d++) {
    add({
      id: `${P}takeoff_center_${pad(d + 1)}`,
      name_cn: `起飞区中线 ${d + 1}`,
      name_en: `takeoff centerline ${d + 1}`,
      assembly: ASSEMBLY,
      build_layer: 4,
      geometry: M(B(0.06, 0.006, 0.6, [0, 0, 0], 0.0015)),
      material: "cv_deck_yellow",
      mate: A([0, markY + 0.004, 4.0 + d * 1.2]),
    });
  }
  for (const side of [-1, 1] as const) {
    add({
      id: `${P}takeoff_edge_${side === -1 ? "p" : "s"}`,
      name_cn: `起飞区${side === -1 ? "左" : "右"}边线`,
      name_en: `takeoff edge ${side === -1 ? "p" : "s"}`,
      assembly: ASSEMBLY,
      build_layer: 4,
      geometry: M(B(0.06, 0.006, 6.0, [0, 0, 0], 0.0015)),
      material: "cv_deck_yellow",
      mate: A([side * 1.95, markY + 0.004, 6.0]),
    });
  }
  // 停机位框线 + 编号（七段数字），全部贴在甲板上；避开斜角着舰跑道。
  const parkingSpots: Array<[number, number, number]> = [
    [2.2, -15.8, 1], [-2.4, -11.5, 2], [-2.4, -14.4, 3], [-2.0, -16.8, 4],
  ];
  const digitSegments: Record<string, string[]> = {
    "1": ["b", "c"], "2": ["a", "b", "g", "e", "d"], "3": ["a", "b", "g", "c", "d"],
    "4": ["f", "g", "b", "c"], "5": ["a", "f", "g", "c", "d"], "6": ["a", "f", "g", "e", "c", "d"],
    "7": ["a", "b", "c"], "8": ["a", "b", "c", "d", "e", "f", "g"], "9": ["a", "b", "c", "d", "f", "g"],
  };
  const drawDigit = (digit: string, idPrefix: string, cx: number, cz: number, size = 0.5) => {
    const w = size * 0.5;
    const h = size;
    const t = Math.max(0.035, size * 0.09);
    const segs: Record<string, [number, number, number, number]> = {
      a: [0, h / 2, w, t], g: [0, 0, w, t], d: [0, -h / 2, w, t],
      f: [-w / 2, h / 4, t, h / 2], b: [w / 2, h / 4, t, h / 2],
      e: [-w / 2, -h / 4, t, h / 2], c: [w / 2, -h / 4, t, h / 2],
    };
    for (const s of digitSegments[digit] ?? []) {
      const [dx, dz, sw, sd] = segs[s]!;
      add({
        id: `${P}${idPrefix}_${s}`,
        name_cn: `停机位编号 ${digit}`,
        name_en: `parking number ${digit}`,
        assembly: ASSEMBLY,
        build_layer: 4,
        geometry: M(B(sw, 0.006, sd, [0, 0, 0], 0.001)),
        material: "cv_deck_yellow",
        mate: A([cx + dx, markY + 0.006, cz + dz]),
      });
    }
  };
  parkingSpots.forEach(([sx, sz, n], index) => {
    const w = 1.2;
    const d = 1.7;
    add({
      id: `${P}parking_box_${pad(index + 1)}`,
      name_cn: `停机位框线 ${n}`,
      name_en: `parking spot box ${n}`,
      assembly: ASSEMBLY,
      build_layer: 4,
      geometry: M(B(w, 0.006, 0.05, [0, 0, 0], 0.0015), B(w, 0.006, 0.05, [0, 0, -d], 0.0015), B(0.05, 0.006, d, [-w / 2, 0, -d / 2], 0.0015), B(0.05, 0.006, d, [w / 2, 0, -d / 2], 0.0015)),
      material: "cv_deck_yellow",
      mate: A([sx, markY + 0.003, sz + d / 2]),
    });
    drawDigit(String(n), `parking_num_${n}`, sx + w / 2 - 0.16, sz + 0.52, 0.36);
  });
  // 甲板外缘线：按新甲板宽度剖面逐段勾边（艏部窄长、舯部外飘、艉部收窄）。
  const portEdge: Array<[number, number]> = [
    [-2.5, -20], [-2.5, -18], [-3.2, -16.5], [-4.2, -15.9],
    [-4.4, -9], [-4.5, -6], [-4.3, -2.7], [-4.8, 4.7], [-4.8, 9],
    [-2.04, 10.7], [-1.55, 20.7],
  ];
  const starboardEdgeSegments: Array<Array<[number, number]>> = [
    [[2.9, -19.4], [3.5, -17.5], [4.68, -15.8], [4.68, -14.52]],
    [[4.68, -11.08], [4.68, 0.28], [4.68, 3.72], [4.68, 6.0]],
    [[4.18, 9.53], [2.4, 11.4], [1.85, 20.7]],
  ];
  const edgeLine = (x0: number, z0: number, x1: number, z1: number, id: string, label: string) => {
    const dx = x1 - x0;
    const dz = z1 - z0;
    add({
      id: `${P}${id}`,
      name_cn: label,
      name_en: label,
      assembly: ASSEMBLY,
      build_layer: 4,
      geometry: M(B(0.08, 0.006, Math.hypot(dx, dz), [0, 0, 0], 0.0015)),
      material: "cv_deck_line",
      mate: A([(x0 + x1) / 2, markY + 0.006, (z0 + z1) / 2], [0, (Math.atan2(dx, dz) * 180) / Math.PI, 0]),
    });
  };
  for (let i = 0; i < portEdge.length - 1; i++) {
    const [x0, z0] = portEdge[i]!;
    const [x1, z1] = portEdge[i + 1]!;
    edgeLine(x0 + 0.05, z0, x1 + 0.05, z1, `deck_edge_port_${i + 1}`, `左舷甲板外缘线 ${i + 1}`);
  }
  starboardEdgeSegments.forEach((seg, segIndex) => {
    for (let i = 0; i < seg.length - 1; i++) {
      const [x0, z0] = seg[i]!;
      const [x1, z1] = seg[i + 1]!;
      edgeLine(x0 - 0.05, z0, x1 - 0.05, z1, `deck_edge_stbd_${segIndex + 1}_${i + 1}`, `右舷甲板外缘线 ${segIndex + 1}-${i + 1}`);
    }
  });

  // 直升机停靠点（圆圈 + H）。
  add({
    id: `${P}helipad_circle`,
    name_cn: "直升机停靠点圆圈",
    name_en: "helipad circle",
    assembly: ASSEMBLY,
    build_layer: 4,
    geometry: M({ type: "torus", radius: 0.58, tube: 0.032, radialSegments: 8, tubularSegments: 32 }),
    material: "cv_deck_line",
    mate: A([-3.2, markY + 0.006, 1.0], [90, 0, 0]),
  });
  add({
    id: `${P}helipad_h`,
    name_cn: "直升机 H 标记",
    name_en: "helipad H",
    assembly: ASSEMBLY,
    build_layer: 4,
    geometry: M(B(0.1, 0.006, 0.66, [0, 0, 0], 0.0015), B(0.1, 0.006, 0.66, [-0.38, 0, 0], 0.0015), B(0.48, 0.006, 0.1, [-0.19, 0, 0], 0.0015)),
    material: "cv_deck_line",
    mate: A([-3.2, markY + 0.007, 1.0]),
  });
  // 舷号 18（舰艏甲板）。
  drawDigit("1", "hull_number_1", -0.95, 17.0, 1.5);
  drawDigit("8", "hull_number_8", 0.75, 17.0, 1.5);
  // 弹射位数字 + 危险区（挡焰板后红黄条 + 艉部危险区）。
  drawDigit("1", "cat_number_1", -1.7, 2.6, 0.42);
  drawDigit("2", "cat_number_2", 1.7, 2.6, 0.42);
  drawDigit("3", "cat_number_3", -3.15, -1.0, 0.42);
  for (const [cx, cz] of [[-1.7, 1.1], [1.7, 1.1], [-3.15, -4.0]] as const) {
    for (let st = 0; st < 5; st++) {
      add({
        id: `${P}danger_${String(cx).replace("-", "m").replace(".", "_")}_${st + 1}`,
        name_cn: `挡焰板危险区 ${st + 1}`,
        name_en: `JBD danger stripe ${st + 1}`,
        assembly: ASSEMBLY,
        build_layer: 4,
        geometry: M(B(2.2 - st * 0.28, 0.006, 0.18, [0, 0, 0], 0.0015)),
        material: st % 2 === 0 ? "cv_deck_red" : "cv_deck_yellow",
        mate: A([cx, markY + 0.005, cz - st * 0.26]),
      });
    }
  }
  for (let st = 0; st < 6; st++) {
    add({
      id: `${P}stern_danger_${st + 1}`,
      name_cn: `艉部危险区 ${st + 1}`,
      name_en: `stern danger stripe ${st + 1}`,
      assembly: ASSEMBLY,
      build_layer: 4,
      geometry: M(B(3.2 - st * 0.22, 0.006, 0.18, [0, 0, 0], 0.0015)),
      material: st % 2 === 0 ? "cv_deck_red" : "cv_deck_yellow",
      mate: A([0, markY + 0.005, -18.7 + st * 0.18]),
    });
  }
  add({
    id: `${P}tiedown`,
    name_cn: "甲板系留点 ×80",
    name_en: "deck tie-downs",
    assembly: ASSEMBLY,
    build_layer: 4,
    geometry: M(T(0.075, 0.045, 0.02, [0, 0, 0], 14)),
    material: "cv_steel",
    mate: A([0, 0, 0]),
    instances: 80,
    indexed: true,
    instance_layout: "carrier.deck.tiedown",
  });
  ctx.layout("carrier.deck.tiedown", ({ index }) => {
    const col = index % 10;
    const row = Math.floor(index / 10);
    return new THREE.Matrix4().makeTranslation(-3.9 + col * 0.86, deckTop + 0.01, -17 + row * 4.2);
  });
  const lightSpots: Array<[number, number]> = [];
  for (let row = 0; row < 9; row++) {
    const z = -13 + row * 2.5;
    for (const side of [-1, 1] as const) {
      const inElevator = CV.ELEVATOR_Z.some((ez) => Math.abs(z - ez) < CV.ELEVATOR_L / 2 + 0.3);
      if (side === 1 && inElevator) continue;
      lightSpots.push([side, z]);
    }
  }
  add({
    id: `${P}deck_light`,
    name_cn: "甲板边灯",
    name_en: "deck edge lights",
    assembly: ASSEMBLY,
    build_layer: 4,
    geometry: M(C(0.045, 0.05, [0, 0, 0], 10), S(0.055, [0, 0.03, 0], 10)),
    material: "cv_glow",
    mate: A([0, 0, 0]),
    instances: lightSpots.length,
    indexed: true,
    instance_layout: "carrier.deck.edgeLight",
  });
  ctx.layout("carrier.deck.edgeLight", ({ index }) => {
    const [side, z] = lightSpots[index]!;
    return new THREE.Matrix4().makeTranslation(side * 4.2, deckTop + 0.02, z);
  });

  // ---- 舷侧外飘封边：整圈连续封边 + 整圈连续底封板 + 外露斜撑 ----
  // 不再逐站放 3.6m 长的盒子——硬角处盒子必然伸出甲板或留缝。
  add({
    id: `${P}sponson_skirt`,
    name_cn: "舷侧外飘封边板（整圈连续）",
    name_en: "continuous sponson sealing skirt",
    assembly: ASSEMBLY,
    build_layer: 3,
    geometry: { type: "kit", kit: "carrierSponsonSkirt" },
    material: "cv_hull",
    mate: A([0, 0, 0]),
    source: "沿飞行甲板折线整圈放样，上缘埋入甲板、下缘与外飘底封板共边。",
  });
  add({
    id: `${P}sponson_bottom`,
    name_cn: "外飘底封板（整圈连续）",
    name_en: "continuous sponson bottom",
    assembly: ASSEMBLY,
    build_layer: 3,
    geometry: { type: "kit", kit: "carrierSponsonBottom" },
    material: "cv_hull_dark",
    mate: A([0, 0, 0]),
    source: "外边界沿甲板折线、内边界沿 4.03m 高度真实外板型线，封死外飘下口。",
  });
  const bracketZ = [-13.5, -10.5, -7.5, -4.5, -1.5, 1.5, 4.5, 7.5];
  for (const side of [-1, 1] as const) {
    for (let i = 0; i < bracketZ.length; i++) {
      const z = bracketZ[i]!;
      const edge = deckEdgeAt(z, side);
      // 左舷有外走道，斜撑从走道上方起；右舷从舷侧低位起。
      const fromY = side === -1 ? 3.9 : 3.55;
      const hullX = hullSurfaceHalfAt(z, fromY);
      add({
        id: `${P}sponson_bracket_${side === -1 ? "p" : "s"}_${pad(i + 1)}`,
        name_cn: `外飘甲板斜撑 ${side === -1 ? "左" : "右"} ${i + 1}`,
        name_en: `sponson bracket ${side === -1 ? "p" : "s"} ${i + 1}`,
        assembly: ASSEMBLY,
        build_layer: 4,
        geometry: M({
          type: "weld",
          from: [side * (hullX - 0.04), fromY, z],
          to: [edge.x - side * 0.17, 4.0, z],
          radius: 0.045,
          seed: 800 + i + side,
        }),
        material: "cv_steel_dark",
        mate: A([0, 0, 0]),
      });
    }
  }

  // ---- 舰艏回收角（山羊角）+ 尼龙网 ----
  for (const side of [-1, 1] as const) {
    add({
      id: `${P}recovery_horn_${side === -1 ? "p" : "s"}`,
      name_cn: `舰艏回收角 ${side === -1 ? "左" : "右"}`,
      name_en: `bow recovery horn ${side === -1 ? "p" : "s"}`,
      assembly: ASSEMBLY,
      build_layer: 3,
      geometry: M({ type: "weld", from: [side * 2.05, deckTop + 0.04, 19.45], to: [side * 2.55, deckTop + 0.08, 21.15], radius: 0.045 }),
      material: "cv_steel",
      mate: A([0, 0, 0]),
    });
    add({
      id: `${P}recovery_horn_brace_${side === -1 ? "p" : "s"}`,
      name_cn: `回收角支撑 ${side === -1 ? "左" : "右"}`,
      name_en: `recovery horn brace ${side === -1 ? "p" : "s"}`,
      assembly: ASSEMBLY,
      build_layer: 3,
      geometry: M({ type: "weld", from: [side * 2.55, deckTop + 0.08, 21.15], to: [side * 0.9, deckTop + 0.06, 18.4], radius: 0.03 }),
      material: "cv_steel",
      mate: A([0, 0, 0]),
    });
  }
  for (let i = 0; i < 4; i++) {
    add({
      id: `${P}recovery_net_bar_${i + 1}`,
      name_cn: `回收角尼龙网横杆 ${i + 1}`,
      name_en: `recovery net bar ${i + 1}`,
      assembly: ASSEMBLY,
      build_layer: 3,
      geometry: M(C(0.012, 4.6, [0, 0, 0], 6)),
      material: "cv_canvas",
      mate: A([0, deckTop + 0.1, 19.8 + i * 0.42], [0, 0, 90]),
    });
  }
  for (let i = 0; i < 8; i++) {
    add({
      id: `${P}recovery_net_line_${i + 1}`,
      name_cn: `回收角尼龙网纵索 ${i + 1}`,
      name_en: `recovery net line ${i + 1}`,
      assembly: ASSEMBLY,
      build_layer: 3,
      geometry: M(C(0.008, 1.6, [0, 0, 0], 6)),
      material: "cv_canvas",
      mate: A([-1.9 + i * 0.55, deckTop + 0.09, 20.5], [90, 0, 0]),
    });
  }

  // ---- 舰艏上翘甲板（真实甲板有轻微上翘/外飘，不是一块平板） ----
  for (let i = 0; i < 2; i++) {
    const z = 19.0 + i * 0.72;
    const width = 2.7 - i * 0.25;
    add({
      id: `${P}bow_ramp_${pad(i + 1)}`,
      name_cn: `舰艏上翘唇口 ${i + 1}`,
      name_en: `bow ramp lip ${i + 1}`,
      assembly: ASSEMBLY,
      build_layer: 3,
      geometry: M(B(width, 0.05, 0.8, [0, 0, 0], 0.004)),
      material: "cv_deck_plate",
      mate: A([0.1, deckTop + 0.035 + i * 0.025, z], [-4 - i * 3, 0, 0]),
    });
  }
  // 舰艏舷墙：沿最后 3 段甲板边缘抬起，侧视能看到舰艏上翘而不是平切方盒。
  const bowEdges: Array<{ tag: string; points: Array<[number, number]> }> = [
    { tag: "p", points: [[-1.7, 18.0], [-1.55, 20.7]] },
    { tag: "s", points: [[1.9, 18.0], [1.85, 20.7]] },
  ];
  for (const edge of bowEdges) {
    for (let i = 0; i < edge.points.length - 1; i++) {
      const [x0, z0] = edge.points[i]!;
      const [x1, z1] = edge.points[i + 1]!;
      const dx = x1 - x0;
      const dz = z1 - z0;
      add({
        id: `${P}bow_bulwark_${edge.tag}_${i + 1}`,
        name_cn: `舰艏舷墙 ${edge.tag.toUpperCase()}-${i + 1}`,
        name_en: `bow bulwark ${edge.tag} ${i + 1}`,
        assembly: ASSEMBLY,
        build_layer: 3,
        geometry: M(B(0.06, 0.34, Math.hypot(dx, dz), [0, 0, 0], 0.004)),
        material: "cv_hull",
        mate: A([(x0 + x1) / 2, deckTop + 0.17 + i * 0.03, (z0 + z1) / 2], [0, (Math.atan2(dx, dz) * 180) / Math.PI, 0]),
      });
    }
  }
  add({
    id: `${P}bow_bulwark_front`,
    name_cn: "舰艏前舷墙",
    name_en: "bow front bulwark",
    assembly: ASSEMBLY,
    build_layer: 3,
    geometry: M(B(3.4, 0.38, 0.07, [0, 0, 0], 0.006)),
    material: "cv_hull",
    mate: A([0.15, deckTop + 0.22, 20.65], [0, 0, 0]),
  });
}
