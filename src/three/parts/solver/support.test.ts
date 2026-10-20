import { describe, expect, it } from "vitest";
import * as THREE from "three";
import type { InstanceLayout, ModelRegistry } from "@/three/parts";
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

const build = (
  registry: ModelRegistry = model.registry!,
  instanceLayouts: Record<string, InstanceLayout> = model.layouts!,
) =>
  buildModel(registry, {
    builders: model.builders,
    instanceLayouts,
    warnMissingLayout: false,
  });

/** 吊环挂在 Turret 节点上、走实例布局（忽略 mate），抬高必须改布局而不是 mate。 */
const raisedEyeLayouts = (): Record<string, InstanceLayout> => {
  const base = model.layouts!["turret.roofEyes"]!;
  return {
    ...model.layouts,
    "turret.roofEyes": (args) =>
      base(args).premultiply(new THREE.Matrix4().makeTranslation(0, 0.25, 0)),
  };
};

describe("solver/support 悬空检测", () => {
  it("虎式整机在 20mm 阈值下没有疑似悬空件", () => {
    const built = build();
    built.resetNodes();
    const reports = detectUnsupportedParts(built);
    expect(reports.map((report) => `${report.ref} @${report.gap_mm.toFixed(1)}mm`)).toEqual([]);
    built.dispose();
  });

  it("炮塔吊环抬高 250mm → 恰好报两个实例（实例级定位）", () => {
    const built = build(model.registry!, raisedEyeLayouts());
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

  it("拆分后的小附件（MG34 枪托）悬空也能报 —— 旧版合并件盲区回归", () => {
    const registry = model.registry!;
    const stock = registry.parts.find((part) => part.id === "tiger.turret.aa_mg_stock")!;
    const mate = stock.mate as { type: "absolute"; position?: [number, number, number] };
    const patched: ModelRegistry = {
      ...registry,
      parts: registry.parts.map((part) =>
        part.id === stock.id
          ? {
              ...part,
              mate: {
                type: "absolute" as const,
                position: [
                  mate.position?.[0] ?? 0,
                  (mate.position?.[1] ?? 0) + 0.3,
                  mate.position?.[2] ?? 0,
                ],
              },
            }
          : part,
      ),
    };
    const built = build(patched);
    built.resetNodes();
    const reports = detectUnsupportedParts(built);
    // 枪托现在是独立小零件；抬高 300mm 后最近机匣仍距 46mm > 20mm 阈值，必须被点名
    // （旧版枪托合并在 aa_mg 里，part 级 AABB 永远「有支撑」，检测器看不到这个浮空细节）
    expect(reports.map((report) => report.ref)).toEqual(["tiger.turret.aa_mg_stock"]);
    expect(reports[0]!.gap_mm).toBeGreaterThan(20);
    built.dispose();
  });

  it('抬高件打 tags: ["fx"] → 支撑检测豁免', () => {
    const registry = model.registry!;
    const eye = registry.parts.find((part) => part.id === "tiger.turret.lifting_eye")!;
    const patched: ModelRegistry = {
      ...registry,
      parts: registry.parts.map((part) =>
        part.id === eye.id ? { ...part, tags: ["fx"] } : part,
      ),
    };
    const built = build(patched, raisedEyeLayouts());
    built.resetNodes();
    expect(detectUnsupportedParts(built)).toEqual([]);
    built.dispose();
  });
});
