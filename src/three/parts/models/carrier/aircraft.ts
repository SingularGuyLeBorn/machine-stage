import { CV } from "./constants";
import { A, B, C, M, S, T, pad, type CarrierCtx } from "./common";
import type { PartDefinition } from "../../registry/types";

// ============================================================================
// L5 舰载机（歼-15 舰载型）—— 折叠机翼 / 尾钩 / 加强起落架 / 弹射牵引杆
// 机体局部：+Z 机头，原点 = 停机轮底；根节点停在飞行甲板上。
// ============================================================================

export const AIRCRAFT_NODE = "CV_Aircraft";
export const WING_FOLD_L = "CV_AircraftWingL";
export const WING_FOLD_R = "CV_AircraftWingR";
export const HOOK_NODE = "CV_AircraftHook";

export const AIRCRAFT_SCALE_Z = 22 / 24.06;

// 甲板斜列停机位：避开舰岛、升降机与拦阻索；机翼展开，贴近真实甲板停机照。
export const PARKED_SPOTS = [
  { x: 3.95, z: 10.0, yaw: 30 },
  { x: 3.95, z: 14.2, yaw: 30 },
  { x: -2.4, z: -14.4, yaw: -30 },
  { x: -2.4, z: -18.0, yaw: -30 },
] as const;

export const HANGAR_SPOTS = [
  { x: -1.0, z: 2.4, yaw: 0 },
  { x: 1.0, z: 6.1, yaw: 180 },
] as const;

/** 把已建好的 J-15 零件复制成静态停放机（含完整外翼/尾翼/起落架，不是简化盒）。 */
export function addParkedAircraft(
  ctx: CarrierCtx,
  sourceParts: PartDefinition[],
  deckTop: number,
  spots: readonly { x: number; z: number; yaw: number }[],
  key: string,
): void {
  spots.forEach((spot, index) => {
    const tag = index + 1;
    const rootName = `CV_Aircraft_${key}_${tag}`;
    const wingL = `${rootName}_WingL`;
    const wingR = `${rootName}_WingR`;
    const hook = `${rootName}_Hook`;
    ctx.node({
      name: rootName,
      parent: "root",
      pivot: [spot.x, deckTop, spot.z],
      rest_rotation: [0, spot.yaw, 0],
      scale: [1, 1, AIRCRAFT_SCALE_Z],
      note: `${key === "hangar" ? "机库" : "甲板"}停放舰载机 ${tag}`,
    });
    ctx.node({ name: wingL, parent: rootName, pivot: [-0.48, 0.28, 0.02], note: `停放机 ${tag} 左翼` });
    ctx.node({ name: wingR, parent: rootName, pivot: [0.48, 0.28, 0.02], note: `停放机 ${tag} 右翼` });
    ctx.node({ name: hook, parent: rootName, pivot: [0, 0.27, -1.12], note: `停放机 ${tag} 尾钩` });

    const nodeMap = new Map<string, string>([
      [AIRCRAFT_NODE, rootName],
      [WING_FOLD_L, wingL],
      [WING_FOLD_R, wingR],
      [HOOK_NODE, hook],
    ]);
    for (const part of sourceParts) {
      // 停放机不挂弹、不伸尾钩/弹射杆；这些机构在停机状态收起，避免与甲板和舱壁干涉。
      if (/(launch_bar|missile_|hook_)/.test(part.id)) continue;
      const { build_order: _order, id, name_cn, name_en, node, ...rest } = part;
      ctx.add({
        ...rest,
        id: `carrier.aircraft.${key}${tag}_${id.replace(/^carrier\.aircraft\./, "")}`,
        name_cn: `${key === "hangar" ? "机库停放机" : "甲板停放机"} ${tag} ${name_cn}`,
        name_en: `${key} parked ${tag} ${name_en}`,
        assembly: "aircraft",
        node: node ? (nodeMap.get(node) ?? rootName) : rootName,
      });
    }
  });
}

