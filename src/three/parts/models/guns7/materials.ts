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
  base: "#1c2027",
  metalness: 0.9,
  roughness: 0.3,
  preset: "steel",
  repeat: [3, 3],
  envMapIntensity: 1.25,
};

const BLUED_WEAR: MaterialSpec = {
  base: "#343a43",
  metalness: 0.88,
  roughness: 0.4,
  preset: "steel_rough",
  repeat: [3, 3],
  envMapIntensity: 1.1,
};

const PHOSPHATE: MaterialSpec = {
  base: "#3f443f",
  metalness: 0.78,
  roughness: 0.58,
  preset: "steel_rough",
  repeat: [3, 3],
  envMapIntensity: 0.9,
};

const PHOSPHATE_GREEN: MaterialSpec = {
  base: "#4b5447",
  metalness: 0.7,
  roughness: 0.62,
  preset: "steel_rough",
  repeat: [3, 3],
  envMapIntensity: 0.85,
};

const PARKERIZED: MaterialSpec = {
  base: "#4d5153",
  metalness: 0.76,
  roughness: 0.55,
  preset: "steel_rough",
  repeat: [2, 2],
  envMapIntensity: 0.95,
};

const MACHINED: MaterialSpec = {
  base: "#aeb4bb",
  metalness: 0.94,
  roughness: 0.24,
  preset: "steel",
  repeat: [2, 2],
  envMapIntensity: 1.35,
};

const WEAR_EDGE: MaterialSpec = {
  base: "#889095",
  metalness: 0.9,
  roughness: 0.34,
  preset: "steel",
  repeat: [2, 2],
  envMapIntensity: 1.15,
};

const SPRING_STEEL: MaterialSpec = {
  base: "#5a5f63",
  metalness: 0.82,
  roughness: 0.44,
  preset: "steel_rough",
  repeat: [2, 2],
  envMapIntensity: 1,
};

const BRASS_CASE: MaterialSpec = {
  base: "#b88935",
  metalness: 0.92,
  roughness: 0.3,
  preset: "steel",
  repeat: [2, 2],
  envMapIntensity: 1.3,
};

const BRASS_TARNISH: MaterialSpec = {
  base: "#8e6b2d",
  metalness: 0.86,
  roughness: 0.45,
  preset: "steel_rough",
  repeat: [2, 2],
  envMapIntensity: 1.05,
};

const COPPER_JACKET: MaterialSpec = {
  base: "#9e6035",
  metalness: 0.92,
  roughness: 0.32,
  preset: "steel",
  repeat: [1, 1],
  envMapIntensity: 1.2,
};

const LEAD_CORE: MaterialSpec = {
  base: "#7c838d",
  metalness: 0.55,
  roughness: 0.58,
  preset: "steel_rough",
  repeat: [1, 1],
};

const STEEL_CORE: MaterialSpec = {
  base: "#a6adb4",
  metalness: 0.95,
  roughness: 0.26,
  preset: "steel",
  repeat: [1, 1],
  envMapIntensity: 1.25,
};

const PROPELLANT: MaterialSpec = {
  base: "#2f2a20",
  metalness: 0.05,
  roughness: 0.95,
  preset: "none",
};

const PRIMER: MaterialSpec = {
  base: "#c7a24d",
  metalness: 0.9,
  roughness: 0.38,
  preset: "steel",
  repeat: [1, 1],
};

const WOOD_T38: MaterialSpec = {
  base: "#6e3f20",
  metalness: 0.02,
  roughness: 0.62,
  preset: "wood",
  repeat: [2, 1.5],
  clearcoat: 0.08,
  clearcoatRoughness: 0.6,
};

const WOOD_AK: MaterialSpec = {
  base: "#7c4a25",
  metalness: 0.02,
  roughness: 0.66,
  preset: "wood",
  repeat: [2, 1.5],
};

const WOOD_WORN: MaterialSpec = {
  base: "#94613a",
  metalness: 0.03,
  roughness: 0.38,
  preset: "wood",
  repeat: [1.5, 1.5],
  envMapIntensity: 1.15,
};

const BAKELITE: MaterialSpec = {
  base: "#3a2620",
  metalness: 0.12,
  roughness: 0.42,
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
  base: "#4e5440",
  metalness: 0.45,
  roughness: 0.62,
  preset: "armor",
  repeat: [2, 2],
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
  base: "#6c7178",
  metalness: 0.85,
  roughness: 0.5,
  preset: "steel_rough",
  repeat: [2, 2],
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
