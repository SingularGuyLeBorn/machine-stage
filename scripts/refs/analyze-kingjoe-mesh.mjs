// 分析真实网格：连通块归属、切片宽度、前后朝向、疑似胸口/头部面板。
import fs from "node:fs";

const glbPath = "E:/Downloads/JGQ/kingjoe-glb/King_Joe.glb";
const buf = fs.readFileSync(glbPath);
const jsonLen = buf.readUInt32LE(12);
const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString("utf8"));
const bin = buf.subarray(20 + jsonLen + 8);
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
    for (let c = 0; c < n; c++) out[i * n + c] = new Typed(bin.buffer, bin.byteOffset + base + c * Typed.BYTES_PER_ELEMENT, 1)[0];
  }
  return { data: out, n, count: acc.count };
}
const prim = json.meshes[0].primitives[0];
const pos = readAccessor(prim.attributes.POSITION);
const nrm = readAccessor(prim.attributes.NORMAL);
const uv = readAccessor(prim.attributes.TEXCOORD_0);
const ji = readAccessor(prim.attributes.JOINTS_0);
const wt = readAccessor(prim.attributes.WEIGHTS_0);
const idx = readAccessor(prim.indices).data;
const V = pos.count;

const parent = new Int32Array(V).map((_, i) => i);
const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
const uni = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[b] = a; };
for (let t = 0; t < idx.length; t += 3) { uni(idx[t], idx[t + 1]); uni(idx[t + 1], idx[t + 2]); }
const compMap = new Map();
for (let i = 0; i < V; i++) {
  const r = find(i);
  if (!compMap.has(r)) compMap.set(r, []);
  compMap.get(r).push(i);
}
const jointNames = json.skins[0].joints.map((j) => json.nodes[j].name);
const comps = [...compMap.entries()].map(([root, verts]) => {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  const c = [0, 0, 0], jc = new Map();
  for (const i of verts) {
    for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], pos.data[i * 3 + k]); max[k] = Math.max(max[k], pos.data[i * 3 + k]); c[k] += pos.data[i * 3 + k] / verts.length; }
    let best = 0, bw = -1;
    for (let q = 0; q < 4; q++) { const w = wt.data[i * 4 + q]; if (w > bw) { bw = w; best = ji.data[i * 4 + q]; } }
    jc.set(best, (jc.get(best) ?? 0) + 1);
  }
  const dominant = [...jc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([j, n]) => `${jointNames[j].replace("Bip001 ", "")}:${n}`);
  return { verts: verts.length, min, max, center: c, joints: dominant };
}).sort((a, b) => b.verts - a.verts);

console.log(`components=${comps.length}`);
console.log("\ncomponents (size>=20) sorted by center y desc: n, center, bbox, joints");
for (const c of comps.filter((x) => x.verts >= 20)) {
  console.log(`n=${String(c.verts).padStart(4)} c[${c.center.map((v) => v.toFixed(2)).join(",")}] bbox x[${c.min[0].toFixed(2)},${c.max[0].toFixed(2)}] y[${c.min[1].toFixed(2)},${c.max[1].toFixed(2)}] z[${c.min[2].toFixed(2)},${c.max[2].toFixed(2)}] ${c.joints.join(" ")}`);
}

// 低处顶点：脚尖方向
const low = [];
for (let i = 0; i < V; i++) if (pos.data[i * 3 + 1] < 0.12) low.push(pos.data[i * 3 + 2]);
console.log(`\nlowest verts n=${low.length} z min=${Math.min(...low).toFixed(3)} max=${Math.max(...low).toFixed(3)}`);
for (const side of ["X-", "X+"]) {
  const zs = [];
  for (let i = 0; i < V; i++) {
    const x = pos.data[i * 3];
    if (pos.data[i * 3 + 1] < 0.12 && (side === "X-" ? x < 0 : x > 0)) zs.push(pos.data[i * 3 + 2]);
  }
  console.log(`${side} foot low z range ${Math.min(...zs).toFixed(2)}..${Math.max(...zs).toFixed(2)}`);
}

// 按 y 切片的 x/z 范围
console.log("\ny slice: x range, z range, count");
const bands = 24;
for (let b = 0; b < bands; b++) {
  const y0 = (6.615 * b) / bands, y1 = (6.615 * (b + 1)) / bands;
  let xmin = Infinity, xmax = -Infinity, zmin = Infinity, zmax = -Infinity, n = 0;
  for (let i = 0; i < V; i++) {
    const y = pos.data[i * 3 + 1];
    if (y >= y0 && y < y1) {
      n++;
      xmin = Math.min(xmin, pos.data[i * 3]); xmax = Math.max(xmax, pos.data[i * 3]);
      zmin = Math.min(zmin, pos.data[i * 3 + 2]); zmax = Math.max(zmax, pos.data[i * 3 + 2]);
    }
  }
  console.log(`${y0.toFixed(2)}-${y1.toFixed(2)}  x[${xmin.toFixed(2)},${xmax.toFixed(2)}] w=${(xmax - xmin).toFixed(2)} z[${zmin.toFixed(2)},${zmax.toFixed(2)}] d=${(zmax - zmin).toFixed(2)} n=${n}`);
}

// 正面（z=-）胸区组件：找平面朝前 (-Z) 的大面
console.log("\nfront chest-ish components (center z<-0.2, y 4.0..5.6, n>=30):");
for (const c of comps.filter((x) => x.verts >= 30 && x.center[2] < -0.2 && x.center[1] > 4.0 && x.center[1] < 5.6)) {
  console.log(`n=${c.verts} c[${c.center.map((v) => v.toFixed(2)).join(",")}] bbox x[${c.min[0].toFixed(2)},${c.max[0].toFixed(2)}] y[${c.min[1].toFixed(2)},${c.max[1].toFixed(2)}] z[${c.min[2].toFixed(2)},${c.max[2].toFixed(2)}] ${c.joints.join(" ")}`);
}
// UV ranges of those to see atlas regions
console.log("\nhead-ish components (center y>5.5, n>=20):");
for (const c of comps.filter((x) => x.verts >= 20 && x.center[1] > 5.5)) {
  console.log(`n=${c.verts} c[${c.center.map((v) => v.toFixed(2)).join(",")}] bbox y[${c.min[1].toFixed(2)},${c.max[1].toFixed(2)}] ${c.joints.join(" ")}`);
}
