import * as THREE from "three";
import type { InstanceLayout } from "../../assembler/assembler";
import type {
  GeometrySpec,
  MateSpec,
  ModelRegistry,
  PartDefinition,
} from "../../registry/types";


// ============================================================================
// models/mbt/registry —— 现代主战坦克 MBT-90（虚构型号，从头建模）
//
// 与虎式完全不同的形：楔形炮塔 / 倾斜首上 / 侧裙 + 反应装甲 / 7 对负重轮 /
// 120mm 滑膛炮 + 热护套与抽气装置 / 尾篮 / 车长独立热像仪 / 烟幕发射器。
// 坐标系：+Z = 车头、+X = 右侧、+Y = 上；地面 y = 0。所有尺寸来自 MBT 常量。
//
// 层序：L1 动力包（发动机/传动/风扇/油箱）→ L2 行走（轮/履带/悬挂）→
//       L3 车体（首上/侧板/甲板）→ L4 炮塔（楔形壳/炮/观瞄/舱口）→
//       L5 反应装甲与附件（裙板 ERA/格栅/备件/烟幕）。
// ============================================================================

export const MBT = {
  WHEEL_R: 0.4,
  WHEEL_W: 0.17,
  WHEEL_X: 1.52,
  WHEEL_Y: 0.47,
  WHEEL_COUNT: 7,
  WHEEL_Z_FIRST: 2.55,
  WHEEL_PITCH: 0.88,
  SPROCKET_Z: -3.5,
  SPROCKET_R: 0.3,
  IDLER_Z: 3.3,
  IDLER_R: 0.3,
  TRACK_TOP: 1.24,
  TRACK_BOTTOM: 0.02,
  TRACK_PITCH: 0.16,
  TRACK_ARC_R: 0.437,
  TRACK_ARC_Y: 0.463,
  HULL_FLOOR: 0.48,
  HULL_DECK: 1.72,
  HULL_HALF_W: 1.34,
  HULL_Z_REAR: -3.25,
  GLACIS_Z_BOTTOM: 3.08,
  GLACIS_Z_TOP: 2.02,
  GLACIS_Y_BOTTOM: 1.05,
  GLACIS_Y_TOP: 1.72,
  GLACIS_ANGLE_DEG: 33,
  TURRET_Z: 0.1,
  TURRET_FLOOR: 1.72,
  TURRET_ROOF: 2.44,
  TURRET_HALF_W: 1.3,
  TURRET_Z_FRONT: 1.58,
  TURRET_Z_REAR: -1.52,
  GUN_Y: 1.98,
  GUN_ROOT_Z: 1.62,
  BARREL_LEN: 5.6,
  SKIRT_X: 1.86,
  SKIRT_Y: 1.04,
} as const;

export const MBT_TRACK_LINKS_PER_SIDE = Math.round(
  (2 * (MBT.IDLER_Z - MBT.SPROCKET_Z) + 2 * Math.PI * MBT.TRACK_ARC_R) / MBT.TRACK_PITCH,
);

/** 履带环上弧长 s 处的点与切线角（绕 X 的旋转，使履带板 +Z 对准切向）。 */
export function mbtTrackPose(s: number): { z: number; y: number; angle: number } {
  const z1 = MBT.SPROCKET_Z;
  const z2 = MBT.IDLER_Z;
  const R = MBT.TRACK_ARC_R;
  const yc = MBT.TRACK_ARC_Y;
  const L = z2 - z1;
  const arc = Math.PI * R;
  const total = 2 * L + 2 * arc;
  let u = ((s % total) + total) % total;
  if (u < L) return { z: z1 + u, y: yc + R, angle: 0 };
  u -= L;
  if (u < arc) {
    const phi = u / R;
    return { z: z2 + R * Math.sin(phi), y: yc + R * Math.cos(phi), angle: phi };
  }
  u -= arc;
  if (u < L) return { z: z2 - u, y: yc - R, angle: Math.PI };
  u -= L;
  const phi = u / R;
  return { z: z1 - R * Math.sin(phi), y: yc - R * Math.cos(phi), angle: Math.PI + phi };
}

export const MBT_TRACK_PERIMETER =
  2 * (MBT.IDLER_Z - MBT.SPROCKET_Z) + 2 * Math.PI * MBT.TRACK_ARC_R;

const DEG = Math.PI / 180;
const wheelZ = (i: number) => MBT.WHEEL_Z_FIRST - i * MBT.WHEEL_PITCH;

/** 两侧实例：index % 2 → 左(-X) / 右(+X)。 */
const side = (index: number): 1 | -1 => (index % 2 === 0 ? 1 : -1);

