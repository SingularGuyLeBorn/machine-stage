import * as THREE from "three";
import type { InstanceLayout } from "../../assembler/assembler";
import type { ExpectedContactRule, ModelRegistry } from "../../registry/types";
import { A, B, C, M, S, T, carrierContext, pad } from "../carrier/common";
import { CV_MATERIALS } from "../carrier/materials";
import { T55, T55_CONSTANTS, t55DeckHalf, t55HalfAt } from "./constants";
import {
  type055AesaPanel,
  type055Deck,
  type055DeckUnderside,
  type055Frustum,
  type055GunTurret,
  type055Helipad,
  type055HullShell,
  type055HullUnderwater,
  type055Propeller,
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
    material: "cv_hull",
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
    name_cn: "球鼻艏/舰壳声呐罩",
    name_en: "bow sonar dome",
    assembly: "hull",
    build_layer: 1,
    geometry: M(S(1.8, [0, 0, 0], 24)),
    material: "cv_antifouling",
    mate: A([0, 4.2, 87.5]),
  });
  add({
    id: `${P}hull.sonar_array`,
    name_cn: "舰壳声呐阵",
    name_en: "hull sonar array",
    assembly: "hull",
    build_layer: 1,
    geometry: M(T(1.0, 0.8, 0.35, [0, 0, 0], 24), C(0.75, 0.08, [0, 0, 0], 20)),
    material: "cv_steel_dark",
    mate: A([0, 3.2, 89.5], [90, 0, 0]),
  });

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
        mate: A([x, DECK + 0.5, z]),
      });
    }
    add({
      id: `${P}deck.rail_${side === -1 ? "l" : "r"}`,
      name_cn: `甲板栏杆 ${side === -1 ? "左" : "右"}`,
      name_en: `deck rail ${side === -1 ? "l" : "r"}`,
      assembly: "surface",
      build_layer: 4,
      geometry: M(
        { type: "weld", from: [side * t55DeckHalf(-84), DECK + 1.0, -84], to: [side * t55DeckHalf(-30), DECK + 1.0, -30], radius: 0.035 },
        { type: "weld", from: [side * t55DeckHalf(-30), DECK + 1.0, -30], to: [side * t55DeckHalf(50), DECK + 1.0, 50], radius: 0.035 },
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
    material: "cv_hull",
    mate: A([0, DECK, 22]),
  });
  add({
    id: `${P}super.bridge`,
    name_cn: "舰桥",
    name_en: "bridge",
    assembly: "superstructure",
    build_layer: 4,
    geometry: { type: "kit", kit: "type055Frustum", params: { w0: 9.6, d0: 15, w1: 8.2, d1: 12.5, h: 5.5 } },
    material: "cv_hull",
    mate: A([0, DECK + 7.4, 26]),
  });
  add({
    id: `${P}super.hangar_block`,
    name_cn: "双机库上层建筑",
    name_en: "hangar block",
    assembly: "hangar",
    build_layer: 4,
    geometry: { type: "kit", kit: "type055Frustum", params: { w0: 12.6, d0: 18, w1: 11.2, d1: 16, h: 6.4 } },
    material: "cv_hull",
    mate: A([0, DECK, -63]),
  });
  add({
    id: `${P}super.mast`,
    name_cn: "一体化隐身桅杆",
    name_en: "integrated mast",
    assembly: "radar",
    build_layer: 4,
    geometry: { type: "kit", kit: "type055Frustum", params: { w0: 6.0, d0: 8.6, w1: 2.4, d1: 4.4, h: 13 } },
    material: "cv_hull",
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
      material: "cv_bridge_glass",
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
    material: "cv_hull",
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

  // ---------------- 112 单元 VLS ----------------
  ctx.node({ name: "CV_055_VlsHatch", parent: "root", pivot: [0, DECK + 0.06, 0], note: "VLS 井盖阵列" });
  const vlsHatch = (x: number, z: number) =>
    new THREE.Matrix4().makeTranslation(x, DECK + 0.04, z);
  add({
    id: `${P}vls.hatch`,
    name_cn: "通用垂发井盖 ×112",
    name_en: "VLS hatch ×112",
    assembly: "vls",
    build_layer: 4,
    geometry: M(
      B(1.04, 0.09, 1.04, [0, 0, 0], 0.006),
      B(0.9, 0.035, 0.9, [0, 0.06, 0], 0.004),
      B(0.12, 0.14, 0.08, [-0.4, 0.02, 0.38], 0.003),
    ),
    material: "cv_steel",
    instances: 112,
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
  const hatchPositions: Array<[number, number]> = [];
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) hatchPositions.push([-4.4 + c * 1.25, 44 + r * 1.25]);
  for (let r = 0; r < 6; r++) for (let c = 0; c < 8; c++) hatchPositions.push([-4.4 + c * 1.25, -52 + r * 1.25]);
  ctx.layout("type055.vlsHatch", ({ index }) => vlsHatch(hatchPositions[index]![0], hatchPositions[index]![1]));
  ctx.layout("type055.vlsTube", ({ index }) => {
    const [x, z] = hatchPositions[index]!;
    return new THREE.Matrix4().makeTranslation(x, 12.0, z);
  });
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
  ctx.node({ name: "CV_055_Gun", parent: "root", pivot: [0, DECK, T55.GUN_Z], motion: "rotate", axis: "y", note: "130mm 炮塔旋回" });
  ctx.node({ name: "CV_055_GunBarrel", parent: "CV_055_Gun", pivot: [0, 1.9, 1.2], motion: "rotate", axis: "x", note: "130mm 身管俯仰" });
  add({
    id: `${P}gun.turret`,
    name_cn: "130mm 隐身炮塔",
    name_en: "130mm stealth turret",
    assembly: "weapons",
    build_layer: 4,
    geometry: { type: "kit", kit: "type055GunTurret" },
    material: "cv_hull",
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
    mate: A([0, 0.3, 3.4], [90, 0, 0]),
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
      material: "cv_hull",
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
      material: "cv_hull",
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
    mate: A([0, DECK + 0.03, T55.HELIPAD_Z]),
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
      mate: A([side * 2.9, DECK + 2.5, -72.1]),
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
    mate: A([0, DECK + 0.04, -80]),
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
    add({
      id: `${P}surface.anchor_${side === -1 ? "l" : "r"}`,
      name_cn: `锚 ${side === -1 ? "左" : "右"}`,
      name_en: `anchor ${side === -1 ? "l" : "r"}`,
      assembly: "surface",
      build_layer: 5,
      geometry: M(B(0.4, 1.4, 0.24, [0, 0, 0], 0.02), B(1.3, 0.24, 0.24, [0, -0.75, 0], 0.02)),
      material: "cv_steel_dark",
      mate: A([side * 3.6, 10.5, 78]),
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
    mate: A([0, DECK + 0.45, 60], [-18, 0, 0]),
  });
  for (let i = 0; i < 8; i++) {
    add({
      id: `${P}surface.life_raft_${pad(i + 1)}`,
      name_cn: `救生筏 ${i + 1}`,
      name_en: `life raft ${i + 1}`,
      assembly: "surface",
      build_layer: 5,
      geometry: M(C(0.5, 0.8, [0, 0, 0], 16)),
      material: "cv_canvas",
      mate: A([(i % 2 === 0 ? -1 : 1) * (t55DeckHalf(-20) - 0.8), DECK + 0.4, -20 + Math.floor(i / 2) * 1.2]),
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
    staticOnly("t55-surface-self", "type055.surface.*", "type055.surface.*", "栏杆/救生筏/锚装配", 60),
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
  type055DeckUnderside,
  type055Frustum,
  type055AesaPanel,
  type055Propeller,
  type055Helipad,
  type055GunTurret,
};
