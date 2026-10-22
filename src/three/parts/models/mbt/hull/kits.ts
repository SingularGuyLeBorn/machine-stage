import * as THREE from "three";
import {
  bevelBoxGeometry,
  cylinderGeometry,
  mergeGeometries,
  tubeGeometry,
} from "../../../kernel/geometry";
import type { GeometryBuilder } from "../../../assembler/geometry";

// ============================================================================
// models/mbt/hull/kits —— 外壳 / 复合装甲 / ERA / 滑膛炮 / 表面件
// ============================================================================

type Params = Record<string, unknown>;
function num(params: Params | undefined, key: string, fallback?: number): number {
  const v = params?.[key];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (fallback !== undefined) return fallback;
  throw new Error(`mbt hull kit：参数 "${key}" 必须是数值`);
}

/** 120mm 滑膛炮：炮尾 + 身管 + 两段热护套 + 抽烟装置 + 炮口。轴 +Z。 */
const smoothboreBarrel: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const len = num(p, "len", 5.6);
  const r = num(p, "r", 0.0625);
  const parts: THREE.BufferGeometry[] = [];
  // 炮尾（粗）
  const breech = cylinderGeometry(r + 0.04, 0.55, r + 0.04, 26, 0.004);
  breech.rotateX(Math.PI / 2);
  breech.translate(0, 0, 0.275);
  parts.push(breech);
  // 身管
  const tube = cylinderGeometry(r, len - 0.55, r, 28, 0.002);
  tube.rotateX(Math.PI / 2);
  tube.translate(0, 0, 0.55 + (len - 0.55) / 2);
  parts.push(tube);
  // 两段热护套
  for (const [z0, h] of [
    [0.95, 1.2],
    [2.25, 1.15],
  ] as const) {
    const sleeve = tubeGeometry(r + 0.02, r, h, 26);
    sleeve.rotateX(Math.PI / 2);
    sleeve.translate(0, 0, z0 + h / 2);
    parts.push(sleeve);
    for (const z of [z0, z0 + h]) {
      parts.push(cylinderGeometry(r + 0.027, 0.022, r + 0.027, 22, 0.001).rotateX(Math.PI / 2).translate(0, 0, z));
    }
  }
  // 抽烟装置（炮管中段）
  const evac = cylinderGeometry(r + 0.055, 0.4, r + 0.055, 26, 0.006);
  evac.rotateX(Math.PI / 2);
  evac.translate(0, 0, 2.55);
  parts.push(evac);
  for (const z of [2.34, 2.76]) {
    parts.push(cylinderGeometry(r + 0.035, 0.025, r + 0.035, 22, 0.002).rotateX(Math.PI / 2).translate(0, 0, z));
  }
  // 炮口
  const muzzle = cylinderGeometry(r + 0.014, 0.26, r + 0.014, 24, 0.002);
  muzzle.rotateX(Math.PI / 2);
  muzzle.translate(0, 0, len - 0.13);
  parts.push(muzzle);
  return mergeGeometries(parts);
};

/** 前大灯：灯体轴 +Z、透镜朝前、带护圈与翼子板支架。 */
const headlight: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const r = num(p, "r", 0.105);
  const len = num(p, "len", 0.16);
  const parts: THREE.BufferGeometry[] = [];
  const body = cylinderGeometry(r, len, r, 22, 0.004);
  body.rotateX(Math.PI / 2);
  parts.push(body);
  const lens = cylinderGeometry(r * 0.82, 0.03, r * 0.82, 22, 0.002);
  lens.rotateX(Math.PI / 2);
  lens.translate(0, 0, len / 2 + 0.015);
  parts.push(lens);
  const ring = tubeGeometry(r + 0.012, r * 0.9, 0.035, 22);
  ring.rotateX(Math.PI / 2);
  ring.translate(0, 0, len / 2 + 0.012);
  parts.push(ring);
  for (const x of [-r * 0.6, r * 0.6]) {
    parts.push(bevelBoxGeometry(0.018, r * 1.7, 0.018, 0.002).translate(x, 0, len / 2 + 0.055));
  }
  parts.push(bevelBoxGeometry(r * 1.45, 0.018, 0.018, 0.002).translate(0, r * 0.82, len / 2 + 0.055));
  parts.push(bevelBoxGeometry(0.07, 0.23, 0.1, 0.003).translate(0, -r - 0.035, -0.02));
  parts.push(bevelBoxGeometry(0.16, 0.03, 0.14, 0.002).translate(0, -r - 0.135, -0.02));
  return mergeGeometries(parts);
};

