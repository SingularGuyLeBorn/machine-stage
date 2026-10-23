import * as THREE from "three";
import type { GeometryBuilder } from "../../assembler/geometry";
import { CV, hullHalfBeamAt } from "./constants";

// ============================================================================
// models/carrier/kits —— 舰体/飞行甲板平面轮廓与少量专用几何
//
// 平面轮廓用 Shape + ExtrudeGeometry：shape 的 (x, y) 就是舰体 (x, z)，
// 沿 +Z 挤出厚度后绕 X +90°，挤出方向变成 −Y，再平移到目标高度。
// ============================================================================

function planShape(points: Array<[number, number]>, inset = 0, bowInset = 0): THREE.Shape {
  const shape = new THREE.Shape();
  points.forEach(([x, z], index) => {
    const px = Math.sign(x) * Math.max(0.02, Math.abs(x) - inset);
    const pz = z + (z > 0 ? -bowInset : bowInset);
    if (index === 0) shape.moveTo(px, pz);
    else shape.lineTo(px, pz);
  });
  shape.closePath();
  return shape;
}

function extrudedPlan(points: Array<[number, number]>, thickness: number, topY: number): THREE.BufferGeometry {
  const shape = planShape(points);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: false,
    curveSegments: 1,
    steps: 1,
  });
  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, topY, 0);
  geometry.computeVertexNormals();
  return geometry;
}

/** 舰体平面轮廓：尾封板 → 舷侧 → 尖艏。 */
export function hullPlan(inset = 0): Array<[number, number]> {
  const points: Array<[number, number]> = [];
  const stern = CV.HULL_Z_STERN + inset;
  const bow = CV.HULL_Z_BOW - inset;
  points.push([-(hullHalfBeamAt(stern) - inset), stern]);
  points.push([hullHalfBeamAt(stern) - inset, stern]);
  for (let i = 1; i <= 18; i++) {
    const z = stern + ((bow - stern) * i) / 18;
    points.push([hullHalfBeamAt(z) - inset, z]);
  }
  for (let i = 18; i >= 0; i--) {
    const z = stern + ((bow - stern) * i) / 18;
    points.push([-(hullHalfBeamAt(z) - inset), z]);
  }
  return points;
}

/** 飞行甲板轮廓：右舷直边 + 左舷外飘 + 斜角艏 + 两处舷侧升降机开口。 */
function deckPlan(): Array<[number, number]> {
  const b = CV.DECK_BEAM / 2;
  const notchX = CV.ELEVATOR_X - CV.ELEVATOR_W / 2;
  const halfL = CV.ELEVATOR_L / 2 + 0.02;
  const points: Array<[number, number]> = [
    [-b + 0.2, CV.DECK_Z_STERN],
    [b, CV.DECK_Z_STERN],
  ];
  const elevators = [...CV.ELEVATOR_Z].sort((a, c) => a - c);
  for (const ez of elevators) {
    points.push([b, ez - halfL]);
    points.push([notchX, ez - halfL]);
    points.push([notchX, ez + halfL]);
    points.push([b, ez + halfL]);
  }
  // 右舷直边 + 方艏斜切；左舷为斜角甲板外飘（艉部收、舯部最宽、艏部收）。
  points.push([b, 12.5], [b - 0.35, 17.6], [b - 1.3, 19.4], [b - 2.2, 20.5]);
  points.push([-b + 2.4, 20.9], [-b + 1.3, 19.6], [-b + 0.1, 16.0], [-b - 0.7, 10.0], [-b - 1.05, 4.0], [-b - 1.05, -4.0], [-b - 0.9, -12.0], [-b - 0.4, CV.DECK_Z_STERN]);
  return points;
}

// ---- 舰体型线放样 ----------------------------------------------------------
// 56 站理论型线：圆舭（舭部椭圆过渡）、舷侧外飘、艏部前倾、艉部巡洋舰艉。
// 水线以下单独放样（防污红漆），水上部分灰色外板，两段在水线处共边。
const HULL_STATIONS = 56;
const HULL_WL = 1.8;
const HULL_DECK_BOTTOM = CV.DECK_Y + 0.02;

type HullStation = { z: number; base: number; bottom: number; bow: number };

function hullStationAt(z: number): HullStation {
  const base = hullHalfBeamAt(z);
  const bow = Math.min(1, Math.max(0, (z - 9) / (CV.HULL_Z_BOW - 9)));
  const stern = Math.min(1, Math.max(0, (-14.5 - z) / 4));
  const bottom = CV.HULL_BOTTOM + stern * stern * (3 - 2 * stern) * 0.62 + bow * bow * (3 - 2 * bow) * 0.52;
  return { z, base, bottom, bow };
}

