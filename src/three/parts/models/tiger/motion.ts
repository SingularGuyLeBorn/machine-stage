import * as THREE from "three";
import { instanceKey, type AssembledModel } from "@/three/parts";

// ============================================================================
// tiger/motion —— 虎式行动装置动画（整车悬挂起伏 + 单轮拆解）
//
// 为什么「起伏」做在整车而不是单轮：
//   虎式没有托带轮，履带上支直接压在负重轮顶上；模型里履带是闭合刚性环，
//   上支与轮顶相切（静态门禁为 0 报告）。任何一只轮子单独上下都会立刻扎进
//   上支履带 —— 实测抬 12mm 就出 129 条穿模报告。真实悬挂是「轮子贴地、
//   车体在扭杆上浮沉」，所以这里按真实自由度做：车体升沉/点头/侧倾，
//   负重轮各自独立转动（48 个不同转速，肉眼能看出不是整体同步）。
//
// 单轮拆解不受影响：拆下的轮子带着自己的 6 颗轮毂螺栓整体移出，仍保持转动。
// ============================================================================

/** 受动画直接改写实例矩阵的零件（pose 层据此取「本帧位姿」而不是静止位姿）。 */
export const TIGER_MOTION_PARTS = ["tiger.suspension.wheel", "tiger.suspension.hub_bolt"];

/** 车体升沉幅度（米）。8mm ≈ 扭杆正常行程的观感尺度，再大就会看见履带离地。 */
export const VEHICLE_HEAVE_MAX = 0.008;
/** 升沉角频率（rad/s）。 */
export const VEHICLE_HEAVE_OMEGA = 1.6;
/** 点头 / 侧倾幅度（rad）。0.0025 rad ≈ 0.14°，只做「活起来」的程度。 */
export const VEHICLE_PITCH_MAX = 0.0025;
export const VEHICLE_ROLL_MAX = 0.0018;
/** 负重轮转速范围（rad/s）：每只轮子转速不同，避免整体同步的塑料感。 */
export const WHEEL_SPIN_MIN = 0.55;
export const WHEEL_SPIN_STEP = 0.11;

const scratch = new THREE.Matrix4();
const translate = new THREE.Matrix4();
const rotate = new THREE.Matrix4();
const center = new THREE.Vector3();

/** 轮序 → 车侧（前 24 个右、后 24 个左，与 running 注册表一致）。 */
export function wheelSideOf(index: number, count: number): 1 | -1 {
  return index < count / 2 ? 1 : -1;
}

/** 轮序 → 站号（8 站，每站 3 只轮）。 */
export function wheelStationOf(index: number, count: number): number {
  const perSide = count / 2;
  return Math.floor((index % perSide) / 3);
}

export function wheelLaneOf(index: number): number {
  return index % 3;
}

/** 单实例的可读标签（视口实例检查器）。 */
export function tigerInstanceLabel(partId: string, index: number, count: number): string | null {
  if (partId === "tiger.suspension.wheel") {
    const side = wheelSideOf(index, count);
    return `第 ${wheelStationOf(index, count) + 1} 轴 · 第 ${wheelLaneOf(index) + 1} 排 · ${side > 0 ? "右" : "左"}`;
  }
  if (partId === "tiger.suspension.hub_bolt") return "轮毂螺栓";
  if (partId === "tiger.suspension.swing_arm") return `第 ${(index % 8) + 1} 轴摆臂`;
  if (partId === "tiger.suspension.axle") return `第 ${(index % 8) + 1} 轴车轴`;
  return null;
}

/** 单轮拆解：轮子 + 它自己的 6 颗轮毂螺栓一起走。 */
export function tigerDetachKeys(partId: string, index: number, _count: number): string[] {
  const keys = [instanceKey(partId, index)];
  if (partId === "tiger.suspension.wheel") {
    for (let bolt = 0; bolt < 6; bolt++) {
      keys.push(instanceKey("tiger.suspension.hub_bolt", index * 6 + bolt));
    }
  }
  return keys;
}

