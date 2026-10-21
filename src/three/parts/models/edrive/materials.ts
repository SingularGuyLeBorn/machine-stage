import type { ModelRegistry } from "../../registry/types";
import { MBT_MATERIALS } from "../mbt/materials";

// ED-90 电驱材质：电池壳/电芯/铜排/橙色高压线/碳化硅/冷却液/热失控火焰。
export const EDRIVE_MATERIALS: ModelRegistry["materials"] = {
  ...MBT_MATERIALS,
  ed_battery_shell: { base: "#3c4247", metalness: 0.65, roughness: 0.5, preset: "steel_rough", envMapIntensity: 0.9 },
  ed_cell: { base: "#2d4d63", metalness: 0.42, roughness: 0.32, preset: "steel", clearcoat: 0.5, envMapIntensity: 1.0 },
  ed_cell_terminal: { base: "#b67845", metalness: 0.9, roughness: 0.28, preset: "steel", envMapIntensity: 1.2 },
  ed_busbar: { base: "#b8783e", metalness: 0.95, roughness: 0.25, preset: "steel", envMapIntensity: 1.25 },
  ed_hv_orange: { base: "#d5611f", metalness: 0.12, roughness: 0.55, preset: "primer", envMapIntensity: 0.8 },
  ed_hv_glow: { base: "#ff8a2a", metalness: 0.2, roughness: 0.35, emissive: "#ff5a00", emissiveIntensity: 0.9, preset: "none", envMapIntensity: 0.5 },
  ed_connector: { base: "#20252a", metalness: 0.25, roughness: 0.62, preset: "rubber", envMapIntensity: 0.5 },
  ed_sic: { base: "#1f3a4d", metalness: 0.72, roughness: 0.3, preset: "steel", envMapIntensity: 1.1 },
  ed_pcb: { base: "#1d3a2a", metalness: 0.15, roughness: 0.7, preset: "none", envMapIntensity: 0.5 },
  ed_coolant: { base: "#2e7f86", metalness: 0.1, roughness: 0.55, preset: "rubber", envMapIntensity: 0.6 },
  ed_charge: { base: "#3fd07a", metalness: 0.2, roughness: 0.35, emissive: "#16a34a", emissiveIntensity: 0.7, preset: "none", envMapIntensity: 0.5 },
  ed_gauge_face: { base: "#10161c", metalness: 0.3, roughness: 0.16, preset: "none", envMapIntensity: 1.0 },
  ed_gauge_needle: { base: "#ff7a1a", metalness: 0.4, roughness: 0.35, emissive: "#ff5a00", emissiveIntensity: 0.5, preset: "none", envMapIntensity: 0.6 },
  ed_fire: { base: "#ff8a1e", metalness: 0.0, roughness: 0.4, emissive: "#ff4d00", emissiveIntensity: 2.2, opacity: 0.9, preset: "none", envMapIntensity: 0.3 },
  ed_smoke: { base: "#787a78", metalness: 0.0, roughness: 0.95, opacity: 0.42, preset: "rubber", envMapIntensity: 0.2 },
  ed_livery: { base: "#2c7a7b", metalness: 0.18, roughness: 0.5, emissive: "#0d3b3c", emissiveIntensity: 0.18, preset: "primer", envMapIntensity: 0.7 },
  ed_arc: { base: "#7ee8ff", metalness: 0.0, roughness: 0.2, emissive: "#38d9ff", emissiveIntensity: 3.0, preset: "none", envMapIntensity: 0.2 },
  ed_warning: { base: "#e8a11a", metalness: 0.2, roughness: 0.5, preset: "primer", envMapIntensity: 0.7 },
};