/** 给定高度处的半宽（水线以下为椭圆舭部，以上为外飘直线）。 */
function hullHalfAt(st: HullStation, y: number): number {
  if (y <= HULL_WL) {
    const u = Math.min(1, Math.max(0, (y - st.bottom) / Math.max(0.05, HULL_WL - st.bottom)));
    return st.base * 0.88 * Math.sqrt(Math.max(0, 2 * u - u * u));
  }
  const t = Math.min(1, (y - HULL_WL) / (HULL_DECK_BOTTOM - HULL_WL));
  const flare = 0.1 + 0.07 * t;
  return st.base * (0.88 + (1.0 - 0.88) * Math.min(1, t / 0.42)) * (1 + flare * Math.max(0, t - 0.42)) + (t > 0.55 ? (0.22 + 0.42 * st.bow * st.bow) * ((t - 0.55) / 0.45) : 0);
}

/** 艏部前倾：越靠近甲板，环线越向艏前伸。 */
function hullRakeShift(st: HullStation, y: number): number {
  if (y <= HULL_WL) return 0;
  const t = Math.min(1, (y - HULL_WL) / (HULL_DECK_BOTTOM - HULL_WL));
  return st.bow * st.bow * Math.pow(t, 1.55) * 2.08;
}

function hullRing(st: HullStation, ys: number[]): THREE.Vector3[] {
  const side = (sign: number) =>
    ys.map((y) => new THREE.Vector3(sign * hullHalfAt(st, y), y, st.z + hullRakeShift(st, y)));
  const port = side(-1).reverse();
  const starboard = side(1);
  return [...port, ...starboard];
}

