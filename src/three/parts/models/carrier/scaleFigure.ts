import { CV } from "./constants";
import { B, C, M, S, type CarrierCtx } from "./common";

// ============================================================================
// 1.8m 比例参照人（甲板作业人员）：真实高程 1.8m，随舰体 7.9× 展示比例换算。
// 用椭圆体/胶囊体放样，不堆方块；站在舰载机旁用于核对“人 vs 飞机 vs 航母”。
// ============================================================================

const SCALE = 7.9;
const H = 1.8 / SCALE;
const DECK = CV.DECK_Y + CV.DECK_T;

export function addScaleFigure(ctx: CarrierCtx): void {
  const P = "carrier.surface.scale_figure_";
  // 站在右舷起飞位外侧：弹射器 2 改到中线后，x=0.4 正好压进弹射滑跑线。
  const x = 3.0;
  const z = 12.0;
  const add = (
    id: string,
    name_cn: string,
    geometry: Parameters<typeof M>[0],
    material: string,
    at: [number, number, number],
    rotation?: [number, number, number],
    scale?: [number, number, number],
  ) =>
    ctx.add({
      id: `${P}${id}`,
      name_cn,
      name_en: `1.8m reference ${id.replace(/_/g, " ")}`,
      assembly: "surface",
      build_layer: 5,
      geometry,
      material,
      mate: {
        type: "absolute",
        position: [x + at[0], DECK + at[1], z + at[2]],
        ...(rotation ? { rotation } : {}),
      },
      ...(scale ? { scale } : {}),
    });

  // 靴底 = 甲板面；头顶点 = 1.8m。
  const foot = 0;
  const hip = H * 0.52;
  const chest = H * 0.73;
  const neck = H * 0.83;
  const headC = H - H * 0.09;
  for (const side of [-1, 1] as const) {
    const tag = side === -1 ? "l" : "r";
    add(`boot_${tag}`, `比例人靴子 ${tag.toUpperCase()}`, M(B(0.024, 0.016, 0.042, [0, 0, 0.006], 0.005)), "cv_steel_dark", [side * 0.011, foot + 0.008, 0.006]);
    add(`leg_${tag}`, `比例人小腿 ${tag.toUpperCase()}`, M(C(0.011, H * 0.23, [0, 0, 0], 12)), "cv_aircraft_dark", [side * 0.011, H * 0.18, 0], [0, 0, side * 1.5]);
    add(`thigh_${tag}`, `比例人大腿 ${tag.toUpperCase()}`, M(C(0.014, H * 0.24, [0, 0, 0], 12)), "cv_aircraft_dark", [side * 0.012, H * 0.38, 0], [0, 0, side * 1]);
    add(`arm_${tag}`, `比例人手臂 ${tag.toUpperCase()}`, M(C(0.009, H * 0.3, [0, 0, 0], 12), S(0.011, [0, -H * 0.16, 0], 12)), "cv_upholstery", [side * 0.026, chest - H * 0.03, 0], [0, 0, side * -4]);
    add(`shoulder_${tag}`, `比例人肩 ${tag.toUpperCase()}`, M(S(0.016, [0, 0, 0], 14)), "cv_upholstery", [side * 0.024, chest, 0]);
  }
  add("pelvis", "比例人骨盆", M(S(0.032, [0, 0, 0], 16)), "cv_aircraft_dark", [0, hip, 0], undefined, [1, 0.75, 0.62]);
  add("torso", "比例人躯干", M(S(0.032, [0, 0, 0], 18)), "cv_upholstery", [0, chest - H * 0.055, 0], undefined, [1.0, 1.5, 0.62]);
  add("vest", "比例人救生背心", M(S(0.03, [0, 0, 0], 18)), "cv_warning", [0, chest - H * 0.04, 0.006], undefined, [1.0, 1.25, 0.55]);
  add("neck", "比例人颈", M(C(0.008, H * 0.035, [0, 0, 0], 10)), "cv_aircraft_belly", [0, neck, 0]);
  add("head", "比例人头部", M(S(0.017, [0, 0, 0], 18)), "cv_aircraft_belly", [0, headC, 0], undefined, [0.9, 1.05, 0.95]);
  add("helmet", "比例人头盔", M(S(0.019, [0, 0, 0], 18)), "cv_warning", [0, headC + 0.004, -0.002], undefined, [1, 0.8, 1]);
  add("visor", "比例人头盔面罩", M(B(0.022, 0.008, 0.006, [0, 0, 0], 0.0015)), "cv_gauge_face", [0, headC + 0.002, 0.016]);
  add("radio", "比例人手持对讲机", M(B(0.01, 0.022, 0.008, [0, 0, 0], 0.0015), C(0.002, 0.012, [0, 0.017, 0], 6)), "cv_steel_dark", [0.034, chest - H * 0.1, 0.006]);
}
