import * as THREE from "three";
import {
  bevelBoxGeometry,
  cylinderGeometry,
  latheGeometry,
  mergeGeometries,
  tubeGeometry,
} from "../../../kernel/geometry";
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

// ============================================================================
// L4-e 起补充的三个 kit：球形枪座 / 机枪枪管 / 焊接吊环
// ============================================================================

/**
 * 航向机枪球形枪座（Kugelblende 50）：座圈 + 球冠 + 一圈六角头螺栓。
 * 局部：轴线沿 -X（车头方向），原点在首装甲板外面（局部 x = 0 即板面），几何全部在 x ≤ -3mm。
 * 球冠的「球心」落在板厚之内（数学球心），但几何只建到球冠底面为止——底面离板面 3mm，
 * 不会与开孔板发生穿透。
 */
const mgBall: GeometryBuilder = (spec) => {
  const params = (spec as { params?: Params }).params;
  const rOuter = num(params, "rOuter", 0.14);
  const rInner = num(params, "rInner", 0.085);
  const t = num(params, "t", 0.03);
  const gap = num(params, "gap", 0.003);
  const rBall = num(params, "rBall", 0.115);
  const protrude = num(params, "protrude", 0.1);
  const boltR = num(params, "boltR", 0.011);
  const boltRing = num(params, "boltRing", 0.115);
  const bolts = Math.max(3, Math.round(num(params, "bolts", 8)));

  const parts: THREE.BufferGeometry[] = [];

  // 座圈：后端面（贴板面一侧）在 gap，前端面倒角。
  // 回转体剖面绕 Y 旋转，rotateZ(90°) 后剖面的 +y 成为世界 -X（车头方向）。
  const collar: [number, number][] = [
    [rInner, gap],
    [rOuter, gap],
    [rOuter, gap + t * 0.7],
    [rOuter - 0.01, gap + t],
    [rInner + 0.021, gap + t],
    [rInner, gap + t * 0.84],
    [rInner, gap],
  ];
  const collarGeo = latheGeometry(collar, 40);
  collarGeo.rotateZ(Math.PI / 2);
  parts.push(collarGeo);

  // 球冠：底面在 gap（离板面 3mm）、顶点在 gap + protrude
  const yBase = gap;
  const yApex = gap + protrude;
  const yCenter = yApex - rBall;
  const cosT = Math.min(Math.max((yBase - yCenter) / rBall, -1), 1);
  const t0 = Math.acos(cosT);
  const dome: [number, number][] = [
    [0.0005, yBase],
    [rBall * Math.sin(t0), yBase],
  ];
  const steps = 10;
  for (let i = 1; i <= steps; i++) {
    const th = t0 * (1 - i / steps);
    dome.push([Math.max(rBall * Math.sin(th), 0.0005), yCenter + rBall * Math.cos(th)]);
  }
  const domeGeo = latheGeometry(dome, 40);
  domeGeo.rotateZ(Math.PI / 2);
  parts.push(domeGeo);

  // 座圈螺栓：沿前端面圆周均布，头高 8mm
  for (let i = 0; i < bolts; i++) {
    const a = (Math.PI * 2 * i) / bolts;
    const head = cylinderGeometry(boltR, 0.008, boltR * 0.88, 6, 0.0015);
    head.rotateZ(Math.PI / 2);
    head.translate(-(gap + t + 0.004), boltRing * Math.cos(a), boltRing * Math.sin(a));
    parts.push(head);
  }

  const merged = mergeGeometries(parts);
  for (const item of parts) item.dispose();
  return merged;
};

/**
 * 航向机枪枪管（MG34）：枪管 + 散热套（含前后箍）+ 枪口助退器 + 准星座。
 * 局部：轴线沿 -X，原点在枪管尾端（装配时落在球座球冠顶点前方 3mm）。
 */
const mgBarrel: GeometryBuilder = (spec) => {
  const params = (spec as { params?: Params }).params;
  const r = num(params, "r", 0.012);
  const len = num(params, "len", 0.3);
  const jacketR = num(params, "jacketR", 0.027);
  const jacketL = num(params, "jacketL", 0.16);
  const jacketX = num(params, "jacketX", 0.03);

  const parts: THREE.BufferGeometry[] = [];

  const barrel = cylinderGeometry(r, len, r * 0.95, 20, 0.0015);
  barrel.rotateZ(Math.PI / 2);
  barrel.translate(-len / 2, 0, 0);
  parts.push(barrel);

  const jacket = tubeGeometry(jacketR, r + 0.005, jacketL, 28);
  jacket.rotateZ(Math.PI / 2);
  jacket.translate(-(jacketX + jacketL / 2), 0, 0);
  parts.push(jacket);

  for (const dx of [jacketX, jacketX + jacketL]) {
    const ring = tubeGeometry(jacketR + 0.004, r + 0.004, 0.016, 28);
    ring.rotateZ(Math.PI / 2);
    ring.translate(-dx, 0, 0);
    parts.push(ring);
  }

  const muzzle = cylinderGeometry(0.018, 0.036, 0.016, 18, 0.002);
  muzzle.rotateZ(Math.PI / 2);
  muzzle.translate(-(len + 0.018), 0, 0);
  parts.push(muzzle);

  const tip = cylinderGeometry(0.013, 0.026, 0.012, 18, 0.0015);
  tip.rotateZ(Math.PI / 2);
  tip.translate(-(len + 0.049), 0, 0);
  parts.push(tip);

  const sight = bevelBoxGeometry(0.012, 0.03, 0.012, 0.0015, 1);
  sight.translate(-(len * 0.86), 0.023, 0);
  parts.push(sight);

  const merged = mergeGeometries(parts);
  for (const item of parts) item.dispose();
  return merged;
};

