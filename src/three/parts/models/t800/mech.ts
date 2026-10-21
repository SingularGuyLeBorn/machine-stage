import * as THREE from "three";
import { cylinderGeometry, mergeGeometries, tubeGeometry } from "../../kernel/geometry";
import { loftTube, profileBone, type BoneProfile } from "./mesh/crossSection";

// ============================================================================
// t800/mech —— 机械零件生成器
//
// 一个 GLB 切出来的「光滑整块」在机器人里不可能是一整块实心壳，
// 而应该是**机械器件组合**：承力骨架 + 纵梁 + 横撑 + 轴承(外圈/内圈/密封)
// + 螺栓圈 + 液压软管 + 管接头 + 油嘴。
//
// 尺寸来源：沿骨段长轴采样**真实截面**（mesh/crossSection.ts），
// 得到"芯线 + 半径剖面"，所有机械件贴着这条芯线走 ——
// 外形吻合源网格，又不会在凹处捅穿壳体。
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
  | "nipple"
  | "bolt"
  | "clamp"
  | "nut";

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
        { kind: "bolt", count: 1 },
        { kind: "nut", count: 1 },
        { kind: "clamp", count: 2 },
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
        { kind: "bolt", count: 1 },
        { kind: "nut", count: 1 },
        { kind: "clamp", count: 3 },
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
        { kind: "bolt", count: 1 },
        { kind: "nut", count: 1 },
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
        { kind: "bolt", count: 1 },
        { kind: "nut", count: 1 },
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

/**
 * 生成一个部位的机械零件清单。
 *
 * @param geometry 该部位的网格（用于采样真实截面）
 * @param recipe   机械配方
 * @param origin   部位网格在模型坐标里的原点（网格本身以包围盒中心为原点）
 */
