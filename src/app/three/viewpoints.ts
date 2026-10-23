import * as THREE from "three";
import type { AssembledModel, PartHandle } from "@/three/parts";

// ============================================================================
// app/three/viewpoints —— 第一人称视角（驾驶席 / 车长指挥塔）
//
// 纪律：眼点不写死坐标，全部从「零件实例包围盒」派生——
//   驾驶席 = 驾驶员侧靠背（tiger.interior.seat_backrest，z 最小那只）前 100mm、
//            靠背顶上 310mm，视线目标 = 仪表板（tiger.interior.dashboard）中心；
//   车长   = 指挥塔（tiger.turret.cupola）顶盖上 30mm。
// 这样改座椅 / 甲板 / 指挥塔位置时视角自动跟着走，不会出现「视角悬在半空」，
// 也不会出现眼睛贴着装甲板、整幅画面只有一面墙的情况。
//
// 为什么不再额外乘节点矩阵：`assembled.instanceMatrix()` 给的已经是「含节点本帧
// 位姿的 root 局部矩阵」，炮塔回转时车长眼点天然跟着转；再乘一次 Turret 世界矩阵
// 会变成两倍旋转（瞄准演示里眼点会绕座圈甩飞）。要出 root 局部系只需乘 root 世界矩阵，
// 这样行进 / 受击时车体动了，视角也跟着动。
// ============================================================================

export type CameraMode =
  | "orbit"
  | "driver"
  | "commander"
  | "bridge"
  | "cic"
  | "engine_room"
  | "reactor_room"
  | "magazine"
  | "hangar"
  | "cockpit"
  | "flight";

export const CARRIER_INTERIOR_MODES = [
  "bridge",
  "cic",
  "engine_room",
  "reactor_room",
  "magazine",
  "hangar",
  "cockpit",
] as const;

export function isCarrierInteriorMode(mode: CameraMode): boolean {
  return (CARRIER_INTERIOR_MODES as readonly string[]).includes(mode);
}

export interface FirstPersonView {
  /** 眼点（世界空间；已含车体位姿与炮塔回转）。 */
  position: THREE.Vector3;
  /** 视线目标点（世界空间）。 */
  target: THREE.Vector3;
  /** 视场角（度）：潜望镜是窄视场光学，比自由视角窄得多。 */
  fov: number;
}

const DRIVER_SEAT = "tiger.interior.seat_backrest";
const DRIVER_DASH = "tiger.interior.dashboard";
const COMMANDER_CUPOLA = "tiger.turret.cupola";

/** 单实例世界包围盒（实例矩阵 × 几何包围盒）。 */
function instanceBox(
  assembled: AssembledModel,
  handle: PartHandle,
  index: number,
): THREE.Box3 | null {
  if (!handle.geometry.boundingBox) handle.geometry.computeBoundingBox();
  const box = handle.geometry.boundingBox;
  if (!box) return null;
  const matrix = new THREE.Matrix4();
  assembled.instanceMatrix(handle, index, matrix);
  return new THREE.Box3().copy(box).applyMatrix4(matrix);
}

/** 整个零件的世界包围盒（所有实例并集）。 */
function handleBox(assembled: AssembledModel, handle: PartHandle): THREE.Box3 | null {
  let union: THREE.Box3 | null = null;
  for (const instance of handle.instances) {
    const box = instanceBox(assembled, handle, instance.index);
    if (!box) continue;
    union = union ? union.union(box) : box;
  }
  return union;
}

/**
 * 取第一人称视角（世界空间）。orbit 返回 null（表示交给 OrbitControls）。
 * assembled 为空（尚未装配）时也返回 null，调用方保持自由视角。
 * 调用前需保证 `assembled.root.matrixWorld` 是本帧的（视口每帧纪律里已 updateMatrixWorld）。
 */
