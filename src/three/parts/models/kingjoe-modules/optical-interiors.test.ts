import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { buildModel, validateRegistry } from "@/three/parts";
import { makeKingJoeModuleRegistry, kingjoeModuleBuilders, poseKingJoeModules } from "./registry";
import { opticalParts, opticalVisorIds, updateOpticalInteriors } from "./optical-interiors";
import { chestWindowProfile } from "./chest-windows";
import { visorProfile } from "./visor";
import { pedanPower, QUIET_ACTIVITY } from "./machinery";
import { applyInternalVisibility } from "@/app/three/internal";

describe("贴合发光外观的分件光学内构", () => {
  it("轮廓来自现有窗面，所有零件内退、可在仅内部模式显示并跟随所属分体", () => {
    const registry = makeKingJoeModuleRegistry();
    expect(validateRegistry(registry).filter((e) => e.level === "error")).toEqual([]);
    const model = buildModel(registry, { builders: kingjoeModuleBuilders });
    try {
      expect(opticalParts).toHaveLength(140);
      expect(opticalVisorIds).toHaveLength(48);
      expect(opticalParts.filter((p) => p.id.includes("_guide_"))).toHaveLength(16);
      applyInternalVisibility("kingjoemodules", model, false, true);
      for (const definition of opticalParts) {
        const part = model.getPart(definition.id)!;
        expect(part.object.layers.isEnabled(0)).toBe(true);
        expect(part.def.node).toBe(`Module_${definition.assembly}`);
        const p = part.geometry.getAttribute("position");
        for (let i = 0; i < p.count; i++) {
          const surface =
            definition.assembly === "chest"
              ? chestWindowProfile.front(p.getX(i))
              : visorProfile.surface(p.getX(i), p.getY(i));
          expect(p.getZ(i), definition.id).toBeLessThan(surface - 0.005);
        }
      }
      const chest = model.getPart("kingjoemodules.chest.internal_optic_chest_l_guide_0")!;
      const lens = model.getPart(opticalVisorIds[0]!)!;
      for (const state of ["closed", "idle"] as const) {
        model.resetNodes();
        poseKingJoeModules(model, 3, state);
        model.syncInstances();
        model.root.updateMatrixWorld(true);
        for (const part of [chest, lens]) {
          const module = model.getNode(part.def.node!)!;
          const relative = module.matrixWorld.clone().invert().multiply(part.object.matrixWorld);
          expect(relative.elements.every(Number.isFinite)).toBe(true);
          expect(new THREE.Vector3().setFromMatrixPosition(relative).length()).toBeLessThan(1e-6);
        }
      }
      const material = chest.object.material as THREE.MeshStandardMaterial;
      updateOpticalInteriors(model, 1, QUIET_ACTIVITY);
      expect(material.emissiveIntensity).toBeCloseTo(0.06 + pedanPower(1, "modulator_l") * 0.55);
      updateOpticalInteriors(model, 1, { ...QUIET_ACTIVITY, yellow: 1 });
      expect(material.emissiveIntensity).toBeCloseTo(0.61);
    } finally {
      model.dispose();
    }
  }, 20000);
});
