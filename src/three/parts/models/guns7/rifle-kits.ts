import * as THREE from "three";
import type { GeometryBuilder } from "../../assembler/geometry";
import {
  latheGeometry,
  loftGeometry,
  mergeGeometries,
} from "../../kernel/geometry";
import { box, cylinderX, cylinderY, cylinderZ, gun7Kits, plate, torusZ, tubeZ } from "./kits";

// ============================================================================
// models/guns7/rifle-kits —??栓动/步枪线共用几??//
// 这些件不是「一个方块冒充」：枪托是侧轮廓挤出、护木是 U 形剖壳??// 扳机/阻铁是侧轮廓、背带环是真实环体、螺钉带槽。原点与轴向写在每个 kit 上??// ============================================================================

type Params = Record<string, unknown>;

function num(params: Params | undefined, key: string, fallback?: number): number {
  const value = params?.[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (fallback !== undefined) return fallback;
  throw new Error(`rifle kit：参??"${key}" 必须是数值`);
}

function bool(params: Params | undefined, key: string, fallback: boolean): boolean {
  const value = params?.[key];
  return typeof value === "boolean" ? value : fallback;
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  merged.computeVertexNormals();
  return merged;
}

// ---------------------------------------------------------------------------
// stockButt ??枪托后段 + 枪颈：按侧轮廓挤出，含托底斜面与握颈收腰??// 局部系??Z 枪口??Y 上；原点 = 枪托后端面中心（托底板前）??// ---------------------------------------------------------------------------
const stockButt: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  // 真实枪托不是「侧面剪影 + 固定厚度」的木板：从托底到握颈，截面宽度、
  // 上下缘、圆角都在连续变化。这里用超椭圆放样，托底宽而圆、握颈收窄、
  // 托腮面微微下倾；托底板/背带环仍是独立零件。
  const widthScale = num(p, "widthScale", 1);
  const sections = [
    { z: -0.552, width: 0.044 * widthScale, top: -0.008, bottom: -0.1, squareness: 0.56 },
    { z: -0.545, width: 0.048 * widthScale, top: -0.004, bottom: -0.104, squareness: 0.58 },
    { z: -0.5, width: 0.047 * widthScale, top: -0.005, bottom: -0.103, squareness: 0.6 },
    { z: -0.44, width: 0.046 * widthScale, top: -0.006, bottom: -0.099, squareness: 0.6 },
    { z: -0.39, width: 0.044 * widthScale, top: -0.007, bottom: -0.092, squareness: 0.58 },
    { z: -0.345, width: 0.04 * widthScale, top: -0.012, bottom: -0.082, squareness: 0.52 },
    { z: -0.305, width: 0.034 * widthScale, top: -0.022, bottom: -0.074, squareness: 0.46 },
    { z: -0.275, width: 0.031 * widthScale, top: -0.03, bottom: -0.07, squareness: 0.42 },
    { z: -0.24, width: 0.035 * widthScale, top: -0.031, bottom: -0.069, squareness: 0.45 },
  ];
  return loftGeometry(sections, 36, true, true);
};

// ---------------------------------------------------------------------------
// foreEnd ??护木/前托 U 形剖壳：左右??+ 底板，顶面开放露出枪管??// 局部系：原??= 后端面中心、顶面；+Z 向前，壁向下??// ---------------------------------------------------------------------------
const stockWrist: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const width = num(p, "width", 0.048);
  const wall = num(p, "wall", 0.004);
  // 枪颈两侧木墙：用极窄的超椭圆放样代替平板。它仍然是左右两片，
  // 中间留出扳机/弹仓的让位腔，但外表面是圆的，不像两块胶合板。
  // 只做到弹仓木侧板起始处（-0.158），再往前由弹仓侧板接手，
  // 两段木料不重叠（真实枪托就是两段木料拼接）。
  const sections = [
    { z: -0.24, width: wall, top: -0.031, bottom: -0.07, squareness: 0.5 },
    { z: -0.215, width: wall, top: -0.031, bottom: -0.071, squareness: 0.5 },
    { z: -0.19, width: wall, top: -0.031, bottom: -0.068, squareness: 0.5 },
    { z: -0.17, width: wall, top: -0.031, bottom: -0.064, squareness: 0.48 },
    { z: -0.155, width: wall, top: -0.031, bottom: -0.062, squareness: 0.46 },
  ];
  const parts: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    const panel = loftGeometry(sections, 20, true, true);
    panel.translate(side * (width / 2 - wall / 2), 0, 0);
    parts.push(panel);
    // 下缘木梁：分成左右两条，绕开中间的固定弹仓与扳机护圈。
    const railSections = [
      { z: -0.24, width: wall, top: -0.062, bottom: -0.072, squareness: 0.6 },
      { z: -0.2, width: wall, top: -0.062, bottom: -0.073, squareness: 0.6 },
      { z: -0.17, width: wall, top: -0.058, bottom: -0.067, squareness: 0.58 },
      { z: -0.155, width: wall, top: -0.055, bottom: -0.064, squareness: 0.56 },
    ];
    const rail = loftGeometry(railSections, 16, true, true);
    rail.translate(side * (width / 2 - wall / 2), 0, 0);
    parts.push(rail);
  }
  return merge(parts);
};

