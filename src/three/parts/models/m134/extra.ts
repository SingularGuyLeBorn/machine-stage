import * as THREE from "three";
import type { InstanceLayout } from "../../assembler/assembler";
import type { ModelRegistry } from "../../registry/types";
import { M134_CONSTANTS } from "./constants";

// ============================================================================
// models/m134/extra — M134 细部零件（6 套枪机/6 根枪管的子件 + 36 齿）
//
// 旧 M134 只有 19 个定义/132 个实例；这里把每套枪机和每根枪管拆到
// 枪机框、击针、抽壳钩、导销、闭锁凸榫、滚轮/滚轮销、抽壳簧，以及
// 枪管螺帽、枪口螺帽、准星、套管、膛线、枪口冠，并把减速大齿轮的
// 36 个齿独立成实例。数量：15 × 6 + 36 + 8 节弹链 × 6 = 306 个实例。
// ============================================================================

const COUNT = M134_CONSTANTS.BARREL_COUNT;
const SY = M134_CONSTANTS.STAGE_Y;
const RING_R = M134_CONSTANTS.BARREL_RING_R;

/** 枪机子件：沿用 m134BoltRing 的 6 个枪机中心，几何在局部偏置。 */
const boltDetail = (
  id: string,
  name_cn: string,
  name_en: string,
  build_order: number,
  geometry: ModelRegistry["parts"][number]["geometry"],
  source: string,
  material = "bolt_steel",
  offset?: [number, number, number],
): ModelRegistry["parts"][number] => ({
  id,
  name_cn,
  name_en,
  assembly: "bolts",
  build_layer: 2,
  build_order,
  instances: COUNT,
  indexed: true,
  instance_layout: "m134BoltRing",
  geometry,
  material,
  node: "M134Rotor",
  mate: offset ? { type: "absolute", position: offset } : { type: "absolute" },
  source,
});

/** 枪管子件：6 个枪管中心；用 m134BarrelDetail 按 partId 给沿轴位置。 */
const barrelDetail = (
  id: string,
  name_cn: string,
  name_en: string,
  build_order: number,
  geometry: ModelRegistry["parts"][number]["geometry"],
  source: string,
  material = "steel_blued",
): ModelRegistry["parts"][number] => ({
  id,
  name_cn,
  name_en,
  assembly: "rotor",
  build_layer: 2,
  build_order,
  instances: COUNT,
  indexed: true,
  instance_layout: "m134BarrelDetail",
  geometry,
  material,
  node: "M134Rotor",
  mate: { type: "absolute" },
  source,
});

const barrelOffsets: Record<string, number> = {
  "m134.barrel.nut": 0.085,
  "m134.barrel.sleeve": 0.205,
  "m134.barrel.front_sight": 0.515,
  "m134.barrel.muzzle_nut": 0.545,
  "m134.barrel.muzzle_crown": 0.558,
  "m134.barrel.rifling": 0.030,
};

/** 6 根枪管的细部布局：与 m134BarrelRing 同环，z 按子件变化。 */
export const m134BarrelDetail: InstanceLayout = ({ index, count, partId }) => {
  const angle = (index / count) * Math.PI * 2;
  const z = barrelOffsets[partId] ?? 0;
  // 车削几何沿局部 +Y 生长；先绕 X 转 90° 对齐枪管 +Z，再平移到
  // 对应枪管中心。旋转必须放进实例矩阵，不能放进 mate——否则布局
  // 的 z 偏移会被 mate 旋转成 -Y，子件会沿枪管轴线“掉”到台面。
  const m = new THREE.Matrix4().makeRotationX(Math.PI / 2);
  m.setPosition(Math.cos(angle) * RING_R, Math.sin(angle) * RING_R + SY, z);
  return m;
};

/** 减速大齿轮 36 齿：半径 46mm、z=-0.20；随 M134Gear 节点旋转。 */
export const m134GearTeeth: InstanceLayout = ({ index, count }) => {
  const angle = (index / count) * Math.PI * 2;
  const m = new THREE.Matrix4().makeRotationZ(angle);
  m.setPosition(Math.cos(angle) * 0.046, Math.sin(angle) * 0.046 + SY, -0.2);
  return m;
};

/** 枪机子件相对枪机中心的局部偏移（motion 逐帧复制枪机矩阵时用）。 */
export const M134_BOLT_DETAIL_OFFSETS: Record<string, [number, number, number]> = {
  "m134.bolt.carrier": [0, 0, 0],
  "m134.bolt.firing_pin": [0, 0, 0.045],
  "m134.bolt.extractor": [0.007, 0.004, 0.025],
  "m134.bolt.cam_pin": [0, 0.009, -0.015],
  "m134.bolt.return_spring": [0, 0, 0],
  "m134.bolt.locking_lug": [0, 0, 0.055],
  "m134.bolt.roller": [0.009, -0.007, 0.02],
  "m134.bolt.roller_pin": [0.009, -0.007, 0.02],
  "m134.bolt.extractor_spring": [0.007, 0.004, 0.03],
};

