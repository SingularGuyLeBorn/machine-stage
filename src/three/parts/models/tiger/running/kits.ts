import * as THREE from "three";
import { cylinderGeometry, latheGeometry, mergeGeometries, tubeGeometry } from "../../../kernel/geometry";
import type { GeometryBuilder } from "../../../assembler/geometry";

// ============================================================================
// models/tiger/running/kits —— 行动装置专用几何构造器（L2）
//
// 三个 kit：
//   trackLink    履带板（Kgs 63/725/130：板体 + 双中央导向齿 + 前后铰接耳 + 销孔）
//   sprocketWheel 主动轮（20 齿 ×2 齿圈，中间让出导向齿通道；齿顶 5.5mm 让开板内表面）
//   swingArm     摆臂（扭杆花键座 + 前/后倾臂 + 车轴座）
//
// 局部系约定（与 registry 的 instance_layout 配套）：
//   trackLink：原点 = 后铰接销中心；+X = 行进方向；+Y = 板外侧（触地面）；+Z = 车宽方向。
//              径向包络 ±32mm：铰接耳一律压在里面，负重轮滚过的板内表面不带凸起。
//   sprocketWheel / swingArm：几何按「轴沿 +Y」建，轴向靠布局矩阵旋转到 Z（同发动机 crankJournalAxis）。
// ============================================================================

type Params = Record<string, unknown>;

