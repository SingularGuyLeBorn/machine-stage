import * as THREE from "three";
import { MeshBVH, type HitPointInfo } from "three-mesh-bvh";
import type { AssembledModel, PartHandle } from "../assembler/assembler";
import { buildHint, formatReportRef, sortReports, type ClippingReport } from "./report";

// ============================================================================
// solver/detect —— 穿模检测器（静态装配 + 动画扫掠）
//
// 三级检测（框架文档第 6 节）：
//   1) 静态：AABB 粗检 → BVH 三角形精检（three-mesh-bvh bvhcast）
//   2) 扫掠：动画按 ≥30fps 采样，逐帧对「至少一方在动」的候选对检测
//   3) 参数扫描：= 重建 + 静态（由调用方循环）
//
// 深度估计（取最大可信值）：
//   a) 顶点/面心/棱中点落入对方实体 → 到对方表面的最近距离（精确）
//   b) AABB 交叠盒最小边长（共面 / 交叉条退化情形兜底，标记 estimated）
// 判定阈值：重叠深度 < minDepthM（默认 0.5mm）视作装配接触，不报告。
// 早退模式（超出详细分析预算）返回 depth=-1：确定相交但未测深。
// ============================================================================

const bvhCache = new WeakMap<THREE.BufferGeometry, MeshBVH>();

/** 取（并缓存）几何的 MeshBVH。 */
export function getBVH(geometry: THREE.BufferGeometry): MeshBVH {
  let bvh = bvhCache.get(geometry);
  if (!bvh) {
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    bvh = new MeshBVH(geometry);
    bvhCache.set(geometry, bvh);
  }
  return bvh;
}

export interface ClippingOptions {
  /** 判定阈值：重叠深度小于该值视作「装配接触」，不报告。默认 0.5mm。 */
  minDepthM?: number;
  /** AABB 粗检余量（米）。 */
  broadphaseMarginM?: number;
  /** 零件级过滤（层验收：只检查本层及以内）。 */
  filter?: (handle: PartHandle) => boolean;
  /** 详细分析（测深）的零件对上限；超出的对只判定相交，深度标记 estimated。 */
  analysisBudget?: number;
  onProgress?: (done: number, total: number) => void;
}

const RAY_DIRECTIONS = [
  new THREE.Vector3(0.5773, 0.5774, 0.5773),
  new THREE.Vector3(-0.3015, 0.7745, 0.5547),
  new THREE.Vector3(0.1231, -0.6002, 0.7902),
].map((direction) => direction.normalize());

interface BodyInstance {
  handle: PartHandle;
  index: number;
  ref: string;
  matrix: THREE.Matrix4;
  box: THREE.Box3;
}

function collectInstances(
  assembled: AssembledModel,
  filter?: (handle: PartHandle) => boolean,
): BodyInstance[] {
  const out: BodyInstance[] = [];
  for (const handle of assembled.parts) {
    if (filter && !filter(handle)) continue;
    if (!handle.geometry.boundingBox) handle.geometry.computeBoundingBox();
    if (!handle.instanced) {
      const matrix = assembled.instanceMatrix(handle, 0, new THREE.Matrix4());
      out.push({
        handle,
        index: 0,
        ref: formatReportRef(handle, 0),
        matrix,
        box: new THREE.Box3().copy(handle.geometry.boundingBox!).applyMatrix4(matrix),
      });
      continue;
    }
    for (const instance of handle.instances) {
      const matrix = assembled.instanceMatrix(handle, instance.index, new THREE.Matrix4());
      out.push({
        handle,
        index: instance.index,
        ref: formatReportRef(handle, instance.index),
        matrix,
        box: new THREE.Box3().copy(handle.geometry.boundingBox!).applyMatrix4(matrix),
      });
    }
  }
  return out;
}

/** 点是否在网格内部（奇偶射线法，3 方向多数投票，防退化）。 */
function pointInsideSolid(point: THREE.Vector3, bvh: MeshBVH, ray: THREE.Ray): boolean {
  let votes = 0;
  let tested = 0;
  for (const direction of RAY_DIRECTIONS) {
    ray.set(point, direction);
    const hits = bvh.raycast(ray, THREE.DoubleSide);
    let onSurface = false;
    for (const hit of hits) {
      if (hit.distance < 1e-6) {
        onSurface = true;
        break;
      }
    }
    if (onSurface) continue;
    tested++;
    if (hits.length % 2 === 1) votes++;
  }
  if (tested === 0) return false;
  return votes * 2 > tested;
}