export function buildMechParts(
  geometry: THREE.BufferGeometry,
  recipe: Recipe,
  origin: [number, number, number],
): MechPart[] {
  const profile: BoneProfile = profileBone(geometry);
  const cores = profile.cores.map((c) => c.clone().add(new THREE.Vector3(...origin)));
  const radii = profile.radii;
  const n = cores.length;

  // 局部正交基（垂直于主轴）
  const e = new THREE.Vector3();
  e.setComponent(profile.axis, 1);
  const u = new THREE.Vector3();
  u.setComponent((profile.axis + 1) % 3, 1);
  const v = new THREE.Vector3().crossVectors(e, u).normalize();
  u.crossVectors(v, e).normalize();

  const parts: MechPart[] = [];
  const counters: Partial<Record<MechKind, number>> = {};
  const add = (kind: MechKind, g: THREE.BufferGeometry) => {
    g.computeBoundingBox();
    const c = (g.boundingBox ?? new THREE.Box3()).getCenter(new THREE.Vector3());
    const idx = counters[kind] ?? 0;
    counters[kind] = idx + 1;
    g.translate(-c.x, -c.y, -c.z);
    parts.push({ kind, index: idx, geometry: g, center: [c.x, c.y, c.z] });
  };

  // 安全半径：取剖面最小值（保证任何一件都不会捅出壳体）
  const minR = Math.max(0.003, Math.min(...radii));
  // 机械件尺寸封顶：大件（大骨盆/胸廓）的局部空腔很大，不封顶会变成"套在身上的铁圈"
  const CAP = 0.032;
  /** 按局部可用半径取尺寸，并封顶。 */
  const sz = (r: number, k: number): number => Math.min(r * k, CAP);

  /** 站位索引（按参数比例）。 */
  const station = (frac: number): number =>
    Math.max(0, Math.min(n - 1, Math.round(frac * (n - 1))));

  const plan = planFor(recipe);

  for (const { kind, count } of plan) {
    for (let i = 0; i < count; i++) {
      switch (kind) {
        case "frame": {
          // 承力骨架：主筒沿芯线放样（半径按局部剖面走）
          const rs = radii.map((r) => sz(r, recipe === "eye" ? 0.35 : 0.26));
          add(kind, loftTube(cores, rs, 14));
          if (recipe === "limb" || recipe === "torso" || recipe === "head" || recipe === "hand") {
            // 两根副筒：沿芯线偏移
            for (const s of [-1, 1]) {
              const pts = cores.map((c, k) =>
                c.clone().addScaledVector(u, sz(radii[k], 0.2)).addScaledVector(v, sz(radii[k], 0.26) * s),
              );
              const rs2 = radii.map((r) => sz(r, 0.14));
              add(kind, loftTube(pts, rs2, 10));
            }
          }
          break;
        }
        case "rail": {
          const s = i % 2 === 0 ? -1 : 1;
          const pts = cores.map((c, k) =>
            c.clone().addScaledVector(u, sz(radii[k], 0.18)).addScaledVector(v, sz(radii[k], 0.2) * s),
          );
          const rs = radii.map((r) => Math.max(0.0015, sz(r, 0.1)));
          add(kind, loftTube(pts, rs, 8));
          break;
        }
        case "brace": {
          // 横撑：放在某个站位，长度按该站位的可用半径（封顶，免得捅出壳体）
          const si = station((i + 0.5) / count);
          const r = radii[si];
          const c = cores[si];
          const half = sz(r, 0.5);
          add(kind, tubeBetween(c.clone().addScaledVector(u, -half), c.clone().addScaledVector(u, half), Math.max(0.0018, sz(r, 0.07)), 8));
          add(kind, tubeBetween(c.clone().addScaledVector(v, -half), c.clone().addScaledVector(v, half), Math.max(0.0018, sz(r, 0.07)), 8));
          break;
        }
        case "shaft": {
          const rs = radii.map((r) => Math.max(0.0015, sz(r, 0.2)));
          add(kind, loftTube(cores, rs, 10));
          break;
        }
        case "bushing": {
          const si = station(i % 2 === 0 ? 0.18 : 0.82);
          const r = radii[si];
          const c = cores[si];
          const dir = new THREE.Vector3().subVectors(cores[si + 1] ?? cores[si], cores[si - 1] ?? cores[si]).normalize();
          add(kind, tubeBetween(c.clone().addScaledVector(dir, -0.006), c.clone().addScaledVector(dir, 0.006), sz(r, 0.3), 12, sz(r, 0.3) * 0.66));
          break;
        }
        case "clip": {
          const si = station(i % 2 === 0 ? 0.2 : 0.8);
          const r = radii[si];
          const c = cores[si];
          const dir = new THREE.Vector3().subVectors(cores[si + 1] ?? cores[si], cores[si - 1] ?? cores[si]).normalize();
          add(kind, tubeBetween(c.clone().addScaledVector(dir, -0.003), c.clone().addScaledVector(dir, 0.003), sz(r, 0.5), 14, sz(r, 0.5) * 0.76));
          break;
        }
        case "bearing_outer": {
          const si = station(i % 2 === 0 ? 0.04 : 0.96);
          const r = radii[si];
          const c = cores[si];
          const dir = new THREE.Vector3().subVectors(cores[si + 1] ?? cores[si], cores[si - 1] ?? cores[si]).normalize();
          add(kind, tubeBetween(c.clone().addScaledVector(dir, -0.012), c.clone().addScaledVector(dir, 0.012), sz(r, 0.5), 16, sz(r, 0.5) * 0.68));
          break;
        }
        case "bearing_inner": {
          const si = station(i % 2 === 0 ? 0.04 : 0.96);
          const r = radii[si];
          const c = cores[si];
          const dir = new THREE.Vector3().subVectors(cores[si + 1] ?? cores[si], cores[si - 1] ?? cores[si]).normalize();
          add(kind, tubeBetween(c.clone().addScaledVector(dir, -0.014), c.clone().addScaledVector(dir, 0.014), sz(r, 0.34), 14, sz(r, 0.34) * 0.66));
          break;
        }
        case "bearing_seal": {
          const si = station(i % 2 === 0 ? 0.04 : 0.96);
          const r = radii[si];
          const c = cores[si];
          const dir = new THREE.Vector3().subVectors(cores[si + 1] ?? cores[si], cores[si - 1] ?? cores[si]).normalize();
          add(kind, tubeBetween(c.clone().addScaledVector(dir, -0.003), c.clone().addScaledVector(dir, 0.003), sz(r, 0.4), 14, sz(r, 0.4) * 0.75));
          break;
        }
        case "bolts": {
          // 螺栓圈：沿芯线端点的一圈小螺栓
          const si = station(i % 2 === 0 ? 0.02 : 0.98);
          const r = radii[si];
          const c = cores[si];
          const dir = new THREE.Vector3().subVectors(cores[si + 1] ?? cores[si], cores[si - 1] ?? cores[si]).normalize();
          const ringR = sz(r, 0.36);
          const count = 10;
          const bolts: THREE.BufferGeometry[] = [];
          const boltR = Math.max(0.0012, sz(r, 0.05));
          for (let b = 0; b < count; b++) {
            const a = (b / count) * Math.PI * 2;
            const g = cylinderGeometry(boltR, 0.01, boltR, 6);
            const p = c.clone().addScaledVector(u, Math.cos(a) * ringR).addScaledVector(v, Math.sin(a) * ringR);
            const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
            g.applyQuaternion(q);
            g.translate(p.x, p.y, p.z);
            bolts.push(g);
          }
          const merged = mergeGeometries(bolts);
          for (const g of bolts) g.dispose();
          add(kind, merged);
          break;
        }
        case "hose": {
          // 液压软管：沿芯线一侧走一根带弯的管（只走中段，端部不甩出去）
          const s = i % 2 === 0 ? -1 : 1;
          const from = station(0.12);
          const to = station(0.88);
          const pts: THREE.Vector3[] = [];
          for (let k = from; k <= to; k++) {
            const r = radii[k];
            pts.push(
              cores[k]
                .clone()
                .addScaledVector(u, sz(r, 0.22))
                .addScaledVector(v, sz(r, 0.26) * s),
            );
          }
          if (pts.length < 2) break;
          const curve = new THREE.CatmullRomCurve3(pts);
          const g = new THREE.TubeGeometry(curve, 18, Math.max(0.0016, sz(minR, 0.1)), 8, false);
          add(kind, g);
          break;
        }
        case "fitting": {
          const si = station(0.15 + (i / Math.max(1, count - 1)) * 0.7);
          const r = radii[si];
          const c = cores[si];
          const dir = new THREE.Vector3().subVectors(cores[si + 1] ?? cores[si], cores[si - 1] ?? cores[si]).normalize();
          const rr = Math.max(0.0016, sz(r, 0.12));
          const off = sz(r, 0.45);
          add(kind, tubeBetween(c.clone().addScaledVector(u, off), c.clone().addScaledVector(u, off).addScaledVector(dir, rr * 1.6), rr, 10));
          break;
        }
        case "nipple": {
          const si = station(i % 2 === 0 ? 0.35 : 0.65);
          const r = radii[si];
          const c = cores[si];
          const rr = Math.max(0.0012, sz(r, 0.07));
          const off = sz(r, 0.4);
          add(kind, tubeBetween(c.clone().addScaledVector(v, off), c.clone().addScaledVector(v, off + rr * 1.4), rr, 6));
          break;
        }
        case "bolt": {
          // 螺栓：**一颗一个零件**，沿芯线端点铺一圈
          const si = station(i % 2 === 0 ? 0.06 : 0.94);
          const r = radii[si];
          const c = cores[si];
          const dir = new THREE.Vector3()
            .subVectors(cores[si + 1] ?? cores[si], cores[si - 1] ?? cores[si])
            .normalize();
          const ring = Math.min(r * 0.55, 0.028);
          const head = Math.max(0.0016, sz(r, 0.06));
          const shank = head * 0.55;
          for (let b = 0; b < 10; b++) {
            const a = (b / 10) * Math.PI * 2;
            const p = c
              .clone()
              .addScaledVector(u, Math.cos(a) * ring)
              .addScaledVector(v, Math.sin(a) * ring);
            const hd = cylinderGeometry(head, head * 0.8, head, 6);
            const sh = cylinderGeometry(shank, head * 1.8, shank, 8);
            sh.translate(0, -head * 1.3, 0);
            const merged = mergeGeometries([hd, sh]);
            hd.dispose();
            sh.dispose();
            const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
            merged.applyQuaternion(q);
            merged.translate(p.x, p.y, p.z);
            add(kind, merged);
          }
          break;
        }
        case "nut": {
          // 螺母：另一端一圈
          const si = station(i % 2 === 0 ? 0.18 : 0.82);
          const r = radii[si];
          const c = cores[si];
          const dir = new THREE.Vector3()
            .subVectors(cores[si + 1] ?? cores[si], cores[si - 1] ?? cores[si])
            .normalize();
          const ring = Math.min(r * 0.5, 0.024);
          const rr = Math.max(0.0016, sz(r, 0.05));
          for (let b = 0; b < 8; b++) {
            const a = (b / 8) * Math.PI * 2;
            const p = c
              .clone()
              .addScaledVector(u, Math.cos(a) * ring)
              .addScaledVector(v, Math.sin(a) * ring);
            const g = cylinderGeometry(rr, rr * 1.1, rr, 6);
            const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
            g.applyQuaternion(q);
            g.translate(p.x, p.y, p.z);
            add(kind, g);
          }
          break;
        }
        case "clamp": {
          // 卡箍（抱箍）：套在芯线某处的一段短管
          const si = station(0.25 + i * 0.22);
          const r = radii[si];
          const dir = new THREE.Vector3()
            .subVectors(cores[si + 1] ?? cores[si], cores[si - 1] ?? cores[si])
            .normalize();
          const c = cores[si];
          const rr = sz(r, 0.3);
          add(
            kind,
            tubeBetween(
              c.clone().addScaledVector(dir, -0.006),
              c.clone().addScaledVector(dir, 0.006),
              rr,
              14,
              rr * 0.82,
            ),
          );
          break;
        }
      }
    }
  }

  return parts;
}
