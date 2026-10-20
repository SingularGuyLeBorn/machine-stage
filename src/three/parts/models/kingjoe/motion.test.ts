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
});
