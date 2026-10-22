import * as THREE from "three";
import type { GeometryBuilder } from "../../assembler/geometry";
import {
  bevelBoxGeometry,
  cylinderGeometry,
  latheGeometry,
  loftGeometry,
  mergeGeometries,
  plateGeometry,
  sphereGeometry,
  tubeGeometry,
} from "../../kernel/geometry";
import { gunKitBuilders } from "../guns/kits";
import { gunHardwareBuilders } from "../guns/hardware";

// ============================================================================
// models/guns7/kits —— 重做版共享几何
//
// 与旧版最关键的差别：**枪管是真剖视**。外壁在正上方开一条纵向观察窗，
// 内壁/弹膛/4 条右旋膛线在窗外直接可见；不是「实心管 + 假装有膛线」。
// 其余 kit：侧轮廓挤出（枪托/机匣侧板/扳机/击锤）、齿轮、弹链节、
// 螺旋导轨、弹筒剖壳、桥夹、弹匣侧板。
//
// 轴向约定：+Z = 枪口，+Y = 上，+X = 右；原点由每个 kit 注释写清。
// ============================================================================

type Params = Record<string, unknown>;

function num(params: Params | undefined, key: string, fallback?: number): number {
  const value = params?.[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (fallback !== undefined) return fallback;
  throw new Error(`guns7 kit：参数 "${key}" 必须是数值（收到 ${String(value)}）`);
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  return merged;
}

function toZAxis(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  geometry.rotateX(Math.PI / 2);
  return geometry;
}

/** 从 [半径, z] 剖面线性插值外径。 */
function radiusAt(profile: [number, number][], z: number): number {
  if (z <= profile[0][1]) return profile[0][0];
  for (let i = 1; i < profile.length; i++) {
    const [r1, z1] = profile[i];
    const [r0, z0] = profile[i - 1];
    if (z <= z1) {
      const u = (z - z0) / Math.max(z1 - z0, 1e-9);
      return r0 + (r1 - r0) * u;
    }
  }
  return profile[profile.length - 1][0];
}

// ---------------------------------------------------------------------------
// sideProfile —— 侧轮廓挤出（剪影在 ZY 平面，厚度沿 X）
//
// points: [z, y]；holes: 可选的内孔轮廓（同坐标系）。用于枪托、机匣侧板、
// 扳机/击锤/阻铁、表尺、脚架连接件。原点 = 侧轮廓坐标原点。
// ---------------------------------------------------------------------------

const sideProfile: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const points = (p?.points as Array<[number, number]> | undefined) ?? [];
  if (points.length < 3) throw new Error("guns7 kit：sideProfile 至少 3 个点");
  const width = num(p, "width", 0.02);
  const bevel = num(p, "bevel", Math.min(0.0015, width * 0.18));
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) shape.lineTo(points[i][0], points[i][1]);
  shape.closePath();
  const holes = (p?.holes as Array<Array<[number, number]>> | undefined) ?? [];
  for (const hole of holes) {
    if (hole.length < 3) continue;
    const path = new THREE.Path();
    path.moveTo(hole[0][0], hole[0][1]);
    for (let i = 1; i < hole.length; i++) path.lineTo(hole[i][0], hole[i][1]);
    path.closePath();
    shape.holes.push(path);
  }
  const depth = Math.max(width - 2 * bevel, 0.001);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0.0002,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 1,
    curveSegments: 6,
    steps: 1,
  });
  geometry.translate(0, 0, -depth / 2);
  // Extrude 的 +Z 厚度 → +X；再让剪影的 x 回到 +Z（rotateY(-90°)）。
  geometry.rotateY(-Math.PI / 2);
  geometry.computeVertexNormals();
  return geometry;
};

// ---------------------------------------------------------------------------
// 剖视枪管
//
// profile: [外径, z]（从膛底 z=0 到枪口）；boreR/landR：阴/阳线半径；
// chamberR/chamberLen：弹膛；cutStart/cutLen/cutAngleDeg：上方观察窗。
// 结构 = 后段整圆 + 中段开窗 + 前段整圆，内壁/弹膛/坡膛同期生成；
// 膛线另外作为实例件（4 条螺旋管）注册，剖面里看得到。
// ---------------------------------------------------------------------------