// ---------------------------------------------------------------------------
// foreEndLoft —— 前托：整块木料放样 + 顶面枪管槽，不是 U 形三板拼盒。
// 前端收窄、托底上翘，顶面有一条与枪管同轴的凹槽；枪管坐进槽里。
// 局部系：原点 = 后端面、枪管轴线下方 18mm；+Z 枪口。
// ---------------------------------------------------------------------------
const foreEndLoft: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const len = num(p, "len", 0.355);
  const w = num(p, "w", 0.044);
  const bottom = num(p, "bottom", -0.04);
  const sections = [
    { z: 0.0, width: w, top: 0.0, bottom, squareness: 0.56, grooveWidth: 0.012, grooveDepth: 0.011 },
    { z: 0.045, width: w * 0.985, top: -0.001, bottom: bottom * 0.985, squareness: 0.54, grooveWidth: 0.012, grooveDepth: 0.011 },
    { z: 0.12, width: w * 0.95, top: -0.003, bottom: bottom * 0.94, squareness: 0.52, grooveWidth: 0.0115, grooveDepth: 0.01 },
    { z: 0.22, width: w * 0.86, top: -0.006, bottom: bottom * 0.86, squareness: 0.48, grooveWidth: 0.011, grooveDepth: 0.008 },
    { z: 0.3, width: w * 0.75, top: -0.01, bottom: bottom * 0.75, squareness: 0.46, grooveWidth: 0.01, grooveDepth: 0.006 },
    { z: len - 0.008, width: w * 0.68, top: -0.013, bottom: bottom * 0.68, squareness: 0.44, grooveWidth: 0.0095, grooveDepth: 0.005 },
    { z: len, width: w * 0.64, top: -0.015, bottom: bottom * 0.64, squareness: 0.42, grooveWidth: 0.009, grooveDepth: 0.004 },
  ];
  return loftGeometry(sections, 32, true, true);
};

// ---------------------------------------------------------------------------
// woodSidePanel —— 木托侧板：按真实轮廓切出的薄板（不是一块方板）。
// 轮廓点给在 (z, y) 平面上，板厚沿 X；两端收口，前缘斜切。
// ---------------------------------------------------------------------------
const woodSidePanel: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const thickness = num(p, "thickness", 0.003);
  const offset = num(p, "offset", 0.0225);
  const points = (p?.points as Array<[number, number]> | undefined) ?? [
    [-0.155, -0.052],
    [0.032, -0.042],
    [0.032, -0.078],
    [-0.02, -0.088],
    [-0.09, -0.098],
    [-0.155, -0.104],
  ];
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) shape.lineTo(points[i][0], points[i][1]);
  shape.closePath();
  const panel = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: true,
    bevelThickness: 0.0009,
    bevelSize: 0.0009,
    bevelSegments: 2,
    curveSegments: 6,
    steps: 1,
  });
  // shape 的 x 是枪身方向（z），挤出方向是板厚（x）。
  panel.rotateY(-Math.PI / 2);
  const parts: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    const copy = panel.clone();
    copy.translate(side * offset + thickness / 2, 0, 0);
    parts.push(copy);
  }
  panel.dispose();
  return merge(parts);
};

