// 将设备放进真实内腔空区；器件有完整体积，软质虹彩连接只跨越相邻器件间的间隙。
import * as THREE from "three";
import type { MeshBVH } from "three-mesh-bvh";
import type { ModelRegistry, PartDefinition } from "../../registry/types";
import type { AssembledModel } from "../../assembler/assembler";
import type { PedanActivity } from "./machinery";
import data from "./pedan.generated.json";
import { addOrbitalCore } from "./orbital-cores";
import { CORE_MODES } from "./core-dynamics.mjs";
type V3 = [number, number, number];
export interface CavityDevice {
  owner: string;
  center: V3;
  radius: number;
  infill?: "head" | "foot" | "hand";
}
/** 原壳装配坐标下的末端区域；细采样补大网格遗漏的薄掌、脚尖与头侧。 */
export function cavityInfillRegion(owner: string, center: V3): CavityDevice["infill"] {
  if (owner === "head_arms" && Math.abs(center[0]) > 0.42 && center[1] > 5.2) return "head";
  if (owner === "legs" && center[1] < 0.68) return "foot";
  if (owner.startsWith("fore") && center[1] < 3.5) return "hand";
  return undefined;
}
let cachedPlan: CavityDevice[] | undefined;
const axes = [
  new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(-1, 0, 0),
  new THREE.Vector3(0, 1, 0),
  new THREE.Vector3(0, -1, 0),
  new THREE.Vector3(0, 0, 1),
  new THREE.Vector3(0, 0, -1),
];
/** 六向射线先碰内表面，并以最近壁距限制整个设备球；空腔之间不跨壳放置。 */
export function planCavityDevices(trees: Map<string, MeshBVH>): CavityDevice[] {
  if (cachedPlan) return cachedPlan;
  const planned: CavityDevice[] = [];
  for (const [owner, tree] of trees) {
    tree.geometry.computeBoundingBox();
    const bounds = tree.geometry.boundingBox!;
    const candidates: CavityDevice[] = [];
    const roomBoxes = data.rooms
      .filter((room) => room.owner === owner)
      .map((room) =>
        new THREE.Box3().setFromCenterAndSize(
          new THREE.Vector3(...(room.center as V3)),
          new THREE.Vector3(...(room.size as V3)).multiplyScalar(1.2),
        ),
      );
    // [OM-FREEPLAY] 大腔 0.20m、手臂 0.12m 网格采样；设备球上限 0.27m，先填最大的空区。
    const step = owner.startsWith("upper") || owner.startsWith("fore") ? 0.12 : 0.2;
    for (let x = bounds.min.x + step / 2; x < bounds.max.x; x += step)
      for (let y = bounds.min.y + step / 2; y < bounds.max.y; y += step)
        for (let z = bounds.min.z + step / 2; z < bounds.max.z; z += step) {
          const center = new THREE.Vector3(x, y, z);
          if (roomBoxes.some((b) => b.distanceToPoint(center) < step * 0.4)) continue;
          const clearance = tree.closestPointToPoint(center)!.distance;
          if (clearance < step * 0.42) continue;
          if (
            !axes.every((dir) => {
              const hit = tree.raycastFirst(new THREE.Ray(center, dir), THREE.DoubleSide);
              return hit && hit.face!.normal.dot(dir) < -0.0001;
            })
          )
            continue;
          candidates.push({ owner, center: center.toArray(), radius: Math.min(0.27, clearance * 0.88) });
        }
    candidates.sort((a, b) => b.radius - a.radius);
    const occupied: CavityDevice[] = [];
    for (const candidate of candidates) {
      const center = new THREE.Vector3(...candidate.center);
      if (
        occupied.some(
          (p) => center.distanceTo(new THREE.Vector3(...p.center)) < (candidate.radius + p.radius) * 1.02,
        )
      )
        continue;
      occupied.push(candidate);
    }
    // [OM-FREEPLAY] 保留已确认的大设备，在用户点名的末端空区二次填隙。
    // 剩余半径同时扣除已安装设备包络，不能整片覆盖或原位重叠凑密度。
    const fineStep = owner.startsWith("fore") ? 0.045 : 0.085;
    if (owner === "head_arms" || owner === "legs" || owner.startsWith("fore")) {
      const infill: CavityDevice[] = [];
      for (let x = bounds.min.x + fineStep / 2; x < bounds.max.x; x += fineStep)
        for (let y = bounds.min.y + fineStep / 2; y < bounds.max.y; y += fineStep)
          for (let z = bounds.min.z + fineStep / 2; z < bounds.max.z; z += fineStep) {
            const point: V3 = [x, y, z],
              region = cavityInfillRegion(owner, point);
            if (!region) continue;
            const center = new THREE.Vector3(...point);
            if (roomBoxes.some((b) => b.containsPoint(center))) continue;
            let radius = Math.min(0.23, tree.closestPointToPoint(center)!.distance * 0.86);
            for (const prior of occupied)
              radius = Math.min(
                radius,
                center.distanceTo(new THREE.Vector3(...prior.center)) - prior.radius - 0.006,
              );
            if (radius < (region === "hand" ? 0.026 : 0.05)) continue;
            if (
              !axes.every((dir) => {
                const hit = tree.raycastFirst(new THREE.Ray(center, dir), THREE.DoubleSide);
                return hit && hit.face!.normal.dot(dir) < -0.0001;
              })
            )
              continue;
            infill.push({ owner, center: point, radius, infill: region });
          }
      infill.sort((a, b) => b.radius - a.radius);
      for (const candidate of infill) {
        const center = new THREE.Vector3(...candidate.center);
        if (
          occupied.some(
            (p) => center.distanceTo(new THREE.Vector3(...p.center)) < candidate.radius + p.radius + 0.006,
          )
        )
          continue;
        occupied.push(candidate);
      }
    }
    planned.push(...occupied);
  }
  cachedPlan = planned;
  return planned;
}

