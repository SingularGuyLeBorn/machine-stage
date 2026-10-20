import { describe, expect, it } from "vitest";
import { buildModel, detectStatic } from "@/three/parts";
import { findModel } from "@/app/catalog";
import { applyTigerLidPose, resetTigerLidPose } from "./lids";

// ============================================================================
// 盖板开启全程不得扫到邻近件：装填手潜望镜随盖板转，环形枪座/近防管/顶甲板
// 在 0° → 85° 的每一帧都与盖板保持间隙。
// ============================================================================

const model = findModel("tiger");
const LID_PARTS = [
  "tiger.hull.hatch_lid",
  "tiger.turret.loader_hatch",
  "tiger.turret.loader_periscope",
  "tiger.turret.cupola_hatch",
  "tiger.hull.fuel_cap_lid",
];
const NEARBY = new Set([
  ...LID_PARTS,
  "tiger.turret.shell",
  "tiger.turret.cupola",
  "tiger.turret.close_defense",
  "tiger.turret.aa_ring_mount",
  "tiger.turret.aa_mg_body",
  "tiger.turret.aa_mg_barrel",
  "tiger.hull.fighting_roof",
  "tiger.hull.fuel_cap",
]);

describe("tiger/盖板开启间隙", () => {
  it("4 个舱盖 + 2 个加油口盖全开过程中零干涉", () => {
    const built = buildModel(model.registry!, {
      builders: model.builders,
      instanceLayouts: model.layouts,
      warnMissingLayout: false,
    });
    resetTigerLidPose();
    const overrides = {
      "tiger.turret.loader_hatch#0": true,
      "tiger.turret.cupola_hatch#0": true,
      "tiger.hull.fuel_cap_lid#0": true,
      "tiger.hull.fuel_cap_lid#1": true,
    };
    for (let step = 0; step < 50; step++) {
      applyTigerLidPose(built, "idle", overrides, 0.02);
      built.root.updateMatrixWorld(true);
      const reports = detectStatic(built, { filter: (handle) => NEARBY.has(handle.partId) });
      expect(
        reports
          .filter((report) => LID_PARTS.some((id) => report.a.includes(id) || report.b.includes(id)))
          .map((report) => `${report.a} ↔ ${report.b} @ ${report.depth_mm}mm`),
        `step ${step}`,
      ).toEqual([]);
    }
  }, 30000);
});
