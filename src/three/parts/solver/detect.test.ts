import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { buildModel } from "../assembler/assembler";
import { makeTestRegistry, testKitLayouts } from "../registry/testKit";
import { detectStatic, detectSweep, getBVH } from "./detect";

// ============================================================================
// M-A 验收：能加载测试表并输出实例级穿模报告（test.box[0] ↔ test.box[1]）
// ============================================================================

const buildTestModel = (gap: number) =>
  buildModel(makeTestRegistry({ gap }), { instanceLayouts: testKitLayouts, warnMissingLayout: false });

describe("solver/detect 静态穿模检测", () => {
  it("两个实例重叠 1mm → 输出实例级报告，深度≈1mm", () => {
    const model = buildTestModel(0.001);
    const reports = detectStatic(model);
    expect(reports.length).toBe(1);
    const report = reports[0];
    expect(report.type).toBe("clipping");
    expect(report.phase).toBe("static");
    expect([report.a, report.b].sort()).toEqual(["test.frame.box[0]", "test.frame.box[1]"]);
    expect(report.depth_mm).toBeGreaterThan(0.8);
    expect(report.depth_mm).toBeLessThan(1.2);
    expect(report.severity).toBe("error");
    expect(report.frame).toBeNull();
    expect(report.hint).toContain("GAP");
    expect(report.point).toHaveLength(3);
    model.dispose();
  });

  it("分离 1cm → 报告为空", () => {
    const model = buildTestModel(-0.01);
    expect(detectStatic(model)).toEqual([]);
    model.dispose();
  });

  it("恰好接触（0 间隙）→ 视作装配接触，不报告", () => {
    const model = buildTestModel(0);
    expect(detectStatic(model)).toEqual([]);
    model.dispose();
  });

  it("阈值可调：minDepthM 抬高后 1mm 重叠不再报告", () => {
    const model = buildTestModel(0.001);
    expect(detectStatic(model, { minDepthM: 0.002 })).toEqual([]);
    model.dispose();
  });

  it("过滤器可圈定检测范围（层验收）", () => {
    const model = buildTestModel(0.001);
    const layer2Only = detectStatic(model, { filter: (handle) => handle.buildLayer === 2 });
    expect(layer2Only).toEqual([]);
    const layer1Only = detectStatic(model, { filter: (handle) => handle.buildLayer <= 1 });
    expect(layer1Only.length).toBe(1);
    model.dispose();
  });

  it("进度回调覆盖全部候选对", () => {
    const model = buildTestModel(0.001);
    let last = 0;
    detectStatic(model, {
      onProgress: (done, total) => {
        expect(done).toBeLessThanOrEqual(total);
        last = done;
      },
    });
    expect(last).toBeGreaterThan(0);
    model.dispose();
  });

  it("pairShard 分片后并集与全量一致（Worker 并行不重不漏）", () => {
    const model = buildTestModel(0.001);
    const keyOf = (report: { a: string; b: string; depth_mm: number | null }) =>
      `${report.a}|${report.b}|${report.depth_mm}`;
    const full = detectStatic(model).map(keyOf).sort();
    const merged = [0, 1, 2].flatMap((index) =>
      detectStatic(model, { pairShard: { index, count: 3 } }).map(keyOf),
    );
    expect(merged.sort()).toEqual(full);
    model.dispose();
  });
});

describe("solver/detect 动画扫掠检测", () => {
  it("旋转翼片扫过立柱 → 输出带帧号的动画相报告", () => {
    const registry = makeTestRegistry({ gap: -0.01 });
    const fin = registry.parts.find((part) => part.id === "test.frame.fin")!;
    // 换成横向长翼片并压到立柱腰部：静止即相交，旋转时持续相交（确定性用例）
    fin.geometry = { type: "box", w: 1.2, h: 0.6, d: 0.05, bevel: 0.005 };
    fin.mate = { type: "absolute", position: [0, 0, 0], rotation: [0, 0, 0] };
    registry.nodes[0].pivot = [2.5, 2.0, 0]; // 转子中心落在立柱中段
    const model = buildModel(registry, { instanceLayouts: testKitLayouts, warnMissingLayout: false });
    const reports = detectSweep(model, {
      duration: 2,
      fps: 30,
      applyPose: (t) => {
        model.resetNodes();
        model.getNode("TestRotor")!.rotation.y = t * Math.PI; // 半圈/秒
      },
    });
    expect(reports.length).toBeGreaterThan(0);
    const report = reports[0];
    expect(report.phase).toBe("animation");
    expect(report.frame).not.toBeNull();
    const refs = [report.a, report.b];
    expect(refs.some((ref) => ref.startsWith("test.frame.fin"))).toBe(true);
    expect(refs.some((ref) => ref.startsWith("test.frame.pillar"))).toBe(true);
    model.dispose();
  });

  it("静止不动且互不接触 → 扫掠报告为空", () => {
    const model = buildTestModel(-0.01);
    const reports = detectSweep(model, {
      duration: 1,
      fps: 30,
      applyPose: () => {
        model.resetNodes();
      },
    });
    expect(reports).toEqual([]);
    model.dispose();
  });
});

describe("solver/getBVH", () => {
  it("同一几何只构建一次 BVH", () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const first = getBVH(geometry);
    const second = getBVH(geometry);
    expect(first).toBe(second);
    geometry.dispose();
  });
});
