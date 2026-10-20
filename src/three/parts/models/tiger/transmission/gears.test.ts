import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { buildModel } from "@/three/parts";
import { findModel } from "@/app/catalog";

// ============================================================================
// 变速箱齿圈验收
//
// 模型原来只有「齿轮坯」（主轴 ф140/ф180/ф220、中间轴 ф180/ф220/ф260/ф300），
// 本轮给每只坯套一圈 30 齿齿圈。口径：
//   · 7 只齿圈全部落在变速箱壳体包络内（x -3.58~-2.62 / y -0.303~0.326 / z ±0.392）；
//   · 齿圈是带齿的真几何（Extrude 齿廓，顶点数 > 500），不是圆环贴片；
//   · 过盈套合（内孔比坯小 1mm）已在 transmission registry 的 expectedContacts 登记。
// ============================================================================

const model = findModel("tiger");
const built = buildModel(model.registry!, {
  builders: model.builders,
  instanceLayouts: model.layouts,
  warnMissingLayout: false,
});

const HOUSING = new THREE.Box3(
  new THREE.Vector3(-3.58, -0.303, -0.392),
  new THREE.Vector3(-2.62, 0.326, 0.392),
);

describe("tiger/transmission 齿圈", () => {
  it("7 只齿圈（3 主轴 + 4 中间轴）全部在壳体包络内", () => {
    const rim = built.getPart("tiger.transmission.gear_rim")!;
    expect(rim.instances).toHaveLength(7);
    if (!rim.geometry.boundingBox) rim.geometry.computeBoundingBox();
    const local = rim.geometry.boundingBox!;
    const matrix = new THREE.Matrix4();
    for (const instance of rim.instances) {
      built.instanceMatrix(rim, instance.index, matrix);
      const box = local.clone().applyMatrix4(matrix);
      expect(HOUSING.containsBox(box), `齿圈[${instance.index}] 出壳体`).toBe(true);
    }
  });

  it("齿圈是带齿的真几何，齿顶高于轮坯（外径大于坯径）", () => {
    const rim = built.getPart("tiger.transmission.gear_rim")!;
    expect(rim.geometry.attributes.position.count).toBeGreaterThan(500);
    const main = built.getPart("tiger.transmission.main_shaft")!;
    const lay = built.getPart("tiger.transmission.layshaft")!;
    const box = new THREE.Box3();
    built.partBounds(rim, box);
    // 齿圈整体外廓（含缩放实例）应包住主轴/中间轴的齿轮坯区段
    const mainBox = built.partBounds(main, new THREE.Box3());
    const layBox = built.partBounds(lay, new THREE.Box3());
    expect(box.min.y).toBeLessThan(mainBox.min.y + 0.02);
    expect(box.max.y).toBeGreaterThan(layBox.max.y - 0.02);
    expect(box.max.x - box.min.x).toBeGreaterThan(0.4);
  });
});
