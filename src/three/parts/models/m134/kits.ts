import * as THREE from "three";
import type { GeometryBuilder } from "../../assembler/geometry";
import {
  bevelBoxGeometry,
  latheGeometry,
  mergeGeometries,
  tubeGeometry,
} from "../../kernel/geometry";

type Params = Record<string, unknown>;

function num(params: Params | undefined, key: string, fallback?: number): number {
  const value = params?.[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (fallback !== undefined) return fallback;
  throw new Error(`m134 kit：参数 "${key}" 必须是数值（收到 ${String(value)}）`);
}

// ---------------------------------------------------------------------------
// m134Rotor —— 旋转机匣：6 个枪管孔座 + 尾端凸轮槽环（驱动 6 个独立枪机）。
// 局部系：origin = 旋转轴中心，+Z 枪口方向。
// ---------------------------------------------------------------------------
const m134Rotor: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const r = num(p, "r", 0.052);
  const len = num(p, "len", 0.16);
  const ringR = num(p, "ringR", 0.032);
  const count = Math.round(num(p, "count", 6));
  const parts: THREE.BufferGeometry[] = [];
  // 旋转机匣主体（中空筒：6 根枪管从中间穿过）
  const body = tubeGeometry(r, ringR + 0.009, len, 24);
  body.rotateX(Math.PI / 2);
  body.translate(0, 0, len / 2);
  parts.push(body);
  // 6 个枪管孔座（前端凸台，枪管从这里伸出）
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const boss = new THREE.CylinderGeometry(0.0098, 0.0098, 0.02, 12);
    boss.rotateX(Math.PI / 2);
    boss.translate(Math.cos(angle) * ringR, Math.sin(angle) * ringR, len - 0.008);
    parts.push(boss);
  }
  // 尾端凸轮槽环（枪机导销在此槽内滑动 → 旋转中枪机往复）
  const camRing = tubeGeometry(ringR + 0.011, ringR + 0.004, 0.014, 24);
  camRing.rotateX(Math.PI / 2);
  camRing.translate(0, 0, 0.008);
  parts.push(camRing);
  // 转子前端面环
  const front = latheGeometry(
    [
      [ringR + 0.009, 0],
      [r, 0],
      [r, -0.004],
      [ringR + 0.009, -0.004],
      [ringR + 0.009, 0],
    ],
    24,
  );
  front.rotateX(Math.PI / 2);
  front.translate(0, 0, len);
  parts.push(front);
  const merged = mergeGeometries(parts);
  for (const piece of parts) piece.dispose();
  return merged;
};

// ---------------------------------------------------------------------------
// m134Housing —— 固定机匣（不转的外壳）：抛壳口 + 供弹机座 + 电机座。
// 局部系：origin = 旋转轴中心。
// ---------------------------------------------------------------------------
const m134Housing: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const w = num(p, "w", 0.13);
  const h = num(p, "h", 0.15);
  const z0 = num(p, "z0", -0.34);
  const z1 = num(p, "z1", 0.06);
  const parts: THREE.BufferGeometry[] = [];
  // 外壳（上下两半：中间留出旋转机匣的位置）
  const top = new THREE.BoxGeometry(w, 0.006, z1 - z0);
  top.translate(0, h / 2 - 0.003, (z0 + z1) / 2);
  parts.push(top);
  const bottom = new THREE.BoxGeometry(w, 0.006, z1 - z0);
  bottom.translate(0, -h / 2 + 0.003, (z0 + z1) / 2);
  parts.push(bottom);
  // 两侧板（后段：包住电机；前段开口让旋转机匣露出）
  for (const side of [-1, 1]) {
    const rearPlate = new THREE.BoxGeometry(0.006, h, 0.14);
    rearPlate.translate(side * (w / 2 - 0.003), 0, z0 + 0.07);
    parts.push(rearPlate);
    // 抛壳口下沿（左侧的抛壳导板）
    const chute = new THREE.BoxGeometry(0.004, 0.05, 0.06);
    chute.translate(side * (w / 2 - 0.003), -0.02, -0.02);
    parts.push(chute);
  }
  // 供弹机座（顶部：弹链从这里进入旋转机匣的进弹位置）
  const feedBase = new THREE.BoxGeometry(0.07, 0.03, 0.08);
  feedBase.translate(0, h / 2 + 0.012, -0.02);
  parts.push(feedBase);
  // 电机座（尾部）
  const motorSeat = new THREE.BoxGeometry(w * 0.7, 0.05, 0.06);
  motorSeat.translate(0, -0.02, z0 + 0.03);
  parts.push(motorSeat);
  const merged = mergeGeometries(parts);
  for (const piece of parts) piece.dispose();
  return merged;
};

