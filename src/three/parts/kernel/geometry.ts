import * as THREE from "three";
import { mergeGeometries as mergeGeometriesRaw } from "three/examples/jsm/utils/BufferGeometryUtils.js";

// ============================================================================
// kernel/geometry —— 程序化几何内核（反积木工具箱）
//
// 质量红线见 docs/MACHINE_STYLE.md 第 9 节，来源见 THIRD_PARTY_NOTICES.md：
// 本文件在架构上衍生自 fight-stage `src/three/code/detailKit.ts`
// （Copyright (c) 2026 OasisMind contributors, MIT），并按零件化规范扩展：
//   bevelBoxGeometry   微倒角盒体（消灭锐利 90° 大角）
//   plateGeometry      薄板件（装甲板 / 蒙皮 / 口盖）
//   cylinder/tube      车削件与管件（含倒角封口，绝不开口）
//   latheGeometry      回转体放样（轮盘 / 炮口制退器 / 轮缘，≥24 径向段）
//   polygonExtrude     轮廓挤出（车体侧板 / 炮盾 / 支架等真实剪影）
//   airfoilGeometry    NACA 翼型挤出（尖后缘，禁平板条）
//   louverGeometry     散热百叶（真实斜槽阵列）
//   rivetStrip         铆钉列 / boltCircleGeometry 螺栓圈
//   weldBeadGeometry   手工焊道（蛇形 + 半径波动，非完美圆柱）
//   mirrorGeometry     X 镜像（负片翻转 + 绕序修正，代替 scale=-1）
//   mergeGeometries    多小件合并（降 draw call；静态件优先）
//   place              位置 + 角度制欧拉角快捷函数
// ============================================================================

