import * as THREE from "three";
import {
  bevelBoxGeometry,
  cylinderGeometry,
  latheGeometry,
  mergeGeometries,
  sphereGeometry,
  tubeGeometry,
} from "../../../kernel/geometry";
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

/**
 * 开口马蹄形（U 形条带）：外轮廓 / 内轮廓 + 前部断开。用于把炮塔前壁让给
 * 带炮口的独立前壁板——前壁必须开一个横向炮口孔，而竖直挤出的马蹄环只能开
 * 竖直孔，故把前壁从环形里拆出来单独做。
 */
function horseshoeStripShape(rOut: number, rIn: number, frontX: number): THREE.Shape {
  const shape = new THREE.Shape();
  shape.moveTo(frontX, -rOut);
  shape.lineTo(0, -rOut);
  shape.absarc(0, 0, rOut, -Math.PI / 2, Math.PI / 2, false);
  shape.lineTo(frontX, rOut);
  shape.lineTo(frontX, rIn);
  shape.lineTo(0, rIn);
  shape.absarc(0, 0, rIn, Math.PI / 2, -Math.PI / 2, true);
  shape.lineTo(frontX, -rIn);
  shape.closePath();
  return shape;
}

const turretShell: GeometryBuilder = (spec) => {
  const params = (spec as { params?: Params }).params;
  const rOut = num(params, "rOut");
  const rIn = num(params, "rIn");
  const frontOut = num(params, "frontOut");
  const frontTh = num(params, "frontTh", 0.12);
  const wallH = num(params, "wallH");
  const roofT = num(params, "roofT", 0.025);
  const gunPortR = num(params, "gunPortR", 0);
  const gunPortY = num(params, "gunPortY", 0);
  const bevel = num(params, "bevel", 0.003);

  if (rIn >= rOut || frontTh <= 0 || wallH <= 0) {
    throw new Error(`turret kit：壳体尺寸非法（rOut ${rOut} / rIn ${rIn} / frontTh ${frontTh}）`);
  }

  const b = Math.max(Math.min(bevel, wallH * 0.2, rOut * 0.05, frontTh * 0.2), 0.0004);
  const curveSegments = 64;
  const frontIn = frontOut + frontTh;

  // —— 侧壁 + 后壁（U 形条带）：外轮廓内缩 b / 内轮廓外扩 b / 前端内缩 b（倒角后止于 frontIn）——
  const walls = horseshoeStripShape(rOut - b, rIn + b, frontIn - b);
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

  // —— 前壁板：宽度沿世界 Z、高度沿世界 Y、厚度沿世界 X；中央炮口孔（炮管穿墙）——
  // 临时坐标 (x = 宽, y = 高, z = 厚) → 壳体局部 (x = 厚, y = 宽, z = 高向下)。
  // 该线性变换行列式 = +1（不会翻法线）；宽度取负映射（左右对称，不可察觉）。
  const plateShape = new THREE.Shape();
  const plateW = rOut - b;
  const plateH = wallH / 2 - b;
  plateShape.moveTo(-plateW, -plateH);
  plateShape.lineTo(plateW, -plateH);
  plateShape.lineTo(plateW, plateH);
  plateShape.lineTo(-plateW, plateH);
  plateShape.closePath();
  if (gunPortR > 0) {
    const hole = new THREE.Path();
    const holeY = gunPortY - wallH / 2; // 前壁板局部坐标以壁高中心为零
    hole.absarc(0, holeY, gunPortR + b, 0, Math.PI * 2, true);
    plateShape.holes.push(hole);
  }
  const plateGeo = new THREE.ExtrudeGeometry(plateShape, {
    depth: Math.max(frontTh - 2 * b, 0.001),
    bevelEnabled: true,
    bevelThickness: b,
    bevelSize: b,
    bevelSegments: 1,
    steps: 1,
    curveSegments,
  });
  plateGeo.translate(0, 0, -(frontTh - 2 * b) / 2);
  plateGeo.applyMatrix4(
    new THREE.Matrix4().set(0, 0, 1, (frontOut + frontIn) / 2, -1, 0, 0, 0, 0, -1, 0, wallH / 2, 0, 0, 0, 1),
  );
  plateGeo.computeVertexNormals();

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

  const merged = mergeGeometries([wallGeo, plateGeo, roofGeo]);
  wallGeo.dispose();
  plateGeo.dispose();
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
  const collarRi = num(params, "collarRi", 0.128);
  const b = Math.min(0.008, w * 0.15, h * 0.08, d * 0.08);

  const parts: THREE.BufferGeometry[] = [];

  // 炮盾主体：带中央炮口孔的挤出板（孔沿装甲厚度方向，炮管从中穿过）。
  // 倒角口径：外轮廓先内缩 b、孔先外扩 b、厚度先减 2b。
  const shape = new THREE.Shape();
  const halfD = d / 2 - b;
  const halfH = h / 2 - b;
  shape.moveTo(-halfD, -halfH);
  shape.lineTo(halfD, -halfH);
  shape.lineTo(halfD, halfH);
  shape.lineTo(-halfD, halfH);
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
    curveSegments: 40,
  });
  block.translate(0, 0, -(w - 2 * b) / 2);
  block.rotateY(Math.PI / 2); // 临时 (宽 X / 厚 Z) → 世界 (宽 Z / 厚 X)
  block.computeVertexNormals();
  parts.push(block);

  // 炮口套环：空心筒（内孔 ⌀256），外径与炮盾开孔一致，炮管从套环内穿过
  const collar = tubeGeometry(collarR, collarRi, collarL, 36);
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
  const boreR = num(params, "boreR", 0.044);
  const tailExt = num(params, "tailExt", 0.406); // 尾段穿入炮塔前壁炮口，接到闩室
  const segments = Math.round(num(params, "segments", 48));

  const L = length;
  const brakeStart = L - brakeL;
  const groove1 = brakeStart + brakeL * 0.28;
  const groove2 = brakeStart + brakeL * 0.55;
  const grooveR = brakeR * 0.76;
  const yRear = -tailExt;

  // 回转剖面（闭合环，不碰轴心）：外型从尾端走到炮口，再由炮口内缘沿炮膛回到尾端，
  // 尾端面是「炮膛半径 → 外半径」的环形面——炮膛在车头方向是通的，能看到闩室。
  const profile: [number, number][] = [
    [rBase, yRear],
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
    [rFront, L - 0.02],
    [boreR, L],
    [boreR, yRear],
    [rBase, yRear],
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

/**
 * 烟雾弹发射器（Nebelwurfgerät）：管体 + 球形脚 + 锥形立柱 + 卡箍。
 * 局部：管轴沿 -X（车头方向）、+Z = 车外（安装面在 z = 0 平面），原点 = 安装面上的名义点。
 *
 * 净空要点：球形脚（球心 z = footR、半径 footR）的极点正好落在原点——实例布局把整件
 * 转了任意角度之后，脚面离安装面的最近点仍然正好是原点（= 3mm 名义缝），不会因为外张角
 * 而插进壁里；锥形立柱底面留 22mm 高（26° 外张时最里侧仍有 8.8mm）。
 */
const smokeTube: GeometryBuilder = (spec) => {
  const params = (spec as { params?: Params }).params;
  const rOut = num(params, "rOut", 0.045);
  const wall = num(params, "wall", 0.006);
  const len = num(params, "len", 0.15);
  const axisZ = num(params, "axisZ", 0.075);
  const footR = num(params, "footR", 0.03);
  const postR = num(params, "postR", 0.03);
  const rear = num(params, "rear", 0.012);

  const parts: THREE.BufferGeometry[] = [];

  // 管体：尾底封闭（底厚 26mm）、前端开口。剖面的 +y → 世界 -X（rotateZ(90°)），
  // 所以「管尾世界 x = +rear」的剖面 y = -rear，「管口世界 x = -（len - rear）」的剖面 y = +（len - rear）。
  const yRear = -rear;
  const yFront = len - rear;
  const profile: [number, number][] = [
    [0.0005, yRear],
    [rOut, yRear],
    [rOut, yFront - 0.012],
    [rOut - wall, yFront],
    [rOut - wall, yRear + 0.026],
    [0.0005, yRear + 0.026],
  ];
  const tube = latheGeometry(profile, 36);
  tube.rotateZ(Math.PI / 2);
  tube.translate(0, 0, axisZ);
  parts.push(tube);

  // 球形脚（⌀60 铸球座）：极点 = 原点
  const foot = sphereGeometry(footR, 22, 16);
  foot.translate(0, 0, footR);
  parts.push(foot);

  // 锥形立柱（球头 ⌀60 → 管底 ⌀42）：从球头内 8mm 起，到管轴（x = 0 = 管尾底中央）
  const postZ0 = footR - 0.008;
  const post = cylinderGeometry(postR, axisZ - postZ0, postR * 0.7, 20, 0.002);
  post.rotateX(Math.PI / 2);
  post.translate(0, 0, (postZ0 + axisZ) / 2);
  parts.push(post);

  // 卡箍（管身中段的箍环）
  const band = tubeGeometry(rOut + 0.004, rOut, 0.014, 28);
  band.rotateZ(Math.PI / 2);
  band.translate(rear - len * 0.62, 0, axisZ);
  parts.push(band);

  const merged = mergeGeometries(parts);
  for (const item of parts) item.dispose();
  return merged;
};

// ---------------------------------------------------------------------------
// 车顶 MG34（含 Gurttrommel 34 双联弹鼓）
// 世界向：原点 = 耳轴中心（落在枪管轴线上），枪口朝 -X、枪托朝 +X。
// 枪身自原点起左右各展开：机匣 -0.11 ~ +0.15、枪管到 -0.59、枪托到 +0.50。
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// 近防武器管（Nahverteidigungswaffe）：底座圈 + ⌀90 短管 + 顶盖
// 世界向，原点 = 底座底面中心（落在顶盖上 3mm）。
// ---------------------------------------------------------------------------
const closeDefense: GeometryBuilder = (spec) => {
  const params = (spec as { params?: Params }).params;
  const baseR = num(params, "baseR", 0.078);
  const baseT = num(params, "baseT", 0.014);
  const tubeR = num(params, "tubeR", 0.045);
  const tubeL = num(params, "tubeL", 0.13);

  const parts: THREE.BufferGeometry[] = [];

  // 底座圈 + 6 颗螺栓
  const base = cylinderGeometry(baseR, baseT, baseR - 0.004, 26, 0.002);
  base.translate(0, baseT / 2, 0);
  parts.push(base);
  for (let i = 0; i < 6; i++) {
    const bolt = cylinderGeometry(0.007, 0.006, 0.007, 10, 0.001);
    bolt.translate(baseR - 0.018, baseT + 0.003, 0);
    bolt.rotateY((i * Math.PI) / 3);
    parts.push(bolt);
  }

  // 管体（壁厚 6mm）+ 顶盖（离管口 3mm，铰链侧）
  const tube = tubeGeometry(tubeR, tubeR - 0.006, tubeL, 30);
  tube.translate(0, baseT + tubeL / 2, 0);
  parts.push(tube);
  const cap = cylinderGeometry(0.052, 0.018, 0.05, 26, 0.003);
  cap.translate(0, baseT + tubeL + 0.003 + 0.009, 0);
  parts.push(cap);
  // 铰链座 + 销
  const hinge = bevelBoxGeometry(0.03, 0.024, 0.022, 0.002);
  hinge.translate(0, baseT + tubeL + 0.004, -0.052);
  parts.push(hinge);
  const hingePin = cylinderGeometry(0.005, 0.05, 0.005, 10, 0.001);
  hingePin.rotateZ(Math.PI / 2);
  hingePin.translate(0, baseT + tubeL + 0.008, -0.055);
  parts.push(hingePin);

  const merged = mergeGeometries(parts);
  for (const item of parts) item.dispose();
  return merged;
};

// ---------------------------------------------------------------------------
// 装填手舱盖潜望镜（Winkelspiegel）：底座转盘 + 45° 头 + 前窗 + 提手
// 世界向，原点 = 舱盖面上方 3mm 的底座底面中心。
// ---------------------------------------------------------------------------
const loaderPeriscope: GeometryBuilder = (spec) => {
  const params = (spec as { params?: Params }).params;
  const baseR = num(params, "baseR", 0.054);
  const baseT = num(params, "baseT", 0.028);

  const parts: THREE.BufferGeometry[] = [];

  const base = cylinderGeometry(baseR, baseT, baseR - 0.006, 24, 0.002);
  base.translate(0, baseT / 2, 0);
  parts.push(base);
  // 转头：底面 ⌀100 → 顶面略小，前壁斜 45°
  const head = bevelBoxGeometry(0.09, 0.064, 0.072, 0.005);
  head.translate(0, baseT + 0.032, -0.004);
  parts.push(head);
  // 前窗（45° 斜面小块，朝前下）
  const window = bevelBoxGeometry(0.064, 0.032, 0.012, 0.002);
  window.rotateX(-0.62);
  window.translate(0, baseT + 0.038, -0.04);
  parts.push(window);
  // 顶部提手（两根立柱 + 横杆）
  for (const sign of [-1, 1]) {
    const post = cylinderGeometry(0.004, 0.024, 0.004, 8, 0.001);
    post.translate(sign * 0.026, baseT + 0.075, 0.008);
    parts.push(post);
  }
  const grip = cylinderGeometry(0.005, 0.06, 0.005, 8, 0.001);
  grip.rotateZ(Math.PI / 2);
  grip.translate(0, baseT + 0.086, 0.008);
  parts.push(grip);

  const merged = mergeGeometries(parts);
  for (const item of parts) item.dispose();
  return merged;
};

// ---------------------------------------------------------------------------
// 炮尾闩室（Verschlussstück）：框式闩室 + 药室筒
// 世界向，原点 = 闩室几何中心（炮膛轴线 y = 0），-X 朝炮口。
// 框体上/侧/下梁留出中央空腔；药室筒向前伸出框体，穿进炮塔前壁的炮口。
// 下梁分成两侧窄轨，中间留槽——闩体向下滑动开闩时不撞药室。
// ---------------------------------------------------------------------------
const gunBreechRing: GeometryBuilder = (spec) => {
  const params = (spec as { params?: Params }).params;
  const len = num(params, "len", 0.42);
  const h = num(params, "h", 0.2);
  const w = num(params, "w", 0.32);
  const chamberR = num(params, "chamberR", 0.078);
  const chamberWall = num(params, "chamberWall", 0.017);
  const chamberLen = num(params, "chamberLen", 0.35);
  const chamberCX = num(params, "chamberCX", -0.095);

  const parts: THREE.BufferGeometry[] = [];

  const top = bevelBoxGeometry(len, 0.02, w, 0.003);
  top.translate(0, h / 2 - 0.01, 0);
  parts.push(top);
  for (const side of [-1, 1]) {
    const wall = bevelBoxGeometry(len, h - 0.04, 0.02, 0.003);
    wall.translate(0, 0, side * (w / 2 - 0.01));
    parts.push(wall);
    const rail = bevelBoxGeometry(len, 0.02, 0.015, 0.002);
    rail.translate(0, -(h / 2 - 0.01), side * (w / 2 - 0.0075));
    parts.push(rail);
  }

  // 药室筒（开口朝后），前后两道加强环
  const chamber = tubeGeometry(chamberR + chamberWall, chamberR, chamberLen, 40);
  chamber.rotateZ(Math.PI / 2);
  chamber.translate(chamberCX, 0, 0);
  parts.push(chamber);
  const rim = tubeGeometry(chamberR + 0.024, chamberR, 0.018, 40);
  rim.rotateZ(Math.PI / 2);
  rim.translate(chamberCX + chamberLen / 2 - 0.009, 0, 0);
  parts.push(rim);
  const frontFlange = tubeGeometry(chamberR + 0.032, chamberR + chamberWall, 0.022, 40);
  frontFlange.rotateZ(Math.PI / 2);
  frontFlange.translate(-len / 2 + 0.011, 0, 0);
  parts.push(frontFlange);

  const merged = mergeGeometries(parts);
  for (const item of parts) item.dispose();
  return merged;
};

// ---------------------------------------------------------------------------
// 立楔式闩体（Fallblock）：闩体本体 + 后端击针座
// 世界向，原点 = 闩体中心；-X 朝炮口。闩体在闩室框内上下滑动（下缘留 5mm）。
// ---------------------------------------------------------------------------
const breechBlock: GeometryBuilder = (spec) => {
  const params = (spec as { params?: Params }).params;
  const len = num(params, "len", 0.08);
  const h = num(params, "h", 0.15);
  const w = num(params, "w", 0.26);

  const parts: THREE.BufferGeometry[] = [];
  const body = bevelBoxGeometry(len, h, w, 0.004, 2);
  parts.push(body);
  const boss = cylinderGeometry(0.045, 0.012, 0.04, 24, 0.002);
  boss.rotateZ(-Math.PI / 2); // 轴 +Y → +X（朝车尾）
  boss.translate(len / 2 + 0.006, 0, 0);
  parts.push(boss);
  // 两侧滑轨（与闩室框内壁留 4mm）
  for (const side of [-1, 1]) {
    const rail = bevelBoxGeometry(len, h - 0.02, 0.006, 0.002);
    rail.translate(0, 0, side * (w / 2 + 0.003));
    parts.push(rail);
  }

  const merged = mergeGeometries(parts);
  for (const item of parts) item.dispose();
  return merged;
};

/** 圆柱螺旋弹簧（轴沿 X）：TubeGeometry 沿自定义螺旋曲线扫掠。 */
function coilSpringGeometry(
  radius: number,
  wireR: number,
  length: number,
  turns: number,
  segmentsPerTurn = 18,
): THREE.BufferGeometry {
  class Helix extends THREE.Curve<THREE.Vector3> {
    constructor() {
      super();
    }
    override getPoint(t: number, target = new THREE.Vector3()): THREE.Vector3 {
      const angle = t * turns * Math.PI * 2;
      return target.set((t - 0.5) * length, Math.cos(angle) * radius, Math.sin(angle) * radius);
    }
  }
  const tube = new THREE.TubeGeometry(
    new Helix(),
    Math.max(16, Math.round(turns * segmentsPerTurn)),
    wireR,
    6,
    false,
  );
  return tube;
}

// ---------------------------------------------------------------------------
// 击针与击针簧（Schlagbolzen）：击针 + 螺旋簧 + 前端挡盘 + 后端击发帽
// 世界向，原点 = 击针组件中心；轴沿 X（+X 朝车尾）。
// ---------------------------------------------------------------------------
const firingPin: GeometryBuilder = (spec) => {
  const params = (spec as { params?: Params }).params;
  const len = num(params, "len", 0.09);

  const parts: THREE.BufferGeometry[] = [];
  const pin = cylinderGeometry(0.006, len, 0.006, 14, 0.0005);
  pin.rotateZ(Math.PI / 2);
  parts.push(pin);
  const tip = cylinderGeometry(0.0025, 0.014, 0.006, 12, 0.0003);
  tip.rotateZ(Math.PI / 2);
  tip.translate(-len / 2 - 0.003, 0, 0);
  parts.push(tip);

  const spring = coilSpringGeometry(0.017, 0.0035, 0.062, 9, 16);
  spring.translate(0.002, 0, 0);
  parts.push(spring);

  const flange = cylinderGeometry(0.026, 0.01, 0.026, 20, 0.001);
  flange.rotateZ(Math.PI / 2);
  flange.translate(-len / 2, 0, 0);
  parts.push(flange);
  const knob = cylinderGeometry(0.018, 0.018, 0.018, 18, 0.001);
  knob.rotateZ(Math.PI / 2);
  knob.translate(len / 2 + 0.005, 0, 0);
  parts.push(knob);

  const merged = mergeGeometries(parts);
  for (const item of parts) item.dispose();
  return merged;
};

// ---------------------------------------------------------------------------
// 炮闩保险（Sicherung）：轴 + 拨柄 + 球头；装到闩室右侧外壁
// 世界向，原点 = 轴心在闩室侧面上的名义点。
// ---------------------------------------------------------------------------
const breechSafety: GeometryBuilder = (spec) => {
  const params = (spec as { params?: Params }).params;
  const shaftLen = num(params, "shaftLen", 0.027);

  const parts: THREE.BufferGeometry[] = [];
  const shaft = cylinderGeometry(0.008, shaftLen, 0.008, 14, 0.001);
  shaft.rotateX(Math.PI / 2); // 轴 +Y → -Z（朝车外）
  shaft.translate(0, 0, -shaftLen / 2);
  parts.push(shaft);
  const lever = bevelBoxGeometry(0.018, 0.07, 0.012, 0.002);
  lever.translate(0, -0.032, -shaftLen + 0.004);
  parts.push(lever);
  const ball = sphereGeometry(0.011, 12, 8);
  ball.translate(0, -0.066, -shaftLen + 0.004);
  parts.push(ball);

  const merged = mergeGeometries(parts);
  for (const item of parts) item.dispose();
  return merged;
};

// ---------------------------------------------------------------------------
// 炮闩抽壳钩（Auszieher）：轴座 + 钩臂 + 钩爪；装在闩体前面上缘
// 世界向，原点 = 轴座中心；-X 朝炮口。
// ---------------------------------------------------------------------------
const breechExtractor: GeometryBuilder = () => {
  const parts: THREE.BufferGeometry[] = [];
  const boss = cylinderGeometry(0.018, 0.022, 0.018, 16, 0.001);
  boss.rotateX(Math.PI / 2);
  parts.push(boss);
  const arm = bevelBoxGeometry(0.07, 0.024, 0.018, 0.002);
  arm.translate(-0.03, -0.01, 0);
  parts.push(arm);
  const claw = bevelBoxGeometry(0.018, 0.032, 0.015, 0.002);
  claw.translate(-0.068, -0.028, 0);
  parts.push(claw);

  const merged = mergeGeometries(parts);
  for (const item of parts) item.dispose();
  return merged;
};

// ---------------------------------------------------------------------------
// 火炮摇架（Wiege）：两片侧颊 + 下横梁 + 耳轴座；炮身/闩室在颊板之间后坐
// 世界向，原点 = 耳轴中心（炮膛轴线）。前缘离炮塔前壁内面 3mm。
// ---------------------------------------------------------------------------
const gunCradle: GeometryBuilder = (spec) => {
  const params = (spec as { params?: Params }).params;
  const frontX = num(params, "frontX", -0.257); // 相对耳轴
  const rearX = num(params, "rearX", 0.22);
  const halfH = num(params, "halfH", 0.28);
  const zMid = num(params, "zMid", 0.22);

  const parts: THREE.BufferGeometry[] = [];
  const len = rearX - frontX;
  const cx = (frontX + rearX) / 2;
  for (const side of [-1, 1]) {
    const cheek = bevelBoxGeometry(len, halfH * 2, 0.03, 0.004, 2);
    cheek.translate(cx, 0, side * zMid);
    parts.push(cheek);
    const boss = cylinderGeometry(0.05, 0.03, 0.05, 24, 0.003);
    boss.rotateX(Math.PI / 2);
    boss.translate(0, 0, side * (zMid + 0.015));
    parts.push(boss);
    const cap = cylinderGeometry(0.024, 0.014, 0.024, 16, 0.002);
    cap.rotateX(Math.PI / 2);
    cap.translate(0, 0, side * (zMid + 0.037));
    parts.push(cap);
    // 前部安装耳（离炮塔前壁内面 3mm）
    const ear = bevelBoxGeometry(0.03, 0.42, 0.05, 0.003);
    ear.translate(frontX + 0.015, 0, side * (zMid - 0.03));
    parts.push(ear);
  }
  const bottom = bevelBoxGeometry(0.1, 0.02, zMid * 2 - 0.02, 0.003);
  bottom.translate(frontX + 0.09, -halfH - 0.005, 0);
  parts.push(bottom);

  const merged = mergeGeometries(parts);
  for (const item of parts) item.dispose();
  return merged;
};

// ---------------------------------------------------------------------------
// 制退机 / 复进机筒（Rücklaufbremse / Vorholer）：圆筒 + 端盖 + 两侧安装耳
// 世界向，原点 = 筒中心，轴沿 X。安装耳外端离摇架颊板 5mm。
// ---------------------------------------------------------------------------
const recoilCylinder: GeometryBuilder = (spec) => {
  const params = (spec as { params?: Params }).params;
  const r = num(params, "r", 0.06);
  const len = num(params, "len", 0.44);
  const flangeR = num(params, "flangeR", r + 0.008);
  const ears = params?.ears !== false;

  const parts: THREE.BufferGeometry[] = [];
  const body = cylinderGeometry(r, len, r, 28, 0.002);
  body.rotateZ(Math.PI / 2);
  parts.push(body);
  for (const end of [-1, 1]) {
    const cap = cylinderGeometry(flangeR, 0.018, flangeR, 28, 0.002);
    cap.rotateZ(Math.PI / 2);
    cap.translate(end * (len / 2 - 0.009), 0, 0);
    parts.push(cap);
    const neck = cylinderGeometry(r * 0.42, 0.02, r * 0.42, 16, 0.001);
    neck.rotateZ(Math.PI / 2);
    neck.translate(end * (len / 2 + 0.005), 0, 0);
    parts.push(neck);
    if (ears) {
      for (const side of [-1, 1]) {
        const ear = bevelBoxGeometry(0.04, 0.05, 0.09, 0.003);
        ear.translate(end * (len / 2 - 0.09), -0.03, side * 0.155);
        parts.push(ear);
      }
    }
  }

  const merged = mergeGeometries(parts);
  for (const item of parts) item.dispose();
  return merged;
};

// ---------------------------------------------------------------------------
// 车长塔环形枪座（Flieger-MG-Drehring）：抱塔环 + 4 只支脚 + 前立柱 + 悬臂 + 枪座
// 局部原点 = 炮塔顶盖面、车长塔中心；塔筒与观察缝全部让开。
// 环底面离顶盖 3mm（4 只脚），环顶 1.884 < 观察缝底 1.8865。
// ---------------------------------------------------------------------------
const aaRingMount: GeometryBuilder = (spec) => {
  const params = (spec as { params?: Params }).params;
  const ringR = num(params, "ringR", 0.315);
  const ringW = num(params, "ringW", 0.03);
  const ringH = num(params, "ringH", 0.036);
  const gapDeg = num(params, "gapDeg", 70);
  const gapCenterDeg = num(params, "gapCenterDeg", 325);
  const postX = -ringR;
  const armEndX = num(params, "armEndX", -0.46);
  const pintleZ = num(params, "pintleZ", -0.13);
  const armTop = num(params, "armTop", 0.309); // 耳轴座顶面（相对顶盖）
  const parts: THREE.BufferGeometry[] = [];

  // 抱塔环：朝排烟风扇罩方向（车尾右后）留 70° 开口——整圈会切进风扇罩。
  const b = Math.min(0.002, ringH * 0.2);
  const halfGap = THREE.MathUtils.degToRad(gapDeg / 2);
  const center = THREE.MathUtils.degToRad(gapCenterDeg);
  const start = center + halfGap;
  const end = center + Math.PI * 2 - halfGap;
  const shape = new THREE.Shape();
  shape.absarc(0, 0, ringR - b, start, end, false);
  shape.absarc(0, 0, ringR - ringW + b, end, start, true);
  shape.closePath();
  const band = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(ringH - 2 * b, 0.001),
    bevelEnabled: true,
    bevelThickness: b,
    bevelSize: b,
    bevelSegments: 1,
    steps: 1,
    curveSegments: 56,
  });
  band.rotateX(-Math.PI / 2);
  band.translate(0, 0.012 + b, 0);
  parts.push(band);

  // 3 只支脚（底面离顶盖 3mm）
  for (const deg of [100, 200, 280]) {
    const angle = THREE.MathUtils.degToRad(deg);
    const foot = bevelBoxGeometry(0.045, 0.012, 0.032, 0.002);
    foot.translate(Math.cos(angle) * (ringR - 0.018), 0.009, Math.sin(angle) * (ringR - 0.018));
    parts.push(foot);
  }

  // 前立柱 + 沿 X 的悬臂 + 向炮手一侧的横臂 + 枪座立柱
  const postTop = armTop - 0.018;
  const post = cylinderGeometry(0.028, postTop - 0.048, 0.028, 20, 0.002);
  post.translate(postX, (0.048 + postTop) / 2, 0);
  parts.push(post);
  const collar = cylinderGeometry(0.04, 0.02, 0.04, 20, 0.002);
  collar.translate(postX, 0.17, 0);
  parts.push(collar);

  const arm = bevelBoxGeometry(Math.abs(armEndX - postX), 0.018, 0.08, 0.003);
  arm.translate((postX + armEndX) / 2, armTop - 0.009, 0);
  parts.push(arm);
  const cross = bevelBoxGeometry(0.07, 0.018, Math.abs(pintleZ) + 0.02, 0.003);
  cross.translate(armEndX, armTop - 0.009, pintleZ / 2);
  parts.push(cross);
  const pintle = cylinderGeometry(0.024, armTop - 0.257, 0.024, 20, 0.002);
  pintle.translate(armEndX, (0.257 + armTop) / 2, pintleZ);
  parts.push(pintle);

  const merged = mergeGeometries(parts);
  for (const item of parts) item.dispose();
  return merged;
};

