import * as THREE from "three";
import type { InstanceLayout } from "../../../assembler/assembler";
import type { ModelRegistry, PartDefinition } from "../../../registry/types";

// ============================================================================
// models/tiger/running —— 虎式 I 行动装置与悬挂（L2 自内向外第三层）
//
// 坐标系沿用发动机 L1：+X = 车体纵轴（+X 朝车尾，风扇端）；+Y = 上（曲轴轴线 = 0）；
// +Z = 车体右侧。地面 GROUND_Y = -1.10（发动机曲轴轴线高于地面 1.10m，与实车布置一致）。
//
// 数据出处（公开资料，Jentz / alanhamby / wardrawings）：战斗履带 Kgs 63/725/130 ——
// 宽 725mm、节距 130mm、每侧 96 节、销径 28mm、销锁止用锁环/C 形卡；主动轮前置、
// 双齿圈 20 齿；诱导轮后置、可调；8 副扭杆/侧（共 16 根，长 1644.6mm、径 55/58mm、
// 两端花键）；负重轮 800mm 直径、每轴 3 只、交错布置共 24 只/侧；摆臂一侧前倾、
// 另一侧后倾；第 1、8 位摆臂带车内减震器。
//
// 建模口径（简化记录，M-C 待补）：
//   1. 主动轮啮合孔（履带板上让齿通过的窗孔）未开：齿顶半径 0.44 < 板内表面 0.4455，
//      按 1.5mm 名义间隙建模，因此静态检测零报告；窗孔随 L4 车体一并补。
//   2. 诱导轮张紧器、车内减震器属车体件，随 L4 建模（车体未建）。
//   3. 负重轮只做轮盘（橡胶胎面按同轴回转体），轮毂螺栓为独立实例件，坐进轮毂端面
//      4mm 沉窝（1mm 名义间隙）。
//   4. 扭杆与摆臂花键座、车轴与轴座、销与板孔一律 1~2mm 名义间隙（不接触、不报缺陷）。
//
// 布局尺度关系（自洽校验，见 running/registry.test.ts）：
//   销中心轨迹 = 地面偏移 TRACK_PIN_OFFSET 的等距线；环长 = 2 段切线 + 两段圆弧
//   ≈ 12.477m ≈ 96 × 130mm（误差 0.02%），即节距由几何自洽推出，不手写。
// ============================================================================

export const RUNNING_LAYOUTS = {
  trackLoop: "running.trackLoop",
  trackPin: "running.trackPin",
  trackPinClip: "running.trackPinClip",
  roadWheel: "running.roadWheel",
  wheelHubBolt: "running.wheelHubBolt",
  sprocket: "running.sprocket",
  idler: "running.idler",
  idlerAxle: "running.idlerAxle",
  finalDrive: "running.finalDrive",
  driveShaft: "running.driveShaft",
  torsionBar: "running.torsionBar",
  torsionAnchor: "running.torsionAnchor",
  swingArm: "running.swingArm",
  axle: "running.axle",
} as const;

const RUNNING_CONSTANTS: Record<string, number> = {
  // —— 总体布置 ——
  GROUND_Y: -1.1,
  TRACK_Z: 1.49, // 履带中心线（±1.49 → 全车宽 3.705m）
  TRACK_WIDTH: 0.725,
  TRACK_HALF_W: 0.3625,
  TRACK_LINKS: 96,

  // —— 履带板 / 销 ——
  TRACK_PITCH: 0.13, // 标称节距；布局按几何环长/96 微调（见 source）
  TRACK_LINK_T: 0.064, // 板径向包络（铰接耳压在其中，负重轮滚过的内表面不带凸起）
  TRACK_PIN_OFFSET: 0.032, // 销中心 → 触地面
  TRACK_PIN_R: 0.014,
  TRACK_PIN_HOLE_R: 0.0155, // 1mm 径向间隙
  TRACK_PIN_LEN: 0.792,
  TRACK_HORN_INNER: 0.019,
  TRACK_HORN_OUTER: 0.043,
  TRACK_HORN_DEPTH: 0.035,

  // —— 主动轮 / 诱导轮 ——
  SPROCKET_TEETH: 20,
  SPROCKET_R: 0.4138, // 20 × 0.13 / 2π
  SPROCKET_X: -4.45,
  SPROCKET_HALF_GAP: 0.045, // 齿圈内缘（让开导向齿 2mm）
  SPROCKET_RIM_W: 0.06,
  SPROCKET_HUB_R: 0.1,
  SPROCKET_HUB_HALF: 0.1,
  SPROCKET_BORE_R: 0.056,
  // 齿顶按「不切履带板内表面」收短：板内表面在主动轮弧上最低到 0.3777（弦中点），
  // 0.375 留 2.7mm。实车齿顶到 0.44 靠履带板中央齿窗让位，齿窗+全高齿留待 M-C。
  SPROCKET_TOOTH_TIP: 0.375,
  IDLER_R: 0.3,
  IDLER_X: 0.5995,
  IDLER_BORE_R: 0.038,
  IDLER_AXLE_R: 0.036,
  IDLER_AXLE_LEN: 0.24,

  // —— 负重轮 ——
  WHEEL_R: 0.4,
  WHEEL_W: 0.098,
  WHEEL_BORE_R: 0.032,
  WHEEL_CLEARANCE: 0.001,
  WHEEL_STATIONS: 8,
  WHEEL_STATION_PITCH: 0.49,
  WHEEL_X_FRONT: -3.6,
  WHEEL_LANE_OUT: 0.3,
  WHEEL_LANE_MID: 0.195,
  WHEEL_LANE_IN: 0.095,
  WHEEL_BOLT_COUNT: 6,
  WHEEL_BOLT_CIRCLE_R: 0.09,
  WHEEL_BOLT_HEAD_R: 0.011,
  WHEEL_BOLT_HEAD_H: 0.01,
  WHEEL_BOLT_SEAT_Y: 0.038, // 沉窝底面 + 1mm

  // —— 扭杆 / 摆臂 / 车轴 ——
  TORSION_R: 0.028,
  TORSION_LEN: 1.6446,
  TORSION_Y: -0.585,
  TORSION_PIVOT_Z: 1.1,
  TORSION_ARM_REACH: 0.28,
  TORSION_ARM_DROP: 0.05,
  TORSION_ANCHOR_GAP: 0.002,
  TORSION_ANCHOR_W: 0.14,
  TORSION_ANCHOR_H: 0.1,
  TORSION_ANCHOR_T: 0.06,
  AXLE_R: 0.028,
  AXLE_LEN: 0.75,
  /**
   * 诱导轮销中心半径的额外让量：履带板是平的（销间为弦），弦中点比销圆内缩
   * r·(1-cos(θ/2)) ≈ 4.2mm；不补这一块，平板中段会切进 ⌀600 诱导轮（实测 9mm）。
   */
  IDLER_CHORD_ALLOWANCE: 0.0042,

  // —— 传动（前部终传）——
  FINAL_DRIVE_TIP_Z: 1.53,
  FINAL_DRIVE_R: 0.195,
  FINAL_DRIVE_LEN: 0.56,
  DRIVE_SHAFT_R: 0.05,
  DRIVE_SHAFT_LEN: 0.1,
  FINAL_DRIVE_BOLTS: 12,
  FINAL_DRIVE_BOLT_CIRCLE_R: 0.15,
};

