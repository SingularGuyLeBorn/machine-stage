import { describe, expect, it } from "vitest";
import {
  CARRIER_WALK_CONFIG,
  CARRIER_WALK_LIGHTS,
  MBT_WALK_CONFIG,
  TIGER_WALK_CONFIG,
  TYPE055_WALK_CONFIG,
  TYPE055_WALK_LIGHTS,
  areaFloorAt,
  isInsideArea,
} from "./walk";

const config = CARRIER_WALK_CONFIG;

describe("福建舰 · 第一人称漫游配置", () => {
  it("每个区域都有出生点，且出生点在可行走边界内", () => {
    for (const area of Object.values(config.areas)) {
      expect(Number.isFinite(area.spawn.yaw)).toBe(true);
      expect(isInsideArea(area, area.spawn.pos[0], area.spawn.pos[2]), `${area.id} spawn`).toBe(true);
      expect(Number.isFinite(areaFloorAt(area, area.spawn.pos[0], area.spawn.pos[2]))).toBe(true);
    }
    expect(isInsideArea(config.areas.deck!, 1.6, -1.0)).toBe(true);
    // 舷缘外不可站立
    expect(isInsideArea(config.areas.deck!, 6.5, 0)).toBe(false);
  });

  it("交互 ID 唯一，目标区域与落点合法", () => {
    const ids = new Set<string>();
    for (const interaction of config.interactions) {
      expect(ids.has(interaction.id), `duplicate ${interaction.id}`).toBe(false);
      ids.add(interaction.id);
      expect(config.areas[interaction.area], `${interaction.id} area`).toBeDefined();
      if (interaction.targetArea) {
        const target = config.areas[interaction.targetArea];
        expect(target, `${interaction.id} target`).toBeDefined();
        expect(interaction.targetPos, `${interaction.id} targetPos`).toBeDefined();
        expect(
          isInsideArea(target!, interaction.targetPos![0], interaction.targetPos![2]),
          `${interaction.id} target inside ${interaction.targetArea}`,
        ).toBe(true);
      }
      expect(interaction.radius).toBeGreaterThan(0);
      expect(interaction.label.length).toBeGreaterThan(0);
    }
  });

  it("交互种类覆盖传送/防火门/拦阻网/挡焰板/上下飞机，且数量足够", () => {
    const kinds = new Set(config.interactions.map((item) => item.kind));
    for (const kind of ["portal", "doors", "barrier", "jbd", "mount", "dismount"] as const) {
      expect(kinds.has(kind), kind).toBe(true);
    }
    expect(config.interactions.length).toBeGreaterThanOrEqual(20);
    expect(config.interactions.filter((item) => item.kind === "portal").length).toBeGreaterThanOrEqual(10);
  });

  it("甲板出生高度跟随上翘弧面，室内区域配有补光", () => {
    const deck = config.areas.deck!;
    expect(areaFloorAt(deck, 1.6, -1.0)).toBeLessThan(areaFloorAt(deck, 1.6, 20.4));
    for (const id of ["hangar", "engine_room", "reactor_room", "bridge", "cic", "crew", "magazine", "workshop"]) {
      expect(CARRIER_WALK_LIGHTS[id]?.length ?? 0, id).toBeGreaterThan(0);
    }
  });
});

describe("055 · 第一人称漫游配置", () => {
  const ddg = TYPE055_WALK_CONFIG;
  it("区域出生点合法，跨区落点合法", () => {
    for (const area of Object.values(ddg.areas)) {
      expect(isInsideArea(area, area.spawn.pos[0], area.spawn.pos[2]), `${area.id} spawn`).toBe(true);
      expect(Number.isFinite(areaFloorAt(area, area.spawn.pos[0], area.spawn.pos[2]))).toBe(true);
    }
    for (const interaction of ddg.interactions) {
      expect(ddg.areas[interaction.area], interaction.id).toBeDefined();
      if (!interaction.targetArea) continue;
      const target = ddg.areas[interaction.targetArea]!;
      expect(target, `${interaction.id} target`).toBeDefined();
      expect(
        isInsideArea(target, interaction.targetPos![0], interaction.targetPos![2]),
        `${interaction.id} target inside ${interaction.targetArea}`,
      ).toBe(true);
    }
    expect(ddg.interactions.length).toBeGreaterThanOrEqual(15);
    expect(ddg.interactions.some((item) => item.kind === "mount")).toBe(true);
    for (const id of ["bridge", "cic", "engine_room", "hangar", "crew", "magazine", "workshop"]) {
      expect(TYPE055_WALK_LIGHTS[id]?.length ?? 0, id).toBeGreaterThan(0);
    }
  });
});

describe("坦克 · 第一人称漫游配置", () => {
  for (const [name, config] of [
    ["虎式", TIGER_WALK_CONFIG],
    ["MBT-90/ED-90", MBT_WALK_CONFIG],
  ] as const) {
    it(`${name}：车外/驾驶席/车长塔/车顶出生点与上下车落点合法`, () => {
      for (const area of Object.values(config.areas)) {
        expect(isInsideArea(area, area.spawn.pos[0], area.spawn.pos[2]), `${area.id} spawn`).toBe(true);
        expect(Array.from(Object.keys(config.areas))).toContain(config.spawnArea);
      }
      for (const interaction of config.interactions) {
        expect(config.areas[interaction.area], interaction.id).toBeDefined();
        if (!interaction.targetArea) continue;
        const target = config.areas[interaction.targetArea]!;
        expect(
          isInsideArea(target, interaction.targetPos![0], interaction.targetPos![2]),
          `${interaction.id} target`,
        ).toBe(true);
      }
      expect(config.interactions.filter((item) => item.kind === "portal" || item.kind === "mount").length).toBeGreaterThanOrEqual(3);
      expect(config.interactions.filter((item) => item.kind === "dismount").length).toBeGreaterThanOrEqual(3);
    });
  }
});
