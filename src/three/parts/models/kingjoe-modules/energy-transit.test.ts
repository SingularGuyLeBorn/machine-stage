import { describe, expect, it } from "vitest";
import { sampleTransit, transitArrival, TRANSIT_DELAY } from "./energy-transit.mjs";

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
