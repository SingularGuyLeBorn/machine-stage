import * as THREE from "three";
import {
  bevelBoxGeometry,
  cylinderGeometry,
  mergeGeometries,
  tubeGeometry,
} from "../../../kernel/geometry";
import type { GeometryBuilder } from "../../../assembler/geometry";

// ============================================================================
// models/tiger/damage/kits —— 战损变体几何（三态：完好 / 破损 / 破碎）
//
// 设计口径（docs/briefs/damage-and-ammo.md）：
//   · 破损 = 完好几何 + 凹陷坑 + 放射裂痕（叠加层）
//   · 破碎 = 替换几何：缺块 + 撕裂翻边 + 内部骨架/管路（不是黑窟窿）
//
// 局部系与各零件原几何一致：
//   damagePlate  板面 XY、厚度 ±t/2 沿 Z（可选 orient="xz" 转到水平面）
//   damageScarV  竖直板凹陷（plane 决定朝 +Z / -Z / -X）
//   damageScarH  水平板凹陷（顶面 +Y）
//   mantletBroken 炮盾缺角（宽 Z / 高 Y / 厚 X）
//   fuelTank / fuelTankBroken 油箱（宽 X / 高 Y / 深 Z）
// ============================================================================

type Params = Record<string, unknown>;

function num(params: Params | undefined, key: string, fallback?: number): number {
  const value = params?.[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (fallback !== undefined) return fallback;
  throw new Error(`damage kit：参数 "${key}" 必须是数值（收到 ${String(value)}）`);
}

function pair(params: Params | undefined, key: string, fallback: [number, number]): [number, number] {
  const raw = params?.[key];
  if (Array.isArray(raw) && raw.length >= 2) return [Number(raw[0]), Number(raw[1])];
  return fallback;
}

function holesOf(params: Params | undefined): Array<[number, number, number]> {
  const raw = params?.holes;
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => [Number(entry[0]), Number(entry[1]), Number(entry[2])]);
}

function rectsOf(params: Params | undefined): Array<[number, number, number, number]> {
  const raw = params?.rects;
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => [Number(entry[0]), Number(entry[1]), Number(entry[2]), Number(entry[3])]);
}

function breachOf(
  params: Params | undefined,
): { kind: "circle"; x: number; y: number; r: number } | { kind: "rect"; x: number; y: number; w: number; h: number } | null {
  const raw = params?.breach;
  if (!Array.isArray(raw) || raw.length < 3) return null;
  if (raw.length >= 4) {
    return { kind: "rect", x: Number(raw[0]), y: Number(raw[1]), w: Number(raw[2]), h: Number(raw[3]) };
  }
  return { kind: "circle", x: Number(raw[0]), y: Number(raw[1]), r: Number(raw[2]) };
}

/** 带破口的装甲板（可选保留原有开孔），含倒角。 */
function breachedPlate(
  w: number,
  h: number,
  t: number,
  holes: Array<[number, number, number]>,
  rects: Array<[number, number, number, number]>,
  breach: ReturnType<typeof breachOf>,
): THREE.BufferGeometry {
  const bevel = Math.max(Math.min(0.003, t * 0.3, w * 0.08, h * 0.08), 0.0004);
  const hw = w / 2 - bevel;
  const hh = h / 2 - bevel;
  const shape = new THREE.Shape();
  shape.moveTo(-hw, -hh);
  shape.lineTo(hw, -hh);
  shape.lineTo(hw, hh);
  shape.lineTo(-hw, hh);
  shape.closePath();
  for (const [x, y, r] of holes) {
    const path = new THREE.Path();
    path.absarc(x, y, r + bevel, 0, Math.PI * 2, true);
    shape.holes.push(path);
  }
  for (const [x, y, rw, rh] of rects) {
    const ex = rw / 2 + bevel;
    const ey = rh / 2 + bevel;
    const path = new THREE.Path();
    path.moveTo(x - ex, y - ey);
    path.lineTo(x - ex, y + ey);
    path.lineTo(x + ex, y + ey);
    path.lineTo(x + ex, y - ey);
    path.closePath();
    shape.holes.push(path);
  }
  if (breach?.kind === "circle") {
    const path = new THREE.Path();
    path.absarc(breach.x, breach.y, breach.r + bevel, 0, Math.PI * 2, true);
    shape.holes.push(path);
  } else if (breach?.kind === "rect") {
    const ex = breach.w / 2 + bevel;
    const ey = breach.h / 2 + bevel;
    const path = new THREE.Path();
    path.moveTo(breach.x - ex, breach.y - ey);
    path.lineTo(breach.x - ex, breach.y + ey);
    path.lineTo(breach.x + ex, breach.y + ey);
    path.lineTo(breach.x + ex, breach.y - ey);
    path.closePath();
    shape.holes.push(path);
  }
  const inner = Math.max(t - 2 * bevel, 0.001);
  const plate = new THREE.ExtrudeGeometry(shape, {
    depth: inner,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 1,
    steps: 1,
    curveSegments: 28,
  });
  plate.translate(0, 0, -inner / 2);
  plate.computeVertexNormals();
  return plate;
}

