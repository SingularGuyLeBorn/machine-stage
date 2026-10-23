// ============================================================================
// models/m249/constants —— M249 轻机枪（FN Minimi / SAW）全程尺寸
// 自动原理：导气式（短行程活塞 + 回转闭锁枪机）+ 弹链供弹（M27 可散链）。
// 与 ak47/constants 同款约定：+Z 枪口方向、+Y 上、+X 右，原点 = 枪膛中心。
// ============================================================================

export const M60_CONSTANTS = {
  // ---- 展示台基准：实例布局为 root 空间，需加此偏移对齐零件 ----
  STAGE_Y: 0.3,

  // ---- 枪管 / 枪管组件（5.56×45，快拆）----
  BARREL_LEN: 0.560, // 枪管长（不含延伸部）
  BARREL_R: 0.0090, // 枪管外半径（⌀16.2）
  BARREL_BORE_R: 0.00381, // 线膛半径（⌀5.7）
  BARREL_LAND_R: 0.00395, // 阳线半径
  BARREL_LANDS: 4, // 6 条右旋膛线（5.56 是 6 膛线？实际 6 线 178mm/缠）
  BARREL_TWIST: 2.33, // 缠距（圈）
  CHAMBER_R: 0.0059, // 弹膛（5.56 弹壳 ⌀9.5）
  CHAMBER_LEN: 0.051, // 弹膛长（壳长 45mm）
  BARREL_EXT_LEN: 0.03, // 枪管延伸部（提把后面的节套状延伸）

  // ---- 导气系统 ----
  GAS_BLOCK_Z: 0.300, // 导气箍（含提把座）位置
  GAS_PORT_R: 0.0019, // 导气孔 ⌀3.8
  GAS_TUBE_R: 0.0042,
  GAS_PISTON_R: 0.0044, // 活塞头半径
  GAS_PISTON_LEN: 0.03, // 活塞头长
  GAS_PISTON_ROD_R: 0.004, // 活塞杆（= 操作杆）
  GAS_PISTON_ROD_LEN: 0.300, // 杆长（导气箍 → 枪机框）
  GAS_PISTON_Y: 0.014, // 导气轴线高（枪膛轴上 14mm）
  CARRIER_STROKE: 0.075, // 枪机框行程

  // ---- 受弹机/弹链 ----
  FEED_TRAY_Y: 0.019, // 受弹托盘（弹链通道）高度
  FEED_TRAY_Z0: -0.06, // 托盘后缘（弹链从弹盒来的入口）
  FEED_TRAY_Z1: 0.03, // 托盘前缘（抱弹口）
  BELT_PITCH: 0.020, // M27 链节距
  BELT_ROUNDS: 30, // 链上可见弹数（盒内另有）
  BELT_LINK_T: 0.0012, // 链节板厚
  BELT_LINK_W: 0.02, // 链节宽
  BELT_LINK_THROAT_R: 0.0062, // 链节抱弹半径
  FEED_PAWL_TRAVEL: 0.015, // 拨弹齿行程（一个节距）
  FEED_SLIDER_TRAVEL: 0.015, // 供弹滑板行程（随枪机）

  // ---- 发射机 ----
  TRIGGER_Y: -0.024,
  TRIGGER_PIVOT_Z: -0.115,
  HAMMER_Y: -0.026,
  HAMMER_PIVOT_Z: -0.13,
  HAMMER_COCK_DEG: 65,
  SELECTOR_PIVOT_Y: -0.018,
  SELECTOR_PIVOT_Z: -0.125,

  // ---- 机匣/护木/枪托 ----
  RECEIVER_Z0: -0.24,
  RECEIVER_Z1: 0.09,
  RECEIVER_W: 0.046,
  RECEIVER_H: 0.052,
  HANDGUARD_R: 0.024,
  HANDGUARD_Z: 0.15, // 护木中心（前段）
  STOCK_Z: -0.26, // 枪托（管状）
  BIPOD_Z: 0.320, // 两脚架（护木前下方）
  BIPOD_LEG_LEN: 0.260,
  MUZZLE_Z: 0.590, // 枪口（制退器出口）
} as const;