/** 采样点：顶点 + 面心 + 棱中点（解决「同尺寸共面盒体顶点恰好落在对方表面」的退化）。 */
function samplePoints(geometry: THREE.BufferGeometry, budget = 900): THREE.Vector3[] {
  const position = geometry.getAttribute("position") as THREE.BufferAttribute;
  const count = position.count;
  const points: THREE.Vector3[] = [];
  const vertexBudget = Math.max(1, Math.floor(budget * 0.5));
  const faceBudget = Math.max(1, Math.floor(budget * 0.25));
  const vertexStride = Math.max(1, Math.floor(count / vertexBudget));
  for (let i = 0; i < count; i += vertexStride) {
    points.push(new THREE.Vector3().fromBufferAttribute(position, i));
  }
  const triangleCount = Math.floor(count / 3);
  const faceStride = Math.max(1, Math.floor(triangleCount / faceBudget));
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let t = 0; t < triangleCount; t += faceStride) {
    a.fromBufferAttribute(position, t * 3);
    b.fromBufferAttribute(position, t * 3 + 1);
    c.fromBufferAttribute(position, t * 3 + 2);
    points.push(
      new THREE.Vector3()
        .addVectors(a, b)
        .add(c)
        .multiplyScalar(1 / 3),
      new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5),
      new THREE.Vector3().addVectors(b, c).multiplyScalar(0.5),
      new THREE.Vector3().addVectors(c, a).multiplyScalar(0.5),
    );
  }
  for (let i = points.length - 1; i > 0; i--) {
    const j = Math.floor((i * 2654435761) % (i + 1));
    const tmp = points[i];
    points[i] = points[j];
    points[j] = tmp;
  }
  return points.slice(0, budget);
}

interface DepthProbe {
  depth: number;
  point: THREE.Vector3 | null;
}

/**
 * 在 `geometry`（位姿 `matrix`）中寻找「落入 other 实体且距其表面最远」的采样点。
 * 返回距离（米）与模型空间坐标。
 */
function probeDepth(
  geometry: THREE.BufferGeometry,
  matrix: THREE.Matrix4,
  otherBVH: MeshBVH,
  otherMatrix: THREE.Matrix4,
  ray: THREE.Ray,
  hitInfo: HitPointInfo,
): DepthProbe {
  const toOther = new THREE.Matrix4().copy(otherMatrix).invert().multiply(matrix);
  const points = samplePoints(geometry);
  let best = 0;
  let bestWorld: THREE.Vector3 | null = null;
  const local = new THREE.Vector3();
  for (const sample of points) {
    local.copy(sample).applyMatrix4(toOther);
    if (!pointInsideSolid(local, otherBVH, ray)) continue;
    const info = otherBVH.closestPointToPoint(local, hitInfo, 0, Infinity);
    const distance = info ? info.distance : 0;
    if (distance > best) {
      best = distance;
      bestWorld = local.clone().applyMatrix4(otherMatrix);
    }
  }
  return { depth: best, point: bestWorld };
}

/** AABB 交集盒的最小边长（退化情形的深度下限）。 */
function overlapMinExtent(boxA: THREE.Box3, boxB: THREE.Box3): number {
  const minX = Math.max(boxA.min.x, boxB.min.x);
  const minY = Math.max(boxA.min.y, boxB.min.y);
  const minZ = Math.max(boxA.min.z, boxB.min.z);
  const maxX = Math.min(boxA.max.x, boxB.max.x);
  const maxY = Math.min(boxA.max.y, boxB.max.y);
  const maxZ = Math.min(boxA.max.z, boxB.max.z);
  if (maxX <= minX || maxY <= minY || maxZ <= minZ) return 0;
  return Math.min(maxX - minX, maxY - minY, maxZ - minZ);
}

interface PairContact {
  /** 重叠深度（米）；-1 表示「确定相交但未测深」（早退模式）。 */
  depth: number;
  point: THREE.Vector3;
  estimated: boolean;
  triCount: number;
}

const reusableHitInfo: HitPointInfo = { point: new THREE.Vector3(), distance: 0, faceIndex: -1 };
const reusableRay = new THREE.Ray();
const reusableLine = new THREE.Line3();

