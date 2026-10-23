// ============================================================================
// models/ak47 —— AK-47 导气式自动机（7.62×39mm）
//
// 坐标系（全枪统一）：
//   +Z = 枪口方向（向前），+Y = 上，+X = 右（抛壳窗在右侧）。
//   原点 = 枪管轴线与枪机闭锁位前端面（枪膛末端）的交点。
//   即 z=0 是弹壳底面在闭锁态的位置，枪管向 +Z 伸 415mm。
//
// 口径（俄军《7.62mm AK 操作手册》+ Kalashnikov Concern 爆炸图）：
//   全枪长 880mm（固定枪托）、枪管长 415mm（含膛线 4 条右旋 1:240mm）、
//   7.62×39 弹（壳长 38.7 / 全弹长 56.0 / 弹头 ⌀7.92 / 壳底外径 ⌀11.3）、
//   导气式自动方式 + 枪机回转闭锁（闭锁凸笋 2 个、回转 ~48°），
//   理论射速 600 发/分（循环周期 0.1s；展示节奏放慢到 1.8s 便于观察机构）。
//
// 分层（自内向外）：
//   L1 枪管组 + 导气系统 + 枪机组 + 击发机构（核心机构）
//   L2 弹匣 + 弹药（30 发，弧形弹匣，逐发消耗）
//   L4 机匣/机匣盖/护木/握把/枪托/瞄具（外壳家具）
//   L5 表面附件（通条/背带环/枪口积碳）
//   fx 枪口焰 / 抛壳（飞行件、按标签豁免支撑检测）
// ============================================================================