export function addCavityDevices(
  trees: Map<string, MeshBVH>,
  parts: PartDefinition[],
  nodes: ModelRegistry["nodes"],
): void {
  const plan = planCavityDevices(trees);
  const capsuleCounts = new Map<string, number>();
  for (const [i, device] of plan.entries()) {
    const joint = data.joints.find((j) => j.key === device.owner),
      module = joint?.module ?? device.owner;
    const base = `Cavity_base_${i}`,
      rotor = `Cavity_spin_${i}`,
      r = device.radius;
    nodes.push({
      name: base,
      parent: joint ? `Joint_${device.owner}` : `Module_${module}`,
      pivot: device.center.map((n, k) => n - (joint?.pivot[k] ?? 0)) as V3,
    });
    nodes.push({ name: rotor, parent: base, motion: "rotate" });
    const add = (
      key: string,
      label: string,
      kit: string,
      params: Record<string, number>,
      material: string,
      node = base,
      position: V3 = [0, 0, 0],
      rotation: V3 = [0, 0, 0],
      scale?: V3,
    ) => {
      parts.push({
        id: `kingjoemodules.${module}.cavity_${i}_${key}`,
        name_cn: label,
        name_en: key,
        assembly: module,
        node,
        build_layer: 2,
        build_order: 40000 + i * 20 + (parts.length % 20),
        geometry: { type: "kit", kit, params },
        material,
        mate: { type: "absolute", position, rotation },
        scale,
        tags: ["internal", "cavity-device"],
        source: "原创空腔设备；整组尺寸受真实内壁最小距离约束",
      });
    };
    const family = i % 3;
    // [OM-FREEPLAY] 小于 9cm 的安装球保留紧凑晶核，避免伴核缩成不可辨的像素。
    const hasOrbit = family === 0 && r >= 0.09;
    // [OM-FREEPLAY] 每个区域约四台补隙设备保留一只场囊；公转设备露出轨道，手部仍用连续胶膜。
    const capsuleCandidate = Boolean(device.infill) && !device.owner.startsWith("fore");
    const capsuleIndex = capsuleCounts.get(device.owner) ?? 0;
    if (capsuleCandidate) capsuleCounts.set(device.owner, capsuleIndex + 1);
    if (capsuleCandidate && capsuleIndex % 4 === 0 && !hasOrbit) {
      add(
        "gel_capsule",
        "设备柔性场囊",
        "pedanGel",
        {},
        "pedan_gel",
        base,
        [0, 0, 0],
        [0, 0, 0],
        [r * 0.9, r * 1.6, r * 0.9],
      );
    }
    // 固态设备保留主体体积；多体反应堆腾出公转空间，由中央能量团与伴核共同占据。
    add(
      "body",
      hasOrbit
        ? "多体能量团内约束种子"
        : family === 0
          ? "多面场反应堆"
          : family === 1
            ? "脉冲储能罐"
            : "层叠相位运算体",
      family === 0 ? "pedanCrystal" : family === 1 ? "pedanCylinder" : "pedanBox",
      family === 0
        ? { r: r * (hasOrbit ? 0.07 : 0.72) }
        : family === 1
          ? { r: r * 0.5, h: r * 1.3 }
          : { w: r * 0.95, h: r * 1.3, d: r * 0.95 },
      family === 0 ? "pedan_violet" : family === 1 ? "pedan_chrome" : "pedan_ceramic",
      family === 0 ? rotor : base,
    );
    for (const side of [-1, 1]) {
      add(
        `cap_${side < 0 ? "a" : "b"}`,
        "场设备端部约束箍",
        "pedanRing",
        { r: r * 0.58, wire: r * 0.08 },
        "pedan_coil",
        base,
        [0, side * r * 0.5, 0],
        [90, 0, 0],
      );
      add(
        `lens_${side < 0 ? "a" : "b"}`,
        "端部能量晶面",
        "pedanCrystal",
        { r: r * 0.21 },
        "pedan_crystal",
        rotor,
        [0, side * r * 0.7, 0],
        [0, 0, 0],
        [1, 0.65, 1],
      );
    }
    // 不同设备分别带偏转叶片、储能瓶或散热层，层次占满半径但保持在安全球内。
    for (let j = 0; j < 8; j++) {
      const a = (j * Math.PI) / 4;
      const node = `Cavity_vane_${i}_${j}`;
      nodes.push({
        name: node,
        parent: family === 2 ? base : rotor,
        pivot: [Math.cos(a) * r * 0.7, 0, Math.sin(a) * r * 0.7],
        rest_rotation: [0, -j * 45, family === 0 ? 18 : 0],
      });
    }
    // 八个重复器件按材质合为两组实例，仍各自挂载节点、可逐个点选。
    for (let parity = 0; parity < 2; parity++) {
      add(
        `vanes_${parity}`,
        family === 1 ? "环列高压蓄能瓶" : family === 2 ? "外缘换热叠片" : "磁流偏转翼",
        family === 1 ? "pedanCylinder" : "pedanBox",
        // [OM-FREEPLAY] 实机近景中宽叶片遮住公转路径；仅多体设备收窄叶片，保留八片和外圈。
        family === 1
          ? { r: r * 0.11, h: r * 0.85 }
          : { w: r * (hasOrbit ? 0.12 : 0.24), h: r * (hasOrbit ? 0.5 : 0.65), d: r * 0.1 },
        parity ? "pedan_titanium" : "pedan_red",
      );
      Object.assign(parts[parts.length - 1], {
        instances: 4,
        indexed: true,
        instance_nodes: Array.from({ length: 4 }, (_, j) => `Cavity_vane_${i}_${j * 2 + parity}`),
      });
    }
    add(
      "equator",
      "赤道场约束环",
      "pedanRing",
      { r: r * 0.88, wire: r * 0.045 },
      "pedan_frame",
      rotor,
      [0, 0, 0],
      [90, 0, 0],
    );
    if (hasOrbit)
      addOrbitalCore(
        {
          key: `cavity_${i}`,
          parent: base,
          module,
          radius: r,
          seed: i,
          mode: CORE_MODES[Math.floor(i / 3) % CORE_MODES.length],
        },
        parts,
        nodes,
      );
  }
  // 器件间交换由 energy-exchange / hand-couplings 统一规划，避免旧胶桥叠在新光环上。
}

