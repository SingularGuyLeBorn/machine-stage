import * as THREE from "three";
import { CV } from "./constants";
import { A, B, C, M, T, pad, type CarrierCtx } from "./common";

// ============================================================================
// L5 表面质感 + 甲板作业：舰体做旧、舷号、锚、栏杆、救生设备、
// 彩色马甲甲板人员、牵引车/消防车/加油车、甲板系留/灯。
// ============================================================================

const ASSEMBLY = "surface";
const P = "carrier.surface.";
const deckTop = CV.DECK_Y + CV.DECK_T;

export function addSurface(ctx: CarrierCtx): void {
  const add = (part: Parameters<CarrierCtx["add"]>[0]) => ctx.add(part);

  // 舷号 18（左舷艏部/右舷舰岛）——用块体拼数字。
  const digit = (value: 1 | 8) => {
    const bars: ReturnType<typeof B>[] = [];
    if (value === 1) {
      bars.push(B(0.12, 0.9, 0.03, [0, 0, 0], 0.004), B(0.28, 0.1, 0.03, [0, -0.42, 0], 0.004));
    } else {
      bars.push(
        B(0.42, 0.1, 0.03, [0, 0.4, 0], 0.004),
        B(0.42, 0.1, 0.03, [0, -0.4, 0], 0.004),
        B(0.42, 0.1, 0.03, [0, 0, 0], 0.004),
        B(0.1, 0.9, 0.03, [-0.16, 0, 0], 0.004),
        B(0.1, 0.9, 0.03, [0.16, 0, 0], 0.004),
      );
    }
    return M(...bars);
  };
  add({
    id: `${P}hull_number_1`,
    name_cn: "舷号 1",
    name_en: "hull number 1",
    assembly: ASSEMBLY,
    build_layer: 5,
    geometry: digit(1),
    material: "cv_deck_line",
    mate: A([-4.02, 2.45, 12.2], [0, -90, 0]),
  });
  add({
    id: `${P}hull_number_8`,
    name_cn: "舷号 8",
    name_en: "hull number 8",
    assembly: ASSEMBLY,
    build_layer: 5,
    geometry: digit(8),
    material: "cv_deck_line",
    mate: A([-4.02, 2.45, 11.55], [0, -90, 0]),
  });

  // 做旧/锈迹/水线漆带。
  for (let w = 0; w < 22; w++) {
    const side = w % 2 === 0 ? -1 : 1;
    add({
      id: `${P}weathering_${pad(w + 1)}`,
      name_cn: `舷侧做旧 ${w + 1}`,
      name_en: `hull weathering ${w + 1}`,
      assembly: ASSEMBLY,
      build_layer: 5,
      geometry: M(B(0.025, 0.18 + (w % 3) * 0.1, 0.7 + (w % 4) * 0.2, [0, 0, 0], 0.003)),
      material: w % 3 === 0 ? "cv_hull_boot" : "cv_hull_dark",
      mate: A([side * 4.035, 1.55 + (w % 4) * 0.18, -13 + Math.floor(w / 2) * 2.4]),
    });
  }
  add({
    id: `${P}waterline_band`,
    name_cn: "水线漆带",
    name_en: "waterline band",
    assembly: ASSEMBLY,
    build_layer: 5,
    geometry: M(B(0.03, 0.16, 33, [0, 0, 0], 0.004)),
    material: "cv_hull_boot",
    mate: A([0, 0.98, -1], [0, 0, 0]),
    dual: true,
  });

  // 锚 + 锚链 + 锚穴（舰艏两舷）。
  for (const side of [-1, 1] as const) {
    const tag = side === -1 ? "l" : "r";
    add({
      id: `${P}anchor_${tag}`,
      name_cn: `锚 ${tag === "l" ? "左" : "右"}`,
      name_en: `anchor ${tag}`,
      assembly: ASSEMBLY,
      build_layer: 5,
      geometry: M(B(0.12, 0.55, 0.08, [0, 0, 0], 0.01), B(0.46, 0.1, 0.08, [0, -0.3, 0], 0.01), B(0.28, 0.1, 0.08, [0, 0.28, 0], 0.01)),
      material: "cv_steel_dark",
      mate: A([side * 2.3, 1.25, 17.9], [0, 0, side * 10]),
    });
    add({
      id: `${P}anchor_chain_${tag}`,
      name_cn: `锚链 ${tag === "l" ? "左" : "右"}`,
      name_en: `anchor chain ${tag}`,
      assembly: ASSEMBLY,
      build_layer: 5,
      geometry: M(C(0.035, 1.0, [0, 0, 0], 8), C(0.05, 0.1, [0, 0.45, 0], 10)),
      material: "cv_steel",
      mate: A([side * 2.28, 1.9, 17.3], [20, 0, 0]),
    });
  }

  // 甲板边缘栏杆/支柱（实例化）。
  add({
    id: `${P}deck_rail_post`,
    name_cn: "甲板栏杆立柱 ×36",
    name_en: "deck rail posts",
    assembly: ASSEMBLY,
    build_layer: 4,
    geometry: M(B(0.045, 0.75, 0.045, [0, 0, 0], 0.004), C(0.05, 0.06, [0, 0.38, 0], 10)),
    material: "cv_steel",
    mate: A([0, 0, 0]),
    instances: 36,
    indexed: true,
    instance_layout: "carrier.surface.railPost",
  });
  ctx.layout("carrier.surface.railPost", ({ index }) => {
    const side = index % 2 === 0 ? -1 : 1;
    const row = Math.floor(index / 2);
    return new THREE.Matrix4().makeTranslation(side * 4.66, deckTop + 0.36, -18 + row * 2.1);
  });
  add({
    id: `${P}deck_rail_l`,
    name_cn: "左舷甲板栏杆",
    name_en: "port deck rail",
    assembly: ASSEMBLY,
    build_layer: 4,
    geometry: M(C(0.025, 36.5, [0, 0, 0], 8)),
    material: "cv_steel",
    mate: A([-4.66, deckTop + 0.76, 0], [90, 0, 0]),
  });
  add({
    id: `${P}deck_rail_r`,
    name_cn: "右舷甲板栏杆",
    name_en: "starboard deck rail",
    assembly: ASSEMBLY,
    build_layer: 4,
    geometry: M(C(0.025, 26.0, [0, 0, 0], 8)),
    material: "cv_steel",
    mate: A([4.66, deckTop + 0.76, -6], [90, 0, 0]),
  });

  // 救生圈/救生筏/消防栓。
  for (let l = 0; l < 8; l++) {
    add({
      id: `${P}life_ring_${l + 1}`,
      name_cn: `救生圈 ${l + 1}`,
      name_en: `life ring ${l + 1}`,
      assembly: ASSEMBLY,
      build_layer: 4,
      geometry: M(T(0.18, 0.12, 0.07, [0, 0, 0], 18)),
      material: "cv_warning",
      mate: A([(l % 2 === 0 ? -1 : 1) * 4.64, deckTop + 0.55, -12 + Math.floor(l / 2) * 3.2], [90, 0, 0]),
    });
  }
  add({
    id: `${P}life_raft`,
    name_cn: "救生筏 ×6",
    name_en: "life rafts",
    assembly: ASSEMBLY,
    build_layer: 4,
    geometry: M(C(0.3, 0.55, [0, 0, 0], 16), T(0.32, 0.26, 0.05, [0, 0.28, 0], 16)),
    material: "cv_canvas",
    mate: A([3.9, deckTop + 0.3, 8.0]),
    instances: 6,
    indexed: true,
    instance_layout: "carrier.surface.raft",
  });
  ctx.layout("carrier.surface.raft", ({ index }) => new THREE.Matrix4().makeTranslation((index % 2) * 0.55 - 0.25, 0, -index * 0.75));

  // 甲板车辆与人员：本版不放置程序化积木件（宁可留空，不用方块/圆柱堆小人与小车）。
  // 后续接入真实网格资产后再恢复甲板作业编组。
  // 系留链/轮挡散件。
  for (let c = 0; c < 10; c++) {
    add({
      id: `${P}tie_chain_${pad(c + 1)}`,
      name_cn: `系留链 ${c + 1}`,
      name_en: `tie-down chain ${c + 1}`,
      assembly: ASSEMBLY,
      build_layer: 5,
      geometry: M(C(0.018, 0.7, [0, 0, 0], 8)),
      material: "cv_steel",
      mate: A([-2.6 + (c % 5) * 1.3, deckTop + 0.04, -15.2 - Math.floor(c / 5) * 2.0], [90, 0, 20]),
    });
  }
}