/** 由站点环线生成舰体曲面，法线按“离开舰体中线”朝外修正。 */
function loftHull(ys: (st: HullStation) => number[], cap: boolean): THREE.BufferGeometry {
  const stations = Array.from({ length: HULL_STATIONS }, (_, i) => {
    const z = CV.HULL_Z_STERN + (i * (CV.HULL_Z_BOW - CV.HULL_Z_STERN)) / (HULL_STATIONS - 1);
    return hullStationAt(z);
  });
  const rings = stations.map((st) => hullRing(st, ys(st)));
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const n = rings[0]!.length;
  for (const ring of rings) {
    for (const p of ring) {
      positions.push(p.x, p.y, p.z);
      uvs.push(p.z * 0.34, p.y * 0.34);
    }
  }
  for (let i = 0; i < rings.length - 1; i++) {
    for (let j = 0; j < n - 1; j++) {
      const a = i * n + j;
      const b = i * n + j + 1;
      const c = (i + 1) * n + j + 1;
      const d = (i + 1) * n + j;
      indices.push(a, b, c, a, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  // 统一朝外：用站点中线方向判断，避免左右舷绕序不一致导致半船透明。
  const pos = geometry.getAttribute("position");
  const nor = geometry.getAttribute("normal");
  const index = geometry.getIndex()!;
  for (let t = 0; t < index.count; t += 3) {
    const ia = index.getX(t);
    const ib = index.getX(t + 1);
    const ic = index.getX(t + 2);
    const cx = (pos.getX(ia) + pos.getX(ib) + pos.getX(ic)) / 3;
    const cy = (pos.getY(ia) + pos.getY(ib) + pos.getY(ic)) / 3;
    const cz = (pos.getZ(ia) + pos.getZ(ib) + pos.getZ(ic)) / 3;
    const nx = nor.getX(ia) + nor.getX(ib) + nor.getX(ic);
    const ny = nor.getY(ia) + nor.getY(ib) + nor.getY(ic);
    const nz = nor.getZ(ia) + nor.getZ(ib) + nor.getZ(ic);
    const ox = cx;
    const oz = cz - hullStationAt(cz).z;
    if (nx * ox + ny * cy * 0.15 + nz * oz < 0) {
      indices[t] = ia;
      indices[t + 1] = ic;
      indices[t + 2] = ib;
    }
  }
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  if (cap) {
    // 艉封板与艏柱封口
    const addCap = (ringIndex: number, forward: boolean) => {
      const ring = rings[ringIndex]!;
      const base = ringIndex * n;
      let cx = 0;
      let cy = 0;
      let cz = 0;
      for (const p of ring) {
        cx += p.x;
        cy += p.y;
        cz += p.z;
      }
      const center = new THREE.Vector3(cx / ring.length, cy / ring.length, cz / ring.length);
      const centerIndex = positions.length / 3;
      positions.push(center.x, center.y, center.z);
      uvs.push(center.z * 0.34, center.y * 0.34);
      for (let j = 0; j < ring.length - 1; j++) {
        const a = base + j;
        const b = base + j + 1;
        if (forward) indices.push(centerIndex, b, a);
        else indices.push(centerIndex, a, b);
      }
    };
    addCap(0, false);
    addCap(rings.length - 1, true);
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
  }
  return geometry;
}

/** 供表面件定位：某站位/高度的外板半宽。 */
export function hullSurfaceHalfAt(z: number, y: number): number {
  return hullHalfAt(hullStationAt(z), y);
}

/** 水线以上舰体外板：舭部以上到甲板底，含舷侧外飘与艏部前倾。 */
export const carrierHullShell: GeometryBuilder = () =>
  loftHull((st) => [HULL_WL, 2.12, 2.6, 3.45, HULL_DECK_BOTTOM].filter((y) => y >= st.bottom), true);

/** 水线以下舰体外板：防污红漆，圆舭过渡，含球鼻艏安装面。 */
export const carrierHullUnderwater: GeometryBuilder = () =>
  loftHull((st) => {
    const ys = [st.bottom];
    for (const f of [0.12, 0.3, 0.52, 0.76, 0.93]) ys.push(st.bottom + (HULL_WL - st.bottom) * f);
    ys.push(HULL_WL);
    return ys;
  }, true);

/** 水线漆带：水线处外贴 0.012 的黑色 boot topping。 */
export const carrierBootStripe: GeometryBuilder = () => {
  const geometry = loftHull((st) => [HULL_WL - 0.16, HULL_WL + 0.2].filter((y) => y >= st.bottom), false);
  geometry.scale(1.003, 1, 1);
  return geometry;
};

/** 舰岛传感器甲板室：近垂直八折角舱室（不是大斜坡顶棚），四面嵌相控阵，顶部做雷达平台。 */
export const carrierIslandTower: GeometryBuilder = () => {
  const sections = [
    { y: 0, w: 0.78, l: 2.46, c: 0.18 },
    { y: 0.58, w: 0.78, l: 2.46, c: 0.18 },
    { y: 0.86, w: 0.76, l: 2.4, c: 0.17 },
    { y: 1.0, w: 0.68, l: 2.28, c: 0.15 },
  ];
  const ring = (s: { w: number; l: number; c: number }) => [
    [-s.w + s.c, -s.l], [s.w - s.c, -s.l], [s.w, -s.l + s.c], [s.w, s.l - s.c],
    [s.w - s.c, s.l], [-s.w + s.c, s.l], [-s.w, s.l - s.c], [-s.w, -s.l + s.c],
  ];
  const positions: number[] = [];
  const indices: number[] = [];
  for (const sec of sections) for (const [px, pz] of ring(sec)) positions.push(px, sec.y, pz);
  for (let h = 0; h < sections.length - 1; h++) {
    for (let i = 0; i < 8; i++) {
      const a = h * 8 + i, b = h * 8 + ((i + 1) % 8);
      const c = (h + 1) * 8 + ((i + 1) % 8), d = (h + 1) * 8 + i;
      indices.push(a, d, c, a, c, b);
    }
  }
  const top = (sections.length - 1) * 8;
  for (let i = 1; i < 7; i++) indices.push(top, top + i, top + i + 1);
  const bottom = 0;
  for (let i = 1; i < 7; i++) indices.push(bottom, bottom + i + 1, bottom + i);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
};

/** 前倾舰艏楔形放样：从水线尖艏向甲板前缘外飘，侧面看是斜切艏而不是方盒。 */
export const carrierBowRake: GeometryBuilder = () => {
  const rings = [
    { y: 0.44, z: 18.5, half: 0.08 },
    { y: 1.35, z: 18.95, half: 0.38 },
    { y: 2.55, z: 19.35, half: 0.86 },
    { y: 3.75, z: 19.95, half: 1.1 },
    { y: 4.45, z: 20.55, half: 1.5 },
  ];
  const positions: number[] = [];
  const indices: number[] = [];
  const ringPts = rings.map((r) => [
    new THREE.Vector3(-r.half, r.y, r.z - 0.42),
    new THREE.Vector3(-r.half * 0.72, r.y, r.z + 0.08),
    new THREE.Vector3(0, r.y, r.z + 0.28),
    new THREE.Vector3(r.half * 0.72, r.y, r.z + 0.08),
    new THREE.Vector3(r.half, r.y, r.z - 0.42),
  ]);
  for (const ring of ringPts) for (const p of ring) positions.push(p.x, p.y, p.z);
  for (let h = 0; h < ringPts.length - 1; h++) {
    for (let i = 0; i < 4; i++) {
      const a = h * 5 + i;
      const b = h * 5 + i + 1;
      const c = (h + 1) * 5 + i + 1;
      const d = (h + 1) * 5 + i;
      indices.push(a, d, c, a, c, b);
    }
  }
  // 下水线底封口
  const bottom = 0;
  for (let i = 1; i < 4; i++) indices.push(bottom, bottom + i + 1, bottom + i);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
};

/** 保留 UV 的合并（外壳贴图依赖 UV，不能走只保留位置/法线的 merge）。 */
function mergeWithUv(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  for (const part of parts) {
    const g = part.getIndex() ? part.toNonIndexed() : part;
    const pos = g.getAttribute("position");
    const nor = g.getAttribute("normal");
    const uv = g.getAttribute("uv");
    for (let i = 0; i < pos.count; i++) {
      positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      if (nor) normals.push(nor.getX(i), nor.getY(i), nor.getZ(i));
      if (uv) uvs.push(uv.getX(i), uv.getY(i));
      else uvs.push(pos.getX(i) * 0.1, pos.getZ(i) * 0.1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  if (normals.length) geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  else geometry.computeVertexNormals();
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  return geometry;
}

/** 舰体底板（双层底的上层，随舭部收窄）。 */
export const carrierBottom: GeometryBuilder = () =>
  extrudedPlan(hullPlan(0.08).map(([x, z]) => [x * 0.42, z] as [number, number]), 0.14, CV.HULL_BOTTOM + 0.14);

/** 飞行甲板（装甲板 + 外飘轮廓 + 外飘段底面封板）。 */
export const carrierFlightDeck: GeometryBuilder = () => {
  const deck = extrudedPlan(deckPlan(), CV.DECK_T, CV.DECK_Y + CV.DECK_T);
  const shape = planShape(deckPlan());
  shape.holes.push(new THREE.Path(planShape(hullPlan(0.03)).getPoints(200)));
  const overhang = new THREE.ExtrudeGeometry(shape, {
    depth: 0.025,
    bevelEnabled: false,
    curveSegments: 1,
    steps: 1,
  });
  overhang.rotateX(Math.PI / 2);
  overhang.translate(0, CV.DECK_Y + 0.005, 0);
  overhang.computeVertexNormals();
  return mergeWithUv([deck, overhang]);
};

/** 机库甲板（舰体内轮廓缩进）。 */
export const carrierHangarDeck: GeometryBuilder = () =>
  extrudedPlan(hullPlan(0.42), 0.09, CV.HANGAR_Y + 0.09);

/** 下层甲板。 */
export const carrierLowerDeck: GeometryBuilder = () =>
  extrudedPlan(hullPlan(0.3), 0.08, CV.LOWER_DECK_Y + 0.08);

/** DSI 无附面层隔道进气道鼓包：沿机身轴放样的椭圆隆起。 */
export const carrierDsiBump: GeometryBuilder = () => {
  const rings = [
    { z: 0.55, r: 0.012, y: -0.01 },
    { z: 0.64, r: 0.055, y: 0.0 },
    { z: 0.74, r: 0.088, y: 0.005 },
    { z: 0.84, r: 0.1, y: 0.008 },
    { z: 0.94, r: 0.085, y: 0.004 },
    { z: 1.02, r: 0.05, y: -0.002 },
    { z: 1.06, r: 0.012, y: -0.01 },
  ];
  const segments = 18;
  const positions: number[] = [];
  const indices: number[] = [];
  for (const ring of rings) {
    for (let i = 0; i < segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      positions.push(Math.cos(a) * ring.r, ring.y + Math.sin(a) * ring.r * 0.62, ring.z);
    }
  }
  for (let h = 0; h < rings.length - 1; h++) {
    for (let i = 0; i < segments; i++) {
      const a = h * segments + i;
      const b = h * segments + ((i + 1) % segments);
      const c = (h + 1) * segments + ((i + 1) % segments);
      const d = (h + 1) * segments + i;
      indices.push(a, d, c, a, c, b);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
};

// ---- 海面与尾流（fx） ------------------------------------------------------
const SEA_LEVEL = 1.8;

// ---- FFT 海面：Phillips 谱 + 2D 逆 FFT，多尺度涌浪取代单组正弦波 ----
const OCEAN_N = 128;
function fft1d(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i]!; re[i] = re[j]!; re[j] = tr;
      const ti = im[i]!; im[i] = im[j]!; im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const angle = (2 * Math.PI) / len;
    const wr = Math.cos(angle);
    const wi = Math.sin(angle);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let j = 0; j < len / 2; j++) {
        const ar = re[i + j]!;
        const ai = im[i + j]!;
        const br = re[i + j + len / 2]! * cr - im[i + j + len / 2]! * ci;
        const bi = re[i + j + len / 2]! * ci + im[i + j + len / 2]! * cr;
        re[i + j] = ar + br;
        im[i + j] = ai + bi;
        re[i + j + len / 2] = ar - br;
        im[i + j + len / 2] = ai - bi;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
}

/** FFT 海面高度场（静态时刻的谱合成）：真实多方向涌浪 + 细碎波峰，返回 N×N 高度。 */
function fftOceanHeights(size: number, spanX: number, spanZ: number, time: number): Float32Array {
  const n = OCEAN_N;
  const re = new Float64Array(n * n);
  const im = new Float64Array(n * n);
  const seed = (() => {
    let s = 20261023;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  })();
  const windX = Math.cos(0.42);
  const windZ = Math.sin(0.42);
  for (let ky = 0; ky < n; ky++) {
    const mz = ky < n / 2 ? ky : ky - n;
    for (let kx = 0; kx < n; kx++) {
      const mx = kx < n / 2 ? kx : kx - n;
      const wx = (2 * Math.PI * mx) / spanX;
      const wz = (2 * Math.PI * mz) / spanZ;
      const kLen = Math.hypot(wx, wz);
      if (kLen < 0.12) continue;
      const dir = (wx / kLen) * windX + (wz / kLen) * windZ;
      if (dir <= 0.05) continue;
      const amp =
        (0.0011 * dir * dir * Math.exp(-1 / (kLen * kLen * 1.4))) /
        Math.pow(kLen, 2.15);
      const omega = Math.sqrt(9.81 * kLen);
      const phase = seed() * Math.PI * 2 + omega * time;
      const i = ky * n + kx;
      re[i] = amp * Math.cos(phase);
      im[i] = amp * Math.sin(phase);
      const m = ((n - ky) % n) * n + ((n - kx) % n);
      re[m] = re[i]!;
      im[m] = -im[i]!;
    }
  }
  for (let y = 0; y < n; y++) fft1d(re.subarray(y * n, y * n + n), im.subarray(y * n, y * n + n));
  const colRe = new Float64Array(n);
  const colIm = new Float64Array(n);
  for (let x = 0; x < n; x++) {
    for (let y = 0; y < n; y++) {
      colRe[y] = re[y * n + x]!;
      colIm[y] = im[y * n + x]!;
    }
    fft1d(colRe, colIm);
    for (let y = 0; y < n; y++) {
      re[y * n + x] = colRe[y]!;
      im[y * n + x] = colIm[y]!;
    }
  }
  const out = new Float32Array(size * size);
  let energy = 0;
  let count = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const sx = Math.floor((x / size) * n);
      const sy = Math.floor((y / size) * n);
      const v = re[sy * n + sx]! / (n * n);
      out[y * size + x] = v;
      energy += v * v;
      count += 1;
    }
  }
  // 按 RMS 归一化（而不是单个峰值），避免低频单峰把其余涌浪压平；再限幅防止尖刺。
  const rms = Math.sqrt(energy / Math.max(1, count)) || 1;
  const scale = 0.18 / rms;
  for (let i = 0; i < out.length; i++) {
    out[i] = Math.max(-0.45, Math.min(0.45, out[i]! * scale));
  }
  return out;
}

/** 透明海面：FFT 多尺度涌浪，透出下方红色舰底与桨舵。 */
export const carrierSeaSurface: GeometryBuilder = () => {
  // 海面要铺到视野尽头，否则矩形边缘会像一块灰垫子。舰体在中心，四周留出千米级海面。
  const width = 300;
  const zStern = -260;
  const zBow = 200;
  const nx = 96;
  const nz = 96;
  const heights = fftOceanHeights(nx + 1, width, zBow - zStern, 7.5);
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let iz = 0; iz <= nz; iz++) {
    const z = zStern + ((zBow - zStern) * iz) / nz;
    for (let ix = 0; ix <= nx; ix++) {
      const x = -width / 2 + (width * ix) / nx;
      const y = SEA_LEVEL + heights[iz * (nx + 1) + ix]!;
      positions.push(x, y, z);
      uvs.push(x * 0.12, z * 0.12);
    }
  }
  for (let iz = 0; iz < nz; iz++) {
    for (let ix = 0; ix < nx; ix++) {
      const a = iz * (nx + 1) + ix;
      const b = a + 1;
      const c = a + nx + 2;
      const d = a + nx + 1;
      indices.push(a, d, c, a, c, b);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
};

/** FFT 波峰白浪：按高度/坡度挑选浪峰，铺少量白色泡沫片（不是满屏噪点）。 */
export const carrierSeaFoam: GeometryBuilder = () => {
  const width = 300;
  const zStern = -260;
  const zBow = 200;
  const n = 97;
  const heights = fftOceanHeights(n, width, zBow - zStern, 7.5);
  const positions: number[] = [];
  const indices: number[] = [];
  const cellX = width / (n - 1);
  const cellZ = (zBow - zStern) / (n - 1);
  let seed = 71023;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let iz = 1; iz < n - 2; iz++) {
    for (let ix = 1; ix < n - 2; ix++) {
      const h = heights[iz * n + ix]!;
      const slope = Math.max(
        Math.abs(h - heights[iz * n + ix + 1]!),
        Math.abs(h - heights[(iz + 1) * n + ix]!),
        Math.abs(h - heights[iz * n + ix - 1]!),
        Math.abs(h - heights[(iz - 1) * n + ix]!),
      );
      if (h < 0.02 || slope < 0.004 || rand() > 0.72) continue;
      const x = -width / 2 + ix * cellX + (rand() - 0.5) * cellX * 0.5;
      const z = zStern + iz * cellZ + (rand() - 0.5) * cellZ * 0.5;
      const y = SEA_LEVEL + h + 0.012;
      const half = 0.8 + rand() * 1.8;
      const skew = 0.4 + rand() * 0.5;
      const base = positions.length / 3;
      positions.push(x - half, y, z - half * skew, x + half, y, z - half * 0.2, x + half * 0.7, y, z + half, x - half * 0.6, y, z + half * skew);
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
};

/** 艏浪：沿艏柱向外张开的 V 形白色浪脊。 */
export const carrierBowWave: GeometryBuilder = () => {
  const positions: number[] = [];
  const indices: number[] = [];
  const segments = 24;
  for (const side of [-1, 1] as const) {
    const start = positions.length / 3;
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const z = 19.4 - 17.6 * t;
      const xCenter = side * (hullSurfaceHalfAt(z, SEA_LEVEL) + 0.35 + 1.9 * Math.pow(t, 1.45));
      const half = 0.16 + 0.62 * (1 - t);
      const y = SEA_LEVEL + 0.075 + 0.035 * Math.sin(t * 10);
      positions.push(xCenter - half, y, z, xCenter + half, y, z);
    }
    for (let i = 0; i < segments; i++) {
      const a = start + i * 2;
      indices.push(a, a + 2, a + 3, a, a + 3, a + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
};

/** 艉流：从舰艉向后扩散的湍流带 + 两条开尔文尾迹。 */
export const carrierSternWake: GeometryBuilder = () => {
  const positions: number[] = [];
  const indices: number[] = [];
  const segments = 26;
  const strip = (center: (t: number) => number, halfAt: (t: number) => number, baseY: number) => {
    const start = positions.length / 3;
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const z = -18.4 - 70 * t;
      const half = halfAt(t);
      const y = baseY + 0.02 * Math.sin(t * 16 + center(t));
      const cx = center(t);
      positions.push(cx - half, y, z, cx + half, y, z);
    }
    for (let i = 0; i < segments; i++) {
      const a = start + i * 2;
      indices.push(a, a + 2, a + 3, a, a + 3, a + 1);
    }
  };
  strip(() => 0, (t) => 1.4 + 5.6 * t + 0.24 * Math.sin(t * 19), SEA_LEVEL + 0.06);
  for (const side of [-1, 1] as const) {
    strip((t) => side * (2.8 + 9.0 * t), (t) => 0.22 + 0.2 * t, SEA_LEVEL + 0.045);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
};

/** 相控阵阵面（平板 + 边框），T/R 单元另行实例化。 */
export const carrierRadarPanel: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Record<string, unknown> }).params ?? {};
  const w = Number(p.w ?? 1.1);
  const h = Number(p.h ?? 1.0);
  const d = Number(p.d ?? 0.12);
  const parts: THREE.BufferGeometry[] = [
    new THREE.BoxGeometry(w, h, d),
    new THREE.BoxGeometry(w + 0.08, 0.06, d + 0.05).translate(0, h / 2 + 0.02, 0),
    new THREE.BoxGeometry(w + 0.08, 0.06, d + 0.05).translate(0, -h / 2 - 0.02, 0),
  ];
  return merge(parts);
};

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  // 轻量合并：不引入 kernel 的 merge，避免 kit 依赖装配缓存。
  const positions: number[] = [];
  const normals: number[] = [];
  for (const part of parts) {
    const pos = part.getAttribute("position");
    const nor = part.getAttribute("normal");
    if (!pos) continue;
    const index = part.getIndex();
    const push = (i: number) => {
      positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      if (nor) normals.push(nor.getX(i), nor.getY(i), nor.getZ(i));
    };
    if (index) for (let i = 0; i < index.count; i++) push(index.getX(i));
    else for (let i = 0; i < pos.count; i++) push(i);
    part.dispose();
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  if (normals.length) geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  else geometry.computeVertexNormals();
  return geometry;
}

/** 密集相控阵 T/R 单元：一个零件内合并全部小单元，实例化由注册表控制。 */
export const carrierTrTile: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Record<string, unknown> }).params ?? {};
  const s = Number(p.s ?? 0.075);
  const d = Number(p.d ?? 0.035);
  return merge([
    new THREE.BoxGeometry(s, s, d),
    new THREE.BoxGeometry(s * 0.55, s * 0.55, d + 0.012).translate(0, 0, d / 2 + 0.006),
  ]);
};

/** 螺旋桨：桨毂 + 5 片侧斜桨叶。 */
export const carrierPropeller: GeometryBuilder = (spec) => {
  const p = (spec as { spec?: number }).spec;
  const r = Number((spec as { params?: Record<string, unknown> }).params?.r ?? 0.55);
  const parts: THREE.BufferGeometry[] = [
    new THREE.CylinderGeometry(r * 0.18, r * 0.24, r * 0.32, 20),
    new THREE.SphereGeometry(r * 0.2, 16, 10),
  ];
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2;
    const blade = new THREE.BoxGeometry(r * 0.14, r * 0.3, r * 0.78);
    blade.translate(0, 0, r * 0.42);
    blade.rotateY(angle);
    blade.rotateX(0.16);
    blade.translate(Math.sin(angle) * r * 0.22, 0, Math.cos(angle) * r * 0.22);
    parts.push(blade);
  }
  void p;
  return merge(parts);
};

/** 舷侧列板：沿船壳曲线放样的水平板条，外缘压在舷外，内缘搭在纵骨上。 */
export const carrierHullStrake: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Record<string, number> }).params ?? {};
  const level = Number(p.level ?? 1.6);
  const side = Number(p.side ?? 1) >= 0 ? 1 : -1;
  return curvedHullRibbon(
    -16.8,
    16.8,
    72,
    side,
    (z) => side * (hullHalfBeamAt(z) + 0.022),
    (z) => side * (hullHalfBeamAt(z) - 0.16),
    level + 0.025,
    level - 0.025,
  );
};

