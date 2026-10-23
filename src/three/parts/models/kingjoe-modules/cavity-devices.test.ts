import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as THREE from "three";
import { createMaterialLibrary } from "../../kernel/textures";
import { buildModel } from "../../assembler/assembler";
import { makeKingJoeModuleRegistry, kingjoeModuleBuilders } from "./registry";
import { planCavityDevices } from "./cavity-devices";
import { animateKingJoeModules } from "./motion";

describe("空腔设备、肩肘驱动与流体连接", () => {
  let model: ReturnType<typeof buildModel>;
  let library: ReturnType<typeof createMaterialLibrary>;
  beforeAll(() => {
    const registry = makeKingJoeModuleRegistry();
    library = createMaterialLibrary({ pedan_gel: registry.materials.pedan_gel });
    model = buildModel(registry, { builders: kingjoeModuleBuilders, materials: library.materials });
  }, 20000);
  afterAll(() => {
    model.dispose();
    library.dispose();
  });
  it("八片壳体都有体积设备，空腔设备动作采样仍在内壁约束的安装球内", () => {
    const plan = planCavityDevices(new Map());
    expect(plan.length).toBeGreaterThan(100);
    expect(new Set(plan.map((p) => p.owner)).size).toBe(8);
    expect(
      plan.filter((p) => p.owner === "head_arms" && Math.abs(p.center[0]) > 0.6).length,
    ).toBeGreaterThanOrEqual(6);
    const p = new THREE.Vector3(),
      matrix = new THREE.Matrix4();
    for (const seconds of [0, 1.7, 3.4]) {
      animateKingJoeModules(model, seconds, "beam");
      for (const part of model.parts.filter((p) => p.def.tags?.includes("cavity-device"))) {
        const id = Number(part.partId.match(/cavity_(\d+)_/)![1]),
          device = plan[id];
        const base = model.getNode(`Cavity_base_${id}`)!;
        const inverse = base.matrixWorld.clone().invert();
        const vertices = part.geometry.getAttribute("position");
        for (const instance of part.instances) {
          matrix
            .copy(inverse)
            .multiply(model.root.matrixWorld)
            .multiply(model.instanceMatrix(part, instance.index, new THREE.Matrix4()));
          for (let i = 0; i < vertices.count; i++)
            expect(
              p.fromBufferAttribute(vertices, i).applyMatrix4(matrix).length(),
              part.partId,
            ).toBeLessThan(device.radius + 1e-6);
        }
      }
    }
  }, 20000);
  it("肩肘双活塞端点随父子关节移动，齿圈转角来自关节而非独立时钟", () => {
    animateKingJoeModules(model, 5, "separation");
    animateKingJoeModules(model, 10, "separation");
    const lengths = [...model.nodes.values()]
      .filter((n) => /JointDrive_.*_ram_\d_b$/.test(n.name))
      .map((n) => n.position.y);
    animateKingJoeModules(model, 10, "closed");
    animateKingJoeModules(model, 14, "closed");
    const moved = [...model.nodes.values()]
      .filter((n) => /JointDrive_.*_ram_\d_b$/.test(n.name))
      .map((n) => n.position.y);
    expect(moved.some((n, i) => Math.abs(n - lengths[i]) > 0.02)).toBe(true);
    for (const side of ["l", "r"])
      for (const kind of ["upper", "fore"]) {
        const key = `${kind}_${side}`,
          rotor = model.getNode(`JointDrive_${key}_rotor`)!;
        expect(rotor.rotation.x).toBeCloseTo(model.getNode(`Joint_${key}`)!.rotation.x * 2.4, 8);
        for (let lane = 0; lane < 2; lane++) {
          const ram = `JointDrive_${key}_ram_${lane}`,
            barrel = model.getNode(`${ram}_barrel`)!,
            rod = model.getNode(`${ram}_rod`)!,
            end = model.getNode(`${ram}_b`)!;
          expect(rod.position.y + rod.scale.y / 2).toBeCloseTo(end.position.y, 8);
          expect(barrel.position.y - barrel.scale.y / 2).toBeCloseTo(0, 8);
          expect(rod.position.y - rod.scale.y / 2).toBeLessThan(barrel.position.y + barrel.scale.y / 2);
        }
      }
    const matrices = [...model.nodes.values()]
      .filter((n) => n.name.startsWith("JointDrive_"))
      .map((n) => n.matrix.clone());
    animateKingJoeModules(model, 14.0001, "closed");
    [...model.nodes.values()]
      .filter((n) => n.name.startsWith("JointDrive_"))
      .forEach((n, i) =>
        expect(
          Math.max(...n.matrix.elements.map((v, j) => Math.abs(v - matrices[i].elements[j]))),
        ).toBeLessThan(0.01),
      );
  });
  it("虹彩桥只属于内部，透明且不写深度；每个肩肘有两根软耦合", () => {
    const gel = model.parts.filter((p) => p.def.material === "pedan_gel");
    expect(gel.length).toBeGreaterThan(20);
    expect(gel.filter((p) => p.def.tags?.includes("joint-drive")).length).toBe(8);
    for (const part of gel) {
      expect(part.def.tags).toContain("internal");
      const material = part.object.material as THREE.MeshStandardMaterial;
      expect(material.transparent).toBe(true);
      expect(material.opacity).toBeLessThan(0.5);
      expect(material.depthWrite).toBe(false);
    }
  });
});
