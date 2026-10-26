import { isCarrierInteriorMode, type CameraMode } from "./viewpoints";

/** 这些漫游区域在舰体内部；海面是无限平面，若不隐藏会从舱壁/地板穿进房间。
 *  deck / aircraft1 / z20 是甲板或机顶，仍需要海面。 */
export const INTERIOR_WALK_AREAS = new Set([
  "hangar",
  "magazine",
  "engine_room",
  "reactor_room",
  "bridge",
  "cic",
  "crew",
  "crew_berth",
  "crew_mess",
  "workshop",
  "fuel",
]);

/** 舰体/上层建筑内部包围盒（注册表局部坐标）：自由视角把相机拖进这些体积时，
 *  无限海面会从舱壁/地板穿进来，必须整层隐藏，而不只是漫游区域隐藏。 */
type InteriorVolume = { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number };
export const INTERIOR_VOLUMES: Record<"carrier" | "type055", InteriorVolume[]> = {
  carrier: [
    // 主舰体（机库/弹药库/机舱/反应堆/生活区/维修间）
    { x0: -4.9, x1: 4.9, y0: -0.2, y1: 4.56, z0: -20.2, z1: 20.8 },
    // 舰桥 + CIC（岛式上层建筑内部）
    { x0: 2.35, x1: 3.95, y0: 4.56, y1: 8.5, z0: -8.0, z1: -2.3 },
  ],
  type055: [
    // 主舰体（机舱/弹药库/生活区/维修间）
    { x0: -10.2, x1: 10.2, y0: -0.2, y1: 14.15, z0: -90.5, z1: 90.5 },
    // 机库（甲板下方）
    { x0: -6.0, x1: 6.0, y0: 14.15, y1: 15.55, z0: -72.0, z1: -54.0 },
    // 舰桥 + CIC（上层建筑内部；甲板面 15.76 在外）
    { x0: -5.2, x1: 5.2, y0: 17.4, y1: 36.0, z0: 8.0, z1: 34.0 },
  ],
};

export function isInsideInterior(
  modelId: string,
  p: { x: number; y: number; z: number },
): boolean {
  if (modelId !== "carrier" && modelId !== "type055") return false;
  for (const v of INTERIOR_VOLUMES[modelId]) {
    if (p.x >= v.x0 && p.x <= v.x1 && p.y >= v.y0 && p.y <= v.y1 && p.z >= v.z0 && p.z <= v.z1) {
      return true;
    }
  }
  return false;
}

export interface OceanVisibilityInput {
  modelId: string;
  seaOn: boolean;
  cameraMode: CameraMode;
  walkArea: string;
  cockpitActive: boolean;
  /** 相机在舰体根节点局部坐标中的位置。 */
  cameraLocal: { x: number; y: number; z: number };
}

export function shouldShowOcean(input: OceanVisibilityInput): boolean {
  if (!input.seaOn) return false;
  // 座舱在甲板/空中，海面在舱外；无论漫游还是固定座舱视角都应保留。
  if (input.cockpitActive || input.cameraMode === "cockpit") return true;
  if (isCarrierInteriorMode(input.cameraMode)) return false;
  if (input.cameraMode === "walk" && INTERIOR_WALK_AREAS.has(input.walkArea)) return false;
  if (isInsideInterior(input.modelId, input.cameraLocal)) return false;
  return true;
}
