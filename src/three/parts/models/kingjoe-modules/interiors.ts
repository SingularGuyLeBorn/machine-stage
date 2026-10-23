import * as THREE from "three";
import { MeshBVH } from "three-mesh-bvh";
import type { GeometryBuilder } from "../../assembler/geometry";
import type { ModelRegistry, PartDefinition, GeometrySpec } from "../../registry/types";
import data from "./pedan.generated.json";
import { addPedanDetailAssemblies, addPedanMachinery, powerMaterial } from "./machinery";
import { addCavityDevices, planCavityDevices } from "./cavity-devices";
import { addHandCouplings } from "./hand-couplings";
import { addEnergyExchange } from "./energy-exchange";
import { addJointDrives } from "./joint-drives";
import { CUFF } from "./joint-covers";
import { flexibleFrame } from "./flex-frame";
import { addOrbitalCore, orbitalMaterials } from "./orbital-cores";
import { CORE_MODES } from "./core-dynamics.mjs";

// 用户已批准的原创佩丹技术：磁约束能源、计算晶核、场调制器与悬浮线圈。
// [OM-FREEPLAY] 尺寸由实际壳内设备舱派生；配色、线圈匝数及支架布局为原创机械解释。
export const INTERIOR_MATERIALS: ModelRegistry["materials"] = {
  ...orbitalMaterials,
  // [OM-FREEPLAY] 内部试用钛灰／暗铜／青蓝与琥珀配色；外壳黄色金属独立保留。
  pedan_flex: {
    base: "#415963",
    metalness: 0.68,
    roughness: 0.38,
    emissive: "#48606b",
    emissiveIntensity: 0.03,
  },
  // [OM-FREEPLAY] 四组错相的低亮能量端环，避免全机齐闪；每一对仍严格同步。
  ...Object.fromEntries(
    ["#6e9da7", "#839fa9", "#b39b70", "#628999"].map((color, i) => [
      `pedan_exchange_${i}`,
      { base: color, metalness: 0.28, roughness: 0.42, emissive: color, emissiveIntensity: 0.2 },
    ]),
  ),
  pedan_hand_gel: {
    base: "#577f8a",
    metalness: 0.1,
    roughness: 0.38,
    opacity: 0.5,
    depthWrite: false,
    clearcoat: 0.35,
    clearcoatRoughness: 0.35,
  },
  pedan_hand_field: {
    base: "#547985",
    metalness: 0.35,
    roughness: 0.4,
    emissive: "#79a0aa",
    emissiveIntensity: 0.2,
  },
  pedan_hand_flow: {
    base: "#7ca7b2",
    metalness: 0.15,
    roughness: 0.45,
    emissive: "#709ba7",
    emissiveIntensity: 0.25,
    opacity: 0.46,
    depthWrite: false,
  },
  pedan_chrome: { base: "#a6afb3", metalness: 0.82, roughness: 0.32 },
  pedan_gel: {
    base: "#648d97",
    metalness: 0.18,
    roughness: 0.34,
    opacity: 0.38,
    depthWrite: false,
    clearcoat: 0.4,
    clearcoatRoughness: 0.3,
  },
  pedan_frame: { base: "#53616a", metalness: 0.78, roughness: 0.38 },
  pedan_coil: { base: "#9c7552", metalness: 0.8, roughness: 0.36 },
  pedan_ceramic: { base: "#26343b", metalness: 0.2, roughness: 0.52 },
  pedan_violet: { base: "#344d5c", metalness: 0.6, roughness: 0.34 },
  pedan_red: { base: "#795340", metalness: 0.65, roughness: 0.4 },
  pedan_titanium: { base: "#6d8590", metalness: 0.75, roughness: 0.34 },
  pedan_core: {
    base: "#78a7ad",
    metalness: 0.4,
    roughness: 0.2,
    emissive: "#6095a2",
    emissiveIntensity: 0.5,
  },
  pedan_crystal: {
    base: "#9dbac5",
    metalness: 0.35,
    roughness: 0.18,
    emissive: "#618eaa",
    emissiveIntensity: 0.4,
  },
};
for (const channel of ["brain", "modulator_l", "modulator_r", "legs", "pelvis", "chest", "head_arms"]) {
  const color = channel === "brain" ? "#c8a167" : channel.startsWith("modulator") ? "#83b6bc" : "#bd8c54";
  INTERIOR_MATERIALS[`pedan_power_${channel}`] = {
    base: color,
    emissive: color,
    emissiveIntensity: 0.6,
    metalness: 0.35,
    roughness: 0.2,
  };
}

