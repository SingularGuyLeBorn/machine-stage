import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { buildModel } from "../../assembler/assembler";
import { validateRegistry } from "../../registry/validate";
import { detectStatic } from "../../solver/detect";
import { partitionExpectedContacts } from "../../solver/whitelist";
import { makeT800Layouts, makeT800Registry, t800Builders } from "./registry";
import { animateT800, t800Pose } from "./motion";
import { T800_HYDRAULICS, cylinderDims, cylinderLayout } from "./spec";

// ============================================================================
// t800 验收测试 —— 零件级粒度 / 零穿模 / 液压缸真实行程
//
// 核心断言：关节转多少度，液压缸的露出杆长就变化多少毫米（几何解，不是动画写死）。
// ============================================================================

function build() {
  const registry = makeT800Registry();
  const model = buildModel(registry, {
    builders: t800Builders,
    instanceLayouts: makeT800Layouts(),
    warnMissingLayout: false,
  });
  const poseAt = (seconds: number) => {
    model.resetNodes();
    animateT800(model, seconds);
    model.syncInstances();
    model.root.updateMatrixWorld(true);
    return t800Pose();
  };
  return { registry, model, poseAt };
}

describe("T-800 右腿注册表", () => {
  it("注册表校验零错误零警告", () => {
    const issues = validateRegistry(makeT800Registry());
    expect(issues.filter((issue) => issue.level === "error")).toEqual([]);
    expect(issues.filter((issue) => issue.level === "warn")).toEqual([]);
  });

  it("零件粒度达到一条腿 ~140 件（不是总成级）", () => {
    const { registry, model } = build();
    expect(registry.parts.length).toBeGreaterThanOrEqual(130);
    const instances = model.parts.reduce((sum, part) => sum + part.instances.length, 0);
    expect(instances).toBeGreaterThanOrEqual(200);
    // 零件 ID 粒度：没有「一个总成当一个件」——每个液压缸拆成 11 件
    for (const spec of T800_HYDRAULICS) {
      const owned = registry.parts.filter((part) => part.id.includes(spec.key));
      expect(owned.length).toBeGreaterThanOrEqual(10);
      const suffixes = owned.map((part) => part.id.split(".").pop() ?? "");
      for (const needed of ["body", "piston", "rod", "eye_a", "eye_b", "gland", "wiper"]) {
        expect(suffixes.some((suffix) => suffix.endsWith(needed))).toBe(true);
      }
    }
  });
});

describe("T-800 装配质量", () => {
  // 判定口径：未豁免报告 = 0（构造性接触如球头销/耳环配合走 expectedContacts 豁免族）
  it("静态装配零穿模（未豁免）", () => {
    const { registry, model } = build();
    model.resetNodes();
    animateT800(model, 0);
    model.syncInstances();
    model.root.updateMatrixWorld(true);
    const reports = detectStatic(model, { minDepthM: 0.0005 });
    const { active } = partitionExpectedContacts(reports, registry.expectedContacts ?? []);
    expect(
      active.map((hit) => `${hit.report.a}↔${hit.report.b} ${hit.report.depth_mm?.toFixed(2)}mm`),
    ).toEqual([]);
  });

  it(
    "屈伸扫掠全程零穿模（未豁免）",
    () => {
      const { registry, model, poseAt } = build();
      for (let frame = 0; frame <= 12; frame++) {
        poseAt((frame / 12) * 5.4);
        const reports = detectStatic(model, { minDepthM: 0.0005 });
        const { active } = partitionExpectedContacts(reports, registry.expectedContacts ?? []);
        expect(
          active.map((hit) => `${hit.report.a}↔${hit.report.b}`),
          `第 ${frame} 帧出现未豁免穿模`,
        ).toEqual([]);
      }
    },
    30_000,
  );
});

