import * as THREE from "three";
import { instanceKey, type AssembledModel } from "@/three/parts";
import { pistonPinTravel, rodSwingRad, type CrankTrainGeometry } from "./engine/kinematics";
import { makeTrackScroller, type TrackScroller } from "./running/registry";
import { TIGER_MG_BELT_DIR, TIGER_MG_BELT_PITCH } from "./turret/kits";
import { TIGER_LID_PART_IDS } from "./lids";

// ============================================================================
// tiger/motion —— 虎式行动装置动画（悬挂起伏 / 行进 / 单轮拆解）
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
export const TIGER_MOTION_PARTS = [
  "tiger.suspension.wheel",
  "tiger.suspension.hub_bolt",
  "tiger.track.link",
  "tiger.track.pin",
  "tiger.track.pin_clip",
  "tiger.track.sprocket",
  "tiger.track.idler",
  "tiger.turret.aa_mg_case",
  "tiger.effects.exhaust_smoke",
  ...TIGER_LID_PART_IDS,
];

/** 行进动画改写过的实例件；切换出 driving 时一次性复位，避免停在滚动中途。 */
const DRIVE_INSTANCE_PARTS = [
  "tiger.track.link",
  "tiger.track.pin",
  "tiger.track.pin_clip",
  "tiger.track.sprocket",
  "tiger.track.idler",
  "tiger.suspension.wheel",
  "tiger.suspension.hub_bolt",
];

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
// 行进演示（P3）——直驶（前进 / 倒退）+ 原地转向（右 / 左 / 回正）
//
// 差速关系：航向右转为正，右履带行程 = d − B·ψ、左履带 = d + B·ψ
// （B = 履带中心线到车体纵轴的距离 TRACK_Z）。原地转向时 d=0，两侧履带
// 等速反向：履带板沿同一条闭合轨迹反向滚动，负重轮/主动轮/诱导轮按各自
// 节圆半径反算角速度，所以任意时刻轮齿与销的相位关系都与静态装配一致。
// 航向 ψ 的旋转中心取炮塔座圈中心（≈车体中心），否则原地转向会绕着车尾甩。
// ---------------------------------------------------------------------------
interface TigerDrivePhase {
  duration: number;
  /** 前进速度 [起点, 终点]（m/s，正 = 前进）。 */
  speed: [number, number];
  /** 航向角速度 [起点, 终点]（rad/s，正 = 右转）。 */
  yawRate: [number, number];
}

const DRIVE_PHASES: TigerDrivePhase[] = [
  { duration: 1.2, speed: [0, 0.55], yawRate: [0, 0] },
  { duration: 1.6, speed: [0.55, 0.55], yawRate: [0, 0] },
  { duration: 1.2, speed: [0.55, 0], yawRate: [0, 0] },
  { duration: 0.7, speed: [0, 0], yawRate: [0, 0] },
  { duration: 1.2, speed: [0, -0.55], yawRate: [0, 0] },
  { duration: 1.6, speed: [-0.55, -0.55], yawRate: [0, 0] },
  { duration: 1.2, speed: [-0.55, 0], yawRate: [0, 0] },
  { duration: 0.7, speed: [0, 0], yawRate: [0, 0] },
  { duration: 0.5, speed: [0, 0], yawRate: [0, 0.3] },
  { duration: 0.9, speed: [0, 0], yawRate: [0.3, 0.3] },
  { duration: 0.5, speed: [0, 0], yawRate: [0.3, 0] },
  { duration: 0.6, speed: [0, 0], yawRate: [0, 0] },
  { duration: 0.5, speed: [0, 0], yawRate: [0, -0.3] },
  { duration: 2.3, speed: [0, 0], yawRate: [-0.3, -0.3] },
  { duration: 0.5, speed: [0, 0], yawRate: [-0.3, 0] },
  { duration: 0.6, speed: [0, 0], yawRate: [0, 0] },
  { duration: 0.5, speed: [0, 0], yawRate: [0, 0.3] },
  { duration: 0.9, speed: [0, 0], yawRate: [0.3, 0.3] },
  { duration: 0.5, speed: [0, 0], yawRate: [0.3, 0] },
  { duration: 0.7, speed: [0, 0], yawRate: [0, 0] },
];

/** 18.4s 一循环，首尾距离/航向/速度全部归零，可无缝循环。 */
export const TIGER_DRIVE_CYCLE = DRIVE_PHASES.reduce((sum, phase) => sum + phase.duration, 0);
export const TIGER_DRIVE_SPEED = 0.55;
export const TIGER_DRIVE_PIVOT_YAW = 0.3;

export interface TigerDrivePose {
  /** 前进行程（米，正 = 前进）。 */
  distance: number;
  /** 航向角（rad，正 = 右转）。 */
  yaw: number;
  speed: number;
  acceleration: number;
  yawRate: number;
}

