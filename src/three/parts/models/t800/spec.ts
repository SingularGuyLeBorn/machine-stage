import * as THREE from "three";

// ============================================================================
// t800/spec —— 右腿单一真值源：关节坐标 / 骨段尺寸 / 关节标准 / 六根液压缸
//
// 坐标约定：+X 前（脚尖）、+Y 上、+Z 右。整条腿站立，髋 1.30m / 膝 0.72m /
// 踝 0.14m，脚底 y≈0。
//
// 关节一律是「上骨叉耳（cast 在上骨本体上）+ 下骨关节盘 + 横向铰链销」的
// 转动副：铰链销沿 Z，叉耳在 Z=±0.040，关节盘在中间，衬套压入叉耳孔。
//
// 液压缸一律「缸体挂父段、活塞杆挂子段」，两端为球头销 + 耳环（杆端球面轴承），
// 关节角度变化直接改变 |A-B|，露出杆长 = |AB| - 缸长（由动画写死位移是不允许的）。
//
// 所有安装面法线取 ±Z 且与缸轴垂直，因此耳环的孔轴恒为缸体节点局部 X 轴，
// 球头销轴（模型 ±Z）在耳环局部系里同样是 X —— 两者天然同轴。
// ============================================================================

export type Vec3 = [number, number, number];
/** 段：base = 骨盆（固定）/ hip = 大腿 / knee = 小腿 / ankle = 足。 */
export type Segment = "base" | "hip" | "knee" | "ankle";

/** 关节中心高度（模型坐标）。 */
export const JOINT_Y = {
  hip: 1.3,
  knee: 0.72,
  ankle: 0.14,
} as const;

/**
 * 关节中心的 X（模型坐标，+X 前）。
 * 膝盖比髋略后 20mm：股骨轴线后倾，大腿本体（股四头肌）再前移，
 * 于是大腿前缘鼓出；小腿本体后移到踝缸后方，形成小腿肚后凸。
 */
export const JOINT_X = {
  hip: 0,
  knee: 0,
  ankle: 0,
} as const;

/**
 * 转动副通用标准（三个关节共用，尺寸不同处单列）。
 *
 *   上骨（U）：叉耳 cast 在本体下端，z=±cheekZ，厚 cheekT，圆头半径 cheekR，
 *              轴承孔 cheekBore；本体下沿 = yJ + upperDrop。
 *   下骨（L）：关节盘（球头座）半径 discR，厚 discLen，铰孔 boreR，
 *              下方插销 stubR 插入上段骨腔；本体上沿 = yJ - lowerRise。
 *   铰链销：沿 Z 贯穿两片叉耳与关节盘。
 */
export const JOINT_STD = {
  cheekZ: 0.036,
  cheekT: 0.02,
  cheekR: 0.03,
  cheekBore: 0.0245,
  cheekTop: 0.05,
  discR: 0.029,
  discLen: 0.046,
  boreR: 0.0165,
  stubR: 0.012,
  stubDrop: 0.018,
  pinR: 0.0135,
  pinLen: 0.1,
  bushOuter: 0.0225,
  bushBore: 0.0165,
  bushLen: 0.014,
  clipOuter: 0.0205,
  clipBore: 0.0163,
  clipT: 0.004,
  /** 上骨本体下沿相对关节中心（叉耳顶端 yJ+cheekTop 再留 4mm 缝，容纳挤出倒角） */
  upperDrop: 0.055,
  /** 下骨本体上沿相对关节中心（叉耳底端 yJ-cheekR 再留 2.5mm 缝） */
  lowerRise: 0.046,
} as const;

