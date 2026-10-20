import * as THREE from "three";
import { bevelBoxGeometry, cylinderGeometry, mergeGeometries } from "../../../kernel/geometry";
import type { GeometryBuilder } from "../../../assembler/geometry";

// ============================================================================
// models/tiger/interior/kits —— 车内内饰专用几何构造器（L3 第一批）
//
// 两个 kit：
//   steeringWheel  方向盘（轮缘旋转体 + 3 辐条 + 轮毂 + 转向轴头）
//   bowMg          航向机枪机匣组（机匣 + 枪管 + 枪管套 + 后板 + 托肩），枪口朝 -X
//
// 局部系约定：方向盘轮缘在 XZ 平面、轴向 +Y（装配位给 rotZ(-12°) 让盘面后倾）；
// 机枪沿 X 建模（枪口 -X），装配位只平移。
// ============================================================================

type Params = Record<string, unknown>;

function num(params: Params | undefined, key: string, fallback?: number): number {
  const value = params?.[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (fallback !== undefined) return fallback;
  throw new Error(`interior kit：参数 "${key}" 必须是数值（收到 ${String(value)}）`);
}

function box(
  list: THREE.BufferGeometry[],
  w: number,
  h: number,
  d: number,
  at: [number, number, number],
  bevel = 0.004,
) {
  const geometry = bevelBoxGeometry(w, h, d, bevel);
  geometry.translate(at[0], at[1], at[2]);
  list.push(geometry);
}

// ---------------------------------------------------------------------------
// 方向盘：φ380 轮缘 + 3 辐条 + 轮毂 + 轴头（轴向 +Y，盘面 XZ）
// ---------------------------------------------------------------------------
const steeringWheel: GeometryBuilder = (spec) => {
  const params = (spec as { params?: Params }).params;
  const rimR = num(params, "rimR", 0.19);
  const rimW = num(params, "rimW", 0.026);
  const hubR = num(params, "hubR", 0.045);
  const shaftR = num(params, "shaftR", 0.026);
  const shaftH = num(params, "shaftH", 0.1);

  const parts: THREE.BufferGeometry[] = [];

  // 轮缘：矩形截面绕 Y 旋转（截面 rimW × rimW）
  const half = rimW / 2;
  const rim = new THREE.LatheGeometry(
    [
      new THREE.Vector2(rimR - half, -half),
      new THREE.Vector2(rimR + half, -half),
      new THREE.Vector2(rimR + half, half),
      new THREE.Vector2(rimR - half, half),
      new THREE.Vector2(rimR - half, -half),
    ],
    48,
  );
  parts.push(rim);

  // 3 根辐条（绕 Y 均布）
  const len = rimR - hubR;
  for (let i = 0; i < 3; i++) {
    const spoke = bevelBoxGeometry(len, 0.022, rimW + 0.002, 0.003);
    spoke.translate(hubR + len / 2, 0, 0);
    spoke.rotateY((i * Math.PI * 2) / 3);
    parts.push(spoke);
  }

  // 轮毂 + 喇叭按钮 + 轴头
  parts.push(cylinderGeometry(hubR, 0.05, hubR, 28, 0.003));
  parts.push(cylinderGeometry(0.03, 0.012, 0.03, 22, 0.002).translate(0, 0.03, 0));
  const shaft = cylinderGeometry(shaftR, shaftH, shaftR, 20, 0.002);
  shaft.translate(0, -0.005 - shaftH / 2, 0);
  parts.push(shaft);

  return mergeGeometries(parts);
};

// ---------------------------------------------------------------------------
// 航向机枪（MG 34 机匣段）：机匣 + 枪管 + 枪管套 + 后板 + 托肩，枪口朝 -X
// ---------------------------------------------------------------------------
const bowMg: GeometryBuilder = (spec) => {
  const params = (spec as { params?: Params }).params;
  const receiverL = num(params, "receiverL", 0.32);
  const receiverH = num(params, "receiverH", 0.1);
  const receiverW = num(params, "receiverW", 0.09);
  const barrelL = num(params, "barrelL", 0.42);
  const barrelR = num(params, "barrelR", 0.022);

  const parts: THREE.BufferGeometry[] = [];

  // 机匣
  box(parts, receiverL, receiverH, receiverW, [0, 0, 0], 0.006);
  // 机匣顶部的供弹盖
  box(parts, 0.16, 0.022, receiverW - 0.01, [-0.02, receiverH / 2 - 0.006, 0], 0.004);

  // 枪管（Y 向圆柱转 90° → 沿 X，伸向 -X）
  const barrel = cylinderGeometry(barrelR, barrelL, barrelR, 18, 0.002);
  barrel.rotateZ(Math.PI / 2);
  const barrelX = -receiverL / 2 - barrelL / 2 + 0.01;
  barrel.translate(barrelX, 0.004, 0);
  parts.push(barrel);

  // 枪管套（机匣前方的散热套）
  const jacket = cylinderGeometry(0.032, 0.1, 0.032, 20, 0.002);
  jacket.rotateZ(Math.PI / 2);
  jacket.translate(-receiverL / 2 - 0.045, 0.004, 0);
  parts.push(jacket);

  // 准星（落在枪管裸露段顶部；偏移量按「距枪口 0.11」给，避免落到首装甲板厚度区内）
  box(parts, 0.022, 0.05, 0.012, [-receiverL / 2 - barrelL + 0.12, 0.045, 0], 0.002);
  // 后板（机匣后端）
  box(parts, 0.02, receiverH + 0.01, receiverW - 0.004, [receiverL / 2 + 0.01, 0, 0], 0.003);
  // 托肩
  box(parts, 0.1, 0.025, 0.06, [receiverL / 2 + 0.07, -0.012, 0], 0.004);
  // 扳机握把
  box(parts, 0.03, 0.06, 0.034, [receiverL / 2 - 0.03, -0.065, 0], 0.004);

  return mergeGeometries(parts);
};

// ---------------------------------------------------------------------------
// 吊篮护栏（Turmboden Geländer）：前方开口的环形扶手带 + 4 根立柱
// 炮塔前方是炮闩/摇架（y 1.17~1.73），整圈扶手会横穿复进机与摇架，
// 故按实车吊篮开口做成 270° 环带（开口朝前，±45°），扶手面 y 1.32。
// 局部原点 = 炮塔回转中心（x -1.65 / z 0）。
// ---------------------------------------------------------------------------
const basketRail: GeometryBuilder = (spec) => {
  const params = (spec as { params?: Params }).params;
  const rOuter = num(params, "rOuter", 0.82);
  const rInner = num(params, "rInner", 0.79);
  const h = num(params, "h", 0.03);
  const gapDeg = num(params, "gapDeg", 90);
  const gapCenterDeg = num(params, "gapCenterDeg", 180);
  const b = Math.min(0.002, h * 0.2);

  const halfGap = THREE.MathUtils.degToRad(gapDeg / 2);
  const center = THREE.MathUtils.degToRad(gapCenterDeg);
  const start = center + halfGap;
  const end = center + Math.PI * 2 - halfGap;

  const shape = new THREE.Shape();
  shape.absarc(0, 0, rOuter - b, start, end, false);
  shape.absarc(0, 0, rInner + b, end, start, true);
  shape.closePath();
  const band = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(h - 2 * b, 0.001),
    bevelEnabled: true,
    bevelThickness: b,
    bevelSize: b,
    bevelSegments: 1,
    steps: 1,
    curveSegments: 64,
  });
  band.rotateX(-Math.PI / 2); // 平面 XY → 水平 XZ，挤出 +Z → +Y
  band.translate(0, 1.305 + b, 0);

  const parts: THREE.BufferGeometry[] = [band];
  for (const deg of [135, 225, 45, 315]) {
    const a = THREE.MathUtils.degToRad(deg);
    const post = bevelBoxGeometry(0.03, 0.16, 0.03, 0.002);
    post.translate(Math.cos(a) * 0.795, 1.245, Math.sin(a) * 0.795);
    parts.push(post);
  }

  const merged = mergeGeometries(parts);
  for (const item of parts) item.dispose();
  return merged;
};

