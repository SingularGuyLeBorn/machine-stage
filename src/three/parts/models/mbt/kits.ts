import * as THREE from "three";
import {
  bevelBoxGeometry,
  cylinderGeometry,
  mergeGeometries,
  spurGearGeometry,
  tubeGeometry,
} from "../../kernel/geometry";
import type { GeometryBuilder } from "../../assembler/geometry";

// ============================================================================
// models/mbt/kits —— 现代主战坦克（MBT-90）专用几何
//
// 局部系约定：+Z = 车头、+X = 右侧、+Y = 上；地面 y = 0。
//   roadWheel    负重轮（胶胎 + 轮辋 + 轮毂，轴向 +X）
//   trackLink    履带板（长沿 Z = 节距方向、宽沿 X，带导向齿与销耳）
//   sprocket     主动轮（12 齿，轴向 +X）
//   eraBlock     反应装甲块（斜置盒 + 压条 + 两颗铆钉，法线 +Y）
//   gunBarrel    120mm 滑膛炮（炮管 + 热护套 + 抽气装置 + 炮口段，轴向 +Z）
//   bustleRack   尾篮（框架 + 底网）
//   smokeCluster 烟幕发射器座（4 管，管轴 +Z 略上仰）
// ============================================================================

type Params = Record<string, unknown>;

function num(params: Params | undefined, key: string, fallback?: number): number {
  const value = params?.[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (fallback !== undefined) return fallback;
  throw new Error(`mbt kit：参数 "${key}" 必须是数值（收到 ${String(value)}）`);
}

const roadWheel: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const r = num(p, "r", 0.4);
  const w = num(p, "w", 0.17);
  const parts: THREE.BufferGeometry[] = [];
  // 胶胎（外圈）
  parts.push(tubeGeometry(r, r - 0.035, w, 32).rotateZ(Math.PI / 2));
  // 轮辋 + 两侧减重孔盘
  const rim = cylinderGeometry(r - 0.05, w - 0.02, r - 0.05, 28, 0.004);
  rim.rotateZ(Math.PI / 2);
  parts.push(rim);
  for (const side of [-1, 1]) {
    const dish = cylinderGeometry(r - 0.09, 0.015, r - 0.13, 24, 0.003);
    dish.rotateZ(Math.PI / 2);
    dish.translate(side * (w / 2 - 0.01), 0, 0);
    parts.push(dish);
  }
  // 轮毂
  const hub = cylinderGeometry(0.13, w + 0.02, 0.13, 24, 0.004);
  hub.rotateZ(Math.PI / 2);
  parts.push(hub);
  // 8 条轮辐
  for (let i = 0; i < 8; i++) {
    const spoke = bevelBoxGeometry(w - 0.03, 0.07, r - 0.16, 0.004);
    spoke.translate(0, 0, (r - 0.16) / 2 + 0.05);
    spoke.rotateX((i / 8) * Math.PI * 2);
    parts.push(spoke);
  }
  return mergeGeometries(parts);
};

const trackLink: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const pitch = num(p, "pitch", 0.16);
  const width = num(p, "width", 0.42);
  const t = num(p, "t", 0.028);
  const parts: THREE.BufferGeometry[] = [];
  // 踏板
  parts.push(bevelBoxGeometry(width, t, pitch * 0.92, 0.004));
  // 中央导向齿
  parts.push(bevelBoxGeometry(0.05, 0.075, pitch * 0.5, 0.004).translate(0, t / 2 + 0.035, 0));
  // 两侧销耳
  for (const x of [-width / 2 + 0.05, width / 2 - 0.05]) {
    parts.push(bevelBoxGeometry(0.07, 0.055, pitch * 0.3, 0.003).translate(x, 0, pitch * 0.34));
    parts.push(bevelBoxGeometry(0.07, 0.055, pitch * 0.3, 0.003).translate(x, 0, -pitch * 0.34));
  }
  return mergeGeometries(parts);
};

const sprocket: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const r = num(p, "r", 0.34);
  const w = num(p, "w", 0.16);
  const gear = spurGearGeometry(12, r, w, 0.09, 0.0015);
  // 双排齿圈（外排 + 内排），中间留履带销槽
  const inner = spurGearGeometry(12, r - 0.04, 0.06, 0.09, 0.001);
  inner.translate(0, 0, 0);
  const hub = cylinderGeometry(0.13, w + 0.06, 0.13, 24, 0.004);
  hub.rotateZ(Math.PI / 2);
  const merged = mergeGeometries([gear, inner, hub]);
  merged.rotateY(Math.PI / 2); // 齿盘轴 Z → X
  return merged;
};

