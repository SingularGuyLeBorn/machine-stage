import * as THREE from "three";
import type { GeometryBuilder } from "../../assembler/geometry";
import {
  bevelBoxGeometry,
  cylinderGeometry,
  latheGeometry,
  mergeGeometries,
  tubeGeometry,
} from "../../kernel/geometry";

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

/** 圆角矩形孔（挖空用）。 */
function roundedRectPath(width: number, height: number, radius: number): THREE.Path {
  const path = new THREE.Path();
  const w = Math.max(width, 0.002);
  const h = Math.max(height, 0.002);
  const r = Math.max(Math.min(radius, w / 2 - 0.001, h / 2 - 0.001), 0.001);
  path.moveTo(-w / 2 + r, -h / 2);
  path.lineTo(w / 2 - r, -h / 2);
  path.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  path.lineTo(w / 2, h / 2 - r);
  path.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
  path.lineTo(-w / 2 + r, h / 2);
  path.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
  path.lineTo(-w / 2, -h / 2 + r);
  path.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  path.closePath();
  return path;
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
  /** 桁架参数：角柱截面 / 横撑环厚 / 环数 / 端板厚 / 端板孔半径 */
  rail?: number;
  ringT?: number;
  ringCount?: number;
  endT?: number;
  /** 本体相对关节连线的 X 偏移（+X 前）：股四头肌前凸 / 小腿肚后凸 */
  bodyX?: number;
  /** 端板缩放（<1 = 关节处收细，膝盖比大腿小腿都窄） */
  endScale?: number;
  /** 上端端板缩放（髋端保持全宽，腿才连得上） */
  endTopScale?: number;
  /** 下端端板的 X 偏移（局部坐标，对准下关节中心） */
  endBottomX?: number;
  /** 外侧曲面装甲板：随本体一起的"腿形体量"（层：y / 半宽 / 外鼓） */
  shell?: {
    levels: Array<{ y: number; halfW: number; bow: number }>;
    z0: number;
    thickness: number;
    xOffset?: number;
  };
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
  /** 安装座垫块（把凸台接到骨架上，替代"贴在光板面上"） */
  padW?: number;
  padH?: number;
  padT?: number;
}

