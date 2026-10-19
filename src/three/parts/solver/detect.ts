import * as THREE from "three";
import { MeshBVH, type HitPointInfo } from "three-mesh-bvh";
import type { AssembledModel, PartHandle } from "../assembler/assembler";
import { buildHint, formatReportRef, sortReports, type ClippingReport, type OverlapForm } from "./report";

// ============================================================================
// solver/detect —— 穿模检测器（静态装配 + 动画扫掠）
//
// 三级检测（框架文档第 6 节）：
//   1) 静态：AABB 粗检 → BVH 三角形精检（three-mesh-bvh bvhcast）
//   2) 扫掠：动画按 ≥30fps 采样，逐帧对「至少一方在动」的候选对检测
//   3) 参数扫描：= 重建 + 静态（由调用方循环）
//
// 交线几何（三修之一：弃用「probeDepth 单打独斗 + AABB 冒充深度」）：
//   · bvhcast 回调里累计 intersectsTriangle 输出线段的总长与分布包围盒；
//   · 形态分类（判定树，交线总长 + 分布尺寸）：
//       绕轴闭合 + 交线来自贴合壁对   → bearing_overlap（同心配合面）→ 可豁免；
//       交线退化成薄面 + 全部来自近平行面 → face_mate（贴面接触）→ 装配接触，不报；
//       交线退化（< 0.1mm）           → face_mate（共面贴合）→ 装配接触，不报；
//       局部成团且实测出深度           → displaced（错位穿透）→ 未豁免，必报；
//       其余（成团 / 超长交线 / 分布超标）→ suspect（存疑穿透）→ 未豁免，必报。
//   · 贴合面修正（三修补丁）：共面板接触的「交线」其实是侧壁切面与贴合面的交线（三角面法向近垂直），
//     同轴配合面（压装轴承/轴套/鞍座）的交线才来自近共面三角面对（法向近平行）。
//     测不出深度时再要求「交线主要来自近共面对」，否则不再当作贴合面放行，而是判 suspect 照报；
//     但「交线云退化成薄面 + 交线全部来自近平行面」本身就是贴面接触的证据（长交线也一样），归 face_mate。
//   · 深度 = 落入对方实体的采样点到对方表面的最大距离（只报真实穿透）；
//     测不出时 depth = null（卡片显示「交线 XXmm（形态）」）。
//     AABB 交叠尺寸不再参与深度（旧实现用它兜底，才会出现 125.60mm 假数字）。
// 判定口径：实测深度 ≥ minDepthM（默认 0.5mm）报「真穿透」级；
//           suspect 级不看 minDepthM（成团/横穿的证据本身就是要报的缺陷）；
//           测不出深度但交线绕轴闭合（配合面）仍报，交给白名单分层（未豁免 / 已豁免）。
// 早退模式（超出详细分析预算）只判相交不测深：depth = null + estimated——
// 形态仍由交线算出（不依赖深度），因此「报不报」与预算无关，只影响 depth 是否实测。
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
  /** 判定阈值：实测穿透深度小于该值视作「装配接触」，不报（多面贴合除外，见 detect 头部口径）。 */
  minDepthM?: number;
  /** AABB 粗检余量（米）。 */
  broadphaseMarginM?: number;
  /** 零件级过滤（层验收：只检查本层及以内）。 */
  filter?: (handle: PartHandle) => boolean;
  /** 详细分析（测深）的零件对上限；超出的对只判定相交不测深（estimated）。 */
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
 * 在给定采样点（位于 `matrix` 位姿的零件局部空间）中，寻找「落入 other 实体且距其表面最远」的点。
 * 返回距离（米）与模型空间坐标。采样点由调用方给出：相交三角形局部采样 + 全域采样兜底。
 */
