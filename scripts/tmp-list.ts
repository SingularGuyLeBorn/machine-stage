import { MESH_META } from "../src/three/parts/models/t800/mesh/assets";
const rows = MESH_META.map((m) => {
  const c = [m.b[0] + m.b[3] / 2, m.b[1] + m.b[4] / 2, m.b[2] + m.b[5] / 2];
  return { n: m.n, k: m.k, v: m.v, c: c.map((x) => x.toFixed(3)).join(",") };
});
for (const r of rows) console.log(`${r.n}\t${r.k}\tv=${r.v}\tcenter=(${r.c})`);
