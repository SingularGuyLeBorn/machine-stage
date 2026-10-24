import * as THREE from "three";
import type { AssembledModel, PartHandle } from "@/three/parts";
import { CAT_TRACKS, CV, carrierJbdOffset, catPoint, deckTopAt } from "@/three/parts/models/carrier/constants";
import { deckPlan, hullSurfaceHalfAt } from "@/three/parts/models/carrier/kits";
import {
  BARRIER_CONTROL_POS,
  BARRIER_NET_CENTER_X,
  BARRIER_NET_HALF,
  BARRIER_NET_YAW,
  BARRIER_NET_Z,
} from "@/three/parts/models/carrier/flightdeck";
import {
  HANGAR_CREW_DOOR_NODE,
  HANGAR_CREW_DOOR_POS,
  HANGAR_DOOR_NODES,
  HANGAR_ENGINE_DOOR_NODE,
  HANGAR_ENGINE_DOOR_POS,
} from "@/three/parts/models/carrier/hangar";
import {
  LANDING_RUNWAY_POLYGON,
  TAKEOFF_RUNWAY_POLYGON,
} from "@/three/parts/models/carrier/runwayPlan";

// ============================================================================
// app/three/walk —— 第一人称自由行走配置（编辑尺度 1:8，运行时装换成米）
//
// 区域（area）是可站立的空间；交互（interaction）按 F 触发：
//   portal   传送到另一区域（可同时把一扇门节点打开）
//   doors    机库防火门开合
//   barrier  应急拦阻网升降
//   jbd      挡焰板竖起/放平
//   mount    爬上停放舰载机 / 跳下
// 所有数值都在模型编辑坐标里（presentationScale=7.9 由控制器统一乘）。
// ============================================================================

export type WalkInteractionKind = "portal" | "doors" | "barrier" | "jbd" | "mount" | "dismount";

export interface WalkArea {
  id: string;
  label: string;
  floor: number | ((x: number, z: number) => number);
  /** 飞行甲板用真实 36 点轮廓。 */
  polygon?: Array<[number, number]>;
  /** 室内矩形边界 [minX, maxX, minZ, maxZ]。 */
  rect?: [number, number, number, number];
  /** 船体收窄区：按 z 进一步限制 |x|。 */
  halfWidth?: (z: number) => number;
  /** 站在实体顶部的小区域（如机翼上）：边界即全部碰撞，不再扫 AABB。 */
  obstacleFree?: boolean;
  /** 大甲板区域：保留舰岛/武器等大件 AABB 作为障碍（室内默认剔除合并围壁）。 */
  largeObstacles?: boolean;
  /** 该区域的眼高（默认用模型的 eyeHeight）；坐姿舱室/车长塔用更低的眼高。 */
  eyeHeight?: number;
  /** 小地图上的额外结构：舰岛/跑道/升降机/炮塔等。 */
  mapFeatures?: WalkMapFeature[];
  spawn: { pos: [number, number, number]; yaw: number; pitch?: number };
}

export interface WalkInteraction {
  id: string;
  area: string;
  kind: WalkInteractionKind;
  pos: [number, number];
  radius: number;
  label: string;
  activeLabel?: string;
  targetArea?: string;
  targetPos?: [number, number, number];
  targetYaw?: number;
  doorNode?: string;
  doorIndex?: number;
  jbdIndex?: number;
}

export interface WalkMapFeature {
  kind: "structure" | "runway" | "zone" | "line" | "label";
  /** x-z 平面折线；或 rect：[minX, minZ, maxX, maxZ]。 */
  points?: Array<[number, number]>;
  rect?: [number, number, number, number];
  label?: string;
  at?: [number, number];
}

export interface WalkConfig {
  label: string;
  spawnArea: string;
  eyeHeight: number;
  areas: Record<string, WalkArea>;
  interactions: WalkInteraction[];
}

const DECK_POLYGON = deckPlan();
const DECK_MARGIN = 0.12;
const HANGAR_HALF = (z: number) => Math.max(0.9, hullSurfaceHalfAt(z, 3.2) - 0.34);

const deckFloor = (_x: number, z: number) => deckTopAt(z) + 0.018;

function insidePolygon(x: number, z: number, polygon: Array<[number, number]>): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, zi] = polygon[i]!;
    const [xj, zj] = polygon[j]!;
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

function distanceToPolygon(x: number, z: number, polygon: Array<[number, number]>): number {
  let best = Infinity;
  for (let i = 0; i < polygon.length; i++) {
    const [ax, az] = polygon[i]!;
    const [bx, bz] = polygon[(i + 1) % polygon.length]!;
    const dx = bx - ax;
    const dz = bz - az;
    const len2 = dx * dx + dz * dz;
    const t = len2 > 1e-9 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2)) : 0;
    best = Math.min(best, Math.hypot(x - (ax + dx * t), z - (az + dz * t)));
  }
  return best;
}

/** 甲板可行走判定：轮廓内且离舷缘至少 margin。 */
export function insideDeck(x: number, z: number, margin = DECK_MARGIN): boolean {
  if (!insidePolygon(x, z, DECK_POLYGON)) return false;
  return distanceToPolygon(x, z, DECK_POLYGON) >= margin;
}

const BARRIER_MAP_RAD = (BARRIER_NET_YAW * Math.PI) / 180;
const BARRIER_MAP_HX = Math.cos(BARRIER_MAP_RAD) * BARRIER_NET_HALF;
const BARRIER_MAP_HZ = -Math.sin(BARRIER_MAP_RAD) * BARRIER_NET_HALF;