export function makeMbtLayouts(): Record<string, InstanceLayout> {
  const layouts: Record<string, InstanceLayout> = {};

  // ---- 行走 ----
  layouts["mbt90.wheel"] = ({ index }) => {
    const s = side(index);
    const k = Math.floor(index / 2);
    return new THREE.Matrix4().makeTranslation(s * MBT.WHEEL_X, MBT.WHEEL_Y, wheelZ(k));
  };
  layouts["mbt90.wheel_bolt"] = ({ index }) => {
    const wheel = Math.floor(index / 8);
    const bolt = index % 8;
    const s = side(wheel);
    const k = Math.floor(wheel / 2);
    const a = (bolt / 8) * Math.PI * 2;
    return new THREE.Matrix4()
      .makeRotationZ(Math.PI / 2)
      .setPosition(
        s * (MBT.WHEEL_X + MBT.WHEEL_W / 2 + 0.012),
        MBT.WHEEL_Y + Math.cos(a) * 0.095,
        wheelZ(k) + Math.sin(a) * 0.095,
      );
  };
  layouts["mbt90.sprocket"] = ({ index }) => {
    const s = side(index);
    return new THREE.Matrix4().makeTranslation(s * MBT.WHEEL_X, MBT.WHEEL_Y, MBT.SPROCKET_Z);
  };
  layouts["mbt90.idler"] = ({ index }) => {
    const s = side(index);
    return new THREE.Matrix4().makeTranslation(s * MBT.WHEEL_X, MBT.WHEEL_Y, MBT.IDLER_Z);
  };
  layouts["mbt90.torsion_arm"] = ({ index }) => {
    const s = side(index);
    const k = Math.floor(index / 2);
    return new THREE.Matrix4().makeTranslation(s * (MBT.WHEEL_X - 0.32), 0.39, wheelZ(k));
  };
  layouts["mbt90.trackLink"] = ({ index }) => {
    const perSide = MBT_TRACK_LINKS_PER_SIDE;
    const s = side(index);
    const k = index % perSide;
    const pose = mbtTrackPose((k / perSide) * MBT_TRACK_PERIMETER);
    return new THREE.Matrix4()
      .makeRotationX(pose.angle)
      .setPosition(s * MBT.WHEEL_X, pose.y + 0.03, pose.z);
  };

  layouts["mbt90.cooling_fan"] = ({ index }) =>
    new THREE.Matrix4().makeTranslation(index === 0 ? -0.905 : 0.905, 1.15, -2.9);
  layouts["mbt90.fuel_tank"] = ({ index }) =>
    new THREE.Matrix4().makeTranslation(index === 0 ? -0.72 : 0.72, 1.16, -0.95);
  layouts["mbt90.grille"] = ({ index }) =>
    new THREE.Matrix4()
      .makeRotationX(-Math.PI / 2)
      .setPosition(index === 0 ? -0.68 : 0.68, 1.795, -1.7);
  layouts["mbt90.antenna"] = ({ index }) =>
    new THREE.Matrix4().makeTranslation(index === 0 ? -1.0 : 1.0, 2.54, -1.35);

  // ---- 车体 ----
  layouts["mbt90.driver_periscope"] = ({ index }) =>
    new THREE.Matrix4()
      .makeRotationX(MBT.GLACIS_ANGLE_DEG * DEG)
      .setPosition(-1.2 + index * 0.15, 1.8, 2.04);
  layouts["mbt90.fuel_cap"] = ({ index }) =>
    new THREE.Matrix4().makeTranslation(index === 0 ? -0.85 : 0.85, 1.77, -2.35);
  layouts["mbt90.headlight"] = ({ index }) =>
    new THREE.Matrix4().makeTranslation(index === 0 ? -1.22 : 1.22, 1.4, 2.93);
  layouts["mbt90.tow_hook"] = ({ index }) =>
    new THREE.Matrix4().makeTranslation(index === 0 ? -0.92 : 0.92, 1.0, 3.26);

  // ---- 炮塔 ----
  layouts["mbt90.cupola_periscope"] = ({ index }) => {
    const a = (index / 6) * Math.PI * 2;
    return new THREE.Matrix4()
      .makeRotationY(Math.PI / 2 - a)
      .setPosition(-0.55 + Math.cos(a) * 0.47, 2.62, -0.18 + Math.sin(a) * 0.47);
  };
  layouts["mbt90.stowage_box"] = ({ index }) =>
    new THREE.Matrix4().makeTranslation(index === 0 ? -0.62 : 0.62, 2.16, -2.1);
  layouts["mbt90.spare_track"] = ({ index }) =>
    new THREE.Matrix4().makeTranslation(1.33, 2.02, -0.75 + index * 0.2);
  layouts["mbt90.lifting_eye"] = ({ index }) => {
    const spots: [number, number][] = [
      [-0.95, 1.3],
      [0.95, 1.3],
      [-0.95, -1.2],
      [0.95, -1.2],
    ];
    const [x, z] = spots[index] ?? spots[0]!;
    return new THREE.Matrix4().makeTranslation(x, 2.66, z);
  };
  layouts["mbt90.smoke_launcher"] = ({ index }) => {
    const s = index === 0 ? -1 : 1;
    return new THREE.Matrix4()
      .makeRotationY(s * 90 * DEG)
      .setPosition(s * 1.42, 2.14, -0.62);
  };

  // ---- 反应装甲（全部按「安装面局部旋转」摆位）----
  layouts["mbt90.era_glacis"] = ({ index }) => {
    const row = Math.floor(index / 4);
    const col = index % 4;
    const rot = new THREE.Euler(MBT.GLACIS_ANGLE_DEG * DEG, 0, 0);
    return new THREE.Matrix4().compose(
      new THREE.Vector3(-0.81 + col * 0.54, 1.23 + row * 0.3, 2.7 + row * 0.2),
      new THREE.Quaternion().setFromEuler(rot),
      new THREE.Vector3(1, 1, 1),
    );
  };
  layouts["mbt90.era_turret"] = ({ index }) => {
    const s = index < 6 ? 1 : -1;
    const k = index % 6;
    const row = Math.floor(k / 3);
    const col = k % 3;
    const quat = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(-8 * DEG, s * -24 * DEG, 0),
    );
    // 在炮塔前斜板局部系里排 3×2，再沿板法线抬出 78mm（板厚 50 + 块厚 70 的一半）
    const local = new THREE.Vector3((col - 1) * 0.38, (row - 0.5) * 0.27, 0.14);
    local.applyQuaternion(quat);
    const base = new THREE.Vector3(s * 0.64, 2.09, 1.02).add(local);
    return new THREE.Matrix4().compose(base, quat, new THREE.Vector3(1, 1, 1));
  };
  layouts["mbt90.era_skirt"] = ({ index }) => {
    const s = index < 6 ? 1 : -1;
    const k = index % 6;
    const quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -s * 90 * DEG));
    return new THREE.Matrix4().compose(
      new THREE.Vector3(s * (MBT.SKIRT_X + 0.13), 1.04, -2.15 + k * 0.86),
      quat,
      new THREE.Vector3(1, 1, 1),
    );
  };

  return layouts;
}