// 节距由几何自洽推出（环长 / 96 ≈ 130mm），供履带板 kit 与布局共用同一个数。
RUNNING_CONSTANTS.TRACK_PIN_PITCH = 0;

/** 销中心轨迹（2D，X-Y 平面）：两段切线 + 主动轮/诱导轮圆弧，按弧长参数化。 */
export interface TrackPath {
  length: number;
  /** 弧长 s 处的销中心位置、单位切向（+X = 行进方向）与外法向（+Y = 板外侧）。 */
  at(s: number): { x: number; y: number; tx: number; ty: number; nx: number; ny: number };
}

const TAU = Math.PI * 2;

/**
 * 两圆外公切线的切点（取上方一支）。
 * 切点 P1 = C1 + n·r1、P2 = C2 + n·r2，满足 n·(C2-C1) = r1 - r2。
 */
function upperTangent(
  c1x: number,
  c1y: number,
  r1: number,
  c2x: number,
  c2y: number,
  r2: number,
): { nx: number; ny: number; p1x: number; p1y: number; p2x: number; p2y: number } {
  const dx = c2x - c1x;
  const dy = c2y - c1y;
  const d = Math.hypot(dx, dy);
  const c = (r1 - r2) / d;
  const s = Math.sqrt(Math.max(1 - c * c, 0));
  const ux = dx / d;
  const uy = dy / d;
  let nx = c * ux - s * uy;
  let ny = c * uy + s * ux;
  if (ny < 0) {
    nx = c * ux + s * uy;
    ny = c * uy - s * ux;
  }
  return { nx, ny, p1x: c1x + nx * r1, p1y: c1y + ny * r1, p2x: c2x + nx * r2, p2y: c2y + ny * r2 };
}

type TrackSegment =
  | { kind: "arc"; cx: number; cy: number; r: number; a0: number; a1: number; len: number }
  | {
      kind: "line";
      x0: number;
      y0: number;
      x1: number;
      y1: number;
      nx: number;
      ny: number;
      len: number;
    };

type RawSegment =
  Omit<Extract<TrackSegment, { kind: "arc" }>, "len"> | Omit<Extract<TrackSegment, { kind: "line" }>, "len">;

/**
 * 销中心轨迹：绕「主动轮圆 → 负重轮顶线 → 诱导轮圆」的凸包外包线。
 *
 * 旧版只取主动轮/诱导轮两圆公切线，上段直线从主动轮顶直接连到诱导轮顶，会穿过负重轮
 * （实测 260 条 link↔wheel，最深 35mm）。按实车布置：履带上段压在 8 组负重轮顶上，
 * 末轮之后下降到诱导轮、首轮之前上升到主动轮。下段仍与两轮底相切（地线）。
 *
 * 所有圆的半径都按「销中心」给：主动轮用节圆；诱导轮/负重轮是接触半径 + TRACK_PIN_OFFSET
 * （销中心比履带内表面外让 32mm）。
 */
export function idlerPinRadiusOf(constants: Record<string, number>): number {
  return constants.IDLER_R + constants.TRACK_PIN_OFFSET + constants.IDLER_CHORD_ALLOWANCE;
}

/** 诱导轮几何中心（与销中心圆同心；比旧版抬高一个 TRACK_PIN_OFFSET + 弦高让量）。 */
export function idlerCenterYOf(constants: Record<string, number>): number {
  return constants.GROUND_Y + constants.TRACK_PIN_OFFSET + idlerPinRadiusOf(constants);
}

