import * as THREE from "three";
import { bevelBoxGeometry, cylinderGeometry, sphereGeometry } from "../../kernel/geometry";

// ============================================================================
// t800/hardware —— 关节硬件与动力单元
//
// 真实网格里每块骨头是**独立对象**（源模型如此），关节处天然留缝。
// 补上终结者内骨骼该有的球铰（髋/膝/踝/肩/肘/腕）与胸腔动力组，
// 既补缝也更像参考图里的铬钢骨架。
// ============================================================================

/** 硬件种类。 */
export const HW_KIND = {
  /** 球铰 */
  ball: 0,
  /** 柱（沿 A→B） */
  column: 1,
  /** 方块（泵体 / 阀块） */
  box: 2,
} as const;

export type HardwareKind = (typeof HW_KIND)[keyof typeof HW_KIND];

/** 一件硬件。 */
export interface HardwareDef {
  key: string;
  kind: HardwareKind;
  /** 球/盒的中心（模型坐标） */
  at: [number, number, number];
  /** 柱的 B 点（模型坐标） */
  to?: [number, number, number];
  /** 球半径 */
  r?: number;
  /** 方块尺寸 */
  size?: [number, number, number];
  /** 材质 */
  material: string;
  /** 归属节点（部位名） */
  joint: string;
}

/**
 * 球铰表：位置取真实关节中心，挂在**子骨**节点上（跟着子骨转）。
 *
 * 注：实测真实网格里相邻骨头在关节处**本来就有重叠**（大腿↔膝段↔小腿的包围盒
 * 互相咬合），所以不再补球铰——补了反而是"埋进骨头里的死零件"。
 * 只保留胸腔动力组（胸廓内部本来就是空的）。
 */
const BALLS: Array<[string, [number, number, number], number, string]> = [];

/**
 * 胸腔动力组：装在胸廓的**中腔**里（脊柱与胸骨之间）。
 * 位置按实测避让：躯干中轴的实心结构在 z ≈ ±0.09 与 y ≈ 1.30 一带，
 * 所以动力组压在中线上、做成细长件（泵体 + 立式蓄能器 + 阀块）。
 */
const CHEST: HardwareDef[] = [
  {
    key: "chest_pump",
    kind: HW_KIND.column,
    at: [0.035, 1.2, 0.0],
    to: [0.035, 1.34, 0.0],
    r: 0.019,
    material: "gunmetal",
    joint: "bip_spine_3_06",
  },
  {
    key: "chest_acc",
    kind: HW_KIND.column,
    at: [-0.045, 1.22, 0.0],
    to: [-0.045, 1.36, 0.0],
    r: 0.022,
    material: "chrome",
    joint: "bip_spine_3_06",
  },
  {
    key: "chest_valve",
    kind: HW_KIND.box,
    at: [0.035, 1.37, 0.0],
    size: [0.035, 0.04, 0.07],
    material: "dark_chrome",
    joint: "bip_spine_3_06",
  },
];

/** 全部硬件。 */
export const HARDWARE: HardwareDef[] = [
  ...BALLS.map(([key, at, r, joint]) => ({
    key: `ball_${key}`,
    kind: HW_KIND.ball as HardwareKind,
    at,
    r,
    material: "chrome",
    joint,
  })),
  ...CHEST,
];

/** 硬件的装配中心（模型坐标）。 */
export function hardwareCenter(def: HardwareDef): [number, number, number] {
  if (def.kind === HW_KIND.column && def.to) {
    return [
      (def.at[0] + def.to[0]) / 2,
      (def.at[1] + def.to[1]) / 2,
      (def.at[2] + def.to[2]) / 2,
    ];
  }
  return def.at;
}

/** 生成硬件几何（以自身中心为原点）。 */
export function hardwareGeometry(def: HardwareDef): THREE.BufferGeometry {
  let geometry: THREE.BufferGeometry;
  switch (def.kind) {
    case HW_KIND.ball:
      geometry = sphereGeometry(def.r ?? 0.04, 20, 14);
      break;
    case HW_KIND.box: {
      const s = def.size ?? [0.05, 0.05, 0.05];
      geometry = bevelBoxGeometry(s[0], s[1], s[2], Math.min(s[0], s[1], s[2]) * 0.12);
      break;
    }
    case HW_KIND.column:
    default: {
      const to = def.to ?? def.at;
      const from = new THREE.Vector3(...def.at);
      const end = new THREE.Vector3(...to);
      const dir = end.clone().sub(from);
      const length = Math.max(dir.length(), 1e-4);
      geometry = cylinderGeometry(def.r ?? 0.02, length, def.r ?? 0.02, 20);
      const quat = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        dir.clone().normalize(),
      );
      const mid = from.clone().add(end).multiplyScalar(0.5);
      geometry.applyQuaternion(quat);
      geometry.translate(mid.x, mid.y, mid.z);
      break;
    }
  }
  geometry.computeBoundingBox();
  const center = (geometry.boundingBox ?? new THREE.Box3()).getCenter(new THREE.Vector3());
  geometry.translate(-center.x, -center.y, -center.z);
  geometry.computeVertexNormals();
  return geometry;
}