/** 骨段（中空方管梁 + 端部叉耳/骨腔）。d = Z 向厚度，全腿统一。 */
export interface BoneSpec {
  /** 骨段 ID */
  key: string;
  name_cn: string;
  name_en: string;
  /** 截面宽（X） */
  w: number;
  /** 截面厚（Z） */
  d: number;
  /** 管腔半径 */
  bore: number;
  /** 截面圆角 */
  corner: number;
  /** 本体下沿（模型 Y） */
  bottom: number;
  /** 本体上沿（模型 Y） */
  top: number;
  /**
   * 本体相对关节连线的 X 偏移（+X 前）。
   * 腿的"S 曲线"就靠它：大腿本体前移（股四头肌弧度），小腿本体后移（小腿肚），
   * 而两端端板仍留在关节连线上 —— 于是骨段中心线前后摆动，不是一根直柱。
   */
  bodyX: number;
  /** 端板缩放（<1 = 关节处收细，膝盖比大腿小腿都窄） */
  endScale: number;
  /** 上端端板缩放（髋端/踝端保持全宽，腿段之间才连得上） */
  endTopScale: number;
  /** 下端端板的 X 偏移（局部坐标，对准下关节中心） */
  endBottomX: number;
}

export const BONES: Record<string, BoneSpec> = {
  femur: {
    key: "femur",
    name_cn: "股骨主骨",
    name_en: "Femur",
    w: 0.115,
    d: 0.068,
    bore: 0.015,
    corner: 0.012,
    bottom: JOINT_Y.knee + JOINT_STD.upperDrop,
    top: JOINT_Y.hip - JOINT_STD.lowerRise,
    /** 大腿本体前移 55mm：股四头肌弧度（局部坐标，骨段原点 = 髋中心） */
    bodyX: 0.055,
    /** 下端（膝）收细成腰 */
    endScale: 0.7,
    /** 上端（髋）保持全宽 */
    endTopScale: 1,
    /** 下端端板的 X 偏移（对准膝中心，局部坐标） */
    endBottomX: JOINT_X.knee,
  },
  tibia: {
    key: "tibia",
    name_cn: "胫骨主骨",
    name_en: "Tibia",
    w: 0.108,
    d: 0.068,
    bore: 0.014,
    corner: 0.012,
    bottom: JOINT_Y.ankle + JOINT_STD.upperDrop,
    top: JOINT_Y.knee - JOINT_STD.lowerRise,
    /** 小腿本体后移 35mm（局部坐标，骨段原点 = 膝中心）+ 踝驱动缸后置 → 小腿肚后凸 */
    bodyX: -0.035,
    /** 上端（膝）收细成腰 */
    endScale: 0.7,
    /** 下端（踝）保持全宽 */
    endTopScale: 0.8,
    /** 下端端板的 X 偏移（对准踝中心，局部坐标） */
    endBottomX: JOINT_X.ankle - JOINT_X.knee,
  },
};

/** 球头销（缸端/杆端球头螺栓）的统一尺寸。 */
export const STUD = {
  ballR: 0.012,
  shaftR: 0.0075,
  /** 球头中心相对安装面外移 */
  ballOffset: 0.028,
  /**
   * 球心到杆端（插销）长度。
   * 杆端压进凸台盲孔口 0.3mm（装配过盈，低于 0.5mm 检测阈）——既坐得住，
   * 又不会让采样点落到「窄孔深处」（那种点奇偶射线判定不可靠，会被误报成穿透）。
   */
  shaftLen: 0.0283,
  /** 安装凸台盲孔（比杆小 0.3mm = 压装过盈） */
  bossBore: 0.002,
  bossBoreDepth: 0.0005,
  /** 安装凸台面半径 */
  faceR: 0.017,
} as const;

/** 液压缸通用尺寸（局部 +Y = 缸轴，起点在 A 端球心）。 */
export const CYL = {
  /** 耳环外半径 */
  eyeOuter: 0.02,
  /** 耳环孔半径（球头球半径 + 0.8mm） */
  eyeBore: 0.016,
  /** 耳环宽度（沿销轴） */
  eyeWidth: 0.022,
  /** 耳环颈起点（离球心） */
  eyeClear: 0.0135,
  /** 耳环颈半径 */
  eyeNeckR: 0.01,
  /** 耳环颈长（颈末端留 2mm 缝再接活塞杆，避免杆端与耳环颈互相咬死） */
  eyeNeckLen: 0.022,
  /** 耳环台肩半径 */
  eyeCollarR: 0.018,
  eyeCollarH: 0.006,
  /** 缸底盖厚 */
  capH: 0.014,
  /** 导向套长 */
  glandH: 0.026,
  /** 导向套外凸 */
  glandBulge: 0.005,
  /** 杆密封长 */
  sealH: 0.007,
  /** 防尘圈长 */
  wiperH: 0.004,
  /** 活塞厚 */
  pistonH: 0.022,
  /** 活塞密封厚 */
  pistonSealH: 0.008,
  /** 杆端台肩 */
  rodCollarH: 0.006,
} as const;

