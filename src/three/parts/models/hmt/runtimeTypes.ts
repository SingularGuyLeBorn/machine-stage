import type { ModelRegistry } from "../../registry/types";

export interface PackedAttribute {
  offset: number;
  length: number;
  itemSize: number;
  type: "float32" | "uint32";
}
export interface PackedPart {
  id: string;
  chunk: number;
  attributes: Record<string, PackedAttribute>;
  index: PackedAttribute;
  bvh: { version: number; roots: Array<{ offset: number; bytes: number }>; indirect: PackedAttribute };
}
export interface HmtRuntimeData {
  registry: ModelRegistry;
  chunks: Array<{ url: string; bytes: number; hash: string; dataHash: string }>;
  parts: PackedPart[];
  triangles: number;
}
