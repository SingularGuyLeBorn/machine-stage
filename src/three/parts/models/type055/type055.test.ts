import { afterAll, describe, expect, it } from "vitest";
import { buildModel } from "@/three/parts/assembler/assembler";
import { detectStatic } from "@/three/parts/solver/detect";
import { detectFloatingIslands, detectUnsupportedParts } from "@/three/parts/solver/support";
import { partitionExpectedContacts } from "@/three/parts/solver/whitelist";
import { makeType055Layouts, makeType055Registry, TYPE055_BUILDERS } from "./registry";

const registry = makeType055Registry();
const built = buildModel(registry, {
  builders: TYPE055_BUILDERS,
  instanceLayouts: makeType055Layouts(),
  warnMissingLayout: false,
});

afterAll(() => built.dispose());

describe("055 型驱逐舰", () => {
  it("舰体/112 VLS/主炮/相控阵/动力/机库都装出来了", () => {
    expect(built.parts.length).toBeGreaterThanOrEqual(600);
    const hatchInstances = built.parts
      .filter((part) => part.partId === "type055.vls.hatch" || part.partId.startsWith("type055.vls.hatch_hero"))
      .reduce((sum, part) => sum + part.instances.length, 0);
    expect(hatchInstances).toBe(112);
    expect(built.getPart("type055.vls.hatch")!.instances.length).toBe(106);
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
    expect(built.getPart("type055.hangar.door_l")).toBeDefined();
    const physical = built.parts.reduce((sum, part) => sum + part.instances.length, 0);
    expect(physical).toBeGreaterThanOrEqual(1700);
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