/** 确定性伪随机（mulberry32）：全项目贴图/公差/磨损共用同一源，保证可复现。 */
export function mulberry32(seed: number): () => number {
  let value = seed;
  return () => {
    value |= 0;
    value = (value + 0x6d2b79f5) | 0;
    let t = Math.imul(value ^ (value >>> 15), 1 | value);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 字符串 → 稳定整数种子（供按零件 ID 派生的确定性差异使用）。 */
export function hashSeed(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function roundedRectShape(width: number, height: number, radius: number): THREE.Shape {
  const halfW = width / 2;
  const halfH = height / 2;
  const r = Math.max(Math.min(radius, halfW, halfH), 0.0005);
  const shape = new THREE.Shape();
  shape.moveTo(-halfW + r, -halfH);
  shape.lineTo(halfW - r, -halfH);
  shape.absarc(halfW - r, -halfH + r, r, -Math.PI / 2, 0, false);
  shape.lineTo(halfW, halfH - r);
  shape.absarc(halfW - r, halfH - r, r, 0, Math.PI / 2, false);
  shape.lineTo(-halfW + r, halfH);
  shape.absarc(-halfW + r, halfH - r, r, Math.PI / 2, Math.PI, false);
  shape.lineTo(-halfW, -halfH + r);
  shape.absarc(-halfW + r, -halfH + r, r, Math.PI, Math.PI * 1.5, false);
  shape.closePath();
  return shape;
}

/** 微倒角盒体：整体尺寸 w×h×d，边缘倒角 bevel（默认 2 cm）。替代裸 BoxGeometry。 */
export function bevelBoxGeometry(
  width: number,
  height: number,
  depth: number,
  bevel = 0.02,
  cornerSegments = 3,
): THREE.ExtrudeGeometry {
  const b = Math.max(Math.min(bevel, width / 3, height / 3, depth / 3), 0.0004);
  const shape = roundedRectShape(Math.max(width - 2 * b, 0.001), Math.max(height - 2 * b, 0.001), b * 1.15);
  const inner = Math.max(depth - 2 * b, 0.001);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: inner,
    bevelEnabled: true,
    bevelThickness: b,
    bevelSize: b,
    bevelSegments: 2,
    curveSegments: cornerSegments,
    steps: 1,
  });
  geometry.translate(0, 0, -inner / 2);
  return geometry;
}

/** 薄板件：蒙皮板 / 口盖 / 装甲板（默认 12 mm 厚，四角圆润）。 */
export function plateGeometry(
  width: number,
  height: number,
  thickness = 0.012,
  bevel = 0.003,
): THREE.ExtrudeGeometry {
  return bevelBoxGeometry(width, height, thickness, Math.min(bevel, thickness * 0.45), 2);
}

/** 圆柱（可锥）：两端倒角封口，axis 沿 Y。rTop 缺省 = r（等径）。 */
export function cylinderGeometry(
  rBottom: number,
  height: number,
  rTop = rBottom,
  segments = 24,
  bevel = 0,
): THREE.BufferGeometry {
  const h = Math.max(height, 0.0005);
  const maxR = Math.max(rBottom, rTop);
  const b = Math.max(Math.min(bevel, maxR * 0.35, h * 0.35), 0);
  const profile: [number, number][] = [];
  const steps = 8;
  if (b <= 0.0002) {
    profile.push([0, -h / 2], [rBottom, -h / 2], [rTop, h / 2], [0, h / 2]);
  } else {
    // 底部倒角弧
    profile.push([0, -h / 2]);
    profile.push([Math.max(rBottom - b, 0.0005), -h / 2]);
    for (let i = 1; i <= steps; i++) {
      const a = (Math.PI / 2) * (i / steps);
      profile.push([rBottom - b + b * Math.sin(a), -h / 2 + b * (1 - Math.cos(a))]);
    }
    // 顶部倒角弧
    for (let i = 0; i <= steps; i++) {
      const a = (Math.PI / 2) * (1 - i / steps);
      profile.push([rTop - b + b * Math.sin(a), h / 2 - b * (1 - Math.cos(a))]);
    }
    profile.push([Math.max(rTop - b, 0.0005), h / 2], [0, h / 2]);
  }
  return latheGeometry(profile, segments);
}

/** 管件（法兰/护罩/套管）：两端为环形封口，绝不开口。 */
export function tubeGeometry(
  rOuter: number,
  rInner: number,
  height: number,
  segments = 24,
): THREE.BufferGeometry {
  if (rInner >= rOuter) throw new Error("kernel.tubeGeometry：内径必须小于外径");
  const h = Math.max(height, 0.0005);
  const profile: [number, number][] = [
    [rInner, -h / 2],
    [rOuter, -h / 2],
    [rOuter, h / 2],
    [rInner, h / 2],
    [rInner, -h / 2],
  ];
  return latheGeometry(profile, segments);
}

/** 回转体放样：profile 为 [半径, 高度] 剖面，绕 Y 轴旋转。≥24 径向段为标准。 */
export function latheGeometry(profile: [number, number][], segments = 32): THREE.BufferGeometry {
  if (profile.length < 2) throw new Error("kernel.latheGeometry：剖面至少 2 个点");
  const points = profile.map(([r, y]) => new THREE.Vector2(Math.max(r, 0.0002), y));
  return new THREE.LatheGeometry(points, Math.max(8, Math.floor(segments)));
}

/** 球（含半球 / 球冠）：phiLength 控制纬度范围（弧度）。 */
export function sphereGeometry(
  radius: number,
  widthSegments = 16,
  heightSegments = 12,
  phiStart = 0,
  phiLength = Math.PI * 2,
): THREE.SphereGeometry {
  return new THREE.SphereGeometry(radius, widthSegments, heightSegments, phiStart, phiLength, 0, Math.PI);
}

/** 轮廓挤出：points 为 XZ 剪影（[x, y]），沿 Z 拉伸 depth，带微倒角。用于真实剪影板件。 */
export function polygonExtrudeGeometry(
  points: [number, number][],
  depth: number,
  bevel = 0.004,
): THREE.ExtrudeGeometry {
  if (points.length < 3) throw new Error("kernel.polygonExtrudeGeometry：轮廓至少 3 个点");
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) shape.lineTo(points[i][0], points[i][1]);
  shape.closePath();
  const d = Math.max(depth, 0.002);
  const b = Math.max(Math.min(bevel, d * 0.4), 0.0004);
  const inner = Math.max(d - 2 * b, 0.001);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: inner,
    bevelEnabled: true,
    bevelThickness: b,
    bevelSize: b,
    bevelSegments: 1,
    steps: 1,
  });
  geometry.translate(0, 0, -inner / 2);
  return geometry;
}

