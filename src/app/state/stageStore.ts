import * as THREE from "three";
import { create } from "zustand";
import {
  detectStatic,
  detectSweep,
  parseInstanceRef,
  partitionExpectedContacts,
  summarizeReports,
  type AssembledModel,
  type ClippingReport,
  type ContactPartition,
  type PartHandle,
} from "@/three/parts";
import { findModel, type ViewKey } from "../catalog";

// ============================================================================
// stageStore —— 展示台单一状态源
//
// 分工：Viewport 负责「注册表 → AssembledModel → 场景」，其余 UI 只读这里的状态。
// 构建滑杆按 build_order 逐件展开（离散回放），不是按百分比粗切。
// 关键纪律：
//   · 选中源唯一（selectedPart / activeReport 同源），左树、视口、报告、隔离小视图都读它；
//   · 穿模报告与构建进度联动：扫描结果存原值（allReports），显示值按当前进度派生过滤，
//     因此「进度回退 → 报告数单调不增」，且不需要重跑昂贵的检测。
// ============================================================================

export type ScanPhase = "idle" | "scanning" | "ready";

export interface FocusRequest {
  center: [number, number, number];
  radius: number;
  nonce: number;
  /** true = 同时回到初始方位角（重置视角）。 */
  resetAngle?: boolean;
}

export interface StageStats {
  parts: number;
  triangles: number;
}

/** 栏位宽度与显隐（布局自由化）。 */
export interface PanelLayout {
  left: { width: number; open: boolean };
  right: { width: number; open: boolean };
  /** 穿模报告抽屉：收起时只留边缘按钮。 */
  drawer: { open: boolean; width: number };
}

/** 隔离小视图请求：一对穿透零件，或单件聚焦。 */
export type IsolationRequest = { kind: "pair"; key: string } | { kind: "part"; partId: string };

/**
 * 运行故障（白屏防御）：任何环节 throw 都要变成「可读的错误面板」，不许整页空白。
 * 装配、材质、渲染、全局 error/unhandledrejection 都汇聚到这里。
 */
export interface StageFault {
  /** 出错环节（装配 / 渲染 / 检测 / 全局…）。 */
  scope: string;
  message: string;
  stack?: string;
  /** 时间戳（ms），便于区分「同一个错误被重复捕获」。 */
  at: number;
}

/** 把任意抛出物规整成故障对象（Error / string / 未知对象都能读）。 */
export function faultFromError(scope: string, error: unknown): StageFault {
  if (error instanceof Error) {
    return { scope, message: error.message || error.name, stack: error.stack, at: Date.now() };
  }
  if (typeof error === "string") return { scope, message: error, at: Date.now() };
  try {
    const json = JSON.stringify(error);
    return { scope, message: typeof json === "string" ? json : String(error), at: Date.now() };
  } catch {
    return { scope, message: String(error), at: Date.now() };
  }
}

/** 报告稳定标识（跨过滤/重扫保持同一张卡片可被追踪）。 */
export function reportKey(report: ClippingReport): string {
  return `${report.a}|${report.b}|${report.frame ?? "s"}|${report.depth_mm.toFixed(3)}`;
}

/** 报告涉及的零件 ID 集合（家族聚合与进度过滤都用它）。 */
export function reportPartIds(report: ClippingReport): [string, string] {
  return [parseInstanceRef(report.a).partId, parseInstanceRef(report.b).partId];
}

const LAYOUT_DEFAULT: PanelLayout = {
  left: { width: 272, open: true },
  right: { width: 324, open: true },
  drawer: { open: false, width: 360 },
};

const VIEWS_DEFAULT: Record<ViewKey, boolean> = {
  explode: false,
  xray: false,
  labels: false,
  grid: false,
  shadow: true,
};

interface StageState {
  /** 当前模型 id（catalog）。 */
  modelId: string;
  /** 常量覆盖（参数面板写入；重建时优先于注册表默认值）。 */
  overrides: Record<string, number>;
  /** 每次自增触发重建。 */
  rebuildToken: number;

  assembled: AssembledModel | null;
  stats: StageStats | null;