// ---------------------------------------------------------------------------
// 线束 / 软管（cableRun）：沿折线走线的多股圆管
//
// 点是**模型空间**坐标（装配位固定在原点），这样一根束子怎么绕壁、在哪里下弯
// 一眼能看懂，不用再去推零件局部系。strands > 1 时按主法向平行铺开 = 一捆电缆。
// corrugate > 0 时沿程套一圈圈波纹管环（通风软管那种），环面法线跟着切线转。
// ---------------------------------------------------------------------------
const cableRun: GeometryBuilder = (spec) => {
  const params = (spec as { params?: Params }).params;
  const raw = params?.points;
  if (!Array.isArray(raw) || raw.length < 2) {
    throw new Error("interior kit：cableRun 需要 points=[[x,y,z], …]（至少 2 点）");
  }
  const pts = (raw as number[][]).map((p) => new THREE.Vector3(p[0]!, p[1]!, p[2]!));
  const r = num(params, "r", 0.013);
  const strands = Math.max(1, Math.round(num(params, "strands", 1)));
  const pitch = num(params, "pitch", r * 2.2);
  const corrugate = num(params, "corrugate", 0);
  // 分股方向：贴壁走线的束子应当**竖着叠**（spread = Y），不是朝墙外鼓出来。
  const spreadRaw = params?.spread;
  const spread = new THREE.Vector3(
    ...(Array.isArray(spreadRaw) ? (spreadRaw as number[]) : [0, 1, 0]),
  ).normalize();
  const parts: THREE.BufferGeometry[] = [];

  const tangentAt = (list: THREE.Vector3[], i: number): THREE.Vector3 => {
    const a = list[Math.max(i - 1, 0)]!;
    const b = list[Math.min(i + 1, list.length - 1)]!;
    return b.clone().sub(a).normalize();
  };

  for (let s = 0; s < strands; s++) {
    const off = (s - (strands - 1) / 2) * pitch;
    const path = pts.map((p, i) => {
      if (strands === 1 || off === 0) return p.clone();
      // 把 spread 正交化到切线的法平面内，弯角处不会把股挤到一起
      const tan = tangentAt(pts, i);
      const dir = spread.clone().addScaledVector(tan, -spread.dot(tan));
      if (dir.lengthSq() < 1e-6) return p.clone();
      return p.clone().addScaledVector(dir.normalize(), off);
    });
    const curve = new THREE.CatmullRomCurve3(path, false, "catmullrom", 0.25);
    const length = curve.getLength();
    const segments = Math.max(12, Math.min(240, Math.round(length / (r * 0.9))));
    parts.push(new THREE.TubeGeometry(curve, segments, r, strands > 1 ? 6 : 8, false));

    if (corrugate > 0) {
      const ribs = Math.max(2, Math.round(length / corrugate));
      const ring = new THREE.Quaternion();
      for (let i = 0; i <= ribs; i++) {
        const t = i / ribs;
        const at = curve.getPointAt(t);
        const tan = curve.getTangentAt(t);
        const torus = new THREE.TorusGeometry(r * 1.28, r * 0.3, 5, 10);
        ring.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tan);
        torus.applyQuaternion(ring);
        torus.translate(at.x, at.y, at.z);
        parts.push(torus);
      }
    }
  }

  const merged = mergeGeometries(parts);
  for (const item of parts) item.dispose();
  return merged;
};

