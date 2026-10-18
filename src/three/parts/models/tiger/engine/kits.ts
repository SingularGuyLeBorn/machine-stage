import * as THREE from "three";
import {
  airfoilGeometry,
  bevelBoxGeometry,
  boltCircleGeometry,
  cylinderGeometry,
  latheGeometry,
  mergeGeometries,
  tubeGeometry,
} from "../../../kernel/geometry";
import type { GeometryBuilder } from "../../../assembler/geometry";
import { beltGeometry } from "./kinematics";

// ============================================================================
// models/tiger/engine/kits —— HL230 专用几何构造器
//
// 声明式几何语言（box/cylinder/lathe/merge…）覆盖不了「带镗孔的机体」这类
// 需要二维轮廓挖孔的零件，因此发动机把这几类形状做成 kit：
//   borePlate      带中心镗孔的圆角矩形板（曲轴箱隔板 / 轴承座 / 端板 / 油底壳）
//   siameseBlock   连体缸壁（缸心距 158mm < 缸壁外径 → 相邻缸必须切平共壁）
//   cylinderHead   缸盖（本体 + 两只气门导管座 + 进排气法兰 + 缸盖螺栓）
//   camCover       凸轮轴罩（U 形罩壳 + 加油口 + 加强肋）
//   crankWeb       曲柄臂（主轴颈盘 + 曲柄销座 + 配重）
//   fanRotor       风扇转子（轮毂 + 皮带轮槽 + N 片扭转翼型叶）
//   beltLoop       V 皮带环（开口皮带外切几何，与 kinematics.beltGeometry 同源）
//   manifold       歧管（主管 + N 根弯曲支管）
//
// 局部系约定（务必与 mate / instance_layout 的旋转配套）：
//   borePlate / siameseBlock / cylinderHead / camCover：+Y = 缸轴线（向上挤出，原点在底面）
//   crankWeb：+X = 曲轴轴向，+Y = 曲柄销方向（layout 绕 X 旋转到相位角）
//   fanRotor：+X = 风扇转轴
//   beltLoop：+X = 带宽方向，+Z = 从主动轮到被动轮的方向
// ============================================================================

type Params = Record<string, unknown>;

function num(params: Params | undefined, key: string, fallback?: number): number {
  const value = params?.[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (fallback !== undefined) return fallback;
  throw new Error(`tiger kit：参数 "${key}" 必须是数值（收到 ${String(value)}）`);
}

function tuple(
  params: Params | undefined,
  key: string,
  fallback?: [number, number, number],
): [number, number, number] {
  const value = params?.[key];
  if (Array.isArray(value) && value.length === 3 && value.every((item) => typeof item === "number")) {
    return value as [number, number, number];
  }
  if (fallback) return fallback;
  throw new Error(`tiger kit：参数 "${key}" 必须是三元数组`);
}

function roundedRectPath(width: number, height: number, radius: number, target: THREE.Shape): THREE.Shape {
  const halfW = Math.max(width, 0.001) / 2;
  const halfH = Math.max(height, 0.001) / 2;
  const r = Math.max(Math.min(radius, halfW * 0.98, halfH * 0.98), 0.0004);
  target.moveTo(-halfW + r, -halfH);
  target.lineTo(halfW - r, -halfH);
  target.absarc(halfW - r, -halfH + r, r, -Math.PI / 2, 0, false);
  target.lineTo(halfW, halfH - r);
  target.absarc(halfW - r, halfH - r, r, 0, Math.PI / 2, false);
  target.lineTo(-halfW + r, halfH);
  target.absarc(-halfW + r, halfH - r, r, Math.PI / 2, Math.PI, false);
  target.lineTo(-halfW, -halfH + r);
  target.absarc(-halfW + r, -halfH + r, r, Math.PI, Math.PI * 1.5, false);
  target.closePath();
  return target;
}

function circleHole(radius: number, target: THREE.Path): THREE.Path {
  target.absarc(0, 0, Math.max(radius, 0.004), 0, Math.PI * 2, true);
  return target;
}

/** 沿 +Y 挤出：截面在 XY，挤出后原点落在底面中心，截面 X→X、Y→-Z（对称件无影响）。 */
function extrudeUpAlongY(shape: THREE.Shape, height: number, bevel: number): THREE.BufferGeometry {
  const h = Math.max(height, 0.002);
  const b = Math.max(Math.min(bevel, h * 0.3), 0.0004);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(h - 2 * b, 0.001),
    bevelEnabled: true,
    bevelThickness: b,
    bevelSize: b,
    bevelSegments: 2,
    curveSegments: 16,
    steps: 1,
  });
  geometry.rotateX(-Math.PI / 2); // 挤出方向 +Z → +Y
  geometry.computeBoundingBox();
  geometry.translate(0, -geometry.boundingBox!.min.y, 0);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/** 带中心镗孔的圆角矩形板（axis="y"：向上挤出，原点在底面；axis="x"：沿 X 挤出，原点居中）。 */
