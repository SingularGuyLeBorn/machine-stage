import { Component, type ErrorInfo, type ReactNode } from "react";
import { faultFromError, useStageStore, type StageFault } from "../state/stageStore";

// ============================================================================
// ErrorBoundary —— 白屏防御（React 渲染/生命周期异常）
//
// React 的错误边界只能捕获「渲染 / 生命周期 / 构造」阶段的异常。我们的显示策略是
// 「边界只上报、面板只渲染一次」：所有故障汇聚到 stageStore.fault，
// 由 <FaultPanel> 在 App 顶层统一渲染，避免嵌套边界出现多份报错卡片。
//
// 注意：事件回调、setTimeout、useFrame 里的异常不走边界，由 main.tsx 的
// window error / unhandledrejection 兜底（同样写进 fault）。
// ============================================================================

export type FaultReporter = (fault: StageFault) => void;

/** 默认上报：写入展示台故障槽（组件树不需要层层传回调）。 */
export function reportFault(fault: StageFault): void {
  useStageStore.getState().reportFault(fault);
}

interface ErrorBoundaryProps {
  /** 出错环节名（面板标题里显示）。 */
  scope: string;
  children: ReactNode;
  /** 自定义上报（默认写 stageStore）。 */
  onFault?: FaultReporter;
  /** 出错时渲染什么（默认什么都不渲染，面板由 App 顶层统一画）。 */
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  faulted: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { faulted: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { faulted: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    const fault = faultFromError(this.props.scope, error);
    if (info.componentStack) {
      fault.stack = `${fault.stack ?? fault.message}\n--- 组件栈 ---${info.componentStack}`;
    }
    (this.props.onFault ?? reportFault)(fault);
  }

  render(): ReactNode {
    if (this.state.faulted) return this.props.fallback ?? null;
    return this.props.children;
  }
}
