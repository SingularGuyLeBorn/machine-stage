import { Crosshair, ScanSearch, X } from "lucide-react";
import { BUILD_LAYER_LABELS } from "@/three/parts";
import { findModel } from "../catalog";
import { useStageStore } from "../state/stageStore";

// ============================================================================
// PartInfoCard —— 当前零件信息（视口左侧中部）
//
// 视口点选/零件树点选后，零件详情不再挤在底部图例里：在左侧中部给一张
// 视觉焦点卡片（名称 / 手册名 / partId / 层 / 装配序 / 实例），并提供聚焦、隔离
// 两个直接动作。左栏零件树默认收起，信息入口就是这张卡。
// ============================================================================

export function PartInfoCard() {
  const modelId = useStageStore((state) => state.modelId);
  const selectedPart = useStageStore((state) => state.selectedPart);
  const selectedInstance = useStageStore((state) => state.selectedInstance);
  const selectPart = useStageStore((state) => state.selectPart);
  const requestFocus = useStageStore((state) => state.requestFocus);
  const openPartIsolation = useStageStore((state) => state.openPartIsolation);

  if (!selectedPart) return null;
  const registry = findModel(modelId).registry;
  const part = registry?.parts.find((item) => item.id === selectedPart);
  if (!part) return null;
  const assembly = registry?.assemblies.find((item) => item.id === part.assembly);
  const layer = BUILD_LAYER_LABELS[part.build_layer]?.name_cn ?? `L${part.build_layer}`;
  const count = part.instances ?? 1;
  const instanceText =
    count > 1
      ? `实例 ${selectedInstance !== null ? selectedInstance + 1 : "—"} / ${count}`
      : part.dual
        ? "左右件"
        : "单件";

  return (
    <aside className="part-card float-card" aria-label="当前零件信息">
      <header className="part-card__head">
        <span className="badge badge--accent">{layer}</span>
        <span className="part-card__assembly">{assembly?.name_cn ?? part.assembly}</span>
        <button
          type="button"
          className="part-card__close"
          title="清除选中"
          aria-label="清除选中"
          onClick={() => selectPart(null)}
        >
          <X size={13} aria-hidden />
        </button>
      </header>
      <h3 className="part-card__name">{part.name_cn}</h3>
      <p className="part-card__en">{part.name_en}</p>
      <code className="part-card__id" title={selectedPart}>
        {selectedPart}
        {selectedInstance !== null ? `[${selectedInstance}]` : ""}
      </code>
      <div className="part-card__meta">
        <span>
          装配序 <b>{part.build_order}</b>
        </span>
        <span>{instanceText}</span>
        <span>
          材质 <b>{part.material}</b>
        </span>
      </div>
      <div className="part-card__actions">
        <button type="button" className="btn btn--sm" onClick={() => requestFocus(part.id)}>
          <Crosshair size={12} aria-hidden />
          聚焦
        </button>
        <button type="button" className="btn btn--sm" onClick={() => openPartIsolation(part.id)}>
          <ScanSearch size={12} aria-hidden />
          隔离查看
        </button>
      </div>
    </aside>
  );
}
