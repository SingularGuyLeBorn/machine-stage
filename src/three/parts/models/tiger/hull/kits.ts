import * as THREE from "three";
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

export const tigerHullKitBuilders: Record<string, GeometryBuilder> = {
  hullPlate,
};