// ---------------------------------------------------------------------------
// 防滑踏板（perforatedPedal）：踏板面 + 圆孔阵列 + 吊臂 + 横轴套
// 孔是「真的没几何」而不是贴花——俯视/侧视都能读出防滑孔，且只减材料不会新增穿模。
// 局部原点 = 踏板面前缘中心，面沿 -X 向后延伸。
// ---------------------------------------------------------------------------
const perforatedPedal: GeometryBuilder = (spec) => {
  const params = (spec as { params?: Params }).params;
  const d = num(params, "d", 0.1); // 沿 X（踏板长，前后）
  const w = num(params, "w", 0.06); // 沿 Z（踏板宽，左右）
  const t = num(params, "t", 0.02);
  const holes = Math.max(0, Math.round(num(params, "holes", 6)));
  const holeR = num(params, "holeR", 0.008);
  const armH = num(params, "armH", 0.18);

  const parts: THREE.BufferGeometry[] = [];
  // 面：Shape 在 XY 平面（x = 长、y = 宽），沿 +Z 挤出厚度后 rotateX(-90°) 放平
  const shape = new THREE.Shape();
  const hd = d / 2 - 0.002;
  shape.moveTo(-hd, 0);
  shape.lineTo(hd, 0);
  shape.lineTo(hd, w - 0.004);
  shape.lineTo(-hd, w - 0.004);
  shape.closePath();
  const cols = Math.max(1, Math.round(holes / 2));
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < 2; j++) {
      if (i * 2 + j >= holes) break;
      const hole = new THREE.Path();
      hole.absarc(
        -hd / 2 + j * hd,
        ((w - 0.004) * (i + 0.6)) / (cols + 0.2),
        Math.min(holeR, hd / 2, (w - 0.004) / 3),
        0,
        Math.PI * 2,
        true,
      );
      shape.holes.push(hole);
    }
  }
  const face = new THREE.ExtrudeGeometry(shape, {
    depth: t - 0.003,
    bevelEnabled: true,
    bevelThickness: 0.0015,
    bevelSize: 0.0015,
    bevelSegments: 1,
    steps: 1,
    curveSegments: 10,
  });
  // (x, y, z) → (x, z, -y)：挤出轴变竖直向上，宽度轴落到 -Z
  face.rotateX(-Math.PI / 2);
  face.translate(0, 0, (w - 0.004) / 2);
  parts.push(face);

  // 吊臂（挂在踏板面后缘）+ 横轴套
  const arm = bevelBoxGeometry(0.028, armH, 0.028, 0.003);
  arm.translate(hd - 0.005, armH / 2, 0);
  parts.push(arm);
  const boss = cylinderGeometry(0.019, 0.05, 0.019, 16, 0.002);
  boss.rotateZ(Math.PI / 2);
  boss.translate(hd + 0.02, armH, 0);
  parts.push(boss);

  const merged = mergeGeometries(parts);
  for (const item of parts) item.dispose();
  return merged;
};

