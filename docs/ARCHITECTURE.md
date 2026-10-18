# 架构说明 · machine-stage

> 本文描述 M-A 交付后的真实实现（代码为准，文档随架构变更同步）。
> 需求与验收口径来源：`docs/展示台项目总体设计.md`、`docs/零件化建模框架.md`。

## 1. 目标与不变量

展示台要做的事只有一件：**把一台真实机械从里到外装起来，并且装错了能被机器指出来。**

由此推出四条不可协商的不变量：

| 不变量            | 含义                                                               | 违反时的表现                           |
| ----------------- | ------------------------------------------------------------------ | -------------------------------------- |
| **单一真值源**    | 所有尺寸/位置由注册表 `constants` 派生；代码里不出现孤立坐标字面量 | 改一个常量，别处对不上                 |
| **禁止匿名 mesh** | 每个 mesh 都能回溯到 `<model>.<assembly>.<part>[index]`            | 穿模报告无法定位到"该改哪里"           |
| **实例级报告**    | 报告 `a` / `b` 一定带实例下标（`tiger.track.link[42]`）            | 整车 96 节履带出问题时只知道"履带撞了" |
| **自内向外**      | L1 核心机构 → L5 表面附件，一层零穿模才进下一层                    | 表面件盖住内部错误，返工成本指数上升   |

## 2. 分层

```
┌─────────────────────────────────────────────────────────────────────┐
│ src/app —— 展示台 UI（只做展示与调度，不含模型尺寸）                   │
│   catalog.ts       模型清单 + 声明式动作/状态/参数范围                │
│   state/stageStore 单一状态源（zustand）：构建进度 / 选中 / 报告 / 视图 │
│   three/StageCanvas 注册表 → AssembledModel → three 场景（构建-释放）  │
│   three/pose.ts    爆炸 / 透视 / 高亮等"姿态层"（可一键还原）          │
│   components/*     三栏面板（模型库 / 零件树 / 视口 / 动作 / 参数）     │
├─────────────────────────────────────────────────────────────────────┤
│ solver —— 穿模检测（纯计算，无 UI 依赖，node 环境可测）                │
│   report.ts   报告格式、自动 hint、排序与汇总                         │
│   detect.ts   静态检测 / 动画扫掠检测（AABB 粗检 → BVH 精检）          │
├─────────────────────────────────────────────────────────────────────┤
│ assembler —— 注册表 → 场景树（纯 three 对象图，可在无 DOM 环境跑）      │
│   assembler.ts  节点树 / dual 展开 / mate 拓扑解析 / 实例布局 / 构建阈值│
│   geometry.ts   GeometrySpec → BufferGeometry（声明式几何语言）        │
├─────────────────────────────────────────────────────────────────────┤
│ registry —— 数据格式（无渲染依赖）                                    │
│   types.ts       BuildLayer / MateSpec / PartDefinition / ModelRegistry│
│   expression.ts  常量表达式求值（拓扑排序 + 循环检测 + 名字校验）       │
│   validate.ts    注册表契约校验（测试与运行时使用）                    │
├─────────────────────────────────────────────────────────────────────┤
│ kernel —— 几何与贴图工具箱（从 fight-stage detailKit 衍生，见署名）    │
│   geometry.ts  倒角盒 / Lathe / 放样 / 铆钉 / 焊缝 / 镜像 / 抖动       │
│   textures.ts  程序化三联贴图 / 材质库（PBR 参数集中定义）             │
└─────────────────────────────────────────────────────────────────────┘
```

**依赖方向单向向下**：`app → solver → assembler → registry → kernel`。任何反向 import 都是架构违规。

## 3. 数据流

### 3.1 装配（注册表 → 场景）

```
ModelRegistry ──resolveConstants──▶ constants(Record<string, number>)
      │
      ├─ createNode(递归建节点树, pivot → nodeRest 矩阵)
      ├─ dual 展开：<id> → <id>_l / <id>_r（右件镜像）
      ├─ 按 build_order 排序 → 拓扑解析 mate（DFS，检测循环引用）
      │      absolute → 所属节点局部（无 node 即模型原点）
      │      anchor   → 目标包围盒锚点 + offset（模型空间）→ 折算到节点局部
      │      coaxial  → 目标包围盒中心 + offset，忽略轴分量
      └─ 生成几何（按镜像缓存）→ Mesh / InstancedMesh → root
```