const borePlate: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const w = num(p, "w", 0.24);
  const d = num(p, "d", 0.24);
  const h = num(p, "h", 0.03);
  const bore = num(p, "bore", 0.06);
  const corner = num(p, "corner", 0.03);
  const bevel = num(p, "bevel", 0.003);
  const axis = typeof p?.axis === "string" ? (p.axis as string) : "y";
  const shape = roundedRectPath(w, d, corner, new THREE.Shape());
  shape.holes.push(circleHole(bore, new THREE.Path()));
  const geometry = extrudeUpAlongY(shape, h, bevel);
  if (axis === "y") return geometry;
  // 换轴：把「挤出方向 = +Y、截面 X/Y」的板转成「挤出方向 = +X、截面 Z/Y」，原点居中
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  geometry.translate(0, -(box.min.y + box.max.y) / 2, 0);
  geometry.rotateZ(-Math.PI / 2); // +Y → +X，截面 X → -Y（对称件无影响）
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
};

/** 连体缸壁：外圆角矩形（受缸心距限制切平）+ 水套镗孔 + 顶面缸肩 + 两道加强肋。 */
const siameseBlock: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const w = num(p, "w");
  const d = num(p, "d", w);
  const h = num(p, "h");
  const jacket = num(p, "jacket");
  const corner = num(p, "corner", 0.012);
  const shape = roundedRectPath(w, d, corner, new THREE.Shape());
  shape.holes.push(circleHole(jacket, new THREE.Path()));
  const body = extrudeUpAlongY(shape, h, 0.002);

  const parts: THREE.BufferGeometry[] = [body];

  // 顶面缸肩只在 Z 向加宽：X 向必须留在缸心距以内（否则相邻缸肩互相插入）
  // deckH / ribH 传 0 时退化为「薄板 + 镗孔」（缸垫、隔板等）。
  const deckH = num(p, "deckH", 0.014);
  if (deckH > 0.0005) {
    const deck = bevelBoxGeometry(w - 0.002, deckH, d + 0.014, 0.002);
    deck.translate(0, h - deckH / 2, 0);
    parts.push(deck);
  }

  const ribH = num(p, "ribH", 0.011);
  if (ribH > 0.0005) {
    for (const sign of [-1, 1]) {
      const rib = bevelBoxGeometry(w - 0.004, ribH, 0.012, 0.0015);
      rib.translate(0, h * 0.4, sign * (d / 2 + 0.004));
      parts.push(rib);
    }
  }

  const merged = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  return merged;
};

/** 缸盖：本体（含燃烧室孔）+ 两只气门导管座 + 进排气法兰 + 每缸 4 颗缸盖螺栓头。 */
const cylinderHead: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const w = num(p, "w");
  const d = num(p, "d", w);
  const h = num(p, "h", 0.085);
  const chamber = num(p, "chamber", 0.066);
  const shape = roundedRectPath(w, d, 0.014, new THREE.Shape());
  shape.holes.push(circleHole(chamber, new THREE.Path()));
  const body = extrudeUpAlongY(shape, h, 0.003);
  const parts: THREE.BufferGeometry[] = [body];

  // 气门导管/摇臂机构不在本层建模（M-C）：气门本体直接站在缸盖燃烧室孔内，
  // 因此这里只保留燃烧室孔、进排气法兰与缸盖螺栓，避免与气门几何互相插入。
  const portW = num(p, "portW", 0.054);
  for (const sign of [-1, 1]) {
    const flange = bevelBoxGeometry(portW, 0.032, 0.018, 0.002);
    flange.translate(0, h * 0.45, sign * (d / 2 + 0.007));
    parts.push(flange);
    const stub = cylinderGeometry(0.024, 0.028, 0.024, 18, 0.0015);
    stub.rotateX(Math.PI / 2);
    stub.translate(0, h * 0.45, sign * (d / 2 + 0.024));
    parts.push(stub);
  }

  const bolts = boltCircleGeometry(4, num(p, "boltRadius", w * 0.33), 0.011, 0.012);
  bolts.translate(0, h, 0);
  parts.push(bolts);

  const merged = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  return merged;
};

/**
 * 凸轮轴罩：沿 X 的长条罩壳（两侧壁 + 顶板 + 两端封盖 + 加强肋 + 可选加油口）。
 * 局部系：+X = 长度方向（曲轴轴向），+Y = 缸列轴线（向上），+Z = 缸列横向。
 */
