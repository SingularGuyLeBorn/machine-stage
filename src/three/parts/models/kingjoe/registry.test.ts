import { describe, expect, it } from "vitest";
import { buildModel, detectStatic, detectUnsupportedParts, validateRegistry } from "@/three/parts";
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
    expect(registry.parts.length).toBeGreaterThanOrEqual(450);
    expect(new Set(registry.parts.map((p) => p.id)).size).toBe(registry.parts.length);
  });

  it("四体都有足量零件级定义（不是总成级）", () => {
    const counts = new Map<string, number>();
    for (const part of registry.parts) counts.set(part.assembly, (counts.get(part.assembly) ?? 0) + 1);
    expect(counts.get("legs")).toBeGreaterThan(100);
    expect(counts.get("chest")).toBeGreaterThan(100);
    expect(counts.get("stomach")).toBeGreaterThan(40);
    expect(counts.get("ship")).toBeGreaterThan(40);
  });

  it("Ship 舵面 / 控制板 / 线束零件存在", () => {
    const ids = new Set(registry.parts.map((part) => part.id));
    for (const id of [
      "kingjoe.ship.ship_rudder_h0",
      "kingjoe.ship.ship_rudder_h1",
      "kingjoe.ship.ship_rudder_v0",
      "kingjoe.ship.ship_rudder_v1",
      "kingjoe.ship.ship_control_panel",
      "kingjoe.ship.ship_harness_0",
      "kingjoe.ship.ship_harness_1",
    ]) {
      expect(ids.has(id)).toBe(true);
    }
  });

  it("双肩第 4 对接口零件存在", () => {
    const ids = new Set(registry.parts.map((part) => part.id));
    expect(ids.has("kingjoe.chest.arm_dock_guide")).toBe(true);
    expect(ids.has("kingjoe.chest.arm_dock_face_seal")).toBe(true);
    expect(ids.has("kingjoe.chest.arm_dock_sensor")).toBe(true);
  });

  it("战损外挂装甲板逐件存在", () => {
    const ids = new Set(registry.parts.map((part) => part.id));
    expect(ids.has("kingjoe.legs.thigh_applique")).toBe(true);
  });

  it("足底四角减震垫逐件存在", () => {
    const ids = new Set(registry.parts.map((part) => part.id));
    for (const side of ["l", "r"]) {
      for (const corner of ["front_outer", "front_inner", "rear_outer", "rear_inner"]) {
        expect(ids.has(`kingjoe.legs.foot_damper_${corner}_${side}`)).toBe(true);
      }
    }
  });

  it("装配态零穿模", () => {
    model.resetNodes();
    model.syncInstances();
    model.root.updateMatrixWorld(true);
    const reports = detectStatic(model, { minDepthM: 0.0005 });
    expect(reports).toEqual([]);
  });

  it("装配态零悬空", () => {
    model.resetNodes();
    model.syncInstances();
    model.root.updateMatrixWorld(true);
    expect(detectUnsupportedParts(model)).toEqual([]);
  });
});