function probeDepth(
  points: readonly THREE.Vector3[],
  matrix: THREE.Matrix4,
  otherBVH: MeshBVH,
  otherMatrix: THREE.Matrix4,
  ray: THREE.Ray,
  hitInfo: HitPointInfo,
): DepthProbe {
  const toOther = new THREE.Matrix4().copy(otherMatrix).invert().multiply(matrix);
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

/** 交线形态阈值与采样预算（详见文件头部的三修口径）。 */
const RING_MIN_RATIO = 0.62;
/** 三角面对「近共面」判据：|cos(法向夹角)| ≥ 该值（≈ 45° 内）视为贴合面切向交线。 */
const PARALLEL_FACE_DOT = 0.7;
/** 近共面对贡献的交线长度占比下限：低于此值说明交线来自侧壁切面（普通贴合面）。 */
const PARALLEL_LINE_MIN_RATIO = 0.5;
/** 交线最小厚度（米 = 0.1mm）：退化在一个平面上的交线（贴合面 / 擦切面）没有体积穿透证据。 */
const PLANAR_LINE_EPS = 1e-4;
/** 交线总长退化阈值（米 = 0.1mm）：低于此值 = 共面贴合（face_mate），交线本身已退化成一个点/线。 */
const FACE_MATE_LINE_M = 1e-4;
const SHAPE_SAMPLE_LIMIT = 480;
const TRIANGLE_SAMPLE_LIMIT = 64;
/** 详情预算外的交线采样点数：仍贴着交线取点，保证深度可测，只是密度低。 */
const TRIANGLE_SAMPLE_MIN = 8;
const GLOBAL_SAMPLE_BUDGET = 360;
/** 低于该值（米 = 0.01mm）视为「测不出深度」：面贴合 / 同心配合面。 */
const MIN_MEASURED_DEPTH_M = 1e-5;

interface PairContact {
  /** 实测穿透深度（米）；null = 测不出（面贴合 / 同心配合面）。 */
  depth: number | null;
  point: THREE.Vector3;
  estimated: boolean;
  triCount: number;
  /** 交线总长（米）：相交三角面对的交线段长度之和。 */
  lineLength: number;
  /** 交线分布包围盒尺寸（米，A 局部空间；刚性变换下即世界尺寸）。 */
  extent: THREE.Vector3;
  /** 相交形态（判定树）：face_mate（共面贴合）/ bearing_overlap（同心配合面）/ suspect（存疑穿透）/ displaced（错位穿透）。 */
  form: OverlapForm;
  /** 形态判据留档：交线点到质心距离的 min/max（0 = 不成环）。 */
  ringRatio: number;
  /** 形态判据留档：交线总长里来自近共面三角面对（贴合面切向）的占比。 */
  parallelRatio: number;
}

const reusableHitInfo: HitPointInfo = { point: new THREE.Vector3(), distance: 0, faceIndex: -1 };
const reusableRay = new THREE.Ray();
const reusableLine = new THREE.Line3();

/** 采样一个三角形：顶点 + 棱中点 + 面心（大三角形内部也要覆盖）。 */
function pushTrianglePoints(
  out: THREE.Vector3[],
  triangle: { a: THREE.Vector3; b: THREE.Vector3; c: THREE.Vector3 },
): void {
  const { a, b, c } = triangle;
  out.push(
    a.clone(),
    b.clone(),
    c.clone(),
    new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5),
    new THREE.Vector3().addVectors(b, c).multiplyScalar(0.5),
    new THREE.Vector3().addVectors(c, a).multiplyScalar(0.5),
    new THREE.Vector3()
      .addVectors(a, b)
      .add(c)
      .multiplyScalar(1 / 3),
  );
}

/**
 * 交线是否「绕轴闭合」（配合面形态）：
 *   · 环状：交线点到质心的距离几乎相等（中空的圆/椭圆/方框闭合线）；
 *   · 半环鞍座：交线近似平面、双向铺开且尺寸达到「轴径量级」（≥ 小件最大尺寸的 45%）。
 * 局部成团（错位穿透的碎块）两条都不满足。
 * 同时回报 `planar`（交线云退化成一张薄面）：配合面与贴面接触共用这个判据。
 */
