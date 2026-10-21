import type { InstanceLayout } from "../../assembler/assembler";
import type { GeometryBuilder } from "../../assembler/geometry";
import type { ExpectedContactRule, ModelRegistry } from "../../registry/types";
import { makeMbtLayouts, makeMbtRegistry, mbtBuilders } from "../mbt/registry";
import { EDRIVE_MATERIALS } from "./materials";
import { ED_CONSTANTS } from "./constants";
import { makePowerRegistry, POWER_LAYOUTS } from "./power/registry";

// ============================================================================
// models/edrive/registry —— ED-90 电驱坦克整机
//
// 复用 MBT-90 的车体/炮塔/120mm 滑膛炮/自动装弹机/行动装置（ID 改为 ed90.*），
// 移除柴油机与机械变速箱，在原动力舱装入电池包/双电机/电控/高压/冷却。
// 运动仍复用 animateMbt 的底盘/炮塔逻辑，通过 ID 代理映射到 ed90。
// ============================================================================

const EXCLUDE_PREFIXES = ["ed90.engine.", "ed90.transmission."];
const EXCLUDE_IDS = new Set([
  "ed90.hull.exhaust_grille",
  "ed90.hull.fuel_drum_l",
  "ed90.hull.fuel_drum_r",
  "ed90.hull.fuel_cap",
]);

const EV_RENAMES: Record<string, { cn: string; en: string; material?: string }> = {
  "ed90.hull.engine_deck": { cn: "电池舱顶甲", en: "battery deck" },
  "ed90.hull.engine_grille_l": { cn: "电池舱冷却格栅（左）", en: "battery cooling grille left" },
  "ed90.hull.engine_grille_r": { cn: "电池舱冷却格栅（右）", en: "battery cooling grille right" },
};

function rekeyBase(registry: ModelRegistry): ModelRegistry {
  const mapId = (id: string) => id.replace(/^mbt90\./, "ed90.");
  return {
    ...registry,
    model: "ed90",
    parts: registry.parts.map((part) => {
      const id = mapId(part.id);
      const rename = EV_RENAMES[id];
      return {
        ...part,
        id,
        name_cn: rename?.cn ?? part.name_cn,
        name_en: rename?.en ?? part.name_en,
        material: rename?.material ?? part.material,
      };
    }),
    expectedContacts: (registry.expectedContacts ?? []).map((rule) => ({
      ...rule,
      a: mapId(rule.a),
      b: mapId(rule.b),
    })),
  };
}

function orderParts(parts: ModelRegistry["parts"]): ModelRegistry["parts"] {
  const sorted = [...parts].sort(
    (a, b) => a.build_layer - b.build_layer || a.build_order - b.build_order || a.id.localeCompare(b.id),
  );
  return sorted.map((part, index) => ({ ...part, build_order: 100 + index }));
}

export function makeEdriveRegistry(): ModelRegistry {
  const base = rekeyBase(makeMbtRegistry());
  const power = makePowerRegistry();
  const parts = [
    ...base.parts.filter(
      (part) => !EXCLUDE_PREFIXES.some((prefix) => part.id.startsWith(prefix)) && !EXCLUDE_IDS.has(part.id),
    ),
    ...power.parts,
  ];
  const usedAssemblies = new Set(parts.map((part) => part.assembly));
  const assemblies = [...base.assemblies, ...power.assemblies].filter((assembly) => usedAssemblies.has(assembly.id));
  const nodes = [...base.nodes, ...power.nodes];
  const expectedContacts: ExpectedContactRule[] = [
    ...(base.expectedContacts ?? []),
    ...(power.expectedContacts ?? []),
  ];
  return {
    model: "ed90",
    title: "ED-90 电驱坦克",
    subtitle: "6×800V 动力电池 / 双电机独立驱动 / 电控与快充 / 静音 · 瞬时扭矩 · 能量回收 · 热失控",
    source_notes:
      "ED-90 电驱坦克：复用 MBT-90 的车体/楔形炮塔/120mm 滑膛炮/转盘自动装弹机/液气悬挂/履带，" +
      "拆除柴油机与机械变速箱；后舱布置 6 组 800V 动力电池（3 模组 ×12 芯/包）、左右独立驱动电机、" +
      "SiC 逆变器、VCU/高压配电盒/车载充电机/DC-DC、橙色高压线束、液冷与快充口；电驱仪表替代转速/油量仪表。",
    constants: { ...base.constants, ...ED_CONSTANTS },
    assemblies,
    nodes,
    materials: EDRIVE_MATERIALS,
    parts: orderParts(parts),
    expectedContacts,
  };
}

export function makeEdriveLayouts(): Record<string, InstanceLayout> {
  return {
    ...makeMbtLayouts(),
    ...POWER_LAYOUTS,
  };
}

export const edriveBuilders: Record<string, GeometryBuilder> = mbtBuilders;
