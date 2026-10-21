import * as THREE from "three";
import type { AssembledModel, PartHandle } from "../assembler/assembler";
import { instanceRef } from "../registry/types";

// ============================================================================
// solver/support —— 悬空检测（支撑邻居）
//
// 穿模检测回答「碰了不该碰的」，支撑检测回答「该碰的没碰」：
// 每个实例必须有另一个实例在 `maxGapM` 以内（AABB 最近距离；重叠 = 0）。
// 超过阈值即「疑似悬空」——不是直接判错，而是提示去查漏建的支架/挂点。
//
// 口径与边界：
//   · AABB 距离是保守估计（细长/斜置件的包围盒会显得比真实表面更近），
//     因此只会漏报、不会凭空报；第一遍用它把 1995 个实例扫完 <100ms。
//   · 同零件的其他实例也算邻居（履带板靠相邻履带板成链、螺栓靠同圈螺栓）；
//     需要检查「整组重复件都悬空」时改走零件级汇总，本函数按实例返回。
//   · 特效件 / 飞行件用 tags: ["fx"] / ["floating"] 豁免（见 types.ts 的 tags 说明）。
//   · 调用前请 resetNodes() 到装配态——动画姿态下的悬空不属于装配缺陷。
// ============================================================================

export interface SupportOptions {
  /** 支撑阈值（米）：最近邻居距离超过该值判疑似悬空。默认 20mm（全车 2–5mm 名义缝的 4 倍）。 */
  maxGapM?: number;
  /** 零件级过滤（层验收等）；被过滤的零件既不被检查、也不能充当别人的支撑。 */
  filter?: (handle: PartHandle) => boolean;
  /** 豁免标签（零件 def.tags）：默认 fx / floating。 */
  exemptTags?: string[];
}

export interface SupportReport {
  type: "unsupported";
  /** 实例级引用：`tiger.hull.lifting_eye[1]`（单件无下标）。 */
  ref: string;
  partId: string;
  /** 到最近邻居的 AABB 间隙（毫米）。 */
  gap_mm: number;
  nearest: string;
  nearestPartId: string;
  hint: string;
}

export const DEFAULT_SUPPORT_GAP_M = 0.02;
export const DEFAULT_SUPPORT_EXEMPT_TAGS = ["fx", "floating"] as const;

interface BodyInstance {
  handle: PartHandle;
  ref: string;
  box: THREE.Box3;
}

function aabbGap(a: THREE.Box3, b: THREE.Box3): number {
  const dx = Math.max(0, a.min.x - b.max.x, b.min.x - a.max.x);
  const dy = Math.max(0, a.min.y - b.max.y, b.min.y - a.max.y);
  const dz = Math.max(0, a.min.z - b.max.z, b.min.z - a.max.z);
  return Math.hypot(dx, dy, dz);
}

function collectBodies(assembled: AssembledModel, options: SupportOptions): BodyInstance[] {
  const exempt = new Set(options.exemptTags ?? DEFAULT_SUPPORT_EXEMPT_TAGS);
  const bodies: BodyInstance[] = [];
  for (const handle of assembled.parts) {
    if (options.filter && !options.filter(handle)) continue;
    if (handle.def.tags?.some((tag) => exempt.has(tag))) continue;
    if (!handle.geometry.boundingBox) handle.geometry.computeBoundingBox();
    const matrix = new THREE.Matrix4();
    for (const instance of handle.instances) {
      assembled.instanceMatrix(handle, instance.index, matrix);
      const box = new THREE.Box3().copy(handle.geometry.boundingBox!).applyMatrix4(matrix);
      bodies.push({
        handle,
        ref: instanceRef(handle.partId, handle.instanced ? instance.index : null),
        box,
      });
    }
  }
  return bodies;
}

/**
 * 扫描所有实例的最近支撑邻居。返回按间隙降序排列的疑似悬空报告。
 * O(n²) AABB 距离：虎式 1995 实例约 2M 次比较，量级与一次静态穿模检测相当。
 */
export function detectUnsupportedParts(
  assembled: AssembledModel,
  options: SupportOptions = {},
): SupportReport[] {
  const maxGapM = options.maxGapM ?? DEFAULT_SUPPORT_GAP_M;
  const bodies = collectBodies(assembled, options);
  // 单件整机没有“同体邻居”，支撑检测的前提不成立；不把它误报为悬空。
  if (bodies.length <= 1) return [];
  const reports: SupportReport[] = [];

  for (let i = 0; i < bodies.length; i++) {
    const body = bodies[i]!;
    let bestGap = Infinity;
    let best: BodyInstance | null = null;
    for (let j = 0; j < bodies.length; j++) {
      if (i === j) continue;
      const candidate = bodies[j]!;
      const gap = aabbGap(body.box, candidate.box);
      if (gap < bestGap) {
        bestGap = gap;
        best = candidate;
        if (bestGap === 0) break;
      }
    }
    if (bestGap <= maxGapM) continue;
    const nearestName = best?.handle.def.name_cn ?? "—";
    reports.push({
      type: "unsupported",
      ref: body.ref,
      partId: body.handle.partId,
      gap_mm: bestGap * 1000,
      nearest: best?.ref ?? "—",
      nearestPartId: best?.handle.partId ?? "—",
      hint:
        `${body.handle.def.name_cn} 与最近零件「${nearestName}」相距 ${(bestGap * 1000).toFixed(1)}mm，` +
        `超过支撑阈值 ${(maxGapM * 1000).toFixed(0)}mm。检查是否漏建支架/挂点；` +
        `若为特效件/飞行件，给零件加 tags: ["fx"] 或 ["floating"]。`,
    });
  }

  return reports.sort((left, right) => right.gap_mm - left.gap_mm || left.ref.localeCompare(right.ref));
}
