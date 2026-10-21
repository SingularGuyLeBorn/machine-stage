import * as THREE from "three";
import { cylinderGeometry, tubeGeometry } from "../../kernel/geometry";

// ============================================================================
// t800/hydraulics —— 关节驱动液压缸（缸体 / 活塞 / 活塞杆 / 耳环×2 / 导向套 / 密封）
//
// 每根缸跨在一个关节上：A 点固定在**父骨**上（缸体 + A 端耳环随父骨走），
// B 点固定在**子骨**上（活塞杆 + B 端耳环随子骨走）。
//
// 行程是**几何解**：活塞杆露出长度 = |AB| - 缸体长度，
// 运行时由两端世界坐标实时算出，动画不写死任何数值。
// ============================================================================

/** 液压缸定义。 */
export interface HydraulicDef {
  /** 唯一键（如 "knee_r"） */
  key: string;
  /** 缸体端所属骨骼（部位名） */
  parent: string;
  /** 活塞杆端所属骨骼（部位名） */
  child: string;
  /** A 点（模型坐标，静止姿态）：缸体耳环中心 */
  a: [number, number, number];
  /** B 点（模型坐标，静止姿态）：活塞杆耳环中心 */
  b: [number, number, number];
  /** 缸体外半径 */
  r: number;
  /** 活塞杆半径 */
  rodR: number;
  /** 缸体长度（自 A 沿轴） */
  barrel: number;
  /** 活塞杆长度（自 B 反向） */
  rod: number;
}

/** 缸的零件种类。 */
export const HYD_KIND = {
  barrel: 0,
  piston: 1,
  rod: 2,
  eyeA: 3,
  eyeB: 4,
  sleeve: 5,
  seal: 6,
} as const;

export type HydKind = (typeof HYD_KIND)[keyof typeof HYD_KIND];

/** 缸壁厚度。 */
const WALL = 0.007;

/** 一根缸的全部零件（7 件）。 */
export interface HydraulicPlan {
  /** 种类 */
  kind: HydKind;
  /** 零件名后缀 */
  name: string;
  /** 材质 */
  material: string;
  /** 挂在哪个节点上 */
  attach: "parent" | "child" | "rod";
  /** 该零件在模型坐标下的中心（= 装配位） */
  center: [number, number, number];
}

interface RawCyl {
  key: string;
  parent: string;
  child: string;
  a: [number, number, number];
  b: [number, number, number];
  r: number;
  rodR: number;
}

/**
 * 缸位表（右侧 +Z；左侧由 z 镜像得到，关节名按几何实测对应）。
 * A/B 都取在骨头表面内侧一点，缸身略偏前（+X），让液压件露在外面看得见。
 */
const RAW: RawCyl[] = [
  // 右髋：骨盆 → 大腿
  {
    key: "hip_r",
    parent: "bip_pelvis_02",
    child: "LeftUpLegRoll_084",
    a: [0.055, 0.955, 0.115],
    b: [0.045, 0.865, 0.12],
    r: 0.027,
    rodR: 0.013,
  },
  // 右膝：大腿 → 胫段
  {
    key: "knee_r",
    parent: "LeftUpLegRoll_084",
    child: "bip_knee_R_079",
    a: [0.055, 0.6, 0.135],
    b: [0.03, 0.47, 0.145],
    r: 0.025,
    rodR: 0.012,
  },
  // 右踝：小腿 → 足
  {
    key: "ankle_r",
    parent: "LeftLegRoll_080",
    child: "bip_foot_R_081",
    a: [0.0, 0.165, 0.17],
    b: [0.012, 0.075, 0.19],
    r: 0.018,
    rodR: 0.009,
  },
  // 右肩：锁骨 → 上臂
  {
    key: "shoulder_r",
    parent: "bip_collar_R_07",
    child: "bip_upperArm_R_08",
    a: [0.02, 1.565, 0.15],
    b: [0.02, 1.5, 0.195],
    r: 0.024,
    rodR: 0.011,
  },
  // 右肘：上臂下段 → 前臂
  {
    key: "elbow_r",
    parent: "LeftArmRoll_helper_010",
    child: "LeftUpperForeArm_helper_037",
    a: [0.03, 1.3404, 0.245],
    b: [0.05, 1.2253, 0.23],
    r: 0.02,
    rodR: 0.0095,
  },
  // 右腕：前臂下段 → 手
  {
    key: "wrist_r",
    parent: "LeftLowerForeArm_helper_015",
    child: "bip_hand_R_016",
    a: [0.12, 1.083, 0.255],
    b: [0.15, 1.0343, 0.265],
    r: 0.015,
    rodR: 0.007,
  },
];

