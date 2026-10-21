import * as THREE from "three";
import {
  bevelBoxGeometry,
  cylinderGeometry,
  mergeGeometries,
  spurGearGeometry,
  tubeGeometry,
} from "../../../kernel/geometry";
import type { GeometryBuilder } from "../../../assembler/geometry";

// ============================================================================
// models/mbt/running/kits —— 行走装置专用几何（局部系：+X 轴向 / +Y 上）
// 履带板局部 +Y = 环外法线（地面侧），-Y = 导向齿侧。
// ============================================================================

type Params = Record<string, unknown>;
function num(params: Params | undefined, key: string, fallback?: number): number {
  const value = params?.[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (fallback !== undefined) return fallback;
  throw new Error(`mbt running kit：参数 "${key}" 必须是数值`);
}

const roadWheel: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const r = num(p, "r", 0.4);
  const w = num(p, "w", 0.18);
  const parts: THREE.BufferGeometry[] = [];
  parts.push(tubeGeometry(r, r - 0.035, w, 32).rotateZ(Math.PI / 2));
  const rim = cylinderGeometry(r - 0.05, w - 0.02, r - 0.05, 28, 0.004);
  rim.rotateZ(Math.PI / 2);
  parts.push(rim);
  for (const side of [-1, 1]) {
    const dish = cylinderGeometry(r - 0.09, 0.015, r - 0.13, 24, 0.003);
    dish.rotateZ(Math.PI / 2);
    dish.translate(side * (w / 2 - 0.01), 0, 0);
    parts.push(dish);
  }
  const hub = cylinderGeometry(0.13, w + 0.02, 0.13, 24, 0.004);
  hub.rotateZ(Math.PI / 2);
  parts.push(hub);
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
  const parts: THREE.BufferGeometry[] = [];
  parts.push(bevelBoxGeometry(width, 0.028, pitch * 0.92, 0.004));
  // 中央导向齿（朝环内 = -Y）
  parts.push(bevelBoxGeometry(0.05, 0.075, pitch * 0.5, 0.004).translate(0, -0.045, 0));
  // 两侧销耳
  for (const x of [-width / 2 + 0.05, width / 2 - 0.05]) {
    parts.push(bevelBoxGeometry(0.07, 0.055, pitch * 0.3, 0.003).translate(x, 0, pitch * 0.34));
    parts.push(bevelBoxGeometry(0.07, 0.055, pitch * 0.3, 0.003).translate(x, 0, -pitch * 0.34));
  }
  // 加强筋
  for (const z of [-pitch * 0.22, pitch * 0.22]) {
    parts.push(bevelBoxGeometry(width * 0.82, 0.01, 0.014, 0.002).translate(0, 0.018, z));
  }
  return mergeGeometries(parts);
};

const trackPad: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const pitch = num(p, "pitch", 0.16);
  const width = num(p, "width", 0.42);
  const parts: THREE.BufferGeometry[] = [];
  parts.push(bevelBoxGeometry(width * 0.92, 0.016, pitch * 0.78, 0.005));
  for (let i = 0; i < 3; i++) {
    const z = -pitch * 0.28 + i * pitch * 0.28;
    parts.push(bevelBoxGeometry(width * 0.78, 0.012, 0.022, 0.003).translate(0, 0.012, z));
  }
  return mergeGeometries(parts);
};

const trackPin: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const width = num(p, "width", 0.42);
  const r = num(p, "r", 0.018);
  const parts: THREE.BufferGeometry[] = [];
  const pin = cylinderGeometry(r, width + 0.04, r, 16, 0.001);
  pin.rotateZ(Math.PI / 2);
  parts.push(pin);
  for (const x of [-width / 2 - 0.02, width / 2 + 0.02]) {
    parts.push(cylinderGeometry(r * 1.35, 0.012, r * 1.35, 12, 0.001).rotateZ(Math.PI / 2).translate(x, 0, 0));
  }
  return mergeGeometries(parts);
};

const endConnector: GeometryBuilder = (_spec) => {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(bevelBoxGeometry(0.07, 0.05, 0.14, 0.004));
  parts.push(cylinderGeometry(0.015, 0.06, 0.015, 10, 0.001).translate(0, 0.04, 0.04));
  parts.push(cylinderGeometry(0.012, 0.06, 0.012, 8, 0.001).translate(0, -0.04, -0.04));
  return mergeGeometries(parts);
};

const sprocket: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const r = num(p, "r", 0.32);
  const w = num(p, "w", 0.17);
  const gear = spurGearGeometry(12, r, w, 0.09, 0.0015);
  const inner = spurGearGeometry(12, r - 0.04, 0.07, 0.09, 0.001);
  const hub = cylinderGeometry(0.13, w + 0.06, 0.13, 24, 0.004);
  hub.rotateZ(Math.PI / 2);
  const merged = mergeGeometries([gear, inner, hub]);
  merged.rotateY(Math.PI / 2);
  return merged;
};

