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

export type CameraMode = "orbit" | "driver" | "commander";

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
  if (mode === "orbit" || !assembled) return null;
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

/** 视角模式的界面文案（动作按钮与浮层共用）。 */
export const CAMERA_MODE_LABELS: Record<CameraMode, { label: string; hint: string }> = {
  orbit: { label: "自由视角", hint: "拖动旋转 / 滚轮缩放" },
  driver: { label: "驾驶席视角", hint: "坐在驾驶席看仪表 / 方向盘 / 踏板；再点一次回到自由视角" },
  commander: { label: "车长指挥塔", hint: "随炮塔回转，向前看；再点一次回到自由视角" },
};