function analyzeShape(
  samples: readonly THREE.Vector3[],
  extent: THREE.Vector3,
  spreadRatio: number,
): { closed: boolean; ringRatio: number; planar: boolean } {
  let ringRatio = 0;
  if (samples.length >= 8) {
    const center = new THREE.Vector3();
    for (const point of samples) center.add(point);
    center.multiplyScalar(1 / samples.length);
    let min = Infinity;
    let max = 0;
    for (const point of samples) {
      const distance = point.distanceTo(center);
      if (distance < min) min = distance;
      if (distance > max) max = distance;
    }
    ringRatio = max > 1e-9 ? min / max : 0;
  }
  const dims = [extent.x, extent.y, extent.z].sort((left, right) => right - left);
  const planar = dims[0] > 1e-9 && dims[2] <= 0.4 * dims[0];
  const balanced = dims[1] >= 0.4 * dims[0];
  const closed = ringRatio >= RING_MIN_RATIO || (planar && balanced && spreadRatio >= 0.45);
  return { closed, ringRatio, planar };
}

/** 两个三角面法向近平行（夹角 ≲45°）→ 该交线来自贴合面切向，而非侧壁切面。 */
function isNearlyParallelPair(
  first: THREE.Triangle,
  second: THREE.Triangle,
  normalA: THREE.Vector3,
  normalB: THREE.Vector3,
  edgeA: THREE.Vector3,
  edgeB: THREE.Vector3,
): boolean {
  edgeA.subVectors(first.b, first.a);
  edgeB.subVectors(first.c, first.a);
  normalA.crossVectors(edgeA, edgeB);
  edgeA.subVectors(second.b, second.a);
  edgeB.subVectors(second.c, second.a);
  normalB.crossVectors(edgeA, edgeB);
  const scale = normalA.length() * normalB.length();
  return scale > 1e-18 && Math.abs(normalA.dot(normalB)) / scale >= PARALLEL_FACE_DOT;
}