const CARRIER_DECK_MAP: WalkMapFeature[] = [
  {
    kind: "structure",
    rect: [
      CV.ISLAND_X - CV.ISLAND_W / 2,
      CV.ISLAND_Z - CV.ISLAND_L / 2,
      CV.ISLAND_X + CV.ISLAND_W / 2,
      CV.ISLAND_Z + CV.ISLAND_L / 2,
    ],
    label: "舰岛",
  },
  { kind: "runway", points: LANDING_RUNWAY_POLYGON, label: "着舰" },
  { kind: "runway", points: TAKEOFF_RUNWAY_POLYGON, label: "起飞" },
  ...CV.ELEVATOR_Z.map((z, index): WalkMapFeature => ({
    kind: "zone",
    rect: [
      CV.ELEVATOR_X - CV.ELEVATOR_W / 2,
      z - CV.ELEVATOR_L / 2,
      CV.ELEVATOR_X + CV.ELEVATOR_W / 2,
      z + CV.ELEVATOR_L / 2,
    ],
    label: `升${index + 1}`,
  })),
  { kind: "zone", rect: [1.17, -5.72, 2.33, -4.28], label: "弹药升降" },
  {
    kind: "line",
    points: [
      [BARRIER_NET_CENTER_X - BARRIER_MAP_HX, BARRIER_NET_Z - BARRIER_MAP_HZ],
      [BARRIER_NET_CENTER_X + BARRIER_MAP_HX, BARRIER_NET_Z + BARRIER_MAP_HZ],
    ],
    label: "拦阻网",
  },
  { kind: "label", at: [0.5, 19.4], label: "艏" },
];

const DDG_DECK_MAP: WalkMapFeature[] = [
  { kind: "structure", rect: [-6.8, 5, 6.8, 39], label: "舰岛" },
  { kind: "structure", rect: [-6.3, -72, 6.3, -54], label: "机库" },
  { kind: "structure", rect: [-5.5, -22, 5.5, -4], label: "烟囱" },
  { kind: "zone", rect: [-4.1, 20, 4.1, 52], label: "VLS" },
  { kind: "label", at: [0, 78], label: "艏" },
  { kind: "label", at: [0, -85], label: "艉" },
];

const TIGER_MAP: WalkMapFeature[] = [
  { kind: "structure", rect: [-6.44, -1.91, 1.29, 1.91], label: "车体" },
  { kind: "structure", rect: [-2.2, -0.65, -1.1, 0.65], label: "炮塔" },
  { kind: "label", at: [-5.6, 0], label: "车头" },
];

const MBT_MAP: WalkMapFeature[] = [
  { kind: "structure", rect: [-1.33, -4.03, 1.33, 7.24], label: "车体" },
  { kind: "structure", rect: [-1.3, -1.48, 1.3, 1.52], label: "炮塔" },
  { kind: "label", at: [0, 7.8], label: "车头" },
];

