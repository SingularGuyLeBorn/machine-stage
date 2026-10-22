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
import { makeMbtLayouts, makeMbtRegistry } from "@/three/parts/models/mbt/registry";
import { mbtKitBuilders } from "@/three/parts/models/mbt/kits";
import { animateMbt, MBT_MOTION_PARTS } from "@/three/parts/models/mbt/motion";
import { edriveBuilders, makeEdriveLayouts, makeEdriveRegistry } from "@/three/parts/models/edrive/registry";
import { animateEdrive, EDRIVE_MOTION_PARTS, edriveReadouts } from "@/three/parts/models/edrive/motion";
import type { CameraMode } from "./three/viewpoints";
import {
  makeT800,
  makeT800Layouts,
  makeT800Registry,
  t800AllBuilders,
} from "@/three/parts/models/t800/registry";
import { animateT800, t800Readouts } from "@/three/parts/models/t800/motion";
import { AK47_BUILDERS, makeAk47Layouts, makeAk47Registry } from "@/three/parts/models/ak47/registry";
import { AK47_MOTION_PARTS, animateAk47, getAk47Mode } from "@/three/parts/models/ak47/motion";
import { M249_BUILDERS, makeM249Layouts, makeM249Registry } from "@/three/parts/models/m249/registry";
import { M249_MOTION_PARTS, animateM249, getM249Mode } from "@/three/parts/models/m249/motion";
import { M2HB_BUILDERS, makeM2hbLayouts, makeM2hbRegistry } from "@/three/parts/models/m2hb/registry";
import { M2HB_MOTION_PARTS, animateM2hb, getM2hbMode } from "@/three/parts/models/m2hb/motion";
import { M134_BUILDERS, makeM134Layouts, makeM134Registry } from "@/three/parts/models/m134/registry";
import { M134_MOTION_PARTS, animateM134, getM134Mode } from "@/three/parts/models/m134/motion";

// ============================================================================
// catalog —— 展示台可加载的模型清单
//
// 纪律：每个模型只登记「注册表 + 实例布局 + 动画函数 + 动作/状态声明」，
// 坐标与尺寸全部来自注册表 constants，禁止在 UI 层写死模型尺寸。
// planned 卡片是路线图占位（M-B…M-F），没有注册表时不可选中。
// ============================================================================

export type ViewKey = "explode" | "xray" | "labels" | "grid" | "shadow" | "rain" | "thermal";

export type StageAction =
  | { id: string; group: string; label: string; kind: "machine-state"; state: string }
  | { id: string; group: string; label: string; kind: "damage"; level: DamageState }
  | { id: string; group: string; label: string; kind: "view-toggle"; view: ViewKey }
  | { id: string; group: string; label: string; kind: "param"; param: string; value: number | null }
  | { id: string; group: string; label: string; kind: "scan"; scanKind: "static" | "sweep" }
  | { id: string; group: string; label: string; kind: "variant"; variant: string }
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