产出 `AssembledModel`：`nodes` / `parts`（`PartHandle[]`）/ `partsByAssembly` / `constants`，以及
`resetNodes` / `syncInstances` / `instanceMatrix` / `setBuildThreshold` / `partBounds` / `dispose`。

**实例布局语义**（容易踩坑，定案如下）：

| 条件                | `instance_layout` 返回矩阵的坐标系 | 实例静止位姿                    |
| ------------------- | ---------------------------------- | ------------------------------- |
| 有 `instance_nodes` | 该节点局部（**mate 不参与**）      | `nodeRest × layout`             |
| 无 `instance_nodes` | 与 mate 同一个空间（零件装配位）   | `nodeRest × mateLocal × layout` |
| 两者都没有          | —                                  | 全部叠加在零件装配位（并告警）  |

有 `instance_nodes` 的实例属于"骑在节点上"：每帧 `syncInstances()` 用节点世界矩阵重写实例矩阵。

### 3.2 每帧

`resetNodes() → 模型 animate(t) 只驱动节点 → syncInstances()`

造型由**节点**承担，实例矩阵由框架同步 —— 模型代码永远不直接写 mesh 位置。这条纪律让"爆炸/透视/构建回放"与"动画"互不污染。

### 3.3 状态（UI）

`stageStore` 是全 UI 唯一状态源：`modelId / overrides / rebuildToken`（重建）、`buildIndex`（构建回放刻度）、
`selectedPart / hoveredPart`、`reports / scanPhase / scanKind / scanMs`、`views / machineState / focus / home / notice`。

- 视口只负责"注册表 + layouts → AssembledModel → 场景"，其余组件只读 store。
- `attach(assembled)` 后自动跑一次静态检测（保证任何时候看到的报告都是当前装配的）。
- 参数面板写 `overrides`，`rebuildToken` 自增触发整模重建（几何按 `constants` 派生，改参数即改真相）。

## 4. 穿模检测

三段式（`solver/detect.ts`）：

1. **AABB 粗检**：逐实例包围盒两两相交（可给 `broadphaseMarginM` 余量）。
2. **BVH 精检**：`three-mesh-bvh` 的 `bvhcast` + `ExtendedTriangle.intersectsTriangle`，逐三角形判定真实相交。
3. **深度估计**（取双方最大可信值）：
   - 顶点 / 面心 / 棱中点采样 → 奇偶射线法判定"在对方实体内部"（3 方向多数投票防退化）→ `closestPointToPoint` 得到到对方表面的最近距离；
   - 退化情形（同尺寸共面、交叉细条）用 AABB 交叠盒最小边长兜底，报告 `estimated: true`。

**判定阈值** `minDepthM`（默认 0.5mm）：小于阈值视作装配接触，不报告。
**早退预算** `analysisBudget`（默认 120 对）：超出的对只判定相交（`depth = -1`，报告里回填为阈值并标 `estimated`）。

**动画扫掠** `detectSweep`：按 `fps`（默认 30）采样 `duration` 秒。
第 1 遍记录每个实例的扫掠包围盒与"是否动过"；候选对 = 扫掠盒相交 **且** 至少一方在动；
第 2 遍逐帧检测，同一零件对只保留首次命中的帧号（报告里 `frame` 即"哪一帧撞的"）。

报告格式（`solver/report.ts`）：

```ts
{ type: "clipping", phase: "static" | "animation" | "param_scan",
  a: "tiger.track.link[42]", b: "tiger.suspension.roadwheel[7]",
  depth_mm: 1.02, point: [x, y, z], frame: null,
  severity: "error", hint: "…检查常量 SPAWN_X 与 WHEEL_R 派生的位置/尺寸…", aLayer, bLayer, estimated? }
```

`hint` 自动生成：优先零件声明里的手写 `hint`，否则收集双方几何/mate 引用到的常量名，给出"该改哪个常量"。