export function firstPersonView(
  mode: CameraMode,
  assembled: AssembledModel | null,
): FirstPersonView | null {
  if (mode === "orbit" || mode === "flight" || !assembled) return null;
  const toWorld = (local: THREE.Vector3) => local.applyMatrix4(assembled.root.matrixWorld);

  if (mode === "driver") {
    const seat = assembled.getPart(DRIVER_SEAT);
    const dash = assembled.getPart(DRIVER_DASH);
    if (!seat || !dash) return null;
    // 驾驶员在车体左侧（模型 +Z 是右侧）→ 取 z 最小的那只靠背
    let driverBox: THREE.Box3 | null = null;
    let driverZ = Infinity;
    for (const instance of seat.instances) {
      const box = instanceBox(assembled, seat, instance.index);
      if (!box) continue;
      const z = box.getCenter(new THREE.Vector3()).z;
      if (z < driverZ) {
        driverZ = z;
        driverBox = box;
      }
    }
    const dashBox = handleBox(assembled, dash);
    if (!driverBox || !dashBox) return null;
    // 坐进驾驶席的眼睛：靠背前 100mm（人略微前倾）、靠背顶上方 310mm（坐垫面 + 750 眼高）
    const eye = new THREE.Vector3(driverBox.min.x - 0.1, driverBox.max.y + 0.31, driverZ);
    return {
      position: toWorld(eye),
      target: toWorld(dashBox.getCenter(new THREE.Vector3())),
      fov: 52,
    };
  }

  if (mode === "cockpit") {
    // 座舱空间狭小，零件包围盒容易把眼点推到舱盖/机头上；用机体节点局部坐标
    // 把眼点放在座椅前方、头枕之前的飞行员眼位，俯看仪表板（座舱盖在进入该视角时隐藏）。
    const node = assembled.getNode("CV_Aircraft");
    if (!node) return null;
    const m = node.matrixWorld;
    return {
      position: new THREE.Vector3(0, 0.72, 0.36).applyMatrix4(m),
      target: new THREE.Vector3(0, 0.648, 0.525).applyMatrix4(m),
      fov: 66,
    };
  }

  if (isCarrierInteriorMode(mode)) {
    const views = assembled.registry.model === "type055" ? TYPE055_INTERIOR_VIEWS : CARRIER_INTERIOR_VIEWS;
    const spec = views[mode];
    if (!spec) return null;
    const eyeHandle = assembled.getPart(spec.eyePart);
    const targetHandle = assembled.getPart(spec.targetPart);
    if (!eyeHandle || !targetHandle) return null;
    const eyeBox = handleBox(assembled, eyeHandle);
    const targetBox = handleBox(assembled, targetHandle);
    if (!eyeBox || !targetBox) return null;
    const eyeCenter = eyeBox.getCenter(new THREE.Vector3());
    const eye = new THREE.Vector3(
      eyeCenter.x + spec.eye[0],
      eyeBox.max.y + spec.eye[1],
      eyeCenter.z + spec.eye[2],
    );
    return {
      position: toWorld(eye),
      target: toWorld(targetBox.getCenter(new THREE.Vector3()).add(new THREE.Vector3(...(spec.targetOffset ?? [0, 0, 0])))),
      fov: spec.fov,
    };
  }

  const handle = assembled.getPart(COMMANDER_CUPOLA);
  if (!handle) return null;
  const box = handleBox(assembled, handle);
  if (!box) return null;
  const center = box.getCenter(new THREE.Vector3());
  const eye = new THREE.Vector3(center.x, box.max.y + 0.03, center.z);
  return {
    position: toWorld(eye),
    target: toWorld(eye.clone().add(new THREE.Vector3(-1, -0.03, 0))),
    fov: 26,
  };
}

interface CarrierInteriorViewSpec {
  eyePart: string;
  eye: [number, number, number];
  targetPart: string;
  targetOffset?: [number, number, number];
  fov: number;
}

