import * as THREE from "three";
import type { InstanceLayout } from "../../../assembler/assembler";
import { evaluateExpression } from "../../../registry/expression";
import type {
  Expr,
  ExprVec3,
  GeometrySpec,
  ModelRegistry,
  NodeDef,
  PartDefinition,
} from "../../../registry/types";
import { tigerEngineExpectedContacts } from "./expectedContacts";

// ============================================================================
// models/tiger/engine/registry —— Maybach HL230 P45（虎式 I 后期型）L1 核心机构
//
// 单一真值源：本文件 constants 表。所有零件位置由 mate / instance_layout 派生，
// 尺寸不在别处重复书写；动画只驱动节点，数字只来自 kinematics.ts。
//
// 公开资料（近似值，用于真实比例与真实数字）：
//   Maybach HL230 P45 —— 60° V12 水冷汽油机，缸径 130mm × 行程 145mm，
//   排量 23095cc，压缩比 6.8:1，700PS @ 3000rpm，1850N·m @ 2100rpm，干重 1200kg，
//   外形约 1000×1190×1310mm，灰铸铁机体与缸盖，SOHC + 摇臂（摇臂机构 M-C），
//   隧道式曲轴（滚动轴承、无剖分主轴承盖），4× Solex 52JFF 化油器，2 磁电机。
//   来源：Wikipedia "Maybach HL230"、Jentz & Doyle《Germany's Tiger Tanks》、
//         Bovington Tiger 131 修复档案；折算式近似均已在常量注释中标注。
//
// 坐标系（发动机局部，与 kinematics.ts 同源）：
//   +X = 曲轴轴向（前端 = 皮带轮 / 风扇侧），+Y = 上，+Z = 右
//   缸序 1..12：奇数 = 左列（β = -30°），偶数 = 右列（β = +30°）；曲柄销 6 个每 60°
//   曲柄角约定：pinAlpha = 60k + θ（度），缸 i 的曲柄角 φ = pinAlpha - β
//
// 构建层（自内向外）：
//   L1 核心机构 = 曲轴箱 → 曲轴 → 缸体（本层单独可立住）
//   L2 传动支撑 = 活塞连杆 → 配气机构
//   L3 内衬内饰 = 冷却 / 进排气 / 点火 / 附件（相对整机属"内部装置"）
// ============================================================================

const MODEL = "tiger";

/** 轴向辅助：几何体默认绕 +Y 建模，用 mate.rotation 转到目标轴向。 */
const AXIS_X: ExprVec3 = [0, 0, -90]; // lathe/cylinder 的 +Y → +X
const AXIS_X_NEG: ExprVec3 = [0, 0, 90]; // +Y → -X

// ---------------------------------------------------------------------------
// 实例布局（instance_layout 引用名 + 实现）
// ---------------------------------------------------------------------------

export const ENGINE_LAYOUTS = {
  bank: "engine.bank",
  crankJournal: "engine.crankJournal",
  crankJournalAxis: "engine.crankJournalAxis",
  crankPin: "engine.crankPin",
  crankWeb: "engine.crankWeb",
  caseRib: "engine.caseRib",
  caseMount: "engine.caseMount",
  inspectionCover: "engine.inspectionCover",
  pistonRing: "engine.pistonRing",
  pistonPin: "engine.pistonPin",
  valve: "engine.valve",
  sparkPlug: "engine.sparkPlug",
  magneto: "engine.magneto",
  fuelPump: "engine.fuelPump",
  fanBearing: "engine.fanBearing",
  driveBelt: "engine.driveBelt",
  carburetor: "engine.carburetor",
  airFilter: "engine.airFilter",
  sumpBolt: "engine.sumpBolt",
  inspectionBolt: "engine.inspectionBolt",
  timingBolt: "engine.timingBolt",
  mountBolt: "engine.mountBolt",
  coverScrew: "engine.coverScrew",
  portFlangeBolt: "engine.portFlangeBolt",
  endplateBolt: "engine.endplateBolt",
  htConduit: "engine.htConduit",
  htLead: "engine.htLead",
  magnetoBus: "engine.magnetoBus",
} as const;

/** 缸号（0..11）→ 曲柄销序号 / 所在侧 / 缸心 X / 缸列倾角（度）。 */
function cylinderInfo(index: number, constants: Record<string, number>) {
  const ordinal = index + 1;
  const pin = Math.floor(index / 2);
  const side: 1 | -1 = ordinal % 2 === 1 ? -1 : 1; // 奇 = 左列
  return {
    ordinal,
    pin,
    side,
    beta: side * constants.HALF_V,
    x: constants.CYL_X1 - pin * constants.CYL_PITCH,
  };
}

const deg2rad = (deg: number) => (deg * Math.PI) / 180;

/**
 * 缸列坐标系矩阵：位置 = 缸心 X + 缸轴高度 h + 法向偏移 lateral；
 * 旋转 = Rz(β)（β 取缸列倾角，附加角 extra 只作用于旋转，用于气门倾角）。
 */
function bankMatrix(
  side: 1 | -1,
  x: number,
  height: number,
  lateral: number,
  extra: number,
  constants: Record<string, number>,
): THREE.Matrix4 {
  const beta = side * constants.HALF_V;
  const n = new THREE.Vector3(0, Math.cos(deg2rad(beta)), Math.sin(deg2rad(beta)));
  const m = new THREE.Vector3(0, -Math.sin(deg2rad(beta)), Math.cos(deg2rad(beta)));
  const position = new THREE.Vector3(x, 0, 0).addScaledVector(n, height).addScaledVector(m, lateral);
  const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(deg2rad(beta + extra), 0, 0, "XYZ"));
  return new THREE.Matrix4().compose(position, quaternion, new THREE.Vector3(1, 1, 1));
}

/** 缸列局部点 (x, y, z) → 模型坐标表达式（y = 缸轴高度，z = 法向，右列为 +Z 外侧）。 */
function bankPos(x: Expr, y: Expr, z: Expr, side: 1 | -1): ExprVec3 {
  const yExpr = side === 1 ? `(${y})*COS_HV-(${z})*SIN_HV` : `(${y})*COS_HV+(${z})*SIN_HV`;
  const zExpr = side === 1 ? `(${y})*SIN_HV+(${z})*COS_HV` : `-(${y})*SIN_HV+(${z})*COS_HV`;
  return [x, yExpr, zExpr];
}

// ---------------------------------------------------------------------------
// 常量（单一真值源）
// ---------------------------------------------------------------------------