export function trackPathOf(constants: Record<string, number>): TrackPath {
  const lowY = constants.GROUND_Y + constants.TRACK_PIN_OFFSET;
  const rs = constants.SPROCKET_R;
  const ri = idlerPinRadiusOf(constants);
  const rw = constants.WHEEL_R + constants.TRACK_PIN_OFFSET;
  const csx = constants.SPROCKET_X;
  const csy = lowY + rs;
  const cix = constants.IDLER_X;
  const ciy = idlerCenterYOf(constants);
  const wxs = Array.from(
    { length: constants.WHEEL_STATIONS },
    (_, i) => constants.WHEEL_X_FRONT + i * constants.WHEEL_STATION_PITCH,
  );
  const wy = constants.GROUND_Y + constants.TRACK_LINK_T + constants.WHEEL_R + constants.WHEEL_CLEARANCE;
  const topY = wy + rw;
  const first = wxs[0];
  const last = wxs[wxs.length - 1];

  const toFirst: ReturnType<typeof upperTangent> = upperTangent(csx, csy, rs, first, wy, rw);
  const toIdler: ReturnType<typeof upperTangent> = upperTangent(last, wy, rw, cix, ciy, ri);
  const aS = Math.atan2(toFirst.ny, toFirst.nx);
  const aI = Math.atan2(toIdler.ny, toIdler.nx);

  // 沿行进方向：主动轮上切点 → 绕车前 → 下段 → 绕诱导轮后侧 → 上切点 → 末轮 → 轮顶线 → 首轮 → 回到主动轮。
  const raw: RawSegment[] = [
    { kind: "arc", cx: csx, cy: csy, r: rs, a0: aS, a1: 1.5 * Math.PI },
    { kind: "line", x0: csx, y0: lowY, x1: cix, y1: lowY, nx: 0, ny: -1 },
    { kind: "arc", cx: cix, cy: ciy, r: ri, a0: 1.5 * Math.PI, a1: aI + TAU },
    {
      kind: "line",
      x0: toIdler.p2x,
      y0: toIdler.p2y,
      x1: toIdler.p1x,
      y1: toIdler.p1y,
      nx: toIdler.nx,
      ny: toIdler.ny,
    },
    { kind: "arc", cx: last, cy: wy, r: rw, a0: aI, a1: 0.5 * Math.PI },
    { kind: "line", x0: last, y0: topY, x1: first, y1: topY, nx: 0, ny: 1 },
    { kind: "arc", cx: first, cy: wy, r: rw, a0: 0.5 * Math.PI, a1: aS },
    {
      kind: "line",
      x0: toFirst.p2x,
      y0: toFirst.p2y,
      x1: toFirst.p1x,
      y1: toFirst.p1y,
      nx: toFirst.nx,
      ny: toFirst.ny,
    },
  ];

  let length = 0;
  const segments: TrackSegment[] = raw.map((seg) => {
    const len = seg.kind === "arc" ? seg.r * (seg.a1 - seg.a0) : Math.hypot(seg.x1 - seg.x0, seg.y1 - seg.y0);
    length += len;
    return { ...seg, len };
  });

  return {
    length,
    at(s: number) {
      let t = ((s % length) + length) % length;
      for (const seg of segments) {
        if (t > seg.len && seg !== segments[segments.length - 1]) {
          t -= seg.len;
          continue;
        }
        if (seg.kind === "arc") {
          const a = seg.a0 + Math.min(t, seg.len) / seg.r;
          return {
            x: seg.cx + seg.r * Math.cos(a),
            y: seg.cy + seg.r * Math.sin(a),
            tx: -Math.sin(a),
            ty: Math.cos(a),
            nx: Math.cos(a),
            ny: Math.sin(a),
          };
        }
        const k = Math.min(t, seg.len) / seg.len;
        return {
          x: seg.x0 + (seg.x1 - seg.x0) * k,
          y: seg.y0 + (seg.y1 - seg.y0) * k,
          tx: (seg.x1 - seg.x0) / seg.len,
          ty: (seg.y1 - seg.y0) / seg.len,
          nx: seg.nx,
          ny: seg.ny,
        };
      }
      const firstSeg = segments[0];
      const a = firstSeg.kind === "arc" ? firstSeg.a0 : 0;
      return { x: csx, y: csy + rs, tx: -Math.sin(a), ty: Math.cos(a), nx: Math.cos(a), ny: Math.sin(a) };
    },
  };
}

/** 主动轮齿相位：齿落在相邻两根销的正中（半个齿距），避免切进销/铰接耳。 */
export function sprocketToothPhaseOf(constants: Record<string, number>): number {
  const path = trackPathOf(constants);
  const start = path.at(0);
  const centerX = constants.SPROCKET_X;
  const centerY = constants.GROUND_Y + constants.TRACK_PIN_OFFSET + constants.SPROCKET_R;
  const angle = Math.atan2(start.y - centerY, start.x - centerX);
  return angle + Math.PI / constants.SPROCKET_TEETH;
}

/** 履带销中心线实际节距（= 环长 / 96，几何自洽推出）。 */
export function trackPitchOf(constants: Record<string, number>): number {
  return trackPathOf(constants).length / constants.TRACK_LINKS;
}

/** 负重轮中心高度：履带板内表面 + 半径 + 名义间隙。 */
export function wheelCenterYOf(constants: Record<string, number>): number {
  return constants.GROUND_Y + constants.TRACK_LINK_T + constants.WHEEL_R + constants.WHEEL_CLEARANCE;
}

