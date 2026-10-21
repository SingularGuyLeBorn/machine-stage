import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  buildModel,
  detectStatic,
  detectSweep,
  detectUnsupportedParts,
  partitionExpectedContacts,
  validateRegistry,
} from "@/three/parts";
import { makeKingJoeThreeLayouts, makeKingJoeThreeRegistry } from "./registry";
import { kingjoeThreeBuilders } from "./kits";
import {
  animateKingJoeThree,
  resetKingJoeThreeMotion,
  threeFxAt,
  COMBINE_DURATION,
  SEPARATE_DURATION,
} from "./motion";
import { HEAD_FORWARD, HEAD_LIFT, TORSO_LIFT } from "./constants";

const registry = makeKingJoeThreeRegistry();
const model = buildModel(registry, {
  builders: kingjoeThreeBuilders,
  instanceLayouts: makeKingJoeThreeLayouts(),
  warnMissingLayout: false,
});

function activeReports(): ReturnType<typeof partitionExpectedContacts>["active"] {
  const reports = detectStatic(model, { minDepthM: 0.0005 });
  return partitionExpectedContacts(reports, registry.expectedContacts ?? []).active;
}

function skinTriangles(): number {
  return model.parts
    .filter((handle) => handle.def.tags?.includes("skin"))
    .reduce((sum, handle) => {
      const count = handle.geometry.index ? handle.geometry.index.count : handle.geometry.getAttribute("position").count;
      return sum + (count / 3) * handle.instances.length;
    }, 0);
}

describe("kingjoethree 三体拆分", () => {
  it("三组皮肤：腿+髋 / 腹+胸 / 头+双手，三角形不丢", () => {
    expect(validateRegistry(registry).filter((issue) => issue.level === "error")).toEqual([]);
    expect(model.parts.length).toBe(6);
    const lower = model.getPart("kingjoethree.lower.body")!;
    const torso = model.getPart("kingjoethree.torso.body")!;
    const headhands = model.getPart("kingjoethree.headhands.body")!;
    expect(lower.def.materialGroups?.length).toBe(4);
    expect(torso.def.materialGroups?.length).toBe(10);
    expect(headhands.def.materialGroups?.length).toBe(6);
    expect(model.getPart("kingjoethree.lower.waist_tenon")!.instances.length).toBe(4);
    expect(model.getPart("kingjoethree.torso.waist_socket")!.instances.length).toBe(4);
    expect(skinTriangles()).toBe(15248);
  });

  it("合体态外形与整机一致，三体接缝/腰缝榫卯无未豁免穿模、无悬空", () => {
    resetKingJoeThreeMotion(model);
    model.resetNodes();
    model.root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model.root);
    const size = box.getSize(new THREE.Vector3());
    expect(size.x).toBeCloseTo(3.683, 2);
    expect(size.y).toBeCloseTo(6.618, 2);
    expect(size.z).toBeCloseTo(2.086, 2);
    expect(box.min.y).toBeGreaterThanOrEqual(-0.005);
    expect(activeReports()).toEqual([]);
    expect(detectUnsupportedParts(model)).toEqual([]);
  });

  it("分离终态：下半身站地，躯干 0.6m / 头手 1.6m+前移 0.7m", () => {
    resetKingJoeThreeMotion(model);
    model.resetNodes();
    animateKingJoeThree(model, 0, "separated");
    expect(model.getNode("lower")!.position.y).toBe(0);
    expect(model.getNode("torso")!.position.y).toBeCloseTo(TORSO_LIFT, 5);
    expect(model.getNode("headhands")!.position.y).toBeCloseTo(HEAD_LIFT, 5);
    expect(model.getNode("headhands")!.position.z).toBeCloseTo(HEAD_FORWARD, 5);
    model.root.updateMatrixWorld(true);
    expect(activeReports()).toEqual([]);
  });

  it("分离/合体电弧：腰缝与颈根/双腕在靠近段出现，锁死闪光在合体末端", () => {
    expect(threeFxAt("idle", 0, 0, 0, 0)).toEqual({ waist: 0, head: 0, flash: 0 });
    expect(threeFxAt("separated", TORSO_LIFT, HEAD_LIFT, HEAD_FORWARD, 0)).toEqual({ waist: 0, head: 0, flash: 0 });
    expect(threeFxAt("separating", 0.02, 0.05, 0.1, 0.2).waist).toBeGreaterThan(0.8);
    expect(threeFxAt("separating", 0.02, 0.05, 0.1, 0.2).head).toBeGreaterThan(0.8);
    expect(threeFxAt("separating", TORSO_LIFT, HEAD_LIFT * 0.7, HEAD_FORWARD, 1.4).waist).toBe(0);
    expect(threeFxAt("combining", 0, 0, 0, 1.85).flash).toBeCloseTo(1, 5);
  });

  it("三体分离全程与合体全程零未豁免穿模", () => {
    const check = (state: "separating" | "combining", duration: number) => {
      resetKingJoeThreeMotion(model);
      model.resetNodes();
      if (state === "combining") {
        animateKingJoeThree(model, 0, "separated");
        model.root.updateMatrixWorld(true);
      }
      const reports = detectSweep(model, {
        duration,
        fps: 30,
        applyPose: (t) => {
          model.resetNodes();
          animateKingJoeThree(model, t, state);
        },
      });
      const active = partitionExpectedContacts(reports, registry.expectedContacts ?? []).active;
      expect(active, state).toEqual([]);
    };
    check("separating", SEPARATE_DURATION + 0.2);
    check("combining", COMBINE_DURATION + 0.2);
    model.resetNodes();
    model.root.updateMatrixWorld(true);
  });
});