/** 破口周围向外翻的撕裂钢片。 */
function tornFlaps(
  breach: NonNullable<ReturnType<typeof breachOf>>,
  t: number,
  innerSide: 1 | -1,
): THREE.BufferGeometry[] {
  const flaps: THREE.BufferGeometry[] = [];
  const z = innerSide * t * 0.18;
  if (breach.kind === "circle") {
    const count = 12;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + 0.17;
      const length = breach.r * (0.5 + 0.22 * Math.abs(Math.sin(i * 2.7)));
      const flap = bevelBoxGeometry(0.016, length, t * 0.75, 0.0015);
      flap.translate(0, breach.r + length * 0.32, 0);
      flap.rotateY((i % 2 === 0 ? 1 : -1) * (0.35 + 0.18 * Math.sin(i * 1.3)));
      flap.rotateZ(angle - Math.PI / 2);
      flap.translate(breach.x, breach.y, z);
      flaps.push(flap);
    }
    return flaps;
  }
  const { x, y, w, h } = breach;
  const edges: Array<{ along: "x" | "y"; count: number; at: (u: number) => [number, number, number] }> = [
    { along: "x", count: 4, at: (u) => [x - w / 2 + u * w, y + h / 2, 0] },
    { along: "x", count: 4, at: (u) => [x - w / 2 + u * w, y - h / 2, Math.PI] },
    { along: "y", count: 3, at: (u) => [x - w / 2, y - h / 2 + u * h, Math.PI / 2] },
    { along: "y", count: 3, at: (u) => [x + w / 2, y - h / 2 + u * h, -Math.PI / 2] },
  ];
  for (const edge of edges) {
    for (let i = 0; i < edge.count; i++) {
      const u = (i + 0.5) / edge.count;
      const [px, py, angle] = edge.at(u);
      const length = (edge.along === "x" ? h : w) * (0.12 + 0.05 * (i % 2));
      const width = (edge.along === "x" ? w : h) / edge.count;
      const flap = bevelBoxGeometry(Math.min(width * 0.8, 0.12), length, t * 0.75, 0.0015);
      flap.rotateZ(angle);
      flap.translate(px, py, z);
      flaps.push(flap);
    }
  }
  return flaps;
}

/** 破口后面的内部结构：加强肋 + 管路 + 线束（“破洞不是黑窟窿”）。 */
function innerStructure(
  breach: NonNullable<ReturnType<typeof breachOf>>,
  t: number,
  innerSide: 1 | -1,
  ribs: number,
  pipe: boolean,
  wires: number,
): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const span = breach.kind === "circle" ? breach.r * 2 : Math.max(breach.w, breach.h);
  const cx = breach.x;
  const cy = breach.y;
  const baseZ = innerSide * (t / 2 + 0.03);
  for (let i = 0; i < ribs; i++) {
    const u = ribs === 1 ? 0 : i / (ribs - 1) - 0.5;
    const rib = bevelBoxGeometry(0.05, span * (1.15 + 0.1 * (i % 2)), 0.07, 0.004);
    rib.translate(cx + u * span * 0.8, cy, baseZ + innerSide * 0.09);
    parts.push(rib);
  }
  if (pipe) {
    const line = cylinderGeometry(0.028, span * 1.3, 0.028, 14, 0.002);
    line.rotateZ(Math.PI / 2);
    line.translate(cx, cy - span * 0.32, baseZ + innerSide * 0.16);
    parts.push(line);
  }
  for (let i = 0; i < wires; i++) {
    const wire = cylinderGeometry(0.007, span * 0.9, 0.007, 8, 0);
    wire.rotateZ(Math.PI / 2);
    wire.translate(cx, cy + span * (0.18 + i * 0.09), baseZ + innerSide * 0.03);
    parts.push(wire);
  }
  return parts;
}

