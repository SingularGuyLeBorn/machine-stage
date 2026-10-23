// 手掌到指尖的场耦合网络：跨越空隙的连续胶膜、同步端环、定向光包与偶发微电流。
// 用户允许非接触佩丹科技；这些是展示用能量交换，不是实体承力结构。
import * as THREE from "three";
import type { ModelRegistry, PartDefinition } from "../../registry/types";
import type { AssembledModel } from "../../assembler/assembler";
import type { CavityDevice } from "./cavity-devices";
import data from "./pedan.generated.json";
import { displayMaterialSource } from "../../kernel/displayMaterial";
import { updateSoftEnergy } from "./soft-energy";

// [OM-FREEPLAY] 加密采用五圈；途中保持完整尺寸，仅在两端短距离收放，读得出连续传递。
export const FLOW_PACKET_COUNT = 5;
export function flowPacketScale(phase: number): number {
  return Math.max(
    0.00001,
    THREE.MathUtils.smoothstep(phase, 0, 0.12) * THREE.MathUtils.smoothstep(1 - phase, 0, 0.12),
  );
}
export interface HandCoupling {
  owner: string;
  from: CavityDevice;
  to: CavityDevice;
}
/** 每组从最高设备向外生长最短树；手部的根靠近腕部，每个末端都有供能来源。 */
export function planDeviceTree(devices: CavityDevice[], owners: string[]): HandCoupling[] {
  const links: HandCoupling[] = [];
  for (const owner of owners) {
    const points = devices.filter((p) => p.owner === owner).sort((a, b) => b.center[1] - a.center[1]);
    if (!points.length) continue;
    const reached = [points[0]],
      pending = new Set(points.slice(1));
    while (pending.size) {
      let best: { from: CavityDevice; to: CavityDevice; distance: number } | undefined;
      for (const from of reached)
        for (const to of pending) {
          const distance = new THREE.Vector3(...from.center).distanceTo(new THREE.Vector3(...to.center));
          if (!best || distance < best.distance) best = { from, to, distance };
        }
      links.push({ owner, from: best!.from, to: best!.to });
      reached.push(best!.to);
      pending.delete(best!.to);
    }
  }
  return links;
}
export function planHandCouplings(devices: CavityDevice[]): HandCoupling[] {
  return planDeviceTree(devices, ["fore_l", "fore_r"]);
}

export function addHandCouplings(
  devices: CavityDevice[],
  parts: PartDefinition[],
  nodes: ModelRegistry["nodes"],
): void {
  for (const [i, link] of planHandCouplings(devices).entries()) {
    const a = new THREE.Vector3(...link.from.center),
      b = new THREE.Vector3(...link.to.center);
    const axis = b.clone().sub(a).normalize(),
      length = a.distanceTo(b);
    const start = link.from.radius * 0.55,
      end = length - link.to.radius * 0.55;
    // [OM-FREEPLAY] 胶膜呈宽扁带，端部埋入器件内；小端件也保留可辨识的连贯体积。
    const width = Math.max(0.027, Math.min(0.085, Math.min(link.from.radius, link.to.radius) * 1.15));
    const joint = data.joints.find((j) => j.key === link.owner)!;
    const base = `HandField_${i}`;
    const rotation = new THREE.Euler().setFromQuaternion(
      new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis),
    );
    nodes.push({
      name: base,
      parent: `Joint_${link.owner}`,
      pivot: a.toArray().map((v, k) => v - joint.pivot[k]) as [number, number, number],
      rest_rotation: [rotation.x, rotation.y, rotation.z].map(THREE.MathUtils.radToDeg) as [
        number,
        number,
        number,
      ],
    });
    const add = (
      key: string,
      label: string,
      node: string,
      kit: string,
      params: Record<string, number>,
      material: string,
      position: [number, number, number] = [0, 0, 0],
      scale?: [number, number, number],
    ) => {
      const p: PartDefinition = {
        id: `kingjoemodules.head_arms.hand_field_${i}_${key}`,
        name_cn: label,
        name_en: key,
        assembly: "head_arms",
        node,
        build_layer: 2,
        build_order: 48000 + i * 10,
        geometry: { type: "kit", kit, params },
        material,
        mate: { type: "absolute", position },
        scale,
        tags: ["internal", "hand-coupling", "gel-link"],
        source: "原创佩丹非接触场耦合；端点来自实际手部设备，允许跨指节空隙",
      };
      parts.push(p);
      return p;
    };
    add(
      "membrane",
      "跨指节连续流体膜",
      base,
      "pedanMembrane",
      {},
      "pedan_hand_gel",
      [0, length / 2, 0],
      [width, length, width * 0.55],
    );
    // 实例节点忽略 mate 旋转；将圆环 +Z 法线转到通路 +Y，使环面垂直于传播方向。
    const ends = [start, end].map((y, k) => {
      const name = `${base}_end_${k}`;
      nodes.push({ name, parent: base, pivot: [0, y, 0], rest_rotation: [-90, 0, 0], motion: "scalar" });
      return name;
    });
    const terminals = add(
      "terminals",
      "同步呼吸的截面能量环",
      base,
      "pedanRing",
      { r: width * 0.85, wire: 0.0028, soft: 1 },
      "pedan_hand_field",
    );
    Object.assign(terminals, { instances: 2, indexed: true, instance_nodes: ends });
    const packets = Array.from({ length: FLOW_PACKET_COUNT }, (_, k) => {
      const name = `${base}_packet_${k}`;
      nodes.push({
        name,
        parent: base,
        pivot: [0, start, 0],
        rest_rotation: [-90, 0, 0],
        motion: "translate",
      });
      return name;
    });
    const pulse = add(
      "packets",
      "沿指节传递的能量环",
      base,
      "pedanRing",
      { r: width * 0.82, wire: 0.0024, soft: 1 },
      "pedan_hand_flow",
    );
    Object.assign(pulse, { instances: FLOW_PACKET_COUNT, indexed: true, instance_nodes: packets });
    const arc = `${base}_arc`;
    nodes.push({ name: arc, parent: base, pivot: [0, start, 0], motion: "scalar" });
    add(
      "arc",
      "间歇微电流",
      arc,
      "pedanMicroArc",
      { length: end - start, width, soft: 1 },
      "pedan_hand_flow",
    );
  }
}

