import * as THREE from "three";
import type { GeometryBuilder } from "../../assembler/geometry";
import {
  bevelBoxGeometry,
  cylinderGeometry,
  latheGeometry,
  mergeGeometries,
  tubeGeometry,
} from "../../kernel/geometry";
import { gun7Kits } from "../guns7/kits";

type Params = Record<string, unknown>;

function num(params: Params | undefined, key: string, fallback?: number): number {
  const value = params?.[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (fallback !== undefined) return fallback;
  throw new Error(`m2hb kit：参数 "${key}" 必须是数值（收到 ${String(value)}）`);
}

// ---------------------------------------------------------------------------
// m2ReceiverShroud —— M2HB 外接收器壳：圆角 U 形冲压管 + 弧形前后顶板 +
// 枪管前支撑环 + 铆钉列 + 弹箱挂座。把外露的枪机/加速子/供弹机构全部
// 包在铆接壳体里；中段供弹口由大供弹盖单独封住。侧壁、底板、上沿是连续
// 冲压折弯，不是左右平板 + 平板顶盖拼出来的盒子。
// 局部系：origin = 枪膛中心，+Z 枪口方向。
// ---------------------------------------------------------------------------
const m2ReceiverShroud: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const w = num(p, "w", 0.078);
  const h = num(p, "h", 0.092);
  const z0 = num(p, "z0", -0.365);
  const z1 = num(p, "z1", 0.07);
  const t = num(p, "t", 0.003);
  const len = z1 - z0;
  const zc = (z0 + z1) / 2;
  const top = h / 2;
  const feedZ0 = -0.31;
  const feedZ1 = -0.01;
  const parts: THREE.BufferGeometry[] = [];

  // U 形圆角冲压壳体：外轮廓圆角、等壁厚、顶部留出 60mm 供弹开口。
  const body = gun7Kits.roundedUShell({
    ...(spec as object),
    params: {
      w,
      top,
      bottom: -h / 2,
      z0,
      z1,
      wall: t,
      topGap: 0.030,
      cornerR: 0.012,
    },
  } as never, {} as never);
  parts.push(body);

  // 侧壁纵向压筋 + 上下两排铆钉 + 圆形检查盖
  for (const side of [-1, 1]) {
    const rib = bevelBoxGeometry(0.0018, 0.008, len * 0.7, 0.0003, 1);
    rib.translate(side * (w / 2 + 0.0007), -0.008, zc + 0.015);
    parts.push(rib);
    const rib2 = bevelBoxGeometry(0.0016, 0.005, len * 0.52, 0.0003, 1);
    rib2.translate(side * (w / 2 + 0.0005), 0.018, zc + 0.028);
    parts.push(rib2);
    const plug = new THREE.CylinderGeometry(0.010, 0.010, 0.002, 16);
    plug.rotateZ(Math.PI / 2);
    plug.translate(side * (w / 2 + 0.0005), -0.010, -0.215);
    parts.push(plug);
    const plugRing = new THREE.TorusGeometry(0.011, 0.0012, 6, 20);
    plugRing.rotateY(Math.PI / 2);
    plugRing.translate(side * (w / 2 + 0.0007), -0.010, -0.215);
    parts.push(plugRing);
    for (const y of [-0.032, 0.032]) {
      for (let i = 0; i < 7; i++) {
        const z = z0 + 0.035 + i * 0.058;
        if (z > z1 - 0.012) continue;
        const rivet = new THREE.CylinderGeometry(0.0026, 0.0026, 0.0015, 8);
        rivet.rotateZ(Math.PI / 2);
        rivet.translate(side * (w / 2 + 0.0008), y, z);
        parts.push(rivet);
      }
    }
  }

  // 尾板：封闭后端并把缓冲器座铆在上面
  const rear = bevelBoxGeometry(w - 0.001, h - 0.001, t, 0.004, 2);
  rear.translate(0, 0, z0 + t / 2);
  parts.push(rear);

  // 前后固定顶板：弧形冲压件，中段留供弹口给大盖。
  for (const [a, b] of [[z0, feedZ0], [feedZ1, z1]] as const) {
    const plate = gun7Kits.archedCover({
      ...(spec as object),
      params: {
        w: w - 0.0004,
        len: b - a,
        zc: (a + b) / 2,
        yBase: top - 0.001,
        yTop: top + 0.005,
        wall: t,
        sag: 0.005,
        humpW: 0,
        rib: 1,
        rivetCount: 3,
      },
    } as never, {} as never);
    parts.push(plate);
  }

  // 前端枪管支撑环 / 节套法兰（凸出前脸，避免正面变成一块大平板）
  const collar = tubeGeometry(0.034, 0.016, 0.038, 28);
  collar.rotateX(Math.PI / 2);
  collar.translate(0, 0, z1 - 0.004);
  parts.push(collar);
  const trunnion = tubeGeometry(0.026, 0.016, 0.012, 24);
  trunnion.rotateX(Math.PI / 2);
  trunnion.translate(0, 0, z1 + 0.020);
  parts.push(trunnion);

  // 侧板检查窗压边已改为冲压压筋 + 圆形检查盖（见上方循环），不再贴大平板。

  // 尾端缓冲器座（后板外侧的圆法兰）
  const buffer = new THREE.CylinderGeometry(0.020, 0.020, 0.014, 20);
  buffer.rotateX(Math.PI / 2);
  buffer.translate(0, 0.004, z0 - 0.006);
  parts.push(buffer);

  // 左侧弹箱挂座
  const bracket = bevelBoxGeometry(0.020, 0.014, 0.055, 0.0008, 1);
  bracket.translate(-(w / 2 + 0.009), -0.018, -0.25);
  parts.push(bracket);

  // 供弹盖铰链耳座：坐在机匣后上沿，与机盖铰链销同轴
  for (const side of [-1, 1]) {
    const ear = bevelBoxGeometry(0.009, 0.010, 0.016, 0.0008, 1);
    ear.translate(side * (w / 2 - 0.009), 0.044, feedZ0 + 0.002);
    parts.push(ear);
  }

  const merged = mergeGeometries(parts);
  for (const piece of parts) piece.dispose();
  return merged;
};

