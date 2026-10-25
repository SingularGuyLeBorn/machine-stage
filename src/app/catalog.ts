import {
  makeTestRegistry,
  testKitLayouts,
  type AssembledModel,
  type InstanceLayout,
  type ModelRegistry,
} from "@/three/parts";
import { hmtRuntimeRegistry, hmtRuntimeBuilders, prepareHmt } from "@/three/parts/models/hmt/runtime";
import type { GeometryBuilder } from "@/three/parts/assembler/geometry";
import type { DamageState } from "@/three/parts";
import { makeTigerLayouts, makeTigerRegistry, tigerBuilders } from "@/three/parts/models/tiger/registry";
import {
  KINGJOE_ANIMATED_STATES,
  KINGJOE_STATE_LABELS,
  animateKingJoe,
  type KingJoeState,
} from "@/three/parts/models/kingjoe/motion";
import {
  makeKingJoeLayouts,
  makeKingJoeRegistry,
  kingjoeModelBuilders,
} from "@/three/parts/models/kingjoe/registry";
import { makeKingJoeSkinRegistry, kingjoeSkinBuilders } from "@/three/parts/models/kingjoe-skin/registry";
import { makeKingJoeWholeRegistry } from "@/three/parts/models/kingjoe-whole/registry";
import { kingjoeWholeBuilders } from "@/three/parts/models/kingjoe-whole/kits";
import {
  makeKingJoeModuleRegistry,
  kingjoeModuleBuilders,
  poseKingJoeModules,
} from "@/three/parts/models/kingjoe-modules/registry";
import { moduleMotionBounds } from "@/three/parts/models/kingjoe-modules/motion";
import type { Box3 } from "three";
import { animateKingJoeSkin, type KingJoeSkinState } from "@/three/parts/models/kingjoe-skin/motion";
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
import {
  AK47_BUILDERS as AK47_G7_BUILDERS,
  makeAk47Layouts as makeAk47G7Layouts,
  makeAk47Registry as makeAk47G7Registry,
} from "@/three/parts/models/guns7/ak47/registry";
import {
  AK47_MOTION_PARTS as AK47_G7_MOTION_PARTS,
  animateAk47 as animateAk47G7,
} from "@/three/parts/models/guns7/ak47/motion";
import {
  BISON_BUILDERS,
  BISON_LAYOUTS_EXPORT,
  bisonRegistry,
} from "@/three/parts/models/guns7/bison/registry";
import { BISON_MOTION_PARTS, animateBison } from "@/three/parts/models/guns7/bison/motion";
import { makeRpkRegistry, makeRpkLayouts, RPK_BUILDERS } from "@/three/parts/models/guns7/rpk/registry";
import { RPK_MOTION_PARTS, animateRpk } from "@/three/parts/models/guns7/rpk/motion";
import { M60_BUILDERS, makeM60Layouts, makeM60Registry } from "@/three/parts/models/guns7/m60/registry";
import { M60_MOTION_PARTS, animateM60 } from "@/three/parts/models/guns7/m60/motion";
import { M2HB_BUILDERS, makeM2hbLayouts, makeM2hbRegistry } from "@/three/parts/models/m2hb/registry";
import { M2HB_MOTION_PARTS, animateM2hb } from "@/three/parts/models/m2hb/motion";
import { M134_BUILDERS, makeM134Layouts, makeM134Registry } from "@/three/parts/models/m134/registry";
import { M134_MOTION_PARTS, animateM134 } from "@/three/parts/models/m134/motion";
import { type38Builders, type38Layouts, type38Registry } from "@/three/parts/models/guns7/type38/registry";
import { T38_MOTION_PARTS, animateType38 } from "@/three/parts/models/guns7/type38/motion";
import { makeCarrierRegistry, CARRIER_LAYOUTS, carrierBuilders } from "@/three/parts/models/carrier/registry";
import { makeType055Registry, makeType055Layouts, TYPE055_BUILDERS } from "@/three/parts/models/type055/registry";
import { animateType055, TYPE055_ANIMATED_STATES, TYPE055_STATE_LABELS } from "@/three/parts/models/type055/motion";
import {
  animateCarrier,
  CARRIER_ANIMATED_STATES,
  CARRIER_STATE_LABELS,
  carrierBounds,
} from "@/three/parts/models/carrier/motion";

// ============================================================================
// catalog —— 展示台可加载的模型清单
//
// 纪律：每个模型只登记「注册表 + 实例布局 + 动画函数 + 动作/状态声明」，
// 坐标与尺寸全部来自注册表 constants，禁止在 UI 层写死模型尺寸。
// planned 卡片是路线图占位（M-B…M-F），没有注册表时不可选中。
// ============================================================================

export type ViewKey =
  | "explode"
  | "xray"
  | "localXray"
  | "internalsOnly"
  | "labels"
  | "grid"
  | "shadow"
  | "rain"
  | "thermal"
  | "underwater"
  | "sea";

export type StageAction =
  | { id: string; group: string; label: string; kind: "energy-boost" }
  | { id: string; group: string; label: string; kind: "machine-state"; state: string }
  | { id: string; group: string; label: string; kind: "damage"; level: DamageState }
  | { id: string; group: string; label: string; kind: "view-toggle"; view: ViewKey }
  | { id: string; group: string; label: string; kind: "param"; param: string; value: number | null }
  | { id: string; group: string; label: string; kind: "scan"; scanKind: "static" | "sweep" }
  | { id: string; group: string; label: string; kind: "variant"; variant: string }
  | { id: string; group: string; label: string; kind: "reset-view" }
  | { id: string; group: string; label: string; kind: "reroll-damage" }
  | {
      id: string;
      group: string;
      label: string;
      kind: "focus-node";
      node: string;
      offset?: [number, number, number];
      radius?: number;
    }
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

export type ModelCategory = "ship" | "aircraft" | "armor" | "firearm" | "mech" | "framework";

export const MODEL_CATEGORY_LABELS: Record<ModelCategory, string> = {
  ship: "舰船",
  aircraft: "战机",
  armor: "坦克",
  firearm: "枪械",
  mech: "机甲",
  framework: "框架",
};

export const MODEL_CATEGORY_ORDER: ModelCategory[] = ["ship", "aircraft", "armor", "firearm", "mech", "framework"];