interface RingSegmentOptions {
  z0: number;
  z1: number;
  profile: [number, number][];
  innerAt: (z: number) => number;
  angleStart: number;
  angleLength: number;
  axialSegments: number;
  radialSegments: number;
  capEnds: boolean;
  cutFaces: boolean;
}

function tubeSegment(options: RingSegmentOptions): THREE.BufferGeometry {
  const {
    z0,
    z1,
    profile,
    innerAt,
    angleStart,
    angleLength,
    axialSegments,
    radialSegments,
    capEnds,
    cutFaces,
  } = options;
  const rows = Math.max(2, axialSegments + 1);
  const cols = Math.max(2, radialSegments + 1);
  const positions: number[] = [];
  const indices: number[] = [];
  for (let j = 0; j < rows; j++) {
    const z = z0 + ((z1 - z0) * j) / (rows - 1);
    const ro = radiusAt(profile, z);
    const ri = Math.min(innerAt(z), ro - 0.0004);
    for (let i = 0; i < cols; i++) {
      const a = angleStart + (angleLength * i) / (cols - 1);
      const c = Math.cos(a);
      const s = Math.sin(a);
      // 外表面
      positions.push(c * ro, s * ro, z);
      // 内表面（紧跟在后面：索引 +1）
      positions.push(c * ri, s * ri, z);
    }
  }
  const stride = cols * 2;
  const outer = (j: number, i: number) => j * stride + i * 2;
  const inner = (j: number, i: number) => j * stride + i * 2 + 1;
  for (let j = 0; j < rows - 1; j++) {
    for (let i = 0; i < cols - 1; i++) {
      // 外壁：外法线
      indices.push(outer(j, i), outer(j, i + 1), outer(j + 1, i + 1));
      indices.push(outer(j, i), outer(j + 1, i + 1), outer(j + 1, i));
      // 内壁：反绕序
      indices.push(inner(j, i), inner(j + 1, i + 1), inner(j, i + 1));
      indices.push(inner(j, i), inner(j + 1, i), inner(j + 1, i + 1));
    }
  }
  if (capEnds) {
    for (const j of [0, rows - 1]) {
      const dir = j === 0 ? -1 : 1;
      for (let i = 0; i < cols - 1; i++) {
        const a = outer(j, i);
        const b = outer(j, i + 1);
        const c = inner(j, i);
        const d = inner(j, i + 1);
        if (dir < 0) {
          indices.push(a, c, b, b, c, d);
        } else {
          indices.push(a, b, c, b, d, c);
        }
      }
    }
  }
  if (cutFaces) {
    for (const i of [0, cols - 1]) {
      for (let j = 0; j < rows - 1; j++) {
        const a = outer(j, i);
        const b = outer(j + 1, i);
        const c = inner(j, i);
        const d = inner(j + 1, i);
        if (i === 0) indices.push(a, b, c, b, d, c);
        else indices.push(a, c, b, b, c, d);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

const sectionedBarrel: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const profile = (p?.profile as Array<[number, number]> | undefined) ?? [];
  if (profile.length < 2) throw new Error("guns7 kit：sectionedBarrel 需要外径剖面");
  const boreR = num(p, "boreR", 0.004);
  const chamberR = num(p, "chamberR", boreR + 0.0018);
  const chamberLen = num(p, "chamberLen", 0.06);
  const cutStart = num(p, "cutStart", chamberLen + 0.02);
  const cutLen = num(p, "cutLen", Math.max(0.12, profile[profile.length - 1][1] - cutStart - 0.04));
  const cutAngleDeg = num(p, "cutAngleDeg", 74);
  const radialSegments = Math.round(num(p, "radialSegments", 32));
  const axialSegments = Math.round(num(p, "axialSegments", 8));
  const barrelEnd = profile[profile.length - 1][1];
  const z1 = Math.min(cutStart + cutLen, barrelEnd - 0.004);
  const innerAt = (z: number) => {
    if (z <= chamberLen) return chamberR;
    if (z <= chamberLen + 0.012) {
      const u = (z - chamberLen) / 0.012;
      return chamberR + (boreR - chamberR) * u;
    }
    return boreR;
  };
  const cutHalf = (cutAngleDeg * Math.PI) / 360;
  const top = Math.PI / 2;
  const fullStart = 0;
  const fullLength = Math.PI * 2;
  const parts: THREE.BufferGeometry[] = [];
  if (cutStart > 0.002) {
    parts.push(
      tubeSegment({
        z0: 0,
        z1: cutStart,
        profile,
        innerAt,
        angleStart: fullStart,
        angleLength: fullLength,
        axialSegments: Math.max(2, Math.round((axialSegments * cutStart) / barrelEnd)),
        radialSegments,
        capEnds: true,
        cutFaces: false,
      }),
    );
  }
  parts.push(
    tubeSegment({
      z0: cutStart,
      z1,
      profile,
      innerAt,
      angleStart: top + cutHalf,
      angleLength: fullLength - cutHalf * 2,
      axialSegments,
      radialSegments,
      capEnds: false,
      cutFaces: true,
    }),
  );
  if (barrelEnd - z1 > 0.003) {
    parts.push(
      tubeSegment({
        z0: z1,
        z1: barrelEnd,
        profile,
        innerAt,
        angleStart: fullStart,
        angleLength: fullLength,
        axialSegments: 3,
        radialSegments,
        capEnds: true,
        cutFaces: false,
      }),
    );
  }
  const geometry = merge(parts);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
};

// ---------------------------------------------------------------------------
// riflingLand —— 单条右旋膛线（螺旋管）。4 条实例件绕 Z 轴 90° 分布。
// 原点 = 膛底；螺旋从 riflingStart 到枪口。
// ---------------------------------------------------------------------------

const riflingLand: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const boreR = num(p, "boreR", 0.004);
  const landR = num(p, "landR", boreR + 0.00018);
  const start = num(p, "start", 0.08);
  const end = num(p, "end", 0.7);
  const turns = num(p, "turns", 3);
  const steps = Math.round(num(p, "steps", 90));
  if (landR <= boreR) throw new Error("guns7 kit：riflingLand 的 landR 必须大于 boreR");
  const ridgeR = (landR - boreR) / 2;
  const centerR = (landR + boreR) / 2;
  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    const a = u * turns * Math.PI * 2;
    points.push(new THREE.Vector3(Math.cos(a) * centerR, Math.sin(a) * centerR, start + (end - start) * u));
  }
  const curve = new THREE.CatmullRomCurve3(points);
  return new THREE.TubeGeometry(curve, steps, ridgeR, 5, false);
};

// ---------------------------------------------------------------------------
// gear —— 直齿圆柱齿轮，轴沿 Z；原点在齿宽中心。
// ---------------------------------------------------------------------------

const gear: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const teeth = Math.max(6, Math.round(num(p, "teeth", 18)));
  const radius = num(p, "radius", 0.04);
  const thickness = num(p, "thickness", 0.008);
  const toothH = num(p, "toothH", radius * 0.12);
  const boreR = num(p, "boreR", radius * 0.22);
  const pitchR = radius - toothH * 0.5;
  const step = (Math.PI * 2) / teeth;
  const shape = new THREE.Shape();
  for (let i = 0; i < teeth; i++) {
    const a0 = i * step;
    const pts: Array<[number, number]> = [
      [pitchR * Math.cos(a0), pitchR * Math.sin(a0)],
      [(pitchR + toothH) * Math.cos(a0 + step * 0.18), (pitchR + toothH) * Math.sin(a0 + step * 0.18)],
      [(pitchR + toothH) * Math.cos(a0 + step * 0.34), (pitchR + toothH) * Math.sin(a0 + step * 0.34)],
      [pitchR * Math.cos(a0 + step * 0.52), pitchR * Math.sin(a0 + step * 0.52)],
    ];
    for (const [x, y] of pts) {
      if (i === 0 && x === pts[0][0] && y === pts[0][1]) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    }
  }
  shape.closePath();
  if (boreR > 0.0005) {
    const hole = new THREE.Path();
    hole.absarc(0, 0, boreR, 0, Math.PI * 2, true);
    shape.holes.push(hole);
  }
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: true,
    bevelThickness: Math.min(0.0008, thickness * 0.2),
    bevelSize: Math.min(0.0008, thickness * 0.2),
    bevelSegments: 1,
    curveSegments: 8,
    steps: 1,
  });
  geometry.translate(0, 0, -thickness / 2);
  return geometry;
};

