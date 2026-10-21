// 胸廓件的 y 直方图：肋骨是水平堆叠的，切成"高度带"就能逐根分开
import { MESH_META, MESH_PAYLOAD_B64 } from "../src/three/parts/models/t800/mesh/assets";

function decode(b64: string): ArrayBuffer {
  const binary = typeof atob === "function" ? atob(b64) : Buffer.from(b64, "base64").toString("binary");
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

const buf = decode(MESH_PAYLOAD_B64);
const view = new DataView(buf);
const idx = MESH_META.findIndex((m) => m.n === "bip_spine_3_06");
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
const y = new Float64Array(vCount);
for (let i = 0; i < vCount; i++) y[i] = minY + (q[i * 3 + 1] / 65535) * extY;

const BINS = 80;
const hist = new Int32Array(BINS);
for (let i = 0; i < vCount; i++) {
  const b = Math.min(BINS - 1, Math.floor(((y[i] - minY) / extY) * BINS));
  hist[b]++;
}
const out: string[] = [];
for (let b = 0; b < BINS; b++) {
  const y0 = minY + (b / BINS) * extY;
  out.push(
    `${y0.toFixed(3)}  ${"█".repeat(Math.min(60, Math.round((hist[b] / 400) * 60)))} ${hist[b]}`,
  );
}
console.log(`胸廓 y 范围 ${minY.toFixed(3)} ~ ${(minY + extY).toFixed(3)}，${BINS} 段`);
console.log(out.join("\n"));

// 顶点相对躯干中轴（x≈0.007, z≈-0.01）的角度分布，看肋骨是不是环向排布
const ang = new Int32Array(36);
for (let i = 0; i < vCount; i++) {
  const dx = minX + (q[i * 3] / 65535) * extX - 0.007;
  const dz = minZ + (q[i * 3 + 2] / 65535) * extZ + 0.01;
  const a = Math.atan2(dz, dx);
  const bin = Math.min(35, Math.floor(((a + Math.PI) / (2 * Math.PI)) * 36));
  ang[bin]++;
}
console.log("\n环向角分布（36 段）:");
console.log(
  Array.from(ang)
    .map((v, i) => `${i}:${v}`)
    .join(" "),
);
