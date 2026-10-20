import { KJ } from "./constants";

// ============================================================================
// models/kingjoe/rig —— 关节/液压/对接的共享骨架数据
//
// 这里只写「机构在哪里」：节点原点、液压缸筒出口 E、活塞杆耳环 C。
// 零件生成（parts）与动画求解（motion）都读同一份数据——改一处，几何与运动一起改。
// 液压杆节点 = E 为原点、+Y 指向 C；motion 每帧把杆节点放到
//   E' + dir × (|C'-E'| - L)
// 上，杆端耳环因此永远贴着 C'，伸进缸筒的部分被缸筒内孔容纳。
// ============================================================================

export type Vec3 = [number, number, number];
export type Side = "l" | "r";

export const sideSign = (side: Side): 1 | -1 => (side === "r" ? 1 : -1);

export const MODULE_NODE = {
  legs: "legs",
  stomach: "stomach",
  chest: "chest",
  ship: "ship",
} as const;

export const ROOT_ORIGIN: Record<string, Vec3> = {
  legs: [0, 0, 0],
  stomach: [0, KJ.STOMACH_Y, 0],
  chest: [0, KJ.CHEST_Y, 0],
  ship: [0, KJ.SHIP_Y, 0],
};

/** 关节节点在世界（装配态）坐标系里的原点。 */
export function jointOrigin(side: Side): Record<string, Vec3> {
  const s = sideSign(side);
  const legX = KJ.LEG_X * s;
  const armX = KJ.SHOULDER_X * s;
  const shoulderY = KJ.CHEST_Y + KJ.SHOULDER_Y;
  const elbowY = shoulderY - KJ.UPPER_ARM_L;
  const wristY = elbowY - KJ.FOREARM_L;
  return {
    [`hip_${side}`]: [legX, KJ.HIP_Y, 0],
    [`knee_${side}`]: [legX, KJ.KNEE_Y, 0],
    [`ankle_${side}`]: [legX, KJ.ANKLE_Y, 0],
    [`arm_${side}`]: [armX, shoulderY, 0],
    [`forearm_${side}`]: [armX, elbowY, 0],
    [`hand_${side}`]: [armX, wristY, 0],
    [`finger_${side}_0`]: [armX - 0.13, wristY - 0.42, 0.06],
    [`finger_${side}_1`]: [armX, wristY - 0.44, 0.06],
    [`finger_${side}_2`]: [armX + 0.13, wristY - 0.42, 0.06],
  };
}

export interface HydraulicSpec {
  id: string;
  side: Side;
  /** 缸筒挂点节点（相对该节点固定）。 */
  barrelNode: string;
  /** 缸筒出口 E（世界装配态）。 */
  exit: Vec3;
  /** 耳环挂点节点（随关节运动）。 */
  tipNode: string;
  /** 耳环 C（世界装配态）。 */
  tip: Vec3;
  /** 缸筒/杆件归属的机构说明（零件树提示用）。 */
  joint: string;
  /** 缸筒抱箍到安装面的支架落点（世界装配态）；未给则由邻近装甲自然支撑。 */
  mount?: Vec3;
}

function mirror(point: Vec3, side: Side): Vec3 {
  return [point[0] * sideSign(side), point[1], point[2]];
}

/** 左右各一套的液压缸（世界坐标按 +X 侧给出，左件镜像）。 */
function pair(
  id: string,
  side: Side,
  barrelNode: string,
  exit: Vec3,
  tipNode: string,
  tip: Vec3,
  joint: string,
  mount?: Vec3,
): HydraulicSpec {
  return {
    id,
    side,
    barrelNode: barrelNode.replace("{s}", side),
    exit: mirror(exit, side),
    tipNode: tipNode.replace("{s}", side),
    tip: mirror(tip, side),
    joint,
    mount: mount ? mirror(mount, side) : undefined,
  };
}