describe("T-800 液压驱动缸", () => {
  it("每根缸随关节角真实伸缩（露出杆长 = |AB| - 缸长，几何解）", () => {
    const { poseAt } = build();
    // 逐帧核对：模型里活塞杆节点的位置必须落在 B 端球心上（不是写死位移）
    for (let frame = 0; frame <= 10; frame++) {
      const seconds = (frame / 10) * 5.4;
      const pose = poseAt(seconds);
      for (const spec of T800_HYDRAULICS) {
        const extension = pose.extensions.find((item) => item.key === spec.key);
        expect(extension).toBeDefined();
        const layout = cylinderLayout(spec);
        // 露出杆长 = 当前 |AB| - 导向套口部（几何解，不含任何动画位移）
        const expected = extension!.lengthMm - layout.mouth * 1000;
        expect(Math.abs(extension!.exposedMm - expected)).toBeLessThan(0.01);
      }
    }
  });

  it("关节角与活塞行程严格相关（转多少度就伸缩多少毫米）", () => {
    const { poseAt } = build();
    const knee = T800_HYDRAULICS.find((item) => item.key === "knee_main")!;
    const samples: Array<{ kneeDeg: number; exposedMm: number }> = [];
    for (let frame = 0; frame <= 40; frame++) {
      const pose = poseAt((frame / 40) * 2.3);
      const extension = pose.extensions.find((item) => item.key === knee.key)!;
      samples.push({ kneeDeg: pose.kneeDeg, exposedMm: extension.exposedMm });
    }
    const minKnee = Math.min(...samples.map((s) => s.kneeDeg));
    const maxKnee = Math.max(...samples.map((s) => s.kneeDeg));
    const atMin = samples.find((s) => s.kneeDeg === minKnee)!.exposedMm;
    const atMax = samples.find((s) => s.kneeDeg === maxKnee)!.exposedMm;
    // 膝关节 0°→-60°：主缸行程必须够大（可见的活塞伸缩）
    expect(Math.abs(maxKnee - minKnee)).toBeGreaterThan(40);
    expect(Math.abs(atMax - atMin)).toBeGreaterThan(20);
  });

  it("六根缸全程活塞不出缸、杆不脱缸（余量 > 5mm）", () => {
    const { poseAt } = build();
    for (let frame = 0; frame <= 24; frame++) {
      const pose = poseAt((frame / 24) * 5.4);
      for (const spec of T800_HYDRAULICS) {
        const dims = cylinderDims(spec);
        const layout = cylinderLayout(spec);
        const extension = pose.extensions.find((item) => item.key === spec.key)!;
        const span = extension.lengthMm / 1000;
        const pistonFromA = span - layout.pistonFromB;
        expect(pistonFromA - layout.barrelStart, `${spec.key} 活塞出缸`).toBeGreaterThan(0.005);
        expect(
          layout.barrelStart + layout.barrelEnd - layout.barrelStart - pistonFromA,
          `${spec.key} 活塞撞缸口`,
        ).toBeGreaterThan(0.005);
        expect(
          span - layout.rodStart - spec.lr * dims.L - layout.barrelStart,
          `${spec.key} 杆脱缸`,
        ).toBeGreaterThan(0.005);
        expect(extension.exposedMm, `${spec.key} 露出杆长`).toBeGreaterThan(5);
      }
    }
  });

  it("活塞杆节点与耳环同轴（耳环孔轴 = 销轴方向）", () => {
    const { model, poseAt } = build();
    poseAt(1.1);
    const nodeName = (key: string, kind: "Cyl" | "Rod") =>
      `T800${kind}${key.replace(/(^|_)(\w)/g, (_m, _p, c: string) => c.toUpperCase())}`;
    for (const spec of T800_HYDRAULICS) {
      const rod = model.getNode(nodeName(spec.key, "Rod"));
      const cyl = model.getNode(nodeName(spec.key, "Cyl"));
      expect(rod).toBeDefined();
      expect(cyl).toBeDefined();
      // 杆节点的 +Y 必须指向缸体节点（A 端），耳环颈与缸体同轴
      const axis = new THREE.Vector3(0, 1, 0).applyQuaternion(rod!.quaternion);
      const toCyl = cyl!.position.clone().sub(rod!.position).normalize();
      expect(axis.dot(toCyl)).toBeGreaterThan(0.999);
      // 缸体节点的 +Y 必须指向杆节点（B 端）
      const cylAxis = new THREE.Vector3(0, 1, 0).applyQuaternion(cyl!.quaternion);
      const toRod = rod!.position.clone().sub(cyl!.position).normalize();
      expect(cylAxis.dot(toRod)).toBeGreaterThan(0.999);
    }
  });
});