export const M134_EXTRA_PARTS: ModelRegistry["parts"] = [
  // ===================== 6 套枪机子件 =====================
  boltDetail(
    "m134.bolt.carrier",
    "枪机框（每管一套）",
    "Bolt carrier ×6",
    170,
    {
      type: "merge",
      parts: [
        { type: "box", w: 0.016, h: 0.014, d: 0.055, bevel: 0.001, at: [0, 0, 0.005] },
        { type: "box", w: 0.004, h: 0.004, d: 0.035, bevel: 0.0005, at: [0.008, 0.0, -0.005] },
      ],
    },
    "枪机框：包住枪机本体，后端连复进簧；导销带动它在凸轮槽内前后往复。",
  ),
  boltDetail(
    "m134.bolt.firing_pin",
    "击针",
    "Firing pin ×6",
    171,
    { type: "box", w: 0.003, h: 0.003, d: 0.045, bevel: 0.0004 },
    "击针：击发位被枪机框前推，穿过枪机头击发底火。",
    "steel_machined",
    [0, 0, 0.045],
  ),
  boltDetail(
    "m134.bolt.extractor",
    "抽壳钩",
    "Extractor ×6",
    172,
    { type: "box", w: 0.004, h: 0.010, d: 0.035, bevel: 0.0006 },
    "抽壳钩：钩住弹壳底缘，枪机后退时把空壳从弹膛里拉出。",
    "steel_machined",
    [0.007, 0.004, 0.025],
  ),
  boltDetail(
    "m134.bolt.cam_pin",
    "枪机导销",
    "Cam pin ×6",
    173,
    { type: "box", w: 0.005, h: 0.012, d: 0.005, bevel: 0.0006 },
    "枪机导销：插进转子凸轮槽，旋转时被迫前后运动——转管枪的「自动机」。",
    "steel_machined",
    [0, 0.009, -0.015],
  ),
  boltDetail(
    "m134.bolt.return_spring",
    "枪机复进簧",
    "Bolt return spring ×6",
    174,
    {
      type: "merge",
      parts: [
        { type: "box", w: 0.011, h: 0.011, d: 0.004, bevel: 0.0004, at: [0, 0, -0.068] },
        { type: "box", w: 0.011, h: 0.011, d: 0.004, bevel: 0.0004, at: [0, 0, -0.058] },
        { type: "box", w: 0.011, h: 0.011, d: 0.004, bevel: 0.0004, at: [0, 0, -0.048] },
        { type: "box", w: 0.011, h: 0.011, d: 0.004, bevel: 0.0004, at: [0, 0, -0.038] },
      ],
    },
    "枪机复进簧：凸轮槽释放枪机后把它推回闭锁位；6 套独立簧各自工作。",
    "steel_spring",
  ),
  boltDetail(
    "m134.bolt.locking_lug",
    "闭锁凸榫",
    "Locking lug ×6",
    175,
    { type: "box", w: 0.016, h: 0.008, d: 0.018, bevel: 0.0008 },
    "闭锁凸榫：枪机前转时卡进枪管节套的闭锁槽，承受 7.62×51 的膛压。",
    "steel_machined",
    [0, 0, 0.055],
  ),
  boltDetail(
    "m134.bolt.roller",
    "枪机滚轮",
    "Bolt roller ×6",
    176,
    { type: "sphere", r: 0.0035, segments: 10 },
    "枪机滚轮：在凸轮槽里滚动，减少 6000 发/分下的摩擦和磨损。",
    "steel_machined",
    [0.009, -0.007, 0.02],
  ),
  boltDetail(
    "m134.bolt.roller_pin",
    "滚轮销",
    "Roller pin ×6",
    177,
    { type: "box", w: 0.004, h: 0.004, d: 0.016, bevel: 0.0004 },
    "滚轮销：把滚轮固定在枪机框上。",
    "steel_machined",
    [0.009, -0.007, 0.02],
  ),
  boltDetail(
    "m134.bolt.extractor_spring",
    "抽壳钩簧",
    "Extractor spring ×6",
    178,
    { type: "box", w: 0.003, h: 0.003, d: 0.018, bevel: 0.0004 },
    "抽壳钩簧：把抽壳钩压向弹壳底缘，保证每发都能抓住壳。",
    "steel_spring",
    [0.007, 0.004, 0.03],
  ),
  // ===================== 6 根枪管子件 =====================
  barrelDetail(
    "m134.barrel.nut",
    "枪管固定螺帽",
    "Barrel nut ×6",
    179,
    {
      type: "lathe",
      profile: [
        [0.0084, 0],
        [0.0118, 0],
        [0.0118, 0.016],
        [0.0084, 0.016],
        [0.0084, 0],
      ],
      segments: 14,
    },
    "枪管固定螺帽：把每根枪管锁在转子前端孔座里，可单根更换。",
    "steel_phosphate",
  ),
  barrelDetail(
    "m134.barrel.sleeve",
    "枪管套管",
    "Barrel sleeve ×6",
    180,
    {
      type: "lathe",
      profile: [
        [0.0088, 0],
        [0.0128, 0],
        [0.0128, 0.030],
        [0.0088, 0.030],
        [0.0088, 0],
      ],
      segments: 14,
    },
    "枪管套管：中段加强套，抑制 6 管束高速旋转时的振动。",
    "steel_phosphate",
  ),
  barrelDetail(
    "m134.barrel.front_sight",
    "每管准星",
    "Front sight ×6",
    181,
    { type: "box", w: 0.004, h: 0.010, d: 0.012, bevel: 0.0005 },
    "每管准星：枪口箍上的刀片准星（6 根枪管各自有基准，但只校击发位）。",
  ),
  barrelDetail(
    "m134.barrel.muzzle_nut",
    "枪口螺帽",
    "Muzzle nut ×6",
    182,
    {
      type: "lathe",
      profile: [
        [0.0070, 0],
        [0.0105, 0],
        [0.0105, 0.018],
        [0.0070, 0.018],
        [0.0070, 0],
      ],
      segments: 14,
    },
    "枪口螺帽：锁住枪口箍和枪管端，防止连射时松脱。",
    "steel_phosphate",
  ),
  barrelDetail(
    "m134.barrel.muzzle_crown",
    "枪口冠",
    "Muzzle crown ×6",
    183,
    {
      type: "lathe",
      profile: [
        [0.0039, 0],
        [0.0072, 0],
        [0.0072, 0.010],
        [0.0039, 0.010],
        [0.0039, 0],
      ],
      segments: 14,
    },
    "枪口冠：保护膛线出口的倒角，保证弹头离开时燃气均匀。",
    "steel_blued",
  ),
  barrelDetail(
    "m134.barrel.rifling",
    "膛线（独立件）",
    "Rifling ×6",
    184,
    {
      type: "lathe",
      profile: [
        [0.0001, 0],
        [0.0036, 0],
        [0.0036, 0.50],
        [0.0001, 0.50],
      ],
      segments: 12,
    },
    "膛线：4 条右旋等齐膛线，缠距 12 英寸；作为独立件可在爆炸图里抽出。",
  ),
  // ===================== 减速齿轮 36 齿 =====================
  {
    id: "m134.drive.gear_tooth",
    name_cn: "减速齿轮齿（36 齿）",
    name_en: "Reduction gear tooth ×36",
    assembly: "drive",
    build_layer: 2,
    build_order: 185,
    instances: 36,
    indexed: true,
    instance_layout: "m134GearTeeth",
    geometry: { type: "box", w: 0.006, h: 0.010, d: 0.012, bevel: 0.0006 },
    material: "steel_machined",
    node: "M134Gear",
    mate: { type: "absolute" },
    source: "减速大齿轮的 36 个齿独立成实例：36:10 减速比，齿面与电机小齿轮啮合。",
  },
  // ===================== 外壳（正常闭合，爆炸/透视时脱开） =====================
  {
    id: "m134.housing.front_shell",
    name_cn: "固定机匣前段壳（全包）",
    name_en: "Front housing shell",
    assembly: "housing",
    build_layer: 5,
    build_order: 200,
    geometry: { type: "kit", kit: "m134FrontHousing", params: { w: 0.13, h: 0.15, z0: -0.20, z1: 0.06 } },
    material: "steel_phosphate",
    node: "M134Body",
    mate: { type: "absolute" },
    source: "固定机匣前段闭合壳：左右侧板把旋转机匣/6 套枪机两侧盖住，前端框 + 枪管束导环围住出管口，左下保留抛壳槽，两侧加耳轴座。后段电机座仍由原固定机匣承担。",
  },
  {
    id: "m134.feed.cover_shell",
    name_cn: "供弹机大盖（全包）",
    name_en: "Feeder cover shell",
    assembly: "feed",
    build_layer: 5,
    build_order: 201,
    geometry: { type: "kit", kit: "m134FeedCover", params: { w: 0.086, y: 0.098, zc: -0.02 } },
    material: "steel_phosphate",
    node: "M134Body",
    mate: { type: "absolute" },
    source: "供弹机大盖：覆盖脱链器、拨链轮和链道；两侧下裙边扣住供弹机，后端铰链、前端卡榫。弹链从左侧导入口进入，盖上后从外面看不到拨链齿。",
  },
  {
    id: "m134.barrel.shroud",
    name_cn: "枪管护罩（固定筒）",
    name_en: "Barrel shroud",
    assembly: "housing",
    build_layer: 5,
    build_order: 202,
    geometry: { type: "kit", kit: "m134BarrelShroud", params: { rOuter: 0.058, rInner: 0.050, z0: 0.075, z1: 0.225 } },
    material: "steel_phosphate",
    node: "M134Body",
    mate: { type: "absolute" },
    source: "枪管护罩：不旋转的固定筒，从机匣前端伸到枪管中段；四道加强箍 + 六条纵向筋 + 顶部导轨。枪口段六根枪管仍外露，保留 M134 的六管识别特征。",
  },
];
