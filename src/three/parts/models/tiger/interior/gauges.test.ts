import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { buildModel } from "@/three/parts";
import { findModel } from "@/app/catalog";
import {
  GAUGE_SWEEP,
  gaugeNeedleAngle,
  tigerGaugeSignals,
  TIGER_CRANK_END,
} from "../motion";
import { gaugeNodeName } from "./registry";

// ============================================================================
// 仪表真指针验收
//
// 口径：5 只表由车辆状态驱动（不是贴图），指针行程 240°、两端夹紧；
// 零件侧要求「指针零件骑在 5 个节点上、表盘在指针后面 0.2mm」，
// 否则动画要么不动（没节点）、要么指针穿盘（间隙算错）。
// ============================================================================

describe("tiger/interior 仪表真指针", () => {
  it("指针角：零位 -120°、满量程 +120°、中间单调且两端夹紧", () => {
    expect(gaugeNeedleAngle(0, 100)).toBeCloseTo(-Math.PI / 2 - GAUGE_SWEEP / 2, 6);
    expect(gaugeNeedleAngle(100, 100)).toBeCloseTo(-Math.PI / 2 + GAUGE_SWEEP / 2, 6);
    expect(gaugeNeedleAngle(50, 100)).toBeCloseTo(-Math.PI / 2, 6);
    // 超量程 / 负值都夹在两端，不许指针转出表盘
    expect(gaugeNeedleAngle(1000, 100)).toBeCloseTo(gaugeNeedleAngle(100, 100), 6);
    expect(gaugeNeedleAngle(-5, 100)).toBeCloseTo(gaugeNeedleAngle(0, 100), 6);
    // 单调递增
    let previous = -Infinity;
    for (let v = 0; v <= 100; v += 5) {
      const angle = gaugeNeedleAngle(v, 100);
      expect(angle).toBeGreaterThan(previous);
      previous = angle;
    }
  });

  it("信号：停机全零；点火过程转速上升；行进才有车速；加油油量上升", () => {
    const idle = tigerGaugeSignals(0, "idle");
    expect(idle.rpm).toBe(0);
    expect(idle.speedKmh).toBe(0);
    expect(idle.waterTempC).toBe(18);

    const cranking = tigerGaugeSignals((0 + TIGER_CRANK_END) / 2, "engine_start");
    expect(cranking.rpm).toBeGreaterThan(0);
    const warm = tigerGaugeSignals(TIGER_CRANK_END + 6, "engine_start");
    expect(warm.waterTempC).toBeGreaterThan(cranking.waterTempC);

    const driving = tigerGaugeSignals(1.2, "driving");
    expect(driving.speedKmh).toBeGreaterThan(0);
    expect(tigerGaugeSignals(1.2, "running").speedKmh).toBe(0);

    expect(tigerGaugeSignals(3, "refuel").fuel).toBeGreaterThan(tigerGaugeSignals(0, "refuel").fuel);
    expect(tigerGaugeSignals(9, "refuel").fuel).toBeLessThanOrEqual(1);
  });

  it("装配：指针零件骑 5 个节点，表盘在指针后方且不穿模", () => {
    const model = findModel("tiger");
    const registry = model.registry!;
    const needle = registry.parts.find((part) => part.id === "tiger.interior.gauge_needle");
    expect(needle).toBeDefined();
    expect(needle!.instances).toBe(5);
    expect(needle!.instance_nodes).toEqual([0, 1, 2, 3, 4].map((i) => gaugeNodeName(i)));
    for (const name of [0, 1, 2, 3, 4].map((i) => gaugeNodeName(i))) {
      expect(registry.nodes.some((node) => node.name === name)).toBe(true);
    }

    const built = buildModel(registry, {
      builders: model.builders,
      instanceLayouts: model.layouts,
      warnMissingLayout: false,
    });
    const dial = built.getPart("tiger.interior.gauge_dial")!;
    const needleHandle = built.getPart("tiger.interior.gauge_needle")!;
    const matrix = new THREE.Matrix4();
    const dialBox = new THREE.Box3();
    const needleBox = new THREE.Box3();
    for (let i = 0; i < 5; i++) {
      built.instanceMatrix(dial, i, matrix);
      dialBox.copy(dial.geometry.boundingBox!).applyMatrix4(matrix);
      built.instanceMatrix(needleHandle, i, matrix);
      needleBox.copy(needleHandle.geometry.boundingBox!).applyMatrix4(matrix);
      // 指针在表盘前方（+X 朝向驾驶员），且不相交
      expect(needleBox.min.x).toBeGreaterThan(dialBox.max.x);
    }

    // 节点驱动：指针转到满量程后，实例矩阵必须跟着动（否则就是「没接上」
    const node = built.getNode(gaugeNodeName(0))!;
    const before = new THREE.Matrix4();
    const after = new THREE.Matrix4();
    built.instanceMatrix(needleHandle, 0, before);
    node.rotation.x = gaugeNeedleAngle(1, 1);
    built.syncInstances();
    built.instanceMatrix(needleHandle, 0, after);
    expect(before.equals(after)).toBe(false);
    built.dispose();
  }, 120_000);
});