// ---------------------------------------------------------------------------
// 枪座防盾（Schutzschild）：双侧面板 + 下挡板（顶部开口让炮管俯仰）+ 后支架
// 世界向，原点 = 盾面中心；-X 朝车头，炮管从顶部开口穿过。
// ---------------------------------------------------------------------------
const aaShield: GeometryBuilder = (spec) => {
  const params = (spec as { params?: Params }).params;
  const w = num(params, "w", 0.42);
  const h = num(params, "h", 0.34);
  const t = num(params, "t", 0.008);
  const slotW = num(params, "slotW", 0.1);
  const bottomH = num(params, "bottomH", 0.12);
  const bracketLen = num(params, "bracketLen", 0.21);

  const parts: THREE.BufferGeometry[] = [];
  const sideW = (w - slotW) / 2;
  for (const side of [-1, 1]) {
    const panel = bevelBoxGeometry(t, h, sideW, 0.002);
    panel.translate(0, 0, side * (slotW / 2 + sideW / 2));
    parts.push(panel);
  }
  const bottom = bevelBoxGeometry(t, bottomH, slotW, 0.002);
  bottom.translate(0, -h / 2 + bottomH / 2, 0);
  parts.push(bottom);
  const bracket = bevelBoxGeometry(bracketLen, 0.03, 0.06, 0.003);
  bracket.translate(t / 2 + bracketLen / 2, -h / 2 + bottomH - 0.015, 0);
  parts.push(bracket);
  // 支架三角撑
  for (const side of [-1, 1]) {
    const gusset = bevelBoxGeometry(0.1, 0.02, 0.012, 0.002);
    gusset.translate(t / 2 + 0.06, -h / 2 + bottomH - 0.005, side * 0.04);
    parts.push(gusset);
  }

  const merged = mergeGeometries(parts);
  for (const item of parts) item.dispose();
  return merged;
};

