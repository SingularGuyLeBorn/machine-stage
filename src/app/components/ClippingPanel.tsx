import { CircleCheck, Crosshair, ScanLine, TriangleAlert } from "lucide-react";
import { BUILD_LAYER_LABELS, parseInstanceRef } from "@/three/parts";
import { useStageStore } from "../state/stageStore";

// ============================================================================
// ClippingPanel —— 穿模报告浮层（中栏左上角）
//
// 报告是实例级的（a/b = `零件ID[实例下标]`）；点一条 → 相机飞到穿透点并选中 a 件。
// 空报告 + 扫描完成 = 本层验收通过（绿色卡片）。
// ============================================================================

export function ClippingPanel() {
  const reports = useStageStore((state) => state.reports);
  const scanPhase = useStageStore((state) => state.scanPhase);
  const scanKind = useStageStore((state) => state.scanKind);
  const scanMs = useStageStore((state) => state.scanMs);
  const focusPoint = useStageStore((state) => state.focusPoint);
  const selectPart = useStageStore((state) => state.selectPart);
  const runScan = useStageStore((state) => state.runScan);

  const scanning = scanPhase === "scanning";

  return (
    <div className="float-card clip">
      <header className="clip__head">
        <h3 className="clip__title">
          {reports.length > 0 ? (
            <>
              <TriangleAlert size={13} aria-hidden style={{ verticalAlign: "-2px", marginRight: 4 }} />
              穿模报告 <span className="num">{reports.length}</span>
            </>
          ) : (
            "穿模报告"
          )}
        </h3>
        <span className="clip__scan">
          {scanning
            ? "扫描中…"
            : scanMs !== null
              ? `${scanKind === "sweep" ? "扫掠" : "静态"} · ${scanMs} ms`
              : "待扫描"}
        </span>
        <button type="button" className="btn btn--sm" onClick={() => runScan("static")} disabled={scanning}>
          <ScanLine size={12} aria-hidden />
          重扫
        </button>
      </header>

      {reports.length === 0 ? (
        <div className="clip__ok">
          {scanning ? (
            <span>正在逐对检查实例级干涉…</span>
          ) : (
            <>
              <span>
                <CircleCheck size={13} aria-hidden style={{ verticalAlign: "-2px", marginRight: 4 }} />
                实例级穿模报告为空
              </span>
              <span className="muted" style={{ color: "inherit", opacity: 0.75 }}>
                当前装配满足「本层零穿模」验收判据。
              </span>
            </>
          )}
        </div>
      ) : (
        reports.map((report) => (
          <button
            key={`${report.a}-${report.b}-${report.frame ?? "s"}-${report.depth_mm}`}
            type="button"
            className="clip__item"
            title="点击飞到穿透点并选中 A 件"
            onClick={() => {
              selectPart(parseInstanceRef(report.a).partId);
              focusPoint(report.point, 0.3);
            }}
          >
            <span className="clip__refs">
              <span>{report.a}</span>
              <span aria-hidden>↔</span>
              <span>{report.b}</span>
              <span className="clip__depth num">{report.depth_mm.toFixed(2)}mm</span>
            </span>
            <span className="clip__hint">{report.hint}</span>
            <span className="clip__foot">
              <Crosshair size={10} aria-hidden />
              <span className="num">[{report.point.map((value) => value.toFixed(3)).join(", ")}]</span>
              {report.frame !== null ? <span className="num">帧 {report.frame}</span> : null}
              {report.aLayer ? (
                <span>
                  L{report.aLayer}
                  {report.bLayer && report.bLayer !== report.aLayer ? `-L${report.bLayer}` : ""}{" "}
                  {BUILD_LAYER_LABELS[report.aLayer]?.name_cn}
                </span>
              ) : null}
              {report.estimated ? <span>深度为估算</span> : null}
            </span>
          </button>
        ))
      )}
    </div>
  );
}
