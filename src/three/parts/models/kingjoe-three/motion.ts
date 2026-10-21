import type { AssembledModel } from "../../assembler/assembler";
import { HEAD_FORWARD, HEAD_LIFT, TORSO_LIFT } from "./constants";
import { getKingJoeThreeFx } from "./fx";

// ============================================================================
// models/kingjoe-three/motion —— 三体分离 / 合体
//
// 下半身站地不动；躯干沿 +Y 提起 0.6m，退出腰缝榫槽；
// 头手组先沿 +Z 0.7m 离开肩颈/双腕，再沿 +Y 提起 1.6m。
// 分离时腰缝、颈根、双腕三处电弧拉断；合体末段重新接通并锁死闪光。
// ============================================================================

export type KingJoeThreeState = "idle" | "separating" | "separated" | "combining";

export const SEPARATE_DURATION = 1.8;
export const COMBINE_DURATION = 2.0;

interface MotionRecord {
  state: KingJoeThreeState;
  start: number;
  by: number;
  cy: number;
  cz: number;
  fromBy: number;
  fromCy: number;
  fromCz: number;
}

const records = new WeakMap<AssembledModel, MotionRecord>();

function smoothstep(a: number, b: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export interface KingJoeThreeFxState {
  waist: number;
  head: number;
  flash: number;
}

/** 腰缝只随躯干开合；颈根/双腕随头手组的相对位移开合。 */
export function threeFxAt(
  state: KingJoeThreeState,
  by: number,
  cy: number,
  cz: number,
  time: number,
): KingJoeThreeFxState {
  const active = state === "separating" || state === "combining";
  if (!active) return { waist: 0, head: 0, flash: 0 };
  const waist = 1 - smoothstep(0.05, 0.5, by);
  const headDistance = Math.hypot(cy, cz);
  const head = 1 - smoothstep(0.1, 1.0, headDistance);
  let flash = 0;
  if (state === "combining" && by < 0.02 && cy < 0.02 && Math.abs(cz) < 0.02) {
    flash = Math.max(0, 1 - Math.abs(time - 1.85) / 0.35);
  }
  return { waist, head, flash };
}

export function animateKingJoeThree(
  assembled: AssembledModel,
  seconds: number,
  state: KingJoeThreeState = "idle",
): void {
  const torso = assembled.getNode("torso");
  const headhands = assembled.getNode("headhands");
  if (!torso || !headhands) return;

  let record = records.get(assembled);
  if (!record) {
    record = { state, start: seconds, by: 0, cy: 0, cz: 0, fromBy: 0, fromCy: 0, fromCz: 0 };
    records.set(assembled, record);
  }
  if (record.state !== state) {
    record.state = state;
    record.start = seconds;
    record.fromBy = record.by;
    record.fromCy = record.cy;
    record.fromCz = record.cz;
  }
  const t = Math.max(0, seconds - record.start);

  let by: number;
  let cy: number;
  let cz: number;
  if (state === "idle") {
    by = 0;
    cy = 0;
    cz = 0;
  } else if (state === "separated") {
    by = TORSO_LIFT;
    cy = HEAD_LIFT;
    cz = HEAD_FORWARD;
  } else if (state === "separating") {
    by = record.fromBy + (TORSO_LIFT - record.fromBy) * smoothstep(0.05, 1.15, t);
    cz = record.fromCz + (HEAD_FORWARD - record.fromCz) * smoothstep(0.02, 0.55, t);
    cy = record.fromCy + (HEAD_LIFT - record.fromCy) * smoothstep(0.45, 1.65, t);
  } else {
    // 合体：先让头手下降，再回到腕位，最后躯干落座。
    cy = record.fromCy * (1 - smoothstep(0.1, 1.15, t));
    cz = record.fromCz * (1 - smoothstep(1.0, 1.75, t));
    by = record.fromBy * (1 - smoothstep(0.55, 1.85, t));
  }

  torso.position.y = by;
  headhands.position.y = cy;
  headhands.position.z = cz;
  record.by = by;
  record.cy = cy;
  record.cz = cz;

  const fx = threeFxAt(state, by, cy, cz, t);
  getKingJoeThreeFx(assembled).update(assembled, { time: t, ...fx });
}

/** 测试/诊断用：清掉某个模型的状态记录。 */
export function resetKingJoeThreeMotion(assembled: AssembledModel): void {
  records.delete(assembled);
}
