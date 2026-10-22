import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { buildModel } from "../../assembler/assembler";
import { kingjoeModuleBuilders, makeKingJoeModuleRegistry } from "./registry";
import { animateKingJoeModules } from "./motion";
import { pedanPower, QUIET_ACTIVITY } from "./machinery";
import { redRayEnd } from "./rays";

describe("佩丹内部联动与输能", () => {
  it("转子、执行器、弹簧和光包都有独立节点，抬臂使整组机构响应且没有瞬移", () => {
    const model = buildModel(makeKingJoeModuleRegistry(), { builders: kingjoeModuleBuilders });
    try {
      const rigs = [...model.nodes.values()].filter((n) => /^Pedan_(rotor|slider|spring|flow)_/.test(n.name));
      expect(rigs.length).toBeGreaterThan(600);
      animateKingJoeModules(model, 0, "closed");
      const before = rigs.map((n) => n.matrix.clone());
      animateKingJoeModules(model, 0, "beam");
      animateKingJoeModules(model, 1.4, "beam");
      for (const node of rigs) expect(node.matrix.elements.every(Number.isFinite), node.name).toBe(true);
      expect(rigs.filter((n, i) => !n.matrix.equals(before[i]!)).length).toBeGreaterThan(rigs.length * 0.8);
      const positions = rigs.map((n) => n.position.clone());
      animateKingJoeModules(model, 1.4001, "beam");
      for (const [i, node] of rigs.entries()) {
        // 光包沿管道循环，包裹点允许从末端返回起点；实体机构不能跳位。
        if (!node.name.startsWith("Pedan_flow_"))
          expect(node.position.distanceTo(positions[i]!)).toBeLessThan(0.001);
      }
      expect(
        model.getPart("kingjoemodules.head_arms.internal_brain_network_optical_feedthrough"),
      ).toBeDefined();
      for (const side of ["l", "r"]) {
        expect(model.getPart(`kingjoemodules.chest.internal_modulator_${side}_crystal`)!.def.material).toBe(
          `pedan_power_modulator_${side}`,
        );
        expect(model.getNode(`KneeCover_${side}`)!.parent).toBe(model.getNode("Module_legs"));
      }
    } finally {
      model.dispose();
    }
  }, 20000);
  it("胸窗与核心共用的功率有近灭段，蓄能和发射会提升输出，红束只点亮所属回路", () => {
    const samples = Array.from({ length: 200 }, (_, i) => pedanPower(i * 0.1, "modulator_l"));
    expect(Math.min(...samples)).toBeLessThan(0.01);
    expect(Math.max(...samples)).toBeGreaterThan(0.9);
    expect(pedanPower(5, "modulator_l", { ...QUIET_ACTIVITY, charge: 1 })).toBeGreaterThan(0.8);
    expect(pedanPower(5, "brain", { ...QUIET_ACTIVITY, yellow: 1 })).toBeGreaterThan(1.2);
    expect(pedanPower(5, "legs", { ...QUIET_ACTIVITY, redModule: "legs" })).toBeGreaterThan(1);
    expect(pedanPower(5, "chest", { ...QUIET_ACTIVITY, redModule: "legs" })).toBeLessThan(0.3);
  });
  it("双红束在模块局部空间轻微内收、下倾，末端仍分开，倾斜模块也保持方向", () => {
    for (const angle of [0, 0.4, -0.6, 1.2]) {
      const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(angle, angle / 2, -angle));
      const left = new THREE.Vector3(-1, 0, 0).applyQuaternion(rotation);
      const right = left.clone().negate();
      const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(rotation),
        up = new THREE.Vector3(0, 1, 0).applyQuaternion(rotation);
      const a = redRayEnd(left, right, forward, up),
        b = redRayEnd(right, left, forward, up);
      expect(a.distanceTo(b)).toBeCloseTo(left.distanceTo(right) * 0.72, 8);
      expect(a.clone().sub(left).dot(up)).toBeCloseTo(-0.32, 8);
      expect(b.clone().sub(right).dot(forward)).toBeCloseTo(4.5, 8);
    }
  });
});