/** 左侧对应（关节名按几何实测：helper 骨前缀是反的）。 */
const RAW_LEFT: RawCyl[] = [
  {
    key: "hip_l",
    parent: "bip_pelvis_02",
    child: "RightUpLegRoll_092",
    a: [0.055, 0.955, -0.115],
    b: [0.045, 0.865, -0.12],
    r: 0.027,
    rodR: 0.013,
  },
  {
    key: "knee_l",
    parent: "RightUpLegRoll_092",
    child: "bip_knee_L_087",
    a: [0.055, 0.6, -0.135],
    b: [0.03, 0.47, -0.145],
    r: 0.025,
    rodR: 0.012,
  },
  {
    key: "ankle_l",
    parent: "RightLegRoll_088",
    child: "bip_foot_L_089",
    a: [0.0, 0.165, -0.17],
    b: [0.012, 0.075, -0.19],
    r: 0.018,
    rodR: 0.009,
  },
  {
    key: "shoulder_l",
    parent: "bip_collar_L_042",
    child: "bip_upperArm_L_047",
    a: [0.02, 1.565, -0.17],
    b: [0.02, 1.5, -0.215],
    r: 0.024,
    rodR: 0.011,
  },
  {
    key: "elbow_l",
    parent: "RightArmRoll_helper_049",
    child: "RightUpperForeArm_helper_077",
    a: [0.03, 1.3533, -0.25],
    b: [0.05, 1.2381, -0.235],
    r: 0.02,
    rodR: 0.0095,
  },
  {
    key: "wrist_l",
    parent: "RightLowerForeArm_helper_054",
    child: "bip_hand_L_055",
    a: [0.12, 1.0959, -0.26],
    b: [0.15, 1.0472, -0.27],
    r: 0.015,
    rodR: 0.007,
  },
];

/** 中轴三根：脊柱中央液压柱、腰椎、颈。 */
const RAW_SPINE: RawCyl[] = [
  {
    // 脊柱中央液压柱：骨盆 → 颈，背部正中，脊柱弯伸时它撑/收
    key: "spine_column",
    parent: "bip_pelvis_02",
    child: "bip_neck_039",
    a: [-0.105, 1.08, 0.0],
    b: [-0.05, 1.63, 0.0],
    r: 0.013,
    rodR: 0.0065,
  },
  {
    key: "lumbar",
    parent: "bip_pelvis_02",
    child: "bip_spine_1_04",
    a: [0.03, 1.05, 0.0],
    b: [-0.02, 1.16, -0.01],
    r: 0.03,
    rodR: 0.014,
  },
  {
    key: "neck",
    parent: "bip_spine_3_06",
    child: "bip_neck_039",
    a: [0.03, 1.655, -0.01],
    b: [0.03, 1.7, -0.01],
    r: 0.022,
    rodR: 0.01,
  },
];

/** 缸长按两端静止距离定：缸体约一半，杆略长于一半（保证回缩时仍在缸内）。 */
function finalize(raw: RawCyl): HydraulicDef {
  const a = new THREE.Vector3(...raw.a);
  const b = new THREE.Vector3(...raw.b);
  const len = a.distanceTo(b);
  return {
    ...raw,
    barrel: len * 0.5,
    rod: len * 0.62,
  };
}

/**
 * 竖脊肌缸（左右各一）：骨盆 → 锁骨，背部两侧。
 * 作用是"竖脊肌"——脊柱前弯时它们被拉长，脊柱后伸时被压缩。
 */
const RAW_ERECTOR: RawCyl[] = [
  {
    key: "erector_r",
    parent: "bip_pelvis_02",
    child: "bip_spine_2_05",
    a: [-0.075, 1.115, 0.055],
    b: [-0.055, 1.295, 0.075],
    r: 0.015,
    rodR: 0.007,
  },
  {
    key: "erector_l",
    parent: "bip_pelvis_02",
    child: "bip_spine_2_05",
    a: [-0.075, 1.115, -0.055],
    b: [-0.055, 1.295, -0.075],
    r: 0.015,
    rodR: 0.007,
  },
];

/** 全部液压缸（17 根）。 */
export const HYDRAULICS: HydraulicDef[] = [
  ...RAW,
  ...RAW_LEFT,
  ...RAW_SPINE,
  ...RAW_ERECTOR,
].map(finalize);

/** 缸键 → 定义。 */
export const HYDRAULIC_BY_KEY = new Map(HYDRAULICS.map((h) => [h.key, h]));

/** 活塞杆节点的节点名。 */
export const rodNodeName = (key: string) => `T800_rod_${key}`;

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** 缸轴（静止姿态，父骨坐标系里的方向）。 */
export function cylinderAxis(def: HydraulicDef): THREE.Vector3 {
  return V(...def.b).sub(V(...def.a)).normalize();
}

