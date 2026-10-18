import { Ruler } from "lucide-react";
import { BuildSlider } from "./components/BuildSlider";
import { ModelList } from "./components/ModelList";
import { ActionPanel } from "./components/ActionPanel";
import { ParamsPanel } from "./components/ParamsPanel";
import { PartTree } from "./components/PartTree";
import { StateMachine } from "./components/StateMachine";
import { Viewport } from "./components/Viewport";
import { useStageStore } from "./state/stageStore";

export function App() {
  const notice = useStageStore((state) => state.notice);
  const setNotice = useStageStore((state) => state.setNotice);

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

      <main className="layout">
        <div className="column">
          <ModelList />
          <PartTree />
        </div>

        <div className="column">
          <Viewport />
          <BuildSlider />
        </div>

        <div className="column">
          <ActionPanel />
          <StateMachine />
          <ParamsPanel />
        </div>
      </main>

      {notice ? (
        <button type="button" className="notice" onClick={() => setNotice(null)}>
          {notice}
        </button>
      ) : null}
    </div>
  );
}
