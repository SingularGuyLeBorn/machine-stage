import * as THREE from "three";
import { cylinderGeometry, tubeGeometry } from "../../kernel/geometry";

// ============================================================================
// t800/tendon —— 手指屈肌腱（可见的腱索零件）
//
// 手指不是"各节自己转"：屈肌腱从掌面出发，绕过近节关节的滑轮拉到中节，
// 近节一卷，腱索就被拉长、中节被动跟着卷。
//
// 这里把腱索做成**真零件**：一根按单位长度建的细缆 + 一个每帧驱动的节点。
// 运行时按"掌面锚点 → 中节滑轮"的实际距离缩放它（|AB| 变化 = 腱索被拉伸），
// 所以抓握时能看见腱索在拉长/回缩。
// ============================================================================

/** 一根腱索。 */
export interface TendonDef {
  key: string;
  /** 手指（thumb/index/middle/ring/pinky） */
  finger: string;
  /** 侧别 R / L */
  side: "R" | "L";
  /** 掌面上的锚点（模型坐标，静止姿态） */
  anchor: [number, number, number];
  /** 索的半径 */
  radius: number;
}

/** 手指滑轮（每个关节一个小导向轮）。 */
export interface PulleyDef {
  key: string;
  finger: string;
  side: "R" | "L";
  /** 关节位置（模型坐标） */
  at: [number, number, number];
  radius: number;
}

/** 全部手指（左右各 5 根）。 */
export const FINGERS = ["thumb", "index", "middle", "ring", "pinky"] as const;

/**
 * 每根手指三节在源网格里的骨骼名（右手 / 左手）。
 * 源网格的指骨编号不规则，直接查名字 ✓。
 */
export const FINGER_BONES: Record<
  string,
  { proximal: string; middle: string; distal: string }
> = {
  thumb_R: { proximal: "bip_thumb_0_R_00", middle: "bip_thumb_1_R_032", distal: "bip_thumb_2_R_033" },
  thumb_L: { proximal: "bip_thumb_0_L_071", middle: "bip_thumb_1_L_072", distal: "bip_thumb_2_L_073" },
  index_R: { proximal: "bip_index_0_R_017", middle: "bip_index_1_R_018", distal: "bip_index_2_R_019" },
  index_L: { proximal: "bip_index_0_L_056", middle: "bip_index_1_L_057", distal: "bip_index_2_L_058" },
  middle_R: { proximal: "bip_middle_0_R_020", middle: "bip_middle_1_R_021", distal: "bip_middle_2_R_022" },
  middle_L: { proximal: "bip_middle_0_L_059", middle: "bip_middle_1_L_060", distal: "bip_middle_2_L_061" },
  ring_R: { proximal: "bip_ring_0_R_025", middle: "bip_ring_1_R_026", distal: "bip_ring_2_R_027" },
  ring_L: { proximal: "bip_ring_0_L_064", middle: "bip_ring_1_L_065", distal: "bip_ring_2_L_066" },
  pinky_R: { proximal: "bip_pinky_0_R_029", middle: "bip_pinky_1_R_030", distal: "bip_pinky_2_R_031" },
  pinky_L: { proximal: "bip_pinky_0_L_068", middle: "bip_pinky_1_L_069", distal: "bip_pinky_2_L_070" },
};

/** 侧别 → 中指（拇指等）的横向偏移符号：右手 +1，左手 −1。 */
function sideSign(side: "R" | "L"): number {
  return side === "R" ? 1 : -1;
}

/**
 * 由手指各节的位置生成腱索与滑轮。
 * @param joints 手指各节的世界位置（近→中→末），静止姿态
 * @param palm 掌心（腱索起点的参考点）
 */
export function buildTendons(
  joints: Record<string, { proximal: THREE.Vector3; middle: THREE.Vector3; distal: THREE.Vector3 }>,
  palm: Record<"R" | "L", THREE.Vector3>,
): { tendons: TendonDef[]; pulleys: PulleyDef[] } {
  const tendons: TendonDef[] = [];
  const pulleys: PulleyDef[] = [];
  for (const side of ["R", "L"] as const) {
    for (const finger of FINGERS) {
      const j = joints[`${finger}_${side}`];
      if (!j) continue;
      const s = sideSign(side);
      // 掌面锚点：在掌心附近、沿手指方向的稍上方
      const anchor = palm[side]
        .clone()
        .addScaledVector(j.proximal.clone().sub(palm[side]).normalize(), 0.012)
        .add(new THREE.Vector3(0, 0.006 * s, 0));
      tendons.push({
        key: `${finger}_${side}`,
        finger,
        side,
        anchor: [anchor.x, anchor.y, anchor.z],
        radius: 0.0022,
      });
      // 滑轮：近节与中节各一个
      for (const [i, at] of [j.proximal, j.middle].entries()) {
        pulleys.push({
          key: `${finger}_${side}_p${i}`,
          finger,
          side,
          at: [at.x, at.y, at.z],
          radius: 0.0055,
        });
      }
    }
  }
  return { tendons, pulleys };
}

/** 腱索几何：沿 +Y 的单位长度细缆（运行时按长度缩放）。 */
export function tendonGeometry(radius: number): THREE.BufferGeometry {
  const g = tubeGeometry(radius, radius * 0.55, 1, 8);
  g.translate(0, 0.5, 0);
  return g;
}

/** 滑轮几何：小圆轮（绕 X 转的扁轮）。 */
export function pulleyGeometry(radius: number): THREE.BufferGeometry {
  const g = cylinderGeometry(radius, radius * 0.55, radius * 1.6, 12);
  g.rotateZ(Math.PI / 2);
  return g;
}
