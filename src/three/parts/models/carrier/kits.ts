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

/** 舰体外壳（带内腔的环形挤出）+ 上部外飘环带（克令克以上向甲板底收口）。 */
export const carrierHullShell: GeometryBuilder = () => {
  const outer = planShape(hullPlan(0));
  // 内腔艏端截短到 17.3，避免 0.02m 宽的病态薄片孔洞导致外壳三角化开洞。
  const inner = planShape(hullPlan(0.16), 0, 1.2);
  outer.holes.push(new THREE.Path(inner.getPoints(200)));
  const height = CV.HULL_TOP - CV.HULL_BOTTOM;
  const geometry = new THREE.ExtrudeGeometry(outer, {
    depth: height,
    bevelEnabled: false,
    curveSegments: 1,
    steps: 1,
  });
  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, CV.HULL_TOP, 0);
  geometry.computeVertexNormals();
  return mergeWithUv([geometry, hullUpperBand()]);
};

/** 舰岛一体化隐身塔：八折角内倾体，承接相控阵/桅杆，不再叠方形楼层。 */
export const carrierIslandTower: GeometryBuilder = () => {
  const sections = [
    { y: 0, w: 0.76, l: 2.45, c: 0.22 },
    { y: 0.72, w: 0.62, l: 2.02, c: 0.2 },
    { y: 1.34, w: 0.48, l: 1.56, c: 0.17 },
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

/** 克令克（y=3.05）到飞行甲板底（y=4.42）的外飘舷侧环带：收口甲板与舰体之间的透空缝。 */
function hullUpperBand(): THREE.BufferGeometry {
  const knuckle = 2.4;
  const top = CV.DECK_Y + 0.02;
  const heights = [knuckle, 3.4, 3.72, 4.05, top];
  const base = hullPlan(0);
  const rings = heights.map((y) => {
    const t = Math.min(1, Math.max(0, (y - knuckle) / (top - knuckle)));
    const ease = t * t * (3 - 2 * t);
    return base.map(([x, z]) => {
      const bow = Math.min(1, Math.max(0, (z - 5) / 12));
      const flare = (0.48 + 0.38 * bow * bow) * ease;
      return new THREE.Vector3(x + Math.sign(x) * flare, y, z);
    });
  });
  const positions: number[] = [];
  const uvs: number[] = [];
  const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => {
    for (const p of [a, b, c]) {
      positions.push(p.x, p.y, p.z);
      uvs.push(p.x, p.z);
    }
  };
  for (let h = 0; h < rings.length - 1; h++) {
    const lo = rings[h]!;
    const hi = rings[h + 1]!;
    for (let i = 0; i < lo.length - 1; i++) {
      const a = lo[i]!;
      const b = lo[i + 1]!;
      const c = hi[i + 1]!;
      const d = hi[i]!;
      tri(a, d, c);
      tri(a, c, b);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  return geometry;
}

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

/** 舰体底板（双层底的上层）。 */
export const carrierBottom: GeometryBuilder = () =>
  extrudedPlan(hullPlan(0.08), 0.14, CV.HULL_BOTTOM + 0.14);

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
