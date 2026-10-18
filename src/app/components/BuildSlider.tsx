import { ChevronRight, Layers } from "lucide-react";
import { useMemo } from "react";
import { BUILD_LAYER_LABELS } from "@/three/parts";
import { findModel } from "../catalog";
import { buildOrdersOf, useStageStore } from "../state/stageStore";

// ============================================================================
// BuildSlider —— 构建进度滑杆（杀手级特性）
//
// 离散回放：每一格 = 一件（build_order 升序）。拖到第 i 格，视口只显示前 i 件，
// 于是从 L1 核心机构一层层长到 L5 表面附件都能"立得住"。
// ============================================================================

export function BuildSlider() {
  const modelId = useStageStore((state) => state.modelId);
  const buildIndex = useStageStore((state) => state.buildIndex);
  const setBuildIndex = useStageStore((state) => state.setBuildIndex);
  const advanceBuild = useStageStore((state) => state.advanceBuild);

  const orders = useMemo(() => buildOrdersOf(modelId), [modelId]);
  const registry = findModel(modelId).registry;

  const meta = useMemo(() => {
    const parts = registry?.parts ?? [];
    const expandedCount = (part: (typeof parts)[number]) => (part.dual ? 2 : 1);
    const total = parts.reduce((sum, part) => sum + expandedCount(part), 0);
    let visible = 0;
    if (buildIndex >= orders.length) visible = total;
    else if (buildIndex > 0) {
      const threshold = orders[buildIndex - 1];
      visible = parts
        .filter((part) => part.build_order <= threshold)
        .reduce((sum, part) => sum + expandedCount(part), 0);
    }
    const currentOrder = buildIndex > 0 ? orders[buildIndex - 1] : null;
    const currentPart =
      currentOrder === null ? null : parts.find((part) => part.build_order === currentOrder);
    return {
      total,
      visible,
      layer: currentPart?.build_layer ?? null,
      layerName: currentPart ? BUILD_LAYER_LABELS[currentPart.build_layer] : null,
      currentPart,
    };
  }, [registry, orders, buildIndex]);

  const ticks = useMemo(() => {
    if (!registry) return [];
    const seen = new Map<number, number>();
    registry.parts.forEach((part) => {
      const index = orders.indexOf(part.build_order);
      if (index >= 0) seen.set(part.build_layer, Math.max(seen.get(part.build_layer) ?? 0, index + 1));
    });
    return [...seen.entries()]
      .sort((left, right) => left[0] - right[0])
      .map(([layer, index]) => ({ layer, ratio: orders.length === 0 ? 0 : index / orders.length }));
  }, [registry, orders]);

  const percent = orders.length === 0 ? 0 : (buildIndex / orders.length) * 100;
  const activeLayer = buildIndex === 0 ? 0 : (meta.layer ?? 5);

  return (
    <section className="panel">
      <div className="buildbar">
        <div className="buildbar__meta">
          <div className="buildbar__layer">
            <Layers size={13} className="muted" aria-hidden />
            {meta.layerName ? `L${meta.layer} ${meta.layerName.name_cn}` : "未开始构建"}
          </div>
          <div className="buildbar__counts">
            已装配 <span className="num">{meta.visible}</span>/<span className="num">{meta.total}</span> 件
            {meta.currentPart ? ` · 当前 ${meta.currentPart.name_cn}` : ""}
          </div>
        </div>
        <div className="buildbar__track">
          <input
            className="slider"
            type="range"
            min={0}
            max={orders.length}
            step={1}
            value={buildIndex}
            aria-label="构建进度"
            disabled={orders.length === 0}
            style={{ ["--fill" as string]: `${percent}%` }}
            onChange={(event) => setBuildIndex(Number(event.target.value))}
          />
          <div className="buildbar__ticks">
            {ticks.map((tick) => (
              <button
                key={tick.layer}
                type="button"
                className="buildbar__tick"
                data-active={activeLayer >= tick.layer}
                style={{ left: `${tick.ratio * 100}%` }}
                title={`跳转到 L${tick.layer} ${BUILD_LAYER_LABELS[tick.layer]?.name_cn ?? ""} 结束`}
                onClick={() => setBuildIndex(Math.round(tick.ratio * orders.length))}
              >
                L{tick.layer}
              </button>
            ))}
          </div>
        </div>
        <div className="btn-row">
          <button
            type="button"
            className="btn btn--sm"
            onClick={() => advanceBuild(-1)}
            disabled={buildIndex <= 0}
            aria-label="回退一件"
          >
            <ChevronRight size={13} style={{ transform: "rotate(180deg)" }} aria-hidden />
          </button>
          <button
            type="button"
            className="btn btn--sm"
            onClick={() => advanceBuild(1)}
            disabled={buildIndex >= orders.length}
            aria-label="前进一件"
          >
            <ChevronRight size={13} aria-hidden />
          </button>
        </div>
      </div>
    </section>
  );
}
