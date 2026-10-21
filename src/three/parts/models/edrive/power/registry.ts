import * as THREE from "three";
import type { InstanceLayout } from "../../../assembler/assembler";
import type { ExpectedContactRule, GeometrySpec, ModelRegistry, NodeDef, PartDefinition } from "../../../registry/types";
import {
  ED,
  ED_CONSTANTS,
  HIT_PACK,
  MOTOR_L_NODE,
  MOTOR_R_NODE,
  CHARGE_FLAP_NODE,
  packCenter,
} from "../constants";
import { EDRIVE_MATERIALS } from "../materials";

// ============================================================================
// models/edrive/power —— L1 电驱动力：6 组动力电池 / 双电机 / 电控 / 高压 / 冷却
// 复用 MBT 车体坐标；原动力舱（z -1.3…-3.2）改为电池包、电机、电控舱。
// ============================================================================

const P = "ed90.";
const A = (position: [number, number, number], rotation?: [number, number, number]) =>
  rotation ? { type: "absolute" as const, position, rotation } : { type: "absolute" as const, position };
const B = (w: number, h: number, d: number, at: [number, number, number] = [0, 0, 0], bevel = 0.004): GeometrySpec & { at: [number, number, number] } => ({ type: "box", w, h, d, bevel, at });
const C = (r: number, h: number, at: [number, number, number] = [0, 0, 0], segments = 18, rTop = r): GeometrySpec & { at: [number, number, number] } => ({ type: "cylinder", r, h, rTop, segments, bevel: 0.002, at });
const T = (ro: number, ri: number, h: number, at: [number, number, number] = [0, 0, 0], seg = 22): GeometrySpec & { at: [number, number, number] } => ({ type: "tube", rOuter: ro, rInner: ri, h, segments: seg, at });
const MERGE = (...items: Array<GeometrySpec & { at?: [number, number, number] }>): GeometrySpec => ({ type: "merge", parts: items });
const W = (from: [number, number, number], to: [number, number, number], r = 0.014, seed = 1): GeometrySpec => ({ type: "weld", from, to, radius: r, seed });
const add = (parts: PartDefinition[], p: PartDefinition) => parts.push(p);

function motorCenter(side: 1 | -1): [number, number, number] {
  return [side * ED.MOTOR_X, ED.MOTOR_Y, ED.MOTOR_Z];
}
function inverterCenter(side: 1 | -1): [number, number, number] {
  return [side * ED.INVERTER_X, ED.INVERTER_Y, ED.INVERTER_Z];
}
function packTerminal(pack: number, positive: boolean): [number, number, number] {
  const c = packCenter(pack);
  return [c[0] + (positive ? 0.18 : -0.18), c[1] + 0.18, c[2] - 0.18];
}

// 电池电芯：每包 3 模组 × 12 电芯
export const POWER_LAYOUTS: Record<string, InstanceLayout> = {};
for (let p = 0; p < ED.PACK_COUNT; p++) {
  const c = packCenter(p);
  POWER_LAYOUTS[`ed90.battery.cells_${p + 1}`] = ({ index }) => {
    const module = Math.floor(index / ED.CELLS_PER_MODULE);
    const within = index % ED.CELLS_PER_MODULE;
    const x = -0.15 + (within % 4) * 0.1;
    const z = (module - 1) * ED.MODULE_DZ + (Math.floor(within / 4) - 1) * 0.045;
    return new THREE.Matrix4().makeTranslation(c[0] + x, c[1] - 0.01, c[2] + z);
  };
}
// 电机定子线圈与转子磁钢
for (const side of [-1, 1] as const) {
  const tag = side === 1 ? "r" : "l";
  const c = motorCenter(side);
  POWER_LAYOUTS[`ed90.motor.${tag}_coils`] = ({ index }) => {
    const angle = (index / 12) * Math.PI * 2;
    const r = 0.15;
    return new THREE.Matrix4()
      .makeRotationX(angle)
      .setPosition(c[0], c[1] + Math.cos(angle) * r, c[2] + Math.sin(angle) * r);
  };
  POWER_LAYOUTS[`ed90.motor.${tag}_magnets`] = ({ index }) => {
    const angle = (index / 8) * Math.PI * 2;
    const r = 0.115;
    return new THREE.Matrix4()
      .makeRotationX(angle)
      .setPosition(0, Math.cos(angle) * r, Math.sin(angle) * r);
  };
  const ic = inverterCenter(side);
  POWER_LAYOUTS[`ed90.inverter.${tag}_modules`] = ({ index }) => {
    const col = index % 3;
    const row = Math.floor(index / 3);
    return new THREE.Matrix4().makeTranslation(ic[0] - 0.12 + col * 0.12, ic[1] + 0.02, ic[2] - 0.08 + row * 0.16);
  };
  POWER_LAYOUTS[`ed90.inverter.${tag}_caps`] = ({ index }) =>
    new THREE.Matrix4().makeTranslation(ic[0] - 0.13 + index * 0.13, ic[1] - 0.08, ic[2] + 0.11);
}
// 高压线卡箍
POWER_LAYOUTS["ed90.hv.clamps"] = ({ index }) => {
  const col = index % 5;
  const row = Math.floor(index / 5);
  return new THREE.Matrix4().makeTranslation(row === 0 ? -0.3 : 0.3, 1.05, -1.65 - col * 0.3);
};
// 电池受击火星
POWER_LAYOUTS["ed90.fx.battery_sparks"] = ({ index }) => {
  const c = packCenter(HIT_PACK);
  const angle = (index / 10) * Math.PI * 2;
  return new THREE.Matrix4().makeTranslation(
    c[0] + Math.cos(angle) * 0.2,
    1.95 + (index % 3) * 0.06,
    c[2] - 0.2 + Math.sin(angle) * 0.2,
  );
};

export const POWER_NODES: NodeDef[] = [
  { name: MOTOR_L_NODE, parent: "root", pivot: motorCenter(-1), motion: "rotate", axis: "x", note: "左驱动电机转子" },
  { name: MOTOR_R_NODE, parent: "root", pivot: motorCenter(1), motion: "rotate", axis: "x", note: "右驱动电机转子" },
  { name: CHARGE_FLAP_NODE, parent: "root", pivot: [1.42, 1.22, -2.75], motion: "rotate", axis: "z", note: "快充口装甲盖" },
];

