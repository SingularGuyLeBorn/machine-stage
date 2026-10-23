// 原创佩丹设备网络：实际内壁决定可用空间，同一驱动相位联动转子、滑块和弹簧。
// [OM-FREEPLAY] 铜母排、紫色场晶格、青钛转子与红色电容区分功能；不是官方内部构造。
import * as THREE from "three";
import type { MeshBVH } from "three-mesh-bvh";
import type { GeometrySpec, ModelRegistry, PartDefinition } from "../../registry/types";
import type { AssembledModel } from "../../assembler/assembler";
import data from "./pedan.generated.json";

type Room = (typeof data.rooms)[number];
type V3 = [number, number, number];
export interface PedanActivity {
  drive: number;
  charge: number;
  yellow: number;
  redModule: string | null;
}
export const QUIET_ACTIVITY: PedanActivity = { drive: 0, charge: 0, yellow: 0, redModule: null };
const smooth = (x: number) => {
  const t = THREE.MathUtils.clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
};
export function pedanPower(seconds: number, channel: string, activity = QUIET_ACTIVITY): number {
  if (channel.startsWith("modulator")) {
    const side = channel.endsWith("l") ? -1 : 1;
    const wave = 0.5 + 0.5 * Math.sin(seconds * 2.1 + side * 1.3 + 4.77 * 3);
    const lit = smooth((Math.sin(seconds * 0.95) + 0.35) / 0.75);
    return Math.max(0.006 + lit * (0.15 + 0.85 * wave * wave), activity.charge * 0.85, activity.yellow);
  }
  if (channel === "brain")
    return 0.3 + 0.12 * Math.sin(seconds * 1.35) ** 2 + activity.charge * 0.8 + activity.yellow;
  return (
    0.13 +
    0.08 * Math.sin(seconds * 1.7) ** 2 +
    (channel === activity.redModule ? 1.3 : activity.charge * 0.45)
  );
}
export const powerMaterial = (room: string, module: string) =>
  `pedan_power_${room === "brain" || room.startsWith("modulator") ? room : module}`;

