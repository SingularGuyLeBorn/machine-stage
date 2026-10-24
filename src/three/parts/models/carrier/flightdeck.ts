import * as THREE from "three";
import { CAT_TRACKS, CV, carrierJbdOffset, catAcross, catPoint } from "./constants";
import { deckEdgeAt, deckPlan, hullSurfaceHalfAt } from "./kits";
import { LANDING_RUNWAY, LANDING_RUNWAY_POLYGON, TAKEOFF_RUNWAY_POLYGON } from "./runwayPlan";
import { A, B, C, M, S, T, pad, type CarrierCtx } from "./common";
import type { GeometrySpec } from "../../registry/types";

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

export function addFlightDeck(ctx: CarrierCtx): void {
  const add = (part: Parameters<CarrierCtx["add"]>[0]) => ctx.add(part);
  const P = "carrier.deck.";
  const deckTop = CV.DECK_Y + CV.DECK_T;

  add({
    id: `${P}flight_deck`,
    name_cn: "飞行甲板基层（水密）",
    name_en: "flight deck base",
    assembly: ASSEMBLY,
    build_layer: 3,
    geometry: { type: "kit", kit: "carrierFlightDeck" },
    material: "cv_deck_plate",
    mate: A([0, 0, 0]),
    source: "1:8 展示尺度；连续水密基层顶面 y=4.57，上面分块铺装甲板，板缝露出深色基层。",
  });
  add({
    id: `${P}deck_underside`,
    name_cn: "飞行甲板基层底面",
    name_en: "flight deck underside",
    assembly: ASSEMBLY,
    build_layer: 3,
    geometry: { type: "kit", kit: "carrierDeckUnderside" },
    material: "cv_hull_dark",
    mate: A([0, 0, 0]),
    source: "整片封住甲板底面，仰视时不再透出船体内部。",
  });
  // ---- 飞行甲板装甲板：沿真实甲板折线按 z 带 + 横向列切块 ----
  // 不是一整块板：每块装甲板独立成件，板缝（约 0.012 编辑单位）露出下面的深色水密基层。
  const armorJoint = 0.022;
  const armorTop = deckTop;
  const armorThickness = 0.02;
  const outline = deckPlan();
  const zVertices = [...new Set(outline.map(([, z]) => z))].sort((a, b) => a - b);
  const zLines: number[] = [zVertices[0]!];
  for (let i = 1; i < zVertices.length; i++) {
    const z0 = zVertices[i - 1]!;
    const z1 = zVertices[i]!;
    const parts = Math.max(1, Math.ceil((z1 - z0) / 3.4));
    for (let k = 1; k <= parts; k++) zLines.push(z0 + ((z1 - z0) * k) / parts);
  }
  for (let zi = 0; zi < zLines.length - 1; zi++) {
    const rawZ0 = zLines[zi]!;
    const rawZ1 = zLines[zi + 1]!;
    if (rawZ1 - rawZ0 < 0.1) continue;
    const z0 = zi === 0 ? rawZ0 : rawZ0 + armorJoint / 2;
    const z1 = zi === zLines.length - 2 ? rawZ1 : rawZ1 - armorJoint / 2;
    const port0 = deckEdgeAt(z0, -1).x;
    const star0 = deckEdgeAt(z0, 1).x;
    const port1 = deckEdgeAt(z1, -1).x;
    const star1 = deckEdgeAt(z1, 1).x;
    if (star0 - port0 < 0.12 || star1 - port1 < 0.12) continue;
    const width = ((star0 - port0) + (star1 - port1)) / 2;
    const cols = width > 4.2 ? 3 : 2;
    // 横向板缝逐带错位，避免所有纵缝从头到尾一条直线，像一整块大板。
    const stagger = (zi % 2 === 0 ? 1 : -1) * 0.035;
    for (let col = 0; col < cols; col++) {
      const t0 = col === 0 ? 0 : col / cols + stagger;
      const t1 = col === cols - 1 ? 1 : (col + 1) / cols + stagger;
      const xl0 = port0 + (star0 - port0) * t0 + (col === 0 ? 0 : armorJoint / 2);
      const xl1 = port1 + (star1 - port1) * t0 + (col === 0 ? 0 : armorJoint / 2);
      const xr0 = port0 + (star0 - port0) * t1 - (col === cols - 1 ? 0 : armorJoint / 2);
      const xr1 = port1 + (star1 - port1) * t1 - (col === cols - 1 ? 0 : armorJoint / 2);
      if (xr0 - xl0 < 0.1 || xr1 - xl1 < 0.1) continue;
      // 顺时针折线，和 deckPlan 的绕序一致。
      const points: Array<[number, number]> = [
        [xl0, z0],
        [xl1, z1],
        [xr1, z1],
        [xr0, z0],
      ];
      const zone = (z0 + z1) / 2 > 10 ? "艏" : (z0 + z1) / 2 > 2 ? "前" : (z0 + z1) / 2 > -8 ? "中" : (z0 + z1) / 2 > -16 ? "后" : "艉";
      const band = col === 0 ? "左" : col === cols - 1 ? "右" : "中";
      add({
        id: `${P}deck_armor_${pad(zi + 1)}_${pad(col + 1)}`,
        name_cn: `飞行甲板装甲板 ${zone}${band} ${zi + 1}-${col + 1}`,
        name_en: `flight deck armor plate ${zi + 1}-${col + 1}`,
        assembly: ASSEMBLY,
        build_layer: 3,
        geometry: { type: "kit", kit: "carrierDeckArmorPlate", params: { points, topY: armorTop, thickness: armorThickness } },
        material: (zi + col) % 2 === 0 ? "cv_deck" : "cv_deck_panel",
        mate: A([0, 0, 0]),
        source: "按甲板真实折线与横向分列切块；板缝 0.022，露出水密基层，非整块甲板。",
      });
    }
  }

  // ---- 电磁弹射器 ×3：三条轨道等长，舰艏两条内收 1.5°，腰部三号与斜角跑道平行 ----
  for (const track of CAT_TRACKS) {
    const tag = pad(track.id);
    const yaw = track.yawDeg;
    const length = track.length;
    const mid = catPoint(track, length / 2);
    const segLen = length / CV.CAT_SEGMENTS;
    for (let s = 0; s < CV.CAT_SEGMENTS; s++) {
      const p = catPoint(track, segLen * (s + 0.5));
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
        mate: A([p.x, deckTop + 0.026, p.z], [0, yaw, 0]),
      });
      add({
        id: `${P}cat_${tag}_coil_${pad(s + 1)}`,
        name_cn: `弹射器 ${track.id} 铜导体轨 ${s + 1}`,
        name_en: `catapult ${track.id} conductor rail ${s + 1}`,
        assembly: ASSEMBLY,
        build_layer: 3,
        geometry: M(B(0.04, 0.024, segLen * 0.92, [-0.235, 0, 0], 0.002), B(0.04, 0.024, segLen * 0.92, [0.235, 0, 0], 0.002)),
        material: "cv_copper",
        mate: A([p.x, deckTop + 0.044, p.z], [0, yaw, 0]),
      });
      add({
        id: `${P}cat_${tag}_cooling_${pad(s + 1)}`,
        name_cn: `弹射器 ${track.id} 水冷管槽 ${s + 1}`,
        name_en: `catapult ${track.id} cooling duct ${s + 1}`,
        assembly: ASSEMBLY,
        build_layer: 3,
        geometry: M(B(0.06, 0.04, segLen * 0.96, [-0.305, 0, 0], 0.003), B(0.06, 0.04, segLen * 0.96, [0.305, 0, 0], 0.003)),
        material: "cv_steel",
        mate: A([p.x, deckTop + 0.022, p.z], [0, yaw, 0]),
      });
    }
    add({
      id: `${P}cat_${tag}_center_rail`,
      name_cn: `弹射器 ${track.id} 中心铜轨`,
      name_en: `catapult ${track.id} center conductor`,
      assembly: ASSEMBLY,
      build_layer: 3,
      geometry: M(B(0.05, 0.024, length - 0.1, [0, 0, 0], 0.002)),
      material: "cv_copper",
      mate: A([mid.x, deckTop + 0.04, mid.z], [0, yaw, 0]),
    });
    for (const side of [-1, 1] as const) {
      const lane = catAcross(track, length / 2, side * 0.43);
      add({
        id: `${P}cat_${tag}_lane_${side === -1 ? "l" : "r"}`,
        name_cn: `弹射器 ${track.id} 车道边线 ${side === -1 ? "左" : "右"}`,
        name_en: `catapult ${track.id} lane edge ${side === -1 ? "l" : "r"}`,
        assembly: ASSEMBLY,
        build_layer: 4,
        geometry: M(B(0.035, 0.004, length, [0, 0, 0], 0.001)),
        material: "cv_deck_line",
        mate: A([lane.x, deckTop + 0.012, lane.z], [0, yaw, 0]),
      });
    }
    add({
      id: `${P}cat_${tag}_end_marks`,
      name_cn: `弹射器 ${track.id} 起止横线`,
      name_en: `catapult ${track.id} end marks`,
      assembly: ASSEMBLY,
      build_layer: 4,
      geometry: M(
        B(0.9, 0.004, 0.08, [0, 0, -length / 2 - 0.18], 0.001),
        B(0.9, 0.004, 0.08, [0, 0, length / 2 + 0.18], 0.001),
      ),
      material: "cv_deck_line",
      mate: A([mid.x, deckTop + 0.013, mid.z], [0, yaw, 0]),
    });
    for (const side of [-1, 1] as const) {
      const rail = catAcross(track, length / 2, side * 0.355);
      add({
        id: `${P}cat_${tag}_rail_${side === -1 ? "l" : "r"}`,
        name_cn: `弹射器 ${track.id} 导轨盖板 ${side === -1 ? "左" : "右"}`,
        name_en: `catapult ${track.id} rail cover ${side === -1 ? "l" : "r"}`,
        assembly: ASSEMBLY,
        build_layer: 3,
        geometry: M(B(0.06, 0.018, length, [0, 0, 0], 0.003)),
        material: "cv_steel",
        mate: A([rail.x, deckTop + 0.01, rail.z], [0, yaw, 0]),
      });
    }
    const end = catPoint(track, length + 0.12);
    add({
      id: `${P}cat_${tag}_end_stop`,
      name_cn: `弹射器 ${track.id} 末端缓冲`,
      name_en: `catapult ${track.id} end stop`,
      assembly: ASSEMBLY,
      build_layer: 3,
      geometry: M(B(0.5, 0.12, 0.22, [0, 0.06, 0], 0.01), C(0.07, 0.1, [0, 0.07, 0], 12)),
      material: "cv_steel_dark",
      mate: A([end.x, deckTop, end.z], [0, yaw, 0]),
    });
  }
  // 弹射位编号：放在各自轨道起点外侧，随轨道角度旋转。
  const digitDefs: Record<string, Array<[number, number, number, number]>> = {
    "1": [[0.05, 0.34, 0.0, 0.0], [0.18, 0.05, -0.03, -0.17]],
    "2": [[0.26, 0.05, 0, 0.2], [0.05, 0.16, 0.1, 0.12], [0.26, 0.05, 0, 0], [0.05, 0.16, -0.1, -0.12], [0.26, 0.05, 0, -0.2]],
    "3": [[0.26, 0.05, 0, 0.2], [0.05, 0.16, 0.1, 0.12], [0.26, 0.05, 0, 0], [0.05, 0.16, 0.1, -0.12], [0.26, 0.05, 0, -0.2]],
  };
  CAT_TRACKS.forEach((track) => {
    const digit = String(track.id);
    const spot = catAcross(track, -1.2, track.id === 3 ? -0.6 : track.id === 1 ? -0.9 : 0.9);
    const bars = digitDefs[digit]!.map(([w, h, dx, dz]) => B(w * 1.5, 0.012, h * 1.5, [dx * 1.5, 0, dz * 1.5], 0.002));
    add({
      id: `${P}cat_number_${digit}`,
      name_cn: `弹射位编号 ${digit}`,
      name_en: `catapult number ${digit}`,
      assembly: ASSEMBLY,
      build_layer: 4,
      geometry: M(...bars),
      material: "cv_deck_yellow",
      mate: A([spot.x, deckTop + 0.02, spot.z], [0, track.yawDeg, 0]),
    });
  });

  // 挡焰板：铰接节点，待机平放，弹射时竖起。外层对齐节点带轨道偏航，
  // 让铰链轴始终横跨轨道；挡焰板整体放在轨道起点后方 3.2，避开着舰跑道。
  CAT_TRACKS.forEach((track, index) => {
    const node = JBD_NODES[index]!;
    const pos = catPoint(track, carrierJbdOffset(track.id));
    const align = `CV_JBD_Align_${track.id}`;
    ctx.node({ name: align, parent: "root", pivot: [pos.x, deckTop + 0.05, pos.z], rest_rotation: [0, track.yawDeg, 0] });
    ctx.node({ name: node, parent: align, pivot: [0, 0, 0], motion: "rotate", axis: "x", rest_rotation: [-90, 0, 0], note: `弹射器 ${track.id} 挡焰板` });
    // 用户 JSON 的舰艏挡焰板宽约 1.0 编辑单位；三号腰部挡焰板仍保留 1.5。
    const w = track.id === 3 ? 1.5 : 0.98;
    const k = w / 1.5;
    add({
      id: `${P}cat_${pad(track.id)}_jbd_panel`,
      name_cn: `弹射器 ${track.id} 挡焰板`,
      name_en: `jet blast deflector ${track.id}`,
      assembly: ASSEMBLY,
      build_layer: 3,
      geometry: M(
        B(w, 0.62, 0.055, [0, 0.31, 0], 0.008),
        B(w - 0.1, 0.028, 0.035, [0, 0.12, 0.035], 0.003),
        B(w - 0.08, 0.032, 0.05, [0, 0.3, 0.04], 0.003),
        B(w - 0.08, 0.032, 0.05, [0, 0.48, 0.04], 0.003),
        B(0.045, 0.56, 0.045, [-0.58 * k, 0.32, 0.042], 0.003),
        B(0.045, 0.56, 0.045, [0.58 * k, 0.32, 0.042], 0.003),
        B(w - 0.06, 0.06, 0.06, [0, 0.028, 0.018], 0.003),
        B(0.08, 0.09, 0.09, [-0.52 * k, 0.025, 0.018], 0.003),
        B(0.08, 0.09, 0.09, [0.52 * k, 0.025, 0.018], 0.003),
        B(w * 0.6, 0.05, 0.05, [0, 0.02, -0.01], 0.004),
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
      mate: A([0.38 * k, 0.16, -0.06], [0, 0, 25]),
    });
  });
  // 滑梭（唯一被动画驱动的是 2 号弹射器）；静止姿态带轨道偏航。
  const launchTrack = CAT_TRACKS[1]!;
  ctx.node({
    name: SHUTTLE_NODE,
    parent: "root",
    // 滑梭贴甲板更低：新位置在机轮滑行包络内，旧高度会让细节机轮穿进梭体 20mm。
    pivot: [launchTrack.x0, deckTop + 0.06, launchTrack.z0],
    rest_rotation: [0, launchTrack.yawDeg, 0],
    motion: "translate",
    axis: "z",
    note: "电磁弹射滑梭",
  });
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
  // 1 号弹射器放一枚待发滑梭；2 号由动画节点驱动。
  // 3 号滑梭待发位落在用户给定的斜角着舰区里，收起滑梭，避免挡着舰滑跑路径。
  for (const track of [CAT_TRACKS[0]!]) {
    const tag = pad(track.id);
    const parked = catPoint(track, 0.1);
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
      mate: A([parked.x, deckTop + 0.09, parked.z], [0, track.yawDeg, 0]),
    });
  }
  // ---- 电磁弹射器甲板下机构：直线电机隧道 / 反应轨 / 水冷 / 变流 / 储能 / 母线 ----
  // 全部吊在飞行甲板底面（y∈4.08~4.40），在透视模式下可见，不占机库净高。
  CAT_TRACKS.forEach((track) => {
    const tag = pad(track.id);
    const len = track.length;
    const yaw = track.yawDeg;
    const mid = catPoint(track, len / 2);
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
      mate: A([mid.x, 4.28, mid.z], [0, yaw, 0]),
    });
    add({
      id: `${E}armature`,
      name_cn: `弹射器 ${track.id} 直线电机电枢`,
      name_en: `catapult ${track.id} linear motor armature`,
      assembly: ASSEMBLY,
      build_layer: 3,
      geometry: M(B(0.05, 0.08, len * 0.98, [-0.1, 0, 0], 0.002), B(0.05, 0.08, len * 0.98, [0.1, 0, 0], 0.002)),
      material: "cv_copper",
      mate: A([mid.x, 4.27, mid.z], [0, yaw, 0]),
    });
    add({
      id: `${E}reaction_rail`,
      name_cn: `弹射器 ${track.id} 反应轨`,
      name_en: `catapult ${track.id} reaction rail`,
      assembly: ASSEMBLY,
      build_layer: 3,
      geometry: M(B(0.08, 0.045, len, [0, 0, 0], 0.003)),
      material: "cv_steel",
      mate: A([mid.x, 4.19, mid.z], [0, yaw, 0]),
    });
    add({
      id: `${E}coolant`,
      name_cn: `弹射器 ${track.id} 水冷主管`,
      name_en: `catapult ${track.id} coolant manifold`,
      assembly: ASSEMBLY,
      build_layer: 3,
      geometry: M(B(0.06, 0.06, len * 0.98, [-0.3, 0, 0], 0.003), B(0.06, 0.06, len * 0.98, [0.3, 0, 0], 0.003)),
      material: "cv_copper",
      mate: A([mid.x, 4.22, mid.z], [0, yaw, 0]),
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
      mate: A([mid.x, 4.28, mid.z], [0, yaw, 0]),
    });
    // 变流/储能机柜靠弹射器后端外侧，顶面吊在甲板底面；横向偏移沿轨道法向。
    const across = track.id === 1 ? -0.92 : 0.92;
    const cabinet = catAcross(track, -1.7, across);
    const flywheel = catAcross(track, -2.4, across);
    const capacitor = catAcross(track, -0.8, across);
    const busway = catAcross(track, -0.8, 0);
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
      mate: A([cabinet.x, 4.235, cabinet.z], [0, yaw, 0]),
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
      // 飞轮放在变流柜后方，避开前向母线槽。
      mate: A([flywheel.x, 4.27, flywheel.z], [0, yaw, 0]),
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
      mate: A([capacitor.x, 4.38, capacitor.z], [0, yaw, 0]),
    });
    add({
      id: `${E}busway`,
      name_cn: `弹射器 ${track.id} 母线槽`,
      name_en: `catapult ${track.id} busway`,
      assembly: ASSEMBLY,
      build_layer: 3,
      geometry: M(B(0.2, 0.12, 1.6, [0, 0, 0], 0.004), B(0.24, 0.02, 1.62, [0, -0.062, 0], 0.002)),
      material: "cv_steel_dark",
      mate: A([busway.x, 4.34, busway.z], [0, yaw, 0]),
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
      mate: A([busway.x, 4.2725, busway.z], [0, yaw, 0]),
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
      // 三号弹射器移到左舷后，仅第 1 道索支撑片与轨道相交；该片向内收，
      // 其余支撑片保持原位，仍压在拦阻索下方。
      mate: A([index === 0 ? -2.85 : -3.4, deckTop + 0.08, z]),
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
  // ---- 应急拦阻网（收起状态）：布置在斜角着舰区前段、2 号弹射挡焰板之后 ----
  // 旧版把一张 1.2m 高、像球门一样的立网放在 z=6，正好压在 1/2 号挡焰板上；
  // 真实航母在非降落作业时拦阻网是收起的，这里按“收起”建模：两根折叠立柱贴在
  // 跑道两舷，网包横卧在甲板上的低矮网槽里，不挡弹射器、不与挡焰板重叠。
  {
    const netZ = 3.3;
    const netRad = (3.59 * Math.PI) / 180;
    const netSin = Math.sin(netRad);
    const netCos = Math.cos(netRad);
    const netCenterX = -0.5756 - ((netZ + 19.9) / netCos) * netSin;
    const netHalf = 1.55;
    const netYaw = -3.59;
    const postAt = (side: -1 | 1): [number, number] => [
      netCenterX + side * netHalf * netCos,
      netZ + side * netHalf * netSin,
    ];
    for (const side of [-1, 1] as const) {
      const [px, pz] = postAt(side);
      const tag = side === -1 ? "l" : "r";
      add({
        id: `${P}arrestor_net_hinge_${tag}`,
        name_cn: `拦阻网折叠座 ${side === -1 ? "左" : "右"}`,
        name_en: `barrier net hinge base ${tag}`,
        assembly: ASSEMBLY,
        build_layer: 3,
        geometry: M(
          B(0.36, 0.055, 0.3, [0, 0.028, 0], 0.006),
          B(0.22, 0.1, 0.16, [0, 0.09, 0], 0.008),
          B(0.08, 0.05, 0.05, [-0.09, 0.14, 0], 0.004),
          B(0.08, 0.05, 0.05, [0.09, 0.14, 0], 0.004),
        ),
        material: "cv_steel_dark",
        mate: A([px, deckTop, pz]),
      });
      // 折叠立柱：沿甲板纵轴倒伏，落在两只鞍座上，不横跨跑道。
      add({
        id: `${P}arrestor_net_stanchion_${tag}`,
        name_cn: `拦阻网折叠立柱 ${side === -1 ? "左" : "右"}`,
        name_en: `barrier net stowed stanchion ${tag}`,
        assembly: ASSEMBLY,
        build_layer: 3,
        geometry: M(
          B(0.085, 0.085, 0.78, [0, 0, 0.39], 0.008),
          B(0.11, 0.09, 0.05, [0, 0.01, -0.02], 0.004),
          B(0.04, 0.04, 0.04, [0, 0.01, 0.72], 0.002),
        ),
        material: "cv_steel",
        mate: A([px, deckTop + 0.1, pz]),
      });
      add({
        id: `${P}arrestor_net_cradle_${tag}`,
        name_cn: `拦阻网立柱鞍座 ${side === -1 ? "左" : "右"}`,
        name_en: `barrier net cradle ${tag}`,
        assembly: ASSEMBLY,
        build_layer: 3,
        geometry: M(B(0.16, 0.09, 0.12, [0, 0, 0.62], 0.004), B(0.2, 0.03, 0.16, [0, -0.04, 0.62], 0.003)),
        material: "cv_steel_dark",
        mate: A([px, deckTop + 0.06, pz]),
      });
      add({
        id: `${P}arrestor_net_ram_${tag}`,
        name_cn: `拦阻网液压作动筒 ${side === -1 ? "左" : "右"}`,
        name_en: `barrier net hydraulic ram ${tag}`,
        assembly: ASSEMBLY,
        build_layer: 3,
        geometry: M(C(0.022, 0.32, [0, 0, 0], 10), C(0.035, 0.12, [0, 0.2, 0], 10)),
        material: "cv_brass",
        mate: A([px + (side === -1 ? 0.09 : -0.09), deckTop + 0.07, pz + 0.18], [90, 0, 0]),
      });
    }
    // 网槽本体：低矮钢槽横跨跑道，网包/张紧索全部收在里面。
    add({
      id: `${P}arrestor_net_trough`,
      name_cn: "拦阻网网槽（网包收起）",
      name_en: "barrier net stowed trough",
      assembly: ASSEMBLY,
      build_layer: 3,
      geometry: M(
        B(netHalf * 2, 0.055, 0.16, [0, 0.028, 0], 0.006),
        B(netHalf * 2 - 0.1, 0.028, 0.2, [0, 0.052, 0], 0.004),
        B(0.12, 0.04, 0.14, [-netHalf + 0.2, 0.02, 0], 0.004),
        B(0.12, 0.04, 0.14, [netHalf - 0.2, 0.02, 0], 0.004),
      ),
      material: "cv_steel_dark",
      mate: A([netCenterX, deckTop, netZ], [0, netYaw, 0]),
    });
    add({
      id: `${P}arrestor_net_pack`,
      name_cn: "拦阻网网包与张紧索",
      name_en: "barrier net stowed pack",
      assembly: ASSEMBLY,
      build_layer: 3,
      geometry: M(
        B(netHalf * 2 - 0.18, 0.075, 0.1, [0, 0.06, 0], 0.008),
        B(0.03, 0.03, netHalf * 2 - 0.2, [0, 0.1, 0], 0.002),
        ...Array.from({ length: 7 }, (_, k) => B(0.02, 0.082, 0.11, [-netHalf + 0.3 + k * 0.52, 0.06, 0], 0.002)),
      ),
      material: "cv_canvas",
      mate: A([netCenterX, deckTop, netZ], [0, netYaw, 0]),
    });
    for (let w = 0; w < 11; w++) {
      add({
        id: `${P}arrestor_net_trough_stripe_${pad(w + 1)}`,
        name_cn: `拦阻网网槽警示条 ${w + 1}`,
        name_en: `barrier net trough warning stripe ${w + 1}`,
        assembly: ASSEMBLY,
        build_layer: 4,
        geometry: M(B(0.16, 0.004, 0.1, [0, 0.058, 0], 0.001)),
        material: w % 2 === 0 ? "cv_deck_red" : "cv_deck_yellow",
        mate: A([netCenterX - netHalf + 0.4 + w * 0.34, deckTop, netZ], [0, netYaw, 0]),
      });
    }
  }

  // ---- 右舷艉部航空吊车：基座/回转齿圈/桅柱/司机室/桁架吊臂/绞车/吊钩 ----
  {
    const cx = 3.2;
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
    // 安全网从甲板边缘向下外倾约 35°，不是一张悬在海面上的水平格栅桌。
    const netParts: Parameters<typeof M>[0][] = [];
    const yAt = (x: number) => -0.05 + ((x + 0.02) / -0.73) * -0.5;
    for (let v = 0; v < 6; v++) {
      const x = -0.75 + v * 0.15;
      netParts.push({ type: "weld", from: [x, yAt(x), -0.5], to: [x, yAt(x), 0.5], radius: 0.008, seed: 200 + n * 10 + v });
    }
    for (let h = 0; h < 5; h++) {
      const z = -0.5 + h * 0.25;
      netParts.push({ type: "weld", from: [-0.75, yAt(-0.75), z], to: [-0.02, yAt(-0.02), z], radius: 0.008, seed: 300 + n * 10 + h });
    }
    for (const side of [-1, 1] as const) {
      netParts.push({ type: "weld", from: [-0.78, yAt(-0.78), side * 0.46], to: [-0.16, 0.02, side * 0.46], radius: 0.018, seed: 400 + n * 2 + (side === -1 ? 0 : 1) });
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
      // 平台顶面与装甲板齐平（只高 3mm），四周用细边框勾出升降机轮廓，不再是凸起的大甲板块。
      geometry: M(
        B(CV.ELEVATOR_W, 0.07, CV.ELEVATOR_L, [0, -0.035, 0], 0.006),
        B(CV.ELEVATOR_W - 0.12, 0.008, CV.ELEVATOR_L - 0.12, [0, 0.003, 0], 0.003),
      ),
      // 台面颜色跟甲板装甲板一致，只用细围边勾出升降机，不再显示成一块深色大甲板。
      material: "cv_deck",
      node,
      mate: A([0, 0, 0]),
    });
    add({
      id: `${P}elevator_${index + 1}_frame`,
      name_cn: `升降机 ${index + 1} 围边`,
      name_en: `elevator ${index + 1} rim`,
      assembly: ASSEMBLY,
      build_layer: 3,
      geometry: M(
        B(CV.ELEVATOR_W + 0.12, 0.008, 0.06, [0, 0.004, CV.ELEVATOR_L / 2], 0.003),
        B(CV.ELEVATOR_W + 0.12, 0.008, 0.06, [0, 0.004, -CV.ELEVATOR_L / 2], 0.003),
        B(0.06, 0.008, CV.ELEVATOR_L, [-CV.ELEVATOR_W / 2, 0.004, 0], 0.003),
        B(0.06, 0.008, CV.ELEVATOR_L, [CV.ELEVATOR_W / 2, 0.004, 0], 0.003),
      ),
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
        mate: A([w % 2 === 0 ? -CV.ELEVATOR_W / 2 - 0.05 : CV.ELEVATOR_W / 2 + 0.05, -0.02, -1.0 + Math.floor(w / 2) * 1.0], [0, 0, 90]),
      });
    }
    for (const side of [-1, 1] as const) {
      add({
        id: `${P}elevator_${index + 1}_rail_${side === -1 ? "l" : "r"}`,
        name_cn: `升降机 ${index + 1} 导轨 ${side === -1 ? "左" : "右"}`,
        name_en: `elevator ${index + 1} rail ${side === -1 ? "l" : "r"}`,
        assembly: ASSEMBLY,
        build_layer: 3,
        geometry: M(B(0.08, 2.16, 0.12, [0, 0, 0], 0.006)),
        material: "cv_steel_dark",
        mate: A([CV.ELEVATOR_X + side * (CV.ELEVATOR_W / 2 + 0.06), deckTop - 1.08, z + CV.ELEVATOR_L / 2 + 0.06]),
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
  // 降落跑道：用户 lnj-coordinates.json 的四点轮廓（几乎沿舰体中轴，艏窄艉宽）。
  const RUNWAY_DEG = LANDING_RUNWAY.deg;
  const RUNWAY_RAD = (RUNWAY_DEG * Math.PI) / 180;
  const RUNWAY_SIN = Math.sin(RUNWAY_RAD);
  const RUNWAY_COS = Math.cos(RUNWAY_RAD);
  const RUNWAY_YAW = -RUNWAY_DEG;
  const runwayAt = (s: number): [number, number] => [
    LANDING_RUNWAY.aftX - s * RUNWAY_SIN,
    LANDING_RUNWAY.aftZ + s * RUNWAY_COS,
  ];
  const runwayAcross = (s: number, side: number, distance: number): [number, number] => {
    const [x, z] = runwayAt(s);
    return [x + side * distance * RUNWAY_COS, z + side * distance * RUNWAY_SIN];
  };
  // 用四点精确多边形铺底色，而不是旋转矩形；标线仍按跑道中心线/真实边线生成。
  add({
    id: `${P}runway_underlay`,
    name_cn: "着舰跑道底色",
    name_en: "landing runway underlay",
    assembly: ASSEMBLY,
    build_layer: 4,
    geometry: {
      type: "kit",
      kit: "carrierDeckArmorPlate",
      params: { points: LANDING_RUNWAY_POLYGON, topY: deckTop + 0.005, thickness: 0.004 },
    },
    material: "cv_runway",
    mate: A([0, 0, 0]),
  });
  const addDeckLine = (
    id: string,
    name_cn: string,
    a: readonly [number, number],
    b: readonly [number, number],
    width: number,
  ) => {
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    add({
      id: `${P}${id}`,
      name_cn,
      name_en: name_cn,
      assembly: ASSEMBLY,
      build_layer: 4,
      geometry: M(B(width, 0.006, Math.hypot(dx, dz), [0, 0, 0], 0.0015)),
      material: "cv_deck_line",
      mate: A([(a[0] + b[0]) / 2, markY + 0.005, (a[1] + b[1]) / 2], [0, (Math.atan2(dx, dz) * 180) / Math.PI, 0]),
    });
  };
  const lpForeStar = LANDING_RUNWAY_POLYGON[0]!;
  const lpForePort = LANDING_RUNWAY_POLYGON[1]!;
  const lpAftPort = LANDING_RUNWAY_POLYGON[2]!;
  const lpAftStar = LANDING_RUNWAY_POLYGON[3]!;
  // 两条真实长边 + 艏艉端线，全部按 JSON 四点生成，而不是恒定宽度的矩形。
  addDeckLine("runway_edge_p", "着舰跑道左舷边线", lpForePort, lpAftPort, 0.12);
  addDeckLine("runway_edge_s", "着舰跑道右舷边线", lpForeStar, lpAftStar, 0.12);
  addDeckLine("runway_end_fwd", "着舰跑道艏端线", lpForePort, lpForeStar, 0.14);
  addDeckLine("runway_end_aft", "着舰跑道艉端线", lpAftPort, lpAftStar, 0.14);
  // 中线虚线：沿新跑道中心线等距 1.2。
  for (let d = 0; d < 24; d++) {
    const [x, z] = runwayAt(0.9 + d * 1.2);
    add({
      id: `${P}runway_center_${pad(d + 1)}`,
      name_cn: `着舰跑道中线 ${d + 1}`,
      name_en: `landing runway centerline ${d + 1}`,
      assembly: ASSEMBLY,
      build_layer: 4,
      geometry: M(B(0.13, 0.006, 0.64, [0, 0, 0], 0.002)),
      material: "cv_deck_line",
      mate: A([x, markY + 0.004, z], [0, RUNWAY_YAW, 0]),
    });
  }
  // 着舰区“钢琴键”：艉端 8 根纵向条带，按艉端实际宽度排布。
  for (let bar = 0; bar < 8; bar++) {
    const [x, z] = runwayAcross(1.5, 1, -0.98 + bar * 0.28);
    add({
      id: `${P}runway_threshold_${pad(bar + 1)}`,
      name_cn: `着舰区钢琴键 ${bar + 1}`,
      name_en: `landing threshold piano key ${bar + 1}`,
      assembly: ASSEMBLY,
      build_layer: 4,
      geometry: M(B(0.15, 0.006, 1.0, [0, 0, 0], 0.0015)),
      material: "cv_deck_line",
      mate: A([x, markY + 0.005, z], [0, RUNWAY_YAW, 0]),
    });
  }
  // 接地点：两列 × 三排，沿新跑道中心线横向 ±0.48。
  for (let row = 0; row < 3; row++) {
    for (const side of [-1, 1] as const) {
      const [x, z] = runwayAcross(5.4 + row * 1.35, side, 0.48);
      add({
        id: `${P}runway_touchdown_${pad(row * 2 + (side === -1 ? 1 : 2))}`,
        name_cn: `着舰接地点标记 ${row * 2 + (side === -1 ? 1 : 2)}`,
        name_en: `touchdown mark ${row * 2 + (side === -1 ? 1 : 2)}`,
        assembly: ASSEMBLY,
        build_layer: 4,
        geometry: M(B(0.4, 0.006, 0.16, [0, 0, 0], 0.0015)),
        material: "cv_deck_line",
        mate: A([x, markY + 0.005, z], [0, RUNWAY_YAW, 0]),
      });
    }
  }
  // 舰艏起飞跑道：用户 lnj-coordinates.json 的四点窄楔形，覆盖两条右舷弹射器。
  const tpForePort = TAKEOFF_RUNWAY_POLYGON[0]!;
  const tpAftPort = TAKEOFF_RUNWAY_POLYGON[1]!;
  const tpAftStar = TAKEOFF_RUNWAY_POLYGON[2]!;
  const tpForeStar = TAKEOFF_RUNWAY_POLYGON[3]!;
  add({
    id: `${P}takeoff_runway_underlay`,
    name_cn: "舰艏起飞跑道底色",
    name_en: "bow takeoff runway underlay",
    assembly: ASSEMBLY,
    build_layer: 4,
    geometry: {
      type: "kit",
      kit: "carrierDeckArmorPlate",
      params: { points: TAKEOFF_RUNWAY_POLYGON, topY: deckTop + 0.004, thickness: 0.003 },
    },
    material: "cv_runway",
    mate: A([0, 0, 0]),
  });
  addDeckLine("takeoff_edge_p", "舰艏起飞跑道左舷边线", tpForePort, tpAftPort, 0.08);
  addDeckLine("takeoff_edge_s", "舰艏起飞跑道右舷边线", tpForeStar, tpAftStar, 0.08);
  addDeckLine("takeoff_threshold", "舰艏起飞位横线", tpAftPort, tpAftStar, 0.12);
  const tpMidBow: [number, number] = [(tpForePort[0] + tpForeStar[0]) / 2, (tpForePort[1] + tpForeStar[1]) / 2];
  const tpMidAft: [number, number] = [(tpAftPort[0] + tpAftStar[0]) / 2, (tpAftPort[1] + tpAftStar[1]) / 2];
  const tpDx = tpMidAft[0] - tpMidBow[0];
  const tpDz = tpMidAft[1] - tpMidBow[1];
  const tpYaw = (Math.atan2(tpDx, tpDz) * 180) / Math.PI;
  for (let d = 0; d < 7; d++) {
    const t = 0.14 + d * 0.11;
    add({
      id: `${P}takeoff_center_${pad(d + 1)}`,
      name_cn: `舰艏起飞跑道中线 ${d + 1}`,
      name_en: `bow takeoff centerline ${d + 1}`,
      assembly: ASSEMBLY,
      build_layer: 4,
      geometry: M(B(0.06, 0.004, 0.5, [0, 0, 0], 0.0015)),
      material: "cv_deck_yellow",
      mate: A([tpMidBow[0] + tpDx * t, markY + 0.004, tpMidBow[1] + tpDz * t], [0, tpYaw, 0]),
    });
  }
  // 两段电磁弹射器起点盖板：由 CAT_TRACKS 的定子段自动覆盖，这里留出编号标记空间。
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
      const [x, z] = runwayAcross(4.4 + t * 0.9, side, 0.55);
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
    [-3.0, -8.3, 0.3], [-3.15, -11.2, 0.28], [-3.0, -14.2, 0.26], [-2.55, -16.2, 0.24],
    [2.95, 8.8, 0.2], [2.2, 5.0, 0.2], [1.0, -1.0, 0.17], [2.2, 2.0, 0.16],
  ];
  oilSpots.forEach(([x, z, r], index) => {
    // 油污不是正圆：用 6 个不同半径/偏移的扁圆叠成不规则油渍，再拖一小滴流痕。
    const blobs: GeometrySpec[] = [];
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2 + index * 0.83;
      const rr = r * (0.32 + 0.2 * (((index * 7 + i * 3) % 5) / 4));
      blobs.push(C(rr, 0.002, [Math.cos(angle) * r * 0.55, 0, Math.sin(angle) * r * 0.45], 14));
    }
    blobs.push(C(r * 0.52, 0.002, [0, 0, 0], 12));
    blobs.push(C(r * 0.18, 0.002, [Math.cos(index * 1.7) * r * 1.2, 0, Math.sin(index * 2.3) * r * 1.0], 10));
    add({
      id: `${P}oil_stain_${pad(index + 1)}`,
      name_cn: `甲板油污 ${index + 1}`,
      name_en: `deck oil stain ${index + 1}`,
      assembly: ASSEMBLY,
      build_layer: 4,
      geometry: M(...blobs),
      material: "cv_deck_wear",
      mate: A([x, deckTop + 0.009, z]),
    });
  });
  CAT_TRACKS.forEach((track, index) => {
    const scorch = catPoint(track, carrierJbdOffset(track.id) - 0.35);
    add({
      id: `${P}jbd_scorch_${index + 1}`,
      name_cn: `挡焰板烧蚀区 ${index + 1}`,
      name_en: `JBD scorch mark ${index + 1}`,
      assembly: ASSEMBLY,
      build_layer: 4,
      geometry: M(B(track.id === 3 ? 1.2 : 0.82, 0.003, 0.62, [0, 0, 0], 0.002)),
      material: "cv_deck_wear",
      mate: A([scorch.x, markY + 0.001, scorch.z], [0, track.yawDeg, 0]),
    });
  });

  // 停机位框线 + 编号（七段数字），全部贴在甲板上；避开着舰/起飞跑道。
  const parkingSpots: Array<[number, number, number, number]> = [
    // x, z, 编号, 机体朝向（与 PARKED_SPOTS 一致）
    [3.95, -10.2, 1, 0], [4.1, 5.2, 2, 0],
    // 5 号是现役演示机位：艏部右舷弹射跑道外侧，不压着舰跑道/拦阻网。
    [2.95, 8.8, 5, 0],
  ];
  const digitSegments: Record<string, string[]> = {
    "1": ["b", "c"], "2": ["a", "b", "g", "e", "d"], "3": ["a", "b", "g", "c", "d"],
    "4": ["f", "g", "b", "c"], "5": ["a", "f", "g", "c", "d"], "6": ["a", "f", "g", "e", "c", "d"],
    "7": ["a", "b", "c"], "8": ["a", "b", "c", "d", "e", "f", "g"], "9": ["a", "b", "c", "d", "f", "g"],
  };
  const drawDigit = (digit: string, idPrefix: string, cx: number, cz: number, size = 0.5, label = "停机位编号") => {
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
        name_cn: `${label} ${digit}`,
        name_en: `parking number ${digit}`,
        assembly: ASSEMBLY,
        build_layer: 4,
        geometry: M(B(sw, 0.006, sd, [0, 0, 0], 0.001)),
        material: "cv_deck_yellow",
        mate: A([cx + dx, markY + 0.006, cz + dz]),
      });
    }
  };
  parkingSpots.forEach(([sx, sz, n, yaw]) => {
    // 5 号位停现役 J20（20.4m），框线按 2.2×3.0；折叠翼 J-15 用 1.28×2.7。
    const w = n === 5 ? 2.2 : 1.1;
    const d = n === 5 ? 3.0 : 2.7;
    add({
      id: `${P}parking_box_${pad(n)}`,
      name_cn: `停机位框线 ${n}`,
      name_en: `parking spot box ${n}`,
      assembly: ASSEMBLY,
      build_layer: 4,
      geometry: M(B(w, 0.006, 0.05, [0, 0, d / 2], 0.0015), B(w, 0.006, 0.05, [0, 0, -d / 2], 0.0015), B(0.05, 0.006, d, [-w / 2, 0, 0], 0.0015), B(0.05, 0.006, d, [w / 2, 0, 0], 0.0015)),
      material: "cv_deck_yellow",
      mate: A([sx, markY + 0.003, sz], [0, yaw, 0]),
    });
    const yawRad = (yaw * Math.PI) / 180;
    // 右侧贴舷停机位的编号往舰内放，不能刷到甲板外。
    const numSide = sx > 3.8 ? -1 : 1;
    const numX = sx + numSide * (w / 2 + 0.22) * Math.cos(yawRad) + (d / 2 + 0.14) * Math.sin(yawRad);
    const numZ = sz - numSide * (w / 2 + 0.22) * Math.sin(yawRad) + (d / 2 + 0.14) * Math.cos(yawRad);
    drawDigit(String(n), `parking_num_${n}`, numX, numZ, 0.36);
  });
  // 甲板外缘线：直接沿真实 deckPlan 折线勾边，向甲板内侧偏 0.05。
  // 旧版用的是改轮廓之前的硬编码折线（还带升降机缺口），线画在甲板里面，
  // 线外就会多出一圈“甲板”，右舷 3-1/3-2、左舷艏段都会被看成多余的甲板块。
  const edgeLine = (x0: number, z0: number, x1: number, z1: number, id: string, label: string) => {
    const dx = x1 - x0;
    const dz = z1 - z0;
    const yaw = (Math.atan2(dx, dz) * 180) / Math.PI;
    // 真图甲板外缘是红/白双色边带：先铺一条更宽的红边，再压白色主边线。
    add({
      id: `${P}${id}_red`,
      name_cn: `${label} 红边`,
      name_en: `${label} red band`,
      assembly: ASSEMBLY,
      build_layer: 4,
      geometry: M(B(0.18, 0.006, Math.hypot(dx, dz), [0, 0, 0], 0.0012)),
      material: "cv_deck_red",
      mate: A([(x0 + x1) / 2, deckTop + 0.0025, (z0 + z1) / 2], [0, yaw, 0]),
    });
    add({
      id: `${P}${id}`,
      name_cn: label,
      name_en: label,
      assembly: ASSEMBLY,
      build_layer: 4,
      geometry: M(B(0.09, 0.006, Math.hypot(dx, dz), [0, 0, 0], 0.0015)),
      material: "cv_deck_line",
      // 线压在甲板真实外缘上：线内外不再出现“装甲板超出外缘线”的视觉。
      mate: A([(x0 + x1) / 2, deckTop + 0.0055, (z0 + z1) / 2], [0, yaw, 0]),
    });
  };
  let stbdEdgeIndex = 0;
  let portEdgeIndex = 0;
  let endEdgeIndex = 0;
  for (let i = 0; i < outline.length; i++) {
    const [ax, az] = outline[i]!;
    const [bx, bz] = outline[(i + 1) % outline.length]!;
    const dx = bx - ax;
    const dz = bz - az;
    const len = Math.hypot(dx, dz);
    if (len < 1e-6) continue;
    // 不向内偏：外缘线直接压在甲板折线上，装甲板不会再“超出外缘线”。
    const midX = (ax + bx) / 2;
    let id: string;
    let label: string;
    if (midX > 0.15) {
      stbdEdgeIndex++;
      id = `deck_edge_stbd_${stbdEdgeIndex}`;
      label = `右舷甲板外缘线 ${stbdEdgeIndex}`;
    } else if (midX < -0.15) {
      portEdgeIndex++;
      id = `deck_edge_port_${portEdgeIndex}`;
      label = `左舷甲板外缘线 ${portEdgeIndex}`;
    } else {
      endEdgeIndex++;
      id = `deck_edge_end_${endEdgeIndex}`;
      label = az + bz < 0 ? `艉甲板外缘线 ${endEdgeIndex}` : `艏甲板外缘线 ${endEdgeIndex}`;
    }
    edgeLine(ax, az, bx, bz, id, label);
  }

  // 直升机停靠点（圆圈 + H）。
  add({
    id: `${P}helipad_circle`,
    name_cn: "直升机停靠点圆圈",
    name_en: "helipad circle",
    assembly: ASSEMBLY,
    build_layer: 4,
    geometry: M({ type: "torus", radius: 0.58, tube: 0.032, radialSegments: 8, tubularSegments: 32 }),
    material: "cv_deck_line",
    mate: A([0.8, markY + 0.006, 3.5], [90, 0, 0]),
  });
  add({
    id: `${P}helipad_h`,
    name_cn: "直升机 H 标记",
    name_en: "helipad H",
    assembly: ASSEMBLY,
    build_layer: 4,
    geometry: M(B(0.1, 0.006, 0.66, [0, 0, 0], 0.0015), B(0.1, 0.006, 0.66, [-0.38, 0, 0], 0.0015), B(0.48, 0.006, 0.1, [-0.19, 0, 0], 0.0015)),
    material: "cv_deck_line",
    mate: A([0.8, markY + 0.007, 3.5]),
  });
  // 舷号 18 刷在艏端：真实福建舰的 18 在两根弹射轨前方、靠近艏尖，不能被轨道压住。
  drawDigit("1", "hull_number_1", -0.95, 19.6, 1.5, "舰艏舷号");
  drawDigit("8", "hull_number_8", 0.75, 19.6, 1.5, "舰艏舷号");
  // 挡焰板危险区：随各自轨道/JBD 旋转，只放在 JBD 与弹射起点之间，
  // 不铺到斜角着舰跑道上；弹射位数字已在上方按轨道生成，这里不再重复。
  CAT_TRACKS.forEach((track) => {
    for (let st = 0; st < 3; st++) {
      const p = catPoint(track, carrierJbdOffset(track.id) - 0.3 - st * 0.18);
      add({
        id: `${P}danger_${track.id}_${st + 1}`,
        name_cn: `挡焰板危险区 ${track.id}-${st + 1}`,
        name_en: `JBD danger stripe ${track.id}-${st + 1}`,
        assembly: ASSEMBLY,
        build_layer: 4,
        geometry: M(B(track.id === 3 ? 2.0 - st * 0.3 : 0.95 - st * 0.18, 0.006, 0.16, [0, 0, 0], 0.0015)),
        material: st % 2 === 0 ? "cv_deck_red" : "cv_deck_yellow",
        mate: A([p.x, markY + 0.005, p.z], [0, track.yawDeg, 0]),
      });
    }
  });
  // 旧版在 x=0、z=-18.7 画了一组“艉部危险区”，正好压在斜角着舰跑道艉端标线上。
  // 艉部本身没有独立喷流危险区，直接移除，避免标线互相覆盖。
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
    const z = -17 + row * 4.2;
    // 每一排按该 z 的真实甲板宽度重新分布，80 个系留环全部留在甲板内，
    // 不再用固定 x 网格让艏部/艉部的环悬到甲板外。
    const star = deckEdgeAt(z, 1).x - 0.18;
    const port = deckEdgeAt(z, -1).x + 0.18;
    const x = port + ((star - port) * col) / 9;
    return new THREE.Matrix4().makeTranslation(x, deckTop + 0.01, z);
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

  // ---- 舷侧外飘封边：沿甲板折线逐段独立成板（不再是一个整圈大件） ----
  // 每段仍严格沿甲板真实折线放样，不是旧版那种 3.6m 长的直盒子，所以不会伸出去也不会留缝。
  const skirtOutline = deckPlan();
  let skirtStbd = 0;
  let skirtPort = 0;
  let skirtEnd = 0;
  for (let i = 0; i < skirtOutline.length; i++) {
    const a = skirtOutline[i]!;
    const b = skirtOutline[(i + 1) % skirtOutline.length]!;
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 1e-6) continue;
    const midX = (a[0] + b[0]) / 2;
    let sideLabel: string;
    let tag: string;
    if (midX > 0.15) {
      skirtStbd++;
      sideLabel = "右舷";
      tag = `s_${pad(skirtStbd)}`;
    } else if (midX < -0.15) {
      skirtPort++;
      sideLabel = "左舷";
      tag = `p_${pad(skirtPort)}`;
    } else {
      skirtEnd++;
      sideLabel = a[1] + b[1] < 0 ? "艉端" : "艏端";
      tag = `e_${pad(skirtEnd)}`;
    }
    add({
      id: `${P}sponson_skirt_${tag}`,
      name_cn: `舷侧外飘封边板 ${sideLabel} ${tag.startsWith("s") ? skirtStbd : tag.startsWith("p") ? skirtPort : skirtEnd}`,
      name_en: `sponson sealing plate ${tag}`,
      assembly: ASSEMBLY,
      build_layer: 3,
      geometry: { type: "kit", kit: "carrierSponsonSkirt", params: { points: [a, b] } },
      // 甲板缘下方是垂直舷墙，用深色钢，避免从俯视角度看像另一块浅色甲板。
      material: "cv_hull_dark",
      mate: A([0, 0, 0]),
      source: "逐段沿飞行甲板真实折线放样；上缘埋入甲板、下缘与外飘底封板共边。",
    });
  }
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
      // 编辑尺度 1:8：真实横杆约 4.6m，旧版直接写了 4.6 编辑单位（36m），
      // 从舰桥看就是一把横跨舰艏的长杆。
      geometry: M(C(0.004, 0.58, [0, 0, 0], 6)),
      material: "cv_canvas",
      mate: A([0, deckTop + 0.1, 19.8 + i * 0.18], [0, 0, 90]),
    });
    for (const side of [-1, 1] as const) {
      add({
        id: `${P}recovery_net_post_${i + 1}_${side === -1 ? "p" : "s"}`,
        name_cn: `回收角网杆立柱 ${i + 1} ${side === -1 ? "左" : "右"}`,
        name_en: `recovery net post ${i + 1} ${side === -1 ? "l" : "r"}`,
        assembly: ASSEMBLY,
        build_layer: 3,
        geometry: M(B(0.012, 0.1, 0.012, [0, 0.05, 0], 0.0015)),
        material: "cv_steel",
        mate: A([side * 0.29, deckTop, 19.8 + i * 0.18]),
      });
    }
  }
  for (let i = 0; i < 8; i++) {
    add({
      id: `${P}recovery_net_line_${i + 1}`,
      name_cn: `回收角尼龙网纵索 ${i + 1}`,
      name_en: `recovery net line ${i + 1}`,
      assembly: ASSEMBLY,
      build_layer: 3,
      geometry: M(C(0.003, 0.2, [0, 0, 0], 6)),
      material: "cv_canvas",
      mate: A([-0.23 + i * 0.066, deckTop + 0.09, 20.2], [90, 0, 0]),
    });
  }

  // ---- 舰艏上翘甲板（真实甲板有轻微上翘/外飘，不是一块平板） ----
  for (let i = 0; i < 2; i++) {
    const z = 19.0 + i * 0.72;
    const port = deckEdgeAt(z, -1).x;
    const star = deckEdgeAt(z, 1).x;
    add({
      id: `${P}bow_ramp_${pad(i + 1)}`,
      name_cn: `舰艏上翘唇口 ${i + 1}`,
      name_en: `bow ramp lip ${i + 1}`,
      assembly: ASSEMBLY,
      build_layer: 3,
      geometry: M(B(Math.max(0.8, star - port - 0.18), 0.05, 0.8, [0, 0, 0], 0.004)),
      material: "cv_deck_plate",
      mate: A([(port + star) / 2, deckTop + 0.035 + i * 0.025, z], [-4 - i * 3, 0, 0]),
    });
  }
  // 舰艏舷墙：沿用户 36 点轮廓的实际舷缘逐段生成，不再写死 x=±1.5/±2.0。
  // 这艘轮廓的艏部向右舷偏置且收窄，固定横板会一侧悬出、一侧露空。
  const bowZs = [16.2, 17.2, 18.2, 19.2, 20.1, 20.45];
  for (const side of [-1, 1] as const) {
    const tag = side === -1 ? "p" : "s";
    for (let i = 0; i < bowZs.length - 1; i++) {
      const z0 = bowZs[i]!;
      const z1 = bowZs[i + 1]!;
      const x0 = deckEdgeAt(z0, side).x + side * 0.028;
      const x1 = deckEdgeAt(z1, side).x + side * 0.028;
      const dx = x1 - x0;
      const dz = z1 - z0;
      // 右舷艏部是起飞跑道出口，舷墙做低矮唇口，避免飞机翼尖/导弹越舷时穿墙。
      const h = side === 1 ? 0.08 : 0.3 + i * 0.012;
      add({
        id: `${P}bow_bulwark_${tag}_${i + 1}`,
        name_cn: `舰艏舷墙 ${tag.toUpperCase()}-${i + 1}`,
        name_en: `bow bulwark ${tag} ${i + 1}`,
        assembly: ASSEMBLY,
        build_layer: 3,
        geometry: M(B(0.055, h, Math.hypot(dx, dz), [0, 0, 0], 0.004)),
        material: "cv_hull",
        mate: A([(x0 + x1) / 2, deckTop + h / 2 + (side === 1 ? 0 : i * 0.006), (z0 + z1) / 2], [0, (Math.atan2(dx, dz) * 180) / Math.PI, 0]),
      });
    }
  }
  // 前舷墙取轮廓首尾两点（艉板对面的艏端横边），随真实斜边旋转。
  const bowPlan = deckPlan();
  const bowStar = bowPlan[0]!;
  const bowPort = bowPlan[bowPlan.length - 1]!;
  const frontDx = bowStar[0] - bowPort[0];
  const frontDz = bowStar[1] - bowPort[1];
  add({
    id: `${P}bow_bulwark_front`,
    name_cn: "舰艏前舷墙",
    name_en: "bow front bulwark",
    assembly: ASSEMBLY,
    build_layer: 3,
    geometry: M(B(0.075, 0.38, Math.hypot(frontDx, frontDz), [0, 0, 0], 0.006)),
    material: "cv_hull",
    mate: A([(bowStar[0] + bowPort[0]) / 2, deckTop + 0.19, (bowStar[1] + bowPort[1]) / 2], [0, (Math.atan2(frontDx, frontDz) * 180) / Math.PI, 0]),
  });

  // ---- 甲板航空燃油补给站 / 加油车 / 接地与软管 ----
  // 公开资料：飞行甲板设多个飞机加油站，加油车开到机旁；这里做 3 个站点，
  // 其中右舷艉部站点用软管连接到停放 J-15，展示完整加油作业。
  const fuelStations: Array<[number, number, string, boolean]> = [
    [4.4, -7.6, "starboard_aft", true],
    [-3.8, 4.0, "port_mid", false],
    [4.3, -0.5, "starboard_amidships", false],
  ];
  for (const [fx, fz, tag, detailed] of fuelStations) {
    add({
      id: `${P}fuel_station_${tag}`,
      name_cn: `航空燃油补给站 ${tag}`,
      name_en: `aviation fuel station ${tag}`,
      assembly: ASSEMBLY,
      build_layer: 4,
      geometry: M(
        B(0.34, 0.02, 0.28, [0, 0.01, 0], 0.004),
        B(0.3, 0.3, 0.22, [0, 0.17, 0], 0.012),
        B(0.26, 0.03, 0.24, [0, 0.33, 0], 0.006),
        B(0.02, 0.24, 0.18, [-0.16, 0.17, 0], 0.004),
        T(0.09, 0.06, 0.06, [0.2, 0.18, 0.02], 18),
        C(0.025, 0.05, [0.2, 0.18, 0.02], 12),
        C(0.028, 0.012, [-0.08, 0.25, 0.115], 12),
        C(0.028, 0.012, [0.02, 0.25, 0.115], 12),
        B(0.1, 0.07, 0.012, [0.08, 0.18, 0.116], 0.003),
        B(0.12, 0.02, 0.32, [0.44, 0.01, 0], 0.004),
        C(0.035, 0.18, [0.38, 0.1, 0.16], 10),
        T(0.055, 0.03, 0.07, [0.38, 0.1, 0.16], 16),
        B(0.16, 0.08, 0.06, [-0.12, 0.36, 0], 0.004),
      ),
      material: "cv_steel_dark",
      mate: A([fx, deckTop, fz]),
    });
    if (detailed) {
      add({
        id: `${P}fuel_station_${tag}_hose`,
        name_cn: "加油软管与接头",
        name_en: "fuel hose and coupling",
        assembly: ASSEMBLY,
        build_layer: 4,
        geometry: M(
          { type: "weld", from: [0.18, 0.18, 0.03], to: [0.12, 0.05, -0.3], radius: 0.018 },
          { type: "weld", from: [0.12, 0.05, -0.3], to: [-0.3, 0.03, -0.8], radius: 0.018 },
          { type: "weld", from: [-0.3, 0.03, -0.8], to: [-0.45, 0.02, -1.35], radius: 0.018 },
          C(0.028, 0.1, [-0.48, 0.06, -1.4], 10),
          T(0.035, 0.025, 0.03, [-0.5, 0.1, -1.4], 12),
        ),
        material: "cv_rubber",
        mate: A([fx, deckTop, fz]),
      });
    }
    // 站点接地盘/警示条
    add({
      id: `${P}fuel_station_${tag}_ground`,
      name_cn: `加油接地盘 ${tag}`,
      name_en: `fuel grounding reel ${tag}`,
      assembly: ASSEMBLY,
      build_layer: 4,
      geometry: M(
        T(0.06, 0.04, 0.02, [0.2, 0.02, 0.16], 14),
        { type: "weld", from: [0.2, 0.03, 0.16], to: [0.3, 0.01, 0.5], radius: 0.008 },
        B(0.2, 0.006, 0.05, [0, 0.008, 0.2], 0.001),
      ),
      material: "cv_warning",
      mate: A([fx, deckTop, fz]),
    });
  }

  // 加油车：停在右舷舰岛后方停放 J-15 旁，软管接到机翼根部油箱口。
  {
    const cx = 2.85;
    const cz = -10.9;
    add({
      id: `${P}fuel_cart`,
      name_cn: "航空燃油加油车",
      name_en: "aviation fuel servicing cart",
      assembly: ASSEMBLY,
      build_layer: 4,
      geometry: M(
        B(0.34, 0.04, 0.2, [0, 0.24, 0], 0.008),
        B(0.04, 0.22, 0.04, [-0.13, 0.34, 0.08], 0.004),
        B(0.04, 0.22, 0.04, [0.13, 0.34, 0.08], 0.004),
        B(0.34, 0.04, 0.04, [0, 0.46, 0.08], 0.004),
        B(0.04, 0.2, 0.04, [0, 0.14, 0.08], 0.004),
        C(0.1, 0.06, [-0.16, 0.12, 0], 14),
        C(0.1, 0.06, [0.16, 0.12, 0], 14),
        T(0.12, 0.075, 0.07, [0, 0.3, -0.01], 18),
        C(0.05, 0.2, [0.1, 0.3, 0.02], 12),
        C(0.03, 0.02, [0.1, 0.42, 0.02], 10),
        B(0.12, 0.09, 0.02, [-0.08, 0.3, 0.1], 0.003),
        C(0.025, 0.01, [-0.03, 0.32, 0.115], 10),
        T(0.04, 0.028, 0.025, [-0.08, 0.26, 0.115], 12),
        { type: "weld", from: [-0.16, 0.28, 0.02], to: [-0.38, 0.42, 0.1], radius: 0.008 },
      ),
      material: "cv_warning",
      mate: A([cx, deckTop, cz]),
    });
    add({
      id: `${P}fuel_cart_hose`,
      name_cn: "加油车软管/加油枪",
      name_en: "fuel cart hose and nozzle",
      assembly: ASSEMBLY,
      build_layer: 4,
      geometry: M(
        { type: "weld", from: [0.2, 0.42, 0.08], to: [0.45, 0.3, 0.55], radius: 0.018 },
        { type: "weld", from: [0.45, 0.3, 0.55], to: [0.5, 0.24, 1.0], radius: 0.018 },
        { type: "weld", from: [0.5, 0.24, 1.0], to: [0.45, 0.22, 1.6], radius: 0.018 },
        { type: "weld", from: [0.45, 0.22, 1.6], to: [0.4, 0.2, 1.95], radius: 0.018 },
        C(0.03, 0.14, [0.41, 0.23, 2.0], 10),
        T(0.042, 0.028, 0.05, [0.41, 0.3, 2.02], 12),
      ),
      material: "cv_rubber",
      mate: A([cx, deckTop, cz]),
    });
    add({
      id: `${P}fuel_cart_bonding`,
      name_cn: "加油车静电接地线",
      name_en: "fuel cart bonding cable",
      assembly: ASSEMBLY,
      build_layer: 4,
      geometry: M(
        { type: "weld", from: [-0.14, 0.26, -0.08], to: [-0.35, 0.03, -0.35], radius: 0.007 },
        { type: "weld", from: [-0.35, 0.03, -0.35], to: [-0.55, 0.015, -0.55], radius: 0.007 },
        C(0.03, 0.02, [-0.56, 0.02, -0.56], 10),
      ),
      material: "cv_copper",
      mate: A([cx, deckTop, cz]),
    });
    // 受油口并入加油枪端头，不再单独挂在进气道旁边。
    // 站点视点
    add({
      id: `${P}fuel_view_mast`,
      name_cn: "加油作业视点立柱",
      name_en: "fuel view mast",
      assembly: ASSEMBLY,
      build_layer: 4,
      geometry: M(B(0.035, 0.75, 0.035, [0, 0.375, 0], 0.003), B(0.12, 0.02, 0.12, [0, 0.01, 0], 0.003)),
      material: "cv_steel_dark",
      mate: A([2.6, deckTop, -14.8]),
    });
    add({
      id: `${P}fuel_view_eye`,
      name_cn: "加油作业视点",
      name_en: "fuel servicing view eye",
      assembly: ASSEMBLY,
      build_layer: 4,
      geometry: M(B(0.004, 0.004, 0.004, [0, 0, 0], 0.001)),
      material: "cv_steel_dark",
      mate: A([2.6, deckTop + 0.75, -14.8]),
    });
  }

  // ---- 甲板弹药升降机 / 挂弹准备区 / 待发弹药 ----
  ctx.node({ name: "CV_OrdnanceStage", parent: "root", pivot: [1.75, deckTop + 0.35, -4.0], note: "甲板挂弹/弹药升降机视点" });
  // 与机库弹药库对应的飞行甲板升降口，旁边是挂弹准备区（炸弹车/导弹架）。
  {
    const ox = 1.75;
    const oz = -5.0;
    add({
      id: `${P}ordnance_hatch_frame`,
      name_cn: "甲板弹药升降机口框",
      name_en: "flight deck weapons elevator frame",
      assembly: ASSEMBLY,
      build_layer: 4,
      geometry: M(
        B(0.86, 0.012, 1.36, [0, 0.008, 0], 0.004),
        B(0.06, 0.04, 1.4, [-0.44, 0.04, 0], 0.003),
        B(0.06, 0.04, 1.4, [0.44, 0.04, 0], 0.003),
        B(0.88, 0.04, 0.06, [0, 0.04, -0.69], 0.003),
        B(0.88, 0.04, 0.06, [0, 0.04, 0.69], 0.003),
        T(0.08, 0.04, 0.02, [-0.5, 0.05, 0], 12),
        T(0.08, 0.04, 0.02, [0.5, 0.05, 0], 12),
      ),
      material: "cv_deck_yellow",
      mate: A([ox, deckTop, oz]),
    });
    add({
      id: `${P}ordnance_hatch_cover`,
      name_cn: "弹药升降机盖板",
      name_en: "weapons elevator cover",
      assembly: ASSEMBLY,
      build_layer: 4,
      geometry: M(
        B(0.76, 0.016, 1.22, [0, 0.018, 0], 0.004),
        B(0.66, 0.006, 1.1, [0, 0.03, 0], 0.002),
        B(0.08, 0.04, 0.08, [0, 0.06, 0.48], 0.003),
      ),
      material: "cv_deck_plate",
      mate: A([ox, deckTop, oz]),
    });
    // 挂弹准备区：移动炸弹车 + 2 枚炸弹 + 2 枚导弹
    add({
      id: `${P}ordnance_cart`,
      name_cn: "挂弹准备车",
      name_en: "ordnance loading cart",
      assembly: ASSEMBLY,
      build_layer: 4,
      geometry: M(
        B(0.72, 0.035, 0.34, [0, 0.2, 0], 0.008),
        B(0.04, 0.2, 0.04, [-0.3, 0.32, 0.13], 0.004),
        B(0.04, 0.2, 0.04, [0.3, 0.32, 0.13], 0.004),
        B(0.68, 0.035, 0.035, [0, 0.42, 0.13], 0.004),
        C(0.09, 0.06, [-0.3, 0.155, 0], 12),
        C(0.09, 0.06, [0.3, 0.155, 0], 12),
        B(0.04, 0.45, 0.35, [0, 0.22, 0], 0.003),
        B(0.22, 0.05, 0.06, [0.38, 0.2, 0], 0.003),
      ),
      material: "cv_warning",
      mate: A([ox, deckTop, -3.15]),
    });
    // 炸弹：Mk-82 形状（尖头/尾翼/吊耳）
    for (const [dx, dz, tag] of [[-0.2, 0, "a"], [0.2, 0, "b"]] as const) {
      add({
        id: `${P}bomb_${tag}`,
        name_cn: `航空炸弹 ${tag.toUpperCase()}`,
        name_en: `aircraft bomb ${tag}`,
        assembly: ASSEMBLY,
        build_layer: 4,
        geometry: M(
          { type: "latheZ", profile: [[0.02, -0.34], [0.07, -0.25], [0.095, 0.02], [0.08, 0.22], [0.035, 0.34]], segments: 18 },
          B(0.03, 0.2, 0.1, [0, 0.08, 0.25], 0.002),
          B(0.24, 0.02, 0.02, [0, 0.05, 0], 0.002),
          T(0.09, 0.07, 0.02, [0, 0, 0.08], 14),
        ),
        material: "cv_aircraft_dark",
        mate: A([ox + dx, deckTop + 0.28, -3.15 + dz], [0, 0, 90]),
      });
    }
    // 导弹：细长弹体 + 尾翼
    for (const [dx, dz, tag] of [[-0.2, 0, "a"], [0.2, 0, "b"]] as const) {
      add({
        id: `${P}ordnance_missile_${tag}`,
        name_cn: `航空导弹 ${tag.toUpperCase()}`,
        name_en: `aircraft missile ${tag}`,
        assembly: ASSEMBLY,
        build_layer: 4,
        geometry: M(
          { type: "latheZ", profile: [[0.01, -0.55], [0.045, -0.4], [0.055, 0.2], [0.03, 0.45], [0.008, 0.55]], segments: 16 },
          B(0.18, 0.012, 0.08, [0, 0, -0.38], 0.002),
          B(0.18, 0.08, 0.012, [0, 0, -0.38], 0.002),
          B(0.06, 0.02, 0.04, [0, 0.04, -0.1], 0.002),
        ),
        material: "cv_radar",
        mate: A([ox + dx, deckTop + 0.32, -3.15 + dz], [0, 0, 90]),
      });
    }
    // 待发弹药架（靠近舰岛一侧）
    add({
      id: `${P}ordnance_ready_rack`,
      name_cn: "待发弹药架",
      name_en: "ready service ordnance rack",
      assembly: ASSEMBLY,
      build_layer: 4,
      geometry: M(
        B(0.8, 0.04, 0.3, [0, 0.02, 0], 0.004),
        B(0.04, 0.3, 0.04, [-0.38, 0.17, -0.13], 0.003),
        B(0.04, 0.3, 0.04, [0.38, 0.17, -0.13], 0.003),
        B(0.04, 0.3, 0.04, [-0.38, 0.17, 0.13], 0.003),
        B(0.04, 0.3, 0.04, [0.38, 0.17, 0.13], 0.003),
        B(0.8, 0.03, 0.04, [0, 0.32, -0.13], 0.003),
        B(0.8, 0.03, 0.04, [0, 0.32, 0.13], 0.003),
      ),
      material: "cv_steel_dark",
      mate: A([1.75, deckTop, -7.2]),
    });
    // 视点
    add({
      id: `${P}ordnance_view_eye`,
      name_cn: "挂弹作业视点",
      name_en: "ordnance view eye",
      assembly: ASSEMBLY,
      build_layer: 4,
      geometry: M(B(0.004, 0.004, 0.004, [0, 0, 0], 0.001)),
      material: "cv_steel_dark",
      mate: A([2.7, deckTop + 1.2, -3.3]),
    });
    add({
      id: `${P}ordnance_view_target`,
      name_cn: "挂弹作业目标",
      name_en: "ordnance view target",
      assembly: ASSEMBLY,
      build_layer: 4,
      geometry: M(B(0.004, 0.004, 0.004, [0, 0, 0], 0.001)),
      material: "cv_steel_dark",
      mate: A([1.75, deckTop + 0.25, -3.15]),
    });
  }
}
