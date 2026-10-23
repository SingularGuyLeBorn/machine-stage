import * as THREE from "three";
import { CV, hullHalfBeamAt } from "./constants";
import { hullSurfaceHalfAt } from "./kits";
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

  // 舷号 18（左舷艏部）——按舷侧外飘面逐段贴装：竖直笔画切成 4 段，每段单独落在该高度的型线外板上，
  // 整块平板既不会插进舰体，也不会在舷侧斜坡上悬空。
  const addHullDigit = (value: 1 | 8, z: number) => {
    const bars: Array<{ w: number; h: number; dx: number; dy: number }> =
      value === 1
        ? [
            { w: 0.12, h: 0.9, dx: 0, dy: 0 },
            { w: 0.28, h: 0.1, dx: 0, dy: -0.42 },
          ]
        : [
            { w: 0.42, h: 0.1, dx: 0, dy: 0.4 },
            { w: 0.42, h: 0.1, dx: 0, dy: 0 },
            { w: 0.42, h: 0.1, dx: 0, dy: -0.4 },
            { w: 0.1, h: 0.9, dx: -0.16, dy: 0 },
            { w: 0.1, h: 0.9, dx: 0.16, dy: 0 },
          ];
    let index = 0;
    for (const bar of bars) {
      const pieces = bar.h > 0.4 ? 4 : 1;
      const h = bar.h / pieces;
      for (let piece = 0; piece < pieces; piece++) {
        const dy = bar.dy - bar.h / 2 + h / 2 + piece * h;
        index += 1;
        add({
          id: `${P}hull_number_${value}_${pad(index)}`,
          name_cn: `舷号 ${value} 笔画 ${index}`,
          name_en: `hull number ${value} stroke ${index}`,
          assembly: ASSEMBLY,
          build_layer: 5,
          geometry: M(B(bar.w, h, 0.03, [0, 0, 0], 0.004)),
          material: "cv_deck_line",
          mate: A([-(hullSurfaceHalfAt(z + bar.dx, 2.45 + dy) + 0.022), 2.45 + dy, z + bar.dx], [0, -90, 0]),
        });
      }
    }
  };
  addHullDigit(1, 12.2);
  addHullDigit(8, 11.55);

  // 水线漆带由舰体型线放样（carrierBootStripe）统一生成，这里不再叠加平板。

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
      mate: A([side * (hullHalfBeamAt(17.9) + 0.07), 1.25, 17.9], [0, 0, side * 10]),
    });
    add({
      id: `${P}anchor_chain_${tag}`,
      name_cn: `锚链 ${tag === "l" ? "左" : "右"}`,
      name_en: `anchor chain ${tag}`,
      assembly: ASSEMBLY,
      build_layer: 5,
      geometry: M(C(0.035, 1.0, [0, 0, 0], 8), C(0.05, 0.1, [0, 0.45, 0], 10)),
      material: "cv_steel",
      mate: A([side * (hullHalfBeamAt(17.3) + 0.05), 1.9, 17.3], [20, 0, 0]),
    });
  }

  // 左舷外走道：沿船壳曲线分段，格栅板 + 双托架 + 立柱 + 扶手（补齐甲板下空档）。
  for (let cw = 0; cw < 18; cw++) {
    const z0 = CV.DECK_Z_STERN + 1.0 + cw * 2.0;
    const zc = z0 + 1.0;
    const half = hullHalfBeamAt(zc);
    const px = -(half + 0.32);
    const deckY = CV.DECK_Y - 0.34;
    add({
      id: `${P}catwalk_${pad(cw + 1)}`,
      name_cn: `左舷外走道格栅 ${cw + 1}`,
      name_en: `port catwalk grating ${cw + 1}`,
      assembly: ASSEMBLY,
      build_layer: 4,
      geometry: M(B(0.56, 0.04, 1.94, [0, 0, 0], 0.003)),
      material: "cv_grate",
      mate: A([px, deckY, zc]),
    });
    for (const dz of [-0.65, 0.65] as const) {
      add({
        id: `${P}catwalk_bracket_${pad(cw + 1)}_${dz < 0 ? "f" : "a"}`,
        name_cn: `左舷外走道托架 ${cw + 1}-${dz < 0 ? "前" : "后"}`,
        name_en: `port catwalk bracket ${cw + 1}-${dz < 0 ? "f" : "a"}`,
        assembly: ASSEMBLY,
        build_layer: 4,
        geometry: M(B(0.9, 0.08, 0.12, [0, 0, 0], 0.004), B(0.12, 0.34, 0.1, [0.38, -0.18, 0], 0.003)),
        material: "cv_steel_dark",
        mate: A([-(half + 0.14), deckY - 0.06, zc + dz]),
      });
    }
    add({
      id: `${P}catwalk_post_${pad(cw + 1)}`,
      name_cn: `左舷外走道立柱 ${cw + 1}`,
      name_en: `port catwalk post ${cw + 1}`,
      assembly: ASSEMBLY,
      build_layer: 4,
      geometry: M(C(0.022, 0.2, [0, 0, 0], 8)),
      material: "cv_steel",
      mate: A([px - 0.24, deckY + 0.12, zc]),
    });
  }
  add({
    id: `${P}catwalk_rail`,
    name_cn: "左舷外走道扶手",
    name_en: "port catwalk handrail",
    assembly: ASSEMBLY,
    build_layer: 4,
    geometry: M(C(0.02, 35.5, [0, 0, 0], 8)),
    material: "cv_steel",
    mate: A([-(hullHalfBeamAt(0) + 0.56), CV.DECK_Y - 0.12, 1.0], [90, 0, 0]),
  });
  add({
    id: `${P}catwalk_rail_mid`,
    name_cn: "左舷外走道中扶手",
    name_en: "port catwalk mid rail",
    assembly: ASSEMBLY,
    build_layer: 4,
    geometry: M(C(0.016, 35.5, [0, 0, 0], 8)),
    material: "cv_steel",
    mate: A([-(hullHalfBeamAt(0) + 0.56), CV.DECK_Y - 0.22, 1.0], [90, 0, 0]),
  });

  // 甲板边缘栏杆/支柱（实例化；右舷升降机开口处不设立柱）。
  const railPostSpots: Array<[number, number]> = [];
  for (let row = 0; row < 18; row++) {
    const z = -18 + row * 2.1;
    // 艏部 z>11.4 进入甲板收尖段且是弹射作业区，不再布栏杆（真实航母艏部也无边缘栏杆）。
    if (z > 11.4) continue;
    for (const side of [-1, 1] as const) {
      const inElevator = CV.ELEVATOR_Z.some((ez) => Math.abs(z - ez) < CV.ELEVATOR_L / 2 + 0.3);
      if (side === 1 && inElevator) continue;
      railPostSpots.push([side, z]);
    }
  }
  add({
    id: `${P}deck_rail_post`,
    name_cn: "甲板栏杆立柱",
    name_en: "deck rail posts",
    assembly: ASSEMBLY,
    build_layer: 4,
    geometry: M(B(0.04, 0.2, 0.04, [0, 0, 0], 0.004), C(0.045, 0.04, [0, 0.11, 0], 10)),
    material: "cv_steel",
    mate: A([0, 0, 0]),
    instances: railPostSpots.length,
    indexed: true,
    instance_layout: "carrier.surface.railPost",
  });
  ctx.layout("carrier.surface.railPost", ({ index }) => {
    const [side, z] = railPostSpots[index]!;
    return new THREE.Matrix4().makeTranslation(side * 4.66, deckTop + 0.1, z);
  });
  add({
    id: `${P}deck_rail_l_1`,
    name_cn: "左舷甲板栏杆",
    name_en: "port deck rail",
    assembly: ASSEMBLY,
    build_layer: 4,
    geometry: M(C(0.018, 29.5, [0, 0, 0], 8)),
    material: "cv_steel",
    mate: A([-4.66, deckTop + 0.2, -3.5], [90, 0, 0]),
  });
  add({
    id: `${P}deck_rail_l_mid_1`,
    name_cn: "左舷甲板中栏杆",
    name_en: "port deck mid rail",
    assembly: ASSEMBLY,
    build_layer: 4,
    geometry: M(C(0.014, 29.5, [0, 0, 0], 8)),
    material: "cv_steel",
    mate: A([-4.66, deckTop + 0.1, -3.5], [90, 0, 0]),
  });
  // 右舷栏杆在升降机开口处断开（三段），不横跨升降机平台。
  const starboardRailSegments: Array<[number, number]> = [
    [-19, -14.57],
    [-11.03, 0.23],
    [3.77, 7],
  ];
  starboardRailSegments.forEach(([z0, z1], index) => {
    const center = (z0 + z1) / 2;
    const length = z1 - z0;
    add({
      id: `${P}deck_rail_r_${index + 1}`,
      name_cn: `右舷甲板栏杆 ${index + 1}`,
      name_en: `starboard deck rail ${index + 1}`,
      assembly: ASSEMBLY,
      build_layer: 4,
      geometry: M(C(0.018, length, [0, 0, 0], 8)),
      material: "cv_steel",
      mate: A([4.66, deckTop + 0.2, center], [90, 0, 0]),
    });
    add({
      id: `${P}deck_rail_r_mid_${index + 1}`,
      name_cn: `右舷甲板中栏杆 ${index + 1}`,
      name_en: `starboard deck mid rail ${index + 1}`,
      assembly: ASSEMBLY,
      build_layer: 4,
      geometry: M(C(0.014, length, [0, 0, 0], 8)),
      material: "cv_steel",
      mate: A([4.66, deckTop + 0.1, center], [90, 0, 0]),
    });
  });

  // 救生圈/救生筏/消防栓（避开升降机开口）。
  const ringZPort = [-12, -8.8, -5.6, -2.4];
  const ringZStarboard = [-10.2, -6.9, -3.6, -0.3];
  for (let l = 0; l < 8; l++) {
    const side = l % 2 === 0 ? -1 : 1;
    const index = Math.floor(l / 2);
    add({
      id: `${P}life_ring_${l + 1}`,
      name_cn: `救生圈 ${l + 1}`,
      name_en: `life ring ${l + 1}`,
      assembly: ASSEMBLY,
      build_layer: 4,
      geometry: M({ type: "torus", radius: 0.06, tube: 0.014, radialSegments: 10, tubularSegments: 24 }),
      material: "cv_warning",
      mate: A([side * 4.64, deckTop + 0.14, side === -1 ? ringZPort[index]! : ringZStarboard[index]!], [0, 90, 0]),
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

  // 左舷艉部救生艇 + 吊艇架（艇体放样、充气舷管、挂机、操控台、吊臂/绞车）。
  const boatX = -3.55;
  const boatY = 3.0;
  const boatZ = -15.5;
  add({
    id: `${P}boat_sponson`,
    name_cn: "救生艇平台",
    name_en: "boat sponson",
    assembly: ASSEMBLY,
    build_layer: 4,
    geometry: M(B(0.82, 0.07, 2.0, [0, 0, 0], 0.006), B(0.5, 0.1, 0.12, [0.34, -0.08, -0.8], 0.004), B(0.5, 0.1, 0.12, [0.34, -0.08, 0.8], 0.004)),
    material: "cv_grate",
    mate: A([boatX, boatY, boatZ]),
  });
  add({
    id: `${P}boat_hull`,
    name_cn: "救生艇艇体",
    name_en: "RHIB hull",
    assembly: ASSEMBLY,
    build_layer: 4,
    geometry: M({ type: "latheZ", profile: [[0.02, -0.68], [0.1, -0.55], [0.17, -0.2], [0.18, 0.15], [0.13, 0.48], [0.03, 0.64]], segments: 26 }),
    material: "cv_canvas",
    mate: A([boatX, boatY + 0.22, boatZ]),
  });
  for (const side of [-1, 1] as const) {
    add({
      id: `${P}boat_collar_${side === -1 ? "p" : "s"}`,
      name_cn: `救生艇充气舷管 ${side === -1 ? "外" : "内"}`,
      name_en: `RHIB collar ${side === -1 ? "outboard" : "inboard"}`,
      assembly: ASSEMBLY,
      build_layer: 4,
      geometry: M(C(0.055, 1.1, [0, 0, 0], 12)),
      material: "cv_warning",
      mate: A([boatX + side * 0.17, boatY + 0.28, boatZ], [90, 0, 0]),
    });
  }
  add({
    id: `${P}boat_bow_tube`,
    name_cn: "救生艇艏部舷管",
    name_en: "RHIB bow tube",
    assembly: ASSEMBLY,
    build_layer: 4,
    geometry: M(C(0.055, 0.36, [0, 0, 0], 12)),
    material: "cv_warning",
    mate: A([boatX, boatY + 0.28, boatZ + 0.56], [0, 0, 90]),
  });
  add({
    id: `${P}boat_console`,
    name_cn: "救生艇操控台",
    name_en: "RHIB console",
    assembly: ASSEMBLY,
    build_layer: 4,
    geometry: M(B(0.22, 0.28, 0.2, [0, 0, 0], 0.006), B(0.18, 0.04, 0.02, [0, 0.1, 0.1], 0.003), C(0.018, 0.3, [0, 0.22, -0.04], 8)),
    material: "cv_steel_dark",
    mate: A([boatX, boatY + 0.36, boatZ - 0.12]),
  });
  add({
    id: `${P}boat_seat`,
    name_cn: "救生艇座椅",
    name_en: "RHIB seat",
    assembly: ASSEMBLY,
    build_layer: 4,
    geometry: M(B(0.34, 0.1, 0.2, [0, 0, 0], 0.004)),
    material: "cv_canvas",
    mate: A([boatX, boatY + 0.33, boatZ - 0.38]),
  });
  add({
    id: `${P}boat_motor`,
    name_cn: "救生艇挂机",
    name_en: "RHIB outboard motor",
    assembly: ASSEMBLY,
    build_layer: 4,
    geometry: M(B(0.18, 0.26, 0.2, [0, 0.04, 0], 0.008), C(0.05, 0.42, [0, -0.2, 0], 10), B(0.05, 0.08, 0.2, [0, 0.2, 0], 0.003)),
    material: "cv_steel_dark",
    mate: A([boatX, boatY + 0.3, boatZ - 0.68]),
  });
  add({
    id: `${P}boat_fuel_tank`,
    name_cn: "救生艇燃油箱",
    name_en: "RHIB fuel tank",
    assembly: ASSEMBLY,
    build_layer: 4,
    geometry: M(B(0.22, 0.16, 0.16, [0, 0, 0], 0.004), C(0.02, 0.08, [0, 0.1, 0], 8)),
    material: "cv_steel",
    mate: A([boatX, boatY + 0.32, boatZ - 0.56]),
  });
  add({
    id: `${P}boat_davit_post`,
    name_cn: "吊艇架立柱",
    name_en: "boat davit post",
    assembly: ASSEMBLY,
    build_layer: 4,
    geometry: M(C(0.075, 1.05, [0, 0, 0], 12), B(0.24, 0.1, 0.24, [0, -0.52, 0], 0.006)),
    material: "cv_steel",
    mate: A([boatX - 0.28, boatY + 0.56, boatZ - 0.92]),
  });
  add({
    id: `${P}boat_davit_arm`,
    name_cn: "吊艇架吊臂",
    name_en: "boat davit arm",
    assembly: ASSEMBLY,
    build_layer: 4,
    geometry: M(B(0.09, 0.09, 1.15, [0, 0, 0], 0.006), B(0.06, 0.06, 0.2, [0, -0.15, 0.58], 0.004)),
    material: "cv_steel",
    mate: A([boatX - 0.28, boatY + 1.05, boatZ - 0.38]),
  });
  add({
    id: `${P}boat_winch`,
    name_cn: "吊艇架绞车",
    name_en: "boat davit winch",
    assembly: ASSEMBLY,
    build_layer: 4,
    geometry: M(C(0.11, 0.16, [0, 0, 0], 14), C(0.06, 0.2, [0, 0, 0], 10)),
    material: "cv_brass",
    mate: A([boatX - 0.28, boatY + 1.12, boatZ - 0.72], [0, 0, 90]),
  });
  for (const [dz, tag] of [[0.3, "bow"], [-0.5, "stern"]] as const) {
    add({
      id: `${P}boat_fall_${tag}`,
      name_cn: `吊艇索 ${tag === "bow" ? "艏" : "艉"}`,
      name_en: `boat fall ${tag}`,
      assembly: ASSEMBLY,
      build_layer: 4,
      geometry: M({ type: "weld", from: [boatX - 0.28, boatY + 1.1, boatZ + dz], to: [boatX, boatY + 0.32, boatZ + dz], radius: 0.008 }),
      material: "cv_steel",
      mate: A([0, 0, 0]),
    });
  }

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
