import fs from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { buildModel } from "../src/three/parts";
import { makeKingJoeSkinRegistry } from "../src/three/parts/models/kingjoe-skin/registry";
import { kingjoeSkinBuilders } from "../src/three/parts/models/kingjoe-skin/kits";
import { KINGJOE_SKIN_MATERIALS } from "../src/three/parts/models/kingjoe-skin/materials";

// 把 578 源件 + 21 个叠加细节按原三角形/UV/材质合并为 1 个几何。
// 不焊接顶点、不做布尔/体素重拓扑：每个源件的三角形原样保留，
// 只是从 615 个 Mesh 收进 1 个带材质 group 的 BufferGeometry。

const OUT = path.resolve(import.meta.dirname, "../src/three/parts/models/kingjoe-whole/whole.generated.json");

const registry = makeKingJoeSkinRegistry();
const model = buildModel(registry, { builders: kingjoeSkinBuilders, warnMissingLayout: false });
model.resetNodes();
model.syncInstances();
model.root.updateMatrixWorld(true);

const used = new Set(model.parts.map((handle) => handle.def.material));
const materials = [
  ...Object.keys(KINGJOE_SKIN_MATERIALS).filter((name) => used.has(name)),
  ...[...used].filter((name) => !(name in KINGJOE_SKIN_MATERIALS)),
];
const buckets = new Map<
  string,
  { positions: number[]; normals: number[]; uvs: number[]; indices: number[] }
>();
for (const name of materials) buckets.set(name, { positions: [], normals: [], uvs: [], indices: [] });

const v = new THREE.Vector3();
const n = new THREE.Vector3();
let sourceTriangles = 0;
for (const handle of model.parts) {
  const bucket = buckets.get(handle.def.material)!;
  const geometry = handle.geometry;
  const position = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  const uv = geometry.getAttribute("uv");
  const index = geometry.index;
  const triangleCount = (index ? index.count : position.count) / 3;
  sourceTriangles += triangleCount * handle.instances.length;
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
      } else {
        bucket.normals.push(0, 1, 0);
      }
      if (uv) bucket.uvs.push(uv.getX(i), uv.getY(i));
      else bucket.uvs.push(0, 0);
    }
    if (index) {
      for (let i = 0; i < index.count; i++) bucket.indices.push(vertexBase + index.getX(i));
    } else {
      for (let i = 0; i < position.count; i++) bucket.indices.push(vertexBase + i);
    }
  }
}

const positions: number[] = [];
const normals: number[] = [];
const uvs: number[] = [];
const indices: number[] = [];
const groups: Array<{ material: string; start: number; count: number }> = [];
for (const name of materials) {
  const bucket = buckets.get(name)!;
  if (!bucket.indices.length) continue;
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

const output = {
  meta: {
    source: "King_Joe.glb / kingjoe-mesh.obj（个人参考，不商用）",
    stage: "whole-single-part",
    source_handles: model.parts.length,
    source_triangles: sourceTriangles,
    verts: positions.length / 3,
    tris: indices.length / 3,
    materials: groups.map((group) => group.material),
    groups,
    bbox: [...min, ...max],
    note: "原三角形/UV/材质原样合并为 1 个 partId；未焊接、未布尔、未重拓扑。",
  },
  position: f32(positions),
  normal: f32(normals),
  uv: f32(uvs),
  index: u32(indices),
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(output));
console.log(
  `handles=${model.parts.length} verts=${positions.length / 3} tris=${indices.length / 3} materials=${groups.length} bbox=${[...min, ...max].map((v) => v.toFixed(3)).join(",")} size=${(fs.statSync(OUT).size / 1024).toFixed(0)}KB`,
);
console.log(groups.map((group) => `${group.material}:${group.count / 3}tri`).join(" "));
model.dispose();
