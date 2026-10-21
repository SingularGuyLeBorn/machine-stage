import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Ruler } from "lucide-react";
import { useRef, type ReactNode } from "react";
import { BuildSlider } from "./components/BuildSlider";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { FaultPanel } from "./components/FaultPanel";
import { ModelList } from "./components/ModelList";
import { ActionPanel } from "./components/ActionPanel";
import { ParamsPanel } from "./components/ParamsPanel";
import { PartTree } from "./components/PartTree";
import { StateMachine } from "./components/StateMachine";
import { Viewport } from "./components/Viewport";
import { useStageStore } from "./state/stageStore";

// ============================================================================
// App —— 三栏骨架（左右栏可拖宽 / 可收起为细条），中栏视口自适应
// ============================================================================

type Side = "left" | "right";

/** 拖拽条：改的是 store 里的栏宽，收起态不渲染。 */
export function ColumnResizer({ side }: { side: Side }) {
  const setColumnWidth = useStageStore((state) => state.setColumnWidth);
  const dragging = useRef(false);

  return (
    <div
      className="resizer"
      data-side={side}
      role="separator"
      aria-label={side === "left" ? "调整左栏宽度" : "调整右栏宽度"}
      aria-orientation="vertical"
      onPointerDown={(event) => {
        dragging.current = true;
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          /* 指针捕获并非所有环境都可用 */
        }
      }}
      onPointerMove={(event) => {
        if (!dragging.current) return;
        const layout = event.currentTarget.closest(".layout") as HTMLElement | null;
        if (!layout) return;
        const rect = layout.getBoundingClientRect();
        const padding = Number.parseFloat(getComputedStyle(layout).paddingLeft) || 0;
        const width =
          side === "left" ? event.clientX - rect.left - padding : rect.right - padding - event.clientX;
        if (!Number.isFinite(width)) return;
        setColumnWidth(side, width);
      }}
      onPointerUp={() => {
        dragging.current = false;
      }}
      onPointerCancel={() => {
        dragging.current = false;
      }}
    />
  );
}

/** 收起态的细条：只有一个展开按钮 + 竖排名。 */
function ColumnRail({ side, label }: { side: Side; label: string }) {
  const toggleColumn = useStageStore((state) => state.toggleColumn);
  return (
    <div className="rail" data-side={side}>
      <button
        type="button"
        className="rail__btn"
        title={`展开${label}`}
        aria-label={`展开${label}`}
        onClick={() => toggleColumn(side)}
      >
        {side === "left" ? <PanelLeftOpen size={14} aria-hidden /> : <PanelRightOpen size={14} aria-hidden />}
      </button>
      <span className="rail__label">{label}</span>
    </div>
  );
}

export function SideColumn({ side, label, children }: { side: Side; label: string; children: ReactNode }) {
  const open = useStageStore((state) => state.layout[side].open);
  const toggleColumn = useStageStore((state) => state.toggleColumn);
  if (!open) return <ColumnRail side={side} label={label} />;
  return (
    <div className="colwrap" data-side={side}>
      <button
        type="button"
        className="colwrap__collapse"
        title={`收起${label}`}
        aria-label={`收起${label}`}
        onClick={() => toggleColumn(side)}
      >
        {side === "left" ? (
          <PanelLeftClose size={13} aria-hidden />
        ) : (
          <PanelRightClose size={13} aria-hidden />
        )}
      </button>
      <div className="column">{children}</div>
      <ColumnResizer side={side} />
    </div>
  );
}

export function App() {
  const notice = useStageStore((state) => state.notice);
  const setNotice = useStageStore((state) => state.setNotice);
  const layout = useStageStore((state) => state.layout);
  const modelId = useStageStore((state) => state.modelId);

  return (
    <div className="app">
      <header className="header">
        <div className="header__brand">
          <span className="header__mark">
            <Ruler size={14} aria-hidden />
          </span>
          machine-stage
          <span className="header__sub">装备展示台 · 零件化 / 自内向外构建</span>
        </div>
        <div className="header__spacer" />
        <div className="header__hints">
          <span>左键旋转 · 右键平移 · 滚轮缩放</span>
          <span>点零件查看 · 拖滑杆回放装配</span>
        </div>
      </header>

      <ErrorBoundary scope="界面">
        <main
          className="layout"
          style={{
            ["--left-w" as string]: layout.left.open ? `${layout.left.width}px` : "38px",
            ["--right-w" as string]: layout.right.open ? `${layout.right.width}px` : "38px",
          }}
        >
          <SideColumn side="left" label="零件">
            <ModelList />
            <PartTree key={modelId} />
          </SideColumn>

          <div className="column column--center">
            <Viewport />
            <BuildSlider />
          </div>

          <SideColumn side="right" label="参数">
            <ActionPanel />
            <StateMachine />
            <ParamsPanel />
          </SideColumn>
        </main>
      </ErrorBoundary>

      {notice ? (
        <button type="button" className="notice" onClick={() => setNotice(null)}>
          {notice}
        </button>
      ) : null}

      {/* 故障面板：全应用唯一出口（边界只负责上报，避免多份报错卡片） */}
      <FaultPanel />
    </div>
  );
}
