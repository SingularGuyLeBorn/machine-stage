// 分析胸廓件（bip_spine_3_06）的连通分量：肋骨能不能逐根切出来？
import { MESH_META, MESH_PAYLOAD_B64 } from "../src/three/parts/models/t800/mesh/assets";

function decode(b64: string): ArrayBuffer {
  const binary = typeof atob === "function" ? atob(b64) : Buffer.from(b64, "base64").toString("binary");
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

const buf = decode(MESH_PAYLOAD_B64);
const view = new DataView(buf);
const meta = MESH_META.find((m) => m.n === "bip_spine_3_06")!;
const idx = MESH_META.indexOf(meta);

// 定位该件的记录：按顺序累加长度
let base = 0;
for (let i = 0; i < idx; i++) {
  const vCount = view.getUint32(base + 4, true);
  const iCount = view.getUint32(base + 8, true);
  const wide = view.getUint8(base + 12) === 1;
  base += 24 + vCount * 6 + iCount * (wide ? 4 : 2);
}
const vCount = view.getUint32(base + 4, true);
const iCount = view.getUint32(base + 8, true);
const wide = view.getUint8(base + 12) === 1;
const vOffset = base + 24;
const iOffset = vOffset + vCount * 3 * 2;
const [minX, minY, minZ, extX, extY, extZ] = meta.b;

const q = new Int16Array(buf, vOffset, vCount * 3);
const pos: number[][] = [];
for (let i = 0; i < vCount; i++) {
  const p: number[] = [];
  for (let k = 0; k < 3; k++) {
    const origin = k === 0 ? minX : k === 1 ? minY : minZ;
    const ext = k === 0 ? extX : k === 1 ? extY : extZ;
    p.push(origin + ((q[i * 3 + k] + 32768) / 65535) * ext);
  }
  pos.push(p);
}
const indices: number[] = [];
if (wide) {
  const src = new Uint32Array(buf, iOffset, iCount);
  indices.push(...src);
} else {
  const src = new Uint16Array(buf, iOffset, iCount);
  indices.push(...src);
}

console.log(`胸廓件：${vCount} 顶点 / ${iCount / 3} 面`);

// ---- 焊接：源网格带 UV 缝，同一块骨头被切成上千碎片 ----
// 按位置量化（0.4mm）合并顶点，重建拓扑后再看连通分量
const TOL = 0.0004;
const keyOf = (p: number[]): string =>
  `${Math.round(p[0] / TOL)},${Math.round(p[1] / TOL)},${Math.round(p[2] / TOL)}`;
const weld = new Map<string, number>();
const remap = new Int32Array(vCount);
for (let i = 0; i < vCount; i++) {
  const k = keyOf(pos[i]);
  const hit = weld.get(k);
  if (hit === undefined) {
    weld.set(k, i);
    remap[i] = i;
  } else {
    remap[i] = hit;
  }
}
const wc = weld.size;
console.log(`焊接后顶点数：${wc}（原 ${vCount}）`);

const parent = new Int32Array(wc);
for (let i = 0; i < wc; i++) parent[i] = i;
const find = (a: number): number => {
  while (parent[a] !== a) {
    parent[a] = parent[parent[a]];
    a = parent[a];
  }
  return a;
};
const union = (a: number, b: number) => {
  const ra = find(a);
  const rb = find(b);
  if (ra !== rb) parent[rb] = ra;
};
for (let i = 0; i < indices.length; i += 3) {
  union(remap[indices[i]], remap[indices[i + 1]]);
  union(remap[indices[i + 1]], remap[indices[i + 2]]);
}
const groups = new Map<number, number[]>();
for (let i = 0; i < wc; i++) {
  const r = find(i);
  const list = groups.get(r) ?? [];
  list.push(i);
  groups.set(r, list);
}
const comps = [...groups.values()].sort((a, b) => b.length - a.length);
console.log(`焊接后连通分量：${comps.length} 个`);
comps.slice(0, 30).forEach((c, i) => {
  const mn = [Infinity, Infinity, Infinity];
  const mx = [-Infinity, -Infinity, -Infinity];
  for (const v of c) {
    for (let k = 0; k < 3; k++) {
      mn[k] = Math.min(mn[k], pos[v][k]);
      mx[k] = Math.max(mx[k], pos[v][k]);
    }
  }
  console.log(
    `#${i} verts=${c.length}  x[${mn[0].toFixed(3)},${mx[0].toFixed(3)}] y[${mn[1].toFixed(3)},${mx[1].toFixed(3)}] z[${mn[2].toFixed(3)},${mx[2].toFixed(3)}]`,
  );
});
