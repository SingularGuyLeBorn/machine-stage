import * as THREE from "three";
import { CV } from "./constants";
import { A, B, C, M, T, pad, type CarrierCtx } from "./common";

// ============================================================================
// L2 机库 / 弹药库 / 弹药升降机 / 防火分段门 / 维护区
// ============================================================================

const ASSEMBLY = "hangar";
const P = "carrier.hangar.";
export const AMMO_ELEVATOR_NODE = "CV_AmmoElevator";
export const HANGAR_DOOR_NODES = [1, 2, 3, 4, 5].map((i) => `CV_HangarDoor_${i}`);

export function addHangar(ctx: CarrierCtx): void {
  const add = (part: Parameters<CarrierCtx["add"]>[0]) => ctx.add(part);
  const deckY = CV.HANGAR_Y + 0.14;

  // 防火分段门：每道双扇，绕两侧铰链开合。
  const DOOR_Z = [-2.5, 0.5, 4.5, 7.5, 10.5];
  HANGAR_DOOR_NODES.forEach((node, index) => {
    const z = DOOR_Z[index]!;
    ctx.node({ name: node, parent: "root", pivot: [-2.6, deckY, z], motion: "rotate", axis: "y", note: `机库防火门 ${index + 1} 左扇（折叠收拢）` });
    ctx.node({ name: `${node}_R`, parent: "root", pivot: [2.6, deckY, z], motion: "rotate", axis: "y", note: `机库防火门 ${index + 1} 右扇（折叠收拢）` });
    add({
      id: `${P}fire_door_${pad(index + 1)}_frame`,
      name_cn: `机库防火门 ${index + 1} 门框`,
      name_en: `hangar fire door frame ${index + 1}`,
      assembly: ASSEMBLY,
      build_layer: 2,
      geometry: M(B(5.3, 0.08, 0.18, [0, 0.96, 0], 0.008), B(5.3, 0.08, 0.18, [0, -0.04, 0], 0.008), B(0.12, 1.05, 0.18, [-2.6, 0.46, 0], 0.006), B(0.12, 1.05, 0.18, [2.6, 0.46, 0], 0.006)),
      material: "cv_steel_dark",
      mate: A([0, deckY, z]),
    });
    add({
      id: `${P}fire_door_${pad(index + 1)}_leaf_l`,
      name_cn: `机库防火门 ${index + 1} 左扇`,
      name_en: `hangar fire door ${index + 1} left leaf`,
      assembly: ASSEMBLY,
      build_layer: 2,
      geometry: M(B(2.55, 0.9, 0.07, [1.28, 0.5, 0], 0.008), B(2.3, 0.08, 0.03, [1.28, 0.26, 0.045], 0.003)),
      material: "cv_hull",
      node,
      mate: A([0, 0, 0]),
    });
    add({
      id: `${P}fire_door_${pad(index + 1)}_leaf_r`,
      name_cn: `机库防火门 ${index + 1} 右扇`,
      name_en: `hangar fire door ${index + 1} right leaf`,
      assembly: ASSEMBLY,
      build_layer: 2,
      geometry: M(B(2.55, 0.9, 0.07, [1.28, 0.5, 0], 0.008)),
      material: "cv_hull",
      node: `${node}_R`,
      mate: A([0, 0, 0], [0, 180, 0]),
    });
    add({
      id: `${P}fire_door_${pad(index + 1)}_actuator`,
      name_cn: `机库防火门 ${index + 1} 作动器`,
      name_en: `hangar fire door actuator ${index + 1}`,
      assembly: ASSEMBLY,
      build_layer: 2,
      geometry: M(C(0.05, 0.32, [0, 0, 0], 12), C(0.025, 0.22, [0, 0.2, 0], 10)),
      material: "cv_steel",
      node,
      mate: A([0.5, 0.6, -0.1], [0, 0, 20]),
    });
  });

  // 停机位/系留点/轮挡/维护工位。
  for (let p = 0; p < 8; p++) {
    add({
      id: `${P}parking_${pad(p + 1)}`,
      name_cn: `机库停机位 ${p + 1}`,
      name_en: `hangar parking spot ${p + 1}`,
      assembly: ASSEMBLY,
      build_layer: 2,
      geometry: M(B(1.5, 0.006, 1.6, [0, 0, 0], 0.002), B(0.06, 0.008, 1.2, [0, 0.005, 0], 0.002)),
      material: "cv_deck_line",
      mate: A([-2.2 + (p % 4) * 1.4, deckY + 0.01, 0.0 + Math.floor(p / 4) * 12.0]),
    });
    add({
      id: `${P}chock_${pad(p + 1)}_l`,
      name_cn: `轮挡 ${p + 1} 左`,
      name_en: `wheel chock ${p + 1} left`,
      assembly: ASSEMBLY,
      build_layer: 2,
      geometry: M(B(0.25, 0.14, 0.18, [0, 0, 0], 0.006)),
      material: "cv_warning",
      mate: A([-2.2 + (p % 4) * 1.4 - 0.35, deckY + 0.08, 0.0 + Math.floor(p / 4) * 12.0]),
    });
    add({
      id: `${P}chock_${pad(p + 1)}_r`,
      name_cn: `轮挡 ${p + 1} 右`,
      name_en: `wheel chock ${p + 1} right`,
      assembly: ASSEMBLY,
      build_layer: 2,
      geometry: M(B(0.25, 0.14, 0.18, [0, 0, 0], 0.006)),
      material: "cv_warning",
      mate: A([-2.2 + (p % 4) * 1.4 + 0.35, deckY + 0.08, 0.0 + Math.floor(p / 4) * 12.0]),
    });
  }
  add({
    id: `${P}tiedowns`,
    name_cn: "机库系留点 ×40",
    name_en: "hangar tie-downs",
    assembly: ASSEMBLY,
    build_layer: 2,
    geometry: M(T(0.07, 0.04, 0.025, [0, 0, 0], 12)),
    material: "cv_steel",
    mate: A([0, 0, 0]),
    instances: 40,
    indexed: true,
    instance_layout: "carrier.hangar.tiedown",
  });
  ctx.layout("carrier.hangar.tiedown", ({ index }) => {
    const col = index % 8;
    const row = Math.floor(index / 8);
    return new THREE.Matrix4().makeTranslation(-3.0 + col * 0.85, deckY + 0.02, -13 + row * 4.3);
  });
  for (let m = 0; m < 3; m++) {
    add({
      id: `${P}maintenance_bench_${m + 1}`,
      name_cn: `维护工位 ${m + 1} 工作台`,
      name_en: `maintenance bench ${m + 1}`,
      assembly: ASSEMBLY,
      build_layer: 2,
      geometry: M(B(0.9, 0.1, 0.5, [0, 0, 0], 0.006), B(0.08, 0.45, 0.4, [-0.35, -0.27, 0], 0.004), B(0.08, 0.45, 0.4, [0.35, -0.27, 0], 0.004)),
      material: "cv_steel_dark",
      mate: A([-2.9, deckY + 0.5, -10 + m * 2.4]),
    });
    add({
      id: `${P}tool_rack_${m + 1}`,
      name_cn: `工具架 ${m + 1}`,
      name_en: `tool rack ${m + 1}`,
      assembly: ASSEMBLY,
      build_layer: 2,
      geometry: M(B(0.8, 1.0, 0.12, [0, 0, 0], 0.006), B(0.7, 0.04, 0.25, [0, -0.2, 0.16], 0.004)),
      material: "cv_steel",
      mate: A([-3.5, deckY + 0.55, -9.6 + m * 2.4]),
    });
  }
  // 弹药升降机（弹药库 → 机库层），平台带护栏/液压杆。
  const ammoX = -2.2;
  const ammoZ = -5.8;
  ctx.node({ name: AMMO_ELEVATOR_NODE, parent: "root", pivot: [ammoX, deckY - 0.1, ammoZ], motion: "translate", axis: "y", note: "弹药升降机平台" });
  add({
    id: `${P}ammo_platform`,
    name_cn: "弹药升降机平台",
    name_en: "ammo elevator platform",
    assembly: ASSEMBLY,
    build_layer: 2,
    geometry: M(B(1.5, 0.1, 1.8, [0, 0, 0], 0.008), B(0.08, 0.7, 0.08, [-0.7, 0.4, -0.85], 0.004), B(0.08, 0.7, 0.08, [0.7, 0.4, -0.85], 0.004), B(1.4, 0.05, 0.05, [0, 0.7, -0.85], 0.004)),
    material: "cv_deck_plate",
    node: AMMO_ELEVATOR_NODE,
    mate: A([0, 0, 0]),
  });
  add({
    id: `${P}ammo_cart`,
    name_cn: "弹药运输车",
    name_en: "ammo cart",
    assembly: ASSEMBLY,
    build_layer: 2,
    geometry: M(B(0.8, 0.3, 0.5, [0, 0, 0], 0.01), B(0.72, 0.18, 0.42, [0, 0.22, 0], 0.006), C(0.12, 0.06, [0, -0.15, 0.25], 14), C(0.12, 0.06, [0, -0.15, -0.25], 14)),
    material: "cv_warning",
    node: AMMO_ELEVATOR_NODE,
    mate: A([0, 0.25, 0]),
  });
  for (const side of [-1, 1] as const) {
    add({
      id: `${P}ammo_elevator_rail_${side === -1 ? "l" : "r"}`,
      name_cn: `弹药升降机导轨 ${side === -1 ? "左" : "右"}`,
      name_en: `ammo elevator rail ${side === -1 ? "l" : "r"}`,
      assembly: ASSEMBLY,
      build_layer: 2,
      geometry: M(B(0.1, 2.0, 0.12, [0, 0, 0], 0.006)),
      material: "cv_steel_dark",
      mate: A([ammoX + side * 0.82, CV.HANGAR_Y - 0.8, ammoZ]),
    });
    add({
      id: `${P}ammo_elevator_cylinder_${side === -1 ? "l" : "r"}`,
      name_cn: `弹药升降机液压缸 ${side === -1 ? "左" : "右"}`,
      name_en: `ammo elevator cylinder ${side === -1 ? "l" : "r"}`,
      assembly: ASSEMBLY,
      build_layer: 2,
      geometry: M(C(0.12, 1.4, [0, 0, 0], 16), C(0.05, 0.9, [0, 0.65, 0], 12)),
      material: "cv_steel",
      mate: A([ammoX + side * 0.95, CV.LOWER_DECK_Y + 0.9, ammoZ - 1.05]),
    });
  }
  // 弹药库：弹架/导弹/炸弹/升降机口。
  for (let r = 0; r < 4; r++) {
    add({
      id: `${P}magazine_rack_${r + 1}`,
      name_cn: `弹药库弹架 ${r + 1}`,
      name_en: `magazine rack ${r + 1}`,
      assembly: ASSEMBLY,
      build_layer: 2,
      geometry: M(B(2.4, 0.08, 0.7, [0, 0, 0], 0.006), B(2.3, 0.7, 0.06, [0, 0.35, -0.32], 0.006), B(2.3, 0.06, 0.7, [0, 0.7, 0], 0.006)),
      material: "cv_steel_dark",
      mate: A([0, CV.LOWER_DECK_Y + 0.4, -4.5 + r * 1.0]),
    });
    add({
      id: `${P}magazine_round_${pad(r + 1)}`,
      name_cn: `弹药 ${r + 1}`,
      name_en: `magazine round ${r + 1}`,
      assembly: ASSEMBLY,
      build_layer: 2,
      geometry: M(C(0.06, 0.5, [0, 0, 0], 12), C(0.02, 0.16, [0, 0.32, 0], 10)),
      material: "cv_steel",
      mate: A([0, CV.LOWER_DECK_Y + 0.55, -4.5 + r * 1.0], [90, 0, 0]),
      instances: 8,
      indexed: true,
      instance_layout: `carrier.hangar.magazine${r + 1}`,
    });
    ctx.layout(`carrier.hangar.magazine${r + 1}`, ({ index }) => new THREE.Matrix4().makeTranslation((index - 3.5) * 0.28, 0, 0));
  }
  // 弹药库纵深弹架：3 列 ×12 发，填满当前第一人称视线内的空舱。
  for (let r = 0; r < 3; r++) {
    const rz = -5.6 - r * 1.05;
    add({
      id: `${P}magazine_rack_ext_${r + 1}`,
      name_cn: `弹药库纵深弹架 ${r + 1}`,
      name_en: `magazine deep rack ${r + 1}`,
      assembly: ASSEMBLY,
      build_layer: 2,
      geometry: M(B(2.4, 0.08, 0.7, [0, 0, 0], 0.006), B(2.3, 0.7, 0.06, [0, 0.35, -0.32], 0.006), B(2.3, 0.06, 0.7, [0, 0.7, 0], 0.006)),
      material: "cv_steel_dark",
      mate: A([0, CV.LOWER_DECK_Y + 0.4, rz]),
    });
    add({
      id: `${P}magazine_round_ext_${r + 1}`,
      name_cn: `纵深弹药 ${r + 1} ×12`,
      name_en: `deep magazine rounds ${r + 1}`,
      assembly: ASSEMBLY,
      build_layer: 2,
      geometry: M(C(0.06, 0.5, [0, 0, 0], 12), C(0.02, 0.16, [0, 0.32, 0], 10)),
      material: "cv_steel",
      mate: A([0, CV.LOWER_DECK_Y + 0.55, rz], [90, 0, 0]),
      instances: 12,
      indexed: true,
      instance_layout: `carrier.hangar.magazineExt${r + 1}`,
    });
    ctx.layout(`carrier.hangar.magazineExt${r + 1}`, ({ index }) => new THREE.Matrix4().makeTranslation((index - 5.5) * 0.19, 0, 0));
  }
  // 舷侧导弹发射筒 + 弹药箱 + 装填托架。
  for (const side of [-1, 1] as const) {
    const tag = side === -1 ? "p" : "s";
    for (let c = 0; c < 4; c++) {
      add({
        id: `${P}magazine_canister_${tag}_${c + 1}`,
        name_cn: `舷侧导弹发射筒 ${tag.toUpperCase()}-${c + 1}`,
        name_en: `magazine missile canister ${tag} ${c + 1}`,
        assembly: ASSEMBLY,
        build_layer: 2,
        geometry: M(B(0.16, 0.1, 0.16, [0, 0, 0], 0.004), C(0.085, 1.0, [0, 0.55, 0], 14), T(0.1, 0.08, 0.05, [0, 1.08, 0], 14)),
        material: "cv_steel_dark",
        mate: A([side * 2.75, CV.LOWER_DECK_Y + 0.05, -1.8 - c * 0.9]),
      });
    }
    for (let b = 0; b < 3; b++) {
      add({
        id: `${P}magazine_crate_${tag}_${b + 1}`,
        name_cn: `弹药箱 ${tag.toUpperCase()}-${b + 1}`,
        name_en: `ammo crate ${tag} ${b + 1}`,
        assembly: ASSEMBLY,
        build_layer: 2,
        geometry: M(B(0.62, 0.32, 0.42, [0, 0, 0], 0.008), B(0.56, 0.02, 0.36, [0, 0.17, 0], 0.002)),
        material: "cv_warning",
        mate: A([side * 2.15, CV.LOWER_DECK_Y + 0.16 + Math.floor(b / 2) * 0.33, -1.35 - (b % 2) * 0.5]),
      });
    }
    add({
      id: `${P}magazine_loading_cradle_${tag}`,
      name_cn: `装填托架 ${tag.toUpperCase()}`,
      name_en: `loading cradle ${tag}`,
      assembly: ASSEMBLY,
      build_layer: 2,
      geometry: M(B(0.85, 0.08, 0.32, [0, 0, 0], 0.005), B(0.06, 0.35, 0.28, [-0.32, -0.2, 0], 0.004), B(0.06, 0.35, 0.28, [0.32, -0.2, 0], 0.004), C(0.05, 0.2, [0, 0.14, 0], 10)),
      material: "cv_steel",
      mate: A([side * 1.55, CV.LOWER_DECK_Y + 0.27, -7.8]),
    });
  }

  // 机库停放的第二架舰载机（折叠翼，简化但完整的外形）。
  add({
    id: `${P}spare_aircraft_body`,
    name_cn: "机库停放舰载机（折叠翼）",
    name_en: "hangar aircraft folded",
    assembly: ASSEMBLY,
    build_layer: 5,
    geometry: M({ type: "latheZ", profile: [[0.06, -1.0], [0.14, -0.82], [0.16, -0.25], [0.17, 0.35], [0.13, 0.78], [0.04, 1.0]], segments: 28 }),
    material: "cv_aircraft",
    mate: A([-1.1, deckY + 0.28, 9.0]),
  });
  add({
    id: `${P}spare_aircraft_nose`,
    name_cn: "机库舰载机雷达罩",
    name_en: "hangar aircraft radome",
    assembly: ASSEMBLY,
    build_layer: 5,
    geometry: M({ type: "latheZ", profile: [[0.12, -0.24], [0.115, -0.08], [0.07, 0.12], [0.004, 0.26]], segments: 24 }),
    material: "cv_aircraft_belly",
    mate: A([-1.1, deckY + 0.28, 9.98]),
  });
  add({
    id: `${P}spare_aircraft_canopy`,
    name_cn: "机库舰载机座舱盖",
    name_en: "hangar aircraft canopy",
    assembly: ASSEMBLY,
    build_layer: 5,
    geometry: M({ type: "latheZ", profile: [[0.01, -0.14], [0.06, -0.08], [0.09, 0], [0.07, 0.08], [0.01, 0.13]], segments: 22 }),
    material: "cv_canopy",
    mate: A([-1.1, deckY + 0.48, 9.3]),
  });
  add({
    id: `${P}spare_aircraft_tail`,
    name_cn: "机库舰载机尾锥",
    name_en: "hangar aircraft tail cone",
    assembly: ASSEMBLY,
    build_layer: 5,
    geometry: M({ type: "latheZ", profile: [[0.06, -0.22], [0.055, -0.08], [0.03, 0.1], [0.004, 0.2]], segments: 20 }),
    material: "cv_aircraft",
    mate: A([-1.1, deckY + 0.28, 8.02]),
  });
  add({
    id: `${P}spare_aircraft_fin`,
    name_cn: "机库舰载机垂尾",
    name_en: "hangar aircraft vertical fin",
    assembly: ASSEMBLY,
    build_layer: 5,
    geometry: { type: "kit", kit: "carrierWing", params: { span: 0.5, rootChord: 0.42, tipChord: 0.2, sweep: 0.16, thickness: 0.045, dihedralDeg: 0, sections: 7 } },
    material: "cv_aircraft_dark",
    mate: A([-1.1, deckY + 0.47, 8.16], [0, 0, 90]),
  });
  add({
    id: `${P}spare_aircraft_stabs`,
    name_cn: "机库舰载机平尾",
    name_en: "hangar aircraft stabilizers",
    assembly: ASSEMBLY,
    build_layer: 5,
    geometry: { type: "kit", kit: "carrierWing", params: { span: 0.72, rootChord: 0.24, tipChord: 0.14, sweep: 0.08, thickness: 0.035, dihedralDeg: 0, sections: 6 }, mirror: "x" },
    material: "cv_aircraft_dark",
    mate: A([-1.1, deckY + 0.3, 8.3]),
  });
  add({
    id: `${P}spare_aircraft_wing_folded_l`,
    name_cn: "机库舰载机折叠外翼 左",
    name_en: "hangar aircraft folded wing left",
    assembly: ASSEMBLY,
    build_layer: 5,
    geometry: { type: "kit", kit: "carrierWing", params: { span: 0.9, rootChord: 0.5, tipChord: 0.24, sweep: 0.04, thickness: 0.09, dihedralDeg: 0, sections: 8 }, mirror: "x" },
    material: "cv_aircraft_dark",
    mate: A([-1.2, deckY + 0.72, 8.8], [0, 0, -90]),
  });
  add({
    id: `${P}spare_aircraft_wing_folded_r`,
    name_cn: "机库舰载机折叠外翼 右",
    name_en: "hangar aircraft folded wing right",
    assembly: ASSEMBLY,
    build_layer: 5,
    geometry: { type: "kit", kit: "carrierWing", params: { span: 0.9, rootChord: 0.5, tipChord: 0.24, sweep: 0.04, thickness: 0.09, dihedralDeg: 0, sections: 8 } },
    material: "cv_aircraft_dark",
    mate: A([-1.0, deckY + 0.72, 8.8], [0, 0, 90]),
  });
  add({
    id: `${P}spare_aircraft_gear`,
    name_cn: "机库舰载机起落架",
    name_en: "hangar aircraft landing gear",
    assembly: ASSEMBLY,
    build_layer: 5,
    geometry: M(C(0.04, 0.26, [0, 0, 0], 10), C(0.12, 0.06, [0, -0.16, 0], 12)),
    material: "cv_steel",
    mate: A([-1.1, deckY + 0.14, 9.0]),
    instances: 3,
    indexed: true,
    instance_layout: "carrier.hangar.spareGear",
  });
  ctx.layout("carrier.hangar.spareGear", ({ index }) => new THREE.Matrix4().makeTranslation(index === 0 ? 0 : index === 1 ? -0.35 : 0.35, 0, index === 0 ? 0.8 : -0.25));
  // 消防/损管站。
  add({
    id: `${P}fire_station`,
    name_cn: "机库损管站",
    name_en: "hangar damage control station",
    assembly: ASSEMBLY,
    build_layer: 2,
    geometry: M(B(1.0, 1.3, 0.4, [0, 0, 0], 0.01), B(0.8, 0.4, 0.06, [0, 0.1, 0.23], 0.006)),
    material: "cv_hull_dark",
    mate: A([-3.4, deckY + 0.7, -13.6]),
  });
  add({
    id: `${P}foam_nozzles`,
    name_cn: "机库泡沫喷淋头 ×12",
    name_en: "hangar foam nozzles",
    assembly: ASSEMBLY,
    build_layer: 2,
    geometry: M(C(0.05, 0.08, [0, 0, 0], 10), C(0.09, 0.03, [0, -0.05, 0], 12)),
    material: "cv_copper",
    mate: A([0, 0, 0]),
    instances: 12,
    indexed: true,
    instance_layout: "carrier.hangar.foam",
  });
  ctx.layout("carrier.hangar.foam", ({ index }) => new THREE.Matrix4().makeTranslation(-3.0 + (index % 6) * 1.2, CV.HANGAR_Y + 1.75, -12 + Math.floor(index / 6) * 8));

  // 机库第一人称监控位：立柱 + 相机，固定在机库中线，正对停放机。
  add({
    id: `${P}hangar_view_pole`,
    name_cn: "机库监控立柱",
    name_en: "hangar camera pole",
    assembly: ASSEMBLY,
    build_layer: 2,
    geometry: M(B(0.22, 0.03, 0.22, [0, 0, 0], 0.006), C(0.026, 0.55, [0, 0.28, 0], 10)),
    material: "cv_steel",
    mate: A([0, CV.HANGAR_Y + 0.15, -1.0]),
  });
  add({
    id: `${P}hangar_view_camera`,
    name_cn: "机库监控相机",
    name_en: "hangar camera",
    assembly: ASSEMBLY,
    build_layer: 2,
    geometry: M(B(0.14, 0.1, 0.18, [0, 0, 0], 0.006), B(0.03, 0.03, 0.12, [0, -0.09, 0.1], 0.002)),
    material: "cv_steel_dark",
    mate: A([0, CV.HANGAR_Y + 0.55, -1.0]),
  });
}
