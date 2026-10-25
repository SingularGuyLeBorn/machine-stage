import * as THREE from "three";
import type { GeometryBuilder } from "../../assembler/geometry";
import { BOW_RAMP_Z0, BOW_RAMP_Z1, CV, deckTopAt, hullHalfBeamAt } from "./constants";

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

/** 飞行甲板轮廓：右舷直边 + 平行艏段 + 短艏斜切；左舷为斜角甲板外飘（艉部收、舯部最宽、艏部收）。
 *  真实福建舰俯视：艏段是约 35~37m 宽的平行长条（不是长三角形），在斜角甲板前端
 *  用一条短而陡的折线过渡到全宽；艏端只是短斜切/圆钝，不是尖艏。 */
export function deckPlan(): Array<[number, number]> {
  // 用户提供的 36 点真实甲板轮廓（像素坐标，原点左下）。按船艏在左、舰岛在右舷
  // 的朝向换算：像素 x 长轴 → 编辑 z（艏 +20.7 / 艉 -20），像素 y → 编辑 x
  // （左舷 -4.81 / 右舷 +4.81），长宽各自归一到本模型的 316m × 76m。
  const px: Array<[number, number]> = [
    [9.7, 110.3], [54.1, 110.3], [59, 114.9], [69.2, 114.9], [77.8, 121.5],
    [99.8, 121.1], [100, 125.1], [113.6, 125.3], [113.5, 123], [245.5, 117.6],
    [248, 114], [248.2, 111.9], [249.5, 109], [251.1, 108.6], [251.9, 107.8],
    [254.7, 106.1], [260.9, 104.1], [267.3, 101.6], [269.6, 101.1], [271.3, 100.3],
    [272.6, 63.1], [248.8, 63.1], [248.8, 58.1], [247.8, 57.8], [246.8, 57.2],
    [246.1, 54.9], [244.1, 52.6], [178.3, 53.7], [170.8, 56.8], [116.3, 58.9],
    [112.3, 56.6], [79.7, 57.8], [70.9, 74.3], [59.5, 74.9], [57.4, 81.6],
    [9.5, 87.2],
  ];
  const x0 = 9.5;
  const x1 = 272.6;
  const y0 = 52.6;
  const y1 = 125.3;
  const half = 4.81;
  const bow = 20.7;
  const stern = -20.0;
  return px.map(([sx, sy]) => [
    (sy - (y0 + y1) / 2) / (y1 - y0) * half * 2,
    bow - (sx - x0) / (x1 - x0) * (bow - stern),
  ]);
}

/** 甲板舷缘：给定世界 z 与舷别，返回该处甲板边缘 x 与切线偏航角。 */
export function deckEdgeAt(z: number, side: -1 | 1): { x: number; yawDeg: number } {
  const outline = deckPlan();
  let bestX = side > 0 ? -Infinity : Infinity;
  let bestYaw = 0;
  for (let i = 0; i < outline.length; i++) {
    const [x0, z0] = outline[i]!;
    const [x1, z1] = outline[(i + 1) % outline.length]!;
    const lo = Math.min(z0, z1);
    const hi = Math.max(z0, z1);
    if (z < lo - 1e-6 || z > hi + 1e-6) continue;
    if (Math.abs(z1 - z0) < 1e-6) continue;
    const t = (z - z0) / (z1 - z0);
    const x = x0 + (x1 - x0) * t;
    // 取该 z 与轮廓所有交点的最外缘：艉部斜边同时跨左右舷，
    // 旧逻辑按“第一个同舷交点”取，会落空并返回舷外默认值 4.68。
    if (side > 0 ? x > bestX : x < bestX) {
      bestX = x;
      bestYaw = (Math.atan2(x1 - x0, z1 - z0) * 180) / Math.PI;
    }
  }
  if (Number.isFinite(bestX)) return { x: bestX, yawDeg: bestYaw };
  return { x: side > 0 ? 4.68 : -4.8, yawDeg: 0 };
}

