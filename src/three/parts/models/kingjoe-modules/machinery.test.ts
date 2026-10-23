import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { buildModel } from "../../assembler/assembler";
import { kingjoeModuleBuilders, makeKingJoeModuleRegistry } from "./registry";
import { animateKingJoeModules } from "./motion";
import { pedanPower, QUIET_ACTIVITY } from "./machinery";
import { redRayEnd } from "./rays";

describe("佩丹内部联动与输能", () => {
  it("四分体内部实例各翻倍，新增附件扫掠留在原设备安全球内", () => {
    const registry = makeKingJoeModuleRegistry();
    // 保留上一轮设备翻倍契约，后续空腔、关节和光学总成另有独立验证。
    const internal = registry.parts.filter(
      (p) =>
        p.tags?.includes("internal") &&
        !p.tags.some((tag) =>
          [
            "cavity-device",
            "joint-drive",
            "gel-link",
            "flex-frame",
            "orbital-core",
            "optical-interior",
          ].includes(tag),
        ),
    );
    for (const [module, before] of Object.entries({ legs: 990, pelvis: 245, chest: 513, head_arms: 1016 })) {
      expect(
        internal.filter((p) => p.assembly === module).reduce((sum, p) => sum + (p.instances ?? 1), 0),
      ).toBe(before * 2);
    }
    const model = buildModel(registry, { builders: kingjoeModuleBuilders });
    try {
      const details = model.parts.filter((p) => p.def.tags?.includes("pedan-detail"));
      const vertex = new THREE.Vector3(),
        transform = new THREE.Matrix4();
      for (const time of [0, 0.3, 0.9, 1.7, 2.8, 4.2]) {
        animateKingJoeModules(model, time, "beam");
        model.syncInstances();
        for (const part of details) {
          const base = model.getNode(part.def.node!)!;
          const inverse = base.matrixWorld.clone().invert();
          const mount = registry.parts.find((p) => p.node === base.name && p.id.endsWith("_mount"))!;
          const r = Number((mount.geometry as { params: Record<string, number> }).params.r) / 0.58;
          const positions = part.geometry.getAttribute("position");
          const centers = new Set<string>();
          for (const instance of part.instances) {
            transform
              .copy(inverse)
              .multiply(model.root.matrixWorld)
              .multiply(model.instanceMatrix(part, instance.index, new THREE.Matrix4()));
            centers.add(new THREE.Vector3().setFromMatrixPosition(transform).toArray().join(","));
            for (let i = 0; i < positions.count; i++) {
              vertex.fromBufferAttribute(positions, i).applyMatrix4(transform);
              expect(vertex.length(), part.partId).toBeLessThan(r);
            }
          }
          expect(centers.size, part.partId).toBe(part.instances.length);
        }
      }
    } finally {
      model.dispose();
    }
  }, 20000);
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
