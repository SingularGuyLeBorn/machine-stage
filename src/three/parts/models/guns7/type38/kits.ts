import * as THREE from "three";
import type { GeometryBuilder } from "../../../assembler/geometry";
import { mergeGeometries } from "../../../kernel/geometry";
import { ball, box, cylinderX, cylinderZ, cylinderY, plate, tubeZ } from "../kits";

// ============================================================================
// models/guns7/type38/kits —??三八式步枪专用几??// 原点/轴向见每??kit 顶部注释。全部按真实机构特征（枪机闭锁面、防尘盖??// 固定弹仓、桥夹）建模，不用一个方块冒充??// ============================================================================

type Params = Record<string, unknown>;

function num(params: Params | undefined, key: string, fallback?: number): number {
  const value = params?.[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (fallback !== undefined) return fallback;
  throw new Error(`type38 kit：参??"${key}" 必须是数值`);
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  merged.computeVertexNormals();
  return merged;
}

// ---------------------------------------------------------------------------
// boltBody —??枪机体：空心??+ 尾帽，击??击针簧从后端穿入（原图可见内部）??// 局部系：轴??+Z，原??= 枪机闭锁面（弹底）??// ---------------------------------------------------------------------------
const boltBody: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const len = num(p, "len", 0.17);
  const rOuter = num(p, "rOuter", 0.0092);
  const rInner = num(p, "rInner", 0.0062);
  const parts: THREE.BufferGeometry[] = [];
  const tube = tubeZ(rOuter, rInner, len, 24);
  tube.translate(0, 0, -len / 2);
  parts.push(tube);
  const rearRing = tubeZ(rOuter + 0.0006, rInner * 0.55, 0.008, 24);
  rearRing.translate(0, 0, -len + 0.004);
  parts.push(rearRing);
  // 底部让位槽（给抽壳钩/抛壳挺让位）：一条削平的窄条
  const flat = box(0.006, 0.0016, len * 0.6, 0.0003);
  flat.translate(0, -rOuter + 0.001, -len * 0.46);
  parts.push(flat);
  return merge(parts);
};

// ---------------------------------------------------------------------------
// boltHead —??枪机头：承力??+ 闭锁面，中心通孔让击针通过??// ---------------------------------------------------------------------------
const boltHead: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const rOuter = num(p, "rOuter", 0.012);
  const rInner = num(p, "rInner", 0.0034);
  const len = num(p, "len", 0.038);
  const parts: THREE.BufferGeometry[] = [];
  const body = tubeZ(rOuter, rInner, len, 24);
  body.translate(0, 0, -len / 2);
  parts.push(body);
  const face = tubeZ(rOuter + 0.0004, rInner, 0.004, 24);
  face.translate(0, 0, -0.002);
  parts.push(face);
  return merge(parts);
};

// ---------------------------------------------------------------------------
// boltHandle —??拉机柄：直柄 + 球头（三八式直拉柄），从枪机右侧伸出??// ---------------------------------------------------------------------------
const boltHandle: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const len = num(p, "len", 0.038);
  const r = num(p, "r", 0.0032);
  const knobR = num(p, "knobR", 0.0065);
  const parts: THREE.BufferGeometry[] = [];
  const root = cylinderX(r * 1.55, 0.008, 16);
  root.translate(0.007, 0, 0);
  parts.push(root);
  const stem = cylinderX(r, len, 16);
  stem.translate(0.009 + len / 2, 0, 0);
  parts.push(stem);
  const knob = ball(knobR, 16);
  knob.translate(0.009 + len + knobR * 0.35, 0, 0);
  parts.push(knob);
  return merge(parts);
};

// ---------------------------------------------------------------------------
// cockingPiece —??枪机尾部的待击件（击针尾部螺母），随枪机旋转??// 局部系：轴??+Z，原??= 尾端面??// ---------------------------------------------------------------------------
const cockingPiece: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const r = num(p, "r", 0.0074);
  const len = num(p, "len", 0.026);
  const parts: THREE.BufferGeometry[] = [];
  const body = cylinderZ(r, len, 18);
  body.translate(0, 0, -len / 2);
  parts.push(body);
  const collar = cylinderZ(r + 0.0012, 0.004, 18);
  collar.translate(0, 0, -len + 0.002);
  parts.push(collar);
  const tail = cylinderZ(r * 0.55, 0.018, 12);
  tail.translate(0, 0, -len - 0.009);
  parts.push(tail);
  return merge(parts);
};