/** 破碎装甲板：缺块 + 翻边 + 内部结构；orient=xz 时转到水平面（发动机舱盖）。 */
const damagePlate: GeometryBuilder = (spec) => {
  const params = (spec as { params?: Params }).params;
  const w = num(params, "w");
  const h = num(params, "h");
  const t = num(params, "t", 0.025);
  const orient = String(params?.orient ?? "xy");
  const innerSide: 1 | -1 = num(params, "innerSide", -1) >= 0 ? 1 : -1;
  const breach = breachOf(params);
  if (!breach) throw new Error("damagePlate：缺少 breach");
  const ribs = Math.round(num(params, "ribs", 3));
  const pipe = Boolean(params?.pipe ?? true);
  const wires = Math.round(num(params, "wires", 2));

  const parts: THREE.BufferGeometry[] = [
    breachedPlate(w, h, t, holesOf(params), rectsOf(params), breach),
    ...tornFlaps(breach, t, innerSide),
    ...innerStructure(breach, t, innerSide, ribs, pipe, wires),
  ];
  const merged = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  if (orient === "xz") merged.rotateX(Math.PI / 2);
  merged.computeVertexNormals();
  return merged;
};

/** 竖直板凹陷：坑 + 放射裂纹。plane=z+ / z- / x- 选择朝外表面。 */
const damageScarV: GeometryBuilder = (spec) => {
  const params = (spec as { params?: Params }).params;
  const t = num(params, "t", 0.03);
  const at = pair(params, "at", [0, 0]);
  const r = num(params, "r", 0.14);
  const plane = String(params?.plane ?? "z+");
  const parts: THREE.BufferGeometry[] = [];

  const ring = tubeGeometry(r, r * 0.58, 0.008, 28);
  ring.rotateX(Math.PI / 2);
  ring.translate(at[0], at[1], 0.004);
  parts.push(ring);
  const dish = cylinderGeometry(r * 0.58, 0.005, r * 0.58, 24, 0.0008);
  dish.rotateX(Math.PI / 2);
  dish.translate(at[0], at[1], 0.001);
  parts.push(dish);
  const cracks = 7;
  for (let i = 0; i < cracks; i++) {
    const angle = (i / cracks) * Math.PI * 2 + 0.4;
    const length = r * (0.7 + 0.9 * Math.abs(Math.sin(i * 1.9)));
    const crack = bevelBoxGeometry(0.006, length, 0.004, 0.0008);
    crack.rotateZ(angle - Math.PI / 2);
    crack.translate(at[0] + Math.cos(angle) * (r + length * 0.4), at[1] + Math.sin(angle) * (r + length * 0.4), 0.003);
    parts.push(crack);
  }

  const merged = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  if (plane === "z+") merged.translate(0, 0, t / 2 + 0.001);
  else if (plane === "z-") {
    merged.rotateY(Math.PI);
    merged.translate(0, 0, -t / 2 - 0.001);
  } else if (plane === "x-") {
    merged.rotateY(-Math.PI / 2);
    merged.translate(-t / 2 - 0.001, 0, 0);
  } else {
    throw new Error(`damageScarV：未知 plane "${plane}"`);
  }
  return merged;
};

/** 水平板凹陷（顶面 +Y）：发动机舱盖 / 顶甲板。 */
const damageScarH: GeometryBuilder = (spec) => {
  const params = (spec as { params?: Params }).params;
  const t = num(params, "t", 0.025);
  const at = pair(params, "at", [0, 0]);
  const r = num(params, "r", 0.16);
  const parts: THREE.BufferGeometry[] = [];
  const ring = tubeGeometry(r, r * 0.58, 0.008, 28);
  ring.translate(at[0], 0.004, at[1]);
  parts.push(ring);
  const dish = cylinderGeometry(r * 0.58, 0.005, r * 0.58, 24, 0.0008);
  dish.translate(at[0], 0.001, at[1]);
  parts.push(dish);
  const cracks = 7;
  for (let i = 0; i < cracks; i++) {
    const angle = (i / cracks) * Math.PI * 2 + 0.2;
    const length = r * (0.7 + 0.8 * Math.abs(Math.cos(i * 2.1)));
    const crack = bevelBoxGeometry(0.006, 0.004, length, 0.0008);
    crack.rotateY(-angle);
    crack.translate(
      at[0] + Math.cos(angle) * (r + length * 0.4),
      0.003,
      at[1] + Math.sin(angle) * (r + length * 0.4),
    );
    parts.push(crack);
  }
  const merged = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  merged.translate(0, t / 2 + 0.001, 0);
  return merged;
};