const CONSTANTS: Record<string, Expr> = {
  // ===== 公开规格 =====
  CYLINDERS: 12,
  V_ANGLE: 60,
  HALF_V: "V_ANGLE/2",
  COS_HV: "cos(HALF_V)",
  SIN_HV: "sin(HALF_V)",
  BORE: 0.13,
  STROKE: 0.145,
  /** 展示基准转速（r/min）：额定 3000，展示取 240 便于目视与 36fps 密集采样。 */
  ENGINE_RPM: 240,
  RATED_RPM: 3000,
  RATED_TORQUE: 1850,
  COMPRESSION_RATIO: 6.8,
  DRY_MASS: 1200,

  // ===== 缸列排布 =====
  CYL_PITCH: 0.158,
  CYL_X1: 0.341,

  // ===== 曲柄连杆 =====
  CRANK_R: "STROKE/2",
  ROD_L: 0.29,
  PIN_TDC: "CRANK_R+ROD_L",
  JOURNAL_R: 0.042,
  JOURNAL_W: 0.05,
  PIN_R: 0.036,
  PIN_W: 0.054,
  ROD_BIG_R: 0.052,
  ROD_BIG_BORE: "PIN_R+0.001",
  ROD_SMALL_R: 0.026,
  // 小头衬套按压装销建模（过盈 0.6mm）：活塞销压进连杆小头是常见构造，
  // 静态报告里这条真实压装面必须看得见（径向 0.6mm，远低于 2mm 深度守门）。
  ROD_SMALL_BORE: "PISTON_PIN_R-0.0006",
  ROD_SHANK_W: 0.036,
  ROD_SHANK_T: 0.026,
  /** 同一曲柄销上左右列连杆沿轴向各让一侧：销宽 54 = 2*26 + 2*1mm 间隙 */
  ROD_SIDE_OFFSET: 0.014,

  // ===== 活塞 =====
  PISTON_R: 0.0628,
  PISTON_CROWN_Y: 0.08,
  PISTON_CROWN_T: 0.014,
  PISTON_SKIRT: 0.066,
  PISTON_WALL: 0.008,
  GROOVE_R: 0.0596,
  GROOVE_H: 0.0055,
  RING_R: 0.0642,
  RING_R_IN: 0.0604,
  RING_H: 0.004,
  RING_Y1: 0.056,
  RING_STEP: 0.008,
  PISTON_PIN_R: 0.019,
  PISTON_PIN_LEN: 0.062,

  // ===== 缸套 / 缸体 =====
  LINER_R_IN: "BORE/2",
  LINER_R_OUT: 0.073,
  LINER_BOTTOM: "CASE_TOP+0.0008",
  LINER_TOP: "DECK",
  LINER_LEN: "LINER_TOP-LINER_BOTTOM",
  LINER_CENTER: "(LINER_TOP+LINER_BOTTOM)/2",
  JACKET_R: "LINER_R_OUT+0.004",
  GASKET_BOTTOM: "DECK+0.0006",
  GASKET_T: 0.0024,
  HEAD_BASE: "GASKET_BOTTOM+GASKET_T+0.0006",
  HEAD_H: 0.085,
  HEAD_TOP: "HEAD_BASE+HEAD_H",
  HEAD_CHAMBER_R: 0.072,
  GASKET_BORE_R: "LINER_R_OUT+0.0025",
  COVER_BASE: "HEAD_TOP+0.0018",
  COVER_H: 0.082,
  CAM_HALF_Z: 0.048,
  CAM_COVER_LEN: 0.154,
  CAM_BASE: "COVER_BASE+0.041",
  CAM_SHAFT_R: 0.017,
  CAM_LOBE_R: 0.028,
  CAM_LOBE_W: 0.016,
  CAM_JOURNAL_R: 0.0235,
  CAM_JOURNAL_W: 0.02,
  CAM_LEN: 0.9,
  BLOCK_BASE: "CASE_TOP+0.0008",
  BLOCK_W: "CYL_PITCH-0.002",
  BLOCK_D: "JACKET_R*2+0.02",
  BLOCK_H: "DECK-BLOCK_BASE",
  CASE_TOP: 0.215,
  DECK: 0.4475,

  // ===== 气门 / 火花塞 =====
  VALVE_Z: 0.038,
  VALVE_TILT: 6,
  VALVE_SEAT: "HEAD_BASE+0.0012",
  VALVE_DISC_R: 0.026,
  VALVE_STEM_R: 0.008,
  VALVE_STEM_LEN: 0.084,
  PLUG_Z: 0.074,
  PLUG_BASE: "HEAD_TOP+0.0008",
  PLUG_TIP_Y: "HEAD_TOP-0.012",
  PLUG_TIP_R: 0.007,

  // ===== 曲轴箱壳体 =====
  CASE_X: -0.054,
  CASE_LEN: 1.0,
  CASE_FRONT_X: "CASE_X+CASE_LEN/2",
  CASE_REAR_X: "CASE_X-CASE_LEN/2",
  CASE_HALF_W: 0.155,
  CASE_WALL: 0.019,
  CASE_BOTTOM_Y: -0.17,
  CASE_FLOOR: 0.012,
  DECK_RIM: 0.004,
  RIDGE_BOTTOM_Y: 0.205,
  DECK_INNER_Y: "CASE_TOP*COS_HV+BLOCK_D/2*SIN_HV",
  DECK_INNER_Z: "CASE_TOP*SIN_HV-BLOCK_D/2*COS_HV",
  DECK_OUTER_Y: "CASE_TOP*COS_HV-BLOCK_D/2*SIN_HV",
  DECK_OUTER_Z: "CASE_TOP*SIN_HV+BLOCK_D/2*COS_HV",
  ENDPLATE_T: 0.022,
  ENDPLATE_FRONT_X: "CASE_FRONT_X+ENDPLATE_T/2",
  ENDPLATE_REAR_X: "CASE_REAR_X-ENDPLATE_T/2",
  FRONT_BORE_R: 0.055,
  REAR_BORE_R: 0.05,
  TIMING_COVER_X: "CASE_FRONT_X+0.032",
  TIMING_COVER_BORE: 0.05,
  BEARING_R_IN: "JOURNAL_R+0.0035",
  BEARING_R_OUT: 0.112,
  BEARING_W: 0.03,
  // 侧臂到 z=0.130：壳体挤出体的 bevel 把内腔面推进到 |z|=0.132，臂再长就插进壁里
  BEARING_REACH_Z: 0.13,
  BEARING_REACH_UP: 0.117,
  BEARING_REACH_DOWN: 0.148,
  RIB_T: 0.025,
  RIB_W_X: 0.02,
  RIB_H: 0.17,
  RIB_Z: "CASE_HALF_W+0.0125",
  RIB_X1: 0.42,
  RIB_PITCH: 0.158,
  RIB_COUNT: 6,
  RIB_Y: -0.075,
  // 机脚在肋板之间：肋板在 x=0.42 / 0.262（±0.01），机脚 0.1 宽 → 只能落在两者的空档中心
  // 空档中心 = 缸位 0.341 / 0.183 / 0.025 / -0.133 / -0.291 / -0.449：负 x 侧两侧对称需要第二组
  MOUNT_X: 0.341,
  MOUNT_X2: -0.291,
  MOUNT_Y: -0.155,
  MOUNT_Z: "CASE_HALF_W+0.0455",
  COVER_X1: 0.183,
  // 检查盖同样只能落在空档中心：0.025 空档两侧（机油泵/油管/油尺/滤清器都在 x<-0.1）无附件，
  // -0.291 会被右机油管端环切到，-0.449 会撞油尺与滤清器
  COVER_X2: 0.025,
  COVER_Z: "CASE_HALF_W+0.005",
  COVER_Y: -0.075,
  SUMP_FLANGE_Y: -0.177,
  // 放油塞顶面在碗体底面之下 1mm（碗底 -0.245）
  DRAIN_PLUG_Y: "SUMP_FLANGE_Y-0.081",
  BREATHER_Y: "DECK_INNER_Y+0.0355",
  DIPSTICK_X: -0.5,
  DIPSTICK_Y: 0.02,
  DIPSTICK_Z: "-(CASE_HALF_W+0.01)",
  // 加油口沿 +X 起于前端板前脸之外（前端板 x∈[0.446,0.468]，加油口 x∈[0.470,0.520]）
  OIL_FILLER_X: "CASE_FRONT_X+0.049",
  // 抬到正时齿轮盖轮廓（y ≤ 0.16）之上，否则加油口插进正时盖本体
  OIL_FILLER_Y: 0.2,
  // z 让开风扇支架的左地脚/立撑（z∈[-0.133,-0.067]）：加油口管壁 [-0.06,-0.01]
  OIL_FILLER_Z: -0.035,
  OIL_PUMP_Y: -0.09,
  OIL_PUMP_Z: "-(CASE_HALF_W+0.05)",
  OIL_FILTER_X: -0.455,
  OIL_FILTER_Y: -0.12,
  OIL_FILTER_Z: "CASE_HALF_W+0.065",
  OIL_FILTER_LEN: 0.13,
  OIL_FILTER_R: 0.06,
  NAMEPLATE_X: "TIMING_COVER_X+0.013",
  // 抬到曲轴前端（NOSE_R=0.036）扫掠半径之外，避免铭牌被轴穿过
  NAMEPLATE_Y: 0.1,
  NAMEPLATE_Z: -0.04,
  // 飞轮壳前端面留在后端板后脸之外 1mm（后端板 x∈[-0.576,-0.554]）
  HOUSING_X: "CASE_REAR_X-0.073",
  HOUSING_R_OUT: 0.285,
  HOUSING_R_IN: 0.27,
  HOUSING_W: 0.1,

  // ===== 曲轴 =====
  JOURNAL_X0: "CYL_X1+CYL_PITCH/2",
  WEB_T: 0.022,
  WEB_R: 0.098,
  WEB_GAP: 0.04,
  COUNTER_R: 0.114,
  NOSE_R: 0.036,
  NOSE_LEN: 0.28,
  NOSE_X: "CASE_FRONT_X+NOSE_LEN/2",
  DAMPER_R: 0.104,
  DAMPER_T: 0.032,
  DAMPER_BORE: "NOSE_R+0.002",
  DAMPER_X: "CASE_FRONT_X+0.115",
  PULLEY_X: 0.7,
  PULLEY_R: 0.09,
  PULLEY_HALF_W: 0.025,
  PULLEY_GROOVE_R: 0.0825,
  PULLEY_HUB_R: 0.062,
  PULLEY_BORE: "NOSE_R+0.001",
  PULLEY_OFF: 0.0125,
  PULLEY_OPEN_HALF: "BELT_WIDTH/2+0.0035",
  PULLEY_ROOT_HALF: "BELT_WIDTH/2+0.0012",
  PULLEY_EDGE_OFF: "PULLEY_OFF+PULLEY_OPEN_HALF",
  BELT_WIDTH: 0.0152,
  BELT_T: 0.0065,
  FLYWHEEL_R: 0.23,
  FLYWHEEL_T: 0.045,
  FLYWHEEL_X: "CASE_REAR_X-0.066",
  RINGGEAR_R_IN: 0.236,
  RINGGEAR_R_OUT: 0.247,
  RINGGEAR_W: 0.022,
  RINGGEAR_TEETH: 96,
  FLYWHEEL_BOLT_R: 0.009,
  FLYWHEEL_BOLT_H: 0.008,
  FLYWHEEL_BOLT_CIRCLE: 0.2,
  FLYWHEEL_BOLT_X: "FLYWHEEL_X-FLYWHEEL_T/2-0.005",
  TAIL_R: 0.04,
  // 尾轴只做飞轮后面的输出段：不能穿过实心飞轮，末端也不能捅穿飞轮壳后端面
  TAIL_LEN: 0.032,
  TAIL_X: "FLYWHEEL_X-FLYWHEEL_T/2-TAIL_LEN/2-0.001",

  // ===== 冷却 =====
  // 叶尖半径：导风罩内孔 = shroudR−shroudWall = 0.227，叶尖必须留 3mm 间隙。
  // 原 0.235 会让叶尖切进罩壁 6.8mm（fan_rotor ↔ fan_frame · bearing_overlap · 未豁免）。
  FAN_R: 0.224,
  FAN_HUB_R: 0.062,
  FAN_HUB_W: 0.07,
  FAN_BLADES: 8,
  FAN_CHORD: 0.078,
  FAN_PITCH_DEG: 32,
  FAN_X: "CASE_FRONT_X+0.185",
  FAN_Y: 0.34,
  FAN_Z: 0.3,
  FAN_DIST: "sqrt(FAN_Y^2+FAN_Z^2)",
  FAN_PULLEY_R: 0.0792,
  // 带面宽 45mm：曲轴带轮是双槽（±PULLEY_OFF = 0.6875/0.7125 两个皮带平面），
  // 风扇带轮做成整段等高圆柱面带，两条皮带各自压在同一半径上（尖脊只有一条能压住）
  FAN_PULLEY_W: 0.045,
  FAN_PULLEY_X: "0.069",
  FAN_SHAFT_R: 0.032,
  FAN_FRAME_X: "CASE_FRONT_X+0.024",
  FAN_BEARING_R_OUT: 0.033, // 外径按框架下斜撑净空收敛（φ84 → φ66：原尺寸会与斜撑相交 5.3mm）
  FAN_BEARING_R_IN: 0.026,
  FAN_BEARING_W: 0.06,
  FAN_BEARING_X: "FAN_X-0.069",
  WATERPUMP_R: 0.055,
  WATERPUMP_LEN: 0.08,
  // 泵体 x∈[X, X+0.08]，前端面对风扇支架下横梁前脸（x≈533.5mm）：留 3mm 垫片间隙。
  // 原位 +0.047（前端 525mm）插进横梁 8.5mm，检测器报 face_contact 未豁免（共面接触测不出深度）
  WATERPUMP_X: "TIMING_COVER_X+0.059",
  ACC_Y: 0.06,
  ACC_Z: 0.16,
  GEN_R: 0.055,
  GEN_LEN: 0.09,
  GEN_X: "TIMING_COVER_X+0.057",

  // ===== 进排气 =====
  PLENUM_Y: 0.356,
  PLENUM_Z: 0.1534,
  INTAKE_MAIN_R: 0.036,
  INTAKE_RUNNER_R: 0.018,
  // 进/排气口高度：同一缸盖侧面上分成上口（进气）与下口（排气）。
  // 两口的分开是构造性要求：支管起弯段的净空 = 两段半径之和（0.018+0.018），
  // 共用同一口时两根 ⌀48 支管的起弯段必然互穿（实测交线 1493mm · displaced）。
  PORT_IN_Y: "HEAD_H*0.72",
  PORT_EX_Y: "HEAD_H*0.22",
  PORT_STUB_R: 0.019, // 缸盖进/排气短管半径；支管起点套在短管上（起点在短管柱面内）
  // 缸盖进/排气法兰宽：端口 ⌀38 两侧各留 12mm 螺栓座（B1：port_flange_bolt ×4/缸）
  HEAD_FLANGE_W: 0.078,
  PORT_FLANGE_BOLT_DX: "HEAD_FLANGE_W/2-0.006", // 螺栓到端口中心 33mm：让开短管柱面 19mm
  // 法兰盒外表面在 d/2+0.016；boltGeometry 原点 = 头的外端面，故再外移 10mm
  // （沿用 sump_bolt 口径：头 9mm 坐在法兰面上、杆埋进法兰 5mm）
  PORT_FLANGE_BOLT_Z: "BLOCK_D/2+0.026",
  // 端板螺孔圈：落在正时盖 ⌀260 之外、机体截面之内（12 颗/端板）
  ENDBOLT_R: 0.145,
  ENDBOLT_COUNT: 12,
  // 机油压力/水温传感器：外壳坐在机体侧壁外，螺纹杆只埋进 19mm 壁厚的 6mm
  SENDER_STEM_R: 0.008,
  SENDER_STEM_L: 0.006,
  SENDER_BODY_R: 0.016,
  SENDER_BODY_H: 0.042,
  SENDER_X1: -0.14,
  SENDER_X2: -0.28,
  SENDER_Y: 0.05,
  PORT_Z: "BLOCK_D/2+0.04",
  EXHAUST_MAIN_Y: 0.055,
  // 排气主管再外移 22mm：进气支管起点（PORT_IN_Y）到主管轴心的净空
  // = √(0.006² + 0.077²) ≈ 77mm > 主管半径+支管半径 60mm（原 0.088 时只有 55mm · 互穿）
  EXHAUST_MAIN_Z: "BLOCK_D/2+0.11",
  EXHAUST_MAIN_R: 0.042,
  EXHAUST_RUNNER_R: 0.018,
  EXHAUST_PIPE_R: 0.022,
  // 排气下管承口：13 边形套筒的内切圆 0.0435×cos(π/13)=0.0422 > 主管外接圆 0.042，
  // 与主管壁面径向留隙、不再产生轴向长交线；接触 = 承口端盖面横切主管壁的整圈交线（bearing_overlap）。
  EXHAUST_SOCKET_R: "EXHAUST_MAIN_R+0.0015",
  // 化油器坐在进气歧管主管（plenum）正上方。注意：歧管局部系原点在缸盖底面（HEAD_BASE），
  // 而化油器经 bankMatrix 以曲轴箱轴（y=0）为高度零点，故必须补上 HEAD_BASE——
  // 原式漏了这一项，化油器落到 y≈0.28（≈缸盖进气道法兰高度），⌀95 底座侧壁插进法兰 13.5mm。
  CARB_BASE_Y: "HEAD_BASE+PLENUM_Y+INTAKE_MAIN_R+0.0015",
  CARB_H: 0.135,
  CARB_R: 0.0475,
  CARB_X_A: -0.158,
  CARB_X_B: -0.632,
  FILTER_BASE_Y: "CARB_BASE_Y+CARB_H+0.002",
  FILTER_NECK_R: 0.032,
  FILTER_NECK_H: 0.08,
  FILTER_R: 0.115,
  FILTER_H: 0.16,

  // ===== 点火 / 附件 =====
  MAGNETO_R: 0.048,
  MAGNETO_LEN: 0.1,
  MAGNETO_X: "TIMING_COVER_X+0.112",
  MAGNETO_Y: 0.1,
  MAGNETO_Z: 0.09,

  // ---- L1 第一批：紧固件（实例 +112）----
  // 螺栓 = 「六角头 + 短杆」，原点 = 头的外端面，头沿 +Y 埋进基体、杆再伸出 6mm：
  // 压装/螺纹咬合是构造性接触（白名单登记），不允许把杆伸穿基体到下一层零件。
  BOLT_HEAD_R: 0.0125, // 对边 ≈21.6mm（M14 级）
  BOLT_HEAD_H: 0.009,
  BOLT_SHANK_R: 0.0075,
  BOLT_SHANK_L: 0.006,
  SUMP_BOLT_XA: -0.23, // 油底壳法兰 0.5×0.3 → 长边各 9 颗 + 短边中 1 颗
  SUMP_BOLT_XB: 0.23,
  SUMP_BOLT_Z: 0.13,
  SUMP_BOLT_Y: "SUMP_FLANGE_Y-0.010", // 头在法兰下、杆进法兰 11mm（板厚 12mm）
  COVER_BOLT_DX: 0.038, // 检查盖 0.11×0.09 的四角
  COVER_BOLT_DY: 0.03,
  COVER_BOLT_Z: "COVER_Z+0.012", // 头露在盖外 8mm、杆埋进盖板 6mm
  TIMING_BOLT_R: 0.105, // 正时盖 ⌀260 圆角板、镗孔 ⌀100 → 螺孔圈居中
  TIMING_BOLT_X: "TIMING_COVER_X+0.018",
  MOUNT_BOLT_DX: 0.032, // 机脚底面（0.1×0.09）两颗
  MOUNT_BOLT_Y: "MOUNT_Y-0.029",
  COVER_SCREW_DX: "CAM_COVER_LEN*0.3",
  COVER_SCREW_Y: "COVER_BASE+COVER_H+0.008",
  PLUG_TWIN_DX: 0.045, // 双点火：第二只火花塞同侧、沿缸盖长度前后错开 45mm
  // （山谷侧被进气道/空滤占住，塞子装不进——见 source 说明）
  // 护套底口内孔 ⌀21 略小于塞子 ⌀23 段（0.5mm 径向过盈）：底口锥面在塞子柱面上
  // 切出一圈闭合交线 = 包裹/压装接触。原 ⌀23.6 大于塞子 ⌀23 → 底口整圈悬在塞子外侧，
  // 一个三角面都不相交（plug-boot-on-plug 实测 0 条）。
  BOOT_IN_R: 0.0105,
  BOOT_R: 0.017,
  BOOT_BORE: 0.0135, // 护套内孔 ⌀27：让开塞子 ⌀25 段 1mm；只有底口斜唇切进塞子
  BOOT_LEN: 0.03,
  BOOT_Y0: 0.062, // 护套底口位置（火花塞高 0.09，罩住线端）
  // ---- 点火高压线束（双点火：每缸 2 根，共 24 根）--------------------------------
  // 导管中心高出护套顶 90mm：护套顶（bank 局部）= PLUG_BASE+BOOT_Y0+BOOT_LEN = 0.6289，
  // 净隙（BVH 实测）：缸盖罩顶外角 28.0mm、进气歧管 42.9mm。
  CONDUIT_R_OUT: 0.011,
  CONDUIT_R_IN: 0.008,
  CONDUIT_X_FRONT: 0.455,
  CONDUIT_X_REAR: -0.5, // 后端止于进气歧管后缘之内（前端留 20mm 让开风扇框 x=0.475）
  CONDUIT_LEN: "CONDUIT_X_FRONT-CONDUIT_X_REAR",
  CONDUIT_X: "(CONDUIT_X_FRONT+CONDUIT_X_REAR)/2",
  CONDUIT_LIFT: 0.09,
  CONDUIT_Y: "PLUG_BASE+BOOT_Y0+BOOT_LEN+CONDUIT_LIFT",
  // 导管轴线换到模型坐标：y 与 |z| 对两列同值（符号由缸列侧给，见 layout）
  CONDUIT_Y_W: "CONDUIT_Y*COS_HV-PLUG_Z*SIN_HV",
  CONDUIT_Z_W: "CONDUIT_Y*SIN_HV+PLUG_Z*COS_HV",
  // 高压线：护套顶面下 1.2mm 起、导管柱面下 0.8mm 止（垂直段，两端都是净隙不是接触）
  HT_LEAD_R_OUT: 0.0045,
  HT_LEAD_R_IN: 0.0025,
  HT_LEAD_BOTTOM: "PLUG_BASE+BOOT_Y0+BOOT_LEN-0.0012",
  HT_LEAD_TOP: "CONDUIT_Y-CONDUIT_R_OUT-0.0008",
  HT_LEAD_LEN: "HT_LEAD_TOP-HT_LEAD_BOTTOM",
  HT_LEAD_MID: "(HT_LEAD_TOP+HT_LEAD_BOTTOM)/2",
  // 磁电机干线：⌀16 管从磁电机前端面（x=-0.100 的 ⌀96 平盖）正前 9mm 起，沿径向外接导管。
  // 起点 y = 磁电机轴线高度 0.59；终端停在导管柱面外 1mm：端面平面距导管轴线 12mm，
  // 端面上任一点到轴线 ≥ 12mm > 导管半径 11mm ⇒ 整面不侵入（实测端面净隙 1.0mm）。
  // 不走正面走廊（x∈[0.475,0.675] 被风扇框占死），也不垂插导管柱面（垂插必相交）。
  MAGNETO_BUS_R_OUT: 0.008,
  MAGNETO_BUS_R_IN: 0.005,
  MAGNETO_BUS_X: -0.091,
  MAGNETO_BUS_Y: 0.59,
  MAGNETO_BUS_Z0: 0.09,
  MAGNETO_BUS_Z1: "CONDUIT_Z_W-CONDUIT_R_OUT-0.001",
  MAGNETO_BUS_LEN: "MAGNETO_BUS_Z1-MAGNETO_BUS_Z0",
  MAGNETO_BUS_ZC: "(MAGNETO_BUS_Z0+MAGNETO_BUS_Z1)/2",
  FUELPUMP_R: 0.03,
  FUELPUMP_LEN: 0.062,
  FUELPUMP_X: 0.183,
  FUELPUMP_Y: 0.075,
  // 泵体基座面在侧壁外 1.5mm（原先直接嵌在壁里：CASE_HALF_W+0.0015 是「中心」不是基座面）
  FUELPUMP_Z: "CASE_HALF_W+0.0015",
  STARTER_R: 0.075,
  STARTER_LEN: 0.28,
  STARTER_X: "CASE_REAR_X-0.066",
  STARTER_Y: 0.16,
  STARTER_Z: -0.34,
};

// ---------------------------------------------------------------------------
// 节点（动画只驱动节点；rest = 曲轴角 θ=0 的自洽姿态）
// ---------------------------------------------------------------------------

function pistonNodeName(ordinal: number): string {
  return `Piston_${ordinal}`;
}

function rodNodeName(ordinal: number): string {
  return `Rod_${ordinal}`;
}

/** 缸号（0..11）在 θ=0 时的活塞销高度表达式（n·s(φ0)，s 由曲柄连杆解析式给出）。 */
function pistonTravel0(pin: number, side: 1 | -1): string {
  const phi0 = pin * 60 - side * 30;
  return `(CRANK_R*cos(${phi0})+sqrt(ROD_L^2-(CRANK_R*sin(${phi0}))^2))`;
}

/** θ=0 时连杆摆角（度）：atan2(-r·sinφ, sqrt(l²-(r·sinφ)²))。 */
function rodSwing0(pin: number, side: 1 | -1): string {
  const phi0 = pin * 60 - side * 30;
  return `atan2(-CRANK_R*sin(${phi0}), sqrt(ROD_L^2-(CRANK_R*sin(${phi0}))^2))`;
}