/** 完整分析一对实例：相交判定 + 深度 + 代表点。无相交返回 null。 */
export function analyzePair(bodyA: BodyInstance, bodyB: BodyInstance, detailed: boolean): PairContact | null {
  const bvhA = getBVH(bodyA.handle.geometry);
  const bvhB = getBVH(bodyB.handle.geometry);
  const matrixBToA = new THREE.Matrix4().copy(bodyA.matrix).invert().multiply(bodyB.matrix);
  let triCount = 0;
  let firstPoint: THREE.Vector3 | null = null;
  bvhA.bvhcast(bvhB, matrixBToA, {
    intersectsTriangles(triangleA, triangleB) {
      if (triangleA.intersectsTriangle(triangleB, reusableLine)) {
        triCount++;
        if (!firstPoint) firstPoint = reusableLine.start.clone().applyMatrix4(bodyA.matrix);
        if (!detailed) return true; // 早退
      }
      return false;
    },
  });
  if (triCount === 0) return null;

  if (!detailed) {
    return {
      depth: -1,
      point: firstPoint ?? bodyA.box.getCenter(new THREE.Vector3()),
      estimated: true,
      triCount,
    };
  }

  const probeA = probeDepth(
    bodyA.handle.geometry,
    bodyA.matrix,
    bvhB,
    bodyB.matrix,
    reusableRay,
    reusableHitInfo,
  );
  const probeB = probeDepth(
    bodyB.handle.geometry,
    bodyB.matrix,
    bvhA,
    bodyA.matrix,
    reusableRay,
    reusableHitInfo,
  );
  let depth = Math.max(probeA.depth, probeB.depth);
  let point = (probeA.depth >= probeB.depth ? probeA.point : probeB.point) ?? firstPoint;
  let estimated = false;
  const aabbFloor = overlapMinExtent(bodyA.box, bodyB.box);
  if (aabbFloor > 0 && depth < aabbFloor * 0.5) {
    depth = Math.max(depth, aabbFloor);
    estimated = true;
  }
  if (!point) point = bodyA.box.getCenter(new THREE.Vector3());
  if (depth <= 0) {
    depth = Math.max(aabbFloor, 1e-4);
    estimated = true;
  }
  return { depth, point, estimated, triCount };
}

function makeReport(
  assembled: AssembledModel,
  bodyA: BodyInstance,
  bodyB: BodyInstance,
  contact: PairContact,
  phase: ClippingReport["phase"],
  frame: number | null,
  minDepthM: number,
): ClippingReport {
  const depth = contact.depth < 0 ? minDepthM : Math.max(contact.depth, minDepthM);
  return {
    type: "clipping",
    phase,
    a: bodyA.ref,
    b: bodyB.ref,
    depth_mm: Number((depth * 1000).toFixed(3)),
    point: [
      Number(contact.point.x.toFixed(5)),
      Number(contact.point.y.toFixed(5)),
      Number(contact.point.z.toFixed(5)),
    ],
    frame,
    severity: "error",
    hint: buildHint(
      {
        registry: assembled.registry,
        constants: assembled.constants,
        defA: bodyA.handle.def,
        defB: bodyB.handle.def,
      },
      depth * 1000,
    ),
    estimated: contact.depth < 0 || contact.estimated ? true : undefined,
    aLayer: bodyA.handle.buildLayer,
    bLayer: bodyB.handle.buildLayer,
  };
}

/** 静态装配检测：全量实例对。 */
export function detectStatic(assembled: AssembledModel, options: ClippingOptions = {}): ClippingReport[] {
  const minDepthM = options.minDepthM ?? 0.0005;
  const margin = options.broadphaseMarginM ?? 0;
  const budget = options.analysisBudget ?? 120;
  assembled.root.updateMatrixWorld(true);
  const bodies = collectInstances(assembled, options.filter);
  const reports: ClippingReport[] = [];
  const pairs: Array<[BodyInstance, BodyInstance]> = [];
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const left = bodies[i];
      const right = bodies[j];
      if (margin > 0 || left.box.intersectsBox(right.box)) {
        if (margin > 0) {
          const probe = left.box.clone().expandByScalar(margin);
          if (!probe.intersectsBox(right.box)) continue;
        }
        pairs.push([left, right]);
      }
    }
  }
  for (let index = 0; index < pairs.length; index++) {
    const [left, right] = pairs[index];
    const contact = analyzePair(left, right, index < budget);
    if (contact && (contact.depth < 0 || contact.depth >= minDepthM)) {
      reports.push(makeReport(assembled, left, right, contact, "static", null, minDepthM));
    }
    options.onProgress?.(index + 1, pairs.length);
  }
  return sortReports(reports);
}

