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

export const tigerInteriorKitBuilders: Record<string, GeometryBuilder> = {
  steeringWheel,
  bowMg,
  basketRail,
};
