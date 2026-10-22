import { describe, expect, it } from "vitest";
import { buildModel } from "@/three/parts";
import { edriveBuilders, makeEdriveLayouts, makeEdriveRegistry } from "@/three/parts/models/edrive/registry";
import { isInternalPart } from "./internal";
import { applyXray } from "./pose";

function build() {
  return buildModel(makeEdriveRegistry(), {
    builders: edriveBuilders,
    instanceLayouts: makeEdriveLayouts(),
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
});
