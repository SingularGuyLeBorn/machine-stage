import * as THREE from "three";
import {
  airfoilGeometry,
  bevelBoxGeometry,
  louverGeometry,
  mergeGeometries,
  panelTextures,
  rivetStripGeometry,
} from "./detailKit";
import type { CodeCharacter } from "./types";

// 歼-20 威龙：纯代码程序化模型（真实比例建模，展示时整体缩放）。
// 方向约定：机头朝 +Z，+Y 向上，原点位于三点式起落架着地的停机位。
// 尺寸按真机（公开资料近似值，全部按米建模）：
//   · 机长 20.4 m（放样 z: -10.2 尾端面 ~ +10.2 雷达罩尖）、翼展 13.0 m（翼尖 x=±6.5）
//   · 机身最大半宽 2.06 m（z=-1 站位）、最大高度 1.56 m（yb 1.26 ~ yt 2.82）
//   · 鸭翼：根部弦 2.9 m、展长 1.55 m、下反 5.7°；主翼：根弦 8.0 m、翼尖弦 1.5 m、
//     前缘后掠约 45°；全动垂尾：根弦 4.62 m、高 1.72 m、外倾 21.8°；腹鳍斜置 134.6°
//   · 前起落架轮 φ0.72 m、主起落架轮 φ0.88 m（前后主轮 z=-2.3、前轮 z=5.6）
//   · DSI 进气道唇口椭圆 1.29 m × 0.97 m，鼓包长半轴 0.95 m；喷口出口 φ1.10 m
// 零件清单（装配顺序，命名见代码）：机身放样（58 环向点 × ~0.2 m 站位）/ 雷达罩+空速管+
//   AoA 传感器 / EOTS+EODAS 光电窗 / 蒙皮口盖+板缝+铆钉列+背脊天线+放气百叶 / 座舱盖
//   （玻璃+框管+后铰链+作动筒+后视镜）/ 座舱内装（地板侧壁+仪表台三屏+平显+弹射座椅+
//   侧杆+双油门+脚舵+飞行员）/ 鸭翼×2（翼型+前缘包边+根部加强板）/ 主翼×2（翼型+襟副翼+
//   副翼+铰链整流罩+翼根融合整流罩+静电刷+翼尖吊舱+低可视圆徽）/ DSI 进气道×2（唇口+
//   鼓包+内腔环肋+放气门）/ 全动垂尾×2（翼型+包边+根部整流+贴花）/ 腹鳍×2 / 尾喷管×2
//   （18 片锯齿收敛花瓣+作动环+作动杆+内衬）/ 起落架（前架 12 件+主架 16 件+舱门内衬+
//   铰链+作动筒+刹车盘+轮毂螺栓）/ 腹部武器舱门（缝线+铰链+作动器）/ 翼下挂架（±2）/
//   PL-15 ×2 / 烟团 ×14 / 爆点 ×2 / 加力焰 ×4。
// 物理（3 条真正会计算的方程 + 真实常量）：
//   ① 滑跑加速 a = (T - D - μ(W-L))/m，T 取一阶滞后 spool-up（τ≈2.6 s，WS-10C 加力 142 kN）。
//   ② 盘旋坡度滚转 ψ̇ = g·tanφ / V（V=250 m/s、φ=0.44 rad → 转弯半径 ~3.2 km）。
//   ③ 喷管节流环面积 A8 ∝ T^0.5：加力焰长 L = 3.4·(T_AB/T_ref)（焰锥几何按此缩放）。
// 主角数字：加力推力 142 kN（双发）、推重比 ~1.05、最大速度 M2.0、升限 20 km。
// 可破坏点：DSI 唇口吸入异物打伤风扇（进气道内腔环肋即为此设计）、起落架舱门未锁死。
//
// 反积木合规（docs/MACHINE_STYLE.md 第 9 节）：机身 58 环向点 Catmull-Rom 放样（剪影与原
//   27 环站不解剖一致）+ 沿站切板 + 铆钉列 + 口盖 / 百叶 / 天线；机翼 / 鸭翼 / 垂尾 / 腹鳍
//   全部 NACA 翼型（尖后缘）；主翼带铰链坐标系襟副翼与翼根融合整流；大面涂装接
//   panelTextures 三联贴图（板缝 / 铆钉 / 油渍流痕，见 skinPanelSet / greyPanelSet /
//   darkPanelSet）；新增细节件统一 detailKit 微倒角盒体。

const LEN = 20.4; // 机身总长
const HALF = LEN / 2; // 半长（z: -10.2 尾 ~ +10.2 机头）
const GROUND = 0; // 停机时轮胎触地面
const DISPLAY_SCALE = 0.215; // 展示缩放 ≈ 4.4m 机身

// ---------- 关键帧小工具 ----------
const posKeys = (name: string, times: number[], values: number[][]) =>
  new THREE.NumberKeyframeTrack(`${name}.position`, times, values.flat());
const scaleKeys = (name: string, times: number[], values: number[][]) =>
  new THREE.NumberKeyframeTrack(`${name}.scale`, times, values.flat());
const quatKeys = (name: string, times: number[], eulers: number[][]) => {
  const values: number[] = [];
  const euler = new THREE.Euler();
  const quat = new THREE.Quaternion();
  for (const item of eulers) {
    euler.set(item[0], item[1], item[2], "YXZ");
    quat.setFromEuler(euler);
    values.push(quat.x, quat.y, quat.z, quat.w);
  }
  return new THREE.QuaternionKeyframeTrack(`${name}.quaternion`, times, values);
};
const numKeys = (target: string, times: number[], values: number[]) =>
  new THREE.NumberKeyframeTrack(target, times, values);

// 姿态：从朝向 + 俯仰 + 滚转组合四元数（飞机机头为 +Z 的 YXZ 顺序）。
const poseEuler = (dir: THREE.Vector3, pitch: number, roll: number) => {
  const yaw = Math.atan2(dir.x, dir.z);
  return [pitch, yaw, roll];
};

// 简易确定性伪随机（迷彩斑块/杂项用，保证每次构建一致）。
const rand = (() => {
  let seed = 20110111;
  return () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
})();

// ============================================================================
// 增密工具（docs/MACHINE_STYLE.md 第 9 节反积木红线）
//   · 放样加密：Catmull-Rom 采样（control 点原样保留 → 剪影不变，消灭大平面）
//   · 机身表面采样：任意 z / 环向位置取点与法线（口盖 / 板缝 / 铆钉贴合用）
//   · 翼面工具：NACA 翼型实体（尖后缘 / 铰链坐标系 / 自检翻面）
//   · 贴合板件：沿解析曲面抬升的薄板（包边 / 口盖 / 贴花，杜绝悬空）
// ============================================================================

const clamp01 = (u: number) => (u < 0 ? 0 : u > 1 ? 1 : u);
const lerpN = (a: number, b: number, t: number) => a + (b - a) * t;

