import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { buildModel, detectStatic } from "@/three/parts";
import { findModel } from "@/app/catalog";
import { animateTigerAim, animateTigerFiring, animateTigerHit, animateTigerMg } from "../motion";

// ============================================================================
// 火力/受击交互验收（P3 打磨）
// 1. 主炮后坐要「有劲」：车体下沉 >15mm、点头 >0.5°（不只是炮管缩一下）。
// 2. MG34 连射：枪管短后坐 / 枪口上跳 / 供弹链步进 / 弹壳可见。
// 3. MG 连射 8 个时间点：炮塔子集（fx 除外）零干涉。
// 4. 受击分级：重击的车体响应至少是轻击的 5 倍，且重击下沉 >10mm。
// ============================================================================

const model = findModel("tiger");
const build = () =>
  buildModel(model.registry!, {
    builders: model.builders,
    instanceLayouts: model.layouts,
    warnMissingLayout: false,
  });

describe("tiger/P3 火力与受击", () => {
  it("主炮后坐传全车：下沉 >15mm、点头 >0.5°", () => {
    const built = build();
    built.resetNodes();
    animateTigerFiring(built, 1.3);
    expect(built.root.position.y).toBeLessThan(-0.015);
    expect(Math.abs(built.root.rotation.z)).toBeGreaterThan(0.01);
    built.dispose();
  });

  it("MG34 连射：枪管短后坐、枪口上跳、链步进、弹壳弹出", () => {
    const built = build();
    built.resetNodes();
    animateTigerMg(built, 0.27);
    built.syncInstances();
    const barrel = built.getNode("AaBarrel")!;
    const gun = built.getNode("AaGun")!;
    const feed = built.getNode("AaFeed")!;
    const restFeed = built.nodeRest.get("AaFeed")!;
    const flash = built.getPart("tiger.turret.aa_mg_flash")!;
    const cases = built.getPart("tiger.turret.aa_mg_case")!;

    expect(barrel.position.x).toBeGreaterThan(0.003);
    expect(gun.rotation.z).toBeLessThan(-THREE.MathUtils.degToRad(10) - 0.002);
    expect(feed.position.distanceTo(new THREE.Vector3().setFromMatrixPosition(restFeed))).toBeGreaterThan(
      0.001,
    );
    expect(flash.object.visible).toBe(true);
    expect(cases.object.visible).toBe(true);
    const matrix = new THREE.Matrix4();
    (cases.object as THREE.InstancedMesh).getMatrixAt(0, matrix);
    expect(matrix.elements[13]).toBeGreaterThan(2);
    built.dispose();
  });

  it("MG34 连射 8 个时间点：炮塔/内饰（fx 除外）零干涉", () => {
    const built = build();
    const samples = [0.25, 0.27, 0.3, 0.4, 0.6, 0.9, 1.2, 1.6];
    const failures: string[] = [];
    for (const t of samples) {
      built.resetNodes();
      animateTigerMg(built, t);
      built.root.updateMatrixWorld(true);
      built.syncInstances();
      const reports = detectStatic(built, {
        filter: (handle) =>
          (handle.assembly === "turret" || handle.assembly === "interior") &&
          !handle.def.tags?.includes("fx"),
      });
      for (const report of reports) {
        failures.push(`t=${t}s ${report.a} ↔ ${report.b} @${report.depth_mm}mm [${report.form}]`);
      }
    }
    expect(failures).toEqual([]);
    built.dispose();
  }, 180_000);

  it("炮塔回转 ±36° + 炮管 ±3.4°：9 个时间点零干涉", () => {
    const built = build();
    const samples = [0, 0.7, 1.4, 2.1, 2.8, 3.5, 4.2, 5.6, 7.2];
    const failures: string[] = [];
    for (const t of samples) {
      built.resetNodes();
      animateTigerAim(built, t);
      built.root.updateMatrixWorld(true);
      built.syncInstances();
      const reports = detectStatic(built, {
        filter: (handle) =>
          handle.assembly === "turret" || handle.assembly === "interior" || handle.assembly === "hull",
      });
      for (const report of reports) {
        failures.push(`t=${t}s ${report.a} ↔ ${report.b} @${report.depth_mm}mm [${report.form}]`);
      }
    }
    expect(failures).toEqual([]);
    built.dispose();
  }, 180_000);

  it("受击分级：重击下沉 >10mm，响应至少是轻击的 5 倍", () => {
    const built = build();
    built.resetNodes();
    animateTigerHit(built, 0.15, "light");
    const lightHeave = Math.abs(built.root.position.y);
    const lightPitch = Math.abs(built.root.rotation.z);
    built.resetNodes();
    animateTigerHit(built, 0.15, "heavy");
    const heavyHeave = Math.abs(built.root.position.y);
    const heavyPitch = Math.abs(built.root.rotation.z);
    expect(heavyHeave).toBeGreaterThan(0.01);
    expect(heavyHeave).toBeGreaterThan(lightHeave * 5);
    expect(heavyPitch).toBeGreaterThan(0.01);
    expect(heavyPitch).toBeGreaterThan(lightPitch * 5);
    built.dispose();
  });
});
