import type { GeometrySpec, MateSpec } from "../../registry/types";
import { A, B, C, M, S, T } from "../carrier/common";

// ============================================================================
// 直-20 细节层：蒙皮板/铆钉/旋翼头/发动机/任务设备/起落架/天线/标记。
// 所有小件与原机体保持 1–15mm 间隙或搭接，支撑检测取 20mm 名义缝。
// ============================================================================

export interface Z20DetailApi {
  add: (
    id: string,
    name_cn: string,
    name_en: string,
    geometry: GeometrySpec,
    material: string,
    mate?: MateSpec,
    node?: string,
  ) => void;
  folded: boolean;
  root: string;
  mainRotor: string;
  tailRotor: string;
}

const deg = (v: number) => (v * Math.PI) / 180;

export function addZ20Details({ add, folded, root, mainRotor, tailRotor }: Z20DetailApi): void {
  let serial = 0;
  const safeId = (id: string) => (/_[lr]$/.test(id) ? `${id}_p` : id);
  const plate = (
    id: string,
    cn: string,
    en: string,
    geometry: GeometrySpec,
    at: [number, number, number],
    rotation?: [number, number, number],
    material = "cv_aircraft",
    node = root,
  ) => {
    serial += 1;
    add(`detail_${safeId(id)}`, `${cn} ${serial}`, `${en} ${serial}`, geometry, material, A(at, rotation), node);
  };
  const rivet = (id: string, at: [number, number, number], node = root) => {
    serial += 1;
    add(`rivet_${safeId(id)}`, `铆钉 ${serial}`, `rivet ${serial}`, M(S(0.012, [0, 0, 0], 6)), "cv_aircraft_dark", A(at), node);
  };

  // ---------------- 1. 蒙皮板 + 铆钉 ----------------
  // 机身上/下侧板
  for (const side of [-1, 1] as const) {
    const tag = side === -1 ? "l" : "r";
    const xUp = side * 1.235;
    for (let r = 0; r < 4; r++) {
      const y = 1.85 + r * 0.35;
      for (let c = 0; c < 7; c++) {
        const z = -1.55 + c * 0.72;
        plate(
          `skin_up_${tag}_${r + 1}_${c + 1}`,
          `机身上侧蒙皮 ${tag.toUpperCase()}${r + 1}-${c + 1}`,
          `upper skin panel ${tag}-${r + 1}-${c + 1}`,
          M(B(0.018, 0.32, 0.64, [0, 0, 0], 0.0012)),
          [xUp, y, z],
        );
        rivet(`skin_up_${tag}_${r + 1}_${c + 1}`, [side * 1.253, y, z]);
      }
    }
    const xLow = side * 1.16;
    for (let r = 0; r < 2; r++) {
      const y = 1.05 + r * 0.4;
      for (let c = 0; c < 8; c++) {
        const z = -1.55 + c * 0.58;
        plate(
          `skin_low_${tag}_${r + 1}_${c + 1}`,
          `机身下侧蒙皮 ${tag.toUpperCase()}${r + 1}-${c + 1}`,
          `lower skin panel ${tag}-${r + 1}-${c + 1}`,
          M(B(0.018, 0.34, 0.5, [0, 0, 0], 0.0012)),
          [xLow, y, z],
        );
        rivet(`skin_low_${tag}_${r + 1}_${c + 1}`, [side * 1.178, y, z]);
      }
    }
    // 机头两侧/下侧
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 3; c++) {
        plate(
          `skin_nose_${tag}_${r + 1}_${c + 1}`,
          `机头侧蒙皮 ${tag.toUpperCase()}${r + 1}-${c + 1}`,
          `nose skin ${tag}-${r + 1}-${c + 1}`,
          M(B(0.018, 0.28, 0.42, [0, 0, 0], 0.0012)),
          [side * 1.06, 2.05 + r * 0.4, 3.0 + c * 0.5],
        );
        rivet(`skin_nose_${tag}_${r + 1}_${c + 1}`, [side * 1.078, 2.05 + r * 0.4, 3.0 + c * 0.5]);
      }
    }
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 3; c++) {
        plate(
          `skin_nose_low_${tag}_${r + 1}_${c + 1}`,
          `机头下蒙皮 ${tag.toUpperCase()}${r + 1}-${c + 1}`,
          `nose lower skin ${tag}-${r + 1}-${c + 1}`,
          M(B(0.018, 0.24, 0.42, [0, 0, 0], 0.0012)),
          [side * 0.91, 1.35 + r * 0.3, 2.9 + c * 0.5],
        );
        rivet(`skin_nose_low_${tag}_${r + 1}_${c + 1}`, [side * 0.928, 1.35 + r * 0.3, 2.9 + c * 0.5]);
      }
    }
    // 座舱顶部两条外露蒙皮
    for (let c = 0; c < 5; c++) {
      plate(
        `skin_cabin_top_${tag}_${c + 1}`,
        `座舱顶外露蒙皮 ${tag.toUpperCase()}${c + 1}`,
        `cabin top skin ${tag}-${c + 1}`,
        M(B(0.16, 0.018, 0.68, [0, 0, 0], 0.0012)),
        [side * 1.12, 3.11, -1.4 + c * 0.8],
      );
      rivet(`skin_cabin_top_${tag}_${c + 1}`, [side * 1.12, 3.126, -1.4 + c * 0.8]);
    }
    // 机腹两条外露蒙皮
    for (let c = 0; c < 6; c++) {
      plate(
        `skin_belly_${tag}_${c + 1}`,
        `机腹蒙皮 ${tag.toUpperCase()}${c + 1}`,
        `belly skin ${tag}-${c + 1}`,
        M(B(0.3, 0.018, 0.55, [0, 0, 0], 0.0012)),
        [side * 0.85, 0.84, -1.4 + c * 0.65],
      );
      rivet(`skin_belly_${tag}_${c + 1}`, [side * 0.85, 0.826, -1.4 + c * 0.65]);
    }
  }
  // 机头上方
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 3; c++) {
      const x = -0.65 + c * 0.65;
      const z = 3.2 + r * 0.55;
      plate(
        `skin_nose_top_${r + 1}_${c + 1}`,
        `机头顶蒙皮 ${r + 1}-${c + 1}`,
        `nose top skin ${r + 1}-${c + 1}`,
        M(B(0.5, 0.018, 0.5, [0, 0, 0], 0.0012)),
        [x, 2.67, z],
      );
      rivet(`skin_nose_top_${r + 1}_${c + 1}`, [x, 2.686, z]);
    }
  }
  // 发动机罩顶部
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      const x = -0.78 + c * 0.52;
      const z = -0.8 + r * 0.8;
      plate(
        `skin_roof_${r + 1}_${c + 1}`,
        `旋翼舱顶蒙皮 ${r + 1}-${c + 1}`,
        `roof skin ${r + 1}-${c + 1}`,
        M(B(0.48, 0.018, 0.72, [0, 0, 0], 0.0012)),
        [x, 3.61, z],
      );
      rivet(`skin_roof_${r + 1}_${c + 1}`, [x, 3.626, z]);
    }
  }
  // 尾梁环向蒙皮板
  for (let a = 0; a < 8; a++) {
    const theta = (a / 8) * Math.PI * 2;
    for (let c = 0; c < 8; c++) {
      const z = -8.3 + c * 0.9;
      const cx = Math.cos(theta) * 0.37;
      const cy = 2.45 + Math.sin(theta) * 0.37;
      plate(
        `skin_tail_${a + 1}_${c + 1}`,
        `尾梁蒙皮 ${a + 1}-${c + 1}`,
        `tail boom skin ${a + 1}-${c + 1}`,
        M(B(0.18, 0.02, 0.55, [0, 0, 0], 0.0012)),
        [cx, cy, z],
        [0, 0, (theta * 180) / Math.PI - 90],
      );
      rivet(`skin_tail_${a + 1}_${c + 1}`, [Math.cos(theta) * 0.392, 2.45 + Math.sin(theta) * 0.392, z]);
    }
  }

  // ---------------- 2. 舱门/舷窗/风挡五金 ----------------
  for (const side of [-1, 1] as const) {
    const tag = side === -1 ? "l" : "r";
    for (let h = 0; h < 2; h++) {
      plate(
        `door_hinge_${tag}_${h + 1}`,
        `舱门铰链 ${tag.toUpperCase()}${h + 1}`,
        `door hinge ${tag}-${h + 1}`,
        M(C(0.028, 0.12, [0, 0, 0], 8)),
        [side * 1.305, 1.5 + h * 0.9, 1.12],
      );
    }
    plate(`door_handle_${tag}`, `舱门把手 ${tag.toUpperCase()}`, `door handle ${tag}`, M(B(0.04, 0.05, 0.18, [0, 0, 0], 0.003)), [side * 1.31, 2.0, -0.02], undefined, "cv_steel");
    for (const dz of [-0.24, 0.24]) {
      plate(`door_win_v_${tag}_${dz > 0 ? "f" : "a"}`, `舱门窗框 ${tag.toUpperCase()}`, `door window frame ${tag}`, M(B(0.02, 0.49, 0.03, [0, 0, 0], 0.001)), [side * 1.289, 2.28, 0.62 + dz]);
    }
    for (const dy of [-0.22, 0.22]) {
      plate(`door_win_h_${tag}_${dy > 0 ? "t" : "b"}`, `舱门窗横框 ${tag.toUpperCase()}`, `door window rail ${tag}`, M(B(0.02, 0.03, 0.52, [0, 0, 0], 0.001)), [side * 1.289, 2.28 + dy, 0.62]);
    }
    for (const dy of [-0.68, 0.62]) {
      plate(`door_seal_${tag}_${dy > 0 ? "t" : "b"}`, `舱门密封条 ${tag.toUpperCase()}`, `door seal ${tag}`, M(B(0.025, 0.03, 1.14, [0, 0, 0], 0.001)), [side * 1.29, 1.95 + dy, 0.55], undefined, "cv_rubber");
    }
    for (const dz of [0.35, 0.72]) {
      plate(`step_br_${tag}_${dz > 0.5 ? "r" : "f"}`, `登机踏步支架 ${tag.toUpperCase()}`, `step bracket ${tag}`, M(B(0.12, 0.05, 0.05, [0, 0, 0], 0.002)), [side * 1.45, 1.04, dz]);
    }
    for (const [i, y] of [1.65, 2.55].entries()) {
      plate(`grab_${tag}_${i + 1}`, `登机扶手 ${tag.toUpperCase()}${i + 1}`, `grab handle ${tag} ${i + 1}`, M(C(0.018, 0.24, [0, 0, 0], 8)), [side * 1.33, y, 1.0]);
    }
    for (let w = 0; w < 2; w++) {
      const z = 1.05 + w * 1.25;
      for (const dz of [-0.44, 0.44]) {
        plate(`win_frame_v_${tag}_${w}_${dz > 0 ? "f" : "a"}`, `舷窗立柱 ${tag.toUpperCase()}`, `window frame ${tag}`, M(B(0.02, 0.55, 0.03, [0, 0, 0], 0.001)), [side * 1.265, 2.62, z + dz]);
      }
      for (const dy of [-0.26, 0.26]) {
        plate(`win_frame_h_${tag}_${w}_${dy > 0 ? "t" : "b"}`, `舷窗横框 ${tag.toUpperCase()}`, `window sill ${tag}`, M(B(0.02, 0.03, 0.92, [0, 0, 0], 0.001)), [side * 1.265, 2.62 + dy, z]);
      }
      plate(`win_vent_${tag}_${w}`, `舷窗滑窗 ${tag.toUpperCase()}`, `window vent ${tag}`, M(B(0.015, 0.3, 0.18, [0, 0, 0], 0.001)), [side * 1.272, 2.62, z - 0.14], undefined, "cv_glass");
    }
  }
  // 风挡框/雨刷/后视镜
  plate("ws_top", "风挡上框", "windshield top frame", M(B(1.94, 0.05, 0.06, [0, 0, 0], 0.001)), [0, 3.04, 4.02]);
  plate("ws_bottom", "风挡下框", "windshield bottom frame", M(B(1.94, 0.05, 0.06, [0, 0, 0], 0.001)), [0, 2.32, 4.12]);
  plate("ws_post", "风挡中柱", "windshield center post", M(B(0.05, 0.72, 0.06, [0, 0, 0], 0.001)), [0, 2.68, 4.08]);
  for (const side of [-1, 1] as const) {
    const tag = side === -1 ? "l" : "r";
    plate(`wiper_arm_${tag}`, `雨刷臂 ${tag.toUpperCase()}`, `wiper arm ${tag}`, M({ type: "weld", from: [side * 0.52, 2.35, 4.16], to: [side * 0.16, 2.72, 4.15], radius: 0.012 }), [0, 0, 0], undefined, "cv_steel");
    plate(`wiper_blade_${tag}`, `雨刷片 ${tag.toUpperCase()}`, `wiper blade ${tag}`, M(B(0.05, 0.38, 0.02, [0, 0, 0], 0.001)), [side * 0.16, 2.55, 4.16], [0, 0, side * 28], "cv_rubber");
    plate(`mirror_${tag}`, `后视镜 ${tag.toUpperCase()}`, `mirror ${tag}`, M(B(0.08, 0.12, 0.05, [0, 0, 0], 0.004), C(0.015, 0.18, [0, -0.1, 0], 6)), [side * 1.1, 2.95, 4.0], undefined, "cv_glass");
    plate(`defog_${tag}`, `风挡除雾口 ${tag.toUpperCase()}`, `defog vent ${tag}`, M(B(0.2, 0.03, 0.05, [0, 0, 0], 0.001)), [side * 0.7, 2.36, 4.12]);
  }

  // ---------------- 3. 主旋翼细节 ----------------
  if (!folded) {
    for (let i = 0; i < 5; i++) {
      const angle = (360 / 5) * i;
      const rot: [number, number, number] = [0, angle, 0];
      plate(`blade_le_${i + 1}`, `桨叶前缘包条 ${i + 1}`, `blade leading edge ${i + 1}`, M(B(6.4, 0.03, 0.04, [3.9, 0.08, 0.3], 0.001)), [0, 0, 0], rot, "cv_steel", mainRotor);
      plate(`blade_te_${i + 1}`, `桨叶后缘条 ${i + 1}`, `blade trailing edge ${i + 1}`, M(B(6.4, 0.025, 0.03, [3.9, 0, -0.315], 0.001)), [0, 0, 0], rot, "cv_aircraft_dark", mainRotor);
      plate(`blade_tip_cap_${i + 1}`, `桨尖帽 ${i + 1}`, `blade tip cap ${i + 1}`, M(B(0.08, 0.11, 0.6, [7.5, 0, 0], 0.002)), [0, 0, 0], rot, "cv_aircraft_dark", mainRotor);
      plate(`blade_cuff_${i + 1}`, `桨叶根部套 ${i + 1}`, `blade root cuff ${i + 1}`, M(B(0.6, 0.16, 0.68, [0.86, 0, 0], 0.003)), [0, 0, 0], rot, "cv_steel_dark", mainRotor);
      for (const [bi, dz] of [-0.2, 0, 0.2].entries()) {
        plate(`blade_bolt_${i + 1}_${bi + 1}`, `桨叶螺栓 ${i + 1}`, `blade bolt ${i + 1}`, M(C(0.035, 0.16, [0.86, 0, dz], 8)), [0, 0, 0], rot, "cv_steel", mainRotor);
      }
      plate(`blade_horn_${i + 1}`, `变距摇臂 ${i + 1}`, `pitch horn ${i + 1}`, M(B(0.16, 0.08, 0.12, [0.55, 0.12, 0.28], 0.002)), [0, 0, 0], rot, "cv_steel", mainRotor);
      plate(`blade_reflector_${i + 1}`, `桨尖反光片 ${i + 1}`, `blade reflector ${i + 1}`, M(B(0.09, 0.015, 0.07, [7.32, 0.075, 0.18], 0.001)), [0, 0, 0], rot, "cv_deck_line", mainRotor);
      rivet(`blade_${i + 1}_a`, [2.4, 0.075, 0.26], mainRotor);
      rivet(`blade_${i + 1}_b`, [5.2, 0.075, 0.26], mainRotor);
    }
    for (let i = 0; i < 5; i++) {
      const angle = (360 / 5) * i;
      const rad = deg(angle);
      plate(`hub_arm_${i + 1}`, `桨毂臂 ${i + 1}`, `hub arm ${i + 1}`, M(B(0.65, 0.12, 0.16, [0.5, 0, 0], 0.002)), [0, 4.35, 0.6], [0, angle, 0], "cv_steel");
      plate(`hub_damper_${i + 1}`, `桨毂减摆器 ${i + 1}`, `hub damper ${i + 1}`, M({ type: "weld", from: [0.6, 0, 0.16], to: [1.0, 0, 0.16], radius: 0.04 }), [0, 4.35, 0.6], [0, angle, 0], "cv_steel_dark");
      plate(`hub_pitchlink_${i + 1}`, `变距拉杆 ${i + 1}`, `pitch link ${i + 1}`, M({ type: "weld", from: [0.22, 0.1, 0.12], to: [0.55, 0.34, 0.28], radius: 0.025 }), [0, 4.35, 0.6], [0, angle, 0], "cv_steel");
      plate(`hub_fold_hinge_${i + 1}`, `桨叶折叠铰 ${i + 1}`, `blade fold hinge ${i + 1}`, M(C(0.045, 0.14, [0.42, 0.08, 0], 8)), [0, 4.35, 0.6], [0, angle, 0], "cv_steel_dark");
      void rad;
    }
    for (let a = 0; a < 3; a++) {
      const angle = 120 * a;
      plate(`swash_servo_${a + 1}`, `自动倾斜器伺服 ${a + 1}`, `swashplate servo ${a + 1}`, M(C(0.08, 0.34, [0.34, 0, 0], 10), { type: "weld", from: [0.34, 0.16, 0], to: [0.48, 0.4, 0], radius: 0.018 }), [0, 4.0, 0.6], [0, angle, 0], "cv_steel_dark");
    }
    plate("swash_scissor_a", "旋转剪刀撑 1", "rotating scissors 1", M({ type: "weld", from: [-0.16, 4.15, 0.6], to: [-0.34, 4.42, 0.6], radius: 0.02 }), [0, 0, 0], undefined, "cv_steel");
    plate("swash_scissor_b", "旋转剪刀撑 2", "rotating scissors 2", M({ type: "weld", from: [-0.34, 4.42, 0.6], to: [-0.16, 4.58, 0.6], radius: 0.02 }), [0, 0, 0], undefined, "cv_steel");
    plate("hub_cap", "桨毂整流帽", "hub cap", M(S(0.28, [0, 4.62, 0.6], 14)), [0, 0, 0], undefined, "cv_aircraft_dark");
    for (let b = 0; b < 4; b++) {
      const a = (Math.PI * 2 * b) / 4;
      plate(`hub_cap_bolt_${b + 1}`, `桨毂帽螺栓 ${b + 1}`, `hub cap bolt ${b + 1}`, M(C(0.035, 0.08, [0, 0, 0], 8)), [Math.cos(a) * 0.2, 4.58, 0.6 + Math.sin(a) * 0.2], undefined, "cv_steel");
    }
  } else {
    for (let i = 0; i < 5; i++) {
      const x = -1.0 + i * 0.5;
      plate(`fold_clamp_a_${i + 1}`, `折叠桨叶前夹 ${i + 1}`, `fold clamp front ${i + 1}`, M(B(0.62, 0.05, 0.08, [x, 3.73, 0.5], 0.002)), [0, 0, 0], undefined, "cv_steel_dark");
      plate(`fold_clamp_b_${i + 1}`, `折叠桨叶后夹 ${i + 1}`, `fold clamp rear ${i + 1}`, M(B(0.62, 0.05, 0.08, [x, 3.73, -4.5], 0.002)), [0, 0, 0], undefined, "cv_steel_dark");
      plate(`fold_strap_${i + 1}`, `折叠桨叶绑带 ${i + 1}`, `fold strap ${i + 1}`, M(B(0.64, 0.03, 0.05, [x, 3.72, -2.0], 0.002)), [0, 0, 0], undefined, "cv_deck_line");
    }
    plate("fold_rack_strap_l", "折叠桨叶托架绑带 左", "fold rack strap l", M(B(0.06, 0.04, 2.4, [-1.2, 3.55, 1.2], 0.002)), [0, 0, 0], undefined, "cv_deck_line");
    plate("fold_rack_strap_r", "折叠桨叶托架绑带 右", "fold rack strap r", M(B(0.06, 0.04, 2.4, [1.2, 3.55, 1.2], 0.002)), [0, 0, 0], undefined, "cv_deck_line");
    for (const side of [-1, 1] as const) {
      plate(`fold_tie_${side === -1 ? "l" : "r"}`, `折叠桨叶系留环 ${side === -1 ? "左" : "右"}`, `fold tie ring`, M(T(0.06, 0.035, 0.02, [0, 0, 0], 10)), [side * 1.2, 3.6, 0.4], undefined, "cv_steel");
    }
  }
  // 旋翼轴整流罩分板
  for (let i = 0; i < 4; i++) {
    const a = 90 * i;
    plate(`mast_fairing_${i + 1}`, `旋翼轴整流罩 ${i + 1}`, `mast fairing ${i + 1}`, M(B(0.18, 0.42, 0.03, [0, 0, 0.2], 0.002)), [0, 4.0, 0.6], [0, a, 0], "cv_aircraft_dark");
  }
  for (let b = 0; b < 8; b++) {
    const a = (Math.PI * 2 * b) / 8;
    plate(`mast_fairing_bolt_${b + 1}`, `旋翼轴整流罩螺栓 ${b + 1}`, `mast fairing bolt ${b + 1}`, M(C(0.022, 0.06, [0, 0, 0], 6)), [Math.cos(a) * 0.22, 4.22, 0.6 + Math.sin(a) * 0.22], undefined, "cv_steel");
  }

  // ---------------- 4. 发动机/短舱 ----------------
  for (const side of [-1, 1] as const) {
    const tag = side === -1 ? "l" : "r";
    const ex = side * 0.82;
    plate(`intake_lip_${tag}`, `进气口唇圈 ${tag.toUpperCase()}`, `intake lip ${tag}`, M(T(0.37, 0.31, 0.08, [0, 0, 0], 16)), [ex, 3.45, 2.28], [90, 0, 0], "cv_aircraft_dark");
    for (let b = 0; b < 3; b++) {
      plate(`fod_h_${tag}_${b + 1}`, `进气道防异物横杆 ${tag.toUpperCase()}${b + 1}`, `FOD bar ${tag}`, M(B(0.58, 0.018, 0.018, [0, 0, 0], 0.001)), [ex, 3.33 + b * 0.12, 2.29], undefined, "cv_steel");
      plate(`fod_v_${tag}_${b + 1}`, `进气道防异物竖杆 ${tag.toUpperCase()}${b + 1}`, `FOD post ${tag}`, M(B(0.018, 0.58, 0.018, [0, 0, 0], 0.001)), [ex - 0.12 + b * 0.12, 3.45, 2.29], undefined, "cv_steel");
    }
    for (let c = 0; c < 3; c++) {
      for (let s = 0; s < 2; s++) {
        plate(`cowl_${tag}_${c + 1}_${s + 1}`, `发动机罩板 ${tag.toUpperCase()}${c + 1}-${s + 1}`, `cowl panel ${tag}`, M(B(0.46, 0.014, 0.42, [0, 0, 0], 0.001)), [ex - 0.26 + s * 0.52, 3.615, 0.9 + c * 0.5], undefined, s === 0 ? "cv_aircraft" : "cv_aircraft_dark");
        plate(`cowl_latch_${tag}_${c + 1}_${s + 1}`, `发动机罩锁扣 ${tag.toUpperCase()}${c + 1}-${s + 1}`, `cowl latch ${tag}`, M(B(0.06, 0.03, 0.04, [0, 0, 0], 0.001)), [ex - 0.44 + s * 0.88, 3.625, 0.9 + c * 0.5], undefined, "cv_steel");
      }
    }
    for (let p = 0; p < 8; p++) {
      const a = (Math.PI * 2 * p) / 8;
      plate(`exhaust_petal_${tag}_${p + 1}`, `排气口隔热片 ${tag.toUpperCase()}${p + 1}`, `exhaust petal ${tag}`, M(B(0.09, 0.04, 0.16, [0, 0, 0], 0.001)), [ex + Math.cos(a) * 0.32, 3.4 + Math.sin(a) * 0.32, -1.24], [0, 0, (a * 180) / Math.PI - 90], "cv_steel_dark");
    }
    plate(`drain_a_${tag}`, `发动机舱排水管 ${tag.toUpperCase()}1`, `engine drain ${tag}`, M({ type: "weld", from: [ex, 3.15, 1.4], to: [ex, 3.02, 0.9], radius: 0.015 }), [0, 0, 0], undefined, "cv_steel");
    plate(`drain_b_${tag}`, `发动机舱排水管 ${tag.toUpperCase()}2`, `engine drain ${tag}`, M({ type: "weld", from: [ex, 3.12, 0.2], to: [ex, 3.0, -0.2], radius: 0.015 }), [0, 0, 0], undefined, "cv_steel");
    plate(`oil_cooler_${tag}`, `滑油冷却器格栅 ${tag.toUpperCase()}`, `oil cooler grille ${tag}`, M(B(0.28, 0.015, 0.18, [0, 0, 0], 0.001)), [ex, 3.62, 0.55], undefined, "cv_steel_dark");
    for (const dz of [1.1, 1.9]) {
      plate(`mount_${tag}_${dz > 1.5 ? "r" : "f"}`, `发动机安装撑杆 ${tag.toUpperCase()}`, `engine mount ${tag}`, M({ type: "weld", from: [ex, 3.18, dz], to: [ex + side * 0.26, 2.96, dz], radius: 0.03 }), [0, 0, 0], undefined, "cv_steel_dark");
    }
    plate(`fire_bottle_${tag}`, `发动机灭火瓶 ${tag.toUpperCase()}`, `engine fire bottle ${tag}`, M(C(0.07, 0.3, [0, 0, 0], 10)), [ex, 3.08, 0.05], undefined, "cv_deck_red");
    plate(`hyd_line_${tag}`, `发动机液压管 ${tag.toUpperCase()}`, `engine hydraulic line ${tag}`, M({ type: "weld", from: [ex + side * 0.18, 3.16, 1.2], to: [ex + side * 0.18, 3.16, -0.9], radius: 0.012 }), [0, 0, 0], undefined, "cv_steel");
    plate(`oil_filler_${tag}`, `滑油加油口 ${tag.toUpperCase()}`, `oil filler ${tag}`, M(C(0.05, 0.03, [0, 0, 0], 10)), [ex + side * 0.18, 3.625, 1.2], undefined, "cv_brass");
    plate(`engine_handle_${tag}`, `发动机舱门把手 ${tag.toUpperCase()}`, `engine access handle ${tag}`, M(B(0.12, 0.03, 0.04, [0, 0, 0], 0.002)), [ex + side * 0.3, 3.63, 2.0], undefined, "cv_steel");
  }

  // ---------------- 5. 尾部 ----------------
  for (let i = 0; i < 4; i++) {
    const rot: [number, number, number] = [90 * i, 0, 0];
    plate(`tail_blade_le_${i + 1}`, `尾桨前缘条 ${i + 1}`, `tail blade leading edge ${i + 1}`, M(B(0.14, 0.025, 1.9, [0, 0.095, 1.25], 0.001)), [0, 0, 0], rot, "cv_steel", tailRotor);
    plate(`tail_blade_tip_${i + 1}`, `尾桨尖帽 ${i + 1}`, `tail blade tip ${i + 1}`, M(B(0.14, 0.18, 0.12, [0, 0, 2.3], 0.001)), [0, 0, 0], rot, "cv_aircraft_dark", tailRotor);
    plate(`tail_blade_bolt_${i + 1}`, `尾桨螺栓 ${i + 1}`, `tail blade bolt ${i + 1}`, M(C(0.03, 0.14, [0, 0, 0.35], 8)), [0, 0, 0], rot, "cv_steel", tailRotor);
    plate(`tail_pitch_link_${i + 1}`, `尾桨变距拉杆 ${i + 1}`, `tail pitch link ${i + 1}`, M({ type: "weld", from: [0, 0, 0.42], to: [0.14, 0.16, 0.65], radius: 0.018 }), [0, 0, 0], rot, "cv_steel", tailRotor);
  }
  for (const dz of [-0.06, 0.06]) {
    plate(`tail_hub_plate_${dz > 0 ? "f" : "a"}`, `尾桨毂盘`, `tail hub plate`, M(T(0.16, 0.09, 0.04, [0, 0, dz], 12)), [0, 0, 0], undefined, "cv_steel", tailRotor);
  }
  for (let b = 0; b < 4; b++) {
    const a = (Math.PI * 2 * b) / 4;
    plate(`tail_hub_bolt_${b + 1}`, `尾桨毂螺栓 ${b + 1}`, `tail hub bolt ${b + 1}`, M(C(0.022, 0.08, [0, 0, 0], 6)), [Math.cos(a) * 0.1, Math.sin(a) * 0.1, 0.08], undefined, "cv_steel", tailRotor);
  }
  plate("tail_hub_cap", "尾桨毂帽", "tail hub cap", M(S(0.1, [0, 0, 0], 10)), [0, 0, 0.13], undefined, "cv_aircraft_dark", tailRotor);
  for (let b = 0; b < 6; b++) {
    const a = (Math.PI * 2 * b) / 6;
    plate(`tail_gb_bolt_${b + 1}`, `尾减速器螺栓 ${b + 1}`, `tail gearbox bolt ${b + 1}`, M(C(0.025, 0.06, [0, 0, 0], 6)), [-0.22 + Math.cos(a) * 0.2, 3.0 + Math.sin(a) * 0.2, -10.0], undefined, "cv_steel");
  }
  for (let f = 0; f < 4; f++) {
    plate(`tail_gb_fin_${f + 1}`, `尾减速器散热片 ${f + 1}`, `tail gearbox fin ${f + 1}`, M(B(0.03, 0.2, 0.24, [0, 0, 0], 0.001)), [-0.06 + f * 0.04, 3.25, -10.1], undefined, "cv_steel_dark");
  }
  plate("tail_gb_cap", "尾减速器加油口", "tail gearbox cap", M(C(0.05, 0.03, [0, 0, 0], 8)), [-0.22, 3.3, -10.05], undefined, "cv_brass");
  plate("tail_gb_sight", "尾减速器油位窗", "tail gearbox sight", M(C(0.035, 0.02, [0, 0, 0], 8)), [-0.4, 3.0, -9.85], undefined, "cv_glass");
  plate("tail_ctrl_a", "尾桨操纵杆 1", "tail control rod 1", M({ type: "weld", from: [0, 2.8, -9.4], to: [0.15, 2.98, -10.0], radius: 0.018 }), [0, 0, 0], undefined, "cv_steel");
  plate("tail_ctrl_b", "尾桨操纵杆 2", "tail control rod 2", M({ type: "weld", from: [0.12, 2.78, -9.4], to: [0.12, 2.96, -10.0], radius: 0.018 }), [0, 0, 0], undefined, "cv_steel");
  for (let s = 0; s < 4; s++) {
    const z0 = -3.3 - s * 1.5;
    plate(`drive_shaft_${s + 1}`, `尾传动轴 ${s + 1}`, `tail drive shaft ${s + 1}`, M({ type: "weld", from: [0, 2.62, z0], to: [0, 2.62, z0 - 1.3], radius: 0.035 }), [0, 0, 0], undefined, "cv_steel");
  }
  for (let c = 0; c < 3; c++) {
    plate(`drive_coupling_${c + 1}`, `尾传动联轴节 ${c + 1}`, `drive coupling ${c + 1}`, M(C(0.06, 0.1, [0, 0, 0], 10)), [0, 2.62, -4.6 - c * 1.5], [0, 0, 90], "cv_steel_dark");
    plate(`drive_hanger_${c + 1}`, `尾传动吊架 ${c + 1}`, `drive hanger ${c + 1}`, M(B(0.12, 0.2, 0.05, [0, 0, 0], 0.002)), [0, 2.5, -4.6 - c * 1.5], undefined, "cv_steel_dark");
  }
  plate("drive_bearing", "尾传动中轴承", "drive bearing", M(C(0.07, 0.08, [0, 0, 0], 10)), [0, 2.62, -6.0], [0, 0, 90], "cv_steel");
  for (let r = 0; r < 6; r++) {
    plate(`boom_ring_${r + 1}`, `尾梁加强环 ${r + 1}`, `tail boom ring ${r + 1}`, M({ type: "torus", radius: 0.37, tube: 0.022, radialSegments: 8, tubularSegments: 18, at: [0, 2.45, -3.2 - r * 0.95] }), [0, 0, 0], undefined, "cv_steel");
  }
  for (let c = 0; c < 4; c++) {
    plate(`boom_clamp_${c + 1}`, `尾梁电缆卡箍 ${c + 1}`, `boom cable clamp ${c + 1}`, M(B(0.12, 0.04, 0.05, [0, 0, 0], 0.001)), [0.0, 2.82, -3.8 - c * 1.1], undefined, "cv_steel_dark");
  }
  for (const side of [-1, 1] as const) {
    plate(`boom_antenna_${side === -1 ? "l" : "r"}`, `尾梁刀形天线 ${side === -1 ? "左" : "右"}`, `boom antenna ${side === -1 ? "l" : "r"}`, M(C(0.02, 0.45, [0, 0, 0], 6)), [side * 0.18, 2.92, -6.6], undefined, "cv_steel_dark");
  }
  // 垂尾细节
  for (let r = 0; r < 6; r++) {
    plate(`fin_rib_${r + 1}`, `垂尾翼肋 ${r + 1}`, `fin rib ${r + 1}`, M(B(0.03, 0.5, 0.12, [0, 0, 0], 0.001)), [0, 2.45 + r * 0.32, -9.6], undefined, "cv_aircraft_dark");
  }
  for (let r = 0; r < 4; r++) {
    rivet(`fin_${r + 1}`, [0.12, 2.5 + r * 0.4, -9.4]);
  }
  for (const side of [-1, 1] as const) {
    plate(`fin_light_${side === -1 ? "l" : "r"}`, `垂尾航行灯 ${side === -1 ? "左" : "右"}`, `fin formation light ${side === -1 ? "l" : "r"}`, M(B(0.04, 0.16, 0.1, [0, 0, 0], 0.002)), [side * 0.12, 3.6, -10.1], undefined, side === -1 ? "cv_deck_red" : "cv_glow");
    plate(`fin_antenna_${side === -1 ? "l" : "r"}`, `垂尾天线 ${side === -1 ? "左" : "右"}`, `fin antenna ${side === -1 ? "l" : "r"}`, M(C(0.02, 0.35, [0, 0, 0], 6)), [side * 0.12, 4.1, -10.2], undefined, "cv_steel_dark");
  }
  plate("tail_light", "尾灯", "tail light", M(S(0.055, [0, 0, 0], 8)), [0, 3.4, -10.28], undefined, "cv_glow");
  plate("serial_plate", "出厂序号牌", "serial plate", M(B(0.3, 0.1, 0.01, [0, 0, 0], 0.001)), [0.13, 3.15, -9.4], undefined, "cv_deck_line");
  // 平尾细节
  for (const side of [-1, 1] as const) {
    plate(`stab_endplate_${side === -1 ? "l" : "r"}`, `平尾端板 ${side === -1 ? "左" : "右"}`, `stabilizer endplate ${side === -1 ? "l" : "r"}`, M(B(0.05, 0.3, 0.7, [0, 0, 0], 0.002)), [side * 1.62, 2.55, -9.0], undefined, "cv_aircraft_dark");
    for (let r = 0; r < 2; r++) {
      plate(`stab_rib_${side === -1 ? "l" : "r"}_${r + 1}`, `平尾翼肋 ${side === -1 ? "左" : "右"}${r + 1}`, `stabilizer rib ${side === -1 ? "l" : "r"}`, M(B(0.03, 0.16, 0.5, [0, 0, 0], 0.001)), [side * (0.5 + r * 0.5), 2.55, -9.0], undefined, "cv_aircraft_dark");
      rivet(`stab_${side === -1 ? "l" : "r"}_${r + 1}`, [side * (0.5 + r * 0.5), 2.63, -9.0]);
    }
  }

  // ---------------- 6. 起落架 ----------------
  for (const side of [-1, 1] as const) {
    const tag = side === -1 ? "l" : "r";
    const gx = side * 1.15;
    for (const dz of [-0.1, 0.1]) {
      plate(`gear_fork_${tag}_${dz > 0 ? "r" : "f"}`, `主起落架叉臂 ${tag.toUpperCase()}`, `main gear fork ${tag}`, M(B(0.05, 0.5, 0.09, [0, 0, 0], 0.003)), [gx, 0.72, 1.55 + dz], undefined, "cv_steel_dark");
    }
    plate(`gear_axle_${tag}`, `主轮轴 ${tag.toUpperCase()}`, `main axle ${tag}`, M(C(0.05, 0.34, [0, 0, 0], 10)), [gx, 0.36, 1.55], [0, 0, 90], "cv_steel");
    plate(`brake_caliper_${tag}`, `刹车卡钳 ${tag.toUpperCase()}`, `brake caliper ${tag}`, M(B(0.1, 0.14, 0.08, [0, 0, 0], 0.003)), [gx + side * 0.14, 0.4, 1.55], undefined, "cv_steel_dark");
    plate(`brake_line_${tag}`, `刹车油管 ${tag.toUpperCase()}`, `brake line ${tag}`, M({ type: "weld", from: [gx + side * 0.14, 0.46, 1.55], to: [gx + side * 0.06, 1.0, 1.5], radius: 0.012 }), [0, 0, 0], undefined, "cv_rubber");
    for (const dz of [-0.12, 0.12]) {
      plate(`torque_link_${tag}_${dz > 0 ? "r" : "f"}`, `扭力臂 ${tag.toUpperCase()}`, `torque link ${tag}`, M({ type: "weld", from: [gx, 0.55, 1.55 + dz], to: [gx + side * 0.08, 0.82, 1.55], radius: 0.018 }), [0, 0, 0], undefined, "cv_steel");
    }
    for (const dy of [0.74, 0.95]) {
      plate(`oleo_${tag}_${dy > 0.8 ? "u" : "l"}`, `减震支柱套 ${tag.toUpperCase()}`, `oleo sleeve ${tag}`, M(C(0.088, 0.24, [0, 0, 0], 10)), [gx, dy, 1.55], undefined, "cv_steel");
    }
    plate(`scissor_${tag}`, `起落架剪臂 ${tag.toUpperCase()}`, `gear scissor ${tag}`, M(B(0.08, 0.16, 0.04, [0, 0, 0], 0.002)), [gx + side * 0.09, 0.62, 1.55], [0, 0, side * 25], "cv_steel_dark");
    plate(`wheel_hub_${tag}`, `主轮毂 ${tag.toUpperCase()}`, `wheel hub ${tag}`, M(C(0.16, 0.3, [0, 0, 0], 12)), [gx, 0.36, 1.55], [0, 0, 90], "cv_steel");
    plate(`wheel_valve_${tag}`, `轮胎气门 ${tag.toUpperCase()}`, `tire valve ${tag}`, M(C(0.025, 0.06, [0, 0, 0], 6)), [gx + side * 0.18, 0.36, 1.62], [0, 0, 90], "cv_brass");
    plate(`mudguard_${tag}`, `轮舱挡泥板 ${tag.toUpperCase()}`, `mudguard ${tag}`, M(B(0.3, 0.03, 0.5, [0, 0, 0], 0.003)), [gx, 0.78, 1.55], undefined, "cv_aircraft_dark");
    plate(`ground_tie_${tag}`, `起落架系留环 ${tag.toUpperCase()}`, `ground tie ring ${tag}`, M(T(0.06, 0.035, 0.02, [0, 0, 0], 10)), [gx + side * 0.2, 0.12, 1.55], undefined, "cv_steel");
  }
  plate("tail_gear_fork_a", "尾轮叉臂 1", "tail gear fork 1", M(B(0.05, 0.32, 0.08, [0, 0, 0], 0.002)), [-0.12, 0.46, -8.35], undefined, "cv_steel_dark");
  plate("tail_gear_fork_b", "尾轮叉臂 2", "tail gear fork 2", M(B(0.05, 0.32, 0.08, [0, 0, 0], 0.002)), [0.12, 0.46, -8.35], undefined, "cv_steel_dark");
  plate("tail_gear_axle", "尾轮轴", "tail axle", M(C(0.04, 0.28, [0, 0, 0], 8)), [0, 0.3, -8.35], [0, 0, 90], "cv_steel");
  plate("tail_gear_hub", "尾轮毂", "tail hub", M(C(0.12, 0.22, [0, 0, 0], 10)), [0, 0.3, -8.35], [0, 0, 90], "cv_steel");
  plate("tail_gear_sleeve", "尾轮减震套", "tail oleo sleeve", M(C(0.07, 0.3, [0, 0, 0], 8)), [0, 0.9, -8.45], undefined, "cv_steel");
  plate("tail_gear_brace", "尾轮撑杆", "tail drag brace", M({ type: "weld", from: [0, 1.75, -8.5], to: [0.18, 0.5, -8.35], radius: 0.03 }), [0, 0, 0], undefined, "cv_steel_dark");
  plate("tail_gear_lock", "尾轮锁连杆", "tail lock link", M({ type: "weld", from: [0, 1.3, -8.4], to: [0.12, 0.9, -8.4], radius: 0.02 }), [0, 0, 0], undefined, "cv_steel");
  plate("tail_gear_light", "尾轮照明灯", "tail gear light", M(S(0.04, [0, 0, 0], 8)), [0, 1.9, -8.6], undefined, "cv_glow");
  for (const side of [-1, 1] as const) {
    plate(`jack_point_${side === -1 ? "l" : "r"}`, `顶升点 ${side === -1 ? "左" : "右"}`, `jack point ${side === -1 ? "l" : "r"}`, M(B(0.12, 0.03, 0.12, [0, 0, 0], 0.002)), [side * 0.7, 0.84, 0.2], undefined, "cv_warning");
    plate(`tie_down_${side === -1 ? "l" : "r"}`, `地面系留环 ${side === -1 ? "左" : "右"}`, `tie down ${side === -1 ? "l" : "r"}`, M(T(0.06, 0.035, 0.02, [0, 0, 0], 10)), [side * 0.95, 0.84, -1.5], undefined, "cv_steel");
  }

  // ---------------- 7. 任务设备 ----------------
  plate("sonar_ring", "吊放声呐舱口环", "sonar bay ring", M(T(0.6, 0.48, 0.07, [0, 0, 0], 18)), [0, 0.9, 0.6], undefined, "cv_steel");
  for (let b = 0; b < 4; b++) {
    const a = (Math.PI * 2 * b) / 4;
    plate(`sonar_bolt_${b + 1}`, `声呐舱口螺栓 ${b + 1}`, `sonar bay bolt ${b + 1}`, M(C(0.035, 0.05, [0, 0, 0], 6)), [Math.cos(a) * 0.52, 0.9, 0.6 + Math.sin(a) * 0.52], undefined, "cv_steel");
  }
  plate("sonar_reel", "声呐缆绞盘", "sonar cable reel", M(C(0.1, 0.2, [0, 0, 0], 12)), [0, 0.55, 0.6], [0, 0, 90], "cv_steel_dark");
  plate("sonar_sheave", "声呐导缆滑轮", "sonar sheave", M(T(0.12, 0.08, 0.04, [0, 0, 0], 12)), [0, 0.5, 0.75], [90, 0, 0], "cv_steel");
  for (const dz of [0.55, 0.75]) {
    plate(`sonar_cable_${dz > 0.65 ? "f" : "a"}`, "声呐吊缆", "sonar cable", M({ type: "weld", from: [0, 0.55, dz], to: [0, 0.1, dz], radius: 0.012 }), [0, 0, 0], undefined, "cv_steel");
  }
  plate("sonar_body", "吊放声呐体", "dipping sonar body", M(C(0.26, 0.6, [0, 0, 0], 14)), [0, 0.25, 0.6], undefined, "cv_steel_dark");
  for (let f = 0; f < 4; f++) {
    const a = (Math.PI * 2 * f) / 4;
    plate(`sonar_fin_${f + 1}`, `声呐稳定鳍 ${f + 1}`, `sonar fin ${f + 1}`, M(B(0.2, 0.2, 0.03, [0, 0, 0], 0.002)), [Math.cos(a) * 0.3, 0.25, 0.6 + Math.sin(a) * 0.3], [0, (a * 180) / Math.PI, 0], "cv_steel_dark");
  }
  for (const side of [-1, 1] as const) {
    const tag = side === -1 ? "l" : "r";
    for (let t = 0; t < 6; t++) {
      const dx = -0.1 + (t % 3) * 0.12;
      const dy = 1.3 + Math.floor(t / 3) * 0.2;
      plate(`sonobuoy_tube_${tag}_${t + 1}`, `声呐浮标发射管 ${tag.toUpperCase()}${t + 1}`, `sonobuoy tube ${tag} ${t + 1}`, M(C(0.045, 0.04, [0, 0, 0], 8)), [side * 1.25 + dx, dy, -1.79], [90, 0, 0], "cv_steel_dark");
      plate(`sonobuoy_cap_${tag}_${t + 1}`, `声呐浮标管盖 ${tag.toUpperCase()}${t + 1}`, `sonobuoy cap ${tag} ${t + 1}`, M(C(0.05, 0.015, [0, 0, 0], 8)), [side * 1.25 + dx, dy, -1.81], [90, 0, 0], "cv_warning");
    }
    plate(`sonobuoy_ctrl_${tag}`, `声呐浮标控制盒 ${tag.toUpperCase()}`, `sonobuoy control ${tag}`, M(B(0.2, 0.15, 0.1, [0, 0, 0], 0.003)), [side * 1.25, 1.7, -0.9], undefined, "cv_055_console");
    plate(`sonobuoy_hinge_${tag}`, `声呐浮标舱铰链 ${tag.toUpperCase()}`, `sonobuoy hinge ${tag}`, M(C(0.025, 0.2, [0, 0, 0], 6)), [side * 1.4, 1.5, -1.7], undefined, "cv_steel");
    plate(`torp_nose_${tag}`, `鱼雷头罩 ${tag.toUpperCase()}`, `torpedo nose ${tag}`, M(S(0.16, [0, 0, 0], 12)), [side * 1.5, 0.82, 1.35], undefined, "cv_aircraft_dark");
    for (let f = 0; f < 4; f++) {
      const a = (Math.PI * 2 * f) / 4;
      plate(`torp_fin_${tag}_${f + 1}`, `鱼雷尾翼 ${tag.toUpperCase()}${f + 1}`, `torpedo fin ${tag} ${f + 1}`, M(B(0.16, 0.14, 0.03, [0, 0, 0], 0.002)), [side * 1.5 + Math.cos(a) * 0.18, 0.82 + Math.sin(a) * 0.18, -0.92], [0, 0, (a * 180) / Math.PI], "cv_steel_dark");
    }
    plate(`torp_prop_${tag}`, `鱼雷对转桨 ${tag.toUpperCase()}`, `torpedo propulsor ${tag}`, M(C(0.1, 0.05, [0, 0, 0], 10)), [side * 1.5, 0.82, -1.06], [90, 0, 0], "cv_brass");
    for (let b = 0; b < 3; b++) {
      plate(`torp_band_${tag}_${b + 1}`, `鱼雷识别带 ${tag.toUpperCase()}${b + 1}`, `torpedo band ${tag} ${b + 1}`, M(T(0.19, 0.17, 0.03, [0, 0, 0], 14)), [side * 1.5, 0.82, 0.7 - b * 0.7], [90, 0, 0], "cv_deck_line");
    }
    for (const dz of [-0.4, 0.5]) {
      plate(`torp_lug_${tag}_${dz > 0 ? "f" : "a"}`, `鱼雷挂点 ${tag.toUpperCase()}`, `torpedo lug ${tag}`, M(B(0.08, 0.06, 0.1, [0, 0, 0], 0.002)), [side * 1.5, 1.02, dz], undefined, "cv_steel");
    }
  }
  // FLIR
  plate("flir_housing", "光电转塔壳体", "FLIR housing", M(B(0.22, 0.2, 0.18, [0, 0, 0], 0.004)), [0, 1.62, 4.38], undefined, "cv_radar_dark");
  for (let l = 0; l < 3; l++) {
    plate(`flir_lens_${l + 1}`, `光电窗口 ${l + 1}`, `EO window ${l + 1}`, M(C(0.055, 0.02, [0, 0, 0], 10)), [-0.08 + l * 0.08, 1.62, 4.49], [90, 0, 0], l === 1 ? "cv_glass" : "cv_radar");
  }
  for (const dy of [1.55, 1.7]) {
    plate(`flir_gimbal_${dy > 1.6 ? "u" : "l"}`, "光电转塔环架", "FLIR gimbal ring", M(T(0.2, 0.16, 0.03, [0, 0, 0], 14)), [0, dy, 4.36], [90, 0, 0], "cv_steel_dark");
  }
  plate("flir_laser", "激光测距窗", "laser window", M(S(0.035, [0, 0, 0], 8)), [0.1, 1.56, 4.47], undefined, "cv_deck_red");
  plate("flir_servo", "光电转塔伺服", "FLIR servo", M(B(0.1, 0.12, 0.08, [0, 0, 0], 0.003)), [0, 1.74, 4.34], undefined, "cv_steel");
  for (let b = 0; b < 3; b++) {
    plate(`flir_bolt_${b + 1}`, `光电转塔螺栓 ${b + 1}`, `FLIR bolt ${b + 1}`, M(C(0.018, 0.04, [0, 0, 0], 6)), [-0.1 + b * 0.1, 1.76, 4.28], undefined, "cv_steel");
  }
  // 机鼻雷达罩/空速管/攻角传感器
  for (let b = 0; b < 6; b++) {
    const a = (Math.PI * 2 * b) / 6;
    plate(`radome_bolt_${b + 1}`, `雷达罩螺栓 ${b + 1}`, `radome bolt ${b + 1}`, M(C(0.02, 0.04, [0, 0, 0], 6)), [Math.cos(a) * 0.22, 2.9 + Math.sin(a) * 0.22, 4.12], [90, 0, 0], "cv_steel");
  }
  for (const side of [-1, 1] as const) {
    plate(`static_port_${side === -1 ? "l" : "r"}`, `静压孔 ${side === -1 ? "左" : "右"}`, `static port ${side === -1 ? "l" : "r"}`, M(C(0.018, 0.01, [0, 0, 0], 8)), [side * 0.98, 2.1, 3.4], [90, 0, 0], "cv_steel");
    plate(`aoa_${side === -1 ? "l" : "r"}`, `攻角传感器 ${side === -1 ? "左" : "右"}`, `AOA vane ${side === -1 ? "l" : "r"}`, M(B(0.03, 0.16, 0.06, [0, 0, 0], 0.002), { type: "weld", from: [0, 0.08, 0], to: [0, 0.14, 0.16], radius: 0.012 }), [side * 1.08, 2.55, 3.75], undefined, "cv_steel");
  }
  // 救援绞车
  plate("hoist_boom", "救援绞车吊臂", "rescue hoist boom", M(B(0.6, 0.08, 0.08, [0, 0, 0], 0.003)), [1.4, 3.5, 0.9], undefined, "cv_steel_dark");
  plate("hoist_cable", "救援绞车钢索", "rescue hoist cable", M({ type: "weld", from: [1.7, 3.45, 0.9], to: [1.7, 2.72, 0.9], radius: 0.01 }), [0, 0, 0], undefined, "cv_steel");
  plate("hoist_hook", "救援绞车吊钩", "rescue hoist hook", M(T(0.08, 0.05, 0.03, [0, 0, 0], 10)), [1.7, 2.64, 0.9], [90, 0, 0], "cv_steel");
  plate("hoist_drum", "救援绞车卷筒", "rescue hoist drum", M(C(0.08, 0.2, [0, 0, 0], 10)), [1.1, 3.3, 0.9], [0, 0, 90], "cv_steel_dark");
  for (let b = 0; b < 3; b++) {
    plate(`hoist_bolt_${b + 1}`, `救援绞车螺栓 ${b + 1}`, `hoist bolt ${b + 1}`, M(C(0.018, 0.04, [0, 0, 0], 6)), [1.12 + b * 0.08, 3.44, 0.9], undefined, "cv_steel");
  }
  plate("hoist_limit", "救援绞车限位开关", "hoist limit switch", M(B(0.08, 0.08, 0.06, [0, 0, 0], 0.002)), [1.5, 3.4, 0.82], undefined, "cv_055_console");
  // 干扰弹发射器
  for (const side of [-1, 1] as const) {
    const tag = side === -1 ? "l" : "r";
    plate(`chaff_housing_${tag}`, `干扰弹发射器 ${tag.toUpperCase()}`, `chaff dispenser ${tag}`, M(B(0.3, 0.25, 0.18, [0, 0, 0], 0.004)), [side * 1.1, 1.3, -1.8], undefined, "cv_aircraft_dark");
    for (let t = 0; t < 8; t++) {
      plate(`chaff_tube_${tag}_${t + 1}`, `干扰弹管 ${tag.toUpperCase()}${t + 1}`, `chaff tube ${tag} ${t + 1}`, M(C(0.035, 0.02, [0, 0, 0], 8)), [side * 1.1 - 0.09 + (t % 4) * 0.06, 1.22 + Math.floor(t / 4) * 0.09, -1.9], [90, 0, 0], "cv_warning");
    }
  }

  // ---------------- 8. 天线/传感器/灯光 ----------------
  const bladeAntennas: Array<[number, number, number, number]> = [
    [0, 3.62, -0.1, 0.5], [0, 0.84, 0.1, 0.4], [0.9, 3.62, 1.2, 0.35], [-0.9, 3.62, 1.2, 0.35],
  ];
  for (const [i, [x, y, z, h]] of bladeAntennas.entries()) {
    plate(`ant_blade_${i + 1}`, `刀形天线 ${i + 1}`, `blade antenna ${i + 1}`, M(B(0.04, h, 0.12, [0, 0, 0], 0.002)), [x, y + h / 2, z], undefined, "cv_aircraft_dark");
  }
  for (const side of [-1, 1] as const) {
    plate(`ant_whip_${side === -1 ? "l" : "r"}`, `鞭状天线 ${side === -1 ? "左" : "右"}`, `whip antenna ${side === -1 ? "l" : "r"}`, M(C(0.018, 0.7, [0, 0, 0], 6)), [side * 0.9, 3.62, -1.2], undefined, "cv_steel_dark");
    plate(`iff_dipole_${side === -1 ? "l" : "r"}`, `敌我识别振子 ${side === -1 ? "左" : "右"}`, `IFF dipole ${side === -1 ? "l" : "r"}`, M(B(0.03, 0.3, 0.03, [0, 0, 0], 0.001), B(0.03, 0.03, 0.2, [0, 0.12, 0], 0.001)), [side * 0.5, 0.95, -2.4], undefined, "cv_steel");
    plate(`gps_${side === -1 ? "l" : "r"}`, `卫导天线 ${side === -1 ? "左" : "右"}`, `GPS antenna ${side === -1 ? "l" : "r"}`, M(S(0.08, [0, 0, 0], 10)), [side * 0.55, 3.64, 0.4], undefined, "cv_radar");
    plate(`rwr_${side === -1 ? "l" : "r"}`, `雷达告警天线 ${side === -1 ? "左" : "右"}`, `RWR antenna ${side === -1 ? "l" : "r"}`, M(B(0.1, 0.12, 0.08, [0, 0, 0], 0.002)), [side * 1.1, 2.7, 4.0], undefined, "cv_radar_dark");
    plate(`maws_${side === -1 ? "l" : "r"}`, `导弹逼近告警 ${side === -1 ? "左" : "右"}`, `MAWS sensor ${side === -1 ? "l" : "r"}`, M(S(0.06, [0, 0, 0], 8)), [side * 1.16, 2.1, -1.2], undefined, "cv_radar_dark");
    plate(`laser_warn_${side === -1 ? "l" : "r"}`, `激光告警 ${side === -1 ? "左" : "右"}`, `laser warning ${side === -1 ? "l" : "r"}`, M(C(0.05, 0.03, [0, 0, 0], 8)), [side * 1.12, 1.8, 2.8], undefined, "cv_radar_dark");
    plate(`searchlight_${side === -1 ? "l" : "r"}`, `搜索灯 ${side === -1 ? "左" : "右"}`, `searchlight ${side === -1 ? "l" : "r"}`, M(C(0.09, 0.1, [0, 0, 0], 12), S(0.07, [0, -0.06, 0], 10)), [side * 0.7, 1.05, 3.85], [90, 0, 0], "cv_steel_dark");
    plate(`fm_${side === -1 ? "l" : "r"}`, `超短波天线 ${side === -1 ? "左" : "右"}`, `VHF antenna ${side === -1 ? "l" : "r"}`, M(C(0.015, 0.35, [0, 0, 0], 6)), [side * 0.3, 3.74, -0.6], undefined, "cv_steel");
    plate(`datalink_${side === -1 ? "l" : "r"}`, `数据链天线 ${side === -1 ? "左" : "右"}`, `datalink panel ${side === -1 ? "l" : "r"}`, M(B(0.18, 0.05, 0.14, [0, 0, 0], 0.001)), [side * 0.7, 3.63, 1.75], undefined, "cv_radar");
    plate(`beacon_${side === -1 ? "l" : "r"}`, `防撞灯 ${side === -1 ? "左" : "右"}`, `anti-collision beacon ${side === -1 ? "l" : "r"}`, M(S(0.055, [0, 0, 0], 8)), [side * 1.2, 1.9, -0.6], undefined, "cv_deck_red");
    plate(`static_discharge_${side === -1 ? "l" : "r"}_a`, "静电放电刷", "static discharger", M({ type: "weld", from: [0, 0, 0], to: [side * 0.01, -0.2, -0.05], radius: 0.008 }), [side * 1.4, 2.55, -9.33], undefined, "cv_steel");
    plate(`static_discharge_${side === -1 ? "l" : "r"}_b`, "静电放电刷", "static discharger", M({ type: "weld", from: [0, 0, 0], to: [side * 0.01, -0.2, -0.05], radius: 0.008 }), [side * 1.4, 2.55, -8.6], undefined, "cv_steel");
  }
  plate("tacan", "塔康天线", "TACAN antenna", M(S(0.09, [0, 0, 0], 10)), [0, 0.86, -1.0], undefined, "cv_radar");
  for (const side of [-1, 1] as const) {
    plate(`pitot_${side === -1 ? "l" : "r"}`, `空速管 ${side === -1 ? "左" : "右"}`, `pitot ${side === -1 ? "l" : "r"}`, M({ type: "weld", from: [0, 0, 0], to: [0, 0, 0.5], radius: 0.018 }), [side * 0.9, 2.5, 3.6], undefined, "cv_steel");
  }
  for (const side of [-1, 1] as const) {
    plate(`oat_${side === -1 ? "l" : "r"}`, `外界温度探头 ${side === -1 ? "左" : "右"}`, `OAT probe ${side === -1 ? "l" : "r"}`, M(C(0.02, 0.12, [0, 0, 0], 6)), [side * 1.0, 2.45, 3.9], undefined, "cv_steel");
  }
  for (let f = 0; f < 3; f++) {
    plate(`formation_light_${f + 1}`, `编队灯 ${f + 1}`, `formation light ${f + 1}`, M(B(0.02, 0.06, 0.42, [0, 0, 0], 0.001)), [-1.24, 2.15, -0.6 + f * 1.1], undefined, "cv_glow");
  }

  // ---------------- 9. 检修口盖/标记 ----------------
  for (let i = 0; i < 8; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const z = -1.2 + Math.floor(i / 2) * 1.1;
    plate(`access_outline_${i + 1}`, `检修口盖 ${i + 1}`, `access panel ${i + 1}`, M(B(0.012, 0.4, 0.55, [0, 0, 0], 0.001)), [side * 1.246, 2.35, z], undefined, "cv_aircraft_dark");
    for (let k = 0; k < 2; k++) {
      plate(`access_latch_${i + 1}_${k + 1}`, `口盖锁扣 ${i + 1}-${k + 1}`, `access latch ${i + 1}-${k + 1}`, M(B(0.03, 0.04, 0.04, [0, 0, 0], 0.001)), [side * 1.255, 2.15 + k * 0.4, z], undefined, "cv_steel");
    }
  }
  for (let i = 0; i < 16; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const z = -1.5 + Math.floor(i / 2) * 0.65;
    plate(`placard_${i + 1}`, `机身警示标牌 ${i + 1}`, `stencil placard ${i + 1}`, M(B(0.01, 0.11, 0.2, [0, 0, 0], 0.001)), [side * 1.247, 1.2 + (i % 2) * 0.7, z], undefined, i % 3 === 0 ? "cv_warning" : "cv_deck_line");
  }
  for (const side of [-1, 1] as const) {
    plate(`rescue_arrow_${side === -1 ? "l" : "r"}_a`, "救援箭头", "rescue arrow", M(B(0.01, 0.08, 0.4, [0, 0, 0], 0.001), B(0.01, 0.18, 0.08, [0, 0, 0.2], 0.001)), [side * 1.248, 2.2, 1.9], undefined, "cv_deck_yellow");
    plate(`rescue_arrow_${side === -1 ? "l" : "r"}_b`, "救援箭头", "rescue arrow", M(B(0.01, 0.08, 0.4, [0, 0, 0], 0.001), B(0.01, 0.18, 0.08, [0, 0, -0.2], 0.001)), [side * 1.248, 1.3, 0.2], undefined, "cv_deck_yellow");
  }
  for (let i = 0; i < 6; i++) {
    plate(`no_step_${i + 1}`, `禁止踩踏标线 ${i + 1}`, `no step line ${i + 1}`, M(B(0.3, 0.01, 0.04, [0, 0, 0], 0.001)), [0, 3.62, -0.8 + i * 0.5], undefined, "cv_deck_red");
  }
  for (const side of [-1, 1] as const) {
    plate(`drain_mast_${side === -1 ? "l" : "r"}_a`, "排水管", "drain mast", M(C(0.015, 0.18, [0, 0, 0], 6)), [side * 0.45, 0.8, 0.0], undefined, "cv_steel");
    plate(`drain_mast_${side === -1 ? "l" : "r"}_b`, "排水管", "drain mast", M(C(0.015, 0.18, [0, 0, 0], 6)), [side * 0.45, 0.8, -1.0], undefined, "cv_steel");
  }
  // 折叠状态也保持 1000+ 件：补机腹/尾梁检修快卸锁。
  for (let i = 0; i < 16; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const z = -1.3 + Math.floor(i / 2) * 0.5;
    rivet(`extra_fastener_${i + 1}`, [side * 1.253, 1.45, z]);
  }
}