/** 炮盾破碎：右上角缺一大块 + 中心炮口保留 + 后方耳轴/后坐机外露。 */
const mantletBroken: GeometryBuilder = (spec) => {
  const params = (spec as { params?: Params }).params;
  const w = num(params, "w", 0.24); // 厚（X）
  const h = num(params, "h", 0.56);
  const d = num(params, "d", 0.86); // 宽（Z）
  const collarR = num(params, "collarR", 0.16);
  const collarL = num(params, "collarL", 0.1);
  const collarRi = num(params, "collarRi", 0.128);
  const b = Math.min(0.008, w * 0.15, h * 0.08, d * 0.08);
  const hd = d / 2 - b;
  const hh = h / 2 - b;

  const shape = new THREE.Shape();
  shape.moveTo(-hd, -hh);
  shape.lineTo(hd, -hh);
  shape.lineTo(hd, hh);
  // 右上角锯齿状缺块
  shape.lineTo(hd * 0.34, hh);
  shape.lineTo(hd * 0.28, hh * 0.28);
  shape.lineTo(hd * 0.62, hh * 0.18);
  shape.lineTo(hd * 0.52, hh);
  shape.lineTo(-hd, hh);
  shape.closePath();
  const hole = new THREE.Path();
  hole.absarc(0, 0, collarR + b, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  const block = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(w - 2 * b, 0.001),
    bevelEnabled: true,
    bevelThickness: b,
    bevelSize: b,
    bevelSegments: 2,
    steps: 1,
    curveSegments: 36,
  });
  block.translate(0, 0, -(w - 2 * b) / 2);
  block.rotateY(Math.PI / 2);
  block.computeVertexNormals();

  const parts: THREE.BufferGeometry[] = [block];
  const collar = tubeGeometry(collarR, collarRi, collarL, 36);
  collar.rotateZ(Math.PI / 2);
  collar.translate(-(w / 2 + collarL / 2), 0, 0);
  parts.push(collar);

  // 缺块翻边（沿缺口三条边）
  const edges: Array<[number, number, number, number, number]> = [
    [hd * 0.34, hh, hd * 0.28, hh * 0.28, 0.28],
    [hd * 0.28, hh * 0.28, hd * 0.62, hh * 0.18, -0.2],
    [hd * 0.62, hh * 0.18, hd * 0.52, hh, 0.24],
  ];
  for (const [x0, y0, x1, y1, lean] of edges) {
    // 缺口边在世界系里是 (z = -shape.x, y)；翻边板宽沿边、厚沿 X，整体立在炮盾前面
    const z0 = -x0;
    const z1 = -x1;
    const length = Math.hypot(z1 - z0, y1 - y0);
    const flap = bevelBoxGeometry(length, 0.014, w * 0.65, 0.0015);
    flap.rotateY(Math.PI / 2);
    flap.rotateX(Math.atan2(y1 - y0, z1 - z0));
    flap.rotateZ(lean);
    flap.translate(-(w / 2 + 0.009), (y0 + y1) / 2, (z0 + z1) / 2);
    parts.push(flap);
  }

  // 内部：耳轴座 + 后坐机筒 + 线束（从缺口看进去）
  const trunnion = cylinderGeometry(0.075, 0.34, 0.075, 20, 0.004);
  trunnion.rotateZ(Math.PI / 2);
  trunnion.translate(-0.02, hh * 0.1, hd * 0.32);
  parts.push(trunnion);
  const recoil = cylinderGeometry(0.055, 0.55, 0.055, 18, 0.003);
  recoil.rotateZ(Math.PI / 2);
  recoil.translate(-0.12, hh * 0.52, hd * 0.55);
  parts.push(recoil);
  const wire = cylinderGeometry(0.008, 0.5, 0.008, 8, 0);
  wire.rotateZ(Math.PI / 2);
  wire.translate(-0.08, hh * 0.42, hd * 0.5);
  parts.push(wire);

  const merged = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  return merged;
};

