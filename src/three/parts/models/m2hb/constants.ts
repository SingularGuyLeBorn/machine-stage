// ============================================================================
// models/m2hb/constants —— M2HB 重机枪（枪管短后坐 + 半自由枪机）全程尺寸
// 与 ak47/m249 同约定：+Z 枪口方向、+Y 上、+X 右，原点 = 枪膛中心。
// ============================================================================

export const M2HB_CONSTANTS = {
  // ---- 展示台基准：实例布局为 root 空间，需加此偏移对齐零件 ----
  STAGE_Y: 0.3,

  // ---- 枪管组件（.50 BMG，短后坐）----
  BARREL_LEN: 0.72, // 枪管长
  BARREL_R: 0.0145, // 枪管外半径（⌀29）
  BARREL_BORE_R: 0.00643, // 线膛半径（⌀12.95）
  BARREL_LAND_R: 0.00662,
  BARREL_LANDS: 8, // 8 条膛线
  BARREL_TWIST: 15, // 缠距（一圈）
  CHAMBER_R: 0.0075, // 弹膛（.50 弹壳 ⌀15）
  CHAMBER_LEN: 0.07, // 弹膛长（壳长 70mm）
  BARREL_EXT_R: 0.0185, // 枪管延伸部半径
  BARREL_EXT_LEN: 0.12, // 延伸部长
  LOCKRING_R: 0.0195, // 闭锁环半径
  MUZZLE_Z: 0.85, // 枪口（制退器出口）

  // ---- 枪管短后坐行程 ----
  BARREL_STROKE: 0.012, // 枪管+延伸部后坐 12mm
  BOLT_STROKE: 0.1, // 枪机继续后坐 100mm（加速子传能量后）
  ACCELERATOR_PIVOT_Z: -0.06, // 加速子摆枢（机匣内）

  // ---- 接收器（铆接矩形管）----
  RECEIVER_W: 0.062,
  RECEIVER_H: 0.078,
  RECEIVER_Z0: -0.36, // 尾端
  RECEIVER_Z1: 0.06, // 前端（枪管延伸部接口）
  RIVET_COUNT: 18, // 铆钉族实例数
  EXTRACTOR_SWITCH_Z: -0.09, // L 形退壳杠杆安装位

  // ---- 供弹（M9 可散链，从左侧进、空链右侧出）----
  BELT_PITCH: 0.035, // M9 链节距
  BELT_LINKS: 17, // 可见链节
  FEED_PATH_Y: 0.026, // 供弹通道高度
  FEED_PATH_Z0: -0.12, // 供弹口（链入口）
  FEED_PATH_Z1: 0.01, // 拨弹到位（抱弹）
  PAWL_TRAVEL: 0.035,
  LEVER_PIVOT_Y: -0.01, // 多级供弹杠杆铰点高

  // ---- 发射机 / 扳机 ----
  TRIGGER_Y: -0.052,
  TRIGGER_PIVOT_Z: -0.3,
  HAMMER_Y: -0.048,
  HAMMER_PIVOT_Z: -0.32,
  SEAR_Y: -0.044,
  SEAR_PIVOT_Z: -0.29,
  GRIP_Z: -0.33,

  // ---- M3 三脚架 + T&E ----
  TRIPOD_Y: -0.2,
  TRIPOD_LEG_LEN: 0.5,
  TE_WHEEL_R: 0.045, // T&E 手轮半径
  TE_Z: -0.38,
  TE_Y: -0.14,
} as const;
