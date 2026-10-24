import * as THREE from "three";
import { CV } from "./constants";
import { A, B, C, M, T, pad, type CarrierCtx } from "./common";
import { hullSurfaceHalfAt } from "./kits";

// ============================================================================
// L2 机库 / 弹药库 / 弹药升降机 / 防火分段门 / 维护区
// ============================================================================

const ASSEMBLY = "hangar";
const P = "carrier.hangar.";
export const AMMO_ELEVATOR_NODE = "CV_AmmoElevator";
export const HANGAR_DOOR_NODES = [1, 2, 3, 4, 5].map((i) => `CV_HangarDoor_${i}`);
// 第一人称漫游新增的两道可开合水密门：机库艉部→机舱、机库艏部→生活区梯口。
export const HANGAR_ENGINE_DOOR_NODE = "CV_WalkEngineDoor";
export const HANGAR_CREW_DOOR_NODE = "CV_WalkCrewDoor";
export const HANGAR_ENGINE_DOOR_POS: [number, number] = [0.55, -16.1];
export const HANGAR_CREW_DOOR_POS: [number, number] = [0.35, 12.35];

export function addHangar(ctx: CarrierCtx): void {
  const add = (part: Parameters<CarrierCtx["add"]>[0]) => ctx.add(part);
  const deckY = CV.HANGAR_Y + 0.14;

  // 防火分段门：每道双扇，绕两侧铰链开合。
  const DOOR_Z = [-2.5, 0.5, 4.5, 7.5, 10.5];
  HANGAR_DOOR_NODES.forEach((node, index) => {
    const z = DOOR_Z[index]!;
    // 机库宽度随船壳收窄：门框/门扇按该 z 的船壳半宽收，不能固定 5.3 宽戳出舷外。
    const half = Math.max(1.45, Math.min(2.6, hullSurfaceHalfAt(z, deckY + 0.45) - 0.12));
    const leafW = half - 0.03;
    ctx.node({ name: node, parent: "root", pivot: [-half, deckY, z], motion: "rotate", axis: "y", note: `机库防火门 ${index + 1} 左扇（折叠收拢）` });
    ctx.node({ name: `${node}_R`, parent: "root", pivot: [half, deckY, z], motion: "rotate", axis: "y", note: `机库防火门 ${index + 1} 右扇（折叠收拢）` });
    add({
      id: `${P}fire_door_${pad(index + 1)}_frame`,
      name_cn: `机库防火门 ${index + 1} 门框`,
      name_en: `hangar fire door frame ${index + 1}`,
      assembly: ASSEMBLY,
      build_layer: 2,
      geometry: M(B(half * 2, 0.08, 0.18, [0, 0.96, 0], 0.008), B(half * 2, 0.08, 0.18, [0, -0.04, 0], 0.008), B(0.12, 1.05, 0.18, [-half, 0.46, 0], 0.006), B(0.12, 1.05, 0.18, [half, 0.46, 0], 0.006)),
      material: "cv_steel_dark",
      mate: A([0, deckY, z]),
    });
    add({
      id: `${P}fire_door_${pad(index + 1)}_leaf_l`,
      name_cn: `机库防火门 ${index + 1} 左扇`,
      name_en: `hangar fire door ${index + 1} left leaf`,
      assembly: ASSEMBLY,
      build_layer: 2,
      geometry: M(B(leafW, 0.9, 0.07, [leafW / 2, 0.5, 0], 0.008), B(leafW * 0.9, 0.08, 0.03, [leafW / 2, 0.26, 0.045], 0.003)),
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
      geometry: M(B(leafW, 0.9, 0.07, [leafW / 2, 0.5, 0], 0.008)),
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
      mate: A([Math.min(0.5, leafW * 0.35), 0.6, -0.1], [0, 0, 20]),
    });
  });

  // 停机位/系留点/轮挡/维护工位。
  for (let p = 0; p < 4; p++) {
    add({
      id: `${P}parking_${pad(p + 1)}`,
      name_cn: `机库停机位 ${p + 1}`,
      name_en: `hangar parking spot ${p + 1}`,
      assembly: ASSEMBLY,
      build_layer: 2,
      geometry: M(B(1.5, 0.006, 1.6, [0, 0, 0], 0.002), B(0.06, 0.008, 1.2, [0, 0.005, 0], 0.002)),
      material: "cv_deck_line",
      mate: A([-1.3 + (p % 4) * 0.86, deckY + 0.01, 0.0 + Math.floor(p / 4) * 9.0]),
    });
    add({
      id: `${P}chock_${pad(p + 1)}_l`,
      name_cn: `轮挡 ${p + 1} 左`,
      name_en: `wheel chock ${p + 1} left`,
      assembly: ASSEMBLY,
      build_layer: 2,
      geometry: M(B(0.25, 0.14, 0.18, [0, 0, 0], 0.006)),
      material: "cv_warning",
      mate: A([-1.3 + (p % 4) * 0.86 - 0.3, deckY + 0.08, 0.0 + Math.floor(p / 4) * 9.0]),
    });
    add({
      id: `${P}chock_${pad(p + 1)}_r`,
      name_cn: `轮挡 ${p + 1} 右`,
      name_en: `wheel chock ${p + 1} right`,
      assembly: ASSEMBLY,
      build_layer: 2,
      geometry: M(B(0.25, 0.14, 0.18, [0, 0, 0], 0.006)),
      material: "cv_warning",
      mate: A([-1.3 + (p % 4) * 0.86 + 0.3, deckY + 0.08, 0.0 + Math.floor(p / 4) * 9.0]),
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
    return new THREE.Matrix4().makeTranslation(-2.4 + col * 0.686, deckY + 0.02, -13 + row * 4.3);
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
      mate: A([-2.1, deckY + 0.5, -10 + m * 2.4]),
    });
    add({
      id: `${P}tool_rack_${m + 1}`,
      name_cn: `工具架 ${m + 1}`,
      name_en: `tool rack ${m + 1}`,
      assembly: ASSEMBLY,
      build_layer: 2,
      geometry: M(B(0.8, 1.0, 0.12, [0, 0, 0], 0.006), B(0.7, 0.04, 0.25, [0, -0.2, 0.16], 0.004)),
      material: "cv_steel",
      mate: A([-2.2, deckY + 0.55, -9.6 + m * 2.4]),
    });
  }
  // 机库维修/机加工区：备用涡扇、车床、钻床、工具柜、龙门吊、状态屏。
  // 全部按真实人体尺度布置（米 ÷ 7.9），否则工具柜会放大成 7 米高的黄块。
  {
    const u = 1 / 7.9;
    const rx = -2.12;
    const rz = -8.3;
    add({
      id: `${P}workshop_bench`,
      name_cn: "机库维修工作台",
      name_en: "hangar repair bench",
      assembly: ASSEMBLY,
      build_layer: 2,
      geometry: M(
        B(0.72 * u, 0.06 * u, 2.4 * u, [0, 0.9 * u, 0], 0.0008),
        B(0.06 * u, 0.88 * u, 0.06 * u, [-0.3 * u, 0.44 * u, -1.12 * u], 0.0006),
        B(0.06 * u, 0.88 * u, 0.06 * u, [0.3 * u, 0.44 * u, -1.12 * u], 0.0006),
        B(0.06 * u, 0.88 * u, 0.06 * u, [-0.3 * u, 0.44 * u, 1.12 * u], 0.0006),
        B(0.06 * u, 0.88 * u, 0.06 * u, [0.3 * u, 0.44 * u, 1.12 * u], 0.0006),
        B(0.05 * u, 0.62 * u, 2.3 * u, [-0.34 * u, 1.24 * u, 0], 0.0006),
        C(0.07 * u, 0.16 * u, [0.14 * u, 0.99 * u, 0.7 * u], 10),
        B(0.32 * u, 0.02 * u, 0.5 * u, [0.08 * u, 0.94 * u, -0.35 * u], 0.0004),
        B(0.14 * u, 0.09 * u, 0.2 * u, [-0.06 * u, 0.98 * u, -0.62 * u], 0.0006),
      ),
      material: "cv_steel_dark",
      mate: A([rx, deckY, rz]),
    });
    add({
      id: `${P}workshop_tools`,
      name_cn: "机库工具柜/零件箱",
      name_en: "hangar tool chests",
      assembly: ASSEMBLY,
      build_layer: 2,
      geometry: M(
        B(0.52 * u, 0.94 * u, 0.9 * u, [0, 0.48 * u, 0], 0.001),
        ...Array.from({ length: 5 }, (_, d) => B(0.03 * u, 0.03 * u, 0.8 * u, [0.27 * u, 0.18 * u + d * 0.15 * u, 0], 0.0004)),
        B(0.62 * u, 0.04 * u, 0.98 * u, [0, 0.97 * u, 0], 0.001),
        B(0.04 * u, 0.04 * u, 0.1 * u, [0.28 * u, 0.55 * u, 0.3 * u], 0.0004),
      ),
      material: "cv_warning",
      mate: A([rx + 0.1 * u, deckY, rz + 2.2 * u]),
    });
    // 备用涡扇发动机：短舱/风扇/尾喷/托架
    add({
      id: `${P}workshop_spare_engine`,
      name_cn: "备用涡扇发动机",
      name_en: "spare turbofan engine",
      assembly: ASSEMBLY,
      build_layer: 2,
      geometry: M(
        { type: "latheZ", profile: [[0.02 * u, -1.8 * u], [0.3 * u, -1.66 * u], [0.46 * u, -1.36 * u], [0.5 * u, -0.5 * u], [0.5 * u, 0.55 * u], [0.46 * u, 1.2 * u], [0.34 * u, 1.5 * u], [0.02 * u, 1.62 * u]], segments: 24 },
        ...Array.from({ length: 8 }, (_, i) => {
          const a = (i / 8) * Math.PI * 2;
          return { type: "weld" as const, from: [0, 0, -1.62 * u] as [number, number, number], to: [Math.cos(a) * 0.42 * u, Math.sin(a) * 0.42 * u, -1.62 * u] as [number, number, number], radius: 0.012 * u };
        }),
        C(0.1 * u, 0.16 * u, [0, 0, -1.58 * u], 12),
        B(0.9 * u, 0.05 * u, 0.08 * u, [0, 0.56 * u, 0.4 * u], 0.0008),
      ),
      material: "cv_steel_dark",
      mate: A([rx + 0.62 * u, deckY + 0.68 * u, rz + 8.0 * u]),
    });
    add({
      id: `${P}workshop_spare_stand`,
      name_cn: "备用发动机托架",
      name_en: "spare engine stand",
      assembly: ASSEMBLY,
      build_layer: 2,
      geometry: M(
        B(0.6 * u, 0.07 * u, 1.5 * u, [0, 0.035 * u, 0], 0.001),
        B(0.06 * u, 0.16 * u, 0.06 * u, [-0.25 * u, 0.1 * u, -0.55 * u], 0.0006),
        B(0.06 * u, 0.16 * u, 0.06 * u, [0.25 * u, 0.1 * u, -0.55 * u], 0.0006),
        B(0.06 * u, 0.16 * u, 0.06 * u, [-0.25 * u, 0.1 * u, 0.55 * u], 0.0006),
        B(0.06 * u, 0.16 * u, 0.06 * u, [0.25 * u, 0.1 * u, 0.55 * u], 0.0006),
        B(0.52 * u, 0.06 * u, 0.8 * u, [0, 0.2 * u, 0], 0.001),
        C(0.1 * u, 0.05 * u, [-0.22 * u, 0.02 * u, -0.6 * u], 10),
        C(0.1 * u, 0.05 * u, [0.22 * u, 0.02 * u, -0.6 * u], 10),
        C(0.1 * u, 0.05 * u, [-0.22 * u, 0.02 * u, 0.6 * u], 10),
        C(0.1 * u, 0.05 * u, [0.22 * u, 0.02 * u, 0.6 * u], 10),
      ),
      material: "cv_steel",
      mate: A([rx + 0.62 * u, deckY, rz + 8.0 * u]),
    });
    add({
      id: `${P}workshop_machines`,
      name_cn: "机库维修车床",
      name_en: "hangar lathe",
      assembly: ASSEMBLY,
      build_layer: 2,
      geometry: M(
        B(0.62 * u, 0.16 * u, 1.8 * u, [0, 0.72 * u, 0], 0.001),
        B(0.5 * u, 0.7 * u, 0.5 * u, [0, 0.35 * u, -0.5 * u], 0.001),
        C(0.16 * u, 0.36 * u, [0, 0.94 * u, -0.56 * u], 14),
        { type: "weld", from: [0, 0.94 * u, -0.5 * u], to: [0, 0.94 * u, 0.55 * u], radius: 0.05 * u },
        B(0.16 * u, 0.34 * u, 0.16 * u, [0, 0.82 * u, 0.62 * u], 0.0008),
        B(0.7 * u, 0.05 * u, 0.4 * u, [0, 0.18 * u, -0.7 * u], 0.001),
        C(0.06 * u, 0.08 * u, [0.28 * u, 1.06 * u, -0.5 * u], 10),
      ),
      material: "cv_steel_dark",
      mate: A([rx + 0.12 * u, deckY, rz - 2.3 * u]),
    });
    add({
      id: `${P}workshop_drill`,
      name_cn: "机库台钻",
      name_en: "hangar drill press",
      assembly: ASSEMBLY,
      build_layer: 2,
      geometry: M(
        B(0.3 * u, 0.06 * u, 0.3 * u, [0, 0.03 * u, 0], 0.001),
        C(0.04 * u, 1.0 * u, [0, 0.53 * u, 0], 10),
        B(0.12 * u, 0.18 * u, 0.3 * u, [0, 1.05 * u, 0], 0.0008),
        C(0.02 * u, 0.4 * u, [0, 0.85 * u, 0], 8),
        B(0.2 * u, 0.02 * u, 0.24 * u, [0, 0.68 * u, 0], 0.0006),
      ),
      material: "cv_steel",
      mate: A([rx + 0.1 * u, deckY, rz - 3.55 * u]),
    });
    // 龙门吊：跨在备用发动机上方，链条/吊钩垂下。
    add({
      id: `${P}workshop_hoist`,
      name_cn: "机库维修龙门吊",
      name_en: "hangar gantry hoist",
      assembly: ASSEMBLY,
      build_layer: 2,
      geometry: M(
        B(0.1 * u, 0.1 * u, 0.1 * u, [0, 0.05 * u, -1.7 * u], 0.0006),
        B(0.1 * u, 0.1 * u, 0.1 * u, [0, 0.05 * u, 1.7 * u], 0.0006),
        B(0.06 * u, 3.0 * u, 0.06 * u, [0, 1.5 * u, -1.7 * u], 0.0006),
        B(0.06 * u, 3.0 * u, 0.06 * u, [0, 1.5 * u, 1.7 * u], 0.0006),
        B(0.1 * u, 0.08 * u, 3.5 * u, [0, 3.0 * u, 0], 0.0008),
        C(0.08 * u, 0.12 * u, [0, 2.92 * u, 0.6 * u], 10),
        { type: "weld", from: [0, 2.86 * u, 0.6 * u], to: [0, 1.7 * u, 0.6 * u], radius: 0.008 * u },
        { type: "torus", radius: 0.12 * u, tube: 0.015 * u, radialSegments: 8, tubularSegments: 16, at: [0, 1.58 * u, 0.6 * u] },
      ),
      material: "cv_steel",
      mate: A([rx + 0.62 * u, deckY, rz + 8.0 * u]),
    });
    add({
      id: `${P}workshop_screen`,
      name_cn: "机库维修状态屏",
      name_en: "hangar maintenance status screen",
      assembly: ASSEMBLY,
      build_layer: 2,
      geometry: M(B(0.03 * u, 0.55 * u, 0.95 * u, [0, 0, 0], 0.0006), B(0.012 * u, 0.46 * u, 0.84 * u, [0.02 * u, 0, 0], 0.0002)),
      material: "cv_055_console",
      mate: A([rx - 0.325 * u, deckY + 1.27 * u, rz - 0.15 * u]),
    });
    add({
      id: `${P}workshop_eye_post`,
      name_cn: "机库维修视点立柱",
      name_en: "hangar workshop view mast",
      assembly: ASSEMBLY,
      build_layer: 2,
      geometry: M(B(0.025 * u, 1.72 * u, 0.025 * u, [0, 0.86 * u, 0], 0.0006), B(0.16 * u, 0.02 * u, 0.16 * u, [0, 0.01 * u, 0], 0.0006), B(0.03 * u, 0.03 * u, 0.03 * u, [0, 1.7 * u, 0], 0.0004)),
      material: "cv_steel_dark",
      mate: A([rx + 1.45 * u, deckY, rz - 6.5 * u]),
    });
    add({
      id: `${P}workshop_eye`,
      name_cn: "机库维修视点",
      name_en: "hangar workshop view eye",
      assembly: ASSEMBLY,
      build_layer: 2,
      geometry: M(B(0.004, 0.004, 0.004, [0, 0, 0], 0.001)),
      material: "cv_steel_dark",
      mate: A([rx + 1.45 * u, deckY + 1.72 * u, rz - 6.5 * u]),
    });
    add({
      id: `${P}workshop_target`,
      name_cn: "机库维修目标",
      name_en: "hangar workshop view target",
      assembly: ASSEMBLY,
      build_layer: 2,
      geometry: M(B(0.004, 0.004, 0.004, [0, 0, 0], 0.001)),
      material: "cv_steel_dark",
      mate: A([rx + 0.62 * u, deckY + 0.68 * u, rz + 8.0 * u]),
    });
  }

  // 弹药升降机（弹药库 → 机库层），平台带护栏/液压杆。
  const ammoX = -1.0;
  const ammoZ = -5.0;
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
  // 弹药库地坪：原下层甲板是镜面金属，近景会反光成水面；铺一层防滑甲板并
  // 画出左舷巡检通道，弹架也落到地坪上，不再悬空 0.28 编辑单位。
  add({
    id: `${P}magazine_deck`,
    name_cn: "弹药库防滑地坪",
    name_en: "magazine non-slip deck",
    assembly: ASSEMBLY,
    build_layer: 2,
    geometry: M(B(5.6, 0.012, 6.8, [0, 0, 0], 0.004)),
    material: "cv_hull_dark",
    mate: A([0, CV.LOWER_DECK_Y + 0.086, -4.4]),
  });
  add({
    id: `${P}magazine_aisle_line`,
    name_cn: "弹药库左舷巡检通道",
    name_en: "magazine port inspection aisle",
    assembly: ASSEMBLY,
    build_layer: 2,
    geometry: M(B(0.5, 0.006, 6.5, [0, 0, 0], 0.001)),
    material: "cv_deck_yellow",
    mate: A([-1.6, CV.LOWER_DECK_Y + 0.095, -4.4]),
  });
  add({
    id: `${P}magazine_aisle_edge_l`,
    name_cn: "弹药库巡检通道边线 左",
    name_en: "magazine aisle edge left",
    assembly: ASSEMBLY,
    build_layer: 2,
    geometry: M(B(0.03, 0.002, 6.5, [0, 0, 0], 0.001)),
    material: "cv_deck_line",
    mate: A([-1.86, CV.LOWER_DECK_Y + 0.096, -4.4]),
  });
  add({
    id: `${P}magazine_aisle_edge_r`,
    name_cn: "弹药库巡检通道边线 右",
    name_en: "magazine aisle edge right",
    assembly: ASSEMBLY,
    build_layer: 2,
    geometry: M(B(0.03, 0.002, 6.5, [0, 0, 0], 0.001)),
    material: "cv_deck_line",
    mate: A([-1.34, CV.LOWER_DECK_Y + 0.096, -4.4]),
  });
  for (let r = 0; r < 4; r++) {
    add({
      id: `${P}magazine_rack_${r + 1}`,
      name_cn: `弹药库弹架 ${r + 1}`,
      name_en: `magazine rack ${r + 1}`,
      assembly: ASSEMBLY,
      build_layer: 2,
      geometry: M(B(2.4, 0.08, 0.7, [0, 0, 0], 0.006), B(2.3, 0.7, 0.06, [0, 0.35, -0.32], 0.006), B(2.3, 0.06, 0.7, [0, 0.7, 0], 0.006)),
      material: "cv_steel_dark",
      mate: A([0, CV.LOWER_DECK_Y + 0.12, -4.5 + r * 1.0]),
    });
    add({
      id: `${P}magazine_round_${pad(r + 1)}`,
      name_cn: `弹药 ${r + 1}`,
      name_en: `magazine round ${r + 1}`,
      assembly: ASSEMBLY,
      build_layer: 2,
      geometry: M(C(0.06, 0.5, [0, 0, 0], 12), C(0.02, 0.16, [0, 0.32, 0], 10)),
      material: "cv_steel",
      mate: A([0, CV.LOWER_DECK_Y + 0.22, -4.5 + r * 1.0], [90, 0, 0]),
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
      mate: A([1.2, CV.LOWER_DECK_Y + 0.12, rz]),
    });
    add({
      id: `${P}magazine_round_ext_${r + 1}`,
      name_cn: `纵深弹药 ${r + 1} ×12`,
      name_en: `deep magazine rounds ${r + 1}`,
      assembly: ASSEMBLY,
      build_layer: 2,
      geometry: M(C(0.06, 0.5, [0, 0, 0], 12), C(0.02, 0.16, [0, 0.32, 0], 10)),
      material: "cv_steel",
      mate: A([1.2, CV.LOWER_DECK_Y + 0.22, rz], [90, 0, 0]),
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

  // 机库燃油泵/过滤分离器/控制站（与甲板加油站的管路对应）。
  add({
    id: `${P}fuel_pump_skid`,
    name_cn: "航空燃油泵/过滤分离器组",
    name_en: "aviation fuel pump and filter skid",
    assembly: ASSEMBLY,
    build_layer: 2,
    geometry: M(
      B(1.2, 0.12, 0.8, [0, 0.08, 0], 0.01),
      C(0.16, 0.45, [-0.35, 0.35, 0], 18),
      C(0.14, 0.4, [0.35, 0.33, 0], 18),
      T(0.24, 0.18, 0.32, [-0.35, 0.58, 0], 18),
      B(0.35, 0.2, 0.3, [0, 0.3, 0.05], 0.008),
      B(0.26, 0.14, 0.02, [0, 0.32, 0.21], 0.004),
      C(0.05, 0.16, [0.55, 0.2, 0.2], 12),
      { type: "weld", from: [-0.35, 0.5, 0], to: [-0.35, 0.8, 0], radius: 0.06 },
      { type: "weld", from: [0.35, 0.5, 0], to: [0.35, 0.8, 0], radius: 0.06 },
    ),
    material: "cv_steel_dark",
    mate: A([2.35, deckY, -10.9]),
  });
  add({
    id: `${P}fuel_pump_pipes`,
    name_cn: "燃油泵组管路/阀门",
    name_en: "fuel pump piping and valves",
    assembly: ASSEMBLY,
    build_layer: 2,
    geometry: M(
      { type: "weld", from: [-0.35, 0.8, 0], to: [0.2, 1.1, -0.2], radius: 0.05 },
      { type: "weld", from: [0.2, 1.1, -0.2], to: [0.2, 1.5, 0.6], radius: 0.05 },
      T(0.1, 0.07, 0.08, [0.2, 1.1, -0.2], 16),
      T(0.1, 0.07, 0.08, [0.2, 1.45, 0.6], 16),
      C(0.04, 0.16, [0.3, 1.1, 0.15], 10),
    ),
    material: "cv_copper",
    mate: A([2.35, deckY, -10.9]),
  });
  add({
    id: `${P}fuel_control`,
    name_cn: "燃油控制/计量站",
    name_en: "fuel control and metering station",
    assembly: ASSEMBLY,
    build_layer: 2,
    geometry: M(
      B(0.85, 1.1, 0.35, [0, 0.55, 0], 0.01),
      B(0.65, 0.4, 0.04, [0, 0.72, 0.19], 0.006),
      B(0.5, 0.24, 0.02, [0, 0.72, 0.22], 0.003),
      C(0.05, 0.08, [-0.25, 0.35, 0.2], 10),
      C(0.05, 0.08, [0, 0.35, 0.2], 10),
      C(0.05, 0.08, [0.25, 0.35, 0.2], 10),
    ),
    material: "cv_hull_dark",
    mate: A([3.35, deckY, -12.1]),
  });
  for (let s = 0; s < 3; s++) {
    add({
      id: `${P}fuel_control_screen_${s + 1}`,
      name_cn: `燃油计量屏 ${s + 1}`,
      name_en: `fuel metering screen ${s + 1}`,
      assembly: ASSEMBLY,
      build_layer: 2,
      geometry: M(B(0.12, 0.14, 0.008, [0, 0, 0], 0.002)),
      material: "cv_scr_engine",
      mate: A([3.35 - 0.25 + s * 0.25, deckY + 0.72, -11.9]),
    });
  }

  // 机库弹药组装台：炸弹/导弹半组装 + 工具/手册。
  add({
    id: `${P}ordnance_bench`,
    name_cn: "航空弹药组装台",
    name_en: "aviation ordnance assembly bench",
    assembly: ASSEMBLY,
    build_layer: 2,
    geometry: M(
      B(1.1, 0.08, 0.55, [0, 0.5, 0], 0.008),
      B(0.08, 0.5, 0.5, [-0.45, 0.25, 0], 0.006),
      B(0.08, 0.5, 0.5, [0.45, 0.25, 0], 0.006),
      B(1.0, 0.03, 0.45, [0, 0.66, 0], 0.004),
      B(0.26, 0.2, 0.16, [0.2, 0.6, 0], 0.01),
      { type: "latheZ", profile: [[0.01, -0.35], [0.06, -0.25], [0.08, 0.05], [0.04, 0.35]], segments: 14, at: [-0.2, 0.56, 0] },
      B(0.2, 0.02, 0.15, [-0.2, 0.52, 0], 0.004),
      B(0.08, 0.1, 0.02, [-0.2, 0.56, 0.28], 0.002),
    ),
    material: "cv_steel_dark",
    mate: A([2.2, deckY, -3.8]),
  });
  add({
    id: `${P}ordnance_bench_tools`,
    name_cn: "弹药组装工具/手册",
    name_en: "ordnance assembly tools",
    assembly: ASSEMBLY,
    build_layer: 2,
    geometry: M(
      B(0.3, 0.02, 0.2, [-0.25, 0.67, 0.1], 0.003),
      B(0.12, 0.006, 0.16, [0.35, 0.67, 0.1], 0.002),
      C(0.03, 0.08, [0.38, 0.7, -0.05], 10),
      C(0.02, 0.12, [0.5, 0.68, 0.05], 8),
      B(0.14, 0.01, 0.2, [-0.4, 0.68, -0.1], 0.002),
    ),
    material: "cv_steel",
    mate: A([2.2, deckY, -3.8]),
  });

  // 消防/损管站。
  add({
    id: `${P}fire_station`,
    name_cn: "机库损管站",
    name_en: "hangar damage control station",
    assembly: ASSEMBLY,
    build_layer: 2,
    geometry: M(B(1.0, 1.3, 0.4, [0, 0, 0], 0.01), B(0.8, 0.4, 0.06, [0, 0.1, 0.23], 0.006)),
    material: "cv_hull_dark",
    mate: A([-3.0, deckY + 0.7, -13.6]),
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
    mate: A([1.8, CV.HANGAR_Y + 0.85, 0.0]),
  });

  // ---- 机库顶灯：沿机库长轴布置的吊装灯带，照亮停放机与防火门 ----
  const hangarLightZ = [-14, -9.5, -5, -0.5, 4, 8.5, 12];
  hangarLightZ.forEach((z, index) => {
    add({
      id: `${P}ceiling_lamp_${pad(index + 1)}`,
      name_cn: `机库顶灯 ${index + 1}`,
      name_en: `hangar ceiling lamp ${index + 1}`,
      assembly: ASSEMBLY,
      build_layer: 2,
      geometry: M(
        B(0.035, 0.2, 0.035, [-0.24, 0.1, 0], 0.002),
        B(0.035, 0.2, 0.035, [0.24, 0.1, 0], 0.002),
        B(0.64, 0.06, 0.18, [0, 0, 0], 0.004),
        B(0.54, 0.012, 0.12, [0, -0.032, 0], 0.002),
        B(0.5, 0.006, 0.08, [0, -0.04, 0], 0.001),
      ),
      material: "cv_steel_dark",
      mate: A([0, CV.DECK_Y - 0.06, z]),
    });
    add({
      id: `${P}ceiling_lamp_${pad(index + 1)}_glow`,
      name_cn: `机库顶灯灯带 ${index + 1}`,
      name_en: `hangar ceiling lamp glow ${index + 1}`,
      assembly: ASSEMBLY,
      build_layer: 4,
      geometry: M(B(0.48, 0.008, 0.07, [0, 0, 0], 0.001)),
      material: "cv_glow",
      mate: A([0, CV.DECK_Y - 0.102, z]),
    });
  });

  // ---- 漫游用可开合水密门：机库艉部（下机舱）/ 艏部（生活区梯口） ----
  const addWalkDoor = (opts: {
    node: string;
    pos: [number, number];
    width: number;
    height: number;
    doorWidth: number;
    label: string;
    idTag: string;
  }) => {
    const [doorX, z] = opts.pos;
    const floorY = CV.HANGAR_Y + 0.14;
    const thickness = 0.1;
    const h = opts.height;
    const w = opts.width;
    const dw = opts.doorWidth;
    const leftEdge = -w / 2;
    const rightEdge = w / 2;
    const leafZ = z + thickness / 2 + 0.02;
    const hingeX = doorX - dw / 2;
    add({
      id: `${P}${opts.idTag}_bulkhead`,
      name_cn: `${opts.label} 舱壁`,
      name_en: `${opts.idTag} bulkhead`,
      assembly: ASSEMBLY,
      build_layer: 2,
      geometry: M(
        B(doorX - dw / 2 - 0.03 - leftEdge, h, thickness, [(leftEdge + doorX - dw / 2 - 0.03) / 2, h / 2, 0], 0.008),
        B(rightEdge - (doorX + dw / 2 + 0.03), h, thickness, [((doorX + dw / 2 + 0.03) + rightEdge) / 2, h / 2, 0], 0.008),
        B(dw + 0.06, h - 1.28, thickness, [doorX, 1.28 + (h - 1.28) / 2, 0], 0.006),
      ),
      material: "cv_hull_dark",
      mate: A([0, floorY, z]),
    });
    add({
      id: `${P}${opts.idTag}_frame`,
      name_cn: `${opts.label} 门框`,
      name_en: `${opts.idTag} door frame`,
      assembly: ASSEMBLY,
      build_layer: 2,
      geometry: M(
        B(0.07, 1.3, thickness + 0.06, [hingeX - 0.01, 0.65, 0], 0.005),
        B(0.07, 1.3, thickness + 0.06, [doorX + dw / 2 + 0.01, 0.65, 0], 0.005),
        B(dw + 0.16, 0.07, thickness + 0.06, [doorX, 1.31, 0], 0.005),
      ),
      material: "cv_steel_dark",
      mate: A([0, floorY, z]),
    });
    ctx.node({
      name: opts.node,
      parent: "root",
      pivot: [hingeX, floorY, leafZ],
      rest_rotation: [0, 0, 0],
      motion: "rotate",
      axis: "y",
      note: `${opts.label}（第一人称漫游 F 开启）`,
    });
    add({
      id: `${P}${opts.idTag}_leaf`,
      name_cn: opts.label,
      name_en: `${opts.idTag} leaf`,
      assembly: ASSEMBLY,
      build_layer: 2,
      geometry: M(
        B(dw - 0.03, 1.24, 0.04, [(dw - 0.03) / 2 + 0.015, 0.62, 0], 0.006),
        B(0.05, 0.05, 0.05, [0.04, 1.16, 0.03], 0.003),
        B(0.05, 0.05, 0.05, [dw - 0.08, 1.16, 0.03], 0.003),
        { type: "torus", radius: 0.09, tube: 0.008, radialSegments: 8, tubularSegments: 18, at: [dw * 0.55, 0.62, 0.04] },
        B(0.1, 0.02, 0.01, [dw * 0.55, 0.62, 0.045], 0.0015),
        B(0.012, 0.19, 0.012, [dw * 0.55, 0.62, 0.045], 0.0015),
      ),
      material: "cv_steel",
      node: opts.node,
      mate: A([0, 0, 0]),
    });
  };
  addWalkDoor({
    node: HANGAR_ENGINE_DOOR_NODE,
    pos: HANGAR_ENGINE_DOOR_POS,
    width: 4.4,
    height: 1.72,
    doorWidth: 0.62,
    label: "机舱水密门",
    idTag: "walk_engine_door",
  });
  addWalkDoor({
    node: HANGAR_CREW_DOOR_NODE,
    pos: HANGAR_CREW_DOOR_POS,
    width: 2.7,
    height: 1.68,
    doorWidth: 0.56,
    label: "生活区梯口水密门",
    idTag: "walk_crew_door",
  });
}