function deckMinHalfAt(z: number): number {
  const star = deckEdgeAt(z, 1).x;
  const port = deckEdgeAt(z, -1).x;
  return Math.max(0.25, Math.min(star, -port));
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
  const upper = st.base * (0.88 + (1.0 - 0.88) * Math.min(1, t / 0.42)) * (1 + flare * Math.max(0, t - 0.42)) + (t > 0.55 ? (0.22 + 0.42 * st.bow * st.bow) * ((t - 0.55) / 0.45) : 0);
  // 上部船壳必须收在飞行甲板边缘以内（甲板始终外飘），否则外飘封边会插进船壳。
  // 两侧甲板不对称，取较窄的一侧作为封顶宽度。
  const deckCap = Math.max(0.25, deckMinHalfAt(st.z + hullRakeShift(st, y)) - 0.12);
  return Math.min(upper, deckCap);
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
function loftHull(ys: (st: HullStation) => number[], cap: boolean, skipWaterlineFace = false): THREE.BufferGeometry {
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
      // 舷侧环线从“左舷上缘→左舷水线→右舷水线→右舷上缘”闭合，
      // j=n/2-1 这一格会在水线处生成一张横跨全宽的平面——水上/水下壳各来一张，
      // 仰视/俯视时会像一块白色大平板。上下壳在水线共边，不需要这张面。
      if (skipWaterlineFace && j === n / 2 - 1) continue;
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

/** 供表面件定位：世界 z / 高度 y 处的外板半宽（考虑艏部前倾）。 */
export function hullSurfaceHalfAt(z: number, y: number): number {
  // 外板点世界 z = 站位 z + 前倾量；反解站位，避免把焊缝/列板贴到斜艏的错误位置。
  let stationZ = z;
  for (let i = 0; i < 6; i++) {
    const st = hullStationAt(stationZ);
    const next = z - hullRakeShift(st, y);
    if (Math.abs(next - stationZ) < 1e-4) {
      stationZ = next;
      break;
    }
    stationZ = next;
  }
  return hullHalfAt(hullStationAt(stationZ), y);
}

/** 固定肋骨站位上的外板点（横向焊缝必须沿该站位的真实外板走，不能钉在固定 z）。 */
export function hullSurfaceAtStation(stationZ: number, y: number): { half: number; z: number } {
  const st = hullStationAt(stationZ);
  return { half: hullHalfAt(st, y), z: st.z + hullRakeShift(st, y) };
}

/** 给定高度处的外板平面轮廓（用于外飘底封板的连续内边界）。 */
export function hullPlanAtHeight(y: number, samples = 44): Array<[number, number]> {
  const points: Array<[number, number]> = [];
  const stationAt = (i: number) => CV.HULL_Z_STERN + (i * (CV.HULL_Z_BOW - CV.HULL_Z_STERN)) / (samples - 1);
  for (let i = 0; i < samples; i++) {
    const z = stationAt(i);
    points.push([hullSurfaceAtStation(z, y).half, hullSurfaceAtStation(z, y).z]);
  }
  for (let i = samples - 1; i >= 0; i--) {
    const z = stationAt(i);
    points.push([-hullSurfaceAtStation(z, y).half, hullSurfaceAtStation(z, y).z]);
  }
  return points;
}

/** 水线以上舰体外板：舭部以上到甲板底，含舷侧外飘与艏部前倾。 */
export const carrierHullShell: GeometryBuilder = () =>
  loftHull((st) => [HULL_WL, 2.12, 2.6, 3.45, HULL_DECK_BOTTOM].filter((y) => y >= st.bottom), true, true);

/** 水线以下舰体外板：防污红漆，圆舭过渡，含球鼻艏安装面。 */
export const carrierHullUnderwater: GeometryBuilder = () =>
  loftHull((st) => {
    const top = HULL_WL + 0.03;
    const ys = [st.bottom];
    for (const f of [0.12, 0.3, 0.52, 0.76, 0.93]) ys.push(st.bottom + (top - st.bottom) * f);
    // 水下壳顶边略压过水线，与水上壳重叠，避免水线处出现锯齿状接缝；boot stripe 盖住重叠带。
    ys.push(top);
    return ys;
  }, true, true);

/** 水线漆带：水线处外贴 0.012 的黑色 boot topping。 */
export const carrierBootStripe: GeometryBuilder = () => {
  const geometry = loftHull((st) => [HULL_WL - 0.16, HULL_WL + 0.2].filter((y) => y >= st.bottom), false, true);
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

/** 艏部上翘甲板实体：从平甲板最后一段起，沿 36 点甲板轮廓逐站抬升；
 *  上表面就是可站立的甲板弧面，不是另贴一块板。 */
export const carrierBowRamp: GeometryBuilder = () => {
  const N = 14;
  const sections: Array<{ z: number; port: number; star: number; top: number; bottom: number }> = [];
  for (let i = 0; i <= N; i++) {
    const z = BOW_RAMP_Z0 + ((BOW_RAMP_Z1 - BOW_RAMP_Z0) * i) / N;
    const top = deckTopAt(z);
    // 上翘段只做甲板结构面层；下面的水密基层已经随 deckTopAt 抬升，
    // 这里不能再从 4.556 拉一块厚楔形，否则两块的侧板会重叠闪烁。
    sections.push({ z, port: deckEdgeAt(z, -1).x, star: deckEdgeAt(z, 1).x, top, bottom: top - 0.018 });
  }
  const positions: number[] = [];
  const indices: number[] = [];
  const push = (x: number, y: number, z: number) => {
    positions.push(x, y, z);
    return positions.length / 3 - 1;
  };
  const topIdx: Array<[number, number]> = [];
  const botIdx: Array<[number, number]> = [];
  for (const s of sections) {
    topIdx.push([push(s.port, s.top, s.z), push(s.star, s.top, s.z)]);
    botIdx.push([push(s.port, s.bottom, s.z), push(s.star, s.bottom, s.z)]);
  }
  for (let i = 0; i < N; i++) {
    const [pt0, st0] = topIdx[i]!;
    const [pt1, st1] = topIdx[i + 1]!;
    const [pb0, sb0] = botIdx[i]!;
    const [pb1, sb1] = botIdx[i + 1]!;
    // 弧面（上）
    indices.push(pt0, pt1, st1, pt0, st1, st0);
    // 左/右舷侧封
    indices.push(pt0, pb0, pb1, pt0, pb1, pt1);
    indices.push(st0, st1, sb1, st0, sb1, sb0);
    // 底面
    indices.push(pb0, sb0, sb1, pb0, sb1, pb1);
  }
  const [pt0, st0] = topIdx[0]!;
  const [pb0, sb0] = botIdx[0]!;
  indices.push(pt0, st0, sb0, pt0, sb0, pb0);
  const [ptN, stN] = topIdx[N]!;
  const [pbN, sbN] = botIdx[N]!;
  indices.push(ptN, pbN, sbN, ptN, sbN, stN);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
};

/** 上翘段装甲板：沿弧面分块铺板，板缝露出下面的实体甲板。 */
export const carrierBowRampPlate: GeometryBuilder = (spec) => {
  const params = (spec as { params?: { z0?: number; z1?: number; thickness?: number } }).params ?? {};
  const z0 = params.z0 ?? BOW_RAMP_Z0;
  const z1 = params.z1 ?? BOW_RAMP_Z1;
  const thickness = params.thickness ?? 0.018;
  const inset = 0.05;
  const sample = (z: number) => {
    const port = deckEdgeAt(z, -1).x + inset;
    const star = deckEdgeAt(z, 1).x - inset;
    return { z, port, star, top: deckTopAt(z) + 0.0015 };
  };
  const a = sample(z0);
  const b = sample(z1);
  const positions: number[] = [];
  const indices: number[] = [];
  const push = (x: number, y: number, z: number) => {
    positions.push(x, y, z);
    return positions.length / 3 - 1;
  };
  const at = (s: ReturnType<typeof sample>, port: boolean, top: boolean) =>
    push(port ? s.port : s.star, top ? s.top : s.top - thickness, s.z);
  const aPt = at(a, true, true), aSt = at(a, false, true);
  const bPt = at(b, true, true), bSt = at(b, false, true);
  const aPb = at(a, true, false), aSb = at(a, false, false);
  const bPb = at(b, true, false), bSb = at(b, false, false);
  indices.push(aPt, bPt, bSt, aPt, bSt, aSt);
  indices.push(aPt, aPb, bPb, aPt, bPb, bPt);
  indices.push(aSt, bSt, bSb, aSt, bSb, aSb);
  indices.push(aPb, aSb, bSb, aPb, bSb, bPb);
  indices.push(aPt, aSt, aSb, aPt, aSb, aPb);
  indices.push(bPt, bPb, bSb, bPt, bSb, bSt);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
};

/** 上翘段舷缘红/白边带：贴着弧面与甲板轮廓走，侧视能看到边线跟着甲板抬起。 */
export const carrierBowRampEdge: GeometryBuilder = (spec) => {
  const params = (spec as { params?: { side?: -1 | 1; width?: number; inset?: number; lift?: number } }).params ?? {};
  const side = params.side ?? -1;
  const width = params.width ?? 0.09;
  const inset = params.inset ?? 0.04;
  const lift = params.lift ?? 0.006;
  const N = 18;
  const positions: number[] = [];
  const indices: number[] = [];
  const edges: Array<[number, number]> = [];
  for (let i = 0; i <= N; i++) {
    const z = BOW_RAMP_Z0 + ((BOW_RAMP_Z1 - BOW_RAMP_Z0) * i) / N;
    const outer = deckEdgeAt(z, side).x - side * inset;
    const inner = outer - side * width;
    const y = deckTopAt(z) + lift;
    const o = positions.length / 3;
    positions.push(outer, y, z, inner, y, z);
    edges.push([o, o + 1]);
  }
  for (let i = 0; i < N; i++) {
    const [o0, i0] = edges[i]!;
    const [o1, i1] = edges[i + 1]!;
    // 两舷的横向点序相反，按舷别翻转绕序，保证面法线朝上。
    if (side === -1) indices.push(o0, o1, i1, o0, i1, i0);
    else indices.push(o0, i1, o1, o0, i0, i1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
};

/** 艏部外飘下方的封闭楔形：上缘贴甲板艏端/上翘段底，向下收成艏柱，把甲板外飘与
 *  船壳之间的 V 形空腔封死；不再用与壳板曲面不匹配的独立“整流块”。 */
export const carrierBowClosure: GeometryBuilder = () => {
  // 上缘严格贴当前 36 点艏部甲板外缘，不再用旧版 ±1.52/±2.28 的宽楔形；
  // 用户轮廓的艏端向右舷偏置，旧楔形左侧会伸出甲板一大截。
  const portFore = deckEdgeAt(20.66, -1).x;
  const starFore = deckEdgeAt(20.66, 1).x;
  const portAft = deckEdgeAt(20.0, -1).x;
  const starAft = deckEdgeAt(20.0, 1).x;
  const top: Array<[number, number]> = [
    [portFore, 20.66],
    [starFore, 20.66],
    [starAft, 20.0],
    [portAft, 20.0],
  ];
  const bottom: Array<[number, number]> = [
    [-0.35, 19.4],
    [0.35, 19.4],
    [0.35, 19.05],
    [-0.35, 19.05],
  ];
  const blend = (t: number): Array<[number, number]> =>
    top.map(([x, z], i) => [x + (bottom[i]![0] - x) * t, z + (bottom[i]![1] - z) * t] as [number, number]);
  // 顶环抬到上翘甲板底（4.556），刚好托住起翘段，不再在艏端留一圈空腔。
  const rings = [
    { y: CV.DECK_Y + CV.DECK_T - 0.024, pts: top },
    { y: 4.0, pts: blend(0.35) },
    { y: 3.5, pts: blend(0.65) },
    { y: 3.0, pts: blend(0.85) },
    { y: 2.55, pts: bottom },
  ];
  const positions: number[] = [];
  const indices: number[] = [];
  for (const ring of rings) for (const [x, z] of ring.pts) positions.push(x, ring.y, z);
  const n = 4;
  for (let r = 0; r < rings.length - 1; r++) {
    for (let i = 0; i < n; i++) {
      const a = r * n + i;
      const b = r * n + ((i + 1) % n);
      const c = (r + 1) * n + ((i + 1) % n);
      const d = (r + 1) * n + i;
      indices.push(a, b, c, a, c, d);
    }
  }
  const cap = (base: number, reverse: boolean) => {
    if (reverse) indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
    else indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  cap(0, true);
  cap((rings.length - 1) * n, false);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
};

/** 双层底：沿 0.62m 高度的真实外板轮廓整片封到舷侧，不再是一条窄板悬在中间。 */
export const carrierBottom: GeometryBuilder = () =>
  extrudedPlan(hullPlanAtHeight(0.62, 56), 0.1, CV.HULL_BOTTOM + 0.3);

/** 艉封板：按艉部真实横剖面从船底封到甲板底，封死水上/水下壳与艉部之间的开口。 */
export const carrierSternTransom: GeometryBuilder = () => {
  const st = hullStationAt(CV.HULL_Z_STERN);
  const topY = HULL_DECK_BOTTOM;
  const samples = 24;
  const points: Array<[number, number]> = [[0, st.bottom]];
  for (let i = 1; i <= samples; i++) {
    const y = st.bottom + ((topY - st.bottom) * i) / samples;
    points.push([-hullHalfAt(st, y), y]);
  }
  for (let i = samples - 1; i >= 0; i--) {
    const y = st.bottom + ((topY - st.bottom) * i) / samples;
    points.push([hullHalfAt(st, y), y]);
  }
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.06,
    bevelEnabled: false,
    curveSegments: 1,
    steps: 1,
  });
  // 艏向面压在壳板艉封口上，艉向面略微外露；门框/扶强材再贴在艉向面。
  geometry.translate(0, 0, CV.HULL_Z_STERN - 0.06);
  geometry.computeVertexNormals();
  return geometry;
};

/** 把平面多边形裁到 z0..z1（Sutherland–Hodgman，保留输入绕序）。 */
function clipPlanZ(points: Array<[number, number]>, z0: number, z1: number): Array<[number, number]> {
  let poly = points;
  const clip = (axis: 0 | 1, value: number, keepGreater: boolean) => {
    const out: Array<[number, number]> = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i]!;
      const b = poly[(i + 1) % poly.length]!;
      const aIn = keepGreater ? a[axis] >= value : a[axis] <= value;
      const bIn = keepGreater ? b[axis] >= value : b[axis] <= value;
      if (aIn) out.push(a);
      if (aIn !== bIn) {
        const t = (value - a[axis]) / (b[axis] - a[axis]);
        out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      }
    }
    poly = out;
  };
  clip(1, z0, true);
  clip(1, z1, false);
  return poly;
}

/** 飞行甲板水密基层：顶面比装甲板低 0.018，艏部随甲板本体一起抬升。
 *  不是只在上面盖一块起翘板——基层的顶面和两侧舷缘都沿 deckTopAt(z) 连续升高。
 *  可按 z0/z1 切成多个水密分段：整船级 Extrude 的大三角在抬艏后会把平甲板
 *  也拉成斜面，切成 10m 级分段后每块顶面只在自身范围内起翘。 */
export const carrierFlightDeck: GeometryBuilder = (spec) => {
  const params = (spec as { params?: { z0?: number; z1?: number } }).params ?? {};
  const plan = params.z0 !== undefined && params.z1 !== undefined
    ? clipPlanZ(deckPlan(), params.z0, params.z1)
    : deckPlan();
  if (plan.length < 3) return new THREE.BufferGeometry();
  const flatTop = CV.DECK_Y + CV.DECK_T - 0.018;
  const bottom = CV.DECK_Y;
  const geometry = extrudedPlan(plan, CV.DECK_T - 0.018, flatTop);
  const position = geometry.getAttribute("position");
  for (let i = 0; i < position.count; i++) {
    const z = position.getZ(i);
    const y = position.getY(i);
    const t = (y - bottom) / (flatTop - bottom);
    position.setY(i, bottom + (deckTopAt(z) - 0.018 - bottom) * t);
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
};

/** 飞行甲板基层底面：从下往上看也必须是实心封板，不能透出船体内部。 */
export const carrierDeckUnderside: GeometryBuilder = () =>
  extrudedPlan(deckPlan(), 0.025, CV.DECK_Y + 0.005);

/** 单块飞行甲板装甲板：points 为该板在 x-z 平面的封闭折线。 */
export const carrierDeckArmorPlate: GeometryBuilder = (spec) => {
  const params = (spec as { params?: { points?: Array<[number, number]>; topY?: number; thickness?: number } }).params ?? {};
  const points = params.points ?? [];
  if (points.length < 3) return new THREE.BufferGeometry();
  const shape = new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(x, z)));
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: params.thickness ?? 0.012,
    bevelEnabled: false,
    curveSegments: 1,
    steps: 1,
  });
  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, params.topY ?? CV.DECK_Y + CV.DECK_T, 0);
  geometry.computeVertexNormals();
  return geometry;
};