// ---------------------------------------------------------------------------
// 零件
// ---------------------------------------------------------------------------
function buildMbtParts(): PartDefinition[] {
  const parts: PartDefinition[] = [];
  const add = (part: PartDefinition) => parts.push(part);
  const abs = (position: [number, number, number], rotation?: [number, number, number]): MateSpec =>
    rotation ? { type: "absolute", position, rotation } : { type: "absolute", position };

  const MERGE = (...items: Array<GeometrySpec & { at?: [number, number, number] }>): GeometrySpec => ({
    type: "merge",
    parts: items,
  });
  const B = (
    w: number,
    h: number,
    d: number,
    at: [number, number, number],
    bevel = 0.012,
  ): GeometrySpec & { at?: [number, number, number] } => ({ type: "box", w, h, d, at, bevel });
  const C = (
    r: number,
    h: number,
    at: [number, number, number],
    segments = 20,
    rTop = r,
  ): GeometrySpec & { at?: [number, number, number] } => ({
    type: "cylinder",
    r,
    h,
    rTop,
    segments,
    at,
    bevel: 0.002,
  });

  // ========================= L1 动力包 =========================
  add({
    id: "mbt90.powerpack.engine",
    name_cn: "动力包（发动机缸体）",
    name_en: "powerpack engine block",
    assembly: "powerpack",
    build_layer: 1,
    build_order: 100,
    geometry: MERGE(
      B(1.3, 0.62, 1.5, [0, 0.31, 0], 0.02),
      B(1.15, 0.16, 1.3, [0, 0.7, 0], 0.015),
      ...Array.from({ length: 6 }, (_, i) =>
        B(1.32, 0.44, 0.05, [0, 0.3, -0.6 + i * 0.24], 0.008),
      ),
    ),
    material: "mbt_steel",
    mate: abs([0, 0.82, -2.35]),
    source: "动力包：V12 柴油机缸体（1.7×0.62×1.5）+ 缸盖 + 6 道加强肋；整体横置于车体后部。",
  });
  add({
    id: "mbt90.powerpack.transmission",
    name_cn: "传动装置",
    name_en: "transmission",
    assembly: "powerpack",
    build_layer: 1,
    build_order: 101,
    geometry: MERGE(
      B(0.9, 0.55, 0.9, [0, 0, 0], 0.015),
      C(0.16, 0.5, [0, 0.25, 0], 20),
      B(0.24, 0.24, 0.2, [0, 0.1, -0.5], 0.01),
    ),
    material: "mbt_steel",
    mate: abs([0, 0.95, -0.7]),
    source: "传动/变速装置（0.9×0.55×0.9）横置于发动机前，输出轴接到两侧终传。",
  });
  add({
    id: "mbt90.powerpack.cooling_fan",
    name_cn: "冷却风扇",
    name_en: "cooling fan",
    assembly: "powerpack",
    build_layer: 1,
    build_order: 102,
    geometry: MERGE(
      C(0.24, 0.09, [0, 0, 0], 28),
      C(0.07, 0.16, [0, 0.1, 0], 16),
      ...Array.from({ length: 7 }, (_, i) => {
        const a = (i / 7) * Math.PI * 2;
        return B(0.19, 0.02, 0.08, [Math.cos(a) * 0.12, Math.sin(a) * 0.12, 0.05], 0.004);
      }),
    ),
    material: "mbt_steel",
    instances: 2,
    indexed: true,
    instance_layout: "mbt90.cooling_fan",
    mate: { type: "absolute" },
    source: "两台冷却风扇（⌀600），从发动机舱甲板格栅抽风。",
  });
  add({
    id: "mbt90.powerpack.fuel_tank",
    name_cn: "燃油箱",
    name_en: "fuel tank",
    assembly: "powerpack",
    build_layer: 1,
    build_order: 103,
    geometry: MERGE(B(0.55, 0.5, 1.2, [0, 0, 0], 0.02), C(0.06, 0.1, [0, 0.28, 0.4], 12)),
    material: "mbt_steel",
    instances: 2,
    indexed: true,
    instance_layout: "mbt90.fuel_tank",
    mate: { type: "absolute" },
    source: "两侧油箱（0.55×0.5×1.2），在动力包与侧裙之间。",
  });
  add({
    id: "mbt90.powerpack.exhaust",
    name_cn: "排气总管",
    name_en: "exhaust manifold",
    assembly: "powerpack",
    build_layer: 1,
    build_order: 104,
    geometry: { type: "tube", rOuter: 0.09, rInner: 0.075, h: 0.4, segments: 18 },
    material: "mbt_exhaust",
    mate: abs([0.75, 1.3, -2.95], [90, 0, 0]),
    source: "排气总管 ⌀180×1400（沿 Z），从发动机两侧汇到车尾排气口。",
  });

  // ========================= L2 行走 =========================
  add({
    id: "mbt90.running.road_wheel",
    name_cn: "负重轮",
    name_en: "road wheel",
    assembly: "running",
    build_layer: 2,
    build_order: 300,
    geometry: { type: "kit", kit: "roadWheel", params: { r: MBT.WHEEL_R, w: MBT.WHEEL_W } },
    material: "mbt_rubber",
    instances: MBT.WHEEL_COUNT * 2,
    indexed: true,
    instance_layout: "mbt90.wheel",
    mate: { type: "absolute" },
    source: "双联胶胎负重轮 ×14（7 对，⌀800、胎宽 170），轮轴 X 向。",
  });
  add({
    id: "mbt90.running.wheel_bolt",
    name_cn: "轮毂螺栓",
    name_en: "hub bolt",
    assembly: "running",
    build_layer: 2,
    build_order: 301,
    geometry: { type: "cylinder", r: 0.018, h: 0.035, segments: 10, bevel: 0.002 },
    material: "mbt_steel",
    instances: MBT.WHEEL_COUNT * 2 * 8,
    indexed: true,
    instance_layout: "mbt90.wheel_bolt",
    mate: { type: "absolute" },
    source: "每个负重轮 8 颗轮毂螺栓（共 112），头面贴轮毂盘外表面。",
  });
  add({
    id: "mbt90.running.sprocket",
    name_cn: "主动轮",
    name_en: "drive sprocket",
    assembly: "running",
    build_layer: 2,
    build_order: 302,
    geometry: { type: "kit", kit: "sprocket", params: { r: MBT.SPROCKET_R, w: 0.16 } },
    material: "mbt_track",
    instances: 2,
    indexed: true,
    instance_layout: "mbt90.sprocket",
    mate: { type: "absolute" },
    source: "主动轮（12 齿，节圆 ⌀700）×2，车尾驱动。",
  });
  add({
    id: "mbt90.running.idler",
    name_cn: "诱导轮",
    name_en: "idler",
    assembly: "running",
    build_layer: 2,
    build_order: 303,
    geometry: { type: "kit", kit: "roadWheel", params: { r: MBT.IDLER_R, w: 0.16 } },
    material: "mbt_rubber",
    instances: 2,
    indexed: true,
    instance_layout: "mbt90.idler",
    mate: { type: "absolute" },
    source: "诱导轮 ×2（⌀660），车头调履带张力。",
  });
  add({
    id: "mbt90.running.torsion_arm",
    name_cn: "扭杆摆臂",
    name_en: "torsion arm",
    assembly: "running",
    build_layer: 2,
    build_order: 304,
    geometry: MERGE(B(0.34, 0.06, 0.12, [0, 0, 0], 0.008), C(0.05, 0.34, [-0.16, 0, 0], 12)),
    material: "mbt_steel",
    instances: MBT.WHEEL_COUNT * 2,
    indexed: true,
    instance_layout: "mbt90.torsion_arm",
    mate: { type: "absolute" },
    source: "扭杆摆臂 ×14：从车体侧壁伸到轮轴，轴套 ⌀100。",
  });
  add({
    id: "mbt90.running.track",
    name_cn: "履带板",
    name_en: "track link",
    assembly: "running",
    build_layer: 2,
    build_order: 305,
    geometry: { type: "kit", kit: "trackLink", params: { pitch: MBT.TRACK_PITCH, width: 0.42 } },
    material: "mbt_track",
    instances: MBT_TRACK_LINKS_PER_SIDE * 2,
    indexed: true,
    instance_layout: "mbt90.trackLink",
    mate: { type: "absolute" },
    source: "履带板 ×2×N（节距 160、宽 420）：沿主动轮/诱导轮与负重轮组成的环形路径排布，中央导向齿咬在轮槽里。",
  });

  // ========================= L3 车体 =========================
  add({
    id: "mbt90.hull.floor",
    name_cn: "车体底板",
    name_en: "hull floor",
    assembly: "hull",
    build_layer: 3,
    build_order: 400,
    geometry: MERGE(B(2.6, 0.12, 6.0, [0, 0, 0], 0.015)),
    material: "mbt_green",
    mate: abs([0, MBT.HULL_FLOOR, -0.1]),
    source: "车体底板 2.6×6.2×120，离地 0.48。",
  });
  add({
    id: "mbt90.hull.side",
    name_cn: "车体侧板",
    name_en: "hull side",
    assembly: "hull",
    build_layer: 3,
    build_order: 401,
    geometry: MERGE(B(0.08, 0.9, 5.0, [0, 0, 0], 0.012), B(0.04, 0.18, 4.8, [0, 0.36, 0], 0.006)),
    material: "mbt_green",
    dual: true,
    mate: abs([1.2, 1.2, -0.6]),
    source: "车体侧板（62mm 复合裙板支座），外挂侧裙与反应装甲。",
  });
  add({
    id: "mbt90.hull.glacis",
    name_cn: "首上装甲",
    name_en: "glacis",
    assembly: "hull",
    build_layer: 3,
    build_order: 402,
    geometry: MERGE(B(2.56, 1.18, 0.1, [0, 0, 0], 0.012)),
    material: "mbt_green",
    mate: abs([0, 1.38, 2.55], [MBT.GLACIS_ANGLE_DEG, 0, 0]),
    source: "首上装甲：2.66 宽 × 1.18 斜长 × 100 厚，与水平面约 33°（大倾角），上缘接甲板、下缘接首下。",
  });
  add({
    id: "mbt90.hull.lower_front",
    name_cn: "首下装甲",
    name_en: "lower front plate",
    assembly: "hull",
    build_layer: 3,
    build_order: 403,
    geometry: B(2.5, 0.7, 0.09, [0, 0, 0], 0.012),
    material: "mbt_green",
    mate: abs([0, 0.82, 3.06], [12, 0, 0]),
    source: "首下装甲（与水平约 12°），下缘接底板。",
  });
  add({
    id: "mbt90.hull.rear",
    name_cn: "尾板",
    name_en: "rear plate",
    assembly: "hull",
    build_layer: 3,
    build_order: 404,
    geometry: MERGE(B(2.6, 1.16, 0.09, [0, 0, 0], 0.012), B(0.5, 0.36, 0.06, [0.7, 0.1, -0.08], 0.008)),
    material: "mbt_green",
    mate: abs([0, 1.16, MBT.HULL_Z_REAR], [-8, 0, 0]),
    source: "尾板（后倾 8°）+ 排气口盖板。",
  });
  add({
    id: "mbt90.hull.deck",
    name_cn: "动力舱甲板",
    name_en: "engine deck",
    assembly: "hull",
    build_layer: 3,
    build_order: 405,
    geometry: MERGE(B(2.7, 0.08, 3.0, [0, 0, 0], 0.012), B(2.5, 0.05, 2.7, [0, 0.06, 0], 0.01)),
    material: "mbt_green",
    mate: abs([0, MBT.HULL_DECK, -1.55]),
    source: "动力舱甲板 2.7×3.0，上面开格栅、油箱盖与排气口。",
  });
  add({
    id: "mbt90.hull.grille",
    name_cn: "动力舱格栅",
    name_en: "engine grille",
    assembly: "hull",
    build_layer: 3,
    build_order: 406,
    geometry: { type: "louver", count: 9, w: 1.06, h: 0.9, slantDeg: 32, t: 0.03 },
    material: "mbt_steel",
    instances: 2,
    indexed: true,
    instance_layout: "mbt90.grille",
    mate: { type: "absolute" },
    source: "左右两块百叶格栅（1.06×0.9，9 片 32° 百叶），兼作进气与散热。",
  });
  add({
    id: "mbt90.hull.driver_hatch",
    name_cn: "驾驶舱盖",
    name_en: "driver hatch",
    assembly: "hull",
    build_layer: 3,
    build_order: 407,
    geometry: MERGE(
      { type: "cylinder", r: 0.28, h: 0.06, segments: 24, bevel: 0.006 },
      { type: "tube", rOuter: 0.3, rInner: 0.27, h: 0.05, segments: 24 },
    ),
    material: "mbt_green",
    mate: abs([-0.55, 1.76, 1.98], [MBT.GLACIS_ANGLE_DEG, 0, 0]),
    source: "驾驶员舱盖（⌀560）嵌在首上装甲上，后铰链。",
  });
  add({
    id: "mbt90.hull.periscope",
    name_cn: "驾驶员潜望镜",
    name_en: "driver periscope",
    assembly: "hull",
    build_layer: 3,
    build_order: 408,
    geometry: MERGE(B(0.13, 0.09, 0.06, [0, 0, 0], 0.008), B(0.1, 0.05, 0.02, [0, 0.07, 0.01], 0.004)),
    material: "mbt_glass",
    instances: 3,
    indexed: true,
    instance_layout: "mbt90.driver_periscope",
    mate: { type: "absolute" },
    source: "驾驶员 3 具潜望镜（防弹玻璃块），随首上倾角。",
  });
  add({
    id: "mbt90.hull.headlight",
    name_cn: "前灯",
    name_en: "headlight",
    assembly: "hull",
    build_layer: 3,
    build_order: 409,
    geometry: MERGE(
      { type: "cylinder", r: 0.1, h: 0.12, segments: 20, bevel: 0.006 },
      { type: "cylinder", r: 0.095, h: 0.02, segments: 20, bevel: 0.002 },
      B(0.26, 0.03, 0.03, [0, 0.13, 0], 0.004),
      B(0.03, 0.24, 0.03, [0, 0.02, 0], 0.004),
    ),
    material: "mbt_lamp",
    instances: 2,
    indexed: true,
    instance_layout: "mbt90.headlight",
    mate: { type: "absolute" },
    source: "前灯 ×2（⌀200 带护笼），装在首上两侧。",
  });
  add({
    id: "mbt90.hull.tow_hook",
    name_cn: "拖钩",
    name_en: "tow hook",
    assembly: "hull",
    build_layer: 3,
    build_order: 410,
    geometry: MERGE(B(0.18, 0.16, 0.1, [0, 0, 0], 0.008), B(0.1, 0.1, 0.06, [0, -0.08, 0.04], 0.006)),
    material: "mbt_steel",
    instances: 2,
    indexed: true,
    instance_layout: "mbt90.tow_hook",
    mate: { type: "absolute" },
    source: "拖钩 ×2，焊在首下两端。",
  });
  add({
    id: "mbt90.hull.fuel_cap",
    name_cn: "燃油加注口",
    name_en: "fuel cap",
    assembly: "hull",
    build_layer: 3,
    build_order: 411,
    geometry: MERGE(
      { type: "cylinder", r: 0.12, h: 0.05, segments: 20, bevel: 0.004 },
      { type: "cylinder", r: 0.08, h: 0.03, segments: 16, bevel: 0.003 },
    ),
    material: "mbt_steel",
    instances: 2,
    indexed: true,
    instance_layout: "mbt90.fuel_cap",
    mate: { type: "absolute" },
    source: "油箱加注口 ×2（⌀240），在动力舱甲板后部。",
  });
  add({
    id: "mbt90.hull.skirt",
    name_cn: "侧裙板",
    name_en: "side skirt",
    assembly: "hull",
    build_layer: 3,
    build_order: 412,
    geometry: MERGE(B(0.06, 0.72, 5.6, [0, 0, 0], 0.01), B(0.05, 0.06, 5.6, [0, 0.36, 0], 0.008)),
    material: "mbt_green",
    dual: true,
    mate: abs([MBT.SKIRT_X, MBT.SKIRT_Y, -0.2]),
    source: "侧裙板（60 厚复合裙板）挂在车体侧板上，外侧装反应装甲。",
  });
  add({
    id: "mbt90.hull.mudflap",
    name_cn: "挡泥板",
    name_en: "mud flap",
    assembly: "hull",
    build_layer: 3,
    build_order: 413,
    geometry: B(0.5, 0.42, 0.03, [0, 0, 0], 0.008),
    material: "mbt_rubber",
    dual: true,
    mate: abs([1.9, 0.55, -3.2]),
    source: "车尾挡泥橡胶板 ×2。",
  });

  // ========================= L4 炮塔 =========================
  add({
    id: "mbt90.turret.cheek",
    name_cn: "炮塔前斜板",
    name_en: "turret cheek",
    assembly: "turret",
    build_layer: 4,
    build_order: 500,
    geometry: B(1.1, 0.56, 0.1, [0, 0, 0], 0.012),
    material: "mbt_green",
    dual: true,
    mate: abs([0.64, 2.08, 1.02], [-8, -24, 0]),
    node: "Turret",
    source: "炮塔前斜板：与纵轴成 24°、后倾 8°，形成楔形首部（现代复合装甲炮塔的典型大倾角）。",
  });
  add({
    id: "mbt90.turret.side",
    name_cn: "炮塔侧板",
    name_en: "turret side",
    assembly: "turret",
    build_layer: 4,
    build_order: 501,
    geometry: B(0.09, 0.56, 2.9, [0, 0, 0], 0.012),
    material: "mbt_green",
    dual: true,
    mate: abs([1.26, 2.08, -0.06], [0, 0, 0]),
    node: "Turret",
    source: "炮塔侧板（2.9 长 × 0.68 高），带反应装甲安装轨。",
  });
  add({
    id: "mbt90.turret.rear",
    name_cn: "炮塔尾板",
    name_en: "turret rear",
    assembly: "turret",
    build_layer: 4,
    build_order: 502,
    geometry: B(2.36, 0.56, 0.1, [0, 0, 0], 0.012),
    material: "mbt_green",
    mate: abs([0, 2.08, MBT.TURRET_Z_REAR], [10, 0, 0]),
    node: "Turret",
    source: "炮塔尾板（后倾 10°），外挂尾篮。",
  });
  add({
    id: "mbt90.turret.roof",
    name_cn: "炮塔顶盖",
    name_en: "turret roof",
    assembly: "turret",
    build_layer: 4,
    build_order: 503,
    geometry: MERGE(B(2.6, 0.09, 3.0, [0, 0, 0], 0.015), B(2.2, 0.04, 2.6, [0, 0.07, 0], 0.01)),
    material: "mbt_green",
    mate: abs([0, MBT.TURRET_ROOF, 0.02]),
    node: "Turret",
    source: "炮塔顶盖 2.6×3.0（复合顶甲），上面装舱盖/观瞄/天线。",
  });
  add({
    id: "mbt90.turret.floor",
    name_cn: "炮塔底环",
    name_en: "turret floor ring",
    assembly: "turret",
    build_layer: 4,
    build_order: 504,
    geometry: { type: "tube", rOuter: 1.1, rInner: 0.98, h: 0.12, segments: 40 },
    material: "mbt_steel",
    mate: abs([0, MBT.TURRET_FLOOR, 0.02]),
    node: "Turret",
    source: "炮塔座圈（⌀2200/⌀1960，高 120）坐在车体座圈上。",
  });
  add({
    id: "mbt90.turret.mantlet",
    name_cn: "炮盾",
    name_en: "mantlet",
    assembly: "turret",
    build_layer: 4,
    build_order: 505,
    geometry: { type: "tube", rOuter: 0.21, rInner: 0.105, h: 0.42, segments: 32 },
    material: "mbt_green",
    mate: abs([0, MBT.GUN_Y, MBT.GUN_ROOT_Z], [90, 0, 0]),
    node: "Gun",
    source: "炮盾（⌀420/⌀210 环，厚 420），包住炮管根部；炮管在孔内有 15mm 环缝。",
  });
  add({
    id: "mbt90.turret.barrel",
    name_cn: "120mm 滑膛炮",
    name_en: "120 mm smoothbore",
    assembly: "turret",
    build_layer: 4,
    build_order: 506,
    geometry: { type: "kit", kit: "gunBarrel", params: { len: MBT.BARREL_LEN, r: 0.075 } },
    material: "mbt_steel",
    mate: abs([0, MBT.GUN_Y, MBT.GUN_ROOT_Z + 0.1]),
    node: "GunRecoil",
    source: "120mm 滑膛炮（含炮尾 0.5、热护套两段 2.25、抽气装置、身管 5.1），炮管轴线 y 1.98；后坐由 GunRecoil 节点 -Z 平移。",
  });
  add({
    id: "mbt90.turret.muzzle_brake",
    name_cn: "炮口段",
    name_en: "muzzle",
    assembly: "turret",
    build_layer: 4,
    build_order: 507,
    geometry: MERGE(
      { type: "cylinder", r: 0.1, h: 0.22, segments: 20, bevel: 0.004 },
      { type: "cylinder", r: 0.09, h: 0.1, segments: 20, bevel: 0.003 },
      B(0.26, 0.09, 0.1, [0, 0, 0], 0.006),
    ),
    material: "mbt_steel",
    mate: abs([0, MBT.GUN_Y, MBT.GUN_ROOT_Z + MBT.BARREL_LEN - 0.05]),
    node: "GunRecoil",
    source: "炮口段（⌀200×220 + 侧向制退孔），在身管前端。",
  });
  add({
    id: "mbt90.turret.coax",
    name_cn: "并列机枪",
    name_en: "coaxial MG",
    assembly: "turret",
    build_layer: 4,
    build_order: 508,
    geometry: MERGE(
      B(0.16, 0.16, 0.55, [0, 0, 0], 0.008),
      { type: "cylinder", r: 0.022, h: 0.5, segments: 12, bevel: 0.002 },
      C(0.05, 0.12, [0, 0.12, 0.18], 12),
    ),
    material: "mbt_steel",
    mate: abs([0.34, 2.02, MBT.GUN_ROOT_Z - 0.05]),
    node: "Gun",
    source: "7.62 并列机枪（机匣 160×160×550 + 枪管 500），位于主炮右侧。",
  });
  add({
    id: "mbt90.turret.cupola",
    name_cn: "车长指挥塔",
    name_en: "commander cupola",
    assembly: "turret",
    build_layer: 4,
    build_order: 509,
    geometry: MERGE(
      { type: "tube", rOuter: 0.44, rInner: 0.31, h: 0.2, segments: 32 },
      { type: "cylinder", r: 0.31, h: 0.06, segments: 28, bevel: 0.004 },
    ),
    material: "mbt_green",
    mate: abs([0.55, 2.59, -0.18]),
    node: "Turret",
    source: "车长指挥塔（外 ⌀880 / 内 ⌀620，高 200）+ 顶盖（⌀620），周向 6 具潜望镜。",
  });
  add({
    id: "mbt90.turret.cupola_periscope",
    name_cn: "车长周向潜望镜",
    name_en: "cupola periscope",
    assembly: "turret",
    build_layer: 4,
    build_order: 510,
    geometry: MERGE(B(0.11, 0.1, 0.05, [0, 0, 0], 0.006), B(0.08, 0.05, 0.02, [0, 0, 0.03], 0.004)),
    material: "mbt_glass",
    instances: 6,
    indexed: true,
    instance_layout: "mbt90.cupola_periscope",
    instance_nodes: Array.from({ length: 6 }, () => "Turret"),
    mate: { type: "absolute" },
    source: "车长塔周向潜望镜 6 具（间隔 60°，防弹玻璃块），装在塔壁观察缝里。",
  });
  add({
    id: "mbt90.turret.citv",
    name_cn: "车长独立热像仪",
    name_en: "CITV",
    assembly: "turret",
    build_layer: 4,
    build_order: 511,
    geometry: MERGE(
      B(0.26, 0.3, 0.34, [0, 0, 0], 0.02),
      { type: "cylinder", r: 0.12, h: 0.12, segments: 20, bevel: 0.004 },
      B(0.22, 0.14, 0.02, [0, 0.02, 0.18], 0.004),
      C(0.05, 0.18, [0, -0.14, 0], 12),
    ),
    material: "mbt_green",
    mate: abs([1.14, 2.75, -0.18]),
    node: "Turret",
    source: "车长独立热像仪（0.3×0.3×0.34 + ⌀240 镜头罩 + 底座），在车长塔右侧；镜头玻璃朝前。",
  });
  add({
    id: "mbt90.turret.gunner_sight",
    name_cn: "炮长主瞄",
    name_en: "gunner sight",
    assembly: "turret",
    build_layer: 4,
    build_order: 512,
    geometry: MERGE(
      B(0.36, 0.26, 0.5, [0, 0, 0], 0.015),
      B(0.28, 0.2, 0.03, [0, 0.01, 0.26], 0.004),
      B(0.3, 0.05, 0.34, [0, -0.1, 0.02], 0.006),
    ),
    material: "mbt_glass",
    mate: abs([-0.68, 2.64, 0.58]),
    node: "Turret",
    source: "炮长主瞄准镜（昼/热像双通道，0.36×0.26×0.5），在炮塔顶前左，镜头朝前。",
  });
  add({
    id: "mbt90.turret.loader_hatch",
    name_cn: "装填手舱盖",
    name_en: "loader hatch",
    assembly: "turret",
    build_layer: 4,
    build_order: 513,
    geometry: MERGE(
      { type: "cylinder", r: 0.27, h: 0.05, segments: 24, bevel: 0.005 },
      { type: "tube", rOuter: 0.3, rInner: 0.27, h: 0.05, segments: 24 },
    ),
    material: "mbt_green",
    mate: abs([-0.45, 2.51, -0.95]),
    node: "Turret",
    source: "装填手舱盖（⌀540）+ 座圈，炮塔顶后左。",
  });
  add({
    id: "mbt90.turret.bustle_rack",
    name_cn: "尾篮",
    name_en: "bustle rack",
    assembly: "turret",
    build_layer: 4,
    build_order: 514,
    geometry: { type: "kit", kit: "bustleRack", params: { w: 2.3, h: 0.55, d: 0.85 } },
    material: "mbt_steel",
    mate: abs([0, 2.12, -2.1]),
    node: "Turret",
    source: "尾篮（2.3×0.55×0.85 框架 + 底网），挂在炮塔尾板上，装乘员物资。",
  });
  add({
    id: "mbt90.turret.stowage_box",
    name_cn: "尾篮储物箱",
    name_en: "stowage box",
    assembly: "turret",
    build_layer: 4,
    build_order: 515,
    geometry: MERGE(B(0.8, 0.42, 0.7, [0, 0, 0], 0.015), B(0.82, 0.04, 0.72, [0, 0.23, 0], 0.008)),
    material: "mbt_canvas",
    instances: 2,
    indexed: true,
    instance_layout: "mbt90.stowage_box",
    instance_nodes: Array.from({ length: 2 }, () => "Turret"),
    mate: { type: "absolute" },
    source: "尾篮内两只储物箱（0.8×0.42×0.7，帆布盖）。",
  });
  add({
    id: "mbt90.turret.spare_track",
    name_cn: "备品履带板",
    name_en: "spare track links",
    assembly: "turret",
    build_layer: 4,
    build_order: 516,
    geometry: B(0.03, 0.4, 0.16, [0, 0, 0], 0.006),
    material: "mbt_track",
    instances: 3,
    indexed: true,
    instance_layout: "mbt90.spare_track",
    instance_nodes: Array.from({ length: 3 }, () => "Turret"),
    mate: { type: "absolute" },
    source: "炮塔右侧外挂 3 块备用履带板。",
  });
  add({
    id: "mbt90.turret.antenna",
    name_cn: "电台天线",
    name_en: "antenna",
    assembly: "turret",
    build_layer: 4,
    build_order: 517,
    geometry: MERGE(
      { type: "cylinder", r: 0.05, h: 0.1, segments: 14, bevel: 0.004 },
      { type: "cylinder", r: 0.01, h: 1.1, segments: 8 },
    ),
    material: "mbt_steel",
    instances: 2,
    indexed: true,
    instance_layout: "mbt90.antenna",
    mate: { type: "absolute" },
    node: "Turret",
    source: "两根鞭状天线（⌀20×1100 + ⌀100 底座），炮塔后角。",
  });
  add({
    id: "mbt90.turret.lifting_eye",
    name_cn: "吊装耳",
    name_en: "lifting eye",
    assembly: "turret",
    build_layer: 4,
    build_order: 518,
    geometry: MERGE(B(0.16, 0.03, 0.06, [0, 0, 0], 0.006), B(0.05, 0.1, 0.05, [0, -0.05, 0], 0.004)),
    material: "mbt_steel",
    instances: 4,
    indexed: true,
    instance_layout: "mbt90.lifting_eye",
    instance_nodes: Array.from({ length: 4 }, () => "Turret"),
    mate: { type: "absolute" },
    source: "炮塔四角吊装耳 4 只。",
  });
  add({
    id: "mbt90.turret.muzzle_flash",
    name_cn: "炮口焰（特效）",
    name_en: "muzzle flash",
    assembly: "turret",
    build_layer: 5,
    build_order: 600,
    geometry: MERGE(
      { type: "sphere", r: 0.32, segments: 16 },
      { type: "sphere", r: 0.18, segments: 12, at: [0, 0, 0.4] },
    ),
    material: "mbt_flash",
    mate: abs([0, MBT.GUN_Y, MBT.GUN_ROOT_Z + MBT.BARREL_LEN + 0.15]),
    node: "GunRecoil",
    tags: ["fx"],
    source: "炮口焰特效件（构建时隐藏，击发瞬间显示）。",
  });

  // ========================= L5 反应装甲 / 烟幕 =========================
  add({
    id: "mbt90.armor.era_glacis",
    name_cn: "首上反应装甲",
    name_en: "glacis ERA",
    assembly: "armor",
    build_layer: 5,
    build_order: 601,
    geometry: { type: "kit", kit: "eraBlock", params: { w: 0.46, h: 0.26, d: 0.13 } },
    material: "mbt_era",
    instances: 8,
    indexed: true,
    instance_layout: "mbt90.era_glacis",
    mate: { type: "absolute" },
    source: "首上反应装甲 2×5 块（460×260×130），贴合首上倾角（33°）安装，块间 60mm 缝。",
  });
  add({
    id: "mbt90.armor.era_turret",
    name_cn: "炮塔反应装甲",
    name_en: "turret ERA",
    assembly: "armor",
    build_layer: 5,
    build_order: 602,
    geometry: { type: "kit", kit: "eraBlock", params: { w: 0.34, h: 0.24, d: 0.14 } },
    material: "mbt_era",
    instances: 12,
    indexed: true,
    instance_layout: "mbt90.era_turret",
    instance_nodes: Array.from({ length: 12 }, () => "Turret"),
    mate: { type: "absolute" },
    source: "炮塔前斜板反应装甲 2×6 块（400×260×140），随斜板 ±24° 朝向。",
  });
  add({
    id: "mbt90.armor.era_skirt",
    name_cn: "侧裙反应装甲",
    name_en: "skirt ERA",
    assembly: "armor",
    build_layer: 5,
    build_order: 603,
    geometry: { type: "kit", kit: "eraBlock", params: { w: 0.62, h: 0.5, d: 0.12 } },
    material: "mbt_era",
    instances: 12,
    indexed: true,
    instance_layout: "mbt90.era_skirt",
    mate: { type: "absolute" },
    source: "侧裙反应装甲 2×6 块（620×500×120），法线朝外（±X），覆盖行走装置上半。",
  });
  add({
    id: "mbt90.armor.smoke_launcher",
    name_cn: "烟幕发射器",
    name_en: "smoke grenade launcher",
    assembly: "armor",
    build_layer: 5,
    build_order: 604,
    geometry: { type: "kit", kit: "smokeCluster", params: { r: 0.038, len: 0.24 } },
    material: "mbt_steel",
    instances: 2,
    indexed: true,
    instance_layout: "mbt90.smoke_launcher",
    instance_nodes: Array.from({ length: 2 }, () => "Turret"),
    mate: { type: "absolute" },
    source: "炮塔两舷烟幕发射器（每侧 4 管 ⌀76×240，前倾 32° 外张）。",
  });
  add({
    id: "mbt90.armor.cip_panel",
    name_cn: "识别板",
    name_en: "CIP panel",
    assembly: "armor",
    build_layer: 5,
    build_order: 605,
    geometry: B(0.34, 0.34, 0.02, [0, 0, 0], 0.004),
    material: "mbt_canvas",
    dual: true,
    mate: abs([1.28, 2.05, 0.6], [0, 90, 0]),
    node: "Turret",
    source: "炮塔两侧战斗识别板（340×340 帆布面）。",
  });
  add({
    id: "mbt90.armor.tool_box",
    name_cn: "车外工具箱",
    name_en: "external tool box",
    assembly: "armor",
    build_layer: 5,
    build_order: 606,
    geometry: MERGE(B(0.7, 0.3, 0.36, [0, 0, 0], 0.01), B(0.72, 0.03, 0.38, [0, 0.17, 0], 0.005)),
    material: "mbt_green",
    mate: abs([0.85, 1.91, -2.85]),
    source: "侧裙后段外挂工具箱（700×300×360）。",
  });

  return parts;
}