const camCover: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const length = num(p, "length", 0.9);
  const halfZ = num(p, "halfZ", 0.048);
  const height = num(p, "height", 0.082);
  const wall = num(p, "wall", 0.008);
  const parts: THREE.BufferGeometry[] = [];

  const top = bevelBoxGeometry(length, wall, halfZ * 2, 0.0025);
  top.translate(0, height - wall / 2, 0);
  parts.push(top);

  for (const sign of [-1, 1]) {
    const side = bevelBoxGeometry(length, height - wall, wall, 0.0025);
    side.translate(0, (height - wall) / 2, sign * (halfZ - wall / 2));
    parts.push(side);
    // 加强肋
    const rib = bevelBoxGeometry(0.01, 0.009, wall + 0.006, 0.0015);
    rib.translate(sign * length * 0.24, height - wall - 0.004, sign * halfZ);
    parts.push(rib);
  }
  for (const sign of [-1, 1]) {
    const end = bevelBoxGeometry(wall, height - wall, (halfZ - wall) * 2, 0.0025);
    end.translate(sign * (length / 2 - wall / 2), (height - wall) / 2, 0);
    parts.push(end);
  }

  if (num(p, "filler", 0) > 0) {
    const filler = latheGeometry(
      [
        [0.026, 0],
        [0.032, 0.002],
        [0.032, 0.014],
        [0.024, 0.02],
        [0.024, 0.03],
        [0, 0.03],
      ],
      24,
    );
    filler.translate(length * 0.3, height, 0);
    parts.push(filler);
  }

  const merged = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  return merged;
};

/**
 * 冷却风扇支架：横梁（沿 Z）+ 两条斜撑 + 两个地脚（贴正时盖前端面）
 * + 两侧风扇导流罩环（各由两条斜撑连到横梁）——罩环与支架一体，避免悬空零件。
 * 局部系：+X 向前（离开发动机），+Y 上，原点在前端板前端面外 2mm。
 */
const fanFrame: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const beamX = num(p, "beamX", 0.03);
  const beamDepth = num(p, "beamDepth", 0.045);
  const beamH = num(p, "beamH", 0.09);
  const halfSpan = num(p, "halfSpan", 0.34);
  const beamY = num(p, "beamY", 0.34);
  const legTopZ = num(p, "legTopZ", 0.26);
  const footZ = num(p, "footZ", 0.1);
  const footY = num(p, "footY", 0.19);
  const legW = num(p, "legW", 0.03);
  const footLen = num(p, "footLen", 0.05);
  const fanZ = num(p, "fanZ", 0.3);
  const shroudR = num(p, "shroudR", 0.239);
  const shroudWall = num(p, "shroudWall", 0.012);
  const shroudH = num(p, "shroudH", 0.09);
  const shroudX = num(p, "shroudX", 0.115);
  const accBeamY = num(p, "accBeamY", 0.06);
  const accHalfSpan = num(p, "accHalfSpan", 0.26);
  const accBeamH = num(p, "accBeamH", 0.055);

  const parts: THREE.BufferGeometry[] = [];
  const beam = bevelBoxGeometry(beamDepth, beamH, halfSpan * 2, 0.003);
  beam.translate(beamX, beamY, 0);
  parts.push(beam);

  // 下横梁（附件梁）：水泵 / 发电机装在其前端面
  const accBeam = bevelBoxGeometry(beamDepth, accBeamH, accHalfSpan * 2, 0.003);
  accBeam.translate(beamX, accBeamY, 0);
  parts.push(accBeam);

  const topY = beamY - beamH / 2;
  const beamFrontX = beamX + beamDepth / 2;
  for (const side of [-1, 1]) {
    // 斜撑（上横梁 → 机脚）+ 立撑（机脚 → 附件梁）
    const from = new THREE.Vector3(beamX, topY, side * legTopZ);
    const to = new THREE.Vector3(beamX, footY, side * footZ);
    const delta = new THREE.Vector3().subVectors(to, from);
    const angle = Math.atan2(delta.z, delta.y);
    const leg = bevelBoxGeometry(legW, delta.length() + 0.008, legW * 1.15, 0.002);
    leg.rotateX(angle);
    leg.translate((from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2);
    parts.push(leg);

    const lowerFrom = new THREE.Vector3(beamX, footY, side * footZ);
    const lowerTo = new THREE.Vector3(beamX, accBeamY + accBeamH / 2 - 0.004, side * footZ);
    const lower = bevelBoxGeometry(legW, Math.abs(lowerFrom.y - lowerTo.y) + 0.008, legW * 1.15, 0.002);
    lower.translate(beamX, (lowerFrom.y + lowerTo.y) / 2, side * footZ);
    parts.push(lower);

    // 地脚：贴正时盖前端面
    const foot = bevelBoxGeometry(footLen, 0.03, legW * 2.2, 0.002);
    foot.translate(beamX - footLen / 2 + 0.0195, footY, side * footZ);
    parts.push(foot);

    // 导流罩环（内径 = 叶尖半径 + 4mm）
    const ring = tubeGeometry(shroudR + shroudWall, shroudR, shroudH, 40);
    ring.rotateZ(-Math.PI / 2);
    ring.translate(shroudX + shroudH / 2, beamY, side * fanZ);
    parts.push(ring);

    // 罩环 → 横梁前端面的两条斜撑（在风扇圆盘平面上方/下方，避开风扇与带轮）
    for (const vs of [-1, 1]) {
      const a = new THREE.Vector3(beamFrontX, beamY + vs * (beamH / 2), side * fanZ);
      const b = new THREE.Vector3(shroudX, beamY + vs * shroudR, side * fanZ);
      const tabDelta = new THREE.Vector3().subVectors(b, a);
      const tabAngle = Math.atan2(tabDelta.y, tabDelta.x);
      const tab = bevelBoxGeometry(tabDelta.length() + 0.01, 0.03, 0.024, 0.002);
      tab.rotateZ(tabAngle);
      tab.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
      parts.push(tab);
    }
  }

  const merged = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  return merged;
};

