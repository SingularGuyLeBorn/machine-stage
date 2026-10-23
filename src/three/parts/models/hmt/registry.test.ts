import { describe, expect, it } from "vitest";
import { Box3, Raycaster, Vector3 } from "three";
import { buildModel } from "../../assembler/assembler";
import { validateRegistry } from "../../registry/validate";
import { detectStatic } from "../../solver/detect";
import { detectFloatingIslands, detectUnsupportedParts } from "../../solver/support";
import { applyExplode, clearExplode, explodeOffsetOf } from "@/app/three/pose";
import { makeHmtRegistry } from "./registry";
import { hmtBuilders } from "./geometry";

const build = () => buildModel(makeHmtRegistry(), { builders: hmtBuilders });

describe("HMT 参考重建", () => {
  it("注册表合法，五层装配均无穿模，不使用豁免", () => {
    const registry = makeHmtRegistry();
    expect(validateRegistry(registry)).toEqual([]);
    expect(registry.expectedContacts ?? []).toEqual([]);
    const model = build();
    try {
      for (const layer of [1, 2, 3, 4, 5]) {
        const reports = detectStatic(model, { filter: (p) => p.buildLayer <= layer });
        expect(
          reports.map((r) => `${r.a} ↔ ${r.b}`),
          `L${layer}`,
        ).toEqual([]);
      }
      expect(detectUnsupportedParts(model)).toEqual([]);
      expect(detectFloatingIslands(model).components).toBe(1);
    } finally {
      model.dispose();
    }
  });

  it("胸甲开窗是通孔，旁边护板仍有实体", () => {
    const model = build();
    try {
      const plate = model.getPart("hmt.chest.pectoral_l")!;
      model.root.updateMatrixWorld(true);
      const ray = new Raycaster(new Vector3(0.143, 1.918, 0.5), new Vector3(0, 0, -1));
      expect(ray.intersectObject(plate.object, false)).toHaveLength(0);
      ray.ray.origin.set(0.235, 1.88, 0.5);
      expect(ray.intersectObject(plate.object, false).length).toBeGreaterThan(0);
    } finally {
      model.dispose();
    }
  });

  it("展示高度同步缩放几何与装配，不只修改读数", () => {
    const model = build();
    const registry = makeHmtRegistry();
    registry.constants.HEIGHT = 1.8;
    const smaller = buildModel(registry, { builders: hmtBuilders });
    try {
      const a = new Box3().setFromObject(model.root).getSize(new Vector3());
      const b = new Box3().setFromObject(smaller.root).getSize(new Vector3());
      expect(b.x / a.x).toBeCloseTo(0.75, 3);
      expect(b.y / a.y).toBeCloseTo(0.75, 3);
      expect(b.z / a.z).toBeCloseTo(0.75, 3);
    } finally {
      model.dispose();
      smaller.dispose();
    }
  });

  it("双侧护板向外镜像拆开，反复拆装恢复原位", () => {
    const model = build();
    try {
      const left = model.getPart("hmt.arms.fore_side_l")!;
      const right = model.getPart("hmt.arms.fore_side_r")!;
      const l = explodeOffsetOf(model, left, 1).clone();
      const r = explodeOffsetOf(model, right, 1).clone();
      expect(l.x).toBeGreaterThan(0);
      expect(r.x).toBeCloseTo(-l.x);
      const before = model.parts.map((p) => p.object.matrix.clone());
      for (let i = 0; i < 3; i++) {
        applyExplode(model, 1);
        clearExplode(model);
      }
      model.parts.forEach((part, i) => expect(part.object.matrix.equals(before[i])).toBe(true));
    } finally {
      model.dispose();
    }
  });
});
