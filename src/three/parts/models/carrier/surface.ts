import * as THREE from "three";
import { CV } from "./constants";
import { deckEdgeAt, hullSurfaceHalfAt } from "./kits";
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
      // 艏部型线收窄后锚必须按外板半宽 + 锚爪半宽外移，不能只留 0.07 的缝。
      mate: A([side * (hullSurfaceHalfAt(17.9, 1.25) + 0.3), 1.25, 17.9], [0, 0, side * 10]),
    });
    add({
      id: `${P}anchor_chain_${tag}`,
      name_cn: `锚链 ${tag === "l" ? "左" : "右"}`,
      name_en: `anchor chain ${tag}`,
      assembly: ASSEMBLY,
      build_layer: 5,
      geometry: M(C(0.035, 1.0, [0, 0, 0], 8), C(0.05, 0.1, [0, 0.45, 0], 10)),
      material: "cv_steel",
      mate: A([side * (hullSurfaceHalfAt(17.3, 1.9) + 0.05), 1.9, 17.3], [20, 0, 0]),
    });
  }

  // 左舷外走道：沿真实船壳曲线分段，格栅板 + 双托架 + 立柱 + 扶手。
  // 位置全部由 hullSurfaceHalfAt 推得——旧版用船底最大半宽，托架整段插进舷侧。
  const catwalkY = CV.DECK_Y - 0.78;
  const catwalkPosts: Array<[number, number, number]> = [];
  for (let cw = 0; cw < 11; cw++) {
    const zc = -13 + cw * 2;
    const hullTop = hullSurfaceHalfAt(zc, catwalkY + 0.02);
    const hullBracket = hullSurfaceHalfAt(zc, catwalkY - 0.04);
    const px = -(hullTop + 0.72);
    add({
      id: `${P}catwalk_${pad(cw + 1)}`,
      name_cn: `左舷外走道格栅 ${cw + 1}`,
      name_en: `port catwalk grating ${cw + 1}`,
      assembly: ASSEMBLY,
      build_layer: 4,
      geometry: M(B(0.56, 0.04, 1.98, [0, 0, 0], 0.003)),
      material: "cv_grate",
      mate: A([px, catwalkY, zc]),
    });
    for (const dz of [-0.65, 0.65] as const) {
      add({
        id: `${P}catwalk_bracket_${pad(cw + 1)}_${dz < 0 ? "f" : "a"}`,
        name_cn: `左舷外走道托架 ${cw + 1}-${dz < 0 ? "前" : "后"}`,
        name_en: `port catwalk bracket ${cw + 1}-${dz < 0 ? "f" : "a"}`,
        assembly: ASSEMBLY,
        build_layer: 4,
        geometry: M(B(0.8, 0.08, 0.12, [0, 0, 0], 0.004), B(0.1, 0.28, 0.1, [0.35, -0.15, 0], 0.003)),
        material: "cv_steel_dark",
        mate: A([-(hullBracket + 0.4), catwalkY - 0.06, zc + dz]),
      });
    }
    add({
      id: `${P}catwalk_post_${pad(cw + 1)}`,
      name_cn: `左舷外走道立柱 ${cw + 1}`,
      name_en: `port catwalk post ${cw + 1}`,
      assembly: ASSEMBLY,
      build_layer: 4,
      geometry: M(C(0.022, 0.24, [0, 0, 0], 8)),
      material: "cv_steel",
      mate: A([px - 0.24, catwalkY + 0.12, zc]),
    });
    catwalkPosts.push([px - 0.24, catwalkY + 0.24, zc]);
  }
  const catwalkRailParts: Parameters<typeof M>[0][] = [];
  for (const level of [0, -0.1] as const) {
    for (let i = 0; i < catwalkPosts.length - 1; i++) {
      const [x0, y0, z0] = catwalkPosts[i]!;
      const [x1, , z1] = catwalkPosts[i + 1]!;
      catwalkRailParts.push({
        type: "weld",
        from: [x0, y0 + level, z0],
        to: [x1, y0 + level, z1],
        radius: level === 0 ? 0.014 : 0.011,
        seed: 520 + i,
      });
    }
  }
  add({
    id: `${P}catwalk_rail`,
    name_cn: "左舷外走道扶手",
    name_en: "port catwalk handrail",
    assembly: ASSEMBLY,
    build_layer: 4,
    geometry: M(...catwalkRailParts),
    material: "cv_steel",
    mate: A([0, 0, 0]),
  });

  // 甲板边缘栏杆只在全宽中段布置；立柱与扶手逐段取真实甲板缘，避免直线栏杆切出甲板。
  const buildDeckRail = (side: -1 | 1, z0: number, z1: number) => {
    const posts: Array<[number, number]> = [];
    for (let z = z0; z <= z1 + 1e-6; z += 2) {
      const edge = deckEdgeAt(z, side);
      posts.push([edge.x - side * 0.08, z]);
    }
    const geos: Parameters<typeof M>[0][] = [];
    for (const [x, z] of posts) {
      geos.push(B(0.04, 0.2, 0.04, [x, deckTop + 0.1, z], 0.003));
      geos.push(C(0.045, 0.04, [x, deckTop + 0.21, z], 10));
    }
    for (let i = 0; i < posts.length - 1; i++) {
      const [x0, zz0] = posts[i]!;
      const [x1, zz1] = posts[i + 1]!;
      const yTop = deckTop + 0.21;
      const yMid = deckTop + 0.1;
      geos.push({ type: "weld", from: [x0, yTop, zz0], to: [x1, yTop, zz1], radius: 0.016, seed: 610 + i + side });
      geos.push({ type: "weld", from: [x0, yMid, zz0], to: [x1, yMid, zz1], radius: 0.012, seed: 640 + i + side });
    }
    add({
      id: `${P}deck_rail_${side === -1 ? "l" : "r"}`,
      name_cn: `${side === -1 ? "左" : "右"}舷甲板栏杆`,
      name_en: `${side === -1 ? "port" : "starboard"} deck rail`,
      assembly: ASSEMBLY,
      build_layer: 4,
      geometry: M(...geos),
      material: "cv_steel",
      mate: A([0, 0, 0]),
    });
  };
  buildDeckRail(-1, 0.5, 8);
  // 右舷栏杆只保留后升降机与前升降机之间的一段，不横跨升降机平台。
  buildDeckRail(1, -10, 0);

  // 救生圈/救生筏/消防栓（避开升降机开口）。
  const ringZPort = [-12, -8.8, -5.6, -4.4];
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
      mate: A([side * (side === -1 ? 3.85 : 4.0), deckTop + 0.085, side === -1 ? ringZPort[index]! : ringZStarboard[index]!], [0, 90, 0]),
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
    mate: A([-4.35, deckTop + 0.335, -6.0]),
    instances: 6,
    indexed: true,
    instance_layout: "carrier.surface.raft",
  });
  ctx.layout("carrier.surface.raft", ({ index }) => new THREE.Matrix4().makeTranslation((index % 2) * 0.55 - 0.25, 0, -index * 0.75));
  add({
    id: `${P}life_raft_rack`,
    name_cn: "左舷救生筏鞍座",
    name_en: "port life raft rack",
    assembly: ASSEMBLY,
    build_layer: 4,
    geometry: M(B(0.7, 0.06, 4.6, [0, 0, 0], 0.004)),
    material: "cv_steel_dark",
    mate: A([-4.35, deckTop + 0.03, -7.85]),
  });

  // 左舷艉部救生艇 + 吊艇架（艇体放样、充气舷管、挂机、操控台、吊臂/绞车）。
  // 救生艇必须收在外飘底封板（y≈4.03）以下，否则吊艇架/绞车会顶穿封板。
  const boatY = 2.6;
  const boatZ = -15.5;
  // 平台跨 z=-16.5..-14.5，艉部壳板前宽后窄；按平台覆盖范围内的最大半宽外移，
  // 否则平台前角仍会插进壳板。
  let boatHullHalf = 0;
  for (let bz = boatZ - 1.05; bz <= boatZ + 1.05; bz += 0.35) {
    boatHullHalf = Math.max(boatHullHalf, hullSurfaceHalfAt(bz, boatY));
  }
  const boatX = -(boatHullHalf + 0.6);
  add({
    id: `${P}boat_sponson`,
    name_cn: "救生艇平台",
    name_en: "boat sponson",
    assembly: ASSEMBLY,
    build_layer: 4,
    // 只保留平台板；内侧原有两个伸向壳板的短臂已由 boat_sponson_bracket 托架取代，
    // 否则移出后的平台短臂会继续插进艉部壳板。
    geometry: M(B(0.82, 0.07, 2.0, [0, 0, 0], 0.006)),
    material: "cv_grate",
    mate: A([boatX, boatY, boatZ]),
  });
  for (const dz of [-0.7, 0.7] as const) {
    add({
      id: `${P}boat_sponson_bracket_${dz < 0 ? "f" : "a"}`,
      name_cn: `救生艇平台托架 ${dz < 0 ? "前" : "后"}`,
      name_en: `boat platform bracket ${dz < 0 ? "f" : "a"}`,
      assembly: ASSEMBLY,
      build_layer: 4,
      geometry: M({
        type: "weld",
        from: [-(hullSurfaceHalfAt(boatZ + dz, 2.85) - 0.04), 2.85, boatZ + dz],
        to: [boatX + 0.36, boatY, boatZ + dz],
        radius: 0.05,
      }),
      material: "cv_steel_dark",
      mate: A([0, 0, 0]),
    });
  }
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
      mate: A([-2.6 + (c % 5) * 1.3, deckTop + 0.02, -15.2 - Math.floor(c / 5) * 2.0], [90, 0, 20]),
    });
  }
}
