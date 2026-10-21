import * as THREE from "three";
import type { GeometryBuilder } from "../../../assembler/geometry";
import { ball, box, cylinderX, cylinderY, cylinderZ, mergeAll, torusZ, tubeZ } from "../kits";

// ============================================================================
// models/guns7/bison/kits — PP-19 野牛专用几何
//
// 坐标：+Z 枪口、+Y 上、+X 右；原点 = 弹膛底/枪机闭锁面。
// 这套 kit 只补 AK 基座没有的件：短枪管护罩、折叠骨架托、螺旋弹筒、
// 供弹口、拉机柄、准星、展示台。机匣/击发机构直接复用 AK 的成熟几何。
// ============================================================================

type Params = Record<string, unknown>;
const num = (p: Params | undefined, key: string, fallback: number) =>
  typeof p?.[key] === "number" ? (p[key] as number) : fallback;

/** 短枪管 + 护罩：枪管从 z=0 到 len，护罩只包住中段，前端露出枪口。 */
export const bisonBarrel: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const len = num(p, "len", 0.19);
  const r = num(p, "r", 0.0085);
  const shroudLen = num(p, "shroudLen", 0.12);
  const shroudR = num(p, "shroudR", 0.016);
  const parts: THREE.BufferGeometry[] = [];
  const barrel = tubeZ(r, 0.0052, len, 24);
  barrel.translate(0, 0, len / 2);
  parts.push(barrel);
  const shroud = tubeZ(shroudR, shroudR - 0.0018, shroudLen, 28);
  shroud.translate(0, 0, 0.045 + shroudLen / 2);
  parts.push(shroud);
  // 护罩上的长槽：用四根深色窄条表示散热开口，不切穿筒壁。
  for (const side of [-1, 1]) {
    const slot = box(0.0015, 0.004, shroudLen * 0.72, 0.0003);
    slot.translate(side * shroudR * 0.98, 0.003, 0.045 + shroudLen / 2);
    parts.push(slot);
  }
  const ribTop = box(0.006, 0.002, shroudLen * 0.88, 0.0004);
  ribTop.translate(0, shroudR, 0.045 + shroudLen / 2);
  parts.push(ribTop);
  return mergeAll(parts);
};

/** 枪口装置：短消焰器，带两道侧槽。 */
export const bisonMuzzle: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const len = num(p, "len", 0.035);
  const r = num(p, "r", 0.0115);
  const parts: THREE.BufferGeometry[] = [];
  const body = cylinderZ(r, len, 20);
  body.translate(0, 0, len / 2);
  parts.push(body);
  // 深色内孔用一个略小的圆柱叠在内部，形成可见的枪口内壁。
  const mouth = cylinderZ(r * 0.58, 0.002, 16);
  mouth.translate(0, 0, len - 0.001);
  parts.push(mouth);
  for (const side of [-1, 1]) {
    const slot = box(0.003, 0.002, len * 0.55, 0.0002);
    slot.translate(side * r * 0.98, 0.0025, len * 0.55);
    parts.push(slot);
  }
  return mergeAll(parts);
};

/** 准星护圈 + 准星片，原点在枪管轴线、z=0。 */
export const bisonFrontSight: GeometryBuilder = () => {
  const parts: THREE.BufferGeometry[] = [];
  const base = box(0.026, 0.008, 0.018, 0.0008);
  base.translate(0, 0.012, 0);
  parts.push(base);
  const guard = box(0.004, 0.026, 0.004, 0.0004);
  for (const side of [-1, 1]) {
    const leg = guard.clone();
    leg.translate(side * 0.010, 0.024, 0);
    parts.push(leg);
  }
  const top = box(0.024, 0.003, 0.004, 0.0004);
  top.translate(0, 0.037, 0);
  parts.push(top);
  const post = box(0.0018, 0.014, 0.002, 0.0002);
  post.translate(0, 0.027, 0.002);
  parts.push(post);
  return mergeAll(parts);
};

