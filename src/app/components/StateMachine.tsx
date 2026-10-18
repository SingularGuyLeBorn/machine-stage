import { ChevronRight } from "lucide-react";
import { findModel } from "../catalog";
import { useStageStore } from "../state/stageStore";

// ============================================================================
// StateMachine —— 状态机图（当前状态高亮）
//
// 状态来自 catalog 声明；「穿模扫描」是瞬时态，扫描结束后回到进入前的状态。
// ============================================================================

export function StateMachine() {
  const modelId = useStageStore((state) => state.modelId);
  const machineState = useStageStore((state) => state.machineState);
  const states = findModel(modelId).states ?? [];

  return (
    <section className="panel">
      <header className="panel__head">
        <h2 className="panel__title">状态机</h2>
        <span className="panel__count">{states.length > 0 ? `${states.length} 个状态` : "未接入"}</span>
      </header>
      <div className="sm">
        {states.length === 0 ? (
          <div className="empty">该模型尚未登记状态机</div>
        ) : (
          states.map((state, index) => (
            <div key={state.id} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              {index > 0 ? (
                <span className="sm__arrow" aria-hidden>
                  <ChevronRight size={14} />
                </span>
              ) : null}
              <div className="sm__node" data-active={state.id === machineState} title={state.hint}>
                <strong>{state.label}</strong>
                <span className="num">{state.id}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
