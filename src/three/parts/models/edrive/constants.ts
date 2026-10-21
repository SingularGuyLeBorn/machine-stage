// ============================================================================
// models/edrive/constants —— ED-90 电驱坦克布置常量
//
// 复用 MBT-90 的车体/行动/炮塔坐标；柴油机与变速箱整体移除后，
// 原动力舱改为电池包 + 双电机 + 电控 + 冷却。坐标同 MBT：+X 右、+Y 上、+Z 车头。
// ============================================================================

export const ED = {
  // 动力电池包：后舱 3 排 × 左右 2 列
  PACK_COUNT: 6,
  PACK_X: 0.35,
  PACK_Y: 0.83,
  PACK_Z0: -1.65,
  PACK_DZ: 0.6,
  PACK_W: 0.52,
  PACK_H: 0.42,
  PACK_D: 0.52,

  MODULES_PER_PACK: 3,
  MODULE_DZ: 0.17,
  MODULE_W: 0.46,
  MODULE_H: 0.26,
  MODULE_D: 0.15,
  CELLS_PER_MODULE: 12,

  // 双电机（左右独立，轴向 X）
  MOTOR_X: 0.8,
  MOTOR_Y: 0.72,
  MOTOR_Z: -2.9,
  MOTOR_R: 0.19,
  MOTOR_LEN: 0.42,

  // 电机控制器
  INVERTER_X: 0.62,
  INVERTER_Y: 1.34,
  INVERTER_Z: -2.35,

  // 高压配电 / 整车控制 / 充电机 / DC-DC
  HVJB: [0, 1.32, -1.6] as [number, number, number],
  VCU: [0, 1.32, -2.2] as [number, number, number],
  OBC: [0, 1.32, -2.8] as [number, number, number],
  DCDC: [0, 1.55, -1.9] as [number, number, number],

  // 充电口（右后侧甲外）
  CHARGE_PORT: [1.32, 1.22, -2.75] as [number, number, number],
  CHARGE_POST: [2.55, 0, -2.75] as [number, number, number],

  // 电气规格（展示用）
  PACK_VOLTAGE: 800,
  PACK_CAPACITY_KWH: 18.6,
  MOTOR_PEAK_KW: 600,
  MOTOR_PEAK_NM: 2400,
  MOTOR_MAX_RPM: 5200,
  SOC_START: 86,
} as const;

export function packCenter(index: number): [number, number, number] {
  const side = index % 2 === 0 ? 1 : -1;
  const row = Math.floor(index / 2);
  return [side * ED.PACK_X, ED.PACK_Y, ED.PACK_Z0 - row * ED.PACK_DZ];
}

/** 注册表 constants 只接受数值/字符串；数组型布置常量单独导出。 */
export const ED_CONSTANTS: Record<string, number | string> = Object.fromEntries(
  Object.entries(ED).filter(([, value]) => typeof value === "number" || typeof value === "string"),
) as Record<string, number | string>;

export const MOTOR_NODES = ["ED_Motor_L", "ED_Motor_R"] as const;
export const MOTOR_L_NODE = MOTOR_NODES[0];
export const MOTOR_R_NODE = MOTOR_NODES[1];
export const CHARGE_FLAP_NODE = "ED_ChargeFlap";

export const EV_FX = {
  chargerPost: "ed90.fx.charger_post",
  chargeCable: "ed90.fx.charge_cable",
  chargePlug: "ed90.fx.charge_plug",
  chargeArc: "ed90.fx.charge_arc",
  batteryFire: "ed90.fx.battery_fire",
  batterySmoke: "ed90.fx.battery_smoke",
  batterySparks: "ed90.fx.battery_sparks",
  regenGlowL: "ed90.fx.regen_glow_l",
  regenGlowR: "ed90.fx.regen_glow_r",
  powerFlow: "ed90.fx.power_flow",
} as const;

export const HIT_PACK = 4;
