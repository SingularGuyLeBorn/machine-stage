// M2HB 注册表回归：零件粒度、弹链排布、装配零错误。
import { describe, expect, it } from "vitest";
import { buildModel, validateRegistry } from "@/three/parts";
import { makeM2hbLayouts, makeM2hbRegistry, M2HB_BUILDERS } from "./registry";
import { beltRoundPos, BELT_LINKS, BELT_PITCH, M2_OFFSET } from "./belt";
import { M2HB_CONSTANTS } from "./constants";

const registry = makeM2hbRegistry();

describe("m2hb 注册表回归", () => {
  it("validateRegistry 零 issue", () => {
    expect(validateRegistry(registry).filter((issue) => issue.level === "error")).toEqual([]);
  });

  it("零件数 ≥ 35、实例 ≥ 100（弹链六分件 ×14 链上 + 铆钉族 18）", () => {
    expect(registry.parts.length).toBeGreaterThanOrEqual(35);
    const instances = registry.parts.reduce((sum, part) => sum + (part.instances ?? 1), 0);
    expect(instances).toBeGreaterThanOrEqual(100);
  });

  it("装配成功，几何顶点与实例矩阵均为有限值", () => {
    const built = buildModel(registry, {
      builders: M2HB_BUILDERS,
      instanceLayouts: makeM2hbLayouts(),
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

  it("弹链排布：链上相邻弹心距 = M9 节距 35mm", () => {
    expect(beltRoundPos(0)[2]).toBeCloseTo(0.005, 5);
    for (let i = 0; i < BELT_LINKS - 1; i++) {
      const a = beltRoundPos(i);
      const b = beltRoundPos(i + 1);
      expect(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])).toBeCloseTo(BELT_PITCH, 6);
    }
  });

  it("枪管短后坐行程远小于枪机行程（加速子传能比 ≈ 8.3×）", () => {
    expect(M2HB_CONSTANTS.BARREL_STROKE).toBeCloseTo(0.012, 5);
    expect(M2HB_CONSTANTS.BOLT_STROKE).toBeCloseTo(0.1, 5);
    expect(M2HB_CONSTANTS.BOLT_STROKE / M2HB_CONSTANTS.BARREL_STROKE).toBeGreaterThan(8);
  });

  it("弹药子件偏移单调（弹头在发射药前方）", () => {
    expect(M2_OFFSET.bullet).toBeGreaterThan(M2_OFFSET.propellant);
    expect(M2_OFFSET.propellant).toBeGreaterThan(M2_OFFSET.case);
  });
});