/** 舭龙骨：沿舭部曲面的外伸连续板，内缘与纵骨/肋板搭接。 */
export const carrierHullBilgeKeel: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Record<string, number> }).params ?? {};
  const side = Number(p.side ?? 1) >= 0 ? 1 : -1;
  return curvedHullRibbon(
    -13,
    11,
    56,
    side,
    (z) => side * (hullHalfBeamAt(z) + 0.08),
    (z) => side * (hullHalfBeamAt(z) - 0.24),
    0.87,
    0.57,
  );
};

function curvedHullRibbon(
  z0: number,
  z1: number,
  samples: number,
  side: 1 | -1,
  xOuter: (z: number) => number,
  xInner: (z: number) => number,
  yTop: number,
  yBot: number,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const face = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, out: THREE.Vector3) => {
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    if (n.dot(out) < 0) {
      const swap = b;
      b = c;
      c = swap;
      n.negate();
    }
    n.normalize();
    for (const p of [a, b, c]) {
      positions.push(p.x, p.y, p.z);
      normals.push(n.x, n.y, n.z);
      uvs.push(p.z * 0.2, p.y * 0.8);
    }
  };
  const quad = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, out: THREE.Vector3) => {
    face(a, b, c, out);
    face(a, c, d, out);
  };
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const outX = v(side, 0, 0);
  for (let i = 0; i < samples; i++) {
    const za = z0 + ((z1 - z0) * i) / samples;
    const zb = z0 + ((z1 - z0) * (i + 1)) / samples;
    quad(
      v(xOuter(za), yBot, za),
      v(xOuter(zb), yBot, zb),
      v(xOuter(zb), yTop, zb),
      v(xOuter(za), yTop, za),
      outX,
    );
    quad(
      v(xInner(za), yTop, za),
      v(xOuter(za), yTop, za),
      v(xOuter(zb), yTop, zb),
      v(xInner(zb), yTop, zb),
      v(0, 1, 0),
    );
    quad(
      v(xInner(za), yBot, za),
      v(xInner(zb), yBot, zb),
      v(xOuter(zb), yBot, zb),
      v(xOuter(za), yBot, za),
      v(0, -1, 0),
    );
  }
  quad(
    v(xInner(z0), yBot, z0),
    v(xOuter(z0), yBot, z0),
    v(xOuter(z0), yTop, z0),
    v(xInner(z0), yTop, z0),
    v(0, 0, -1),
  );
  quad(
    v(xInner(z1), yBot, z1),
    v(xInner(z1), yTop, z1),
    v(xOuter(z1), yTop, z1),
    v(xOuter(z1), yBot, z1),
    v(0, 0, 1),
  );
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  return geometry;
}

