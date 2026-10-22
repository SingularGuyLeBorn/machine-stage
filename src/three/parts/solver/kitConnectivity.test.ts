import { describe, expect, it } from "vitest";
import { buildModel } from "../assembler/assembler";
import type { GeometryBuilder } from "../assembler/geometry";
import { bevelBoxGeometry, mergeGeometries } from "../kernel/geometry";
import { makeTestRegistry, testKitLayouts } from "../registry/testKit";
import { detectKitIslands } from "./kitConnectivity";

const dualBoxKit: GeometryBuilder = (spec) => {
  const separation = Number((spec as { params?: Record<string, unknown> }).params?.separation ?? 0.2);
  return mergeGeometries([
    bevelBoxGeometry(0.2, 0.2, 0.2, 0.002).translate(-0.1, 0, 0),
    bevelBoxGeometry(0.2, 0.2, 0.2, 0.002).translate(0.1 + separation, 0, 0),
  ]);
};

function buildKitModel(separation: number, withSupport: boolean) {
  const registry = makeTestRegistry({ gap: -0.01 });
  // 测试用的翼片锚在立柱上，会把孤岛当成外部支撑；本用例不需要它。
  registry.parts = registry.parts.filter((part) => part.id !== "test.frame.fin");
  const kit = registry.parts.find((part) => part.id === "test.frame.pillar")!;
  kit.geometry = { type: "kit", kit: "test_dual_box", params: { separation } };
  kit.mate = { type: "absolute", position: [10, 1, 0] };
  if (withSupport) {
    registry.parts.push({
      id: "test.frame.support",
      name_cn: "外部支撑",
      name_en: "external support",
      assembly: "frame",
      build_layer: 2,
      build_order: 402,
      geometry: { type: "box", w: 0.4, h: 0.4, d: 0.4 },
      material: "probe",
      mate: { type: "absolute", position: [10.4, 1, 0] },
    });
  }
  return buildModel(registry, {
    builders: { test_dual_box: dualBoxKit },
    instanceLayouts: testKitLayouts,
    warnMissingLayout: false,
  });
}

describe("solver/kitConnectivity 合并件内部自连通", () => {
  it("子块断开 200mm 且无外部支撑 → 报 kit 内部悬空", () => {
    const model = buildKitModel(0.2, false);
    const reports = detectKitIslands(model);
    expect(reports).toHaveLength(1);
    expect(reports[0].partId).toBe("test.frame.pillar");
    expect(reports[0].orphanPieces).toBe(1);
    expect(reports[0].gap_mm).toBeGreaterThan(150);
    expect(reports[0].size_mm).toBeCloseTo(200, 0);
    model.dispose();
  });

  it("子块间隙 10mm（<=20mm 阈值）→ 视为连通", () => {
    const model = buildKitModel(0.01, false);
    expect(detectKitIslands(model)).toEqual([]);
    model.dispose();
  });

  it("孤岛被另一个零件在 20mm 内托住 → 不算悬空（ERA 螺栓/格栅叶片）", () => {
    const model = buildKitModel(0.2, true);
    expect(detectKitIslands(model)).toEqual([]);
    model.dispose();
  });
});
