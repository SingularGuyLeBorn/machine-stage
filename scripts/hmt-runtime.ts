import { mkdirSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { MeshBVH } from "three-mesh-bvh";
import type { AssembledModel } from "../src/three/parts/assembler/assembler";
import { resolveSpec } from "../src/three/parts/assembler/geometry";
import { computeTangentsSafe } from "../src/three/parts/kernel/geometry";
import type { HmtRuntimeData, PackedAttribute } from "../src/three/parts/models/hmt/runtimeTypes";

/** 同一次真实装配的无损发布缓存；源注册表与加工流程仍是唯一建模入口。 */
export function exportHmtRuntime(model: AssembledModel) {
  const dir = "public/models/hmt";
  mkdirSync(dir, { recursive: true });
  const data: HmtRuntimeData = {
    registry: {
      ...model.registry,
      constants: { HEIGHT: model.constants.HEIGHT },
      parts: model.registry.parts.map((p) => ({
        ...p,
        geometry: {
          type: "kit",
          kit: "hmt_packed",
          params: { id: p.id, scale: `HEIGHT/${model.constants.HEIGHT}` },
        },
        mate:
          p.mate?.type === "absolute"
            ? {
                ...p.mate,
                position: (resolveSpec(p.mate.position, model.constants) as number[]).map(
                  (v) => `(${v})*HEIGHT/${model.constants.HEIGHT}`,
                ) as [string, string, string],
                rotation: resolveSpec(p.mate.rotation, model.constants) as [number, number, number],
              }
            : p.mate,
        explode: p.explode
          ? {
              direction: resolveSpec(p.explode.direction, model.constants) as [number, number, number],
              distance: `(${resolveSpec(p.explode.distance, model.constants)})*HEIGHT/${model.constants.HEIGHT}`,
            }
          : undefined,
      })),
    },
    chunks: [],
    parts: [],
    triangles: 0,
  };
  let buffers: Buffer[] = [],
    bytes = 0;
  const geometries = new Map<string, HmtRuntimeData["parts"][number]>();
  const flush = () => {
    if (!bytes) return;
    const unpacked = Buffer.concat(buffers);
    const packed = gzipSync(unpacked, { level: 6 });
    const hash = createHash("sha256").update(packed).digest("hex");
    const dataHash = createHash("sha256").update(unpacked).digest("hex");
    const file = `${hash}.bin.gz`;
    writeFileSync(`${dir}/${file}`, packed);
    data.chunks.push({ url: `/models/hmt/${file}`, bytes, hash, dataHash });
    buffers = [];
    bytes = 0;
  };
  for (const part of model.parts) {
    const g = part.geometry;
    // 在离线发布时计算切线，页面不再遍历数千万面重算。
    computeTangentsSafe(g);
    const indices = g.index
      ? new Uint32Array(g.index.array)
      : Uint32Array.from({ length: g.getAttribute("position").count }, (_, i) => i);
    const signature = createHash("sha256");
    for (const [name, attribute] of Object.entries(g.attributes)) {
      signature.update(`${name}:${attribute.itemSize}:${attribute.array.constructor.name}:`);
      signature.update(
        Buffer.from(attribute.array.buffer, attribute.array.byteOffset, attribute.array.byteLength),
      );
    }
    signature.update(Buffer.from(indices.buffer));
    const key = signature.digest("hex");
    const shared = geometries.get(key);
    if (shared) {
      // 相同字节的重复零件共用发布数据，分件身份、变换和三角面数均保留。
      data.parts.push({ ...shared, id: part.partId });
      data.triangles += indices.length / 3;
      continue;
    }
    const attributes: Record<string, PackedAttribute> = {};
    for (const [name, attribute] of Object.entries(g.attributes)) {
      const array = new Float32Array(attribute.array);
      attributes[name] = {
        offset: bytes,
        length: array.length,
        itemSize: attribute.itemSize,
        type: "float32",
      };
      buffers.push(Buffer.from(array.buffer));
      bytes += array.byteLength;
    }
    const index: PackedAttribute = { offset: bytes, length: indices.length, itemSize: 1, type: "uint32" };
    buffers.push(Buffer.from(indices.buffer));
    bytes += indices.byteLength;
    // 拾取加速结构同样离线生成；indirect 保留全部原始三角形的索引与顺序。
    const tree = MeshBVH.serialize(new MeshBVH(g, { indirect: true, maxDepth: 60 }), { cloneBuffers: false });
    const roots = tree.roots.map((root) => {
      const entry = { offset: bytes, bytes: root.byteLength };
      buffers.push(Buffer.from(root));
      bytes += root.byteLength;
      return entry;
    });
    const indirectArray = new Uint32Array(tree.indirectBuffer!);
    const indirect: PackedAttribute = {
      offset: bytes,
      length: indirectArray.length,
      itemSize: 1,
      type: "uint32",
    };
    buffers.push(Buffer.from(indirectArray.buffer));
    bytes += indirectArray.byteLength;
    data.parts.push({
      id: part.partId,
      chunk: data.chunks.length,
      attributes,
      index,
      bvh: { version: (tree as typeof tree & { version: number }).version, roots, indirect },
    });
    geometries.set(key, data.parts[data.parts.length - 1]);
    data.triangles += indices.length / 3;
    // [OM-FREEPLAY] 16 MiB 为下载解压的分块上限估计；完整单件不切开、不减面。
    if (bytes >= 16 * 1024 * 1024) flush();
  }
  flush();
  writeFileSync("src/three/parts/models/hmt/runtime.generated.json", JSON.stringify(data));
  process.stdout.write(
    JSON.stringify({
      chunks: data.chunks.length,
      uniqueGeometries: geometries.size,
      triangles: data.triangles,
    }) + "\n",
  );
}