/** 曲柄臂：主轴颈盘 + 曲柄销座 + 配重。局部 +Y = 曲柄销方向，+X = 曲轴轴向。 */
const crankWeb: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const thickness = num(p, "t", 0.022);
  const webR = num(p, "webR", 0.098);
  const pinOffset = num(p, "pinOffset", 0.0725);
  const pinR = num(p, "pinR", 0.036);
  const journalR = num(p, "journalR", 0.042);
  const counterR = num(p, "counterR", 0.114);

  const disc = cylinderGeometry(webR, thickness, webR, 30, 0);
  disc.rotateZ(-Math.PI / 2);

  const counter = cylinderGeometry(counterR * 0.7, thickness, counterR * 0.7, 28, 0);
  counter.rotateZ(-Math.PI / 2);
  counter.translate(0, -(webR - counterR * 0.7) * 0.92, 0);

  const boss = cylinderGeometry(pinR + 0.014, thickness, pinR + 0.014, 24, 0);
  boss.rotateZ(-Math.PI / 2);
  boss.translate(0, pinOffset, 0);

  const journal = cylinderGeometry(journalR + 0.008, thickness, journalR + 0.008, 24, 0);
  journal.rotateZ(-Math.PI / 2);

  const merged = mergeGeometries([disc, counter, boss, journal]);
  disc.dispose();
  counter.dispose();
  boss.dispose();
  journal.dispose();
  return merged;
};

/** 风扇转子：轮毂 + 双槽 V 带轮 + N 片扭转翼型叶。局部 +X = 转轴。 */
const fanRotor: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const blades = Math.max(3, Math.round(num(p, "blades", 8)));
  const rHub = num(p, "rHub", 0.062);
  const rTip = num(p, "rTip", 0.235);
  const chord = num(p, "chord", 0.078);
  const pitchDeg = num(p, "pitchDeg", 32);
  const hubWidth = num(p, "hubWidth", 0.07);
  const pulleyR = num(p, "pulleyR", 0.0792);
  const pulleyW = num(p, "pulleyW", 0.021);
  const pulleyX = num(p, "pulleyX", 0.069);
  const shaftR = num(p, "shaftR", 0.032);

  const parts: THREE.BufferGeometry[] = [];

  // 轮毂 + 前伸细轴 + 单槽凸脊带轮（带轮必须整体位于叶片弦长范围之前，否则皮带与叶片互插）
  const hub = latheGeometry(
    [
      [0, -hubWidth / 2],
      [rHub * 0.72, -hubWidth / 2],
      [rHub * 0.72, hubWidth / 2],
      [shaftR, hubWidth / 2 + 0.004],
      [shaftR, pulleyX - pulleyW / 2],
      [pulleyR - 0.012, pulleyX - pulleyW / 2],
      [pulleyR - 0.004, pulleyX - pulleyW * 0.24],
      [pulleyR, pulleyX],
      [pulleyR - 0.004, pulleyX + pulleyW * 0.24],
      [pulleyR - 0.012, pulleyX + pulleyW / 2],
      [shaftR, pulleyX + pulleyW / 2],
      [shaftR, pulleyX + pulleyW / 2 + 0.004],
      [0, pulleyX + pulleyW / 2 + 0.004],
    ],
    28,
  );
  hub.rotateZ(-Math.PI / 2);
  parts.push(hub);

  const span = Math.max(rTip - rHub, 0.02);
  for (let i = 0; i < blades; i++) {
    const blade = airfoilGeometry(chord, span, 0.11, 10, 0.004);
    blade.rotateX(-Math.PI / 2); // 展向 → +Y（径向），弦长仍沿 +X（流向）
    blade.rotateY(THREE.MathUtils.degToRad(pitchDeg)); // 桨距角
    blade.translate(0, rHub + span / 2, 0);
    blade.rotateX((i / blades) * Math.PI * 2);
    parts.push(blade);
  }

  const merged = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  return merged;
};

