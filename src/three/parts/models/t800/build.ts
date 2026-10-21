import * as THREE from "three";
import type { InstanceLayout } from "../../assembler/assembler";
import type {
  BuildLayer,
  ExprVec3,
  GeometrySpec,
  PartDefinition,
} from "../../registry/types";
import {
  NODE_NAMES,
  NODE_PIVOT,
  PELVIS_NODE,
  legPivot,
  mirrorEuler,
  sideZ,
  type LegSide,
} from "./spec";

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
  /** at 是**模型坐标**（不参与腿的横向镜像；手臂/头骨用） */
  modelSpace?: boolean;
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
  private readonly counters: Record<BuildLayer, number>;
  /** 侧别：1 = 右腿，-1 = 左腿（-1 时整条腿沿 Z 镜像）。 */
  readonly side: LegSide;
  private readonly pivots: Record<string, [number, number, number]>;

  constructor(
    side: LegSide = 1,
    counters?: Record<BuildLayer, number>,
    /** 额外节点的 pivot（手臂 / 头骨），模型坐标 */
    pivots?: Record<string, [number, number, number]>,
  ) {
    this.side = side;
    // 左右腿共用计数器：build_order 全局唯一，但仍按层递增（自内向外）
    this.counters = counters ?? { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    this.pivots = pivots ?? {};
  }

  /** 节点 pivot（模型坐标）：腿节点走侧别换算，手臂/头骨节点查附加表。 */
  pivotOf(node: string): [number, number, number] {
    const extra = this.pivots[node];
    if (extra) return extra;
    const leg = legPivot(node, this.side);
    return leg ?? [0, 0, 0];
  }

  /** 右腿节点名 → 左腿节点名。 */
  private nodeName(node: string): string {
    if (this.side > 0 || node === PELVIS_NODE) return node;
    const canonical = Object.keys(NODE_NAMES).find((key) => NODE_NAMES[key] === node);
    return canonical ? `${NODE_NAMES[canonical]}L` : `${node}L`;
  }

  /** 布局键：左腿加 _L 后缀，避免与右腿共用同一份布局。 */
  layoutKey(key: string): string {
    return this.side > 0 ? key : `${key}_L`;
  }

  /** 声明一个零件（左腿跳过骨盆件：骨盆两腿共用，只建一次）。 */
  add(spec: PartSpec): PartDefinition | null {
    if (this.side < 0 && spec.node === PELVIS_NODE) return null;
    const layer = spec.layer ?? 2;
    const side = this.side;
    const node = spec.node ? this.nodeName(spec.node) : undefined;
    let at = spec.at;
    // 位置坐标系：
    //   · 单件（挂在关节节点上）→ 声明模型坐标，装配器换算成节点局部；
    //   · 实例件（无 instance_nodes）→ 实例矩阵写在根空间，声明值必须已是模型坐标；
    //   · 实例件（带 instance_nodes）→ 布局函数给节点局部偏移，mate 不参与定位。
    let pos: [number, number, number] | undefined;
    const isPelvis = node === PELVIS_NODE;
    if (at) {
      const z = Number(at[2]);
      // 腿局部坐标 → 世界坐标（z 走侧别）；节点局部件（local）只做镜像；
      // 骨盆件本来就是世界坐标（两腿共用），不参与换算。
      pos = isPelvis || spec.modelSpace
        ? [Number(at[0]), Number(at[1]), z]
        : [
            Number(at[0]),
            Number(at[1]),
            spec.local ? (side > 0 ? z : -z) : sideZ(side, z),
          ];
      if (node && !spec.local && !spec.inst) {
        const pivot = this.pivotOf(node);
        pos = [pos[0] - pivot[0], pos[1] - pivot[1], pos[2] - pivot[2]];
      }
    }
    const rot: [number, number, number] | undefined = spec.rot
      ? side > 0
        ? [Number(spec.rot[0]), Number(spec.rot[1]), Number(spec.rot[2])]
        : mirrorEuler([
            Number(spec.rot[0]),
            Number(spec.rot[1]),
            Number(spec.rot[2]),
          ])
      : undefined;
    const mate =
      pos || rot
        ? {
            type: "absolute" as const,
            ...(pos ? { position: pos } : {}),
            ...(rot ? { rotation: rot } : {}),
          }
        : undefined;
    // 左腿：整块几何沿 Z 镜像（法线与绕序一并修正）
    const geom: GeometrySpec =
      side < 0 && !isPelvis && !spec.geom.mirror ? { ...spec.geom, mirror: "z" } : spec.geom;
    const definition: PartDefinition = {
      id: side < 0 ? `${spec.id}_left` : spec.id,
      name_cn: spec.cn,
      name_en: spec.en,
      assembly: spec.asm,
      build_layer: layer,
      build_order: LAYER_BASE[layer] + this.counters[layer]++,
      geometry: geom,
      material: spec.mat,
      ...(node ? { node } : {}),
      ...(mate ? { mate } : {}),
      ...(spec.inst ? { instances: spec.inst, indexed: true } : {}),
      ...(spec.layout ? { instance_layout: this.layoutKey(spec.layout) } : {}),
      ...(spec.instNodes
        ? { instance_nodes: spec.instNodes.map((name) => this.nodeName(name)) }
        : {}),
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
