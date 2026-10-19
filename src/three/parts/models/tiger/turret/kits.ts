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

export const tigerTurretKitBuilders: Record<string, GeometryBuilder> = {
  turretShell,
  turretCupola,
  turretMantlet,
  turretGunBarrel,
};