function buildParts(): PartDefinition[] {
  const parts: PartDefinition[] = [];
  let order = 900;

  // ======================= 动力电池包 ×6 =======================
  for (let p = 0; p < ED.PACK_COUNT; p++) {
    const n = p + 1;
    const c = packCenter(p);
    const pack = (suffix: string, name: string, geometry: GeometrySpec, material: string, offset: [number, number, number], extra: Partial<PartDefinition> = {}) => {
      add(parts, {
        id: `ed90.battery.pack${n}_${suffix}`,
        name_cn: `电池包 ${n} ${name}`,
        name_en: `battery pack ${n} ${name}`,
        assembly: "battery",
        build_layer: 1,
        build_order: order++,
        geometry,
        material,
        mate: A([c[0] + offset[0], c[1] + offset[1], c[2] + offset[2]]),
        ...extra,
      });
    };
    pack("shell_bottom", "下壳体", B(0.52, 0.03, 0.52), "ed_battery_shell", [0, -0.195, 0]);
    pack("shell_top", "上盖", B(0.52, 0.03, 0.52), "ed_battery_shell", [0, 0.195, 0]);
    pack("shell_left", "左侧壁", B(0.03, 0.39, 0.52), "ed_battery_shell", [-0.245, 0, 0]);
    pack("shell_right", "右侧壁", B(0.03, 0.39, 0.52), "ed_battery_shell", [0.245, 0, 0]);
    pack("shell_front", "前端板", B(0.52, 0.39, 0.03), "ed_battery_shell", [0, 0, 0.245]);
    pack("shell_rear", "后端板", B(0.52, 0.39, 0.03), "ed_battery_shell", [0, 0, -0.245]);
    pack("bms_master", "BMS 主控板", MERGE(B(0.2, 0.018, 0.12), B(0.04, 0.02, 0.03, [0.08, 0.012, 0])), "ed_pcb", [0.12, 0.17, 0.16]);
    pack("hv_terminal_pos", "高压正极端子", C(0.025, 0.06, [0, 0, 0], 12), "ed_cell_terminal", [0.18, 0.17, -0.18]);
    pack("hv_terminal_neg", "高压负极端子", C(0.025, 0.06, [0, 0, 0], 12), "ed_cell_terminal", [-0.18, 0.17, -0.18]);
    pack("service_disconnect", "手动维修开关", MERGE(B(0.08, 0.05, 0.08), B(0.03, 0.08, 0.03, [0, 0.05, 0])), "ed_connector", [0.08, 0.18, 0.04]);
    pack("fuse", "高压熔断器", B(0.06, 0.04, 0.1), "ed_connector", [-0.12, 0.18, 0.04]);
    pack("vent", "防爆透气阀", C(0.035, 0.035, [0, 0, 0], 14), "ed_connector", [0, 0.18, -0.21]);
    pack("cool_in", "冷却进液口", C(0.022, 0.05, [0, 0, 0], 12), "ed_coolant", [0.16, -0.1, 0.26]);
    pack("cool_out", "冷却出液口", C(0.022, 0.05, [0, 0, 0], 12), "ed_coolant", [-0.16, -0.1, 0.26]);
    pack("mount_front", "前安装脚", B(0.12, 0.18, 0.1), "mbt_steel_dark", [0.2, -0.28, 0.14]);
    pack("mount_rear", "后安装脚", B(0.12, 0.18, 0.1), "mbt_steel_dark", [-0.2, -0.28, 0.14]);
    pack("fire_port", "消防喷口", C(0.028, 0.06, [0, 0, 0], 12), "ed_warning", [0, 0.19, -0.02]);
    pack("label", "电池包铭牌", B(0.18, 0.07, 0.006), "ed_warning", [0, 0, 0.262]);
    // 3 个模组
    for (let m = 0; m < ED.MODULES_PER_PACK; m++) {
      const mz = (m - 1) * ED.MODULE_DZ;
      const mod = (suffix: string, name: string, geometry: GeometrySpec, material: string, offset: [number, number, number]) =>
        pack(`mod${m + 1}_${suffix}`, `模组 ${m + 1} ${name}`, geometry, material, [offset[0], offset[1], mz + offset[2]]);
      mod("housing", "框架", MERGE(
        B(0.46, 0.02, 0.15, [0, -0.12, 0]),
        B(0.46, 0.24, 0.02, [0, 0, -0.075]),
        B(0.46, 0.24, 0.02, [0, 0, 0.075]),
        B(0.02, 0.24, 0.15, [-0.23, 0, 0]),
        B(0.02, 0.24, 0.15, [0.23, 0, 0]),
      ), "ed_battery_shell", [0, 0, 0]);
      mod("holder", "电芯支架", B(0.44, 0.02, 0.13), "ed_connector", [0, -0.1, 0]);
      mod("bms_slave", "BMS 从板", B(0.16, 0.012, 0.08), "ed_pcb", [0.1, 0.13, 0]);
      mod("busbar_pos", "正极铜排", B(0.4, 0.012, 0.02), "ed_busbar", [0, 0.115, 0.05]);
      mod("busbar_neg", "负极铜排", B(0.4, 0.012, 0.02), "ed_busbar", [0, 0.115, -0.05]);
      mod("cooling_plate", "液冷板", B(0.46, 0.018, 0.14), "ed_coolant", [0, -0.13, 0]);
    }
    add(parts, {
      id: `ed90.battery.pack${n}_cells`,
      name_cn: `电池包 ${n} 电芯 ×36`,
      name_en: `battery pack ${n} cells`,
      assembly: "battery",
      build_layer: 1,
      build_order: order++,
      geometry: MERGE(B(0.088, 0.18, 0.035, [0, 0, 0], 0.002), B(0.06, 0.012, 0.04, [0, 0.095, 0], 0.001)),
      material: "ed_cell",
      mate: A([0, 0, 0]),
      instances: 36,
      indexed: true,
      instance_layout: `ed90.battery.cells_${n}`,
      source: "方形磷酸铁锂电芯，3 模组 × 12 串；模组内液冷板与 BMS 从板逐件建模。",
    });
    pack("cold_plate", "包级液冷底托", B(0.48, 0.025, 0.46), "ed_coolant", [0, -0.15, 0]);
  }

  // ======================= 双驱动电机 =======================
  for (const side of [-1, 1] as const) {
    const tag = side === 1 ? "r" : "l";
    const c = motorCenter(side);
    const node = side === 1 ? MOTOR_R_NODE : MOTOR_L_NODE;
    const motor = (suffix: string, name: string, geometry: GeometrySpec, material: string, offset: [number, number, number], rot?: [number, number, number], partNode?: string, instances?: number, layout?: string, extra: Partial<PartDefinition> = {}) => {
      const matePos: [number, number, number] = instances ? [0, 0, 0] : partNode ? offset : [c[0] + offset[0], c[1] + offset[1], c[2] + offset[2]];
      add(parts, {
        id: `ed90.motor.${tag}_${suffix}`,
        name_cn: `${side === 1 ? "右" : "左"}驱动电机 ${name}`,
        name_en: `${tag} motor ${name}`,
        assembly: "motors",
        build_layer: 1,
        build_order: order++,
        geometry,
        material,
        node: partNode,
        mate: A(matePos, rot),
        instances,
        indexed: instances ? true : undefined,
        instance_layout: layout,
        instance_nodes: instances && partNode ? Array.from({ length: instances }, () => partNode) : undefined,
        ...extra,
      });
    };
    motor("housing", "机壳", T(0.19, 0.16, 0.38), "ed_battery_shell", [0, 0, 0], [0, 0, 90]);
    motor("stator_core", "定子铁芯", T(0.165, 0.14, 0.3), "mbt_steel_dark", [0, 0, 0], [0, 0, 90]);
    motor("cooling_jacket", "冷却水套", T(0.205, 0.19, 0.3), "ed_coolant", [0, 0, 0], [0, 0, 90]);
    motor("end_bell_front", "前端盖", T(0.18, 0.06, 0.045, [0, 0, 0], 22), "ed_battery_shell", [0.2, 0, 0], [0, 0, 90]);
    motor("end_bell_rear", "后端盖", T(0.18, 0.06, 0.045, [0, 0, 0], 22), "ed_battery_shell", [-0.2, 0, 0], [0, 0, 90]);
    motor("bearing_front", "前轴承", T(0.065, 0.052, 0.04), "mbt_brass", [0.17, 0, 0], [0, 0, 90]);
    motor("bearing_rear", "后轴承", T(0.065, 0.052, 0.04), "mbt_brass", [-0.17, 0, 0], [0, 0, 90]);
    motor("terminal_box", "接线盒", B(0.14, 0.12, 0.12), "ed_connector", [0, 0.23, 0.02]);
    for (let ph = 0; ph < 3; ph++) motor(`phase_${ph + 1}`, `相端子 ${ph + 1}`, C(0.022, 0.06, [0, 0, 0], 12), "ed_busbar", [-0.04 + ph * 0.04, 0.31, 0.02]);
    motor("resolver_stator", "旋变定子", T(0.08, 0.065, 0.03, [0, 0, 0], 18), "mbt_brass", [-0.25, 0, -0.02], [0, 0, 90]);
    motor("temp_sensor_front", "温度传感器 1", B(0.03, 0.02, 0.05), "mbt_brass", [0, 0.2, 0.08]);
    motor("temp_sensor_rear", "温度传感器 2", B(0.03, 0.02, 0.05), "mbt_brass", [0, 0.2, -0.08]);
    motor("nameplate", "铭牌", B(0.12, 0.06, 0.005), "ed_warning", [0, 0.02, 0.196]);
    motor("mount_front", "前机脚", B(0.1, 0.18, 0.12), "mbt_steel_dark", [0, -0.28, 0.13]);
    motor("mount_rear", "后机脚", B(0.1, 0.18, 0.12), "mbt_steel_dark", [0, -0.28, -0.13]);
    motor("coils", "定子线圈 ×12", B(0.26, 0.035, 0.06), "mbt_copper", [0, 0, 0], undefined, undefined, 12, `ed90.motor.${tag}_coils`);
    // 转子（节点驱动）
    motor("rotor_core", "转子铁芯", C(0.13, 0.3, [0, 0, 0], 22), "mbt_steel_dark", [0, 0, 0], [0, 0, 90], node);
    motor("rotor_shaft", "转子轴", C(0.05, 0.36, [0, 0, 0], 16), "mbt_steel", [0, 0, 0], [0, 0, 90], node);
    motor("magnets", "永磁磁钢 ×8", B(0.28, 0.03, 0.05), "mbt_tungsten", [0, 0, 0], undefined, node, 8, `ed90.motor.${tag}_magnets`);
    motor("resolver_rotor", "旋变转子", T(0.06, 0.052, 0.03, [0, 0, 0], 18), "mbt_brass", [-0.23, 0, -0.02], [0, 0, 90], node);
    motor("output_flange", "输出法兰", C(0.09, 0.05, [0, 0, 0], 16), "mbt_steel", [0.24, 0, 0], [0, 0, 90], node);
    motor("balance_ring", "动平衡环", T(0.15, 0.14, 0.025), "mbt_steel", [-0.14, 0, 0], [0, 0, 90], node);
    // 减速器 / 终传
    add(parts, {
      id: `ed90.motor.${tag}_reduction_housing`,
      name_cn: `${side === 1 ? "右" : "左"}减速器壳`,
      name_en: `${tag} reduction housing`,
      assembly: "motors",
      build_layer: 1,
      build_order: order++,
      geometry: MERGE(B(0.26, 0.26, 0.24, [0, 0, 0], 0.008), T(0.08, 0.04, 0.1, [0, 0, 0], 18)),
      material: "mbt_cast_dark",
      mate: A([side * 1.42, 0.56, -3.3]),
    });
    add(parts, {
      id: `ed90.motor.${tag}_reduction_gear`,
      name_cn: `${side === 1 ? "右" : "左"}减速齿轮`,
      name_en: `${tag} reduction gear`,
      assembly: "motors",
      build_layer: 1,
      build_order: order++,
      geometry: { type: "kit", kit: "gearBlank", params: { teeth: 28, r: 0.1, w: 0.04, bore: 0.035 } },
      material: "mbt_steel",
      mate: A([side * 1.42, 0.47, -3.36], [0, 0, 90]),
    });
    add(parts, {
      id: `ed90.motor.${tag}_output_shaft`,
      name_cn: `${side === 1 ? "右" : "左"}输出轴`,
      name_en: `${tag} output shaft`,
      assembly: "motors",
      build_layer: 1,
      build_order: order++,
      geometry: T(0.05, 0.025, 0.32, [0, 0, 0], 16),
      material: "mbt_steel",
      mate: A([side * 1.48, 0.47, -3.43], [0, 0, 90]),
    });
  }

  // ======================= 电机控制器 ×2 =======================
  for (const side of [-1, 1] as const) {
    const tag = side === 1 ? "r" : "l";
    const c = inverterCenter(side);
    const inv = (suffix: string, name: string, geometry: GeometrySpec, material: string, offset: [number, number, number], instances?: number, layout?: string) =>
      add(parts, {
        id: `ed90.inverter.${tag}_${suffix}`,
        name_cn: `${side === 1 ? "右" : "左"}电机控制器 ${name}`,
        name_en: `${tag} inverter ${name}`,
        assembly: "power_electronics",
        build_layer: 1,
        build_order: order++,
        geometry,
        material,
        mate: A(instances ? [0, 0, 0] : [c[0] + offset[0], c[1] + offset[1], c[2] + offset[2]]),
        instances,
        indexed: instances ? true : undefined,
        instance_layout: layout,
      });
    inv("housing", "壳体", MERGE(B(0.42, 0.26, 0.34, [0, 0, 0], 0.008), B(0.44, 0.03, 0.36, [0, 0.145, 0], 0.006)), "ed_battery_shell", [0, 0, 0]);
    inv("heatsink", "液冷冷板", MERGE(B(0.4, 0.04, 0.3, [0, 0, 0], 0.004), ...Array.from({ length: 7 }, (_, i) => B(0.36, 0.06, 0.012, [0, -0.035, -0.12 + i * 0.04], 0.002))), "ed_coolant", [0, -0.15, 0]);
    inv("power_modules", "SiC 功率模块 ×6", B(0.09, 0.04, 0.12), "ed_sic", [0, 0, 0], 6, `ed90.inverter.${tag}_modules`);
    inv("dc_link_caps", "直流母线电容 ×3", C(0.035, 0.09, [0, 0, 0], 14), "ed_connector", [0, 0, 0], 3, `ed90.inverter.${tag}_caps`);
    inv("gate_driver", "栅极驱动板", B(0.34, 0.014, 0.26), "ed_pcb", [0, 0.1, 0]);
    inv("control_board", "控制板", B(0.3, 0.012, 0.22), "ed_pcb", [0, 0.075, 0]);
    inv("current_sensor_1", "相电流传感器 1", T(0.03, 0.018, 0.05, [0, 0, 0], 14), "mbt_brass", [-0.1, 0.14, 0.02], undefined, undefined);
    inv("current_sensor_2", "相电流传感器 2", T(0.03, 0.018, 0.05, [0, 0, 0], 14), "mbt_brass", [0.1, 0.14, 0.02]);
    inv("terminal_block", "高压接线座", B(0.16, 0.06, 0.08), "ed_busbar", [0, 0.14, -0.13]);
    inv("lv_connector", "低压连接器", B(0.07, 0.05, 0.05), "ed_connector", [0.15, 0.12, 0.14]);
    inv("cool_in", "冷却进液口", C(0.02, 0.05, [0, 0, 0], 12), "ed_coolant", [-0.16, -0.14, 0.17]);
    inv("cool_out", "冷却出液口", C(0.02, 0.05, [0, 0, 0], 12), "ed_coolant", [0.16, -0.14, 0.17]);
    inv("mount_l", "左安装座", B(0.08, 0.2, 0.1), "mbt_steel_dark", [-0.18, -0.21, 0.1]);
    inv("mount_r", "右安装座", B(0.08, 0.2, 0.1), "mbt_steel_dark", [0.18, -0.21, 0.1]);
  }

  // ======================= 高压配电 / 整车控制 / 充电机 / DC-DC =======================
  const box = (id: string, name: string, geometry: GeometrySpec, material: string, pos: [number, number, number], assembly = "power_electronics") =>
    add(parts, { id, name_cn: name, name_en: name, assembly, build_layer: 1, build_order: order++, geometry, material, mate: A(pos) });
  const [hvx, hvy, hvz] = ED.HVJB;
  box("ed90.power.hvjb_housing", "高压配电盒壳", MERGE(B(0.34, 0.22, 0.3, [0, 0, 0], 0.008), B(0.36, 0.02, 0.32, [0, 0.12, 0], 0.004)), "ed_battery_shell", [hvx, hvy, hvz]);
  for (let i = 0; i < 4; i++) box(`ed90.power.hvjb_contactor_${i + 1}`, `高压接触器 ${i + 1}`, C(0.045, 0.07, [0, 0, 0], 16), "ed_connector", [hvx - 0.1 + (i % 2) * 0.2, hvy + 0.04, hvz - 0.08 + Math.floor(i / 2) * 0.16]);
  box("ed90.power.hvjb_precharge", "预充电阻", B(0.08, 0.04, 0.06), "ed_warning", [hvx + 0.12, hvy + 0.07, hvz + 0.1]);
  for (let i = 0; i < 3; i++) box(`ed90.power.hvjb_fuse_${i + 1}`, `高压熔断器 ${i + 1}`, B(0.05, 0.035, 0.09), "ed_connector", [hvx - 0.12 + i * 0.12, hvy + 0.07, hvz - 0.11]);
  box("ed90.power.hvjb_busbar", "高压母排", MERGE(B(0.28, 0.012, 0.03), B(0.28, 0.012, 0.03, [0, 0, 0.06])), "ed_busbar", [hvx, hvy + 0.11, hvz]);
  box("ed90.power.hvjb_disconnect", "手动切断开关", MERGE(C(0.04, 0.05, [0, 0, 0], 14), B(0.12, 0.02, 0.03, [0.04, 0.03, 0])), "ed_warning", [hvx, hvy + 0.14, hvz + 0.1]);
  box("ed90.power.hvjb_insulation", "绝缘监测仪", B(0.1, 0.04, 0.08), "ed_pcb", [hvx - 0.1, hvy + 0.14, hvz + 0.12]);
  box("ed90.power.hvjb_current", "霍尔电流传感器", T(0.045, 0.03, 0.04), "mbt_brass", [hvx + 0.11, hvy + 0.13, hvz - 0.04]);
  box("ed90.power.hvjb_interlock", "高压互锁插座", B(0.06, 0.04, 0.04), "ed_connector", [hvx - 0.13, hvy + 0.14, hvz - 0.06]);
  box("ed90.power.hvjb_connector_1", "高压输出连接器 1", C(0.035, 0.06, [0, 0, 0], 14), "ed_connector", [hvx - 0.12, hvy + 0.14, hvz + 0.02]);
  box("ed90.power.hvjb_connector_2", "高压输出连接器 2", C(0.035, 0.06, [0, 0, 0], 14), "ed_connector", [hvx + 0.12, hvy + 0.14, hvz + 0.02]);
  box("ed90.power.hvjb_mount_l", "配电盒左支架", B(0.06, 0.2, 0.08), "mbt_steel_dark", [hvx - 0.14, hvy - 0.16, hvz + 0.1]);
  box("ed90.power.hvjb_mount_r", "配电盒右支架", B(0.06, 0.2, 0.08), "mbt_steel_dark", [hvx + 0.14, hvy - 0.16, hvz + 0.1]);
  box("ed90.power.hvjb_label", "高压警示牌", B(0.14, 0.06, 0.004), "ed_warning", [hvx, hvy + 0.12, hvz + 0.165]);
  const [vx, vy, vz] = ED.VCU;
  box("ed90.power.vcu_housing", "整车控制器", MERGE(B(0.3, 0.2, 0.28, [0, 0, 0], 0.008), B(0.32, 0.02, 0.3, [0, 0.11, 0], 0.004)), "ed_battery_shell", [vx, vy, vz]);
  box("ed90.power.vcu_board", "VCU 主控板", B(0.26, 0.014, 0.24), "ed_pcb", [vx, vy + 0.07, vz]);
  for (let i = 0; i < 2; i++) box(`ed90.power.vcu_connector_${i + 1}`, `VCU 连接器 ${i + 1}`, B(0.07, 0.05, 0.04), "ed_connector", [vx - 0.08 + i * 0.16, vy + 0.05, vz + 0.15]);
  box("ed90.power.vcu_mount_l", "VCU 左支架", B(0.06, 0.18, 0.08), "mbt_steel_dark", [vx - 0.12, vy - 0.15, vz + 0.08]);
  box("ed90.power.vcu_mount_r", "VCU 右支架", B(0.06, 0.18, 0.08), "mbt_steel_dark", [vx + 0.12, vy - 0.15, vz + 0.08]);
  const [ox, oy, oz] = ED.OBC;
  box("ed90.power.obc_housing", "车载充电机", MERGE(B(0.32, 0.22, 0.3, [0, 0, 0], 0.008), B(0.34, 0.02, 0.32, [0, 0.12, 0], 0.004)), "ed_battery_shell", [ox, oy, oz]);
  box("ed90.power.obc_power_board_1", "OBC 功率板 1", B(0.26, 0.02, 0.22), "ed_sic", [ox, oy + 0.02, oz]);
  box("ed90.power.obc_power_board_2", "OBC 功率板 2", B(0.26, 0.02, 0.22), "ed_sic", [ox, oy + 0.06, oz]);
  box("ed90.power.obc_heatsink", "OBC 液冷冷板", B(0.3, 0.04, 0.26), "ed_coolant", [ox, oy - 0.14, oz]);
  box("ed90.power.obc_connector_hv", "OBC 高压口", C(0.035, 0.06, [0, 0, 0], 14), "ed_connector", [ox - 0.12, oy + 0.14, oz]);
  box("ed90.power.obc_connector_lv", "OBC 低压口", B(0.07, 0.05, 0.04), "ed_connector", [ox + 0.12, oy + 0.14, oz]);
  box("ed90.power.obc_mount_l", "OBC 左支架", B(0.06, 0.18, 0.08), "mbt_steel_dark", [ox - 0.13, oy - 0.15, oz + 0.08]);
  box("ed90.power.obc_mount_r", "OBC 右支架", B(0.06, 0.18, 0.08), "mbt_steel_dark", [ox + 0.13, oy - 0.15, oz + 0.08]);
  const [dx, dy, dz] = ED.DCDC;
  box("ed90.power.dcdc_housing", "DC-DC 变换器", MERGE(B(0.24, 0.12, 0.24, [0, 0, 0], 0.006), B(0.26, 0.02, 0.26, [0, 0.07, 0], 0.004)), "ed_battery_shell", [dx, dy, dz]);
  box("ed90.power.dcdc_board", "DC-DC 控制板", B(0.2, 0.012, 0.2), "ed_pcb", [dx, dy + 0.03, dz]);
  box("ed90.power.dcdc_heatsink", "DC-DC 散热片", B(0.22, 0.04, 0.22), "ed_coolant", [dx, dy - 0.07, dz]);
  for (let i = 0; i < 2; i++) box(`ed90.power.dcdc_connector_${i + 1}`, `DC-DC 接口 ${i + 1}`, B(0.06, 0.04, 0.04), "ed_connector", [dx - 0.08 + i * 0.16, dy, dz + 0.13]);
  box("ed90.power.battery_12v", "12V 蓄电池", MERGE(B(0.3, 0.2, 0.22), B(0.04, 0.03, 0.04, [-0.09, 0.115, 0]), B(0.04, 0.03, 0.04, [0.09, 0.115, 0])), "ed_battery_shell", [-0.95, 0.66, -1.4]);
  box("ed90.power.battery_12v_tray", "12V 电池托架", B(0.36, 0.05, 0.28), "mbt_steel_dark", [-0.95, 0.54, -1.4]);
  for (const s of [-1, 1]) {
    const x0 = -0.92 - (s === 1 ? 0 : 0.06);
    box(
      `ed90.power.battery_12v_cable_${s === 1 ? "pos" : "neg"}`,
      "12V 电缆",
      MERGE(
        W([x0, 0.77, -1.35], [x0, 1.15, -1.45], 0.01, s + 90),
        W([x0, 1.15, -1.45], [0.0, 1.5, -1.9], 0.01, s + 92),
      ),
      "mbt_copper",
      [0, 0, 0],
    );
  }

  // ======================= 高压线束（橙色） =======================
  for (let p = 0; p < ED.PACK_COUNT; p++) {
    const pos = packTerminal(p, true);
    const neg = packTerminal(p, false);
    const target: [number, number, number] = [0, 1.46, -1.6];
    add(parts, { id: `ed90.hv.cable_pack${p + 1}_pos`, name_cn: `电池包 ${p + 1} 高压正极线`, name_en: `pack ${p + 1} HV positive cable`, assembly: "hv", build_layer: 1, build_order: order++, geometry: W(pos, target, 0.014, 200 + p), material: "ed_hv_orange", mate: A([0, 0, 0]) });
    add(parts, { id: `ed90.hv.cable_pack${p + 1}_neg`, name_cn: `电池包 ${p + 1} 高压负极线`, name_en: `pack ${p + 1} HV negative cable`, assembly: "hv", build_layer: 1, build_order: order++, geometry: W(neg, [target[0] - 0.08, target[1], target[2]], 0.014, 220 + p), material: "ed_hv_orange", mate: A([0, 0, 0]) });
  }
  for (const side of [-1, 1] as const) {
    const tag = side === 1 ? "r" : "l";
    const inv = inverterCenter(side);
    for (let k = 0; k < 2; k++) {
      add(parts, { id: `ed90.hv.cable_inverter_${tag}_${k + 1}`, name_cn: `${side === 1 ? "右" : "左"}控制器高压线 ${k + 1}`, name_en: `${tag} inverter HV cable ${k + 1}`, assembly: "hv", build_layer: 1, build_order: order++, geometry: W([side * (0.12 + k * 0.06), 1.45, -1.6], [inv[0], inv[1] + 0.1, inv[2] + 0.08], 0.013, 240 + side * 2 + k), material: "ed_hv_orange", mate: A([0, 0, 0]) });
    }
    const motor = motorCenter(side);
    for (let ph = 0; ph < 3; ph++) {
      add(parts, { id: `ed90.hv.cable_motor_${tag}_phase${ph + 1}`, name_cn: `${side === 1 ? "右" : "左"}电机 ${ph + 1} 相线`, name_en: `${tag} motor phase ${ph + 1} cable`, assembly: "hv", build_layer: 1, build_order: order++, geometry: W([inv[0] + (ph - 1) * 0.06, inv[1] - 0.05, inv[2] - 0.1], [motor[0] - 0.04 + ph * 0.04, motor[1] + 0.31, motor[2] + 0.02], 0.012, 250 + side * 5 + ph), material: "ed_hv_orange", mate: A([0, 0, 0]) });
    }
  }
  for (let k = 0; k < 2; k++) {
    add(parts, { id: `ed90.hv.cable_obc_${k + 1}`, name_cn: `充电机高压线 ${k + 1}`, name_en: `OBC HV cable ${k + 1}`, assembly: "hv", build_layer: 1, build_order: order++, geometry: W([ox - 0.12 + k * 0.06, oy + 0.14, oz], [k === 0 ? -0.1 : 0.04, 1.42, hvz - 0.1], 0.012, 270 + k), material: "ed_hv_orange", mate: A([0, 0, 0]) });
    add(parts, { id: `ed90.hv.cable_dcdc_${k + 1}`, name_cn: `DC-DC 高压线 ${k + 1}`, name_en: `DC-DC HV cable ${k + 1}`, assembly: "hv", build_layer: 1, build_order: order++, geometry: W([dx - 0.08 + k * 0.16, dy, dz + 0.13], [k === 0 ? 0.1 : -0.06, 1.45, hvz + 0.12], 0.011, 280 + k), material: "ed_hv_orange", mate: A([0, 0, 0]) });
  }
  add(parts, { id: "ed90.hv.clamps", name_cn: "高压线卡箍 ×10", name_en: "HV cable clamp", assembly: "hv", build_layer: 1, build_order: order++, geometry: MERGE(T(0.025, 0.018, 0.03, [0, 0, 0], 12), B(0.06, 0.03, 0.03, [0.03, -0.02, 0], 0.002)), material: "mbt_steel_dark", mate: A([0, 0, 0]), instances: 10, indexed: true, instance_layout: "ed90.hv.clamps" });
  for (let i = 0; i < 4; i++) box(`ed90.hv.connector_${i + 1}`, `高压连接器 ${i + 1}`, C(0.035, 0.07, [0, 0, 0], 14), "ed_connector", [i < 2 ? -0.13 + i * 0.26 : 0, 1.48, -1.5 - (i % 2) * 0.2], "hv");

  // ======================= 冷却系统 =======================
  box("ed90.cooling.radiator", "电池/电机散热器", MERGE(B(0.9, 0.06, 0.5, [0, 0, 0], 0.006), ...Array.from({ length: 12 }, (_, i) => B(0.86, 0.02, 0.02, [0, 0.04, -0.22 + i * 0.04], 0.002))), "ed_coolant", [0, 1.78, -2.9], "cooling_ev");
  for (const s of [-1, 1]) {
    box(`ed90.cooling.fan_${s === 1 ? "r" : "l"}`, `${s === 1 ? "右" : "左"}散热风扇`, MERGE(C(0.12, 0.03, [0, 0, 0], 18), B(0.22, 0.02, 0.03, [0, 0.02, 0], 0.001), B(0.03, 0.02, 0.22, [0, 0.02, 0], 0.001)), "ed_connector", [s * 0.22, 1.84, -2.9], "cooling_ev");
    box(`ed90.cooling.fan_shroud_${s === 1 ? "r" : "l"}`, "风扇导风罩", T(0.16, 0.13, 0.05, [0, 0, 0], 20), "mbt_steel_dark", [s * 0.22, 1.82, -2.9], "cooling_ev");
  }
  box("ed90.cooling.pump", "电子冷却泵", MERGE(C(0.07, 0.1, [0, 0, 0], 18), C(0.03, 0.06, [0, 0.11, 0], 12)), "mbt_alu", [0.5, 1.05, -3.12], "cooling_ev");
  box("ed90.cooling.reservoir", "冷却液膨胀罐", MERGE(C(0.09, 0.16, [0, 0, 0], 18), C(0.02, 0.04, [0, 0.1, 0], 10)), "mbt_alu", [-0.5, 1.08, -3.12], "cooling_ev");
  box("ed90.cooling.chiller", "电池冷却器", B(0.2, 0.16, 0.16), "ed_coolant", [0.25, 1.1, -3.15], "cooling_ev");
  box("ed90.cooling.thermostat", "冷却节温器", C(0.05, 0.08, [0, 0, 0], 16), "mbt_brass", [-0.25, 1.1, -3.15], "cooling_ev");
  for (let p = 0; p < ED.PACK_COUNT; p++) {
    const c = packCenter(p);
    box(`ed90.cooling.hose_pack${p + 1}`, `电池包 ${p + 1} 冷却软管`, W([c[0] + 0.16, c[1] - 0.1, c[2] + 0.26], [0.25, 1.04, -3.1], 0.016, 300 + p), "ed_coolant", [0, 0, 0], "cooling_ev");
  }
  for (const s of [-1, 1] as const) {
    const m = motorCenter(s);
    box(`ed90.cooling.hose_motor_${s === 1 ? "r" : "l"}`, `${s === 1 ? "右" : "左"}电机冷却软管`, W([s * 0.5, 1.05, -3.12], [m[0], m[1] + 0.2, m[2] - 0.1], 0.016, 310 + s), "ed_coolant", [0, 0, 0], "cooling_ev");
  }
  box("ed90.cooling.hose_radiator_feed", "散热器进液管", W([0.25, 1.78, -2.75], [0.5, 1.15, -3.0], 0.018, 320), "ed_coolant", [0, 0, 0], "cooling_ev");
  box("ed90.cooling.hose_radiator_return", "散热器回液管", W([-0.25, 1.78, -2.75], [-0.5, 1.15, -3.0], 0.018, 321), "ed_coolant", [0, 0, 0], "cooling_ev");
  for (let i = 0; i < 4; i++) box(`ed90.cooling.sensor_${i + 1}`, `冷却温度传感器 ${i + 1}`, C(0.02, 0.05, [0, 0, 0], 10), "mbt_brass", [-0.4 + i * 0.26, 1.0, -3.16], "cooling_ev");

  // ======================= 电驱座舱仪表 =======================
  const cp = (suffix: string, name: string, geometry: GeometrySpec, material: string, pos: [number, number, number], rot?: [number, number, number]) =>
    add(parts, { id: `ed90.cockpit.${suffix}`, name_cn: `电驱仪表 ${name}`, name_en: `EV ${name}`, assembly: "ev_cockpit", build_layer: 3, build_order: order++, geometry, material, mate: A(pos, rot) });
  cp("panel", "仪表屏框", MERGE(B(0.52, 0.24, 0.04, [0, 0, 0], 0.006), B(0.46, 0.18, 0.01, [0, 0, -0.025], 0.002)), "mbt_paint_dark", [-0.55, 1.45, 1.9], [12, 0, 0]);
  const gauge = (suffix: string, name: string, x: number) => {
    cp(`${suffix}_face`, name, C(0.055, 0.014, [0, 0, 0], 20), "ed_gauge_face", [x, 1.47, 1.87], [90, 0, 0]);
    cp(`${suffix}_ring`, `${name} 圈`, T(0.065, 0.052, 0.018, [0, 0, 0], 20), "mbt_steel", [x, 1.47, 1.88], [90, 0, 0]);
    cp(`${suffix}_needle`, `${name} 指针`, B(0.006, 0.045, 0.004, [0, 0.018, 0], 0.001), "ed_gauge_needle", [x, 1.47, 1.86], [90, 0, 0]);
  };
  gauge("soc", "电量表", -0.74);
  gauge("power", "功率表", -0.58);
  gauge("rpm_l", "左电机转速表", -0.42);
  gauge("rpm_r", "右电机转速表", -0.26);
  cp("temp", "电池温度表", B(0.08, 0.04, 0.02, [0, 0, 0], 0.002), "ed_gauge_face", [-0.7, 1.36, 1.88], [12, 0, 0]);
  cp("charge_lamp", "充电指示灯", C(0.02, 0.02, [0, 0, 0], 12), "ed_charge", [-0.55, 1.36, 1.87], [90, 0, 0]);
  cp("mode_selector", "驱动模式旋钮", C(0.035, 0.025, [0, 0, 0], 16), "mbt_brass", [-0.4, 1.36, 1.88], [90, 0, 0]);
  cp("regen_paddle", "能量回收拨片", B(0.04, 0.12, 0.03, [0, 0, 0], 0.003), "ed_warning", [-0.24, 1.38, 1.89], [20, 0, 0]);
  cp("hv_interlock", "高压互锁指示", B(0.06, 0.04, 0.02), "ed_warning", [-0.26, 1.32, 1.88]);
  cp("warning_lamp", "热失控警报灯", C(0.018, 0.02, [0, 0, 0], 12), "ed_warning", [-0.55, 1.32, 1.87], [90, 0, 0]);
  cp("harness", "电驱仪表线束", W([-0.78, 1.32, 1.91], [-0.3, 1.45, 1.92], 0.012, 330), "ed_hv_orange", [0, 0, 0]);
  cp("label", "电驱仪表铭牌", B(0.16, 0.04, 0.004), "ed_warning", [-0.55, 1.58, 1.9]);

  // ======================= 车身电驱外部细节 =======================
  const q = ED.CHARGE_PORT;
  const port = (suffix: string, name: string, geometry: GeometrySpec, material: string, offset: [number, number, number], rot?: [number, number, number], partNode?: string, extra: Partial<PartDefinition> = {}) =>
    add(parts, { id: `ed90.body.charge_port_${suffix}`, name_cn: `快充口 ${name}`, name_en: `charge port ${name}`, assembly: "ev_exterior", build_layer: 5, build_order: order++, geometry, material, node: partNode, mate: A(partNode ? offset : [q[0] + offset[0], q[1] + offset[1], q[2] + offset[2]], rot), ...extra });
  port("housing", "底座", MERGE(B(0.12, 0.22, 0.2, [0, 0, 0], 0.008), T(0.075, 0.055, 0.03, [0.065, 0, 0], 18)), "mbt_paint", [0, 0, 0], [0, 90, 0]);
  port("socket", "插座", C(0.055, 0.04, [0, 0, 0], 18), "ed_connector", [0.075, 0, 0], [0, 0, 90]);
  port("flap", "装甲盖", MERGE(B(0.02, 0.18, 0.16, [0, 0, 0], 0.005), B(0.04, 0.03, 0.04, [0.01, 0.07, 0], 0.002)), "mbt_paint", [0.03, 0.02, 0.1], [0, 90, 0], CHARGE_FLAP_NODE);
  port("hinge", "铰链", C(0.012, 0.08, [0, 0, 0], 10), "mbt_steel", [0.03, 0.1, 0.02], [0, 0, 90]);
  port("latch", "锁扣", B(0.03, 0.02, 0.03), "mbt_steel", [0.05, -0.1, 0.02]);
  port("label", "高压快充标识", B(0.002, 0.06, 0.1), "ed_warning", [0.08, 0.0, 0.02]);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    port(`pin_${i + 1}`, `端子 ${i + 1}`, C(0.006, 0.02, [0, 0, 0], 8), "ed_busbar", [0.095, Math.cos(a) * 0.035, Math.sin(a) * 0.035], [0, 0, 90]);
  }
  box("ed90.body.hv_warning_rear", "车尾高压警示牌", B(0.24, 0.1, 0.004), "ed_warning", [0, 1.25, -3.29]);
  box("ed90.body.hv_warning_left", "左侧高压警示牌", B(0.004, 0.12, 0.2), "ed_warning", [-1.31, 1.3, -2.3]);
  box("ed90.body.hv_warning_right", "右侧高压警示牌", B(0.004, 0.12, 0.2), "ed_warning", [1.31, 1.3, -1.9]);
  box("ed90.body.ed_badge", "ED-90 电驱标识", B(0.3, 0.08, 0.005), "ed_warning", [1.31, 1.5, -0.3]);
  box("ed90.body.cooling_vent", "电池舱冷却百叶", { type: "louver", count: 7, w: 1.0, h: 0.7, slantDeg: 30, t: 0.02 }, "mbt_steel_dark", [0, 1.79, -2.3]);
  box("ed90.body.rear_cooling_grille", "尾部电池冷却散热器", { type: "louver", count: 8, w: 1.5, h: 0.62, slantDeg: 32, t: 0.022 }, "ed_coolant", [0, 1.28, -3.31]);
  box("ed90.body.livery_l", "新能源涂装带（左）", B(0.015, 0.12, 1.7, [0, 0, 0], 0.002), "ed_livery", [-1.35, 1.5, -0.5]);
  box("ed90.body.livery_r", "新能源涂装带（右）", B(0.015, 0.12, 1.7, [0, 0, 0], 0.002), "ed_livery", [1.35, 1.5, -0.5]);
  box("ed90.body.hv_service_loop", "后甲板高压检修环线", W([-0.55, 1.7, -2.4], [0.55, 1.7, -2.4], 0.018, 340), "ed_hv_orange", [0, 0, 0]);

  // ======================= FX =======================
  const fx = (suffix: string, name: string, geometry: GeometrySpec, material: string, pos: [number, number, number], extra: Partial<PartDefinition> = {}) =>
    add(parts, { id: `ed90.fx.${suffix}`, name_cn: name, name_en: name, assembly: "ev_fx", build_layer: 5, build_order: order++, geometry, material, mate: A(pos), tags: ["fx"], ...extra });
  fx("charger_post", "充电桩", MERGE(B(0.3, 1.2, 0.3, [0, 0.6, 0], 0.01), B(0.22, 0.32, 0.04, [0, 1.02, 0.16], 0.006), B(0.18, 0.08, 0.08, [0, 0.8, -0.2], 0.004)), "mbt_steel_dark", ED.CHARGE_POST);
  fx("charge_cable", "快充电缆", W([2.4, 1.05, -2.75], [q[0] + 0.12, q[1], q[2]], 0.02, 350), "ed_hv_orange", [0, 0, 0]);
  fx("charge_plug", "快充枪", MERGE(B(0.08, 0.08, 0.14, [0, 0, 0], 0.006), C(0.03, 0.12, [0, 0, -0.06], 12)), "ed_connector", [q[0] + 0.15, q[1], q[2]]);
  fx("charge_arc", "充电电弧", C(0.06, 0.03, [0, 0, 0], 12), "ed_arc", [q[0] + 0.1, q[1], q[2]]);
  const hc = packCenter(HIT_PACK);
  fx(
    "battery_fire",
    "电池热失控火球",
    MERGE(
      { type: "sphere", r: 0.24, segments: 14 },
      { type: "sphere", r: 0.16, segments: 12, at: [0.16, 0.12, 0.04] },
      { type: "sphere", r: 0.12, segments: 10, at: [-0.14, 0.18, 0.06] },
    ),
    "ed_fire",
    [hc[0], 2.0, hc[2] - 0.2],
  );
  fx(
    "battery_smoke",
    "电池热失控烟",
    MERGE(
      { type: "sphere", r: 0.3, segments: 12 },
      { type: "sphere", r: 0.24, segments: 10, at: [0.2, 0.32, 0.05] },
      { type: "sphere", r: 0.2, segments: 10, at: [-0.18, 0.6, 0.02] },
    ),
    "ed_smoke",
    [hc[0], 2.2, hc[2] - 0.2],
  );
  add(parts, { id: "ed90.fx.battery_sparks", name_cn: "电池短路火星", name_en: "battery sparks", assembly: "ev_fx", build_layer: 5, build_order: order++, geometry: { type: "sphere", r: 0.022, segments: 8 }, material: "ed_arc", mate: A([0, 0, 0]), instances: 10, indexed: true, instance_layout: "ed90.fx.battery_sparks", tags: ["fx"] });
  fx("regen_glow_l", "左侧能量回收光带", B(0.02, 0.04, 1.6, [0, 0, 0], 0.002), "ed_charge", [-1.36, 1.35, -0.8]);
  fx("regen_glow_r", "右侧能量回收光带", B(0.02, 0.04, 1.6, [0, 0, 0], 0.002), "ed_charge", [1.36, 1.35, -0.8]);
  fx("power_flow", "高压能量流光带", B(0.12, 0.03, 1.2, [0, 0, 0], 0.002), "ed_hv_glow", [0, 1.5, -2.15]);

  return parts;
}