RUNNING_CONSTANTS.TRACK_PIN_PITCH = trackPitchOf(RUNNING_CONSTANTS);

// ---------------------------------------------------------------------------
// 矩阵工具
// ---------------------------------------------------------------------------

/** 由基向量搭正交矩阵（列 = X'/Y'/Z'）。 */
function basis(x: THREE.Vector3, y: THREE.Vector3, z: THREE.Vector3, at: THREE.Vector3): THREE.Matrix4 {
  return new THREE.Matrix4().set(x.x, y.x, z.x, at.x, x.y, y.y, z.y, at.y, x.z, y.z, z.z, at.z, 0, 0, 0, 1);
}

/** 侧向轴件（回转体轴沿 +Y 建模）：+Y → 车外侧。右件 rotX(+90°)，左件 rotX(-90°)。 */
function lateral(side: 1 | -1, x: number, y: number, z: number): THREE.Matrix4 {
  const m = new THREE.Matrix4().makeRotationX(side > 0 ? Math.PI / 2 : -Math.PI / 2);
  m.setPosition(x, y, z);
  return m;
}

/**
 * 履带板的实例位姿基：原点 = 后铰销中心，局部 +X = 指向前铰销（弦向，不是切线向）、
 * +Y = 板外侧、+Z = 车宽方向。
 *
 * 关键：履带板是刚体，前后销之间是「弦」。若按 s 点的切线取向，绕弧形段时前铰耳会
 * 偏到圆心一侧一个弦高（主动轮 5.1mm、诱导轮 6.3mm），销就会切进铰耳（实测 12mm）。
 */
function trackFrame(
  path: TrackPath,
  s: number,
  pitch: number,
  side: 1 | -1,
  constants: Record<string, number>,
): THREE.Matrix4 {
  const here = path.at(s);
  const back = path.at(s - pitch);
  const dx = back.x - here.x;
  const dy = back.y - here.y;
  const len = Math.hypot(dx, dy) || 1;
  const x = new THREE.Vector3(dx / len, dy / len, 0);
  const y = new THREE.Vector3(-x.y, x.x, 0);
  const z = x.clone().cross(y);
  return basis(x, y, z, new THREE.Vector3(here.x, here.y, side * constants.TRACK_Z));
}

/** 摆臂/扭杆/车轴的实例位姿基（车轴母线沿外侧，臂朝车头或车尾）。 */
function armFrame(side: 1 | -1, pivotX: number, pivotY: number, pivotZ: number): THREE.Matrix4 {
  const x = new THREE.Vector3(side, 0, 0); // 右件臂朝车尾、左件臂朝车头（枢轴在车轴的另一侧）
  const y = new THREE.Vector3(0, 0, side);
  const z = new THREE.Vector3(0, 1, 0);
  return basis(x, y, z, new THREE.Vector3(pivotX, pivotY, pivotZ));
}

/** 负重轮（含轮毂螺栓）在站内的横向车道：奇/偶站交错，对应实车六排轮。 */
function wheelLane(station: number, slot: number, constants: Record<string, number>): number {
  const odd = station % 2 === 0; // 实车第 1/3/5/7 轴
  const rows = odd
    ? [constants.WHEEL_LANE_OUT, -constants.WHEEL_LANE_IN, -constants.WHEEL_LANE_MID]
    : [constants.WHEEL_LANE_MID, constants.WHEEL_LANE_IN, -constants.WHEEL_LANE_OUT];
  return rows[slot];
}

// ---------------------------------------------------------------------------
// 实例布局
// ---------------------------------------------------------------------------