// ---------------------------------------------------------------------------
// 炮口焰（特效）：核心球 + 前向锥 + 6 片径向星芒，整体在炮口前方 35mm 之外。
// 世界向，原点 = 炮口前 5mm 的名义中心；-X 朝车头。动画只切 visible / scale。
// ---------------------------------------------------------------------------
const muzzleFlash: GeometryBuilder = (spec) => {
  const params = (spec as { params?: Params }).params;
  const coreR = num(params, "coreR", 0.1);
  const parts: THREE.BufferGeometry[] = [];
  const core = sphereGeometry(coreR, 14, 10);
  core.scale(1.5, 1, 1);
  core.translate(-0.18, 0, 0);
  parts.push(core);
  const cone = cylinderGeometry(0.12, 0.42, 0.008, 12, 0);
  cone.rotateZ(Math.PI / 2);
  cone.translate(-0.3, 0, 0);
  parts.push(cone);
  for (let i = 0; i < 6; i++) {
    const lobe = sphereGeometry(0.05, 8, 6);
    lobe.scale(1.2, 3.2, 1);
    lobe.rotateX((i * Math.PI) / 3);
    lobe.translate(-0.16, 0, 0);
    parts.push(lobe);
  }
  const merged = mergeGeometries(parts);
  for (const item of parts) item.dispose();
  return merged;
};

