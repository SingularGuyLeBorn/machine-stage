import * as THREE from "three";
import { CV } from "./constants";
import { A, B, C, M, S, T, pad, type CarrierCtx } from "./common";
import { addBridgeInterior } from "./bridge";
import { addCicInterior } from "./cic";

// ============================================================================
// L4 舰岛 + 相控阵 + 旋转雷达 + 1130 近防炮 + 近程防空/干扰弹
// 舰岛位于右舷，三层舰桥（航海/航空/司令），四面固定相控阵不转。
// ============================================================================

const ASSEMBLY = "island";
const P = "carrier.island.";
export const RADAR_NODE = "CV_RotatingRadar";
export const CIWS_NODES = ["CV_Ciws_1", "CV_Ciws_2"] as const;

export function addIsland(ctx: CarrierCtx): void {
  const add = (part: Parameters<CarrierCtx["add"]>[0]) => ctx.add(part);
  const baseY = CV.DECK_Y + CV.DECK_T;
  const x = CV.ISLAND_X;
  const z = CV.ISLAND_Z;

  // 舰岛主体：4 层甲板 + 内倾围壁。
  add({
    id: `${P}base`,
    name_cn: "舰岛基座",
    name_en: "island base",
    assembly: ASSEMBLY,
    build_layer: 4,
    geometry: M(B(1.8, 0.35, 6.3, [0, 0, 0], 0.012), B(1.7, 0.12, 6.1, [0, 0.2, 0], 0.006)),
    material: "cv_hull_dark",
    mate: A([x, baseY + 0.18, z]),
  });
  for (let level = 0; level < 2; level++) {
    const y = baseY + 0.45 + level * 0.78;
    const width = level < 2 ? 1.62 - level * 0.1 : 1.28 - (level - 2) * 0.16;
    const len = level < 2 ? 5.9 - level * 0.2 : 4.9 - (level - 2) * 0.5;
    add({
      id: `${P}bridge_${level + 1}_floor`,
      name_cn: `舰岛 ${level + 1} 层甲板`,
      name_en: `island deck ${level + 1}`,
      assembly: ASSEMBLY,
      build_layer: 4,
      geometry: M(B(width + 0.12, 0.06, len + 0.12, [0, 0, 0], 0.006)),
      material: "cv_steel_dark",
      mate: A([x, y, z]),
    });
    // 二层为可进入的航海舰桥：由 bridge.ts 建带真实开口的围壁和全套驾驶室设备。
    if (level !== 1) {
    for (const side of [-1, 1] as const) {
      add({
        id: `${P}bridge_${level + 1}_wall_${side === -1 ? "p" : "s"}`,
        name_cn: `舰岛 ${level + 1} 层${side === -1 ? "左" : "右"}围壁`,
        name_en: `island level ${level + 1} ${side === -1 ? "port" : "starboard"} wall`,
        assembly: ASSEMBLY,
        build_layer: 4,
        geometry: M(B(0.06, 0.72, len, [0, 0, 0], 0.004), B(0.035, 0.32, len * 0.8, [-side * 0.03, 0.06, 0], 0.002)),
        material: "cv_hull",
        mate: A([x + side * width / 2, y + 0.38, z], [0, 0, side * 2]),
      });
      // 玻璃窗：下两层保留真实舷窗，上层用窄玻璃带 + 折角面。
      if (level < 2) for (let w = 0; w < 5; w++) {
        add({
          id: `${P}bridge_${level + 1}_window_${side === -1 ? "p" : "s"}_${w + 1}`,
          name_cn: `舰岛 ${level + 1} 层舷窗 ${side === -1 ? "左" : "右"} ${w + 1}`,
          name_en: `island window ${level + 1}-${w + 1}`,
          assembly: ASSEMBLY,
          build_layer: 4,
          geometry: M(B(0.025, 0.3, 0.62, [0, 0, 0], 0.003)),
          material: "cv_glass",
          mate: A([x + side * (width / 2 + 0.035), y + 0.45, z - 1.9 + w * 0.95], [0, side * 0, 0]),
        });
      }
    }
    add({
      id: `${P}bridge_${level + 1}_front_wall`,
      name_cn: `舰岛 ${level + 1} 层前壁`,
      name_en: `island level ${level + 1} front wall`,
      assembly: ASSEMBLY,
      build_layer: 4,
      geometry: M(B(width, 0.72, 0.06, [0, 0, 0], 0.004)),
      material: "cv_hull",
      mate: A([x, y + 0.38, z + len / 2]),
    });
    add({
      id: `${P}bridge_${level + 1}_rear_wall`,
      name_cn: `舰岛 ${level + 1} 层后壁`,
      name_en: `island level ${level + 1} rear wall`,
      assembly: ASSEMBLY,
      build_layer: 4,
      geometry: M(B(width, 0.72, 0.06, [0, 0, 0], 0.004)),
      material: "cv_hull",
      mate: A([x, y + 0.38, z - len / 2]),
    });
    // 前向环绕窗带：下两层；上层改成一条窄玻璃带。
    if (level < 2) for (let w = 0; w < 4; w++) {
      add({
        id: `${P}bridge_${level + 1}_front_window_${w + 1}`,
        name_cn: `舰岛 ${level + 1} 层前窗 ${w + 1}`,
        name_en: `island front window ${level + 1}-${w + 1}`,
        assembly: ASSEMBLY,
        build_layer: 4,
        geometry: M(B(0.3, 0.3, 0.03, [0, 0, 0], 0.004)),
        material: "cv_glass",
        mate: A([x - 0.54 + w * 0.36, y + 0.45, z + len / 2 + 0.045]),
      });
    }
    if (level < 2) for (let m = 0; m < 3; m++) {
      add({
        id: `${P}bridge_${level + 1}_front_mullion_${m + 1}`,
        name_cn: `舰岛 ${level + 1} 层前窗竖梃 ${m + 1}`,
        name_en: `island front mullion ${level + 1}-${m + 1}`,
        assembly: ASSEMBLY,
        build_layer: 4,
        geometry: M(B(0.04, 0.34, 0.06, [0, 0, 0], 0.003)),
        material: "cv_steel_dark",
        mate: A([x - 0.36 + m * 0.36, y + 0.45, z + len / 2 + 0.05]),
      });
    }
    if (level < 2) for (const [tag, yy] of [["sill", 0.28], ["header", 0.62]] as const) {
      add({
        id: `${P}bridge_${level + 1}_front_${tag}`,
        name_cn: `舰岛 ${level + 1} 层前窗${tag === "sill" ? "窗台" : "窗楣"}`,
        name_en: `island front ${tag} ${level + 1}`,
        assembly: ASSEMBLY,
        build_layer: 4,
        geometry: M(B(width * 0.9, 0.03, 0.06, [0, 0, 0], 0.003)),
        material: "cv_steel_dark",
        mate: A([x, y + yy, z + len / 2 + 0.05]),
      });
    }
    for (const side of [-1, 1] as const) {
      const wx = x + side * (width / 2 + 0.05);
      if (level < 2) for (let m = 0; m < 4; m++) {
        add({
          id: `${P}bridge_${level + 1}_side_mullion_${side === -1 ? "p" : "s"}_${m + 1}`,
          name_cn: `舰岛 ${level + 1} 层舷窗竖梃 ${m + 1}`,
          name_en: `island side mullion ${level + 1}-${m + 1}`,
          assembly: ASSEMBLY,
          build_layer: 4,
          geometry: M(B(0.05, 0.34, 0.05, [0, 0, 0], 0.003)),
          material: "cv_steel_dark",
          mate: A([wx, y + 0.45, z - 1.9 + m * 0.95 + 0.475]),
        });
      }
      if (level < 2) for (const [tag, yy] of [["sill", 0.28], ["header", 0.62]] as const) {
        add({
          id: `${P}bridge_${level + 1}_side_${tag}_${side === -1 ? "p" : "s"}`,
          name_cn: `舰岛 ${level + 1} 层舷窗${tag === "sill" ? "窗台" : "窗楣"}`,
          name_en: `island side ${tag} ${level + 1}`,
          assembly: ASSEMBLY,
          build_layer: 4,
          geometry: M(B(0.05, 0.03, 4.9, [0, 0, 0], 0.003)),
          material: "cv_steel_dark",
          mate: A([wx, y + yy, z]),
        });
      }
    }
    // 一层战斗情报中心由 cic.ts 建全套显控；二层航海舰桥由 bridge.ts 建。
    if (level !== 0) {
    for (let c = 0; c < 3; c++) {
      add({
        id: `${P}bridge_${level + 1}_console_${c + 1}`,
        name_cn: `舰岛 ${level + 1} 层控制台 ${c + 1}`,
        name_en: `island console ${level + 1}-${c + 1}`,
        assembly: ASSEMBLY,
        build_layer: 4,
        geometry: M(B(0.48, 0.34, 0.22, [0, 0, 0], 0.006), B(0.36, 0.18, 0.02, [0, 0.18, 0.1], 0.003)),
        material: "cv_steel_dark",
        mate: A([x - 0.45 + c * 0.45, y + 0.17, z + 1.5]),
      });
    }
    }
    }
    if (level >= 2) {
      add({
        id: `${P}bridge_${level + 1}_vision_band`,
        name_cn: `舰岛 ${level + 1} 层窄玻璃带`,
        name_en: `island level ${level + 1} vision band`,
        assembly: ASSEMBLY,
        build_layer: 4,
        geometry: M(B(width * 0.74, 0.1, 0.03, [0, 0, 0], 0.004)),
        material: "cv_glass",
        mate: A([x, y + 0.47, z + len / 2 + 0.035]),
      });
      for (const side of [-1, 1] as const) {
        add({
          id: `${P}bridge_${level + 1}_cheek_${side === -1 ? "p" : "s"}`,
          name_cn: `舰岛 ${level + 1} 层折角面 ${side === -1 ? "左" : "右"}`,
          name_en: `island level ${level + 1} chamfer ${side === -1 ? "p" : "s"}`,
          assembly: ASSEMBLY,
          build_layer: 4,
          geometry: M(B(0.34, 0.74, 0.05, [0, 0, 0], 0.004)),
          material: "cv_hull_dark",
          mate: A([x + side * (width / 2 - 0.03), y + 0.38, z + len / 2 - 0.03], [0, side * 45, 0]),
        });
      }
    }
    if (level === 0) {
      for (const side of [-1, 1] as const) {
        add({
          id: `${P}bridge_1_cheek_${side === -1 ? "p" : "s"}`,
          name_cn: `舰岛基座折角面 ${side === -1 ? "左" : "右"}`,
          name_en: `island base chamfer ${side === -1 ? "p" : "s"}`,
          assembly: ASSEMBLY,
          build_layer: 4,
          geometry: M(B(0.4, 0.74, 0.05, [0, 0, 0], 0.004)),
          material: "cv_hull_dark",
          mate: A([x + side * (width / 2 - 0.02), y + 0.38, z + len / 2 - 0.02], [0, side * 45, 0]),
        });
      }
    }
    add({
      id: `${P}bridge_${level + 1}_roof`,
      name_cn: `舰岛 ${level + 1} 层顶板`,
      name_en: `island level ${level + 1} roof`,
      assembly: ASSEMBLY,
      build_layer: 4,
      geometry: M(B(width + 0.15, 0.05, len + 0.15, [0, 0, 0], 0.006)),
      material: "cv_hull_dark",
      mate: A([x, y + 0.74, z]),
    });
  }

  // 一体化隐身塔：只有两层舱室（CIC/舰桥）+ 折角内倾塔体，不再叠四层方盒办公楼。
  add({
    id: `${P}faceted_tower`,
    name_cn: "舰岛一体化隐身塔",
    name_en: "island faceted stealth tower",
    assembly: ASSEMBLY,
    build_layer: 4,
    geometry: { type: "kit", kit: "carrierIslandTower" },
    material: "cv_hull_dark",
    mate: A([x, baseY + 1.97, z]),
  });
  add({
    id: `${P}tower_vision_band`,
    name_cn: "塔体前向窄玻璃带",
    name_en: "tower vision band",
    assembly: ASSEMBLY,
    build_layer: 4,
    geometry: M(B(0.86, 0.07, 0.025, [0, 0, 0], 0.003)),
    material: "cv_glass",
    mate: A([x, baseY + 2.72, z + 2.02]),
  });
  for (const side of [-1, 1] as const) {
    add({
      id: `${P}tower_side_slit_${side === -1 ? "p" : "s"}`,
      name_cn: `塔体侧向观察窗 ${side === -1 ? "左" : "右"}`,
      name_en: `tower side slit ${side === -1 ? "p" : "s"}`,
      assembly: ASSEMBLY,
      build_layer: 4,
      geometry: M(B(0.025, 0.06, 1.5, [0, 0, 0], 0.003)),
      material: "cv_glass",
      mate: A([x + side * 0.65, baseY + 2.72, z]),
    });
  }

  addCicInterior(ctx);
  addBridgeInterior(ctx);

  // 右舷航行舰桥翼台：外伸格栅平台 + 斜撑 + 双层栏杆（真实可站立结构）。
  {
    const halfW = (1.62 - 0.1) / 2;
    const wingY = baseY + 0.45 + 0.78 + 0.03;
    const wingZ = z + 0.4;
    const wx = x + halfW + 0.28;
    add({
      id: `${P}bridge_wing_platform`,
      name_cn: "右舷舰桥翼台",
      name_en: "starboard bridge wing",
      assembly: ASSEMBLY,
      build_layer: 4,
      geometry: M(B(0.58, 0.06, 2.2, [0, 0, 0], 0.006)),
      material: "cv_grate",
      mate: A([wx, wingY, wingZ]),
    });
    for (const dz of [-0.8, 0.8] as const) {
      add({
        id: `${P}bridge_wing_brace_${dz < 0 ? "a" : "f"}`,
        name_cn: `舰桥翼台斜撑 ${dz < 0 ? "后" : "前"}`,
        name_en: `bridge wing brace ${dz < 0 ? "aft" : "fore"}`,
        assembly: ASSEMBLY,
        build_layer: 4,
        geometry: M(B(0.5, 0.08, 0.08, [0, 0, 0], 0.004)),
        material: "cv_steel",
        mate: A([x + halfW + 0.16, wingY - 0.18, wingZ + dz], [0, 0, 45]),
      });
    }
    for (const dz of [-0.95, -0.32, 0.32, 0.95] as const) {
      add({
        id: `${P}bridge_wing_post_${Math.round((dz + 1) * 10)}`,
        name_cn: "舰桥翼台栏杆立柱",
        name_en: "bridge wing rail post",
        assembly: ASSEMBLY,
        build_layer: 4,
        geometry: M(B(0.04, 0.2, 0.04, [0, 0, 0], 0.003), C(0.042, 0.03, [0, 0.1, 0], 10)),
        material: "cv_steel",
        mate: A([wx + 0.26, wingY + 0.1, wingZ + dz]),
      });
    }
    for (const [tag, yy] of [["top", 0.2], ["mid", 0.1]] as const) {
      add({
        id: `${P}bridge_wing_rail_${tag}`,
        name_cn: `舰桥翼台${tag === "top" ? "上" : "中"}栏杆`,
        name_en: `bridge wing ${tag} rail`,
        assembly: ASSEMBLY,
        build_layer: 4,
        geometry: M(C(tag === "top" ? 0.016 : 0.014, 2.2, [0, 0, 0], 8)),
        material: "cv_steel",
        mate: A([wx + 0.26, wingY + yy, wingZ], [90, 0, 0]),
      });
    }
    for (const dz of [-1.1, 1.1] as const) {
      add({
        id: `${P}bridge_wing_end_rail_${dz < 0 ? "a" : "f"}`,
        name_cn: "舰桥翼台端栏杆",
        name_en: "bridge wing end rail",
        assembly: ASSEMBLY,
        build_layer: 4,
        geometry: M(C(0.016, 0.58, [0, 0, 0], 8)),
        material: "cv_steel",
        mate: A([wx, wingY + 0.2, wingZ + dz], [0, 0, 90]),
      });
    }
  }

  // 四面固定相控阵：前面/后面/左右舷。
  const panels = [
    { key: "fwd", pos: [x, baseY + 2.32, z + 2.02] as const, rot: [0, 0, 0] as const, behind: [0, 0, -0.08] as const },
    { key: "aft", pos: [x, baseY + 2.32, z - 2.02] as const, rot: [0, Math.PI, 0] as const, behind: [0, 0, 0.08] as const },
    { key: "stbd", pos: [x + 0.64, baseY + 2.32, z] as const, rot: [0, Math.PI / 2, 0] as const, behind: [-0.08, 0, 0] as const },
    { key: "port", pos: [x - 0.64, baseY + 2.32, z] as const, rot: [0, -Math.PI / 2, 0] as const, behind: [0.08, 0, 0] as const },
  ];
  panels.forEach((panel, index) => {
    const tag = pad(index + 1);
    add({
      id: `${P}array_${tag}_panel`,
      name_cn: `${["前", "后", "右", "左"][index]}相控阵阵面`,
      name_en: `phased array panel ${tag}`,
      assembly: ASSEMBLY,
      build_layer: 4,
      geometry: { type: "kit", kit: "carrierRadarPanel", params: { w: 1.15, h: 0.86, d: 0.12 } },
      material: "cv_radar_dark",
      mate: A([...panel.pos], [...panel.rot]),
    });
    add({
      id: `${P}array_${tag}_tr`,
      name_cn: `${["前", "后", "右", "左"][index]}阵面 T/R 单元 ×64`,
      name_en: `phased array TR units ${tag}`,
      assembly: ASSEMBLY,
      build_layer: 4,
      geometry: { type: "kit", kit: "carrierTrTile", params: { s: 0.075, d: 0.035 } },
      material: "cv_aesa_tile",
      mate: A([...panel.pos], [...panel.rot]),
      instances: 64,
      indexed: true,
      instance_layout: `carrier.island.tr${index + 1}`,
      source: "8×8 T/R 单元阵列；固定阵面电子扫描，不转动。",
    });
    ctx.layout(`carrier.island.tr${index + 1}`, ({ index: i }) => {
      const col = i % 8;
      const row = Math.floor(i / 8);
      return new THREE.Matrix4().makeTranslation((col - 3.5) * 0.125, (row - 3.5) * 0.095, 0.075);
    });
    add({
      id: `${P}array_${tag}_recess`,
      name_cn: `${["前", "后", "右", "左"][index]}相控阵嵌入框`,
      name_en: `phased array recess ${tag}`,
      assembly: ASSEMBLY,
      build_layer: 4,
      geometry: M(B(1.3, 0.98, 0.05, [0, 0, 0], 0.006)),
      material: "cv_hull_dark",
      mate: A([panel.pos[0] + panel.behind[0] * 0.35, panel.pos[1], panel.pos[2] + panel.behind[2] * 0.35], [...panel.rot]),
    });
    add({
      id: `${P}array_${tag}_hood`,
      name_cn: `${["前", "后", "右", "左"][index]}相控阵遮檐`,
      name_en: `phased array hood ${tag}`,
      assembly: ASSEMBLY,
      build_layer: 4,
      geometry: M(B(1.28, 0.07, 0.16, [0, 0, 0], 0.004)),
      material: "cv_hull_dark",
      mate: A([panel.pos[0], panel.pos[1] + 0.49, panel.pos[2]]),
    });
    add({
      id: `${P}array_${tag}_sill`,
      name_cn: `${["前", "后", "右", "左"][index]}相控阵下檐`,
      name_en: `phased array sill ${tag}`,
      assembly: ASSEMBLY,
      build_layer: 4,
      geometry: M(B(1.28, 0.06, 0.12, [0, 0, 0], 0.004)),
      material: "cv_hull_dark",
      mate: A([panel.pos[0], panel.pos[1] - 0.49, panel.pos[2]]),
    });
    add({
      id: `${P}array_${tag}_cooling`,
      name_cn: `${["前", "后", "右", "左"][index]}阵面水冷板`,
      name_en: `phased array cooling ${tag}`,
      assembly: ASSEMBLY,
      build_layer: 4,
      geometry: M(B(1.05, 0.76, 0.04, [0, 0, 0], 0.004)),
      material: "cv_copper",
      mate: A(
        [panel.pos[0] + panel.behind[0], panel.pos[1] + panel.behind[1], panel.pos[2] + panel.behind[2]],
        [...panel.rot],
      ),
    });
  });

  // 旋转搜索雷达（桅杆顶部）。
  // 一体化隐身桅：内倾八面体 + 嵌入式电子战面板，不再是四腿脚手架。
  const mastX = x;
  const mastZ = z - 0.4;
  const mastBaseY = baseY + 3.0;
  const mastTopY = baseY + 5.0;
  add({
    id: `${P}mast`,
    name_cn: "一体化桅杆基座",
    name_en: "integrated mast foundation",
    assembly: ASSEMBLY,
    build_layer: 4,
    geometry: M(C(0.46, 0.34, [0, 0, 0], 8, 0.3), C(0.3, 0.6, [0, 0.42, 0], 8, 0.22)),
    material: "cv_hull_dark",
    mate: A([mastX, mastBaseY, mastZ]),
  });
  add({
    id: `${P}mast_shell`,
    name_cn: "一体化隐身桅杆",
    name_en: "integrated stealth mast",
    assembly: ASSEMBLY,
    build_layer: 4,
    geometry: M(C(0.44, 1.55, [0, 0.95, 0], 8, 0.15), C(0.16, 0.3, [0, 1.86, 0], 8, 0.08)),
    material: "cv_hull_dark",
    mate: A([mastX, mastBaseY, mastZ]),
  });
  add({
    id: `${P}mast_top_platform`,
    name_cn: "桅顶平台",
    name_en: "mast top platform",
    assembly: ASSEMBLY,
    build_layer: 4,
    geometry: M(C(0.34, 0.025, [0, 0, 0], 8, 0.3)),
    material: "cv_grate",
    mate: A([mastX, mastTopY - 0.02, mastZ]),
  });
  for (const [tag, dx, dz, rot] of [
    ["f", 0, -0.31, 0],
    ["a", 0, 0.31, Math.PI],
    ["p", -0.31, 0, Math.PI / 2],
    ["s", 0.31, 0, -Math.PI / 2],
  ] as const) {
    add({
      id: `${P}mast_ew_${tag}`,
      name_cn: `一体化桅杆电子战阵面 ${tag.toUpperCase()}`,
      name_en: `integrated mast EW panel ${tag}`,
      assembly: ASSEMBLY,
      build_layer: 4,
      geometry: M(B(0.42, 0.52, 0.035, [0, 0, 0], 0.006)),
      material: "cv_aesa",
      mate: A([mastX + dx, mastBaseY + 1.22, mastZ + dz], [0, rot, 0]),
    });
  }
  for (const [tag, dx, dz] of [
    ["f", -0.18, -0.18],
    ["a", 0.18, 0.18],
    ["p", -0.18, 0.18],
    ["s", 0.18, -0.18],
  ] as const) {
    add({
      id: `${P}mast_whip_${tag}`,
      name_cn: `一体化桅杆鞭状天线 ${tag.toUpperCase()}`,
      name_en: `integrated mast whip antenna ${tag}`,
      assembly: ASSEMBLY,
      build_layer: 4,
      geometry: M(C(0.012, 0.75 + (tag === "f" ? 0.2 : 0), [0, 0, 0], 8), C(0.035, 0.05, [0, -0.38, 0], 8)),
      material: "cv_steel",
      mate: A([mastX + dx, mastTopY - 0.3, mastZ + dz]),
    });
  }

  ctx.node({ name: RADAR_NODE, parent: "root", pivot: [x, baseY + 5.15, z - 0.4], motion: "rotate", axis: "y", note: "旋转搜索雷达（电子扫描相控阵固定）" });
  add({
    id: `${P}radar_pedestal`,
    name_cn: "旋转雷达基座",
    name_en: "rotating radar pedestal",
    assembly: ASSEMBLY,
    build_layer: 4,
    geometry: M(C(0.2, 0.25, [0, 0, 0], 18), C(0.14, 0.3, [0, 0.2, 0], 14)),
    material: "cv_steel_dark",
    node: RADAR_NODE,
    mate: A([0, 0, 0]),
  });
  add({
    id: `${P}radar_antenna`,
    name_cn: "旋转雷达天线",
    name_en: "rotating radar antenna",
    assembly: ASSEMBLY,
    build_layer: 4,
    geometry: M(B(2.4, 0.32, 0.12, [0, 0.55, 0], 0.008), B(2.3, 0.05, 0.18, [0, 0.72, 0], 0.004), B(0.1, 0.4, 0.1, [0, 0.25, 0], 0.004)),
    material: "cv_radar",
    node: RADAR_NODE,
    mate: A([0, 0, 0]),
  });
  add({
    id: `${P}satcom_dome`,
    name_cn: "卫通天线罩",
    name_en: "satcom radome",
    assembly: ASSEMBLY,
    build_layer: 4,
    geometry: M(S(0.24, [0, 0, 0], 24), C(0.28, 0.08, [0, -0.22, 0], 24)),
    material: "cv_radar",
    mate: A([x + 0.52, baseY + 3.55, z + 2.45]),
  });
  add({
    id: `${P}chimney`,
    name_cn: "烟囱（内倾/红外抑制）",
    name_en: "funnel",
    assembly: ASSEMBLY,
    build_layer: 4,
    geometry: M(B(0.66, 1.75, 0.78, [0, 0, 0], 0.02), B(0.48, 0.16, 0.58, [0, 0.92, 0], 0.012), B(0.6, 0.18, 0.7, [0, 0.3, 0], 0.008)),
    material: "cv_hull_dark",
    mate: A([x + 0.1, baseY + 2.55, z - 2.45], [-12, 0, 0]),
  });

  // 1130 近防炮 ×2：炮塔回转 + 俯仰 + 11 管转管。
  const ciwsSpots = [
    [x - 0.6, baseY + 3.72, z + 2.6],
    [x - 0.6, baseY + 3.72, z - 2.6],
  ] as const;
  ciwsSpots.forEach((spot, index) => {
    const tu = CIWS_NODES[index]!;
    const tag = pad(index + 1);
    const platformY = spot[1] - 0.22;
    add({
      id: `${P}ciws_${tag}_platform`,
      name_cn: `1130 近防炮 ${index + 1} 平台`,
      name_en: `CIWS ${index + 1} platform`,
      assembly: ASSEMBLY,
      build_layer: 4,
      geometry: M(B(0.95, 0.06, 1.0, [0, 0, 0], 0.006)),
      material: "cv_grate",
      mate: A([spot[0], platformY, spot[2]]),
    });
    for (const dz of [-0.65, 0.65] as const) {
      add({
        id: `${P}ciws_${tag}_brace_${dz < 0 ? "a" : "f"}`,
        name_cn: `1130 近防炮 ${index + 1} 平台斜撑 ${dz < 0 ? "后" : "前"}`,
        name_en: `CIWS ${index + 1} platform brace ${dz < 0 ? "a" : "f"}`,
        assembly: ASSEMBLY,
        build_layer: 4,
        geometry: M({ type: "weld", from: [x, baseY + 3.28, z + Math.sign(spot[2] - z) * 1.35], to: [spot[0], platformY - 0.02, spot[2] + dz], radius: 0.04 }),
        material: "cv_steel_dark",
        mate: A([0, 0, 0]),
      });
    }
    add({
      id: `${P}ciws_${tag}_base`,
      name_cn: `1130 近防炮 ${index + 1} 底座`,
      name_en: `CIWS ${index + 1} base`,
      assembly: ASSEMBLY,
      build_layer: 4,
      geometry: M(C(0.46, 0.18, [0, 0, 0], 24), T(0.42, 0.34, 0.08, [0, 0.12, 0], 24)),
      material: "cv_hull_dark",
      mate: A([spot[0], spot[1] - 0.1, spot[2]]),
    });
    ctx.node({ name: tu, parent: "root", pivot: [spot[0], spot[1] + 0.16, spot[2]], motion: "rotate", axis: "y", note: `1130 近防炮 ${index + 1} 旋回` });
    add({
      id: `${P}ciws_${tag}_turret`,
      name_cn: `1130 近防炮 ${index + 1} 炮塔`,
      name_en: `CIWS ${index + 1} turret`,
      assembly: ASSEMBLY,
      build_layer: 4,
      geometry: M(C(0.38, 0.24, [0, 0.12, 0], 22), B(0.54, 0.3, 0.6, [0, 0.28, 0.08], 0.012)),
      material: "cv_hull",
      node: tu,
      mate: A([0, 0, 0]),
    });
    const elev = `CV_CiwsElev_${index + 1}`;
    ctx.node({ name: elev, parent: tu, pivot: [0, 0.36, 0.24], motion: "rotate", axis: "x", note: `1130 近防炮 ${index + 1} 俯仰` });
    add({
      id: `${P}ciws_${tag}_cradle`,
      name_cn: `1130 近防炮 ${index + 1} 俯仰架`,
      name_en: `CIWS ${index + 1} cradle`,
      assembly: ASSEMBLY,
      build_layer: 4,
      geometry: M(B(0.5, 0.22, 0.34, [0, 0, 0], 0.008), C(0.12, 0.5, [0, 0, 0], 14)),
      material: "cv_steel_dark",
      node: elev,
      mate: A([0, 0, 0]),
    });
    const rotor = `CV_CiwsRotor_${index + 1}`;
    ctx.node({ name: rotor, parent: elev, pivot: [0, 0, 0.18], motion: "rotate", axis: "z", note: `1130 近防炮 ${index + 1} 11 管转管` });
    add({
      id: `${P}ciws_${tag}_rotor`,
      name_cn: `1130 近防炮 ${index + 1} 旋转机匣`,
      name_en: `CIWS ${index + 1} rotor`,
      assembly: ASSEMBLY,
      build_layer: 4,
      geometry: M(C(0.16, 0.6, [0, 0, 0], 20), T(0.18, 0.12, 0.1, [0, 0, 0.3], 20)),
      material: "cv_steel",
      node: rotor,
      mate: A([0, 0, 0], [90, 0, 0]),
    });
    for (let barrel = 0; barrel < 11; barrel++) {
      const a = (barrel / 11) * Math.PI * 2;
      add({
        id: `${P}ciws_${tag}_barrel_${pad(barrel + 1)}`,
        name_cn: `1130 近防炮 ${index + 1} 炮管 ${barrel + 1}`,
        name_en: `CIWS ${index + 1} barrel ${barrel + 1}`,
        assembly: ASSEMBLY,
        build_layer: 4,
        geometry: M(C(0.018, 1.25, [0, 0, 0], 8), C(0.024, 0.08, [0, 0.6, 0], 8)),
        material: "cv_steel_dark",
        node: rotor,
        mate: A([Math.cos(a) * 0.075, Math.sin(a) * 0.075, 0.95], [90, 0, 0]),
      });
      add({
        id: `${P}ciws_${tag}_breech_${pad(barrel + 1)}`,
        name_cn: `1130 近防炮 ${index + 1} 枪机 ${barrel + 1}`,
        name_en: `CIWS ${index + 1} breech ${barrel + 1}`,
        assembly: ASSEMBLY,
        build_layer: 4,
        geometry: M(B(0.08, 0.08, 0.2, [0, 0, 0], 0.006), C(0.02, 0.1, [0, 0, 0.1], 8)),
        material: "cv_steel",
        node: rotor,
        mate: A([Math.cos(a) * 0.075, Math.sin(a) * 0.075, 0.3], [0, 0, 0]),
      });
    }
    add({
      id: `${P}ciws_${tag}_ammo_drum`,
      name_cn: `1130 近防炮 ${index + 1} 弹箱`,
      name_en: `CIWS ${index + 1} ammo drum`,
      assembly: ASSEMBLY,
      build_layer: 4,
      geometry: M(C(0.28, 0.4, [0, 0, 0], 20), T(0.2, 0.12, 0.05, [0, 0.22, 0], 20)),
      material: "cv_steel_dark",
      node: tu,
      mate: A([0, 0.14, -0.5], [90, 0, 0]),
    });
    add({
      id: `${P}ciws_${tag}_tracking_radar`,
      name_cn: `1130 近防炮 ${index + 1} 跟踪雷达`,
      name_en: `CIWS ${index + 1} tracking radar`,
      assembly: ASSEMBLY,
      build_layer: 4,
      geometry: M(B(0.3, 0.24, 0.16, [0, 0, 0], 0.008), C(0.11, 0.05, [0, 0.05, 0.1], 18)),
      material: "cv_radar",
      node: elev,
      mate: A([0, 0.3, -0.05]),
    });
    add({
      id: `${P}ciws_${tag}_eo`,
      name_cn: `1130 近防炮 ${index + 1} 光电跟踪`,
      name_en: `CIWS ${index + 1} EO tracker`,
      assembly: ASSEMBLY,
      build_layer: 4,
      geometry: M(B(0.16, 0.16, 0.1, [0, 0, 0], 0.006), C(0.05, 0.04, [0, 0, 0.07], 16)),
      material: "cv_steel_dark",
      node: elev,
      mate: A([0.2, 0.26, 0.1]),
    });
  });

  // 近程防空导弹（8 联装）×2 + 干扰弹发射器。
  for (const side of [-1, 1] as const) {
    add({
      id: `${P}sam_launcher_${side === -1 ? "p" : "s"}`,
      name_cn: `近程防空导弹发射架 ${side === -1 ? "左" : "右"}`,
      name_en: `SAM launcher ${side === -1 ? "p" : "s"}`,
      assembly: ASSEMBLY,
      build_layer: 4,
      geometry: M(B(1.2, 0.4, 0.9, [0, 0, 0], 0.012), B(1.0, 0.1, 0.08, [0, 0.26, 0], 0.004)),
      material: "cv_hull_dark",
      mate: A([x + side * 0.75, baseY + 0.2, z - 5.2]),
    });
    for (let cell = 0; cell < 8; cell++) {
      add({
        id: `${P}sam_${side === -1 ? "p" : "s"}_cell_${pad(cell + 1)}`,
        name_cn: `防空导弹 ${side === -1 ? "左" : "右"}-${cell + 1}`,
        name_en: `SAM ${side === -1 ? "p" : "s"}-${cell + 1}`,
        assembly: ASSEMBLY,
        build_layer: 4,
        geometry: M(C(0.055, 0.55, [0, 0, 0], 12), C(0.02, 0.16, [0, 0.35, 0], 10), B(0.16, 0.012, 0.1, [0, 0, -0.25], 0.002)),
        material: "cv_steel",
        mate: A([x + side * 0.75 + ((cell % 4) - 1.5) * 0.23, baseY + 0.22, z - 5.2 + (Math.floor(cell / 4) - 0.5) * 0.22], [0, 0, 0]),
      });
    }
    add({
      id: `${P}decoy_${side === -1 ? "p" : "s"}`,
      name_cn: `干扰弹发射器 ${side === -1 ? "左" : "右"}`,
      name_en: `decoy launcher ${side === -1 ? "p" : "s"}`,
      assembly: ASSEMBLY,
      build_layer: 4,
      geometry: M(B(0.55, 0.3, 0.22, [0, 0, 0], 0.006), C(0.055, 0.3, [0, 0, 0], 12)),
      material: "cv_steel_dark",
      mate: A([x + side * 0.7, baseY + 1.35, z + 2.85]),
      instances: 6,
      indexed: true,
      instance_layout: `carrier.island.decoy${side}`,
    });
    ctx.layout(`carrier.island.decoy${side}`, ({ index: i }) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      return new THREE.Matrix4().makeTranslation((col - 1) * 0.18, row * 0.12, 0);
    });
  }
}
