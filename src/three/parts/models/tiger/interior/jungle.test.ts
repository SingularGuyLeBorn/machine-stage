import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { buildModel } from "@/three/parts";
import { findModel } from "@/app/catalog";

// ============================================================================
// 内饰「机械丛林」验收
//
// 三条口径：
//   1. 每一件内饰都必须落在装甲以内——历史坑：layout 旋转写进 mate 时平移被一起转走，
//      整批待发弹/工具飞到车外；这条测试就是那个坑的哨兵。
//   2. 线束不是贴图：必须是 tube 实体的长距离走线，且贴着侧板内表面（|z| ≥ 0.85）。
//   3. 参考图上的关键件一件不落，各自独立 partId（能单独选中、单独隐藏）。
//
// 例外：驾驶舱两侧的药筒/弹丸/弹药架。车体侧板内表面在 z ±0.90，而变速箱+侧制动器
// 已经铺到 z ±0.898——车体内根本没有 sponson 弹箱的空间，等车体加宽那一轮再收回。
// ============================================================================

const model = findModel("tiger");
const built = buildModel(model.registry!, {
  builders: model.builders,
  instanceLayouts: model.layouts,
  warnMissingLayout: false,
});

const box = new THREE.Box3();

const ENVELOPE = { x0: -4.55, x1: -0.68, y0: -0.34, y1: 2.05, z: 1.0 };
const OUTBOARD_DEBT = new Set([
  "tiger.interior.ammo_case",
  "tiger.interior.ammo_projectile_ap",
  "tiger.interior.ammo_projectile_he",
  "tiger.interior.ammo_rack",
]);

function interiorHandles() {
  return built.parts.filter((handle) => handle.partId.startsWith("tiger.interior."));
}