export const AK47_CONSTANTS = {
  // ---- 枪管（z: 0 → 0.415 向枪口）----
  BARREL_LEN: 0.415,
  BARREL_R: 0.0085, // 枪管外径（节套前段）
  BARREL_R_MUZZLE: 0.0078,
  CHAMBER_R: 0.0061, // 弹膛半径（壳底外径 11.3 → r 5.65，留 0.45 间隙）
  BORE_R: 0.00381, // 阴线（groove）半径 ⌀7.62
  LAND_R: 0.00395, // 阳线（land）半径 ⌀7.90
  RIFLE_TWIST: 1.7, // 415mm / 240mm ≈ 1.73 圈
  BARREL_TRUNNION_R: 0.0135, // 节套（trunnion）半径
  BARREL_TRUNNION_LEN: 0.055,

  // ---- 导气系统（导气箍在 z ≈ 0.315，燃气推活塞）----
  GAS_BLOCK_Z: 0.315,
  GAS_BLOCK_R: 0.0105,
  GAS_BLOCK_LEN: 0.032,
  GAS_PORT_R: 0.0022, // 导气孔半径（4.4mm）
  GAS_TUBE_Z0: 0.318,
  GAS_TUBE_LEN: 0.115,
  GAS_TUBE_R: 0.0048,
  GAS_TUBE_Y: 0.018, // 导气管轴线高度（枪膛轴上 18mm：避开节套与机匣顶）
  PISTON_R: 0.0082, // 活塞头半径
  PISTON_LEN: 0.075,
  PISTON_Z: 0.36, // 活塞前端（全forward）z 位置

  // ---- 枪机组（回转闭锁）----
  CARRIER_Z_FORWARD: -0.03, // 枪机框前端面（闭锁位，罩住枪机尾部）
  CARRIER_LEN: 0.172, // 枪机框长（含复进簧腔）
  CARRIER_R: 0.0125,
  CARRIER_STROKE: 0.085, // 枪机框后坐行程（85mm，与 motion 同源；抛壳窗加长后全程可见）
  CARRIER_BORE_R: 0.0078, // 枪机框内径（枪机身在里头滑）
  BOLT_R: 0.0075, // 枪机身半径（⌀15）
  BOLT_LEN: 0.062,
  BOLT_ROTATION_DEG: 48, // 闭锁回转角（用户要求大于旧版 38°，放大到 48° 便于观察）
  LUG_R: 0.0128, // 闭锁凸笋半径（⌀25.6）
  LUG_W: 0.0115, // 凸笋宽度（弦向）
  LUG_T: 0.0045, // 凸笋厚度（径向）
  FIRING_PIN_R: 0.0022,
  FIRING_PIN_LEN: 0.058,
  FIRING_PIN_STROKE: 0.003, // 击针前冲 3mm
  FIRING_PIN_TAIL_Z: -0.065,
  EXTRACTOR_Z: -0.012, // 抽壳钩位置（相对枪机前端）
  EXTRACTOR_H: 0.012,
  EJECTOR_Z: -0.02, // 抛壳挺（固定在机匣上）

  // ---- 复进簧 ----
  RECOIL_SPRING_R: 0.0085,
  RECOIL_SPRING_LEN: 0.08,
  RECOIL_SPRING_WIRE: 0.0012,
  RECOIL_SPRING_COILS: 8,
  SPRING_GUIDE_R: 0.0055,
  RECOIL_SPRING_ABUT_Z: -0.215, // 固定支座（机匣后端 boss 前 10mm）
  RECOIL_SPRING_SHOULDER_Z: -0.135, // 枪机框内簧肩（随动）

  // ---- 击发机构（机匣下部尾段：击锤/扳机/快慢机 + 三销）----
  HAMMER_Y: -0.04,
  HAMMER_PIVOT_Z: -0.085,
  HAMMER_SWING_DEG: 50,
  HAMMER_LEN: 0.055,
  HAMMER_R: 0.007,
  TRIGGER_Y: -0.042,
  TRIGGER_PIVOT_Z: -0.095,
  TRIGGER_BLADE_Y: -0.085,
  TRIGGER_PULL_DEG: 10,
  TRIGGER_LEN: 0.045,
  SELECTOR_PIVOT_Y: -0.020,
  SELECTOR_PIVOT_Z: -0.105,
  SELECTOR_LEN: 0.055,
  SELECTOR_SWING_DEG: 40,

  // ---- 弹匣（弧形双列交错，30 发）----
  MAG_FEED_Y: -0.018, // 供弹位弹心高（枪膛轴下 10mm：抱弹口与膛线近似对中）
  MAG_FEED_Z: -0.0304, // 供弹位弹底 z（弹头尖距枪膛 5mm）
  MAG_PITCH: 0.0102, // 相邻两弹沿弧的间距（半槽）
  MAG_ROWS: 30, // 弹数（双列交错，每列 15）
  MAG_ARC_R: 0.105, // 弹匣弧半径
  MAG_ARC_MAX_DEG: 83, // 最下一发相对 +Z 的倾角
  MAG_W: 0.03, // 弹匣外宽（X）
  MAG_WALL_T: 0.0016, // 弹匣壁厚
  MAG_BACK_T: 0.0022, // 后壁厚
  MAG_DEPTH: 0.0124, // 弹匣内外深（弹径 ⌀9.9 + 间隙）
  MAG_LIP_HALF: 0.0062, // 抱弹口半深
  MAG_STAGGER_X: 0.0053, // 双列横错半距（收敛于抱弹口）
  FOLLOWER_SLOT_MAX: 14.5, // 满弹时托弹板弧位
  MAG_FLOOR_SLOT: 16.4, // 底板弧位

  // ---- 弹药 7.62×39 ----
  CASE_RIM_R: 0.00565, // 壳底外缘
  CASE_BODY_R: 0.005,
  CASE_NECK_R: 0.0045,
  CASE_LEN: 0.0387,
  BULLET_R: 0.00425, // ⌀8.5 被甲（含弹尖）
  BULLET_LEN: 0.0265,
  BULLET_CORE_R: 0.0031,
  BULLET_CORE_LEN: 0.021,
  BULLET_STEEL_R: 0.0018,
  BULLET_STEEL_LEN: 0.012,
  PROPELLANT_R: 0.0038,
  PROPELLANT_LEN: 0.03,
  PRIMER_R: 0.0032,
  PRIMER_H: 0.0018,

  // ---- 外壳家具 ----
  RECEIVER_Z0: -0.235, // 机匣尾端
  RECEIVER_Z1: 0.055, // 机匣前端（节套后）
  RECEIVER_W: 0.042, // 机匣外宽
  RECEIVER_H: 0.05, // 机匣外高
  STOCK_Z0: -0.36, // 枪托尾端
  GRIP_Z: -0.13, // 握把位置
  HANDGUARD_Z0: 0.06,
  HANDGUARD_Z1: 0.29,
  MUZZLE_Z: 0.415,

  // ---- 动画节奏（视觉放慢 ~3 倍，展示机构）----
  FIRE_T: 0.1, // 击发时刻（相对每发循环起点）
  RECOIL_T0: 0.14, // 导气推动开始（弹头出膛 40ms 后燃气到活塞）
  RECOIL_T1: 0.52, // 后坐到底
  RETURN_T0: 0.6,
  RETURN_T1: 1.02, // 复进供弹闭锁完成
  CYCLE_T: 1.8, // 循环周期

  // ---- 抛壳 ----
  EJECT_PORT_Y: -0.028, // 抛壳窗中心高（枪膛轴下 28mm 处）
  EJECT_PORT_Z0: -0.075,
  EJECT_PORT_Z1: 0.02,
  EJECT_PORT_H: 0.055, // 窗高
  EJECT_VX: 2.2, // 向右（+X）
  EJECT_VY: 0.9, // 微上扬
  EJECT_VZ: 1.1, // 微前
  EJECT_ROLL: 3.2, // 翻转角速度

  // ---- 台面 ----
  STAGE_Y: 0.3, // 枪膛轴离地高度（展示台基准：实例布局为 root 空间，需加此偏移对齐零件）
  FOLLOWER_Y: -0.206, // 托弹板静止位（末发下方 10mm）
  FOLLOWER_Z: -0.058,
} as const;

