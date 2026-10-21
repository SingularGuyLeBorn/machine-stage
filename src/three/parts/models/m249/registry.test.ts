// M249 注册表回归：零件粒度、弹链排布、装配零错误。
import { describe, expect, it } from "vitest";
import { buildModel, validateRegistry } from "@/three/parts";
import { makeM249Layouts, makeM249Registry, M249_BUILDERS } from "./registry";
import { beltRoundPos, BELT_LINKS, BELT_PITCH, BELT_ROUND_CENTER, beltRoundMatrix, M855_OFFSET } from "./belt";

const registry = makeM249Registry();

describe("m249 注册表回归", () => {
  it("validateRegistry 零 issue", () => {
    expect(validateRegistry(registry).filter((issue) => issue.level === "error")).toEqual([]);
  });

  it("零件数 ≥ 30、实例 ≥ 120（弹链六分件 ×20 链上）", () => {
    expect(registry.parts.length).toBeGreaterThanOrEqual(30);
    const instances = registry.parts.reduce((sum, part) => sum + (part.instances ?? 1), 0);
    expect(instances).toBeGreaterThanOrEqual(120);
  });

  it("装配成功，所有几何顶点、包围盒与实例矩阵均为有限值", () => {
    const built = buildModel(registry, {
      builders: M249_BUILDERS,
      instanceLayouts: makeM249Layouts(),
      warnMissingLayout: false,
    });
    for (const handle of built.parts) {
      const position = handle.geometry.getAttribute("position");
      for (let i = 0; i < position.count * 3; i++) {
        expect(Number.isFinite(position.array[i])).toBe(true);
      }
      const matrix = built.instanceMatrix(handle, 0, new (require("three").Matrix4)());
      expect(matrix.elements.every((value: number) => Number.isFinite(value))).toBe(true);
    }
    built.dispose();
  });

  it("弹链排布：链上相邻弹心距 = 节距 15mm，最前一发在抱弹口", () => {
    expect(beltRoundPos(0)[2]).toBeCloseTo(0.005, 5);
    for (let i = 0; i < BELT_LINKS - 1; i++) {
      const a = beltRoundPos(i);
      const b = beltRoundPos(i + 1);
      expect(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])).toBeCloseTo(BELT_PITCH, 6);
    }
  });

  it("弹链第 0 发位姿在托盘高度（膛轴上 19mm），沿轴偏移到弹心", () => {
    const e = beltRoundMatrix(0, 0).elements;
    // 布局矩阵平移到「弹心 - 底缘到弹心」= 弹壳底缘位：y = 托盘高 + stage
    expect(e[13]).toBeCloseTo(0.019 + 0.3, 5);
    expect(e[14]).toBeCloseTo(0.005 - BELT_ROUND_CENTER, 5);
    // 子件沿轴偏移把弹心推到托盘高度（底缘 + 弹心偏移）
    const bullet = beltRoundMatrix(0, M855_OFFSET.bullet).elements;
    expect(bullet[13]).toBeCloseTo(0.019 + 0.3, 5);
    // 弹药子件偏移单调递增（弹头在弹壳前方）
    expect(M855_OFFSET.bullet).toBeGreaterThan(M855_OFFSET.propellant);
    expect(M855_OFFSET.propellant).toBeGreaterThan(M855_OFFSET.case);
  });
});
