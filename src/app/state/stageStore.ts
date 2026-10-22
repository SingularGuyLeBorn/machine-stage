import * as THREE from "three";
import { create } from "zustand";
import {
  detectStatic,
  detectSweep,
  parseInstanceRef,
  partitionExpectedContacts,
  sortReports,
  summarizeReports,
  type AssembledModel,
  type ClippingReport,
  type ContactPartition,
  type DamageState,
  type OverlapForm,
  type PartHandle,
} from "@/three/parts";
import { findModel, type ViewKey } from "../catalog";
import type { CameraMode } from "../three/viewpoints";
import { setDamageSeed } from "@/three/parts/models/tiger/damage/plan";
import { resetTigerLidPose } from "@/three/parts/models/tiger/lids";

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
  /** true = 直接切到取景位，不做飞行动画（模型切换时避免相机穿过船体）。 */
  instant?: boolean;
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
  const depth = report.depth_mm === null ? "c" : report.depth_mm.toFixed(3);
  return `${report.a}|${report.b}|${report.frame ?? "s"}|${depth}`;
}

/** 相交形态的中文标签（卡片显示；判定树四类）。 */
export function formLabel(form?: OverlapForm): string {
  if (form === "bearing_overlap") return "绕轴闭合·配合面";
  if (form === "face_mate") return "共面贴合";
  if (form === "displaced") return "局部成团·错位穿透";
  if (form === "suspect") return "成团·存疑穿透";
  return "形态未知";
}

/**
 * 报告度量文案：实测深度优先；测不出（depth_mm = null）时给「交线 XXmm」，
 * 绝不拿 AABB 交叠尺寸冒充深度（旧卡片会出现 125.60mm 假数字）。
 */
export function formatReportMeasure(report: ClippingReport): string {
  if (report.depth_mm !== null) return `${report.depth_mm.toFixed(2)}mm`;
  const line = report.intersection_mm;
  return line === undefined ? "交线 —" : `交线 ${line.toFixed(1)}mm`;
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
  rain: false,
  thermal: false,
};

interface StageState {
  /** 当前模型 id（catalog）。 */
  modelId: string;
  /** 当前变体 id（模型有 variants 时的选择；空 = 用第一个）。 */
  variantId: string;
  /** 常量覆盖（参数面板写入；重建时优先于注册表默认值）。 */
  overrides: Record<string, number>;
  /** 每次自增触发重建。 */
  rebuildToken: number;

  assembled: AssembledModel | null;
  stats: StageStats | null;

  /** 构建回放：当前显示到第几件（0 = 全部隐藏，orders.length = 全显示）。 */
  buildIndex: number;

