import * as THREE from "three";
import type { InstanceLayout } from "../../assembler/assembler";
import type { ExpectedContactRule, ModelRegistry } from "../../registry/types";
import { A, B, C, M, S, T, carrierContext, pad } from "../carrier/common";
import { CV_MATERIALS } from "../carrier/materials";
import {
  T55,
  T55_CONSTANTS,
  t55DeckHalf,
  t55DeckTop,
  t55HalfAt,
} from "./constants";
import {
  type055AesaPanel,
  type055BootTop,
  type055BulbousBow,
  type055Bulwark,
  type055Deck,
  type055DeckDashes,
  type055DeckUnderside,
  type055DeckWalkLines,
  type055Frustum,
  type055GunTurret,
  type055Helipad,
  type055HullNumber,
  type055HullShell,
  type055HullUnderwater,
  type055Propeller,
  type055Rhib,
  type055VlsFlame,
  type055VlsHatch,
  type055VlsMissile,
} from "./kits";

// ============================================================================
// models/type055/registry —— 055 型驱逐舰注册表（1 单位 = 1 米）
// L1 舰体/动力 → L2 舱室/机库 → L3 甲板/VLS/主炮 → L4 上层建筑/相控阵/桅杆
// ============================================================================

const P = "type055.";
const DECK = 14.2;