function makeLayouts(): Record<string, InstanceLayout> {
  const layouts: Record<string, InstanceLayout> = {};

  /** 铰接销位姿：履带板后铰点（每侧 96 个铰点各一根销）。 */
  const pinMatrix = (index: number, constants: Record<string, number>): THREE.Matrix4 => {
    const side: 1 | -1 = index < constants.TRACK_LINKS ? 1 : -1;
    const k = index % constants.TRACK_LINKS;
    const path = trackPathOf(constants);
    return trackFrame(path, k * trackPitchOf(constants), trackPitchOf(constants), side, constants).multiply(
      new THREE.Matrix4().makeRotationX(Math.PI / 2),
    );
  };

  layouts[RUNNING_LAYOUTS.trackLoop] = ({ index, constants }) => {
    const side: 1 | -1 = index < constants.TRACK_LINKS ? 1 : -1;
    const k = index % constants.TRACK_LINKS;
    const path = trackPathOf(constants);
    return trackFrame(path, k * trackPitchOf(constants), trackPitchOf(constants), side, constants);
  };

  layouts[RUNNING_LAYOUTS.trackPin] = ({ index, constants }) => pinMatrix(index, constants);

  layouts[RUNNING_LAYOUTS.trackPinClip] = ({ index, constants }) =>
    pinMatrix(index, constants).multiply(new THREE.Matrix4().makeTranslation(0, -0.3665, 0));

  layouts[RUNNING_LAYOUTS.roadWheel] = ({ index, constants }) => {
    const perSide = constants.WHEEL_STATIONS * 3;
    const side: 1 | -1 = index < perSide ? 1 : -1;
    const local = index % perSide;
    const station = Math.floor(local / 3);
    const lane = wheelLane(station, local % 3, constants);
    const x = constants.WHEEL_X_FRONT + station * constants.WHEEL_STATION_PITCH;
    return lateral(side, x, wheelCenterYOf(constants), side * (constants.TRACK_Z + lane));
  };

  layouts[RUNNING_LAYOUTS.wheelHubBolt] = ({ index, constants }) => {
    const wheelIndex = Math.floor(index / constants.WHEEL_BOLT_COUNT);
    const bolt = index % constants.WHEEL_BOLT_COUNT;
    const perSide = constants.WHEEL_STATIONS * 3;
    const side: 1 | -1 = wheelIndex < perSide ? 1 : -1;
    const local = wheelIndex % perSide;
    const station = Math.floor(local / 3);
    const lane = wheelLane(station, local % 3, constants);
    const x = constants.WHEEL_X_FRONT + station * constants.WHEEL_STATION_PITCH;
    const wheel = lateral(side, x, wheelCenterYOf(constants), side * (constants.TRACK_Z + lane));
    const angle = (bolt / constants.WHEEL_BOLT_COUNT) * TAU;
    const r = constants.WHEEL_BOLT_CIRCLE_R;
    return wheel.multiply(
      new THREE.Matrix4().makeTranslation(
        r * Math.cos(angle),
        constants.WHEEL_BOLT_SEAT_Y,
        r * Math.sin(angle),
      ),
    );
  };

  const axleYOf = (constants: Record<string, number>) =>
    constants.GROUND_Y + constants.TRACK_PIN_OFFSET + constants.SPROCKET_R;

  layouts[RUNNING_LAYOUTS.sprocket] = ({ index, constants }) => {
    const side: 1 | -1 = index === 0 ? 1 : -1;
    const phase = sprocketToothPhaseOf(constants);
    return lateral(side, constants.SPROCKET_X, axleYOf(constants), side * constants.TRACK_Z).multiply(
      new THREE.Matrix4().makeRotationY(-side * phase),
    );
  };

  layouts[RUNNING_LAYOUTS.idler] = ({ index, constants }) => {
    const side: 1 | -1 = index === 0 ? 1 : -1;
    return lateral(side, constants.IDLER_X, idlerCenterYOf(constants), side * constants.TRACK_Z);
  };

  layouts[RUNNING_LAYOUTS.idlerAxle] = ({ index, constants }) => {
    const side: 1 | -1 = index === 0 ? 1 : -1;
    return lateral(side, constants.IDLER_X, idlerCenterYOf(constants), side * constants.TRACK_Z);
  };

  layouts[RUNNING_LAYOUTS.finalDrive] = ({ index, constants }) => {
    const side: 1 | -1 = index === 0 ? 1 : -1;
    return lateral(side, constants.SPROCKET_X, axleYOf(constants), side * constants.FINAL_DRIVE_TIP_Z);
  };

  layouts[RUNNING_LAYOUTS.driveShaft] = ({ index, constants }) => {
    const side: 1 | -1 = index === 0 ? 1 : -1;
    // 轴端从终传壳外端面（z = TIP）再向外 5mm 起，插进主动轮轮毂孔（1mm 轴向间隙）
    return lateral(
      side,
      constants.SPROCKET_X,
      axleYOf(constants),
      side * (constants.FINAL_DRIVE_TIP_Z + 0.055),
    );
  };

  /** 摆臂枢轴（扭杆外端）位置：一侧前倾、另一侧后倾。 */
  const pivotOf = (side: 1 | -1, station: number, constants: Record<string, number>) => {
    const stationX = constants.WHEEL_X_FRONT + station * constants.WHEEL_STATION_PITCH;
    return stationX - side * constants.TORSION_ARM_REACH;
  };

  layouts[RUNNING_LAYOUTS.torsionBar] = ({ index, constants }) => {
    const side: 1 | -1 = index < constants.WHEEL_STATIONS ? 1 : -1;
    const station = index % constants.WHEEL_STATIONS;
    const pivotX = pivotOf(side, station, constants);
    const frame = armFrame(side, pivotX, constants.TORSION_Y, side * constants.TORSION_PIVOT_Z);
    // 几何以中点为原点：外端顶到摆臂花键座外缘
    const outward = 0.037 - constants.TORSION_LEN / 2;
    return frame.multiply(new THREE.Matrix4().makeTranslation(0, outward, 0));
  };

  layouts[RUNNING_LAYOUTS.torsionAnchor] = ({ index, constants }) => {
    const side: 1 | -1 = index < constants.WHEEL_STATIONS ? 1 : -1;
    const station = index % constants.WHEEL_STATIONS;
    const pivotX = pivotOf(side, station, constants);
    const innerZ = constants.TORSION_PIVOT_Z + 0.037 - constants.TORSION_LEN;
    const anchorZ = innerZ - constants.TORSION_ANCHOR_GAP - constants.TORSION_ANCHOR_W / 2;
    // 支座是方箱（世界轴），只平移：+X 纵、+Y 上、+Z 车宽
    return new THREE.Matrix4().makeTranslation(pivotX, constants.TORSION_Y, side * anchorZ);
  };

  layouts[RUNNING_LAYOUTS.swingArm] = ({ index, constants }) => {
    const side: 1 | -1 = index < constants.WHEEL_STATIONS ? 1 : -1;
    const station = index % constants.WHEEL_STATIONS;
    const pivotX = pivotOf(side, station, constants);
    return armFrame(side, pivotX, constants.TORSION_Y, side * constants.TORSION_PIVOT_Z);
  };

  layouts[RUNNING_LAYOUTS.axle] = ({ index, constants }) => {
    const side: 1 | -1 = index < constants.WHEEL_STATIONS ? 1 : -1;
    const station = index % constants.WHEEL_STATIONS;
    const x = constants.WHEEL_X_FRONT + station * constants.WHEEL_STATION_PITCH;
    return lateral(side, x, wheelCenterYOf(constants), side * (constants.TRACK_Z + 0.01));
  };

  return layouts;
}