// ---------------------------------------------------------------------------
// feltPad —— 托架上的 V 形毛毡/软垫：底面是 V 形，正好坐进机加工 V 形托块，
// 顶面平整托住枪身。原来是一个 40×30×32mm 的黑方块，接触面也是方的。
// ---------------------------------------------------------------------------
const feltPad: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const width = num(p, "width", 0.04);
  const length = num(p, "length", 0.032);
  const height = num(p, "height", 0.018);
  const vDepth = num(p, "vDepth", 0.009);
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, 0);
  shape.lineTo(0, vDepth);
  shape.lineTo(width / 2, 0);
  shape.lineTo(width / 2, height - 0.0016);
  shape.lineTo(width / 2 - 0.0016, height);
  shape.lineTo(-width / 2 + 0.0016, height);
  shape.lineTo(-width / 2, height - 0.0016);
  shape.closePath();
  const pad = new THREE.ExtrudeGeometry(shape, {
    depth: length,
    bevelEnabled: true,
    bevelThickness: 0.0012,
    bevelSize: 0.0012,
    bevelSegments: 2,
    curveSegments: 4,
    steps: 1,
  });
  pad.translate(0, 0, -length / 2);
  return pad;
};

const foreEnd: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const len = num(p, "len", 0.37);
  const w = num(p, "w", 0.044);
  const top = num(p, "top", 0);
  const bottom = num(p, "bottom", -0.04);
  const wall = num(p, "wall", 0.006);
  const floor = num(p, "floor", 0.006);
  const openRight = bool(p, "openRight", false);
  const parts: THREE.BufferGeometry[] = [];
  const h = top - bottom;
  const zc = len / 2;
  const left = box(wall, h, len, 0.0012);
  left.translate(-w / 2 + wall / 2, top - h / 2, zc);
  parts.push(left);
  if (!openRight) {
    const right = box(wall, h, len, 0.0012);
    right.translate(w / 2 - wall / 2, top - h / 2, zc);
    parts.push(right);
  }
  const base = box(w, floor, len, 0.0012);
  base.translate(0, bottom + floor / 2, zc);
  parts.push(base);
  // 前端斜切收口
  const nose = box(w * 0.94, h * 0.86, 0.012, 0.001);
  nose.translate(0, top - h * 0.43, len - 0.004);
  parts.push(nose);
  return merge(parts);
};

// ---------------------------------------------------------------------------
// noseCap ??前托端帽：U 形钢??+ 通条孔??// 局部系：原??= 后端面中心、顶面??// ---------------------------------------------------------------------------
const noseCap: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const len = num(p, "len", 0.018);
  const w = num(p, "w", 0.046);
  const h = num(p, "h", 0.044);
  const t = num(p, "t", 0.003);
  const parts: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    const wall = box(t, h, len, 0.0006);
    wall.translate(side * (w / 2 - t / 2), -h / 2, len / 2);
    parts.push(wall);
  }
  const bottom = box(w, t, len, 0.0006);
  bottom.translate(0, -h + t / 2, len / 2);
  parts.push(bottom);
  const top = box(w, t * 0.7, len, 0.0005);
  top.translate(0, -t * 0.35, len / 2);
  parts.push(top);
  const hole = tubeZ(0.0036, 0.0024, len + 0.002, 12);
  hole.rotateY(Math.PI / 2);
  hole.translate(0, -h * 0.56, len / 2);
  parts.push(hole);
  return merge(parts);
};

// ---------------------------------------------------------------------------
// boltSleeve ??枪机尾套：外??+ 后环 + 保险让位缺口??// 局部系：轴??+Z，原??= 套筒前端面中心??// ---------------------------------------------------------------------------
const boltSleeve: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const rOuter = num(p, "rOuter", 0.0115);
  const rInner = num(p, "rInner", 0.0094);
  const len = num(p, "len", 0.042);
  const parts: THREE.BufferGeometry[] = [];
  const tube = tubeZ(rOuter, rInner, len, 24);
  tube.translate(0, 0, -len / 2);
  parts.push(tube);
  const collar = tubeZ(rOuter + 0.0014, rInner, 0.006, 24);
  collar.translate(0, 0, -len + 0.003);
  parts.push(collar);
  const slot = box(0.006, 0.004, len * 0.6, 0.0004);
  slot.translate(0, rOuter - 0.002, -len * 0.55);
  parts.push(slot);
  return merge(parts);
};