/** NACA 对称翼型挤出：弦长 chord（沿 X，前缘在 x=0），展长 span（沿 Z），厚度比默认 12%，尖后缘。 */
export function airfoilGeometry(
  chord: number,
  span: number,
  thicknessRatio = 0.12,
  steps = 20,
  tipBevel = 0.006,
): THREE.ExtrudeGeometry {
  const yt = (x: number) =>
    5 *
    thicknessRatio *
    (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4);
  const shape = new THREE.Shape();
  shape.moveTo(chord, 0);
  for (let i = steps - 1; i >= 1; i--) {
    const x = i / steps;
    shape.lineTo(x * chord, yt(x) * chord);
  }
  shape.lineTo(0, 0);
  for (let i = 1; i <= steps - 1; i++) {
    const x = i / steps;
    shape.lineTo(x * chord, -yt(x) * chord);
  }
  shape.closePath();
  const bevel = Math.min(tipBevel, chord * thicknessRatio * 0.35);
  const inner = Math.max(span - 2 * bevel, 0.001);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: inner,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    steps: 1,
  });
  geometry.translate(0, 0, -inner / 2);
  return geometry;
}

/** 散热百叶 / 格栅：count 片斜叶，总宽 width、总高 height，倾斜 slantDeg。 */
export function louverGeometry(
  count: number,
  width: number,
  height: number,
  slantDeg = 38,
  thickness = 0.006,
): THREE.BufferGeometry {
  const step = height / Math.max(count, 1);
  const list: THREE.BufferGeometry[] = [];
  for (let i = 0; i < count; i++) {
    const slat = bevelBoxGeometry(width, Math.max(step * 0.7, 0.004), thickness, 0.0012, 1);
    slat.rotateX(THREE.MathUtils.degToRad(slantDeg));
    slat.translate(0, height / 2 - step * (i + 0.5), 0);
    list.push(slat);
  }
  const merged = mergeGeometries(list);
  for (const item of list) item.dispose();
  return merged;
}

/** 铆钉列：count 颗半球沿 X 排列，间距 spacing，半径 radius（默认 6 mm）。 */
export function rivetStripGeometry(count: number, spacing: number, radius = 0.006): THREE.BufferGeometry {
  const single = new THREE.SphereGeometry(radius, 6, 4, 0, Math.PI * 2, 0, Math.PI / 2);
  const list: THREE.BufferGeometry[] = [];
  for (let i = 0; i < count; i++) {
    const dot = single.clone();
    dot.translate((i - (count - 1) / 2) * spacing, 0, 0);
    list.push(dot);
  }
  single.dispose();
  const merged = mergeGeometries(list);
  for (const item of list) item.dispose();
  return merged;
}

/** 螺栓圈：count 组六角头螺栓，沿半径 radius 的圆周分布（+Z 起、逆时针），轴向 Y。 */
export function boltCircleGeometry(
  count: number,
  radius: number,
  boltR = 0.012,
  boltH = 0.014,
): THREE.BufferGeometry {
  const head = cylinderGeometry(boltR, boltH, boltR, 6, 0);
  const list: THREE.BufferGeometry[] = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const bolt = head.clone();
    bolt.translate(Math.sin(angle) * radius, boltH / 2, Math.cos(angle) * radius);
    list.push(bolt);
  }
  head.dispose();
  const merged = mergeGeometries(list);
  for (const item of list) item.dispose();
  return merged;
}