// ---------------------------------------------------------------------------
// m134FrontHousing —— 固定机匣前段闭合壳：左右侧板 + 前端框 + 枪管束导环 +
// 抛壳槽 + 耳轴座。后段仍由 m134Housing 的电机座/侧板承担。
// 局部系：origin = 旋转轴中心，几何按模型坐标布置。
// ---------------------------------------------------------------------------
const m134FrontHousing: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const w = num(p, "w", 0.13);
  const h = num(p, "h", 0.15);
  const z0 = num(p, "z0", -0.20);
  const z1 = num(p, "z1", 0.06);
  const parts: THREE.BufferGeometry[] = [];
  const len = z1 - z0;
  const zc = (z0 + z1) / 2;

  for (const side of [-1, 1]) {
    const wall = bevelBoxGeometry(0.006, h, len, 0.0008, 1);
    wall.translate(side * (w / 2 - 0.003), 0, zc);
    parts.push(wall);
    const rib = bevelBoxGeometry(0.0018, 0.010, len * 0.74, 0.0004, 1);
    rib.translate(side * (w / 2 + 0.0008), -0.022, zc + 0.01);
    parts.push(rib);
  }

  // 前端框：上下横梁 + 左右立柱，中间留 90×90mm 枪管束出口
  const barT = 0.030;
  for (const y of [-1, 1]) {
    const bar = bevelBoxGeometry(w, barT, 0.010, 0.0008, 1);
    bar.translate(0, y * (h / 2 - barT / 2), z1);
    parts.push(bar);
  }
  for (const side of [-1, 1]) {
    const post = bevelBoxGeometry(0.020, h - barT * 2, 0.010, 0.0008, 1);
    post.translate(side * (w / 2 - 0.010), 0, z1);
    parts.push(post);
  }

  // 枪管束导环：环内径 43mm，六根枪管从中间穿过
  const collar = tubeGeometry(0.050, 0.043, 0.010, 28);
  collar.rotateX(Math.PI / 2);
  collar.translate(0, 0, z1 + 0.005);
  parts.push(collar);

  // 左侧抛壳槽：空壳从机匣左下侧排出
  const chute = bevelBoxGeometry(0.038, 0.036, 0.075, 0.0012, 1);
  chute.translate(-(w / 2 + 0.014), -0.036, -0.065);
  parts.push(chute);
  const chuteLip = bevelBoxGeometry(0.042, 0.005, 0.008, 0.0006, 1);
  chuteLip.translate(-(w / 2 + 0.014), -0.052, -0.030);
  parts.push(chuteLip);

  // 左右耳轴座（枪架抱箍的连接点）
  for (const side of [-1, 1]) {
    const boss = new THREE.CylinderGeometry(0.018, 0.018, 0.024, 16);
    boss.rotateZ(Math.PI / 2);
    boss.translate(side * (w / 2 + 0.010), -0.010, -0.135);
    parts.push(boss);
  }

  const merged = mergeGeometries(parts);
  for (const piece of parts) piece.dispose();
  return merged;
};

// ---------------------------------------------------------------------------
// m134FeedCover —— 供弹机大盖：把脱链器/拨链轮/链道盖住，正常状态只见
// 一个带铰链和卡榫的盒盖。
// 局部系：origin = 供弹机中心，几何按模型坐标布置。
// ---------------------------------------------------------------------------
const m134FeedCover: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const w = num(p, "w", 0.086);
  const y = num(p, "y", 0.098);
  const zc = num(p, "zc", -0.020);
  const parts: THREE.BufferGeometry[] = [];
  const top = bevelBoxGeometry(w, 0.014, 0.125, 0.0012, 1);
  top.translate(0, y, zc);
  parts.push(top);
  const rib = bevelBoxGeometry(w * 0.78, 0.005, 0.104, 0.0008, 1);
  rib.translate(0, y + 0.0095, zc);
  parts.push(rib);
  for (const side of [-1, 1]) {
    const skirt = bevelBoxGeometry(0.004, 0.022, 0.118, 0.0008, 1);
    skirt.translate(side * (w / 2 - 0.002), y - 0.012, zc);
    parts.push(skirt);
  }
  const hinge = new THREE.CylinderGeometry(0.004, 0.004, 0.082, 12);
  hinge.rotateZ(Math.PI / 2);
  hinge.translate(0, y - 0.002, zc - 0.058);
  parts.push(hinge);
  const latch = bevelBoxGeometry(0.018, 0.012, 0.012, 0.0007, 1);
  latch.translate(0, y - 0.005, zc + 0.058);
  parts.push(latch);
  const merged = mergeGeometries(parts);
  for (const piece of parts) piece.dispose();
  return merged;
};