/** 完整分析一对实例：交线几何（总长/分布/形态）+ 实测深度 + 代表点。无相交返回 null。 */
export function analyzePair(bodyA: BodyInstance, bodyB: BodyInstance, detailed: boolean): PairContact | null {
  const bvhA = getBVH(bodyA.handle.geometry);
  const bvhB = getBVH(bodyB.handle.geometry);
  const matrixBToA = new THREE.Matrix4().copy(bodyA.matrix).invert().multiply(bodyB.matrix);
  const matrixAToB = new THREE.Matrix4().copy(matrixBToA).invert();
  let triCount = 0;
  let lineLength = 0;
  /** 近共面（贴合面切向）三角面对贡献的交线长度：配合面重叠 vs 普通贴合面的分水岭。 */
  let parallelLength = 0;
  const normalA = new THREE.Vector3();
  const normalB = new THREE.Vector3();
  const edgeA = new THREE.Vector3();
  const edgeB = new THREE.Vector3();
  let firstPoint: THREE.Vector3 | null = null;
  const lineBox = new THREE.Box3();
  const lineSamples: THREE.Vector3[] = [];
  const overlapPointsA: THREE.Vector3[] = [];
  const overlapPointsB: THREE.Vector3[] = [];
  let trianglesSampled = 0;
  bvhA.bvhcast(bvhB, matrixBToA, {
    intersectsTriangles(triangleA, triangleB) {
      if (!triangleA.intersectsTriangle(triangleB, reusableLine)) return false;
      triCount++;
      const segmentLength = reusableLine.distance();
      if (segmentLength <= 1e-9) {
        // 共面三角形：three-mesh-bvh 不给交线（edge 归零）→ 只计相交，不累计交线几何。
        if (!firstPoint) firstPoint = triangleA.a.clone().applyMatrix4(bodyA.matrix);
        return false;
      }
      lineLength += segmentLength;
      if (isNearlyParallelPair(triangleA, triangleB, normalA, normalB, edgeA, edgeB)) {
        parallelLength += segmentLength;
      }
      lineBox.expandByPoint(reusableLine.start).expandByPoint(reusableLine.end);
      if (!firstPoint) firstPoint = reusableLine.start.clone().applyMatrix4(bodyA.matrix);
      if (lineSamples.length < SHAPE_SAMPLE_LIMIT) {
        lineSamples.push(reusableLine.start.clone(), reusableLine.end.clone());
      }
      // 详情预算只影响「贴着交线的采样点数」（64 → 8）：全量预算下每对都测深度，
      // 交线形态判定与预算无关（否则预算外的对测不出深度，会被误判成 suspect）。
      const triangleLimit = detailed ? TRIANGLE_SAMPLE_LIMIT : TRIANGLE_SAMPLE_MIN;
      if (trianglesSampled < triangleLimit) {
        trianglesSampled++;
        pushTrianglePoints(overlapPointsA, triangleA);
        // bvhcast 已把 B 的三角形变换到 A 局部空间：折回 B 自身空间再采样。
        const back = (point: THREE.Vector3) => point.clone().applyMatrix4(matrixAToB);
        pushTrianglePoints(overlapPointsB, {
          a: back(triangleB.a),
          b: back(triangleB.b),
          c: back(triangleB.c),
        });
      }
      return false;
    },
  });
  if (triCount === 0) return null;

  const extent = lineBox.isEmpty() ? new THREE.Vector3() : lineBox.getSize(new THREE.Vector3());
  const sizeA = bodyA.box.getSize(new THREE.Vector3());
  const sizeB = bodyB.box.getSize(new THREE.Vector3());
  const smallerBody = Math.min(Math.max(sizeA.x, sizeA.y, sizeA.z), Math.max(sizeB.x, sizeB.y, sizeB.z));
  const spreadRatio = smallerBody > 1e-9 ? Math.max(extent.x, extent.y, extent.z) / smallerBody : 1;
  const { closed, ringRatio, planar } = analyzeShape(lineSamples, extent, spreadRatio);

  let depth: number | null = null;
  let point: THREE.Vector3 | null = null;
  {
    // 采样 = 相交三角形局部点（贴着交线，能抓到深埋点）+ 全域点（轴端/中部深埋兜底）。
    // 无条件测深度：跑到的都是真有三角面相交的对，成本由「相交对数」而不是「候选对数」决定。
    const probeA = probeDepth(
      overlapPointsA.concat(samplePoints(bodyA.handle.geometry, GLOBAL_SAMPLE_BUDGET)),
      bodyA.matrix,
      bvhB,
      bodyB.matrix,
      reusableRay,
      reusableHitInfo,
    );
    const probeB = probeDepth(
      overlapPointsB.concat(samplePoints(bodyB.handle.geometry, GLOBAL_SAMPLE_BUDGET)),
      bodyB.matrix,
      bvhA,
      bodyA.matrix,
      reusableRay,
      reusableHitInfo,
    );
    const best = probeA.depth >= probeB.depth ? probeA : probeB;
    if (best.depth >= MIN_MEASURED_DEPTH_M) {
      depth = best.depth;
      point = best.point;
    }
  }

  // 判定树（交线几何，不看详情预算）：
  //   1) 可测深度 → 绕轴闭合 = 同心配合面（深度由族的守门值 maxDepthMm 控制，默认 2mm）；
  //      不成环 = 错位穿透（必报，且不进豁免区）。
  //   2) 测不出深度 → 绕轴闭合且交线来自贴合壁对 = 同心配合面（压装轴套/轴承/鞍座）→ 可豁免；
  //      贴面接触（交线云退化成薄面 + 交线全部来自近平行面，如翼片坐在立柱顶面、
  //      两盒恰好接触）→ face_mate，不报；
  //      交线退化（≈ 0）= 共面贴合（装配接触，不报）；
  //      其余（成团 / 超长横穿交线，如「管横穿支架」）= suspect，必须报 —— null 不再等于放行。
  const parallelRatio = lineLength > 0 ? parallelLength / lineLength : 0;
  const parallelFaces = parallelRatio >= PARALLEL_LINE_MIN_RATIO;
  const form: OverlapForm =
    depth !== null
      ? closed
        ? "bearing_overlap"
        : "displaced"
      : closed && parallelFaces
        ? "bearing_overlap"
        : lineLength < FACE_MATE_LINE_M || (parallelFaces && planar)
          ? "face_mate"
          : "suspect";
  const fallback = firstPoint ?? lineBox.getCenter(new THREE.Vector3()).applyMatrix4(bodyA.matrix);
  return {
    depth,
    point: point ?? fallback,
    estimated: !detailed || depth === null,
    triCount,
    lineLength,
    extent,
    form,
    ringRatio,
    parallelRatio,
  };
}

