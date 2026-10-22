import * as THREE from "three";
import type { GeometryBuilder } from "../../../assembler/geometry";
import {
  bevelBoxGeometry,
  latheGeometry,
  loftGeometry,
  mergeGeometries,
  tubeGeometry,
} from "../../../kernel/geometry";
import { gun7Kits } from "../kits";
import { magSlotTransform } from "./constants";

// ============================================================================
// models/ak47/kits-shell —— 机匣 / 弹匣壳 / 枪托 等板壳结构 kits
//
// 约定（全 ak47 统一）：+Z = 枪口方向、+Y = 上、+X = 右。
//   extrudeFootprint(points, t)  → XZ 平面上的轮廓沿 Y 挤出的板（机匣底板/隔板）
//   extrudeSideWall(points, t)    → YZ 平面上的轮廓沿 X 挤出的板（机匣侧壁）
// 孔洞（弹匣口 / 抛壳窗）用 THREE.Shape holes 表达，挤出后自然贯通。
// ============================================================================

type Params = Record<string, unknown>;

function num(params: Params | undefined, key: string, fallback?: number): number {
  const value = params?.[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (fallback !== undefined) return fallback;
  throw new Error(`ak47 kit：参数 "${key}" 必须是数值（收到 ${String(value)}）`);
}


/** XZ 平面轮廓 → 沿 Y 挤出的板（y 居中，厚 t）。 */
function extrudeFootprint(points: [number, number][], t: number, bevel = 0.0006): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], -points[0][1]);
  for (let i = 1; i < points.length; i++) shape.lineTo(points[i][0], -points[i][1]);
  shape.closePath();
  const inner = Math.max(t - 2 * bevel, 0.0008);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: inner,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 1,
    steps: 1,
    curveSegments: 4,
  });
  geometry.rotateX(-Math.PI / 2); // 局部 +Z → 模型 +Y
  geometry.translate(0, -inner / 2, 0);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/** YZ 平面轮廓 → 沿 X 挤出的板（x 居中，厚 t）。 */
function extrudeSideWall(points: [number, number][], t: number, bevel = 0.0006): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) shape.lineTo(-points[i][0], points[i][1]);
  shape.closePath();
  const inner = Math.max(t - 2 * bevel, 0.0008);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: inner,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 1,
    steps: 1,
    curveSegments: 4,
  });
  geometry.rotateY(Math.PI / 2); // 局部 +Z → 模型 +X
  geometry.translate(-inner / 2, 0, 0);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

