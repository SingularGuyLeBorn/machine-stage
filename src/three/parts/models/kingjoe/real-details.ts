import type { KingJoeParts } from "./helpers";
import { absMate, pid } from "./helpers";

// ============================================================================
// models/kingjoe/real-details —— 真实皮上的招牌细节（叠加件）
//
// 坐标取自真实网格表面采样：胸前面 z≈0.734（x±0.45 / y5.1）。
// 彩虹格栅为分层叠件（每层留 5mm 间隙）；额头发射体是独立零件。
// ============================================================================

const RAINBOW = [
  "kjr_rainbow_rose",
  "kjr_rainbow_amber",
  "kjr_rainbow_green",
  "kjr_rainbow_teal",
  "kjr_rainbow_blue",
  "kjr_rainbow_violet",
  "kjr_rainbow_teal",
] as const;

const PANEL_X = 0.45;
const PANEL_Y = 0.36;
const PANEL_Z = 0.8;

export function addRealMeshDetails(builder: KingJoeParts): void {
  // —— 胸口双格栅：银框 → 黑背板 → 7 条彩虹带 → 5 条横栅 ——
  builder.add({
    id: pid("chest", "rainbow_frame"),
    name_cn: "胸口彩虹格栅银框",
    name_en: "chest rainbow grille frame",
    assembly: "chest",
    layer: 5,
    geometry: { type: "kit", kit: "kjChamferPlate", params: { w: 0.5, h: 0.62, t: 0.04, corner: 0.06 } },
    material: "kjr_silver_dark",
    node: "chest",
    mate: absMate([PANEL_X, PANEL_Y, PANEL_Z]),
    dual: true,
    source: "参考实拍：两块横置彩虹格栅；按真实网格胸前面 z≈0.734 定位",
  });
  builder.add({
    id: pid("chest", "rainbow_back"),
    name_cn: "胸口彩虹格栅黑背板",
    name_en: "chest rainbow grille backing",
    assembly: "chest",
    layer: 5,
    geometry: { type: "kit", kit: "kjChamferPlate", params: { w: 0.46, h: 0.58, t: 0.02, corner: 0.045 } },
    material: "kjr_black",
    node: "chest",
    mate: absMate([PANEL_X, PANEL_Y, PANEL_Z + 0.035]),
    dual: true,
  });

  const bands = RAINBOW.length;
  for (let i = 0; i < bands; i++) {
    const y = PANEL_Y + (i - (bands - 1) / 2) * 0.077;
    builder.add({
      id: pid("chest", `rainbow_band_${i}`),
      name_cn: `胸口彩虹带 ${i + 1}/${bands}`,
      name_en: `chest rainbow band ${i + 1}`,
      assembly: "chest",
      layer: 5,
      geometry: { type: "box", w: 0.42, h: 0.058, d: 0.01, bevel: 0.003 },
      material: RAINBOW[i]!,
      node: "chest",
      mate: absMate([PANEL_X, y, PANEL_Z + 0.055]),
      dual: true,
    });
  }
  for (let i = 0; i < 5; i++) {
    const y = PANEL_Y + (i - 2) * 0.125;
    builder.add({
      id: pid("chest", `rainbow_louver_${i}`),
      name_cn: `胸口横栅 ${i + 1}/5`,
      name_en: `chest grille louver ${i + 1}`,
      assembly: "chest",
      layer: 5,
      geometry: { type: "box", w: 0.44, h: 0.012, d: 0.01, bevel: 0.002 },
      material: "kjr_black",
      node: "chest",
      mate: absMate([PANEL_X, y, PANEL_Z + 0.07]),
      dual: true,
    });
  }
  builder.add({
    id: pid("chest", "rainbow_spine"),
    name_cn: "胸口中央脊",
    name_en: "chest center spine",
    assembly: "chest",
    layer: 5,
    geometry: { type: "box", w: 0.05, h: 0.54, d: 0.04, bevel: 0.01 },
    material: "kjr_silver_dark",
    node: "chest",
    mate: absMate([0, 0.38, PANEL_Z]),
  });

  // —— 头部：真实圆顶不做平板眼带；保留额头发射体 ——
  builder.add({
    id: pid("ship", "forehead_emitter"),
    name_cn: "额头发射体",
    name_en: "forehead emitter",
    assembly: "ship",
    layer: 5,
    geometry: { type: "cylinder", r: 0.032, h: 0.02, segments: 16, bevel: 0.004 },
    material: "forehead_glow",
    node: "ship",
    mate: absMate([0, 0.64, 0.38], [72, 0, 0]),
  });
}