describe("tiger/interior 机械丛林", () => {
  it("内饰每一件都在装甲包络内（已知遗留弹架除外）", () => {
    const box = new THREE.Box3();
    const violations: string[] = [];
    for (const handle of interiorHandles()) {
      // fx 演示件（装填链的弹/空筒）在运行时才摆位，静止姿态不参与包络验收
      if (handle.def.tags?.includes("fx")) continue;
      built.partBounds(handle, box);
      const out =
        box.min.x < ENVELOPE.x0 ||
        box.max.x > ENVELOPE.x1 ||
        box.min.y < ENVELOPE.y0 ||
        box.max.y > ENVELOPE.y1 ||
        Math.abs(box.min.z) > ENVELOPE.z ||
        Math.abs(box.max.z) > ENVELOPE.z;
      if (out && !OUTBOARD_DEBT.has(handle.partId)) {
        violations.push(`${handle.partId} → ${box.min.toArray().join(",")} / ${box.max.toArray().join(",")}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it("参考图上的关键件一件不落，且都是独立 partId", () => {
    const ids = new Set(interiorHandles().map((handle) => handle.partId));
    const required = [
      "steering_wheel",
      "pedal",
      "gauge",
      "control_lever",
      "fuse_box",
      "relay_box",
      "circuit_breaker",
      "fire_extinguisher",
      "bow_mg_body",
      "radio_body",
      "periscope_body",
      "gunner_sight",
      "basket_rail",
      "ready_round_case",
      "cupola_periscope",
      "spare_drum",
      "first_aid_kit",
      "coax_mg",
      "basket_strut",
      "oil_pressure_line",
      "grab_handle",
      "data_plate",
      "warning_label",
      "floor_mat",
      "canteen",
      "hand_tool",
      "harness_trunk",
      "brake_pipe",
    ].map((suffix) => `tiger.interior.${suffix}`);
    expect(required.filter((id) => !ids.has(id))).toEqual([]);
    // 每件都写了「离壁多少毫米」的落位说明
    for (const handle of interiorHandles()) {
      expect(handle.def.source?.length ?? 0, handle.partId).toBeGreaterThan(24);
    }
  });

  it("线束是沿壁走线的实体管束，不是贴片", () => {
    const box = new THREE.Box3();
    // 车体两条：必须贴着侧装甲内表面（内表面 z ±0.90）走一整程
    for (const id of ["tiger.interior.harness_trunk", "tiger.interior.harness_rear"]) {
      const handle = built.getPart(id);
      expect(handle, id).toBeDefined();
      built.partBounds(handle!, box);
      const spanX = box.max.x - box.min.x;
      const spanZ = Math.max(Math.abs(box.min.z), Math.abs(box.max.z));
      expect(spanX, id).toBeGreaterThan(1.2);
      expect(spanZ, id).toBeGreaterThan(0.85);
      expect(handle!.geometry.attributes.position.count, id).toBeGreaterThan(1500);
    }
    // 炮塔那条绕吊篮走，不到侧壁（吊篮半径 0.8）
    const turret = built.getPart("tiger.interior.harness_turret")!;
    built.partBounds(turret, box);
    expect(box.max.x - box.min.x).toBeGreaterThan(0.6);
    expect(box.max.z - box.min.z).toBeGreaterThan(0.6);
    expect(turret.geometry.attributes.position.count).toBeGreaterThan(1500);
  });

  it("密集件按实例布置：卡箍/潜望镜/待发弹/踏板数量不缩水", () => {
    const counts = {
      "tiger.interior.cable_clamp": built.getPart("tiger.interior.cable_clamp")!.instances.length,
      "tiger.interior.cable_clamp_right": built.getPart("tiger.interior.cable_clamp_right")!
        .instances.length,
      "tiger.interior.cupola_periscope": built.getPart("tiger.interior.cupola_periscope")!
        .instances.length,
      "tiger.interior.ready_round_case": built.getPart("tiger.interior.ready_round_case")!
        .instances.length,
      "tiger.interior.pedal": built.getPart("tiger.interior.pedal")!.instances.length,
      "tiger.interior.data_plate": built.getPart("tiger.interior.data_plate")!.instances.length,
      "tiger.interior.grab_handle": built.getPart("tiger.interior.grab_handle")!.instances.length,
      "tiger.interior.fire_extinguisher": built.getPart("tiger.interior.fire_extinguisher")!
        .instances.length,
      "tiger.interior.extinguisher_clamp": built.getPart("tiger.interior.extinguisher_clamp")!
        .instances.length,
      "tiger.interior.basket_strut": built.getPart("tiger.interior.basket_strut")!.instances.length,
    };
    expect(counts).toEqual({
      "tiger.interior.cable_clamp": 3,
      "tiger.interior.cable_clamp_right": 3,
      "tiger.interior.cupola_periscope": 7,
      "tiger.interior.ready_round_case": 4,
      "tiger.interior.pedal": 3,
      "tiger.interior.data_plate": 6,
      "tiger.interior.grab_handle": 4,
      "tiger.interior.fire_extinguisher": 2,
      "tiger.interior.extinguisher_clamp": 4,
      "tiger.interior.basket_strut": 4,
    });
  });

  it("内饰件数达到参考图密度（≥ 70 件）", () => {
    expect(interiorHandles().length).toBeGreaterThanOrEqual(70);
  });

  it("炮塔回转时吊篮里的实例件跟着转（instance_nodes 漏写就会被这条抓住）", () => {
    const center = (id: string) => {
      built.partBounds(built.getPart(id)!, box);
      return new THREE.Vector3(
        (box.min.x + box.max.x) / 2,
        (box.min.y + box.max.y) / 2,
        (box.min.z + box.max.z) / 2,
      );
    };
    const rack = "tiger.interior.ready_rack";
    const cases = "tiger.interior.ready_round_case";
    const drum = "tiger.interior.spare_drum";
    const restRack = center(rack);
    const gap0 = [restRack.distanceTo(center(cases)), restRack.distanceTo(center(drum))];

    built.getNode("Turret")!.rotation.y += THREE.MathUtils.degToRad(30);
    built.syncInstances();
    built.root.updateMatrixWorld(true);
    const turnedRack = center(rack);
    const gap1 = [turnedRack.distanceTo(center(cases)), turnedRack.distanceTo(center(drum))];
    // 回转后与弹架的相对位置必须不变（实例件没跟上就会拉开），且件确实转了
    expect(turnedRack.distanceTo(restRack)).toBeGreaterThan(0.1);
    expect(Math.abs(gap1[0] - gap0[0])).toBeLessThan(0.02);
    expect(Math.abs(gap1[1] - gap0[1])).toBeLessThan(0.02);

    built.resetNodes();
    built.syncInstances();
    built.root.updateMatrixWorld(true);
  });
});
