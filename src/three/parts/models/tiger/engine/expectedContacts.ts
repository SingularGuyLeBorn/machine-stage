import type { ExpectedContactRule } from "../../../registry/types";

// ============================================================================
// tiger/engine —— 构造性接触白名单（豁免族）
//
// 依据：`npx tsx scripts/diag-clips.ts`（全模型族排行，147 条全为 ≤0.5mm 级）。
// 口径：装配关系本身导致的咬合/贴合是机器，不是缺陷——不豁免真缺陷、也不修正确装配。
// 每条 = 一个审计单元（面板分组 + docs/qa/whitelist/<family>.png 隔离视图截图）。
// 深度守门取默认 2mm：豁免族里冒出超过贴面量级的深度时照报（判为真缺陷）。
// ============================================================================
export const tigerEngineExpectedContacts: ExpectedContactRule[] = [
  // ---------------- 曲柄连杆机构 ----------------
  {
    family: "conrod-split-face",
    a: "tiger.piston_rod.connecting_rod",
    b: "tiger.piston_rod.rod_cap",
    reason: "连杆大头是剖分式：瓦盖与杆身的剖分面本来就要贴合，两半合起来才是一个整圆轴瓦孔。",
  },
  {
    family: "crankpin-in-big-end",
    a: "tiger.crankshaft.crank_pin",
    b: "tiger.piston_rod.connecting_rod",
    reason: "曲柄销转在连杆大头轴瓦里：销面与瓦面是滑动轴承配合（名义零间隙），本来就要接触。",
  },
  {
    family: "crankpin-in-big-end",
    a: "tiger.crankshaft.crank_pin",
    b: "tiger.piston_rod.rod_cap",
    reason: "瓦盖内圈的轴瓦下半与曲柄销同面配合（与上半合成整圆）。",
  },
  {
    family: "piston-pin-in-small-end",
    a: "tiger.piston_rod.piston_pin",
    b: "tiger.piston_rod.connecting_rod",
    reason: "活塞销穿在连杆小头铜套里（过盈/滑动配合），销面与套孔面咬合。",
  },
  {
    family: "conrod-pair-face",
    a: "tiger.piston_rod.connecting_rod",
    b: "tiger.piston_rod.connecting_rod",
    reason: "V12 每个曲柄销上并列两支连杆（同一销上左右缸各一支），两侧面贴合装配。",
  },
  {
    family: "conrod-pair-face",
    a: "tiger.piston_rod.rod_cap",
    b: "tiger.piston_rod.rod_cap",
    reason: "并列连杆的瓦盖同样成对贴装在同一曲柄销上。",
  },

  // ---------------- 缸体 / 缸盖 / 配气 ----------------
  {
    family: "liner-press-fit",
    a: "tiger.cylinder.block",
    b: "tiger.cylinder.liner",
    reason: "湿式缸套过盈压入缸体镗孔、下端坐在缸体肩面上：压装面本来就是咬合的（径向 4mm 水套环隙在镗孔内侧，不参与接触）。",
  },
  {
    family: "valve-on-seat",
    a: "tiger.cylinder.head",
    b: "tiger.valvetrain.valve",
    reason: "气门盘落在缸盖燃烧室孔的气门座上、阀杆伸进导管口：座面与导向面本来就是配合面。",
  },
  {
    family: "carburetor-flange",
    a: "tiger.cylinder.head",
    b: "tiger.induction.carburetor",
    reason: "化油器法兰面坐在缸盖进气法兰面上，螺栓压紧的贴合面。",
  },
  {
    family: "camshaft-through-bores",
    a: "tiger.cylinder.block",
    b: "tiger.valvetrain.camshaft_*",
    reason: "凸轮轴穿过缸体的凸轮轴孔（轴颈坐在孔里）：孔是多边形近似，0.5mm 级是内接边长吃掉的名义间隙。",
  },
  {
    family: "camshaft-through-bores",
    a: "tiger.cylinder.head",
    b: "tiger.valvetrain.camshaft_*",
    reason: "凸轮轴继续穿过缸盖上的凸轮轴孔（孔为多边形近似）。",
  },
  {
    family: "camshaft-through-bores",
    a: "tiger.cylinder.head_gasket",
    b: "tiger.valvetrain.camshaft_*",
    reason: "缸垫在凸轮轴孔处同样被轴穿过（垫片开口与轴同心）。",
  },
  {
    family: "camshaft-through-bores",
    a: "tiger.cylinder.cam_cover",
    b: "tiger.valvetrain.camshaft_*",
    reason: "凸轮轴罩盖在凸轮轴上方，罩壁与轴同心（罩内腔让出轴与凸轮）。",
  },
  {
    family: "air-filter-on-cam-cover",
    a: "tiger.cylinder.cam_cover",
    b: "tiger.induction.air_filter",
    reason: "空滤器坐落在缸盖罩顶上：底面与罩顶面是承载贴合面。",
  },

  // ---------------- 冷却 ----------------
  {
    family: "fan-bearing-press-fit",
    a: "tiger.cooling.fan_bearing",
    b: "tiger.cooling.fan_frame",
    reason: "风扇轴承压入风扇框架的轴承孔（压装配合）。",
  },
  {
    family: "belt-on-pulley",
    a: "tiger.cooling.fan_rotor",
    b: "tiger.cooling.drive_belt",
    reason: "皮带包在风扇皮带轮上：带传动的包角接触（带面与轮槽面贴合）。",
  },
  {
    family: "fan-frame-passage",
    a: "tiger.cooling.fan_frame",
    b: "tiger.accessory.water_pipe_*",
    reason: "两根水管从风扇框架的开口穿过：框架让出管位，开口边缘与管壁相邻。",
  },
  {
    family: "fan-frame-passage",
    a: "tiger.crankcase.timing_cover",
    b: "tiger.cooling.fan_frame",
    reason: "正时盖外缘落在风扇框架的开口边缘里（框架开口按正时盖轮廓让位）。",
  },
  {
    family: "fan-frame-passage",
    a: "tiger.crankshaft.nose",
    b: "tiger.cooling.fan_frame",
    reason: "曲轴鼻（皮带轮端）穿过风扇框架的中心开口。",
  },

  // ---------------- 曲轴箱前脸 ----------------
  {
    family: "front-face-mount",
    a: "tiger.crankcase.oil_filler",
    b: "tiger.cooling.fan_frame",
    reason: "机油加注口与风扇框架同装在端板正面：框架背平面与件的外端面齐平装配。",
  },
  {
    family: "front-face-mount",
    a: "tiger.crankcase.nameplate",
    b: "tiger.cooling.fan_frame",
    reason: "铭牌贴在端板正面，风扇框架贴着端板安装，两者在深度方向共面相邻。",
  },
  {
    family: "front-face-mount",
    a: "tiger.crankcase.breather",
    b: "tiger.cooling.fan_frame",
    reason: "呼吸器装在端板正面，与风扇框架同一安装面。",
  },
  {
    family: "water-pipe-on-rib",
    a: "tiger.crankcase.rib",
    b: "tiger.accessory.water_pipe_*",
    reason: "水管沿侧壁外走线，管子搁在肋板外缘上（肋板就是它的搁置面，管夹压在这段）。",
  },

  // ---------------- 进排气 ----------------
  {
    family: "exhaust-pipe-socket",
    a: "tiger.induction.exhaust_manifold_*",
    b: "tiger.induction.exhaust_pipe_*",
    reason: "排气管端插进排气歧管的承口（插接），承口内壁与管外壁咬合。",
  },
  {
    family: "manifold-mating-face",
    a: "tiger.induction.intake_manifold_*",
    b: "tiger.induction.exhaust_manifold_*",
    reason: "进/排气歧管共用同一个缸盖法兰面，背靠背贴合安装。",
  },

  // ---------------- 附件（当前 0 条命中，防后续扫描冒头） ----------------
  {
    family: "pipe-end-in-casting",
    a: "tiger.accessory.water_pump",
    b: "tiger.accessory.water_pipe_*",
    reason: "水管端头埋在水泵铸件里（隐藏接口）：管端不外露，接口藏在铸件内部。",
  },
];
