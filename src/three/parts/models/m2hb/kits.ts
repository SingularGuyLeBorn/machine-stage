import * as THREE from "three";
import type { GeometryBuilder } from "../../assembler/geometry";
import {
  bevelBoxGeometry,
  cylinderGeometry,
  latheGeometry,
  mergeGeometries,
  tubeGeometry,
} from "../../kernel/geometry";

type Params = Record<string, unknown>;

function num(params: Params | undefined, key: string, fallback?: number): number {
  const value = params?.[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (fallback !== undefined) return fallback;
  throw new Error(`m2hb kit：参数 "${key}" 必须是数值（收到 ${String(value)}）`);
}

// ---------------------------------------------------------------------------
// m2Receiver —— M2HB 接收器：铆接矩形管（左/右侧板 + 顶/底板）+ 供弹口。
// 局部系：origin = 枪膛中心，+Z 枪口方向。
// ---------------------------------------------------------------------------
const m2Receiver: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const w = num(p, "w", 0.062);
  const h = num(p, "h", 0.078);
  const z0 = num(p, "z0", -0.36);
  const z1 = num(p, "z1", 0.06);
  const parts: THREE.BufferGeometry[] = [];
  // 左/右侧板
  for (const side of [-1, 1]) {
    const plate = new THREE.BoxGeometry(0.0032, h, z1 - z0);
    plate.translate(side * (w / 2 - 0.0016), 0, (z0 + z1) / 2);
    parts.push(plate);
  }
  // 顶板（开供弹口：用左右两段表达）
  for (const [sz0, sz1] of [
    [z0 + 0.001, -0.085],
    [0.012, z1 - 0.001],
  ] as const) {
    const top = new THREE.BoxGeometry(w, 0.0032, sz1 - sz0);
    top.translate(0, h / 2 - 0.0016, (sz0 + sz1) / 2);
    parts.push(top);
  }
  // 底板（开抛壳/排壳口：两段）
  for (const [sz0, sz1] of [
    [z0 + 0.001, -0.2],
    [-0.05, z1 - 0.001],
  ] as const) {
    const bottom = new THREE.BoxGeometry(w, 0.0032, sz1 - sz0);
    bottom.translate(0, -h / 2 + 0.0016, (sz0 + sz1) / 2);
    parts.push(bottom);
  }
  // 尾部后挡板
  const back = new THREE.BoxGeometry(w, h, 0.004);
  back.translate(0, 0, z0 + 0.002);
  parts.push(back);
  // 供弹口导轨（顶板两侧的导棱，弹链沿其滑行）
  for (const side of [-1, 1]) {
    const rail = new THREE.BoxGeometry(0.004, 0.006, 0.1);
    rail.translate(side * (w / 2 - 0.006), h / 2 - 0.002, -0.03);
    parts.push(rail);
  }
  const merged = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  return merged;
};

// ---------------------------------------------------------------------------
// m2BarrelExtension —— 枪管延伸部（含闭锁环座）：枪管短后坐的「枪管侧」核心。
// 局部系：origin = 延伸部中心。
// ---------------------------------------------------------------------------
const m2BarrelExtension: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const r = num(p, "r", 0.0185);
  const len = num(p, "len", 0.12);
  const boreR = num(p, "boreR", 0.0075);
  void num(p, "lugR", 0.0128);
  const parts: THREE.BufferGeometry[] = [];
  const body = latheGeometry(
    [
      [boreR, -len / 2],
      [r, -len / 2],
      [r, len / 2 - 0.004],
      [r * 0.92, len / 2],
      [boreR, len / 2],
      [boreR, -len / 2],
    ],
    22,
  );
  body.rotateX(Math.PI / 2);
  parts.push(body);
  // 双侧闭锁凸耳（枪机头在此回转/平移闭锁）
  for (const side of [-1, 1]) {
    const lug = bevelBoxGeometry(0.005, 0.01, 0.02, 0.001, 1);
    lug.translate(side * (r + 0.002), 0.002, -len * 0.2);
    parts.push(lug);
  }
  // 加速子让位槽（底部：加速子臂拍击枪机框的通道）
  const slot = bevelBoxGeometry(0.014, 0.006, 0.03, 0.0008, 1);
  slot.translate(0, -r + 0.001, -len * 0.1);
  parts.push(slot);
  const merged = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  return merged;
};

// ---------------------------------------------------------------------------
// m2Bolt —— M2HB 枪机 + 拉壳槽 + 撞针（半自由枪机的枪机侧）。
// 拉壳槽螺面凹槽让撞针随动——枪机后坐时撞针边退边抽壳。
// 局部系：origin = 枪机前端面中心。
// ---------------------------------------------------------------------------
const m2Bolt: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const r = num(p, "r", 0.0115); // 枪机体半径（⌀23）
  const len = num(p, "len", 0.14);
  const grooveR = num(p, "grooveR", 0.0132); // 拉壳槽外圆
  const parts: THREE.BufferGeometry[] = [];
  // 枪机体（前段粗、后段细）
  const body = latheGeometry(
    [
      [0.0001, 0],
      [r, 0],
      [r, -len * 0.55],
      [r * 0.8, -len * 0.65],
      [r * 0.8, -len],
      [0.0001, -len],
    ],
    20,
  );
  body.rotateX(Math.PI / 2);
  parts.push(body);
  // 拉壳槽（枪机前端外圆上的螺面凹槽——撞针头收在槽里）
  const groove = latheGeometry(
    [
      [grooveR, -0.002],
      [grooveR + 0.0035, -0.006],
      [grooveR, -0.01],
      [r, -0.012],
      [r, -0.03],
      [grooveR, -0.03],
      [grooveR, -0.002],
    ],
    20,
  );
  groove.rotateX(Math.PI / 2);
  parts.push(groove);
  // 抽壳钩（右侧）
  const claw = bevelBoxGeometry(0.003, 0.008, 0.014, 0.0005, 1);
  claw.translate(r - 0.001, 0.0035, -0.008);
  parts.push(claw);
  // 撞针（收进拉壳槽凹槽，随动）
  const pin = cylinderGeometry(0.0016, 0.05, 0.0016, 8);
  pin.rotateX(Math.PI / 2);
  pin.translate(0, 0.0022, -0.03);
  parts.push(pin);
  const merged = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  return merged;
};

