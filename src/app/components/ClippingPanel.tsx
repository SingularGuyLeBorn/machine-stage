import {
  ChevronDown,
  CircleCheck,
  Crosshair,
  ScanLine,
  SplitSquareHorizontal,
  TriangleAlert,
  UnfoldVertical,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { BUILD_LAYER_LABELS, parseInstanceRef, resolveConstants, type ClippingReport } from "@/three/parts";
import { findModel } from "../catalog";
import { reportKey, reportPartIds, useStageStore } from "../state/stageStore";

// ============================================================================
// ClippingPanel —— 穿模报告（浮层抽屉内容）
//
// 332 条实例级报告不能一屏文字海，所以分三层收敛：
//   1) 家族聚合：同 partId 对折成一行（族名 + ×N 徽章 + depth 徽章 + 层标签）；
//   2) 展开族 → 逐条实例级单行卡片（A ↔ B 截断 + depth + 层）；
//   3) 每条明细里给「飞到穿透点 / 隔离对比」，hint 与常量链只在明细中出现，
//      常量渲染成「名字 = 数值 m」的可读链，不再糊一堆裸大写名。
// 报告按构建进度派生过滤（store 侧保证单调不增）。
// ============================================================================

interface FamilyRow {
  key: string;
  partA: string;
  partB: string;
  nameA: string;
  nameB: string;
  items: Array<{ report: ClippingReport; index: number }>;
  depthMax: number;
  layers: number[];
}

const CONST_NAME = /\b[A-Z][A-Z0-9_]{2,}\b/g;

function buildFamilies(reports: ClippingReport[]): FamilyRow[] {
  const families = new Map<string, FamilyRow>();
  reports.forEach((report, index) => {
    const [partA, partB] = reportPartIds(report);
    const key = `${partA} ↔ ${partB}`;
    const row =
      families.get(key) ??
      ({
        key,
        partA,
        partB,
        nameA: "",
        nameB: "",
        items: [],
        depthMax: 0,
        layers: [],
      } satisfies FamilyRow);
    row.items.push({ report, index });
    row.depthMax = Math.max(row.depthMax, report.depth_mm);
    for (const layer of [report.aLayer, report.bLayer]) {
      if (layer && !row.layers.includes(layer)) row.layers.push(layer);
    }
    families.set(key, row);
  });
  return [...families.values()];
}

/** hint 里的常量名 → 「名字 = 值 m」链（只在明细卡片里出现）。 */
function useConstantChain() {
  const modelId = useStageStore((state) => state.modelId);
  const overrides = useStageStore((state) => state.overrides);
  return useMemo(() => {
    const registry = findModel(modelId).registry;
    if (!registry) return () => [] as Array<{ name: string; value: number | null }>;
    let resolved: Record<string, number> = {};
    try {
      resolved = resolveConstants({ ...registry.constants, ...overrides });
    } catch {
      resolved = {};
    }
    return (hint: string) =>
      [...new Set(hint.match(CONST_NAME) ?? [])].map((name) => ({
        name,
        value: resolved[name] ?? null,
      }));
  }, [modelId, overrides]);
}

function partName(modelId: string, partId: string, fallback: string): string {
  const registry = findModel(modelId).registry;
  const part = registry?.parts.find((item) => item.id === partId);
  return part ? part.name_cn : fallback;
}

export function ClippingPanel() {
  const modelId = useStageStore((state) => state.modelId);
  const reports = useStageStore((state) => state.reports);
  const allCount = useStageStore((state) => state.allReports.length);
  const scanPhase = useStageStore((state) => state.scanPhase);
  const scanKind = useStageStore((state) => state.scanKind);
  const scanMs = useStageStore((state) => state.scanMs);
  const buildIndex = useStageStore((state) => state.buildIndex);
  const activeReport = useStageStore((state) => state.activeReport);
  const isolation = useStageStore((state) => state.isolation);
  const focusPoint = useStageStore((state) => state.focusPoint);
  const selectPart = useStageStore((state) => state.selectPart);
  const openReportIsolation = useStageStore((state) => state.openReportIsolation);
  const runScan = useStageStore((state) => state.runScan);
  const chainOf = useConstantChain();

  const [openFamilies, setOpenFamilies] = useState<Record<string, boolean>>({});
  const [layer, setLayer] = useState<number | "all">("all");

  const scanning = scanPhase === "scanning";
  const families = useMemo(() => buildFamilies(reports), [reports]);
  const visibleFamilies = useMemo(
    () => (layer === "all" ? families : families.filter((family) => family.layers.includes(layer))),
    [families, layer],
  );
  const layers = useMemo(
    () => [...new Set(families.flatMap((family) => family.layers))].sort((a, b) => a - b),
    [families],
  );
  const isolateKey = isolation?.kind === "pair" ? isolation.key : null;

  const flyTo = (report: ClippingReport) => {
    selectPart(parseInstanceRef(report.a).partId);
    focusPoint(report.point, 0.3);
  };

  const openIsolation = (index: number) => {
    const report = reports[index];
    if (!report) return;
    flyTo(report);
    openReportIsolation(index);
  };

  const toggleFamily = (key: string) =>
    setOpenFamilies((previous) => ({ ...previous, [key]: !previous[key] }));
  const setAll = (open: boolean) =>
    setOpenFamilies(Object.fromEntries(visibleFamilies.map((family) => [family.key, open])));

  return (
    <>
      <header className="clip__head">
        <h3 className="clip__title">
          {reports.length > 0 ? (
            <>
              <TriangleAlert size={13} aria-hidden />
              穿模报告 <span className="num">{reports.length}</span>
              {allCount > reports.length ? <span className="clip__muted">/ 共 {allCount}</span> : null}
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
          ) : buildIndex === 0 ? (
            <span>未开始构建：把进度滑杆往右拖，报告会随装配件数重算。</span>
          ) : (
            <>
              <span>
                <CircleCheck size={13} aria-hidden />
                实例级穿模报告为空
              </span>
              <span className="clip__muted">
                {allCount > 0
                  ? `已扫描到的 ${allCount} 条都不在当前进度（${buildIndex} 件）的候选集里。`
                  : "当前装配满足「本层零穿模」验收判据。"}
              </span>
            </>
          )}
        </div>
      ) : (
        <>
          <div className="clip__tools">
            <button type="button" className="btn btn--sm btn--ghost" onClick={() => setAll(true)}>
              <UnfoldVertical size={12} aria-hidden />
              全部展开
            </button>
            <button type="button" className="btn btn--sm btn--ghost" onClick={() => setAll(false)}>
              <ChevronDown size={12} aria-hidden />
              全部收起
            </button>
            <div className="clip__filter">
              <select
                className="select"
                aria-label="按层过滤"
                value={layer}
                onChange={(event) =>
                  setLayer(event.target.value === "all" ? "all" : Number(event.target.value))
                }
              >
                <option value="all">全部层</option>
                {layers.map((item) => (
                  <option key={item} value={item}>
                    L{item} {BUILD_LAYER_LABELS[item]?.name_cn ?? ""}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="clip__list">
            {visibleFamilies.map((family) => {
              const open = openFamilies[family.key] === true;
              const single = family.items.length === 1;
              const first = family.items[0].report;
              const titleA = single ? first.a : family.partA;
              const titleB = single ? first.b : family.partB;
              return (
                <div className="clipfam" key={family.key} data-open={open}>
                  <button
                    type="button"
                    className="clipfam__head"
                    aria-expanded={open}
                    title={open ? "收起该族" : "展开该族的逐条报告"}
                    onClick={() => toggleFamily(family.key)}
                  >
                    <span className="clipfam__chevron">
                      <ChevronDown size={12} aria-hidden />
                    </span>
                    <span className="clipfam__refs">
                      <span className="clipfam__id">{titleA}</span>
                      <span className="clipfam__arrow" aria-hidden>
                        ↔
                      </span>
                      <span className="clipfam__id">{titleB}</span>
                    </span>
                    {!single ? <span className="badge">×{family.items.length}</span> : null}
                    <span className="badge badge--danger num">{family.depthMax.toFixed(2)}mm</span>
                    {family.layers.length > 0 ? (
                      <span className="badge badge--plain">L{family.layers.join("-L")}</span>
                    ) : null}
                  </button>

                  {open ? (
                    <div className="clipfam__items">
                      {family.items.map(({ report, index }) => (
                        <article
                          className="clipcard"
                          key={reportKey(report)}
                          data-active={index === activeReport}
                          data-isolated={reportKey(report) === isolateKey}
                        >
                          <div className="clipcard__row">
                            <span className="clipcard__id" title={report.a}>
                              {report.a}
                            </span>
                            <span className="clipcard__arrow" aria-hidden>
                              ↔
                            </span>
                            <span className="clipcard__id" title={report.b}>
                              {report.b}
                            </span>
                            <span className="badge badge--danger num">{report.depth_mm.toFixed(2)}mm</span>
                            {report.aLayer ? (
                              <span className="badge badge--plain">
                                L{report.aLayer}
                                {report.bLayer && report.bLayer !== report.aLayer ? `-L${report.bLayer}` : ""}
                              </span>
                            ) : null}
                          </div>
                          <p className="clipcard__hint">{report.hint}</p>
                          <div className="clipcard__chain">
                            {chainOf(report.hint).map((constant) => (
                              <span className="constchip" key={constant.name}>
                                <code>{constant.name}</code>
                                {constant.value === null ? (
                                  <em>未定义</em>
                                ) : (
                                  <span className="num">= {constant.value.toFixed(4)} m</span>
                                )}
                              </span>
                            ))}
                          </div>
                          <div className="clipcard__foot">
                            <span className="num">
                              [{report.point.map((value) => value.toFixed(3)).join(", ")}]
                            </span>
                            {report.frame !== null ? <span className="num">帧 {report.frame}</span> : null}
                            {report.estimated ? <span>深度为估算</span> : null}
                            <span className="clipcard__names">
                              {partName(modelId, family.partA, "A")} / {partName(modelId, family.partB, "B")}
                            </span>
                            <div className="clipcard__actions">
                              <button
                                type="button"
                                className="btn btn--sm"
                                title="飞到穿透点并选中 A 件"
                                onClick={() => flyTo(report)}
                              >
                                <Crosshair size={12} aria-hidden />
                                飞到穿透点
                              </button>
                              <button
                                type="button"
                                className="btn btn--sm"
                                title="在隔离小视图里对比这两件"
                                onClick={() => openIsolation(index)}
                              >
                                <SplitSquareHorizontal size={12} aria-hidden />
                                隔离对比
                              </button>
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}

/** 抽屉外壳：收起态只剩视口边缘的按钮（带报告数徽章）。 */
export function ClippingDock() {
  const open = useStageStore((state) => state.layout.drawer.open);
  const width = useStageStore((state) => state.layout.drawer.width);
  const count = useStageStore((state) => state.reports.length);
  const allCount = useStageStore((state) => state.allReports.length);
  const setDrawer = useStageStore((state) => state.setDrawer);
  const setDrawerWidth = useStageStore((state) => state.setDrawerWidth);
  const [dragging, setDragging] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        className="drawer-tab"
        data-alert={count > 0}
        title="打开穿模报告抽屉"
        onClick={() => setDrawer(true)}
      >
        <TriangleAlert size={13} aria-hidden />
        <span className="drawer-tab__label">穿模报告</span>
        <span className="badge badge--danger num">{count}</span>
        {allCount > count ? <span className="drawer-tab__sub">/ {allCount}</span> : null}
      </button>
    );
  }

  return (
    <aside className="drawer" style={{ width }}>
      <div className="drawer__top">
        <span className="drawer__grip" aria-hidden />
        <div className="drawer__spacer" />
        <button
          type="button"
          className="btn btn--sm btn--ghost"
          title="收起报告抽屉"
          aria-label="收起报告抽屉"
          onClick={() => setDrawer(false)}
        >
          <X size={13} aria-hidden />
        </button>
      </div>
      <div className="drawer__body">
        <ClippingPanel />
      </div>
      <div
        className="drawer__resize"
        role="separator"
        aria-label="调整报告抽屉宽度"
        aria-orientation="vertical"
        data-dragging={dragging}
        onPointerDown={(event) => {
          setDragging(true);
          try {
            event.currentTarget.setPointerCapture(event.pointerId);
          } catch {
            /* jsdom / 老浏览器没有指针捕获 */
          }
        }}
        onPointerMove={(event) => {
          if (!dragging) return;
          const host = event.currentTarget.closest(".drawer") as HTMLElement | null;
          if (!host) return;
          const rect = host.getBoundingClientRect();
          // 抽屉贴左边缘：右边缘拖动 = 宽度。
          setDrawerWidth(event.clientX - rect.left);
        }}
        onPointerUp={() => setDragging(false)}
        onPointerCancel={() => setDragging(false)}
      />
    </aside>
  );
}
