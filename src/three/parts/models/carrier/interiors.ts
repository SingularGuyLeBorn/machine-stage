import { CV } from "./constants";
import { A, B, C, M, type CarrierCtx } from "./common";

// ============================================================================
// 内部舱室设备：机舱控制站 / 反应堆控制站 / 弹药库检验站 / 机库控制台
// 每个站都有实体台体、仪表、显控屏和座椅；第一人称眼点从座椅靠背派生。
// ============================================================================

const POWER = "power";
const HANGAR = "hangar";

export const ENGINE_GAUGE_NODES = ["CV_EngineGauge_1", "CV_EngineGauge_2", "CV_EngineGauge_3"] as const;
export const REACTOR_GAUGE_NODES = ["CV_ReactorGauge_1", "CV_ReactorGauge_2", "CV_ReactorGauge_3"] as const;
export const MAGAZINE_GAUGE_NODES = ["CV_MagazineGauge_1", "CV_MagazineGauge_2"] as const;

function localAdd(ctx: CarrierCtx, assembly: string, layer: 1 | 2) {
  return (id: string, name_cn: string, geometry: Parameters<typeof M>[0], material: string, at: [number, number, number], rotation?: [number, number, number]) =>
    ctx.add({
      id,
      name_cn,
      name_en: id.split(".").pop()?.replace(/_/g, " ") ?? id,
      assembly,
      build_layer: layer,
      geometry,
      material,
      mate: A(at, rotation),
    });
}

function gaugeGroup(
  ctx: CarrierCtx,
  assembly: string,
  layer: 1 | 2,
  prefix: string,
  nodes: readonly string[],
  ox: number,
  oy: number,
  oz: number,
) {
  const add = localAdd(ctx, assembly, layer);
  nodes.forEach((node, index) => {
    const gx = ox + (index - (nodes.length - 1) / 2) * 0.23;
    add(`${prefix}_gauge_${index + 1}_ring`, `仪表 ${index + 1} 表圈`, M({ type: "torus", radius: 0.028, tube: 0.0025, radialSegments: 8, tubularSegments: 18 }), "cv_gauge_mark", [gx, oy, oz + 0.003]);
    add(`${prefix}_gauge_${index + 1}_ticks`, `仪表 ${index + 1} 刻度`, M(...Array.from({ length: 8 }, (_, t) => {
      const a = (t / 8) * Math.PI * 2;
      return B(0.0025, 0.006, 0.0015, [Math.sin(a) * 0.024, Math.cos(a) * 0.024, 0]);
    })), "cv_gauge_mark", [gx, oy, oz + 0.004]);
    ctx.node({ name: node, parent: "root", pivot: [gx, oy, oz + 0.006], motion: "rotate", axis: "z", note: `仪表 ${index + 1} 指针` });
    ctx.add({
      id: `${prefix}_gauge_${index + 1}_needle`,
      name_cn: `仪表 ${index + 1} 指针`,
      name_en: `gauge needle ${index + 1}`,
      assembly,
      build_layer: layer,
      geometry: M(B(0.0035, 0.03, 0.002, [0, 0.015, 0], 0.001)),
      material: "cv_gauge_mark",
      node,
      mate: A([0, 0, 0]),
    });
  });
}

function seat(
  ctx: CarrierCtx,
  assembly: string,
  layer: 1 | 2,
  prefix: string,
  backId: string,
  sx: number,
  sy: number,
  sz: number,
  facing: 1 | -1,
) {
  const add = localAdd(ctx, assembly, layer);
  add(`${prefix}_seat_pedestal`, "操作座椅立柱", M(C(0.026, 0.1, [0, 0, 0], 12)), "cv_steel", [sx, sy + 0.05, sz]);
  add(`${prefix}_seat_cushion`, "操作座椅坐垫", M(B(0.15, 0.04, 0.14, [0, 0, 0], 0.006)), "cv_upholstery", [sx, sy + 0.1, sz]);
  ctx.add({
    id: backId,
    name_cn: "操作座椅靠背",
    name_en: "operator seat back",
    assembly,
    build_layer: layer,
    geometry: M(B(0.15, 0.14, 0.03, [0, 0, 0], 0.006)),
    material: "cv_upholstery",
    mate: A([sx, sy + 0.18, sz - facing * 0.07]),
  });
  add(`${prefix}_seat_head`, "操作座椅头枕", M(B(0.08, 0.05, 0.03, [0, 0, 0], 0.005)), "cv_upholstery", [sx, sy + 0.27, sz - facing * 0.07]);
  for (const ax of [-1, 1] as const) {
    add(`${prefix}_seat_arm_${ax < 0 ? "p" : "s"}`, "操作座椅扶手", M(B(0.03, 0.02, 0.12, [0, 0, 0], 0.004)), "cv_steel_dark", [sx + ax * 0.09, sy + 0.18, sz]);
  }
}

