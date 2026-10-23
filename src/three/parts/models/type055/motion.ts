import type { AssembledModel } from "../../assembler/assembler";

// ============================================================================
// models/type055/motion —— 055 状态动画
// idle 系泊（雷达慢转）/ engine COGAG 双桨+雷达 / weapons 主炮旋回+近防跟踪
// launch VLS 冷发射：井盖开启 → 弹射出筒 → 点火尾焰 → 收缩离场
// ============================================================================

const GUN_NODE = "CV_055_Gun";
const GUN_BARREL_NODE = "CV_055_GunBarrel";
const CIWS_FWD = "CV_055_Ciws_fwd";
const CIWS_AFT = "CV_055_Ciws_aft";
const RADAR_NODE = "CV_055_Radar";
const PROP_L = "CV_055_PropL";
const PROP_R = "CV_055_PropR";

const HERO_TAGS = ["fwd_2", "fwd_3", "fwd_4", "aft_2", "aft_3", "aft_4"] as const;
const MISSILE_REST_Y = 10.4;
const LAUNCH_CYCLE = 10.5;
const LAUNCH_STAGGER = 0.6;
const LAUNCH_RISE = 34;

const smooth = (v: number) => {
  const u = Math.max(0, Math.min(1, v));
  return u * u * (3 - 2 * u);
};
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

function animateLaunch(assembled: AssembledModel, t: number, active: boolean): void {
  for (const [index, tag] of HERO_TAGS.entries()) {
    const lid = assembled.getNode(`CV_055_VlsLid_${tag}`);
    const missile = assembled.getNode(`CV_055_VlsMissile_${tag}`);
    const flame = assembled.getPart(`type055.vls.flame_${tag}`);
    if (!lid || !missile) continue;

    const local = active
      ? (((t - index * LAUNCH_STAGGER) % LAUNCH_CYCLE) + LAUNCH_CYCLE) % LAUNCH_CYCLE
      : 0;
    const open =
      active ? smooth(clamp01((local - 0.15) / 0.9)) * (1 - smooth(clamp01((local - 6.6) / 0.7))) : 0;
    lid.rotation.x = -1.32 * open;

    const visible = active && local > 1.0 && local < 5.6;
    const rise = active ? LAUNCH_RISE * Math.pow(clamp01((local - 1.0) / 3.8), 2) : 0;
    const shrink = active ? 1 - smooth(clamp01((local - 4.9) / 0.6)) : 0;
    missile.position.y = MISSILE_REST_Y + rise;
    missile.scale.setScalar(visible ? Math.max(0, shrink) : 0);
    if (flame) flame.object.visible = visible && local > 2.7;
  }
}

export function animateType055(assembled: AssembledModel, seconds: number, state = "idle"): void {
  const t = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const weapons = state === "weapons";
  const engine = state === "engine" || weapons;
  const launch = state === "launch";

  const gun = assembled.getNode(GUN_NODE);
  if (gun) gun.rotation.y = weapons ? Math.sin(t * 0.35) * 0.72 : 0;
  const barrel = assembled.getNode(GUN_BARREL_NODE);
  if (barrel) barrel.rotation.x = -0.08 - (weapons ? 0.22 * smooth((Math.sin(t * 0.5) + 1) / 2) : 0);

  const ciwsFwd = assembled.getNode(CIWS_FWD);
  if (ciwsFwd) ciwsFwd.rotation.y = weapons ? Math.sin(t * 0.9) * 0.55 : 0;
  const ciwsAft = assembled.getNode(CIWS_AFT);
  if (ciwsAft) ciwsAft.rotation.y = Math.PI + (weapons ? Math.sin(t * 0.8 + 1.4) * 0.55 : 0);

  const radar = assembled.getNode(RADAR_NODE);
  if (radar) radar.rotation.y = t * (engine ? 2.4 : launch ? 1.4 : 0.7);

  for (const node of [PROP_L, PROP_R]) {
    const prop = assembled.getNode(node);
    if (prop) prop.rotation.z = engine ? t * (node === PROP_L ? 7.0 : -7.0) : 0;
  }

  animateLaunch(assembled, t, launch);
}

export const TYPE055_ANIMATED_STATES = ["engine", "weapons", "launch"] as const;

export const TYPE055_STATE_LABELS = [
  { id: "idle", label: "系泊检查", hint: "雷达慢转；主炮/近防归零，双桨静止，VLS 井盖闭锁" },
  { id: "engine", label: "COGAG 动力运转", hint: "四台燃气轮机并车，双轴双桨转动，导航雷达加速" },
  { id: "weapons", label: "主炮/近防跟踪", hint: "130mm 炮塔旋回俯仰，前后 1130 近防随动跟踪" },
  { id: "launch", label: "VLS 冷发射", hint: "首尾 6 格井盖开启，导弹冷弹射出筒、点火后离场" },
] as const;
