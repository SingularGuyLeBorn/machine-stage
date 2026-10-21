import type { ModelRegistry } from "../../registry/types";

// ============================================================================
// models/mbt/materials —— 整机材质库（各层共用，键前缀 mbt_）
// 现代主战坦克的质感分档：轧制钢 / 铸造钢 / 复合装甲 / ERA 钢盒 / 橡胶 /
// 光学玻璃 / 热像仪镜头 / 帆布 / 铜 / 铝 / 火药 / 涂装。
// ============================================================================

export const MBT_MATERIALS: ModelRegistry["materials"] = {
  mbt_paint: { base: "#4d5442", metalness: 0.1, roughness: 0.62, preset: "primer", clearcoat: 0.55, clearcoatRoughness: 0.3, envMapIntensity: 0.9 },
  mbt_paint_dark: { base: "#383e31", metalness: 0.1, roughness: 0.7, preset: "primer", envMapIntensity: 0.8 },
  mbt_paint_sand: { base: "#9b8a63", metalness: 0.08, roughness: 0.72, preset: "primer", envMapIntensity: 0.8 },
  mbt_steel: { base: "#8a9096", metalness: 0.88, roughness: 0.32, preset: "steel", envMapIntensity: 1.15 },
  mbt_steel_dark: { base: "#5b6167", metalness: 0.8, roughness: 0.48, preset: "steel_rough", envMapIntensity: 1 },
  mbt_cast: { base: "#6f757a", metalness: 0.64, roughness: 0.6, preset: "cast", envMapIntensity: 0.95 },
  mbt_cast_dark: { base: "#54595e", metalness: 0.6, roughness: 0.68, preset: "cast", envMapIntensity: 0.9 },
  mbt_alu: { base: "#c3c9ce", metalness: 0.78, roughness: 0.3, preset: "steel", envMapIntensity: 1.2 },
  mbt_copper: { base: "#a86a3e", metalness: 0.92, roughness: 0.36, preset: "steel", envMapIntensity: 1.2 },
  mbt_brass: { base: "#b28a42", metalness: 0.94, roughness: 0.3, preset: "steel", envMapIntensity: 1.3 },
  mbt_tungsten: { base: "#7d8288", metalness: 0.95, roughness: 0.22, preset: "steel", envMapIntensity: 1.35 },
  mbt_rubber: { base: "#1d1f1d", metalness: 0.02, roughness: 0.93, preset: "rubber", envMapIntensity: 0.45 },
  mbt_rubber_worn: { base: "#2a2a26", metalness: 0.02, roughness: 0.97, preset: "rubber", envMapIntensity: 0.4 },
  mbt_track: { base: "#3b3d3a", metalness: 0.72, roughness: 0.58, preset: "steel_rough", envMapIntensity: 0.95 },
  mbt_track_worn: { base: "#58564e", metalness: 0.75, roughness: 0.5, preset: "steel_rough", envMapIntensity: 1 },
  mbt_era: { base: "#4e5741", metalness: 0.24, roughness: 0.7, preset: "primer", envMapIntensity: 0.85 },
  mbt_era_steel: { base: "#383b32", metalness: 0.58, roughness: 0.56, preset: "steel_rough", envMapIntensity: 0.95 },
  mbt_explosive: { base: "#8a7a4e", metalness: 0.05, roughness: 0.9, preset: "rubber", envMapIntensity: 0.4 },
  mbt_ceramic: { base: "#a8a49a", metalness: 0.06, roughness: 0.82, preset: "cast", envMapIntensity: 0.7 },
  mbt_liner: { base: "#6a6557", metalness: 0.08, roughness: 0.88, preset: "primer", envMapIntensity: 0.6 },
  mbt_glass: { base: "#1d2a2d", metalness: 0.45, roughness: 0.08, preset: "none", envMapIntensity: 1.6 },
  mbt_optic: { base: "#20343e", metalness: 0.3, roughness: 0.04, preset: "none", envMapIntensity: 1.9 },
  mbt_thermal_lens: { base: "#3c4a3c", metalness: 0.5, roughness: 0.18, preset: "none", envMapIntensity: 1.4 },
  mbt_canvas: { base: "#565a46", metalness: 0.0, roughness: 0.94, preset: "rubber", envMapIntensity: 0.45 },
  mbt_seat: { base: "#3b352b", metalness: 0.02, roughness: 0.9, preset: "rubber", envMapIntensity: 0.4 },
  mbt_brass_ammo: { base: "#ab8a4f", metalness: 0.85, roughness: 0.35, preset: "steel", envMapIntensity: 1.2 },
  mbt_propellant: { base: "#3f3a2c", metalness: 0.02, roughness: 0.95, preset: "rubber", envMapIntensity: 0.35 },
  mbt_fluid: { base: "#7a5a1e", metalness: 0.1, roughness: 0.25, preset: "none", envMapIntensity: 0.9 },
  mbt_lamp: { base: "#d9dfd4", metalness: 0.3, roughness: 0.22, preset: "none", envMapIntensity: 1.5 },
  mbt_glow: { base: "#c8b06a", metalness: 0.5, roughness: 0.4, emissive: "#ff9a3c", envMapIntensity: 0.8 },
  mbt_flash: { base: "#ffe0a3", metalness: 0.0, roughness: 0.35, emissive: "#ffb347", envMapIntensity: 0.5 },
  mbt_fire: { base: "#ff7a2d", metalness: 0.0, roughness: 0.5, emissive: "#ff4a12", envMapIntensity: 0.5 },
  mbt_smoke: { base: "#7d7a72", metalness: 0.0, roughness: 1, envMapIntensity: 0.3 },
  mbt_debris: { base: "#4a473e", metalness: 0.55, roughness: 0.8, envMapIntensity: 0.7 },
  mbt_rust: { base: "#7a4b30", metalness: 0.25, roughness: 0.94, preset: "cast", envMapIntensity: 0.55 },
  mbt_mud: { base: "#4a3f2f", metalness: 0.0, roughness: 1, preset: "rubber", envMapIntensity: 0.3 },
  mbt_mark: { base: "#c9c2ad", metalness: 0.05, roughness: 0.9, preset: "primer", envMapIntensity: 0.5 },
  mbt_mark_red: { base: "#8b2f28", metalness: 0.05, roughness: 0.85, preset: "primer", envMapIntensity: 0.5 },
};
