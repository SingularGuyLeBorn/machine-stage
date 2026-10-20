import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { buildModel } from "@/three/parts";
import { findModel } from "@/app/catalog";

// ============================================================================
// 气门组零件级验收
//
// 口径：每缸两只气门，每只配一根弹簧 + 一个弹簧座 + 一圈锁夹（24 组）；
// 三者必须骑在同一根气门杆轴线上（XZ 偏差 < 20mm），否则剖视里就会「弹簧飘在旁边」。
// 锁夹/弹簧座/弹簧与气门杆之间是间隙配合（不接触），所以不登记 expectedContacts。
// ============================================================================

const model = findModel("tiger");
const built = buildModel(model.registry!, {
  builders: model.builders,
  instanceLayouts: model.layouts,
  warnMissingLayout: false,
});

function centersOf(partId: string): THREE.Vector3[] {
  const handle = built.getPart(partId)!;
  if (!handle.geometry.boundingBox) handle.geometry.computeBoundingBox();
  const box = handle.geometry.boundingBox!;
  const local = box.getCenter(new THREE.Vector3());
  const matrix = new THREE.Matrix4();
  return handle.instances.map((instance) =>
    local.clone().applyMatrix4(built.instanceMatrix(handle, instance.index, matrix)),
  );
}

describe("tiger/engine 气门组", () => {
  it("弹簧 / 弹簧座 / 锁夹各 24 只，都骑在对应气门杆轴线上", () => {
    const valves = built.getPart("tiger.valvetrain.valve")!;
    const springs = built.getPart("tiger.valvetrain.valve_spring")!;
    const retainers = built.getPart("tiger.valvetrain.valve_retainer")!;
    const keepers = built.getPart("tiger.valvetrain.valve_keeper")!;
    const valveCenters = centersOf("tiger.valvetrain.valve");
    expect(valveCenters).toHaveLength(24);
    expect(springs.instances).toHaveLength(24);
    expect(retainers.instances).toHaveLength(24);
    expect(keepers.instances).toHaveLength(24);

    const springCenters = centersOf("tiger.valvetrain.valve_spring");
    const retainerCenters = centersOf("tiger.valvetrain.valve_retainer");
    const keeperCenters = centersOf("tiger.valvetrain.valve_keeper");
    for (let i = 0; i < 24; i++) {
      const valve = valveCenters[i]!;
      for (const [name, centers] of [
        ["spring", springCenters],
        ["retainer", retainerCenters],
        ["keeper", keeperCenters],
      ] as const) {
        const center = centers[i]!;
        expect(
          Math.hypot(center.x - valve.x, center.z - valve.z),
          `${name}[${i}] 偏离气门杆轴线`,
        ).toBeLessThan(0.02);
        // 三者都在气门座上方（沿杆轴向上），不会掉进缸里
        expect(center.y, `${name}[${i}] 低于气门座`).toBeGreaterThan(valve.y - 0.01);
      }
    }
    // 弹簧是真螺旋管（TubeGeometry），不是一圈圆环贴片
    expect(springs.geometry.attributes.position.count).toBeGreaterThan(300);
    expect(valves.instances).toHaveLength(valveCenters.length);
  });

  it("锁夹外径 < 弹簧座内孔（不互相穿插），弹簧内径 > 气门杆", () => {
    const retainer = built.getPart("tiger.valvetrain.valve_retainer")!.def.geometry as {
      rInner: number;
    };
    const keeper = built.getPart("tiger.valvetrain.valve_keeper")!.def.geometry as {
      rOuter: number;
    };
    expect(keeper.rOuter).toBeLessThan(retainer.rInner);
    const springParams = (
      built.getPart("tiger.valvetrain.valve_spring")!.def.geometry as {
        params: { coilR: number; wireR: number };
      }
    ).params;
    const stemR = 0.008;
    expect(springParams.coilR - springParams.wireR).toBeGreaterThan(stemR);
  });
});