const eraBlock: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const w = num(p, "w", 0.3);
  const h = num(p, "h", 0.22);
  const d = num(p, "d", 0.11);
  const parts: THREE.BufferGeometry[] = [];
  parts.push(bevelBoxGeometry(w, h, d, 0.008));
  // 压条
  parts.push(bevelBoxGeometry(w * 0.86, 0.016, d + 0.01, 0.004).translate(0, h / 2 - 0.02, 0));
  // 底部安装耳
  for (const x of [-w / 2 + 0.04, w / 2 - 0.04]) {
    parts.push(bevelBoxGeometry(0.05, 0.03, d + 0.03, 0.003).translate(x, -h / 2 + 0.01, 0));
  }
  return mergeGeometries(parts);
};

const gunBarrel: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const len = num(p, "len", 5.4);
  const r = num(p, "r", 0.075);
  const parts: THREE.BufferGeometry[] = [];
  // 炮尾段（粗）
  const breechEnd = cylinderGeometry(r + 0.025, 0.5, r + 0.025, 24, 0.004);
  breechEnd.rotateX(Math.PI / 2);
  breechEnd.translate(0, 0, 0.25);
  parts.push(breechEnd);
  // 炮管
  const tube = cylinderGeometry(r, len - 0.5, r, 24, 0.003);
  tube.rotateX(Math.PI / 2);
  tube.translate(0, 0, len / 2);
  parts.push(tube);
  // 热护套（两段带箍）
  for (const [z0, h] of [
    [0.9, 1.15],
    [2.2, 1.1],
  ] as const) {
    const sleeve = tubeGeometry(r + 0.018, r, h, 24);
    sleeve.rotateX(Math.PI / 2);
    sleeve.translate(0, 0, z0 + h / 2);
    parts.push(sleeve);
    for (const z of [z0, z0 + h]) {
      const band = cylinderGeometry(r + 0.024, 0.02, r + 0.024, 20, 0.002);
      band.rotateX(Math.PI / 2);
      band.translate(0, 0, z);
      parts.push(band);
    }
  }
  // 抽气装置
  const evacuator = cylinderGeometry(r + 0.05, 0.36, r + 0.05, 24, 0.004);
  evacuator.rotateX(Math.PI / 2);
  evacuator.translate(0, 0, 1.85);
  parts.push(evacuator);
  return mergeGeometries(parts);
};

const bustleRack: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const w = num(p, "w", 2.3);
  const h = num(p, "h", 0.55);
  const d = num(p, "d", 0.85);
  const parts: THREE.BufferGeometry[] = [];
  // 底框 + 顶框
  for (const y of [-h / 2, h / 2]) {
    parts.push(bevelBoxGeometry(w, 0.035, 0.04, 0.003).translate(0, y, d / 2));
    parts.push(bevelBoxGeometry(w, 0.035, 0.04, 0.003).translate(0, y, -d / 2));
    parts.push(bevelBoxGeometry(0.04, 0.035, d, 0.003).translate(-w / 2, y, 0));
    parts.push(bevelBoxGeometry(0.04, 0.035, d, 0.003).translate(w / 2, y, 0));
  }
  // 立柱
  for (const x of [-w / 2, 0, w / 2]) {
    for (const z of [-d / 2, d / 2]) {
      parts.push(bevelBoxGeometry(0.035, h, 0.035, 0.002).translate(x, 0, z));
    }
  }
  // 底网（细条）
  for (let i = 0; i < 7; i++) {
    parts.push(bevelBoxGeometry(w, 0.012, 0.02, 0.001).translate(0, -h / 2 + 0.02, -d / 2 + (i + 0.5) * (d / 7)));
  }
  return mergeGeometries(parts);
};

const smokeCluster: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const r = num(p, "r", 0.038);
  const len = num(p, "len", 0.24);
  const parts: THREE.BufferGeometry[] = [];
  // 底板
  parts.push(bevelBoxGeometry(0.34, 0.05, 0.16, 0.004));
  // 4 根发射管（2×2，管轴 +Z 略上仰由装配旋转给）
  for (const x of [-0.09, 0.09]) {
    for (const y of [-0.09, 0.09]) {
      const tube = tubeGeometry(r, r - 0.012, len, 16);
      tube.rotateX(Math.PI / 2);
      tube.translate(x, y, len / 2 + 0.03);
      parts.push(tube);
      const cap = cylinderGeometry(r + 0.003, 0.012, r + 0.003, 16, 0.002);
      cap.rotateX(Math.PI / 2);
      cap.translate(x, y, len + 0.03);
      parts.push(cap);
    }
  }
  return mergeGeometries(parts);
};

export const mbtKitBuilders: Record<string, GeometryBuilder> = {
  roadWheel,
  trackLink,
  sprocket,
  eraBlock,
  gunBarrel,
  bustleRack,
  smokeCluster,
};
