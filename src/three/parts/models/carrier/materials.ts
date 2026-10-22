import type { ModelRegistry } from "../../registry/types";

// ============================================================================
// models/carrier/materials —— 航母材质库
// 海军灰 / 飞行甲板防滑层 / 甲板标线 / 雷达透波罩 / 舰载机低可视度涂装。
// ============================================================================

export const CV_MATERIALS: ModelRegistry["materials"] = {
  cv_hull: { base: "#747d82", metalness: 1, roughness: 0.64, pbr: "plates", repeat: [6, 6], clearcoat: 0.22, clearcoatRoughness: 0.42, envMapIntensity: 1.15 },
  cv_hull_dark: { base: "#565f63", metalness: 1, roughness: 0.68, pbr: "plates", repeat: [5, 5], envMapIntensity: 1.05 },
  cv_hull_boot: { base: "#454b4e", metalness: 0.8, roughness: 0.8, pbr: "rust", repeat: [4, 3], envMapIntensity: 0.95 },
  cv_antifouling: { base: "#5a2f2a", metalness: 0.04, roughness: 0.88, preset: "primer", envMapIntensity: 0.5 },
  cv_deck: { base: "#4b504f", metalness: 0.12, roughness: 0.92, preset: "cast", envMapIntensity: 0.55 },
  cv_deck_plate: { base: "#3f4547", metalness: 0.15, roughness: 0.86, pbr: "scratched", repeat: [4, 4], envMapIntensity: 0.55 },
  cv_deck_line: { base: "#ddd8c9", metalness: 0.02, roughness: 0.78, preset: "primer", envMapIntensity: 0.6 },
  cv_deck_yellow: { base: "#d1a22f", metalness: 0.04, roughness: 0.7, preset: "primer", envMapIntensity: 0.65 },
  cv_deck_red: { base: "#8f332b", metalness: 0.05, roughness: 0.76, preset: "primer", envMapIntensity: 0.65 },
  cv_steel: { base: "#a7b0b4", metalness: 1, roughness: 0.4, pbr: "brushed", repeat: [2, 2], anisotropy: 0.85, envMapIntensity: 1.3 },
  cv_steel_dark: { base: "#626c71", metalness: 1, roughness: 0.54, pbr: "plates", repeat: [2, 2], envMapIntensity: 1.1 },
  cv_grate: { base: "#596367", metalness: 1, roughness: 0.74, pbr: "plates", repeat: [3, 3], envMapIntensity: 0.9 },
  cv_glass: { base: "#1b2b34", metalness: 0.5, roughness: 0.06, preset: "none", envMapIntensity: 1.9 },
  cv_bridge_glass: { base: "#b8d2dc", metalness: 0.1, roughness: 0.04, preset: "none", envMapIntensity: 1.2, opacity: 0.09, depthWrite: false, doubleSided: true },
  cv_canopy: { base: "#9fc3cf", metalness: 0.12, roughness: 0.05, preset: "none", envMapIntensity: 1.2, opacity: 0.22, depthWrite: false, doubleSided: true },
  cv_gauge_face: { base: "#0b1215", metalness: 0.08, roughness: 0.62, preset: "none", envMapIntensity: 0.35 },
  cv_gauge_mark: { base: "#d7e4e8", metalness: 0.05, roughness: 0.5, preset: "none", envMapIntensity: 0.5 },
  cv_screen: { base: "#0a1a1e", metalness: 0.05, roughness: 0.35, preset: "none", emissive: "#1f8f86", emissiveIntensity: 0.75, envMapIntensity: 0.4 },
  cv_mfd: { base: "#071417", metalness: 0.03, roughness: 0.42, preset: "none", emissive: "#1c6f74", emissiveIntensity: 0.38, envMapIntensity: 0.3 },
  cv_upholstery: { base: "#24343d", metalness: 0.0, roughness: 0.94, preset: "canvas", envMapIntensity: 0.35 },
  cv_chart: { base: "#cfc7ad", metalness: 0.02, roughness: 0.86, preset: "primer", envMapIntensity: 0.45 },
  cv_radar: { base: "#c8ced0", metalness: 0.2, roughness: 0.4, preset: "primer", envMapIntensity: 1.1 },
  cv_radar_dark: { base: "#596368", metalness: 0.35, roughness: 0.55, preset: "primer", envMapIntensity: 0.8 },
  cv_aesa: { base: "#354149", metalness: 0.18, roughness: 0.58, preset: "primer", envMapIntensity: 0.42 },
  cv_aesa_tile: { base: "#8a969c", metalness: 0.22, roughness: 0.42, preset: "primer", envMapIntensity: 0.55 },
  cv_aircraft: { base: "#98a2a6", metalness: 1, roughness: 0.46, pbr: "plates", repeat: [3, 3], clearcoat: 0.28, clearcoatRoughness: 0.38, envMapIntensity: 1.2 },
  cv_aircraft_dark: { base: "#5a6469", metalness: 1, roughness: 0.56, pbr: "plates", repeat: [3, 3], envMapIntensity: 1.05 },
  cv_aircraft_belly: { base: "#d2d8da", metalness: 1, roughness: 0.48, pbr: "plates", repeat: [3, 3], envMapIntensity: 1.1 },
  cv_cockpit: { base: "#2a3d46", metalness: 0.4, roughness: 0.08, preset: "none", envMapIntensity: 1.8 },
  cv_rubber: { base: "#171918", metalness: 0.02, roughness: 0.94, preset: "rubber", envMapIntensity: 0.35 },
  cv_brass: { base: "#d2b47a", metalness: 1, roughness: 0.32, pbr: "brushed", repeat: [1, 1], anisotropy: 0.7, envMapIntensity: 1.35 },
  cv_copper: { base: "#c99a76", metalness: 1, roughness: 0.36, pbr: "brushed", repeat: [1, 1], anisotropy: 0.6, envMapIntensity: 1.25 },
  cv_glow: { base: "#7fd8ff", metalness: 0.0, roughness: 0.3, emissive: "#3fb9ff", envMapIntensity: 0.6 },
  cv_warning: { base: "#d9a62f", metalness: 0.05, roughness: 0.7, emissive: "#4a2c00", envMapIntensity: 0.6 },
  cv_water: { base: "#41636e", metalness: 0.1, roughness: 0.25, preset: "none", envMapIntensity: 1.0 },
  cv_canvas: { base: "#5e6359", metalness: 0.0, roughness: 0.95, preset: "rubber", envMapIntensity: 0.4 },
};