// ---------------------------------------------------------------------------
// 顶盖排烟风扇罩：⌀300 罩圈 + 蘑菇顶盖 + 4 根支撑爪
// 世界向，原点 = 罩圈底面中心（落在顶盖上 3mm）。
// ---------------------------------------------------------------------------
const ventCowl: GeometryBuilder = (spec) => {
  const params = (spec as { params?: Params }).params;
  const r = num(params, "r", 0.15);
  const h = num(params, "h", 0.038);
  const wall = num(params, "wall", 0.008);

  const parts: THREE.BufferGeometry[] = [];

  const skirt = tubeGeometry(r, r - wall, h, 32);
  skirt.translate(0, h / 2, 0);
  parts.push(skirt);
  const cap = cylinderGeometry(r + 0.012, 0.01, r + 0.006, 32, 0.003);
  cap.translate(0, h + 0.003 + 0.005, 0);
  parts.push(cap);
  for (let i = 0; i < 4; i++) {
    const arm = bevelBoxGeometry(0.046, 0.01, 0.026, 0.002);
    arm.translate(r - 0.008, h + 0.008, 0);
    arm.rotateY(Math.PI / 4 + (i * Math.PI) / 2);
    parts.push(arm);
  }

  const merged = mergeGeometries(parts);
  for (const item of parts) item.dispose();
  return merged;
};

