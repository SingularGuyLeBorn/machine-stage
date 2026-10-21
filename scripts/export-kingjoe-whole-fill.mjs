import fs from "node:fs";
import path from "node:path";
import whole from "../src/three/parts/models/kingjoe-whole/whole.generated.json" with { type: "json" };

// 导出整机单件的壳几何给 Blender 实体化使用（模型坐标）。
// 后续：blender -b -P scripts/blender-fill-whole.py -- tmp/kingjoe-whole-shell.json
//       src/three/parts/models/kingjoe-whole/core.generated.json 0.06 0.99
const decode = (base64, Type) => {
  const buffer = Buffer.from(base64, "base64");
  return Array.from(new Type(buffer.buffer, buffer.byteOffset, buffer.byteLength / Type.BYTES_PER_ELEMENT));
};
const output = {
  source: "kingjoe-whole/whole.generated.json",
  positions: decode(whole.position, Float32Array),
  indices: decode(whole.index, Uint32Array),
};
const out = path.resolve(import.meta.dirname, "../tmp/kingjoe-whole-shell.json");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(output));
console.log(`wrote ${out} verts=${output.positions.length / 3} tris=${output.indices.length / 3}`);