/**
 * V 皮带环（开口皮带外切几何）：局部 +X = 带宽，+Z = 主动轮 → 被动轮方向。
 * 轮廓 = 外圈 + 内圈（作为孔），两圈都用同一条切线构造，带宽即两圈之差。
 */
const beltLoop: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const rDriving = num(p, "rDriving", 0.09);
  const rDriven = num(p, "rDriven", 0.1);
  const centerDistance = num(p, "d", 0.45);
  const width = num(p, "width", 0.016);
  const halfThickness = num(p, "halfThickness", 0.0035);

  const contour = (offset: number, target: THREE.Path): THREE.Path => {
    const r1 = Math.max(rDriving + offset, 0.008);
    const r2 = Math.max(rDriven + offset, 0.008);
    const d = Math.max(centerDistance, Math.abs(r2 - r1) + 0.01);
    const psi = Math.asin(THREE.MathUtils.clamp((r2 - r1) / d, -0.999, 0.999));
    const nx = -Math.sin(psi);
    const ny = Math.cos(psi);
    const anglePlus = Math.atan2(ny, nx); // 法线方向角
    const angleMinus = anglePlus + Math.PI;
    target.moveTo(r1 * nx, r1 * ny);
    target.lineTo(d + r2 * nx, r2 * ny);
    target.absarc(d, 0, r2, anglePlus, angleMinus, false); // 被动轮包角 π − 2ψ
    target.lineTo(-r1 * nx, -r1 * ny);
    target.absarc(0, 0, r1, angleMinus, anglePlus + Math.PI * 2, false); // 主动轮包角 π + 2ψ
    target.closePath();
    return target;
  };

  const shape = new THREE.Shape();
  contour(halfThickness, shape);
  shape.holes.push(contour(-halfThickness, new THREE.Path()));

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: width,
    bevelEnabled: false,
    steps: 1,
  });
  geometry.translate(0, 0, -width / 2);
  // rotateY(-90°)：(x,y,z) → (-z, y, x)：截面 X → +Z（主动轮 → 被动轮方向）
  geometry.rotateY(-Math.PI / 2);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
};

/** 歧管：主管（直管 + 端盖）+ N 根弯曲支管。坐标即零件局部系坐标。 */
const manifold: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const mainFrom = tuple(p, "mainFrom");
  const mainTo = tuple(p, "mainTo");
  const mainR = num(p, "mainR", 0.03);
  const runners = Array.isArray(p?.runners) ? (p!.runners as unknown[]) : [];
  const start = new THREE.Vector3(...mainFrom);
  const end = new THREE.Vector3(...mainTo);
  const parts: THREE.BufferGeometry[] = [
    new THREE.TubeGeometry(new THREE.LineCurve3(start, end), 1, mainR, 20, false),
  ];

  const cap = cylinderGeometry(mainR, mainR * 0.24, mainR, 20, 0);
  cap.rotateZ(-Math.PI / 2);
  cap.translate(end.x, end.y, end.z);
  parts.push(cap);

  const axis = new THREE.Vector3().subVectors(end, start).normalize();
  for (const raw of runners) {
    const item = raw as { from?: unknown; to?: unknown; bend?: unknown; r?: unknown };
    const from = Array.isArray(item.from) ? (item.from as [number, number, number]) : null;
    const to = Array.isArray(item.to) ? (item.to as [number, number, number]) : null;
    if (!from || !to) continue;
    const bend = typeof item.bend === "number" ? item.bend : 0.05;
    const radius = typeof item.r === "number" ? item.r : mainR * 0.62;
    const a = new THREE.Vector3(...from);
    const b = new THREE.Vector3(...to);
    const mid = a.clone().lerp(b, 0.5).addScaledVector(axis, bend);
    const runner = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([a, mid, b]), 14, radius, 14, false);
    parts.push(runner);
  }

  const merged = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  return merged;
};

/**
 * 连杆总成：大端（含轴瓦孔，孔径沿 X）→ 杆身 → 小端（含活塞销孔）。
 * 局部系：+Y = 连杆轴线（大端中心为原点），+X = 曲轴轴向（大端孔轴）。
 */