/** 甲板外缘带：外缘严格落在 deckPlan 轮廓上，向内按斜接宽度收边。
 *  相邻段共用同一个斜接点，折线接头处不会漏缝；也不再出现半条红边悬在甲板外。 */
export const carrierDeckEdgeBand: GeometryBuilder = (spec) => {
  const params = (spec as {
    params?: { points?: Array<[number, number]>; topY?: number; thickness?: number };
  }).params ?? {};
  const points = params.points ?? [];
  if (points.length < 4) return new THREE.BufferGeometry();
  const shape = new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(x, z)));
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: params.thickness ?? 0.004,
    bevelEnabled: false,
    curveSegments: 1,
    steps: 1,
  });
  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, params.topY ?? CV.DECK_Y + CV.DECK_T + 0.0025, 0);
  geometry.computeVertexNormals();
  return geometry;
};

/** 外飘封边板：沿甲板折线的舷墙板。传入 points 时只做一个/一组折线段（逐块零件）。 */
export const carrierSponsonSkirt: GeometryBuilder = (spec) => {
  const params = (spec as { params?: { points?: Array<[number, number]> } }).params ?? {};
  const outline = params.points && params.points.length >= 2 ? params.points : deckPlan();
  const closed = !params.points;
  const yBot = CV.DECK_Y - 0.32;
  const thickness = 0.07;
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const pushTri = (
    a: [number, number, number],
    b: [number, number, number],
    c: [number, number, number],
    out: [number, number, number],
  ) => {
    const ab = new THREE.Vector3(...b).sub(new THREE.Vector3(...a));
    const ac = new THREE.Vector3(...c).sub(new THREE.Vector3(...a));
    const n = ab.cross(ac).normalize();
    const oriented = n.x * out[0] + n.y * out[1] + n.z * out[2] < 0;
    const p = oriented ? [a, c, b] : [a, b, c];
    for (const v of p) {
      positions.push(v[0], v[1], v[2]);
      normals.push(oriented ? -n.x : n.x, oriented ? -n.y : n.y, oriented ? -n.z : n.z);
      uvs.push(v[0] * 0.2 + v[2] * 0.2, v[1] * 0.5);
    }
  };
  const quad = (
    a: [number, number, number],
    b: [number, number, number],
    c: [number, number, number],
    d: [number, number, number],
    out: [number, number, number],
  ) => {
    pushTri(a, b, c, out);
    pushTri(a, c, d, out);
  };
  const edgeCount = closed ? outline.length : outline.length - 1;
  for (let i = 0; i < edgeCount; i++) {
    const [x0, z0] = outline[i]!;
    const [x1, z1] = outline[(i + 1) % outline.length]!;
    const dx = x1 - x0;
    const dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    if (len < 1e-6) continue;
    // 轮廓从艏右舷顺时针走到艉再回艏左舷；外法线 = (-dz, dx)。
    const out: [number, number, number] = [-dz / len, 0, dx / len];
    const inX = -out[0] * thickness;
    const inZ = -out[2] * thickness;
    const o0: [number, number, number] = [x0, 0, z0];
    const o1: [number, number, number] = [x1, 0, z1];
    const i0: [number, number, number] = [x0 + inX, 0, z0 + inZ];
    const i1: [number, number, number] = [x1 + inX, 0, z1 + inZ];
    const yTop0 = deckTopAt(z0) - 0.16;
    const yTop1 = deckTopAt(z1) - 0.16;
    const ot0: [number, number, number] = [o0[0], yTop0, o0[2]];
    const ot1: [number, number, number] = [o1[0], yTop1, o1[2]];
    const ob0: [number, number, number] = [o0[0], yBot, o0[2]];
    const ob1: [number, number, number] = [o1[0], yBot, o1[2]];
    const it0: [number, number, number] = [i0[0], yTop0, i0[2]];
    const it1: [number, number, number] = [i1[0], yTop1, i1[2]];
    const ib0: [number, number, number] = [i0[0], yBot, i0[2]];
    const ib1: [number, number, number] = [i1[0], yBot, i1[2]];
    quad(ob0, ob1, ot1, ot0, out);
    quad(it0, it1, ib1, ib0, [-out[0], 0, -out[2]]);
    quad(ot0, ot1, it1, it0, [0, 1, 0]);
    quad(ib0, ib1, ob1, ob0, [0, -1, 0]);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  return geometry;
};

/** 外飘底封板：甲板缘到真实舰体表面的一整圈连续水平封板。 */
export const carrierSponsonBottom: GeometryBuilder = () => {
  const yTop = CV.DECK_Y - 0.32;
  const thickness = 0.05;
  const shape = planShape(deckPlan());
  // 取封板底面高度的船壳轮廓：内边界略埋入壳板，封死缝隙。
  shape.holes.push(new THREE.Path(hullPlanAtHeight(yTop - thickness, 64).map(([x, z]) => new THREE.Vector2(x, z))));
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: false,
    curveSegments: 1,
    steps: 1,
  });
  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, yTop, 0);
  geometry.computeVertexNormals();
  return geometry;
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
      const half = 0.32 + rand() * 0.88;
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

