# 金古桥：原壳恢复、柔性护套与佩丹内部

本切片在 `codex/kingjoe-pedan-interiors` 独立工作树完成。原 GLB 与原单体网格约束头部外形；内部佩丹场装置为用户批准的原创设定。

## 结构与动作

- 恢复头部横筒、端盘和支架，保留原颈部阶梯接口及已确认外壳。
- 原壳保留约 25mm 壁厚，随形横肋与纵梁贴内壁；肩肘分出刚性活动件。
- 肩肘各 13 层、膝部各 11 层黄色金属波纹护套，共 74 层。护套分类为外观连接件，普通模式也显示。膝部已预留节点，尚未添加腿部动作。
- 12 个设备舱连接错列外围场设备，使用铜、深色陶瓷、青钛、紫色器件及发光晶核区分功能。页面共 2,874 个零件实例。
- 同一动作量驱动成组转子、滑块、弹簧和输能光包；头屏与左右胸窗分别对应内部核心，共享功率变化。
- 发射时光包提速、核心增强；双红束末端保留原间距的 72%，前进 4.5m、共同下倾 0.32m。顶点与方向统一在模型根节点局部空间计算。

## 复现与检查

1. 原始闭合源：用 Blender 执行 `scripts/build-kingjoe-modules.py`，输出 `qa-out/kingjoe-source-shells.json`。
2. 壳体与骨架：`python scripts/build-kingjoe-pedan.py`。`--reuse-lower` 只适用于下三模块与壁厚参数未变；`--export-only` 只重导出已有缓存。
3. 运动矩阵：用项目 `vite-node` 执行 `scripts/check-kingjoe-pedan-motion.ts`。
4. 刚性壳检查：`python scripts/check-kingjoe-pedan-pose.py --motion`。158 个采样姿态没有超过阈值的八件外壳交集；不代表连续全程证明，也不包括可压叠护套和全部内部设备。
5. 全套测试：311 通过、1 跳过；最终运动/能量复查 12 通过。测试覆盖实际导出网格闭合、源外形保护、接口、可见性、抬臂连续、内部联动及射线方向。
6. 本次修改文件 ESLint 无错误、7 个警告，类型检查及生产构建通过。全仓 lint/format 存在原有问题，未将这些检查描述为全绿。

浏览器检查了整机、侧视、透视、推手发射和分体双束，截图分别为：

- [黄色金属护套](kingjoe-pedan-gold-covers.png)
- [内部设备网络](kingjoe-pedan-energy-network.png)
- [推手黄色光束](kingjoe-pedan-yellow-energy.png)
- [分体双红束](kingjoe-pedan-red-rays.png)

可复用方法已写入本机 `glb-to-usable-model` skill 的 `references/articulated-interiors-and-energy.md`；新增 `scripts/bellows_layers.py`。脚本自检、13 层样件拓扑检查及 Skill 格式校验通过。细节包括原模型恢复、护套可见性误判、真实内壁约束、空腔负壳、Float32 短边、主相位联动、核心供能与截图验收。