const rodAssembly: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const length = num(p, "length", 0.29);
  const bigR = num(p, "bigR", 0.052);
  const bigBore = num(p, "bigBore", 0.037);
  const smallR = num(p, "smallR", 0.026);
  const smallBore = num(p, "smallBore", 0.0192);
  const shankW = num(p, "shankW", 0.036);
  const shankT = num(p, "shankT", 0.026);

  const parts: THREE.BufferGeometry[] = [];

  // 大端：上半环（下半由连杆盖 rodCap 承担，两件在 y=0 分面相对）
  const bigShape = new THREE.Shape();
  bigShape.absarc(0, 0, bigR, Math.PI, 0, true); // 外弧：上半
  bigShape.lineTo(bigBore, 0);
  bigShape.absarc(0, 0, bigBore, 0, Math.PI, false); // 内弧：上半返回
  bigShape.closePath();
  const bigEye = new THREE.ExtrudeGeometry(bigShape, {
    depth: shankT,
    bevelEnabled: true,
    bevelThickness: 0.0015,
    bevelSize: 0.0015,
    bevelSegments: 1,
    curveSegments: 20,
  });
  bigEye.translate(0, 0, -shankT / 2);
  bigEye.rotateY(Math.PI / 2); // 截面板 → YZ 面，挤出方向 → X
  parts.push(bigEye);

  // 杆身：工字形（两片翼缘 + 腹板）
  const web = bevelBoxGeometry(shankT, length - bigR - smallR + 0.01, shankW * 0.42, 0.002);
  web.translate(0, bigR * 0.7 + (length - bigR - smallR) * 0.5, 0);
  parts.push(web);
  for (const sign of [-1, 1]) {
    const flange = bevelBoxGeometry(shankT * 0.9, length - bigR - smallR + 0.004, shankW * 0.3, 0.002);
    flange.translate(0, bigR * 0.7 + (length - bigR - smallR) * 0.5, sign * shankW * 0.35);
    parts.push(flange);
  }

  // 小端：环形（孔轴沿 X）
  const smallEye = tubeGeometry(smallR, smallBore, shankT * 0.84, 24);
  smallEye.rotateZ(-Math.PI / 2);
  smallEye.translate(0, length, 0);
  parts.push(smallEye);

  const merged = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  return merged;
};

/** 连杆盖：下半环 + 两侧凸耳（螺栓座），与大端同轴；螺栓沿 Y 穿过凸耳。 */
const rodCap: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const bigR = num(p, "bigR", 0.052);
  const bigBore = num(p, "bigBore", 0.037);
  const shankT = num(p, "shankT", 0.026);
  const drop = num(p, "drop", 0.012);
  void drop; // 连杆盖下沉量（预留参数，几何实现中）

  // 下半环（内孔比大端内孔大 1.5mm，与大端在 y=0 处留 0.6mm 分面缝）
  const shape = new THREE.Shape();
  shape.absarc(0, 0, bigR + 0.003, Math.PI, Math.PI * 2, false); // 外弧：下半
  shape.lineTo(bigBore + 0.0035, 0);
  shape.absarc(0, 0, bigBore + 0.0035, Math.PI * 2, Math.PI, true); // 内弧：下半返回
  shape.closePath();
  const cap = new THREE.ExtrudeGeometry(shape, {
    depth: shankT,
    bevelEnabled: true,
    bevelThickness: 0.0018,
    bevelSize: 0.0018,
    bevelSegments: 2,
    curveSegments: 20,
  });
  cap.translate(0, 0, -shankT / 2);
  cap.rotateY(Math.PI / 2); // 截面板 → YZ 面，挤出方向 → X
  cap.translate(0, -0.0006, 0);
  const parts: THREE.BufferGeometry[] = [cap];
  // 连杆螺栓座：位于环体 45° 对角、轴线沿 Y（与大端孔同向的螺栓座在外侧）
  const earR = Math.min(bigR * 0.96, bigR + 0.003 - 0.008);
  for (const sign of [-1, 1]) {
    const ear = cylinderGeometry(0.009, shankT * 0.96, 0.009, 12, 0.0012);
    ear.translate(0, -Math.sin(Math.PI * 0.25) * earR, sign * Math.cos(Math.PI * 0.25) * earR);
    parts.push(ear);
  }
  const merged = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  return merged;
};

/**
 * 凸轮轴：轴身 + N 只凸轮（基圆 = 轴身 + 鼻子）+ 轴颈。轴向沿 X。
 * lobePhase[i]（度）决定该凸轮升程朝向；由注册表按点火顺序给出。
 */