function num(params: Params | undefined, key: string, fallback?: number): number {
  const value = params?.[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (fallback !== undefined) return fallback;
  throw new Error(`running kit：参数 "${key}" 必须是数值（收到 ${String(value)}）`);
}

function box(list: THREE.BufferGeometry[], w: number, h: number, d: number, at?: [number, number, number]) {
  const geometry = new THREE.BoxGeometry(w, h, d);
  geometry.translate(at?.[0] ?? 0, at?.[1] ?? 0, at?.[2] ?? 0);
  list.push(geometry);
}

/**
 * 环（铰接耳 / 销座）：环面在 XY 平面、轴沿 Z（履带销方向），平移到 (x, 0, z)。
 * 注意：不能直接用 tubeGeometry 的默认 Y 轴——那会让环面躺在板厚方向，销从环体里穿过去。
 */
function bush(list: THREE.BufferGeometry[], x: number, z: number, rOut: number, rIn: number, h: number) {
  const geometry = tubeGeometry(rOut, rIn, h, 12);
  geometry.rotateX(Math.PI / 2);
  geometry.translate(x, 0, z);
  list.push(geometry);
}

/**
 * 履带板：pitched 单销履带。
 * - 板体：X [0.007, pitch-0.007]，径向 [−0.030, +0.032]（+Y = 触地面），Z ±725/2
 * - 后铰接（x=0）：中央舌片（z ±0.044）+ 两片前耳属于前一块板
 * - 前铰接（x=pitch）：两片耳（z ±[0.05, 0.10]）
 * - 导向齿：|z| ∈ [0.019, 0.043]，向内凸出 35mm（让开负重轮 6 条车道）
 */
const trackLink: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const pitch = num(p, "pitch", 0.13);
  const halfWidth = num(p, "halfWidth", 0.3625);
  const lip = num(p, "lip", 0.032);
  const body = num(p, "body", 0.03);
  const bossR = num(p, "bossR", 0.026);
  const holeR = num(p, "holeR", 0.0155);
  const tongueHalf = num(p, "tongueHalf", 0.044);
  const hornInner = num(p, "hornInner", 0.019);
  const hornOuter = num(p, "hornOuter", 0.043);
  const hornDepth = num(p, "hornDepth", 0.035);
  const hornMargin = num(p, "hornMargin", 0.02);
  const parts: THREE.BufferGeometry[] = [];

  // 板体：整宽板 + 两条主动轮齿窗（齿窗只开在中段，端部保留整宽横梁与铰接耳搭接）。
  // 旧版板体从销中心 7mm 起、且铰接耳用实心方块补强，方块把销孔填死（实测 link↔pin 31mm）。
  const pinR = holeR + 0.0135; // 让开销 + 铰接孔壁：板体从 28mm 起（pitch 130 时）
  const bodyStart = Math.min(pitch * 0.25, pinR);
  // 前铰接耳半径 26mm，板体尾端必须退到 > 26mm+弦让（0.6mm）之外，否则切对面舌片（实测 1.98mm）。
  const bodyEnd = pitch - 0.03;
  const windowA = 0.036;
  const windowB = pitch - 0.036;
  const centerHalf = 0.042;
  const windowInner = 0.044;
  const windowOuter = 0.106;
  const plateH = lip + body;
  const plateY = (lip - body) / 2;
  const span = bodyEnd - bodyStart;
  const mid = (bodyStart + bodyEnd) / 2;

  // 中央板条（导向齿底座）
  box(parts, span, plateH, centerHalf * 2, [mid, plateY, 0]);
  // 两侧外板（齿窗以外，整宽板厚）
  const sideW = halfWidth - windowOuter;
  for (const sign of [-1, 1] as const) {
    box(parts, span, plateH, sideW, [mid, plateY, sign * (windowOuter + sideW / 2)]);
  }
  // 齿窗前后的整宽横梁：把中央板条与两侧外板连成一体，同时给前铰接耳当搭接区
  box(parts, windowA - bodyStart, plateH, halfWidth * 2, [(bodyStart + windowA) / 2, plateY, 0]);
  box(parts, bodyEnd - windowB, plateH, halfWidth * 2, [(windowB + bodyEnd) / 2, plateY, 0]);

  // 后铰接舌片（单耳，居中）+ 补强流道（只连到 x=56mm，销孔前 2mm 止）
  const tongueH = tongueHalf * 2 - 0.001;
  bush(parts, 0, 0, bossR, holeR, tongueH);
  box(parts, 0.04, 0.052, tongueH - 0.001, [0.036, 0, 0]);
  // 前铰接双耳（与舌片留 1mm 轴向缝）：轴向从 44.5mm 一直外伸到 115mm，
  // 与外板（从 106mm 起）搭接；板体尾端退到 30mm 后靠两条窄搭接块连外板与耳（避开齿窗 z 带）。
  for (const sign of [-1, 1] as const) {
    const zIn = windowInner + 0.0005;
    const zOut = windowOuter + 0.009;
    bush(parts, pitch, sign * ((zIn + zOut) / 2), bossR, holeR, zOut - zIn);
    box(parts, 0.008, plateH, 0.009, [0.102, plateY, sign * (windowOuter + 0.0045)]);
  }
  // 双中央导向齿（向内凸出，位于负重轮车道之间）
  for (const sign of [-1, 1] as const) {
    const z = sign * ((hornInner + hornOuter) / 2);
    box(parts, pitch - 2 * hornMargin, hornDepth, hornOuter - hornInner, [
      pitch / 2,
      -body - hornDepth / 2,
      z,
    ]);
  }

  const merged = mergeGeometries(parts);
  for (const item of parts) item.dispose();
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
};

/**
 * 主动轮：双齿圈 20 齿（Kgs 63/725/130 的 Kgs 63 齿距 130 → 节圆 φ827）。
 * 齿顶半径 0.44 < 板内表面 0.4455（啮合孔未开，1.5mm 名义间隙，M-C 待补）。
 */