// ---------------------------------------------------------------------------
// beltLink —— 可散弹链节（M9/M13 风格）：抱弹环 + 下挂舌片 + 连接钩。
// 原点 = 抱住的弹壳中心；环平面 XY，弹轴 +Z。
// ---------------------------------------------------------------------------

const beltLink: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const roundR = num(p, "roundR", 0.0058);
  const thickness = num(p, "thickness", 0.0008);
  const width = num(p, "width", 0.0055);
  const pitch = num(p, "pitch", 0.014);
  const arc = num(p, "arc", Math.PI * 1.55);
  const parts: THREE.BufferGeometry[] = [];
  const ring = new THREE.TorusGeometry(roundR + width * 0.55, width, 6, 18, arc);
  ring.rotateZ(Math.PI * (1 - (arc / (Math.PI * 2))) * 0.5 + Math.PI * 0.22);
  parts.push(ring);
  const tab = bevelBoxGeometry(pitch * 0.72, width * 1.8, thickness, 0.0004, 1);
  tab.translate(0, -roundR - width * 0.55 - width * 0.8, 0);
  parts.push(tab);
  const hook = new THREE.TorusGeometry(roundR * 0.28, thickness * 1.3, 5, 10, Math.PI * 1.4);
  hook.translate(-pitch * 0.28, -roundR - width * 1.35, 0);
  parts.push(hook);
  return merge(parts);
};