const camshaft: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const length = num(p, "length", 0.9);
  const shaftR = num(p, "shaftR", 0.017);
  const lobeR = num(p, "lobeR", 0.028);
  const lobeW = num(p, "lobeW", 0.016);
  const journalR = num(p, "journalR", 0.0235);
  const journalW = num(p, "journalW", 0.02);
  const lobes = Array.isArray(p?.lobeX) ? (p!.lobeX as number[]) : [];
  const phases = Array.isArray(p?.lobePhase) ? (p!.lobePhase as number[]) : [];
  const nose = Math.max(lobeR - shaftR - 0.0015, 0.001);
  const lobeCircle = (shaftR + 0.0015 + lobeR) / 2;
  const lobeOffset = (lobeR - shaftR - 0.0015) / 2;

  const parts: THREE.BufferGeometry[] = [];
  const shaft = latheGeometry(
    [
      [0, -length / 2],
      [shaftR, -length / 2],
      [shaftR, length / 2],
      [0, length / 2],
    ],
    20,
  );
  shaft.rotateZ(-Math.PI / 2);
  parts.push(shaft);

  for (let i = 0; i < lobes.length; i++) {
    const x = lobes[i];
    const phase = THREE.MathUtils.degToRad(phases[i] ?? 0);
    const lobe = cylinderGeometry(lobeCircle, lobeW, lobeCircle, 26, 0.0012);
    lobe.rotateZ(-Math.PI / 2); // 轴向 → +X
    lobe.translate(x, Math.cos(phase) * lobeOffset, Math.sin(phase) * lobeOffset);
    parts.push(lobe);
    // 鼻尖：把基圆之外的升程补成一段圆弧（视觉上接近真实凸轮轮廓）
    const tip = cylinderGeometry(nose * 0.55, lobeW * 0.98, nose * 0.55, 16, 0.001);
    tip.rotateZ(-Math.PI / 2);
    tip.translate(x, Math.cos(phase) * (shaftR + nose * 0.55), Math.sin(phase) * (shaftR + nose * 0.55));
    parts.push(tip);
  }
  // 轴颈
  for (const x of [-length / 2 + journalW, 0, length / 2 - journalW]) {
    const journal = cylinderGeometry(journalR, journalW, journalR, 20, 0.0012);
    journal.rotateZ(-Math.PI / 2);
    journal.translate(x, 0, 0);
    parts.push(journal);
  }

  const merged = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  return merged;
};

/** 飞轮齿圈：本体环 + N 个梯形齿（沿 X 挤出，外侧带齿）。 */
const gearRing: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const rInner = num(p, "rInner", 0.232);
  const rOuter = num(p, "rOuter", 0.247);
  const teeth = Math.max(8, Math.round(num(p, "teeth", 96)));
  const width = num(p, "width", 0.02);
  const addendum = num(p, "addendum", 0.009);
  const rootR = rOuter - addendum;

  const shape = new THREE.Shape();
  const step = (Math.PI * 2) / teeth;
  const halfRoot = step * 0.34;
  const halfTip = step * 0.15;
  for (let i = 0; i < teeth; i++) {
    const a = i * step;
    const ring: Array<[number, number]> = [
      [a - halfRoot, rootR],
      [a - halfTip, rOuter],
      [a + halfTip, rOuter],
      [a + halfRoot, rootR],
    ];
    ring.forEach(([angle, radius], index) => {
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      if (i === 0 && index === 0) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    });
  }
  shape.closePath();
  shape.holes.push(circleHole(rInner, new THREE.Path()));

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: width,
    bevelEnabled: true,
    bevelThickness: 0.0012,
    bevelSize: 0.0012,
    bevelSegments: 1,
    curveSegments: 8,
  });
  geometry.translate(0, 0, -width / 2);
  geometry.rotateY(Math.PI / 2); // 挤出方向 → X，截面 X → -Z（左右对称，无影响）
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
};

/**
 * 主轴承座（隧道式曲轴箱）：外环 + 上下左右四条支撑臂接到机体内壁。
 * 局部 +X = 曲轴轴向。
 */
