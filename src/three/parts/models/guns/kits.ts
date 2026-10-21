import * as THREE from "three";
import type { GeometryBuilder } from "../../assembler/geometry";
import { latheGeometry, mergeGeometries } from "../../kernel/geometry";

// ============================================================================
// models/guns/kits —— 枪械系列共享参数化几何 kits
//
// 口径：所有 kit 的轴向默认 **+Z = 枪口方向**（与枪械自然直觉一致），
// 局部系原点在零件的装配特征点上（如枪管尾端面、闭锁凸笋中心），
// 具体在每个 kit 的注释里写明。剖面一律 lathe/挤出，禁止裸 BoxGeometry。
// ============================================================================

type Params = Record<string, unknown>;

function num(params: Params | undefined, key: string, fallback?: number): number {
  const value = params?.[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (fallback !== undefined) return fallback;
  throw new Error(`guns kit：参数 "${key}" 必须是数值（收到 ${String(value)}）`);
}

function bool(params: Params | undefined, key: string, fallback: boolean): boolean {
  const value = params?.[key];
  return typeof value === "boolean" ? value : fallback;
}

/** 把 latheGeometry 的 +Y 轴转到 +Z（枪械轴向），原点不变。 */
function toZAxis(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  geometry.rotateX(Math.PI / 2);
  return geometry;
}

/** 螺旋线采样点（绕轴 axis，半径 r，长度 len，圈数 turns，相位 phase）。 */
function helixPoints(r: number, len: number, turns: number, phase: number, steps: number): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const angle = phase + t * turns * Math.PI * 2;
    points.push(new THREE.Vector3(Math.cos(angle) * r, -len / 2 + t * len, Math.sin(angle) * r));
  }
  return points;
}

// ---------------------------------------------------------------------------
// rifledBarrel —— 线膛枪管（4/6 条右旋膛线，剖视/膛口可见螺旋膛线）
//
// 局部系：+Z = 枪口方向，原点 = 枪管尾端面中心。剖面 profile 为
// [外径, 轴向位置]（位置从尾端面起算，米）；boreR = 膛径（阴线直径/2），
// landR = 阳线直径/2（< boreR → 凸起的就不是膛线是加强筋，> boreR 才是阴线），
// twistTurns = 全长的缠旋圈数（7.62×39 约 1 圈/240mm）。
// 膛线做法：bore 内壁先按 landR 车（阳线直径小 → 内壁半径大 → 膛线是
// 嵌进内壁的螺旋棱），再放置 4 根螺旋管（半径 = (landR-boreR)/2，
// 中心半径 = (landR+boreR)/2），管内壁落在 boreR、外壁与 landR 车削面重合。
// ---------------------------------------------------------------------------

const rifledBarrel: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const profile = (p?.profile as Array<[number, number]> | undefined) ?? [];
  if (profile.length < 2) throw new Error("guns kit：rifledBarrel 需要至少 2 个剖面点");
  const boreR = num(p, "boreR");
  const landR = num(p, "landR");
  if (landR <= boreR) throw new Error("guns kit：rifledBarrel 的 landR 必须大于 boreR");
  const lands = Math.round(num(p, "lands", 4));
  const twistTurns = num(p, "twistTurns", 1.6);
  const ridgeSegments = Math.round(num(p, "ridgeSegments", 28));
  const segs = Math.round(num(p, "segments", 24));
  // 弹膛段（药室）：比线膛口径大的尾段，容纳弹壳；0 = 无弹膛（机枪枪管）
  const chamberR = num(p, "chamberR", boreR);
  const chamberLen = num(p, "chamberLen", 0);
  const barrelLen = profile[profile.length - 1][1];
  const riflingStart = Math.min(chamberLen + 0.008, barrelLen * 0.6);

  // 外轮廓（阳线直径）
  const outer = latheGeometry(profile, segs);
  // 内孔：阶梯（弹膛 → 喉部 → 线膛），开口管
  const boreProfile: [number, number][] = [[chamberR, 0]];
  if (chamberLen > 0) boreProfile.push([chamberR, chamberLen], [boreR + 0.0002, riflingStart]);
  boreProfile.push([boreR, barrelLen]);
  const boreTube = latheGeometry(boreProfile, segs);
  // 膛线棱：螺旋管嵌在内壁上（只覆线膛段）
  const ridgeR = (landR - boreR) / 2;
  const centerR = (landR + boreR) / 2;
  const ridges: THREE.BufferGeometry[] = [];
  for (let i = 0; i < lands; i++) {
    const phase = (i / lands) * Math.PI * 2;
    const points = helixPoints(centerR, barrelLen - riflingStart, twistTurns, phase, ridgeSegments);
    for (const point of points) point.y += (riflingStart + barrelLen) / 2; //  helix 沿轴（Y）居中到线膛段
    const curve = new THREE.CatmullRomCurve3(points);
    const ridge = new THREE.TubeGeometry(curve, ridgeSegments, ridgeR, 6, false);
    ridges.push(ridge);
  }
  const merged = mergeGeometries([outer, boreTube, ...ridges]);
  merged.rotateX(Math.PI / 2); // 车削轴 Y → 枪管轴 Z
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
};

// ---------------------------------------------------------------------------
// ammoBullet —— 弹头（被甲外形）：艇尾 + 长锥尖，局部系 +Z = 弹头指向。
// 被甲/铅芯/钢芯是三个独立件、同轴套放：外形外尺寸一致，铅芯短一截。
// ---------------------------------------------------------------------------