// ---------------------------------------------------------------------------
// 弹匣堆叠几何（30 发双列 · 香蕉匣）
//
// 真实 AK 弧形弹匣的内部排布（据此修正了早先「弹轴沿弧切线」的错误模型）：
//   · 所有弹的弹轴 **平行于枪膛轴（+Z）**——这正是枪机能把弹直推入膛的原因；
//   · 弹心沿一条「先竖直向下、再向后弯」的弧线堆叠（堆叠方向 T 从 -Y 转到
//     下后方，总偏角 26°），双列沿弧错开半距（5.1mm）+ 横向错开 ±5mm；
//   · 列内相邻弹距 10.2mm ≈ 弹径 9.9mm（0.3mm 间隙），列间三维距 11.2mm，
//     全部互不重叠；弹序 0..29 中偶数发走左列、奇数发走右列，
//     顶部两列收敛到抱弹口中心线供弹。
//   · 满弹堆叠长 14.5 × 10.2 ≈ 148mm（弹匣内高 ≈150mm，与实车一致）。
// ---------------------------------------------------------------------------
const MAG_PITCH = 0.0115; // 列内弹距（> 底缘+弹体半径 10.65mm，保证零穿模）
const MAG_ALPHA_MAX = (15 * Math.PI) / 180; // 堆叠方向总偏角（真实 AK 弹匣上段近垂直、弯集中在底部）
const MAG_ARC_BEND = 1.4; // 弯曲进程指数（头部直、尾部弯）
const MAG_STAGGER_X = 0.005; // 双列横向半距
const MAG_INTEGRATE_STEPS = 240;

/** 堆叠方向（沿弧向下的单位向量）：从 -Y 渐转到下后方。 */
export function magStackDir(u: number, uTotal: number): [number, number, number] {
  const a = MAG_ALPHA_MAX * Math.pow(Math.max(0, Math.min(1, u / uTotal)), MAG_ARC_BEND);
  return [0, -Math.cos(a), -Math.sin(a)];
}

