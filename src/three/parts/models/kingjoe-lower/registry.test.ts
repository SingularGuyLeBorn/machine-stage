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
import { makeKingJoeLowerRegistry, makeKingJoeLowerLayouts } from "./registry";
import { kingjoeLowerBuilders } from "./kits";
import {
  animateKingJoeLower,
  lowerFxAt,
  resetKingJoeLowerMotion,
  COMBINE_DURATION,
  SEPARATE_DURATION,
} from "./motion";
import { UPPER_LIFT } from "./constants";

const registry = makeKingJoeLowerRegistry();
const model = buildModel(registry, {
  builders: kingjoeLowerBuilders,
  instanceLayouts: makeKingJoeLowerLayouts(),
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

function instanceBox(partId: string): THREE.Box3 {
  const handle = model.getPart(partId)!;
  const box = new THREE.Box3();
  const matrix = new THREE.Matrix4();
  for (const instance of handle.instances) {
    box.union(new THREE.Box3().copy(handle.geometry.boundingBox!).applyMatrix4(model.instanceMatrix(handle, instance.index, matrix)));
  }
  return box;
}

describe("kingjoelower 髋缝两体拆分", () => {
  it("下半身=King Legs 腿体，上半身=骨盆以上，三角形总数不丢", () => {
    expect(validateRegistry(registry).filter((issue) => issue.level === "error")).toEqual([]);
    expect(model.parts.length).toBe(5);
    const lower = model.getPart("kingjoelower.lower.body")!;
    const upper = model.getPart("kingjoelower.upper.body")!;
    expect(lower.def.materialGroups?.length).toBe(3);
    expect(lower.geometry.groups.length).toBe(3);
    expect(upper.def.materialGroups?.length).toBe(12);
    expect(upper.geometry.groups.length).toBe(12);
    expect(model.getPart("kingjoelower.lower.hip_tenon")!.instances.length).toBe(4);
    expect(model.getPart("kingjoelower.upper.hip_socket")!.instances.length).toBe(4);
    expect(skinTriangles()).toBe(15248);
  });

  it("合体态外形与整机一致，髋缝/榫卯无未豁免穿模、无悬空", () => {
    resetKingJoeLowerMotion(model);
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

  it("分离终态：下半身站地不动，上半身提起 1.3m，楔榫完全退出榫槽", () => {
    resetKingJoeLowerMotion(model);
    model.resetNodes();
    animateKingJoeLower(model, 0, "separated");
    expect(model.getNode("upper")!.position.y).toBeCloseTo(UPPER_LIFT, 5);
    expect(model.getNode("lower")!.position.y).toBe(0);
    model.root.updateMatrixWorld(true);

    const lowerBox = new THREE.Box3().setFromObject(model.getPart("kingjoelower.lower.body")!.object);
    const tenonBox = instanceBox("kingjoelower.lower.hip_tenon");
    const socketBox = instanceBox("kingjoelower.upper.hip_socket");
    expect(lowerBox.min.y).toBeLessThan(0.01);
    expect(lowerBox.max.y).toBeLessThan(3.7);
    expect(tenonBox.min.y).toBeGreaterThan(3.5);
    expect(tenonBox.max.y).toBeLessThan(socketBox.min.y - 1.0);
    expect(activeReports()).toEqual([]);
  });

  it("分离/合体的电弧在靠近段出现，锁死闪光在合体末端", () => {
    expect(lowerFxAt("idle", 0, 0)).toEqual({ arc: 0, flash: 0 });
    expect(lowerFxAt("separated", UPPER_LIFT, 0)).toEqual({ arc: 0, flash: 0 });
    expect(lowerFxAt("separating", 0.05, 0.2).arc).toBeGreaterThan(0.8);
    expect(lowerFxAt("separating", 1.0, 1.4).arc).toBe(0);
    expect(lowerFxAt("combining", 0.3, 1.2).arc).toBeGreaterThan(0.2);
    expect(lowerFxAt("combining", 0.75, 1.1).arc).toBeGreaterThan(0.05);
    expect(lowerFxAt("combining", 0, 1.55).arc).toBeGreaterThan(0.5);
    expect(lowerFxAt("combining", 0, 1.55).flash).toBeCloseTo(1, 5);
  });

  it("分离全程与合体全程零未豁免穿模", () => {
    const check = (state: "separating" | "combining", duration: number) => {
      resetKingJoeLowerMotion(model);
      model.resetNodes();
      if (state === "combining") {
        animateKingJoeLower(model, 0, "separated");
        model.root.updateMatrixWorld(true);
      }
      const reports = detectSweep(model, {
        duration,
        fps: 30,
        applyPose: (t) => {
          model.resetNodes();
          animateKingJoeLower(model, t, state);
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
