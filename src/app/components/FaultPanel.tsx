import { RotateCcw, TriangleAlert, X } from "lucide-react";
import { useState } from "react";
import { useStageStore } from "../state/stageStore";

// ============================================================================
// FaultPanel —— 运行错误面板（白屏防御的显示端）
//
// 任何环节 throw（装配 / 材质 / 渲染 / 全局）都会让这张卡片出现：
// 错误环节 + 消息 + 堆栈 + 重载按钮。它取代「整页空白」这一故障形态。
// ============================================================================

export function FaultPanel() {
  const fault = useStageStore((state) => state.fault);
  const clearFault = useStageStore((state) => state.clearFault);
  const [showStack, setShowStack] = useState(true);

  if (!fault) return null;

  return (
    <div className="fault" role="alert" data-scope={fault.scope}>
      <header className="fault__head">
        <TriangleAlert size={15} aria-hidden />
        <strong>运行故障 · {fault.scope}</strong>
        <span className="fault__time num">
          {new Date(fault.at).toLocaleTimeString("zh-CN", { hour12: false })}
        </span>
        <div className="fault__spacer" />
        <button
          type="button"
          className="btn btn--sm"
          onClick={() => window.location.reload()}
          title="重新加载页面（配置与代码改动生效）"
        >
          <RotateCcw size={12} aria-hidden />
          重载页面
        </button>
        <button
          type="button"
          className="btn btn--sm"
          onClick={() => clearFault()}
          aria-label="关闭错误面板"
          title="关掉面板继续（模型可能不完整）"
        >
          <X size={12} aria-hidden />
        </button>
      </header>
      <p className="fault__message">{fault.message}</p>
      {fault.stack ? (
        <button
          type="button"
          className="fault__toggle"
          aria-expanded={showStack}
          onClick={() => setShowStack((open) => !open)}
        >
          {showStack ? "收起堆栈" : "展开堆栈"}
        </button>
      ) : null}
      {fault.stack && showStack ? <pre className="fault__stack">{fault.stack}</pre> : null}
      <p className="fault__hint">修好后点「重载页面」；注册表类问题通常会指到具体零件 ID 与常量名。</p>
    </div>
  );
}
