import fs from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { buildModel } from "../src/three/parts";
import { makeKingJoeSkinRegistry } from "../src/three/parts/models/kingjoe-skin/registry";
import { kingjoeSkinBuilders } from "../src/three/parts/models/kingjoe-skin/kits";
import { KINGJOE_SKIN_MATERIALS } from "../src/three/parts/models/kingjoe-skin/materials";

// 下半身拆分：下半身 = 腿体飞船 (legs 总成，腿+髋鼓)；上半身 = 骨盆以上。
// 这是四体里 King Legs 的真实分界：髋部整体留在下半身，骨盆中柱归上半身。
// 不走平面切割：分组沿用源装甲的自然归属，髋鼓/骨盆中柱保留原有的互锁关系。
// 每组内部再按原材质分组，三角形/UV/材质原样保留。
const OUT = path.resolve(import.meta.dirname, "../src/three/parts/models/kingjoe-lower/lower.generated.json");

const registry = makeKingJoeSkinRegistry();
const model = buildModel(registry, { builders: kingjoeSkinBuilders, warnMissingLayout: false });
model.resetNodes();
model.syncInstances();
model.root.updateMatrixWorld(true);

const materialOrder = Object.keys(KINGJOE_SKIN_MATERIALS);
const materialIndex = new Map(materialOrder.map((name, index) => [name, index]));
const used = new Set(model.parts.map((handle) => handle.def.material));
for (const name of used) if (!materialIndex.has(name)) materialIndex.set(name, materialIndex.size);
const materials = [...materialIndex.keys()];

function merge(group: "lower" | "upper") {
  const buckets = new Map<string, { positions: number[]; normals: number[]; uvs: number[]; indices: number[] }>();
  let triangles = 0;
  for (const handle of model.parts) {
    const isLower = handle.def.assembly === "legs";
    if ((group === "lower") !== isLower) continue;
    const bucket =
      buckets.get(handle.def.material) ??
      { positions: [], normals: [], uvs: [], indices: [] };
    buckets.set(handle.def.material, bucket);
    const geometry = handle.geometry;
    const position = geometry.getAttribute("position");
    const normal = geometry.getAttribute("normal");
    const uv = geometry.getAttribute("uv");
    const index = geometry.index;
    triangles += ((index ? index.count : position.count) / 3) * handle.instances.length;
    const v = new THREE.Vector3();
    const n = new THREE.Vector3();
    for (const instance of handle.instances) {
      const matrix = model.instanceMatrix(handle, instance.index, new THREE.Matrix4());
      const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix);
      const vertexBase = bucket.positions.length / 3;
      for (let i = 0; i < position.count; i++) {
        v.fromBufferAttribute(position, i).applyMatrix4(matrix);
        bucket.positions.push(v.x, v.y, v.z);
        if (normal) {
          n.fromBufferAttribute(normal, i).applyMatrix3(normalMatrix).normalize();
          bucket.normals.push(n.x, n.y, n.z);
        } else bucket.normals.push(0, 1, 0);
        if (uv) bucket.uvs.push(uv.getX(i), uv.getY(i));
        else bucket.uvs.push(0, 0);
      }
      if (index) for (let i = 0; i < index.count; i++) bucket.indices.push(vertexBase + index.getX(i));
      else for (let i = 0; i < position.count; i++) bucket.indices.push(vertexBase + i);
    }
  }

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const groups: Array<{ material: string; start: number; count: number }> = [];
  for (const name of materials) {
    const bucket = buckets.get(name);
    if (!bucket || !bucket.indices.length) continue;
    const vertexOffset = positions.length / 3;
    positions.push(...bucket.positions);
    normals.push(...bucket.normals);
    uvs.push(...bucket.uvs);
    const start = indices.length;
    for (const index of bucket.indices) indices.push(index + vertexOffset);
    groups.push({ material: name, start, count: indices.length - start });
  }
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], positions[i + k]);
      max[k] = Math.max(max[k], positions[i + k]);
    }
  }
  const f32 = (array: number[]) => Buffer.from(new Float32Array(array).buffer).toString("base64");
  const u32 = (array: number[]) => Buffer.from(new Uint32Array(array).buffer).toString("base64");
  return {
    meta: { verts: positions.length / 3, tris: indices.length / 3, triangles, materials: groups.map((group) => group.material), groups, bbox: [...min, ...max] },
    geometry: { position: f32(positions), normal: f32(normals), uv: f32(uvs), index: u32(indices) },
  };
}

const lower = merge("lower");
const upper = merge("upper");

// 骨盆中柱的最低点：上身提起多少才能让中柱完全退出下半身髋腔。
let waistLow = Infinity;
const pelvisBox = new THREE.Box3();
for (const handle of model.parts) {
  if (handle.def.assembly !== "stomach" || !handle.partId.includes(".src_pelvis")) continue;
  if (!handle.geometry.boundingBox) handle.geometry.computeBoundingBox();
  for (const instance of handle.instances) {
    const matrix = model.instanceMatrix(handle, instance.index, new THREE.Matrix4());
    pelvisBox.copy(handle.geometry.boundingBox!).applyMatrix4(matrix);
    waistLow = Math.min(waistLow, pelvisBox.min.y);
  }
}

const output = {
  meta: {
    source: "King_Joe.glb / kingjoe-mesh.obj（个人参考，不商用）",
    split: "King Legs hip seam (legs assembly vs pelvis and up)",
    source_handles: model.parts.length,
    source_triangles: lower.meta.triangles + upper.meta.triangles,
    waist_low: waistLow,
    lower: lower.meta,
    upper: upper.meta,
    note: "下半身=腿体飞船（腿+髋鼓），上半身=骨盆以上；接缝沿用源髋部装甲边界，每组内按原材质分组，未焊接/布尔/重拓扑。",
  },
  parts: { lower: lower.geometry, upper: upper.geometry },
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(output));
console.log(
  `lower tris=${lower.meta.tris} materials=${lower.meta.materials.length}; upper tris=${upper.meta.tris} materials=${upper.meta.materials.length}; total=${output.meta.source_triangles}; waist_low=${waistLow.toFixed(3)} size=${(fs.statSync(OUT).size / 1024).toFixed(0)}KB`,
);
model.dispose();
