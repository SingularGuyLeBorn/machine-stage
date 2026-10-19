# 逐族豁免隔离视图（构造性接触白名单）

口径：目标函数是「未豁免报告 = 0」，不是「总报告 = 0」。装配关系本身导致的咬合
（轴承配合 / 过盈压装 / 剖分贴合 / 管端插接 / 皮带包角 / 螺栓埋头座）是机器、不是缺陷；
真缺陷是「本不该接触的零件叠在一起 = 位置或尺寸算错」。规则与守门值见
`src/three/parts/solver/whitelist.ts`，数据见
`src/three/parts/models/tiger/engine/expectedContacts.ts`。

每张图为该族的隔离小视图（A 红 / B 蓝，图为该族第 1 条报告），红色标注为族名 +
零件对 + 深度。截图分两批：16 张生成于 2026-10-19（白名单落地，未豁免 0 / 已豁免 147），
5 张同日随 L1 第一批扩量补齐新增族（未豁免 0 / 已豁免 224）；
`plug-boot-on-plug` 当前 0 条命中（护套内孔留 1mm 不接触），无图。

| 豁免族                    | 报告数 | 零件对（代表）                                                                                       | 依据（为什么是构造性接触）                                                 |
| ------------------------- | -----: | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `valve-on-seat`           |     24 | `cylinder.head` ↔ `valvetrain.valve`                                                                 | 气门盘落在缸盖燃烧室孔的气门座上、阀杆伸进导管口：座面/导向面本来就配合    |
| `conrod-split-face`       |     24 | `piston_rod.connecting_rod` ↔ `piston_rod.rod_cap`                                                   | 连杆大头剖分式：瓦盖与杆身的剖分面贴合，两半合起来才是一个整圆轴瓦孔       |
| `crankpin-in-big-end`     |     24 | `crankshaft.crank_pin` ↔ `connecting_rod` / `rod_cap`                                                | 曲柄销转在连杆大头轴瓦里：滑动轴承配合，名义零间隙                         |
| `cam-cover-screw-seat`    |     24 | `cylinder.cam_cover` ↔ `cylinder.cam_cover_screw`                                                    | 缸盖罩螺钉头沉进罩顶座面、螺杆埋进罩体（埋头座，非穿透）                   |
| `cover-bolt-seat`         |     24 | `crankcase.inspection_cover[0..3]` ↔ `inspection_cover_bolt`；`endplate_front` ↔ `timing_cover_bolt` | 检查盖 / 正时盖螺栓头压在盖板座面上、螺杆埋进盖板 8mm 板厚内（不伸出背面） |
| `sump-bolt-seat`          |     20 | `crankcase.sump` ↔ `crankcase.sump_bolt`                                                             | 油底壳法兰螺栓头压在法兰下表面、杆埋进 12mm 法兰内（不穿进曲轴箱）         |
| `camshaft-through-bores`  |     16 | `cylinder.block` / `head` / `head_gasket` / `cam_cover` ↔ `camshaft_l/_r`                            | 凸轮轴穿过缸体/缸盖/缸垫/罩盖的凸轮轴孔，轴颈坐在孔里（孔为多边形近似）    |
| `liner-press-fit`         |     12 | `cylinder.block` ↔ `cylinder.liner`                                                                  | 湿式缸套过盈压入缸体镗孔、下端坐在肩面上：压装面咬合                       |
| `piston-pin-in-small-end` |     12 | `piston_rod.piston_pin` ↔ `connecting_rod`                                                           | 活塞销穿在连杆小头铜套里（过盈/滑动配合）                                  |
| `conrod-pair-face`        |     12 | `connecting_rod` ↔ `connecting_rod`、`rod_cap` ↔ `rod_cap`                                           | V12 每个曲柄销上并列两支连杆，侧向贴合面互相贴住                           |
| `mount-bolt-seat`         |      8 | `crankcase.mount` ↔ `crankcase.mount_bolt`                                                           | 机脚螺栓头压住机脚底面、杆埋进机脚座（每脚 2 颗）                          |
| `fan-frame-passage`       |      4 | `fan_frame` ↔ `water_pipe_l/_r`、`timing_cover`、`crankshaft.nose`                                   | 水管/正时盖/曲轴鼻从风扇框架开口穿过，框架按件位让位                       |
| `carburetor-flange`       |      4 | `cylinder.head` ↔ `induction.carburetor`                                                             | 化油器法兰面坐在缸盖进气法兰面上，螺栓压紧的贴合面                         |
| `air-filter-on-cam-cover` |      4 | `cylinder.cam_cover` ↔ `induction.air_filter`                                                        | 空滤器坐落在缸盖罩顶上：底面与罩顶面承载贴合                               |
| `front-face-mount`        |      3 | `crankcase.breather/nameplate/oil_filler` ↔ `cooling.fan_frame`                                      | 铭牌/加注口/呼吸器与风扇框架同装在端板正面，共面相邻装配                   |
| `fan-bearing-press-fit`   |      2 | `cooling.fan_bearing` ↔ `cooling.fan_frame`                                                          | 风扇轴承压入风扇框架轴承孔（压装配合）                                     |
| `exhaust-pipe-socket`     |      2 | `induction.exhaust_manifold_l/_r` ↔ `exhaust_pipe_l/_r`                                              | 排气管端插进排气歧管承口（插接）                                           |
| `manifold-mating-face`    |      2 | `induction.intake_manifold_l/_r` ↔ `exhaust_manifold_l/_r`                                           | 进/排气歧管共用同一个缸盖法兰面，背靠背贴合                                |
| `belt-on-pulley`          |      1 | `cooling.fan_rotor` ↔ `cooling.drive_belt`                                                           | 皮带包在风扇皮带轮上：带传动包角接触                                       |
| `water-pipe-on-rib`       |      1 | `crankcase.rib` ↔ `accessory.water_pipe_r`                                                           | 水管沿侧壁外走线，管子搁在肋板外缘上（肋板是搁置面，管夹压这段）           |
| `timing-cover-mount`      |      1 | `crankcase.endplate_front` ↔ `crankcase.timing_cover`                                                | 正时齿轮盖本来就贴装在端板正面上：装配贴合面（阈值边缘，登记后稳定）       |
| `pipe-end-in-casting`     |      0 | `accessory.water_pump` ↔ `accessory.water_pipe_l/_r`                                                 | 预留：管端埋在水泵铸件里（隐藏接口）——当前 0 条命中，防后续扫描冒头        |
| `plug-boot-on-plug`       |      0 | `ignition.plug_boot` ↔ `valvetrain.spark_plug`                                                       | 预留：护套内孔套在火花塞上（当前留 1mm 不接触）——0 条命中，防后续冒头      |

合计 224 条 = 未豁免 0 + 已豁免 224（`npx tsx scripts/diag-clips.ts` 与浏览器内
`reportPartition` 双口径一致）。守门：豁免族内若冒出 >2mm 的深度即判真缺陷照报——
注入测试（油尺推进曲轴箱壁 5mm）只多报那一条。

> 截图方式：浏览器 dev 模式下用 `window.__stage` 钩子打开对应报告的隔离小视图，
> 把面板临时放大到全屏后截图（纯 QA 取证，不是应用功能）。第二批 5 张截图为
> 1801×1159 视口原尺寸（首批 16 张为 1333×904 裁剪），面板标题栏另注族名+深度。
