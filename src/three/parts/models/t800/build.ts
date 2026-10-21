import type { InstanceLayout } from "../../assembler/assembler";
import type {
  BuildLayer,
  ExprVec3,
  GeometrySpec,
  PartDefinition,
} from "../../registry/types";

// ============================================================================
// t800/build —— 真实网格模型的零件声明辅助器
//
// 与"自造零件"版本的区别：这里没有"腿局部坐标"那套换算 —— 零件的 at 一律是
// **模型坐标**，装配器按节点 pivot 换算成节点局部。
// ============================================================================

export interface PartSpec {
  id: string;
  cn: string;
  en: string;
  asm: string;
  geom: GeometrySpec;
  mat: string;
  layer?: BuildLayer;
  /** 所属节点（动画挂点） */
  node?: string;
  /** 模型坐标下的装配位 */
  at?: ExprVec3;
  /** 已经是节点局部坐标 */
  local?: boolean;
  rot?: ExprVec3;
  inst?: number;
  layout?: string;
  instNodes?: string[];
  tags?: string[];
  hint?: string;
  source?: string;
}

const LAYER_BASE: Record<BuildLayer, number> = { 1: 100, 2: 300, 3: 700, 4: 1100, 5: 1500 };

export class PartBuilder {
  readonly parts: PartDefinition[] = [];
  private readonly counters: Record<BuildLayer, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  /** 节点 pivot（模型坐标）：节点名 → 位置 */
  private readonly pivots: Record<string, [number, number, number]>;

  constructor(pivots: Record<string, [number, number, number]> = {}) {
    this.pivots = pivots;
  }

  /** 声明一个零件。 */
  add(spec: PartSpec): PartDefinition {
    const layer = spec.layer ?? 2;
    let at = spec.at;
    // 模型坐标 → 节点局部（节点 pivot 是模型坐标）
    if (at && spec.node && !spec.local) {
      const pivot = this.pivots[spec.node] ?? [0, 0, 0];
      at = [Number(at[0]) - pivot[0], Number(at[1]) - pivot[1], Number(at[2]) - pivot[2]];
    }
    const mate =
      at || spec.rot
        ? {
            type: "absolute" as const,
            ...(at ? { position: at } : {}),
            ...(spec.rot ? { rotation: spec.rot } : {}),
          }
        : undefined;
    const definition: PartDefinition = {
      id: spec.id,
      name_cn: spec.cn,
      name_en: spec.en,
      assembly: spec.asm,
      build_layer: layer,
      build_order: LAYER_BASE[layer] + this.counters[layer]++,
      geometry: spec.geom,
      material: spec.mat,
      ...(spec.node ? { node: spec.node } : {}),
      ...(mate ? { mate } : {}),
      ...(spec.inst ? { instances: spec.inst, indexed: true } : {}),
      ...(spec.layout ? { instance_layout: spec.layout } : {}),
      ...(spec.instNodes ? { instance_nodes: spec.instNodes } : {}),
      ...(spec.tags ? { tags: spec.tags } : {}),
      ...(spec.hint ? { hint: spec.hint } : {}),
      ...(spec.source ? { source: spec.source } : {}),
    };
    this.parts.push(definition);
    return definition;
  }
}

export type { InstanceLayout };
