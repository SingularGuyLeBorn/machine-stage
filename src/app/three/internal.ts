import type { PartHandle } from "@/three/parts";

// ============================================================================
// internal —— 「装甲内部件」判定
//
// 逐件模型默认把电池/电机/发动机/内饰都真实建出来；普通外观视角不需要
// 渲染它们（会被装甲遮住），但透视/爆炸/构建回放/选中内部件时必须显示。
// 这里只对自内向外分层的 MBT / ED 生效，其它模型一律不隐藏。
// ============================================================================

export function isInternalPart(modelId: string, handle: PartHandle): boolean {
  if (modelId !== "mbt90" && modelId !== "ed90") return false;
  // FX / 泄压板在装甲外，不能随内部件隐藏。
  if (handle.def.tags?.includes("fx")) return false;
  if (handle.partId.includes("blowout")) return false;
  // ED 的散热器/风扇/冷却软管在动力舱顶甲上，算外部可见件。
  if (modelId === "ed90" && handle.partId.startsWith("ed90.cooling.")) return false;
  if (handle.assembly === "composite_armor") return true;
  return handle.buildLayer === 1 || handle.buildLayer === 3;
}