/** 真实翼面：NACA 对称翼型沿展向放样（根弦/尖弦/后掠/上反/厚度比）。
 *  参数：span, rootChord, tipChord, sweep, thickness, dihedralDeg, sections。 */
export const carrierWing: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Record<string, number> }).params ?? {};
  const span = Number(p.span ?? 1);
  const rootChord = Number(p.rootChord ?? 0.5);
  const tipChord = Number(p.tipChord ?? 0.3);
  const sweep = Number(p.sweep ?? 0);
  const thickness = Number(p.thickness ?? 0.12);
  const dihedral = ((Number(p.dihedralDeg ?? 0)) * Math.PI) / 180;
  const sections = Math.max(4, Math.floor(Number(p.sections ?? 10)));
  const N = 12;

  const yt = (u: number, chord: number) =>
    5 *
    thickness *
    (0.2969 * Math.sqrt(Math.max(u, 0)) -
      0.126 * u -
      0.3516 * u * u +
      0.2843 * u ** 3 -
      0.1036 * u ** 4) *
    chord;

  const rings: THREE.Vector3[][] = [];
  for (let s = 0; s <= sections; s++) {
    const f = s / sections;
    const x = f * span;
    const chord = rootChord + (tipChord - rootChord) * f;
    const zLE = -sweep * f;
    const y0 = Math.tan(dihedral) * x;
    const ring: THREE.Vector3[] = [];
    for (let i = 0; i < N; i++) {
      const u = i / (N - 1);
      ring.push(new THREE.Vector3(x, y0 + yt(u, chord), zLE - u * chord));
    }
    for (let i = N - 1; i >= 0; i--) {
      const u = i / (N - 1);
      ring.push(new THREE.Vector3(x, y0 - yt(u, chord), zLE - u * chord));
    }
    rings.push(ring);
  }

  const positions: number[] = [];
  const indices: number[] = [];
  const ringLen = N * 2;
  for (const ring of rings) for (const v of ring) positions.push(v.x, v.y, v.z);
  for (let s = 0; s < sections; s++) {
    const a = s * ringLen;
    const b = (s + 1) * ringLen;
    for (let i = 0; i < ringLen; i++) {
      const j = (i + 1) % ringLen;
      indices.push(a + i, b + i, b + j, a + i, b + j, a + j);
    }
  }
  // 根/尖端封口
  const cap = (base: number, reverse: boolean) => {
    for (let i = 1; i < ringLen - 1; i++) {
      if (reverse) indices.push(base, base + i + 1, base + i);
      else indices.push(base, base + i, base + i + 1);
    }
  };
  cap(0, false);
  cap(sections * ringLen, true);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
};