function boneKit(spec: { params?: Record<string, unknown> }): THREE.BufferGeometry {
  const p = spec.params as unknown as BoneKitParams;
  const pieces: THREE.BufferGeometry[] = [];
  if (p.shell) {
    pieces.push(
      armorShell(p.shell.levels, p.shell.z0, p.shell.thickness, p.shell.xOffset ?? 0),
    );
  }
  pieces.push(
    trussBeam(
      p.w,
      p.d,
      p.h,
      p.rail ?? 0.013,
      p.ringT ?? 0.009,
      p.ringCount ?? 4,
      p.endT ?? 0.014,
      p.bore > 0 ? p.bore : 0,
      p.corner,
      p.bodyX ?? 0,
      p.endScale ?? 1,
      p.endBottomX ?? 0,
      p.endTopScale ?? p.endScale ?? 1,
    ),
  );
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
    // 安装座垫块：把凸台接到骨架上（不再"贴在光板面上"）
    const padW = p.padW ?? 0.034;
    const padH = p.padH ?? 0.034;
    const padT = p.padT ?? 0.016;
    if (padT > 0) {
      const pad = bevelBoxGeometry(padW, padH, padT, BEVEL);
      pad.translate(mount.x, mount.y, mount.side * (p.d / 2 - padT / 2));
      pieces.push(pad);
    }
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

/**
 * 外侧曲面装甲板（大腿/小腿的"体量"来源）。
 *
 * 参考图里腿的轮廓不是靠内部骨架，而是靠**外侧一整片光滑曲面装甲板**：
 * 上宽下窄（股骨）、膝细→中段鼓→踝细（胫骨）。这里按若干层轮廓放样出
 * 一条带厚度的曲面壳（flat 侧贴在骨面上，outer 侧外鼓）。
 *
 * 每层轮廓 = [x0, z0] … [x1, z0] + 一段二次贝塞尔外弧；
 * 各层的 (半宽, 外鼓量) 沿 Y 变化，就得到"上宽下窄 / 中段鼓"的渐变外形。
 */
function armorShell(
  levels: Array<{ y: number; halfW: number; bow: number }>,
  z0: number,
  thickness: number,
  xOffset = 0,
  segments = 9,
): THREE.BufferGeometry {
  const profileOf = (halfW: number, bow: number): Array<[number, number]> => {
    const pts: Array<[number, number]> = [
      [-halfW, 0],
      [halfW, 0],
    ];
    for (let i = 1; i < segments; i++) {
      const t = i / segments;
      // 二次贝塞尔：P0=(halfW,0) P1=(0,bow) P2=(-halfW,0)
      const mt = 1 - t;
      const x = mt * mt * halfW + 2 * mt * t * 0 + t * t * -halfW;
      const z = mt * mt * 0 + 2 * mt * t * bow + t * t * 0;
      pts.push([x, z]);
    }
    return pts;
  };

  const positions: number[] = [];
  const indices: number[] = [];
  const ringSize = segments + 1; // 每层轮廓点数（首尾不重复）
  const profiles = levels.map((lvl) => profileOf(lvl.halfW, lvl.bow));

  for (let li = 0; li < levels.length; li++) {
    for (const [x, z] of profiles[li]) {
      positions.push(x + xOffset, levels[li].y, z + z0); // 外表面
    }
  }
  for (let li = 0; li < levels.length; li++) {
    for (const [x, z] of profiles[li]) {
      positions.push(x + xOffset, levels[li].y, z + z0 - thickness); // 内表面
    }
  }
  const outerBase = 0;
  const innerBase = levels.length * ringSize;

  for (let li = 0; li < levels.length - 1; li++) {
    const a = outerBase + li * ringSize;
    const b = outerBase + (li + 1) * ringSize;
    for (let i = 0; i < ringSize - 1; i++) {
      indices.push(a + i, b + i, b + i + 1, a + i, b + i + 1, a + i + 1);
    }
    const c = innerBase + li * ringSize;
    const d = innerBase + (li + 1) * ringSize;
    for (let i = 0; i < ringSize - 1; i++) {
      indices.push(c + i, c + i + 1, d + i + 1, c + i, d + i + 1, d + i);
    }
  }
  // 两侧封边（flat 侧）
  for (let li = 0; li < levels.length - 1; li++) {
    const o0 = outerBase + li * ringSize;
    const o1 = outerBase + (li + 1) * ringSize;
    const i0 = innerBase + li * ringSize;
    const i1 = innerBase + (li + 1) * ringSize;
    indices.push(o0, o1, i1, o0, i1, i0);
    const o2 = o0 + ringSize - 1;
    const o3 = o1 + ringSize - 1;
    const i2 = i0 + ringSize - 1;
    const i3 = i1 + ringSize - 1;
    indices.push(o2, i2, i3, o2, i3, o3);
  }
  // 上下端盖
  for (const [li, flip] of [
    [0, true],
    [levels.length - 1, false],
  ] as Array<[number, boolean]>) {
    const o = outerBase + li * ringSize;
    const i = innerBase + li * ringSize;
    for (let k = 1; k < ringSize - 1; k++) {
      if (flip) indices.push(o, o + k + 1, o + k);
      else indices.push(o, o + k, o + k + 1);
      if (flip) indices.push(i, i + k, i + k + 1);
      else indices.push(i, i + k + 1, i + k);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** 圆盘式叉耳（膝/踝的紧凑盘组）：圆盘 + 轴承孔，不是长舌片。 */
function roundCheekGeometry(
  outerR: number,
  boreR: number,
  thickness: number,
  segments = 40,
): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, outerR, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  hole.absarc(0, 0, boreR, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: thickness - 2 * BEVEL,
    bevelEnabled: true,
    bevelThickness: BEVEL,
    bevelSize: BEVEL,
    bevelSegments: 2,
    steps: 1,
    curveSegments: segments / 4,
  });
  geometry.translate(0, 0, -(thickness - 2 * BEVEL) / 2);
  return geometry;
}

/**
 * 桁架骨段：4 根纵向角柱 + N 道横撑环 + 两端带孔端板。
 * 骨段不再是"实心光板"，而是能看穿的空间框架 —— 内部管腔与连杆从环与环之间露出来。
 *
 * bodyX：本体相对关节连线的 X 偏移（+X 前）。股四头肌前凸 / 小腿肚后凸都靠它：
 *   端板留在关节连线上（x=0，保证插销对准关节中心），本体整体前移/后移，
 *   两者之间由两根连接臂搭起来 —— 于是腿的"中心线"呈 S 形而不是一根直柱。
 * endScale：端板相对截面的缩放（<1 即关节处收细，膝盖比大腿小腿都窄）。
 */
function trussBeam(
  w: number,
  d: number,
  h: number,
  rail: number,
  ringT: number,
  ringCount: number,
  endT: number,
  holeR: number,
  cornerR: number,
  bodyX: number,
  endScale: number,
  endBottomX: number,
  endTopScale: number,
): THREE.BufferGeometry {
  const pieces: THREE.BufferGeometry[] = [];
  const halfH = h / 2;
  // 纵向角柱
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const post = bevelBoxGeometry(rail, h - endT * 2, rail, BEVEL);
      post.translate(
        bodyX + sx * (w / 2 - rail / 2),
        0,
        sz * (d / 2 - rail / 2),
      );
      pieces.push(post);
    }
  }
  // 横撑环（外廓贴住截面，内孔挖空）
  const ringOuter = roundedRectShape(w, d, cornerR);
  const ringInner = roundedRectPath(w - ringT * 2, d - ringT * 2, Math.max(cornerR - ringT, 0.002));
  ringOuter.holes.push(ringInner);
  for (let i = 0; i < ringCount; i++) {
    const y = -halfH + endT + ((i + 1) * (h - endT * 2)) / (ringCount + 1);
    const ring = new THREE.ExtrudeGeometry(ringOuter, {
      depth: ringT - 2 * BEVEL,
      bevelEnabled: true,
      bevelThickness: BEVEL,
      bevelSize: BEVEL,
      bevelSegments: 1,
      steps: 1,
      curveSegments: 6,
    });
    ring.translate(0, 0, -(ringT - 2 * BEVEL) / 2);
    ring.rotateX(-Math.PI / 2);
    ring.translate(bodyX, y, 0);
    pieces.push(ring);
  }
  // 端板：带圆孔，给关节盘插销当插座（留在关节连线上）
  for (const sy of [-1, 1]) {
    const scale = sy < 0 ? endScale : endTopScale;
    const plate = roundedRectShape(
      w * scale,
      d * scale,
      Math.max(cornerR * scale, 0.004),
    );
    if (holeR > 0) {
      const hole = new THREE.Path();
      hole.absarc(0, 0, holeR, 0, Math.PI * 2, true);
      plate.holes.push(hole);
    }
    const geometry = new THREE.ExtrudeGeometry(plate, {
      depth: endT - 2 * BEVEL,
      bevelEnabled: true,
      bevelThickness: BEVEL,
      bevelSize: BEVEL,
      bevelSegments: 1,
      steps: 1,
      curveSegments: 6,
    });
    geometry.translate(0, 0, -(endT - 2 * BEVEL) / 2);
    geometry.rotateX(-Math.PI / 2);
    // 下端端板跟着下关节中心走（关节中心可以不在 x=0）
    const endX = sy < 0 ? endBottomX : 0;
    geometry.translate(endX, sy * (halfH - endT / 2), 0);
    pieces.push(geometry);
  }
  // 端板 ↔ 本体 的连接臂（本体偏移时才有）——双耳板，厚度与端板齐平（不侵入关节盘空间）
  if (Math.abs(bodyX) > 0.005) {
    for (const sy of [-1, 1]) {
      const endX = sy < 0 ? endBottomX : 0;
      const span = Math.abs(bodyX - endX);
      for (const sz of [-1, 1]) {
        const arm = bevelBoxGeometry(span + 0.02, endT * 0.8, 0.024, BEVEL);
        arm.translate((bodyX + endX) / 2, sy * (halfH - endT / 2), sz * (d / 2 - 0.012));
        pieces.push(arm);
      }
    }
  }
  return mergeGeometries(pieces);
}

