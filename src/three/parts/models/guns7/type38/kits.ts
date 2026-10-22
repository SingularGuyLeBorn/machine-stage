import * as THREE from "three";
import type { GeometryBuilder } from "../../../assembler/geometry";
import { latheGeometry, mergeGeometries } from "../../../kernel/geometry";
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
  // 拉机柄让位槽：只切右侧到顶部扫掠弧的 8 条窄带，不再整条横切开顶盖。
  // 旧做法把整个半圆弧都断开 30mm，从上方能直接看进机匣；现在只保留
  // 拉机柄上抬/后拉必须经过的一条 16mm 窄缝，盖顶左半仍是完整一片。
  const strips = 13;
  const slotStart = slotZ - slotLen / 2;
  const slotEnd = slotZ + slotLen / 2;
  for (let i = 0; i < strips; i++) {
    const a = -Math.PI * 0.36 + (i / (strips - 1)) * Math.PI * 0.72;
    const x = Math.sin(a) * r;
    const y = Math.cos(a) * r;
    // 拉机柄上抬 90° 时，柄杆会从右边缘扫过顶盖中心；让位槽必须覆盖
    // 这条扫掠弧（约 -22°..+65°），但只在 z 向开一条窄缝，不能整圈切断。
    const cutSide = slotZ >= 0 && i >= 4;
    const segments: Array<[number, number]> = cutSide
      ? [
          [0, Math.max(0.002, slotStart)],
          [Math.min(len - 0.002, slotEnd), len],
        ]
      : [[0, len]];
    for (const [z0, z1] of segments) {
      const span = z1 - z0;
      if (span <= 0.001) continue;
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
  const postH = Math.max(height - 0.045, 0.04);
  // 车削圆立柱 + 底座法兰 + 上端轴环：展示架是机加工钢件，不是方木柱。
  const post = cylinderY(0.0085, postH, 40);
  post.translate(0, -0.028 - postH / 2, 0);
  parts.push(post);
  const foot = cylinderY(0.024, 0.012, 40);
  foot.translate(0, -height + 0.006, 0);
  parts.push(foot);
  const footChamfer = latheGeometry(
    [
      [0.024, 0],
      [0.024, 0.006],
      [0.021, 0.01],
      [0.012, 0.012],
      [0, 0.012],
    ],
    40,
  );
  footChamfer.translate(0, -height + 0.012, 0);
  parts.push(footChamfer);
  const collar = cylinderY(0.012, 0.01, 40);
  collar.translate(0, -0.033, 0);
  parts.push(collar);
  const topCollar = cylinderY(0.011, 0.008, 40);
  topCollar.translate(0, -0.009, 0);
  parts.push(topCollar);
  // 侧向锁紧手柄：圆柱 + 滚花环，固定在立柱上。
  const knobStem = cylinderX(0.0035, 0.024, 20);
  knobStem.translate(0.014, -0.055, 0);
  parts.push(knobStem);
  const knob = latheGeometry(
    [
      [0, -0.006],
      [0.009, -0.006],
      [0.011, -0.003],
      [0.011, 0.003],
      [0.009, 0.006],
      [0, 0.006],
    ],
    24,
  );
  knob.rotateZ(Math.PI / 2);
  knob.translate(0.032, -0.055, 0);
  parts.push(knob);
  for (let i = 0; i < 12; i++) {
    const ridge = box(0.0012, 0.0012, 0.014, 0.0002);
    const a = (i / 12) * Math.PI * 2;
    ridge.rotateX(a);
    ridge.translate(0.032 + Math.cos(a) * 0.0108, -0.055 + Math.sin(a) * 0.0108, 0);
    parts.push(ridge);
  }

  // V 形托块：按真实机加工 V 铁做侧轮廓挤出（V 槽横跨枪身宽度）。
  const halfW = width / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-halfW, -0.042);
  shape.lineTo(halfW, -0.042);
  shape.lineTo(halfW, 0.0);
  shape.lineTo(0.014, 0.0);
  shape.lineTo(0, -0.01);
  shape.lineTo(-0.014, 0.0);
  shape.lineTo(-halfW, 0.0);
  shape.closePath();
  const block = new THREE.ExtrudeGeometry(shape, {
    depth: 0.055,
    bevelEnabled: true,
    bevelThickness: 0.0012,
    bevelSize: 0.0012,
    bevelSegments: 2,
    curveSegments: 8,
    steps: 1,
  });
  block.translate(0, 0, -0.0275);
  block.computeBoundingBox();
  parts.push(block);
  // 托块底部与立柱之间的机加工垫圈
  const washer = cylinderY(0.018, 0.004, 32);
  washer.translate(0, -0.044, 0);
  parts.push(washer);
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

// ---------------------------------------------------------------------------
// receiverShell —— 三八式机匣外壳：C 形圆角截面沿 Z 挤出，右侧留拉机柄槽。
//
// 旧版是左右两片平板 + 平顶板，从任何角度看都像一个铁盒子。真实三八式
// 机匣是**圆角矩形/近圆柱**的锻钢件：顶部弧面与防尘盖贴合，两侧有圆角，
// 右侧开一条窄槽让直拉枪机柄通过。这里用带缺口的 C 形截面挤出，壁厚 2.5mm，
// 再补前节套环、侧壁螺钉和弹仓 cutoff 拨片。局部系与 receiver 相同。
// ---------------------------------------------------------------------------
const receiverShell: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const w = num(p, "w", 0.046);
  const t = num(p, "t", 0.0025);
  const z0 = num(p, "z0", -0.255);
  const z1 = num(p, "z1", 0.042);
  const bottom = num(p, "bottom", -0.036);
  const top = num(p, "top", 0.028);
  const len = z1 - z0;
  const parts: THREE.BufferGeometry[] = [];

  // 截面：超椭圆圆角矩形，右侧 y=0.004..0.017 挖出拉机柄槽。
  const halfW = w / 2;
  const cy = (top + bottom) / 2;
  const halfTop = top - cy;
  const halfBottom = cy - bottom;
  const squareness = 0.56;
  const exponent = 2 / (1 - squareness * 0.78);
  const pointAt = (theta: number, inset: number): [number, number] => {
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    const hw = Math.max(halfW - inset, 0.004);
    const ht = Math.max(halfTop - inset, 0.004);
    const hb = Math.max(halfBottom - inset, 0.004);
    const x = Math.sign(c) * Math.pow(Math.abs(c), exponent) * hw;
    const y = cy + Math.sign(s) * Math.pow(Math.abs(s), exponent) * (s >= 0 ? ht : hb);
    return [x, y];
  };
  const gapStart = 0.10; // 槽下缘（弧度）
  const gapEnd = 0.43; // 槽上缘
  const n = 72;
  const outer: Array<[number, number]> = [];
  const inner: Array<[number, number]> = [];
  for (let i = 0; i <= n; i++) {
    const a = gapEnd + ((Math.PI * 2 - (gapEnd - gapStart)) * i) / n;
    outer.push(pointAt(a, 0));
    inner.push(pointAt(a, t));
  }
  // 截面：外弧 → 槽上切口 → 内弧回程 → 槽下切口。
  const shape = new THREE.Shape();
  shape.moveTo(outer[0][0], outer[0][1]);
  for (let i = 1; i < outer.length; i++) shape.lineTo(outer[i][0], outer[i][1]);
  for (let i = inner.length - 1; i >= 0; i--) shape.lineTo(inner[i][0], inner[i][1]);
  // 内弧最后一端在槽下缘；沿槽下缘切口回到外弧起点。
  shape.closePath();
  const shell = new THREE.ExtrudeGeometry(shape, {
    depth: len,
    bevelEnabled: true,
    bevelThickness: 0.0006,
    bevelSize: 0.0006,
    bevelSegments: 1,
    curveSegments: 64,
    steps: 1,
  });
  shell.translate(0, 0, z0);
  parts.push(shell);

  // 前节套环：机匣前端的锻钢环，外面能看到一圈台阶。
  const ring = tubeZ(0.0245, 0.0185, 0.024, 48);
  ring.translate(0, cy, 0.018);
  parts.push(ring);
  // 后桥/尾座环，托底板之前的结构。
  const rearRing = tubeZ(0.0235, 0.019, 0.012, 48);
  rearRing.translate(0, cy, z0 + 0.012);
  parts.push(rearRing);

  // 侧壁螺钉/铆钉：左侧两列，右下侧一列（右上让开拉机柄槽）。
  for (const side of [-1, 1]) {
    for (const z of [-0.23, -0.19, -0.15, -0.11, -0.07]) {
      if (side > 0 && z > -0.14) continue;
      const screw = cylinderX(0.0022, 0.0018, 16);
      screw.translate(side * (halfW + 0.0007), cy - 0.014, z);
      parts.push(screw);
      const slot = box(0.0005, 0.001, 0.0028, 0.0002);
      slot.translate(side * (halfW + 0.0017), cy - 0.014, z);
      parts.push(slot);
    }
  }

  // 右侧弹仓 cutoff 拨片（三八式标志性小件）：底座 + 拨杆。
  const cutoffBase = box(0.003, 0.012, 0.016, 0.0006);
  cutoffBase.translate(halfW + 0.0015, -0.008, -0.085);
  parts.push(cutoffBase);
  const cutoffLever = box(0.0025, 0.0045, 0.035, 0.0005);
  cutoffLever.rotateX(-0.35);
  cutoffLever.translate(halfW + 0.004, -0.001, -0.075);
  parts.push(cutoffLever);

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
  receiverShell,
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
