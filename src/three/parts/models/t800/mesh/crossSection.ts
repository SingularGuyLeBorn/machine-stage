import * as THREE from "three";
import { getBVH } from "../../../solver/detect";

// ============================================================================
// t800/mesh/crossSection —— 沿骨段长轴采样**真实截面**
//
// 机械件要装进骨头壳体内部，按包围盒算尺寸会在凹处捅穿壳体。
// 这里沿长轴取若干站位，每个站位：
//   1) 在垂直于轴的平面上找一批候选"核心点"；
//   2) 每个候选点向四周打射线，找**离表面最近的距离**（局部可用半径）；
//   3) 取可用半径最大的候选点作为该站位的核心。
// 机械件按这条"芯线 + 半径剖面"生成 → 贴着真实形状走，又不会露头。
// ============================================================================

/** 骨段的截面剖面。 */
export interface BoneProfile {
  /** 主轴（0=x / 1=y / 2=z） */
  axis: 0 | 1 | 2;
  /** 每个站位的核心点（部位局部坐标） */
  cores: THREE.Vector3[];
  /** 每个站位的可用半径（到最近表面的距离，mm 级） */
  radii: number[];
  /** 站位参数（-1 = 一端，+1 = 另一端） */
  ts: number[];
}

/** 射线方向数（周向采样）。 */
const RAYS = 16;
/** 站位数。 */
const STATIONS = 7;
/** 核心点候选的层数（0 = 轴心）。 */
const CANDIDATE_RINGS = 3;

/** 求一个点到网格表面的最小距离（沿射线方向采样）。 */
function clearance(
  origin: THREE.Vector3,
  dir: THREE.Vector3,
  bvh: ReturnType<typeof getBVH>,
  maxDist: number,
): number {
  const ray = new THREE.Ray(origin.clone(), dir.clone().normalize());
  const hit = bvh.raycastFirst(ray, THREE.DoubleSide);
  if (!hit) return maxDist;
  return Math.min(hit.distance, maxDist);
}

/** 沿骨段长轴采样真实截面。 */
export function profileBone(geometry: THREE.BufferGeometry): BoneProfile {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  const size = new THREE.Vector3();
  box.getSize(size);
  const center = new THREE.Vector3();
  box.getCenter(center);

  // 长轴
  let axis: 0 | 1 | 2 = 0;
  if (size.y > size.x && size.y >= size.z) axis = 1;
  else if (size.z > size.x && size.z > size.y) axis = 2;
  const p1 = ((axis + 1) % 3) as 0 | 1 | 2;
  const p2 = ((axis + 2) % 3) as 0 | 1 | 2;
  const halfLen = size.getComponent(axis) / 2;

  const bvh = getBVH(geometry);

  // 垂直于主轴的两个正交方向
  const u = new THREE.Vector3();
  const v = new THREE.Vector3();
  const e = new THREE.Vector3();
  e.setComponent(axis, 1);
  u.setComponent(p1, 1);
  v.crossVectors(e, u).normalize();
  u.crossVectors(v, e).normalize();

  const cores: THREE.Vector3[] = [];
  const radii: number[] = [];
  const ts: number[] = [];
  const crossMax = Math.max(size.getComponent(p1), size.getComponent(p2));

  for (let s = 0; s < STATIONS; s++) {
    const t = (s / (STATIONS - 1)) * 2 - 1;
    const station = center.clone();
    station.setComponent(axis, center.getComponent(axis) + t * halfLen * 0.92);

    let bestCore = station.clone();
    let bestRadius = 0;
    // 候选点：轴心 + 若干层同心环
    for (let ring = 0; ring <= CANDIDATE_RINGS; ring++) {
      const rad = (ring / CANDIDATE_RINGS) * crossMax * 0.32;
      const count = ring === 0 ? 1 : 6;
      for (let c = 0; c < count; c++) {
        const a = (c / count) * Math.PI * 2;
        const cand = station
          .clone()
          .addScaledVector(u, Math.cos(a) * rad)
          .addScaledVector(v, Math.sin(a) * rad);
        // 到四周表面的最小距离
        let min = Infinity;
        for (let r = 0; r < RAYS; r++) {
          const ang = (r / RAYS) * Math.PI * 2;
          const dir = new THREE.Vector3()
            .addScaledVector(u, Math.cos(ang))
            .addScaledVector(v, Math.sin(ang));
          min = Math.min(min, clearance(cand, dir, bvh, crossMax));
        }
        if (min > bestRadius) {
          bestRadius = min;
          bestCore = cand;
        }
      }
    }
    cores.push(bestCore);
    radii.push(Math.max(0.004, bestRadius));
    ts.push(t);
  }

  // 芯线平滑：各站位独立找"最空点"会左右跳，软管/骨架跟着跳就会甩出壳外。
  // 用 1-2-1 滤波把芯线拉直（端点不动）。
  const count = cores.length;
  for (let pass = 0; pass < 2; pass++) {
    const smoothed = cores.map((c) => c.clone());
    for (let i = 1; i < count - 1; i++) {
      smoothed[i]
        .copy(cores[i - 1])
        .add(cores[i].clone().multiplyScalar(2))
        .add(cores[i + 1])
        .multiplyScalar(0.25);
    }
    for (let i = 0; i < count; i++) cores[i] = smoothed[i];
  }

  return { axis, cores, radii, ts };
}

