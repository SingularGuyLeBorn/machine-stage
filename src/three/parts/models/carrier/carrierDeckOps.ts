import { A, B, C, M, S, T, type CarrierCtx } from "./common";
import { CAT_TRACKS, CV, catAcross } from "./constants";

// ============================================================================
// 福建舰飞行甲板作业链：牵引车/消防车/挂弹车/系留/轮挡/JBD 液压/拦阻索附件。
// 全部按真实甲板作业位置布置，落在甲板面或挂在 JBD 节点上。
// ============================================================================

export function addCarrierDeckOps(ctx: CarrierCtx): void {
  let serial = 0;
  const deckTop = CV.DECK_Y + CV.DECK_T;
  const add = (
    id: string,
    cn: string,
    geometry: ReturnType<typeof M>,
    material: string,
    at: [number, number, number],
    node?: string,
    rotation?: [number, number, number],
  ) => {
    serial += 1;
    ctx.add({
      id: `carrier.deck.ops_${id}_${serial}`,
      name_cn: cn,
      name_en: cn,
      assembly: "flightdeck",
      build_layer: 4,
      geometry,
      material,
      node,
      mate: A(at, rotation),
    });
  };

  // ---------------- 牵引车（后甲板右舷） ----------------
  {
    // 舰艉甲板右舷在用户轮廓里内收，牵引车停在艉部甲板内、吊车基座前方。
    const ox = 2.0;
    const oz = -16.0;
    const put = (id: string, cn: string, geo: ReturnType<typeof M>, mat: string, dx: number, dy: number, dz: number, rot?: [number, number, number]) =>
      add(id, cn, geo, mat, [ox + dx, deckTop + dy, oz + dz], undefined, rot);
    put("tractor_chassis", "甲板牵引车底盘", M(B(0.3, 0.045, 0.18, [0, 0, 0], 0.004)), "cv_deck_yellow", 0, 0.09, 0);
    put("tractor_cab", "牵引车驾驶室", M(B(0.2, 0.16, 0.15, [0, 0, 0], 0.006)), "cv_deck_yellow", 0, 0.2, -0.02);
    put("tractor_roof", "牵引车顶棚", M(B(0.22, 0.018, 0.17, [0, 0, 0], 0.003)), "cv_deck_yellow", 0, 0.295, -0.02);
    put("tractor_hood", "牵引车机罩", M(B(0.18, 0.08, 0.07, [0, 0, 0], 0.005)), "cv_deck_yellow", 0, 0.13, 0.1);
    put("tractor_grille", "牵引车散热格栅", M(...Array.from({ length: 5 }, (_, i) => B(0.15, 0.008, 0.008, [0, 0.11 + i * 0.012, 0.137], 0.001))), "cv_steel_dark", 0, 0, 0);
    put("tractor_seat", "牵引车座椅", M(B(0.08, 0.04, 0.07, [0, 0, 0], 0.003), B(0.08, 0.08, 0.02, [0, 0.05, -0.03], 0.002)), "cv_rubber", 0, 0.11, -0.04);
    put("tractor_wheel", "牵引车车轮", M(C(0.055, 0.035, [0, 0, 0], 12)), "cv_rubber", -0.14, 0.055, 0.08, [0, 0, 90]);
    put("tractor_wheel", "牵引车车轮", M(C(0.055, 0.035, [0, 0, 0], 12)), "cv_rubber", 0.14, 0.055, 0.08, [0, 0, 90]);
    put("tractor_wheel", "牵引车车轮", M(C(0.055, 0.035, [0, 0, 0], 12)), "cv_rubber", -0.14, 0.055, -0.08, [0, 0, 90]);
    put("tractor_wheel", "牵引车车轮", M(C(0.055, 0.035, [0, 0, 0], 12)), "cv_rubber", 0.14, 0.055, -0.08, [0, 0, 90]);
    for (const [x, z] of [[-0.14, 0.08], [0.14, 0.08], [-0.14, -0.08], [0.14, -0.08]] as const) {
      put("tractor_hub", "牵引车轮毂", M(C(0.025, 0.04, [0, 0, 0], 10)), "cv_steel", x, 0.055, z, [0, 0, 90]);
    }
    for (let b = 0; b < 12; b++) {
      const a = (Math.PI * 2 * b) / 12;
      put("tractor_lug", "牵引车轮螺栓", M(C(0.008, 0.012, [0, 0, 0], 6)), "cv_steel", -0.14 + Math.cos(a) * 0.04, 0.055 + Math.sin(a) * 0.04, 0.08, [0, 0, 90]);
    }
    // 牵引杆不用时平放在车侧甲板上，杆身贴地、端头拖环朝车尾，避免悬空和压住机罩。
    put("tractor_towbar", "牵引杆（平放待用）", M({ type: "weld", from: [0, 0.014, -0.16], to: [0, 0.014, 0.16], radius: 0.012 }, C(0.03, 0.028, [0, 0.016, 0.2], 8)), "cv_steel", 0.28, 0, 0.04);
    put("tractor_hyd", "牵引车液压臂", M({ type: "weld", from: [-0.12, 0.1, 0.03], to: [-0.12, 0.04, 0.14], radius: 0.01 }), "cv_copper", 0, 0, 0);
    put("tractor_light", "牵引车灯", M(S(0.018, [0, 0, 0], 6)), "cv_glow", -0.08, 0.15, 0.13);
    put("tractor_light", "牵引车灯", M(S(0.018, [0, 0, 0], 6)), "cv_glow", 0.08, 0.15, 0.13);
    put("tractor_beacon", "牵引车警示灯", M(S(0.025, [0, 0, 0], 8), C(0.012, 0.03, [0, -0.03, 0], 6)), "cv_deck_red", 0, 0.33, -0.02);
    put("tractor_step", "牵引车踏板", M(B(0.08, 0.015, 0.06, [0, 0, 0], 0.002)), "cv_steel_dark", -0.12, 0.09, -0.03);
    put("tractor_step", "牵引车踏板", M(B(0.08, 0.015, 0.06, [0, 0, 0], 0.002)), "cv_steel_dark", 0.12, 0.09, -0.03);
    put("tractor_exhaust", "牵引车排气管", M(C(0.018, 0.16, [0, 0, 0], 8)), "cv_steel", 0.1, 0.22, 0.08);
  }

  // ---------------- 甲板消防车（右舷艉部） ----------------
  {
    const ox = 2.85;
    const oz = -14.5;
    const put = (id: string, cn: string, geo: ReturnType<typeof M>, mat: string, dx: number, dy: number, dz: number, rot?: [number, number, number]) =>
      add(id, cn, geo, mat, [ox + dx, deckTop + dy, oz + dz], undefined, rot);
    put("fire_chassis", "甲板消防车底盘", M(B(0.34, 0.05, 0.18, [0, 0, 0], 0.004)), "cv_deck_red", 0, 0.1, 0);
    put("fire_cab", "消防车驾驶室", M(B(0.22, 0.17, 0.15, [0, 0, 0], 0.006)), "cv_deck_red", 0, 0.21, 0.02);
    put("fire_tank", "消防车水罐", M(B(0.28, 0.16, 0.2, [0, 0, 0], 0.01)), "cv_steel", 0, 0.22, -0.14);
    put("fire_panel", "消防车泵浦面板", M(B(0.24, 0.12, 0.02, [0, 0, 0], 0.003)), "cv_055_console", 0, 0.2, -0.25);
    for (let g = 0; g < 3; g++) {
      put("fire_gauge", "消防车压力表", M(C(0.022, 0.012, [0, 0, 0], 10)), "cv_gauge_face", -0.07 + g * 0.07, 0.21, -0.26);
    }
    put("fire_hose", "消防车水带卷盘", M(T(0.07, 0.04, 0.06, [0, 0, 0], 12), { type: "weld", from: [0, 0, 0], to: [0.12, -0.04, 0], radius: 0.012 }), "cv_rubber", -0.16, 0.19, -0.2);
    put("fire_ladder", "消防车梯", M(B(0.24, 0.01, 0.04, [0, 0, 0], 0.002), ...Array.from({ length: 5 }, (_, i) => B(0.01, 0.01, 0.04, [-0.1 + i * 0.05, 0.015, 0], 0.001))), "cv_steel", 0, 0.32, -0.14);
    put("fire_beacon", "消防车警灯", M(S(0.028, [0, 0, 0], 8), C(0.012, 0.03, [0, -0.03, 0], 6)), "cv_deck_red", 0, 0.32, 0.02);
    for (const [dx, dz] of [[-0.14, 0.1], [0.14, 0.1], [-0.14, -0.02], [0.14, -0.02], [-0.14, -0.14], [0.14, -0.14]] as const) {
      put("fire_wheel", "消防车车轮", M(C(0.06, 0.04, [0, 0, 0], 12)), "cv_rubber", dx, 0.06, dz, [0, 0, 90]);
      put("fire_hub", "消防车轮毂", M(C(0.025, 0.045, [0, 0, 0], 10)), "cv_steel", dx, 0.06, dz, [0, 0, 90]);
    }
    put("fire_nozzle", "消防水炮", M(C(0.035, 0.14, [0, 0, 0], 10), C(0.02, 0.08, [0, 0.1, 0], 8)), "cv_steel", 0.12, 0.33, -0.1, [20, 0, 0]);
  }

  // ---------------- 挂弹车（岛后待发弹药区旁） ----------------
  {
    const ox = 1.15;
    const oz = -8.5;
    const put = (id: string, cn: string, geo: ReturnType<typeof M>, mat: string, dx: number, dy: number, dz: number, rot?: [number, number, number]) =>
      add(id, cn, geo, mat, [ox + dx, deckTop + dy, oz + dz], undefined, rot);
    put("skid_frame", "挂弹车车架", M(B(0.32, 0.03, 0.2, [0, 0, 0], 0.004), B(0.3, 0.02, 0.04, [0, 0.12, 0], 0.002)), "cv_deck_yellow", 0, 0.14, 0);
    for (const [dx, dz] of [[-0.13, 0.2], [0.13, 0.2], [-0.13, -0.2], [0.13, -0.2]] as const) {
      put("skid_wheel", "挂弹车轮", M(C(0.05, 0.03, [0, 0, 0], 10)), "cv_rubber", dx, 0.06, dz, [0, 0, 90]);
    }
    for (let m = 0; m < 4; m++) {
      const dx = -0.08 + (m % 2) * 0.16;
      const dz = -0.06 + Math.floor(m / 2) * 0.16;
      put("skid_round", "待挂弹药", M(C(0.035, 0.24, [0, 0, 0], 12), C(0.012, 0.06, [0, 0.15, 0], 8), ...Array.from({ length: 4 }, (_, f) => B(0.06, 0.01, 0.06, [Math.cos(f * Math.PI / 2) * 0.035, -0.1, Math.sin(f * Math.PI / 2) * 0.035], 0.001))), "cv_aircraft_dark", dx, 0.24, dz);
      put("skid_cradle", "弹药托架", M(B(0.09, 0.03, 0.09, [0, 0, 0], 0.002)), "cv_steel_dark", dx, 0.16, dz);
    }
    put("skid_label", "挂弹车警示牌", M(B(0.12, 0.05, 0.01, [0, 0, 0], 0.002)), "cv_warning", 0, 0.17, 0.09);
  }

  // ---------------- JBD 液压动力站/铰链附件 ----------------
  CAT_TRACKS.forEach((track, index) => {
    const pos = catAcross(track, -4.0, index === 1 ? 1.5 : -1.5);
    for (const [k, dx, dz] of [[0, -0.32, 0], [1, 0.32, 0], [2, 0, 0.26], [3, 0, -0.26]] as const) {
      add(
        `jbd_hyd_pack_${index + 1}_${k + 1}`,
        `挡焰板液压动力站 ${index + 1}-${k + 1}`,
        k === 0 ? M(C(0.08, 0.2, [0, 0, 0], 10), B(0.24, 0.06, 0.18, [0, -0.1, 0], 0.004)) : k === 1 ? M(C(0.06, 0.28, [0, 0, 0], 10), T(0.09, 0.05, 0.04, [0, 0.15, 0], 10)) : M(C(0.025, 0.3, [0, 0, 0], 8)),
        k === 1 ? "cv_copper" : "cv_steel_dark",
        [pos.x + dx, deckTop + 0.1, pos.z + dz],
      );
    }
    add(`jbd_hinge_pin_${index + 1}`, `挡焰板铰链销 ${index + 1}`, M(C(0.03, 0.9, [0, 0, 0], 10)), "cv_steel", [pos.x, deckTop + 0.03, pos.z], undefined, [0, 0, 90]);
  });

  // ---------------- 拦阻索端部滑轮/制动索 ----------------
  for (const [i, z] of CV.WIRE_Z.entries()) {
    for (const side of [-1, 1] as const) {
      add(
        `wire_sheave_${i + 1}_${side === -1 ? "l" : "r"}`,
        `拦阻索滑轮 ${i + 1} ${side === -1 ? "左" : "右"}`,
        M(T(0.12, 0.06, 0.05, [0, 0, 0], 12), B(0.2, 0.06, 0.1, [0, 0, 0], 0.004)),
        "cv_steel_dark",
        [side * (CV.WIRE_HALF - 0.1), deckTop + 0.05, z],
      );
    }
    add(`wire_spring_${i + 1}`, `拦阻索张紧索 ${i + 1}`, M({ type: "weld", from: [-0.4, 0, 0], to: [0.4, 0, 0], radius: 0.03 }), "cv_steel", [0, deckTop + 0.035, z]);
  }

  // ---------------- 甲板系留链/轮挡（避开停放机与跑道） ----------------
  for (let i = 0; i < 30; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const z = -19.0 + Math.floor(i / 2) * 0.55;
    add(
      `deck_chain_${i + 1}`,
      `甲板系留链 ${i + 1}`,
      M({ type: "weld", from: [0, 0, 0], to: [side * 0.08, 0.02, 0.1], radius: 0.008 }, T(0.035, 0.02, 0.012, [side * 0.08, 0.02, 0.1], 8)),
      "cv_steel",
      [side === -1 ? -2.4 : 1.45, deckTop + 0.02, z],
    );
  }
  for (let i = 0; i < 12; i++) {
    add(`deck_chock_${i + 1}`, `甲板轮挡 ${i + 1}`, M(B(0.12, 0.1, 0.08, [0, 0, 0], 0.004)), "cv_deck_yellow", [i % 2 === 0 ? -1.6 : 1.6, deckTop + 0.05, -18.2 + Math.floor(i / 2) * 0.6]);
  }
}
