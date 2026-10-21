import type { MaterialSpec } from "../kernel/textures";

// ============================================================================
// registry/types —— 零件化注册表数据格式（基线见 docs/零件化建模框架.md 第 4 节）
//
// 铁律：零件位置由 Mate 关系 + 单一真值源 constants 派生，禁止手写孤立字面量坐标。
// 零件 ID：<model>.<assembly>.<part>[<index>]；重复件必须实例化并带索引。
// ============================================================================

/** 构建层（自内向外构建法，见总体设计第 5 节）。 */
export type BuildLayer = 1 | 2 | 3 | 4 | 5;

/** 数值，或引用 constants 的表达式（如 "HULL_FRONT-0.05"、"TRACK_PATH_LEN/96"）。 */
export type Expr = number | string;
export type ExprVec3 = [Expr, Expr, Expr];

export type Axis = "x" | "y" | "z";

/**
 * 锚点：目标零件包围盒上的定位点。token 顺序无关（"top-front" === "front-top"），
 * 允许的 token：center / top / bottom / front / back / left / right。
 * 坐标约定：+X 右、+Y 上、+Z 前（车头方向）。
 */
export type Anchor = string;

/** 几何声明。数值均为米制；自定义 kit 由模型注册（见 assembler 的 builders 选项）。 */
/**
 * kit 参数：可以是数 / 字符串 / 布尔，也可以是混合数组或结构化对象
 * （如歧管 runners: [{from: [x, "CONST", 0], to, r, bend}, …]）。递归定义，允许嵌套。
 */
export type KitParam = number | string | boolean | KitParam[] | { [key: string]: KitParam };
export type GeometrySpec = (
  | { type: "box"; w: Expr; h: Expr; d: Expr; bevel?: Expr }
  | { type: "plate"; w: Expr; h: Expr; t?: Expr; bevel?: Expr }
  | { type: "cylinder"; r: Expr; h: Expr; rTop?: Expr; segments?: number; bevel?: Expr }
  | { type: "tube"; rOuter: Expr; rInner: Expr; h: Expr; segments?: number }
  | { type: "sphere"; r: Expr; segments?: number }
  | { type: "lathe"; profile: [Expr, Expr][]; segments?: number }
  | { type: "polygon"; points: [Expr, Expr][]; depth: Expr; bevel?: Expr }
  | { type: "rivets"; count: number; spacing: Expr; radius?: Expr }
  | { type: "boltCircle"; count: number; radius: Expr; boltR?: Expr; boltH?: Expr }
  | { type: "louver"; count: number; w: Expr; h: Expr; slantDeg?: number; t?: Expr }
  | { type: "weld"; from: ExprVec3; to: ExprVec3; radius?: Expr; seed?: number }
  | { type: "merge"; parts: Array<GeometrySpec & { at?: ExprVec3 }> }
  | { type: "kit"; kit: string; params?: Record<string, KitParam> }
) & {
  /**
   * 几何镜像：声明后整块几何沿该轴取反（位置+法线+绕序），
   * 用于「同一套零件声明生成左右对称件」——比复制一份坐标更不容易漂。
   * 位置/旋转仍由零件自己的 at/rot 负责，这里只处理几何本体。
   */
  mirror?: "x" | "z";
};

/** 装配关系：位置从被引用对象派生，改常量时自动传播。 */
export type MateSpec =
  /** 相对所属节点的绝对定位（旋转中心原点）。 */
  | { type: "absolute"; position?: ExprVec3; rotation?: ExprVec3 }
  /** 贴合到目标零件的锚点（默认 center）再叠加偏移。 */
  | { type: "anchor"; to: string; anchor?: Anchor; offset?: ExprVec3; rotation?: ExprVec3 }
  /** 与目标零件同轴（沿给定轴对齐），偏移的该轴分量被忽略。 */
  | { type: "coaxial"; to: string; axis: Axis; offset?: ExprVec3; rotation?: ExprVec3 };

/** 骨骼节点：可动件的动画挂载点（动画只驱动节点）。 */
export interface NodeDef {
  name: string;
  parent: string;
  /** 相对父节点的装配原点（旋转/平移中心），默认 [0,0,0]。 */
  pivot?: ExprVec3;
  /**
   * 节点静止姿态旋转（度，XYZ 欧拉）。缺省无旋转。
   * 用于「静止时就已经有倾角」的机构（如 V 型发动机的活塞/连杆列倾角）：
   * 静态装配检测看到的就是这个姿态，动画在此基础上继续驱动。
   */
  rest_rotation?: ExprVec3;
  /** 运动类型；缺省表示静态装配分组节点。 */
  motion?: "rotate" | "translate" | "scalar";
  axis?: Axis;
  note?: string;
}

/** 总成：零件树的顶层分组 + 爆炸图方向。 */
export interface AssemblyDef {
  id: string;
  name_cn: string;
  name_en: string;
  /** 爆炸图方向（不必归一化，视图按比例缩放）。 */
  explode?: ExprVec3;
}

/** 战损三态：完好 / 破损（凹陷+裂痕）/ 破碎（缺块+断面露内部结构）。 */
export type DamageState = "intact" | "damaged" | "broken";

