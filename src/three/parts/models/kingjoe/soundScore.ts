import type { KingJoeState } from "./motion";

// ============================================================================
// models/kingjoe/soundScore —— 声音事件谱（纯函数）
//
// 声音必须跟着真实机构相位走，而不是按固定秒表另播一条：
//   combining：3.0/5.0/7.2s 三段锁环咬合 → 7.4s 展臂伺服 → 9.0s 双肩锁死
//   robot：   每 3s 一次重踏步（与腿部摆动半周期对齐）
//   firing：  进入即充能，1.05s 发射，2.8s 循环
//   separation / crippled：解锁与落地
// ============================================================================

export type KingJoeSoundKind = "lock" | "unlock" | "footstep" | "servo" | "charge" | "beam";

export interface KingJoeSoundEvent {
  kind: KingJoeSoundKind;
  strength: number;
}

const LOCK_TIMES = [3.0, 5.0, 7.2] as const;
const ARM_SERVO_TIME = 7.4;
const ARM_LOCK_TIME = 9.0;
const STEP_PERIOD = 3;
const FIRE_PERIOD = 2.8;
const FIRE_BEAM_TIME = 1.05;

export function kingJoeSoundEvents(
  state: KingJoeState,
  previous: KingJoeState | null,
  previousT: number,
  t: number,
): KingJoeSoundEvent[] {
  const events: KingJoeSoundEvent[] = [];
  const entered = previous !== state;
  const p = entered ? 0 : Math.min(previousT, t);
  if (!entered && t <= p) return events;
  const crossed = (time: number) => p < time && t >= time;

  switch (state) {
    case "combining": {
      for (const time of LOCK_TIMES) {
        if (crossed(time)) events.push({ kind: "lock", strength: 1 });
      }
      if (crossed(ARM_SERVO_TIME)) events.push({ kind: "servo", strength: 0.8 });
      if (crossed(ARM_LOCK_TIME)) events.push({ kind: "lock", strength: 0.7 });
      break;
    }
    case "separation": {
      if (entered) events.push({ kind: "unlock", strength: 1 });
      if (crossed(1.3)) events.push({ kind: "servo", strength: 0.5 });
      break;
    }
    case "robot": {
      if (entered) events.push({ kind: "servo", strength: 0.5 });
      if (Math.floor(t / STEP_PERIOD) > Math.floor(p / STEP_PERIOD)) {
        events.push({ kind: "footstep", strength: 1 });
      }
      break;
    }
    case "firing": {
      if (entered) events.push({ kind: "charge", strength: 1 });
      const phase = t % FIRE_PERIOD;
      const previousPhase = p % FIRE_PERIOD;
      if (previousPhase < FIRE_BEAM_TIME && phase >= FIRE_BEAM_TIME) {
        events.push({ kind: "beam", strength: 1 });
      }
      if (phase < previousPhase) events.push({ kind: "charge", strength: 1 });
      break;
    }
    case "crippled": {
      if (entered) events.push({ kind: "unlock", strength: 0.8 });
      if (crossed(0.4)) events.push({ kind: "footstep", strength: 1.3 });
      break;
    }
    case "damaged": {
      if (entered) events.push({ kind: "unlock", strength: 1.2 });
      if (crossed(0.35)) events.push({ kind: "servo", strength: 0.9 });
      if (crossed(1.25)) events.push({ kind: "footstep", strength: 1.1 });
      break;
    }
    default:
      break;
  }
  return events;
}
