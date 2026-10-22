# 福建舰 · 验收记录（carrier worktree）

## 零件与结构
- 零件定义 **3371** / 展开 **3371** / 实例 **3946**
- 分层：L1=1658、L2=264、L3=464、L4=725、L5=260
- 三角面 1,831,146
- L1 舰体/反应堆/控制棒/蒸汽轮机/双轴双桨双舵；L2 机库/防火门/弹药库/弹药升降机；
  L3 三弹射器（3×16 段）/滑梭/挡焰板/4 拦阻索/拦阻网/双舷侧升降机/右舷艉部航空吊车；
  L4 三层舰桥/4 面固定相控阵（4×64 TR）/旋转雷达/2×1130（各 11 管）；
  L5 折叠翼/尾钩/加强起落架/弹射牵引杆。

## 门禁
- 注册表校验：0 错
- 悬空：0（船壳大 AABB 已从“支撑提供者”剔除后复查）；悬空孤岛：0；合并件内部悬空：0
- 静态穿模：9374 报告 / **未豁免 0**
- 动画扫掠：flight_ops 768 / engine 526 / hangar 46 / ciws 144，**未豁免均 0**
- `npm test`：312 passed / 1 skipped；`npm run build`：通过

## 材质（红线一）
- `scene.environment` 加载 Poly Haven CC0 HDRI：`aerodynamics_workshop_2k.hdr`
- 金属件 `metalness = 1`，PBR 贴图组来自 Poly Haven CC0：
  - MetalPlates：`metal_plate`
  - MetalBrushed：`metal_plate_02` + `anisotropy`（拉丝机加件）
  - MetalScratched：`blue_metal_plate`（甲板防滑钢板的划痕法线/粗糙度）
  - MetalRust：`rust_coarse_01`（水线/舷侧锈蚀）
- 贴图实体位于 `public/textures/metal/`，HDRI 位于 `public/hdr/`。

## 红线二/三执行说明
- 已删除程序化积木小人、甲板车辆、机库工具车及孤立附件；停放机改用回转体机身 + 翼型放样；按“宁可留空”处理，不再用方块/圆柱堆小人与小车。
- 舰载机机身改为回转体放样（`latheZ`），机翼/平尾/垂尾/鸭翼/襟副翼改为 NACA 对称翼型沿展向放样（`carrierWing`），不再用方块拼翼面。
- 舰体增加实体合拢焊缝（`weld` 几何）作为结构细节。
- 舰岛主桅由圆柱十字改为四腿桁架 + 三道环梁 + 两层平台/栏杆 + 直梯 + 鞭状天线，设备落到平台实体上。
- 增加菲涅尔光学助降系统（FLOLS 透镜箱/基准灯/机柜/平台）与着舰区 6 段实体安全网（网格焊道 + 外伸撑杆）。
- 救生圈改真实环面；左舷艉部增加救生艇（回转体艇体 + 充气舷管 + 挂机/操控台/油箱）与吊艇架（立柱/吊臂/绞车/吊索）。
- 舷号/锚/锚链/做旧件按 `hullHalfBeamAt(z)` 贴到真实船壳；水线漆带改为 20 段沿曲面折线。
- 左舷增加 18 段连续外走道（格栅/双托架/立柱/扶手），补齐飞行甲板与船壳之间的空档。
- 舰体上部改为真实外飘放样环带：克令克（y=3.05）以上向甲板底外飘收口，艏部外飘量随 z 增大；甲板外飘段增加实体底封板，消除侧视/仰视透空缝。
- 舷侧增加沿曲面放样的外板列板（5 道×左右舷）、舭龙骨、海水门及格栅、坞座；内部纵骨按分段最小半宽内缩，避免艏艉收窄处穿出外板；艏部内腔截短到 z=17.3，避免病态薄片孔洞导致外壳三角化开洞。
- 甲板栏杆/外走道栏杆按 1:8 实尺修正到 0.2m（约 1.6m 实尺），救生圈缩到 0.12m 直径；删除外贴黑色方块做旧件，做旧交给 PBR。
- 舰岛相控阵阵面改为深灰底 + 浅灰 T/R 网格（8×8 可见）；修正水冷板偏移到阵面背后（原代码把侧阵水冷板沿世界 Z 偏，导致外露）；四面阵面冷却板均按各自法向后退。
- 舰桥四层增加前向环绕窗带（每层 4 扇玻璃 + 3 根竖梃 + 窗台/窗楣）与侧窗竖梃/窗台，不再是实心前壁；右舷增加舰桥翼台（格栅平台 + 斜撑 + 双层栏杆 + 端栏杆）。
- 舰艏增加回转体放样的球鼻艏（长 2.35m、最大半径 0.36m，压在艏柱/龙骨前端）与声呐导流罩；球鼻艏采用防污漆材质，不再是尖艏直接插水的简化形态。
- 飞行甲板右舷艉部增加航空吊车：基座/加强肘板/回转齿圈/回转台/桅柱/司机室及托架/四弦杆桁架吊臂/8 根斜撑/绞车及支座/滑轮组吊钩/双起升索；吊臂根部设铰座，绞车与司机室均有实体托架落地。
- 说明：3274 个零件中仍有大量真实结构板/梁/管路以简单几何表达（箱体、圆柱是这些零件的真实形态）；不等同于“积木拼装”。但整舰尚未达到“每个设备都可对照实机零件级制造图”的绝对无简化标准，后续需继续以真实网格资产替换设备级简化件。

## 证据
- 左舷走道/舰体侧面：`docs/qa/carrier-hull-side2.jpeg`
- 整机金属外观：`docs/qa/carrier-metal-overview7.jpeg`
- 舰体侧视/艏部/艉部：`docs/qa/carrier-side-full.jpeg`、`docs/qa/carrier-bow-profile.jpeg`、`docs/qa/carrier-stern-profile.jpeg`、`docs/qa/carrier-bulbous-bow.jpeg`
- 舰载机近景：`docs/qa/carrier-aircraft-close3.jpeg`
- 舰岛/近防：`docs/qa/carrier-07-island.jpeg`、`docs/qa/carrier-08-ciws.jpeg`、`docs/qa/carrier-island-close2.jpeg`、`docs/qa/carrier-array-front.jpeg`
- 艉部航空吊车：`docs/qa/carrier-crane-close.jpeg`、`docs/qa/carrier-deck-crane.jpeg`
- 核心闭环静帧：`docs/qa/carrier-flight-01-taxi.jpeg` … `-05-arrest.jpeg`
- 核心闭环录屏：`docs/qa/carrier-flight-ops.mp4`（30s，5fps 采样/30fps 封装）

## 复跑
```bash
npx tsc --noEmit
npx tsx scripts/diag-carrier.ts
npx tsx scripts/diag-carrier-sweep.ts --state flight_ops --duration 30 --fps 2
npm test
npm run build
```
