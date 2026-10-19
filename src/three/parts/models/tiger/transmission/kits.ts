import * as THREE from "three";
import {
  bevelBoxGeometry,
  cylinderGeometry,
  mergeGeometries,
  plateGeometry,
  tubeGeometry,
} from "../../../kernel/geometry";
import type { GeometryBuilder } from "../../../assembler/geometry";

// ============================================================================
// models/tiger/transmission/kits —— 传动装置专用几何构造器（L2 第二批）
//
// 四个 kit（坐标直接写在「零件局部系 = 世界系」里，装配位由 layout 平移）：
//   gearboxCase   变速箱壳体（Olvar 40 12 16：腔壳 + 竖肋 + 机脚 + 输入座 + 预选阀座 + 油泵座）
//   gearboxCover  变速箱上盖（盖板 + 螺栓窝凸台 ×12 + 吊环 ×2 + 通气器）
//   steeringCase  转向机壳体（L 600 C：横置腔体 + 前盖 + 转向柱座 + 支承耳）
//   inputCase     终传输入壳体（鞍在终传壳内端外的卡圈 + 立柱 + 输入轴凸台，两侧同一几何平移）
//
// 竖向基准（与 L2 第一批自洽）：扭杆在 y = -0.585（顶面 -0.557），地板顶面 -0.305，
// 机脚 / 支承耳 / 中间支承底座一律坐到 -0.303（2mm 名义缝）；制动盘 φ550 盘心 y = 0，
// 盘底 -0.275，离地板 30mm。
// ============================================================================

type Params = Record<string, unknown>;

function num(params: Params | undefined, key: string, fallback?: number): number {
  const value = params?.[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (fallback !== undefined) return fallback;
  throw new Error(`transmission kit：参数 "${key}" 必须是数值（收到 ${String(value)}）`);
}

function box(
  list: THREE.BufferGeometry[],
  w: number,
  h: number,
  d: number,
  at: [number, number, number],
  bevel = 0.004,
) {
  const geometry = bevelBoxGeometry(w, h, d, bevel);
  geometry.translate(at[0], at[1], at[2]);
  list.push(geometry);
}

/** 立式圆柱（轴向 Y）。 */
function cyl(
  list: THREE.BufferGeometry[],
  r: number,
  h: number,
  at: [number, number, number],
  segments = 20,
  bevel = 0.002,
) {
  const geometry = cylinderGeometry(r, h, r, segments, bevel);
  geometry.translate(at[0], at[1], at[2]);
  list.push(geometry);
}

/** 横置圆柱（轴向 Z）：先按 Y 建再转 90°。 */
function cylZ(
  list: THREE.BufferGeometry[],
  r: number,
  h: number,
  at: [number, number, number],
  segments = 20,
  bevel = 0.002,
) {
  const geometry = cylinderGeometry(r, h, r, segments, bevel);
  geometry.rotateX(Math.PI / 2);
  geometry.translate(at[0], at[1], at[2]);
  list.push(geometry);
}

/** 环（轴向 Z）：把管体转过 90°。 */
function ringZ(
  list: THREE.BufferGeometry[],
  rOut: number,
  rIn: number,
  h: number,
  at: [number, number, number],
) {
  const geometry = tubeGeometry(rOut, rIn, h, 28);
  geometry.rotateX(Math.PI / 2);
  geometry.translate(at[0], at[1], at[2]);
  list.push(geometry);
}

/** 变速箱壳体：x 向为纵轴（xRear 朝发动机、xFront 朝车头）。 */
const gearboxCase: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const xr = num(p, "xRear");
  const xf = num(p, "xFront");
  const hw = num(p, "halfW");
  const wall = num(p, "wall");
  const yB = num(p, "yBottom");
  const yT = num(p, "yTop");
  const yFoot = num(p, "yFoot");
  const xc = (xr + xf) / 2;
  const xlen = xr - xf;
  const yIn = yB + wall; // 腔内底面
  const parts: THREE.BufferGeometry[] = [];

  // 底板 / 侧壁 / 前后壁（盒板拼壳）
  box(parts, xlen, wall, 2 * hw, [xc, yB + wall / 2, 0]);
  for (const s of [1, -1]) {
    box(parts, xlen, yT - yIn, wall, [xc, (yT + yIn) / 2, s * (hw - wall / 2)]);
    // 外侧竖肋 ×3
    for (const rx of [xc - 0.3, xc, xc + 0.3]) {
      box(parts, 0.032, yT - yB - 0.05, 0.024, [rx, (yT + yB) / 2, s * (hw + 0.012)]);
    }
  }
  box(parts, wall, yT - yIn, 2 * (hw - wall), [xr - wall / 2, (yT + yIn) / 2, 0]);
  box(parts, wall, yT - yIn, 2 * (hw - wall), [xf + wall / 2, (yT + yIn) / 2, 0]);
  // 前端面凸缘（接转向机）
  box(parts, 0.03, yT - yB, 2 * hw, [xf + 0.015, (yT + yB) / 2, 0]);
  // 后端面输入法兰座
  box(parts, 0.018, 0.2, 0.2, [xr + 0.009, 0, 0]);

  // 机脚 ×2（底面 -0.303，坐 L4 地板顶面 -0.305）
  for (const fx of [xr - 0.2, xf + 0.2]) {
    box(parts, 0.16, yB - yFoot, 0.6, [fx, (yB + yFoot) / 2, 0]);
  }

  // 预选阀座（-Z 侧，朝驾驶员一侧）：座面 + 加强台
  box(parts, 0.4, 0.2, 0.03, [xc + 0.02, 0.04, -(hw + 0.015)]);
  box(parts, 0.26, 0.14, 0.024, [xc + 0.02, 0.04, -(hw + 0.03)]);
  // 油泵座（后端下部）
  box(parts, 0.1, 0.12, 0.12, [xr + 0.05, -0.2, -0.2]);
  // 顶部法兰面（盖板坐落面）
  for (const s of [1, -1]) {
    box(parts, xlen - 0.02, 0.006, 0.05, [xc, yT + 0.003, s * (hw - 0.025)]);
  }

  return mergeGeometries(parts);
};

