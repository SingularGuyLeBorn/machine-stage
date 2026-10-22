import { A, type CarrierCtx } from "./common";

// ============================================================================
// 海面与航行尾流（fx）：透明海面透出水下舰体/桨舵，艏浪与艉流给出航态。
// 这些件只参与展示，不参与结构检测（tag fx）。
// ============================================================================

const ASSEMBLY = "sea";
const P = "carrier.sea.";

export function addSea(ctx: CarrierCtx): void {
  const add = (part: Parameters<CarrierCtx["add"]>[0]) => ctx.add(part);

  add({
    id: `${P}surface`,
    name_cn: "海面（半透明涌浪）",
    name_en: "sea surface",
    assembly: ASSEMBLY,
    build_layer: 5,
    tags: ["fx"],
    geometry: { type: "kit", kit: "carrierSeaSurface" },
    material: "cv_sea",
    mate: A([0, 0, 0]),
    source: "涌浪网格 44×88；半透明以透出红色水下舰体、球鼻艏、螺旋桨与舵。",
  });
  add({
    id: `${P}bow_wave`,
    name_cn: "艏浪",
    name_en: "bow wave",
    assembly: ASSEMBLY,
    build_layer: 5,
    tags: ["fx"],
    geometry: { type: "kit", kit: "carrierBowWave" },
    material: "cv_foam",
    mate: A([0, 0, 0]),
  });
  add({
    id: `${P}stern_wake`,
    name_cn: "艉流/开尔文尾迹",
    name_en: "stern wake",
    assembly: ASSEMBLY,
    build_layer: 5,
    tags: ["fx"],
    geometry: { type: "kit", kit: "carrierSternWake" },
    material: "cv_foam",
    mate: A([0, 0, 0]),
  });
}
