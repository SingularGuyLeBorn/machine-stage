import { writeFileSync, openSync, writeSync, closeSync, mkdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { buildModel } from "../src/three/parts/assembler/assembler";
import { makeHmtRegistry } from "../src/three/parts/models/hmt/registry";
import { hmtBuilders } from "../src/three/parts/models/hmt/geometry";
import { validateRegistry } from "../src/three/parts/registry/validate";
import { exportHmtRuntime } from "./hmt-runtime";
import machining from "../src/three/parts/models/hmt/machined.generated.json";
mkdirSync("qa-out", { recursive: true });
const raw = process.argv.includes("--raw");
const sourceHashes = Object.fromEntries(
  ["registry.ts", "geometry.ts", "restPose.ts"].map((name) => [
    name,
    createHash("sha256")
      .update(readFileSync(`src/three/parts/models/hmt/${name}`))
      .digest("hex"),
  ]),
);
if (raw && process.argv.includes("--runtime")) throw new Error("发布缓存必须来自完成加工的装配");
if (!raw) {
  for (const [name, expected] of Object.entries(machining.sources)) {
    const actual = createHash("sha256")
      .update(readFileSync(`src/three/parts/models/hmt/${name}`))
      .digest("hex");
    if (actual !== expected) throw new Error(`${name} 已改变，必须重新加工后再导出装配和发布缓存`);
  }
}
const registry = makeHmtRegistry({ machined: !raw });
process.stdout.write("validation " + JSON.stringify(validateRegistry(registry)) + "\n");
const model = buildModel(registry, { builders: hmtBuilders });
const fd = openSync("qa-out/hmt-mesh.bin", "w");
let offset = 0,
  triangles = 0;
const pieces = [];
for (const part of model.parts) {
  const g = part.geometry,
    pos = g.getAttribute("position"),
    n = g.getAttribute("normal");
  const positions = new Float32Array(pos.array),
    normals = new Float32Array(n.array);
  const indices = g.index
    ? new Uint32Array(g.index.array)
    : Uint32Array.from({ length: pos.count }, (_, i) => i);
  const bytes = [Buffer.from(positions.buffer), Buffer.from(normals.buffer), Buffer.from(indices.buffer)];
  const uv = g.getAttribute("uv");
  const uvOffset = uv ? offset + bytes.reduce((sum, b) => sum + b.byteLength, 0) : null;
  if (uv) bytes.push(Buffer.from(new Float32Array(uv.array).buffer));
  pieces.push({
    id: part.partId,
    layer: part.buildLayer,
    material: part.def.material,
    offset,
    uvOffset,
    vertices: pos.count,
    indices: indices.length,
    matrix: part.object.matrix.elements,
  });
  for (const b of bytes) {
    writeSync(fd, b);
    offset += b.byteLength;
  }
  triangles += indices.length / 3;
}
closeSync(fd);
writeFileSync(
  "qa-out/hmt-mesh.json",
  JSON.stringify({
    kind: raw ? "source" : "assembled",
    sources: sourceHashes,
    pieces,
    materials: registry.materials,
    triangles,
  }),
);
process.stdout.write(JSON.stringify({ pieces: pieces.length, triangles, bytes: offset }) + "\n");
if (process.argv.includes("--runtime")) exportHmtRuntime(model);
model.dispose();