/** 侧折叠骨架托：原点在机匣尾铰链，托向 -Z 伸出。 */
export const bisonFoldingStock: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const len = num(p, "len", 0.17);
  const parts: THREE.BufferGeometry[] = [];
  const hinge = cylinderY(0.007, 0.034, 16);
  parts.push(hinge);
  for (const side of [-1, 1]) {
    const rod = cylinderZ(0.0038, len, 12);
    rod.translate(side * 0.014, 0.012, -len / 2);
    parts.push(rod);
    const lower = cylinderZ(0.0025, len * 0.64, 10);
    lower.translate(side * 0.014, -0.012, -len * 0.36);
    parts.push(lower);
  }
  const butt = box(0.052, 0.062, 0.010, 0.0012);
  butt.translate(0, 0.0, -len - 0.004);
  parts.push(butt);
  const pad = box(0.046, 0.055, 0.006, 0.0008);
  pad.translate(0, 0.0, -len - 0.010);
  parts.push(pad);
  const cheek = box(0.040, 0.012, 0.07, 0.0008);
  cheek.translate(0, 0.022, -len * 0.72);
  parts.push(cheek);
  return mergeAll(parts);
};

/** 聚合物握把：原点在握把顶部，向下延伸。 */
export const bisonGrip: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const h = num(p, "h", 0.095);
  const w = num(p, "w", 0.030);
  const d = num(p, "d", 0.036);
  const parts: THREE.BufferGeometry[] = [];
  const body = box(w, h, d, 0.0025);
  body.translate(0, -h / 2, 0);
  parts.push(body);
  for (let i = 0; i < 3; i++) {
    const groove = box(w + 0.001, 0.0028, 0.002, 0.0003);
    groove.translate(0, -h * 0.38 - i * 0.017, d / 2 + 0.0005);
    parts.push(groove);
  }
  const cap = box(w + 0.002, 0.006, d + 0.002, 0.0008);
  cap.translate(0, -h + 0.003, 0);
  parts.push(cap);
  return mergeAll(parts);
};

/** 拉机柄：原点在枪机右侧的安装面。 */
export const bisonChargingHandle: GeometryBuilder = () => {
  const parts: THREE.BufferGeometry[] = [];
  const stem = cylinderX(0.0038, 0.038, 12);
  stem.translate(0.019, 0, 0);
  parts.push(stem);
  const knob = ball(0.009, 14);
  knob.translate(0.040, 0, 0);
  parts.push(knob);
  const collar = cylinderX(0.006, 0.008, 12);
  collar.translate(0.004, 0, 0);
  parts.push(collar);
  return mergeAll(parts);
};

/** 螺旋弹筒的随动托弹板：原点在弹筒轴心。 */
export const bisonFollower: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const r = num(p, "r", 0.030);
  const parts: THREE.BufferGeometry[] = [];
  // 托弹板不是整圆盘：整圆盘会横切螺旋槽里的弹药。这里只做中心毂 + 单臂，
  // 臂端推最后一发弹底，圆盘的大部分空间让给螺旋叠弹。
  const hub = cylinderZ(0.008, 0.008, 14);
  parts.push(hub);
  // 零件原点在弹筒半径 R 处，臂必须朝圆心方向延伸；若朝外会穿透弹筒外壳。
  const arm = box(r * 0.82, 0.010, 0.006, 0.0006);
  arm.translate(-r * 0.43, 0, 0.002);
  parts.push(arm);
  const nose = box(0.009, 0.016, 0.012, 0.0006);
  nose.translate(-r * 0.82, 0, 0.002);
  parts.push(nose);
  return mergeAll(parts);
};