/** 手工焊道：from→to 的蛇形管，半径 0.8–1.2 倍波动（模拟手工焊的起弧/收弧/摆动）。 */
export function weldBeadGeometry(
  from: [number, number, number],
  to: [number, number, number],
  radius = 0.006,
  seed = 1,
): THREE.BufferGeometry {
  const rand = mulberry32(seed);
  const a = new THREE.Vector3(...from);
  const b = new THREE.Vector3(...to);
  const length = a.distanceTo(b);
  const steps = Math.max(8, Math.round(length / (radius * 2.2)));
  const points: THREE.Vector3[] = [];
  const dir = b.clone().sub(a).normalize();
  // 与焊道走向正交的两个抖动轴
  const up = Math.abs(dir.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const jitterA = new THREE.Vector3().crossVectors(dir, up).normalize();
  const jitterB = new THREE.Vector3().crossVectors(dir, jitterA).normalize();
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const p = a.clone().lerp(b, t);
    const wobble = Math.sin(t * Math.PI) * radius * 0.5;
    const swing = Math.sin(t * Math.PI * 9 + rand() * 0.6) * wobble * 0.7;
    const wobbleB = (rand() - 0.5) * wobble * 0.5;
    p.addScaledVector(jitterA, swing);
    p.addScaledVector(jitterB, wobbleB);
    points.push(p);
  }
  const curve = new THREE.CatmullRomCurve3(points);
  const geometry = new THREE.TubeGeometry(curve, steps * 2, radius, 6, false);
  // 半径波动：沿管径向缩放顶点
  const pos = geometry.getAttribute("position") as THREE.BufferAttribute;
  const center = new THREE.Vector3();
  for (let i = 0; i <= steps * 2; i++) {
    const t = i / (steps * 2);
    const scale = 0.82 + rand() * 0.36;
    const p = curve.getPointAt(Math.min(t, 1));
    for (let k = 0; k <= 6; k++) {
      const idx = i * 7 + k;
      if (idx >= pos.count) break;
      center.fromBufferAttribute(pos, idx).sub(p);
      center.multiplyScalar(scale);
      pos.setXYZ(idx, p.x + center.x, p.y + center.y, p.z + center.z);
    }
  }
  geometry.computeVertexNormals();
  return geometry;
}

/** 几何镜像：沿指定轴取反位置与法线并修正三角形绕序（代替 scale=-1 的错误光照）。 */
export function mirrorGeometry(
  geometry: THREE.BufferGeometry,
  axis: "x" | "z" = "x",
): THREE.BufferGeometry {
  const g = geometry.clone();
  const idx = axis === "x" ? 0 : 2;
  const pos = g.getAttribute("position") as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) pos.setComponent(i, idx, -pos.getComponent(i, idx));
  const normal = g.getAttribute("normal");
  if (normal) {
    for (let i = 0; i < normal.count; i++) {
      normal.setComponent(i, idx, -normal.getComponent(i, idx));
    }
  }
  if (g.index) {
    const index = g.index;
    for (let i = 0; i < index.count; i += 3) {
      const b = index.getX(i + 1);
      index.setX(i + 1, index.getX(i + 2));
      index.setX(i + 2, b);
    }
    index.needsUpdate = true;
  } else {
    // 非索引：按三角形重排顶点
    const p = g.getAttribute("position") as THREE.BufferAttribute;
    const n = g.getAttribute("normal") as THREE.BufferAttribute | undefined;
    const uv = g.getAttribute("uv") as THREE.BufferAttribute | undefined;
    const tmpP = [0, 0, 0];
    const tmpN = [0, 0, 0];
    const tmpU = [0, 0];
    for (let i = 0; i < p.count; i += 3) {
      // i+1 ↔ i+2 交换
      for (let ax = 0; ax < 3; ax++) {
        tmpP[ax] = p.getComponent(i + 1, ax);
        p.setComponent(i + 1, ax, p.getComponent(i + 2, ax));
        p.setComponent(i + 2, ax, tmpP[ax]);
      }
      if (n) {
        for (let ax = 0; ax < 3; ax++) {
          tmpN[ax] = n.getComponent(i + 1, ax);
          n.setComponent(i + 1, ax, n.getComponent(i + 2, ax));
          n.setComponent(i + 2, ax, tmpN[ax]);
        }
      }
      if (uv) {
        for (let ax = 0; ax < 2; ax++) {
          tmpU[ax] = uv.getComponent(i + 1, ax);
          uv.setComponent(i + 1, ax, uv.getComponent(i + 2, ax));
          uv.setComponent(i + 2, ax, tmpU[ax]);
        }
      }
    }
    p.needsUpdate = true;
    if (n) n.needsUpdate = true;
    if (uv) uv.needsUpdate = true;
  }
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