// ---------------------------------------------------------------------------
// m2FeedCoverShell —— M2HB 大供弹盖：横向弧形冲压盖 + 中央受弹器凸包 +
// 两侧下裙边 + 铰链/前端卡榫；正常状态把弹链/供弹滑块完全盖住。
// 旧版是 14mm 厚的平板盒；现在拱面、裙边和凸包都有连续曲面。
// 局部系：origin = 枪膛中心，几何按模型坐标布置。
// ---------------------------------------------------------------------------
const m2FeedCoverShell: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const w = num(p, "w", 0.078);
  const len = num(p, "len", 0.300);
  const zc = num(p, "zc", -0.162);
  const yBase = num(p, "yBase", 0.040);
  const yTop = num(p, "yTop", 0.064);
  const parts: THREE.BufferGeometry[] = [];

  const cover = gun7Kits.archedCover({
    ...(spec as object),
    params: {
      w,
      len,
      zc,
      yBase,
      yTop,
      wall: 0.0024,
      sag: 0.012,
      humpW: 0.042,
      humpH: 0.013,
      humpD: len * 0.60,
      rib: 1,
      rivetCount: 6,
    },
  } as never, {} as never);
  parts.push(cover);

  // 后铰链轴：横穿盖尾和机匣耳座
  const hinge = new THREE.CylinderGeometry(0.0045, 0.0045, w + 0.006, 12);
  hinge.rotateZ(Math.PI / 2);
  hinge.translate(0, 0.044, zc - len / 2 + 0.004);
  parts.push(hinge);
  // 前卡榫：盖前端锁在机匣上
  const latch = bevelBoxGeometry(0.020, 0.013, 0.014, 0.0008, 1);
  latch.translate(0, 0.042, zc + len / 2 - 0.004);
  parts.push(latch);
  const frontLip = bevelBoxGeometry(w, 0.004, 0.010, 0.002, 1);
  frontLip.translate(0, yBase + 0.001, zc + len / 2 - 0.008);
  parts.push(frontLip);

  const merged = mergeGeometries(parts);
  for (const piece of parts) piece.dispose();
  return merged;
};

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
// m2TripodLeg —— M3 三脚架单腿：冲压 U 形槽钢腿 + 夹箍/调节螺栓 + 驻锄。
// 旧版是圆管；M3 的腿是开口 U 形冲压件，外壁带折边和纵向压筋。
// 局部系：origin = 腿根（与架座连接处），+Z 沿腿长。
// ---------------------------------------------------------------------------
const m2TripodLeg: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const legLen = num(p, "legLen", 0.5);
  const tubeR = num(p, "tubeR", 0.013);
  const width = num(p, "width", tubeR * 2.31);
  const depth = num(p, "depth", tubeR * 2.0);
  const wall = num(p, "wall", 0.0024);
  return gun7Kits.uChannelLeg({
    ...(spec as object),
    params: { legLen, width, depth, wall },
  } as never, {} as never);
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
  m2ReceiverShroud,
  m2FeedCoverShell,
  m2Receiver,
  m2BarrelExtension,
  m2Bolt,
  m2Accelerator,
  m2TripodLeg,
  m2TEWheel,
};

// 引用保留（避免未用告警）
void tubeGeometry;