export function makeMbtRegistry(): ModelRegistry {
  return {
    model: "mbt90",
    title: "MBT-90 主战坦克（虚构）",
    subtitle: "楔形装甲 / 反应装甲 / 7 对负重轮 · 从头建模",
    source_notes: [
      "虚构型号（MBT-90），按 2020 年代主战坦克通行布局从头建模：车头 +Z、车体宽 3.7、7 对负重轮、楔形炮塔、120mm 滑膛炮。",
      "设计口径（本模型）：首上倾角 33°（与水平）、炮塔前斜板 ±24° + 后倾 8°、反应装甲首上 2×5 / 炮塔 2×6 / 侧裙 2×6、炮塔座圈 ⌀2200。",
      "与虎式的区别：无垂直首上/垂直侧甲，动力包横置后部，炮塔尾篮与车长独立热像仪，履带为双销耳挂胶板。",
    ].join("\n"),
    constants: MBT,
    assemblies: [
      { id: "powerpack", name_cn: "动力包", name_en: "powerpack", explode: [0, 0.6, 0] },
      { id: "running", name_cn: "行走装置", name_en: "running gear", explode: [1.4, 0, 0] },
      { id: "hull", name_cn: "车体", name_en: "hull", explode: [0, 0, -0.6] },
      { id: "turret", name_cn: "炮塔与武器", name_en: "turret", explode: [0, 2.2, 0] },
      { id: "armor", name_cn: "反应装甲与附件", name_en: "armor & details", explode: [0, 1.2, 0.6] },
    ],
    nodes: [
      {
        name: "Turret",
        parent: "root",
        pivot: [0, 0, 0],
        motion: "rotate",
        axis: "y",
        note: "炮塔回转（绕座圈中心）",
      },
      {
        name: "Gun",
        parent: "Turret",
        pivot: [0, 0, 0],
        motion: "rotate",
        axis: "x",
        note: "火炮俯仰（耳轴）",
      },
      {
        name: "GunRecoil",
        parent: "Gun",
        pivot: [0, 0, 0],
        motion: "translate",
        axis: "z",
        note: "炮身后坐（-Z）",
      },
    ],
    materials: {
      mbt_green: { base: "#4b5642", metalness: 0.08, roughness: 0.8 },
      mbt_era: { base: "#55603f", metalness: 0.06, roughness: 0.86 },
      mbt_steel: { base: "#3c403a", metalness: 0.4, roughness: 0.58, preset: "steel" },
      mbt_track: { base: "#2f332f", metalness: 0.45, roughness: 0.66, preset: "steel" },
      mbt_rubber: { base: "#1b1c1a", metalness: 0.0, roughness: 0.95 },
      mbt_glass: { base: "#223336", metalness: 0.35, roughness: 0.12 },
      mbt_canvas: { base: "#4d4d3c", metalness: 0.0, roughness: 0.92 },
      mbt_lamp: { base: "#c9d6cc", metalness: 0.2, roughness: 0.25 },
      mbt_exhaust: { base: "#3a322b", metalness: 0.5, roughness: 0.75 },
      mbt_flash: { base: "#ffd58a", metalness: 0.0, roughness: 0.4, emissive: "#ffb347" },
    },
    expectedContacts: [
      {
        family: "deck-mount",
        a: "mbt90.hull.deck",
        b: "mbt90.hull.grille",
        reason: "动力舱格栅嵌进甲板开口（格栅框坐在开口台阶上）",
        maxDepthMm: 30,
      },
      {
        family: "deck-mount",
        a: "mbt90.hull.deck",
        b: "mbt90.hull.fuel_cap",
        reason: "油箱加注口坐在甲板座圈里（法兰压住开口边）",
        maxDepthMm: 30,
      },
      {
        family: "deck-mount",
        a: "mbt90.hull.deck",
        b: "mbt90.armor.tool_box",
        reason: "工具箱坐在动力舱甲板上（底座与甲板面贴合）",
        maxDepthMm: 30,
      },
      {
        family: "hull-nose-joint",
        a: "mbt90.hull.floor",
        b: "mbt90.hull.lower_front",
        reason: "首下与底板焊接接头（两块板相交焊成整体）",
        maxDepthMm: 60,
      },
      {
        family: "hull-nose-joint",
        a: "mbt90.hull.lower_front",
        b: "mbt90.hull.tow_hook",
        reason: "拖钩座焊在首下装甲外面（焊缝区重叠）",
        maxDepthMm: 55,
      },
      {
        family: "turret-mount",
        a: "mbt90.turret.side",
        b: "mbt90.armor.smoke_launcher",
        reason: "烟幕发射器底座用螺栓压在炮塔侧板外面（安装面贴合）",
        maxDepthMm: 45,
      },
      {
        family: "turret-mount",
        a: "mbt90.turret.roof",
        b: "mbt90.turret.loader_hatch",
        reason: "装填手舱盖座圈嵌进顶盖开口（座圈压住开口边）",
        maxDepthMm: 30,
      },
      {
        family: "turret-mount",
        a: "mbt90.turret.roof",
        b: "mbt90.turret.gunner_sight",
        reason: "炮长瞄具座嵌进顶盖开口（安装座压住开口边）",
        maxDepthMm: 30,
      },
      {
        family: "suspension-root",
        a: "mbt90.running.torsion_arm",
        b: "mbt90.hull.floor",
        reason: "摆臂根部穿过底板上的扭杆孔（轴颈在孔里）",
        maxDepthMm: 35,
      },
      {
        family: "ring-on-deck",
        a: "mbt90.turret.floor",
        b: "mbt90.hull.deck",
        reason: "炮塔座圈坐在车体动力舱甲板/座圈支承面上（装配承载面）",
        maxDepthMm: 45,
      },
      {
        family: "track-on-wheel",
        a: "mbt90.running.track",
        b: "mbt90.running.road_wheel",
        reason: "履带板压在负重轮胶胎上（履带环包住轮缘，啮合接触）",
        maxDepthMm: 30,
      },
      {
        family: "track-on-sprocket",
        a: "mbt90.running.track",
        b: "mbt90.running.sprocket",
        reason: "履带销耳卡在主动轮齿槽里（12 齿啮合）",
        maxDepthMm: 30,
      },
      {
        family: "track-on-idler",
        a: "mbt90.running.track",
        b: "mbt90.running.idler",
        reason: "履带包在诱导轮外缘（导向接触）",
        maxDepthMm: 30,
      },
    ],
    parts: buildMbtParts(),
  };
}
