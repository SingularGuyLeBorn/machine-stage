import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { createHmtRestPose } from "./restPose";

describe("HMT 参考静止姿态", () => {
  const pose = createHmtRestPose();
  it("批注的正面浅折线左右镜像，腕在肘内侧且前臂更接近竖直", () => {
    const joints = [1, -1].map((side) => {
      const limb = pose.sides.get(side)!;
      const shoulder = new Vector3(side * 0.355, 1.985, -0.012).applyMatrix4(limb.upper);
      const elbow = new Vector3(side * 0.434, 1.644, 0.002).applyMatrix4(limb.upper);
      const wrist = new Vector3(side * 0.452, 1.207, 0.021).applyMatrix4(limb.fore);
      expect(side * (elbow.x - shoulder.x)).toBeGreaterThan(0.06);
      expect(side * (wrist.x - elbow.x)).toBeLessThan(-0.02);
      expect(Math.abs((wrist.x - elbow.x) / (wrist.y - elbow.y))).toBeLessThan(
        Math.abs((elbow.x - shoulder.x) / (elbow.y - shoulder.y)),
      );
      expect(elbow.z).toBeLessThan(shoulder.z);
      expect(wrist.z).toBeGreaterThan(elbow.z + 0.14);
      return [shoulder, elbow, wrist];
    });
    for (let i = 0; i < 3; i++) {
      expect(joints[0][i].y).toBeCloseTo(joints[1][i].y, 10);
      expect(joints[0][i].z).toBeCloseTo(joints[1][i].z, 10);
      expect(joints[0][i].x + joints[1][i].x).toBeCloseTo(joints[0][0].x + joints[1][0].x, 10);
    }
  });
  it("双臂保留明显肘弯，前臂回到髋侧而非向两侧平张", () => {
    for (const side of [1, -1]) {
      const limb = pose.sides.get(side)!;
      const shoulder = new Vector3(side * 0.355, 1.985, -0.012).applyMatrix4(limb.upper);
      const elbow = new Vector3(side * 0.434, 1.644, 0.002).applyMatrix4(limb.upper);
      const wrist = new Vector3(side * 0.452, 1.207, 0.021).applyMatrix4(limb.fore);
      expect(elbow.clone().sub(shoulder).angleTo(wrist.clone().sub(elbow))).toBeGreaterThan(Math.PI / 6);
      expect(wrist.z - elbow.z).toBeGreaterThan(0.1);
      expect(Math.abs(wrist.x - elbow.x)).toBeLessThan(0.06);
    }
  });
  it("上下臂围绕同一个肘中心，腕部围绕同一个腕中心", () => {
    for (const side of [1, -1]) {
      const limb = pose.sides.get(side)!;
      const elbow = new Vector3(side * 0.434, 1.644, 0.002);
      const wrist = new Vector3(side * 0.452, 1.207, 0.021);
      expect(
        elbow.clone().applyMatrix4(limb.upper).distanceTo(elbow.clone().applyMatrix4(limb.fore)),
      ).toBeLessThan(1e-10);
      expect(
        wrist.clone().applyMatrix4(limb.fore).distanceTo(wrist.clone().applyMatrix4(limb.hand)),
      ).toBeLessThan(1e-10);
      const upperDirection = new Vector3(side * 0.355, 1.985, -0.012)
        .sub(elbow)
        .transformDirection(limb.upper);
      const foreDirection = elbow.clone().sub(wrist).transformDirection(limb.fore);
      const elbowBend = (upperDirection.angleTo(foreDirection) * 180) / Math.PI;
      expect(elbowBend).toBeGreaterThan(18);
      expect(elbowBend).toBeLessThan(40);
    }
  });
  it("掌心沿前臂轴线延伸，不在腕后再次向外折", () => {
    for (const side of [1, -1]) {
      const limb = pose.sides.get(side)!;
      const elbow = new Vector3(side * 0.434, 1.644, 0.002).applyMatrix4(limb.upper);
      const wristSource = new Vector3(side * 0.452, 1.207, 0.021);
      const wrist = wristSource.clone().applyMatrix4(limb.fore);
      const palm = new Vector3(side * 0.452, 1.141, 0.043).applyMatrix4(limb.hand);
      const foreDirection = wrist.clone().sub(elbow).normalize();
      const palmDirection = palm.clone().sub(wrist).normalize();
      expect(palmDirection.angleTo(foreDirection)).toBeLessThan(1e-7);
      expect(wrist.distanceTo(wristSource.clone().applyMatrix4(limb.hand))).toBeLessThan(1e-10);
    }
  });
  it("放松垂手的掌心朝内且微向后，掌背朝外且略向前，拇指朝前", () => {
    for (const side of [1, -1]) {
      const hand = pose.sides.get(side)!.hand;
      const palmNormal = new Vector3(0, 0, -1).transformDirection(hand);
      const thumbDirection = new Vector3(-side, 0, 0).transformDirection(hand);
      expect(side * palmNormal.x).toBeLessThan(-0.75);
      expect(palmNormal.z).toBeLessThan(0);
      expect(thumbDirection.z).toBeGreaterThan(0.75);
    }
  });
  it("肘部张到肩线外，骨盆整体前送且肩线留在足跟后方", () => {
    const hips: Vector3[] = [];
    const ankles: Vector3[] = [];
    for (const side of [1, -1]) {
      const limb = pose.sides.get(side)!;
      const shoulder = new Vector3(side * 0.355, 1.985, -0.012).applyMatrix4(limb.upper);
      const elbow = new Vector3(side * 0.434, 1.644, 0.002).applyMatrix4(limb.upper);
      const hip = new Vector3(side * 0.166, 1.221, -0.014).applyMatrix4(limb.thigh);
      const ankle = new Vector3(side * 0.265, 0.156, -0.017).applyMatrix4(limb.foot);
      const heel = new Vector3(side * 0.265, 0.006, -0.067).applyMatrix4(limb.foot);
      expect(side * (elbow.x - shoulder.x)).toBeGreaterThan(0.1);
      expect(hip.z - shoulder.z).toBeGreaterThan(0.18);
      expect(shoulder.z).toBeLessThan(heel.z);
      hips.push(hip);
      ankles.push(ankle);
    }
    const hipZ = (hips[0].z + hips[1].z) * 0.5;
    const ankleZ = (ankles[0].z + ankles[1].z) * 0.5;
    expect(hipZ).toBeGreaterThan(ankleZ + 0.03);
  });
  it("屈膝保持骨长和髋膝踝连接，两脚仍处于同一地面", () => {
    for (const side of [1, -1]) {
      const limb = pose.sides.get(side)!;
      const hip = new Vector3(side * 0.166, 1.221, -0.014);
      const knee = new Vector3(side * 0.218, 0.679, 0.008);
      const ankle = new Vector3(side * 0.265, 0.156, -0.017);
      const a = hip.clone().applyMatrix4(limb.thigh),
        b = knee.clone().applyMatrix4(limb.thigh),
        c = ankle.clone().applyMatrix4(limb.calf);
      expect(a.distanceTo(hip.clone().applyMatrix4(pose.pelvis))).toBeLessThan(1e-10);
      expect(b.distanceTo(knee.clone().applyMatrix4(limb.calf))).toBeLessThan(1e-10);
      expect(c.distanceTo(ankle.clone().applyMatrix4(limb.foot))).toBeLessThan(1e-10);
      expect(a.distanceTo(b)).toBeCloseTo(hip.distanceTo(knee), 10);
      expect(b.distanceTo(c)).toBeCloseTo(knee.distanceTo(ankle), 10);
      expect(new Vector3(side * 0.265, 0, 0.1).applyMatrix4(limb.foot).y).toBeCloseTo(0, 10);
      expect(b.z).toBeGreaterThan(a.z + 0.035);
    }
  });
  it("肩轴随肩带后收，上臂仍接在同一根轴上", () => {
    for (const side of [1, -1]) {
      const limb = pose.sides.get(side)!;
      const pivot = new Vector3(side * 0.355, 1.985, -0.012);
      const shoulder = pivot.clone().applyMatrix4(limb.shoulder);
      expect(shoulder.distanceTo(pivot.clone().applyMatrix4(limb.upper))).toBeLessThan(1e-10);
      expect(shoulder.z).toBeLessThan(pivot.clone().applyMatrix4(pose.chest).z - 0.04);
    }
  });
  it("肩部每根线束的两端分别跟随背甲和上臂插座", () => {
    for (const side of [1, -1])
      for (let i = 0; i < 4; i++) {
        const start: [number, number, number] = [0.13 + i * 0.008, 1.962, -0.115];
        const end: [number, number, number] = [0.408 + i * 0.008, 1.904, -0.11];
        expect(
          pose
            .point("shoulder", "harness_" + i, start, side)
            .distanceTo(new Vector3(start[0] * side, start[1], start[2]).applyMatrix4(pose.chest)),
        ).toBeLessThan(1e-10);
        expect(
          pose
            .point("shoulder", "harness_" + i, end, side)
            .distanceTo(new Vector3(end[0] * side, end[1], end[2]).applyMatrix4(pose.sides.get(side)!.upper)),
        ).toBeLessThan(1e-10);
      }
  });
  it("肩颈线束降低弧高并减少后鼓，两端仍沿用原插座", () => {
    for (const side of [1, -1])
      for (let i = 0; i < 4; i++) {
        const oldMiddle: [number, number, number] = [0.295 + i * 0.01, 2.041 + i * 0.008, -0.16];
        const newMiddle: [number, number, number] = [0.288 + i * 0.008, 1.998 + i * 0.004, -0.145];
        const before = pose.point("shoulder", "harness_" + i, oldMiddle, side);
        const after = pose.point("shoulder", "harness_" + i, newMiddle, side);
        expect(after.y).toBeLessThan(before.y - 0.025);
        expect(after.z).toBeGreaterThan(before.z + 0.005);
      }
  });
  it("带编号的腹侧线束跨过胸腰关节，末端跟随下腰而非整根随胸部转动", () => {
    for (const side of [1, -1])
      for (let i = 0; i < 4; i++) {
        const upper: [number, number, number] = [0.2 + i * 0.0075, 1.799, -0.018];
        const lower: [number, number, number] = [0.082 + i * 0.0075, 1.396, -0.105];
        expect(
          pose
            .point("torso", "abdominal_harness_" + i, upper, side)
            .distanceTo(new Vector3(upper[0] * side, upper[1], upper[2]).applyMatrix4(pose.chest)),
        ).toBeLessThan(1e-10);
        expect(
          pose
            .point("torso", "abdominal_harness_" + i, lower, side)
            .distanceTo(new Vector3(lower[0] * side, lower[1], lower[2]).applyMatrix4(pose.waist(lower[1]))),
        ).toBeLessThan(1e-10);
      }
  });
  it("中央腹部总线与三节腰椎共用弯曲基准", () => {
    for (const y of [1.39, 1.481, 1.572]) {
      const source: [number, number, number] = [0, y, -0.045];
      expect(
        pose
          .point("torso", "abdominal_harness", source, 1)
          .distanceTo(new Vector3(...source).applyMatrix4(pose.waist(y))),
      ).toBeLessThan(1e-10);
    }
  });
  it("腰部有前后反弯，上下腰椎方向不同", () => {
    const up = new Vector3(0, 1, 0);
    const lower = up.clone().transformDirection(pose.waist(1.39));
    const upper = up.clone().transformDirection(pose.waist(1.572));
    expect(lower.z).toBeLessThan(-0.3);
    expect(upper.z).toBeGreaterThan(0.1);
    expect(lower.angleTo(upper)).toBeGreaterThan(Math.PI / 7);
    expect(lower.angleTo(upper)).toBeGreaterThan((45 * Math.PI) / 180);
  });
  it("三节腰椎保留连续连接，胸廓与骨盆有独立方向", () => {
    const up = new Vector3(0, 1, 0);
    expect(
      up.clone().transformDirection(pose.chest).angleTo(up.clone().transformDirection(pose.pelvis)),
    ).toBeGreaterThan(0.02);
    for (const y of [1.435, 1.526]) {
      const pivot = new Vector3(0, y, -0.037);
      expect(
        pivot
          .clone()
          .applyMatrix4(pose.waist(y - 0.00001))
          .distanceTo(pivot.clone().applyMatrix4(pose.waist(y + 0.00001))),
      ).toBeLessThan(1e-10);
    }
  });
});
