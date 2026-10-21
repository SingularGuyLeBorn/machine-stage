import fs from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { buildModel } from "../src/three/parts";
import { makeKingJoeSkinRegistry } from "../src/three/parts/models/kingjoe-skin/registry";
import { kingjoeSkinBuilders } from "../src/three/parts/models/kingjoe-skin/kits";
import { KINGJOE_SKIN_MATERIALS } from "../src/three/parts/models/kingjoe-skin/materials";

// 三体拆分：
//   下半身 = legs 总成 + stomach.pelvis（腿部+髋部）
//   躯干   = stomach.abdomen + chest 非手部件（腹部+胸部+肩臂）
//   头手   = ship(head) + chest.hand/finger（脑袋+两只手）
// 分组沿用源网格的自然归属，不切三角形；每组内部按原材质分组。
const OUT = path.resolve(import.meta.dirname, "../src/three/parts/models/kingjoe-three/three.generated.json");

type GroupId = "lower" | "torso" | "headhands";

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

function groupOf(partId: string, assembly: string): GroupId {
  if (assembly === "legs") return "lower";
  if (assembly === "stomach" && partId.includes(".src_pelvis")) return "lower";
  if (assembly === "ship") return "headhands";
  if (assembly === "chest" && /\.src_(hand|finger)/.test(partId)) return "headhands";
  return "torso";
}

function merge(group: GroupId) {
  const buckets = new Map<string, { positions: number[]; normals: number[]; uvs: number[]; indices: number[] }>();
  let triangles = 0;
  for (const handle of model.parts) {
    if (groupOf(handle.partId, handle.def.assembly) !== group) continue;
    const bucket = buckets.get(handle.def.material) ?? { positions: [], normals: [], uvs: [], indices: [] };
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
    meta: { verts: positions.length / 3, tris: indices.length / 3, triangles, materials: groups.map((g) => g.material), groups, bbox: [...min, ...max] },
    geometry: { position: f32(positions), normal: f32(normals), uv: f32(uvs), index: u32(indices) },
  };
}

const lower = merge("lower");
const torso = merge("torso");
const headhands = merge("headhands");

// 接口高度：从各组包围盒/源件范围取，供注册表派生榫卯与动作。
let abdomenLow = Infinity;
let headLow = Infinity;
const box = new THREE.Box3();
for (const handle of model.parts) {
  const group = groupOf(handle.partId, handle.def.assembly);
  if (!handle.geometry.boundingBox) handle.geometry.computeBoundingBox();
  for (const instance of handle.instances) {
    box.copy(handle.geometry.boundingBox!).applyMatrix4(model.instanceMatrix(handle, instance.index, new THREE.Matrix4()));
    if (group === "torso" && handle.partId.includes(".src_abdomen")) abdomenLow = Math.min(abdomenLow, box.min.y);
    if (group === "headhands" && handle.def.assembly === "ship") headLow = Math.min(headLow, box.min.y);
  }
}

const output = {
  meta: {
    source: "King_Joe.glb / kingjoe-mesh.obj（个人参考，不商用）",
    split: "three anatomical groups: legs+pelvis / abdomen+chest / head+hands",
    source_handles: model.parts.length,
    source_triangles: lower.meta.triangles + torso.meta.triangles + headhands.meta.triangles,
    abdomen_low: abdomenLow,
    head_low: headLow,
    lower: lower.meta,
    torso: torso.meta,
    headhands: headhands.meta,
    note: "下半身=腿+髋，躯干=腹+胸（含肩臂），头手=头+双手；接缝沿用源装甲/关节边界，未切三角形、未重拓扑。",
  },
  parts: { lower: lower.geometry, torso: torso.geometry, headhands: headhands.geometry },
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(output));
console.log(
  `lower tris=${lower.meta.tris} m=${lower.meta.materials.length}; torso tris=${torso.meta.tris} m=${torso.meta.materials.length}; headhands tris=${headhands.meta.tris} m=${headhands.meta.materials.length}; total=${output.meta.source_triangles}; abdomen_low=${abdomenLow.toFixed(3)} head_low=${headLow.toFixed(3)} size=${(fs.statSync(OUT).size / 1024).toFixed(0)}KB`,
);
model.dispose();
