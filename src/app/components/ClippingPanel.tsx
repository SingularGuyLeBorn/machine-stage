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
import {
  BUILD_LAYER_LABELS,
  expectedContactFamilies,
  parseInstanceRef,
  resolveConstants,
  type ClippingReport,
} from "@/three/parts";
import { findModel } from "../catalog";
import { formatReportMeasure, reportKey, reportPartIds, formLabel, useStageStore } from "../state/stageStore";

// ============================================================================
// ClippingPanel —— 穿模报告（浮层抽屉内容）
//
// 口径：目标函数是「未豁免报告 = 0」，不是「总报告 = 0」。
//   1) 未豁免（真缺陷候选）：家族聚合 → 展开族 → 逐条实例级卡片（飞/隔离）；
//   2) 已豁免（构造性接触：轴承配合/过盈压装/剖分贴合/管端插接）：收起区，
//      按豁免族分组给出依据与逐条明细（仍可飞到穿透点 / 隔离对比）。
// 报告按构建进度派生过滤（store 侧保证单调不增）。
// ============================================================================

interface FamilyRow {
  key: string;
  partA: string;
  partB: string;
  nameA: string;
  nameB: string;
  items: Array<{ report: ClippingReport; index: number }>;
  /** 族内最深实测深度（mm）；全族都测不出深度时为 null。 */
  depthMax: number | null;
  /** 族内最长交线（mm）：深度测不出时的规模口径。 */
  lineMax: number;
  layers: number[];
}

const CONST_NAME = /\b[A-Z][A-Z0-9_]{2,}\b/g;

function buildFamilies(items: Array<{ report: ClippingReport; index: number }>): FamilyRow[] {
  const families = new Map<string, FamilyRow>();
  items.forEach(({ report, index }) => {
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
        depthMax: null,
        lineMax: 0,
        layers: [],
      } satisfies FamilyRow);
    row.items.push({ report, index });
    if (report.depth_mm !== null) {
      row.depthMax = Math.max(row.depthMax ?? 0, report.depth_mm);
    }
    row.lineMax = Math.max(row.lineMax, report.intersection_mm ?? 0);
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
  const partition = useStageStore((state) => state.reportPartition);
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
  const [expectedOpen, setExpectedOpen] = useState(false);
  const [layer, setLayer] = useState<number | "all">("all");

  const scanning = scanPhase === "scanning";
  const activeCount = partition.active.length;
  const expectedCount = partition.expected.length;
  const families = useMemo(() => buildFamilies(partition.active), [partition]);
  const expectedFamilies = useMemo(() => expectedContactFamilies(partition.expected), [partition]);
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
          {activeCount > 0 ? (
            <>
              <TriangleAlert size={13} aria-hidden />
              未豁免报告 <span className="num">{activeCount}</span>
            </>
          ) : (
            "未豁免报告"
          )}
        </h3>
        <span className="clip__muted">
          {expectedCount > 0 ? `已豁免 ${expectedCount}` : null}
          {allCount > reports.length ? ` / 共 ${allCount}` : null}
        </span>
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

      {activeCount === 0 ? (
        <div className="clip__ok">
          {scanning ? (
            <span>正在逐对检查实例级干涉…</span>
          ) : buildIndex === 0 ? (
            <span>未开始构建：把进度滑杆往右拖，报告会随装配件数重算。</span>
          ) : (
            <>
              <span>
                <CircleCheck size={13} aria-hidden />
                未豁免报告 = 0
              </span>
              <span className="clip__muted">
                {expectedCount > 0
                  ? `${expectedCount} 条构造性接触（轴承配合/过盈压装/剖分贴合/管端插接）已按白名单豁免：装配咬合不是缺陷。`
                  : allCount > 0
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
                    {family.depthMax !== null ? (
                      <span className="badge badge--danger num">{family.depthMax.toFixed(2)}mm</span>
                    ) : (
                      <span className="badge badge--plain num">交线 {family.lineMax.toFixed(1)}mm</span>
                    )}
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
                            <span
                              className={
                                report.depth_mm === null
                                  ? "badge badge--plain num"
                                  : "badge badge--danger num"
                              }
                            >
                              {formatReportMeasure(report)}
                            </span>
                            {report.form ? (
                              <span className="badge badge--plain">{formLabel(report.form)}</span>
                            ) : null}
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
                            {report.estimated ? (
                              <span>{report.depth_mm === null ? "深度未测出" : "深度为估算"}</span>
                            ) : null}
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

      {expectedCount > 0 ? (
        <section className="clipexp" data-open={expectedOpen}>
          <button
            type="button"
            className="clipexp__head"
            aria-expanded={expectedOpen}
            title="已豁免的构造性接触：装配咬合不是缺陷（每族 1 张隔离视图截图在 docs/qa/whitelist/）"
            onClick={() => setExpectedOpen((previous) => !previous)}
          >
            <span className="clipexp__chevron">
              <ChevronDown size={12} aria-hidden />
            </span>
            <span className="clipexp__title">已豁免构造性接触</span>
            <span className="badge badge--plain num">{expectedCount}</span>
          </button>

          {expectedOpen ? (
            <div className="clipexp__list">
              {expectedFamilies.map((family) => (
                <article className="clipexp__family" key={family.family}>
                  <div className="clipexp__familyhead">
                    <code title={`docs/qa/whitelist/${family.family}.png`}>{family.family}</code>
                    <span className="badge badge--plain num">×{family.items.length}</span>
                  </div>
                  <p className="clipexp__reason">{family.reason}</p>
                  <ul className="clipexp__items">
                    {family.items.map((item) => (
                      <li key={reportKey(item.report)}>
                        <span className="clipcard__id" title={item.report.a}>
                          {item.report.a}
                        </span>
                        <span className="clipcard__arrow" aria-hidden>
                          ↔
                        </span>
                        <span className="clipcard__id" title={item.report.b}>
                          {item.report.b}
                        </span>
                        <span className="badge badge--plain num">{formatReportMeasure(item.report)}</span>
                        {item.report.form ? (
                          <span className="badge badge--plain">{formLabel(item.report.form)}</span>
                        ) : null}
                        <div className="clipcard__actions">
                          <button
                            type="button"
                            className="btn btn--sm btn--ghost"
                            title="飞到穿透点"
                            aria-label="飞到穿透点"
                            onClick={() => flyTo(item.report)}
                          >
                            <Crosshair size={12} aria-hidden />
                          </button>
                          <button
                            type="button"
                            className="btn btn--sm"
                            title="在隔离小视图里对比这两件"
                            aria-label="隔离对比"
                            onClick={() => openIsolation(item.index)}
                          >
                            <SplitSquareHorizontal size={12} aria-hidden />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}
    </>
  );
}

/** 抽屉外壳：收起态只剩视口边缘的按钮（带报告数徽章）。 */
export function ClippingDock() {
  const open = useStageStore((state) => state.layout.drawer.open);
  const width = useStageStore((state) => state.layout.drawer.width);
  const count = useStageStore((state) => state.reportPartition.active.length);
  const expectedCount = useStageStore((state) => state.reportPartition.expected.length);
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
        <span className="drawer-tab__label">未豁免报告</span>
        <span className="badge badge--danger num">{count}</span>
        {expectedCount > 0 ? <span className="drawer-tab__sub">豁免 {expectedCount}</span> : null}
        {allCount > count + expectedCount ? <span className="drawer-tab__sub">/ {allCount}</span> : null}
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