/**
 * 变半径放样管：沿一串点扫出半径变化的管子。
 * 用来做"贴着骨头走"的骨架/纵梁。
 */
export function loftTube(
  points: THREE.Vector3[],
  radii: number[],
  segments = 12,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  const n = points.length;
  if (n < 2) return new THREE.BufferGeometry();

  // 每个站位的切向
  const tangents: THREE.Vector3[] = [];
  for (let i = 0; i < n; i++) {
    const a = points[Math.max(0, i - 1)];
    const b = points[Math.min(n - 1, i + 1)];
    tangents.push(b.clone().sub(a).normalize());
  }
  // 平行传输标架（避免扭转）
  const normals: THREE.Vector3[] = [];
  let ref = Math.abs(tangents[0].y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  for (let i = 0; i < n; i++) {
    const t = tangents[i];
    const u = ref.clone().sub(t.clone().multiplyScalar(ref.dot(t)));
    if (u.lengthSq() < 1e-8) u.set(1, 0, 0).sub(t.clone().multiplyScalar(t.x));
    u.normalize();
    normals.push(u);
    ref = u;
  }

  for (let i = 0; i < n; i++) {
    const u = normals[i];
    const v = new THREE.Vector3().crossVectors(tangents[i], u);
    const r = radii[i];
    for (let s = 0; s < segments; s++) {
      const a = (s / segments) * Math.PI * 2;
      const p = points[i]
        .clone()
        .addScaledVector(u, Math.cos(a) * r)
        .addScaledVector(v, Math.sin(a) * r);
      positions.push(p.x, p.y, p.z);
    }
  }
  for (let i = 0; i < n - 1; i++) {
    for (let s = 0; s < segments; s++) {
      const s2 = (s + 1) % segments;
      const a = i * segments + s;
      const b = i * segments + s2;
      const c = (i + 1) * segments + s;
      const d = (i + 1) * segments + s2;
      indices.push(a, c, b, b, c, d);
    }
  }
  // 两端封口
  const capStart = positions.length / 3;
  const p0 = points[0].clone();
  positions.push(p0.x, p0.y, p0.z);
  for (let s = 0; s < segments; s++) {
    indices.push(capStart, (s + 1) % segments, s);
  }
  const capEnd = positions.length / 3;
  const p1 = points[n - 1].clone();
  positions.push(p1.x, p1.y, p1.z);
  const base = (n - 1) * segments;
  for (let s = 0; s < segments; s++) {
    indices.push(capEnd, base + s, base + ((s + 1) % segments));
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