const sprocketWheel: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const teeth = Math.round(num(p, "teeth", 20));
  const pitchR = num(p, "pitchR", 0.4135);
  const toothTip = num(p, "toothTip", 0.44);
  const rimR = num(p, "rimR", 0.36);
  const halfGap = num(p, "halfGap", 0.045);
  const rimW = num(p, "rimW", 0.06);
  const hubR = num(p, "hubR", 0.1);
  const hubHalf = num(p, "hubHalf", 0.1);
  const boreR = num(p, "boreR", 0.056);
  const parts: THREE.BufferGeometry[] = [];

  // 双齿圈盘（中间让出导向齿通道）
  for (const sign of [-1, 1] as const) {
    const y0 = sign * halfGap;
    const y1 = sign * (halfGap + rimW);
    const plate = latheGeometry(
      [
        [hubR, y0],
        [rimR, y0],
        [rimR, y1],
        [hubR, y1],
        [hubR, y0],
      ],
      28,
    );
    parts.push(plate);
  }
  // 轮毂（贯穿两齿圈）
  parts.push(tubeGeometry(hubR, boreR, hubHalf * 2, 24));

  // 20 枚齿：径向外伸至 toothTip
  const radial = toothTip - pitchR;
  const toothH = 0.056;
  for (let i = 0; i < teeth; i++) {
    const angle = (i / teeth) * Math.PI * 2;
    for (const sign of [-1, 1] as const) {
      const y = sign * (halfGap + rimW / 2);
      const geometry = new THREE.BoxGeometry(radial + 0.06, rimW, toothH);
      geometry.translate(pitchR + radial / 2 - 0.03, y, 0);
      geometry.rotateY(-angle);
      parts.push(geometry);
    }
  }

  const merged = mergeGeometries(parts);
  for (const item of parts) item.dispose();
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
};

/**
 * 摆臂：扭杆花键座（内孔比扭杆大 1mm，名义间隙不接触）+ 前/后倾臂 + 车轴座。
 * 局部：原点 = 扭杆轴线与臂中心线的交点；+X = 车头方向；轴沿 +Y（布局把它倒到 Z）。
 */
const swingArm: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const bossBore = num(p, "bossBore", 0.029);
  const bossR = num(p, "bossR", 0.052);
  const bossW = num(p, "bossW", 0.074);
  const reach = num(p, "reach", 0.28);
  const drop = num(p, "drop", 0.05);
  const webT = num(p, "webT", 0.032);
  const axleBore = num(p, "axleBore", 0.03);
  const axleBossR = num(p, "axleBossR", 0.046);
  const axleBossW = num(p, "axleBossW", 0.062);
  const dir = num(p, "dir", 1) >= 0 ? 1 : -1;
  const parts: THREE.BufferGeometry[] = [];

  // 扭杆座（环，轴沿 Y）
  parts.push(tubeGeometry(bossR, bossBore, bossW, 20));
  // 臂身：从扭杆座斜拉到车轴座（在 XY 平面内成锥形）。
  // 根部 x = 40mm（倒角后 36mm）：扭杆六棱柱外接半径 28mm，根部不能压到轴线上
  // （旧版 30mm 倒角到 26mm，前脸横跨 z=0，与扭杆相交 1.46mm）。
  const arm = new THREE.BufferGeometry();
  const section: [number, number][] = [
    [0.04, -0.02],
    [reach, drop - 0.024],
    [reach, drop + 0.024],
    [0.04, 0.02],
  ];
  const shape = new THREE.Shape(section.map(([x, y]) => new THREE.Vector2(x * dir, y)));
  arm.copy(
    new THREE.ExtrudeGeometry(shape, {
      depth: webT,
      bevelEnabled: true,
      bevelThickness: 0.004,
      bevelSize: 0.004,
      bevelSegments: 1,
      steps: 1,
    }),
  );
  // 截面在 XY、厚度沿 Z → 转成「厚度沿 Y（= 扭杆轴线）、下垂沿 -Z」
  arm.rotateX(-Math.PI / 2);
  arm.translate(0, -webT / 2, 0);
  parts.push(arm);
  // 车轴座（轴线同样沿 Y）
  const hub = tubeGeometry(axleBossR, axleBore, axleBossW, 20);
  hub.translate(reach * dir, 0, -drop);
  parts.push(hub);

  const merged = mergeGeometries(parts);
  for (const item of parts) item.dispose();
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
};

/** 主动轮端盖（供读数/后续拆解使用的小件）。 */
const sprocketCap: GeometryBuilder = (spec) => {
  const p = (spec as { params?: Params }).params;
  const r = num(p, "r", 0.062);
  const h = num(p, "h", 0.02);
  const geometry = cylinderGeometry(r, h, r, 20, 0.003);
  return geometry;
};

export const tigerRunningKitBuilders: Record<string, GeometryBuilder> = {
  trackLink,
  sprocketWheel,
  swingArm,
  sprocketCap,
};
