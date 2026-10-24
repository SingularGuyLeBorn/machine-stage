import { BufferAttribute, BufferGeometry } from "three";
import type { GeometryBuilder } from "../../assembler/geometry";
import { buildGeometry } from "../../assembler/geometry";
import { mirrorGeometry } from "../../kernel/geometry";
import type { GeometrySpec } from "../../registry/types";
import raw from "./machined.generated.json";
import { gunzipSync } from "three/examples/jsm/libs/fflate.module.js";

interface MachinedPart {
  id: string;
  data: string;
}
const parts = new Map((raw.parts as MachinedPart[]).map((p) => [p.id, p]));
export const machinedIds = new Set(parts.keys());
function bytes(text: string): ArrayBuffer {
  const binary = atob(text),
    out = new Uint8Array(binary.length);
  for (let i = 0; i < out.length; i++) out[i] = binary.charCodeAt(i);
  return out.buffer;
}
/** 保留分件身份，加载实体相减加工后的轴孔、沉孔和接缝。无减面操作。 */
export const machinedBuilder: GeometryBuilder = (spec, context) => {
  if (spec.type !== "kit") throw new Error("HMT 加工网格需要 kit 参数");
  const part = parts.get(String(spec.params!.id));
  if (!part) throw new Error("HMT 缺少加工件：" + spec.params!.id);
  const buffer = gunzipSync(new Uint8Array(bytes(part.data))).buffer;
  const header = new Uint32Array(buffer, 0, 5);
  const scale = Number(spec.params!.scale);
  // 先重建加工基准尺寸，再整体缩放；浮点除回原尺寸会改变极窄倒角的三角剖分。
  const source = JSON.parse(String(spec.params!.sourceJson)) as GeometrySpec;
  let base = buildGeometry(source, context);
  if (source.mirror) {
    const mirror = mirrorGeometry(base, source.mirror);
    base.dispose();
    base = mirror;
  }
  const baseP = base.getAttribute("position"),
    baseN = base.getAttribute("normal");
  const originalIndex = base.index?.array ?? Uint32Array.from({ length: baseP.count }, (_, i) => i);
  if (baseP.count !== header[0] || originalIndex.length !== header[1] * 3) {
    base.dispose();
    throw new Error("HMT 加工数据与源形体不一致，请重新生成：" + part.id);
  }
  const removed = new Set(new Uint32Array(buffer, 20, header[2]));
  const offset = 20 + header[2] * 4;
  const patchP = new Float32Array(buffer, offset, header[3] * 3);
  const patchN = new Float32Array(buffer, offset + header[3] * 12, header[3] * 3);
  const patchI = new Uint32Array(buffer, offset + header[3] * 24, header[4]);
  const p = new Float32Array((header[0] + header[3]) * 3),
    n = new Float32Array(p.length);
  p.set(baseP.array);
  p.set(patchP, header[0] * 3);
  n.set(baseN.array);
  n.set(patchN, header[0] * 3);
  const indices = new Uint32Array((header[1] - removed.size) * 3 + header[4]);
  let cursor = 0;
  for (let i = 0; i < header[1]; i++)
    if (!removed.has(i)) for (let k = 0; k < 3; k++) indices[cursor++] = originalIndex[i * 3 + k];
  for (const index of patchI) indices[cursor++] = index + header[0];
  const g = new BufferGeometry();
  // 删除被加工掉的面的游离顶点，避免包围盒和实体采样仍读到已不存在的材料。
  const remap = new Int32Array(p.length / 3).fill(-1),
    compactP: number[] = [],
    compactN: number[] = [];
  for (let i = 0; i < indices.length; i++) {
    const old = indices[i];
    if (remap[old] < 0) {
      remap[old] = compactP.length / 3;
      for (let k = 0; k < 3; k++) {
        compactP.push(p[old * 3 + k]);
        compactN.push(n[old * 3 + k]);
      }
    }
    indices[i] = remap[old];
  }
  g.setAttribute("position", new BufferAttribute(new Float32Array(compactP), 3));
  g.setAttribute("normal", new BufferAttribute(new Float32Array(compactN), 3));
  g.setIndex(new BufferAttribute(indices, 1));
  base.dispose();
  g.scale(scale, scale, scale);
  return g;
};