function valve(ctx: CarrierCtx, assembly: string, layer: 1 | 2, prefix: string, x: number, y: number, z: number) {
  const add = localAdd(ctx, assembly, layer);
  add(`${prefix}_valve_stem`, "阀杆", M(C(0.018, 0.12, [0, 0, 0], 10)), "cv_steel", [x, y, z]);
  add(`${prefix}_valve_wheel`, "阀门手轮", M({ type: "torus", radius: 0.06, tube: 0.008, radialSegments: 8, tubularSegments: 18 }, B(0.16, 0.012, 0.012, [0, 0, 0], 0.002), B(0.012, 0.012, 0.16, [0, 0, 0], 0.002)), "cv_deck_red", [x, y + 0.08, z]);
}

export function addCarrierInteriors(ctx: CarrierCtx): void {
  // ---------------- 机舱控制站 ----------------
  {
    const add = localAdd(ctx, POWER, 1);
    add("carrier.power.engine_control_floor", "机舱操作平台", M(B(1.2, 0.02, 1.3, [0, 0, 0], 0.004)), "cv_grate", [0, 1.335, -17.85]);
    add("carrier.power.engine_control_console", "机舱控制台", M(B(0.92, 0.16, 0.32, [0, 0, 0], 0.008), B(0.92, 0.04, 0.34, [0, 0.1, 0.02], 0.004)), "cv_steel_dark", [0, 1.44, -17.7]);
    add("carrier.power.engine_control_panel", "机舱仪表盘", M(B(0.98, 0.24, 0.035, [0, 0, 0], 0.006)), "cv_gauge_face", [0, 1.50, -17.56]);
    add("carrier.power.engine_control_screen", "机舱显控屏", M(B(0.46, 0.16, 0.008, [0, 0, 0], 0.002)), "cv_screen", [0, 1.42, -17.58]);
    gaugeGroup(ctx, POWER, 1, "carrier.power.engine", ENGINE_GAUGE_NODES, 0, 1.52, -17.58);
    seat(ctx, POWER, 1, "carrier.power.engine_control", "carrier.power.engine_control_seat_back", 0, 1.35, -18.05, 1);
    // 主蒸汽/冷却水管路与阀组。
    add("carrier.power.engine_pipe_a", "主蒸汽管路 A", M({ type: "weld", from: [-0.5, 1.53, -17.6], to: [-0.5, 2.03, -16.3], radius: 0.035 }), "cv_steel", [0, 0, 0]);
    add("carrier.power.engine_pipe_b", "主蒸汽管路 B", M({ type: "weld", from: [0.55, 1.53, -17.6], to: [0.55, 1.98, -16.3], radius: 0.03 }), "cv_steel", [0, 0, 0]);
    add("carrier.power.engine_pipe_c", "冷却水管路", M({ type: "weld", from: [-0.9, 1.43, -17.6], to: [-0.9, 1.68, -16.5], radius: 0.026 }), "cv_copper", [0, 0, 0]);
    valve(ctx, POWER, 1, "carrier.power.engine", -0.62, 1.68, -17.4);
    valve(ctx, POWER, 1, "carrier.power.engine_aux", 0.66, 1.66, -17.4);
  }

  // ---------------- 反应堆控制站 ----------------
  {
    const add = localAdd(ctx, POWER, 1);
    add("carrier.power.reactor_control_floor", "反应堆操作平台", M(B(1.2, 0.02, 1.25, [0, 0, 0], 0.004)), "cv_grate", [0, 1.335, -8.8]);
    add("carrier.power.reactor_control_console", "反应堆控制台", M(B(0.92, 0.16, 0.32, [0, 0, 0], 0.008), B(0.92, 0.04, 0.34, [0, 0.1, 0.02], 0.004)), "cv_steel_dark", [0, 1.44, -9.0]);
    add("carrier.power.reactor_control_panel", "反应堆仪表盘", M(B(0.98, 0.24, 0.035, [0, 0, 0], 0.006)), "cv_gauge_face", [0, 1.60, -9.16]);
    add("carrier.power.reactor_control_screen", "堆芯显控屏", M(B(0.46, 0.16, 0.008, [0, 0, 0], 0.002)), "cv_screen", [0, 1.51, -9.14]);
    gaugeGroup(ctx, POWER, 1, "carrier.power.reactor", REACTOR_GAUGE_NODES, 0, 1.61, -9.14);
    seat(ctx, POWER, 1, "carrier.power.reactor_control", "carrier.power.reactor_control_seat_back", 0, 1.35, -8.63, -1);
    add("carrier.power.reactor_pipe_hot", "一回路热管段", M({ type: "weld", from: [-0.55, 1.53, -9.2], to: [-0.55, 2.08, -10.1], radius: 0.038 }), "cv_copper", [0, 0, 0]);
    add("carrier.power.reactor_pipe_cold", "一回路冷管段", M({ type: "weld", from: [0.55, 1.53, -9.2], to: [0.55, 2.08, -10.1], radius: 0.036 }), "cv_steel", [0, 0, 0]);
    valve(ctx, POWER, 1, "carrier.power.reactor", -0.66, 1.70, -9.45);
    add("carrier.power.reactor_warning", "辐射警示牌", M(B(0.24, 0.16, 0.006, [0, 0, 0], 0.002)), "cv_warning", [0.5, 1.76, -9.17]);
  }

  // ---------------- 弹药库检验站 ----------------
  {
    const add = localAdd(ctx, HANGAR, 2);
    add("carrier.hangar.magazine_control_floor", "弹药库检验平台", M(B(1.1, 0.02, 1.1, [0, 0, 0], 0.004)), "cv_grate", [1.4, CV.LOWER_DECK_Y + 0.085, -3.0]);
    add("carrier.hangar.magazine_control_console", "弹药检验台", M(B(0.84, 0.15, 0.3, [0, 0, 0], 0.008)), "cv_steel_dark", [1.4, CV.LOWER_DECK_Y + 0.19, -3.13]);
    add("carrier.hangar.magazine_control_panel", "弹药库存显控", M(B(0.9, 0.28, 0.035, [0, 0, 0], 0.006)), "cv_steel_dark", [1.4, CV.LOWER_DECK_Y + 0.35, -3.29]);
    add("carrier.hangar.magazine_control_screen", "弹药库存屏", M(B(0.42, 0.17, 0.008, [0, 0, 0], 0.002)), "cv_screen", [1.4, CV.LOWER_DECK_Y + 0.35, -3.27]);
    gaugeGroup(ctx, HANGAR, 2, "carrier.hangar.magazine", MAGAZINE_GAUGE_NODES, 1.68, CV.LOWER_DECK_Y + 0.35, -3.25);
    seat(ctx, HANGAR, 2, "carrier.hangar.magazine_control", "carrier.hangar.magazine_control_seat_back", 2.35, CV.LOWER_DECK_Y + 0.1, -3.05, -1);
    add("carrier.hangar.magazine_inspection_tray", "弹药检验托盘", M(B(0.3, 0.03, 0.2, [0, 0, 0], 0.004)), "cv_steel", [1.16, CV.LOWER_DECK_Y + 0.27, -3.13]);
    add("carrier.hangar.magazine_inspection_round", "待检弹药", M(C(0.04, 0.32, [0, 0, 0], 12), C(0.014, 0.1, [0, 0.2, 0], 10)), "cv_steel", [1.16, CV.LOWER_DECK_Y + 0.39, -3.13], [90, 0, 0]);
  }

  // ---------------- 机库控制台 ----------------
  {
    const add = localAdd(ctx, HANGAR, 2);
    const deckY = CV.HANGAR_Y + 0.14;
    add("carrier.hangar.hangar_control_podium", "机库控制台", M(B(0.94, 0.16, 0.34, [0, 0, 0], 0.008), B(0.94, 0.04, 0.36, [0, 0.1, 0.02], 0.004)), "cv_steel_dark", [2.3, deckY + 0.03, 10.0]);
    add("carrier.hangar.hangar_control_board", "机库状态板", M(B(1.0, 0.36, 0.035, [0, 0, 0], 0.006)), "cv_steel_dark", [3.05, deckY + 0.3, 9.9]);
    add("carrier.hangar.hangar_control_screen", "机库调度屏", M(B(0.5, 0.22, 0.008, [0, 0, 0], 0.002)), "cv_screen", [3.05, deckY + 0.3, 9.92]);
    seat(ctx, HANGAR, 2, "carrier.hangar.hangar_control", "carrier.hangar.hangar_control_seat_back", 2.3, deckY - 0.04, 10.35, -1);
    add("carrier.hangar.hangar_control_phone", "机库调度电话", M(B(0.04, 0.1, 0.03, [0, 0, 0], 0.004), C(0.012, 0.05, [0.03, 0.04, 0], 10)), "cv_steel", [3.4, deckY + 0.24, 10.0]);
  }
}
