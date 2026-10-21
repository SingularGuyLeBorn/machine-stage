import * as THREE from "three";
import type { GeometryBuilder } from "../../../assembler/geometry";
import {
  bevelBoxGeometry,
  cylinderGeometry,
  latheGeometry,
  mergeGeometries,
  tubeGeometry,
} from "../../../kernel/geometry";

type Params = Record<string, unknown>;

function num(params: Params | undefined, key: string, fallback?: number): number {
  const value = params?.[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (fallback !== undefined) return fallback;
  throw new Error(`m249 kit：参数 "${key}" 必须是数值（收到 ${String(value)}）`);
}

// ---------------------------------------------------------------------------
// sawReceiver —— M249 冲压机匣：矩管 + 顶部长条受弹托盘 + 尾部发射机座。
// 局部系：origin = 枪膛中心（与 constants 原点一致），+Z 枪口方向。
// ---------------------------------------------------------------------------
const sawReceiver: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const w = num(p, "w", 0.046);
  const h = num(p, "h", 0.052);
  const z0 = num(p, "z0", -0.24); // 尾端
  const z1 = num(p, "z1", 0.09); // 前端（枪管延伸部接口）
  const parts: THREE.BufferGeometry[] = [];
  // 主矩管（四块板拼的冲压壳体，用一块外壳表达）
  const shell = new THREE.BoxGeometry(w, h, z1 - z0);
  shell.translate(0, 0, (z0 + z1) / 2);
  parts.push(shell);
  // 顶部受弹托盘（长条板：弹链通道，前到抱弹口）
  const trayY = num(p, "trayY", 0.019);
  const tray = new THREE.BoxGeometry(w * 0.92, 0.003, 0.09);
  tray.translate(0, trayY + 0.0015, -0.015);
  parts.push(tray);
  // 托盘两侧抱弹唇（前段内卷）
  for (const side of [-1, 1]) {
    const lip = new THREE.BoxGeometry(0.0016, 0.008, 0.09);
    lip.translate(side * (w * 0.44), trayY + 0.005, -0.015);
    parts.push(lip);
  }
  // 尾部发射机座（向下延的厚座，握把/击发机构挂在下面）
  const gripFrame = new THREE.BoxGeometry(w * 0.8, 0.03, 0.05);
  gripFrame.translate(0, -h / 2 - 0.012, -0.135);
  parts.push(gripFrame);
  // 枪托接口（尾端上方的耳片）
  const stockLug = new THREE.BoxGeometry(0.02, 0.014, 0.03);
  stockLug.translate(0, 0.012, z0 + 0.012);
  parts.push(stockLug);
  // 弹链输入口（机匣后上方的斜口，链从弹盒上来）
  const chute = new THREE.BoxGeometry(0.024, 0.01, 0.04);
  chute.rotateX(-0.5);
  chute.translate(0, h / 2 + 0.004, -0.075);
  parts.push(chute);
  const merged = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  return merged;
};

// ---------------------------------------------------------------------------
// sawStock —— M249 管状枪托（钢管 + 肩托板 + 背带环）。
// 局部系：origin = 枪托前端面中心。
// ---------------------------------------------------------------------------
const sawStock: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const tubeR = num(p, "tubeR", 0.011);
  const tubeLen = num(p, "tubeLen", 0.17);
  const parts: THREE.BufferGeometry[] = [];
  const tube = new THREE.CylinderGeometry(tubeR, tubeR, tubeLen, 14);
  tube.rotateX(Math.PI / 2);
  tube.translate(0, -0.004, -tubeLen / 2);
  parts.push(tube);
  // 肩托板
  const butt = bevelBoxGeometry(0.03, 0.07, 0.012, 0.002, 1);
  butt.translate(0, -0.03, -tubeLen - 0.004);
  parts.push(butt);
  // 托底板（防滑纹用横向沟槽块表达）
  for (let i = 0; i < 3; i++) {
    const groove = new THREE.BoxGeometry(0.031, 0.004, 0.001);
    groove.translate(0, -0.012 - i * 0.014, -tubeLen - 0.0095);
    parts.push(groove);
  }
  // 背带环（尾端左侧）
  const loop = new THREE.TorusGeometry(0.006, 0.0012, 6, 12);
  loop.rotateY(Math.PI / 2);
  loop.translate(-0.018, -0.03, -tubeLen * 0.6);
  parts.push(loop);
  const merged = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  return merged;
};

// ---------------------------------------------------------------------------
// sawCarryHandle —— M249 枪管提把（含导气箍座/准星座）：快换枪管的提把。
// 局部系：origin = 提把座中心（坐在枪管上）。
// ---------------------------------------------------------------------------
const sawCarryHandle: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const r = num(p, "r", 0.0105); // 座半径（坐在枪管上）
  const len = num(p, "len", 0.05); // 座长
  const parts: THREE.BufferGeometry[] = [];
  // 座（套在枪管上的环，中空）
  const base = latheGeometry(
    [
      [0.0082, -len / 2],
      [r, -len / 2],
      [r, len / 2 - 0.001],
      [r * 0.9, len / 2],
      [0.0082, len / 2],
      [0.0082, -len / 2],
    ],
    18,
  );
  base.rotateX(Math.PI / 2);
  parts.push(base);
  // 提把弓（向上弯的板）
  const bow = bevelBoxGeometry(0.006, 0.006, 0.036, 0.0012, 1);
  bow.rotateX(-0.35);
  bow.translate(0, 0.026, 0.004);
  parts.push(bow);
  const bowTip = bevelBoxGeometry(0.008, 0.02, 0.008, 0.001, 1);
  bowTip.translate(0, 0.04, 0.018);
  parts.push(bowTip);
  // 准星柱（座前端上方）
  const post = latheGeometry(
    [
      [0.0022, 0],
      [0.0022, 0.012],
      [0.004, 0.019],
      [0.0001, 0.019],
    ],
    10,
  );
  post.rotateX(Math.PI / 2);
  post.translate(0, r, len / 2 - 0.006);
  parts.push(post);
  const merged = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  return merged;
};

