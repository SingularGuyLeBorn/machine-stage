import type { PartHandle } from "@/three/parts";

// ============================================================================
// internal —— 「装甲内部件」判定
//
// 逐件模型默认把电池/电机/发动机/内饰都真实建出来；普通外观视角不需要
// 渲染它们（会被装甲遮住），但透视/爆炸/构建回放/选中内部件时必须显示。
// 这里只对自内向外分层的 MBT / ED 生效，其它模型一律不隐藏。
// ============================================================================

export function isInternalPart(modelId: string, handle: PartHandle): boolean {
  if (modelId === "kingjoemodules") return handle.def.tags?.includes("internal") ?? false;
  if (modelId !== "mbt90" && modelId !== "ed90") return false;
  // FX / 泄压板在装甲外，不能随内部件隐藏。
  if (handle.def.tags?.includes("fx")) return false;
  if (handle.partId.includes("blowout")) return false;
  // ED 的散热器/风扇/冷却软管在动力舱顶甲上，算外部可见件。
  if (modelId === "ed90" && handle.partId.startsWith("ed90.cooling.")) return false;
  if (handle.assembly === "composite_armor") return true;
  return handle.buildLayer === 1 || handle.buildLayer === 3;
}

/**
 * 透视时即使属于内部件也要幽灵化的「包络件」：
 * 发动机机体/曲轴箱/缸套/缸盖/涡轮壳不透明时，内部活塞、连杆、气门全被挡住，
 * 整台发动机看起来就只剩一块铁。把这些包络壳半透明，机构件保持不透明。
 */
export function isXrayShellPart(modelId: string, handle: PartHandle): boolean {
  if (modelId !== "mbt90" && modelId !== "ed90") return false;
  if (!handle.partId.startsWith(`${modelId}.engine.`)) return false;
  if (handle.assembly === "engine_block" || handle.assembly === "crankcase") return true;
  if (handle.assembly === "cylinder")
    return /(_liner|_head|_head_gasket|_injector_sleeve)$/.test(handle.partId);
  if (handle.assembly === "turbo") return /(turbine_housing|compressor_housing)(_[lr])?$/.test(handle.partId);
  return false;
}
