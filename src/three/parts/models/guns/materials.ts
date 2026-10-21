import type { MaterialSpec } from "../../kernel/textures";

// ============================================================================
// models/guns —— 枪械系列共享基座（AK-47 / M249 / M2HB / M134）
//
// 四个型号共享：材质库（烤蓝 / 磷化 / 木质 / 黄铜 / 铅芯…）、参数化 kits
// （线膛枪管 / 弹药六分件 / 螺旋簧 / 带孔轮廓板 / 弹链节 / 枪口焰…）与
// 机构运动学工具（缓动 / 弹道 / 射击循环相位）。
//
// 每把枪仍是独立模型目录（models/ak47、models/m249…），共享层只放
// 「同原理同结构」的东西——弹匣弧形不同、枪机不同，绝不合并模型。
// ============================================================================

/** 烤蓝钢（AK 系机匣 / 枪管 / 自动机）：发黑处理，深蓝近黑。 */
const STEEL_BLUED: MaterialSpec = {
  base: "#23262b",
  metalness: 0.88,
  roughness: 0.34,
  preset: "steel",
  repeat: [3, 3],
  envMapIntensity: 1.15,
};

/** 磷化钢（M249 / M2HB / M134 系）：哑光灰绿磷化膜。 */
const STEEL_PHOSPHATE: MaterialSpec = {
  base: "#4a4d4a",
  metalness: 0.82,
  roughness: 0.52,
  preset: "steel_rough",
  repeat: [3, 3],
  envMapIntensity: 1,
};

/** 机加钢件（枪机 / 击针 / 阻铁 / 销）：亮钢色。 */
const STEEL_MACHINED: MaterialSpec = {
  base: "#8f959c",
  metalness: 0.9,
  roughness: 0.32,
  preset: "steel",
  repeat: [2, 2],
  envMapIntensity: 1.1,
};

/** 使用磨损钢（高频摩擦面：抽壳钩 / 闭锁凸笋 / 供弹齿）。 */
const STEEL_WORN: MaterialSpec = {
  base: "#6f6a63",
  metalness: 0.86,
  roughness: 0.46,
  preset: "steel_rough",
  repeat: [2, 2],
};

/** 簧件（复进簧 / 击锤簧 / 托弹簧）：磷化 + 高糙。 */
const STEEL_SPRING: MaterialSpec = {
  base: "#575b5e",
  metalness: 0.8,
  roughness: 0.55,
  preset: "steel_rough",
  repeat: [2, 2],
};

/** 黄铜（弹壳 / 闭锁环）：本色黄铜。 */
const BRASS: MaterialSpec = {
  base: "#b08a3c",
  metalness: 0.92,
  roughness: 0.28,
  preset: "steel",
  repeat: [2, 2],
  envMapIntensity: 1.2,
};

/** 馏青铜被甲（弹头被甲）。 */
const COPPER: MaterialSpec = {
  base: "#9a5f36",
  metalness: 0.9,
  roughness: 0.34,
  preset: "steel",
  repeat: [1, 1],
};

/** 铅芯（弹头铅套）：暗灰蓝。 */
const LEAD: MaterialSpec = {
  base: "#77808c",
  metalness: 0.62,
  roughness: 0.52,
  preset: "steel_rough",
  repeat: [1, 1],
};

/** 钢芯（穿甲弹心）。 */
const STEEL_CORE: MaterialSpec = {
  base: "#9aa1a8",
  metalness: 0.92,
  roughness: 0.3,
  preset: "steel",
  repeat: [1, 1],
};

/** 发射药（颗粒火药柱，断面可见）。 */
const PROPELLANT: MaterialSpec = {
  base: "#3c3428",
  metalness: 0.1,
  roughness: 0.9,
  preset: "none",
};

/** 底火（击发药）：黄铜底 + 火台。 */
const PRIMER: MaterialSpec = {
  base: "#c9a44e",
  metalness: 0.9,
  roughness: 0.35,
  preset: "steel",
  repeat: [1, 1],
};

/** 木质件（AK 护木 / 握把 / 枪托）：层压桦木。 */
const WOOD_FURNITURE: MaterialSpec = {
  base: "#7a4a24",
  metalness: 0.02,
  roughness: 0.68,
  preset: "wood",
  repeat: [1.5, 1.5],
};

/** 握把磨亮（手汗 + 使用磨损：粗糙度低于新木）。 */
const WOOD_WORN: MaterialSpec = {
  base: "#8a5730",
  metalness: 0.03,
  roughness: 0.44,
  preset: "wood",
  repeat: [1.5, 1.5],
  envMapIntensity: 1.1,
};

/** 橡胶握把（M249 握把 / 枪托缓冲）。 */
const RUBBER: MaterialSpec = {
  base: "#26282a",
  metalness: 0.05,
  roughness: 0.9,
  preset: "rubber",
  repeat: [2, 2],
};

/** 枪口积碳（L5 质感层）：烟灰 + 铜屑。 */
const CARBON_FOULING: MaterialSpec = {
  base: "#17181a",
  metalness: 0.2,
  roughness: 0.95,
  preset: "cast",
  repeat: [2, 2],
};

/** 枪口焰（ emissive，点火瞬间可见 30~50ms）。 */
const MUZZLE_FLASH: MaterialSpec = {
  base: "#ffd9a0",
  metalness: 0,
  roughness: 1,
  preset: "none",
  emissive: "#ffb750",
  emissiveIntensity: 3.2,
  opacity: 0.92,
  doubleSided: true,
};

/** 曳光弹芯（部分弹种）： emissive 暗红。 */
const TRACER: MaterialSpec = {
  base: "#8a2f22",
  metalness: 0.4,
  roughness: 0.6,
  preset: "none",
  emissive: "#ff5a30",
  emissiveIntensity: 1.6,
};

/** 枪械系列共享材质库（各模型把本表并入自己的 materials）。 */
export const GUN_MATERIALS: Record<string, MaterialSpec> = {
  steel_blued: STEEL_BLUED,
  steel_phosphate: STEEL_PHOSPHATE,
  steel_machined: STEEL_MACHINED,
  steel_worn: STEEL_WORN,
  steel_spring: STEEL_SPRING,
  brass: BRASS,
  copper: COPPER,
  lead: LEAD,
  steel_core: STEEL_CORE,
  propellant: PROPELLANT,
  primer: PRIMER,
  wood_furniture: WOOD_FURNITURE,
  wood_worn: WOOD_WORN,
  rubber: RUBBER,
  carbon_fouling: CARBON_FOULING,
  muzzle_flash: MUZZLE_FLASH,
  tracer: TRACER,
};
