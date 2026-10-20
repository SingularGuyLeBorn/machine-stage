import {
  makeTestRegistry,
  testKitLayouts,
  type AssembledModel,
  type InstanceLayout,
  type ModelRegistry,
} from "@/three/parts";
import type { GeometryBuilder } from "@/three/parts/assembler/geometry";
import type { DamageState } from "@/three/parts";
import { makeTigerLayouts, makeTigerRegistry, tigerBuilders } from "@/three/parts/models/tiger/registry";
import {
  animateTiger,
  TIGER_MOTION_PARTS,
  tigerDetachKeys,
  tigerDetachOffset,
  tigerInstanceLabel,
} from "@/three/parts/models/tiger/motion";
import { TIGER_LIDS, type TigerLidSpec } from "@/three/parts/models/tiger/lids";
import type { CameraMode } from "./three/viewpoints";

// ============================================================================
// catalog —— 展示台可加载的模型清单
//
// 纪律：每个模型只登记「注册表 + 实例布局 + 动画函数 + 动作/状态声明」，
// 坐标与尺寸全部来自注册表 constants，禁止在 UI 层写死模型尺寸。
// planned 卡片是路线图占位（M-B…M-F），没有注册表时不可选中。
// ============================================================================

export type ViewKey = "explode" | "xray" | "labels" | "grid" | "shadow";

export type StageAction =
  | { id: string; group: string; label: string; kind: "machine-state"; state: string }
  | { id: string; group: string; label: string; kind: "damage"; level: DamageState }
  | { id: string; group: string; label: string; kind: "view-toggle"; view: ViewKey }
  | { id: string; group: string; label: string; kind: "param"; param: string; value: number | null }
  | { id: string; group: string; label: string; kind: "scan"; scanKind: "static" | "sweep" }
  | { id: string; group: string; label: string; kind: "reset-view" }
  | { id: string; group: string; label: string; kind: "reroll-damage" }
  | { id: string; group: string; label: string; kind: "camera"; mode: CameraMode }
  | { id: string; group: string; label: string; kind: "planned"; note: string };

export interface StageStateDef {
  id: string;
  label: string;
  hint?: string;
}

export interface ParamRange {
  min: number;
  max: number;
  step: number;
}

export interface StageModel {
  id: string;
  title: string;
  subtitle: string;
  /** 里程碑标记（左栏卡片角标）。 */
  milestone: string;
  status: "ready" | "planned";
  registry?: ModelRegistry;
  layouts?: Record<string, InstanceLayout>;
  /** 模型自定义几何 kit 构造器（如发动机 borePlate/siameseBlock 等）。 */
  builders?: Record<string, GeometryBuilder>;
  /** 动画：只驱动节点，每帧调用前框架已 resetNodes。t 为秒；state 为当前机器状态。 */
  animate?: (assembled: AssembledModel, seconds: number, state?: string) => void;
  /** 由 animate 直接改写实例矩阵的零件（pose 层的爆炸/拆解据此取本帧位姿）。 */
  motionParts?: string[];
  /** 单实例拆解要一起移动的实例键（如负重轮 + 它的轮毂螺栓）。 */
  detachKeys?: (partId: string, index: number, count: number) => string[];
  /** 单实例拆解位移（模型空间，米）；返回 null 表示该实例不可拆。 */
  detachOffset?: (partId: string, index: number, count: number) => [number, number, number] | null;
  /** 实例检查器的人类可读标签（如「第 3 轴 · 第 2 排 · 右」）。 */
  instanceLabel?: (partId: string, index: number, count: number) => string | null;
  /** 可交互盖板（点击开合 / 悬停提示 / 视口一键开合）。 */
  lids?: readonly TigerLidSpec[];
  /** 支持的相机模式（缺省只有自由视角；有潜望镜的车才登记 driver/commander）。 */
  cameras?: CameraMode[];
  /** 主角数字（状态栏/参数面板展示，必须由求解器或常量算出）。 */
  readouts?: (assembled: AssembledModel) => Array<{ label: string; value: string }>;
  actions?: StageAction[];
  states?: StageStateDef[];
  paramRanges?: Record<string, ParamRange>;
  notes?: string[];
}

