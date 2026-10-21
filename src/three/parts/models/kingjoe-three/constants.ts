import threeData from "./three.generated.json";

// ============================================================================
// models/kingjoe-three/constants —— 三体拆分的单一真值源
//
// 下半身 = 腿+髋（源最高 4.222m）；躯干 = 腹+胸（腹底 3.986m）；
// 头手 = 头+双手（头底 5.360m，手最低 2.428m）。
// ============================================================================

interface Data {
  meta: {
    lower: { bbox: number[]; tris: number };
    torso: { bbox: number[]; tris: number };
    headhands: { bbox: number[]; tris: number };
    abdomen_low: number;
    head_low: number;
    source_triangles: number;
  };
}

const DATA = threeData as unknown as Data;

const LOWER_TOP = DATA.meta.lower.bbox[4]!;
const ABDOMEN_LOW = DATA.meta.abdomen_low;
const HEAD_LOW = DATA.meta.head_low;
const WAIST_SEAT_Y = LOWER_TOP + 0.028;
const TENON_BASE = WAIST_SEAT_Y + 0.026;
const TENON_TOP = TENON_BASE + 0.24;
const JOINT_RADIUS = 0.48;

/** 躯干提起：腰缝榫头（4.516）完全离开腹底（3.986）并按 5cm 取整。 */
export const TORSO_LIFT = Math.ceil((TENON_TOP - ABDOMEN_LOW + 0.06) * 20) / 20;
/** 头手组：沿 +Z 先离开肩颈/手腕，再沿 +Y 提起。 */
export const HEAD_FORWARD = 0.7;
export const HEAD_LIFT = 1.8;

export const KINGJOE_THREE_CONSTANTS: Record<string, number> = {
  MODEL_HEIGHT: 6.618,
  MODEL_WIDTH: 3.683,
  MODEL_DEPTH: 2.086,
  LOWER_TOP,
  ABDOMEN_LOW,
  HEAD_LOW,
  WAIST_SEAT_Y,
  JOINT_TENON_BASE: TENON_BASE,
  JOINT_TENON_TOP: TENON_TOP,
  JOINT_SOCKET_BASE: TENON_BASE + 0.004,
  JOINT_RADIUS,
  JOINT_ANGLES: 45,
  TORSO_LIFT,
  HEAD_FORWARD,
  HEAD_LIFT,
  TRIANGLES: DATA.meta.source_triangles,
  LOWER_TRIANGLES: DATA.meta.lower.tris,
  TORSO_TRIANGLES: DATA.meta.torso.tris,
  HEAD_HANDS_TRIANGLES: DATA.meta.headhands.tris,
};

export { LOWER_TOP, ABDOMEN_LOW, HEAD_LOW, WAIST_SEAT_Y, TENON_BASE, TENON_TOP, JOINT_RADIUS };