export interface StageModel {
  /** [OM-FREEPLAY] 连续灯效与可反向合体使用场景时钟，状态内时序由模型管理。 */
  animationClock?: "continuous";
  id: string;
  title: string;
  category: ModelCategory;
  subtitle: string;
  /** 里程碑标记（左栏卡片角标）。 */
  milestone: string;
  status: "ready" | "planned";
  /** 用户指定隐藏的历史研究卡仍保留源码和注册表，避免与当前四分体展示混淆。 */
  hidden?: boolean;
  registry?: ModelRegistry;
  layouts?: Record<string, InstanceLayout>;
  /** 变体清单（有它时，UI 用「变体」动作切换，registry 取第一个变体）。 */
  variants?: StageVariant[];
  /** 模型自定义几何 kit 构造器（如发动机 borePlate/siameseBlock 等）。 */
  builders?: Record<string, GeometryBuilder>;
  /** 完整预计算几何的可取消加载；准备完成后才进入同一个装配器。 */
  prepare?: (signal: AbortSignal, progress: (fraction: number) => void) => Promise<void>;
  /** 动画：只驱动节点，每帧调用前框架已 resetNodes。t 为秒；state 为当前机器状态。 */
  animate?: (
    assembled: AssembledModel,
    seconds: number,
    state?: string,
    energyBoost?: boolean,
    energyWidth?: number,
  ) => void;
  /** 纯展示比例（只缩放置换根节点，不改节点/动画/对接）；在包围盒与相机基准之前应用。 */
  presentationScale?: [number, number, number];
  /** 可动总成的完整行程范围，用于初始取景。 */
  framingBounds?: (assembled: AssembledModel) => Box3;
  /** 这些状态由时钟推进（缺省只有 running）；多形态模型用它声明可动状态。 */
  animatedStates?: string[];
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
export function activeRegistryOf(modelId: string, variantId?: string): ModelRegistry | undefined {
  const model = findModel(modelId);
  if (!model) return undefined;
  if (!model.variants?.length) return model.registry;
  return model.variants.find((item) => item.id === variantId)?.registry ?? model.variants[0].registry;
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
    id: "hmt",
    title: "HMT · 双足机器人",
    subtitle: "Bulgarov · 人形头 / 三节腰椎 / 开窗护甲 / 分趾脚",
    category: "mech",
    milestone: "参考重建",
    status: "ready",
    registry: hmtRuntimeRegistry,
    builders: hmtRuntimeBuilders,
    prepare: prepareHmt,
    states: [{ id: "idle", label: "站立展示", hint: "旋转查看外形，选中零件可隔离与拆解" }],
    actions: [
      { id: "hmt-explode", group: "展示", label: "爆炸视图", kind: "view-toggle", view: "explode" },
      { id: "hmt-xray", group: "展示", label: "透视", kind: "view-toggle", view: "xray" },
      { id: "hmt-labels", group: "展示", label: "零件标注", kind: "view-toggle", view: "labels" },
      { id: "hmt-reset", group: "展示", label: "重置视角", kind: "reset-view" },
      { id: "hmt-scan", group: "自检", label: "静态重扫", kind: "scan", scanKind: "static" },
    ],
    readouts: (a) => [
      { label: "展示尺度", value: `${a.constants.HEIGHT.toFixed(2)} m（估算）` },
      { label: "可选零件", value: `${a.parts.length} 件` },
      { label: "总成", value: `${a.registry.assemblies.length} 组` },
    ],
    notes: [
      "按用户选定的深灰红色 2-xm-robotdesign 方案重建；同款白模用于核对开窗、背面和头颈关系。",
      "参考作者：Vitaly Bulgarov / Hankook Mirae Technology。比例由图片估算，2.4m 是展示尺度，并非真实规格或制造图纸。",
      "支持旋转、逐件构建、零件隔离与爆炸拆解；当前为静态展示模型。",
    ],
  },
  {
    id: "t800",
    title: "T-800 内骨骼",
    category: "mech",
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
    id: "kingjoemodules",
    title: "金古桥 · 参考图分体",
    category: "mech",
    subtitle: "四分体 / 佩丹设备舱 / 可动肩肘 / 双天线折线光束",
    milestone: "四模块",
    status: "ready",
    registry: makeKingJoeModuleRegistry(),
    builders: kingjoeModuleBuilders,
    animate: poseKingJoeModules,
    animationClock: "continuous",
    framingBounds: moduleMotionBounds,
    animatedStates: [
      "idle",
      "closed",
      "combining",
      "separation",
      "beam",
      "ray_legs",
      "ray_pelvis",
      "ray_chest",
      "ray_head_arms",
    ],
    states: [
      { id: "idle", label: "分体检查", hint: "双臂整体跟随头肩；四模块缓慢悬浮，头灯和胸窗持续发光" },
      { id: "closed", label: "整机检查", hint: "回到原模型装配位置，不播放合体动画" },
      {
        id: "combining",
        label: "电弧合体",
        hint: "腿部就位后，腹盆、胸甲、头肩依次沿曲线吸合；电花由小到大，最后轻微回弹",
      },
      { id: "separation", label: "展开分体", hint: "四体从起步沿空间曲线展开，天线伸出、髋鼓护片打开" },
      { id: "beam", label: "佩丹黄色光线", hint: "双手抬至头前下方，向前送出并发射黄色折线光束" },
      ...(["legs", "pelvis", "chest", "head_arms"] as const).map((key, i) => ({
        id: `ray_${key}`,
        label: ["腿部双天线", "腹盆双天线", "胸甲双天线", "头肩双天线"][i],
        hint: "分体就位后，两根天线同步发射红色 Z 字电束",
      })),
    ],
    actions: [
      { id: "modules-open", group: "分体", label: "分体检查", kind: "machine-state", state: "idle" },
      { id: "modules-close", group: "分体", label: "整机检查", kind: "machine-state", state: "closed" },
      { id: "modules-combine", group: "动画", label: "电弧合体", kind: "machine-state", state: "combining" },
      {
        id: "modules-separate",
        group: "动画",
        label: "展开分体",
        kind: "machine-state",
        state: "separation",
      },
      { id: "modules-reset", group: "展示", label: "重置视角", kind: "reset-view" },
      { id: "modules-boost", group: "佩丹光线", label: "光线加力", kind: "energy-boost" },
      { id: "modules-beam", group: "佩丹光线", label: "整机黄色光线", kind: "machine-state", state: "beam" },
      ...(["legs", "pelvis", "chest", "head_arms"] as const).map((key, i) => ({
        id: `modules-ray-${key}`,
        group: "佩丹光线",
        label: ["腿部红色双束", "腹盆红色双束", "胸甲红色双束", "头肩红色双束"][i],
        kind: "machine-state" as const,
        state: `ray_${key}`,
      })),
    ],
    readouts: (assembled) => [
      { label: "主体", value: "4 分体 · 12 设备舱" },
      {
        label: "内部零件",
        value: assembled.parts
          .filter((p) => p.def.tags?.includes("internal"))
          .reduce((sum, p) => sum + p.instances.length, 0)
          .toLocaleString(),
      },
      { label: "开放边", value: "0" },
      { label: "双臂", value: "肩肘联动" },
      { label: "接口", value: "阶梯嵌合" },
    ],
    notes: [
      "分为头肩与双臂、胸甲、腹盆、腿部；肩肘采用前缘转轴和柔性叠层护套，手掌随前臂运动。",
      "保留原 GLB 的头部、四肢与腹盆细节。胸甲按参考图重塑为上窄下展的圆润双瓣，彩窗改为厚黑边与虹彩云斑玻璃；肩根保留大臂外露空间。",
      "腹盆上下凸起嵌入对应凹槽，原髋鼓完整归腿部。胸甲中央为圆 U 口，两侧双榫嵌入头肩凹槽；双臂根部带圆润护甲。",
      "四体沿连续曲线飞出，天线从本体套筒伸出；合体按腿部、腹盆、胸甲、头肩依次完成，电花由小到大，近距减速后吸合回弹。",
      "佩丹计算晶核、磁约束能源、悬浮场线圈与电磁执行器为经用户批准的原创结构；承力轨、安装柱、螺旋弹簧和散热件可在零件树逐件查看。「仅内部零件」隐藏表皮；大块空腔补入反应堆、储能罐和相位设备；肩肘齿圈与双活塞随抬臂联动，器件之间以半透明虹彩流体耦合。",
      "分体可用双天线发射红色 Z 字电束；整机抬手、前送后由屏幕发射黄色电束。头屏保留固定四排等宽灯块，未点亮的格子融入暗底，上下两组三连亮点带柔和散射并逐格循环，胸窗在呼吸亮起与近暗之间交替。",
    ],
  },
  {
    id: "test",
    title: "框架自检台",
    category: "framework",
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
    category: "armor",
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
      {
        id: "engine-start",
        group: "机构",
        label: "发动机启动",
        kind: "machine-state",
        state: "engine_start",
      },
      { id: "refuel", group: "勤务", label: "加油（开盖）", kind: "machine-state", state: "refuel" },
      { id: "cannon-fire", group: "火力", label: "主炮击发", kind: "machine-state", state: "firing" },
      { id: "loading-run", group: "火力", label: "装填演示", kind: "machine-state", state: "loading" },
      { id: "mg-fire", group: "火力", label: "机枪连射", kind: "machine-state", state: "mg_firing" },
      { id: "aim", group: "火炮", label: "炮塔瞄准", kind: "machine-state", state: "aiming" },
      { id: "hit-light", group: "受击", label: "轻击（小口径）", kind: "machine-state", state: "hit_light" },
      { id: "hit-heavy", group: "受击", label: "重击（大口径）", kind: "machine-state", state: "hit_heavy" },
      { id: "hit-oblique", group: "受击", label: "斜角命中", kind: "machine-state", state: "hit_oblique" },
      {
        id: "hit-ricochet",
        group: "受击",
        label: "跳弹（未穿）",
        kind: "machine-state",
        state: "hit_ricochet",
      },
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
      { id: "cam-walk", group: "视角", label: "车内外漫游", kind: "camera", mode: "walk" },
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
    category: "armor",
    subtitle: "V12 双涡轮 / 液气悬挂 / 转盘自动装弹机 / 复合装甲 + ERA / 120mm 滑膛炮 · 自内向外零件级",
    milestone: "M-D",
    status: "ready",
    registry: makeMbtRegistry(),
    layouts: makeMbtLayouts(),
    builders: mbtKitBuilders,
    animate: animateMbt,
    motionParts: MBT_MOTION_PARTS,
    states: [
      {
        id: "idle",
        label: "停机",
        hint: "全车静止；可拖构建滑杆自内向外看 V12 动力 → 悬挂 → 战斗室 → 复合装甲",
      },
      {
        id: "engine_start",
        label: "发动机启动",
        hint: "起动机拖动曲轴 → 逐缸点火 → 转速爬升到 620r/min 怠速",
      },
      { id: "running", label: "怠速运转", hint: "曲轴/12 活塞/12 连杆/48 气门/双凸轮轴/双涡轮/风扇全部在动" },
      { id: "drive", label: "行进演示", hint: "履带滚动 + 14 轮独立起伏 + 传动齿轮转动；车体前后来回" },
      { id: "suspension", label: "液气悬挂", hint: "14 站液压缸/活塞杆/蓄能器独立随地形伸缩" },
      {
        id: "aim",
        label: "炮塔瞄准",
        hint: "炮塔 +31°/−20° 回转 + 火炮 ±5.7° 俯仰；炮塔回正时驾驶员舱盖弹起并掀开再闭合",
      },
      { id: "loading", label: "自动装弹机", hint: "转盘选弹 → 提弹机抬升 → 推弹杆推入炮膛 → 炮闩关闭" },
      { id: "fire", label: "主炮击发", hint: "后坐 340mm → 炮口焰 → 抽烟装置排烟 → 开闩抛壳" },
      { id: "era_hit", label: "ERA 被击中", hint: "首上反应装甲单块爆炸，来袭弹被推开" },
      { id: "blowout", label: "殉爆泄压", hint: "尾舱弹药架中弹：泄压板掀开，火焰/压力向上泄出" },
      { id: "detonation", label: "泄压失败殉爆", hint: "泄压板未开：炮塔被掀飞，殉爆火球" },
      { id: "hunter_killer", label: "猎-歼", hint: "车长热像仪扫描发现 → 炮塔转向 → 炮长击发" },
      { id: "scanning", label: "穿模扫描", hint: "静态装配 / 动画扫掠检测进行中" },
    ],
    actions: [
      {
        id: "mbt-engine-start",
        group: "动力",
        label: "发动机启动",
        kind: "machine-state",
        state: "engine_start",
      },
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
      { id: "mbt-walk", group: "第一人称", label: "车内外漫游", kind: "camera", mode: "walk" },
      { id: "mbt-explode", group: "展示", label: "爆炸视图", kind: "view-toggle", view: "explode" },
      { id: "mbt-xray", group: "展示", label: "透视", kind: "view-toggle", view: "xray" },
      { id: "mbt-thermal", group: "展示", label: "热像仪视角", kind: "view-toggle", view: "thermal" },
      { id: "mbt-labels", group: "展示", label: "零件标注", kind: "view-toggle", view: "labels" },
      { id: "mbt-reset", group: "展示", label: "重置视角", kind: "reset-view" },
      { id: "mbt-scan-static", group: "自检", label: "静态重扫", kind: "scan", scanKind: "static" },
      { id: "mbt-scan-sweep", group: "自检", label: "动画扫掠", kind: "scan", scanKind: "sweep" },
    ],
    notes: [
      "1290 个零件定义 / 4100+ 实例：L1 V12 双涡轮柴油机（48 气门、12 活塞连杆逐件）→ L1 传动 → L2 履带与 14 站液气悬挂 → L3 三人乘员组/炮塔吊篮/转盘自动装弹机/40 发弹药 → L4 复合装甲车体与楔形炮塔/132 块盒式 ERA/120mm 滑膛炮/车长 M2HB 12.7mm 机枪 → L5 三色迷彩/战术编号/工具/油桶。",
      "自动装弹机全链：转盘选弹 → 提弹臂 → 推弹杆 → 炮闩关闭；击发后座 + 抽烟装置排烟 + 抛壳。",
      "ERA 单块爆炸 / 尾舱泄压板掀开 vs 泄压失败炮塔掀飞两个分支；车长独立热像仪 CITV 的猎-歼链路。",
      "爆炸/炮口焰是照片级序列帧 VFX（fscopel，CC-BY 3.0）+ 烟团/火花/冲击波/点光；素材与署名见 public/vfx/CREDITS.md。",
      "开「透视」看发动机活塞/气门、自动装弹机转盘与弹药；拖构建滑杆按 build_order 自内向外回放。",
      "性能：普通外观视角自动剔除发动机/内饰等装甲内部件（不画、不投影、不参与点选）；开透视/爆炸/构建回放或从零件树选中内部件时自动恢复显示。",
    ],
  },
  {
    id: "ed90",
    title: "ED-90 电驱坦克",
    category: "armor",
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
      {
        id: "silent_drive",
        label: "静音行驶",
        hint: "双电机低噪驱动履带，车体低频起伏，静音滑行（噪声约 42dB）",
      },
      { id: "boost", label: "瞬时加速", hint: "电机瞬时扭矩，0→加速无换挡顿挫；功率表打到 1200kW" },
      { id: "e_steer_left", label: "差速左转", hint: "左电机 900rpm / 右电机 3200rpm，左右履带差速转向" },
      { id: "e_steer_right", label: "差速右转", hint: "右电机 900rpm / 左电机 3200rpm，电动差速右转" },
      { id: "regen", label: "能量回收", hint: "制动/下坡：电机反拖发电，电量表上升，回收功率约 −420kW" },
      {
        id: "charging",
        label: "快充",
        hint: "充电桩接快充口：装甲盖打开、充电枪锁止、800V 快充（电量爬升）",
      },
      {
        id: "battery_hit",
        label: "电池被击中",
        hint: "电池包中弹：短路火星 → 热失控火球/浓烟，Pack 5 顶部泄压",
      },
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
      {
        id: "ed-battery-hit",
        group: "防护",
        label: "电池被击中",
        kind: "machine-state",
        state: "battery_hit",
      },
      { id: "ed-runaway", group: "防护", label: "热失控", kind: "machine-state", state: "thermal_runaway" },
      { id: "ed-aim", group: "火力", label: "炮塔瞄准", kind: "machine-state", state: "aim" },
      { id: "ed-loading", group: "火力", label: "自动装弹", kind: "machine-state", state: "loading" },
      { id: "ed-fire", group: "火力", label: "主炮击发", kind: "machine-state", state: "fire" },
      { id: "ed-walk", group: "第一人称", label: "车内外漫游", kind: "camera", mode: "walk" },
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
    id: "type38",
    title: "三八式步枪",
    category: "firearm",
    subtitle: "手动旋转后拉枪机 · 5 发固定弹仓 · 6.5×50mmSR 有坂弹",
    milestone: "G-1",
    status: "ready",
    registry: type38Registry,
    layouts: type38Layouts,
    builders: type38Builders,
    motionParts: T38_MOTION_PARTS,
    animate: (assembled, seconds, state) => {
      animateType38(assembled, seconds, state === "running" ? "auto" : state === "semi" ? "semi" : "idle");
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
    id: "bison",
    title: "PP-19 野牛冲锋枪",
    category: "firearm",
    subtitle: "自由枪机 + 30 发螺旋弹筒 + 侧折叠骨架托 · 9×18mm PM",
    milestone: "G-2",
    status: "ready",
    registry: bisonRegistry,
    layouts: BISON_LAYOUTS_EXPORT,
    builders: BISON_BUILDERS,
    motionParts: BISON_MOTION_PARTS,
    animate: (assembled, seconds, state) => {
      animateBison(assembled, seconds, state === "running" ? "auto" : state === "semi" ? "semi" : "idle");
    },
    readouts: () => [
      { label: "自动原理", value: "自由枪机（无导气/无回转闭锁）" },
      { label: "供弹方式", value: "30 发螺旋弹筒（膛内 1 + 螺旋槽 29）" },
      { label: "循环速度", value: "1.15 s/发（约 700 发/分）" },
      { label: "弹药", value: "9×18mm PM 马卡洛夫（六分件逐发独立）" },
      { label: "零件", value: "64 定义 / 259 实例" },
    ],
    states: [
      { id: "idle", label: "装配静止", hint: "满仓 30 发，可开爆炸视图看弹筒内部螺旋导轨" },
      { id: "semi", label: "单发", hint: "一次自由枪机循环：击发、后坐、抽壳、托弹板推进一个槽" },
      { id: "running", label: "连发", hint: "30 发连续循环，螺旋托弹板旋转 29 个槽距，空仓后停住" },
      { id: "scanning", label: "穿模扫描", hint: "静态装配 / 循环扫掠检测进行中" },
    ],
    actions: [
      { id: "bison-semi", group: "射击", label: "单发", kind: "machine-state", state: "semi" },
      { id: "bison-auto", group: "射击", label: "连发 30 发", kind: "machine-state", state: "running" },
      { id: "bison-idle", group: "射击", label: "停火", kind: "machine-state", state: "idle" },
      { id: "explode", group: "展示", label: "爆炸视图", kind: "view-toggle", view: "explode" },
      { id: "xray", group: "展示", label: "透视", kind: "view-toggle", view: "xray" },
      { id: "labels", group: "展示", label: "零件标注", kind: "view-toggle", view: "labels" },
      { id: "reset-view", group: "展示", label: "重置视角", kind: "reset-view" },
      { id: "scan-static", group: "自检", label: "静态重扫", kind: "scan", scanKind: "static" },
      { id: "scan-sweep", group: "自检", label: "扫掠检测", kind: "scan", scanKind: "sweep" },
    ],
    notes: [
      "野牛不是导气式：枪机/枪机框作为一个自由枪机整体后坐 58mm，没有导气活塞和回转闭锁凸笋；枪机节点保持 0°。",
      "30 发弹筒由 29 个螺旋槽位 + 膛内 1 发组成；托弹板是单臂螺旋推板，沿导轨旋转并把弹推到供弹唇，不占用整圆截面。",
      "弹筒外壳顶部开 110° 供弹口，前/后盖是环板；螺旋导轨只放在筒体中后段，避让供弹口的抬弹路径。",
      "骨架托挂在机匣左侧的铰链座上，向左侧折叠 180°；这样后坐时枪机框不会撞到托架。",
    ],
  },
  {
    id: "m60",
    title: "M60 通用机枪",
    category: "firearm",
    subtitle: "7.62×51 NATO · 导气式 + 回转闭锁 · 100 发可散链 · M60 大机盖",
    milestone: "G-4",
    status: "ready",
    registry: makeM60Registry(),
    layouts: makeM60Layouts(),
    builders: M60_BUILDERS,
    motionParts: M60_MOTION_PARTS,
    animate: (assembled, seconds, state) => {
      animateM60(assembled, seconds, state === "running" ? "auto" : state === "semi" ? "semi" : "idle");
    },
    readouts: () => [
      { label: "自动原理", value: "导气式（长行程活塞）" },
      { label: "闭锁方式", value: "枪机头回转 30°" },
      { label: "供弹方式", value: "M13 可散弹链（7.62×51，20mm 节距）" },
      { label: "循环周期", value: "1.4 s/发" },
      { label: "弹药", value: "7.62×51 NATO M80（六分件）×20 链上" },
      { label: "零件", value: "56 定义 / 191 实例" },
    ],
    states: [
      { id: "idle", label: "架设静止", hint: "两脚架展开，满链待击；可爆炸视图看 M60 大机盖与供弹机构" },
      { id: "semi", label: "单发", hint: "打一发：拨弹齿步进一节，空链脱落" },
      { id: "running", label: "连发", hint: "连续射击：7.62 弹链逐节前移，弹壳下抛" },
      { id: "scanning", label: "穿模扫描", hint: "静态装配 / 动画扫掠检测进行中" },
    ],
    actions: [
      { id: "m60-semi", group: "射击", label: "单发", kind: "machine-state", state: "semi" },
      { id: "m60-auto", group: "射击", label: "连发", kind: "machine-state", state: "running" },
      { id: "m60-idle", group: "射击", label: "停机", kind: "machine-state", state: "idle" },
      { id: "explode", group: "展示", label: "爆炸视图", kind: "view-toggle", view: "explode" },
      { id: "xray", group: "展示", label: "透视", kind: "view-toggle", view: "xray" },
      { id: "labels", group: "展示", label: "零件标注", kind: "view-toggle", view: "labels" },
      { id: "reset-view", group: "展示", label: "重置视角", kind: "reset-view" },
      { id: "scan-static", group: "自检", label: "静态重扫", kind: "scan", scanKind: "static" },
      { id: "scan-sweep", group: "自检", label: "动画扫掠", kind: "scan", scanKind: "sweep" },
    ],
    notes: [
      "M60 由 M249 基座派生：机匣、导气活塞、回转闭锁枪机、击发机构沿用 Ak* 节点；枪管延长到 560mm，弹链按 7.62×51 重新排布。",
      "供弹：M13 可散链节距 20mm，拨弹齿随枪机往复，每次把链钩进一节；100 发弹链箱挂机匣左下，空链节从受弹机左侧脱落。",
      "M60 特征件：整体冲压受弹大盖 + 铰链轴/卡榫、固定枪托 + 橡胶托底板、独立手枪握把、260mm 两脚架双腿/脚座/回位簧。",
      "弹链/弹药共 20 组可见链节，每组 6 个 partId（链节 + 弹壳 + 弹头 + 铅套 + 钢芯 + 发射药），动画时逐发前移、进膛、抛壳。",
    ],
  },
  {
    id: "kingjoe",
    title: "金古桥 King Joe",
    category: "mech",
    subtitle: "真实网格皮 · 四体分离合体 · 锥销/锁环 · 彩虹胸 · 反重力 · 怪光线",
    milestone: "M-G·R3",
    status: "ready",
    registry: makeKingJoeRegistry(),
    layouts: makeKingJoeLayouts(),
    builders: kingjoeModelBuilders,
    animatedStates: KINGJOE_ANIMATED_STATES,
    animate: (assembled, seconds, state) =>
      animateKingJoe(assembled, seconds, (state as KingJoeState) ?? "idle"),
    states: KINGJOE_STATE_LABELS.map((state) => ({ id: state.id, label: state.label, hint: state.hint })),
    actions: [
      { id: "kj-formation", group: "四体", label: "编队巡航", kind: "machine-state", state: "formation" },
      { id: "kj-combine", group: "四体", label: "阻尼合体", kind: "machine-state", state: "combining" },
      { id: "kj-separate", group: "四体", label: "分离回避", kind: "machine-state", state: "separation" },
      { id: "kj-crippled", group: "四体", label: "残缺合体", kind: "machine-state", state: "crippled" },
      { id: "kj-damage", group: "受击", label: "机器人受击", kind: "machine-state", state: "damaged" },
      { id: "kj-walk", group: "机构", label: "机器人步行", kind: "machine-state", state: "robot" },
      { id: "kj-fire", group: "武器", label: "怪光线", kind: "machine-state", state: "firing" },
      { id: "kj-idle", group: "机构", label: "合体待机", kind: "machine-state", state: "idle" },
      { id: "kj-explode", group: "展示", label: "爆炸视图", kind: "view-toggle", view: "explode" },
      { id: "kj-xray", group: "展示", label: "透视", kind: "view-toggle", view: "xray" },
      { id: "kj-labels", group: "展示", label: "零件标注", kind: "view-toggle", view: "labels" },
      { id: "kj-grid", group: "展示", label: "网格", kind: "view-toggle", view: "grid" },
      { id: "kj-reset", group: "展示", label: "重置视角", kind: "reset-view" },
      { id: "kj-scan-static", group: "自检", label: "静态重扫", kind: "scan", scanKind: "static" },
      { id: "kj-scan-sweep", group: "自检", label: "动画扫掠", kind: "scan", scanKind: "sweep" },
    ],
    readouts: (assembled) => [
      { label: "同屏零件", value: `${assembled.parts.length} 件` },
      { label: "合体高度", value: "6.98 m" },
      { label: "真实网格", value: "7224 顶点 / 7258 三角" },
      { label: "皮 / 骨", value: "578 片皮 · 四体对接" },
    ],
    notes: [
      "外形：King_Joe.glb 真实网格按蒙皮切成 578 片，再按部位合并成左右大腿/小腿/足、上臂/前臂/手/三指、胸·肩荚、上腹、骨盆、髋裙与头；每件独立 partId。",
      "四体：King Legs / King Stomach / King Chest / King Ship；三道 120mm 接缝，锥销入槽、锁环咬合、电弧接通与阻尼序列沿用原机构。",
      "彩虹胸：左右各 7 条独立彩色格栅带 + 银框/黑背板/横栅；额头发射体与颈口发光体保留怪光线发射。",
      "自检口径：真实网格源资产本身有 459 个互嵌壳，皮-皮、关节、对接内腔按带原因的深度白名单豁免；机构-皮与机构-机构未豁免报告为 0。",
      "已知边界：真实头部是圆顶单眼结构，未再加参考图的横向眼带；旧肩荚对接件由真实肩荚/手臂关节替代。",
    ],
  },
  {
    id: "kingjoeskin",
    title: "金古桥 King Joe · 真实网格分件",
    category: "mech",
    // 用户要求隐藏：这是早期 578 源件检查卡，当前展示使用“参考图分体”。
    hidden: true,
    subtitle: "578 源件 · 四段飞船 · 四体分件查看 · 哑光银灰 + 彩虹胸 · 个人参考",
    milestone: "M-G·R3",
    status: "ready",
    registry: makeKingJoeSkinRegistry(),
    builders: kingjoeSkinBuilders,
    animatedStates: ["separated"],
    animate: (assembled, seconds, state) =>
      animateKingJoeSkin(assembled, seconds, (state as KingJoeSkinState) ?? "idle"),
    states: [
      { id: "idle", label: "装配态", hint: "四个模块贴合为整机；578 个真实网格源件可逐件检查" },
      {
        id: "separated",
        label: "四体分件",
        hint: "King Ship / Chest / Stomach / Legs 沿 Y 轴展开；这是分件参考卡，阻尼/锁环/电弧见主卡",
      },
    ],
    actions: [
      { id: "kjs-separate", group: "四体", label: "四体分件", kind: "machine-state", state: "separated" },
      { id: "kjs-idle", group: "四体", label: "合拢装配", kind: "machine-state", state: "idle" },
      { id: "kjs-explode", group: "展示", label: "爆炸视图", kind: "view-toggle", view: "explode" },
      { id: "kjs-xray", group: "展示", label: "透视", kind: "view-toggle", view: "xray" },
      { id: "kjs-labels", group: "展示", label: "零件标注", kind: "view-toggle", view: "labels" },
      { id: "kjs-grid", group: "展示", label: "网格", kind: "view-toggle", view: "grid" },
      { id: "kjs-reset", group: "展示", label: "重置视角", kind: "reset-view" },
      { id: "kjs-scan-static", group: "自检", label: "静态重扫", kind: "scan", scanKind: "static" },
      { id: "kjs-scan-sweep", group: "自检", label: "动画扫掠", kind: "scan", scanKind: "sweep" },
    ],
    readouts: (assembled) => [
      { label: "源分件", value: "578 件" },
      { label: "同屏零件", value: `${assembled.parts.length} 件` },
      { label: "真实网格", value: "7224 顶点 / 7258 三角" },
      { label: "模块", value: "4 段 · 可展开" },
    ],
    notes: [
      "真实网格 7224 顶点 / 7258 三角 / 459 连通壳，按面级蒙皮主导骨骼切成 578 个独立 partId；四段飞船用模块节点分组。",
      "「四体分件」只把四个模块沿 Y 轴展开，方便逐件检查真实皮；阻尼合体、锥销/锁环、电弧和怪光线在主卡「金古桥 King Joe」。",
      "源网格自身是多片壳体互嵌的游戏低模；源内接触按白名单豁免，新增彩虹胸/眼带无穿模。",
      "版权：奥特曼 IP，个人参考，不做商用。",
    ],
  },
  {
    id: "kingjoewhole",
    title: "金古桥 King Joe · 整体实心（单件）",
    category: "mech",
    // 用户要求隐藏：这是早期实心对照模型，保留用于几何回归，不再展示入口。
    hidden: true,
    subtitle: "原皮表面 + 内部闭合实心核 + 缝隙补面 · 1 个 partId · 不是中空壳",
    milestone: "M-G·R3.1",
    status: "ready",
    registry: makeKingJoeWholeRegistry(),
    builders: kingjoeWholeBuilders,
    states: [
      {
        id: "idle",
        label: "整体实心",
        hint: "整个角色是 1 个 partId；表面保留原皮，内部由闭合实心核填满；x-ray 可看内核",
      },
    ],
    actions: [
      { id: "kjw-xray", group: "展示", label: "透视", kind: "view-toggle", view: "xray" },
      { id: "kjw-labels", group: "展示", label: "零件标注", kind: "view-toggle", view: "labels" },
      { id: "kjw-grid", group: "展示", label: "网格", kind: "view-toggle", view: "grid" },
      { id: "kjw-reset", group: "展示", label: "重置视角", kind: "reset-view" },
      { id: "kjw-scan-static", group: "自检", label: "静态重扫", kind: "scan", scanKind: "static" },
      { id: "kjw-scan-sweep", group: "自检", label: "动画扫掠", kind: "scan", scanKind: "sweep" },
    ],
    readouts: () => [
      { label: "零件", value: "1 件" },
      { label: "表面三角", value: "15,248 个" },
      { label: "内核三角", value: "41,836 个" },
      { label: "补缝三角", value: "14,189 个" },
      { label: "内核体积", value: "9.80 m³" },
    ],
    notes: [
      "表面仍是真实网格 578 源件 + 21 个叠加细节的 15,248 个原三角形，保留原 UV/12 组材质，外观与「真实网格分件」合体态一致。",
      "内部不是空的：用 0.06m 体素把整机重网格成闭合实体（41,836 三角，边界边 0，体积约 9.8 m³），内缩 1% 后与原皮表面合并到同一个 partId。",
      "补缝：外壳边界补面 82 三角；下半身甲片缝隙/脚部空档用 1.0 外包络补实心膜 14,107 三角（胸甲彩虹区与双手区不补，避免盖住细节），合计补缝 14,189 三角。",
      "这不是「表面一层、内部还是空的」薄壳；x-ray 透视可以直接看到内部实心核。",
      "单件仍是 1 个 partId；没有拆分、三体、横切、榫卯或新增外部零件。两体/三体/实心横切卡已按要求移除。",
      "外部核证据：docs/qa/kingjoe-whole-core.jpg（内核实体渲染）、docs/qa/kingjoe-whole-solid-xray.jpg（透视下的内核）。",
      "分离/合体/怪光线在主卡「金古桥 King Joe」；578 分件查看在「真实网格分件」卡。",
      "版权：奥特曼 IP，个人参考，不做商用。",
    ],
  },
  {
    id: "m2hb",
    title: "M2HB 重机枪",
    category: "firearm",
    subtitle: "枪管短后坐 + 半自由枪机 · M3 三脚架 + T&E · 重力排壳",
    milestone: "M-D",
    status: "ready",
    registry: makeM2hbRegistry(),
    layouts: makeM2hbLayouts(),
    builders: M2HB_BUILDERS,
    motionParts: M2HB_MOTION_PARTS,
    animate: (assembled, seconds, state) => {
      animateM2hb(assembled, seconds, state === "running" ? "auto" : state === "semi" ? "semi" : "idle");
    },
    readouts: () => [
      { label: "自动原理", value: "枪管短后坐 + 半自由枪机" },
      { label: "短后坐行程", value: "12 mm（枪管+延伸部）" },
      { label: "枪机行程", value: "100 mm（加速子传能）" },
      { label: "循环周期", value: "2.2 s/发" },
      { label: "弹药", value: ".50 BMG M33（六分件）×17 链上" },
      { label: "零件", value: "68 定义 / 201 实例" },
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
      "细部件：加速子销/回位簧、扳机与阻铁销、保险定位珠/簧、三级供弹杠杆销、弹链导板/阻弹齿、供弹盖铰链/卡榫、枪管支撑轴承/闭锁环定位榫、T&E 高低/方向齿轮、三条腿驻锄、架座销轴、M9 弹链箱/卡扣。",
    ],
  },
  {
    id: "ak47",
    title: "AK-47 突击步枪",
    category: "firearm",
    subtitle: "导气式 + 枪机回转闭锁 · 30 发弹匣零件化 · 完整射击循环",
    milestone: "M-E",
    status: "ready",
    registry: makeAk47G7Registry(),
    layouts: makeAk47G7Layouts(),
    builders: AK47_G7_BUILDERS,
    motionParts: AK47_G7_MOTION_PARTS,
    animate: (assembled, seconds, state) => {
      animateAk47G7(assembled, seconds, state === "running" ? "auto" : state === "semi" ? "semi" : "idle");
    },
    readouts: () => [
      { label: "自动原理", value: "导气式（活塞长行程）" },
      { label: "闭锁方式", value: "枪机头回转 48°" },
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
      "导气式核心零件：导气箍（⌀4.4 导气孔）→ 活塞+活塞杆 → 枪机框；闭锁由枪机头双凸笋在节套闭锁窗回转 48° 完成。",
    ],
  },
  {
    id: "rpk",
    title: "RPK 轻机枪",
    category: "firearm",
    subtitle: "590mm 长枪管 + 两脚架 + 固定木托 · 导气式 + 枪机回转闭锁",
    milestone: "G-3",
    status: "ready",
    registry: makeRpkRegistry(),
    layouts: makeRpkLayouts(),
    builders: RPK_BUILDERS,
    motionParts: RPK_MOTION_PARTS,
    animate: (assembled, seconds, state) => {
      animateRpk(assembled, seconds, state === "running" ? "auto" : state === "semi" ? "semi" : "idle");
    },
    readouts: () => [
      { label: "自动原理", value: "导气式 + 双凸笋回转闭锁（AK 派生）" },
      { label: "枪管", value: "590mm，4 条右旋膛线，缠距 240mm" },
      { label: "供弹", value: "30 发弧形弹匣（7.62×39 六分件）" },
      { label: "两脚架", value: "260mm 折叠腿 + 独立脚座 + 回位簧" },
      { label: "零件", value: "69 定义 / 269 实例" },
    ],
    states: [
      { id: "idle", label: "架设静止", hint: "两脚架展开，满弹待击；可爆炸视图看长枪管与导气箍" },
      { id: "semi", label: "单发", hint: "AK 同源自动机：导气、回转开锁、抽壳、复进闭锁" },
      { id: "running", label: "连发", hint: "连续射击：弹壳堆积、枪口上跳、弹匣托弹板逐发上顶" },
      { id: "scanning", label: "穿模扫描", hint: "静态装配 / 动画扫掠检测进行中" },
    ],
    actions: [
      { id: "rpk-semi", group: "射击", label: "单发", kind: "machine-state", state: "semi" },
      { id: "rpk-auto", group: "射击", label: "连发", kind: "machine-state", state: "running" },
      { id: "rpk-idle", group: "射击", label: "停火", kind: "machine-state", state: "idle" },
      { id: "explode", group: "展示", label: "爆炸视图", kind: "view-toggle", view: "explode" },
      { id: "xray", group: "展示", label: "透视", kind: "view-toggle", view: "xray" },
      { id: "labels", group: "展示", label: "零件标注", kind: "view-toggle", view: "labels" },
      { id: "reset-view", group: "展示", label: "重置视角", kind: "reset-view" },
      { id: "scan-static", group: "自检", label: "静态重扫", kind: "scan", scanKind: "static" },
      { id: "scan-sweep", group: "自检", label: "动画扫掠", kind: "scan", scanKind: "sweep" },
    ],
    notes: [
      "RPK 是 AK-47 的轻机枪化：机匣、枪机、击发机构、弹匣与 AK 同源；枪管延长到 590mm，导气箍/准星/消焰器随之前移。",
      "两脚架卡箍环抱枪管，两条 260mm 矩形钢管腿可折叠；脚座橡胶/钢爪独立自位，腿内回位簧在展开到位后压紧锁定槽。",
      "固定木托加钢制托底板，表尺改为 100–1000m 长叶片；全枪 69 个定义 / 269 个实例，两脚架每根销轴和弹簧独立 partId。",
      "扫掠动画复用 AK 的导气+回转闭锁节点：AkRecoil/AkCarrier/AkBolt 等节点名不变，弹匣/弹药 ID 已改为 rpk.*。",
    ],
  },
  {
    id: "m134",
    title: "M134 加特林",
    category: "firearm",
    subtitle: "6 管旋转 · 每管独立枪机依次击发 · 外能源电机驱动",
    milestone: "M-G",
    status: "ready",
    registry: makeM134Registry(),
    layouts: makeM134Layouts(),
    builders: M134_BUILDERS,
    motionParts: M134_MOTION_PARTS,
    animate: (assembled, seconds, state) => {
      animateM134(assembled, seconds, state === "running" ? "auto" : state === "semi" ? "semi" : "idle");
    },
    readouts: () => [
      { label: "自动原理", value: "转管式（外能源电机）" },
      { label: "枪管数", value: "6 根（分布半径 32mm）" },
      { label: "枪机", value: "6 套独立（凸轮槽驱动往复）" },
      { label: "转子转速", value: "300 rpm（演示）" },
      { label: "理论射速", value: "1800 发/分（真机 6000）" },
      { label: "弹药", value: "7.62×51 NATO（六分件）×24 链上" },
      { label: "零件", value: "35 定义 / 306 实例" },
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
      "枪口焰只在击发位（正上方那根枪管）闪——与 AK/M60/M2HB 的「每发必闪」不同。",
      "弹壳瀑布：6 管轮流抛壳，从左侧抛壳口连续抛出（14 槽弹壳池循环）。",
      "细部零件：每套枪机的枪机框、击针、抽壳钩、导销、复进簧、闭锁凸榫、滚轮/滚轮销、抽壳钩簧；每根枪管的固定螺帽、套管、准星、枪口螺帽、枪口冠、独立膛线；减速大齿轮 36 齿独立成实例。35 定义 / 306 实例。",
      "弹链由 16 节增至 24 节；24 组弹/链节各 6 个 partId，动画时逐发步进，枪机子件跟随各自枪机的公转与凸轮往复。",
    ],
  },
  {
    id: "carrier",
    title: "福建舰 · 电磁弹射航母",
    category: "ship",
    subtitle: "1:8 · 电磁弹射 / 拦阻降落 / 相控阵 / 1130 近防 / 核动力",
    milestone: "CV-1",
    status: "ready",
    registry: makeCarrierRegistry(),
    layouts: CARRIER_LAYOUTS,
    builders: carrierBuilders,
    animate: animateCarrier,
    framingBounds: carrierBounds,
    // 编辑数据是 1:8；场景统一为 1 单位 = 1 米：40×7.9=316m，9.6×7.9≈76m。
    presentationScale: [7.9, 7.9, 7.9],
    animatedStates: [...CARRIER_ANIMATED_STATES],
    cameras: ["orbit", "bridge", "cic", "crew", "crew_berth", "crew_mess", "workshop", "fuel", "engine_room", "reactor_room", "magazine", "hangar", "cockpit", "flight"],
    states: [
      ...CARRIER_STATE_LABELS.map((state) => ({ id: state.id as string, label: state.label, hint: state.hint })),
      { id: "scanning", label: "穿模扫描", hint: "静态装配 / 动画扫掠检测进行中" },
    ],
    actions: [
      { id: "cv-engine", group: "动力", label: "动力运转", kind: "machine-state", state: "engine" },
      { id: "cv-flight", group: "航空", label: "弹射/拦阻闭环", kind: "machine-state", state: "flight_ops" },
      { id: "cv-hangar", group: "机库", label: "机库作业", kind: "machine-state", state: "hangar" },
      { id: "cv-ciws", group: "武器", label: "近防拦截", kind: "machine-state", state: "ciws" },
      { id: "cv-idle", group: "机构", label: "系泊检查", kind: "machine-state", state: "idle" },
      { id: "cv-cam-bridge", group: "内部视角", label: "航海舰桥", kind: "camera", mode: "bridge" },
      { id: "cv-cam-cic", group: "内部视角", label: "战斗情报中心", kind: "camera", mode: "cic" },
      { id: "cv-cam-crew", group: "内部视角", label: "生活区走廊", kind: "camera", mode: "crew" },
      { id: "cv-cam-crew-berth", group: "内部视角", label: "水兵住舱", kind: "camera", mode: "crew_berth" },
      { id: "cv-cam-crew-mess", group: "内部视角", label: "餐厅/厨房", kind: "camera", mode: "crew_mess" },
      { id: "cv-cam-workshop", group: "内部视角", label: "维修车间", kind: "camera", mode: "workshop" },
      { id: "cv-cam-fuel", group: "内部视角", label: "加油作业", kind: "camera", mode: "fuel" },
      { id: "cv-cam-engine", group: "内部视角", label: "机舱", kind: "camera", mode: "engine_room" },
      { id: "cv-cam-reactor", group: "内部视角", label: "反应堆舱", kind: "camera", mode: "reactor_room" },
      { id: "cv-cam-magazine", group: "内部视角", label: "弹药库", kind: "camera", mode: "magazine" },
      { id: "cv-cam-hangar", group: "内部视角", label: "机库", kind: "camera", mode: "hangar" },
      { id: "cv-cam-cockpit", group: "内部视角", label: "舰载机座舱", kind: "camera", mode: "cockpit" },
      { id: "cv-cam-flight", group: "内部视角", label: "跟拍舰载机", kind: "camera", mode: "flight" },
      { id: "cv-walk", group: "第一人称", label: "甲板自由漫游", kind: "camera", mode: "walk" },
      { id: "cv-aircraft-closeup", group: "航空", label: "舰载机特写", kind: "focus-node", node: "CV_Aircraft", offset: [0, 4, 0], radius: 14 },
      { id: "cv-catapult-closeup", group: "航空", label: "电磁弹射器", kind: "focus-node", node: "CV_Shuttle", offset: [0, 5, -3], radius: 22 },
      { id: "cv-ordnance", group: "武器", label: "甲板挂弹/弹药升降机", kind: "focus-node", node: "CV_OrdnanceStage", offset: [2, 4, 6], radius: 7 },
      { id: "cv-explode", group: "展示", label: "爆炸视图", kind: "view-toggle", view: "explode" },
      { id: "cv-xray", group: "展示", label: "透视", kind: "view-toggle", view: "xray" },
      { id: "cv-labels", group: "展示", label: "零件标注", kind: "view-toggle", view: "labels" },
      { id: "cv-reset", group: "展示", label: "重置视角", kind: "reset-view" },
      { id: "cv-scan-static", group: "自检", label: "静态重扫", kind: "scan", scanKind: "static" },
      { id: "cv-scan-sweep", group: "自检", label: "动画扫掠", kind: "scan", scanKind: "sweep" },
    ],
    notes: [
      "福建舰 1:8 展示尺度：舰体 40m、飞行甲板 9.6m；真实约 320m×78m。",
      "核心闭环：舰载机 30s 循环——折叠翼展开 → 滑行到 2 号弹射位 → 挡焰板升起 → 电磁弹射滑跑 → 离舰爬升 → 航线回转 → 放下尾钩进近 → 钩住第 2 道拦阻索 → 减速停住 → 折叠翼系留。",
      "动力：压水堆 8 组燃料组件（16 根棒/组件）/控制棒驱动/蒸汽发生器/一回路主泵 → 高低压蒸汽轮机 → 减速齿轮 → 双轴双桨；红区剖面可看堆芯。",
      "舰岛：三层舰桥 + 四面固定相控阵（8×8 T/R 单元/面）+ 旋转搜索雷达 + 1130 近防炮（11 管/11 枪机）。",
      "甲板：3 条电磁弹射器（定子/线圈/水冷/飞轮储能）、4 道拦阻索（左右半索+滑轮+液压拦阻机）、2 部舷侧升降机、系留点/边灯/标线。",
      "电磁弹射可视化：甲板三车道带白边线/铜中心轨/起止线/待发滑梭/挡焰板；甲板下有直线电机隧道、反应轨、水冷主管、变流柜、飞轮储能、脉冲电容和母线铜排。点「电磁弹射器」聚焦，再开「透视」即可看甲板下机构。",
      "斜角着舰区与弹射器共享同一片飞行甲板：着舰跑道斜穿甲板中后部，腰部 3 号弹射器与着舰区在平面上交叉，这是真实航母的布置；起降按作业阶段错开，并非模型错误。舰艏直通起飞区已前移到着舰区前方，俯视不再出现两条浅灰跑道叠在一起。",
      "第一人称漫游：点「甲板自由漫游」后点击画面锁定鼠标，WASD 走动、Shift 冲刺、空格跳、F 交互、Esc 释放鼠标。飞行甲板→升降机/弹药升降机可下机库/弹药库；机库防火门可逐扇开合；艉部水密门进机舱、再进反应堆舱；艏部水密门下生活区；舰岛进航海舰桥/CIC；停放舰载机可爬上去；挡焰板与应急拦阻网可现场升降。",
    ],
  },
  {
    id: "type055",
    title: "055 型驱逐舰 · 南昌舰",
    category: "ship",
    subtitle: "180m · 112 单元 VLS · 346B 四面阵 · 130mm 主炮 · COGAG 四燃双轴",
    milestone: "DDG-1",
    status: "ready",
    registry: makeType055Registry(),
    layouts: makeType055Layouts(),
    builders: TYPE055_BUILDERS,
    animate: animateType055,
    presentationScale: [1, 1, 1],
    animatedStates: [...TYPE055_ANIMATED_STATES],
    cameras: ["orbit", "bridge", "cic", "crew", "crew_berth", "crew_mess", "workshop", "fuel", "engine_room", "hangar", "magazine"],
    states: [
      ...TYPE055_STATE_LABELS.map((state) => ({ ...state })),
      { id: "scanning", label: "穿模扫描", hint: "静态装配 / 动画扫掠检测进行中" },
    ],
    actions: [
      { id: "ddg-engine", group: "动力", label: "COGAG 运转", kind: "machine-state", state: "engine" },
      { id: "ddg-weapons", group: "武器", label: "主炮/近防跟踪", kind: "machine-state", state: "weapons" },
      { id: "ddg-ciws-fire", group: "武器", label: "1130 近防拦截", kind: "machine-state", state: "ciws" },
      { id: "ddg-launch", group: "武器", label: "VLS 齐射", kind: "machine-state", state: "launch" },
      { id: "ddg-aviation", group: "航空", label: "机库/旋翼作业", kind: "machine-state", state: "aviation" },
      { id: "ddg-idle", group: "机构", label: "系泊检查", kind: "machine-state", state: "idle" },
      { id: "ddg-vls", group: "武器", label: "112 单元 VLS", kind: "focus-node", node: "CV_055_VlsHatch", offset: [0, 8, 6], radius: 38 },
      { id: "ddg-radar", group: "雷达", label: "346B 相控阵", kind: "focus-node", node: "CV_055_Radar", offset: [0, 8, 18], radius: 32 },
      { id: "ddg-gun", group: "武器", label: "130mm 主炮", kind: "focus-node", node: "CV_055_Gun", offset: [0, 6, 14], radius: 16 },
      { id: "ddg-ciws", group: "武器", label: "1130 近防炮", kind: "focus-node", node: "CV_055_Ciws_fwd", offset: [0, 4, 12], radius: 9 },
      { id: "ddg-crew", group: "内部视角", label: "生活区走廊", kind: "camera", mode: "crew" },
      { id: "ddg-crew-berth", group: "内部视角", label: "水兵住舱", kind: "camera", mode: "crew_berth" },
      { id: "ddg-crew-mess", group: "内部视角", label: "餐厅/厨房", kind: "camera", mode: "crew_mess" },
      { id: "ddg-cam-workshop", group: "内部视角", label: "维修车间", kind: "camera", mode: "workshop" },
      { id: "ddg-cam-fuel", group: "内部视角", label: "加油作业", kind: "camera", mode: "fuel" },
      { id: "ddg-walk", group: "第一人称", label: "全舰自由漫游", kind: "camera", mode: "walk" },
      { id: "ddg-bow", group: "舰体", label: "艏部球鼻艏", kind: "focus-node", node: "CV_055_Radar", offset: [0, -14, 44], radius: 26 },
      { id: "explode", group: "展示", label: "爆炸视图", kind: "view-toggle", view: "explode" },
      { id: "xray", group: "展示", label: "透视", kind: "view-toggle", view: "xray" },
      { id: "labels", group: "展示", label: "零件标注", kind: "view-toggle", view: "labels" },
      { id: "reset-view", group: "展示", label: "重置视角", kind: "reset-view" },
      { id: "scan-static", group: "自检", label: "静态重扫", kind: "scan", scanKind: "static" },
      { id: "scan-sweep", group: "自检", label: "动画扫掠", kind: "scan", scanKind: "sweep" },
    ],
    readouts: () => [
      { label: "舰长", value: "约 180m" },
      { label: "舷宽", value: "约 20m（水线）" },
      { label: "吃水", value: "约 6.6m" },
      { label: "VLS", value: "112 单元 · 850mm × 9m · 冷热共架" },
      { label: "动力", value: "4×QC-280 28MW / 112MW · 双轴 CPP" },
      { label: "航空", value: "直-20 ×3（甲板 1 + 机库 2）" },
    ],
    notes: [
      "055 的灵魂是 112 个通用垂直发射单元：前甲板 8×8=64、后部 8×6=48，冷热共架兼容海红旗/鹰击-21。",
      "346B 四面阵集成在一体化隐身桅杆/上建里；舰体水线以上舷侧内倾 18%，降低雷达反射。",
      "本版先立舰体/动力/112 VLS/346B/130mm/1130/双机库；直-20 与冷热发射流程在下一轮补齐。",
    ],
  },
  {
    id: "j20",
    title: "歼-20",
    category: "aircraft",
    subtitle: "M-F：主承力框 + 弹舱滑轨",
    milestone: "M-F",
    status: "planned",
  },
];

// 枪械按自动原理顺序展示：栓动 → 自由枪机 → 导气/回转闭锁 → 轻机枪 →
// 通用机枪 → 枪管短后坐重机枪 → 转管。只重排这 7 个 ready 枪械，
// 不改变坦克/飞机等其它条目的相对位置。
const GUN_ORDER = ["type38", "bison", "ak47", "rpk", "m60", "m2hb", "m134"];
CATALOG.sort((a, b) => {
  const ia = GUN_ORDER.indexOf(a.id);
  const ib = GUN_ORDER.indexOf(b.id);
  if (ia >= 0 && ib >= 0) return ia - ib;
  return 0;
});

export function findModel(modelId: string): StageModel {
  const found = CATALOG.find((model) => model.id === modelId);
  if (!found) throw new Error(`catalog：未知模型 "${modelId}"`);
  return found;
}

/** 已交付（可加载）的模型。 */
export const READY_MODELS = CATALOG.filter((model) => model.status === "ready");
