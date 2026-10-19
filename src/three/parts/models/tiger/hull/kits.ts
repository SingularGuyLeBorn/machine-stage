import * as THREE from "three";
import { bevelBoxGeometry, cylinderGeometry, mergeGeometries } from "../../../kernel/geometry";
import type { GeometryBuilder } from "../../../assembler/geometry";

// ============================================================================
// models/tiger/hull/kits —— 车体外壳专用几何构造器（L4 第一批）
//
// 一个 kit：
//   hullPlate   矩形装甲板（平面 XY、厚度沿 Z），可带若干圆形开孔（机枪球孔 / 侧传动轴过孔 /
//               传动轴隔板孔）与矩形开孔（舱盖口 / 潜望镜窗）。开孔用 THREE.Shape.holes 挤出，
//               倒角沿用项目口径（板厚的 5%，上限 3mm）——与 kernel.polygonExtrudeGeometry 的微倒角一致。
//
// 局部系约定：板面在 XY 平面、厚度 ±t/2 沿 Z；装配位负责旋转/平移（前板、隔板绕 Y 转 90°
// 后厚度方向即车体 X 轴）。
// ============================================================================

type Params = Record<string, unknown>;

function num(params: Params | undefined, key: string, fallback?: number): number {
  const value = params?.[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (fallback !== undefined) return fallback;
  throw new Error(`hull kit：参数 "${key}" 必须是数值（收到 ${String(value)}）`);
}

function holesOf(params: Params | undefined): Array<[number, number, number]> {
  const raw = params?.holes;
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) throw new Error("hull kit：holes 必须是 [x, y, r] 数组的数组");
  return raw.map((entry, i) => {
    if (!Array.isArray(entry) || entry.length !== 3) {
      throw new Error(`hull kit：holes[${i}] 必须是 [x, y, r]`);
    }
    return [Number(entry[0]), Number(entry[1]), Number(entry[2])] as [number, number, number];
  });
}

function rectsOf(params: Params | undefined): Array<[number, number, number, number]> {
  const raw = params?.rects;
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) throw new Error("hull kit：rects 必须是 [x, y, w, h] 数组的数组");
  return raw.map((entry, i) => {
    if (!Array.isArray(entry) || entry.length !== 4) {
      throw new Error(`hull kit：rects[${i}] 必须是 [x, y, w, h]`);
    }
    return [Number(entry[0]), Number(entry[1]), Number(entry[2]), Number(entry[3])] as [
      number,
      number,
      number,
      number,
    ];
  });
}

const hullPlate: GeometryBuilder = (spec) => {
  const params = (spec as { params?: Params }).params;
  const w = num(params, "w");
  const h = num(params, "h");
  const t = num(params, "t", 0.06);
  const bevel = num(params, "bevel", 0.003);
  const holes = holesOf(params);
  const rects = rectsOf(params);

  // THREE.ExtrudeGeometry 的倒角是「向外扩」的：外轮廓先内缩 b、孔洞先放大 b、厚度先减 2b，
  // 倒角补回来之后外廓才精确等于 w × h × t，孔洞名义直径也才精确等于 2r / (rw × rh)。
  const b = Math.max(Math.min(bevel, t * 0.3, w * 0.1, h * 0.1), 0.0004);
  const hw = w / 2 - b;
  const hh = h / 2 - b;
  const shape = new THREE.Shape();
  shape.moveTo(-hw, -hh);
  shape.lineTo(hw, -hh);
  shape.lineTo(hw, hh);
  shape.lineTo(-hw, hh);
  shape.closePath();

  for (const [x, y, r] of holes) {
    if (r <= 0) throw new Error(`hull kit：开孔半径必须为正（收到 ${r}）`);
    const path = new THREE.Path();
    path.absarc(x, y, r + b, 0, Math.PI * 2, true);
    shape.holes.push(path);
  }

  for (const [x, y, rw, rh] of rects) {
    if (rw <= 0 || rh <= 0) throw new Error(`hull kit：矩形开孔尺寸必须为正（收到 ${rw} × ${rh}）`);
    const ex = rw / 2 + b;
    const ey = rh / 2 + b;
    const path = new THREE.Path();
    path.moveTo(x - ex, y - ey);
    path.lineTo(x - ex, y + ey);
    path.lineTo(x + ex, y + ey);
    path.lineTo(x + ex, y - ey);
    path.closePath();
    shape.holes.push(path);
  }

  const inner = Math.max(t - 2 * b, 0.001);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: inner,
    bevelEnabled: true,
    bevelThickness: b,
    bevelSize: b,
    bevelSegments: 1,
    steps: 1,
    curveSegments: 28,
  });
  geometry.translate(0, 0, -inner / 2);
  geometry.computeVertexNormals();
  return geometry;
};

const hexBolt: GeometryBuilder = (spec) => {
  const params = (spec as { params?: Params }).params;
  const r = num(params, "r", 0.012);
  const h = num(params, "h", 0.01);
  const head = cylinderGeometry(r, h, r * 0.88, 6, Math.min(0.0015, h * 0.2));
  head.translate(0, h / 2, 0);
  return head;
};

// ============================================================================
// L4-d 起补充的四个 kit：舱盖盖板 / 窗框 / 驾驶员观察窗 / 六角螺栓头
// ============================================================================

