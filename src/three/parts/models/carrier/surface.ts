import * as THREE from "three";
import { CV } from "./constants";
import { deckEdgeAt, hullSurfaceHalfAt } from "./kits";
import { carrierDeckExclusions, nearestDeckX } from "./deckClearance";
import { A, B, C, M, S, T, pad, type CarrierCtx } from "./common";

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
  // 右舷栏杆只保留 1 号升降机与舰岛之间的一段；舰岛后方是折叠翼停机位，
  // 栏杆不能穿过停放机的翼尖作动筒。
  buildDeckRail(1, -8.4, 0);

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
      // 真实救生圈外径 0.75m；编辑尺度 1:8，半径 0.047、管径 0.006。
      geometry: M({ type: "torus", radius: 0.047, tube: 0.006, radialSegments: 8, tubularSegments: 20 }),
      material: "cv_warning",
      mate: A([side * (side === -1 ? 3.85 : 4.0), deckTop + 0.06, side === -1 ? ringZPort[index]! : ringZStarboard[index]!], [0, 90, 0]),
    });
  }
  // 救生筏：真实筏罐约 0.4m 直径×1.3m 高，6 只分两层收在左舷筏架里。
  // 旧版用 0.3 编辑单位半径（≈2.4m）并排成 6 只，看起来是一排悬空的大蓝桶。
  add({
    id: `${P}life_raft`,
    name_cn: "救生筏 ×6",
    name_en: "life rafts",
    assembly: ASSEMBLY,
    build_layer: 4,
    geometry: M(
      C(0.05, 0.16, [0, 0, 0], 14),
      C(0.045, 0.02, [0, 0.09, 0], 12),
      T(0.052, 0.043, 0.012, [0, 0.042, 0], 14),
      T(0.052, 0.043, 0.012, [0, -0.04, 0], 14),
      B(0.02, 0.02, 0.02, [0, 0.1, 0], 0.002),
    ),
    material: "cv_warning",
    mate: A([-4.04, deckTop + 0.116, -6.42]),
    instances: 6,
    indexed: true,
    instance_layout: "carrier.surface.raft",
  });
  ctx.layout("carrier.surface.raft", ({ index }) => {
    const col = index % 3;
    const row = Math.floor(index / 3);
    return new THREE.Matrix4().makeTranslation(0, 0, -0.4 + col * 0.16 + row * 0.48);
  });
  add({
    id: `${P}life_raft_rack`,
    name_cn: "左舷救生筏筏架",
    name_en: "port life raft rack",
    assembly: ASSEMBLY,
    build_layer: 4,
    geometry: M(
      B(0.22, 0.03, 1.1, [0, 0, 0], 0.004),
      B(0.02, 0.14, 1.12, [-0.115, 0.085, 0], 0.003),
      B(0.02, 0.14, 1.12, [0.115, 0.085, 0], 0.003),
      ...[-0.55, 0.55].flatMap((dz) => [
        B(0.03, 0.24, 0.03, [-0.1, 0.12, dz], 0.002),
        B(0.03, 0.24, 0.03, [0.1, 0.12, dz], 0.002),
      ]),
      B(0.24, 0.025, 0.03, [0, 0.24, -0.55], 0.002),
      B(0.24, 0.025, 0.03, [0, 0.24, 0.55], 0.002),
      B(0.1, 0.06, 0.06, [0.12, 0.07, -0.56], 0.004),
    ),
    material: "cv_steel_dark",
    mate: A([-4.04, deckTop + 0.02, -6.42]),
  });
  for (let s = 0; s < 6; s++) {
    const col = s % 3;
    const row = Math.floor(s / 3);
    add({
      id: `${P}life_raft_strap_${s + 1}`,
      name_cn: `救生筏绑扎带 ${s + 1}`,
      name_en: `life raft strap ${s + 1}`,
      assembly: ASSEMBLY,
      build_layer: 4,
      geometry: M(
        B(0.26, 0.012, 0.022, [0, 0.235, 0], 0.002),
        B(0.012, 0.075, 0.022, [-0.135, 0.193, 0], 0.002),
        B(0.012, 0.075, 0.022, [0.135, 0.193, 0], 0.002),
      ),
      material: "cv_canvas",
      mate: A([-4.04, deckTop, -6.42 - 0.4 + col * 0.16 + row * 0.48]),
    });
  }
  // 筏架本身座在甲板上，不再另加会插进筏体的托架。

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
    material: "cv_hull_dark",
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
      material: "cv_deck_red",
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
    material: "cv_deck_red",
    mate: A([boatX, boatY + 0.28, boatZ + 0.56], [0, 0, 90]),
  });
  add({
    id: `${P}boat_stern_tube`,
    name_cn: "救生艇艉部舷管",
    name_en: "RHIB stern collar",
    assembly: ASSEMBLY,
    build_layer: 4,
    geometry: M(C(0.055, 0.34, [0, 0, 0], 12)),
    material: "cv_deck_red",
    mate: A([boatX, boatY + 0.28, boatZ - 0.55], [0, 0, 90]),
  });
  for (const side of [-1, 1] as const) {
    for (let s = 0; s < 3; s++) {
      add({
        id: `${P}boat_collar_seam_${side === -1 ? "p" : "s"}_${s + 1}`,
        name_cn: `救生艇舷管接缝 ${side === -1 ? "左" : "右"}-${s + 1}`,
        name_en: `RHIB collar seam ${side === -1 ? "p" : "s"} ${s + 1}`,
        assembly: ASSEMBLY,
        build_layer: 4,
        geometry: M({ type: "torus", radius: 0.056, tube: 0.006, radialSegments: 8, tubularSegments: 14, at: [0, 0, 0] }),
        material: "cv_steel_dark",
        mate: A([boatX + side * 0.17, boatY + 0.28, boatZ - 0.32 + s * 0.32]),
      });
    }
    add({
      id: `${P}boat_sheer_stripe_${side === -1 ? "p" : "s"}`,
      name_cn: `救生艇舷侧腰线 ${side === -1 ? "左" : "右"}`,
      name_en: `RHIB sheer stripe ${side === -1 ? "p" : "s"}`,
      assembly: ASSEMBLY,
      build_layer: 4,
      geometry: M({ type: "weld", from: [side * 0.175, 0.235, -0.55], to: [side * 0.115, 0.275, 0.42], radius: 0.008 }),
      material: "cv_deck_line",
      mate: A([boatX, boatY, boatZ]),
    });
  }
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
    material: "cv_upholstery",
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
  // 艇体细节：舷侧防溅条/龙骨/艉板/艇底甲板/登艇踏板，先把放样艇壳从“黄香蕉”
  // 拉回硬壳充气艇的轮廓；再补操控台屏/方向盘/油门、双骑座、挂机整流罩/桨轴、
  // 航行灯、抓绳和桨。所有零件仍属 surface.boat_*，沿用 cv-boat-self 装配白名单。
  add({
    id: `${P}boat_sole`,
    name_cn: "救生艇艇底甲板",
    name_en: "RHIB deck sole",
    assembly: ASSEMBLY,
    build_layer: 4,
    geometry: M(B(0.28, 0.025, 0.92, [0, 0, 0], 0.004)),
    material: "cv_steel_dark",
    mate: A([boatX, boatY + 0.26, boatZ - 0.02]),
  });
  add({
    id: `${P}boat_transom`,
    name_cn: "救生艇艉板",
    name_en: "RHIB transom",
    assembly: ASSEMBLY,
    build_layer: 4,
    geometry: M(B(0.3, 0.16, 0.025, [0, 0, 0], 0.004), B(0.2, 0.1, 0.012, [0, -0.01, -0.02], 0.002)),
    material: "cv_hull_dark",
    mate: A([boatX, boatY + 0.2, boatZ - 0.66]),
  });
  for (const side of [-1, 1] as const) {
    add({
      id: `${P}boat_spray_rail_${side === -1 ? "p" : "s"}`,
      name_cn: `救生艇防溅条 ${side === -1 ? "左" : "右"}`,
      name_en: `RHIB spray rail ${side === -1 ? "p" : "s"}`,
      assembly: ASSEMBLY,
      build_layer: 4,
      geometry: M({ type: "weld", from: [side * 0.18, 0.19, -0.52], to: [side * 0.11, 0.24, 0.46], radius: 0.012 }),
      material: "cv_hull_dark",
      mate: A([boatX, boatY, boatZ]),
    });
    add({
      id: `${P}boat_rub_strake_${side === -1 ? "p" : "s"}`,
      name_cn: `救生艇舷管护条 ${side === -1 ? "左" : "右"}`,
      name_en: `RHIB rub strake ${side === -1 ? "p" : "s"}`,
      assembly: ASSEMBLY,
      build_layer: 4,
      geometry: M({ type: "weld", from: [side * 0.225, 0.3, -0.46], to: [side * 0.19, 0.32, 0.32], radius: 0.009 }),
      material: "cv_rubber",
      mate: A([boatX, boatY, boatZ]),
    });
    // 两舷抓绳与吊点。
    for (let g = 0; g < 3; g++) {
      add({
        id: `${P}boat_grab_${side === -1 ? "p" : "s"}_${g + 1}`,
        name_cn: `救生艇抓绳 ${side === -1 ? "左" : "右"}-${g + 1}`,
        name_en: `RHIB grab line ${side === -1 ? "p" : "s"} ${g + 1}`,
        assembly: ASSEMBLY,
        build_layer: 4,
        geometry: M({ type: "weld", from: [side * 0.24, 0.32, -0.35 + g * 0.32], to: [side * 0.235, 0.34, -0.15 + g * 0.32], radius: 0.004 }),
        material: "cv_canvas",
        mate: A([boatX, boatY, boatZ]),
      });
    }
  }
  add({
    id: `${P}boat_keel`,
    name_cn: "救生艇龙骨",
    name_en: "RHIB keel",
    assembly: ASSEMBLY,
    build_layer: 4,
    geometry: M({ type: "weld", from: [0, 0.055, -0.6], to: [0, 0.09, 0.52], radius: 0.016 }),
    material: "cv_steel_dark",
    mate: A([boatX, boatY, boatZ]),
  });
  // 操控台：仪表屏/指南针/方向盘/油门。
  add({
    id: `${P}boat_dash`,
    name_cn: "救生艇仪表台",
    name_en: "RHIB dash",
    assembly: ASSEMBLY,
    build_layer: 4,
    geometry: M(B(0.2, 0.06, 0.1, [0, 0, 0], 0.004), B(0.18, 0.02, 0.09, [0, 0.04, 0.01], 0.002)),
    material: "cv_055_console",
    mate: A([boatX, boatY + 0.52, boatZ - 0.1]),
  });
  add({
    id: `${P}boat_windscreen`,
    name_cn: "救生艇风挡",
    name_en: "RHIB windscreen",
    assembly: ASSEMBLY,
    build_layer: 4,
    geometry: M(B(0.2, 0.12, 0.01, [0, 0, 0], 0.002)),
    material: "cv_glass",
    mate: A([boatX, boatY + 0.59, boatZ - 0.055]),
  });
  add({
    id: `${P}boat_wheel`,
    name_cn: "救生艇方向盘",
    name_en: "RHIB steering wheel",
    assembly: ASSEMBLY,
    build_layer: 4,
    geometry: M(T(0.05, 0.008, 0.012, [0, 0, 0], 16), C(0.012, 0.08, [0, 0, -0.03], 8)),
    material: "cv_steel_dark",
    mate: A([boatX, boatY + 0.5, boatZ - 0.01], [90, 0, 0]),
  });
  add({
    id: `${P}boat_throttle`,
    name_cn: "救生艇油门手柄",
    name_en: "RHIB throttle",
    assembly: ASSEMBLY,
    build_layer: 4,
    geometry: M({ type: "weld", from: [0.09, 0.54, -0.08], to: [0.11, 0.6, -0.13], radius: 0.008 }, S(0.012, [0.11, 0.6, -0.13], 8)),
    material: "cv_steel",
    mate: A([boatX, boatY, boatZ]),
  });
  for (let g = 0; g < 3; g++) {
    add({
      id: `${P}boat_gauge_${g + 1}`,
      name_cn: `救生艇仪表 ${g + 1}`,
      name_en: `RHIB gauge ${g + 1}`,
      assembly: ASSEMBLY,
      build_layer: 4,
      geometry: M(C(0.014, 0.01, [0, 0, 0], 12)),
      material: "cv_gauge_face",
      mate: A([boatX - 0.06 + g * 0.06, boatY + 0.56, boatZ - 0.055], [90, 0, 0]),
    });
  }
  // 双骑座。
  for (const [dz, tag] of [[-0.3, "fwd"], [-0.48, "aft"]] as const) {
    add({
      id: `${P}boat_jockey_${tag}`,
      name_cn: `救生艇骑座 ${tag === "fwd" ? "前" : "后"}`,
      name_en: `RHIB jockey seat ${tag}`,
      assembly: ASSEMBLY,
      build_layer: 4,
      geometry: M(
        B(0.14, 0.06, 0.17, [0, 0, 0], 0.004),
        B(0.14, 0.13, 0.035, [0, 0.09, -0.07], 0.004),
        B(0.03, 0.1, 0.12, [-0.08, 0.04, 0], 0.003),
        B(0.03, 0.1, 0.12, [0.08, 0.04, 0], 0.003),
      ),
      material: "cv_upholstery",
      mate: A([boatX, boatY + 0.3, boatZ + dz]),
    });
  }
  // 挂机整流罩/桨轴/防溅板。
  add({
    id: `${P}boat_motor_cowl`,
    name_cn: "救生艇挂机整流罩",
    name_en: "RHIB outboard cowl",
    assembly: ASSEMBLY,
    build_layer: 4,
    geometry: M(
      { type: "latheZ", profile: [[0.065, -0.14], [0.1, -0.08], [0.11, 0.05], [0.085, 0.13], [0.02, 0.16]], segments: 18 },
      B(0.14, 0.025, 0.05, [0, -0.02, 0.1], 0.004),
    ),
    material: "cv_055_console_alt",
    mate: A([boatX, boatY + 0.42, boatZ - 0.71]),
  });
  add({
    id: `${P}boat_motor_leg`,
    name_cn: "救生艇挂机桨轴",
    name_en: "RHIB outboard leg",
    assembly: ASSEMBLY,
    build_layer: 4,
    geometry: M(C(0.04, 0.5, [0, 0, 0], 10), B(0.03, 0.1, 0.16, [0, -0.26, -0.04], 0.003), T(0.055, 0.012, 0.02, [0, -0.3, -0.06], 3)),
    material: "cv_steel_dark",
    mate: A([boatX, boatY + 0.14, boatZ - 0.76]),
  });
  // 艏部航行灯、艉部拖曳灯与登记牌。
  add({
    id: `${P}boat_nav_light`,
    name_cn: "救生艇航行灯",
    name_en: "RHIB navigation light",
    assembly: ASSEMBLY,
    build_layer: 4,
    geometry: M(B(0.055, 0.035, 0.045, [0, 0, 0], 0.003), S(0.012, [0, 0.025, 0.02], 8)),
    material: "cv_glow",
    mate: A([boatX, boatY + 0.36, boatZ + 0.5]),
  });
  add({
    id: `${P}boat_registration`,
    name_cn: "救生艇登记牌",
    name_en: "RHIB registration plate",
    assembly: ASSEMBLY,
    build_layer: 4,
    geometry: M(B(0.14, 0.055, 0.006, [0, 0, 0], 0.002)),
    material: "cv_deck_line",
    mate: A([boatX + 0.23, boatY + 0.3, boatZ + 0.2], [0, 90, 0]),
  });
  // 两支桨收在舷内侧。
  for (const side of [-1, 1] as const) {
    add({
      id: `${P}boat_oar_${side === -1 ? "p" : "s"}`,
      name_cn: `救生艇桨 ${side === -1 ? "左" : "右"}`,
      name_en: `RHIB oar ${side === -1 ? "p" : "s"}`,
      assembly: ASSEMBLY,
      build_layer: 4,
      geometry: M({ type: "weld", from: [0.06, 0.28, -0.55], to: [0.06, 0.3, 0.25], radius: 0.008 }, B(0.05, 0.012, 0.16, [0.06, 0.3, 0.3], 0.002)),
      material: "cv_canvas",
      mate: A([boatX + side * 0.08, boatY, boatZ]),
    });
  }
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
    const z = -15.2 - Math.floor(c / 5) * 2.0;
    const desired = -2.6 + (c % 5) * 1.3;
    const x = nearestDeckX(desired, z, 0.3, {
      margin: 0.1,
      // 3 号弹射器 JBD 收起后仍占着左舷艉段；系留链绕开它，避免压在挡焰板上。
      exclude: [...carrierDeckExclusions(), [-4.8, -15.7, -2.7, -14.3]],
    }) ?? desired;
    add({
      id: `${P}tie_chain_${pad(c + 1)}`,
      name_cn: `系留链 ${c + 1}`,
      name_en: `tie-down chain ${c + 1}`,
      assembly: ASSEMBLY,
      build_layer: 5,
      geometry: M(C(0.018, 0.7, [0, 0, 0], 8)),
      material: "cv_steel",
      mate: A([x, deckTop + 0.02, z], [90, 0, 20]),
    });
  }
}