// ---------------------------------------------------------------------------
// receiverBody —— AK 冲压/铆接机匣（铣削版外形）：底板 + 弹匣口 + 左右侧壁
//（右壁带抛壳窗）+ 顶部导轨 + 节套座 + 表尺座 + 尾铆。
// 局部系原点 = 枪膛轴（闭锁位弹壳底面）中心，+Z 向枪口。
// ---------------------------------------------------------------------------
const receiverBody: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const w = num(p, "w", 0.042);
  const h = num(p, "h", 0.05);
  const z0 = num(p, "z0", -0.235);
  const z1 = num(p, "z1", 0.055);
  const halfW = w / 2;
  const parts: THREE.BufferGeometry[] = [];

  // 1) 底板（机匣下缘板：XZ 足迹轮廓沿 Y 挤出，含弹匣安装口缺口）
  {
    // shape 坐标：x = 模型 X，y = -模型 Z（挤出后 rotateX(-90°) 映射）
    const shape = new THREE.Shape();
    shape.moveTo(-halfW, -z1);
    shape.lineTo(halfW, -z1);
    shape.lineTo(halfW, -z0);
    shape.lineTo(-halfW, -z0);
    shape.closePath();
    // 弹匣口：左右 ±(halfW-0.005)、z ∈ [-0.075, -0.005]
    const magHole = new THREE.Path();
    magHole.moveTo(-halfW + 0.005, 0.075);
    magHole.lineTo(halfW - 0.005, 0.075);
    magHole.lineTo(halfW - 0.005, 0.005);
    magHole.lineTo(-halfW + 0.005, 0.005);
    magHole.closePath();
    shape.holes.push(magHole);
    const inner = Math.max(0.0016 - 2 * 0.0004, 0.0008);
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: inner,
      bevelEnabled: true,
      bevelThickness: 0.0004,
      bevelSize: 0.0004,
      bevelSegments: 1,
      steps: 1,
      curveSegments: 4,
    });
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(0, -h / 2, 0); // 底板坐在机匣下缘
    parts.push(geometry);
  }

  // 2) 左侧壁（YZ 轮廓：机匣外廓，前端让位给节套）
  {
    const wall = extrudeSideWall(
      [
        [z0, h / 2],
        [z1 - 0.012, h / 2],
        [z1, h / 2 - 0.006],
        [z1, -h / 2 + 0.004],
        [z0, -h / 2 + 0.004],
      ],
      0.0016,
    );
    wall.translate(-(halfW - 0.0008), 0, 0);
    parts.push(wall);
  }
  // 3) 右侧壁（同左）+ 抛壳窗（YZ 上的矩形孔）
  {
    const points: [number, number][] = [
      [z0, h / 2],
      [z1 - 0.012, h / 2],
      [z1, h / 2 - 0.006],
      [z1, -h / 2 + 0.004],
      [z0, -h / 2 + 0.004],
    ];
    const shape = new THREE.Shape();
    shape.moveTo(-points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) shape.lineTo(-points[i][0], points[i][1]);
    shape.closePath();
    // 抛壳窗：z ∈ [portZ0, portZ1]（shape x = -z），高 portH，中心高 portY
    const port = new THREE.Path();
    const pz0 = num(p, "portZ0", -0.075);
    const pz1 = num(p, "portZ1", 0.02);
    const portH = num(p, "portH", 0.055);
    const portY = num(p, "portY", -0.028);
    port.moveTo(-pz0, portY - portH / 2);
    port.lineTo(-pz0, portY + portH / 2);
    port.lineTo(-pz1, portY + portH / 2);
    port.lineTo(-pz1, portY - portH / 2);
    port.closePath();
    shape.holes.push(port);
    const inner = Math.max(0.0016 - 2 * 0.0004, 0.0008);
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: inner,
      bevelEnabled: true,
      bevelThickness: 0.0004,
      bevelSize: 0.0004,
      bevelSegments: 1,
      steps: 1,
      curveSegments: 4,
    });
    geometry.rotateY(Math.PI / 2);
    geometry.translate(halfW - 0.0008, 0, 0);
    parts.push(geometry);
  }

  // 4) 顶部导轨（枪机框滑行导轨，两条，焊/铆在侧壁上缘内侧）
  for (const side of [-1, 1]) {
    const rail = bevelBoxGeometry(0.005, 0.004, z1 - z0 - 0.02, 0.0006, 1);
    rail.translate(side * (halfW - 0.0032), h / 2 - 0.004, (z0 + z1) / 2);
    parts.push(rail);
  }

  // 5) 尾部复进簧支座（空心套：导杆从中间穿过）
  {
    const boss = tubeGeometry(0.009, 0.0072, 0.012, 12);
    boss.rotateX(Math.PI / 2);
    boss.translate(0, 0, z0 + 0.006);
    parts.push(boss);
  }
  return mergeGeometries(parts);
};

