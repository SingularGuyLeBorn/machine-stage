import * as THREE from "three";
import { MESH_META, MESH_PAYLOAD_B64, type MeshPartMeta } from "./assets";

// ============================================================================
// t800/mesh —— 真实网格资产的运行时解码
//
// 载荷格式（scripts/import-t800-mesh.ts 生成）：
//   每件一段记录：
//     u32 偏移 / u32 顶点数 / u32 索引数 / u8 索引宽度(0=16bit,1=32bit) / u8 保留 / f64 包围盒原点的 x
//     之后是 int16 顶点（按件包围盒量化）与索引。
// 顶点还原后整体平移到「该件包围盒中心」，零件的装配位 = 包围盒中心（模型坐标）。
// ============================================================================

let payload: ArrayBuffer | null = null;
const cache = new Map<string, THREE.BufferGeometry>();
const index = new Map<string, MeshPartMeta>();

/** 资产清单（名称 → 元数据）。 */
export function meshMeta(): Map<string, MeshPartMeta> {
  if (index.size === 0) for (const m of MESH_META) index.set(m.n, m);
  return index;
}

function decodeBase64(b64: string): ArrayBuffer {
  const binary = typeof atob === "function" ? atob(b64) : Buffer.from(b64, "base64").toString("binary");
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function payloadBuffer(): ArrayBuffer {
  if (!payload) payload = decodeBase64(MESH_PAYLOAD_B64);
  return payload;
}

/** 取某一件的几何（已平移到该件包围盒中心，局部坐标）。 */
export function meshPartGeometry(name: string): THREE.BufferGeometry {
  const hit = cache.get(name);
  if (hit) return hit;
  const meta = meshMeta().get(name);
  if (!meta) throw new Error(`t800.mesh：没有名为 "${name}" 的部位`);
  const buf = payloadBuffer();
  const view = new DataView(buf);
  // 每件在载荷里的字节偏移写在清单里 —— 必须按件跳过去。
  // （早期版本固定读第一条记录 → 所有零件都拿到同一份几何，只按各自包围盒拉伸，
  //   整个模型其实一直是"脊柱几何被拉成所有零件"。）
  const base = meta.o ?? view.getUint32(0, true);
  const vCount = view.getUint32(base + 4, true);
  const iCount = view.getUint32(base + 8, true);
  const wide = view.getUint8(base + 12) === 1;
  const [minX, minY, minZ, extX, extY, extZ] = meta.b;
  const vOffset = base + 24;
  const iOffset = vOffset + vCount * 3 * 2;

  const positions = new Float32Array(vCount * 3);
  const q = new Int16Array(buf, vOffset, vCount * 3);
  for (let i = 0; i < vCount * 3; i++) {
    const k = i % 3;
    const origin = k === 0 ? minX : k === 1 ? minY : minZ;
    const ext = k === 0 ? extX : k === 1 ? extY : extZ;
    // 写入时归一化值整体偏移了 -32768（int16 有符号），这里加回来。
    positions[i] = origin + ((q[i] + 32768) / 65535) * ext;
  }
  const indices = vCount > 65535 ? new Uint32Array(iCount) : new Uint16Array(iCount);
  if (wide) {
    const src = new Uint32Array(buf, iOffset, iCount);
    indices.set(src);
  } else {
    const src = new Uint16Array(buf, iOffset, iCount);
    indices.set(src);
  }

  const center: [number, number, number] = [
    minX + extX / 2,
    minY + extY / 2,
    minZ + extZ / 2,
  ];
  for (let i = 0; i < vCount; i++) {
    positions[i * 3] -= center[0];
    positions[i * 3 + 1] -= center[1];
    positions[i * 3 + 2] -= center[2];
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  cache.set(name, geometry);
  return geometry;
}

/** 按清单序号取几何（零件声明里用序号引用，避免部位名被表达式解析器改写）。 */
export function meshPartGeometryByIndex(index: number): THREE.BufferGeometry {
  const meta = MESH_META[index];
  if (!meta) throw new Error(`t800.mesh：清单里没有第 ${index} 件`);
  return meshPartGeometry(meta.n);
}

/** 某一件的装配中心（模型坐标）—— 也就是它的包围盒中心。 */
export function meshPartCenter(name: string): [number, number, number] {
  const meta = meshMeta().get(name);
  if (!meta) throw new Error(`t800.mesh：没有名为 "${name}" 的部位`);
  const [minX, minY, minZ, extX, extY, extZ] = meta.b;
  return [minX + extX / 2, minY + extY / 2, minZ + extZ / 2];
}

/** 某一件的包围盒尺寸。 */
export function meshPartSize(name: string): [number, number, number] {
  const meta = meshMeta().get(name);
  if (!meta) throw new Error(`t800.mesh：没有名为 "${name}" 的部位`);
  return [meta.b[3], meta.b[4], meta.b[5]];
}
