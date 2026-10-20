import * as THREE from "three";
import type { GeometryBuilder } from "../../assembler/geometry";
import { cylinderGeometry, latheGeometry, mergeGeometries, tubeGeometry } from "../../kernel/geometry";

// ============================================================================
// t800/kits —— T-800 腿的专用几何构造器
//
// 注册表只声明「几何参数」，真正的多体组合（方管梁 + 端部叉耳 + 安装凸台、
// 耳环 + 台肩 + 颈、关节盘 + 插销）在这里生成，保证每个零件仍是独立 partId。
//
// 局部坐标约定：
//   t800Bone        —— 骨段轴沿 Y（+Y 朝上），截面在 XZ 平面
//   t800JointDisc   —— 关节盘轴沿 Z（销轴方向），插销沿 -Y
//   t800Eye         —— 耳环孔轴沿 X（销轴方向），颈沿 +Y（缸轴方向）
// ============================================================================

const BEVEL = 0.0015;

/** 圆角矩形轮廓（XY 平面，中心在原点）。 */
function roundedRectShape(width: number, height: number, radius: number): THREE.Shape {
  const w = Math.max(width, 0.002);
  const h = Math.max(height, 0.002);
  const r = Math.max(Math.min(radius, w / 2 - 0.001, h / 2 - 0.001), 0.001);
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2 + r, -h / 2);
  shape.lineTo(w / 2 - r, -h / 2);
  shape.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  shape.lineTo(w / 2, h / 2 - r);
  shape.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
  shape.lineTo(-w / 2 + r, h / 2);
  shape.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
  shape.lineTo(-w / 2, -h / 2 + r);
  shape.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  shape.closePath();
  return shape;
}

/**
 * 方管梁：圆角矩形截面 + 圆形管腔，沿 Y 拉伸。
 * 管腔贯穿全骨（液压线从关节中心穿过），两端口正好是关节盘插销的插入口。
 */
function beamGeometry(
  w: number,
  d: number,
  h: number,
  cornerR: number,
  boreR: number,
): THREE.BufferGeometry {
  const shape = roundedRectShape(w - 2 * BEVEL, d - 2 * BEVEL, Math.max(cornerR - BEVEL, 0.002));
  if (boreR > 0) {
    const hole = new THREE.Path();
    hole.absarc(0, 0, boreR, 0, Math.PI * 2, true);
    shape.holes.push(hole);
  }
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: h - 2 * BEVEL,
    bevelEnabled: true,
    bevelThickness: BEVEL,
    bevelSize: BEVEL,
    bevelSegments: 1,
    steps: 1,
    curveSegments: 8,
  });
  geometry.translate(0, 0, -(h - 2 * BEVEL) / 2);
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

/** 叉耳：圆头舌片（XY 轮廓，沿 Z 挤出），中心带轴承孔。 */
function cheekGeometry(
  r: number,
  boreR: number,
  thickness: number,
  top: number,
  boreY: number,
): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-r, boreY);
  shape.absarc(0, boreY, r, Math.PI, Math.PI * 2, false);
  shape.lineTo(r, top);
  shape.lineTo(-r, top);
  shape.closePath();
  const hole = new THREE.Path();
  hole.absarc(0, boreY, boreR, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: thickness - 2 * BEVEL,
    bevelEnabled: true,
    bevelThickness: BEVEL,
    bevelSize: BEVEL,
    bevelSegments: 1,
    steps: 1,
    curveSegments: 12,
  });
  geometry.translate(0, 0, -(thickness - 2 * BEVEL) / 2);
  return geometry;
}

/**
 * 安装凸台：绕 Y 回转的带盲孔凸台。
 * 局部 +Y = 凸台轴向（凸台面在 y=0，基座在 y=-len）。
 * len = out + embed：out 是伸出骨面的高度，embed 是埋进骨壁的深度。
 */
function bossGeometry(
  faceR: number,
  len: number,
  boreR: number,
  boreDepth: number,
): THREE.BufferGeometry {
  // 剖面走向必须与 kernel.tubeGeometry 一致：外壁由下向上、孔壁由上向下，
  // 否则 LatheGeometry 的法向翻转，合并后实体的奇偶射线判定失效（穿模误报）。
  const profile: [number, number][] = [
    [0, -len],
    [faceR, -len],
    [faceR, 0],
    [boreR, 0],
    [boreR, -boreDepth],
    [0, -boreDepth],
    [0, -len],
  ];
  return latheGeometry(profile, 28);
}

