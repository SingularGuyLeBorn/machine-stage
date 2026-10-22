// 解析 kingjoe GLB：骨架世界位置 / 网格属性 / 蒙皮主关节分区，用于按皮切件。
import fs from "node:fs";
import path from "node:path";

const glbPath = process.argv[2] ?? "E:/Downloads/JGQ/kingjoe-glb/King_Joe.glb";
const buf = fs.readFileSync(glbPath);
const jsonLen = buf.readUInt32LE(12);
const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString("utf8"));
const binStart = 20 + jsonLen + 8;
const bin = buf.subarray(binStart);

const COMP = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const NCOMP = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

function readAccessor(index) {
  const acc = json.accessors[index];
  const bv = json.bufferViews[acc.bufferView];
  const Typed = COMP[acc.componentType];
  const n = NCOMP[acc.type];
  const stride = bv.byteStride ?? n * Typed.BYTES_PER_ELEMENT;
  const offset = (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0);
  const out = new Float64Array(acc.count * n);
  for (let i = 0; i < acc.count; i++) {
    const base = offset + i * stride;
    for (let c = 0; c < n; c++) {
      const Reader = Typed;
      out[i * n + c] = new Reader(bin.buffer, bin.byteOffset + base + c * Reader.BYTES_PER_ELEMENT, 1)[0];
    }
  }
  return { data: out, n, count: acc.count };
}

// 世界矩阵
function nodeMatrix(node) {
  if (node.matrix) return node.matrix.slice();
  const [tx, ty, tz] = node.translation ?? [0, 0, 0];
  const [qx, qy, qz, qw] = node.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = node.scale ?? [1, 1, 1];
  const xx = qx * qx, yy = qy * qy, zz = qz * qz;
  const xy = qx * qy, xz = qx * qz, yz = qy * qz;
  const wx = qw * qx, wy = qw * qy, wz = qw * qz;
  return [
    (1 - 2 * (yy + zz)) * sx, 2 * (xy + wz) * sx, 2 * (xz - wy) * sx, 0,
    2 * (xy - wz) * sy, (1 - 2 * (xx + zz)) * sy, 2 * (yz + wx) * sy, 0,
    2 * (xz + wy) * sz, 2 * (yz - wx) * sz, (1 - 2 * (xx + yy)) * sz, 0,
    tx, ty, tz, 1,
  ];
}
function mul(a, b) {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++)
    for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
}
function worldMatrices() {
  const scene = json.scenes[json.scene ?? 0];
  const out = new Map();
  const visit = (idx, parent) => {
    const node = json.nodes[idx];
    const world = mul(parent, nodeMatrix(node));
    out.set(idx, world);
    for (const child of node.children ?? []) visit(child, world);
  };
  for (const root of scene.nodes) visit(root, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  return out;
}

const wm = worldMatrices();
const joints = json.skins[0].joints;
const names = joints.map((j) => json.nodes[j].name);
console.log(`scene=${json.scenes.length} nodes=${json.nodes.length} meshes=${json.meshes.length} skins=${json.skins.length} joints=${joints.length}`);
console.log("joints (index → name → world xyz):");
for (let i = 0; i < joints.length; i++) {
  const m = wm.get(joints[i]);
  console.log(`${String(i).padStart(2)} ${names[i].padEnd(24)} [${m[12].toFixed(4)}, ${m[13].toFixed(4)}, ${m[14].toFixed(4)}]`);
}

const mesh = json.meshes[json.nodes.find((n) => n.mesh !== undefined).mesh];
console.log("\nmesh primitives:", mesh.primitives.length);
for (const [pi, prim] of mesh.primitives.entries()) {
  console.log(`prim ${pi} attrs=${Object.keys(prim.attributes).join(",")} mode=${prim.mode ?? 4}`);
  for (const [k, v] of Object.entries(prim.attributes)) {
    const acc = json.accessors[v];
    console.log(`  ${k}: count=${acc.count} type=${acc.type} comp=${acc.componentType} min=${JSON.stringify(acc.min)} max=${JSON.stringify(acc.max)}`);
  }
  if (prim.indices !== undefined) {
    const acc = json.accessors[prim.indices];
    console.log(`  indices: count=${acc.count} comp=${acc.componentType}`);
  }
}

// 顶点 → 主关节
const prim = mesh.primitives[0];
const pos = readAccessor(prim.attributes.POSITION);
const ji = readAccessor(prim.attributes.JOINTS_0);
const wt = readAccessor(prim.attributes.WEIGHTS_0);
const counts = new Map();
const bbox = new Map();
const comps = new Map();
for (let i = 0; i < pos.count; i++) {
  let best = 0, bw = -1;
  for (let c = 0; c < 4; c++) {
    const w = wt.data[i * 4 + c];
    if (w > bw) { bw = w; best = ji.data[i * 4 + c]; }
  }
  counts.set(best, (counts.get(best) ?? 0) + 1);
  let b = bbox.get(best);
  if (!b) { b = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] }; bbox.set(best, b); }
  for (let c = 0; c < 3; c++) {
    b.min[c] = Math.min(b.min[c], pos.data[i * 3 + c]);
    b.max[c] = Math.max(b.max[c], pos.data[i * 3 + c]);
  }
  const key = `${best}`;
  if (!comps.has(key)) comps.set(key, []);
}
console.log("\ndominant joint vertex counts / bbox:");
for (const j of [...counts.keys()].sort((a, b) => a - b)) {
  const b = bbox.get(j);
  console.log(`${String(j).padStart(2)} ${names[j].padEnd(22)} n=${String(counts.get(j)).padStart(5)}  bbox x[${b.min[0].toFixed(2)},${b.max[0].toFixed(2)}] y[${b.min[1].toFixed(2)},${b.max[1].toFixed(2)}] z[${b.min[2].toFixed(2)},${b.max[2].toFixed(2)}]`);
}

// 对比 OBJ 顶点（顶点顺序是否一致）
const objPath = "D:/FunnyProjects/kingjoe-refs/kingjoe-mesh.obj";
const objVerts = fs.readFileSync(objPath, "utf8").split(/\r?\n/).filter((l) => l.startsWith("v ")).map((l) => l.split(/\s+/).slice(1, 4).map(Number));
let mismatch = 0;
for (let i = 0; i < Math.min(objVerts.length, pos.count); i++) {
  const d = Math.max(...[0, 1, 2].map((c) => Math.abs(objVerts[i][c] - pos.data[i * 3 + c])));
  if (d > 1e-4) mismatch++;
}
console.log(`\nOBJ verts=${objVerts.length} GLB verts=${pos.count} first-mismatch-count=${mismatch}`);

// 连通分量统计（按索引三角形）
const idx = readAccessor(prim.indices).data;
const parent = new Int32Array(pos.count).map((_, i) => i);
const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
const uni = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[b] = a; };
for (let t = 0; t < idx.length; t += 3) { uni(idx[t], idx[t + 1]); uni(idx[t + 1], idx[t + 2]); }
const roots = new Map();
for (let i = 0; i < pos.count; i++) { const r = find(i); roots.set(r, (roots.get(r) ?? 0) + 1); }
const sizes = [...roots.values()].sort((a, b) => b - a);
console.log(`connected components=${roots.size} sizes(top20)=${sizes.slice(0, 20).join(",")}`);