/**
 * 预制战损变体（只对单实例零件生效）：
 *   damaged = 完好几何之上叠加的凹陷/裂痕层；
 *   broken  = 替换几何：缺块 + 撕裂断面 + 内部骨架/管路（不是黑窟窿）。
 * 碰撞/支撑检测始终按完好几何算——变体是展示层。
 */
export interface DamageVariants {
  damaged?: GeometrySpec;
  broken?: GeometrySpec;
}

/** 零件声明。instances > 1 时必须 indexed；双侧件用 dual 展开为 <id>_l / <id>_r。 */
export interface PartDefinition {
  id: string;
  name_cn: string;
  name_en: string;
  assembly: string;
  build_layer: BuildLayer;
  build_order: number;
  geometry: GeometrySpec;
  material: string;
  node?: string;
  mate?: MateSpec;
  instances?: number;
  indexed?: boolean;
  /** 可动重复件：实例 → 节点映射（长度 = instances）。 */
  instance_nodes?: string[];
  /** 实例分布函数名（模型代码在 instanceLayouts 中注册；缺省全部叠加在零件原点）。 */
  instance_layout?: string;
  /** 双侧件：自动展开为左右两件（右侧 x 镜像），命名 <id>_l / <id>_r。 */
  dual?: boolean;
  /** 穿模时的人工提示（缺省由检测器按 mate/constants 自动生成）。 */
  hint?: string;
  /**
   * 自由标签。支撑检测（solver/support）默认豁免 `fx`（特效件）与 `floating`（飞行件）——
   * 这两类本来就不该有支撑邻居；其余标签供模型/检测扩展使用。
   */
  tags?: string[];
  /** 预制战损变体（damaged / broken）；需要“破碎件三态”的零件才登记。 */
  damage?: DamageVariants;
  /** 尺寸/资料的出处注记。 */
  source?: string;
}

/**
 * 构造性接触豁免规则（白名单）。
 *
 * 装配关系本身就会让零件互相咬合/贴合：轴颈坐在轴瓦里、缸套过盈压入镗孔、
 * 剖分面两边合起来才是一个整圆、管端插进铸件里、皮带包在带轮上……
 * 这些 0.5mm 级（检测阈值下限）的报告是机器本身，不是缺陷。
 * 真缺陷是「位置/尺寸算错导致本不该接触的零件叠在一起」——所以要修，不能豁免。
 * 规则按「零件对」给（同族一条），不按深度一刀切：深度守门见 whitelist.ts。
 */
export interface ExpectedContactRule {
  /** 豁免族：面板分组的审计单元，截图名对应 docs/qa/whitelist/<family>.png。 */
  family: string;
  /** 零件 id 模式：精确 id，或以 `*` 结尾的前缀（如 `tiger.valvetrain.camshaft_*`）。 */
  a: string;
  /** 同 a；匹配时忽略实例下标 `[n]`，A/B 顺序无关。 */
  b: string;
  /** 为什么这是构造性接触（写清物理装配语义，供面板与 QA 截图核对）。 */
  reason: string;
  /** 覆盖深度守门（mm）。省略 = 用 whitelist.ts 的 DEFAULT_MAX_DEPTH_MM。 */
  maxDepthMm?: number;
  /** 允许豁免 displaced 形态（构造性配合的咬合常被判成 displaced）。 */
  allowDisplaced?: boolean;
  /**
   * 允许豁免 suspect 形态（成团 / 超长横穿交线）。
   *
   * 默认**不开**：suspect 一律进未豁免区人工审（框架纪律）。
   * 只有当这一族的接触在物理上必然是「长交线」时才显式打开——
   * 例如真实网格按蒙皮切分后的接缝（两块骨头沿一条长缝贴合），
   * 或耳环整体嵌进骨头（嵌入面上的交线天然很长）。
   */
  allowSuspect?: boolean;
}

export interface ModelRegistry {
  model: string;
  title: string;
  subtitle?: string;
  /** 尺寸与资料的总体注记（写在生成器文件顶部注释块同源）。 */
  source_notes?: string;
  /** 单一真值源：所有零件位置由这里派生。 */
  constants: Record<string, Expr>;
  assemblies: AssemblyDef[];
  nodes: NodeDef[];
  materials: Record<string, MaterialSpec>;
  parts: PartDefinition[];
  /** 构造性接触白名单（缺省 = 不豁免任何报告）。 */
  expectedContacts?: ExpectedContactRule[];
}

/** 展开后的零件（dual 展开、instances 规范化）。 */
export interface ExpandedPart {
  def: PartDefinition;
  /** 展开后的最终 id（含 _l/_r，不含实例下标）。 */
  id: string;
  /** true 表示这是镜像的右件。 */
  mirrored: boolean;
}

/** 实例级零件引用（穿模报告与零件树使用）：`tiger.track.link[42]`。 */
export function instanceRef(partId: string, index: number | null): string {
  return index === null ? partId : `${partId}[${index}]`;
}

/** 解析 `id[index]` → { partId, index }。 */
export function parseInstanceRef(ref: string): { partId: string; index: number | null } {
  const match = /^(.*)\[(\d+)\]$/.exec(ref);
  if (!match) return { partId: ref, index: null };
  return { partId: match[1], index: Number(match[2]) };
}
