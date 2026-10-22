import { Boxes, CloudRain, Crosshair, DoorOpen, Eye, Grid3x3, Layers, MousePointerClick, Tag } from "lucide-react";
import { useEffect, useReducer } from "react";
import { instanceKey, type AssembledModel } from "@/three/parts";
import { effectiveLidOpen, lidAt } from "@/three/parts/models/tiger/lids";
import { StageCanvas } from "../three/StageCanvas";
import { findModel, type StageModel } from "../catalog";
import { useStageStore } from "../state/stageStore";
import { ClippingDock } from "./ClippingPanel";
import { EngineHud } from "./EngineHud";
import { ErrorBoundary } from "./ErrorBoundary";
import { IsolationView } from "./IsolationView";
import { PartInfoCard } from "./PartInfoCard";
import { CAMERA_MODE_LABELS, isCarrierInteriorMode } from "../three/viewpoints";

// ============================================================================
// Viewport —— 中栏：3D 视口 + 视口工具条 + 穿模报告抽屉 + 隔离小视图 + 读数图例
// ============================================================================

/**
 * 实时读数：机构动画时关节角 / 活塞行程每帧都在变，必须跟着刷新。
 * 单独一个 rAF 节流循环（约 12fps），不牵动整块视口重渲染。
 */
function LiveReadouts({
  model,
  assembled,
}: {
  model: StageModel;
  assembled: AssembledModel | null;
}) {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (!model.readouts) return;
    let raf = 0;
    let last = 0;
    const tick = (time: number) => {
      if (time - last > 80) {
        last = time;
        bump();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [model]);
  if (!assembled || !model.readouts) return null;
  return (
    <>
      {model.readouts(assembled).map((readout) => (
        <span key={readout.label}>
          {readout.label} <span className="num">{readout.value}</span>
        </span>
      ))}
    </>
  );
}

export function Viewport() {
  const modelId = useStageStore((state) => state.modelId);
  const views = useStageStore((state) => state.views);
  const toggleView = useStageStore((state) => state.toggleView);
  const requestViewReset = useStageStore((state) => state.requestViewReset);
  const stats = useStageStore((state) => state.stats);
  const assembled = useStageStore((state) => state.assembled);
  const machineState = useStageStore((state) => state.machineState);
  const selectedPart = useStageStore((state) => state.selectedPart);
  const selectedInstance = useStageStore((state) => state.selectedInstance);
  const detached = useStageStore((state) => state.detached);
  const selectPart = useStageStore((state) => state.selectPart);
  const toggleDetach = useStageStore((state) => state.toggleDetach);
  const hoveredPart = useStageStore((state) => state.hoveredPart);
  const hoveredInstance = useStageStore((state) => state.hoveredInstance);
  const lidOverrides = useStageStore((state) => state.lidOverrides);
  const setLidsOpen = useStageStore((state) => state.setLidsOpen);
  const cameraMode = useStageStore((state) => state.cameraMode);
  const setCameraMode = useStageStore((state) => state.setCameraMode);
  const model = findModel(modelId);
  const stateLabel = model.states?.find((state) => state.id === machineState)?.label ?? machineState;

  // 实例检查器：选中重复件里的某一实例（在视口里直接点中单只负重轮）
  const selectedHandle = selectedPart && assembled ? assembled.getPart(selectedPart) : undefined;
  const instanceCount = selectedHandle?.instances.length ?? 0;
  const inspectInstance = selectedPart !== null && selectedInstance !== null && instanceCount > 1;
  const instanceLabel =
    inspectInstance && selectedPart !== null && selectedInstance !== null
      ? (model.instanceLabel?.(selectedPart, selectedInstance, instanceCount) ?? null)
      : null;
  const instanceDetached =
    inspectInstance && selectedPart !== null && selectedInstance !== null
      ? detached.includes(instanceKey(selectedPart, selectedInstance))
      : false;
  const canDetach =
    inspectInstance && selectedPart !== null && selectedInstance !== null
      ? model.detachOffset?.(selectedPart, selectedInstance, instanceCount) != null
      : false;

  const crewLids = model.lids?.filter((lid) => lid.kind !== "fuel") ?? [];
  const crewOpen =
    crewLids.length > 0 &&
    crewLids.every((lid) => effectiveLidOpen(lid, lidOverrides, machineState));
  const hoverLid = lidAt(hoveredPart, hoveredInstance);
  const hoverLidOpen = hoverLid ? effectiveLidOpen(hoverLid, lidOverrides, machineState) : false;

  return (
    <div className="viewport">
      <div className={`viewport__canvas${views.thermal ? " viewport__canvas--thermal" : ""}`}>
        {/* 三维视口单独设边界：WebGL / 渲染层出问题时只有视口被替换，左右面板照常可用 */}
        <ErrorBoundary scope="三维视口">
          <StageCanvas />
        </ErrorBoundary>
      </div>

      <ClippingDock />
      <IsolationView />
      <PartInfoCard />

      {cameraMode !== "orbit" ? (
        isCarrierInteriorMode(cameraMode) ? (
          <div className="interior-view">
            <div className="interior-view__label">{CAMERA_MODE_LABELS[cameraMode].label}</div>
            <div className="interior-view__hint">{CAMERA_MODE_LABELS[cameraMode].hint}</div>
            <button
              type="button"
              className="btn btn--sm interior-view__exit"
              onClick={() => setCameraMode("orbit")}
            >
              退出内部视角
            </button>
          </div>
        ) : (
          <div className="periscope">
            <div className="periscope__window" aria-hidden />
            <div className="periscope__label">{CAMERA_MODE_LABELS[cameraMode].label}</div>
            <div className="periscope__hint">{CAMERA_MODE_LABELS[cameraMode].hint}</div>
            <button
              type="button"
              className="btn btn--sm periscope__exit"
              onClick={() => setCameraMode("orbit")}
            >
              退出视角
            </button>
          </div>
        )
      ) : null}

      {hoverLid ? (
        <div className="lid-hint" role="status">
          <MousePointerClick size={13} aria-hidden />
          <span>
            点击{hoverLidOpen ? "合上" : "开启"} · {hoverLid.name_cn}
          </span>
        </div>
      ) : null}

      <div className="viewport__overlay viewport__overlay--tl">
        {inspectInstance ? (
          <div className="float-card instance-card">
            <div className="instance-card__head">
              <span>
                实例 <span className="num">{selectedInstance! + 1}</span>
                <span className="instance-card__of"> / {instanceCount}</span>
              </span>
              <span className="instance-card__part" title={selectedPart}>
                {selectedPart!.replace(/^tiger\./, "")}
              </span>
            </div>
            {instanceLabel ? <div className="instance-card__label">{instanceLabel}</div> : null}
            <div className="instance-card__row">
              <button
                type="button"
                className="btn btn--sm"
                onClick={() =>
                  selectPart(selectedPart!, (selectedInstance! - 1 + instanceCount) % instanceCount)
                }
              >
                上一个
              </button>
              <button
                type="button"
                className="btn btn--sm"
                onClick={() => selectPart(selectedPart!, (selectedInstance! + 1) % instanceCount)}
              >
                下一个
              </button>
              {canDetach ? (
                <button
                  type="button"
                  className="btn btn--sm"
                  aria-pressed={instanceDetached}
                  title="把这个实例单独拆下来检查（不改变装配注册表）"
                  onClick={() => toggleDetach(selectedPart!, selectedInstance!)}
                >
                  {instanceDetached ? "装回" : "拆下"}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

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
          {crewLids.length > 0 ? (
            <button
              type="button"
              className="btn btn--sm"
              aria-pressed={crewOpen}
              title="一键开/合全部乘员舱盖；也可以直接点单个盖板开合"
              onClick={() => setLidsOpen(crewLids.map((lid) => lid.key), !crewOpen)}
            >
              <DoorOpen size={13} aria-hidden />
              舱盖
            </button>
          ) : null}
          <button
            type="button"
            className="btn btn--sm"
            aria-pressed={views.thermal}
            title="白热热像仪视角（火控演示）"
            onClick={() => toggleView("thermal")}
          >
            热像
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
            aria-pressed={views.rain}
            title="雨天：雨丝 + 驾驶员观察窗雨刷往复刮水"
            onClick={() => toggleView("rain")}
          >
            <CloudRain size={13} aria-hidden />
            雨天
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
          {model.cameras?.includes("driver") ? (
            <button
              type="button"
              className="btn btn--sm"
              aria-pressed={cameraMode === "driver"}
              title="驾驶席视角：眼点取自驾驶员座椅与仪表板，再点一次回到自由视角"
              onClick={() => setCameraMode(cameraMode === "driver" ? "orbit" : "driver")}
            >
              <Crosshair size={13} aria-hidden />
              驾驶席
            </button>
          ) : null}
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
          <EngineHud />
          {selectedPart ? (
            <span className="viewport__selection" title={selectedPart}>
              选中{" "}
              <span className="num">
                {selectedPart}
                {selectedInstance !== null ? `[${selectedInstance}]` : ""}
              </span>
            </span>
          ) : null}
          <LiveReadouts model={model} assembled={assembled} />
          {views.grid ? <span title="网格格距用于目测尺寸">网格 1 格 = 0.25 m</span> : null}
        </div>
      </div>
    </div>
  );
}