const CONTACTS: ExpectedContactRule[] = [
  {
    family: "ed-battery-internal",
    a: `${P}battery.pack*`,
    b: `${P}battery.pack*`,
    reason: "电芯/模组/液冷板/壳体/BMS 在电池包内叠层安装（电芯入支架、模组入包、冷却板贴底）",
    maxDepthMm: 35,
    allowDisplaced: true,
    allowSuspect: true,
  },
  {
    family: "ed-motor-internal",
    a: `${P}motor.*`,
    b: `${P}motor.*`,
    reason: "定子/转子/磁钢/轴承/旋变/机脚同轴与端盖压装（转子在定子内，油隙/气隙；转子轴压入转子铁芯）",
    maxDepthMm: 95,
    allowDisplaced: true,
    allowSuspect: true,
  },
  {
    family: "ed-inverter-internal",
    a: `${P}inverter.*`,
    b: `${P}inverter.*`,
    reason: "SiC 模块、母线电容、驱动板、冷板、安装座在控制器壳内叠装",
    maxDepthMm: 45,
    allowDisplaced: true,
    allowSuspect: true,
  },
  {
    family: "ed-power-electronics",
    a: `${P}power.*`,
    b: `${P}power.*`,
    reason: "高压配电/VCU/OBC/DC-DC 内部器件在壳体内叠装（接触器/熔断器/SiC 模块/母排）",
    maxDepthMm: 65,
    allowDisplaced: true,
    allowSuspect: true,
  },
  {
    family: "ed-hv-internal",
    a: `${P}hv.*`,
    b: `${P}hv.*`,
    reason: "橙色高压线束/连接器/卡箍成束布置（线束交叉/绑扎）",
    maxDepthMm: 20,
    allowDisplaced: true,
    allowSuspect: true,
  },
  {
    family: "ed-power-power",
    a: `${P}battery.*`,
    b: `${P}motor.*`,
    reason: "电池包与电机/减速器在动力舱内相邻布置（安装间隙）",
    maxDepthMm: 25,
    allowDisplaced: true,
  },
  {
    family: "ed-power-inverter",
    a: `${P}battery.*`,
    b: `${P}inverter.*`,
    reason: "控制器安装在电池包上方支架上（减振垫压紧）",
    maxDepthMm: 30,
    allowDisplaced: true,
  },
  {
    family: "ed-hv-components",
    a: `${P}hv.*`,
    b: `${P}battery.*`,
    reason: "高压线束端部接入电池包高压端子（插接件锁止）",
    maxDepthMm: 30,
    allowDisplaced: true,
  },
  {
    family: "ed-hv-electronics",
    a: `${P}hv.*`,
    b: `${P}power.*`,
    reason: "高压线束端部穿过配电盒/充电机/DC-DC 壳体进入高压接口（线束护套穿过面板）",
    maxDepthMm: 105,
    allowDisplaced: true,
  },
  {
    family: "ed-hv-inverter",
    a: `${P}hv.*`,
    b: `${P}inverter.*`,
    reason: "高压线束穿过控制器壳体接入直流母排（护套/插接件）",
    maxDepthMm: 65,
    allowDisplaced: true,
  },
  {
    family: "ed-hv-motor",
    a: `${P}hv.*`,
    b: `${P}motor.*`,
    reason: "三相高压线接入电机接线盒（相端子）",
    maxDepthMm: 30,
    allowDisplaced: true,
  },
  {
    family: "ed-cooling-components",
    a: `${P}cooling.*`,
    b: `${P}battery.*`,
    reason: "冷却软管接入电池包液冷板进出液口（快插接头）",
    maxDepthMm: 25,
    allowDisplaced: true,
  },
  {
    family: "ed-cooling-motor",
    a: `${P}cooling.*`,
    b: `${P}motor.*`,
    reason: "电机冷却水套与软管快插连接",
    maxDepthMm: 25,
    allowDisplaced: true,
  },
  {
    family: "ed-cooling-hull",
    a: `${P}cooling.*`,
    b: "ed90.hull.*",
    reason: "散热器/风扇安装在动力舱顶甲上",
    maxDepthMm: 45,
    allowDisplaced: true,
    allowSuspect: true,
  },
  {
    family: "ed-power-hull",
    a: `${P}*`,
    b: "ed90.hull.*",
    reason: "电池包/电机/电控/线束安装在车体动力舱内（安装脚、支架、隔板过孔）",
    maxDepthMm: 55,
    allowDisplaced: true,
    allowSuspect: true,
  },
  {
    family: "ed-cooling-internal",
    a: `${P}cooling.*`,
    b: `${P}cooling.*`,
    reason: "电子水泵/膨胀罐/冷却器/散热器/软管/传感器在冷却回路内插接与绑扎",
    maxDepthMm: 60,
    allowDisplaced: true,
    allowSuspect: true,
  },
  {
    family: "ed-cooling-battery",
    a: `${P}cooling.*`,
    b: `${P}battery.*`,
    reason: "冷却泵/膨胀罐/冷却软管贴近电池包布置（支架/快插接头压紧）",
    maxDepthMm: 45,
    allowDisplaced: true,
    allowSuspect: true,
  },
  {
    family: "ed-charge-port-internal",
    a: `${P}body.charge_port_*`,
    b: `${P}body.charge_port_*`,
    reason: "快充插座/端子/护盖/铰链/锁扣装入充电口壳体（同轴插装，端子插入插座）",
    maxDepthMm: 50,
    allowDisplaced: true,
    allowSuspect: true,
  },
  {
    family: "ed-cockpit-internal",
    a: `${P}cockpit.*`,
    b: `${P}cockpit.*`,
    reason: "电驱仪表表圈/表盘/指针/旋钮/线束在仪表屏框上装配",
    maxDepthMm: 30,
    allowDisplaced: true,
    allowSuspect: true,
  },
  {
    family: "ed-body-detail",
    a: `${P}body.*`,
    b: `${P}body.*`,
    reason: "高压警示牌/ED-90 标识/新能源涂装带贴在车体表面（铭牌/贴花厚度 ≤5mm）",
    maxDepthMm: 5,
    allowDisplaced: true,
    allowSuspect: true,
  },
  {
    family: "ed-body-power",
    a: `${P}body.*`,
    b: `${P}inverter.*`,
    reason: "电池舱冷却百叶/检修环线与控制器在动力舱顶部的相邻包络",
    maxDepthMm: 25,
    allowDisplaced: true,
    allowSuspect: true,
  },
  {
    family: "ed-hv-cooling",
    a: `${P}hv.*`,
    b: `${P}cooling.*`,
    reason: "高压线束与冷却软管在动力舱内并行走线（卡箍/扎带固定）",
    maxDepthMm: 20,
    allowDisplaced: true,
    allowSuspect: true,
  },
  {
    family: "ed-power-running",
    a: `${P}*`,
    b: "ed90.running.*",
    reason: "电机减速器/输出轴与主动轮、后悬挂在动力舱两侧的安装包络",
    maxDepthMm: 45,
    allowDisplaced: true,
    allowSuspect: true,
  },
  {
    family: "ed-motor-sprocket",
    a: `${P}motor.*`,
    b: "ed90.running.sprocket*",
    reason: "电机输出轴花键插入主动轮轮毂（减速器输出端与主动轮同轴连接）",
    maxDepthMm: 95,
    allowDisplaced: true,
    allowSuspect: true,
  },
  {
    family: "ed-power-interior",
    a: `${P}*`,
    b: "ed90.interior.*",
    reason: "电驱仪表与驾驶舱仪表板/线束相邻（电驱仪表加装在原仪表台上）",
    maxDepthMm: 45,
    allowDisplaced: true,
    allowSuspect: true,
  },
  {
    family: "ed-body-hull",
    a: `${P}body.*`,
    b: "ed90.hull.*",
    reason: "快充口、高压警示牌、ED-90 标识、冷却百叶、检修环线固定在车体侧甲/尾板/顶甲上",
    maxDepthMm: 45,
    allowDisplaced: true,
    allowSuspect: true,
  },
];

