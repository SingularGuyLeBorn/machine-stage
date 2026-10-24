import type { InstanceLayout } from "../../assembler/assembler";
import type { GeometrySpec, MateSpec, NodeDef, PartDefinition } from "../../registry/types";

// ============================================================================
// models/carrier/common —— 各分册共用的小工具 + 生成上下文
// ============================================================================

export interface CarrierCtx {
  parts: PartDefinition[];
  nodes: NodeDef[];
  layouts: Record<string, InstanceLayout>;
  add: (part: Omit<PartDefinition, "build_order">) => void;
  node: (def: NodeDef) => void;
  layout: (key: string, fn: InstanceLayout) => void;
}

export function carrierContext(): CarrierCtx {
  const parts: PartDefinition[] = [];
  const nodes: NodeDef[] = [];
  const layouts: Record<string, InstanceLayout> = {};
  const counters = new Map<number, number>();
  return {
    parts,
    nodes,
    layouts,
    add: (part) => {
      const next = (counters.get(part.build_layer) ?? 0) + 1;
      counters.set(part.build_layer, next);
      parts.push({ ...part, build_order: part.build_layer * 100000 + next });
    },
    node: (def) => nodes.push(def),
    layout: (key, fn) => {
      layouts[key] = fn;
    },
  };
}

export const A = (position: [number, number, number], rotation?: [number, number, number]): MateSpec =>
  rotation ? { type: "absolute", position, rotation } : { type: "absolute", position };

export const B = (
  w: number,
  h: number,
  d: number,
  at: [number, number, number] = [0, 0, 0],
  bevel = 0.006,
): GeometrySpec & { at: [number, number, number] } => ({ type: "box", w, h, d, bevel, at });

export const C = (
  r: number,
  h: number,
  at: [number, number, number] = [0, 0, 0],
  segments = 20,
  rTop = r,
): GeometrySpec & { at: [number, number, number] } => ({
  type: "cylinder",
  r,
  h,
  rTop,
  segments,
  bevel: 0.002,
  at,
});

export const T = (
  ro: number,
  ri: number,
  h: number,
  at: [number, number, number] = [0, 0, 0],
  segments = 24,
): GeometrySpec & { at: [number, number, number] } => ({
  type: "tube",
  rOuter: ro,
  rInner: ri,
  h,
  segments,
  at,
});

export const S = (
  r: number,
  at: [number, number, number] = [0, 0, 0],
  segments = 16,
): GeometrySpec & { at: [number, number, number] } => ({ type: "sphere", r, segments, at });

export const M = (...items: Array<GeometrySpec & { at?: [number, number, number] }>): GeometrySpec => ({
  type: "merge",
  parts: items,
});

export const pad = (value: number, width = 2): string => String(value).padStart(width, "0");