// ---------------------------------------------------------------------------
// m134BarrelShroud —— 枪管护罩：固定筒壳 + 四道加强箍 + 六条纵向筋，
// 从固定机匣前端伸到枪管中段；枪口段六管仍外露。
// 局部系：origin = 旋转轴中心，几何按模型坐标布置。
// ---------------------------------------------------------------------------
const m134BarrelShroud: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const rOuter = num(p, "rOuter", 0.058);
  const rInner = num(p, "rInner", 0.050);
  const z0 = num(p, "z0", 0.075);
  const z1 = num(p, "z1", 0.225);
  const parts: THREE.BufferGeometry[] = [];
  const len = z1 - z0;
  const zc = (z0 + z1) / 2;
  const tube = tubeGeometry(rOuter, rInner, len, 32);
  tube.rotateX(Math.PI / 2);
  tube.translate(0, 0, zc);
  parts.push(tube);

  // 四道加强箍
  for (const t of [0.10, 0.38, 0.66, 0.92]) {
    const band = tubeGeometry(rOuter + 0.004, rInner, 0.009, 32);
    band.rotateX(Math.PI / 2);
    band.translate(0, 0, z0 + len * t);
    parts.push(band);
  }

  // 六条纵向加强筋
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    const rib = bevelBoxGeometry(0.008, 0.006, len * 0.86, 0.0006, 1);
    rib.rotateZ(angle);
    rib.translate(Math.cos(angle) * (rOuter + 0.002), Math.sin(angle) * (rOuter + 0.002), zc);
    parts.push(rib);
  }

  // 前端箍 + 顶部提把导轨
  const frontRing = tubeGeometry(rOuter + 0.006, rInner, 0.012, 32);
  frontRing.rotateX(Math.PI / 2);
  frontRing.translate(0, 0, z1 - 0.004);
  parts.push(frontRing);
  const rail = bevelBoxGeometry(0.022, 0.008, len * 0.84, 0.0008, 1);
  rail.translate(0, rOuter + 0.007, zc);
  parts.push(rail);

  const merged = mergeGeometries(parts);
  for (const piece of parts) piece.dispose();
  return merged;
};

// ---------------------------------------------------------------------------
// m134Bolt —— 单管独立枪机（6 个实例）：机头 + 导销（插在转子凸轮槽里）。
// 局部系：origin = 枪机前端面，+Z 枪口方向。
// ---------------------------------------------------------------------------
const m134Bolt: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const r = num(p, "r", 0.0092);
  const len = num(p, "len", 0.085);
  const parts: THREE.BufferGeometry[] = [];
  const body = latheGeometry(
    [
      [0.0001, 0],
      [r, 0],
      [r, -len * 0.72],
      [r * 0.85, -len * 0.8],
      [r * 0.85, -len],
      [0.0001, -len],
    ],
    14,
  );
  body.rotateX(Math.PI / 2);
  parts.push(body);
  // 导销（插进转子凸轮槽：旋转中把枪机推前/拉后）
  const pin = new THREE.CylinderGeometry(0.0026, 0.0026, 0.012, 8);
  pin.rotateZ(Math.PI / 2);
  pin.translate(r * 0.95, 0, -len * 0.85);
  parts.push(pin);
  // 抽壳钩
  const claw = bevelBoxGeometry(0.0028, 0.006, 0.01, 0.0005, 1);
  claw.translate(r - 0.001, 0.003, -0.006);
  parts.push(claw);
  // 击针（中心）
  const firing = new THREE.CylinderGeometry(0.0014, 0.0014, 0.05, 6);
  firing.rotateX(Math.PI / 2);
  firing.translate(0, 0, -0.028);
  parts.push(firing);
  const merged = mergeGeometries(parts);
  for (const piece of parts) piece.dispose();
  return merged;
};

