import { describe, expect, it } from "vitest";
import type { ModelRegistry } from "@/three/parts";
import { buildModel, detectUnsupportedParts } from "@/three/parts";
import { findModel } from "@/app/catalog";

// ============================================================================
// 悬空检测验收（P1）
//
// 「碰了不该碰的」由穿模检测负责；「该碰的没碰」由支撑检测负责。
// 1. 虎式整机在 20mm 阈值下全部有支撑邻居（现状 0 报告）。
// 2. 把炮塔吊环抬高 250mm → 恰好报两个实例，且能定位到实例级 ref。
// 3. 同一抬高件打 tags: ["fx"]（特效件）→ 支撑检测豁免它。
// ============================================================================

const model = findModel("tiger");

const build = (registry: ModelRegistry = model.registry!) =>
  buildModel(registry, {
    builders: model.builders,
    instanceLayouts: model.layouts,
    warnMissingLayout: false,
  });

describe("solver/support 悬空检测", () => {
  it("虎式整机在 20mm 阈值下没有疑似悬空件", () => {
    const built = build();
    built.resetNodes();
    const reports = detectUnsupportedParts(built);
    expect(reports.map((report) => `${report.ref} @${report.gap_mm.toFixed(1)}mm`)).toEqual([]);
    built.dispose();
  });

  it("炮塔吊环抬高 250mm → 恰好报两个实例（实例级定位）", () => {
    const registry = model.registry!;
    const eye = registry.parts.find((part) => part.id === "tiger.turret.lifting_eye")!;
    const mate = eye.mate as { type: "absolute"; position: [number, number, number] };
    const patched: ModelRegistry = {
      ...registry,
      parts: registry.parts.map((part) =>
        part.id === eye.id
          ? {
              ...part,
              mate: {
                type: "absolute" as const,
                position: [mate.position[0], mate.position[1] + 0.25, mate.position[2]],
              },
            }
          : part,
      ),
    };
    const built = build(patched);
    built.resetNodes();
    const reports = detectUnsupportedParts(built);
    expect(reports.map((report) => report.ref).sort()).toEqual([
      "tiger.turret.lifting_eye[0]",
      "tiger.turret.lifting_eye[1]",
    ]);
    expect(reports[0]!.gap_mm).toBeGreaterThan(200);
    expect(reports[0]!.nearestPartId).not.toBe("tiger.turret.lifting_eye");
    built.dispose();
  });

  it('抬高件打 tags: ["fx"] → 支撑检测豁免', () => {
    const registry = model.registry!;
    const eye = registry.parts.find((part) => part.id === "tiger.turret.lifting_eye")!;
    const mate = eye.mate as { type: "absolute"; position: [number, number, number] };
    const patched: ModelRegistry = {
      ...registry,
      parts: registry.parts.map((part) =>
        part.id === eye.id
          ? {
              ...part,
              tags: ["fx"],
              mate: {
                type: "absolute" as const,
                position: [mate.position[0], mate.position[1] + 0.25, mate.position[2]],
              },
            }
          : part,
      ),
    };
    const built = build(patched);
    built.resetNodes();
    expect(detectUnsupportedParts(built)).toEqual([]);
    built.dispose();
  });
});