// ---------------------------------------------------------------------------
// firingPin ??击针：三段阶梯杆 + 前尖，原??= 针尖，向??-Z??// ---------------------------------------------------------------------------
const firingPin: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const len = num(p, "len", 0.19);
  const bodyR = num(p, "bodyR", 0.0021);
  const collarR = num(p, "collarR", 0.0042);
  const collarZ = num(p, "collarZ", -0.055);
  const parts: THREE.BufferGeometry[] = [];
  const tip = cylinderZ(bodyR, 0.007, 12, 0.0007);
  tip.translate(0, 0, -0.0035);
  parts.push(tip);
  const body = cylinderZ(bodyR, len, 16);
  body.translate(0, 0, -0.007 - len / 2);
  parts.push(body);
  const collar = cylinderZ(collarR, 0.007, 18);
  collar.translate(0, 0, collarZ);
  parts.push(collar);
  const tail = cylinderZ(bodyR * 1.15, 0.012, 12);
  tail.translate(0, 0, -len - 0.012);
  parts.push(tail);
  return merge(parts);
};

// ---------------------------------------------------------------------------
// boltLug ??闭锁凸榫：承力块 + 圆弧承力面，原点 = 凸榫中心??// ---------------------------------------------------------------------------
const boltLug: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const w = num(p, "w", 0.006);
  const h = num(p, "h", 0.010);
  const d = num(p, "d", 0.018);
  const parts: THREE.BufferGeometry[] = [];
  const body = box(w, h, d, 0.0008);
  parts.push(body);
  const face = cylinderZ(h * 0.46, w, 14);
  face.rotateY(Math.PI / 2);
  face.translate(0, 0, d * 0.32);
  parts.push(face);
  return merge(parts);
};

// ---------------------------------------------------------------------------
// triggerBlade ??扳机片：侧轮廓，原点 = 转轴中心，向??-Y??// ---------------------------------------------------------------------------
const triggerBlade: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const width = num(p, "width", 0.007);
  const points = (p?.points as Array<[number, number]> | undefined) ?? [
    [0.003, 0.002],
    [0.006, -0.010],
    [0.003, -0.030],
    [-0.003, -0.031],
    [-0.006, -0.014],
    [-0.004, 0.002],
  ];
  return gun7Kits.sideProfile({
    ...(spec as object),
    params: { points, width, bevel: 0.0008 },
  } as never, {} as never);
};

// ---------------------------------------------------------------------------
// searLever ??阻铁：L 形侧轮廓，原??= 转轴中心??// ---------------------------------------------------------------------------
const searLever: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const width = num(p, "width", 0.006);
  const points = (p?.points as Array<[number, number]> | undefined) ?? [
    [0.012, 0.004],
    [0.014, -0.003],
    [0.003, -0.006],
    [-0.012, -0.002],
    [-0.014, 0.004],
    [-0.002, 0.008],
  ];
  return gun7Kits.sideProfile({
    ...(spec as object),
    params: { points, width, bevel: 0.0006 },
  } as never, {} as never);
};

// ---------------------------------------------------------------------------
// magFollower ??托弹板：平板 + 中央加强??+ 侧导向耳，原点 = 顶面中心??// ---------------------------------------------------------------------------
const magFollower: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const w = num(p, "w", 0.032);
  const d = num(p, "d", 0.07);
  const t = num(p, "t", 0.005);
  const parts: THREE.BufferGeometry[] = [];
  const plate0 = box(w, t, d, 0.0006);
  plate0.translate(0, -t / 2, 0);
  parts.push(plate0);
  const rib = box(w * 0.18, t * 1.6, d * 0.86, 0.0005);
  rib.translate(0, -t * 1.25, 0);
  parts.push(rib);
  for (const side of [-1, 1]) {
    const ear = box(0.004, t * 1.3, 0.012, 0.0004);
    ear.translate(side * (w / 2 - 0.002), -t * 0.9, d * 0.32);
    parts.push(ear);
  }
  return merge(parts);
};