export function makePowerRegistry(): ModelRegistry {
  return {
    model: "ed90",
    title: "ED-90 电驱动力",
    constants: ED_CONSTANTS,
    assemblies: [
      { id: "battery", name_cn: "动力电池组", name_en: "traction battery", explode: [0, 0.7, -0.4] },
      { id: "motors", name_cn: "双驱动电机", name_en: "dual drive motors", explode: [1.1, 0.3, -0.3] },
      { id: "power_electronics", name_cn: "电控与高压配电", name_en: "power electronics", explode: [0, 1.2, 0.3] },
      { id: "hv", name_cn: "高压线束", name_en: "HV harness", explode: [0, 0.9, 0.6] },
      { id: "cooling_ev", name_cn: "电驱冷却", name_en: "EV cooling", explode: [0, 1.4, -0.5] },
      { id: "ev_cockpit", name_cn: "电驱仪表", name_en: "EV cockpit", explode: [0, 0.4, 0.8] },
      { id: "ev_exterior", name_cn: "电驱外部细节", name_en: "EV exterior", explode: [1.4, 0.4, 0] },
      { id: "ev_fx", name_cn: "电驱特效件", name_en: "EV FX", explode: [0, 1.0, 0] },
    ],
    nodes: POWER_NODES,
    materials: EDRIVE_MATERIALS,
    parts: buildParts(),
    source_notes:
      "ED-90 电驱坦克：6 组 800V 动力电池包（3 模组×12 芯/包，共 216 芯，液冷板+BMS）、左右独立驱动电机（定子/转子/永磁体/旋变/减速器逐件）、SiC 电机控制器×2、VCU/高压配电盒/车载充电机/DC-DC、橙色高压线束与快充口、电池/电机液冷；复用 MBT-90 的车体/炮塔/120mm 滑膛炮/转盘自动装弹机/行动装置。",
    expectedContacts: CONTACTS,
  };
}
