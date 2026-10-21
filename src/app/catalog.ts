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
  makeKingJoeLowerLayouts,
  makeKingJoeLowerRegistry,
} from "@/three/parts/models/kingjoe-lower/registry";
import { kingjoeLowerBuilders } from "@/three/parts/models/kingjoe-lower/kits";
import { animateKingJoeLower, type KingJoeLowerState } from "@/three/parts/models/kingjoe-lower/motion";
import { animateKingJoeSkin, type KingJoeSkinState } from "@/three/parts/models/kingjoe-skin/motion";
import {
  animateTigerSuspension,
  TIGER_MOTION_PARTS,
  tigerDetachKeys,
  tigerDetachOffset,
  tigerInstanceLabel,
} from "@/three/parts/models/tiger/motion";

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
  /** 动画：只驱动节点，每帧调用前框架已 resetNodes。t 为秒；state 用于多形态导演。 */
  animate?: (assembled: AssembledModel, seconds: number, state?: string) => void;
  /** 纯展示比例（只缩放置换根节点，不改节点/动画/对接）；在包围盒与相机基准之前应用。 */
  presentationScale?: [number, number, number];
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
    id: "kingjoe",
    title: "金古桥 King Joe",
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
    subtitle: "578 源件 + 细节合并为 1 个 partId · 外观同真实网格分件",
    milestone: "M-G·R3.1",
    status: "ready",
    registry: makeKingJoeWholeRegistry(),
    builders: kingjoeWholeBuilders,
    states: [
      {
        id: "idle",
        label: "整体单件",
        hint: "整个角色是 1 个 partId；原三角形/UV/12 组材质保留，表面与真实网格分件合体态一致",
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
    readouts: (assembled) => [
      { label: "零件", value: `${assembled.parts.length} 件` },
      { label: "三角形", value: `${assembled.constants.TRIANGLES} 个` },
      { label: "合体高度", value: "6.618 m" },
      { label: "材质组", value: `${assembled.constants.MATERIAL_GROUPS} 组` },
    ],
    notes: [
      "表面来源：真实网格 459 个连通壳。肩筒每侧 66 片层叠装甲、右胸甲片等是源壳本身，不是新增件；单件后不再按装甲片逐个高亮，避免分件边缘看起来像刺。",
      "整机把 578 源件 + 21 个叠加细节的 15,248 个三角形原样合并为 1 个 partId；保留原 UV 与 12 组材质，不做焊接/布尔/体素重拓扑，所以外观与真实网格分件的合体态一致。",
      "这是单件外观体，不是水密实体：内部仍是源壳层叠。若要做水密实体/剖切，需要另行重拓扑并接受细节损失。",
      "分离/合体/怪光线在主卡「金古桥 King Joe」；578 分件查看在「真实网格分件」卡。",
      "版权：奥特曼 IP，个人参考，不做商用。",
    ],
  },
  {
    id: "kingjoelower",
    title: "金古桥 King Joe · 髋缝两体拆分",
    subtitle: "King Legs 腿体 ↔ 骨盆以上 · 4 组隐藏楔榫 · 分离/合体电弧 · 非平面自然接缝",
    milestone: "M-G·R3.2",
    status: "ready",
    registry: makeKingJoeLowerRegistry(),
    layouts: makeKingJoeLowerLayouts(),
    builders: kingjoeLowerBuilders,
    animatedStates: ["separating", "combining"],
    animate: (assembled, seconds, state) =>
      animateKingJoeLower(assembled, seconds, (state as KingJoeLowerState) ?? "idle"),
    states: [
      {
        id: "idle",
        label: "合体待机",
        hint: "髋鼓围住骨盆中柱；4 组楔榫/榫槽藏在髋腔与骨盆壳内，外观与整机单件一致",
      },
      {
        id: "separating",
        label: "下身分离",
        hint: "上半身沿 +Y 提起 1.3m；髋缝电弧拉长、拉断，下半身站在地面不动",
      },
      {
        id: "separated",
        label: "分离停放",
        hint: "楔榫完全退出槽底；下半身中央榫口/楔榫与上身骨盆中柱各自可见",
      },
      {
        id: "combining",
        label: "阻尼合体",
        hint: "上半身下降，最后一段髋缝电弧重新接通，锁死瞬间闪光",
      },
    ],
    actions: [
      { id: "kjl-separate", group: "髋缝", label: "下身分离", kind: "machine-state", state: "separating" },
      { id: "kjl-park", group: "髋缝", label: "分离停放", kind: "machine-state", state: "separated" },
      { id: "kjl-combine", group: "髋缝", label: "阻尼合体 + 电弧", kind: "machine-state", state: "combining" },
      { id: "kjl-idle", group: "髋缝", label: "合体待机", kind: "machine-state", state: "idle" },
      { id: "kjl-xray", group: "展示", label: "透视", kind: "view-toggle", view: "xray" },
      { id: "kjl-labels", group: "展示", label: "零件标注", kind: "view-toggle", view: "labels" },
      { id: "kjl-grid", group: "展示", label: "网格", kind: "view-toggle", view: "grid" },
      { id: "kjl-reset", group: "展示", label: "重置视角", kind: "reset-view" },
      { id: "kjl-scan-static", group: "自检", label: "静态重扫", kind: "scan", scanKind: "static" },
      { id: "kjl-scan-sweep", group: "自检", label: "动画扫掠", kind: "scan", scanKind: "sweep" },
    ],
    readouts: (assembled) => [
      { label: "零件", value: `${assembled.parts.length} 件` },
      { label: "皮肤三角", value: "15,248 个" },
      { label: "髋缝", value: "3.60 m（King Legs 分界）" },
      { label: "榫卯", value: "中央榫口 + 4 楔榫/槽" },
    ],
    notes: [
      "参考分体玩具：King Legs 腿体飞船是下半身（腿+髋鼓），上半身从骨盆开始；髋鼓整体留在下半身，骨盆中柱归上半身。",
      "分界不是平面切的：髋鼓围住骨盆中柱，中柱就是源结构自带的中央定位榫；髋腔口有中央榫口承座，髋缝另加 4 组楔榫（下半身）与 4 组榫槽（上半身骨盆内壁）。",
      "合体时榫头/榫槽藏在髋腔与骨盆壳内；分离时上半身沿 +Y 提起 1.3m，楔榫从槽底退出，下半身站在地面不动。",
      "动作：分离时电弧拉长、拉断；合体时上身下降，最后一段电弧重新接通并锁死闪光。电弧是场景 FX，不参与零件树与穿模检测。",
      "皮肤：下半身 1,510 三角 / 3 材质组，上半身 13,738 三角 / 12 材质组，合计 15,248 三角；内部不焊接/不布尔/不重拓扑。",
      "自检：合体态、分离终态、分离/合体全程未豁免穿模为 0、悬空为 0；只有藏在髋腔/骨盆壳内的榫件与源髋部互锁按带原因的深度白名单豁免。",
      "整机单件外观在「整体实心（单件）」卡；四体编队/分离/怪光线在主卡「金古桥 King Joe」。",
      "版权：奥特曼 IP；本工程仅个人参考，不做商用。",
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