// ---------------------------------------------------------------------------
// magazineBody —— 30 发弧形弹匣壳体（AK 香蕉匣）。
// 内部排布见 constants.ts 的 magRoundArc：所有弹轴平行 +Z、弹心沿弧堆叠。
// 壳体沿弧扫出：截面 = 宽 w（X）× 深 depth（沿弧法向 ≈ 弹轴方向）。
// 每段是一个纯立方体盒（盒面恒平行坐标轴，先绕 X 转 -alpha 再平移到弧位）——
// 避免 plate 多次旋转导致的法向错乱。
// ---------------------------------------------------------------------------
const magazineBody: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const w = num(p, "w", 0.03);
  const wallT = num(p, "wallT", 0.0016);
  const backT = num(p, "backT", 0.0022);
  const depth = num(p, "depth", 0.059); // 截面深（沿法向）：56.2 弹长 + 间隙
  const arc = num(p, "arc", 0.198); // 堆叠弧总长（29 发 0.178 + 托弹板/托弹簧行程）
  const segs = Math.round(num(p, "segs", 26));
  const lipSegs = Math.round(num(p, "lipSegs", 3));
  const halfW = w / 2;
  const halfD = depth / 2;
  const parts: THREE.BufferGeometry[] = [];
  const segLen = arc / segs + 0.0008; // 段长 + 搭接
  for (let i = 0; i < segs; i++) {
    const uc = ((i + 0.5) / segs) * arc;
    const { pos, alpha } = magSlotTransform(uc);
    const cos = Math.cos(alpha);
    const sin = Math.sin(alpha);
    // 段坐标系（绕 X 转 90°+alpha：局部 +Y = 弧法向 ≈ 弹轴方向，+Z = 堆叠方向）
    const at = (lx: number, ly: number, lz: number): [number, number, number] => [
      pos[0] + lx,
      pos[1] - ly * sin - lz * cos,
      pos[2] + ly * cos - lz * sin,
    ];
    const add = (bw: number, bh: number, bd: number, lx: number, ly: number, lz: number) => {
      const box = new THREE.BoxGeometry(bw, bh, bd);
      box.rotateX(Math.PI / 2 + alpha);
      const [x, y, z] = at(lx, ly, lz);
      box.translate(x, y, z);
      parts.push(box);
    };
    // 前壁（弹头侧，+法向）/ 后壁（弹底侧，-法向）
    add(w - wallT * 2, wallT, segLen, 0, halfD, 0);
    add(w - wallT * 2, backT, segLen, 0, -halfD, 0);
    // 左右侧壁（厚沿 X）
    for (const side of [-1, 1]) {
      add(wallT, depth - wallT - backT, segLen, side * (halfW - wallT / 2), 0, 0);
    }
    // 抱弹口唇（最上段前壁内卷，托住最上一发弹底缘）
    if (i < lipSegs) {
      add(w - wallT * 2, 0.0032, 0.004, 0, halfD - 0.0014, segLen * 0.28);
    }
  }
  const merged = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  return merged;
};

// ---------------------------------------------------------------------------
// followerPlate —— 托弹板（弧形小平台，随弹匣弧线走）。
// 局部系：origin = 板中心，+Z 为弧切向（指向抱弹口）。
// ---------------------------------------------------------------------------
const followerPlate: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const w = num(p, "w", 0.03);
  const len = num(p, "len", 0.022);
  const t = num(p, "t", 0.0022);
  const lip = num(p, "lip", 0.004);
  const parts: THREE.BufferGeometry[] = [];
  const bed = bevelBoxGeometry(w, t, len, 0.0008, 1);
  parts.push(bed);
  // 两侧导棱（卡在弹匣壁的导槽里）
  for (const side of [-1, 1]) {
    const rib = bevelBoxGeometry(0.0016, t * 2, len * 0.8, 0.0005, 1);
    rib.translate(side * (w / 2 - 0.0008), t * 0.5, 0);
    parts.push(rib);
  }
  // 托弹唇（前端抬起托住弹底）
  const lipGeo = bevelBoxGeometry(w, lip, t, 0.0006, 1);
  lipGeo.translate(0, lip / 2, len / 2 - t);
  parts.push(lipGeo);
  const merged = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  return merged;
};

// ---------------------------------------------------------------------------
// stockWood —— 固定木枪托（YZ 侧面轮廓沿 X 挤出，含拇指孔/贴腮板/底板）。
// 局部系：profile 点在 (z, y)，挤出宽 w（沿 X）。
// ---------------------------------------------------------------------------
const stockWood: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const length = num(p, "length", 0.195);
  const width = num(p, "w", 0.042);
  const drop = num(p, "drop", 0.055);
  const sections = [
    { z: 0.0, width: width * 0.98, top: -0.006, bottom: -drop * 0.82, squareness: 0.58 },
    { z: -length * 0.12, width: width, top: -0.0055, bottom: -drop * 0.9, squareness: 0.6 },
    { z: -length * 0.32, width: width * 0.99, top: -0.006, bottom: -drop * 0.97, squareness: 0.6 },
    { z: -length * 0.55, width: width * 0.97, top: -0.0072, bottom: -drop * 0.95, squareness: 0.58 },
    { z: -length * 0.76, width: width * 0.96, top: -0.0102, bottom: -drop * 0.9, squareness: 0.56 },
    { z: -length * 0.93, width: width * 0.97, top: -0.0122, bottom: -drop * 0.86, squareness: 0.56 },
    { z: -length, width: width * 0.99, top: -0.0135, bottom: -drop * 0.8, squareness: 0.58 },
  ];
  return loftGeometry(sections, 28, true, true);
};;


