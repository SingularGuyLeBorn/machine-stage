import lower from "./lower.generated.json";

// ============================================================================
// models/kingjoe-lower/constants —— 髋缝两体拆分的单一真值源
//
// 下半身 = King Legs 腿体飞船（腿+髋鼓，源网格最高 3.598m）；
// 上半身 = 骨盆以上（骨盆中柱最低 2.570m，伸进下半身髋腔）。
// 髋缝硬件全部从这几个高度派生，改 lift 不会把榫头留在槽里。
// ============================================================================

interface SplitData {
  meta: {
    lower: { bbox: number[]; tris: number };
    upper: { bbox: number[]; tris: number };
    waist_low: number;
  };
}

const DATA = lower as unknown as SplitData;

const LOWER_TOP = DATA.meta.lower.bbox[4]!;
const WAIST_LOW = DATA.meta.waist_low;
const TENON_HEIGHT = 0.24;
const JOINT_RADIUS = 0.52;

// 承座顶面 = 楔榫底；再向下 3mm 给榫头一点装配间隙。
const SEAT_TOP = LOWER_TOP - 0.055;
const TENON_BASE = SEAT_TOP + 0.003;
const TENON_TOP = TENON_BASE + TENON_HEIGHT;

// 中柱完全退出髋腔至少要 TENON_TOP-WAIST_LOW；留 6cm 余量并按 5cm 取整。
const UPPER_LIFT = Math.ceil((TENON_TOP - WAIST_LOW + 0.06) * 20) / 20;

export const KINGJOE_LOWER_CONSTANTS: Record<string, number> = {
  MODEL_HEIGHT: 6.618,
  MODEL_WIDTH: 3.683,
  MODEL_DEPTH: 2.086,
  LOWER_TOP,
  WAIST_LOW,
  SEAT_TOP,
  JOINT_COLLAR_Y: SEAT_TOP - 0.03,
  JOINT_TENON_BASE: TENON_BASE,
  JOINT_TENON_TOP: TENON_TOP,
  JOINT_SOCKET_BASE: TENON_BASE + 0.002,
  JOINT_RADIUS,
  JOINT_ANGLES: 45,
  JOINT_SEAT_R_OUTER: 0.6,
  JOINT_SEAT_R_INNER: 0.3,
  UPPER_LIFT,
  TRIANGLES: DATA.meta.lower.tris + DATA.meta.upper.tris,
  LOWER_TRIANGLES: DATA.meta.lower.tris,
  UPPER_TRIANGLES: DATA.meta.upper.tris,
};

export { LOWER_TOP, WAIST_LOW, SEAT_TOP, TENON_BASE, TENON_TOP, JOINT_RADIUS, UPPER_LIFT, TENON_HEIGHT };
