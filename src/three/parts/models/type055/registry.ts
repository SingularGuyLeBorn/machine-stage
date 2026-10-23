import * as THREE from "three";
import type { InstanceLayout } from "../../assembler/assembler";
import type { ExpectedContactRule, ModelRegistry } from "../../registry/types";
import { A, B, C, M, S, T, carrierContext, pad } from "../carrier/common";
import { CV_MATERIALS } from "../carrier/materials";
import { addZ20 } from "./helicopter";
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
  type055BridgeShell,
  type055GasTurbineStatic,
  type055GasTurbineRotor,
  type055HangarShell,
  type055Helipad,
  type055HullNumber,
  type055HullShell,
  type055HullUnderwater,
  type055Propeller,
  type055Rhib,
  type055Rudder,
  type055Stabilizer,
  type055Hhq9bFins,
  type055Hhq9bMissile,
  type055Hhq9bNose,
  type055MissileNozzle,
  type055VlsCanister,
  type055VlsFlame,
  type055VlsGasCloud,
  type055VlsHatch,
  type055VlsLiner,
  type055VlsTube,
  type055Yj18Fins,
  type055Yj18Missile,
  type055Yj18Nose,
  type055Yj21BoosterFins,
  type055Yj21Glider,
  type055Yj21GliderFins,
  type055Yj21Missile,
  type055Yj21Nose,
} from "./kits";
import { MISSILES, VLS, VLS_HEROES, missileRestY, vlsCells } from "./vls";

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

  // 减摇鳍/海水门/牺牲阳极
  for (const side of [-1, 1] as const) {
    add({
      id: `${P}hull.stabilizer_${side === -1 ? "l" : "r"}`,
      name_cn: `减摇鳍 ${side === -1 ? "左" : "右"}`,
      name_en: `stabilizer fin ${side === -1 ? "l" : "r"}`,
      assembly: "hull",
      build_layer: 1,
      geometry: { type: "kit", kit: "type055Stabilizer" },
      material: "cv_055_fitting",
      mate: A([side * t55HalfAt(-12, 4.5), 4.5, -12], [0, side === -1 ? 180 : 0, 0]),
    });
    for (const [i, z] of [-28, -44].entries()) {
      add({
        id: `${P}hull.sea_chest_${side === -1 ? "l" : "r"}_${i + 1}`,
        name_cn: `海水门 ${side === -1 ? "左" : "右"} ${i + 1}`,
        name_en: `sea chest ${side === -1 ? "l" : "r"} ${i + 1}`,
        assembly: "hull",
        build_layer: 1,
        geometry: M(
          B(0.9, 0.08, 1.6, [0, 0, 0], 0.01),
          B(0.7, 0.04, 0.12, [0, 0.05, -0.5], 0.004),
          B(0.7, 0.04, 0.12, [0, 0.05, -0.25], 0.004),
          B(0.7, 0.04, 0.12, [0, 0.05, 0], 0.004),
          B(0.7, 0.04, 0.12, [0, 0.05, 0.25], 0.004),
          B(0.7, 0.04, 0.12, [0, 0.05, 0.5], 0.004),
        ),
        material: "cv_grate",
        mate: A([side * (t55HalfAt(z, 4.2) + 0.02), 4.2, z], [0, side * 90, 0]),
      });
    }
  }
  const anodeSpots: Array<[number, number, number]> = [];
  for (const side of [-1, 1] as const) {
    for (let i = 0; i < 7; i++) {
      const z = -78 + i * 19;
      anodeSpots.push([side * (t55HalfAt(z, 5.7) + 0.03), 5.7, z, ]);
    }
  }
  ctx.layout("type055.anodes", ({ index }) => {
    const [x, y, z] = anodeSpots[index]!;
    const side = x < 0 ? -1 : 1;
    return new THREE.Matrix4()
      .makeTranslation(x, y, z)
      .multiply(new THREE.Matrix4().makeRotationY((side * 90 * Math.PI) / 180));
  });
  add({
    id: `${P}hull.anodes`,
    name_cn: "牺牲阳极 ×14",
    name_en: "sacrificial anodes ×14",
    assembly: "hull",
    build_layer: 5,
    geometry: M(B(0.12, 0.34, 0.28, [0, 0, 0], 0.01), C(0.06, 0.06, [0, 0.12, 0], 8)),
    material: "cv_055_fitting",
    instances: 14,
    indexed: true,
    instance_layout: "type055.anodes",
    mate: A([0, 0, 0]),
  });

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
    geometry: { type: "kit", kit: "type055BridgeShell" },
    material: "cv_055_hull",
    mate: A([0, DECK + 7.4, 26]),
    source: "空腔舰桥壳：正面窗洞 + 透明前窗，内部显控台可从第一人称看到。",
  });
  add({
    id: `${P}super.hangar_block`,
    name_cn: "双机库上层建筑",
    name_en: "hangar block",
    assembly: "hangar",
    build_layer: 4,
    geometry: { type: "kit", kit: "type055HangarShell" },
    material: "cv_055_hull",
    mate: A([0, t55DeckTop(-63), -63]),
    source: "双机库壳体（左右壁 + 顶盖 + 前壁，艉端敞开装卷帘门）；内部可见。",
  });
  add({
    id: `${P}super.mast_base`,
    name_cn: "综合桅杆下段",
    name_en: "integrated mast lower tier",
    assembly: "radar",
    build_layer: 4,
    geometry: { type: "kit", kit: "type055Frustum", params: { w0: 6.0, d0: 8.6, w1: 5.0, d1: 7.2, h: 4.0 } },
    material: "cv_055_hull",
    mate: A([0, DECK + 12.9, 20]),
  });
  add({
    id: `${P}super.mast_mid`,
    name_cn: "综合桅杆中段",
    name_en: "integrated mast middle tier",
    assembly: "radar",
    build_layer: 4,
    geometry: { type: "kit", kit: "type055Frustum", params: { w0: 5.0, d0: 7.2, w1: 3.6, d1: 5.4, h: 4.5 } },
    material: "cv_055_hull",
    mate: A([0, DECK + 16.9, 20]),
  });
  add({
    id: `${P}super.mast_top`,
    name_cn: "综合桅杆上段",
    name_en: "integrated mast upper tier",
    assembly: "radar",
    build_layer: 4,
    geometry: { type: "kit", kit: "type055Frustum", params: { w0: 3.6, d0: 5.4, w1: 2.2, d1: 3.8, h: 4.5 } },
    material: "cv_055_hull",
    mate: A([0, DECK + 21.4, 20]),
  });
  add({
    id: `${P}super.mast_platform_1`,
    name_cn: "综合桅杆中层平台",
    name_en: "mast middle platform",
    assembly: "radar",
    build_layer: 4,
    geometry: M(B(5.4, 0.16, 7.6, [0, 0, 0], 0.02)),
    material: "cv_steel_dark",
    mate: A([0, DECK + 16.85, 20]),
  });
  add({
    id: `${P}super.mast_platform_2`,
    name_cn: "综合桅杆上层平台",
    name_en: "mast upper platform",
    assembly: "radar",
    build_layer: 4,
    geometry: M(B(4.0, 0.16, 5.8, [0, 0, 0], 0.02)),
    material: "cv_steel_dark",
    mate: A([0, DECK + 21.35, 20]),
  });
  // 舰桥前窗（透明，第一人称可看出去）+ 两侧暗玻璃带
  add({
    id: `${P}super.bridge_glass_front`,
    name_cn: "舰桥前窗",
    name_en: "bridge front window",
    assembly: "superstructure",
    build_layer: 4,
    geometry: M(B(6.8, 2.3, 0.05, [0, 0, 0], 0.004)),
    material: "cv_bridge_glass",
    mate: A([0, DECK + 9.6, 33.04], [-12.8, 0, 0]),
  });
  for (const side of [-1, 1] as const) {
    add({
      id: `${P}super.bridge_glass_${side === -1 ? "l" : "r"}`,
      name_cn: `舰桥侧窗 ${side === -1 ? "左" : "右"}`,
      name_en: `bridge side window ${side === -1 ? "l" : "r"}`,
      assembly: "superstructure",
      build_layer: 4,
      geometry: M(B(0.06, 0.9, 7.0, [0, 0, 0], 0.004)),
      material: "cv_glass",
      mate: A([side * 4.52, DECK + 9.6, 26.3]),
    });
  }
  // 舰桥顶灯
  for (const [i, zz] of [24, 28].entries()) {
    add({
      id: `${P}super.bridge_light_${i + 1}`,
      name_cn: `舰桥顶灯 ${i + 1}`,
      name_en: `bridge ceiling light ${i + 1}`,
      assembly: "superstructure",
      build_layer: 5,
      geometry: M(B(2.4, 0.05, 0.2, [0, 0, 0], 0.004)),
      material: "cv_glow",
      mate: A([0, DECK + 12.7, zz]),
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
  // 烟囱：055 是低矮内埋式排气口，不是高耸的塔状烟囱；上建顶只露出约 2.4m 的黑色排气帽。
  for (const [i, z] of [-8, -20].entries()) {
    add({
      id: `${P}super.funnel_${pad(i + 1)}`,
      name_cn: `内埋式烟囱 ${i + 1}`,
      name_en: `enclosed uptake ${i + 1}`,
      assembly: "superstructure",
      build_layer: 4,
      geometry: { type: "kit", kit: "type055Frustum", params: { w0: 4.8, d0: 5.8, w1: 4.2, d1: 5.0, h: 2.4 } },
      material: "cv_hull_dark",
      mate: A([0, DECK + 5.8, z]),
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
      mate: A([-3.0 + i * 1.2, DECK + 9.6, 33.07]),
    });
  }

  // 桅顶电子战半圆罩
  for (const side of [-1, 1] as const) {
    add({
      id: `${P}radar.mast_ecm_${side === -1 ? "l" : "r"}`,
      name_cn: `桅顶电子战半圆罩 ${side === -1 ? "左" : "右"}`,
      name_en: `mast ECM pod ${side === -1 ? "l" : "r"}`,
      assembly: "radar",
      build_layer: 4,
      geometry: M(C(0.24, 1.1, [0, 0, 0], 12), C(0.28, 0.1, [0, 0.55, 0], 12)),
      material: "cv_radar_dark",
      mate: A([side * 1.55, 38.8, 20]),
    });
  }

  // 舰桥/上建平板阵：IFF 环、CEC 数据链、电子战大阵面、光电转塔、舰桥侧救生筏
  add({
    id: `${P}radar.iff_front`,
    name_cn: "敌我识别阵列（前）",
    name_en: "IFF array (front)",
    assembly: "radar",
    build_layer: 4,
    geometry: M(B(7.2, 0.55, 0.16, [0, 0, 0], 0.01)),
    material: "cv_aesa",
    mate: A([0, 22.25, 39.25]),
  });
  add({
    id: `${P}radar.iff_aft`,
    name_cn: "敌我识别阵列（后）",
    name_en: "IFF array (aft)",
    assembly: "radar",
    build_layer: 4,
    geometry: M(B(7.2, 0.55, 0.16, [0, 0, 0], 0.01)),
    material: "cv_aesa",
    mate: A([0, 22.25, 4.75], [0, 180, 0]),
  });
  for (const side of [-1, 1] as const) {
    add({
      id: `${P}radar.iff_${side === -1 ? "l" : "r"}`,
      name_cn: `敌我识别阵列 ${side === -1 ? "左" : "右"}`,
      name_en: `IFF array ${side === -1 ? "l" : "r"}`,
      assembly: "radar",
      build_layer: 4,
      geometry: M(B(7.2, 0.55, 0.16, [0, 0, 0], 0.01)),
      material: "cv_aesa",
      mate: A([side * 6.95, 22.25, 22], [0, side * 90, 0]),
    });
    add({
      id: `${P}radar.ew_panel_${side === -1 ? "l" : "r"}`,
      name_cn: `电子战大阵面 ${side === -1 ? "左" : "右"}`,
      name_en: `EW large array ${side === -1 ? "l" : "r"}`,
      assembly: "radar",
      build_layer: 4,
      geometry: M(B(0.14, 1.8, 2.4, [0, 0, 0], 0.01)),
      material: "cv_aesa",
      mate: A([side * 6.55, 18.0, 22]),
    });
    for (const [tag, x, z] of [
      ["front", side * 8.4, 29.2],
      ["aft", side * 8.4, 26.6],
    ] as const) {
      add({
        id: `${P}radar.cec_${side === -1 ? "l" : "r"}_${tag}`,
        name_cn: `CEC 数据链阵面 ${side === -1 ? "左" : "右"} ${tag}`,
        name_en: `CEC array ${side === -1 ? "l" : "r"} ${tag}`,
        assembly: "radar",
        build_layer: 4,
        geometry: M(B(0.14, 0.5, 0.82, [0, 0, 0], 0.01)),
        material: "cv_aesa",
        mate: A([x, 22.1, z]),
      });
    }
    for (const [i, z] of [8, 16, 24].entries()) {
      add({
        id: `${P}surface.bridge_liferaft_${side === -1 ? "l" : "r"}_${i + 1}`,
        name_cn: `舰桥侧救生筏 ${side === -1 ? "左" : "右"} ${i + 1}`,
        name_en: `bridge life raft ${side === -1 ? "l" : "r"} ${i + 1}`,
        assembly: "surface",
        build_layer: 5,
        geometry: M(C(0.45, 1.5, [0, 0, 0], 14), B(1.0, 0.08, 0.12, [0, 0.8, 0], 0.006)),
        material: "cv_canvas",
        mate: A([side * 6.1, 22.05, z], [90, 0, 0]),
      });
    }
    add({
      id: `${P}radar.bridge_eo_${side === -1 ? "l" : "r"}`,
      name_cn: `舰桥光电转塔 ${side === -1 ? "左" : "右"}`,
      name_en: `bridge EO turret ${side === -1 ? "l" : "r"}`,
      assembly: "radar",
      build_layer: 4,
      geometry: M(S(0.3, [0, 0.35, 0], 14), C(0.18, 0.35, [0, 0, 0], 12)),
      material: "cv_radar_dark",
      mate: A([side * 2.5, 27.1, 28.5]),
    });
  }
  for (const [i, x] of [-2.4, 0, 2.4].entries()) {
    add({
      id: `${P}radar.bridge_face_${i + 1}`,
      name_cn: `舰桥正面小阵 ${i + 1}`,
      name_en: `bridge face array ${i + 1}`,
      assembly: "radar",
      build_layer: 4,
      geometry: M(B(1.6, 0.6, 0.12, [0, 0, 0], 0.01)),
      material: "cv_aesa",
      mate: A([x, 26.6, 33.02]),
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

  // 低矮烟囱顶盖/排气格栅/侧百叶
  for (const [i, z] of [-8, -20].entries()) {
    add({
      id: `${P}super.funnel_cap_dark_${i + 1}`,
      name_cn: `烟囱顶盖 ${i + 1}`,
      name_en: `funnel cap ${i + 1}`,
      assembly: "superstructure",
      build_layer: 4,
      geometry: M(B(3.9, 0.18, 4.9, [0, 0, 0], 0.02), B(3.7, 0.06, 4.7, [0, 0.11, 0], 0.006)),
      material: "cv_steel_dark",
      mate: A([0, 22.45, z]),
    });
    const slats: Array<Parameters<typeof M>[0]> = [];
    for (let s = 0; s < 5; s++) slats.push(B(2.6, 0.05, 0.18, [0, 0.14, -0.9 + s * 0.45], 0.004));
    add({
      id: `${P}super.funnel_grille_${i + 1}`,
      name_cn: `烟囱排气格栅 ${i + 1}`,
      name_en: `funnel exhaust grille ${i + 1}`,
      assembly: "superstructure",
      build_layer: 4,
      geometry: M(...slats),
      material: "cv_grate",
      mate: A([0, 22.43, z]),
    });
    for (const side of [-1, 1] as const) {
      add({
        id: `${P}super.funnel_louver_${i + 1}_${side === -1 ? "l" : "r"}`,
        name_cn: `烟囱侧百叶 ${i + 1} ${side === -1 ? "左" : "右"}`,
        name_en: `funnel louver ${i + 1} ${side === -1 ? "l" : "r"}`,
        assembly: "superstructure",
        build_layer: 4,
        geometry: M(B(0.1, 1.1, 2.6, [0, 0, 0], 0.01)),
        material: "cv_grate",
        mate: A([side * 2.02, 21.2, z]),
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
      mate: A([side * 1.9, 34.6, 20], [0, side * 90, 0]),
    });
  }
  for (const [tag, z, yaw] of [
    ["fwd", 22.9, 0],
    ["aft", 17.1, 180],
  ] as const) {
    add({
      id: `${P}radar.xband_${tag}`,
      name_cn: `X 波段阵面 ${tag}`,
      name_en: `X-band array ${tag}`,
      assembly: "radar",
      build_layer: 4,
      geometry: M(B(1.2, 1.0, 0.14, [0, 0, 0], 0.01)),
      material: "cv_aesa",
      mate: A([0, 34.8, z], [0, yaw, 0]),
    });
  }
  for (const side of [-1, 1] as const) {
    add({
      id: `${P}radar.xband_side_${side === -1 ? "l" : "r"}`,
      name_cn: `X 波段侧面阵 ${side === -1 ? "左" : "右"}`,
      name_en: `X-band side array ${side === -1 ? "l" : "r"}`,
      assembly: "radar",
      build_layer: 4,
      geometry: M(B(1.2, 1.0, 0.14, [0, 0, 0], 0.01)),
      material: "cv_aesa",
      mate: A([side * 1.95, 34.6, 20], [0, side * 90, 0]),
    });
  }
  // 桅身四面平板阵（综合射频桅杆的相控阵/电子战面板）
  for (const side of [-1, 1] as const) {
    add({
      id: `${P}radar.mast_panel_${side === -1 ? "l" : "r"}`,
      name_cn: `桅身侧面阵 ${side === -1 ? "左" : "右"}`,
      name_en: `mast side array ${side === -1 ? "l" : "r"}`,
      assembly: "radar",
      build_layer: 4,
      geometry: M(B(0.12, 2.6, 3.0, [0, 0, 0], 0.01)),
      material: "cv_aesa",
      mate: A([side * 2.3, 31.5, 20]),
    });
  }
  for (const [tag, z, yaw] of [
    ["front", 23.4, 0],
    ["aft", 16.6, 180],
  ] as const) {
    add({
      id: `${P}radar.mast_panel_${tag}`,
      name_cn: `桅身前后阵 ${tag}`,
      name_en: `mast front/aft array ${tag}`,
      assembly: "radar",
      build_layer: 4,
      geometry: M(B(2.6, 2.4, 0.12, [0, 0, 0], 0.01)),
      material: "cv_aesa",
      mate: A([0, 31.5, z], [0, yaw, 0]),
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
    ["flag", -88.6, -1],
  ] as const) {
    add({
      id: `${P}surface.${tag}staff`,
      name_cn: tag === "jack" ? "艏旗杆" : "艉旗杆",
      name_en: tag === "jack" ? "jackstaff" : "flagstaff",
      assembly: "surface",
      build_layer: 5,
      geometry: M(C(0.06, 3.2, [0, 0, 0], 8), C(0.12, 0.16, [0, -1.55, 0], 8)),
      material: "cv_steel",
      mate: A([tag === "flag" ? 2.8 : 0, t55DeckTop(z) + 1.6, z]),
    });
    add({
      id: `${P}surface.${tag}flag`,
      name_cn: tag === "jack" ? "海军旗" : "舰尾旗",
      name_en: tag === "jack" ? "naval ensign" : "ensign",
      assembly: "surface",
      build_layer: 5,
      geometry: M(B(1.5, 0.9, 0.02, [0, 0, 0], 0.002)),
      material: "cv_deck_red",
      mate: A([(tag === "flag" ? 2.8 : 0) + sign * 0.8, t55DeckTop(z) + 2.6, z - sign * 0.05]),
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
      mate: A([i < 3 ? -7.2 : 7.2, t55DeckTop([-30, -20, 8][i % 3]!) + 0.3, [-30, -20, 8][i % 3]!]),
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

  // 垂发阵列围框（按 0.95m 单元间距的 8 列阵面包络）
  const vlsHalfWidth = ((VLS.COLS - 1) * VLS.PITCH) / 2 + 0.9;
  for (const [tag, z0, rows] of [
    ["fwd", VLS.FWD_Z, VLS.FWD_ROWS],
    ["aft", VLS.AFT_Z, VLS.AFT_ROWS],
  ] as const) {
    const len = (rows - 1) * VLS.PITCH + 1.8;
    const zc = z0 + ((rows - 1) * VLS.PITCH) / 2;
    add({
      id: `${P}vls.coaming_${tag}`,
      name_cn: `垂发阵列围板 ${tag}`,
      name_en: `VLS coaming ${tag}`,
      assembly: "vls",
      build_layer: 4,
      geometry: M(
        B(vlsHalfWidth * 2, 0.16, 0.18, [0, 0, -len / 2], 0.006),
        B(vlsHalfWidth * 2, 0.16, 0.18, [0, 0, len / 2], 0.006),
        B(0.18, 0.16, len, [-vlsHalfWidth, 0, 0], 0.006),
        B(0.18, 0.16, len, [vlsHalfWidth, 0, 0], 0.006),
      ),
      material: "cv_055_hull",
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

  for (const [i, z] of [63, 65].entries()) {
    add({
      id: `${P}interior.magazine_light_${i + 1}`,
      name_cn: `弹药库灯 ${i + 1}`,
      name_en: `magazine light ${i + 1}`,
      assembly: "interior",
      build_layer: 5,
      geometry: M(B(0.3, 0.04, 1.1, [0, 0, 0], 0.004)),
      material: "cv_warning",
      mate: A([i === 0 ? -1.7 : 1.7, DECK - 7.45, z]),
    });
  }

  // ---------------- 112 单元 H/HT-1 通用垂发 ----------------
  // 公开数据：850×850mm 单元、9m 井深、前 64 + 后 48、冷热共架。
  // 单元间距 0.95m（井口 0.86 + 结构框），1 单位 = 1m。
  ctx.node({ name: "CV_055_VlsHatch", parent: "root", pivot: [0, DECK + 0.06, 0], note: "VLS 井盖阵列" });
  const allCells = vlsCells();
  const vlsHatchAt = (x: number, z: number) =>
    new THREE.Matrix4().makeTranslation(x, t55DeckTop(z) + 0.005, z);
  const heroKeys = new Set(VLS_HEROES.map((hero) => `${hero.bank}-${hero.row}-${hero.col}`));
  const staticCells = allCells.filter((cell) => !heroKeys.has(`${cell.bank}-${cell.row}-${cell.col}`));

  ctx.layout("type055.vlsHatch", ({ index }) => {
    const cell = staticCells[index]!;
    return vlsHatchAt(cell.x, cell.z);
  });
  add({
    id: `${P}vls.hatch`,
    name_cn: "通用垂发井盖 ×106（另 6 格为动态井盖）",
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
  const VLS_TUBE_TOP = 14.0;
  const VLS_TUBE_BOTTOM = 5.2;
  const VLS_TUBE_CENTER = (VLS_TUBE_TOP + VLS_TUBE_BOTTOM) / 2;
  ctx.layout("type055.vlsTube", ({ index }) => {
    const cell = allCells[index]!;
    return new THREE.Matrix4().makeTranslation(cell.x, VLS_TUBE_CENTER, cell.z);
  });
  add({
    id: `${P}vls.tube`,
    name_cn: "垂发井筒 ×112（850mm × 8.8m）",
    name_en: "VLS tube ×112 (850mm × 8.8m)",
    assembly: "vls",
    build_layer: 3,
    geometry: { type: "kit", kit: "type055VlsTube" },
    material: "cv_steel_dark",
    instances: 112,
    indexed: true,
    instance_layout: "type055.vlsTube",
    mate: A([0, 0, 0]),
  });
  ctx.layout("type055.vlsCanister", ({ index }) => {
    const cell = allCells[index]!;
    return new THREE.Matrix4().makeTranslation(cell.x, VLS_TUBE_CENTER, cell.z);
  });
  add({
    id: `${P}vls.canister`,
    name_cn: "垂发发射筒 ×112（储运/冷热共架）",
    name_en: "VLS canister ×112",
    assembly: "vls",
    build_layer: 3,
    geometry: { type: "kit", kit: "type055VlsCanister" },
    material: "cv_steel_dark",
    instances: 112,
    indexed: true,
    instance_layout: "type055.vlsCanister",
    mate: A([0, 0, 0]),
  });
  ctx.layout("type055.vlsLiner", ({ index }) => {
    const cell = allCells[index]!;
    return new THREE.Matrix4().makeTranslation(cell.x, 13.55, cell.z);
  });
  add({
    id: `${P}vls.liner`,
    name_cn: "垂发绿色防盐雾内衬 ×112",
    name_en: "VLS green interior liner ×112",
    assembly: "vls",
    build_layer: 3,
    geometry: { type: "kit", kit: "type055VlsLiner" },
    material: "cv_vls_interior",
    instances: 112,
    indexed: true,
    instance_layout: "type055.vlsLiner",
    mate: A([0, 0, 0]),
  });
  ctx.layout("type055.vlsShockRing", ({ index }) => {
    const cell = allCells[index]!;
    return new THREE.Matrix4().makeTranslation(cell.x, 13.65, cell.z);
  });
  add({
    id: `${P}vls.shock_ring`,
    name_cn: "发射筒减震环 ×112",
    name_en: "canister shock ring ×112",
    assembly: "vls",
    build_layer: 3,
    geometry: T(0.44, 0.36, 0.14, [0, 0, 0], 20),
    material: "cv_055_fitting",
    instances: 112,
    indexed: true,
    instance_layout: "type055.vlsShockRing",
    mate: A([0, 0, 0]),
  });
  ctx.layout("type055.vlsActuator", ({ index }) => {
    const cell = allCells[index]!;
    return new THREE.Matrix4().makeTranslation(cell.x + 0.36, t55DeckTop(cell.z) - 0.72, cell.z + 0.36);
  });
  add({
    id: `${P}vls.hatch_actuator`,
    name_cn: "井盖作动筒 ×112",
    name_en: "hatch actuator ×112",
    assembly: "vls",
    build_layer: 3,
    geometry: M(C(0.08, 0.55, [0, 0, 0], 10), C(0.05, 0.4, [0, 0.42, 0], 8)),
    material: "cv_055_fitting",
    instances: 112,
    indexed: true,
    instance_layout: "type055.vlsActuator",
    mate: A([0, 0, 0]),
  });
  ctx.layout("type055.vlsGasGen", ({ index }) => {
    const cell = allCells[index]!;
    return new THREE.Matrix4().makeTranslation(cell.x, 5.95, cell.z);
  });
  add({
    id: `${P}vls.gas_generator`,
    name_cn: "冷发射燃气发生器 ×112",
    name_en: "cold-launch gas generator ×112",
    assembly: "vls",
    build_layer: 3,
    geometry: M(C(0.2, 0.6, [0, 0, 0], 12), T(0.24, 0.12, 0.18, [0, 0.36, 0], 12)),
    material: "cv_steel_dark",
    instances: 112,
    indexed: true,
    instance_layout: "type055.vlsGasGen",
    mate: A([0, 0, 0]),
  });

  // 动态井：真实弹形（HHQ-9B 冷 / YJ-18 热 / YJ-21 冷），井盖绕艉侧铰链开启。
  for (const hero of VLS_HEROES) {
    const cell = allCells.find(
      (item) => item.bank === hero.bank && item.row === hero.row && item.col === hero.col,
    )!;
    const tag = hero.tag;
    const spec = MISSILES[hero.type];
    const half = spec.length / 2;
    const restY = missileRestY(hero.type);
    const deckY = t55DeckTop(cell.z);
    const lidNode = `CV_055_VlsLid_${tag}`;
    ctx.node({
      name: lidNode,
      parent: "root",
      pivot: [cell.x, deckY + 0.045, cell.z - 0.43],
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
      mate: A([0, 0, 0.43]),
    });
    const missileNode = `CV_055_VlsMissile_${tag}`;
    ctx.node({
      name: missileNode,
      parent: "root",
      pivot: [cell.x, restY, cell.z],
      motion: "translate",
      note: `${spec.label} ${spec.launch === "cold" ? "冷发射" : "热发射"}`,
    });
    const isYj21 = hero.type === "yj21";
    const gliderNode = `CV_055_VlsGlider_${tag}`;
    if (isYj21) {
      ctx.node({ name: gliderNode, parent: missileNode, pivot: [0, 0, 0], motion: "translate", note: `鹰击-21 滑翔体分离 ${tag}` });
    }
    add({
      id: `${P}vls.missile_${tag}`,
      name_cn: `${spec.label} ${tag}（${spec.length}m × ${spec.diameter}m）`,
      name_en: `${spec.label} ${tag}`,
      assembly: "vls",
      build_layer: 3,
      geometry: { type: "kit", kit: hero.type === "hhq9b" ? "type055Hhq9bMissile" : hero.type === "yj18" ? "type055Yj18Missile" : "type055Yj21Missile" },
      material: "cv_aircraft",
      node: missileNode,
      mate: A([0, 0, 0]),
    });
    if (isYj21) {
      add({
        id: `${P}vls.glider_${tag}`,
        name_cn: `鹰击-21 双锥滑翔体 ${tag}`,
        name_en: `YJ-21 glider ${tag}`,
        assembly: "vls",
        build_layer: 3,
        geometry: { type: "kit", kit: "type055Yj21Glider" },
        material: "cv_aircraft",
        node: gliderNode,
        mate: A([0, 0, 0]),
      });
      add({
        id: `${P}vls.glider_nose_${tag}`,
        name_cn: `鹰击-21 深色头罩 ${tag}`,
        name_en: `YJ-21 radome ${tag}`,
        assembly: "vls",
        build_layer: 3,
        geometry: { type: "kit", kit: "type055Yj21Nose" },
        material: "cv_radar_dark",
        node: gliderNode,
        mate: A([0, 0, 0]),
      });
      add({
        id: `${P}vls.fins_booster_${tag}`,
        name_cn: `鹰击-21 助推尾翼 ${tag}`,
        name_en: `YJ-21 booster fins ${tag}`,
        assembly: "vls",
        build_layer: 3,
        geometry: { type: "kit", kit: "type055Yj21BoosterFins" },
        material: "cv_steel_dark",
        node: missileNode,
        mate: A([0, 0, 0]),
        scale: [0.001, 0.001, 0.001],
      });
      add({
        id: `${P}vls.fins_glider_${tag}`,
        name_cn: `鹰击-21 滑翔体控制翼 ${tag}`,
        name_en: `YJ-21 glider fins ${tag}`,
        assembly: "vls",
        build_layer: 3,
        geometry: { type: "kit", kit: "type055Yj21GliderFins" },
        material: "cv_steel_dark",
        node: gliderNode,
        mate: A([0, 0, 0]),
        scale: [0.001, 0.001, 0.001],
      });
      add({
        id: `${P}vls.glider_flame_${tag}`,
        name_cn: `鹰击-21 滑翔体尾焰 ${tag}`,
        name_en: `YJ-21 glider plume ${tag}`,
        assembly: "vls",
        build_layer: 5,
        geometry: { type: "kit", kit: "type055VlsFlame" },
        material: "cv_flame",
        node: gliderNode,
        mate: A([0, -1.2, 0]),
        tags: ["fx"],
      });
    } else {
      add({
        id: `${P}vls.fins_${tag}`,
        name_cn: `${spec.label} 展开尾翼 ${tag}`,
        name_en: `${spec.label} deployed fins ${tag}`,
        assembly: "vls",
        build_layer: 3,
        geometry: { type: "kit", kit: hero.type === "hhq9b" ? "type055Hhq9bFins" : "type055Yj18Fins" },
        material: "cv_steel_dark",
        node: missileNode,
        mate: A([0, 0, 0]),
        scale: [0.001, 0.001, 0.001],
      });
      add({
        id: `${P}vls.nose_${tag}`,
        name_cn: `${spec.label} 深色头罩 ${tag}`,
        name_en: `${spec.label} radome ${tag}`,
        assembly: "vls",
        build_layer: 3,
        geometry: { type: "kit", kit: hero.type === "hhq9b" ? "type055Hhq9bNose" : "type055Yj18Nose" },
        material: "cv_radar_dark",
        node: missileNode,
        mate: A([0, 0, 0]),
      });
    }
    add({
      id: `${P}vls.nozzle_${tag}`,
      name_cn: `${spec.label} 尾喷口 ${tag}`,
      name_en: `${spec.label} nozzle ${tag}`,
      assembly: "vls",
      build_layer: 3,
      geometry: { type: "kit", kit: "type055MissileNozzle" },
      material: "cv_steel_dark",
      node: missileNode,
      mate: A([0, -half, 0]),
    });
    add({
      id: `${P}vls.flame_${tag}`,
      name_cn: `${spec.label} 尾焰 ${tag}`,
      name_en: `${spec.label} exhaust ${tag}`,
      assembly: "vls",
      build_layer: 5,
      geometry: { type: "kit", kit: "type055VlsFlame" },
      material: "cv_flame",
      node: missileNode,
      mate: A([0, -half, 0]),
      tags: ["fx"],
    });
    const gasNode = `CV_055_VlsGas_${tag}`;
    ctx.node({
      name: gasNode,
      parent: "root",
      pivot: [cell.x, deckY + 0.28, cell.z],
      motion: "scalar",
      note: `${spec.launch === "hot" ? "热发射燃气" : "冷弹射燃气"} ${tag}`,
    });
    add({
      id: `${P}vls.gas_${tag}`,
      name_cn: `${spec.label} 发射燃气团 ${tag}`,
      name_en: `${spec.label} launch gas ${tag}`,
      assembly: "vls",
      build_layer: 5,
      geometry: { type: "kit", kit: "type055VlsGasCloud" },
      material: spec.launch === "hot" ? "cv_smoke" : "cv_steam",
      node: gasNode,
      mate: A([0, 0, 0]),
      tags: ["fx"],
      scale: [0.001, 0.001, 0.001],
    });
  }
  // 阵列框/燃气排导
  for (const [tag, z0, rows] of [
    ["fwd", VLS.FWD_Z, VLS.FWD_ROWS],
    ["aft", VLS.AFT_Z, VLS.AFT_ROWS],
  ] as const) {
    const len = (rows - 1) * VLS.PITCH;
    const zc = z0 + len / 2;
    const width = (VLS.COLS - 1) * VLS.PITCH + 0.6;
    add({
      id: `${P}vls.frame_${tag}`,
      name_cn: `垂发阵列框架 ${tag}`,
      name_en: `VLS frame ${tag}`,
      assembly: "vls",
      build_layer: 3,
      geometry: M(
        B(width, 0.18, 0.16, [0, 0, -len / 2], 0.006),
        B(width, 0.18, 0.16, [0, 0, len / 2], 0.006),
        B(0.16, 0.18, len, [-width / 2, 0, 0], 0.006),
        B(0.16, 0.18, len, [width / 2, 0, 0], 0.006),
        B(width, 0.18, 0.16, [0, 0, 0], 0.006),
      ),
      material: "cv_steel_dark",
      mate: A([0, 9.9, zc]),
    });
    add({
      id: `${P}vls.gas_vent_${tag}`,
      name_cn: `燃气排导道 ${tag}`,
      name_en: `gas exhaust duct ${tag}`,
      assembly: "vls",
      build_layer: 3,
      geometry: M(B(1.0, 0.55, len + 0.8, [0, 0, 0], 0.02)),
      material: "cv_steel_dark",
      mate: A([0, 12.2, zc]),
    });
  }
  for (let i = 0; i < 12; i++) {
    add({
      id: `${P}vls.cold_generator_${pad(i + 1)}`,
      name_cn: `冷发射燃气发生器 ${i + 1}`,
      name_en: `cold launch generator ${i + 1}`,
      assembly: "vls",
      build_layer: 3,
      geometry: M(C(0.18, 0.7, [0, 0, 0], 12), C(0.07, 0.28, [0, 0.48, 0], 8)),
      material: "cv_steel",
      mate: A([-2.85 + (i % 4) * 1.9, 10.2, i < 6 ? 53.8 : -53.6]),
    });
  }
  // 8 单元模块分隔框：每 2 列/2 行一道，对应 HT-1 的 8 隔舱模块
  for (const [tag, z0, rows] of [
    ["fwd", VLS.FWD_Z, VLS.FWD_ROWS],
    ["aft", VLS.AFT_Z, VLS.AFT_ROWS],
  ] as const) {
    const width = (VLS.COLS - 1) * VLS.PITCH;
    const len = (rows - 1) * VLS.PITCH;
    const zc = z0 + len / 2;
    const pieces: Array<Parameters<typeof M>[0]> = [];
    for (const x of [-2.85, -0.95, 0.95, 2.85]) {
      pieces.push(B(0.055, 0.035, len + 0.1, [x, 0, 0], 0.004));
    }
    for (let r = 2; r < rows; r += 2) {
      pieces.push(B(width + 0.1, 0.035, 0.055, [0, 0, z0 + (r - 0.5) * VLS.PITCH - zc], 0.004));
    }
    add({
      id: `${P}vls.module_dividers_${tag}`,
      name_cn: `垂发 8 单元模块分隔框 ${tag}`,
      name_en: `VLS 8-cell module dividers ${tag}`,
      assembly: "vls",
      build_layer: 4,
      geometry: M(...pieces),
      material: "cv_steel_dark",
      mate: A([0, t55DeckTop(zc) + 0.022, zc]),
    });
  }
  // 前甲板垂发海上再装填吊车（折叠收藏位）
  add({
    id: `${P}vls.reload_crane`,
    name_cn: "垂发海上再装填装置（折叠收藏）",
    name_en: "VLS at-sea reloading system (stowed)",
    assembly: "vls",
    build_layer: 4,
    geometry: M(
      B(3.2, 0.14, 2.2, [0, 0, 0], 0.02),
      B(2.8, 0.2, 1.8, [0, -0.18, 0], 0.02),
      { type: "weld", from: [0, 0, -0.7], to: [-1.05, 0.9, 0.15], radius: 0.12 },
      { type: "weld", from: [0, 0, -0.7], to: [1.05, 0.9, 0.15], radius: 0.12 },
      { type: "weld", from: [-1.05, 0.9, 0.15], to: [0, 1.0, 1.0], radius: 0.09 },
      { type: "weld", from: [1.05, 0.9, 0.15], to: [0, 1.0, 1.0], radius: 0.09 },
      B(2.0, 0.18, 0.2, [0, 1.0, 1.0], 0.02),
      B(0.16, 0.16, 1.3, [-0.9, 0.55, 0.0], 0.01),
      B(0.16, 0.16, 1.3, [0.9, 0.55, 0.0], 0.01),
    ),
    material: "cv_055_fitting",
    mate: A([-5.0, t55DeckTop(55) + 0.07, 55]),
  });

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
      geometry: M({ type: "weld", from: [0, 0, -0.55], to: [0, 0, 0.55], radius: 0.08 }, S(0.1, [0, 0, 0.6], 10)),
      material: "cv_055_shell",
      mate: A([-1.5 + (i % 4) * 0.9, 5.6, T55.GUN_Z - 10.5 + Math.floor(i / 4) * 1.4]),
    });
  }

  add({
    id: `${P}gun.shell_rack`,
    name_cn: "130mm 弹药架",
    name_en: "130mm shell rack",
    assembly: "weapons",
    build_layer: 2,
    geometry: M(B(4.2, 0.1, 5.2, [0, 0, 0], 0.01), B(0.12, 1.2, 5.2, [-2.0, 0.55, 0], 0.01), B(0.12, 1.2, 5.2, [2.0, 0.55, 0], 0.01)),
    material: "cv_steel_dark",
    mate: A([-0.15, 5.45, T55.GUN_Z - 9.2]),
  });

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
      mate: A([0, tag === "fwd" ? DECK + 0.75 : DECK + 7.1, z], [0, tag === "fwd" ? 180 : 0, 0]),
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
        mate: A([-0.75 + (i % 4) * 0.5, (tag === "fwd" ? DECK + 0.75 : DECK + 7.1) + (Math.floor(i / 4) - 1) * 0.38, z + (tag === "fwd" ? 0.72 : -0.72)]),
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
  // 双机库卷帘门（节点缩放 y 收进顶梁）、门楣/门柱
  add({
    id: `${P}hangar.door_header`,
    name_cn: "机库门楣",
    name_en: "hangar door header",
    assembly: "hangar",
    build_layer: 4,
    geometry: M(B(11.4, 0.75, 0.2, [0, 0, 0], 0.02)),
    material: "cv_055_hull",
    mate: A([0, t55DeckTop(-72) + 6.0, -72.05]),
  });
  for (const side of [-1, 1] as const) {
    add({
      id: `${P}hangar.door_pillar_${side === -1 ? "l" : "r"}`,
      name_cn: `机库门柱 ${side === -1 ? "左" : "右"}`,
      name_en: `hangar door pillar ${side === -1 ? "l" : "r"}`,
      assembly: "hangar",
      build_layer: 4,
      geometry: M(B(0.32, 6.4, 0.26, [0, 0, 0], 0.02)),
      material: "cv_055_hull",
      mate: A([side * 5.55, t55DeckTop(-72) + 3.2, -72.05]),
    });
    const doorNode = `CV_055_HangarDoor_${side === -1 ? "L" : "R"}`;
    ctx.node({ name: doorNode, parent: "root", pivot: [side * 2.78, t55DeckTop(-72) + 5.78, -72.12], motion: "scalar", note: `双机库门 ${side === -1 ? "左" : "右"}` });
    add({
      id: `${P}hangar.door_${side === -1 ? "l" : "r"}`,
      name_cn: `机库卷帘门 ${side === -1 ? "左" : "右"}`,
      name_en: `hangar rolling door ${side === -1 ? "l" : "r"}`,
      assembly: "hangar",
      build_layer: 4,
      geometry: M(
        B(5.45, 5.55, 0.14, [0, 0, 0], 0.02),
        B(5.2, 0.1, 0.1, [0, 1.4, 0.08], 0.006),
        B(5.2, 0.1, 0.1, [0, 0.4, 0.08], 0.006),
        B(5.2, 0.1, 0.1, [0, -0.6, 0.08], 0.006),
        B(5.2, 0.1, 0.1, [0, -1.6, 0.08], 0.006),
      ),
      material: "cv_055_hull",
      node: doorNode,
      mate: A([0, -2.775, 0]),
    });
  }
  // 机库地板/灯/肋骨/工作间/吊车
  add({
    id: `${P}hangar.interior_floor`,
    name_cn: "机库地板",
    name_en: "hangar floor",
    assembly: "hangar",
    build_layer: 3,
    geometry: M(B(10.8, 0.1, 17.2, [0, 0, 0], 0.01)),
    material: "cv_deck_plate",
    mate: A([0, t55DeckTop(-63) + 0.06, -63]),
  });
  for (let i = 0; i < 4; i++) {
    const z = -68 + i * 3.8;
    add({
      id: `${P}hangar.light_${i + 1}`,
      name_cn: `机库顶灯 ${i + 1}`,
      name_en: `hangar light ${i + 1}`,
      assembly: "hangar",
      build_layer: 5,
      geometry: M(B(1.5, 0.06, 0.28, [0, 0, 0], 0.004)),
      material: "cv_glow",
      mate: A([0, t55DeckTop(-63) + 6.05, z]),
    });
    for (const side of [-1, 1] as const) {
      add({
        id: `${P}hangar.rib_${i + 1}_${side === -1 ? "l" : "r"}`,
        name_cn: `机库肋骨 ${i + 1} ${side === -1 ? "左" : "右"}`,
        name_en: `hangar rib ${i + 1} ${side === -1 ? "l" : "r"}`,
        assembly: "hangar",
        build_layer: 4,
        geometry: M(B(0.14, 5.6, 0.34, [0, 0, 0], 0.01)),
        material: "cv_steel_dark",
        mate: A([side * 5.9, t55DeckTop(-63) + 3.0, z]),
      });
    }
  }
  for (const side of [-1, 1] as const) {
    add({
      id: `${P}hangar.workshop_${side === -1 ? "l" : "r"}`,
      name_cn: `机库工作间 ${side === -1 ? "左" : "右"}`,
      name_en: `hangar workshop ${side === -1 ? "l" : "r"}`,
      assembly: "hangar",
      build_layer: 4,
      geometry: M(B(1.6, 1.8, 0.55, [0, 0, 0], 0.03), B(1.4, 0.1, 0.65, [0, 0.45, 0.05], 0.01)),
      material: "cv_hull_dark",
      mate: A([side * 4.2, t55DeckTop(-63) + 1.0, -55.2]),
    });
    add({
      id: `${P}hangar.fire_bottle_${side === -1 ? "l" : "r"}`,
      name_cn: `机库灭火瓶 ${side === -1 ? "左" : "右"}`,
      name_en: `hangar fire bottle ${side === -1 ? "l" : "r"}`,
      assembly: "hangar",
      build_layer: 5,
      geometry: M(C(0.18, 1.2, [0, 0, 0], 12), C(0.1, 0.2, [0, 0.7, 0], 10)),
      material: "cv_deck_red",
      mate: A([side * 5.3, t55DeckTop(-63) + 0.65, -55.5]),
    });
  }
  add({
    id: `${P}hangar.crane_rail`,
    name_cn: "机库吊车轨道",
    name_en: "hangar crane rail",
    assembly: "hangar",
    build_layer: 4,
    geometry: M(B(0.18, 0.18, 15, [0, 0, 0], 0.01)),
    material: "cv_steel_dark",
    mate: A([0, t55DeckTop(-63) + 6.0, -63]),
  });
  add({
    id: `${P}hangar.crane_trolley`,
    name_cn: "机库吊车小车",
    name_en: "hangar crane trolley",
    assembly: "hangar",
    build_layer: 4,
    geometry: M(B(1.0, 0.4, 0.8, [0, 0, 0], 0.02), C(0.08, 0.6, [0, -0.45, 0], 10)),
    material: "cv_steel",
    mate: A([0, t55DeckTop(-63) + 5.7, -62]),
  });
  const hangarTieDowns: Array<[number, number]> = [];
  for (const side of [-1, 1] as const) {
    for (let i = 0; i < 4; i++) hangarTieDowns.push([side * 3.6, -68 + i * 3.3]);
  }
  ctx.layout("type055.hangarTieDown", ({ index }) => {
    const [x, z] = hangarTieDowns[index]!;
    return new THREE.Matrix4().makeTranslation(x, t55DeckTop(z) + 0.12, z);
  });
  add({
    id: `${P}hangar.tie_down_inner`,
    name_cn: "机库系留点 ×8",
    name_en: "hangar tie-downs ×8",
    assembly: "hangar",
    build_layer: 5,
    geometry: T(0.16, 0.09, 0.05, [0, 0, 0], 10),
    material: "cv_steel_dark",
    instances: 8,
    indexed: true,
    instance_layout: "type055.hangarTieDown",
    mate: A([0, 0, 0]),
  });

  // 两架折叠直-20（双机库）+ 一架旋翼展开的直-20（直升机甲板）
  addZ20(ctx, { tag: "hangar_l", x: -3.0, y: t55DeckTop(-64) + 0.12, z: -64, yaw: 180, scale: 0.78, folded: true });
  addZ20(ctx, { tag: "hangar_r", x: 3.0, y: t55DeckTop(-64) + 0.12, z: -64, yaw: 180, scale: 0.78, folded: true });
  addZ20(ctx, { tag: "pad", x: 0, y: t55DeckTop(-81) + 0.01, z: -81, yaw: 0, scale: 1 });
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

  // ---------------- 动力：4×QC-280 COGAG + 并车齿轮 + 双轴双桨 ----------------
  // 公开数据：单台 28MW / 8.2×2.5×3.5m；9+9 级压气机、16 火焰筒、4 级动力涡轮；
  // 2 轴、2 个可调距螺旋桨。左舷两台在前机舱，右舷两台在后机舱，各自并入齿轮箱。
  const engines = [
    { x: -4.2, z: -29, tag: "1", side: -1 },
    { x: -1.4, z: -29, tag: "2", side: -1 },
    { x: 1.4, z: -39.8, tag: "3", side: 1 },
    { x: 4.2, z: -39.8, tag: "4", side: 1 },
  ] as const;
  for (const e of engines) {
    const rotorNode = `CV_055_GT${e.tag}_Rotor`;
    ctx.node({
      name: rotorNode,
      parent: "root",
      pivot: [e.x, 6.35, e.z],
      motion: "rotate",
      axis: "z",
      note: `QC-280 燃气轮机 ${e.tag} 转子`,
    });
    add({
      id: `${P}power.gt${e.tag}_casing`,
      name_cn: `QC-280 燃气轮机 ${e.tag} 机匣（8.2×2.5×3.2m）`,
      name_en: `QC-280 gas turbine ${e.tag} casing`,
      assembly: "propulsion",
      build_layer: 1,
      geometry: { type: "kit", kit: "type055GasTurbineStatic" },
      material: "cv_055_hull",
      mate: A([e.x, 4.6, e.z]),
    });
    add({
      id: `${P}power.gt${e.tag}_rotor`,
      name_cn: `QC-280 燃气轮机 ${e.tag} 转子（9+9 级压气机/4 级动力涡轮）`,
      name_en: `QC-280 rotor ${e.tag}`,
      assembly: "propulsion",
      build_layer: 1,
      geometry: { type: "kit", kit: "type055GasTurbineRotor" },
      material: "cv_055_engine",
      node: rotorNode,
      mate: A([0, 0, 0]),
    });
    add({
      id: `${P}power.gt${e.tag}_mount`,
      name_cn: `燃气轮机 ${e.tag} 减震机脚 ×4`,
      name_en: `GT ${e.tag} mounts`,
      assembly: "propulsion",
      build_layer: 1,
      geometry: M(
        C(0.2, 0.35, [0, 0, -3.2], 10),
        C(0.2, 0.35, [0, 0, 3.2], 10),
        C(0.2, 0.35, [-1.05, 0, -3.2], 10),
        C(0.2, 0.35, [1.05, 0, 3.2], 10),
      ),
      material: "cv_steel_dark",
      mate: A([e.x, 4.5, e.z]),
    });
  }

  // 拆下的燃机侧板（靠舷侧竖放，检修状态），避免机舱只看到封闭铁盒。
  for (const side of [-1, 1] as const) {
    add({
      id: `${P}power.gt_panel_${side === -1 ? "l" : "r"}`,
      name_cn: `燃机侧板（检修拆下）${side === -1 ? "左" : "右"}`,
      name_en: `gas turbine access panel ${side === -1 ? "l" : "r"}`,
      assembly: "propulsion",
      build_layer: 2,
      geometry: M(B(7.6, 2.6, 0.08, [0, 0, 0], 0.02), C(0.07, 0.1, [-2.8, 0.9, 0.06], 8), C(0.07, 0.1, [2.8, 0.9, 0.06], 8)),
      material: "cv_055_hull",
      mate: A([side * 9.04, 5.9, side === -1 ? -29 : -39.8], [0, 90, 0]),
    });
  }

  // 机舱中纵舱壁（左右机舱分隔；同时给机舱视角提供浅色背景，避免转子淹没在黑洞里）
  add({
    id: `${P}power.centerline_bulkhead`,
    name_cn: "机舱中纵舱壁",
    name_en: "engine room centerline bulkhead",
    assembly: "propulsion",
    build_layer: 1,
    geometry: M(B(0.16, 6.6, 18, [0, 0, 0], 0.01), B(1.2, 1.9, 0.1, [0, -1.6, 0.12], 0.006), B(2.0, 0.06, 0.2, [0, 2.5, 0], 0.004)),
    material: "cv_055_hull",
    mate: A([0, 7.6, -34]),
  });

  // 机舱分隔/地板/控制台/顶灯
  add({
    id: `${P}power.engine_bulkhead`,
    name_cn: "前后机舱水密舱壁",
    name_en: "engine room bulkhead",
    assembly: "propulsion",
    build_layer: 1,
    geometry: M(B(13.0, 8.0, 0.18, [0, 0, 0], 0.01), B(1.2, 1.9, 0.1, [0, -2.4, 0.12], 0.006)),
    material: "cv_steel_dark",
    mate: A([0, 7.6, -35.4]),
  });
  for (const [tag, z] of [["fwd", -29], ["aft", -41]] as const) {
    add({
      id: `${P}power.engine_floor_${tag}`,
      name_cn: `机舱花钢板 ${tag}`,
      name_en: `engine room floor ${tag}`,
      assembly: "propulsion",
      build_layer: 3,
      geometry: M(B(18.2, 0.12, 13.6, [0, 0, 0], 0.02), B(18.2, 0.05, 0.2, [0, 0.08, 6.6], 0.006)),
      material: "cv_deck_plate",
      mate: A([0, 4.2, z]),
    });
    add({
      id: `${P}power.engine_light_${tag}`,
      name_cn: `机舱顶灯 ${tag}`,
      name_en: `engine room light ${tag}`,
      assembly: "propulsion",
      build_layer: 5,
      geometry: M(
        B(4.0, 0.05, 0.25, [0, 0, 0], 0.004),
        B(3.0, 0.05, 0.25, [-5.0, 0, 0], 0.004),
        B(3.0, 0.05, 0.25, [5.0, 0, 0], 0.004),
      ),
      material: "cv_055_lamp",
      mate: A([0, 10.225, z]),
    });
  }

  // 燃机接油盘与舷侧防滑走道
  for (const e of engines) {
    add({
      id: `${P}power.er_drip_tray_${e.tag}`,
      name_cn: `QC-280 燃气轮机 ${e.tag} 接油盘`,
      name_en: `GT ${e.tag} drip tray`,
      assembly: "propulsion",
      build_layer: 3,
      geometry: M(
        B(2.9, 0.07, 8.3, [0, 0, 0], 0.01),
        B(2.9, 0.12, 0.08, [0, 0.06, 4.12], 0.006),
        B(2.9, 0.12, 0.08, [0, 0.06, -4.12], 0.006),
        B(0.08, 0.12, 8.3, [1.42, 0.06, 0], 0.006),
        B(0.08, 0.12, 8.3, [-1.42, 0.06, 0], 0.006),
      ),
      material: "cv_steel_dark",
      mate: A([e.x, 4.31, e.z]),
    });
  }
  for (const side of [-1, 1] as const) {
    add({
      id: `${P}power.er_walkway_${side === -1 ? "l" : "r"}`,
      name_cn: `机舱舷侧防滑走道 ${side === -1 ? "左" : "右"}`,
      name_en: `engine room side walkway ${side === -1 ? "l" : "r"}`,
      assembly: "propulsion",
      build_layer: 3,
      geometry: M(B(0.9, 0.04, 24.0, [0, 0, 0], 0.004)),
      material: "cv_grate",
      mate: A([side * 8.2, 4.29, -34]),
    });
  }

  // 机舱是封闭机器处所：补齐顶棚、围壁隔音板、桁架、管系与走台，
  // 让内部 FPV 看到完整的机舱边界，避免机匣悬在空腔里。
  add({
    id: `${P}power.er_ceiling`,
    name_cn: "机舱顶棚/甲板下表面",
    name_en: "engine room deckhead",
    assembly: "propulsion",
    build_layer: 1,
    geometry: M(
      B(18.2, 0.08, 26.4, [0, 0, 0], 0.01),
      B(0.22, 0.14, 26.4, [-7.2, -0.08, 0], 0.008),
      B(0.22, 0.14, 26.4, [7.2, -0.08, 0], 0.008),
    ),
    material: "cv_hull_dark",
    mate: A([0, 10.3, -34]),
  });

  // 舷侧隔音围壁（带竖向加强筋），紧贴内壳
  for (const side of [-1, 1] as const) {
    for (const [tag, z] of [
      ["a", -24.5],
      ["b", -31.0],
      ["c", -37.5],
      ["d", -44.0],
    ] as const) {
      add({
        id: `${P}power.er_lining_${side === -1 ? "l" : "r"}_${tag}`,
        name_cn: `机舱隔音围壁 ${side === -1 ? "左" : "右"} ${tag}`,
        name_en: `engine room acoustic lining ${side === -1 ? "l" : "r"} ${tag}`,
        assembly: "propulsion",
        build_layer: 1,
        geometry: M(
          B(0.10, 4.8, 5.4, [0, 0, 0], 0.01),
          B(0.07, 4.6, 0.10, [0, 0, -2.2], 0.006),
          B(0.07, 4.6, 0.10, [0, 0, -0.73], 0.006),
          B(0.07, 4.6, 0.10, [0, 0, 0.73], 0.006),
          B(0.07, 4.6, 0.10, [0, 0, 2.2], 0.006),
        ),
        material: side === -1 ? "cv_055_hull" : "cv_hull_dark",
        mate: A([side * 9.12, 6.9, z]),
      });
    }
  }

  // 顶部横桁/纵桁
  for (const [tag, z] of [
    ["a", -22.5],
    ["b", -28.0],
    ["c", -33.5],
    ["d", -39.0],
    ["e", -44.5],
  ] as const) {
    add({
      id: `${P}power.er_girder_${tag}`,
      name_cn: `机舱顶部横桁 ${tag}`,
      name_en: `engine room deck girder ${tag}`,
      assembly: "propulsion",
      build_layer: 1,
      geometry: M(
        B(18.4, 0.30, 0.20, [0, 0, 0], 0.01),
        B(0.5, 0.06, 0.28, [-8.6, -0.12, 0], 0.006),
        B(0.5, 0.06, 0.28, [8.6, -0.12, 0], 0.006),
      ),
      material: "cv_steel_dark",
      mate: A([0, 10.12, z]),
    });
  }
  for (const side of [-1, 1] as const) {
    add({
      id: `${P}power.er_stringer_${side === -1 ? "l" : "r"}`,
      name_cn: `机舱顶部纵桁 ${side === -1 ? "左" : "右"}`,
      name_en: `engine room longitudinal girder ${side === -1 ? "l" : "r"}`,
      assembly: "propulsion",
      build_layer: 1,
      geometry: M(B(0.14, 0.20, 26.0, [0, 0, 0], 0.006)),
      material: "cv_steel_dark",
      mate: A([side * 7.4, 9.95, -34]),
    });
    // 高位燃油/滑油管与蒸汽伴热管，壁面支架固定
    add({
      id: `${P}power.er_high_pipe_${side === -1 ? "l" : "r"}`,
      name_cn: `机舱高位管系 ${side === -1 ? "左" : "右"}`,
      name_en: `engine room high pipe run ${side === -1 ? "l" : "r"}`,
      assembly: "propulsion",
      build_layer: 2,
      geometry: M(
        { type: "weld", from: [0, 0, -12], to: [0, 0, 12], radius: 0.11 },
        { type: "weld", from: [0.22, 0.24, -12], to: [0.22, 0.24, 12], radius: 0.06 },
        { type: "weld", from: [0, 0, -9], to: [side * 0.77, 0.25, -9], radius: 0.05 },
        { type: "weld", from: [0, 0, 0], to: [side * 0.77, 0.25, 0], radius: 0.05 },
        { type: "weld", from: [0, 0, 9], to: [side * 0.77, 0.25, 9], radius: 0.05 },
      ),
      material: "cv_steel",
      mate: A([side * 8.35, 8.75, -34]),
    });
    // 低位海水/燃油管，管鞋落地
    add({
      id: `${P}power.er_low_pipe_${side === -1 ? "l" : "r"}`,
      name_cn: `机舱低位管系 ${side === -1 ? "左" : "右"}`,
      name_en: `engine room low pipe run ${side === -1 ? "l" : "r"}`,
      assembly: "propulsion",
      build_layer: 2,
      geometry: M(
        { type: "weld", from: [0, 0, -12], to: [0, 0, 12], radius: 0.09 },
        B(0.22, 0.05, 0.22, [0, -0.10, -9], 0.004),
        B(0.22, 0.05, 0.22, [0, -0.10, 0], 0.004),
        B(0.22, 0.05, 0.22, [0, -0.10, 9], 0.004),
        B(0.18, 0.24, 0.18, [-0.22, 0.03, -6], 0.006),
        B(0.18, 0.24, 0.18, [-0.22, 0.03, 6], 0.006),
      ),
      material: "cv_steel_dark",
      mate: A([side * 8.95, 4.38, -34]),
    });
    // 电缆桥架
    add({
      id: `${P}power.er_cable_tray_${side === -1 ? "l" : "r"}`,
      name_cn: `机舱电缆桥架 ${side === -1 ? "左" : "右"}`,
      name_en: `engine room cable tray ${side === -1 ? "l" : "r"}`,
      assembly: "propulsion",
      build_layer: 2,
      geometry: M(
        B(0.46, 0.06, 26.0, [0, 0, 0], 0.004),
        B(0.04, 0.16, 26.0, [-0.21, 0.05, 0], 0.004),
        B(0.04, 0.16, 26.0, [0.21, 0.05, 0], 0.004),
        ...Array.from({ length: 9 }, (_, i) => B(0.46, 0.03, 0.06, [0, 0.02, -10 + i * 2.5], 0.003)),
      ),
      material: "cv_steel_dark",
      mate: A([side * 8.95, 9.42, -34]),
    });
  }

  // 燃机两侧安全栏杆（立柱落在花钢板上）
  for (const side of [-1, 1] as const) {
    add({
      id: `${P}power.er_rail_${side === -1 ? "l" : "r"}`,
      name_cn: `燃机安全栏杆 ${side === -1 ? "左" : "右"}`,
      name_en: `engine safety rail ${side === -1 ? "l" : "r"}`,
      assembly: "propulsion",
      build_layer: 3,
      geometry: M(
        { type: "weld", from: [0, 1.08, -4.1], to: [0, 1.08, 4.1], radius: 0.032 },
        { type: "weld", from: [0, 0.58, -4.1], to: [0, 0.58, 4.1], radius: 0.026 },
        ...[-4, -2, 0, 2, 4].flatMap((z) => [
          B(0.05, 1.08, 0.05, [0, 0.54, z], 0.004),
          B(0.18, 0.04, 0.18, [0, 0.02, z], 0.004),
        ]),
      ),
      material: "cv_warning",
      mate: A([side * 5.7, 4.26, -29]),
    });
  }

  // 消防瓶组（机舱固定灭火系统）
  add({
    id: `${P}power.er_fire_bottles`,
    name_cn: "机舱消防瓶组 ×5",
    name_en: "engine room fire suppression bottles ×5",
    assembly: "propulsion",
    build_layer: 2,
    geometry: M(
      B(1.5, 0.06, 0.6, [0, 0.03, 0], 0.004),
      B(0.05, 1.5, 0.05, [-0.7, 0.78, -0.25], 0.004),
      B(0.05, 1.5, 0.05, [0.7, 0.78, -0.25], 0.004),
      B(1.5, 0.05, 0.05, [0, 1.5, -0.25], 0.004),
      ...[-0.56, -0.28, 0, 0.28, 0.56].map((x) =>
        C(0.13, 1.42, [x, 0.74, 0.06], 14),
      ),
      ...[-0.56, -0.28, 0, 0.28, 0.56].map((x) =>
        C(0.045, 0.16, [x, 1.56, 0.06], 10),
      ),
    ),
    material: "cv_deck_red",
    mate: A([-8.0, 4.26, -33.9]),
  });

  // 滑油日用柜
  add({
    id: `${P}power.er_lube_tank`,
    name_cn: "滑油日用柜",
    name_en: "lube oil service tank",
    assembly: "propulsion",
    build_layer: 2,
    geometry: M(
      B(1.4, 1.5, 2.6, [0, 0, 0], 0.02),
      B(0.5, 0.06, 0.5, [0, 0.79, 0.7], 0.008),
      B(0.08, 0.5, 0.08, [0.5, 0.5, -1.0], 0.006),
    ),
    material: "cv_hull_dark",
    mate: A([-8.0, 5.01, -46.0]),
  });

  // 就地仪表盘与屏
  add({
    id: `${P}power.er_local_panel`,
    name_cn: "机舱就地仪表盘",
    name_en: "engine room local gauge panel",
    assembly: "propulsion",
    build_layer: 2,
    geometry: M(
      B(2.6, 1.3, 0.12, [0, 0, 0], 0.01),
      B(2.5, 0.06, 0.16, [0, 0.68, 0], 0.006),
    ),
    material: "cv_hull_dark",
    mate: A([-4.0, 6.4, -35.24]),
  });
  add({
    id: `${P}power.er_local_gauges`,
    name_cn: "机舱就地仪表显示屏 ×6",
    name_en: "engine room local gauges ×6",
    assembly: "propulsion",
    build_layer: 3,
    geometry: M(
      ...Array.from({ length: 6 }, (_, i) =>
        B(0.32, 0.24, 0.02, [-0.95 + (i % 3) * 0.95, 0.28 - Math.floor(i / 3) * 0.5, 0], 0.002),
      ),
    ),
    material: "cv_screen",
    mate: A([-4.0, 6.4, -35.17]),
  });

  add({
    id: `${P}power.engine_console`,
    name_cn: "机舱集控台",
    name_en: "engine room control console",
    assembly: "propulsion",
    build_layer: 2,
    geometry: M(B(0.9, 1.3, 0.6, [0, 0, 0], 0.02), B(0.7, 0.42, 0.05, [0, 0.4, -0.32], 0.004)),
    material: "cv_hull_dark",
    mate: A([-7.4, 5.6, -21.5]),
  });
  add({
    id: `${P}power.engine_screen`,
    name_cn: "机舱集控屏",
    name_en: "engine room screen",
    assembly: "propulsion",
    build_layer: 2,
    geometry: M(B(0.62, 0.38, 0.03, [0, 0, 0], 0.002)),
    material: "cv_screen",
    mate: A([-7.4, 6.05, -21.8]),
  });

  // 机舱至烟囱的排气/进气长通道（沿舷侧，位于机舱顶部）
  for (const side of [-1, 1] as const) {
    add({
      id: `${P}power.er_exhaust_run_${side === -1 ? "l" : "r"}_fwd`,
      name_cn: `机舱至前烟囱排气通道 ${side === -1 ? "左" : "右"}`,
      name_en: `engine exhaust run to forward uptake ${side === -1 ? "l" : "r"}`,
      assembly: "propulsion",
      build_layer: 1,
      geometry: M(B(0.9, 0.9, 12.0, [0, 0, 0], 0.03), B(1.5, 0.9, 1.2, [0, 0, 6.3], 0.03)),
      material: "cv_steel_dark",
      mate: A([side * 7.0, 13.2, -14]),
    });
    add({
      id: `${P}power.er_exhaust_run_${side === -1 ? "l" : "r"}_aft`,
      name_cn: `机舱至后烟囱排气通道 ${side === -1 ? "左" : "右"}`,
      name_en: `engine exhaust run to aft uptake ${side === -1 ? "l" : "r"}`,
      assembly: "propulsion",
      build_layer: 1,
      geometry: M(B(0.9, 0.9, 25.0, [0, 0, 0], 0.03), B(1.5, 0.9, 1.2, [0, 0, -12.8], 0.03)),
      material: "cv_steel_dark",
      mate: A([side * 7.0, 13.2, -32.5]),
    });
  }
  for (const side of [-1, 1] as const) {
    for (const [tag, z] of [["fwd", -8], ["aft", -20]] as const) {
      add({
        id: `${P}power.er_exhaust_riser_${side === -1 ? "l" : "r"}_${tag}`,
        name_cn: `机舱排气上升井 ${side === -1 ? "左" : "右"} ${tag}`,
        name_en: `engine exhaust riser ${side === -1 ? "l" : "r"} ${tag}`,
        assembly: "propulsion",
        build_layer: 1,
        geometry: M(B(0.9, 5.7, 0.9, [0, 0, 0], 0.03), B(3.2, 0.9, 0.9, [side * 1.5, -3.9, 0], 0.03)),
        material: "cv_steel_dark",
        mate: A([side * 4.0, 17.15, z]),
      });
    }
  }
  add({
    id: `${P}power.steering_gear`,
    name_cn: "舵机液压动力单元",
    name_en: "steering gear hydraulic unit",
    assembly: "propulsion",
    build_layer: 2,
    geometry: M(B(1.8, 1.0, 1.2, [0, 0, 0], 0.03), C(0.3, 1.4, [0, 0.6, 0], 14), C(0.3, 1.4, [0.7, 0.6, 0], 14)),
    material: "cv_steel_dark",
    mate: A([0, 5.2, -84]),
  });
  for (const side of [-1, 1] as const) {
    add({
      id: `${P}power.steering_ram_${side === -1 ? "l" : "r"}`,
      name_cn: `舵机液压缸 ${side === -1 ? "左" : "右"}`,
      name_en: `steering ram ${side === -1 ? "l" : "r"}`,
      assembly: "propulsion",
      build_layer: 2,
      geometry: M({ type: "weld", from: [0, 0, 0], to: [side * 2.2, -1.5, -8.8], radius: 0.14 }, C(0.22, 0.8, [0, 0, 0], 12)),
      material: "cv_steel",
      mate: A([0, 5.2, -84]),
    });
  }
  add({
    id: `${P}power.cpp_hydraulic_unit`,
    name_cn: "可调距桨液压站",
    name_en: "CPP hydraulic power unit",
    assembly: "propulsion",
    build_layer: 2,
    geometry: M(B(1.6, 1.4, 1.0, [0, 0, 0], 0.03), B(0.8, 0.5, 0.1, [0, 0.4, 0.52], 0.01), C(0.15, 0.8, [0.6, 0.3, 0.2], 10)),
    material: "cv_hull_dark",
    mate: A([-5.5, 5.0, -48.5]),
  });

  // 机舱辅机/管路/配电/吊车/进排气围井
  add({
    id: `${P}power.er_switchboard`,
    name_cn: "机舱配电/集控屏",
    name_en: "engine room switchboard",
    assembly: "propulsion",
    build_layer: 2,
    geometry: M(B(0.8, 1.6, 0.5, [0, 0, 0], 0.03), B(0.6, 0.5, 0.03, [0, 0.35, -0.27], 0.004), B(0.5, 0.08, 0.2, [0, -0.55, -0.27], 0.004)),
    material: "cv_hull_dark",
    mate: A([-7.2, 6.0, -22.5], [0, 90, 0]),
  });
  add({
    id: `${P}power.er_switchboard_screen`,
    name_cn: "机舱配电屏",
    name_en: "engine room switchboard screen",
    assembly: "propulsion",
    build_layer: 2,
    geometry: M(B(0.55, 0.45, 0.03, [0, 0, 0], 0.002)),
    material: "cv_screen",
    mate: A([-7.45, 6.35, -22.5], [0, 90, 0]),
  });
  for (const [tag, z] of [["a", -28], ["b", -34]] as const) {
    add({
      id: `${P}power.er_pump_${tag}`,
      name_cn: `机舱海水/滑油泵 ${tag.toUpperCase()}`,
      name_en: `engine room pump ${tag}`,
      assembly: "propulsion",
      build_layer: 2,
      geometry: M(C(0.34, 0.8, [0, 0, 0], 16), C(0.42, 0.14, [0, 0.48, 0], 16), C(0.12, 0.8, [0.55, 0.2, 0], 10)),
      material: "cv_steel_dark",
      mate: A([-6.9, 5.0, z]),
    });
  }
  for (const side of [-1, 1] as const) {
    add({
      id: `${P}power.er_pipe_${side === -1 ? "l" : "r"}_a`,
      name_cn: `机舱燃油/滑油管路 ${side === -1 ? "左" : "右"} A`,
      name_en: `engine room pipe ${side === -1 ? "l" : "r"} a`,
      assembly: "propulsion",
      build_layer: 2,
      geometry: M({ type: "weld", from: [0, 0, -9], to: [0, 0, 9], radius: 0.07 }, { type: "weld", from: [0, 0.8, -9], to: [0, 0.8, 9], radius: 0.05 }),
      material: "cv_steel",
      mate: A([side * 6.4, 4.6, -33]),
    });
    add({
      id: `${P}power.er_pipe_${side === -1 ? "l" : "r"}_b`,
      name_cn: `机舱海水冷却管路 ${side === -1 ? "左" : "右"}`,
      name_en: `engine room seawater pipe ${side === -1 ? "l" : "r"}`,
      assembly: "propulsion",
      build_layer: 2,
      geometry: M({ type: "weld", from: [0, 0, -8], to: [0, 0, 8], radius: 0.1 }, T(0.14, 0.1, 0.16, [0, 0, 0], 12)),
      material: "cv_steel_dark",
      mate: A([side * 5.4, 4.5, -33]),
    });
    add({
      id: `${P}power.er_intake_trunk_${side === -1 ? "l" : "r"}`,
      name_cn: `机舱进气围井 ${side === -1 ? "左" : "右"}`,
      name_en: `engine room intake trunk ${side === -1 ? "l" : "r"}`,
      assembly: "propulsion",
      build_layer: 1,
      geometry: M(B(1.2, 5.0, 1.2, [0, 0, 0], 0.03), B(1.2, 1.2, 2.0, [0, 2.5, 1.4], 0.03)),
      material: "cv_steel_dark",
      mate: A([side * 7.5, 10.4, -22.0]),
    });
    add({
      id: `${P}power.er_exhaust_trunk_${side === -1 ? "l" : "r"}`,
      name_cn: `机舱排气围井 ${side === -1 ? "左" : "右"}`,
      name_en: `engine room exhaust trunk ${side === -1 ? "l" : "r"}`,
      assembly: "propulsion",
      build_layer: 1,
      geometry: M(B(1.2, 5.0, 1.2, [0, 0, 0], 0.03), B(1.2, 1.2, 2.0, [0, 2.5, -1.4], 0.03)),
      material: "cv_steel_dark",
      mate: A([side * 7.5, 10.4, -45.0]),
    });
    add({
      id: `${P}power.er_fire_bottles_${side === -1 ? "l" : "r"}`,
      name_cn: `机舱消防瓶组 ${side === -1 ? "左" : "右"}`,
      name_en: `engine room fire bottles ${side === -1 ? "l" : "r"}`,
      assembly: "propulsion",
      build_layer: 2,
      geometry: M(C(0.16, 1.0, [0, 0, 0], 12), C(0.16, 1.0, [0.45, 0, 0], 12), C(0.16, 1.0, [0.9, 0, 0], 12), B(1.1, 0.1, 0.4, [0.45, -0.55, 0], 0.01)),
      material: "cv_deck_red",
      mate: A([side * 7.0, 5.0, -36.0]),
    });
  }
  add({
    id: `${P}power.er_crane_rail`,
    name_cn: "机舱行车轨道",
    name_en: "engine room crane rail",
    assembly: "propulsion",
    build_layer: 2,
    geometry: M(B(0.16, 0.16, 18, [0, 0, 0], 0.01), B(1.0, 0.35, 0.8, [0, -0.3, 0], 0.02), C(0.06, 0.6, [0, -0.75, 0], 8)),
    material: "cv_steel_dark",
    mate: A([0, 12.9, -34]),
  });

  // 并车齿轮箱 + 输入联轴器
  for (const side of [-1, 1] as const) {
    add({
      id: `${P}power.gearbox_${side === -1 ? "l" : "r"}`,
      name_cn: `并车减速齿轮箱 ${side === -1 ? "左" : "右"}`,
      name_en: `COGAG combining gearbox ${side === -1 ? "l" : "r"}`,
      assembly: "propulsion",
      build_layer: 1,
      geometry: M(
        B(3.4, 2.8, 3.2, [0, 0, 0], 0.04),
        T(0.95, 0.55, 0.4, [0, -0.4, 2.45], 20),
        B(1.2, 0.6, 0.4, [0, 1.5, 2.45], 0.02),
        C(0.45, 1.2, [0, -0.8, 0], 16),
      ),
      material: "cv_steel_dark",
      mate: A([side * 3.0, 5.7, -45.65]),
    });
    for (const e of engines.filter((item) => item.side === side)) {
      const couplingLen = Math.abs(-45.65 - (e.z - 4.1));
      add({
        id: `${P}power.coupling_${e.tag}`,
        name_cn: `燃气轮机 ${e.tag} 输出联轴器`,
        name_en: `GT ${e.tag} output coupling`,
        assembly: "propulsion",
        build_layer: 1,
        geometry: M(
          { type: "weld", from: [0, 0, 0], to: [0, -0.7, -couplingLen], radius: 0.16 },
          C(0.32, 0.5, [0, -0.7, -couplingLen], 14),
        ),
        material: "cv_steel",
        mate: A([e.x, 6.35, e.z - 4.1]),
      });
    }
    add({
      id: `${P}power.shaft_${side === -1 ? "l" : "r"}`,
      name_cn: `主轴 ${side === -1 ? "左" : "右"}`,
      name_en: `propeller shaft ${side === -1 ? "l" : "r"}`,
      assembly: "propulsion",
      build_layer: 1,
      geometry: M(C(0.3, 45, [0, 0, 0], 16)),
      material: "cv_steel",
      mate: A([side * T55.SHAFT_X, 4.0, -69.5], [90, 0, 0]),
    });
    add({
      id: `${P}power.stern_tube_${side === -1 ? "l" : "r"}`,
      name_cn: `艉轴管 ${side === -1 ? "左" : "右"}`,
      name_en: `stern tube ${side === -1 ? "l" : "r"}`,
      assembly: "propulsion",
      build_layer: 1,
      geometry: M(C(0.62, 4.4, [0, 0, 0], 18), T(0.72, 0.55, 0.3, [0, 0, 2.2], 18)),
      material: "cv_steel_dark",
      mate: A([side * T55.SHAFT_X, 4.0, -89.8], [90, 0, 0]),
    });
    for (const bz of [-52, -62, -72, -82, -89]) {
      add({
        id: `${P}power.bearing_${side === -1 ? "l" : "r"}_${Math.abs(bz)}`,
        name_cn: `轴系轴承 ${side === -1 ? "左" : "右"} z${bz}`,
        name_en: `shaft bearing ${side === -1 ? "l" : "r"} z${bz}`,
        assembly: "propulsion",
        build_layer: 1,
        geometry: M(T(0.44, 0.3, 0.28, [0, 0, 0], 18)),
        material: "cv_steel_dark",
        mate: A([side * T55.SHAFT_X, 4.0, bz], [90, 0, 0]),
      });
    }
    for (const bz of [-80, -86]) {
      add({
        id: `${P}power.shaft_bracket_${side === -1 ? "l" : "r"}_${Math.abs(bz)}`,
        name_cn: `尾轴支架 ${side === -1 ? "左" : "右"} z${bz}`,
        name_en: `shaft bracket ${side === -1 ? "l" : "r"} z${bz}`,
        assembly: "propulsion",
        build_layer: 1,
        geometry: M({ type: "weld", from: [side * 1.6, -1.8, 0], to: [0, 0, 0], radius: 0.12 }),
        material: "cv_steel_dark",
        mate: A([side * T55.SHAFT_X, 4.0, bz]),
      });
    }
    add({
      id: `${P}power.propeller_${side === -1 ? "l" : "r"}`,
      name_cn: `五叶可调距螺旋桨 ${side === -1 ? "左" : "右"}`,
      name_en: `five-blade CPP ${side === -1 ? "l" : "r"}`,
      assembly: "propulsion",
      build_layer: 1,
      geometry: { type: "kit", kit: "type055Propeller" },
      material: "cv_055_prop",
      node: side === -1 ? "CV_055_PropL" : "CV_055_PropR",
      mate: A([0, 0, 0]),
    });
    ctx.node({
      name: side === -1 ? "CV_055_PropL" : "CV_055_PropR",
      parent: "root",
      pivot: [side * T55.SHAFT_X, 4.0, -92.0],
      motion: "rotate",
      axis: "z",
      note: `螺旋桨 ${side === -1 ? "左" : "右"}`,
    });
    add({
      id: `${P}power.rudder_${side === -1 ? "l" : "r"}`,
      name_cn: `舵 ${side === -1 ? "左" : "右"}`,
      name_en: `rudder ${side === -1 ? "l" : "r"}`,
      assembly: "propulsion",
      build_layer: 1,
      geometry: { type: "kit", kit: "type055Rudder" },
      material: "cv_steel_dark",
      mate: A([side * 2.2, 1.3, -93.6]),
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
  for (let i = 0; i < 8; i++) consoleAt(-5.0 + (i % 4) * 2.5, DECK + 5.2, 14 + Math.floor(i / 4) * 4, `cic_${i + 1}`);
  const seatSpots: Array<[number, number, number]> = [];
  for (const [i, x] of [-3.0, -1.0, 1.0, 3.0].entries()) seatSpots.push([x, DECK + 7.42, 27.6 + (i % 2) * 0.1]);
  for (const z of [15, 19]) for (const x of [-5.0, -2.5, 0, 2.5]) seatSpots.push([x, DECK + 4.72, z]);
  ctx.layout("type055.seats", ({ index }) => {
    const [x, y, z] = seatSpots[index]!;
    return new THREE.Matrix4().makeTranslation(x, y, z);
  });
  add({
    id: `${P}interior.seats`,
    name_cn: "舰桥/CIC 座椅 ×12",
    name_en: "bridge/CIC seats ×12",
    assembly: "interior",
    build_layer: 2,
    geometry: M(B(0.55, 0.12, 0.5, [0, 0.4, 0], 0.02), B(0.55, 0.72, 0.12, [0, 0.78, -0.22], 0.02), B(0.08, 0.42, 0.08, [0, 0.16, 0], 0.006)),
    material: "cv_upholstery",
    instances: 12,
    indexed: true,
    instance_layout: "type055.seats",
    mate: A([0, 0, 0]),
  });

  add({
    id: `${P}interior.bridge_dashboard`,
    name_cn: "舰桥前显控台",
    name_en: "bridge dashboard",
    assembly: "interior",
    build_layer: 2,
    geometry: M(B(7.4, 0.55, 0.65, [0, 0, 0], 0.02), B(0.9, 0.4, 0.06, [-2.1, 0.45, -0.33], 0.004), B(0.9, 0.4, 0.06, [0, 0.45, -0.33], 0.004), B(0.9, 0.4, 0.06, [2.1, 0.45, -0.33], 0.004)),
    material: "cv_hull_dark",
    mate: A([0, DECK + 8.55, 31.5]),
  });
  for (const [i, x] of [-2.1, 0, 2.1].entries()) {
    add({
      id: `${P}interior.bridge_dash_screen_${i + 1}`,
      name_cn: `舰桥前屏 ${i + 1}`,
      name_en: `bridge dash screen ${i + 1}`,
      assembly: "interior",
      build_layer: 2,
      geometry: M(B(0.8, 0.34, 0.03, [0, 0, 0], 0.002)),
      material: "cv_screen",
      mate: A([x, DECK + 9.02, 31.16], [-18, 0, 0]),
    });
  }

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
    mate: A([0, DECK + 4.7, 18]),
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
    staticOnly("t55-radar-mast-panel", "type055.radar.mast_panel_*", "type055.super.mast*", "桅身相控阵/电子战面板嵌入综合桅杆表面", 2200),
    staticOnly("t55-radar-mast-ecm", "type055.radar.ecm_*", "type055.super.mast*", "电子战阵面贴装桅杆侧面", 400),
    staticOnly("t55-radar-deckhouse", "type055.radar.ew_panel_*", "type055.super.main_block", "电子战大阵面贴装上建侧壁", 1200),
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
    staticOnly("t55-gun-self", "type055.gun.*", "type055.gun.*", "炮塔/身管/炮座/扬弹机/弹架装配", 400),
    staticOnly("t55-magazine-rack", "type055.gun.shell_rack", "type055.gun.magazine", "弹药架置于弹药库内（库体为实体近似）", 1700),
    staticOnly("t55-ciws-super", "type055.ciws.*", "type055.super.*", "近防炮与上建安装", 300),
    staticOnly("t55-ciws-self", "type055.ciws.*", "type055.ciws.*", "近防炮塔/炮管/基座装配", 300),
    staticOnly("t55-vls-hull", "type055.vls.*", "type055.hull.*", "VLS 井筒/框架与舰体结构安装", 400),
    staticOnly("t55-deck-self", "type055.deck.*", "type055.deck.*", "甲板铺板/栏杆/立柱安装", 80),
    staticOnly("t55-hangar-self", "type055.hangar.*", "type055.hangar.*", "机库/直升机甲板/门/内设安装", 1200),
    staticOnly("t55-z20-self", "type055.hangar.z20_*", "type055.hangar.z20_*", "直-20 机身/旋翼/起落架/任务设备装配", 900),
    staticOnly("t55-z20-deck", "type055.hangar.z20_*", "type055.deck.*", "直升机起落架与甲板停放", 400),
    staticOnly("t55-z20-hangar", "type055.hangar.z20_*", "type055.hangar.*", "直升机在机库/甲板停放", 900),
    staticOnly("t55-surface-hull", "type055.surface.*", "type055.hull.*", "锚/栏杆/救生设备与舰体安装", 150),
    staticOnly("t55-surface-deck", "type055.surface.*", "type055.deck.*", "舷号/栏杆/救生设备与甲板安装", 100),
    staticOnly("t55-surface-self", "type055.surface.*", "type055.surface.*", "栏杆/救生筏/锚/锚链孔装配", 90),
    {
      family: "t55-gun-trunnion",
      a: "type055.gun.turret",
      b: "type055.gun.barrel",
      reason: "130mm 身管绕耳轴俯仰，根部始终埋在炮塔炮盾内（相对运动窄规则）",
      maxDepthMm: 900,
      anyForm: true,
      allowDisplaced: true,
      allowSuspect: true,
    },
    {
      family: "t55-vls-launch-bore",
      a: "type055.vls.missile_*",
      b: "type055.vls.*",
      reason: "冷发射导弹从已开启的井盖/井筒中穿出（相对运动窄规则）",
      maxDepthMm: 1200,
      anyForm: true,
      allowDisplaced: true,
      allowSuspect: true,
    },
    {
      family: "t55-vls-launch-deck",
      a: "type055.vls.missile_*",
      b: "type055.deck.*",
      reason: "导弹从甲板井口穿出，甲板为无孔盖板近似（相对运动窄规则）",
      maxDepthMm: 600,
      anyForm: true,
      allowDisplaced: true,
      allowSuspect: true,
    },
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
  type055Rudder,
  type055Stabilizer,
  type055Helipad,
  type055GunTurret,
  type055BridgeShell,
  type055GasTurbineStatic,
  type055GasTurbineRotor,
  type055HangarShell,
  type055BootTop,
  type055BulbousBow,
  type055Bulwark,
  type055HullNumber,
  type055VlsHatch,
  type055Hhq9bMissile,
  type055Hhq9bFins,
  type055Hhq9bNose,
  type055Yj18Missile,
  type055Yj18Fins,
  type055Yj18Nose,
  type055Yj21Missile,
  type055Yj21Glider,
  type055Yj21BoosterFins,
  type055Yj21GliderFins,
  type055Yj21Nose,
  type055MissileNozzle,
  type055VlsFlame,
  type055VlsGasCloud,
  type055VlsLiner,
  type055VlsTube,
  type055VlsCanister,
};
