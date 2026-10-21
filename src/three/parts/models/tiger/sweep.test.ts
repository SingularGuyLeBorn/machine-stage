import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { buildModel } from "@/three/parts";
import { findModel } from "@/app/catalog";
import { runTigerSweep, TIGER_SWEEP_SCENARIOS } from "./sweep";

// ============================================================================
// 动态扫掠工具验收
//
// 口径：工具必须在「干净的动画」上零误报，在「真实穿模」上能抓到——
// 两条都过，才说明逐帧采样 + 运动候选 + 白名单分层是活的，而不是永远返回空。
// ============================================================================

const model = findModel("tiger");
const scenario = (id: string) => TIGER_SWEEP_SCENARIOS.find((item) => item.id === id)!;
const build = () =>
  buildModel(model.registry!, {
    builders: model.builders,
    instanceLayouts: model.layouts,
    warnMissingLayout: false,
  });

describe("tiger/动态扫掠工具", () => {
  it("悬挂演示逐帧零穿模（不误报）", () => {
    const built = build();
    try {
      const result = runTigerSweep(built, model.registry!.expectedContacts ?? [], {
        scenarios: [scenario("suspension")],
        fps: 6,
      });
      expect(result.samples).toBeGreaterThan(10);
      expect(result.unexcused).toEqual([]);
    } finally {
      built.dispose();
    }
  }, 60000);

  it("把工具架挪进炮塔回转扫掠带 → 扫掠必须抓到这条穿模", () => {
    const built = build();
    try {
      const rack = built.getPart("tiger.interior.tool_rack")!;
      rack.setInstanceMatrix(0, new THREE.Matrix4().makeTranslation(-1.6, 1.5, 0));
      const result = runTigerSweep(built, [], {
        scenarios: [scenario("aiming")],
        fps: 8,
      });
      const hit = result.unexcused.find(
        (report) => report.a.includes("tool_rack") || report.b.includes("tool_rack"),
      );
      expect(hit, "扫掠没有抓到注入的穿模").toBeDefined();
    } finally {
      built.dispose();
    }
  }, 60000);
});