/** 几何合并：统一为非索引、补齐 normal/uv 后合并；传入的源几何不被释放。 */
/** 直齿圆柱齿轮（梯形齿廓 + 中心孔，Shape→Extrude）：剖视/近景够用，不做渐开线。 */
export function spurGearGeometry(
  teeth: number,
  pitchRadius: number,
  width: number,
  bore: number,
  bevel = 0.0006,
): THREE.BufferGeometry {
  const moduleSize = (2 * pitchRadius) / teeth;
  const tip = pitchRadius + moduleSize * 0.8;
  const root = Math.max(pitchRadius - moduleSize, bore + 0.004);
  const step = (Math.PI * 2) / teeth;
  const tipHalf = step * 0.3;
  const rootHalf = step * 0.44;
  const shape = new THREE.Shape();
  let first = true;
  for (let i = 0; i < teeth; i++) {
    const a = i * step;
    const corners: [number, number][] = [
      [root * Math.cos(a - rootHalf), root * Math.sin(a - rootHalf)],
      [tip * Math.cos(a - tipHalf), tip * Math.sin(a - tipHalf)],
      [tip * Math.cos(a + tipHalf), tip * Math.sin(a + tipHalf)],
      [root * Math.cos(a + rootHalf), root * Math.sin(a + rootHalf)],
    ];
    for (const [x, y] of corners) {
      if (first) {
        shape.moveTo(x, y);
        first = false;
      } else {
        shape.lineTo(x, y);
      }
    }
  }
  shape.closePath();
  shape.holes.push(new THREE.Path().absarc(0, 0, bore, 0, Math.PI * 2, true));
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(width - 2 * bevel, 0.001),
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 1,
    steps: 1,
    curveSegments: 32,
  });
  geometry.translate(0, 0, -width / 2 + bevel);
  return geometry;
}

/** 放样截面：沿 +Z 排列的椭圆/超椭圆截面。用于枪托、握把、护木这类
 *  真实木/塑件——不是「一块板挤出」，截面宽度、高度、中心线都随长度变化。
 *  top/bottom 是局部 Y 的绝对上下缘，允许贴腮板与托底下沉分别控制。 */
export interface LoftSection {
  z: number;
  width: number;
  top: number;
  bottom: number;
  /** 截面中心 X（默认 0）；用于弯枪托/贴腮偏置。 */
  cx?: number;
  /** 0 = 椭圆；0.5~0.75 = 圆角矩形。 */
  squareness?: number;
  /** 顶面枪管槽半宽（沿 X）；0 或省略 = 不开槽。 */
  grooveWidth?: number;
  /** 枪管槽深度（向下）；仅在 grooveWidth > 0 时生效。 */
  grooveDepth?: number;
}

/** 沿 Z 放样：每站生成超椭圆截面，站间三角化，两端可选封口。
 *  法线/UV 一并生成；返回索引几何。 */