/** 堆叠方向在弧长 u 处的倾角（弧度）。 */
export function magStackAngle(u: number, uTotal: number): number {
  return MAG_ALPHA_MAX * Math.pow(Math.max(0, Math.min(1, u / uTotal)), MAG_ARC_BEND);
}

/**
 * 第 i 发的堆叠弧长（mm）——AK 香蕉匣排布：
 *   · 顶部 3 发（i=1..3，i=0 是膛内弹不走弧）收敛为单列、全距排列——
 *     第 1 发就在抱弹口（x=0，枪机直推入膛）；
 *   · 第 4 发起分双列：半距交错（5.75mm）+ 左右列各偏 5mm，
 *     相邻跨列发三维距 ≈12.5mm、同列 ≈11.5mm，均 > 底缘 ⌀11.35。
 *   · 满弹堆叠弧长 178mm（实车弹匣内高 ~165mm + 托弹板行程）。
 */
export function magRoundArc(i: number): number {
  if (i <= 1) return 0;
  if (i <= 4) return (i - 1) * MAG_PITCH;
  return 3 * MAG_PITCH + (i - 4) * 0.5 * MAG_PITCH;
}

/** 第 i 发的横向错位：顶部 3 发居中（单列抱弹），其余偶数发左列 / 奇数发右列。 */
export function magRoundStaggerX(i: number): number {
  if (i <= 3) return 0;
  return i % 2 === 0 ? -MAG_STAGGER_X : MAG_STAGGER_X;
}

/**
 * 第 i 发的位姿（弹壳底缘中心 / 弹轴）。
 * pos: 相对枪膛轴原点；axis: 单位弹轴（本型号全部为 +Z）。
 */
export function magRoundTransform(i: number): { pos: [number, number, number]; axis: [number, number, number]; alpha: number } {
  const u = magRoundArc(i);
  const uTotal = magRoundArc(29);
  // 沿堆叠方向积分（固定步数 → 确定性）
  let y = -0.018;
  let z = -0.0304;
  const step = u / MAG_INTEGRATE_STEPS;
  for (let k = 0; k < MAG_INTEGRATE_STEPS; k++) {
    const [, dy, dz] = magStackDir(k * step, uTotal);
    y += dy * step;
    z += dz * step;
  }
  const alpha = magStackAngle(u, uTotal);
  return { pos: [magRoundStaggerX(i), y, z], axis: [0, -Math.sin(alpha), Math.cos(alpha)], alpha };
}

/** 第 i 发的堆叠倾角（托弹板/弹匣壳定向用）。 */
export function magRoundAngle(i: number): number {
  return magStackAngle(magRoundArc(i), magRoundArc(29));
}

/** 任意弧长 u 处的堆叠方向与位置（兼容旧调用）。 */
export function magSlotTransform(u: number, _opts?: { R?: number; half?: number }) {
  const uTotal = magRoundArc(29);
  const seg = Math.max(0, Math.min(u, uTotal + 0.035)); // 允许托弹板/托弹簧越过末发弧位
  let y = -0.018;
  let z = -0.0304;
  const steps = MAG_INTEGRATE_STEPS;
  const step = seg / steps;
  for (let k = 0; k < steps; k++) {
    const [, dy, dz] = magStackDir(k * step, uTotal);
    y += dy * step;
    z += dz * step;
  }
  const a = magStackAngle(Math.min(seg, uTotal), uTotal);
  return {
    pos: [0, y, z] as [number, number, number],
    axis: [0, -Math.cos(a), -Math.sin(a)] as [number, number, number],
    alpha: a,
  };

}

/** 弧位 u 的法向（弹匣壳截面定向用）。 */
export function magSlotNormal(u: number, _opts?: { R?: number; half?: number }) {
  const uTotal = magRoundArc(29);
  const a = magStackAngle(Math.max(0, Math.min(u, uTotal)), uTotal);
  // 与堆叠方向 (0,-cos a,-sin a) 垂直、指向弹轴（+Z 侧）的单位向量
  return [0, -Math.sin(a), Math.cos(a)] as [number, number, number];
}