const CARRIER_WALK: WalkConfig = {
  label: "福建舰 · 第一人称漫游",
  spawnArea: "deck",
  eyeHeight: 0.215,
  areas: {
    deck: {
      id: "deck",
      label: "飞行甲板",
      floor: deckFloor,
      polygon: DECK_POLYGON,
      mapFeatures: CARRIER_DECK_MAP,
      spawn: { pos: [1.6, deckFloor(0, -1.0), -1.0], yaw: Math.PI },
    },
    hangar: {
      id: "hangar",
      label: "机库",
      floor: 2.8,
      rect: [-2.7, 2.7, -17.0, 13.0],
      halfWidth: HANGAR_HALF,
      spawn: { pos: [1.6, 2.8, -9.0], yaw: Math.PI },
    },
    magazine: {
      id: "magazine",
      label: "弹药库",
      floor: 1.35,
      rect: [-2.55, 2.55, -7.55, -1.2],
      spawn: { pos: [-1.6, 1.35, -1.7], yaw: 0 },
    },
    engine_room: {
      id: "engine_room",
      label: "机舱",
      floor: 1.27,
      rect: [-2.05, 2.05, -18.2, -13.7],
      spawn: { pos: [0, 1.27, -16.5], yaw: 0 },
    },
    reactor_room: {
      id: "reactor_room",
      label: "反应堆舱",
      floor: 1.35,
      // 屏蔽层从 z≈-13 一直占满到 -9.1，站在它的前方观察窗平台（控制台后方）。
      rect: [-2.0, 2.0, -9.0, -8.25],
      spawn: { pos: [0, 1.35, -8.6], yaw: 0 },
    },
    bridge: {
      id: "bridge",
      label: "航海舰桥",
      floor: 5.85,
      rect: [2.42, 3.88, -7.7, -2.4],
      spawn: { pos: [3.15, 5.85, -3.9], yaw: Math.PI },
    },
    cic: {
      id: "cic",
      label: "战斗情报中心",
      floor: 5.09,
      rect: [2.42, 3.88, -7.82, -2.58],
      spawn: { pos: [3.15, 5.09, -7.2], yaw: Math.PI },
    },
    crew: {
      id: "crew",
      label: "生活区走廊",
      floor: 1.35,
      rect: [-0.045, 0.045, 4.25, 11.7],
      spawn: { pos: [0, 1.35, 11.25], yaw: 0 },
    },
    crew_berth: {
      id: "crew_berth",
      label: "水兵住舱",
      floor: 1.35,
      rect: [-0.86, -0.14, 4.35, 5.85],
      spawn: { pos: [-0.5, 1.35, 5.1], yaw: Math.PI },
    },
    crew_mess: {
      id: "crew_mess",
      label: "餐厅/厨房",
      floor: 1.35,
      rect: [0.14, 0.86, 4.35, 5.85],
      spawn: { pos: [0.45, 1.35, 5.05], yaw: Math.PI },
    },
    workshop: {
      id: "workshop",
      label: "维修车间",
      floor: 2.8,
      rect: [-2.22, -1.62, -9.7, -6.8],
      spawn: { pos: [-1.94, 2.8, -9.1], yaw: Math.PI },
    },
    aircraft1: {
      id: "aircraft1",
      label: "停放舰载机",
      floor: 4.92,
      rect: [2.7, 2.95, -10.6, -10.0],
      obstacleFree: true,
      spawn: { pos: [2.82, 4.92, -10.3], yaw: Math.PI },
    },
  },
  interactions: [
    // ---- 飞行甲板 ----
    {
      id: "deck_elevator_hangar",
      area: "deck",
      kind: "portal",
      pos: [3.42, 2.0],
      radius: 1.15,
      label: "乘升降机下机库",
      targetArea: "hangar",
      targetPos: [1.6, 2.8, -9.0],
      targetYaw: Math.PI,
    },
    {
      id: "deck_ordnance_magazine",
      area: "deck",
      kind: "portal",
      pos: [1.75, -5.0],
      radius: 1.0,
      label: "乘弹药升降机下弹药库",
      targetArea: "magazine",
      targetPos: [-1.6, 1.35, -1.7],
      targetYaw: 0,
    },
    {
      id: "deck_island_bridge",
      area: "deck",
      kind: "portal",
      pos: [3.15, -1.45],
      radius: 1.0,
      label: "进入舰岛 · 航海舰桥",
      targetArea: "bridge",
      targetPos: [3.15, 5.85, -3.9],
      targetYaw: Math.PI,
    },
    {
      id: "deck_aircraft_mount",
      area: "deck",
      kind: "mount",
      pos: [3.2, -10.2],
      radius: 1.6,
      label: "爬上停放舰载机",
      targetArea: "aircraft1",
      targetPos: [2.82, 4.92, -10.3],
      targetYaw: Math.PI,
    },
    {
      id: "deck_barrier",
      area: "deck",
      kind: "barrier",
      pos: [BARRIER_CONTROL_POS[0], BARRIER_CONTROL_POS[1]],
      radius: 0.95,
      label: "升起应急拦阻网",
      activeLabel: "放下应急拦阻网",
    },
    ...[1, 2, 3].map((id) => {
      const track = CAT_TRACKS.find((item) => item.id === id)!;
      const point = catPoint(track, carrierJbdOffset(id));
      return {
        id: `deck_jbd_${id}`,
        area: "deck",
        kind: "jbd" as const,
        pos: [point.x + 0.55, point.z] as [number, number],
        radius: 0.95,
        label: `升起 ${id} 号挡焰板`,
        activeLabel: `放下 ${id} 号挡焰板`,
        jbdIndex: id,
      };
    }),
    // ---- 机库 ----
    ...HANGAR_DOOR_NODES.map((_, index) => ({
      id: `hangar_door_${index + 1}`,
      area: "hangar",
      kind: "doors" as const,
      pos: [0, [-2.5, 0.5, 4.5, 7.5, 10.5][index]!] as [number, number],
      radius: 1.15,
      label: `打开 ${index + 1} 号防火门`,
      activeLabel: `关闭 ${index + 1} 号防火门`,
      doorIndex: index + 1,
    })),
    {
      id: "hangar_elevator_deck",
      area: "hangar",
      kind: "portal",
      pos: [2.25, 2.0],
      radius: 1.1,
      label: "乘升降机回飞行甲板",
      targetArea: "deck",
      targetPos: [2.7, deckFloor(0, 2.0), 2.0],
      targetYaw: Math.PI,
    },
    {
      id: "hangar_magazine",
      area: "hangar",
      kind: "portal",
      pos: [-1.0, -5.0],
      radius: 1.15,
      label: "沿弹药提升井下弹药库",
      targetArea: "magazine",
      targetPos: [-1.6, 1.35, -6.3],
      targetYaw: Math.PI,
    },
    {
      id: "hangar_workshop",
      area: "hangar",
      kind: "portal",
      pos: [-1.85, -9.7],
      radius: 0.85,
      label: "进入维修车间",
      targetArea: "workshop",
      targetPos: [-1.94, 2.8, -9.1],
      targetYaw: Math.PI,
    },
    {
      id: "hangar_engine_door",
      area: "hangar",
      kind: "portal",
      pos: HANGAR_ENGINE_DOOR_POS,
      radius: 1.2,
      label: "打开机舱水密门 · 下机舱",
      targetArea: "engine_room",
      targetPos: [0, 1.27, -16.5],
      targetYaw: 0,
      doorNode: HANGAR_ENGINE_DOOR_NODE,
    },
    {
      id: "hangar_crew_door",
      area: "hangar",
      kind: "portal",
      pos: HANGAR_CREW_DOOR_POS,
      radius: 1.15,
      label: "打开生活区水密门 · 下生活区",
      targetArea: "crew",
      targetPos: [0, 1.35, 11.25],
      targetYaw: 0,
      doorNode: HANGAR_CREW_DOOR_NODE,
    },
    // ---- 弹药库 ----
    {
      id: "magazine_deck",
      area: "magazine",
      kind: "portal",
      pos: [-1.6, -1.6],
      radius: 0.8,
      label: "乘弹药升降机上飞行甲板",
      targetArea: "deck",
      targetPos: [1.75, deckFloor(0, -5.0), -5.0],
      targetYaw: 0,
    },
    {
      id: "magazine_hangar",
      area: "magazine",
      kind: "portal",
      pos: [-1.6, -7.0],
      radius: 0.85,
      label: "沿弹药提升井上机库",
      targetArea: "hangar",
      targetPos: [-1.0, 2.8, -5.0],
      targetYaw: Math.PI,
    },
    // ---- 机舱 / 反应堆舱 ----
    {
      id: "engine_hangar",
      area: "engine_room",
      kind: "portal",
      pos: [1.2, -13.85],
      radius: 0.95,
      label: "返回机库",
      targetArea: "hangar",
      targetPos: [0.55, 2.8, -15.6],
      targetYaw: Math.PI,
    },
    {
      id: "engine_reactor",
      area: "engine_room",
      kind: "portal",
      pos: [-0.85, -13.85],
      radius: 0.95,
      label: "打开水密门 · 进入反应堆舱",
      targetArea: "reactor_room",
      targetPos: [0, 1.35, -8.6],
      targetYaw: 0,
    },
    {
      id: "reactor_engine",
      area: "reactor_room",
      kind: "portal",
      pos: [0, -8.5],
      radius: 0.9,
      label: "返回机舱",
      targetArea: "engine_room",
      targetPos: [0, 1.27, -16.5],
      targetYaw: 0,
    },
    // ---- 舰桥 / CIC ----
    {
      id: "bridge_cic",
      area: "bridge",
      kind: "portal",
      pos: [3.43, -7.55],
      radius: 0.8,
      label: "打开水密门 · 进入 CIC",
      targetArea: "cic",
      targetPos: [3.15, 5.09, -7.2],
      targetYaw: Math.PI,
    },
    {
      id: "bridge_deck",
      area: "bridge",
      kind: "portal",
      pos: [2.55, -7.5],
      radius: 0.7,
      label: "沿舰岛梯道下飞行甲板",
      targetArea: "deck",
      targetPos: [2.4, deckFloor(0, -1.4), -1.4],
      targetYaw: Math.PI,
    },
    {
      id: "cic_bridge",
      area: "cic",
      kind: "portal",
      pos: [3.45, -7.55],
      radius: 0.8,
      label: "返回航海舰桥",
      targetArea: "bridge",
      targetPos: [3.15, 5.85, -3.9],
      targetYaw: Math.PI,
    },
    {
      id: "cic_deck",
      area: "cic",
      kind: "portal",
      pos: [2.55, -7.5],
      radius: 0.7,
      label: "沿舰岛梯道下飞行甲板",
      targetArea: "deck",
      targetPos: [2.4, deckFloor(0, -1.4), -1.4],
      targetYaw: Math.PI,
    },
    // ---- 生活区 ----
    {
      id: "crew_berth",
      area: "crew",
      kind: "portal",
      pos: [-0.09, 5.05],
      radius: 0.36,
      label: "进入水兵住舱",
      targetArea: "crew_berth",
      targetPos: [-0.5, 1.35, 5.1],
      targetYaw: Math.PI,
    },
    {
      id: "crew_mess",
      area: "crew",
      kind: "portal",
      pos: [0.09, 5.0],
      radius: 0.36,
      label: "进入餐厅/厨房",
      targetArea: "crew_mess",
      targetPos: [0.45, 1.35, 5.05],
      targetYaw: Math.PI,
    },
    {
      id: "crew_hangar",
      area: "crew",
      kind: "portal",
      pos: [0, 11.55],
      radius: 0.65,
      label: "上梯口回机库",
      targetArea: "hangar",
      targetPos: [0.35, 2.8, 12.0],
      targetYaw: Math.PI,
    },
    {
      id: "crew_berth_back",
      area: "crew_berth",
      kind: "portal",
      pos: [-0.5, 4.55],
      radius: 0.6,
      label: "回到生活区走廊",
      targetArea: "crew",
      targetPos: [0, 1.35, 5.2],
      targetYaw: 0,
    },
    {
      id: "crew_mess_back",
      area: "crew_mess",
      kind: "portal",
      pos: [0.5, 4.55],
      radius: 0.6,
      label: "回到生活区走廊",
      targetArea: "crew",
      targetPos: [0, 1.35, 5.2],
      targetYaw: 0,
    },
    // ---- 维修车间 ----
    {
      id: "workshop_back",
      area: "workshop",
      kind: "portal",
      pos: [-1.94, -7.0],
      radius: 0.8,
      label: "返回机库",
      targetArea: "hangar",
      targetPos: [-1.7, 2.8, -9.7],
      targetYaw: 0,
    },
    // ---- 停放舰载机 ----
    {
      id: "aircraft_dismount",
      area: "aircraft1",
      kind: "dismount",
      pos: [3.2, -10.2],
      radius: 1.8,
      label: "跳下飞机",
      targetArea: "deck",
      targetPos: [2.55, deckFloor(0, -9.1), -9.1],
      targetYaw: Math.PI,
    },
  ],
};