function buildNodes(): NodeDef[] {
  const nodes: NodeDef[] = [
    { name: "Crank", parent: "root", pivot: [0, 0, 0], motion: "rotate", axis: "x", note: "曲轴轴线 = X 轴" },
    {
      name: "Cam_L",
      parent: "root",
      pivot: ["CASE_X", "CAM_BASE*COS_HV", "-CAM_BASE*SIN_HV"],
      motion: "rotate",
      axis: "x",
      note: "左列凸轮轴（半速，相位烘焙在几何里）",
    },
    {
      name: "Cam_R",
      parent: "root",
      pivot: ["CASE_X", "CAM_BASE*COS_HV", "CAM_BASE*SIN_HV"],
      motion: "rotate",
      axis: "x",
      note: "右列凸轮轴",
    },
    {
      name: "Fan_L",
      parent: "root",
      pivot: ["FAN_X", "FAN_Y", "-FAN_Z"],
      motion: "rotate",
      axis: "x",
      note: "左风扇（皮带轮与叶轮同轴）",
    },
    {
      name: "Fan_R",
      parent: "root",
      pivot: ["FAN_X", "FAN_Y", "FAN_Z"],
      motion: "rotate",
      axis: "x",
      note: "右风扇",
    },
  ];
  for (let i = 0; i < 12; i++) {
    const pin = Math.floor(i / 2);
    const side: 1 | -1 = (i + 1) % 2 === 1 ? -1 : 1;
    const x = `CYL_X1-${pin}*CYL_PITCH`;
    const s0 = pistonTravel0(pin, side);
    nodes.push({
      name: pistonNodeName(i + 1),
      parent: "root",
      pivot: [x, `${s0}*COS_HV`, side === 1 ? `${s0}*SIN_HV` : `-${s0}*SIN_HV`],
      rest_rotation: [side === 1 ? "HALF_V" : "-HALF_V", 0, 0],
      motion: "translate",
      note: `缸 ${i + 1} 活塞（${side === 1 ? "右" : "左"}列，θ=0 姿态）`,
    });
    nodes.push({
      name: rodNodeName(i + 1),
      parent: "root",
      // 同一曲柄销上的左右列连杆沿轴向分列两侧（±14mm）：销宽 54mm 容纳 2*26mm 杆宽。
      // 不分列时两根连杆/杆盖在同一销位上重叠（实测 8.7mm）。
      pivot: [
        side === 1 ? `${x}+ROD_SIDE_OFFSET` : `${x}-ROD_SIDE_OFFSET`,
        `CRANK_R*cos(${pin * 60})`,
        `CRANK_R*sin(${pin * 60})`,
      ],
      rest_rotation: [`${side === 1 ? "HALF_V" : "-HALF_V"}+${rodSwing0(pin, side)}`, 0, 0],
      motion: "rotate",
      axis: "x",
      note: `缸 ${i + 1} 连杆（大端套曲柄销，θ=0 姿态）`,
    });
  }
  return nodes;
}

// ---------------------------------------------------------------------------
// 材质
// ---------------------------------------------------------------------------

// 材质分档（对照 docs/去塑料积木感-视觉真实感技术指南.md 第 3 章）：
//   铸铁 metalness 0.6–0.66 / 锻钢 0.8+ / 铝 0.75+ / 黄铜 0.9 / 漆面 ≤ 0.2 / 橡胶 ≈ 0
//   roughness 不齐平：铸面 0.58–0.66、锻钢 0.28–0.46、铝 0.3、漆面 0.45、橡胶 0.9
//   envMapIntensity 逐材质给出，金属 ≥ 1 才能反射出环境。
const MATERIALS: ModelRegistry["materials"] = {
  cast_iron: { base: "#71767b", metalness: 0.62, roughness: 0.58, preset: "cast", envMapIntensity: 0.95 },
  cast_iron_dark: { base: "#585d62", metalness: 0.6, roughness: 0.66, preset: "cast", envMapIntensity: 0.9 },
  steel: { base: "#9ba1a7", metalness: 0.88, roughness: 0.28, preset: "steel", envMapIntensity: 1.2 },
  steel_worn: {
    base: "#84898f",
    metalness: 0.82,
    roughness: 0.46,
    preset: "steel_rough",
    envMapIntensity: 1.05,
  },
  aluminium: { base: "#c2c8ce", metalness: 0.78, roughness: 0.3, preset: "steel", envMapIntensity: 1.25 },
  paint: {
    base: "#59604f",
    metalness: 0.12,
    roughness: 0.5,
    preset: "primer",
    clearcoat: 0.72,
    clearcoatRoughness: 0.24,
    envMapIntensity: 1,
  },
  rubber_belt: { base: "#26292d", metalness: 0.02, roughness: 0.9, preset: "rubber", envMapIntensity: 0.5 },
  bakelite: { base: "#2f2b26", metalness: 0.1, roughness: 0.6, preset: "none", envMapIntensity: 0.6 },
  brass: { base: "#b3893c", metalness: 0.92, roughness: 0.32, preset: "steel", envMapIntensity: 1.3 },
};

// ---------------------------------------------------------------------------
// 布局实现
// ---------------------------------------------------------------------------

/** 缸列高度表（layout = bank 时按零件取高度）。 */
const BANK_HEIGHT: Record<string, (c: Record<string, number>) => number> = {
  "tiger.cylinder.block": (c) => c.BLOCK_BASE,
  "tiger.cylinder.liner": (c) => c.LINER_CENTER,
  "tiger.cylinder.head_gasket": (c) => c.GASKET_BOTTOM,
  "tiger.cylinder.head": (c) => c.HEAD_BASE,
  "tiger.cylinder.cam_cover": (c) => c.COVER_BASE,
};

/** 单缸内联的活塞环：3 道环按 index % 3 分布在活塞销上方。 */
const RING_COUNT = 3;

function makeLayouts(): Record<string, InstanceLayout> {
  const layouts: Record<string, InstanceLayout> = {};

  layouts[ENGINE_LAYOUTS.bank] = ({ partId, index, constants }) => {
    const height = BANK_HEIGHT[partId];
    if (!height) throw new Error(`engine.bank 布局：零件 "${partId}" 未登记高度`);
    const { pin, side } = cylinderInfo(index, constants);
    return bankMatrix(side, constants.CYL_X1 - pin * constants.CYL_PITCH, height(constants), 0, 0, constants);
  };

  // 主轴承座：沿 X 绝对排布（mate 不带任何位移，否则 J0 会被加两次、整排前移 0.42m）
  layouts[ENGINE_LAYOUTS.crankJournal] = ({ index, constants }) =>
    new THREE.Matrix4().makeTranslation(constants.JOURNAL_X0 - index * constants.CYL_PITCH, 0, 0);

  // 主轴颈：同一排位，管轴倒向 X —— 旋转必须写在布局里：写进 mate.rotation 会把
  // 布局位移 (x,y) 一起旋转，7 个轴颈会竖着叠成一摞（实测 Y -0.42…+0.53，全在 X=0.42）。
  layouts[ENGINE_LAYOUTS.crankJournalAxis] = ({ index, constants }) =>
    new THREE.Matrix4()
      .makeTranslation(constants.JOURNAL_X0 - index * constants.CYL_PITCH, 0, 0)
      .multiply(new THREE.Matrix4().makeRotationZ(deg2rad(-90)));

  // 曲柄销：绕曲轴轴线转到 60k 相位后抬到曲柄半径处。
  // 末尾的 rotateZ(-90°) 把圆柱管轴由局部 +Y 倒到 +X（曲柄销轴必须平行曲轴），
  // 与主轴颈同法；写在最后 = 作用在几何上，不会把 CRANK_R 偏移也一起转走。
  layouts[ENGINE_LAYOUTS.crankPin] = ({ index, constants }) => {
    const k = index;
    return new THREE.Matrix4()
      .makeTranslation(constants.CYL_X1 - k * constants.CYL_PITCH, 0, 0)
      .multiply(new THREE.Matrix4().makeRotationX(deg2rad(k * 60)))
      .multiply(new THREE.Matrix4().makeTranslation(0, constants.CRANK_R, 0))
      .multiply(new THREE.Matrix4().makeRotationZ(deg2rad(-90)));
  };

  // 曲柄臂：曲柄销两侧各一片，相位与所属销一致
  layouts[ENGINE_LAYOUTS.crankWeb] = ({ index, constants }) => {
    const k = Math.floor(index / 2);
    const sign = index % 2 === 0 ? -1 : 1;
    return new THREE.Matrix4()
      .makeTranslation(constants.CYL_X1 - k * constants.CYL_PITCH + sign * constants.WEB_GAP, 0, 0)
      .multiply(new THREE.Matrix4().makeRotationX(deg2rad(k * 60)));
  };

  layouts[ENGINE_LAYOUTS.caseRib] = ({ index, constants }) => {
    const slot = Math.floor(index / 2);
    const sign = index % 2 === 0 ? -1 : 1;
    return new THREE.Matrix4().makeTranslation(
      constants.RIB_X1 - slot * constants.RIB_PITCH,
      constants.RIB_Y,
      sign * constants.RIB_Z,
    );
  };

  layouts[ENGINE_LAYOUTS.caseMount] = ({ index, constants }) => {
    const slot = Math.floor(index / 2);
    const sign = index % 2 === 0 ? -1 : 1;
    return new THREE.Matrix4().makeTranslation(
      slot === 0 ? constants.MOUNT_X2 : constants.MOUNT_X,
      constants.MOUNT_Y,
      sign * constants.MOUNT_Z,
    );
  };

  layouts[ENGINE_LAYOUTS.inspectionCover] = ({ index, constants }) => {
    const slot = Math.floor(index / 2);
    const sign = index % 2 === 0 ? -1 : 1;
    return new THREE.Matrix4().makeTranslation(
      slot === 0 ? constants.COVER_X1 : constants.COVER_X2,
      constants.COVER_Y,
      sign * constants.COVER_Z,
    );
  };

  layouts[ENGINE_LAYOUTS.pistonRing] = ({ index, constants }) => {
    const slot = index % RING_COUNT;
    return new THREE.Matrix4().makeTranslation(0, constants.RING_Y1 - slot * constants.RING_STEP, 0);
  };

  // 活塞销：几何沿 +Y 建模，销轴要转到曲轴轴向 X。instance_nodes 驱动的零件由节点矩阵定位，
  // assembler 会忽略 mate.rotation（同 fanBearing），所以旋转只能写在布局里。
  // 若漏掉，活塞销会顺着缸轴立着穿过连杆小头（实测 7.99mm 穿透）。
  layouts[ENGINE_LAYOUTS.pistonPin] = () => new THREE.Matrix4().makeRotationZ(deg2rad(-90));

  // 气门：每缸 2 只（index 偶 = 进气 / 奇 = 排气），坐标随列侧镜像
  layouts[ENGINE_LAYOUTS.valve] = ({ index, constants }) => {
    const { pin, side } = cylinderInfo(Math.floor(index / 2), constants);
    const exhaust = index % 2 === 1;
    const lateral = (exhaust ? 1 : -1) * side * constants.VALVE_Z;
    const tilt = (exhaust ? 1 : -1) * side * constants.VALVE_TILT;
    return bankMatrix(
      side,
      constants.CYL_X1 - pin * constants.CYL_PITCH,
      constants.VALVE_SEAT,
      lateral,
      tilt,
      constants,
    );
  };

  // 火花塞：每缸 2 只（HL230 双点火）。index 0..11 = 前位、12..23 = 后位（同侧错开）；
  // 护套 plug_boot 共用本布局（几何自带 62mm 底口偏移），坐标只在这里写一遍。
  layouts[ENGINE_LAYOUTS.sparkPlug] = ({ index, constants }) => {
    const twin = index >= 12;
    const { pin, side } = cylinderInfo(index % 12, constants);
    return bankMatrix(
      side,
      constants.CYL_X1 - pin * constants.CYL_PITCH + (twin ? constants.PLUG_TWIN_DX : 0),
      constants.PLUG_BASE,
      side * constants.PLUG_Z,
      0,
      constants,
    );
  };

  layouts[ENGINE_LAYOUTS.magneto] = ({ index, constants }) =>
    new THREE.Matrix4().makeTranslation(
      constants.MAGNETO_X,
      constants.MAGNETO_Y,
      (index === 0 ? -1 : 1) * constants.MAGNETO_Z,
    );

  // 输油泵：泵轴必须指向壁外（±Z），所以布局 = 平移 · Rx(±90°)（lathe 的 +Y → ±Z）。
  // 原为 Rz(∓90°)：泵轴被拧成沿 X，泵体半边嵌进曲轴箱侧壁（59.4mm 穿透）。
  layouts[ENGINE_LAYOUTS.fuelPump] = ({ index, constants }) =>
    new THREE.Matrix4()
      .makeTranslation(
        constants.FUELPUMP_X,
        constants.FUELPUMP_Y,
        (index === 0 ? -1 : 1) * constants.FUELPUMP_Z,
      )
      .multiply(new THREE.Matrix4().makeRotationX(deg2rad(index === 0 ? -90 : 90)));

  // 风扇轴承：位移写在世界方位上，管轴倒向 X（AXIS_X）放在布局里 ——
  // 若把它写进 mate.rotation，位移会连同 (x,y) 一起被旋转，零件甩到机体下方
  // （曾实测飞到 y=-0.562，离最近零件 63mm）。与 fuelPump 同一约定。
  layouts[ENGINE_LAYOUTS.fanBearing] = ({ index, constants }) =>
    new THREE.Matrix4()
      .makeTranslation(constants.FAN_BEARING_X, constants.FAN_Y, (index === 0 ? -1 : 1) * constants.FAN_Z)
      .multiply(new THREE.Matrix4().makeRotationZ(deg2rad(-90)));

  // 风扇皮带：0 = 左风扇（z 负侧），1 = 右风扇；绕 X 转出「主动轮 → 被动轮」方向
  layouts[ENGINE_LAYOUTS.driveBelt] = ({ index, constants }) => {
    const left = index === 0;
    const rotation = deg2rad(
      evaluateExpression(left ? "atan2(-FAN_Y,-FAN_Z)" : "atan2(-FAN_Y,FAN_Z)", constants),
    );
    return new THREE.Matrix4()
      .makeTranslation(constants.PULLEY_X + (left ? -1 : 1) * constants.PULLEY_OFF, 0, 0)
      .multiply(new THREE.Matrix4().makeRotationX(rotation));
  };

  layouts[ENGINE_LAYOUTS.carburetor] = ({ index, constants }) => bankPairOf("CARB_BASE_Y", index, constants);
  layouts[ENGINE_LAYOUTS.airFilter] = ({ index, constants }) => bankPairOf("FILTER_BASE_Y", index, constants);

  // ---- L1 第一批：紧固件布局（全部由 constants 派生，位置不手写）----

  // 油底壳螺栓圈：0..8 = −z 长边、9..17 = +z 长边、18 = −x 短边中、19 = +x 短边中
  layouts[ENGINE_LAYOUTS.sumpBolt] = ({ index, constants }) => {
    if (index >= 18) {
      const sign = index === 18 ? -1 : 1;
      return new THREE.Matrix4().makeTranslation(sign * constants.SUMP_BOLT_XB, constants.SUMP_BOLT_Y, 0);
    }
    const row = Math.floor(index / 9);
    const k = index % 9;
    const span = constants.SUMP_BOLT_XB - constants.SUMP_BOLT_XA;
    return new THREE.Matrix4().makeTranslation(
      constants.SUMP_BOLT_XA + (k * span) / 8,
      constants.SUMP_BOLT_Y,
      row === 0 ? -constants.SUMP_BOLT_Z : constants.SUMP_BOLT_Z,
    );
  };

  // 检查盖螺栓：index = 盖(0/1) × 面(−z/+z) × 四角(0..3)。
  // 头在盖外、杆沿 ±z 指进盖板：旋转写进布局（与 fuelPump/fanBearing 同一约定）。
  layouts[ENGINE_LAYOUTS.inspectionBolt] = ({ index, constants }) => {
    const cover = Math.floor(index / 8);
    const side: 1 | -1 = Math.floor((index % 8) / 4) === 0 ? -1 : 1;
    const slot = index % 4;
    const dx = slot % 2 === 0 ? -constants.COVER_BOLT_DX : constants.COVER_BOLT_DX;
    const dy = slot < 2 ? constants.COVER_BOLT_DY : -constants.COVER_BOLT_DY;
    return new THREE.Matrix4()
      .makeTranslation(
        (cover === 0 ? constants.COVER_X1 : constants.COVER_X2) + dx,
        constants.COVER_Y + dy,
        side * constants.COVER_BOLT_Z,
      )
      .multiply(new THREE.Matrix4().makeRotationX(deg2rad(-90 * side)));
  };

  // 正时齿轮盖螺栓圈：8 颗沿 ⌀0.21 均布，轴向沿 X（头在外、杆指进盖板）。
  // 上半天被铭牌（y≥0.075）与风扇支架附件梁（y≈0.033..0.087）占住，螺孔圈压在下半。
  layouts[ENGINE_LAYOUTS.timingBolt] = ({ index, constants }) => {
    const angle = deg2rad(190 + (index * 160) / 7);
    return new THREE.Matrix4()
      .makeTranslation(
        constants.TIMING_BOLT_X,
        constants.TIMING_BOLT_R * Math.sin(angle),
        constants.TIMING_BOLT_R * Math.cos(angle),
      )
      .multiply(new THREE.Matrix4().makeRotationZ(deg2rad(90)));
  };

  // 机脚螺栓：每只机脚 2 颗（index = 机脚 × 2，布局与 caseMount 同源）
  layouts[ENGINE_LAYOUTS.mountBolt] = ({ index, constants }) => {
    const mount = Math.floor(index / 2);
    const k = index % 2;
    const slot = Math.floor(mount / 2);
    const side = mount % 2 === 0 ? -1 : 1;
    return new THREE.Matrix4().makeTranslation(
      (slot === 0 ? constants.MOUNT_X2 : constants.MOUNT_X) + (k === 0 ? -1 : 1) * constants.MOUNT_BOLT_DX,
      constants.MOUNT_BOLT_Y,
      side * constants.MOUNT_Z,
    );
  };

  // 凸轮轴罩螺钉：每只罩 4 颗（罩顶面沿 X 两对，B1 从 2 颗加密到 4 颗）。
  // 头在上、杆向下（Rx 180°）；B1 加密后计数 24 → 48。
  layouts[ENGINE_LAYOUTS.coverScrew] = ({ index, constants }) => {
    const cover = Math.floor(index / 4);
    const k = index % 4;
    const dx = (k < 2 ? -1 : 1) * (k % 2 === 0 ? constants.COVER_SCREW_DX : constants.COVER_SCREW_DX / 3);
    const { pin, side } = cylinderInfo(cover, constants);
    return bankMatrix(
      side,
      constants.CYL_X1 - pin * constants.CYL_PITCH + dx,
      constants.COVER_SCREW_Y,
      0,
      0,
      constants,
    ).multiply(new THREE.Matrix4().makeRotationX(deg2rad(180)));
  };

  // 缸盖进/排气法兰螺栓：每缸 4 颗（进气口 2 + 排气口 2，同一法兰面上左右各 1）。
  // index = 缸(0..11) × 口(0 进气高口 / 1 排气低口) × 左右(−x/+x)。
  // 装在歧管支管起点的同一面：左列（side −1）在局部 −z、右列（side +1）在局部 +z
  // （歧管支管起点同侧，见 intake_manifold_l/r 的 mainFrom 分支）。
  // 头在法兰外、杆沿 ±z 指进法兰（Rx ∓90°，与 timingBolt/fanBearing 同一约定）。
  layouts[ENGINE_LAYOUTS.portFlangeBolt] = ({ index, constants }) => {
    const cylinder = Math.floor(index / 4);
    const port = Math.floor(index / 2) % 2 === 0 ? constants.PORT_IN_Y : constants.PORT_EX_Y;
    const dx = (index % 2 === 0 ? -1 : 1) * constants.PORT_FLANGE_BOLT_DX;
    const { pin, side } = cylinderInfo(cylinder, constants);
    return bankMatrix(
      side,
      constants.CYL_X1 - pin * constants.CYL_PITCH + dx,
      constants.HEAD_BASE + port,
      side * constants.PORT_FLANGE_BOLT_Z,
      0,
      constants,
    ).multiply(new THREE.Matrix4().makeRotationX(deg2rad(side > 0 ? -90 : 90)));
  };

  // 端板螺栓：前后端板各 12 颗，绕曲轴轴线 ⌀290 一圈。
  // 头在端板外面、杆沿 ∓x 指进端板（front: +Y→−X 用 Rz(+90)；rear: +Y→+X 用 Rz(−90)）。
  layouts[ENGINE_LAYOUTS.endplateBolt] = ({ index, constants }) => {
    const front = index < constants.ENDBOLT_COUNT;
    const k = index % constants.ENDBOLT_COUNT;
    const angle = deg2rad((k * 360) / constants.ENDBOLT_COUNT);
    return new THREE.Matrix4()
      .makeTranslation(
        front ? constants.CASE_FRONT_X + 0.001 : constants.CASE_REAR_X - 0.001,
        constants.ENDBOLT_R * Math.sin(angle),
        constants.ENDBOLT_R * Math.cos(angle),
      )
      .multiply(new THREE.Matrix4().makeRotationZ(deg2rad(front ? 90 : -90)));
  };

  // 点火高压线导管：每列 1 根横置在缸列上方（几何沿 +Y，布局末乘 Rz(-90°) 把它倒向 +X）。
  // 与 crankJournalAxis / pistonPin 同一约定：旋转必须写在布局里，
  // 若写进 mate.rotation，布局位移会连同 (x,y) 一起被旋转（磁电机就是这样被甩到机体后上方的）。
  layouts[ENGINE_LAYOUTS.htConduit] = ({ index, constants }) => {
    const side: 1 | -1 = index === 0 ? -1 : 1;
    return bankMatrix(
      side,
      constants.CONDUIT_X,
      constants.CONDUIT_Y,
      side * constants.PLUG_Z,
      0,
      constants,
    ).multiply(new THREE.Matrix4().makeRotationZ(deg2rad(-90)));
  };

  // 高压线：24 根与 24 只火花塞一一对应，x 与护套口同源（sparkPlug 布局 + 导管抬高）。
  layouts[ENGINE_LAYOUTS.htLead] = ({ index, constants }) => {
    const twin = index >= 12;
    const { pin, side } = cylinderInfo(index % 12, constants);
    return bankMatrix(
      side,
      constants.CYL_X1 - pin * constants.CYL_PITCH + (twin ? constants.PLUG_TWIN_DX : 0),
      constants.HT_LEAD_MID,
      side * constants.PLUG_Z,
      0,
      constants,
    );
  };

  // 磁电机干线：从磁电机前端面正前 9mm 沿 ±Z 横接到导管侧壁（几何沿 +Y，布局末乘 Rx(±90°)）。
  layouts[ENGINE_LAYOUTS.magnetoBus] = ({ index, constants }) => {
    const side: 1 | -1 = index === 0 ? -1 : 1;
    return new THREE.Matrix4()
      .makeTranslation(constants.MAGNETO_BUS_X, constants.MAGNETO_BUS_Y, side * constants.MAGNETO_BUS_ZC)
      .multiply(new THREE.Matrix4().makeRotationX(deg2rad(side * 90)));
  };

  return layouts;
}

