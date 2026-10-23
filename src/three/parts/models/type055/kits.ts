import * as THREE from "three";
import type { GeometryBuilder } from "../../assembler/geometry";
import { T55, t55DeckPlan, t55HalfAt } from "./constants";

// ============================================================================
// models/type055/kits —— 055 舰体/甲板/上层建筑/阵面/螺旋桨专用几何
// 展示 1 单位 = 1 米。
// ============================================================================

const RING_YS = [T55.WATERLINE, 9.0, 11.5, T55.DECK_Y];

function hullRing(z: number, ys: number[]): THREE.Vector3[] {
  const port = ys.map((y) => new THREE.Vector3(-t55HalfAt(z, y), y, z)).reverse();
  const starboard = ys.map((y) => new THREE.Vector3(t55HalfAt(z, y), y, z));
  return [...port, ...starboard];
}

function loft(
  ys: number[],
  cap: boolean,
  heightFilter?: (y: number) => boolean,
): THREE.BufferGeometry {
  const stations = 60;
  const rings: THREE.Vector3[][] = [];
  for (let i = 0; i < stations; i++) {
    const z = T55.STERN_Z + ((T55.BOW_Z - T55.STERN_Z) * i) / (stations - 1);
    const ringYs = heightFilter ? ys.filter(heightFilter) : ys;
    rings.push(hullRing(z, ringYs));
  }
  const n = rings[0]!.length;
  const positions: number[] = [];
  const indices: number[] = [];
  for (const ring of rings) for (const p of ring) positions.push(p.x, p.y, p.z);
  for (let i = 0; i < rings.length - 1; i++) {
    for (let j = 0; j < n - 1; j++) {
      const a = i * n + j;
      const b = i * n + j + 1;
      const c = (i + 1) * n + j + 1;
      const d = (i + 1) * n + j;
      indices.push(a, b, c, a, c, d);
    }
  }
  if (cap) {
    const addCap = (ringIndex: number, forward: boolean) => {
      const ring = rings[ringIndex]!;
      const base = ringIndex * n;
      const center = new THREE.Vector3();
      for (const p of ring) center.add(p);
      center.multiplyScalar(1 / ring.length);
      const ci = positions.length / 3;
      positions.push(center.x, center.y, center.z);
      for (let j = 0; j < ring.length - 1; j++) {
        if (forward) indices.push(ci, base + j + 1, base + j);
        else indices.push(ci, base + j, base + j + 1);
      }
    };
    addCap(0, false);
    addCap(rings.length - 1, true);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** 水线以上隐身内倾外板（水线→主甲板）。 */
export const type055HullShell: GeometryBuilder = () => loft(RING_YS, true, (y) => y >= T55.WATERLINE);

/** 水线以下防污漆壳体（龙骨→水线以上 0.03 重叠）。 */
export const type055HullUnderwater: GeometryBuilder = () =>
  loft([0.4, 1.6, 3.0, 4.6, 6.0, T55.WATERLINE + 0.03], true, (y) => y <= T55.WATERLINE + 0.03);

function planShape(points: Array<[number, number]>): THREE.Shape {
  return new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(x, z)));
}

function extrudedPlan(points: Array<[number, number]>, thickness: number, topY: number): THREE.BufferGeometry {
  const geometry = new THREE.ExtrudeGeometry(planShape(points), {
    depth: thickness,
    bevelEnabled: false,
    curveSegments: 1,
    steps: 1,
  });
  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, topY, 0);
  geometry.computeVertexNormals();
  return geometry;
}

/** 主甲板：顶面 y=14.2、厚 0.35，按内倾后的甲板轮廓。 */
export const type055Deck: GeometryBuilder = () => extrudedPlan(t55DeckPlan(), 0.35, 14.2);

/** 甲板底封板：仰视不穿帮。 */
export const type055DeckUnderside: GeometryBuilder = () => extrudedPlan(t55DeckPlan(), 0.08, 13.75);