// ---------------------------------------------------------------------------
// spiralGuide —— 螺旋导轨（Bizon/RPK 弹鼓/转管凸轮）：绕 Z 轴的螺旋管。
// ---------------------------------------------------------------------------

const spiralGuide: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const radius = num(p, "radius", 0.03);
  const length = num(p, "length", 0.2);
  const turns = num(p, "turns", 3);
  const tubeR = num(p, "tubeR", 0.0018);
  const phase = num(p, "phase", 0);
  const steps = Math.round(num(p, "steps", Math.max(24, turns * 32)));
  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    const a = phase + u * turns * Math.PI * 2;
    points.push(new THREE.Vector3(Math.cos(a) * radius, Math.sin(a) * radius, -length / 2 + u * length));
  }
  const curve = new THREE.CatmullRomCurve3(points);
  return new THREE.TubeGeometry(curve, steps, tubeR, 5, false);
};

// ---------------------------------------------------------------------------
// drumShell —— 剖视圆筒壳（Bizon 弹筒/RPK 弹鼓外壁）：绕 Z 轴，顶部开口。
// ---------------------------------------------------------------------------

const drumShell: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const r = num(p, "r", 0.05);
  const len = num(p, "len", 0.2);
  const openingDeg = num(p, "openingDeg", 100);
  const segments = Math.round(num(p, "segments", 40));
  const opening = (openingDeg * Math.PI) / 180;
  const start = Math.PI / 2 + opening / 2;
  const geometry = new THREE.CylinderGeometry(r, r, len, segments, 1, true, start, Math.PI * 2 - opening);
  geometry.rotateX(Math.PI / 2);
  return geometry;
};

// ---------------------------------------------------------------------------
// ringPlate —— 环形端板（弹筒前盖/后盖/鼓盖），带中心孔。
// ---------------------------------------------------------------------------
const ringPlate: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const rOuter = num(p, "rOuter", 0.05);
  const rInner = num(p, "rInner", 0.02);
  const t = num(p, "t", 0.003);
  const segments = Math.round(num(p, "segments", 40));
  return toZAxis(tubeGeometry(rOuter, rInner, t, segments));
};

// ---------------------------------------------------------------------------
// stripperClip —— 桥夹（三八大盖 5 发桥夹）：两条抱弹臂 + 底板 + 提舌。
// 局部系：弹轴 +Z，原点 = 夹口中心（5 发弹的弹底位置）。
// ---------------------------------------------------------------------------
const stripperClip: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const rounds = Math.max(1, Math.round(num(p, "rounds", 5)));
  const pitch = num(p, "pitch", 0.013);
  const caseR = num(p, "caseR", 0.0058);
  const width = pitch * rounds;
  const parts: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    const rail = bevelBoxGeometry(0.0035, 0.012, width + 0.006, 0.0004, 1);
    rail.translate(side * (caseR + 0.0035), 0.002, 0);
    parts.push(rail);
  }
  const base = bevelBoxGeometry(caseR * 2 + 0.009, 0.004, width + 0.006, 0.0005, 1);
  base.translate(0, -0.005, 0);
  parts.push(base);
  const handle = bevelBoxGeometry(0.012, 0.0025, 0.02, 0.0004, 1);
  handle.translate(0, 0.011, -width * 0.34);
  parts.push(handle);
  return merge(parts);
};