// ---------------------------------------------------------------------------
// safetyKnob —??枪机尾部保险：滚花帽 + 两片蝶形翼（??45° 上保险）??// ---------------------------------------------------------------------------
const safetyKnob: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const r = num(p, "r", 0.0062);
  const parts: THREE.BufferGeometry[] = [];
  const cap = cylinderZ(r, 0.016, 16);
  parts.push(cap);
  const wing = box(0.028, 0.0055, 0.006, 0.0006);
  wing.translate(0, 0, 0.003);
  parts.push(wing);
  const stem = cylinderZ(0.0022, 0.012, 10);
  stem.translate(0, 0, 0.012);
  parts.push(stem);
  return merge(parts);
};

// ---------------------------------------------------------------------------
// extractor —??抽壳钩：钩爪 + 弹簧座，装在枪机头右侧??// ---------------------------------------------------------------------------
const extractor: GeometryBuilder = (_spec) => {
  const parts: THREE.BufferGeometry[] = [];
  const body = box(0.0065, 0.007, 0.026, 0.0005);
  body.translate(0.0095, 0, -0.014);
  parts.push(body);
  const claw = box(0.0045, 0.0045, 0.006, 0.0004);
  claw.translate(0.0082, 0, -0.028);
  parts.push(claw);
  const springSeat = cylinderX(0.0022, 0.012, 8);
  springSeat.translate(0.008, 0.002, -0.002);
  parts.push(springSeat);
  return merge(parts);
};

// ---------------------------------------------------------------------------
// dustCover —??三八大盖的招牌防尘盖：半圆薄??+ 3 道加强筋 + 后端唇??// 局部系：轴??+Z，原??= 盖后端面中心。顶部包住机匣，随枪机前后滑动??// ---------------------------------------------------------------------------
const dustCover: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const len = num(p, "len", 0.22);
  const r = num(p, "r", 0.031);
  const t = num(p, "t", 0.0011);
  const slotZ = num(p, "slotZ", -1);
  const slotLen = num(p, "slotLen", 0.03);
  const parts: THREE.BufferGeometry[] = [];
  // 拉机柄让位槽：把盖分成前后两段，槽内不铺壳片（真实三八式防尘盖的柄槽）
  const spans: Array<[number, number]> =
    slotZ >= 0
      ? [
          [0, Math.max(0.002, slotZ - slotLen / 2)],
          [Math.min(len - 0.002, slotZ + slotLen / 2), len],
        ]
      : [[0, len]];
  const strips = 13;
  for (const [z0, z1] of spans) {
    const span = z1 - z0;
    if (span <= 0.001) continue;
    for (let i = 0; i < strips; i++) {
      const a = -Math.PI * 0.36 + (i / (strips - 1)) * Math.PI * 0.72;
      const x = Math.sin(a) * r;
      const y = Math.cos(a) * r;
      const seg = box(Math.PI * r * 0.09, t, span, 0.0002);
      seg.rotateZ(-a);
      seg.translate(x, y, z0 + span / 2);
      parts.push(seg);
    }
  }
  for (const z of [len * 0.16, len * 0.5, len * 0.84]) {
    if (slotZ >= 0 && Math.abs(z - slotZ) < slotLen / 2 + 0.006) continue;
    for (let i = 0; i < 9; i++) {
      const a = -Math.PI * 0.32 + (i / 8) * Math.PI * 0.64;
      const rib = box(0.003, 0.0012, 0.0045, 0.0002);
      rib.rotateZ(-a);
      rib.translate(Math.sin(a) * (r + t * 0.9), Math.cos(a) * (r + t * 0.9), z);
      parts.push(rib);
    }
  }
  const rearLip = tubeZ(r, r * 0.82, 0.005, 20);
  rearLip.translate(0, 0, 0.0025);
  parts.push(rearLip);
  return merge(parts);
};