/** 炮盾：中间留出炮管孔的装甲框 + 前缘护圈 + 并列机枪缺口。 */
const mantlet: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const w = num(p, "w", 0.68);
  const h = num(p, "h", 0.48);
  const d = num(p, "d", 0.26);
  const bore = num(p, "bore", 0.17);
  const sideW = (w - bore) / 2;
  const topH = (h - bore) / 2;
  const parts: THREE.BufferGeometry[] = [];
  parts.push(bevelBoxGeometry(sideW, h, d, 0.008).translate(-(bore + sideW) / 2, 0, 0));
  parts.push(bevelBoxGeometry(sideW, h, d, 0.008).translate((bore + sideW) / 2, 0, 0));
  parts.push(bevelBoxGeometry(bore, topH, d, 0.006).translate(0, (bore + topH) / 2, 0));
  parts.push(bevelBoxGeometry(bore, topH, d, 0.006).translate(0, -(bore + topH) / 2, 0));
  const collar = tubeGeometry(bore / 2 + 0.035, bore / 2, 0.07, 28);
  collar.rotateX(Math.PI / 2);
  collar.translate(0, 0, d / 2 + 0.02);
  parts.push(collar);
  for (const y of [-1, 1]) {
    parts.push(bevelBoxGeometry(w + 0.02, 0.035, 0.05, 0.004).translate(0, y * (h / 2), d / 2 - 0.01));
  }
  return mergeGeometries(parts);
};

/** 楔形炮塔前斜板复合装甲包：三层板（外层钢 / 陶瓷 / 背板），法线 +Z。 */
const compositePlate: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const w = num(p, "w", 1.1);
  const h = num(p, "h", 0.56);
  const outer = num(p, "outer", 0.035);
  const ceramic = num(p, "ceramic", 0.06);
  const backing = num(p, "backing", 0.035);
  const gap = num(p, "gap", 0.012);
  const parts: THREE.BufferGeometry[] = [];
  let z = -((outer + gap + ceramic + gap + backing) / 2);
  parts.push(bevelBoxGeometry(w, h, outer, 0.004).translate(0, 0, z + outer / 2));
  z += outer + gap;
  parts.push(bevelBoxGeometry(w * 0.97, h * 0.96, ceramic, 0.004).translate(0, 0, z + ceramic / 2));
  z += ceramic + gap;
  parts.push(bevelBoxGeometry(w * 0.99, h * 0.98, backing, 0.004).translate(0, 0, z + backing / 2));
  return mergeGeometries(parts);
};

/** ERA 盒式夹层的分层尺寸（局部 +Z = 法线向外）。 */
function eraLayers(d: number) {
  const back = Math.min(0.018, d * 0.14);
  const coverT = Math.min(0.016, d * 0.12);
  const wall = Math.min(0.02, d * 0.14);
  const z0 = -d / 2 + back;
  const z1 = d / 2 - coverT - 0.002;
  const cavity = Math.max(0.03, z1 - z0);
  const linerT = Math.min(0.012, cavity * 0.12);
  const flyerT = Math.min(0.012, cavity * 0.12);
  const gap = 0.003;
  const explosiveT = Math.max(0.02, cavity - linerT - flyerT - gap * 2 - 0.006);
  return {
    back,
    coverT,
    wall,
    z0,
    z1,
    linerT,
    flyerT,
    explosiveT,
    linerZ: z0 + linerT / 2,
    explosiveZ: z0 + linerT + gap + explosiveT / 2,
    flyerZ: z0 + linerT + gap + explosiveT + gap + flyerT / 2,
  };
}