/** 缸内各段的轴向位置（相对 A 端球心，米）。 */
export function cylinderLayout(spec: HydraulicSpec) {
  const span = length(spec);
  const eyeEnd = CYL.eyeClear + CYL.eyeNeckLen;
  const capStart = eyeEnd;
  const capEnd = capStart + CYL.capH;
  const barrelEnd = capEnd + spec.lc * span;
  const mouth = barrelEnd;
  const glandStart = mouth - CYL.glandH;
  /** 杆起点：耳环颈末端再留 1.5mm 缝，避免杆端端面与耳环端面共面 */
  const rodStart = CYL.eyeClear + CYL.eyeNeckLen + 0.0015;
  return {
    eyeEnd,
    capStart,
    capEnd,
    barrelStart: capEnd,
    barrelEnd,
    glandStart,
    mouth,
    rodStart,
    /** 活塞中心距 B 端球心（A→B 方向的反向坐标） */
    pistonFromB: rodStart + 0.85 * spec.lr * span,
  };
}

/** 安装点：骨段表面上的凸台（凸台面 + 法线）。 */
export interface MountSpec {
  /** 安装在哪个段上 */
  segment: Segment;
  /** 安装点（模型坐标，凸台面中心） */
  at: Vec3;
  /** 凸台面外法线（±Z） */
  normal: Vec3;
  /** 凸台从骨面伸出的长度 */
  out: number;
}

/** 液压缸规格：A/B 两端球心 + 缸径 + 行程比例。 */
export interface HydraulicSpec {
  key: string;
  name_cn: string;
  name_en: string;
  /** 缸体挂在哪个段 */
  parent: Segment;
  /** 活塞杆挂在哪个段 */
  child: Segment;
  /** A 端球心（模型坐标） */
  A: Vec3;
  /** B 端球心（模型坐标） */
  B: Vec3;
  /** A 端安装面法线 */
  normalA: Vec3;
  /** B 端安装面法线 */
  normalB: Vec3;
  /** 缸体外半径 */
  rBody: number;
  /** 缸体长 / |AB| */
  lc: number;
  /** 杆长 / |AB| */
  lr: number;
}

/** 球头销安装点表（12 个：六根缸各两端）。 */
export interface StudMount {
  key: string;
  end: "A" | "B";
  /** 所属节点（球头跟着骨段走） */
  node: string;
  /** 球心（模型坐标） */
  ball: Vec3;
  /** 销轴方向（模型坐标，= 安装面法线） */
  normal: Vec3;
}

/** 球心 = 安装面 + 凸台伸出长度 + 球心离面距离。 */
const mountBall = (mount: MountSpec): Vec3 => [
  mount.at[0] + mount.normal[0] * (mount.out + STUD.ballOffset),
  mount.at[1] + mount.normal[1] * (mount.out + STUD.ballOffset),
  mount.at[2] + mount.normal[2] * (mount.out + STUD.ballOffset),
];

// ---------------------------------------------------------------------------
// 六个安装点定义（凸台面中心 + 法线 + 凸台伸出长度）
// ---------------------------------------------------------------------------

/** 骨段 Z 面位置（凸台自此面伸出）。 */
const FACE_Z = 0.034; // 骨段 d/2

/** 髋部：髋轭侧板（骨盆轭比骨段宽，凸台自此面伸出）。 */
const PELVIS_FACE_Z = 0.055;

