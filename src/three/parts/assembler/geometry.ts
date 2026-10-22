import * as THREE from "three";
import { evaluateExpression } from "../registry/expression";
import type { GeometrySpec, KitParam } from "../registry/types";
import {
  airfoilGeometry,
  bevelBoxGeometry,
  boltCircleGeometry,
  cylinderGeometry,
  latheGeometry,
  louverGeometry,
  mergeGeometries,
  planarUv,
  plateGeometry,
  polygonExtrudeGeometry,
  rivetStripGeometry,
  sphereGeometry,
  tubeGeometry,
  weldBeadGeometry,
} from "../kernel/geometry";

// ============================================================================
// assembler/geometry —— GeometrySpec → BufferGeometry
//   resolveSpec：把声明里的表达式全部替换为数值（纯数据，可缓存、可测试）
//   genericBuilders：内置几何构造器；模型可用 options.builders 覆盖或注册 kit
// ============================================================================

export type ResolvedKitParams = Record<string, KitParam>;

export interface GeometryBuildContext {
  /** 已解析常量（供 kit 使用，如履带节距、路径长）。 */
  constants: Record<string, number>;
  /** kit 构造器表（模型可注册自定义 kit）。 */
  builders?: Record<string, GeometryBuilder>;
}

export type GeometryBuilder = (spec: GeometrySpec, ctx: GeometryBuildContext) => THREE.BufferGeometry;

/** 深度优先把声明中的字符串表达式替换成数值；解析失败的字符串保持原样（供 kit 的语义参数使用）。 */
export function resolveSpec(value: unknown, constants: Record<string, number>): unknown {
  if (typeof value === "string") {
    try {
      return evaluateExpression(value, constants);
    } catch {
      return value;
    }
  }
  if (Array.isArray(value)) return value.map((item) => resolveSpec(item, constants));
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) result[key] = resolveSpec(item, constants);
    return result;
  }
  return value;
}

const BUILTIN: Record<string, GeometryBuilder> = {
  box: (spec) => {
    const s = spec as { w: number; h: number; d: number; bevel?: number };
    return bevelBoxGeometry(s.w, s.h, s.d, s.bevel ?? 0.02);
  },
  plate: (spec) => {
    const s = spec as { w: number; h: number; t?: number; bevel?: number };
    return plateGeometry(s.w, s.h, s.t ?? 0.012, s.bevel ?? 0.003);
  },
  cylinder: (spec) => {
    const s = spec as { r: number; h: number; rTop?: number; segments?: number; bevel?: number };
    return cylinderGeometry(s.r, s.h, s.rTop ?? s.r, s.segments ?? 24, s.bevel ?? 0);
  },
  tube: (spec) => {
    const s = spec as { rOuter: number; rInner: number; h: number; segments?: number };
    return tubeGeometry(s.rOuter, s.rInner, s.h, s.segments ?? 24);
  },
  sphere: (spec) => {
    const s = spec as { r: number; segments?: number };
    return sphereGeometry(s.r, s.segments ?? 16);
  },
  lathe: (spec) => {
    const s = spec as { profile: [number, number][]; segments?: number };
    return latheGeometry(s.profile, s.segments ?? 32);
  },
  polygon: (spec) => {
    const s = spec as { points: [number, number][]; depth: number; bevel?: number };
    return polygonExtrudeGeometry(s.points, s.depth, s.bevel ?? 0.004);
  },
  rivets: (spec) => {
    const s = spec as { count: number; spacing: number; radius?: number };
    return rivetStripGeometry(s.count, s.spacing, s.radius ?? 0.006);
  },
  boltCircle: (spec) => {
    const s = spec as { count: number; radius: number; boltR?: number; boltH?: number };
    return boltCircleGeometry(s.count, s.radius, s.boltR ?? 0.012, s.boltH ?? 0.014);
  },
  louver: (spec) => {
    const s = spec as { count: number; w: number; h: number; slantDeg?: number; t?: number };
    return louverGeometry(s.count, s.w, s.h, s.slantDeg ?? 38, s.t ?? 0.006);
  },
  weld: (spec) => {
    const s = spec as {
      from: [number, number, number];
      to: [number, number, number];
      radius?: number;
      seed?: number;
    };
    return weldBeadGeometry(s.from, s.to, s.radius ?? 0.006, s.seed ?? 1);
  },
  merge: (spec, ctx) => {
    const s = spec as { parts: GeometrySpec[] };
    const geometries = s.parts.map((child) => {
      const geometry = buildGeometry(child, ctx);
      // 可选相对偏移：让 merge 的子件按装配关系摆放（如油底壳碗体落在法兰下方），
      // 纯数值（不走表达式解析）——merge 子件本就在同一局部坐标系里。
      const at = (child as { at?: [number, number, number] }).at;
      if (Array.isArray(at) && at.length === 3) geometry.translate(at[0], at[1], at[2]);
      return geometry;
    });
    const merged = mergeGeometries(geometries);
    for (const geometry of geometries) geometry.dispose();
    return merged;
  },
};

/** 由声明构建几何；kit 类型的 builder 需在 options.builders 中注册。 */
export function buildGeometry(spec: GeometrySpec, ctx: GeometryBuildContext): THREE.BufferGeometry {
  if (spec.type === "kit") {
    const kitBuilder = ctx.builders?.[spec.kit];
    if (!kitBuilder) throw new Error(`assembler：未注册的几何 kit "${spec.kit}"`);
    const geometry = kitBuilder(spec, ctx);
    // 各向异性材质需要真实变化的 UV 重建切线基；缺 UV 的几何一律补平面投影。
    if (!geometry.getAttribute("uv")) planarUv(geometry);
    return geometry;
  }
  const builder = BUILTIN[spec.type];
  if (!builder) throw new Error(`assembler：未知几何类型 "${(spec as { type: string }).type}"`);
  const geometry = builder(spec, ctx);
  if (!geometry.getAttribute("uv")) planarUv(geometry);
  return geometry;
}

export const builtinGeometryBuilders = BUILTIN;
export { airfoilGeometry };