export function loftGeometry(
  sections: LoftSection[],
  segments = 28,
  capStart = true,
  capEnd = true,
): THREE.BufferGeometry {
  if (sections.length < 2) throw new Error("loftGeometry：至少需要 2 个截面");
  if (segments < 8) throw new Error("loftGeometry：segments 至少 8");
  const sorted = [...sections].sort((a, b) => a.z - b.z);
  const ring = segments + 1; // 复制接缝顶点，保证 UV 连续且不出现接缝法线
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const zi0 = sorted[0].z;
  const zi1 = sorted[sorted.length - 1].z;
  const spanZ = Math.max(zi1 - zi0, 1e-6);

  const pointAt = (section: LoftSection, j: number): [number, number, number] => {
    const theta = (j / segments) * Math.PI * 2;
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    const square = THREE.MathUtils.clamp(section.squareness ?? 0.45, 0, 0.92);
    // 超椭圆指数：square=0 时 2（椭圆），square→0.92 时趋近圆角矩形。
    const exponent = 2 / Math.max(0.08, 1 - square * 0.78);
    const halfW = Math.max(section.width / 2, 1e-5);
    const centerY = (section.top + section.bottom) / 2;
    const halfTop = Math.max(section.top - centerY, 1e-5);
    const halfBottom = Math.max(centerY - section.bottom, 1e-5);
    const px = Math.sign(c) * Math.pow(Math.abs(c), exponent) * halfW;
    let py =
      centerY +
      Math.sign(s) * Math.pow(Math.abs(s), exponent) * (s >= 0 ? halfTop : halfBottom);
    if (s >= 0 && (section.grooveWidth ?? 0) > 0 && (section.grooveDepth ?? 0) > 0) {
      // 顶面枪管槽：用一段**圆弧**从顶面"切"进去（min 取低），
      // 得到真正的圆弧马鞍槽；枪管坐在槽里，而不是浮在木头上方。
      // grooveWidth = 槽的半径（半宽），grooveDepth = 槽深。
      const r = Math.max(section.grooveWidth ?? 0, 1e-4);
      const depth = Math.min(section.grooveDepth ?? 0, r);
      const d = Math.abs(px);
      if (d < r) {
        const centerY = section.top - depth + r;
        const surf = centerY - Math.sqrt(Math.max(0, r * r - d * d));
        py = Math.min(py, surf);
      }
    }
    return [(section.cx ?? 0) + px, py, section.z];
  };

  for (let i = 0; i < sorted.length; i++) {
    const section = sorted[i];
    const v = (section.z - zi0) / spanZ;
    for (let j = 0; j <= segments; j++) {
      const [x, y, z] = pointAt(section, j % segments);
      positions.push(x, y, z);
      // U 沿枪身长度、V 绕截面：木纹/拉丝方向都沿枪管轴向，避免木托上出现
      // 一圈一圈的横纹（真实枪托木纹是顺着枪身走的）。
      uvs.push(v, j / segments);
    }
  }
  for (let i = 0; i < sorted.length - 1; i++) {
    for (let j = 0; j < segments; j++) {
      const a = i * ring + j;
      const b = a + 1;
      const c = (i + 1) * ring + j;
      const d = c + 1;
      // 逆时针环 + +Z 前进 → (a,b,c) 为外法线。
      indices.push(a, b, c, b, d, c);
    }
  }

  const addCap = (section: LoftSection, atStart: boolean) => {
    const base = atStart ? 0 : (sorted.length - 1) * ring;
    const centerY = (section.top + section.bottom) / 2;
    const center = positions.length / 3;
    positions.push(section.cx ?? 0, centerY, section.z);
    uvs.push(0.5, 0.5);
    for (let j = 0; j < segments; j++) {
      const a = base + j;
      const b = base + j + 1;
      // 起点朝 -Z，终点朝 +Z
      if (atStart) indices.push(center, b, a);
      else indices.push(center, a, b);
    }
  };
  if (capStart) addCap(sorted[0], true);
  if (capEnd) addCap(sorted[sorted.length - 1], false);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * 生成平面投影 UV（按主法线方向选投影面）。
 *
 * 为什么必须有它：three 的各向异性（MeshPhysicalMaterial.anisotropy）靠
 * `getTangentFrame()` 从 UV 的屏幕空间导数重建切线基。UV 缺失或整段为 0 时
 * 行列式为 0，切线退化 → 各向异性 BRDF 产生 NaN → 金属整块变黑
 * （也会让 Bloom 把 NaN 扩散成全屏黑）。所以合并前必须保证每个几何都有
 * 真实变化的 UV。
 */
export function planarUv(geometry: THREE.BufferGeometry, scale = 40): THREE.BufferGeometry {
  const position = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  if (!position) return geometry;
  const uv = new Float32Array(position.count * 2);
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    let nx = 0;
    let ny = 1;
    let nz = 0;
    if (normal) {
      nx = Math.abs(normal.getX(i));
      ny = Math.abs(normal.getY(i));
      nz = Math.abs(normal.getZ(i));
    }
    let u: number;
    let v: number;
    if (ny >= nx && ny >= nz) {
      u = x;
      v = z;
    } else if (nx >= nz) {
      u = z;
      v = y;
    } else {
      u = x;
      v = y;
    }
    uv[i * 2] = u * scale;
    uv[i * 2 + 1] = v * scale;
  }
  geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return geometry;
}

