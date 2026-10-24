import { A, B, C, M, type CarrierCtx } from "./common";

// ============================================================================
// 福建舰船员生活区（编辑尺度 1:8）
// 水下住舱：三层铺位 / 餐桌 / 厨房 / 卫生间 / 储物柜 / 休息区。
// ============================================================================

const P = "carrier.crew.";
const FLOOR = 1.32;
const CEIL = 1.78;
const X = 0;
const Z = 8.0;
const HALF_W = 0.9;
const HALF_L = 1.45;

export function addCarrierCrew(ctx: CarrierCtx): void {
  const add = (part: Parameters<CarrierCtx["add"]>[0]) => ctx.add(part);
  const part = (
    id: string,
    name_cn: string,
    geometry: Parameters<typeof M>[0],
    material: string,
    at: [number, number, number],
  ) =>
    add({
      id: `${P}${id}`,
      name_cn,
      name_en: id.replace(/_/g, " "),
      assembly: "crew",
      build_layer: 4,
      geometry,
      material,
      mate: A(at),
    });

  part("shell", "船员生活区围壁/甲板", M(
    B(HALF_W * 2, 0.04, HALF_L * 2, [X, FLOOR, Z], 0.006),
    B(HALF_W * 2, 0.03, HALF_L * 2, [X, CEIL, Z], 0.006),
    B(0.03, CEIL - FLOOR, HALF_L * 2, [X - HALF_W, (FLOOR + CEIL) / 2, Z], 0.004),
    B(0.03, CEIL - FLOOR, HALF_L * 2, [X + HALF_W, (FLOOR + CEIL) / 2, Z], 0.004),
    B(HALF_W * 2, CEIL - FLOOR, 0.03, [X, (FLOOR + CEIL) / 2, Z - HALF_L], 0.004),
    B(HALF_W * 2, CEIL - FLOOR, 0.03, [X, (FLOOR + CEIL) / 2, Z + HALF_L], 0.004),
  ), "cv_055_acoustic", [0, 0, 0]);
  part("carpet", "船员生活区地毯", M(B(HALF_W * 1.9, 0.008, HALF_L * 1.9, [X, FLOOR + 0.025, Z], 0.003)), "cv_055_carpet", [0, 0, 0]);
  part("lights", "生活区顶灯 ×4", M(
    B(0.18, 0.012, 0.06, [X - 0.42, CEIL - 0.03, Z - 0.6], 0.002),
    B(0.18, 0.012, 0.06, [X + 0.42, CEIL - 0.03, Z - 0.6], 0.002),
    B(0.18, 0.012, 0.06, [X - 0.42, CEIL - 0.03, Z + 0.6], 0.002),
    B(0.18, 0.012, 0.06, [X + 0.42, CEIL - 0.03, Z + 0.6], 0.002),
  ), "cv_055_lamp", [0, 0, 0]);

  // 三层铺位（左右两列）
  const frame: Array<ReturnType<typeof B>> = [];
  const mattress: Array<ReturnType<typeof B>> = [];
  const bedding: Array<ReturnType<typeof B>> = [];
  for (const side of [-1, 1] as const) {
    const bx = X + side * 0.6;
    for (const y of [FLOOR + 0.12, FLOOR + 0.24, FLOOR + 0.36]) {
      frame.push(B(0.13, 0.01, 0.5, [bx, y, Z - 0.7], 0.002));
      frame.push(B(0.012, 0.1, 0.012, [bx - 0.06, y + 0.05, Z - 0.94], 0.001));
      frame.push(B(0.012, 0.1, 0.012, [bx + 0.06, y + 0.05, Z - 0.94], 0.001));
      frame.push(B(0.012, 0.1, 0.012, [bx - 0.06, y + 0.05, Z - 0.46], 0.001));
      frame.push(B(0.012, 0.1, 0.012, [bx + 0.06, y + 0.05, Z - 0.46], 0.001));
      mattress.push(B(0.11, 0.025, 0.44, [bx, y + 0.018, Z - 0.7], 0.006));
      bedding.push(B(0.09, 0.012, 0.1, [bx, y + 0.04, Z - 0.9], 0.004));
    }
    frame.push(B(0.012, 0.24, 0.012, [bx, FLOOR + 0.16, Z - 0.44], 0.001));
    for (let r = 0; r < 3; r++) frame.push(B(0.08, 0.008, 0.012, [bx, FLOOR + 0.08 + r * 0.06, Z - 0.44], 0.001));
    frame.push(B(0.12, 0.12, 0.18, [bx, FLOOR + 0.07, Z - 0.35], 0.004));
  }
  part("bunks", "三层铺位/爬梯", M(...frame), "cv_steel_dark", [0, 0, 0]);
  part("mattresses", "铺位床垫", M(...mattress), "cv_upholstery", [0, 0, 0]);
  part("bedding", "床单/枕头", M(...bedding), "cv_deck_line", [0, 0, 0]);

  // 餐桌/长凳/储物柜/厨房/卫生间/休息区
  part("mess", "船员餐桌/长凳", M(
    B(0.38, 0.018, 0.18, [X, FLOOR + 0.16, Z + 0.65], 0.004),
    B(0.018, 0.14, 0.16, [X - 0.15, FLOOR + 0.07, Z + 0.65], 0.002),
    B(0.018, 0.14, 0.16, [X + 0.15, FLOOR + 0.07, Z + 0.65], 0.002),
    B(0.36, 0.012, 0.055, [X, FLOOR + 0.1, Z + 0.78], 0.002),
    B(0.36, 0.012, 0.055, [X, FLOOR + 0.1, Z + 0.52], 0.002),
    C(0.018, 0.05, [X - 0.1, FLOOR + 0.2, Z + 0.65], 10),
    C(0.018, 0.05, [X + 0.1, FLOOR + 0.2, Z + 0.65], 10),
  ), "cv_055_console_top", [0, 0, 0]);
  part("lockers", "个人储物柜 ×6", M(
    ...[-0.6, -0.3, 0, 0.3, 0.6].map((dx) => B(0.18, 0.3, 0.08, [X + dx, FLOOR + 0.18, Z + HALF_L - 0.066], 0.003)),
    ...[-0.6, -0.3, 0, 0.3, 0.6].map((dx) => B(0.025, 0.05, 0.012, [X + dx + 0.04, FLOOR + 0.18, Z + HALF_L - 0.11], 0.001)),
  ), "cv_055_console", [0, 0, 0]);
  part("galley", "生活区厨房/配餐台", M(
    B(0.18, 0.22, 0.7, [X - HALF_W + 0.12, FLOOR + 0.13, Z + 0.2], 0.006),
    B(0.2, 0.014, 0.7, [X - HALF_W + 0.12, FLOOR + 0.25, Z + 0.2], 0.003),
    B(0.18, 0.3, 0.18, [X - HALF_W + 0.12, FLOOR + 0.17, Z + 0.72], 0.006),
    B(0.1, 0.015, 0.14, [X - HALF_W + 0.12, FLOOR + 0.26, Z + 0.3], 0.002),
    B(0.22, 0.1, 0.18, [X - HALF_W + 0.13, FLOOR + 0.38, Z + 0.2], 0.004),
  ), "cv_steel_dark", [0, 0, 0]);
  part("galley_white", "水槽/灶台", M(
    B(0.15, 0.008, 0.14, [X - HALF_W + 0.12, FLOOR + 0.258, Z + 0.38], 0.002),
    B(0.15, 0.01, 0.16, [X - HALF_W + 0.12, FLOOR + 0.262, Z + 0.12], 0.002),
  ), "cv_deck_line", [0, 0, 0]);
  part("heads", "卫生间/淋浴", M(
    B(0.38, 0.034, 0.012, [X + 0.48, FLOOR + 0.18, Z - 0.02], 0.002),
    B(0.012, 0.034, 0.34, [X + 0.29, FLOOR + 0.18, Z - 0.17], 0.002),
    B(0.012, 0.034, 0.34, [X + 0.67, FLOOR + 0.18, Z - 0.17], 0.002),
    C(0.05, 0.06, [X + 0.48, FLOOR + 0.055, Z - 0.12], 12),
    B(0.11, 0.014, 0.08, [X + 0.48, FLOOR + 0.13, Z - 0.26], 0.002),
    C(0.008, 0.16, [X + 0.3, FLOOR + 0.16, Z - 0.04], 8),
  ), "cv_deck_line", [0, 0, 0]);
  part("lounge", "休息区/沙发/电视", M(
    B(0.28, 0.12, 0.14, [X, FLOOR + 0.06, Z - 1.12], 0.008),
    B(0.28, 0.16, 0.02, [X, FLOOR + 0.13, Z - 1.2], 0.004),
    B(0.3, 0.18, 0.012, [X, FLOOR + 0.28, Z - HALF_L + 0.04], 0.002),
  ), "cv_upholstery", [0, 0, 0]);
  part("tv", "休息区电视", M(B(0.28, 0.16, 0.008, [X, FLOOR + 0.28, Z - HALF_L + 0.05], 0.002)), "cv_scr_camera", [0, 0, 0]);
  part("signage", "生活区标识/应急灯", M(
    B(0.18, 0.035, 0.008, [X, CEIL - 0.07, Z + HALF_L - 0.05], 0.002),
    C(0.015, 0.014, [X - HALF_W + 0.04, CEIL - 0.07, Z + 0.4], 8),
  ), "cv_deck_red", [0, 0, 0]);

  add({
    id: `${P}view_mount`,
    name_cn: "生活区视点",
    name_en: "crew view mount",
    assembly: "crew",
    build_layer: 4,
    geometry: M(B(0.06, 0.12, 0.06, [X, FLOOR + 0.06, Z + 0.72], 0.003)),
    material: "cv_steel_dark",
    mate: A([0, 0, 0]),
  });
}