/** 舷侧列板：沿真实外板型线放样的水平板条，外缘压在舷外，内缘搭在纵骨上。 */
export const carrierHullStrake: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Record<string, number> }).params ?? {};
  const level = Number(p.level ?? 1.6);
  const side = Number(p.side ?? 1) >= 0 ? 1 : -1;
  // 板条在舯部只比外板高 8mm；两端沿纵向收进壳板内，避免从舷侧看像一块
  // 从船壳里穿出来的三角鳍。上半部 2.52/2.98 两道过去最明显。
  const proud = (z: number) => {
    const bowFade = Math.min(1, Math.max(0, (16.0 - z) / 0.6));
    const sternFade = Math.min(1, Math.max(0, (z + 16.6) / 0.6));
    return 0.008 * Math.min(bowFade, sternFade);
  };
  const outer = (z: number) => side * (hullSurfaceHalfAt(z, level) + proud(z));
  return curvedHullRibbon(-16.6, 16.0, 140, side, outer, (z) => outer(z) - side * 0.12, level + 0.018, level - 0.018);
};

/** 舭龙骨：沿舭部曲面的外伸连续板，内外缘都按该高度真实外板取点。 */
export const carrierHullBilgeKeel: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Record<string, number> }).params ?? {};
  const side = Number(p.side ?? 1) >= 0 ? 1 : -1;
  const z0 = -13;
  const z1 = 11;
  const samples = 60;
  const yTop = 0.87;
  const yBot = 0.57;
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const face = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, out: THREE.Vector3) => {
    let bb = b;
    let cc = c;
    const n = new THREE.Vector3().subVectors(bb, a).cross(new THREE.Vector3().subVectors(cc, a));
    if (n.dot(out) < 0) {
      const swap = bb;
      bb = cc;
      cc = swap;
      n.negate();
    }
    n.normalize();
    for (const pt of [a, bb, cc]) {
      positions.push(pt.x, pt.y, pt.z);
      normals.push(n.x, n.y, n.z);
      uvs.push(pt.z * 0.2, pt.y);
    }
  };
  const quad = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, out: THREE.Vector3) => {
    face(a, b, c, out);
    face(a, c, d, out);
  };
  for (let i = 0; i < samples; i++) {
    const za = z0 + ((z1 - z0) * i) / samples;
    const zb = z0 + ((z1 - z0) * (i + 1)) / samples;
    const xTa = side * hullSurfaceHalfAt(za, yTop);
    const xBa = side * hullSurfaceHalfAt(za, yBot);
    const xTb = side * hullSurfaceHalfAt(zb, yTop);
    const xBb = side * hullSurfaceHalfAt(zb, yBot);
    const dx = (xTa - xBa) * side;
    const dy = yTop - yBot;
    const nLen = Math.hypot(dx, dy) || 1;
    // 舭部外法线：沿截面向外下方伸出。
    const nx = (dy / nLen) * side;
    const ny = -dx / nLen;
    const ext = 0.11;
    const oTa = v(xTa + nx * ext, yTop + ny * ext, za);
    const oBa = v(xBa + nx * ext, yBot + ny * ext, za);
    const oTb = v(xTb + nx * ext, yTop + ny * ext, zb);
    const oBb = v(xBb + nx * ext, yBot + ny * ext, zb);
    quad(v(xBa, yBot, za), v(xBb, yBot, zb), oBb, oBa, v(ny, -nx, 0));
    quad(v(xTa, yTop, za), oTa, oTb, v(xTb, yTop, zb), v(-ny, nx, 0));
    quad(oBa, oBb, oTb, oTa, v(nx, ny, 0));
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  return geometry;
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