// ---------------------------------------------------------------------------
// 燃油箱（虎式补全）
// ---------------------------------------------------------------------------

/** 油箱本体 + 3 道固定箍 + 加油颈/盖 + 油位传感器 + 出油管。 */
const fuelTank: GeometryBuilder = (spec) => {
  const params = (spec as { params?: Params }).params;
  const w = num(params, "w", 0.52);
  const h = num(params, "h", 0.68);
  const d = num(params, "d", 0.28);
  const side: 1 | -1 = num(params, "side", 1) >= 0 ? 1 : -1;
  const parts: THREE.BufferGeometry[] = [];

  const body = bevelBoxGeometry(w, h, d, 0.012);
  parts.push(body);
  for (const u of [-0.32, 0, 0.32]) {
    const strap = bevelBoxGeometry(w + 0.016, 0.03, d + 0.016, 0.004);
    strap.translate(u * w * 0.5, 0, 0);
    parts.push(strap);
  }
  // 加油颈朝车外侧上方（通孔，接甲板加注管；盖上甲板盖才是密封面），出油管朝车内侧
  const neck = tubeGeometry(0.062, 0.048, 0.09, 20);
  neck.translate(w * 0.3, h / 2 + 0.03, side * d * 0.22);
  parts.push(neck);
  const sender = cylinderGeometry(0.045, 0.05, 0.045, 16, 0.003);
  sender.translate(-w * 0.28, h / 2 + 0.02, -side * d * 0.18);
  parts.push(sender);
  const line = cylinderGeometry(0.024, 0.12, 0.024, 14, 0.002);
  line.rotateX(Math.PI / 2);
  line.translate(-w * 0.2, -h / 2 + 0.08, -side * (d / 2 + 0.05));
  parts.push(line);
  const drain = cylinderGeometry(0.024, 0.06, 0.024, 12, 0.002);
  drain.translate(-w * 0.1, -h / 2 - 0.02, 0);
  parts.push(drain);

  const merged = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  return merged;
};

/** 油箱破碎：外侧面撕开，露出防晃隔板 + 吸油管 + 油底壳。 */
const fuelTankBroken: GeometryBuilder = (spec) => {
  const params = (spec as { params?: Params }).params;
  const w = num(params, "w", 0.76);
  const h = num(params, "h", 0.72);
  const d = num(params, "d", 0.3);
  const side: 1 | -1 = num(params, "side", 1) >= 0 ? 1 : -1;
  const t = 0.012;
  const parts: THREE.BufferGeometry[] = [];

  // 箱体五面（外侧留破口）
  const bottom = bevelBoxGeometry(w, t, d, 0.003);
  bottom.translate(0, -h / 2 + t / 2, 0);
  parts.push(bottom);
  const top = bevelBoxGeometry(w, t, d, 0.003);
  top.translate(0, h / 2 - t / 2, 0);
  parts.push(top);
  for (const sx of [-1, 1]) {
    const end = bevelBoxGeometry(t, h, d, 0.003);
    end.translate((sx * (w - t)) / 2, 0, 0);
    parts.push(end);
  }
  const inner = bevelBoxGeometry(w, h, t, 0.003);
  inner.translate(0, 0, (-side * (d - t)) / 2);
  parts.push(inner);

  // 外侧：只剩四条边框，中间是撕裂口
  const border = 0.09;
  for (const [yy, hh] of [
    [h / 2 - border / 2, border],
    [-h / 2 + border / 2, border],
  ] as Array<[number, number]>) {
    const strip = bevelBoxGeometry(w, hh, t, 0.003);
    strip.translate(0, yy, (side * (d - t)) / 2);
    parts.push(strip);
  }
  for (const xx of [w / 2 - border / 2, -w / 2 + border / 2]) {
    const strip = bevelBoxGeometry(border, h - 2 * border, t, 0.003);
    strip.translate(xx, 0, (side * (d - t)) / 2);
    parts.push(strip);
  }
  // 撕口翻边
  for (let i = 0; i < 10; i++) {
    const angle = (i / 10) * Math.PI * 2;
    const px = Math.cos(angle) * (w / 2 - border);
    const py = Math.sin(angle) * (h / 2 - border);
    const length = 0.07 + 0.05 * Math.abs(Math.sin(i * 2.3));
    const flap = bevelBoxGeometry(0.06, length, t * 0.8, 0.0015);
    flap.rotateZ(angle + Math.PI / 2);
    flap.translate(px, py, side * (d / 2 + 0.02));
    parts.push(flap);
  }
  // 防晃隔板
  for (const u of [-0.28, 0, 0.28]) {
    const baffle = bevelBoxGeometry(t, h * 0.86, d * 0.88, 0.003);
    baffle.translate(u * w, 0, 0);
    parts.push(baffle);
  }
  // 吸油管 + 底部残油
  const pickup = cylinderGeometry(0.03, h * 0.8, 0.03, 14, 0.002);
  pickup.translate(w * 0.28, -h * 0.05, 0);
  parts.push(pickup);
  const fuel = cylinderGeometry(w * 0.38, 0.05, w * 0.38, 24, 0.002);
  fuel.translate(0, -h / 2 + 0.045, 0);
  parts.push(fuel);

  const merged = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  return merged;
};

