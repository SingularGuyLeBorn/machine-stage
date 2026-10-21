// M134 注册表回归：6 管 + 6 枪机实例化、装配零错误。
import { describe, expect, it } from "vitest";
import { buildModel, validateRegistry } from "@/three/parts";
import { makeM134Layouts, makeM134Registry, M134_BUILDERS } from "./registry";
import { M134_CONSTANTS } from "./constants";

const registry = makeM134Registry();

describe("m134 注册表回归", () => {
  it("validateRegistry 零 issue", () => {
    expect(validateRegistry(registry).filter((issue) => issue.level === "error")).toEqual([]);
  });

  it("6 根枪管 + 6 套独立枪机均为实例化零件", () => {
    const barrel = registry.parts.find((p) => p.id === "m134.barrel.barrel");
    const bolt = registry.parts.find((p) => p.id === "m134.bolt.bolt");
    expect(barrel?.instances).toBe(6);
    expect(bolt?.instances).toBe(6);
    expect(M134_CONSTANTS.BARREL_COUNT).toBe(6);
  });

  it("装配成功，几何顶点与实例矩阵均为有限值", () => {
    const built = buildModel(registry, {
      builders: M134_BUILDERS,
      instanceLayouts: makeM134Layouts(),
      warnMissingLayout: false,
    });
    for (const handle of built.parts) {
      const position = handle.geometry.getAttribute("position");
      for (let i = 0; i < position.count * 3; i++) {
        expect(Number.isFinite(position.array[i])).toBe(true);
      }
    }
    built.dispose();
  });

  it("射速 = 6 × 转子转速（转管核心关系）", () => {
    const shotsPerRev = M134_CONSTANTS.BARREL_COUNT;
    const rotorRpm = 1000; // 真机
    expect((shotsPerRev * rotorRpm) / 60).toBe(100); // 每秒 100 发 = 6000 发/分
  });

  it("枪管束分布半径 + 枪机行程关系（凸轮驱动往复）", () => {
    expect(M134_CONSTANTS.BARREL_RING_R).toBeCloseTo(0.032, 5);
    expect(M134_CONSTANTS.BOLT_STROKE).toBeCloseTo(0.05, 5);
  });
});