/**
 * 化油器 / 空滤的缸列定位（每列 2 只：前组 x = CARB_X_A，后组 x = CARB_X_B）。
 * lateral 取 side*PLENUM_Z：与进气歧管主管同一法向侧（歧管局部 z 即缸列法向），
 * 原为 -side*PLENUM_Z，化油器被摆到歧管对面一侧，与主管相距 307mm。
 */
function bankPairOf(
  heightKey: "CARB_BASE_Y" | "FILTER_BASE_Y",
  index: number,
  constants: Record<string, number>,
): THREE.Matrix4 {
  const side: 1 | -1 = index < 2 ? -1 : 1;
  const localX = index % 2 === 0 ? constants.CARB_X_A : constants.CARB_X_B;
  return bankMatrix(
    side,
    constants.CYL_X1 + localX,
    constants[heightKey],
    side * constants.PLENUM_Z,
    0,
    constants,
  );
}

// ---------------------------------------------------------------------------
// 零件
// ---------------------------------------------------------------------------

export function makeEngineLayouts(): Record<string, InstanceLayout> {
  return makeLayouts();
}

/**
 * 六角头短杆螺栓（L1 第一批紧固件共用几何）。
 * 局部系：原点 = 头的外端面，头沿 +Y 占 [0, H]，杆从 H 再伸 L。
 * 尺寸由 constants 派生（BOLT_HEAD_R / BOLT_HEAD_H / BOLT_SHANK_R / BOLT_SHANK_L）。
 */
function boltGeometry(): GeometrySpec {
  return {
    type: "lathe",
    segments: 6,
    profile: [
      [0, 0],
      ["BOLT_HEAD_R", 0],
      ["BOLT_HEAD_R", "BOLT_HEAD_H"],
      ["BOLT_SHANK_R", "BOLT_HEAD_H"],
      ["BOLT_SHANK_R", "BOLT_HEAD_H+BOLT_SHANK_L"],
      [0, "BOLT_HEAD_H+BOLT_SHANK_L"],
    ],
  };
}

export function makeEngineRegistry(): ModelRegistry {
  return {
    model: MODEL,
    title: "Maybach HL230 P45 V12 汽油机",
    subtitle: "虎式 I 后期型动力装置（L1 核心机构自内向外构建）",
    source_notes: [
      "公开资料：缸径 130 × 行程 145 mm，排量 23095 cc，6.8:1，700 PS @ 3000 r/min，1850 N·m @ 2100 r/min，干重 1200 kg。",
      "简化记录（M-C 待补）：张紧轮/正时齿轮组/调速器不建模；气缸盖不做气门导管座（气门直接站在燃烧室孔内）；活塞销座省略；飞轮壳不做起动机让位口。",
      "配气随动件（气门弹簧/挺杆/摇臂）：缸盖顶面到凸轮基圆只剩 25.8mm、罩壳底面距缸盖顶面 1.8mm，而凸轮升程扫掠半径 33mm 覆盖凸轮轴心下方 0~33mm 整条带；静态件要么与凸轮叶片相交（按缺陷必报）、要么退到 50mm 外成假件（HL230 实为 SOHC + 摇臂）——留到凸轮按相位运动的扫掠感知批次再补。",
      "点火线束（本轮新增）：24 根高压线按「每塞一根」建模（HL230 双点火 = 每缸 2 只火花塞 / 2 只护套），任务书写的高压线束 ×12 是每列一支点的算法；导管中心高出护套顶 90mm，两端都是净隙（护套顶面 1.2mm、导管柱面 0.8mm，对周边缸盖罩 28.0mm、进气歧管 42.9mm），不新增豁免族。",
      "磁电机实测位置：机体后上、两列缸列之间（x∈[-0.200,-0.100]，y≈0.59，z=±0.09）。原注「挂在正时齿轮盖前面」的位置（TIMING_COVER_X+0.112, y=0.1）与 ⌀104 减振器实测重叠 17.5mm，且正面走廊 x∈[0.475,0.675] 被风扇框占死，故维持现位；距最近缸盖 35.9mm，支架留待后续批次。",
      "磁电机干线走法：正面走廊（风扇框/减振器/皮带轮）插不进，垂插导管柱面又必然产生相交面（圆柱对圆柱垂交）；实测走「贴磁电机前端盖正前 9mm 沿 ±Z 横接导管」——端面平面距导管轴线 12mm（> 导管半径 11mm，整面不侵入），实测端面与端盖净隙 1.0mm。",
      "缸列坐标系：+Y 沿缸轴，+Z 右列朝外；进排气法兰面取 BLOCK_D/2 外侧，气门共线 ±6° 倾角相对缸轴。",
    ].join("\n"),
    constants: CONSTANTS,
    assemblies: [
      { id: "crankcase", name_cn: "曲轴箱总成", name_en: "crankcase", explode: [0, -0.7, 0] },
      { id: "crankshaft", name_cn: "曲轴总成", name_en: "crankshaft", explode: [1, 0, 0] },
      { id: "cylinder", name_cn: "缸体缸盖总成", name_en: "cylinder & head", explode: [0, 1, 0] },
      { id: "piston_rod", name_cn: "活塞连杆总成", name_en: "piston & rod", explode: [0, 1, 0] },
      { id: "valvetrain", name_cn: "配气机构", name_en: "valvetrain", explode: [0, 1, 0.4] },
      { id: "cooling", name_cn: "冷却系统", name_en: "cooling system", explode: [0, 1, 0] },
      { id: "induction", name_cn: "进排气系统", name_en: "induction & exhaust", explode: [0, 1, 0] },
      { id: "ignition", name_cn: "点火系统", name_en: "ignition", explode: [0, 1, 0] },
      { id: "accessory", name_cn: "附件驱动", name_en: "accessories", explode: [0, 0.6, 0] },
    ],
    nodes: buildNodes(),
    materials: MATERIALS,
    parts: buildParts(),
    // 构造性接触白名单：装配咬合（轴承/压装/剖分/插接）不报缺陷，真缺陷照报。
    expectedContacts: tigerEngineExpectedContacts,
  };
}