// ---------------------------------------------------------------------------
// railFrame —— 开口机匣框：左/右/上/下四条梁，内部机构可见。
// 局部系：长度沿 Z，中心在原点。
// ---------------------------------------------------------------------------
const railFrame: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const w = num(p, "w", 0.04);
  const h = num(p, "h", 0.05);
  const len = num(p, "len", 0.2);
  const t = num(p, "t", 0.002);
  const parts: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    const panel = bevelBoxGeometry(t, h, len, 0.0005, 1);
    panel.translate(side * (w / 2 - t / 2), 0, 0);
    parts.push(panel);
  }
  for (const side of [-1, 1]) {
    const rail = bevelBoxGeometry(w, t, len, 0.0005, 1);
    rail.translate(0, side * (h / 2 - t / 2), 0);
    parts.push(rail);
  }
  return merge(parts);
};

// ---------------------------------------------------------------------------
// sightLeaf —— 立框式表尺：底座 + 可竖起的框 + 游标。
// 局部系：原点 = 铰点；框在竖立时沿 +Y。
// ---------------------------------------------------------------------------
const sightLeaf: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const w = num(p, "w", 0.018);
  const h = num(p, "h", 0.06);
  const t = num(p, "t", 0.0016);
  const parts: THREE.BufferGeometry[] = [];
  const left = bevelBoxGeometry(t, h, 0.0025, 0.0004, 1);
  left.translate(-w / 2, h / 2, 0);
  parts.push(left);
  const right = bevelBoxGeometry(t, h, 0.0025, 0.0004, 1);
  right.translate(w / 2, h / 2, 0);
  parts.push(right);
  const top = bevelBoxGeometry(w + t, t, 0.0025, 0.0004, 1);
  top.translate(0, h, 0);
  parts.push(top);
  const cursor = bevelBoxGeometry(w * 0.8, 0.006, 0.004, 0.0004, 1);
  cursor.translate(0, h * 0.58, 0);
  parts.push(cursor);
  return merge(parts);
};

// ---------------------------------------------------------------------------
// triggerGuard —— 扳机护圈（U 形）。
// 局部系：原点 = 前铰点，护圈沿 -Z 向后、-Y 向下。
// ---------------------------------------------------------------------------
const triggerGuard: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const len = num(p, "len", 0.09);
  const drop = num(p, "drop", 0.03);
  const t = num(p, "t", 0.003);
  const w = num(p, "w", 0.026);
  const parts: THREE.BufferGeometry[] = [];
  const front = bevelBoxGeometry(w, t, t, 0.0004, 1);
  front.translate(0, -drop, 0);
  parts.push(front);
  const bottom = bevelBoxGeometry(w, t, len, 0.0004, 1);
  bottom.translate(0, -drop, -len / 2);
  parts.push(bottom);
  const rear = bevelBoxGeometry(w, drop, t, 0.0004, 1);
  rear.translate(0, -drop / 2, -len);
  parts.push(rear);
  return merge(parts);
};

// ---------------------------------------------------------------------------
// boxMagShell —— 直弹匣剖壳：两侧板 + 后壁 + 底板，前面/右侧开窗看弹药。
// 局部系：原点 = 抱弹口中心（弹底位置），弹轴 +Z，匣体向下。
// ---------------------------------------------------------------------------
const boxMagShell: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const w = num(p, "w", 0.03);
  const d = num(p, "d", 0.014);
  const h = num(p, "h", 0.14);
  const t = num(p, "t", 0.0016);
  const parts: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    const panel = bevelBoxGeometry(t, h, d, 0.0005, 1);
    panel.translate(side * (w / 2 - t / 2), -h / 2, 0);
    parts.push(panel);
  }
  const back = bevelBoxGeometry(w, h, t, 0.0005, 1);
  back.translate(0, -h / 2, -d / 2 + t / 2);
  parts.push(back);
  const floor = bevelBoxGeometry(w + 0.002, t * 1.6, d + 0.002, 0.0005, 1);
  floor.translate(0, -h, 0);
  parts.push(floor);
  return merge(parts);
};

