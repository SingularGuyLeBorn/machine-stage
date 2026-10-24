import { afterAll, describe, expect, it } from "vitest";
import { buildModel } from "@/three/parts/assembler/assembler";
import { detectStatic } from "@/three/parts/solver/detect";
import { detectFloatingIslands, detectUnsupportedParts } from "@/three/parts/solver/support";
import { partitionExpectedContacts } from "@/three/parts/solver/whitelist";
import { makeType055Layouts, makeType055Registry, TYPE055_BUILDERS } from "./registry";
import { MISSILES, VLS, VLS_HEROES, vlsCells } from "./vls";

const registry = makeType055Registry();
const built = buildModel(registry, {
  builders: TYPE055_BUILDERS,
  instanceLayouts: makeType055Layouts(),
  warnMissingLayout: false,
});

afterAll(() => built.dispose());

describe("055 型驱逐舰", () => {
  it("舰体/112 VLS/主炮/相控阵/动力/机库都装出来了", () => {
    expect(built.parts.length).toBeGreaterThanOrEqual(1046);
    const hatchInstances = built.parts
      .filter((part) => part.partId === "type055.vls.hatch" || part.partId.startsWith("type055.vls.hatch_hero"))
      .reduce((sum, part) => sum + part.instances.length, 0);
    expect(hatchInstances).toBe(112);
    expect(built.getPart("type055.vls.hatch")!.instances.length).toBe(96);
    expect(built.getPart("type055.vls.tube")!.instances.length).toBe(112);
    expect(built.getPart("type055.radar.aesa_tiles")!.instances.length).toBe(256);
    expect(built.getNode("CV_055_Gun")).toBeDefined();
    expect(built.getNode("CV_055_Radar")).toBeDefined();
    expect(built.getNode("CV_055_PropL")).toBeDefined();
    expect(built.getNode("CV_055_VlsLid_fwd_2")).toBeDefined();
    expect(built.getNode("CV_055_VlsMissile_aft_4")).toBeDefined();
    expect(built.getPart("type055.radar.aesa_front")).toBeDefined();
    expect(built.getPart("type055.hangar.deck")).toBeDefined();
    expect(built.getPart("type055.surface.hull_number_r")).toBeDefined();
    expect(built.getPart("type055.hangar.z20_pad_main_blade_1")).toBeDefined();
    expect(built.getPart("type055.hangar.z20_hangar_l_cabin_upper")).toBeDefined();
    expect(built.getNode("CV_055_Z20_pad_MainRotor")).toBeDefined();
    expect(built.getNode("CV_055_HangarDoor_L")).toBeDefined();
    expect(built.getNode("CV_055_GT1_Rotor")).toBeDefined();
    expect(built.getPart("type055.power.gt1_rotor")).toBeDefined();
    expect(built.getPart("type055.vls.missile_fwd_3")).toBeDefined();
    expect(VLS_HEROES).toHaveLength(16);
    expect(built.getPart("type055.vls.hatch_hero_fwd_0")).toBeDefined();
    expect(built.getPart("type055.vls.hatch_hero_fwd_7")).toBeDefined();
    expect(built.getPart("type055.vls.flame_core_fwd_4")).toBeDefined();
    expect(built.getPart("type055.vls.trail_fwd_4")).toBeDefined();
    expect(built.getPart("type055.vls.flame_core_fwd_2")).toBeDefined();
    expect(built.getPart("type055.vls.fins_booster_fwd_4")).toBeDefined();
    expect(built.getPart("type055.vls.fins_glider_fwd_4")).toBeDefined();
    expect(built.getPart("type055.vls.gas_fwd_4")).toBeDefined();
    expect(built.getNode("CV_055_VlsGas_fwd_4")).toBeDefined();
    expect(built.getPart("type055.vls.module_dividers_fwd")).toBeDefined();
    expect(built.getPart("type055.power.er_exhaust_trunk_l")).toBeDefined();
    expect(built.getPart("type055.power.er_ceiling")).toBeDefined();
    expect(built.getPart("type055.power.er_rail_l")).toBeDefined();
    expect(built.getPart("type055.power.er_fire_bottles")).toBeDefined();
    expect(built.getPart("type055.hull.transom_ribs")).toBeDefined();
    expect(built.getPart("type055.interior.cic_foundation")).toBeDefined();
    expect(built.getPart("type055.interior.bridge_captain_chair")).toBeDefined();
    expect(built.getPart("type055.interior.cic_screen_c")).toBeDefined();
    expect(built.getPart("type055.interior.console_bridge_nav")).toBeDefined();
    expect(built.getPart("type055.interior.console_bridge_helm")).toBeDefined();
    expect(built.getPart("type055.interior.seat_cic_sonar")).toBeDefined();
    expect(built.getPart("type055.interior.deskitem_bridge_helm")).toBeDefined();
    expect(built.getPart("type055.interior.screen_bridge_weapons_3")).toBeDefined();
    // 生活区：走廊 + 水兵/士官/军官舱、餐厅/厨房/医务/健身，全部独立舱室
    for (const id of [
      "type055.interior.crew_corridor_eye",
      "type055.interior.crew_berth_eye",
      "type055.interior.crew_mess_eye",
      "type055.interior.crew_partitions",
      "type055.interior.crew_bunk_curtains",
      "type055.interior.crew_bunk_personal",
      "type055.interior.crew_ceiling_panels",
      "type055.interior.crew_figure_skin",
    ]) {
      expect(built.getPart(id), id).toBeDefined();
    }
    expect(built.getPart("type055.hull.stabilizer_l")).toBeDefined();
    expect(built.getPart("type055.vls.glider_fwd_4")).toBeDefined();
    expect(built.getNode("CV_055_VlsGlider_fwd_4")).toBeDefined();
    expect(built.getPart("type055.super.mast_mid")).toBeDefined();
    expect(built.getPart("type055.radar.iff_front")).toBeDefined();
    expect(built.getPart("type055.radar.cec_l_front")).toBeDefined();
    expect(built.getPart("type055.radar.ew_panel_r")).toBeDefined();
    expect(built.getPart("type055.hangar.door_l")).toBeDefined();
    const physical = built.parts.reduce((sum, part) => sum + part.instances.length, 0);
    expect(physical).toBeGreaterThanOrEqual(2281);
  });

  it("垂发与导弹按公开数据建模", () => {
    expect(vlsCells()).toHaveLength(112);
    expect(VLS.PITCH).toBeCloseTo(0.95, 3);
    expect(VLS.DEPTH).toBe(9);
    expect(MISSILES.hhq9b.length).toBeCloseTo(6.5, 2);
    expect(MISSILES.yj18.length).toBeCloseTo(8.0, 2);
    expect(MISSILES.yj21.length).toBeCloseTo(8.8, 2);
    expect(MISSILES.yj21.diameter).toBeCloseTo(0.82, 2);
    expect(built.getPart("type055.vls.missile_fwd_2")).toBeDefined();
    expect(built.getPart("type055.vls.missile_fwd_4")).toBeDefined();
  });

  it("零悬空 / 零悬空孤岛 / 静态未豁免 0", () => {
    const unsupported = detectUnsupportedParts(built, { maxGapM: 0.02 });
    expect(unsupported.map((row) => `${row.ref} ${row.gap_mm.toFixed(1)}mm`)).toEqual([]);
    const islands = detectFloatingIslands(built, { maxGapM: 0.02 });
    expect(islands.islands).toHaveLength(0);
    expect(islands.islandInstances).toBe(0);
    const split = partitionExpectedContacts(detectStatic(built, {}), registry.expectedContacts ?? []);
    expect(split.active.slice(0, 10).map(({ report }) => `${report.a} ↔ ${report.b}`)).toEqual([]);
  }, 120000);
});
