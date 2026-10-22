import type { BuildLayer, PartDefinition } from "../../registry/types";

// ============================================================================
// models/kingjoe-skin/details —— 在真实网格上加的标志件
//   · 胸口两块彩虹盾栅（分件叠加，不改真实网格）
//   · 头部横眼带 + 双眼 + 小口
// 几何坐标均已转到模块局部（胸 4.55 / 头 5.65）。
// ============================================================================

const BAND_MATERIALS = [
  "kjr_rainbow_violet",
  "kjr_rainbow_blue",
  "kjr_rainbow_teal",
  "kjr_rainbow_green",
  "kjr_rainbow_amber",
  "kjr_rainbow_rose",
  "kjr_rainbow_green",
  "kjr_rainbow_teal",
];

function shieldPoints(scaleX = 1, scaleY = 1, inset = 0): Array<[number, number]> {
  const pts: Array<[number, number]> = [
    [-0.17, 0.5], [0.17, 0.5], [0.31, 0.45], [0.38, 0.36],
    [0.395, 0.2], [0.39, -0.08], [0.34, -0.27], [0.23, -0.4],
    [0.09, -0.48], [0, -0.5], [-0.09, -0.48], [-0.23, -0.4],
    [-0.34, -0.27], [-0.39, -0.08], [-0.395, 0.2], [-0.38, 0.36], [-0.31, 0.45],
  ];
  const k = 1 - inset;
  return pts.map(([x, y]) => [x * scaleX * k, y * scaleY * k]);
}