/**
 * 计算稳定的切线属性（tangent vec4）。
 *
 * three 的各向异性高光在缺少 tangent 属性时用 `getTangentFrame()` 从 UV 的
 * 屏幕空间导数重建切线基；UV 退化的三角形会得到零切线，进而在
 * `anisotropyT/anisotropyB` 上产生 NaN → 整块金属变黑（Bloom 还会把 NaN
 * 扩散成全屏黑）。这里直接给出 tangent 属性：UV 正常时按 Mikkelsen 公式算，
 * UV 退化时回退到一条与法线正交的确定方向，保证不出现 NaN。
 */
export function computeTangentsSafe(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const position = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  const uv = geometry.getAttribute("uv");
  if (!position || !normal || !uv) return geometry;
  const count = position.count;
  const accumulated = new Float32Array(count * 3);
  const index = geometry.index;
  const triangleCount = Math.floor((index ? index.count : count) / 3);
  const at = (i: number) => (index ? index.getX(i) : i);
  for (let t = 0; t < triangleCount; t++) {
    const ia = at(t * 3);
    const ib = at(t * 3 + 1);
    const ic = at(t * 3 + 2);
    const e1x = position.getX(ib) - position.getX(ia);
    const e1y = position.getY(ib) - position.getY(ia);
    const e1z = position.getZ(ib) - position.getZ(ia);
    const e2x = position.getX(ic) - position.getX(ia);
    const e2y = position.getY(ic) - position.getY(ia);
    const e2z = position.getZ(ic) - position.getZ(ia);
    const du1 = uv.getX(ib) - uv.getX(ia);
    const dv1 = uv.getY(ib) - uv.getY(ia);
    const du2 = uv.getX(ic) - uv.getX(ia);
    const dv2 = uv.getY(ic) - uv.getY(ia);
    const det = du1 * dv2 - du2 * dv1;
    if (Math.abs(det) < 1e-12) continue; // 退化 UV：留 0，后面统一回退
    const r = 1 / det;
    const tx = (e1x * dv2 - e2x * dv1) * r;
    const ty = (e1y * dv2 - e2y * dv1) * r;
    const tz = (e1z * dv2 - e2z * dv1) * r;
    accumulated[ia * 3] += tx;
    accumulated[ia * 3 + 1] += ty;
    accumulated[ia * 3 + 2] += tz;
    accumulated[ib * 3] += tx;
    accumulated[ib * 3 + 1] += ty;
    accumulated[ib * 3 + 2] += tz;
    accumulated[ic * 3] += tx;
    accumulated[ic * 3 + 1] += ty;
    accumulated[ic * 3 + 2] += tz;
  }
  const tangents = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    const nx = normal.getX(i);
    const ny = normal.getY(i);
    const nz = normal.getZ(i);
    let tx = accumulated[i * 3];
    let ty = accumulated[i * 3 + 1];
    let tz = accumulated[i * 3 + 2];
    // Gram-Schmidt：切线正交化到法线平面
    const d = tx * nx + ty * ny + tz * nz;
    tx -= d * nx;
    ty -= d * ny;
    tz -= d * nz;
    let len = Math.hypot(tx, ty, tz);
    if (len < 1e-8) {
      // 回退：取一条与法线不平行的确定方向
      if (Math.abs(nx) < 0.9) {
        tx = 1;
        ty = 0;
        tz = 0;
      } else {
        tx = 0;
        ty = 1;
        tz = 0;
      }
      const d2 = tx * nx + ty * ny + tz * nz;
      tx -= d2 * nx;
      ty -= d2 * ny;
      tz -= d2 * nz;
      len = Math.hypot(tx, ty, tz) || 1;
    }
    tangents[i * 4] = tx / len;
    tangents[i * 4 + 1] = ty / len;
    tangents[i * 4 + 2] = tz / len;
    tangents[i * 4 + 3] = 1;
  }
  geometry.setAttribute("tangent", new THREE.BufferAttribute(tangents, 4));
  return geometry;
}