export function addPedanMachinery(
  room: Room,
  tree: MeshBVH,
  parts: PartDefinition[],
  nodes: ModelRegistry["nodes"],
): void {
  const module = data.joints.find((j) => j.key === room.owner)?.module ?? room.owner;
  const origin = new THREE.Vector3(...(room.center as V3));
  const power = powerMaterial(room.key, module);
  const add = (
    name: string,
    label: string,
    node: string,
    geometry: GeometrySpec,
    material: string,
    at: V3 = [0, 0, 0],
    rotation: V3 = [0, 0, 0],
  ) => {
    parts.push({
      id: `kingjoemodules.${module}.internal_${room.key}_network_${name}`,
      name_cn: label,
      name_en: name,
      assembly: module,
      node,
      build_layer: 2,
      build_order: 10 + parts.length,
      geometry,
      material,
      mate: { type: "absolute", position: at, rotation },
      tags: ["internal", ...(material === power ? [power] : [])],
      source: "原创佩丹场机构；尺寸受真实内腔最近距离约束，动态件扫掠限制于安装球内",
    });
  };
  const kit = (name: string, params: Record<string, number>): GeometrySpec => ({
    type: "kit",
    kit: `pedan${name}`,
    params,
  });
  // 屏幕与胸窗并非无源灯贴：从各自核心向灯窗背面的实际内壁建立光学馈通。
  if (room.key === "brain" || room.key.startsWith("modulator")) {
    const target =
      room.key === "brain"
        ? new THREE.Vector3(0, 6.195, 0.66)
        : origin.clone().add(new THREE.Vector3(0, 0, 1));
    const direction = target.clone().sub(origin).normalize();
    const hit = tree.raycastFirst(new THREE.Ray(origin, direction), THREE.DoubleSide);
    if (hit) {
      const length = Math.max(0.01, hit.distance - 0.008),
        radius = Math.min(...room.size) * 0.08;
      const orientation = new THREE.Euler().setFromQuaternion(
        new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction),
      );
      const pipe = `Pedan_output_${room.key}`;
      nodes.push({
        name: pipe,
        parent: `Room_${room.key}`,
        pivot: direction
          .clone()
          .multiplyScalar(length / 2)
          .toArray(),
        rest_rotation: [orientation.x, orientation.y, orientation.z].map(THREE.MathUtils.radToDeg) as V3,
      });
      add(
        "optical_feedthrough",
        "能量核心至灯窗背面的光学馈通",
        pipe,
        kit("Cylinder", { r: radius * 0.3, h: length }),
        "pedan_violet",
      );
      for (let i = 0; i < 7; i++) {
        add(
          `output_coil_${i}`,
          "光学加速级约束线圈",
          pipe,
          kit("Ring", { r: radius, wire: radius * 0.18 }),
          "pedan_coil",
          [0, (i / 6 - 0.5) * length * 0.88, 0],
          [90, 0, 0],
        );
        const flow = `Pedan_flow_${room.key}_output_${i}`;
        nodes.push({ name: flow, parent: pipe, motion: "translate" });
        add(`output_pulse_${i}`, "灯窗馈通能量光包", flow, kit("Crystal", { r: radius * 0.65 }), power);
      }
    }
  }
  // 两层错列设备沿放射路径铺到内壁附近。每个设备球采用最近壁距，不能只凭外壳 AABB 放大。
  for (let i = 0; i < 12; i++) {
    const angle = ((i % 6) * Math.PI) / 3 + (i >= 6 ? 0.27 : 0);
    const direction = new THREE.Vector3(Math.cos(angle), i >= 6 ? 0.65 : -0.65, Math.sin(angle)).normalize();
    const hit = tree.raycastFirst(new THREE.Ray(origin, direction), THREE.DoubleSide);
    if (!hit || hit.distance < 0.055) continue;
    const center = origin.clone().addScaledVector(direction, hit.distance * 0.7);
    const clearance = tree.closestPointToPoint(center)!.distance;
    const r = Math.min(0.14, clearance * 0.82);
    if (r < 0.012) continue;
    const local = center.clone().sub(origin);
    const base = `Pedan_base_${room.key}_${i}`;
    const rotor = `Pedan_rotor_${room.key}_${i}`;
    const slider = `Pedan_slider_${room.key}_${i}`;
    const spring = `Pedan_spring_${room.key}_${i}`;
    // 每个设备的 Y 轴沿供能方向；旋转只影响设备自身，不带动输能管和安装座。
    const rotation = new THREE.Euler().setFromQuaternion(
      new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction),
    );
    nodes.push({
      name: base,
      parent: `Room_${room.key}`,
      pivot: local.toArray(),
      rest_rotation: [rotation.x, rotation.y, rotation.z].map(THREE.MathUtils.radToDeg) as V3,
    });
    nodes.push({ name: rotor, parent: base, motion: "rotate" });
    nodes.push({ name: slider, parent: base, motion: "translate" });
    nodes.push({ name: spring, parent: base, pivot: [0, -r * 0.32, 0], motion: "scalar" });
    const family = i % 3;
    add(
      `${i}_mount`,
      "场设备悬置底座",
      base,
      kit("Cylinder", { r: r * 0.58, h: r * 0.16 }),
      "pedan_ceramic",
      [0, -r * 0.6, 0],
    );
    add(
      `${i}_coil`,
      "脉冲压缩螺旋线圈",
      spring,
      kit("Spring", { r: r * 0.37, h: r * 0.42, wire: r * 0.046, turns: 5 }),
      "pedan_coil",
    );
    add(
      `${i}_core`,
      family === 0 ? "相位切换多面晶体" : family === 1 ? "脉冲电容芯" : "场涡流核心",
      slider,
      family === 1 ? kit("Cylinder", { r: r * 0.28, h: r * 0.48 }) : kit("Crystal", { r: r * 0.36 }),
      power,
    );
    add(
      `${i}_collar`,
      "反向旋转场约束环",
      rotor,
      kit("Ring", { r: r * 0.68, wire: r * 0.055 }),
      family === 1 ? "pedan_red" : "pedan_violet",
      [0, 0, 0],
      [90, 0, 0],
    );
    // 交错扇叶、辐条和电容筒形成三种可读轮廓，而不是把相同盒子随机撒满。
    for (let j = 0; j < 6; j++) {
      const a = (j * Math.PI) / 3,
        radial = r * (family === 1 ? 0.51 : 0.48);
      const at: V3 = [Math.cos(a) * radial, r * 0.1, Math.sin(a) * radial];
      add(
        `${i}_blade_${j}`,
        family === 1 ? "环列储能电容" : family === 2 ? "相位叶片" : "行星传动辐条",
        rotor,
        family === 1
          ? kit("Cylinder", { r: r * 0.11, h: r * 0.55 })
          : kit("Box", { w: r * 0.48, h: r * 0.13, d: r * (family === 2 ? 0.22 : 0.09) }),
        family === 1 ? (j % 2 ? "pedan_red" : "pedan_coil") : j % 2 ? "pedan_titanium" : "pedan_frame",
        at,
        family === 1 ? [0, 0, 0] : [family === 2 ? 24 : 0, -j * 60, 0],
      );
    }
    // 一条真实母排连接核心与外围设备，三枚离散光包沿同一通道移动，发射时提速。
    const length = local.length(),
      pipe = `Pedan_pipe_${room.key}_${i}`;
    nodes.push({
      name: pipe,
      parent: `Room_${room.key}`,
      pivot: local.clone().multiplyScalar(0.5).toArray(),
      rest_rotation: [rotation.x, rotation.y, rotation.z].map(THREE.MathUtils.radToDeg) as V3,
    });
    add(
      `${i}_pipe`,
      "核心至场设备绝缘输能管",
      pipe,
      kit("Cylinder", { r: r * 0.06, h: length }),
      "pedan_ceramic",
    );
    for (let j = 0; j < 3; j++) {
      const flow = `Pedan_flow_${room.key}_${i}_${j}`;
      nodes.push({ name: flow, parent: pipe, motion: "translate" });
      add(
        `${i}_pulse_${j}`,
        "定向输能光包",
        flow,
        kit("Cylinder", { r: r * 0.09, h: Math.min(r * 0.28, length / 10) }),
        power,
      );
    }
  }
}

