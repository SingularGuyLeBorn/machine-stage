import type { MaterialSpec } from "../../kernel/textures";
import { GUN_MATERIALS } from "../guns/materials";

// ============================================================================
// models/guns7/materials —— 枪械线重做版共享材质
//
// 与旧 guns/ 的区别：这里把「表面处理」拆得更细——烤蓝、磷化、发黑、亮钢、
// 磨损棱边、木托、胶木、帆布、黄铜/铜被甲/铅芯/钢芯、火药、底火、枪口焰、
// 硝烟。每把枪只挑自己真实的那几款（不共用一套万能灰）。
// ============================================================================

const BLUED_DEEP: MaterialSpec = {
  base: "#d5dce4",
  metalness: 1,
  roughness: 0.2,
  preset: "steel",
  pbr: "brushed",
  anisotropy: 0.9,
  repeat: [3, 3],
  envMapIntensity: 1.8,
};

const BLUED_WEAR: MaterialSpec = {
  base: "#e2e8ef",
  metalness: 1,
  roughness: 0.24,
  preset: "steel_rough",
  pbr: "scratched",
  anisotropy: 0.5,
  repeat: [3, 3],
  envMapIntensity: 1.6,
};

const PHOSPHATE: MaterialSpec = {
  base: "#ccd2c6",
  metalness: 1,
  roughness: 0.5,
  preset: "steel_rough",
  pbr: "scratched",
  anisotropy: 0.25,
  repeat: [3, 3],
  envMapIntensity: 1.1,
};

const PHOSPHATE_GREEN: MaterialSpec = {
  base: "#cbd4c4",
  metalness: 1,
  roughness: 0.52,
  preset: "steel_rough",
  pbr: "plates",
  anisotropy: 0.15,
  repeat: [3, 3],
  envMapIntensity: 1.05,
};

const PARKERIZED: MaterialSpec = {
  base: "#c8cdd0",
  metalness: 1,
  roughness: 0.42,
  preset: "steel_rough",
  pbr: "scratched",
  anisotropy: 0.2,
  repeat: [2, 2],
  envMapIntensity: 1.35,
};

const MACHINED: MaterialSpec = {
  base: "#e2e6ea",
  metalness: 1,
  roughness: 0.2,
  preset: "steel",
  pbr: "brushed",
  anisotropy: 1,
  repeat: [2, 2],
  envMapIntensity: 1.5,
};

const WEAR_EDGE: MaterialSpec = {
  base: "#d8dde1",
  metalness: 1,
  roughness: 0.28,
  preset: "steel",
  pbr: "brushed",
  anisotropy: 0.7,
  repeat: [2, 2],
  envMapIntensity: 1.3,
};

const SPRING_STEEL: MaterialSpec = {
  base: "#c2c8ce",
  metalness: 1,
  roughness: 0.4,
  preset: "steel_rough",
  pbr: "scratched",
  anisotropy: 0.2,
  repeat: [2, 2],
  envMapIntensity: 1.15,
};

const BRASS_CASE: MaterialSpec = {
  base: "#e8b45c",
  metalness: 1,
  roughness: 0.24,
  pbrColor: false,
  preset: "steel",
  pbr: "brushed",
  anisotropy: 0.45,
  repeat: [2, 2],
  envMapIntensity: 1.4,
};

const BRASS_TARNISH: MaterialSpec = {
  base: "#b98f42",
  metalness: 1,
  roughness: 0.4,
  pbrColor: false,
  preset: "steel_rough",
  pbr: "scratched",
  anisotropy: 0.3,
  repeat: [2, 2],
  envMapIntensity: 1.2,
};

const COPPER_JACKET: MaterialSpec = {
  base: "#c9813f",
  metalness: 1,
  roughness: 0.28,
  pbrColor: false,
  preset: "steel",
  pbr: "brushed",
  anisotropy: 0.45,
  repeat: [1, 1],
  envMapIntensity: 1.35,
};

const LEAD_CORE: MaterialSpec = {
  base: "#c3cad2",
  metalness: 1,
  roughness: 0.5,
  preset: "steel_rough",
  pbr: "scratched",
  repeat: [1, 1],
  envMapIntensity: 1.15,
};

const STEEL_CORE: MaterialSpec = {
  base: "#e8ecef",
  metalness: 1,
  roughness: 0.22,
  preset: "steel",
  pbr: "brushed",
  anisotropy: 0.85,
  repeat: [1, 1],
  envMapIntensity: 1.35,
};

const PROPELLANT: MaterialSpec = {
  base: "#2f2a20",
  metalness: 0.05,
  roughness: 0.95,
  preset: "none",
};

const PRIMER: MaterialSpec = {
  base: "#e8c274",
  metalness: 1,
  roughness: 0.32,
  pbrColor: false,
  preset: "steel",
  pbr: "brushed",
  anisotropy: 0.4,
  repeat: [1, 1],
  envMapIntensity: 1.25,
};

