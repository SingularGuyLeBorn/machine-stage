import {
  makeTestRegistry,
  testKitLayouts,
  type AssembledModel,
  type InstanceLayout,
  type ModelRegistry,
} from "@/three/parts";
import type { GeometryBuilder } from "@/three/parts/assembler/geometry";
import { makeTigerLayouts, makeTigerRegistry, tigerBuilders } from "@/three/parts/models/tiger/registry";
import {
  animateTigerSuspension,
  TIGER_MOTION_PARTS,
  tigerDetachKeys,
  tigerDetachOffset,
  tigerInstanceLabel,
} from "@/three/parts/models/tiger/motion";
import {
  makeT800,
  makeT800Layouts,
  makeT800Registry,
  t800AllBuilders,
} from "@/three/parts/models/t800/registry";
import { animateT800, t800Readouts } from "@/three/parts/models/t800/motion";

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
  | { id: string; group: string; label: string; kind: "view-toggle"; view: ViewKey }
  | { id: string; group: string; label: string; kind: "param"; param: string; value: number | null }
  | { id: string; group: string; label: string; kind: "scan"; scanKind: "static" | "sweep" }
  | { id: string; group: string; label: string; kind: "variant"; variant: string }
  | { id: string; group: string; label: string; kind: "reset-view" }
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
  /** 动画：只驱动节点，每帧调用前框架已 resetNodes。t 为秒。 */
  animate?: (assembled: AssembledModel, seconds: number) => void;
  /** 由 animate 直接改写实例矩阵的零件（pose 层的爆炸/拆解据此取本帧位姿）。 */
  motionParts?: string[];
  /** 单实例拆解要一起移动的实例键（如负重轮 + 它的轮毂螺栓）。 */
  detachKeys?: (partId: string, index: number, count: number) => string[];
  /** 单实例拆解位移（模型空间，米）；返回 null 表示该实例不可拆。 */
  detachOffset?: (partId: string, index: number, count: number) => [number, number, number] | null;
  /** 实例检查器的人类可读标签（如「第 3 轴 · 第 2 排 · 右」）。 */
  instanceLabel?: (partId: string, index: number, count: number) => string | null;
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
    animate: animateT800,
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
    subtitle: "M-B 进行中：HL230 发动机 + 行动装置（L2）",
    milestone: "M-B",
    status: "ready",
    registry: makeTigerRegistry(),
    layouts: makeTigerLayouts(),
    builders: tigerBuilders,
    animate: animateTigerSuspension,
    motionParts: TIGER_MOTION_PARTS,
    detachKeys: tigerDetachKeys,
    detachOffset: tigerDetachOffset,
    instanceLabel: tigerInstanceLabel,
    states: [
      { id: "idle", label: "停机", hint: "悬挂静止，可拖构建滑杆看装配" },
      {
        id: "running",
        label: "悬挂演示",
        hint: "车体在扭杆上轻微浮沉，48 只负重轮各自转动；点单轮可拆下检查",
      },
      { id: "scanning", label: "穿模扫描", hint: "静态装配 / 动画扫掠检测进行中" },
    ],
    actions: [
      { id: "suspension-run", group: "机构", label: "悬挂演示", kind: "machine-state", state: "running" },
      { id: "suspension-stop", group: "机构", label: "停机", kind: "machine-state", state: "idle" },
      { id: "explode", group: "展示", label: "爆炸视图", kind: "view-toggle", view: "explode" },
      { id: "xray", group: "展示", label: "透视", kind: "view-toggle", view: "xray" },
      { id: "labels", group: "展示", label: "零件标注", kind: "view-toggle", view: "labels" },
      { id: "reset-view", group: "展示", label: "重置视角", kind: "reset-view" },
      { id: "scan-static", group: "自检", label: "静态重扫", kind: "scan", scanKind: "static" },
      { id: "scan-sweep", group: "自检", label: "动画扫掠", kind: "scan", scanKind: "sweep" },
    ],
    notes: [
      "M-B 进行中：当前可见 L1 已写零件（曲轴箱为主）；后续零件随注册表补全自动出现，无需等待全部完成。",
      "机构动画（曲轴/活塞联动）由实现者接入后，此处追加 running 状态与启动/停机动作。",
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
