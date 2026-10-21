import * as THREE from "three";
import type { GeometryBuilder } from "../../assembler/geometry";
import { mergeGeometries } from "../../kernel/geometry";
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
  const width = num(p, "width", 0.044);
  const points = (p?.points as Array<[number, number]> | undefined) ?? [
    [-0.55, -0.10],
    [-0.55, -0.018],
    [-0.42, -0.004],
    [-0.30, -0.012],
    [-0.22, -0.032],
    [-0.16, -0.048],
    [-0.18, -0.058],
    [-0.30, -0.082],
    [-0.44, -0.098],
    [-0.55, -0.10],
  ];
  return gun7Kits.sideProfile({
    ...(spec as object),
    params: { points, width, bevel: Math.min(0.003, width * 0.08) },
  } as never, {} as never);
};

// ---------------------------------------------------------------------------
// foreEnd ??护木/前托 U 形剖壳：左右??+ 底板，顶面开放露出枪管??// 局部系：原??= 后端面中心、顶面；+Z 向前，壁向下??// ---------------------------------------------------------------------------
const stockWrist: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const width = num(p, "width", 0.044);
  const wall = num(p, "wall", 0.0035);
  const points = (p?.points as Array<[number, number]> | undefined) ?? [
    [-0.2, -0.06],
    [-0.2, -0.031],
    [-0.06, -0.031],
    [-0.06, -0.05],
    [-0.12, -0.055],
    [-0.2, -0.06],
  ];
  const panels: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    const panel = gun7Kits.sideProfile(
      { params: { points, width: wall, bevel: 0.0008 } } as never,
      {} as never,
    );
    panel.translate(side * (width / 2 - wall / 2), 0, 0);
    panels.push(panel);
  }
  return merge(panels);
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
// standBase ??展示台底座：倒角长板 + 两条防滑槽??// 局部系：原??= 顶面中心??// ---------------------------------------------------------------------------
const standBase: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const w = num(p, "w", 0.15);
  const d = num(p, "d", 0.66);
  const h = num(p, "h", 0.02);
  const parts: THREE.BufferGeometry[] = [];
  const base = box(w, h, d, 0.004);
  base.translate(0, -h / 2, 0);
  parts.push(base);
  for (const side of [-1, 1]) {
    const groove = box(w * 0.82, 0.0012, 0.008, 0.0002);
    groove.translate(0, -h + 0.0006, side * d * 0.32);
    parts.push(groove);
  }
  return merge(parts);
};

export const rifleKits: Record<string, GeometryBuilder> = {
  stockButt,
  stockWrist,
  foreEnd,
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
