// 其余内构的混合能量交换：单条关系只有一种主表现，肩肘通路逐帧追随真实双端。
// [OM-FREEPLAY] 表现轮换比例、端环尺寸、相位和短时电流包络是实现低亮混合效果的设计取值。
import * as THREE from "three";
import type { AssembledModel } from "../../assembler/assembler";
import type { ModelRegistry, PartDefinition } from "../../registry/types";
import { planDeviceTree } from "./hand-couplings";
import type { CavityDevice } from "./cavity-devices";
import data from "./pedan.generated.json";

export const EXCHANGE_MODES = ["rings", "breath", "current", "rings", "breath", "membrane"] as const;
type V3 = [number, number, number];
export interface ExchangeRoute {
  owner: string;
  parent: string;
  mode: (typeof EXCHANGE_MODES)[number];
  a: V3;
  b: V3;
  radius: number;
  anchors?: [string, string];
}
/** 同壳体设备按最短树组织；跨关节只使用真实安装端，不用距离猜跨分体连接。 */
export function planEnergyExchange(devices: CavityDevice[]): ExchangeRoute[] {
  const owners = [...new Set(devices.map((p) => p.owner))].filter((o) => !o.startsWith("fore"));
  const routes = planDeviceTree(devices, owners).map((edge, i): ExchangeRoute => {
    const joint = data.joints.find((j) => j.key === edge.owner),
      pivot = joint?.pivot ?? [0, 0, 0];
    const a = new THREE.Vector3(...edge.from.center),
      b = new THREE.Vector3(...edge.to.center),
      direction = b.clone().sub(a).normalize();
    a.addScaledVector(direction, edge.from.radius * 0.68);
    b.addScaledVector(direction, -edge.to.radius * 0.68);
    return {
      owner: edge.owner,
      parent: joint ? `Joint_${edge.owner}` : `Module_${edge.owner}`,
      mode: EXCHANGE_MODES[i % EXCHANGE_MODES.length],
      a: a.toArray().map((v, k) => v - pivot[k]) as V3,
      b: b.toArray().map((v, k) => v - pivot[k]) as V3,
      radius: Math.max(0.026, Math.min(0.075, Math.min(edge.from.radius, edge.to.radius) * 0.7)),
    };
  });
  for (const side of ["l", "r"])
    for (const kind of ["upper", "fore"])
      for (let lane = 0; lane < 2; lane++) {
        const ram = `JointDrive_${kind}_${side}_ram_${lane}`;
        routes.push({
          owner: `joint_${kind}_${side}`,
          parent: "Module_head_arms",
          mode: lane === 0 ? "rings" : "current",
          a: [0.075, 0, 0],
          b: [0.075, 0, 0],
          radius: 0.048,
          anchors: [`${ram}_a`, `${ram}_b`],
        });
      }
  return routes;
}

export function addEnergyExchange(
  devices: CavityDevice[],
  parts: PartDefinition[],
  nodes: ModelRegistry["nodes"],
): void {
  for (const [i, route] of planEnergyExchange(devices).entries()) {
    const base = `Exchange_${i}`,
      module =
        data.joints.find((j) => j.key === route.owner)?.module ??
        (route.owner.startsWith("joint_") ? "head_arms" : route.owner);
    const dir = new THREE.Vector3(...route.b).sub(new THREE.Vector3(...route.a));
    const length = route.anchors ? 0.3 : dir.length();
    const euler = new THREE.Euler().setFromQuaternion(
      new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        route.anchors ? new THREE.Vector3(0, 1, 0) : dir.normalize(),
      ),
    );
    nodes.push({
      name: base,
      parent: route.parent,
      pivot: route.anchors ? [0, 0, 0] : route.a,
      rest_rotation: [euler.x, euler.y, euler.z].map(THREE.MathUtils.radToDeg) as V3,
      motion: "rotate",
    });
    const add = (
      key: string,
      label: string,
      node: string,
      kit: string,
      params: Record<string, number>,
      material: string,
      scale?: V3,
    ) => {
      const p: PartDefinition = {
        id: `kingjoemodules.${module}.exchange_${i}_${key}`,
        name_cn: label,
        name_en: key,
        assembly: module,
        node,
        build_layer: 2,
        build_order: 49000 + i * 8,
        geometry: { type: "kit", kit, params },
        material,
        mate: { type: "absolute", position: [0, 0, 0] },
        scale,
        tags: ["internal", "energy-exchange", "gel-link"],
        source: "原创佩丹能量交换；按真实器件端点规划，表现不等于实体管路",
      };
      parts.push(p);
      return p;
    };
    // 实例节点忽略 mate 旋转；将圆环 +Z 法线转到通路 +Y，使环面垂直于传播方向。
    const ends = [0, 1].map((k) => {
      const name = `${base}_end_${k}`;
      nodes.push({
        name,
        parent: base,
        pivot: [0, k * length, 0],
        rest_rotation: [-90, 0, 0],
        motion: "scalar",
      });
      return name;
    });
    const terminals = add(
      "terminals",
      "成对呼吸的能量截面",
      base,
      "pedanRing",
      { r: route.radius, wire: 0.003 },
      `pedan_exchange_${i % 4}`,
    );
    Object.assign(terminals, { instances: 2, indexed: true, instance_nodes: ends });
    if (route.mode === "rings") {
      const packets = [0, 1, 2].map((k) => {
        const name = `${base}_packet_${k}`;
        nodes.push({ name, parent: base, pivot: [0, 0, 0], rest_rotation: [-90, 0, 0], motion: "translate" });
        return name;
      });
      const p = add(
        "packets",
        "非接触传递光环",
        base,
        "pedanRing",
        { r: route.radius * 0.78, wire: 0.002 },
        "pedan_hand_flow",
      );
      Object.assign(p, { instances: 3, indexed: true, instance_nodes: packets });
    } else if (route.mode === "current") {
      const name = `${base}_arc`;
      nodes.push({ name, parent: base, motion: "scalar" });
      add(
        "arc",
        "短时微电流交换",
        name,
        "pedanMicroArc",
        { length: 1, width: route.radius },
        "pedan_hand_flow",
      );
    } else if (route.mode === "membrane") {
      const name = `${base}_membrane`;
      nodes.push({ name, parent: base, pivot: [0, length / 2, 0], motion: "scalar" });
      add("membrane", "局部柔性流体交换", name, "pedanMembrane", {}, "pedan_hand_gel");
    }
  }
}

