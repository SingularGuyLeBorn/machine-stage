import * as THREE from "three";
import { bevelBoxGeometry, cylinderGeometry, latheGeometry, mergeGeometries } from "../../../kernel/geometry";
import type { GeometryBuilder } from "../../../assembler/geometry";

// ============================================================================
// models/tiger/turret/kits —— 炮塔专用几何构造器（L4 第三批）
//
// 四个 kit：
//   turretShell    炮塔壳体：马蹄形平面（前壁 + 两侧平行壁 + 后部半圆）沿竖直方向挤出，
//                  顶盖与壁同外廓、整体上抬。**局部系：平面 XY、竖直方向沿 -Z**（装配位
//                  rotation [90,0,0] 后 local y → 世界 z、local -z → 世界 +y）——与顶甲板
//                  同一口径，装配位的 y 即壳体顶面。
//   turretCupola   车长指挥塔：圆筒 + 5 观察缝 + 顶盖。世界向（轴沿 Y），原点在筒底。
//   turretMantlet  炮盾：矩形块 + 炮口套环。世界向，原点在块中心，前方 = -X。
//   turretGunBarrel 炮管：回转体（LatheGeometry）一次成型——基段 / 中段 / 前段 / 双室炮口
//                  制退器。世界向，原点在炮管尾端，炮口朝 -X。
//
// 倒角口径沿用 hullPlate 的教训：ExtrudeGeometry 的倒角「向外扩」，所以外轮廓一律先内缩 b、
// 内轮廓（孔）先外扩 b、厚度先减 2b，倒角补回之后外廓 / 壁厚 / 总高才精确等于名义值。
// ============================================================================

type Params = Record<string, unknown>;

