import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import * as THREE from "three";
import { MeshBVH } from "three-mesh-bvh";
import { QUIET_ACTIVITY } from "./machinery";
import { opticalContactFaces } from "./optical-interiors";
import { createMaterialLibrary } from "../../kernel/textures";
import { buildModel } from "../../assembler/assembler";
import { makeKingJoeModuleRegistry, kingjoeModuleBuilders } from "./registry";
import { planCavityDevices } from "./cavity-devices";
import { animateKingJoeModules } from "./motion";
import { planHandCouplings, updateHandCouplings, FLOW_PACKET_COUNT, flowPacketScale } from "./hand-couplings";
import { planEnergyExchange, exchangeMaterials, updateEnergyExchange } from "./energy-exchange";
import { flexibleFrame, flexProfile } from "./flex-frame";
import flexData from "./flex-frame.generated.json";

describe("空腔设备、肩肘驱动与流体连接", () => {
  let model: ReturnType<typeof buildModel>;
  let library: ReturnType<typeof createMaterialLibrary>;
  beforeAll(() => {
    const registry = makeKingJoeModuleRegistry();
    library = createMaterialLibrary({
      ...exchangeMaterials,
      pedan_gel: registry.materials.pedan_gel,
      pedan_hand_field: registry.materials.pedan_hand_field,
      pedan_hand_flow: registry.materials.pedan_hand_flow,
    });
    model = buildModel(registry, { builders: kingjoeModuleBuilders, materials: library.materials });
  }, 20000);
  afterAll(() => {
    model.dispose();
    library.dispose();
  });
  it("五圈低亮光包在路途中保持清楚轮廓，柔性骨架端部锁定", () => {
    expect(flexData.sourceSha256).toBe(
      createHash("sha256")
        .update(readFileSync(new URL("./pedan.generated.json", import.meta.url)))
        .digest("hex"),
    );
    const packets = model.parts.filter((p) => /_(packets)$/.test(p.partId));
    expect(FLOW_PACKET_COUNT).toBe(5);
    expect(packets.length).toBeGreaterThan(100);
    for (const part of packets)
      expect(part.instances.length).toBe(
        part.def.material.startsWith("pedan_redfeed_")
          ? 9
          : part.def.tags?.includes("interface-coupling")
            ? 3
            : 5,
      );
    for (const phase of [0.12, 0.3, 0.5, 0.7, 0.88]) expect(flowPacketScale(phase)).toBeCloseTo(1);
    expect(flowPacketScale(0)).toBeLessThan(0.001);
    expect(flowPacketScale(1)).toBeLessThan(0.001);
    expect(new Set([...flexibleFrame.values()].map((p) => p.owner)).size).toBe(8);
    for (const piece of flexibleFrame.values()) {
      expect(piece.softVolume).toBeGreaterThan(0);
      expect(piece.rigidVolume).toBeLessThan(piece.originalVolume);
      for (const zone of piece.zones) {
        expect(flexProfile(zone.center - zone.width / 2, [zone])[0]).toBeCloseTo(0);
        expect(flexProfile(zone.center + zone.width / 2, [zone])[0]).toBeCloseTo(0);
        expect(flexProfile(zone.center, [zone])[0]).toBeCloseTo(1);
      }
      const part = model.parts.find((p) => p.partId.endsWith(`.flex_${piece.key}`))!;
      // 胸部环绕横肋及配套柔性接头已按用户要求移除，其他部位继续验证。
      if (piece.owner === "chest" && piece.key.startsWith("chest_rib_")) {
        expect(part).toBeUndefined();
        continue;
      }
      expect(part).toBeDefined();
      expect(part.def.tags).toContain("internal");
      expect(part.geometry.getAttribute("flexProfile").count).toBe(
        part.geometry.getAttribute("position").count,
      );
    }
  });
  it("光学接口落在实体连接面，短程耦合不会变成悬空装饰", () => {
    for (const contact of opticalContactFaces) {
      for (const [i, point] of [contact.a, contact.b].entries()) {
        const part = model.getPart(contact.faces[i]!)!;
        expect(part, contact.label).toBeDefined();
        const tree = new MeshBVH(part.geometry);
        expect(tree.closestPointToPoint(new THREE.Vector3(...point))!.distance, contact.label).toBeLessThan(
          0.001,
        );
      }
      const gap = new THREE.Vector3(...contact.a).distanceTo(new THREE.Vector3(...contact.b));
      expect(gap).toBeGreaterThan(0.01);
      expect(gap).toBeLessThan(0.08);
    }
    model.resetNodes();
    animateKingJoeModules(model, 0.2, "beam");
    const routes = planEnergyExchange(planCavityDevices(new Map()));
    for (const [i, route] of routes.entries()) {
      if (!route.faceLabel) continue;
      const a = model.getNode(`Exchange_${i}_end_0`)!;
      const b = model.getNode(`Exchange_${i}_end_1`)!;
      expect(a.scale.toArray()).toEqual([1, 1, 1]);
      expect(b.scale.toArray()).toEqual([1, 1, 1]);
      expect(
        a.getWorldPosition(new THREE.Vector3()).distanceTo(b.getWorldPosition(new THREE.Vector3())),
      ).toBeGreaterThan(0.01);
    }
  });
  it("技能从核心分阶段带亮接口，停止后恢复，分体时主干光包不残留", () => {
    const devices = planCavityDevices(new Map());
    const material = (stage: string) =>
      model.parts.find((p) => p.def.material === `pedan_transit_${stage}_0`)!.object
        .material as THREE.MeshStandardMaterial;
    const baseline = new Map<string, number>();
    updateEnergyExchange(model, devices, 10, QUIET_ACTIVITY);
    for (const stage of ["core", "chest", "head", "screen"])
      baseline.set(stage, material(stage).emissiveIntensity);
    updateEnergyExchange(model, devices, 10, { ...QUIET_ACTIVITY, beamTime: 0.25, charge: 0.2 });
    expect(material("core").emissiveIntensity).toBeGreaterThan(baseline.get("core")!);
    expect(material("chest").emissiveIntensity).toBe(baseline.get("chest"));
    expect(material("screen").emissiveIntensity).toBe(baseline.get("screen"));
    updateEnergyExchange(model, devices, 10, { ...QUIET_ACTIVITY, beamTime: 0.7, charge: 0.5 });
    expect(material("chest").emissiveIntensity).toBeGreaterThan(baseline.get("chest")!);
    expect(material("head").emissiveIntensity).toBe(baseline.get("head"));
    updateEnergyExchange(model, devices, 10, { ...QUIET_ACTIVITY, beamTime: 1.45, charge: 1 });
    expect(material("screen").emissiveIntensity).toBeGreaterThan(baseline.get("screen")!);
    for (const part of model.parts.filter((p) => p.def.material.startsWith("pedan_transit_"))) {
      const m = part.object.material as THREE.MeshStandardMaterial;
      expect(m.emissiveIntensity).toBeLessThanOrEqual(0.5);
      if (part.def.material.includes("flow")) expect(m.opacity).toBeLessThanOrEqual(0.74);
    }
    updateEnergyExchange(model, devices, 10, QUIET_ACTIVITY);
    for (const stage of baseline.keys()) expect(material(stage).emissiveIntensity).toBe(baseline.get(stage));
    const legBase = material("legs").emissiveIntensity;
    updateEnergyExchange(model, devices, 10, { ...QUIET_ACTIVITY, redModule: "legs", redTime: 1.5 });
    expect(material("legs").emissiveIntensity).toBeGreaterThan(legBase);
    expect(material("core").emissiveIntensity).toBe(baseline.get("core"));
    expect(material("chest").emissiveIntensity).toBe(baseline.get("chest"));
    const routes = planEnergyExchange(devices);
    expect(routes.filter((r) => r.feed)).toHaveLength(4);
    routes.forEach((route, i) => {
      if (!route.feed) return;
      expect(model.getNode(`Exchange_${i}_end_0`)!.scale.x).toBeLessThan(0.0001);
      expect(model.getNode(`Exchange_${i}_packet_0`)!.scale.x).toBeLessThan(0.0001);
    });
  });
  it("手部和全身光环的实际实例法线始终沿截面传递方向", () => {
    const rings = model.parts.filter(
      (p) =>
        (p.def.tags?.includes("hand-coupling") || p.def.tags?.includes("energy-exchange")) &&
        /_(terminals|packets)$/.test(p.partId),
    );
    expect(rings.length).toBeGreaterThan(300);
    for (const time of [0.2, 1.7, 3.4]) {
      model.resetNodes();
      animateKingJoeModules(model, time, "beam");
      model.syncInstances();
      for (const part of rings) {
        const base = model.getNode(part.def.node!)!;
        const direction = model
          .getNode(`${base.name}_end_1`)!
          .getWorldPosition(new THREE.Vector3())
          .sub(model.getNode(`${base.name}_end_0`)!.getWorldPosition(new THREE.Vector3()))
          .normalize();
        for (const instance of part.instances) {
          const matrix = new THREE.Matrix4();
          (part.object as THREE.InstancedMesh).getMatrixAt(instance.index, matrix);
          matrix.premultiply(part.object.matrixWorld);
          const normal = new THREE.Vector3(0, 0, 1)
            .applyMatrix3(new THREE.Matrix3().getNormalMatrix(matrix))
            .normalize();
          expect(normal.dot(direction), `${part.partId}[${instance.index}]`).toBeGreaterThan(0.99999);
        }
      }
    }
  });
  it("其余内构混合四种低亮交换，八条肩肘通路在抬臂中紧随双端", () => {
    const routes = planEnergyExchange(planCavityDevices(new Map()));
    expect(new Set(routes.map((r) => r.mode)).size).toBe(4);
    expect(routes.filter((r) => r.mode === "membrane").length / routes.length).toBeLessThan(0.25);
    expect(routes.filter((r) => r.anchors && !r.faceLabel && !r.feed && !r.redFeed).length).toBe(8);
    expect(routes.filter((r) => r.anchors && r.faceLabel).length).toBe(8);
    expect(routes.filter((r) => r.faceLabel).length).toBe(32);
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
        if (!route.feed && !route.redFeed) expect(endA.scale.equals(endB.scale)).toBe(true);
        if (route.faceLabel && route.owner.startsWith("joint_") && route.mode === "rings") {
          // 行程中段至少有一个环保持端面半径，防止统一缩放把它再次缩进轮毂。
          const largest = Math.max(
            ...[0, 1, 2].map((k) => model.getNode(`Exchange_${i}_packet_${k}`)!.scale.x),
          );
          expect(largest).toBeGreaterThanOrEqual(1);
        }
      }
    }
    for (const part of model.parts.filter(
      (p) => p.def.material.startsWith("pedan_transit_") && !p.def.material.includes("_flow_"),
    ))
      expect((part.object.material as THREE.MeshStandardMaterial).emissiveIntensity).toBeLessThanOrEqual(
        0.44,
      );
  });
  it("四分体只给自己的双天线供能，两边同阶段同步，离开发射后关闭专用通路", () => {
    const routes = planEnergyExchange(planCavityDevices(new Map()));
    const feeds = routes.map((route, index) => ({ route, index })).filter(({ route }) => route.redFeed);
    expect(feeds).toHaveLength(16);
    for (const [ownerIndex, owner] of ["legs", "pelvis", "chest", "head_arms"].entries()) {
      const start = 100 + ownerIndex * 10;
      const motion = `ray_${owner}` as "ray_legs";
      animateKingJoeModules(model, start, motion);
      for (const elapsed of [2.1, 2.4, 2.8, 3.1, 3.5, 3.9]) {
        animateKingJoeModules(model, start + elapsed, motion);
        for (const { route, index } of feeds) {
          const end = model.getNode(`Exchange_${index}_end_1`)!;
          if (route.owner !== owner) expect(end.scale.x).toBe(0.00001);
          else {
            const twin = feeds.find(
              (candidate) =>
                candidate.route.owner === owner &&
                candidate.route.redFeed!.section === route.redFeed!.section &&
                candidate.route.redFeed!.side !== route.redFeed!.side,
            )!;
            expect(end.scale.x).toBe(model.getNode(`Exchange_${twin.index}_end_1`)!.scale.x);
            for (let packet = 0; packet < 9; packet++)
              expect(model.getNode(`Exchange_${index}_packet_${packet}`)!.scale.x).toBeCloseTo(
                model.getNode(`Exchange_${twin.index}_packet_${packet}`)!.scale.x,
                10,
              );
          }
        }
        for (const part of model.parts.filter((p) => p.def.material.startsWith("pedan_redfeed_"))) {
          const material = part.object.material as THREE.MeshStandardMaterial;
          expect(material.emissiveIntensity).toBeLessThanOrEqual(0.420001);
          expect(material.opacity).toBeLessThanOrEqual(0.780001);
        }
      }
    }
    animateKingJoeModules(model, 150, "closed");
    for (const { index } of feeds) expect(model.getNode(`Exchange_${index}_end_1`)!.scale.x).toBe(0.00001);
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