export function addAircraft(ctx: CarrierCtx): void {
  const add = (part: Parameters<CarrierCtx["add"]>[0]) => ctx.add(part);
  const P = "carrier.aircraft.";
  const deckTop = CV.DECK_Y + CV.DECK_T;
  const [parkX, parkZ] = CV.AIRCRAFT_PARK;

  // J-15 真实全长 22m；编辑数据略长，节点沿机体轴压缩到 22/24.06。
  ctx.node({ name: AIRCRAFT_NODE, parent: "root", pivot: [parkX, deckTop, parkZ], scale: [1, 1, AIRCRAFT_SCALE_Z], motion: "translate", axis: "z", note: "舰载机（弹射/拦阻闭环）" });
  ctx.node({ name: WING_FOLD_L, parent: AIRCRAFT_NODE, pivot: [-0.48, 0.28, 0.02], motion: "rotate", axis: "z", note: "左外翼折叠铰链" });
  ctx.node({ name: WING_FOLD_R, parent: AIRCRAFT_NODE, pivot: [0.48, 0.28, 0.02], motion: "rotate", axis: "z", note: "右外翼折叠铰链" });
  ctx.node({ name: HOOK_NODE, parent: AIRCRAFT_NODE, pivot: [0, 0.27, -1.12], motion: "rotate", axis: "x", note: "尾钩收放" });

  const fuselage = (id: string, name_cn: string, geometry: Parameters<CarrierCtx["add"]>[0]["geometry"], y: number, z: number, material = "cv_aircraft") =>
    add({
      id: `${P}${id}`,
      name_cn,
      name_en: id.replaceAll("_", " "),
      assembly: "aircraft",
      build_layer: 5,
      geometry,
      material,
      node: AIRCRAFT_NODE,
      mate: A([0, y, z]),
    });

  // 机身用回转体放样（latheZ）：真实曲面，不是方块。
  fuselage("radome", "机头雷达罩", M({ type: "latheZ", profile: [[0.145, -0.3], [0.15, -0.08], [0.12, 0.08], [0.06, 0.2], [0.004, 0.3]], segments: 28 }), 0.42, 1.02);
  fuselage("nose", "前机身", M({ type: "latheZ", profile: [[0.115, -0.24], [0.14, -0.1], [0.15, 0.06], [0.13, 0.22]], segments: 28 }), 0.42, 0.78);
  fuselage("cockpit_tub", "座舱", M({ type: "latheZ", profile: [[0.09, -0.26], [0.12, -0.1], [0.12, 0.1], [0.1, 0.26]], segments: 24 }), 0.46, 0.48, "cv_cockpit");
  fuselage("fuselage_mid", "中机身", M({ type: "latheZ", profile: [[0.13, -0.55], [0.18, -0.34], [0.19, 0], [0.18, 0.34], [0.13, 0.55]], segments: 32 }), 0.42, -0.03);
  fuselage("fuselage_rear", "后机身", M({ type: "latheZ", profile: [[0.095, -0.35], [0.15, -0.18], [0.16, 0.05], [0.15, 0.33]], segments: 30 }), 0.43, -0.86);
  fuselage("tail_cone", "尾锥", M({ type: "latheZ", profile: [[0.02, -0.16], [0.08, -0.06], [0.11, 0.08], [0.1, 0.16]], segments: 24 }), 0.47, -1.28);
  fuselage("canopy", "座舱盖", M({ type: "latheZ", profile: [[0.015, -0.2], [0.1, -0.14], [0.18, -0.04], [0.18, 0.06], [0.1, 0.16], [0.02, 0.2]], segments: 26 }), 0.55, 0.48, "cv_canopy");
  fuselage("cockpit_seat", "弹射座椅", M(B(0.13, 0.08, 0.14, [0, 0, 0], 0.006), B(0.04, 0.24, 0.05, [0, 0.1, -0.04], 0.004)), 0.54, 0.32, "cv_aircraft_dark");
  fuselage("cockpit_headrest", "弹射座椅头枕", M(B(0.07, 0.05, 0.03, [0, 0, 0], 0.005)), 0.67, 0.27, "cv_upholstery");
  // 座舱仪表台：遮光罩盖住座舱筒顶部，仪表板立在罩上，三块 MFD 贴板面，平显压板顶。
  add({
    id: `${P}cockpit_glare_shield`,
    name_cn: "座舱遮光罩",
    name_en: "cockpit glare shield",
    assembly: "aircraft",
    build_layer: 5,
    geometry: M(B(0.26, 0.026, 0.21, [0, 0, 0], 0.004)),
    material: "cv_cockpit",
    node: AIRCRAFT_NODE,
    mate: A([0, 0.593, 0.48]),
  });
  add({
    id: `${P}instrument_panel`,
    name_cn: "座舱仪表板",
    name_en: "instrument panel",
    assembly: "aircraft",
    build_layer: 5,
    geometry: M(B(0.18, 0.08, 0.02, [0, 0, 0], 0.003)),
    material: "cv_gauge_face",
    node: AIRCRAFT_NODE,
    mate: A([0, 0.646, 0.54]),
  });
  fuselage("hud", "平显", M(B(0.03, 0.024, 0.01, [0, 0, 0], 0.002)), 0.698, 0.54, "cv_mfd");
  fuselage("mfd_1", "多功能显示器 1", M(B(0.05, 0.035, 0.01, [0, 0, 0], 0.002)), 0.648, 0.525, "cv_mfd");
  fuselage("mfd_2", "多功能显示器 2", M(B(0.035, 0.028, 0.01, [0, 0, 0], 0.002)), 0.644, 0.525, "cv_mfd");
  add({
    id: `${P}mfd_3`,
    name_cn: "多功能显示器 3",
    name_en: "mfd 3",
    assembly: "aircraft",
    build_layer: 5,
    geometry: M(B(0.035, 0.028, 0.01, [0, 0, 0], 0.002)),
    material: "cv_mfd",
    node: AIRCRAFT_NODE,
    mate: A([-0.062, 0.644, 0.525]),
  });
  for (const side of [-1, 1] as const) {
    add({
      id: `${P}hud_frame_${side === -1 ? "l" : "r"}`,
      name_cn: `平显框 ${side === -1 ? "左" : "右"}`,
      name_en: `hud frame ${side === -1 ? "l" : "r"}`,
      assembly: "aircraft",
      build_layer: 5,
      geometry: M(B(0.005, 0.022, 0.012, [0, 0, 0], 0.0015)),
      material: "cv_gauge_face",
      node: AIRCRAFT_NODE,
      mate: A([side * 0.0175, 0.697, 0.54]),
    });
  }
  // 风挡框架（座舱盖玻璃在内部视角隐藏，框架留下座舱空间感）。
  for (const side of [-1, 1] as const) {
    add({
      id: `${P}windscreen_post_${side === -1 ? "l" : "r"}`,
      name_cn: `风挡立柱 ${side === -1 ? "左" : "右"}`,
      name_en: `windscreen post ${side === -1 ? "l" : "r"}`,
      assembly: "aircraft",
      build_layer: 5,
      geometry: M(B(0.012, 0.174, 0.012, [0, 0, 0], 0.002)),
      material: "cv_gauge_face",
      node: AIRCRAFT_NODE,
      mate: A([side * 0.115, 0.693, 0.55]),
    });
  }
  add({
    id: `${P}windscreen_arch`,
    name_cn: "风挡上框",
    name_en: "windscreen arch",
    assembly: "aircraft",
    build_layer: 5,
    geometry: M(B(0.242, 0.012, 0.012, [0, 0, 0], 0.002)),
    material: "cv_gauge_face",
    node: AIRCRAFT_NODE,
    mate: A([0, 0.786, 0.55]),
  });
  add({
    id: `${P}control_stick`,
    name_cn: "操纵杆",
    name_en: "control stick",
    assembly: "aircraft",
    build_layer: 5,
    geometry: M(B(0.018, 0.13, 0.018, [0, 0, 0], 0.003), S(0.019, [0, 0.08, 0], 10), B(0.04, 0.02, 0.04, [0, 0.08, 0], 0.003)),
    material: "cv_aircraft_dark",
    node: AIRCRAFT_NODE,
    mate: A([0, 0.5, 0.35]),
  });
  add({
    id: `${P}throttle`,
    name_cn: "油门杆",
    name_en: "throttle lever",
    assembly: "aircraft",
    build_layer: 5,
    geometry: M(B(0.025, 0.1, 0.025, [0, 0, 0], 0.003), B(0.05, 0.025, 0.04, [0, 0.06, 0], 0.004)),
    material: "cv_aircraft_dark",
    node: AIRCRAFT_NODE,
    mate: A([0.12, 0.5, 0.33]),
  });
  for (const side of [-1, 1] as const) {
    add({
      id: `${P}pedal_${side === -1 ? "l" : "r"}`,
      name_cn: `方向舵踏板 ${side === -1 ? "左" : "右"}`,
      name_en: `rudder pedal ${side === -1 ? "l" : "r"}`,
      assembly: "aircraft",
      build_layer: 5,
      geometry: M(B(0.05, 0.018, 0.085, [0, 0, 0], 0.003), B(0.03, 0.05, 0.02, [0, 0.03, 0.04], 0.002)),
      material: "cv_steel",
      node: AIRCRAFT_NODE,
      mate: A([side * 0.06, 0.43, 0.62]),
    });
  }

  // 机身隔框/桁条。
  for (let f = 0; f < 10; f++) {
    fuselage(`frame_${pad(f + 1)}`, `机身隔框 ${f + 1}`, M(T(0.17, 0.14, 0.035, [0, 0, 0], 18)), 0.42, 0.85 - f * 0.21, "cv_aircraft_dark");
  }
  for (let s = 0; s < 8; s++) {
    const z = 0.72 - s * 0.24;
    for (const side of [-1, 1] as const) {
      fuselage(`stringer_${pad(s * 2 + (side === -1 ? 1 : 2))}`, `机身桁条 ${s + 1}-${side === -1 ? "l" : "r"}`, M(B(0.03, 0.035, 0.22, [0, 0, 0], 0.004)), 0.57 - Math.abs(z) * 0.1, z, "cv_aircraft_dark");
      void side;
    }
  }

  // 进气道/双发/喷口/尾喷管。
  for (const side of [-1, 1] as const) {
    const tag = side === -1 ? "l" : "r";
    add({
      id: `${P}intake_${tag}`,
      name_cn: `${tag === "l" ? "左" : "右"}进气道`,
      name_en: `intake ${tag}`,
      assembly: "aircraft",
      build_layer: 5,
      geometry: M({ type: "polygon", points: [[-0.1, 0.12], [0.08, 0.12], [0.12, 0.02], [0.09, -0.11], [-0.08, -0.11], [-0.12, 0]], depth: 0.55, bevel: 0.012 }),
      material: "cv_aircraft_dark",
      node: AIRCRAFT_NODE,
      mate: A([side * 0.3, 0.38, 0.3]),
    });
    add({
      id: `${P}engine_${tag}_casing`,
      name_cn: `${tag === "l" ? "左" : "右"}发动机舱`,
      name_en: `engine casing ${tag}`,
      assembly: "aircraft",
      build_layer: 5,
      geometry: M({ type: "latheZ", profile: [[0.13, -0.58], [0.15, -0.35], [0.155, 0], [0.145, 0.35], [0.12, 0.56]], segments: 30 }),
      material: "cv_aircraft",
      node: AIRCRAFT_NODE,
      mate: A([side * 0.3, 0.38, -0.45]),
    });
    add({
      id: `${P}engine_${tag}_fan`,
      name_cn: `${tag === "l" ? "左" : "右"}风扇`,
      name_en: `engine fan ${tag}`,
      assembly: "aircraft",
      build_layer: 5,
      geometry: M({ type: "latheZ", profile: [[0.1, -0.03], [0.105, 0], [0.09, 0.04], [0.03, 0.08]], segments: 24 }),
      material: "cv_steel",
      node: AIRCRAFT_NODE,
      mate: A([side * 0.3, 0.38, 0.04]),
    });
    add({
      id: `${P}engine_${tag}_nozzle`,
      name_cn: `${tag === "l" ? "左" : "右"}喷口`,
      name_en: `engine nozzle ${tag}`,
      assembly: "aircraft",
      build_layer: 5,
      geometry: M({ type: "latheZ", profile: [[0.09, -0.12], [0.11, -0.06], [0.13, 0.04], [0.125, 0.12]], segments: 26 }),
      material: "cv_steel_dark",
      node: AIRCRAFT_NODE,
      mate: A([side * 0.3, 0.38, -1.08]),
    });
    for (let p = 0; p < 4; p++) {
      add({
        id: `${P}engine_${tag}_pipe_${p + 1}`,
        name_cn: `${tag} 发动机管路 ${p + 1}`,
        name_en: `engine pipe ${tag}-${p + 1}`,
        assembly: "aircraft",
        build_layer: 5,
        geometry: M(C(0.018, 0.7, [0, 0, 0], 8)),
        material: "cv_steel_dark",
        node: AIRCRAFT_NODE,
        mate: A([side * (0.3 + (p % 2) * 0.08), 0.3 + Math.floor(p / 2) * 0.12, -0.45], [90, 0, 0]),
      });
    }
  }

  // 内翼段（不折叠）。
  for (const side of [-1, 1] as const) {
    const tag = side === -1 ? "l" : "r";
    add({
      id: `${P}wing_inner_${tag}`,
      name_cn: `${tag === "l" ? "左" : "右"}内翼段`,
      name_en: `inner wing ${tag}`,
      assembly: "aircraft",
      build_layer: 5,
      geometry: { type: "kit", kit: "carrierWing", params: { span: 0.4, rootChord: 0.58, tipChord: 0.34, sweep: 0.1, thickness: 0.085, dihedralDeg: 2, sections: 10 }, mirror: side === -1 ? "x" : undefined },
      material: "cv_aircraft",
      node: AIRCRAFT_NODE,
      mate: A([side * 0.08, 0.3, 0.24]),
    });
    add({
      id: `${P}wing_fold_hinge_${tag}`,
      name_cn: `${tag === "l" ? "左" : "右"}折叠铰链`,
      name_en: `wing fold hinge ${tag}`,
      assembly: "aircraft",
      build_layer: 5,
      geometry: M(C(0.055, 0.42, [0, 0, 0], 14), B(0.09, 0.09, 0.12, [0, 0, 0], 0.006)),
      material: "cv_steel_dark",
      node: AIRCRAFT_NODE,
      mate: A([side * 0.48, 0.31, 0.0], [90, 0, 0]),
    });
    add({
      id: `${P}wing_fold_actuator_${tag}`,
      name_cn: `${tag === "l" ? "左" : "右"}折叠作动筒`,
      name_en: `wing fold actuator ${tag}`,
      assembly: "aircraft",
      build_layer: 5,
      geometry: M(C(0.04, 0.3, [0, 0, 0], 14), C(0.022, 0.2, [0, 0.2, 0], 10)),
      material: "cv_steel",
      node: AIRCRAFT_NODE,
      mate: A([side * 0.4, 0.27, -0.1], [0, 0, side * 65]),
    });
    add({
      id: `${P}wing_fold_lock_${tag}`,
      name_cn: `${tag === "l" ? "左" : "右"}折叠锁`,
      name_en: `wing fold lock ${tag}`,
      assembly: "aircraft",
      build_layer: 5,
      geometry: M(B(0.07, 0.08, 0.1, [0, 0, 0], 0.004)),
      material: "cv_steel_dark",
      node: AIRCRAFT_NODE,
      mate: A([side * 0.44, 0.34, 0.12]),
    });

    const foldNode = side === -1 ? WING_FOLD_L : WING_FOLD_R;
    add({
      id: `${P}wing_outer_${tag}`,
      name_cn: `${tag === "l" ? "左" : "右"}外翼段`,
      name_en: `outer wing ${tag}`,
      assembly: "aircraft",
      build_layer: 5,
      geometry: { type: "kit", kit: "carrierWing", params: { span: 0.52, rootChord: 0.56, tipChord: 0.16, sweep: 0.36, thickness: 0.075, dihedralDeg: 3.5, sections: 12 }, mirror: side === -1 ? "x" : undefined },
      material: "cv_aircraft",
      node: foldNode,
      mate: A([0, -0.04, 0.24]),
    });
    add({
      id: `${P}wingtip_${tag}`,
      name_cn: `${tag === "l" ? "左" : "右"}翼尖`,
      name_en: `wingtip ${tag}`,
      assembly: "aircraft",
      build_layer: 5,
      geometry: { ...M({ type: "polygon", points: [[0, 0.1], [0.08, 0.06], [0.08, -0.13], [0, -0.18]], depth: 0.05, bevel: 0.008 }), mirror: side === -1 ? "x" : undefined },
      material: "cv_aircraft_dark",
      node: foldNode,
      mate: A([side * 0.52, 0, -0.08], [90, 0, 0]),
    });
    add({
      id: `${P}aileron_${tag}`,
      name_cn: `${tag === "l" ? "左" : "右"}副翼`,
      name_en: `aileron ${tag}`,
      assembly: "aircraft",
      build_layer: 5,
      geometry: { ...M({ type: "polygon", points: [[0.1, -0.18], [0.5, -0.16], [0.5, -0.29], [0.11, -0.32]], depth: 0.025, bevel: 0.004 }), mirror: side === -1 ? "x" : undefined },
      material: "cv_aircraft_dark",
      node: foldNode,
      mate: A([0, 0.02, 0], [90, 0, 0]),
    });
    add({
      id: `${P}flap_${tag}`,
      name_cn: `${tag === "l" ? "左" : "右"}襟翼`,
      name_en: `flap ${tag}`,
      assembly: "aircraft",
      build_layer: 5,
      geometry: { ...M({ type: "polygon", points: [[0.09, -0.02], [0.49, 0], [0.49, -0.14], [0.1, -0.16]], depth: 0.025, bevel: 0.004 }), mirror: side === -1 ? "x" : undefined },
      material: "cv_aircraft_dark",
      node: foldNode,
      mate: A([0, 0.02, 0], [90, 0, 0]),
    });
    // 挂架 + 导弹（PL-15 / PL-10）。
    add({
      id: `${P}pylon_${tag}`,
      name_cn: `${tag === "l" ? "左" : "右"}挂架`,
      name_en: `pylon ${tag}`,
      assembly: "aircraft",
      build_layer: 5,
      geometry: M(B(0.08, 0.1, 0.28, [0, 0, 0], 0.006)),
      material: "cv_aircraft_dark",
      node: side === -1 ? WING_FOLD_L : WING_FOLD_R,
      mate: A([side * 0.2, -0.04, -0.05]),
    });
    add({
      id: `${P}missile_${tag}_body`,
      name_cn: `${tag === "l" ? "左" : "右"}中距弹`,
      name_en: `PL-15 ${tag}`,
      assembly: "aircraft",
      build_layer: 5,
      geometry: M(C(0.045, 0.52, [0, 0, 0], 14), C(0.015, 0.2, [0, 0.3, 0], 10), B(0.12, 0.015, 0.14, [0, 0, -0.16], 0.003)),
      material: "cv_steel",
      node: side === -1 ? WING_FOLD_L : WING_FOLD_R,
      mate: A([side * 0.35, -0.1, -0.05], [90, 0, 0]),
    });
    add({
      id: `${P}tailplane_${tag}`,
      name_cn: `${tag === "l" ? "左" : "右"}平尾`,
      name_en: `tailplane ${tag}`,
      assembly: "aircraft",
      build_layer: 5,
      geometry: { type: "kit", kit: "carrierWing", params: { span: 0.27, rootChord: 0.34, tipChord: 0.1, sweep: 0.18, thickness: 0.065, dihedralDeg: 3, sections: 8 }, mirror: side === -1 ? "x" : undefined },
      material: "cv_aircraft",
      node: AIRCRAFT_NODE,
      mate: A([side * 0.18, 0.38, -0.92]),
    });
    add({
      id: `${P}fin_${tag}`,
      name_cn: `${tag === "l" ? "左" : "右"}垂尾`,
      name_en: `vertical fin ${tag}`,
      assembly: "aircraft",
      build_layer: 5,
      geometry: { type: "kit", kit: "carrierWing", params: { span: 0.34, rootChord: 0.4, tipChord: 0.1, sweep: 0.26, thickness: 0.07, dihedralDeg: 0, sections: 8 }, mirror: side === -1 ? "x" : undefined },
      material: "cv_aircraft",
      node: AIRCRAFT_NODE,
      mate: A([side * 0.18, 0.44, -0.9], [0, 0, side * 90]),
    });
    add({
      id: `${P}rudder_${tag}`,
      name_cn: `${tag === "l" ? "左" : "右"}方向舵`,
      name_en: `rudder ${tag}`,
      assembly: "aircraft",
      build_layer: 5,
      geometry: M(B(0.035, 0.36, 0.1, [0, 0, 0], 0.004)),
      material: "cv_aircraft_dark",
      node: AIRCRAFT_NODE,
      mate: A([side * 0.25, 0.57, -1.16], [-8, side * 12, side * 6]),
    });
  }
  // 鸭翼（歼-15 特征）。
  for (const side of [-1, 1] as const) {
    add({
      id: `${P}canard_${side === -1 ? "l" : "r"}`,
      name_cn: `${side === -1 ? "左" : "右"}鸭翼`,
      name_en: `canard ${side === -1 ? "l" : "r"}`,
      assembly: "aircraft",
      build_layer: 5,
      geometry: { type: "kit", kit: "carrierWing", params: { span: 0.22, rootChord: 0.24, tipChord: 0.06, sweep: 0.12, thickness: 0.055, dihedralDeg: 3, sections: 7 }, mirror: side === -1 ? "x" : undefined },
      material: "cv_aircraft",
      node: AIRCRAFT_NODE,
      mate: A([side * 0.2, 0.4, 0.62]),
    });
    add({
      id: `${P}lerx_${side === -1 ? "l" : "r"}`,
      name_cn: `${side === -1 ? "左" : "右"}翼根边条`,
      name_en: `leading edge extension ${side === -1 ? "l" : "r"}`,
      assembly: "aircraft",
      build_layer: 5,
      geometry: { type: "kit", kit: "carrierWing", params: { span: 0.34, rootChord: 0.3, tipChord: 0.05, sweep: -0.3, thickness: 0.045, dihedralDeg: 1, sections: 8 }, mirror: side === -1 ? "x" : undefined },
      material: "cv_aircraft",
      node: AIRCRAFT_NODE,
      mate: A([side * 0.1, 0.32, 0.28]),
    });
  }

  // 加强起落架：前起（双轮 + 弹射牵引杆）+ 主起 ×2。
  add({
    id: `${P}gear_nose_strut`,
    name_cn: "前起落架支柱",
    name_en: "nose gear strut",
    assembly: "aircraft",
    build_layer: 5,
    geometry: M(C(0.04, 0.28, [0, 0, 0], 14), C(0.06, 0.1, [0, -0.1, 0], 14), B(0.1, 0.06, 0.08, [0, 0.12, 0], 0.004)),
    material: "cv_steel",
    node: AIRCRAFT_NODE,
    mate: A([0, 0.16, 0.78]),
  });
  for (const side of [-1, 1] as const) {
    add({
      id: `${P}gear_nose_wheel_${side === -1 ? "l" : "r"}`,
      name_cn: `前轮 ${side === -1 ? "左" : "右"}`,
      name_en: `nose wheel ${side === -1 ? "l" : "r"}`,
      assembly: "aircraft",
      build_layer: 5,
      geometry: M(C(0.11, 0.07, [0, 0, 0], 16), T(0.08, 0.035, 0.075, [0, 0, 0], 16)),
      material: "cv_rubber",
      node: AIRCRAFT_NODE,
      mate: A([side * 0.12, 0.1, 0.78], [0, 0, 90]),
    });
  }
  add({
    id: `${P}launch_bar`,
    name_cn: "弹射牵引杆",
    name_en: "catapult launch bar",
    assembly: "aircraft",
    build_layer: 5,
    geometry: M(C(0.025, 0.28, [0, 0, 0], 10), C(0.04, 0.06, [0, -0.15, 0], 10)),
    material: "cv_steel",
    node: AIRCRAFT_NODE,
    mate: A([0, 0.1, 1.0], [0, 0, 25]),
  });
  for (const side of [-1, 1] as const) {
    add({
      id: `${P}gear_main_strut_${side === -1 ? "l" : "r"}`,
      name_cn: `主起落架支柱 ${side === -1 ? "左" : "右"}`,
      name_en: `main gear strut ${side === -1 ? "l" : "r"}`,
      assembly: "aircraft",
      build_layer: 5,
      geometry: M(C(0.05, 0.32, [0, 0, 0], 14), C(0.07, 0.12, [0, -0.14, 0], 14)),
      material: "cv_steel",
      node: AIRCRAFT_NODE,
      mate: A([side * 0.3, 0.2, -0.28]),
    });
    add({
      id: `${P}gear_main_wheel_${side === -1 ? "l" : "r"}`,
      name_cn: `主轮 ${side === -1 ? "左" : "右"}`,
      name_en: `main wheel ${side === -1 ? "l" : "r"}`,
      assembly: "aircraft",
      build_layer: 5,
      geometry: M(C(0.15, 0.09, [0, 0, 0], 18), T(0.11, 0.045, 0.095, [0, 0, 0], 18)),
      material: "cv_rubber",
      node: AIRCRAFT_NODE,
      mate: A([side * 0.3, 0.15, -0.28], [0, 0, 90]),
    });
    add({
      id: `${P}gear_door_${side === -1 ? "l" : "r"}`,
      name_cn: `起落架舱门 ${side === -1 ? "左" : "右"}`,
      name_en: `gear door ${side === -1 ? "l" : "r"}`,
      assembly: "aircraft",
      build_layer: 5,
      geometry: M(B(0.2, 0.02, 0.28, [0, 0, 0], 0.004)),
      material: "cv_aircraft_dark",
      node: AIRCRAFT_NODE,
      mate: A([side * 0.3, 0.32, -0.3]),
    });
  }

  // 尾钩：钩臂 + 钩头 + 缓冲器 + 收放作动器。
  add({
    id: `${P}hook_arm`,
    name_cn: "尾钩钩臂",
    name_en: "tailhook arm",
    assembly: "aircraft",
    build_layer: 5,
    geometry: M(C(0.035, 0.58, [0, 0, 0], 12)),
    material: "cv_steel",
    node: HOOK_NODE,
    mate: A([0, 0, -0.26], [90, 0, 0]),
  });
  add({
    id: `${P}hook_head`,
    name_cn: "尾钩钩头",
    name_en: "tailhook head",
    assembly: "aircraft",
    build_layer: 5,
    geometry: M(B(0.09, 0.1, 0.09, [0, 0, 0], 0.008), C(0.03, 0.08, [0, -0.06, 0], 10)),
    material: "cv_steel_dark",
    node: HOOK_NODE,
    mate: A([0, -0.02, -0.56]),
  });
  add({
    id: `${P}hook_actuator`,
    name_cn: "尾钩收放作动筒",
    name_en: "tailhook actuator",
    assembly: "aircraft",
    build_layer: 5,
    geometry: M(C(0.03, 0.12, [0, 0, 0], 12), C(0.018, 0.1, [0, 0.1, 0], 10)),
    material: "cv_steel",
    node: HOOK_NODE,
    mate: A([0, -0.02, -0.16], [0, 0, 0]),
  });
  add({
    id: `${P}hook_damper`,
    name_cn: "尾钩缓冲器",
    name_en: "tailhook damper",
    assembly: "aircraft",
    build_layer: 5,
    geometry: M(C(0.05, 0.12, [0, 0, 0], 14), C(0.025, 0.08, [0, 0.1, 0], 10)),
    material: "cv_steel_dark",
    node: HOOK_NODE,
    mate: A([0, -0.08, -0.02], [0, 0, 15]),
  });

  // 细节：天线/灯/加油口/检修口。
  for (let a = 0; a < 6; a++) {
    add({
      id: `${P}antenna_${a + 1}`,
      name_cn: `机载天线 ${a + 1}`,
      name_en: `aircraft antenna ${a + 1}`,
      assembly: "aircraft",
      build_layer: 5,
      geometry: M(B(0.015, 0.08, 0.06, [0, 0, 0], 0.002)),
      material: "cv_aircraft_dark",
      node: AIRCRAFT_NODE,
      mate: A([(a % 2 === 0 ? -1 : 1) * 0.12, 0.63 - Math.floor(a / 2) * 0.04, 0.4 - a * 0.25]),
    });
  }
  for (let l = 0; l < 4; l++) {
    add({
      id: `${P}light_${l + 1}`,
      name_cn: `航行灯 ${l + 1}`,
      name_en: `navigation light ${l + 1}`,
      assembly: "aircraft",
      build_layer: 5,
      geometry: M(S(0.025, [0, 0, 0], 10)),
      material: l === 0 ? "cv_glow" : "cv_aircraft_dark",
      node: AIRCRAFT_NODE,
      mate: A([(l % 2 === 0 ? -1 : 1) * 0.45, 0.34, -0.25 - Math.floor(l / 2) * 0.5]),
    });
  }
  // 折叠状态下的系留环/轮挡（甲板固定件在 surface 分册）。
}