/** 变速箱上盖。 */
const gearboxCover: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const xr = num(p, "xRear");
  const xf = num(p, "xFront");
  const hw = num(p, "halfW");
  const yTop = num(p, "yTop");
  const xc = (xr + xf) / 2;
  const parts: THREE.BufferGeometry[] = [];

  // 盖板（比壳略小一圈；底面 0.33，与壳顶法兰面 0.326 留 4mm 缝）
  const plate = plateGeometry(xr - xf - 0.03, 2 * hw - 0.05, 0.026, 0.004);
  plate.rotateX(-Math.PI / 2);
  plate.translate(xc, yTop + 0.023, 0);
  parts.push(plate);
  // 螺栓窝凸台 ×12（4 边各 3）
  const padX = [xc - 0.28, xc, xc + 0.28];
  const padZ = [-(hw - 0.045), 0, hw - 0.045];
  for (const px of padX)
    for (const s of [1, -1]) box(parts, 0.055, 0.008, 0.05, [px, yTop + 0.04, s * (hw - 0.045)]);
  for (const pz of padZ) {
    box(parts, 0.055, 0.008, 0.05, [xr - 0.045, yTop + 0.04, pz]);
    box(parts, 0.055, 0.008, 0.05, [xf + 0.045, yTop + 0.04, pz]);
  }
  // 吊环 ×2（前后端）
  for (const ex of [xr - 0.1, xf + 0.1]) {
    box(parts, 0.05, 0.05, 0.02, [ex, yTop + 0.057, 0], 0.002);
    box(parts, 0.02, 0.02, 0.07, [ex, yTop + 0.082, 0], 0.002);
  }
  // 通气器
  cyl(parts, 0.026, 0.03, [xc - 0.06, yTop + 0.052, 0.12], 16, 0.003);
  cyl(parts, 0.018, 0.024, [xc - 0.06, yTop + 0.079, 0.12], 14, 0.003);
  // 内侧加强筋 ×2
  for (const gx of [xc - 0.16, xc + 0.16]) box(parts, 0.03, 0.02, 2 * hw - 0.12, [gx, yTop + 0.012, 0]);

  return mergeGeometries(parts);
};

