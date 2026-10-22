import * as THREE from "three";
import type { AssembledModel, PartHandle } from "../assembler/assembler";
import { getMergedPieces } from "../kernel/geometry";

// ============================================================================
// solver/kitConnectivity —— 合并 kit 内部自连通检查
//
// 件级悬空/孤岛检测（solver/support）把「零件 × 实例」当一个 body：
// 零件内部几个子块即使互相断开，只要整件有别的零件托着，就查不出来
// （烟幕发射器上排两管悬空就是这种盲区）。
//
// 这里在 mergeGeometries 时保留叶子子块 AABB，对同一零件内部的子块建连通图：
//   · 子块 AABB 间隙 <= maxGapM 视为连通（与件级支撑阈值一致，默认 20mm）；
//   · 最大体积分量视为「主体」，其余分量即零件内部悬空孤岛；
//   · 小于 minSizeM 的碎片（焊点/铆钉/小装饰）不报，避免噪音。
// ============================================================================

export interface KitConnectivityOptions {
  /** 子块连通阈值（米）。默认 20mm。 */
  maxGapM?: number;
  /** 只报最大尺寸不小于该值的孤岛（米）。默认 30mm（滤掉焊点/铆钉）。 */
  minSizeM?: number;
  filter?: (handle: PartHandle) => boolean;
  /** 豁免标签：默认 fx / floating。 */
  exemptTags?: string[];
}

export interface KitIslandReport {
  type: "kit-island";
  partId: string;
  name: string;
  /** 叶子子块总数。 */
  pieces: number;
  /** 与主体断开、且达到尺寸阈值的子块数。 */
  orphanPieces: number;
  /** 断开分量数量（仅统计达到尺寸阈值的）。 */
  orphanGroups: number;
  /** 到最近「外部零件」的 AABB 间隙（毫米）；没有外部零件时为 null。 */
  gap_mm: number | null;
  /** 孤岛最大外形尺寸（毫米）。 */
  size_mm: number;
  /** 有多少个实例存在悬空孤岛。 */
  instances: number;
  hint: string;
}

const DEFAULT_MAX_GAP_M = 0.02;
const DEFAULT_MIN_SIZE_M = 0.03;
const DEFAULT_EXEMPT_TAGS = ["fx", "floating"] as const;

function aabbGap(a: THREE.Box3, b: THREE.Box3): number {
  const dx = Math.max(0, a.min.x - b.max.x, b.min.x - a.max.x);
  const dy = Math.max(0, a.min.y - b.max.y, b.min.y - a.max.y);
  const dz = Math.max(0, a.min.z - b.max.z, b.min.z - a.max.z);
  return Math.hypot(dx, dy, dz);
}

function unionOf(boxes: readonly THREE.Box3[]): THREE.Box3 {
  const union = new THREE.Box3();
  for (const box of boxes) union.union(box);
  return union;
}

function maxDimension(box: THREE.Box3): number {
  if (box.isEmpty()) return 0;
  const size = box.getSize(new THREE.Vector3());
  return Math.max(size.x, size.y, size.z);
}

function volumeOf(box: THREE.Box3): number {
  if (box.isEmpty()) return 0;
  const size = box.getSize(new THREE.Vector3());
  return size.x * size.y * size.z;
}

interface ExternalBody {
  handle: PartHandle;
  box: THREE.Box3;
}

/** 所有实例的世界 AABB（用于判断孤岛是否被另一个零件托住）。 */
function collectExternalBodies(
  assembled: AssembledModel,
  options: KitConnectivityOptions,
  exempt: Set<string>,
): ExternalBody[] {
  const bodies: ExternalBody[] = [];
  for (const handle of assembled.parts) {
    if (options.filter && !options.filter(handle)) continue;
    if (handle.def.tags?.some((tag) => exempt.has(tag))) continue;
    if (!handle.geometry.boundingBox) handle.geometry.computeBoundingBox();
    const local = handle.geometry.boundingBox!;
    for (const instance of handle.instances) {
      const matrix = assembled.instanceMatrix(handle, instance.index, new THREE.Matrix4());
      bodies.push({ handle, box: new THREE.Box3().copy(local).applyMatrix4(matrix) });
    }
  }
  return bodies;
}

/**
 * 扫描整机所有合并件内部的断开子块。返回按孤岛尺寸降序排列的报告。
 */
