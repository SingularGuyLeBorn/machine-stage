import * as THREE from "three";
import type { AssembledModel } from "../../assembler/assembler";
import { MBT, MBT_TRACK_LINKS_PER_SIDE, MBT_TRACK_PERIMETER, mbtTrackPose } from "./registry";

// ============================================================================
// models/mbt/motion —— 现代坦克的动画（节点 + 实例矩阵）
//
//   aim   炮塔回转 ±23°、火炮俯仰 ±3.4°
//   fire  炮身后坐 320mm（-Z）+ 炮口焰（4s 循环）
//   drive 车体前后 0.9m，负重轮/主动轮/诱导轮滚动，履带板沿环滚动
//   running 原地低速空转（看悬挂与履带）
// 切换出 drive/running 时用 restMatrix 复位轮与履带（实例矩阵是动画层直接改写的）。
// ============================================================================

export const MBT_MOTION_PARTS = ["mbt90.running.road_wheel", "mbt90.running.track"];

function restore(assembled: AssembledModel, partId: string): void {
  const handle = assembled.getPart(partId);
  if (!handle) return;
  for (const instance of handle.instances) {
    handle.setInstanceMatrix(instance.index, instance.restMatrix);
  }
}

export function animateMbt(assembled: AssembledModel, seconds: number, state?: string): void {
  const t = seconds;
  const turret = assembled.getNode("Turret");
  const gun = assembled.getNode("Gun");
  const recoil = assembled.getNode("GunRecoil");
  const flash = assembled.getPart("mbt90.turret.muzzle_flash");
  if (flash) flash.object.visible = false;

  // 节点 pivot 归零：绕座圈中心 (z 0.1) / 耳轴 (y 1.98, z 1.62) 做枢轴补偿
  const ring = new THREE.Vector3(0, 0, 0.1);
  const trunnion = new THREE.Vector3(0, 1.98, 1.62);
  const applyPivot = (
    node: THREE.Object3D | undefined,
    pivot: THREE.Vector3,
    euler: THREE.Euler,
  ) => {
    if (!node) return;
    const q = new THREE.Quaternion().setFromEuler(euler);
    node.quaternion.copy(q);
    node.position.copy(pivot).sub(pivot.clone().applyQuaternion(q));
  };

  if (state === "aim") {
    applyPivot(turret, ring, new THREE.Euler(0, Math.sin(t * 0.45) * 0.4, 0));
    applyPivot(gun, trunnion, new THREE.Euler(Math.sin(t * 0.8) * 0.06, 0, 0));
  } else if (state === "fire") {
    const u = t % 4;
    const kick = u < 0.12 ? u / 0.12 : Math.exp(-6 * (u - 0.12)) * Math.cos(20 * Math.max(0, u - 0.12));
    if (recoil) recoil.position.z = -0.32 * kick;
    if (flash) {
      const visible = u < 0.1;
      flash.object.visible = visible;
      if (visible) flash.object.scale.setScalar(0.8 + u * 4);
    }
    applyPivot(turret, ring, new THREE.Euler(0, 0, 0));
    applyPivot(gun, trunnion, new THREE.Euler(0, 0, 0));
  }

  if (state === "drive" || state === "running") {
    const speed = state === "drive" ? 1.0 : 0.32;
    if (state === "drive") assembled.root.position.z = Math.sin(t * 0.32) * 0.9;
    const spin = (t * speed) / MBT.WHEEL_R;
    const m = new THREE.Matrix4();
    const wheel = assembled.getPart("mbt90.running.road_wheel");
    if (wheel) {
      for (const instance of wheel.instances) {
        const k = Math.floor(instance.index / 2);
        const s = instance.index % 2 === 0 ? 1 : -1;
        m.makeRotationX(spin).setPosition(
          s * MBT.WHEEL_X,
          MBT.WHEEL_Y,
          MBT.WHEEL_Z_FIRST - k * MBT.WHEEL_PITCH,
        );
        wheel.setInstanceMatrix(instance.index, m);
      }
    }
    // 主动轮 / 诱导轮跟着转（用同一 rest 位置）
    for (const [id, z] of [
      ["mbt90.running.sprocket", MBT.SPROCKET_Z],
      ["mbt90.running.idler", MBT.IDLER_Z],
    ] as const) {
      const handle = assembled.getPart(id);
      if (!handle) continue;
      for (const instance of handle.instances) {
        const s = instance.index % 2 === 0 ? 1 : -1;
        m.makeRotationX(spin).setPosition(s * MBT.WHEEL_X, MBT.WHEEL_Y, z);
        handle.setInstanceMatrix(instance.index, m);
      }
    }
    const track = assembled.getPart("mbt90.running.track");
    if (track) {
      const per = MBT_TRACK_LINKS_PER_SIDE;
      for (const instance of track.instances) {
        const s = instance.index % 2 === 0 ? 1 : -1;
        const k = instance.index % per;
        const pose = mbtTrackPose((k / per) * MBT_TRACK_PERIMETER - t * speed);
        m.makeRotationX(pose.angle).setPosition(s * MBT.WHEEL_X, pose.y + 0.03, pose.z);
        track.setInstanceMatrix(instance.index, m);
      }
    }
  } else {
    restore(assembled, "mbt90.running.road_wheel");
    restore(assembled, "mbt90.running.track");
    restore(assembled, "mbt90.running.sprocket");
    restore(assembled, "mbt90.running.idler");
  }
}
