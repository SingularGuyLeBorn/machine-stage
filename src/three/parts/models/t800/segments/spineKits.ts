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
  const curve = new THREE.CatmullRomCurve3(points, false, "catmullrom", 0.4);
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
}): THREE.BufferGeometry {
  const pieces: THREE.BufferGeometry[] = [];
  // 椎体：上下带倒角的短圆柱
  const body = cylinderGeometry(params.r, params.h, params.r, 20, BEVEL);
  pieces.push(body);
  // 椎弓：绕椎体后侧的半环（水平面内，从后到两侧）
  const arch = sweepTube(
    [
      new THREE.Vector3(-params.r * 0.55, params.h * 0.3, -params.archW),
      new THREE.Vector3(-params.r * 1.05, params.h * 0.34, 0),
      new THREE.Vector3(-params.r * 0.55, params.h * 0.3, params.archW),
    ],
    params.r * 0.4,
    params.r * 0.4,
    20,
    7,
  );
  pieces.push(arch);
  // 棘突：向后下方斜插的扁条（指向 -X = 背侧）
  const tilt = (params.spinousTilt * Math.PI) / 180;
  const spine = bevelBoxGeometry(params.spinous, params.r * 0.85, params.r * 0.45, BEVEL);
  spine.rotateY(tilt);
  spine.translate(-params.r * 0.85 - params.spinous * 0.36, params.h * 0.1, 0);
  pieces.push(spine);
  return mergeGeometries(pieces);
}

/** 椎间盘：一枚薄壁弹性环（比椎体略小，深色橡胶）。 */
export function discGeometry(spec: { params?: Record<string, unknown> }): THREE.BufferGeometry {
  const params = spec.params as unknown as { h: number; r: number };
  return cylinderGeometry(params.r, params.h, params.r, 20, BEVEL);
}

/**
 * 一根肋骨：从脊柱后侧出发，绕着胸腔侧面向前包，收口于胸骨。
 * 参数化：绕 Y 轴的椭圆弧（x = 前，z = 右）。
 */
export function ribGeometry(spec: { params?: Record<string, unknown> }): THREE.BufferGeometry {
  const params = spec.params as unknown as {
  /** 肋骨所在高度（局部原点） */
  /** 椭圆前后半径（X） */
  rx: number;
  /** 肋根的前后位置（X，相对椎骨）：压在椎弓外侧 */
  rootX?: number;
  /** 肋骨前端的前后位置（X，相对椎骨）：收口到胸骨 */
  xEnd?: number;
  /** 椭圆左右半径（Z） */
  rz: number;
  /** 从脊柱后方开始的角度（度，0 = 正前，-90 = 右侧） */
  startDeg: number;
  /** 绕到胸骨的角度（度） */
  endDeg: number;
  /** 管半径 */
  r: number;
  /** 末端半径（收细） */
  rEnd?: number;
  /** 向下包覆的落差 */
  drop: number;
};
  return ribBody(params);
}

function ribBody(params: {
  rx: number;
  rootX?: number;
  xEnd?: number;
  rz: number;
  startDeg: number;
  endDeg: number;
  r: number;
  rEnd?: number;
  drop: number;
}): THREE.BufferGeometry {
  const start = (params.startDeg * Math.PI) / 180;
  const end = (params.endDeg * Math.PI) / 180;
  const steps = 14;
  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = start + (end - start) * t;
    const x0 = params.rootX ?? -params.rx;
    const x1 = params.xEnd ?? params.rx;
    const x = x0 + (x1 - x0) * (1 - Math.cos(a)) / 2;
    const z = Math.sin(a) * params.rz;
    // 弧线越往前越往下（肋弓的斜率）
    const y = -params.drop * Math.pow(t, 1.6);
    points.push(new THREE.Vector3(x, y, z));
  }
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
  r: number;
};
  return clavicleBody(params);
}

function clavicleBody(params: {
  side: number;
  xFront: number;
  xBack: number;
  z: number;
  r: number;
}): THREE.BufferGeometry {
  const s = params.side;
  const points = [
    new THREE.Vector3(params.xFront, 0, s * 0.012),
    new THREE.Vector3(params.xFront - 0.02, 0.012, s * 0.05),
    new THREE.Vector3(params.xBack + 0.03, 0.016, s * 0.1),
    new THREE.Vector3(params.xBack, 0.004, s * (params.z - 0.012)),
    new THREE.Vector3(params.xBack - 0.01, -0.012, s * params.z),
  ];
  return sweepTube(points, params.r, params.r * 0.85, 30, 8);
}

export const t800SpineBuilders: Record<string, GeometryBuilder> = {
  t800Vertebra: vertebraGeometry as unknown as GeometryBuilder,
  t800Disc: discGeometry as unknown as GeometryBuilder,
  t800Rib: ribGeometry as unknown as GeometryBuilder,
  t800Clavicle: clavicleGeometry as unknown as GeometryBuilder,
};
