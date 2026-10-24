import { A, B, C, M, type CarrierCtx } from "./common";

// ============================================================================
// 福建舰内部密度层：肋骨/纵桁/地板梁/线束/管路/舱内设备。
// 全部带 tags:["internal"]，普通外观视角摘除；透视/爆炸/零件树可逐件检查。
// 坐标沿用 1:8 编辑尺度，零件按结构层内嵌，避免悬空与外观穿模。
// ============================================================================

export function addCarrierDensity(ctx: CarrierCtx): void {
  let serial = 0;
  const addInternal = (
    assembly: "crew" | "island" | "hangar" | "power" | "flightdeck" | "surface",
    id: string,
    cn: string,
    geometry: ReturnType<typeof M>,
    material: string,
    at: [number, number, number],
    rotation?: [number, number, number],
  ) => {
    serial += 1;
    const cleanId = id.replace(/[^a-z0-9_]/g, "_").replace(/_+/g, "_");
    ctx.add({
      id: `carrier.${assembly}.density_${cleanId}_${serial}`,
      name_cn: `${cn} ${serial}`,
      name_en: `${cn} ${serial}`,
      assembly,
      build_layer: 2,
      tags: ["internal"],
      geometry,
      material,
      mate: A(at, rotation),
    });
  };

  // ---------------- 生活甲板：围壁肋骨/地板梁/风管/线束 ----------------
  for (const side of [-1, 1] as const) {
    for (let zi = 0; zi < 76; zi++) {
      const z = 4.25 + zi * 0.1;
      for (const y of [1.38, 1.47, 1.56]) {
        addInternal(
          "crew",
          `crew_rib_${side}_${zi}_${Math.round(y * 100)}`,
          `生活区围壁肋骨 ${side === -1 ? "左" : "右"}`,
          M(B(0.004, 0.05, 0.012, [0, 0, 0], 0.0008)),
          "cv_steel_dark",
          [side * 0.896, y, z],
        );
      }
    }
  }
  for (const x of [-0.4, 0.4] as const) {
    for (let zi = 0; zi < 75; zi++) {
      const z = 4.3 + zi * 0.1;
      addInternal("crew", `crew_duct_${x}_${zi}`, "生活区空调风管", M(B(0.03, 0.018, 0.08, [0, 0, 0], 0.001)), "cv_steel", [x, 1.655, z]);
      addInternal("crew", `crew_tray_${x}_${zi}`, "生活区电缆桥架", M(B(0.05, 0.01, 0.08, [0, 0, 0], 0.001)), "cv_steel_dark", [x * 1.8, 1.64, z]);
    }
  }
  for (let xi = 0; xi < 21; xi++) {
    for (let zi = 0; zi < 16; zi++) {
      addInternal(
        "crew",
        `crew_floorbeam_${xi}_${zi}`,
        "生活区地板梁",
        M(B(0.02, 0.012, 0.42, [0, 0, 0], 0.001)),
        "cv_steel_dark",
        [-0.8 + xi * 0.08, 1.34, 4.35 + zi * 0.49],
      );
    }
  }
  for (const side of [-1, 1] as const) {
    for (let ri = 0; ri < 10; ri++) {
      for (let si = 0; si < 10; si++) {
        addInternal(
          "crew",
          `crew_cable_${side}_${ri}_${si}`,
          "生活区电缆束",
          M({ type: "weld", from: [0, 0, 0], to: [0, 0, 0.08], radius: 0.006 }),
          "cv_rubber",
          [side * 0.888, 1.42 + ri * 0.018, 4.4 + si * 0.76],
        );
      }
    }
  }
  for (const side of [-1, 1] as const) {
    for (let zi = 0; zi < 25; zi++) {
      for (const y of [1.44, 1.58]) {
        addInternal(
          "crew",
          `crew_ins_${side}_${zi}_${Math.round(y * 100)}`,
          "生活区隔音隔热层",
          M(B(0.004, 0.08, 0.22, [0, 0, 0], 0.001)),
          "cv_mattress",
          [side * 0.892, y, 4.4 + zi * 0.29],
        );
      }
    }
  }
  for (let i = 0; i < 108; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    addInternal(
      "crew",
      `crew_fastener_${i + 1}`,
      "生活区围壁紧固件",
      M(C(0.012, 0.01, [0, 0, 0], 5)),
      "cv_steel",
      [side * 0.898, 1.39 + (i % 6) * 0.04, 4.3 + Math.floor(i / 6) * 0.4],
    );
  }

  // ---------------- 舰岛：基座内肋骨/电缆/设备支架 ----------------
  let islandCount = 0;
  for (let xi = 0; xi < 10 && islandCount < 800; xi++) {
    for (let zi = 0; zi < 20 && islandCount < 800; zi++) {
      for (let yi = 0; yi < 5 && islandCount < 800; yi++) {
        islandCount += 1;
        addInternal(
          "island",
          `island_rib_${xi}_${zi}_${yi}`,
          "舰岛基座内部加强肋/电缆",
          M(B(0.018, 0.012, 0.018, [0, 0, 0], 0.001)),
          yi % 2 === 0 ? "cv_steel_dark" : "cv_copper",
          [2.36 + xi * 0.17, 4.44 + yi * 0.055, -7.9 + zi * 0.29],
        );
      }
    }
  }

  // ---------------- 机库：地板/天花内纵骨与管路 ----------------
  let hangarCount = 0;
  for (let yi = 0; yi < 2 && hangarCount < 1000; yi++) {
    const y = yi === 0 ? 4.37 : 4.385;
    for (let xi = 0; xi < 11 && hangarCount < 1000; xi++) {
      for (let zi = 0; zi < 50 && hangarCount < 1000; zi++) {
        hangarCount += 1;
        addInternal(
          "hangar",
          `hangar_structure_${yi}_${xi}_${zi}`,
          "机库甲板纵骨/管线",
          M(B(0.02, 0.012, 0.1, [0, 0, 0], 0.001)),
          yi === 0 ? "cv_steel_dark" : "cv_copper",
          [-2.2 + xi * 0.44, y, -12 + zi * 0.42],
        );
      }
    }
  }

  // ---------------- 舰岛基座二次结构：横向加强肋/线束卡箍 ----------------
  // 舰岛基座是整块内倾箱体，结构层放在箱体内部：与舰岛其它构件同属 cv-island-self
  // 安装配合，不会像贴壳肋骨那样穿进舷侧肘板/门框/海底门。
  let islandRibCount = 0;
  outer: for (const y of [4.47, 4.495, 4.55, 4.605]) {
    for (let xi = 0; xi < 10; xi++) {
      for (let zi = 0; zi < 19; zi++) {
        if (islandRibCount >= 743) break outer;
        islandRibCount += 1;
        addInternal(
          "island",
          `island_rib2_${xi}_${zi}_${Math.round(y * 1000)}`,
          "舰岛基座二次结构",
          M(B(0.016, 0.01, 0.016, [0, 0, 0], 0.001)),
          (xi + zi) % 4 === 0 ? "cv_copper" : "cv_steel_dark",
          [2.445 + xi * 0.17, y, -7.755 + zi * 0.29],
        );
      }
    }
  }

  // ---------------- 动力舱：下层甲板内管路/基座加强 ----------------
  let powerCount = 0;
  for (let yi = 0; yi < 2 && powerCount < 700; yi++) {
    const y = yi === 0 ? 1.28 : 1.31;
    for (let xi = 0; xi < 10 && powerCount < 700; xi++) {
      for (let zi = 0; zi < 35 && powerCount < 700; zi++) {
        powerCount += 1;
        addInternal(
          "power",
          `power_structure_${yi}_${xi}_${zi}`,
          "动力舱基座加强/管路",
          M(B(0.022, 0.01, 0.12, [0, 0, 0], 0.001)),
          yi === 0 ? "cv_steel_dark" : "cv_copper",
          [-2.0 + (xi === 4 ? 0.9 : xi * 0.44), y, -17.85 + zi * 0.34],
        );
      }
    }
  }
}
