import { describe, expect, it } from "vitest";
import { buildModel, detectStatic } from "@/three/parts";
import { makeKingJoeRegistry, makeKingJoeLayouts, kingjoeModelBuilders } from "./registry";
import { animateKingJoe, type KingJoeState } from "./motion";

const states: KingJoeState[] = [
  "idle",
  "formation",
  "combining",
  "robot",
  "firing",
  "separation",
  "crippled",
  "damaged",
];
const keyframes = [0, 1, 2, 3, 4.2, 5.5, 7.2, 8.2, 9.5];

describe("kingjoe motion", () => {
  it("每种形态的关键姿态零穿模", () => {
    const registry = makeKingJoeRegistry();
    const model = buildModel(registry, {
      builders: kingjoeModelBuilders,
      instanceLayouts: makeKingJoeLayouts(),
      warnMissingLayout: false,
    });
    for (const state of states) {
      model.resetNodes();
      animateKingJoe(model, 0, state);
      model.root.updateMatrixWorld(true);
      expect(detectStatic(model, { minDepthM: 0.0005 }), `state ${state}`).toEqual([]);
    }
    // 腰部关节关键帧：上腹/胸/头绕 waist 转，腿↔腹接口不动
    model.resetNodes();
    animateKingJoe(model, 0, "robot");
    for (const t of [1.5, 3, 3.05, 4.5, 6.05]) {
      model.resetNodes();
      animateKingJoe(model, t, "robot");
      model.root.updateMatrixWorld(true);
      expect(detectStatic(model, { minDepthM: 0.0005 }), `robot waist t=${t}`).toEqual([]);
    }
    // 合体关键帧（含三段对接、锁环、展开）
    model.resetNodes();
    animateKingJoe(model, 0, "combining");
    for (const t of keyframes) {
      model.resetNodes();
      animateKingJoe(model, t, "combining");
      model.root.updateMatrixWorld(true);
      expect(detectStatic(model, { minDepthM: 0.0005 }), `combining t=${t}`).toEqual([]);
    }
    model.dispose();
  }, 120_000);

  it("战损：装甲板脱落、液压喷溅与战后姿态零穿模", () => {
    const registry = makeKingJoeRegistry();
    const model = buildModel(registry, {
      builders: kingjoeModelBuilders,
      instanceLayouts: makeKingJoeLayouts(),
      warnMissingLayout: false,
    });
    for (const t of [0, 0.3, 0.6, 1, 1.4, 1.8, 2.6]) {
      model.resetNodes();
      animateKingJoe(model, t, "damaged");
      model.root.updateMatrixWorld(true);
      expect(detectStatic(model, { minDepthM: 0.0005 }), `damaged t=${t}`).toEqual([]);
    }
    model.dispose();
  }, 120_000);

  it("编队纵队↔楔形变换与楔形起步合体零穿模", () => {
    const registry = makeKingJoeRegistry();
    const model = buildModel(registry, {
      builders: kingjoeModelBuilders,
      instanceLayouts: makeKingJoeLayouts(),
      warnMissingLayout: false,
    });
    for (const t of [0, 2.8, 5.7, 8.5, 11.4]) {
      model.resetNodes();
      animateKingJoe(model, t, "formation");
      model.root.updateMatrixWorld(true);
      expect(detectStatic(model, { minDepthM: 0.0005 }), `formation morph t=${t}`).toEqual([]);
    }
    // 从楔形编队直接进入合体：快照应接住上一帧形态，而不是跳回纵队
    model.resetNodes();
    animateKingJoe(model, 5.7, "formation");
    for (const t of [0, 0.4, 1, 1.4, 2]) {
      model.resetNodes();
      animateKingJoe(model, t, "combining");
      model.root.updateMatrixWorld(true);
      expect(detectStatic(model, { minDepthM: 0.0005 }), `combining from wedge t=${t}`).toEqual([]);
    }
    model.dispose();
  }, 120_000);
});