// ---------------------------------------------------------------------------
// floorPlate ??弹仓底板 + 卡榫，原??= 顶面中心??// ---------------------------------------------------------------------------
const floorPlate: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const w = num(p, "w", 0.036);
  const d = num(p, "d", 0.076);
  const t = num(p, "t", 0.004);
  const parts: THREE.BufferGeometry[] = [];
  const base = box(w, t, d, 0.0008);
  base.translate(0, -t / 2, 0);
  parts.push(base);
  const latch = box(w * 0.24, t * 1.4, 0.012, 0.0005);
  latch.translate(0, -t * 1.2, -d / 2 + 0.007);
  parts.push(latch);
  const button = cylinderY(0.0032, 0.006, 12);
  button.translate(0, -t - 0.003, -d / 2 + 0.007);
  parts.push(button);
  return merge(parts);
};

// ---------------------------------------------------------------------------
// slingSwivel ??背带环：环体 + 底座，原??= 枪身安装点（环在下方）??// ---------------------------------------------------------------------------
const slingSwivel: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const r = num(p, "r", 0.008);
  const wire = num(p, "wire", 0.0015);
  const drop = num(p, "drop", 0.010);
  const parts: THREE.BufferGeometry[] = [];
  const stud = cylinderY(r * 0.34, drop, 10);
  stud.translate(0, -drop / 2, 0);
  parts.push(stud);
  const ring = new THREE.TorusGeometry(r, wire, 5, 16);
  ring.rotateY(Math.PI / 2);
  ring.translate(0, -drop - r, 0);
  parts.push(ring);
  return merge(parts);
};

// ---------------------------------------------------------------------------
// screwSlot ??带槽螺钉：沿 -Y 拧入，原??= 头顶面中心??// ---------------------------------------------------------------------------
const screwSlot: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const r = num(p, "r", 0.0024);
  const len = num(p, "len", 0.016);
  const headR = num(p, "headR", r * 1.75);
  const headH = num(p, "headH", 0.0022);
  const parts: THREE.BufferGeometry[] = [];
  const shaft = cylinderY(r, len, 12);
  shaft.translate(0, -headH - len / 2, 0);
  parts.push(shaft);
  const head = cylinderY(headR, headH, 14);
  head.translate(0, -headH / 2, 0);
  parts.push(head);
  const slot = box(headR * 1.7, 0.0006, 0.0014, 0.0001);
  slot.translate(0, -headH * 0.78, 0);
  parts.push(slot);
  return merge(parts);
};

// ---------------------------------------------------------------------------
// crossBolt ??枪托横销：轴 + 两端螺钉头，原点 = 轴中心??// ---------------------------------------------------------------------------
const crossBolt: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const r = num(p, "r", 0.0026);
  const len = num(p, "len", 0.048);
  const parts: THREE.BufferGeometry[] = [];
  const shaft = cylinderX(r, len, 12);
  parts.push(shaft);
  for (const side of [-1, 1]) {
    const head = cylinderX(r * 1.7, 0.0024, 14);
    head.translate(side * (len / 2 - 0.0012), 0, 0);
    parts.push(head);
    const slot = box(0.0008, r * 2.4, 0.0012, 0.0001);
    slot.translate(side * (len / 2 + 0.0002), 0, 0);
    parts.push(slot);
  }
  return merge(parts);
};

// ---------------------------------------------------------------------------
// ejectorBlade ??抛壳挺：L 形刀片，原点 = 机匣安装面??// ---------------------------------------------------------------------------
const ejectorBlade: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const len = num(p, "len", 0.03);
  const h = num(p, "h", 0.012);
  const t = num(p, "t", 0.003);
  const parts: THREE.BufferGeometry[] = [];
  const root = box(t, h, 0.012, 0.0004);
  root.translate(0, h / 2, -0.006);
  parts.push(root);
  const blade = box(t, h * 0.34, len, 0.0003);
  blade.translate(0, h * 0.82, -len / 2 - 0.004);
  parts.push(blade);
  const claw = box(t, h * 0.55, 0.006, 0.0003);
  claw.translate(0, h * 0.62, -len - 0.001);
  parts.push(claw);
  return merge(parts);
};

// ---------------------------------------------------------------------------
// boltStop ??枪机挡铁：L 形，原点 = 转轴??// ---------------------------------------------------------------------------
const boltStop: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const w = num(p, "w", 0.008);
  const parts: THREE.BufferGeometry[] = [];
  const arm = box(w, 0.005, 0.026, 0.0005);
  arm.translate(0, 0, -0.013);
  parts.push(arm);
  const tab = box(w, 0.014, 0.006, 0.0005);
  tab.translate(0, -0.006, -0.024);
  parts.push(tab);
  const pin = cylinderX(0.0016, w * 1.25, 8);
  parts.push(pin);
  return merge(parts);
};

