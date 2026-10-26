# machine-stage · 装备展示台

**纯前端 3D 军工装备展示台**：零件化程序化建模 + 自内向外装配（L1 核心机构 → L5 表面附件）+ 实例级穿模检测 + 构建回放。

不是只能围着看的模型：福建舰和 055 可以走进去、开起来、潜下去。甲板、机库、弹药库、机舱、反应堆舱、舰桥、CIC 都能第一人称漫游；舰载机可以弹射起飞并进入座舱武器试射；海面、螺旋桨、尾流和水下体积实时生成。

![福建舰](docs/showcase/01-fujian-carrier.jpg)

---

## 现在能做什么

| 模块 | 现状 |
| --- | --- |
| **模型库** | 18 个条目 / 17 个已交付：福建舰、055、HMT 双足机器人、T-800 内骨骼、金古桥三种形态、虎式、MBT-90、ED-90、三八式 / PP-19 / M60 / AK-47 / RPK / M2HB / M134，以及框架自检台。J-20 单机条目保留为规划占位 |
| **福建舰** | 10,635 个注册零件 / 约 562 万三角面；甲板、机库、弹药库、机舱、反应堆舱、舰桥、CIC、生活区、维修车间全部可走；F 交互、E 检查、快速传送、小地图；电磁弹射与舰载机起降流程 |
| **舰载机座舱** | J-20 座舱 HUD：俯仰梯 / 航向带 / IAS·ASL / 火控雷达 / WEZ / RWR；AIM-9 六自由度制导、机炮、干扰弹、自动驾驶、靶机与 360° 环视 |
| **055 型驱逐舰** | 11,972 个注册零件 / 约 560 万三角面；112 单元垂发、346B 四面阵、130mm 主炮、1130 近防、COGAG 四燃双轴、双机库与直-20；切角八棱一体化桅杆与上层建筑 |
| **海面与航行** | 航母 / 055 共用 GPU 频谱海（JONSWAP + Gerstner 涌浪、开尔文尾迹、白浪、菲涅耳与太阳高光）；航速三档，螺旋桨转动、艉迹泡沫带跟船；相机可直接拖到水下环视，水体含海床、深度雾、悬浮颗粒与斜射光束；进入任何舱室自动隐藏海面，不会“舱内进水” |
| **工程工具** | 注册表 / 装配器 / 实例级穿模报告、构建滑杆回放、爆炸 / 透视 / 热像 / 标签、动作与状态机、参数单一真值源；万件级模型做了内部件剔除、屏幕空间 LOD 与拾取候选裁剪 |

|  |  |
| --- | --- |
| ![飞行甲板](docs/showcase/02-fujian-deck.jpg) | ![座舱试射](docs/showcase/04-fujian-cockpit.jpg) |
| ![水下视角](docs/showcase/05-fujian-underwater.jpg) | ![055 桅杆](docs/showcase/06-055-mast.jpg) |

更多展示图（1920×1080 实时截图）见 [`docs/showcase/`](docs/showcase/README.md)。

## 快速开始

要求：Node.js 20+，npm 10+。

```bash
npm install
npm run dev        # 默认 http://localhost:5173；端口被占用时 Vite 会顺延（本机为 5174）
```

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 开发服务器 |
| `npm run build` | 类型检查 + 生产构建（`dist/`） |
| `npm run preview` | 预览生产构建 |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | 单元测试（vitest，node + jsdom 双环境） |
| `npm run test:watch` | 监听模式 |
| `npm run lint` | ESLint |
| `npm run format` / `format:check` | Prettier |

> 福建舰 / 055 全量装配是万件级，冷启动会花几秒；模型切换有装配缓存，第二次进入明显更快。HMT 的本地运行时资产（约 776MB gzip 分片）不入 Git，缺失时按报错重新导出。

## 操作

### 通用视角

| 操作 | 功能 |
| --- | --- |
| 左键拖动 | 旋转视角（航母 / 055 可以一直拖到水下） |
| 右键拖动 | 平移 |
| 滚轮 | 缩放；水下时升降 |
| 点击零件 | 查看并聚焦；`Esc` 退出聚焦 / 漫游 |

### 福建舰 / 055 第一人称漫游

| 操作 | 功能 |
| --- | --- |
| `W A S D` | 移动 |
| `Shift` | 冲刺（约 20 m/s） |
| `Space` | 跳跃 |
| 鼠标（点击锁定） | 环视 |
| `F` | 交互：开门、升降机、弹药升降机、上飞机等 |
| `E` | 检查零件 |
| `G` | 一键上飞机 / 弹射流程 |
| `T` | 快速前往区域 / 关键位置 |
| `Esc` | 退出漫游 |

### 座舱武器试射

| 操作 | 功能 |
| --- | --- |
| `R` | 锁定 / 切换目标 |
| `Space` | 发射 |
| `1` / `2` | 机炮 / AIM-9 |
| `C` | 干扰弹 |
| `P` | 自动驾驶 |
| `Esc` | 退出座舱 |

### 航母航行

