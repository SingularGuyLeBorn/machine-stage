import { describe, expect, it } from "vitest";
import type { KingJoeState } from "./motion";
import { kingJoeSoundEvents, type KingJoeSoundKind } from "./soundScore";

interface TimedSound {
  kind: KingJoeSoundKind;
  strength: number;
  t: number;
}

function score(state: KingJoeState, duration: number, from: KingJoeState | null = null): TimedSound[] {
  let previous = from;
  let previousT = 0;
  const out: TimedSound[] = [];
  const step = 1 / 60;
  for (let frame = 0; frame * step <= duration + 1e-9; frame++) {
    const t = frame * step;
    for (const event of kingJoeSoundEvents(state, previous, previousT, t)) out.push({ ...event, t });
    previous = state;
    previousT = t;
  }
  return out;
}

function ofKind(events: TimedSound[], kind: KingJoeSoundKind): TimedSound[] {
  return events.filter((event) => event.kind === kind);
}

describe("kingjoe sound score", () => {
  it("合体：三段锁环咔哒 + 展臂伺服 + 双肩锁死", () => {
    const events = score("combining", 10, "idle");
    const locks = ofKind(events, "lock");
    expect(locks.map((event) => Number(event.t.toFixed(2)))).toEqual([3.0, 5.0, 7.2, 9.0]);
    expect(ofKind(events, "servo")).toHaveLength(1);
    expect(ofKind(events, "servo")[0]!.t).toBeCloseTo(7.4, 1);
  });

  it("步行：进入伺服 + 每 3s 一次重踏步", () => {
    const events = score("robot", 7, "idle");
    expect(ofKind(events, "servo")).toHaveLength(1);
    const steps = ofKind(events, "footstep");
    expect(steps.map((event) => Number(event.t.toFixed(1)))).toEqual([3.0, 6.0]);
  });

  it("怪光线：进入充能 → 1.05s 发射 → 2.8s 循环", () => {
    const events = score("firing", 6, "idle");
    const charges = ofKind(events, "charge");
    const beams = ofKind(events, "beam");
    expect(charges.map((event) => Number(event.t.toFixed(1)))).toEqual([0.0, 2.8, 5.6]);
    expect(beams.map((event) => Number(event.t.toFixed(2)))).toEqual([1.05, 3.85]);
  });

  it("分离与残缺：解锁、伺服、落地各有声", () => {
    const separation = score("separation", 2, "idle");
    expect(ofKind(separation, "unlock")).toHaveLength(1);
    expect(ofKind(separation, "servo")).toHaveLength(1);
    const crippled = score("crippled", 1, "idle");
    expect(ofKind(crippled, "unlock")).toHaveLength(1);
    expect(ofKind(crippled, "footstep")[0]!.t).toBeCloseTo(0.4, 1);
  });

  it("同一状态同一时间点不重复发声", () => {
    expect(kingJoeSoundEvents("combining", "combining", 3, 3)).toEqual([]);
    expect(kingJoeSoundEvents("idle", "idle", 0, 0)).toEqual([]);
  });
});
