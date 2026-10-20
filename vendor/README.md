# Vendored VFX dependencies

这些包被**复制进本 worktree**，不安装到共享 `node_modules`（本 worktree 的 node_modules 是指向主线工作区的 junction，往里装包会污染主线/其他 worktree）。

| 包 | 版本 | 许可证 | 用途 |
|----|------|--------|------|
| three.quarks | 0.16.0 | MIT | 粒子系统（爆炸火花 / 火球 / 烟） |
| quarks.core | 0.16.0 | MIT | three.quarks 的核心生成器/行为 |

- 来源：npm `three.quarks@0.16.0`、`quarks.core@0.16.0`（与当前 three 0.170 兼容的最后一个 0.16 系列）。
- 运行时通过 `vite.config.ts` / `vitest.config.ts` 的 alias 解析：
  - `three.quarks` → `vendor/three.quarks/three.quarks.esm.js`
  - `quarks.core` → `vendor/quarks.core/quarks.core.esm.js`
- 类型通过 `tsconfig.json` 的 `paths` 指向各自 `types/`。
- 许可证原文见各目录的 `LICENSE`。
