// 中心呼吸能量团、分层公转伴核与短时电流；所有运动保持在原设备安全球内。
import * as THREE from "three";
import type { ModelRegistry, PartDefinition } from "../../registry/types";
import type { AssembledModel } from "../../assembler/assembler";
import type { GeometryBuilder } from "../../assembler/geometry";
import { CORE_MODES, coreBreath, sampleCore, type CoreMode } from "./core-dynamics.mjs";
import type { PedanActivity } from "./machinery";

export interface CoreRig {
  key: string;
  parent: string;
  module: string;
  radius: number;
  seed: number;
  mode: CoreMode;
}
export function addOrbitalCore(rig: CoreRig, parts: PartDefinition[], nodes: ModelRegistry["nodes"]): void {
  const base = `OrbitCore_${rig.key}`;
  // 半径与种子记录在中央件的几何参数中；动画不覆写组节点，整体随原设备移动。
  nodes.push({ name: base, parent: rig.parent, motion: "rotate" });
  const center = `${base}_center`;
  nodes.push({ name: center, parent: base, motion: "scalar" });
  const sample = sampleCore(0, rig.seed, rig.mode);
  const add = (
    key: string,
    label: string,
    node: string,
    kit: string,
    params: Record<string, number>,
    material: string,
  ) => {
    const part: PartDefinition = {
      id: `kingjoemodules.${rig.module}.orbit_${rig.key}_${key}`,
      name_cn: label,
      name_en: key,
      assembly: rig.module,
      node,
      build_layer: 2,
      build_order: 47500 + parts.length,
      geometry: { type: "kit", kit, params },
      material,
      mate: { type: "absolute", position: [0, 0, 0] },
      tags: ["internal", "orbital-core"],
      source: "原创佩丹多体核心；有界准周期展示轨迹，非真实引力仿真",
    };
    parts.push(part);
    return part;
  };
  const nucleus = add(
    "plasma",
    "呼吸脉动的中央能量团",
    center,
    "pedanPlasma",
    { r: rig.radius * 0.16, seed: rig.seed, mode: CORE_MODES.indexOf(rig.mode), envelope: rig.radius },
    `pedan_orbit_core_${rig.seed % 4}`,
  );
  nucleus.source += `；供能模块 ${rig.module}`;
  add(
    "haze",
    "能量团柔光外晕",
    center,
    "pedanPlasma",
    { r: rig.radius * 0.19, seed: rig.seed },
    "pedan_orbit_haze",
  );
  const satellites = sample.bodies.map((_, i) => {
    const node = `${base}_body_${i}`;
    nodes.push({ name: node, parent: base, motion: "translate" });
    return node;
  });
  for (let parity = 0; parity < 2; parity++) {
    const instances = satellites.filter((_, i) => i % 2 === parity);
    const part = add(
      `satellites_${parity}`,
      rig.mode === "hierarchy" ? "双星组合伴随核心" : "变速公转伴随核心",
      instances[0],
      "pedanCrystal",
      { r: rig.radius * sample.bodies[0].radius },
      parity ? "pedan_orbit_satellite" : "pedan_violet",
    );
    if (instances.length > 1)
      Object.assign(part, { instances: instances.length, indexed: true, instance_nodes: instances });
  }
  const arc = `${base}_arc`;
  nodes.push({ name: arc, parent: base, motion: "scalar" });
  add("arc", "核心间偶发细电流", arc, "pedanMicroArc", { length: 1, width: 0.18 }, "pedan_orbit_arc");
}

// [OM-FREEPLAY] 四组低亮色相、透明度与粒面参数为原创视觉选择；黄色金属外壳不受影响。
export const orbitalMaterials: ModelRegistry["materials"] = {
  ...Object.fromEntries(
    ["#7acbb8", "#d9b975", "#aa8cda", "#77bcd8"].map((color, i) => [
      `pedan_orbit_core_${i}`,
      {
        base: color,
        emissive: color,
        emissiveIntensity: 0.4,
        opacity: 0.82,
        depthWrite: false,
        metalness: 0.08,
        roughness: 0.38,
      },
    ]),
  ),
  pedan_orbit_haze: {
    base: "#72afa7",
    emissive: "#669c94",
    emissiveIntensity: 0.15,
    opacity: 0.12,
    depthWrite: false,
    metalness: 0.05,
    roughness: 0.6,
  },
  pedan_orbit_satellite: {
    base: "#78b3b3",
    emissive: "#528f8e",
    emissiveIntensity: 0.24,
    metalness: 0.58,
    roughness: 0.3,
  },
  pedan_orbit_arc: {
    base: "#acd4c9",
    emissive: "#82baa9",
    emissiveIntensity: 0.55,
    opacity: 0.55,
    depthWrite: false,
    metalness: 0.05,
    roughness: 0.5,
  },
};
export const orbitalBuilders: Record<string, GeometryBuilder> = {
  pedanPlasma: (spec) => {
    const r = (spec as { params: Record<string, number> }).params.r;
    const geometry = new THREE.IcosahedronGeometry(r, 2);
    const position = geometry.getAttribute("position");
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i) / r,
        y = position.getY(i) / r,
        z = position.getZ(i) / r;
      const wobble = 0.94 + 0.045 * Math.sin(x * 6 + z * 3) * Math.cos(y * 5 - x * 2);
      position.setXYZ(i, x * r * wobble, y * r * wobble, z * r * wobble);
    }
    geometry.computeVertexNormals();
    return geometry;
  },
};

