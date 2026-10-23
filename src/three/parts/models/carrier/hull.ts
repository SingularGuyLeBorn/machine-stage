import { CV, hullHalfBeamAt } from "./constants";
import { hullSurfaceAtStation, hullSurfaceHalfAt } from "./kits";
import { A, B, C, M, S, T, pad, type CarrierCtx } from "./common";

// ============================================================================
// L1 舰体结构：外壳、龙骨、肋骨、纵桁、多层甲板、水密舱壁、可开关水密门、
// 分段接缝。所有结构件互相搭接（焊接/铆接）以通过支撑检测。
// ============================================================================

const HULL_ASSEMBLY = "hull";
const DOOR_COUNT = 12;
const BULKHEAD_Z = [-15, -11.5, -8, -4.5, -1, 2.5, 6, 9.5, 13];

export function addHull(ctx: CarrierCtx): void {
  const add = (part: Parameters<CarrierCtx["add"]>[0]) => ctx.add(part);

  add({
    id: "carrier.hull.shell",
    name_cn: "舰体外壳（水线以上型线放样）",
    name_en: "hull shell above waterline",
    assembly: HULL_ASSEMBLY,
    build_layer: 1,
    geometry: { type: "kit", kit: "carrierHullShell" },
    material: "cv_hull",
    mate: A([0, 0, 0]),
    source: "1:8 展示尺度；56 站理论型线放样：圆舭、舷侧外飘、艏柱前倾、巡洋舰艉。",
  });
  add({
    id: "carrier.hull.underwater",
    name_cn: "水下舰体（防污漆）",
    name_en: "underwater hull",
    assembly: HULL_ASSEMBLY,
    build_layer: 1,
    geometry: { type: "kit", kit: "carrierHullUnderwater" },
    material: "cv_antifouling",
    mate: A([0, 0, 0]),
  });
  add({
    id: "carrier.hull.boot_stripe",
    name_cn: "水线漆带",
    name_en: "boot topping stripe",
    assembly: HULL_ASSEMBLY,
    build_layer: 1,
    geometry: { type: "kit", kit: "carrierBootStripe" },
    material: "cv_hull_dark",
    mate: A([0, 0, 0]),
  });
  add({
    id: "carrier.hull.bottom",
    name_cn: "双层底/底板",
    name_en: "double bottom",
    assembly: HULL_ASSEMBLY,
    build_layer: 1,
    geometry: { type: "kit", kit: "carrierBottom" },
    material: "cv_hull_boot",
    mate: A([0, 0, 0]),
  });
  add({
    id: "carrier.hull.keel",
    name_cn: "平板龙骨",
    name_en: "flat keel",
    assembly: HULL_ASSEMBLY,
    build_layer: 1,
    geometry: M(B(1.1, 0.16, 36, [0, 0, 0], 0.02), B(1.5, 0.1, 9, [0, 0.02, 9], 0.012)),
    material: "cv_steel",
    mate: A([0, CV.HULL_BOTTOM + 0.1, 0]),
  });
  for (let k = 0; k < 6; k++) {
    add({
      id: `carrier.hull.keel_strake_${pad(k + 1)}`,
      name_cn: `龙骨翼板 ${k + 1}`,
      name_en: `keel strake ${k + 1}`,
      assembly: HULL_ASSEMBLY,
      build_layer: 1,
      geometry: M(B(0.28, 0.22, 5.8, [0, 0, 0], 0.01)),
      material: "cv_steel_dark",
      mate: A([0, CV.HULL_BOTTOM + 0.17, -15 + k * 6.0], [0, 0, 0]),
    });
  }

  // 艉封板：放样壳体的艉端封口是一块平板，补上真实的艉门/横向扶强材/门框，
  // 避免从舰艉看过去是一整块空白板。
  add({
    id: "carrier.hull.stern_transom",
    name_cn: "艉封板（随艉部横剖面）",
    name_en: "stern transom (hull section)",
    assembly: HULL_ASSEMBLY,
    build_layer: 1,
    geometry: { type: "kit", kit: "carrierSternTransom" },
    material: "cv_hull_dark",
    mate: A([0, 0, 0]),
    source: "按艉部站位的真实横剖面从船底封到甲板底，覆盖水上/水下壳艉端。",
  });
  add({
    id: "carrier.hull.stern_transom_detail",
    name_cn: "艉门与横向扶强材",
    name_en: "stern door and transom stiffeners",
    assembly: HULL_ASSEMBLY,
    build_layer: 1,
    geometry: M(
      B(1.5, 1.15, 0.06, [0, -0.35, -0.02], 0.008),
      B(1.7, 0.08, 0.08, [0, 0.28, -0.04], 0.006),
      B(1.7, 0.08, 0.08, [0, -0.98, -0.04], 0.006),
      B(0.08, 1.3, 0.08, [-0.8, -0.35, -0.04], 0.006),
      B(0.08, 1.3, 0.08, [0.8, -0.35, -0.04], 0.006),
      B(3.9, 0.06, 0.06, [0, 0.62, -0.03], 0.005),
      B(3.9, 0.06, 0.06, [0, 0.98, -0.03], 0.005),
      B(3.6, 0.07, 0.06, [0, -1.08, -0.03], 0.005),
      C(0.06, 0.16, [-0.5, -0.35, -0.07], 12),
      C(0.06, 0.16, [0.5, -0.35, -0.07], 12),
      // 两根竖向扶强材把门框与上下横向扶强材连成整体，避免合并件内部断成孤块。
      B(0.08, 2.2, 0.06, [-0.85, 0, -0.04], 0.004),
      B(0.08, 2.2, 0.06, [0.85, 0, -0.04], 0.004),
    ),
    material: "cv_steel",
    mate: A([0, 3.1, -18.58]),
  });

  // 艏部楔形整流：船壳放样的艏端封口是斜切面，从正前方仰视会看到两舷之间的暗缝；
  // 用实心楔形艏柱把两舷/艏柱/球鼻艏之间填实，形成可看见的艏部外形。
  add({
    id: "carrier.hull.bow_rake_fairing",
    name_cn: "舰艏楔形整流/艏柱",
    name_en: "bow rake fairing",
    assembly: HULL_ASSEMBLY,
    build_layer: 1,
    geometry: { type: "kit", kit: "carrierBowRake" },
    material: "cv_hull",
    mate: A([0, 0, -0.18]),
    source: "填实两舷艏端之间的楔形空间，避免正前方仰视出现中空暗缝。",
  });
  // 艏柱包板焊缝已由楔形艏柱整流承担，不再额外贴一条白色长条。

  // 球鼻艏（回转体放样，压在艏柱/龙骨前端）+ 声呐导流罩。
  add({
    id: "carrier.hull.bulbous_bow",
    name_cn: "球鼻艏",
    name_en: "bulbous bow",
    assembly: HULL_ASSEMBLY,
    build_layer: 1,
    geometry: M({
      type: "latheZ",
      profile: [
        [0.02, 17.15],
        [0.1, 17.35],
        [0.2, 17.6],
        [0.3, 17.95],
        [0.36, 18.35],
        [0.35, 18.75],
        [0.28, 19.1],
        [0.16, 19.35],
        [0.04, 19.5],
      ],
      segments: 32,
    }),
    material: "cv_antifouling",
    mate: A([0, 0.6, 0]),
  });
  add({
    id: "carrier.hull.sonar_dome",
    name_cn: "声呐导流罩",
    name_en: "bow sonar dome",
    assembly: HULL_ASSEMBLY,
    build_layer: 1,
    geometry: M(S(0.16, [0, 0, 0], 20)),
    material: "cv_rubber",
    mate: A([0, 0.38, 18.55]),
  });

  // 肋骨框架：32 站 × 肋板/左右舷侧/甲板梁。
  const frameCount = 32;
  for (let i = 0; i < frameCount; i++) {
    const z = CV.HULL_Z_STERN + 0.9 + (i * (CV.HULL_LEN - 1.8)) / (frameCount - 1);
    const half = Math.max(0.55, hullHalfBeamAt(z) - 0.1);
    const station = pad(i + 1);
    add({
      id: `carrier.hull.frame_${station}_floor`,
      name_cn: `肋板 ${station}`,
      name_en: `floor frame ${station}`,
      assembly: HULL_ASSEMBLY,
      build_layer: 1,
      geometry: M(B(half * 0.9, 0.14, 0.14, [0, 0, 0], 0.008)),
      material: "cv_steel_dark",
      mate: A([0, CV.HULL_BOTTOM + 0.25, z]),
    });
    // 肋骨分三段随型线内收：每段取该高度区间内最窄的真实外板半宽，
    // 保证整段肋骨都在壳板以内（旧版按船底最大半宽放，肋骨会从舷侧露出一排竖条）。
    const frameInset = (y0: number, y1: number) => {
      let minHalf = Infinity;
      for (let k = 0; k <= 4; k++) minHalf = Math.min(minHalf, hullSurfaceHalfAt(z, y0 + ((y1 - y0) * k) / 4));
      return Math.max(0.35, minHalf - 0.08);
    };
    const frameLoY = CV.HULL_BOTTOM + 0.82;
    const frameMidY = CV.HULL_BOTTOM + 1.85;
    const frameHiY = CV.HULL_BOTTOM + 2.85;
    const xLo = frameInset(frameLoY - 0.675, frameLoY + 0.675);
    const xMid = frameInset(frameMidY - 0.425, frameMidY + 0.425);
    const xHi = frameInset(frameHiY - 0.675, frameHiY + 0.675);
    for (const side of [-1, 1] as const) {
      add({
        id: `carrier.hull.frame_${station}_side_${side === -1 ? "l" : "r"}_lo`,
        name_cn: `${side === -1 ? "左" : "右"}舷肋骨 ${station} 下段`,
        name_en: `${side === -1 ? "port" : "starboard"} frame ${station} lower`,
        assembly: HULL_ASSEMBLY,
        build_layer: 1,
        geometry: M(B(0.13, 1.35, 0.14, [0, 0, 0], 0.008)),
        material: "cv_steel_dark",
        mate: A([side * xLo, frameLoY, z]),
      });
      add({
        id: `carrier.hull.frame_${station}_side_${side === -1 ? "l" : "r"}_mid`,
        name_cn: `${side === -1 ? "左" : "右"}舷肋骨 ${station} 中段`,
        name_en: `${side === -1 ? "port" : "starboard"} frame ${station} middle`,
        assembly: HULL_ASSEMBLY,
        build_layer: 1,
        geometry: M(B(0.13, 0.85, 0.14, [0, 0, 0], 0.008)),
        material: "cv_steel_dark",
        mate: A([side * xMid, frameMidY, z]),
      });
      add({
        id: `carrier.hull.frame_${station}_side_${side === -1 ? "l" : "r"}_hi`,
        name_cn: `${side === -1 ? "左" : "右"}舷肋骨 ${station} 上段`,
        name_en: `${side === -1 ? "port" : "starboard"} frame ${station} upper`,
        assembly: HULL_ASSEMBLY,
        build_layer: 1,
        geometry: M(B(0.13, 1.35, 0.14, [0, 0, 0], 0.008)),
        material: "cv_steel_dark",
        mate: A([side * xHi, frameHiY, z]),
      });
    }
    const beamHalf = Math.max(0.5, hullSurfaceHalfAt(z, CV.HANGAR_Y - 0.02) - 0.1);
    add({
      id: `carrier.hull.frame_${station}_beam`,
      name_cn: `甲板横梁 ${station}`,
      name_en: `deck beam ${station}`,
      assembly: HULL_ASSEMBLY,
      build_layer: 1,
      geometry: M(B(beamHalf * 2, 0.12, 0.16, [0, 0, 0], 0.008)),
      material: "cv_steel",
      mate: A([0, CV.HANGAR_Y - 0.02, z]),
    });
  }

  // 纵桁 ×6 ×10 段。
  const girderX = [-2.6, -1.5, -0.55, 0.55, 1.5, 2.6];
  for (let g = 0; g < girderX.length; g++) {
    for (let s = 0; s < 9; s++) {
      add({
        id: `carrier.hull.girder_${pad(g + 1)}_${pad(s + 1)}`,
        name_cn: `纵桁 ${g + 1}-${s + 1}`,
        name_en: `girder ${g + 1}-${s + 1}`,
        assembly: HULL_ASSEMBLY,
        build_layer: 1,
        geometry: M(B(0.12, 0.18, 3.1, [0, 0, 0], 0.006)),
        material: "cv_steel_dark",
        mate: A([girderX[g]!, CV.LOWER_DECK_Y - 0.06, -16 + s * 3.2]),
      });
    }
  }

  add({
    id: "carrier.hull.hangar_deck",
    name_cn: "机库甲板",
    name_en: "hangar deck",
    assembly: HULL_ASSEMBLY,
    build_layer: 2,
    geometry: { type: "kit", kit: "carrierHangarDeck" },
    material: "cv_deck_plate",
    mate: A([0, 0, 0]),
  });
  add({
    id: "carrier.hull.lower_deck",
    name_cn: "下层甲板",
    name_en: "lower deck",
    assembly: HULL_ASSEMBLY,
    build_layer: 2,
    geometry: { type: "kit", kit: "carrierLowerDeck" },
    material: "cv_deck_plate",
    mate: A([0, 0, 0]),
  });
  for (let p = 0; p < 16; p++) {
    const z = -15 + p * 1.9;
    add({
      id: `carrier.hull.hangar_plate_${pad(p + 1)}`,
      name_cn: `机库甲板加强板 ${p + 1}`,
      name_en: `hangar deck plate ${p + 1}`,
      assembly: HULL_ASSEMBLY,
      build_layer: 2,
      geometry: M(B(6.6, 0.04, 1.7, [0, 0, 0], 0.004)),
      material: "cv_deck_plate",
      mate: A([0, CV.HANGAR_Y + 0.13, z]),
    });
  }

  // 横向水密舱壁 + 扶强材。
  BULKHEAD_Z.forEach((z, index) => {
    const station = pad(index + 1);
    // 机库/机舱/弹药库段：舱壁只保留在底层甲板以下，避免横穿可进入舱室。
    const throughHangar = z > -17 && z < 11;
    const bulkH = throughHangar ? 0.7 : 2.0;
    const bulkY = throughHangar ? 0.9 : 2.35;
    let minHalf = Infinity;
    for (let k = 0; k <= 4; k++) {
      minHalf = Math.min(minHalf, hullSurfaceHalfAt(z, bulkY - bulkH / 2 + (bulkH * k) / 4));
    }
    const half = Math.max(0.5, minHalf - 0.08);
    add({
      id: `carrier.hull.bulkhead_${station}`,
      name_cn: `水密舱壁 ${station}`,
      name_en: `watertight bulkhead ${station}`,
      assembly: HULL_ASSEMBLY,
      build_layer: 1,
      geometry: M(B(half * 2, bulkH, 0.1, [0, 0, 0], 0.008)),
      material: "cv_steel_dark",
      mate: A([0, bulkY, z]),
    });
    for (let s = -1; s <= 1; s++) {
      add({
        id: `carrier.hull.bulkhead_${station}_stiff_${s + 2}`,
        name_cn: `舱壁扶强材 ${station}-${s + 2}`,
        name_en: `bulkhead stiffener ${station}-${s + 2}`,
        assembly: HULL_ASSEMBLY,
        build_layer: 1,
        geometry: M(B(0.1, throughHangar ? 0.6 : 1.9, 0.16, [0, 0, 0], 0.006)),
        material: "cv_steel_dark",
        mate: A([s * half * 0.55, throughHangar ? 0.9 : 2.36, z - 0.08]),
      });
    }
  });

  // 可开关水密门：门板挂在铰链节点上，压紧轮/门框固定在舱壁。
  for (let d = 0; d < DOOR_COUNT; d++) {
    const z = BULKHEAD_Z[(d * 5 + 2) % BULKHEAD_Z.length]!;
    const side = d % 2 === 0 ? -1 : 1;
    const hingeX = side * 2.15;
    const node = `CV_Door_${pad(d + 1)}`;
    ctx.node({ name: node, parent: "root", pivot: [hingeX, CV.LOWER_DECK_Y + 0.9, z], motion: "rotate", axis: "y", note: `水密门 ${d + 1}` });
    add({
      id: `carrier.hull.door_${pad(d + 1)}_leaf`,
      name_cn: `水密门 ${d + 1} 门板`,
      name_en: `watertight door ${d + 1}`,
      assembly: HULL_ASSEMBLY,
      build_layer: 2,
      geometry: M(B(0.66, 0.9, 0.055, [-side * 0.33, 0, 0], 0.01)),
      material: "cv_steel_dark",
      node,
      mate: A([0, 0, 0]),
    });
    add({
      id: `carrier.hull.door_${pad(d + 1)}_wheel`,
      name_cn: `水密门 ${d + 1} 压紧轮`,
      name_en: `watertight door wheel ${d + 1}`,
      assembly: HULL_ASSEMBLY,
      build_layer: 2,
      geometry: M(T(0.12, 0.08, 0.03, [0, 0, 0], 18), C(0.025, 0.08, [0, 0, 0], 10)),
      material: "cv_brass",
      node,
      mate: A([-side * 0.3, 0.02, 0.06], [90, 0, 0]),
    });
    add({
      id: `carrier.hull.door_${pad(d + 1)}_frame`,
      name_cn: `水密门 ${d + 1} 门框`,
      name_en: `watertight door frame ${d + 1}`,
      assembly: HULL_ASSEMBLY,
      build_layer: 2,
      geometry: M(
        B(0.76, 0.08, 0.16, [0, 0.49, 0], 0.008),
        B(0.76, 0.08, 0.16, [0, -0.49, 0], 0.008),
        B(0.08, 0.98, 0.16, [-0.7, 0, 0], 0.008),
      ),
      material: "cv_steel",
      mate: A([hingeX + side * 0.3, CV.LOWER_DECK_Y + 0.9, z - 0.05]),
    });
    add({
      id: `carrier.hull.door_${pad(d + 1)}_clamp`,
      name_cn: `水密门 ${d + 1} 锁扣`,
      name_en: `watertight door clamp ${d + 1}`,
      assembly: HULL_ASSEMBLY,
      build_layer: 2,
      geometry: M(B(0.14, 0.1, 0.1, [0, 0, 0], 0.008)),
      material: "cv_steel",
      node,
      mate: A([side * 0.2, 0, 0.06]),
    });
  }

  // 舰体分段接缝：沿固定肋骨站位的真实外板点焊出焊缝（艏部随前倾一起前移，
  // 不能钉死在固定 z 上，否则焊缝会斜切进壳板或浮在壳板外）。
  for (let s = 0; s < 8; s++) {
    const stationZ = -16.1 + s * 4.6;
    const ys = [1.3, 1.9, 2.5, 3.1, 3.5, 3.9];
    for (const side of [-1, 1] as const) {
      const seams = [];
      for (let i = 0; i < ys.length - 1; i++) {
        const y0 = ys[i]!;
        const y1 = ys[i + 1]!;
        const p0 = hullSurfaceAtStation(stationZ, y0);
        const p1 = hullSurfaceAtStation(stationZ, y1);
        seams.push({
          type: "weld" as const,
          from: [side * (p0.half + 0.006), y0, p0.z] as [number, number, number],
          to: [side * (p1.half + 0.006), y1, p1.z] as [number, number, number],
          radius: 0.011,
          seed: 900 + s + side,
        });
      }
      add({
        id: `carrier.hull.segment_${pad(s + 1)}_${side === -1 ? "l" : "r"}`,
        name_cn: `分段外板焊缝 ${s + 1}-${side === -1 ? "左" : "右"}`,
        name_en: `shell segment seam ${s + 1}-${side === -1 ? "l" : "r"}`,
        assembly: HULL_ASSEMBLY,
        build_layer: 1,
        geometry: M(...seams),
        material: "cv_steel_dark",
        mate: A([0, 0, 0]),
      });
    }
  }

  // 舱室隔板（住舱/损管/配电）：作为内部体量，后续可剖视。
  const rooms = [
    ["dc", "损管站", 2.35, -7.2],
    ["berth_a", "住舱 A", -2.25, 7.5],
    ["berth_b", "住舱 B", 2.25, 8.5],
    ["galley", "厨房", -2.25, 2.5],
    ["medical", "医疗舱", 2.25, 3.5],
    ["switch", "配电舱", 1.2, -13.5],
  ] as const;
  for (const [key, name, x, z] of rooms) {
    add({
      id: `carrier.hull.compartment_${key}`,
      name_cn: `${name}围壁`,
      name_en: `${key} compartment`,
      assembly: HULL_ASSEMBLY,
      build_layer: 2,
      geometry: M(
        B(1.9, 0.06, 1.8, [0, -0.68, 0], 0.004),
        B(1.9, 1.4, 0.05, [0, 0, -0.9], 0.004),
        B(0.05, 1.4, 1.8, [-0.95, 0, 0], 0.004),
        B(0.05, 1.4, 1.8, [0.95, 0, 0], 0.004),
      ),
      material: "cv_hull_dark",
      mate: A([x, CV.LOWER_DECK_Y + 0.71, z]),
    });
  }
}