const WOOD_T38: MaterialSpec = {
  base: "#e6d8c6",
  metalness: 0.0,
  roughness: 0.52,
  preset: "wood",
  pbr: "wood",
  normalScale: 0.7,
  repeat: [2, 2],
  envMapIntensity: 0.55,
  clearcoat: 0.1,
  clearcoatRoughness: 0.62,
};

const WOOD_AK: MaterialSpec = {
  base: "#e6d8c6",
  metalness: 0.0,
  roughness: 0.56,
  preset: "wood",
  pbr: "wood",
  normalScale: 0.7,
  repeat: [2, 2],
  envMapIntensity: 0.5,
};

const WOOD_WORN: MaterialSpec = {
  base: "#e0d2c0",
  metalness: 0.0,
  roughness: 0.44,
  preset: "wood",
  pbr: "wood",
  normalScale: 0.65,
  repeat: [1.5, 1.5],
  envMapIntensity: 0.6,
};

const BAKELITE: MaterialSpec = {
  base: "#4a3128",
  metalness: 0.08,
  roughness: 0.4,
  preset: "rubber",
  repeat: [2, 2],
  clearcoat: 0.35,
  clearcoatRoughness: 0.35,
};

const RUBBER_BLACK: MaterialSpec = {
  base: "#1d1f20",
  metalness: 0.04,
  roughness: 0.86,
  preset: "rubber",
  repeat: [2, 2],
};

const CANVAS_GREEN: MaterialSpec = {
  base: "#4c5138",
  metalness: 0.02,
  roughness: 0.92,
  preset: "cast",
  repeat: [4, 4],
};

const OLIVE_DRAB: MaterialSpec = {
  base: "#a8b08c",
  metalness: 1,
  roughness: 0.52,
  preset: "armor",
  pbr: "plates",
  anisotropy: 0.15,
  repeat: [2, 2],
  envMapIntensity: 1.1,
};

const CARBON_FOULING: MaterialSpec = {
  base: "#141518",
  metalness: 0.25,
  roughness: 0.94,
  preset: "cast",
  repeat: [3, 3],
};

const FLASH_CORE: MaterialSpec = {
  base: "#ffe5b0",
  metalness: 0,
  roughness: 1,
  preset: "none",
  emissive: "#ffcf7a",
  emissiveIntensity: 5.2,
  opacity: 0.96,
  doubleSided: true,
  blending: "additive",
  depthWrite: false,
};

const FLASH_PETAL: MaterialSpec = {
  base: "#ff9b45",
  metalness: 0,
  roughness: 1,
  preset: "none",
  emissive: "#ff6a1f",
  emissiveIntensity: 3.4,
  opacity: 0.72,
  doubleSided: true,
  blending: "additive",
  depthWrite: false,
};

const TRACER: MaterialSpec = {
  base: "#a03324",
  metalness: 0.3,
  roughness: 0.55,
  preset: "none",
  emissive: "#ff4d24",
  emissiveIntensity: 2.4,
  blending: "additive",
  depthWrite: false,
};

const SMOKE: MaterialSpec = {
  base: "#8c8f8d",
  metalness: 0,
  roughness: 1,
  preset: "none",
  opacity: 0.26,
  depthWrite: false,
};

const STEEL_SOFT: MaterialSpec = {
  base: "#c2c8ce",
  metalness: 1,
  roughness: 0.42,
  preset: "steel_rough",
  pbr: "scratched",
  anisotropy: 0.3,
  repeat: [2, 2],
  envMapIntensity: 1.2,
};

export const GUN7_MATERIALS: Record<string, MaterialSpec> = {
  ...GUN_MATERIALS,
  blued_deep: BLUED_DEEP,
  blued_wear: BLUED_WEAR,
  phosphate: PHOSPHATE,
  phosphate_green: PHOSPHATE_GREEN,
  parkerized: PARKERIZED,
  machined: MACHINED,
  wear_edge: WEAR_EDGE,
  spring_steel: SPRING_STEEL,
  brass_case: BRASS_CASE,
  brass_tarnish: BRASS_TARNISH,
  copper_jacket: COPPER_JACKET,
  lead_core: LEAD_CORE,
  steel_core: STEEL_CORE,
  propellant: PROPELLANT,
  primer: PRIMER,
  wood_t38: WOOD_T38,
  wood_ak: WOOD_AK,
  wood_worn: WOOD_WORN,
  bakelite: BAKELITE,
  rubber_black: RUBBER_BLACK,
  canvas_green: CANVAS_GREEN,
  olive_drab: OLIVE_DRAB,
  carbon_fouling: CARBON_FOULING,
  flash_core: FLASH_CORE,
  flash_petal: FLASH_PETAL,
  tracer: TRACER,
  smoke: SMOKE,
  steel_soft: STEEL_SOFT,
};