## 5. 构建回放

`build_order` 是全局单调整数；构建滑杆的刻度 = 注册表中出现的 `build_order` 去重升序数组。
`setBuildThreshold(threshold)` 只切换 `visible`（不改装配、不重建），因此拖滑杆是零成本回放：

- `0` → `-1`：全部隐藏（空台面）
- `k`：只显示 `build_order <= orders[k-1]` 的零件
- 拉满 → `null`（全显示）

`build_layer`（1–5）是**语义层**（核心机构 → 表面附件），用于层验收过滤与零件树分组；`build_order` 是**件级顺序**，用于回放。

## 6. 视觉与性能纪律

- **程序化一切**：无外部模型、无 HDR 资产。环境光用 `<Environment>` + `<Lightformer>` 搭三柔光箱 + 顶部条光。
- **生产级渲染**：`ACESFilmicToneMapping` + `SSAO`（`@react-three/postprocessing`）；阴影用柔和 PCF。
- **性能以生产构建的浏览器测量为准**（`dist/` + `npm run preview`），目标：拖动/缩放反馈 ≈ 30ms。
- **释放纪律**：几何/材质由 `AssembledModel.dispose()` 统一释放，在**构建 effect 的 cleanup** 里调用（不是子组件 effect —— StrictMode 下会误杀在用模型）。
- **R3F 换对象**：`<primitive>` 换绑不同 object 不会重挂，用自增 `seq` 作 `key` 强制重挂。

## 7. 扩展一台新机（M-B 起的标准动作）

1. **写生成器**：`src/three/parts/registry/<model>.ts` 导出 `make<Model>Registry(): ModelRegistry`。
   - 顶部注释块写尺寸出处（公开资料近似值 + 来源）。
   - 所有数字进 `constants`；零件只引用常量与 mate。
   - 自定义几何用 `geometry: { type: "kit", kit: "<name>", params }`，并在 `builders` 里注册实现。
   - 重复件用 `instances` + `instance_layout`；可动重复件加 `instance_nodes`。
   - 双侧件用 `dual`（自动 `_l` / `_r`），不要手写两遍。
2. **写 layouts**（如需）：`export const <model>Layouts: Record<string, InstanceLayout>`。
3. **登记 catalog**：`src/app/catalog.ts` 里把 `status` 改 `ready`，补 `registry / layouts / animate / readouts / actions / states / paramRanges`。
   - 主角数字必须由求解器或常量算出（`readouts`），不能是写死的展示文案。
4. **画一层，验一层**：先 L1 核心机构 → 零件树 + 实例级报告为空 → 动画扫掠 ≥30fps 无穿模 → 滑杆拖到本层"模型立得住" → 截图存 `docs/screenshots/`。
5. **加测试**：至少一条注册表契约测试（`validateRegistry`）+ 一条"该层零穿模"的检测测试。

## 8. 测试策略

| 范围                  | 环境  | 覆盖点                                                     |
| --------------------- | ----- | ---------------------------------------------------------- |
| `registry/expression` | node  | 常量依赖排序、循环检测、未定义常量报错、表达式语法         |
| `assembler`           | node  | 节点树、dual 镜像、mate 三种语义、实例布局、构建阈值、释放 |
| `solver/detect`       | node  | 相交/相切/间隙判定、深度估计、扫掠帧号、过滤与预算         |
| `app/catalog`         | node  | 模型清单契约：id 唯一、ready 必有注册表、动作/状态引用合法 |
| `app/state`           | jsdom | store 动作闭环（构建刻度、参数重建、视图切换、扫描状态机） |
| `app/components`      | jsdom | 面板渲染与交互（滑杆、按钮、参数输入、报告浮层）           |

`src/app/**` 组件测试用文件级 docblock 声明环境：

```ts
// @vitest-environment jsdom
```

（vitest 默认 node 环境，否则报 `document is not defined`。）

浏览器端验收不写进单测：拖构建滑杆、注入重叠、跑扫掠、看穿模浮层，用真实浏览器截图确认（见 `docs/PROGRESS.md` 的验收证据）。
