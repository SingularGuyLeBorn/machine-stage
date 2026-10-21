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
import {
  type38Builders,
  type38Layouts,
  type38Registry,
} from "@/three/parts/models/guns7/type38/registry";
import { T38_MOTION_PARTS, animateType38 } from "@/three/parts/models/guns7/type38/motion";

// ============================================================================
// catalog —— 展示台可加载的模型清单
//
// 纪律：每个模型只登记「注册表 + 实例布局 + 动画函数 + 动作/状态声明」，
// 坐标与尺寸全部来自注册表 constants，禁止在 UI 层写死模型尺寸。
// planned 卡片是路线图占位（M-B…M-F），没有注册表时不可选中。
// ============================================================================

export type ViewKey = "explode" | "xray" | "labels" | "grid" | "shadow" | "rain";

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
    subtitle: "虚构型号 · 楔形复合装甲 / 反应装甲 / 7 对负重轮 · 从头建模",
    milestone: "M-D",
    status: "ready",
    registry: makeMbtRegistry(),
    layouts: makeMbtLayouts(),
    builders: mbtKitBuilders,
    animate: animateMbt,
    motionParts: MBT_MOTION_PARTS,
    states: [
      { id: "idle", label: "停机", hint: "动力包 / 行走 / 炮塔全静止，可拖构建滑杆看装配" },
      { id: "running", label: "原地空转", hint: "负重轮与履带低速滚动，观察悬挂与履带板路径" },
      { id: "drive", label: "行进演示", hint: "车体前后 0.9m，7 对负重轮/主动轮/诱导轮与履带同步滚动" },
      { id: "aim", label: "炮塔瞄准", hint: "炮塔 ±23° 回转 + 火炮 ±3.4° 俯仰（4s 循环）" },
      { id: "fire", label: "主炮击发", hint: "炮身后坐 320mm + 炮口焰，4s 循环" },
      { id: "scanning", label: "穿模扫描", hint: "静态装配 / 动画扫掠检测进行中" },
    ],
    actions: [
      { id: "mbt-run", group: "机构", label: "原地空转", kind: "machine-state", state: "running" },
      { id: "mbt-drive", group: "机构", label: "行进演示", kind: "machine-state", state: "drive" },
      { id: "mbt-aim", group: "火炮", label: "炮塔瞄准", kind: "machine-state", state: "aim" },
      { id: "mbt-fire", group: "火力", label: "主炮击发", kind: "machine-state", state: "fire" },
      { id: "mbt-stop", group: "机构", label: "停机", kind: "machine-state", state: "idle" },
      { id: "mbt-explode", group: "展示", label: "爆炸视图", kind: "view-toggle", view: "explode" },
      { id: "mbt-xray", group: "展示", label: "透视", kind: "view-toggle", view: "xray" },
      { id: "mbt-labels", group: "展示", label: "零件标注", kind: "view-toggle", view: "labels" },
      { id: "mbt-reset", group: "展示", label: "重置视角", kind: "reset-view" },
      { id: "mbt-scan-static", group: "自检", label: "静态重扫", kind: "scan", scanKind: "static" },
      { id: "mbt-scan-sweep", group: "自检", label: "动画扫掠", kind: "scan", scanKind: "sweep" },
    ],
    notes: [
      "与虎式完全不同的形：大倾角首上（33°）、楔形炮塔前斜板（±24° 后倾 8°）、反应装甲首上 2×5 / 炮塔 2×6 / 侧裙 2×6。",
      "七对负重轮 + 双销耳挂胶履带板（172 块全实例化）；120mm 滑膛炮带热护套与抽气装置，炮口段近代主战坦克布局。",
      "动力包（发动机/传动/双风扇/双油箱/排气）在 L1，拖构建滑杆能从内到外看装配；炮塔/火炮/后坐由 Turret / Gun / GunRecoil 三个节点驱动。",
    ],
  },
  {
    id: "type38",
    title: "三八式步枪",
    subtitle: "手动旋转后拉枪机 · 5 发固定弹仓 · 6.5×50mmSR 有坂弹",
    milestone: "G-1",
    status: "ready",
    registry: type38Registry,
    layouts: type38Layouts,
    builders: type38Builders,
    motionParts: T38_MOTION_PARTS,
    animate: (assembled, seconds, state) => {
      animateType38(
        assembled,
        seconds,
        state === "running" ? "auto" : state === "semi" ? "semi" : "idle",
      );
    },
    readouts: () => [
      { label: "自动原理", value: "手动旋转后拉枪机" },
      { label: "闭锁方式", value: "双闭锁凸榫 + 机匣前环" },
      { label: "供弹方式", value: "5 发固定弹仓 + 桥夹" },
      { label: "循环周期", value: "2.6 s/发（手动）" },
      { label: "弹药", value: "6.5×50mmSR 有坂（六分件）×6" },
      { label: "零件", value: "81 种定义 / 137 件实例" },
    ],
    states: [
      { id: "idle", label: "装填静止", hint: "满仓待击：膛内 1 发 + 弹仓 5 发，可爆炸视图看枪机与弹仓" },
      { id: "semi", label: "单发", hint: "手动旋转后拉枪机：击发→开锁→抽壳→推弹→闭锁，只打一发" },
      { id: "running", label: "连发演示", hint: "连续完成 6 发手动循环，空仓后停在闭锁状态" },
      { id: "scanning", label: "穿模扫描", hint: "静态装配 / 动画扫掠检测进行中" },
    ],
    actions: [
      { id: "type38-semi", group: "射击", label: "单发", kind: "machine-state", state: "semi" },
      { id: "type38-auto", group: "射击", label: "连发 6 发", kind: "machine-state", state: "running" },
      { id: "type38-idle", group: "射击", label: "停机", kind: "machine-state", state: "idle" },
      { id: "explode", group: "展示", label: "爆炸视图", kind: "view-toggle", view: "explode" },
      { id: "xray", group: "展示", label: "透视", kind: "view-toggle", view: "xray" },
      { id: "labels", group: "展示", label: "零件标注", kind: "view-toggle", view: "labels" },
      { id: "reset-view", group: "展示", label: "重置视角", kind: "reset-view" },
      { id: "scan-static", group: "自检", label: "静态重扫", kind: "scan", scanKind: "static" },
      { id: "scan-sweep", group: "自检", label: "动画扫掠", kind: "scan", scanKind: "sweep" },
    ],
    notes: [
      "手动旋转后拉枪机：拉机柄上抬 90° 解锁→后拉 100mm 抽壳→复进推弹→下压闭锁；2.6s 一发，是七把枪里唯一的纯手动循环。",
      "防尘盖随枪机前后滑动，机匣右侧上导轨在拉机柄行程段断开，给手柄上抬/后拉让位。",
      "5 发固定弹仓：托弹板与弹仓簧逐发上升，桥夹压弹；弹仓口/机匣底板开口从 z=-0.155 起，让托弹板升到空仓高度也不撞机匣。",
      "弹药六分件（被甲/铅芯/钢芯/弹壳/发射药/底火）全部独立实例；抛壳、枪口焰、硝烟、后坐上跳都按 6 发循环驱动。",
      "展示台用前后 V 形托架 + 毛毡垫支撑枪身，枪托/护木落座，枪管悬空。",
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