/**
 * 报告口径（判定树）：suspect（存疑穿透）一律报——null 深度不许再当放行条；
 * 实测深度 ≥ minDepthM 报「真穿透」级；测不出深度但交线绕轴闭合（配合面）仍报，交给白名单分层；
 * 纯共面贴合（face_mate，交线退化）不报：0 间隙装配接触、擦切面本来就没有体积穿透证据
 * （两盒刚好接触 / 翼片擦过立柱都属于这类，报告会被它们淹没）。
 */
export function isReportableContact(contact: PairContact, minDepthM: number): boolean {
  if (contact.form === "suspect") return true;
  if (contact.depth !== null) return contact.depth >= minDepthM;
  if (contact.form !== "bearing_overlap") return false;
  const minExtent = Math.min(contact.extent.x, contact.extent.y, contact.extent.z);
  return minExtent > PLANAR_LINE_EPS;
}

function makeReport(
  assembled: AssembledModel,
  bodyA: BodyInstance,
  bodyB: BodyInstance,
  contact: PairContact,
  phase: ClippingReport["phase"],
  frame: number | null,
): ClippingReport {
  const depthMm = contact.depth === null ? null : Number((contact.depth * 1000).toFixed(3));
  const lineMm = Number((contact.lineLength * 1000).toFixed(2));
  return {
    type: "clipping",
    phase,
    a: bodyA.ref,
    b: bodyB.ref,
    depth_mm: depthMm,
    intersection_mm: lineMm,
    extent_mm: [
      Number((contact.extent.x * 1000).toFixed(2)),
      Number((contact.extent.y * 1000).toFixed(2)),
      Number((contact.extent.z * 1000).toFixed(2)),
    ],
    form: contact.form,
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
      depthMm,
      lineMm,
    ),
    estimated: contact.estimated ? true : undefined,
    aLayer: bodyA.handle.buildLayer,
    bLayer: bodyB.handle.buildLayer,
  };
}

export interface PairPlan {
  /** 实例级 body = 零件 × 实例展开（非实例件为 1 个）。 */
  bodies: BodyInstance[];
  /** AABB 粗检后的候选对。 */
  pairs: Array<[BodyInstance, BodyInstance]>;
}

/**
 * 零件对展开逻辑（诊断口径）：每个零件按实例展开成 body → 两两 AABB 粗检 → 候选对。
 * 报告是「实例级」：一个 body 对一条报告；零件级去重要在报告上另做（见 diag-clips）。
 */
export function planPairs(assembled: AssembledModel, options: ClippingOptions = {}): PairPlan {
  const margin = options.broadphaseMarginM ?? 0;
  const bodies = collectInstances(assembled, options.filter);
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
  return { bodies, pairs };
}

/** 静态装配检测：全量实例对。 */
export function detectStatic(assembled: AssembledModel, options: ClippingOptions = {}): ClippingReport[] {
  const minDepthM = options.minDepthM ?? 0.0005;
  // 详情预算只控制每对在交线上的采样密度（默认给足，让全部候选对都按高密度采样；
  // 真正吃时间的只有「确有三角面相交」的对，数量由几何决定）。
  const budget = options.analysisBudget ?? 20000;
  assembled.root.updateMatrixWorld(true);
  const plan = planPairs(assembled, options);
  const reports: ClippingReport[] = [];
  for (let index = 0; index < plan.pairs.length; index++) {
    const [left, right] = plan.pairs[index];
    const detailed = index < budget;
    const contact = analyzePair(left, right, detailed);
    // 报不报由形态判定（与详情预算无关）：suspect 必报，共面贴合不报，其余按深度/配合面口径。
    if (contact && isReportableContact(contact, minDepthM)) {
      reports.push(makeReport(assembled, left, right, contact, "static", null));
    }
    options.onProgress?.(index + 1, plan.pairs.length);
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
      const detailed = !seen.has(key) && reports.length < reportBudget;
      const contact = analyzePair(left, right, detailed);
      // 扫掠是「动件撞静件」的入口：口径与静态一致（suspect 必报；预算外只是采样密度降低）。
      if (contact && isReportableContact(contact, minDepthM)) {
        if (!seen.has(key)) {
          seen.add(key);
          reports.push(makeReport(assembled, left, right, contact, "animation", frameIndex));
        }
      }
    }
    options.onProgress?.(frameCount + frameIndex + 1, frameCount * 2);
  }
  return sortReports(reports);
}