// ---------------------------------------------------------------------------
// ammoStackLayout —— 不给实例布局用，仅作为几何零件的占位符说明。
// （弹药的实例布局由各枪 registry 里的 layout 函数负责。）
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// stampedShell —— 冲压/机加工机匣外壳（AK/Bison/M60/M2HB/M134 共用）。
//
// 旧版这些机匣都是「一个方块 + 两片平板」，侧看就是积木。这里做真正的
// 冲压件：截面是**圆角矩形**（squareness 决定方/圆程度），沿枪身方向挤出，
// 壁上带纵向加强筋、铆钉列，前端可收窄；顶部开口型（gap）就是 AK 的
// 弧形顶盖——外壳有真实的圆角与筋条，不再是直角盒子。
//
// 局部系：origin = 截面中心（X/Y 原点），+Z 枪口方向；z0..z1 为壳体范围。
// ---------------------------------------------------------------------------
const stampedShell: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const w = num(p, "w", 0.046);
  const top = num(p, "top", 0.03);
  const bottom = num(p, "bottom", -0.03);
  const z0 = num(p, "z0", -0.2);
  const z1 = num(p, "z1", 0.05);
  const wall = num(p, "wall", 0.0024);
  const squareness = num(p, "squareness", 0.72);
  const gapStart = typeof p?.gapStart === "number" ? (p.gapStart as number) : null;
  const gapEnd = typeof p?.gapEnd === "number" ? (p.gapEnd as number) : null;
  const ribCount = num(p, "ribCount", 0);
  const ribDepth = num(p, "ribDepth", 0.0016);
  const ribWidth = num(p, "ribWidth", 0.005);
  const ribTop = num(p, "ribTop", 0.012);
  const ribBottom = num(p, "ribBottom", -0.012);
  const ribZ0 = num(p, "ribZ0", z0 + 0.01);
  const ribZ1 = num(p, "ribZ1", z1 - 0.01);
  const rivetCount = num(p, "rivetCount", 0);
  const rivetY = num(p, "rivetY", 0.014);
  const rivetZ0 = num(p, "rivetZ0", z0 + 0.012);
  const rivetZ1 = num(p, "rivetZ1", z1 - 0.012);
  const frontTaper = num(p, "frontTaper", 0);
  const frontDrop = num(p, "frontDrop", 0);

  const len = z1 - z0;
  const halfW = w / 2;
  const cy = (top + bottom) / 2;
  const halfTop = top - cy;
  const halfBottom = cy - bottom;
  const exponent = 2 / Math.max(0.08, 1 - squareness * 0.78);

  const pointAt = (theta: number, inset: number): [number, number] => {
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    const hw = Math.max(halfW - inset, 0.003);
    const ht = Math.max(halfTop - inset, 0.003);
    const hb = Math.max(halfBottom - inset, 0.003);
    const x = Math.sign(c) * Math.pow(Math.abs(c), exponent) * hw;
    const y = cy + Math.sign(s) * Math.pow(Math.abs(s), exponent) * (s >= 0 ? ht : hb);
    return [x, y];
  };

  const parts: THREE.BufferGeometry[] = [];
  const segments = 72;
  const hasGap = gapStart !== null && gapEnd !== null;
  const outer: Array<[number, number]> = [];
  const inner: Array<[number, number]> = [];
  if (hasGap) {
    // 开口型：只保留 gapEnd → gapStart+2π 的弧，形成 C/U 形壳
    for (let i = 0; i <= segments; i++) {
      const a = (gapEnd as number) + ((Math.PI * 2 - ((gapEnd as number) - (gapStart as number))) * i) / segments;
      outer.push(pointAt(a, 0));
      inner.push(pointAt(a, wall));
    }
  } else {
    for (let i = 0; i <= segments; i++) {
      const a = (Math.PI * 2 * i) / segments;
      outer.push(pointAt(a, 0));
      inner.push(pointAt(a, wall));
    }
  }

  const shape = new THREE.Shape();
  shape.moveTo(outer[0][0], outer[0][1]);
  for (let i = 1; i < outer.length; i++) shape.lineTo(outer[i][0], outer[i][1]);
  for (let i = inner.length - 1; i >= 0; i--) shape.lineTo(inner[i][0], inner[i][1]);
  shape.closePath();
  const shell = new THREE.ExtrudeGeometry(shape, {
    depth: len,
    bevelEnabled: true,
    bevelThickness: 0.0006,
    bevelSize: 0.0006,
    bevelSegments: 1,
    curveSegments: 64,
    steps: 1,
  });
  shell.translate(0, 0, z0);
  parts.push(shell);

  // 纵向加强筋：沿两侧的浅凸台（冲压件上的压筋），不是贴图。
  if (ribCount > 0) {
    const ribH = ribTop - ribBottom;
    for (const side of [-1, 1]) {
      for (let i = 0; i < ribCount; i++) {
        const y = ribCount === 1 ? (ribTop + ribBottom) / 2 : ribBottom + (ribH * i) / (ribCount - 1);
        const rib = bevelBoxGeometry(ribDepth, ribWidth, ribZ1 - ribZ0, 0.0004, 1);
        rib.translate(side * (halfW + ribDepth / 2 - 0.0004), y, (ribZ0 + ribZ1) / 2);
        parts.push(rib);
      }
    }
  }

  // 铆钉/螺钉列：机匣壳体上的紧固件。
  if (rivetCount > 0) {
    for (const side of [-1, 1]) {
      for (let i = 0; i < rivetCount; i++) {
        const z = rivetCount === 1 ? (rivetZ0 + rivetZ1) / 2 : rivetZ0 + ((rivetZ1 - rivetZ0) * i) / (rivetCount - 1);
        const rivet = cylinderGeometry(0.0018, 0.0016, 0.0018, 12);
        rivet.rotateZ(Math.PI / 2);
        rivet.translate(side * (halfW + 0.0004), rivetY, z);
        parts.push(rivet);
      }
    }
  }

  // 前端收口：真实机匣前端会向枪管收窄，做成斜切端面。
  if (frontTaper > 0) {
    const nose = new THREE.Shape();
    const half = halfW * (1 - frontTaper);
    nose.moveTo(-half, bottom + frontDrop);
    nose.lineTo(half, bottom + frontDrop);
    nose.lineTo(halfW * 0.99, top);
    nose.lineTo(-halfW * 0.99, top);
    nose.closePath();
    const cap = new THREE.ExtrudeGeometry(nose, {
      depth: 0.004,
      bevelEnabled: true,
      bevelThickness: 0.0005,
      bevelSize: 0.0005,
      bevelSegments: 1,
      steps: 1,
    });
    cap.translate(0, 0, z1 - 0.004);
    parts.push(cap);
  }

  return merge(parts);
};