/** 合并几何：先补齐法线与 UV（UV 缺失时用平面投影），再合并。 */
export function mergeGeometries(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
  if (geometries.length === 0) throw new Error("kernel.mergeGeometries：空数组");
  const prepared = geometries.map((geometry) => (geometry.index ? geometry.toNonIndexed() : geometry));
  for (const geometry of prepared) {
    if (!geometry.getAttribute("normal")) geometry.computeVertexNormals();
    if (!geometry.getAttribute("uv")) planarUv(geometry);
    for (const name of Object.keys(geometry.attributes)) {
      if (name !== "position" && name !== "normal" && name !== "uv") geometry.deleteAttribute(name);
    }
  }
  if (prepared.length === 1) {
    const single = prepared[0].clone();
    if (single !== geometries[0]) single.dispose();
    single.computeBoundingSphere();
    single.computeBoundingBox();
    return single;
  }
  const merged = mergeGeometriesRaw(prepared, false);
  if (!merged) throw new Error("kernel.mergeGeometries：几何属性不一致，合并失败");
  for (let i = 0; i < prepared.length; i++) {
    if (prepared[i] !== geometries[i]) prepared[i].dispose();
  }
  merged.computeBoundingSphere();
  merged.computeBoundingBox();
  return merged;
}

/** 沿法线做微小顶点抖动：铸造件「橘皮」与制造公差的几何层表达（幅度 0.1–0.3 mm 级）。 */
export function jitterGeometry(
  geometry: THREE.BufferGeometry,
  amplitude: number,
  seed = 1,
): THREE.BufferGeometry {
  if (amplitude <= 0) return geometry;
  const g = geometry.clone();
  const pos = g.getAttribute("position") as THREE.BufferAttribute;
  const scale = 1 / Math.max(amplitude, 0.0001);
  for (let i = 0; i < pos.count; i++) {
    const x = Math.round(pos.getX(i) * scale);
    const y = Math.round(pos.getY(i) * scale);
    const z = Math.round(pos.getZ(i) * scale);
    // 按顶点位置哈希：共享顶点得到相同的偏移，避免撕裂缝
    const h = hashSeed(`${x},${y},${z}:${seed}`) / 4294967296;
    const d = (h - 0.5) * 2 * amplitude;
    pos.setX(i, pos.getX(i) + d);
    pos.setY(i, pos.getY(i) + d * 0.6);
    pos.setZ(i, pos.getZ(i) + d * 0.8);
  }
  pos.needsUpdate = true;
  g.computeVertexNormals();
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

/** 设置位置与欧拉角的快捷函数（角度制）。 */
export function place(
  mesh: THREE.Object3D,
  x: number,
  y: number,
  z: number,
  rxDeg = 0,
  ryDeg = 0,
  rzDeg = 0,
): THREE.Object3D {
  mesh.position.set(x, y, z);
  mesh.rotation.set(
    THREE.MathUtils.degToRad(rxDeg),
    THREE.MathUtils.degToRad(ryDeg),
    THREE.MathUtils.degToRad(rzDeg),
  );
  return mesh;
}