// ---------------------------------------------------------------------------
// m2Accelerator —— 加速子（摆臂）：把枪管短后坐能量加速传给枪机。
// 局部系：origin = 摆枢。
// ---------------------------------------------------------------------------
const m2Accelerator: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  void num(p, "armLen", 0.05);
  const parts: THREE.BufferGeometry[] = [];
  // 竖臂（受理端顶枪管延伸部、出力端拍枪机框）
  const arm = bevelBoxGeometry(0.01, 0.026, 0.008, 0.0012, 1);
  arm.translate(0, -0.013, 0);
  parts.push(arm);
  // 上臂端（拍枪机框的锤头）
  const head = bevelBoxGeometry(0.012, 0.01, 0.01, 0.0012, 1);
  head.translate(0, -0.026, 0);
  parts.push(head);
  // 下臂端（顶枪管延伸部加速子槽）
  const foot = bevelBoxGeometry(0.012, 0.01, 0.01, 0.0012, 1);
  foot.translate(0, 0.002, 0);
  parts.push(foot);
  // 摆枢轴
  const pin = cylinderGeometry(0.003, 0.014, 0.003, 8);
  pin.rotateZ(Math.PI / 2);
  parts.push(pin);
  const merged = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  return merged;
};

// ---------------------------------------------------------------------------
// m2TripodLeg —— M3 三脚架单腿（腿管 + 驻锄 + 调节螺）。
// 局部系：origin = 腿根（与架座连接处）。
// ---------------------------------------------------------------------------
const m2TripodLeg: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const legLen = num(p, "legLen", 0.5);
  const tubeR = num(p, "tubeR", 0.013);
  const parts: THREE.BufferGeometry[] = [];
  // 腿管
  const tube = new THREE.CylinderGeometry(tubeR, tubeR * 0.9, legLen, 12);
  tube.rotateX(Math.PI / 2);
  tube.translate(0, 0, legLen / 2);
  parts.push(tube);
  // 驻锄（腿末端横向板）
  const spade = bevelBoxGeometry(0.03, 0.004, 0.09, 0.001, 1);
  spade.rotateX(Math.PI / 2);
  spade.translate(0, -0.002, legLen - 0.01);
  parts.push(spade);
  // 调节螺（腿上部的螺纹段表达）
  const screw = new THREE.CylinderGeometry(tubeR * 0.75, tubeR * 0.75, 0.06, 10);
  screw.rotateX(Math.PI / 2);
  screw.translate(0, 0, legLen * 0.45);
  parts.push(screw);
  const merged = mergeGeometries(parts);
  for (const piece of parts) piece.dispose();
  return merged;
};

// ---------------------------------------------------------------------------
// m2TEWheel —— T&E 手轮（高低/方向机）：带 50 密位刻度齿圈。
// 局部系：origin = 轮心。
// ---------------------------------------------------------------------------
const m2TEWheel: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const r = num(p, "r", 0.045);
  const clicks = Math.round(num(p, "clicks", 24)); // 50 密位刻度数
  const parts: THREE.BufferGeometry[] = [];
  // 轮圈（中空环）
  const rim = latheGeometry(
    [
      [r * 0.55, 0],
      [r, 0],
      [r, 0.012],
      [r * 0.55, 0.012],
      [r * 0.55, 0],
    ],
    24,
  );
  parts.push(rim);
  // 轮辐（4 根）
  for (const angle of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]) {
    const spoke = bevelBoxGeometry(r * 0.9, 0.008, 0.01, 0.001, 1);
    spoke.rotateZ(angle);
    spoke.translate(Math.cos(angle) * r * 0.28, Math.sin(angle) * r * 0.28, 0.006);
    parts.push(spoke);
  }
  // 50 密位刻度齿（轮缘上的小齿——点击手感的来源）
  for (let i = 0; i < clicks; i++) {
    const angle = (i / clicks) * Math.PI * 2;
    const tooth = new THREE.BoxGeometry(0.003, 0.006, 0.01);
    tooth.rotateZ(angle);
    tooth.translate(Math.cos(angle) * r * 1.0, Math.sin(angle) * r * 1.0, 0.006);
    parts.push(tooth);
  }
  const merged = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  return merged;
};

export const m2hbKitBuilders: Record<string, GeometryBuilder> = {
  m2Receiver,
  m2BarrelExtension,
  m2Bolt,
  m2Accelerator,
  m2TripodLeg,
  m2TEWheel,
};

// 引用保留（避免未用告警）
void tubeGeometry;
