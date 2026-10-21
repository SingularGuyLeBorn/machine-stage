import * as THREE from "three";
import type { GeometryBuilder } from "../../assembler/geometry";
import whole from "./whole.generated.json";

// ============================================================================
// models/kingjoe-whole/kits —— 整机单件几何
//
// whole.generated.json 由 scripts/build-kingjoe-whole.ts 从真实网格分件模型
// 合并而来：位置/法线/UV/索引为原三角形原样烘焙，按原材质切 group。
// ============================================================================

interface WholeData {
  meta: {
    groups: Array<{ start: number; count: number; material: string }>;
    materials: string[];
  };
  position: string;
  normal: string;
  uv: string;
  index: string;
}

const DATA = whole as unknown as WholeData;

function decodeBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const aligned = new Uint8Array(bytes.length);
  aligned.set(bytes);
  return aligned.buffer;
}

const wholeBuilder: GeometryBuilder = () => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array(decodeBuffer(DATA.position)), 3),
  );
  geometry.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(decodeBuffer(DATA.normal)), 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(decodeBuffer(DATA.uv)), 2));
  geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(decodeBuffer(DATA.index)), 1));
  DATA.meta.groups.forEach((group, index) => geometry.addGroup(group.start, group.count, index));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
};

export const kingjoeWholeBuilders: Record<string, GeometryBuilder> = { kjWhole: wholeBuilder };