export interface WalkLightSpec {
  pos: [number, number, number];
  intensity: number;
  distance: number;
  color?: string;
}

/** 室内漫游补光：按舱室沿长轴布灯，避免只有手电照亮贴脸墙面、远端全黑。 */
export const CARRIER_WALK_LIGHTS: Record<string, WalkLightSpec[]> = {
  hangar: [
    { pos: [0, 4.3, -13], intensity: 2.4, distance: 90 },
    { pos: [0, 4.3, -3], intensity: 2.4, distance: 90 },
    { pos: [0, 4.3, 7], intensity: 2.4, distance: 90 },
    { pos: [0, 4.3, 12], intensity: 1.6, distance: 60 },
  ],
  magazine: [
    { pos: [-1.4, 2.1, -3], intensity: 1.8, distance: 40 },
    { pos: [-1.4, 2.1, -6], intensity: 1.8, distance: 40 },
    { pos: [0.8, 2.1, -4.5], intensity: 1.2, distance: 30 },
  ],
  engine_room: [
    { pos: [0, 2.35, -14.8], intensity: 2.0, distance: 40 },
    { pos: [0, 2.35, -17.2], intensity: 2.0, distance: 40 },
  ],
  reactor_room: [{ pos: [0, 2.2, -8.8], intensity: 1.6, distance: 22 }],
  bridge: [
    { pos: [3.15, 6.35, -3.4], intensity: 1.6, distance: 18 },
    { pos: [3.15, 6.35, -6.4], intensity: 1.4, distance: 18 },
  ],
  cic: [
    { pos: [3.15, 5.58, -3.4], intensity: 3.0, distance: 16 },
    { pos: [3.15, 5.58, -6.2], intensity: 2.6, distance: 16 },
  ],
  crew: [
    { pos: [0, 1.6, 6.0], intensity: 1.2, distance: 16 },
    { pos: [0, 1.6, 10.0], intensity: 1.2, distance: 16 },
  ],
  crew_berth: [{ pos: [-0.5, 1.6, 5.1], intensity: 0.9, distance: 10 }],
  crew_mess: [{ pos: [0.5, 1.6, 5.1], intensity: 0.9, distance: 10 }],
  workshop: [{ pos: [-1.94, 3.1, -8.2], intensity: 1.3, distance: 14 }],
};

// ----------------------------------------------------------------------------
// 055 型驱逐舰：全舰尺度为米（presentationScale=1），甲板面 y≈15.76。
// 舱室地板/眼点由现有第一人称锚点反推；入口用 F 门户，不做假门。
// ----------------------------------------------------------------------------

