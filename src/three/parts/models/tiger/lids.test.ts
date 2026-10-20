import { afterEach, describe, expect, it } from "vitest";
import * as THREE from "three";
import { buildModel } from "@/three/parts";
import { findModel } from "@/app/catalog";
import {
  applyTigerLidPose,
  effectiveLidOpen,
  lidAt,
  resetTigerLidPose,
  TIGER_LIDS,
  type TigerLidSpec,
} from "./lids";

// ============================================================================
// 可动盖板验收：铰链角度 / 平滑开合 / 状态强制 / 点击别名
// ============================================================================

const model = findModel("tiger");
const build = () =>
  buildModel(model.registry!, {
    builders: model.builders,
    instanceLayouts: model.layouts,
    warnMissingLayout: false,
  });

function pose(
  built: ReturnType<typeof build>,
  state: string | undefined,
  overrides: Record<string, boolean>,
  frames = 30,
) {
  for (let i = 0; i < frames; i++) {
    applyTigerLidPose(built, state, overrides, 0.05);
  }
  built.root.updateMatrixWorld(true);
}

function topOf(built: ReturnType<typeof build>, partId: string): number {
  const handle = built.getPart(partId)!;
  return built.partBounds(handle, new THREE.Box3()).max.y;
}

afterEach(() => resetTigerLidPose());

describe("tiger/可动盖板", () => {
  it("6 块盖板都指向真实零件/实例，别名能从加油口底座点到盖板", () => {
    const built = build();
    const keys = new Set<string>();
    for (const lid of TIGER_LIDS) {
      expect(built.getPart(lid.partId), lid.partId).toBeDefined();
      expect(built.getPart(lid.partId)!.instances[lid.instance], lid.key).toBeDefined();
      expect(keys.has(lid.key)).toBe(false);
      keys.add(lid.key);
    }
    expect(lidAt("tiger.hull.hatch_lid", 0)?.name_cn).toBe("无线电员舱盖");
    expect(lidAt("tiger.hull.hatch_lid", 1)?.name_cn).toBe("驾驶员舱盖");
    expect(lidAt("tiger.hull.fuel_cap", 1)?.key).toBe("tiger.hull.fuel_cap_lid#1");
    expect(lidAt("tiger.turret.loader_hatch", undefined)?.kind).toBe("turret");
  });

  it("前舱盖默认开启，点击合上后绕铰链落回甲板", () => {
    const built = build();
    resetTigerLidPose();
    pose(built, "idle", {});
    const openTop = topOf(built, "tiger.hull.hatch_lid");
    expect(openTop).toBeGreaterThan(1.4);

    pose(built, "idle", { "tiger.hull.hatch_lid#0": false, "tiger.hull.hatch_lid#1": false });
    const closedTop = topOf(built, "tiger.hull.hatch_lid");
    expect(closedTop).toBeLessThan(1.2);
    expect(openTop - closedTop).toBeGreaterThan(0.3);
  });

  it("装填手/车长塔顶盖开启后立起，露出炮塔顶甲板真开口", () => {
    const built = build();
    resetTigerLidPose();
    pose(built, "idle", {});
    expect(topOf(built, "tiger.turret.loader_hatch")).toBeLessThan(1.9);
    const cupolaClosed = topOf(built, "tiger.turret.cupola_hatch");
    expect(cupolaClosed).toBeLessThan(2.1);

    pose(built, "idle", {
      "tiger.turret.loader_hatch#0": true,
      "tiger.turret.cupola_hatch#0": true,
    });
    expect(topOf(built, "tiger.turret.loader_hatch")).toBeGreaterThan(1.95);
    expect(topOf(built, "tiger.turret.cupola_hatch")).toBeGreaterThan(cupolaClosed + 0.2);
  });

  it("炮塔瞄准强制关前舱盖；加油状态强制开加油口盖", () => {
    const aiming: TigerLidSpec = TIGER_LIDS[0]!;
    const fuel: TigerLidSpec = TIGER_LIDS.find((lid) => lid.kind === "fuel")!;
    expect(effectiveLidOpen(aiming, { [aiming.key]: true }, "aiming")).toBe(false);
    expect(effectiveLidOpen(fuel, { [fuel.key]: false }, "refuel")).toBe(true);

    const built = build();
    resetTigerLidPose();
    pose(built, "aiming", { "tiger.hull.hatch_lid#0": true, "tiger.hull.hatch_lid#1": true });
    expect(topOf(built, "tiger.hull.hatch_lid")).toBeLessThan(1.2);

    resetTigerLidPose();
    pose(built, "refuel", { "tiger.hull.fuel_cap_lid#0": false, "tiger.hull.fuel_cap_lid#1": false });
    const fuelTop = topOf(built, "tiger.hull.fuel_cap_lid");
    expect(fuelTop).toBeGreaterThan(1.25);
  });

  it("开合是逐帧缓动，不是瞬切", () => {
    const built = build();
    resetTigerLidPose();
    const start = topOf(built, "tiger.turret.loader_hatch");
    applyTigerLidPose(built, "idle", { "tiger.turret.loader_hatch#0": true }, 0.1);
    built.root.updateMatrixWorld(true);
    const first = topOf(built, "tiger.turret.loader_hatch");
    expect(first).toBeGreaterThan(start);
    expect(first).toBeLessThan(start + 0.2);
    pose(built, "idle", { "tiger.turret.loader_hatch#0": true }, 40);
    expect(topOf(built, "tiger.turret.loader_hatch")).toBeGreaterThan(1.95);
  });
});