// ---------------------------------------------------------------------------
// woodHandguard —— 木护木（AK / RPK / M60 共用）。
//
// 旧版是「一段没有厚度的圆筒壳」，看上去就是一根塑料管。这里用超椭圆
// 放样出**实木护木**：截面是圆角矩形，顶部有与枪管同轴的凹槽（枪管坐
// 进去），前端收窄、后端略宽，端面封口并带倒角。
// 局部系：origin = 后端面中心（顶面），+Z 枪口。
// ---------------------------------------------------------------------------
const woodHandguard: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const len = num(p, "len", 0.15);
  const w = num(p, "w", 0.046);
  const h = num(p, "h", 0.032);
  const grooveWidth = num(p, "grooveWidth", 0.013);
  const grooveDepth = num(p, "grooveDepth", 0.008);
  const sections = [
    { z: 0, width: w, top: 0, bottom: -h, squareness: 0.6, grooveWidth, grooveDepth },
    { z: len * 0.08, width: w * 0.99, top: -0.0008, bottom: -h * 0.99, squareness: 0.6, grooveWidth, grooveDepth },
    { z: len * 0.5, width: w * 0.98, top: -0.0016, bottom: -h * 0.96, squareness: 0.58, grooveWidth, grooveDepth },
    { z: len * 0.88, width: w * 0.94, top: -0.0026, bottom: -h * 0.9, squareness: 0.56, grooveWidth, grooveDepth },
    { z: len - 0.006, width: w * 0.9, top: -0.0034, bottom: -h * 0.84, squareness: 0.54, grooveWidth, grooveDepth },
    { z: len, width: w * 0.86, top: -0.004, bottom: -h * 0.8, squareness: 0.52, grooveWidth, grooveDepth },
  ];
  return loftGeometry(sections, 48, true, true);
};