// ---------------------------------------------------------------------------
// 排气烟几何（fx）——爆炸/火焰改用 three.quarks 粒子（app/three/vfx）
// ---------------------------------------------------------------------------

/**
 * 打开的燃油加注口：底座圈 + 通孔颈管 + 铰链 + 支起的盖盘 + 提手。
 * 盖盘绕 X 轴掀起 68°（向外侧），从上方能直接看到颈孔和下面的加注管。
 */
const fuelFillerCap: GeometryBuilder = () => {
  const parts: THREE.BufferGeometry[] = [];
  const base = tubeGeometry(0.09, 0.066, 0.02, 28);
  base.translate(0, 0.01, 0);
  parts.push(base);
  const neck = tubeGeometry(0.068, 0.052, 0.062, 24);
  neck.translate(0, 0.051, 0);
  parts.push(neck);
  const hinge = bevelBoxGeometry(0.18, 0.018, 0.03, 0.002);
  hinge.translate(0, 0.078, 0.074);
  parts.push(hinge);
  const angle = THREE.MathUtils.degToRad(68);
  const lid = cylinderGeometry(0.082, 0.014, 0.082, 28, 0.002);
  lid.translate(0, 0, 0.082); // 铰链边落在局部 z=0
  lid.rotateX(-angle);
  lid.translate(0, 0.078, 0.074);
  parts.push(lid);
  const handle = bevelBoxGeometry(0.12, 0.024, 0.022, 0.003);
  handle.translate(
    0,
    0.078 + Math.sin(angle) * 0.15,
    0.074 + Math.cos(angle) * 0.15,
  );
  parts.push(handle);
  // 防丢链：从铰链座垂到盖盘内侧的两段短链节
  const chain = bevelBoxGeometry(0.012, 0.11, 0.008, 0.001);
  chain.translate(-0.06, 0.095, 0.1);
  parts.push(chain);
  const merged = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  return merged;
};

/** 烟雾团：多个低面数球组成的粗糙云（材质透明）。 */
const smokePuff: GeometryBuilder = (spec) => {
  const params = (spec as { params?: Params }).params;
  const r = num(params, "r", 0.3);
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 9; i++) {
    const angle = (i / 9) * Math.PI * 2 + (i % 2) * 0.4;
    const bubble = new THREE.SphereGeometry(r * (0.5 + 0.38 * (((i * 7) % 5) / 5)), 14, 10);
    bubble.translate(
      Math.cos(angle) * r * (0.45 + 0.25 * ((i * 3) % 4) / 4),
      ((i % 4) / 3 - 0.3) * r * 0.7,
      Math.sin(angle) * r * (0.45 + 0.25 * ((i * 5) % 3) / 3),
    );
    parts.push(bubble);
  }
  const merged = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  return merged;
};

export const tigerDamageKitBuilders: Record<string, GeometryBuilder> = {
  damagePlate,
  damageScarV,
  damageScarH,
  mantletBroken,
  fuelTank,
  fuelTankBroken,
  fuelFillerCap,
  smokePuff,
};