/**
 * 在既有设备上增加齿列、散热鳍、随动触头和场极靴。按各分体原有内部实例数
 * 分配新增数量，因此每个分体恰好翻倍；重复件共享几何并用 instance_nodes 随动。
 * [OM-FREEPLAY] 四类附件的比例是原创机械解释，全部留在原设备的内壁安全球内。
 */
export function addPedanDetailAssemblies(parts: PartDefinition[], nodes: ModelRegistry["nodes"]): void {
  // 柔性接头与多体核心是独立增强，不再次触发原设备附件翻倍，避免无关装饰随新核心递增。
  const original = parts.filter(
    (p) =>
      p.tags?.includes("internal") && !p.tags.some((tag) => ["flex-frame", "orbital-core"].includes(tag)),
  );
  for (const module of new Set(original.map((p) => p.assembly))) {
    const budget = original
      .filter((p) => p.assembly === module)
      .reduce((sum, p) => sum + (p.instances ?? 1), 0);
    const mounts = original.filter((p) => p.assembly === module && /_network_\d+_mount$/.test(p.id));
    for (const [index, mount] of mounts.entries()) {
      const base = mount.node!;
      const suffix = base.slice("Pedan_base_".length);
      const r = Number((mount.geometry as { params: Record<string, number> }).params.r) / 0.58;
      const count = Math.floor(budget / mounts.length) + (index < budget % mounts.length ? 1 : 0);
      const families: Array<{
        key: string;
        label: string;
        count: number;
        parent: string;
        radial: number;
        y: number;
        kit: string;
        params: Record<string, number>;
        material: string;
      }> = [
        {
          key: "teeth",
          label: "随动场转子齿列",
          count: 6,
          parent: `Pedan_rotor_${suffix}`,
          radial: 0.76,
          y: 0,
          kit: "pedanBox",
          params: { w: r * 0.16, h: r * 0.12, d: r * 0.13 },
          material: "pedan_titanium",
        },
        {
          key: "fins",
          label: "底座径向散热鳍",
          count: 6,
          parent: base,
          radial: 0.64,
          y: -0.37,
          kit: "pedanBox",
          params: { w: r * 0.18, h: r * 0.46, d: r * 0.14 },
          material: "pedan_coil",
        },
        {
          key: "contacts",
          label: "执行芯随动触头",
          count: 4,
          parent: `Pedan_slider_${suffix}`,
          radial: 0.2,
          y: 0.16,
          kit: "pedanCylinder",
          params: { r: r * 0.07, h: r * 0.18 },
          material: "pedan_red",
        },
        {
          key: "poles",
          label: "分段相位场极靴",
          count: count - 16,
          parent: base,
          radial: 0.43,
          y: 0.47,
          kit: "pedanBox",
          params: { w: r * 0.26, h: r * 0.18, d: r * 0.18 },
          material: "pedan_violet",
        },
      ];
      for (const family of families) {
        const instanceNodes = Array.from({ length: family.count }, (_, j) => {
          const name = `Pedan_detail_${suffix}_${family.key}_${j}`;
          const angle = (j * Math.PI * 2) / family.count;
          nodes.push({
            name,
            parent: family.parent,
            pivot: [Math.cos(angle) * r * family.radial, r * family.y, Math.sin(angle) * r * family.radial],
            rest_rotation: [0, -THREE.MathUtils.radToDeg(angle), 0],
          });
          return name;
        });
        parts.push({
          id: mount.id.replace(/_mount$/, `_${family.key}`),
          name_cn: family.label,
          name_en: family.key,
          assembly: module,
          node: base,
          build_layer: 2,
          build_order: mount.build_order,
          geometry: { type: "kit", kit: family.kit, params: family.params },
          material: family.material,
          instances: family.count,
          indexed: true,
          instance_nodes: instanceNodes,
          mate: { type: "absolute", position: [0, 0, 0] },
          tags: ["internal", "pedan-detail"],
          source: "原创设备附件；安装于既有转子、执行芯和底座，尺寸从内壁约束设备半径派生",
        });
      }
    }
  }
}