export const gun7Kits: Record<string, GeometryBuilder> = {
  // 复用旧共享库中仍然正确的通用件（弹簧/弹药/焰/弹链/脚架/护木）
  ammoBullet: gunKitBuilders.ammoBullet,
  ammoCore: gunKitBuilders.ammoCore,
  cartridgeCase: gunKitBuilders.cartridgeCase,
  propellantCharge: gunKitBuilders.propellantCharge,
  primerCap: gunKitBuilders.primerCap,
  muzzleFlash: gunKitBuilders.muzzleFlash,
  coilSpring: gunHardwareBuilders.coilSpring,
  torsionSpring: gunHardwareBuilders.torsionSpring,
  bipod: gunHardwareBuilders.bipod,
  flashHider: gunHardwareBuilders.flashHider,
  spadeGrip: gunHardwareBuilders.spadeGrip,
  handguardCurve: gunHardwareBuilders.handguardCurve,
  handguardShell: gunHardwareBuilders.handguardShell,
  beltLinkOld: gunHardwareBuilders.beltLink,
  // 重做版新件
  sideProfile,
  sectionedBarrel,
  riflingLand,
  gear,
  beltLink,
  spiralGuide,
  drumShell,
  ringPlate,
  stripperClip,
  railFrame,
  sightLeaf,
  triggerGuard,
  boxMagShell,
  stampedShell,
  woodHandguard,
};

/** 便捷几何：沿 Z 的圆柱（r/h 参数），原点在中心。 */
export function cylinderZ(r: number, h: number, segments = 20, rTop = r): THREE.BufferGeometry {
  const geometry = cylinderGeometry(r, h, rTop, segments);
  geometry.rotateX(Math.PI / 2);
  return geometry;
}

/** 便捷几何：沿 Y 的圆柱（默认已沿 Y）。 */
export function cylinderY(r: number, h: number, segments = 20, rTop = r): THREE.BufferGeometry {
  return cylinderGeometry(r, h, rTop, segments);
}

/** 便捷几何：沿 X 的圆柱。 */
export function cylinderX(r: number, h: number, segments = 20, rTop = r): THREE.BufferGeometry {
  const geometry = cylinderGeometry(r, h, rTop, segments);
  geometry.rotateZ(Math.PI / 2);
  return geometry;
}

/** 便捷几何：沿 Z 的管（原点中心）。 */
export function tubeZ(rOuter: number, rInner: number, h: number, segments = 20): THREE.BufferGeometry {
  const geometry = tubeGeometry(rOuter, rInner, h, segments);
  geometry.rotateX(Math.PI / 2);
  return geometry;
}

/** 便捷几何：沿 Z 的圆环（origin 中心）。 */
export function torusZ(r: number, tube: number, arc = Math.PI * 2, segments = 16): THREE.BufferGeometry {
  return new THREE.TorusGeometry(r, tube, 6, segments, arc);
}

/** 便捷几何：球。 */
export function ball(r: number, segments = 12): THREE.BufferGeometry {
  return sphereGeometry(r, segments, Math.max(6, Math.round(segments * 0.6)));
}

/** 便捷几何：倒角盒（中心原点）。 */
export function box(w: number, h: number, d: number, bevel = 0.001): THREE.BufferGeometry {
  return bevelBoxGeometry(w, h, d, bevel, 2);
}

/** 便捷几何：薄板（中心原点，厚度沿 Z）。 */
export function plate(w: number, h: number, t = 0.002, bevel = 0.0005): THREE.BufferGeometry {
  return plateGeometry(w, h, t, bevel);
}

/** 合并多个几何（自动 dispose 子件）。 */
export function mergeAll(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  return merge(parts);
}

/** 重新导出少量内核工具，模型文件少写 import。 */
export { latheGeometry };