  selectedPart: string | null;
  /** 选中零件内的实例序号（InstancedMesh 的 instanceId；null = 整件）。 */
  selectedInstance: number | null;
  hoveredPart: string | null;
  hoveredInstance: number | null;
  /** 单实例拆解（`partId#index`）—— 负重轮可单独拆下。 */
  detached: string[];
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
  /** 相机模式：自由视角 / 第一人称（驾驶员潜望镜 / 车长指挥塔）。 */
  cameraMode: CameraMode;
  /** 战损形态（完好/破损/破碎）：只切预制变体，不影响碰撞与支撑检测。 */
  damage: DamageState;
  /** 随机破口种子：每次「随机破口」+1，重建时由 damage kit 读取。 */
  damageSeed: number;
  /** 舱盖/加油口盖的用户开合覆盖（键 = partId#instance；缺省用 lids 注册表默认值）。 */
  lidOverrides: Record<string, boolean>;
  /** 重掷破口时重建不重置相机（避免用户刚对准又被拉回默认视角）。 */
  preserveViewOnRebuild: boolean;
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
  selectPart(partId: string | null, instance?: number | null): void;
  hoverPart(partId: string | null, instance?: number | null): void;
  /** 单实例拆下 / 装回（含附属件，由模型的 detachKeys 决定）。 */
  toggleDetach(partId: string, index: number): void;
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
  setCameraMode(mode: CameraMode): void;
  setDamage(state: DamageState): void;
  /** 换一组随机破口并切到破碎，触发重建。 */
  rerollDamage(): void;
  setLidOpen(key: string, open: boolean): void;
  setLidsOpen(keys: readonly string[], open: boolean): void;
  /** 切换模型变体（同一模型的不同版本：原型 / 机械拆解版）。 */
  setVariant(variantId: string): void;
  requestFocus(partId: string): void;
  focusPoint(center: [number, number, number], radius?: number, resetAngle?: boolean, instant?: boolean): void;
  setHome(center: [number, number, number], radius: number): void;
  requestViewReset(instant?: boolean): void;
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

interface ScanWorkerResult {
  reports?: ClippingReport[];
  scanMs?: number;
  error?: string;
}

let scanWorkers: Worker[] = [];
let scanEpoch = 0;
/** 同一装配的静态扫描结果：几何没变时「重扫」直接复用（attach 新装配时清空）。 */
let lastStaticScan: { target: AssembledModel; reports: ClippingReport[] } | null = null;

/** 取消在跑的扫描（切模型 / 重建 / 重新扫描）：旧结果一律作废。 */
function cancelScanWorker() {
  scanEpoch += 1;
  for (const worker of scanWorkers) worker.terminate();
  scanWorkers = [];
}

export const useStageStore = create<StageState>((set, get) => ({
  modelId: initialModel.id,
  variantId: initialModel.variants?.[0]?.id ?? "",
  overrides: {},
  rebuildToken: 0,

  assembled: null,
  stats: null,

  buildIndex: buildOrdersOf(initialModel.id).length,

  selectedPart: null,
  selectedInstance: null,
  hoveredPart: null,
  hoveredInstance: null,
  detached: [],
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
  cameraMode: "orbit",
  damage: "intact",
  damageSeed: 0,
  lidOverrides: {},
  preserveViewOnRebuild: false,
  focus: null,
  home: null,
  notice: null,
  fault: null,

  setModel: (modelId) => {
    const model = findModel(modelId);
    if (model.status !== "ready" || model.id === get().modelId) return;
    cancelScanWorker();
    setDamageSeed(0);
    resetTigerLidPose();
    set({
      modelId,
      overrides: {},
      rebuildToken: get().rebuildToken + 1,
      buildIndex: buildOrdersOf(modelId).length,
      selectedPart: null,
      selectedInstance: null,
      hoveredPart: null,
      hoveredInstance: null,
      detached: [],
      activeReport: null,
      isolation: null,
      allReports: [],
      reports: [],
      reportPartition: { active: [], expected: [] },
      scanPhase: "idle",
      scanKind: null,
      scanMs: null,
      machineState: model.states?.[0]?.id ?? "idle",
      cameraMode: "orbit",
      damage: "intact",
      damageSeed: 0,
      lidOverrides: {},
      preserveViewOnRebuild: false,
      variantId: model.variants?.[0]?.id ?? "",
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
    // 切换模型时不再自动跑整机静态扫描：MBT 级模型一次扫描数十秒，
    // 会把主线程卡住。改为按需扫描（ClippingPanel / 动画面板手动触发）。
    cancelScanWorker();
    lastStaticScan = null;
    const state = get();
    set({
      assembled,
      scanPhase: "idle",
      scanKind: null,
      allReports: [],
      reports: [],
      reportPartition: { active: [], expected: [] },
      scanMs: null,
      // 装配/重建会取消扫描：别把状态机留在 scanning（旧装配的扫描已作废）。
      machineState:
        state.machineState === "scanning"
          ? (findModel(state.modelId).states?.[0]?.id ?? "idle")
          : state.machineState,
    });
  },

  detach: () => {
    cancelScanWorker();
    lastStaticScan = null;
    set({ assembled: null, stats: null, scanPhase: "idle", scanKind: null });
  },

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
      // 特效件（tags: fx）不跟构建滑杆显示，只由动画在击发窗口内点亮；海面/尾流常显
      for (const handle of assembled.parts) {
        if (handle.def.tags?.includes("fx") && !handle.def.id.startsWith("carrier.sea.")) {
          handle.object.visible = false;
        }
      }
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

  selectPart: (partId, instance = null) =>
    set({ selectedPart: partId, selectedInstance: instance, hoveredInstance: null, activeReport: null }),

  hoverPart: (partId, instance = null) => set({ hoveredPart: partId, hoveredInstance: instance }),

  toggleDetach: (partId, index) =>
    set((state) => {
      const model = findModel(state.modelId);
      const handle = state.assembled?.getPart(partId);
      const count = handle?.instances.length ?? 1;
      const keys = model.detachKeys?.(partId, index, count) ?? [`${partId}#${index}`];
      const attached = keys.every((key) => state.detached.includes(key));
      return {
        detached: attached
          ? state.detached.filter((key) => !keys.includes(key))
          : [...state.detached, ...keys.filter((key) => !state.detached.includes(key))],
      };
    }),

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

  setVariant: (variantId: string) => {
    const model = findModel(get().modelId);
    if (!model.variants?.some((item) => item.id === variantId)) return;
    set({ variantId, selectedPart: null, selectedInstance: null, detached: [] });
  },

  setMachineState: (state) => {
    const allowed = findModel(get().modelId).states;
    if (allowed && !allowed.some((item) => item.id === state)) return;
    set({ machineState: state });
  },

  // 相机模式与机器状态解耦：切状态不该把人从驾驶舱里踢出来。
  setCameraMode: (mode) => set({ cameraMode: mode }),

  setDamage: (damage) => set({ damage }),

  rerollDamage: () => {
    const seed = get().damageSeed + 1;
    setDamageSeed(seed);
    set({
      damageSeed: seed,
      damage: "broken",
      preserveViewOnRebuild: true,
      rebuildToken: get().rebuildToken + 1,
    });
  },

  setLidOpen: (key, open) =>
    set((state) => ({
      lidOverrides: { ...state.lidOverrides, [key]: open },
    })),

  setLidsOpen: (keys, open) =>
    set((state) => {
      const lidOverrides = { ...state.lidOverrides };
      for (const key of keys) lidOverrides[key] = open;
      return { lidOverrides };
    }),

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

  focusPoint: (center, radius = 0.8, resetAngle = false, instant = false) =>
    set((state) => ({ focus: { center, radius, nonce: (state.focus?.nonce ?? 0) + 1, resetAngle, instant } })),

  setHome: (center, radius) => set({ home: { center, radius } }),

  requestViewReset: (instant = false) => {
    const { home } = get();
    if (!home) return;
    get().focusPoint(home.center, home.radius, true, instant);
  },

  runScan: (kind) => {
    const { assembled, machineState, modelId, variantId, overrides, buildIndex, damageSeed } = get();
    if (!assembled) return;
    // 切模型瞬间 modelId 已更新、旧装配还没卸下：此时扫描会用错进度/错模型。
    if (assembled.root.name !== modelId) return;
    const model = findModel(modelId);
    const previousState = machineState === "scanning" ? "idle" : machineState;
    cancelScanWorker();
    // 同一装配（几何未变）的静态结果可直接复用，避免重复起 8 个 Worker。
    if (kind === "static" && lastStaticScan?.target === assembled) {
      const shown = filterReportsByProgress(lastStaticScan.reports, modelId, buildIndex);
      set({
        scanPhase: "ready",
        scanKind: "static",
        allReports: lastStaticScan.reports,
        reports: shown,
        reportPartition: splitReports(modelId, shown),
        scanMs: 0,
        notice: "装配未变，复用上次静态扫描结果",
        machineState: previousState,
      });
      return;
    }
    const epoch = scanEpoch;
    set({
      scanPhase: "scanning",
      scanKind: kind,
      allReports: [],
      reports: [],
      notice: null,
      machineState: "scanning",
    });

    const finish = (raw: ClippingReport[], scanMs: number, reusable = true) => {
      const state = useStageStore.getState();
      if (state.modelId !== modelId || state.assembled !== assembled) return;
      if (reusable && kind === "static") lastStaticScan = { target: assembled, reports: raw };
      const reports = filterReportsByProgress(raw, modelId, state.buildIndex);
      set({
        allReports: raw,
        reports,
        reportPartition: splitReports(modelId, reports),
        scanPhase: "ready",
        scanKind: kind,
        scanMs,
        machineState: state.machineState === "scanning" ? previousState : state.machineState,
      });
    };

    const fail = (error: unknown) => {
      useStageStore.getState().reportFault(faultFromError("穿模检测", error));
      finish([], 0, false);
    };

    // 有 Worker：检测在后台重建 + 跑 BVH；MBT/ED 级模型再按候选对拆给多个 Worker。
    if (typeof Worker !== "undefined" && import.meta.env.MODE !== "test") {
      const cores = typeof navigator !== "undefined" ? (navigator.hardwareConcurrency ?? 4) : 4;
      const activeRegistry = model.variants?.find((item) => item.id === variantId)?.registry ?? model.registry;
      const definitionCount = activeRegistry?.parts.length ?? 0;
      // 大模型按候选对拆片；每片重建一次模型 + 独立 BVH，8 片在 16 核上摊得开。
      const shardCount =
        kind === "static" && definitionCount >= 500 ? Math.min(8, Math.max(1, cores - 1)) : 1;
      const reports: ClippingReport[] = [];
      const started = performance.now();
      let pending = shardCount;
      let failed = false;
      let created = 0;

      const settle = (error?: unknown) => {
        if (epoch !== scanEpoch) return;
        if (error !== undefined) {
          if (failed) return;
          failed = true;
          cancelScanWorker();
          fail(error);
          return;
        }
        pending -= 1;
        if (pending === 0) finish(sortReports(reports), Math.round(performance.now() - started));
      };

      try {
        for (let shardIndex = 0; shardIndex < shardCount; shardIndex++) {
          const worker = new Worker(new URL("./scan.worker.ts", import.meta.url), { type: "module" });
          created += 1;
          scanWorkers.push(worker);
          worker.onmessage = (event: MessageEvent<ScanWorkerResult>) => {
            if (epoch !== scanEpoch) return;
            worker.terminate();
            scanWorkers = scanWorkers.filter((item) => item !== worker);
            const data = event.data;
            if (data.error !== undefined) {
              settle(new Error(data.error));
              return;
            }
            if (data.reports) for (const report of data.reports) reports.push(report);
            settle();
          };
          worker.onerror = (event) => {
            if (epoch !== scanEpoch) return;
            event.preventDefault();
            worker.terminate();
            scanWorkers = scanWorkers.filter((item) => item !== worker);
            settle(new Error(event.message || "扫描 Worker 异常"));
          };
          worker.postMessage({
            modelId,
            variantId,
            overrides,
            kind,
            state: previousState,
            buildIndex,
            damageSeed,
            shardIndex,
            shardCount,
          });
        }
        return;
      } catch (error) {
        if (created > 0) {
          cancelScanWorker();
          fail(error);
          return;
        }
        // 一个 Worker 都没起来（旧浏览器 / 非模块环境）→ 走下面的主线程兜底。
      }
    }

    // 无 Worker 环境（jsdom / 测试）：主线程同步检测，先让浏览器画出「扫描中」。
    const filter = buildFilterOf(modelId, buildIndex) ?? undefined;
    setTimeout(() => {
      if (epoch !== scanEpoch) return; // 已切换模型 / 重新扫描
      const state = useStageStore.getState();
      if (state.assembled !== assembled) return; // 模型已重建/卸载
      const started = performance.now();
      let raw: ClippingReport[] = [];
      try {
        // 静态检测必须在装配态：悬挂动画把负重轮抬起时扫，会凭空多出一堆报告
        assembled.resetNodes();
        model.animate?.(assembled, 0, previousState);
        raw =
          kind === "sweep"
            ? detectSweep(assembled, {
                duration: 3,
                fps: 30,
                filter,
                applyPose: (t) => {
                  assembled.resetNodes();
                  // 传入当前状态：原来的扫掠没传 state，实际只扫到悬挂默认动画
                  model.animate?.(assembled, t, previousState);
                },
              })
            : detectStatic(assembled, { filter });
      } catch (error) {
        state.reportFault(faultFromError("穿模检测", error));
      }
      assembled.resetNodes();
      if (model.animate) model.animate(assembled, 0);
      finish(raw, Math.round(performance.now() - started));
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
