import { describe, expect, it } from "vitest";
import { buildModel } from "@/three/parts";
import { findModel } from "@/app/catalog";
import {
  animateTigerLoading,
  TIGER_LOAD_FIRE,
  TIGER_LOAD_HOLD,
  tigerLoadCasePose,
  tigerLoadRoundPose,
  tigerLoadingBlockOffset,
} from "./motion";

// ============================================================================
// 弹药装填链验收
//
// 口径：炮弹从待发架 → 炮闩 → 炮膛 → 击发 → 抛壳是一条连续、单调的时间轴；
// 弹/空筒都是 fx 演示件（不参与穿模），但不能穿地板、不能穿顶甲；
// 击发段必须复用主炮击发的时间函数（击针/后坐/炮口焰同一套节奏）。
// ============================================================================

const model = findModel("tiger");
const build = () =>
  buildModel(model.registry!, {
    builders: model.builders,
    instanceLayouts: model.layouts,
    warnMissingLayout: false,
  });

const BASKET_FLOOR_Y = 1.16;
const ROOF_Y = 1.811;

describe("tiger/装填链", () => {
  it("弹的路径：架上方 → 炮闩前 → 膛底，全程单调向前且不出吊篮", () => {
    const p0 = tigerLoadRoundPose(0);
    expect(p0.position[0]).toBeCloseTo(-1.15, 3);
    expect(p0.tilt).toBe(0);
    expect(p0.visible).toBe(true);

    const xs = [0.6, 1.0, 1.4, 1.8, 2.2, 2.5, 2.55].map((t) => tigerLoadRoundPose(t).position[0]);
    for (let i = 1; i < xs.length; i++) expect(xs[i]!).toBeLessThan(xs[i - 1]!);
    const rammed = tigerLoadRoundPose(2.6);
    expect(rammed.position[0]).toBeCloseTo(-2.47, 3);
    expect(rammed.tilt).toBeCloseTo(Math.PI / 2, 5);

    for (let t = 0; t <= TIGER_LOAD_HOLD + 0.4; t += 0.02) {
      const pose = tigerLoadRoundPose(t);
      expect(pose.position[1]).toBeGreaterThan(BASKET_FLOOR_Y);
      expect(pose.position[1]).toBeLessThan(ROOF_Y);
    }
    expect(tigerLoadRoundPose(3.2).visible).toBe(false);
  });

  it("闩体：推弹前开、关闩后击发，抛壳时再开一次", () => {
    expect(tigerLoadingBlockOffset(0)).toBe(0);
    expect(tigerLoadingBlockOffset(1.8)).toBeLessThan(-0.15);
    expect(tigerLoadingBlockOffset(2.0)).toBeLessThan(-0.15);
    expect(tigerLoadingBlockOffset(2.9)).toBe(0);
    expect(tigerLoadingBlockOffset(TIGER_LOAD_FIRE)).toBe(0);
    expect(tigerLoadingBlockOffset(3.7)).toBeLessThan(-0.15);
    expect(tigerLoadingBlockOffset(4.4)).toBe(0);
  });

  it("抛壳：落地高度停在吊篮地板，不穿地板", () => {
    const landed = tigerLoadCasePose(4.35);
    expect(landed.visible).toBe(true);
    expect(landed.position[1]).toBeCloseTo(1.18, 2);
    expect(landed.position[0]).toBeGreaterThan(-1.95);
    for (let t = 3.5; t <= 5.2; t += 0.02) {
      const pose = tigerLoadCasePose(t);
      expect(pose.position[1]).toBeGreaterThanOrEqual(1.17);
      expect(pose.position[1]).toBeLessThan(ROOF_Y);
    }
    expect(tigerLoadCasePose(3.4).visible).toBe(false);
  });

  it("整机：弹/弹丸同步进膛，击发时炮口焰亮、炮身后坐，终态空筒落在地板上", () => {
    const built = build();
    built.resetNodes();
    try {
      const casePart = built.getPart("tiger.interior.loading_round_case")!;
      const shellPart = built.getPart("tiger.interior.loading_round_shell")!;
      const ejected = built.getPart("tiger.interior.ejected_case")!;
      const block = built.getNode("BreechBlock")!;
      const recoil = built.getNode("GunRecoil")!;
      const flash = built.getPart("tiger.turret.muzzle_flash")!;

      animateTigerLoading(built, 0);
      expect(casePart.object.visible).toBe(true);
      expect(casePart.object.position.x).toBeCloseTo(-1.15, 2);
      expect(shellPart.object.visible).toBe(true);

      animateTigerLoading(built, 2.9);
      expect(casePart.object.position.x).toBeCloseTo(-2.47, 2);
      expect(shellPart.object.position.distanceTo(casePart.object.position)).toBeLessThan(1e-6);
      expect(block.position.y).toBeCloseTo(0, 5);
      expect(ejected.object.visible).toBe(false);

      animateTigerLoading(built, 3.2);
      expect(casePart.object.visible).toBe(false);
      expect(shellPart.object.visible).toBe(false);
      expect(flash.object.visible).toBe(true);
      expect(recoil.position.x).toBeGreaterThan(0.01);

      animateTigerLoading(built, 4.6);
      expect(ejected.object.visible).toBe(true);
      expect(ejected.object.position.y).toBeCloseTo(1.18, 2);
      expect(ejected.object.position.y).toBeGreaterThan(BASKET_FLOOR_Y);
    } finally {
      built.dispose();
    }
  });
});
