import * as THREE from "three";
import type { GeometryBuilder } from "../../assembler/geometry";
import { latheGeometry, mergeGeometries, tubeGeometry } from "../../kernel/geometry";

// ============================================================================
// models/guns/hardware —— 弹簧 / 弹链 / 脚架 / 握把 等通用结构 kits
// 轴向约定同 kits.ts：+Z = 枪口方向（导气活塞、枪机、复进簧都是这个轴向）。
// ============================================================================

type Params = Record<string, unknown>;

function num(params: Params | undefined, key: string, fallback?: number): number {
  const value = params?.[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (fallback !== undefined) return fallback;
  throw new Error(`guns kit：参数 "${key}" 必须是数值（收到 ${String(value)}）`);
}

function toZAxis(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  geometry.rotateX(Math.PI / 2);
  return geometry;
}

/** 螺旋压缩簧：绕 +Z 轴，圈数 coils、导程 length、簧丝径 wireR。 */
function helixPoints(r: number, len: number, coils: number, phase: number, steps: number): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const angle = phase + t * coils * Math.PI * 2;
    points.push(new THREE.Vector3(Math.cos(angle) * r, Math.sin(angle) * r, -len / 2 + t * len));
  }
  return points;
}

/** 螺旋簧（复进簧 / 击锤簧 / 托弹簧）：局部系 +Z 为轴，原点在中心。 */
const coilSpring: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const r = num(p, "r", 0.02);
  const wireR = num(p, "wireR", 0.0015);
  const len = num(p, "len", 0.12);
  const coils = num(p, "coils", 8);
  const steps = Math.max(16, Math.round(coils * 14));
  const points = helixPoints(r, len, coils, 0, steps);
  const curve = new THREE.CatmullRomCurve3(points);
  return new THREE.TubeGeometry(curve, steps, wireR, 6, false);
};

/** 扭簧（V 形 / 圆柱形绞丝）：用于枪机拉壳钩等小簧。 */
const torsionSpring: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const r = num(p, "r", 0.006);
  const wireR = num(p, "wireR", 0.0006);
  const coils = num(p, "coils", 3);
  const steps = Math.max(12, Math.round(coils * 12));
  const points = helixPoints(r, wireR * 2 * coils + 0.002, coils, 0, steps);
  const curve = new THREE.CatmullRomCurve3(points);
  return new THREE.TubeGeometry(curve, steps, wireR, 5, false);
};

// ---------------------------------------------------------------------------
// beltLink —— 可散弹链节（M2HB 三角形 / M249 MTR 链接通用轮廓）
// 局部系：链节平面在 XZ，+Z = 供弹方向；链脊沿 X。
// ---------------------------------------------------------------------------

const beltLink: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const pitch = num(p, "pitch", 0.015);
  const w = num(p, "w", 0.018);
  const t = num(p, "t", 0.0012);
  const throatR = num(p, "throatR", 0.0085);
  const parts: THREE.BufferGeometry[] = [];
  // 底板（横跨节距）
  const bed = new THREE.BoxGeometry(pitch * 0.92, t, w * 0.5);
  bed.translate(0, -throatR + t / 2, 0);
  parts.push(bed);
  // C 形抱弹臂：两段圆弧 + 中间开口（子弹从中间穿过）
  const arm = (angle: number, length: number, radius: number) => {
    const points: THREE.Vector3[] = [];
    const segs = 6;
    for (let i = 0; i <= segs; i++) {
      const a = angle - (Math.PI / 2) * (i / segs);
      points.push(new THREE.Vector3(-length / 2 + (i / segs) * length, Math.sin(a) * radius, Math.cos(a) * radius - radius));
    }
    const curve = new THREE.CatmullRomCurve3(points);
    return new THREE.TubeGeometry(curve, segs, t / 2, 4, false);
  };
  parts.push(arm(-Math.PI / 2, w, throatR * 0.55));
  parts.push(arm(-Math.PI / 2, -w, throatR * 0.55));
  const merged = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  return merged;
};

// ---------------------------------------------------------------------------
// bipod —— 两脚架（M249 / M2HB 通用，可简化收放）
// 局部系：+Y 上，挂点原点在枪管箍下方。
// ---------------------------------------------------------------------------

const bipod: GeometryBuilder = (_spec) => {
  const p = (_spec as { params?: Params }).params;
  const legLen = num(p, "legLen", 0.22);
  const legR = num(p, "legR", 0.006);
  const spread = num(p, "spreadDeg", 32);
  const parts: THREE.BufferGeometry[] = [];
  const yoke = new THREE.CylinderGeometry(legR * 1.6, legR * 1.6, 0.05, 10);
  yoke.rotateZ(Math.PI / 2); // 横置
  parts.push(yoke);
  for (const side of [-1, 1]) {
    const leg = new THREE.CylinderGeometry(legR * 0.7, legR * 0.55, legLen, 8);
    leg.translate(0, -legLen / 2, 0);
    leg.rotateX(THREE.MathUtils.degToRad(spread) * side);
    leg.translate(side * 0.028, -0.02, 0);
    parts.push(leg);
    // 脚爪
    const foot = new THREE.CylinderGeometry(legR * 0.9, legR * 0.9, 0.012, 8);
    foot.rotateX(THREE.MathUtils.degToRad(spread) * side);
    foot.translate(side * 0.028, -0.02 - legLen + 0.01, Math.sin(THREE.MathUtils.degToRad(spread) * side) * legLen * 0.6);
    parts.push(foot);
  }
  const merged = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  return merged;
};