视口右下角的「航行」面板提供 `前进 / 停车 / 后退`：前进 8 m/s、后退 4 m/s。航行时舰体前后移动、双轴螺旋桨转动、艉迹泡沫带展开并随速度衰减；停车后回到当前位置的环绕中心。

## 工程基线

- **真实米制**：尺寸单位是米，来自公开资料近似值并注明出处；单一真值源是注册表 `constants`。
- **禁止匿名 mesh**：每个零件在注册表里有名字、层号、装配关系；坐标由 `constants` / `mate` 派生。
- **实例级报告**：穿模报告定位到 `零件ID[实例下标]`，例如 `tiger.track.link[42] ↔ tiger.suspension.roadwheel[7]`。
- **自内向外**：先核心机构，再包壳；一层零穿模才进下一层。
- **视觉红线**：真实比例、微倒角、曲面放样 / Lathe、面板三联贴图、PBR 材质；具体口径见 [`docs/MACHINE_STYLE.md`](docs/MACHINE_STYLE.md) §9。

## 目录结构

```
src/three/parts/
  registry/    数据类型、表达式、校验、自检台
  assembler/   注册表 → 场景树；几何构建
  solver/      静态 / 动画扫掠穿模检测；报告格式
  kernel/      倒角盒、放样、铆钉、三联贴图等几何工具箱
  models/      carrier / type055 / tiger / mbt / edrive / guns7 / kingjoe / t800 / hmt …
src/app/
  catalog.ts   模型清单：注册表 + 布局 + 动画 + 动作声明
  state/       zustand 单一状态源
  three/       视口、相机、海面、漫游、座舱、海战、VFX
  components/  三栏 UI、座舱 HUD、控制面板、快速传送
docs/          架构、视觉规范、验收记录、展示图
```

## 文档

| 文档 | 内容 |
| --- | --- |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | 分层、数据流、mate / 实例布局语义、检测算法、扩展新机的标准动作 |
| [`docs/PROGRESS.md`](docs/PROGRESS.md) | 里程碑、每层验收证据、已知边界 |
| [`docs/MACHINE_STYLE.md`](docs/MACHINE_STYLE.md) | 视觉规范与红线（§6 剖切、§9 视觉红线） |
| [`docs/qa/carrier-acceptance.md`](docs/qa/carrier-acceptance.md) | 福建舰验收记录：甲板、漫游、弹射、座舱、航行、水下 |
| [`docs/qa/055-acceptance.md`](docs/qa/055-acceptance.md) | 055 验收记录：VLS、动力、桅杆、上建、海面、水下 |
| [`docs/展示台项目总体设计.md`](docs/展示台项目总体设计.md) | 总规格（里程碑、UI、验收口径） |
| [`docs/零件化建模框架.md`](docs/零件化建模框架.md) | 注册表 / 命名 / 穿模报告格式基线 |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | 开发流程、门禁、建模与提交约定 |
| [`CHANGELOG.md`](CHANGELOG.md) | 版本变更记录 |

## 自动化与验收

- 开发模式或 URL 带 `?qa=1` 时，控制台暴露 `window.__stage`（场景、相机、store、setCamera）和 `window.__walk`（传送、机位、交互、座舱快照），用于浏览器实测。
- 大模型避免全量慢测：日常门禁只跑目标测试 + `tsc --noEmit` + 浏览器检查；完整扫描是独立脚本（`npm run sweep`）。
- 关键回归覆盖：舱内海面隐藏、航线净空、甲板边缘、VLS 井盖 / 井筒、舰载机弹射、055 桅杆 / 上建接触。

## 已知边界

- J-20 单机在模型库中是规划占位；可玩的 J-20 目前挂在福建舰的弹射 / 座舱流程里。
- 剖切（带实心端盖）按 `MACHINE_STYLE` §6 规划；当前透视 / 爆炸视图可用，剖切尚未提供。
- 航母 / 055 冷装配与首次材质编译需要几秒；万件级画面在集显或小显存设备上会降帧。
- 水下海床、悬浮颗粒与光束是实时风格化水体，不是流体仿真；舰体水下部分以真实比例和螺旋桨 / 舵几何为准。
- 穿模扫描在重型模型上走 Web Worker 池；单人低配设备仍建议按需触发，不要自动全量扫描。

## 许可与致谢

MIT © 2026 OasisMind contributors。几何 / 贴图工具箱衍生自同作者的 `detailKit.ts`，署名见 [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)。三方依赖：three.js、@react-three/*、three-mesh-bvh、Zustand、lucide-react、three.quarks。

MBT-90 / ED-90 爆炸与炮口焰使用 **fscopel** 的 *Photo Realistic Explosions* 序列帧（CC-BY 3.0，OpenGameArt）与 **Kenney** 烟环（CC0）；完整署名和修改说明见 [`public/vfx/CREDITS.md`](public/vfx/CREDITS.md)。055 参考照片只用于轮廓与比例对照，不进入模型贴图，来源见 [`docs/qa/refs/055/CREDITS.md`](docs/qa/refs/055/CREDITS.md)。
