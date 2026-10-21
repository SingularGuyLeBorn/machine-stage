import * as THREE from "three";
import { cylinderGeometry, mergeGeometries, tubeGeometry } from "../../kernel/geometry";

// ============================================================================
// t800/mech —— 机械零件生成器
//
// 一个 GLB 切出来的「光滑整块」在机器人里不可能是一整块实心壳，
// 而应该是**机械器件组合**：承力骨架 + 纵梁 + 横撑 + 轴承(外圈/内圈/密封)
// + 螺栓圈 + 液压软管 + 管接头 + 油嘴。
//
// 外轮廓仍由「护板」（原网格表面分片）保持 —— 这里只生成**内部**的机械件，
// 全部按部位的长轴与横截面尺寸推算，保证装得进原壳体内。
// ============================================================================

/** 机械件种类。 */
export type MechKind =
  | "frame"
  | "rail"
  | "brace"
  | "shaft"
  | "bushing"
  | "bearing_outer"
  | "bearing_inner"
  | "bearing_seal"
  | "clip"
  | "bolts"
  | "hose"
  | "fitting"
  | "nipple";

/** 一件机械零件（几何以自身中心为原点）。 */
export interface MechPart {
  kind: MechKind;
  /** 同类零件的序号（用于命名，如「纵梁 01」） */
  index: number;
  geometry: THREE.BufferGeometry;
  /** 该件在部位坐标系里的中心 */
  center: [number, number, number];
}

/** 部位配方：决定生成哪些机械件。 */
export type Recipe = "limb" | "torso" | "head" | "hand" | "finger" | "pin" | "eye";

/** 部位的几何参数（来自原网格包围盒）。 */
export interface BoneBox {
  /** 包围盒中心 */
  center: [number, number, number];
  /** 包围盒尺寸 */
  size: [number, number, number];
}

/** 按配方决定机械件清单。 */
function planFor(recipe: Recipe): Array<{ kind: MechKind; count: number }> {
  switch (recipe) {
    case "limb":
      return [
        { kind: "frame", count: 1 },
        { kind: "rail", count: 2 },
        { kind: "brace", count: 4 },
        { kind: "bearing_outer", count: 2 },
        { kind: "bearing_inner", count: 2 },
        { kind: "bearing_seal", count: 2 },
        { kind: "bolts", count: 2 },
        { kind: "hose", count: 2 },
        { kind: "fitting", count: 2 },
        { kind: "nipple", count: 1 },
        { kind: "clip", count: 2 },
        { kind: "bushing", count: 2 },
      ];
    case "torso":
      return [
        { kind: "frame", count: 1 },
        { kind: "rail", count: 3 },
        { kind: "brace", count: 5 },
        { kind: "bearing_outer", count: 2 },
        { kind: "bearing_inner", count: 2 },
        { kind: "bearing_seal", count: 2 },
        { kind: "bolts", count: 3 },
        { kind: "hose", count: 3 },
        { kind: "fitting", count: 3 },
        { kind: "nipple", count: 2 },
        { kind: "clip", count: 2 },
        { kind: "shaft", count: 1 },
      ];
    case "head":
      return [
        { kind: "frame", count: 1 },
        { kind: "brace", count: 2 },
        { kind: "bearing_outer", count: 1 },
        { kind: "bearing_inner", count: 1 },
        { kind: "bearing_seal", count: 1 },
        { kind: "bolts", count: 1 },
        { kind: "hose", count: 1 },
        { kind: "fitting", count: 1 },
      ];
    case "hand":
      return [
        { kind: "frame", count: 1 },
        { kind: "rail", count: 2 },
        { kind: "brace", count: 1 },
        { kind: "bearing_outer", count: 1 },
        { kind: "bearing_inner", count: 1 },
        { kind: "bearing_seal", count: 1 },
        { kind: "bolts", count: 1 },
        { kind: "shaft", count: 1 },
      ];
    case "finger":
      return [
        { kind: "frame", count: 1 },
        { kind: "shaft", count: 1 },
        { kind: "clip", count: 1 },
      ];
    case "pin":
      return [
        { kind: "shaft", count: 1 },
        { kind: "clip", count: 2 },
        { kind: "bushing", count: 1 },
      ];
    case "eye":
    default:
      return [
        { kind: "frame", count: 1 },
        { kind: "bearing_inner", count: 1 },
        { kind: "bearing_seal", count: 1 },
      ];
  }
}