function num(params: Params | undefined, key: string, fallback?: number): number {
  const value = params?.[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (fallback !== undefined) return fallback;
  throw new Error(`turret kit：参数 "${key}" 必须是数值（收到 ${String(value)}）`);
}

/** 马蹄形外轮廓（炮塔平面）：前壁在 x = frontX（负值 = 炮塔前方），后部为 rOut 半圆。 */
function horseshoeShape(rOut: number, frontX: number): THREE.Shape {
  const shape = new THREE.Shape();
  shape.moveTo(frontX, -rOut);
  shape.lineTo(0, -rOut);
  shape.absarc(0, 0, rOut, -Math.PI / 2, Math.PI / 2, false);
  shape.lineTo(frontX, rOut);
  shape.closePath();
  return shape;
}

/** 同上，作为内孔路径。 */
function horseshoePath(rOut: number, frontX: number): THREE.Path {
  const path = new THREE.Path();
  path.moveTo(frontX, -rOut);
  path.lineTo(0, -rOut);
  path.absarc(0, 0, rOut, -Math.PI / 2, Math.PI / 2, false);
  path.lineTo(frontX, rOut);
  path.closePath();
  return path;
}

const turretShell: GeometryBuilder = (spec) => {
  const params = (spec as { params?: Params }).params;
  const rOut = num(params, "rOut");
  const rIn = num(params, "rIn");
  const frontOut = num(params, "frontOut");
  const frontTh = num(params, "frontTh", 0.12);
  const wallH = num(params, "wallH");
  const roofT = num(params, "roofT", 0.025);
  const bevel = num(params, "bevel", 0.003);

  if (rIn >= rOut || frontTh <= 0 || wallH <= 0) {
    throw new Error(`turret kit：壳体尺寸非法（rOut ${rOut} / rIn ${rIn} / frontTh ${frontTh}）`);
  }

  const b = Math.max(Math.min(bevel, wallH * 0.2, rOut * 0.05, frontTh * 0.2), 0.0004);
  const curveSegments = 64;

  // —— 壁板：外轮廓内缩 b / 内轮廓外扩 b，挤出深度 wallH - 2b ——
  const walls = horseshoeShape(rOut - b, frontOut + b);
  walls.holes.push(horseshoePath(rIn + b, frontOut + frontTh - b));
  const wallGeo = new THREE.ExtrudeGeometry(walls, {
    depth: Math.max(wallH - 2 * b, 0.001),
    bevelEnabled: true,
    bevelThickness: b,
    bevelSize: b,
    bevelSegments: 1,
    steps: 1,
    curveSegments,
  });
  wallGeo.translate(0, 0, b); // z ∈ [0, wallH]
  wallGeo.computeVertexNormals();

  // —— 顶盖：与外廓同平面形状，落在壁顶（局部 z ∈ [-roofT, 0]）——
  const roof = horseshoeShape(rOut - b, frontOut + b);
  const roofGeo = new THREE.ExtrudeGeometry(roof, {
    depth: Math.max(roofT - 2 * b, 0.001),
    bevelEnabled: true,
    bevelThickness: b,
    bevelSize: b,
    bevelSegments: 1,
    steps: 1,
    curveSegments,
  });
  roofGeo.translate(0, 0, -(roofT - b));
  roofGeo.computeVertexNormals();

  const merged = mergeGeometries([wallGeo, roofGeo]);
  wallGeo.dispose();
  roofGeo.dispose();
  return merged;
};

const turretCupola: GeometryBuilder = (spec) => {
  const params = (spec as { params?: Params }).params;
  const r = num(params, "r", 0.26);
  const h = num(params, "h", 0.13);
  const capR = num(params, "capR", r + 0.012);
  const capT = num(params, "capT", 0.03);
  const slits = Math.max(Math.round(num(params, "slits", 5)), 0);
  const slitW = num(params, "slitW", 0.1);
  const slitH = num(params, "slitH", 0.055);
  const slitT = num(params, "slitT", 0.035);

  const parts: THREE.BufferGeometry[] = [];

  const drum = cylinderGeometry(r, h, r * 0.98, 36, 0.004);
  drum.translate(0, h / 2, 0);
  parts.push(drum);

  const cap = cylinderGeometry(capR, capT, capR * 0.94, 36, 0.004);
  cap.translate(0, h + capT / 2, 0);
  parts.push(cap);

  // 观察缝：沿圆周均布，缝盒略凸出筒面（观察镜框）
  const slitZ = h * 0.58;
  const rr = r - slitT * 0.25;
  for (let i = 0; i < slits; i++) {
    const a = (i / slits) * Math.PI * 2;
    const box = bevelBoxGeometry(slitW, slitH, slitT, 0.003, 2);
    box.rotateY(a);
    box.translate(Math.sin(a) * rr, slitZ, Math.cos(a) * rr);
    parts.push(box);
  }

  const merged = mergeGeometries(parts);
  for (const item of parts) item.dispose();
  return merged;
};

const turretMantlet: GeometryBuilder = (spec) => {
  const params = (spec as { params?: Params }).params;
  const w = num(params, "w", 0.24); // 沿 X（装甲厚度）
  const h = num(params, "h", 0.56);
  const d = num(params, "d", 0.86); // 沿 Z（宽度）
  const collarR = num(params, "collarR", 0.16);
  const collarL = num(params, "collarL", 0.1);

  const parts: THREE.BufferGeometry[] = [];

  const block = bevelBoxGeometry(w, h, d, Math.min(0.012, w * 0.2), 3);
  parts.push(block);

  // 炮口套环：cylinderGeometry 轴向 Y，绕 Z 转 90° 后「顶面」朝 -X（炮塔前方）
  const collar = cylinderGeometry(collarR, collarL, collarR * 0.92, 32, 0.006);
  collar.rotateZ(Math.PI / 2);
  collar.translate(-(w / 2 + collarL / 2), 0, 0);
  parts.push(collar);

  const merged = mergeGeometries(parts);
  for (const item of parts) item.dispose();
  return merged;
};

const turretGunBarrel: GeometryBuilder = (spec) => {
  const params = (spec as { params?: Params }).params;
  const length = num(params, "length", 3.34);
  const rBase = num(params, "rBase", 0.105);
  const rMid = num(params, "rMid", 0.084);
  const rFront = num(params, "rFront", 0.062);
  const brakeR = num(params, "brakeR", 0.092);
  const brakeL = num(params, "brakeL", 0.32);
  const segments = Math.round(num(params, "segments", 40));

  const L = length;
  const brakeStart = L - brakeL;
  const groove1 = brakeStart + brakeL * 0.28;
  const groove2 = brakeStart + brakeL * 0.55;
  const grooveR = brakeR * 0.76;

  // 回转剖面 [半径, 沿轴位置]：从尾端 0 到炮口 L 单调递增（LatheGeometry 法线方向要求）
  const profile: [number, number][] = [
    [0.0005, 0],
    [rBase, 0],
    [rBase, L * 0.16],
    [rMid, L * 0.16],
    [rMid, L * 0.62],
    [rFront, L * 0.62],
    [rFront, brakeStart],
    [brakeR, brakeStart],
    [brakeR, groove1],
    [grooveR, groove1 + 0.012],
    [grooveR, groove2],
    [brakeR, groove2 + 0.012],
    [brakeR, L - 0.05],
    [rFront * 0.86, L - 0.05],
    [rFront * 0.55, L],
    [0.0005, L],
  ];

  const geometry = latheGeometry(profile, segments);
  geometry.rotateZ(Math.PI / 2); // 轴 +Y → -X（炮口朝车头）
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
};

// ============================================================================
// L4-d 起补充的三个 kit：闭式舱盖盘 / 曲面壁板（逃生门）/ 径向凸起（手枪孔）
// ============================================================================

/**
 * 闭式舱盖（装填手舱口 / 车长塔顶盖）：底面在局部 y = 0（装配位 y = 顶面 + 3mm）。
 * 含：盖板盘 + 隆起 + 铰链座（+X 侧）+ 铰链节 + 两个锁扣。
 */
const hatchDisc: GeometryBuilder = (spec) => {
  const params = (spec as { params?: Params }).params;
  const r = num(params, "r", 0.2);
  const t = num(params, "t", 0.022);

  const parts: THREE.BufferGeometry[] = [];

  const lid = cylinderGeometry(r, t, r, 36, 0.004);
  lid.translate(0, t / 2, 0);
  parts.push(lid);

  const dome = cylinderGeometry(r * 0.84, 0.012, r * 0.88, 32, 0.003);
  dome.translate(0, t + 0.006, 0);
  parts.push(dome);

  const hingeBlock = bevelBoxGeometry(0.07, 0.04, 0.1, 0.003, 2);
  hingeBlock.translate(r + 0.02, 0.02, 0);
  parts.push(hingeBlock);

  const knuckle = cylinderGeometry(0.017, 0.12, 0.017, 16, 0.002);
  knuckle.rotateX(Math.PI / 2);
  knuckle.translate(r + 0.05, 0.036, 0);
  parts.push(knuckle);

  for (const z of [-0.07, 0.07]) {
    const latch = bevelBoxGeometry(0.05, 0.016, 0.05, 0.002, 1);
    latch.translate(-r * 0.82, t + 0.008, z);
    parts.push(latch);
  }

  const merged = mergeGeometries(parts);
  for (const item of parts) item.dispose();
  return merged;
};

/**
 * 曲面壁板（炮塔后部逃生门）：绕竖直轴（局部原点 = 炮塔回转中心）的环扇形板。
 * 内层 rIn ~ rIn+t1（角宽 a1Deg）、外层再叠 t2（角宽 a2Deg、竖直居中）——门框 + 门板两级。
 * 装配位 y = 门板底面；几何 y ∈ [0, h1]。
 */
const curvedPanel: GeometryBuilder = (spec) => {
  const params = (spec as { params?: Params }).params;
  const rIn = num(params, "rIn", 0.943);
  const t1 = num(params, "t1", 0.012);
  const t2 = num(params, "t2", 0.01);
  const h1 = num(params, "h1", 0.44);
  const h2 = num(params, "h2", 0.4);
  const a1 = num(params, "a1Deg", 24.5);
  const a2 = num(params, "a2Deg", 21.5);
  const b = Math.min(0.002, t1 * 0.2, t2 * 0.2);

  const layer = (r0: number, th: number, hh: number, aDeg: number): THREE.BufferGeometry => {
    const half = THREE.MathUtils.degToRad(aDeg / 2);
    const inset = b / r0;
    const shape = new THREE.Shape();
    // 外弧 → 径向线 → 内弧（反向）→ 径向线闭合；倒角补回后半径与角宽精确等于名义值
    shape.absarc(0, 0, r0 + th - b, -half + inset, half - inset, false);
    shape.absarc(0, 0, r0 + b, half - inset, -half + inset, true);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: Math.max(hh - 2 * b, 0.001),
      bevelEnabled: true,
      bevelThickness: b,
      bevelSize: b,
      bevelSegments: 1,
      steps: 1,
      curveSegments: 24,
    });
    geo.rotateX(-Math.PI / 2); // 平面 XY → 世界 XZ，挤出 +Z → 世界 +Y
    geo.translate(0, b, 0);
    geo.computeVertexNormals();
    return geo;
  };

  const base = layer(rIn, t1, h1, a1);
  const outer = layer(rIn + t1, t2, h2, a2);
  outer.translate(0, (h1 - h2) / 2, 0);

  const merged = mergeGeometries([base, outer]);
  base.dispose();
  outer.dispose();
  return merged;
};

/** 径向凸起（手枪孔 / 观察镜筒）：圆柱轴沿 +X，含靠壁一侧的凸缘。原点在零件几何中心。 */
const radialPort: GeometryBuilder = (spec) => {
  const params = (spec as { params?: Params }).params;
  const r = num(params, "r", 0.045);
  const h = num(params, "h", 0.022);

  const parts: THREE.BufferGeometry[] = [];

  const plug = cylinderGeometry(r, h, r * 0.92, 24, 0.002);
  plug.rotateZ(-Math.PI / 2);
  parts.push(plug);

  const rim = cylinderGeometry(r * 1.3, 0.008, r * 1.32, 24, 0.0015);
  rim.rotateZ(-Math.PI / 2);
  rim.translate(-h / 2 + 0.004, 0, 0);
  parts.push(rim);

  const merged = mergeGeometries(parts);
  for (const item of parts) item.dispose();
  return merged;
};

export const tigerTurretKitBuilders: Record<string, GeometryBuilder> = {
  turretShell,
  turretCupola,
  turretMantlet,
  turretGunBarrel,
  hatchDisc,
  curvedPanel,
  radialPort,
};