// ---------------------------------------------------------------------------
// gripWood —— 木质握把（含指槽）。
// 局部系：origin = 握把顶（与机匣结合处），向下延伸 h。
// ---------------------------------------------------------------------------
const gripWood: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const w = num(p, "w", 0.036);
  const h = num(p, "h", 0.075);
  const t = num(p, "t", 0.028);
  const rakeDeg = num(p, "rakeDeg", 18);
  const half = t / 2;
  // 放样沿 -Z 建立（top = 手掌侧，bottom = 手指侧），再整体转成竖直握把。
  const sections = [
    { z: 0, width: w * 0.94, top: half * 0.96, bottom: -half * 0.96, squareness: 0.6 },
    { z: -h * 0.16, width: w * 0.94, top: half * 0.94, bottom: -half * 0.9, squareness: 0.58 },
    { z: -h * 0.3, width: w * 0.96, top: half * 0.9, bottom: -half * 0.78, squareness: 0.55 },
    { z: -h * 0.45, width: w * 0.95, top: half * 0.88, bottom: -half * 0.9, squareness: 0.55 },
    { z: -h * 0.58, width: w * 0.93, top: half * 0.86, bottom: -half * 0.76, squareness: 0.54 },
    { z: -h * 0.74, width: w * 0.93, top: half * 0.86, bottom: -half * 0.86, squareness: 0.54 },
    { z: -h * 0.88, width: w * 0.95, top: half * 0.88, bottom: -half * 0.8, squareness: 0.56 },
    { z: -h, width: w * 0.98, top: half * 0.9, bottom: -half * 0.74, squareness: 0.58 },
  ];
  const grip = loftGeometry(sections, 26, true, true);
  grip.rotateX(-Math.PI / 2); // -Z → -Y（握把竖直向下）
  grip.rotateX(THREE.MathUtils.degToRad(rakeDeg)); // 后倾
  return grip;
};;


// ---------------------------------------------------------------------------
// gasBlockKit —— 导气箍（倾斜导气孔 + 刺刀座基座）。
// 局部系：origin = 箍中心（枪管轴），+Z 枪口方向。
// ---------------------------------------------------------------------------
const gasBlockKit: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const r = num(p, "r", 0.0105); // 箍体半径（坐在枪管上）
  const len = num(p, "len", 0.032); // 箍体长（沿 Z）
  const barrelBore = num(p, "barrelBore", 0.009); // 枪管孔（枪管外径 ⌀17）
  const cylR = num(p, "cylR", 0.0092); // 导气缸内半径（容活塞头 ⌀16.4 + 密封环 ⌀17.2）
  const cylOuter = num(p, "cylOuter", 0.0118); // 导气缸外半径
  const cylY = num(p, "cylY", 0.019); // 导气缸轴线高（枪膛轴上 19mm）
  const cylZ0 = num(p, "cylZ0", -0.024); // 缸后端（开放）
  const cylZ1 = num(p, "cylZ1", 0.014); // 缸前端（封闭端面）
  const portR = num(p, "portR", 0.0022); // 导气孔半径 ⌀4.4
  const parts: THREE.BufferGeometry[] = [];
  // 箍体：套在枪管上的环（外 r、内 barrelBore），前端小锥
  const body = latheGeometry(
    [
      [barrelBore, -len / 2],
      [r, -len / 2],
      [r, len / 2 - 0.001],
      [r * 0.96, len / 2],
      [barrelBore, len / 2],
    ],
    20,
  );
  body.rotateX(Math.PI / 2);
  parts.push(body);
  // 导气缸：后端开口、前端 4mm 封闭端面；轴线 (0, cylY)
  const cylH = cylZ1 - cylZ0 - 0.004;
  const tube = tubeGeometry(cylOuter, cylR, cylH, 18);
  tube.rotateX(Math.PI / 2);
  tube.translate(0, cylY, cylZ0 + 0.002 + cylH / 2);
  parts.push(tube);
  const cap = latheGeometry(
    [
      [cylR, 0],
      [cylOuter, 0],
      [cylOuter, 0.004],
      [cylR, 0.004],
    ],
    18,
  );
  cap.rotateX(Math.PI / 2);
  cap.translate(0, cylY, cylZ1 - 0.002);
  parts.push(cap);
  // 导气孔：枪管膛（⌀7.9）→ 导气缸的竖直通道
  const portH = cylY - cylR - 0.004;
  const port = new THREE.CylinderGeometry(portR, portR, portH, 8);
  port.translate(0, 0.004 + portH / 2, 0);
  parts.push(port);
  // 刺刀座（导气箍下方的榫）
  const lug = bevelBoxGeometry(0.008, 0.012, len * 0.8, 0.0012, 1);
  lug.translate(0, -r - 0.004, 0);
  parts.push(lug);
  const merged = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  return merged;
};