/** ERA 外壳：开口钢盒（背板 + 四周框 + 安装耳），前面留出夹层腔。 */
const eraCasing: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const w = num(p, "w", 0.4);
  const h = num(p, "h", 0.24);
  const d = num(p, "d", 0.12);
  const { back, wall } = eraLayers(d);
  const parts: THREE.BufferGeometry[] = [];
  parts.push(bevelBoxGeometry(w, h, back, 0.004).translate(0, 0, -d / 2 + back / 2));
  const frameDepth = d - back;
  const frameZ = back / 2;
  parts.push(bevelBoxGeometry(w, wall, frameDepth, 0.002).translate(0, h / 2 - wall / 2, frameZ));
  parts.push(bevelBoxGeometry(w, wall, frameDepth, 0.002).translate(0, -h / 2 + wall / 2, frameZ));
  parts.push(bevelBoxGeometry(wall, h - wall * 2, frameDepth, 0.002).translate(-w / 2 + wall / 2, 0, frameZ));
  parts.push(bevelBoxGeometry(wall, h - wall * 2, frameDepth, 0.002).translate(w / 2 - wall / 2, 0, frameZ));
  // 外置加强筋（压在上下框上，不穿内腔）
  for (const y of [h / 2 - 0.012, -h / 2 + 0.012]) {
    parts.push(bevelBoxGeometry(w, 0.018, d + 0.008, 0.002).translate(0, y, 0.002));
  }
  // 两个背面安装耳，压在装甲/安装轨上
  for (const x of [-w * 0.36, w * 0.36]) {
    parts.push(bevelBoxGeometry(0.06, 0.03, back + 0.03, 0.002).translate(x, -h / 2 + 0.015, -d / 2 - 0.005));
  }
  return mergeGeometries(parts);
};

/** ERA 前盖：可拆下的薄钢盖 + 两道横向压筋。 */
const eraCover: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const w = num(p, "w", 0.4);
  const h = num(p, "h", 0.24);
  const d = num(p, "d", 0.12);
  const { coverT } = eraLayers(d);
  const parts: THREE.BufferGeometry[] = [];
  parts.push(bevelBoxGeometry(w, h, coverT, 0.004).translate(0, 0, d / 2 - coverT / 2));
  for (const y of [h * 0.32, -h * 0.32]) {
    parts.push(bevelBoxGeometry(w * 0.92, 0.016, 0.012, 0.002).translate(0, y, d / 2 + 0.006));
  }
  parts.push(bevelBoxGeometry(0.02, h * 0.7, 0.008, 0.002).translate(0, 0, d / 2 + 0.005));
  return mergeGeometries(parts);
};

const eraExplosive: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const w = num(p, "w", 0.4);
  const h = num(p, "h", 0.24);
  const d = num(p, "d", 0.12);
  const { wall, explosiveT, explosiveZ } = eraLayers(d);
  return bevelBoxGeometry(w - wall * 2 - 0.012, h - wall * 2 - 0.012, explosiveT, 0.003).translate(
    0,
    0,
    explosiveZ,
  );
};

/** 前飞板：爆炸时被推向来弹方向的钢板。 */
const eraFlyer: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const w = num(p, "w", 0.4);
  const h = num(p, "h", 0.24);
  const d = num(p, "d", 0.12);
  const { wall, flyerT, flyerZ } = eraLayers(d);
  return bevelBoxGeometry(w - wall * 2 - 0.006, h - wall * 2 - 0.006, flyerT, 0.002).translate(
    0,
    0,
    flyerZ,
  );
};

/** 背板/钝感夹层：贴在壳体背板上。 */
const eraLiner: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const w = num(p, "w", 0.4);
  const h = num(p, "h", 0.24);
  const d = num(p, "d", 0.12);
  const { wall, linerT, linerZ } = eraLayers(d);
  return bevelBoxGeometry(w - wall * 2 - 0.004, h - wall * 2 - 0.004, linerT, 0.002).translate(
    0,
    0,
    linerZ,
  );
};

/** ERA 前盖螺栓 ×2（轴 +Z）。 */
const eraBolt: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const w = num(p, "w", 0.4);
  const h = num(p, "h", 0.24);
  const d = num(p, "d", 0.12);
  const parts: THREE.BufferGeometry[] = [];
  for (const x of [-w * 0.32, w * 0.32]) {
    const shaft = cylinderGeometry(0.011, 0.012, 0.011, 10, 0.001);
    shaft.rotateX(Math.PI / 2);
    shaft.translate(x, -h * 0.34, d / 2 + 0.008);
    parts.push(shaft);
    const head = cylinderGeometry(0.018, 0.006, 0.018, 10, 0.001);
    head.rotateX(Math.PI / 2);
    head.translate(x, -h * 0.34, d / 2 + 0.017);
    parts.push(head);
  }
  return mergeGeometries(parts);
};