export function makeRunningLayouts(): Record<string, InstanceLayout> {
  return makeLayouts();
}

// ---------------------------------------------------------------------------
// 零件
// ---------------------------------------------------------------------------

/** 六角头短杆螺栓（轮毂螺栓）：局部 +Y = 头的外端面方向不可用，这里做成「头坐窝」样式。 */
function boltHeadGeometry(): PartDefinition["geometry"] {
  return {
    type: "lathe",
    segments: 6,
    profile: [
      [0, 0],
      ["WHEEL_BOLT_HEAD_R", 0],
      ["WHEEL_BOLT_HEAD_R", "WHEEL_BOLT_HEAD_H"],
      [0, "WHEEL_BOLT_HEAD_H"],
    ],
  };
}

/** 负重轮回转剖面（+Y = 外侧：轮毂端面带 12mm 螺栓沉窝，深 12mm）。 */
function wheelProfile(): [string, string][] {
  return [
    ["WHEEL_BORE_R", "-WHEEL_W/2"],
    ["0.13", "-WHEEL_W/2"],
    ["0.152", "-WHEEL_W/2+0.035"],
    ["0.33", "-WHEEL_W/2+0.035"],
    ["0.352", "-WHEEL_W/2"],
    ["WHEEL_R", "-WHEEL_W/2+0.004"],
    ["WHEEL_R", "WHEEL_W/2-0.004"],
    ["0.352", "WHEEL_W/2"],
    ["0.33", "WHEEL_W/2-0.035"],
    ["0.152", "WHEEL_W/2-0.035"],
    ["0.13", "WHEEL_W/2"],
    ["0.11", "WHEEL_W/2"],
    ["0.11", "WHEEL_W/2-0.012"],
    ["0.07", "WHEEL_W/2-0.012"],
    ["0.07", "WHEEL_W/2"],
    ["WHEEL_BORE_R", "WHEEL_W/2"],
    ["WHEEL_BORE_R", "-WHEEL_W/2"],
  ];
}

export function makeRunningRegistry(): ModelRegistry {
  return {
    model: "tiger",
    title: "虎式 I 行动装置（L2）",
    subtitle: "履带 / 负重轮 / 扭杆悬挂 / 前置主动轮",
    source_notes: [
      "公开资料：Kgs 63/725/130 战斗履带（725mm × 130mm × 96 节、销径 28mm、锁环固定）；双齿圈 20 齿主动轮前置；诱导轮后置可调；8 副扭杆/侧共 16 根（1644.6mm、径 55/58mm）；负重轮 φ800、每轴 3 只交错共 24 只/侧；摆臂一侧前倾一侧后倾；第 1、8 位带车内减震器。",
      "销中心轨迹按「主动轮 + 8 副负重轮 + 诱导轮」的凸包走线（上段压过负重轮顶、下段贴地线），环长求解为 96 × 130mm = 12.480m：诱导轮中心 x 由 0.67 调到 0.5995m、负重轮轴距 0.49m；主动轮齿相位取相邻两销正中。",
      "简化记录（M-C 待补）：主动轮齿顶按「不切履带板内表面」收到 0.375（实车全高齿 + 履带板啮合窗孔待补）；诱导轮张紧器、车内减震器、负重轮橡胶胎面分件随 L4 车体一起做。",
    ].join("\n"),
    constants: RUNNING_CONSTANTS,
    assemblies: [
      { id: "track", name_cn: "履带系统", name_en: "track system", explode: [0, -0.8, 0] },
      { id: "suspension", name_cn: "悬挂装置", name_en: "torsion bar suspension", explode: [0, 0.6, 0] },
      { id: "final_drive", name_cn: "前置传动", name_en: "final drive", explode: [-1, 0, 0] },
    ],
    nodes: [],
    materials: {
      rubber_tyre: {
        base: "#2b2d2f",
        metalness: 0.04,
        roughness: 0.88,
        preset: "rubber",
        envMapIntensity: 0.55,
      },
    },
    parts: buildParts(),
  };
}

