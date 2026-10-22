import { A, B, C, M, S, T, pad, type CarrierCtx } from "./common";

// ============================================================================
// L1 动力：压水反应堆（堆芯/压力容器/一回路/控制棒驱动）+ 蒸汽轮机 +
// 减速齿轮 + 轴系 + 双桨 + 双舵。动力舱位于机库甲板下方后部。
// ============================================================================

const ASSEMBLY = "power";
const REACTOR_Z = -11;

export function addPower(ctx: CarrierCtx): void {
  const add = (part: Parameters<CarrierCtx["add"]>[0]) => ctx.add(part);
  const P = "carrier.power.";

  // ---- 反应堆压力容器 ----
  add({
    id: `${P}reactor_vessel`,
    name_cn: "反应堆压力容器",
    name_en: "reactor pressure vessel",
    assembly: ASSEMBLY,
    build_layer: 1,
    geometry: M(T(1.15, 1.02, 2.2, [0, 0, 0], 40), S(1.15, [0, 0, 0], 28)),
    material: "cv_steel_dark",
    mate: A([0, 1.5, REACTOR_Z]),
    source: "压水堆：15MPa 一回路，压力容器内布置 8 组燃料组件。",
  });
  add({
    id: `${P}vessel_head`,
    name_cn: "压力容器顶盖",
    name_en: "vessel head",
    assembly: ASSEMBLY,
    build_layer: 1,
    geometry: M(T(1.18, 0.5, 0.16, [0, 0, 0], 40), C(1.0, 0.9, [0, 0.52, 0], 32)),
    material: "cv_steel_dark",
    mate: A([0, 2.62, REACTOR_Z]),
  });
  for (let b = 0; b < 24; b++) {
    const a = (b / 24) * Math.PI * 2;
    add({
      id: `${P}vessel_bolt_${pad(b + 1)}`,
      name_cn: `顶盖螺栓 ${b + 1}`,
      name_en: `vessel head bolt ${b + 1}`,
      assembly: ASSEMBLY,
      build_layer: 1,
      geometry: M(C(0.045, 0.13, [0, 0, 0], 10), C(0.07, 0.04, [0, 0.07, 0], 6)),
      material: "cv_steel",
      mate: A([Math.cos(a) * 1.04, 2.8, REACTOR_Z + Math.sin(a) * 1.04]),
    });
  }
  add({
    id: `${P}reactor_cradle`,
    name_cn: "反应堆基座",
    name_en: "reactor cradle",
    assembly: ASSEMBLY,
    build_layer: 1,
    geometry: M(T(1.25, 0.7, 0.4, [0, 0, 0], 36), B(2.8, 0.12, 2.8, [0, -0.24, 0], 0.01)),
    material: "cv_steel_dark",
    mate: A([0, 0.7, REACTOR_Z]),
  });

  // ---- 堆芯：8 组燃料组件（16 根燃料棒 ×8）+ 控制棒束 ----
  const corePlateY = 1.42;
  add({
    id: `${P}core_support_plate`,
    name_cn: "堆芯支承板",
    name_en: "core support plate",
    assembly: ASSEMBLY,
    build_layer: 1,
    geometry: M(C(0.92, 0.08, [0, 0, 0], 32)),
    material: "cv_steel",
    mate: A([0, corePlateY - 0.08, REACTOR_Z]),
  });
  const assemblySpots = [
    [-0.32, -0.45], [0.32, -0.45], [-0.32, 0], [0.32, 0],
    [-0.32, 0.45], [0.32, 0.45], [0, -0.22], [0, 0.22],
  ] as const;
  assemblySpots.forEach(([ax, az], aIndex) => {
    const x = ax;
    const z = REACTOR_Z + az;
    const tag = pad(aIndex + 1);
    add({
      id: `${P}fuel_assembly_${tag}_nozzle_top`,
      name_cn: `燃料组件 ${tag} 上管座`,
      name_en: `fuel assembly ${tag} top nozzle`,
      assembly: ASSEMBLY,
      build_layer: 1,
      geometry: M(B(0.24, 0.05, 0.24, [0, 0, 0], 0.004), C(0.09, 0.08, [0, 0.05, 0], 16)),
      material: "cv_steel",
      mate: A([x, 2.1, z]),
    });
    add({
      id: `${P}fuel_assembly_${tag}_nozzle_bottom`,
      name_cn: `燃料组件 ${tag} 下管座`,
      name_en: `fuel assembly ${tag} bottom nozzle`,
      assembly: ASSEMBLY,
      build_layer: 1,
      geometry: M(B(0.24, 0.06, 0.24, [0, 0, 0], 0.004)),
      material: "cv_steel",
      mate: A([x, corePlateY + 0.03, z]),
    });
    for (let g = 0; g < 3; g++) {
      add({
        id: `${P}fuel_assembly_${tag}_grid_${g + 1}`,
        name_cn: `燃料组件 ${tag} 定位格架 ${g + 1}`,
        name_en: `fuel assembly ${tag} grid ${g + 1}`,
        assembly: ASSEMBLY,
        build_layer: 1,
        geometry: M(B(0.23, 0.035, 0.23, [0, 0, 0], 0.004)),
        material: "cv_steel_dark",
        mate: A([x, 1.62 + g * 0.17, z]),
      });
    }
    for (let r = 0; r < 16; r++) {
      const gx = ((r % 4) - 1.5) * 0.052;
      const gz = (Math.floor(r / 4) - 1.5) * 0.052;
      add({
        id: `${P}fuel_rod_${tag}_${pad(r + 1)}`,
        name_cn: `燃料棒 ${tag}-${r + 1}`,
        name_en: `fuel rod ${tag}-${r + 1}`,
        assembly: ASSEMBLY,
        build_layer: 1,
        geometry: M(C(0.016, 0.76, [0, 0, 0], 10), C(0.018, 0.04, [0, 0.4, 0], 8)),
        material: "cv_steel",
        mate: A([x + gx, 1.89, z + gz]),
        source: "锆合金包壳内装 UO₂ 芯块；16 根为展示密度，实际组件约 264 根。",
      });
    }
    // 控制棒束：4 根吸收棒 + 星形架，挂在驱动节点上。
    const rodNode = `CV_CR_${tag}`;
    ctx.node({
      name: rodNode,
      parent: "root",
      pivot: [x, 2.35, z],
      motion: "translate",
      axis: "y",
      note: `控制棒束 ${tag}（应急停堆 <2s 全插入）`,
    });
    add({
      id: `${P}control_rod_${tag}_spider`,
      name_cn: `控制棒束 ${tag} 星形架`,
      name_en: `control rod spider ${tag}`,
      assembly: ASSEMBLY,
      build_layer: 1,
      geometry: M(B(0.2, 0.04, 0.2, [0, 0, 0], 0.004), C(0.04, 0.16, [0, 0.1, 0], 12)),
      material: "cv_steel",
      node: rodNode,
      mate: A([0, 0, 0]),
    });
    for (let r = 0; r < 4; r++) {
      const a = (r / 4) * Math.PI * 2;
      add({
        id: `${P}control_rod_${tag}_${r + 1}`,
        name_cn: `控制棒 ${tag}-${r + 1}`,
        name_en: `control rod ${tag}-${r + 1}`,
        assembly: ASSEMBLY,
        build_layer: 1,
        geometry: M(C(0.012, 0.9, [0, 0, 0], 8), C(0.016, 0.04, [0, 0.47, 0], 8)),
        material: "cv_steel_dark",
        node: rodNode,
        mate: A([Math.cos(a) * 0.075, -0.5, Math.sin(a) * 0.075]),
      });
    }
    // CRDM：驱动轴 + 三组线圈 + 抓钩 + 壳体。
    add({
      id: `${P}crdm_${tag}_shaft`,
      name_cn: `控制棒驱动轴 ${tag}`,
      name_en: `CRDM shaft ${tag}`,
      assembly: ASSEMBLY,
      build_layer: 1,
      geometry: M(C(0.018, 0.75, [0, 0, 0], 10)),
      material: "cv_steel",
      mate: A([x, 3.0, z]),
    });
    for (let c = 0; c < 3; c++) {
      add({
        id: `${P}crdm_${tag}_coil_${c + 1}`,
        name_cn: `CRDM 线圈 ${tag}-${c + 1}`,
        name_en: `CRDM coil ${tag}-${c + 1}`,
        assembly: ASSEMBLY,
        build_layer: 1,
        geometry: M(T(0.09, 0.045, 0.12, [0, 0, 0], 18)),
        material: "cv_copper",
        mate: A([x, 3.0 + c * 0.14, z]),
      });
    }
    add({
      id: `${P}crdm_${tag}_latch`,
      name_cn: `CRDM 抓钩 ${tag}`,
      name_en: `CRDM latch ${tag}`,
      assembly: ASSEMBLY,
      build_layer: 1,
      geometry: M(B(0.09, 0.06, 0.09, [0, 0, 0], 0.006), C(0.03, 0.05, [0, -0.05, 0], 8)),
      material: "cv_steel",
      mate: A([x, 3.44, z]),
    });
    add({
      id: `${P}crdm_${tag}_housing`,
      name_cn: `CRDM 壳体 ${tag}`,
      name_en: `CRDM housing ${tag}`,
      assembly: ASSEMBLY,
      build_layer: 1,
      geometry: M(C(0.11, 0.62, [0, 0, 0], 20), C(0.14, 0.06, [0, 0.3, 0], 20)),
      material: "cv_steel_dark",
      mate: A([x, 3.1, z]),
    });
  });

  // ---- 一回路：蒸汽发生器、稳压器、主泵、管路 ----
  for (const side of [-1, 1] as const) {
    const tag = side === -1 ? "l" : "r";
    add({
      id: `${P}steam_generator_${tag}`,
      name_cn: `${side === -1 ? "左" : "右"}蒸汽发生器`,
      name_en: `${tag} steam generator`,
      assembly: ASSEMBLY,
      build_layer: 1,
      geometry: M(T(0.56, 0.46, 1.9, [0, 0, 0], 28), C(0.62, 0.3, [0, 0.85, 0], 28)),
      material: "cv_steel_dark",
      mate: A([side * 2.15, 1.55, REACTOR_Z + 0.6]),
    });
    add({
      id: `${P}sg_tube_bundle_${tag}`,
      name_cn: `蒸汽发生器 U 形管束（${tag}）`,
      name_en: `SG U-tube bundle ${tag}`,
      assembly: ASSEMBLY,
      build_layer: 1,
      geometry: M(C(0.03, 1.2, [0, 0, 0], 8)),
      material: "cv_copper",
      mate: A([side * 2.15, 1.5, REACTOR_Z + 0.6]),
      instances: 20,
      indexed: true,
      instance_layout: "carrier.power.sgTube",
    });
    add({
      id: `${P}main_pump_${tag}`,
      name_cn: `${side === -1 ? "左" : "右"}主泵`,
      name_en: `${tag} main coolant pump`,
      assembly: ASSEMBLY,
      build_layer: 1,
      geometry: M(C(0.3, 0.62, [0, 0, 0], 22), C(0.16, 0.2, [0, 0.4, 0], 16)),
      material: "cv_steel",
      mate: A([side * 1.9, 1.05, REACTOR_Z - 2.0]),
    });
    add({
      id: `${P}primary_loop_${tag}`,
      name_cn: `一回路主管道（${tag}）`,
      name_en: `primary loop ${tag}`,
      assembly: ASSEMBLY,
      build_layer: 1,
      geometry: {
        type: "weld",
        from: [side * 0.8, 1.2, REACTOR_Z],
        to: [side * 2.0, 1.3, REACTOR_Z + 1.4],
        radius: 0.11,
        seed: side + 11,
      },
      material: "cv_steel",
      mate: A([0, 0, 0]),
    });
  }
  add({
    id: `${P}pressurizer`,
    name_cn: "稳压器",
    name_en: "pressurizer",
    assembly: ASSEMBLY,
    build_layer: 1,
    geometry: M(C(0.35, 1.4, [0, 0, 0], 24), S(0.35, [0, 0.7, 0], 18), C(0.07, 0.3, [0, 0.85, 0], 12)),
    material: "cv_steel_dark",
    mate: A([0, 1.55, REACTOR_Z - 1.4]),
  });
  for (let h = 0; h < 8; h++) {
    const a = (h / 8) * Math.PI * 2;
    add({
      id: `${P}pressurizer_heater_${pad(h + 1)}`,
      name_cn: `稳压器电加热器 ${h + 1}`,
      name_en: `pressurizer heater ${h + 1}`,
      assembly: ASSEMBLY,
      build_layer: 1,
      geometry: M(C(0.035, 0.55, [0, 0, 0], 8)),
      material: "cv_steel",
      mate: A([Math.cos(a) * 0.22, 1.55, REACTOR_Z - 1.4 + Math.sin(a) * 0.22]),
    });
  }

  // ---- 二回路：蒸汽轮机、减速齿轮、冷凝器 ----
  for (const side of [-1, 1] as const) {
    const tag = side === -1 ? "l" : "r";
    const x = side * 1.35;
    for (const [stage, z0, len, r] of [
      ["hp", -14.2, 1.25, 0.42],
      ["lp", -15.7, 1.7, 0.58],
    ] as const) {
      add({
        id: `${P}turbine_${tag}_${stage}_casing`,
        name_cn: `${tag === "l" ? "左" : "右"}${stage === "hp" ? "高压" : "低压"}涡轮缸`,
        name_en: `${tag} ${stage} turbine casing`,
        assembly: ASSEMBLY,
        build_layer: 1,
        geometry: M(C(r, len, [0, 0, 0], 26), T(r + 0.08, r - 0.02, 0.12, [0, -len / 2, 0], 26)),
        material: "cv_steel_dark",
        mate: A([x, 1.68, z0], [90, 0, 0]),
      });
      const rotorNode = `CV_Turbine_${tag}_${stage}`;
      ctx.node({ name: rotorNode, parent: "root", pivot: [x, 1.68, z0], motion: "rotate", axis: "z", note: `${tag} ${stage} 涡轮转子` });
      add({
        id: `${P}turbine_${tag}_${stage}_rotor`,
        name_cn: `${tag === "l" ? "左" : "右"}${stage === "hp" ? "高压" : "低压"}转子`,
        name_en: `${tag} ${stage} rotor`,
        assembly: ASSEMBLY,
        build_layer: 1,
        geometry: M(C(0.16, len * 0.92, [0, 0, 0], 18), C(0.1, len * 1.05, [0, 0, 0], 14)),
        material: "cv_steel",
        node: rotorNode,
        mate: A([0, 0, 0], [90, 0, 0]),
      });
      for (let disk = 0; disk < 6; disk++) {
        add({
          id: `${P}turbine_${tag}_${stage}_disk_${disk + 1}`,
          name_cn: `${tag} ${stage} 涡轮盘 ${disk + 1}`,
          name_en: `${tag} ${stage} turbine disk ${disk + 1}`,
          assembly: ASSEMBLY,
          build_layer: 1,
          geometry: M(T(r * 0.62, 0.06, 0.05, [0, 0, 0], 20)),
          material: "cv_steel",
          node: rotorNode,
          mate: A([0, 0, -len * 0.38 + (disk * len * 0.76) / 5], [90, 0, 0]),
        });
      }
    }
    add({
      id: `${P}gearbox_${tag}`,
      name_cn: `${tag === "l" ? "左" : "右"}减速齿轮箱`,
      name_en: `${tag} reduction gearbox`,
      assembly: ASSEMBLY,
      build_layer: 1,
      geometry: M(B(1.2, 1.0, 1.2, [0, 0, 0], 0.02), T(0.42, 0.32, 0.18, [0, 0, 0], 28), C(0.16, 0.4, [0, 0, 0], 16)),
      material: "cv_steel_dark",
      mate: A([side * 1.5, 1.45, -17.0]),
    });
    add({
      id: `${P}condenser_${tag}`,
      name_cn: `${tag === "l" ? "左" : "右"}主冷凝器`,
      name_en: `${tag} main condenser`,
      assembly: ASSEMBLY,
      build_layer: 1,
      geometry: M(B(1.5, 0.9, 1.8, [0, 0, 0], 0.02), T(0.1, 0.06, 1.5, [0, 0.2, 0], 16)),
      material: "cv_steel_dark",
      mate: A([side * 1.45, 1.3, -15.9]),
    });
    add({
      id: `${P}condenser_tubes_${tag}`,
      name_cn: `冷凝器海水管束（${tag}）`,
      name_en: `condenser tube bundle ${tag}`,
      assembly: ASSEMBLY,
      build_layer: 1,
      geometry: M(C(0.02, 1.45, [0, 0, 0], 8)),
      material: "cv_copper",
      mate: A([side * 1.45, 1.3, -15.9], [90, 0, 0]),
      instances: 18,
      indexed: true,
      instance_layout: "carrier.power.condenserTube",
    });
    for (let s = 0; s < 4; s++) {
      add({
        id: `${P}shaft_${tag}_${s + 1}`,
        name_cn: `${tag === "l" ? "左" : "右"}主轴段 ${s + 1}`,
        name_en: `${tag} propeller shaft ${s + 1}`,
        assembly: ASSEMBLY,
        build_layer: 1,
        geometry: M(C(0.09, 1.35, [0, 0, 0], 14)),
        material: "cv_steel",
        mate: A([side * 1.5, 1.0, -16.9 - s * 1.25], [90, 0, 0]),
      });
    }
    const propNode = `CV_Prop_${tag}`;
    ctx.node({ name: propNode, parent: "root", pivot: [side * 1.5, 1.0, -19.35], motion: "rotate", axis: "z", note: `${tag} 螺旋桨` });
    add({
      id: `${P}propeller_${tag}_hub`,
      name_cn: `${tag === "l" ? "左" : "右"}桨毂`,
      name_en: `${tag} propeller hub`,
      assembly: ASSEMBLY,
      build_layer: 1,
      geometry: M(C(0.18, 0.42, [0, 0, 0], 18), C(0.23, 0.12, [0, 0.18, 0], 18)),
      material: "cv_brass",
      node: propNode,
      mate: A([0, 0, 0], [90, 0, 0]),
    });
    for (let blade = 0; blade < 5; blade++) {
      const a = (blade / 5) * Math.PI * 2;
      add({
        id: `${P}propeller_${tag}_blade_${blade + 1}`,
        name_cn: `${tag} 桨叶 ${blade + 1}`,
        name_en: `${tag} propeller blade ${blade + 1}`,
        assembly: ASSEMBLY,
        build_layer: 1,
        geometry: M(B(0.14, 0.52, 0.06, [0, 0.32, 0], 0.01)),
        material: "cv_brass",
        node: propNode,
        mate: A([0, 0, 0], [0, 0, (a * 180) / Math.PI]),
      });
    }
    const rudderNode = `CV_Rudder_${tag}`;
    ctx.node({ name: rudderNode, parent: "root", pivot: [side * 2.15, 1.05, -19.45], motion: "rotate", axis: "y", note: `${tag} 舵` });
    add({
      id: `${P}rudder_${tag}`,
      name_cn: `${tag === "l" ? "左" : "右"}舵叶`,
      name_en: `${tag} rudder`,
      assembly: ASSEMBLY,
      build_layer: 1,
      geometry: M(B(0.3, 1.2, 0.09, [0, 0, -0.18], 0.01), C(0.11, 0.4, [0, 0.25, 0], 12)),
      material: "cv_hull_boot",
      node: rudderNode,
      mate: A([0, 0, 0]),
    });
  }
  add({
    id: `${P}reactor_shielding`,
    name_cn: "反应堆屏蔽层",
    name_en: "reactor shielding",
    assembly: ASSEMBLY,
    build_layer: 1,
    geometry: M(B(4.6, 0.16, 3.8, [0, 0, 0], 0.02), B(4.6, 1.3, 0.16, [0, 0.7, -1.9], 0.01)),
    material: "cv_canvas",
    mate: A([0, 0.55, REACTOR_Z]),
  });

  // 机舱围壁与滑油/控制柜。
  add({
    id: `${P}engine_room_walls`,
    name_cn: "机舱围壁",
    name_en: "engine room walls",
    assembly: ASSEMBLY,
    build_layer: 1,
    geometry: M(
      B(5.4, 2.0, 0.1, [0, 0, -2.4], 0.006),
      B(5.4, 2.0, 0.1, [0, 0, 2.4], 0.006),
      B(0.1, 2.0, 4.9, [-2.7, 0, 0], 0.006),
      B(0.1, 2.0, 4.9, [2.7, 0, 0], 0.006),
    ),
    material: "cv_hull_dark",
    mate: A([0, 1.6, -16.0]),
  });
  for (let i = 0; i < 12; i++) {
    add({
      id: `${P}engine_control_cabinet_${pad(i + 1)}`,
      name_cn: `机舱控制柜 ${i + 1}`,
      name_en: `engine control cabinet ${i + 1}`,
      assembly: ASSEMBLY,
      build_layer: 1,
      geometry: M(B(0.45, 0.9, 0.3, [0, 0, 0], 0.006), B(0.3, 0.2, 0.02, [0, 0.2, 0.16], 0.003)),
      material: "cv_steel_dark",
      mate: A([-3.45 + (i % 4) * 0.3, 1.7, -14.0 - Math.floor(i / 4) * 0.45]),
    });
  }
}