  /** 构建回放：当前显示到第几件（0 = 全部隐藏，orders.length = 全显示）。 */
  buildIndex: number;

  selectedPart: string | null;
  hoveredPart: string | null;
  /** 展开态的报告（与 selectedPart 共用同一选中源的报告侧）。 */
  activeReport: number | null;
  /** 隔离小视图请求（null = 关闭）。 */
  isolation: IsolationRequest | null;

  /** 扫描原值（进度过滤前的全量结果）。 */
  allReports: ClippingReport[];
  /** 显示值：allReports 按当前构建进度派生过滤。 */
  reports: ClippingReport[];
  /** 分层显示值：未豁免（真缺陷候选）/ 已豁免（构造性接触，带命中规则）。 */
  reportPartition: ContactPartition;
  scanPhase: ScanPhase;
  scanKind: "static" | "sweep" | null;
  scanMs: number | null;

  views: Record<ViewKey, boolean>;
  layout: PanelLayout;
  machineState: string;
  focus: FocusRequest | null;
  /** 整机包围盒基准（构建完成后写入；重置视角用）。 */
  home: { center: [number, number, number]; radius: number } | null;
  notice: string | null;
  /** 运行故障：非空时 UI 顶部渲染错误面板（永不白屏）。 */
  fault: StageFault | null;

  // ---- 动作 ----
  setModel(modelId: string): void;
  setParam(name: string, value: number): void;
  resetParams(): void;
  attach(assembled: AssembledModel | null): void;
  detach(): void;
  setStats(stats: StageStats): void;
  setBuildIndex(index: number): void;
  advanceBuild(step: number): void;
  selectPart(partId: string | null): void;
  hoverPart(partId: string | null): void;
  toggleView(key: ViewKey): void;
  setView(key: ViewKey, value: boolean): void;
  setColumnWidth(side: "left" | "right", width: number): void;
  toggleColumn(side: "left" | "right"): void;
  setDrawer(open: boolean): void;
  setDrawerWidth(width: number): void;
  openReportIsolation(index: number): void;
  openPartIsolation(partId: string): void;
  closeIsolation(): void;
  stepReport(delta: number): void;
  setMachineState(state: string): void;
  requestFocus(partId: string): void;
  focusPoint(center: [number, number, number], radius?: number, resetAngle?: boolean): void;
  setHome(center: [number, number, number], radius: number): void;
  requestViewReset(): void;
  runScan(kind: "static" | "sweep"): void;
  setNotice(notice: string | null): void;
  /** 记录运行故障（错误面板数据源）。 */
  reportFault(input: { scope: string; message: string; stack?: string }): void;
  clearFault(): void;
}

/** 当前模型的 build_order 序列（去重升序）——构建回放的刻度。 */
export function buildOrdersOf(modelId: string): number[] {
  const registry = findModel(modelId).registry;
  if (!registry) return [];
  return [...new Set(registry.parts.map((part) => part.build_order))].sort((a, b) => a - b);
}

/** 当前构建进度下应该参与检测/显示的有效零件（null = 全量）。 */
export function buildFilterOf(modelId: string, buildIndex: number): ((handle: PartHandle) => boolean) | null {
  const orders = buildOrdersOf(modelId);
  if (buildIndex >= orders.length) return null;
  const threshold = buildIndex <= 0 ? Number.NEGATIVE_INFINITY : orders[buildIndex - 1];
  return (handle) => handle.buildOrder <= threshold;
}

/** 派生视图：按当前进度过滤报告（顺序不变 → 报告数单调不增）。 */
export function filterReportsByProgress(
  reports: ClippingReport[],
  modelId: string,
  buildIndex: number,
): ClippingReport[] {
  const orders = buildOrdersOf(modelId);
  if (buildIndex >= orders.length) return reports;
  const threshold = buildIndex <= 0 ? Number.NEGATIVE_INFINITY : orders[buildIndex - 1];
  const registry = findModel(modelId).registry;
  if (!registry) return reports;
  const limitOf = new Map(registry.parts.map((part) => [part.id, part.build_order]));
  return reports.filter((report) =>
    reportPartIds(report).every((partId) => (limitOf.get(partId) ?? Number.POSITIVE_INFINITY) <= threshold),
  );
}

