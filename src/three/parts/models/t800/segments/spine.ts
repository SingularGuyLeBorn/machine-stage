import * as THREE from "three";
import type { InstanceLayout } from "../../../assembler/assembler";
import { type PartBuilder } from "../build";

// ============================================================================
// t800/segments/spine —— 脊柱（24 节 + 23 枚椎间盘 + 中央液压柱 + 竖脊肌）
//
// 参考图读法：脊柱是**逐节可见**的机械柱，每节 = 椎体 + 椎弓 + 向后翘的棘突，
// 节间夹一枚深色椎间盘；脊柱前方有一根中央承重液压柱，两侧各一组长缸（竖脊肌）。
//
// 坐标：+X 前、+Y 上、+Z 右。脊柱沿 Y 排布，带轻微前后弧（腰前凸、胸后凸）。
// ============================================================================

/** 24 节椎骨（腰 5 + 胸 12 + 颈 7）：[y 高度, x 前后偏移, 半径] */
export const VERTEBRAE: Array<[number, number, number]> = [
  // 腰椎：粗壮、前凸（腰前凸）
  [1.600, -0.030, 0.030],
  [1.618, -0.026, 0.029],
  [1.636, -0.021, 0.028],
  [1.654, -0.017, 0.027],
  [1.672, -0.014, 0.026],
  // 胸椎：细长、后凸（胸后凸）
  [1.687, -0.012, 0.024],
  [1.702, -0.014, 0.023],
  [1.717, -0.017, 0.022],
  [1.732, -0.020, 0.021],
  [1.747, -0.022, 0.020],
  [1.762, -0.024, 0.020],
  [1.777, -0.025, 0.019],
  [1.792, -0.026, 0.019],
  [1.807, -0.026, 0.018],
  [1.822, -0.025, 0.018],
  [1.837, -0.023, 0.017],
  [1.852, -0.021, 0.017],
  // 颈椎：最小最密
  [1.864, -0.019, 0.016],
  [1.876, -0.016, 0.016],
  [1.888, -0.013, 0.015],
  [1.900, -0.010, 0.015],
  [1.912, -0.007, 0.014],
  [1.924, -0.004, 0.014],
  [1.936, -0.001, 0.013],
];

/** 脊柱节点名（24 节，逐节可弯）。 */
export const SPINE_NODES = VERTEBRAE.map((_, i) => `T800Vert${i}`);

/** 脊柱节点 pivot（模型坐标）：跟着椎骨中心线走。 */
export const SPINE_PIVOTS = VERTEBRAE.map(([y, x]) => [x, y, 0] as [number, number, number]);

/**
 * 逐实例按**各自节点**定位的布局。
 * 实例矩阵 = 该实例自己的节点静止矩阵 × 本布局给的节点内偏移，
 * 所以偏移必须相对该实例所在节点的 pivot 算（不能拿组的第一个 pivot 套所有实例）。
 */
export function perNodeLayout(positions: Array<[number, number, number]>): InstanceLayout {
  return ({ index, node }) => {
    const p = positions[index] ?? positions[0];
    const idx = node ? SPINE_NODES.indexOf(node) : -1;
    const pivot = idx >= 0 ? SPINE_PIVOTS[idx] : ([0, 0, 0] as [number, number, number]);
    return new THREE.Matrix4().makeTranslation(p[0] - pivot[0], p[1] - pivot[1], p[2] - pivot[2]);
  };
}

