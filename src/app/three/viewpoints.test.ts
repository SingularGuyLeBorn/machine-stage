import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { buildModel } from "@/three/parts";
import { findModel } from "@/app/catalog";
import { CAMERA_MODE_LABELS, firstPersonView, isCarrierInteriorMode } from "./viewpoints";

// ============================================================================
// 第一人称视角验收：眼点从零件包围盒派生，并且
//   1) 车体动了（行进 / 受击）眼点跟着动；
//   2) 炮塔回转时车长眼点绕座圈转「一个」角度——不是两倍（合并时修掉的 bug）。
// ============================================================================

const model = findModel("tiger");
const build = () =>
  buildModel(model.registry!, {
    builders: model.builders,
    instanceLayouts: model.layouts,
    warnMissingLayout: false,
  });

function rotateTurret(built: ReturnType<typeof build>, yawRad: number) {
  const turret = built.getNode("Turret")!;
  const pivot = new THREE.Vector3(built.constants.TR_RING_X ?? -1.65, 0, 0);
  const quaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yawRad);
  turret.quaternion.copy(quaternion);
  turret.position.copy(pivot).sub(pivot.clone().applyQuaternion(quaternion));
  turret.updateMatrix();
  built.root.updateMatrixWorld(true);
}

describe("app/three/viewpoints 第一人称", () => {
  it("orbit 不接管相机；驾驶席眼点落在座椅与仪表板之间", () => {
    const built = build();
    built.root.updateMatrixWorld(true);
    expect(firstPersonView("orbit", built)).toBeNull();

    const driver = firstPersonView("driver", built)!;
    expect(driver.fov).toBeGreaterThan(40);
    expect(driver.position.z).toBeLessThan(0); // 驾驶员在左
    expect(driver.position.x).toBeLessThan(-3.0);
    expect(driver.position.x).toBeGreaterThan(-3.6);
    // 坐着的眼睛：比坐垫高、比顶甲板（1.05）低
    expect(driver.position.y).toBeGreaterThan(0.75);
    expect(driver.position.y).toBeLessThan(1.0);
    // 视线朝车头下方的仪表板——不是贴着一面装甲墙（fov 再窄也只剩白墙）
    expect(driver.target.x).toBeLessThan(driver.position.x - 0.8);
    expect(driver.target.y).toBeLessThan(driver.position.y - 0.4);
  });

  it("车长眼点在指挥塔口，炮塔回转时只转一个角度", () => {
    const built = build();
    built.root.updateMatrixWorld(true);
    const before = firstPersonView("commander", built)!;
    expect(before.position.x).toBeCloseTo(built.constants.TR_CUPOLA_X!, 1);
    expect(before.position.z).toBeCloseTo(built.constants.TR_CUPOLA_Z!, 1);

    const yaw = THREE.MathUtils.degToRad(60);
    rotateTurret(built, yaw);
    const after = firstPersonView("commander", built)!;
    const ring = new THREE.Vector2(built.constants.TR_RING_X!, 0);
    const expected = new THREE.Vector2(after.position.x, after.position.z);
    const rotated = new THREE.Vector2(before.position.x, before.position.z)
      .sub(ring)
      .rotateAround(new THREE.Vector2(0, 0), -yaw) // 绕 +Y 转 yaw → XZ 平面内为 -yaw
      .add(ring);
    expect(expected.distanceTo(rotated)).toBeLessThan(0.02);
    expect(after.position.y).toBeCloseTo(before.position.y, 3);
  });

  it("车体平移（行进 / 受击）时两个视角的眼点一起走", () => {
    const built = build();
    built.root.updateMatrixWorld(true);
    const driverBefore = firstPersonView("driver", built)!.position.clone();
    const commanderBefore = firstPersonView("commander", built)!.position.clone();

    built.root.position.set(1.4, -0.02, 0.3);
    built.root.updateMatrixWorld(true);
    expect(firstPersonView("driver", built)!.position.x).toBeCloseTo(driverBefore.x + 1.4, 3);
    expect(firstPersonView("driver", built)!.position.z).toBeCloseTo(driverBefore.z + 0.3, 3);
    expect(firstPersonView("commander", built)!.position.x).toBeCloseTo(commanderBefore.x + 1.4, 3);
  });
});

describe("航母内部视角", () => {
  it("七种内部模式可识别，orbit 不进入内部层", () => {
    for (const mode of ["bridge", "cic", "engine_room", "reactor_room", "magazine", "hangar", "cockpit"] as const) {
      expect(isCarrierInteriorMode(mode)).toBe(true);
      expect(CAMERA_MODE_LABELS[mode].label.length).toBeGreaterThan(0);
      expect(CAMERA_MODE_LABELS[mode].hint).toContain("环视");
    }
    expect(isCarrierInteriorMode("orbit")).toBe(false);
    expect(isCarrierInteriorMode("driver")).toBe(false);
  });
});