/** 关节盘：绕 Z 回转的圆盘（销孔）+ 下方插销（沿 -Y）。 */
function jointDiscGeometry(
  r: number,
  len: number,
  boreR: number,
  stubR: number,
  stubDrop: number,
): THREE.BufferGeometry {
  const rim = 0.004;
  const half = len / 2;
  const profile: [number, number][] = [
    [boreR, -half],
    [r - rim, -half],
    [r, -half + rim],
    [r, half - rim],
    [r - rim, half],
    [boreR, half],
    [boreR, -half],
  ];
  const disc = latheGeometry(profile, 32);
  disc.rotateX(Math.PI / 2);
  const stub = cylinderGeometry(stubR, stubDrop, stubR, 20, 0.0008);
  // 插销下端离关节中心 40mm：避开防尘罩外圈（38mm），不与罩体相切
  stub.translate(0, -half - stubDrop / 2 + 0.004, 0);
  return mergeGeometries([disc, stub]);
}

/** 耳环（杆端球面轴承座）：孔轴 X + 台肩 + 颈（+Y）。 */
function eyeGeometry(
  outerR: number,
  boreR: number,
  width: number,
  clear: number,
  collarR: number,
  collarH: number,
  neckR: number,
  neckLen: number,
): THREE.BufferGeometry {
  const ring = tubeGeometry(outerR, boreR, width - 2 * BEVEL, 32);
  ring.rotateZ(-Math.PI / 2);
  const collar = cylinderGeometry(collarR, collarH, collarR, 28, 0.0008);
  collar.translate(0, clear + collarH / 2, 0);
  const neck = cylinderGeometry(neckR, neckLen, neckR, 24, 0.0008);
  neck.translate(0, clear + neckLen / 2, 0);
  return mergeGeometries([ring, collar, neck]);
}

// ---------------------------------------------------------------------------
// kit 注册
// ---------------------------------------------------------------------------

interface BoneKitParams {
  w: number;
  d: number;
  h: number;
  corner: number;
  bore: number;
  /** 端部叉耳：{ y, z } —— 圆头中心 y、所在 z */
  cheeks?: Array<{ y: number; z: number }>;
  cheekR: number;
  cheekT: number;
  cheekBore: number;
  cheekTop: number;
  /** 安装凸台：{ y, x, side, out, faceR, boreR, boreDepth, embed }（y 相对骨段中心） */
  mounts?: Array<{
    y: number;
    x: number;
    side: number;
    out: number;
    faceR: number;
    boreR: number;
    boreDepth: number;
    embed: number;
  }>;
}

function boneKit(spec: { params?: Record<string, unknown> }): THREE.BufferGeometry {
  const p = spec.params as unknown as BoneKitParams;
  const pieces: THREE.BufferGeometry[] = [beamGeometry(p.w, p.d, p.h, p.corner, p.bore)];
  for (const cheek of p.cheeks ?? []) {
    const geometry = cheekGeometry(
      p.cheekR,
      p.cheekBore,
      p.cheekT,
      p.cheekTop,
      cheek.y,
    );
    geometry.translate(0, 0, cheek.z);
    pieces.push(geometry);
  }
  for (const mount of p.mounts ?? []) {
    const geometry = bossGeometry(
      mount.faceR,
      mount.out + mount.embed,
      mount.boreR,
      mount.boreDepth,
    );
    geometry.rotateX(mount.side > 0 ? Math.PI / 2 : -Math.PI / 2);
    geometry.translate(mount.x, mount.y, mount.side * (p.d / 2 + mount.out));
    pieces.push(geometry);
  }
  return mergeGeometries(pieces);
}

interface CheekKitParams {
  r: number;
  boreR: number;
  thickness: number;
  top: number;
}

/** 单片叉耳：圆头舌片，圆心（销孔）在局部原点。 */
function cheekKit(spec: { params?: Record<string, unknown> }): THREE.BufferGeometry {
  const p = spec.params as unknown as CheekKitParams;
  return cheekGeometry(p.r, p.boreR, p.thickness, p.top, 0);
}

interface DiscKitParams {
  r: number;
  len: number;
  boreR: number;
  stubR: number;
  stubDrop: number;
}

function jointDiscKit(spec: { params?: Record<string, unknown> }): THREE.BufferGeometry {
  const p = spec.params as unknown as DiscKitParams;
  return jointDiscGeometry(p.r, p.len, p.boreR, p.stubR, p.stubDrop);
}

interface EyeKitParams {
  outerR: number;
  boreR: number;
  width: number;
  clear: number;
  collarR: number;
  collarH: number;
  neckR: number;
  neckLen: number;
}

function eyeKit(spec: { params?: Record<string, unknown> }): THREE.BufferGeometry {
  const p = spec.params as unknown as EyeKitParams;
  return eyeGeometry(
    p.outerR,
    p.boreR,
    p.width,
    p.clear,
    p.collarR,
    p.collarH,
    p.neckR,
    p.neckLen,
  );
}

/** T-800 全部 kit 构造器。 */
export const t800Builders: Record<string, GeometryBuilder> = {
  t800Bone: boneKit as GeometryBuilder,
  t800Cheek: cheekKit as GeometryBuilder,
  t800JointDisc: jointDiscKit as GeometryBuilder,
  t800Eye: eyeKit as GeometryBuilder,
};
