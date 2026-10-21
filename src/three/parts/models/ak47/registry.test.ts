// 回归：ak47 注册表必须通过校验与装配，且几何/实例矩阵全部有限。
// 背景同 tiger：表达式求值缺失与常量名拼错都会静默破图，必须在这里暴露。
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { buildModel, validateRegistry } from "@/three/parts";
import { makeAk47Layouts, makeAk47Registry } from "./registry";
import { AK47_BUILDERS } from "./registry";
import { magRoundArc, magRoundStaggerX, magRoundTransform } from "./constants";

const registry = makeAk47Registry();

describe("ak47 注册表回归", () => {
  it("validateRegistry 零 issue", () => {
    expect(validateRegistry(registry)).toEqual([]);
  });

  it("零件数 ≥ 55、实例 ≥ 190（弹药六分件 ×30 发）", () => {
    const built = buildModel(registry, {
      builders: AK47_BUILDERS,
      instanceLayouts: makeAk47Layouts(),
      warnMissingLayout: false,
    });
    const instances = built.parts.reduce((sum, handle) => sum + handle.instances.length, 0);
    expect(built.parts.length).toBeGreaterThanOrEqual(55);
    expect(instances).toBeGreaterThanOrEqual(190);
    built.dispose();
  });

  it("装配成功，所有几何顶点、包围盒与实例矩阵均为有限值", () => {
    const built = buildModel(registry, {
      builders: AK47_BUILDERS,
      instanceLayouts: makeAk47Layouts(),
      warnMissingLayout: false,
    });
    const bad: string[] = [];
    for (const handle of built.parts) {
      const position = handle.geometry.getAttribute("position") as { array: ArrayLike<number> };
      let nan = 0;
      for (let i = 0; i < position.array.length; i++) {
        if (!Number.isFinite(position.array[i])) nan++;
      }
      if (nan > 0) bad.push(`${handle.partId} nan=${nan}`);
      const box = handle.geometry.boundingBox;
      if (!box || !Number.isFinite(box.min.x) || !Number.isFinite(box.max.x)) {
        bad.push(`${handle.partId} box`);
      }
      const matrix = new THREE.Matrix4();
      for (const instance of handle.instances) {
        built.instanceMatrix(handle, instance.index, matrix);
        if (!matrix.elements.every((value) => Number.isFinite(value))) {
          bad.push(`${handle.partId}[${instance.index}] matrix`);
        }
      }
    }
    expect(bad).toEqual([]);
    built.dispose();
  });

  it("弹匣堆叠：弹心沿弧向后下、弹轴随弧倾斜（香蕉匣）", () => {
    let prevZ = Infinity;
    let prevY = Infinity;
    for (let i = 1; i < 30; i++) {
      const { pos, axis } = magRoundTransform(i);
      expect(pos[2]).toBeLessThan(prevZ); // 向后
      expect(pos[1]).toBeLessThan(prevY); // 向下
      expect(axis[2]).toBeGreaterThan(0.85); // 弹轴 ≈ 枪膛轴（随弧法向倾斜 ≤28°）
      prevZ = pos[2];
      prevY = pos[1];
    }
    // 抱弹口：第 1 发在供弹位（弹心 y -10mm、z -30.4mm，轴水平）
    const feed = magRoundTransform(1);
    expect(feed.pos[1]).toBeCloseTo(-0.01, 5);
    expect(feed.pos[2]).toBeCloseTo(-0.0304, 5);
    expect(feed.alpha).toBeCloseTo(0, 5);
    // 相邻发中心距 > 底缘 ⌀11.35（互不重叠）
    for (let i = 1; i < 29; i++) {
      const a = magRoundTransform(i).pos;
      const b = magRoundTransform(i + 1).pos;
      const d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
      expect(d, `弹 ${i}↔${i + 1} 中心距 ${(d * 1000).toFixed(1)}mm`).toBeGreaterThan(0.01135);
    }
    // 底部弹随弧倾斜 ~28°
    expect(magRoundTransform(29).alpha).toBeGreaterThan(0.4);
  });

  it("双列横错：顶部收敛、下部全错距", () => {
    expect(Math.abs(magRoundStaggerX(1))).toBe(0); // 顶部 3 发居中单列
    expect(Math.abs(magRoundStaggerX(2))).toBe(0);
    expect(Math.abs(magRoundStaggerX(3))).toBe(0);
    expect(Math.abs(magRoundStaggerX(4))).toBeCloseTo(0.005, 4);
    expect(Math.abs(magRoundStaggerX(20))).toBeCloseTo(0.005, 4);
    // 相邻两发中心距 > 底缘 ⌀11.35mm：互不重叠（0 号弹在膛内不参与弧排布）
    for (let i = 1; i < 29; i++) {
      const a = magRoundTransform(i);
      const b = magRoundTransform(i + 1);
      const d = Math.hypot(a.pos[0] - b.pos[0], a.pos[1] - b.pos[1], a.pos[2] - b.pos[2]);
      expect(d, `弹 ${i}↔${i + 1} 距 ${(d * 1000).toFixed(1)}mm`).toBeGreaterThan(0.01135);
    }
  });

  it("堆叠弧长单调递增（0 号弹在膛内不走弧）", () => {
    expect(magRoundArc(0)).toBe(0);
    let prev = -1;
    for (let i = 1; i < 30; i++) {
      const u = magRoundArc(i);
      expect(u).toBeGreaterThan(prev);
      prev = u;
    }
    // 满弹堆叠 178mm（实车弹匣内高 ~165mm + 托弹板行程）
    expect(magRoundArc(29)).toBeGreaterThan(0.16);
    expect(magRoundArc(29)).toBeLessThan(0.2);
  });
});