export function buildSpine(builder: PartBuilder, layouts: Record<string, InstanceLayout>): void {
  // ---- 骶骨：脊柱底端坐在骨盆顶板上 ----
  builder.add({
    id: "t800.spine.sacrum",
    cn: "骶骨",
    en: "Sacrum",
    asm: "spine",
    geom: { type: "kit", kit: "t800Vertebra", params: { h: 0.07, r: 0.034, archW: 0.03, spinous: 0.02, spinousTilt: 75, transverse: 0.028 } },
    mat: "bone",
    layer: 1,
    node: SPINE_NODES[0],
    local: true,
    at: [-0.075, -0.05, 0],
    hint: "骶骨：脊柱底端与骨盆顶板的承力连接块",
  });

  // ---- 24 节椎骨（三种规格 × 实例族）----
  const groups: Array<{ key: string; cn: string; en: string; from: number; to: number; r: number }> = [
    { key: "lumbar", cn: "腰椎", en: "Lumbar vertebra", from: 0, to: 5, r: 0.030 },
    { key: "thoracic", cn: "胸椎", en: "Thoracic vertebra", from: 5, to: 17, r: 0.022 },
    { key: "cervical", cn: "颈椎", en: "Cervical vertebra", from: 17, to: 24, r: 0.016 },
  ];
  for (const group of groups) {
    const count = group.to - group.from;
    builder.add({
      id: `t800.spine.vert_${group.key}`,
      cn: `${group.cn}（实例族）`,
      en: `${group.en} family`,
      asm: "spine",
      geom: {
        type: "kit",
        kit: "t800Vertebra",
        params: {
          h: 0.008,
          r: group.r,
          archW: group.r * 0.9,
          spinous: group.r * 0.5,
          spinousTilt: 75,
          transverse: group.r * 0.9,
        },
      },
      mat: "chrome",
      layer: 2,
      node: SPINE_NODES[group.from],
      local: true,
      at: [0, 0, 0],
      inst: count,
      layout: `t800.spine.vert_${group.key}`,
      instNodes: SPINE_NODES.slice(group.from, group.to),
      hint: "椎体 + 椎弓 + 棘突一体件；逐节挂在独立节点上，可逐节弯曲",
    });
    layouts[`t800.spine.vert_${group.key}`] = perNodeLayout(
      VERTEBRAE.slice(group.from, group.to).map(([y, x]) => [x, y, 0] as [number, number, number]),
    );
  }

  // ---- 23 枚椎间盘（节间弹性段，深色橡胶；按椎径分三组）----
  const discGroups: Array<{ key: string; cn: string; from: number; to: number; r: number }> = [
    { key: "lumbar", cn: "腰椎间盘", from: 0, to: 5, r: 0.024 },
    { key: "thoracic", cn: "胸椎间盘", from: 5, to: 17, r: 0.0145 },
    { key: "cervical", cn: "颈椎间盘", from: 17, to: 23, r: 0.0095 },
  ];
  for (const group of discGroups) {
    const count = group.to - group.from;
    builder.add({
      id: `t800.spine.discs_${group.key}`,
      cn: `${group.cn}（实例族）`,
      en: `${group.cn} family`,
      asm: "spine",
      geom: { type: "kit", kit: "t800Disc", params: { h: 0.005, r: group.r } },
      mat: "rubber",
      layer: 4,
      node: SPINE_NODES[group.from],
      local: true,
      at: [0, 0, 0],
      inst: count,
      layout: `t800.spine.discs_${group.key}`,
      instNodes: SPINE_NODES.slice(group.from, group.to),
      hint: "夹在相邻椎节之间的弹性段（深色橡胶），随下节椎骨一起转",
    });
    layouts[`t800.spine.discs_${group.key}`] = perNodeLayout(
      VERTEBRAE.slice(group.from, group.to).map(([y, x], i) => {
        const next = VERTEBRAE[group.from + i + 1];
        return [x + (next[1] - x) * 0.5, y + (next[0] - y) * 0.5, 0] as [number, number, number];
      }),
    );
  }

}

/** 颈椎顶部（寰椎）高度——头骨挂点。 */
export const NECK_TOP_Y = VERTEBRAE[VERTEBRAE.length - 1][0] + 0.02;
export const NECK_TOP_X = VERTEBRAE[VERTEBRAE.length - 1][1] + 0.01;
