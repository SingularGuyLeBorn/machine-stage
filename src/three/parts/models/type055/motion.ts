import type { AssembledModel } from "../../assembler/assembler";
import { MISSILES, VLS, VLS_HEROES, missileRestY } from "./vls";

// ============================================================================
// models/type055/motion —— 055 状态动画
// idle 系泊（雷达慢转）/ engine COGAG 双桨+雷达 / weapons 主炮旋回+近防跟踪
// launch VLS 冷/热齐射：逐格开盖 → 弹射出筒/筒内点火 → 分弹种弹道离场
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

const LAUNCH_CYCLE = 19.5;
const LAUNCH_STAGGER = 0.42;

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
    const flameCore = assembled.getPart(`type055.vls.flame_core_${tag}`);
    const trail = assembled.getPart(`type055.vls.trail_${tag}`);
    const gliderFlame = isYj21 ? assembled.getPart(`type055.vls.glider_flame_${tag}`) : undefined;
    const gliderCore = isYj21 ? assembled.getPart(`type055.vls.glider_core_${tag}`) : undefined;
    if (!lid || !missile) continue;

    const local = active
      ? (((t - index * LAUNCH_STAGGER) % LAUNCH_CYCLE) + LAUNCH_CYCLE) % LAUNCH_CYCLE
      : 0;
    const start = spec.launch === "cold" ? 2.5 : 2.3;
    const ejectTime = 0.85;
    const flight = hero.type === "yj21" ? 6.6 : hero.type === "yj18" ? 5.6 : 5.2;
    const total = start + ejectTime + flight;
    const baseX = -((VLS.COLS - 1) * VLS.PITCH) / 2 + hero.col * VLS.PITCH;
    const baseZ = (hero.bank === "fwd" ? VLS.FWD_Z : VLS.AFT_Z) + hero.row * VLS.PITCH;
    const restY = missileRestY(hero.type);

    // 055 开盖约 95°、约 2.3s；导弹离场后井盖再合上，下一轮重新打开。
    const open = active
      ? smooth(clamp01((local - 0.15) / 2.3)) * (1 - smooth(clamp01((local - (total - 0.7)) / 0.8)))
      : 0;
    lid.rotation.x = -1.66 * open;

    const visible = active && local > start + 0.05 && local < total;
    const e = clamp01((local - start) / ejectTime);
    const p = clamp01((local - start - ejectTime) / flight);
    const side = hero.col < 3.5 ? -1 : 1;
    const out = 14 + Math.abs(hero.col - 3.5) * 4;

    // 三类弹的弹道分开：防空弹向舷外爬升，反舰弹压低掠海，高超弹高抛滑翔。
    let dx = 0;
    let dy = 0;
    let dz = 0;
    let pitch = 0;
    if (hero.type === "hhq9b") {
      dy = 12 * smooth(e) + 55 * (1 - Math.pow(1 - p, 3));
      dx = side * out * smooth(p);
      dz = 45 * Math.pow(p, 1.5);
      pitch = 1.02 * smooth(clamp01(p * 1.5));
    } else if (hero.type === "yj18") {
      dy = 10 * smooth(e) + 24 * smooth(clamp01(p * 3)) - 16 * smooth(clamp01((p - 0.35) / 0.65));
      dx = side * out * 0.8 * smooth(p);
      dz = 110 * Math.pow(p, 0.9);
      pitch = 1.35 * smooth(clamp01(p * 2.2));
    } else {
      dy = 14 * smooth(e) + 105 * smooth(p);
      dx = side * out * smooth(p);
      dz = 70 * Math.pow(p, 1.4);
      pitch = 0.55 * smooth(clamp01(p * 1.3));
    }

    const shrink = visible ? 1 - smooth(clamp01((local - (total - 0.6)) / 0.6)) : 0;
    missile.position.set(baseX + (visible ? dx : 0), restY + (visible ? dy : 0), baseZ + (visible ? dz : 0));
    missile.rotation.set(visible ? pitch : 0, visible ? side * 0.1 * smooth(p) : 0, 0);
    missile.scale.setScalar(visible ? Math.max(0, shrink) : 0);

    const deployed = visible && local > start + (spec.launch === "hot" ? 0.5 : 0.75);
    if (fins) fins.object.scale.setScalar(deployed ? 1 : 0.001);
    if (gliderFins) gliderFins.object.scale.setScalar(deployed ? 1 : 0.001);

    const ignite = spec.launch === "hot" ? start + 0.12 : start + 0.75;
    const burning = visible && local > ignite;
    if (flame) flame.object.visible = burning;
    if (flameCore) flameCore.object.visible = burning;
    if (trail) trail.object.visible = burning && local > ignite + 0.15;

    const glider = isYj21 ? assembled.getNode(`CV_055_VlsGlider_${tag}`) : undefined;
    if (glider) {
      const sep = visible ? 8 * smooth(clamp01((local - (start + 2.2)) / 1.4)) : 0;
      glider.position.y = sep;
    }
    if (gliderFlame) gliderFlame.object.visible = burning && local > start + 2.3;
    if (gliderCore) gliderCore.object.visible = burning && local > start + 2.3;

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
  { id: "launch", label: "VLS 冷/热齐射", hint: "首尾各 8 格错峰开盖，防空/反舰/高超按各自弹道离场" },
  { id: "aviation", label: "航空作业", hint: "双机库卷帘门升起，甲板直-20 主/尾旋翼运转" },
] as const;