// ---------------------------------------------------------------------------
// trunnionKit —— 节套（枪管与机匣的连接件）：中部凸台 + 闭锁槽窗口。
// 局部系：origin = 节套中心（枪管轴）。
// ---------------------------------------------------------------------------
const trunnionKit: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const r = num(p, "r", 0.013);
  const len = num(p, "len", 0.08);
  const lugBore = num(p, "lugBore", 0.0124); // 尾段：枪机头 + 闭锁凸笋沉孔
  const chamberR = num(p, "chamberR", 0.0052); // 中段：弹膛（容弹壳）
  const barrelBore = num(p, "barrelBore", 0.009); // 前段：接纳枪管尾（压配）
  const parts: THREE.BufferGeometry[] = [];
  // 阶梯孔：尾段（凸笋沉台）→ 中段（弹膛）→ 前段（枪管压配孔）
  const body = latheGeometry(
    [
      [r, -len / 2],
      [r, len / 2 - 0.003],
      [r * 0.94, len / 2],
      [barrelBore, len / 2 - 0.001],
      [barrelBore, len * 0.08],
      [chamberR, len * 0.08],
      [chamberR, -len * 0.18],
      [lugBore, -len * 0.26],
      [lugBore, -len / 2 + 0.001],
    ],
    20,
  );
  body.rotateX(Math.PI / 2);
  parts.push(body);
  const merged = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  return merged;
};