// ---------------------------------------------------------------------------
// receiver —??开框机匣：底板 + 左右下侧??+ 上导??+ 前节套环 + 后桥??// 顶面/右侧敞开，枪机与击发机构在视口里直接可见（展示剖视）??// 局部系：轴??+Z，原??= 弹底/闭锁面??// ---------------------------------------------------------------------------
const receiver: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const z0 = num(p, "z0", -0.25);
  const z1 = num(p, "z1", 0.035);
  const len = z1 - z0;
  const zc = (z0 + z1) / 2;
  const w = num(p, "w", 0.039);
  // 弹仓开口：底板在这里断开，让 5 发弹从弹仓顶进入机匣，避免弹头/弹壳穿过底板。
  const magZ0 = num(p, "magZ0", -0.12);
  const magZ1 = num(p, "magZ1", -0.03);
  const parts: THREE.BufferGeometry[] = [];
  const rearLen = magZ0 - z0;
  if (rearLen > 0.001) {
    const bottomRear = box(w, 0.004, rearLen, 0.0006);
    bottomRear.translate(0, -0.029, z0 + rearLen / 2);
    parts.push(bottomRear);
  }
  const frontLen = z1 - magZ1;
  if (frontLen > 0.001) {
    const bottomFront = box(w, 0.004, frontLen, 0.0006);
    bottomFront.translate(0, -0.029, magZ1 + frontLen / 2);
    parts.push(bottomFront);
  }
  for (const side of [-1, 1]) {
    const wall = box(0.0026, 0.03, len, 0.0005);
    wall.translate(side * (w / 2 - 0.0013), -0.014, zc);
    parts.push(wall);
  }
  for (const side of [-1, 1]) {
    if (side > 0) {
      // 右侧导轨在拉机柄行程段断开：枪机上抬/后拉时手柄从缺口里通过。
      const railFront = box(0.0045, 0.004, 0.081, 0.0004);
      railFront.translate(0.0155, 0.019, -0.0395);
      parts.push(railFront);
    } else {
      const rail = box(0.0045, 0.004, len * 0.82, 0.0004);
      rail.translate(-0.0155, 0.019, zc - len * 0.03);
      parts.push(rail);
    }
  }
  const ring = tubeZ(0.021, 0.0135, 0.03, 24);
  ring.translate(0, 0, 0.012);
  parts.push(ring);
  // 后桥做成低横梁：枪机后坐 100mm 时从它上方通过，不再被实心桥体挡住。
  const bridge = box(w, 0.011, 0.02, 0.0006);
  bridge.translate(0, -0.0205, z0 + 0.012);
  parts.push(bridge);
  const tang = box(0.03, 0.006, 0.09, 0.0005);
  tang.translate(0, -0.033, z0 - 0.04);
  parts.push(tang);
  return merge(parts);
};

// ---------------------------------------------------------------------------
// magBody —??固定弹仓：左侧板 + 后壁 + 底板 + 前唇，右侧敞开??5 发弹??// 局部系：原??= 抱弹口（弹底位置），匣体向下/后??// ---------------------------------------------------------------------------
const magBody: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const w = num(p, "w", 0.036);
  const h = num(p, "h", 0.092);
  const d = num(p, "d", 0.082);
  const t = num(p, "t", 0.0015);
  const parts: THREE.BufferGeometry[] = [];
  const left = box(t, h, d, 0.0004);
  left.translate(-w / 2 + t / 2, -h / 2, -d / 2 + 0.004);
  parts.push(left);
  const back = box(w, h, t, 0.0004);
  back.translate(0, -h / 2, -d / 2 + t / 2);
  parts.push(back);
  const floor = box(w + 0.002, 0.003, d, 0.0004);
  floor.translate(0, -h, -d / 2 + 0.004);
  parts.push(floor);
  for (const side of [-1, 1]) {
    const lip = box(0.003, 0.004, 0.05, 0.0003);
    lip.translate(side * (w / 2 - 0.0015), -0.002, 0.006);
    parts.push(lip);
  }
  const front = box(w, 0.02, 0.0022, 0.0004);
  front.translate(0, -0.012, 0.008);
  parts.push(front);
  return merge(parts);
};

// ---------------------------------------------------------------------------
// frontSight —??准星：箍??+ 两??+ 准星片??// ---------------------------------------------------------------------------
const frontSight: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const barrelR = num(p, "barrelR", 0.009);
  const parts: THREE.BufferGeometry[] = [];
  const ring = tubeZ(barrelR + 0.004, barrelR, 0.018, 20);
  parts.push(ring);
  for (const side of [-1, 1]) {
    const ear = box(0.0045, 0.024, 0.012, 0.0005);
    ear.translate(side * 0.0105, 0.013, 0);
    parts.push(ear);
  }
  const blade = box(0.0018, 0.018, 0.0025, 0.0003);
  blade.translate(0, 0.018, 0);
  parts.push(blade);
  return merge(parts);
};

// ---------------------------------------------------------------------------
// rearSightBase —??表尺座：底座 + 两侧??+ 铰轴??// ---------------------------------------------------------------------------
const rearSightBase: GeometryBuilder = (_spec) => {
  const parts: THREE.BufferGeometry[] = [];
  const base = box(0.025, 0.008, 0.04, 0.0006);
  base.translate(0, 0.005, 0);
  parts.push(base);
  for (const side of [-1, 1]) {
    const ear = box(0.0032, 0.012, 0.008, 0.0004);
    ear.translate(side * 0.011, 0.013, 0);
    parts.push(ear);
  }
  const pin = cylinderX(0.0018, 0.026, 8);
  pin.translate(0, 0.014, 0);
  parts.push(pin);
  return merge(parts);
};