function halfWidth(y: number, scaleX: number, scaleY: number, inset: number): number {
  const pts = shieldPoints(scaleX, scaleY, inset);
  const yy = Math.max(-0.5 * scaleY, Math.min(0.5 * scaleY, y));
  const half = pts
    .filter(([x]) => x > 0.001)
    .map(([x, y0]) => [y0, x] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  for (let i = 0; i < half.length - 1; i++) {
    const [ya, xa] = half[i];
    const [yb, xb] = half[i + 1];
    if (yy >= ya && yy <= yb) {
      const t = yb - ya < 1e-6 ? 0 : (yy - ya) / (yb - ya);
      return xa + (xb - xa) * t;
    }
  }
  return 0;
}

interface Detail extends PartDefinition {
  layer: BuildLayer;
}

export function makeKingJoeSkinDetails(): PartDefinition[] {
  const parts: Detail[] = [];
  const add = (part: Detail) => parts.push(part);

  // —— 胸口双盾栅：外框 → 黑背板 → 8 条彩虹带 → 5 条黑横栅 ——
  add({
    id: "kingjoeskin.chest.grille_frame",
    name_cn: "胸口彩虹栅银框",
    name_en: "chest rainbow grille frame",
    assembly: "chest",
    layer: 4,
    build_layer: 4,
    build_order: 0,
    dual: true,
    geometry: { type: "polygon", points: shieldPoints(1.02, 1.04, 0), depth: 0.04, bevel: 0.012 },
    material: "kjr_silver",
    node: "KJChestModule",
    mate: { type: "absolute", position: [0.46, 0, -0.82] },
    source: "参考实拍胸口双盾形彩虹格栅；叠加在真实网格前",
  });
  add({
    id: "kingjoeskin.chest.grille_back",
    name_cn: "胸口彩虹栅黑背板",
    name_en: "chest grille black backing",
    assembly: "chest",
    layer: 4,
    build_layer: 4,
    build_order: 0,
    dual: true,
    geometry: { type: "polygon", points: shieldPoints(0.98, 1.0, 0.025), depth: 0.03, bevel: 0.006 },
    material: "kjr_black",
    node: "KJChestModule",
    mate: { type: "absolute", position: [0.46, 0, -0.855] },
  });

  const bands = 8;
  const y0 = -0.47;
  const y1 = 0.47;
  const step = (y1 - y0) / bands;
  for (let i = 0; i < bands; i++) {
    const a = y0 + i * step + 0.006;
    const b = y0 + (i + 1) * step - 0.006;
    const wa = halfWidth(a, 0.92, 1.0, 0.06);
    const wb = halfWidth(b, 0.92, 1.0, 0.06);
    add({
      id: `kingjoeskin.chest.grille_band_${i}`,
      name_cn: `胸口彩虹带 ${i + 1}/8`,
      name_en: `chest rainbow band ${i + 1}`,
      assembly: "chest",
      layer: 5,
      build_layer: 5,
      build_order: 0,
      dual: true,
      geometry: {
        type: "polygon",
        points: [[-wa, a], [wa, a], [wb, b], [-wb, b]],
        depth: 0.008,
        bevel: 0.0015,
      },
      material: BAND_MATERIALS[i],
      node: "KJChestModule",
      mate: { type: "absolute", position: [0.46, 0, -0.878] },
    });
  }
  for (let i = 0; i < 5; i++) {
    add({
      id: `kingjoeskin.chest.grille_louver_${i}`,
      name_cn: `胸口横栅 ${i + 1}/5`,
      name_en: `chest grille louver ${i + 1}`,
      assembly: "chest",
      layer: 5,
      build_layer: 5,
      build_order: 0,
      dual: true,
      geometry: { type: "box", w: 0.66, h: 0.018, d: 0.014, bevel: 0.004 },
      material: "kjr_black",
      node: "KJChestModule",
      mate: { type: "absolute", position: [0.46, -0.34 + i * 0.17, -0.9] },
    });
  }
  add({
    id: "kingjoeskin.chest.grille_spine",
    name_cn: "胸口中央脊",
    name_en: "chest center spine",
    assembly: "chest",
    layer: 4,
    build_layer: 4,
    build_order: 0,
    geometry: { type: "box", w: 0.06, h: 1.0, d: 0.05, bevel: 0.012 },
    material: "kjr_silver_dark",
    node: "KJChestModule",
    mate: { type: "absolute", position: [0, 0, -0.87] },
  });

  // —— 头部横眼带 + 双眼 + 小口 ——
  add({
    id: "kingjoeskin.ship.visor_housing",
    name_cn: "眼带框",
    name_en: "visor housing",
    assembly: "ship",
    layer: 4,
    build_layer: 4,
    build_order: 0,
    geometry: { type: "box", w: 0.7, h: 0.16, d: 0.06, bevel: 0.018 },
    material: "kjr_black",
    node: "KJShipModule",
    mate: { type: "absolute", position: [0, 0.51, -0.7] },
  });
  add({
    id: "kingjoeskin.ship.visor_glass",
    name_cn: "眼带玻璃",
    name_en: "visor glass",
    assembly: "ship",
    layer: 5,
    build_layer: 5,
    build_order: 0,
    geometry: { type: "box", w: 0.62, h: 0.1, d: 0.02, bevel: 0.008 },
    material: "kjr_visor",
    node: "KJShipModule",
    mate: { type: "absolute", position: [0, 0.51, -0.74] },
  });
  add({
    id: "kingjoeskin.ship.visor_louvers",
    name_cn: "眼带横栅",
    name_en: "visor louvers",
    assembly: "ship",
    layer: 5,
    build_layer: 5,
    build_order: 0,
    geometry: { type: "louver", count: 5, w: 0.56, h: 0.08, slantDeg: 0, t: 0.008 },
    material: "kjr_black",
    node: "KJShipModule",
    mate: { type: "absolute", position: [0, 0.51, -0.758] },
  });
  add({
    id: "kingjoeskin.ship.eye",
    name_cn: "眼睛",
    name_en: "eye",
    assembly: "ship",
    layer: 5,
    build_layer: 5,
    build_order: 0,
    dual: true,
    geometry: { type: "cylinder", r: 0.055, h: 0.02, segments: 20, bevel: 0.004 },
    material: "kjr_eye",
    node: "KJShipModule",
    mate: { type: "absolute", position: [0.2, 0.35, -0.745], rotation: [90, 0, 0] },
  });
  add({
    id: "kingjoeskin.ship.mouth",
    name_cn: "口部格栅",
    name_en: "mouth vent",
    assembly: "ship",
    layer: 5,
    build_layer: 5,
    build_order: 0,
    geometry: { type: "louver", count: 2, w: 0.16, h: 0.06, slantDeg: 0, t: 0.006 },
    material: "kjr_silver_dark",
    node: "KJShipModule",
    mate: { type: "absolute", position: [0, 0.23, -0.705] },
  });

  return parts.map(({ layer: _layer, ...part }) => part);
}
