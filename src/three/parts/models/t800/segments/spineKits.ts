import * as THREE from "three";
import type { GeometryBuilder } from "../../../assembler/geometry";
import { bevelBoxGeometry, cylinderGeometry, mergeGeometries } from "../../../kernel/geometry";

// ============================================================================
// t800/segments/spineKits —— 脊柱 / 胸廓的专用几何构造器
//
// 坐标约定（整机）：+X = 前（面朝方向）、+Y = 上、+Z = 右。
// 躯干的"前后"因此是 X 轴，"左右"是 Z 轴 —— 与腿的坐标一致。
//
// 参考图读法：
//   · 脊柱是一条**逐节可见**的机械柱：每节 = 椎体 + 椎弓 + 向后翘的棘突，
//     节与节之间夹一枚深色椎间盘（弹性段）。
//   · 肋骨是 12 对**从前向后包住胸腔**的弧形细管，围成开口的笼子。
//   · 胸骨是一块前正中竖板，把左右肋弓收口。
// ============================================================================

const BEVEL = 0.0012;

/** 沿参数曲线扫出的圆管（肋骨 / 锁骨 / 椎弓都用它）。 */
function sweepTube(
  points: THREE.Vector3[],
  radius: number,
  radiusEnd = radius,
  segments = 40,
  radialSegments = 8,
): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points, false, "centripetal", 0.5);
  const geometry = new THREE.TubeGeometry(curve, segments, radius, radialSegments, false);
  // 末端收细：把半径按参数缩放（TubeGeometry 不支持变半径，手工缩放顶点）
  const position = geometry.getAttribute("position");
  const vertex = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    const ring = Math.floor(i / (radialSegments + 1));
    const t = ring / segments;
    const scale = 1 + (radiusEnd / radius - 1) * t;
    vertex.fromBufferAttribute(position, i);
    const center = curve.getPointAt(Math.min(t, 1));
    vertex.sub(center).multiplyScalar(scale).add(center);
    position.setXYZ(i, vertex.x, vertex.y, vertex.z);
  }
  geometry.computeVertexNormals();
  return geometry;
}

/** 一节椎骨：椎体（圆柱）+ 椎弓（向后环）+ 棘突（向后翘的斜板）。 */
export function vertebraGeometry(spec: { params?: Record<string, unknown> }): THREE.BufferGeometry {
  const params = spec.params as unknown as {
  /** 椎体高 */
  h: number;
  /** 椎体半径 */
  r: number;
  /** 椎弓的半宽（左右） */
  archW: number;
  /** 棘突向后伸出的长度 */
  spinous: number;
  /** 棘突下倾角（度） */
  spinousTilt: number;
  /** 横突（侧向伸出的挂点） */
  transverse: number;
};
  return vertebraBody(params);
}

function vertebraBody(params: {
  /** 椎体高 */
  h: number;
  /** 椎体半径 */
  r: number;
  /** 椎弓的半宽（左右） */
  archW: number;
  /** 棘突向后伸出的长度 */
  spinous: number;
  /** 棘突下倾角（度） */
  spinousTilt: number;
  /** 横突（侧向伸出的挂点，肋骨与竖脊肌挂它） */
  transverse: number;
}): THREE.BufferGeometry {
  const pieces: THREE.BufferGeometry[] = [];
  // 椎体：上下带倒角的短圆柱
  const body = cylinderGeometry(params.r, params.h, params.r, 20, BEVEL);
  pieces.push(body);
  // 椎弓：绕椎体后侧的半环（水平面内，从后到两侧）
  const arch = sweepTube(
    [
      new THREE.Vector3(-params.r * 0.55, 0, -params.archW),
      new THREE.Vector3(-params.r * 1.05, 0, 0),
      new THREE.Vector3(-params.r * 0.55, 0, params.archW),
    ],
    params.r * 0.2,
    params.r * 0.2,
    20,
    7,
  );
  pieces.push(arch);
  // 棘突：向后下方斜插的扁条（指向 -X = 背侧）
  const tilt = (params.spinousTilt * Math.PI) / 180;
  const spine = bevelBoxGeometry(params.spinous, params.r * 0.3, params.r * 0.38, BEVEL);
  spine.rotateY(tilt);
  spine.translate(-params.r * 0.85 - params.spinous * 0.36, 0, 0);
  pieces.push(spine);
  // 横突：左右各一根侧向短柱（与椎体一体，肋根与竖脊肌挂在它上面）
  for (const side of [-1, 1]) {
    const pin = cylinderGeometry(params.r * 0.2, params.transverse, params.r * 0.2, 12, BEVEL);
    pin.rotateX((Math.PI / 2) * side);
    pin.translate(0, 0, side * (params.r + params.transverse * 0.42));
    pieces.push(pin);
  }
  return mergeGeometries(pieces);
}

/** 椎间盘：一枚薄壁弹性环（比椎体略小，深色橡胶）。 */
export function discGeometry(spec: { params?: Record<string, unknown> }): THREE.BufferGeometry {
  const params = spec.params as unknown as { h: number; r: number };
  return cylinderGeometry(params.r, params.h, params.r, 20, BEVEL);
}

/**
 * 一根肋骨：从椎骨横突外端起步，绕着胸腔侧面向前包，收口于胸骨。
 *
 * 路径用显式控制点（Catmull-Rom 插值）：横突外端 → 后外侧 → 最宽处 → 前外侧 → 胸骨边缘。
 * 起点刻意与横突留 2.5mm 间隙：既不互咬，又在「真实表面距离」判据里算有支撑。
 */