/**
 * 开放框板：矩形外廓挖一个大孔（局部 +Y = 板厚方向）。
 * 用来做「局部护板 / 骨盆框板」——不是整块壳，是能看穿内部的框。
 */
interface FrameKitParams {
  w: number;
  d: number;
  t: number;
  holeW: number;
  holeD: number;
  corner: number;
  /** 孔心偏移（X / Z），让框板一侧留出实心安装区 */
  holeX?: number;
  holeZ?: number;
}

function frameKit(spec: { params?: Record<string, unknown> }): THREE.BufferGeometry {
  const p = spec.params as unknown as FrameKitParams;
  const outer = roundedRectShape(p.w, p.d, p.corner);
  const band = Math.max((p.w - p.holeW) / 2, 0.002);
  const hole = roundedRectPath(p.holeW, p.holeD, Math.max(p.corner - band, 0.002));
  const holeX = p.holeX ?? 0;
  const holeZ = p.holeZ ?? 0;
  if (holeX !== 0 || holeZ !== 0) {
    // 偏移孔：把孔轮廓平移后再挖（Path 的曲线要重新描一遍）
    const moved = new THREE.Path();
    const w = p.holeW;
    const h = p.holeD;
    const r = Math.max(p.corner - band, 0.002);
    const cx = holeX;
    const cz = holeZ;
    moved.moveTo(cx - w / 2 + r, cz - h / 2);
    moved.lineTo(cx + w / 2 - r, cz - h / 2);
    moved.quadraticCurveTo(cx + w / 2, cz - h / 2, cx + w / 2, cz - h / 2 + r);
    moved.lineTo(cx + w / 2, cz + h / 2 - r);
    moved.quadraticCurveTo(cx + w / 2, cz + h / 2, cx + w / 2 - r, cz + h / 2);
    moved.lineTo(cx - w / 2 + r, cz + h / 2);
    moved.quadraticCurveTo(cx - w / 2, cz + h / 2, cx - w / 2, cz + h / 2 - r);
    moved.lineTo(cx - w / 2, cz - h / 2 + r);
    moved.quadraticCurveTo(cx - w / 2, cz - h / 2, cx - w / 2 + r, cz - h / 2);
    moved.closePath();
    outer.holes.push(moved);
  } else {
    outer.holes.push(hole);
  }
  const geometry = new THREE.ExtrudeGeometry(outer, {
    depth: p.t - 2 * BEVEL,
    bevelEnabled: true,
    bevelThickness: BEVEL,
    bevelSize: BEVEL,
    bevelSegments: 1,
    steps: 1,
    curveSegments: 8,
  });
  geometry.translate(0, 0, -(p.t - 2 * BEVEL) / 2);
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

/**
 * 单个安装凸台：盲孔沿 +Z，凸出面在 z=0（基座伸向 -Z）。
 * 骨段本体做成开放骨架后，凸台没法再"长"在光板面上，改为独立件挂上去。
 */
interface BossKitParams {
  faceR: number;
  len: number;
  boreR: number;
  boreDepth: number;
  /** 凸台轴向：+1 = 凸出面朝 +Z，-1 = 朝 -Z */
  dir?: number;
}

function bossKit(spec: { params?: Record<string, unknown> }): THREE.BufferGeometry {
  const p = spec.params as unknown as BossKitParams;
  const geometry = bossGeometry(p.faceR, p.len, p.boreR, p.boreDepth);
  // 凸出面在 z=0，基座伸向 -Z（与骨段 kit 里的凸台同一朝向）
  geometry.rotateX(Math.PI / 2);
  if ((p.dir ?? 1) < 0) geometry.rotateY(Math.PI);
  return geometry;
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
interface ArmorShellParams {
  /** 每层：y 高度 / 半宽 / 外鼓量 */
  levels: Array<{ y: number; halfW: number; bow: number }>;
  /** flat 侧所在的 Z（贴在骨面外侧） */
  z0: number;
  /** 板厚 */
  thickness: number;
  /** 轮廓沿 X 的偏移（让开安装凸台） */
  xOffset?: number;
  /** 支撑柱：把装甲板撑在骨面外（避开安装凸台） */
  posts?: Array<{ x: number; y: number; r: number; from: number; to: number }>;
}

function armorShellKit(spec: { params?: Record<string, unknown> }): THREE.BufferGeometry {
  const p = spec.params as unknown as ArmorShellParams;
  const pieces: THREE.BufferGeometry[] = [
    armorShell(p.levels, p.z0, p.thickness, p.xOffset ?? 0),
  ];
  for (const post of p.posts ?? []) {
    const length = post.to - post.from;
    if (length <= 0) continue;
    const geometry = cylinderGeometry(post.r, length, 12);
    geometry.rotateX(Math.PI / 2);
    geometry.translate(post.x, post.y, post.from + length / 2);
    pieces.push(geometry);
  }
  return mergeGeometries(pieces);
}

interface RoundCheekParams {
  outerR: number;
  boreR: number;
  thickness: number;
}

function roundCheekKit(spec: { params?: Record<string, unknown> }): THREE.BufferGeometry {
  const p = spec.params as unknown as RoundCheekParams;
  return roundCheekGeometry(p.outerR, p.boreR, p.thickness);
}

export const t800Builders: Record<string, GeometryBuilder> = {
  t800ArmorShell: armorShellKit as GeometryBuilder,
  t800Bone: boneKit as GeometryBuilder,
  t800Boss: bossKit as GeometryBuilder,
  t800Cheek: cheekKit as GeometryBuilder,
  t800Frame: frameKit as GeometryBuilder,
  t800JointDisc: jointDiscKit as GeometryBuilder,
  t800Eye: eyeKit as GeometryBuilder,
  t800RoundCheek: roundCheekKit as GeometryBuilder,
};