// ---------------------------------------------------------------------------
// boltCarrierKit —— 枪机框（含活塞接合面、导转凸榫槽、复进簧座）。
// 局部系：origin = 枪机框后端面中心，+Z 指向枪口。
// ---------------------------------------------------------------------------
const boltCarrierKit: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const len = num(p, "len", 0.172);
  const r = num(p, "r", 0.0125);
  const boreR = num(p, "boreR", 0.0078);
  const springR = num(p, "springR", 0.0102); // 尾段簧腔内径
  const parts: THREE.BufferGeometry[] = [];
  const frontLen = len * 0.55; // 前段（枪机通道）长 94.6mm（底部让位窗从这里开始）
  // 前段外筒（整圆）
  const outer = new THREE.CylinderGeometry(r, r, frontLen, 20);
  outer.rotateX(Math.PI / 2);
  outer.translate(0, 0, frontLen / 2);
  parts.push(outer);
  // 前段内壁（整圆：枪机身在膛内滑动；底窗会让 BVH 奇偶测验误判，取消）
  // 前端面环（枪机头伸出孔）
  const frontRing = latheGeometry(
    [
      [boreR, 0],
      [r, 0],
      [r, -0.0012],
      [boreR, -0.0012],
    ],
    20,
  );
  frontRing.rotateX(Math.PI / 2);
  frontRing.translate(0, 0, 0.0006);
  parts.push(frontRing);
  // 尾段台阶环（整圆：枪机孔 → 簧腔）
  const step = latheGeometry(
    [
      [boreR, frontLen],
      [boreR, frontLen + 0.0104],
      [springR, frontLen + 0.0104],
      [springR, frontLen + 0.0104],
    ],
    20,
  );
  step.rotateX(Math.PI / 2);
  parts.push(step);
  // 尾段外壁 / 内腔：底部 120° 让位窗（弹匣供弹位 + 击锤伸入打击针）
  const rearLen = len - frontLen - 0.0104;
  const slot = (140 * Math.PI) / 180; // 让位窗：击锤鼻从弹匣下方伸入打击针（鼻角约 63°）
  const rearOuter = new THREE.CylinderGeometry(r, r, rearLen, 20, 1, true, slot / 2, Math.PI * 2 - slot);
  rearOuter.rotateX(Math.PI / 2);
  rearOuter.translate(0, 0, frontLen + 0.0104 + rearLen / 2);
  parts.push(rearOuter);
  const rearBore = new THREE.CylinderGeometry(springR, springR, rearLen, 18, 1, true, slot / 2, Math.PI * 2 - slot);
  rearBore.rotateX(Math.PI / 2);
  rearBore.translate(0, 0, frontLen + 0.0104 + rearLen / 2);
  parts.push(rearBore);
  // 尾端面环（弹簧从这里穿出）
  const rearRing = latheGeometry(
    [
      [springR, 0],
      [r, 0],
      [r, -0.0012],
      [springR, -0.0012],
    ],
    20,
  );
  rearRing.rotateX(Math.PI / 2);
  rearRing.translate(0, 0, len);
  parts.push(rearRing);
  // 导转凸榫（枪机回转的导向销，左右各一）
  for (const side of [-1, 1]) {
    const cam = bevelBoxGeometry(0.0035, 0.006, 0.016, 0.0005, 1);
    cam.translate(side * (r - 0.001), 0.0045, len - 0.02);
    parts.push(cam);
  }
  // 拉机柄（机框右侧的柄）
  const handle = bevelBoxGeometry(0.006, 0.01, 0.02, 0.0012, 1);
  handle.translate(r + 0.002, 0.002, len * 0.15);
  parts.push(handle);
  // 复进簧座（尾部容纳导杆的沉台）
  const seat = tubeGeometry(0.0098, 0.0058, 0.014, 12);
  seat.rotateX(Math.PI / 2);
  seat.translate(0, 0, -0.006);
  parts.push(seat);
  // 待击引导面（机框下方的突起，复进时压过击锤完成待击）
  const cock = bevelBoxGeometry(0.008, 0.006, 0.014, 0.0008, 1);
  cock.translate(0, -r + 0.002, len * 0.8);
  parts.push(cock);
  // 活塞结合座（顶部杯形座：活塞杆尾插入其中，0.1mm 滑动间隙）
  const cup = tubeGeometry(0.0085, 0.0046, 0.02, 14);
  cup.rotateX(Math.PI / 2);
  cup.translate(0, 0.0175, len - 0.016);
  parts.push(cup);
  const merged = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  return merged;
};

// ---------------------------------------------------------------------------
// boltHeadKit —— 枪机头（双闭锁凸笋 + 击针孔 + 抽壳钩座 + 弹底窝）。
// 局部系：origin = 枪机前端面中心，+Z 枪口方向（几何整体沿 -Z 展开，
// 即前端面在 z=0、尾部在 z=-len——与「枪机在枪机框内、前端面顶弹壳」一致）。
// ---------------------------------------------------------------------------
const boltHeadKit: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const len = num(p, "len", 0.062);
  const r = num(p, "r", 0.0075);
  const pinR = num(p, "pinR", 0.0025); // 击针通孔（弹底窝半径由 r 决定）
  const parts: THREE.BufferGeometry[] = [];
  // 剖面沿 -Z 展开：前端面 z=0、尾部 z=-len；中心通孔供击针通过
  const body = latheGeometry(
    [
      [0.0001, 0],
      [r, 0],
      [r, -(len - 0.003)],
      [r * 0.82, -len],
      [pinR, -len],
      [pinR, 0],
    ],
    18,
  );
  body.rotateX(Math.PI / 2);
  parts.push(body);
  // 抽壳钩座导轨（右侧的小凸台，钩爪沿它滑行）
  const ex = bevelBoxGeometry(0.003, 0.005, 0.016, 0.0005, 1);
  ex.translate(r - 0.0005, 0.0025, -len * 0.45);
  parts.push(ex);
  const merged = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  return merged;
};