function buildType055Once(): { registry: ModelRegistry; layouts: Record<string, InstanceLayout> } {
  const ctx = carrierContext();
  const add = ctx.add;

  // ---------------- 舰体 ----------------
  add({
    id: `${P}hull.shell`,
    name_cn: "舰体外板（隐身内倾）",
    name_en: "stealth hull shell",
    assembly: "hull",
    build_layer: 1,
    geometry: { type: "kit", kit: "type055HullShell" },
    material: "cv_055_hull",
    mate: A([0, 0, 0]),
    source: "60 站放样；水线以上舷侧内倾 18%，甲板宽小于水线宽。",
  });
  add({
    id: `${P}hull.underwater`,
    name_cn: "水下舰体（防污漆）",
    name_en: "underwater hull",
    assembly: "hull",
    build_layer: 1,
    geometry: { type: "kit", kit: "type055HullUnderwater" },
    material: "cv_antifouling",
    mate: A([0, 0, 0]),
  });
  add({
    id: `${P}hull.keel`,
    name_cn: "主龙骨",
    name_en: "main keel",
    assembly: "hull",
    build_layer: 1,
    geometry: M(B(1.6, 0.7, 168, [0, 0, 0], 0.04)),
    material: "cv_steel_dark",
    mate: A([0, 0.9, 0]),
  });
  add({
    id: `${P}hull.bow_sonar_dome`,
    name_cn: "球鼻艏/舰壳声呐导流罩",
    name_en: "bulbous bow sonar dome",
    assembly: "hull",
    build_layer: 1,
    geometry: { type: "kit", kit: "type055BulbousBow" },
    material: "cv_antifouling",
    mate: A([0, 0, 0]),
    source: "球鼻艏前伸至艏柱之前，内置舰壳声呐；与防污漆同为水下涂层。",
  });
  add({
    id: `${P}hull.sonar_array`,
    name_cn: "舰壳声呐阵",
    name_en: "hull sonar array",
    assembly: "hull",
    build_layer: 1,
    geometry: M(T(0.9, 0.7, 0.3, [0, 0, 0], 28), C(0.62, 0.08, [0, 0, 0], 20)),
    material: "cv_steel_dark",
    mate: A([0, 4.3, 87.85], [90, 0, 0]),
  });
  add({
    id: `${P}hull.boot_top`,
    name_cn: "水线漆带",
    name_en: "boot top stripe",
    assembly: "hull",
    build_layer: 1,
    geometry: { type: "kit", kit: "type055BootTop" },
    material: "cv_hull_boot",
    mate: A([0, 0, 0]),
  });
  const numberX = t55HalfAt(68.5, 9.3) + 0.02;
  for (const side of [-1, 1] as const) {
    add({
      id: `${P}surface.hull_number_${side === -1 ? "l" : "r"}`,
      name_cn: `舷号 101 ${side === -1 ? "左" : "右"}`,
      name_en: `hull number 101 ${side === -1 ? "l" : "r"}`,
      assembly: "surface",
      build_layer: 5,
      geometry: { type: "kit", kit: "type055HullNumber" },
      material: "cv_deck_line",
      mate: A([side * numberX, 9.3, 68.5], [0, side * 90, 0]),
    });
  }

  // 横向肋板/舱壁/纵桁
  for (let i = 0; i < 24; i++) {
    const z = -84 + i * 7.2;
    const half = t55HalfAt(z, 1.4) * 0.94;
    add({
      id: `${P}hull.floor_${pad(i + 1)}`,
      name_cn: `横向肋板 ${i + 1}`,
      name_en: `transverse floor ${i + 1}`,
      assembly: "hull",
      build_layer: 1,
      geometry: M(B(half * 2, 0.22, 0.26, [0, 0, 0], 0.01)),
      material: "cv_steel_dark",
      mate: A([0, 1.4, z]),
    });
  }
  for (let i = 0; i < 6; i++) {
    const z = -60 + i * 24;
    add({
      id: `${P}hull.bulkhead_${pad(i + 1)}`,
      name_cn: `水密舱壁 ${i + 1}`,
      name_en: `watertight bulkhead ${i + 1}`,
      assembly: "hull",
      build_layer: 1,
      geometry: M(B(t55DeckHalf(z) * 1.92, 7.2, 0.16, [0, 0, 0], 0.006)),
      material: "cv_steel_dark",
      mate: A([0, 10.4, z]),
    });
  }
  for (const side of [-1, 1] as const) {
    add({
      id: `${P}hull.girder_${side === -1 ? "l" : "r"}`,
      name_cn: `纵向主桁 ${side === -1 ? "左" : "右"}`,
      name_en: `longitudinal girder ${side === -1 ? "l" : "r"}`,
      assembly: "hull",
      build_layer: 1,
      geometry: M(B(0.2, 5.5, 160, [0, 0, 0], 0.008)),
      material: "cv_steel_dark",
      mate: A([side * 4.2, 9.2, 0]),
    });
    add({
      id: `${P}hull.bilge_keel_${side === -1 ? "l" : "r"}`,
      name_cn: `舭龙骨 ${side === -1 ? "左" : "右"}`,
      name_en: `bilge keel ${side === -1 ? "l" : "r"}`,
      assembly: "hull",
      build_layer: 1,
      geometry: M(B(0.16, 0.7, 90, [0, 0, 0], 0.02)),
      material: "cv_steel_dark",
      mate: A([side * 8.55, 4.6, 2]),
    });
  }

  // ---------------- 甲板 ----------------
  add({
    id: `${P}deck.main`,
    name_cn: "主甲板",
    name_en: "main deck",
    assembly: "deck",
    build_layer: 3,
    geometry: { type: "kit", kit: "type055Deck" },
    material: "cv_deck",
    mate: A([0, 0, 0]),
    source: "隐身内倾甲板轮廓；顶面 y=14.2。",
  });
  add({
    id: `${P}deck.underside`,
    name_cn: "主甲板底面",
    name_en: "deck underside",
    assembly: "deck",
    build_layer: 3,
    geometry: { type: "kit", kit: "type055DeckUnderside" },
    material: "cv_deck_plate",
    mate: A([0, 0, 0]),
  });
  add({
    id: `${P}deck.walk_lines`,
    name_cn: "甲板安全走道线",
    name_en: "deck walkway lines",
    assembly: "deck",
    build_layer: 4,
    geometry: { type: "kit", kit: "type055DeckWalkLines" },
    material: "cv_deck_line",
    mate: A([0, 0, 0]),
  });
  add({
    id: `${P}deck.vls_dashes`,
    name_cn: "垂发危险区虚线",
    name_en: "VLS danger-zone dashes",
    assembly: "deck",
    build_layer: 4,
    geometry: { type: "kit", kit: "type055DeckDashes" },
    material: "cv_deck_yellow",
    mate: A([0, 0, 0]),
  });

  // 舷侧走道/栏杆/甲板灯
  for (const side of [-1, 1] as const) {
    for (let i = 0; i < 18; i++) {
      const z = -80 + i * 9;
      const x = side * (t55DeckHalf(z) - 0.35);
      add({
        id: `${P}deck.rail_post_${side === -1 ? "l" : "r"}_${pad(i + 1)}`,
        name_cn: `甲板栏杆立柱 ${side === -1 ? "左" : "右"} ${i + 1}`,
        name_en: `deck rail post ${side === -1 ? "l" : "r"} ${i + 1}`,
        assembly: "surface",
        build_layer: 4,
        geometry: M(C(0.035, 1.0, [0, 0, 0], 8)),
        material: "cv_steel_dark",
        mate: A([x, t55DeckTop(z) + 0.5, z]),
      });
    }
    add({
      id: `${P}deck.rail_${side === -1 ? "l" : "r"}`,
      name_cn: `甲板栏杆 ${side === -1 ? "左" : "右"}`,
      name_en: `deck rail ${side === -1 ? "l" : "r"}`,
      assembly: "surface",
      build_layer: 4,
      geometry: M(
        { type: "weld", from: [side * t55DeckHalf(-84), t55DeckTop(-84) + 1.0, -84], to: [side * t55DeckHalf(-41), t55DeckTop(-41) + 1.0, -41], radius: 0.035 },
        { type: "weld", from: [side * t55DeckHalf(-35), t55DeckTop(-35) + 1.0, -35], to: [side * t55DeckHalf(-30), t55DeckTop(-30) + 1.0, -30], radius: 0.035 },
        { type: "weld", from: [side * t55DeckHalf(-30), t55DeckTop(-30) + 1.0, -30], to: [side * t55DeckHalf(50), t55DeckTop(50) + 1.0, 50], radius: 0.035 },
      ),
      material: "cv_steel_dark",
      mate: A([0, 0, 0]),
    });
  }

  // ---------------- 上层建筑 ----------------
  add({
    id: `${P}super.main_block`,
    name_cn: "一体化上层建筑",
    name_en: "integrated superstructure",
    assembly: "superstructure",
    build_layer: 4,
    geometry: { type: "kit", kit: "type055Frustum", params: { w0: 13.6, d0: 34, w1: 11.2, d1: 30, h: 7.4 } },
    material: "cv_055_hull",
    mate: A([0, DECK, 22]),
  });
  add({
    id: `${P}super.bridge`,
    name_cn: "舰桥",
    name_en: "bridge",
    assembly: "superstructure",
    build_layer: 4,
    geometry: { type: "kit", kit: "type055Frustum", params: { w0: 9.6, d0: 15, w1: 8.2, d1: 12.5, h: 5.5 } },
    material: "cv_055_hull",
    mate: A([0, DECK + 7.4, 26]),
  });
  add({
    id: `${P}super.hangar_block`,
    name_cn: "双机库上层建筑",
    name_en: "hangar block",
    assembly: "hangar",
    build_layer: 4,
    geometry: { type: "kit", kit: "type055Frustum", params: { w0: 12.6, d0: 18, w1: 11.2, d1: 16, h: 6.4 } },
    material: "cv_055_hull",
    mate: A([0, DECK, -63]),
  });
  add({
    id: `${P}super.mast`,
    name_cn: "一体化隐身桅杆",
    name_en: "integrated mast",
    assembly: "radar",
    build_layer: 4,
    geometry: { type: "kit", kit: "type055Frustum", params: { w0: 6.0, d0: 8.6, w1: 2.4, d1: 4.4, h: 13 } },
    material: "cv_055_hull",
    mate: A([0, DECK + 12.9, 20]),
  });
  // 舰桥窗带
  for (const [tag, x, z, yaw] of [
    ["front", 0, 33.05, 0],
    ["port", -4.32, 27, 90],
    ["starboard", 4.32, 27, -90],
  ] as const) {
    add({
      id: `${P}super.bridge_glass_${tag}`,
      name_cn: `舰桥窗带 ${tag}`,
      name_en: `bridge window band ${tag}`,
      assembly: "superstructure",
      build_layer: 4,
      geometry: M(B(tag === "front" ? 8.2 : 10.5, 1.1, 0.08, [0, 0, 0], 0.004)),
      material: "cv_glass",
      mate: A([x, DECK + 11.1, z], [0, yaw, 0]),
    });
  }
  add({
    id: `${P}super.funnel_casing`,
    name_cn: "烟囱机舱围壁",
    name_en: "funnel casing",
    assembly: "superstructure",
    build_layer: 4,
    geometry: { type: "kit", kit: "type055Frustum", params: { w0: 11.0, d0: 18, w1: 9.8, d1: 16, h: 5.8 } },
    material: "cv_055_hull",
    mate: A([0, DECK, -13]),
  });
  // 烟囱（内倾、红外抑制）
  for (const [i, z] of [-6, -18].entries()) {
    add({
      id: `${P}super.funnel_${pad(i + 1)}`,
      name_cn: `烟囱 ${i + 1}`,
      name_en: `funnel ${i + 1}`,
      assembly: "superstructure",
      build_layer: 4,
      geometry: { type: "kit", kit: "type055Frustum", params: { w0: 4.4, d0: 6.0, w1: 3.2, d1: 4.2, h: 6.2 } },
      material: "cv_hull_dark",
      mate: A([0, DECK + 5.8, z]),
    });
    add({
      id: `${P}super.funnel_cap_${pad(i + 1)}`,
      name_cn: `烟囱顶 ${i + 1}`,
      name_en: `funnel cap ${i + 1}`,
      assembly: "superstructure",
      build_layer: 4,
      geometry: M(B(3.0, 0.18, 4.0, [0, 0, 0], 0.01)),
      material: "cv_steel_dark",
      mate: A([0, DECK + 12.05, z]),
    });
  }

  // 346B 四面阵 + T/R 阵列（阵面自带 8×8 模块）
  const arrays: Array<[string, [number, number, number], number]> = [
    ["front", [0, DECK + 6.2, 39.1], 0],
    ["aft", [0, DECK + 6.2, 4.9], 180],
    ["port", [-6.9, DECK + 6.2, 22], 90],
    ["starboard", [6.9, DECK + 6.2, 22], -90],
  ];
  for (const [tag, pos, yaw] of arrays) {
    add({
      id: `${P}radar.aesa_${tag}`,
      name_cn: `346B 相控阵 ${tag}`,
      name_en: `346B AESA ${tag}`,
      assembly: "radar",
      build_layer: 4,
      geometry: { type: "kit", kit: "type055AesaPanel", params: { w: 4.8, h: 3.8 } },
      material: "cv_aesa",
      mate: A(pos, [0, yaw, 0]),
    });
    // 安装框：把阵面接到内倾上建面
    const rad = (yaw * Math.PI) / 180;
    add({
      id: `${P}radar.aesa_mount_${tag}`,
      name_cn: `相控阵安装框 ${tag}`,
      name_en: `AESA mount ${tag}`,
      assembly: "radar",
      build_layer: 4,
      geometry: M(B(5.2, 4.2, 0.9, [0, 0, 0], 0.01)),
      material: "cv_steel_dark",
      mate: A([pos[0] - Math.sin(rad) * 0.3, pos[1], pos[2] - Math.cos(rad) * 0.3], [0, yaw, 0]),
    });
  }
  // 346B 的 8×8 T/R 模块：4 面 × 64 块，做成实例族便于逐模块检查/高亮。
  ctx.layout("type055.aesaTiles", ({ index }) => {
    const panel = Math.floor(index / 64);
    const localIndex = index % 64;
    const row = Math.floor(localIndex / 8);
    const col = localIndex % 8;
    const [tag, pos, yaw] = arrays[panel]!;
    void tag;
    const lx = -2.4 + (4.8 * (col + 0.75)) / 8.6;
    const ly = -1.9 + (3.8 * (row + 0.75)) / 8.6;
    const rad = (yaw * Math.PI) / 180;
    return new THREE.Matrix4()
      .makeTranslation(pos[0], pos[1], pos[2])
      .multiply(new THREE.Matrix4().makeRotationY(rad))
      .multiply(new THREE.Matrix4().makeTranslation(lx, ly, -0.2));
  });
  add({
    id: `${P}radar.aesa_tiles`,
    name_cn: "346B T/R 组件（阵面内侧）×256",
    name_en: "346B T/R modules (rear side) ×256",
    assembly: "radar",
    build_layer: 4,
    geometry: M(B(0.42, 0.36, 0.08, [0, 0, 0], 0), B(0.36, 0.06, 0.3, [0, 0.12, -0.18], 0)),
    material: "cv_055_aesa_tile",
    instances: 256,
    indexed: true,
    instance_layout: "type055.aesaTiles",
    mate: A([0, 0, 0]),
  });

  // 旋转导航雷达 / 卫通 / ESM
  ctx.node({ name: "CV_055_Radar", parent: "root", pivot: [0, DECK + 26.05, 20], motion: "rotate", axis: "y", note: "旋转导航雷达" });
  add({
    id: `${P}radar.nav`,
    name_cn: "旋转导航雷达",
    name_en: "rotating navigation radar",
    assembly: "radar",
    build_layer: 4,
    geometry: M(C(0.45, 0.3, [0, 0, 0], 16), B(2.6, 0.12, 0.2, [0, 0.2, 0], 0.01)),
    material: "cv_radar",
    node: "CV_055_Radar",
    mate: A([0, 0, 0]),
  });
  for (const side of [-1, 1] as const) {
    add({
      id: `${P}radar.satcom_${side === -1 ? "l" : "r"}`,
      name_cn: `卫通天线罩 ${side === -1 ? "左" : "右"}`,
      name_en: `SATCOM dome ${side === -1 ? "l" : "r"}`,
      assembly: "radar",
      build_layer: 4,
      geometry: M(S(1.0, [0, 0, 0], 20), C(0.85, 0.4, [0, -0.7, 0], 18)),
      material: "cv_radar",
      mate: A([side * 3.9, DECK + 13.9, 21]),
    });
    add({
      id: `${P}radar.esm_${side === -1 ? "l" : "r"}`,
      name_cn: `电子战天线 ${side === -1 ? "左" : "右"}`,
      name_en: `ESM antenna ${side === -1 ? "l" : "r"}`,
      assembly: "radar",
      build_layer: 4,
      geometry: M(B(0.3, 1.2, 0.3, [0, 0, 0], 0.006), C(0.12, 0.5, [0, 0.8, 0], 10)),
      material: "cv_radar_dark",
      mate: A([side * 1.8, DECK + 15.0, 22.5]),
    });
  }

  // ---------------- 上层建筑分面/舷窗/门/舷梯/艇库 ----------------
  add({
    id: `${P}super.connector`,
    name_cn: "前部上建连接段",
    name_en: "forward deckhouse connector",
    assembly: "superstructure",
    build_layer: 4,
    geometry: { type: "kit", kit: "type055Frustum", params: { w0: 11.6, d0: 9, w1: 11.0, d1: 8.4, h: 4.4 } },
    material: "cv_055_hull",
    mate: A([0, t55DeckTop(0.5), 0.5]),
  });
  add({
    id: `${P}super.aft_deckhouse`,
    name_cn: "后部上层建筑",
    name_en: "aft deckhouse",
    assembly: "superstructure",
    build_layer: 4,
    geometry: { type: "kit", kit: "type055Frustum", params: { w0: 12.2, d0: 22, w1: 11.2, d1: 20.4, h: 4.8 } },
    material: "cv_055_hull",
    mate: A([0, t55DeckTop(-33), -33]),
  });

  // 舰桥两翼平台 + 斜撑 + 栏杆（直升机指挥/靠泊观察位）
  for (const side of [-1, 1] as const) {
    add({
      id: `${P}super.bridge_wing_${side === -1 ? "l" : "r"}`,
      name_cn: `舰桥翼台 ${side === -1 ? "左" : "右"}`,
      name_en: `bridge wing ${side === -1 ? "l" : "r"}`,
      assembly: "superstructure",
      build_layer: 4,
      geometry: M(B(5.4, 0.26, 5.2, [0, 0, 0], 0.02), B(5.2, 0.1, 0.12, [0, 0.05, 2.58], 0.006)),
      material: "cv_055_hull",
      mate: A([side * 7.2, 21.73, 28.0]),
    });
    for (const [i, z] of [25.7, 28.0, 30.3].entries()) {
      add({
        id: `${P}super.bridge_wing_post_${side === -1 ? "l" : "r"}_${i + 1}`,
        name_cn: `翼台栏杆立柱 ${side === -1 ? "左" : "右"} ${i + 1}`,
        name_en: `bridge wing post ${side === -1 ? "l" : "r"} ${i + 1}`,
        assembly: "superstructure",
        build_layer: 4,
        geometry: M(C(0.035, 1.0, [0, 0, 0], 8)),
        material: "cv_steel_dark",
        mate: A([side * 9.78, 22.36, z]),
      });
    }
    add({
      id: `${P}super.bridge_wing_rail_${side === -1 ? "l" : "r"}`,
      name_cn: `翼台栏杆 ${side === -1 ? "左" : "右"}`,
      name_en: `bridge wing rail ${side === -1 ? "l" : "r"}`,
      assembly: "superstructure",
      build_layer: 4,
      geometry: M(
        { type: "weld", from: [side * 9.78, 22.86, 25.7], to: [side * 9.78, 22.86, 30.3], radius: 0.035 },
        { type: "weld", from: [side * 9.78, 22.86, 30.4], to: [side * 4.6, 22.86, 30.4], radius: 0.035 },
      ),
      material: "cv_steel_dark",
      mate: A([0, 0, 0]),
    });
    for (const [i, z] of [26.5, 29.5].entries()) {
      add({
        id: `${P}super.bridge_wing_strut_${side === -1 ? "l" : "r"}_${i + 1}`,
        name_cn: `翼台斜撑 ${side === -1 ? "左" : "右"} ${i + 1}`,
        name_en: `bridge wing strut ${side === -1 ? "l" : "r"} ${i + 1}`,
        assembly: "superstructure",
        build_layer: 4,
        geometry: M({ type: "weld", from: [side * 9.6, 21.55, z], to: [side * 6.34, 17.4, z], radius: 0.09 }),
        material: "cv_steel_dark",
        mate: A([0, 0, 0]),
      });
    }
  }
  // 舰桥正面窗框
  for (let i = 0; i < 6; i++) {
    add({
      id: `${P}super.bridge_mullion_${i + 1}`,
      name_cn: `舰桥窗框 ${i + 1}`,
      name_en: `bridge window mullion ${i + 1}`,
      assembly: "superstructure",
      build_layer: 4,
      geometry: M(B(0.1, 1.25, 0.1, [0, 0, 0], 0.004)),
      material: "cv_steel_dark",
      mate: A([-3.0 + i * 1.2, 25.4, 32.92]),
    });
  }

  // 舷窗/窗带（实例族）：主上建两层、后上建一层
  interface PanelSpot {
    x: number;
    y: number;
    z: number;
    yaw: number;
  }
  const windowSpots: PanelSpot[] = [];
  for (const side of [-1, 1] as const) {
    for (let i = 0; i < 12; i++) {
      const z = 8 + i * 2.4;
      windowSpots.push({ x: side * 6.33, y: 17.2, z, yaw: side * 90 });
      windowSpots.push({ x: side * 6.04, y: 19.0, z, yaw: side * 90 });
    }
    for (let i = 0; i < 7; i++) {
      windowSpots.push({ x: side * 5.83, y: 17.2, z: -42 + i * 2.7, yaw: side * 90 });
    }
  }
  ctx.layout("type055.windows", ({ index }) => {
    const spot = windowSpots[index]!;
    return new THREE.Matrix4()
      .makeTranslation(spot.x, spot.y, spot.z)
      .multiply(new THREE.Matrix4().makeRotationY((spot.yaw * Math.PI) / 180));
  });
  add({
    id: `${P}super.windows`,
    name_cn: "上建舷窗 ×62",
    name_en: "deckhouse windows ×62",
    assembly: "superstructure",
    build_layer: 4,
    geometry: M(B(1.14, 0.6, 0.07, [0, 0, 0], 0.012), B(1.24, 0.7, 0.04, [0, 0, -0.03], 0.006)),
    material: "cv_glass",
    instances: 62,
    indexed: true,
    instance_layout: "type055.windows",
    mate: A([0, 0, 0]),
  });

  // 水密门（实例族）
  const doorSpots: PanelSpot[] = [];
  for (const side of [-1, 1] as const) {
    for (const z of [10, 20, 33]) doorSpots.push({ x: side * 6.56, y: t55DeckTop(z) + 1.05, z, yaw: side * 90 });
    for (const z of [-28, -40]) doorSpots.push({ x: side * 5.92, y: t55DeckTop(z) + 1.05, z, yaw: side * 90 });
  }
  ctx.layout("type055.doors", ({ index }) => {
    const spot = doorSpots[index]!;
    return new THREE.Matrix4()
      .makeTranslation(spot.x, spot.y, spot.z)
      .multiply(new THREE.Matrix4().makeRotationY((spot.yaw * Math.PI) / 180));
  });
  add({
    id: `${P}super.doors`,
    name_cn: "上建水密门 ×10",
    name_en: "deckhouse watertight doors ×10",
    assembly: "superstructure",
    build_layer: 4,
    geometry: M(B(0.95, 2.1, 0.1, [0, 0, 0], 0.02), B(1.15, 2.26, 0.06, [0, 0, -0.03], 0.01)),
    material: "cv_hull_dark",
    instances: 10,
    indexed: true,
    instance_layout: "type055.doors",
    mate: A([0, 0, 0]),
  });

  // 舷侧百叶/通风口（实例族）
  const louverSpots: PanelSpot[] = [];
  for (const side of [-1, 1] as const) {
    for (const z of [-42, -36, -30, -24]) louverSpots.push({ x: side * 5.66, y: 18.6, z, yaw: side * 90 });
    for (const z of [14, 26]) louverSpots.push({ x: side * 6.07, y: 18.8, z, yaw: side * 90 });
  }
  ctx.layout("type055.louvers", ({ index }) => {
    const spot = louverSpots[index]!;
    return new THREE.Matrix4()
      .makeTranslation(spot.x, spot.y, spot.z)
      .multiply(new THREE.Matrix4().makeRotationY((spot.yaw * Math.PI) / 180));
  });
  add({
    id: `${P}super.louvers`,
    name_cn: "舷侧通风百叶 ×12",
    name_en: "deckhouse louvers ×12",
    assembly: "superstructure",
    build_layer: 4,
    geometry: M(
      B(0.8, 0.5, 0.08, [0, 0, 0], 0.006),
      B(0.72, 0.04, 0.1, [0, 0.16, 0.01], 0.003),
      B(0.72, 0.04, 0.1, [0, 0.02, 0.01], 0.003),
      B(0.72, 0.04, 0.1, [0, -0.12, 0.01], 0.003),
    ),
    material: "cv_grate",
    instances: 12,
    indexed: true,
    instance_layout: "type055.louvers",
    mate: A([0, 0, 0]),
  });

  // 烟囱顶盖/排气格栅/侧百叶
  for (const [i, z] of [-6, -18].entries()) {
    add({
      id: `${P}super.funnel_cap_dark_${i + 1}`,
      name_cn: `烟囱顶盖 ${i + 1}`,
      name_en: `funnel cap ${i + 1}`,
      assembly: "superstructure",
      build_layer: 4,
      geometry: M(B(3.2, 0.2, 4.2, [0, 0, 0], 0.02), B(3.0, 0.06, 4.0, [0, 0.12, 0], 0.006)),
      material: "cv_steel_dark",
      mate: A([0, 26.25, z]),
    });
    const slats: Array<Parameters<typeof M>[0]> = [];
    for (let s = 0; s < 5; s++) slats.push(B(2.1, 0.06, 0.18, [0, 0.16, -0.8 + s * 0.4], 0.004));
    add({
      id: `${P}super.funnel_grille_${i + 1}`,
      name_cn: `烟囱排气格栅 ${i + 1}`,
      name_en: `funnel exhaust grille ${i + 1}`,
      assembly: "superstructure",
      build_layer: 4,
      geometry: M(...slats),
      material: "cv_grate",
      mate: A([0, 26.22, z]),
    });
    for (const side of [-1, 1] as const) {
      add({
        id: `${P}super.funnel_louver_${i + 1}_${side === -1 ? "l" : "r"}`,
        name_cn: `烟囱侧百叶 ${i + 1} ${side === -1 ? "左" : "右"}`,
        name_en: `funnel louver ${i + 1} ${side === -1 ? "l" : "r"}`,
        assembly: "superstructure",
        build_layer: 4,
        geometry: M(B(0.1, 2.0, 2.4, [0, 0, 0], 0.01)),
        material: "cv_grate",
        mate: A([side * 1.83, 24.0, z]),
      });
    }
  }

  // 桅顶平台/横桁/天线/电子战/导航灯
  add({
    id: `${P}radar.mast_platform`,
    name_cn: "桅顶平台",
    name_en: "mast top platform",
    assembly: "radar",
    build_layer: 4,
    geometry: M(B(6.4, 0.26, 5.0, [0, 0, 0], 0.02), B(6.0, 0.1, 0.12, [0, 0.16, 2.44], 0.006)),
    material: "cv_steel",
    mate: A([0, 40.15, 20]),
  });
  add({
    id: `${P}radar.yardarm`,
    name_cn: "桅横桁",
    name_en: "mast yardarm",
    assembly: "radar",
    build_layer: 4,
    geometry: M(B(4.05, 0.16, 0.16, [3.475, 0, 0], 0.01), B(4.05, 0.16, 0.16, [-3.475, 0, 0], 0.01), C(0.12, 0.3, [-5.35, 0, 0], 10), C(0.12, 0.3, [5.35, 0, 0], 10)),
    material: "cv_steel_dark",
    mate: A([0, 38.6, 20]),
  });
  for (const side of [-1, 1] as const) {
    add({
      id: `${P}radar.whip_${side === -1 ? "l" : "r"}`,
      name_cn: `鞭状天线 ${side === -1 ? "左" : "右"}`,
      name_en: `whip antenna ${side === -1 ? "l" : "r"}`,
      assembly: "radar",
      build_layer: 4,
      geometry: M(C(0.04, 3.2, [0, 0, 0], 8), C(0.1, 0.18, [0, -1.55, 0], 8)),
      material: "cv_radar_dark",
      mate: A([side * 2.9, 41.55, 20]),
    });
    add({
      id: `${P}radar.nav_light_${side === -1 ? "l" : "r"}`,
      name_cn: `航行灯 ${side === -1 ? "红" : "绿"}`,
      name_en: `nav light ${side === -1 ? "red" : "green"}`,
      assembly: "radar",
      build_layer: 5,
      geometry: M(B(0.2, 0.2, 0.2, [0, 0, 0], 0.01)),
      material: side === -1 ? "cv_deck_red" : "cv_glow",
      mate: A([side * 3.15, 40.38, 20]),
    });
    add({
      id: `${P}radar.ecm_${side === -1 ? "l" : "r"}`,
      name_cn: `电子战阵面 ${side === -1 ? "左" : "右"}`,
      name_en: `ECM panel ${side === -1 ? "l" : "r"}`,
      assembly: "radar",
      build_layer: 4,
      geometry: M(B(0.5, 1.6, 0.18, [0, 0, 0], 0.01)),
      material: "cv_aesa",
      mate: A([side * 2.05, 34.6, 20], [0, side * 90, 0]),
    });
  }
  for (const [tag, z, yaw] of [
    ["fwd", 23.1, 0],
    ["aft", 16.9, 180],
  ] as const) {
    add({
      id: `${P}radar.xband_${tag}`,
      name_cn: `X 波段阵面 ${tag}`,
      name_en: `X-band array ${tag}`,
      assembly: "radar",
      build_layer: 4,
      geometry: M(B(1.2, 1.0, 0.14, [0, 0, 0], 0.01)),
      material: "cv_aesa",
      mate: A([0, 35.4, z], [0, yaw, 0]),
    });
  }
  // 桅顶平台栏杆
  for (let i = 0; i < 4; i++) {
    add({
      id: `${P}radar.mast_post_${i + 1}`,
      name_cn: `桅顶栏杆立柱 ${i + 1}`,
      name_en: `mast rail post ${i + 1}`,
      assembly: "radar",
      build_layer: 4,
      geometry: M(C(0.03, 0.9, [0, 0, 0], 6)),
      material: "cv_steel_dark",
      mate: A([i % 2 === 0 ? -3.1 : 3.1, 40.73, i < 2 ? 17.6 : 22.4]),
    });
  }

  // 舷侧刚性充气艇 + 吊艇架
  for (const side of [-1, 1] as const) {
    const deckY = t55DeckTop(-38);
    add({
      id: `${P}hangar.rhib_cradle_${side === -1 ? "l" : "r"}`,
      name_cn: `救生艇托架 ${side === -1 ? "左" : "右"}`,
      name_en: `RHIB cradle ${side === -1 ? "l" : "r"}`,
      assembly: "hangar",
      build_layer: 4,
      geometry: M(B(2.2, 0.3, 4.8, [0, 0, 0], 0.02), B(2.0, 0.08, 0.3, [0, 0.18, -1.8], 0.006), B(2.0, 0.08, 0.3, [0, 0.18, 1.8], 0.006)),
      material: "cv_steel_dark",
      mate: A([side * 7.1, deckY + 0.15, -38]),
    });
    add({
      id: `${P}hangar.rhib_${side === -1 ? "l" : "r"}`,
      name_cn: `刚性充气艇 ${side === -1 ? "左" : "右"}`,
      name_en: `RHIB ${side === -1 ? "l" : "r"}`,
      assembly: "hangar",
      build_layer: 4,
      geometry: { type: "kit", kit: "type055Rhib" },
      material: "cv_canvas",
      mate: A([side * 7.1, deckY + 0.5, -38]),
    });
    add({
      id: `${P}hangar.davit_post_${side === -1 ? "l" : "r"}`,
      name_cn: `吊艇架立柱 ${side === -1 ? "左" : "右"}`,
      name_en: `davit post ${side === -1 ? "l" : "r"}`,
      assembly: "hangar",
      build_layer: 4,
      geometry: M(C(0.13, 4.2, [0, 0, 0], 10), B(0.5, 0.16, 0.5, [0, -1.9, 0], 0.01)),
      material: "cv_steel_dark",
      mate: A([side * 6.1, deckY + 2.1, -41.2]),
    });
    add({
      id: `${P}hangar.davit_arm_${side === -1 ? "l" : "r"}`,
      name_cn: `吊艇架吊臂 ${side === -1 ? "左" : "右"}`,
      name_en: `davit arm ${side === -1 ? "l" : "r"}`,
      assembly: "hangar",
      build_layer: 4,
      geometry: M(
        { type: "weld", from: [side * 6.1, deckY + 4.2, -41.2], to: [side * 7.1, deckY + 4.45, -38], radius: 0.1 },
        { type: "weld", from: [side * 7.1, deckY + 4.45, -38], to: [side * 7.1, deckY + 2.2, -38], radius: 0.02 },
        C(0.12, 0.2, [side * 7.1, deckY + 2.15, -38], 10),
      ),
      material: "cv_steel_dark",
      mate: A([0, 0, 0]),
    });
  }

  // ---------------- 甲板设备/系泊/锚机 ----------------
  for (const side of [-1, 1] as const) {
    add({
      id: `${P}surface.windlass_${side === -1 ? "l" : "r"}`,
      name_cn: `锚机/绞盘 ${side === -1 ? "左" : "右"}`,
      name_en: `anchor windlass ${side === -1 ? "l" : "r"}`,
      assembly: "surface",
      build_layer: 5,
      geometry: M(C(0.42, 0.7, [0, 0, 0], 16), C(0.5, 0.12, [0, 0.38, 0], 16), B(0.9, 0.3, 0.9, [0, -0.2, 0], 0.02)),
      material: "cv_055_fitting",
      mate: A([side * 1.5, t55DeckTop(83) + 0.35, 83]),
    });
  }
  ctx.layout("type055.chain", ({ index }) => {
    const side = index < 24 ? -1 : 1;
    const i = index % 24;
    const u = i / 23;
    const x = side * (3.9 - u * 2.4);
    const z = 78.0 + u * 5.0;
    const angle = Math.atan2(side * -2.4, 5.0);
    return new THREE.Matrix4()
      .makeTranslation(x, t55DeckTop(z) + 0.08, z)
      .multiply(new THREE.Matrix4().makeRotationY(angle));
  });
  add({
    id: `${P}surface.anchor_chain`,
    name_cn: "锚链 ×48",
    name_en: "anchor chain links ×48",
    assembly: "surface",
    build_layer: 5,
    geometry: M(T(0.11, 0.06, 0.26, [0, 0, 0], 10), B(0.04, 0.06, 0.26, [0, 0, 0], 0.002)),
    material: "cv_055_fitting",
    instances: 48,
    indexed: true,
    instance_layout: "type055.chain",
    mate: A([0, 0, 0]),
  });

  const bollardZ = [-42, -28, 0, 14, 28, 42, 56, 70, 86];
  ctx.layout("type055.bollards", ({ index }) => {
    const side = index < bollardZ.length ? -1 : 1;
    const z = bollardZ[index % bollardZ.length]!;
    return new THREE.Matrix4().makeTranslation(side * (t55DeckHalf(z) - 0.62), t55DeckTop(z) + 0.3, z);
  });
  add({
    id: `${P}surface.bollards`,
    name_cn: "系缆桩 ×18",
    name_en: "bollards ×18",
    assembly: "surface",
    build_layer: 5,
    geometry: M(
      C(0.14, 0.55, [0, 0, -0.3], 10),
      C(0.14, 0.55, [0, 0, 0.3], 10),
      B(0.95, 0.14, 0.16, [0, -0.2, 0], 0.01),
    ),
    material: "cv_055_fitting",
    instances: 18,
    indexed: true,
    instance_layout: "type055.bollards",
    mate: A([0, 0, 0]),
  });

  for (const side of [-1, 1] as const) {
    add({
      id: `${P}surface.mooring_winch_${side === -1 ? "l" : "r"}`,
      name_cn: `系泊绞车 ${side === -1 ? "左" : "右"}`,
      name_en: `mooring winch ${side === -1 ? "l" : "r"}`,
      assembly: "surface",
      build_layer: 5,
      geometry: M(B(1.8, 0.8, 1.4, [0, 0, 0], 0.03), C(0.32, 1.5, [0, 0.1, 0], 16)),
      material: "cv_055_fitting",
      mate: A([side * 4.2, t55DeckTop(-89) + 0.4, -89]),
    });
  }
  for (const [tag, z, sign] of [
    ["jack", 88.6, 1],
    ["flag", -89.4, -1],
  ] as const) {
    add({
      id: `${P}surface.${tag}staff`,
      name_cn: tag === "jack" ? "艏旗杆" : "艉旗杆",
      name_en: tag === "jack" ? "jackstaff" : "flagstaff",
      assembly: "surface",
      build_layer: 5,
      geometry: M(C(0.06, 3.2, [0, 0, 0], 8), C(0.12, 0.16, [0, -1.55, 0], 8)),
      material: "cv_steel",
      mate: A([0, t55DeckTop(z) + 1.6, z]),
    });
    add({
      id: `${P}surface.${tag}flag`,
      name_cn: tag === "jack" ? "海军旗" : "舰尾旗",
      name_en: tag === "jack" ? "naval ensign" : "ensign",
      assembly: "surface",
      build_layer: 5,
      geometry: M(B(1.5, 0.9, 0.02, [0, 0, 0], 0.002)),
      material: "cv_deck_red",
      mate: A([sign * 0.8, t55DeckTop(z) + 2.6, z - sign * 0.05]),
    });
  }
  for (let i = 0; i < 6; i++) {
    add({
      id: `${P}surface.vent_${i + 1}`,
      name_cn: `蘑菇形通风筒 ${i + 1}`,
      name_en: `mushroom vent ${i + 1}`,
      assembly: "surface",
      build_layer: 5,
      geometry: M(C(0.16, 0.6, [0, 0, 0], 10), S(0.34, [0, 0.36, 0], 12)),
      material: "cv_steel",
      mate: A([i < 3 ? -7.2 : 7.2, t55DeckTop(-46 + (i % 3) * 19) + 0.3, -46 + (i % 3) * 19]),
    });
  }

  // 飞行甲板系留点/安全网
  const tieDowns: Array<[number, number]> = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    tieDowns.push([Math.cos(a) * 5.2, T55.HELIPAD_Z + Math.sin(a) * 5.2]);
  }
  ctx.layout("type055.helipadTieDown", ({ index }) => {
    const [x, z] = tieDowns[index]!;
    return new THREE.Matrix4().makeTranslation(x, t55DeckTop(z) + 0.025, z);
  });
  add({
    id: `${P}hangar.tie_down`,
    name_cn: "直升机甲板系留点 ×16",
    name_en: "helipad tie-downs ×16",
    assembly: "hangar",
    build_layer: 5,
    geometry: T(0.18, 0.1, 0.05, [0, 0, 0], 12),
    material: "cv_steel_dark",
    instances: 16,
    indexed: true,
    instance_layout: "type055.helipadTieDown",
    mate: A([0, 0, 0]),
  });

  // 垂发阵列围框（抬高的防浪围板）
  for (const [tag, z0, z1] of [
    ["fwd", 43.15, 53.45],
    ["aft", -52.65, -44.6],
  ] as const) {
    const zc = (z0 + z1) / 2;
    const len = z1 - z0;
    add({
      id: `${P}vls.coaming_${tag}`,
      name_cn: `垂发阵列围板 ${tag}`,
      name_en: `VLS coaming ${tag}`,
      assembly: "vls",
      build_layer: 4,
      geometry: M(
        B(10.8, 0.16, 0.18, [0, 0, -len / 2], 0.006),
        B(10.8, 0.16, 0.18, [0, 0, len / 2], 0.006),
        B(0.18, 0.16, len, [-5.31, 0, 0], 0.006),
        B(0.18, 0.16, len, [5.31, 0, 0], 0.006),
      ),
      material: "cv_steel_dark",
      mate: A([0, t55DeckTop(zc) + 0.08, zc]),
    });
  }

  // 舷侧舷窗（实例族）与艏部舷墙
  const portholeSpots: PanelSpot[] = [];
  for (const side of [-1, 1] as const) {
    for (let i = 0; i < 20; i++) {
      const z = -68 + i * 5.2;
      portholeSpots.push({ x: side * (t55HalfAt(z, 11.8) + 0.02), y: 11.8, z, yaw: side * 90 });
    }
  }
  ctx.layout("type055.portholes", ({ index }) => {
    const spot = portholeSpots[index]!;
    return new THREE.Matrix4()
      .makeTranslation(spot.x, spot.y, spot.z)
      .multiply(new THREE.Matrix4().makeRotationY((spot.yaw * Math.PI) / 180));
  });
  add({
    id: `${P}surface.portholes`,
    name_cn: "舷窗 ×40",
    name_en: "portholes ×40",
    assembly: "surface",
    build_layer: 5,
    geometry: M(T(0.24, 0.15, 0.06, [0, 0, 0], 16), C(0.14, 0.05, [0, 0, 0.03], 16)),
    material: "cv_steel_dark",
    instances: 40,
    indexed: true,
    instance_layout: "type055.portholes",
    mate: A([0, 0, 0]),
  });
  add({
    id: `${P}hull.bulwark`,
    name_cn: "艏部舷墙",
    name_en: "forecastle bulwark",
    assembly: "hull",
    build_layer: 4,
    geometry: { type: "kit", kit: "type055Bulwark" },
    material: "cv_055_hull",
    mate: A([0, 0, 0]),
  });

  // ---------------- 112 单元 VLS ----------------
  ctx.node({ name: "CV_055_VlsHatch", parent: "root", pivot: [0, DECK + 0.06, 0], note: "VLS 井盖阵列" });
  const vlsHatch = (x: number, z: number) =>
    new THREE.Matrix4().makeTranslation(x, t55DeckTop(z) + 0.005, z);
  add({
    id: `${P}vls.hatch`,
    name_cn: "通用垂发井盖 ×106（另 6 格为可开启动态井盖）",
    name_en: "VLS hatch ×106",
    assembly: "vls",
    build_layer: 4,
    geometry: { type: "kit", kit: "type055VlsHatch" },
    material: "cv_vls_hatch",
    instances: 106,
    indexed: true,
    instance_layout: "type055.vlsHatch",
    mate: A([0, 0, 0]),
  });
  add({
    id: `${P}vls.tube`,
    name_cn: "垂发井筒 ×112",
    name_en: "VLS tube ×112",
    assembly: "vls",
    build_layer: 3,
    geometry: M(C(0.46, 4.2, [0, 0, 0], 18), T(0.5, 0.42, 0.12, [0, 1.9, 0], 18)),
    material: "cv_steel_dark",
    instances: 112,
    indexed: true,
    instance_layout: "type055.vlsTube",
    mate: A([0, 0, 0]),
  });
  // 前 64（8×8）+ 后 48（8×6）
  interface VlsCell {
    x: number;
    z: number;
    bank: "fwd" | "aft";
    row: number;
    col: number;
  }
  const vlsCells: VlsCell[] = [];
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++) vlsCells.push({ x: -4.4 + c * 1.25, z: 44 + r * 1.25, bank: "fwd", row: r, col: c });
  for (let r = 0; r < 6; r++)
    for (let c = 0; c < 8; c++) vlsCells.push({ x: -4.4 + c * 1.25, z: -52 + r * 1.25, bank: "aft", row: r, col: c });

  // 首尾各 3 格做成可开启动态井盖 + 冷发射弹，其余 106 格静态井盖；
  // 总格数仍是 112，井筒 112 个全保留。
  const heroSpec = [
    { bank: "fwd" as const, row: 7, col: 2 },
    { bank: "fwd" as const, row: 7, col: 3 },
    { bank: "fwd" as const, row: 7, col: 4 },
    { bank: "aft" as const, row: 0, col: 2 },
    { bank: "aft" as const, row: 0, col: 3 },
    { bank: "aft" as const, row: 0, col: 4 },
  ];
  const heroKey = (bank: string, row: number, col: number) => `${bank}-${row}-${col}`;
  const heroKeys = new Set(heroSpec.map((cell) => heroKey(cell.bank, cell.row, cell.col)));
  const staticCells = vlsCells.filter((cell) => !heroKeys.has(heroKey(cell.bank, cell.row, cell.col)));

  ctx.layout("type055.vlsHatch", ({ index }) => {
    const cell = staticCells[index]!;
    return vlsHatch(cell.x, cell.z);
  });
  ctx.layout("type055.vlsTube", ({ index }) => {
    const cell = vlsCells[index]!;
    return new THREE.Matrix4().makeTranslation(cell.x, 12.0, cell.z);
  });
  ctx.layout("type055.vlsCanister", ({ index }) => {
    const cell = vlsCells[index]!;
    return new THREE.Matrix4().makeTranslation(cell.x, 10.2, cell.z);
  });
  ctx.layout("type055.vlsShockRing", ({ index }) => {
    const cell = vlsCells[index]!;
    return new THREE.Matrix4().makeTranslation(cell.x, 13.7, cell.z);
  });
  ctx.layout("type055.vlsActuator", ({ index }) => {
    const cell = vlsCells[index]!;
    return new THREE.Matrix4().makeTranslation(cell.x + 0.42, t55DeckTop(cell.z) - 0.72, cell.z + 0.42);
  });
  ctx.layout("type055.vlsGasGen", ({ index }) => {
    const cell = vlsCells[index]!;
    return new THREE.Matrix4().makeTranslation(cell.x, 9.35, cell.z);
  });

  // 每格一整套发射筒内部件（实例族），总物理件数按实例计。
  add({
    id: `${P}vls.canister`,
    name_cn: "垂发发射筒 ×112",
    name_en: "VLS canister ×112",
    assembly: "vls",
    build_layer: 3,
    geometry: M(C(0.42, 7.6, [0, 0, 0], 20), T(0.46, 0.38, 0.14, [0, 3.85, 0], 20)),
    material: "cv_steel_dark",
    instances: 112,
    indexed: true,
    instance_layout: "type055.vlsCanister",
    mate: A([0, 0, 0]),
  });
  add({
    id: `${P}vls.shock_ring`,
    name_cn: "发射筒减震环 ×112",
    name_en: "canister shock ring ×112",
    assembly: "vls",
    build_layer: 3,
    geometry: T(0.46, 0.35, 0.16, [0, 0, 0], 20),
    material: "cv_steel",
    instances: 112,
    indexed: true,
    instance_layout: "type055.vlsShockRing",
    mate: A([0, 0, 0]),
  });
  add({
    id: `${P}vls.hatch_actuator`,
    name_cn: "井盖作动筒 ×112",
    name_en: "hatch actuator ×112",
    assembly: "vls",
    build_layer: 3,
    geometry: M(C(0.09, 0.55, [0, 0, 0], 10), C(0.05, 0.4, [0, 0.42, 0], 8)),
    material: "cv_055_fitting",
    instances: 112,
    indexed: true,
    instance_layout: "type055.vlsActuator",
    mate: A([0, 0, 0]),
  });
  add({
    id: `${P}vls.gas_generator`,
    name_cn: "冷发射燃气发生器 ×112",
    name_en: "cold-launch gas generator ×112",
    assembly: "vls",
    build_layer: 3,
    geometry: M(C(0.22, 0.6, [0, 0, 0], 12), T(0.26, 0.12, 0.18, [0, 0.36, 0], 12)),
    material: "cv_steel_dark",
    instances: 112,
    indexed: true,
    instance_layout: "type055.vlsGasGen",
    mate: A([0, 0, 0]),
  });

  // 动态发射格：井盖绕艉侧铰链翻起，导弹冷弹射后再点火。
  for (const spec of heroSpec) {
    const cell = vlsCells.find(
      (item) => item.bank === spec.bank && item.row === spec.row && item.col === spec.col,
    )!;
    const tag = `${cell.bank}_${cell.col}`;
    const deckY = t55DeckTop(cell.z);
    const lidNode = `CV_055_VlsLid_${tag}`;
    ctx.node({
      name: lidNode,
      parent: "root",
      pivot: [cell.x, deckY + 0.045, cell.z - 0.52],
      motion: "rotate",
      axis: "x",
      note: `VLS 井盖 ${tag} 开启`,
    });
    add({
      id: `${P}vls.hatch_hero_${tag}`,
      name_cn: `可开启垂发井盖 ${tag}`,
      name_en: `opening VLS hatch ${tag}`,
      assembly: "vls",
      build_layer: 4,
      geometry: { type: "kit", kit: "type055VlsHatch" },
      material: "cv_vls_hatch",
      node: lidNode,
      mate: A([0, 0, 0.52]),
    });
    const missileNode = `CV_055_VlsMissile_${tag}`;
    ctx.node({
      name: missileNode,
      parent: "root",
      pivot: [cell.x, 10.4, cell.z],
      motion: "translate",
      note: `冷发射导弹 ${tag}`,
    });
    add({
      id: `${P}vls.missile_${tag}`,
      name_cn: `冷发射导弹 ${tag}`,
      name_en: `cold-launch missile ${tag}`,
      assembly: "vls",
      build_layer: 3,
      geometry: { type: "kit", kit: "type055VlsMissile" },
      material: "cv_steel_dark",
      node: missileNode,
      mate: A([0, 0, 0]),
    });
    add({
      id: `${P}vls.flame_${tag}`,
      name_cn: `导弹尾焰 ${tag}`,
      name_en: `missile exhaust ${tag}`,
      assembly: "vls",
      build_layer: 5,
      geometry: { type: "kit", kit: "type055VlsFlame" },
      material: "cv_flame",
      node: missileNode,
      mate: A([0, 0, 0]),
      tags: ["fx"],
    });
  }
  // 阵列框/燃气排导/冷发射燃气发生器
  for (const [tag, z0, rows] of [["fwd", 44, 8], ["aft", -52, 6]] as const) {
    const len = rows * 1.25;
    add({
      id: `${P}vls.frame_${tag}`,
      name_cn: `垂发阵列框架 ${tag}`,
      name_en: `VLS frame ${tag}`,
      assembly: "vls",
      build_layer: 3,
      geometry: M(
        B(10.2, 0.18, 0.16, [0, 0, 0], 0.006),
        B(10.2, 0.18, 0.16, [0, 0, len], 0.006),
        B(0.16, 0.18, len, [-5.02, 0, len / 2], 0.006),
        B(0.16, 0.18, len, [5.02, 0, len / 2], 0.006),
        B(10.2, 0.18, 0.16, [0, 0, len / 2], 0.006),
      ),
      material: "cv_steel_dark",
      mate: A([0, 9.9, z0]),
    });
    add({
      id: `${P}vls.gas_vent_${tag}`,
      name_cn: `燃气排导道 ${tag}`,
      name_en: `gas exhaust duct ${tag}`,
      assembly: "vls",
      build_layer: 3,
      geometry: M(B(1.1, 0.6, len + 1, [0, 0, 0], 0.02)),
      material: "cv_steel_dark",
      mate: A([0, 12.2, z0 + len / 2]),
    });
  }
  for (let i = 0; i < 12; i++) {
    add({
      id: `${P}vls.cold_generator_${pad(i + 1)}`,
      name_cn: `冷发射燃气发生器 ${i + 1}`,
      name_en: `cold launch generator ${i + 1}`,
      assembly: "vls",
      build_layer: 3,
      geometry: M(C(0.2, 0.75, [0, 0, 0], 12), C(0.08, 0.3, [0, 0.5, 0], 8)),
      material: "cv_steel",
      mate: A([-4.8 + (i % 4) * 3.2, 10.2, i < 6 ? 54.5 : -51.5]),
    });
  }

  // ---------------- 主炮 ----------------
  ctx.node({ name: "CV_055_Gun", parent: "root", pivot: [0, t55DeckTop(T55.GUN_Z), T55.GUN_Z], motion: "rotate", axis: "y", note: "130mm 炮塔旋回" });
  ctx.node({ name: "CV_055_GunBarrel", parent: "CV_055_Gun", pivot: [0, 1.35, 1.3], motion: "rotate", axis: "x", note: "130mm 身管俯仰" });
  add({
    id: `${P}gun.turret`,
    name_cn: "130mm 隐身炮塔",
    name_en: "130mm stealth turret",
    assembly: "weapons",
    build_layer: 4,
    geometry: { type: "kit", kit: "type055GunTurret" },
    material: "cv_055_hull",
    node: "CV_055_Gun",
    mate: A([0, 0, 0]),
  });
  add({
    id: `${P}gun.barrel`,
    name_cn: "130mm 身管",
    name_en: "130mm gun barrel",
    assembly: "weapons",
    build_layer: 4,
    geometry: M(C(0.17, 8.2, [0, 0, 0], 18), C(0.24, 0.5, [0, -3.7, 0], 18), C(0.22, 0.7, [0, 4.4, 0], 18)),
    material: "cv_steel_dark",
    node: "CV_055_GunBarrel",
    mate: A([0, 0.3, 3.7], [90, 0, 0]),
  });
  add({
    id: `${P}gun.mount`,
    name_cn: "炮座/旋回轴承",
    name_en: "gun mount ring",
    assembly: "weapons",
    build_layer: 3,
    geometry: M(T(2.2, 1.8, 0.35, [0, 0, 0], 24), C(2.0, 0.16, [0, -0.2, 0], 24)),
    material: "cv_steel_dark",
    node: "CV_055_Gun",
    mate: A([0, 0.15, 0]),
  });
  add({
    id: `${P}gun.hoist`,
    name_cn: "甲板下扬弹机",
    name_en: "underdeck ammunition hoist",
    assembly: "weapons",
    build_layer: 2,
    geometry: M(C(0.75, 9.0, [0, 0, 0], 20), T(0.85, 0.7, 0.3, [0, 4.3, 0], 20)),
    material: "cv_steel",
    mate: A([0, 9.6, T55.GUN_Z]),
  });
  add({
    id: `${P}gun.magazine`,
    name_cn: "130mm 弹药库",
    name_en: "130mm magazine",
    assembly: "weapons",
    build_layer: 2,
    geometry: M(B(4.4, 3.6, 8.0, [0, 0, 0], 0.03)),
    material: "cv_hull_dark",
    mate: A([0, 5.0, T55.GUN_Z - 8]),
  });
  for (let i = 0; i < 16; i++) {
    add({
      id: `${P}gun.shell_${pad(i + 1)}`,
      name_cn: `130mm 炮弹 ${i + 1}`,
      name_en: `130mm shell ${i + 1}`,
      assembly: "weapons",
      build_layer: 2,
      geometry: M(C(0.08, 1.0, [0, 0, 0], 12), C(0.1, 0.12, [0, 0.5, 0], 12)),
      material: "cv_brass",
      mate: A([-1.5 + (i % 4) * 0.9, 5.6, T55.GUN_Z - 10.5 + Math.floor(i / 4) * 1.4]),
    });
  }

  // ---------------- 近防/导弹 ----------------
  for (const [tag, z, y] of [["fwd", 35, DECK + 7.7], ["aft", -58, DECK + 6.7]] as const) {
    ctx.node({ name: `CV_055_Ciws_${tag}`, parent: "root", pivot: [0, y, z], motion: "rotate", axis: "y", rest_rotation: [0, tag === "aft" ? 180 : 0, 0], note: `1130 近防 ${tag}` });
    add({
      id: `${P}ciws.${tag}_base`,
      name_cn: `1130 近防基座 ${tag}`,
      name_en: `CIWS base ${tag}`,
      assembly: "weapons",
      build_layer: 4,
      geometry: M(C(0.9, 0.5, [0, 0, 0], 20), B(1.9, 0.16, 1.9, [0, -0.25, 0], 0.01)),
      material: "cv_steel_dark",
      mate: A([0, y - 0.15, z]),
    });
    add({
      id: `${P}ciws.${tag}_turret`,
      name_cn: `1130 近防炮塔 ${tag}`,
      name_en: `CIWS turret ${tag}`,
      assembly: "weapons",
      build_layer: 4,
      geometry: M(C(0.75, 0.9, [0, 0, 0], 20), B(0.9, 0.6, 1.1, [0, 0.4, 0.1], 0.03), S(0.38, [0, 0.9, -0.25], 20)),
      material: "cv_055_hull",
      node: `CV_055_Ciws_${tag}`,
      mate: A([0, 0.45, 0]),
    });
    const barrels: Array<Parameters<typeof M>[0]> = [];
    for (let b = 0; b < 11; b++) {
      const a = (b / 11) * Math.PI * 2;
      const x = Math.cos(a) * 0.16;
      const y = Math.sin(a) * 0.16;
      barrels.push({ type: "weld", from: [x, y, 0], to: [x, y, 1.7], radius: 0.035 });
    }
    add({
      id: `${P}ciws.${tag}_barrels`,
      name_cn: `1130 十一管 ${tag}`,
      name_en: `1130 barrels ${tag}`,
      assembly: "weapons",
      build_layer: 4,
      geometry: M(...barrels, C(0.22, 0.3, [0, 0, 0.45], 16)),
      material: "cv_steel_dark",
      node: `CV_055_Ciws_${tag}`,
      mate: A([0, 0.8, 0]),
    });
  }
  for (const [tag, z] of [["fwd", 42], ["aft", -62]] as const) {
    add({
      id: `${P}weapons.hhq10_${tag}`,
      name_cn: `红旗-10 发射装置 ${tag}`,
      name_en: `HHQ-10 launcher ${tag}`,
      assembly: "weapons",
      build_layer: 4,
      geometry: M(B(2.2, 1.5, 1.4, [0, 0, 0], 0.04), B(1.9, 1.2, 0.1, [0, 0, 0.72], 0.02)),
      material: "cv_055_hull",
      mate: A([0, tag === "fwd" ? DECK + 0.75 : DECK + 7.15, z], [0, tag === "fwd" ? 180 : 0, 0]),
    });
    for (let i = 0; i < 12; i++) {
      add({
        id: `${P}weapons.hhq10_tube_${tag}_${pad(i + 1)}`,
        name_cn: `红旗-10 发射管 ${tag} ${i + 1}`,
        name_en: `HHQ-10 tube ${tag} ${i + 1}`,
        assembly: "weapons",
        build_layer: 4,
        geometry: M(C(0.13, 0.24, [0, 0, 0], 10)),
        material: "cv_steel_dark",
        mate: A([-0.75 + (i % 4) * 0.5, (tag === "fwd" ? DECK + 0.75 : DECK + 7.15) + (Math.floor(i / 4) - 1) * 0.38, z + (tag === "fwd" ? 0.72 : -0.72)]),
      });
    }
  }

  // ---------------- 鱼雷发射管 ----------------
  for (const side of [-1, 1] as const) {
    for (let i = 0; i < 3; i++) {
      add({
        id: `${P}weapons.torpedo_tube_${side === -1 ? "l" : "r"}_${i + 1}`,
        name_cn: `三联装鱼雷发射管 ${side === -1 ? "左" : "右"} ${i + 1}`,
        name_en: `torpedo tube ${side === -1 ? "l" : "r"} ${i + 1}`,
        assembly: "weapons",
        build_layer: 4,
        geometry: M(C(0.34, 4.4, [0, 0, 0], 16), T(0.37, 0.3, 0.22, [0, 2.2, 0], 16)),
        material: "cv_steel_dark",
        mate: A([side * (6.3 + i * 0.65), DECK + 0.42, -12], [90, 0, 0]),
      });
    }
    add({
      id: `${P}weapons.torpedo_mount_${side === -1 ? "l" : "r"}`,
      name_cn: `鱼雷发射管基座 ${side === -1 ? "左" : "右"}`,
      name_en: `torpedo mount ${side === -1 ? "l" : "r"}`,
      assembly: "weapons",
      build_layer: 4,
      geometry: M(B(2.4, 0.22, 4.8, [0, 0, 0], 0.01)),
      material: "cv_steel_dark",
      mate: A([side * 6.95, DECK + 0.12, -12]),
    });
  }

  // ---------------- 机库/直升机甲板 ----------------
  add({
    id: `${P}hangar.deck`,
    name_cn: "直升机甲板",
    name_en: "helipad",
    assembly: "hangar",
    build_layer: 4,
    geometry: { type: "kit", kit: "type055Helipad" },
    material: "cv_deck_line",
    mate: A([0, t55DeckTop(T55.HELIPAD_Z) + 0.09, T55.HELIPAD_Z]),
  });
  add({
    id: `${P}hangar.helipad_disc`,
    name_cn: "直升机甲板防滑圆盘",
    name_en: "helipad non-skid disc",
    assembly: "hangar",
    build_layer: 4,
    geometry: M(C(6.8, 0.05, [0, 0, 0], 48)),
    material: "cv_runway",
    mate: A([0, t55DeckTop(T55.HELIPAD_Z) + 0.02, T55.HELIPAD_Z]),
  });
  for (const side of [-1, 1] as const) {
    add({
      id: `${P}hangar.door_${side === -1 ? "l" : "r"}`,
      name_cn: `机库门 ${side === -1 ? "左" : "右"}`,
      name_en: `hangar door ${side === -1 ? "l" : "r"}`,
      assembly: "hangar",
      build_layer: 4,
      geometry: M(B(5.2, 4.6, 0.18, [0, 0, 0], 0.01)),
      material: "cv_steel_dark",
      mate: A([side * 2.9, t55DeckTop(-72.1) + 2.3, -72.1]),
    });
  }
  add({
    id: `${P}hangar.traverse`,
    name_cn: "直升机牵引轨道",
    name_en: "helicopter traverse rail",
    assembly: "hangar",
    build_layer: 4,
    geometry: M(B(0.16, 0.06, 16, [-2.4, 0, 0], 0.004), B(0.16, 0.06, 16, [2.4, 0, 0], 0.004)),
    material: "cv_steel_dark",
    mate: A([0, t55DeckTop(-80) + 0.04, -80]),
  });

  // ---------------- 动力：4 燃 + 并车齿轮 + 双轴双桨 ----------------
  const turbineZ = [-28, -36, -28, -36];
  const turbineX = [-3.4, -3.4, 3.4, 3.4];
  for (let t = 0; t < 4; t++) {
    const x = turbineX[t]!;
    const z = turbineZ[t]!;
    add({
      id: `${P}power.turbine_${t + 1}_casing`,
      name_cn: `QC-280 燃气轮机 ${t + 1} 机匣`,
      name_en: `gas turbine ${t + 1} casing`,
      assembly: "propulsion",
      build_layer: 1,
      geometry: M(C(1.25, 6.4, [0, 0, 0], 20), C(0.85, 1.2, [0, 3.1, 0], 18), B(2.6, 0.2, 6.8, [0, -1.1, 0], 0.02)),
      material: "cv_steel_dark",
      mate: A([x, 6.0, z], [90, 0, 0]),
    });
    for (let s = 0; s < 6; s++) {
      add({
        id: `${P}power.turbine_${t + 1}_comp_${s + 1}`,
        name_cn: `燃气轮机 ${t + 1} 压气机级 ${s + 1}`,
        name_en: `turbine ${t + 1} compressor stage ${s + 1}`,
        assembly: "propulsion",
        build_layer: 1,
        geometry: M(C(0.72, 0.1, [0, 0, 0], 20)),
        material: "cv_steel",
        mate: A([x, 6.0, z - 2.4 + s * 0.42], [90, 0, 0]),
      });
    }
    add({
      id: `${P}power.turbine_${t + 1}_combustor`,
      name_cn: `燃气轮机 ${t + 1} 燃烧室`,
      name_en: `turbine ${t + 1} combustor`,
      assembly: "propulsion",
      build_layer: 1,
      geometry: M(T(1.1, 0.8, 0.55, [0, 0, 0], 24), C(0.5, 0.4, [0, 0.5, 0], 16)),
      material: "cv_steel_dark",
      mate: A([x, 6.0, z + 0.5], [90, 0, 0]),
    });
    add({
      id: `${P}power.turbine_${t + 1}_power_turbine`,
      name_cn: `燃气轮机 ${t + 1} 动力涡轮`,
      name_en: `turbine ${t + 1} power turbine`,
      assembly: "propulsion",
      build_layer: 1,
      geometry: M(C(0.95, 0.9, [0, 0, 0], 20), C(0.7, 0.18, [0, 0.1, 0], 18)),
      material: "cv_steel",
      mate: A([x, 6.0, z + 1.9], [90, 0, 0]),
    });
  }
  for (const side of [-1, 1] as const) {
    add({
      id: `${P}power.gearbox_${side === -1 ? "l" : "r"}`,
      name_cn: `并车减速齿轮箱 ${side === -1 ? "左" : "右"}`,
      name_en: `COGAG combining gearbox ${side === -1 ? "l" : "r"}`,
      assembly: "propulsion",
      build_layer: 1,
      geometry: M(B(2.4, 2.2, 3.6, [0, 0, 0], 0.03), T(0.8, 0.5, 0.4, [0, 0, 1.9], 20)),
      material: "cv_steel_dark",
      mate: A([side * 3.0, 5.6, -43]),
    });
    add({
      id: `${P}power.shaft_${side === -1 ? "l" : "r"}`,
      name_cn: `主轴 ${side === -1 ? "左" : "右"}`,
      name_en: `propeller shaft ${side === -1 ? "l" : "r"}`,
      assembly: "propulsion",
      build_layer: 1,
      geometry: M(C(0.28, 52, [0, 0, 0], 16)),
      material: "cv_steel",
      mate: A([side * T55.SHAFT_X, 4.8, -68], [90, 0, 0]),
    });
    add({
      id: `${P}power.propeller_${side === -1 ? "l" : "r"}`,
      name_cn: `五叶可调距螺旋桨 ${side === -1 ? "左" : "右"}`,
      name_en: `five-blade propeller ${side === -1 ? "l" : "r"}`,
      assembly: "propulsion",
      build_layer: 1,
      geometry: { type: "kit", kit: "type055Propeller" },
      material: "cv_brass",
      node: side === -1 ? "CV_055_PropL" : "CV_055_PropR",
      mate: A([0, 0, 0]),
    });
    ctx.node({ name: side === -1 ? "CV_055_PropL" : "CV_055_PropR", parent: "root", pivot: [side * T55.SHAFT_X, 4.8, -92.5], motion: "rotate", axis: "z", note: `螺旋桨 ${side === -1 ? "左" : "右"}` });
    add({
      id: `${P}power.rudder_${side === -1 ? "l" : "r"}`,
      name_cn: `舵 ${side === -1 ? "左" : "右"}`,
      name_en: `rudder ${side === -1 ? "l" : "r"}`,
      assembly: "propulsion",
      build_layer: 1,
      geometry: M(B(0.18, 3.4, 1.6, [0, 0, 0], 0.03), C(0.18, 1.2, [0, 1.8, 0], 12)),
      material: "cv_steel_dark",
      mate: A([side * 2.2, 3.3, -90.3]),
    });
  }

  // ---------------- 舰桥/CIC/机舱内部 ----------------
  const consoleAt = (x: number, y: number, z: number, tag: string) => {
    add({
      id: `${P}interior.console_${tag}`,
      name_cn: `显控台 ${tag}`,
      name_en: `console ${tag}`,
      assembly: "interior",
      build_layer: 2,
      geometry: M(B(1.4, 0.9, 0.8, [0, 0, 0], 0.02), B(1.3, 0.06, 0.7, [0, 0.5, -0.05], 0.006), B(0.9, 0.5, 0.06, [0, 0.75, -0.3], 0.004)),
      material: "cv_hull_dark",
      mate: A([x, y, z]),
    });
    add({
      id: `${P}interior.screen_${tag}`,
      name_cn: `显控屏 ${tag}`,
      name_en: `screen ${tag}`,
      assembly: "interior",
      build_layer: 2,
      geometry: M(B(0.9, 0.48, 0.03, [0, 0, 0], 0.002)),
      material: "cv_screen",
      mate: A([x, y + 0.75, z - 0.28]),
    });
  };
  for (let i = 0; i < 6; i++) consoleAt(-4.6 + i * 1.8, DECK + 7.9, 27, `bridge_${i + 1}`);
  for (let i = 0; i < 8; i++) consoleAt(-5.0 + (i % 4) * 2.5, DECK + 6.91, 14 + Math.floor(i / 4) * 4, `cic_${i + 1}`);
  add({
    id: `${P}interior.bridge_floor`,
    name_cn: "舰桥地板",
    name_en: "bridge floor",
    assembly: "interior",
    build_layer: 2,
    geometry: M(B(10.0, 0.12, 14, [0, 0, 0], 0.01)),
    material: "cv_deck_plate",
    mate: A([0, DECK + 7.4, 26]),
  });
  add({
    id: `${P}interior.cic_floor`,
    name_cn: "CIC 地板",
    name_en: "CIC floor",
    assembly: "interior",
    build_layer: 2,
    geometry: M(B(11.0, 0.12, 20, [0, 0, 0], 0.01)),
    material: "cv_deck_plate",
    mate: A([0, DECK + 6.4, 18]),
  });

  // ---------------- 表面：锚/救生/舷号 ----------------
  for (const side of [-1, 1] as const) {
    const hullX = t55HalfAt(78, 10.5);
    add({
      id: `${P}surface.anchor_${side === -1 ? "l" : "r"}`,
      name_cn: `锚 ${side === -1 ? "左" : "右"}`,
      name_en: `anchor ${side === -1 ? "l" : "r"}`,
      assembly: "surface",
      build_layer: 5,
      geometry: M(C(0.1, 1.3, [0, 0, 0], 10), B(1.1, 0.16, 0.14, [0, 0.5, 0], 0.02), B(0.5, 0.42, 0.12, [-0.42, -0.62, 0], 0.02), B(0.5, 0.42, 0.12, [0.42, -0.62, 0], 0.02), T(0.18, 0.1, 0.16, [0, 0.86, 0], 12)),
      material: "cv_055_fitting",
      mate: A([side * (hullX + 0.08), 11.0, 79], [0, side * 90, 0]),
    });
    add({
      id: `${P}surface.hawse_${side === -1 ? "l" : "r"}`,
      name_cn: `锚链孔 ${side === -1 ? "左" : "右"}`,
      name_en: `hawse ${side === -1 ? "l" : "r"}`,
      assembly: "surface",
      build_layer: 5,
      geometry: M(T(0.42, 0.28, 0.18, [0, 0, 0], 18)),
      material: "cv_hull_dark",
      mate: A([side * (hullX - 0.02), 11.4, 77.6], [0, 0, 90]),
    });
  }
  add({
    id: `${P}surface.bow_breakwater`,
    name_cn: "艏部挡浪板",
    name_en: "bow breakwater",
    assembly: "surface",
    build_layer: 4,
    geometry: M(B(7.2, 0.9, 0.2, [0, 0, 0], 0.02)),
    material: "cv_steel_dark",
    mate: A([0, t55DeckTop(60) + 0.45, 60], [-18, 0, 0]),
  });
  for (let i = 0; i < 20; i++) {
    const z = -70 + Math.floor(i / 2) * 2.2;
    add({
      id: `${P}surface.life_raft_${pad(i + 1)}`,
      name_cn: `救生筏 ${i + 1}`,
      name_en: `life raft ${i + 1}`,
      assembly: "surface",
      build_layer: 5,
      geometry: M(C(0.5, 0.8, [0, 0, 0], 16), B(1.2, 0.1, 0.16, [0, 0.45, 0], 0.01)),
      material: "cv_canvas",
      mate: A([(i % 2 === 0 ? -1 : 1) * (t55DeckHalf(z) - 0.45), t55DeckTop(z) + 0.4, z]),
    });
  }
  // 舷号/舰名标牌后续按真实字体补充（不用方块拼数字）。

  const staticOnly = (family: string, a: string, b: string, reason: string, maxDepthMm = 900): ExpectedContactRule => ({
    family,
    a,
    b,
    reason,
    maxDepthMm,
    allowDisplaced: true,
    allowSuspect: true,
    staticOnly: true,
  });

  const contacts: ExpectedContactRule[] = [
    staticOnly("t55-hull-self", "type055.hull.*", "type055.hull.*", "舰体骨架/外板/舱壁/肋板焊接搭接", 2600),
    staticOnly("t55-hull-deck", "type055.hull.*", "type055.deck.*", "主甲板与舰体搭接", 200),
    staticOnly("t55-super-deck", "type055.super.*", "type055.deck.*", "上层建筑与甲板安装", 120),
    staticOnly("t55-super-self", "type055.super.*", "type055.super.*", "上层建筑/烟囱/舰桥安装"),
    staticOnly("t55-radar-super", "type055.radar.*", "type055.super.*", "相控阵/桅杆与上建安装", 150),
    staticOnly("t55-radar-self", "type055.radar.*", "type055.radar.*", "阵面/天线/安装框装配"),
    staticOnly("t55-vls-deck", "type055.vls.*", "type055.deck.*", "VLS 井口/框架与甲板安装", 150),
    staticOnly("t55-vls-self", "type055.vls.*", "type055.vls.*", "井筒/井盖/框架/燃气排导安装"),
    staticOnly("t55-weapons-deck", "type055.weapons.*", "type055.deck.*", "主炮/近防/导弹/鱼雷与甲板安装", 150),
    staticOnly("t55-weapons-super", "type055.weapons.*", "type055.super.*", "近防/导弹与上建安装", 120),
    staticOnly("t55-weapons-self", "type055.weapons.*", "type055.weapons.*", "炮塔/身管/扬弹机/发射管装配"),
    staticOnly("t55-hangar-deck", "type055.hangar.*", "type055.deck.*", "机库/直升机甲板与甲板安装", 120),
    staticOnly("t55-hangar-super", "type055.hangar.*", "type055.super.*", "机库与上建安装"),
    staticOnly("t55-power-hull", "type055.power.*", "type055.hull.*", "燃气轮机/齿轮箱/轴系与舰体安装", 1200),
    staticOnly("t55-power-self", "type055.power.*", "type055.power.*", "COGAG 机组/齿轮箱/轴系/桨舵装配"),
    staticOnly("t55-interior-hull", "type055.interior.*", "type055.hull.*", "舱室设备与舰体安装"),
    staticOnly("t55-interior-super", "type055.interior.*", "type055.super.*", "舰桥/CIC 设备与上建安装", 1500),
    staticOnly("t55-interior-self", "type055.interior.*", "type055.interior.*", "显控台/地板/座椅装配"),
    staticOnly("t55-gun-deck", "type055.gun.*", "type055.deck.*", "主炮炮座/弹药库与甲板安装", 400),
    staticOnly("t55-gun-hull", "type055.gun.*", "type055.hull.*", "扬弹机/弹药库与舰体安装", 700),
    staticOnly("t55-gun-self", "type055.gun.*", "type055.gun.*", "炮塔/身管/炮座/扬弹机装配", 400),
    staticOnly("t55-ciws-super", "type055.ciws.*", "type055.super.*", "近防炮与上建安装", 300),
    staticOnly("t55-ciws-self", "type055.ciws.*", "type055.ciws.*", "近防炮塔/炮管/基座装配", 300),
    staticOnly("t55-vls-hull", "type055.vls.*", "type055.hull.*", "VLS 井筒/框架与舰体结构安装", 400),
    staticOnly("t55-deck-self", "type055.deck.*", "type055.deck.*", "甲板铺板/栏杆/立柱安装", 80),
    staticOnly("t55-hangar-self", "type055.hangar.*", "type055.hangar.*", "机库/直升机甲板/牵引轨道安装", 120),
    staticOnly("t55-surface-hull", "type055.surface.*", "type055.hull.*", "锚/栏杆/救生设备与舰体安装", 150),
    staticOnly("t55-surface-deck", "type055.surface.*", "type055.deck.*", "舷号/栏杆/救生设备与甲板安装", 100),
    staticOnly("t55-surface-self", "type055.surface.*", "type055.surface.*", "栏杆/救生筏/锚/锚链孔装配", 90),
  ];

  const registry: ModelRegistry = {
    model: "type055",
    title: "055 型驱逐舰",
    subtitle: "112 单元 VLS · 346B 四面阵 · 130mm 主炮 · COGAG 四燃双轴",
    source_notes: "公开资料：舰长约 180m、舷宽约 20m、吃水约 6.6m；112 VLS（前 64 + 后 48）。1 单位 = 1 米。",
    constants: T55_CONSTANTS,
    assemblies: [
      { id: "hull", name_cn: "舰体结构", name_en: "hull", explode: [0, 0, 0] },
      { id: "deck", name_cn: "主甲板", name_en: "deck", explode: [0, 16, 0] },
      { id: "superstructure", name_cn: "上层建筑", name_en: "superstructure", explode: [0, 24, 0] },
      { id: "radar", name_cn: "雷达/桅杆", name_en: "radar", explode: [0, 32, 0] },
      { id: "vls", name_cn: "垂直发射系统", name_en: "VLS", explode: [0, 8, 0] },
      { id: "weapons", name_cn: "武器系统", name_en: "weapons", explode: [0, 20, 0] },
      { id: "hangar", name_cn: "机库/航空", name_en: "hangar", explode: [0, 14, 0] },
      { id: "propulsion", name_cn: "COGAG 动力", name_en: "propulsion", explode: [0, -8, 0] },
      { id: "interior", name_cn: "舱室内设", name_en: "interior", explode: [0, 10, 0] },
      { id: "surface", name_cn: "表面附件", name_en: "surface", explode: [0, 6, 0] },
    ],
    nodes: ctx.nodes,
    materials: CV_MATERIALS,
    parts: ctx.parts,
    expectedContacts: contacts,
  };
  return { registry, layouts: ctx.layouts };
}

let cached: { registry: ModelRegistry; layouts: Record<string, InstanceLayout> } | null = null;

export function makeType055Registry(): ModelRegistry {
  cached ??= buildType055Once();
  return cached.registry;
}

export function makeType055Layouts(): Record<string, InstanceLayout> {
  cached ??= buildType055Once();
  return cached.layouts;
}

export const TYPE055_BUILDERS = {
  type055HullShell,
  type055HullUnderwater,
  type055Deck,
  type055DeckDashes,
  type055DeckUnderside,
  type055DeckWalkLines,
  type055Frustum,
  type055AesaPanel,
  type055Propeller,
  type055Rhib,
  type055Helipad,
  type055GunTurret,
  type055BootTop,
  type055BulbousBow,
  type055Bulwark,
  type055HullNumber,
  type055VlsHatch,
  type055VlsMissile,
  type055VlsFlame,
};
