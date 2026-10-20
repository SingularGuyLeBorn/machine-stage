import * as THREE from "three";
import type { InstanceLayout } from "../../assembler/assembler";
import type {
  BuildLayer,
  ExprVec3,
  GeometrySpec,
  PartDefinition,
} from "../../registry/types";
import { NODE_PIVOT } from "./spec";

// ============================================================================
// t800/build —— 零件声明辅助器
//
// 只做三件事：
//   1) 把「模型坐标」换算成「节点局部坐标」（关节节点只有平移 pivot，静止无旋转；
//      液压缸节点带 rest_rotation，零件必须直接给局部坐标，用 local 标记）
//   2) 按层分配 build_order（L1 核心 / L2 传动 / L3 内构 / L4 壳板 / L5 附件）
//   3) 统一 id / 材质 / 标签的写法，避免散落的字面量
// ============================================================================

export interface PartSpec {
  id: string;
  cn: string;
  en: string;
  asm: string;
  geom: GeometrySpec;
  mat: string;
  layer?: BuildLayer;
  /** 所属节点 */
  node?: string;
  /** 模型坐标下的位置（带 node 时自动换算成节点局部） */
  at?: ExprVec3;
  /** 已经是节点局部坐标（液压件、rest_rotation 节点） */
  local?: boolean;
  rot?: ExprVec3;
  inst?: number;
  layout?: string;
  instNodes?: string[];
  tags?: string[];
  hint?: string;
  source?: string;
}

const LAYER_BASE: Record<BuildLayer, number> = { 1: 100, 2: 300, 3: 400, 4: 500, 5: 600 };

export class PartBuilder {
  readonly parts: PartDefinition[] = [];
  private readonly counters: Record<BuildLayer, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

  /** 声明一个零件。 */
  add(spec: PartSpec): PartDefinition {
    const layer = spec.layer ?? 2;
    let at = spec.at;
    // 位置坐标系：
    //   · 单件（挂在关节节点上）→ 声明模型坐标，装配器换算成节点局部；
    //   · 实例件（无 instance_nodes）→ 实例矩阵写在根空间，声明值必须已是模型坐标；
    //   · 实例件（带 instance_nodes）→ 布局函数给节点局部偏移，mate 不参与定位。
    if (at && spec.node && !spec.local && !spec.inst) {
      const pivot = NODE_PIVOT[spec.node] ?? [0, 0, 0];
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

/** 偏移布局：实例相对零件装配位的模型空间偏移（不挂节点时用）。 */
export function offsetLayout(offsets: ReadonlyArray<readonly [number, number, number]>): InstanceLayout {
  return ({ index }) => {
    const p = offsets[index] ?? offsets[0];
    return new THREE.Matrix4().makeTranslation(p[0], p[1], p[2]);
  };
}

/**
 * 实例布局（挂在节点上时使用）。
 *
 * 装配器的语义：`instance_nodes` 存在时，实例矩阵 = 节点静止矩阵 × 布局矩阵，
 * mate 不参与定位 —— 所以布局必须自己给出「节点局部」的位置与朝向。
 * 这里传入模型坐标列表，内部换算成节点局部，并可统一带一个欧拉旋转。
 */
export function instanceLayout(
  node: string,
  positions: ReadonlyArray<readonly [number, number, number]>,
  rotation?: readonly [number, number, number],
): InstanceLayout {
  const pivot = NODE_PIVOT[node] ?? [0, 0, 0];
  const quaternion = rotation
    ? new THREE.Quaternion().setFromEuler(
        new THREE.Euler(
          THREE.MathUtils.degToRad(rotation[0]),
          THREE.MathUtils.degToRad(rotation[1]),
          THREE.MathUtils.degToRad(rotation[2]),
          "XYZ",
        ),
      )
    : new THREE.Quaternion();
  return ({ index }) => {
    const p = positions[index] ?? positions[0];
    return new THREE.Matrix4().compose(
      new THREE.Vector3(p[0] - pivot[0], p[1] - pivot[1], p[2] - pivot[2]),
      quaternion,
      new THREE.Vector3(1, 1, 1),
    );
  };
}

/** 同节点的实例节点列表（长度 = 实例数）。 */
export function repeatNode(node: string, count: number): string[] {
  return new Array(count).fill(node);
}

/** 线布局（挂节点的实例，偏移相对节点原点）。 */
export function nodeLineLayout(
  positions: ReadonlyArray<readonly [number, number, number]>,
  node: string,
): InstanceLayout {
  const pivot = NODE_PIVOT[node] ?? [0, 0, 0];
  return ({ index }) => {
    const p = positions[index] ?? positions[0];
    return new THREE.Matrix4().makeTranslation(p[0] - pivot[0], p[1] - pivot[1], p[2] - pivot[2]);
  };
}