const TYPE055_INTERIOR_VIEWS: Partial<Record<CameraMode, CarrierInteriorViewSpec>> = {
  bridge: {
    eyePart: "type055.interior.console_bridge_3",
    eye: [0, 0.55, 0],
    targetPart: "type055.gun.turret",
    targetOffset: [0, 8, 40],
    fov: 62,
  },
  cic: {
    eyePart: "type055.interior.console_cic_5",
    eye: [0, 0.8, 0],
    targetPart: "type055.interior.screen_cic_5",
    targetOffset: [0, 0, -6],
    fov: 66,
  },
  engine_room: {
    eyePart: "type055.power.engine_console",
    eye: [0, 1.8, -2.5],
    targetPart: "type055.power.gt1_casing",
    fov: 72,
  },
  hangar: {
    eyePart: "type055.hangar.door_header",
    eye: [0, -2.8, 4.0],
    targetPart: "type055.hangar.z20_hangar_r_cabin_upper",
    fov: 70,
  },
  magazine: {
    eyePart: "type055.gun.magazine",
    eye: [0, -0.55, 2.2],
    targetPart: "type055.gun.shell_01",
    fov: 70,
  },
};

const CARRIER_INTERIOR_VIEWS: Partial<Record<CameraMode, CarrierInteriorViewSpec>> = {
  bridge: {
    eyePart: "carrier.island.bridge_captain_seat_back",
    eye: [0, 0.02, 0.055],
    targetPart: "carrier.island.bridge_front_glass_c",
    fov: 63,
  },
  cic: {
    eyePart: "carrier.island.cic_watch_seat_back",
    eye: [0, 0.14, 0.05],
    targetPart: "carrier.island.cic_main_screen_c",
    fov: 66,
  },
  engine_room: {
    eyePart: "carrier.power.engine_view_camera",
    eye: [0, 0, 0],
    targetPart: "carrier.power.engine_switchboard",
    fov: 78,
  },
  reactor_room: {
    eyePart: "carrier.power.reactor_control_seat_back",
    eye: [0, 0.005, -0.04],
    targetPart: "carrier.power.vessel_head",
    targetOffset: [0, -0.5, 0],
    fov: 62,
  },
  magazine: {
    eyePart: "carrier.hangar.magazine_view_camera",
    eye: [0, 0, 0],
    targetPart: "carrier.hangar.magazine_rack_ext_2",
    fov: 72,
  },
  hangar: {
    eyePart: "carrier.hangar.hangar_view_camera",
    eye: [0, 0, 0],
    targetPart: "carrier.aircraft.hangarparked1_fuselage_mid",
    fov: 55,
  },
};

/** 视角模式的界面文案（动作按钮与浮层共用）。 */
export const CAMERA_MODE_LABELS: Record<CameraMode, { label: string; hint: string }> = {
  orbit: { label: "自由视角", hint: "拖动旋转 / 滚轮缩放" },
  driver: { label: "驾驶席视角", hint: "坐在驾驶席看仪表 / 方向盘 / 踏板；再点一次回到自由视角" },
  commander: { label: "车长指挥塔", hint: "随炮塔回转，向前看；再点一次回到自由视角" },
  bridge: { label: "航海舰桥", hint: "站在舰桥内，鼠标拖动环视舵轮 / 仪表盘 / 海图桌 / 雷达屏 / 侧窗；再点一次退出" },
  cic: { label: "战斗情报中心", hint: "在 CIC 内，拖动环视战术显控墙 / 双排显控台 / 海图桌 / 通信机柜；再点一次退出" },
  engine_room: { label: "机舱", hint: "在蒸汽轮机与减速齿轮箱之间，拖动环视管路 / 阀门 / 机舱仪表；再点一次退出" },
  reactor_room: { label: "反应堆舱", hint: "在反应堆屏蔽舱内，拖动环视压力容器 / 控制棒 / 一回路仪表；再点一次退出" },
  magazine: { label: "弹药库", hint: "在弹药库内，拖动环视弹药架 / 扬弹机 / 库存显控；再点一次退出" },
  hangar: { label: "机库", hint: "在机库内，拖动环视停机位 / 维护区 / 机库控制台；再点一次退出" },
  cockpit: { label: "舰载机座舱", hint: "舰载机座舱：平显 / 多功能显示器 / 操纵杆，拖动环视；再点一次退出" },
  flight: { label: "跟拍舰载机", hint: "跟拍舰载机：完整看滑行 / 弹射 / 爬升 / 进近 / 拦阻；再点一次退出" },
};