// ---------------------------------------------------------------------------
// 手轮（spokedWheel）：轮缘 + N 根辐条 + 轮毂 + 手柄销，轴向 +X（轮面在 YZ 平面）
// 炮塔手轮 / 风门手轮都用它，只是半径与辐条数不同。
// ---------------------------------------------------------------------------
const spokedWheel: GeometryBuilder = (spec) => {
  const params = (spec as { params?: Params }).params;
  const rimR = num(params, "rimR", 0.09);
  const barR = num(params, "barR", 0.008);
  const spokes = Math.max(3, Math.round(num(params, "spokes", 6)));
  const hubR = num(params, "hubR", 0.02);
  const pin = num(params, "pin", 0.03);

  const parts: THREE.BufferGeometry[] = [];
  const rim = new THREE.TorusGeometry(rimR - barR, barR, 6, 28);
  rim.rotateY(Math.PI / 2); // 环面法线 Z → X
  parts.push(rim);
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2;
    const spoke = cylinderGeometry(barR * 0.8, rimR - barR, barR * 0.8, 8, 0.001);
    spoke.rotateX(Math.PI / 2); // 轴 Y → 轴 Z（轮面内）
    spoke.rotateY(Math.PI / 2);
    spoke.translate(0, Math.cos(a) * (rimR - barR) / 2, Math.sin(a) * (rimR - barR) / 2);
    parts.push(spoke);
  }
  const hub = cylinderGeometry(hubR, hubR * 1.8, hubR, 14, 0.002);
  hub.rotateZ(Math.PI / 2);
  parts.push(hub);
  const grip = cylinderGeometry(barR * 0.9, pin, barR * 0.9, 8, 0.001);
  grip.rotateZ(Math.PI / 2);
  grip.translate(-pin / 2 - barR, 0, rimR - barR * 2);
  parts.push(grip);

  const merged = mergeGeometries(parts);
  for (const item of parts) item.dispose();
  return merged;
};

export const tigerInteriorKitBuilders: Record<string, GeometryBuilder> = {
  steeringWheel,
  bowMg,
  basketRail,
  cableRun,
  perforatedPedal,
  spokedWheel,
};
