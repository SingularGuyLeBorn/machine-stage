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
  type055CommandConsole,
  type055CommandChair,
  type055CommandChairBase,
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
    geometry: M(B(6.8, 2.6, 0.05, [0, 0, 0], 0.004)),
    material: "cv_055_bridge_glass",
    mate: A([0, DECK + 9.45, 33.04], [-12.8, 0, 0]),
  });
  for (const side of [-1, 1] as const) {
    add({
      id: `${P}super.bridge_glass_${side === -1 ? "l" : "r"}`,
      name_cn: `舰桥侧窗 ${side === -1 ? "左" : "右"}`,
      name_en: `bridge side window ${side === -1 ? "l" : "r"}`,
      assembly: "superstructure",
      build_layer: 4,
      geometry: M(B(0.06, 0.9, 7.0, [0, 0, 0], 0.004)),
      material: "cv_055_bridge_glass",
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
    ["port", [-6.9, DECK + 6.2, 22], -90],
    ["starboard", [6.9, DECK + 6.2, 22], 90],
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

  // 346B 阵面前盖：4 面 ×64 个 T/R 组件独立成件，近看有真实模块颗粒度。
  for (let panel = 0; panel < arrays.length; panel++) {
    const [tag, pos, yaw] = arrays[panel]!;
    const rad = (yaw * Math.PI) / 180;
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const lx = -2.4 + (4.8 * (col + 0.75)) / 8.6;
        const ly = -1.9 + (3.8 * (row + 0.75)) / 8.6;
        const lz = -0.21;
        const wx = pos[0] + Math.cos(rad) * lx + Math.sin(rad) * lz;
        const wz = pos[2] - Math.sin(rad) * lx + Math.cos(rad) * lz;
        add({
          id: `${P}radar.tr_cover_${tag}_${pad(row + 1)}_${pad(col + 1)}`,
          name_cn: `346B T/R 组件前盖 ${tag} ${row + 1}-${col + 1}`,
          name_en: `346B T/R module cover ${tag} ${row + 1}-${col + 1}`,
          assembly: "radar",
          build_layer: 4,
          geometry: M(B(0.42, 0.34, 0.03, [0, 0, 0], 0.0008), B(0.34, 0.26, 0.01, [0, 0, 0.018], 0.0004)),
          material: "cv_055_aesa_tile",
          mate: A([wx, pos[1] + ly, wz], [0, yaw, 0]),
        });
      }
    }
    // 阵面四周冷却/密封压条 + 四角安装座
    for (const [suffix, lx, ly, w, h] of [
      ["top", 0, 2.02, 4.95, 0.1],
      ["bottom", 0, -2.02, 4.95, 0.1],
      ["left", -2.48, 0, 0.1, 4.1],
      ["right", 2.48, 0, 0.1, 4.1],
    ] as const) {
      const lz = 0.09;
      const wx = pos[0] + Math.cos(rad) * lx + Math.sin(rad) * lz;
      const wz = pos[2] - Math.sin(rad) * lx + Math.cos(rad) * lz;
      add({
        id: `${P}radar.aesa_trim_${tag}_${suffix}`,
        name_cn: `346B 阵面${suffix === "top" ? "上" : suffix === "bottom" ? "下" : suffix === "left" ? "左" : "右"}压条 ${tag}`,
        name_en: `346B array trim ${tag} ${suffix}`,
        assembly: "radar",
        build_layer: 4,
        geometry: M(B(w, h, 0.06, [0, 0, 0], 0.004)),
        material: "cv_steel_dark",
        mate: A([wx, pos[1] + ly, wz], [0, yaw, 0]),
      });
    }
    for (const [sx, sy] of [
      [-2.45, 1.95],
      [2.45, 1.95],
      [-2.45, -1.95],
      [2.45, -1.95],
    ] as const) {
      const lz = 0.08;
      const wx = pos[0] + Math.cos(rad) * sx + Math.sin(rad) * lz;
      const wz = pos[2] - Math.sin(rad) * sx + Math.cos(rad) * lz;
      add({
        id: `${P}radar.aesa_corner_${tag}_${sx > 0 ? "s" : "p"}_${sy > 0 ? "u" : "dn"}`,
        name_cn: `346B 阵面安装座 ${tag}`,
        name_en: `346B array corner mount ${tag}`,
        assembly: "radar",
        build_layer: 4,
        geometry: M(B(0.18, 0.18, 0.14, [0, 0, 0], 0.006), C(0.04, 0.08, [0, 0, 0.09], 8)),
        material: "cv_steel_dark",
        mate: A([wx, pos[1] + sy, wz], [0, yaw, 0]),
      });
    }
  }

  // 阵面另一面也布置同规格模块盖：侧阵安装方向由舰体斜面决定，双面盖保证从任一舷都能看到真实模块颗粒。
  for (let panel = 0; panel < arrays.length; panel++) {
    const [tag, pos, yaw] = arrays[panel]!;
    const rad = (yaw * Math.PI) / 180;
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const lx = -2.4 + (4.8 * (col + 0.75)) / 8.6;
        const ly = -1.9 + (3.8 * (row + 0.75)) / 8.6;
        const lz = 0.17;
        const wx = pos[0] + Math.cos(rad) * lx + Math.sin(rad) * lz;
        const wz = pos[2] - Math.sin(rad) * lx + Math.cos(rad) * lz;
        add({
          id: `${P}radar.tr_cover_outer_${tag}_${pad(row + 1)}_${pad(col + 1)}`,
          name_cn: `346B T/R 组件外盖 ${tag} ${row + 1}-${col + 1}`,
          name_en: `346B T/R outer cover ${tag} ${row + 1}-${col + 1}`,
          assembly: "radar",
          build_layer: 4,
          geometry: M(B(0.42, 0.34, 0.03, [0, 0, 0], 0.0008), B(0.34, 0.26, 0.01, [0, 0, 0.018], 0.0004)),
          material: "cv_steel_dark",
          mate: A([wx, pos[1] + ly, wz], [0, yaw, 0]),
        });
      }
    }
  }

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
  // 导航雷达波导缝隙/驱动/基座
  for (let s = 0; s < 8; s++) {
    add({
      id: `${P}radar.nav_slot_${s + 1}`,
      name_cn: `导航雷达波导缝隙 ${s + 1}`,
      name_en: `nav radar slot ${s + 1}`,
      assembly: "radar",
      build_layer: 4,
      geometry: M(B(0.1, 0.025, 0.22, [0, 0, 0], 0.001)),
      material: "cv_radar_dark",
      node: "CV_055_Radar",
      mate: A([-1.1 + s * 0.31, 0.27, 0]),
    });
  }
  // 驱动/波导布置在雷达头自身顶面，避免向下插进桅顶结构。
  for (let s = 0; s < 4; s++) {
    add({
      id: `${P}radar.nav_bracket_${s + 1}`,
      name_cn: `导航雷达阵面支架 ${s + 1}`,
      name_en: `nav radar bracket ${s + 1}`,
      assembly: "radar",
      build_layer: 4,
      geometry: M(B(0.1, 0.12, 0.16, [0, 0, 0], 0.003)),
      material: "cv_steel_dark",
      node: "CV_055_Radar",
      mate: A([-1.05 + s * 0.7, 0.14, 0.12]),
    });
  }
  add({
    id: `${P}radar.nav_gearbox`,
    name_cn: "导航雷达减速箱",
    name_en: "nav radar gearbox",
    assembly: "radar",
    build_layer: 4,
    geometry: M(B(0.34, 0.16, 0.24, [0, 0, 0], 0.006), C(0.1, 0.16, [0.2, 0, 0], 10)),
    material: "cv_steel_dark",
    node: "CV_055_Radar",
    mate: A([0, 0.1, 0.2]),
  });
  add({
    id: `${P}radar.nav_motor`,
    name_cn: "导航雷达驱动电机",
    name_en: "nav radar drive motor",
    assembly: "radar",
    build_layer: 4,
    geometry: M(C(0.14, 0.26, [0, 0, 0], 12), C(0.07, 0.1, [0, 0.17, 0], 8)),
    material: "cv_steel",
    node: "CV_055_Radar",
    mate: A([0.28, 0.14, 0.3], [0, 0, 45]),
  });
  add({
    id: `${P}radar.nav_waveguide`,
    name_cn: "导航雷达波导",
    name_en: "nav radar waveguide",
    assembly: "radar",
    build_layer: 4,
    geometry: M(B(0.08, 0.08, 0.34, [0, 0, 0], 0.003)),
    material: "cv_brass",
    node: "CV_055_Radar",
    mate: A([-0.28, 0.12, 0.26]),
  });
  add({
    id: `${P}radar.nav_iff`,
    name_cn: "导航雷达顶部敌我识别振子",
    name_en: "nav radar IFF dipole",
    assembly: "radar",
    build_layer: 4,
    geometry: M(C(0.025, 0.8, [0, 0, 0], 8), B(0.5, 0.03, 0.03, [0, 0.4, 0], 0.002)),
    material: "cv_steel",
    node: "CV_055_Radar",
    mate: A([0, 0.55, 0]),
  });
  for (const s of [-1, 1] as const) {
    add({
      id: `${P}radar.nav_cable_${s === -1 ? "l" : "r"}`,
      name_cn: `导航雷达电缆 ${s === -1 ? "左" : "右"}`,
      name_en: `nav radar cable ${s === -1 ? "l" : "r"}`,
      assembly: "radar",
      build_layer: 4,
      geometry: M({ type: "weld", from: [s * 0.2, 0.08, 0.2], to: [s * 0.2, 0.05, 0.42], radius: 0.012 }),
      material: "cv_rubber",
      node: "CV_055_Radar",
      mate: A([0, 0, 0]),
    });
  }
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
      id: `${P}radar.satcom_ring_${side === -1 ? "l" : "r"}`,
      name_cn: `卫通基座环 ${side === -1 ? "左" : "右"}`,
      name_en: `SATCOM pedestal ring ${side === -1 ? "l" : "r"}`,
      assembly: "radar",
      build_layer: 4,
      geometry: M(T(0.9, 0.76, 0.1, [0, 0, 0], 18)),
      material: "cv_055_fitting",
      mate: A([side * 3.9, DECK + 13.2, 21]),
    });
    for (let b = 0; b < 4; b++) {
      const a = (Math.PI * 2 * b) / 4;
      add({
        id: `${P}radar.satcom_bolt_${side === -1 ? "l" : "r"}_${b + 1}`,
        name_cn: `卫通基座螺栓 ${side === -1 ? "左" : "右"} ${b + 1}`,
        name_en: `SATCOM pedestal bolt ${side === -1 ? "l" : "r"} ${b + 1}`,
        assembly: "radar",
        build_layer: 4,
        geometry: M(C(0.035, 0.08, [0, 0, 0], 8)),
        material: "cv_steel",
        mate: A([side * 3.9 + Math.cos(a) * 0.82, DECK + 13.26, 21 + Math.sin(a) * 0.82]),
      });
    }
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
      // 竖梃必须从窗台连到窗楣；旧版只有 1.25m 高，悬浮在玻璃中间，
      // 从舰桥看出去像一排立在甲板上的细杆子。
      geometry: M(B(0.05, 2.6, 0.07, [0, 0, 0], 0.003)),
      material: "cv_055_fitting",
      mate: A([-3.0 + i * 1.2, DECK + 9.45, 33.07]),
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
    for (const [i, z] of [8, 16, 5].entries()) {
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

  // 桅顶/桥楼电子设备补充：卫通副罩、设备柜、横桁天线、告警/数据链阵面
  for (const side of [-1, 1] as const) {
    for (let k = 0; k < 2; k++) {
      const x = side * (1.8 + k * 0.8);
      const z = 20 + (k === 0 ? -1.6 : 1.6);
      add({
        id: `${P}radar.satcom_aux_ped_${side === -1 ? "l" : "r"}_${k + 1}`,
        name_cn: `辅助卫通基座 ${side === -1 ? "左" : "右"} ${k + 1}`,
        name_en: `aux SATCOM pedestal ${side === -1 ? "l" : "r"} ${k + 1}`,
        assembly: "radar",
        build_layer: 4,
        geometry: M(C(0.16, 0.45, [0, 0, 0], 12), T(0.26, 0.2, 0.05, [0, -0.2, 0], 14)),
        material: "cv_steel_dark",
        mate: A([x, 40.5, z]),
      });
      add({
        id: `${P}radar.satcom_aux_dome_${side === -1 ? "l" : "r"}_${k + 1}`,
        name_cn: `辅助卫通罩 ${side === -1 ? "左" : "右"} ${k + 1}`,
        name_en: `aux SATCOM dome ${side === -1 ? "l" : "r"} ${k + 1}`,
        assembly: "radar",
        build_layer: 4,
        geometry: M(S(0.4, [0, 0, 0], 16), C(0.34, 0.18, [0, -0.28, 0], 14)),
        material: "cv_radar",
        mate: A([x, 40.92, z]),
      });
      add({
        id: `${P}radar.satcom_aux_ring_${side === -1 ? "l" : "r"}_${k + 1}`,
        name_cn: `辅助卫通基座环 ${side === -1 ? "左" : "右"} ${k + 1}`,
        name_en: `aux SATCOM ring ${side === -1 ? "l" : "r"} ${k + 1}`,
        assembly: "radar",
        build_layer: 4,
        geometry: M(T(0.38, 0.3, 0.06, [0, 0, 0], 16)),
        material: "cv_055_fitting",
        mate: A([x, 40.76, z]),
      });
      for (let b = 0; b < 4; b++) {
        const a = (Math.PI * 2 * b) / 4;
        add({
          id: `${P}radar.satcom_aux_bolt_${side === -1 ? "l" : "r"}_${k + 1}_${b + 1}`,
          name_cn: `辅助卫通螺栓 ${side === -1 ? "左" : "右"} ${k + 1}-${b + 1}`,
          name_en: `aux SATCOM bolt ${side === -1 ? "l" : "r"} ${k + 1}-${b + 1}`,
          assembly: "radar",
          build_layer: 4,
          geometry: M(C(0.025, 0.05, [0, 0, 0], 6)),
          material: "cv_steel",
          mate: A([x + Math.cos(a) * 0.33, 40.79, z + Math.sin(a) * 0.33]),
        });
      }
    }
  }
  for (let c = 0; c < 8; c++) {
    const x = -2.4 + (c % 4) * 1.6;
    const z = c < 4 ? 18.1 : 21.9;
    add({
      id: `${P}radar.mast_cabinet_${c + 1}`,
      name_cn: `桅顶电子设备柜 ${c + 1}`,
      name_en: `mast equipment cabinet ${c + 1}`,
      assembly: "radar",
      build_layer: 4,
      geometry: M(B(0.35, 0.24, 0.3, [0, 0, 0], 0.006), B(0.28, 0.02, 0.02, [0, 0, 0.16], 0.002)),
      material: "cv_055_console",
      mate: A([x, 40.4, z]),
    });
  }
  for (let a = 0; a < 8; a++) {
    const x = a < 4 ? -4.3 + a * 1.1 : 1.0 + (a - 4) * 1.1;
    add({
      id: `${P}radar.yardarm_element_${a + 1}`,
      name_cn: `桅横桁天线 ${a + 1}`,
      name_en: `yardarm antenna ${a + 1}`,
      assembly: "radar",
      build_layer: 4,
      geometry: M(C(0.02, 0.45, [0, 0, 0], 6), C(0.05, 0.04, [0, -0.2, 0], 6)),
      material: "cv_steel_dark",
      mate: A([x, 38.9, 20]),
    });
  }
  for (const side of [-1, 1] as const) {
    for (const y of [30.6, 32.0]) {
      add({
        id: `${P}radar.rwr_${side === -1 ? "l" : "r"}_${y > 31 ? "hi" : "lo"}`,
        name_cn: `雷达告警阵面 ${side === -1 ? "左" : "右"} ${y > 31 ? "上" : "下"}`,
        name_en: `RWR panel ${side === -1 ? "l" : "r"}`,
        assembly: "radar",
        build_layer: 4,
        geometry: M(B(0.06, 0.28, 0.4, [0, 0, 0], 0.004)),
        material: "cv_radar_dark",
        mate: A([side * 2.38, y, 20]),
      });
    }
    for (const x of [side * 2.0, side * 3.4]) {
      add({
        id: `${P}radar.maws_${x > 0 ? "s" : "p"}_${Math.abs(x) > 2.5 ? "o" : "i"}`,
        name_cn: `导弹逼近告警传感器`,
        name_en: `MAWS sensor`,
        assembly: "radar",
        build_layer: 4,
        geometry: M(S(0.075, [0, 0, 0], 8), C(0.05, 0.04, [0, -0.06, 0], 8)),
        material: "cv_radar_dark",
        mate: A([x, 27.1, 33.05]),
      });
    }
    add({
      id: `${P}radar.laser_warn_${side === -1 ? "l" : "r"}`,
      name_cn: `激光告警头 ${side === -1 ? "左" : "右"}`,
      name_en: `laser warning head ${side === -1 ? "l" : "r"}`,
      assembly: "radar",
      build_layer: 4,
      geometry: M(B(0.12, 0.12, 0.05, [0, 0, 0], 0.004), S(0.045, [0, 0, 0.03], 8)),
      material: "cv_radar_dark",
      mate: A([side * 1.2, 40.34, 22.3]),
    });
    add({
      id: `${P}radar.iff_platform_${side === -1 ? "l" : "r"}`,
      name_cn: `桅顶敌我识别振子 ${side === -1 ? "左" : "右"}`,
      name_en: `platform IFF dipole ${side === -1 ? "l" : "r"}`,
      assembly: "radar",
      build_layer: 4,
      geometry: M(B(0.04, 0.34, 0.04, [0, 0, 0], 0.002), B(0.35, 0.04, 0.04, [0, 0.18, 0], 0.002)),
      material: "cv_steel",
      mate: A([side * 2.4, 40.47, 22.3]),
    });
  }
  for (const [tag, x, z] of [
    ["gps", 0.6, 17.9],
    ["tacan", -0.6, 22.1],
  ] as const) {
    add({
      id: `${P}radar.${tag}_mast`,
      name_cn: tag === "gps" ? "桅顶卫导天线" : "桅顶塔康天线",
      name_en: tag === "gps" ? "mast GPS antenna" : "mast TACAN antenna",
      assembly: "radar",
      build_layer: 4,
      geometry: M(S(0.1, [0, 0, 0], 10), C(0.05, 0.08, [0, -0.09, 0], 8)),
      material: "cv_radar",
      mate: A([x, 40.37, z]),
    });
  }
  for (const side of [-1, 1] as const) {
    add({
      id: `${P}radar.anemometer_${side === -1 ? "l" : "r"}`,
      name_cn: `风速风向仪 ${side === -1 ? "左" : "右"}`,
      name_en: `anemometer ${side === -1 ? "l" : "r"}`,
      assembly: "radar",
      build_layer: 4,
      geometry: M(C(0.03, 0.35, [0, 0, 0], 6), B(0.3, 0.02, 0.02, [0, 0.18, 0], 0.002), B(0.02, 0.02, 0.3, [0, 0.18, 0], 0.002)),
      material: "cv_steel",
      mate: A([side * 0.8, 40.45, 17.55]),
    });
    add({
      id: `${P}radar.platform_cam_${side === -1 ? "l" : "r"}_a`,
      name_cn: `桅顶摄像机 ${side === -1 ? "左" : "右"} 1`,
      name_en: `mast camera ${side === -1 ? "l" : "r"} 1`,
      assembly: "radar",
      build_layer: 4,
      geometry: M(B(0.14, 0.1, 0.12, [0, 0, 0], 0.004), S(0.04, [0, 0, 0.08], 8)),
      material: "cv_055_console",
      mate: A([side * 2.6, 40.34, 18.0]),
    });
    add({
      id: `${P}radar.platform_cam_${side === -1 ? "l" : "r"}_b`,
      name_cn: `桅顶摄像机 ${side === -1 ? "左" : "右"} 2`,
      name_en: `mast camera ${side === -1 ? "l" : "r"} 2`,
      assembly: "radar",
      build_layer: 4,
      geometry: M(B(0.14, 0.1, 0.12, [0, 0, 0], 0.004), S(0.04, [0, 0, 0.08], 8)),
      material: "cv_055_console",
      mate: A([side * 2.6, 40.34, 22.0]),
    });
  }
  for (let d = 0; d < 4; d++) {
    const side = d % 2 === 0 ? -1 : 1;
    const z = d < 2 ? 23.49 : 16.51;
    add({
      id: `${P}radar.datalink_${d + 1}`,
      name_cn: `数据链阵面 ${d + 1}`,
      name_en: `datalink array ${d + 1}`,
      assembly: "radar",
      build_layer: 4,
      geometry: M(B(0.5, 0.4, 0.06, [0, 0, 0], 0.004)),
      material: "cv_aesa",
      mate: A([side * 0.8, 31.5, z], [0, d < 2 ? 0 : 180, 0]),
    });
  }

  // 雷达后端机柜（舱内，透视可查）与桅顶附加电子战/波导
  for (let i = 0; i < 8; i++) {
    const x = -2.7 + (i % 4) * 1.8;
    const z = i < 4 ? 24.5 : 17.5;
    add({
      id: `${P}radar.tx_cabinet_${i + 1}`,
      name_cn: `346B 发射机柜 ${i + 1}`,
      name_en: `346B transmitter cabinet ${i + 1}`,
      assembly: "radar",
      build_layer: 2,
      tags: ["internal"],
      geometry: M(B(0.62, 1.2, 0.5, [0, 0, 0], 0.01), B(0.5, 0.06, 0.02, [0, -0.48, 0.26], 0.002)),
      material: "cv_055_console",
      mate: A([x, 31.0, z]),
    });
    for (let c = 0; c < 4; c++) {
      add({
        id: `${P}radar.tx_card_${i + 1}_${c + 1}`,
        name_cn: `346B 发射模块 ${i + 1}-${c + 1}`,
        name_en: `346B transmitter module ${i + 1}-${c + 1}`,
        assembly: "radar",
        build_layer: 2,
        tags: ["internal"],
        geometry: M(B(0.5, 0.18, 0.42, [0, 0, 0], 0.004), C(0.03, 0.06, [0.2, 0, 0.23], 6)),
        material: "cv_aesa",
        mate: A([x, 30.65 + c * 0.22, z + 0.02]),
      });
    }
    for (let c = 0; c < 2; c++) {
      add({
        id: `${P}radar.tx_conn_${i + 1}_${c + 1}`,
        name_cn: `346B 发射机柜接头 ${i + 1}-${c + 1}`,
        name_en: `346B transmitter connector ${i + 1}-${c + 1}`,
        assembly: "radar",
        build_layer: 2,
        tags: ["internal"],
        geometry: M(C(0.05, 0.1, [0, 0, 0], 8)),
        material: "cv_brass",
        mate: A([x - 0.16 + c * 0.32, 30.4, z + 0.24]),
      });
    }
  }
  for (let i = 0; i < 8; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const z = i < 4 ? 17.8 : 22.2;
    add({
      id: `${P}radar.mast_conduit_${i + 1}`,
      name_cn: `桅顶波导管 ${i + 1}`,
      name_en: `mast waveguide conduit ${i + 1}`,
      assembly: "radar",
      build_layer: 4,
      geometry: M({ type: "weld", from: [side * 2.5, 40.05, z], to: [side * 2.5, 38.85, z], radius: 0.04 }),
      material: "cv_copper",
      mate: A([0, 0, 0]),
    });
  }
  for (let i = 0; i < 4; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const z = i < 2 ? 18.3 : 21.7;
    add({
      id: `${P}radar.ew_aux_panel_${i + 1}`,
      name_cn: `桅顶辅助电子战阵面 ${i + 1}`,
      name_en: `auxiliary EW array ${i + 1}`,
      assembly: "radar",
      build_layer: 4,
      geometry: M(B(0.8, 0.6, 0.12, [0, 0, 0], 0.008)),
      material: "cv_aesa",
      mate: A([side * 2.7, 40.6, z]),
    });
    for (let e = 0; e < 8; e++) {
      add({
        id: `${P}radar.ew_aux_elem_${i + 1}_${e + 1}`,
        name_cn: `辅助电子战阵元 ${i + 1}-${e + 1}`,
        name_en: `auxiliary EW element ${i + 1}-${e + 1}`,
        assembly: "radar",
        build_layer: 4,
        geometry: M(B(0.12, 0.12, 0.04, [0, 0, 0], 0.002)),
        material: "cv_055_aesa_tile",
        mate: A([side * 2.7 - 0.3 + (e % 4) * 0.2, 40.44 + Math.floor(e / 4) * 0.16, z + (side > 0 ? 0.08 : -0.08)]),
      });
    }
  }
  for (let i = 0; i < 12; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    add({
      id: `${P}radar.platform_antenna_${i + 1}`,
      name_cn: `桅顶通信天线 ${i + 1}`,
      name_en: `mast communication antenna ${i + 1}`,
      assembly: "radar",
      build_layer: 4,
      geometry: M(C(0.018, 0.34, [0, 0, 0], 6)),
      material: "cv_steel_dark",
      mate: A([side * (1.0 + (i % 6) * 0.3), 40.47, i < 6 ? 17.7 : 22.3]),
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
    name_cn: `通用垂发井盖 ×${staticCells.length}（另 ${VLS_HEROES.length} 格为动态井盖）`,
    name_en: `VLS hatch ×${staticCells.length}`,
    assembly: "vls",
    build_layer: 4,
    geometry: { type: "kit", kit: "type055VlsHatch" },
    material: "cv_vls_hatch",
    instances: staticCells.length,
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
      add({
        id: `${P}vls.glider_core_${tag}`,
        name_cn: `鹰击-21 滑翔体尾焰白芯 ${tag}`,
        name_en: `YJ-21 glider plume core ${tag}`,
        assembly: "vls",
        build_layer: 5,
        geometry: { type: "kit", kit: "type055VlsFlame" },
        material: "cv_flame_core",
        node: gliderNode,
        mate: A([0, -1.2, 0]),
        scale: [0.52, 0.62, 0.52],
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
    add({
      id: `${P}vls.flame_core_${tag}`,
      name_cn: `${spec.label} 尾焰白芯 ${tag}`,
      name_en: `${spec.label} plume core ${tag}`,
      assembly: "vls",
      build_layer: 5,
      geometry: { type: "kit", kit: "type055VlsFlame" },
      material: "cv_flame_core",
      node: missileNode,
      mate: A([0, -half, 0]),
      scale: [0.52, 0.62, 0.52],
      tags: ["fx"],
    });
    add({
      id: `${P}vls.trail_${tag}`,
      name_cn: `${spec.label} 尾迹 ${tag}`,
      name_en: `${spec.label} smoke trail ${tag}`,
      assembly: "vls",
      build_layer: 5,
      geometry: { type: "kit", kit: "type055VlsFlame" },
      material: "cv_missile_trail",
      node: missileNode,
      mate: A([0, -half, 0]),
      scale: [1.9, 3.4, 1.9],
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
  // 每个井口独立密封圈 / 单元编号牌 / 模块冷却管
  for (const cell of allCells) {
    const y = t55DeckTop(cell.z);
    add({
      id: `${P}vls.seal_${cell.bank}_${cell.row}_${cell.col}`,
      name_cn: `垂发井口密封圈 ${cell.bank}-${cell.row}-${cell.col}`,
      name_en: `VLS cell seal ${cell.bank}-${cell.row}-${cell.col}`,
      assembly: "vls",
      build_layer: 3,
      geometry: M(T(0.47, 0.43, 0.022, [0, 0, 0], 18)),
      material: "cv_rubber",
      mate: A([cell.x, y + 0.02, cell.z]),
    });
    add({
      id: `${P}vls.cell_tag_${cell.bank}_${cell.row}_${cell.col}`,
      name_cn: `垂发单元编号牌 ${cell.bank}-${cell.row}-${cell.col}`,
      name_en: `VLS cell number plate ${cell.bank}-${cell.row}-${cell.col}`,
      assembly: "vls",
      build_layer: 4,
      geometry: M(B(0.16, 0.008, 0.08, [0, 0, 0], 0.001)),
      material: "cv_deck_line",
      mate: A([cell.x, y + 0.018, cell.z + 0.49]),
    });
  }
  for (const [tag, z0, rows] of [
    ["fwd", VLS.FWD_Z, VLS.FWD_ROWS],
    ["aft", VLS.AFT_Z, VLS.AFT_ROWS],
  ] as const) {
    for (let r = 0; r < rows; r++) {
      const z = z0 + r * VLS.PITCH + VLS.PITCH / 2;
      add({
        id: `${P}vls.module_cool_${tag}_${r + 1}`,
        name_cn: `垂发模块冷却管 ${tag} ${r + 1}`,
        name_en: `VLS module cooling pipe ${tag} ${r + 1}`,
        assembly: "vls",
        build_layer: 3,
        geometry: M({ type: "weld", from: [-3.3, 0, 0], to: [3.3, 0, 0], radius: 0.03 }),
        material: "cv_copper",
        mate: A([0, t55DeckTop(z) + 0.025, z]),
      });
    }
    for (let v = 0; v < 4; v++) {
      add({
        id: `${P}vls.gas_vent_cell_${tag}_${v + 1}`,
        name_cn: `垂发燃气排导格栅 ${tag} ${v + 1}`,
        name_en: `VLS gas vent grille ${tag} ${v + 1}`,
        assembly: "vls",
        build_layer: 4,
        geometry: M(B(0.34, 0.02, 0.5, [0, 0, 0], 0.002), ...Array.from({ length: 4 }, (_, k) => B(0.3, 0.012, 0.04, [0, 0.012, -0.2 + k * 0.13], 0.001))),
        material: "cv_steel_dark",
        mate: A([-2.85 + v * 1.9, t55DeckTop(z0 + rows * VLS.PITCH) + 0.03, z0 + rows * VLS.PITCH + 0.45]),
      });
    }
  }
  // 动态导弹：弹体识别环/电缆槽/TVC/分离螺栓，随导弹节点运动
  for (const hero of VLS_HEROES) {
    const tag = hero.tag;
    const spec = MISSILES[hero.type];
    const half = spec.length / 2;
    const radius = spec.diameter / 2;
    const missileNode = `CV_055_VlsMissile_${tag}`;
    for (let b = 0; b < 3; b++) {
      add({
        id: `${P}vls.body_band_${tag}_${b + 1}`,
        name_cn: `${spec.label} 弹体识别环 ${tag} ${b + 1}`,
        name_en: `${spec.label} body band ${tag} ${b + 1}`,
        assembly: "vls",
        build_layer: 3,
        geometry: M(T(radius + 0.008, radius, 0.035, [0, 0, 0], 16)),
        material: "cv_steel_dark",
        node: missileNode,
        mate: A([0, -half * 0.55 + b * half * 0.55, 0]),
      });
    }
    add({
      id: `${P}vls.raceway_${tag}`,
      name_cn: `${spec.label} 弹体电缆槽 ${tag}`,
      name_en: `${spec.label} umbilical raceway ${tag}`,
      assembly: "vls",
      build_layer: 3,
      geometry: M(B(0.05, spec.length * 0.52, 0.04, [0, 0, 0], 0.002)),
      material: "cv_steel",
      node: missileNode,
      mate: A([radius * 0.94, 0, 0]),
    });
    for (let a = 0; a < 4; a++) {
      const ang = (Math.PI * 2 * a) / 4;
      add({
        id: `${P}vls.tvc_${tag}_${a + 1}`,
        name_cn: `${spec.label} 推力矢量作动器 ${tag} ${a + 1}`,
        name_en: `${spec.label} TVC actuator ${tag} ${a + 1}`,
        assembly: "vls",
        build_layer: 3,
        geometry: M(C(0.035, 0.3, [0, 0, 0], 8), C(0.02, 0.12, [0, 0.21, 0], 6)),
        material: "cv_steel_dark",
        node: missileNode,
        mate: A([Math.cos(ang) * radius * 0.72, -half + 0.3, Math.sin(ang) * radius * 0.72]),
      });
    }
    for (const s of [-1, 1] as const) {
      add({
        id: `${P}vls.sep_bolt_${tag}_${s === -1 ? "l" : "r"}`,
        name_cn: `${spec.label} 分离螺栓 ${tag} ${s === -1 ? "左" : "右"}`,
        name_en: `${spec.label} separation bolt ${tag} ${s === -1 ? "l" : "r"}`,
        assembly: "vls",
        build_layer: 3,
        geometry: M(C(0.025, 0.08, [0, 0, 0], 6)),
        material: "cv_steel",
        node: missileNode,
        mate: A([s * radius * 0.5, -half + 0.12, 0]),
      });
    }
    if (hero.type === "yj21") {
      for (let a = 0; a < 4; a++) {
        const ang = (Math.PI * 2 * a) / 4;
        add({
          id: `${P}vls.glider_actuator_${tag}_${a + 1}`,
          name_cn: `鹰击-21 滑翔体舵机 ${tag} ${a + 1}`,
          name_en: `YJ-21 glider actuator ${tag} ${a + 1}`,
          assembly: "vls",
          build_layer: 3,
          geometry: M(B(0.06, 0.18, 0.07, [0, 0, 0], 0.003)),
          material: "cv_steel_dark",
          node: `CV_055_VlsGlider_${tag}`,
          mate: A([Math.cos(ang) * 0.26, 0.35, Math.sin(ang) * 0.26]),
        });
      }
    }
  }

  // 静态井盖铰链销/锁扣；模块间燃气挡板与甲板喷淋
  for (const cell of staticCells) {
    const y = t55DeckTop(cell.z);
    const tag = `${cell.bank}_${cell.row}_${cell.col}`;
    add({
      id: `${P}vls.hinge_pin_${tag}`,
      name_cn: `垂发井盖铰链销 ${tag}`,
      name_en: `VLS hatch hinge pin ${tag}`,
      assembly: "vls",
      build_layer: 4,
      geometry: M(C(0.018, 0.07, [0, 0, 0], 6), T(0.035, 0.02, 0.015, [0, 0.04, 0], 8)),
      material: "cv_steel",
      mate: A([cell.x, y + 0.06, cell.z - 0.34]),
    });
    add({
      id: `${P}vls.latch_${tag}`,
      name_cn: `垂发井盖锁扣 ${tag}`,
      name_en: `VLS hatch latch ${tag}`,
      assembly: "vls",
      build_layer: 4,
      geometry: M(B(0.12, 0.025, 0.05, [0, 0, 0], 0.002), C(0.02, 0.03, [0, 0.02, 0], 6)),
      material: "cv_steel",
      mate: A([cell.x, y + 0.055, cell.z + 0.3]),
    });
  }
  for (const [tag, z0, rows] of [
    ["fwd", VLS.FWD_Z, VLS.FWD_ROWS],
    ["aft", VLS.AFT_Z, VLS.AFT_ROWS],
  ] as const) {
    for (let r = 0; r < rows; r++) {
      add({
        id: `${P}vls.blast_plate_${tag}_${r + 1}`,
        name_cn: `垂发模块燃气挡板 ${tag} ${r + 1}`,
        name_en: `VLS blast deflector ${tag} ${r + 1}`,
        assembly: "vls",
        build_layer: 4,
        geometry: M(B(7.6, 0.05, 0.1, [0, 0, 0], 0.004)),
        material: "cv_steel_dark",
        mate: A([0, t55DeckTop(z0 + r * VLS.PITCH) + 0.025, z0 + r * VLS.PITCH - 0.48]),
      });
    }
    for (let n = 0; n < 8; n++) {
      const z = z0 + (n < 4 ? -0.55 : rows * VLS.PITCH + 0.2);
      add({
        id: `${P}vls.deluge_${tag}_${n + 1}`,
        name_cn: `垂发甲板喷淋头 ${tag} ${n + 1}`,
        name_en: `VLS deck deluge nozzle ${tag} ${n + 1}`,
        assembly: "vls",
        build_layer: 4,
        geometry: M(C(0.05, 0.1, [0, 0, 0], 8), T(0.08, 0.03, 0.02, [0, 0.06, 0], 8)),
        material: "cv_brass",
        mate: A([-3.0 + (n % 4) * 2.0, t55DeckTop(z) + 0.06, z]),
      });
    }
  }
  for (const hero of VLS_HEROES) {
    const spec = MISSILES[hero.type];
    const half = spec.length / 2;
    const radius = spec.diameter / 2;
    for (const s of [-1, 1] as const) {
      add({
        id: `${P}vls.fin_actuator_${hero.tag}_${s === -1 ? "l" : "r"}`,
        name_cn: `${spec.label} 尾翼作动器 ${hero.tag} ${s === -1 ? "左" : "右"}`,
        name_en: `${spec.label} fin actuator ${hero.tag}`,
        assembly: "vls",
        build_layer: 3,
        geometry: M(B(0.06, 0.12, 0.1, [0, 0, 0], 0.003), C(0.02, 0.06, [0, 0.08, 0], 6)),
        material: "cv_steel_dark",
        node: `CV_055_VlsMissile_${hero.tag}`,
        mate: A([s * radius, half * 0.3, 0]),
      });
    }
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

  // VLS 备用弹/装填准备区：与 130mm 弹药库同层，导弹筒卧放在托架上，
  // 顶部有单轨吊与吊钩，可把筒体送到垂发装填口。
  for (const [cx, cz, tag] of [
    [-1.7, T55.GUN_Z - 10.2, "l1"],
    [1.7, T55.GUN_Z - 10.2, "r1"],
    [-1.7, T55.GUN_Z - 6.8, "l2"],
    [1.7, T55.GUN_Z - 6.8, "r2"],
  ] as const) {
    add({
      id: `${P}gun.vls_canister_${tag}`,
      name_cn: `VLS 备用弹筒 ${tag.toUpperCase()}`,
      name_en: `VLS spare canister ${tag}`,
      assembly: "weapons",
      build_layer: 2,
      geometry: M(
        { type: "latheZ", profile: [[0.02, -1.7], [0.22, -1.55], [0.32, -1.1], [0.32, 1.1], [0.22, 1.55], [0.02, 1.7]], segments: 20 },
        T(0.34, 0.28, 0.08, [0, 0, 1.62], 18),
        T(0.34, 0.28, 0.08, [0, 0, -1.62], 18),
        B(0.06, 0.04, 0.7, [0, 0.32, 0.2], 0.004),
        B(0.06, 0.04, 0.7, [0, -0.32, 0.2], 0.004),
      ),
      material: "cv_055_shell",
      mate: A([cx, 5.65, cz]),
    });
    add({
      id: `${P}gun.vls_canister_cradle_${tag}`,
      name_cn: `VLS 备用弹托架 ${tag.toUpperCase()}`,
      name_en: `VLS canister cradle ${tag}`,
      assembly: "weapons",
      build_layer: 2,
      geometry: M(
        B(0.9, 0.08, 1.5, [0, 0.04, 0], 0.006),
        B(0.1, 0.45, 0.1, [-0.35, -0.18, -0.55], 0.004),
        B(0.1, 0.45, 0.1, [0.35, -0.18, -0.55], 0.004),
        B(0.1, 0.45, 0.1, [-0.35, -0.18, 0.55], 0.004),
        B(0.1, 0.45, 0.1, [0.35, -0.18, 0.55], 0.004),
      ),
      material: "cv_steel_dark",
      mate: A([cx, 5.28, cz]),
    });
  }
  add({
    id: `${P}gun.vls_reload_rail`,
    name_cn: "VLS 装填单轨/吊钩",
    name_en: "VLS reload monorail and hoist",
    assembly: "weapons",
    build_layer: 2,
    geometry: M(
      B(3.8, 0.08, 0.1, [0, 0, 0], 0.006),
      { type: "weld", from: [0, -0.04, 0], to: [0, -0.55, 0], radius: 0.03 },
      { type: "torus", radius: 0.12, tube: 0.025, radialSegments: 8, tubularSegments: 16, at: [0, -0.62, 0] },
      B(0.25, 0.3, 0.25, [1.5, -0.15, 0], 0.008),
    ),
    material: "cv_steel",
    mate: A([0, 6.7, T55.GUN_Z - 10.4]),
  });
  add({
    id: `${P}gun.vls_reload_screen`,
    name_cn: "VLS 装填控制屏",
    name_en: "VLS reload control screen",
    assembly: "weapons",
    build_layer: 2,
    geometry: M(B(0.7, 0.45, 0.04, [0, 0, 0], 0.004), B(0.56, 0.32, 0.01, [0, 0, 0.03], 0.002)),
    material: "cv_055_console",
    mate: A([1.7, 6.0, T55.GUN_Z - 8.9]),
  });

  // ---------------- 近防/导弹 ----------------
  // 前近防炮真实位置在主炮/前垂发之后、舰桥之前的独立炮位平台上；
  // 旧版把它放在舰桥正前方同一高度（DECK+7.85，z=37.2），从舰桥看出去
  // 就是“一个球 + 一大堆炮管”糊在窗中央，还挡住整片前甲板。
  for (const [tag, z, y] of [["fwd", 40.3, DECK + 1.35], ["aft", -58, DECK + 6.75]] as const) {
    ctx.node({ name: `CV_055_Ciws_${tag}`, parent: "root", pivot: [0, y, z], motion: "rotate", axis: "y", rest_rotation: [0, tag === "aft" ? 180 : 0, 0], note: `1130 近防 ${tag}` });
    if (tag === "fwd") {
      add({
        id: `${P}ciws.fwd_platform`,
        name_cn: "前近防炮平台",
        name_en: "forward CIWS platform",
        assembly: "weapons",
        build_layer: 4,
        geometry: M(
          B(2.6, 0.9, 2.4, [0, 0, 0], 0.04),
          B(2.75, 0.08, 2.5, [0, 0.49, 0], 0.02),
          B(0.9, 0.55, 0.04, [0, -0.1, 1.21], 0.01),
          B(0.7, 0.06, 0.08, [0, 0.2, 1.24], 0.004),
          B(0.1, 0.1, 0.1, [-1.32, 0.1, 0.9], 0.004),
          B(0.1, 0.1, 0.1, [1.32, 0.1, 0.9], 0.004),
        ),
        material: "cv_055_hull",
        mate: A([0, DECK + 0.45, 40.3]),
      });
    }
    add({
      id: `${P}ciws.${tag}_base`,
      name_cn: `1130 近防基座 ${tag}`,
      name_en: `CIWS base ${tag}`,
      assembly: "weapons",
      build_layer: 4,
      geometry: M(
        C(1.05, 0.55, [0, 0, 0], 20),
        B(2.3, 0.18, 2.3, [0, -0.28, 0], 0.01),
      ),
      material: "cv_steel_dark",
      mate: A([0, y - 0.15, z]),
    });
    add({
      id: `${P}ciws.${tag}_turret`,
      name_cn: `1130 近防炮塔 ${tag}`,
      name_en: `CIWS turret ${tag}`,
      assembly: "weapons",
      build_layer: 4,
      geometry: M(
        C(0.9, 1.05, [0, 0, 0], 20),
        B(1.1, 0.7, 1.3, [0, 0.48, 0.12], 0.03),
        S(0.45, [0, 1.03, -0.3], 20),
        B(0.5, 0.3, 0.55, [0, 0.15, -0.72], 0.02),
      ),
      material: "cv_055_hull",
      node: `CV_055_Ciws_${tag}`,
      mate: A([0, 0.45, 0]),
    });
    // 11 根炮管各自独立：管体 + 隔热套 + 炮口环，近看能分辨 11 管转管炮。
    const barrelPositions: Array<[number, number]> = [];
    for (let b = 0; b < 11; b++) {
      const a = (b / 11) * Math.PI * 2;
      barrelPositions.push([Math.cos(a) * 0.19, Math.sin(a) * 0.19]);
    }
    for (const [b, [x, y]] of barrelPositions.entries()) {
      add({
        id: `${P}ciws.${tag}_barrel_${pad(b + 1)}`,
        name_cn: `1130 炮管 ${tag} ${b + 1}`,
        name_en: `1130 barrel ${tag} ${b + 1}`,
        assembly: "weapons",
        build_layer: 4,
        geometry: M(
          { type: "weld", from: [x, y, 0], to: [x, y, 2.05], radius: 0.04 },
          { type: "weld", from: [x, y, 0.42], to: [x, y, 1.02], radius: 0.055 },
          { type: "torus", radius: 0.052, tube: 0.014, radialSegments: 6, tubularSegments: 12, at: [x, y, 2.02] },
        ),
        material: "cv_steel_dark",
        node: `CV_055_Ciws_${tag}`,
        mate: A([0, 0.8, 0]),
      });
    }
    add({
      id: `${P}ciws.${tag}_barrels`,
      name_cn: `1130 炮管束/束紧环 ${tag}`,
      name_en: `1130 barrel cluster ${tag}`,
      assembly: "weapons",
      build_layer: 4,
      geometry: M(
        { type: "torus", radius: 0.25, tube: 0.03, radialSegments: 8, tubularSegments: 18, at: [0, 0, 0.38] },
        { type: "torus", radius: 0.25, tube: 0.03, radialSegments: 8, tubularSegments: 18, at: [0, 0, 1.3] },
        { type: "torus", radius: 0.24, tube: 0.035, radialSegments: 8, tubularSegments: 18, at: [0, 0, 1.88] },
        C(0.27, 0.34, [0, 0, 0.5], 16),
        C(0.3, 0.12, [0, 0, 1.92], 16),
      ),
      material: "cv_steel",
      node: `CV_055_Ciws_${tag}`,
      mate: A([0, 0.8, 0]),
    });
    // 弹鼓/供弹链/炮架耳轴/伺服
    add({
      id: `${P}ciws.${tag}_ammo_drum`,
      name_cn: `1130 弹鼓 ${tag}`,
      name_en: `1130 ammo drum ${tag}`,
      assembly: "weapons",
      build_layer: 4,
      geometry: M(C(0.34, 0.52, [0, 0, 0], 18), C(0.16, 0.1, [0, 0, 0.3], 12)),
      material: "cv_steel_dark",
      node: `CV_055_Ciws_${tag}`,
      mate: A([-0.62, 0.45, -0.82], [90, 0, 0]),
    });
    for (let b = 0; b < 11; b++) {
      const a = (b / 11) * Math.PI * 2;
      add({
        id: `${P}ciws.${tag}_round_${pad(b + 1)}`,
        name_cn: `1130 弹鼓待发弹 ${tag} ${b + 1}`,
        name_en: `1130 ready round ${tag} ${b + 1}`,
        assembly: "weapons",
        build_layer: 4,
        geometry: M(C(0.026, 0.1, [0, 0, 0], 6)),
        material: "cv_brass",
        node: `CV_055_Ciws_${tag}`,
        mate: A([-0.9, 0.45 + Math.cos(a) * 0.18, -0.82 + Math.sin(a) * 0.18]),
      });
    }
    for (let s = 0; s < 3; s++) {
      add({
        id: `${P}ciws.${tag}_feed_${s + 1}`,
        name_cn: `1130 供弹链 ${tag} ${s + 1}`,
        name_en: `1130 feed chute ${tag} ${s + 1}`,
        assembly: "weapons",
        build_layer: 4,
        geometry: M(B(0.18, 0.14, 0.32, [0, 0, 0], 0.006)),
        material: "cv_steel_dark",
        node: `CV_055_Ciws_${tag}`,
        mate: A([-0.44 + s * 0.12, 0.5 + s * 0.06, -0.56 + s * 0.12]),
      });
    }
    for (const s of [-1, 1] as const) {
      add({
        id: `${P}ciws.${tag}_trunnion_${s === -1 ? "l" : "r"}`,
        name_cn: `1130 俯仰耳轴 ${tag} ${s === -1 ? "左" : "右"}`,
        name_en: `1130 trunnion ${tag} ${s === -1 ? "l" : "r"}`,
        assembly: "weapons",
        build_layer: 4,
        geometry: M(C(0.09, 0.18, [0, 0, 0], 12), C(0.05, 0.12, [0, 0, 0.12], 10)),
        material: "cv_steel",
        node: `CV_055_Ciws_${tag}`,
        mate: A([s * 0.46, 0.82, 0.42], [0, 0, 90]),
      });
      add({
        id: `${P}ciws.${tag}_recoil_${s === -1 ? "l" : "r"}`,
        name_cn: `1130 制退机 ${tag} ${s === -1 ? "左" : "右"}`,
        name_en: `1130 recoil damper ${tag} ${s === -1 ? "l" : "r"}`,
        assembly: "weapons",
        build_layer: 4,
        geometry: M(C(0.06, 0.6, [0, 0, 0], 10)),
        material: "cv_steel_dark",
        node: `CV_055_Ciws_${tag}`,
        mate: A([s * 0.3, 0.82, 0.7], [0, 0, 90]),
      });
      add({
        id: `${P}ciws.${tag}_servo_${s === -1 ? "l" : "r"}`,
        name_cn: `1130 随动伺服 ${tag} ${s === -1 ? "左" : "右"}`,
        name_en: `1130 servo ${tag} ${s === -1 ? "l" : "r"}`,
        assembly: "weapons",
        build_layer: 4,
        geometry: M(B(0.2, 0.22, 0.24, [0, 0, 0], 0.008), C(0.05, 0.12, [s * 0.1, 0.16, 0], 10)),
        material: "cv_steel_dark",
        node: `CV_055_Ciws_${tag}`,
        mate: A([s * 0.58, 0.35, -0.45]),
      });
    }
    // 光电/雷达跟踪头
    add({
      id: `${P}ciws.${tag}_eo`,
      name_cn: `1130 光电跟踪球 ${tag}`,
      name_en: `1130 EO director ${tag}`,
      assembly: "weapons",
      build_layer: 4,
      geometry: M(S(0.22, [0, 0, 0], 14), C(0.14, 0.12, [0, -0.18, 0], 10)),
      material: "cv_radar_dark",
      node: `CV_055_Ciws_${tag}`,
      mate: A([0.34, 1.25, 0.18]),
    });
    for (let l = 0; l < 3; l++) {
      add({
        id: `${P}ciws.${tag}_eo_lens_${l + 1}`,
        name_cn: `1130 光电窗口 ${tag} ${l + 1}`,
        name_en: `1130 EO window ${tag} ${l + 1}`,
        assembly: "weapons",
        build_layer: 4,
        geometry: M(C(0.045, 0.02, [0, 0, 0], 8)),
        material: l === 1 ? "cv_glass" : "cv_radar",
        node: `CV_055_Ciws_${tag}`,
        mate: A([0.34 - 0.08 + l * 0.08, 1.25, 0.4], [90, 0, 0]),
      });
    }
    add({
      id: `${P}ciws.${tag}_track_radar`,
      name_cn: `1130 跟踪雷达罩 ${tag}`,
      name_en: `1130 tracking radome ${tag}`,
      assembly: "weapons",
      build_layer: 4,
      geometry: M(S(0.3, [0, 0, 0], 16), C(0.2, 0.16, [0, -0.24, 0], 12)),
      material: "cv_radar",
      node: `CV_055_Ciws_${tag}`,
      mate: A([-0.34, 1.3, 0.02]),
    });
    add({
      id: `${P}ciws.${tag}_radar_yoke`,
      name_cn: `1130 雷达俯仰架 ${tag}`,
      name_en: `1130 radar yoke ${tag}`,
      assembly: "weapons",
      build_layer: 4,
      geometry: M(B(0.5, 0.08, 0.08, [0, 0, 0], 0.004), C(0.035, 0.12, [0, 0, 0], 8)),
      material: "cv_steel_dark",
      node: `CV_055_Ciws_${tag}`,
      mate: A([-0.34, 1.02, 0.02]),
    });
    // 炮塔检修门/把手
    for (let p = 0; p < 4; p++) {
      const ang = 45 + p * 90;
      const rad = (ang * Math.PI) / 180;
      add({
        id: `${P}ciws.${tag}_panel_${p + 1}`,
        name_cn: `1130 炮塔检修板 ${tag} ${p + 1}`,
        name_en: `1130 turret access panel ${tag} ${p + 1}`,
        assembly: "weapons",
        build_layer: 4,
        geometry: M(B(0.34, 0.4, 0.05, [0, 0, 0], 0.004), B(0.12, 0.03, 0.04, [0, -0.12, 0.03], 0.002)),
        material: "cv_055_hull",
        node: `CV_055_Ciws_${tag}`,
        mate: A([Math.cos(rad) * 0.84, 0.5, Math.sin(rad) * 0.84], [0, -ang + 90, 0]),
      });
    }
    // 基座细节
    for (let b = 0; b < 8; b++) {
      const a = (Math.PI * 2 * b) / 8;
      add({
        id: `${P}ciws.${tag}_base_bolt_${b + 1}`,
        name_cn: `1130 基座地脚螺栓 ${tag} ${b + 1}`,
        name_en: `1130 base bolt ${tag} ${b + 1}`,
        assembly: "weapons",
        build_layer: 4,
        geometry: M(C(0.035, 0.08, [0, 0, 0], 6)),
        material: "cv_steel",
        mate: A([Math.cos(a) * 1.0, y - 0.42, z + Math.sin(a) * 1.0]),
      });
    }
    add({
      id: `${P}ciws.${tag}_train_ring`,
      name_cn: `1130 回转齿圈 ${tag}`,
      name_en: `1130 training ring ${tag}`,
      assembly: "weapons",
      build_layer: 4,
      geometry: M(T(0.95, 0.8, 0.1, [0, 0, 0], 20)),
      material: "cv_steel_dark",
      mate: A([0, y - 0.3, z]),
    });
    add({
      id: `${P}ciws.${tag}_ammo_hatch`,
      name_cn: `1130 弹舱门 ${tag}`,
      name_en: `1130 ammo hatch ${tag}`,
      assembly: "weapons",
      build_layer: 4,
      geometry: M(B(0.6, 0.12, 0.4, [0, 0, 0], 0.006), B(0.18, 0.04, 0.05, [0, 0.02, 0.2], 0.003)),
      material: "cv_055_hull",
      mate: A([0, y - 0.36, z + 0.95]),
    });
    for (let s = 0; s < 5; s++) {
      add({
        id: `${P}ciws.${tag}_ladder_${s + 1}`,
        name_cn: `1130 炮位直梯踏棍 ${tag} ${s + 1}`,
        name_en: `1130 ladder rung ${tag} ${s + 1}`,
        assembly: "weapons",
        build_layer: 4,
        geometry: M(B(0.05, 0.04, 0.4, [0, 0, 0], 0.003)),
        material: "cv_steel_dark",
        mate: A([0, y - 0.55 + s * 0.22, z + 1.0]),
      });
    }
  }
  // 1130 供弹/液压/伺服附件（随炮塔回转）
  for (const [tag] of [["fwd"], ["aft"]] as const) {
    for (let b = 0; b < 11; b++) {
      const a = (b / 11) * Math.PI * 2;
      const x = Math.cos(a) * 0.19;
      const y = 0.8 + Math.sin(a) * 0.19;
      add({
        id: `${P}ciws.${tag}_gas_tube_${pad(b + 1)}`,
        name_cn: `1130 导气管 ${tag} ${b + 1}`,
        name_en: `1130 gas tube ${tag} ${b + 1}`,
        assembly: "weapons",
        build_layer: 4,
        geometry: M({ type: "weld", from: [x, y, 0.2], to: [x, y, 0.55], radius: 0.02 }),
        material: "cv_steel",
        node: `CV_055_Ciws_${tag}`,
        mate: A([0, 0, 0]),
      });
      add({
        id: `${P}ciws.${tag}_recoil_spring_${pad(b + 1)}`,
        name_cn: `1130 复进簧 ${tag} ${b + 1}`,
        name_en: `1130 recoil spring ${tag} ${b + 1}`,
        assembly: "weapons",
        build_layer: 4,
        geometry: M({ type: "weld", from: [x, y, 0.12], to: [x, y, 0.34], radius: 0.032 }),
        material: "cv_steel_dark",
        node: `CV_055_Ciws_${tag}`,
        mate: A([0, 0, 0]),
      });
    }
    for (const s of [-1, 1] as const) {
      add({
        id: `${P}ciws.${tag}_hyd_${s === -1 ? "l" : "r"}`,
        name_cn: `1130 液压管 ${tag} ${s === -1 ? "左" : "右"}`,
        name_en: `1130 hydraulic line ${tag} ${s === -1 ? "l" : "r"}`,
        assembly: "weapons",
        build_layer: 4,
        geometry: M({ type: "weld", from: [s * 0.6, 0.5, 0.2], to: [s * 0.42, 0.85, -0.2], radius: 0.015 }),
        material: "cv_rubber",
        node: `CV_055_Ciws_${tag}`,
        mate: A([0, 0, 0]),
      });
      add({
        id: `${P}ciws.${tag}_fc_cabinet_${s === -1 ? "l" : "r"}`,
        name_cn: `1130 火控机柜 ${tag} ${s === -1 ? "左" : "右"}`,
        name_en: `1130 fire control cabinet ${tag} ${s === -1 ? "l" : "r"}`,
        assembly: "weapons",
        build_layer: 4,
        geometry: M(B(0.25, 0.3, 0.22, [0, 0, 0], 0.006), B(0.18, 0.06, 0.02, [0, 0.05, 0.12], 0.002)),
        material: "cv_055_console",
        node: `CV_055_Ciws_${tag}`,
        mate: A([s * 0.62, 0.58, -0.35]),
      });
      add({
        id: `${P}ciws.${tag}_lifting_eye_${s === -1 ? "l" : "r"}`,
        name_cn: `1130 吊装环 ${tag} ${s === -1 ? "左" : "右"}`,
        name_en: `1130 lifting eye ${tag} ${s === -1 ? "l" : "r"}`,
        assembly: "weapons",
        build_layer: 4,
        geometry: M(T(0.06, 0.035, 0.02, [0, 0, 0], 8), C(0.02, 0.08, [0, -0.04, 0], 6)),
        material: "cv_steel",
        node: `CV_055_Ciws_${tag}`,
        mate: A([s * 0.38, 0.92, -0.22]),
      });
      add({
        id: `${P}ciws.${tag}_step_${s === -1 ? "l" : "r"}`,
        name_cn: `1130 炮位踏板 ${tag} ${s === -1 ? "左" : "右"}`,
        name_en: `1130 gunner step ${tag} ${s === -1 ? "l" : "r"}`,
        assembly: "weapons",
        build_layer: 4,
        geometry: M(B(0.3, 0.04, 0.16, [0, 0, 0], 0.003)),
        material: "cv_steel_dark",
        node: `CV_055_Ciws_${tag}`,
        mate: A([s * 0.55, 0.3, 0.5]),
      });
    }
    for (const [i, x] of [-0.22, 0.22].entries()) {
      add({
        id: `${P}ciws.${tag}_case_chute_${i + 1}`,
        name_cn: `1130 抛壳槽 ${tag} ${i + 1}`,
        name_en: `1130 case chute ${tag} ${i + 1}`,
        assembly: "weapons",
        build_layer: 4,
        geometry: M(B(0.18, 0.12, 0.45, [0, 0, 0], 0.006)),
        material: "cv_steel_dark",
        node: `CV_055_Ciws_${tag}`,
        mate: A([x, 0.5, -0.6]),
      });
    }
    for (let c = 0; c < 4; c++) {
      add({
        id: `${P}ciws.${tag}_cable_${c + 1}`,
        name_cn: `1130 电缆 ${tag} ${c + 1}`,
        name_en: `1130 cable ${tag} ${c + 1}`,
        assembly: "weapons",
        build_layer: 4,
        geometry: M({ type: "weld", from: [-0.3 + c * 0.2, 0.35, -0.55], to: [-0.35 + c * 0.2, 0.85, -0.2], radius: 0.01 }),
        material: "cv_rubber",
        node: `CV_055_Ciws_${tag}`,
        mate: A([0, 0, 0]),
      });
    }
  }
  for (const [tag, z] of [["fwd", 42.6], ["aft", -62]] as const) {
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
  // 机库吊车小车附件：滑轮组/吊索/吊钩/电机/限位/夹轨器
  for (const [i, x] of [-0.28, 0.28].entries()) {
    add({
      id: `${P}hangar.crane_sheave_${i + 1}`,
      name_cn: `机库吊车滑轮组 ${i + 1}`,
      name_en: `hangar crane sheave ${i + 1}`,
      assembly: "hangar",
      build_layer: 4,
      geometry: M(T(0.12, 0.07, 0.06, [0, 0, 0], 12)),
      material: "cv_steel",
      mate: A([x, t55DeckTop(-63) + 5.2, -62]),
    });
    add({
      id: `${P}hangar.crane_rail_clamp_${i + 1}`,
      name_cn: `机库吊车夹轨器 ${i + 1}`,
      name_en: `hangar crane rail clamp ${i + 1}`,
      assembly: "hangar",
      build_layer: 4,
      geometry: M(B(0.16, 0.12, 0.2, [0, 0, 0], 0.004)),
      material: "cv_steel_dark",
      mate: A([x, t55DeckTop(-63) + 5.85, -62]),
    });
  }
  add({
    id: `${P}hangar.crane_cable`,
    name_cn: "机库吊车吊索",
    name_en: "hangar crane hoist cable",
    assembly: "hangar",
    build_layer: 4,
    geometry: M({ type: "weld", from: [0, t55DeckTop(-63) + 5.7, -62], to: [0, t55DeckTop(-63) + 3.9, -62], radius: 0.02 }),
    material: "cv_steel",
    mate: A([0, 0, 0]),
  });
  add({
    id: `${P}hangar.crane_hook`,
    name_cn: "机库吊车吊钩",
    name_en: "hangar crane hook",
    assembly: "hangar",
    build_layer: 4,
    geometry: M(T(0.12, 0.07, 0.04, [0, 0, 0], 10)),
    material: "cv_steel",
    mate: A([0, t55DeckTop(-63) + 3.82, -62]),
  });
  add({
    id: `${P}hangar.crane_motor`,
    name_cn: "机库吊车卷扬电机",
    name_en: "hangar crane winch motor",
    assembly: "hangar",
    build_layer: 4,
    geometry: M(C(0.16, 0.32, [0, 0, 0], 12), C(0.08, 0.1, [0, 0.2, 0], 8)),
    material: "cv_steel_dark",
    mate: A([0.42, t55DeckTop(-63) + 5.78, -62]),
  });
  add({
    id: `${P}hangar.crane_gearbox`,
    name_cn: "机库吊车卷扬减速箱",
    name_en: "hangar crane winch gearbox",
    assembly: "hangar",
    build_layer: 4,
    geometry: M(B(0.32, 0.28, 0.3, [0, 0, 0], 0.008)),
    material: "cv_steel",
    mate: A([-0.4, t55DeckTop(-63) + 5.7, -62]),
  });
  add({
    id: `${P}hangar.crane_limit`,
    name_cn: "机库吊车高度限位",
    name_en: "hangar crane limit switch",
    assembly: "hangar",
    build_layer: 4,
    geometry: M(B(0.12, 0.12, 0.08, [0, 0, 0], 0.004)),
    material: "cv_warning",
    mate: A([0.2, t55DeckTop(-63) + 5.35, -61.7]),
  });
  add({
    id: `${P}hangar.crane_pendant`,
    name_cn: "机库吊车操作手柄",
    name_en: "hangar crane pendant",
    assembly: "hangar",
    build_layer: 4,
    geometry: M({ type: "weld", from: [0.4, t55DeckTop(-63) + 5.6, -61.8], to: [0.4, t55DeckTop(-63) + 4.8, -61.5], radius: 0.012 }, B(0.16, 0.1, 0.12, [0.4, t55DeckTop(-63) + 4.75, -61.5], 0.004)),
    material: "cv_055_console",
    mate: A([0, 0, 0]),
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

  // ---------------- 艉封板细节与轴包套 ----------------
  add({
    id: `${P}hull.transom_ribs`,
    name_cn: "艉封板竖向加强筋 ×6",
    name_en: "transom stiffeners ×6",
    assembly: "hull",
    build_layer: 2,
    geometry: M(
      ...[-5.6, -3.36, -1.12, 1.12, 3.36, 5.6].map((x) => B(0.14, 4.2, 0.12, [x, 10.0, -90.04], 0.006)),
      B(11.4, 0.18, 0.14, [0, 12.4, -90.04], 0.006),
      B(11.4, 0.18, 0.14, [0, 7.8, -90.04], 0.006),
    ),
    material: "cv_055_hull",
    mate: A([0, 0, 0]),
  });
  add({
    id: `${P}hull.transom_doors`,
    name_cn: "艉封板水密门 ×2",
    name_en: "transom watertight doors ×2",
    assembly: "hull",
    build_layer: 3,
    geometry: M(
      B(0.92, 1.8, 0.08, [-2.4, 9.0, -90.08], 0.01),
      B(0.92, 1.8, 0.08, [2.4, 9.0, -90.08], 0.01),
      B(0.1, 0.1, 0.05, [-2.4, 9.0, -90.14], 0.004),
      B(0.1, 0.1, 0.05, [2.4, 9.0, -90.14], 0.004),
    ),
    material: "cv_hull_dark",
    mate: A([0, 0, 0]),
  });
  add({
    id: `${P}hull.transom_hatch`,
    name_cn: "艉部拖曳声呐/检修口",
    name_en: "transom towed-array hatch",
    assembly: "hull",
    build_layer: 3,
    geometry: M(
      { type: "weld", from: [0, 0, 0], to: [0, 0, 0.12], radius: 0.58 },
      C(0.58, 0.12, [0, 0, 0.04], 22),
      C(0.44, 0.06, [0, 0, 0.11], 22),
    ),
    material: "cv_055_fitting",
    mate: A([0, 10.6, -90.1], [90, 0, 0]),
  });
  for (const side of [-1, 1] as const) {
    add({
      id: `${P}hull.shaft_bossing_${side === -1 ? "l" : "r"}`,
      name_cn: `轴包套 ${side === -1 ? "左" : "右"}`,
      name_en: `shaft bossing ${side === -1 ? "l" : "r"}`,
      assembly: "hull",
      build_layer: 2,
      geometry: M(C(0.85, 3.2, [0, 0, 0], 20), C(0.62, 0.6, [0, 0, 1.7], 18)),
      material: "cv_antifouling",
      mate: A([side * T55.SHAFT_X, 4.0, -88.2], [90, 0, 0]),
    });
  }

  // 燃气轮机/齿轮箱/轴系附件：油滤、燃油集管、检查盖、吊环、冷却管、轴承阳极
  for (const e of engines) {
    add({
      id: `${P}power.engine_oilfilter_${e.tag}`,
      name_cn: `GT ${e.tag} 滑油滤`,
      name_en: `GT ${e.tag} oil filter`,
      assembly: "propulsion",
      build_layer: 1,
      geometry: M(C(0.12, 0.3, [0, 0, 0], 12), C(0.06, 0.1, [0, 0.2, 0], 8)),
      material: "cv_steel",
      mate: A([e.x + 0.34, 6.55, e.z + 0.4]),
    });
    add({
      id: `${P}power.engine_fuelmanifold_${e.tag}`,
      name_cn: `GT ${e.tag} 燃油集管`,
      name_en: `GT ${e.tag} fuel manifold`,
      assembly: "propulsion",
      build_layer: 1,
      geometry: M({ type: "weld", from: [-0.6, 0, 0], to: [0.6, 0, 0], radius: 0.04 }),
      material: "cv_copper",
      mate: A([e.x, 6.1, e.z - 0.45]),
    });
    add({
      id: `${P}power.engine_inspection_${e.tag}`,
      name_cn: `GT ${e.tag} 检查盖`,
      name_en: `GT ${e.tag} inspection cover`,
      assembly: "propulsion",
      build_layer: 1,
      geometry: M(B(0.32, 0.02, 0.24, [0, 0, 0], 0.003), C(0.03, 0.04, [0.1, 0.02, 0], 6)),
      material: "cv_steel_dark",
      mate: A([e.x - 0.3, 6.6, e.z + 0.1]),
    });
    add({
      id: `${P}power.engine_lifting_${e.tag}`,
      name_cn: `GT ${e.tag} 吊装环`,
      name_en: `GT ${e.tag} lifting eye`,
      assembly: "propulsion",
      build_layer: 1,
      geometry: M(T(0.08, 0.045, 0.03, [0, 0, 0], 10), C(0.025, 0.1, [0, -0.05, 0], 6)),
      material: "cv_steel",
      mate: A([e.x, 6.95, e.z + 0.2]),
    });
    add({
      id: `${P}power.engine_coolant_${e.tag}`,
      name_cn: `GT ${e.tag} 冷却水管`,
      name_en: `GT ${e.tag} coolant line`,
      assembly: "propulsion",
      build_layer: 1,
      geometry: M({ type: "weld", from: [0, 0, -0.6], to: [0, 0, 0.6], radius: 0.035 }),
      material: "cv_steel",
      mate: A([e.x + 0.42, 6.3, e.z]),
    });
  }
  for (const side of [-1, 1] as const) {
    const gx = side * 3.0;
    for (let i = 0; i < 5; i++) {
      add({
        id: `${P}power.gearbox_detail_${side === -1 ? "l" : "r"}_${i + 1}`,
        name_cn: `并车齿轮箱附件 ${side === -1 ? "左" : "右"} ${i + 1}`,
        name_en: `gearbox accessory ${side === -1 ? "l" : "r"} ${i + 1}`,
        assembly: "propulsion",
        build_layer: 1,
        geometry: i === 0 ? M(B(0.4, 0.5, 0.03, [0, 0, 0], 0.004), T(0.07, 0.045, 0.04, [0.12, 0.12, 0.03], 10)) : i === 1 ? M(C(0.08, 0.04, [0, 0, 0], 10)) : i === 2 ? M({ type: "weld", from: [0, 0, 0], to: [0, 0, 0.5], radius: 0.04 }) : i === 3 ? M(B(0.55, 0.3, 0.35, [0, 0, 0], 0.006)) : M(T(0.09, 0.05, 0.03, [0, 0, 0], 10)),
        material: i === 2 ? "cv_copper" : "cv_steel_dark",
        mate: A([gx - 1.5 + i * 0.7, 5.7 + (i % 2) * 0.6, -45.65 + 1.72]),
      });
    }
    for (const bz of [-52, -62, -72, -82, -89]) {
      add({
        id: `${P}power.bearing_detail_${side === -1 ? "l" : "r"}_${Math.abs(bz)}`,
        name_cn: `轴系轴承附件 ${side === -1 ? "左" : "右"} z${bz}`,
        name_en: `shaft bearing accessory ${side === -1 ? "l" : "r"} z${bz}`,
        assembly: "propulsion",
        build_layer: 1,
        geometry: M(C(0.06, 0.08, [0, 0, 0], 8), T(0.14, 0.09, 0.03, [0, 0.06, 0], 10)),
        material: "cv_brass",
        mate: A([side * T55.SHAFT_X, 4.45, bz]),
      });
    }
    // 可调距桨桨根/桨毂/阳极
    for (let b = 0; b < 5; b++) {
      const a = (Math.PI * 2 * b) / 5;
      add({
        id: `${P}power.prop_root_${side === -1 ? "l" : "r"}_${b + 1}`,
        name_cn: `可调距桨桨根 ${side === -1 ? "左" : "右"} ${b + 1}`,
        name_en: `CPP blade root ${side === -1 ? "l" : "r"} ${b + 1}`,
        assembly: "propulsion",
        build_layer: 1,
        geometry: M(C(0.09, 0.18, [0, 0, 0], 10), T(0.14, 0.1, 0.04, [0, 0.1, 0], 10)),
        material: "cv_steel",
        node: side === -1 ? "CV_055_PropL" : "CV_055_PropR",
        mate: A([Math.cos(a) * 0.68, Math.sin(a) * 0.68, 0]),
      });
      add({
        id: `${P}power.prop_anode_${side === -1 ? "l" : "r"}_${b + 1}`,
        name_cn: `桨叶牺牲阳极 ${side === -1 ? "左" : "右"} ${b + 1}`,
        name_en: `propeller anode ${side === -1 ? "l" : "r"} ${b + 1}`,
        assembly: "propulsion",
        build_layer: 1,
        geometry: M(C(0.05, 0.03, [0, 0, 0], 8)),
        material: "cv_brass",
        node: side === -1 ? "CV_055_PropL" : "CV_055_PropR",
        mate: A([Math.cos(a) * 1.2, Math.sin(a) * 1.2, 0]),
      });
    }
    add({
      id: `${P}power.prop_hubcap_${side === -1 ? "l" : "r"}`,
      name_cn: `桨毂整流帽 ${side === -1 ? "左" : "右"}`,
      name_en: `propeller hub cap ${side === -1 ? "l" : "r"}`,
      assembly: "propulsion",
      build_layer: 1,
      geometry: M(S(0.26, [0, 0, 0], 14), C(0.1, 0.1, [0, 0, -0.16], 10)),
      material: "cv_steel",
      node: side === -1 ? "CV_055_PropL" : "CV_055_PropR",
      mate: A([0, 0, -0.05]),
    });
    for (let b = 0; b < 4; b++) {
      const a = (Math.PI * 2 * b) / 4;
      add({
        id: `${P}power.shaft_bolt_${side === -1 ? "l" : "r"}_${b + 1}`,
        name_cn: `轴系法兰螺栓 ${side === -1 ? "左" : "右"} ${b + 1}`,
        name_en: `shaft flange bolt ${side === -1 ? "l" : "r"} ${b + 1}`,
        assembly: "propulsion",
        build_layer: 1,
        geometry: M(C(0.03, 0.08, [0, 0, 0], 6)),
        material: "cv_steel",
        mate: A([side * T55.SHAFT_X + Math.cos(a) * 0.28, 4.0 + Math.sin(a) * 0.28, -80.5]),
      });
    }
  }

  // ---------------- 舰桥/CIC/机舱内部 ----------------
  type StationScreen = { x: number; y: number; w: number; h: number; z: number; mat: string };
  interface Station {
    tag: string;
    role: string;
    x: number;
    z: number;
    floorY: number;
    kind: string;
    screens: StationScreen[];
    seat: string;
  }
  const screen = (x: number, y: number, w: number, h: number, mat: string, z = -0.455): StationScreen => ({ x, y, w, h, mat, z });
  const bridgeFloor = DECK + 7.46;
  const cicFloor = DECK + 4.76;
  const stations: Station[] = [
    { tag: "bridge_nav", role: "航海战位", x: -4.6, z: 27, floorY: bridgeFloor, kind: "nav", seat: "operator",
      screens: [screen(-0.32, 0.98, 0.52, 0.44, "cv_scr_chart"), screen(0.32, 0.98, 0.52, 0.44, "cv_scr_camera")] },
    { tag: "bridge_weapons", role: "武器战位", x: -2.8, z: 27, floorY: bridgeFloor, kind: "weapons", seat: "helm",
      screens: [screen(-0.4, 1.0, 0.34, 0.3, "cv_scr_radar"), screen(0, 1.0, 0.34, 0.3, "cv_scr_tactical"), screen(0.4, 1.0, 0.34, 0.3, "cv_scr_radar")] },
    { tag: "bridge_helm", role: "操舵战位", x: -1.0, z: 27, floorY: bridgeFloor, kind: "helm", seat: "helm",
      screens: [screen(0, 1.0, 1.1, 0.56, "cv_scr_camera")] },
    { tag: "bridge_ops", role: "作战战位", x: 0.8, z: 27, floorY: bridgeFloor, kind: "ops", seat: "operator",
      screens: [screen(-0.28, 1.0, 0.84, 0.54, "cv_scr_tactical"), screen(0.52, 0.94, 0.28, 0.32, "cv_scr_chart")] },
    { tag: "bridge_comms", role: "通信战位", x: 2.6, z: 27, floorY: bridgeFloor, kind: "comms", seat: "comms",
      screens: [screen(0, 0.98, 0.68, 0.5, "cv_scr_comms")] },
    { tag: "bridge_damage", role: "损管战位", x: 4.4, z: 27, floorY: bridgeFloor, kind: "damage", seat: "operator",
      screens: [screen(0, 0.99, 0.82, 0.54, "cv_scr_damage")] },
    { tag: "cic_radar", role: "雷达战位", x: -4.0, z: 13.5, floorY: cicFloor, kind: "radar", seat: "operator",
      screens: [screen(0, 0.99, 0.94, 0.54, "cv_scr_radar")] },
    { tag: "cic_sonar", role: "声呐战位", x: -2.0, z: 13.5, floorY: cicFloor, kind: "sonar", seat: "operator",
      screens: [screen(-0.3, 1.02, 0.46, 0.62, "cv_scr_sonar"), screen(0.3, 1.02, 0.46, 0.62, "cv_scr_chart")] },
    { tag: "cic_weapons", role: "武器战位", x: 0, z: 13.5, floorY: cicFloor, kind: "weapons", seat: "helm",
      screens: [screen(-0.38, 1.0, 0.3, 0.28, "cv_scr_radar"), screen(0, 1.0, 0.38, 0.34, "cv_scr_tactical"), screen(0.38, 1.0, 0.3, 0.28, "cv_scr_camera")] },
    { tag: "cic_tactical", role: "战术战位", x: 2.0, z: 13.5, floorY: cicFloor, kind: "tactical", seat: "operator",
      screens: [screen(0, 1.0, 1.12, 0.54, "cv_scr_tactical")] },
    { tag: "cic_ops", role: "作战战位", x: 4.0, z: 13.5, floorY: cicFloor, kind: "ops", seat: "operator",
      screens: [screen(-0.31, 0.98, 0.54, 0.46, "cv_scr_chart"), screen(0.31, 0.98, 0.54, 0.46, "cv_scr_camera")] },
    { tag: "cic_ciws", role: "近防指挥席", x: -4.4, z: 21.0, floorY: cicFloor, kind: "ciws", seat: "helm",
      screens: [screen(0.12, 1.0, 0.78, 0.48, "cv_scr_ciws"), screen(-0.52, 1.0, 0.32, 0.32, "cv_scr_radar")] },
    { tag: "cic_vls", role: "垂发指挥席", x: -1.5, z: 21.0, floorY: cicFloor, kind: "vls", seat: "operator",
      screens: [screen(0, 1.0, 0.86, 0.52, "cv_scr_vls"), screen(0.55, 0.96, 0.3, 0.3, "cv_scr_chart")] },
    { tag: "cic_cctv", role: "全舰监控席", x: 1.5, z: 21.0, floorY: cicFloor, kind: "cctv", seat: "comms",
      screens: [screen(-0.24, 1.09, 0.42, 0.32, "cv_scr_cctv"), screen(0.24, 1.09, 0.42, 0.32, "cv_scr_camera"), screen(-0.24, 0.8, 0.42, 0.32, "cv_scr_engine"), screen(0.24, 0.8, 0.42, 0.32, "cv_scr_damage")] },
    { tag: "cic_command", role: "指挥席", x: 4.4, z: 21.0, floorY: cicFloor, kind: "command", seat: "captain",
      screens: [screen(0, 1.0, 1.08, 0.5, "cv_scr_tactical"), screen(-0.62, 0.96, 0.28, 0.28, "cv_scr_vls"), screen(0.62, 0.96, 0.28, 0.28, "cv_scr_ciws")] },
    { tag: "cic_chart", role: "海图战位", x: -4.0, z: 17.5, floorY: cicFloor, kind: "chart", seat: "operator",
      screens: [screen(0, 0.98, 0.88, 0.5, "cv_scr_chart")] },
    { tag: "cic_comms", role: "通信战位", x: -2.0, z: 17.5, floorY: cicFloor, kind: "comms", seat: "comms",
      screens: [screen(-0.1, 0.99, 0.66, 0.5, "cv_scr_comms"), screen(0.52, 0.94, 0.28, 0.34, "cv_scr_tactical")] },
    { tag: "cic_damage", role: "损管战位", x: 0, z: 17.5, floorY: cicFloor, kind: "damage", seat: "operator",
      screens: [screen(-0.12, 1.0, 0.72, 0.54, "cv_scr_damage"), screen(0.52, 0.92, 0.28, 0.3, "cv_scr_comms")] },
    { tag: "cic_engine", role: "动力战位", x: 2.0, z: 17.5, floorY: cicFloor, kind: "engine", seat: "operator",
      screens: [screen(-0.3, 0.98, 0.52, 0.44, "cv_scr_engine"), screen(0.3, 0.98, 0.52, 0.44, "cv_scr_chart")] },
    { tag: "cic_eval", role: "综合评估席", x: 4.0, z: 17.5, floorY: cicFloor, kind: "eval", seat: "jump",
      screens: [screen(-0.31, 0.98, 0.54, 0.46, "cv_scr_tactical"), screen(0.31, 0.98, 0.54, 0.46, "cv_scr_damage")] },
  ];
  for (const [stationIndex, st] of stations.entries()) {
    add({
      id: `${P}interior.console_${st.tag}`,
      name_cn: `${st.role}控制台`,
      name_en: `${st.role} console`,
      assembly: "interior",
      build_layer: 2,
      geometry: { type: "kit", kit: "type055CommandConsole", params: { kind: st.tag } },
      material: ["cv_055_console", "cv_055_console_alt", "cv_055_console_alt2"][stationIndex % 3] ?? "cv_055_console",
      mate: A([st.x, st.floorY, st.z]),
    });
    st.screens.forEach((sc, index) => {
      add({
        id: `${P}interior.screen_${st.tag}_${index + 1}`,
        name_cn: `${st.role}显控屏 ${index + 1}`,
        name_en: `${st.role} screen ${index + 1}`,
        assembly: "interior",
        build_layer: 2,
        geometry: M(B(sc.w, sc.h, 0.025, [0, 0, 0], 0.002)),
        material: sc.mat,
        mate: A([st.x + sc.x, st.floorY + sc.y, st.z + sc.z]),
      });
    });
    // 每席座椅独立建模：不共享同一套几何/实例。
    add({
      id: `${P}interior.seat_${st.tag}`,
      name_cn: `${st.role}座椅`,
      name_en: `${st.role} seat`,
      assembly: "interior",
      build_layer: 2,
      geometry: { type: "kit", kit: "type055CommandChair", params: { kind: st.seat, station: st.tag } },
      material: st.seat === "captain" ? "cv_055_seat" : "cv_055_mesh",
      mate: A([st.x, st.floorY, st.z - 1.0]),
    });
    add({
      id: `${P}interior.seatbase_${st.tag}`,
      name_cn: `${st.role}座椅底座`,
      name_en: `${st.role} seat base`,
      assembly: "interior",
      build_layer: 2,
      geometry: { type: "kit", kit: "type055CommandChairBase" },
      material: "cv_steel_dark",
      mate: A([st.x, st.floorY, st.z - 1.0]),
    });
    // 每个战位桌面的随身/值更物件不同，避免所有席位像复制粘贴。
    const ix = st.x + (st.x <= 0 ? 0.56 : -0.56);
    const iy = st.floorY + 0.78;
    const iz = st.z + 0.06;
    const item = (id: string, cn: string, en: string, geometry: ReturnType<typeof M>, material: string) =>
      add({
        id: `${P}interior.deskitem_${id}`,
        name_cn: cn,
        name_en: en,
        assembly: "interior",
        build_layer: 3,
        geometry,
        material,
        mate: A([ix, iy, iz]),
      });
    if (st.tag === "bridge_nav" || st.tag === "cic_tactical") {
      item(st.tag, "海图夹", "chart binder", M(B(0.3, 0.04, 0.4, [0, 0.02, 0], 0.006), B(0.26, 0.01, 0.34, [0, 0.05, 0], 0.002)), "cv_deck_red");
    } else if (st.tag === "bridge_weapons" || st.tag === "cic_weapons") {
      item(st.tag, "值更电话", "watch phone", M(B(0.2, 0.06, 0.1, [0, 0.03, 0], 0.004), B(0.05, 0.03, 0.22, [0, 0.09, 0], 0.004)), "cv_055_bezel");
    } else if (st.tag === "bridge_helm") {
      item(st.tag, "磁罗经", "magnetic compass", M(C(0.15, 0.1, [0, 0.05, 0], 16), S(0.09, [0, 0.16, 0], 16), T(0.11, 0.095, 0.03, [0, 0.2, 0], 18)), "cv_055_prop");
    } else if (st.tag === "bridge_ops" || st.tag === "cic_ops") {
      item(st.tag, "值更日志/笔", "watch log", M(B(0.22, 0.02, 0.3, [0, 0.01, 0], 0.004), B(0.01, 0.01, 0.16, [0.05, 0.03, 0.03], 0.002)), "cv_deck_line");
    } else if (st.tag === "bridge_comms" || st.tag === "cic_comms" || st.tag === "cic_sonar") {
      item(st.tag, "耳机", "headset", M(B(0.24, 0.04, 0.04, [0, 0.12, 0], 0.004), C(0.04, 0.05, [-0.11, 0.04, 0], 10), C(0.04, 0.05, [0.11, 0.04, 0], 10)), "cv_055_console");
    } else if (st.tag === "bridge_damage" || st.tag === "cic_damage") {
      item(st.tag, "损管记录板", "damage board", M(B(0.26, 0.018, 0.34, [0, 0.01, 0], 0.004), B(0.12, 0.03, 0.03, [0, 0.05, -0.12], 0.004)), "cv_chart");
    } else if (st.tag === "cic_chart") {
      item(st.tag, "海图筒", "chart tube", M(C(0.05, 0.42, [0, 0.05, 0], 14)), "cv_chart");
    } else if (st.tag === "cic_engine") {
      item(st.tag, "保温杯", "mug", M(C(0.045, 0.11, [0, 0.055, 0], 14), T(0.04, 0.028, 0.03, [0.06, 0.06, 0], 12)), "cv_deck_line");
    } else {
      item(st.tag, "便签/笔", "notepad", M(B(0.18, 0.02, 0.24, [0, 0.01, 0], 0.004), B(0.01, 0.01, 0.14, [0.04, 0.03, 0], 0.002)), "cv_deck_line");
    }
  }
  // 每个战位的桌面随身物件：电话/水杯/便签，避免 20 个席位完全同一套摆件。
  for (const [index, st] of stations.entries()) {
    const ix = st.x + (st.x <= 0 ? 0.56 : -0.56);
    const iy = st.floorY + 0.78;
    const iz = st.z + 0.06;
    add({
      id: `${P}interior.deskphone_${index + 1}`,
      name_cn: `${st.role}桌面电话`,
      name_en: `${st.role} desk phone`,
      assembly: "interior",
      build_layer: 3,
      geometry: M(B(0.14, 0.03, 0.18, [0, 0, 0], 0.002), B(0.08, 0.02, 0.08, [0, 0.02, -0.05], 0.001)),
      material: "cv_055_console",
      mate: A([ix - 0.18, iy + 0.02, iz + 0.12]),
    });
    add({
      id: `${P}interior.deskmug_${index + 1}`,
      name_cn: `${st.role}水杯`,
      name_en: `${st.role} mug`,
      assembly: "interior",
      build_layer: 3,
      geometry: M(C(0.04, 0.09, [0, 0, 0], 10), C(0.032, 0.01, [0, 0.05, 0], 10)),
      material: "cv_055_seat",
      mate: A([ix + 0.12, iy + 0.045, iz + 0.16]),
    });
    add({
      id: `${P}interior.desknote_${index + 1}`,
      name_cn: `${st.role}便签`,
      name_en: `${st.role} desk note`,
      assembly: "interior",
      build_layer: 3,
      geometry: M(B(0.18, 0.006, 0.12, [0, 0, 0], 0.001), B(0.01, 0.01, 0.08, [0.05, 0.008, 0], 0.001)),
      material: "cv_deck_line",
      mate: A([ix + 0.18, iy + 0.006, iz - 0.12]),
    });
  }
  add({
    id: `${P}interior.bridge_dashboard`,
    name_cn: "舰桥前显控台",
    name_en: "bridge dashboard",
    assembly: "interior",
    build_layer: 2,
    geometry: M(B(7.4, 0.55, 0.65, [0, 0, 0], 0.02), B(0.9, 0.4, 0.06, [-2.1, 0.45, -0.33], 0.004), B(0.9, 0.4, 0.06, [0, 0.45, -0.33], 0.004), B(0.9, 0.4, 0.06, [2.1, 0.45, -0.33], 0.004)),
    material: "cv_055_console",
    mate: A([0, DECK + 8.25, 31.5]),
  });
  for (const [i, x] of [-2.1, 0, 2.1].entries()) {
    add({
      id: `${P}interior.bridge_dash_screen_${i + 1}`,
      name_cn: `舰桥前屏 ${i + 1}`,
      name_en: `bridge dash screen ${i + 1}`,
      assembly: "interior",
      build_layer: 2,
      geometry: M(B(0.8, 0.34, 0.03, [0, 0, 0], 0.002)),
      material: ["cv_scr_chart", "cv_scr_camera", "cv_scr_tactical"][i] ?? "cv_scr_tactical",
      mate: A([x, DECK + 8.72, 31.16], [-18, 0, 0]),
    });
  }

  add({
    id: `${P}interior.bridge_view_anchor`,
    name_cn: "舰桥第一人称视点锚点",
    name_en: "bridge first-person view anchor",
    assembly: "interior",
    build_layer: 2,
    geometry: M(B(0.004, 0.004, 0.004, [0, 0, 0], 0.001)),
    material: "cv_055_console",
    // 站在前显控台后方，眼点高于窗台，越过窗台看到前甲板/垂发/主炮。
    mate: A([0, DECK + 9.7, 30.5]),
  });
  add({
    id: `${P}interior.bridge_floor`,
    name_cn: "舰桥地板",
    name_en: "bridge floor",
    assembly: "interior",
    build_layer: 2,
    geometry: M(B(10.0, 0.12, 14, [0, 0, 0], 0.01)),
    material: "cv_055_carpet",
    mate: A([0, DECK + 7.4, 26]),
  });
  add({
    id: `${P}interior.cic_floor`,
    name_cn: "CIC 地板",
    name_en: "CIC floor",
    assembly: "interior",
    build_layer: 2,
    geometry: M(B(10.2, 0.12, 18.0, [0, 0, 0], 0.01)),
    material: "cv_055_carpet",
    mate: A([0, DECK + 4.7, 18]),
  });

  // ---------------- 舰桥内部：天花板/灯带/舰长椅/操舵/海图桌 ----------------
  add({
    id: `${P}interior.bridge_ceiling`,
    name_cn: "舰桥天花板",
    name_en: "bridge ceiling",
    assembly: "interior",
    build_layer: 2,
    geometry: M(B(9.2, 0.1, 14.2, [0, 0, 0], 0.01), B(9.0, 0.06, 0.16, [0, -0.07, -5.2], 0.006), B(9.0, 0.06, 0.16, [0, -0.07, 5.2], 0.006)),
    material: "cv_055_ceiling",
    mate: A([0, DECK + 12.6, 26]),
  });
  add({
    id: `${P}interior.bridge_lights`,
    name_cn: "舰桥顶灯带 ×3",
    name_en: "bridge ceiling lights ×3",
    assembly: "interior",
    build_layer: 3,
    geometry: M(
      B(2.2, 0.05, 0.55, [0, 0, -4.2], 0.004),
      B(2.2, 0.05, 0.55, [0, 0, 0], 0.004),
      B(2.2, 0.05, 0.55, [0, 0, 4.2], 0.004),
    ),
    material: "cv_055_lamp",
    mate: A([0, DECK + 12.54, 26]),
  });
  add({
    id: `${P}interior.bridge_dais`,
    name_cn: "舰长指挥台基座",
    name_en: "captain dais",
    assembly: "interior",
    build_layer: 2,
    geometry: M(B(2.4, 0.18, 1.8, [0, 0, 0], 0.02), B(2.2, 0.06, 1.6, [0, 0.12, 0], 0.01)),
    material: "cv_deck_plate",
    mate: A([0, DECK + 7.5, 24.2]),
  });
  add({
    id: `${P}interior.bridge_captain_chair`,
    name_cn: "舰长椅",
    name_en: "captain chair",
    assembly: "interior",
    build_layer: 3,
    geometry: M(
      C(0.16, 0.5, [0, 0.28, 0], 12),
      B(0.75, 0.18, 0.7, [0, 0.58, 0], 0.03),
      B(0.75, 0.9, 0.16, [0, 1.04, -0.32], 0.03),
      B(0.48, 0.26, 0.16, [0, 1.6, -0.32], 0.03),
      B(0.08, 0.32, 0.52, [-0.4, 0.78, 0], 0.02),
      B(0.08, 0.32, 0.52, [0.4, 0.78, 0], 0.02),
    ),
    material: "cv_upholstery",
    mate: A([0, DECK + 7.68, 24.2]),
  });
  add({
    id: `${P}interior.bridge_captain_seat_back`,
    name_cn: "舰长椅靠背（内部视角定位）",
    name_en: "captain seat back",
    assembly: "interior",
    build_layer: 3,
    geometry: M(B(0.48, 0.26, 0.16, [0, 0, 0], 0.02)),
    material: "cv_upholstery",
    mate: A([0, DECK + 9.28, 23.88]),
  });
  add({
    id: `${P}interior.bridge_helm`,
    name_cn: "操舵台",
    name_en: "helmsman console",
    assembly: "interior",
    build_layer: 3,
    geometry: M(
      B(0.9, 0.85, 0.55, [0, 0, 0], 0.03),
      B(1.0, 0.06, 0.35, [0, 0.44, -0.2], 0.01),
      C(0.24, 0.05, [0, 0.52, -0.25], 16),
      B(0.1, 0.28, 0.1, [0.28, 0.65, -0.25], 0.006),
      B(0.1, 0.28, 0.1, [0.44, 0.65, -0.25], 0.006),
    ),
    material: "cv_hull_dark",
    mate: A([0, DECK + 7.93, 30.6]),
  });
  add({
    id: `${P}interior.bridge_side_console_l`,
    name_cn: "舰桥左舷侧显控台",
    name_en: "bridge port side console",
    assembly: "interior",
    build_layer: 2,
    geometry: M(B(0.7, 1.0, 2.6, [0, 0, 0], 0.03), B(0.66, 0.44, 0.05, [0, 0.35, 0.55], 0.004), B(0.66, 0.44, 0.05, [0, 0.35, -0.55], 0.004)),
    material: "cv_hull_dark",
    mate: A([-3.95, DECK + 8.0, 28.6]),
  });
  add({
    id: `${P}interior.bridge_side_console_r`,
    name_cn: "舰桥右舷侧显控台",
    name_en: "bridge starboard side console",
    assembly: "interior",
    build_layer: 2,
    geometry: M(B(0.7, 1.0, 2.6, [0, 0, 0], 0.03), B(0.66, 0.44, 0.05, [0, 0.35, 0.55], 0.004), B(0.66, 0.44, 0.05, [0, 0.35, -0.55], 0.004)),
    material: "cv_hull_dark",
    mate: A([3.95, DECK + 8.0, 28.6]),
  });
  add({
    id: `${P}interior.bridge_side_screens`,
    name_cn: "舰桥侧显控屏 ×4",
    name_en: "bridge side screens ×4",
    assembly: "interior",
    build_layer: 3,
    geometry: M(
      B(0.6, 0.4, 0.03, [-3.95, DECK + 8.35, 29.15], 0.002),
      B(0.6, 0.4, 0.03, [-3.95, DECK + 8.35, 28.05], 0.002),
      B(0.6, 0.4, 0.03, [3.95, DECK + 8.35, 29.15], 0.002),
      B(0.6, 0.4, 0.03, [3.95, DECK + 8.35, 28.05], 0.002),
    ),
    material: "cv_scr_radar",
    mate: A([0, 0, 0]),
  });
  add({
    id: `${P}interior.bridge_chart_table`,
    name_cn: "舰桥海图桌",
    name_en: "bridge chart table",
    assembly: "interior",
    build_layer: 2,
    geometry: M(B(1.5, 0.9, 0.95, [0, 0, 0], 0.02), B(1.55, 0.06, 1.0, [0, 0.48, 0], 0.01), B(0.08, 0.12, 0.08, [0, 0.55, 0.4], 0.004)),
    material: "cv_hull_dark",
    mate: A([-3.15, DECK + 7.85, 24.4]),
  });
  add({
    id: `${P}interior.bridge_chart`,
    name_cn: "舰桥海图",
    name_en: "bridge chart",
    assembly: "interior",
    build_layer: 3,
    geometry: M(B(1.3, 0.02, 0.8, [0, 0, 0], 0.002)),
    material: "cv_chart",
    mate: A([-3.15, DECK + 8.36, 24.4]),
  });
  add({
    id: `${P}interior.bridge_rear_door`,
    name_cn: "舰桥后门",
    name_en: "bridge rear door",
    assembly: "interior",
    build_layer: 3,
    geometry: M(B(0.95, 1.95, 0.08, [0, 0, 0], 0.01), B(0.12, 0.12, 0.1, [0.28, 0, -0.06], 0.004)),
    material: "cv_hull_dark",
    mate: A([0, DECK + 8.55, 18.62]),
  });
  add({
    id: `${P}interior.bridge_aisle`,
    name_cn: "舰桥中央通道地毯",
    name_en: "bridge aisle carpet",
    assembly: "interior",
    build_layer: 3,
    geometry: M(B(2.0, 0.02, 8.0, [0, 0, 0], 0.004)),
    material: "cv_upholstery",
    mate: A([0, DECK + 7.47, 25.5]),
  });
  add({
    id: `${P}interior.bridge_overhead`,
    name_cn: "舰桥顶部仪表板",
    name_en: "bridge overhead panel",
    assembly: "interior",
    build_layer: 3,
    geometry: M(
      B(5.2, 0.16, 1.4, [0, 0, 0], 0.02),
      B(0.1, 0.5, 0.1, [-2.4, 0.32, -0.5], 0.006),
      B(0.1, 0.5, 0.1, [2.4, 0.32, -0.5], 0.006),
      B(0.9, 0.34, 0.04, [-1.5, -0.08, -0.72], 0.002),
      B(0.9, 0.34, 0.04, [0, -0.08, -0.72], 0.002),
      B(0.9, 0.34, 0.04, [1.5, -0.08, -0.72], 0.002),
    ),
    material: "cv_hull_dark",
    mate: A([0, DECK + 11.6, 29.4]),
  });

  // ---------------- CIC 内部：实体基座 + 围壁 + 主显控墙 + 战位 ----------------
  add({
    id: `${P}interior.cic_foundation`,
    name_cn: "CIC 实体基座（封住下方空腔）",
    name_en: "CIC solid foundation",
    assembly: "interior",
    build_layer: 1,
    geometry: M(B(10.6, 4.7, 18.4, [0, 0, 0], 0.02), B(0.16, 0.18, 18.4, [-5.2, 2.3, 0], 0.01), B(0.16, 0.18, 18.4, [5.2, 2.3, 0], 0.01)),
    material: "cv_hull_dark",
    mate: A([0, DECK + 2.35, 18]),
  });
  for (const side of [-1, 1] as const) {
    add({
      id: `${P}interior.cic_wall_${side === -1 ? "l" : "r"}`,
      name_cn: `CIC 围壁 ${side === -1 ? "左" : "右"}`,
      name_en: `CIC bulkhead ${side === -1 ? "l" : "r"}`,
      assembly: "interior",
      build_layer: 2,
      geometry: M(B(0.12, 2.3, 18.2, [0, 0, 0], 0.01), B(0.06, 0.08, 17.8, [side * 0.07, 0.55, 0], 0.004)),
      material: "cv_055_acoustic",
      mate: A([side * 5.1, DECK + 6.15, 18]),
    });
  }
  add({
    id: `${P}interior.cic_wall_fwd`,
    name_cn: "CIC 前围壁/主显控墙",
    name_en: "CIC forward bulkhead",
    assembly: "interior",
    build_layer: 2,
    geometry: M(B(10.2, 2.3, 0.12, [0, 0, 0], 0.01), B(9.0, 1.9, 0.16, [0, 0.02, -0.06], 0.01)),
    material: "cv_055_acoustic",
    mate: A([0, DECK + 6.15, 27.0]),
  });
  add({
    id: `${P}interior.cic_wall_aft`,
    name_cn: "CIC 后围壁",
    name_en: "CIC aft bulkhead",
    assembly: "interior",
    build_layer: 2,
    geometry: M(B(10.2, 2.3, 0.12, [0, 0, 0], 0.01)),
    material: "cv_055_acoustic",
    mate: A([0, DECK + 6.15, 9.0]),
  });
  add({
    id: `${P}interior.cic_ceiling`,
    name_cn: "CIC 天花板",
    name_en: "CIC ceiling",
    assembly: "interior",
    build_layer: 2,
    geometry: M(
      B(10.2, 0.1, 18.2, [0, 0, 0], 0.01),
      B(9.7, 0.06, 0.16, [0, -0.08, -6], 0.006),
      B(9.7, 0.06, 0.16, [0, -0.08, 0], 0.006),
      B(9.7, 0.06, 0.16, [0, -0.08, 6], 0.006),
      ...[-9, -6, -3, 0, 3, 6, 9].map((z) => B(10.0, 0.08, 0.14, [0, -0.06, z], 0.006)),
    ),
    material: "cv_055_acoustic",
    mate: A([0, DECK + 7.3, 18]),
  });
  add({
    id: `${P}interior.cic_lights`,
    name_cn: "CIC 顶灯带 ×6",
    name_en: "CIC ceiling lights ×6",
    assembly: "interior",
    build_layer: 3,
    geometry: M(
      ...[-6, 0, 6].flatMap((z) => [
        B(1.7, 0.05, 0.5, [-2.8, 0, z], 0.004),
        B(1.7, 0.05, 0.5, [2.8, 0, z], 0.004),
        B(1.5, 0.05, 0.42, [0, 0, z], 0.004),
      ]),
    ),
    material: "cv_055_lamp",
    mate: A([0, DECK + 7.24, 18]),
  });
  add({
    id: `${P}interior.cic_main_screen_frame`,
    name_cn: "CIC 主显控墙框",
    name_en: "CIC main screen frame",
    assembly: "interior",
    build_layer: 3,
    geometry: M(B(8.8, 1.5, 0.16, [0, 0, 0], 0.02), B(2.7, 1.12, 0.08, [-2.9, 0, -0.1], 0.01), B(2.7, 1.12, 0.08, [0, 0, -0.1], 0.01), B(2.7, 1.12, 0.08, [2.9, 0, -0.1], 0.01)),
    material: "cv_055_fitting",
    mate: A([0, DECK + 6.75, 27.0]),
  });
  for (const [tag, x, mat] of [
    ["l", -2.9, "cv_scr_chart"],
    ["c", 0, "cv_scr_tactical"],
    ["r", 2.9, "cv_scr_radar"],
  ] as const) {
    add({
      id: `${P}interior.cic_screen_${tag}`,
      name_cn: `CIC 主显控屏 ${tag}`,
      name_en: `CIC main screen ${tag}`,
      assembly: "interior",
      build_layer: 3,
      geometry: M(B(2.55, 1.18, 0.04, [0, 0, 0], 0.002)),
      material: mat,
      mate: A([x, DECK + 6.75, 26.88]),
    });
  }
  add({
    id: `${P}interior.cic_chart_table`,
    name_cn: "CIC 海图桌/指挥台",
    name_en: "CIC chart table",
    assembly: "interior",
    build_layer: 3,
    geometry: M(
      B(1.8, 0.92, 1.2, [0, 0, 0], 0.03),
      B(1.9, 0.06, 1.3, [0, 0.5, 0], 0.01),
      B(1.5, 0.02, 0.95, [0, 0.55, 0], 0.002),
      B(0.08, 0.12, 0.08, [0, 0.62, 0.5], 0.004),
    ),
    material: "cv_hull_dark",
    mate: A([0, DECK + 5.0, 10.8]),
  });
  add({
    id: `${P}interior.cic_chart`,
    name_cn: "CIC 海图",
    name_en: "CIC chart",
    assembly: "interior",
    build_layer: 3,
    geometry: M(B(1.42, 0.015, 0.88, [0, 0, 0], 0.002)),
    material: "cv_chart",
    mate: A([0, DECK + 5.56, 10.8]),
  });
  for (const side of [-1, 1] as const) {
    add({
      id: `${P}interior.cic_rack_${side === -1 ? "l" : "r"}`,
      name_cn: `CIC 通信/战术机柜 ${side === -1 ? "左" : "右"}`,
      name_en: `CIC equipment rack ${side === -1 ? "l" : "r"}`,
      assembly: "interior",
      build_layer: 3,
      geometry: M(B(0.48, 1.8, 3.0, [0, 0, 0], 0.02), B(0.4, 0.5, 0.05, [0, 0.35, -1.1], 0.004), B(0.4, 0.5, 0.05, [0, -0.35, -1.1], 0.004)),
      material: "cv_hull_dark",
      mate: A([side * 4.95, DECK + 5.95, 21.5]),
    });
    add({
      id: `${P}interior.cic_tray_${side === -1 ? "l" : "r"}`,
      name_cn: `CIC 电缆桥架 ${side === -1 ? "左" : "右"}`,
      name_en: `CIC cable tray ${side === -1 ? "l" : "r"}`,
      assembly: "interior",
      build_layer: 3,
      geometry: M(B(0.32, 0.08, 16.0, [0, 0, 0], 0.004), B(0.03, 0.12, 16.0, [-0.14, 0.05, 0], 0.004), B(0.03, 0.12, 16.0, [0.14, 0.05, 0], 0.004)),
      material: "cv_steel_dark",
      mate: A([side * 5.02, DECK + 7.05, 18]),
    });
  }
  for (const side of [-1, 1] as const) {
    add({
      id: `${P}interior.cic_rack_front_${side === -1 ? "l" : "r"}`,
      name_cn: `CIC 前部战位机柜 ${side === -1 ? "左" : "右"}`,
      name_en: `CIC forward rack ${side === -1 ? "l" : "r"}`,
      assembly: "interior",
      build_layer: 3,
      geometry: M(
        B(0.42, 1.65, 2.2, [0, 0, 0], 0.02),
        B(0.03, 0.36, 1.6, [side * -0.23, 0.2, 0], 0.002),
        B(0.03, 0.08, 0.08, [side * -0.23, -0.45, -0.7], 0.002),
        B(0.03, 0.08, 0.08, [side * -0.23, -0.45, -0.45], 0.002),
      ),
      material: "cv_hull_dark",
      mate: A([side * 4.92, DECK + 5.85, 12.8]),
    });
  }
  for (const side of [-1, 1] as const) {
    add({
      id: `${P}interior.cic_side_display_${side === -1 ? "l" : "r"}`,
      name_cn: `CIC 侧壁战术屏 ${side === -1 ? "左" : "右"}`,
      name_en: `CIC side display ${side === -1 ? "l" : "r"}`,
      assembly: "interior",
      build_layer: 3,
      geometry: M(
        B(0.05, 1.0, 1.8, [0, 0, 0], 0.002),
        B(0.03, 1.2, 2.0, [side * -0.05, 0, 0], 0.002),
        B(0.03, 0.3, 0.3, [side * -0.06, 0.5, 1.2], 0.004),
      ),
      material: side === -1 ? "cv_scr_radar" : "cv_scr_sonar",
      mate: A([side * 5.03, DECK + 6.3, 18]),
    });
  }
  for (const side of [-1, 1] as const) {
    add({
      id: `${P}interior.cic_duct_${side === -1 ? "l" : "r"}`,
      name_cn: `CIC 顶部通风/电缆管槽 ${side === -1 ? "左" : "右"}`,
      name_en: `CIC overhead duct ${side === -1 ? "l" : "r"}`,
      assembly: "interior",
      build_layer: 3,
      geometry: M(
        B(1.0, 0.4, 14.0, [0, 0, 0], 0.02),
        B(0.06, 0.22, 0.06, [0, 0.3, -5.5], 0.004),
        B(0.06, 0.22, 0.06, [0, 0.3, 0], 0.004),
        B(0.06, 0.22, 0.06, [0, 0.3, 5.5], 0.004),
      ),
      material: "cv_steel_dark",
      mate: A([side * 4.2, DECK + 6.95, 18]),
    });
    add({
      id: `${P}interior.cic_wall_ribs_${side === -1 ? "l" : "r"}`,
      name_cn: `CIC 围壁竖向加强筋 ${side === -1 ? "左" : "右"}`,
      name_en: `CIC wall ribs ${side === -1 ? "l" : "r"}`,
      assembly: "interior",
      build_layer: 3,
      geometry: M(
        ...[-7, -3.5, 0, 3.5, 7].map((z) => B(0.07, 2.2, 0.14, [0, 0, z], 0.006)),
      ),
      material: "cv_steel_dark",
      mate: A([side * 5.03, DECK + 6.15, 18]),
    });
  }
  add({
    id: `${P}interior.cic_aisle`,
    name_cn: "CIC 中央通道",
    name_en: "CIC aisle",
    assembly: "interior",
    build_layer: 3,
    geometry: M(B(2.2, 0.02, 12.0, [0, 0, 0], 0.004)),
    material: "cv_upholstery",
    mate: A([0, DECK + 4.78, 18.5]),
  });
  add({
    id: `${P}interior.cic_door`,
    name_cn: "CIC 后门",
    name_en: "CIC aft door",
    assembly: "interior",
    build_layer: 3,
    geometry: M(B(0.95, 1.95, 0.08, [0, 0, 0], 0.01), B(0.12, 0.12, 0.1, [0.28, 0, 0.06], 0.004)),
    material: "cv_hull_dark",
    mate: A([-3.8, DECK + 5.75, 8.98]),
  });

  // ---------------- 舰桥/ CIC 表面与窗框细节 ----------------
  for (const side of [-1, 1] as const) {
    add({
      id: `${P}interior.bridge_panel_low_${side === -1 ? "l" : "r"}`,
      name_cn: `舰桥侧壁下部吸音板 ${side === -1 ? "左" : "右"}`,
      name_en: `bridge lower acoustic panel ${side === -1 ? "l" : "r"}`,
      assembly: "interior",
      build_layer: 2,
      geometry: M(
        B(0.06, 1.3, 10.0, [0, 0, 0], 0.01),
        B(0.04, 0.05, 10.0, [side * -0.04, 0.55, 0], 0.004),
        B(0.04, 0.05, 10.0, [side * -0.04, -0.3, 0], 0.004),
      ),
      material: "cv_055_acoustic",
      mate: A([side * 4.5, DECK + 8.0, 26]),
    });
    add({
      id: `${P}interior.bridge_panel_high_${side === -1 ? "l" : "r"}`,
      name_cn: `舰桥侧壁上部吸音板 ${side === -1 ? "左" : "右"}`,
      name_en: `bridge upper acoustic panel ${side === -1 ? "l" : "r"}`,
      assembly: "interior",
      build_layer: 2,
      geometry: M(B(0.06, 1.6, 9.0, [0, 0, 0], 0.01)),
      material: "cv_055_acoustic",
      mate: A([side * 4.18, DECK + 10.3, 26]),
    });
  }
  add({
    id: `${P}interior.bridge_window_sill`,
    name_cn: "舰桥前窗下框/除霜风口",
    name_en: "bridge window sill and demister",
    assembly: "interior",
    build_layer: 3,
    geometry: M(
      B(6.9, 0.14, 0.42, [0, 0, 0], 0.01),
      B(5.8, 0.05, 0.16, [0, 0.07, -0.14], 0.004),
      B(0.14, 0.12, 0.38, [-3.35, -0.02, 0], 0.004),
      B(0.14, 0.12, 0.38, [3.35, -0.02, 0], 0.004),
    ),
    material: "cv_055_console",
    mate: A([0, DECK + 8.15, 33.28]),
  });
  add({
    id: `${P}interior.bridge_window_top`,
    name_cn: "舰桥前窗上框/遮阳板",
    name_en: "bridge window header and visor",
    assembly: "interior",
    build_layer: 3,
    geometry: M(B(6.9, 0.18, 0.7, [0, 0, 0], 0.01), B(6.0, 0.04, 0.5, [0, -0.12, 0.2], 0.004)),
    material: "cv_055_console",
    mate: A([0, DECK + 10.9, 32.78]),
  });
  add({
    id: `${P}interior.bridge_wipers`,
    name_cn: "舰桥雨刮器 ×2",
    name_en: "bridge wipers ×2",
    assembly: "interior",
    build_layer: 3,
    geometry: M(
      { type: "weld", from: [-2.5, 0, 0], to: [-2.35, 0.5, 0.05], radius: 0.009 },
      { type: "weld", from: [-2.35, 0.5, 0.05], to: [-2.25, 0.92, 0.07], radius: 0.007 },
      B(0.02, 0.4, 0.02, [-2.3, 0.72, 0.07], 0.002),
      { type: "weld", from: [2.5, 0, 0], to: [2.35, 0.5, 0.05], radius: 0.009 },
      { type: "weld", from: [2.35, 0.5, 0.05], to: [2.25, 0.92, 0.07], radius: 0.007 },
      B(0.02, 0.4, 0.02, [2.3, 0.72, 0.07], 0.002),
    ),
    material: "cv_steel_dark",
    mate: A([0, DECK + 8.45, 33.42]),
  });
  add({
    id: `${P}interior.bridge_floor_seams`,
    name_cn: "舰桥地毯分缝/金属压条 ×6",
    name_en: "bridge carpet seams ×6",
    assembly: "interior",
    build_layer: 3,
    geometry: M(
      ...[-4, -2, 0, 2, 4].map((z) => B(9.6, 0.012, 0.025, [0, 0, z], 0.002)),
      B(0.025, 0.012, 13.0, [0, 0, 0], 0.002),
    ),
    material: "cv_055_bezel",
    mate: A([0, DECK + 7.47, 26]),
  });
  add({
    id: `${P}interior.bridge_ceil_beams`,
    name_cn: "舰桥顶棚横梁/通风口 ×4",
    name_en: "bridge ceiling beams ×4",
    assembly: "interior",
    build_layer: 3,
    geometry: M(
      ...[-3.5, 0, 3.5].map((z) => B(9.0, 0.1, 0.18, [0, 0, z], 0.006)),
      B(0.9, 0.08, 0.35, [-2.4, -0.04, 1.75], 0.004),
      B(0.9, 0.08, 0.35, [2.4, -0.04, 1.75], 0.004),
    ),
    material: "cv_055_console",
    mate: A([0, DECK + 12.53, 26]),
  });
  add({
    id: `${P}interior.bridge_rear_lockers`,
    name_cn: "舰桥后壁储物柜 ×2",
    name_en: "bridge rear lockers ×2",
    assembly: "interior",
    build_layer: 3,
    geometry: M(
      B(1.1, 1.35, 0.32, [-3.0, 0, 0], 0.02),
      B(1.1, 1.35, 0.32, [3.0, 0, 0], 0.02),
      B(0.05, 0.3, 0.04, [-2.65, 0.2, -0.18], 0.004),
      B(0.05, 0.3, 0.04, [2.65, 0.2, -0.18], 0.004),
    ),
    material: "cv_055_console",
    mate: A([0, DECK + 8.3, 18.78]),
  });
  add({
    id: `${P}interior.bridge_status_board`,
    name_cn: "舰桥后壁状态板",
    name_en: "bridge status board",
    assembly: "interior",
    build_layer: 3,
    geometry: M(B(2.3, 0.95, 0.06, [0, 0, 0], 0.01), B(2.05, 0.72, 0.03, [0, 0, -0.05], 0.004)),
    material: "cv_055_bezel",
    mate: A([0, DECK + 9.45, 18.72]),
  });
  add({
    id: `${P}interior.bridge_status_screen`,
    name_cn: "舰桥状态屏",
    name_en: "bridge status screen",
    assembly: "interior",
    build_layer: 3,
    geometry: M(B(1.95, 0.64, 0.02, [0, 0, 0], 0.002)),
    material: "cv_scr_damage",
    mate: A([0, DECK + 9.45, 18.66]),
  });
  add({
    id: `${P}interior.bridge_extinguisher`,
    name_cn: "舰桥消防瓶",
    name_en: "bridge extinguisher",
    assembly: "interior",
    build_layer: 3,
    geometry: M(C(0.11, 0.55, [0, 0, 0], 12), C(0.05, 0.12, [0, 0.33, 0], 8), B(0.24, 0.05, 0.08, [0, 0.22, 0.04], 0.004)),
    material: "cv_deck_red",
    mate: A([4.15, DECK + 7.9, 19.7]),
  });

  // CIC 的深色墙面压条、顶棚梁、后壁状态屏和地面分缝。
  add({
    id: `${P}interior.cic_wall_trim`,
    name_cn: "CIC 围壁压条/踢脚",
    name_en: "CIC wall trim",
    assembly: "interior",
    build_layer: 3,
    geometry: M(
      B(10.1, 0.06, 0.08, [0, 0.95, 18], 0.004),
      B(10.1, 0.12, 0.08, [0, -0.98, 18], 0.004),
      B(0.06, 2.1, 18.0, [-5.02, 0, 18], 0.004),
      B(0.06, 2.1, 18.0, [5.02, 0, 18], 0.004),
    ),
    material: "cv_055_bezel",
    mate: A([0, DECK + 6.15, 18]),
  });
  add({
    id: `${P}interior.cic_ceil_beams`,
    name_cn: "CIC 顶棚横梁/通风口",
    name_en: "CIC ceiling beams",
    assembly: "interior",
    build_layer: 3,
    geometry: M(
      ...[-3.5, 0, 3.5].map((z) => B(10.0, 0.08, 0.16, [0, 0, z], 0.006)),
      B(1.0, 0.06, 0.3, [-2.6, -0.03, 1.8], 0.004),
      B(1.0, 0.06, 0.3, [2.6, -0.03, 1.8], 0.004),
    ),
    material: "cv_055_console",
    mate: A([0, DECK + 7.23, 18]),
  });
  add({
    id: `${P}interior.cic_rear_board`,
    name_cn: "CIC 后壁损管状态屏",
    name_en: "CIC damage control board",
    assembly: "interior",
    build_layer: 3,
    geometry: M(B(2.4, 1.05, 0.08, [0, 0, 0], 0.01), B(2.15, 0.8, 0.03, [0, 0, 0.05], 0.004)),
    material: "cv_055_bezel",
    mate: A([2.6, DECK + 6.25, 9.06]),
  });
  add({
    id: `${P}interior.cic_rear_screen`,
    name_cn: "CIC 后壁损管屏",
    name_en: "CIC damage control screen",
    assembly: "interior",
    build_layer: 3,
    geometry: M(B(2.02, 0.7, 0.02, [0, 0, 0], 0.002)),
    material: "cv_scr_damage",
    mate: A([2.6, DECK + 6.25, 9.0]),
  });
  add({
    id: `${P}interior.cic_floor_seams`,
    name_cn: "CIC 地毯分缝/金属压条",
    name_en: "CIC carpet seams",
    assembly: "interior",
    build_layer: 3,
    geometry: M(
      ...[-7, -4.2, 0, 4.2, 7].map((z) => B(9.9, 0.012, 0.025, [0, 0, z], 0.002)),
      B(0.025, 0.012, 16.8, [0, 0, 0], 0.002),
    ),
    material: "cv_055_bezel",
    mate: A([0, DECK + 4.77, 18]),
  });
  add({
    id: `${P}interior.cic_red_light`,
    name_cn: "CIC 红色应急灯",
    name_en: "CIC emergency red light",
    assembly: "interior",
    build_layer: 3,
    geometry: M(C(0.12, 0.1, [0, 0, 0], 12), B(0.16, 0.04, 0.16, [0, 0.08, 0], 0.004)),
    material: "cv_deck_red",
    mate: A([-4.8, DECK + 7.16, 9.6]),
  });

  // 指挥舱内的发光条、墙面副屏、CIC 标图桌：打散大块灰墙。
  for (const side of [-1, 1] as const) {
    add({
      id: `${P}interior.cic_wall_display_extra_${side === -1 ? "l" : "r"}`,
      name_cn: `CIC 侧壁副屏 ${side === -1 ? "左" : "右"}`,
      name_en: `CIC auxiliary wall display ${side === -1 ? "l" : "r"}`,
      assembly: "interior",
      build_layer: 3,
      geometry: M(
        B(0.06, 1.0, 1.5, [0, 0, 0], 0.004),
        B(0.04, 0.84, 1.32, [side * -0.05, 0, 0], 0.004),
      ),
      material: side === -1 ? "cv_scr_chart" : "cv_scr_radar",
      mate: A([side * 5.015, DECK + 6.25, 22.6]),
    });
    add({
      id: `${P}interior.cic_wall_led_${side === -1 ? "l" : "r"}`,
      name_cn: `CIC 侧壁灯带 ${side === -1 ? "左" : "右"}`,
      name_en: `CIC wall light strip ${side === -1 ? "l" : "r"}`,
      assembly: "interior",
      build_layer: 3,
      geometry: M(B(0.025, 0.05, 16.5, [0, 0, 0], 0.003)),
      material: "cv_055_lamp",
      mate: A([side * 5.08, DECK + 7.18, 18]),
    });
    add({
      id: `${P}interior.cic_duct_led_${side === -1 ? "l" : "r"}`,
      name_cn: `CIC 顶部灯带 ${side === -1 ? "左" : "右"}`,
      name_en: `CIC overhead light strip ${side === -1 ? "l" : "r"}`,
      assembly: "interior",
      build_layer: 3,
      geometry: M(B(0.5, 0.02, 12.5, [0, 0, 0], 0.003)),
      material: "cv_055_lamp",
      mate: A([side * 4.2, DECK + 7.06, 18]),
    });
  }
  add({
    id: `${P}interior.cic_plot_table`,
    name_cn: "CIC 战术标图桌",
    name_en: "CIC plotting table",
    assembly: "interior",
    build_layer: 3,
    geometry: M(
      B(1.5, 0.82, 1.05, [0, 0, 0], 0.02),
      B(1.62, 0.06, 1.16, [0, 0.44, 0], 0.01),
      B(1.5, 0.05, 0.08, [0, 0.5, 0.56], 0.006),
      B(1.5, 0.05, 0.08, [0, 0.5, -0.56], 0.006),
    ),
    material: "cv_055_console",
    mate: A([-3.3, DECK + 5.1, 22.2]),
  });
  add({
    id: `${P}interior.cic_plot_screen`,
    name_cn: "CIC 标图桌背光海图",
    name_en: "CIC backlit chart",
    assembly: "interior",
    build_layer: 3,
    geometry: M(B(1.42, 0.02, 0.92, [0, 0, 0], 0.002)),
    material: "cv_scr_chart",
    mate: A([-3.3, DECK + 5.55, 22.2]),
  });
  add({
    id: `${P}interior.bridge_overhead_screens`,
    name_cn: "舰桥顶部仪表屏 ×3",
    name_en: "bridge overhead screens ×3",
    assembly: "interior",
    build_layer: 3,
    geometry: M(
      B(0.86, 0.32, 0.025, [-1.55, 0, 0], 0.002),
      B(0.86, 0.32, 0.025, [0, 0, 0], 0.002),
      B(0.86, 0.32, 0.025, [1.55, 0, 0], 0.002),
    ),
    material: "cv_scr_radar",
    mate: A([0, DECK + 11.45, 29.98]),
  });
  add({
    id: `${P}interior.bridge_wall_racks`,
    name_cn: "舰桥侧壁设备柜 ×2",
    name_en: "bridge side equipment racks ×2",
    assembly: "interior",
    build_layer: 3,
    geometry: M(
      B(0.4, 1.7, 0.9, [-4.25, 0, 0], 0.02),
      B(0.4, 1.7, 0.9, [4.25, 0, 0], 0.02),
      B(0.03, 0.3, 0.7, [-4.46, 0.25, 0], 0.004),
      B(0.03, 0.3, 0.7, [4.46, 0.25, 0], 0.004),
    ),
    material: "cv_055_console",
    mate: A([0, DECK + 8.3, 22.6]),
  });
  add({
    id: `${P}interior.bridge_wall_rack_screens`,
    name_cn: "舰桥侧壁设备柜屏 ×2",
    name_en: "bridge side rack screens ×2",
    assembly: "interior",
    build_layer: 3,
    geometry: M(
      B(0.03, 0.26, 0.62, [-4.47, 0.3, 0], 0.002),
      B(0.03, 0.26, 0.62, [4.47, 0.3, 0], 0.002),
    ),
    material: "cv_scr_comms",
    mate: A([0, DECK + 8.3, 22.6]),
  });

  // ---------------- 船员生活区：走廊 + 8 个独立舱室（不是一个大通舱） ----------------
  // 公开资料：055 编制约 300 人，士兵 8 人间、带衣柜/电视/木纹家具，军官单人间；
  // 舰上有大食堂、休息室、阅览室、健身房、洗衣房/超市。这里把水下生活甲板做成
  // 一条 1.8m 走廊，两舷各 4 个功能舱：水兵住舱 A/B、士官舱、军官舱、
  // 餐厅、厨房/冷藏、医务室、健身/洗衣/阅览。每个舱室的床位、家具、配色都不同。
  const crewFloor = 2.55;
  const FT = crewFloor + 0.05; // 地板面
  const CH = 5.42; // 天花底面
  const BH = CH - FT;
  const XO = 4.2; // 生活区外壁
  const XC = 0.94; // 走廊壁
  const WT = 0.08; // 舱壁厚
  const crewPart = (
    id: string,
    name_cn: string,
    geometry: Parameters<typeof M>[0],
    material: string,
    at: [number, number, number] = [0, 0, 0],
    rotation?: [number, number, number],
  ) =>
    add({
      id: `${P}interior.crew_${id}`,
      name_cn,
      name_en: `crew ${id.replace(/_/g, " ")}`,
      assembly: "interior",
      build_layer: 3,
      geometry,
      material,
      mate: A(at, rotation),
    });

  // 外壳：地板/天花/四壁；走廊两端各一道水密门。
  add({
    id: `${P}interior.crew_shell`,
    name_cn: "船员生活区围壁/甲板",
    name_en: "crew living deck shell",
    assembly: "interior",
    build_layer: 1,
    geometry: M(
      B(XO * 2, 0.1, 16.0, [0, crewFloor, 0], 0.01),
      B(XO * 2, 0.08, 16.0, [0, CH + 0.04, 0], 0.01),
      B(0.1, BH, 16.0, [-XO, FT + BH / 2, 0], 0.01),
      B(0.1, BH, 16.0, [XO, FT + BH / 2, 0], 0.01),
      B(XO * 2, BH, 0.1, [0, FT + BH / 2, -8.0], 0.01),
      B(XO * 2, BH, 0.1, [0, FT + BH / 2, 8.0], 0.01),
    ),
    material: "cv_055_bulkhead",
    mate: A([0, 0, 0]),
  });
  crewPart("corridor_floor", "生活区走廊防滑地板", M(B(1.72, 0.02, 15.8, [0, FT + 0.01, 0], 0.003)), "cv_055_carpet");
  for (const [tag, z] of [["aft", -7.9], ["fwd", 7.9]] as const) {
    crewPart(
      `corridor_wt_door_${tag}`,
      `生活区${tag === "aft" ? "后" : "前"}水密门`,
      M(
        B(1.4, 2.2, 0.1, [0, FT + 1.1, z], 0.008),
        B(0.14, 2.3, 0.16, [-0.77, FT + 1.15, z], 0.006),
        B(0.14, 2.3, 0.16, [0.77, FT + 1.15, z], 0.006),
        C(0.05, 0.12, [0.5, FT + 1.1, z + 0.07], 12),
        B(0.5, 0.1, 0.04, [0, FT + 2.05, z + 0.07], 0.004),
      ),
      "cv_055_console",
    );
  }

  // ---- 舱壁：走廊纵壁（留门洞）+ 各舱横壁 ----
  const wallGeos: Array<ReturnType<typeof B>> = [];
  const frameGeos: Array<ReturnType<typeof B>> = [];
  const leafGeos: Array<ReturnType<typeof B>> = [];
  const doorDetailGeos: Array<ReturnType<typeof B>> = [];
  const doorGlassGeos: Array<ReturnType<typeof B>> = [];
  const portDoors = [
    { z: -6.3, w: 1.0, tag: "berth_a" },
    { z: -4.1, w: 0.8, tag: "head_1" },
    { z: -1.6, w: 0.95, tag: "berth_b" },
    { z: 1.9, w: 0.95, tag: "nco" },
    { z: 4.55, w: 0.9, tag: "officer_1" },
    { z: 6.85, w: 0.9, tag: "officer_2" },
  ] as const;
  const starDoors = [
    { z: -5.9, w: 1.0, tag: "mess" },
    { z: -1.7, w: 0.95, tag: "galley" },
    { z: 2.0, w: 0.95, tag: "medical" },
    { z: 4.1, w: 0.8, tag: "head_2" },
    { z: 6.3, w: 0.95, tag: "rec" },
  ] as const;
  for (const [side, doors] of [
    [-1, portDoors],
    [1, starDoors],
  ] as const) {
    const x = side * XC;
    const edges = [-8.0, ...doors.flatMap((d) => [d.z - d.w / 2, d.z + d.w / 2]), 8.0];
    for (let i = 0; i < edges.length; i += 2) {
      const a = edges[i]!;
      const b = edges[i + 1]!;
      if (b - a > 0.01) wallGeos.push(B(WT, BH, b - a, [x, FT + BH / 2, (a + b) / 2], 0.004));
    }
    for (const d of doors) {
      // 门楣 + 门框
      wallGeos.push(B(WT, BH - 2.15, d.w + 0.16, [x, FT + 2.15 + (BH - 2.15) / 2, d.z], 0.004));
      frameGeos.push(B(0.14, 2.22, 0.1, [x, FT + 1.11, d.z - d.w / 2 - 0.05], 0.004));
      frameGeos.push(B(0.14, 2.22, 0.1, [x, FT + 1.11, d.z + d.w / 2 + 0.05], 0.004));
      frameGeos.push(B(0.14, 0.12, d.w + 0.2, [x, FT + 2.18, d.z], 0.004));
      // 门扇：全部向舱内开启，贴在舱壁内侧；厕所门半掩。
      // 门扇开启后贴平在舱壁内侧（不是横在舱室中间挡视线），门洞保持通透。
      const leafX = side * (XC + 0.06);
      const leafZ = d.z - d.w - 0.02;
      leafGeos.push(B(0.035, 2.05, d.w - 0.06, [leafX, FT + 1.03, leafZ], 0.004));
      doorGlassGeos.push(B(0.006, 0.32, 0.3, [leafX + side * 0.02, FT + 1.55, leafZ], 0.002));
      doorDetailGeos.push(B(0.012, 0.18, d.w - 0.12, [leafX + side * 0.02, FT + 0.13, leafZ], 0.002));
      doorDetailGeos.push(B(0.03, 0.18, 0.035, [leafX + side * 0.03, FT + 1.02, leafZ + d.w / 2 - 0.1], 0.003));
      doorDetailGeos.push(C(0.02, 0.06, [leafX + side * 0.03, FT + 1.02, leafZ + d.w / 2 - 0.12], 8));
    }
  }
  // 横向舱壁（每个功能舱的隔壁）
  for (const [side, boundaries] of [
    [-1, [-4.6, -3.6, 0.4, 3.4, 5.7]],
    [1, [-3.8, 0.4, 3.6, 4.6]],
  ] as const) {
    const x0 = side * XC;
    const x1 = side * XO;
    const w = Math.abs(x1 - x0);
    for (const z of boundaries) {
      wallGeos.push(B(w, BH, WT, [(x0 + x1) / 2, FT + BH / 2, z], 0.004));
    }
  }
  // 军官舱/厕所内部隔墙
  wallGeos.push(B(0.9, BH, WT, [-3.75, FT + BH / 2, 5.7], 0.004)); // 军官1/2 之间保留
  wallGeos.push(B(1.4, BH, WT, [-3.5, FT + BH / 2, 7.05], 0.004)); // 军官2 独立卫浴
  wallGeos.push(B(WT, BH, 1.4, [-2.8, FT + BH / 2, 7.0], 0.004));
  crewPart("partitions", "生活区舱壁/门洞", M(...wallGeos), "cv_055_acoustic");
  crewPart("door_frames", "生活区门框/把手", M(...frameGeos), "cv_steel");
  crewPart("door_leaves", "生活区舱门（开启）", M(...leafGeos), "cv_055_ceiling");
  crewPart("door_details", "舱门踢脚板/把手", M(...doorDetailGeos), "cv_steel");
  crewPart("door_glass", "舱门观察窗", M(...doorGlassGeos), "cv_clear_glass");

  // 门楣上的舱室标识牌（用颜色区分功能，避免满墙无信息）
  const signMats = ["cv_deck_red", "cv_deck_yellow", "cv_deck_line", "cv_055_seat", "cv_berth_olive"];
  [...portDoors, ...starDoors].forEach((d, i) => {
    add({
      id: `${P}interior.crew_door_sign_${i + 1}`,
      name_cn: `生活区舱室标识牌 ${d.tag}`,
      name_en: `crew door sign ${d.tag}`,
      assembly: "interior",
      build_layer: 3,
      geometry: M(B(0.02, 0.16, 0.46, [0, 0, 0], 0.002)),
      material: signMats[i % signMats.length]!,
      mate: A([i < portDoors.length ? -(XC - 0.055) : XC - 0.055, FT + 2.34, d.z]),
    });
  });

  // 各舱地板/天花/顶灯
  const floorTile = (x0: number, x1: number, z0: number, z1: number) =>
    B(x1 - x0, 0.012, z1 - z0, [(x0 + x1) / 2, FT + 0.012, (z0 + z1) / 2], 0.002);
  crewPart(
    "cabin_floors",
    "住舱/餐厅/医务室地板",
    M(
      floorTile(-XO + 0.03, -XC - 0.02, -8, -4.6),
      floorTile(-XO + 0.03, -XC - 0.02, -3.6, 8),
      floorTile(XC + 0.02, XO - 0.03, -8, 4.6),
      floorTile(XC + 0.02, XO - 0.03, 4.6, 8),
    ),
    "cv_deck_tile",
  );
  crewPart(
    "wet_floors",
    "厨房/厕所/淋浴间地砖",
    M(
      floorTile(XC + 0.02, XO - 0.03, -3.8, 0.4),
      floorTile(-XO + 0.03, -XC - 0.02, -4.6, -3.6),
      floorTile(XC + 0.02, XO - 0.03, 3.6, 4.6),
      floorTile(-3.45, -2.82, 6.35, 7.68),
    ),
    "cv_deck_tile",
  );
  const lightBars: Array<ReturnType<typeof B>> = [];
  for (const z of [-6.6, -4.2, -1.8, 0.6, 3.0, 5.4, 7.4]) {
    lightBars.push(B(0.1, 0.04, 1.2, [-2.55, CH - 0.04, z], 0.003));
    lightBars.push(B(0.1, 0.04, 1.2, [2.55, CH - 0.04, z], 0.003));
  }
  for (const z of [-6.2, -2.4, 1.4, 5.2]) lightBars.push(B(0.8, 0.04, 0.1, [0, CH - 0.04, z], 0.003));
  crewPart("ceiling_lights", "生活区顶灯/走廊灯带 ×18", M(...lightBars), "cv_055_lamp");
  crewPart(
    "ceiling_panels",
    "住舱/餐厅白色吸音顶板",
    M(
      B(1.68, 0.02, 15.8, [0, CH - 0.025, 0], 0.003),
      B(3.2, 0.02, 3.3, [-2.57, CH - 0.025, -6.3], 0.003),
      B(3.2, 0.02, 4.2, [-2.57, CH - 0.025, -1.6], 0.003),
      B(3.2, 0.02, 4.4, [-2.57, CH - 0.025, 4.7], 0.003),
      B(3.2, 0.02, 4.2, [2.57, CH - 0.025, -5.9], 0.003),
      B(3.2, 0.02, 3.2, [2.57, CH - 0.025, 1.9], 0.003),
      B(3.2, 0.02, 3.4, [2.57, CH - 0.025, 6.3], 0.003),
    ),
    "cv_055_ceiling",
  );

  // ---- 铺位/家具：按舱室分别构建，不共享同一套几何 ----
  const frame: Array<ReturnType<typeof B>> = [];
  const mattress: Array<ReturnType<typeof B>> = [];
  const bedding: Record<"navy" | "grey" | "olive" | "tan" | "red", Array<ReturnType<typeof B>>> = {
    navy: [],
    grey: [],
    olive: [],
    tan: [],
    red: [],
  };
  const beddingMat: Record<keyof typeof bedding, string> = {
    navy: "cv_berth_navy",
    grey: "cv_berth_grey",
    olive: "cv_berth_olive",
    tan: "cv_berth_tan",
    red: "cv_berth_red",
  };
  const curtainGeos: Array<ReturnType<typeof B>> = [];
  const sheets: Array<ReturnType<typeof B>> = [];
  const personalPaper: Array<ReturnType<typeof B>> = [];
  const personalDark: Array<ReturnType<typeof B>> = [];
  const personalColor: Array<ReturnType<typeof B>> = [];
  const personalRed: Array<ReturnType<typeof B>> = [];
  const food: Array<ReturnType<typeof B>> = [];
  const foodGreen: Array<ReturnType<typeof B>> = [];
  const rack = (
    cx: number,
    cz: number,
    tiers: number,
    color: keyof typeof bedding,
    len = 2.0,
    wid = 0.9,
    curtainSide: 1 | -1 = 1,
  ) => {
    const tierY = tiers === 3 ? [0.34, 1.02, 1.7] : [0.4, 1.2];
    for (const y of tierY) {
      frame.push(B(wid, 0.07, len, [cx, FT + y, cz], 0.008));
      frame.push(B(0.06, 1.98, 0.06, [cx - wid / 2 + 0.03, FT + 0.99, cz - len / 2 + 0.03], 0.004));
      frame.push(B(0.06, 1.98, 0.06, [cx - wid / 2 + 0.03, FT + 0.99, cz + len / 2 - 0.03], 0.004));
      frame.push(B(0.06, 1.98, 0.06, [cx + wid / 2 - 0.03, FT + 0.99, cz - len / 2 + 0.03], 0.004));
      frame.push(B(0.06, 1.98, 0.06, [cx + wid / 2 - 0.03, FT + 0.99, cz + len / 2 - 0.03], 0.004));
      mattress.push(B(wid - 0.05, 0.12, len - 0.1, [cx, FT + y + 0.1, cz], 0.03));
      // 铺好的床：白床单 + 包角 + 被子折边 + 枕头
      sheets.push(B(wid - 0.08, 0.005, len - 0.12, [cx, FT + y + 0.163, cz], 0.002));
      bedding[color]!.push(B(0.5, 0.07, 0.3, [cx, FT + y + 0.2, cz + len / 2 - 0.22], 0.02));
      bedding[color]!.push(B(wid - 0.08, 0.03, 0.95, [cx, FT + y + 0.19, cz - 0.1], 0.01));
      bedding[color]!.push(B(wid - 0.1, 0.04, 0.06, [cx, FT + y + 0.2, cz + len / 2 - 0.63], 0.008));
      bedding[color]!.push(B(0.025, 0.035, 0.95, [cx - wid / 2 + 0.06, FT + y + 0.185, cz - 0.1], 0.006));
      bedding[color]!.push(B(0.025, 0.035, 0.95, [cx + wid / 2 - 0.06, FT + y + 0.185, cz - 0.1], 0.006));
      frame.push(B(0.05, 0.05, 0.12, [cx + wid / 2 - 0.07, FT + y + 0.42, cz + len / 2 - 0.1], 0.003));
      // 隐私帘只拉一半，不同铺位长短不一；金属帘盒与挂环在床架上。
      curtainGeos.push(B(0.018, 0.5, len * 0.62, [cx + curtainSide * (wid / 2 + 0.035), FT + y + 0.35, cz - len * 0.12], 0.003));
      frame.push(B(0.04, 0.04, len, [cx + curtainSide * (wid / 2 + 0.035), FT + y + 0.9, cz], 0.002));
    }
    // 爬梯/底部个人柜
    for (const dz of [-len / 2 + 0.12, len / 2 - 0.12]) {
      frame.push(B(0.05, 1.9, 0.05, [cx + wid / 2 + 0.06, FT + 0.95, cz + dz], 0.003));
      for (let r = 0; r < 4; r++) frame.push(B(0.32, 0.03, 0.04, [cx + wid / 2 + 0.06, FT + 0.35 + r * 0.45, cz + dz], 0.002));
    }
    frame.push(B(wid - 0.12, 0.28, len - 0.18, [cx, FT + 0.16, cz], 0.006));
    frame.push(B(wid - 0.18, 0.02, 0.04, [cx, FT + 0.24, cz - len / 2 + 0.12], 0.002));
    // 每个铺位的私人物品不完全一样
    const py = tierY[tierY.length - 1]!;
    const seed = Math.round((cx * 1007 + cz * 1013 + py * 1019) * 10) % 7;
    if (seed === 0) {
      personalPaper.push(B(0.24, 0.04, 0.32, [cx + wid * 0.15, FT + py + 0.22, cz + len / 2 - 0.45], 0.004));
      personalRed.push(B(0.26, 0.015, 0.34, [cx + wid * 0.15, FT + py + 0.25, cz + len / 2 - 0.45], 0.002));
    } else if (seed === 2) {
      personalDark.push(B(0.16, 0.2, 0.24, [cx - wid * 0.16, FT + py + 0.28, cz + len / 2 - 0.55], 0.02));
      personalColor.push(B(0.02, 0.5, 0.28, [cx + curtainSide * (wid / 2 + 0.05), FT + py + 0.35, cz + 0.2], 0.004));
    } else if (seed === 4) {
      personalColor.push(B(0.02, 0.26, 0.2, [cx - wid * 0.2, FT + py + 0.25, cz + 0.3], 0.003));
      personalPaper.push(C(0.04, 0.1, [cx + wid * 0.18, FT + py + 0.23, cz + 0.1], 10));
    } else if (seed === 6) {
      personalDark.push(B(0.4, 0.18, 0.22, [cx, FT + 0.1, cz + len / 2 - 0.25], 0.02));
      personalPaper.push(B(0.12, 0.2, 0.16, [cx - wid * 0.15, FT + py + 0.3, cz - 0.2], 0.004));
    }
  };
  // A 舱（8 人，2 层铺 ×4，深蓝/灰）
  rack(-3.62, -7.15, 2, "navy", 2.0, 0.9, 1);
  rack(-3.62, -5.05, 2, "grey", 2.0, 0.9, 1);
  rack(-1.5, -7.15, 2, "navy", 2.0, 0.9, -1);
  rack(-1.5, -5.05, 2, "grey", 2.0, 0.9, -1);
  // B 舱（8 人，2 层铺 ×4，橄榄/沙色，另加中央条桌）
  rack(-3.62, -2.5, 2, "olive", 2.0, 0.9, 1);
  rack(-3.62, -0.4, 2, "tan", 2.0, 0.9, 1);
  rack(-1.5, -2.5, 2, "tan", 2.0, 0.9, -1);
  rack(-1.5, -0.4, 2, "olive", 2.0, 0.9, -1);
  // 士官舱（4 人，2 层铺 ×2，灰/深蓝）
  rack(-3.62, 1.45, 2, "grey", 1.9, 0.9, 1);
  rack(-3.62, 3.0, 2, "navy", 1.2, 0.9, 1);
  // 军官舱（单人床）
  frame.push(B(1.0, 0.05, 2.0, [-3.5, FT + 0.62, 4.5], 0.01));
  for (const z of [3.55, 5.45]) frame.push(B(0.08, 0.55, 0.08, [-3.95, FT + 0.3, z], 0.004));
  frame.push(B(1.0, 0.05, 0.06, [-3.5, FT + 0.95, 3.55], 0.004));
  mattress.push(B(0.95, 0.16, 1.95, [-3.5, FT + 0.73, 4.5], 0.03));
  bedding.navy.push(B(0.6, 0.09, 0.35, [-3.5, FT + 0.86, 3.75], 0.02));
  bedding.navy.push(B(0.9, 0.04, 1.05, [-3.5, FT + 0.85, 4.6], 0.01));
  frame.push(B(1.15, 0.05, 2.05, [-3.5, FT + 0.05, 7.25], 0.01));
  for (const z of [6.35, 8.0]) frame.push(B(0.08, 0.5, 0.08, [-4.0, FT + 0.27, z], 0.004));
  mattress.push(B(1.1, 0.16, 2.0, [-3.5, FT + 0.16, 7.25], 0.03));
  bedding.tan.push(B(0.7, 0.1, 0.38, [-3.5, FT + 0.3, 6.45], 0.02));
  bedding.tan.push(B(1.0, 0.05, 1.1, [-3.5, FT + 0.29, 7.4], 0.01));
  crewPart("bunk_frames", "生活区铺位/床架/爬梯/个人柜", M(...frame), "cv_055_console");
  crewPart("bunk_mattresses", "生活区床垫", M(...mattress), "cv_mattress");
  for (const color of Object.keys(bedding) as Array<keyof typeof bedding>) {
    const geos = bedding[color];
    if (geos.length) crewPart(`bedding_${color}`, `生活区被褥/枕头（${color}）`, M(...geos), beddingMat[color]!);
  }

  crewPart("bunk_curtains", "铺位隐私帘", M(...curtainGeos), "cv_berth_grey");
  if (sheets.length) crewPart("bed_sheets", "铺位白色床单/包角", M(...sheets), "cv_deck_line");
  if (personalPaper.length) crewPart("bed_personal_paper", "铺位书籍/水杯", M(...personalPaper), "cv_deck_line");
  if (personalDark.length) crewPart("bed_personal_dark", "铺位耳机/背包/鞋", M(...personalDark), "cv_055_console");
  if (personalColor.length) crewPart("bed_personal_color", "铺位照片/毛巾/衣服", M(...personalColor), "cv_055_seat_alt2");
  if (personalRed.length) crewPart("bed_personal_red", "铺位书皮/私人物品", M(...personalRed), "cv_deck_red");

  // A 舱：可折叠小桌 + 壁挂电视 + 风扇
  crewPart(
    "berth_a_extras",
    "水兵住舱折叠桌/壁挂电视/风扇",
    M(
      B(0.35, 0.04, 1.15, [-1.12, FT + 0.74, -6.0], 0.006),
      B(0.03, 0.7, 0.03, [-1.28, FT + 0.37, -6.5], 0.003),
      B(0.03, 0.7, 0.03, [-1.28, FT + 0.37, -5.5], 0.003),
      B(0.04, 0.55, 0.95, [-1.0, FT + 1.62, -6.55], 0.004),
      B(0.02, 0.46, 0.82, [-0.975, FT + 1.62, -6.55], 0.002),
      C(0.12, 0.06, [-2.55, CH - 0.18, -7.2], 12),
      B(0.1, 0.1, 0.1, [-2.55, CH - 0.1, -7.2], 0.004),
    ),
    "cv_055_wood",
  );

  crewPart(
    "berth_a_tv",
    "水兵住舱壁挂电视屏幕",
    M(B(0.012, 0.46, 0.82, [-1.03, FT + 1.62, -6.55], 0.002)),
    "cv_scr_camera",
  );

  // 各舱室家具：木纹/布面/金属分开，细节各不相同
  const wood: Array<ReturnType<typeof B>> = [];
  const dark: Array<ReturnType<typeof B>> = [];
  const fabric: Array<ReturnType<typeof B>> = [];
  const white: Array<ReturnType<typeof B>> = [];
  const displayGeos: Array<Parameters<typeof M>[0]> = [];
  const props: Array<Parameters<typeof M>[0]> = [];
  // A 舱：床头柜/折叠凳/挂衣钩/风扇/照片
  for (const z of [-7.9, -4.4]) {
    wood.push(B(0.5, 0.5, 0.35, [-1.3, FT + 0.28, z], 0.006));
    wood.push(B(0.02, 0.3, 0.03, [-1.06, FT + 0.28, z], 0.002));
  }
  props.push(B(0.35, 0.04, 0.35, [-2.6, FT + 0.45, -6.1], 0.006));
  props.push(B(0.03, 0.42, 0.03, [-2.6, FT + 0.23, -6.1], 0.002));
  props.push(B(0.3, 0.02, 0.3, [-2.6, FT + 0.42, -6.1], 0.004));
  // B 舱：中央条桌/长凳/电视/吉他/水壶/绿植
  wood.push(B(1.5, 0.06, 0.7, [-2.55, FT + 0.72, -1.5], 0.01));
  dark.push(B(0.08, 0.68, 0.6, [-3.2, FT + 0.36, -1.5], 0.004));
  dark.push(B(0.08, 0.68, 0.6, [-1.9, FT + 0.36, -1.5], 0.004));
  fabric.push(B(1.4, 0.1, 0.35, [-2.55, FT + 0.46, -2.15], 0.02));
  fabric.push(B(1.4, 0.1, 0.35, [-2.55, FT + 0.46, -0.85], 0.02));
  displayGeos.push(B(1.0, 0.58, 0.03, [-2.55, FT + 1.7, 0.34], 0.004));
  dark.push(B(1.1, 0.7, 0.05, [-2.55, FT + 1.7, 0.37], 0.006));
  props.push(B(0.12, 0.85, 0.06, [-3.9, FT + 1.35, -3.1], 0.004));
  props.push(C(0.1, 0.06, [-3.9, FT + 1.7, -3.1], 10));
  props.push(C(0.08, 0.16, [-1.25, FT + 0.82, -0.3], 10));
  props.push(C(0.12, 0.18, [-1.35, FT + 0.12, 3.1], 10));
  props.push(C(0.16, 0.22, [-1.35, FT + 0.3, 3.1], 10));
  // 士官舱：书桌/2 把椅子/书架/咖啡机/衣柜
  wood.push(B(1.6, 0.05, 0.7, [-1.55, FT + 0.74, 1.9], 0.01));
  dark.push(B(0.06, 0.7, 0.6, [-2.3, FT + 0.37, 1.9], 0.004));
  dark.push(B(0.06, 0.7, 0.6, [-0.82, FT + 0.37, 1.9], 0.004));
  fabric.push(B(0.5, 0.08, 0.5, [-1.35, FT + 0.46, 1.45], 0.02));
  fabric.push(B(0.5, 0.45, 0.08, [-1.35, FT + 0.7, 1.2], 0.02));
  fabric.push(B(0.5, 0.08, 0.5, [-1.9, FT + 0.46, 2.5], 0.02));
  fabric.push(B(0.5, 0.45, 0.08, [-1.9, FT + 0.7, 2.75], 0.02));
  dark.push(B(0.35, 1.8, 0.35, [-1.1, FT + 0.9, 3.2], 0.006));
  wood.push(B(1.2, 0.05, 0.25, [-2.8, FT + 1.55, 0.48], 0.006));
  wood.push(B(1.2, 0.05, 0.25, [-2.8, FT + 1.1, 0.48], 0.006));
  for (let b = 0; b < 8; b++) props.push(B(0.04, 0.18, 0.14, [-3.3 + b * 0.13, FT + 1.25, 0.48], 0.002));
  props.push(B(0.22, 0.3, 0.22, [-0.95, FT + 0.9, 0.55], 0.006));
  props.push(C(0.04, 0.1, [-0.95, FT + 1.1, 0.55], 8));
  // 军官 1/2：写字台/办公椅/衣柜/洗手盆/镜子/沙发/保险柜/小冰箱
  for (const [z, tag] of [[4.45, "1"], [7.25, "2"]] as const) {
    wood.push(B(1.35, 0.06, 0.65, [-1.55, FT + 0.74, z], 0.01));
    dark.push(B(0.06, 0.7, 0.55, [-2.2, FT + 0.37, z], 0.004));
    dark.push(B(0.06, 0.7, 0.55, [-0.9, FT + 0.37, z], 0.004));
    fabric.push(B(0.5, 0.08, 0.5, [-1.5, FT + 0.48, z - 0.55], 0.02));
    fabric.push(B(0.5, 0.48, 0.08, [-1.5, FT + 0.74, z - 0.8], 0.02));
    wood.push(B(0.65, 1.9, 0.45, [-3.82, FT + 0.95, z + (tag === "1" ? -1.1 : 0.9)], 0.006));
    props.push(B(0.45, 0.15, 0.35, [-3.9, FT + 0.95, z + (tag === "1" ? 0.2 : 0.1)], 0.006));
    props.push(B(0.5, 0.55, 0.04, [-4.05, FT + 1.55, z], 0.004));
    props.push(B(0.3, 0.02, 0.24, [-1.4, FT + 0.78, z], 0.002));
  }
  fabric.push(B(1.2, 0.4, 0.55, [-2.6, FT + 0.26, 5.95], 0.02));
  fabric.push(B(1.2, 0.5, 0.08, [-2.6, FT + 0.5, 5.65], 0.02));
  wood.push(B(0.7, 0.4, 0.5, [-2.6, FT + 0.22, 6.75], 0.01));
  dark.push(B(0.32, 0.4, 0.28, [-1.35, FT + 0.2, 6.0], 0.004));
  props.push(B(0.4, 0.3, 0.35, [-1.35, FT + 0.5, 6.0], 0.004));
  // 军官 2 独立卫浴
  white.push(B(0.42, 0.04, 0.5, [-3.35, FT + 0.78, 6.55], 0.01));
  white.push(C(0.16, 0.25, [-3.35, FT + 0.9, 6.55], 12));
  white.push(B(0.32, 0.04, 0.38, [-3.95, FT + 0.4, 7.55], 0.01));
  white.push(C(0.14, 0.18, [-3.95, FT + 0.48, 7.55], 12));
  props.push(B(0.03, 1.7, 0.03, [-3.0, FT + 0.85, 7.55], 0.002));
  props.push(B(0.5, 0.02, 0.5, [-3.35, FT + 1.72, 7.55], 0.004));

  // 餐厅：3 张餐桌 + 长凳 + 配餐台 + 饮料站 + 菜单板 + 电视
  for (const z of [-7.2, -5.6, -4.1]) {
    wood.push(B(2.0, 0.07, 0.85, [2.55, FT + 0.74, z], 0.01));
    dark.push(B(0.08, 0.7, 0.75, [1.7, FT + 0.37, z], 0.004));
    dark.push(B(0.08, 0.7, 0.75, [3.4, FT + 0.37, z], 0.004));
    fabric.push(B(1.9, 0.1, 0.32, [2.55, FT + 0.44, z - 0.62], 0.02));
    fabric.push(B(1.9, 0.1, 0.32, [2.55, FT + 0.44, z + 0.62], 0.02));
    fabric.push(B(1.8, 0.42, 0.06, [2.55, FT + 0.68, z - 0.78], 0.02));
    fabric.push(B(1.8, 0.42, 0.06, [2.55, FT + 0.68, z + 0.78], 0.02));
    props.push(B(0.35, 0.06, 0.25, [2.2, FT + 0.8, z], 0.004));
    props.push(C(0.035, 0.08, [2.5, FT + 0.83, z + 0.1], 8));
    props.push(C(0.035, 0.08, [2.75, FT + 0.83, z - 0.05], 8));
  }
  white.push(B(2.6, 0.08, 0.75, [2.55, FT + 0.8, -7.75], 0.01));
  dark.push(B(2.6, 0.85, 0.65, [2.55, FT + 0.4, -7.78], 0.01));
  for (let p = 0; p < 4; p++) {
    props.push(B(0.5, 0.08, 0.42, [1.5 + p * 0.6, FT + 0.87, -7.75], 0.006));
    props.push(B(0.44, 0.06, 0.36, [1.5 + p * 0.6, FT + 0.94, -7.75], 0.003));
  }
  props.push(B(2.3, 0.04, 0.06, [2.55, FT + 1.35, -7.3], 0.004));
  props.push(B(0.4, 0.5, 0.4, [3.9, FT + 0.3, -4.25], 0.006));
  props.push(C(0.18, 0.38, [3.9, FT + 0.9, -4.25], 12));
  props.push(C(0.14, 0.32, [3.65, FT + 0.85, -4.25], 12));
  displayGeos.push(B(1.1, 0.64, 0.03, [4.12, FT + 1.65, -5.9], 0.004));
  props.push(B(1.2, 0.72, 0.05, [4.15, FT + 1.65, -5.9], 0.006));
  props.push(B(0.8, 0.55, 0.04, [0.98, FT + 1.45, -6.9], 0.004));
  props.push(B(0.5, 0.1, 0.1, [1.9, FT + 0.3, -6.6], 0.006));
  props.push(C(0.04, 0.06, [1.9, FT + 0.38, -6.6], 8));

  // 厨房：电磁灶/蒸锅/水槽/排烟罩/双冷库/干货架/洗碗机
  white.push(B(0.65, 0.85, 3.4, [3.85, FT + 0.43, -1.6], 0.01));
  dark.push(B(0.7, 0.06, 3.4, [3.85, FT + 0.88, -1.6], 0.006));
  for (let h = 0; h < 4; h++) {
    props.push(C(0.16, 0.012, [3.85, FT + 0.92, -2.8 + h * 0.8], 18));
    props.push(C(0.12, 0.014, [3.85, FT + 0.93, -2.8 + h * 0.8], 18));
  }
  props.push(C(0.24, 0.34, [3.85, FT + 1.08, -2.1], 16));
  props.push(C(0.24, 0.34, [3.85, FT + 1.08, -1.3], 16));
  props.push(T(0.25, 0.2, 0.05, [3.85, FT + 1.27, -2.1], 16));
  props.push(T(0.25, 0.2, 0.05, [3.85, FT + 1.27, -1.3], 16));
  white.push(B(0.55, 0.02, 0.45, [3.85, FT + 0.9, -0.65], 0.006));
  white.push(B(0.55, 0.02, 0.45, [3.85, FT + 0.9, 0.0], 0.006));
  props.push(B(0.5, 0.5, 0.9, [3.85, FT + 1.5, -1.6], 0.008));
  props.push(B(0.58, 0.05, 0.98, [3.85, FT + 1.26, -1.6], 0.004));
  dark.push(B(0.9, 2.15, 1.35, [2.2, FT + 1.08, -3.55], 0.02));
  dark.push(B(0.9, 2.15, 1.35, [3.45, FT + 1.08, -3.55], 0.02));
  props.push(B(0.75, 0.08, 1.1, [2.2, FT + 1.2, -2.84], 0.006));
  props.push(B(0.75, 0.08, 1.1, [3.45, FT + 1.2, -2.84], 0.006));
  props.push(C(0.07, 0.16, [2.2, FT + 1.2, -2.75], 10));
  props.push(C(0.07, 0.16, [3.45, FT + 1.2, -2.75], 10));
  props.push(B(0.25, 0.18, 0.02, [2.2, FT + 1.65, -2.82], 0.002));
  props.push(B(0.25, 0.18, 0.02, [3.45, FT + 1.65, -2.82], 0.002));
  for (let sh = 0; sh < 4; sh++) {
    wood.push(B(1.15, 0.05, 0.35, [1.32, FT + 0.45 + sh * 0.5, -1.6], 0.006));
    for (let k = 0; k < 5; k++) props.push(B(0.18, 0.16, 0.2, [1.0 + k * 0.16, FT + 0.58 + sh * 0.5, -1.6], 0.003));
  }
  white.push(B(1.4, 0.85, 0.65, [2.25, FT + 0.43, 0.0], 0.01));
  white.push(B(0.6, 0.08, 0.45, [1.95, FT + 0.88, 0.0], 0.006));
  props.push(B(0.55, 0.5, 0.55, [3.0, FT + 0.7, 0.0], 0.006));
  props.push(C(0.1, 0.2, [3.0, FT + 1.1, 0.0], 10));
  props.push(C(0.06, 0.5, [1.0, FT + 0.25, -3.4], 8));

  // 医务室：检查床 + 无影灯 + 手术床 + 麻醉机 + 药柜 + 洗手池 + 轮椅
  fabric.push(B(2.0, 0.18, 0.75, [2.55, FT + 0.62, 2.9], 0.03));
  white.push(B(2.0, 0.1, 0.75, [2.55, FT + 0.4, 2.9], 0.01));
  dark.push(B(0.08, 0.35, 0.65, [1.7, FT + 0.2, 2.9], 0.004));
  dark.push(B(0.08, 0.35, 0.65, [3.4, FT + 0.2, 2.9], 0.004));
  bedding.grey.push(B(0.55, 0.12, 0.3, [2.55, FT + 0.76, 3.2], 0.02));
  props.push(B(0.03, 1.8, 0.03, [1.45, FT + 1.0, 3.5], 0.002));
  props.push(B(0.6, 0.02, 0.6, [1.45, FT + 1.9, 3.5], 0.004));
  props.push(B(0.55, 0.02, 0.55, [2.55, FT + 1.95, 2.9], 0.004));
  props.push(C(0.03, 0.7, [2.55, FT + 1.6, 2.9], 8));
  for (let l = 0; l < 4; l++) {
    const a = (l / 4) * Math.PI * 2;
    props.push(C(0.06, 0.05, [2.55 + Math.cos(a) * 0.15, FT + 1.92, 2.9 + Math.sin(a) * 0.15], 8));
  }
  fabric.push(B(1.9, 0.16, 0.7, [2.55, FT + 0.72, 1.15], 0.03));
  white.push(B(1.9, 0.1, 0.7, [2.55, FT + 0.55, 1.15], 0.01));
  props.push(B(0.35, 0.32, 0.3, [3.55, FT + 0.85, 0.9], 0.006));
  props.push(C(0.08, 0.18, [3.55, FT + 1.1, 0.9], 10));
  props.push(B(0.25, 0.2, 0.02, [3.55, FT + 1.0, 1.06], 0.002));
  wood.push(B(1.6, 0.06, 0.65, [2.4, FT + 0.74, 0.55], 0.01));
  dark.push(B(0.05, 0.7, 0.6, [1.65, FT + 0.37, 0.55], 0.004));
  props.push(B(0.55, 0.38, 0.06, [2.4, FT + 1.05, 0.55], 0.004));
  props.push(B(0.45, 0.3, 0.04, [2.4, FT + 1.02, 0.58], 0.003));
  white.push(B(0.85, 1.7, 0.35, [1.2, FT + 0.85, 2.5], 0.006));
  props.push(B(0.75, 0.05, 0.4, [1.2, FT + 1.02, 2.5], 0.004));
  props.push(B(0.75, 0.05, 0.4, [1.2, FT + 1.45, 2.5], 0.004));
  white.push(B(0.45, 0.35, 0.35, [1.2, FT + 0.2, 3.2], 0.006));
  props.push(B(0.6, 0.75, 0.55, [3.9, FT + 0.4, 1.5], 0.01));
  props.push(C(0.24, 0.05, [3.9, FT + 0.72, 1.5], 18));
  props.push(C(0.24, 0.05, [3.9, FT + 0.72, 1.95], 18));
  props.push(B(0.08, 0.45, 0.08, [3.9, FT + 0.85, 1.5], 0.004));
  props.push(B(0.4, 0.05, 0.5, [3.9, FT + 1.1, 1.65], 0.004));
  // 轮椅
  props.push(B(0.45, 0.08, 0.45, [1.3, FT + 0.48, 1.4], 0.004));
  props.push(B(0.45, 0.5, 0.06, [1.3, FT + 0.72, 1.18], 0.004));
  props.push({ type: "torus", radius: 0.26, tube: 0.035, radialSegments: 8, tubularSegments: 20, at: [1.5, FT + 0.28, 1.4] });
  props.push({ type: "torus", radius: 0.26, tube: 0.035, radialSegments: 8, tubularSegments: 20, at: [1.1, FT + 0.28, 1.4] });
  props.push(C(0.06, 0.04, [1.3, FT + 0.05, 1.68], 10));
  // 厕所/淋浴
  for (const [cx, tag] of [[-3.5, "p"], [2.2, "s"]] as const) {
    const zBase = tag === "p" ? -4.1 : 4.1;
    for (let s = 0; s < 2; s++) {
      white.push(B(0.9, 0.02, 0.9, [cx + s * 1.05, FT + 0.02, zBase], 0.004));
      white.push(C(0.18, 0.3, [cx + s * 1.05, FT + 0.2, zBase], 12));
      props.push(B(0.5, 0.7, 0.04, [cx + s * 1.05, FT + 0.55, zBase + 0.45], 0.004));
      props.push(B(0.04, 1.9, 0.9, [cx + s * 1.05 + 0.48, FT + 0.95, zBase], 0.004));
    }
    props.push(B(1.15, 0.06, 0.5, [cx + 2.4, FT + 0.82, zBase], 0.006));
    props.push(C(0.2, 0.12, [cx + 2.4, FT + 0.9, zBase], 14));
    props.push(B(0.5, 0.55, 0.03, [cx + 2.4, FT + 1.45, zBase + 0.3], 0.004));
  }
  // 健身/洗衣/阅览
  props.push(B(0.9, 0.08, 0.22, [2.5, FT + 0.22, 5.4], 0.006));
  props.push(B(0.9, 0.06, 0.16, [2.5, FT + 0.45, 5.8], 0.004));
  props.push(B(0.06, 0.5, 0.06, [2.1, FT + 0.45, 5.2], 0.004));
  props.push(B(0.06, 0.5, 0.06, [2.9, FT + 0.45, 5.2], 0.004));
  props.push({ type: "weld", from: [2.5, FT + 0.5, 5.4], to: [2.5, FT + 0.9, 6.2], radius: 0.018 });
  props.push(B(0.06, 0.06, 0.1, [2.5, FT + 0.95, 6.25], 0.004));
  for (let d = 0; d < 4; d++) {
    props.push(C(0.09, 0.16, [3.2 + d * 0.18, FT + 0.1, 6.7], 10));
    props.push(B(0.28, 0.16, 0.16, [3.2 + d * 0.18, FT + 0.2, 6.85], 0.006));
  }
  fabric.push(B(1.2, 0.12, 0.45, [2.5, FT + 0.5, 7.5], 0.02));
  fabric.push(B(1.2, 0.12, 0.3, [2.5, FT + 0.8, 7.72], 0.02));
  props.push(B(1.4, 0.55, 0.04, [2.55, FT + 1.75, 7.92], 0.004));
  displayGeos.push(B(1.3, 0.5, 0.02, [2.55, FT + 1.75, 7.9], 0.003));
  wood.push(B(1.2, 0.8, 0.25, [1.25, FT + 0.55, 7.4], 0.006));
  for (let b = 0; b < 9; b++) props.push(B(0.05, 0.2, 0.16, [0.75 + b * 0.09, FT + 0.45 + (b % 2) * 0.3, 7.4], 0.002));
  white.push(B(0.6, 0.85, 0.6, [3.7, FT + 0.43, 5.6], 0.01));
  white.push(B(0.6, 0.85, 0.6, [3.7, FT + 1.28, 5.6], 0.01));
  props.push(C(0.18, 0.04, [3.7, FT + 0.55, 5.28], 18));
  props.push(C(0.18, 0.04, [3.7, FT + 1.4, 5.28], 18));
  props.push(B(0.8, 0.05, 0.55, [2.9, FT + 0.7, 7.1], 0.006));
  props.push(B(0.08, 0.7, 0.08, [2.55, FT + 0.35, 7.1], 0.004));
  props.push(B(0.08, 0.7, 0.08, [3.25, FT + 0.35, 7.1], 0.004));
  props.push(B(0.5, 0.65, 0.05, [3.2, FT + 1.3, 5.0], 0.004));

  // ---- 生活细节：开放柜/照片/毛巾/鞋/洗衣袋/厕所/餐厅/厨房/损管 ----
  // 水兵 A/B 舱：后壁照片板、时钟、挂衣、毛巾、鞋、洗衣袋、垃圾桶
  for (const [rz, tag] of [[-7.92, "a"], [-0.02, "b"]] as const) {
    wood.push(B(1.4, 0.7, 0.04, [-2.55, FT + 1.9, rz], 0.004));
    for (let ph = 0; ph < 4; ph++) {
      white.push(B(0.18, 0.22, 0.01, [-3.05 + ph * 0.34, FT + 1.9, rz + 0.03], 0.002));
      fabric.push(B(0.14, 0.16, 0.01, [-3.08 + ph * 0.34, FT + 1.96, rz + 0.035], 0.002));
    }
    props.push(C(0.14, 0.03, [-1.35, FT + 2.1, rz], 18));
    props.push(B(0.02, 0.18, 0.02, [-1.35, FT + 2.1, rz + 0.03], 0.002));
    props.push(C(0.03, 0.1, [-1.85, FT + 2.25, rz], 10));
    for (let b = 0; b < 3; b++) {
      props.push(B(0.5, 0.02, 0.06, [-1.85 + Math.cos(b * 2.1) * 0.34, FT + 2.22, rz + Math.sin(b * 2.1) * 0.34], 0.002));
    }
    // 挂衣/毛巾
    fabric.push(B(0.03, 0.75, 0.42, [-1.02, FT + 1.45, rz + 0.45], 0.004));
    fabric.push(B(0.03, 0.5, 0.3, [-1.02, FT + 1.3, rz + 0.85], 0.004));
    // 鞋/洗衣袋/垃圾桶
    dark.push(B(0.16, 0.14, 0.32, [-2.2, FT + 0.07, rz + 0.35], 0.01));
    dark.push(B(0.16, 0.14, 0.32, [-1.9, FT + 0.07, rz + 0.35], 0.01));
    fabric.push(B(0.55, 0.65, 0.45, [-3.6, FT + 0.33, rz + 0.4], 0.012));
    props.push(C(0.24, 0.6, [-2.9, FT + 0.3, rz + 0.45], 14));
    void tag;
  }
  // 士官/军官舱：开放衣柜、桌面照片/书、毛巾、拖鞋
  for (const [z0, x0] of [[1.7, -1.0], [4.6, -1.0], [6.3, -1.0], [7.5, -1.0]] as const) {
    fabric.push(B(0.03, 0.8, 0.5, [x0, FT + 1.3, z0], 0.004));
    fabric.push(B(0.03, 0.55, 0.36, [x0, FT + 1.2, z0 + 0.4], 0.004));
    wood.push(B(0.5, 0.04, 0.35, [-1.55, FT + 0.8, z0 + 0.2], 0.006));
    white.push(B(0.24, 0.3, 0.02, [-1.55, FT + 0.98, z0 + 0.2], 0.003));
    props.push(C(0.06, 0.08, [-1.3, FT + 0.84, z0 + 0.1], 10));
  }
  // 卫生间：隔间/马桶/水箱/扶手/洗手池/镜子/淋浴
  for (const [cx0, cz0] of [[-3.2, -4.1], [3.2, 4.1]] as const) {
    for (let s = 0; s < 2; s++) {
      const sx = cx0 - 0.9 + s * 1.8;
      white.push(C(0.22, 0.4, [sx, FT + 0.2, cz0], 14));
      white.push(B(0.55, 0.55, 0.22, [sx, FT + 0.55, cz0 + 0.32], 0.01));
      dark.push(B(0.03, 1.7, 1.1, [sx - 0.65, FT + 0.85, cz0], 0.004));
      dark.push(B(0.03, 1.7, 1.1, [sx + 0.65, FT + 0.85, cz0], 0.004));
      props.push(C(0.06, 0.02, [sx + 0.45, FT + 1.0, cz0 + 0.35], 10));
      props.push(B(0.3, 0.02, 0.2, [sx + 0.45, FT + 1.15, cz0 + 0.35], 0.002));
    }
    white.push(B(1.8, 0.06, 0.55, [cx0, FT + 0.9, cz0 + 0.8], 0.006));
    for (const sx of [cx0 - 0.55, cx0 + 0.55]) {
      white.push(C(0.2, 0.16, [sx, FT + 0.98, cz0 + 0.8], 14));
      props.push(C(0.025, 0.16, [sx, FT + 1.08, cz0 + 0.8], 10));
    }
    props.push(B(1.4, 0.8, 0.02, [cx0, FT + 1.5, cz0 + 1.05], 0.002));
    white.push(B(1.4, 0.04, 1.0, [cx0, FT + 0.02, cz0 - 0.5], 0.004));
    props.push(C(0.04, 0.4, [cx0 + 0.6, FT + 1.8, cz0 - 0.5], 10));
    props.push(C(0.12, 0.03, [cx0 + 0.6, FT + 2.0, cz0 - 0.5], 12));
    props.push(B(0.03, 0.02, 0.2, [cx0 + 0.6, FT + 2.02, cz0 - 0.35], 0.002));
  }
  // 餐厅：托盘/餐盘/食物/调料/咖啡/饮水机/回收架
  for (const [tx, tz] of [[2.55, -7.2], [2.55, -5.6], [2.55, -4.1]] as const) {
    white.push(B(0.75, 0.03, 0.5, [tx - 0.3, FT + 0.79, tz], 0.004));
    props.push(C(0.16, 0.04, [tx + 0.15, FT + 0.8, tz], 18));
    food.push(B(0.2, 0.06, 0.16, [tx + 0.15, FT + 0.83, tz], 0.008));
    foodGreen.push(B(0.08, 0.06, 0.1, [tx + 0.35, FT + 0.83, tz + 0.12], 0.008));
    props.push(C(0.04, 0.08, [tx - 0.35, FT + 0.84, tz + 0.15], 10));
    props.push(B(0.08, 0.12, 0.05, [tx + 0.45, FT + 0.85, tz - 0.1], 0.004));
    props.push(B(0.18, 0.08, 0.12, [tx - 0.15, FT + 0.83, tz - 0.15], 0.004));
  }
  props.push(C(0.28, 0.7, [3.75, FT + 0.4, -4.2], 16));
  props.push(C(0.22, 0.2, [3.75, FT + 0.9, -4.2], 16));
  white.push(B(0.6, 0.9, 0.5, [1.1, FT + 0.45, -4.2], 0.008));
  props.push(C(0.12, 0.5, [1.1, FT + 1.1, -4.2], 12));
  white.push(B(0.5, 0.04, 0.35, [1.1, FT + 1.0, -4.0], 0.004));
  // 厨房：冷库温度表/切配/锅具/洗碗架
  props.push(B(0.2, 0.15, 0.04, [2.2, FT + 1.6, -2.82], 0.003));
  props.push(B(0.2, 0.15, 0.04, [3.45, FT + 1.6, -2.82], 0.003));
  props.push(B(0.45, 0.04, 0.3, [2.6, FT + 0.95, -0.6], 0.004));
  props.push(C(0.25, 0.25, [2.9, FT + 1.1, -1.0], 14));
  props.push(C(0.3, 0.18, [3.2, FT + 1.05, -1.0], 14));
  white.push(B(0.7, 0.25, 0.5, [2.25, FT + 0.95, 0.05], 0.006));
  // 走廊损管柜：SCBA/水带/水枪/支撑
  dark.push(B(0.7, 1.8, 0.4, [0.82, FT + 0.9, -2.0], 0.006));
  white.push(C(0.1, 0.5, [0.82, FT + 1.0, -2.0], 12));
  props.push(C(0.03, 1.2, [0.82, FT + 0.6, -1.8], 8));
  props.push(B(0.5, 0.12, 0.08, [0.82, FT + 1.4, -2.0], 0.004));
  props.push(B(0.18, 0.18, 0.18, [0.82, FT + 0.2, -2.0], 0.004));

  crewPart("wood_furniture", "生活区木纹家具/床板/桌面", M(...wood), "cv_055_wood");
  crewPart("dark_furniture", "生活区深色金属家具/柜架", M(...dark), "cv_055_console");
  crewPart("fabric_furniture", "生活区布艺/沙发/床垫/隔帘", M(...fabric), "cv_055_seat");
  crewPart("white_furniture", "厨房/医务/卫生白色设备", M(...white), "cv_055_ceiling");
  crewPart("screens", "生活区电视/医疗监护屏", M(...displayGeos), "cv_scr_camera");
  crewPart("props", "生活区随身物件/餐具/器材", M(...props), "cv_steel");
  crewPart("food", "餐厅食物/配餐", M(...food), "cv_food");
  crewPart("food_green", "餐厅蔬菜/配菜", M(...foodGreen), "cv_food_green");

  // 走廊附件：扶手/消防瓶/损管柜/管路/标识/救生衣
  const corridorProps: Array<ReturnType<typeof B>> = [];
  corridorProps.push(B(0.05, 0.05, 14.6, [-0.82, FT + 1.0, 0], 0.003));
  corridorProps.push(B(0.05, 0.05, 14.6, [0.82, FT + 1.0, 0], 0.003));
  corridorProps.push(B(0.4, 0.85, 0.35, [0.55, FT + 0.43, -7.2], 0.006));
  corridorProps.push(C(0.12, 0.5, [0.55, FT + 0.7, -6.9], 12));
  corridorProps.push(B(0.35, 0.55, 0.25, [-0.55, FT + 0.3, 5.9], 0.006));
  corridorProps.push(B(0.25, 0.35, 0.02, [-0.55, FT + 0.4, 6.04], 0.003));
  for (const z of [-7.0, -3.0, 1.0, 5.0]) corridorProps.push(B(0.18, 0.06, 0.03, [-0.78, FT + 2.2, z], 0.002));
  corridorProps.push(B(0.5, 0.12, 0.03, [0, FT + 2.32, -6.3], 0.002));
  corridorProps.push(B(0.5, 0.12, 0.03, [0, FT + 2.32, 1.9], 0.002));
  crewPart("corridor_props", "生活区走廊扶手/损管柜/消防瓶/标识", M(...corridorProps), "cv_055_console");
  const pipes: Array<Parameters<typeof M>[0]> = [];
  for (const [dx, y] of [[-0.55, CH - 0.11], [-0.46, CH - 0.11], [0.5, CH - 0.13], [0.58, CH - 0.13]] as const) {
    pipes.push({ type: "weld", from: [dx, y, -8], to: [dx, y, 8], radius: 0.012 });
  }
  crewPart("corridor_pipes", "生活区走廊电缆/水管", M(...pipes), "cv_copper");

  // 视点锚点（走廊/水兵住舱/餐厅厨房）
  const anchors: Array<[string, string, [number, number, number]]> = [
    ["crew_corridor_eye", "生活区走廊视点", [0, FT + 1.65, 6.9]],
    ["crew_corridor_end", "生活区走廊尽头", [0, FT + 1.5, -7.85]],
    ["crew_berth_eye", "水兵住舱视点", [-2.55, FT + 1.62, -4.85]],
    ["crew_berth_target", "水兵住舱铺位目标", [-2.55, FT + 1.0, -7.5]],
    ["crew_mess_eye", "餐厅厨房视点", [1.2, FT + 1.82, -4.2]],
    ["crew_mess_target", "餐厅配餐台目标", [2.7, FT + 1.05, -7.55]],
  ];
  for (const [tag, cn, at] of anchors) {
    add({
      id: `${P}interior.${tag}`,
      name_cn: cn,
      name_en: tag.replace(/_/g, " "),
      assembly: "interior",
      build_layer: 3,
      geometry: M(B(0.004, 0.004, 0.004, [0, 0, 0], 0.001)),
      material: "cv_055_console",
      mate: A(at),
    });
  }

  // ---------------- 轮机维修车间（机舱右侧，备用燃气轮机/车床/工具/吊车） ----------------
  // 公开资料：QC-280 燃气轮机采用整机模块更换——拆进排气道、开吊装通道、吊出旧机、
  // 换新机后激光对中。这里把维修/机加工/备件/吊装区做在机舱右侧，可从“维修车间”视角看。
  {
    const wx = 7.0;
    const wz = -30.0;
    const wy = 4.2;
    add({
      id: `${P}power.workshop_floor`,
      name_cn: "维修车间花钢板/围栏",
      name_en: "workshop deck and railing",
      assembly: "propulsion",
      build_layer: 2,
      geometry: M(
        B(4.0, 0.06, 7.0, [0, 0, 0], 0.01),
        B(4.0, 0.06, 0.05, [0, 1.0, -3.45], 0.003),
        B(4.0, 0.06, 0.05, [0, 1.0, 3.45], 0.003),
        B(0.05, 0.06, 7.0, [-1.95, 1.0, 0], 0.003),
        B(0.05, 0.06, 7.0, [1.95, 1.0, 0], 0.003),
        ...[-1.8, -0.6, 0.6, 1.8].flatMap((dz) => [
          B(0.03, 1.0, 0.03, [-1.95, 0.5, dz], 0.002),
          B(0.03, 1.0, 0.03, [1.95, 0.5, dz], 0.002),
        ]),
      ),
      material: "cv_grate",
      mate: A([wx, wy, wz]),
    });
    add({
      id: `${P}power.workshop_bench`,
      name_cn: "维修工作台/台钳/工具板",
      name_en: "workshop bench and tool board",
      assembly: "propulsion",
      build_layer: 2,
      geometry: M(
        B(2.4, 0.1, 1.0, [0, 0.8, 0], 0.01),
        B(0.1, 0.75, 0.9, [-1.05, 0.4, 0], 0.006),
        B(0.1, 0.75, 0.9, [1.05, 0.4, 0], 0.006),
        B(1.8, 0.5, 0.04, [0, 1.35, -0.5], 0.006),
        C(0.08, 0.16, [-0.6, 0.95, 0.2], 12),
        B(0.14, 0.08, 0.1, [-0.6, 0.9, 0.2], 0.004),
      ),
      material: "cv_055_console",
      mate: A([wx - 0.8, wy, wz - 2.3]),
    });
    add({
      id: `${P}power.workshop_tools`,
      name_cn: "工具/量具/备件箱",
      name_en: "workshop tools and parts",
      assembly: "propulsion",
      build_layer: 2,
      geometry: M(
        B(0.6, 0.5, 0.4, [0, 0.25, 0], 0.01),
        ...[0, 1, 2].flatMap((d) => B(0.55, 0.03, 0.02, [0, 0.12 + d * 0.12, 0.21], 0.002)),
        B(0.25, 0.12, 0.2, [0.5, 0.12, 0.1], 0.004),
        B(0.18, 0.08, 0.14, [-0.3, 0.85, 0.0], 0.003),
      ),
      material: "cv_055_hull",
      mate: A([wx + 1.0, wy, wz - 2.3]),
    });
    // 车床/钻床/砂轮机
    add({
      id: `${P}power.workshop_machines`,
      name_cn: "维修车间车床/钻床/砂轮机",
      name_en: "workshop lathe drill and grinder",
      assembly: "propulsion",
      build_layer: 2,
      geometry: M(
        B(1.5, 0.18, 0.5, [0, 0.55, 0], 0.01),
        C(0.16, 0.5, [-0.5, 0.7, 0], 16),
        C(0.08, 0.5, [0.5, 0.68, 0], 12),
        B(0.3, 0.08, 0.14, [0.5, 0.72, 0], 0.004),
        C(0.04, 0.3, [0, 0.9, 0], 10),
        B(0.25, 0.04, 0.25, [0, 1.05, 0], 0.006),
        B(0.3, 0.12, 0.3, [1.0, 0.2, 0], 0.006),
        C(0.14, 0.04, [1.0, 0.3, 0], 18),
      ),
      material: "cv_055_hull",
      mate: A([wx, wy, wz + 1.9]),
    });
    // 焊机/气瓶/焊接屏
    add({
      id: `${P}power.workshop_welding`,
      name_cn: "维修车间焊机/气瓶/焊接屏",
      name_en: "workshop welder and gas bottles",
      assembly: "propulsion",
      build_layer: 2,
      geometry: M(
        B(0.6, 0.5, 0.35, [0, 0.4, 0], 0.01),
        C(0.12, 0.8, [-0.9, 0.4, 0.3], 12),
        C(0.12, 0.8, [-0.6, 0.4, 0.3], 12),
        B(0.04, 1.2, 1.1, [0.7, 0.6, 0.1], 0.004),
        { type: "weld", from: [0.25, 0.55, 0], to: [-0.35, 0.35, 0.25], radius: 0.02 },
      ),
      material: "cv_055_console",
      mate: A([wx - 0.8, wy, wz + 5.0]),
    });
    // 备用 QC-280 整机模块（轮式托架 + 转子 + 管线 + 吊装梁）
    add({
      id: `${P}power.workshop_spare_turbine`,
      name_cn: "备用 QC-280 燃气轮机模块",
      name_en: "spare QC-280 gas turbine module",
      assembly: "propulsion",
      build_layer: 2,
      geometry: M(
        B(2.1, 0.3, 1.4, [0, 0.25, 0], 0.02),
        { type: "latheZ", profile: [[0.02, -1.3], [0.45, -1.2], [0.62, -0.8], [0.62, 0.8], [0.45, 1.2], [0.02, 1.3]], segments: 22 },
        C(0.1, 0.55, [0, 1.5, -0.7], 12),
        B(1.5, 0.12, 0.12, [0, 1.62, 0], 0.006),
        ...[-0.85, 0.85].flatMap((dz) => [
          C(0.22, 0.12, [-0.9, 0.16, dz], 14),
          C(0.22, 0.12, [0.9, 0.16, dz], 14),
        ]),
      ),
      material: "cv_055_hull",
      mate: A([wx + 0.2, wy, wz - 0.2]),
    });
    add({
      id: `${P}power.workshop_crane`,
      name_cn: "维修车间吊装梁/吊钩",
      name_en: "workshop crane rail and hook",
      assembly: "propulsion",
      build_layer: 2,
      geometry: M(
        B(0.12, 0.16, 7.0, [-1.0, 3.2, 0], 0.006),
        B(0.12, 0.16, 7.0, [1.0, 3.2, 0], 0.006),
        B(2.2, 0.12, 0.2, [0, 3.2, -0.5], 0.006),
        { type: "weld", from: [0, 3.12, -0.5], to: [0, 2.35, -0.5], radius: 0.02 },
        { type: "torus", radius: 0.08, tube: 0.016, radialSegments: 8, tubularSegments: 16, at: [0, 2.27, -0.5] },
      ),
      material: "cv_steel_dark",
      mate: A([wx, wy, wz]),
    });
    // 备件架/消防瓶/控制屏/视点
    add({
      id: `${P}power.workshop_shelf`,
      name_cn: "维修车间备件架/控制屏",
      name_en: "workshop spare parts shelf and panel",
      assembly: "propulsion",
      build_layer: 2,
      geometry: M(
        B(1.8, 0.06, 0.4, [0, 0.6, 0], 0.004),
        B(1.8, 0.06, 0.4, [0, 1.0, 0], 0.004),
        B(1.8, 0.06, 0.4, [0, 1.4, 0], 0.004),
        ...Array.from({ length: 8 }, (_, k) => B(0.16, 0.2, 0.25, [-0.75 + k * 0.21, 0.75 + (k % 3) * 0.4, 0], 0.004)),
        B(0.7, 0.5, 0.06, [1.0, 1.4, 0.2], 0.006),
        C(0.06, 0.02, [1.0, 1.4, 0.24], 14),
        C(0.06, 0.25, [-1.2, 0.12, -1.8], 12),
        B(0.16, 0.03, 0.16, [-1.2, 0.3, -1.8], 0.003),
      ),
      material: "cv_055_console",
      mate: A([wx, wy, wz + 3.0]),
    });
    add({
      id: `${P}power.workshop_eye_post`,
      name_cn: "维修车间视点立柱",
      name_en: "workshop view mast",
      assembly: "propulsion",
      build_layer: 2,
      geometry: M(B(0.08, 2.8, 0.08, [0, 1.4, 0], 0.004), B(0.2, 0.04, 0.2, [0, 0.02, 0], 0.004)),
      material: "cv_steel_dark",
      mate: A([wx - 0.8, wy, wz + 5.4]),
    });
    add({
      id: `${P}power.workshop_eye`,
      name_cn: "维修车间视点",
      name_en: "workshop view eye",
      assembly: "propulsion",
      build_layer: 2,
      geometry: M(B(0.004, 0.004, 0.004, [0, 0, 0], 0.001)),
      material: "cv_055_console",
      mate: A([wx + 1.3, wy + 1.8, wz + 3.0]),
    });
    add({
      id: `${P}power.workshop_target`,
      name_cn: "维修车间目标",
      name_en: "workshop view target",
      assembly: "propulsion",
      build_layer: 2,
      geometry: M(B(0.004, 0.004, 0.004, [0, 0, 0], 0.001)),
      material: "cv_055_console",
      mate: A([wx + 0.2, wy + 1.0, wz - 0.2]),
    });
  }

  // ---------------- 直升机甲板加油作业（站点 + 加油车 + 软管 + 接地） ----------------
  {
    const fy = t55DeckTop(T55.HELIPAD_Z) + 0.12;
    const sz = T55.HELIPAD_Z + 2.8;
    add({
      id: `${P}hangar.fuel_station`,
      name_cn: "直升机甲板燃油补给站",
      name_en: "helipad fuel servicing station",
      assembly: "hangar",
      build_layer: 4,
      geometry: M(
        B(1.1, 0.08, 0.9, [0, 0.04, 0], 0.008),
        B(1.0, 1.1, 0.7, [0, 0.6, 0], 0.012),
        B(0.9, 0.07, 0.78, [0, 1.18, 0], 0.006),
        B(0.7, 0.32, 0.03, [0, 0.78, 0.36], 0.004),
        B(0.55, 0.18, 0.015, [0, 0.78, 0.38], 0.002),
        C(0.1, 0.3, [0.62, 0.6, 0.2], 14),
        T(0.28, 0.2, 0.08, [-0.45, 0.55, 0], 18),
        C(0.08, 0.16, [0.5, 0.35, 0.35], 10),
        C(0.06, 0.16, [0.5, 0.2, 0.35], 10),
        T(0.14, 0.08, 0.06, [0.4, 0.03, 0.55], 16),
      ),
      material: "cv_055_hull",
      mate: A([5.6, fy, sz]),
    });
    add({
      id: `${P}hangar.fuel_station_screen`,
      name_cn: "加油计量屏",
      name_en: "fuel metering screen",
      assembly: "hangar",
      build_layer: 4,
      geometry: M(B(0.5, 0.3, 0.02, [0, 0, 0], 0.003)),
      material: "cv_scr_engine",
      mate: A([5.6, fy + 0.76, sz + 0.4]),
    });
    add({
      id: `${P}hangar.fuel_cart`,
      name_cn: "直升机加油车",
      name_en: "helicopter fuel servicing cart",
      assembly: "hangar",
      build_layer: 4,
      geometry: M(
        B(1.35, 0.14, 0.7, [0, 0.55, 0], 0.02),
        B(0.16, 0.55, 0.16, [-0.5, 0.85, 0], 0.008),
        B(0.16, 0.55, 0.16, [0.5, 0.85, 0], 0.008),
        B(1.3, 0.12, 0.14, [0, 1.12, 0], 0.008),
        C(0.32, 0.18, [-0.5, 0.32, 0], 18),
        C(0.32, 0.18, [0.5, 0.32, 0], 18),
        T(0.45, 0.3, 0.18, [0, 0.9, 0], 20),
        C(0.2, 0.4, [0.2, 0.8, 0.1], 14),
        C(0.1, 0.06, [0.2, 1.02, 0.1], 12),
        B(0.3, 0.22, 0.03, [-0.2, 0.82, 0.36], 0.004),
      ),
      material: "cv_warning",
      mate: A([2.6, fy, T55.HELIPAD_Z + 2.2]),
    });
    add({
      id: `${P}hangar.fuel_cart_hose`,
      name_cn: "加油软管/加油枪",
      name_en: "fuel hose and nozzle",
      assembly: "hangar",
      build_layer: 4,
      geometry: M(
        { type: "weld", from: [0.4, 0.9, 0.2], to: [-0.2, 0.8, 0.9], radius: 0.035 },
        { type: "weld", from: [-0.2, 0.8, 0.9], to: [-0.8, 0.75, 1.5], radius: 0.035 },
        { type: "weld", from: [-0.8, 0.75, 1.5], to: [-1.1, 0.7, 2.0], radius: 0.035 },
        C(0.06, 0.28, [-1.15, 0.78, 2.08], 12),
        T(0.08, 0.055, 0.08, [-1.15, 0.9, 2.1], 14),
        { type: "weld", from: [-1.15, 0.68, 2.1], to: [-1.4, 0.66, 2.3], radius: 0.035 },
      ),
      material: "cv_rubber",
      mate: A([2.6, fy, T55.HELIPAD_Z + 2.2]),
    });
    add({
      id: `${P}hangar.fuel_ground`,
      name_cn: "加油接地线/接地盘",
      name_en: "fuel bonding cable",
      assembly: "hangar",
      build_layer: 4,
      geometry: M(
        { type: "weld", from: [0.5, 0.6, -0.3], to: [1.1, 0.08, -0.8], radius: 0.012 },
        { type: "weld", from: [1.1, 0.08, -0.8], to: [1.7, 0.03, -1.2], radius: 0.012 },
        C(0.06, 0.025, [1.72, 0.04, -1.21], 12),
      ),
      material: "cv_copper",
      mate: A([2.6, fy, T55.HELIPAD_Z + 2.2]),
    });
    add({
      id: `${P}hangar.fuel_receptacle`,
      name_cn: "Z-20 受油口",
      name_en: "Z-20 fuel receptacle",
      assembly: "hangar",
      build_layer: 4,
      geometry: M(
        T(0.08, 0.04, 0.06, [0, 0, 0], 14),
        C(0.05, 0.12, [0, 0, 0], 12),
        B(0.12, 0.05, 0.18, [0, -0.09, 0], 0.006),
      ),
      material: "cv_brass",
      mate: A([1.7, fy + 0.9, T55.HELIPAD_Z - 0.4]),
    });
    add({
      id: `${P}hangar.fuel_view_mast`,
      name_cn: "直升机加油视点立柱",
      name_en: "helipad fuel view mast",
      assembly: "hangar",
      build_layer: 4,
      geometry: M(B(0.09, 3.6, 0.09, [0, 1.8, 0], 0.004), B(0.24, 0.04, 0.24, [0, 0.02, 0], 0.004)),
      material: "cv_steel_dark",
      mate: A([5.6, fy, T55.HELIPAD_Z + 8.2]),
    });
    add({
      id: `${P}hangar.fuel_view_eye`,
      name_cn: "直升机加油视点",
      name_en: "helipad fuel view eye",
      assembly: "hangar",
      build_layer: 4,
      geometry: M(B(0.004, 0.004, 0.004, [0, 0, 0], 0.001)),
      material: "cv_055_console",
      mate: A([5.6, fy + 3.6, T55.HELIPAD_Z + 8.2]),
    });
    add({
      id: `${P}hangar.fuel_view_target`,
      name_cn: "直升机加油目标",
      name_en: "helipad fuel view target",
      assembly: "hangar",
      build_layer: 4,
      geometry: M(B(0.004, 0.004, 0.004, [0, 0, 0], 0.001)),
      material: "cv_055_console",
      mate: A([1.4, fy + 0.8, T55.HELIPAD_Z - 0.6]),
    });
  }

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
  // 救生筏绑扎带/静水压力释放器/释放手柄
  for (let i = 0; i < 20; i++) {
    const z = -70 + Math.floor(i / 2) * 2.2;
    const x = (i % 2 === 0 ? -1 : 1) * (t55DeckHalf(z) - 0.45);
    const y = t55DeckTop(z) + 0.4;
    add({
      id: `${P}surface.raft_strap_${pad(i + 1)}`,
      name_cn: `救生筏绑扎带 ${i + 1}`,
      name_en: `life raft strap ${i + 1}`,
      assembly: "surface",
      build_layer: 5,
      geometry: M(T(0.555, 0.505, 0.06, [0, 0, 0], 20)),
      material: "cv_rubber",
      mate: A([x, y + 0.7, z]),
    });
    add({
      id: `${P}surface.raft_release_${pad(i + 1)}`,
      name_cn: `救生筏静水释放器 ${i + 1}`,
      name_en: `life raft hydrostatic release ${i + 1}`,
      assembly: "surface",
      build_layer: 5,
      geometry: M(B(0.18, 0.14, 0.14, [0, 0, 0], 0.006), C(0.04, 0.08, [0, -0.1, 0], 8)),
      material: "cv_warning",
      mate: A([x, y - 0.3, z]),
    });
    add({
      id: `${P}surface.raft_handle_${pad(i + 1)}`,
      name_cn: `救生筏释放手柄 ${i + 1}`,
      name_en: `life raft release handle ${i + 1}`,
      assembly: "surface",
      build_layer: 5,
      geometry: M(C(0.025, 0.18, [0, 0, 0], 6), T(0.06, 0.035, 0.02, [0, 0.1, 0], 8)),
      material: "cv_steel",
      mate: A([x + 0.3, y - 0.1, z + 0.2]),
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
    staticOnly("t55-radar-tx-mast", "type055.radar.tx_*", "type055.super.mast*", "346B 发射机柜嵌入综合桅杆内部", 900),
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
    staticOnly("t55-interior-super", "type055.interior.*", "type055.super.*", "舰桥/CIC 设备与上建安装", 3000),
    staticOnly("t55-interior-radar", "type055.interior.*", "type055.radar.bridge_face_*", "舰桥内顶板与舰桥正面阵面安装框", 1500),
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
  type055CommandConsole,
  type055CommandChair,
  type055CommandChairBase,
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