/** 转向机 L 600 C 壳体（横置，z 向为长轴）。 */
const steeringCase: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const xFront = num(p, "xFront"); // -4.10
  const xRear = num(p, "xRear"); // -3.60
  const halfW = num(p, "halfW"); // 0.66
  const yB = num(p, "yBottom"); // -0.24
  const yT = num(p, "yTop"); // 0.22
  const colX = num(p, "colX", -3.8);
  const colZ = num(p, "colZ", -0.42);
  const xc = (xFront + xRear) / 2;
  const parts: THREE.BufferGeometry[] = [];

  box(parts, xRear - xFront, yT - yB, 2 * halfW, [xc, (yT + yB) / 2, 0], 0.008);
  // 前盖（x = xFront 面）：薄板 + 8 个螺栓窝
  box(parts, 0.022, yT - yB - 0.04, 2 * halfW - 0.04, [xFront - 0.011, (yT + yB) / 2, 0], 0.005);
  for (const bz of [-0.45, -0.15, 0.15, 0.45]) {
    for (const by of [0.02, -0.22]) {
      box(parts, 0.012, 0.05, 0.05, [xFront - 0.028, by, bz], 0.003);
    }
  }
  // 转向柱座（驾驶员侧 z = colZ；柱顶 y = 0.36 接 L3 方向盘）
  box(parts, 0.16, 0.06, 0.16, [colX, yT + 0.03, colZ], 0.012);
  cyl(parts, 0.052, 0.1, [colX, yT + 0.05, colZ], 20, 0.004);
  cyl(parts, 0.038, 0.06, [colX, yT + 0.11, colZ], 18, 0.003);
  // 支承耳 ×2（底面 -0.302，坐 L4 地板顶面 -0.305）
  for (const mx of [xc - 0.14, xc + 0.14]) {
    box(parts, 0.1, 0.062, 0.5, [mx, -0.271, 0], 0.008);
  }
  // 顶面加强台
  box(parts, xRear - xFront - 0.12, 0.02, 2 * halfW - 0.12, [xc, yT + 0.01, 0], 0.006);

  return mergeGeometries(parts);
};

/**
 * 终传输入壳体：局部原点 = 终传壳轴心（x = SPROCKET_X，y = 轴心高，z = ±1.045）。
 *   - 卡圈（环抱终传壳内端法兰，径向 5mm 间隙，整环 → 对局部 x/z 对称）
 *   - 立柱盒（底面离轴心 0.20，四角离轴心 ≥0.25，包住终传壳外圆 0.195）
 *   - 输入轴凸台（轴向 Z，伸到侧传动轴端头；内端面在局部 z = -0.039 处）
 * 对局部 z 对称 → 左右两侧用同一几何纯平移（不需镜像）。
 * z 向占位：±0.048（0.991~1.087）——外侧留履带销内端（z = ±1.094）7mm，内侧留车体侧板 28mm。
 */
const inputCase: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const caseW = num(p, "caseW", 0.3); // x 向
  const caseH = num(p, "caseH", 0.48);
  const caseD = num(p, "caseD", 0.096);
  const hubR = num(p, "hubR", 0.06);
  const hubY = num(p, "hubY", 0.654); // 输入凸台中心相对轴心的高度（= 侧传动轴高 0）
  const parts: THREE.BufferGeometry[] = [];

  // 卡圈（整环）
  ringZ(parts, 0.24, 0.2, 0.096, [0, 0, 0]);
  // 立柱（坐卡圈上，向上到输入凸台）
  box(parts, caseW, caseH, caseD, [0, 0.2 + caseH / 2, 0], 0.008);
  // 输入凸台（轴向 Z，内端面局部 z = -0.039）
  cylZ(parts, hubR, 0.078, [0.4, hubY, 0], 22, 0.003);
  // 螺栓窝 ×4（立柱顶面）
  for (const sx of [-0.1, 0.1]) {
    for (const sz of [-0.028, 0.028]) {
      cyl(parts, 0.014, 0.016, [sx, 0.2 + caseH + 0.008, sz], 6, 0.002);
    }
  }
  return mergeGeometries(parts);
};

export const tigerTransmissionKitBuilders: Record<string, GeometryBuilder> = {
  gearboxCase,
  gearboxCover,
  steeringCase,
  inputCase,
};