// 车顶 MG34 拆分件（装填手舱口环形枪座用）
//
// 局部系（与 AaGun 节点一致）：原点 = 耳轴（机匣底面中心），+X 枪托、-X 枪口；
// 机匣中心抬到 y +0.04（枪管轴线 y 0.04）。抬头角改为节点 rest_rotation，
// 这些 kit 不再自带 pitch —— 射击动画可在节点上叠加枪口上跳。
//   aaMgBody   机匣 + 供弹盖 + 照门 + 枪管延伸套（空心，枪管在其孔内短后坐）
//   aaMgStock  木质枪托 + 托底板（与机匣后榫留 3mm 装配缝）
//   aaMgGrip   握把 + 扳机护圈（与机匣底面留 3mm）
//   aaMgDrums  双联弹鼓 + 箍带 + 中央轴（离供弹盖 3mm）
//   aaMgBarrel 枪管 + 散热套 + 箍 + 枪口 + 准星
//   aaMgBelt   可见供弹链（7 节，沿斜向路径；AaFeed 节点每发步进一节距）
// ---------------------------------------------------------------------------
const MG_LOCAL_Y = 0.04;

const aaMgBody: GeometryBuilder = () => {
  const parts: THREE.BufferGeometry[] = [];
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, bevel = 0.002) => {
    const g = bevelBoxGeometry(w, h, d, bevel);
    g.translate(x, y, z);
    parts.push(g);
  };
  box(0.26, 0.08, 0.075, 0.02, MG_LOCAL_Y, 0);
  box(0.16, 0.022, 0.062, 0.02, MG_LOCAL_Y + 0.051, 0);
  // 机匣后榫：与独立枪托之间留 3mm 装配缝
  box(0.03, 0.04, 0.04, 0.165, MG_LOCAL_Y, 0);
  // 枪管延伸套（空心）：枪管尾段在孔内，短后坐 6mm 不碰机匣
  const extension = tubeGeometry(0.032, 0.021, 0.06, 24);
  extension.rotateZ(Math.PI / 2);
  extension.translate(-0.14, MG_LOCAL_Y, 0);
  parts.push(extension);
  // 照门
  box(0.05, 0.012, 0.03, 0.13, MG_LOCAL_Y + 0.074, 0);
  box(0.008, 0.02, 0.026, 0.112, MG_LOCAL_Y + 0.09, 0);
  // 耳轴座（立柱顶 2mm 检视缝）
  box(0.06, 0.012, 0.06, 0, -0.006, 0);
  const merged = mergeGeometries(parts);
  for (const item of parts) item.dispose();
  return merged;
};