const cache = new WeakMap<
  AssembledModel,
  {
    spins: THREE.Object3D[];
    gels: { material: THREE.MeshStandardMaterial; time: { value: number }; charge: { value: number } }[];
  }
>();
export function updateCavityDevices(model: AssembledModel, seconds: number, activity: PedanActivity): void {
  let entry = cache.get(model);
  if (!entry) {
    const seen = new Set<THREE.Material>();
    const gels: NonNullable<ReturnType<typeof cache.get>>["gels"] = [];
    for (const p of model.parts.filter((p) => ["pedan_gel", "pedan_hand_gel"].includes(p.def.material))) {
      const material = p.object.material as THREE.MeshStandardMaterial;
      if (seen.has(material)) continue;
      seen.add(material);
      const time = { value: seconds },
        charge = { value: 0 };
      material.onBeforeCompile = (shader) => {
        shader.uniforms.gelTime = time;
        shader.uniforms.gelCharge = charge;
        shader.vertexShader = "uniform float gelTime; varying vec3 gelPoint;\n" + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
          gelPoint=position;
          float seal=pow(cos(position.y*3.14159265),2.0);
          transformed.xz *= 1.0+0.13*sin(position.y*15.0+gelTime*1.4)*seal;
          transformed.x += 0.12*sin(position.y*9.0-gelTime)*seal;
        `,
        );
        shader.fragmentShader =
          "uniform float gelTime; uniform float gelCharge; varying vec3 gelPoint;\n" + shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace(
          "#include <emissivemap_fragment>",
          `#include <emissivemap_fragment>
          float flow=gelPoint.y*9.0-gelTime*(0.55+gelCharge*1.8)+sin(gelPoint.x*3.0+gelPoint.z*4.0);
          // 青蓝薄膜带少量蓝紫流纹；颜色集中在能量连接，不扩散到结构金属。
          float ripple=0.5+0.5*sin(flow);
          vec3 film=mix(vec3(0.06,0.32,0.36),vec3(0.25,0.21,0.46),ripple*0.45);
          diffuseColor.rgb=mix(diffuseColor.rgb,film,0.6);
          diffuseColor.a*=0.58+0.34*pow(0.5+0.5*sin(flow*1.7),2.0);
          totalEmissiveRadiance+=film*(0.07+gelCharge*0.18);
        `,
        );
      };
      material.customProgramCacheKey = () => "pedan-fluid-field-v4";
      material.needsUpdate = true;
      gels.push({ material, time, charge });
    }
    entry = { spins: [...model.nodes.values()].filter((n) => n.name.startsWith("Cavity_spin_")), gels };
    cache.set(model, entry);
  }
  for (const [i, node] of entry.spins.entries())
    node.rotation.y = (i % 2 ? -1 : 1) * (seconds * 0.28 + activity.drive * 0.8);
  for (const gel of entry.gels) {
    gel.time.value = seconds;
    gel.charge.value = Math.max(activity.charge, activity.yellow);
  }
}