const TYPE055_WALK: WalkConfig = {
  label: "南昌舰 · 第一人称漫游",
  spawnArea: "deck",
  eyeHeight: 1.7,
  areas: {
    deck: {
      id: "deck",
      label: "飞行甲板/前甲板",
      floor: 15.76,
      rect: [-7.8, 7.8, -82, 74],
      largeObstacles: true,
      mapFeatures: DDG_DECK_MAP,
      spawn: { pos: [2.5, 15.76, 44], yaw: Math.PI },
    },
    bridge: {
      id: "bridge",
      label: "航海舰桥",
      floor: 21.68,
      rect: [-4.5, 4.5, 20, 32.5],
      spawn: { pos: [3.0, 21.68, 25.5], yaw: Math.PI },
    },
    cic: {
      id: "cic",
      label: "战斗情报中心",
      floor: 18.97,
      rect: [-4.9, 4.9, 9.5, 26.5],
      spawn: { pos: [3.8, 18.97, 13.5], yaw: Math.PI },
    },
    engine_room: {
      id: "engine_room",
      label: "机舱",
      floor: 4.3,
      rect: [-8, 8, -46, -23.6],
      spawn: { pos: [3, 4.3, -24.5], yaw: 0 },
    },
    hangar: {
      id: "hangar",
      label: "机库",
      floor: 14.28,
      rect: [-5, 5, -71, -55],
      spawn: { pos: [0, 14.28, -58], yaw: 0 },
    },
    crew: {
      id: "crew",
      label: "生活区走廊",
      floor: 2.56,
      rect: [-0.55, 0.55, -7.4, 7.4],
      spawn: { pos: [0, 2.56, 6.9], yaw: 0 },
    },
    crew_berth: {
      id: "crew_berth",
      label: "水兵住舱",
      floor: 2.56,
      rect: [-4.1, -1.0, -6.9, -2.9],
      spawn: { pos: [-2.55, 2.56, -4.85], yaw: Math.PI },
    },
    crew_mess: {
      id: "crew_mess",
      label: "餐厅/厨房",
      floor: 2.72,
      rect: [-0.5, 2.9, -6.2, -2.2],
      spawn: { pos: [1.2, 2.72, -4.2], yaw: Math.PI },
    },
    magazine: {
      id: "magazine",
      label: "130mm 弹药库",
      floor: 3.22,
      rect: [-2.1, 2.1, 60.2, 67.8],
      spawn: { pos: [0, 3.22, 60.8], yaw: Math.PI },
    },
    workshop: {
      id: "workshop",
      label: "维修车间",
      floor: 5.24,
      rect: [5.2, 8.8, -33, -27],
      spawn: { pos: [7, 5.24, -28], yaw: 0 },
    },
    z20: {
      id: "z20",
      label: "直-20 机顶",
      floor: 16.72,
      rect: [2.0, 4.0, -66, -63],
      obstacleFree: true,
      spawn: { pos: [3, 16.72, -64.5], yaw: 0 },
    },
  },
  interactions: [
    // ---- 前甲板 ----
    { id: "ddg_deck_bridge", area: "deck", kind: "portal", pos: [2.5, 40.5], radius: 1.8, label: "进入航海舰桥", targetArea: "bridge", targetPos: [3.0, 21.68, 25.5], targetYaw: Math.PI },
    { id: "ddg_deck_cic", area: "deck", kind: "portal", pos: [4.8, 40.5], radius: 1.4, label: "进入战斗情报中心", targetArea: "cic", targetPos: [3.8, 18.97, 13.5], targetYaw: Math.PI },
    { id: "ddg_deck_magazine", area: "deck", kind: "portal", pos: [5, 56], radius: 1.5, label: "下 130mm 弹药库", targetArea: "magazine", targetPos: [0, 3.22, 60.8], targetYaw: Math.PI },
    { id: "ddg_deck_crew", area: "deck", kind: "portal", pos: [0, -25], radius: 1.6, label: "下生活区", targetArea: "crew", targetPos: [0, 2.56, 6.9], targetYaw: 0 },
    { id: "ddg_deck_engine", area: "deck", kind: "portal", pos: [6.2, -30], radius: 1.6, label: "下机舱", targetArea: "engine_room", targetPos: [3, 4.3, -24.5], targetYaw: 0 },
    { id: "ddg_deck_workshop", area: "deck", kind: "portal", pos: [6.2, -26], radius: 1.5, label: "下维修车间", targetArea: "workshop", targetPos: [7, 5.24, -28], targetYaw: 0 },
    { id: "ddg_deck_hangar", area: "deck", kind: "portal", pos: [0, -75], radius: 2.0, label: "下机库", targetArea: "hangar", targetPos: [0, 14.28, -58], targetYaw: 0 },
    // ---- 舰桥 / CIC ----
    { id: "ddg_bridge_cic", area: "bridge", kind: "portal", pos: [2.8, 20.6], radius: 1.0, label: "进入战斗情报中心", targetArea: "cic", targetPos: [3.8, 18.97, 13.5], targetYaw: Math.PI },
    { id: "ddg_bridge_deck", area: "bridge", kind: "portal", pos: [-2.8, 20.6], radius: 1.0, label: "回前甲板", targetArea: "deck", targetPos: [2.5, 15.76, 40.5], targetYaw: Math.PI },
    { id: "ddg_cic_bridge", area: "cic", kind: "portal", pos: [2.8, 10.2], radius: 1.0, label: "回航海舰桥", targetArea: "bridge", targetPos: [3.0, 21.68, 25.5], targetYaw: Math.PI },
    { id: "ddg_cic_deck", area: "cic", kind: "portal", pos: [-2.8, 10.2], radius: 1.0, label: "回前甲板", targetArea: "deck", targetPos: [4.8, 15.76, 40.5], targetYaw: Math.PI },
    // ---- 机舱 / 机库 ----
    { id: "ddg_engine_deck", area: "engine_room", kind: "portal", pos: [0, -24.2], radius: 1.6, label: "回前甲板", targetArea: "deck", targetPos: [6.2, 15.76, -30], targetYaw: Math.PI },
    { id: "ddg_hangar_deck", area: "hangar", kind: "portal", pos: [0, -56], radius: 1.8, label: "回飞行甲板", targetArea: "deck", targetPos: [0, 15.76, -68], targetYaw: Math.PI },
    { id: "ddg_hangar_z20", area: "hangar", kind: "mount", pos: [3, -64], radius: 1.8, label: "爬上直-20", targetArea: "z20", targetPos: [3, 16.72, -64.5], targetYaw: 0 },
    { id: "ddg_z20_dismount", area: "z20", kind: "dismount", pos: [3, -64.5], radius: 2.0, label: "跳下直-20", targetArea: "hangar", targetPos: [1.5, 14.28, -61], targetYaw: 0 },
    // ---- 生活区 ----
    { id: "ddg_crew_deck", area: "crew", kind: "portal", pos: [0, 7.2], radius: 0.9, label: "上飞行甲板", targetArea: "deck", targetPos: [0, 15.76, -25], targetYaw: Math.PI },
    { id: "ddg_crew_berth", area: "crew", kind: "portal", pos: [-0.55, -4.85], radius: 0.5, label: "进入水兵住舱", targetArea: "crew_berth", targetPos: [-2.55, 2.56, -4.85], targetYaw: Math.PI },
    { id: "ddg_crew_mess", area: "crew", kind: "portal", pos: [0.55, -4.2], radius: 0.5, label: "进入餐厅/厨房", targetArea: "crew_mess", targetPos: [1.2, 2.72, -4.2], targetYaw: Math.PI },
    { id: "ddg_berth_crew", area: "crew_berth", kind: "portal", pos: [-1.6, -4.85], radius: 1.2, label: "回生活区走廊", targetArea: "crew", targetPos: [0, 2.56, -3.5], targetYaw: Math.PI },
    { id: "ddg_mess_crew", area: "crew_mess", kind: "portal", pos: [0.6, -4.2], radius: 1.0, label: "回生活区走廊", targetArea: "crew", targetPos: [0, 2.56, -3.5], targetYaw: Math.PI },
    // ---- 弹药库 / 车间 ----
    { id: "ddg_magazine_deck", area: "magazine", kind: "portal", pos: [0, 60.5], radius: 1.2, label: "上飞行甲板", targetArea: "deck", targetPos: [5, 15.76, 56], targetYaw: Math.PI },
    { id: "ddg_workshop_deck", area: "workshop", kind: "portal", pos: [7, -27.4], radius: 1.2, label: "回前甲板", targetArea: "deck", targetPos: [6.2, 15.76, -26], targetYaw: Math.PI },
  ],
};

