import type { Object3D } from "three";
import type { AssembledModel, PartHandle } from "@/three/parts";

// ============================================================================
// internal —— 「装甲内部件」判定
//
// 逐件模型默认把电池/电机/发动机/内饰都真实建出来；普通外观视角不需要
// 渲染它们（会被装甲遮住），但透视/爆炸/构建回放/选中内部件时必须显示。
// 支持 MBT / ED 的分层和金古桥的 internal 标签，其它模型一律不隐藏。
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

const visibilityRest = new WeakMap<Object3D, { raycast: Object3D["raycast"]; castShadow: boolean }>();
/**
 * 相机保留 0 层、禁用 2 层；显示模式只切换渲染层，不改构建回放/损伤拥有的 visible。
 * 隐藏的表皮不能继续挡住内部点选或投影；每次都从原值恢复，保证反复开关可逆。
 */
export function applyInternalVisibility(
  modelId: string,
  model: AssembledModel,
  showInternals: boolean,
  internalsOnly: boolean,
): void {
  const only = modelId === "kingjoemodules" && internalsOnly;
  for (const handle of model.parts) {
    const internal = isInternalPart(modelId, handle);
    const shown = internal ? only || showInternals : !only;
    for (const object of [handle.object, ...Object.values(handle.damageObjects)]) {
      if (!object) continue;
      let rest = visibilityRest.get(object);
      if (!rest) {
        rest = { raycast: object.raycast, castShadow: object.castShadow };
        visibilityRest.set(object, rest);
      }
      object.layers.set(shown ? 0 : 2);
      object.raycast = shown ? rest.raycast : hiddenRaycast;
      object.castShadow = shown && rest.castShadow;
    }
  }
}
function hiddenRaycast(): void {}
