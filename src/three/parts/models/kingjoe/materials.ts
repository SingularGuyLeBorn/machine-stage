import type { MaterialSpec } from "../../kernel/textures";

// ============================================================================
// models/kingjoe/materials —— 佩丹尼姆合金的皮
//
// 参考图口径：银色镜面但绝不是完美镜面（拉丝/机加工痕），金色环带偏旧，
// 黑色接缝里藏发光；胸口是彩色镶嵌（不是一块均匀发光板），
// 眼部是黄色百叶眼带，额头发射体是红色。
// ============================================================================

export const KINGJOE_MATERIALS: Record<string, MaterialSpec> = {
  silver: {
    base: "#cfd5da",
    metalness: 1,
    roughness: 0.17,
    preset: "steel",
    repeat: [2, 2],
    envMapIntensity: 1.55,
  },
  silver_bright: {
    base: "#eef1f3",
    metalness: 1,
    roughness: 0.07,
    preset: "steel",
    repeat: [1.5, 1.5],
    envMapIntensity: 1.8,
  },
  silver_dark: {
    base: "#99a2aa",
    metalness: 1,
    roughness: 0.3,
    preset: "steel_rough",
    repeat: [2, 2],
    envMapIntensity: 1.3,
  },
  silver_worn: {
    base: "#b6bdc4",
    metalness: 1,
    roughness: 0.26,
    preset: "steel_rough",
    repeat: [3, 3],
    envMapIntensity: 1.35,
  },
  gold: {
    base: "#b58a45",
    metalness: 1,
    roughness: 0.27,
    preset: "steel",
    repeat: [2, 2],
    envMapIntensity: 1.4,
  },
  gold_dark: {
    base: "#8d6a35",
    metalness: 1,
    roughness: 0.36,
    preset: "steel_rough",
    repeat: [2, 2],
    envMapIntensity: 1.2,
  },
  black_metal: {
    base: "#191d21",
    metalness: 0.8,
    roughness: 0.42,
    preset: "steel_rough",
    repeat: [2, 2],
    envMapIntensity: 0.9,
  },
  joint_steel: {
    base: "#59626b",
    metalness: 0.95,
    roughness: 0.34,
    preset: "steel",
    repeat: [2, 2],
    envMapIntensity: 1.2,
  },
  rubber: {
    base: "#0e1114",
    metalness: 0.05,
    roughness: 0.92,
    preset: "rubber",
    repeat: [2, 2],
    envMapIntensity: 0.5,
  },
  copper: {
    base: "#9b6337",
    metalness: 1,
    roughness: 0.32,
    preset: "steel_rough",
    repeat: [2, 2],
    envMapIntensity: 1.2,
  },
  eye_glow: {
    base: "#6f5a12",
    metalness: 0.25,
    roughness: 0.24,
    emissive: "#ffd23f",
    emissiveIntensity: 2.2,
    envMapIntensity: 0.8,
  },
  forehead_glow: {
    base: "#6b160c",
    metalness: 0.2,
    roughness: 0.28,
    emissive: "#ff3a1e",
    emissiveIntensity: 2.4,
    envMapIntensity: 0.7,
  },
  chest_glow_blue: {
    base: "#123142",
    metalness: 0.35,
    roughness: 0.35,
    emissive: "#37a8e8",
    emissiveIntensity: 1.35,
    envMapIntensity: 0.7,
  },
  chest_glow_rose: {
    base: "#3a1526",
    metalness: 0.35,
    roughness: 0.35,
    emissive: "#ef5a9a",
    emissiveIntensity: 1.3,
    envMapIntensity: 0.7,
  },
  chest_glow_amber: {
    base: "#3a2a10",
    metalness: 0.35,
    roughness: 0.35,
    emissive: "#f0b23c",
    emissiveIntensity: 1.3,
    envMapIntensity: 0.7,
  },
  sensor_red: {
    base: "#3a0707",
    metalness: 0.3,
    roughness: 0.3,
    emissive: "#ff2b2b",
    emissiveIntensity: 1.1,
    envMapIntensity: 0.5,
  },
  servo_blue: {
    base: "#06232e",
    metalness: 0.5,
    roughness: 0.3,
    emissive: "#38d6ff",
    emissiveIntensity: 0.9,
    envMapIntensity: 0.6,
  },
};
