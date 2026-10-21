import * as THREE from "three";
import type { GeometryBuilder } from "../../assembler/geometry";
import raw from "./segments.generated.json";

// ============================================================================
// models/kingjoe-skin/kits —— 真实网格分件几何
//
// segments.generated.json 由 scripts/generate-kingjoe-skin.py 生成：
// 每件 positions/normals/uvs/index 以 base64 存储，几何已转到所属模块局部坐标。
// 奥特曼 IP，个人参考，不做商用。
// ============================================================================

interface GeneratedSegment {
  key: string;
  position: string;
  normal: string;
  uv: string;
  index: string;
}

const SEGMENTS = new Map<string, GeneratedSegment>(
  (raw as unknown as { parts: GeneratedSegment[] }).parts.map((part) => [part.key, part]),
);

function decodeBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const aligned = new Uint8Array(bytes.length);
  aligned.set(bytes);
  return aligned.buffer;
}

const segmentBuilder: GeometryBuilder = (spec) => {
  const key = (spec as unknown as { params?: { key?: string } }).params?.key;
  if (!key) throw new Error("kjrSegment：缺少 params.key");
  const part = SEGMENTS.get(key);
  if (!part) throw new Error(`kjrSegment：找不到分件 "${key}"`);
  const position = new Float32Array(decodeBuffer(part.position));
  const normal = new Float32Array(decodeBuffer(part.normal));
  const uv = new Float32Array(decodeBuffer(part.uv));
  const index = new Uint32Array(decodeBuffer(part.index));
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(position, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(normal, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
};

export const kingjoeSkinBuilders: Record<string, GeometryBuilder> = {
  kjrSegment: segmentBuilder,
};

export const KINGJOE_SKIN_SEGMENT_KEYS = [...SEGMENTS.keys()];
