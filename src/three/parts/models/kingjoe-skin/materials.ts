import type { MaterialSpec } from "../../kernel/textures";

// ============================================================================
// models/kingjoe-skin/materials —— 真实网格分件材质
// 哑光银灰 + 深色关节 + 彩虹胸；不做镜面塑料。
// 奥特曼 IP，个人参考，不做商用。
// ============================================================================

export const KINGJOE_SKIN_MATERIALS: Record<string, MaterialSpec> = {
  kjr_silver: {
    base: "#8e949a",
    metalness: 0.48,
    roughness: 0.58,
    preset: "steel_rough",
    repeat: [2, 2],
    envMapIntensity: 1.0,
  },
  kjr_silver_dark: {
    base: "#6a7178",
    metalness: 0.55,
    roughness: 0.6,
    preset: "steel_rough",
    repeat: [2, 2],
    envMapIntensity: 0.9,
  },
  kjr_dark: {
    base: "#343b42",
    metalness: 0.6,
    roughness: 0.55,
    preset: "steel_rough",
    repeat: [2, 2],
    envMapIntensity: 0.75,
  },
  kjr_black: {
    base: "#12161a",
    metalness: 0.4,
    roughness: 0.62,
    preset: "steel_rough",
    repeat: [2, 2],
    envMapIntensity: 0.5,
  },
  kjr_gold: {
    base: "#c7a45f",
    metalness: 0.96,
    roughness: 0.34,
    preset: "steel",
    repeat: [2, 2],
    envMapIntensity: 1.5,
  },
  kjr_visor: {
    base: "#08211e",
    metalness: 0.3,
    roughness: 0.24,
    emissive: "#4ef0c8",
    emissiveIntensity: 1.25,
    envMapIntensity: 0.7,
  },
  kjr_eye: {
    base: "#241a05",
    metalness: 0.35,
    roughness: 0.3,
    emissive: "#ffd35a",
    emissiveIntensity: 1.2,
    envMapIntensity: 0.6,
  },
  kjr_rainbow_teal: {
    base: "#062c2c",
    metalness: 0.25,
    roughness: 0.35,
    emissive: "#35e0c8",
    emissiveIntensity: 1.0,
  },
  kjr_rainbow_green: {
    base: "#102d0d",
    metalness: 0.25,
    roughness: 0.35,
    emissive: "#7be24d",
    emissiveIntensity: 1.0,
  },
  kjr_rainbow_blue: {
    base: "#0a1f3b",
    metalness: 0.25,
    roughness: 0.35,
    emissive: "#4f9dff",
    emissiveIntensity: 1.0,
  },
  kjr_rainbow_amber: {
    base: "#332006",
    metalness: 0.25,
    roughness: 0.35,
    emissive: "#ffb347",
    emissiveIntensity: 1.0,
  },
  kjr_rainbow_rose: {
    base: "#360b1f",
    metalness: 0.25,
    roughness: 0.35,
    emissive: "#ff5d92",
    emissiveIntensity: 1.0,
  },
  kjr_rainbow_violet: {
    base: "#231039",
    metalness: 0.25,
    roughness: 0.35,
    emissive: "#b47cff",
    emissiveIntensity: 1.0,
  },
};
