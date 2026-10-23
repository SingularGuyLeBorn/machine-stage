import type { AssembledModel } from "../../assembler/assembler";

// ============================================================================
// models/type055/motion —— 055 状态动画
// idle 系泊（雷达慢转）/ engine COGAG 双桨+雷达 / weapons 主炮旋回+近防跟踪
// ============================================================================

const GUN_NODE = "CV_055_Gun";
const GUN_BARREL_NODE = "CV_055_GunBarrel";
const CIWS_FWD = "CV_055_Ciws_fwd";
const CIWS_AFT = "CV_055_Ciws_aft";
const RADAR_NODE = "CV_055_Radar";
const PROP_L = "CV_055_PropL";
const PROP_R = "CV_055_PropR";

const smooth = (v: number) => {
  const u = Math.max(0, Math.min(1, v));
  return u * u * (3 - 2 * u);
};

export function animateType055(assembled: AssembledModel, seconds: number, state = "idle"): void {
  const t = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const weapons = state === "weapons";
  const engine = state === "engine" || weapons;

  const gun = assembled.getNode(GUN_NODE);
  if (gun) gun.rotation.y = weapons ? Math.sin(t * 0.35) * 0.72 : 0;
  const barrel = assembled.getNode(GUN_BARREL_NODE);
  if (barrel) barrel.rotation.x = -0.08 - (weapons ? 0.22 * smooth((Math.sin(t * 0.5) + 1) / 2) : 0);

  const ciwsFwd = assembled.getNode(CIWS_FWD);
  if (ciwsFwd) ciwsFwd.rotation.y = weapons ? Math.sin(t * 0.9) * 0.55 : 0;
  const ciwsAft = assembled.getNode(CIWS_AFT);
  if (ciwsAft) ciwsAft.rotation.y = Math.PI + (weapons ? Math.sin(t * 0.8 + 1.4) * 0.55 : 0);

  const radar = assembled.getNode(RADAR_NODE);
  if (radar) radar.rotation.y = t * (engine ? 2.4 : 0.7);

  for (const node of [PROP_L, PROP_R]) {
    const prop = assembled.getNode(node);
    if (prop) prop.rotation.z = engine ? t * (node === PROP_L ? 7.0 : -7.0) : 0;
  }
}

export const TYPE055_ANIMATED_STATES = ["engine", "weapons"] as const;

export const TYPE055_STATE_LABELS = [
  { id: "idle", label: "系泊检查", hint: "雷达慢转；主炮/近防归零，双桨静止" },
  { id: "engine", label: "COGAG 动力运转", hint: "四台燃气轮机并车，双轴双桨转动，导航雷达加速" },
  { id: "weapons", label: "主炮/近防跟踪", hint: "130mm 炮塔旋回俯仰，前后 1130 近防随动跟踪" },
] as const;