const aaMgStock: GeometryBuilder = () => {
  const parts: THREE.BufferGeometry[] = [];
  const stock = bevelBoxGeometry(0.31, 0.06, 0.042, 0.003);
  stock.translate(0.335, 0.036, 0);
  parts.push(stock);
  const butt = bevelBoxGeometry(0.012, 0.078, 0.05, 0.002);
  butt.translate(0.496, 0.036, 0);
  parts.push(butt);
  const merged = mergeGeometries(parts);
  for (const item of parts) item.dispose();
  return merged;
};

const aaMgGrip: GeometryBuilder = () => {
  const parts: THREE.BufferGeometry[] = [];
  const grip = bevelBoxGeometry(0.03, 0.08, 0.034, 0.003);
  grip.translate(0, 0, 0);
  grip.rotateZ(0.26);
  grip.translate(0.15, -0.0455, 0);
  parts.push(grip);
  // 握把与扳机护圈之间的连接块（同一零件内）
  const neck = bevelBoxGeometry(0.016, 0.03, 0.02, 0.002);
  neck.translate(0.164, -0.052, 0);
  parts.push(neck);
  const guard = bevelBoxGeometry(0.056, 0.008, 0.03, 0.002);
  guard.translate(0.178, -0.062, 0);
  parts.push(guard);
  const merged = mergeGeometries(parts);
  for (const item of parts) item.dispose();
  return merged;
};