/**
 * 舱盖盖板（打开姿态）：铰链线在局部原点、沿 Z；盖板向 +X 伸展（r = 盖板半径）。
 * 装配位给 rotation [0,0,95] —— 铰链在舱口前缘、盖板立起前倾 5°。
 * 含：盖板圆盘 + 隆起 + 铰链节（在铰链线上方，最低点刚好在局部 y = 0）+ 把手 + 锁扣舌。
 */
const hatchLid: GeometryBuilder = (spec) => {
  const params = (spec as { params?: Params }).params;
  const r = num(params, "r", 0.215);
  const t = num(params, "t", 0.022);

  const parts: THREE.BufferGeometry[] = [];

  const disc = cylinderGeometry(r, t, r, 40, 0.004);
  disc.translate(r, 0, 0);
  parts.push(disc);

  const dome = cylinderGeometry(r * 0.84, 0.012, r * 0.88, 32, 0.003);
  dome.translate(r, t / 2 + 0.006, 0);
  parts.push(dome);

  // 铰链：节圆筒 + 叶片完全落在盖板平面之外（局部 x ≥ 5mm）——盖板立起 90° 后
  // 「世界 y = 局部 x」，所以 x ≥ 5mm 保证整块铰链在甲板面上方 5mm 以上、不碰顶甲板。
  const knuckle = cylinderGeometry(0.015, 0.14, 0.015, 20, 0.002);
  knuckle.rotateX(Math.PI / 2);
  knuckle.translate(0.02, 0.026, 0);
  parts.push(knuckle);
  const leaf = bevelBoxGeometry(0.05, 0.05, 0.12, 0.003, 2);
  leaf.translate(0.03, 0.03, 0);
  parts.push(leaf);

  // 把手：两根立柱 + 横杆（在盖板外表面）
  for (const z of [-0.06, 0.06]) {
    const post = bevelBoxGeometry(0.018, 0.03, 0.018, 0.002, 1);
    post.translate(r, t / 2 + 0.015, z);
    parts.push(post);
  }
  const bar = bevelBoxGeometry(0.022, 0.02, 0.15, 0.003, 2);
  bar.translate(r, t / 2 + 0.032, 0);
  parts.push(bar);

  // 锁扣舌：远离铰链的一端
  const latch = bevelBoxGeometry(0.05, 0.02, 0.08, 0.003, 2);
  latch.translate(2 * r - 0.02, 0, 0);
  parts.push(latch);

  const merged = mergeGeometries(parts);
  for (const item of parts) item.dispose();
  return merged;
};

/** 矩形窗框：外廓 wo × ho、内口 wi × hi、高 t（几何以 y = 0 为中面）。 */
const rectBezel: GeometryBuilder = (spec) => {
  const params = (spec as { params?: Params }).params;
  const wo = num(params, "wo");
  const ho = num(params, "ho");
  const wi = num(params, "wi");
  const hi = num(params, "hi");
  const t = num(params, "t", 0.008);
  const railX = (wo - wi) / 2;
  const railZ = (ho - hi) / 2;
  if (railX <= 0 || railZ <= 0 || t <= 0) {
    throw new Error(`hull kit：窗框尺寸非法（${wo}×${ho} / 内口 ${wi}×${hi}）`);
  }

  const parts: THREE.BufferGeometry[] = [];
  const bevel = Math.min(0.002, t * 0.25);
  for (const sx of [-1, 1]) {
    const rail = bevelBoxGeometry(railX, t, ho, bevel, 1);
    rail.translate(sx * (wi / 2 + railX / 2), 0, 0);
    parts.push(rail);
  }
  for (const sz of [-1, 1]) {
    const rail = bevelBoxGeometry(wi, t, railZ, bevel, 1);
    rail.translate(0, 0, sz * (hi / 2 + railZ / 2));
    parts.push(rail);
  }

  const merged = mergeGeometries(parts);
  for (const item of parts) item.dispose();
  return merged;
};

/** 驾驶员观察窗（Fahrersehklappe）：装甲块 + 上部压条 + 下部遮光檐（均凸出车体前方 -X）。 */
const visorPlate: GeometryBuilder = (spec) => {
  const params = (spec as { params?: Params }).params;
  const w = num(params, "w", 0.035);
  const h = num(params, "h", 0.16);
  const d = num(params, "d", 0.36);

  const parts: THREE.BufferGeometry[] = [];

  const block = bevelBoxGeometry(w, h, d, 0.004, 2);
  parts.push(block);

  const rib = bevelBoxGeometry(0.012, 0.024, d * 0.92, 0.003, 1);
  rib.translate(-(w / 2 + 0.004), h * 0.16, 0);
  parts.push(rib);

  const brow = bevelBoxGeometry(0.03, 0.02, d * 0.9, 0.003, 1);
  brow.translate(-(w / 2 + 0.015), -h * 0.3, 0);
  parts.push(brow);

  const merged = mergeGeometries(parts);
  for (const item of parts) item.dispose();
  return merged;
};

export const tigerHullKitBuilders: Record<string, GeometryBuilder> = {
  hullPlate,
  hatchLid,
  rectBezel,
  visorPlate,
  hexBolt,
};