export const TYPE055_WALK_LIGHTS: Record<string, WalkLightSpec[]> = {
  bridge: [
    { pos: [0, 25.6, 23], intensity: 1.8, distance: 20 },
    { pos: [0, 25.6, 29], intensity: 1.8, distance: 20 },
  ],
  cic: [
    { pos: [0, 20.8, 14], intensity: 2.6, distance: 20 },
    { pos: [0, 20.8, 22], intensity: 2.3, distance: 20 },
  ],
  engine_room: [
    { pos: [0, 8.2, -26], intensity: 2.2, distance: 34 },
    { pos: [0, 8.2, -33], intensity: 2.2, distance: 34 },
    { pos: [0, 8.2, -41], intensity: 2.0, distance: 34 },
  ],
  hangar: [
    { pos: [0, 18.4, -58], intensity: 2.2, distance: 28 },
    { pos: [0, 18.4, -65], intensity: 2.2, distance: 28 },
    { pos: [0, 18.4, -69.5], intensity: 1.8, distance: 24 },
  ],
  crew: [
    { pos: [0, 4.8, 4], intensity: 1.4, distance: 14 },
    { pos: [0, 4.8, -2], intensity: 1.4, distance: 14 },
  ],
  crew_berth: [{ pos: [-2.55, 4.6, -4.9], intensity: 1.3, distance: 9 }],
  crew_mess: [{ pos: [1.2, 4.9, -4.2], intensity: 1.3, distance: 9 }],
  magazine: [
    { pos: [0, 5.8, 62], intensity: 1.8, distance: 10 },
    { pos: [0, 5.8, 66], intensity: 1.7, distance: 10 },
  ],
  workshop: [{ pos: [7, 7, -30], intensity: 1.7, distance: 14 }],
};

// ----------------------------------------------------------------------------
// 坦克：绕车行走 + 驾驶席 / 车长塔 / 车顶三个可进入位置。
// 虎式车体沿 x 轴（车头 -x），MBT/ED90 沿 z 轴；眼高按坐姿/站姿单独给。
// ----------------------------------------------------------------------------

