import * as THREE from "three";
import { CV } from "./constants";
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
  { id: 3, x: -3.15, z0: -1.0, z1: 11.0 },
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
  for (let p = 0; p < 18; p++) {
    const z = -18.5 + p * 2.15;
    add({
      id: `${P}deck_plate_${pad(p + 1)}`,
      name_cn: `甲板装甲板 ${p + 1}`,
      name_en: `deck plate ${p + 1}`,
      assembly: ASSEMBLY,
      build_layer: 3,
      geometry: M(B(8.8, 0.035, 1.9, [0, 0, 0], 0.005)),
      material: "cv_deck_plate",
      mate: A([0, deckTop + 0.018, z]),
    });
  }
  // 防滑砂条：沿甲板横向排布，和装甲板贴合。
  for (let p = 0; p < 24; p++) {
    add({
      id: `${P}antislip_${pad(p + 1)}`,
      name_cn: `防滑涂层条 ${p + 1}`,
      name_en: `antislip strip ${p + 1}`,
      assembly: ASSEMBLY,
      build_layer: 3,
      geometry: M(B(8.4, 0.008, 0.11, [0, 0, 0], 0.002)),
      material: "cv_deck",
      mate: A([0, deckTop + 0.04, -19 + p * 1.65]),
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
        geometry: M(B(0.44, 0.06, segLen + 0.02, [0, 0, 0], 0.006), B(0.5, 0.025, segLen + 0.05, [0, -0.03, 0], 0.004)),
        material: "cv_steel_dark",
        mate: A([track.x, deckTop + 0.075, z]),
      });
      add({
        id: `${P}cat_${tag}_coil_${pad(s + 1)}`,
        name_cn: `弹射器 ${track.id} 定子线圈 ${s + 1}`,
        name_en: `catapult ${track.id} coil ${s + 1}`,
        assembly: ASSEMBLY,
        build_layer: 3,
        geometry: M(C(0.08, 0.32, [0, 0, 0], 12), C(0.06, 0.1, [0, 0.04, 0], 10)),
        material: "cv_copper",
        mate: A([track.x + 0.42, deckTop + 0.03, z], [0, 0, 90]),
      });
      add({
        id: `${P}cat_${tag}_cooling_${pad(s + 1)}`,
        name_cn: `弹射器 ${track.id} 水冷板 ${s + 1}`,
        name_en: `catapult ${track.id} cooling plate ${s + 1}`,
        assembly: ASSEMBLY,
        build_layer: 3,
        geometry: M(B(0.12, 0.022, segLen + 0.02, [0, 0, 0], 0.003)),
        material: "cv_steel",
        mate: A([track.x - 0.27, deckTop + 0.09, z]),
      });
    }
    // 轨道两侧盖板/端部缓冲。
    for (const side of [-1, 1] as const) {
      add({
        id: `${P}cat_${tag}_rail_${side === -1 ? "l" : "r"}`,
        name_cn: `弹射器 ${track.id} 导轨盖板 ${side === -1 ? "左" : "右"}`,
        name_en: `catapult ${track.id} rail cover ${side === -1 ? "l" : "r"}`,
        assembly: ASSEMBLY,
        build_layer: 3,
        geometry: M(B(0.05, 0.05, track.z1 - track.z0, [0, 0, 0], 0.004)),
        material: "cv_steel",
        mate: A([track.x + side * 0.31, deckTop + 0.09, (track.z0 + track.z1) / 2]),
      });
    }
    add({
      id: `${P}cat_${tag}_end_stop`,
      name_cn: `弹射器 ${track.id} 末端缓冲`,
      name_en: `catapult ${track.id} end stop`,
      assembly: ASSEMBLY,
      build_layer: 3,
      geometry: M(B(0.5, 0.12, 0.22, [0, 0, 0], 0.01), C(0.07, 0.1, [0, 0, 0], 12)),
      material: "cv_steel_dark",
      mate: A([track.x, deckTop + 0.15, track.z1 + 0.12]),
    });
  }
  // 挡焰板：铰接节点，待机平放，弹射时竖起。
  CAT_TRACKS.forEach((track, index) => {
    const node = JBD_NODES[index]!;
    const z = track.z0 - 1.65;
    ctx.node({ name: node, parent: "root", pivot: [track.x, deckTop + 0.05, z], motion: "rotate", axis: "x", note: `弹射器 ${track.id} 挡焰板` });
    add({
      id: `${P}cat_${pad(track.id)}_jbd_panel`,
      name_cn: `弹射器 ${track.id} 挡焰板`,
      name_en: `jet blast deflector ${track.id}`,
      assembly: ASSEMBLY,
      build_layer: 3,
      geometry: M(B(1.08, 0.92, 0.07, [0, 0.46, 0], 0.01), B(0.96, 0.035, 0.04, [0, 0.2, 0.045], 0.004)),
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
  ctx.node({ name: SHUTTLE_NODE, parent: "root", pivot: [CV.CAT_X, deckTop + 0.1, CV.CAT_Z0], motion: "translate", axis: "z", note: "电磁弹射滑梭" });
  add({
    id: `${P}shuttle_body`,
    name_cn: "弹射滑梭",
    name_en: "catapult shuttle",
    assembly: ASSEMBLY,
    build_layer: 3,
    geometry: M(B(0.34, 0.12, 0.38, [0, 0, 0], 0.01), B(0.12, 0.08, 0.2, [0, 0.1, -0.08], 0.006), C(0.04, 0.24, [0, -0.03, 0.12], 10)),
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
  // 弹射储能/变频：甲板下方，靠近弹射器后端。
  for (let e = 0; e < 3; e++) {
    add({
      id: `${P}cat_${pad(e + 1)}_flywheel`,
      name_cn: `弹射器 ${e + 1} 飞轮储能`,
      name_en: `catapult flywheel ${e + 1}`,
      assembly: ASSEMBLY,
      build_layer: 3,
      geometry: M(C(0.42, 0.16, [0, 0, 0], 24), C(0.1, 0.3, [0, 0, 0], 14)),
      material: "cv_steel",
      mate: A([CAT_TRACKS[e]!.x, CV.HANGAR_Y + 0.7, 1.2 + e * 1.6], [0, 0, 90]),
    });
    add({
      id: `${P}cat_${pad(e + 1)}_converter`,
      name_cn: `弹射器 ${e + 1} 变频器`,
      name_en: `catapult converter ${e + 1}`,
      assembly: ASSEMBLY,
      build_layer: 3,
      geometry: M(B(0.8, 1.0, 0.4, [0, 0, 0], 0.01), B(0.6, 0.1, 0.02, [0, 0.35, 0.21], 0.004)),
      material: "cv_steel_dark",
      mate: A([CAT_TRACKS[e]!.x, CV.HANGAR_Y + 0.55, -0.2 + e * 1.4]),
    });
    add({
      id: `${P}cat_${pad(e + 1)}_capacitors`,
      name_cn: `弹射器 ${e + 1} 电容组`,
      name_en: `catapult capacitor bank ${e + 1}`,
      assembly: ASSEMBLY,
      build_layer: 3,
      geometry: M(C(0.12, 0.42, [0, 0, 0], 16), C(0.13, 0.03, [0, 0.22, 0], 16)),
      material: "cv_copper",
      mate: A([CAT_TRACKS[e]!.x, CV.HANGAR_Y + 0.35, 2.2 + e * 1.0]),
      instances: 6,
      indexed: true,
      instance_layout: `carrier.deck.capacitor${e + 1}`,
    });
  }
  for (let e = 0; e < 3; e++) {
    ctx.layout(`carrier.deck.capacitor${e + 1}`, ({ index }) => {
      const col = index % 3;
      const row = Math.floor(index / 3);
      return new THREE.Matrix4().makeTranslation((col - 1) * 0.3, row * 0.3, 0);
    });
  }

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
  add({
    id: `${P}arrestor_net_post_l`,
    name_cn: "拦阻网左支柱",
    name_en: "barrier net post left",
    assembly: ASSEMBLY,
    build_layer: 3,
    geometry: M(C(0.08, 1.1, [0, 0, 0], 12), B(0.25, 0.1, 0.25, [0, -0.55, 0], 0.008)),
    material: "cv_steel_dark",
    mate: A([-3.8, deckTop + 0.55, -19.2]),
  });
  add({
    id: `${P}arrestor_net_post_r`,
    name_cn: "拦阻网右支柱",
    name_en: "barrier net post right",
    assembly: ASSEMBLY,
    build_layer: 3,
    geometry: M(C(0.08, 1.1, [0, 0, 0], 12), B(0.25, 0.1, 0.25, [0, -0.55, 0], 0.008)),
    material: "cv_steel_dark",
    mate: A([3.8, deckTop + 0.55, -19.2]),
  });
  add({
    id: `${P}arrestor_net`,
    name_cn: "拦阻网",
    name_en: "barrier net",
    assembly: ASSEMBLY,
    build_layer: 3,
    geometry: M(B(7.5, 1.0, 0.05, [0, 0, 0], 0.006)),
    material: "cv_canvas",
    mate: A([0, deckTop + 0.55, -19.2]),
  });

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
      geometry: M(B(CV.ELEVATOR_W, 0.12, CV.ELEVATOR_L, [0, 0, 0], 0.008), B(CV.ELEVATOR_W - 0.12, 0.03, CV.ELEVATOR_L - 0.12, [0, 0.07, 0], 0.004)),
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
      geometry: M(B(CV.ELEVATOR_W + 0.08, 0.16, 0.12, [0, -0.05, CV.ELEVATOR_L / 2], 0.006), B(CV.ELEVATOR_W + 0.08, 0.16, 0.12, [0, -0.05, -CV.ELEVATOR_L / 2], 0.006), B(0.12, 0.16, CV.ELEVATOR_L, [-CV.ELEVATOR_W / 2, -0.05, 0], 0.006)),
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
        mate: A([w % 2 === 0 ? -CV.ELEVATOR_W / 2 - 0.05 : CV.ELEVATOR_W / 2 + 0.05, -0.08, -1.0 + Math.floor(w / 2) * 1.0], [0, 0, 90]),
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
        geometry: M(C(0.11, 1.9, [0, 0, 0], 18), C(0.045, 1.2, [0, 0.8, 0], 12)),
        material: "cv_steel",
        mate: A([CV.ELEVATOR_X + side * 0.75, CV.HANGAR_Y + 1.1, z - CV.ELEVATOR_L / 2 - 0.2]),
      });
    }
  });

  // ---- 甲板标记与系留点 ----
  for (let d = 0; d < 20; d++) {
    add({
      id: `${P}marking_center_${pad(d + 1)}`,
      name_cn: `跑道中线 ${d + 1}`,
      name_en: `centerline dash ${d + 1}`,
      assembly: ASSEMBLY,
      build_layer: 4,
      geometry: M(B(0.12, 0.006, 1.0, [0, 0, 0], 0.002)),
      material: "cv_deck_line",
      mate: A([-0.2, deckTop + 0.048, -18 + d * 1.8]),
    });
  }
  for (let d = 0; d < 12; d++) {
    add({
      id: `${P}marking_cat_${pad(d + 1)}`,
      name_cn: `弹射位标线 ${d + 1}`,
      name_en: `catapult marking ${d + 1}`,
      assembly: ASSEMBLY,
      build_layer: 4,
      geometry: M(B(0.06, 0.006, 0.5, [0, 0, 0], 0.002)),
      material: "cv_deck_yellow",
      mate: A([d % 2 === 0 ? -1.9 : 1.5, deckTop + 0.049, 2.8 + Math.floor(d / 2) * 2.4]),
    });
  }
  add({
    id: `${P}marking_landing_box`,
    name_cn: "着舰区标线框",
    name_en: "landing area box",
    assembly: ASSEMBLY,
    build_layer: 4,
    geometry: M(B(4.8, 0.006, 0.1, [0, 0, 0], 0.002), B(4.8, 0.006, 0.1, [0, 0, -6.8], 0.002), B(0.1, 0.006, 6.9, [-2.4, 0, -3.4], 0.002), B(0.1, 0.006, 6.9, [2.4, 0, -3.4], 0.002)),
    material: "cv_deck_line",
    mate: A([0, deckTop + 0.05, -6.4]),
  });
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
  add({
    id: `${P}deck_light`,
    name_cn: "甲板边灯 ×28",
    name_en: "deck edge lights",
    assembly: ASSEMBLY,
    build_layer: 4,
    geometry: M(C(0.045, 0.05, [0, 0, 0], 10), S(0.055, [0, 0.03, 0], 10)),
    material: "cv_glow",
    mate: A([0, 0, 0]),
    instances: 28,
    indexed: true,
    instance_layout: "carrier.deck.edgeLight",
  });
  ctx.layout("carrier.deck.edgeLight", ({ index }) => {
    const side = index % 2 === 0 ? -1 : 1;
    const row = Math.floor(index / 2);
    return new THREE.Matrix4().makeTranslation(side * 4.55, deckTop + 0.02, -18 + row * 2.6);
  });
}