/**
 * 安装点表（凸台面中心，模型坐标）。
 *
 * 选点原则：
 *   ① 凸台自骨面伸出后，球心必须与另一端球心同 z —— 缸轴才能与销轴垂直。
 *   ② 凸台根部必须落在骨段本体上（本体有 X 偏移时，模型坐标要跟着偏）。
 *   ③ 关节盘插销与缸杆要形成真实力臂：膝前后两缸分居 +X / -X，
 *      屈膝时前缸伸长、后缸缩短，形成对置。
 *   ④ 大腿本体前移 24mm、小腿本体后移 8mm（见 BONES.*.bodyX），
 *      所以大腿侧凸台整体前移、小腿侧整体后移，交叉布置的力臂更足。
 */
export const MOUNTS: Record<string, MountSpec> = {
  // 髋屈曲缸：骨盆前上（+Z 侧） → 大腿前上
  hip_flex_a: { segment: "base", at: [0.13, 1.39, PELVIS_FACE_Z], normal: [0, 0, 1], out: 0.016 },
  hip_flex_b: { segment: "hip", at: [0.086, 1.09, FACE_Z], normal: [0, 0, 1], out: 0.037 },
  // 髋伸展缸：骨盆后上（-Z 侧） → 大腿后上
  hip_ext_a: { segment: "base", at: [-0.13, 1.39, -PELVIS_FACE_Z], normal: [0, 0, -1], out: 0.016 },
  hip_ext_b: { segment: "hip", at: [0.024, 1.09, -FACE_Z], normal: [0, 0, -1], out: 0.037 },
  // 膝后主缸：股骨前上 → 胫骨后下（交叉布置，缸轴与关节回转切向成角才有行程）
  knee_main_a: { segment: "hip", at: [0.083, 1.03, FACE_Z], normal: [0, 0, 1], out: 0.026 },
  knee_main_b: { segment: "knee", at: [-0.063, 0.6, FACE_Z], normal: [0, 0, 1], out: 0.026 },
  // 膝前补偿缸：股骨后上 → 胫骨前下（与主缸反向交叉，一伸一缩对置）
  knee_comp_a: { segment: "hip", at: [0.027, 0.93, -FACE_Z], normal: [0, 0, -1], out: 0.026 },
  knee_comp_b: { segment: "knee", at: [-0.007, 0.58, -FACE_Z], normal: [0, 0, -1], out: 0.026 },
  // 踝驱动缸（左右各一）：胫骨后 → 足后（后置，形成小腿肚的实体量）
  ankle_l_a: { segment: "knee", at: [-0.063, 0.46, FACE_Z], normal: [0, 0, 1], out: 0.026 },
  ankle_l_b: { segment: "ankle", at: [-0.055, 0.07, FACE_Z], normal: [0, 0, 1], out: 0.026 },
  ankle_r_a: { segment: "knee", at: [-0.063, 0.46, -FACE_Z], normal: [0, 0, -1], out: 0.026 },
  ankle_r_b: { segment: "ankle", at: [-0.055, 0.07, -FACE_Z], normal: [0, 0, -1], out: 0.026 },
};

/** 液压缸种子（安装点表 + 行程比例）。 */
interface CylinderSeed {
  key: string;
  name_cn: string;
  name_en: string;
  parent: Segment;
  child: Segment;
  /** A / B 端安装点键 */
  a: string;
  b: string;
  rBody: number;
  lc: number;
  lr: number;
}