// ---------------------------------------------------------------------------
// barrelBand —??枪管箍（下挂背带环）??// ---------------------------------------------------------------------------
const barrelBand: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const rOuter = num(p, "rOuter", 0.0235);
  const rInner = num(p, "rInner", 0.018);
  const h = num(p, "h", 0.013);
  const parts: THREE.BufferGeometry[] = [];
  const band = tubeZ(rOuter, rInner, h, 24);
  parts.push(band);
  const lug = box(0.008, 0.012, 0.012, 0.0005);
  lug.translate(0, -rOuter - 0.004, 0);
  parts.push(lug);
  const swivel = new THREE.TorusGeometry(0.0065, 0.0014, 5, 12, Math.PI * 1.7);
  swivel.translate(0, -rOuter - 0.014, 0);
  parts.push(swivel);
  return merge(parts);
};

// ---------------------------------------------------------------------------
// bayonetLug —??刺刀座：底座 + 燕尾??+ 卡榫??// ---------------------------------------------------------------------------
const bayonetLug: GeometryBuilder = (_spec) => {
  const parts: THREE.BufferGeometry[] = [];
  const base = box(0.018, 0.01, 0.05, 0.0006);
  base.translate(0, -0.008, 0);
  parts.push(base);
  const rail = box(0.012, 0.006, 0.062, 0.0005);
  rail.translate(0, -0.016, 0.006);
  parts.push(rail);
  const catchBox = box(0.008, 0.008, 0.012, 0.0004);
  catchBox.translate(0, -0.024, -0.012);
  parts.push(catchBox);
  return merge(parts);
};

// ---------------------------------------------------------------------------
// standCradle —??展示??V 形托：底??+ 两块斜托??+ 毛毡垫??// 局部系：原??= 托顶中心（枪身接触点），向下??-Y??// ---------------------------------------------------------------------------
const standCradle: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const height = num(p, "height", 0.34);
  const width = num(p, "width", 0.076);
  const parts: THREE.BufferGeometry[] = [];
  const stem = box(width * 0.72, height, 0.05, 0.0015);
  stem.translate(0, -height / 2, 0);
  parts.push(stem);
  const foot = box(width, 0.018, 0.09, 0.0015);
  foot.translate(0, -height + 0.009, 0);
  parts.push(foot);
  for (const side of [-1, 1]) {
    const arm = box(width * 0.5, 0.13, 0.012, 0.001);
    arm.rotateX(THREE.MathUtils.degToRad(34) * side);
    arm.translate(side * width * 0.22, -0.03, 0);
    parts.push(arm);
  }
  const felt = box(width * 0.5, 0.004, 0.04, 0.0005);
  felt.translate(0, 0.002, 0);
  parts.push(felt);
  return merge(parts);
};

// ---------------------------------------------------------------------------
// brassTray —??弹壳收集盘：底板 + 三面围边??// 局部系：原??= 盘内底中心，向上??+Y??// ---------------------------------------------------------------------------
const brassTray: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const w = num(p, "w", 0.2);
  const d = num(p, "d", 0.16);
  const parts: THREE.BufferGeometry[] = [];
  const floor = box(w, 0.004, d, 0.0006);
  parts.push(floor);
  for (const side of [-1, 1]) {
    const wall = box(0.003, 0.025, d, 0.0005);
    wall.translate(side * (w / 2 - 0.0015), 0.0125, 0);
    parts.push(wall);
    const end = box(w, 0.025, 0.003, 0.0005);
    end.translate(0, 0.0125, side * (d / 2 - 0.0015));
    parts.push(end);
  }
  return merge(parts);
};

export const type38Kits: Record<string, GeometryBuilder> = {
  boltBody,
  boltHead,
  boltHandle,
  cockingPiece,
  safetyKnob,
  extractor,
  dustCover,
  receiver,
  magBody,
  frontSight,
  rearSightBase,
  barrelBand,
  bayonetLug,
  standCradle,
  brassTray,
};

/** 小工具：把圆柱旋转到??Z（给注册表几何参数用）；保留以备模型扩展??*/
export function zCylinder(r: number, h: number, segments = 16): THREE.BufferGeometry {
  return cylinderZ(r, h, segments);
}

/** 小工具：??Y 的圆柱??*/
export function yCylinder(r: number, h: number, segments = 16): THREE.BufferGeometry {
  return cylinderY(r, h, segments);
}

/** 小工具：薄板??*/
export function sidePlate(w: number, h: number, t = 0.002): THREE.BufferGeometry {
  return plate(w, h, t);
}