// ---------------------------------------------------------------------------
// magCatch ??弹仓卡榫：小杠杆，原??= 转轴??// ---------------------------------------------------------------------------
const magCatch: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const w = num(p, "w", 0.006);
  const parts: THREE.BufferGeometry[] = [];
  const body = box(w, 0.008, 0.026, 0.0004);
  body.translate(0, 0, -0.013);
  parts.push(body);
  const hook = box(w, 0.005, 0.006, 0.0003);
  hook.translate(0, -0.006, -0.024);
  parts.push(hook);
  const pin = cylinderX(0.0014, w * 1.3, 8);
  parts.push(pin);
  return merge(parts);
};

// ---------------------------------------------------------------------------
// magFrontLip ??弹仓前唇：托弹口前壁 + 弧形抱弹唇??// 局部系：原??= 抱弹口中心，唇向??前??// ---------------------------------------------------------------------------
const magFrontLip: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const w = num(p, "w", 0.034);
  const t = num(p, "t", 0.003);
  const parts: THREE.BufferGeometry[] = [];
  const wall = box(w, 0.016, t, 0.0004);
  wall.translate(0, -0.008, 0.004);
  parts.push(wall);
  for (const side of [-1, 1]) {
    const lip = box(0.004, 0.003, 0.01, 0.0003);
    lip.translate(side * (w / 2 - 0.002), 0.001, 0.006);
    parts.push(lip);
  }
  return merge(parts);
};

// ---------------------------------------------------------------------------
// sightLeafFrame ??立框式表尺片：两根立??+ 顶梁 + 中横梁（游标套在柱上）??// 局部系：原??= 铰轴中心，立柱向 +Y??// ---------------------------------------------------------------------------
const sightLeafFrame: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const w = num(p, "w", 0.018);
  const h = num(p, "h", 0.058);
  const t = num(p, "t", 0.0016);
  const parts: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    const post = box(t, h, 0.0026, 0.0004);
    post.translate(side * (w / 2 - t / 2), h / 2, 0);
    parts.push(post);
  }
  const top = box(w, t, 0.0026, 0.0004);
  top.translate(0, h, 0);
  parts.push(top);
  const mid = box(w * 0.92, t * 0.8, 0.0022, 0.0003);
  mid.translate(0, h * 0.52, 0);
  parts.push(mid);
  const pivot = cylinderX(0.0015, w + 0.004, 8);
  parts.push(pivot);
  return merge(parts);
};

// ---------------------------------------------------------------------------
// rearSightSlider ??表尺游标：滑??+ 两侧卡爪 + 缺口??// 局部系：原??= 游标中心，套在表尺片 +Y 方向??// ---------------------------------------------------------------------------
const rearSightSlider: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const w = num(p, "w", 0.022);
  const h = num(p, "h", 0.012);
  const t = num(p, "t", 0.0018);
  const parts: THREE.BufferGeometry[] = [];
  const body = box(w, h, t * 2.4, 0.0004);
  parts.push(body);
  for (const side of [-1, 1]) {
    const claw = box(0.003, h * 0.8, t * 3.2, 0.0003);
    claw.translate(side * (w / 2 - 0.0015), 0, 0);
    parts.push(claw);
  }
  const notch = box(0.003, h * 0.34, t * 2.8, 0.0002);
  notch.translate(0, h * 0.5, 0);
  parts.push(notch);
  return merge(parts);
};

// ---------------------------------------------------------------------------
// cleaningRodHead ??通条头：杆头 + 拉环??// 局部系：原??= 杆端??Z 为杆身方向??// ---------------------------------------------------------------------------
const cleaningRodHead: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const r = num(p, "r", 0.0026);
  const parts: THREE.BufferGeometry[] = [];
  const body = cylinderZ(r, 0.018, 12);
  body.translate(0, 0, -0.009);
  parts.push(body);
  const ring = new THREE.TorusGeometry(0.006, 0.0012, 5, 12);
  ring.rotateX(Math.PI / 2);
  ring.translate(0, 0, 0.001);
  parts.push(ring);
  return merge(parts);
};

