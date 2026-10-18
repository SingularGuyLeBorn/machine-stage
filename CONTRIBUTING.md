# 参与开发

感谢参与。本项目的核心是**可验证**：每个零件都能追溯到名字与尺寸出处，每条穿模报告都能定位到实例。
提交前请确认你的改动没有破坏这两条性质。

## 环境

- Node ≥ 20（开发机用 24.x 验证）
- 无需任何 3D 资产：所有几何与贴图都是程序化生成的

```bash
npm install
npm run dev        # 开发服务器
```

## 门禁（提交前必须全绿）

```bash
npm run format:check   # Prettier
npm run lint           # ESLint
npm run typecheck      # tsc --noEmit
npm test               # vitest（node + jsdom）
npm run build          # 生产构建
```

CI（`.github/workflows/ci.yml`）会按同样顺序跑一遍。**不要提交只在单测里通过、浏览器里没跑过的 UI 改动**：
涉及视口/交互的改动，请在生产构建（`npm run build && npm run preview`）里真机确认一次。

## 代码约定

### 建模（最重要的部分）

新建模型或零件时，遵守 `docs/零件化建模框架.md` 与 `docs/展示台项目总体设计.md`：

1. **单一真值源**：所有尺寸写进注册表 `constants`；零件只引用常量名和 `mate`，代码里不出现孤立坐标字面量。
2. **命名**：`<model>.<assembly>.<part>[index]`，全小写下划线；重复件必须实例化并带索引，**禁止匿名 mesh 流水账**。
3. **尺寸必须来自真实资料**并在生成器文件顶部注释块注明来源（近似值即可，但要写清楚）。
4. **重复件**用 `instances` + `instance_layout`；可动重复件用 `instance_nodes`；
   双侧件用 `dual`（自动展开 `_l` / `_r`），不要手写两遍。
5. **曲面**用 `lathe` / 放样，不用低段数圆柱面硬顶；单件最小可见单元 ≥ 0.35m（`docs/MACHINE_STYLE.md §9`）。
6. **自内向外**：先 L1 核心机构，再包壳；一层零穿模才进下一层。

### 通用

- 注释用中文，与现有文件风格一致；模块顶部写清"这个文件负责什么"。
- 不在 UI 层复制模型尺寸：`src/app/**` 只能读 `AssembledModel.constants` 和注册表。
- 渲染纪律：动画只驱动**节点**，实例矩阵交给框架同步（`resetNodes → animate → syncInstances`）。
- 释放纪律：几何/材质在**构建 effect 的 cleanup** 里统一 `dispose()`（放到子组件 effect 里会被 StrictMode 误杀）。
- `[OM-FREEPLAY]` 注释用于标记"非资料明示的产品默认值"，不要用它掩盖模型事实。

### 测试

| 范围                                | 环境         | 写法                                                          |
| ----------------------------------- | ------------ | ------------------------------------------------------------- |
| `registry` / `assembler` / `solver` | node（默认） | 纯函数式断言，几何可直接构造 `BufferGeometry`                 |
| `src/app/**` 组件                   | jsdom        | 文件首行加 `// @vitest-environment jsdom`（vitest 默认 node） |

- 新增模型至少带一条注册表契约测试（`validateRegistry`）+ 一条"该层零穿模"的检测测试。
- 视觉/帧率不写单测：按生产构建的浏览器测量（拖动与缩放反馈目标 30ms）。

## 提交

Conventional Commits，**按主题分批**，**按路径暂存**（不要 `git add -A`）：

```
feat(parts): 虎式 L1 曲轴与主轴承装配
fix(solver): 共面盒体的深度估计回退到 AABB 交叠盒
docs(progress): 记录 L1 层验收截图
test(assembler): 补 instance_nodes 布局语义用例
```

- 一个提交只做一件事：几何 / UI / 文档 / 测试分开。
- 提交信息用中文描述"做了什么"，正文写清验收口径（跑了什么、看到什么）。
- 不提交 `dist/`、截图以外的大文件、密钥或运行产物。

## 新增模型的标准动作

见 [`docs/ARCHITECTURE.md` §7](ARCHITECTURE.md#7-扩展一台新机m-b-起的标准动作)。
一句话版本：写注册表 → 写 layouts → 登记 `catalog.ts` → 逐层验收（报告为空 + 扫掠 + 滑杆 + 截图）→ 加测试。

## 许可

贡献即同意以 MIT 许可发布（见 `LICENSE`）。衍生自其他项目的代码请在
[`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md) 追加署名。
