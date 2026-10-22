import { CV } from "./constants";
import { A, B, C, M, S, T, type CarrierCtx } from "./common";

// ============================================================================
// L4 航海舰桥内部（二层）：真实开口围壁 + 前视窗 + 操舰台/海图桌/雷达显控
// 仪表/舵轮/车钟/座椅全部实体，第一人称视角从座椅与窗位派生。
// ============================================================================

const ASSEMBLY = "island";
const P = "carrier.island.";
const LEVEL = 1;

export const BRIDGE_GAUGE_NODES = [
  "CV_BridgeGauge_1",
  "CV_BridgeGauge_2",
  "CV_BridgeGauge_3",
  "CV_BridgeGauge_4",
  "CV_BridgeGauge_5",
  "CV_BridgeGauge_6",
] as const;
export const BRIDGE_HELM_NODE = "CV_BridgeHelm";
export const BRIDGE_TELEGRAPH_NODE = "CV_BridgeTelegraph";
export const BRIDGE_RADAR_SWEEP_NODE = "CV_BridgeRadarSweep";

export function addBridgeInterior(ctx: CarrierCtx): void {
  const x = CV.ISLAND_X;
  const z = CV.ISLAND_Z;
  const baseY = CV.DECK_Y + CV.DECK_T;
  const y = baseY + 0.45 + LEVEL * 0.78;
  const width = 1.62 - LEVEL * 0.1;
  const len = 5.9 - LEVEL * 0.2;
  const halfW = width / 2;
  const halfL = len / 2;
  const floorY = y + 0.03;
  const sillY = y + 0.19;
  const glassY = y + 0.36;
  const glassH = 0.34;

  const add = (part: Parameters<CarrierCtx["add"]>[0]) => ctx.add(part);
  const part = (
    id: string,
    name_cn: string,
    geometry: Parameters<typeof M>[0],
    material: string,
    at: [number, number, number],
    rotation?: [number, number, number],
  ) =>
    add({
      id: `${P}bridge_${id}`,
      name_cn,
      name_en: id.replace(/_/g, " "),
      assembly: ASSEMBLY,
      build_layer: 4,
      geometry,
      material,
      mate: A(at, rotation),
    });

  // ---- 围壁：下槛/上楣 + 竖梃 + 真实玻璃窗（从内能看到甲板） ----
  for (const side of [-1, 1] as const) {
    const wx = x + side * halfW;
    part(
      `wall_lower_${side === -1 ? "p" : "s"}`,
      `舰桥${side === -1 ? "左" : "右"}舷下槛`,
      M(B(0.06, 0.16, len, [0, 0, 0], 0.004)),
      "cv_hull",
      [wx, y + 0.11, z],
    );
    part(
      `wall_header_${side === -1 ? "p" : "s"}`,
      `舰桥${side === -1 ? "左" : "右"}舷上楣`,
      M(B(0.06, 0.21, len, [0, 0, 0], 0.004)),
      "cv_hull",
      [wx, y + 0.635, z],
    );
    for (let w = 0; w < 5; w++) {
      const wz = z - 1.9 + w * 0.95;
      part(
        `window_${side === -1 ? "p" : "s"}_${w + 1}`,
        `舰桥${side === -1 ? "左" : "右"}舷窗 ${w + 1}`,
        M(B(0.02, glassH, 0.62, [0, 0, 0], 0.002)),
        "cv_bridge_glass",
        [wx, glassY, wz],
      );
    }
    for (const mz of [-2.25, -1.425, -0.475, 0.475, 1.425, 2.25] as const) {
      part(
        `side_mullion_${side === -1 ? "p" : "s"}_${Math.round((mz + 2.25) * 100)}`,
        `舰桥${side === -1 ? "左" : "右"}舷窗竖梃`,
        M(B(0.06, glassH, 0.06, [0, 0, 0], 0.003)),
        "cv_steel_dark",
        [wx, glassY, z + mz],
      );
    }
    part(
      `window_sill_${side === -1 ? "p" : "s"}`,
      `舰桥${side === -1 ? "左" : "右"}舷内窗台`,
      M(B(0.1, 0.02, len - 0.1, [0, 0, 0], 0.003)),
      "cv_steel",
      [x + side * (halfW - 0.04), sillY, z],
    );
  }

  // 前壁：3 扇前视窗，中窗作为第一人称目标窗。
  part(`front_lower`, "舰桥前壁下槛", M(B(width, 0.16, 0.06, [0, 0, 0], 0.004)), "cv_hull", [x, y + 0.11, z + halfL]);
  part(`front_header`, "舰桥前壁上楣", M(B(width, 0.21, 0.06, [0, 0, 0], 0.004)), "cv_hull", [x, y + 0.635, z + halfL]);
  for (const [tag, gx] of [["p", -0.5], ["c", 0], ["s", 0.5]] as const) {
    part(
      `front_glass_${tag}`,
      tag === "c" ? "舰桥前视窗" : `舰桥前视窗 ${tag}`,
      M(B(0.38, glassH, 0.02, [0, 0, 0], 0.002)),
      "cv_bridge_glass",
      [x + gx, glassY, z + halfL + 0.005],
    );
  }
  for (const gx of [-0.72, -0.25, 0.25, 0.72] as const) {
    part(
      `front_mullion_${Math.round((gx + 1) * 100)}`,
      "舰桥前窗竖梃",
      M(B(0.06, glassH, 0.06, [0, 0, 0], 0.003)),
      "cv_steel_dark",
      [x + gx, glassY, z + halfL],
    );
  }
  part(`front_sill`, "舰桥前窗内窗台", M(B(width - 0.08, 0.02, 0.1, [0, 0, 0], 0.003)), "cv_steel", [x, sillY, z + halfL - 0.04]);

  // 后壁 + 滑动门（关闭状态，门轮/观察窗）。
  const doorX = x + 0.28;
  const doorW = 0.34;
  const doorH = 0.5;
  const leftW = doorX - doorW / 2 - (x - halfW);
  const rightW = x + halfW - (doorX + doorW / 2);
  part(`rear_wall_l`, "舰桥后壁左段", M(B(leftW, 0.72, 0.06, [0, 0, 0], 0.004)), "cv_hull", [x - halfW + leftW / 2, y + 0.38, z - halfL]);
  part(`rear_wall_r`, "舰桥后壁右段", M(B(rightW, 0.72, 0.06, [0, 0, 0], 0.004)), "cv_hull", [x + halfW - rightW / 2, y + 0.38, z - halfL]);
  part(`rear_header`, "舰桥后壁门楣", M(B(doorW, 0.22, 0.06, [0, 0, 0], 0.004)), "cv_hull", [doorX, y + 0.63, z - halfL]);
  for (const dx of [-1, 1] as const) {
    part(`door_frame_${dx < 0 ? "l" : "r"}`, "舰桥后门框", M(B(0.04, doorH, 0.08, [0, 0, 0], 0.003)), "cv_steel_dark", [doorX + dx * (doorW / 2 + 0.02), floorY + doorH / 2, z - halfL]);
  }
  part(`door_leaf`, "舰桥后门", M(B(doorW, doorH, 0.03, [0, 0, 0], 0.004)), "cv_steel_dark", [doorX, floorY + doorH / 2, z - halfL + 0.02]);
  part(`door_wheel`, "舰桥后门门轮", M({ type: "torus", radius: 0.045, tube: 0.007, radialSegments: 8, tubularSegments: 16 }), "cv_steel", [doorX, floorY + 0.24, z - halfL + 0.04]);
  part(`door_port`, "舰桥后门观察窗", M(B(0.11, 0.09, 0.01, [0, 0, 0], 0.002)), "cv_bridge_glass", [doorX, floorY + 0.4, z - halfL + 0.04]);

  // ---- 舱内顶棚/灯带/地板条 ----
  [-1.85, 0, 1.85].forEach((cz, i) => {
    part(`ceiling_${i + 1}`, `舰桥顶棚板 ${i + 1}`, M(B(width - 0.1, 0.02, 1.7, [0, 0, 0], 0.004)), "cv_hull_dark", [x, floorY + 0.535, z + cz]);
  });
  for (const lx of [-0.24, 0.24] as const) {
    part(`ceiling_light_${lx < 0 ? "p" : "s"}`, "舰桥顶灯带", M(B(0.05, 0.012, 3.4, [0, 0, 0], 0.002)), "cv_glow", [x + lx, floorY + 0.525, z]);
  }
  part(`floor_walk`, "舰桥防滑走道", M(B(0.56, 0.006, len - 0.5, [0, 0, 0], 0.002)), "cv_deck_plate", [x, floorY + 0.004, z]);

  // ---- 操舰台 + 仪表盘组 ----
  part(`helm_console`, "操舰台", M(B(0.6, 0.09, 0.3, [0, 0, 0], 0.008), B(0.6, 0.03, 0.3, [0, 0.055, 0], 0.004)), "cv_steel_dark", [x, floorY + 0.08, z + 1.55]);
  part(`helm_board`, "操舰仪表盘", M(B(0.64, 0.16, 0.035, [0, 0, 0], 0.006)), "cv_gauge_face", [x, floorY + 0.19, z + 1.71]);
  const gaugeSpots = [
    [-0.2, 0.15],
    [0, 0.15],
    [0.2, 0.15],
    [-0.2, 0.21],
    [0, 0.21],
    [0.2, 0.21],
  ] as const;
  gaugeSpots.forEach(([gx, gy], index) => {
    const gyWorld = floorY + gy;
    part(
      `gauge_${index + 1}_ring`,
      `操舰仪表 ${index + 1} 表圈`,
      M({ type: "torus", radius: 0.029, tube: 0.0026, radialSegments: 8, tubularSegments: 20 }),
      "cv_gauge_mark",
      [x + gx, gyWorld, z + 1.688],
    );
    const ticks = Array.from({ length: 10 }, (_, t) => {
      const angle = (t / 10) * Math.PI * 2;
      return B(0.0025, 0.006, 0.0015, [Math.sin(angle) * 0.025, Math.cos(angle) * 0.025, 0]);
    });
    part(
      `gauge_${index + 1}_ticks`,
      `操舰仪表 ${index + 1} 刻度`,
      M(...ticks),
      "cv_gauge_mark",
      [x + gx, gyWorld, z + 1.687],
    );
    const node = BRIDGE_GAUGE_NODES[index]!;
    ctx.node({ name: node, parent: "root", pivot: [x + gx, gyWorld, z + 1.686], motion: "rotate", axis: "z", note: `操舰仪表 ${index + 1} 指针` });
    add({
      id: `${P}bridge_gauge_${index + 1}_needle`,
      name_cn: `操舰仪表 ${index + 1} 指针`,
      name_en: `bridge gauge needle ${index + 1}`,
      assembly: ASSEMBLY,
      build_layer: 4,
      geometry: M(B(0.0035, 0.032, 0.002, [0, 0.016, 0], 0.001)),
      material: "cv_gauge_mark",
      node,
      mate: A([0, 0, 0]),
    });
  });

  // 舵轮 + 轮柱 + 车钟
  part(`helm_pedestal`, "舵轮柱", M(C(0.024, 0.12, [0, 0, 0], 14), B(0.1, 0.05, 0.14, [0, 0.04, 0], 0.004)), "cv_steel_dark", [x, floorY + 0.06, z + 1.42]);
  part(`helm_shaft`, "舵轮轴", M({ type: "weld", from: [0, 0, -0.03], to: [0, 0, 0.03], radius: 0.008 }), "cv_steel", [x, floorY + 0.10, z + 1.395]);
  ctx.node({ name: BRIDGE_HELM_NODE, parent: "root", pivot: [x, floorY + 0.10, z + 1.37], motion: "rotate", axis: "z", note: "舰桥舵轮" });
  {
    const spokes = Array.from({ length: 8 }, (_, i) => {
      const angle = (i / 8) * Math.PI * 2;
      return { type: "weld" as const, from: [0, 0, 0] as [number, number, number], to: [Math.sin(angle) * 0.04, Math.cos(angle) * 0.04, 0] as [number, number, number], radius: 0.0035, seed: 700 + i };
    });
    add({
      id: `${P}bridge_helm_wheel`,
      name_cn: "舰桥舵轮",
      name_en: "bridge helm wheel",
      assembly: ASSEMBLY,
      build_layer: 4,
      geometry: M({ type: "torus", radius: 0.04, tube: 0.005, radialSegments: 8, tubularSegments: 20 }, S(0.012, [0, 0, 0], 12), ...spokes),
      material: "cv_steel",
      node: BRIDGE_HELM_NODE,
      mate: A([0, 0, 0]),
    });
  }
  part(`telegraph_pedestal`, "车钟座", M(C(0.028, 0.16, [0, 0, 0], 14), B(0.12, 0.02, 0.1, [0, 0.1, 0], 0.004)), "cv_steel_dark", [x + 0.26, floorY + 0.11, z + 1.45]);
  ctx.node({ name: BRIDGE_TELEGRAPH_NODE, parent: "root", pivot: [x + 0.26, floorY + 0.18, z + 1.45], motion: "rotate", axis: "z", note: "舰桥车钟" });
  add({
    id: `${P}bridge_telegraph_lever`,
    name_cn: "车钟手柄",
    name_en: "engine telegraph lever",
    assembly: ASSEMBLY,
    build_layer: 4,
    geometry: M(B(0.018, 0.12, 0.018, [0, 0.06, 0], 0.003), S(0.018, [0, 0.12, 0], 10)),
    material: "cv_brass",
    node: BRIDGE_TELEGRAPH_NODE,
    mate: A([0, 0, 0]),
  });
  part(`telegraph_scale`, "车钟刻度", M(...Array.from({ length: 5 }, () => B(0.004, 0.012, 0.002, [0, 0, 0])).map((g, i) => ({ ...g, at: [(i - 2) * 0.022, 0, 0] as [number, number, number] }))), "cv_gauge_mark", [x + 0.26, floorY + 0.15, z + 1.405]);

  // 罗经盆
  part(`binnacle_base`, "罗经盆座", M(C(0.045, 0.08, [0, 0, 0], 16), T(0.05, 0.042, 0.03, [0, 0.05, 0], 16)), "cv_steel_dark", [x - 0.24, floorY + 0.1, z + 1.5]);
  part(`binnacle_dome`, "罗经盆", M(S(0.038, [0, 0, 0], 16)), "cv_glass", [x - 0.24, floorY + 0.17, z + 1.5]);

  // ---- 海图桌 ----
  part(`chart_top`, "海图桌", M(B(0.5, 0.03, 0.36, [0, 0, 0], 0.006)), "cv_steel_dark", [x - 0.3, floorY + 0.15, z - 0.35]);
  for (const [lx, lz] of [[-0.21, -0.2], [0.21, -0.2], [-0.21, 0.2], [0.21, 0.2]] as const) {
    part(`chart_leg_${Math.round((lx + 1) * 100)}_${Math.round((lz + 1) * 100)}`, "海图桌腿", M(C(0.012, 0.15, [0, 0, 0], 10)), "cv_steel", [x - 0.3 + lx, floorY + 0.075, z - 0.35 + lz]);
  }
  part(`chart_paper`, "海图", M(B(0.44, 0.003, 0.3, [0, 0, 0], 0.001)), "cv_chart", [x - 0.3, floorY + 0.168, z - 0.35]);
  for (let r = 0; r < 4; r++) {
    part(
      `chart_route_${r + 1}`,
      `海图航线 ${r + 1}`,
      M({ type: "weld", from: [-0.18, 0, -0.1 + r * 0.06], to: [0.16, 0.001, -0.16 + r * 0.09], radius: 0.0015, seed: 810 + r }),
      "cv_deck_red",
      [x - 0.3, floorY + 0.171, z - 0.35],
    );
  }
  part(`chart_ruler`, "海图平行尺", M(B(0.24, 0.008, 0.03, [0, 0, 0], 0.002)), "cv_steel", [x - 0.36, floorY + 0.175, z - 0.27], [0, 18, 0]);
  part(`chart_divider`, "海图分规", M({ type: "weld", from: [0, 0, 0], to: [0.03, 0.002, 0.07], radius: 0.0025 }, { type: "weld", from: [0, 0, 0], to: [-0.03, 0.002, 0.07], radius: 0.0025 }), "cv_steel", [x - 0.18, floorY + 0.172, z - 0.42]);

  // ---- 两侧显控台：雷达屏 + 通信台 ----
  part(`radar_console`, "雷达显控台", M(B(0.32, 0.12, 0.3, [0, 0, 0], 0.006)), "cv_steel_dark", [x - 0.47, floorY + 0.06, z + 1.55]);
  part(`radar_board`, "雷达显控屏框", M(B(0.34, 0.24, 0.03, [0, 0, 0], 0.006)), "cv_steel_dark", [x - 0.47, floorY + 0.13, z + 1.71]);
  part(`radar_screen`, "相控阵雷达显示屏", M(B(0.24, 0.16, 0.008, [0, 0, 0], 0.002)), "cv_screen", [x - 0.47, floorY + 0.13, z + 1.686]);
  for (const [ri, rr] of [0.074, 0.05, 0.026].entries()) {
    part(`radar_ring_${ri + 1}`, `雷达距离圈 ${ri + 1}`, M({ type: "torus", radius: rr, tube: 0.0018, radialSegments: 6, tubularSegments: 24 }), "cv_glow", [x - 0.47, floorY + 0.13, z + 1.68]);
  }
  ctx.node({ name: BRIDGE_RADAR_SWEEP_NODE, parent: "root", pivot: [x - 0.47, floorY + 0.13, z + 1.672], motion: "rotate", axis: "z", note: "雷达扫描线" });
  add({
    id: `${P}bridge_radar_sweep`,
    name_cn: "雷达扫描线",
    name_en: "radar sweep",
    assembly: ASSEMBLY,
    build_layer: 4,
    geometry: M({ type: "weld", from: [0, 0, 0], to: [0, 0.075, 0], radius: 0.0018 }),
    material: "cv_glow",
    node: BRIDGE_RADAR_SWEEP_NODE,
    mate: A([0, 0, 0]),
  });
  part(`comms_console`, "通信台", M(B(0.32, 0.12, 0.3, [0, 0, 0], 0.006)), "cv_steel_dark", [x + 0.47, floorY + 0.06, z + 1.55]);
  part(`comms_board`, "通信显控屏框", M(B(0.34, 0.24, 0.03, [0, 0, 0], 0.006)), "cv_steel_dark", [x + 0.47, floorY + 0.13, z + 1.71]);
  part(`comms_screen`, "通信显控屏", M(B(0.22, 0.14, 0.008, [0, 0, 0], 0.002)), "cv_screen", [x + 0.47, floorY + 0.13, z + 1.692]);
  for (let k = 0; k < 6; k++) {
    part(`comms_knob_${k + 1}`, `通信台旋钮 ${k + 1}`, M(C(0.008, 0.016, [0, 0, 0], 10)), "cv_steel", [x + 0.36 + (k % 3) * 0.05, floorY + 0.13, z + 1.58 + Math.floor(k / 3) * 0.05]);
  }
  part(`comms_handset`, "通信话筒", M(B(0.035, 0.1, 0.025, [0, 0, 0], 0.004), C(0.012, 0.05, [0.03, 0.04, 0], 10)), "cv_steel", [x + 0.62, floorY + 0.16, z + 1.5]);

  // ---- 座椅（驾驶/航海/通信） ----
  const seat = (tag: string, sx: number, sz: number, backId?: string) => {
    part(`${tag}_pedestal`, `${tag} 座椅立柱`, M(C(0.026, 0.1, [0, 0, 0], 12)), "cv_steel", [sx, floorY + 0.05, sz]);
    part(`${tag}_cushion`, `${tag} 坐垫`, M(B(0.14, 0.04, 0.14, [0, 0, 0], 0.006)), "cv_upholstery", [sx, floorY + 0.1, sz]);
    add({
      id: `${P}bridge_${backId ?? `${tag}_back`}`,
      name_cn: `${tag} 靠背`,
      name_en: `${tag} seat back`,
      assembly: ASSEMBLY,
      build_layer: 4,
      geometry: M(B(0.14, 0.12, 0.03, [0, 0, 0], 0.006)),
      material: "cv_upholstery",
      mate: A([sx, floorY + 0.17, sz - 0.07]),
    });
    part(`${tag}_headrest`, `${tag} 头枕`, M(B(0.07, 0.05, 0.03, [0, 0, 0], 0.005)), "cv_upholstery", [sx, floorY + 0.255, sz - 0.07]);
    for (const ax of [-1, 1] as const) {
      part(`${tag}_arm_${ax < 0 ? "p" : "s"}`, `${tag} 扶手`, M(B(0.03, 0.02, 0.12, [0, 0, 0], 0.004)), "cv_steel_dark", [sx + ax * 0.085, floorY + 0.17, sz]);
    }
  };
  seat("captain", x, z + 0.82, "captain_seat_back");
  seat("navigator", x - 0.47, z + 0.95);
  seat("comms", x + 0.47, z + 0.95);

  // ---- 舱内附件：消防瓶/扶手/时钟 ----
  part(`fire_bottle`, "舰桥消防瓶", M(C(0.026, 0.14, [0, 0, 0], 12), C(0.012, 0.04, [0, 0.09, 0], 8)), "cv_deck_red", [x - 0.65, floorY + 0.1, z - 1.2]);
  part(`rear_handrail`, "舰桥后壁扶手", M({ type: "weld", from: [-0.6, 0, 0], to: [0.55, 0, 0], radius: 0.008 }), "cv_steel", [x, floorY + 0.3, z - halfL + 0.1]);
  part(`clock_face`, "舰桥时钟", M({ type: "torus", radius: 0.045, tube: 0.004, radialSegments: 8, tubularSegments: 20 }), "cv_steel", [x - 0.35, floorY + 0.34, z - halfL + 0.05]);
  part(`clock_hand_h`, "舰桥时钟时针", M(B(0.004, 0.025, 0.002, [0, 0.0125, 0], 0.001)), "cv_gauge_mark", [x - 0.35, floorY + 0.34, z - halfL + 0.052]);
  part(`clock_hand_m`, "舰桥时钟分针", M(B(0.003, 0.038, 0.002, [0, 0.019, 0], 0.001)), "cv_gauge_mark", [x - 0.35, floorY + 0.34, z - halfL + 0.053], [0, 0, 120]);
}