const initialModel = findModel("test");

export const useStageStore = create<StageState>((set, get) => ({
  modelId: initialModel.id,
  overrides: {},
  rebuildToken: 0,

  assembled: null,
  stats: null,

  buildIndex: buildOrdersOf(initialModel.id).length,

  selectedPart: null,
  hoveredPart: null,
  activeReport: null,
  isolation: null,

  allReports: [],
  reports: [],
  reportPartition: { active: [], expected: [] },
  scanPhase: "idle",
  scanKind: null,
  scanMs: null,

  views: { ...VIEWS_DEFAULT },
  layout: {
    left: { ...LAYOUT_DEFAULT.left },
    right: { ...LAYOUT_DEFAULT.right },
    drawer: { ...LAYOUT_DEFAULT.drawer },
  },
  machineState: "idle",
  focus: null,
  home: null,
  notice: null,
  fault: null,

  setModel: (modelId) => {
    const model = findModel(modelId);
    if (model.status !== "ready" || model.id === get().modelId) return;
    set({
      modelId,
      overrides: {},
      rebuildToken: get().rebuildToken + 1,
      buildIndex: buildOrdersOf(modelId).length,
      selectedPart: null,
      hoveredPart: null,
      activeReport: null,
      isolation: null,
      allReports: [],
      reports: [],
      reportPartition: { active: [], expected: [] },
      scanPhase: "idle",
      scanKind: null,
      scanMs: null,
      machineState: model.states?.[0]?.id ?? "idle",
      views: { ...VIEWS_DEFAULT },
      focus: null,
      home: null,
      notice: null,
      fault: null,
    });
  },

  setParam: (name, value) =>
    set((state) => ({
      overrides: { ...state.overrides, [name]: value },
      rebuildToken: state.rebuildToken + 1,
    })),

  resetParams: () => set((state) => ({ overrides: {}, rebuildToken: state.rebuildToken + 1 })),

  attach: (assembled) => {
    set({ assembled });
    get().runScan("static");
  },

  detach: () => set({ assembled: null, stats: null }),

  setStats: (stats) => set({ stats }),

  setBuildIndex: (index) => {
    const model = findModel(get().modelId);
    const orders = buildOrdersOf(model.id);
    const clamped = Math.max(0, Math.min(orders.length, Math.round(index)));
    const assembled = get().assembled;
    if (assembled) {
      if (clamped <= 0) assembled.setBuildThreshold(-1);
      else if (clamped >= orders.length) assembled.setBuildThreshold(null);
      else assembled.setBuildThreshold(orders[clamped - 1]);
    }
    set((state) => {
      // 显示值立刻按新进度重算（单调不增），选中项越界则清空。
      const reports = filterReportsByProgress(state.allReports, model.id, clamped);
      return {
        buildIndex: clamped,
        reports,
        reportPartition: splitReports(model.id, reports),
        activeReport:
          state.activeReport !== null && state.activeReport < reports.length ? state.activeReport : null,
      };
    });
  },

  advanceBuild: (step) => get().setBuildIndex(get().buildIndex + step),

  selectPart: (partId) => set({ selectedPart: partId, activeReport: null }),

  hoverPart: (partId) => set({ hoveredPart: partId }),

  toggleView: (key) => set((state) => ({ views: { ...state.views, [key]: !state.views[key] } })),
  setView: (key, value) => set((state) => ({ views: { ...state.views, [key]: value } })),

  setColumnWidth: (side, width) =>
    set((state) => ({
      layout: {
        ...state.layout,
        [side]: { ...state.layout[side], width: Math.max(188, Math.min(520, Math.round(width))) },
      },
    })),

  toggleColumn: (side) =>
    set((state) => ({
      layout: { ...state.layout, [side]: { ...state.layout[side], open: !state.layout[side].open } },
    })),

  setDrawer: (open) =>
    set((state) => ({ layout: { ...state.layout, drawer: { ...state.layout.drawer, open } } })),

  setDrawerWidth: (width) =>
    set((state) => ({
      layout: {
        ...state.layout,
        drawer: { ...state.layout.drawer, width: Math.max(288, Math.min(620, Math.round(width))) },
      },
    })),

  openReportIsolation: (index) => {
    const report = get().reports[index];
    if (!report) return;
    set({ isolation: { kind: "pair", key: reportKey(report) }, activeReport: index });
  },

  openPartIsolation: (partId) => set({ isolation: { kind: "part", partId } }),

  closeIsolation: () => set({ isolation: null }),

  stepReport: (delta) => {
    const { reports, isolation } = get();
    if (isolation?.kind !== "pair" || reports.length === 0) return;
    const current = reports.findIndex((report) => reportKey(report) === isolation.key);
    const next = ((current >= 0 ? current : 0) + delta + reports.length * 2) % reports.length;
    const report = reports[next];
    // 先选中 A 件（selectPart 会清掉报告选中），再把报告侧选中写回。
    get().selectPart(parseInstanceRef(report.a).partId);
    get().focusPoint(report.point, 0.3);
    set({ isolation: { kind: "pair", key: reportKey(report) }, activeReport: next });
  },

  setMachineState: (state) => {
    const allowed = findModel(get().modelId).states;
    if (allowed && !allowed.some((item) => item.id === state)) return;
    set({ machineState: state });
  },

  requestFocus: (partId) => {
    const assembled = get().assembled;
    if (!assembled) return;
    const handle = assembled.getPart(partId);
    if (!handle) return;
    const box = assembled.partBounds(handle, new THREE.Box3());
    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    get().focusPoint([center.x, center.y, center.z], Math.max(size.length() * 0.5, 0.18));
  },

  focusPoint: (center, radius = 0.8, resetAngle = false) =>
    set((state) => ({ focus: { center, radius, nonce: (state.focus?.nonce ?? 0) + 1, resetAngle } })),

  setHome: (center, radius) => set({ home: { center, radius } }),

  requestViewReset: () => {
    const { home } = get();
    if (!home) return;
    get().focusPoint(home.center, home.radius, true);
  },

  runScan: (kind) => {
    const { assembled, machineState, modelId, buildIndex } = get();
    if (!assembled) return;
    const model = findModel(modelId);
    const previousState = machineState === "scanning" ? "idle" : machineState;
    const filter = buildFilterOf(modelId, buildIndex) ?? undefined;
    set({
      scanPhase: "scanning",
      scanKind: kind,
      allReports: [],
      reports: [],
      notice: null,
      machineState: "scanning",
    });
    // 检测是同步纯计算：先让浏览器画出「扫描中」，再跑检测。
    setTimeout(() => {
      const state = useStageStore.getState();
      if (state.assembled !== assembled) return; // 模型已重建/卸载
      const started = performance.now();
      let raw: ClippingReport[] = [];
      try {
        raw =
          kind === "sweep"
            ? detectSweep(assembled, {
                duration: 3,
                fps: 30,
                filter,
                applyPose: (t) => {
                  assembled.resetNodes();
                  model.animate?.(assembled, t);
                },
              })
            : detectStatic(assembled, { filter });
      } catch (error) {
        state.reportFault(faultFromError("穿模检测", error));
      }
      assembled.resetNodes();
      if (model.animate) model.animate(assembled, 0);
      const reports = filterReportsByProgress(raw, modelId, state.buildIndex);
      set({
        allReports: raw,
        reports,
        reportPartition: splitReports(modelId, reports),
        scanPhase: "ready",
        scanKind: kind,
        scanMs: Math.round(performance.now() - started),
        machineState: previousState,
      });
    }, 0);
  },

  setNotice: (notice) => set({ notice }),

  reportFault: ({ scope, message, stack }) => set({ fault: { scope, message, stack, at: Date.now() } }),

  clearFault: () => set({ fault: null }),
}));

/** 报告分层（按当前模型注册表的白名单：构造性接触豁免，真缺陷不豁免）。 */
export function splitReports(modelId: string, reports: ClippingReport[]): ContactPartition {
  return partitionExpectedContacts(reports, findModel(modelId).registry?.expectedContacts ?? []);
}

/** 报告汇总（UI 徽标用）。 */
export function reportSummary(reports: ClippingReport[]) {
  return summarizeReports(reports);
}