const LEG_HYDRAULICS: Omit<HydraulicSpec, "side">[] = [
  {
    id: "hip_main",
    barrelNode: "legs",
    exit: [KJ.LEG_X, KJ.HIP_Y - 0.26, -0.52],
    tipNode: "hip_{s}",
    tip: [KJ.LEG_X, KJ.HIP_Y - 0.7, -0.38],
    joint: "髋主驱动",
    mount: [0.56, 3.28, -0.47],
  },
  {
    id: "knee_main",
    barrelNode: "hip_{s}",
    exit: [KJ.LEG_X, KJ.KNEE_Y + 0.62, 0.49],
    tipNode: "knee_{s}",
    tip: [KJ.LEG_X, KJ.KNEE_Y + 0.18, 0.43],
    joint: "膝主驱动",
  },
  {
    id: "ankle_main",
    barrelNode: "knee_{s}",
    exit: [KJ.LEG_X, KJ.ANKLE_Y + 0.52, -0.4],
    tipNode: "ankle_{s}",
    tip: [KJ.LEG_X, KJ.ANKLE_Y + 0.12, -0.37],
    joint: "踝主驱动",
  },
];

const ARM_HYDRAULICS: Omit<HydraulicSpec, "side">[] = [
  {
    id: "shoulder_main",
    barrelNode: "chest",
    exit: [KJ.SHOULDER_X + 0.2, KJ.CHEST_Y + KJ.SHOULDER_Y - 0.18, 0.31],
    tipNode: "arm_{s}",
    tip: [KJ.SHOULDER_X + 0.2, KJ.CHEST_Y + KJ.SHOULDER_Y - 0.62, 0.30],
    joint: "肩主驱动",
    mount: [KJ.SHOULDER_POD_CX + KJ.SHOULDER_POD_W / 2, KJ.CHEST_Y + KJ.SHOULDER_Y, 0.5],
  },
  {
    id: "elbow_main",
    barrelNode: "arm_{s}",
    exit: [KJ.SHOULDER_X + 0.12, KJ.CHEST_Y + KJ.SHOULDER_Y - 0.6, -0.34],
    tipNode: "forearm_{s}",
    tip: [KJ.SHOULDER_X + 0.12, KJ.CHEST_Y + KJ.SHOULDER_Y - 1.12, -0.355],
    joint: "肘主驱动",
  },
];

export const HYDRAULICS: HydraulicSpec[] = (["l", "r"] as const).flatMap((side) => [
  ...LEG_HYDRAULICS.map((spec) => pair(spec.id, side, spec.barrelNode, spec.exit, spec.tipNode, spec.tip, spec.joint, spec.mount)),
  ...ARM_HYDRAULICS.map((spec) => pair(spec.id, side, spec.barrelNode, spec.exit, spec.tipNode, spec.tip, spec.joint, spec.mount)),
]);

export const hydraulicById = (id: string, side: Side): HydraulicSpec => {
  const spec = HYDRAULICS.find((item) => item.id === id && item.side === side);
  if (!spec) throw new Error(`kingjoe rig：未定义的液压缸 ${id}/${side}`);
  return spec;
};

export const hydraulicNodeName = (id: string, side: Side): string => {
  const pascal = id.replace(/(^|_)([a-z])/g, (_, __, ch) => ch.toUpperCase());
  return `rod${pascal}${side.toUpperCase()}`;
};

/** 节点原点（世界装配态）；rod 节点用液压缸出口。 */
export function nodeOrigin(name: string): Vec3 {
  if (name === "root") return [0, 0, 0];
  if (name === "legs") return ROOT_ORIGIN.legs;
  if (name === "stomach") return ROOT_ORIGIN.stomach;
  if (name === "chest") return ROOT_ORIGIN.chest;
  if (name === "ship") return ROOT_ORIGIN.ship;
  if (name.startsWith("rod")) {
    for (const spec of HYDRAULICS) {
      if (hydraulicNodeName(spec.id, spec.side) === name) return spec.exit;
    }
  }
  for (const side of ["l", "r"] as const) {
    const joints = jointOrigin(side);
    if (joints[name]) return joints[name];
  }
  throw new Error(`kingjoe rig：未知节点原点 ${name}`);
}

export interface DockSpec {
  id: string;
  upper: "ship" | "chest" | "stomach";
  lower: "chest" | "stomach" | "legs";
  upperNode: string;
  lowerNode: string;
  upperY: number;
  lowerTopY: number;
  lockNode: string;
  /** 下模块顶面到对接环座顶面的高度。 */
  collarH: number;
}