export function ribGeometry(spec: { params?: Record<string, unknown> }): THREE.BufferGeometry {
  const params = spec.params as unknown as {
  /** 肋根位置（Z，相对椎骨）：横突外端再往外一点 */
  rootZ: number;
  /** 胸腔半宽（Z） */
  rz: number;
  /** 肋骨前端的前后位置（X，相对椎骨）：收口到胸骨 */
  xEnd: number;
  /** 起步向后兜多少（X，负值） */
  back?: number;
  /** 管半径 */
  r: number;
  /** 末端半径（收细） */
  rEnd?: number;
  /** 向下包覆的落差 */
  drop: number;
  /** 前端收口处的 z（相邻肋错开） */
  frontZ?: number;
};
  return ribBody(params);
}

function ribBody(params: {
  rootZ: number;
  rz: number;
  xEnd: number;
  back?: number;
  r: number;
  rEnd?: number;
  drop: number;
  frontZ?: number;
}): THREE.BufferGeometry {
  const back = params.back ?? 0.022;
  const points = [
    new THREE.Vector3(0, 0, params.rootZ),
    new THREE.Vector3(-back * 0.55, -params.drop * 0.12, params.rz * 0.6),
    new THREE.Vector3(params.xEnd * 0.1, -params.drop * 0.42, params.rz),
    new THREE.Vector3(params.xEnd * 0.52, -params.drop * 0.74, params.rz * 0.62),
    new THREE.Vector3(params.xEnd, -params.drop, params.frontZ ?? 0.014),
  ];
  return sweepTube(points, params.r, params.rEnd ?? params.r * 0.8, 44, 8);
}

/** 锁骨：从胸骨上端绕到肩窝的 S 形细管。 */
export function clavicleGeometry(spec: { params?: Record<string, unknown> }): THREE.BufferGeometry {
  const params = spec.params as unknown as {
  /** 肩窝一侧（z 的符号） */
  side: number;
  /** 胸骨端 x */
  xFront: number;
  /** 肩端 x */
  xBack: number;
  /** 肩端 z */
  z: number;
  /** 胸骨端 z（左右两根要错开） */
  frontZ?: number;
  r: number;
};
  return clavicleBody(params);
}

function clavicleBody(params: {
  side: number;
  xFront: number;
  xBack: number;
  z: number;
  frontZ?: number;
  r: number;
}): THREE.BufferGeometry {
  const s = params.side;
  const points = [
    new THREE.Vector3(params.xFront, 0, s * (params.frontZ ?? 0.012)),
    new THREE.Vector3(params.xFront - 0.02, 0.012, s * 0.05),
    new THREE.Vector3(params.xBack + 0.03, 0.016, s * 0.1),
    new THREE.Vector3(params.xBack, 0.004, s * (params.z - 0.012)),
    new THREE.Vector3(params.xBack - 0.01, -0.012, s * params.z),
  ];
  return sweepTube(points, params.r, params.r * 0.85, 30, 8);
}


/**
 * 头骨：半球形颅腔 + 前方脸平面（参考图那种"铬钢碗 + 平脸"的读法）。
 * 脸平面上挖不出洞（不做布尔），眼窝/鼻腔用独立的环形件套上去。
 */
export function skullGeometry(spec: { params?: Record<string, unknown> }): THREE.BufferGeometry {
  const p = spec.params as unknown as {
    r: number;
    faceDepth: number;
    faceWidth: number;
    jawDrop: number;
  };
  const pieces: THREE.BufferGeometry[] = [];
  // 颅腔：压扁的球（前后略扁）
  const dome = new THREE.SphereGeometry(p.r, 28, 20);
  dome.scale(1, 1.04, 0.92);
  dome.translate(0, 0, 0);
  pieces.push(dome);
  // 脸：往前伸的斜面块（额头到下巴的一整片）
  const face = bevelBoxGeometry(p.faceWidth, p.faceDepth + p.jawDrop, p.faceWidth * 0.92, 0.004);
  face.rotateZ(-8);
  face.translate(p.r * 0.52, -p.faceDepth * 0.28, 0);
  pieces.push(face);
  // 颈部接口
  const neck = cylinderGeometry(p.r * 0.32, 0.022, p.r * 0.32, 16, 0.0015);
  neck.translate(0, -p.r * 0.98, 0);
  pieces.push(neck);
  return mergeGeometries(pieces);
}

/** 下颌：U 形骨（沿 z 开口的弧形条 + 前端下巴）。 */
export function jawGeometry(spec: { params?: Record<string, unknown> }): THREE.BufferGeometry {
  const p = spec.params as unknown as { r: number; width: number; length: number };
  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    const a = (t - 0.5) * 2.1;
    points.push(new THREE.Vector3(p.length * 0.5 * Math.cos(a), Math.sin(a) * 0.012, p.width * 0.5 * Math.sin(a)));
  }
  const arc = sweepTube(points, p.r * 0.42, p.r * 0.42, 26, 8);
  const chin = bevelBoxGeometry(p.length * 0.28, p.r * 0.7, p.width * 0.34, 0.003);
  chin.translate(p.length * 0.5 - p.length * 0.1, -p.r * 0.16, 0);
  return mergeGeometries([arc, chin]);
}

export const t800HeadBuilders: Record<string, GeometryBuilder> = {
  t800Skull: skullGeometry as unknown as GeometryBuilder,
  t800Jaw: jawGeometry as unknown as GeometryBuilder,
};

export const t800SpineBuilders: Record<string, GeometryBuilder> = {
  t800Vertebra: vertebraGeometry as unknown as GeometryBuilder,
  t800Disc: discGeometry as unknown as GeometryBuilder,
  t800Rib: ribGeometry as unknown as GeometryBuilder,
  t800Clavicle: clavicleGeometry as unknown as GeometryBuilder,
};