export interface SweepOptions extends ClippingOptions {
  /** 采样时长（秒）。 */
  duration: number;
  /** 采样帧率，默认 30（框架文档要求 ≥30fps）。 */
  fps?: number;
  /** 采样回调：把模型摆到 t 时刻（检测器随后读取矩阵）。 */
  applyPose: (t: number) => void;
}

/** 运动扫掠检测：逐帧检查「至少一方在动」的候选对，报告带帧号。 */
export function detectSweep(assembled: AssembledModel, options: SweepOptions): ClippingReport[] {
  const fps = options.fps ?? 30;
  const minDepthM = options.minDepthM ?? 0.0005;
  const frameCount = Math.max(2, Math.round(options.duration * fps) + 1);
  const reportBudget = options.analysisBudget ?? 120;
  const reports: ClippingReport[] = [];

  const sampleFrame = (frameIndex: number): BodyInstance[] => {
    const t = (frameIndex / (frameCount - 1)) * options.duration;
    options.applyPose(t);
    assembled.syncInstances();
    assembled.root.updateMatrixWorld(true);
    return collectInstances(assembled, options.filter);
  };

  // ---- 第 1 遍：扫掠包围盒 + 运动标记 ----
  const sweptBox = new Map<string, THREE.Box3>();
  const previousBox = new Map<string, THREE.Box3>();
  const moved = new Set<string>();
  const partOf = new Map<string, PartHandle>();
  for (let frameIndex = 0; frameIndex < frameCount; frameIndex++) {
    for (const body of sampleFrame(frameIndex)) {
      partOf.set(body.ref, body.handle);
      const swept = sweptBox.get(body.ref);
      if (swept) swept.union(body.box);
      else sweptBox.set(body.ref, body.box.clone());
      const previous = previousBox.get(body.ref);
      if (previous) {
        if (
          previous.min.distanceToSquared(body.box.min) > 1e-18 ||
          previous.max.distanceToSquared(body.box.max) > 1e-18
        ) {
          moved.add(body.ref);
        }
        previous.copy(body.box);
      } else {
        previousBox.set(body.ref, body.box.clone());
      }
    }
    options.onProgress?.(frameIndex + 1, frameCount * 2);
  }

  // ---- 候选对：扫掠盒相交 且 至少一方在动 ----
  interface Candidate {
    leftRef: string;
    rightRef: string;
  }
  const candidates: Candidate[] = [];
  const refs = [...sweptBox.keys()];
  for (let i = 0; i < refs.length; i++) {
    for (let j = i + 1; j < refs.length; j++) {
      const leftRef = refs[i];
      const rightRef = refs[j];
      if (!moved.has(leftRef) && !moved.has(rightRef)) continue;
      if (!sweptBox.get(leftRef)!.intersectsBox(sweptBox.get(rightRef)!)) continue;
      candidates.push({ leftRef, rightRef });
    }
  }

  // ---- 第 2 遍：逐帧检测 ----
  const seen = new Set<string>();
  for (let frameIndex = 0; frameIndex < frameCount; frameIndex++) {
    const bodyByRef = new Map<string, BodyInstance>();
    for (const body of sampleFrame(frameIndex)) bodyByRef.set(body.ref, body);
    for (const candidate of candidates) {
      const left = bodyByRef.get(candidate.leftRef);
      const right = bodyByRef.get(candidate.rightRef);
      if (!left || !right) continue;
      if (!left.box.intersectsBox(right.box)) continue;
      const key = `${candidate.leftRef}\u0000${candidate.rightRef}`;
      const contact = analyzePair(left, right, !seen.has(key) && reports.length < reportBudget);
      if (contact && (contact.depth < 0 || contact.depth >= minDepthM)) {
        if (!seen.has(key)) {
          seen.add(key);
          reports.push(makeReport(assembled, left, right, contact, "animation", frameIndex, minDepthM));
        }
      }
    }
    options.onProgress?.(frameCount + frameIndex + 1, frameCount * 2);
  }
  return sortReports(reports);
}