const aaMgDrums: GeometryBuilder = () => {
  const parts: THREE.BufferGeometry[] = [];
  for (const sign of [-1, 1]) {
    const drum = cylinderGeometry(0.088, 0.052, 0.088, 28, 0.003);
    drum.rotateX(Math.PI / 2);
    drum.translate(0.02, 0.199, sign * 0.0275);
    parts.push(drum);
  }
  const band = tubeGeometry(0.094, 0.086, 0.022, 28);
  band.rotateX(Math.PI / 2);
  band.translate(0.02, 0.199, 0);
  parts.push(band);
  const hub = cylinderGeometry(0.012, 0.11, 0.012, 14, 0.001);
  hub.rotateX(Math.PI / 2);
  hub.translate(0.02, 0.199, 0);
  parts.push(hub);
  const merged = mergeGeometries(parts);
  for (const item of parts) item.dispose();
  return merged;
};

const aaMgBarrel: GeometryBuilder = (spec) => {
  const params = (spec as { params?: Params }).params;
  const barrelLen = num(params, "barrelLen", 0.44);
  const parts: THREE.BufferGeometry[] = [];
  const barrel = cylinderGeometry(0.0195, barrelLen, 0.0195, 18, 0.002);
  barrel.rotateZ(Math.PI / 2);
  barrel.translate(-0.13 - barrelLen / 2, MG_LOCAL_Y, 0);
  parts.push(barrel);
  const jacket = cylinderGeometry(0.033, 0.17, 0.03, 20, 0.002);
  jacket.rotateZ(Math.PI / 2);
  jacket.translate(-0.275, MG_LOCAL_Y, 0);
  parts.push(jacket);
  for (const x of [-0.195, -0.345]) {
    const ring = cylinderGeometry(0.036, 0.014, 0.036, 20, 0.002);
    ring.rotateZ(Math.PI / 2);
    ring.translate(x, MG_LOCAL_Y, 0);
    parts.push(ring);
  }
  const muzzle = cylinderGeometry(0.028, 0.05, 0.022, 18, 0.002);
  muzzle.rotateZ(Math.PI / 2);
  muzzle.translate(-0.13 - barrelLen - 0.02, MG_LOCAL_Y, 0);
  parts.push(muzzle);
  const sight = bevelBoxGeometry(0.014, 0.03, 0.01, 0.002);
  sight.translate(-0.13 - barrelLen + 0.04, MG_LOCAL_Y + 0.042, 0);
  parts.push(sight);
  const merged = mergeGeometries(parts);
  for (const item of parts) item.dispose();
  return merged;
};

