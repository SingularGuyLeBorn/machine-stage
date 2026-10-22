import * as THREE from "three";
import type { GeometryBuilder } from "../../../assembler/geometry";
import { ball, box, cylinderX, cylinderY, cylinderZ, latheGeometry, mergeAll, torusZ, tubeZ } from "../kits";

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
// ---------------------------------------------------------------------------
// bisonStandBase —— 机加工展示台底座（取代原来的长木板）。
// 阶梯底座 + 两个立柱安装凸台 + 铭牌座，像 Type38 的展示台那样是钢件，
// 不再是木板。
// ---------------------------------------------------------------------------
export const bisonStandBase: GeometryBuilder = () => {
  const parts: THREE.BufferGeometry[] = [];
  // 下层地脚：外扩 12mm，圆角 6mm
  const foot = box(0.66, 0.006, 0.28, 0.006);
  foot.translate(0, 0.003, 0);
  parts.push(foot);
  // 上层台面：收窄 16mm，顶部留 2mm 机加工亮边
  const deck = box(0.62, 0.006, 0.24, 0.004);
  deck.translate(0, 0.009, 0);
  parts.push(deck);
  const topPlate = box(0.58, 0.002, 0.22, 0.002);
  topPlate.translate(0, 0.013, 0);
  parts.push(topPlate);
  // 立柱安装凸台：与两个托架中心对应
  for (const z of [-0.235, 0.16]) {
    const boss = cylinderY(0.032, 0.008, 40);
    boss.translate(0, 0.017, z);
    parts.push(boss);
    const chamfer = latheGeometry(
      [
        [0.032, 0],
        [0.032, 0.004],
        [0.029, 0.008],
        [0.024, 0.008],
        [0, 0.008],
      ],
      40,
    );
    chamfer.translate(0, 0.013, z);
    parts.push(chamfer);
  }
  // 前部铭牌座
  const plaque = box(0.10, 0.002, 0.035, 0.0015);
  plaque.translate(0, 0.014, 0.06);
  parts.push(plaque);
  // 防滑槽
  for (const side of [-1, 1]) {
    const groove = box(0.56, 0.0012, 0.006, 0.0003);
    groove.translate(0, 0.0012, side * 0.09);
    parts.push(groove);
  }
  return mergeAll(parts);
};
// ---------------------------------------------------------------------------
// bisonStandPost —— 车削圆立柱（取代原来的方木柱）。
// ---------------------------------------------------------------------------
export const bisonStandPost: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const h = num(p, "h", 0.16);
  const parts: THREE.BufferGeometry[] = [];
  const postH = Math.max(h - 0.03, 0.04);
  const post = cylinderY(0.010, postH, 40);
  post.translate(0, 0.015 + postH / 2, 0);
  parts.push(post);
  const foot = cylinderY(0.028, 0.010, 40);
  foot.translate(0, 0.005, 0);
  parts.push(foot);
  const footChamfer = latheGeometry(
    [
      [0.028, 0],
      [0.028, 0.005],
      [0.025, 0.008],
      [0.016, 0.010],
      [0, 0.010],
    ],
    40,
  );
  footChamfer.translate(0, 0, 0);
  parts.push(footChamfer);
  const collar = cylinderY(0.015, 0.008, 40);
  collar.translate(0, 0.015 + postH + 0.004, 0);
  parts.push(collar);
  const topCollar = cylinderY(0.014, 0.007, 40);
  topCollar.translate(0, 0.015 + postH, 0);
  parts.push(topCollar);
  // 锁紧手柄
  const knobStem = cylinderX(0.004, 0.026, 20);
  knobStem.translate(0.016, 0.015 + postH * 0.5, 0);
  parts.push(knobStem);
  const knob = latheGeometry(
    [
      [0, -0.006],
      [0.010, -0.006],
      [0.012, -0.003],
      [0.012, 0.003],
      [0.010, 0.006],
      [0, 0.006],
    ],
    24,
  );
  knob.rotateZ(Math.PI / 2);
  knob.translate(0.030, 0.015 + postH * 0.5, 0);
  parts.push(knob);
  return mergeAll(parts);
};
// ---------------------------------------------------------------------------
// bisonStandCradle —— 机加工 V 形托块（取代原来的两块斜板）。
// ---------------------------------------------------------------------------
export const bisonStandCradle: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const span = num(p, "span", 0.036);
  const parts: THREE.BufferGeometry[] = [];
  const halfW = span / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-halfW, -0.03);
  shape.lineTo(halfW, -0.03);
  shape.lineTo(halfW, 0.0);
  shape.lineTo(0.012, 0.0);
  shape.lineTo(0, -0.014);
  shape.lineTo(-0.012, 0.0);
  shape.lineTo(-halfW, 0.0);
  shape.closePath();
  const block = new THREE.ExtrudeGeometry(shape, {
    depth: 0.045,
    bevelEnabled: true,
    bevelThickness: 0.0012,
    bevelSize: 0.0012,
    bevelSegments: 2,
    curveSegments: 8,
    steps: 1,
  });
  block.translate(0, 0, -0.0225);
  parts.push(block);
  const washer = cylinderY(0.018, 0.004, 32);
  washer.translate(0, -0.032, 0);
  parts.push(washer);
  return mergeAll(parts);
};
/** 机匣全包外壳：AK 冲压机匣外面再套一层封闭壳体，盖住枪机框/复进簧。 */
export const bisonReceiverShell: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const w = num(p, "w", 0.050);
  const h = num(p, "h", 0.062);
  const z0 = num(p, "z0", -0.240);
  const z1 = num(p, "z1", 0.060);
  const t = num(p, "t", 0.0022);
  const len = z1 - z0;
  const zc = (z0 + z1) / 2;
  const parts: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    const wall = box(t, h, len, 0.0004);
    wall.translate(side * (w / 2 - t / 2), 0, zc);
    parts.push(wall);
    const rib = box(0.0016, 0.008, len * 0.70, 0.0003);
    rib.translate(side * (w / 2 + 0.0006), -0.006, zc + 0.010);
    parts.push(rib);
  }
  const bottom = box(w, t, len, 0.0004);
  bottom.translate(0, -h / 2 + t / 2, zc);
  parts.push(bottom);
  const top = box(w, t, len, 0.0004);
  top.translate(0, h / 2 - t / 2, zc);
  parts.push(top);
  const rear = box(w, h, t, 0.0004);
  rear.translate(0, 0, z0 + t / 2);
  parts.push(rear);
  // 前端节套环：枪管从中心孔穿出
  const collar = tubeZ(0.024, 0.011, 0.020, 24);
  collar.translate(0, 0, z1 - 0.004);
  parts.push(collar);
  // 顶盖三条加强筋（替代被外壳盖住的旧筋）
  for (const x of [-0.013, 0, 0.013]) {
    const rib = box(0.0042, 0.0018, len * 0.74, 0.0003);
    rib.translate(x, h / 2 + 0.0010, zc + 0.004);
    parts.push(rib);
  }
  // 右侧拉机柄长槽压边
  const slotTop = box(0.0014, 0.0022, 0.105, 0.0003);
  slotTop.translate(w / 2 + 0.0005, 0.020, -0.062);
  parts.push(slotTop);
  const slotBottom = slotTop.clone();
  slotBottom.translate(0, -0.016, 0);
  parts.push(slotBottom);
  // 后部背带环座
  const sling = box(0.016, 0.008, 0.010, 0.0005);
  sling.translate(-(w / 2 + 0.006), 0.004, z0 + 0.018);
  parts.push(sling);
  // 下机匣/发射机侧板：把 AK 血统的击锤簧、扳机簧包在机匣内；
  // 底边停在扳机护圈上方，扳机仍从下方露出。
  for (const side of [-1, 1]) {
    const lower = box(t, 0.060, 0.150, 0.0004);
    lower.translate(side * (w / 2 - t / 2), -0.061, -0.150);
    parts.push(lower);
    const boss = box(0.003, 0.010, 0.010, 0.0004);
    boss.translate(side * (w / 2 + 0.0010), -0.052, -0.176);
    parts.push(boss);
  }
  // 下机匣前挡板：封住击锤簧前端从侧板前缘露出的缺口
  const lowerFront = box(w, 0.060, 0.030, 0.0008);
  lowerFront.translate(0, -0.061, -0.060);
  parts.push(lowerFront);
  return mergeAll(parts);
};