const idlerWheel: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const r = num(p, "r", 0.31);
  const w = num(p, "w", 0.17);
  const parts: THREE.BufferGeometry[] = [];
  parts.push(tubeGeometry(r, r - 0.03, w, 30).rotateZ(Math.PI / 2));
  const rim = cylinderGeometry(r - 0.04, w - 0.02, r - 0.04, 26, 0.004);
  rim.rotateZ(Math.PI / 2);
  parts.push(rim);
  const hub = cylinderGeometry(0.1, w + 0.03, 0.1, 20, 0.003);
  hub.rotateZ(Math.PI / 2);
  parts.push(hub);
  return mergeGeometries(parts);
};

const returnRoller: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const r = num(p, "r", 0.12);
  const w = num(p, "w", 0.1);
  const parts: THREE.BufferGeometry[] = [];
  parts.push(tubeGeometry(r, r - 0.022, w, 22).rotateZ(Math.PI / 2));
  parts.push(cylinderGeometry(r * 0.35, w + 0.02, r * 0.35, 16, 0.002).rotateZ(Math.PI / 2));
  return mergeGeometries(parts);
};

const suspensionArm: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const reach = num(p, "reach", 0.48);
  const sign = num(p, "sign", 1);
  const parts: THREE.BufferGeometry[] = [];
  parts.push(bevelBoxGeometry(reach, 0.08, 0.1, 0.008).translate((sign * reach) / 2, -0.02, 0));
  parts.push(cylinderGeometry(0.07, 0.12, 0.07, 18, 0.003).rotateX(Math.PI / 2).translate(0, 0, 0));
  parts.push(cylinderGeometry(0.06, 0.1, 0.06, 16, 0.002).rotateX(Math.PI / 2).translate(sign * reach, -0.045, 0));
  parts.push(bevelBoxGeometry(reach * 0.7, 0.04, 0.06, 0.003).translate((sign * reach) / 2, 0.03, 0));
  return mergeGeometries(parts);
};

const hydraulicCylinder: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const r = num(p, "r", 0.045);
  const h = num(p, "h", 0.26);
  const parts: THREE.BufferGeometry[] = [];
  parts.push(tubeGeometry(r, r - 0.008, h, 22));
  parts.push(tubeGeometry(r + 0.015, r - 0.006, 0.02, 22).translate(0, h / 2, 0));
  parts.push(tubeGeometry(r + 0.012, r - 0.006, 0.018, 22).translate(0, -h / 2, 0));
  return mergeGeometries(parts);
};

const pistonRod: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const r = num(p, "r", 0.022);
  const h = num(p, "h", 0.24);
  const parts: THREE.BufferGeometry[] = [];
  parts.push(cylinderGeometry(r, h, r, 16, 0.001).translate(0, h / 2, 0));
  parts.push(cylinderGeometry(0.035, 0.03, 0.035, 14, 0.002).translate(0, h, 0));
  parts.push(cylinderGeometry(0.03, 0.03, 0.03, 14, 0.002));
  return mergeGeometries(parts);
};

const accumulator: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const r = num(p, "r", 0.07);
  const parts: THREE.BufferGeometry[] = [];
  parts.push(new THREE.SphereGeometry(r, 24, 16));
  parts.push(tubeGeometry(r * 0.4, r * 0.3, 0.06, 16).translate(0, -r - 0.02, 0));
  return mergeGeometries(parts);
};

const damper: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const r = num(p, "r", 0.035);
  const h = num(p, "h", 0.24);
  const parts: THREE.BufferGeometry[] = [];
  parts.push(tubeGeometry(r, r - 0.006, h, 18));
  parts.push(cylinderGeometry(0.012, h + 0.08, 0.012, 10).translate(0, -h / 2 - 0.04, 0));
  parts.push(cylinderGeometry(0.03, 0.03, 0.03, 12, 0.002).translate(0, h / 2 + 0.01, 0));
  return mergeGeometries(parts);
};

const hubBolt: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const r = num(p, "r", 0.014);
  const parts: THREE.BufferGeometry[] = [];
  const bolt = cylinderGeometry(r, 0.03, r, 6, 0.001);
  bolt.rotateZ(Math.PI / 2);
  parts.push(bolt);
  const washer = cylinderGeometry(r * 1.8, 0.006, r * 1.8, 12, 0.001);
  washer.rotateZ(Math.PI / 2);
  washer.translate(0.012, 0, 0);
  parts.push(washer);
  return mergeGeometries(parts);
};

const hose: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const r = num(p, "r", 0.012);
  const len = num(p, "len", 0.2);
  return tubeGeometry(r, r * 0.7, len, 14);
};

const skirtPanel: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const w = num(p, "w", 0.62);
  const h = num(p, "h", 0.7);
  const parts: THREE.BufferGeometry[] = [];
  parts.push(bevelBoxGeometry(w, h, 0.03, 0.004));
  for (const y of [-h / 2 + 0.06, h / 2 - 0.06]) {
    parts.push(bevelBoxGeometry(w * 0.9, 0.025, 0.05, 0.002).translate(0, y, 0));
  }
  return mergeGeometries(parts);
};

export const mbtRunningKitBuilders: Record<string, GeometryBuilder> = {
  roadWheel,
  trackLink,
  trackPad,
  trackPin,
  endConnector,
  sprocket,
  idlerWheel,
  returnRoller,
  suspensionArm,
  hydraulicCylinder,
  pistonRod,
  accumulator,
  damper,
  hubBolt,
  hose,
  skirtPanel,
};