/** 拆解位移：沿车宽向外 + 抬到履带上方（模型空间，米）。 */
export function tigerDetachOffset(
  partId: string,
  index: number,
  count: number,
): [number, number, number] | null {
  if (partId === "tiger.suspension.wheel") {
    return [0, 0.42, wheelSideOf(index, count) * 0.72];
  }
  if (partId === "tiger.suspension.hub_bolt") {
    return [0, 0.42, wheelSideOf(Math.floor(index / 6), count / 6) * 0.72];
  }
  return null;
}

/**
 * 悬挂演示：seconds 为 0 时完全回到装配态（幂等）。
 * 整车姿态写在 root 上；轮子转动写在实例矩阵上，每帧从 restMatrix 重算。
 */
export function animateTigerSuspension(assembled: AssembledModel, seconds: number): void {
  // 1) 车体升沉 / 点头 / 侧倾（t=0 时全为 0）
  const heave = 0.5 * (1 - Math.cos(seconds * VEHICLE_HEAVE_OMEGA)) * VEHICLE_HEAVE_MAX;
  assembled.root.position.y = heave;
  assembled.root.rotation.z = Math.sin(seconds * VEHICLE_HEAVE_OMEGA * 0.55) * VEHICLE_PITCH_MAX;
  assembled.root.rotation.x = Math.sin(seconds * VEHICLE_HEAVE_OMEGA * 0.42 + 1.3) * VEHICLE_ROLL_MAX;

  // 2) 48 只负重轮各自转动（转速按序号错开；轮毂螺栓跟随各自轮子）
  const wheel = assembled.getPart("tiger.suspension.wheel");
  if (!wheel) return;
  const bolt = assembled.getPart("tiger.suspension.hub_bolt");
  const boltsPerWheel = Math.max(1, Math.round(assembled.constants.WHEEL_BOLT_COUNT ?? 6));
  const spinOf = (index: number): number => seconds * (WHEEL_SPIN_MIN + (index % 7) * WHEEL_SPIN_STEP);
  const writeWheel = (
    handle: NonNullable<ReturnType<AssembledModel["getPart"]>>,
    index: number,
    wheelIndex: number,
  ): void => {
    const rest = handle.instances[index]!.restMatrix;
    const wheelRest = wheel.instances[wheelIndex]!.restMatrix;
    center.set(wheelRest.elements[12], wheelRest.elements[13], wheelRest.elements[14]);
    scratch
      .makeTranslation(center.x, center.y, center.z)
      .multiply(rotate.makeRotationZ(spinOf(wheelIndex)))
      .multiply(translate.makeTranslation(-center.x, -center.y, -center.z))
      .multiply(rest);
    handle.setInstanceMatrix(index, scratch);
  };

  for (const instance of wheel.instances) {
    writeWheel(wheel, instance.index, instance.index);
  }
  if (bolt) {
    for (const instance of bolt.instances) {
      const wheelIndex = Math.floor(instance.index / boltsPerWheel);
      if (!wheel.instances[wheelIndex]) continue;
      writeWheel(bolt, instance.index, wheelIndex);
    }
  }
}

// ---------------------------------------------------------------------------
// 主炮击发循环（P3）——节点驱动：GunCradle → GunRecoil → BreechBlock → FiringPin。
// 开闩（0.3–0.55s）→ 关闩（0.85–1.1s）→ 击针（1.1–1.28s）→ 后坐 450mm
// （1.2–1.3s 先快，之后高阻尼 exp×cos 复进）→ 开闩抛壳（1.45–2.5s）→ 待装。
// 全车后坐反应只给 6mm 下沉 / 0.2° 点头——57 吨车体是「沉一下」，不是弹跳。
// ---------------------------------------------------------------------------
export const TIGER_FIRE_CYCLE = 6;
export const TIGER_RECOIL_DISTANCE = 0.45;
export const TIGER_BLOCK_DROP = 0.16;
export const TIGER_FLASH_PART = "tiger.turret.muzzle_flash";
/** 炮口焰可见窗口（秒）：击发瞬间 → 后坐峰之后。 */
const FLASH_START = 1.16;
const FLASH_END = 1.55;

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));
const smoothstep = (edge0: number, edge1: number, value: number): number => {
  const u = clamp01((value - edge0) / (edge1 - edge0));
  return u * u * (3 - 2 * u);
};
const easeOutCubic = (u: number): number => 1 - (1 - clamp01(u)) ** 3;

