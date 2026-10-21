import type { AssembledModel } from "../../assembler/assembler";
import { UPPER_LIFT } from "./constants";
import { getKingJoeLowerFx } from "./fx";

// ============================================================================
// models/kingjoe-lower/motion —— 髋缝两体分离 / 合体
//
// 下半身（King Legs 腿体）站在地面不动；上半身沿 +Y 提起，骨盆中柱与
// 4 组楔榫从髋腔/榫槽退出。合体时反向下降，最后一段接通电弧并锁死闪光。
// 分离/合体都从上一帧高度平滑过渡，不会因为状态切换跳变。
// ============================================================================

export type KingJoeLowerState = "idle" | "separating" | "separated" | "combining";

export const SEPARATE_DURATION = 1.5;
export const COMBINE_DURATION = 1.7;

interface MotionRecord {
  state: KingJoeLowerState;
  start: number;
  y: number;
  fromY: number;
}

const records = new WeakMap<AssembledModel, MotionRecord>();

function smoothstep(a: number, b: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export interface KingJoeLowerFxState {
  arc: number;
  flash: number;
}

/** 电弧只在两体靠近时存在；合体锁死瞬间给一次短闪。 */
export function lowerFxAt(state: KingJoeLowerState, y: number, time: number): KingJoeLowerFxState {
  const active = state === "separating" || state === "combining";
  const closeness = 1 - smoothstep(0.02, 0.9, y);
  let arc = active ? closeness : 0;
  let flash = 0;
  if (state === "combining" && y < 0.02) {
    flash = Math.max(0, 1 - Math.abs(time - 1.55) / 0.35);
    arc *= 1 - smoothstep(1.7, 2.4, time);
  }
  return { arc, flash };
}

export function animateKingJoeLower(
  assembled: AssembledModel,
  seconds: number,
  state: KingJoeLowerState = "idle",
): void {
  const upper = assembled.getNode("upper");
  if (!upper) return;

  let record = records.get(assembled);
  if (!record) {
    record = { state, start: seconds, y: 0, fromY: 0 };
    records.set(assembled, record);
  }
  if (record.state !== state) {
    record.state = state;
    record.start = seconds;
    record.fromY = record.y;
  }
  const t = Math.max(0, seconds - record.start);

  const target = state === "separating" || state === "separated" ? UPPER_LIFT : 0;
  let y: number;
  if (state === "idle" || state === "separated") {
    // 停放态直接给终值；动作态才用时间曲线。
    y = target;
  } else {
    const duration = state === "combining" ? COMBINE_DURATION : SEPARATE_DURATION;
    y = record.fromY + (target - record.fromY) * smoothstep(0.08, duration, t);
  }
  upper.position.y = y;
  record.y = y;

  const fx = lowerFxAt(state, y, t);
  getKingJoeLowerFx(assembled).update(assembled, { time: t, arc: fx.arc, flash: fx.flash });
}

/** 测试/诊断用：清掉某个模型的状态记录，下一次 animate 从装配态开始。 */
export function resetKingJoeLowerMotion(assembled: AssembledModel): void {
  records.delete(assembled);
}
