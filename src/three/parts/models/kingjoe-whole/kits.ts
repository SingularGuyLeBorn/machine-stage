import * as THREE from "three";
import type { GeometryBuilder } from "../../assembler/geometry";
import whole from "./whole.generated.json";
import core from "./core.generated.json";

// ============================================================================
// models/kingjoe-whole/kits —— 整机单件（原皮表面 + 内部闭合实心核）
//
// 表面：whole.generated.json 的 578 源件 + 21 个细节原三角形（15,248 三角，
//       12 材质组），外观与「真实网格分件」合体态一致。
// 内核：core.generated.json 由 Blender 体素重网格得到的闭合实体（41,836 三角，
//       内缩 1% 藏在原皮里），追加到同一个 partId 的几何里，填满内部体积。
// 单件仍是 1 个 partId；没有拆分/切分/新增外部零件。
// ============================================================================

interface ShellData {
  meta: {
    materials: string[];
    groups: Array<{ material: string; start: number; count: number }>;
    tris: number;
  };
  position: string;
  normal: string;
  uv: string;
  index: string;
}

interface CoreData {
  meta: { tris: number };
  position: string;
  normal: string;
  index: string;
}

const SHELL = whole as unknown as ShellData;
const CORE = core as unknown as CoreData;

function decode(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

const filledBuilder: GeometryBuilder = () => {
  const shellPositions = new Float32Array(decode(SHELL.position));
  const shellNormals = new Float32Array(decode(SHELL.normal));
  const shellUvs = new Float32Array(decode(SHELL.uv));
  const shellIndices = new Uint32Array(decode(SHELL.index));
  const corePositions = new Float32Array(decode(CORE.position));
  const coreNormals = new Float32Array(decode(CORE.normal));
  const coreIndices = new Uint32Array(decode(CORE.index));

  const shellVerts = shellPositions.length / 3;
  const coreVerts = corePositions.length / 3;
  const positions = new Float32Array((shellVerts + coreVerts) * 3);
  positions.set(shellPositions, 0);
  positions.set(corePositions, shellVerts * 3);
  const normals = new Float32Array((shellVerts + coreVerts) * 3);
  normals.set(shellNormals, 0);
  normals.set(coreNormals, shellVerts * 3);
  const uvs = new Float32Array((shellVerts + coreVerts) * 2);
  uvs.set(shellUvs, 0);

  const indices = new Uint32Array(shellIndices.length + coreIndices.length);
  indices.set(shellIndices, 0);
  for (let i = 0; i < coreIndices.length; i++) indices[shellIndices.length + i] = coreIndices[i]! + shellVerts;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  SHELL.meta.groups.forEach((group, index) => geometry.addGroup(group.start, group.count, index));
  geometry.addGroup(shellIndices.length, coreIndices.length, SHELL.meta.groups.length);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
};

export const kingjoeWholeBuilders: Record<string, GeometryBuilder> = { kjWhole: filledBuilder };