/** 尾篮：框架 + 底网。 */
const bustleRack: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const w = num(p, "w", 2.3);
  const h = num(p, "h", 0.55);
  const d = num(p, "d", 0.85);
  const parts: THREE.BufferGeometry[] = [];
  for (const y of [-h / 2, h / 2]) {
    parts.push(bevelBoxGeometry(w, 0.035, 0.04, 0.003).translate(0, y, d / 2));
    parts.push(bevelBoxGeometry(w, 0.035, 0.04, 0.003).translate(0, y, -d / 2));
    parts.push(bevelBoxGeometry(0.04, 0.035, d, 0.003).translate(-w / 2, y, 0));
    parts.push(bevelBoxGeometry(0.04, 0.035, d, 0.003).translate(w / 2, y, 0));
  }
  for (const x of [-w / 2, 0, w / 2]) {
    for (const z of [-d / 2, d / 2]) {
      parts.push(bevelBoxGeometry(0.035, h, 0.035, 0.002).translate(x, 0, z));
    }
  }
  parts.push(bevelBoxGeometry(w * 0.96, 0.02, d * 0.94, 0.003).translate(0, -h / 2 + 0.012, 0));
  for (let i = 0; i < 7; i++) {
    parts.push(bevelBoxGeometry(w, 0.012, 0.02, 0.001).translate(0, -h / 2 + 0.03, -d / 2 + (i + 0.5) * (d / 7)));
  }
  return mergeGeometries(parts);
};

/** 烟幕发射器：4 管（管轴 +Z，略上仰由装配给）。 */
const smokeCluster: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const r = num(p, "r", 0.038);
  const len = num(p, "len", 0.24);
  const parts: THREE.BufferGeometry[] = [];
  parts.push(bevelBoxGeometry(0.34, 0.05, 0.16, 0.004).translate(0, -0.16, 0));
  parts.push(bevelBoxGeometry(0.26, 0.09, 0.14, 0.003).translate(0, -0.225, 0));
  // 立柱贯穿上下两排管，背面再加安装板：上排不再悬空。
  parts.push(bevelBoxGeometry(0.12, 0.3, 0.12, 0.003).translate(0, -0.01, -0.01));
  parts.push(bevelBoxGeometry(0.3, 0.3, 0.026, 0.003).translate(0, -0.005, 0.018));
  for (const x of [-0.09, 0.09]) {
    for (const y of [-0.09, 0.09]) {
      const t = tubeGeometry(r, r - 0.012, len, 14);
      t.rotateX(Math.PI / 2);
      t.translate(x, y, len / 2 + 0.03);
      parts.push(t);
      const cap = cylinderGeometry(r + 0.003, 0.012, r + 0.003, 14, 0.002);
      cap.rotateX(Math.PI / 2);
      cap.translate(x, y, len + 0.03);
      parts.push(cap);
    }
  }
  return mergeGeometries(parts);
};

const weldSeam: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const len = num(p, "len", 1);
  const r = num(p, "r", 0.012);
  const parts: THREE.BufferGeometry[] = [];
  const n = Math.max(3, Math.round(len / 0.05));
  for (let i = 0; i < n; i++) {
    const g = new THREE.SphereGeometry(r * (0.8 + 0.2 * Math.sin(i * 2.1)), 8, 6);
    g.translate(-len / 2 + (i / (n - 1)) * len, 0, 0);
    parts.push(g);
  }
  return mergeGeometries(parts);
};

const fuelDrum: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const r = num(p, "r", 0.3);
  const h = num(p, "h", 0.8);
  const parts: THREE.BufferGeometry[] = [];
  parts.push(cylinderGeometry(r, h, r, 26, 0.006));
  for (const y of [-h / 2 + 0.06, h / 2 - 0.06]) {
    parts.push(tubeGeometry(r + 0.01, r - 0.01, 0.02, 26).translate(0, y, 0));
  }
  parts.push(cylinderGeometry(0.05, 0.04, 0.05, 12).translate(0, h / 2 + 0.02, 0));
  return mergeGeometries(parts);
};

const camoPatch: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const w = num(p, "w", 0.5);
  const h = num(p, "h", 0.3);
  const points: [number, number][] = [
    [-w / 2, -h / 2],
    [-w * 0.2, -h / 2 - 0.02],
    [w / 2, -h * 0.3],
    [w * 0.4, h / 2],
    [0, h * 0.45],
    [-w / 2, h * 0.2],
  ];
  return new THREE.ShapeGeometry(new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y))));
};

export const mbtHullKitBuilders: Record<string, GeometryBuilder> = {
  smoothboreBarrel,
  headlight,
  mantlet,
  compositePlate,
  eraCasing,
  eraCover,
  eraExplosive,
  eraFlyer,
  eraLiner,
  eraBolt,
  bustleRack,
  smokeCluster,
  weldSeam,
  fuelDrum,
  camoPatch,
};