// ---------------------------------------------------------------------------
// sawAmmoBox —— 200 发弹链箱（挂在机匣下方左侧的方盒 + 链出口）。
// 局部系：origin = 箱体顶面中心。
// ---------------------------------------------------------------------------
const sawAmmoBox: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const w = num(p, "w", 0.088);
  const h = num(p, "h", 0.058);
  const d = num(p, "d", 0.13);
  const parts: THREE.BufferGeometry[] = [];
  const box = new THREE.BoxGeometry(w, h, d);
  box.translate(0, -h / 2, 0);
  parts.push(box);
  // 箱盖棱（两条加强筋）
  for (const side of [-1, 1]) {
    const rib = new THREE.BoxGeometry(0.004, 0.004, d);
    rib.translate(side * (w / 2 - 0.008), -h / 2 + 0.004, 0);
    parts.push(rib);
  }
  // 链出口（前上方的斜嘴）
  const mouth = new THREE.BoxGeometry(0.03, 0.012, 0.02);
  mouth.rotateX(0.4);
  mouth.translate(0, 0.002, d / 2 - 0.01);
  parts.push(mouth);
  // 挂钩（箱顶的锁扣耳）
  const lug = new THREE.BoxGeometry(0.03, 0.01, 0.014);
  lug.translate(0, 0.006, -d / 4);
  parts.push(lug);
  const merged = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  return merged;
};

// ---------------------------------------------------------------------------
// sawBipod —— M249 两脚架（竖肋 + 两腿，腿可折叠——折起状态建模）。
// 局部系：origin = 脚架座中心（护木前下）。
// ---------------------------------------------------------------------------
const sawBipod: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const legLen = num(p, "legLen", 0.16);
  const spread = num(p, "spread", 22); // 张开角（度）
  const parts: THREE.BufferGeometry[] = [];
  // 座（抱在护木下的套）
  const mount = latheGeometry(
    [
      [0.0204, 0],
      [0.024, 0],
      [0.024, 0.016],
      [0.0204, 0.016],
      [0.0204, 0],
    ],
    14,
  );
  mount.rotateX(Math.PI / 2);
  mount.translate(0, 0, -0.008);
  parts.push(mount);
  // 两腿（向两侧前方张开）
  for (const side of [-1, 1]) {
    const leg = new THREE.CylinderGeometry(0.0035, 0.003, legLen, 8);
    leg.rotateZ(side * THREE.MathUtils.degToRad(spread - 90));
    leg.translate(side * 0.022, -0.012 - legLen * 0.45, 0.02);
    parts.push(leg);
    // 脚爪
    const foot = new THREE.CylinderGeometry(0.006, 0.0035, 0.008, 8);
    foot.translate(side * 0.05, -0.014 - legLen * 0.9, 0.03);
    parts.push(foot);
  }
  const merged = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  return merged;
};

// ---------------------------------------------------------------------------
// sawGasRegulator —— 导气箍（M249 两档导气调节器：普通/大量）。
// 局部系：origin = 箍体中心（坐在枪管上）。
// ---------------------------------------------------------------------------
const sawGasRegulator: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const r = num(p, "r", 0.0095);
  const len = num(p, "len", 0.042);
  const parts: THREE.BufferGeometry[] = [];
  // 箍体（套在枪管上，中空）
  const body = latheGeometry(
    [
      [0.0082, -len / 2],
      [r, -len / 2],
      [r, len / 2 - 0.001],
      [r * 0.92, len / 2],
      [0.0082, len / 2],
      [0.0082, -len / 2],
    ],
    18,
  );
  body.rotateX(Math.PI / 2);
  parts.push(body);
  // 调节手柄（右侧的拨把，两个档位Visible）
  const handle = bevelBoxGeometry(0.008, 0.014, 0.01, 0.001, 1);
  handle.translate(r - 0.001, 0, 0.008);
  parts.push(handle);
  // 导气孔（向上通枪管）
  const port = new THREE.CylinderGeometry(0.0019, 0.0019, 0.006, 8);
  port.translate(0, 0.006, -0.004);
  parts.push(port);
  // 活塞缸（顶部容纳活塞头）
  const cyl = tubeGeometry(0.0056, 0.0045, len * 0.8, 14);
  cyl.rotateX(Math.PI / 2);
  cyl.translate(0, 0.014, 0);
  parts.push(cyl);
  const merged = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  return merged;
};

export const m249KitBuilders: Record<string, GeometryBuilder> = {
  sawReceiver,
  sawStock,
  sawCarryHandle,
  sawAmmoBox,
  sawBipod,
  sawGasRegulator,
};

// cylinderGeometry/tubeGeometry 供未来扩展保留引用（避免未用告警的占位）
void cylinderGeometry;
void tubeGeometry;