function buildParts(): PartDefinition[] {
  const parts: PartDefinition[] = [];
  const add = (def: PartDefinition) => parts.push(def);

  // ================= L1 曲轴箱 =================
  add({
    id: "tiger.crankcase.shell",
    name_cn: "曲轴箱壳体",
    name_en: "crankcase shell",
    assembly: "crankcase",
    build_layer: 1,
    build_order: 100,
    geometry: {
      type: "kit",
      kit: "caseShell",
      params: {
        length: "CASE_LEN",
        halfWidth: "CASE_HALF_W",
        wall: "CASE_WALL",
        bottom: "CASE_BOTTOM_Y",
        floor: "CASE_FLOOR",
        top: "CASE_TOP",
        deckOuterY: "DECK_OUTER_Y",
        deckOuterZ: "DECK_OUTER_Z",
        deckInnerY: "DECK_INNER_Y",
        deckInnerZ: "DECK_INNER_Z",
        ridgeBottomY: "RIDGE_BOTTOM_Y",
        rim: "DECK_RIM",
        trough: 1,
      },
    },
    material: "cast_iron",
    mate: { type: "absolute", position: ["CASE_X", 0, 0] },
    source:
      "隧道式曲轴箱：V 型机体截面沿 X 挤出，甲板整条打通为槽（槽口由机体缸孔座面封闭），谷底开口腔（RIDGE_BOTTOM_Y 避开连杆扫掠）",
  });
  add({
    id: "tiger.crankcase.endplate_front",
    name_cn: "曲轴箱前隔板",
    name_en: "front end plate",
    assembly: "crankcase",
    build_layer: 1,
    build_order: 101,
    geometry: {
      type: "kit",
      kit: "caseShell",
      params: {
        length: "ENDPLATE_T",
        halfWidth: "CASE_HALF_W",
        wall: "CASE_WALL",
        bottom: "CASE_BOTTOM_Y",
        floor: "CASE_FLOOR",
        top: "CASE_TOP",
        deckOuterY: "DECK_OUTER_Y",
        deckOuterZ: "DECK_OUTER_Z",
        deckInnerY: "DECK_INNER_Y",
        deckInnerZ: "DECK_INNER_Z",
        ridgeBottomY: "RIDGE_BOTTOM_Y",
        rim: "DECK_RIM",
        bore: "FRONT_BORE_R",
      },
    },
    material: "cast_iron",
    mate: { type: "absolute", position: ["ENDPLATE_FRONT_X", 0, 0] },
  });
  add({
    id: "tiger.crankcase.endplate_rear",
    name_cn: "曲轴箱后隔板",
    name_en: "rear end plate",
    assembly: "crankcase",
    build_layer: 1,
    build_order: 102,
    geometry: {
      type: "kit",
      kit: "caseShell",
      params: {
        length: "ENDPLATE_T",
        halfWidth: "CASE_HALF_W",
        wall: "CASE_WALL",
        bottom: "CASE_BOTTOM_Y",
        floor: "CASE_FLOOR",
        top: "CASE_TOP",
        deckOuterY: "DECK_OUTER_Y",
        deckOuterZ: "DECK_OUTER_Z",
        deckInnerY: "DECK_INNER_Y",
        deckInnerZ: "DECK_INNER_Z",
        ridgeBottomY: "RIDGE_BOTTOM_Y",
        rim: "DECK_RIM",
        bore: "REAR_BORE_R",
      },
    },
    material: "cast_iron",
    mate: { type: "absolute", position: ["ENDPLATE_REAR_X", 0, 0] },
  });
  add({
    id: "tiger.crankcase.bearing_support",
    name_cn: "主轴承座",
    name_en: "main bearing support",
    assembly: "crankcase",
    build_layer: 1,
    build_order: 103,
    geometry: {
      type: "kit",
      kit: "bearingSupport",
      params: {
        rInner: "BEARING_R_IN",
        rOuter: "BEARING_R_OUT",
        width: "BEARING_W",
        reachZ: "BEARING_REACH_Z",
        reachUp: "BEARING_REACH_UP",
        reachDown: "BEARING_REACH_DOWN",
      },
    },
    material: "cast_iron",
    // 位置全部交给 instance_layout（mate 再加 JOURNAL_X0 会把整排前移 0.42m）
    mate: { type: "absolute" },
    instances: 7,
    indexed: true,
    instance_layout: ENGINE_LAYOUTS.crankJournal,
    source: "隧道式曲轴箱：7 个环形轴承座替代剖分式主轴承盖",
  });
  add({
    id: "tiger.crankcase.rib",
    name_cn: "机体加强肋",
    name_en: "crankcase rib",
    assembly: "crankcase",
    build_layer: 1,
    build_order: 104,
    geometry: { type: "box", w: "RIB_W_X", h: "RIB_H", d: "RIB_T", bevel: 0.002 },
    material: "cast_iron",
    mate: { type: "absolute" },
    instances: 12,
    indexed: true,
    instance_layout: ENGINE_LAYOUTS.caseRib,
  });
  add({
    id: "tiger.crankcase.mount",
    name_cn: "发动机机脚",
    name_en: "engine mount foot",
    assembly: "crankcase",
    build_layer: 1,
    build_order: 105,
    geometry: { type: "box", w: 0.1, h: 0.05, d: 0.09, bevel: 0.003 },
    material: "cast_iron",
    mate: { type: "absolute" },
    instances: 4,
    indexed: true,
    instance_layout: ENGINE_LAYOUTS.caseMount,
  });
  add({
    id: "tiger.crankcase.inspection_cover",
    name_cn: "曲轴箱检查盖",
    name_en: "inspection cover",
    assembly: "crankcase",
    build_layer: 1,
    build_order: 106,
    geometry: { type: "plate", w: 0.11, h: 0.09, t: 0.008, bevel: 0.002 },
    material: "cast_iron_dark",
    mate: { type: "absolute" },
    instances: 4,
    indexed: true,
    instance_layout: ENGINE_LAYOUTS.inspectionCover,
  });
  add({
    id: "tiger.crankcase.sump",
    name_cn: "油底壳",
    name_en: "oil sump",
    assembly: "crankcase",
    build_layer: 1,
    build_order: 107,
    geometry: {
      type: "merge",
      parts: [
        { type: "plate", w: 0.5, h: 0.012, t: 0.3, bevel: 0.002 },
        // 碗体下移「半个法兰厚 + 半个碗高」：法兰顶面贴曲轴箱底面，碗体挂在法兰下面
        { type: "box", w: 0.44, h: 0.062, d: 0.26, bevel: 0.004, at: [0, -0.037, 0] },
      ],
    },
    material: "cast_iron_dark",
    mate: { type: "absolute", position: [0, "SUMP_FLANGE_Y", 0] },
    source: "简化：法兰板 + 单腔壳体（真实为前后双腔带隔板）",
  });
  add({
    id: "tiger.crankcase.drain_plug",
    name_cn: "放油塞",
    name_en: "drain plug",
    assembly: "crankcase",
    build_layer: 1,
    build_order: 108,
    geometry: { type: "cylinder", r: 0.016, h: 0.024, bevel: 0.002 },
    material: "steel",
    mate: { type: "absolute", position: ["CASE_X", "DRAIN_PLUG_Y", 0] },
  });
  add({
    id: "tiger.crankcase.breather",
    name_cn: "曲轴箱通风器",
    name_en: "crankcase breather",
    assembly: "crankcase",
    build_layer: 1,
    build_order: 109,
    geometry: { type: "cylinder", r: 0.026, h: 0.07, bevel: 0.003 },
    material: "cast_iron",
    // x 前移 17mm：通风器（r=26）原中心在端板前脸 x=457mm，与风扇支架上横梁
    // （x≥477.5mm）在 y≈300mm 处相交 3.33mm；前移后左缘 466mm，让开 11.5mm
    mate: { type: "absolute", position: ["ENDPLATE_FRONT_X-0.017", "BREATHER_Y", 0] },
  });
  add({
    id: "tiger.crankcase.dipstick",
    name_cn: "油尺",
    name_en: "dipstick",
    assembly: "crankcase",
    build_layer: 1,
    build_order: 110,
    geometry: { type: "cylinder", r: 0.009, h: 0.2, bevel: 0.0015 },
    material: "steel",
    mate: { type: "absolute", position: ["DIPSTICK_X", "DIPSTICK_Y", "DIPSTICK_Z"] },
  });
  add({
    id: "tiger.crankcase.oil_filler",
    name_cn: "加油口",
    name_en: "oil filler",
    assembly: "crankcase",
    build_layer: 1,
    build_order: 111,
    geometry: { type: "cylinder", r: 0.028, h: 0.05, bevel: 0.003, rTop: 0.032 },
    material: "cast_iron",
    mate: { type: "absolute", position: ["OIL_FILLER_X", "OIL_FILLER_Y", "OIL_FILLER_Z"], rotation: AXIS_X },
  });
  add({
    id: "tiger.crankcase.oil_pump",
    name_cn: "机油泵",
    name_en: "oil pump",
    assembly: "crankcase",
    build_layer: 1,
    build_order: 112,
    geometry: { type: "cylinder", r: 0.045, h: 0.055, bevel: 0.003 },
    material: "cast_iron_dark",
    // x 落在肋板空档（肋板在 x=-0.212 / -0.054，±0.01）中间，避免泵体插进肋板
    mate: { type: "absolute", position: [-0.133, "OIL_PUMP_Y", "OIL_PUMP_Z"], rotation: AXIS_X },
  });
  add({
    id: "tiger.crankcase.oil_filter",
    name_cn: "机油滤清器",
    name_en: "oil filter",
    assembly: "crankcase",
    build_layer: 1,
    build_order: 113,
    geometry: { type: "tube", rOuter: "OIL_FILTER_R", rInner: "OIL_FILTER_R-0.01", h: "OIL_FILTER_LEN" },
    material: "steel",
    mate: { type: "absolute", position: ["OIL_FILTER_X", "OIL_FILTER_Y", "OIL_FILTER_Z"], rotation: AXIS_X },
  });
  add({
    id: "tiger.crankcase.oil_line_l",
    name_cn: "机油管（左）",
    name_en: "oil line (left)",
    assembly: "crankcase",
    build_layer: 1,
    build_order: 114,
    geometry: {
      // 从机油泵端面外侧起步（泵体 x∈[-0.1605,-0.1055]），径向朝 −z 侧壁走；
      // 起点/终点都留在壁面与肋板之外，管端环面倾斜量已计入 2mm 以上余量。
      type: "weld",
      from: [-0.176, -0.1, "-(CASE_HALF_W+0.045)"],
      to: [-0.185, -0.12, "-(CASE_HALF_W+0.01)"],
      radius: 0.012,
      seed: 11,
    },
    material: "steel",
    mate: { type: "absolute" },
  });
  add({
    id: "tiger.crankcase.oil_line_r",
    name_cn: "机油管（右）",
    name_en: "oil line (right)",
    assembly: "crankcase",
    build_layer: 1,
    build_order: 115,
    geometry: {
      // 起点插在机油滤清器内腔（滤清器为 rOuter 0.06 / rInner 0.05 的管件），
      // 沿 X 走到 +z 侧壁；全程 y=-0.10，从机脚（y≤-0.13）上方通过。
      type: "weld",
      from: [-0.42, -0.1, "OIL_FILTER_Z"],
      to: [-0.3, -0.1, "CASE_HALF_W+0.016"],
      radius: 0.014,
      seed: 12,
    },
    material: "steel",
    mate: { type: "absolute" },
  });
  add({
    id: "tiger.crankcase.nameplate",
    name_cn: "铭牌",
    name_en: "nameplate",
    assembly: "crankcase",
    build_layer: 1,
    build_order: 116,
    geometry: { type: "plate", w: 0.16, h: 0.05, t: 0.004, bevel: 0.0008 },
    material: "brass",
    mate: { type: "absolute", position: ["NAMEPLATE_X", "NAMEPLATE_Y", "NAMEPLATE_Z"], rotation: [0, 90, 0] },
  });
  add({
    id: "tiger.crankcase.flywheel_housing",
    name_cn: "飞轮壳",
    name_en: "flywheel housing",
    assembly: "crankcase",
    build_layer: 1,
    build_order: 117,
    geometry: { type: "tube", rOuter: "HOUSING_R_OUT", rInner: "HOUSING_R_IN", h: "HOUSING_W" },
    material: "cast_iron",
    mate: { type: "absolute", position: ["HOUSING_X", 0, 0], rotation: AXIS_X },
  });
  add({
    id: "tiger.crankcase.timing_cover",
    name_cn: "正时齿轮盖",
    name_en: "timing gear cover",
    assembly: "crankcase",
    build_layer: 1,
    build_order: 118,
    geometry: {
      type: "kit",
      kit: "borePlate",
      params: { w: 0.26, d: 0.26, h: 0.02, bore: "TIMING_COVER_BORE", corner: 0.05, axis: "x" },
    },
    material: "cast_iron",
    // y 必须为 0：正时齿轮盖的镗孔要与曲轴轴线同心（原来 +0.03 让曲轴前端插进盖板本体）
    mate: { type: "absolute", position: ["TIMING_COVER_X", 0, 0] },
  });

  // ================= L1 曲轴 =================
  add({
    id: "tiger.crankshaft.main_journal",
    name_cn: "主轴颈",
    name_en: "main journal",
    assembly: "crankshaft",
    build_layer: 1,
    build_order: 119,
    geometry: { type: "cylinder", r: "JOURNAL_R", h: "JOURNAL_W", bevel: 0.002 },
    material: "steel",
    node: "Crank",
    // 管轴倒向 X + 排位都在 instance_layout（mate 带位移/旋转都会被布局叠乘一次）
    mate: { type: "absolute" },
    instances: 7,
    indexed: true,
    instance_layout: ENGINE_LAYOUTS.crankJournalAxis,
  });
  add({
    id: "tiger.crankshaft.crank_pin",
    name_cn: "曲柄销",
    name_en: "crank pin",
    assembly: "crankshaft",
    build_layer: 1,
    build_order: 120,
    geometry: { type: "cylinder", r: "PIN_R", h: "PIN_W", bevel: 0.002 },
    material: "steel",
    node: "Crank",
    mate: { type: "absolute" },
    instances: 6,
    indexed: true,
    instance_layout: ENGINE_LAYOUTS.crankPin,
  });
  add({
    id: "tiger.crankshaft.crank_web",
    name_cn: "曲柄臂",
    name_en: "crank web",
    assembly: "crankshaft",
    build_layer: 1,
    build_order: 121,
    geometry: {
      type: "kit",
      kit: "crankWeb",
      params: {
        t: "WEB_T",
        webR: "WEB_R",
        pinOffset: "CRANK_R",
        pinR: "PIN_R",
        journalR: "JOURNAL_R",
        counterR: "COUNTER_R",
      },
    },
    material: "steel",
    node: "Crank",
    mate: { type: "absolute" },
    instances: 12,
    indexed: true,
    instance_layout: ENGINE_LAYOUTS.crankWeb,
  });
  add({
    id: "tiger.crankshaft.nose",
    name_cn: "曲轴前端",
    name_en: "crank nose",
    assembly: "crankshaft",
    build_layer: 1,
    build_order: 122,
    geometry: { type: "cylinder", r: "NOSE_R", h: "NOSE_LEN", bevel: 0.002 },
    material: "steel",
    node: "Crank",
    mate: { type: "absolute", position: ["NOSE_X", 0, 0], rotation: AXIS_X },
  });
  add({
    id: "tiger.crankshaft.damper",
    name_cn: "扭振减振器",
    name_en: "torsional damper",
    assembly: "crankshaft",
    build_layer: 1,
    build_order: 123,
    geometry: { type: "tube", rOuter: "DAMPER_R", rInner: "DAMPER_BORE", h: "DAMPER_T" },
    material: "steel_worn",
    node: "Crank",
    mate: { type: "absolute", position: ["DAMPER_X", 0, 0], rotation: AXIS_X },
  });
  add({
    id: "tiger.crankshaft.pulley",
    name_cn: "曲轴皮带轮",
    name_en: "crankshaft pulley",
    assembly: "crankshaft",
    build_layer: 1,
    build_order: 124,
    geometry: {
      type: "lathe",
      segments: 40,
      profile: [
        ["PULLEY_BORE", "-PULLEY_HALF_W"],
        ["PULLEY_HUB_R", "-PULLEY_HALF_W"],
        ["PULLEY_HUB_R", "-PULLEY_EDGE_OFF"],
        ["PULLEY_R", "-PULLEY_EDGE_OFF"],
        ["PULLEY_R", "-PULLEY_OFF-PULLEY_OPEN_HALF"],
        ["PULLEY_GROOVE_R", "-PULLEY_OFF-PULLEY_ROOT_HALF"],
        ["PULLEY_GROOVE_R", "-PULLEY_OFF+PULLEY_ROOT_HALF"],
        ["PULLEY_R", "-PULLEY_OFF+PULLEY_OPEN_HALF"],
        ["PULLEY_R", "PULLEY_OFF-PULLEY_OPEN_HALF"],
        ["PULLEY_GROOVE_R", "PULLEY_OFF-PULLEY_ROOT_HALF"],
        ["PULLEY_GROOVE_R", "PULLEY_OFF+PULLEY_ROOT_HALF"],
        ["PULLEY_R", "PULLEY_OFF+PULLEY_OPEN_HALF"],
        ["PULLEY_R", "PULLEY_EDGE_OFF"],
        ["PULLEY_HUB_R", "PULLEY_EDGE_OFF"],
        ["PULLEY_HUB_R", "PULLEY_HALF_W"],
        ["PULLEY_BORE", "PULLEY_HALF_W"],
        ["PULLEY_BORE", "-PULLEY_HALF_W"],
      ],
    },
    material: "steel_worn",
    node: "Crank",
    mate: { type: "absolute", position: ["PULLEY_X", 0, 0], rotation: AXIS_X_NEG },
    source: "双槽 V 带轮：槽根半径比皮带底面低 1mm，槽口比皮带每侧宽 3.5mm（零穿模余量）",
  });
  add({
    id: "tiger.crankshaft.flywheel",
    name_cn: "飞轮",
    name_en: "flywheel",
    assembly: "crankshaft",
    build_layer: 1,
    build_order: 125,
    geometry: { type: "cylinder", r: "FLYWHEEL_R", h: "FLYWHEEL_T", bevel: 0.003 },
    material: "cast_iron",
    node: "Crank",
    mate: { type: "absolute", position: ["FLYWHEEL_X", 0, 0], rotation: AXIS_X },
  });
  add({
    id: "tiger.crankshaft.ring_gear",
    name_cn: "飞轮齿圈",
    name_en: "flywheel ring gear",
    assembly: "crankshaft",
    build_layer: 1,
    build_order: 126,
    geometry: {
      type: "kit",
      kit: "gearRing",
      params: {
        rInner: "RINGGEAR_R_IN",
        rOuter: "RINGGEAR_R_OUT",
        teeth: "RINGGEAR_TEETH",
        width: "RINGGEAR_W",
      },
    },
    material: "steel_worn",
    node: "Crank",
    mate: { type: "absolute", position: ["FLYWHEEL_X", 0, 0] },
  });
  add({
    id: "tiger.crankshaft.flywheel_bolts",
    name_cn: "飞轮螺栓",
    name_en: "flywheel bolts",
    assembly: "crankshaft",
    build_layer: 1,
    build_order: 127,
    geometry: {
      type: "boltCircle",
      count: 8,
      radius: "FLYWHEEL_BOLT_CIRCLE",
      boltR: "FLYWHEEL_BOLT_R",
      boltH: "FLYWHEEL_BOLT_H",
    },
    material: "steel",
    node: "Crank",
    mate: { type: "absolute", position: ["FLYWHEEL_BOLT_X", 0, 0], rotation: AXIS_X_NEG },
  });
  add({
    id: "tiger.crankshaft.tail_shaft",
    name_cn: "曲轴尾轴",
    name_en: "tail shaft",
    assembly: "crankshaft",
    build_layer: 1,
    build_order: 128,
    geometry: { type: "cylinder", r: "TAIL_R", h: "TAIL_LEN", bevel: 0.002 },
    material: "steel",
    node: "Crank",
    mate: { type: "absolute", position: ["TAIL_X", 0, 0], rotation: AXIS_X },
  });

  // ================= L1 缸体缸盖 =================
  add({
    id: "tiger.cylinder.block",
    name_cn: "连体缸壁",
    name_en: "siamese cylinder block",
    assembly: "cylinder",
    build_layer: 1,
    build_order: 129,
    geometry: {
      type: "kit",
      kit: "siameseBlock",
      params: {
        w: "BLOCK_W",
        d: "BLOCK_D",
        h: "BLOCK_H",
        jacket: "JACKET_R",
        corner: 0.012,
        deckH: 0.014,
        ribH: 0.011,
        bevel: 0,
      },
    },
    material: "cast_iron",
    mate: { type: "absolute" },
    instances: 12,
    indexed: true,
    instance_layout: ENGINE_LAYOUTS.bank,
    source: "缸心距 158mm < 缸壁外径 → 相邻缸必须切平共壁（连体缸筒）",
  });
  add({
    id: "tiger.cylinder.liner",
    name_cn: "缸套",
    name_en: "cylinder liner",
    assembly: "cylinder",
    build_layer: 1,
    build_order: 130,
    geometry: { type: "tube", rOuter: "LINER_R_OUT", rInner: "LINER_R_IN", h: "LINER_LEN" },
    material: "steel_worn",
    mate: { type: "absolute" },
    instances: 12,
    indexed: true,
    instance_layout: ENGINE_LAYOUTS.bank,
    source: "短湿式缸套：下端与油底壳腔连通（活塞裙部在下止点略伸入曲轴箱）",
  });
  add({
    id: "tiger.cylinder.head_gasket",
    name_cn: "缸垫",
    name_en: "head gasket",
    assembly: "cylinder",
    build_layer: 1,
    build_order: 131,
    geometry: {
      type: "kit",
      kit: "siameseBlock",
      params: {
        w: "BLOCK_W",
        d: "BLOCK_D",
        h: "GASKET_T",
        jacket: "GASKET_BORE_R",
        corner: 0.012,
        deckH: 0,
        ribH: 0,
        bevel: 0,
      },
    },
    material: "cast_iron_dark",
    mate: { type: "absolute" },
    instances: 12,
    indexed: true,
    instance_layout: ENGINE_LAYOUTS.bank,
  });
  add({
    id: "tiger.cylinder.head",
    name_cn: "气缸盖",
    name_en: "cylinder head",
    assembly: "cylinder",
    build_layer: 1,
    build_order: 132,
    geometry: {
      type: "kit",
      kit: "cylinderHead",
      params: {
        w: "BLOCK_W",
        d: "BLOCK_D",
        h: "HEAD_H",
        chamber: "HEAD_CHAMBER_R",
        portW: 0.054,
        // 法兰宽单独给：端口两侧要留进/排气法兰螺栓座（B1）
        flangeW: "HEAD_FLANGE_W",
        // 进/排气口高度与短管半径与歧管支管共用同一组常量（单一真值源）
        portInY: "PORT_IN_Y",
        portExY: "PORT_EX_Y",
        portStubR: "PORT_STUB_R",
        boltRadius: 0.045,
        bevel: 0,
      },
    },
    material: "cast_iron",
    mate: { type: "absolute" },
    instances: 12,
    indexed: true,
    instance_layout: ENGINE_LAYOUTS.bank,
    source:
      "平板缸盖（真实为双涡流室半球盖）：燃烧室为通孔，气门共线装于孔内；" +
      "进/排气法兰加宽到 HEAD_FLANGE_W（78mm）留出法兰螺栓座（L1 第二批）",
  });
  add({
    id: "tiger.cylinder.cam_cover",
    name_cn: "凸轮轴罩",
    name_en: "camshaft cover",
    assembly: "cylinder",
    build_layer: 1,
    build_order: 133,
    geometry: {
      type: "kit",
      kit: "camCover",
      params: {
        length: "CAM_COVER_LEN",
        halfZ: "CAM_HALF_Z",
        height: "COVER_H",
        wall: 0.008,
        axisY: "CAM_BASE-COVER_BASE",
        journalBoreR: "CAM_JOURNAL_R+0.0015",
        filler: 0,
      },
    },
    material: "paint",
    mate: { type: "absolute" },
    instances: 12,
    indexed: true,
    instance_layout: ENGINE_LAYOUTS.bank,
  });

  // ================= L2 活塞连杆 =================
  add({
    id: "tiger.piston_rod.piston",
    name_cn: "活塞",
    name_en: "piston",
    assembly: "piston_rod",
    build_layer: 1,
    build_order: 140,
    geometry: {
      type: "lathe",
      segments: 32,
      profile: [
        [0, "PISTON_CROWN_Y-PISTON_CROWN_T"],
        ["PISTON_R-PISTON_WALL", "PISTON_CROWN_Y-PISTON_CROWN_T"],
        ["PISTON_R-PISTON_WALL", "-PISTON_SKIRT"],
        ["PISTON_R", "-PISTON_SKIRT-0.006"],
        ["PISTON_R", "RING_Y1-RING_STEP*2-GROOVE_H/2"],
        ["GROOVE_R", "RING_Y1-RING_STEP*2-GROOVE_H/2+0.0006"],
        ["GROOVE_R", "RING_Y1-RING_STEP*2+GROOVE_H/2-0.0006"],
        ["PISTON_R", "RING_Y1-RING_STEP*2+GROOVE_H/2"],
        ["PISTON_R", "RING_Y1-RING_STEP-GROOVE_H/2"],
        ["GROOVE_R", "RING_Y1-RING_STEP-GROOVE_H/2+0.0006"],
        ["GROOVE_R", "RING_Y1-RING_STEP+GROOVE_H/2-0.0006"],
        ["PISTON_R", "RING_Y1-RING_STEP+GROOVE_H/2"],
        ["PISTON_R", "RING_Y1-GROOVE_H/2"],
        ["GROOVE_R", "RING_Y1-GROOVE_H/2+0.0006"],
        ["GROOVE_R", "RING_Y1+GROOVE_H/2-0.0006"],
        ["PISTON_R", "RING_Y1+GROOVE_H/2"],
        ["PISTON_R", "PISTON_CROWN_Y"],
        [0, "PISTON_CROWN_Y"],
      ],
    },
    material: "aluminium",
    mate: { type: "absolute" },
    instances: 12,
    indexed: true,
    instance_nodes: Array.from({ length: 12 }, (_, i) => pistonNodeName(i + 1)),
    source: "简化：活塞销座省略（销直接穿过活塞内腔），冠部平顶",
  });
  add({
    id: "tiger.piston_rod.piston_ring",
    name_cn: "活塞环",
    name_en: "piston ring",
    assembly: "piston_rod",
    build_layer: 1,
    build_order: 141,
    geometry: { type: "tube", rOuter: "RING_R", rInner: "RING_R_IN", h: "RING_H" },
    material: "steel_worn",
    mate: { type: "absolute" },
    instances: 36,
    indexed: true,
    instance_nodes: Array.from({ length: 36 }, (_, i) => pistonNodeName(Math.floor(i / RING_COUNT) + 1)),
    instance_layout: ENGINE_LAYOUTS.pistonRing,
    source: "每缸 3 道（2 气环 + 1 油环）；环与环槽/缸套各留 0.8mm",
  });
  add({
    id: "tiger.piston_rod.piston_pin",
    name_cn: "活塞销",
    name_en: "piston pin",
    assembly: "piston_rod",
    build_layer: 1,
    build_order: 142,
    geometry: { type: "cylinder", r: "PISTON_PIN_R", h: "PISTON_PIN_LEN", bevel: 0.0015 },
    material: "steel",
    // 销轴转 X 不能用 mate.rotation：instance_nodes 零件由节点矩阵定位，assembler 忽略 mate
    //（同 fanBearing），旋转放在 instance_layout（engine.pistonPin）。
    mate: { type: "absolute" },
    instances: 12,
    indexed: true,
    instance_nodes: Array.from({ length: 12 }, (_, i) => pistonNodeName(i + 1)),
    instance_layout: ENGINE_LAYOUTS.pistonPin,
    source: "简化：活塞销座省略（销直接穿过活塞内腔），销轴沿曲轴 X",
  });
  add({
    id: "tiger.piston_rod.connecting_rod",
    name_cn: "连杆",
    name_en: "connecting rod",
    assembly: "piston_rod",
    build_layer: 1,
    build_order: 143,
    geometry: {
      type: "kit",
      kit: "rodAssembly",
      params: {
        length: "ROD_L",
        bigR: "ROD_BIG_R",
        bigBore: "ROD_BIG_BORE",
        smallR: "ROD_SMALL_R",
        smallBore: "ROD_SMALL_BORE",
        shankW: "ROD_SHANK_W",
        shankT: "ROD_SHANK_T",
      },
    },
    material: "steel",
    mate: { type: "absolute" },
    instances: 12,
    indexed: true,
    instance_nodes: Array.from({ length: 12 }, (_, i) => rodNodeName(i + 1)),
    source: "简化：不做油道与小端衬套孔座；大端上半环与连杆盖在 y=0 分面",
  });
  add({
    id: "tiger.piston_rod.rod_cap",
    name_cn: "连杆盖",
    name_en: "rod bearing cap",
    assembly: "piston_rod",
    build_layer: 1,
    build_order: 144,
    geometry: {
      type: "kit",
      kit: "rodCap",
      params: {
        bigR: "ROD_BIG_R",
        bigBore: "ROD_BIG_BORE",
        shankT: "ROD_SHANK_T",
        drop: 0.012,
      },
    },
    material: "steel",
    mate: { type: "absolute" },
    instances: 12,
    indexed: true,
    instance_nodes: Array.from({ length: 12 }, (_, i) => rodNodeName(i + 1)),
  });

  // ================= L2 配气机构 =================
  const lobeX = [0.395, 0.237, 0.079, -0.079, -0.237, -0.395];
  const lobePhaseLeft = lobeX.map((_, k) => -15 + 30 * k);
  const lobePhaseRight = lobeX.map((_, k) => 15 + 30 * k);
  const camParams = (phases: number[]) => ({
    length: "CAM_LEN",
    shaftR: "CAM_SHAFT_R",
    lobeR: "CAM_LOBE_R",
    lobeW: "CAM_LOBE_W",
    journalR: "CAM_JOURNAL_R",
    journalW: "CAM_JOURNAL_W",
    lobeX,
    lobePhase: phases,
  });
  add({
    id: "tiger.valvetrain.camshaft_l",
    name_cn: "凸轮轴（左列）",
    name_en: "camshaft (left bank)",
    assembly: "valvetrain",
    build_layer: 1,
    build_order: 145,
    geometry: { type: "kit", kit: "camshaft", params: camParams(lobePhaseLeft) },
    material: "steel",
    node: "Cam_L",
    // 凸轮轴 kit 自身已把轴线摆到 +X（见 kits.ts 的 shaft.rotateZ），
    // 这里再加 AXIS_X 会二次旋转成竖直轴（旧检测器 0.5mm 夹取把 15.8mm 穿透显示成"轻微接触"）。
    mate: { type: "absolute" },
    source: "SOHC：单根凸轮轴位于缸列中线上方，凸轮相位按 30° 等分（摇臂机构 M-C）",
  });
  add({
    id: "tiger.valvetrain.camshaft_r",
    name_cn: "凸轮轴（右列）",
    name_en: "camshaft (right bank)",
    assembly: "valvetrain",
    build_layer: 1,
    build_order: 146,
    geometry: { type: "kit", kit: "camshaft", params: camParams(lobePhaseRight) },
    material: "steel",
    node: "Cam_R",
    mate: { type: "absolute" },
  });
  add({
    id: "tiger.valvetrain.valve",
    name_cn: "气门",
    name_en: "poppet valve",
    assembly: "valvetrain",
    build_layer: 1,
    build_order: 147,
    geometry: {
      type: "lathe",
      segments: 24,
      profile: [
        [0, 0],
        ["VALVE_DISC_R", 0],
        ["VALVE_DISC_R", 0.0025],
        [0.018, 0.007],
        [0.0105, 0.011],
        ["VALVE_STEM_R", 0.016],
        ["VALVE_STEM_R", "VALVE_STEM_LEN"],
        [0, "VALVE_STEM_LEN"],
      ],
    },
    material: "steel_worn",
    mate: { type: "absolute" },
    instances: 24,
    indexed: true,
    instance_layout: ENGINE_LAYOUTS.valve,
    source: "每缸进/排气门各 1；倾角 ±6°（进排气对置），杆顶 5mm 内藏于凸轮罩内",
  });
  add({
    id: "tiger.valvetrain.spark_plug",
    name_cn: "火花塞",
    name_en: "spark plug",
    assembly: "valvetrain",
    build_layer: 1,
    build_order: 148,
    geometry: {
      type: "lathe",
      segments: 20,
      profile: [
        [0, 0],
        ["PLUG_TIP_R", 0],
        ["PLUG_TIP_R", 0.01],
        [0.0175, 0.013],
        [0.0175, 0.03],
        [0.0115, 0.035],
        [0.0115, 0.078],
        [0.0125, 0.081],
        [0.0125, 0.09],
        [0, 0.09],
      ],
    },
    material: "bakelite",
    mate: { type: "absolute" },
    instances: 24,
    indexed: true,
    instance_layout: ENGINE_LAYOUTS.sparkPlug,
    source:
      "HL230 双点火：每缸 2 只，12 缸共 24 只；受模型进气道布置（山谷内进气/空滤）限制，" +
      "第二只与第一只同侧、沿缸盖长度前后错开 45mm（真实机两塞分列进排气两侧）",
  });

  // ================= L3 冷却 =================
  add({
    id: "tiger.cooling.fan_rotor",
    name_cn: "冷却风扇",
    name_en: "cooling fan",
    assembly: "cooling",
    build_layer: 1,
    build_order: 149,
    geometry: {
      type: "kit",
      kit: "fanRotor",
      params: {
        blades: "FAN_BLADES",
        rHub: "FAN_HUB_R",
        rTip: "FAN_R",
        chord: "FAN_CHORD",
        pitchDeg: "FAN_PITCH_DEG",
        hubWidth: "FAN_HUB_W",
        pulleyR: "FAN_PULLEY_R",
        pulleyW: "FAN_PULLEY_W",
        pulleyX: "FAN_PULLEY_X",
        shaftR: "FAN_SHAFT_R",
      },
    },
    material: "aluminium",
    mate: { type: "absolute" },
    instances: 2,
    indexed: true,
    instance_nodes: ["Fan_L", "Fan_R"],
    source: "两台 8 叶轴流风扇：带轮位于叶轮前方（同轴），避免皮带与叶片互插",
  });
  add({
    id: "tiger.cooling.fan_bearing",
    name_cn: "风扇轴承座",
    name_en: "fan bearing housing",
    assembly: "cooling",
    build_layer: 1,
    build_order: 150,
    geometry: {
      type: "tube",
      rOuter: "FAN_BEARING_R_OUT",
      rInner: "FAN_BEARING_R_IN",
      h: "FAN_BEARING_W",
    },
    material: "cast_iron",
    // 不使用 mate.rotation：旋转交给 instance_layout（见 makeEngineLayouts.fanBearing）
    mate: { type: "absolute" },
    instances: 2,
    indexed: true,
    instance_layout: ENGINE_LAYOUTS.fanBearing,
  });
  add({
    id: "tiger.cooling.fan_frame",
    name_cn: "风扇支架",
    name_en: "fan support frame",
    assembly: "cooling",
    build_layer: 1,
    build_order: 151,
    geometry: {
      type: "kit",
      kit: "fanFrame",
      params: {
        beamX: 0.03,
        beamDepth: 0.045,
        beamH: 0.09,
        halfSpan: 0.34,
        beamY: "FAN_Y",
        legTopZ: 0.26,
        footZ: 0.1,
        footY: 0.19,
        legW: 0.03,
        footLen: 0.05,
        fanZ: "FAN_Z",
        shroudR: 0.239,
        shroudWall: 0.012,
        shroudH: 0.09,
        shroudX: 0.115,
        accBeamY: "ACC_Y",
        accHalfSpan: 0.26,
        // 附件梁高度只留 28mm：梁底必须高于曲轴前端（r=36），梁顶让开铭牌下缘（y=75）
        accBeamH: 0.028,
        // 地脚/立撑/附件梁后端面 = 正时盖前端面（TIMING_COVER_X + 10mm）+ 1mm 间隙
        mountX: "TIMING_COVER_X+0.010+0.001-FAN_FRAME_X",
        // 右水管过孔：管心高度 = 右水管 y；管夹中心 = 附件梁后端面 + 15mm（管夹长 50mm）。
        // 管夹中心的世界 x = TIMING_COVER_X+0.026 = 0.504，管心 z 必须取水管轴线在该 x 处的值：
        // z = -(CASE_HALF_W+0.035) + (0.5-0.504)·0.0145/0.079 = -(CASE_HALF_W+0.0357342)。
        // 原 0.0318 与轴线差 2.5mm → 管夹内孔单侧切线切割（实测 displaced 2.44mm）
        pipeY: "ACC_Y-0.02",
        pipeZ: "-(CASE_HALF_W+0.0357342)",
        pipeR: 0.02,
        clampX: "TIMING_COVER_X+0.010+0.001-FAN_FRAME_X+0.015",
        clampLen: 0.05,
        // 轴承座：中心 = 风扇轴承中心；孔比轴承外径（FAN_BEARING_R_OUT）小 0.4mm
        bearingX: "FAN_BEARING_X-FAN_FRAME_X",
        bearingBoreR: "FAN_BEARING_R_OUT-0.0004",
        bearingLen: 0.05,
      },
    },
    material: "cast_iron",
    mate: { type: "absolute", position: ["FAN_FRAME_X", 0, 0] },
    source: "一体式：上横梁 + 附件下横梁 + 斜撑 + 地脚 + 两风扇导流罩环（无悬空零件）",
  });
  add({
    id: "tiger.cooling.drive_belt",
    name_cn: "风扇皮带",
    name_en: "fan drive belt",
    assembly: "cooling",
    build_layer: 1,
    build_order: 152,
    geometry: {
      type: "kit",
      kit: "beltLoop",
      params: {
        rDriving: "PULLEY_R-BELT_T/2",
        // 被动侧半径 +0.8mm：带面与带轮凸脊原为切线贴合，多边形近似下带面内缘切进轮面
        // （判定树实测交线 1618mm · suspect）——留 0.8mm 净隙，视觉上看不出
        rDriven: "FAN_PULLEY_R+BELT_T/2+0.0008",
        d: "FAN_DIST",
        width: "BELT_WIDTH",
        halfThickness: "BELT_T/2",
        seed: 21,
      },
    },
    material: "rubber_belt",
    mate: { type: "absolute" },
    instances: 2,
    indexed: true,
    instance_layout: ENGINE_LAYOUTS.driveBelt,
    source: "开口带外切几何；主动轮侧皮带沉入 V 槽（外表面与轮缘齐平），被动轮侧包在凸脊外侧",
  });
  add({
    id: "tiger.cooling.water_pump",
    name_cn: "水泵",
    name_en: "water pump",
    assembly: "cooling",
    build_layer: 1,
    build_order: 153,
    geometry: {
      type: "lathe",
      segments: 24,
      profile: [
        [0, 0],
        ["WATERPUMP_R", 0],
        ["WATERPUMP_R", "WATERPUMP_LEN-0.012"],
        ["WATERPUMP_R-0.012", "WATERPUMP_LEN"],
        [0, "WATERPUMP_LEN"],
      ],
    },
    material: "cast_iron",
    mate: {
      type: "absolute",
      position: ["WATERPUMP_X", "ACC_Y", "-ACC_Z"],
      rotation: AXIS_X,
    },
    source: "由正时齿轮驱动（不做皮带轮）；挂在风扇支架下横梁前端",
  });
  add({
    id: "tiger.cooling.generator",
    name_cn: "发电机",
    name_en: "generator",
    assembly: "cooling",
    build_layer: 1,
    build_order: 154,
    geometry: {
      type: "lathe",
      segments: 24,
      profile: [
        [0, 0],
        ["GEN_R", 0],
        ["GEN_R", "GEN_LEN"],
        [0, "GEN_LEN"],
      ],
    },
    material: "cast_iron_dark",
    mate: { type: "absolute", position: ["GEN_X", "ACC_Y", "ACC_Z"], rotation: AXIS_X },
  });

  // ================= L3 进排气 =================
  add({
    id: "tiger.induction.carburetor",
    name_cn: "化油器",
    name_en: "carburetor",
    assembly: "induction",
    build_layer: 1,
    build_order: 155,
    geometry: {
      type: "lathe",
      segments: 28,
      profile: [
        [0, 0],
        ["CARB_R", 0],
        ["CARB_R", 0.012],
        [0.042, 0.02],
        [0.042, 0.086],
        [0.03, 0.098],
        [0.03, "CARB_H"],
        [0, "CARB_H"],
      ],
    },
    material: "aluminium",
    mate: { type: "absolute" },
    instances: 4,
    indexed: true,
    instance_layout: ENGINE_LAYOUTS.carburetor,
    source: "4 × Solex 52JFF 双喉化油器：每两缸共用一个（简化：每缸列 2 只）",
  });
  add({
    id: "tiger.induction.air_filter",
    name_cn: "空气滤清器",
    name_en: "air filter",
    assembly: "induction",
    build_layer: 1,
    build_order: 156,
    geometry: {
      type: "lathe",
      segments: 28,
      profile: [
        [0, 0],
        ["FILTER_NECK_R", 0],
        ["FILTER_NECK_R", "FILTER_NECK_H"],
        ["FILTER_R", "FILTER_NECK_H+0.01"],
        ["FILTER_R", "FILTER_NECK_H+0.01+FILTER_H"],
        [0.06, "FILTER_NECK_H+0.02+FILTER_H"],
        [0, "FILTER_NECK_H+0.02+FILTER_H"],
      ],
    },
    material: "steel_worn",
    mate: { type: "absolute" },
    instances: 4,
    indexed: true,
    instance_layout: ENGINE_LAYOUTS.airFilter,
    source: "简化：4 只罐式空滤直插化油器上方（真实为两侧各一大直径油浴滤清器）",
  });
  add({
    id: "tiger.induction.intake_manifold_l",
    name_cn: "进气歧管（左列）",
    name_en: "intake manifold (left bank)",
    assembly: "induction",
    build_layer: 1,
    build_order: 157,
    geometry: {
      type: "kit",
      kit: "manifold",
      params: {
        mainFrom: [0.07, "PLENUM_Y", "-PLENUM_Z"],
        mainTo: [-0.86, "PLENUM_Y", "-PLENUM_Z"],
        mainR: "INTAKE_MAIN_R",
        runners: [0, 1, 2, 3, 4, 5].map((k) => {
          const x = -(0.079 + 0.158 * k) + 0.0;
          return {
            from: [x, "PORT_IN_Y", "-(BLOCK_D/2+0.033)"],
            to: [x, "PLENUM_Y-0.02", "-PLENUM_Z"],
            r: "INTAKE_RUNNER_R",
            bend: 0.05,
          };
        }),
      },
    },
    material: "aluminium",
    mate: {
      type: "absolute",
      position: bankPos("CYL_X1", "HEAD_BASE", 0, -1),
      rotation: ["-HALF_V", 0, 0],
    },
    source: "等长支管（化油器式进气）；支管起点距缸盖进气道法兰面 2mm",
  });
  add({
    id: "tiger.induction.intake_manifold_r",
    name_cn: "进气歧管（右列）",
    name_en: "intake manifold (right bank)",
    assembly: "induction",
    build_layer: 1,
    build_order: 158,
    geometry: {
      type: "kit",
      kit: "manifold",
      params: {
        mainFrom: [0.07, "PLENUM_Y", "PLENUM_Z"],
        mainTo: [-0.86, "PLENUM_Y", "PLENUM_Z"],
        mainR: "INTAKE_MAIN_R",
        runners: [0, 1, 2, 3, 4, 5].map((k) => {
          const x = -(0.079 + 0.158 * k) + 0.0;
          return {
            from: [x, "PORT_IN_Y", "BLOCK_D/2+0.033"],
            to: [x, "PLENUM_Y-0.02", "PLENUM_Z"],
            r: "INTAKE_RUNNER_R",
            bend: 0.05,
          };
        }),
      },
    },
    material: "aluminium",
    mate: {
      type: "absolute",
      position: bankPos("CYL_X1", "HEAD_BASE", 0, 1),
      rotation: ["HALF_V", 0, 0],
    },
  });
  add({
    id: "tiger.induction.exhaust_manifold_l",
    name_cn: "排气歧管（左列）",
    name_en: "exhaust manifold (left bank)",
    assembly: "induction",
    build_layer: 1,
    build_order: 159,
    geometry: {
      type: "kit",
      kit: "manifold",
      params: {
        // 主管前端再前伸 45mm（0.07 → 0.115，世界 0.411 → 0.456）：
        // 让下管承口能在「正时箱加强肋前方」套在主管外壁上（肋的前端面在 x≈0.410，
        // 承口若后伸到肋的范围内会撞肋——实测 displace 14.5mm）
        mainFrom: [0.115, "EXHAUST_MAIN_Y", "-EXHAUST_MAIN_Z"],
        mainTo: [-0.86, "EXHAUST_MAIN_Y", "-EXHAUST_MAIN_Z"],
        mainR: "EXHAUST_MAIN_R",
        // 近端（管口）也封盖：歧管外包着承口，口是开的话腔内采样点会被奇偶判定误判成
        // 「在实体内」 → 承口压装报出 31mm 假深度
        capFrom: 1,
        // 封盖收进口内（外端面与管口齐平）：下管弯管起点在口外 6mm，
        // 外探 5mm 的默认封盖会被弯管首段穿过，多出一圈不绕轴的交线（形态→displaced）
        capInset: 1,
        runners: [0, 1, 2, 3, 4, 5].map((k) => {
          const x = -(0.079 + 0.158 * k) + 0.0;
          return {
            // 起点比进气支管低 30mm：两条支管共用缸盖法兰口时起弯段互穿
            // （判定树实测交线 1970mm · suspect）——按「上进气 / 下排气」分开口
            from: [x, "PORT_EX_Y", "-(BLOCK_D/2+0.033)"],
            to: [x, "EXHAUST_MAIN_Y", "-EXHAUST_MAIN_Z"],
            r: "EXHAUST_RUNNER_R",
            bend: 0.03,
          };
        }),
      },
    },
    material: "cast_iron_dark",
    mate: {
      type: "absolute",
      position: bankPos("CYL_X1", "HEAD_BASE", 0, -1),
      rotation: ["-HALF_V", 0, 0],
    },
  });
  add({
    id: "tiger.induction.exhaust_manifold_r",
    name_cn: "排气歧管（右列）",
    name_en: "exhaust manifold (right bank)",
    assembly: "induction",
    build_layer: 1,
    build_order: 160,
    geometry: {
      type: "kit",
      kit: "manifold",
      params: {
        // 与左列同理：主管前伸让承口避开工件前后端的加强肋
        mainFrom: [0.115, "EXHAUST_MAIN_Y", "EXHAUST_MAIN_Z"],
        mainTo: [-0.86, "EXHAUST_MAIN_Y", "EXHAUST_MAIN_Z"],
        mainR: "EXHAUST_MAIN_R",
        // 近端（管口）也封盖：歧管外包着承口，口是开的话腔内采样点会被奇偶判定误判成
        // 「在实体内」 → 承口压装报出 31mm 假深度
        capFrom: 1,
        // 封盖收进口内（外端面与管口齐平）：下管弯管起点在口外 6mm，
        // 外探 5mm 的默认封盖会被弯管首段穿过，多出一圈不绕轴的交线（形态→displaced）
        capInset: 1,
        runners: [0, 1, 2, 3, 4, 5].map((k) => {
          const x = -(0.079 + 0.158 * k) + 0.0;
          return {
            // 起点比进气支管低 30mm（上进气 / 下排气分开口，避免两条起弯段互穿）
            from: [x, "PORT_EX_Y", "BLOCK_D/2+0.033"],
            to: [x, "EXHAUST_MAIN_Y", "EXHAUST_MAIN_Z"],
            r: "EXHAUST_RUNNER_R",
            bend: 0.03,
          };
        }),
      },
    },
    material: "cast_iron_dark",
    mate: {
      type: "absolute",
      position: bankPos("CYL_X1", "HEAD_BASE", 0, 1),
      rotation: ["HALF_V", 0, 0],
    },
  });
  // 排气歧管主管轴（世界坐标，取 y/z 分量）：下管要与主管同轴插接。
  // 注意必须带 HEAD_BASE 偏移：歧管局部系原点在缸盖底面（GASKET_BOTTOM+GASKET_T+0.0006=0.4511），
  // 漏掉它承口会落到 y≈−0.04（曲轴箱前脸那层），插不到歧管还会撞上前端加强肋。
  const exhaustAxisL = bankPos("CYL_X1", "HEAD_BASE+EXHAUST_MAIN_Y", "-EXHAUST_MAIN_Z", -1);
  const exhaustAxisR = bankPos("CYL_X1", "HEAD_BASE+EXHAUST_MAIN_Y", "EXHAUST_MAIN_Z", 1);
  add({
    id: "tiger.induction.exhaust_pipe_l",
    name_cn: "排气下管（左）",
    name_en: "exhaust downpipe (left)",
    assembly: "induction",
    build_layer: 1,
    build_order: 161,
    geometry: {
      // 短承口是外套滑套：13 边形内切圆 0.0435×cos(π/13)=0.0422 > 主管外接圆 0.042，
      // 径向恒定留 0.24mm 净隙（多边形几何上不可能相交）；轴向与主管重叠 4mm 只为外观套住管口。
      // 关键约束：下管起点环垂直于管轴（近竖直），其 x 展布 = ±管半径 22mm；
      // 起点 x ≥ 0.478 才能让整个环落在歧管口封盖（x≤0.456）之外，否则环会从封盖里穿过去。
      type: "kit",
      kit: "manifold",
      params: {
        mainFrom: [0.452, exhaustAxisL[1], exhaustAxisL[2]],
        mainTo: [0.466, exhaustAxisL[1], exhaustAxisL[2]],
        mainR: "EXHAUST_SOCKET_R",
        mainSegments: 13,
        runners: [
          {
            from: [0.48, exhaustAxisL[1], exhaustAxisL[2]],
            to: [0.5, 0.1, "-0.37"],
            r: "EXHAUST_PIPE_R",
            bend: 0,
          },
        ],
      },
    },
    material: "cast_iron_dark",
    mate: { type: "absolute" },
  });
  add({
    id: "tiger.induction.exhaust_pipe_r",
    name_cn: "排气下管（右）",
    name_en: "exhaust downpipe (right)",
    assembly: "induction",
    build_layer: 1,
    build_order: 162,
    geometry: {
      // 同左管：外套滑套径向留 0.24mm 净隙，下管起点环（x 展布 ±22mm）整圈落在歧管口封盖之外。
      type: "kit",
      kit: "manifold",
      params: {
        mainFrom: [0.452, exhaustAxisR[1], exhaustAxisR[2]],
        mainTo: [0.466, exhaustAxisR[1], exhaustAxisR[2]],
        mainR: "EXHAUST_SOCKET_R",
        mainSegments: 13,
        runners: [
          {
            from: [0.48, exhaustAxisR[1], exhaustAxisR[2]],
            to: [0.5, 0.1, "0.37"],
            r: "EXHAUST_PIPE_R",
            bend: 0,
          },
        ],
      },
    },
    material: "cast_iron_dark",
    mate: { type: "absolute" },
  });

  // ================= L3 点火 =================
  add({
    id: "tiger.ignition.magneto",
    name_cn: "磁电机",
    name_en: "magneto",
    assembly: "ignition",
    build_layer: 1,
    build_order: 163,
    geometry: {
      type: "lathe",
      segments: 24,
      profile: [
        [0, 0],
        ["MAGNETO_R", 0],
        ["MAGNETO_R", "MAGNETO_LEN-0.01"],
        [0.03, "MAGNETO_LEN"],
        [0, "MAGNETO_LEN"],
      ],
    },
    material: "bakelite",
    mate: { type: "absolute", rotation: AXIS_X_NEG },
    instances: 2,
    indexed: true,
    instance_layout: ENGINE_LAYOUTS.magneto,
    source: "两台磁电机（每 6 缸一台）挂在正时齿轮盖前面；高压线 M-C",
  });

  // ================= L1 第一批：紧固件与点火（实例 +112）=================
  // 只补真实存在的小件（不切大件凑数）。螺栓几何统一走 boltGeometry()：
  // 头在座面外、杆埋进基体 ≤6mm —— 螺纹咬合是构造性接触，登记进白名单，
  // 杆不能伸穿基体碰到下一层零件（薄壁件用短杆就是为这个）。
  add({
    id: "tiger.crankcase.sump_bolt",
    name_cn: "油底壳螺栓",
    name_en: "oil sump bolt",
    assembly: "crankcase",
    build_layer: 1,
    build_order: 134,
    geometry: boltGeometry(),
    material: "steel",
    mate: { type: "absolute" },
    instances: 20,
    indexed: true,
    instance_layout: ENGINE_LAYOUTS.sumpBolt,
    source: "**[新增]** 油底壳法兰（0.5×0.3m）长边各 9 颗、短边中各 1 颗",
  });
  add({
    id: "tiger.crankcase.inspection_cover_bolt",
    name_cn: "检查盖螺栓",
    name_en: "inspection cover bolt",
    assembly: "crankcase",
    build_layer: 1,
    build_order: 135,
    geometry: boltGeometry(),
    material: "steel",
    mate: { type: "absolute" },
    instances: 16,
    indexed: true,
    instance_layout: ENGINE_LAYOUTS.inspectionBolt,
    source: "**[新增]** 每只检查盖 4 颗（0.11×0.09 板四角），两侧各两只盖",
  });
  add({
    id: "tiger.crankcase.timing_cover_bolt",
    name_cn: "正时齿轮盖螺栓",
    name_en: "timing cover bolt",
    assembly: "crankcase",
    build_layer: 1,
    build_order: 136,
    geometry: boltGeometry(),
    material: "steel",
    mate: { type: "absolute" },
    instances: 8,
    indexed: true,
    instance_layout: ENGINE_LAYOUTS.timingBolt,
    source: "**[新增]** ⌀260 圆角盖板螺孔圈 8 颗（镗孔 ⌀100 外侧）",
  });
  add({
    id: "tiger.crankcase.mount_bolt",
    name_cn: "机脚螺栓",
    name_en: "engine mount bolt",
    assembly: "crankcase",
    build_layer: 1,
    build_order: 137,
    geometry: boltGeometry(),
    material: "steel",
    mate: { type: "absolute" },
    instances: 8,
    indexed: true,
    instance_layout: ENGINE_LAYOUTS.mountBolt,
    source: "**[新增]** 每只机脚底面 2 颗（前后各一），共 4 只机脚",
  });
  add({
    id: "tiger.cylinder.cam_cover_screw",
    name_cn: "凸轮轴罩螺钉",
    name_en: "camshaft cover screw",
    assembly: "cylinder",
    build_layer: 1,
    build_order: 138,
    geometry: boltGeometry(),
    material: "steel",
    mate: { type: "absolute" },
    instances: 48,
    indexed: true,
    instance_layout: ENGINE_LAYOUTS.coverScrew,
    source: "**[新增]** 每只缸盖罩顶面 4 颗（沿罩长两对），12 只罩；B1 由 2 颗/罩加密到 4 颗/罩",
  });
  // ---- L1 第二批：紧固件密度（缸盖法兰螺栓 / 端板螺栓）+ 传感器（实例 +98）----
  add({
    id: "tiger.cylinder.port_flange_bolt",
    name_cn: "缸盖进排气法兰螺栓",
    name_en: "port flange bolt",
    assembly: "cylinder",
    build_layer: 1,
    build_order: 168,
    geometry: boltGeometry(),
    material: "steel",
    mate: { type: "absolute" },
    instances: 48,
    indexed: true,
    instance_layout: ENGINE_LAYOUTS.portFlangeBolt,
    source:
      "**[新增]** 每缸两只法兰（进气高口 PORT_IN_Y、排气低口 PORT_EX_Y）各 2 颗，共 4 颗/缸（12 缸）" +
      "；法兰宽由 HEAD_FLANGE_W 给出，螺栓到端口中心 33mm（让开 ⌀38 短管）",
  });
  add({
    id: "tiger.crankcase.endplate_bolt",
    name_cn: "端板螺栓",
    name_en: "endplate bolt",
    assembly: "crankcase",
    build_layer: 1,
    build_order: 169,
    geometry: boltGeometry(),
    material: "steel",
    mate: { type: "absolute" },
    instances: 24,
    indexed: true,
    instance_layout: ENGINE_LAYOUTS.endplateBolt,
    source: "**[新增]** 前后端板各 12 颗，绕曲轴轴线 ⌀290 一圈（正时盖 ⌀260 之外、机体截面之内）",
  });
  add({
    id: "tiger.crankcase.oil_pressure_sender",
    name_cn: "机油压力传感器",
    name_en: "oil pressure sender",
    assembly: "crankcase",
    build_layer: 1,
    build_order: 170,
    geometry: {
      type: "lathe",
      segments: 18,
      profile: [
        [0, 0],
        ["SENDER_STEM_R", 0],
        ["SENDER_STEM_R", "SENDER_STEM_L"],
        ["SENDER_BODY_R", "SENDER_STEM_L"],
        ["SENDER_BODY_R", "SENDER_STEM_L+SENDER_BODY_H"],
        [0, "SENDER_STEM_L+SENDER_BODY_H"],
      ],
    },
    material: "steel_worn",
    // 杆轴指向壁内：+Y → −Z（Rx −90°），外壳坐在机体右侧壁外
    mate: { type: "absolute", position: ["SENDER_X1", "SENDER_Y", "CASE_HALF_W"], rotation: [-90, 0, 0] },
    source: "**[新增]** 主油道压力传感器：外壳 φ32×42mm 坐在机体侧壁，螺纹杆埋进 19mm 壁厚 6mm",
  });
  add({
    id: "tiger.cooling.coolant_temp_sender",
    name_cn: "水温传感器",
    name_en: "coolant temperature sender",
    assembly: "cooling",
    build_layer: 1,
    build_order: 171,
    geometry: {
      type: "lathe",
      segments: 18,
      profile: [
        [0, 0],
        ["SENDER_STEM_R", 0],
        ["SENDER_STEM_R", "SENDER_STEM_L"],
        ["SENDER_BODY_R", "SENDER_STEM_L"],
        ["SENDER_BODY_R", "SENDER_STEM_L+SENDER_BODY_H*0.8"],
        [0, "SENDER_STEM_L+SENDER_BODY_H*0.8"],
      ],
    },
    material: "steel_worn",
    mate: { type: "absolute", position: ["SENDER_X2", "SENDER_Y", "CASE_HALF_W"], rotation: [-90, 0, 0] },
    source: "**[新增]** 冷却水套出水温度传感器（与机油压力传感器同壁前后各一，避开 x=-0.212 的加强肋）",
  });
  add({
    id: "tiger.ignition.plug_boot",
    name_cn: "火花塞高压护套",
    name_en: "spark plug boot",
    assembly: "ignition",
    build_layer: 1,
    build_order: 139,
    geometry: {
      type: "lathe",
      segments: 16,
      // 闭合剖面（壁厚 3.5mm 的罩壳）：底口内孔 ⌀21 < 塞子 ⌀23 段，斜唇切进塞子成一圈交线；
      // 内孔壁 ⌀27 让开塞子 ⌀25 段 1mm。
      // 剖面必须闭合：开口薄壳在做「点在实体内」射线奇偶判定时会整片误判成内部，
      // 深度探针于是报出 14.67mm 假深度（plug-boot-on-plug 24 条全被这条假深度顶出豁免）。
      profile: [
        ["BOOT_IN_R", "BOOT_Y0"], // 底口内孔下缘（过盈面）
        ["BOOT_R", "BOOT_Y0"], // 底口环形端面
        ["BOOT_R", "BOOT_Y0+BOOT_LEN"], // 外壁
        ["BOOT_BORE", "BOOT_Y0+BOOT_LEN"], // 顶面环形
        ["BOOT_BORE", "BOOT_Y0+0.004"], // 内孔壁（让开 ⌀25 段）
        ["BOOT_IN_R", "BOOT_Y0"], // 斜唇回到起点（闭合）
      ],
    },
    material: "bakelite",
    mate: { type: "absolute" },
    instances: 24,
    indexed: true,
    instance_layout: ENGINE_LAYOUTS.sparkPlug,
    source: "**[新增]** 与 24 只火花塞一一对应；高压线束本身 M-C（同磁电机注记）",
  });

  add({
    id: "tiger.ignition.ht_conduit",
    name_cn: "高压线导管",
    name_en: "HT ignition conduit",
    assembly: "ignition",
    build_layer: 1,
    build_order: 172,
    geometry: {
      type: "tube",
      rOuter: "CONDUIT_R_OUT",
      rInner: "CONDUIT_R_IN",
      h: "CONDUIT_LEN",
    },
    material: "bakelite",
    mate: { type: "absolute" },
    instances: 2,
    indexed: true,
    instance_layout: ENGINE_LAYOUTS.htConduit,
    source:
      "**[新增]** 每列 1 根（⌀22×955）收口在护套顶上方 90mm；净隙：缸盖罩顶外角 28.0mm、进气歧管 42.9mm",
  });
  add({
    id: "tiger.ignition.ht_lead",
    name_cn: "火花塞高压线",
    name_en: "HT ignition lead",
    assembly: "ignition",
    build_layer: 1,
    build_order: 173,
    geometry: {
      type: "tube",
      rOuter: "HT_LEAD_R_OUT",
      rInner: "HT_LEAD_R_IN",
      h: "HT_LEAD_LEN",
    },
    material: "rubber_belt",
    mate: { type: "absolute" },
    instances: 24,
    indexed: true,
    instance_layout: ENGINE_LAYOUTS.htLead,
    source:
      "**[新增]** HL230 双点火 24 根（与 24 只火花塞/护套一一对应，任务书「线束 ×12」按每列一支点算）：" +
      "护套顶面上 1.2mm 起、导管柱面下 0.8mm 止，两端都是净隙",
  });
  add({
    id: "tiger.ignition.magneto_bus",
    name_cn: "磁电机高压干线",
    name_en: "magneto HT bus",
    assembly: "ignition",
    build_layer: 1,
    build_order: 174,
    geometry: {
      type: "tube",
      rOuter: "MAGNETO_BUS_R_OUT",
      rInner: "MAGNETO_BUS_R_IN",
      h: "MAGNETO_BUS_LEN",
    },
    material: "rubber_belt",
    mate: { type: "absolute" },
    instances: 2,
    indexed: true,
    instance_layout: ENGINE_LAYOUTS.magnetoBus,
    source:
      "**[新增]** 每台磁电机 1 根（⌀16）：贴前端盖正前 9mm 沿±Z横接到导管，端面净隙 1.0mm；导管布满 955mm 长，干线只做前段",
  });

  // ================= L3 附件 =================
  add({
    id: "tiger.accessory.fuel_pump",
    name_cn: "输油泵",
    name_en: "fuel pump",
    assembly: "accessory",
    build_layer: 1,
    build_order: 164,
    geometry: {
      type: "lathe",
      segments: 22,
      profile: [
        [0, 0],
        ["FUELPUMP_R", 0],
        ["FUELPUMP_R", "FUELPUMP_LEN-0.008"],
        [0.018, "FUELPUMP_LEN"],
        [0, "FUELPUMP_LEN"],
      ],
    },
    material: "cast_iron_dark",
    mate: { type: "absolute" },
    instances: 2,
    indexed: true,
    instance_layout: ENGINE_LAYOUTS.fuelPump,
    source: "机械式膜片泵，装在曲轴箱两侧（真实为 2 台，由凸轮轴驱动）",
  });
  add({
    id: "tiger.accessory.starter",
    name_cn: "起动机",
    name_en: "starter motor",
    assembly: "accessory",
    build_layer: 1,
    build_order: 165,
    geometry: {
      type: "lathe",
      segments: 24,
      profile: [
        [0, 0],
        [0.028, 0],
        [0.028, 0.03],
        [0.05, 0.045],
        ["STARTER_R", 0.06],
        ["STARTER_R", "STARTER_LEN-0.015"],
        [0.055, "STARTER_LEN"],
        [0, "STARTER_LEN"],
      ],
    },
    material: "cast_iron_dark",
    mate: {
      type: "absolute",
      position: ["STARTER_X", "STARTER_Y", "STARTER_Z"],
      rotation: AXIS_X,
    },
    source: "简化：飞轮壳不做起动机让位口，起动机齿轮与齿圈不啮合（M-C）",
  });
  add({
    id: "tiger.accessory.water_pipe_l",
    name_cn: "冷却水管（左）",
    name_en: "coolant pipe (left)",
    assembly: "accessory",
    build_layer: 1,
    build_order: 166,
    geometry: {
      // 成形钢管（光滑回转体），不再用焊道几何：焊道的蛇形摆动（±4mm）与每环半径
      // 0.82–1.18 波动让管夹孔面与管面忽接忽离，交线形态/深度都不可复现。
      // 管端朝前悬空（软管接散热器用），管身全程在箱体侧壁外平行走，尾端环面离壁 0.8mm
      // （原端点落在甲板外缘板内部：壳体穿透 23.5mm）
      type: "tube",
      rOuter: 0.02,
      rInner: 0.015,
      segments: 16,
      // 管长 = √(0.079² + 0.0145²)：端点 (0.5, …, -(CASE_HALF_W+0.035))
      // → (0.421, …, -(CASE_HALF_W+0.0205))
      h: "sqrt(0.079^2+0.0145^2)",
    },
    material: "steel",
    mate: {
      type: "absolute",
      // 管轴中点；局部 +Y 经 Rz(90°)（+Y→−X）再 Ry(10.4°)（−X 朝 +Z 倾 10.4°）
      // 后正好指向「起点 → 终点」方向
      position: ["(0.5+0.421)/2", "ACC_Y+0.04", "-(CASE_HALF_W+0.02775)"],
      rotation: ["0", "10.4", "90"],
    },
  });
  add({
    id: "tiger.accessory.water_pipe_r",
    name_cn: "冷却水管（右）",
    name_en: "coolant pipe (right)",
    assembly: "accessory",
    build_layer: 1,
    build_order: 167,
    geometry: {
      // 与左管同侧并行（间距 60mm，两支 r=0.02 不打架）；同样不穿壁
      // 抬高 20mm：原位（ACC_Y-0.04，管底 y=0）被曲轴箱加强肋顶（y=10mm）穿 8.27mm，
      // 抬后管底 y=20mm > 肋顶；左管不动（再抬高会顶到上甲板/端板：实测 7.15mm）
      // 成形钢管（同左管）：管夹孔面与光滑管面互穿出绕轴闭合交线（压装配合面）。
      // 管端不越过 x=0.5：再前伸 40mm 会插进水泵体（实测 8.78mm）；
      // 管端落在夹孔里、与夹体重叠 21mm 就够形成闭合配合面。
      type: "tube",
      rOuter: 0.02,
      rInner: 0.015,
      segments: 16,
      h: "sqrt(0.079^2+0.0145^2)",
    },
    material: "steel",
    mate: {
      type: "absolute",
      // 同左管：中点 + Rz(90°) 后 Ry(10.4°) 对齐管轴
      position: ["(0.5+0.421)/2", "ACC_Y-0.02", "-(CASE_HALF_W+0.02775)"],
      rotation: ["0", "10.4", "90"],
    },
  });

  return parts;
}
