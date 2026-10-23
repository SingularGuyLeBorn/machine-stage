import type { GeometrySpec, MateSpec } from "../../registry/types";
import { A, B, C, M, S, T, type CarrierCtx } from "../carrier/common";

// ============================================================================
// models/type055/helicopter —— 直-20 舰载直升机（反潜/通用）
// 局部坐标：原点在机腹落地点，+Z 机头、+Y 向上。真实尺寸（机长 ~20m、旋翼半径 ~8.2m）。
// 舰上停放时旋翼展开；机库内两架为折叠旋翼状态。
// ============================================================================

export interface Z20Options {
  tag: string;
  x: number;
  y: number;
  z: number;
  yaw?: number;
  scale?: number;
  folded?: boolean;
}

const ROTOR_BLADES = 5;
const TAIL_BLADES = 4;

export function addZ20(ctx: CarrierCtx, opts: Z20Options): void {
  const { tag, x, y, z, yaw = 0, scale = 1, folded = false } = opts;
  const root = `CV_055_Z20_${tag}`;
  const mainRotor = `${root}_MainRotor`;
  const tailRotor = `${root}_TailRotor`;

  ctx.node({
    name: root,
    parent: "root",
    pivot: [x, y, z],
    rest_rotation: [0, yaw, 0],
    scale: [scale, scale, scale],
    note: folded ? `直-20 ${tag}（折叠停放）` : `直-20 ${tag}`,
  });
  if (!folded) {
    ctx.node({ name: mainRotor, parent: root, pivot: [0, 4.35, 0.6], motion: "rotate", axis: "y", note: "主旋翼" });
  }
  ctx.node({ name: tailRotor, parent: root, pivot: [-0.22, 3.0, -10.05], motion: "rotate", axis: "x", note: "尾旋翼" });

  const add = (
    id: string,
    name_cn: string,
    name_en: string,
    geometry: GeometrySpec,
    material: string,
    mate: MateSpec = A([0, 0, 0]),
    node: string = root,
  ) =>
    ctx.add({
      id: `type055.hangar.z20_${tag}_${id}`,
      name_cn,
      name_en,
      assembly: "hangar",
      build_layer: 5,
      geometry,
      material,
      node,
      mate,
    });

  // ----------------机身/座舱----------------
  add("cabin_lower", "机身下段", "lower fuselage", M(B(2.3, 0.9, 4.6, [0, 1.3, 0.6], 0.04)), "cv_aircraft");
  add("cabin_upper", "机身上段", "upper fuselage", M(B(2.45, 1.5, 4.8, [0, 2.35, 0.6], 0.05)), "cv_aircraft");
  add("nose_lower", "机头下段", "lower nose", M(B(1.8, 0.7, 1.6, [0, 1.55, 3.3], 0.04)), "cv_aircraft");
  add("nose_upper", "机头上段", "upper nose", M(B(2.1, 0.8, 1.4, [0, 2.25, 3.45], 0.04)), "cv_aircraft");
  add(
    "windshield",
    "座舱风挡",
    "windshield",
    M(B(1.85, 0.78, 0.08, [0, 0, 0], 0.01)),
    "cv_glass",
    A([0, 2.75, 4.06], [-28, 0, 0]),
  );
  add("roof_fairing", "旋翼舱/发动机罩", "rotor fairing", M(B(2.05, 0.7, 3.1, [0, 3.25, 0.55], 0.05)), "cv_aircraft");
  for (const side of [-1, 1] as const) {
    for (const [i, zz] of [1.05, 2.3].entries()) {
      add(
        `window_${side === -1 ? "l" : "r"}_${i + 1}`,
        `舷窗 ${side === -1 ? "左" : "右"} ${i + 1}`,
        `cabin window ${side === -1 ? "l" : "r"} ${i + 1}`,
        M(B(0.06, 0.5, 0.85, [0, 0, 0], 0.006)),
        "cv_glass",
        A([side * 1.23, 2.62, zz]),
      );
    }
    add(
      `door_${side === -1 ? "l" : "r"}`,
      `舱门 ${side === -1 ? "左" : "右"}`,
      `cabin door ${side === -1 ? "l" : "r"}`,
      M(B(0.07, 1.35, 1.2, [0, 0, 0], 0.02), B(0.05, 0.08, 0.35, [side * 0.025, 0, 0.35], 0.004)),
      "cv_aircraft_dark",
      A([side * 1.27, 1.95, 0.55]),
    );
    add(
      `step_${side === -1 ? "l" : "r"}`,
      `登机踏步 ${side === -1 ? "左" : "右"}`,
      `step ${side === -1 ? "l" : "r"}`,
      M(B(0.55, 0.08, 0.3, [0, 0, 0], 0.006)),
      "cv_aircraft_dark",
      A([side * 1.5, 1.05, 0.5]),
    );
    add(
      `intake_${side === -1 ? "l" : "r"}`,
      `发动机进气 ${side === -1 ? "左" : "右"}`,
      `engine intake ${side === -1 ? "l" : "r"}`,
      M(C(0.33, 0.8, [0, 0, 0], 14)),
      "cv_aircraft_dark",
      A([side * 0.82, 3.45, 1.85], [90, 0, 0]),
    );
    add(
      `exhaust_${side === -1 ? "l" : "r"}`,
      `发动机排气 ${side === -1 ? "左" : "右"}`,
      `engine exhaust ${side === -1 ? "l" : "r"}`,
      M(C(0.3, 0.55, [0, 0, 0], 14)),
      "cv_steel_dark",
      A([side * 0.82, 3.4, -1.2], [90, 0, 0]),
    );
  }
  add("tail_boom", "尾梁", "tail boom", M(C(0.36, 7.0, [0, 0, 0], 14)), "cv_aircraft", A([0, 2.45, -5.2], [90, 0, 0]));
  add("tail_boom_top", "尾梁上整流", "tail boom fairing", M(B(0.55, 0.45, 4.6, [0, 0, 0], 0.02)), "cv_aircraft", A([0, 2.7, -5.4]));
  add("tail_fin", "垂尾", "vertical fin", M(B(0.22, 2.0, 1.5, [0, 0, 0], 0.03)), "cv_aircraft", A([0, 3.0, -9.6]));
  add("tail_fin_top", "垂尾上段", "fin tip", M(B(0.18, 0.8, 0.9, [0, 0, 0], 0.02)), "cv_aircraft_dark", A([0, 4.02, -10.0]));
  add("stabilizer", "平尾", "horizontal stabilizer", M(B(3.2, 0.14, 0.7, [0, 0, 0], 0.02)), "cv_aircraft", A([0, 2.55, -9.0]));
  add("tail_gearbox", "尾减速器", "tail gearbox", M(C(0.27, 0.5, [0, 0, 0], 12)), "cv_steel_dark", A([-0.22, 3.0, -10.05], [0, 0, 90]));

  // ----------------起落架----------------
  for (const side of [-1, 1] as const) {
    add(
      `gear_strut_${side === -1 ? "l" : "r"}`,
      `主起落架支柱 ${side === -1 ? "左" : "右"}`,
      `main gear strut ${side === -1 ? "l" : "r"}`,
      M({ type: "weld", from: [0, 1.15, 0], to: [0, -0.55, 0], radius: 0.075 }),
      "cv_steel_dark",
      A([side * 1.15, 1.15, 1.55]),
    );
    add(
      `wheel_${side === -1 ? "l" : "r"}`,
      `主轮 ${side === -1 ? "左" : "右"}`,
      `main wheel ${side === -1 ? "l" : "r"}`,
      M(C(0.36, 0.26, [0, 0, 0], 18), C(0.18, 0.28, [0, 0, 0], 12)),
      "cv_rubber",
      A([side * 1.15, 0.36, 1.55], [0, 0, 90]),
    );
  }
  add("tail_wheel", "尾轮", "tail wheel", M(C(0.3, 0.2, [0, 0, 0], 16), C(0.14, 0.22, [0, 0, 0], 10)), "cv_rubber", A([0, 0.3, -8.35], [0, 0, 90]));
  add("tail_strut", "尾轮支柱", "tail wheel strut", M({ type: "weld", from: [0, 1.9, -8.5], to: [0, 0.45, -8.35], radius: 0.06 }), "cv_steel_dark", A([0, 0, 0]));

  // ----------------旋翼系统----------------
  add("rotor_mast", "主旋翼轴", "main rotor mast", M(C(0.22, 1.0, [0, 0, 0], 14)), "cv_steel_dark", A([0, 3.95, 0.6]));
  add("rotor_hub", "主旋翼桨毂", "main rotor hub", M(C(0.55, 0.42, [0, 0, 0], 18), C(0.2, 0.22, [0, 0.3, 0], 10)), "cv_steel", A([0, 4.35, 0.6]));
  add("swashplate", "自动倾斜器", "swashplate", M(T(0.62, 0.45, 0.1, [0, 0, 0], 20), T(0.5, 0.34, 0.08, [0, 0.18, 0], 20)), "cv_steel_dark", A([0, 3.95, 0.6]));

  if (!folded) {
    for (let i = 0; i < ROTOR_BLADES; i++) {
      const angle = (360 / ROTOR_BLADES) * i;
      add(
        `main_blade_${i + 1}`,
        `主旋翼桨叶 ${i + 1}`,
        `main blade ${i + 1}`,
        M(B(7.05, 0.13, 0.66, [3.9, 0, 0], 0.025), B(0.34, 0.15, 0.64, [7.45, 0, 0], 0.01)),
        "cv_aircraft_dark",
        A([0, 0, 0], [0, angle, 0]),
        mainRotor,
      );
      add(
        `main_grip_${i + 1}`,
        `桨叶桨夹 ${i + 1}`,
        `blade grip ${i + 1}`,
        M({ type: "weld", from: [0.4, 0, 0], to: [0.95, 0, 0], radius: 0.1 }, { type: "weld", from: [0.55, 0, 0.2], to: [0.55, 0, 0.38], radius: 0.05 }),
        "cv_steel_dark",
        A([0, 0, 0], [0, angle, 0]),
        mainRotor,
      );
      add(
        `blade_tip_${i + 1}`,
        `桨尖警示 ${i + 1}`,
        `blade tip ${i + 1}`,
        M(B(0.36, 0.14, 0.68, [0, 0, 0], 0.006)),
        "cv_deck_yellow",
        A([7.4, 0, 0], [0, angle, 0]),
        mainRotor,
      );
    }
    const links: Array<GeometrySpec & { at?: [number, number, number] }> = [];
    for (let i = 0; i < ROTOR_BLADES; i++) {
      const a = (Math.PI * 2 * i) / ROTOR_BLADES;
      links.push({
        type: "weld",
        from: [Math.cos(a) * 0.36, 3.98, 0.6 + Math.sin(a) * 0.36],
        to: [Math.cos(a) * 0.9, 4.3, 0.6 + Math.sin(a) * 0.9],
        radius: 0.035,
      });
    }
    add("pitch_links", "变距拉杆 ×5", "pitch links ×5", M(...links), "cv_steel");
  } else {
    for (let i = 0; i < ROTOR_BLADES; i++) {
      add(
        `folded_blade_${i + 1}`,
        `折叠主桨叶 ${i + 1}`,
        `folded blade ${i + 1}`,
        M(B(0.58, 0.14, 7.0, [0, 0, 0], 0.025)),
        "cv_aircraft_dark",
        A([-1.0 + i * 0.5, 3.64, -2.0]),
      );
    }
    add("folded_blade_rack", "折叠桨叶托架", "folded blade rack", M(B(2.4, 0.16, 0.24, [0, 0, 0], 0.01), B(2.4, 0.16, 0.24, [0, 0, -5.2], 0.01)), "cv_steel_dark", A([0, 3.5, 1.2]));
  }
  for (let i = 0; i < TAIL_BLADES; i++) {
    add(
      `tail_blade_${i + 1}`,
      `尾桨叶 ${i + 1}`,
      `tail blade ${i + 1}`,
      M(B(0.1, 0.16, 2.05, [0, 0, 1.25], 0.012)),
      "cv_aircraft_dark",
      A([0, 0, 0], [90 * i, 0, 0]),
      tailRotor,
    );
  }

  // ----------------反潜任务设备----------------
  add("sonar_bay", "吊放声呐舱", "dipping sonar bay", M(T(0.58, 0.4, 0.3, [0, 0, 0], 18), C(0.32, 0.14, [0, -0.18, 0], 14)), "cv_steel_dark", A([0, 0.95, 0.6]));
  for (const side of [-1, 1] as const) {
    add(
      `sonobuoy_${side === -1 ? "l" : "r"}`,
      `声呐浮标发射器 ${side === -1 ? "左" : "右"}`,
      `sonobuoy launcher ${side === -1 ? "l" : "r"}`,
      M(B(0.5, 0.45, 1.5, [0, 0, 0], 0.02), B(0.12, 0.12, 0.55, [-0.14, 0.22, 0], 0.004), B(0.12, 0.12, 0.55, [0.14, 0.22, 0], 0.004)),
      "cv_aircraft_dark",
      A([side * 1.25, 1.45, -1.0]),
    );
    add(
      `torpedo_pylon_${side === -1 ? "l" : "r"}`,
      `反潜鱼雷挂架 ${side === -1 ? "左" : "右"}`,
      `torpedo pylon ${side === -1 ? "l" : "r"}`,
      M(B(0.18, 0.35, 1.1, [0, 0, 0], 0.01)),
      "cv_steel_dark",
      A([side * 1.5, 0.9, 0.2]),
    );
    add(
      `torpedo_${side === -1 ? "l" : "r"}`,
      `反潜鱼雷 ${side === -1 ? "左" : "右"}`,
      `ASW torpedo ${side === -1 ? "l" : "r"}`,
      M(C(0.18, 2.2, [0, 0, 0], 14), C(0.18, 0.35, [0, 1.25, 0], 12)),
      "cv_steel_dark",
      A([side * 1.5, 0.82, 0.2], [90, 0, 0]),
    );
  }
  add("flir", "光电转塔", "FLIR turret", M(S(0.3, [0, 0, 0], 14), C(0.18, 0.2, [0, -0.12, 0.22], 12)), "cv_steel_dark", A([0, 1.55, 4.3]));
  add("nose_radar", "机鼻雷达罩", "nose radome", M(S(0.3, [0, 0, 0], 14)), "cv_aircraft_dark", A([0, 2.9, 3.95]));
  add("rescue_hoist", "救援绞车", "rescue hoist", M(C(0.09, 1.1, [0, 0, 0], 10), { type: "weld", from: [0, 0.45, 0], to: [0.7, 0.45, 0], radius: 0.05 }, C(0.08, 0.18, [0.7, 0.32, 0], 8)), "cv_steel_dark", A([1.05, 3.15, 0.9]));
  for (const side of [-1, 1] as const) {
    add(
      `nav_light_${side === -1 ? "l" : "r"}`,
      `航行灯 ${side === -1 ? "红" : "绿"}`,
      `nav light ${side === -1 ? "red" : "green"}`,
      M(B(0.12, 0.12, 0.12, [0, 0, 0], 0.004)),
      side === -1 ? "cv_deck_red" : "cv_glow",
      A([side * 1.27, 2.25, 2.9]),
    );
    add(
      `antenna_${side === -1 ? "l" : "r"}`,
      `刀形天线 ${side === -1 ? "左" : "右"}`,
      `blade antenna ${side === -1 ? "l" : "r"}`,
      M(C(0.025, 0.7, [0, 0, 0], 6)),
      "cv_steel_dark",
      A([side * 0.2, 2.7, -4.5]),
    );
  }
  add("pitot", "空速管", "pitot tube", M({ type: "weld", from: [0, 0, 0], to: [0, 0, 0.55], radius: 0.025 }), "cv_steel", A([0.9, 2.5, 3.6]));

  // 编号：机头两侧白色小号（用细条代替整块数字，避免在 20m 机体上过度抢眼）。
  for (const side of [-1, 1] as const) {
    add(
      `code_${side === -1 ? "l" : "r"}`,
      `机号标条 ${side === -1 ? "左" : "右"}`,
      `side code ${side === -1 ? "l" : "r"}`,
      M(B(0.02, 0.12, 0.9, [0, 0, 0], 0.002)),
      "cv_deck_line",
      A([side * 1.245, 1.9, 2.4]),
    );
  }
}
