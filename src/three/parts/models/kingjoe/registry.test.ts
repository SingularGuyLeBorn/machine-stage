import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  buildModel,
  detectStatic,
  detectUnsupportedParts,
  partitionExpectedContacts,
  validateRegistry,
} from "@/three/parts";
import { makeKingJoeRegistry, makeKingJoeLayouts, kingjoeModelBuilders } from "./registry";

const registry = makeKingJoeRegistry();
const model = buildModel(registry, {
  builders: kingjoeModelBuilders,
  instanceLayouts: makeKingJoeLayouts(),
  warnMissingLayout: false,
});

describe("kingjoe registry", () => {
  it("四体注册表通过契约校验", () => {
    const issues = validateRegistry(registry);
    expect(issues.filter((issue) => issue.level === "error")).toEqual([]);
    expect(registry.assemblies.map((a) => a.id).sort()).toEqual(["chest", "legs", "ship", "stomach"]);
    expect(registry.parts.length).toBeGreaterThanOrEqual(140);
    expect(new Set(registry.parts.map((p) => p.id)).size).toBe(registry.parts.length);
  });

  it("四体都有真实皮部位件与机构件", () => {
    const counts = new Map<string, number>();
    for (const part of registry.parts) counts.set(part.assembly, (counts.get(part.assembly) ?? 0) + 1);
    expect(counts.get("legs")).toBeGreaterThan(30);
    expect(counts.get("chest")).toBeGreaterThan(40);
    expect(counts.get("stomach")).toBeGreaterThan(15);
    expect(counts.get("ship")).toBeGreaterThan(8);

    const ids = new Set(registry.parts.map((part) => part.id));
    for (const id of [
      "kingjoe.legs.skin_thigh_l_silver",
      "kingjoe.legs.skin_shin_l_silver",
      "kingjoe.legs.skin_foot_l_silver",
      "kingjoe.legs.skin_hip_skirt_l_silver",
      "kingjoe.stomach.skin_pelvis_silver_dark",
      "kingjoe.stomach.skin_abdomen_silver",
      "kingjoe.chest.skin_chest_silver",
      "kingjoe.chest.skin_upperarm_l_dark",
      "kingjoe.chest.skin_forearm_l_silver",
      "kingjoe.chest.skin_hand_l_silver",
      "kingjoe.chest.skin_finger_l_0_silver_dark",
      "kingjoe.ship.skin_head_silver",
    ]) {
      expect(ids.has(id), id).toBe(true);
    }
  });

  it("彩虹胸 / 额头发射体 / 对接销环 / 怪光线内构零件存在", () => {
    const ids = new Set(registry.parts.map((part) => part.id));
    for (const id of [
      "kingjoe.chest.rainbow_frame",
      "kingjoe.chest.rainbow_back",
      "kingjoe.chest.rainbow_band_0",
      "kingjoe.chest.rainbow_louver_0",
      "kingjoe.chest.rainbow_spine",
      "kingjoe.ship.forehead_emitter",
      "kingjoe.legs.dock_stomach_legs_base",
      "kingjoe.chest.dock_chest_stomach_lock_ring",
      "kingjoe.ship.dock_neck_guide_pin",
      "kingjoe.chest.emitter_cooling",
      "kingjoe.chest.emitter_mount",
      "kingjoe.chest.emitter_capacitor_a",
      "kingjoe.chest.emitter_capacitor_b",
    ]) {
      expect(ids.has(id), id).toBe(true);
    }
  });

  it("外形尺寸 = 真实网格 + 三道 120mm 对接缝", () => {
    model.resetNodes();
    model.syncInstances();
    model.root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model.root);
    const size = box.getSize(new THREE.Vector3());
    expect(size.x).toBeCloseTo(3.683, 2);
    expect(size.y).toBeCloseTo(6.978, 2);
    expect(size.z).toBeCloseTo(2.086, 2);
    expect(box.min.y).toBeGreaterThanOrEqual(-0.005);
  });

  it("装配态机构-皮零穿插；源壳互嵌有白名单且不豁免机构", () => {
    model.resetNodes();
    model.syncInstances();
    model.root.updateMatrixWorld(true);
    const reports = detectStatic(model, { minDepthM: 0.0005 });
    const split = partitionExpectedContacts(reports, registry.expectedContacts ?? []);
    expect(split.active).toEqual([]);
    expect(split.expected.length).toBeGreaterThan(50);
    // 白名单只允许皮-皮 / 对接件-对接件 / 皮-对接件；不得出现「皮-发射内构」以外的任意机构。
    for (const hit of split.expected) {
      const a = hit.report.a;
      const b = hit.report.b;
      const allowsHiddenMechanism = /emitter_/.test(a) || /emitter_/.test(b);
      if (allowsHiddenMechanism) continue;
      const bothSkin = a.includes(".skin_") && b.includes(".skin_");
      const bothDock = a.includes(".dock_") && b.includes(".dock_");
      const skinDock =
        (a.includes(".skin_") && b.includes(".dock_")) || (b.includes(".skin_") && a.includes(".dock_"));
      const bothDetail = a.includes(".rainbow_") && b.includes(".rainbow_");
      expect(bothSkin || bothDock || skinDock || bothDetail, `${a} <-> ${b}`).toBe(true);
    }
  });

  it("装配态零悬空", () => {
    model.resetNodes();
    model.syncInstances();
    model.root.updateMatrixWorld(true);
    expect(detectUnsupportedParts(model)).toEqual([]);
  });
});
