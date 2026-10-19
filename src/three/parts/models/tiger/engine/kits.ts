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

/** sin(60°)：V 角 60° 时缸轴与竖直方向成 30°，径向坐标 r = 0.5y + sin60°·z。 */
const SIN_HV = Math.sin(Math.PI / 3);

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
  // bevel ≤ 0 = 不要倒角：截面 = 名义轮廓（尺寸精确件，如受缸心距限制的连体缸壁）
  const b = bevel > 0 ? Math.max(Math.min(bevel, h * 0.3), 0.0004) : 0;
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(h - 2 * b, 0.001),
    bevelEnabled: b > 0,
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
  // extrudeUpAlongY 的 bevel 会把截面整体外扩 bevel（镗孔随之缩小），
  // 因此形状线预先内缩 / 孔预先放大，让实体落在声明尺寸上。
  const shape = roundedRectPath(w - 2 * bevel, d - 2 * bevel, corner, new THREE.Shape());
  shape.holes.push(circleHole(bore + bevel, new THREE.Path()));
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
  // 同 borePlate：截面内缩 bevel、镗孔放大 bevel，实体才等于 w×d / jacket。
  // bevel = 0 = 精确件：实体严格等于 w×d（相邻连体缸只剩缸心距的 2mm 间隙，不会被倒角外扩插爆）。
  const bodyBevel = num(p, "bevel", 0.002);
  const shape = roundedRectPath(w - 2 * bodyBevel, d - 2 * bodyBevel, corner, new THREE.Shape());
  shape.holes.push(circleHole(jacket + bodyBevel, new THREE.Path()));
  const body = extrudeUpAlongY(shape, h, bodyBevel);

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
  // 同连体缸壁：bevel = 0 = 精确件（相邻缸盖只剩缸心距间隙，且燃烧室孔不被倒角收小）
  const headBevel = num(p, "bevel", 0.003);
  const shape = roundedRectPath(w - 2 * headBevel, d - 2 * headBevel, 0.014, new THREE.Shape());
  shape.holes.push(circleHole(chamber + headBevel, new THREE.Path()));
  const body = extrudeUpAlongY(shape, h, headBevel);
  const parts: THREE.BufferGeometry[] = [body];

  // 气门导管/摇臂机构不在本层建模（M-C）：气门本体直接站在缸盖燃烧室孔内，
  // 因此这里只保留燃烧室孔、进排气法兰与缸盖螺栓，避免与气门几何互相插入。
  // 进/排气各一口、各一个法兰与短管：上口进气（高）、下口排气（低）。
  // 两口必须分开在缸盖侧面上——共用同一口时两根支管的起弯段必然互穿
  // （判定树实测该零件对交线 1493mm · displaced）。
  const portW = num(p, "portW", 0.054);
  // 法兰宽 > 端口宽：短管两侧要留出法兰螺栓座（B1 密度补齐的 port_flange_bolt ×4/缸）
  const flangeW = num(p, "flangeW", portW);
  const portInY = num(p, "portInY", h * 0.72);
  const portExY = num(p, "portExY", h * 0.22);
  const portStubR = num(p, "portStubR", 0.019);
  for (const sign of [-1, 1]) {
    for (const portY of [portInY, portExY]) {
      const flange = bevelBoxGeometry(flangeW, 0.032, 0.018, 0.002);
      flange.translate(0, portY, sign * (d / 2 + 0.007));
      parts.push(flange);
      const stub = cylinderGeometry(portStubR, 0.028, portStubR, 18, 0.0015);
      stub.rotateX(Math.PI / 2);
      stub.translate(0, portY, sign * (d / 2 + 0.024));
      parts.push(stub);
    }
  }

  const bolts = boltCircleGeometry(4, num(p, "boltRadius", w * 0.33), 0.011, 0.012);
  // 螺栓圈转 45° 到四角：气门杆沿 z 方向偏摆 ±6°，落在 (0, ±45) 位置会插进缸盖螺栓头（实测 7.59mm）
  bolts.rotateY(Math.PI / 4);
  // 螺栓头沉入缸盖顶面之下：凸轮轴罩直接坐在缸盖顶面上，露头的螺栓会插进罩壁
  bolts.translate(0, h - 0.012, 0);
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
  /** 凸轮轴轴线在罩局部系中的高度（= CAM_BASE-COVER_BASE），端壁轴孔以此为中心。 */
  const axisY = num(p, "axisY", 0.041);
  /** 端壁轴孔半径（= 轴颈 + 单边间隙）。 */
  const boreR = num(p, "journalBoreR", 0.025);
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
    // 端壁 = 带凸轮轴轴孔的板：凸轮轴轴颈从孔中穿过，孔 = 轴颈 + 单边间隙。
    // 无孔端壁会把整根凸轮轴埋进壁厚（实测 12.8mm 穿透）。
    const endShape = roundedRectPath((halfZ - wall) * 2, height - wall, 0.008, new THREE.Shape());
    const bore = new THREE.Path();
    bore.absarc(0, axisY - (height - wall) / 2, boreR, 0, Math.PI * 2, true);
    endShape.holes.push(bore);
    const end = new THREE.ExtrudeGeometry(endShape, {
      depth: wall,
      bevelEnabled: false,
      curveSegments: 20,
    });
    end.rotateY(Math.PI / 2); // 截面 XY → 世界 ZY，挤出方向 +Z → +X
    end.translate(sign * (length / 2 - wall / 2) - wall / 2, (height - wall) / 2, 0);
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
  // 右水管过孔参数（附件梁让位开口 + 管夹）
  const pipeY = num(p, "pipeY", 0.04);
  const pipeZ = num(p, "pipeZ", -0.18);
  const pipeR = num(p, "pipeR", 0.02);
  const clampBoreR = num(p, "clampBoreR", pipeR - 0.0005);
  const clampX = num(p, "clampX", 0.013);
  const clampLen = num(p, "clampLen", 0.05);
  const clampSlant = num(p, "pipeSlantDeg", 10.4) * (Math.PI / 180);
  // 风扇轴承座（压装孔）参数
  const bearingX = num(p, "bearingX", 0.055);
  const bearingBoreR = num(p, "bearingBoreR", 0.0326);
  const bearingLen = num(p, "bearingLen", 0.05);
  /** 地脚后端面在局部系中的 x（= 正时盖前端面 + 单边间隙）；地脚/立撑/附件梁都从这里向前长。 */
  const mountX = num(p, "mountX", 0.019);
  /** 地脚与立撑的轴线 x：与上横梁、附件梁搭接，同时让开后方的正时盖。 */
  const strutX = mountX + 0.03;

  const parts: THREE.BufferGeometry[] = [];
  const beam = bevelBoxGeometry(beamDepth, beamH, halfSpan * 2, 0.003);
  beam.translate(beamX, beamY, 0);
  parts.push(beam);

  // 下横梁（附件梁）：水泵 / 发电机装在其前端面；后端面退到正时盖前端面之前。
  // 右水管从梁下穿过处开口让位（开口半宽 = 管径 + 15mm，底面抬到管顶上方 2mm）——
  // 原为整根实心梁，管身上半直接插进梁体（判定树实测交线 112.6mm · suspect）。
  const beamFrontX = beamX + beamDepth / 2;
  const accBeamSpan = beamFrontX - mountX;
  const accBeamCx = (mountX + beamFrontX) / 2;
  const beamTopY = accBeamY + accBeamH / 2;
  const notchHalf = pipeR + 0.015;
  const notchTop = pipeY + pipeR + 0.002;
  const notchH = Math.max(beamTopY - notchTop, 0.004);
  const accBeamSegs: Array<{ z0: number; z1: number; y: number; h: number }> = [
    { z0: -accHalfSpan, z1: pipeZ - notchHalf, y: accBeamY, h: accBeamH },
    { z0: pipeZ - notchHalf, z1: pipeZ + notchHalf, y: (notchTop + beamTopY) / 2, h: notchH },
    { z0: pipeZ + notchHalf, z1: accHalfSpan, y: accBeamY, h: accBeamH },
  ];
  for (const seg of accBeamSegs) {
    const segLen = seg.z1 - seg.z0;
    if (segLen <= 1e-4) continue;
    const box = bevelBoxGeometry(accBeamSpan, seg.h, segLen, 0.003);
    box.translate(accBeamCx, seg.y, (seg.z0 + seg.z1) / 2);
    parts.push(box);
  }

  // 管夹：夹住穿过开口的那段右水管。孔半径比管面小 0.1mm（24 边形孔面 · 16 边形管面，
  // 相位错开 → 孔面与管面互穿出一圈绕轴闭合的交线 = 压装配合面，实测深度 ~0.1mm）。
  // 管夹轴与管的走向一致（z 向斜 10.4°），一端伸进附件梁里，与框架是一体件。
  const clamp = tubeGeometry(clampBoreR + 0.005, clampBoreR, clampLen, 24);
  clamp.rotateZ(-Math.PI / 2);
  clamp.rotateY(clampSlant);
  clamp.translate(clampX, pipeY, pipeZ);
  parts.push(clamp);

  const topY = beamY - beamH / 2;
  for (const side of [-1, 1]) {
    // 斜撑（上横梁 → 机脚）+ 立撑（机脚 → 附件梁）
    const from = new THREE.Vector3(strutX, topY, side * legTopZ);
    const to = new THREE.Vector3(strutX, footY, side * footZ);
    const delta = new THREE.Vector3().subVectors(to, from);
    const angle = Math.atan2(delta.z, delta.y);
    const leg = bevelBoxGeometry(legW, delta.length() + 0.008, legW * 1.15, 0.002);
    leg.rotateX(angle);
    leg.translate((from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2);
    parts.push(leg);

    const lowerFrom = new THREE.Vector3(strutX, footY, side * footZ);
    const lowerTo = new THREE.Vector3(strutX, accBeamY + accBeamH / 2 - 0.004, side * footZ);
    const lower = bevelBoxGeometry(legW, Math.abs(lowerFrom.y - lowerTo.y) + 0.008, legW * 1.15, 0.002);
    lower.translate(strutX, (lowerFrom.y + lowerTo.y) / 2, side * footZ);
    parts.push(lower);

    // 地脚：后端面贴正时盖前端面（前端板 + 20mm 正时盖都在机脚之后）
    const foot = bevelBoxGeometry(footLen, 0.03, legW * 2.2, 0.002);
    foot.translate(mountX + footLen / 2, footY, side * footZ);
    parts.push(foot);

    // 导流罩环（内径 = 叶尖半径 + 4mm）
    const ring = tubeGeometry(shroudR + shroudWall, shroudR, shroudH, 40);
    ring.rotateZ(-Math.PI / 2);
    ring.translate(shroudX + shroudH / 2, beamY, side * fanZ);
    parts.push(ring);

    // 轴承座：风扇轴承压入本孔（孔比轴承外径小 0.4mm = 压装配合面，交线绕轴闭合）
    const housing = tubeGeometry(bearingBoreR + 0.009, bearingBoreR, bearingLen, 32);
    housing.rotateZ(-Math.PI / 2);
    housing.translate(bearingX, beamY, side * fanZ);
    parts.push(housing);

    // 罩环 → 横梁前端面的两条斜撑（在风扇圆盘平面上方/下方，避开风扇与带轮）。
    // 接到罩环**外缘半径**（shroudR+shroudWall）：接内缘时斜撑的 x 端部会伸进
    // 风扇叶尖的扫掠圆盘（实测被叶尖切进 6.25mm · 未豁免）。
    for (const vs of [-1, 1]) {
      const a = new THREE.Vector3(beamFrontX, beamY + vs * (beamH / 2), side * fanZ);
      const b = new THREE.Vector3(shroudX, beamY + vs * (shroudR + shroudWall), side * fanZ);
      const tabDelta = new THREE.Vector3().subVectors(b, a);
      const tabAngle = Math.atan2(tabDelta.y, tabDelta.x);
      // 端部断面 0.018 厚（原 0.03）：斜撑内缘到叶尖留 18mm，叶尖不再切进斜撑
      const tab = bevelBoxGeometry(tabDelta.length() + 0.01, 0.018, 0.024, 0.002);
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

  // 轮毂 + 前伸细轴 + 宽面平带轮。带面做成等高圆柱（不是尖脊）：
  // 两条皮带各有自己的轴向平面（曲轴双槽带轮 ±PULLEY_OFF），带宽要同时罩住两条带面，
  // 带在带面任意轴向位置都压在同一半径上（尖脊只有一条带能压在脊顶）。
  // 带轮必须整体位于叶片弦长范围之前，否则皮带与叶片互插。
  const hub = latheGeometry(
    [
      [0, -hubWidth / 2],
      [rHub * 0.72, -hubWidth / 2],
      [rHub * 0.72, hubWidth / 2],
      [shaftR, hubWidth / 2 + 0.004],
      [shaftR, pulleyX - pulleyW / 2],
      [pulleyR, pulleyX - pulleyW / 2],
      [pulleyR, pulleyX + pulleyW / 2],
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
    // 弦长以 hub 中心為準前后均分：airfoil 原点在弦线前缘，不后移会让整段弦长伸到带轮平面里
    // （实测皮带 462 个三角形、1614mm 交线穿叶片）。后移半个弦长后带轮整段位于弦长范围之前。
    blade.translate(-chord / 2, rHub + span / 2, 0);
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
    // 皮带包角按每段 48 段离散：默认 12 段时被动轮包角的弦会切进带轮顶圆
    // （内缘多边形的内切半径比带轮半径还小 → 视觉上是皮带啃进带轮）。
    curveSegments: 48,
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
  // 主管径向段数可调：排气下管承口故意用 13 段（与歧管主管的 20 段错开相位，
  // 两个同心多边形的边互相穿越 → 交线绕轴闭合，测得出「压装配合面」而不是零接触）。
  const mainSegments = Math.max(8, Math.round(num(p, "mainSegments", 20)));
  const runners = Array.isArray(p?.runners) ? (p!.runners as unknown[]) : [];
  const start = new THREE.Vector3(...mainFrom);
  const end = new THREE.Vector3(...mainTo);
  const parts: THREE.BufferGeometry[] = [
    new THREE.TubeGeometry(new THREE.LineCurve3(start, end), 1, mainR, mainSegments, false),
  ];

  const axis = new THREE.Vector3().subVectors(end, start).normalize();
  const capH = mainR * 0.24;
  // capInset = 1：两端封盖都收进口内（外端面与管口齐平；默认是跨骑在管口上、外探 5mm）。
  // 排气歧管管口外几毫米就是下管弯管的起点，默认封盖的外盘面会被弯管首段穿过，
  // 多出一圈不绕轴的交线（实测 476mm 里约 210mm），形态被判成 displaced。
  const capInset = num(p, "capInset", 0) > 0.5;

  const cap = cylinderGeometry(mainR, capH, mainR, mainSegments, 0);
  cap.rotateZ(-Math.PI / 2);
  const capCenter = capInset ? end.clone().addScaledVector(axis, -capH / 2) : end.clone();
  cap.translate(capCenter.x, capCenter.y, capCenter.z);
  parts.push(cap);

  // capFrom = 1：近端也封盖（默认只封远端）。
  // 判定树的「点在实体内」是射线奇偶判定：开口壳体让腔内点被误判成内部，
  // 深度探针就会报出 30mm 级假深度（下管承口压装就是这样被打成未豁免的）。
  if (num(p, "capFrom", 0) > 0.5) {
    // 封盖半径收小 1.5mm：与主管等径的封盖会与管面叠出一圈重合三角面，
    // 交线长度被放大成 1842mm 碎片（承口压装被打成 displaced）。
    const plugR = mainR - 0.0015;
    const near = cylinderGeometry(plugR, capH, plugR, mainSegments, 0);
    near.rotateZ(-Math.PI / 2);
    const nearCenter = capInset ? start.clone().addScaledVector(axis, capH / 2) : start.clone();
    near.translate(nearCenter.x, nearCenter.y, nearCenter.z);
    parts.push(near);
  }

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
  // 倒角必须关掉：three 的挤出倒角沿轮廓「外扩」bevelSize（45° 角处还要 ×√2），
  // 1.5mm 倒角会让上半环越过 y=0 分面缝、并咬进轴瓦孔（实测 3.44mm / 0.53mm穿模）。
  const bigEye = new THREE.ExtrudeGeometry(bigShape, {
    depth: shankT,
    bevelEnabled: false,
    curveSegments: 20,
  });
  bigEye.translate(0, 0, -shankT / 2);
  bigEye.rotateY(Math.PI / 2); // 截面板 → YZ 面，挤出方向 → X
  parts.push(bigEye);

  // 杆身：工字形（两片翼缘 + 腹板）。
  // 端部必须落在两端环体的「材料带」里：下端 ≥ 大端孔半径 + 2mm（孔 37 → 39），
  // 上端落进小端材料带（小端环带 y = length-smallR .. length-smallBore = 264..270mm）。
  // 早先以 bigR*0.7 作腹板中心，杆身根部实际沉到 31.4mm（孔内空腔），被曲柄销穿 3.9mm。
  const shankBottom = bigBore + 0.002;
  const shankTop = length - smallR + 0.004;
  const shankSpan = shankTop - shankBottom;
  const shankMid = (shankBottom + shankTop) / 2;
  const web = bevelBoxGeometry(shankT, shankSpan, shankW * 0.42, 0.002);
  web.translate(0, shankMid, 0);
  parts.push(web);
  for (const sign of [-1, 1]) {
    const flange = bevelBoxGeometry(shankT * 0.9, shankSpan - 0.004, shankW * 0.3, 0.002);
    flange.translate(0, shankMid, sign * shankW * 0.35);
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
  // 同上：倒角外扩会让盖越过 y=-0.6mm 分面缝顶进连杆本体
  const cap = new THREE.ExtrudeGeometry(shape, {
    depth: shankT,
    bevelEnabled: false,
    curveSegments: 20,
  });
  cap.translate(0, 0, -shankT / 2);
  cap.rotateY(Math.PI / 2); // 截面板 → YZ 面，挤出方向 → X
  cap.translate(0, -0.0006, 0);
  const parts: THREE.BufferGeometry[] = [cap];
  // 连杆螺栓座：环体两侧的凸耳（螺栓孔轴沿 Y）。
  // 凸耳内缘必须让开轴瓦孔（40.5 → 内缘 41）与曲柄销（r=36）：原先按 45° 对角摆在 33.2mm 处，
  // 内缘只到 31.8mm，被曲柄销穿 3.4mm；改为横向 ±50mm、下探 25mm（顶面仍低于分面缝）。
  for (const sign of [-1, 1]) {
    const ear = cylinderGeometry(0.009, shankT * 0.96, 0.009, 12, 0.0012);
    ear.translate(0, -0.0135, sign * 0.05);
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
    // 孔是 96 齿环的内圆：段数太少时多边形内接边会切进飞轮外圆
    curveSegments: 24,
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
 * 曲轴箱壳体：把 (Y,Z) 截面沿 X 挤出。
 *
 * 壳体（trough = 1）截面 = 「U 形主体」+ 两个「甲板外缘唇」三角形：
 *   两侧壁的顶面切在活塞扫掠净空面 r = ±(PISTON_R + 1.7mm) 上（r 为缸轴径向坐标），
 *   让出活塞裙部在 BDC 的扫掠空间；槽口由机体缸孔座面（BLOCK_BASE）从上方封住。
 *   甲板斜面整条沿法线内移 deckDrop 后，甲板顶面仍低于缸体基面 BLOCK_BASE，
 *   只把外缘一小段甲板板（rim 到活塞净空面）作为独立四边形保留。
 *   没有零厚度收敛点、没有自交边，earcut 不会退化出壳体内的虚假材料。
 *
 * 端板（trough = 0）是带曲轴孔的整块端盖：外轮廓在「净空面 × 甲板斜面」交点处转折，
 * 侧壁升到 top，阀谷由端盖封住，充当槽两端的端盖。
 * 这样缸心距、V 角、缸壁宽都是同一组常量派生，不会与缸套/活塞打架。
 * 截面坐标：(y, z)，z 左右对称；径向 r = 0.5y + sin(60°)z（V 角 60°）。
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
  const rim = num(p, "rim", 0.004);
  const bevel = num(p, "bevel", 0.004);
  const bore = num(p, "bore", 0);
  const deckDrop = num(p, "deckDrop", 0.0045);
  const trough = num(p, "trough", 0);
  /** 活塞扫掠净空半径：PISTON_R(0.0628) + 1.7mm 装配间隙。 */
  const clearance = num(p, "pistonClearance", 0.0645);
  const cavityHalf = halfWidth - wall;
  // ExtrudeGeometry 的 bevel 把整个挤出体沿轮廓法线斜接外扩 bevel，
  // 所以想落在标称面上的外部特征（侧壁外表面 ±halfWidth、底面 bottom、
  // 甲板外缘面 deckOuterZ+rim）在形状线里必须先各内缩一个 bevel；
  // 否则外表面比标称大 4mm，会压进肋板/机脚/检查盖/油尺等贴装件。
  const wallOuter = halfWidth - bevel;
  const bottomOuter = bottom + bevel;

  // ---------------------------------------------------------------------
  // deck 斜面整体沿其法线向腔内平移 deckDrop。
  // 每 bank 的 deck 楔形板位于「机体基面（沿缸轴 u=BLOCK_BASE）」之上 1.2mm，
  // 且活塞在 BDC 会扫到楔形板；下移后楔形板主体让出 ≥3.3mm 净空，
  // 外轮廓内侧「视觉轮廓」不变（楔厚不变，只是整条内移）。
  // ---------------------------------------------------------------------
  const faceInner: [number, number] = [deckInnerY, -deckInnerZ];
  const faceOuter: [number, number] = [deckOuterY, -(deckOuterZ + rim)];
  const faceLen = Math.hypot(faceOuter[0] - faceInner[0], faceOuter[1] - faceInner[1]) || 1;
  const faceDir: [number, number] = [
    (faceOuter[0] - faceInner[0]) / faceLen,
    (faceOuter[1] - faceInner[1]) / faceLen,
  ];
  let normalY = faceDir[1];
  let normalZ = -faceDir[0];
  const midY = (faceInner[0] + faceOuter[0]) / 2;
  const midZ = (faceInner[1] + faceOuter[1]) / 2;
  if (normalY * midY + normalZ * midZ < 0) {
    normalY = -normalY;
    normalZ = -normalZ;
  }
  const dropY = -deckDrop * normalY;
  const dropZ = -deckDrop * normalZ;
  const dropDeck = ([y, z]: [number, number]): [number, number] => [y + dropY, z + dropZ];
  const mirrorZ = ([y, z]: [number, number]): [number, number] => [y, -z];
  /** 对称下移：+z 侧先镜像到 −z 侧，下移后再镜像回来。 */
  const dropDeckSide = (point: [number, number], mirrored: boolean): [number, number] =>
    mirrored ? mirrorZ(dropDeck(mirrorZ(point))) : dropDeck(point);

  const toShape = (points: Array<[number, number]>): THREE.Shape => {
    const shape = new THREE.Shape();
    points.forEach(([y, z], index) => {
      if (index === 0) shape.moveTo(z, y);
      else shape.lineTo(z, y);
    });
    shape.closePath();
    return shape;
  };

  // 下移后的关键点（−z 侧定义，+z 侧镜像）：甲板内角 I′、甲板外缘面外角 faceOut′、
  // 甲板顶面外角（rim 上沿）deckTop
  const innerCorner = dropDeckSide(faceInner, false);
  const rimOuter = dropDeckSide(faceOuter, false);
  const deckTop = dropDeckSide([deckOuterY, -deckOuterZ], false);

  // 活塞扫掠净空：挤出体沿轮廓法线外扩 bevel，因此形状线要多让一个 bevel。
  const radialOf = ([y, z]: [number, number]): number => 0.5 * y + SIN_HV * z;
  const shapeClearance = clearance + bevel;
  /** 净空面与竖直线 |z| 的交点高度（左右对称）。 */
  const wallTopY = (z: number): number => (-shapeClearance + SIN_HV * Math.abs(z)) / 0.5;
  /** 线段 ab 上 r = −shapeClearance 的分点（−z 侧）。 */
  const cutAtClearance = (a: [number, number], b: [number, number]): [number, number] => {
    const ra = radialOf(a);
    const rb = radialOf(b);
    const t = (ra + shapeClearance) / (ra - rb || 1);
    return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
  };
  /** 线段 ab 在 z = 常数 处的 y（用于把甲板边投到侧壁面上）。 */
  const yOnSegmentAtZ = (a: [number, number], b: [number, number], z: number): number =>
    a[0] + ((z - a[1]) / (b[1] - a[1] || 1)) * (b[0] - a[0]);

  // 甲板外缘（形状线，已内缩一个 bevel）：上边=甲板顶面（flank），外边=rim 外缘。
  // 全部顶点 u ≤ 甲板顶面高度，恒低于缸体基面 BLOCK_BASE / 缸套底。
  const deckTopShape: [number, number] = [
    yOnSegmentAtZ(deckTop, innerCorner, deckTop[1] + bevel),
    deckTop[1] + bevel,
  ];
  const rimOuterShape: [number, number] = [deckTopShape[0], rimOuter[1] + bevel];

  let shapes: THREE.Shape[];
  if (trough > 0.5) {
    // 壳体：U 形主体（两侧壁 + 谷底）+ 两个甲板外缘板。
    const mainOutline: Array<[number, number]> = [
      [bottomOuter, -wallOuter],
      [bottomOuter, wallOuter],
      [wallTopY(wallOuter), wallOuter],
      [wallTopY(cavityHalf), cavityHalf],
      [bottomOuter + floor, cavityHalf],
      [bottomOuter + floor, -cavityHalf],
      [wallTopY(-cavityHalf), -cavityHalf],
      [wallTopY(-wallOuter), -wallOuter],
    ];
    // 甲板外缘板：上边=甲板顶面（flank），内下边=活塞净空面，外边=rim 外缘。
    const lip: Array<[number, number]> = [
      deckTopShape,
      cutAtClearance(deckTopShape, innerCorner),
      [wallTopY(-wallOuter), -wallOuter],
      rimOuterShape,
    ];
    shapes = [toShape(mainOutline), toShape(lip), toShape(lip.map(mirrorZ).reverse())];
  } else {
    // 端板：整块端盖（侧壁升到 top，阀谷封死，仅在净空面 × 斜面处转折）+ 曲轴孔。
    const flankAtHalf = yOnSegmentAtZ(rimOuter, innerCorner, -wallOuter);
    const flankAtCavity = yOnSegmentAtZ(rimOuter, innerCorner, -cavityHalf);
    const outline: Array<[number, number]> = [
      [bottomOuter, -wallOuter],
      [bottomOuter, wallOuter],
      [flankAtHalf, wallOuter],
      mirrorZ(rimOuterShape),
      [top, wallOuter],
      [top, cavityHalf],
      [flankAtCavity, cavityHalf],
      mirrorZ(innerCorner),
      innerCorner,
      [flankAtCavity, -cavityHalf],
      [top, -cavityHalf],
      [top, -wallOuter],
      rimOuterShape,
      [flankAtHalf, -wallOuter],
    ];
    const shape = toShape(outline);
    if (bore > 0) shape.holes.push(circleHole(bore, new THREE.Path()));
    shapes = [shape];
  }

  const geometry = new THREE.ExtrudeGeometry(shapes, {
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