// ---------------------------------------------------------------------------
// flashHider —— 枪口装置（AK 斜切式 / 鸟笼式消焰器通用）
// 局部系 +Z = 枪口方向，原点 = 枪管口面。
// ---------------------------------------------------------------------------

const flashHider: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const r = num(p, "r", 0.011);
  const len = num(p, "len", 0.05);
  const boreR = num(p, "boreR", 0.0098); // 中通孔（套在枪管外）
  const style = typeof p?.style === "string" ? (p.style as string) : "slant";
  const parts: THREE.BufferGeometry[] = [];
  if (style === "birdcage") {
    // 鸟笼：开槽筒（5 槽）
    const cage = tubeGeometry(r, boreR, len, 20);
    cage.rotateX(Math.PI / 2);
    parts.push(cage);
    const slots = 5;
    for (let i = 0; i < slots; i++) {
      const angle = (i / slots) * Math.PI * 2 + 0.3;
      const slot = new THREE.BoxGeometry(0.02, len * 0.62, 0.003);
      slot.rotateX(Math.PI / 2);
      const m = new THREE.Matrix4().makeRotationZ(angle);
      slot.applyMatrix4(m);
      slot.translate(Math.cos(angle) * r * 0.9, Math.sin(angle) * r * 0.9, 0);
      parts.push(slot);
    }
  } else {
    // AK 斜切帽：尾端斜切 24°，右侧开泄压孔
    const profile: [number, number][] = [
      [boreR, 0],
      [r, 0],
      [r * 0.97, len * 0.7],
      [r * 0.72, len * 0.86],
      [r * 0.7, len],
      [r * 0.62, len],
      [r * 0.6, len * 0.72],
      [r * 0.55, len * 0.66],
      [boreR, len * 0.62],
    ];
    const body = toZAxis(latheGeometry(profile, 20));
    parts.push(body);
    // 右侧泄压孔（2 个）
    for (const dz of [len * 0.28, len * 0.52]) {
      const hole = new THREE.CylinderGeometry(0.0028, 0.0028, 0.004, 8);
      hole.rotateZ(Math.PI / 2);
      hole.translate(0, 0, dz);
      parts.push(hole);
    }
  }
  const merged = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  return merged;
};

// ---------------------------------------------------------------------------
// spadeGrip —— 铲形握把（M2HB 后握把 / M134 电击发握把）
// 局部系 +Z = 后，抓握面沿 Y。
// ---------------------------------------------------------------------------

const spadeGrip: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const h = num(p, "h", 0.11);
  const w = num(p, "w", 0.032);
  const t = num(p, "t", 0.022);
  const parts: THREE.BufferGeometry[] = [];
  const shaft = new THREE.BoxGeometry(w, h, t);
  shaft.translate(0, -h / 2, 0);
  parts.push(shaft);
  // 铲形头（后倾）
  const head = new THREE.BoxGeometry(w * 1.05, h * 0.34, t * 1.5);
  head.rotateX(-0.28);
  head.translate(0, -h + h * 0.17, t * 0.32);
  parts.push(head);
  const merged = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  return merged;
};

// ---------------------------------------------------------------------------
// handguardCurve —— 弧度护木（AK 上下护木的弯板，含散热孔）
// 局部系：板沿 +Z（枪口方向）弯曲，弧矢高 sag。
// ---------------------------------------------------------------------------

const handguardCurve: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const len = num(p, "len", 0.24);
  const w = num(p, "w", 0.05);
  const t = num(p, "t", 0.006);
  const sag = num(p, "sag", 0.01);
  const holes = Math.round(num(p, "holes", 4));
  const parts: THREE.BufferGeometry[] = [];
  // 弯板：细分成 N 段小盒
  const segs = 12;
  for (let i = 0; i < segs; i++) {
    const z0 = -len / 2 + (i / segs) * len;
    const z1 = -len / 2 + ((i + 1) / segs) * len;
    const zc = (z0 + z1) / 2;
    const y = -sag * (1 - (zc / (len / 2)) ** 2);
    const seg = new THREE.BoxGeometry(w, t, z1 - z0 + 0.0004);
    seg.translate(0, y, zc);
    parts.push(seg);
  }
  // 散热孔（横向贯穿的细长圆柱孔，两侧贯通）
  for (let i = 0; i < holes; i++) {
    const z = -len * 0.32 + (i / Math.max(1, holes - 1)) * len * 0.64;
    const y = -sag * 0.55;
    const hole = new THREE.CylinderGeometry(0.0035, 0.0035, w + 0.002, 8);
    hole.rotateZ(Math.PI / 2);
    hole.translate(0, y, z);
    parts.push(hole);
  }
  const merged = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  return merged;
};

/** handguardShell —— 护木壳（部分圆筒）：包络枪管/导气管，theta 0 = 底部。 */
const handguardShell: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const r = num(p, "r", 0.026);
  const len = num(p, "len", 0.15);
  const slotDeg = num(p, "slotDeg", 0); // 底部缺口角（度）：0 = 整圆
  const segs = Math.round(num(p, "segments", 22));
  const slot = (slotDeg * Math.PI) / 180;
  const tube = new THREE.CylinderGeometry(r, r, len, segs, 1, true, slot / 2, Math.PI * 2 - slot);
  tube.rotateX(Math.PI / 2); // Y → Z（theta 0 → -Y 底部）
  return tube;
};

export const gunHardwareBuilders: Record<string, GeometryBuilder> = {
  handguardShell,
  coilSpring,
  torsionSpring,
  beltLink,
  bipod,
  flashHider,
  spadeGrip,
  handguardCurve,
};