// ---------------------------------------------------------------------------
// dustCoverDetent ??防尘盖卡榫：柱塞 + 簧座，原??= 安装面??// ---------------------------------------------------------------------------
const dustCoverDetent: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const r = num(p, "r", 0.0018);
  const parts: THREE.BufferGeometry[] = [];
  const stem = cylinderY(r, 0.006, 8);
  stem.translate(0, 0.003, 0);
  parts.push(stem);
  const ball0 = new THREE.SphereGeometry(r * 1.35, 10, 6);
  ball0.translate(0, 0.006, 0);
  parts.push(ball0);
  return merge(parts);
};

// ---------------------------------------------------------------------------
// safetyDetent ??保险定位销：柱??+ 球头??// ---------------------------------------------------------------------------
const safetyDetent: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const r = num(p, "r", 0.0015);
  const parts: THREE.BufferGeometry[] = [];
  const stem = cylinderZ(r, 0.007, 8);
  parts.push(stem);
  const ball0 = new THREE.SphereGeometry(r * 1.4, 10, 6);
  ball0.translate(0, 0, 0.0035);
  parts.push(ball0);
  return merge(parts);
};

// ---------------------------------------------------------------------------
// standBase —— 展示台底座：阶梯机加工底座 + 两个立柱安装凸台 + 铭牌座。
// 局部系：原点 = 顶面中心。不是一块大木板——上层台面收窄、下层地脚外扩，
// 安装凸台与铭牌都是独立几何，立柱从凸台中心穿过。
// ---------------------------------------------------------------------------
const standBase: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const w = num(p, "w", 0.15);
  const d = num(p, "d", 0.66);
  const h = num(p, "h", 0.02);
  const parts: THREE.BufferGeometry[] = [];
  // 下层地脚：外扩 6mm，圆角 4mm
  const foot = box(w, h * 0.5, d, 0.004);
  foot.translate(0, -h + h * 0.25, 0);
  parts.push(foot);
  // 上层台面：收窄 8mm，顶部留 1.5mm 机加工亮边
  const deck = box(w * 0.94, h * 0.5, d * 0.96, 0.0035);
  deck.translate(0, -h * 0.25, 0);
  parts.push(deck);
  const topPlate = box(w * 0.86, 0.0016, d * 0.9, 0.0012);
  topPlate.translate(0, 0.0008, 0);
  parts.push(topPlate);
  // 立柱安装凸台：与两个托架中心对应
  for (const z of [-0.29, 0.25]) {
    const boss = cylinderY(0.028, 0.007, 40);
    boss.translate(0, 0.0035, z);
    parts.push(boss);
    const bossChamfer = latheGeometry(
      [
        [0.028, 0],
        [0.028, 0.004],
        [0.025, 0.007],
        [0.02, 0.007],
        [0, 0.007],
      ],
      40,
    );
    bossChamfer.translate(0, 0.0, z);
    parts.push(bossChamfer);
  }
  // 前部铭牌座（黄铜铭牌由独立件提供时可直接放上去）
  const plaque = box(0.085, 0.0018, 0.026, 0.0012);
  plaque.translate(0, 0.001, d * 0.4);
  parts.push(plaque);
  // 防滑槽仍保留，但刻在下层地脚上，不再横穿台面
  for (const side of [-1, 1]) {
    const groove = box(w * 0.8, 0.0012, 0.006, 0.0002);
    groove.translate(0, -h + 0.0006, side * d * 0.28);
    parts.push(groove);
  }
  return merge(parts);
};

export const rifleKits: Record<string, GeometryBuilder> = {
  stockButt,
  stockWrist,
  foreEnd,
  foreEndLoft,
  woodSidePanel,
  feltPad,
  noseCap,
  boltSleeve,
  firingPin,
  boltLug,
  triggerBlade,
  searLever,
  magFollower,
  floorPlate,
  slingSwivel,
  screwSlot,
  crossBolt,
  ejectorBlade,
  boltStop,
  magCatch,
  magFrontLip,
  sightLeafFrame,
  rearSightSlider,
  cleaningRodHead,
  dustCoverDetent,
  safetyDetent,
  standBase,
};

export { cylinderX, cylinderY, cylinderZ, plate, torusZ };