/** 弹筒全包外罩：封闭圆筒 + 两道包箍 + 前后端盖 + 侧面压筋。 */
export const bisonDrumOuter: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const r = num(p, "r", 0.0385);
  const len = num(p, "len", 0.154);
  const y = num(p, "y", -0.058);
  const zc = num(p, "zc", 0.142);
  const parts: THREE.BufferGeometry[] = [];
  const body = cylinderZ(r, len, 40);
  body.translate(0, y, zc);
  parts.push(body);
  for (const dz of [-len * 0.30, len * 0.30]) {
    const band = cylinderZ(r + 0.0022, 0.007, 40);
    band.translate(0, y, zc + dz);
    parts.push(band);
  }
  for (const dz of [-len / 2, len / 2]) {
    const cap = cylinderZ(r + 0.0015, 0.008, 36);
    cap.translate(0, y, zc + dz);
    parts.push(cap);
  }
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2;
    const rib = box(0.006, 0.0035, len * 0.78, 0.0004);
    rib.rotateZ(angle);
    rib.translate(Math.cos(angle) * (r + 0.001), y + Math.sin(angle) * (r + 0.001), zc);
    parts.push(rib);
  }
  // 前部发条轴座
  const hub = cylinderZ(0.008, 0.018, 14);
  hub.translate(0, y, zc + len / 2 + 0.010);
  parts.push(hub);
  return mergeAll(parts);
};

export const bisonKits: Record<string, GeometryBuilder> = {
  bisonBarrel,
  bisonReceiverShell,
  bisonDrumOuter,
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