const TIGER_WALK: WalkConfig = {
  label: "虎式坦克 · 第一人称漫游",
  spawnArea: "exterior",
  eyeHeight: 1.7,
  areas: {
    exterior: {
      id: "exterior",
      label: "车外",
      floor: -1.1,
      rect: [-8.2, 3.6, -4.6, 4.6],
      mapFeatures: TIGER_MAP,
      spawn: { pos: [0, -1.1, 4.0], yaw: 0 },
    },
    driver: {
      id: "driver",
      label: "驾驶席",
      floor: -0.3,
      eyeHeight: 1.18,
      rect: [-3.55, -3.0, -0.5, 0.5],
      obstacleFree: true,
      spawn: { pos: [-3.28, -0.3, 0], yaw: Math.PI / 2 },
    },
    commander: {
      id: "commander",
      label: "车长塔",
      floor: 1.84,
      eyeHeight: 0.46,
      rect: [-1.55, -1.05, -0.7, -0.15],
      obstacleFree: true,
      spawn: { pos: [-1.3, 1.84, -0.42], yaw: Math.PI / 2, pitch: -0.15 },
    },
    turret_top: {
      id: "turret_top",
      label: "炮塔顶部",
      floor: 1.84,
      eyeHeight: 1.5,
      rect: [-2.35, -0.9, -0.85, 0.85],
      obstacleFree: true,
      spawn: { pos: [-1.65, 1.84, 0], yaw: Math.PI / 2, pitch: -0.2 },
    },
  },
  interactions: [
    { id: "tiger_enter_driver", area: "exterior", kind: "portal", pos: [-3.3, 2.5], radius: 1.1, label: "进入驾驶席", targetArea: "driver", targetPos: [-3.28, -0.3, 0], targetYaw: Math.PI / 2 },
    { id: "tiger_enter_commander", area: "exterior", kind: "portal", pos: [-1.3, -2.5], radius: 1.1, label: "进入车长塔", targetArea: "commander", targetPos: [-1.3, 1.84, -0.42], targetYaw: Math.PI / 2 },
    { id: "tiger_enter_top", area: "exterior", kind: "mount", pos: [0.2, 2.5], radius: 1.1, label: "爬上车顶", targetArea: "turret_top", targetPos: [-1.65, 1.84, 0], targetYaw: Math.PI / 2 },
    { id: "tiger_exit_driver", area: "driver", kind: "dismount", pos: [-3.28, 0], radius: 1.2, label: "下车", targetArea: "exterior", targetPos: [-3.3, -1.1, 2.8], targetYaw: Math.PI },
    { id: "tiger_exit_commander", area: "commander", kind: "dismount", pos: [-1.3, -0.42], radius: 1.2, label: "下车", targetArea: "exterior", targetPos: [-1.3, -1.1, -2.8], targetYaw: 0 },
    { id: "tiger_exit_top", area: "turret_top", kind: "dismount", pos: [-1.65, 0], radius: 1.4, label: "跳下车", targetArea: "exterior", targetPos: [-1.65, -1.1, 2.8], targetYaw: Math.PI },
  ],
};

const MBT_WALK: WalkConfig = {
  label: "MBT-90 · 第一人称漫游",
  spawnArea: "exterior",
  eyeHeight: 1.7,
  areas: {
    exterior: {
      id: "exterior",
      label: "车外",
      floor: -0.34,
      rect: [-5.2, 5.2, -6.5, 9.8],
      mapFeatures: MBT_MAP,
      spawn: { pos: [4.5, -0.34, 3.0], yaw: Math.PI / 2 },
    },
    driver: {
      id: "driver",
      label: "驾驶席（舱口）",
      floor: 1.82,
      eyeHeight: 0.8,
      rect: [-1.0, -0.35, 1.55, 2.2],
      obstacleFree: true,
      spawn: { pos: [-0.68, 1.82, 1.86], yaw: Math.PI, pitch: -0.1 },
    },
    commander: {
      id: "commander",
      label: "车长塔（舱口）",
      floor: 2.79,
      eyeHeight: 0.7,
      rect: [0.25, 0.85, -0.45, 0.1],
      obstacleFree: true,
      spawn: { pos: [0.55, 2.79, -0.18], yaw: Math.PI, pitch: -0.1 },
    },
    turret_top: {
      id: "turret_top",
      label: "炮塔顶部",
      floor: 2.54,
      eyeHeight: 1.5,
      rect: [-1.15, 1.15, -1.35, 1.35],
      obstacleFree: true,
      spawn: { pos: [0, 2.54, 0.2], yaw: Math.PI, pitch: -0.25 },
    },
  },
  interactions: [
    { id: "mbt_enter_driver", area: "exterior", kind: "portal", pos: [-3.0, 2.25], radius: 1.2, label: "进入驾驶席", targetArea: "driver", targetPos: [-0.68, 1.82, 1.86], targetYaw: 0 },
    { id: "mbt_enter_commander", area: "exterior", kind: "portal", pos: [3.0, -0.27], radius: 1.2, label: "进入车长塔", targetArea: "commander", targetPos: [0.55, 2.79, -0.18], targetYaw: 0 },
    { id: "mbt_enter_top", area: "exterior", kind: "mount", pos: [3.0, 1.6], radius: 1.2, label: "爬上车顶", targetArea: "turret_top", targetPos: [0, 2.54, 0.2], targetYaw: 0 },
    { id: "mbt_exit_driver", area: "driver", kind: "dismount", pos: [-0.55, 2.25], radius: 1.4, label: "下车", targetArea: "exterior", targetPos: [-3.0, -0.34, 2.25], targetYaw: Math.PI / 2 },
    { id: "mbt_exit_commander", area: "commander", kind: "dismount", pos: [0.45, -0.27], radius: 1.4, label: "下车", targetArea: "exterior", targetPos: [3.0, -0.34, -0.27], targetYaw: -Math.PI / 2 },
    { id: "mbt_exit_top", area: "turret_top", kind: "dismount", pos: [0, 0.2], radius: 1.6, label: "跳下车", targetArea: "exterior", targetPos: [3.0, -0.34, 1.6], targetYaw: -Math.PI / 2 },
  ],
};

const TANK_WALK_LIGHTS: Record<string, WalkLightSpec[]> = {
  driver: [{ pos: [-0.55, 1.45, 2.0], intensity: 0.55, distance: 2.6, color: "#b9e4d6" }],
  commander: [{ pos: [0.45, 2.25, -0.2], intensity: 0.5, distance: 2.0, color: "#cfe6ef" }],
  turret_top: [{ pos: [0, 3.6, 0.2], intensity: 0.35, distance: 3.0 }],
  exterior: [],
};

export const CARRIER_WALK_CONFIG = CARRIER_WALK;
export const TYPE055_WALK_CONFIG = TYPE055_WALK;
export const TIGER_WALK_CONFIG = TIGER_WALK;
export const MBT_WALK_CONFIG = MBT_WALK;
export const WALK_CONFIGS: Record<string, WalkConfig> = {
  carrier: CARRIER_WALK,
  type055: TYPE055_WALK,
  tiger: TIGER_WALK,
  mbt90: MBT_WALK,
  ed90: MBT_WALK,
};

export function walkConfigOf(modelId: string): WalkConfig | null {
  return WALK_CONFIGS[modelId] ?? null;
}