const cache = new WeakMap<
  AssembledModel,
  {
    rigs: { rig: CoreRig; center: THREE.Object3D; bodies: THREE.Object3D[]; arc: THREE.Object3D }[];
    time: { value: number };
    materials: { material: THREE.MeshStandardMaterial; phase: number }[];
  }
>();
export function updateOrbitalCores(model: AssembledModel, time: number, activity: PedanActivity): void {
  let entry = cache.get(model);
  if (!entry) {
    const clock = { value: time };
    const rigs = model.parts
      .filter((p) => p.def.tags?.includes("orbital-core") && p.def.name_en === "plasma")
      .map((part) => {
        const params = (part.def.geometry as { params: Record<string, number> }).params;
        const center = model.getNode(part.def.node!)!;
        const base = center.parent!;
        const mode = CORE_MODES[params.mode];
        const rig: CoreRig = {
          key: base.name.slice(10),
          parent: base.parent!.name,
          module: part.def.assembly,
          radius: params.envelope,
          seed: params.seed,
          mode,
        };
        return {
          rig,
          center,
          bodies: sampleCore(0, rig.seed, mode).bodies.map((_, i) =>
            model.getNode(`${base.name}_body_${i}`)!,
          ),
          arc: model.getNode(`${base.name}_arc`)!,
        };
      });
    const seen = new Set<THREE.Material>();
    const materials: { material: THREE.MeshStandardMaterial; phase: number }[] = [];
    for (const part of model.parts) {
      if (!part.def.material.startsWith("pedan_orbit_core_")) continue;
      const material = part.object.material as THREE.MeshStandardMaterial;
      if (seen.has(material)) continue;
      seen.add(material);
      materials.push({ material, phase: Number(part.def.material.slice(-1)) });
      material.onBeforeCompile = (shader) => {
        shader.uniforms.orbitTime = clock;
        shader.vertexShader = "varying vec3 plasmaPoint;\n" + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace(
          "#include <begin_vertex>",
          "#include <begin_vertex>\n plasmaPoint=normalize(position);",
        );
        shader.fragmentShader =
          "uniform float orbitTime; varying vec3 plasmaPoint;\n" + shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace(
          "#include <emissivemap_fragment>",
          `#include <emissivemap_fragment>
           float cloud=.5+.5*sin(plasmaPoint.x*9.+orbitTime*.9+sin(plasmaPoint.y*7.-orbitTime*.6)+plasmaPoint.z*5.);
           diffuseColor.a*=.45+.55*cloud;
           totalEmissiveRadiance*=.65+.35*cloud;`,
        );
      };
      material.customProgramCacheKey = () => "pedan-orbital-plasma-v1";
      material.needsUpdate = true;
    }
    entry = { rigs, time: clock, materials };
    cache.set(model, entry);
  }
  entry.time.value = time;
  for (const { rig, center, bodies, arc } of entry.rigs) {
    const sample = sampleCore(time, rig.seed, rig.mode);
    center.scale.setScalar(sample.coreScale);
    center.rotation.set(time * 0.17, -time * 0.23, time * 0.09);
    for (const [i, body] of bodies.entries()) {
      body.position.set(...sample.bodies[i].position).multiplyScalar(rig.radius);
      body.rotation.set(...sample.bodies[i].spin);
    }
    const from = sample.source < 0 ? new THREE.Vector3() : bodies[sample.source].position.clone();
    const to = bodies[sample.target].position;
    const direction = to.clone().sub(from);
    arc.position.copy(from);
    arc.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());
    arc.scale.set(
      Math.max(0.00001, sample.arc) * rig.radius * 3,
      direction.length(),
      Math.max(0.00001, sample.arc) * rig.radius * 3,
    );
  }
  // 四组共享材质和中心缩放采用同一呼吸相位；发射只增强功率，不改 time 乘数造成轨道跳变。
  const energized = Math.max(activity.charge, activity.yellow, activity.redModule ? 0.5 : 0);
  for (const { material, phase } of entry.materials)
    material.emissiveIntensity = 0.08 + 0.75 * coreBreath(time, phase) + energized * 0.25;
  // 主灯窗仍由原有 power 通道控制；这里只读取同一活动输入，不覆盖胸窗呼吸曲线。
}