/** 自检台转子角速度（rad/s）：1.2 rad/s ≈ 11.5 r/min —— 目视可读的慢转。 */
export const TEST_ROTOR_OMEGA = 1.2;

const testKit = makeTestRegistry();

export const CATALOG: StageModel[] = [
  {
    id: "test",
    title: "框架自检台",
    subtitle: "3 零件 · 实例级穿模报告 · M-A 验收",
    milestone: "M-A",
    status: "ready",
    registry: testKit,
    layouts: testKitLayouts,
    states: [
      { id: "idle", label: "待机", hint: "零件静止，可拖构建滑杆" },
      { id: "running", label: "转子运转", hint: "驱动 TestRotor 节点，可做扫掠检测" },
      { id: "scanning", label: "穿模扫描", hint: "静态装配 / 动画扫掠检测进行中" },
    ],
    animate: (assembled, seconds) => {
      const rotor = assembled.getNode("TestRotor");
      if (rotor) rotor.rotation.y = seconds * TEST_ROTOR_OMEGA;
    },
    readouts: () => [
      { label: "转子转速", value: `${((TEST_ROTOR_OMEGA * 60) / (Math.PI * 2)).toFixed(1)} r/min` },
    ],
    actions: [
      { id: "rotor-run", group: "机构", label: "转子运转", kind: "machine-state", state: "running" },
      { id: "rotor-stop", group: "机构", label: "停机", kind: "machine-state", state: "idle" },
      { id: "explode", group: "展示", label: "爆炸视图", kind: "view-toggle", view: "explode" },
      { id: "xray", group: "展示", label: "透视", kind: "view-toggle", view: "xray" },
      { id: "reset-view", group: "展示", label: "重置视角", kind: "reset-view" },
      {
        id: "inject-overlap",
        group: "自检",
        label: "注入 1mm 重叠",
        kind: "param",
        param: "GAP",
        value: 0.001,
      },
      { id: "fix-overlap", group: "自检", label: "修复装配间隙", kind: "param", param: "GAP", value: -0.002 },
      { id: "scan-static", group: "自检", label: "静态重扫", kind: "scan", scanKind: "static" },
      { id: "scan-sweep", group: "自检", label: "动画扫掠", kind: "scan", scanKind: "sweep" },
    ],
    paramRanges: {
      BOX: { min: 0.3, max: 2, step: 0.01 },
      GAP: { min: -0.02, max: 0.02, step: 0.0005 },
    },
    notes: [
      "验收口径：拖构建滑杆能看清 L1→L2 的装配顺序；故意重叠 1mm 时浮层报告 test.frame.box[0] ↔ test.frame.box[1]。",
      "GAP > 0 表示两个基准盒实例名义间距不足（重叠 GAP 米）；GAP ≤ 0 为装配间隙。",
    ],
  },
  {
    id: "tiger",
    title: "虎式坦克 Tiger I",
    subtitle: "L1–L5 全层 · 主炮闩 / 中空炮管 / 车长塔枪座 · 表面质感",
    milestone: "M-C",
    status: "ready",
    registry: makeTigerRegistry(),
    layouts: makeTigerLayouts(),
    builders: tigerBuilders,
    animate: animateTiger,
    motionParts: TIGER_MOTION_PARTS,
    detachKeys: tigerDetachKeys,
    detachOffset: tigerDetachOffset,
    instanceLabel: tigerInstanceLabel,
    lids: TIGER_LIDS,
    cameras: ["orbit", "driver", "commander"],
    states: [
      { id: "idle", label: "停机", hint: "悬挂静止，可拖构建滑杆看装配" },
      {
        id: "running",
        label: "悬挂演示",
        hint: "车体在扭杆上轻微浮沉，48 只负重轮各自转动；点单轮可拆下检查",
      },
      {
        id: "driving",
        label: "行进演示",
        hint: "前进 1.5m → 倒退回位 → 原地右转 24° → 左转 48° → 回正；履带板/销/锁环滚动，轮系差速",
      },
      {
        id: "firing",
        label: "主炮击发",
        hint: "开闩 → 关闩 → 击针 → 后坐 450mm → 复进 → 开闩抛壳，6s 循环；看车体后坐与炮口焰",
      },
      {
        id: "mg_firing",
        label: "机枪连射",
        hint: "MG34 10 发连射：枪管短后坐、枪口上跳、供弹链步进、弹壳抛出/弹跳；3.2s 循环",
      },
      {
        id: "aiming",
        label: "炮塔瞄准",
        hint: "炮塔 ±36° 回转 + 炮管 ±3.4° 俯仰（8s 循环；瞄准时自动盖上驾驶员/无线电员舱盖）",
      },
      {
        id: "engine_start",
        label: "发动机启动",
        hint: "冷启动：预热 1.6s（曲轴不转）→ 起动机拖动 1.8s（171rpm + 轻微抖动）→ 点火（白烟 + 车体一扭）→ 暖机 → 650rpm 怠速；视口右下显示水温/转速",
      },
      {
        id: "refuel",
        label: "加油",
        hint: "左右燃油加注口盖绕外缘铰链掀起 72°，露出颈孔与下方加注管；再点一次合盖。平时也可直接点击盖板/底座单独开合",
      },
      {
        id: "burning",
        label: "发动机起火",
        hint: "发动机舱持续燃烧：quarks 火焰 + 烟柱 + 点光闪烁，车体轻微震颤",
      },
      {
        id: "detonation",
        label: "弹药殉爆",
        hint: "连锁殉爆：炮塔中弹 → 弹药架升温冒烟 → 泄压阀喷火 → 临界 → 炮塔掀飞 0.85m + 火球/冲击波/破片/烟柱 → 火势蔓延到发动机舱",
      },
      {
        id: "hit_light",
        label: "轻击（小口径）",
        hint: "穿甲弹命中：初焰闪 + 窄束火花 + 穿孔焦痕；车体高频轻颤",
      },
      {
        id: "hit_heavy",
        label: "重击（大口径）",
        hint: "榴弹命中：初焰闪 → 火球 → 冲击波 → 火花/破片 → 烟 → 焦痕；车体重挫 + 悬挂回弹",
      },
      {
        id: "hit_oblique",
        label: "斜角命中",
        hint: "穿甲弹擦角命中：椭圆撕裂口 + 不规则翻卷边缘 + 上游跳弹犁沟/掉漆",
      },
      {
        id: "hit_ricochet",
        label: "跳弹（未穿）",
        hint: "跳弹未穿透：长条犁沟 + 碟形凹陷 + 崩落掉漆，没有孔",
      },
      { id: "scanning", label: "穿模扫描", hint: "静态装配 / 动画扫掠检测进行中" },
    ],
    actions: [
      { id: "suspension-run", group: "机构", label: "悬挂演示", kind: "machine-state", state: "running" },
      { id: "drive-run", group: "机构", label: "行进演示", kind: "machine-state", state: "driving" },
      { id: "engine-start", group: "机构", label: "发动机启动", kind: "machine-state", state: "engine_start" },
      { id: "refuel", group: "勤务", label: "加油（开盖）", kind: "machine-state", state: "refuel" },
      { id: "cannon-fire", group: "火力", label: "主炮击发", kind: "machine-state", state: "firing" },
      { id: "mg-fire", group: "火力", label: "机枪连射", kind: "machine-state", state: "mg_firing" },
      { id: "aim", group: "火炮", label: "炮塔瞄准", kind: "machine-state", state: "aiming" },
      { id: "hit-light", group: "受击", label: "轻击（小口径）", kind: "machine-state", state: "hit_light" },
      { id: "hit-heavy", group: "受击", label: "重击（大口径）", kind: "machine-state", state: "hit_heavy" },
      { id: "hit-oblique", group: "受击", label: "斜角命中", kind: "machine-state", state: "hit_oblique" },
      { id: "hit-ricochet", group: "受击", label: "跳弹（未穿）", kind: "machine-state", state: "hit_ricochet" },
      { id: "damage-intact", group: "战损", label: "完好", kind: "damage", level: "intact" },
      { id: "damage-dented", group: "战损", label: "破损（凹陷/裂痕）", kind: "damage", level: "damaged" },
      { id: "damage-broken", group: "战损", label: "破碎（断面露内构）", kind: "damage", level: "broken" },
      { id: "damage-reroll", group: "战损", label: "随机破口", kind: "reroll-damage" },
      { id: "burning", group: "战损", label: "发动机起火", kind: "machine-state", state: "burning" },
      { id: "detonation", group: "战损", label: "弹药殉爆", kind: "machine-state", state: "detonation" },
      { id: "suspension-stop", group: "机构", label: "停机", kind: "machine-state", state: "idle" },
      { id: "explode", group: "展示", label: "爆炸视图", kind: "view-toggle", view: "explode" },
      { id: "xray", group: "展示", label: "透视", kind: "view-toggle", view: "xray" },
      { id: "labels", group: "展示", label: "零件标注", kind: "view-toggle", view: "labels" },
      { id: "cam-driver", group: "视角", label: "驾驶员潜望镜", kind: "camera", mode: "driver" },
      { id: "cam-commander", group: "视角", label: "车长指挥塔", kind: "camera", mode: "commander" },
      { id: "cam-orbit", group: "视角", label: "自由视角", kind: "camera", mode: "orbit" },
      { id: "reset-view", group: "展示", label: "重置视角", kind: "reset-view" },
      { id: "scan-static", group: "自检", label: "静态重扫", kind: "scan", scanKind: "static" },
      { id: "scan-sweep", group: "自检", label: "动画扫掠", kind: "scan", scanKind: "sweep" },
    ],
    notes: [
      "L1–L5 已装配到 242 件 / 2060 实例；主炮闩 / 中空炮管 / 双油箱 / 战损三态 / 多相爆炸已落地。",
      "仪表盘是活的：5 只表各有一条真指针（gauge_needle，骑在 Gauge_1..5 节点上），车速/转速/油温/水温/油量全部按车辆状态驱动——发动机启动看转速爬升与水温升温，行进看车速，加油看油量上升。",
      "加油路径：甲板开盖（静态开盖展示）→ ⌀140 甲板孔 → 加注管 → 软管 → 油箱通孔加油颈；开「透视」可看到整条路径。",
      "主炮击发是节点驱动的机械演示（后坐 450mm + 开闩 + 击针 + 炮口焰）；机枪连射含枪管短后坐/枪口上跳/供弹链/弹壳。",
      "爆炸/燃烧用 vendored three.quarks 粒子（初焰闪→火球→冲击波→火花/破片→烟→焦痕）；轻击=穿甲穿孔，重击=榴弹全相，殉爆再叠加炮塔掀飞与火势蔓延。",
      "破碎形态由 damageSeed 随机：单穿孔 / 大口径爆裂 / 双孔，位置在安全区内抖动；战损组「随机破口」换一组并保持相机。",
      "舱盖可交互：悬停盖板出现提示，单击开/合；前舱盖默认开启，视口右上「舱盖」可一键全开/全合。装填手舱口与车长塔顶盖在炮塔顶甲板上开了真孔，开盖能看进战斗室；加油口底座也可点击开盖。",
    ],
  },
  {
    id: "m2hb",
    title: "M2HB 重机枪",
    subtitle: "M-D：管退式自动机",
    milestone: "M-D",
    status: "planned",
  },
  {
    id: "ak47",
    title: "AK-47",
    subtitle: "M-E：导气式自动机",
    milestone: "M-E",
    status: "planned",
  },
  {
    id: "j20",
    title: "歼-20",
    subtitle: "M-F：主承力框 + 弹舱滑轨",
    milestone: "M-F",
    status: "planned",
  },
];

export function findModel(modelId: string): StageModel {
  const found = CATALOG.find((model) => model.id === modelId);
  if (!found) throw new Error(`catalog：未知模型 "${modelId}"`);
  return found;
}

/** 已交付（可加载）的模型。 */
export const READY_MODELS = CATALOG.filter((model) => model.status === "ready");