/** 行进曲线：每段速度/角速度用 smoothstep 过渡，行程按解析积分累计。 */
export function tigerDrivePoseAt(seconds: number): TigerDrivePose {
  const cycle = ((seconds % TIGER_DRIVE_CYCLE) + TIGER_DRIVE_CYCLE) % TIGER_DRIVE_CYCLE;
  let remaining = cycle;
  let distance = 0;
  let yaw = 0;
  let speed = 0;
  let acceleration = 0;
  let yawRate = 0;
  for (const phase of DRIVE_PHASES) {
    const span = Math.min(remaining, phase.duration);
    const u = phase.duration > 0 ? span / phase.duration : 1;
    const blend = u * u * (3 - 2 * u);
    const [v0, v1] = phase.speed;
    const [w0, w1] = phase.yawRate;
    // ∫ smoothstep = D·(u³ − u⁴/2)
    const ease = phase.duration * (u ** 3 - u ** 4 / 2);
    distance += v0 * span + (v1 - v0) * ease;
    yaw += w0 * span + (w1 - w0) * ease;
    if (remaining <= phase.duration) {
      speed = v0 + (v1 - v0) * blend;
      yawRate = w0 + (w1 - w0) * blend;
      acceleration = ((v1 - v0) / phase.duration) * 6 * u * (1 - u);
      break;
    }
    remaining -= phase.duration;
  }
  return { distance, yaw, speed, acceleration, yawRate };
}

const trackScrollers = new WeakMap<Record<string, number>, TrackScroller>();
function scrollerOf(assembled: AssembledModel): TrackScroller {
  let scroller = trackScrollers.get(assembled.constants);
  if (!scroller) {
    scroller = makeTrackScroller(assembled.constants);
    trackScrollers.set(assembled.constants, scroller);
  }
  return scroller;
}

/** 是否还有行进位姿留在实例矩阵上；切出 driving 时只复位一次。 */
let drivePoseDirty = false;
const driveMatrix = new THREE.Matrix4();

function resetDriveInstances(assembled: AssembledModel): void {
  if (!drivePoseDirty) return;
  for (const id of DRIVE_INSTANCE_PARTS) {
    const handle = assembled.getPart(id);
    if (!handle) continue;
    for (const instance of handle.instances) {
      handle.setInstanceMatrix(instance.index, instance.restMatrix);
    }
  }
  drivePoseDirty = false;
}