// Catmull-Rom 采样折线：控制点 j 落在第 j*steps 个采样点上（纹理 u 映射依赖这一点）。
function catmullRomChain(points: readonly [number, number][], steps: number): [number, number][] {
  const at = (index: number) => points[Math.max(0, Math.min(points.length - 1, index))];
  const out: [number, number][] = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    for (let s = 0; s < steps; s += 1) {
      const t = s / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push([
        0.5 *
          (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 *
          (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  const last = points[points.length - 1];
  out.push([last[0], last[1]]);
  return out;
}

// ---------- 机身截面：原 8 点轮廓 → Catmull-Rom 加密（棱线处重复点保住折角） ----------
// 轮廓控制点（与原模型一字不差）：底部中心 → 右舷棱线(chine) → 顶部中心。
const PROFILE_CONTROLS: [number, number][] = [
  [0, 0],
  [0.46, 0.1],
  [0.8, 0.34],
  [0.99, 0.56], // 棱线（sharp）
  [0.86, 0.74],
  [0.6, 0.88],
  [0.28, 0.98],
  [0, 1],
];
const PROFILE_STEPS = 5; // 每段 5 个采样（原控制点索引 × 5 保留）
const DENSE_HALF: [number, number][] = (() => {
  const chain = catmullRomChain(PROFILE_CONTROLS, PROFILE_STEPS);
  const chineIndex = 3 * PROFILE_STEPS;
  const dense: [number, number][] = [];
  for (let index = 0; index < chain.length; index += 1) {
    dense.push(chain[index]);
    if (index === chineIndex) dense.push([chain[index][0], chain[index][1]]); // 棱线重复点：法线在此劈开
  }
  return dense;
})();
const RING = DENSE_HALF.length * 2 - 2; // 环向点数（58 环向 × 站位）

// 旧皮肤纹理按 14 点环绘制；此映射把加密环的环向索引折算回旧 14 点环的 u 坐标，
// 保证老迷彩斑块 / 棱线高亮带 / 编号标识落在原角向位置（标识不走形）。
function skinU(index: number): number {
  const oldIndex = (j: number) => (j - (j > 3 * PROFILE_STEPS ? 1 : 0)) / PROFILE_STEPS;
  if (index <= RING / 2) return oldIndex(index) / 14;
  return 1 - oldIndex(RING - index) / 14;
}

// 座舱开口下挖权重（按轮廓 y 分数，与原模型在控制点处完全一致：0.74→0 / 0.88→0.15 / 0.98→0.55 / 1→1）。
function dipWeight(fy: number): number {
  if (fy <= 0.74) return 0;
  if (fy >= 1) return 1;
  if (fy <= 0.88) return ((fy - 0.74) / 0.14) * 0.15;
  if (fy <= 0.98) return 0.15 + ((fy - 0.88) / 0.1) * 0.4;
  return 0.55 + ((fy - 0.98) / 0.02) * 0.45;
}

// 每个站位给半宽 w、底/顶高度 yb/yt；dip 为座舱开口顶部中央下挖深度。
interface Station {
  z: number;
  w: number;
  yb: number;
  yt: number;
  dip?: number;
}

// 站位加密：沿站位序号做 Catmull-Rom（原站位值原样保留，间距 ~0.2 m）。
function densifyStations(stations: readonly Station[], steps: number): Station[] {
  const chain = (get: (station: Station) => number) =>
    catmullRomChain(
      stations.map((station, index) => [index, get(station)] as [number, number]),
      steps,
    ).map((item) => item[1]);
  const zs = chain((s) => s.z);
  const ws = chain((s) => s.w);
  const ybs = chain((s) => s.yb);
  const yts = chain((s) => s.yt);
  const dips = chain((s) => s.dip ?? 0);
  return zs.map((z, index) => ({
    z,
    w: ws[index],
    yb: ybs[index],
    yt: yts[index],
    dip: Math.max(dips[index], 0),
  }));
}

// 环向点：index ∈ [0, RING)，0 = 底部中心（右舷上行 → 顶部中心 → 左舷下行）。
function fuselageRingPoint(station: Station, index: number, out: THREE.Vector3): THREE.Vector3 {
  const half = DENSE_HALF.length;
  let fx: number;
  let fy: number;
  if (index < half) {
    fx = DENSE_HALF[index][0];
    fy = DENSE_HALF[index][1];
  } else {
    const mirrored = DENSE_HALF[RING - index];
    fx = -mirrored[0];
    fy = mirrored[1];
  }
  let y = station.yb + (station.yt - station.yb) * fy;
  const dip = station.dip ?? 0;
  if (dip > 0) y -= dip * dipWeight(fy);
  out.set(fx * station.w, y, station.z);
  return out;
}

// 加密后的机身放样（54+ 环向点 × ~100 站位，剪影与旧 14 环点一致）。
function buildFuselageGeometry(stations: readonly Station[]): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const scratch = new THREE.Vector3();
  for (let s = 0; s < stations.length; s += 1) {
    for (let i = 0; i < RING; i += 1) {
      fuselageRingPoint(stations[s], i, scratch);
      positions.push(scratch.x, scratch.y, scratch.z);
      uvs.push(skinU(i), (stations[s].z + HALF) / LEN);
    }
  }
  for (let s = 0; s < stations.length - 1; s += 1) {
    for (let i = 0; i < RING; i += 1) {
      const next = (i + 1) % RING;
      const a = s * RING + i;
      const b = s * RING + next;
      const c = (s + 1) * RING + next;
      const d = (s + 1) * RING + i;
      indices.push(a, b, c, a, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

// 机身表面采样：任意 z（米）与环向浮点位置取外表面点。
function fuselageSurface(z: number, ringPos: number, stations: readonly Station[], out: THREE.Vector3): THREE.Vector3 {
  let index = 0;
  for (let i = 0; i < stations.length - 1; i += 1) {
    if (z >= stations[i].z && z <= stations[i + 1].z) {
      index = i;
      break;
    }
  }
  const low = stations[index];
  const high = stations[Math.min(index + 1, stations.length - 1)];
  const span = Math.max(high.z - low.z, 1e-6);
  const t = clamp01((z - low.z) / span);
  const mixed: Station = {
    z,
    w: lerpN(low.w, high.w, t),
    yb: lerpN(low.yb, high.yb, t),
    yt: lerpN(low.yt, high.yt, t),
    dip: lerpN(low.dip ?? 0, high.dip ?? 0, t),
  };
  const wrapped = ((ringPos % RING) + RING) % RING;
  const i0 = Math.floor(wrapped);
  const frac = wrapped - i0;
  const a = fuselageRingPoint(mixed, i0 % RING, new THREE.Vector3());
  const b = fuselageRingPoint(mixed, (i0 + 1) % RING, new THREE.Vector3());
  return out.lerpVectors(a, b, frac);
}

// 机身外法线（有限差分 + 背向轴线取向）。
function fuselageNormal(z: number, ringPos: number, stations: readonly Station[], out: THREE.Vector3): THREE.Vector3 {
  const p = fuselageSurface(z, ringPos, stations, new THREE.Vector3());
  const pz = fuselageSurface(z + 0.04, ringPos, stations, new THREE.Vector3());
  const pmz = fuselageSurface(z - 0.04, ringPos, stations, new THREE.Vector3());
  const pr = fuselageSurface(z, ringPos + 0.6, stations, new THREE.Vector3());
  const pmr = fuselageSurface(z, ringPos - 0.6, stations, new THREE.Vector3());
  const dz = pz.sub(pmz);
  const dr = pr.sub(pmr);
  out.crossVectors(dr, dz).normalize();
  const low = stations[0];
  const centerY = (low.yb + low.yt) / 2;
  if (out.y * (p.y - centerY) + out.x * p.x < 0) out.negate();
  return out;
}

// ---------- 翼面工具：NACA 翼型实体 ----------
interface WingPlan {
  rootX: number; // 翼根展向位置（|x|，米）
  tipX: number; // 翼尖展向位置
  leRoot: number; // 翼根前缘 z
  leTip: number;
  teRoot: number; // 翼根后缘 z
  teTip: number;
  thickRoot: number; // 厚度比（根部）
  thickTip: number; // 厚度比（翼尖）
  dihedral?: number; // 每米展长抬升（正=上反，米/米）
  baseY?: number;
}

const nacaHalf = (t: number) => {
  const x = clamp01(t);
  return 5 * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4);
};
const planXAt = (plan: WingPlan, s: number) => lerpN(plan.rootX, plan.tipX, clamp01(s));
const planLE = (plan: WingPlan, s: number) => lerpN(plan.leRoot, plan.leTip, clamp01(s));
const planTE = (plan: WingPlan, s: number) => lerpN(plan.teRoot, plan.teTip, clamp01(s));
const planChord = (plan: WingPlan, s: number) => planLE(plan, s) - planTE(plan, s);
const planThick = (plan: WingPlan, s: number) => lerpN(plan.thickRoot, plan.thickTip, clamp01(s));

// 翼面点：s ∈ [0,1] 展向，t ∈ [0,1] 弦向（0 前缘）；sign=±1 取上/下表面；scale 缩厚度。
function planPoint(plan: WingPlan, side: number, s: number, t: number, sign: number, scale: number, out: THREE.Vector3): THREE.Vector3 {
  const sc = clamp01(s);
  const tc = clamp01(t);
  const chord = planChord(plan, sc);
  const y =
    (plan.baseY ?? 0) +
    sign * nacaHalf(tc) * planThick(plan, sc) * chord * scale +
    sc * (plan.dihedral ?? 0) * Math.abs(plan.tipX - plan.rootX);
  return out.set(side * planXAt(plan, sc), y, planLE(plan, sc) - tc * chord);
}

// 翼面外法线（解析差分；side=±1 / sign=±1 全兼容）。
function planNormal(plan: WingPlan, side: number, s: number, t: number, sign: number, out: THREE.Vector3): THREE.Vector3 {
  const e = 0.01;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const d = new THREE.Vector3();
  planPoint(plan, side, s + e, t, sign, 1, c);
  planPoint(plan, side, s - e, t, sign, 1, d);
  a.subVectors(c, d);
  planPoint(plan, side, s, t + e, sign, 1, c);
  planPoint(plan, side, s, t - e, sign, 1, d);
  b.subVectors(c, d);
  out.crossVectors(a, b).normalize().multiplyScalar(side * sign);
  return out;
}

// 铰链坐标系：绕 y 偏转 yaw 后绕 x 即沿铰链轴（Flaperon/Aileron 用）。
interface HingeFrame {
  ox: number;
  oy: number;
  oz: number;
  yaw: number; // 弧度：u = (cos yaw, 0, -sin yaw)
}
const hingeFrameTransform = (frame: HingeFrame, p: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 => {
  const cf = Math.cos(frame.yaw);
  const sf = Math.sin(frame.yaw);
  const dx = p.x - frame.ox;
  const dz = p.z - frame.oz;
  return out.set(dx * cf - dz * sf, p.y - frame.oy, dx * sf + dz * cf);
};
const hingeFrameDirection = (frame: HingeFrame, v: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 => {
  const cf = Math.cos(frame.yaw);
  const sf = Math.sin(frame.yaw);
  return out.set(v.x * cf - v.z * sf, v.y, v.x * sf + v.z * cf);
};

// 三角面手动翻面（自检用）。
function reverseTriangles(indices: number[], start: number, count: number): void {
  for (let k = start; k < start + count; k += 3) {
    const swap = indices[k + 1];
    indices[k + 1] = indices[k + 2];
    indices[k + 2] = swap;
  }
}

// 翼型实体：上/下表面 + 铰链面 + 翼根/翼尖端面，逐部件法线自检翻面。
interface AirfoilSolidOptions {
  s0?: number;
  s1?: number;
  t0?: number;
  t1?: number;
  spanSteps?: number;
  chordSteps?: number;
  scale?: number;
  capRoot?: boolean;
  capTip?: boolean;
  frame?: HingeFrame;
}
function buildAirfoilSolid(plan: WingPlan, side: number, options: AirfoilSolidOptions = {}): THREE.BufferGeometry {
  const s0 = options.s0 ?? 0;
  const s1 = options.s1 ?? 1;
  const t0 = options.t0 ?? 0;
  const t1 = options.t1 ?? 1;
  const spanSteps = options.spanSteps ?? 24;
  const chordSteps = options.chordSteps ?? 16;
  const scale = options.scale ?? 1;
  const frame = options.frame;
  const positions: number[] = [];
  const uvs: number[] = [];
  const scratch = new THREE.Vector3();
  const transformed = new THREE.Vector3();
  const pushPoint = (s: number, t: number, sign: number) => {
    planPoint(plan, side, s, t, sign, scale, scratch);
    if (frame) hingeFrameTransform(frame, scratch, transformed);
    else transformed.copy(scratch);
    positions.push(transformed.x, transformed.y, transformed.z);
    uvs.push(scratch.z, scratch.x);
    return positions.length / 3 - 1;
  };
  const rows = (sign: number) => {
    const grid: number[][] = [];
    for (let i = 0; i <= spanSteps; i += 1) {
      const s = lerpN(s0, s1, i / spanSteps);
      const row: number[] = [];
      for (let j = 0; j <= chordSteps; j += 1) {
        row.push(pushPoint(s, lerpN(t0, t1, j / chordSteps), sign));
      }
      grid.push(row);
    }
    return grid;
  };
  const upper = rows(1);
  const lower = rows(-1);
  const parts: { indices: number[]; expected: THREE.Vector3 }[] = [];
  const partIndex = () => {
    const indices: number[] = [];
    const expected = new THREE.Vector3();
    parts.push({ indices, expected });
    return parts[parts.length - 1];
  };
  const sm = (s0 + s1) / 2;
  const tm = (t0 + t1) / 2;
  const upperPart = partIndex();
  planNormal(plan, side, sm, tm, 1, upperPart.expected);
  const lowerPart = partIndex();
  planNormal(plan, side, sm, tm, -1, lowerPart.expected);
  for (let i = 0; i < spanSteps; i += 1) {
    for (let j = 0; j < chordSteps; j += 1) {
      const u00 = upper[i][j];
      const u10 = upper[i + 1][j];
      const u11 = upper[i + 1][j + 1];
      const u01 = upper[i][j + 1];
      upperPart.indices.push(u00, u10, u11, u00, u11, u01);
      const l00 = lower[i][j];
      const l10 = lower[i + 1][j];
      const l11 = lower[i + 1][j + 1];
      const l01 = lower[i][j + 1];
      lowerPart.indices.push(l00, l10, l11, l00, l11, l01);
    }
  }
  // 铰链面 / 端面
  if (t0 > 0.002 && scale > 0.02) {
    const hingePart = partIndex();
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    planPoint(plan, side, sm, t0 + 0.01, 1, scale, a);
    planPoint(plan, side, sm, t0 - 0.01, 1, scale, b);
    hingePart.expected.subVectors(b, a).normalize(); // 朝前缘
    if (frame) hingeFrameDirection(frame, hingePart.expected, hingePart.expected);
    for (let i = 0; i < spanSteps; i += 1) {
      hingePart.indices.push(upper[i][0], upper[i + 1][0], lower[i + 1][0], upper[i][0], lower[i + 1][0], lower[i][0]);
    }
  }
  const capPart = (sAt: number, outwardSign: number) => {
    const cap = partIndex();
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    planPoint(plan, side, sAt + 0.01, tm, 1, scale, a);
    planPoint(plan, side, sAt - 0.01, tm, 1, scale, b);
    cap.expected.subVectors(a, b).normalize().multiplyScalar(outwardSign);
    if (frame) hingeFrameDirection(frame, cap.expected, cap.expected);
    const row = sAt === s1 ? spanSteps : 0;
    for (let j = 0; j < chordSteps; j += 1) {
      cap.indices.push(upper[row][j], upper[row][j + 1], lower[row][j + 1], upper[row][j], lower[row][j + 1], lower[row][j]);
    }
  };
  if (options.capRoot ?? true) capPart(s0, -1);
  if (options.capTip ?? true) capPart(s1, 1);
  // 装配 + 逐部件朝向自检：翻转朝内的部件。
  const indices: number[] = [];
  const vertexAt = (index: number, out: THREE.Vector3) => out.set(positions[index * 3], positions[index * 3 + 1], positions[index * 3 + 2]);
  const p0 = new THREE.Vector3();
  const p1 = new THREE.Vector3();
  const p2 = new THREE.Vector3();
  const faceNormal = new THREE.Vector3();
  for (const part of parts) {
    const start = indices.length;
    indices.push(...part.indices);
    vertexAt(part.indices[0], p0);
    vertexAt(part.indices[1], p1);
    vertexAt(part.indices[2], p2);
    faceNormal.subVectors(p1, p0).cross(p2.clone().sub(p0));
    if (faceNormal.dot(part.expected) < 0) reverseTriangles(indices, start, part.indices.length);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

// ---------- 贴合板件：沿解析曲面抬升的薄板（包边 / 口盖 / 贴花） ----------
interface PatchSurface {
  point: (u: number, v: number, out: THREE.Vector3) => THREE.Vector3;
  normal: (u: number, v: number, out: THREE.Vector3) => THREE.Vector3;
  uv: (u: number, v: number) => [number, number];
  texScale?: number;
}
interface PatchOptions {
  u0: number;
  u1: number;
  v0: number;
  v1: number;
  uSteps?: number;
  vSteps?: number;
  lift?: number;
  thickness?: number;
}
function buildConformingPatch(surface: PatchSurface, options: PatchOptions): THREE.BufferGeometry {
  const uSteps = options.uSteps ?? 10;
  const vSteps = options.vSteps ?? 3;
  const lift = options.lift ?? 0.004;
  const thickness = options.thickness ?? 0.012;
  const positions: number[] = [];
  const uvs: number[] = [];
  const scratch = new THREE.Vector3();
  const scratchN = new THREE.Vector3();
  const emit = (u: number, v: number, offset: number) => {
    surface.point(u, v, scratch);
    surface.normal(u, v, scratchN);
    positions.push(scratch.x + scratchN.x * offset, scratch.y + scratchN.y * offset, scratch.z + scratchN.z * offset);
    const uvPair = surface.uv(u, v);
    uvs.push(uvPair[0], uvPair[1]);
    return positions.length / 3 - 1;
  };
  const outer: number[][] = [];
  const inner: number[][] = [];
  for (let i = 0; i <= uSteps; i += 1) {
    const u = lerpN(options.u0, options.u1, i / uSteps);
    const outerRow: number[] = [];
    const innerRow: number[] = [];
    for (let j = 0; j <= vSteps; j += 1) {
      const v = lerpN(options.v0, options.v1, j / vSteps);
      outerRow.push(emit(u, v, lift + thickness));
      innerRow.push(emit(u, v, lift));
    }
    outer.push(outerRow);
    inner.push(innerRow);
  }
  const parts: { indices: number[]; expected: THREE.Vector3 }[] = [];
  const partIndex = () => {
    const indices: number[] = [];
    parts.push({ indices, expected: new THREE.Vector3() });
    return parts[parts.length - 1];
  };
  const um = (options.u0 + options.u1) / 2;
  const vm = (options.v0 + options.v1) / 2;
  const outerPart = partIndex();
  surface.normal(um, vm, outerPart.expected);
  const innerPart = partIndex();
  surface.normal(um, vm, innerPart.expected).negate();
  for (let i = 0; i < uSteps; i += 1) {
    for (let j = 0; j < vSteps; j += 1) {
      outerPart.indices.push(outer[i][j], outer[i + 1][j], outer[i + 1][j + 1], outer[i][j], outer[i + 1][j + 1], outer[i][j + 1]);
      innerPart.indices.push(inner[i][j], inner[i + 1][j], inner[i + 1][j + 1], inner[i][j], inner[i + 1][j + 1], inner[i][j + 1]);
    }
  }
  const rim = (edge: "u0" | "u1" | "v0" | "v1") => {
    const part = partIndex();
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    if (edge === "u0" || edge === "u1") {
      const u = edge === "u0" ? options.u0 : options.u1;
      surface.point(u, vm + 0.01, a);
      surface.point(u, vm - 0.01, b);
      part.expected.subVectors(b, a).normalize();
      if (edge === "u1") part.expected.negate();
    } else {
      const v = edge === "v0" ? options.v0 : options.v1;
      surface.point(um + 0.01, v, a);
      surface.point(um - 0.01, v, b);
      part.expected.subVectors(b, a).normalize();
      if (edge === "v1") part.expected.negate();
    }
    const count = edge === "u0" || edge === "u1" ? vSteps : uSteps;
    for (let k = 0; k < count; k += 1) {
      const oa = edge === "u0" || edge === "u1" ? outer[edge === "u0" ? 0 : uSteps][k] : outer[k][edge === "v0" ? 0 : vSteps];
      const ob = edge === "u0" || edge === "u1" ? outer[edge === "u0" ? 0 : uSteps][k + 1] : outer[k + 1][edge === "v0" ? 0 : vSteps];
      const ia = edge === "u0" || edge === "u1" ? inner[edge === "u0" ? 0 : uSteps][k] : inner[k][edge === "v0" ? 0 : vSteps];
      const ib = edge === "u0" || edge === "u1" ? inner[edge === "u0" ? 0 : uSteps][k + 1] : inner[k + 1][edge === "v0" ? 0 : vSteps];
      part.indices.push(oa, ob, ib, oa, ib, ia);
    }
  };
  rim("u0");
  rim("u1");
  rim("v0");
  rim("v1");
  const indices: number[] = [];
  const vertexAt = (index: number, out: THREE.Vector3) => out.set(positions[index * 3], positions[index * 3 + 1], positions[index * 3 + 2]);
  const q0 = new THREE.Vector3();
  const q1 = new THREE.Vector3();
  const q2 = new THREE.Vector3();
  const faceNormal = new THREE.Vector3();
  for (const part of parts) {
    const start = indices.length;
    indices.push(...part.indices);
    vertexAt(part.indices[0], q0);
    vertexAt(part.indices[1], q1);
    vertexAt(part.indices[2], q2);
    faceNormal.subVectors(q1, q0).cross(q2.clone().sub(q0));
    if (faceNormal.dot(part.expected) < 0) reverseTriangles(indices, start, part.indices.length);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

// 翼面解析曲面（供包边 / 口盖 / 铆钉贴合）：u=展向, v=弦向。
function wingPatchSurface(plan: WingPlan, side: number, sign: number, baseY = 0, texScale = 0.4): PatchSurface {
  const oriented: WingPlan = baseY === 0 ? plan : { ...plan, baseY };
  return {
    point: (u, v, out) => planPoint(oriented, side, u, v, sign, 1, out),
    normal: (u, v, out) => planNormal(oriented, side, u, v, sign, out),
    uv: (u, v) => [planXAt(oriented, u) - oriented.rootX, planLE(oriented, u) - v * planChord(oriented, u)],
    texScale,
  };
}

// 机身解析曲面（供口盖 / 板缝 / 铆钉贴合）：u=z, v=环向浮点位置。
function fuselagePatchSurface(stations: readonly Station[], lift = 0): PatchSurface {
  return {
    point: (u, v, out) => {
      fuselageSurface(u, v, stations, out);
      if (lift !== 0) {
        const n = fuselageNormal(u, v, stations, new THREE.Vector3());
        out.addScaledVector(n, lift);
      }
      return out;
    },
    normal: (u, v, out) => fuselageNormal(u, v, stations, out),
    uv: (u, v) => [u / 4, v / RING],
  };
}

// ---------- 铆钉 / 螺栓 / 合并小件 ----------
// 单颗铆钉（半球，按法线取向）。
function rivetDotGeometry(position: THREE.Vector3, normal: THREE.Vector3, radius: number): THREE.BufferGeometry {
  const dot = new THREE.SphereGeometry(radius, 5, 3, 0, Math.PI * 2, 0, Math.PI / 2);
  const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
  dot.applyQuaternion(quaternion);
  dot.translate(position.x, position.y, position.z);
  return dot;
}

// 螺栓圈（六角头圆柱，围绕 axis 方向排列）。
function boltCircleGeometries(count: number, ringRadius: number, boltRadius: number, axis: THREE.Vector3, center: THREE.Vector3): THREE.BufferGeometry[] {
  const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis.clone().normalize());
  const basisA = new THREE.Vector3(1, 0, 0).applyQuaternion(quaternion);
  const basisB = new THREE.Vector3(0, 0, 1).applyQuaternion(quaternion);
  const list: THREE.BufferGeometry[] = [];
  for (let i = 0; i < count; i += 1) {
    const angle = (i / count) * Math.PI * 2;
    const bolt = new THREE.CylinderGeometry(boltRadius, boltRadius, boltRadius * 1.7, 6);
    bolt.applyQuaternion(quaternion);
    const c = center
      .clone()
      .addScaledVector(basisA, Math.cos(angle) * ringRadius)
      .addScaledVector(basisB, Math.sin(angle) * ringRadius);
    bolt.translate(c.x, c.y, c.z);
    list.push(bolt);
  }
  return list;
}

// 合并一个细节组为单网格（源几何释放；命名保留逻辑装配单位）。
function mergeInto(
  parent: THREE.Object3D,
  parts: THREE.BufferGeometry[],
  material: THREE.Material,
  name: string,
  shadow = true,
): THREE.Mesh | null {
  if (parts.length === 0) return null;
  const merged = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  const mesh = new THREE.Mesh(merged, material);
  mesh.name = name;
  if (shadow) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  }
  parent.add(mesh);
  return mesh;
}

// 放样条带：rows[i][k] 网格，朝 expected 方向自检翻面（翼身融合整流罩等）。
function buildLoftStrip(rows: THREE.Vector3[][], expected: THREE.Vector3, uvScale = 0.4): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (const row of rows) {
    for (const point of row) {
      positions.push(point.x, point.y, point.z);
      uvs.push(point.z * uvScale, point.x * uvScale);
    }
  }
  const width = rows[0].length;
  for (let i = 0; i < rows.length - 1; i += 1) {
    for (let k = 0; k < width - 1; k += 1) {
      const a = i * width + k;
      const b = (i + 1) * width + k;
      const c = (i + 1) * width + k + 1;
      const d = i * width + k + 1;
      indices.push(a, b, c, a, c, d);
    }
  }
  const vertexAt = (index: number, out: THREE.Vector3) => out.set(positions[index * 3], positions[index * 3 + 1], positions[index * 3 + 2]);
  const p0 = new THREE.Vector3();
  const p1 = new THREE.Vector3();
  const p2 = new THREE.Vector3();
  vertexAt(indices[0], p0);
  vertexAt(indices[1], p1);
  vertexAt(indices[2], p2);
  const faceNormal = p1.clone().sub(p0).cross(p2.clone().sub(p0));
  if (faceNormal.dot(expected) < 0) reverseTriangles(indices, 0, indices.length);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

// 灰色低可视迷彩 + 面板线蒙皮色图（贴合机身 UV：x=环向, y=纵向, 机头在 y 大端）。
// 直接绘制到 panelTextures 三联贴图的色图上：板缝 / 铆钉 / 油渍流痕由三联贴图提供，
// 迷彩 / 棱线高亮带 / 战术编号叠加在其上（反积木红线 #6：大面积涂装 = map + roughnessMap + bumpMap）。
function paintSkinMap(canvas: HTMLCanvasElement) {
  const size = canvas.width;
  const ctx = canvas.getContext("2d")!;
  // 迷彩斑块直接叠加在 panelTextures 底色 + 板缝网格之上。
  // 上表面迷彩斑块：用低对比深灰画不规则多边形。
  for (let i = 0; i < 130; i += 1) {
    const px = 210 + rand() * 620;
    const py = (0.18 + rand() * 0.66) * size;
    const radius = 18 + rand() * 78;
    const shade = rand() < 0.55 ? "#5f656c" : "#838a91";
    ctx.fillStyle = shade;
    ctx.globalAlpha = 0.5 + rand() * 0.3;
    ctx.beginPath();
    const corners = 5 + Math.floor(rand() * 4);
    for (let corner = 0; corner <= corners; corner += 1) {
      const angle = (corner / corners) * Math.PI * 2;
      const wobble = 0.55 + rand() * 0.75;
      const cx = px + Math.cos(angle) * radius * 0.55 * wobble;
      const cy = py + Math.sin(angle) * radius * 1.9 * wobble;
      if (corner === 0) ctx.moveTo(cx, cy);
      else ctx.lineTo(cx, cy);
    }
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  // 棱线（chine）浅灰高亮带：环向 u≈0.286 / 0.714。
  ctx.fillStyle = "#a8adb1";
  ctx.globalAlpha = 0.85;
  ctx.fillRect(0.272 * size, 0, 0.028 * size, size);
  ctx.fillRect(0.7 * size, 0, 0.028 * size, size);
  ctx.globalAlpha = 1;
  // 雷达罩（机头段）整体略深，罩后浅灰环带。
  const radomeY = 0.815 * size;
  const gradient = ctx.createLinearGradient(0, radomeY, 0, size);
  gradient.addColorStop(0, "rgba(60,66,72,0.55)");
  gradient.addColorStop(1, "rgba(70,76,82,0.75)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, radomeY, size, size - radomeY);
  ctx.fillStyle = "rgba(200,205,208,0.75)";
  ctx.fillRect(0, radomeY - 5, size, 5);
  // 防眩板（风挡前深灰棱角面板，仅上表面）。
  ctx.fillStyle = "rgba(48,53,58,0.92)";
  ctx.beginPath();
  ctx.moveTo(0.42 * size, 0.7 * size);
  ctx.lineTo(0.58 * size, 0.7 * size);
  ctx.lineTo(0.61 * size, 0.795 * size);
  ctx.lineTo(0.39 * size, 0.795 * size);
  ctx.closePath();
  ctx.fill();
  // 纵向长桁线（细竖线）。
  ctx.strokeStyle = "rgba(40,44,49,0.35)";
  ctx.lineWidth = 1.5;
  for (let line = 0; line < 14; line += 1) {
    const u = line / 14;
    ctx.beginPath();
    ctx.moveTo(u * size, 0.1 * size);
    ctx.lineTo(u * size, 0.97 * size);
    ctx.stroke();
  }
  // 环向面板缝（细横线，机头段更密）。
  for (let v = 0.03; v < 1; v += 0.022) {
    const dense = v > 0.62 ? 1.25 : 1;
    ctx.strokeStyle = `rgba(46,50,55,${v > 0.8 ? 0.3 : 0.22})`;
    ctx.lineWidth = 0.8 * dense;
    ctx.beginPath();
    ctx.moveTo(0, v * size);
    ctx.lineTo(size, v * size);
    ctx.stroke();
  }
  // 战术编号（后机身两侧）与机型小字（机头两侧）：文字沿机身纵向、两侧读向各自正确。
  ctx.fillStyle = "rgba(216,220,223,0.9)";
  ctx.textAlign = "center";
  const numberCenter = 0.951 * size;
  const numberHalf = 42;
  ctx.font = "bold 26px sans-serif";
  ctx.save();
  ctx.translate(0.305 * size, numberCenter - numberHalf);
  ctx.rotate(Math.PI / 2);
  ctx.fillText("82101", 0, 0);
  ctx.restore();
  ctx.save();
  ctx.translate(0.695 * size, numberCenter + numberHalf);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText("82101", 0, 0);
  ctx.restore();
  const typeCenter = 0.17 * size;
  ctx.font = "bold 18px sans-serif";
  ctx.save();
  ctx.translate(0.31 * size, typeCenter - 26);
  ctx.rotate(Math.PI / 2);
  ctx.fillText("歼-20", 0, 0);
  ctx.restore();
  ctx.save();
  ctx.translate(0.69 * size, typeCenter + 26);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText("歼-20", 0, 0);
  ctx.restore();
}

// ---------- 机身放样 ----------
// 站位与截面轮廓见上方“增密工具”段：DENSE_HALF（37 点半剖面，Catmull-Rom 加密，
// 剪影与原 14 环点一致）+ densifyStations（~0.2 m 站位）。此处仅保留数据结构定义。

// 座舱屏显内容（多功能显示器）：姿态/地图/武器页三种页面。
function makeMfdTexture(page: number) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 200;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#05130c";
  ctx.fillRect(0, 0, 256, 200);
  ctx.strokeStyle = "#38ff9a";
  ctx.fillStyle = "#38ff9a";
  ctx.lineWidth = 2;
  ctx.font = "bold 14px monospace";
  if (page === 0) {
    // 姿态页：地平线 + 俯仰梯 + 速度/高度带。
    ctx.strokeRect(6, 6, 244, 188);
    ctx.save();
    ctx.translate(128, 100);
    ctx.beginPath();
    ctx.moveTo(-90, 0);
    ctx.lineTo(90, 0);
    ctx.stroke();
    for (let step = -4; step <= 4; step += 1) {
      const y = step * 14;
      const width = step === 0 ? 90 : 44;
      ctx.beginPath();
      ctx.moveTo(-width, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    ctx.restore();
    ctx.beginPath();
    ctx.moveTo(104, 100);
    ctx.lineTo(128, 84);
    ctx.lineTo(152, 100);
    ctx.stroke();
    ctx.fillText("M 1.6", 22, 32);
    ctx.fillText("TAS 420", 22, 54);
    ctx.fillText("ALT 11000", 160, 32);
    ctx.fillText("G 1.0", 176, 184);
  } else if (page === 1) {
    // 地图页：网格 + 航路线 + 目标符号。
    for (let line = 0; line <= 8; line += 1) {
      ctx.globalAlpha = 0.4;
      ctx.beginPath();
      ctx.moveTo(line * 32, 0);
      ctx.lineTo(line * 32, 200);
      ctx.moveTo(0, line * 25);
      ctx.lineTo(256, line * 25);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.moveTo(30, 160);
    ctx.lineTo(96, 120);
    ctx.lineTo(170, 96);
    ctx.lineTo(226, 48);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(226, 48, 8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(128, 96);
    ctx.lineTo(128, 116);
    ctx.lineTo(136, 106);
    ctx.closePath();
    ctx.fill();
    ctx.fillText("WPT 3", 120, 150);
  } else {
    // 武器页：挂架状态与弹药余量。
    ctx.strokeRect(6, 6, 244, 188);
    ctx.fillText("STORE", 16, 30);
    for (let row = 0; row < 4; row += 1) {
      ctx.strokeRect(16, 42 + row * 34, 150, 26);
      ctx.fillText(row % 2 === 0 ? "PL-15 x2" : "PL-10 x2", 24, 60 + row * 34);
      ctx.fillStyle = "#0a2a1a";
      ctx.fillRect(176, 42 + row * 34, 60, 26);
      ctx.fillStyle = "#38ff9a";
      ctx.fillText("RDY", 188, 60 + row * 34);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// 平显 HUD 玻璃符号（绿色透射式显示）。
function makeHudTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 160;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, 256, 160);
  ctx.strokeStyle = "#6bffb0";
  ctx.fillStyle = "#6bffb0";
  ctx.lineWidth = 2;
  ctx.font = "bold 13px monospace";
  ctx.beginPath();
  ctx.moveTo(70, 80);
  ctx.lineTo(100, 80);
  ctx.moveTo(156, 80);
  ctx.lineTo(186, 80);
  ctx.moveTo(128, 80);
  ctx.lineTo(128, 96);
  ctx.stroke();
  for (let step = -3; step <= 3; step += 1) {
    const y = 80 + step * 11;
    const width = step === 0 ? 34 : 15;
    ctx.beginPath();
    ctx.moveTo(128 - width, y);
    ctx.lineTo(128 + width, y);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(128, 74, 15, Math.PI * 1.05, Math.PI * 1.95);
  ctx.stroke();
  ctx.fillText("540", 14, 44);
  ctx.fillText("M1.0", 108, 26);
  ctx.fillText("KM", 14, 62);
  ctx.fillText("11000", 196, 44);
  ctx.fillText("G", 122, 146);
  ctx.fillText("7.6", 116, 132);
  ctx.fillText("TGT", 200, 24);
  ctx.beginPath();
  ctx.rect(60, 44, 136, 2);
  ctx.fill();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// 低可视度圆徽（机翼上表面贴花）：灰色环 + 灰底红星（低对比，符合低可视涂装）。
function makeRoundelTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, 256, 256);
  ctx.strokeStyle = "rgba(150,155,160,0.9)";
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.arc(128, 128, 112, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "rgba(124,130,136,0.86)";
  ctx.beginPath();
  ctx.arc(128, 128, 96, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(208,212,215,0.92)";
  ctx.beginPath();
  for (let point = 0; point <= 10; point += 1) {
    const vertex = point % 2 === 0;
    const radius = vertex ? 78 : 32;
    const angle = -Math.PI / 2 + (point * Math.PI) / 5;
    const px = 128 + Math.cos(angle) * radius;
    const py = 128 + Math.sin(angle) * radius;
    if (point === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// ---------- 主构建函数 ----------
export function buildJ20(): CodeCharacter {
  const root = new THREE.Group();
  root.name = "J20";
  const materials: THREE.MeshStandardMaterial[] = [];
  const textures: THREE.Texture[] = [];
  const glow: CodeCharacter["glow"] = [];
  const mat = (
    options: THREE.MeshStandardMaterialParameters,
    registerGlow?: { base: number; amp: number; speed: number; phase: number },
  ) => {
    const material = new THREE.MeshStandardMaterial(options);
    materials.push(material);
    if (registerGlow) glow.push({ material, ...registerGlow });
    return material;
  };

  // 三联贴图（反积木红线 #6：大面积涂装 = map + roughnessMap + bumpMap）。
  // 机身色图沿用旧迷彩绘制（paintSkinMap 直接画在三联色图上，标识位置经 skinU 逆映射不变），
  // 板缝 / 铆钉 / 油渍流痕由 panelTextures 提供。
  const skinPanels = panelTextures({
    base: "#737980",
    line: "#3f444a",
    roughness: 0.56,
    seed: 20110111,
    size: 1024,
  });
  paintSkinMap(skinPanels.map.image as HTMLCanvasElement);
  skinPanels.map.needsUpdate = true;
  const greyPanels = panelTextures({
    base: "#757b82",
    line: "#495057",
    roughness: 0.55,
    seed: 19530512,
  });
  const edgePanels = panelTextures({
    base: "#c0c4c6",
    line: "#8d9296",
    roughness: 0.42,
    seed: 20211111,
  });
  const darkPanels = panelTextures({
    base: "#565d64",
    line: "#3a4046",
    roughness: 0.6,
    seed: 19980704,
  });
  const skinTexture = skinPanels.map;
  textures.push(
    ...[skinPanels, greyPanels, edgePanels, darkPanels].flatMap((set) => [
      set.map,
      set.roughnessMap,
      set.bumpMap,
    ]),
  );
  const mfdTextures = [makeMfdTexture(0), makeMfdTexture(1), makeMfdTexture(2)];
  textures.push(...mfdTextures);
  const hudTexture = makeHudTexture();
  textures.push(hudTexture);
  const tailNumberTexture = (() => {
    // 垂尾低可视编号 + 红星圆徽贴花。
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, 256, 256);
    ctx.fillStyle = "rgba(214,219,222,0.92)";
    ctx.font = "bold 54px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("82101", 128, 210);
    ctx.strokeStyle = "rgba(214,219,222,0.9)";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(128, 92, 46, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "rgba(232,96,84,0.85)";
    ctx.beginPath();
    ctx.arc(128, 92, 34, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(240,240,240,0.95)";
    for (let point = 0; point < 5; point += 1) {
      const angle = -Math.PI / 2 + (point * Math.PI * 2) / 5;
      const px = 128 + Math.cos(angle) * 34;
      const py = 92 + Math.sin(angle) * 34;
      ctx.beginPath();
      ctx.arc(px, py, 7, 0, Math.PI * 2);
      ctx.fill();
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    textures.push(texture);
    return texture;
  })();
  const roundelTexture = makeRoundelTexture();
  textures.push(roundelTexture);

  // 弹体喷码「PL-15」弧面贴花：把文字沿弹体轴向绘制，贴到 ±X 两侧的弧面片上，
  // 两侧分别镜像绘制方向，保证从任何一侧看都是字头朝上、从左往右读。
  const makeMissileStencil = (flip: boolean) => {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 512;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, 128, 512);
    ctx.translate(64, 256);
    ctx.rotate(flip ? -Math.PI / 2 : Math.PI / 2);
    ctx.fillStyle = "rgba(74,80,88,0.92)";
    ctx.font = "bold 56px 'Arial Narrow', 'Microsoft YaHei', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("PL-15", 0, 0);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    textures.push(texture);
    return texture;
  };
  const missileStencilR = mat({
    map: makeMissileStencil(false),
    transparent: true,
    metalness: 0.12,
    roughness: 0.5,
    name: "PL-15喷码右",
  });
  const missileStencilL = mat({
    map: makeMissileStencil(true),
    transparent: true,
    metalness: 0.12,
    roughness: 0.5,
    name: "PL-15喷码左",
  });

  const skin = mat({
    color: 0xffffff,
    map: skinTexture,
    roughnessMap: skinPanels.roughnessMap,
    bumpMap: skinPanels.bumpMap,
    bumpScale: 0.003,
    metalness: 0.32,
    roughness: 1,
    name: "蒙皮",
  });
  const grey = mat({
    color: 0xffffff,
    map: greyPanels.map,
    roughnessMap: greyPanels.roughnessMap,
    bumpMap: greyPanels.bumpMap,
    bumpScale: 0.0032,
    metalness: 0.3,
    roughness: 1,
    name: "低可视灰",
  });
  const greyDark = mat({
    color: 0xffffff,
    map: darkPanels.map,
    roughnessMap: darkPanels.roughnessMap,
    bumpMap: darkPanels.bumpMap,
    bumpScale: 0.0026,
    metalness: 0.45,
    roughness: 1,
    name: "深灰",
  });
  const panel = mat({
    color: 0x3a4046,
    metalness: 0.5,
    roughness: 0.62,
    name: "舱内舱门深灰",
  });
  const seam = mat({
    color: 0x30353b,
    metalness: 0.35,
    roughness: 0.66,
    name: "板缝线",
  });
  const edge = mat({
    color: 0xffffff,
    map: edgePanels.map,
    roughnessMap: edgePanels.roughnessMap,
    bumpMap: edgePanels.bumpMap,
    bumpScale: 0.002,
    metalness: 0.35,
    roughness: 1,
    name: "浅灰包边",
  });
  const duct = mat({
    color: 0x3b342e,
    metalness: 0.25,
    roughness: 0.75,
    side: THREE.DoubleSide,
    name: "进气道内腔",
  });
  const nozzleHeat = mat({
    color: 0x5b5348,
    metalness: 0.78,
    roughness: 0.46,
    name: "喷管耐热花瓣",
  });
  const glass = mat({
    color: 0x1f2b38,
    metalness: 0.9,
    roughness: 0.06,
    transparent: true,
    opacity: 0.34,
    side: THREE.DoubleSide,
    name: "座舱盖玻璃",
  });
  const cockpitDark = mat({
    color: 0x1d2126,
    metalness: 0.2,
    roughness: 0.85,
    name: "座舱内衬",
  });
  const cockpitGrey = mat({
    color: 0x878e94,
    metalness: 0.35,
    roughness: 0.6,
    name: "座舱设备灰",
  });
  const seatGreen = mat({
    color: 0x55605a,
    metalness: 0.25,
    roughness: 0.75,
    name: "弹射座椅",
  });
  const black = mat({
    color: 0x17191c,
    metalness: 0.3,
    roughness: 0.8,
    name: "黑件",
  });
  const tire = mat({
    color: 0x121316,
    metalness: 0.1,
    roughness: 0.95,
    name: "轮胎",
  });
  const hub = mat({
    color: 0xb4b9bd,
    metalness: 0.75,
    roughness: 0.35,
    name: "轮毂",
  });
  const metal = mat({
    color: 0x9aa0a5,
    metalness: 0.85,
    roughness: 0.3,
    name: "金属件",
  });
  const redMark = mat({
    color: 0x9e2f28,
    metalness: 0.3,
    roughness: 0.6,
    name: "红标",
  });
  const eodas = mat({
    color: 0xd8c078,
    metalness: 0.6,
    roughness: 0.15,
    emissive: 0x2a2210,
    name: "光电窗",
  });
  const roundelMat = mat({
    map: roundelTexture,
    transparent: true,
    metalness: 0.28,
    roughness: 0.5,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    name: "低可视圆徽",
  });
  const hudGlass = mat(
    {
      color: 0x8effc0,
      emissive: 0x53ff9e,
      emissiveIntensity: 1.6,
      emissiveMap: hudTexture,
      alphaMap: hudTexture,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
      metalness: 0.1,
      roughness: 0.3,
      name: "平显玻璃",
    },
    { base: 1.6, amp: 0.25, speed: 2.2, phase: 0 },
  );
  const mfdScreen = mat(
    {
      color: 0x0a1a12,
      emissive: 0xffffff,
      emissiveMap: mfdTextures[0],
      emissiveIntensity: 1.5,
      metalness: 0.1,
      roughness: 0.4,
      name: "下显屏幕",
    },
    { base: 1.5, amp: 0.12, speed: 1.4, phase: 1.1 },
  );
  const mfdMap = mat(
    {
      color: 0x0a1a12,
      emissive: 0xffffff,
      emissiveMap: mfdTextures[1],
      emissiveIntensity: 1.4,
      metalness: 0.1,
      roughness: 0.4,
      name: "地图屏",
    },
    { base: 1.4, amp: 0.1, speed: 1.2, phase: 2.2 },
  );
  const mfdStore = mat({
    color: 0x0a1a12,
    emissive: 0xffffff,
    emissiveMap: mfdTextures[2],
    emissiveIntensity: 1.3,
    metalness: 0.1,
    roughness: 0.4,
    name: "挂载屏",
  });
  const flame = mat(
    {
      color: 0xff8c33,
      emissive: 0xff7a1f,
      emissiveIntensity: 3.2,
      transparent: true,
      opacity: 0.82,
      metalness: 0,
      roughness: 1,
      name: "加力焰",
    },
    { base: 3.2, amp: 1.1, speed: 17, phase: 0.4 },
  );
  const flameCore = mat(
    {
      color: 0xdff0ff,
      emissive: 0xbfe0ff,
      emissiveIntensity: 3.6,
      transparent: true,
      opacity: 0.9,
      metalness: 0,
      roughness: 1,
      name: "焰芯",
    },
    { base: 3.6, amp: 1.2, speed: 21, phase: 1.7 },
  );
  const smoke = mat({
    color: 0xa9b0b6,
    transparent: true,
    opacity: 0.5,
    metalness: 0.1,
    roughness: 0.95,
    depthWrite: false,
    name: "烟",
  });
  const boom = mat({
    color: 0xffd9a0,
    emissive: 0xffb45e,
    emissiveIntensity: 4,
    transparent: true,
    opacity: 1,
    metalness: 0,
    roughness: 1,
    name: "爆点",
  });
  const missileBody = mat({
    color: 0xd4d8db,
    metalness: 0.35,
    roughness: 0.45,
    name: "导弹弹体",
  });
  const missileDark = mat({
    color: 0x454b51,
    metalness: 0.4,
    roughness: 0.55,
    name: "导弹深色件",
  });
  const missileBand = mat({
    color: 0xd8b04a,
    metalness: 0.25,
    roughness: 0.5,
    name: "实弹识别环",
  });
  const missileNozzle = mat({
    color: 0x2b2f34,
    metalness: 0.85,
    roughness: 0.32,
    name: "导弹尾喷管",
  });
  const missileInner = mat({
    color: 0x121417,
    metalness: 0.55,
    roughness: 0.5,
    name: "喷管内壁",
  });
  const pilotSuit = mat({
    color: 0xd96a2a,
    metalness: 0.15,
    roughness: 0.75,
    name: "飞行服",
  });
  const pilotHelmet = mat({
    color: 0x3d444b,
    metalness: 0.45,
    roughness: 0.35,
    name: "头盔",
  });
  const pilotVisor = mat({
    color: 0x101418,
    metalness: 0.9,
    roughness: 0.12,
    name: "面罩镜",
  });
  const hotspotMaterial = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });

  const airframe = new THREE.Group();
  airframe.name = "J20Airframe";
  root.add(airframe);

  // ---------- 机身 ----------
  const stations: Station[] = [
    { z: -10.2, w: 1.34, yb: 1.7, yt: 2.32 },
    { z: -9.8, w: 1.5, yb: 1.66, yt: 2.36 },
    { z: -9.0, w: 1.68, yb: 1.6, yt: 2.42 },
    { z: -8.0, w: 1.78, yb: 1.55, yt: 2.48 },
    { z: -7.0, w: 1.83, yb: 1.5, yt: 2.53 },
    { z: -6.0, w: 1.86, yb: 1.46, yt: 2.58 },
    { z: -5.0, w: 1.87, yb: 1.42, yt: 2.63 },
    { z: -4.0, w: 1.88, yb: 1.38, yt: 2.68 },
    { z: -3.0, w: 1.92, yb: 1.34, yt: 2.73 },
    { z: -2.0, w: 2.0, yb: 1.3, yt: 2.78 },
    { z: -1.0, w: 2.06, yb: 1.26, yt: 2.81 },
    { z: 0, w: 2.04, yb: 1.26, yt: 2.82 },
    { z: 1.0, w: 1.88, yb: 1.3, yt: 2.84, dip: 0.18 },
    { z: 2.0, w: 1.66, yb: 1.36, yt: 2.85, dip: 0.42 },
    { z: 3.0, w: 1.5, yb: 1.42, yt: 2.86, dip: 0.46 },
    { z: 4.0, w: 1.4, yb: 1.48, yt: 2.85, dip: 0.44 },
    { z: 4.7, w: 1.33, yb: 1.51, yt: 2.83, dip: 0.34 },
    { z: 5.0, w: 1.3, yb: 1.54, yt: 2.83, dip: 0.12 },
    { z: 5.8, w: 1.18, yb: 1.62, yt: 2.8 },
    { z: 6.6, w: 1.02, yb: 1.72, yt: 2.76 },
    { z: 7.4, w: 0.82, yb: 1.84, yt: 2.7 },
    { z: 8.2, w: 0.6, yb: 1.96, yt: 2.62 },
    { z: 9.0, w: 0.37, yb: 2.08, yt: 2.53 },
    { z: 9.6, w: 0.18, yb: 2.18, yt: 2.42 },
    { z: 10.0, w: 0.06, yb: 2.26, yt: 2.33 },
    { z: 10.2, w: 0.015, yb: 2.29, yt: 2.31 },
  ];
  const denseStations = densifyStations(stations, 4); // ~0.2 m 站位加密（剪影不变）
  const fuselage = new THREE.Mesh(buildFuselageGeometry(denseStations), skin);
  fuselage.castShadow = true;
  fuselage.receiveShadow = true;
  fuselage.name = "J20Fuselage";
  airframe.add(fuselage);

  // ---------- 蒙皮细节：板缝 / 铆钉 / 口盖 / 百叶 / 天线 / 传感器（全部贴合放样曲面） ----------
  {
    const fusSurface = fuselagePatchSurface(denseStations);
    const skinSeamParts: THREE.BufferGeometry[] = [];
    const skinRivetParts: THREE.BufferGeometry[] = [];
    const skinCoverParts: THREE.BufferGeometry[] = [];
    const addFusRivet = (z: number, ringPos: number, radius: number) => {
      const p = fuselageSurface(z, ringPos, denseStations, new THREE.Vector3());
      const n = fuselageNormal(z, ringPos, denseStations, new THREE.Vector3());
      skinRivetParts.push(rivetDotGeometry(p, n, radius));
    };
    const addRingSeam = (z: number, v0: number, v1: number, steps: number) => {
      skinSeamParts.push(
        buildConformingPatch(fusSurface, {
          u0: z - 0.013,
          u1: z + 0.013,
          v0,
          v1,
          uSteps: 1,
          vSteps: steps,
          lift: 0.0012,
          thickness: 0.0038,
        }),
      );
    };
    const addLineSeam = (z0: number, z1: number, ringPos: number, steps: number) => {
      skinSeamParts.push(
        buildConformingPatch(fusSurface, {
          u0: z0,
          u1: z1,
          v0: ringPos - 0.2,
          v1: ringPos + 0.2,
          uSteps: steps,
          vSteps: 1,
          lift: 0.0012,
          thickness: 0.0038,
        }),
      );
    };
    // 环向板缝（全环；座舱开口段只保留侧下弧）
    for (const z of [-9.6, -8.7, -7.8, -6.7, -5.8, -4.9, -4.0, -3.2, -2.3, -1.4, -0.5, 0.3, 5.8, 6.6, 7.4, 8.2, 8.8, 9.35]) {
      addRingSeam(z, 1.5, RING - 0.5, 30);
    }
    for (const z of [1.2, 2.4, 3.6, 4.8]) {
      addRingSeam(z, 1.5, 14.5, 8);
      addRingSeam(z, 57.5, RING - 0.5, 8);
    }
    // 纵向板缝（棱线上下各一条 / 下侧两条）
    addLineSeam(-9.8, 9.9, 14, 34);
    addLineSeam(-9.8, 9.9, 16.5, 34);
    addLineSeam(-9.8, 9.9, 55.5, 34);
    addLineSeam(-9.8, 9.9, 58, 34);
    // 环缝铆钉列（每缝 26 颗，沿环向均布）
    for (const z of [-8.7, -6.7, -4.9, -3.2, -1.4, 0.3, 6.6, 8.2]) {
      for (let i = 0; i < 26; i += 1) {
        addFusRivet(z, 3 + (i / 25) * 66, 0.0075);
      }
    }
    // 口盖（贴合曲面 + 铆钉圈）
    const coverSpecs: { z0: number; z1: number; v0: number; v1: number }[] = [
      { z0: 6.1, z1: 7.3, v0: 10.5, v1: 13.5 },
      { z0: 6.1, z1: 7.3, v0: 58.5, v1: 61.5 },
      { z0: 6.6, z1: 7.6, v0: 2, v1: 5 },
      { z0: 6.6, z1: 7.6, v0: 67, v1: 70 },
      { z0: -6.4, z1: -5.1, v0: 30, v1: 33.5 },
      { z0: -6.4, z1: -5.1, v0: 38.5, v1: 42 },
      { z0: -5.6, z1: -4.2, v0: 8, v1: 12 },
      { z0: -5.6, z1: -4.2, v0: 60, v1: 64 },
      { z0: -8.8, z1: -7.8, v0: 6, v1: 10 },
      { z0: -8.8, z1: -7.8, v0: 62, v1: 66 },
      { z0: -2.6, z1: -1.4, v0: 32, v1: 35 },
      { z0: -9.5, z1: -8.9, v0: 33, v1: 39 },
      { z0: 4.2, z1: 5.2, v0: 6, v1: 9 },
      { z0: 4.2, z1: 5.2, v0: 63, v1: 66 },
    ];
    for (const cover of coverSpecs) {
      skinCoverParts.push(
        buildConformingPatch(fusSurface, {
          u0: cover.z0,
          u1: cover.z1,
          v0: cover.v0,
          v1: cover.v1,
          uSteps: 5,
          vSteps: 4,
          lift: 0.0035,
          thickness: 0.008,
        }),
      );
      for (let i = 0; i < 4; i += 1) {
        const tv = (i + 0.5) / 4;
        addFusRivet(lerpN(cover.z0, cover.z1, tv), cover.v0 - 0.9, 0.005);
        addFusRivet(lerpN(cover.z0, cover.z1, tv), cover.v1 + 0.9, 0.005);
        addFusRivet(cover.z0 - 0.14, lerpN(cover.v0, cover.v1, tv), 0.005);
        addFusRivet(cover.z1 + 0.14, lerpN(cover.v0, cover.v1, tv), 0.005);
      }
    }
    mergeInto(airframe, skinSeamParts, seam, "J20SkinSeams");
    mergeInto(airframe, skinCoverParts, greyDark, "J20SkinCovers");
    mergeInto(airframe, skinRivetParts, metal, "J20SkinRivets", false);
    // 百叶：尾脊散热百叶 ×2 + 进气口后放气门 ×2 + 背脊前段 ×1
    const louverParts: THREE.BufferGeometry[] = [];
    const louverMounts: { z: number; v: number; width: number; height: number; count: number }[] = [
      { z: -8.9, v: 35, width: 0.9, height: 0.52, count: 6 },
      { z: -8.1, v: 35, width: 0.9, height: 0.52, count: 6 },
      { z: -1.6, v: 9, width: 0.7, height: 0.42, count: 5 },
      { z: -1.6, v: 63, width: 0.7, height: 0.42, count: 5 },
      { z: 0.6, v: 33, width: 0.6, height: 0.36, count: 4 },
    ];
    for (const mount of louverMounts) {
      const p = fuselageSurface(mount.z, mount.v, denseStations, new THREE.Vector3());
      const n = fuselageNormal(mount.z, mount.v, denseStations, new THREE.Vector3());
      const exo = new THREE.Vector3(0, 0, 1).addScaledVector(n, -n.z).normalize();
      const ey = new THREE.Vector3().crossVectors(n, exo).normalize();
      const matrix = new THREE.Matrix4().makeBasis(exo, ey, n).setPosition(p.clone().addScaledVector(n, -0.012));
      louverParts.push(louverGeometry(mount.count, mount.width, mount.height, 36, 0.006).applyMatrix4(matrix));
    }
    mergeInto(airframe, louverParts, panel, "J20SkinLouvers");
    // 刀形天线（背脊 ×2 / 腹部 ×2 / 尾部 ×1）+ 静压孔 / 尾锥 / 减速伞舱
    const antennaParts: THREE.BufferGeometry[] = [];
    const bladeMounts: { z: number; v: number; height: number; chord: number; tilt: number }[] = [
      { z: -1.9, v: 36, height: 0.24, chord: 0.34, tilt: -0.22 },
      { z: -3.6, v: 36, height: 0.2, chord: 0.3, tilt: -0.22 },
      { z: 0.5, v: 0, height: 0.18, chord: 0.3, tilt: 0.2 },
      { z: -2.6, v: 0, height: 0.16, chord: 0.28, tilt: 0.2 },
      { z: -7.6, v: 36, height: 0.26, chord: 0.4, tilt: -0.3 },
    ];
    for (const mount of bladeMounts) {
      const p = fuselageSurface(mount.z, mount.v, denseStations, new THREE.Vector3());
      const n = fuselageNormal(mount.z, mount.v, denseStations, new THREE.Vector3());
      const exo = new THREE.Vector3(0, 0, 1).addScaledVector(n, -n.z).normalize();
      const ey = new THREE.Vector3().crossVectors(n, exo).normalize();
      const blade = bevelBoxGeometry(mount.chord, mount.height, 0.03, 0.01);
      const matrix = new THREE.Matrix4()
        .makeBasis(exo, ey, n)
        .multiply(new THREE.Matrix4().makeRotationX(mount.tilt))
        .setPosition(p.clone().addScaledVector(n, mount.height * 0.44));
      antennaParts.push(blade.applyMatrix4(matrix));
    }
    // 机头两侧攻角传感器 + 雷达罩分缝环 + 机头封口
    for (const side of [-1, 1]) {
      const ringPos = side > 0 ? 10 : RING - 10;
      const p = fuselageSurface(8.4, ringPos, denseStations, new THREE.Vector3());
      const n = fuselageNormal(8.4, ringPos, denseStations, new THREE.Vector3());
      const vane = new THREE.ConeGeometry(0.018, 0.16, 6);
      vane.rotateX(Math.PI / 2);
      vane.translate(p.x + n.x * 0.01, p.y + n.y * 0.01, p.z + 0.1);
      antennaParts.push(vane);
      const hub = new THREE.CylinderGeometry(0.03, 0.03, 0.05, 8);
      hub.rotateX(Math.PI / 2);
      hub.translate(p.x, p.y + n.y * 0.01, p.z);
      antennaParts.push(hub);
    }
    mergeInto(airframe, antennaParts, metal, "J20SkinAntennas", false);
    const radomeSeam = new THREE.Mesh(
      buildConformingPatch(fusSurface, { u0: 8.98, u1: 9.06, v0: 1.5, v1: RING - 0.5, uSteps: 1, vSteps: 26, lift: 0.001, thickness: 0.004 }),
      seam,
    );
    radomeSeam.name = "RadomeSeamRing";
    airframe.add(radomeSeam);
    const noseCap = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), greyDark);
    noseCap.position.set(0, 2.3, 10.19);
    airframe.add(noseCap);
    // APU 排气口（尾锥下方）+ 减速伞舱盖
    const apuPos = fuselageSurface(-9.85, 4, denseStations, new THREE.Vector3());
    const apuN = fuselageNormal(-9.85, 4, denseStations, new THREE.Vector3());
    const apu = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.16, 12), panel);
    apu.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), apuN.clone().negate());
    apu.position.copy(apuPos).addScaledVector(apuN, 0.04);
    apu.name = "ApuExhaust";
    airframe.add(apu);
    const apuInner = new THREE.Mesh(new THREE.CircleGeometry(0.075, 12), black);
    apuInner.quaternion.copy(apu.quaternion);
    apuInner.position.copy(apu.position).addScaledVector(apuN, 0.09);
    airframe.add(apuInner);
  }

  // 空速管（机头上部）
  const probe = new THREE.Mesh(
    new THREE.CylinderGeometry(0.028, 0.012, 1.5, 6),
    metal,
  );
  probe.rotation.x = Math.PI / 2;
  probe.position.set(0.16, 2.62, 10.0);
  airframe.add(probe);
  const probeTip = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.3, 6), black);
  probeTip.rotation.x = -Math.PI / 2;
  probeTip.position.set(0.16, 2.62, 10.9);
  airframe.add(probeTip);

  // 光电窗口：机头下 EOTS 菱形 + 机身侧 EODAS 小窗。
  const eots = new THREE.Mesh(new THREE.OctahedronGeometry(0.34, 0), eodas);
  eots.scale.set(1.1, 0.16, 1.7);
  eots.position.set(0, 1.72, 7.2);
  airframe.add(eots);
  for (const side of [-1, 1]) {
    const window = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), eodas);
    window.scale.set(0.2, 1.3, 1.7);
    window.position.set(side * 1.12, 2.35, 6.9);
    airframe.add(window);
    const windowRear = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.14, 0),
      eodas,
    );
    windowRear.scale.set(0.9, 0.25, 1.5);
    windowRear.position.set(side * 1.3, 2.5, 1.2);
    windowRear.rotation.z = side * 0.5;
    airframe.add(windowRear);
  }

  // ---------- 主翼（NACA 翼型实体：根弦 8.0 m / 尖弦 1.5 m，后掠 45°，厚度比 5.2%→5.8%） ----------
  const wingRootX = 0.9;
  const wingTipX = 6.5;
  const leRootZ = -1.1;
  const leTipZ = -5.65;
  const teRootZ = -9.1;
  const teTipZ = -7.15;
  const leZ = (x: number) =>
    leRootZ + ((x - wingRootX) / (wingTipX - wingRootX)) * (leTipZ - leRootZ);
  const teZ = (x: number) =>
    teRootZ + ((x - wingRootX) / (wingTipX - wingRootX)) * (teTipZ - teRootZ);
  const hingeZ = (x: number) => leZ(x) + (teZ(x) - leZ(x)) * 0.86;
  const flapSplitX = 3.55;
  const flapGap = 0.09;
  const wingPlan: WingPlan = {
    rootX: wingRootX,
    tipX: wingTipX,
    leRoot: leRootZ,
    leTip: leTipZ,
    teRoot: teRootZ,
    teTip: teTipZ,
    thickRoot: 0.052,
    thickTip: 0.058,
  };
  const wingHingeT = 0.86;
  const sOf = (x: number) => (x - wingRootX) / (wingTipX - wingRootX);
  // 铰链坐标系：u = 铰链轴方向（襟副翼/副翼绕局部 x 偏转即绕真实铰链线）。
  const wingFrame = (side: number, x0: number, x1: number): HingeFrame => {
    const ax = side * x0;
    const az = hingeZ(x0);
    const bx = side * x1;
    const bz = hingeZ(x1);
    const ox = (ax + bx) / 2;
    const oz = (az + bz) / 2;
    const length = Math.max(Math.hypot(bx - ax, bz - az), 1e-4);
    const ux = (bx - ax) / length;
    const uz = (bz - az) / length;
    return { ox, oy: 0, oz, yaw: -Math.atan2(uz, ux) };
  };

  const buildWingSide = (side: number) => {
    const group = new THREE.Group();
    group.name = side > 0 ? "WingR" : "WingL";
    group.position.y = 2.0; // 翼根高度
    const upper = wingPatchSurface(wingPlan, side, 1);
    const lower = wingPatchSurface(wingPlan, side, -1);
    const rivetParts: THREE.BufferGeometry[] = [];
    const addRivetOn = (surface: PatchSurface, u: number, v: number, radius: number) => {
      const p = surface.point(u, v, new THREE.Vector3());
      const n = surface.normal(u, v, new THREE.Vector3());
      rivetParts.push(rivetDotGeometry(p, n, radius));
    };
    // 固定翼面（后缘 t=0.86 让出操纵面）
    const wingMesh = new THREE.Mesh(
      buildAirfoilSolid(wingPlan, side, {
        s0: 0,
        s1: 1,
        t0: 0,
        t1: wingHingeT,
        spanSteps: 30,
        chordSteps: 18,
      }),
      grey,
    );
    wingMesh.name = side > 0 ? "WingSkinR" : "WingSkinL";
    wingMesh.castShadow = true;
    wingMesh.receiveShadow = true;
    group.add(wingMesh);
    // 前缘浅灰包边 + 翼尖包边（贴合翼型曲面）
    const trimParts: THREE.BufferGeometry[] = [];
    for (const surface of [upper, lower]) {
      trimParts.push(
        buildConformingPatch(surface, {
          u0: 0,
          u1: 0.985,
          v0: 0.006,
          v1: 0.05,
          uSteps: 30,
          vSteps: 2,
          lift: 0.003,
          thickness: 0.012,
        }),
      );
      trimParts.push(
        buildConformingPatch(surface, {
          u0: 0.956,
          u1: 0.984,
          v0: 0.02,
          v1: 0.985,
          uSteps: 2,
          vSteps: 16,
          lift: 0.003,
          thickness: 0.012,
        }),
      );
    }
    mergeInto(group, trimParts, edge, `WingTrim${side > 0 ? "R" : "L"}`);
    // 蒙皮板缝（展向 2 条 / 弦向 3 条，上下表面）
    const seamParts: THREE.BufferGeometry[] = [];
    for (const surface of [upper, lower]) {
      for (const v of [0.3, 0.64]) {
        seamParts.push(
          buildConformingPatch(surface, {
            u0: 0.02,
            u1: 0.95,
            v0: v,
            v1: v + 0.006,
            uSteps: 26,
            vSteps: 1,
            lift: 0.0012,
            thickness: 0.0042,
          }),
        );
      }
      for (const u of [0.24, 0.52, 0.78]) {
        seamParts.push(
          buildConformingPatch(surface, {
            u0: u,
            u1: u + 0.005,
            v0: 0.05,
            v1: 0.8,
            uSteps: 1,
            vSteps: 12,
            lift: 0.0012,
            thickness: 0.0042,
          }),
        );
      }
    }
    mergeInto(group, seamParts, seam, `WingSeams${side > 0 ? "R" : "L"}`);
    // 口盖（上 2 / 下 2）+ 周边铆钉圈
    const coverParts: THREE.BufferGeometry[] = [];
    const covers: { surface: PatchSurface; u0: number; u1: number; v0: number; v1: number }[] = [
      { surface: upper, u0: 0.08, u1: 0.22, v0: 0.3, v1: 0.5 },
      { surface: upper, u0: 0.55, u1: 0.7, v0: 0.24, v1: 0.42 },
      { surface: lower, u0: 0.12, u1: 0.3, v0: 0.56, v1: 0.74 },
      { surface: lower, u0: 0.62, u1: 0.78, v0: 0.5, v1: 0.68 },
    ];
    for (const cover of covers) {
      coverParts.push(
        buildConformingPatch(cover.surface, {
          u0: cover.u0,
          u1: cover.u1,
          v0: cover.v0,
          v1: cover.v1,
          uSteps: 6,
          vSteps: 4,
          lift: 0.004,
          thickness: 0.009,
        }),
      );
      for (let i = 0; i < 3; i += 1) {
        const tRivet = (i + 0.5) / 3;
        addRivetOn(cover.surface, lerpN(cover.u0, cover.u1, tRivet), cover.v0 - 0.006, 0.005);
        addRivetOn(cover.surface, lerpN(cover.u0, cover.u1, tRivet), cover.v1 + 0.006, 0.005);
        addRivetOn(cover.surface, cover.u0 - 0.006, lerpN(cover.v0, cover.v1, tRivet), 0.005);
        addRivetOn(cover.surface, cover.u1 + 0.006, lerpN(cover.v0, cover.v1, tRivet), 0.005);
      }
    }
    mergeInto(group, coverParts, greyDark, `WingCovers${side > 0 ? "R" : "L"}`);
    // 铆钉列：前缘 / 铰链前缘 / 翼尖
    for (const surface of [upper, lower]) {
      for (let i = 0; i < 20; i += 1) {
        addRivetOn(surface, 0.03 + (i / 19) * 0.93, 0.032, 0.006);
      }
      for (let i = 0; i < 12; i += 1) {
        addRivetOn(surface, 0.06 + (i / 11) * 0.87, 0.842, 0.0055);
      }
      for (let i = 0; i < 8; i += 1) {
        addRivetOn(surface, lerpN(0.955, 0.985, (i + 0.5) / 8), 0.86, 0.005);
      }
      for (let i = 0; i < 6; i += 1) {
        addRivetOn(surface, 0.06 + (i / 5) * 0.6, 0.7, 0.0048);
      }
    }
    // 翼尖航行灯吊舱（保留原形态）+ 前后盖 / 镜片 / 编队灯板
    const pod = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.42, 3, 8), panel);
    pod.name = `WingTipPod${side > 0 ? "R" : "L"}`;
    pod.rotation.x = Math.PI / 2;
    const podZ = (leTipZ + teTipZ) / 2;
    pod.position.set(side * (wingTipX - 0.1), 0, podZ);
    group.add(pod);
    const podNose = new THREE.Mesh(new THREE.ConeGeometry(0.074, 0.14, 10), greyDark);
    podNose.rotation.x = Math.PI / 2;
    podNose.position.set(side * (wingTipX - 0.1), 0, podZ + 0.27);
    group.add(podNose);
    const podTail = new THREE.Mesh(new THREE.ConeGeometry(0.074, 0.12, 10), greyDark);
    podTail.rotation.x = -Math.PI / 2;
    podTail.position.set(side * (wingTipX - 0.1), 0, podZ - 0.26);
    group.add(podTail);
    const podLens = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), eodas);
    podLens.position.set(side * (wingTipX - 0.1), 0.028, podZ + 0.33);
    group.add(podLens);
    for (const sign of [1, -1]) {
      const formation = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.014, 0.16), eodas);
      formation.position.set(side * (wingTipX - 0.04), sign * 0.048, podZ - 0.1);
      group.add(formation);
    }
    // 低可视圆徽（贴合上表面）
    const roundel = new THREE.Mesh(
      buildConformingPatch(
        {
          point: upper.point,
          normal: upper.normal,
          uv: (u, v) => [(u - 0.46) / 0.22, (v - 0.26) / 0.34],
        },
        { u0: 0.46, u1: 0.68, v0: 0.26, v1: 0.6, uSteps: 8, vSteps: 8, lift: 0.0045, thickness: 0.003 },
      ),
      roundelMat,
    );
    roundel.name = `RoundelDecal${side > 0 ? "R" : "L"}`;
    group.add(roundel);
    // 铰链整流罩（固定在固定翼面铰链前的凸包）
    const fairings: THREE.BufferGeometry[] = [];
    const hingeDirectionYaw = Math.atan2(
      hingeZ(wingTipX) - hingeZ(wingRootX),
      wingTipX - wingRootX,
    );
    for (const x of [1.35, 2.15, 3.15, 4.3, 5.5, 6.15]) {
      const fairing = bevelBoxGeometry(0.24, 0.1, 0.34, 0.02);
      const matrix = new THREE.Matrix4()
        .makeRotationY(side * -hingeDirectionYaw * (side > 0 ? 1 : -1))
        .setPosition(side * x, 0, hingeZ(x) + 0.06);
      fairing.applyMatrix4(matrix);
      fairings.push(fairing);
    }
    mergeInto(group, fairings, greyDark, `WingHingeFairings${side > 0 ? "R" : "L"}`);
    // 静电放电刷（后缘 4 根，固定在机翼上）
    const dischargers: THREE.BufferGeometry[] = [];
    for (const x of [3.3, 4.6, 5.7, 6.3]) {
      const spike = new THREE.ConeGeometry(0.008, 0.1, 6);
      spike.rotateX(-Math.PI / 2);
      spike.translate(side * x, 0, teZ(x) - 0.015);
      dischargers.push(spike);
    }
    mergeInto(group, dischargers, metal, `WingDischargers${side > 0 ? "R" : "L"}`, false);
    // 襟副翼（内侧）+ 副翼（外侧）：翼型薄壳 + 铰链坐标系
    const buildFlap = (
      x0: number,
      x1: number,
      name: string,
      material: THREE.MeshStandardMaterial,
    ) => {
      const frame = wingFrame(side, x0, x1);
      const pivot = new THREE.Group();
      pivot.name = name;
      pivot.rotation.order = "YXZ";
      pivot.position.set(frame.ox, frame.oy, frame.oz);
      pivot.rotation.set(0, frame.yaw, 0);
      const s0 = sOf(x0);
      const s1 = sOf(x1);
      const flapMesh = new THREE.Mesh(
        buildAirfoilSolid(wingPlan, side, {
          s0,
          s1,
          t0: wingHingeT + 0.012,
          t1: 1,
          spanSteps: 16,
          chordSteps: 8,
          scale: 0.62,
          frame,
        }),
        material,
      );
      flapMesh.castShadow = true;
      flapMesh.receiveShadow = true;
      pivot.add(flapMesh);
      // 后缘浅灰包边（贴合控制面上下表面）
      const framedSurface = (sign: number): PatchSurface => {
        const base = wingPatchSurface(wingPlan, side, sign);
        const framedBase: PatchSurface = {
          point: (u, v, out) => hingeFrameTransform(frame, base.point(u, v, new THREE.Vector3()), out),
          normal: (u, v, out) => hingeFrameDirection(frame, base.normal(u, v, new THREE.Vector3()), out),
          uv: base.uv,
        };
        return framedBase;
      };
      const flapTrim: THREE.BufferGeometry[] = [];
      for (const sign of [1, -1] as const) {
        const surface = framedSurface(sign);
        flapTrim.push(
          buildConformingPatch(surface, {
            u0: s0 + 0.01,
            u1: s1 - 0.01,
            v0: 0.955,
            v1: 0.996,
            uSteps: 14,
            vSteps: 2,
            lift: 0.0025,
            thickness: 0.009,
          }),
        );
      }
      mergeInto(pivot, flapTrim, edge, `${name}Trim`);
      // 控制面铆钉列（铰链后 1 排）
      const flapRivets: THREE.BufferGeometry[] = [];
      for (const sign of [1, -1] as const) {
        const surface = framedSurface(sign);
        for (let i = 0; i < 8; i += 1) {
          const u = lerpN(s0 + 0.02, s1 - 0.02, i / 7);
          const p = surface.point(u, wingHingeT + 0.05, new THREE.Vector3());
          const n = surface.normal(u, wingHingeT + 0.05, new THREE.Vector3());
          flapRivets.push(rivetDotGeometry(p, n, 0.0048));
        }
      }
      mergeInto(pivot, flapRivets, metal, `${name}Rivets`, false);
      group.add(pivot);
      return pivot;
    };
    const flaperon = buildFlap(
      wingRootX + 0.1,
      flapSplitX,
      side > 0 ? "FlaperonR" : "FlaperonL",
      grey,
    );
    const aileron = buildFlap(
      flapSplitX + flapGap,
      wingTipX,
      side > 0 ? "AileronR" : "AileronL",
      grey,
    );
    // 翼根融合整流罩：机身棱线 ↔ 翼面之间的放样过渡（上表面，剪影不变）
    {
      const rows: THREE.Vector3[][] = [];
      const tCount = 14;
      const kCount = 4;
      const sOut = sOf(2.75);
      const chineRing = side > 0 ? 16.5 : RING - 16.5; // 棱线上方一点的环向位置（按舷侧取镜像环位）
      const lift = 0.004;
      for (let ti = 0; ti <= tCount; ti += 1) {
        const t = lerpN(0.02, 0.98, ti / tCount);
        const pOut = planPoint(wingPlan, side, sOut, t, 1, 1, new THREE.Vector3());
        const nOut = planNormal(wingPlan, side, sOut, t, 1, new THREE.Vector3());
        const pIn = fuselageSurface(pOut.z, chineRing, denseStations, new THREE.Vector3());
        const nIn = fuselageNormal(pOut.z, chineRing, denseStations, new THREE.Vector3());
        const bulge = 0.045 * (0.4 + 0.6 * Math.sin((Math.PI * ti) / tCount));
        const row: THREE.Vector3[] = [];
        for (let k = 0; k <= kCount; k += 1) {
          const u = k / kCount;
          const smooth = u * u * (3 - 2 * u);
          const x = lerpN(pIn.x - nIn.x * 0.03, pOut.x + nOut.x * lift, smooth);
          const z = lerpN(pIn.z - nIn.z * 0.03, pOut.z + nOut.z * lift, smooth);
          const blendedY = lerpN(pIn.y - nIn.y * 0.03, pOut.y + nOut.y * lift, smooth) + Math.sin(Math.PI * u) * bulge;
          const sHere = clamp01(sOf(Math.abs(x)));
          const wingY = planPoint(wingPlan, side, sHere, t, 1, 1, new THREE.Vector3()).y;
          const floor = wingY + lift + 0.012 * (1 - u) * (1 - u);
          row.push(new THREE.Vector3(x, Math.max(blendedY, floor), z));
        }
        rows.push(row);
      }
      const fillet = new THREE.Mesh(buildLoftStrip(rows, new THREE.Vector3(0, 1, 0)), grey);
      fillet.name = `WingRootFairing${side > 0 ? "R" : "L"}`;
      fillet.castShadow = true;
      fillet.receiveShadow = true;
      group.add(fillet);
    }
    mergeInto(group, rivetParts, metal, `WingRivets${side > 0 ? "R" : "L"}`, false);
    return { group, flaperon, aileron };
  };
  const wingR = buildWingSide(1);
  const wingL = buildWingSide(-1);
  airframe.add(wingR.group, wingL.group);

  // ---------- 鸭翼（NACA 翼型实体：根弦 2.9 m / 展长 1.55 m，下反 5.7°，全动式） ----------
  const buildCanard = (side: number) => {
    const pivot = new THREE.Group();
    pivot.name = side > 0 ? "CanardR" : "CanardL";
    pivot.position.set(side * 1.3, 2.1, 2.9);
    const cant = new THREE.Group();
    cant.rotation.z = side * -0.1; // 下反
    pivot.add(cant);
    // 局部坐标系：翼根弦 2.9 m（z -0.7 → -3.6）、翼尖弦 1.0 m（z -2.3 → -3.3）。
    const canardPlan: WingPlan = {
      rootX: 0,
      tipX: 1.55,
      leRoot: 2.2 - 2.9,
      leTip: 0.6 - 2.9,
      teRoot: -0.7 - 2.9,
      teTip: -0.4 - 2.9,
      thickRoot: 0.05,
      thickTip: 0.055,
    };
    const upper = wingPatchSurface(canardPlan, side, 1);
    const lower = wingPatchSurface(canardPlan, side, -1);
    const rivetParts: THREE.BufferGeometry[] = [];
    const addRivetOn = (surface: PatchSurface, u: number, v: number, radius: number) => {
      const p = surface.point(u, v, new THREE.Vector3());
      const n = surface.normal(u, v, new THREE.Vector3());
      rivetParts.push(rivetDotGeometry(p, n, radius));
    };
    const skinMesh = new THREE.Mesh(
      buildAirfoilSolid(canardPlan, side, { spanSteps: 16, chordSteps: 14 }),
      grey,
    );
    skinMesh.name = side > 0 ? "CanardSkinR" : "CanardSkinL";
    skinMesh.castShadow = true;
    skinMesh.receiveShadow = true;
    cant.add(skinMesh);
    // 前缘包边 + 翼尖包边（贴合翼型曲面）
    const trimParts: THREE.BufferGeometry[] = [];
    for (const surface of [upper, lower]) {
      trimParts.push(
        buildConformingPatch(surface, {
          u0: 0,
          u1: 0.98,
          v0: 0.006,
          v1: 0.05,
          uSteps: 16,
          vSteps: 2,
          lift: 0.003,
          thickness: 0.012,
        }),
      );
      trimParts.push(
        buildConformingPatch(surface, {
          u0: 0.955,
          u1: 0.984,
          v0: 0.02,
          v1: 0.985,
          uSteps: 2,
          vSteps: 10,
          lift: 0.003,
          thickness: 0.012,
        }),
      );
    }
    mergeInto(cant, trimParts, edge, `CanardTrim${side > 0 ? "R" : "L"}`);
    // 蒙皮板缝（展向 2 条 / 弦向 2 条，上下表面）
    const seamParts: THREE.BufferGeometry[] = [];
    for (const surface of [upper, lower]) {
      for (const v of [0.32, 0.64]) {
        seamParts.push(
          buildConformingPatch(surface, {
            u0: 0.03,
            u1: 0.95,
            v0: v,
            v1: v + 0.007,
            uSteps: 14,
            vSteps: 1,
            lift: 0.0012,
            thickness: 0.0042,
          }),
        );
      }
      for (const u of [0.34, 0.68]) {
        seamParts.push(
          buildConformingPatch(surface, {
            u0: u,
            u1: u + 0.006,
            v0: 0.05,
            v1: 0.8,
            uSteps: 1,
            vSteps: 8,
            lift: 0.0012,
            thickness: 0.0042,
          }),
        );
      }
    }
    mergeInto(cant, seamParts, seam, `CanardSeams${side > 0 ? "R" : "L"}`);
    // 检修口盖（上下各一）+ 铆钉圈 + 前缘 / 根弦铆钉列
    const coverParts: THREE.BufferGeometry[] = [];
    const covers: { surface: PatchSurface; u0: number; u1: number; v0: number; v1: number }[] = [
      { surface: upper, u0: 0.12, u1: 0.3, v0: 0.4, v1: 0.62 },
      { surface: lower, u0: 0.4, u1: 0.58, v0: 0.36, v1: 0.58 },
    ];
    for (const cover of covers) {
      coverParts.push(
        buildConformingPatch(cover.surface, {
          u0: cover.u0,
          u1: cover.u1,
          v0: cover.v0,
          v1: cover.v1,
          uSteps: 4,
          vSteps: 3,
          lift: 0.004,
          thickness: 0.008,
        }),
      );
      for (let i = 0; i < 3; i += 1) {
        const tRivet = (i + 0.5) / 3;
        addRivetOn(cover.surface, lerpN(cover.u0, cover.u1, tRivet), cover.v0 - 0.008, 0.0045);
        addRivetOn(cover.surface, lerpN(cover.u0, cover.u1, tRivet), cover.v1 + 0.008, 0.0045);
        addRivetOn(cover.surface, cover.u0 - 0.008, lerpN(cover.v0, cover.v1, tRivet), 0.0045);
        addRivetOn(cover.surface, cover.u1 + 0.008, lerpN(cover.v0, cover.v1, tRivet), 0.0045);
      }
    }
    mergeInto(cant, coverParts, greyDark, `CanardCovers${side > 0 ? "R" : "L"}`);
    for (const surface of [upper, lower]) {
      for (let i = 0; i < 10; i += 1) {
        addRivetOn(surface, 0.04 + (i / 9) * 0.92, 0.03, 0.005);
      }
      for (let i = 0; i < 6; i += 1) {
        addRivetOn(surface, 0.055, lerpN(0.08, 0.9, i / 5), 0.0048);
      }
    }
    mergeInto(cant, rivetParts, metal, `CanardRivets${side > 0 ? "R" : "L"}`, false);
    // 根部加强板（贴合曲面抬升的加厚板）
    const rootPlateParts: THREE.BufferGeometry[] = [];
    for (const surface of [upper, lower]) {
      rootPlateParts.push(
        buildConformingPatch(surface, {
          u0: 0.005,
          u1: 0.085,
          v0: 0.06,
          v1: 0.94,
          uSteps: 3,
          vSteps: 8,
          lift: 0.0045,
          thickness: 0.007,
        }),
      );
    }
    mergeInto(cant, rootPlateParts, greyDark, `CanardRootPlate${side > 0 ? "R" : "L"}`);
    airframe.add(pivot);
    return pivot;
  };
  buildCanard(1);
  buildCanard(-1);

  // ---------- 全动垂尾（NACA 翼型实体：根弦 4.62 m / 高 1.72 m，外倾 21.8°） ----------
  const buildVtail = (side: number) => {
    const pivot = new THREE.Group();
    pivot.name = side > 0 ? "VtailR" : "VtailL";
    pivot.position.set(side * 1.2, 2.66, -6.7);
    const cant = new THREE.Group();
    cant.rotation.z = side * -0.38; // 外倾 ~22°
    pivot.add(cant);
    // 翼型约定建好后 rotateZ(π/2)：展向 x→y（向上）、厚度 y→x，前缘 z=+1.9 朝前。
    const vtailPlan: WingPlan = {
      rootX: 0,
      tipX: 1.72,
      leRoot: 1.9,
      leTip: -1.4,
      teRoot: -2.72,
      teTip: -2.45,
      thickRoot: 0.038,
      thickTip: 0.042,
    };
    const rotateIntoFin = (out: THREE.Vector3) => out.set(-out.y, out.x, out.z);
    const vtailSurface = (sign: number): PatchSurface => {
      const base = wingPatchSurface(vtailPlan, 1, sign);
      return {
        point: (u, v, out) => rotateIntoFin(base.point(u, v, out)),
        normal: (u, v, out) => rotateIntoFin(base.normal(u, v, out)),
        uv: base.uv,
      };
    };
    const upper = vtailSurface(1);
    const lower = vtailSurface(-1);
    const rivetParts: THREE.BufferGeometry[] = [];
    const addRivetOn = (surface: PatchSurface, u: number, v: number, radius: number) => {
      const p = surface.point(u, v, new THREE.Vector3());
      const n = surface.normal(u, v, new THREE.Vector3());
      rivetParts.push(rivetDotGeometry(p, n, radius));
    };
    const finGeometry = buildAirfoilSolid(vtailPlan, 1, { spanSteps: 20, chordSteps: 18 });
    finGeometry.rotateZ(Math.PI / 2);
    const skinMesh = new THREE.Mesh(finGeometry, grey);
    skinMesh.name = side > 0 ? "VtailSkinR" : "VtailSkinL";
    skinMesh.castShadow = true;
    skinMesh.receiveShadow = true;
    cant.add(skinMesh);
    // 前缘包边 + 翼尖包边（贴合曲面）
    const trimParts: THREE.BufferGeometry[] = [];
    for (const surface of [upper, lower]) {
      trimParts.push(
        buildConformingPatch(surface, {
          u0: 0,
          u1: 0.98,
          v0: 0.006,
          v1: 0.042,
          uSteps: 20,
          vSteps: 2,
          lift: 0.003,
          thickness: 0.012,
        }),
      );
      trimParts.push(
        buildConformingPatch(surface, {
          u0: 0.958,
          u1: 0.986,
          v0: 0.02,
          v1: 0.985,
          uSteps: 2,
          vSteps: 12,
          lift: 0.003,
          thickness: 0.012,
        }),
      );
    }
    mergeInto(cant, trimParts, edge, `VtailTrim${side > 0 ? "R" : "L"}`);
    // 蒙皮板缝（展向 2 条 / 弦向 2 条，两侧面）
    const seamParts: THREE.BufferGeometry[] = [];
    for (const surface of [upper, lower]) {
      for (const v of [0.3, 0.62]) {
        seamParts.push(
          buildConformingPatch(surface, {
            u0: 0.04,
            u1: 0.95,
            v0: v,
            v1: v + 0.006,
            uSteps: 16,
            vSteps: 1,
            lift: 0.0012,
            thickness: 0.0042,
          }),
        );
      }
      for (const u of [0.3, 0.66]) {
        seamParts.push(
          buildConformingPatch(surface, {
            u0: u,
            u1: u + 0.005,
            v0: 0.05,
            v1: 0.82,
            uSteps: 1,
            vSteps: 10,
            lift: 0.0012,
            thickness: 0.0042,
          }),
        );
      }
    }
    mergeInto(cant, seamParts, seam, `VtailSeams${side > 0 ? "R" : "L"}`);
    // 检修口盖 + 铆钉圈 + 前缘 / 根部铆钉列
    const coverParts: THREE.BufferGeometry[] = [];
    const covers: { surface: PatchSurface; u0: number; u1: number; v0: number; v1: number }[] = [
      { surface: upper, u0: 0.18, u1: 0.34, v0: 0.4, v1: 0.62 },
      { surface: lower, u0: 0.44, u1: 0.6, v0: 0.34, v1: 0.56 },
    ];
    for (const cover of covers) {
      coverParts.push(
        buildConformingPatch(cover.surface, {
          u0: cover.u0,
          u1: cover.u1,
          v0: cover.v0,
          v1: cover.v1,
          uSteps: 4,
          vSteps: 3,
          lift: 0.004,
          thickness: 0.008,
        }),
      );
      for (let i = 0; i < 3; i += 1) {
        const tRivet = (i + 0.5) / 3;
        addRivetOn(cover.surface, lerpN(cover.u0, cover.u1, tRivet), cover.v0 - 0.008, 0.0045);
        addRivetOn(cover.surface, lerpN(cover.u0, cover.u1, tRivet), cover.v1 + 0.008, 0.0045);
        addRivetOn(cover.surface, cover.u0 - 0.008, lerpN(cover.v0, cover.v1, tRivet), 0.0045);
        addRivetOn(cover.surface, cover.u1 + 0.008, lerpN(cover.v0, cover.v1, tRivet), 0.0045);
      }
    }
    // 根部整流罩（贴合两侧面的加厚板）
    for (const surface of [upper, lower]) {
      coverParts.push(
        buildConformingPatch(surface, {
          u0: 0.004,
          u1: 0.06,
          v0: 0.05,
          v1: 0.95,
          uSteps: 2,
          vSteps: 10,
          lift: 0.0045,
          thickness: 0.007,
        }),
      );
    }
    mergeInto(cant, coverParts, greyDark, `VtailCovers${side > 0 ? "R" : "L"}`);
    for (const surface of [upper, lower]) {
      for (let i = 0; i < 12; i += 1) {
        addRivetOn(surface, 0.045 + (i / 11) * 0.9, 0.026, 0.005);
      }
      for (let i = 0; i < 7; i += 1) {
        addRivetOn(surface, 0.052, lerpN(0.08, 0.9, i / 6), 0.0048);
      }
    }
    mergeInto(cant, rivetParts, metal, `VtailRivets${side > 0 ? "R" : "L"}`, false);
    // 低可视编号 + 红星贴花（两侧垂尾外表面，按 side 朝外且读向正确）
    const decalMaterial = new THREE.MeshStandardMaterial({
      map: tailNumberTexture,
      transparent: true,
      metalness: 0.2,
      roughness: 0.5,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      name: "垂尾贴花",
    });
    materials.push(decalMaterial);
    const decal = new THREE.Mesh(
      new THREE.PlaneGeometry(1.5, 1.5),
      decalMaterial,
    );
    decal.rotation.y = (side * Math.PI) / 2;
    decal.position.set(side * 0.12, 0.85, -0.9);
    cant.add(decal);
    airframe.add(pivot);
    return pivot;
  };
  buildVtail(1);
  buildVtail(-1);

  // ---------- 腹鳍（detailKit 翼型挤出 + 逐点重映射：根弦 2.75 m → 尖弦 0.68 m，斜置 134.6°） ----------
  const buildVentFin = (side: number) => {
    const group = new THREE.Group();
    group.name = side > 0 ? "VentFinR" : "VentFinL";
    group.position.set(side * 1.05, 1.75, -7.6);
    group.rotation.z = side * 2.35; // 向下外倾
    const span = 0.78;
    const chordRoot = 2.75;
    const chordTip = 0.68;
    const leRoot = 1.4;
    const leTip = -0.3;
    const ratio = 0.033;
    const leAt = (u: number) => lerpN(leRoot, leTip, u);
    const chordAt = (u: number) => lerpN(chordRoot, chordTip, u);
    // 腹鳍局部坐标：x=厚度（±）、y=展向（0→span）、z=弦向（前缘 +）。
    const finGeometry = airfoilGeometry(chordRoot, span, ratio, 20, 0.006);
    {
      const positions = finGeometry.getAttribute("position");
      for (let i = 0; i < positions.count; i += 1) {
        const cx = positions.getX(i); // 翼型弦向 0（前缘）→ chordRoot
        const ty = positions.getY(i); // 厚度
        const sz = positions.getZ(i); // 展向 -span/2 → +span/2
        const u = clamp01((sz + span / 2) / span);
        const t = clamp01(cx / chordRoot);
        positions.setXYZ(
          i,
          ty * (chordAt(u) / chordRoot),
          sz + span / 2,
          leAt(u) - t * chordAt(u),
        );
      }
      positions.needsUpdate = true;
      finGeometry.computeVertexNormals();
    }
    const skinMesh = new THREE.Mesh(finGeometry, grey);
    skinMesh.name = side > 0 ? "VentFinSkinR" : "VentFinSkinL";
    skinMesh.castShadow = true;
    skinMesh.receiveShadow = true;
    group.add(skinMesh);
    // 解析曲面（薄翼近似法线）：包边 / 口盖 / 铆钉贴合用。
    const ventSurface = (sign: number): PatchSurface => ({
      point: (u, v, out) => {
        const th = sign * nacaHalf(v) * ratio * chordAt(clamp01(u));
        return out.set(th, clamp01(u) * span, leAt(clamp01(u)) - clamp01(v) * chordAt(clamp01(u)));
      },
      normal: (_u, _v, out) => out.set(sign, 0, 0),
      uv: (u, v) => [u * 4, v * 4],
    });
    const parts: THREE.BufferGeometry[] = [];
    const rivetParts: THREE.BufferGeometry[] = [];
    for (const sign of [1, -1] as const) {
      const surface = ventSurface(sign);
      parts.push(
        buildConformingPatch(surface, {
          u0: 0,
          u1: 0.97,
          v0: 0.008,
          v1: 0.05,
          uSteps: 12,
          vSteps: 2,
          lift: 0.0028,
          thickness: 0.011,
        }),
      );
      parts.push(
        buildConformingPatch(surface, {
          u0: 0.955,
          u1: 0.99,
          v0: 0.02,
          v1: 0.98,
          uSteps: 2,
          vSteps: 8,
          lift: 0.0028,
          thickness: 0.011,
        }),
      );
      for (let i = 0; i < 7; i += 1) {
        const u = lerpN(0.05, 0.9, i / 6);
        const p = surface.point(u, 0.03, new THREE.Vector3());
        const n = surface.normal(u, 0.03, new THREE.Vector3());
        rivetParts.push(rivetDotGeometry(p, n, 0.0045));
      }
    }
    mergeInto(group, parts, edge, `VentFinTrim${side > 0 ? "R" : "L"}`);
    // 根部整流罩 + 检修口盖
    const coverParts: THREE.BufferGeometry[] = [];
    for (const sign of [1, -1] as const) {
      const surface = ventSurface(sign);
      coverParts.push(
        buildConformingPatch(surface, {
          u0: 0.006,
          u1: 0.075,
          v0: 0.06,
          v1: 0.94,
          uSteps: 2,
          vSteps: 8,
          lift: 0.0042,
          thickness: 0.006,
        }),
      );
      coverParts.push(
        buildConformingPatch(surface, {
          u0: 0.3,
          u1: 0.55,
          v0: 0.42,
          v1: 0.68,
          uSteps: 3,
          vSteps: 3,
          lift: 0.004,
          thickness: 0.007,
        }),
      );
    }
    mergeInto(group, coverParts, greyDark, `VentFinCovers${side > 0 ? "R" : "L"}`);
    mergeInto(group, rivetParts, metal, `VentFinRivets${side > 0 ? "R" : "L"}`, false);
    airframe.add(group);
    return group;
  };
  buildVentFin(1);
  buildVentFin(-1);

  // ---------- DSI 进气道（唇口椭圆 1.29 m × 0.97 m，鼓包长半轴 0.95 m） ----------
  const buildIntake = (side: number) => {
    const tag = side > 0 ? "R" : "L";
    const group = new THREE.Group();
    group.name = `Intake${tag}`;
    const yaw = side * 0.12; // 唇口略朝外张开
    const ellipse = (geometry: THREE.BufferGeometry) => {
      geometry.rotateX(Math.PI / 2);
      geometry.scale(1, 0.75, 1);
      geometry.rotateY(yaw);
      return geometry;
    };
    // 外罩：前大后小的整流罩（口部露出机身侧壁），28 段环向加密
    const fairing = new THREE.Mesh(
      ellipse(new THREE.CylinderGeometry(0.6, 0.34, 1.7, 28, 1, true)),
      grey,
    );
    fairing.name = `IntakeCowl${tag}`;
    fairing.castShadow = true;
    fairing.receiveShadow = true;
    fairing.position.set(side * 1.32, 1.92, 1.72);
    group.add(fairing);
    // 内腔：深色双面筒（提供口部纵深）+ 环形加强肋 ×2 + 内腔封底
    const throat = new THREE.Mesh(
      ellipse(new THREE.CylinderGeometry(0.52, 0.28, 1.6, 20, 1, true)),
      duct,
    );
    throat.position.set(side * 1.33, 1.92, 1.78);
    group.add(throat);
    const ribParts: THREE.BufferGeometry[] = [];
    for (const rib of [
      { z: 1.9, r: 0.4 },
      { z: 1.5, r: 0.34 },
    ]) {
      const ring = new THREE.TorusGeometry(rib.r, 0.02, 6, 20);
      ring.scale(1, 0.75, 1);
      ring.rotateY(yaw);
      ring.translate(side * 1.33, 1.92, rib.z);
      ribParts.push(ring);
    }
    mergeInto(group, ribParts, panel, `IntakeRibs${tag}`);
    const throatCap = new THREE.Mesh(
      ellipse(new THREE.CylinderGeometry(0.3, 0.16, 0.4, 12)),
      duct,
    );
    throatCap.position.set(side * 1.27, 1.92, 1.48);
    group.add(throatCap);
    const throatInlet = new THREE.Mesh(new THREE.CircleGeometry(0.16, 12), black);
    throatInlet.position.set(side * 1.27, 1.92, 1.29);
    group.add(throatInlet);
    // 唇口：圆角环（前缘圆倒角）+ 分流环（口内一圈）
    const lipGeometry = new THREE.TorusGeometry(0.63, 0.032, 8, 24);
    lipGeometry.scale(1, 0.75, 1);
    lipGeometry.rotateY(yaw);
    const lip = new THREE.Mesh(lipGeometry, edge);
    lip.name = `IntakeLip${tag}`;
    lip.position.set(side * 1.42, 1.92, 2.59);
    group.add(lip);
    const splitter = new THREE.Mesh(
      (() => {
        const ring = new THREE.TorusGeometry(0.43, 0.024, 6, 20);
        ring.scale(1, 0.75, 1);
        ring.rotateY(yaw);
        return ring;
      })(),
      greyDark,
    );
    splitter.position.set(side * 1.35, 1.92, 2.3);
    group.add(splitter);
    // DSI 鼓包（前置虹吸式无附面层隔道鼓包）：24 段经向 + 根部铆钉圈
    const bump = new THREE.Mesh(new THREE.SphereGeometry(0.5, 24, 16), grey);
    bump.name = `IntakeBump${tag}`;
    bump.scale.set(0.74, 0.62, 1.9);
    bump.position.set(side * 1.42, 2.12, 3.05);
    bump.rotation.y = side * -0.06;
    bump.castShadow = true;
    group.add(bump);
    // 外罩细节：唇口铆钉列 / 背脊铆钉排 / 放气百叶 / 检修口盖（含 0.12 rad 外张偏航）
    const cowlPoint = (phi: number, z: number, out: THREE.Vector3) => {
      const radius = 0.34 + (0.26 * (z - 0.87)) / 1.7;
      const xr = Math.cos(phi) * radius;
      const dz = z - 1.72;
      return out.set(
        side * 1.32 + xr * Math.cos(yaw) + dz * Math.sin(yaw),
        1.92 + Math.sin(phi) * 0.75 * radius,
        1.72 - xr * Math.sin(yaw) + dz * Math.cos(yaw),
      );
    };
    const cowlNormal = (phi: number, out: THREE.Vector3) => {
      const xr = Math.cos(phi);
      const slope = -0.1529;
      return out
        .set(xr * Math.cos(yaw) + slope * Math.sin(yaw), Math.sin(phi) * 0.75, -xr * Math.sin(yaw) + slope * Math.cos(yaw))
        .normalize();
    };
    const intakeParts: THREE.BufferGeometry[] = [];
    const bumpParts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 20; i += 1) {
      const phi = (i / 20) * Math.PI * 2;
      bumpParts.push(
        rivetDotGeometry(
          cowlPoint(phi, 2.46, new THREE.Vector3()),
          cowlNormal(phi, new THREE.Vector3()),
          0.006,
        ),
      );
    }
    for (let i = 0; i < 8; i += 1) {
      const z = lerpN(1.05, 2.35, i / 7);
      bumpParts.push(
        rivetDotGeometry(
          cowlPoint(1.22, z, new THREE.Vector3()),
          cowlNormal(1.22, new THREE.Vector3()),
          0.0055,
        ),
      );
    }
    for (let i = 0; i < 14; i += 1) {
      const theta = (i / 14) * Math.PI * 2;
      const p = new THREE.Vector3(
        side * 1.42 + Math.cos(theta) * 0.385,
        2.12 + Math.sin(theta) * 0.325,
        3.02,
      );
      const n = new THREE.Vector3(Math.cos(theta), Math.sin(theta), -0.12).normalize();
      bumpParts.push(rivetDotGeometry(p, n, 0.005));
    }
    mergeInto(group, bumpParts, metal, `IntakeRivets${tag}`, false);
    // 放气百叶（外罩上侧，向后放气）
    {
      const p = cowlPoint(0.62, 2.12, new THREE.Vector3());
      const n = cowlNormal(0.62, new THREE.Vector3());
      const exo = new THREE.Vector3(0, 0, 1).addScaledVector(n, -n.z).normalize();
      const ey = new THREE.Vector3().crossVectors(n, exo).normalize();
      const matrix = new THREE.Matrix4()
        .makeBasis(exo, ey, n)
        .setPosition(p.clone().addScaledVector(n, -0.01));
      intakeParts.push(louverGeometry(4, 0.42, 0.24, 36, 0.006).applyMatrix4(matrix));
    }
    // 检修口盖（外罩下侧，贴合圆锥面用薄板近似）
    {
      const p = cowlPoint(-0.9, 1.75, new THREE.Vector3());
      const n = cowlNormal(-0.9, new THREE.Vector3());
      const exo = new THREE.Vector3(0, 0, 1).addScaledVector(n, -n.z).normalize();
      const ey = new THREE.Vector3().crossVectors(n, exo).normalize();
      const plate = bevelBoxGeometry(0.5, 0.34, 0.014, 0.004);
      const matrix = new THREE.Matrix4()
        .makeBasis(exo, ey, n)
        .setPosition(p.clone().addScaledVector(n, 0.004));
      intakeParts.push(plate.applyMatrix4(matrix));
    }
    mergeInto(group, intakeParts, panel, `IntakePanels${tag}`);
    airframe.add(group);
    return group;
  };
  buildIntake(1);
  buildIntake(-1);

  // ---------- 尾喷管（18 片锯齿收敛花瓣 + 作动环/作动杆 + 内衬；节流环面积 A8 ∝ T^0.5） ----------
  const buildNozzle = (side: number) => {
    const tag = side > 0 ? "R" : "L";
    const group = new THREE.Group();
    group.name = side > 0 ? "NozzleR" : "NozzleL";
    group.position.set(side * 0.74, 2.06, -9.9);
    const outer = new THREE.Mesh(
      new THREE.CylinderGeometry(0.62, 0.56, 1.6, 24, 1, true),
      greyDark,
    );
    outer.rotation.x = Math.PI / 2;
    outer.castShadow = true;
    outer.name = `NozzleShell${tag}`;
    group.add(outer);
    const inner = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.45, 1.85, 20, 1, true),
      panel,
    );
    inner.rotation.x = Math.PI / 2;
    inner.position.z = 0.04;
    group.add(inner);
    const throat = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42, 0.3, 0.9, 18),
      panel,
    );
    throat.rotation.x = Math.PI / 2;
    throat.position.z = 0.5;
    group.add(throat);
    // 18 片收敛花瓣：贴合圆锥曲面、后缘 3 齿锯齿（锯齿缘减少雷达回波 + 掺混）
    const petalCount = 18;
    const petalSurface = (index: number, petalCountLocal: number): PatchSurface => {
      const phi0 = (index / petalCountLocal) * Math.PI * 2;
      const delta = ((Math.PI * 2) / petalCountLocal) * 0.88;
      const r0 = 0.565;
      const r1 = 0.43;
      const z0 = -0.78;
      const length = 0.8;
      const tooth = 0.11;
      const saw = (v: number) => {
        const f = (v * 3) % 1;
        return 1 - Math.abs(f * 2 - 1);
      };
      return {
        point: (u, v, out) => {
          const phi = phi0 + v * delta;
          const radius = lerpN(r0, r1, u);
          const z = z0 - u * (length - tooth * saw(v));
          return out.set(Math.cos(phi) * radius, Math.sin(phi) * radius, z);
        },
        normal: (_u, v, out) => {
          const phi = phi0 + v * delta;
          return out.set(Math.cos(phi), Math.sin(phi), 0.28).normalize();
        },
        uv: (u, v) => [v * delta * 4, u * length * 4],
      };
    };
    const petalParts: THREE.BufferGeometry[] = [];
    for (let index = 0; index < petalCount; index += 1) {
      petalParts.push(
        buildConformingPatch(petalSurface(index, petalCount), {
          u0: 0,
          u1: 1,
          v0: 0,
          v1: 1,
          uSteps: 5,
          vSteps: 3,
          lift: 0,
          thickness: 0.02,
        }),
      );
    }
    mergeInto(group, petalParts, nozzleHeat, `NozzlePetals${tag}`);
    // 花瓣作动环 + 作动杆 ×6（外环到各花瓣根部）
    const actuatorParts: THREE.BufferGeometry[] = [];
    const ring = new THREE.TorusGeometry(0.615, 0.022, 6, 24);
    ring.translate(0, 0, -0.5);
    actuatorParts.push(ring);
    for (let index = 0; index < 6; index += 1) {
      const phi = (index / 6) * Math.PI * 2 + Math.PI / 6;
      const from = new THREE.Vector3(Math.cos(phi) * 0.625, Math.sin(phi) * 0.625, -0.12);
      const to = new THREE.Vector3(Math.cos(phi) * 0.535, Math.sin(phi) * 0.535, -0.72);
      const dir = to.clone().sub(from);
      const rod = new THREE.CylinderGeometry(0.016, 0.016, dir.length(), 6);
      rod.rotateX(Math.PI / 2); // 轴向 → +z
      const quaternion = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 0, 1),
        dir.clone().normalize(),
      );
      rod.applyQuaternion(quaternion);
      rod.translate(from.x + dir.x / 2, from.y + dir.y / 2, from.z + dir.z / 2);
      actuatorParts.push(rod);
    }
    mergeInto(group, actuatorParts, metal, `NozzleActuators${tag}`, false);
    // 加力焰（锥体，Idle 时缩为 0）
    const flameGroup = new THREE.Group();
    flameGroup.name = side > 0 ? "FlameR" : "FlameL";
    flameGroup.position.z = -1.15;
    const flameCone = new THREE.Mesh(
      new THREE.ConeGeometry(0.44, 3.4, 12, 1, true),
      flame,
    );
    flameCone.rotation.x = Math.PI / 2;
    flameCone.position.z = -1.2;
    flameGroup.add(flameCone);
    const coreCone = new THREE.Mesh(
      new THREE.ConeGeometry(0.26, 1.5, 10, 1, true),
      flameCore,
    );
    coreCone.rotation.x = Math.PI / 2;
    coreCone.position.z = -0.6;
    flameGroup.add(coreCone);
    flameGroup.scale.setScalar(0.001);
    group.add(flameGroup);
    airframe.add(group);
    return { group, flameGroup };
  };
  buildNozzle(1);
  buildNozzle(-1);

  // 尾端封口（放样开口的收尾：按加密环轮廓生成端盖，法线朝后可见）
  const tailCap = new THREE.Mesh(
    (() => {
      const station = denseStations[0]; // 尾端站位 z=-10.2
      const shape = new THREE.Shape();
      const scratch = new THREE.Vector3();
      for (let index = 0; index < RING; index += 1) {
        fuselageRingPoint(station, index, scratch);
        if (index === 0) shape.moveTo(scratch.x, scratch.y);
        else shape.lineTo(scratch.x, scratch.y);
      }
      shape.closePath();
      const geometry = new THREE.ShapeGeometry(shape);
      geometry.rotateY(Math.PI); // 端盖法线朝后（从尾部可见）
      geometry.translate(0, 0, -10.26);
      return geometry;
    })(),
    panel,
  );
  airframe.add(tailCap);

  // ---------- 起落架 ----------
  const gearParts: THREE.Group[] = [];
  // 直线圆柱杆件（扭力臂 / 液压作动筒 / 铰链销等），两端点定义。
  const rod = (
    a: THREE.Vector3,
    b: THREE.Vector3,
    radius: number,
    material: THREE.MeshStandardMaterial,
    parent: THREE.Object3D,
  ) => {
    const direction = b.clone().sub(a);
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, direction.length(), 8),
      material,
    );
    mesh.position.copy(a).addScaledVector(direction, 0.5);
    mesh.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      direction.clone().normalize(),
    );
    parent.add(mesh);
    return mesh;
  };
  const buildWheel = (radius: number, width: number, hubRadius: number) => {
    const group = new THREE.Group();
    const rolling = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, width, 20),
      tire,
    );
    rolling.rotation.z = Math.PI / 2;
    rolling.castShadow = true;
    group.add(rolling);
    const hubMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(hubRadius, hubRadius, width + 0.03, 16),
      hub,
    );
    hubMesh.rotation.z = Math.PI / 2;
    group.add(hubMesh);
    const axle = new THREE.Mesh(
      new THREE.CylinderGeometry(
        hubRadius * 0.42,
        hubRadius * 0.42,
        width + 0.16,
        10,
      ),
      metal,
    );
    axle.rotation.z = Math.PI / 2;
    group.add(axle);
    // 刹车盘（内侧）+ 轮毂螺栓圈（外侧）+ 胎面环槽 + 气门嘴
    const wheelExtras: THREE.BufferGeometry[] = [];
    const brake = new THREE.CylinderGeometry(hubRadius * 0.82, hubRadius * 0.82, 0.05, 14);
    brake.rotateZ(Math.PI / 2);
    brake.translate(-(width / 2 + 0.045), 0, 0);
    wheelExtras.push(brake);
    for (const bolt of boltCircleGeometries(
      6,
      hubRadius * 0.55,
      0.019,
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(width / 2 + 0.02, 0, 0),
    )) {
      wheelExtras.push(bolt);
    }
    for (const offset of [-width * 0.24, width * 0.24]) {
      const tread = new THREE.TorusGeometry(radius - 0.012, 0.016, 6, 20);
      tread.rotateY(Math.PI / 2);
      tread.translate(offset, 0, 0);
      wheelExtras.push(tread);
    }
    const valve = new THREE.CylinderGeometry(0.013, 0.013, 0.06, 6);
    valve.rotateZ(Math.PI / 2);
    valve.translate(width / 2 + 0.03, hubRadius * 0.72, 0);
    wheelExtras.push(valve);
    mergeInto(group, wheelExtras, greyDark, "WheelRotorAssembly");
    return group;
  };
  const strut = (
    length: number,
    radius: number,
    material: THREE.MeshStandardMaterial,
  ) => {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, length, 10),
      material,
    );
    return mesh;
  };

  // 前起落架（单轮 + 双舱门 + 转向箍 / 扭力臂 / 液压作动筒 / 防摆阻尼器）
  const gearNose = new THREE.Group();
  gearNose.name = "GearNose";
  gearNose.position.set(0, 1.34, 5.6);
  {
    const leg = strut(0.86, 0.1, metal);
    leg.position.y = -0.45;
    gearNose.add(leg);
    const oleo = strut(0.5, 0.13, greyDark);
    oleo.position.y = -0.18;
    gearNose.add(oleo);
    const brace = strut(0.9, 0.05, greyDark);
    brace.position.set(0, -0.34, 0.3);
    brace.rotation.x = -0.6;
    gearNose.add(brace);
    // 转向箍（绕腿的环形卡箍 + 两侧耳片）
    const collar = new THREE.Mesh(
      new THREE.TorusGeometry(0.128, 0.024, 6, 16),
      greyDark,
    );
    collar.rotation.x = Math.PI / 2;
    collar.position.set(0, -0.4, 0.02);
    gearNose.add(collar);
    for (const side of [-1, 1]) {
      const lug = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, 0.1), metal);
      lug.position.set(side * 0.13, -0.4, 0.02);
      gearNose.add(lug);
    }
    // 扭力臂（上下两节折线臂）+ 防摆阻尼器 + 液压作动筒（筒壳 + 活塞杆）
    rod(
      new THREE.Vector3(0.1, -0.56, 0.02),
      new THREE.Vector3(0.14, -0.72, 0.16),
      0.026,
      metal,
      gearNose,
    );
    rod(
      new THREE.Vector3(0.14, -0.72, 0.16),
      new THREE.Vector3(0.12, -0.86, 0.1),
      0.024,
      metal,
      gearNose,
    );
    rod(
      new THREE.Vector3(-0.16, -0.44, 0.14),
      new THREE.Vector3(-0.1, -0.4, -0.16),
      0.022,
      greyDark,
      gearNose,
    );
    rod(
      new THREE.Vector3(-0.05, -0.06, 0.5),
      new THREE.Vector3(-0.06, -0.42, 0.2),
      0.058,
      greyDark,
      gearNose,
    );
    rod(
      new THREE.Vector3(-0.06, -0.42, 0.2),
      new THREE.Vector3(-0.07, -0.58, 0.1),
      0.032,
      metal,
      gearNose,
    );
    const wheel = buildWheel(0.36, 0.24, 0.2);
    wheel.name = "WheelNose";
    wheel.position.set(0, -0.88, 0.02);
    gearNose.add(wheel);
    const light = new THREE.Mesh(
      new THREE.BoxGeometry(0.09, 0.09, 0.16),
      metal,
    );
    light.position.set(0, -0.3, 0.18);
    gearNose.add(light);
    airframe.add(gearNose);
    gearParts.push(gearNose);
    for (const side of [-1, 1]) {
      const door = new THREE.Group();
      door.name = side > 0 ? "NoseDoorR" : "NoseDoorL";
      door.position.set(side * 0.44, 1.3, 5.6);
      const panelMesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.42, 0.045, 1.5),
        greyDark,
      );
      panelMesh.position.set(side * 0.21, 0, 0);
      door.add(panelMesh);
      const inner = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.02, 1.4), hub);
      inner.position.set(side * 0.21, 0.03, 0);
      door.add(inner);
      airframe.add(door);
      gearParts.push(door);
      // 舱门铰链销 ×3（沿 z 轴，随舱门开合的转轴）+ 收放作动筒
      const hingeParts: THREE.BufferGeometry[] = [];
      for (const z of [6.25, 5.6, 4.95]) {
        const pin = new THREE.CylinderGeometry(0.032, 0.032, 0.16, 8);
        pin.rotateX(Math.PI / 2);
        pin.translate(side * 0.44, 1.3, z);
        hingeParts.push(pin);
      }
      mergeInto(airframe, hingeParts, metal, `NoseDoorHinges${side > 0 ? "R" : "L"}`, false);
      rod(
        new THREE.Vector3(side * 0.2, 1.62, 4.9),
        new THREE.Vector3(side * 0.5, 1.36, 5.15),
        0.026,
        greyDark,
        airframe,
      );
    }
  }

  // 主起落架（每侧单轮大轮毂 + 大舱门 + 扭力臂 / 刹车油管 / 收放作动筒 / 铰链销）
  for (const side of [-1, 1]) {
    const tag = side > 0 ? "R" : "L";
    const leg = new THREE.Group();
    leg.name = side > 0 ? "GearMainR" : "GearMainL";
    leg.position.set(side * 1.32, 1.3, -2.3);
    const main = strut(0.92, 0.12, metal);
    main.position.y = -0.46;
    leg.add(main);
    const sleeve = strut(0.6, 0.15, greyDark);
    sleeve.position.y = -0.2;
    leg.add(sleeve);
    const brace = strut(1.05, 0.055, greyDark);
    brace.position.set(side * -0.22, -0.36, 0.34);
    brace.rotation.x = -0.65;
    brace.rotation.z = side * 0.35;
    leg.add(brace);
    // 扭力臂（两节）+ 刹车油管 + 收放作动筒
    rod(
      new THREE.Vector3(side * 0.1, -0.58, 0.0),
      new THREE.Vector3(side * 0.17, -0.74, 0.14),
      0.03,
      metal,
      leg,
    );
    rod(
      new THREE.Vector3(side * 0.17, -0.74, 0.14),
      new THREE.Vector3(side * 0.15, -0.86, 0.06),
      0.027,
      metal,
      leg,
    );
    rod(
      new THREE.Vector3(side * -0.08, -0.5, 0.12),
      new THREE.Vector3(side * -0.1, -0.84, 0.02),
      0.013,
      black,
      leg,
    );
    rod(
      new THREE.Vector3(side * -0.3, -0.1, 0.42),
      new THREE.Vector3(side * -0.18, -0.52, 0.2),
      0.062,
      greyDark,
      leg,
    );
    rod(
      new THREE.Vector3(side * -0.18, -0.52, 0.2),
      new THREE.Vector3(side * -0.14, -0.7, 0.12),
      0.034,
      metal,
      leg,
    );
    const wheel = buildWheel(0.44, 0.3, 0.26);
    wheel.name = side > 0 ? "WheelMainR" : "WheelMainL";
    wheel.position.set(side * 0.14, -0.9, 0.04);
    leg.add(wheel);
    airframe.add(leg);
    gearParts.push(leg);
    const door = new THREE.Group();
    door.name = side > 0 ? "MainDoorR" : "MainDoorL";
    door.position.set(side * 1.62, 1.36, -2.3);
    const panelMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.95, 0.05, 2.5),
      greyDark,
    );
    panelMesh.position.set(side * -0.48, 0, 0);
    door.add(panelMesh);
    const innerPanel = new THREE.Mesh(
      new THREE.BoxGeometry(0.82, 0.022, 2.3),
      hub,
    );
    innerPanel.position.set(side * -0.48, -0.035, 0);
    door.add(innerPanel);
    // 内衬加强肋 ×3
    for (const z of [-0.9, 0, 0.9]) {
      const ribMesh = new THREE.Mesh(
        bevelBoxGeometry(0.7, 0.03, 0.09, 0.008),
        greyDark,
      );
      ribMesh.position.set(side * -0.48, -0.055, z);
      door.add(ribMesh);
    }
    const marking = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.012, 0.4),
      redMark,
    );
    marking.position.set(side * -0.62, -0.05, 0.7);
    door.add(marking);
    airframe.add(door);
    gearParts.push(door);
    // 舱门铰链销 ×3（沿 z 轴的转轴）+ 收放作动筒 ×2
    const hingeParts: THREE.BufferGeometry[] = [];
    for (const z of [-3.35, -2.3, -1.25]) {
      const pin = new THREE.CylinderGeometry(0.036, 0.036, 0.18, 8);
      pin.rotateX(Math.PI / 2);
      pin.translate(side * 1.62, 1.36, z);
      hingeParts.push(pin);
      const bracket = bevelBoxGeometry(0.12, 0.08, 0.2, 0.012);
      bracket.translate(side * 1.68, 1.42, z);
      hingeParts.push(bracket);
    }
    mergeInto(airframe, hingeParts, metal, `MainDoorHinges${tag}`, false);
    rod(
      new THREE.Vector3(side * 1.82, 1.58, -3.0),
      new THREE.Vector3(side * 1.28, 1.4, -2.86),
      0.028,
      greyDark,
      airframe,
    );
    rod(
      new THREE.Vector3(side * 1.82, 1.58, -1.6),
      new THREE.Vector3(side * 1.28, 1.4, -1.74),
      0.028,
      greyDark,
      airframe,
    );
  }

  // ---------- 腹部武器舱门（贴合腹部曲面 + 缝线 + 铰链 + 收放作动筒） ----------
  {
    const fusSurface = fuselagePatchSurface(denseStations);
    // 主舱门（腹部中央，z -6.0 → -0.8，随腹面下凸）
    const mainBay = new THREE.Mesh(
      buildConformingPatch(fusSurface, {
        u0: -6.0,
        u1: -0.8,
        v0: -10,
        v1: 10,
        uSteps: 20,
        vSteps: 6,
        lift: 0.004,
        thickness: 0.02,
      }),
      panel,
    );
    mainBay.name = "WeaponBayMainDoor";
    mainBay.castShadow = true;
    airframe.add(mainBay);
    // 舱门缝线（两侧纵向 + 前后横向，细窄贴合条）
    const baySeams: THREE.BufferGeometry[] = [];
    for (const v of [-10.6, 10.6]) {
      baySeams.push(
        buildConformingPatch(fusSurface, {
          u0: -6.04,
          u1: -0.76,
          v0: v - 0.14,
          v1: v + 0.14,
          uSteps: 20,
          vSteps: 1,
          lift: 0.0016,
          thickness: 0.0044,
        }),
      );
    }
    for (const u of [-6.05, -0.75]) {
      baySeams.push(
        buildConformingPatch(fusSurface, {
          u0: u - 0.1,
          u1: u + 0.1,
          v0: -10.8,
          v1: 10.8,
          uSteps: 1,
          vSteps: 10,
          lift: 0.0016,
          thickness: 0.0044,
        }),
      );
    }
    mergeInto(airframe, baySeams, seam, "WeaponBaySeams", false);
    // 铰链（两侧各 2 处）+ 作动筒（舱内向外推）
    const bayHardware: THREE.BufferGeometry[] = [];
    for (const v of [-10.6, 10.6]) {
      for (const u of [-4.9, -1.9]) {
        const p = fusSurface.point(u, v, new THREE.Vector3());
        const n = fusSurface.normal(u, v, new THREE.Vector3());
        const hinge = bevelBoxGeometry(0.09, 0.05, 0.16, 0.01);
        hinge.applyMatrix4(
          new THREE.Matrix4()
            .makeTranslation(p.x + n.x * 0.012, p.y + n.y * 0.012, p.z + n.z * 0.012),
        );
        bayHardware.push(hinge);
      }
    }
    const actuatorGeometry = (fromV: number, z: number) => {
      const a = fusSurface.point(z, fromV, new THREE.Vector3());
      const b = fusSurface.point(z, fromV > 0 ? fromV - 3.4 : fromV + 3.4, new THREE.Vector3());
      const from = a.clone().addScaledVector(fusSurface.normal(z, fromV, new THREE.Vector3()), -0.03);
      const to = b.clone().addScaledVector(fusSurface.normal(z, fromV > 0 ? fromV - 3.4 : fromV + 3.4, new THREE.Vector3()), -0.05);
      const direction = to.clone().sub(from);
      const cylinder = new THREE.CylinderGeometry(0.026, 0.026, direction.length(), 8);
      const quaternion = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        direction.clone().normalize(),
      );
      cylinder.applyQuaternion(quaternion);
      cylinder.translate(
        from.x + direction.x / 2,
        from.y + direction.y / 2,
        from.z + direction.z / 2,
      );
      return cylinder;
    };
    bayHardware.push(actuatorGeometry(-12.4, -2.6), actuatorGeometry(-12.4, -4.4));
    bayHardware.push(actuatorGeometry(12.4, -2.6), actuatorGeometry(12.4, -4.4));
    mergeInto(airframe, bayHardware, metal, "WeaponBayHardware", false);
    // 侧舱门（棱线下方，带边缘缝线）
    for (const side of [-1, 1]) {
      const tilt = side * -0.5;
      const sideBay = new THREE.Mesh(
        bevelBoxGeometry(0.5, 0.05, 2.6, 0.012),
        panel,
      );
      sideBay.name = side > 0 ? "SideBayDoorR" : "SideBayDoorL";
      sideBay.position.set(side * 1.72, 1.62, 0.2);
      sideBay.rotation.z = tilt;
      airframe.add(sideBay);
      const sideSeams: THREE.BufferGeometry[] = [];
      for (const offset of [-0.26, 0.26]) {
        const strip = bevelBoxGeometry(0.024, 0.056, 2.62, 0.006);
        strip.rotateZ(tilt);
        strip.translate(
          side * 1.72 + Math.cos(tilt) * offset,
          1.62 + Math.sin(tilt) * offset,
          0.2,
        );
        sideSeams.push(strip);
      }
      mergeInto(airframe, sideSeams, seam, `SideBaySeams${side > 0 ? "R" : "L"}`, false);
    }
  }

  // ---------- 翼下挂架与导弹 ----------
  const missileInfo: { group: THREE.Group; flame: THREE.Group }[] = [];
  const buildMissile = (side: number) => {
    // 翼下挂架：微倒角挂架体 + 前后铆钉列 + 摇摆撑 + 舱脐带 / 挂轨 + 弹射钩（发射后留在机上）
    const pylonParts: THREE.BufferGeometry[] = [];
    const pylonBody = bevelBoxGeometry(0.18, 0.4, 1.7, 0.02);
    pylonBody.translate(side * 2.72, 1.78, -4.4);
    pylonParts.push(pylonBody);
    const frontRivets = rivetStripGeometry(5, 0.3, 0.006);
    frontRivets.rotateX(Math.PI / 2);
    frontRivets.translate(side * 2.72, 1.78, -3.56);
    pylonParts.push(frontRivets);
    const rearRivets = rivetStripGeometry(5, 0.3, 0.006);
    rearRivets.rotateX(-Math.PI / 2);
    rearRivets.translate(side * 2.72, 1.78, -5.24);
    pylonParts.push(rearRivets);
    for (const zOffset of [-0.42, 0.42]) {
      const brace = bevelBoxGeometry(0.16, 0.09, 0.24, 0.012);
      brace.translate(side * 2.72, 1.5, -4.3 + zOffset);
      pylonParts.push(brace);
    }
    const umbilical = bevelBoxGeometry(0.12, 0.14, 0.18, 0.01);
    umbilical.translate(side * 2.72, 1.66, -3.86);
    pylonParts.push(umbilical);
    mergeInto(airframe, pylonParts, greyDark, `Pylon${side > 0 ? "R" : "L"}`);
    const rail = new THREE.Mesh(
      bevelBoxGeometry(0.1, 0.06, 1.2, 0.008),
      greyDark,
    );
    rail.name = `PylonRail${side > 0 ? "R" : "L"}`;
    rail.position.set(side * 2.72, 1.55, -4.3);
    airframe.add(rail);
    const hookParts: THREE.BufferGeometry[] = [];
    for (const zOffset of [-0.28, 0.28]) {
      const hook = bevelBoxGeometry(0.06, 0.06, 0.1, 0.008);
      hook.translate(side * 2.72, 1.5, -4.3 + zOffset);
      hookParts.push(hook);
    }
    mergeInto(airframe, hookParts, metal, `PylonHooks${side > 0 ? "R" : "L"}`, false);
    const missile = new THREE.Group();
    missile.name = side > 0 ? "MissileR" : "MissileL";
    missile.position.set(side * 2.72, 1.36, -4.3);
    // —— 霹雳-15（PL-15）中远距空空导弹 ——
    // 公开资料近似：弹长 3.996 m、弹径 203 mm；尖卵形雷达罩 + 中段边条翼 + 切尖三角尾舵。
    const radomeProfile = [
      new THREE.Vector2(0.003, 0.585),
      new THREE.Vector2(0.022, 0.548),
      new THREE.Vector2(0.052, 0.472),
      new THREE.Vector2(0.078, 0.356),
      new THREE.Vector2(0.094, 0.198),
      new THREE.Vector2(0.1015, 0),
    ];
    const radome = new THREE.Mesh(
      new THREE.LatheGeometry(radomeProfile, 16),
      missileDark,
    );
    radome.rotation.x = Math.PI / 2;
    radome.position.z = 1.415;
    missile.add(radome);
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1015, 0.1015, 2.78, 18),
      missileBody,
    );
    body.rotation.x = Math.PI / 2;
    body.position.z = 0.025;
    missile.add(body);
    // 导引头段 / 战斗部段接缝环
    for (const ringZ of [1.39, -0.72]) {
      const seam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.104, 0.104, 0.022, 18),
        missileDark,
      );
      seam.rotation.x = Math.PI / 2;
      seam.position.z = ringZ;
      missile.add(seam);
    }
    // 实弹黄色识别环（战斗部段）
    const warheadBand = new THREE.Mesh(
      new THREE.CylinderGeometry(0.103, 0.103, 0.05, 18),
      missileBand,
    );
    warheadBand.rotation.x = Math.PI / 2;
    warheadBand.position.z = 1.22;
    missile.add(warheadBand);
    // 中段边条翼（4 片，45° 方位）
    for (let fin = 0; fin < 4; fin += 1) {
      const angle = (fin / 4) * Math.PI * 2 + Math.PI / 4;
      const strake = new THREE.Mesh(
        new THREE.BoxGeometry(0.016, 0.115, 0.42),
        missileDark,
      );
      strake.position.set(
        Math.cos(angle) * 0.155,
        Math.sin(angle) * 0.155,
        0.62,
      );
      strake.rotation.z = angle;
      missile.add(strake);
    }
    // 尾舵（4 片切尖三角舵，45° 方位）
    const finShape = new THREE.Shape();
    finShape.moveTo(0, -0.88);
    finShape.lineTo(0, -1.52);
    finShape.lineTo(0.35, -1.48);
    finShape.lineTo(0.35, -1.3);
    finShape.closePath();
    const finGeometry = new THREE.ExtrudeGeometry(finShape, {
      depth: 0.016,
      bevelEnabled: false,
    });
    finGeometry.translate(0, 0, -0.008);
    for (let fin = 0; fin < 4; fin += 1) {
      const angle = (fin / 4) * Math.PI * 2 + Math.PI / 4;
      const tailFin = new THREE.Mesh(finGeometry, missileDark);
      tailFin.rotation.order = "ZXY";
      tailFin.rotation.x = Math.PI / 2;
      tailFin.rotation.z = angle;
      tailFin.position.set(Math.cos(angle) * 0.098, Math.sin(angle) * 0.098, 0);
      missile.add(tailFin);
    }
    // 尾喷管（扩散段 + 内壁）
    const nozzleProfile = [
      new THREE.Vector2(0.1015, 0),
      new THREE.Vector2(0.104, 0.16),
      new THREE.Vector2(0.112, 0.44),
      new THREE.Vector2(0.115, 0.6),
      new THREE.Vector2(0.107, 0.64),
      new THREE.Vector2(0.092, 0.63),
    ];
    const nozzle = new THREE.Mesh(
      new THREE.LatheGeometry(nozzleProfile, 16),
      missileNozzle,
    );
    nozzle.rotation.x = -Math.PI / 2;
    nozzle.position.z = -1.35;
    missile.add(nozzle);
    const nozzleInner = new THREE.Mesh(
      new THREE.CircleGeometry(0.09, 16),
      missileInner,
    );
    nozzleInner.rotation.y = Math.PI;
    nozzleInner.position.z = -1.955;
    missile.add(nozzleInner);
    // 挂耳（与挂轨相连，发射后随弹飞离）
    for (const lugZ of [-0.5, 0.5]) {
      const lug = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.09, 0.18),
        missileDark,
      );
      lug.position.set(0, 0.125, lugZ);
      missile.add(lug);
    }
    // 弹体喷码「PL-15」（弧面贴花，两侧各一）
    for (const stencilSide of [1, -1]) {
      const decal = new THREE.Mesh(
        new THREE.CylinderGeometry(
          0.1023,
          0.1023,
          0.66,
          14,
          1,
          true,
          (stencilSide * Math.PI) / 2 - 0.35,
          0.7,
        ),
        stencilSide > 0 ? missileStencilR : missileStencilL,
      );
      decal.rotation.x = Math.PI / 2;
      decal.position.z = 0.38;
      missile.add(decal);
    }
    // 尾焰
    const flameGroup = new THREE.Group();
    flameGroup.name = side > 0 ? "MissileFlameR" : "MissileFlameL";
    flameGroup.position.z = -1.98;
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(0.2, 1.7, 10, 1, true),
      flame,
    );
    cone.rotation.x = Math.PI / 2;
    cone.position.z = -0.75;
    flameGroup.add(cone);
    const core = new THREE.Mesh(
      new THREE.ConeGeometry(0.11, 0.8, 8, 1, true),
      flameCore,
    );
    core.rotation.x = Math.PI / 2;
    core.position.z = -0.3;
    flameGroup.add(core);
    flameGroup.scale.setScalar(0.001);
    missile.add(flameGroup);
    // 导弹热点（可点击发射）
    const hotspot = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.5, 4.2),
      hotspotMaterial,
    );
    hotspot.name = "hotspot:FireMissile";
    missile.add(hotspot);
    airframe.add(missile);
    missileInfo.push({ group: missile, flame: flameGroup });
    return missile;
  };
  buildMissile(1);
  buildMissile(-1);

  // 烟迹：沿弹道布置的若干烟团（各自缩放/透明度动画）
  const smokePuffs: {
    mesh: THREE.Mesh;
    material: THREE.MeshStandardMaterial;
  }[] = [];
  const smokePath: [number, number, number][] = [
    [2.72, 1.6, -2.6],
    [2.95, 2.4, -0.6],
    [3.2, 3.4, 1.6],
    [3.45, 4.6, 3.8],
    [3.7, 5.8, 6.0],
    [3.95, 7.0, 8.2],
    [4.1, 8.0, 10.6],
  ];
  for (const spot of smokePath) {
    for (const side of [-1, 1]) {
      const puffMaterial = smoke.clone();
      puffMaterial.name = "烟团";
      materials.push(puffMaterial);
      const puff = new THREE.Mesh(
        new THREE.SphereGeometry(0.55, 10, 8),
        puffMaterial,
      );
      puff.position.set(side * spot[0], spot[1], spot[2]);
      puff.scale.setScalar(0.001);
      puff.name = `Smoke${side > 0 ? "R" : "L"}${smokePuffs.length}`;
      airframe.add(puff);
      smokePuffs.push({ mesh: puff, material: puffMaterial });
    }
  }

  // 远处爆点：双发各一（左右各命中一发）——闪光球 + 扩散烟球
  const booms: {
    tag: string;
    smokeMesh: THREE.Mesh;
    flashMaterial: THREE.MeshStandardMaterial;
    smokeMaterial: THREE.MeshStandardMaterial;
  }[] = [];
  for (const side of [-1, 1]) {
    const tag = side > 0 ? "R" : "L";
    const boomGroup = new THREE.Group();
    boomGroup.name = `Boom${tag}`;
    boomGroup.position.set(side * 4.2, 8.6, 13);
    const flashMaterial = boom.clone();
    flashMaterial.name = `爆闪${tag}`;
    materials.push(flashMaterial);
    const flashMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.82, 14, 10),
      flashMaterial,
    );
    flashMesh.name = `BoomFlash${tag}`;
    boomGroup.add(flashMesh);
    const boomSmokeMaterial = smoke.clone();
    boomSmokeMaterial.name = `爆烟${tag}`;
    boomSmokeMaterial.opacity = 0.75;
    materials.push(boomSmokeMaterial);
    const boomSmoke = new THREE.Mesh(
      new THREE.SphereGeometry(1, 12, 10),
      boomSmokeMaterial,
    );
    boomSmoke.name = `BoomSmoke${tag}`;
    boomGroup.add(boomSmoke);
    boomGroup.scale.setScalar(0.001);
    airframe.add(boomGroup);
    booms.push({
      tag,
      smokeMesh: boomSmoke,
      flashMaterial,
      smokeMaterial: boomSmokeMaterial,
    });
  }

  // ---------- 座舱内部 ----------
  const cockpit = new THREE.Group();
  cockpit.name = "Cockpit";
  airframe.add(cockpit);
  const limb = (
    a: [number, number, number],
    b: [number, number, number],
    radius: number,
    material: THREE.MeshStandardMaterial,
  ) => {
    const start = new THREE.Vector3(a[0], a[1], a[2]);
    const end = new THREE.Vector3(b[0], b[1], b[2]);
    const direction = end.clone().sub(start);
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius * 0.9, direction.length(), 8),
      material,
    );
    mesh.position.copy(start).add(end).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      direction.normalize(),
    );
    return mesh;
  };
  // 座舱地板 / 侧壁 / 前后隔板
  const tubFloor = new THREE.Mesh(
    new THREE.BoxGeometry(1.06, 0.08, 3.3),
    cockpitDark,
  );
  tubFloor.position.set(0, 2.44, 3.05);
  cockpit.add(tubFloor);
  for (const side of [-1, 1]) {
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.3, 3.3),
      cockpitDark,
    );
    wall.position.set(side * 0.52, 2.5, 3.05);
    cockpit.add(wall);
  }
  const bulkheadRear = new THREE.Mesh(
    new THREE.BoxGeometry(1.04, 0.42, 0.07),
    cockpitDark,
  );
  bulkheadRear.position.set(0, 2.42, 1.72);
  cockpit.add(bulkheadRear);
  const bulkheadFront = new THREE.Mesh(
    new THREE.BoxGeometry(1.04, 0.42, 0.07),
    cockpitDark,
  );
  bulkheadFront.position.set(0, 2.42, 4.42);
  cockpit.add(bulkheadFront);

  // 仪表台 + 三块多功能显示器（canvas 屏幕）
  const panelGroup = new THREE.Group();
  panelGroup.position.set(0, 2.54, 4.36);
  panelGroup.rotation.x = -1.05;
  cockpit.add(panelGroup);
  const panelBox = new THREE.Mesh(
    new THREE.BoxGeometry(1.02, 0.56, 0.07),
    cockpitDark,
  );
  panelGroup.add(panelBox);
  const screenGeometry = new THREE.PlaneGeometry(0.4, 0.32);
  const screenMain = new THREE.Mesh(screenGeometry, mfdScreen);
  screenMain.rotation.y = Math.PI;
  screenMain.position.set(0, 0.02, -0.05);
  panelGroup.add(screenMain);
  const screenSideGeometry = new THREE.PlaneGeometry(0.22, 0.26);
  const screenLeft = new THREE.Mesh(screenSideGeometry, mfdMap);
  screenLeft.rotation.y = Math.PI;
  screenLeft.position.set(-0.35, 0.02, -0.05);
  panelGroup.add(screenLeft);
  const screenRight = new THREE.Mesh(screenSideGeometry, mfdStore);
  screenRight.rotation.y = Math.PI;
  screenRight.position.set(0.35, 0.02, -0.05);
  panelGroup.add(screenRight);
  // 三块屏幕的浅灰边框（贴合台面，屏面留空）
  {
    const bezels: THREE.BufferGeometry[] = [];
    const addBezel = (width: number, height: number, px: number, py: number) => {
      const bars: [number, number, number, number][] = [
        [width + 0.05, 0.022, 0, height / 2 + 0.014],
        [width + 0.05, 0.022, 0, -height / 2 - 0.014],
        [0.022, height + 0.01, width / 2 + 0.014, 0],
        [0.022, height + 0.01, -width / 2 - 0.014, 0],
      ];
      for (const [bw, bh, ox, oy] of bars) {
        const bar = bevelBoxGeometry(bw, bh, 0.02, 0.005);
        bar.translate(px + ox, py + oy, -0.05);
        bezels.push(bar);
      }
    };
    addBezel(0.4, 0.32, 0, 0.02);
    addBezel(0.22, 0.26, -0.35, 0.02);
    addBezel(0.22, 0.26, 0.35, 0.02);
    mergeInto(panelGroup, bezels, cockpitGrey, "MfdBezels", false);
  }
  // 台面小开关与旋钮
  for (let knob = 0; knob < 6; knob += 1) {
    const switchMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.03, 0.03),
      knob % 3 === 0 ? redMark : cockpitGrey,
    );
    switchMesh.position.set(-0.44 + knob * 0.07, -0.24, -0.05);
    panelGroup.add(switchMesh);
  }

  // 平显（宽全息 HUD）：投影盒 + 发光符号玻璃
  const hudGroup = new THREE.Group();
  hudGroup.position.set(0, 2.86, 4.3);
  cockpit.add(hudGroup);
  const hudGlassMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.66, 0.36),
    hudGlass,
  );
  hudGlassMesh.rotation.x = -0.32;
  hudGroup.add(hudGlassMesh);
  const hudFrameBar = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 0.03, 0.03),
    cockpitDark,
  );
  hudFrameBar.position.set(0, 0.19, 0.06);
  hudGroup.add(hudFrameBar);
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(
      new THREE.BoxGeometry(0.03, 0.4, 0.03),
      cockpitDark,
    );
    post.position.set(side * 0.34, 0, 0.06);
    hudGroup.add(post);
  }
  const projector = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.14, 0.22),
    cockpitDark,
  );
  projector.position.set(0, -0.24, 0.14);
  hudGroup.add(projector);
  const projectorLens = new THREE.Mesh(
    new THREE.PlaneGeometry(0.26, 0.08),
    hudGlass,
  );
  projectorLens.rotation.x = -Math.PI / 2 + 0.4;
  projectorLens.position.set(0, -0.16, 0.06);
  hudGroup.add(projectorLens);
  // 仪表台遮光罩（防眩板内侧深色罩，宽度避开舱盖玻璃）
  const coaming = new THREE.Mesh(
    bevelBoxGeometry(1.0, 0.06, 0.36, 0.012),
    cockpitDark,
  );
  coaming.position.set(0, 2.7, 4.24);
  coaming.rotation.x = -0.42;
  cockpit.add(coaming);

  // 弹射座椅（头枕 / 靠背 / 座盆 / 侧轨 / 安全带 / 拉环）
  const seatGroup = new THREE.Group();
  seatGroup.position.set(0, 2.44, 2.45);
  cockpit.add(seatGroup);
  const seatPan = new THREE.Mesh(
    new THREE.BoxGeometry(0.46, 0.1, 0.5),
    seatGreen,
  );
  seatPan.position.set(0, 0.05, 0.1);
  seatGroup.add(seatPan);
  const seatBack = new THREE.Mesh(
    new THREE.BoxGeometry(0.46, 0.72, 0.12),
    seatGreen,
  );
  seatBack.position.set(0, 0.42, -0.16);
  seatBack.rotation.x = 0.16;
  seatGroup.add(seatBack);
  const headrest = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.22, 0.14),
    black,
  );
  headrest.position.set(0, 0.82, -0.22);
  seatGroup.add(headrest);
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.8, 0.1), metal);
    rail.position.set(side * 0.27, 0.42, -0.16);
    rail.rotation.x = 0.16;
    seatGroup.add(rail);
    const strap = new THREE.Mesh(
      new THREE.BoxGeometry(0.07, 0.5, 0.02),
      cockpitGrey,
    );
    strap.position.set(side * 0.12, 0.42, 0.02);
    strap.rotation.x = 0.2;
    seatGroup.add(strap);
  }
  const ejectHandle = new THREE.Mesh(
    new THREE.TorusGeometry(0.075, 0.018, 6, 10, Math.PI),
    redMark,
  );
  ejectHandle.rotation.x = Math.PI / 2;
  ejectHandle.position.set(0, 0.42, 0.1);
  seatGroup.add(ejectHandle);
  // 座椅分件：座盆导轨 / 侧围板 / 救生包 / 头顶拉环滑轨
  {
    const seatParts: THREE.BufferGeometry[] = [];
    for (const side of [-1, 1]) {
      const railGuide = bevelBoxGeometry(0.06, 0.07, 0.66, 0.01);
      railGuide.translate(side * 0.27, -0.02, -0.02);
      seatParts.push(railGuide);
      const sidePanel = bevelBoxGeometry(0.05, 0.3, 0.42, 0.01);
      sidePanel.translate(side * 0.26, 0.22, 0.02);
      seatParts.push(sidePanel);
    }
    const survivalKit = bevelBoxGeometry(0.36, 0.13, 0.42, 0.012);
    survivalKit.translate(0, -0.06, 0.1);
    seatParts.push(survivalKit);
    const headRail = bevelBoxGeometry(0.2, 0.06, 0.08, 0.01);
    headRail.translate(0, 0.9, -0.24);
    seatParts.push(headRail);
    mergeInto(seatGroup, seatParts, greyDark, "SeatFrame", false);
  }

  // I-3 乘位锚点：飞行员第一人称眼位（座盆顶 2.54 上方 0.62、靠背平面 z 2.35 前方 0.27）。
  // StationCamera 按名字查找 "station:<id>"；挂在 Cockpit 下随 airframe 机动。
  const pilotStation = new THREE.Group();
  pilotStation.name = "station:pilot";
  pilotStation.position.set(0, 3.16, 2.62);
  cockpit.add(pilotStation);

  // 侧操纵杆（右台）
  const stickGroup = new THREE.Group();
  stickGroup.position.set(0.4, 2.52, 3.5);
  cockpit.add(stickGroup);
  const stickBase = new THREE.Mesh(
    new THREE.BoxGeometry(0.14, 0.1, 0.3),
    cockpitDark,
  );
  stickGroup.add(stickBase);
  const stick = new THREE.Mesh(
    new THREE.CylinderGeometry(0.022, 0.03, 0.26, 8),
    black,
  );
  stick.position.y = 0.17;
  stick.rotation.x = -0.12;
  stickGroup.add(stick);
  const stickGrip = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.035, 0.14, 3, 8),
    black,
  );
  stickGrip.position.set(0, 0.32, -0.03);
  stickGrip.rotation.x = -0.12;
  stickGroup.add(stickGrip);

  // 双油门杆（左台）
  const throttleGroup = new THREE.Group();
  throttleGroup.position.set(-0.4, 2.54, 3.3);
  cockpit.add(throttleGroup);
  const throttleBase = new THREE.Mesh(
    new THREE.BoxGeometry(0.16, 0.12, 0.5),
    cockpitDark,
  );
  throttleGroup.add(throttleBase);
  for (const side of [-1, 1]) {
    const lever = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.2, 0.06), black);
    lever.position.set(side * 0.045, 0.14, 0.08);
    lever.rotation.x = -0.3;
    throttleGroup.add(lever);
  }

  // 脚舵（踏板 + 摆臂）
  for (const side of [-1, 1]) {
    const pedal = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.12, 0.05),
      cockpitGrey,
    );
    pedal.position.set(side * 0.17, 2.5, 4.22);
    pedal.rotation.x = -0.5;
    cockpit.add(pedal);
    const arm = new THREE.Mesh(
      bevelBoxGeometry(0.05, 0.05, 0.3, 0.008),
      cockpitDark,
    );
    arm.position.set(side * 0.17, 2.56, 4.32);
    arm.rotation.x = 0.9;
    cockpit.add(arm);
  }

  // 侧台开关板（InstancedMesh 小开关 + 面板底）
  for (const side of [-1, 1]) {
    const console_ = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.08, 1.5),
      cockpitDark,
    );
    console_.position.set(side * 0.45, 2.5, 3.4);
    cockpit.add(console_);
  }
  {
    const switchGeometry = new THREE.BoxGeometry(0.02, 0.02, 0.035);
    const switches = new THREE.InstancedMesh(switchGeometry, cockpitGrey, 48);
    const matrix = new THREE.Matrix4();
    for (let index = 0; index < 48; index += 1) {
      const side = index % 2 === 0 ? -1 : 1;
      const slot = Math.floor(index / 2);
      matrix.identity();
      matrix.setPosition(side * 0.44, 2.55, 2.75 + (slot % 12) * 0.12);
      switches.setMatrixAt(index, matrix);
    }
    switches.instanceMatrix.needsUpdate = true;
    cockpit.add(switches);
  }
  // 侧台旋钮列 + 指示灯（外缘一排，与开关板分离）
  {
    const knobParts: THREE.BufferGeometry[] = [];
    for (const side of [-1, 1]) {
      for (let i = 0; i < 7; i += 1) {
        const knob = new THREE.CylinderGeometry(0.022, 0.022, 0.045, 8);
        knob.translate(side * 0.5, 2.56, 2.82 + i * 0.16);
        knobParts.push(knob);
        if (i % 2 === 0) {
          const lamp = new THREE.CylinderGeometry(0.012, 0.012, 0.014, 6);
          lamp.translate(side * 0.5, 2.585, 2.9 + i * 0.16);
          knobParts.push(lamp);
        }
      }
    }
    mergeInto(cockpit, knobParts, cockpitGrey, "ConsoleKnobs", false);
  }

  // 飞行员（橙色飞行服，可见于舱内）
  const pilot = new THREE.Group();
  pilot.name = "Pilot";
  cockpit.add(pilot);
  const torso = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.17, 0.34, 4, 10),
    pilotSuit,
  );
  torso.position.set(0, 2.86, 2.52);
  torso.rotation.x = -0.12;
  pilot.add(torso);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 14, 10),
    pilotHelmet,
  );
  head.position.set(0, 3.16, 2.56);
  pilot.add(head);
  const visor = new THREE.Mesh(
    new THREE.SphereGeometry(0.121, 14, 10, 0, Math.PI * 2, 0.5, 1.1),
    pilotVisor,
  );
  visor.position.copy(head.position);
  visor.rotation.x = -1.25;
  pilot.add(visor);
  const mask = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.1, 0.1), black);
  mask.position.set(0, 3.1, 2.66);
  pilot.add(mask);
  // 四肢
  pilot.add(limb([0.2, 3.02, 2.5], [0.33, 2.8, 3.08], 0.055, pilotSuit));
  pilot.add(limb([0.33, 2.8, 3.08], [0.4, 2.72, 3.48], 0.05, pilotSuit));
  pilot.add(limb([-0.2, 3.02, 2.5], [-0.36, 2.78, 2.98], 0.055, pilotSuit));
  pilot.add(limb([-0.36, 2.78, 2.98], [-0.41, 2.68, 3.34], 0.05, pilotSuit));
  pilot.add(limb([0.16, 2.6, 2.7], [0.2, 2.52, 3.4], 0.085, pilotSuit));
  pilot.add(limb([0.2, 2.52, 3.4], [0.17, 2.5, 4.14], 0.07, pilotSuit));
  pilot.add(limb([-0.16, 2.6, 2.7], [-0.2, 2.52, 3.4], 0.085, pilotSuit));
  pilot.add(limb([-0.2, 2.52, 3.4], [-0.17, 2.5, 4.14], 0.07, pilotSuit));
  const gloveL = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), black);
  gloveL.position.set(-0.41, 2.66, 3.4);
  pilot.add(gloveL);
  const gloveR = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), black);
  gloveR.position.set(0.4, 2.7, 3.54);
  pilot.add(gloveR);
  const bootL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.09, 0.18), black);
  bootL.position.set(-0.17, 2.49, 4.2);
  pilot.add(bootL);
  const bootR = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.09, 0.18), black);
  bootR.position.set(0.17, 2.49, 4.2);
  pilot.add(bootR);

  // ---------- 座舱盖（后铰链上翻） ----------
  const canopyHinge = new THREE.Group();
  canopyHinge.name = "CanopyHinge";
  canopyHinge.position.set(0, 2.84, 1.5);
  airframe.add(canopyHinge);
  {
    const sections = [
      { z: 3.55, hw: 0.3, top: 0.06, base: -0.24 },
      { z: 3.3, hw: 0.44, top: 0.2, base: -0.26 },
      { z: 2.9, hw: 0.52, top: 0.4, base: -0.28 },
      { z: 2.3, hw: 0.57, top: 0.56, base: -0.3 },
      { z: 1.5, hw: 0.58, top: 0.62, base: -0.3 },
      { z: 0.7, hw: 0.55, top: 0.56, base: -0.28 },
      { z: 0.1, hw: 0.46, top: 0.4, base: -0.2 },
      { z: -0.25, hw: 0.34, top: 0.14, base: -0.12 },
    ];
    const ringCount = 17;
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    sections.forEach((section, sIndex) => {
      for (let i = 0; i < ringCount; i += 1) {
        const t = i / (ringCount - 1);
        const angle = Math.PI * t;
        const x = -Math.cos(angle) * section.hw;
        const y = section.base + (section.top - section.base) * Math.sin(angle);
        positions.push(x, y, section.z);
        uvs.push(t, sIndex / (sections.length - 1));
      }
    });
    for (let s = 0; s < sections.length - 1; s += 1) {
      for (let i = 0; i < ringCount - 1; i += 1) {
        const a = s * ringCount + i;
        const b = a + 1;
        const c = (s + 1) * ringCount + i + 1;
        const d = (s + 1) * ringCount + i;
        indices.push(a, b, c, a, c, d);
      }
    }
    const canopyGeometry = new THREE.BufferGeometry();
    canopyGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    canopyGeometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    canopyGeometry.setIndex(indices);
    canopyGeometry.computeVertexNormals();
    const canopyGlass = new THREE.Mesh(canopyGeometry, glass);
    canopyHinge.add(canopyGlass);
    // 风挡前框与后框（沿玻璃截面采样成管，贴合座舱盖曲面）
    const archCurve = (
      rx: number,
      ry: number,
      base: number,
      zAt: number,
      scale: number,
      lift: number,
    ) => {
      const points: THREE.Vector3[] = [];
      for (let i = 0; i <= 8; i += 1) {
        const angle = (i / 8) * Math.PI;
        points.push(
          new THREE.Vector3(
            -Math.cos(angle) * rx * scale,
            base + ry * Math.sin(angle) * scale + lift,
            zAt,
          ),
        );
      }
      return new THREE.CatmullRomCurve3(points);
    };
    const archFront = new THREE.Mesh(
      new THREE.TubeGeometry(archCurve(0.44, 0.46, -0.26, 3.3, 1.012, 0.01), 14, 0.027, 6, false),
      edge,
    );
    archFront.name = "CanopyBowFront";
    canopyHinge.add(archFront);
    const archRear = new THREE.Mesh(
      new THREE.TubeGeometry(archCurve(0.552, 0.852, -0.285, 0.9, 1.008, 0.008), 14, 0.026, 6, false),
      edge,
    );
    archRear.name = "CanopyBowRear";
    canopyHinge.add(archRear);
    // 后视镜 ×2（前框两侧，镜面朝后下）
    for (const side of [-1, 1]) {
      const bracket = new THREE.Mesh(
        new THREE.CylinderGeometry(0.012, 0.012, 0.14, 6),
        greyDark,
      );
      bracket.position.set(side * 0.34, 0.16, 3.28);
      bracket.rotation.x = 0.9;
      canopyHinge.add(bracket);
      const mirror = new THREE.Mesh(
        new THREE.PlaneGeometry(0.11, 0.16),
        pilotVisor,
      );
      mirror.position.set(side * 0.34, 0.1, 3.24);
      mirror.rotation.order = "YXZ";
      mirror.rotation.set(2.84, side * 0.35, 0);
      canopyHinge.add(mirror);
    }
    // 舱盖底座边条
    for (const side of [-1, 1]) {
      const sill = new THREE.Mesh(
        new THREE.BoxGeometry(0.07, 0.07, 3.6),
        greyDark,
      );
      sill.position.set(side * 0.52, -0.28, 1.6);
      canopyHinge.add(sill);
    }
    // 后铰链支座
    const hingeBlock = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.14, 0.24),
      greyDark,
    );
    hingeBlock.position.set(0, -0.16, -0.1);
    canopyHinge.add(hingeBlock);
    // 舱盖热点
    const canopyHotspot = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 0.5, 3.2),
      hotspotMaterial,
    );
    canopyHotspot.name = "hotspot:OpenCanopy";
    canopyHotspot.position.set(0, 0.44, 1.5);
    canopyHinge.add(canopyHotspot);
  }

  // ---------- 其他热点 ----------
  {
    const nozzleHotspot = new THREE.Mesh(
      new THREE.BoxGeometry(2.8, 1.6, 1.4),
      hotspotMaterial,
    );
    nozzleHotspot.name = "hotspot:Takeoff";
    nozzleHotspot.position.set(0, 2.06, -10.3);
    airframe.add(nozzleHotspot);
    const gearHotspot = new THREE.Mesh(
      new THREE.BoxGeometry(4.0, 1.8, 3.0),
      hotspotMaterial,
    );
    gearHotspot.name = "hotspot:Landing";
    gearHotspot.position.set(0, 0.82, -2.3);
    airframe.add(gearHotspot);
    for (const side of [-1, 1]) {
      const wingHotspot = new THREE.Mesh(
        new THREE.BoxGeometry(4.6, 0.14, 3.6),
        hotspotMaterial,
      );
      wingHotspot.name = "hotspot:Cruise";
      wingHotspot.position.set(side * 3.7, 0.09, -4.1);
      (side > 0 ? wingR.group : wingL.group).add(wingHotspot);
    }
  }

  // ---------- 动画数据准备 ----------
  // 巡航闭环：围绕展台上空的高椭圆盘旋（俯仰滚转 + 操纵面 + 加力焰）。
  const cruiseCenter = new THREE.Vector3(0, 11.5, -1);
  const cruiseStartAngle = Math.asin(11 / 16);
  const cruiseSamples: {
    position: THREE.Vector3;
    yaw: number;
    pitch: number;
    roll: number;
  }[] = [];
  const cruiseCount = 25;
  const cruiseDuration = 9.5;
  const cruiseClockwise = 1; // 左盘旋（左倾）
  for (let index = 0; index < cruiseCount; index += 1) {
    const t = index / (cruiseCount - 1);
    const angle = cruiseStartAngle + t * Math.PI * 2;
    const position = new THREE.Vector3(
      cruiseCenter.x + 16 * Math.sin(angle),
      cruiseCenter.y +
        0.35 * Math.sin(angle * 2 + 0.6) -
        0.1 * Math.sin(angle * 3),
      cruiseCenter.z + 17 * Math.cos(angle),
    );
    // 切线方向（左旋）：对角度求导并归一化。
    const tangent = new THREE.Vector3(
      Math.cos(angle) * cruiseClockwise,
      0,
      -Math.sin(angle) * cruiseClockwise,
    ).normalize();
    const yaw = Math.atan2(tangent.x, tangent.z);
    const bob = 0.02 * Math.sin(angle * 2 + 1.2);
    cruiseSamples.push({
      position,
      yaw,
      pitch: 0.04 + bob,
      roll: 0.44 + 0.05 * Math.sin(angle * 2),
    });
  }
  const cruiseStart = cruiseSamples[0];

  // 盘旋/下滑路径积分：按转弯率推进，得到位置与朝向；再做平滑漂移修正到目标点。
  const buildTurnPath = (options: {
    start: [number, number, number];
    yawStart: number;
    yawEnd: number;
    radiusStart: number;
    radiusEnd: number;
    heightStart: number;
    heightEnd: number;
    heightBias: number;
    count: number;
    alignTarget?: [number, number, number];
  }) => {
    const {
      start,
      yawStart,
      yawEnd,
      radiusStart,
      radiusEnd,
      heightStart,
      heightEnd,
      heightBias,
      count,
      alignTarget,
    } = options;
    const positions: THREE.Vector3[] = [];
    const position = new THREE.Vector3(start[0], start[1], start[2]);
    const step = (yawEnd - yawStart) / (count - 1);
    for (let index = 0; index < count; index += 1) {
      const t = index / (count - 1);
      const radius = radiusStart + (radiusEnd - radiusStart) * t;
      const heading = yawStart + step * index;
      positions.push(position.clone());
      if (index < count - 1) {
        const mid = heading + step * 0.5;
        const distance = radius * Math.abs(step);
        position.x += Math.sin(mid) * distance;
        position.z += Math.cos(mid) * distance;
      }
    }
    // 高度曲线：bias>=1 为“快起慢收”（爬升后收平）；bias<1 为两端柔和的 S 曲线（落地放平）。
    const heights = positions.map((_, index) => {
      const t = index / (count - 1);
      const curved =
        heightBias >= 1 ? 1 - (1 - t) ** heightBias : t * t * (3 - 2 * t);
      return heightStart + (heightEnd - heightStart) * curved;
    });
    if (alignTarget) {
      const target = new THREE.Vector3(
        alignTarget[0],
        alignTarget[1],
        alignTarget[2],
      );
      const delta = target.clone().sub(positions[count - 1]);
      positions.forEach((item, index) => {
        const t = index / (count - 1);
        const weight = t * t * (3 - 2 * t);
        item.add(delta.clone().multiplyScalar(weight));
      });
      positions.forEach((item, index) => {
        item.y = heights[index];
        if (index === count - 1) item.y = alignTarget[1];
      });
    } else {
      positions.forEach((item, index) => {
        item.y = heights[index];
      });
    }
    const yaws = positions.map((_, index) => yawStart + step * index);
    const pitches = positions.map((_item, index) => {
      const previous = positions[Math.max(index - 1, 0)];
      const next = positions[Math.min(index + 1, count - 1)];
      const delta = next.clone().sub(previous);
      const flat = Math.hypot(delta.x, delta.z);
      return -Math.atan2(delta.y, Math.max(flat, 0.001)) * 0.85;
    });
    return { positions, yaws, pitches };
  };

  // 起飞：地面滑跑 + 爬升左转（终点对齐巡航起始位姿）。
  const takeoffRun: THREE.Vector3[] = [
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, 1.0),
    new THREE.Vector3(0, 0, 3.0),
    new THREE.Vector3(0, 0, 6.0),
    new THREE.Vector3(0, 0.28, 9.4),
    new THREE.Vector3(0, 0.85, 12.3),
  ];
  const takeoffClimb = buildTurnPath({
    start: [0, 1.5, 13.4],
    yawStart: 0,
    yawEnd: cruiseStart.yaw,
    radiusStart: 9.5,
    radiusEnd: 13.5,
    heightStart: 2.2,
    heightEnd: cruiseStart.position.y,
    heightBias: 1.35,
    count: 17,
    alignTarget: [
      cruiseStart.position.x,
      cruiseStart.position.y,
      cruiseStart.position.z,
    ],
  });
  const takeoffPositions = [...takeoffRun, ...takeoffClimb.positions];
  const takeoffTimes: number[] = [];
  const takeoffPitch: number[] = [];
  const takeoffYaw: number[] = [];
  const takeoffRoll: number[] = [];
  // 时间轴：0~0.6 点火，0.6~4.6 滑跑，5.0~12 爬升
  const runTimes = [0, 0.6, 1.6, 2.6, 3.6, 4.6];
  const climbCount = takeoffClimb.positions.length;
  const climbTimes = takeoffClimb.positions.map(
    (_, index) => 5.0 + (index / (climbCount - 1)) * 7,
  );
  for (let index = 0; index < takeoffPositions.length; index += 1) {
    if (index < runTimes.length) {
      takeoffTimes.push(runTimes[index]);
      takeoffPitch.push([0, 0, -0.01, -0.03, -0.09, -0.2][index]);
      takeoffYaw.push(0);
      takeoffRoll.push(0);
    } else {
      const climbIndex = index - runTimes.length;
      takeoffTimes.push(climbTimes[climbIndex]);
      takeoffPitch.push(takeoffClimb.pitches[climbIndex] * 0.9);
      takeoffYaw.push(takeoffClimb.yaws[climbIndex]);
      takeoffRoll.push(0.42 * Math.min(1, Math.max(0, (climbIndex - 3) / 8)));
    }
  }
  takeoffTimes[takeoffTimes.length - 1] = 12;
  const takeoffEulers = takeoffPitch.map((pitch, index) => [
    pitch,
    takeoffYaw[index],
    takeoffRoll[index],
  ]);

  // 降落：从巡航起始位姿下滑盘旋 + 触地滑跑停稳。
  const landingTurn = buildTurnPath({
    start: [
      cruiseStart.position.x,
      cruiseStart.position.y,
      cruiseStart.position.z,
    ],
    yawStart: cruiseStart.yaw,
    yawEnd: cruiseStart.yaw + 3.72,
    radiusStart: 16.5,
    radiusEnd: 10,
    heightStart: cruiseStart.position.y,
    heightEnd: 0,
    heightBias: 0.35,
    count: 24,
    alignTarget: [0, 0, -1.6],
  });
  const landingPositions = [
    ...landingTurn.positions,
    new THREE.Vector3(0, 0, -1.0),
    new THREE.Vector3(0, 0, -0.4),
    new THREE.Vector3(0, 0, 0),
  ];
  const landingStartTime = 0;
  const landingTurnEnd = 10.6;
  const landingTimes: number[] = [];
  for (let index = 0; index < landingTurn.positions.length; index += 1) {
    landingTimes.push(
      landingStartTime +
        (index / (landingTurn.positions.length - 1)) * landingTurnEnd,
    );
  }
  landingTimes.push(11.6, 12.4, 13);
  const landingPitch: number[] = [];
  const landingRoll: number[] = [];
  for (let index = 0; index < landingPositions.length; index += 1) {
    if (index < landingTurn.positions.length) {
      const t = index / (landingTurn.positions.length - 1);
      landingPitch.push(landingTurn.pitches[index] + 0.05 * t);
      landingRoll.push(0.42 * Math.min(1, Math.max(0, 1 - t * 1.45)));
    } else {
      landingPitch.push(index === landingPositions.length - 1 ? 0 : 0.03);
      landingRoll.push(0);
    }
  }
  // 收尾：落地后机头对正 +z 停稳（偏航平滑收敛到 2π ≡ 朝 +z）。
  const landingYawEnd = cruiseStart.yaw + 3.72;
  const finalYaw: number[] = [];
  for (let index = 0; index < landingPositions.length; index += 1) {
    if (index < landingTurn.positions.length) {
      finalYaw.push(landingTurn.yaws[index]);
    } else {
      const t =
        (index - landingTurn.positions.length + 1) /
        (landingPositions.length - landingTurn.positions.length);
      const eased = t * t * (3 - 2 * t);
      finalYaw.push(landingYawEnd + (Math.PI * 2 - landingYawEnd) * eased);
    }
  }
  const landingEulers = landingPitch.map((pitch, index) => [
    pitch,
    finalYaw[index],
    landingRoll[index],
  ]);

  // ---------- 动画片段组装 ----------
  // “停机复位”名单：Idle 用单帧钉住所有可动节点；其余片段自动为未涉及的状态件补 pin 轨道，
  // 保证任意动作切换后没有残留姿态（提升舱盖、收放起落架、导弹发射等状态都回位）。
  const PIN_TIMES = [0, 1];
  const homeScale: [number, number, number] = [1, 1, 1];
  const flameOff: [number, number, number] = [0.001, 0.001, 0.001];
  const pins: Record<string, () => THREE.KeyframeTrack[]> = {
    airframe: () => [
      posKeys("J20Airframe", PIN_TIMES, [
        [0, GROUND, 0],
        [0, GROUND, 0],
      ]),
      quatKeys("J20Airframe", PIN_TIMES, [
        [0, 0, 0],
        [0, 0, 0],
      ]),
    ],
    canopy: () => [numKeys("CanopyHinge.rotation[x]", PIN_TIMES, [0, 0])],
    flaperons: () => [
      numKeys("FlaperonR.rotation[x]", PIN_TIMES, [0, 0]),
      numKeys("FlaperonL.rotation[x]", PIN_TIMES, [0, 0]),
    ],
    ailerons: () => [
      numKeys("AileronR.rotation[x]", PIN_TIMES, [0, 0]),
      numKeys("AileronL.rotation[x]", PIN_TIMES, [0, 0]),
    ],
    canards: () => [
      numKeys("CanardR.rotation[x]", PIN_TIMES, [0, 0]),
      numKeys("CanardL.rotation[x]", PIN_TIMES, [0, 0]),
    ],
    vtials: () => [
      numKeys("VtailR.rotation[y]", PIN_TIMES, [0, 0]),
      numKeys("VtailL.rotation[y]", PIN_TIMES, [0, 0]),
    ],
    gears: () => [
      numKeys("GearNose.rotation[x]", PIN_TIMES, [0, 0]),
      numKeys("GearMainR.rotation[x]", PIN_TIMES, [0, 0]),
      numKeys("GearMainL.rotation[x]", PIN_TIMES, [0, 0]),
      scaleKeys("GearNose", PIN_TIMES, [homeScale, homeScale]),
      scaleKeys("GearMainR", PIN_TIMES, [homeScale, homeScale]),
      scaleKeys("GearMainL", PIN_TIMES, [homeScale, homeScale]),
    ],
    doors: () => [
      numKeys("NoseDoorR.rotation[z]", PIN_TIMES, [0, 0]),
      numKeys("NoseDoorL.rotation[z]", PIN_TIMES, [0, 0]),
      numKeys("MainDoorR.rotation[z]", PIN_TIMES, [0, 0]),
      numKeys("MainDoorL.rotation[z]", PIN_TIMES, [0, 0]),
    ],
    wheels: () => [
      numKeys("WheelNose.rotation[x]", PIN_TIMES, [0, 0]),
      numKeys("WheelMainR.rotation[x]", PIN_TIMES, [0, 0]),
      numKeys("WheelMainL.rotation[x]", PIN_TIMES, [0, 0]),
    ],
    flames: () => [
      scaleKeys("FlameR", PIN_TIMES, [flameOff, flameOff]),
      scaleKeys("FlameL", PIN_TIMES, [flameOff, flameOff]),
    ],
    missiles: () => [
      posKeys("MissileR", PIN_TIMES, [
        [2.72, 1.36, -4.3],
        [2.72, 1.36, -4.3],
      ]),
      posKeys("MissileL", PIN_TIMES, [
        [-2.72, 1.36, -4.3],
        [-2.72, 1.36, -4.3],
      ]),
      quatKeys("MissileR", PIN_TIMES, [
        [0, 0, 0],
        [0, 0, 0],
      ]),
      quatKeys("MissileL", PIN_TIMES, [
        [0, 0, 0],
        [0, 0, 0],
      ]),
      scaleKeys("MissileR", PIN_TIMES, [homeScale, homeScale]),
      scaleKeys("MissileL", PIN_TIMES, [homeScale, homeScale]),
      scaleKeys("MissileFlameR", PIN_TIMES, [flameOff, flameOff]),
      scaleKeys("MissileFlameL", PIN_TIMES, [flameOff, flameOff]),
    ],
  };
  // 烟团与爆点的复位轨道跟随各自命名生成。
  pins.smoke = () =>
    smokePuffs.flatMap((puff) => [
      scaleKeys(puff.mesh.name, PIN_TIMES, [flameOff, flameOff]),
      numKeys(`${puff.mesh.name}.material.opacity`, PIN_TIMES, [0.5, 0.5]),
    ]);
  pins.booms = () =>
    booms.flatMap((boomItem) => [
      scaleKeys(`Boom${boomItem.tag}`, PIN_TIMES, [flameOff, flameOff]),
      numKeys(`BoomFlash${boomItem.tag}.material.opacity`, PIN_TIMES, [1, 1]),
      scaleKeys(`BoomSmoke${boomItem.tag}`, PIN_TIMES, [homeScale, homeScale]),
      numKeys(
        `BoomSmoke${boomItem.tag}.material.opacity`,
        PIN_TIMES,
        [0.75, 0.75],
      ),
    ]);

  // 组装片段：把该动作显式驱动的状态件从 pin 名单里排除，其余自动补钉。
  const buildClip = (
    name: string,
    duration: number,
    driven: string[],
    tracks: THREE.KeyframeTrack[],
  ) => {
    for (const key of Object.keys(pins)) {
      if (!driven.includes(key)) tracks.push(...pins[key]());
    }
    return new THREE.AnimationClip(name, duration, tracks);
  };

  // Idle：停机复位——所有可动节点钉在初始位姿（暂停在 t=0 即静止展示）。
  const idleClip = buildClip("Idle", 1, [], []);

  // 开盖：绕后铰链上翻（带一点过冲再回稳）。
  const openCanopyClip = buildClip(
    "OpenCanopy",
    2.6,
    ["canopy"],
    [
      numKeys(
        "CanopyHinge.rotation[x]",
        [0, 1.8, 2.2, 2.6],
        [0, -0.68, -0.6, -0.62],
      ),
    ],
  );

  // 关盖：先微抬再落回闭合并轻微过冲。
  const closeCanopyClip = buildClip(
    "CloseCanopy",
    2.2,
    ["canopy"],
    [
      numKeys(
        "CanopyHinge.rotation[x]",
        [0, 0.35, 1.7, 2.2],
        [-0.62, -0.66, -0.02, 0],
      ),
    ],
  );

  // Takeoff：点火→滑跑→抬头→爬升左转→收起落架（结尾对齐巡航起始位姿）。
  const runDistances = [0, 1.0, 3.0, 6.0, 9.4, 12.3];
  const spinTimes = [...runTimes, 5.4];
  const spinValues = (radius: number) => [
    ...runDistances.map((distance) => distance / radius),
    12.3 / radius,
  ];
  const takeoffClip = buildClip(
    "Takeoff",
    12,
    [
      "airframe",
      "flaperons",
      "ailerons",
      "canards",
      "vtials",
      "wheels",
      "gears",
      "doors",
      "flames",
    ],
    [
      posKeys(
        "J20Airframe",
        takeoffTimes,
        takeoffPositions.map((item) => [item.x, item.y, item.z]),
      ),
      quatKeys("J20Airframe", takeoffTimes, takeoffEulers),
      numKeys("WheelNose.rotation[x]", spinTimes, spinValues(0.36)),
      numKeys("WheelMainR.rotation[x]", spinTimes, spinValues(0.44)),
      numKeys("WheelMainL.rotation[x]", spinTimes, spinValues(0.44)),
      numKeys(
        "FlaperonR.rotation[x]",
        [0, 1.6, 4.6, 5.6, 7.5],
        [-0.26, -0.26, -0.24, -0.14, -0.05],
      ),
      numKeys(
        "FlaperonL.rotation[x]",
        [0, 1.6, 4.6, 5.6, 7.5],
        [-0.26, -0.26, -0.24, -0.14, -0.05],
      ),
      numKeys(
        "AileronL.rotation[x]",
        [0, 5.2, 6.6, 8.2, 12],
        [0, 0, 0.06, 0.05, 0.04],
      ),
      numKeys(
        "AileronR.rotation[x]",
        [0, 5.2, 6.6, 8.2, 12],
        [0, 0, -0.06, -0.05, -0.04],
      ),
      numKeys(
        "CanardR.rotation[x]",
        [0, 3.2, 4.4, 5.6, 7.5, 12],
        [0, 0, -0.3, -0.16, -0.08, -0.05],
      ),
      numKeys(
        "CanardL.rotation[x]",
        [0, 3.2, 4.4, 5.6, 7.5, 12],
        [0, 0, -0.3, -0.16, -0.08, -0.05],
      ),
      numKeys("VtailR.rotation[y]", [0, 5.2, 6.6, 12], [0, 0, 0.15, 0.12]),
      numKeys("VtailL.rotation[y]", [0, 5.2, 6.6, 12], [0, 0, 0.15, 0.12]),
      numKeys("GearNose.rotation[x]", [0, 5.6, 6.9], [0, 0, 1.85]),
      numKeys("GearMainR.rotation[x]", [0, 5.6, 6.9], [0, 0, 1.85]),
      numKeys("GearMainL.rotation[x]", [0, 5.6, 6.9], [0, 0, 1.85]),
      scaleKeys("GearNose", [0, 6.5, 7.0], [homeScale, homeScale, flameOff]),
      scaleKeys("GearMainR", [0, 6.5, 7.0], [homeScale, homeScale, flameOff]),
      scaleKeys("GearMainL", [0, 6.5, 7.0], [homeScale, homeScale, flameOff]),
      numKeys(
        "NoseDoorR.rotation[z]",
        [0, 5.0, 5.6, 7.0, 7.7],
        [0, 0, -0.9, -0.9, 0],
      ),
      numKeys(
        "NoseDoorL.rotation[z]",
        [0, 5.0, 5.6, 7.0, 7.7],
        [0, 0, 0.9, 0.9, 0],
      ),
      numKeys(
        "MainDoorR.rotation[z]",
        [0, 5.0, 5.6, 7.0, 7.7],
        [0, 0, -0.9, -0.9, 0],
      ),
      numKeys(
        "MainDoorL.rotation[z]",
        [0, 5.0, 5.6, 7.0, 7.7],
        [0, 0, 0.9, 0.9, 0],
      ),
      scaleKeys(
        "FlameR",
        [0, 0.3, 0.55, 0.9, 12],
        [flameOff, flameOff, [1.15, 1.15, 1.15], homeScale, homeScale],
      ),
      scaleKeys(
        "FlameL",
        [0, 0.3, 0.55, 0.9, 12],
        [flameOff, flameOff, [1.15, 1.15, 1.15], homeScale, homeScale],
      ),
    ],
  );

  // Cruise：绕展台上空椭圆盘旋（无缝循环，操纵面持续微动 + 加力焰常亮）。
  const cruiseTimes = cruiseSamples.map(
    (_, index) => (index / (cruiseSamples.length - 1)) * cruiseDuration,
  );
  const cruiseAngles = cruiseSamples.map(
    (_, index) =>
      cruiseStartAngle + (index / (cruiseSamples.length - 1)) * Math.PI * 2,
  );
  const cruiseClip = buildClip(
    "Cruise",
    cruiseDuration,
    [
      "airframe",
      "flaperons",
      "ailerons",
      "canards",
      "vtials",
      "flames",
      "gears",
    ],
    [
      posKeys(
        "J20Airframe",
        cruiseTimes,
        cruiseSamples.map((item) => [
          item.position.x,
          item.position.y,
          item.position.z,
        ]),
      ),
      quatKeys(
        "J20Airframe",
        cruiseTimes,
        cruiseSamples.map((item) => [item.pitch, item.yaw, item.roll]),
      ),
      numKeys(
        "FlaperonR.rotation[x]",
        cruiseTimes,
        cruiseAngles.map((angle) => -0.05 + 0.03 * Math.sin(angle * 2)),
      ),
      numKeys(
        "FlaperonL.rotation[x]",
        cruiseTimes,
        cruiseAngles.map((angle) => -0.05 + 0.03 * Math.sin(angle * 2 + 0.6)),
      ),
      numKeys(
        "AileronR.rotation[x]",
        cruiseTimes,
        cruiseAngles.map((angle) => 0.04 * Math.sin(angle)),
      ),
      numKeys(
        "AileronL.rotation[x]",
        cruiseTimes,
        cruiseAngles.map((angle) => 0.04 * Math.sin(angle + 0.5)),
      ),
      numKeys(
        "CanardR.rotation[x]",
        cruiseTimes,
        cruiseAngles.map((angle) => -0.08 + 0.02 * Math.sin(angle * 2)),
      ),
      numKeys(
        "CanardL.rotation[x]",
        cruiseTimes,
        cruiseAngles.map((angle) => -0.08 + 0.02 * Math.sin(angle * 2 + 0.8)),
      ),
      numKeys(
        "VtailR.rotation[y]",
        cruiseTimes,
        cruiseAngles.map((angle) => 0.025 * Math.sin(angle)),
      ),
      numKeys(
        "VtailL.rotation[y]",
        cruiseTimes,
        cruiseAngles.map((angle) => 0.025 * Math.sin(angle + 0.4)),
      ),
      scaleKeys("FlameR", [0, cruiseDuration], [homeScale, homeScale]),
      scaleKeys("FlameL", [0, cruiseDuration], [homeScale, homeScale]),
      numKeys("GearNose.rotation[x]", [0, cruiseDuration], [0, 0]),
      numKeys("GearMainR.rotation[x]", [0, cruiseDuration], [0, 0]),
      numKeys("GearMainL.rotation[x]", [0, cruiseDuration], [0, 0]),
      scaleKeys("GearNose", [0, cruiseDuration], [flameOff, flameOff]),
      scaleKeys("GearMainR", [0, cruiseDuration], [flameOff, flameOff]),
      scaleKeys("GearMainL", [0, cruiseDuration], [flameOff, flameOff]),
    ],
  );

  // Landing：放起落架→下滑盘旋进场→触地滑跑→停稳原点。
  const landingClip = buildClip(
    "Landing",
    13,
    [
      "airframe",
      "flaperons",
      "ailerons",
      "canards",
      "vtials",
      "wheels",
      "gears",
      "doors",
      "flames",
    ],
    [
      posKeys(
        "J20Airframe",
        landingTimes,
        landingPositions.map((item) => [item.x, item.y, item.z]),
      ),
      quatKeys("J20Airframe", landingTimes, landingEulers),
      numKeys(
        "FlaperonR.rotation[x]",
        [0, 9.8, 10.6, 12.0, 13],
        [-0.3, -0.3, -0.24, 0, 0],
      ),
      numKeys(
        "FlaperonL.rotation[x]",
        [0, 9.8, 10.6, 12.0, 13],
        [-0.3, -0.3, -0.24, 0, 0],
      ),
      numKeys("AileronL.rotation[x]", [0, 6, 10.6, 12], [0.06, 0.05, 0.02, 0]),
      numKeys(
        "AileronR.rotation[x]",
        [0, 6, 10.6, 12],
        [-0.06, -0.05, -0.02, 0],
      ),
      numKeys(
        "CanardR.rotation[x]",
        [0, 8, 10.6, 12.4],
        [-0.15, -0.13, -0.06, 0],
      ),
      numKeys(
        "CanardL.rotation[x]",
        [0, 8, 10.6, 12.4],
        [-0.15, -0.13, -0.06, 0],
      ),
      numKeys("VtailR.rotation[y]", [0, 8, 10.6, 12], [0.15, 0.12, 0.03, 0]),
      numKeys("VtailL.rotation[y]", [0, 8, 10.6, 12], [0.15, 0.12, 0.03, 0]),
      numKeys(
        "WheelNose.rotation[x]",
        [0, 10.6, 11.0, 11.6, 12.4, 13],
        [0, 0, 2.0, 3.6, 4.3, 4.5],
      ),
      numKeys(
        "WheelMainR.rotation[x]",
        [0, 10.6, 11.0, 11.6, 12.4, 13],
        [0, 0, 1.6, 2.9, 3.5, 3.7],
      ),
      numKeys(
        "WheelMainL.rotation[x]",
        [0, 10.6, 11.0, 11.6, 12.4, 13],
        [0, 0, 1.6, 2.9, 3.5, 3.7],
      ),
      numKeys("GearNose.rotation[x]", [0, 13], [0, 0]),
      numKeys("GearMainR.rotation[x]", [0, 13], [0, 0]),
      numKeys("GearMainL.rotation[x]", [0, 13], [0, 0]),
      scaleKeys(
        "GearNose",
        [0, 1.0, 1.9, 2.4],
        [flameOff, flameOff, [0.55, 0.55, 0.55], homeScale],
      ),
      scaleKeys(
        "GearMainR",
        [0, 1.0, 1.9, 2.4],
        [flameOff, flameOff, [0.55, 0.55, 0.55], homeScale],
      ),
      scaleKeys(
        "GearMainL",
        [0, 1.0, 1.9, 2.4],
        [flameOff, flameOff, [0.55, 0.55, 0.55], homeScale],
      ),
      numKeys(
        "NoseDoorR.rotation[z]",
        [0, 0.4, 1.1, 2.4, 3.2],
        [0, 0, -0.9, -0.9, 0],
      ),
      numKeys(
        "NoseDoorL.rotation[z]",
        [0, 0.4, 1.1, 2.4, 3.2],
        [0, 0, 0.9, 0.9, 0],
      ),
      numKeys(
        "MainDoorR.rotation[z]",
        [0, 0.4, 1.1, 2.4, 3.2],
        [0, 0, -0.9, -0.9, 0],
      ),
      numKeys(
        "MainDoorL.rotation[z]",
        [0, 0.4, 1.1, 2.4, 3.2],
        [0, 0, 0.9, 0.9, 0],
      ),
      scaleKeys(
        "FlameR",
        [0, 10.6, 11.8, 13],
        [homeScale, homeScale, flameOff, flameOff],
      ),
      scaleKeys(
        "FlameL",
        [0, 10.6, 11.8, 13],
        [homeScale, homeScale, flameOff, flameOff],
      ),
    ],
  );

  // FireMissile：双发齐射（点火→脱架→爬升弹道→远处爆点，含尾焰与烟迹）。
  const missileWaypoints: [number, number, number, number][] = [
    [2.72, 1.36, -4.3, 0.5],
    [2.76, 1.3, -3.85, 0.62],
    [2.95, 1.6, -2.1, 0.95],
    [3.2, 2.4, 0.5, 1.4],
    [3.5, 3.8, 3.6, 1.9],
    [3.8, 5.5, 6.9, 2.4],
    [4.05, 7.3, 10.0, 2.8],
    [4.2, 8.6, 13.0, 3.2],
  ];
  const missileTracks: THREE.KeyframeTrack[] = [];
  for (const side of [-1, 1]) {
    const name = side > 0 ? "MissileR" : "MissileL";
    const flameName = side > 0 ? "MissileFlameR" : "MissileFlameL";
    const points = missileWaypoints.map(([x, y, z, time]) => ({
      position: new THREE.Vector3(side * x, y, z),
      time,
    }));
    const times = [0, ...points.map((item) => item.time)];
    const positions = [
      points[0].position,
      ...points.map((item) => item.position),
    ];
    missileTracks.push(
      posKeys(
        name,
        times,
        positions.map((item) => [item.x, item.y, item.z]),
      ),
    );
    const eulers: number[][] = [
      [0, 0, 0],
      [0, 0, 0],
    ];
    for (let index = 1; index < points.length; index += 1) {
      const direction = points[index].position
        .clone()
        .sub(points[index - 1].position);
      const flat = Math.hypot(direction.x, direction.z);
      const pitch = -Math.atan2(direction.y, Math.max(flat, 0.001));
      eulers.push(poseEuler(direction, pitch, 0));
    }
    missileTracks.push(quatKeys(name, times, eulers));
    missileTracks.push(
      scaleKeys(name, [0, 3.22, 3.35], [homeScale, homeScale, flameOff]),
    );
    missileTracks.push(
      scaleKeys(
        flameName,
        [0, 0.42, 0.6, 0.85, 3.2, 3.3],
        [
          flameOff,
          flameOff,
          [1.05, 1.05, 1.05],
          homeScale,
          homeScale,
          flameOff,
        ],
      ),
    );
  }
  // 烟团：沿弹道逐步生成（迟于弹体掠过约 0.1s），膨胀后渐隐。
  const puffTracks: THREE.KeyframeTrack[] = [];
  const spotTimes = smokePath.map((_, index) => 0.72 + index * 0.37);
  smokePuffs.forEach((puff, index) => {
    const start = spotTimes[Math.floor(index / 2)] - 0.05;
    const grow = spotTimes[Math.floor(index / 2)] + 0.3;
    const end = Math.min(spotTimes[Math.floor(index / 2)] + 1.7, 4.2);
    puffTracks.push(
      scaleKeys(
        puff.mesh.name,
        [start, grow, end],
        [flameOff, homeScale, [1.6, 1.6, 1.6]],
      ),
    );
    puffTracks.push(
      numKeys(
        `${puff.mesh.name}.material.opacity`,
        [start, grow, end],
        [0, 0.55, 0.22],
      ),
    );
  });
  // 爆点：命中瞬间闪光并扩散。
  const boomTracks: THREE.KeyframeTrack[] = [];
  for (const boomItem of booms) {
    boomTracks.push(
      scaleKeys(
        `Boom${boomItem.tag}`,
        [0, 3.12, 3.3, 3.65, 4.2],
        [flameOff, flameOff, [0.55, 0.55, 0.55], homeScale, [1.25, 1.25, 1.25]],
      ),
    );
    boomTracks.push(
      numKeys(
        `BoomFlash${boomItem.tag}.material.opacity`,
        [0, 3.12, 3.4, 3.8, 4.2],
        [1, 1, 0.9, 0.3, 0.08],
      ),
    );
    boomTracks.push(
      scaleKeys(
        `BoomSmoke${boomItem.tag}`,
        [0, 3.15, 4.2],
        [homeScale, [0.85, 0.85, 0.85], [1.5, 1.5, 1.5]],
      ),
    );
    boomTracks.push(
      numKeys(
        `BoomSmoke${boomItem.tag}.material.opacity`,
        [0, 3.15, 3.5, 4.2],
        [0.75, 0.75, 0.8, 0.4],
      ),
    );
  }
  const fireMissileClip = buildClip(
    "FireMissile",
    4.2,
    ["missiles", "flames", "smoke", "booms"],
    [
      ...missileTracks,
      scaleKeys(
        "FlameR",
        [0, 0.25, 0.7, 1.6, 2.6],
        [flameOff, flameOff, [0.9, 0.9, 0.9], [0.55, 0.55, 0.55], flameOff],
      ),
      scaleKeys(
        "FlameL",
        [0, 0.25, 0.7, 1.6, 2.6],
        [flameOff, flameOff, [0.9, 0.9, 0.9], [0.55, 0.55, 0.55], flameOff],
      ),
      ...puffTracks,
      ...boomTracks,
    ],
  );

  const clips = [
    idleClip,
    openCanopyClip,
    closeCanopyClip,
    takeoffClip,
    cruiseClip,
    landingClip,
    fireMissileClip,
  ];

  const dispose = () => {
    root.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const material = mesh.material;
      if (Array.isArray(material)) {
        for (const item of material) item.dispose();
      } else if (material) {
        material.dispose();
      }
    });
    for (const texture of textures) texture.dispose();
  };

  return {
    root,
    clips,
    placement: { scale: DISPLAY_SCALE, position: [0, GROUND, 0] },
    glow,
    dispose,
  };
}