function buildParts(): PartDefinition[] {
  const parts: PartDefinition[] = [];
  const add = (def: PartDefinition) => parts.push(def);

  // ================= 履带系统 =================
  add({
    id: "tiger.track.link",
    name_cn: "履带板",
    name_en: "track link",
    assembly: "track",
    build_layer: 2,
    build_order: 300,
    geometry: {
      type: "kit",
      kit: "trackLink",
      params: {
        pitch: "TRACK_PIN_PITCH",
        halfWidth: "TRACK_HALF_W",
        hornInner: "TRACK_HORN_INNER",
        hornOuter: "TRACK_HORN_OUTER",
        hornDepth: "TRACK_HORN_DEPTH",
        holeR: "TRACK_PIN_HOLE_R",
      },
    },
    material: "steel_worn",
    instances: 192,
    indexed: true,
    instance_layout: RUNNING_LAYOUTS.trackLoop,
    mate: { type: "absolute" },
    source: "Kgs 63/725/130：宽 725、节距 130、径向包络 64mm；双中央导向齿向内凸 35mm（让开负重轮 6 条车道）",
  });
  add({
    id: "tiger.track.pin",
    name_cn: "履带销",
    name_en: "track pin",
    assembly: "track",
    build_layer: 2,
    build_order: 301,
    geometry: {
      type: "lathe",
      segments: 16,
      profile: [
        [0, "-TRACK_PIN_LEN/2"],
        ["TRACK_PIN_R", "-TRACK_PIN_LEN/2"],
        ["TRACK_PIN_R", "-0.372"],
        ["TRACK_PIN_R-0.0015", "-0.372"],
        ["TRACK_PIN_R-0.0015", "-0.352"],
        ["TRACK_PIN_R", "-0.352"],
        ["TRACK_PIN_R", "TRACK_PIN_LEN/2-0.012"],
        ["TRACK_PIN_R+0.005", "TRACK_PIN_LEN/2-0.012"],
        ["TRACK_PIN_R+0.005", "TRACK_PIN_LEN/2"],
        [0, "TRACK_PIN_LEN/2"],
      ],
    },
    material: "steel",
    instances: 192,
    indexed: true,
    instance_layout: RUNNING_LAYOUTS.trackPin,
    mate: { type: "absolute" },
    source: "单销式：φ28 销 + 端头 + 锁环槽（每侧 96 个铰点各 1 根）",
  });
  add({
    id: "tiger.track.pin_clip",
    name_cn: "履带销锁环",
    name_en: "track pin clip",
    assembly: "track",
    build_layer: 2,
    build_order: 302,
    geometry: { type: "tube", rOuter: "TRACK_PIN_R+0.005", rInner: "TRACK_PIN_R-0.0005", h: 0.0045 },
    material: "steel",
    instances: 192,
    indexed: true,
    instance_layout: RUNNING_LAYOUTS.trackPinClip,
    mate: { type: "absolute" },
    source: "实车用 C 形卡 / 锁环固定销（每根销 1 个）",
  });
  add({
    id: "tiger.track.sprocket",
    name_cn: "主动轮",
    name_en: "drive sprocket",
    assembly: "track",
    build_layer: 2,
    build_order: 310,
    geometry: {
      type: "kit",
      kit: "sprocketWheel",
      params: { teeth: "SPROCKET_TEETH", pitchR: "SPROCKET_R", toothTip: "SPROCKET_TOOTH_TIP" },
    },
    material: "cast_iron_dark",
    instances: 2,
    indexed: true,
    instance_layout: RUNNING_LAYOUTS.sprocket,
    mate: { type: "absolute" },
    hint: "主动轮齿顶 0.44 与履带板内表面 0.4455 之间为 1.5mm 名义间隙（啮合窗孔 M-C 待补）",
    source: "前置双齿圈 20 齿，节圆 φ827 = 20 × 130 / 2π",
  });
  add({
    id: "tiger.track.idler",
    name_cn: "诱导轮",
    name_en: "idler wheel",
    assembly: "track",
    build_layer: 2,
    build_order: 311,
    geometry: {
      type: "lathe",
      segments: 28,
      profile: [
        ["IDLER_BORE_R", "-0.105"],
        [0.13, "-0.105"],
        [0.17, "-0.115"],
        ["IDLER_R", "-0.115"],
        ["IDLER_R", "-0.05"],
        [0.23, "-0.046"],
        [0.23, "0.046"],
        ["IDLER_R", "0.05"],
        ["IDLER_R", "0.115"],
        [0.17, "0.115"],
        [0.13, "0.105"],
        ["IDLER_BORE_R", "0.105"],
        ["IDLER_BORE_R", "-0.105"],
      ],
    },
    material: "cast_iron",
    instances: 2,
    indexed: true,
    instance_layout: RUNNING_LAYOUTS.idler,
    mate: { type: "absolute" },
    source: "后置可调双缘诱导轮：中间让开导向齿（半径 0.285 < 齿尖 0.297）",
  });
  add({
    id: "tiger.track.idler_axle",
    name_cn: "诱导轮轴",
    name_en: "idler axle",
    assembly: "track",
    build_layer: 2,
    build_order: 312,
    geometry: { type: "cylinder", r: "IDLER_AXLE_R", h: "IDLER_AXLE_LEN", segments: 20 },
    material: "steel",
    instances: 2,
    indexed: true,
    instance_layout: RUNNING_LAYOUTS.idlerAxle,
    mate: { type: "absolute" },
    source: "与诱导轮孔 2mm 名义间隙（轴承未建）",
  });

  // ================= 悬挂装置 =================
  add({
    id: "tiger.suspension.wheel",
    name_cn: "负重轮",
    name_en: "road wheel",
    assembly: "suspension",
    build_layer: 2,
    build_order: 320,
    geometry: { type: "lathe", segments: 24, profile: wheelProfile() },
    material: "rubber_tyre",
    instances: 48,
    indexed: true,
    instance_layout: RUNNING_LAYOUTS.roadWheel,
    mate: { type: "absolute" },
    source: "φ800 负重轮：8 轴 × 3 轮/侧，交错成 6 排（外单排 / 中双排 / 内单排）",
  });
  add({
    id: "tiger.suspension.hub_bolt",
    name_cn: "轮毂螺栓",
    name_en: "wheel hub bolt",
    assembly: "suspension",
    build_layer: 2,
    build_order: 321,
    geometry: boltHeadGeometry(),
    material: "steel",
    instances: 288,
    indexed: true,
    instance_layout: RUNNING_LAYOUTS.wheelHubBolt,
    mate: { type: "absolute" },
    source: "每轮 6 颗，坐在轮毂端面 12mm 沉窝里（1mm 名义间隙，垫圈/螺纹未建）",
  });
  add({
    id: "tiger.suspension.torsion_bar",
    name_cn: "扭杆",
    name_en: "torsion bar",
    assembly: "suspension",
    build_layer: 2,
    build_order: 330,
    geometry: {
      type: "lathe",
      segments: 6,
      profile: [
        [0, "-TORSION_LEN/2"],
        ["TORSION_R", "-TORSION_LEN/2"],
        ["TORSION_R", "TORSION_LEN/2"],
        [0, "TORSION_LEN/2"],
      ],
    },
    material: "steel",
    instances: 16,
    indexed: true,
    instance_layout: RUNNING_LAYOUTS.torsionBar,
    mate: { type: "absolute" },
    source: "1644.6mm、径 55/58mm 两端花键（花键未建，按 1mm 名义间隙）",
  });
  add({
    id: "tiger.suspension.torsion_anchor",
    name_cn: "扭杆固定支座",
    name_en: "torsion bar anchor",
    assembly: "suspension",
    build_layer: 2,
    build_order: 331,
    geometry: {
      type: "merge",
      parts: [
        { type: "box", w: "TORSION_ANCHOR_T", h: "TORSION_ANCHOR_H", d: "TORSION_ANCHOR_W" },
        { type: "box", w: "TORSION_ANCHOR_T", h: 0.03, d: 0.04, at: [0, "TORSION_ANCHOR_H", 0] },
      ],
    },
    material: "cast_iron",
    instances: 16,
    indexed: true,
    instance_layout: RUNNING_LAYOUTS.torsionAnchor,
    mate: { type: "absolute" },
    source: "对面侧壳体内的插座式支座（焊接在车体地板，车体 L4 待建）",
  });
  add({
    id: "tiger.suspension.swing_arm",
    name_cn: "摆臂",
    name_en: "swing arm",
    assembly: "suspension",
    build_layer: 2,
    build_order: 332,
    geometry: {
      type: "kit",
      kit: "swingArm",
      params: {
        reach: "TORSION_ARM_REACH",
        drop: "TORSION_ARM_DROP",
        // 扭杆是六棱柱（6 段 lathe，外接半径 = TORSION_R），内孔按外接半径再让 6mm。
        bossBore: "TORSION_R + 0.006",
      },
    },
    material: "cast_iron",
    instances: 16,
    indexed: true,
    instance_layout: RUNNING_LAYOUTS.swingArm,
    mate: { type: "absolute" },
    source: "一侧前倾一侧后倾（驾驶员侧前倾）；臂长 280mm、静态下垂 50mm",
  });
  add({
    id: "tiger.suspension.axle",
    name_cn: "负重轮轴",
    name_en: "road wheel axle",
    assembly: "suspension",
    build_layer: 2,
    build_order: 333,
    geometry: { type: "cylinder", r: "AXLE_R", h: "AXLE_LEN", segments: 20 },
    material: "steel",
    instances: 16,
    indexed: true,
    instance_layout: RUNNING_LAYOUTS.axle,
    mate: { type: "absolute" },
    source: "每轴 3 只负重轮共用；与轮孔 4mm 名义间隙（轴承未建）",
  });

  // ================= 前置传动 =================
  add({
    id: "tiger.final_drive.housing",
    name_cn: "终传壳体",
    name_en: "final drive housing",
    assembly: "final_drive",
    build_layer: 2,
    build_order: 340,
    geometry: {
      type: "merge",
      parts: [
        {
          type: "lathe",
          segments: 24,
          profile: [
            [0, 0],
            ["DRIVE_SHAFT_R", 0],
            ["DRIVE_SHAFT_R", "-0.15"],
            ["FINAL_DRIVE_R-0.08", "-0.15"],
            ["FINAL_DRIVE_R-0.08", "-0.46"],
            ["FINAL_DRIVE_R", "-0.46"],
            ["FINAL_DRIVE_R", "-0.5"],
            [0.1, "-0.5"],
            [0.1, "FINAL_DRIVE_LEN*-1+0.06"],
            [0, "FINAL_DRIVE_LEN*-1+0.06"],
          ],
        },
        {
          type: "boltCircle",
          count: 12,
          radius: "FINAL_DRIVE_BOLT_CIRCLE_R",
          boltR: 0.012,
          boltH: 0.014,
          at: [0, -0.5, 0],
        },
      ],
    },
    material: "cast_iron",
    instances: 2,
    indexed: true,
    instance_layout: RUNNING_LAYOUTS.finalDrive,
    mate: { type: "absolute" },
    source: "前置单级终传壳（齿轮组未建，M-C 待补）：ф390 法兰 + 12 颗 M20",
  });
  add({
    id: "tiger.final_drive.shaft",
    name_cn: "主动轮驱动轴",
    name_en: "sprocket drive shaft",
    assembly: "final_drive",
    build_layer: 2,
    build_order: 341,
    geometry: { type: "cylinder", r: "DRIVE_SHAFT_R", h: "DRIVE_SHAFT_LEN", segments: 20 },
    material: "steel",
    instances: 2,
    indexed: true,
    instance_layout: RUNNING_LAYOUTS.driveShaft,
    mate: { type: "absolute" },
    source: "终传输出轴 → 主动轮轮毂孔（6mm 名义间隙）",
  });

  return parts;
}
