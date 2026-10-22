# 第三方组件与衍生代码说明（Third-Party Notices）

本项目自身以 MIT 许可发布（见 `LICENSE`）。以下列出运行时依赖与**衍生代码来源**。

## 衍生代码（代码层面复用，非 npm 依赖）

### fight-stage / OasisMind contributors（MIT）

`src/three/parts/kernel/` 下的几何工具箱（微倒角盒体 / 薄板 / 翼型 / 百叶 / 铆钉列 / 程序化三联贴图等）
在架构与实现上衍生自 fight-stage 项目的 `src/three/code/detailKit.ts`
（Copyright (c) 2026 OasisMind contributors，MIT License），
并按本项目的零件化规范（`docs/零件化建模框架.md`）进行了扩展与重写。

虎式坦克的真实尺寸参考实现（`src/three/code/tigerTank.ts`）与本文档体系
（`docs/` 下四份基线文档）同样来自该项目，经用户授权在本仓库续作。

## 运行时主要依赖（均为宽松许可）

| 包                                           | 许可 | 用途                                |
| -------------------------------------------- | ---- | ----------------------------------- |
| three                                        | MIT  | 3D 渲染内核                         |
| @react-three/fiber / @react-three/drei       | MIT  | React 与 three 的桥接、控制与摄像机 |
| @react-three/postprocessing / postprocessing | Zlib | SSAO / Bloom / ACES 后处理          |
| three-mesh-bvh                               | MIT  | 三角形级相交检测（穿模检测器内核）  |
| zustand                                      | MIT  | 状态管理                            |
| react / react-dom                            | MIT  | UI                                  |

许可全文以各包内 `LICENSE` 文件为准。

## VFX 素材

### Photo Realistic Explosions（fscopel，CC-BY 3.0）

- 来源：https://opengameart.org/content/photo-realistic-explosions
- 许可：Creative Commons Attribution 3.0（https://creativecommons.org/licenses/by/3.0/）
- 使用：`public/vfx/explosion-red.png`、`explosion-blue.png`、`explosion-fireball.png`
  （RedUp / Round Up Blue / Lave Blob 序列帧，按数字顺序取帧并打包为黑底图集）。
- 修改：仅做帧排序、裁切与图集打包；未改变原始画面内容。
- 授权要求：保留作者署名与许可说明（本文件 + `public/vfx/CREDITS.md` + 应用内模型说明）。

### Particle Pack（Kenney，CC0 1.0）

- 来源：https://opengameart.org/content/particle-pack-80-sprites
- 使用：`public/vfx/smoke_ring.png`（原 smoke_10.png，用于尘/冲击环）。
- 许可：CC0 1.0，无强制署名要求。