export function walkLightsOf(modelId: string): Record<string, WalkLightSpec[]> {
  if (modelId === "type055") return TYPE055_WALK_LIGHTS;
  if (modelId === "tiger" || modelId === "mbt90" || modelId === "ed90") return TANK_WALK_LIGHTS;
  return CARRIER_WALK_LIGHTS;
}

// ----------------------------------------------------------------------------
// 碰撞体：进入区域时预计算一次，只保留会挡住腰部/视线的实体。
// ----------------------------------------------------------------------------

const IGNORED_OBSTACLE = /hull\.bulwark|hull\.underwater|hull\.shell|hull_shell|hull_underwater|deck\.main|deck\.underside|deck_edge|bow_ramp_edge|bow_ramp_front|bow_ramp_plate|bow_ramp_core|bow_ramp_joint|bow_number|flight_deck|deck_under|deck_armor|sponson|parking_box|parking_num|runway_|takeoff_|tire_streak|oil_|tie_down|tiedown|wire_|shuttle_|cat_number|_lane_|_stator_|_coil_|_cooling_|end_marks|recovery_net|net_line|net_bar|arrestor_net_(hinge|cradle|trough|pack)|deck_line|marking|stripe|_paint|fire_door|walk_.*door|door_leaf|door_glass|door_frames|door_sign|railing|handrail/i;

export interface WalkObstacle {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  minY: number;
  maxY: number;
}

function areaBounds(area: WalkArea, z: number): [number, number] {
  if (area.rect) return [area.rect[0], area.rect[1]];
  if (area.halfWidth) {
    const h = area.halfWidth(z);
    return [-h, h];
  }
  return [-1e6, 1e6];
}

export function walkObstacles(assembled: AssembledModel, area: WalkArea, defaultEye = 0.2): WalkObstacle[] {
  const floor = typeof area.floor === "function" ? area.floor(area.spawn.pos[0], area.spawn.pos[2]) : area.floor;
  const eye = floor + (area.eyeHeight ?? defaultEye);
  const obstacles: WalkObstacle[] = [];
  const matrix = new THREE.Matrix4();
  const box = new THREE.Box3();
  const consider = (handle: PartHandle) => {
    if (IGNORED_OBSTACLE.test(handle.partId)) return;
    if (!handle.geometry.boundingBox) handle.geometry.computeBoundingBox();
    const geometryBox = handle.geometry.boundingBox;
    if (!geometryBox) return;
    for (const instance of handle.instances) {
      assembled.instanceMatrix(handle, instance.index, matrix);
      box.copy(geometryBox).applyMatrix4(matrix);
      if (box.max.y < floor + 0.02) continue;
      if (box.min.y > eye + 0.12) continue;
      const sx = box.max.x - box.min.x;
      const sz = box.max.z - box.min.z;
      const sy = box.max.y - box.min.y;
      if (sy < (area.polygon ? 0.09 : 0.045)) continue;
      if (Math.min(sx, sz) < 0.028) continue;
      // 室内：舱壁/围壁/壳体常被合并成一个横跨整间舱室的大件，其 AABB 会把
      // 整间屋子填满。房间边界已由 rect 约束，这些大件不能再当障碍。
      if (!area.polygon && !area.largeObstacles && (sx > 3.6 || sz > 4.2)) continue;
      if (area.polygon) {
        const cx = (box.min.x + box.max.x) / 2;
        const cz = (box.min.z + box.max.z) / 2;
        if (!insideDeck(cx, cz, -1.5)) continue;
      } else {
        const [minX, maxX] = areaBounds(area, (box.min.z + box.max.z) / 2);
        const [z0, z1] = [area.rect?.[2] ?? -1e6, area.rect?.[3] ?? 1e6];
        if (box.max.x < minX - 0.2 || box.min.x > maxX + 0.2) continue;
        if (box.max.z < z0 - 0.2 || box.min.z > z1 + 0.2) continue;
      }
      obstacles.push({ minX: box.min.x, maxX: box.max.x, minZ: box.min.z, maxZ: box.max.z, minY: box.min.y, maxY: box.max.y });
    }
  };
  // 只扫建筑层与甲板层附近的大件，跳过舰体内部上万个水密舱细节。
  for (const handle of assembled.parts) {
    consider(handle);
    if (obstacles.length > 1600) break;
  }
  return obstacles;
}

export function areaFloorAt(area: WalkArea, x: number, z: number): number {
  return typeof area.floor === "function" ? area.floor(x, z) : area.floor;
}

export function isInsideArea(area: WalkArea, x: number, z: number): boolean {
  if (area.polygon) return insideDeck(x, z);
  if (!area.rect) return false;
  const [minX, maxX, minZ, maxZ] = area.rect;
  if (z < minZ || z > maxZ) return false;
  const h = area.halfWidth ? area.halfWidth(z) : null;
  const lo = h === null ? minX : Math.max(minX, -h);
  const hi = h === null ? maxX : Math.min(maxX, h);
  return x >= lo && x <= hi;
}

export function clampToArea(
  area: WalkArea,
  x: number,
  z: number,
  current: { x: number; z: number },
  margin = 0,
): { x: number; z: number } {
  if (area.polygon) {
    // 分轴试探：贴舷缘时沿边滑动，而不是整体退回。
    if (insideDeck(x, z)) return { x, z };
    if (insideDeck(x, current.z)) return { x, z: current.z };
    if (insideDeck(current.x, z)) return { x: current.x, z };
    return { x: current.x, z: current.z };
  }
  if (!area.rect) return { x, z };
  let [minX, maxX, minZ, maxZ] = area.rect;
  if (area.halfWidth) {
    const h = area.halfWidth(z);
    minX = Math.max(minX, -h + margin);
    maxX = Math.min(maxX, h - margin);
  } else {
    minX += margin;
    maxX -= margin;
  }
  return {
    x: Math.max(minX, Math.min(maxX, x)),
    z: Math.max(minZ + margin, Math.min(maxZ - margin, z)),
  };
}