/** 四棱台（隐身内倾上层建筑/桅杆/炮塔壳体）；原点在底面中心。 */
export const type055Frustum: GeometryBuilder = (spec) => {
  const p = (spec as { params?: { w0?: number; d0?: number; w1?: number; d1?: number; h?: number } }).params ?? {};
  const w0 = (p.w0 ?? 10) / 2;
  const d0 = (p.d0 ?? 10) / 2;
  const w1 = (p.w1 ?? 8) / 2;
  const d1 = (p.d1 ?? 8) / 2;
  const h = p.h ?? 5;
  const bottom = [
    new THREE.Vector3(-w0, 0, -d0),
    new THREE.Vector3(w0, 0, -d0),
    new THREE.Vector3(w0, 0, d0),
    new THREE.Vector3(-w0, 0, d0),
  ];
  const top = [
    new THREE.Vector3(-w1, h, -d1),
    new THREE.Vector3(w1, h, -d1),
    new THREE.Vector3(w1, h, d1),
    new THREE.Vector3(-w1, h, d1),
  ];
  const positions: number[] = [];
  const indices: number[] = [];
  const push = (v: THREE.Vector3) => {
    positions.push(v.x, v.y, v.z);
    return positions.length / 3 - 1;
  };
  const b = bottom.map(push);
  const t = top.map(push);
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    indices.push(b[i]!, b[j]!, t[j]!, b[i]!, t[j]!, t[i]!);
  }
  indices.push(b[0]!, b[2]!, b[1]!, b[0]!, b[3]!, b[2]!);
  indices.push(t[0]!, t[1]!, t[2]!, t[0]!, t[2]!, t[3]!);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
};

/** 346B 阵面：底板 + 边框 + 8×8 T/R 模块阵列（1 件，几何内实例化）。 */
export const type055AesaPanel: GeometryBuilder = (spec) => {
  const p = (spec as { params?: { w?: number; h?: number } }).params ?? {};
  const w = p.w ?? 4.2;
  const h = p.h ?? 3.4;
  const tiles: THREE.BufferGeometry[] = [];
  const base = new THREE.BoxGeometry(w, h, 0.16);
  tiles.push(base);
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const tile = new THREE.BoxGeometry(w / 9.2, h / 9.2, 0.1);
      tile.translate(-w / 2 + (w * (c + 0.75)) / 8.6, -h / 2 + (h * (r + 0.75)) / 8.6, 0.12);
      tiles.push(tile);
    }
  }
  const frame = new THREE.BoxGeometry(w + 0.22, h + 0.22, 0.1);
  frame.translate(0, 0, 0.02);
  tiles.push(frame);
  const merged = merge(tiles);
  return merged;
};

function merge(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
  // 简化合并：全部转非索引后拼 position/normal/uv，避免引入额外依赖。
  const parts = geometries.map((g) => (g.index ? g.toNonIndexed() : g));
  let total = 0;
  for (const g of parts) total += g.getAttribute("position").count;
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  const uv = new Float32Array(total * 2);
  let offset = 0;
  for (const g of parts) {
    const p = g.getAttribute("position");
    const n = g.getAttribute("normal");
    const u = g.getAttribute("uv");
    pos.set(p.array as Float32Array, offset * 3);
    if (n) nor.set(n.array as Float32Array, offset * 3);
    if (u) uv.set(u.array as Float32Array, offset * 2);
    offset += p.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  out.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  out.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return out;
}

/** 五叶可调距螺旋桨：桨毂 + 5 片扭转桨叶（用 weld 圆柱近似真实叶片）。 */
export const type055Propeller: GeometryBuilder = () => {
  const blades: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const r = 2.4;
    const blade = new THREE.CylinderGeometry(0.16, 0.42, r, 8);
    blade.translate(0, r / 2, 0);
    blade.rotateZ(a);
    blade.rotateX(0.42);
    blades.push(blade);
  }
  const hub = new THREE.CylinderGeometry(0.42, 0.5, 0.7, 16);
  blades.push(hub);
  return merge(blades);
};

/** 直升机甲板：防滑涂层圆 + 中心 H + 系留格栅，作为甲板贴面。 */
export const type055Helipad: GeometryBuilder = () => {
  const parts: THREE.BufferGeometry[] = [];
  const circle = new THREE.TorusGeometry(6.8, 0.14, 6, 48);
  circle.rotateX(Math.PI / 2);
  parts.push(circle);
  const h1 = new THREE.BoxGeometry(0.45, 0.04, 5.2);
  h1.translate(-1.5, 0.02, 0);
  const h2 = h1.clone();
  h1.translate(0, 0, 0);
  const h3 = new THREE.BoxGeometry(3.0, 0.04, 0.45);
  h3.translate(0, 0.02, 0);
  const h2b = h2.clone();
  h2b.translate(3.0, 0, 0);
  parts.push(h1, h2b, h3);
  return merge(parts);
};

/** 130mm 主炮炮塔：内倾多面体（四棱台）+ 炮座。 */
export const type055GunTurret: GeometryBuilder = () => {
  const body = new THREE.CylinderGeometry(1.7, 2.2, 1.9, 6);
  body.translate(0, 0.95, 0);
  const roof = new THREE.BoxGeometry(2.5, 0.16, 3.0);
  roof.translate(0, 1.95, -0.1);
  return merge([body, roof]);
};