export const DOCKS: DockSpec[] = [
  {
    id: "neck",
    upper: "ship",
    lower: "chest",
    upperNode: "ship",
    lowerNode: "chest",
    upperY: KJ.SHIP_Y,
    lowerTopY: KJ.CHEST_TOP,
    lockNode: "shipLock",
    collarH: KJ.DOCK_H,
  },
  {
    id: "chest_stomach",
    upper: "chest",
    lower: "stomach",
    upperNode: "chest",
    lowerNode: "stomach",
    upperY: KJ.CHEST_Y,
    lowerTopY: KJ.STOMACH_TOP,
    lockNode: "chestLock",
    collarH: KJ.DOCK_H,
  },
  {
    id: "stomach_legs",
    upper: "stomach",
    lower: "legs",
    upperNode: "stomach",
    lowerNode: "legs",
    upperY: KJ.STOMACH_Y,
    lowerTopY: KJ.LEGS_TOP,
    lockNode: "stomachLock",
    collarH: KJ.DOCK_H,
  },
];

/** 模块高度（局部坐标）。 */
export const MODULE_H: Record<string, number> = {
  ship: KJ.SHIP_H,
  chest: KJ.CHEST_H,
  stomach: KJ.STOMACH_H,
  legs: KJ.LEGS_TOP,
};

/** 对接面世界高度。 */
export const DOCK_PLANE_Y: Record<string, number> = {
  neck: KJ.SHIP_Y,
  chest_stomach: KJ.CHEST_Y,
  stomach_legs: KJ.STOMACH_Y,
};

/** 喷口局部位置（随模块）。 */
export const NOZZLE_LOCAL: Record<string, Vec3[]> = {
  ship: [
    [-0.58, 0.52, -0.64],
    [-0.18, 0.52, -0.72],
    [0.18, 0.52, -0.72],
    [0.58, 0.52, -0.64],
  ],
  chest: [
    [-0.92, 0.52, -0.6],
    [-0.5, 0.52, -0.68],
    [0.5, 0.52, -0.68],
    [0.92, 0.52, -0.6],
  ],
  stomach: [
    [-0.72, 0.52, -0.56],
    [-0.32, 0.52, -0.66],
    [0.32, 0.52, -0.66],
    [0.72, 0.52, -0.56],
  ],
  legs: [
    [-0.92, 0.56, -0.6],
    [-0.4, 0.56, -0.66],
    [0.4, 0.56, -0.66],
    [0.92, 0.56, -0.6],
  ],
};

/** 反重力发生器局部位置（每体一套，藏在骨架内）。 */
export const AG_LOCAL: Record<string, Vec3> = {
  ship: [0, 0.58, -0.41],
  chest: [0, 0.9, -0.85],
  stomach: [0, 0.8, -0.12],
  legs: [0, 2.62, -0.05],
};

// —— 姿态数学（只用于装配态数据：把 +Y 对齐到给定方向）——
export function rotationFromY(direction: Vec3): [number, number, number] {
  const [x, y, z] = direction;
  const len = Math.hypot(x, y, z) || 1;
  const nx = x / len;
  const ny = y / len;
  const nz = z / len;
  // 从 +Y 到 n 的四元数（避免 gimbal 抖动：仅绕 X/Z）
  if (Math.abs(ny + 1) < 1e-6) return [180, 0, 0];
  const qx = nz;
  const qz = -nx;
  const qw = 1 + ny;
  const norm = Math.hypot(qx, qw, qz);
  const ex = (2 * Math.atan2(qx / norm, qw / norm) * 180) / Math.PI;
  const ez = (2 * Math.atan2(qz / norm, qw / norm) * 180) / Math.PI;
  return [ex, 0, ez];
}

export function restDirection(spec: HydraulicSpec): Vec3 {
  const [ex, ey, ez] = spec.exit;
  const [tx, ty, tz] = spec.tip;
  const dx = tx - ex;
  const dy = ty - ey;
  const dz = tz - ez;
  const len = Math.hypot(dx, dy, dz) || 1;
  return [dx / len, dy / len, dz / len];
}

export function hydraulicLength(spec: HydraulicSpec): number {
  return Math.hypot(spec.tip[0] - spec.exit[0], spec.tip[1] - spec.exit[1], spec.tip[2] - spec.exit[2]);
}

/** 直线插值（装配态几何用）。 */
export function along(from: Vec3, to: Vec3, t: number): Vec3 {
  return [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t, from[2] + (to[2] - from[2]) * t];
}

export function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function scale(v: Vec3, k: number): Vec3 {
  return [v[0] * k, v[1] * k, v[2] * k];
}
