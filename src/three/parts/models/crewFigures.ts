// 舰员运行时人物（Quaternius CC0 蒙皮角色），坐标与所在舱室一致。
// 人物不再由方块/球体拼出；这里只声明岗位、位置、朝向、配色和动画。

export type CrewModelId =
  | "worker-male"
  | "worker-female"
  | "suit-male"
  | "suit-female"
  | "casual-male"
  | "security";

export type CrewPalette =
  | "navy"
  | "grey"
  | "white"
  | "medic"
  | "officer"
  | "offduty"
  | "offduty2"
  | "security";

export interface CrewFigureDef {
  model: CrewModelId;
  palette: CrewPalette;
  /** 编辑坐标（模型根节点坐标系）。 */
  x: number;
  z: number;
  /** 朝向（度，绕 Y）。 */
  yaw: number;
  /** GLTF 内动画名；缺省 Idle_Neutral。 */
  animation?: "Idle_Neutral" | "Interact" | "Idle";
}

export const CREW_MODEL_URLS: Record<CrewModelId, string> = {
  "worker-male": "/models/crew/crew-worker-male.gltf",
  "worker-female": "/models/crew/crew-worker-female.gltf",
  "suit-male": "/models/crew/crew-suit-male.gltf",
  "suit-female": "/models/crew/crew-suit-female.gltf",
  "casual-male": "/models/crew/crew-casual-male.gltf",
  security: "/models/crew/crew-security.gltf",
};

export const CREW_PALETTES: Record<CrewPalette, { main: string; vest: string; pants: string; accent: string; shirt?: string }> = {
  navy: { main: "#2f4356", vest: "#1d2a35", pants: "#26323c", accent: "#c9a23f" },
  grey: { main: "#68747c", vest: "#3f4a52", pants: "#2f363c", accent: "#c9a23f" },
  white: { main: "#d6d3c8", vest: "#8c8a80", pants: "#5a5c5a", accent: "#b33a30" },
  medic: { main: "#d9d5c7", vest: "#a33b34", pants: "#5b5f5e", accent: "#f0ece2", shirt: "#e7e2d4" },
  officer: { main: "#111a22", vest: "#1c2833", pants: "#151c22", accent: "#b08a3e", shirt: "#e7e2d4" },
  offduty: { main: "#45545f", vest: "#2c343a", pants: "#252b30", accent: "#b7b1a3" },
  offduty2: { main: "#6a5445", vest: "#3b3029", pants: "#2c2a26", accent: "#c8c0ad" },
  security: { main: "#1c242b", vest: "#303b44", pants: "#1a2025", accent: "#b33a30" },
};

/** 055 生活甲板：走廊 + 8 舱，10 名不同岗位舰员。 */
export const TYPE055_CREW_FIGURES: CrewFigureDef[] = [
  { model: "worker-male", palette: "navy", x: 2.0, z: -6.4, yaw: 0, animation: "Idle_Neutral" },
  { model: "worker-female", palette: "grey", x: 3.2, z: -6.35, yaw: 185, animation: "Interact" },
  { model: "worker-male", palette: "white", x: 3.55, z: -7.25, yaw: 180, animation: "Interact" },
  { model: "worker-female", palette: "white", x: 2.4, z: -0.4, yaw: 175, animation: "Interact" },
  { model: "suit-female", palette: "medic", x: 1.5, z: 2.0, yaw: 90, animation: "Interact" },
  { model: "casual-male", palette: "offduty", x: -2.55, z: -2.95, yaw: 10, animation: "Idle_Neutral" },
  { model: "worker-female", palette: "navy", x: -3.0, z: -7.15, yaw: 0, animation: "Idle_Neutral" },
  { model: "suit-male", palette: "officer", x: -1.9, z: 6.3, yaw: 100, animation: "Idle_Neutral" },
  { model: "worker-female", palette: "navy", x: 0.55, z: 1.0, yaw: 180, animation: "Idle_Neutral" },
  { model: "casual-male", palette: "offduty2", x: 1.4, z: 6.0, yaw: 260, animation: "Idle_Neutral" },
];

/** 福建舰生活甲板：走廊 + 9 舱，9 名不同岗位舰员（1:8 编辑坐标）。 */
export const CARRIER_CREW_FIGURES: CrewFigureDef[] = [
  { model: "worker-male", palette: "navy", x: 0.2, z: 5.58, yaw: 180, animation: "Idle_Neutral" },
  { model: "worker-female", palette: "grey", x: 0.75, z: 5.58, yaw: 170, animation: "Interact" },
  { model: "worker-male", palette: "white", x: 0.5, z: 7.5, yaw: 180, animation: "Interact" },
  { model: "suit-female", palette: "medic", x: 0.7, z: 9.7, yaw: 200, animation: "Interact" },
  { model: "worker-male", palette: "navy", x: -0.7, z: 5.25, yaw: 180, animation: "Idle_Neutral" },
  { model: "casual-male", palette: "offduty", x: -0.5, z: 7.8, yaw: 20, animation: "Idle_Neutral" },
  { model: "security", palette: "security", x: 0.06, z: 9.2, yaw: 180, animation: "Idle_Neutral" },
  { model: "suit-male", palette: "officer", x: -0.55, z: 10.9, yaw: 90, animation: "Idle_Neutral" },
  { model: "casual-male", palette: "offduty2", x: 0.7, z: 10.6, yaw: 270, animation: "Idle_Neutral" },
];

export const CREW_SHIP_SCALE = {
  type055: { floorY: 2.6, scale: 1 },
  carrier: { floorY: 1.34, scale: 1 / 7.9 },
} as const;
