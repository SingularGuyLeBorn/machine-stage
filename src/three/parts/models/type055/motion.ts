import type { AssembledModel } from "../../assembler/assembler";
import { MISSILES, VLS_HEROES, missileRestY } from "./vls";

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
const HANGAR_DOORS = ["CV_055_HangarDoor_L", "CV_055_HangarDoor_R"] as const;
const PAD_MAIN_ROTOR = "CV_055_Z20_pad_MainRotor";
const PAD_TAIL_ROTOR = "CV_055_Z20_pad_TailRotor";
const GT_ROTORS = ["CV_055_GT1_Rotor", "CV_055_GT2_Rotor", "CV_055_GT3_Rotor", "CV_055_GT4_Rotor"] as const;

const LAUNCH_CYCLE = 11.0;
const LAUNCH_STAGGER = 0.5;
const LAUNCH_RISE = 34;

const smooth = (v: number) => {
  const u = Math.max(0, Math.min(1, v));
  return u * u * (3 - 2 * u);
};
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

function animateLaunch(assembled: AssembledModel, t: number, active: boolean): void {
  for (const [index, hero] of VLS_HEROES.entries()) {
    const tag = hero.tag;
    const spec = MISSILES[hero.type];
    const lid = assembled.getNode(`CV_055_VlsLid_${tag}`);
    const missile = assembled.getNode(`CV_055_VlsMissile_${tag}`);
    const isYj21 = hero.type === "yj21";
    const fins = assembled.getPart(isYj21 ? `type055.vls.fins_booster_${tag}` : `type055.vls.fins_${tag}`);
    const gliderFins = isYj21 ? assembled.getPart(`type055.vls.fins_glider_${tag}`) : undefined;
    const flame = assembled.getPart(`type055.vls.flame_${tag}`);
    const gliderFlame = isYj21 ? assembled.getPart(`type055.vls.glider_flame_${tag}`) : undefined;
    if (!lid || !missile) continue;

    const local = active
      ? (((t - index * LAUNCH_STAGGER) % LAUNCH_CYCLE) + LAUNCH_CYCLE) % LAUNCH_CYCLE
      : 0;
    // 055 开盖约 95°、约 2.3s；燃气团先在甲板扩散，再让导弹出筒。
    const open =
      active ? smooth(clamp01((local - 0.15) / 2.3)) * (1 - smooth(clamp01((local - 7.6) / 0.8))) : 0;
    lid.rotation.x = -1.66 * open;

    // 冷发射先由燃气发生器弹射出筒，出筒后点火；热发射在筒内直接点火、加速更快。
    const start = spec.launch === "cold" ? 2.5 : 2.3;
    const riseTime = 3.2;
    const visible = active && local > start + 0.1 && local < 6.8;
    const rise = active ? LAUNCH_RISE * Math.pow(clamp01((local - start) / riseTime), 2) : 0;
    const shrink = active ? 1 - smooth(clamp01((local - 6.0) / 0.6)) : 0;
    missile.position.y = missileRestY(hero.type) + rise;
    missile.scale.setScalar(visible ? Math.max(0, shrink) : 0);
    const deployed = visible && local > start + (spec.launch === "hot" ? 0.6 : 1.1);
    if (fins) fins.object.scale.setScalar(deployed ? 1 : 0.001);
    if (gliderFins) gliderFins.object.scale.setScalar(deployed ? 1 : 0.001);
    if (flame) {
      const ignite = spec.launch === "hot" ? start + 0.1 : start + 2.0;
      flame.object.visible = visible && local > ignite;
    }
    const glider = isYj21 ? assembled.getNode(`CV_055_VlsGlider_${tag}`) : undefined;
    if (glider) {
      const sep = visible ? 6.0 * smooth(clamp01((local - (start + 1.8)) / 1.4)) : 0;
      glider.position.y = sep;
    }
    if (gliderFlame) {
      gliderFlame.object.visible = visible && local > start + 2.2;
    }
    const gas = assembled.getNode(`CV_055_VlsGas_${tag}`);
    if (gas) {
      const gasStart = spec.launch === "hot" ? start - 0.25 : 0.4;
      const gasLife = spec.launch === "hot" ? 2.0 : 2.2;
      const u = active ? clamp01((local - gasStart) / gasLife) : 0;
      const grow = active && local > gasStart ? Math.sin(Math.PI * u) * (spec.launch === "hot" ? 2.1 : 1.7) : 0;
      gas.scale.setScalar(Math.max(0.001, grow));
      gas.position.y = (spec.launch === "hot" ? 0.4 : 0.32) + (1 - Math.min(1, u)) * 0.35;
    }
  }
}

export function animateType055(assembled: AssembledModel, seconds: number, state = "idle"): void {
  const t = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const weapons = state === "weapons";
  const engine = state === "engine" || weapons;
  const launch = state === "launch";
  const aviation = state === "aviation";

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

  GT_ROTORS.forEach((name, index) => {
    const rotor = assembled.getNode(name);
    if (rotor) rotor.rotation.z = engine ? t * (13.5 + index * 0.6) : 0;
  });

  for (const node of [PROP_L, PROP_R]) {
    const prop = assembled.getNode(node);
    if (prop) prop.rotation.z = engine ? t * (node === PROP_L ? 7.0 : -7.0) : 0;
  }

  const doorOpen = aviation ? smooth(Math.min(1, t / 2.2)) : 0;
  for (const node of HANGAR_DOORS) {
    const door = assembled.getNode(node);
    if (door) door.scale.y = 1 - 0.92 * doorOpen;
  }
  const padMain = assembled.getNode(PAD_MAIN_ROTOR);
  if (padMain) padMain.rotation.y = aviation ? t * 9.5 : 0;
  const padTail = assembled.getNode(PAD_TAIL_ROTOR);
  if (padTail) padTail.rotation.x = aviation ? t * 30 : 0;

  animateLaunch(assembled, t, launch);
}

export const TYPE055_ANIMATED_STATES = ["engine", "weapons", "launch", "aviation"] as const;

export const TYPE055_STATE_LABELS = [
  { id: "idle", label: "系泊检查", hint: "雷达慢转；主炮/近防归零，双桨静止，VLS 井盖闭锁" },
  { id: "engine", label: "COGAG 动力运转", hint: "四台燃气轮机并车，双轴双桨转动，导航雷达加速" },
  { id: "weapons", label: "主炮/近防跟踪", hint: "130mm 炮塔旋回俯仰，前后 1130 近防随动跟踪" },
  { id: "launch", label: "VLS 冷发射", hint: "首尾 6 格井盖开启，导弹冷弹射出筒、点火后离场" },
  { id: "aviation", label: "航空作业", hint: "双机库卷帘门升起，甲板直-20 主/尾旋翼运转" },
] as const;
