# 豁免规则复核清单（判定树口径）

> 生成命令：`npx tsx scripts/diag-clips.ts --recheck`（本文件由脚本生成，不要手改）。
> 本轮数据：总报告 227 / 未豁免 0 / 已豁免 227（含引擎模型全量实例对）。

## 判定树口径

```
相交对（bvhcast 命中）
 ├─ 绕轴闭合 且 交线来自贴合壁对（法向近平行） → bearing_overlap（同心配合面）  → 配合接触，可豁免
 ├─ 其余且 depth_mm 可测（≥ 0.5mm）          → displaced（错位穿透）           → 未豁免，报
 └─ 其余且 depth_mm = null                    → 交线退化(<0.1mm) = face_mate（共面贴合）→ 可豁免
                                                否则 = suspect（存疑穿透）      → 未豁免，报
```

- 形态与深度是**两道守门**：`suspect` / `displaced` 无视豁免规则（守门值对它们无效）；
- `depth_mm = null` 不再等于放行：null 必须过形态分流，分不出的一律进未豁免区；
- 「命中」列 = 按零件 id 模式匹配到的报告数，括号外为**仍在豁免区**的条数。

## 复核表

| # | 豁免族 | 零件对（规则） | 依据 | 守门值(mm) | 豁免/命中 | 形态分布 | 结论 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `conrod-split-face` | `tiger.piston_rod.connecting_rod` ↔ `tiger.piston_rod.rod_cap` | 连杆大头是剖分式：瓦盖与杆身的剖分面本来就要贴合，两半合起来才是一个整圆轴瓦孔。 | 2 | 0/0 | — | — 未命中（族空转） |
| 2 | `crankpin-in-big-end` | `tiger.crankshaft.crank_pin` ↔ `tiger.piston_rod.connecting_rod` | 曲柄销转在连杆大头轴瓦里：销面与瓦面是滑动轴承配合（名义零间隙），本来就要接触。 | 2 | 0/0 | — | — 未命中（族空转） |
| 3 | `crankpin-in-big-end` | `tiger.crankshaft.crank_pin` ↔ `tiger.piston_rod.rod_cap` | 瓦盖内圈的轴瓦下半与曲柄销同面配合（与上半合成整圆）。 | 2 | 0/0 | — | — 未命中（族空转） |
| 4 | `piston-pin-in-small-end` | `tiger.piston_rod.piston_pin` ↔ `tiger.piston_rod.connecting_rod` | 活塞销过盈压入连杆小头衬套（按压装销建模，径向 0.6mm）：销面与小头孔面整圈咬合。 | 2 | 12/12 | bearing_overlap×12 | ✔ 全部为配合面/贴合面 |
| 5 | `conrod-pair-face` | `tiger.piston_rod.connecting_rod` ↔ `tiger.piston_rod.connecting_rod` | V12 每个曲柄销上并列两支连杆（同一销上左右缸各一支），两侧面贴合装配。 | 2 | 0/0 | — | — 未命中（族空转） |
| 6 | `conrod-pair-face` | `tiger.piston_rod.rod_cap` ↔ `tiger.piston_rod.rod_cap` | 并列连杆的瓦盖同样成对贴装在同一曲柄销上。 | 2 | 0/0 | — | — 未命中（族空转） |
| 7 | `liner-press-fit` | `tiger.cylinder.block` ↔ `tiger.cylinder.liner` | 湿式缸套过盈压入缸体镗孔、下端坐在缸体肩面上：压装面本来就是咬合的（径向 4mm 水套环隙在镗孔内侧，不参与接触）。 | 2 | 0/0 | — | — 未命中（族空转） |
| 8 | `valve-on-seat` | `tiger.cylinder.head` ↔ `tiger.valvetrain.valve` | 气门盘落在缸盖燃烧室孔的气门座上、阀杆伸进导管口：座面与导向面本来就是配合面。 | 2 | 0/0 | — | — 未命中（族空转） |
| 9 | `carburetor-flange` | `tiger.cylinder.head` ↔ `tiger.induction.carburetor` | 化油器法兰面坐在缸盖进气法兰面上，螺栓压紧的贴合面。 | 2 | 0/0 | — | — 未命中（族空转） |
| 10 | `camshaft-through-bores` | `tiger.cylinder.block` ↔ `tiger.valvetrain.camshaft_*` | 凸轮轴穿过缸体的凸轮轴孔（轴颈坐在孔里）：孔是多边形近似，0.5mm 级是内接边长吃掉的名义间隙。 | 2 | 0/0 | — | — 未命中（族空转） |
| 11 | `camshaft-through-bores` | `tiger.cylinder.head` ↔ `tiger.valvetrain.camshaft_*` | 凸轮轴继续穿过缸盖上的凸轮轴孔（孔为多边形近似）。 | 2 | 0/0 | — | — 未命中（族空转） |
| 12 | `camshaft-through-bores` | `tiger.cylinder.head_gasket` ↔ `tiger.valvetrain.camshaft_*` | 缸垫在凸轮轴孔处同样被轴穿过（垫片开口与轴同心）。 | 2 | 0/0 | — | — 未命中（族空转） |
| 13 | `camshaft-through-bores` | `tiger.cylinder.cam_cover` ↔ `tiger.valvetrain.camshaft_*` | 凸轮轴罩盖在凸轮轴上方，罩壁与轴同心（罩内腔让出轴与凸轮）。 | 2 | 0/0 | — | — 未命中（族空转） |
| 14 | `air-filter-on-cam-cover` | `tiger.cylinder.cam_cover` ↔ `tiger.induction.air_filter` | 空滤器坐落在缸盖罩顶上：底面与罩顶面是承载贴合面。 | 2 | 0/0 | — | — 未命中（族空转） |
| 15 | `fan-bearing-press-fit` | `tiger.cooling.fan_bearing` ↔ `tiger.cooling.fan_frame` | 风扇轴承压入风扇框架的轴承孔（压装配合）。 | 2 | 2/2 | bearing_overlap×2 | ✔ 全部为配合面/贴合面 |
| 16 | `belt-on-pulley` | `tiger.cooling.fan_rotor` ↔ `tiger.cooling.drive_belt` | 皮带包在带轮上：带面与轮槽面留 0.8mm 净隙、空转（压装会让 closed 判定临界，故本设计不压装）；出现接触时才按带传动包角接触计。 | 2 | 0/0 | — | — 未命中（族空转） |
| 17 | `fan-frame-passage` | `tiger.cooling.fan_frame` ↔ `tiger.accessory.water_pipe_*` | 水管从风扇框架附件梁的让位开口穿过（notchHalf = 管半径 + 0.015）：开口边缘与管壁相邻。 | 2 | 1/1 | bearing_overlap×1 | ✔ 全部为配合面/贴合面 |
| 18 | `fan-frame-passage` | `tiger.crankcase.timing_cover` ↔ `tiger.cooling.fan_frame` | 正时盖外缘落在风扇框架的开口边缘里（框架开口按正时盖轮廓让位）。 | 2 | 0/0 | — | — 未命中（族空转） |
| 19 | `fan-frame-passage` | `tiger.crankshaft.nose` ↔ `tiger.cooling.fan_frame` | 曲轴鼻（皮带轮端）穿过风扇框架的中心开口。 | 2 | 0/0 | — | — 未命中（族空转） |
| 20 | `front-face-mount` | `tiger.crankcase.oil_filler` ↔ `tiger.cooling.fan_frame` | 机油加注口与风扇框架同装在端板正面：框架背平面与件的外端面齐平装配。 | 2 | 0/0 | — | — 未命中（族空转） |
| 21 | `front-face-mount` | `tiger.crankcase.nameplate` ↔ `tiger.cooling.fan_frame` | 铭牌贴在端板正面，风扇框架贴着端板安装，两者在深度方向共面相邻。 | 2 | 0/0 | — | — 未命中（族空转） |
| 22 | `front-face-mount` | `tiger.crankcase.breather` ↔ `tiger.cooling.fan_frame` | 呼吸器装在端板正面，与风扇框架同一安装面。 | 2 | 0/0 | — | — 未命中（族空转） |
| 23 | `water-pipe-on-rib` | `tiger.crankcase.rib` ↔ `tiger.accessory.water_pipe_*` | 水管沿侧壁外走线，管子搁在肋板外缘上（肋板就是它的搁置面，管夹压在这段）。 | 2 | 0/0 | — | — 未命中（族空转） |
| 24 | `exhaust-pipe-socket` | `tiger.induction.exhaust_manifold_*` ↔ `tiger.induction.exhaust_pipe_*` | 承口是外套滑套：13 边形内切圆 0.0422 > 主管外接圆 0.042，径向恒定留 0.24mm 净隙（多边形几何上不可能相交）；下管起点环整圈落在歧管口封盖之外。量到咬合只可能是滑套贴面量级（真缺陷=弯管横穿主管壁，深度 >10mm），按 6mm 守门。 | 6 | 0/0 | — | — 未命中（族空转） |
| 25 | `manifold-mating-face` | `tiger.induction.intake_manifold_*` ↔ `tiger.induction.exhaust_manifold_*` | 缸盖每侧开两个口（进气口在上、排气口在下）：进/排气歧管各接自己的法兰口，在缸盖侧面同一安装面上下相邻。 | 2 | 0/0 | — | — 未命中（族空转） |
| 26 | `sump-bolt-seat` | `tiger.crankcase.sump_bolt` ↔ `tiger.crankcase.sump` | 油底壳螺栓拧进法兰螺孔：头坐在法兰下面、杆埋进 12mm 法兰板里（埋入量 > 贴面量级，按 14mm 守门）。 | 14 | 20/20 | bearing_overlap×20 | ✔ 全部为配合面/贴合面 |
| 27 | `cover-bolt-seat` | `tiger.crankcase.inspection_cover_bolt` ↔ `tiger.crankcase.inspection_cover` | 检查盖螺栓固定盖板：头露在盖外、杆埋进 8mm 盖板里。 | 14 | 16/16 | bearing_overlap×16 | ✔ 全部为配合面/贴合面 |
| 28 | `cover-bolt-seat` | `tiger.crankcase.timing_cover_bolt` ↔ `tiger.crankcase.timing_cover` | 正时齿轮盖螺栓固定盖板：头露在盖外、杆埋进 20mm 盖板里。 | 14 | 8/8 | bearing_overlap×8 | ✔ 全部为配合面/贴合面 |
| 29 | `mount-bolt-seat` | `tiger.crankcase.mount_bolt` ↔ `tiger.crankcase.mount` | 机脚螺栓把机脚固定在机架上：头在脚底、杆埋进 50mm 脚体里。 | 14 | 8/8 | bearing_overlap×8 | ✔ 全部为配合面/贴合面 |
| 30 | `cam-cover-screw-seat` | `tiger.cylinder.cam_cover_screw` ↔ `tiger.cylinder.cam_cover` | 缸盖罩螺钉拧进罩顶板：头在罩外、杆埋进 8mm 顶板里。 | 14 | 48/48 | bearing_overlap×48 | ✔ 全部为配合面/贴合面 |
| 31 | `plug-boot-on-plug` | `tiger.ignition.plug_boot` ↔ `tiger.valvetrain.spark_plug` | 高压护套套在火花塞瓷体上：护套为闭合空心剖面（内孔 ⌀27）、塞子斜唇 ⌀23，名义净隙 + 唇口咬合（1.1mm 级）。 | 2 | 24/24 | bearing_overlap×24 | ✔ 全部为配合面/贴合面 |
| 32 | `timing-cover-mount` | `tiger.crankcase.endplate_front` ↔ `tiger.crankcase.timing_cover` | 正时齿轮盖螺栓固定在端板正面：盖板背面与端板前面是贴合的安装面。 | 2 | 0/0 | — | — 未命中（族空转） |
| 33 | `pipe-end-in-casting` | `tiger.accessory.water_pump` ↔ `tiger.accessory.water_pipe_*` | 水管端头埋在水泵铸件里（隐藏接口）：管端不外露，接口藏在铸件内部。 | 2 | 0/0 | — | — 未命中（族空转） |
| 34 | `port-flange-bolt-seat` | `tiger.cylinder.port_flange_bolt` ↔ `tiger.cylinder.head` | 缸盖进/排气法兰螺栓拧进法兰螺孔：头坐在法兰外面、杆埋进 18mm 法兰板（埋入量 > 贴面量级，按 14mm 守门）。 | 14 | 48/48 | bearing_overlap×48 | ✔ 全部为配合面/贴合面 |
| 35 | `endplate-bolt-seat` | `tiger.crankcase.endplate_bolt` ↔ `tiger.crankcase.endplate_front` | 前端板螺栓：头在端板外面、杆埋进端板板厚（⌀290 螺孔圈，让开正时盖 ⌀260）。 | 14 | 12/12 | bearing_overlap×12 | ✔ 全部为配合面/贴合面 |
| 36 | `endplate-bolt-seat` | `tiger.crankcase.endplate_bolt` ↔ `tiger.crankcase.endplate_rear` | 后端板螺栓：与前端板同圈同规格，头在飞轮壳一侧外面。 | 14 | 12/12 | bearing_overlap×12 | ✔ 全部为配合面/贴合面 |
| 37 | `endplate-bolt-seat` | `tiger.crankcase.endplate_bolt` ↔ `tiger.crankcase.shell` | 端板螺栓穿过端板后拧进机体端面螺孔（端板夹在中间）：同一杆同时咬合端板与机体，都是螺纹咬合。 | 14 | 14/14 | bearing_overlap×14 | ✔ 全部为配合面/贴合面 |
| 38 | `sender-thread-seat` | `tiger.crankcase.oil_pressure_sender` ↔ `tiger.crankcase.shell` | 机油压力传感器螺纹杆拧进机体侧壁螺孔：外壳坐在壁外，杆只埋进 19mm 壁厚的 6mm。 | 10 | 1/1 | bearing_overlap×1 | ✔ 全部为配合面/贴合面 |
| 39 | `sender-thread-seat` | `tiger.cooling.coolant_temp_sender` ↔ `tiger.crankcase.shell` | 水温传感器螺纹杆拧进机体侧壁螺孔（水套外壁），与机油压力传感器同壁前后各一。 | 10 | 1/1 | bearing_overlap×1 | ✔ 全部为配合面/贴合面 |

## 漏网清单（族内被判 suspect / displaced 的报告）

（空：复核表里没有族落进 suspect / displaced）

## 未豁免清单（本轮，验收口径：未豁免 = 0）

（空：未豁免 = 0）
