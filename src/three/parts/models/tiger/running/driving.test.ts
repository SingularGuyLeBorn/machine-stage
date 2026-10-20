import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { buildModel, detectStatic } from "@/three/parts";
import { findModel } from "@/app/catalog";
import { applyExplode } from "@/app/three/pose";
import {
  animateTigerDriving,
  TIGER_DRIVE_CYCLE,
  TIGER_MOTION_PARTS,
  tigerDrivePoseAt,
} from "../motion";
import { makeTrackScroller } from "./registry";

// ============================================================================
// 行进演示验收（P3）
//
// 1. 曲线闭环：前进 1.54m → 倒退归零 → 原地右转 24° → 左转 48° → 回正。
// 2. 履带板/销/锁环的实例矩阵 = 同一轨迹偏移解，offset=0 回到静止位姿。
// 3. 差速：原地右转时右履带反向、左履带正向；两侧负重轮转向相反。
// 4. 回归：explode=0 的姿态层每帧清理不能把 motionParts 抹回静止位
//    （否则根节点在动、履带和轮子却不动——用户实测 bug）。
// 5. 行进姿态下履带/悬挂零干涉。
// ============================================================================

const model = findModel("tiger");
const build = () =>
  buildModel(model.registry!, {
    builders: model.builders,
    instanceLayouts: model.layouts,
    warnMissingLayout: false,
  });

const matrixDistance = (a: THREE.Matrix4, b: THREE.Matrix4): number => {
  let max = 0;
  for (let i = 0; i < 16; i++) max = Math.max(max, Math.abs(a.elements[i]! - b.elements[i]!));
  return max;
};

const instanceMatrix = (handle: { object: THREE.Object3D }, index: number): THREE.Matrix4 => {
  const matrix = new THREE.Matrix4();
  (handle.object as THREE.InstancedMesh).getMatrixAt(index, matrix);
  return matrix;
};

describe("tiger/P3 行进演示", () => {
  it("曲线闭环：前进 1.54m、倒退归零、原地右转 24°→左转 48°→回正", () => {
    expect(tigerDrivePoseAt(0).distance).toBeCloseTo(0, 9);
    expect(tigerDrivePoseAt(0).yaw).toBeCloseTo(0, 9);
    expect(tigerDrivePoseAt(4.0).distance).toBeCloseTo(1.54, 6);
    expect(tigerDrivePoseAt(4.0).yaw).toBeCloseTo(0, 9);
    expect(tigerDrivePoseAt(8.7).distance).toBeCloseTo(0, 6);
    const right = tigerDrivePoseAt(11.3);
    expect(right.yaw).toBeCloseTo(0.42, 6);
    expect(right.distance).toBeCloseTo(0, 9);
    const left = tigerDrivePoseAt(15.2);
    expect(left.yaw).toBeCloseTo(-0.42, 6);
    const end = tigerDrivePoseAt(TIGER_DRIVE_CYCLE);
    expect(end.distance).toBeCloseTo(0, 9);
    expect(end.yaw).toBeCloseTo(0, 9);
    expect(end.speed).toBeCloseTo(0, 9);
  });

  it("履带板/销/锁环按行程滚动，offset=0 与静止位姿逐元素一致", () => {
    const built = build();
    const scroller = makeTrackScroller(built.constants);
    const pose = tigerDrivePoseAt(2.0);
    const trackZ = built.constants.TRACK_Z!;
    const right = pose.distance - trackZ * pose.yaw;
    const left = pose.distance + trackZ * pose.yaw;

    built.resetNodes();
    animateTigerDriving(built, 2.0);
    for (const [partId, kind] of [
      ["tiger.track.link", "link"],
      ["tiger.track.pin", "pin"],
      ["tiger.track.pin_clip", "clip"],
    ] as const) {
      const handle = built.getPart(partId)!;
      for (const index of [0, 40, 96, 150]) {
        const expected = scroller.matrixAt(kind, index, index < 96 ? right : left);
        // InstancedMesh 的矩阵按 Float32 存储，比较容差取 1e-6
        expect(matrixDistance(instanceMatrix(handle, index), expected)).toBeLessThan(1e-6);
      }
    }

    built.resetNodes();
    animateTigerDriving(built, 0);
    for (const partId of ["tiger.track.link", "tiger.track.pin", "tiger.track.pin_clip"]) {
      const handle = built.getPart(partId)!;
      expect(matrixDistance(instanceMatrix(handle, 40), handle.instances[40]!.restMatrix)).toBeLessThan(
        1e-6,
      );
    }
    built.dispose();
  });

  it("原地右转差速：两侧履带反向，负重轮转向相反", () => {
    const built = build();
    const t = 10.3; // 右转巡航段，yaw > 0
    const pose = tigerDrivePoseAt(t);
    expect(pose.yaw).toBeGreaterThan(0.05);
    expect(pose.distance).toBeCloseTo(0, 9);
    built.resetNodes();
    animateTigerDriving(built, t);

    const wheel = built.getPart("tiger.suspension.wheel")!;
    const half = wheel.instances.length / 2;
    const crossOf = (index: number): number => {
      const rest = wheel.instances[index]!.restMatrix;
      const center = new THREE.Vector3(rest.elements[12], rest.elements[13], rest.elements[14]);
      // 局部 Y 是轴向（lateral 布局把它转到世界 Z）；取轮平面内的局部 X 作径向样本
      const local = new THREE.Vector3(0.35, 0, 0);
      const before = local.clone().applyMatrix4(rest).sub(center);
      const after = local.clone().applyMatrix4(instanceMatrix(wheel, index)).sub(center);
      return before.x * after.y - before.y * after.x;
    };
    // 右转：右履带（index 0）倒车 → 转角为负；左履带（index half）前进 → 转角为正
    expect(crossOf(0)).toBeLessThan(-1e-6);
    expect(crossOf(half)).toBeGreaterThan(1e-6);
    built.dispose();
  });

  it("回归：explode=0 的姿态层不得抹掉行进中的履带/轮子", () => {
    const built = build();
    const scroller = makeTrackScroller(built.constants);
    built.resetNodes();
    animateTigerDriving(built, 2.0);
    const pose = tigerDrivePoseAt(2.0);
    const link = built.getPart("tiger.track.link")!;
    const wheel = built.getPart("tiger.suspension.wheel")!;
    const linkBefore = instanceMatrix(link, 0);
    const wheelBefore = instanceMatrix(wheel, 0);

    applyExplode(built, 0, new Set(TIGER_MOTION_PARTS));
    expect(matrixDistance(instanceMatrix(link, 0), linkBefore)).toBeLessThan(1e-12);
    expect(matrixDistance(instanceMatrix(wheel, 0), wheelBefore)).toBeLessThan(1e-12);
    const expected = scroller.matrixAt("link", 0, pose.distance);
    expect(matrixDistance(instanceMatrix(link, 0), expected)).toBeLessThan(1e-6);
    built.dispose();
  });

  it("行进姿态（直驶 / 原地转向）履带与悬挂零干涉", () => {
    const built = build();
    const failures: string[] = [];
    for (const t of [2.0, 10.3, 14.0]) {
      built.resetNodes();
      animateTigerDriving(built, t);
      built.root.updateMatrixWorld(true);
      const reports = detectStatic(built, {
        filter: (handle) => handle.assembly === "track" || handle.assembly === "suspension",
      });
      for (const report of reports) {
        failures.push(`t=${t}s ${report.a} ↔ ${report.b} @${report.depth_mm}mm [${report.form}]`);
      }
    }
    expect(failures).toEqual([]);
    built.dispose();
  }, 240_000);
});