/** 供弹链局部路径：从弹鼓左下方斜向供弹盖；AaFeed 节点沿该方向每发步进一节距。 */
export const TIGER_MG_BELT_DIR = new THREE.Vector3(0.93, -0.20, -0.28).normalize();
export const TIGER_MG_BELT_PITCH = 0.014;
const MG_BELT_LINKS = 5;

const aaMgBelt: GeometryBuilder = () => {
  const parts: THREE.BufferGeometry[] = [];
  const quaternion = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(1, 0, 0),
    TIGER_MG_BELT_DIR,
  );
  const matrix = new THREE.Matrix4();
  for (let i = 0; i < MG_BELT_LINKS; i++) {
    const link = bevelBoxGeometry(0.011, 0.006, 0.022, 0.0012);
    link.translate(0, 0, 0);
    matrix.compose(
      TIGER_MG_BELT_DIR.clone().multiplyScalar(i * TIGER_MG_BELT_PITCH),
      quaternion,
      new THREE.Vector3(1, 1, 1),
    );
    link.applyMatrix4(matrix);
    parts.push(link);
  }
  const merged = mergeGeometries(parts);
  for (const item of parts) item.dispose();
  return merged;
};

/** 7.92×57 弹壳：壳体 + 底缘 + 收口，局部轴沿 X。 */
const mgCase: GeometryBuilder = () => {
  const parts: THREE.BufferGeometry[] = [];
  const body = cylinderGeometry(0.006, 0.057, 0.006, 12, 0.0004);
  body.rotateZ(Math.PI / 2);
  parts.push(body);
  const rim = cylinderGeometry(0.0072, 0.004, 0.0072, 12, 0.0003);
  rim.rotateZ(Math.PI / 2);
  rim.translate(-0.0305, 0, 0);
  parts.push(rim);
  const neck = cylinderGeometry(0.0052, 0.01, 0.0042, 10, 0.0003);
  neck.rotateZ(Math.PI / 2);
  neck.translate(0.0305, 0, 0);
  parts.push(neck);
  const merged = mergeGeometries(parts);
  for (const item of parts) item.dispose();
  return merged;
};

/** 车顶 MG34 枪口焰（小）：在枪口前方 5mm，供 AaBarrel 上的 fx 件使用。 */
const aaMgFlash: GeometryBuilder = () => {
  const parts: THREE.BufferGeometry[] = [];
  const core = sphereGeometry(0.028, 10, 8);
  core.scale(1.6, 1, 1);
  core.translate(-0.06, 0, 0);
  parts.push(core);
  for (let i = 0; i < 4; i++) {
    const lobe = sphereGeometry(0.016, 8, 6);
    lobe.scale(2.2, 1, 1);
    lobe.rotateX((i * Math.PI) / 2);
    lobe.translate(-0.05, 0, 0);
    parts.push(lobe);
  }
  const merged = mergeGeometries(parts);
  for (const item of parts) item.dispose();
  return merged;
};

// ---------------------------------------------------------------------------

export const tigerTurretKitBuilders: Record<string, GeometryBuilder> = {
  turretShell,
  turretCupola,
  turretMantlet,
  turretGunBarrel,
  hatchDisc,
  curvedPanel,
  radialPort,
  smokeTube,
  aaRingMount,
  aaMgBody,
  aaMgStock,
  aaMgGrip,
  aaMgDrums,
  aaMgBarrel,
  aaMgBelt,
  aaMgFlash,
  mgCase,
  aaShield,
  closeDefense,
  loaderPeriscope,
  ventCowl,
  muzzleFlash,
  gunBreechRing,
  breechBlock,
  firingPin,
  breechSafety,
  breechExtractor,
  gunCradle,
  recoilCylinder,
};
