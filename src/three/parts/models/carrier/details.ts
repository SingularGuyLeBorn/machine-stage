import { CV } from "./constants";
import { hullSurfaceHalfAt } from "./kits";
import { A, B, C, M, pad, T, type CarrierCtx } from "./common";

// ============================================================================
// models/carrier/details —— 3000+ 零件粒度的结构/设备细节
//
// 这些不是随机小方块：全部是舰体加强件、甲板梁、舱壁扶强材、管系阀件、
// 机库工装、弹射器定子附件、舰岛设备、舰载机蒙皮/翼肋等真实构造层级。
// 全部搭接在已有结构上（支撑检测），静态构造接触统一走 staticOnly 白名单。
// ============================================================================

const HULL = "hull";
const POWER = "power";
const HANGAR = "hangar";
const DECK = "flightdeck";
const ISLAND = "island";
const AIRCRAFT = "aircraft";

export function addCarrierDetails(ctx: CarrierCtx): void {
  const add = (part: Parameters<CarrierCtx["add"]>[0]) => ctx.add(part);
  const DECK_TOP = CV.DECK_Y + CV.DECK_T;
  const BULKHEADS = [-15, -11.5, -8, -4.5, -1, 2.5, 6, 9.5, 13];
  const ROOMS: Array<[string, number, number]> = [
    ["dc", 2.7, -7.2],
    ["berth_a", -2.6, 12.5],
    ["berth_b", 2.6, 8.5],
    ["galley", -2.6, 2.5],
    ["medical", 2.6, 3.5],
    ["switch", 2.9, -12.3],
  ];

  // ---------------- L1 舰体：肋骨肘板 / 舷侧纵骨 / 甲板梁 / 舱壁扶强材 ----------------
  for (let i = 0; i < 32; i++) {
    const z = CV.HULL_Z_STERN + 0.9 + (i * (CV.HULL_LEN - 1.8)) / 31;
    for (const side of [-1, 1] as const) {
      for (const level of [0.7, 1.35, 2.05]) {
        // 左舷弹药升降机（x≈-2.2, z≈-5.8）的垂直行程内不放肘板，避免扫掠时切到平台。
        if (side === -1 && z > -7.0 && z < -4.35 && (Math.abs(level - 1.35) < 1e-6 || Math.abs(level - 2.05) < 1e-6)) continue;
        // 肘板随型线所在高度的真实外板内收；旧版按船底最大半宽放，低处会整块伸出舷外。
        const half = Math.max(0.55, hullSurfaceHalfAt(z, level) - 0.02);
        add({
          id: `carrier.hull.detail_gusset_${pad(i + 1)}_${side === -1 ? "l" : "r"}_${Math.round(level * 100)}`,
          name_cn: `肋骨肘板 ${i + 1}-${level}`,
          name_en: `frame gusset ${i + 1}-${level}`,
          assembly: HULL,
          build_layer: 1,
          geometry: M(B(0.36, 0.1, 0.22, [0, 0, 0], 0.005), B(0.1, 0.32, 0.22, [side * 0.15, -0.1, 0], 0.004)),
          material: "cv_steel_dark",
          mate: A([side * (half - 0.2), level, z]),
        });
        add({
          id: `carrier.hull.detail_gusset_x_${pad(i + 1)}_${side === -1 ? "l" : "r"}_${Math.round(level * 100)}`,
          name_cn: `肋骨加强肘板 ${i + 1}-${level}`,
          name_en: `frame bracket ${i + 1}-${level}`,
          assembly: HULL,
          build_layer: 1,
          geometry: M(B(0.1, 0.28, 0.18, [0, 0, 0], 0.004)),
          material: "cv_steel",
          mate: A([side * (half - 0.16), level + 0.12, z + 0.1]),
        });
      }
    }
  }
  for (const side of [-1, 1] as const) {
    for (let zi = 0; zi < 16; zi++) {
      const z = -16.8 + zi * 2.2;
      for (let level = 0; level < 7; level++) {
        const y = 0.68 + level * 0.46;
        // 同样的弹药升降机净空：跳过与平台行程重叠的那段纵骨。
        if (side === -1 && z > -7.0 && z < -4.4 && level === 2) continue;
        // 纵骨直段跨 2.2m，取分段两端真实外板的较小半宽，整段埋在壳板内侧。
        const half = Math.max(0.55, Math.min(hullSurfaceHalfAt(z - 1.1, y), hullSurfaceHalfAt(z + 1.1, y)) - 0.06);
        add({
          id: `carrier.hull.detail_stringer_${side === -1 ? "l" : "r"}_${pad(zi + 1)}_${level + 1}`,
          name_cn: `舷侧纵骨 ${zi + 1}-${level + 1}`,
          name_en: `side stringer ${zi + 1}-${level + 1}`,
          assembly: HULL,
          build_layer: 1,
          geometry: M(B(0.1, 0.075, 2.2, [0, 0, 0], 0.004)),
          material: "cv_steel_dark",
          mate: A([side * (half - 0.18), y, z]),
        });
      }
    }
  }
  for (let level = 0; level < 4; level++) {
    // 第三层纵梁抬到机库停放机垂尾之上（原 3.55 会切到 J-15 垂尾）。
    const y = [CV.LOWER_DECK_Y - 0.12, CV.HANGAR_Y - 0.12, 3.75, CV.DECK_Y - 0.05][level]!;
    for (let zi = 0; zi < 12; zi++) {
      const z = -15 + zi * 2.55;
      const half = Math.max(0.7, hullSurfaceHalfAt(z, y) - 0.3);
      add({
        id: `carrier.hull.detail_deck_beam_${level + 1}_${pad(zi + 1)}`,
        name_cn: `甲板纵梁 ${level + 1}-${zi + 1}`,
        name_en: `deck girder ${level + 1}-${zi + 1}`,
        assembly: HULL,
        build_layer: 1,
        geometry: M(B(half * 2, 0.1, 0.16, [0, 0, 0], 0.005)),
        material: "cv_steel",
        mate: A([0, y, z]),
      });
    }
  }
  for (let bi = 0; bi < BULKHEADS.length; bi++) {
    const z = BULKHEADS[bi]!;
    const throughHangar = z > -17 && z < 11;
    const yStiff = CV.HULL_BOTTOM + (throughHangar ? 0.3 : 1.5);
    const stiffTop = yStiff + (throughHangar ? 0.6 : 2.6);
    const half = Math.max(0.8, hullSurfaceHalfAt(z, stiffTop) - 0.2);
    for (let s = 0; s < 4; s++) {
      add({
        id: `carrier.hull.detail_bulkhead_stiff_${pad(bi + 1)}_${s + 1}`,
        name_cn: `舱壁扶强材 ${bi + 1}-${s + 1}`,
        name_en: `bulkhead stiffener ${bi + 1}-${s + 1}`,
        assembly: HULL,
        build_layer: 1,
        geometry: M(B(0.08, throughHangar ? 0.6 : 2.6, 0.1, [0, 0, 0], 0.004)),
        material: "cv_steel_dark",
        mate: A([(s - 1.5) * half * 0.38, yStiff, z - 0.08]),
      });
    }
    for (let p = 0; p < 2; p++) {
      add({
        id: `carrier.hull.detail_penetration_${pad(bi + 1)}_${p + 1}`,
        name_cn: `舱壁管路贯穿 ${bi + 1}-${p + 1}`,
        name_en: `bulkhead penetration ${bi + 1}-${p + 1}`,
        assembly: HULL,
        build_layer: 1,
        geometry: M(C(0.06, 0.22, [0, 0, 0], 12)),
        material: "cv_copper",
        mate: A([(p - 0.5) * half, CV.LOWER_DECK_Y + 0.55, z], [90, 0, 0]),
      });
    }
  }
  // 水密门铰链/压紧螺栓（挂在门节点上，随门开合）。
  for (let d = 0; d < 12; d++) {
    const node = `CV_Door_${pad(d + 1)}`;
    for (let h = 0; h < 2; h++) {
      add({
        id: `carrier.hull.detail_door_hinge_${pad(d + 1)}_${h + 1}`,
        name_cn: `水密门铰链 ${d + 1}-${h + 1}`,
        name_en: `watertight door hinge ${d + 1}-${h + 1}`,
        assembly: HULL,
        build_layer: 2,
        geometry: M(C(0.035, 0.12, [0, 0, 0], 10)),
        material: "cv_steel",
        node,
        mate: A([0, h === 0 ? 0.28 : -0.28, 0.04], [90, 0, 0]),
      });
    }
    add({
      id: `carrier.hull.detail_door_dog_${pad(d + 1)}`,
      name_cn: `水密门压紧螺栓 ${d + 1}`,
      name_en: `watertight door dog ${d + 1}`,
      assembly: HULL,
      build_layer: 2,
      geometry: M(C(0.03, 0.1, [0, 0, 0], 8), B(0.12, 0.035, 0.035, [0, 0.04, 0], 0.003)),
      material: "cv_steel",
      node,
      mate: A([(d % 2 === 0 ? 0.2 : -0.2), 0.06, 0.07], [0, 0, 90]),
    });
  }
  // 舱室家具/设备。
  for (const [key, x, z] of ROOMS) {
    const y = CV.LOWER_DECK_Y + 0.08;
    const pieces: Array<[string, string, ReturnType<typeof M>, number, number, number]> = [
      ["bunk", "铺位", M(B(1.5, 0.35, 0.7, [0, 0, 0], 0.008), B(1.45, 0.06, 0.65, [0, 0.2, 0], 0.004)), x - 0.2, y + 0.2, z],
      ["locker", "储物柜", M(B(0.5, 1.2, 0.45, [0, 0, 0], 0.008)), x + 0.65, y + 0.6, z - 0.55],
      ["table", "桌子", M(B(0.9, 0.06, 0.6, [0, 0, 0], 0.004), B(0.06, 0.5, 0.5, [0, -0.28, 0], 0.003)), x + 0.2, y + 0.55, z + 0.5],
      ["chair", "座椅", M(B(0.35, 0.08, 0.35, [0, 0, 0], 0.004), B(0.35, 0.4, 0.06, [0, 0.2, -0.16], 0.003)), x + 0.2, y + 0.3, z + 0.9],
      ["console", "舱室显控台", M(B(0.8, 0.3, 0.25, [0, 0, 0], 0.006), B(0.6, 0.18, 0.02, [0, 0.18, 0.1], 0.003)), x - 0.3, y + 0.55, z + 0.65],
      ["fan", "通风机", M(C(0.18, 0.2, [0, 0, 0], 14), B(0.3, 0.05, 0.3, [0, -0.12, 0], 0.004)), x + 0.8, y + 1.4, z + 0.8],
    ];
    const pieceHalfX: Record<string, number> = { bunk: 0.76, locker: 0.26, table: 0.46, chair: 0.18, console: 0.4, fan: 0.16 };
    const pieceBottom: Record<string, number> = { bunk: 0.18, locker: 0.6, table: 0.31, chair: 0.04, console: 0.15, fan: 0.23 };
    for (const [piece, name, geometry, px, py, pz] of pieces) {
      // 舱室家具也不能顶出船壳：按家具上下沿中最窄处的真实半宽把 x 往中线收。
      const yLow = py - (pieceBottom[piece] ?? 0.3);
      const minHalf = Math.min(hullSurfaceHalfAt(pz, py), hullSurfaceHalfAt(pz, Math.max(0.2, yLow)));
      const limit = Math.max(0.2, minHalf - (pieceHalfX[piece] ?? 0.3) - 0.08);
      const safeX = Math.sign(px || 1) * Math.min(Math.abs(px), limit);
      add({
        id: `carrier.hull.detail_${key}_${piece}`,
        name_cn: `${key} ${name}`,
        name_en: `${key} ${piece}`,
        assembly: HULL,
        build_layer: 2,
        geometry,
        material: "cv_steel_dark",
        mate: A([safeX, py, pz]),
      });
    }
  }
  // 分段/合拢焊缝统一由 hull.ts 的贴合曲面焊道生成，这里不再叠固定 z 的竖板。
  // 外板列板（水平板缝）：沿船壳曲线放样，外缘露出舷外，内缘搭在舷侧纵骨上。
  const strakeLevels = [1.14, 1.6, 2.06, 2.52, 2.98];
  for (const side of [-1, 1] as const) {
    for (const level of strakeLevels) {
      add({
        id: `carrier.hull.detail_strake_${side === -1 ? "l" : "r"}_${Math.round(level * 100)}`,
        name_cn: `舷侧列板 ${level}`,
        name_en: `shell strake ${level}`,
        assembly: HULL,
        build_layer: 1,
        geometry: { type: "kit", kit: "carrierHullStrake", params: { level, side } },
        material: "cv_hull_dark",
        mate: A([0, 0, 0]),
      });
    }
  }
  // 舭龙骨：沿舭部折角外伸的连续板，内缘与底部纵骨/舷侧纵骨搭接。
  for (const side of [-1, 1] as const) {
    add({
      id: `carrier.hull.detail_bilge_keel_${side === -1 ? "l" : "r"}`,
      name_cn: `舭龙骨 ${side === -1 ? "左" : "右"}`,
      name_en: `bilge keel ${side === -1 ? "port" : "starboard"}`,
      assembly: HULL,
      build_layer: 1,
      geometry: { type: "kit", kit: "carrierHullBilgeKeel", params: { side } },
      material: "cv_hull_dark",
      mate: A([0, 0, 0]),
    });
  }
  // 海水门/坞座：外板上的实体箱体 + 格栅 + 圆形坞座。
  const chestZ = [6, -2, -10];
  const plugZ = [-15, -9, -3, 3, 9, 15];
  for (const side of [-1, 1] as const) {
    for (let ci = 0; ci < chestZ.length; ci++) {
      const z = chestZ[ci]!;
      // 水线附近船壳是椭圆舭部，半宽远小于船底最大半宽——按真实表面贴装。
      const surface = hullSurfaceHalfAt(z, 1.3);
      add({
        id: `carrier.hull.detail_sea_chest_${side === -1 ? "l" : "r"}_${ci + 1}`,
        name_cn: `海水门 ${z}`,
        name_en: `sea chest ${z}`,
        assembly: HULL,
        build_layer: 1,
        geometry: M(B(0.3, 0.24, 0.4, [0, 0, 0], 0.006)),
        material: "cv_steel_dark",
        mate: A([side * (surface + 0.11), 1.3, z]),
      });
      for (let g = 0; g < 4; g++) {
        add({
          id: `carrier.hull.detail_sea_chest_${side === -1 ? "l" : "r"}_${ci + 1}_grille_${g + 1}`,
          name_cn: `海水门格栅 ${z}-${g + 1}`,
          name_en: `sea chest grille ${z}-${g + 1}`,
          assembly: HULL,
          build_layer: 1,
          geometry: M(B(0.02, 0.18, 0.045, [0, 0, 0], 0.002)),
          material: "cv_steel",
          mate: A([side * (surface + 0.27), 1.3, z - 0.15 + g * 0.1]),
        });
      }
    }
    for (let pi = 0; pi < plugZ.length; pi++) {
      const z = plugZ[pi]!;
      add({
        id: `carrier.hull.detail_docking_plug_${side === -1 ? "l" : "r"}_${pi + 1}`,
        name_cn: `坞座 ${z}`,
        name_en: `docking plug ${z}`,
        assembly: HULL,
        build_layer: 1,
        geometry: M(C(0.05, 0.26, [0, 0, 0], 14)),
        material: "cv_steel",
        mate: A([side * (hullSurfaceHalfAt(z, 0.62) - 0.11), 0.62, z], [0, 0, 90]),
      });
    }
  }

  // ---------------- L1 动力：第二组燃料组件 / 管系阀件 / 轴承 / 机柜 ----------------
  const extraAssemblies = [
    [-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6],
    [-0.6, 0], [0.6, 0], [0, -0.6], [0, 0.6],
  ] as const;
  extraAssemblies.forEach(([ax, az], ai) => {
    const x = ax;
    const z = -11 + az;
    const tag = pad(ai + 9);
    add({
      id: `carrier.power.detail_fuel_assembly_${tag}_bottom`,
      name_cn: `燃料组件 ${tag} 下管座`,
      name_en: `fuel assembly ${tag} bottom nozzle`,
      assembly: POWER,
      build_layer: 1,
      geometry: M(B(0.18, 0.05, 0.18, [0, 0, 0], 0.004)),
      material: "cv_steel",
      mate: A([x, 1.45, z]),
    });
    add({
      id: `carrier.power.detail_fuel_assembly_${tag}_top`,
      name_cn: `燃料组件 ${tag} 上管座`,
      name_en: `fuel assembly ${tag} top nozzle`,
      assembly: POWER,
      build_layer: 1,
      geometry: M(B(0.18, 0.05, 0.18, [0, 0, 0], 0.004)),
      material: "cv_steel",
      mate: A([x, 2.1, z]),
    });
    for (let g = 0; g < 2; g++) {
      add({
        id: `carrier.power.detail_fuel_assembly_${tag}_grid_${g + 1}`,
        name_cn: `燃料组件 ${tag} 格架 ${g + 1}`,
        name_en: `fuel assembly ${tag} grid ${g + 1}`,
        assembly: POWER,
        build_layer: 1,
        geometry: M(B(0.17, 0.03, 0.17, [0, 0, 0], 0.003)),
        material: "cv_steel_dark",
        mate: A([x, 1.63 + g * 0.22, z]),
      });
    }
    for (let r = 0; r < 4; r++) {
      add({
        id: `carrier.power.detail_fuel_rod_${tag}_${r + 1}`,
        name_cn: `燃料棒 ${tag}-${r + 1}`,
        name_en: `fuel rod ${tag}-${r + 1}`,
        assembly: POWER,
        build_layer: 1,
        geometry: M(C(0.012, 0.7, [0, 0, 0], 8)),
        material: "cv_steel",
        mate: A([x + (r % 2 === 0 ? -0.035 : 0.035), 1.88, z + (r < 2 ? -0.035 : 0.035)]),
      });
    }
    for (let c = 0; c < 3; c++) {
      add({
        id: `carrier.power.detail_crdm_latch_${tag}_${c + 1}`,
        name_cn: `CRDM 抓钩组件 ${tag}-${c + 1}`,
        name_en: `CRDM latch ${tag}-${c + 1}`,
        assembly: POWER,
        build_layer: 1,
        geometry: M(B(0.06, 0.05, 0.06, [0, 0, 0], 0.003), C(0.02, 0.08, [0, -0.05, 0], 8)),
        material: "cv_steel",
        mate: A([x + (c - 1) * 0.025, 3.35, z]),
      });
    }
  });
  // 一回路/二回路的支管与阀门。
  for (let p = 0; p < 30; p++) {
    const side = p % 2 === 0 ? -1 : 1;
    const z = -12.8 + (p % 10) * 0.35;
    const y = 0.9 + (p % 4) * 0.3;
    add({
      id: `carrier.power.detail_pipe_${pad(p + 1)}`,
      name_cn: `动力管系 ${p + 1}`,
      name_en: `propulsion pipe ${p + 1}`,
      assembly: POWER,
      build_layer: 1,
      geometry: { type: "weld", from: [side * 1.7, y, z], to: [side * 1.1, y + 0.25, z + 0.55], radius: 0.03, seed: p + 5 },
      material: "cv_copper",
      mate: A([0, 0, 0]),
    });
    add({
      id: `carrier.power.detail_valve_${pad(p + 1)}`,
      name_cn: `管系阀门 ${p + 1}`,
      name_en: `pipe valve ${p + 1}`,
      assembly: POWER,
      build_layer: 1,
      geometry: M(B(0.16, 0.14, 0.14, [0, 0, 0], 0.005), C(0.025, 0.12, [0, 0.1, 0], 8)),
      material: "cv_brass",
      mate: A([side * 1.4, y + 0.12, z + 0.25]),
    });
  }
  for (let s = 0; s < 20; s++) {
    add({
      id: `carrier.power.detail_sensor_${pad(s + 1)}`,
      name_cn: `动力传感器 ${s + 1}`,
      name_en: `propulsion sensor ${s + 1}`,
      assembly: POWER,
      build_layer: 1,
      geometry: M(C(0.035, 0.09, [0, 0, 0], 10), C(0.045, 0.02, [0, 0.05, 0], 10)),
      material: "cv_steel",
      mate: A([(s % 2 === 0 ? -1 : 1) * 1.9, 1.1 + (s % 5) * 0.16, -13.6 - Math.floor(s / 10) * 0.35]),
    });
  }
  for (let c = 0; c < 20; c++) {
    add({
      id: `carrier.power.detail_cabinet_${pad(c + 1)}`,
      name_cn: `动力配电柜 ${c + 1}`,
      name_en: `power cabinet ${c + 1}`,
      assembly: POWER,
      build_layer: 1,
      geometry: M(B(0.35, 0.75, 0.25, [0, 0, 0], 0.006), B(0.28, 0.12, 0.02, [0, 0.18, 0.14], 0.003)),
      material: "cv_steel_dark",
      mate: A([-3.15 + (c % 5) * 0.28, CV.LOWER_DECK_Y + 0.38, -15.4 + Math.floor(c / 5) * 0.35]),
    });
  }
  for (let b = 0; b < 8; b++) {
    add({
      id: `carrier.power.detail_shaft_bearing_${pad(b + 1)}`,
      name_cn: `轴系轴承 ${b + 1}`,
      name_en: `shaft bearing ${b + 1}`,
      assembly: POWER,
      build_layer: 1,
      geometry: M(T(0.16, 0.09, 0.16, [0, 0, 0], 16), B(0.25, 0.12, 0.25, [0, -0.12, 0], 0.006)),
      material: "cv_steel_dark",
      mate: A([(b % 2 === 0 ? -1 : 1) * 1.5, 1.0, -17.3 - Math.floor(b / 2) * 0.55], [90, 0, 0]),
    });
  }

  // ---------------- L2 机库：工装/门五金/机库停放机细节 ----------------
  for (let d = 0; d < 5; d++) {
    const node = `CV_HangarDoor_${d + 1}`;
    for (let h = 0; h < 3; h++) {
      add({
        id: `carrier.hangar.detail_door_hinge_${d + 1}_${h + 1}`,
        name_cn: `机库门铰链 ${d + 1}-${h + 1}`,
        name_en: `hangar door hinge ${d + 1}-${h + 1}`,
        assembly: HANGAR,
        build_layer: 2,
        geometry: M(C(0.045, 0.14, [0, 0, 0], 10)),
        material: "cv_steel",
        node,
        mate: A([0.05, 0.2 + h * 0.3, 0.03], [90, 0, 0]),
      });
    }
  }
  for (let p = 0; p < 20; p++) {
    add({
      id: `carrier.hangar.detail_padeye_${pad(p + 1)}`,
      name_cn: `机库系留环 ${p + 1}`,
      name_en: `hangar pad eye ${p + 1}`,
      assembly: HANGAR,
      build_layer: 2,
      geometry: M(T(0.07, 0.04, 0.025, [0, 0, 0], 12)),
      material: "cv_steel",
      mate: A([-3.1 + (p % 8) * 0.86, CV.HANGAR_Y + 0.15, -2.5 + Math.floor(p / 8) * 2.2]),
    });
  }
  // 机库工具车：不再用方块+圆柱拼装（红线：禁止积木堆积）；留待真实网格资产。
  for (let e = 0; e < 6; e++) {
    add({
      id: `carrier.hangar.detail_ammo_door_${pad(e + 1)}`,
      name_cn: `弹药升降机层门 ${e + 1}`,
      name_en: `ammo elevator door ${e + 1}`,
      assembly: HANGAR,
      build_layer: 2,
      geometry: M(B(0.7, 0.9, 0.06, [0, 0, 0], 0.006)),
      material: "cv_steel_dark",
      mate: A([-2.85 + (e % 2) * 1.3, CV.HANGAR_Y + 0.55, -6.7 + Math.floor(e / 2) * 0.3]),
    });
  }
  // 机库停放机的蒙皮板随真实机身一起取消程序化贴片；保留实体机身/翼/起落架。
  for (let l = 0; l < 12; l++) {
    add({
      id: `carrier.hangar.detail_light_${pad(l + 1)}`,
      name_cn: `机库顶灯 ${l + 1}`,
      name_en: `hangar light ${l + 1}`,
      assembly: HANGAR,
      build_layer: 2,
      geometry: M(B(0.5, 0.08, 0.14, [0, 0, 0], 0.004), C(0.03, 0.2, [0, 0.1, 0], 8)),
      material: "cv_glow",
      mate: A([-2.7 + (l % 4) * 1.8, CV.DECK_Y - 0.19, -2.0 + Math.floor(l / 4) * 3.0]),
    });
  }

  // ---------------- L3 甲板：弹射器绕组/安装座/甲板附件 ----------------
  for (let track = 0; track < 3; track++) {
    const data = [
      { x: -1.7, z0: CV.CAT_Z0, z1: CV.CAT_Z1 },
      { x: 1.7, z0: CV.CAT_Z0, z1: CV.CAT_Z1 },
      { x: -3.15, z0: -1.0, z1: 9.0 },
    ][track]!;
    const seg = (data.z1 - data.z0) / CV.CAT_SEGMENTS;
    for (let s = 0; s < CV.CAT_SEGMENTS; s++) {
      const z = data.z0 + seg * (s + 0.5);
      add({
        id: `carrier.deck.detail_cat_${track + 1}_winding_${pad(s + 1)}`,
        name_cn: `弹射器 ${track + 1} 绕组 ${s + 1}`,
        name_en: `catapult ${track + 1} winding ${s + 1}`,
        assembly: DECK,
        build_layer: 3,
        geometry: M(C(0.05, seg * 0.72, [0, 0, 0], 10)),
        material: "cv_steel_dark",
        mate: A([data.x + 0.42, DECK_TOP + 0.05, z], [90, 0, 0]),
      });
      add({
        id: `carrier.deck.detail_cat_${track + 1}_mount_${pad(s + 1)}`,
        name_cn: `弹射器 ${track + 1} 定子安装座 ${s + 1}`,
        name_en: `catapult ${track + 1} mount ${s + 1}`,
        assembly: DECK,
        build_layer: 3,
        geometry: M(B(0.56, 0.07, 0.18, [0, 0, 0], 0.004)),
        material: "cv_steel",
        mate: A([data.x, DECK_TOP - 0.03, z]),
      });
    }
  }
  for (let v = 0; v < 20; v++) {
    const side = v % 2 === 0 ? -1 : 1;
    add({
      id: `carrier.deck.detail_arrestor_pipe_${pad(v + 1)}`,
      name_cn: `拦阻机液压管 ${v + 1}`,
      name_en: `arrestor pipe ${v + 1}`,
      assembly: DECK,
      build_layer: 3,
      geometry: M(C(0.03, 0.7, [0, 0, 0], 8)),
      material: "cv_copper",
      mate: A([side * 1.65, CV.DECK_Y - 0.25, -10.25 + (v % 10) * 0.05], [0, 0, 90]),
    });
  }
  for (let b = 0; b < 16; b++) {
    add({
      id: `carrier.deck.detail_wire_bracket_${pad(b + 1)}`,
      name_cn: `拦阻索滑轮座 ${b + 1}`,
      name_en: `wire sheave bracket ${b + 1}`,
      assembly: DECK,
      build_layer: 3,
      geometry: M(B(0.3, 0.18, 0.26, [0, 0, 0], 0.006)),
      material: "cv_steel_dark",
      mate: A([(b % 2 === 0 ? -1 : 1) * (CV.WIRE_HALF + 0.35), DECK_TOP + 0.1, CV.WIRE_Z[Math.floor(b / 4)]!]),
    });
  }
  for (let p = 0; p < 30; p++) {
    add({
      id: `carrier.deck.detail_padeye_${pad(p + 1)}`,
      name_cn: `甲板系留环 ${p + 1}`,
      name_en: `deck pad eye ${p + 1}`,
      assembly: DECK,
      build_layer: 4,
      geometry: M(T(0.07, 0.04, 0.02, [0, 0, 0], 12)),
      material: "cv_steel",
      mate: A([-3.8 + (p % 10) * 0.84, DECK_TOP + 0.02, -14.5 + Math.floor(p / 10) * 4.5]),
    });
  }
  for (let m = 0; m < 20; m++) {
    add({
      id: `carrier.deck.detail_marking_${pad(m + 1)}`,
      name_cn: `甲板警示标线 ${m + 1}`,
      name_en: `deck warning marking ${m + 1}`,
      assembly: DECK,
      build_layer: 4,
      geometry: M(B(0.6, 0.005, 0.08, [0, 0, 0], 0.002)),
      material: m % 4 === 0 ? "cv_deck_red" : "cv_deck_yellow",
      mate: A([-3.6 + (m % 6) * 1.44, DECK_TOP + 0.008, 1.0 + Math.floor(m / 6) * 2.3]),
    });
  }
  // ---------------- L4 舰岛：雷达柜 / 近防附件 / 桅杆 ----------------
  // 一层 CIC 与二层航海舰桥均由 cic.ts / bridge.ts 建真实舱室，不再放占位方盒。
  for (let t = 0; t < 2; t++) {
    const base = CIWS_LOCAL(t);
    for (let k = 0; k < 15; k++) {
      const tu = `CV_Ciws_${t + 1}`;
      add({
        id: `carrier.island.detail_ciws_${t + 1}_${pad(k + 1)}`,
        name_cn: `1130 近防炮 ${t + 1} 附件 ${k + 1}`,
        name_en: `CIWS ${t + 1} detail ${k + 1}`,
        assembly: ISLAND,
        build_layer: 4,
        geometry: M(B(0.08, 0.05, 0.16, [0, 0, 0], 0.003), C(0.025, 0.12, [0, 0, 0], 8)),
        material: "cv_steel",
        node: tu,
        mate: A([-0.2 + (k % 5) * 0.1, 0.15 + Math.floor(k / 5) * 0.1, 0.25], [0, 0, 0]),
      });
    }
    void base;
  }
  for (let s = 0; s < 2; s++) {
    for (let k = 0; k < 8; k++) {
      add({
        id: `carrier.island.detail_sam_${s + 1}_${k + 1}`,
        name_cn: `防空导弹 ${s + 1}-${k + 1} 导引头`,
        name_en: `SAM seeker ${s + 1}-${k + 1}`,
        assembly: ISLAND,
        build_layer: 4,
        geometry: M(C(0.03, 0.12, [0, 0, 0], 10), C(0.05, 0.03, [0, 0.06, 0], 10)),
        material: "cv_radar",
        mate: A([CV.ISLAND_X + (s === 0 ? -1 : 1) * 0.75 + ((k % 4) - 1.5) * 0.23, CV.DECK_Y + CV.DECK_T + 0.38, CV.ISLAND_Z - 5.2 + (Math.floor(k / 4) - 0.5) * 0.22]),
      });
    }
  }
  for (let m = 0; m < 20; m++) {
    add({
      id: `carrier.island.detail_mast_${pad(m + 1)}`,
      name_cn: `桅杆设备 ${m + 1}`,
      name_en: `mast equipment ${m + 1}`,
      assembly: ISLAND,
      build_layer: 4,
      geometry: M(B(0.1, 0.1, 0.1, [0, 0, 0], 0.004), C(0.02, 0.2, [0, 0.12, 0], 8)),
      material: "cv_steel",
      mate: A([CV.ISLAND_X - 0.28 + (m % 5) * 0.14, CV.DECK_Y + CV.DECK_T + 4.2 + Math.floor(m / 10) * 0.57, CV.ISLAND_Z - 0.62 + Math.floor((m % 10) / 5) * 0.44]),
    });
  }
  for (let d = 0; d < 10; d++) {
    add({
      id: `carrier.island.detail_hatch_${pad(d + 1)}`,
      name_cn: `舰岛水密门 ${d + 1}`,
      name_en: `island door ${d + 1}`,
      assembly: ISLAND,
      build_layer: 4,
      geometry: M(B(0.5, 0.8, 0.05, [0, 0, 0], 0.006)),
      material: "cv_hull_dark",
      mate: A([CV.ISLAND_X + 0.83, CV.DECK_Y + CV.DECK_T + 0.85 + (d % 2) * 0.78, CV.ISLAND_Z - 1.2 + Math.floor(d / 2) * 0.9], [0, 90, 0]),
    });
  }
  for (let e = 0; e < 10; e++) {
    add({
      id: `carrier.island.detail_funnel_${pad(e + 1)}`,
      name_cn: `烟囱排气口 ${e + 1}`,
      name_en: `funnel exhaust ${e + 1}`,
      assembly: ISLAND,
      build_layer: 4,
      geometry: M(C(0.08, 0.15, [0, 0, 0], 10)),
      material: "cv_steel_dark",
      mate: A([CV.ISLAND_X + 0.35 + (e % 2) * 0.12, CV.DECK_Y + CV.DECK_T + 3.55 + Math.floor(e / 4) * 0.12, CV.ISLAND_Z - 2.45]),
    });
  }

  // ---------------- L5 舰载机：蒙皮/翼肋/发动机叶片/挂架 ----------------
  const AIRCRAFT_NODE = "CV_Aircraft";
  const WING_L = "CV_AircraftWingL";
  const WING_R = "CV_AircraftWingR";
  for (let s = 0; s < 20; s++) {
    add({
      id: `carrier.aircraft.detail_skin_${pad(s + 1)}`,
      name_cn: `舰载机蒙皮 ${s + 1}`,
      name_en: `aircraft skin ${s + 1}`,
      assembly: AIRCRAFT,
      build_layer: 5,
      geometry: M(B(0.16 + (s % 3) * 0.03, 0.02, 0.32 + (s % 4) * 0.06, [0, 0, 0], 0.003)),
      material: s % 3 === 0 ? "cv_aircraft_dark" : "cv_aircraft",
      node: AIRCRAFT_NODE,
      mate: A([(s % 2 === 0 ? -1 : 1) * 0.16, 0.52 - Math.floor(s / 6) * 0.06, 0.62 - (s % 10) * 0.16]),
    });
  }
  for (let r = 0; r < 16; r++) {
    const side = r % 2 === 0 ? -1 : 1;
    add({
      id: `carrier.aircraft.detail_rib_${pad(r + 1)}`,
      name_cn: `机翼翼肋 ${r + 1}`,
      name_en: `wing rib ${r + 1}`,
      assembly: AIRCRAFT,
      build_layer: 5,
      geometry: M(B(0.08, 0.02, 0.28, [0, 0, 0], 0.002)),
      material: "cv_aircraft_dark",
      node: side === -1 ? WING_L : WING_R,
      mate: A([side * (0.36 + (r % 3) * 0.05), -0.005, -0.12 + Math.floor(r / 2) * 0.06]),
    });
  }
  for (let b = 0; b < 16; b++) {
    add({
      id: `carrier.aircraft.detail_engine_blade_${pad(b + 1)}`,
      name_cn: `发动机叶片 ${b + 1}`,
      name_en: `engine blade ${b + 1}`,
      assembly: AIRCRAFT,
      build_layer: 5,
      geometry: M(B(0.025, 0.11, 0.02, [0, 0, 0], 0.002)),
      material: "cv_steel",
      node: AIRCRAFT_NODE,
      mate: A([(b % 2 === 0 ? -1 : 1) * 0.3, 0.38, 0.0 + Math.floor(b / 2) * 0.03], [0, 0, (b % 8) * 45]),
    });
  }
  for (let g = 0; g < 10; g++) {
    add({
      id: `carrier.aircraft.detail_gear_${pad(g + 1)}`,
      name_cn: `起落架附件 ${g + 1}`,
      name_en: `landing gear detail ${g + 1}`,
      assembly: AIRCRAFT,
      build_layer: 5,
      geometry: M(C(0.018, 0.18, [0, 0, 0], 8), B(0.05, 0.04, 0.08, [0, 0, 0], 0.003)),
      material: "cv_steel",
      node: AIRCRAFT_NODE,
      mate: A([(g % 2 === 0 ? -1 : 1) * 0.3, 0.3, -0.28 + (g % 5) * 0.2]),
    });
  }
  for (let w = 0; w < 12; w++) {
    const side = w % 2 === 0 ? -1 : 1;
    add({
      id: `carrier.aircraft.detail_weapon_${pad(w + 1)}`,
      name_cn: `机载武器附件 ${w + 1}`,
      name_en: `aircraft weapon detail ${w + 1}`,
      assembly: AIRCRAFT,
      build_layer: 5,
      geometry: M(C(0.02, 0.14, [0, 0, 0], 8), B(0.08, 0.02, 0.1, [0, 0, 0], 0.002)),
      material: "cv_steel_dark",
      node: side === -1 ? WING_L : WING_R,
      mate: A([side * (0.38 + (w % 3) * 0.05), -0.0925, -0.15 + (w % 4) * 0.08]),
    });
  }

  // ---------------- L5 表面：甲板附件 ----------------
  // 栏杆底座由 surface.ts 的整段栏杆立柱承担；旧固定 x=±4.66 的散座在艏艉会悬出甲板，整组移除。
  // 救生筏架原在右舷、筏罐却在左舷，属悬空占位件；整组移除，保留左舷真实筏罐。
  // 甲板工具箱组会与后移的 3 号弹射器挡焰板干涉，按“宁缺毋滥”整组移除。
}

function CIWS_LOCAL(index: number): [number, number, number] {
  const baseY = CV.DECK_Y + CV.DECK_T;
  return index === 0
    ? [CV.ISLAND_X - 0.6, baseY + 3.72, CV.ISLAND_Z + 2.6]
    : [CV.ISLAND_X - 0.6, baseY + 3.72, CV.ISLAND_Z - 2.6];
}