const cache = new WeakMap<
  AssembledModel,
  {
    routes: ExchangeRoute[];
    links: {
      base: THREE.Object3D;
      parent: THREE.Object3D;
      ends: THREE.Object3D[];
      packets: THREE.Object3D[];
      arc?: THREE.Object3D;
      membrane?: THREE.Object3D;
      anchors?: THREE.Object3D[];
    }[];
    materials: { material: THREE.MeshStandardMaterial; phase: number }[];
  }
>();
export function updateEnergyExchange(
  model: AssembledModel,
  devices: CavityDevice[],
  time: number,
  charge: number,
): void {
  let state = cache.get(model);
  if (!state) {
    const routes = planEnergyExchange(devices),
      seen = new Set<THREE.Material>();
    const materials: { material: THREE.MeshStandardMaterial; phase: number }[] = [];
    for (const part of model.parts)
      if (
        part.def.material.startsWith("pedan_exchange_") &&
        !seen.has(part.object.material as THREE.Material)
      ) {
        const material = part.object.material as THREE.MeshStandardMaterial;
        seen.add(material);
        materials.push({ material, phase: Number(part.def.material.slice(-1)) * 1.7 });
      }
    state = {
      routes,
      materials,
      links: routes.map((route, i) => ({
        base: model.getNode(`Exchange_${i}`)!,
        parent: model.getNode(route.parent)!,
        ends: [0, 1].map((k) => model.getNode(`Exchange_${i}_end_${k}`)!),
        packets: [0, 1, 2]
          .map((k) => model.getNode(`Exchange_${i}_packet_${k}`))
          .filter((n): n is THREE.Group => !!n),
        arc: model.getNode(`Exchange_${i}_arc`),
        membrane: model.getNode(`Exchange_${i}_membrane`),
        anchors: route.anchors?.map((n) => model.getNode(n)!),
      })),
    };
    cache.set(model, state);
  }
  // 肩肘驱动已经更新，先取得当前世界矩阵，再把两端转换回共同父空间。
  model.root.updateMatrixWorld(true);
  for (const [i, link] of state.links.entries()) {
    const route = state.routes[i];
    let a = new THREE.Vector3(...route.a),
      b = new THREE.Vector3(...route.b);
    if (link.anchors) {
      a = link.parent.worldToLocal(link.anchors[0].localToWorld(a));
      b = link.parent.worldToLocal(link.anchors[1].localToWorld(b));
    }
    const length = a.distanceTo(b),
      dir = b.clone().sub(a).normalize();
    link.base.position.copy(a);
    link.base.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    const breath = 0.5 + 0.5 * Math.sin(time * 1.35 + (i % 4) * 1.7);
    link.ends[1].position.y = length;
    for (const end of link.ends) end.scale.setScalar(0.95 + 0.08 * breath);
    for (const [k, node] of link.packets.entries()) {
      const p = (time * 0.36 + i * 0.19 + k / 3) % 1;
      node.position.y = length * p;
      node.scale.setScalar(Math.max(0.00001, Math.sin(Math.PI * p) ** 0.7) * (0.85 + charge * 0.1));
    }
    if (link.arc) {
      const p = (time * 0.18 + i * 0.217) % 1,
        envelope = p < 0.06 ? Math.sin((p / 0.06) * Math.PI) ** 2 : 0;
      link.arc.scale.set(Math.max(0.00001, envelope), length, Math.max(0.00001, envelope));
    }
    if (link.membrane) {
      link.membrane.position.y = length / 2;
      link.membrane.scale.set(route.radius, length, route.radius * 0.55);
    }
  }
  for (const { material, phase } of state.materials)
    material.emissiveIntensity = 0.1 + 0.18 * (0.5 + 0.5 * Math.sin(time * 1.35 + phase));
}