export function animateTigerDriving(assembled: AssembledModel, seconds: number): void {
  const pose = tigerDrivePoseAt(seconds);
  drivePoseDirty = true;
  const constants = assembled.constants;
  const trackZ = constants.TRACK_Z ?? 1.49;
  const pivotX = constants.TR_RING_X ?? -1.65;
  const cos = Math.cos(pose.yaw);
  const sin = Math.sin(pose.yaw);
  const activity = Math.min(
    1,
    Math.abs(pose.speed) / 0.4 + Math.abs(pose.yawRate) / TIGER_DRIVE_PIVOT_YAW,
  );

  // 车体：直线时沿 -X 前进；原地转向绕座圈中心（根节点反向平移补偿）
  assembled.root.position.set(
    -pose.distance + pivotX * (1 - cos),
    0.0012 * Math.sin(seconds * 9.1) * activity,
    pivotX * sin,
  );
  assembled.root.rotation.set(
    0.0008 * Math.sin(seconds * 6.3) * activity,
    pose.yaw,
    0.006 * Math.max(-1, Math.min(1, pose.acceleration / 0.7)),
  );

  // 差速行程：右转时左履带多走、右履带少走（原地转向即等速反向）
  const rightDistance = pose.distance - trackZ * pose.yaw;
  const leftDistance = pose.distance + trackZ * pose.yaw;
  const links = constants.TRACK_LINKS ?? 96;
  const scroller = scrollerOf(assembled);
  const writeScroll = (partId: string, kind: "link" | "pin" | "clip") => {
    const handle = assembled.getPart(partId);
    if (!handle) return;
    for (const instance of handle.instances) {
      const distance = instance.index < links ? rightDistance : leftDistance;
      handle.setInstanceMatrix(
        instance.index,
        scroller.matrixAt(kind, instance.index, distance, driveMatrix),
      );
    }
  };
  writeScroll("tiger.track.link", "link");
  writeScroll("tiger.track.pin", "pin");
  writeScroll("tiger.track.pin_clip", "clip");

  // 主动轮 / 诱导轮 / 负重轮：角速度 = 履带行程 / 各自节圆半径
  const spinAboutAxle = (partId: string, radius: number) => {
    const handle = assembled.getPart(partId);
    if (!handle) return;
    for (const instance of handle.instances) {
      const distance = instance.index === 0 ? rightDistance : leftDistance;
      const rest = instance.restMatrix;
      center.set(rest.elements[12], rest.elements[13], rest.elements[14]);
      driveMatrix
        .makeTranslation(center.x, center.y, center.z)
        .multiply(rotate.makeRotationZ(distance / radius))
        .multiply(translate.makeTranslation(-center.x, -center.y, -center.z))
        .multiply(rest);
      handle.setInstanceMatrix(instance.index, driveMatrix);
    }
  };
  spinAboutAxle("tiger.track.sprocket", constants.SPROCKET_R ?? 0.4138);
  spinAboutAxle("tiger.track.idler", constants.IDLER_R ?? 0.3);

  const wheel = assembled.getPart("tiger.suspension.wheel");
  if (!wheel) return;
  const bolts = assembled.getPart("tiger.suspension.hub_bolt");
  const half = wheel.instances.length / 2;
  const wheelRadius = constants.WHEEL_R ?? 0.4;
  const spinWheel = (
    handle: NonNullable<ReturnType<AssembledModel["getPart"]>>,
    index: number,
    wheelIndex: number,
  ) => {
    const rest = handle.instances[index]!.restMatrix;
    const wheelRest = wheel.instances[wheelIndex]!.restMatrix;
    const distance = wheelIndex < half ? rightDistance : leftDistance;
    center.set(wheelRest.elements[12], wheelRest.elements[13], wheelRest.elements[14]);
    driveMatrix
      .makeTranslation(center.x, center.y, center.z)
      .multiply(rotate.makeRotationZ(distance / wheelRadius))
      .multiply(translate.makeTranslation(-center.x, -center.y, -center.z))
      .multiply(rest);
    handle.setInstanceMatrix(index, driveMatrix);
  };
  for (const instance of wheel.instances) {
    spinWheel(wheel, instance.index, instance.index);
  }
  if (bolts) {
    const boltsPerWheel = Math.max(1, Math.round(constants.WHEEL_BOLT_COUNT ?? 6));
    for (const instance of bolts.instances) {
      const wheelIndex = Math.floor(instance.index / boltsPerWheel);
      if (!wheel.instances[wheelIndex]) continue;
      spinWheel(bolts, instance.index, wheelIndex);
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

  // 后坐力传全车：57 吨「沉下去—回弹」——26mm 下沉 + 约 1° 点头 + 4mm 高频颤
  const kick = clamp01(tigerRecoilOffset(t) / TIGER_RECOIL_DISTANCE);
  const since = Math.max(0, t - 1.2);
  const rebound = t >= 1.2 ? Math.exp(-2.4 * since) * Math.sin(7.5 * since) : 0;
  assembled.root.position.y =
    -0.022 * kick - 0.008 * rebound - 0.002 * Math.sin(40 * since) * Math.exp(-5 * since);
  assembled.root.rotation.z = -0.014 * kick - 0.005 * rebound;
  assembled.root.rotation.x = 0.002 * rebound;

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

// ---------------------------------------------------------------------------
// 车顶 MG34 连射循环（P3）——枪管短后坐 / 枪口上跳 / 供弹链步进 / 弹壳抛出
// ---------------------------------------------------------------------------
export const TIGER_MG_CYCLE = 3.2;
const MG_SHOT_START = 0.25;
const MG_SHOT_INTERVAL = 0.09;
const MG_SHOT_COUNT = 10;
const MG_BARREL_RECOIL = 0.006;
const MG_CLIMB_PER_SHOT = 0.0045;
const MG_FLASH_PART = "tiger.turret.aa_mg_flash";
const MG_COAX_FLASH_PART = "tiger.turret.coax_flash";
const MG_BOW_FLASH_PART = "tiger.hull.bow_mg_flash";
const MG_CASE_PART = "tiger.turret.aa_mg_case";

function latestMgShot(t: number): { index: number; since: number } | null {
  if (t < MG_SHOT_START) return null;
  const index = Math.min(MG_SHOT_COUNT - 1, Math.floor((t - MG_SHOT_START) / MG_SHOT_INTERVAL));
  return { index, since: t - (MG_SHOT_START + index * MG_SHOT_INTERVAL) };
}

/** 单发弹壳轨迹：重力抛物线 + 顶盖弹跳（最多 4 次），返回弹壳中心位置。 */
function mgCaseFlight(
  origin: THREE.Vector3,
  velocity: THREE.Vector3,
  seconds: number,
  groundY: number,
): THREE.Vector3 {
  const position = origin.clone();
  const v = velocity.clone();
  let remaining = seconds;
  const g = 9.81;
  for (let bounce = 0; bounce < 4 && remaining > 0; bounce++) {
    const dy = Math.max(0, position.y - groundY);
    const flight = (v.y + Math.sqrt(Math.max(v.y * v.y + 2 * g * dy, 0))) / g;
    if (flight <= 0 || remaining < flight) {
      position.addScaledVector(v, remaining);
      position.y -= 0.5 * g * remaining * remaining;
      return position;
    }
    position.addScaledVector(v, flight);
    position.y = groundY;
    remaining -= flight;
    v.y = -Math.abs(v.y - g * flight) * 0.42;
    v.x *= 0.55;
    v.z *= 0.55;
    if (Math.abs(v.y) < 0.35) {
      position.addScaledVector(v, remaining);
      position.y = groundY;
      return position;
    }
  }
  return position;
}

export function animateTigerMg(assembled: AssembledModel, seconds: number): void {
  const t = ((seconds % TIGER_MG_CYCLE) + TIGER_MG_CYCLE) % TIGER_MG_CYCLE;
  const shot = latestMgShot(t);
  const gun = assembled.getNode("AaGun");
  const barrel = assembled.getNode("AaBarrel");
  const feed = assembled.getNode("AaFeed");
  const coax = assembled.getNode("CoaxBarrel");
  const bow = assembled.getNode("BowMgBarrel");

  // 枪口上跳：每发加一个小角冲量、0.32s 时间常数回落（连射会累积，停火后回正）
  let climb = 0;
  for (let k = 0; k < MG_SHOT_COUNT; k++) {
    const t0 = MG_SHOT_START + k * MG_SHOT_INTERVAL;
    if (t >= t0) climb += MG_CLIMB_PER_SHOT * Math.exp(-(t - t0) / 0.32);
  }
  climb = Math.min(climb, 0.035);
  if (gun) {
    const restPitch = -THREE.MathUtils.degToRad(assembled.constants.TR_AA_PITCH ?? 10);
    gun.rotation.z = restPitch - climb;
    gun.updateMatrix();
  }

  // 枪管短后坐：每发 6mm，50ms 内出—回；同轴 / 航向 MG34 同步短后坐 2mm
  const phase = shot ? shot.since / 0.05 : 1;
  if (barrel) {
    barrel.position.x = shot && phase < 1 ? MG_BARREL_RECOIL * Math.sin(Math.PI * phase) : 0;
  }
  if (coax) {
    coax.position.x = shot && phase < 1 ? 0.002 * Math.sin(Math.PI * phase) : 0;
  }
  if (bow) {
    bow.position.x = shot && phase < 1 ? 0.002 * Math.sin(Math.PI * phase) : 0;
  }

  // 供弹链：每发沿链路方向步进一节距（整链周期排列，回位即下一节到位）
  if (feed) {
    const rest = assembled.nodeRest.get("AaFeed");
    const step = shot ? Math.min(1, shot.since / MG_SHOT_INTERVAL) * TIGER_MG_BELT_PITCH : 0;
    feed.position
      .set(rest?.elements[12] ?? 0, rest?.elements[13] ?? 0, rest?.elements[14] ?? 0)
      .addScaledVector(TIGER_MG_BELT_DIR, step);
  }

  // 枪口焰：每发 60ms（车顶 / 同轴 / 航向三处同步；30ms 在 60fps 下只有 2 帧，肉眼易漏）
  const on = !!shot && shot.since < 0.06;
  const flashScale = shot ? 1.05 + 0.5 * Math.sin(Math.PI * Math.min(1, shot.since / 0.06)) : 1;
  for (const id of [MG_FLASH_PART, MG_COAX_FLASH_PART, MG_BOW_FLASH_PART]) {
    const flash = assembled.getPart(id);
    if (!flash) continue;
    flash.object.visible = on;
    if (on) {
      // 前机枪（同轴 / 航向）离镜头远、枪口小：放大 2.4× 才看得清「前面那挺也在打」
      const boost = id === MG_FLASH_PART ? 1 : 2.4;
      flash.object.scale.setScalar(flashScale * boost);
    }
  }

  // 车体轻微震颤（57 吨不会被 7.92mm 推动，只给高频微颤）
  const burst =
    t >= MG_SHOT_START && t <= MG_SHOT_START + (MG_SHOT_COUNT - 1) * MG_SHOT_INTERVAL + 0.12;
  const envelope = burst ? 1 : 0;
  assembled.root.position.y = 0.0007 * Math.sin(t * 95) * envelope;
  assembled.root.rotation.z = 0.00035 * Math.sin(t * 83 + 0.7) * envelope;
  assembled.root.rotation.x = 0.0002 * Math.cos(t * 71) * envelope;

  // 弹壳：从枪管右侧抛壳口抛出，沿重力抛物线落到顶盖，弹跳后留在原地
  const cases = assembled.getPart(MG_CASE_PART);
  if (cases && gun) {
    cases.object.visible = true;
    const origin = new THREE.Vector3(0.06, 0.07, 0.045).applyMatrix4(gun.matrix);
    const velocity = new THREE.Vector3(0.15, 1.25, 1.4).applyMatrix4(
      new THREE.Matrix4().extractRotation(gun.matrix),
    );
    const roofTop =
      (assembled.constants.TR_RING_TOP ?? 1.108) +
      (assembled.constants.TR_JOINT ?? 0.003) +
      (assembled.constants.TR_WALL_H ?? 0.7) +
      (assembled.constants.TR_ROOF_T ?? 0.025);
    const groundY = roofTop + 0.007;
    for (let i = 0; i < cases.instances.length; i++) {
      const matrix = new THREE.Matrix4();
      if (i >= MG_SHOT_COUNT) {
        matrix.makeScale(0, 0, 0);
      } else {
        const shotTime = MG_SHOT_START + i * MG_SHOT_INTERVAL;
        const age = t - shotTime;
        if (age < 0) {
          matrix.makeScale(0, 0, 0);
        } else {
          const position = mgCaseFlight(origin, velocity, age, groundY);
          const spin = age * 14 + i * 1.7;
          const quaternion = new THREE.Quaternion().setFromEuler(
            new THREE.Euler(spin * 0.7, spin, 0),
          );
          matrix.compose(position, quaternion, new THREE.Vector3(1, 1, 1));
        }
      }
      // 弹壳挂在 Turret 节点上（fx 但会随炮塔回转）；写节点局部矩阵，由 syncInstances 合成
      cases.instances[i]!.localMatrix.copy(matrix);
    }
  }
}

// ---------------------------------------------------------------------------
// 炮塔瞄准（P3）——炮塔回转绕座圈中心，炮管俯仰绕耳轴（小角度，套环留 45mm）
// ---------------------------------------------------------------------------
export const TIGER_AIM_CYCLE = 8;
export const TIGER_TURRET_YAW = THREE.MathUtils.degToRad(36); // 前舱盖在瞄准时关闭，全行程可用
export const TIGER_GUN_PITCH = 0.06; // ±3.4°

const HATCH_LID_PART = "tiger.hull.hatch_lid";
const HATCH_CLOSED_LIFT = 0.014;

/**
 * 舱盖盖板开/闭：打开姿态是注册表里的 90° 立起（便于看座舱）；炮塔回转/瞄准前
 * 必须盖上，否则主炮长身管扫过前甲板时会切到立起的盖板（实测 ±15° 仍会撞）。
 * 这里只改实例矩阵：关闭 = 平移回铰链 + 去掉 90° 立起旋转 + 抬 14mm 让开甲板。
 */
function setHatchLids(assembled: AssembledModel, closed: boolean): void {
  const lids = assembled.getPart(HATCH_LID_PART);
  if (!lids) return;
  const matrix = new THREE.Matrix4();
  for (const instance of lids.instances) {
    if (!closed) {
      lids.setInstanceMatrix(instance.index, instance.restMatrix);
      continue;
    }
    const rest = instance.restMatrix;
    matrix.makeTranslation(rest.elements[12], rest.elements[13] + HATCH_CLOSED_LIFT, rest.elements[14]);
    lids.setInstanceMatrix(instance.index, matrix);
  }
}

export function animateTigerAim(assembled: AssembledModel, seconds: number): void {
  setHatchLids(assembled, true);
  const t = ((seconds % TIGER_AIM_CYCLE) + TIGER_AIM_CYCLE) % TIGER_AIM_CYCLE;
  const yaw = Math.sin(t * 0.55) * TIGER_TURRET_YAW;
  const pitch = Math.sin(t * 1.3) * TIGER_GUN_PITCH;
  const turret = assembled.getNode("Turret");
  if (turret) {
    const pivot = new THREE.Vector3(assembled.constants.TR_RING_X ?? -1.65, 0, 0);
    const quaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    turret.quaternion.copy(quaternion);
    turret.position.copy(pivot).sub(pivot.clone().applyQuaternion(quaternion));
    turret.updateMatrix();
  }
  const cradle = assembled.getNode("GunCradle");
  if (cradle) cradle.rotation.z = pitch;
  assembled.root.position.set(0, 0, 0);
  assembled.root.rotation.set(0, 0, 0);
}

// ---------------------------------------------------------------------------
// 受击震荡（P3）——按口径分级：小口径高频轻颤；大口径重挫 + 悬挂回弹
// ---------------------------------------------------------------------------
export type TigerHitGrade = "light" | "heavy";
export const TIGER_HIT_CYCLE = 2.6;

export function animateTigerHit(
  assembled: AssembledModel,
  seconds: number,
  grade: TigerHitGrade,
): void {
  const t = ((seconds % TIGER_HIT_CYCLE) + TIGER_HIT_CYCLE) % TIGER_HIT_CYCLE;
  const since = t - 0.12;
  if (since < 0) {
    assembled.root.position.y = 0;
    assembled.root.rotation.x = 0;
    assembled.root.rotation.z = 0;
  } else {
    if (grade === "light") {
      const env = Math.exp(-8 * since);
      const shake = Math.sin(26 * since) * env;
      assembled.root.position.y = 0.0018 * shake;
      assembled.root.rotation.z = -0.0009 * shake;
      assembled.root.rotation.x = 0.0006 * Math.cos(26 * 1.3 * since) * env;
    } else {
      const env = Math.exp(-2.4 * since);
      const body = Math.exp(-3.1 * since) * Math.cos(6.2 * since);
      assembled.root.position.y = -0.02 * body + 0.003 * Math.sin(22 * since) * env;
      assembled.root.rotation.z = -0.018 * body + 0.0015 * Math.sin(19 * since) * env;
      assembled.root.rotation.x = 0.007 * Math.exp(-2.6 * since) * Math.sin(5.2 * since);
    }
  }
}

// ---------------------------------------------------------------------------
// 排气烟 fx（爆炸/火焰/烟柱改由 three.quarks 粒子系统在 app/three/vfx 里做）
// ---------------------------------------------------------------------------
const ENGINE_SMOKE_PART = "tiger.effects.exhaust_smoke";
const TIGER_FX_PARTS = [ENGINE_SMOKE_PART];

const fxMatrix = new THREE.Matrix4();
const fxQuat = new THREE.Quaternion();
const fxEuler = new THREE.Euler();
const fxPosition = new THREE.Vector3();
const fxScale = new THREE.Vector3();
const frac = (value: number): number => value - Math.floor(value);

// 加油口盖：底座固定，盖盘是独立实例件，绕外缘铰链旋转；
// 局部 -Z 是盖盘指向颈孔的方向，绕本地 X 正转 72° 即掀起。
const FUEL_LID_PART = "tiger.hull.fuel_cap_lid";
const fuelLidMatrix = new THREE.Matrix4();
const fuelLidRotation = new THREE.Matrix4();

function animateFuelLids(assembled: AssembledModel, state: string | undefined, seconds: number): void {
  const handle = assembled.getPart(FUEL_LID_PART);
  if (!handle) return;
  const open = state === "refuel" ? smoothstep(0, 0.8, seconds) : 0;
  fuelLidRotation.makeRotationX(THREE.MathUtils.degToRad(72) * open);
  for (const instance of handle.instances) {
    fuelLidMatrix.multiplyMatrices(instance.restMatrix, fuelLidRotation);
    handle.setInstanceMatrix(instance.index, fuelLidMatrix);
  }
}

/** 烟柱：逐实例从 origin 上飘、扩散、由小到大再到零（避免循环时突现突灭）。 */
function writeSmokePlume(
  handle: NonNullable<ReturnType<AssembledModel["getPart"]>>,
  origin: (index: number) => THREE.Vector3,
  seconds: number,
  options: { rate: number; rise: number; spread: number; scale: number; seed?: number },
): void {
  const count = Math.max(1, handle.instances.length);
  for (let i = 0; i < count; i++) {
    const phase = frac(i / count + seconds * options.rate + (options.seed ?? 0));
    const grow = Math.sin(Math.PI * phase) ** 0.65;
    const base = origin(i);
    const angle = i * 2.399 + phase * 2.4;
    fxPosition.set(
      base.x + Math.cos(angle) * options.spread * phase,
      base.y + phase * options.rise,
      base.z + Math.sin(angle) * options.spread * phase,
    );
    const size = options.scale * (0.35 + 1.25 * phase) * grow;
    fxScale.setScalar(Math.max(0.0001, size));
    fxQuat.setFromEuler(fxEuler.set(phase * 1.7 + i, i * 2.1, phase * 0.8));
    fxMatrix.compose(fxPosition, fxQuat, fxScale);
    handle.setInstanceMatrix(i, fxMatrix);
  }
}


/** 排气烟：两根排气管交替出烟（instance 偶数 → 右管，奇数 → 左管）。 */
function writeExhaustSmoke(
  handle: ReturnType<AssembledModel["getPart"]>,
  seconds: number,
  intensity: number,
): void {
  if (!handle) return;
  handle.object.visible = true;
  writeSmokePlume(
    handle,
    (index) => fxPosition.set(0.993, 1.06, index % 2 === 0 ? 0.32 : -0.32).clone(),
    seconds,
    { rate: 0.5, rise: 1.3, spread: 0.22, scale: 0.42 * intensity, seed: 0.13 },
  );
}

// ---------------------------------------------------------------------------
// 发动机启动（P0）——预热 → 起动机拖动 → 点火 → 暖机 → 怠速
// 节点：Crank / Cam_L / Cam_R / Fan_L / Fan_R / Piston_1..12 / Rod_1..12
// 曲柄连杆运动学直接调用 engine/kinematics（与静态装配同一套公式）。
// 冷启动不允许“一摁就着”：0–1.6s 只通电/泵油（曲轴不转，车体轻微 tick）；
// 1.6–3.4s 起动机拖动（165rpm 不均匀压缩脉冲 + 车体抖动，未点火）；
// 3.4s 点火（转速跳到 260、排气白烟、车体一扭）；3.4–5.4s 暖机；之后 650rpm 怠速。
// ---------------------------------------------------------------------------
export const TIGER_ENGINE_CYCLE = 12;
export const TIGER_PREHEAT_END = 1.6;
export const TIGER_CRANK_END = 3.4;
export const TIGER_RUNUP_END = 5.4;
export const TIGER_IDLE_RPM = 650;
const CRANK_RPM = 165;
const IGNITION_RPM = 260;

const RPM_TO_RAD = Math.PI / 30;

/** 发动机转速（rpm）：预热 0；拖动 165±脉冲；点火 260 → 650；之后怠速微抖。 */
export function tigerEngineRpmAt(seconds: number): number {
  if (seconds <= 0) return 0;
  if (seconds < TIGER_PREHEAT_END) return 0;
  if (seconds < TIGER_CRANK_END) {
    const dt = seconds - TIGER_PREHEAT_END;
    return CRANK_RPM + 18 * Math.sin(dt * 2 * Math.PI * 2.2) + 6 * Math.sin(dt * 2 * Math.PI * 5.3);
  }
  if (seconds < TIGER_RUNUP_END) {
    const u = (seconds - TIGER_CRANK_END) / (TIGER_RUNUP_END - TIGER_CRANK_END);
    const s = u * u * (3 - 2 * u);
    return IGNITION_RPM + (TIGER_IDLE_RPM - IGNITION_RPM) * s;
  }
  return TIGER_IDLE_RPM + 14 * Math.sin((seconds - TIGER_RUNUP_END) * 2 * Math.PI * 0.8);
}

/** 曲轴累计转角（rad）：分段解析积分；预热段严格为 0（起动机还没啮合）。 */
export function tigerCrankAngleAt(seconds: number): number {
  if (seconds <= TIGER_PREHEAT_END) return 0;
  const wCrank = CRANK_RPM * RPM_TO_RAD;
  const wIgnition = IGNITION_RPM * RPM_TO_RAD;
  const wIdle = TIGER_IDLE_RPM * RPM_TO_RAD;
  const crankSpan = TIGER_CRANK_END - TIGER_PREHEAT_END;
  const crankDt = Math.min(seconds, TIGER_CRANK_END) - TIGER_PREHEAT_END;
  const modA = 2 * Math.PI * 2.2;
  const modB = 2 * Math.PI * 5.3;
  const angleCrank =
    wCrank * crankDt +
    ((18 * RPM_TO_RAD) / modA) * (1 - Math.cos(modA * crankDt)) +
    ((6 * RPM_TO_RAD) / modB) * (1 - Math.cos(modB * crankDt));
  if (seconds < TIGER_CRANK_END) return angleCrank;
  const angleAtIgnition =
    wCrank * crankSpan +
    ((18 * RPM_TO_RAD) / modA) * (1 - Math.cos(modA * crankSpan)) +
    ((6 * RPM_TO_RAD) / modB) * (1 - Math.cos(modB * crankSpan));
  const runup = TIGER_RUNUP_END - TIGER_CRANK_END;
  const dt = seconds - TIGER_CRANK_END;
  if (seconds < TIGER_RUNUP_END) {
    const u = dt / runup;
    return angleAtIgnition + wIgnition * dt + 0.5 * (wIdle - wIgnition) * runup * u * u;
  }
  const angleIdle = angleAtIgnition + wIgnition * runup + 0.5 * (wIdle - wIgnition) * runup;
  const idleDt = seconds - TIGER_RUNUP_END;
  const mod = 2 * Math.PI * 0.8;
  return angleIdle + wIdle * idleDt + ((14 * RPM_TO_RAD) / mod) * (1 - Math.cos(mod * idleDt));
}

export function animateTigerEngine(assembled: AssembledModel, seconds: number): void {
  const angle = tigerCrankAngleAt(seconds);
  const crank = assembled.getNode("Crank");
  if (crank) crank.rotation.x = angle;
  for (const name of ["Cam_L", "Cam_R"]) {
    const cam = assembled.getNode(name);
    if (cam) cam.rotation.x = angle / 2;
  }
  for (const name of ["Fan_L", "Fan_R"]) {
    const fan = assembled.getNode(name);
    if (fan) fan.rotation.x = angle * 1.55;
  }

  const constants = assembled.constants;
  const crankR = constants.CRANK_R ?? 0.0725;
  const rodLength = constants.ROD_L ?? 0.29;
  const halfV = constants.HALF_V ?? 30;
  const beta = THREE.MathUtils.degToRad(halfV);
  const geometry: CrankTrainGeometry = { crankR, rodLength, bankAngleDeg: halfV };
  for (let i = 0; i < 12; i++) {
    const pin = Math.floor(i / 2);
    const side: 1 | -1 = (i + 1) % 2 === 1 ? -1 : 1;
    const bank = side * halfV;
    const phi0 = THREE.MathUtils.degToRad(pin * 60) - beta * side;
    const phi = THREE.MathUtils.degToRad(pin * 60) + angle - beta * side;
    const travel = pistonPinTravel(phi, geometry) - pistonPinTravel(phi0, geometry);
    const piston = assembled.getNode(`Piston_${i + 1}`);
    const pistonRest = assembled.nodeRest.get(`Piston_${i + 1}`);
    if (piston && pistonRest) {
      piston.position.set(
        pistonRest.elements[12],
        pistonRest.elements[13] + travel * Math.cos(THREE.MathUtils.degToRad(bank)),
        pistonRest.elements[14] + travel * Math.sin(THREE.MathUtils.degToRad(bank)),
      );
    }
    const rod = assembled.getNode(`Rod_${i + 1}`);
    if (rod) {
      rod.rotation.x += rodSwingRad(phi, geometry) - rodSwingRad(phi0, geometry);
    }
  }

  // 预热：只有燃油泵/继电器轻微 tick，曲轴不转；拖动：车体抖动逐渐建立；
  // 点火：3.4s 一次明显“扭一下”；怠速：1mm 级微颤。
  const preheat = seconds < TIGER_PREHEAT_END;
  const cranking = seconds >= TIGER_PREHEAT_END && seconds < TIGER_CRANK_END;
  const running = seconds >= TIGER_CRANK_END;
  const crankBuild = THREE.MathUtils.smoothstep(seconds, TIGER_PREHEAT_END, TIGER_PREHEAT_END + 0.6);
  const preheatTick = preheat ? 0.00022 * Math.sin(seconds * 39) : 0;
  const crankShiver = cranking
    ? 0.0013 * Math.sin(angle * 2) * crankBuild + 0.00045 * Math.sin(seconds * 47) * crankBuild
    : 0;
  const idleShiver = running ? 0.0011 * Math.sin(angle * 2) : 0;
  const jolt = running ? Math.exp(-5 * (seconds - TIGER_CRANK_END)) : 0;
  assembled.root.position.set(0, preheatTick + crankShiver + idleShiver, 0);
  assembled.root.rotation.set(
    (cranking || running ? 0.0004 * Math.sin(angle * 1.3) : 0) +
      0.00025 * (preheat ? Math.sin(seconds * 39) : 0),
    0,
    0.0026 * jolt * Math.sin((seconds - TIGER_CRANK_END) * 26) +
      (cranking ? 0.0005 * Math.sin(seconds * 53) * crankBuild : 0),
  );

  const smoke = assembled.getPart(ENGINE_SMOKE_PART);
  if (preheat) {
    if (smoke) smoke.object.visible = false;
  } else {
    let intensity = 0.7;
    if (cranking) intensity = 0.2 + 0.08 * Math.sin(seconds * 7);
    else if (seconds < TIGER_CRANK_END + 1.0) intensity = 1.9;
    else if (seconds < TIGER_RUNUP_END) intensity = 1.1;
    writeExhaustSmoke(smoke, seconds, intensity);
  }
}

// ---------------------------------------------------------------------------
// 燃烧 / 殉爆（P3）
// ---------------------------------------------------------------------------
export const TIGER_DETONATION_IMPACT = 2.4;

export function animateTigerBurning(assembled: AssembledModel, seconds: number): void {
  assembled.root.position.set(0, 0.001 * Math.sin(seconds * 13), 0);
  assembled.root.rotation.set(
    0.0006 * Math.sin(seconds * 7.3),
    0,
    0.0009 * Math.sin(seconds * 5.1),
  );
  // 火焰/烟柱由 three.quarks 粒子在 app/three/vfx 里叠加，这里只保留车体震颤
}

export function animateTigerDetonation(assembled: AssembledModel, seconds: number): void {
  const t = seconds;
  const since = t - TIGER_DETONATION_IMPACT;
  const progress = smoothstep(TIGER_DETONATION_IMPACT, TIGER_DETONATION_IMPACT + 0.85, t);
  const settle =
    since > 0 ? 0.05 * Math.exp(-3 * since) * Math.sin(10 * since) : 0;
  const turret = assembled.getNode("Turret");
  if (turret) {
    const pivot = new THREE.Vector3(assembled.constants.TR_RING_X ?? -1.65, 1.1, 0);
    const tilt = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(0.035 * progress, 0.16 * progress, 0.06 * progress),
    );
    turret.quaternion.copy(tilt);
    turret.position
      .copy(pivot)
      .sub(pivot.clone().applyQuaternion(tilt))
      .add(new THREE.Vector3(0, 0.85 * progress + settle, 0));
    turret.updateMatrix();
  }
  // 车体被殉爆冲击：下沉 + 高频颤
  assembled.root.position.set(0, -0.015 * Math.exp(-3 * Math.max(0, since)) * Math.cos(6 * Math.max(0, since)), 0);
  assembled.root.rotation.set(0, 0, -0.012 * Math.exp(-2.6 * Math.max(0, since)));
}

/** 非射击状态统一隐藏所有 fx（炮口焰 / 弹壳 / 烟尘 / 火灾 / 命中火花）。 */
function hideTigerEffects(assembled: AssembledModel): void {
  for (const id of [
    TIGER_FLASH_PART,
    MG_FLASH_PART,
    MG_COAX_FLASH_PART,
    MG_BOW_FLASH_PART,
    MG_CASE_PART,
    ...TIGER_FX_PARTS,
  ]) {
    const part = assembled.getPart(id);
    if (part) part.object.visible = false;
  }
}

/**
 * 虎式动画总入口（catalog.animate）：按机器状态分流。
 * - running：悬挂演示；driving：行进演示；firing：主炮击发；mg_firing：MG34 连射；
 * - aiming：炮塔回转 + 炮管俯仰；refuel：加油口盖绕铰链掀起；engine_start：预热→拖动→点火→怠速；
 * - burning：发动机舱起火（车体震颤；火焰/烟柱由 quarks VFX 叠加）；
 * - detonation：弹药殉爆（炮塔掀飞 + 车体冲击；火球/烟柱由 quarks VFX 叠加）；
 * - hit_light / hit_heavy / hit_oblique / hit_ricochet：受击震荡（命中火花/贴花由 quarks VFX 叠加）；
 * - 其余状态：回到装配态（特效隐藏、节点由框架 resetNodes 复位）。
 */
export function animateTiger(assembled: AssembledModel, seconds: number, state?: string): void {
  setHatchLids(assembled, state === "aiming");
  animateFuelLids(assembled, state, seconds);
  if (state !== "driving") resetDriveInstances(assembled);
  if (state === "refuel") {
    hideTigerEffects(assembled);
    return;
  }
  if (state === "driving") {
    hideTigerEffects(assembled);
    animateTigerDriving(assembled, seconds);
    return;
  }
  if (state === "firing") {
    hideTigerEffects(assembled);
    animateTigerFiring(assembled, seconds);
    return;
  }
  if (state === "mg_firing") {
    hideTigerEffects(assembled);
    animateTigerMg(assembled, seconds);
    return;
  }
  if (state === "aiming") {
    hideTigerEffects(assembled);
    animateTigerAim(assembled, seconds);
    return;
  }
  if (state === "engine_start") {
    hideTigerEffects(assembled);
    animateTigerEngine(assembled, seconds);
    return;
  }
  if (state === "burning") {
    hideTigerEffects(assembled);
    animateTigerBurning(assembled, seconds);
    return;
  }
  if (state === "detonation") {
    hideTigerEffects(assembled);
    animateTigerDetonation(assembled, seconds);
    return;
  }
  if (
    state === "hit_light" ||
    state === "hit_heavy" ||
    state === "hit_oblique" ||
    state === "hit_ricochet"
  ) {
    hideTigerEffects(assembled);
    animateTigerHit(assembled, seconds, state === "hit_heavy" ? "heavy" : "light");
    return;
  }
  animateTigerSuspension(assembled, seconds);
  hideTigerEffects(assembled);
}
