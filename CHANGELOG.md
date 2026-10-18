# 更新日志

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 与 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### 进行中

- **M-B**：虎式坦克 L1 —— Maybach HL230 V12 发动机（缸体 / 曲轴 / 活塞 / 双风扇）+ 求解器联动。

## [0.1.0] - 2026-10-18

**M-A · 框架底座**（首个可用版本）。展示台能加载一台模型、从里到外装起来、并把装配错误按实例报出来。

### 新增

- **零件化注册表**
  - 零件 ID 规范 `<model>.<assembly>.<part>[index]`；`BuildLayer 1–5` 语义分层 + `build_order` 件级顺序。
  - `constants` 单一真值源 + 表达式求值（拓扑排序、循环检测、未定义常量报错）。
  - 契约校验：id 唯一、命名规范、mate 引用存在、层/序合法。
- **装配器**
  - 节点树（`pivot` / `motion` / `axis`）、双侧件 `dual` 自动展开为 `_l` / `_r` 并镜像几何。
  - Mate 语义三种：`absolute`（节点局部）/ `anchor`（目标包围盒锚点 + 偏移）/ `coaxial`（同轴），DFS 拓扑解析。
  - 实例布局：`instance_layout` + 可选 `instance_nodes`（骑在节点上的重复件每帧同步矩阵）。
  - `setBuildThreshold` 构建回放、`partBounds`、统一 `dispose`。
- **声明式几何语言**：box / plate / cylinder / tube / sphere / lathe / polygon / rivets / boltCircle / louver / weld / merge / kit。
- **几何与贴图工具箱（kernel）**：倒角盒、Lathe 曲面、放样、铆钉阵列、焊缝、镜像、几何抖动；程序化三联贴图与 PBR 材质库（无外部资产）。
- **穿模检测器**
  - AABB 粗检 → three-mesh-bvh 三角形精检 → 深度估计（实体内部采样 + 退化情形 AABB 兜底）。
  - **实例级报告**：`a` / `b` 形如 `tiger.track.link[42]`，带 `depth_mm` / `point` / `frame` / `severity` / 自动 `hint`（指向该改哪个常量）。
  - 静态装配检测 + 动画扫掠检测（默认 30fps 采样，同一零件对只保留首次命中帧号）+ 预算早退与层过滤。
- **展示台 UI（三栏）**
  - 左：模型库 + 零件树（按总成/层分组）；中：视口 + 构建滑杆 + 穿模浮层；右：动作 / 状态机 / 参数面板。
  - 构建滑杆按 `build_order` 逐件回放（只切 `visible`，不重建）；点击零件树选中 + 高亮 + 相机飞行。
  - 视口：轨道相机、总成标签、爆炸视图、透视、重置视角；程序化 studio 环境（三柔光箱 + 顶部条光）、ACES 色调映射、SSAO。
  - 参数面板：可改常量写入 `overrides` 触发重建，派生值只读展示。
- **框架自检台**（M-A 验收场景，默认加载）：3 零件 / 2 实例，可注入 1mm 重叠 → 出现实例级报告 → 一键修复 → 报告清空。
- **工程**
  - Vite + React 19 + TypeScript + three.js 0.170 + @react-three/fiber/drei + Zustand；手写 CSS + design tokens。
  - 61 个单元测试（node + jsdom 双环境）；GitHub Actions CI（format:check / lint / typecheck / test / build）。
  - MIT 许可、三方署名（衍生几何工具箱）、Issue / PR 模板、README、架构说明、进度记录。

### 已知限制

- 穿模检测同步执行（自检台 ~10ms）；整车级模型计划移入 Web Worker。
- 高亮为零件级（实例级待 L2 履带/轮组接入时补齐）；构建滑杆未拖满时报告未标 stale。
- 带实心端盖的剖切按 `docs/MACHINE_STYLE.md §6` 实现，随 M-C 交付（不提供半成品按钮）。

<!-- 本地仓库尚未接入远程地址；接入后在版本标题上补 compare / release 链接。 -->