// ---------------------------------------------------------------------------
// m134Motor —— 外能源驱动：直流电机 + 减速齿轮箱 + 大齿轮（36 齿）。
// 局部系：origin = 电机轴中心（接转子尾端）。
// ---------------------------------------------------------------------------
const m134Motor: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const r = num(p, "r", 0.038);
  const len = num(p, "len", 0.11);
  const gearR = num(p, "gearR", 0.05);
  const teeth = Math.round(num(p, "teeth", 36));
  const parts: THREE.BufferGeometry[] = [];
  // 电机壳体
  const shell = new THREE.CylinderGeometry(r, r, len, 20);
  shell.rotateX(Math.PI / 2);
  shell.translate(0, 0, -len / 2);
  parts.push(shell);
  // 电机尾盖（散热筋）
  for (let i = 0; i < 4; i++) {
    const fin = new THREE.BoxGeometry(0.004, r * 2, 0.003);
    fin.translate(0, 0, -len + 0.008 + i * 0.012);
    parts.push(fin);
  }
  // 减速大齿轮（36 齿：齿圈 + 齿）
  const gear = latheGeometry(
    [
      [0.012, 0],
      [gearR * 0.9, 0],
      [gearR * 0.9, 0.008],
      [0.012, 0.008],
      [0.012, 0],
    ],
    28,
  );
  parts.push(gear);
  for (let i = 0; i < teeth; i++) {
    const angle = (i / teeth) * Math.PI * 2;
    const tooth = new THREE.BoxGeometry(0.006, 0.007, 0.008);
    tooth.rotateZ(angle);
    tooth.translate(Math.cos(angle) * gearR * 0.93, Math.sin(angle) * gearR * 0.93, 0.004);
    parts.push(tooth);
  }
  // 小齿轮（10 齿，与电机轴同轴）
  for (let i = 0; i < 10; i++) {
    const angle = (i / 10) * Math.PI * 2;
    const tooth = new THREE.BoxGeometry(0.004, 0.005, 0.008);
    tooth.rotateZ(angle);
    tooth.translate(Math.cos(angle) * 0.016, Math.sin(angle) * 0.016, 0.012);
    parts.push(tooth);
  }
  const merged = mergeGeometries(parts);
  for (const piece of parts) piece.dispose();
  return merged;
};

// ---------------------------------------------------------------------------
// m134Delinker —— 供弹机（弹链从这里被逐节拉进旋转机匣的进弹位）。
// 局部系：origin = 供弹机中心（装在机匣顶部）。
// ---------------------------------------------------------------------------
const m134Delinker: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const w = num(p, "w", 0.075);
  const parts: THREE.BufferGeometry[] = [];
  // 供弹机壳体（链道从左侧进入）
  const body = new THREE.BoxGeometry(w, 0.028, 0.09);
  parts.push(body);
  // 链道导板（左侧入口）
  const guide = new THREE.BoxGeometry(0.03, 0.008, 0.09);
  guide.translate(-w / 2 - 0.012, 0.008, 0);
  parts.push(guide);
  // 拨链轮（供弹机内的链轮，齿咬合链节）
  const sprocket = new THREE.CylinderGeometry(0.014, 0.014, 0.012, 12);
  sprocket.rotateZ(Math.PI / 2);
  sprocket.translate(0, 0.004, 0);
  parts.push(sprocket);
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    const tooth = new THREE.BoxGeometry(0.014, 0.004, 0.004);
    tooth.rotateX(angle);
    tooth.translate(0, 0.004 + Math.cos(angle) * 0.014, Math.sin(angle) * 0.014);
    parts.push(tooth);
  }
  const merged = mergeGeometries(parts);
  for (const piece of parts) piece.dispose();
  return merged;
};

// ---------------------------------------------------------------------------
// m134Mount —— 枪架（立柱 + 耳轴座）：加特林装在载具/三脚架上。
// 局部系：origin = 枪架顶（耳轴中心）。
// ---------------------------------------------------------------------------
const m134Mount: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const drop = num(p, "drop", 0.18);
  const parts: THREE.BufferGeometry[] = [];
  // 立柱
  const post = new THREE.CylinderGeometry(0.022, 0.026, drop, 14);
  post.translate(0, -drop / 2, 0);
  parts.push(post);
  // 耳轴座（顶部 U 形叉）
  for (const side of [-1, 1]) {
    const fork = new THREE.BoxGeometry(0.008, 0.05, 0.03);
    fork.translate(side * 0.06, 0.012, 0);
    parts.push(fork);
  }
  const base = new THREE.BoxGeometry(0.13, 0.008, 0.05);
  base.translate(0, -0.012, 0);
  parts.push(base);
  // 底板（圆形底座）
  const plate = new THREE.CylinderGeometry(0.09, 0.09, 0.012, 16);
  plate.translate(0, -drop + 0.006, 0);
  parts.push(plate);
  const merged = mergeGeometries(parts);
  for (const piece of parts) piece.dispose();
  return merged;
};

export const m134KitBuilders: Record<string, GeometryBuilder> = {
  m134Rotor,
  m134Housing,
  m134FrontHousing,
  m134FeedCover,
  m134BarrelShroud,
  m134Bolt,
  m134Motor,
  m134Delinker,
  m134Mount,
};