export function detectKitIslands(
  assembled: AssembledModel,
  options: KitConnectivityOptions = {},
): KitIslandReport[] {
  const maxGapM = options.maxGapM ?? DEFAULT_MAX_GAP_M;
  const minSizeM = options.minSizeM ?? DEFAULT_MIN_SIZE_M;
  const exempt = new Set(options.exemptTags ?? DEFAULT_EXEMPT_TAGS);
  const bodies = collectExternalBodies(assembled, options, exempt);
  const reports: KitIslandReport[] = [];

  for (const handle of assembled.parts) {
    if (options.filter && !options.filter(handle)) continue;
    if (handle.def.tags?.some((tag) => exempt.has(tag))) continue;
    // 百叶/焊点/铆钉/螺栓圈本来就是分离阵列，不属于「合并件内部悬空」；
    // 真正要抓的是结构 kit 里漏了支架的子块。
    const geometryType = handle.def.geometry.type;
    if (geometryType === "louver" || geometryType === "weld" || geometryType === "rivets" || geometryType === "boltCircle") {
      continue;
    }
    const pieces = getMergedPieces(handle.geometry);
    if (!pieces || pieces.length < 2) continue;

    const n = pieces.length;
    const parent = new Int32Array(n);
    for (let i = 0; i < n; i++) parent[i] = i;
    const find = (x: number): number => {
      let root = x;
      while (parent[root] !== root) root = parent[root]!;
      while (parent[x] !== x) {
        const next = parent[x]!;
        parent[x] = root;
        x = next;
      }
      return root;
    };
    const union = (a: number, b: number) => {
      const ra = find(a);
      const rb = find(b);
      if (ra !== rb) parent[rb] = ra;
    };
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (aabbGap(pieces[i]!, pieces[j]!) <= maxGapM) union(i, j);
      }
    }

    const groups = new Map<number, number[]>();
    for (let i = 0; i < n; i++) {
      const root = find(i);
      const list = groups.get(root) ?? [];
      list.push(i);
      groups.set(root, list);
    }
    if (groups.size <= 1) continue;

    const groupRows = [...groups.values()].map((indices) => {
      const boxes = indices.map((index) => pieces[index]!);
      const box = unionOf(boxes);
      return { indices, boxes, box, size: maxDimension(box), volume: volumeOf(box) };
    });
    groupRows.sort((a, b) => b.volume - a.volume || b.size - a.size || b.indices.length - a.indices.length);
    const orphans = groupRows.slice(1).filter((group) => group.size >= minSizeM);
    if (orphans.length === 0) continue;

    // 关键判据：孤岛只要被另一个零件在阈值内托住（例如格栅叶片坐在甲板上、
    // ERA 螺栓拧在前盖上），就不算悬空；只有既不连主体、也没有外部支撑才报。
    let unsupportedInstances = 0;
    let nearestExternalGap = Infinity;
    const scratchMatrix = new THREE.Matrix4();
    for (const instance of handle.instances) {
      assembled.instanceMatrix(handle, instance.index, scratchMatrix);
      let instanceUnsupported = false;
      for (const orphan of orphans) {
        const worldBox = orphan.box.clone().applyMatrix4(scratchMatrix);
        let externalGap = Infinity;
        for (const body of bodies) {
          if (body.handle === handle) continue;
          externalGap = Math.min(externalGap, aabbGap(worldBox, body.box));
          if (externalGap <= maxGapM) break;
        }
        if (externalGap > maxGapM) {
          instanceUnsupported = true;
          nearestExternalGap = Math.min(nearestExternalGap, externalGap);
        }
      }
      if (instanceUnsupported) unsupportedInstances++;
    }
    if (unsupportedInstances === 0) continue;

    const orphanPieces = orphans.reduce((sum, group) => sum + group.indices.length, 0);
    const largest = Math.max(...orphans.map((group) => group.size));
    const gapMm = Number.isFinite(nearestExternalGap) ? Number((nearestExternalGap * 1000).toFixed(2)) : null;
    reports.push({
      type: "kit-island",
      partId: handle.partId,
      name: handle.def.name_cn,
      pieces: n,
      orphanPieces,
      orphanGroups: orphans.length,
      gap_mm: gapMm,
      size_mm: Number((largest * 1000).toFixed(2)),
      instances: unsupportedInstances,
      hint:
        `合并件内部有 ${orphanPieces} 个子块既不连主体、也没有外部零件在 ${(maxGapM * 1000).toFixed(0)}mm 内托住` +
        `${gapMm === null ? "" : `（最近外部零件 ${gapMm.toFixed(1)}mm）`}；` +
        `最大子块 ${(largest * 1000).toFixed(1)}mm，检查是否漏建支架/安装座。`,
    });
  }

  return reports.sort(
    (a, b) =>
      b.size_mm - a.size_mm ||
      (b.gap_mm ?? Number.POSITIVE_INFINITY) - (a.gap_mm ?? Number.POSITIVE_INFINITY) ||
      a.partId.localeCompare(b.partId),
  );
}