/** 同一模型的变体（原型 / 机械拆解版……）：在 UI 里切换，骨架与动画共用。 */
export interface StageVariant {
  id: string;
  label: string;
  registry: ModelRegistry;
  layouts?: Record<string, InstanceLayout>;
  /** 变体专属读数（缺省用模型的 readouts）。 */
  readouts?: (assembled: AssembledModel) => Array<{ label: string; value: string }>;
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
  /** 变体清单（有它时，UI 用「变体」动作切换，registry 取第一个变体）。 */
  variants?: StageVariant[];
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

/** 机械拆解版注册表（每个光滑块 → 护板 + 内部机械器件）。 */
const makeT800MechRegistry = () => makeT800({ decompose: true }).registry;

/** 当前生效的注册表（有变体时取选中变体的）。 */
export function activeRegistryOf(
  modelId: string,
  variantId?: string,
): ModelRegistry | undefined {
  const model = findModel(modelId);
  if (!model) return undefined;
  if (!model.variants?.length) return model.registry;
  return (
    model.variants.find((item) => item.id === variantId)?.registry ?? model.variants[0].registry
  );
}

/** 当前生效的实例布局（有变体时取选中变体的）。 */
export function activeLayoutsOf(
  modelId: string,
  variantId?: string,
): Record<string, InstanceLayout> | undefined {
  const model = findModel(modelId);
  if (!model) return undefined;
  if (!model.variants?.length) return model.layouts;
  const variant = model.variants.find((item) => item.id === variantId) ?? model.variants[0];
  return variant.layouts ?? model.layouts;
}

export const CATALOG: StageModel[] = [
  {
    id: "t800",
    title: "T-800 内骨骼",
    subtitle: "M-G：真实网格按蒙皮切分（原型 245 件 / 机械拆解版 3067 件）",
    milestone: "M-G",
    status: "ready",
    // 同一副骨架的两个版本：GLB 原型 vs 机械拆解版（UI 里可切）
    variants: [
      {
        id: "glb",
        label: "GLB 原型",
        registry: makeT800Registry(),
        layouts: makeT800Layouts(),
      },
      {
        id: "mech",
        label: "机械拆解版",
        registry: makeT800MechRegistry(),
        layouts: makeT800Layouts({ decompose: true }),
      },
    ],
    registry: makeT800Registry(),
    layouts: makeT800Layouts(),
    builders: t800AllBuilders,
    animate: (assembled, seconds, state) => animateT800(assembled, seconds, { idle: state === "idle" }),
    readouts: t800Readouts,
    states: [
      { id: "idle", label: "待机", hint: "整机静止，可拖构建滑杆逐层装配" },
      {
        id: "running",
        label: "步态演示",
        hint: "髋/膝/踝/肩/肘/腕欠阻尼步态，17 根液压缸随关节角真实伸缩；点零件看实例检查器",
      },
      { id: "scanning", label: "穿模扫描", hint: "静态装配 / 屈伸扫掠检测进行中" },
    ],
    actions: [
      { id: "t800-variant-glb", group: "版本", label: "GLB 原型", kind: "variant", variant: "glb" },
      { id: "t800-variant-mech", group: "版本", label: "机械拆解版", kind: "variant", variant: "mech" },
      { id: "t800-flex", group: "机构", label: "步态演示", kind: "machine-state", state: "running" },
      { id: "t800-stop", group: "机构", label: "停机", kind: "machine-state", state: "idle" },
      { id: "explode", group: "展示", label: "爆炸视图", kind: "view-toggle", view: "explode" },
      { id: "xray", group: "展示", label: "透视", kind: "view-toggle", view: "xray" },
      { id: "labels", group: "展示", label: "零件标注", kind: "view-toggle", view: "labels" },
      { id: "reset-view", group: "展示", label: "重置视角", kind: "reset-view" },
      { id: "scan-static", group: "自检", label: "静态重扫", kind: "scan", scanKind: "static" },
      { id: "scan-sweep", group: "自检", label: "扫掠检测", kind: "scan", scanKind: "sweep" },
    ],
    notes: [
      "两个版本可切：「GLB 原型」（每个蒙皮部位一块光滑网格，外形最还原，245 件）与「机械拆解版」（每块光滑网格换成护板 + 内部机械器件，3067 件）。",
      "一个部位内部就有十几个件：承力骨架 / 纵梁 / 横撑 / 轴承(外圈+内圈+密封) / 螺栓圈 / 液压软管 / 管接头 / 油嘴 / 卡环 / 衬套。",
      "护板按「轴向段 × 周向扇区」把原表面切成独立零件，拼起来外形与源网格一致。",
      "两版同骨架同运动学，可直接对比：外形一致，内部由光滑整块变成机械器件组合。",
      "验收脚本：npx tsx scripts/diag-t800.ts --write（静态 + 16 帧扫掠穿模、悬空、液压行程核算）。",
    ],
  },
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
      { id: "rain", group: "展示", label: "雨天", kind: "view-toggle", view: "rain" },
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
        id: "loading",
        label: "装填演示",
        hint: "开闩 → 取弹 → 横置递弹 → 走闩口通道推入炮膛 → 关闩闭锁 → 击发 → 开闩抛壳：5.2s 完整装填链；弹全程横置、不穿闩室/炮管/顶甲",
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
      { id: "loading-run", group: "火力", label: "装填演示", kind: "machine-state", state: "loading" },
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
      { id: "rain", group: "展示", label: "雨天", kind: "view-toggle", view: "rain" },
      { id: "xray", group: "展示", label: "透视", kind: "view-toggle", view: "xray" },
      { id: "labels", group: "展示", label: "零件标注", kind: "view-toggle", view: "labels" },
      { id: "cam-driver", group: "视角", label: "驾驶席视角", kind: "camera", mode: "driver" },
      { id: "cam-commander", group: "视角", label: "车长指挥塔", kind: "camera", mode: "commander" },
      { id: "cam-orbit", group: "视角", label: "自由视角", kind: "camera", mode: "orbit" },
      { id: "reset-view", group: "展示", label: "重置视角", kind: "reset-view" },
      { id: "scan-static", group: "自检", label: "静态重扫", kind: "scan", scanKind: "static" },
      { id: "scan-sweep", group: "自检", label: "动画扫掠", kind: "scan", scanKind: "sweep" },
    ],
    notes: [
      "L1–L5 已装配到 293 件 / 2248 实例；主炮闩 / 中空炮管 / 双油箱 / 战损三态 / 多相爆炸已落地。",
      "仪表盘是活的：5 只表各有一条真指针（gauge_needle，骑在 Gauge_1..5 节点上），车速/转速/油温/水温/油量全部按车辆状态驱动——发动机启动看转速爬升与水温升温，行进看车速，加油看油量上升。",
      "加油路径：甲板开盖（静态开盖展示）→ ⌀140 甲板孔 → 加注管 → 软管 → 油箱通孔加油颈；开「透视」可看到整条路径。",
      "主炮击发是节点驱动的机械演示（后坐 450mm + 开闩 + 击针 + 炮口焰）；机枪连射含枪管短后坐/枪口上跳/供弹链/弹壳。",
      "装填演示（火力组）是一条 5.2s 的完整链：待发弹架取弹 → 横转 90° 递到炮闩 → 推入炮膛 → 关闩闭锁 → 击发（后坐/炮口焰）→ 开闩抛壳，空筒翻滚落到吊篮地板。演示弹是 fx 件，构建时隐藏、不参与穿模/支撑。",
      "爆炸/燃烧用 vendored three.quarks 粒子（初焰闪→火球→冲击波→火花/破片→烟→焦痕）；轻击=穿甲穿孔，重击=榴弹全相，殉爆再叠加炮塔掀飞与火势蔓延。",
      "破碎形态由 damageSeed 随机：单穿孔 / 大口径爆裂 / 双孔，位置在安全区内抖动；战损组「随机破口」换一组并保持相机。",
      "舱盖可交互：悬停盖板出现提示，单击开/合；前舱盖默认开启，视口右上「舱盖」可一键全开/全合。装填手舱口与车长塔顶盖在炮塔顶甲板上开了真孔，开盖能看进战斗室；加油口底座也可点击开盖。",
      "内饰 79 件，按参考图补成真坦克那样的「机械丛林」：驾驶室（方向盘 / 5 只活表 / 3 只带真防滑孔的踏板 / 变速与转向杆 / 保险丝盒·继电器盒·断路器三排 / 灭火器 / 座椅安全带 / 航向机枪与 Fu5 电台），战斗室与吊篮（TURZF 3 式瞄具三段 / 车长塔周向 7 具潜望镜 / 270° 吊篮护栏 / 待发弹架 4 只弹箱 / 备用弹鼓 / 吊篮支柱 4 根 / 同轴 MG34 机匣 / 急救箱 / 双灭火器 / 扶手 / 铭牌警示牌），侧壁与后隔板沿壁走 5 条多股线束干（TubeGeometry + 波纹护套 + 4 只卡箍）与机油压力管。开「透视」或从舱盖真孔看进去即见全貌。",
    ],
  },
  {
    id: "mbt90",
    title: "MBT-90 主战坦克",
    subtitle: "V12 双涡轮 / 液气悬挂 / 转盘自动装弹机 / 复合装甲 + ERA / 120mm 滑膛炮 · 自内向外零件级",
    milestone: "M-D",
    status: "ready",
    registry: makeMbtRegistry(),
    layouts: makeMbtLayouts(),
    builders: mbtKitBuilders,
    animate: animateMbt,
    motionParts: MBT_MOTION_PARTS,
    states: [
      { id: "idle", label: "停机", hint: "全车静止；可拖构建滑杆自内向外看 V12 动力 → 悬挂 → 战斗室 → 复合装甲" },
      { id: "engine_start", label: "发动机启动", hint: "起动机拖动曲轴 → 逐缸点火 → 转速爬升到 620r/min 怠速" },
      { id: "running", label: "怠速运转", hint: "曲轴/12 活塞/12 连杆/48 气门/双凸轮轴/双涡轮/风扇全部在动" },
      { id: "drive", label: "行进演示", hint: "履带滚动 + 14 轮独立起伏 + 传动齿轮转动；车体前后来回" },
      { id: "suspension", label: "液气悬挂", hint: "14 站液压缸/活塞杆/蓄能器独立随地形伸缩" },
      { id: "aim", label: "炮塔瞄准", hint: "炮塔回转 + 火炮俯仰（带阻尼）" },
      { id: "loading", label: "自动装弹机", hint: "转盘选弹 → 提弹机抬升 → 推弹杆推入炮膛 → 炮闩关闭" },
      { id: "fire", label: "主炮击发", hint: "后坐 340mm → 炮口焰 → 抽烟装置排烟 → 开闩抛壳" },
      { id: "era_hit", label: "ERA 被击中", hint: "首上反应装甲单块爆炸，来袭弹被推开" },
      { id: "blowout", label: "殉爆泄压", hint: "尾舱弹药架中弹：泄压板掀开，火焰/压力向上泄出" },
      { id: "detonation", label: "泄压失败殉爆", hint: "泄压板未开：炮塔被掀飞，殉爆火球" },
      { id: "hunter_killer", label: "猎-歼", hint: "车长热像仪扫描发现 → 炮塔转向 → 炮长击发" },
      { id: "scanning", label: "穿模扫描", hint: "静态装配 / 动画扫掠检测进行中" },
    ],
    actions: [
      { id: "mbt-engine-start", group: "动力", label: "发动机启动", kind: "machine-state", state: "engine_start" },
      { id: "mbt-run", group: "动力", label: "怠速运转", kind: "machine-state", state: "running" },
      { id: "mbt-drive", group: "机動", label: "行进演示", kind: "machine-state", state: "drive" },
      { id: "mbt-suspension", group: "机動", label: "液气悬挂", kind: "machine-state", state: "suspension" },
      { id: "mbt-aim", group: "火炮", label: "炮塔瞄准", kind: "machine-state", state: "aim" },
      { id: "mbt-loading", group: "火力", label: "自动装弹", kind: "machine-state", state: "loading" },
      { id: "mbt-fire", group: "火力", label: "主炮击发", kind: "machine-state", state: "fire" },
      { id: "mbt-hk", group: "火控", label: "猎-歼演示", kind: "machine-state", state: "hunter_killer" },
      { id: "mbt-era", group: "防护", label: "ERA 被击中", kind: "machine-state", state: "era_hit" },
      { id: "mbt-blowout", group: "防护", label: "殉爆泄压", kind: "machine-state", state: "blowout" },
      { id: "mbt-detonation", group: "防护", label: "泄压失败", kind: "machine-state", state: "detonation" },
      { id: "mbt-stop", group: "机构", label: "停机", kind: "machine-state", state: "idle" },
      { id: "mbt-explode", group: "展示", label: "爆炸视图", kind: "view-toggle", view: "explode" },
      { id: "mbt-xray", group: "展示", label: "透视", kind: "view-toggle", view: "xray" },
      { id: "mbt-thermal", group: "展示", label: "热像仪视角", kind: "view-toggle", view: "thermal" },
      { id: "mbt-labels", group: "展示", label: "零件标注", kind: "view-toggle", view: "labels" },
      { id: "mbt-reset", group: "展示", label: "重置视角", kind: "reset-view" },
      { id: "mbt-scan-static", group: "自检", label: "静态重扫", kind: "scan", scanKind: "static" },
      { id: "mbt-scan-sweep", group: "自检", label: "动画扫掠", kind: "scan", scanKind: "sweep" },
    ],
    notes: [
      "1266 个零件定义 / 3800+ 实例：L1 V12 双涡轮柴油机（48 气门、12 活塞连杆逐件）→ L1 传动 → L2 履带与 14 站液气悬挂 → L3 三人乘员组/炮塔吊篮/转盘自动装弹机/40 发弹药 → L4 复合装甲车体与楔形炮塔/132 块 ERA/120mm 滑膛炮 → L5 三色迷彩/战术编号/工具/油桶。",
      "自动装弹机全链：转盘选弹 → 提弹臂 → 推弹杆 → 炮闩关闭；击发后座 + 抽烟装置排烟 + 抛壳。",
      "ERA 单块爆炸 / 尾舱泄压板掀开 vs 泄压失败炮塔掀飞两个分支；车长独立热像仪 CITV 的猎-歼链路。",
      "开「透视」看发动机活塞/气门、自动装弹机转盘与弹药；拖构建滑杆按 build_order 自内向外回放。",
      "性能：普通外观视角自动剔除发动机/内饰等装甲内部件（不画、不投影、不参与点选）；开透视/爆炸/构建回放或从零件树选中内部件时自动恢复显示。",
    ],
  },
  {
    id: "ed90",
    title: "ED-90 电驱坦克",
    subtitle: "6×800V 动力电池 / 双电机独立驱动 / SiC 电控 / 快充 + 能量回收 / 静音 · 瞬时扭矩 · 热失控",
    milestone: "M-F",
    status: "ready",
    registry: makeEdriveRegistry(),
    layouts: makeEdriveLayouts(),
    builders: edriveBuilders,
    animate: animateEdrive,
    motionParts: EDRIVE_MOTION_PARTS,
    readouts: edriveReadouts,
    states: [
      { id: "idle", label: "静音待机", hint: "纯电静音：无发动机、无排气；仪表显示电量/母线电压/电机温度" },
      { id: "silent_drive", label: "静音行驶", hint: "双电机低噪驱动履带，车体低频起伏，静音滑行（噪声约 42dB）" },
      { id: "boost", label: "瞬时加速", hint: "电机瞬时扭矩，0→加速无换挡顿挫；功率表打到 1200kW" },
      { id: "e_steer_left", label: "差速左转", hint: "左电机 900rpm / 右电机 3200rpm，左右履带差速转向" },
      { id: "e_steer_right", label: "差速右转", hint: "右电机 900rpm / 左电机 3200rpm，电动差速右转" },
      { id: "regen", label: "能量回收", hint: "制动/下坡：电机反拖发电，电量表上升，回收功率约 −420kW" },
      { id: "charging", label: "快充", hint: "充电桩接快充口：装甲盖打开、充电枪锁止、800V 快充（电量爬升）" },
      { id: "battery_hit", label: "电池被击中", hint: "电池包中弹：短路火星 → 热失控火球/浓烟，Pack 5 顶部泄压" },
      { id: "thermal_runaway", label: "热失控", hint: "热失控持续蔓延：高温/火焰/烟，电量骤降" },
      { id: "aim", label: "炮塔瞄准", hint: "炮塔回转 + 火炮俯仰（复用 MBT 火力系统）" },
      { id: "loading", label: "自动装弹机", hint: "转盘选弹 → 提弹臂 → 推弹杆 → 炮闩关闭" },
      { id: "fire", label: "主炮击发", hint: "120mm 滑膛炮后坐 → 炮口焰 → 抽烟装置排烟 → 抛壳" },
      { id: "scanning", label: "穿模扫描", hint: "静态装配 / 动画扫掠检测进行中" },
    ],
    actions: [
      { id: "ed-silent", group: "电驱", label: "静音行驶", kind: "machine-state", state: "silent_drive" },
      { id: "ed-boost", group: "电驱", label: "瞬时加速", kind: "machine-state", state: "boost" },
      { id: "ed-left", group: "电驱", label: "差速左转", kind: "machine-state", state: "e_steer_left" },
      { id: "ed-right", group: "电驱", label: "差速右转", kind: "machine-state", state: "e_steer_right" },
      { id: "ed-stop", group: "电驱", label: "停机", kind: "machine-state", state: "idle" },
      { id: "ed-regen", group: "能量", label: "能量回收", kind: "machine-state", state: "regen" },
      { id: "ed-charge", group: "能量", label: "快充", kind: "machine-state", state: "charging" },
      { id: "ed-battery-hit", group: "防护", label: "电池被击中", kind: "machine-state", state: "battery_hit" },
      { id: "ed-runaway", group: "防护", label: "热失控", kind: "machine-state", state: "thermal_runaway" },
      { id: "ed-aim", group: "火力", label: "炮塔瞄准", kind: "machine-state", state: "aim" },
      { id: "ed-loading", group: "火力", label: "自动装弹", kind: "machine-state", state: "loading" },
      { id: "ed-fire", group: "火力", label: "主炮击发", kind: "machine-state", state: "fire" },
      { id: "ed-explode", group: "展示", label: "爆炸视图", kind: "view-toggle", view: "explode" },
      { id: "ed-xray", group: "展示", label: "透视", kind: "view-toggle", view: "xray" },
      { id: "ed-thermal", group: "展示", label: "热像仪视角", kind: "view-toggle", view: "thermal" },
      { id: "ed-labels", group: "展示", label: "零件标注", kind: "view-toggle", view: "labels" },
      { id: "ed-reset", group: "展示", label: "重置视角", kind: "reset-view" },
      { id: "ed-scan-static", group: "自检", label: "静态重扫", kind: "scan", scanKind: "static" },
      { id: "ed-scan-sweep", group: "自检", label: "动画扫掠", kind: "scan", scanKind: "sweep" },
    ],
    notes: [
      "966 个零件定义 / 3771 实例：6 组 800V 动力电池（3 模组 ×12 芯/包，共 216 芯，BMS + 液冷板 + 防爆阀）+ 左右独立驱动电机（定子/转子/磁钢/旋变/减速器逐件）+ SiC 控制器 ×2 + VCU/高压配电盒/OBC/DC-DC + 橙色高压线束 + 快充口 + 电驱仪表。",
      "电驱特性：静音行驶（无发动机/排气）、瞬时扭矩（1200kW 峰值演示）、左右电机差速转向、制动/下坡能量回收、800V 快充（充电桩/电缆/装甲盖开合）。",
      "电池受击：Pack 5 中弹 → 短路火星 → 热失控火球/浓烟，仪表温度升到 900°C；与 MBT 的燃油殉爆是两种不同的战损。",
      "复用 MBT-90 的车体/楔形炮塔/120mm 滑膛炮/自动装弹机/履带液气悬挂；柴油机与机械变速箱整体移除。",
      "性能：普通外观视角自动剔除电池/电机/电控/内饰（不画、不投影、不参与点选）；开透视/爆炸/构建回放或从零件树选中内部件时自动恢复；透视只幽灵化外壳，内部件保持不透明。",
    ],
  },
  {
    id: "m249",
    title: "M249 班用自动武器",
    subtitle: "导气式 + 弹链供弹 · M27 可散链步进 · 快拆枪管",
    milestone: "M-E",
    status: "ready",
    registry: makeM249Registry(),
    layouts: makeM249Layouts(),
    builders: M249_BUILDERS,
    motionParts: M249_MOTION_PARTS,
    animate: (assembled, seconds) => {
      animateM249(assembled, seconds, getM249Mode());
    },
    readouts: () => [
      { label: "自动原理", value: "导气式（短行程活塞）" },
      { label: "闭锁方式", value: "枪机头回转 30°" },
      { label: "供弹方式", value: "M27 可散弹链（步进 15mm/发）" },
      { label: "循环周期", value: "1.4 s/发" },
      { label: "弹药", value: "5.56×45 M855（六分件）×20 链上" },
    ],
    states: [
      { id: "idle", label: "装填静止", hint: "满链待击：可爆炸视图看供弹机构" },
      { id: "semi", label: "单发", hint: "打一发：拨弹齿步进一节，空链脱落" },
      { id: "running", label: "连发", hint: "连续射击：弹链逐节前移，弹壳下抛" },
      { id: "scanning", label: "穿模扫描", hint: "静态装配 / 动画扫掠检测进行中" },
    ],
    actions: [
      { id: "m249-semi", group: "射击", label: "单发", kind: "machine-state", state: "semi" },
      { id: "m249-auto", group: "射击", label: "连发", kind: "machine-state", state: "running" },
      { id: "m249-idle", group: "射击", label: "停机", kind: "machine-state", state: "idle" },
      { id: "explode", group: "展示", label: "爆炸视图", kind: "view-toggle", view: "explode" },
      { id: "xray", group: "展示", label: "透视", kind: "view-toggle", view: "xray" },
      { id: "labels", group: "展示", label: "零件标注", kind: "view-toggle", view: "labels" },
      { id: "reset-view", group: "展示", label: "重置视角", kind: "reset-view" },
      { id: "scan-static", group: "自检", label: "静态重扫", kind: "scan", scanKind: "static" },
      { id: "scan-sweep", group: "自检", label: "动画扫掠", kind: "scan", scanKind: "sweep" },
    ],
    notes: [
      "弹链供弹：拨弹齿随枪机往复，每次把 M27 链钩进一个节距（15mm）；空链节从受弹机左侧脱落（可散链）。",
      "导气式核心零件：导气箍（⌀3.8 导气孔 + 两档调节器）→ 活塞 = 操作杆 → 枪机框。",
      "快拆枪管：捏提把旋转 1/4 圈即可更换过热枪管（连射发烫要换——班组火力的设计）。",
      "M249 向下抛壳（车内射击时弹壳不砸人），与 AK-47 的右侧抛壳不同。",
    ],
  },
  {
    id: "m2hb",
    title: "M2HB 重机枪",
    subtitle: "枪管短后坐 + 半自由枪机 · M3 三脚架 + T&E · 重力排壳",
    milestone: "M-D",
    status: "ready",
    registry: makeM2hbRegistry(),
    layouts: makeM2hbLayouts(),
    builders: M2HB_BUILDERS,
    motionParts: M2HB_MOTION_PARTS,
    animate: (assembled, seconds) => {
      animateM2hb(assembled, seconds, getM2hbMode());
    },
    readouts: () => [
      { label: "自动原理", value: "枪管短后坐 + 半自由枪机" },
      { label: "短后坐行程", value: "12 mm（枪管+延伸部）" },
      { label: "枪机行程", value: "100 mm（加速子传能）" },
      { label: "循环周期", value: "2.2 s/发" },
      { label: "弹药", value: ".50 BMG M33（六分件）×14 链上" },
    ],
    states: [
      { id: "idle", label: "装填静止", hint: "满链待击：可爆炸视图看半自由枪机" },
      { id: "semi", label: "单发", hint: "打一发：枪管短后坐→加速子→枪机后坐→抽壳→复进" },
      { id: "running", label: "连发", hint: "连续射击：弹链逐节步进，空弹壳底部重力排出" },
      { id: "scanning", label: "穿模扫描", hint: "静态装配 / 动画扫掠检测进行中" },
    ],
    actions: [
      { id: "m2hb-semi", group: "射击", label: "单发", kind: "machine-state", state: "semi" },
      { id: "m2hb-auto", group: "射击", label: "连发", kind: "machine-state", state: "running" },
      { id: "m2hb-idle", group: "射击", label: "停机", kind: "machine-state", state: "idle" },
      { id: "explode", group: "展示", label: "爆炸视图", kind: "view-toggle", view: "explode" },
      { id: "xray", group: "展示", label: "透视", kind: "view-toggle", view: "xray" },
      { id: "labels", group: "展示", label: "零件标注", kind: "view-toggle", view: "labels" },
      { id: "reset-view", group: "展示", label: "重置视角", kind: "reset-view" },
      { id: "scan-static", group: "自检", label: "静态重扫", kind: "scan", scanKind: "static" },
      { id: "scan-sweep", group: "自检", label: "动画扫掠", kind: "scan", scanKind: "sweep" },
    ],
    notes: [
      "枪管短后坐：击发后枪管+延伸部整体后坐 12mm（闭锁环抱紧枪机）——与导气式（AK/M249）完全不同。",
      "加速子：枪管后坐末段摆臂下压，把 12mm 行程的能量加速传给枪机——枪机获得 100mm 行程（半自由枪机的灵魂）。",
      "拉壳槽随动：枪机前端的螺面凹槽收着撞针——枪机后坐时撞针边退边抽壳；L 形退壳杠杆放大退壳力。",
      "重力排壳：M2 无弹匣弹簧——空弹壳靠重力从枪身底部排出（12 槽弹壳池在枪下堆积）。",
      "M3 三脚架 + T&E：高低/方向手轮每点击 50 密位（1 密位 ≈ 1m/1000m）；枪管深灰发蓝 vs 机匣磷化灰绿分色。",
    ],
  },
  {
    id: "ak47",
    title: "AK-47 突击步枪",
    subtitle: "导气式 + 枪机回转闭锁 · 30 发弹匣零件化 · 完整射击循环",
    milestone: "M-E",
    status: "ready",
    registry: makeAk47Registry(),
    layouts: makeAk47Layouts(),
    builders: AK47_BUILDERS,
    motionParts: AK47_MOTION_PARTS,
    animate: (assembled, seconds) => {
      animateAk47(assembled, seconds, getAk47Mode());
    },
    readouts: () => [
      { label: "自动原理", value: "导气式（活塞长行程）" },
      { label: "闭锁方式", value: "枪机头回转 38°" },
      { label: "循环周期", value: "1.8 s/发" },
      { label: "理论射速", value: "600 发/分" },
      { label: "弹药", value: "7.62×39（六分件）×30" },
    ],
    states: [
      { id: "idle", label: "装填静止", hint: "满弹待击：可爆炸视图看内部机构" },
      { id: "semi", label: "单发", hint: "打一发完整循环：击发→导气后坐→抛壳→复进供弹" },
      { id: "running", label: "连发", hint: "连续射击：弹壳抛出堆积、枪口上跳、托弹板逐发上顶" },
      { id: "scanning", label: "穿模扫描", hint: "静态装配 / 动画扫掠检测进行中" },
    ],
    actions: [
      { id: "ak-semi", group: "射击", label: "单发", kind: "machine-state", state: "semi" },
      { id: "ak-auto", group: "射击", label: "连发", kind: "machine-state", state: "running" },
      { id: "ak-idle", group: "射击", label: "停机", kind: "machine-state", state: "idle" },
      { id: "explode", group: "展示", label: "爆炸视图", kind: "view-toggle", view: "explode" },
      { id: "xray", group: "展示", label: "透视", kind: "view-toggle", view: "xray" },
      { id: "labels", group: "展示", label: "零件标注", kind: "view-toggle", view: "labels" },
      { id: "reset-view", group: "展示", label: "重置视角", kind: "reset-view" },
      { id: "scan-static", group: "自检", label: "静态重扫", kind: "scan", scanKind: "static" },
      { id: "scan-sweep", group: "自检", label: "动画扫掠", kind: "scan", scanKind: "sweep" },
    ],
    notes: [
      "射击循环（1.8s）：扣扳机→阻铁释放击锤→击针击底火→弹头出膛（枪口焰）→燃气推活塞→枪机框后坐→枪机头回转开锁→抽壳抛壳→复进簧推回→推弹上膛→闭锁待击。",
      "弹药零件化：每发 = 弹头(被甲+铅套+钢芯) + 弹壳 + 发射药 + 底火，30 发实例化堆叠在弧形弹匣内。",
      "导气式核心零件：导气箍（⌀4.4 导气孔）→ 活塞+活塞杆 → 枪机框；闭锁由枪机头双凸笋在节套闭锁窗回转 38° 完成。",
    ],
  },
  {
    id: "m134",
    title: "M134 加特林",
    subtitle: "6 管旋转 · 每管独立枪机依次击发 · 外能源电机驱动",
    milestone: "M-G",
    status: "ready",
    registry: makeM134Registry(),
    layouts: makeM134Layouts(),
    builders: M134_BUILDERS,
    motionParts: M134_MOTION_PARTS,
    animate: (assembled, seconds) => {
      animateM134(assembled, seconds, getM134Mode());
    },
    readouts: () => [
      { label: "自动原理", value: "转管式（外能源电机）" },
      { label: "枪管数", value: "6 根（分布半径 32mm）" },
      { label: "枪机", value: "6 套独立（凸轮槽驱动往复）" },
      { label: "转子转速", value: "300 rpm（演示）" },
      { label: "理论射速", value: "1800 发/分（真机 6000）" },
    ],
    states: [
      { id: "idle", label: "停机", hint: "转子静止：可爆炸视图看 6 管 + 6 枪机" },
      { id: "semi", label: "点射", hint: "短促点射：转子转起，逐管依次击发" },
      { id: "running", label: "连发", hint: "全速旋转：枪口焰在击发位闪、弹壳瀑布式抛出" },
      { id: "scanning", label: "穿模扫描", hint: "静态装配 / 动画扫掠检测进行中" },
    ],
    actions: [
      { id: "m134-semi", group: "射击", label: "点射", kind: "machine-state", state: "semi" },
      { id: "m134-auto", group: "射击", label: "全速连发", kind: "machine-state", state: "running" },
      { id: "m134-idle", group: "射击", label: "停机", kind: "machine-state", state: "idle" },
      { id: "explode", group: "展示", label: "爆炸视图", kind: "view-toggle", view: "explode" },
      { id: "xray", group: "展示", label: "透视", kind: "view-toggle", view: "xray" },
      { id: "labels", group: "展示", label: "零件标注", kind: "view-toggle", view: "labels" },
      { id: "reset-view", group: "展示", label: "重置视角", kind: "reset-view" },
      { id: "scan-static", group: "自检", label: "静态重扫", kind: "scan", scanKind: "static" },
      { id: "scan-sweep", group: "自检", label: "动画扫掠", kind: "scan", scanKind: "sweep" },
    ],
    notes: [
      "转管式（皇冠机构）：6 根枪管 + 6 套独立枪机绕中心轴旋转，枪机导销插在转子尾端凸轮槽里——旋转中每套枪机依次完成 装填→闭锁→击发→抽壳→抛壳。",
      "外能源：加特林没有导气/后坐自动机，全靠电机经 36:10 减速齿轮组驱动转子；射速 = 6 × 转子转速（真机 1000rpm → 6000 发/分）。",
      "枪口焰只在击发位（正上方那根枪管）闪——与 AK/M249/M2HB 的「每发必闪」不同。",
      "弹壳瀑布：6 管轮流抛壳，从左侧抛壳口连续抛出（14 槽弹壳池循环）。",
    ],
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
