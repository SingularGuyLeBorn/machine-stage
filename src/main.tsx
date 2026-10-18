import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { faultFromError, useStageStore } from "./app/state/stageStore";
import "./app/styles/tokens.css";
import "./app/styles/base.css";
import "./app/styles/app.css";
import "./app/styles/scene.css";

// ============================================================================
// main —— 启动 + 全局故障兜底
//
// React 边界只能拦住「渲染期」的异常；事件回调、定时器、Promise、three 的
// 每帧回调都跑在边界之外，一旦抛错同样会留下一个冻结/空白的界面。
// 这里把它们统一收进 stageStore.fault，由 FaultPanel 显示（永不白屏）。
// ============================================================================

/** 噪音错误（浏览器扩展 / 布局抖动）不上报，避免误伤。 */
function isNoise(message: string): boolean {
  return (
    message.includes("ResizeObserver loop") ||
    message.includes("Script error.") ||
    message.includes("chrome-extension://")
  );
}

window.addEventListener("error", (event) => {
  // 资源加载失败（img/script）没有 error 对象也没有 message，跳过。
  if (!event.error && !event.message) return;
  const message = event.error instanceof Error ? event.error.message : String(event.message ?? "");
  if (isNoise(message)) return;
  useStageStore.getState().reportFault(faultFromError("全局脚本", event.error ?? event.message));
});

window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason as unknown;
  const message = reason instanceof Error ? reason.message : String(reason ?? "");
  if (isNoise(message)) return;
  useStageStore.getState().reportFault(faultFromError("未处理的异步任务", reason));
});

const container = document.getElementById("root");
if (!container) throw new Error("main：找不到 #root 挂载点");

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
