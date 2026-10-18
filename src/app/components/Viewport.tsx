import { Boxes, Crosshair, Eye, Grid3x3, Layers, Tag } from "lucide-react";
import { StageCanvas } from "../three/StageCanvas";
import { findModel } from "../catalog";
import { useStageStore } from "../state/stageStore";
import { ClippingDock } from "./ClippingPanel";
import { ErrorBoundary } from "./ErrorBoundary";
import { IsolationView } from "./IsolationView";

// ============================================================================
// Viewport —— 中栏：3D 视口 + 视口工具条 + 穿模报告抽屉 + 隔离小视图 + 读数图例
// ============================================================================

export function Viewport() {
  const modelId = useStageStore((state) => state.modelId);
  const views = useStageStore((state) => state.views);
  const toggleView = useStageStore((state) => state.toggleView);
  const requestViewReset = useStageStore((state) => state.requestViewReset);
  const stats = useStageStore((state) => state.stats);
  const assembled = useStageStore((state) => state.assembled);
  const machineState = useStageStore((state) => state.machineState);
  const selectedPart = useStageStore((state) => state.selectedPart);
  const model = findModel(modelId);
  const stateLabel = model.states?.find((state) => state.id === machineState)?.label ?? machineState;
  const readouts = assembled && model.readouts ? model.readouts(assembled) : [];

  return (
    <div className="viewport">
      <div className="viewport__canvas">
        {/* 三维视口单独设边界：WebGL / 渲染层出问题时只有视口被替换，左右面板照常可用 */}
        <ErrorBoundary scope="三维视口">
          <StageCanvas />
        </ErrorBoundary>
      </div>

      <ClippingDock />
      <IsolationView />

      <div className="viewport__overlay viewport__overlay--tr">
        <div className="float-card toolstrip">
          <button
            type="button"
            className="btn btn--sm"
            aria-pressed={views.explode}
            title="按装配层向外展开：外壳最远、核心不动"
            onClick={() => toggleView("explode")}
          >
            <Layers size={13} aria-hidden />
            爆炸
          </button>
          <button
            type="button"
            className="btn btn--sm"
            aria-pressed={views.xray}
            title="半透明外壳，检查内部机构"
            onClick={() => toggleView("xray")}
          >
            <Eye size={13} aria-hidden />
            透视
          </button>
          <button
            type="button"
            className="btn btn--sm"
            aria-pressed={views.labels}
            title="显示总成名与位置"
            onClick={() => toggleView("labels")}
          >
            <Tag size={13} aria-hidden />
            标签
          </button>
          <button
            type="button"
            className="btn btn--sm"
            aria-pressed={views.grid}
            title="参考网格（1 格 = 0.25 m），默认关闭"
            onClick={() => toggleView("grid")}
          >
            <Grid3x3 size={13} aria-hidden />
            网格
          </button>
          <button
            type="button"
            className="btn btn--sm"
            aria-pressed={views.shadow}
            title="悬浮模型的柔和接触阴影"
            onClick={() => toggleView("shadow")}
          >
            <Boxes size={13} aria-hidden />
            阴影
          </button>
          <button type="button" className="btn btn--sm" title="回到初始方位" onClick={requestViewReset}>
            <Crosshair size={13} aria-hidden />
            复位
          </button>
        </div>
      </div>

      <div className="viewport__overlay viewport__overlay--br">
        <div className="float-card viewport__legend">
          <span>
            状态 <span className="num">{stateLabel}</span>
          </span>
          <span>
            零件 <span className="num">{stats?.parts ?? "—"}</span>
          </span>
          <span>
            三角面 <span className="num">{stats ? stats.triangles.toLocaleString("en-US") : "—"}</span>
          </span>
          {selectedPart ? (
            <span className="viewport__selection" title={selectedPart}>
              选中 <span className="num">{selectedPart}</span>
            </span>
          ) : null}
          {readouts.map((readout) => (
            <span key={readout.label}>
              {readout.label} <span className="num">{readout.value}</span>
            </span>
          ))}
          {views.grid ? <span title="网格格距用于目测尺寸">网格 1 格 = 0.25 m</span> : null}
        </div>
      </div>
    </div>
  );
}