// ---------------------------------------------------------------------------
// receiverShell —— 全宽机匣顶盖 + 下机匣发射机侧板：正常状态把枪机框、
// 复进簧、导轨和击锤/扳机簧全部盖住；顶盖后端让开表尺座，前端止于节套。
// 局部系：origin = 枪膛轴线中心，+Z 向枪口。
// ---------------------------------------------------------------------------
const receiverShell: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const w = num(p, "w", 0.046);
  const h = num(p, "h", 0.034);
  const z0 = num(p, "z0", -0.223);
  const z1 = num(p, "z1", 0.052);
  const t = num(p, "t", 0.0024);
  const parts: THREE.BufferGeometry[] = [];

  // 顶盖：拱形冲压壳（下方开口），圆角截面 + 顶部压筋。
  const cover = gun7Kits.stampedShell({
    ...(spec as object),
    params: {
      w,
      top: h,
      bottom: h - 0.028,
      z0,
      z1,
      wall: t,
      squareness: 0.6,
      gapStart: 3.5,
      gapEnd: 5.9,
      ribCount: 2,
      ribDepth: 0.0016,
      ribWidth: 0.0055,
      ribTop: h + 0.0008,
      ribBottom: h + 0.0008,
      ribZ0: z0 + 0.016,
      ribZ1: z1 - 0.012,
    },
  } as never, {} as never);
  parts.push(cover);

  // 顶盖后端卡榫座 + 前端压边（真实顶盖是扣在机匣上的冲压件）
  const latch = bevelBoxGeometry(0.014, 0.006, 0.012, 0.0006, 1);
  latch.translate(0, h + 0.001, z0 + 0.014);
  parts.push(latch);
  const frontLip = bevelBoxGeometry(w * 0.96, 0.008, t, 0.0005, 1);
  frontLip.translate(0, h - 0.006, z1 - t / 2);
  parts.push(frontLip);
  const rearLip = bevelBoxGeometry(w * 0.98, 0.014, t, 0.0005, 1);
  rearLip.translate(0, h - 0.010, z0 + t / 2);
  parts.push(rearLip);

  // 下机匣/发射机侧板：从机匣下缘伸到击锤簧下方，包住击发机构；
  // 前端停在弹匣井后方，底边留空让扳机/护圈露出。
  const lowerH = 0.056;
  const lowerZ0 = -0.150;
  const lowerZ1 = -0.040;
  for (const side of [-1, 1]) {
    const lower = bevelBoxGeometry(t, lowerH, lowerZ1 - lowerZ0, 0.0005, 1);
    lower.translate(side * (w / 2 - t / 2), -0.061, (lowerZ0 + lowerZ1) / 2);
    parts.push(lower);
    // 冲压加强筋：两条横向浅凸台
    for (const y of [-0.046, -0.07]) {
      const rib = bevelBoxGeometry(0.0022, 0.004, lowerZ1 - lowerZ0 - 0.014, 0.0004, 1);
      rib.translate(side * (w / 2 + 0.0007), y, (lowerZ0 + lowerZ1) / 2);
      parts.push(rib);
    }
    // 铆钉：扳机销/弹匣卡笋的真实铆钉头
    for (const z of [-0.132, -0.112]) {
      const rivet = bevelBoxGeometry(0.0018, 0.005, 0.005, 0.0004, 1);
      rivet.translate(side * (w / 2 + 0.0009), -0.084, z);
      parts.push(rivet);
    }
    const boss = bevelBoxGeometry(0.0032, 0.008, 0.008, 0.0004, 1);
    boss.translate(side * (w / 2 + 0.0008), -0.067, -0.128);
    parts.push(boss);
  }

  const merged = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  return merged;
};;


const shellKitBuilders: Record<string, GeometryBuilder> = {
  receiverBody,
  receiverShell,
  magazineBody,
  followerPlate,
  stockWood,
  gripWood,
  gasBlockKit,
  trunnionKit,
  boltCarrierKit,
  boltHeadKit,
};

export { shellKitBuilders, extrudeFootprint, extrudeSideWall };