/** 闭合螺旋弹簧：两端封口，真实螺旋线，不用一叠圆环代替。 */
function spring(radius: number, height: number, wire: number, turns: number): THREE.BufferGeometry {
  const segments = turns * 28,
    sides = 8;
  const positions: number[] = [],
    indices: number[] = [];
  const center = (t: number) =>
    new THREE.Vector3(
      radius * Math.cos(t * turns * Math.PI * 2),
      height * (t - 0.5),
      radius * Math.sin(t * turns * Math.PI * 2),
    );
  for (let i = 0; i <= segments; i++) {
    const t = i / segments,
      angle = t * turns * Math.PI * 2;
    const p = center(t),
      radial = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
    const tangent = new THREE.Vector3(
      -radius * turns * 2 * Math.PI * Math.sin(angle),
      height,
      radius * turns * 2 * Math.PI * Math.cos(angle),
    ).normalize();
    const across = tangent.clone().cross(radial).normalize();
    for (let j = 0; j < sides; j++) {
      const a = (j / sides) * Math.PI * 2,
        point = p
          .clone()
          .addScaledVector(radial, wire * Math.cos(a))
          .addScaledVector(across, wire * Math.sin(a));
      positions.push(...point.toArray());
      if (i < segments) {
        const k = i * sides + j,
          n = i * sides + ((j + 1) % sides);
        indices.push(k, n, k + sides, n, n + sides, k + sides);
      }
    }
  }
  for (const end of [0, segments]) {
    const cap = positions.length / 3;
    positions.push(...center(end / segments).toArray());
    for (let j = 0; j < sides; j++) {
      const a = end * sides + j,
        b = end * sides + ((j + 1) % sides);
      indices.push(...(end === 0 ? [cap, b, a] : [cap, a, b]));
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}
export const interiorBuilders: Record<string, GeometryBuilder> = {
  pedanMembrane: () => {
    const geometry = new THREE.SphereGeometry(1, 20, 24).scale(1, 0.5, 1);
    const p = geometry.getAttribute("position");
    for (let i = 0; i < p.count; i++) {
      const waist = 0.64 + 0.3 * Math.abs(p.getY(i) * 2);
      p.setX(i, p.getX(i) * waist);
      p.setZ(i, p.getZ(i) * waist);
    }
    geometry.computeVertexNormals();
    return geometry;
  },
  pedanMicroArc: (spec) => {
    const { length, width } = (spec as { params: Record<string, number> }).params;
    // 用封端细管弯成短折电流，仍满足项目的实际渲染几何闭合检查。
    const geometry = new THREE.CylinderGeometry(0.0014, 0.0014, length, 6, 18).translate(0, length / 2, 0);
    const p = geometry.getAttribute("position");
    for (let i = 0; i < p.count; i++) {
      const t = p.getY(i) / length,
        seal = Math.sin(Math.PI * t);
      p.setX(i, p.getX(i) + Math.sin(t * 31) * width * 0.18 * seal);
      p.setZ(i, p.getZ(i) + Math.sin(t * 49) * width * 0.12 * seal);
    }
    geometry.computeVertexNormals();
    return geometry;
  },
  pedanCuff: (spec) => {
    const p = (spec as { params: Record<string, number> }).params;
    // 关节叠层护套沿两端连接面连续弯折；保留肩肘的原护甲，不挖球座。
    // 闭合波纹短套筒：鼓起的圆棱与收口相接，叠成类似腿部的一圈圈弹性护套。
    const profile = [
      [p.inner ?? 0.74, -0.026],
      [0.87, -0.026],
      [0.9, -0.018],
      [1.0, -0.01],
      [1.04, -0.003],
      [1.04, 0.003],
      [1.0, 0.01],
      [0.9, 0.018],
      [0.87, 0.026],
      [p.inner ?? 0.74, 0.026],
      [p.inner ?? 0.74, -0.026],
    ];
    const geometry = new THREE.LatheGeometry(
      profile.map(([r, y]) => new THREE.Vector2(r!, y!)),
      48,
    ).scale(p.rx, 1, p.rz);
    const positions = geometry.getAttribute("position"),
      index = geometry.index!,
      indices: number[] = [];
    const a = new THREE.Vector3(),
      b = new THREE.Vector3(),
      c = new THREE.Vector3();
    for (let i = 0; i < index.count; i += 3) {
      const ids = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
      a.fromBufferAttribute(positions, ids[0]!);
      b.fromBufferAttribute(positions, ids[1]!);
      c.fromBufferAttribute(positions, ids[2]!);
      if (b.sub(a).cross(c.sub(a)).length() > 1e-12) indices.push(...ids);
    }
    geometry.setIndex(indices);
    return geometry;
  },
  pedanBall: (spec) =>
    new THREE.SphereGeometry(Number((spec as { params: Record<string, number> }).params.r), 20, 16),
  pedanGel: () => {
    const geometry = new THREE.LatheGeometry(
      [
        [0, -0.5],
        [0.55, -0.48],
        [0.88, -0.38],
        [0.63, -0.2],
        [0.45, 0],
        [0.56, 0.18],
        [0.84, 0.36],
        [0.58, 0.48],
        [0, 0.5],
      ].map(([r, y]) => new THREE.Vector2(r, y)),
      20,
    );
    // 轴心环在 LatheGeometry 中会产生退化面；滤掉后端点仍由三角扇封闭。
    const p = geometry.getAttribute("position"),
      index = geometry.index!,
      kept: number[] = [];
    const a = new THREE.Vector3(),
      b = new THREE.Vector3(),
      c = new THREE.Vector3();
    for (let i = 0; i < index.count; i += 3) {
      const ids = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
      a.fromBufferAttribute(p, ids[0]);
      b.fromBufferAttribute(p, ids[1]);
      c.fromBufferAttribute(p, ids[2]);
      if (b.sub(a).cross(c.sub(a)).length() > 1e-12) kept.push(...ids);
    }
    geometry.setIndex(kept);
    return geometry;
  },
  pedanBox: (spec) => {
    const p = (spec as { params: Record<string, number> }).params;
    return new THREE.BoxGeometry(p.w, p.h, p.d);
  },
  pedanCylinder: (spec) => {
    const p = (spec as { params: Record<string, number> }).params;
    return new THREE.CylinderGeometry(p.r, p.r, p.h, 32);
  },
  pedanSpring: (spec) => {
    const p = (spec as { params: Record<string, number> }).params;
    return spring(p.r, p.h, p.wire, p.turns);
  },
  pedanRing: (spec) => {
    const p = (spec as { params: Record<string, number> }).params;
    return new THREE.TorusGeometry(p.r, p.wire, 10, 48);
  },
  pedanCrystal: (spec) => {
    const p = (spec as { params: Record<string, number> }).params;
    return new THREE.OctahedronGeometry(p.r);
  },
};

export function makeInteriors(): Pick<ModelRegistry, "parts" | "nodes" | "constants" | "expectedContacts"> {
  const parts: PartDefinition[] = [],
    nodes: ModelRegistry["nodes"] = [],
    constants: ModelRegistry["constants"] = {};
  // 从真实内壁定位设备安装柱；柱的长度由设备端面到内壁的距离决定。
  const wallTrees = new Map(
    data.parts.map((part) => {
      const geometry = new THREE.BufferGeometry();
      const decode = (encoded: string) => Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0)).buffer;
      geometry.setAttribute(
        "position",
        new THREE.BufferAttribute(new Float32Array(decode(part.position)), 3),
      );
      geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(decode(part.index)), 1));
      return [part.key, new MeshBVH(geometry)] as const;
    }),
  );
  for (const room of data.rooms) {
    const joint = data.joints.find((j) => j.key === room.owner);
    const module = joint?.module ?? room.owner;
    const parent = joint ? `Joint_${room.owner}` : `Module_${room.owner}`;
    const pivot = joint?.pivot ?? [0, 0, 0];
    const node = `Room_${room.key}`;
    nodes.push({
      name: node,
      parent,
      pivot: room.center.map((n, i) => n - pivot[i]) as [number, number, number],
    });
    const [w, h, d] = room.size;
    const prefix = `PEDAN_${room.key.toUpperCase()}`;
    constants[`${prefix}_W`] = String(w);
    constants[`${prefix}_H`] = String(h);
    constants[`${prefix}_D`] = String(d);
    addPedanMachinery(room, wallTrees.get(room.owner)!, parts, nodes);
    let serial = 0;
    const add = (
      name: string,
      label: string,
      geometry: GeometrySpec,
      material: string,
      at: [number, number, number],
      rot: [number, number, number] = [0, 0, 0],
    ) => {
      if (geometry.type === "box")
        geometry = { type: "kit", kit: "pedanBox", params: { w: geometry.w, h: geometry.h, d: geometry.d } };
      if (geometry.type === "cylinder")
        geometry = { type: "kit", kit: "pedanCylinder", params: { r: geometry.r, h: geometry.h } };
      let movingNode = node;
      if (name === "crystal" || name.startsWith("constraint_")) {
        movingNode = `Pedan_rotor_${room.key}_main_${name === "crystal" ? 3 : name.split("_").at(-1)}`;
        nodes.push({ name: movingNode, parent: node, motion: "rotate" });
      }
      parts.push({
        id: `kingjoemodules.${module}.internal_${room.key}_${name}`,
        name_cn: label,
        name_en: name,
        assembly: module,
        node: movingNode,
        build_layer: 2,
        build_order: 10 + parts.length,
        geometry,
        material,
        mate: { type: "absolute", position: at, rotation: rot },
        tags: ["internal"],
        source: "用户批准的原创佩丹技术结构；设备舱经实体包含检查",
      });
      serial++;
    };
    const bar = Math.min(w, h, d) * 0.055;
    // 四根纵向承力轨连接前后端框，设备、弹簧和导线均有安装落点。
    for (const x of [-1, 1])
      for (const z of [-1, 1])
        add(
          `rail_${serial}`,
          "设备舱承力轨",
          { type: "box", w: bar, h: h * 0.9 - 2 * bar, d: bar },
          "pedan_frame",
          [x * (w * 0.44 - bar / 2), 0, z * (d * 0.44 - bar / 2)],
        );
    for (const y of [-1, 1]) {
      add(
        `end_frame_${serial}`,
        "设备舱安装端板",
        { type: "box", w: w * 0.88, h: bar, d: d * 0.88 },
        "pedan_ceramic",
        [0, y * (h * 0.45 - bar / 2), 0],
      );
      for (const x of [-1, 1]) {
        const wire = bar * 0.22;
        const inner = h * 0.2,
          outer = h * 0.45 - bar - wire;
        add(
          `spring_${serial}`,
          "预紧减振螺旋弹簧",
          {
            type: "kit",
            kit: "pedanSpring",
            params: { r: Math.min(w, d) * 0.075, h: outer - inner, wire, turns: 5 },
          },
          "pedan_coil",
          [x * w * 0.29, (y * (outer + inner)) / 2, 0],
        );
        add(
          `seat_${serial}`,
          "弹簧内侧承压座",
          { type: "cylinder", r: Math.min(w, d) * 0.075 + wire, h: bar * 0.6 },
          "pedan_frame",
          [x * w * 0.29, y * (inner - wire - bar * 0.3), 0],
        );
        const root = new THREE.Vector3(
          room.center[0] + x * w * 0.29,
          room.center[1] + y * h * 0.45,
          room.center[2],
        );
        const hit = wallTrees
          .get(room.owner)!
          .raycastFirst(new THREE.Ray(root, new THREE.Vector3(0, y, 0)), THREE.DoubleSide);
        const span = Math.max(0.001, (hit?.distance ?? h * 0.05) - 0.001);
        add(
          `anchor_${serial}`,
          "设备至内壁承力安装柱",
          { type: "box", w: bar, h: span, d: bar },
          "pedan_frame",
          [x * w * 0.29, y * (h * 0.45 + span / 2), 0],
        );
      }
    }
    const electronics = room.key === "brain" || room.key.startsWith("modulator") || room.key === "energy";
    if (electronics) {
      const r = Math.min(w, h, d) * 0.19;
      add(
        "crystal",
        room.key === "brain" ? "佩丹计算晶核" : "磁约束能量晶核",
        { type: "kit", kit: "pedanCrystal", params: { r: r * 0.12 } },
        powerMaterial(room.key, module),
        [0, 0, 0],
      );
      const seed = 400 + data.rooms.indexOf(room);
      addOrbitalCore(
        {
          key: `room_${room.key}`,
          parent: node,
          module,
          radius: r * 1.5,
          seed,
          mode: CORE_MODES[seed % CORE_MODES.length],
        },
        parts,
        nodes,
      );
      for (let ring = 0; ring < 3; ring++)
        add(
          `constraint_${ring}`,
          room.key === "brain" ? "三轴晶核悬置环" : "佩丹场约束线圈",
          { type: "kit", kit: "pedanRing", params: { r: r * (1 + ring * 0.18), wire: bar * 0.28 } },
          "pedan_coil",
          [0, 0, 0],
          [ring === 1 ? 90 : 0, ring === 2 ? 90 : 0, 0],
        );
      for (const side of [-1, 1]) {
        add(
          `bus_${side < 0 ? "l" : "r"}`,
          "绝缘配电母排",
          { type: "box", w: bar, h: h * 0.5, d: d * 0.1 },
          "pedan_coil",
          [side * w * 0.36, 0, -d * 0.17],
        );
        for (let i = 0; i < 5; i++)
          add(
            `optic_${side < 0 ? "l" : "r"}_${i}`,
            "分层能量导光晶片",
            { type: "box", w: w * 0.16, h: bar * 0.6, d: d * 0.21 },
            "pedan_crystal",
            [side * w * 0.25, (i - 2) * h * 0.065, d * 0.23],
          );
      }
    } else {
      const r = Math.min(w, d) * 0.16;
      add(
        "shaft",
        "直线执行器导向轴",
        { type: "cylinder", r: r * 0.28, h: h * 0.62 },
        "pedan_frame",
        [0, 0, 0],
      );
      add(
        "stator",
        "电磁执行器定子套",
        { type: "tube", rOuter: r, rInner: r * 0.7, h: h * 0.25 },
        "pedan_ceramic",
        [0, 0, 0],
      );
      add(
        "return_spring",
        "执行器复位螺旋弹簧",
        { type: "kit", kit: "pedanSpring", params: { r: r * 0.52, h: h * 0.58, wire: bar * 0.22, turns: 9 } },
        "pedan_coil",
        [0, 0, 0],
      );
      for (let i = 0; i < 3; i++)
        add(
          `field_${i}`,
          room.key.startsWith("drive") ? "佩丹悬浮场磁极环" : "执行器励磁线圈",
          { type: "kit", kit: "pedanRing", params: { r: r * 1.35, wire: bar * 0.3 } },
          "pedan_coil",
          [0, (i - 1) * h * 0.11, 0],
          [90, 0, 0],
        );
    }
    // 后侧冷却管、独立散热片，前侧保留观察空间。
    for (const side of [-1, 1])
      add(
        `cooling_${side < 0 ? "l" : "r"}`,
        "闭路冷却管",
        { type: "tube", rOuter: bar * 0.55, rInner: bar * 0.36, h: h * 0.7 },
        "pedan_frame",
        [side * w * 0.27, 0, -d * 0.3],
      );
    for (let i = 0; i < 6; i++)
      add(
        `fin_${i}`,
        "冷却回路散热片",
        { type: "box", w: w * 0.46, h: bar * 0.45, d: bar * 1.6 },
        "pedan_frame",
        [0, (i - 2.5) * h * 0.08, -d * 0.34],
      );
  }
  // 贴壳横肋、纵梁直接由内壁实体求交生成，外侧与壳体内表面吻合。
  // 不用放大盒子凑近外壳，不在原外表面挖球形凹坑。
  for (const piece of data.structure) {
    const joint = data.joints.find((j) => j.key === piece.owner);
    const module = joint?.module ?? piece.owner;
    parts.push({
      id: `kingjoemodules.${module}.internal_${piece.key}`,
      name_cn: piece.kind === "rib" ? "随形贴壳加强肋" : "贴壳纵向承力梁",
      name_en: piece.key,
      assembly: module,
      node: joint ? `Joint_${piece.owner}` : `Module_${piece.owner}`,
      build_layer: 2,
      build_order: 10 + parts.length,
      geometry: { type: "kit", kit: `kjModule_${piece.key}` },
      material: piece.kind === "rib" ? "pedan_frame" : "pedan_coil",
      mate: {
        type: "absolute",
        position: (joint?.pivot ?? [0, 0, 0]).map((v) => -v) as [number, number, number],
      },
      tags: ["internal"],
      source: "原外壳向内保留 25mm 壁厚；28mm 随形加强肋和 26mm 纵梁，原创内部结构",
    });
    if (flexibleFrame.has(piece.key)) {
      parts.push({
        id: `kingjoemodules.${module}.flex_${piece.key}`,
        name_cn: "骨架分段柔性褶皱接头",
        name_en: `flex_${piece.key}`,
        assembly: module,
        node: joint ? `Joint_${piece.owner}` : `Module_${piece.owner}`,
        build_layer: 2,
        build_order: 10 + parts.length,
        geometry: { type: "kit", kit: `kjFlex_${piece.key}` },
        material: "pedan_flex",
        mate: {
          type: "absolute",
          position: (joint?.pivot ?? [0, 0, 0]).map((v) => -v) as [number, number, number],
        },
        tags: ["internal", "flex-frame"],
        source: "原随形骨架短段实体切分，五道褶皱与收腰芯连接硬段；端部锁定的展示用微形变",
      });
    }
  }
  addPedanDetailAssemblies(parts, nodes);
  addCavityDevices(wallTrees, parts, nodes);
  addHandCouplings(planCavityDevices(wallTrees), parts, nodes);
  addJointDrives(parts, nodes);
  addEnergyExchange(planCavityDevices(wallTrees), parts, nodes);
  for (const joint of data.joints) {
    const shoulder = joint.key.startsWith("upper");
    for (let i = 0; i < CUFF.layers; i++) {
      const node = `Cuff_${joint.key}_${i}`;
      nodes.push({
        name: node,
        parent: "Module_head_arms",
        pivot: [
          joint.key.endsWith("l") ? -(shoulder ? 0.87 : 1.25) : shoulder ? 0.87 : 1.25,
          shoulder ? 4.96 : 4.02,
          0.02,
        ],
        motion: "rotate",
      });
      parts.push({
        id: `kingjoemodules.head_arms.internal_${joint.key}_cuff_${i}`,
        name_cn: shoulder ? "肩部柔性叠层护套" : "肘部柔性叠层护套",
        name_en: node,
        assembly: "head_arms",
        node,
        build_layer: 3,
        build_order: 20 + parts.length,
        geometry: {
          type: "kit",
          kit: "pedanCuff",
          params: {
            rx: (shoulder ? CUFF.shoulder : CUFF.elbow).rx,
            rz: (shoulder ? CUFF.shoulder : CUFF.elbow).rz,
            inner: 0.55,
          },
        },
        material: "kjr_silver",
        mate: { type: "absolute", position: [0, 0, 0] },
        // 护套是外观可见的连接结构，不能标 internal，否则普通模式会隐藏并露出断口。
        tags: ["joint-cover"],
        source: "原创关节柔性护套；叠层沿肩肘两端连续转动，覆盖运动间隙",
      });
    }
  }
  // 膝部沿原模型波纹带（1.57–1.86m）设置独立护套层；未来膝轴驱动只需更新节点姿态。
  // 护套是黄色金属弹性薄壁，不能并入内部设备剔除规则，也不把它当刚性碰撞体。
  for (const side of [-1, 1]) {
    const suffix = side < 0 ? "l" : "r";
    nodes.push({
      name: `KneeCover_${suffix}`,
      parent: "Module_legs",
      pivot: [side * 0.6, 1.715, -0.15],
      motion: "rotate",
    });
    for (let i = 0; i < 11; i++) {
      const node = `Cuff_knee_${suffix}_${i}`;
      nodes.push({
        name: node,
        parent: `KneeCover_${suffix}`,
        pivot: [0, (i - 5) * 0.029, 0],
        motion: "rotate",
      });
      parts.push({
        id: `kingjoemodules.legs.knee_${suffix}_cuff_${i}`,
        name_cn: "膝部金属波纹柔性护套",
        name_en: node,
        assembly: "legs",
        node,
        build_layer: 3,
        build_order: 20 + parts.length,
        geometry: { type: "kit", kit: "pedanCuff", params: { rx: 0.4, rz: 0.43 } },
        material: "kjr_silver",
        mate: { type: "absolute", position: [0, 0, 0] },
        tags: ["joint-cover"],
        source: "原膝波纹带位置；原创金属柔性套，预留分层弯折节点",
      });
    }
  }
  const expectedContacts = data.rooms.map((room) => {
    const module = data.joints.find((j) => j.key === room.owner)?.module ?? room.owner;
    const prefix = `kingjoemodules.${module}.internal_${room.key}`;
    return {
      family: "equipment_frame",
      a: `${prefix}_rail*`,
      b: `${prefix}_end_frame*`,
      reason: "承力轨端面与端板内面共面贴合，非体积穿插",
      maxDepthMm: 0.1,
      allowSuspect: true,
    };
  });
  for (const room of data.rooms) {
    const module = data.joints.find((j) => j.key === room.owner)?.module ?? room.owner;
    const prefix = `kingjoemodules.${module}.internal_${room.key}`;
    for (const [a, b] of [
      [`${prefix}_spring*`, `${prefix}_seat*`],
      [`${prefix}_spring*`, `${prefix}_end_frame*`],
      [`${prefix}_anchor*`, `${prefix}_end_frame*`],
      [
        `${prefix}_anchor*`,
        `kingjoemodules.${module}.${data.joints.some((j) => j.key === room.owner) ? room.owner : "body"}`,
      ],
    ])
      expectedContacts.push({
        family: "equipment_seat",
        a,
        b,
        reason: "弹簧端圈、承压座及壳体安装柱的设计接触面",
        maxDepthMm: 0.2,
        allowSuspect: true,
      });
  }
  for (const tree of wallTrees.values()) tree.geometry.dispose();
  return { parts, nodes, constants, expectedContacts };
}
