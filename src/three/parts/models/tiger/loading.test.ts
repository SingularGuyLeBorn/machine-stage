import { describe, expect, it } from "vitest";
import { buildModel, detectStatic } from "@/three/parts";
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
const LOADING_IDS = [
  "tiger.interior.loading_round_case",
  "tiger.interior.loading_round_shell",
  "tiger.interior.ejected_case",
];

describe("tiger/装填链", () => {
  it("弹的路径：架上方 → 炮闩后方 → 沿膛线推入，横置不竖转", () => {
    const p0 = tigerLoadRoundPose(0);
    expect(p0.position[0]).toBeCloseTo(-1.15, 3);
    expect(p0.position[1]).toBeCloseTo(1.74, 3);
    expect(p0.tilt).toBeCloseTo(Math.PI / 2, 5);
    expect(p0.visible).toBe(true);

    // 搬运 + 对位 + 推弹：x 全程单调向前（-X）
    const xs = [0.6, 0.9, 1.2, 1.5, 1.8, 2.0, 2.2, 2.45].map(
      (t) => tigerLoadRoundPose(t).position[0],
    );
    for (let i = 1; i < xs.length; i++) expect(xs[i]!).toBeLessThanOrEqual(xs[i - 1]! + 1e-6);
    const rammed = tigerLoadRoundPose(2.45);
    expect(rammed.position[0]).toBeCloseTo(-2.43, 3);
    expect(rammed.position[2]).toBeCloseTo(0, 5);

    // 全程不出吊篮：取整颗弹的上下缘（半径 0.055）
    for (let t = 0; t <= TIGER_LOAD_HOLD + 0.4; t += 0.02) {
      const pose = tigerLoadRoundPose(t);
      expect(pose.position[1] - 0.055).toBeGreaterThan(BASKET_FLOOR_Y);
      expect(pose.position[1] + 0.055).toBeLessThan(ROOF_Y - 0.004);
    }
    expect(tigerLoadRoundPose(2.95).visible).toBe(false);
  });

  it("先开闩才有通道，关闩后才击发，抛壳时再开一次", () => {
    expect(tigerLoadingBlockOffset(0)).toBe(0);
    expect(tigerLoadingBlockOffset(1.0)).toBe(0);
    expect(tigerLoadingBlockOffset(1.6)).toBeLessThan(-0.15);
    expect(tigerLoadingBlockOffset(2.2)).toBeLessThan(-0.15);
    expect(tigerLoadingBlockOffset(2.9)).toBe(0);
    expect(tigerLoadingBlockOffset(TIGER_LOAD_FIRE)).toBe(0);
    expect(tigerLoadingBlockOffset(3.9)).toBeLessThan(-0.15);
    expect(tigerLoadingBlockOffset(4.5)).toBe(0);
    // 推弹开始（1.85s）必须晚于闩体全开（1.5s）
    expect(tigerLoadingBlockOffset(1.85)).toBeLessThan(-0.15);
  });

  it("抛壳：落地高度停在吊篮地板，不穿地板", () => {
    const landed = tigerLoadCasePose(4.5);
    expect(landed.visible).toBe(true);
    expect(landed.position[1]).toBeCloseTo(1.22, 2);
    for (let t = 3.7; t <= 5.2; t += 0.02) {
      const pose = tigerLoadCasePose(t);
      expect(pose.position[1]).toBeGreaterThanOrEqual(1.17);
      expect(pose.position[1]).toBeLessThan(ROOF_Y);
    }
    expect(tigerLoadCasePose(3.6).visible).toBe(false);
  });

  it("整机：关闩时弹在闩后，开闩后推入膛；击发时炮口焰亮、炮身后坐", () => {
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

      animateTigerLoading(built, 2.45);
      expect(casePart.object.position.x).toBeCloseTo(-2.43, 2);
      expect(shellPart.object.position.distanceTo(casePart.object.position)).toBeLessThan(1e-6);
      expect(block.position.y).toBeCloseTo(-0.16, 3);
      expect(ejected.object.visible).toBe(false);

      animateTigerLoading(built, 3.1);
      expect(casePart.object.visible).toBe(false);
      expect(shellPart.object.visible).toBe(false);
      expect(flash.object.visible).toBe(true);
      expect(recoil.position.x).toBeGreaterThan(0.01);

      animateTigerLoading(built, 4.7);
      expect(ejected.object.visible).toBe(true);
      expect(ejected.object.position.y).toBeCloseTo(1.22, 2);
    } finally {
      built.dispose();
    }
  });

  it("装填全程扫掠：弹/弹丸/空筒与炮闩、炮管、炮塔内壁零穿模", () => {
    // fx 零件默认不参与检测：克隆注册表把演示件的 fx 标签摘掉，当真实零件扫
    const registry = model.registry!;
    const plain = {
      ...registry,
      parts: registry.parts.map((part) =>
        LOADING_IDS.includes(part.id) ? { ...part, tags: undefined } : part,
      ),
    };
    const built = buildModel(plain, {
      builders: model.builders,
      instanceLayouts: model.layouts,
      warnMissingLayout: false,
    });
    const failures: string[] = [];
    try {
      for (let step = 0; step <= 65; step++) {
        const t = step * 0.08;
        built.resetNodes();
        animateTigerLoading(built, t);
        built.syncInstances();
        built.root.updateMatrixWorld(true);
        const reports = detectStatic(built, {
          filter: (handle) => handle.assembly === "turret" || handle.assembly === "interior",
        });
        for (const report of reports) {
          if (LOADING_IDS.some((id) => report.a.startsWith(id) || report.b.startsWith(id))) {
            failures.push(`t=${t.toFixed(2)}s ${report.a} ↔ ${report.b} @${report.depth_mm}mm`);
          }
        }
      }
    } finally {
      built.dispose();
    }
    expect(failures.slice(0, 12)).toEqual([]);
  }, 120000);
});
