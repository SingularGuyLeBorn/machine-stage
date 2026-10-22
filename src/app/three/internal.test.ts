import { describe, expect, it } from "vitest";
import { buildModel } from "@/three/parts";
import { edriveBuilders, makeEdriveLayouts, makeEdriveRegistry } from "@/three/parts/models/edrive/registry";
import { makeMbtLayouts, makeMbtRegistry, mbtBuilders } from "@/three/parts/models/mbt/registry";
import { isInternalPart, isXrayShellPart } from "./internal";
import { applyXray } from "./pose";

function build() {
  return buildModel(makeEdriveRegistry(), {
    builders: edriveBuilders,
    instanceLayouts: makeEdriveLayouts(),
    warnMissingLayout: false,
  });
}

function buildMbt() {
  return buildModel(makeMbtRegistry(), {
    builders: mbtBuilders,
    instanceLayouts: makeMbtLayouts(),
    warnMissingLayout: false,
  });
}

describe("内部件剔除 / 幽灵壳透视", () => {
  it("电池/电机/内饰算内部，充电口/散热器/泄压板/FX 算外部", () => {
    const built = build();
    try {
      expect(isInternalPart("ed90", built.getPart("ed90.battery.pack1_shell_bottom")!)).toBe(true);
      expect(isInternalPart("ed90", built.getPart("ed90.motor.l_stator_core")!)).toBe(true);
      expect(isInternalPart("ed90", built.getPart("ed90.cockpit.soc_face")!)).toBe(true);
      expect(isInternalPart("ed90", built.getPart("ed90.body.charge_port_housing")!)).toBe(false);
      expect(isInternalPart("ed90", built.getPart("ed90.cooling.radiator")!)).toBe(false);
      expect(isInternalPart("ed90", built.getPart("ed90.interior.blowout_l")!)).toBe(false);
      expect(isInternalPart("ed90", built.getPart("ed90.fx.charger_post")!)).toBe(false);
      expect(isInternalPart("tiger", built.getPart("ed90.battery.pack1_shell_bottom")!)).toBe(false);
    } finally {
      built.dispose();
    }
  });

  it("透视只克隆外壳材质，内部件材质不动；关闭后恢复", () => {
    const built = build();
    try {
      const shell = built.getPart("ed90.hull.floor")!;
      const battery = built.getPart("ed90.battery.pack1_shell_bottom")!;
      const shellMaterial = shell.object.material;
      const batteryMaterial = battery.object.material;
      applyXray(built, true, (handle) => !isInternalPart("ed90", handle));
      expect(shell.object.material).not.toBe(shellMaterial);
      expect((shell.object.material as { transparent?: boolean }).transparent).toBe(true);
      expect(battery.object.material).toBe(batteryMaterial);
      expect((battery.object.material as { transparent?: boolean }).transparent).toBe(false);
      applyXray(built, false);
      expect(shell.object.material).toBe(shellMaterial);
      expect(battery.object.material).toBe(batteryMaterial);
    } finally {
      built.dispose();
    }
  });

  it("MBT 发动机透视：机体/曲轴箱/缸套/缸盖/涡轮壳幽灵化，活塞/气门保持不透明", () => {
    const built = buildMbt();
    try {
      const block = built.getPart("mbt90.engine.bank_block_r")!;
      const crankcase = built.getPart("mbt90.engine.bearing_rail_r")!;
      const liner = built.getPart("mbt90.engine.cyl01_liner")!;
      const head = built.getPart("mbt90.engine.cyl01_head")!;
      const turbo = built.getPart("mbt90.engine.turbine_housing_r")!;
      const piston = built.getPart("mbt90.engine.cyl01_piston")!;
      const valve = built.getPart("mbt90.engine.cyl01_valve_i1")!;

      for (const shell of [block, crankcase, liner, head, turbo]) {
        expect(isXrayShellPart("mbt90", shell), shell.partId).toBe(true);
      }
      expect(isXrayShellPart("mbt90", piston)).toBe(false);
      expect(isXrayShellPart("mbt90", valve)).toBe(false);
      expect(isXrayShellPart("tiger", block)).toBe(false);

      const pistonMaterial = piston.object.material;
      applyXray(
        built,
        true,
        (handle) => !isInternalPart("mbt90", handle) || isXrayShellPart("mbt90", handle),
      );
      expect((block.object.material as { transparent?: boolean }).transparent).toBe(true);
      expect(piston.object.material).toBe(pistonMaterial);
      expect((piston.object.material as { transparent?: boolean }).transparent).toBe(false);
      applyXray(built, false);
    } finally {
      built.dispose();
    }
  });
});