/** 供弹口唇：弹筒后上方，两片抱弹唇 + 导引斜面。 */
export const bisonFeedLips: GeometryBuilder = () => {
  const parts: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    const lip = box(0.004, 0.006, 0.024, 0.0005);
    lip.translate(side * 0.009, 0.002, -0.006);
    parts.push(lip);
    const ramp = box(0.006, 0.003, 0.02, 0.0004);
    ramp.translate(side * 0.007, -0.001, 0.006);
    parts.push(ramp);
  }
  const bridge = box(0.016, 0.0025, 0.008, 0.0003);
  bridge.translate(0, -0.003, 0.008);
  parts.push(bridge);
  return mergeAll(parts);
};

/** 弹筒端盖：环板 + 三个铆钉。 */
export const bisonDrumCap: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const rOuter = num(p, "rOuter", 0.036);
  const rInner = num(p, "rInner", 0.027);
  const parts: THREE.BufferGeometry[] = [];
  const ring = tubeZ(rOuter, rInner, 0.003, 32);
  parts.push(ring);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.3;
    const rivet = ball(0.0018, 8);
    rivet.translate(Math.cos(a) * (rOuter - 0.004), Math.sin(a) * (rOuter - 0.004), 0.002);
    parts.push(rivet);
  }
  return mergeAll(parts);
};

/** 背带环：环面在 YZ 平面，孔沿 X。 */
export const bisonSlingLoop: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const r = num(p, "r", 0.008);
  const ring = torusZ(r, 0.0015, Math.PI * 2, 18);
  ring.rotateY(Math.PI / 2);
  return ring;
};

/** 弹筒与机匣之间的挂点/卡箍。 */
export const bisonDrumHanger: GeometryBuilder = () => {
  const parts: THREE.BufferGeometry[] = [];
  const front = box(0.03, 0.012, 0.018, 0.0008);
  front.translate(0, -0.012, 0.045);
  parts.push(front);
  const rear = box(0.03, 0.010, 0.016, 0.0008);
  rear.translate(0, -0.012, -0.06);
  parts.push(rear);
  const strap = box(0.006, 0.020, 0.018, 0.0005);
  strap.translate(0, -0.020, 0.0);
  parts.push(strap);
  return mergeAll(parts);
};

/** 展示台底座（含毛毡垫）——与三八大盖同一视觉语言。 */
export const bisonStandBase: GeometryBuilder = () => {
  const parts: THREE.BufferGeometry[] = [];
  const base = box(0.64, 0.012, 0.26, 0.002);
  base.translate(0, 0.006, 0);
  parts.push(base);
  const top = box(0.62, 0.003, 0.24, 0.0008);
  top.translate(0, 0.0135, 0);
  parts.push(top);
  return mergeAll(parts);
};

export const bisonStandPost: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const h = num(p, "h", 0.16);
  const parts: THREE.BufferGeometry[] = [];
  const post = box(0.03, h, 0.04, 0.0016);
  post.translate(0, h / 2, 0);
  parts.push(post);
  const foot = box(0.06, 0.008, 0.07, 0.0012);
  foot.translate(0, 0.004, 0);
  parts.push(foot);
  return mergeAll(parts);
};

export const bisonStandCradle: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const span = num(p, "span", 0.036);
  const parts: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    const arm = box(0.010, 0.036, 0.045, 0.001);
    arm.rotateZ(side * 0.42);
    arm.translate(side * span * 0.5, 0.010, 0);
    parts.push(arm);
  }
  const saddle = box(0.014, 0.008, 0.045, 0.0008);
  saddle.translate(0, -0.004, 0);
  parts.push(saddle);
  return mergeAll(parts);
};

export const bisonKits: Record<string, GeometryBuilder> = {
  bisonBarrel,
  bisonMuzzle,
  bisonFrontSight,
  bisonFoldingStock,
  bisonGrip,
  bisonChargingHandle,
  bisonFollower,
  bisonFeedLips,
  bisonDrumCap,
  bisonSlingLoop,
  bisonDrumHanger,
  bisonStandBase,
  bisonStandPost,
  bisonStandCradle,
};