/** 把几何按「起点→终点」摆好（圆柱默认沿 Y）。 */
function tubeBetween(
  from: THREE.Vector3,
  to: THREE.Vector3,
  radius: number,
  segments = 12,
  inner?: number,
): THREE.BufferGeometry {
  const dir = to.clone().sub(from);
  const length = Math.max(dir.length(), 1e-4);
  const geometry =
    inner !== undefined
      ? tubeGeometry(radius, inner, length, segments)
      : cylinderGeometry(radius, length, radius, segments);
  const quat = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    dir.clone().normalize(),
  );
  const mid = from.clone().add(to).multiplyScalar(0.5);
  geometry.applyQuaternion(quat);
  geometry.translate(mid.x, mid.y, mid.z);
  return geometry;
}

/** 生成一个部位的机械零件清单。 */
export function buildMechParts(box: BoneBox, recipe: Recipe): MechPart[] {
  const [cx, cy, cz] = box.center;
  const [sx, sy, sz] = box.size;
  // 长轴
  let axis = 0;
  if (sy > sx && sy >= sz) axis = 1;
  else if (sz > sx && sz > sy) axis = 2;
  const len = [sx, sy, sz][axis];
  const p1 = [0, 1, 2].filter((k) => k !== axis);
  const w = box.size[p1[0]];
  const d = box.size[p1[1]];
  const cross = Math.max(0.004, Math.min(w, d));
  const mid = [cx, cy, cz];

  const at = (t: number, u: number, v: number): THREE.Vector3 => {
    const p = [0, 0, 0];
    p[axis] = mid[axis] + t;
    p[p1[0]] = mid[p1[0]] + u;
    p[p1[1]] = mid[p1[1]] + v;
    return new THREE.Vector3(p[0], p[1], p[2]);
  };

  const parts: MechPart[] = [];
  const counters: Partial<Record<MechKind, number>> = {};
  const add = (kind: MechKind, geometry: THREE.BufferGeometry) => {
    geometry.computeBoundingBox();
    const c = (geometry.boundingBox ?? new THREE.Box3()).getCenter(new THREE.Vector3());
    const idx = counters[kind] ?? 0;
    counters[kind] = idx + 1;
    // 几何以自身中心为原点（与零件装配位一致）
    geometry.translate(-c.x, -c.y, -c.z);
    parts.push({ kind, index: idx, geometry, center: [c.x, c.y, c.z] });
  };

  const half = len * 0.5;
  const plan = planFor(recipe);

  for (const { kind, count } of plan) {
    for (let i = 0; i < count; i++) {
      switch (kind) {
        case "frame": {
          // 承力骨架：主筒 + 两根副筒（三角截面）
          const r = cross * (recipe === "eye" ? 0.2 : 0.16);
          add(kind, tubeBetween(at(-half * 0.68, 0, 0), at(half * 0.68, 0, 0), r, 16));
          if (recipe === "limb" || recipe === "torso" || recipe === "head" || recipe === "hand") {
            const off = cross * 0.2;
            for (const s of [-1, 1]) {
              add(
                kind,
                tubeBetween(
                  at(-half * 0.6, off * 0.55, off * s * 0.7),
                  at(half * 0.6, off * 0.55, off * s * 0.7),
                  r * 0.62,
                  12,
                ),
              );
            }
          }
          break;
        }
        case "rail": {
          const off = cross * 0.19;
          const s = i % 2 === 0 ? -1 : 1;
          add(
            kind,
            tubeBetween(
              at(-half * 0.62, off * 0.85, off * s * 0.85),
              at(half * 0.62, off * 0.85, off * s * 0.85),
              Math.max(0.0025, cross * 0.1),
              10,
            ),
          );
          break;
        }
        case "brace": {
          const t = -half * 0.52 + (i + 0.5) * ((half * 1.04) / count);
          const r = cross * 0.45;
          add(kind, tubeBetween(at(t, -r, 0), at(t, r, 0), Math.max(0.0025, cross * 0.085), 10));
          add(
            kind,
            tubeBetween(at(t, 0, -r), at(t, 0, r), Math.max(0.0025, cross * 0.085), 10),
          );
          break;
        }
        case "shaft": {
          const r = Math.max(0.002, cross * 0.16);
          add(kind, tubeBetween(at(-half * 0.66, 0, 0), at(half * 0.66, 0, 0), r, 12));
          break;
        }
        case "bushing": {
          const t = i % 2 === 0 ? -half * 0.56 : half * 0.56;
          const r = cross * 0.14;
          add(kind, tubeBetween(at(t - 0.012, 0, 0), at(t + 0.012, 0, 0), r, 14, r * 0.62));
          break;
        }
        case "clip": {
          const t = i % 2 === 0 ? -half * 0.48 : half * 0.48;
          const r = cross * 0.2;
          add(kind, tubeBetween(at(t - 0.004, 0, 0), at(t + 0.004, 0, 0), r, 16, r * 0.78));
          break;
        }
        case "bearing_outer": {
          const t = i % 2 === 0 ? -half * 0.64 : half * 0.64;
          const r = cross * 0.3;
          add(kind, tubeBetween(at(t - 0.016, 0, 0), at(t + 0.016, 0, 0), r, 20, r * 0.7));
          break;
        }
        case "bearing_inner": {
          const t = i % 2 === 0 ? -half * 0.88 : half * 0.88;
          const r = cross * 0.2;
          add(kind, tubeBetween(at(t - 0.018, 0, 0), at(t + 0.018, 0, 0), r, 18, r * 0.55));
          break;
        }
        case "bearing_seal": {
          const t = i % 2 === 0 ? -half * 0.88 : half * 0.88;
          const r = cross * 0.24;
          add(kind, tubeBetween(at(t - 0.004, 0, 0), at(t + 0.004, 0, 0), r, 18, r * 0.72));
          break;
        }
        case "bolts": {
          // 螺栓圈：一圈小螺栓（合成一件几何）
          const t = i % 2 === 0 ? -half * 0.66 : half * 0.66;
          const ringR = cross * 0.24;
          const n = 10;
          const bolts: THREE.BufferGeometry[] = [];
          for (let b = 0; b < n; b++) {
            const a = (b / n) * Math.PI * 2;
            const u = Math.cos(a) * ringR;
            const v = Math.sin(a) * ringR;
            const g = cylinderGeometry(Math.max(0.0015, cross * 0.045), 0.012, Math.max(0.0015, cross * 0.045), 6);
            const q = new THREE.Quaternion().setFromUnitVectors(
              new THREE.Vector3(0, 1, 0),
              new THREE.Vector3(0, 1, 0),
            );
            g.applyQuaternion(q);
            const p = at(t, u, v);
            g.translate(p.x, p.y, p.z);
            bolts.push(g);
          }
          const merged = mergeGeometries(bolts);
          for (const g of bolts) g.dispose();
          add(kind, merged);
          break;
        }
        case "hose": {
          // 液压软管：沿肢体侧面走一根带弯的管
          const s = i % 2 === 0 ? -1 : 1;
          const off = cross * 0.24;
          const pts = [
            at(-half * 0.6, off * 0.45, off * s * 0.9),
            at(-half * 0.22, off * 0.85, off * s * 1.0),
            at(half * 0.2, off * 0.7, off * s * 0.85),
            at(half * 0.6, off * 0.4, off * s * 0.9),
          ];
          const curve = new THREE.CatmullRomCurve3(pts);
          const g = new THREE.TubeGeometry(curve, 16, Math.max(0.002, cross * 0.075), 8, false);
          add(kind, g);
          break;
        }
        case "fitting": {
          const t = -half * 0.5 + (i / Math.max(1, count - 1)) * half * 1.0;
          const r = Math.max(0.002, cross * 0.1);
          add(kind, tubeBetween(at(t, offOf(cross, 0.34), 0), at(t, offOf(cross, 0.34), 0), r, 10));
          break;
        }
        case "nipple": {
          const t = i % 2 === 0 ? -half * 0.26 : half * 0.26;
          const r = Math.max(0.0015, cross * 0.06);
          add(
            kind,
            tubeBetween(at(t, offOf(cross, 0.26), 0), at(t, offOf(cross, 0.26) + r * 2, 0), r, 6),
          );
          break;
        }
      }
    }
  }

  return parts;
}

/** 垂直于长轴的偏移量（装在肢体的一侧）。 */
function offOf(cross: number, k: number): number {
  return cross * k;
}