/** 闩体位置（0 = 闭锁，-160mm = 全开）：循环首尾闭合，开/闭都带缓入缓出。 */
export function tigerBreechBlockOffset(t: number): number {
  if (t < 0.3) return 0;
  if (t < 0.55) return -TIGER_BLOCK_DROP * smoothstep(0.3, 0.55, t);
  if (t < 0.85) return -TIGER_BLOCK_DROP;
  if (t < 1.1) return -TIGER_BLOCK_DROP * (1 - smoothstep(0.85, 1.1, t));
  if (t < 1.45) return 0;
  if (t < 1.7) return -TIGER_BLOCK_DROP * smoothstep(1.45, 1.7, t);
  if (t < 2.2) return -TIGER_BLOCK_DROP;
  if (t < 2.5) return -TIGER_BLOCK_DROP * (1 - smoothstep(2.2, 2.5, t));
  return 0;
}

/** 炮身后坐位移（米）：0 → 450mm（100ms 先快）→ 液压阻尼复进（缓冲器限制前向过冲 4mm）。 */
export function tigerRecoilOffset(t: number): number {
  if (t < 1.2) return 0;
  if (t < 1.3) return TIGER_RECOIL_DISTANCE * easeOutCubic((t - 1.2) / 0.1);
  const u = t - 1.3;
  // 液压复进：高阻尼 cos 回位；闩室/前壁的安全余量只允许 4mm 前向过冲
  return Math.max(-0.004, TIGER_RECOIL_DISTANCE * Math.exp(-3.8 * u) * Math.cos(2.4 * u));
}

/** 击针行程（米，-X 为前冲）：击发前后各 120ms 的短促脉冲。 */
export function tigerFiringPinOffset(t: number): number {
  if (t < 1.1 || t > 1.28) return 0;
  if (t < 1.16) return -0.008 * smoothstep(1.1, 1.16, t);
  return -0.008 * (1 - smoothstep(1.16, 1.28, t));
}

export function animateTigerFiring(assembled: AssembledModel, seconds: number): void {
  const t = ((seconds % TIGER_FIRE_CYCLE) + TIGER_FIRE_CYCLE) % TIGER_FIRE_CYCLE;
  const recoil = assembled.getNode("GunRecoil");
  if (recoil) recoil.position.x = tigerRecoilOffset(t);
  const block = assembled.getNode("BreechBlock");
  if (block) block.position.y = tigerBreechBlockOffset(t);
  const pin = assembled.getNode("FiringPin");
  if (pin) pin.position.x = tigerFiringPinOffset(t);

  // 后坐力传全车：57 吨「沉一下」——6mm 下沉 + 0.2° 点头，随复进阻尼回位
  const kick = clamp01(tigerRecoilOffset(t) / TIGER_RECOIL_DISTANCE);
  assembled.root.position.y = -0.006 * kick;
  assembled.root.rotation.z = -0.0035 * kick;
  assembled.root.rotation.x = 0;

  // 炮口焰：只在击发窗口可见；尺度随压力峰值起伏（特效件 fx，不参与支撑检测）
  const flash = assembled.getPart(TIGER_FLASH_PART);
  if (flash) {
    const u = (t - FLASH_START) / (FLASH_END - FLASH_START);
    const visible = u >= 0 && u <= 1;
    flash.object.visible = visible;
    if (visible) {
      const scale = 0.7 + 0.6 * Math.sin(Math.PI * u);
      flash.object.scale.setScalar(scale);
    }
  }
}

/**
 * 虎式动画总入口（catalog.animate）：按机器状态分流。
 * - running：悬挂演示（车体浮沉 + 48 轮转动）；
 * - firing：主炮击发循环；
 * - 其余状态：回到装配态（炮口焰隐藏、节点由框架 resetNodes 复位）。
 */
export function animateTiger(assembled: AssembledModel, seconds: number, state?: string): void {
  if (state === "firing") {
    animateTigerFiring(assembled, seconds);
    return;
  }
  animateTigerSuspension(assembled, seconds);
  const flash = assembled.getPart(TIGER_FLASH_PART);
  if (flash) flash.object.visible = false;
}