const ammoBullet: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const r = num(p, "r", 0.0042);
  const len = num(p, "len", 0.0265);
  const noseR = r * 0.45; // 尖端点半径
  const tangentR = r * 0.92; // 圆锥切入半径
  const meplat = r * 0.1; // 尖顶平台半径
  // 卵形头部 + 圆柱段 + 微艇尾（圆柱段足够长 → 铅套/钢芯完全内藏）
  const ogive = len * 0.42;
  const profile: [number, number][] = [
    [meplat, len / 2],
    [noseR, len / 2 - ogive],
    [tangentR, len / 2 - ogive + 0.002],
    [r, -len / 2 + 0.006],
    [r * 0.95, -len / 2],
    [0.0001, -len / 2],
  ];
  return toZAxis(latheGeometry(profile, 20));
};

/** 弹芯（铅套/钢芯）：船尾柱体，比被甲短 10%（套在被甲里）。 */
const ammoCore: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const r = num(p, "r", 0.0031);
  const len = num(p, "len", 0.021);
  const tip = bool(p, "pointed", false);
  const profile: [number, number][] = [
    [0.0001, len / 2],
    [tip ? r * 0.3 : r, len / 2 - (tip ? len * 0.25 : 0)],
    [r, -len / 2 + r * 0.55],
    [r * 0.55, -len / 2],
    [0.0001, -len / 2],
  ];
  return toZAxis(latheGeometry(profile, 16));
};

/** 弹壳（黄铜，瓶形）：局部系 +Z = 弹头指向，原点 = 壳底面中心。 */
const cartridgeCase: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const rimR = num(p, "rimR", 0.0059);
  const neckR = num(p, "neckR", 0.0044);
  const baseR = num(p, "baseR", 0.005);
  const len = num(p, "len", 0.0387);
  const shoulder = num(p, "shoulder", 0.66); // 斜肩位置（比例）
  const extractorGroove = bool(p, "extractorGroove", true);
  const grooveR = rimR - 0.0008;
  const shoulderY = len * shoulder;
  const profile: [number, number][] = [
    [0.0001, 0],
    [rimR, 0],
    [rimR, 0.0016],
    [baseR, 0.0018],
    [baseR, shoulderY * 0.96],
    [neckR, shoulderY],
    [neckR, len],
    [neckR - 0.0006, len],
    [neckR - 0.0006, shoulderY],
    [baseR - 0.0006, shoulderY * 0.96],
    [baseR - 0.0006, 0.0024],
    [grooveR, 0.0024],
    [grooveR, 0.0012],
    [rimR - 0.0012, 0.0012],
    [rimR - 0.0012, 0],
  ];
  if (!extractorGroove) {
    // 无沟槽（勃朗宁弹药）：把沟槽两段替换为直筒
    profile[11] = [baseR - 0.0006, 0.0024];
    profile[12] = [baseR - 0.0006, 0.0012];
  }
  return toZAxis(latheGeometry(profile, 18));
};

/** 发射药柱：颗粒火药简化为短粗柱（组群外观），装在弹壳里。 */
const propellantCharge: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const r = num(p, "r", 0.0038);
  const len = num(p, "len", 0.03);
  const profile: [number, number][] = [
    [0.0001, len / 2],
    [r, len / 2],
    [r, -len / 2],
    [0.0001, -len / 2],
  ];
  return toZAxis(latheGeometry(profile, 12));
};

/** 底火（伯丹/博克西）：盂形体嵌在弹壳底部。 */
const primerCap: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const r = num(p, "r", 0.0032);
  const h = num(p, "h", 0.0018);
  const profile: [number, number][] = [
    [0.0001, 0],
    [r, 0],
    [r, h - r * 0.3],
    [r * 0.86, h],
    [0.0001, h],
  ];
  return toZAxis(latheGeometry(profile, 14));
};

// ---------------------------------------------------------------------------
// muzzleFlash —— 枪口焰：双锥对扣的火星团（emissive 材质，点火瞬间可见）。
// 局部系 +Z = 枪口方向，原点 = 膛口。
// ---------------------------------------------------------------------------

const muzzleFlash: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const r = num(p, "r", 0.05);
  const len = num(p, "len", 0.22);
  const petals = Math.round(num(p, "petals", 6));
  const parts: THREE.BufferGeometry[] = [];
  const cone = (scale: number, forward: number) => {
    const c = new THREE.ConeGeometry(r * scale, len * scale, 8, 1, true);
    c.rotateX(Math.PI / 2); // 尖端 +Z
    c.translate(0, 0, forward);
    return c;
  };
  // 主焰锥（向前）
  parts.push(cone(1, len * 0.5));
  // 侧向火星瓣
  for (let i = 0; i < petals; i++) {
    const angle = (i / petals) * Math.PI * 2;
    const petal = cone(0.3, len * 0.34);
    const m = new THREE.Matrix4().makeRotationZ(angle);
    petal.applyMatrix4(m);
    petal.translate(0, 0, len * 0.28);
    parts.push(petal);
  }
  const merged = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  return merged;
};

export const gunKitBuilders: Record<string, GeometryBuilder> = {
  rifledBarrel,
  ammoBullet,
  ammoCore,
  cartridgeCase,
  propellantCharge,
  primerCap,
  muzzleFlash,
};