const bearingSupport: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const rInner = num(p, "rInner", 0.0455);
  const rOuter = num(p, "rOuter", 0.112);
  const width = num(p, "width", 0.03);
  const reachZ = num(p, "reachZ", 0.135);
  const reachUp = num(p, "reachUp", 0.117);
  const reachDown = num(p, "reachDown", 0.157);
  const armW = num(p, "armW", 0.05);

  const ring = latheGeometry(
    [
      [rInner, -width / 2],
      [rOuter, -width / 2],
      [rOuter, width / 2],
      [rInner, width / 2],
      [rInner, -width / 2],
    ],
    28,
  );
  ring.rotateZ(-Math.PI / 2);
  const parts: THREE.BufferGeometry[] = [ring];

  const arm = (w: number, h: number, xLen: number, y: number, z: number) => {
    const box = bevelBoxGeometry(xLen, h, w, 0.002);
    box.translate(0, y, z);
    parts.push(box);
  };
  arm(reachZ - rOuter + 0.002, armW, width * 0.8, 0, (rOuter + reachZ) / 2);
  arm(reachZ - rOuter + 0.002, armW, width * 0.8, 0, -(rOuter + reachZ) / 2);
  arm(armW, reachUp - rOuter + 0.002, width * 0.8, (rOuter + reachUp) / 2, 0);
  arm(armW, reachDown - rOuter + 0.002, width * 0.8, -(rOuter + reachDown) / 2, 0);

  const merged = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  return merged;
};

/**
 * 曲轴箱壳体：把 (Y,Z) 截面沿 X 挤出，中间挖出「曲轴腔 + 左右缸孔槽」。
 * 这样缸心距、V 角、缸壁宽都是同一组常量派生，不会与缸套/活塞打架。
 * 截面坐标：(y, z)，z 左右对称。
 */
const caseShell: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const length = num(p, "length", 1);
  const halfWidth = num(p, "halfWidth", 0.155);
  const wall = num(p, "wall", 0.019);
  const bottom = num(p, "bottom", -0.17);
  const floor = num(p, "floor", 0.012);
  const top = num(p, "top", 0.02);
  const deckOuterY = num(p, "deckOuterY", 0.1427);
  const deckOuterZ = num(p, "deckOuterZ", 0.1828);
  const deckInnerY = num(p, "deckInnerY", 0.2297);
  const deckInnerZ = num(p, "deckInnerZ", 0.0322);
  const ridgeBottomY = num(p, "ridgeBottomY", 0.1197);
  const rim = num(p, "rim", 0.004);
  const bevel = num(p, "bevel", 0.004);
  const bore = num(p, "bore", 0);
  const cavityHalf = halfWidth - wall;

  const outer: Array<[number, number]> = [
    [deckInnerY, -deckInnerZ],
    [deckOuterY, -(deckOuterZ + rim)],
    [top, -halfWidth],
    [bottom, -halfWidth],
    [bottom, halfWidth],
    [top, halfWidth],
    [deckOuterY, deckOuterZ + rim],
    [deckInnerY, deckInnerZ],
  ];
  const cavity: Array<[number, number]> = [
    [bottom + floor, -cavityHalf],
    [top, -cavityHalf],
    [deckOuterY, -deckOuterZ],
    [deckInnerY, -deckInnerZ],
    [ridgeBottomY, -deckInnerZ],
    [ridgeBottomY, deckInnerZ],
    [deckInnerY, deckInnerZ],
    [deckOuterY, deckOuterZ],
    [top, cavityHalf],
    [bottom + floor, cavityHalf],
  ];

  const shape = new THREE.Shape();
  outer.forEach(([y, z], index) => {
    if (index === 0) shape.moveTo(z, y);
    else shape.lineTo(z, y);
  });
  shape.closePath();

  if (bore > 0) {
    shape.holes.push(circleHole(bore, new THREE.Path()));
  } else {
    const hole = new THREE.Path();
    // 反向（顺时针）保证孔方向与外形相反
    for (let i = cavity.length - 1; i >= 0; i--) {
      const [y, z] = cavity[i];
      if (i === cavity.length - 1) hole.moveTo(z, y);
      else hole.lineTo(z, y);
    }
    hole.closePath();
    shape.holes.push(hole);
  }

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(length - 2 * bevel, 0.002),
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 16,
    steps: 1,
  });
  geometry.translate(0, 0, bevel); // 截面沿 Z 居中
  geometry.rotateY(Math.PI / 2); // 挤出方向 → +X；截面 X → -Z（左右对称，无影响）
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  geometry.translate(-(box.min.x + box.max.x) / 2, 0, 0); // X 居中
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
};

export const tigerKitBuilders: Record<string, GeometryBuilder> = {
  borePlate,
  siameseBlock,
  cylinderHead,
  camCover,
  crankWeb,
  fanRotor,
  beltLoop,
  manifold,
  rodAssembly,
  rodCap,
  camshaft,
  gearRing,
  bearingSupport,
  caseShell,
  fanFrame,
};

/** 皮带中线长度（kits.beltLoop 与读数共用同一公式）。 */
export function beltLengthOf(rDriving: number, rDriven: number, centerDistance: number): number {
  return beltGeometry(rDriving, rDriven, centerDistance).centerlineLength;
}
