import { useState } from "react";
import { Boxes, CircleCheck } from "lucide-react";
import {
  CATALOG,
  MODEL_CATEGORY_LABELS,
  MODEL_CATEGORY_ORDER,
  type ModelCategory,
} from "../catalog";
import { useStageStore } from "../state/stageStore";

// ============================================================================
// ModelList —— 左栏模型列表（planned 卡片是路线图占位，不可选中）
// 顶部二级标签按类别筛选，避免 15 张卡片全堆在一起。
// ============================================================================

type CategoryFilter = "all" | ModelCategory;

export function ModelList() {
  const modelId = useStageStore((state) => state.modelId);
  const setModel = useStageStore((state) => state.setModel);
  const [category, setCategory] = useState<CategoryFilter>("all");
  const visible = category === "all" ? CATALOG : CATALOG.filter((model) => model.category === category);

  return (
    <section className="panel model-library">
      <header className="panel__head">
        <Boxes size={14} className="muted" aria-hidden />
        <h2 className="panel__title">模型库</h2>
        <span className="panel__count">
          {CATALOG.filter((model) => model.status === "ready").length}/{CATALOG.length} 已交付
        </span>
      </header>
      <div className="model-tabs" role="tablist" aria-label="模型分类">
        <button
          type="button"
          role="tab"
          className="model-tab"
          aria-selected={category === "all"}
          onClick={() => setCategory("all")}
        >
          全部<span className="model-tab__count">{CATALOG.length}</span>
        </button>
        {MODEL_CATEGORY_ORDER.map((key) => {
          const count = CATALOG.filter((model) => model.category === key).length;
          if (count === 0) return null;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              className="model-tab"
              aria-selected={category === key}
              onClick={() => setCategory(key)}
            >
              {MODEL_CATEGORY_LABELS[key]}
              <span className="model-tab__count">{count}</span>
            </button>
          );
        })}
      </div>
      <div className="panel__body">
        <div className="model-list">
          {visible.map((model) => {
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
