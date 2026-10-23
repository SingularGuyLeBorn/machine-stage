import { describe, expect, it } from "vitest";
import {
  sampleTransit,
  transitArrival,
  TRANSIT_DELAY,
  sampleRedTransit,
  redRayPower,
  RED_FEED_DELAY,
  redGather,
  createBoostClock,
  advanceBoostClock,
  boostAt,
  redPacketPosition,
} from "./energy-transit.mjs";

describe("核心到灯窗的传能时序", () => {
  it("按核心、胸甲、头部、屏幕的延迟传递同一波形，发射前到达屏幕", () => {
    for (const delay of Object.values(TRANSIT_DELAY)) {
      expect(sampleTransit(delay, delay)).toBe(0);
      expect(sampleTransit(delay + 0.4, delay)).toBeCloseTo(sampleTransit(0.4, 0));
      expect(transitArrival(1.5, delay)).toBe(1);
    }
    expect(sampleTransit(0.2, TRANSIT_DELAY.core)).toBeGreaterThan(0);
    expect(sampleTransit(0.2, TRANSIT_DELAY.chest)).toBe(0);
  });
  it("无蓄能、分体合体阶段和结束后归零，连续采样有界且无尖跳", () => {
    for (const delay of Object.values(TRANSIT_DELAY)) {
      expect(sampleTransit(null, delay)).toBe(0);
      expect(sampleTransit(-1, delay)).toBe(0);
      expect(sampleTransit(6, delay)).toBe(0);
      let previous = 0;
      for (let frame = 0; frame <= 600; frame++) {
        const power = sampleTransit(frame / 100, delay);
        expect(power).toBeGreaterThanOrEqual(0);
        expect(power).toBeLessThanOrEqual(1);
        expect(Math.abs(power - previous)).toBeLessThan(0.06);
        previous = power;
      }
    }
  });
});

describe("分体双天线的共同蓄能时钟", () => {
  it("核心先启动、天线尖端随后充满，发射严格晚于尖端蓄能", () => {
    expect(sampleRedTransit(0.2)).toBeGreaterThan(0);
    expect(sampleRedTransit(0.2, RED_FEED_DELAY.mount)).toBe(0);
    expect(sampleRedTransit(0.5, RED_FEED_DELAY.tip)).toBe(0);
    expect(sampleRedTransit(1.1, RED_FEED_DELAY.tip)).toBe(1);
    expect(redRayPower(1.1)).toBe(0);
    expect(redRayPower(RED_FEED_DELAY.fire)).toBe(0);
    expect(redRayPower(1.8)).toBe(1);
  });
  it("蓄能环列逐渐向尖端收拢，同亮停留后恢复传递", () => {
    for (const phase of [0.1, 0.3, 0.7, 0.9]) {
      expect(redPacketPosition(phase, 0)).toBe(phase);
      expect(redPacketPosition(phase, 0.7)).toBeGreaterThan(phase);
      expect(redPacketPosition(phase, 1.1)).toBeGreaterThanOrEqual(0.72);
      expect(redPacketPosition(phase, 1.4)).toBe(redPacketPosition(phase, 1.1));
      expect(redPacketPosition(phase, 2.1)).toBe(phase);
    }
    expect(redRayPower(1.5)).toBe(0);
    expect(redGather(null)).toBe(0);
    let previous = 0;
    for (let frame = 0; frame <= 300; frame++) {
      const value = redGather(frame / 100);
      expect(Math.abs(value - previous)).toBeLessThan(0.04);
      previous = value;
    }
  });
  it("退出后归零，持续发射有界且没有尖跳", () => {
    for (const delay of [0, RED_FEED_DELAY.mount, RED_FEED_DELAY.tip]) {
      expect(sampleRedTransit(null, delay)).toBe(0);
      expect(sampleRedTransit(-1, delay)).toBe(0);
      let previous = 0;
      for (let frame = 0; frame < 1000; frame++) {
        const value = sampleRedTransit(frame / 100, delay);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
        expect(Math.abs(value - previous)).toBeLessThan(0.04);
        previous = value;
      }
    }
    expect(redRayPower(null)).toBe(0);
  });
});

describe("加力传播与连续相位", () => {
  it("先提升内部速度，外束从根到尖依次收到加力，快速反向也连续", () => {
    const clock = createBoostClock(0);
    advanceBoostClock(clock, 0, true);
    for (let frame = 1; frame <= 100; frame++) advanceBoostClock(clock, frame / 100, true);
    expect(clock.flowTime).toBeGreaterThan(1.8);
    expect(boostAt(clock, 1, 0.3)).toBe(1);
    expect(boostAt(clock, 1, 1.45)).toBe(0);
    const old = clock.flowTime,
      level = boostAt(clock, 1);
    advanceBoostClock(clock, 1, false);
    expect(clock.flowTime).toBe(old);
    expect(boostAt(clock, 1)).toBe(level);
    advanceBoostClock(clock, 1.2, false);
    const turning = boostAt(clock, 1.2);
    advanceBoostClock(clock, 1.2, true);
    expect(boostAt(clock, 1.2)).toBe(turning);
    for (let frame = 121; frame <= 400; frame++) advanceBoostClock(clock, frame / 100, true);
    expect(boostAt(clock, 4, 1.45)).toBe(1);
    advanceBoostClock(clock, 4, false);
    for (let frame = 401; frame <= 700; frame++) advanceBoostClock(clock, frame / 100, false);
    expect(boostAt(clock, 7, 1.45)).toBe(0);
    const stopped = clock.flowTime;
    advanceBoostClock(clock, 7.1, false);
    expect(clock.flowTime - stopped).toBeCloseTo(0.1);
  });
});