const caches = new WeakMap<
  AssembledModel,
  {
    rigs: {
      node: THREE.Group;
      rest: THREE.Vector3;
      role: string;
      index: number;
      module: string;
      extent: number;
    }[];
    lights: { material: THREE.MeshStandardMaterial; channel: string }[];
  }
>();
export function updatePedanMachinery(model: AssembledModel, seconds: number, activity: PedanActivity): void {
  let cache = caches.get(model);
  if (!cache) {
    // 运动范围读取已注册几何尺寸，不复制几百个只供动画使用的参数到用户面板。
    const partsByNode = new Map(model.parts.filter((p) => p.def.node).map((p) => [p.def.node!, p]));
    const pipesByNode = new Map(
      model.parts
        .filter((p) => p.def.node && /(?:_pipe|optical_feedthrough)$/.test(p.def.name_en))
        .map((p) => [p.def.node!, p]),
    );
    const rigs = [...model.nodes.values()]
      .filter((node) => /^Pedan_(rotor|slider|spring|flow)_/.test(node.name))
      .map((node) => {
        let parent: THREE.Object3D | null = node.parent;
        while (parent && !parent.name.startsWith("Module_")) parent = parent.parent;
        const role = node.name.split("_")[1]!;
        const source = role === "flow" ? pipesByNode.get(node.parent!.name) : partsByNode.get(node.name);
        const geometry = source?.def.geometry;
        let extent = 0;
        if (geometry?.type === "kit" && geometry.params) {
          if (role === "flow") extent = Number(geometry.params.h);
          if (role === "slider")
            extent = Number(geometry.params.r) * (geometry.kit === "pedanCrystal" ? 0.5 : 0.18 / 0.28);
        }
        return {
          node,
          rest: new THREE.Vector3().setFromMatrixPosition(model.nodeRest.get(node.name)!),
          role,
          index: Number(node.name.split("_").at(-1)),
          module: parent?.name.slice(7) ?? "",
          extent,
        };
      });
    const lights: { material: THREE.MeshStandardMaterial; channel: string }[] = [];
    const seen = new Set<THREE.Material>();
    for (const part of model.parts) {
      if (typeof part.def.material !== "string" || !part.def.material.startsWith("pedan_power_")) continue;
      for (const material of Array.isArray(part.object.material)
        ? part.object.material
        : [part.object.material]) {
        if (material instanceof THREE.MeshStandardMaterial && !seen.has(material)) {
          seen.add(material);
          lights.push({ material, channel: part.def.material.slice(12) });
        }
      }
    }
    cache = { rigs, lights };
    caches.set(model, cache);
  }
  // 单一主轴相位：抬臂/合体位移改变相位，蓄能改变离心展开量；没有随机逐件抖动。
  const phase = seconds * 0.95 + activity.drive * 5.5;
  for (const { node, rest, role, index, module, extent } of cache.rigs) {
    const a = phase + (index * Math.PI) / 3;
    if (role === "rotor") node.rotation.y = (index % 2 ? -1 : 1) * phase + activity.charge * 0.7;
    if (role === "slider") node.position.y = rest.y + Math.sin(a) * extent;
    if (role === "spring") node.scale.y = 1 + 0.35 * Math.sin(a);
    if (role === "flow") {
      const energized = activity.yellow > 0 || activity.redModule === module || activity.charge > 0;
      const t =
        (((seconds * (energized ? 1.5 : 0.25) + index / (node.name.includes("_output_") ? 7 : 3)) % 1) + 1) %
        1;
      node.position.y = (t - 0.5) * extent * 0.88;
      node.scale.setScalar(energized ? 1.3 : 0.65);
    }
  }
  for (const { material, channel } of cache.lights)
    material.emissiveIntensity = pedanPower(seconds, channel, activity) * 2.2;
}