const cache = new WeakMap<
  AssembledModel,
  {
    base: THREE.Object3D;
    ends: THREE.Object3D[];
    packets: THREE.Object3D[];
    arc: THREE.Object3D;
    start: number;
    end: number;
  }[]
>();
const fieldMaterials = new WeakMap<AssembledModel, Set<THREE.MeshStandardMaterial>>();
const flowMaterials = new WeakMap<AssembledModel, Set<THREE.MeshStandardMaterial>>();
export function updateHandCouplings(model: AssembledModel, seconds: number, charge: number, boost = 0): void {
  let links = cache.get(model);
  if (!links) {
    for (const part of model.parts)
      if (["pedan_hand_field", "pedan_hand_flow"].includes(part.def.material)) part.object.castShadow = false;
    links = [...model.nodes.values()]
      .filter((n) => /^HandField_\d+$/.test(n.name))
      .map((base) => {
        const ends = [0, 1].map((k) => model.getNode(`${base.name}_end_${k}`)!);
        return {
          base,
          ends,
          packets: Array.from({ length: FLOW_PACKET_COUNT }, (_, k) =>
            model.getNode(`${base.name}_packet_${k}`)!,
          ),
          arc: model.getNode(`${base.name}_arc`)!,
          start: ends[0].position.y,
          end: ends[1].position.y,
        };
      });
    cache.set(model, links);
    fieldMaterials.set(
      model,
      new Set(
        model.parts
          .filter((p) => p.def.material === "pedan_hand_field")
          .map(
            (p) => displayMaterialSource(p.object.material as THREE.Material) as THREE.MeshStandardMaterial,
          ),
      ),
    );
    flowMaterials.set(
      model,
      new Set(
        model.parts
          .filter((p) => p.def.material === "pedan_hand_flow")
          .map(
            (p) => displayMaterialSource(p.object.material as THREE.Material) as THREE.MeshStandardMaterial,
          ),
      ),
    );
  }
  for (const [i, link] of links.entries()) {
    // 两端同一时钟，放大缩小不改安装位置；沿途光环在端点缩至零，回卷时没有跳闪。
    const breath = 0.5 + 0.5 * Math.sin(seconds * 1.6 + i * 0.37);
    for (const node of link.ends) node.scale.setScalar(0.92 + breath * 0.12);
    for (const [k, node] of link.packets.entries()) {
      const phase = (seconds * 0.42 + i * 0.17 + k / FLOW_PACKET_COUNT) % 1;
      node.position.y = THREE.MathUtils.lerp(link.start, link.end, phase);
      node.scale.setScalar(flowPacketScale(phase) * (0.8 + charge * 0.15) * (1 + boost * 0.5));
    }
    const phase = (seconds * 0.22 + i * 0.23) % 1;
    const envelope = phase < 0.07 ? Math.sin((phase / 0.07) * Math.PI) ** 2 : 0;
    link.arc.scale.set(Math.max(0.00001, envelope), 1, Math.max(0.00001, envelope));
    link.arc.rotation.y = Math.sin(seconds * 18 + i) * 0.45;
  }
  // 端环共用低亮材质，所有一对端环明暗同步；避免仅靠缩放冒充呼吸发光。
  for (const material of flowMaterials.get(model)!) updateSoftEnergy(material, seconds);
  for (const material of fieldMaterials.get(model)!) {
    updateSoftEnergy(material, seconds);
    material.emissiveIntensity = 0.12 + 0.18 * (0.5 + 0.5 * Math.sin(seconds * 1.6)) + boost * 0.2;
  }
}
