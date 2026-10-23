import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as THREE from "three";
import { createMaterialLibrary } from "../../kernel/textures";
import { buildModel } from "../../assembler/assembler";
import { makeKingJoeModuleRegistry, kingjoeModuleBuilders } from "./registry";
import { planCavityDevices } from "./cavity-devices";
import { animateKingJoeModules } from "./motion";
import { planHandCouplings, updateHandCouplings } from "./hand-couplings";
import { planEnergyExchange } from "./energy-exchange";

describe("空腔设备、肩肘驱动与流体连接", () => {
  let model: ReturnType<typeof buildModel>;
  let library: ReturnType<typeof createMaterialLibrary>;
  beforeAll(() => {
    const registry = makeKingJoeModuleRegistry();
    library = createMaterialLibrary({
      pedan_gel: registry.materials.pedan_gel,
      pedan_hand_field: registry.materials.pedan_hand_field,
      ...Object.fromEntries(
        [0, 1, 2, 3].map((i) => [`pedan_exchange_${i}`, registry.materials[`pedan_exchange_${i}`]]),
      ),
    });
    model = buildModel(registry, { builders: kingjoeModuleBuilders, materials: library.materials });
  }, 20000);
  afterAll(() => {
    model.dispose();
    library.dispose();
  });
  it("其余内构混合四种低亮交换，八条肩肘通路在抬臂中紧随双端", () => {
    const routes = planEnergyExchange(planCavityDevices(new Map()));
    expect(new Set(routes.map((r) => r.mode)).size).toBe(4);
    expect(routes.filter((r) => r.mode === "membrane").length / routes.length).toBeLessThan(0.25);
    expect(routes.filter((r) => r.anchors).length).toBe(8);
    for (const owner of ["legs", "pelvis", "chest", "head_arms", "upper_l", "upper_r"])
      expect(routes.some((r) => r.owner === owner)).toBe(true);
    for (const time of [0, 1.7, 3.4]) {
      animateKingJoeModules(model, time, "beam");
      for (const [i, route] of routes.entries()) {
        const parent = model.getNode(route.parent)!;
        const a = route.anchors
          ? model.getNode(route.anchors[0])!.localToWorld(new THREE.Vector3(...route.a))
          : parent.localToWorld(new THREE.Vector3(...route.a));
        const b = route.anchors
          ? model.getNode(route.anchors[1])!.localToWorld(new THREE.Vector3(...route.b))
          : parent.localToWorld(new THREE.Vector3(...route.b));
        const endA = model.getNode(`Exchange_${i}_end_0`)!,
          endB = model.getNode(`Exchange_${i}_end_1`)!;
        expect(endA.getWorldPosition(new THREE.Vector3()).distanceTo(a)).toBeLessThan(1e-6);
        expect(endB.getWorldPosition(new THREE.Vector3()).distanceTo(b)).toBeLessThan(1e-6);
        expect(endA.scale.equals(endB.scale)).toBe(true);
      }
    }
    for (const part of model.parts.filter((p) => p.def.material.startsWith("pedan_exchange_")))
      expect((part.object.material as THREE.MeshStandardMaterial).emissiveIntensity).toBeLessThanOrEqual(
        0.28,
      );
  });
  it("手部设备全连通，胶膜端点跟随指节，能量环定向流动且两端同步呼吸", () => {
    const plan = planCavityDevices(new Map()),
      links = planHandCouplings(plan);
    for (const owner of ["fore_l", "fore_r"]) {
      const own = plan.filter((p) => p.owner === owner),
        edges = links.filter((p) => p.owner === owner);
      expect(edges.length).toBe(own.length - 1);
      const reached = new Set([edges[0].from]);
      for (const edge of edges) {
        expect(reached.has(edge.from)).toBe(true);
        reached.add(edge.to);
      }
      expect(reached.size).toBe(own.length);
    }
    for (const time of [0, 1.7, 3.4]) {
      animateKingJoeModules(model, time, "beam");
      for (const [i, edge] of links.entries()) {
        const node = model.getNode(`HandField_${i}`)!;
        const from = model
          .getNode(`Cavity_base_${plan.indexOf(edge.from)}`)!
          .getWorldPosition(new THREE.Vector3());
        const to = model
          .getNode(`Cavity_base_${plan.indexOf(edge.to)}`)!
          .getWorldPosition(new THREE.Vector3());
        const length = new THREE.Vector3(...edge.from.center).distanceTo(
          new THREE.Vector3(...edge.to.center),
        );
        expect(node.localToWorld(new THREE.Vector3()).distanceTo(from)).toBeLessThan(1e-6);
        expect(node.localToWorld(new THREE.Vector3(0, length, 0)).distanceTo(to)).toBeLessThan(1e-6);
        const a = model.getNode(`HandField_${i}_end_0`)!,
          b = model.getNode(`HandField_${i}_end_1`)!;
        expect(a.scale.equals(b.scale)).toBe(true);
      }
    }
    updateHandCouplings(model, 0.2, 0);
    const pulse = model.getNode("HandField_0_packet_0")!,
      before = pulse.position.y;
    updateHandCouplings(model, 0.3, 0);
    expect(pulse.position.y).toBeGreaterThan(before);
    const material = model.getPart("kingjoemodules.head_arms.hand_field_0_terminals")!.object
      .material as THREE.MeshStandardMaterial;
    expect(material.emissiveIntensity).toBeLessThanOrEqual(0.3);
    const arc = model.getNode("HandField_0_arc")!;
    updateHandCouplings(model, 0.16, 0);
    expect(arc.scale.x).toBeGreaterThan(0.9);
    updateHandCouplings(model, 1, 0);
    expect(arc.scale.x).toBeLessThan(0.001);
  });
  it("头侧、脚掌和手掌双侧都有新增实体，填隙包络不挤进已有设备", () => {
    const plan = planCavityDevices(new Map());
    for (const region of ["head", "foot", "hand"])
      for (const side of [-1, 1])
        expect(
          plan.filter((p) => p.infill === region && Math.sign(p.center[0]) === side).length,
        ).toBeGreaterThan(5);
    for (const device of plan.filter((p) => p.infill))
      for (const other of plan.filter((p) => p !== device && p.owner === device.owner))
        expect(
          new THREE.Vector3(...device.center).distanceTo(new THREE.Vector3(...other.center)),
        ).toBeGreaterThanOrEqual(device.radius + other.radius);
    for (const side of ["l", "r"])
      expect(
        model.parts.filter(
          (p) =>
            p.partId.endsWith("gel_capsule") &&
            model.getNode(p.def.node!)!.parent?.name === `Joint_fore_${side}`,
        ).length,
      ).toBe(0);
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
      expect(material.opacity).toBeLessThan(0.65);
      expect(material.depthWrite).toBe(false);
    }
  });
});
