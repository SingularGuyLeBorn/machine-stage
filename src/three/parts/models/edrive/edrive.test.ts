import { describe, expect, it } from "vitest";
import { buildModel } from "../../assembler/assembler";
import { validateRegistry } from "../../registry/validate";
import { detectFloatingIslands, detectUnsupportedParts } from "../../solver/support";
import { EDRIVE_TELEMETRY, animateEdrive, edriveReadouts } from "./motion";
import { edriveBuilders, makeEdriveLayouts, makeEdriveRegistry } from "./registry";

function build() {
  return buildModel(makeEdriveRegistry(), {
    builders: edriveBuilders,
    instanceLayouts: makeEdriveLayouts(),
    warnMissingLayout: false,
  });
}

describe("ED-90 电驱坦克", () => {
  it("注册表通过校验，800+ 定义件，柴油机/机械变速箱全部移除", () => {
    const registry = makeEdriveRegistry();
    expect(validateRegistry(registry).filter((issue) => issue.level === "error")).toHaveLength(0);
    expect(registry.parts.length).toBeGreaterThanOrEqual(800);
    expect(registry.parts.some((part) => part.id.startsWith("ed90.engine."))).toBe(false);
    expect(registry.parts.some((part) => part.id.startsWith("ed90.transmission."))).toBe(false);
    expect(registry.parts.some((part) => part.id === "ed90.hull.exhaust_grille")).toBe(false);
  });

  it("6 组动力电池包：每包 3 模组 ×12 芯 + BMS + 液冷板 + 防爆阀", () => {
    const built = build();
    try {
      expect(built.getPart("ed90.battery.pack1_cells")!.instances).toHaveLength(36);
      expect(built.getPart("ed90.battery.pack6_cells")!.instances).toHaveLength(36);
      for (let p = 1; p <= 6; p++) {
        expect(built.getPart(`ed90.battery.pack${p}_bms_master`)).toBeDefined();
        expect(built.getPart(`ed90.battery.pack${p}_vent`)).toBeDefined();
        expect(built.getPart(`ed90.battery.pack${p}_mod2_cooling_plate`)).toBeDefined();
      }
      const cells = built.parts
        .filter((part) => part.partId.includes(".battery.pack") && part.partId.endsWith("_cells"))
        .reduce((sum, part) => sum + part.instances.length, 0);
      expect(cells).toBe(216);
    } finally {
      built.dispose();
    }
  });

  it("双驱动电机逐件：定子/转子/磁钢/线圈/旋变/减速器 + 左右独立节点", () => {
    const built = build();
    try {
      for (const tag of ["l", "r"]) {
        expect(built.getPart(`ed90.motor.${tag}_stator_core`)).toBeDefined();
        expect(built.getPart(`ed90.motor.${tag}_rotor_core`)!.node).toBe(tag === "l" ? "ED_Motor_L" : "ED_Motor_R");
        expect(built.getPart(`ed90.motor.${tag}_magnets`)!.instances).toHaveLength(8);
        expect(built.getPart(`ed90.motor.${tag}_coils`)!.instances).toHaveLength(12);
        expect(built.getPart(`ed90.motor.${tag}_reduction_housing`)).toBeDefined();
      }
      expect(built.getNode("ED_Motor_L")).toBeDefined();
      expect(built.getNode("ED_Motor_R")).toBeDefined();
    } finally {
      built.dispose();
    }
  });

  it("电控/高压/快充/冷却/电驱仪表齐全", () => {
    const built = build();
    try {
      for (const id of [
        "ed90.inverter.l_housing",
        "ed90.inverter.r_power_modules",
        "ed90.power.hvjb_housing",
        "ed90.power.vcu_housing",
        "ed90.power.obc_housing",
        "ed90.power.dcdc_housing",
        "ed90.hv.cable_pack1_pos",
        "ed90.body.charge_port_housing",
        "ed90.cooling.radiator",
        "ed90.cooling.pump",
        "ed90.cockpit.soc_face",
        "ed90.cockpit.rpm_l_face",
      ]) {
        expect(built.getPart(id), id).toBeDefined();
      }
      expect(built.getPart("ed90.hv.cable_motor_r_phase3")).toBeDefined();
      expect(built.getPart("ed90.power.battery_12v")).toBeDefined();
    } finally {
      built.dispose();
    }
  });

  it("零悬空 / 零孤岛（支持连通性）", () => {
    const built = build();
    try {
      expect(detectUnsupportedParts(built, { maxGapM: 0.02 })).toHaveLength(0);
      const islands = detectFloatingIslands(built, { maxGapM: 0.02 });
      expect(islands.islands).toHaveLength(0);
      expect(islands.islandInstances).toBe(0);
    } finally {
      built.dispose();
    }
  });

  it("静音行驶：双电机转动、履带滚动、没有发动机/排气", () => {
    const built = build();
    try {
      animateEdrive(built, 0.5, "silent_drive");
      const left = built.getNode("ED_Motor_L")!;
      const right = built.getNode("ED_Motor_R")!;
      expect(Math.abs(left.rotation.x)).toBeGreaterThan(0.1);
      expect(Math.abs(right.rotation.x)).toBeGreaterThan(0.1);
      expect(built.registry.parts.some((part) => part.id.startsWith("ed90.engine."))).toBe(false);
      expect(built.registry.parts.some((part) => part.id.includes("exhaust_grille"))).toBe(false);
      expect(EDRIVE_TELEMETRY.mode).toBe("静音行驶");
      expect(EDRIVE_TELEMETRY.noiseDb).toBeLessThanOrEqual(42);
    } finally {
      built.dispose();
    }
  });

  it("瞬时加速：1200kW / 5200rpm，双电机同速", () => {
    const built = build();
    try {
      animateEdrive(built, 1, "boost");
      expect(EDRIVE_TELEMETRY.powerKw).toBe(1200);
      expect(EDRIVE_TELEMETRY.rpmL).toBe(5200);
      expect(EDRIVE_TELEMETRY.rpmR).toBe(5200);
      expect(EDRIVE_TELEMETRY.mode).toBe("瞬时扭矩");
      expect(built.root.rotation.y).toBe(0);
    } finally {
      built.dispose();
    }
  });

  it("电动差速转向：左右电机转速相反/不同，车体偏航", () => {
    const built = build();
    try {
      animateEdrive(built, 1, "e_steer_left");
      const left = built.getNode("ED_Motor_L")!;
      const right = built.getNode("ED_Motor_R")!;
      expect(Math.abs(left.rotation.x - right.rotation.x)).toBeGreaterThan(0.5);
      expect(built.root.rotation.y).toBeLessThan(0);
      expect(EDRIVE_TELEMETRY.rpmL).toBeLessThan(EDRIVE_TELEMETRY.rpmR);
      animateEdrive(built, 1, "e_steer_right");
      expect(built.root.rotation.y).toBeGreaterThan(0);
      expect(EDRIVE_TELEMETRY.rpmR).toBeLessThan(EDRIVE_TELEMETRY.rpmL);
    } finally {
      built.dispose();
    }
  });

  it("能量回收：回收功率为负、电量上升、回收光带亮起", () => {
    const built = build();
    try {
      animateEdrive(built, 0.5, "regen");
      const before = EDRIVE_TELEMETRY.soc;
      animateEdrive(built, 5, "regen");
      expect(EDRIVE_TELEMETRY.powerKw).toBeLessThan(0);
      expect(EDRIVE_TELEMETRY.soc).toBeGreaterThan(before);
      expect(built.getPart("ed90.fx.regen_glow_l")!.object.visible).toBe(true);
    } finally {
      built.dispose();
    }
  });

  it("快充：充电桩/电缆可见、装甲盖打开、电量爬升", () => {
    const built = build();
    try {
      animateEdrive(built, 1, "charging");
      const before = EDRIVE_TELEMETRY.soc;
      animateEdrive(built, 8, "charging");
      expect(built.getPart("ed90.fx.charger_post")!.object.visible).toBe(true);
      expect(built.getPart("ed90.fx.charge_cable")!.object.visible).toBe(true);
      expect(built.getNode("ED_ChargeFlap")!.rotation.z).toBeLessThan(-0.5);
      expect(EDRIVE_TELEMETRY.powerKw).toBeGreaterThan(0);
      expect(EDRIVE_TELEMETRY.soc).toBeGreaterThan(before);
    } finally {
      built.dispose();
    }
  });

  it("电池受击 → 热失控：火球/烟/火星、Pack 5 顶部泄压、温度飙升", () => {
    const built = build();
    try {
      animateEdrive(built, 2, "battery_hit");
      expect(built.getPart("ed90.fx.battery_fire")!.object.visible).toBe(true);
      expect(built.getPart("ed90.fx.battery_smoke")!.object.visible).toBe(true);
      expect(built.getPart("ed90.battery.pack5_shell_top")!.object.visible).toBe(false);
      expect(EDRIVE_TELEMETRY.tempC).toBeGreaterThan(100);
      expect(EDRIVE_TELEMETRY.mode).toBe("电池热失控");
    } finally {
      built.dispose();
    }
  });

  it("电驱读数：电量/母线/功率/双电机/电池温度/模式", () => {
    const built = build();
    try {
      animateEdrive(built, 0.2, "idle");
      const readouts = edriveReadouts();
      expect(readouts.map((item) => item.label)).toEqual(["电量", "母线", "功率", "电机L/R", "电池温度", "模式"]);
      expect(readouts.find((item) => item.label === "母线")?.value).toBe("800V");
      expect(readouts.find((item) => item.label === "电量")?.value).toMatch(/%$/);
    } finally {
      built.dispose();
    }
  });
});
