import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { buildModel, detectStatic, detectUnsupportedParts, validateRegistry } from "@/three/parts";
import { makeKingJoeWholeRegistry } from "./registry";
import { kingjoeWholeBuilders } from "./kits";

const registry = makeKingJoeWholeRegistry();
const model = buildModel(registry, { builders: kingjoeWholeBuilders, warnMissingLayout: false });

describe("kingjoewhole 整机单件（内部实心）", () => {
  it("整个角色只有一个 partId，表面 + 内核共用一个几何", () => {
    expect(validateRegistry(registry).filter((issue) => issue.level === "error")).toEqual([]);
    expect(registry.parts.length).toBe(1);
    expect(model.parts.length).toBe(1);
    const handle = model.parts[0]!;
    expect(handle.partId).toBe("kingjoewhole.whole.body");
    expect(handle.def.materialGroups?.length).toBe(registry.constants.MATERIAL_GROUPS);
    expect(handle.geometry.groups.length).toBe(registry.constants.MATERIAL_GROUPS);
    expect(handle.geometry.groups.at(-1)!.materialIndex).toBe(Number(registry.constants.MATERIAL_GROUPS) - 1);
    expect(handle.def.materialGroups?.at(-1)).toBe("kjr_core");
    expect(handle.geometry.index!.count / 3).toBe(registry.constants.TRIANGLES);
    expect(registry.constants.SHELL_TRIANGLES).toBe(15248);
    expect(registry.constants.CORE_TRIANGLES).toBeGreaterThan(30000);
    expect(registry.constants.CORE_BOUNDARY_EDGES).toBe(0);
    expect(registry.constants.CORE_VOLUME).toBeGreaterThan(9);
  });

  it("合体外形与真实网格一致，内核藏在原皮内，单件无穿模/无悬空误报", () => {
    model.resetNodes();
    model.syncInstances();
    model.root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model.root);
    const size = box.getSize(new THREE.Vector3());
    expect(size.x).toBeCloseTo(3.683, 2);
    expect(size.y).toBeCloseTo(6.618, 2);
    expect(size.z).toBeCloseTo(2.086, 2);
    expect(box.min.y).toBeGreaterThanOrEqual(-0.005);
    expect(detectStatic(model, { minDepthM: 0.0005 })).toEqual([]);
    expect(detectUnsupportedParts(model)).toEqual([]);
  });
});
