// 其余内构的混合能量交换：单条关系只有一种主表现，肩肘通路逐帧追随真实双端。
// [OM-FREEPLAY] 表现轮换比例、端环尺寸、相位和短时电流包络是实现低亮混合效果的设计取值。
import * as THREE from "three";
import type { AssembledModel } from "../../assembler/assembler";
import type { ModelRegistry, PartDefinition } from "../../registry/types";
import { planDeviceTree, FLOW_PACKET_COUNT, flowPacketScale } from "./hand-couplings";
import type { CavityDevice } from "./cavity-devices";
import { opticalContactFaces } from "./optical-interiors";
import { JOINT_DRIVE } from "./joint-drives";
import {
  TRANSIT_DELAY,
  sampleTransit,
  sampleRedTransit,
  RED_FEED_DELAY,
  type TransitStage,
} from "./energy-transit.mjs";
import type { PedanActivity } from "./machinery";
import { displayMaterialSource } from "../../kernel/displayMaterial";
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
  faceLabel?: string;
  feed?: { from: TransitStage; to: TransitStage };
  redFeed?: { from: number; to: number; side: string; section: string };
}
export function exchangeStage(route: ExchangeRoute): TransitStage {
  if (route.feed) return route.feed.to;
  if (route.owner === "legs") return "legs";
  if (route.owner.startsWith("joint_") || /^(upper|fore)_/.test(route.owner)) return "arms";
  if (route.owner === "chest") return "chest";
  if (route.owner === "head_arms") return route.faceLabel ? "screen" : "head";
  return "core";
}
// 少量分区材质，避免每条接口克隆材质，也避免更新全机共用材质造成同时闪亮。
export const exchangeMaterials: ModelRegistry["materials"] = {};
for (const stage of Object.keys(TRANSIT_DELAY)) {
  ["#38b7b3", "#7f89cb", "#c59b54", "#4c98c4"].forEach((color, i) => {
    exchangeMaterials[`pedan_transit_${stage}_${i}`] = {
      base: color,
      emissive: color,
      emissiveIntensity: 0.2,
      metalness: 0.12,
      roughness: 0.42,
    };
  });
  exchangeMaterials[`pedan_transit_flow_${stage}`] = {
    base: "#48c1cb",
    emissive: "#39aebb",
    emissiveIntensity: 0.35,
    metalness: 0.15,
    roughness: 0.45,
    opacity: 0.62,
    depthWrite: false,
  };
}
for (const module of ["legs", "pelvis", "chest", "head_arms"])
  exchangeMaterials[`pedan_redfeed_${module}`] = {
    base: "#d0a1b3",
    emissive: "#b97887",
    emissiveIntensity: 0.16,
    metalness: 0.15,
    roughness: 0.4,
    opacity: 0.7,
    depthWrite: false,
  };
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
  // [OM-FREEPLAY] 短接口用三个光包，交错使用呼吸/电流，保持局部低亮而非整圈胸甲发光。
  opticalContactFaces.forEach((face, i) =>
    routes.push({
      ...face,
      parent: `Module_${face.owner}`,
      faceLabel: face.label,
      mode: (["rings", "breath", "current"] as const)[i % 3]!,
    }),
  );
  for (const side of ["l", "r"])
    for (const kind of ["upper", "fore"] as const)
      for (const sign of [-1, 1]) {
        const r = JOINT_DRIVE[kind],
          base = `JointDrive_${kind}_${side}`;
        routes.push({
          owner: `joint_${kind}_${side}`,
          parent: "Module_head_arms",
          faceLabel: `${side === "l" ? "左" : "右"}${kind === "upper" ? "肩" : "肘"}轴承端面耦合`,
          mode: sign < 0 ? "rings" : "current",
          a: [sign * r * (JOINT_DRIVE.bearingCenter - JOINT_DRIVE.bearingWire), 0, 0],
          b: [sign * r * (JOINT_DRIVE.hubCenter + JOINT_DRIVE.hubThickness / 2), 0, 0],
          radius: r * JOINT_DRIVE.bearingRadius,
          anchors: [base, `${base}_rotor`],
        });
      }
  // 跨模块主干只有在整机黄色技能阶段才显示；两端始终跟随各自模块，分体时不拉出长光线。
  for (const side of ["l", "r"]) {
    const core = data.rooms.find((r) => r.key === "energy")!;
    const chest = data.rooms.find((r) => r.key === `modulator_${side}`)!;
    const head = data.rooms.find((r) => r.key === "brain")!;
    for (const [a, b, from, to] of [
      [core, chest, "core", "chest"],
      [chest, head, "chest", "head"],
    ] as const) {
      const direction = new THREE.Vector3(...b.center).sub(new THREE.Vector3(...a.center)).normalize();
      const face = (room: typeof a, sign: number): V3 => {
        const distance = Math.min(
          ...room.size.map((v, i) => v / 2 / Math.max(1e-6, Math.abs(direction.getComponent(i)))),
        );
        return new THREE.Vector3(...room.center).addScaledVector(direction, sign * distance).toArray();
      };
      routes.push({
        owner: b.owner,
        parent: `Module_${b.owner}`,
        mode: "rings",
        a: face(a, 1),
        b: face(b, -1),
        radius: 0.045,
        anchors: [`Module_${a.owner}`, `Module_${b.owner}`],
        feed: { from, to },
      });
    }
  }
  for (const owner of ["legs", "pelvis", "chest", "head_arms"])
    for (const side of ["l", "r"]) {
      const key =
        owner === "legs"
          ? `drive_${side}`
          : owner === "chest"
            ? `modulator_${side}`
            : owner === "pelvis"
              ? "energy"
              : "brain";
      const room = data.rooms.find((r) => r.key === key)!;
      const antenna = `Antenna_${owner}_${side}`;
      routes.push({
        owner,
        parent: `Module_${owner}`,
        mode: "rings",
        a: [0, 0, room.size[2] * 0.35],
        b: [0, -0.04, 0],
        radius: 0.048,
        anchors: [`Room_${key}`, `Mount_${owner}_${side}`],
        redFeed: { from: RED_FEED_DELAY.core, to: RED_FEED_DELAY.mount, side, section: "核心至天线根部" },
      });
      routes.push({
        owner,
        parent: `Module_${owner}`,
        mode: "rings",
        a: [0, 0.03, 0],
        b: [0, 0.93, 0],
        radius: 0.037,
        anchors: [antenna, antenna],
        redFeed: { from: RED_FEED_DELAY.mount, to: RED_FEED_DELAY.tip, side, section: "天线内置蓄能级" },
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
        name_cn: route.redFeed
          ? `${route.redFeed.side === "l" ? "左" : "右"}${route.redFeed.section} · ${label}`
          : route.feed
            ? `${route.feed.from === "core" ? "核心至胸甲" : "胸甲至头部"}传能 · ${label}`
            : route.faceLabel
              ? `${route.faceLabel} · ${label}`
              : label,
        name_en: key,
        assembly: module,
        node,
        build_layer: 2,
        build_order: 49000 + i * 8,
        geometry: { type: "kit", kit, params },
        material,
        mate: { type: "absolute", position: [0, 0, 0] },
        scale,
        tags: ["internal", "energy-exchange", "gel-link", ...(route.faceLabel ? ["interface-coupling"] : [])],
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
      { r: route.radius, wire: route.faceLabel ? Math.min(0.002, route.radius * 0.15) : 0.003 },
      route.redFeed ? `pedan_redfeed_${module}` : `pedan_transit_${exchangeStage(route)}_${i % 4}`,
    );
    Object.assign(terminals, { instances: 2, indexed: true, instance_nodes: ends });
    if (route.mode === "rings") {
      const packets = Array.from({ length: route.faceLabel ? 3 : FLOW_PACKET_COUNT }, (_, k) => {
        const name = `${base}_packet_${k}`;
        nodes.push({ name, parent: base, pivot: [0, 0, 0], rest_rotation: [-90, 0, 0], motion: "translate" });
        return name;
      });
      const p = add(
        "packets",
        "非接触传递光环",
        base,
        "pedanRing",
        { r: route.radius * 1.02, wire: route.faceLabel ? Math.min(0.0015, route.radius * 0.1) : 0.0027 },
        route.redFeed ? `pedan_redfeed_${module}` : `pedan_transit_flow_${exchangeStage(route)}`,
      );
      Object.assign(p, { instances: packets.length, indexed: true, instance_nodes: packets });
    } else if (route.mode === "current") {
      const name = `${base}_arc`;
      nodes.push({ name, parent: base, motion: "scalar" });
      add(
        "arc",
        "短时微电流交换",
        name,
        "pedanMicroArc",
        { length: 1, width: route.radius },
        route.redFeed ? `pedan_redfeed_${module}` : `pedan_transit_flow_${exchangeStage(route)}`,
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
    redMaterials: { material: THREE.MeshStandardMaterial; owner: string }[];
    materials: { material: THREE.MeshStandardMaterial; phase: number; stage: TransitStage; flow: boolean }[];
  }
>();
export function updateEnergyExchange(
  model: AssembledModel,
  devices: CavityDevice[],
  time: number,
  activity: PedanActivity,
): void {
  let state = cache.get(model);
  if (!state) {
    const routes = planEnergyExchange(devices),
      seen = new Set<THREE.Material>();
    const materials: {
      material: THREE.MeshStandardMaterial;
      phase: number;
      stage: TransitStage;
      flow: boolean;
    }[] = [];
    const redMaterials: { material: THREE.MeshStandardMaterial; owner: string }[] = [];
    for (const part of model.parts) {
      if (part.def.material.startsWith("pedan_redfeed_")) {
        const material = displayMaterialSource(
          part.object.material as THREE.Material,
        ) as THREE.MeshStandardMaterial;
        if (!seen.has(material)) {
          seen.add(material);
          redMaterials.push({ material, owner: part.def.assembly });
        }
        continue;
      }
      const match = /^pedan_transit_(?:(flow)_)?(core|legs|chest|arms|head|screen)(?:_(\d))?$/.exec(
        part.def.material,
      );
      if (!match) continue;
      const material = displayMaterialSource(
        part.object.material as THREE.Material,
      ) as THREE.MeshStandardMaterial;
      if (seen.has(material)) continue;
      seen.add(material);
      materials.push({
        material,
        phase: Number(match[3] ?? 0) * 1.7,
        stage: match[2] as TransitStage,
        flow: !!match[1],
      });
    }
    state = {
      routes,
      materials,
      redMaterials,
      links: routes.map((route, i) => ({
        base: model.getNode(`Exchange_${i}`)!,
        parent: model.getNode(route.parent)!,
        ends: [0, 1].map((k) => model.getNode(`Exchange_${i}_end_${k}`)!),
        packets: Array.from({ length: FLOW_PACKET_COUNT }, (_, k) => k)
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
    const stage = exchangeStage(route);
    const power = Math.max(
      sampleTransit(activity.beamTime, TRANSIT_DELAY[stage]),
      activity.redModule ===
        (route.owner.startsWith("joint_") || /^(upper|fore)_/.test(route.owner) ? "head_arms" : route.owner)
        ? 0.7 * sampleRedTransit(activity.redTime)
        : 0,
    );
    const breath = 0.5 + 0.5 * Math.sin(time * 1.35 + (i % 4) * 1.7);
    link.ends[1].position.y = length;
    // 安装面固定在实体上，只让光包收放；不能把端环呼吸成漂浮的装饰。
    for (const [endIndex, end] of link.ends.entries()) {
      const endpointPower = route.redFeed
        ? activity.redModule === route.owner
          ? sampleRedTransit(activity.redTime, endIndex === 0 ? route.redFeed.from : route.redFeed.to)
          : 0
        : route.feed
          ? sampleTransit(activity.beamTime, TRANSIT_DELAY[endIndex === 0 ? route.feed.from : route.feed.to])
          : 1;
      end.scale.setScalar(
        route.feed || route.redFeed
          ? Math.max(0.00001, endpointPower)
          : route.faceLabel
            ? 1
            : 0.95 + 0.08 * breath,
      );
    }
    for (const [k, node] of link.packets.entries()) {
      const p =
        (time * (route.faceLabel ? 0.6 : 0.36) +
          (route.redFeed ? route.redFeed.from : i * 0.19) +
          k / link.packets.length) %
        1;
      node.position.y = length * p;
      const traveling = route.redFeed
        ? activity.redModule === route.owner
          ? sampleRedTransit(activity.redTime, THREE.MathUtils.lerp(route.redFeed.from, route.redFeed.to, p))
          : 0
        : route.feed
          ? sampleTransit(
              activity.beamTime,
              THREE.MathUtils.lerp(TRANSIT_DELAY[route.feed.from], TRANSIT_DELAY[route.feed.to], p),
            )
          : 1;
      node.scale.setScalar(Math.max(0.00001, flowPacketScale(p) * (0.85 + power * 0.2) * traveling));
    }
    if (link.arc) {
      const p = (time * 0.18 + i * 0.217) % 1,
        window = 0.06 + power * 0.08,
        envelope = p < window ? Math.sin((p / window) * Math.PI) ** 2 : 0;
      link.arc.scale.set(Math.max(0.00001, envelope), length, Math.max(0.00001, envelope));
    }
    if (link.membrane) {
      link.membrane.position.y = length / 2;
      link.membrane.scale.set(route.radius, length, route.radius * 0.55);
    }
  }
  for (const { material, owner } of state.redMaterials) {
    const charge = activity.redModule === owner ? sampleRedTransit(activity.redTime, RED_FEED_DELAY.tip) : 0;
    material.emissiveIntensity = 0.16 + charge * 0.26;
    material.opacity = 0.7 + charge * 0.08;
  }
  for (const { material, phase, stage, flow } of state.materials) {
    const owner =
      stage === "core" ? "pelvis" : stage === "legs" ? "legs" : stage === "chest" ? "chest" : "head_arms";
    const power = Math.max(
      sampleTransit(activity.beamTime, TRANSIT_DELAY[stage]),
      activity.redModule === owner ? 0.7 * sampleRedTransit(activity.redTime) : 0,
    );
    material.emissiveIntensity = flow
      ? 0.35 + power * 0.15
      : 0.1 + 0.18 * (0.5 + 0.5 * Math.sin(time * 1.35 + phase)) + power * 0.16;
    if (flow) material.opacity = 0.62 + power * 0.12;
  }
}