/** 缸的零件清单（几何中心 + 归属节点）。 */
export function hydraulicPlans(def: HydraulicDef): HydraulicPlan[] {
  const axis = cylinderAxis(def);
  const a = V(...def.a);
  const b = V(...def.b);
  const muzzle = a.clone().add(axis.clone().multiplyScalar(def.barrel));
  const rodNear = b.clone().sub(axis.clone().multiplyScalar(def.rod));
  const mid = (p: THREE.Vector3, q: THREE.Vector3) => p.clone().add(q).multiplyScalar(0.5);

  return [
    {
      kind: HYD_KIND.barrel,
      name: "barrel",
      material: "chrome",
      attach: "parent",
      center: mid(a, muzzle).toArray() as [number, number, number],
    },
    {
      kind: HYD_KIND.piston,
      name: "piston",
      material: "gunmetal",
      attach: "rod",
      center: rodNear.toArray() as [number, number, number],
    },
    {
      kind: HYD_KIND.rod,
      name: "rod",
      material: "mirror",
      attach: "rod",
      center: mid(b, rodNear).toArray() as [number, number, number],
    },
    {
      kind: HYD_KIND.eyeA,
      name: "eye_a",
      material: "dark_chrome",
      attach: "parent",
      center: a.toArray() as [number, number, number],
    },
    {
      kind: HYD_KIND.eyeB,
      name: "eye_b",
      material: "dark_chrome",
      attach: "child",
      center: b.toArray() as [number, number, number],
    },
    {
      kind: HYD_KIND.sleeve,
      name: "guide_sleeve",
      material: "dark_chrome",
      attach: "parent",
      center: mid(muzzle.clone().sub(axis.clone().multiplyScalar(0.03)), muzzle).toArray() as [
        number,
        number,
        number,
      ],
    },
    {
      kind: HYD_KIND.seal,
      name: "seal",
      material: "rubber",
      attach: "parent",
      center: mid(muzzle.clone().sub(axis.clone().multiplyScalar(0.012)), muzzle).toArray() as [
        number,
        number,
        number,
      ],
    },
  ];
}

/** 把一段几何摆到 from→to 的轴上（几何以中点为原点）。 */
function place(geometry: THREE.BufferGeometry, from: THREE.Vector3, to: THREE.Vector3): void {
  const dir = to.clone().sub(from);
  const quat = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    dir.clone().normalize(),
  );
  const mid = from.clone().add(to).multiplyScalar(0.5);
  geometry.applyQuaternion(quat);
  geometry.translate(mid.x, mid.y, mid.z);
}

/** 生成一根缸的某个零件的几何（以零件中心为原点）。 */
export function hydraulicGeometry(def: HydraulicDef, kind: HydKind): THREE.BufferGeometry {
  const axis = cylinderAxis(def);
  const a = V(...def.a);
  const b = V(...def.b);
  const muzzle = a.clone().add(axis.clone().multiplyScalar(def.barrel));
  const rodNear = b.clone().sub(axis.clone().multiplyScalar(def.rod));
  let geometry: THREE.BufferGeometry;
  switch (kind) {
    case HYD_KIND.barrel:
      geometry = tubeGeometry(def.r, def.r - WALL, def.barrel, 24);
      place(geometry, a, muzzle);
      break;
    case HYD_KIND.piston: {
      const h = 0.014;
      geometry = cylinderGeometry(def.r - WALL - 0.0012, h, def.r - WALL - 0.0012, 20);
      const c = rodNear.clone().add(axis.clone().multiplyScalar(h / 2));
      place(geometry, rodNear.clone().sub(axis.clone().multiplyScalar(h / 2)), c);
      break;
    }
    case HYD_KIND.rod:
      geometry = cylinderGeometry(def.rodR, def.rod, def.rodR, 18);
      place(geometry, rodNear, b);
      break;
    case HYD_KIND.eyeA: {
      const h = 0.016;
      geometry = cylinderGeometry(def.r * 1.35, h, def.r * 1.35, 20);
      place(geometry, a.clone().sub(axis.clone().multiplyScalar(h / 2)), a.clone().add(axis.clone().multiplyScalar(h / 2)));
      break;
    }
    case HYD_KIND.eyeB: {
      const h = 0.016;
      geometry = cylinderGeometry(def.r * 1.35, h, def.r * 1.35, 20);
      place(geometry, b.clone().sub(axis.clone().multiplyScalar(h / 2)), b.clone().add(axis.clone().multiplyScalar(h / 2)));
      break;
    }
    case HYD_KIND.sleeve: {
      const len = 0.03;
      const from = muzzle.clone().sub(axis.clone().multiplyScalar(len));
      geometry = tubeGeometry(def.r * 1.32, def.r + 0.0004, len, 24);
      place(geometry, from, muzzle);
      break;
    }
    case HYD_KIND.seal: {
      const len = 0.01;
      const from = muzzle.clone().sub(axis.clone().multiplyScalar(len));
      geometry = tubeGeometry(def.r * 1.1, def.r + 0.0006, len, 24);
      place(geometry, from, muzzle);
      break;
    }
    default:
      geometry = cylinderGeometry(0.001, 0.001, 0.001, 8);
  }
  geometry.computeBoundingBox();
  const center = (geometry.boundingBox ?? new THREE.Box3()).getCenter(new THREE.Vector3());
  geometry.translate(-center.x, -center.y, -center.z);
  geometry.computeVertexNormals();
  return geometry;
}
