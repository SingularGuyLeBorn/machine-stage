// 头部件的连通分量：牙列能不能逐颗切出来？
import { MESH_META, MESH_PAYLOAD_B64 } from "../src/three/parts/models/t800/mesh/assets";

function decode(b64: string): ArrayBuffer {
  const binary = typeof atob === "function" ? atob(b64) : Buffer.from(b64, "base64").toString("binary");
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function partOf(name: string) {
  const buf = decode(MESH_PAYLOAD_B64);
  const view = new DataView(buf);
  const idx = MESH_META.findIndex((m) => m.n === name);
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
  const [minX, minY, minZ, extX, extY, extZ] = MESH_META[idx].b;
  const q = new Int16Array(buf, vOffset, vCount * 3);
  const pos: number[][] = [];
  for (let i = 0; i < vCount; i++) {
    const p: number[] = [];
    for (let k = 0; k < 3; k++) {
      const origin = k === 0 ? minX : k === 1 ? minY : minZ;
      const ext = k === 0 ? extX : k === 1 ? extY : extZ;
      p.push(origin + (q[i * 3 + k] / 65535) * ext);
    }
    pos.push(p);
  }
  const indices: number[] = wide
    ? Array.from(new Uint32Array(buf, iOffset, iCount))
    : Array.from(new Uint16Array(buf, iOffset, iCount));
  return { vCount, iCount, pos, indices };
}

const name = process.argv[2] ?? "bip_head_040";
const { vCount, iCount, pos, indices } = partOf(name);
console.log(`${name}: ${vCount} 顶点 / ${iCount / 3} 面`);

const parent = new Int32Array(vCount);
for (let i = 0; i < vCount; i++) parent[i] = i;
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
  union(indices[i], indices[i + 1]);
  union(indices[i + 1], indices[i + 2]);
}
const groups = new Map<number, number[]>();
for (let i = 0; i < vCount; i++) {
  const r = find(i);
  const list = groups.get(r) ?? [];
  list.push(i);
  groups.set(r, list);
}
const comps = [...groups.values()].sort((a, b) => b.length - a.length);
console.log(`连通分量：${comps.length}`);
const rows = comps.map((c) => {
  const mn = [Infinity, Infinity, Infinity];
  const mx = [-Infinity, -Infinity, -Infinity];
  for (const v of c)
    for (let k = 0; k < 3; k++) {
      mn[k] = Math.min(mn[k], pos[v][k]);
      mx[k] = Math.max(mx[k], pos[v][k]);
    }
  return { n: c.length, mn, mx };
});
for (const r of rows.slice(0, 40)) {
  console.log(
    `verts=${String(r.n).padStart(5)}  x[${r.mn[0].toFixed(3)},${r.mx[0].toFixed(3)}] y[${r.mn[1].toFixed(3)},${r.mx[1].toFixed(3)}] z[${r.mn[2].toFixed(3)},${r.mx[2].toFixed(3)}]`,
  );
}
const small = rows.filter((r) => r.n >= 20 && r.n <= 400).length;
console.log(`\n20~400 顶点的小块（候选牙/零件）：${small}`);
