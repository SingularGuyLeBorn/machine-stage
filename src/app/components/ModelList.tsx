import { Boxes, CircleCheck } from "lucide-react";
import { CATALOG } from "../catalog";
import { useStageStore } from "../state/stageStore";

// ============================================================================
// ModelList —— 左栏模型列表（planned 卡片是路线图占位，不可选中）
// ============================================================================

export function ModelList() {
  const visibleModels = CATALOG.filter((model) => !model.hidden);
  const modelId = useStageStore((state) => state.modelId);
  const setModel = useStageStore((state) => state.setModel);

  return (
    <section className="panel model-library">
      <header className="panel__head">
        <Boxes size={14} className="muted" aria-hidden />
        <h2 className="panel__title">模型库</h2>
        <span className="panel__count">
          {visibleModels.filter((model) => model.status === "ready").length}/{visibleModels.length} 已交付
        </span>
      </header>
      <div className="panel__body">
        <div className="model-list">
          {visibleModels.map((model) => {
            const ready = model.status === "ready";
            return (
              <button
                key={model.id}
                type="button"
                className="model-card"
                aria-current={ready && model.id === modelId}
                disabled={!ready}
                onClick={() => setModel(model.id)}
                title={ready ? model.subtitle : `${model.milestone} 里程碑交付`}
              >
                <span className="model-card__name">{model.title}</span>
                <span className={`badge ${ready ? "badge--accent" : ""} model-card__tag`}>
                  {ready ? <CircleCheck size={11} aria-hidden /> : null}
                  {model.milestone}
                  {ready ? "" : " 计划"}
                </span>
                <span className="model-card__sub">{model.subtitle}</span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