/**
 * 焊接吊环（Anschlagpunkt）：底板 + 两片立板 + 横销。
 * 局部：+Y = 安装面法线（安装面在 y = 0），几何全部在 y ≥ 3mm；横销轴沿 Z。
 */
const liftingEye: GeometryBuilder = (spec) => {
  const params = (spec as { params?: Params }).params;
  const gap = num(params, "gap", 0.003);
  const w = num(params, "w", 0.1);
  const d = num(params, "d", 0.07);
  const t = num(params, "t", 0.012);

  const parts: THREE.BufferGeometry[] = [];

  const base = bevelBoxGeometry(w, t, d, 0.002, 1);
  base.translate(0, gap + t / 2, 0);
  parts.push(base);

  for (const sz of [-1, 1]) {
    const plate = bevelBoxGeometry(0.024, 0.05, 0.014, 0.0015, 1);
    plate.translate(0, gap + t + 0.024, sz * 0.021);
    parts.push(plate);
  }

  const pin = cylinderGeometry(0.008, 0.063, 0.008, 14, 0.0012);
  pin.rotateX(Math.PI / 2);
  pin.translate(0, gap + t + 0.044, 0);
  parts.push(pin);

  const merged = mergeGeometries(parts);
  for (const item of parts) item.dispose();
  return merged;
};

// ---------------------------------------------------------------------------
// 履带挡板 / 前后挡泥板（Kotflügel）
// 局部系：原点 = 挡板下表面·前端·内缘；+x 向后、+z 向外。全长 5.41 / 全宽 0.94。
// 挡板 15 厚 + 前后各一块 260 活页挡泥板（下折 35°）+ 内侧 5 道支撑肋（贴车体侧留 3mm）。
// ---------------------------------------------------------------------------
const trackGuard: GeometryBuilder = (spec) => {
  const params = (spec as { params?: Params }).params;
  const len = num(params, "len", 5.41);
  const width = num(params, "width", 0.94);
  const t = num(params, "t", 0.015);
  const flapLen = num(params, "flapLen", 0.26);
  const flapAngle = num(params, "flapAngle", 35);
  const ribH = num(params, "ribH", 0.1);

  const parts: THREE.BufferGeometry[] = [];

  // 挡板主体
  const guard = bevelBoxGeometry(len, t, width, 0.003);
  guard.translate(len / 2, t / 2, width / 2);
  parts.push(guard);

  // 前后挡泥板（绕端部铰线往下折 35°）
  const a = THREE.MathUtils.degToRad(flapAngle);
  const front = bevelBoxGeometry(flapLen, 0.012, width, 0.002);
  front.translate(-flapLen / 2 + 0.005, 0.006, width / 2);
  front.rotateZ(a);
  parts.push(front);
  const rear = bevelBoxGeometry(flapLen, 0.012, width, 0.002);
  rear.translate(flapLen / 2 - 0.005, 0.006, width / 2);
  rear.rotateZ(-a);
  rear.translate(len, 0, 0);
  parts.push(rear);

  // 内侧支撑肋 ×5（每道 18 × 100 × 520）
  for (let i = 0; i < 5; i++) {
    const rib = bevelBoxGeometry(0.018, ribH, 0.52, 0.002);
    rib.translate(0.25 + i * 1.2, -ribH / 2, 0.29);
    parts.push(rib);
  }

  const merged = mergeGeometries(parts);
  for (const item of parts) item.dispose();
  return merged;
};

// ---------------------------------------------------------------------------
// 赞助板壳体（上部车体外翼）：地板 + 外壁 + 顶板 + 前后封板，一件一侧
// 局部系：原点 = 地板下表面·前端·内缘；+x 向后、y 上。侧别由 side = ±1 控制 z 方向
// （所有块体关于自身 z 中心对称，不需要镜像矩阵，避免法线翻转）。
// ---------------------------------------------------------------------------
const sponsonShell: GeometryBuilder = (spec) => {
  const params = (spec as { params?: Params }).params;
  const side = num(params, "side", 1) < 0 ? -1 : 1;
  const len = num(params, "len", 5.41);
  const width = num(params, "width", 0.8145);
  const wallT = num(params, "wallT", 0.06);
  const floorT = num(params, "floorT", 0.02);
  const wallH = num(params, "wallH", 0.895);
  const deckT = num(params, "deckT", 0.03);

  const parts: THREE.BufferGeometry[] = [];

  // 地板（z 0 ~ width）
  const floor = bevelBoxGeometry(len, floorT, width, 0.003);
  floor.translate(len / 2, floorT / 2, (side * width) / 2);
  parts.push(floor);

  // 外壁（外表面与 z = width 齐平）
  const wall = bevelBoxGeometry(len, wallH, wallT, 0.003);
  wall.translate(len / 2, floorT + wallH / 2, side * (width - wallT / 2));
  parts.push(wall);

  // 顶板（顶面 = 1.075，与顶盖齐平；内缘离顶盖 3mm）
  const deck = bevelBoxGeometry(len, deckT, width, 0.003);
  deck.translate(len / 2, floorT + wallH + deckT / 2, (side * width) / 2);
  parts.push(deck);

  // 前后封板（与首/尾板同平面，只占 z 0.9655 以外）
  for (const x of [0.02, len - 0.02]) {
    const cap = bevelBoxGeometry(0.04, wallH, width, 0.003);
    cap.translate(x, floorT + wallH / 2, (side * width) / 2);
    parts.push(cap);
  }

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
  mgBall,
  mgBarrel,
  liftingEye,
  trackGuard,
  sponsonShell,
};