const CYLINDER_SEEDS: CylinderSeed[] = [
  {
    key: "hip_flex",
    name_cn: "髋屈曲缸",
    name_en: "Hip flexion cylinder",
    parent: "base",
    child: "hip",
    a: "hip_flex_a",
    b: "hip_flex_b",
    rBody: 0.02,
    lc: 0.45,
    // 杆端余量要留足（缩回极限时杆端不能顶到缸底）：lr 偏小
    lr: 0.47,
  },
  {
    key: "hip_ext",
    name_cn: "髋伸展缸",
    name_en: "Hip extension cylinder",
    parent: "base",
    child: "hip",
    a: "hip_ext_a",
    b: "hip_ext_b",
    rBody: 0.02,
    lc: 0.45,
    lr: 0.5,
  },
  {
    key: "knee_main",
    name_cn: "膝后主液压缸",
    name_en: "Knee main cylinder",
    parent: "hip",
    child: "knee",
    a: "knee_main_a",
    b: "knee_main_b",
    rBody: 0.022,
    lc: 0.45,
    lr: 0.52,
  },
  {
    key: "knee_comp",
    name_cn: "膝前补偿缸",
    name_en: "Knee compensation cylinder",
    parent: "hip",
    child: "knee",
    a: "knee_comp_a",
    b: "knee_comp_b",
    rBody: 0.018,
    lc: 0.42,
    lr: 0.48,
  },
  {
    key: "ankle_l",
    name_cn: "踝左驱动缸",
    name_en: "Ankle left cylinder",
    parent: "knee",
    child: "ankle",
    a: "ankle_l_a",
    b: "ankle_l_b",
    rBody: 0.02,
    lc: 0.4,
    // 杆长比例要保证：活塞全程不出缸口（>5mm 余量）且杆端不脱缸
    lr: 0.55,
  },
  {
    key: "ankle_r",
    name_cn: "踝右驱动缸",
    name_en: "Ankle right cylinder",
    parent: "knee",
    child: "ankle",
    a: "ankle_r_a",
    b: "ankle_r_b",
    rBody: 0.02,
    lc: 0.4,
    // 杆长比例要保证：活塞全程不出缸口（>5mm 余量）且杆端不脱缸
    lr: 0.55,
  },
];

/** 六根液压缸。 */
export const T800_HYDRAULICS: HydraulicSpec[] = CYLINDER_SEEDS.map((seed) => ({
  key: seed.key,
  name_cn: seed.name_cn,
  name_en: seed.name_en,
  parent: seed.parent,
  child: seed.child,
  A: mountBall(MOUNTS[seed.a]),
  B: mountBall(MOUNTS[seed.b]),
  normalA: MOUNTS[seed.a].normal,
  normalB: MOUNTS[seed.b].normal,
  rBody: seed.rBody,
  lc: seed.lc,
  lr: seed.lr,
}));

/** 节点名（必须符合 [A-Za-z][A-Za-z0-9_]* 规范）。 */
export const NODES = {
  base: "T800Base",
  hip: "T800Hip",
  knee: "T800Knee",
  ankle: "T800Ankle",
} as const;

/** 节点 pivot（模型坐标）。 */
export const NODE_PIVOT: Record<string, Vec3> = {
  [NODES.base]: [0, 0, 0],
  [NODES.hip]: [0, JOINT_Y.hip, 0],
  [NODES.knee]: [JOINT_X.knee, JOINT_Y.knee, 0],
  [NODES.ankle]: [0, JOINT_Y.ankle, 0],
};

/** 液压缸节点名。 */
export const HYDRAULIC_NODE = (spec: HydraulicSpec, end: "cyl" | "rod") =>
  `T800${end === "cyl" ? "Cyl" : "Rod"}${spec.key
    .split("_")
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join("")}`;

/** 段 → 节点。 */
export const SEGMENT_NODE: Record<Segment, string> = {
  base: NODES.base,
  hip: NODES.hip,
  knee: NODES.knee,
  ankle: NODES.ankle,
};

/** 安装凸台埋进骨壁的深度（保证凸台根部落实在实心骨壁内，不悬在管腔上）。 */
export const BOSS_EMBED = 0.028;

/**
 * 骨段 kit 的安装凸台参数。
 *
 * 坐标说明：骨段零件挂在关节节点上，零件原点 = 节点 pivot（模型 x=0），
 * 所以凸台的局部 x 直接等于模型 x（本体偏移 bodyX 只挪骨段本体，不挪凸台位置）——
 * 但凸台必须落在偏移后的本体上，因此安装点的模型 x 要按本体范围挑。
 */
export function mountKitParams(
  key: string,
  centerY: number,
): {
  y: number;
  x: number;
  side: number;
  out: number;
  faceR: number;
  boreR: number;
  boreDepth: number;
  embed: number;
} {
  const mount = MOUNTS[key];
  return {
    y: mount.at[1] - centerY,
    x: mount.at[0],
    side: mount.normal[2] > 0 ? 1 : -1,
    out: mount.out,
    faceR: STUD.faceR,
    boreR: STUD.bossBore,
    boreDepth: STUD.bossBoreDepth,
    embed: BOSS_EMBED,
  };
}

