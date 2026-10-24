import * as T from "three";
import { mergeGeometries, mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { GeometryBuilder } from "../../assembler/geometry";
import { machinedBuilder } from "./machined";
import { tubeGeometry } from "../../kernel/geometry";

/** 白模近景中的铸造曲面；同一曲面函数同时决定护甲与紧固件位置。 */
function baseShellHeight(p: Record<string, unknown>, x: number, y: number): number {
  const width = Number(p.width),
    round = Number(p.round ?? 0.006);
  const ax = Math.sqrt(x * x + round * round) - round;
  if (p.form === "back") {
    const lower = -y - 0.08;
    return Number(p.rise) - ax * 0.1 - y * 0.12 - (lower + Math.sqrt(lower * lower + round * round)) * 0.18;
  }
  if (p.form === "chest") {
    // 正面 10 与侧面 12：胸翼从胸骨向外上方展开，胸骨本身保持宽面，不能凸成尖锥。
    const ridge = y - ax * 0.65 + width * 0.4;
    const forwardFold = (v: number) => (v + Math.sqrt(v * v + round * round)) * 0.5;
    // 胸翼上面向窗口缓慢退后，下缘迅速折回胸腔；两侧同斜率会遮小开窗并形成鼓包。
    const wing = Number(p.rise) - ax * 0.12 - 0.36 * forwardFold(ridge) - 0.95 * forwardFold(-ridge);
    const center = width * 0.27 - y * 0.12 - ((x * x) / width) * 0.32;
    const t = Math.min(1, Math.max(0, (ax / width - 0.1) / 0.23));
    // 二阶连续的过渡避免胸骨与胸翼交界处出现两条波浪状高光。
    const blend = t ** 3 * (t * (t * 6 - 15) + 10);
    const lower = -y - width * 0.28;
    return center * (1 - blend) + wing * blend - (lower + Math.sqrt(lower * lower + round * round)) * 0.23;
  }
  if (p.form === "collar") {
    // 领口从胸前向颈侧后卷，顶缘回到颈柱两侧，不能只是一块斜直板。
    const neckRoll = y - 0.015;
    return (
      Number(p.rise) -
      y * 0.5 -
      x * 0.13 -
      ((x * x) / width) * 0.18 -
      0.45 * (neckRoll + Math.sqrt(neckRoll * neckRoll + round * round))
    );
  }
  if (p.form === "face") {
    // 额面是宽平面，向两侧太阳穴和顶部折回；鼻梁只在眼窝之间前出。
    const hinge = (v: number, r: number) => (v + Math.sqrt(v * v + r * r)) * 0.5;
    const sideFold = hinge(ax - width * 0.44, round * 0.42);
    const roofFold = hinge(y - width * 0.57, round * 0.65);
    const nose = Math.exp(-((x / (width * 0.27)) ** 2)) * Math.max(0, Math.min(1, -y / width + 0.24));
    return width * 0.36 - ax * 0.06 - sideFold * 0.8 - y * 0.3 - roofFold * 0.63 + width * 0.32 * nose;
  }
  if (p.form === "jaw") {
    return Number(p.rise) - 0.045 * (ax / width) ** 1.3 + y * 0.14;
  }
  if (p.form === "crown") {
    const hinge = (v: number) => (v + Math.sqrt(v * v + round * round)) * 0.5;
    return Number(p.rise) - 0.72 * hinge(ax - width * 0.32) - 0.56 * hinge(Math.abs(y) - 0.022);
  }
  if (p.form === "occipital") {
    const hinge = (v: number) => (v + Math.sqrt(v * v + round * round)) * 0.5;
    return Number(p.rise) - 0.014 * (ax / width) ** 2 - 0.76 * hinge(y - 0.022) - 0.3 * hinge(-y - 0.035);
  }
  if (p.form === "palm") {
    const brace = x + y * 0.25;
    return Number(p.rise) - 0.4 * Math.sqrt(brace * brace + round * round) - 0.08 * Math.abs(y);
  }
  if (p.form === "limb" || p.form === "shin") {
    const diagonal = x - y * (p.form === "shin" ? 0.23 : 0.16);
    const crest = Math.sqrt(diagonal * diagonal + round * round) - round;
    const taper = Math.sqrt(y * y + round * round) - round;
    let height =
      Number(p.rise) -
      crest * (p.form === "shin" ? 0.68 : 0.5) -
      taper * 0.05 +
      width * (p.form === "shin" ? 0.17 : 0.22) * Math.exp(-((y / (width * 1.65)) ** 4));
    for (const [cx, cy, rx, ry, h] of (p.bulges ?? []) as number[][]) {
      const dx = (x - cx) / rx,
        dy = (y - cy) / ry;
      // 肌腹的起伏铺满整片甲面，局部封闭鼓包会像额外焊上的凸块。
      height += (h * 0.4) / (1 + dx * dx * 0.5 + dy * dy * 0.35);
    }
    return height;
  }
  let z = Number(p.rise ?? 0) * (1 - ax / width) + Number(p.slope ?? 0) * y;
  z += Number(p.fold ?? 0) * (Math.sqrt(y * y + round * round) - round);
  // 白模上的肌腹由折面与窄过渡形成；高斯鼓包会把硬表面变成软胶囊。
  for (const [cx, cy, rx, ry, h] of (p.bulges ?? []) as number[][]) {
    const dx = (Math.sqrt((x - cx) ** 2 + round ** 2) - round) / rx;
    const dy = (Math.sqrt((y - cy) ** 2 + round ** 2) - round) / ry;
    const level = 1 - dx - dy;
    z += h * (level + Math.sqrt(level * level + 0.0016)) * 0.5;
  }
  return z;
}

/** 折面与压筋直接进入壳体曲面；不是贴图，也不增加无支撑的装饰浮片。 */
function shellRelief(p: Record<string, unknown>, x: number, y: number): number {
  const base = 0;
  const a = Math.abs(x);
  const crease = (v: number, width: number, height: number) => {
    const d = Math.sqrt(v * v + 0.0015 ** 2);
    const t = 1 - d / width;
    return height * (t + Math.sqrt(t * t + 0.0025)) * 0.5;
  };
  const facet = (cx: number, cy: number, wx: number, wy: number, h: number) => {
    const t = 1 - Math.abs((x - cx) / wx) - Math.abs((y - cy) / wy);
    return h * (t + Math.sqrt(t * t + 0.0036)) * 0.5;
  };
  switch (p.relief) {
    case "scapula":
      return (
        base +
        crease(y + a * 0.6 - 0.07, 0.065, 0.032) +
        crease(y - a * 0.48 + 0.12, 0.055, 0.026) +
        crease(x, 0.05, 0.022) +
        facet(0, -0.01, 0.1, 0.065, 0.018)
      );
    case "pectoral":
      return base + crease(y + x * 0.58 - 0.055, 0.024, 0.024) + facet(0.16, -0.038, 0.085, 0.055, 0.023);
    case "collar":
      return base + crease(x + y * 0.38 - 0.017, 0.018, 0.014) + facet(0.06, -0.025, 0.055, 0.05, 0.01);
    case "pelvis":
      return base + crease(y - a * 0.48 + 0.045, 0.02, 0.019) + crease(x, 0.025, 0.013);
    case "vertebra": {
      const flow = y + 0.007 * Math.cos(x / 0.014);
      return (
        base +
        crease(flow - 0.011, 0.0045, 0.004) +
        crease(flow + 0.004, 0.004, 0.0035) +
        facet(0.04, 0, 0.02, 0.025, 0.009) +
        facet(-0.04, 0, 0.02, 0.025, 0.009)
      );
    }
    case "palm":
      return (
        base +
        crease(x + y * 0.25, 0.012, 0.009) +
        facet(-0.04, 0.01, 0.017, 0.039, 0.006) +
        facet(0.04, -0.01, 0.016, 0.03, 0.006)
      );
    case "occipital":
      return (
        base +
        crease(x, 0.017, 0.012) +
        crease(y + a * 0.52 - 0.046, 0.014, 0.01) +
        crease(y - a * 0.62 + 0.035, 0.013, 0.008)
      );
    case "limb":
      return base + crease(x - y * 0.19, 0.018, 0.012) + crease(y + x * 0.6, 0.018, 0.006);
    default:
      return base;
  }
}
export function shellHeight(p: Record<string, unknown>, x: number, y: number): number {
  const scale = Number(p.reliefScale ?? 0.1) / 0.1;
  return baseShellHeight(p, x, y) + scale * shellRelief(p, x / scale, y / scale);
}

/** 肩罩沿前—顶—后连续回包；壳厚沿真实法线，避免四块平板拼出方盒。 */
export function shellPoint(p: Record<string, unknown>, x: number, y: number, z = 0): T.Vector3 {
  if (p.form === "shoulder") {
    const w = Number(p.width),
      u = Math.max(0, Math.min(1, (x / w + 1) / 2));
    const fold = (v: number) => (v + Math.sqrt(v * v + 0.0016)) * 0.5;
    const radius = w * (0.22 + 1.32 * u - 1.9 * fold(u - 0.48));
    const angle = y / (w * 0.84);
    const centerY = w * (-0.09 - 0.38 * u) - w * 0.25 * (1 - u) ** 4 - w * (0.026 / 0.118) * u ** 2;
    // 顶面、斜向棱和向下收尖的前后板共用一条圆角折线，不再使用球帽截面。
    const a = Math.sqrt(angle * angle + 0.0001) - 0.01;
    const hinge = (v: number) => (v + Math.sqrt(v * v + 0.0036)) * 0.5;
    const height = 1 - a * 0.25 - 1.55 * hinge(a - 0.65) + hinge(a - 0.95);
    const depth =
      ((a * 1.1 - 0.5 * hinge(a - 0.65) - 0.76 * hinge(a - 0.95)) * angle) /
      Math.sqrt(angle * angle + 0.0001);
    return new T.Vector3(
      x,
      centerY + (radius + z) * height + Number(p.innerLift ?? 0) * (1 - u) ** 3,
      (radius + z) * depth,
    );
  }
  const sweep =
    p.form === "limb" || p.form === "shin"
      ? Number(p.width) * (p.form === "shin" ? 0.22 : 0.14) * Math.sin(y / (Number(p.width) * 1.8))
      : 0;
  return new T.Vector3(x + sweep, y, z + shellHeight(p, x, y));
}
export function shellNormal(p: Record<string, unknown>, x: number, y: number): T.Vector3 {
  const e = Number(p.edge ?? 0.006) * 0.02;
  const dx = shellPoint(p, x + e, y).sub(shellPoint(p, x - e, y));
  const dy = shellPoint(p, x, y + e).sub(shellPoint(p, x, y - e));
  // 肩罩的参数 y 从后向前，外法线为参数切向的反向叉积。
  return dx
    .cross(dy)
    .normalize()
    .multiplyScalar(p.form === "shoulder" ? -1 : 1);
}
function roundedLoop(loop: number[][], radius: number, path: T.Path, clockwise = true): void {
  const points = loop.map(([x, y]) => new T.Vector2(x, y));
  if (T.ShapeUtils.isClockWise(points) !== clockwise) points.reverse();
  const corner = (i: number) => {
    const a = points[(i + points.length - 1) % points.length],
      b = points[i],
      c = points[(i + 1) % points.length];
    const d = Math.min(radius, a.distanceTo(b) * 0.24, b.distanceTo(c) * 0.24);
    return [
      b.clone().add(a.clone().sub(b).normalize().multiplyScalar(d)),
      b,
      b.clone().add(c.clone().sub(b).normalize().multiplyScalar(d)),
    ];
  };
  const first = corner(0);
  path.moveTo(first[0].x, first[0].y);
  for (let i = 0; i < points.length; i++) {
    const [a, b, c] = corner(i);
    path.lineTo(a.x, a.y);
    path.quadraticCurveTo(b.x, b.y, c.x, c.y);
  }
  path.closePath();
}

/** 共享边一起细分，保持闭合流形；逐三角形细分会在长短边交界留下 T 接缝。 */
function subdivideSurface(
  source: T.BufferGeometry,
  maxEdge: number,
  detail?: { holes: number[][][]; radius: number; edge: number },
): T.BufferGeometry {
  const positions = Array.from(source.getAttribute("position").array);
  const normals = Array.from(source.getAttribute("normal").array);
  const detailVertices: boolean[] = [];
  const nearWindow = (i: number): boolean => {
    if (!detail) return false;
    if (detailVertices[i] !== undefined) return detailVertices[i];
    const x = positions[i * 3],
      y = positions[i * 3 + 1];
    let distance2 = Infinity;
    for (const loop of detail.holes)
      for (let j = 0; j < loop.length; j++) {
        const a = loop[j],
          b = loop[(j + 1) % loop.length],
          dx = b[0] - a[0],
          dy = b[1] - a[1];
        const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy)));
        distance2 = Math.min(distance2, (x - a[0] - t * dx) ** 2 + (y - a[1] - t * dy) ** 2);
      }
    return (detailVertices[i] = distance2 < detail.radius ** 2);
  };
  let indices = Array.from(source.index!.array);
  for (let pass = 0; pass < 16; pass++) {
    const midpoints = new Map<string, number>();
    const midpoint = (a: number, b: number): number => {
      const dx = positions[a * 3] - positions[b * 3];
      const dy = positions[a * 3 + 1] - positions[b * 3 + 1];
      const dz = positions[a * 3 + 2] - positions[b * 3 + 2];
      // 铸造唇边的局部采样细于曲率半径；共享边一起细分，不用平滑法线掩盖欠采样。
      const edge = detail && (nearWindow(a) || nearWindow(b)) ? detail.edge : maxEdge;
      if (dx * dx + dy * dy + dz * dz <= edge * edge) return -1;
      const key = a < b ? a + ":" + b : b + ":" + a;
      const cached = midpoints.get(key);
      if (cached !== undefined) return cached;
      const next = positions.length / 3;
      for (let k = 0; k < 3; k++) {
        positions.push((positions[a * 3 + k] + positions[b * 3 + k]) * 0.5);
        normals.push((normals[a * 3 + k] + normals[b * 3 + k]) * 0.5);
      }
      midpoints.set(key, next);
      return next;
    };
    const out: number[] = [];
    for (let i = 0; i < indices.length; i += 3) {
      const [a, b, c] = indices.slice(i, i + 3);
      const ab = midpoint(a, b),
        bc = midpoint(b, c),
        ca = midpoint(c, a);
      switch ((ab >= 0 ? 1 : 0) | (bc >= 0 ? 2 : 0) | (ca >= 0 ? 4 : 0)) {
        case 0:
          out.push(a, b, c);
          break;
        case 1:
          out.push(a, ab, c, ab, b, c);
          break;
        case 2:
          out.push(a, b, bc, a, bc, c);
          break;
        case 4:
          out.push(a, b, ca, ca, b, c);
          break;
        case 3:
          out.push(b, bc, ab, a, ab, c, ab, bc, c);
          break;
        case 5:
          out.push(a, ab, ca, ab, b, c, ca, ab, c);
          break;
        case 6:
          out.push(c, ca, bc, a, b, ca, ca, b, bc);
          break;
        case 7:
          out.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
          break;
      }
    }
    indices = out;
    if (!midpoints.size) break;
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new T.Float32BufferAttribute(normals, 3));
  geometry.setIndex(indices);
  return geometry;
}
export const hmtBuilders: Record<string, GeometryBuilder> = {
  hmt_machined: machinedBuilder,
  hmt_turn: (spec) => {
    if (spec.type !== "kit") throw new Error("HMT 轴件需要 kit 参数");
    const p = spec.params!,
      r = Number(p.r),
      h = Number(p.h),
      b = Number(p.bevel ?? 0);
    const profile = [new T.Vector2(0, -h / 2), new T.Vector2(r - b, -h / 2)];
    for (let i = 1; i <= 8; i++) {
      const a = (i * Math.PI) / 16;
      profile.push(new T.Vector2(r - b + b * Math.sin(a), -h / 2 + b * (1 - Math.cos(a))));
    }
    for (let i = 0; i <= 8; i++) {
      const a = ((8 - i) * Math.PI) / 16;
      profile.push(new T.Vector2(r - b + b * Math.sin(a), h / 2 - b * (1 - Math.cos(a))));
    }
    profile.push(new T.Vector2(0, h / 2));
    return new T.LatheGeometry(profile, Number(p.segments ?? 96));
  },
  hmt_shell: (spec) => {
    if (spec.type !== "kit") throw new Error("HMT 壳体需要 kit 参数");
    const p = spec.params!,
      outline = p.outline as number[][];
    const shape = new T.Shape();
    roundedLoop(outline, Number(p.corner), shape);
    for (const loop of (p.holes ?? []) as number[][][]) {
      const hole = new T.Path();
      roundedLoop(loop, Number(p.corner) * 0.7, hole, false);
      shape.holes.push(hole);
    }
    const bevel = Number(p.bevel),
      thickness = Number(p.thickness);
    const raw = new T.ExtrudeGeometry(shape, {
      depth: thickness - 2 * bevel,
      bevelEnabled: true,
      bevelThickness: bevel,
      // 参考里的开窗是宽圆角直接过渡到孔壁；额外叠起伏会使金属反光出现鼓包。
      bevelSize: bevel + Number(p.rim ?? 0),
      bevelSegments: 8,
      curveSegments: 8,
      steps: 1,
    });
    raw.deleteAttribute("normal");
    raw.deleteAttribute("uv");
    const smooth = mergeVertices(raw, 1e-7);
    raw.dispose();
    smooth.computeVertexNormals();
    // 挤出大面被少量长三角形剖分，面积加权法线会把倒角倾斜传播到整片护甲。
    // 由圆角截面的高度恢复切线法线，曲面本身随后通过雅可比变换。
    const flatPositions = smooth.getAttribute("position");
    const flatNormals = smooth.getAttribute("normal");
    const depth = thickness - 2 * bevel;
    for (let i = 0; i < flatPositions.count; i++) {
      const z = flatPositions.getZ(i);
      let nz = z < 0 ? z / bevel : z > depth ? (z - depth) / bevel : 0;
      nz = Math.max(-1, Math.min(1, nz));
      if (Math.abs(nz) > 0.9999) nz = Math.sign(nz);
      const nx = flatNormals.getX(i),
        ny = flatNormals.getY(i);
      const tangent = Math.hypot(nx, ny);
      const radial = Math.sqrt(1 - nz * nz);
      flatNormals.setXYZ(i, tangent ? (nx / tangent) * radial : 0, tangent ? (ny / tangent) * radial : 0, nz);
    }
    // 密集采样用于胸翼、胫骨等复合曲率与毫米级倒角。
    const rim = Number(p.rim ?? 0);
    const dense = subdivideSurface(
      smooth,
      Number(p.edge),
      rim
        ? {
            holes: p.holes as number[][][],
            radius: rim * 4,
            edge: Math.min(Number(p.edge), rim * 0.65),
          }
        : undefined,
    );
    smooth.dispose();
    const pos = dense.getAttribute("position"),
      normals = dense.getAttribute("normal");
    const eps = Number(p.edge) * 0.05,
      normal = new T.Vector3(),
      uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i),
        y = pos.getY(i);
      const dx = (shellHeight(p, x + eps, y) - shellHeight(p, x - eps, y)) / (2 * eps);
      const dy = (shellHeight(p, x, y + eps) - shellHeight(p, x, y - eps)) / (2 * eps);
      if (p.form === "shoulder" || p.form === "limb" || p.form === "shin") {
        const z = pos.getZ(i) + bevel;
        const tx = shellPoint(p, x + eps, y, z)
          .sub(shellPoint(p, x - eps, y, z))
          .multiplyScalar(1 / (2 * eps));
        const ty = shellPoint(p, x, y + eps, z)
          .sub(shellPoint(p, x, y - eps, z))
          .multiplyScalar(1 / (2 * eps));
        const tz = shellPoint(p, x, y, z + eps)
          .sub(shellPoint(p, x, y, z - eps))
          .multiplyScalar(1 / (2 * eps));
        const jacobian = new T.Matrix3().set(tx.x, ty.x, tz.x, tx.y, ty.y, tz.y, tx.z, ty.z, tz.z);
        normal
          .set(normals.getX(i), normals.getY(i), normals.getZ(i))
          .applyMatrix3(jacobian.invert().transpose())
          .normalize();
      } else
        normal
          .set(
            normals.getX(i) - dx * normals.getZ(i),
            normals.getY(i) - dy * normals.getZ(i),
            normals.getZ(i),
          )
          .normalize();
      normals.setXYZ(i, normal.x, normal.y, normal.z);
      const point = shellPoint(p, x, y, pos.getZ(i) + bevel);
      pos.setXYZ(i, point.x, point.y, point.z);
      uv[i * 2] = x;
      uv[i * 2 + 1] = y;
    }
    dense.setAttribute("uv", new T.BufferAttribute(uv, 2));
    if (p.form === "shoulder") {
      // 参数映射改变手性，恢复朝外的三角形绕序。
      const index = dense.index!;
      for (let i = 0; i < index.count; i += 3) {
        const b = index.getX(i + 1);
        index.setX(i + 1, index.getX(i + 2));
        index.setX(i + 2, b);
      }
    }
    return dense;
  },
  hmt_link: (spec) => {
    if (spec.type !== "kit") throw new Error("HMT 连杆需要 kit 参数");
    const p = spec.params!,
      a = new T.Vector3(...(p.from as [number, number, number])),
      b = new T.Vector3(...(p.to as [number, number, number]));
    const g = p.innerRadius
      ? tubeGeometry(Number(p.radius), Number(p.innerRadius), a.distanceTo(b), 96)
      : new T.CylinderGeometry(Number(p.radius), Number(p.radius), a.distanceTo(b), 64, 8);
    g.applyQuaternion(
      new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), b.clone().sub(a).normalize()),
    );
    return g.translate(...a.add(b).multiplyScalar(0.5).toArray());
  },
  hmt_cable: (spec) => {
    if (spec.type !== "kit") throw new Error("HMT 线束需要 kit 参数");
    const p = spec.params!,
      pts = (p.points as number[][]).map((v) => new T.Vector3(...(v as [number, number, number])));
    const curve = new T.CatmullRomCurve3(pts);
    const tube = new T.TubeGeometry(curve, 128, Number(p.radius), 16, false);
    const frames = curve.computeFrenetFrames(128, false);
    const caps = [0, 128].map((end) => {
      const vertices = [...pts[end === 0 ? 0 : pts.length - 1].toArray()];
      const indices: number[] = [];
      for (let j = 0; j < 16; j++) {
        const i = end * 17 + j;
        const position = tube.getAttribute("position");
        vertices.push(position.getX(i), position.getY(i), position.getZ(i));
        indices.push(...(end === 0 ? [0, j + 1, ((j + 1) % 16) + 1] : [0, ((j + 1) % 16) + 1, j + 1]));
      }
      const g = new T.BufferGeometry();
      g.setAttribute("position", new T.Float32BufferAttribute(vertices, 3));
      const normal = frames.tangents[end].clone().multiplyScalar(end === 0 ? -1 : 1);
      g.setAttribute(
        "normal",
        new T.Float32BufferAttribute(Array.from({ length: 17 }, () => normal.toArray()).flat(), 3),
      );
      g.setAttribute("uv", new T.Float32BufferAttribute(new Float32Array(34), 2));
      g.setIndex(indices);
      return g;
    });
    const closed = mergeGeometries([tube, ...caps]);
    [tube, ...caps].forEach((g) => g.dispose());
    return closed;
  },
  hmt_spring: (spec) => {
    if (spec.type !== "kit") throw new Error("HMT 弹簧需要 kit 参数");
    const p = spec.params!,
      turns = Number(p.turns),
      steps = turns * 96;
    const pts = Array.from(
      { length: steps + 1 },
      (_, i) =>
        new T.Vector3(
          Math.cos((i / steps) * turns * Math.PI * 2) * Number(p.radius),
          (i / steps - 0.5) * Number(p.height),
          Math.sin((i / steps) * turns * Math.PI * 2) * Number(p.radius),
        ),
    );
    const curve = new T.CatmullRomCurve3(pts),
      tube = new T.TubeGeometry(curve, steps, Number(p.wire), 24, false);
    const caps = [0, steps].map((end) => {
      const v = curve.getPointAt(end / steps).toArray(),
        indices: number[] = [];
      const position = tube.getAttribute("position");
      for (let j = 0; j < 24; j++) {
        const k = end * 25 + j;
        v.push(position.getX(k), position.getY(k), position.getZ(k));
        indices.push(...(end === 0 ? [0, j + 1, ((j + 1) % 24) + 1] : [0, ((j + 1) % 24) + 1, j + 1]));
      }
      const g = new T.BufferGeometry();
      g.setAttribute("position", new T.Float32BufferAttribute(v, 3));
      g.setIndex(indices);
      g.computeVertexNormals();
      g.setAttribute("uv", new T.Float32BufferAttribute(new Float32Array(50), 2));
      return g;
    });
    const result = mergeGeometries([tube, ...caps]);
    [tube, ...caps].forEach((g) => g.dispose());
    return result;
  },
  // 腕甲是带内壁的弧面扇片；相邻片只留窄缝，不能用四块平板代替环绕包覆。
  hmt_cuff: (spec) => {
    if (spec.type !== "kit") throw new Error("腕甲需要扇片参数");
    const p = spec.params!,
      start = Number(p.start_turns) * Math.PI * 2,
      span = Number(p.span_turns) * Math.PI * 2,
      rx = Number(p.rx),
      rz = Number(p.rz),
      height = Number(p.height),
      wall = Number(p.wall),
      steps = 64;
    // 截面从内壁上缘绕外侧折脊回到内壁下缘，端口有真实斜面倒角。
    const section = [
      [0, 0.94],
      [0.18, 1],
      [0.78, 1],
      [1, 0.93],
      [1.08, 0.75],
      [1.5, 0.4],
      [1.35, 0.15],
      [0.9, 0.025],
      [0.22, 0],
      [0, 0.065],
    ];
    const positions: number[] = [],
      uv: number[] = [],
      indices: number[] = [];
    for (let i = 0; i <= steps; i++) {
      const a = start + (span * i) / steps;
      // 上口的双凹曲线对接前臂，下口错层包住掌根，完整环绕腕轴。
      const saddle =
        Number(p.saddle ?? 0) * (Math.sin(a) ** 2 - 0.5) +
        Number(p.backRise ?? 0) * Math.max(0, -Math.cos(a));
      const top =
          saddle +
          height * 0.5 +
          Number(p.hem) * Math.cos(2 * a) +
          Number(p.backLift ?? 0) * Math.max(0, -Math.cos(a)) * (0.2 + 0.8 * Math.sin(a) ** 2),
        bottom = saddle - height * 0.5 + Number(p.hem) * 0.3 * Math.cos(2 * a);
      for (const [r, y] of section) {
        positions.push(
          (rx + wall * r) * Math.sin(a),
          bottom + (top - bottom) * y,
          (rz + wall * r) * Math.cos(a),
        );
        uv.push(i / steps, y);
      }
    }
    const n = section.length;
    for (let i = 0; i < steps; i++)
      for (let j = 0; j < n; j++) {
        const a = i * n + j,
          b = i * n + ((j + 1) % n),
          c = a + n,
          d = b + n;
        indices.push(a, c, b, b, c, d);
      }
    const caps = T.ShapeUtils.triangulateShape(
      section.map(([r, y]) => new T.Vector2(r, y)),
      [],
    );
    for (const [a, b, c] of caps) indices.push(c, b, a, steps * n + a, steps * n + b, steps * n + c);
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
    g.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
    for (let i = 0; i < indices.length; i += 3)
      [indices[i + 1], indices[i + 2]] = [indices[i + 2], indices[i + 1]];
    g.setIndex(indices);
    g.computeVertexNormals();
    return g;
  },
  hmt_loft: (spec) => {
    if (spec.type !== "kit") throw new Error("HMT 放样需要 kit 参数");
    const rows = spec.params!.sections as number[][],
      segments = 128,
      rings = (rows.length - 1) * 20;
    const curve = new T.CatmullRomCurve3(rows.map((r) => new T.Vector3(r[1], r[2], r[3])));
    const v: number[] = [],
      idx: number[] = [];
    for (let i = 0; i <= rings; i++) {
      const t = i / rings,
        section = t * (rows.length - 1),
        k = Math.min(rows.length - 2, Math.floor(section)),
        f = section - k;
      const y = T.MathUtils.lerp(rows[k][0], rows[k + 1][0], f),
        r = curve.getPoint(t);
      for (let j = 0; j < segments; j++) {
        const a = (j / segments) * Math.PI * 2;
        v.push(r.x * Math.sin(a), y, r.z + r.y * Math.cos(a));
      }
    }
    for (let i = 0; i < rings; i++)
      for (let j = 0; j < segments; j++) {
        const a = i * segments + j,
          b = i * segments + ((j + 1) % segments);
        idx.push(a, b, a + segments, b, b + segments, a + segments);
      }
    for (const end of [0, rings]) {
      const c = v.length / 3;
      v.push(0, rows[end === 0 ? 0 : rows.length - 1][0], rows[end === 0 ? 0 : rows.length - 1][3]);
      for (let j = 0; j < segments; j++) {
        const a = end * segments + j,
          b = end * segments + ((j + 1) % segments);
        idx.push(...(end === 0 ? [c, b, a] : [c, a, b]));
      }
    }
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.Float32BufferAttribute(v, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const uv: number[] = [];
    for (let i = 0; i <= rings; i++) for (let j = 0; j < segments; j++) uv.push(j / segments, i / rings);
    uv.push(0.5, 0, 0.5, 1);
    g.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
    return g;
  },
  hmt_bolt: (spec) => {
    if (spec.type !== "kit") throw new Error("HMT 螺钉需要 kit 参数");
    const r = Number(spec.params!.radius);
    const shape = new T.Shape();
    shape.absarc(0, 0, r, 0, Math.PI * 2, false);
    const socket = new T.Path();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const x = Math.cos(a) * r * 0.43,
        y = Math.sin(a) * r * 0.43;
      if (i === 0) socket.moveTo(x, y);
      else socket.lineTo(x, y);
    }
    socket.closePath();
    shape.holes.push(socket);
    const g = new T.ExtrudeGeometry(shape, {
      depth: r * 0.34,
      bevelEnabled: true,
      bevelSize: r * 0.09,
      bevelThickness: r * 0.09,
      bevelSegments: 4,
      curveSegments: 32,
    });
    g.deleteAttribute("normal");
    const sm = mergeVertices(g, 1e-7);
    g.dispose();
    sm.computeVertexNormals();
    return sm;
  },
};
