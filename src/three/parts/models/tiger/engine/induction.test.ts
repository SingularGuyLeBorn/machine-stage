import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { buildModel } from "@/three/parts";
import { findModel } from "@/app/catalog";

// ============================================================================
// 化油器内部件验收
//
// 口径：4 只 Solex 化油器各有一套喉管 / 节气门 / 浮子 / 主量孔（4×4 实例），
// 全部装在化油器本体内（壳体包住，透视/剖切可见）。内部件的包围盒必须落在
// 本体的包围盒里——这同时保证支撑检测能通过、且不会穿出外壳。
// ============================================================================

const model = findModel("tiger");
const built = buildModel(model.registry!, {
  builders: model.builders,
  instanceLayouts: model.layouts,
  warnMissingLayout: false,
});

const parts = {
  venturi: "tiger.induction.carb_venturi",
  throttle: "tiger.induction.carb_throttle",
  float: "tiger.induction.carb_float",
  jet: "tiger.induction.carb_jet",
};

describe("tiger/engine 化油器内部", () => {
  it("四套内部件各 4 只，全部落在化油器本体内", () => {
    const bodyBox = built.partBounds(built.getPart("tiger.induction.carburetor")!, new THREE.Box3());
    for (const [name, id] of Object.entries(parts)) {
      const handle = built.getPart(id);
      expect(handle, name).toBeDefined();
      expect(handle!.instances, name).toHaveLength(4);
      const box = built.partBounds(handle!, new THREE.Box3());
      expect(bodyBox.containsBox(box), `${name} 穿出化油器外壳`).toBe(true);
    }
  });

  it("喉管 / 节气门 / 量孔沿进气方向分层，浮子偏在浮子室里", () => {
    const centers = Object.fromEntries(
      Object.entries(parts).map(([name, id]) => {
        const box = built.partBounds(built.getPart(id)!, new THREE.Box3());
        return [name, box.getCenter(new THREE.Vector3())];
      }),
    );
    // 四只化油器分两列，两两在 z 上对称；只比较同一列内的高度顺序
    expect(centers.venturi!.y).toBeGreaterThan(centers.jet!.y);
    expect(centers.throttle!.y).toBeGreaterThan(centers.venturi!.y);
    // 浮子离轴（不是一颗正中间的球）
    expect(Math.hypot(centers.float!.z - centers.venturi!.z, centers.float!.y - centers.venturi!.y)).toBeGreaterThan(0.01);
  });
});