/** 球头销安装点（12 个）。 */
export const T800_STUDS: StudMount[] = T800_HYDRAULICS.flatMap((spec) => [
  {
    key: spec.key,
    end: "A" as const,
    node: SEGMENT_NODE[spec.parent],
    ball: spec.A,
    normal: MOUNTS[`${spec.key}_a`].normal,
  },
  {
    key: spec.key,
    end: "B" as const,
    node: SEGMENT_NODE[spec.child],
    ball: spec.B,
    normal: MOUNTS[`${spec.key}_b`].normal,
  },
]);

/** 两点距离。 */
export function length(spec: HydraulicSpec): number {
  return new THREE.Vector3(...spec.A).distanceTo(new THREE.Vector3(...spec.B));
}

/** 缸体尺寸（含派生量）。 */
export interface CylinderDims {
  L: number;
  bore: number;
  rodR: number;
  pistonR: number;
}

export function cylinderDims(spec: HydraulicSpec): CylinderDims {
  return {
    L: length(spec),
    /** 缸膛：肌肉壳厚 ~52% 缸径 */
    bore: spec.rBody * 0.48,
    /** 活塞杆：细杆（"肌腱"），必须比耳环孔细 */
    rodR: spec.rBody * 0.3,
    pistonR: spec.rBody * 0.48 - 0.001,
  };
}

/**
 * 液压节点静止姿态：+Y 指向另一端，+X = 安装面法线（销轴方向）。
 * 这样耳环的孔轴恒为局部 X，球头销（模型 ±Z）在局部系里同轴。
 */
export function aimQuaternion(from: Vec3, to: Vec3, normal: Vec3): THREE.Quaternion {
  const y = new THREE.Vector3(...to).sub(new THREE.Vector3(...from)).normalize();
  const n = new THREE.Vector3(...normal).normalize();
  // 法线必须与缸轴垂直；不垂直时把法线投影到垂直于 y 的平面
  const proj = n.clone().addScaledVector(y, -n.dot(y));
  if (proj.lengthSq() < 1e-8) {
    proj.set(1, 0, 0).addScaledVector(y, -y.x);
    if (proj.lengthSq() < 1e-8) proj.set(0, 0, 1).addScaledVector(y, -y.z);
  }
  proj.normalize();
  const z = new THREE.Vector3().crossVectors(y, proj).normalize();
  const x = new THREE.Vector3().crossVectors(y, z).normalize();
  const m = new THREE.Matrix4().makeBasis(x, y, z);
  return new THREE.Quaternion().setFromRotationMatrix(m);
}

/** 静止姿态欧拉角（度，XYZ）。 */
export function restRotation(from: Vec3, to: Vec3, normal: Vec3): Vec3 {
  const q = aimQuaternion(from, to, normal);
  const e = new THREE.Euler().setFromQuaternion(q, "XYZ");
  return [
    THREE.MathUtils.radToDeg(e.x),
    THREE.MathUtils.radToDeg(e.y),
    THREE.MathUtils.radToDeg(e.z),
  ];
}

/**
 * 每根驱动缸拆成的独立件（件名后缀，与 segments/cylinder.ts 一一对应）。
 * 读数与文档都从这里取，避免「10 件/根」这类写死的数字。
 */
export const CYLINDER_PART_SUFFIXES = [
  "body",
  "cap",
  "clamp",
  "gland",
  "rod_seal",
  "wiper",
  "eye_a",
  "eye_b",
  "rod",
  "piston",
  "piston_seal",
] as const;

/** 站姿尺寸（给 UI / 文档引用）。 */
export const T800_DIMENSIONS = {
  totalHeight: 1.6,
  thigh: 0.516,
  shin: 0.516,
  footLength: 0.34,
  hydraulicCount: T800_HYDRAULICS.length,
  ballOffset: STUD.ballOffset,
};
