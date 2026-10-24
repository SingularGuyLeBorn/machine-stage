import { BufferAttribute, BufferGeometry } from "three";
import { MeshBVH } from "three-mesh-bvh";
import type { GeometryBuilder } from "../../assembler/geometry";
import type { HmtRuntimeData, PackedAttribute } from "./runtimeTypes";
import generated from "./runtime.generated.json";

const data = generated as unknown as HmtRuntimeData;
export const hmtRuntimeRegistry = data.registry;
const parts = new Map(data.parts.map((part) => [part.id, part]));
let buffers: ArrayBuffer[] | null = null;
const attributesByBuffer = new WeakMap<ArrayBuffer, Map<string, BufferAttribute>>();

export function prepareHmt(signal: AbortSignal, progress: (fraction: number) => void): Promise<void> {
  if (buffers) return Promise.resolve();
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const worker = new Worker(new URL("./runtime.worker.ts", import.meta.url), { type: "module" });
    const pending: ArrayBuffer[] = [];
    let active = true;
    const cleanup = () => {
      active = false;
      signal.removeEventListener("abort", abort);
      worker.terminate();
    };
    const abort = () => {
      cleanup();
      reject(signal.reason);
    };
    signal.addEventListener("abort", abort, { once: true });
    worker.onerror = (event) => {
      if (!active) return;
      cleanup();
      reject(new Error(event.message));
    };
    worker.onmessage = (event) => {
      if (!active || signal.aborted) return;
      if (event.data.error) {
        cleanup();
        reject(new Error(event.data.error));
      } else if (event.data.done) {
        if (
          pending.length !== data.chunks.length ||
          data.chunks.some((c, i) => pending[i]?.byteLength !== c.bytes)
        ) {
          cleanup();
          reject(new Error("模型文件不完整"));
          return;
        }
        buffers = pending;
        cleanup();
        resolve();
      } else {
        pending[event.data.index] = event.data.buffer;
        progress(event.data.progress);
      }
    };
    worker.postMessage(
      data.chunks.map((chunk) => ({ ...chunk, url: new URL(chunk.url, location.href).href })),
    );
  });
}

export function packedGeometry(partId: string, chunks: ArrayBuffer[], scale = 1): BufferGeometry {
  const part = parts.get(partId);
  if (!part) throw new Error("缺少模型分件：" + partId);
  const buffer = chunks[part.chunk];
  if (!buffer) throw new Error("模型几何尚未加载");
  const attribute = (entry: PackedAttribute) => {
    const key = `${entry.type}:${entry.offset}:${entry.length}:${entry.itemSize}`;
    let shared = attributesByBuffer.get(buffer);
    if (scale === 1 && shared?.has(key)) return shared.get(key)!;
    const array =
      entry.type === "uint32"
        ? new Uint32Array(buffer, entry.offset, entry.length)
        : new Float32Array(buffer, entry.offset, entry.length);
    const result = new BufferAttribute(scale === 1 ? array : array.slice(), entry.itemSize);
    if (scale === 1) {
      if (!shared) {
        shared = new Map();
        attributesByBuffer.set(buffer, shared);
      }
      shared.set(key, result);
    }
    return result;
  };
  const geometry = new BufferGeometry();
  for (const [name, entry] of Object.entries(part.attributes)) geometry.setAttribute(name, attribute(entry));
  geometry.setIndex(attribute(part.index));
  const serialized: Parameters<typeof MeshBVH.deserialize>[0] & { version: number } = {
    version: part.bvh.version,
    roots: part.bvh.roots.map((root) => buffer.slice(root.offset, root.offset + root.bytes)),
    index: geometry.index!.array as Uint32Array,
    indirectBuffer: new Uint32Array(buffer, part.bvh.indirect.offset, part.bvh.indirect.length),
  };
  geometry.boundsTree = MeshBVH.deserialize(serialized, geometry, { setIndex: false });
  if (scale !== 1) {
    geometry.scale(scale, scale, scale);
    geometry.boundsTree.refit();
  }
  return geometry;
}

const builder: GeometryBuilder = (spec) => {
  if (spec.type !== "kit" || !buffers) throw new Error("完整模型尚未加载");
  return packedGeometry(String(spec.params!.id), buffers, Number(spec.params!.scale));
};
export const hmtRuntimeBuilders = { hmt_packed: builder };
