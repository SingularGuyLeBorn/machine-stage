# 福建舰 · 验收记录（carrier worktree）

## 零件与结构
- 零件定义 **3099** / 展开 **3100** / 实例 **3675**
- 分层：L1=1602、L2=264、L3=464、L4=526、L5=244
- 三角面 1,735,794
- L1 舰体/反应堆/控制棒/蒸汽轮机/双轴双桨双舵；L2 机库/防火门/弹药库/弹药升降机；
  L3 三弹射器（3×16 段）/滑梭/挡焰板/4 拦阻索/拦阻网/双舷侧升降机；
  L4 三层舰桥/4 面固定相控阵（4×64 TR）/旋转雷达/2×1130（各 11 管）；
  L5 折叠翼/尾钩/加强起落架/弹射牵引杆。

## 门禁
- 注册表校验：0 错
- 悬空：0；悬空孤岛：0；合并件内部悬空：0
- 静态穿模：7871 报告 / **未豁免 0**
- 动画扫掠：flight_ops 772 / engine 530 / hangar 50 / ciws 114，**未豁免均 0**
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
- 说明：3099 个零件中仍有大量真实结构板/梁/管路以简单几何表达（箱体、圆柱是这些零件的真实形态）；不等同于“积木拼装”。但整舰尚未达到“每个设备都可对照实机零件级制造图”的绝对无简化标准，后续需继续以真实网格资产替换设备级简化件。

## 证据
- 整机金属外观：`docs/qa/carrier-metal-overview7.jpeg`
- 舰载机近景：`docs/qa/carrier-aircraft-close3.jpeg`
- 舰岛/近防：`docs/qa/carrier-07-island.jpeg`、`docs/qa/carrier-08-ciws.jpeg`
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
