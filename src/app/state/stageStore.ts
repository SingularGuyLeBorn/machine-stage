import * as THREE from "three";
import { create } from "zustand";
import {
  detectStatic,
  detectSweep,
  summarizeReports,
  type AssembledModel,
  type ClippingReport,
} from "@/three/parts";
import { findModel, type ViewKey } from "../catalog";

// ============================================================================
// stageStore —— 展示台单一状态源
//
// 分工：Viewport 负责「注册表 → AssembledModel → 场景」，其余 UI 只读这里的状态。
// 构建滑杆按 build_order 逐件展开（离散回放），不是按百分比粗切。
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

  reports: ClippingReport[];
  scanPhase: ScanPhase;
  scanKind: "static" | "sweep" | null;
  scanMs: number | null;

  views: Record<ViewKey, boolean>;
  machineState: string;
  focus: FocusRequest | null;
  /** 整机包围盒基准（构建完成后写入；重置视角用）。 */
  home: { center: [number, number, number]; radius: number } | null;
  notice: string | null;

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
  setMachineState(state: string): void;
  requestFocus(partId: string): void;
  focusPoint(center: [number, number, number], radius?: number, resetAngle?: boolean): void;
  setHome(center: [number, number, number], radius: number): void;
  requestViewReset(): void;
  runScan(kind: "static" | "sweep"): void;
  setNotice(notice: string | null): void;
}

/** 当前模型的 build_order 序列（去重升序）——构建回放的刻度。 */
export function buildOrdersOf(modelId: string): number[] {
  const registry = findModel(modelId).registry;
  if (!registry) return [];
  return [...new Set(registry.parts.map((part) => part.build_order))].sort((a, b) => a - b);
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

  reports: [],
  scanPhase: "idle",
  scanKind: null,
  scanMs: null,

  views: { explode: false, xray: false, labels: false },
  machineState: "idle",
  focus: null,
  home: null,
  notice: null,

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
      reports: [],
      scanPhase: "idle",
      scanKind: null,
      scanMs: null,
      machineState: model.states?.[0]?.id ?? "idle",
      views: { explode: false, xray: false, labels: false },
      focus: null,
      home: null,
      notice: null,
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
    set({ buildIndex: clamped });
  },

  advanceBuild: (step) => get().setBuildIndex(get().buildIndex + step),

  selectPart: (partId) => set({ selectedPart: partId }),
  hoverPart: (partId) => set({ hoveredPart: partId }),

  toggleView: (key) => set((state) => ({ views: { ...state.views, [key]: !state.views[key] } })),
  setView: (key, value) => set((state) => ({ views: { ...state.views, [key]: value } })),

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
    get().focusPoint([center.x, center.y, center.z], Math.max(size.length() * 0.5, 0.35));
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
    const { assembled, machineState, modelId } = get();
    if (!assembled) return;
    const model = findModel(modelId);
    const previousState = machineState === "scanning" ? "idle" : machineState;
    set({ scanPhase: "scanning", scanKind: kind, reports: [], notice: null, machineState: "scanning" });
    // 检测是同步纯计算：先让浏览器画出「扫描中」，再跑检测。
    setTimeout(() => {
      if (useStageStore.getState().assembled !== assembled) return; // 模型已重建/卸载
      const started = performance.now();
      const reports =
        kind === "sweep"
          ? detectSweep(assembled, {
              duration: 3,
              fps: 30,
              applyPose: (t) => {
                assembled.resetNodes();
                model.animate?.(assembled, t);
              },
            })
          : detectStatic(assembled);
      assembled.resetNodes();
      if (model.animate) model.animate(assembled, 0);
      set({
        reports,
        scanPhase: "ready",
        scanKind: kind,
        scanMs: Math.round(performance.now() - started),
        machineState: previousState,
      });
    }, 0);
  },

  setNotice: (notice) => set({ notice }),
}));

/** 报告汇总（UI 徽标用）。 */
export function reportSummary(reports: ClippingReport[]) {
  return summarizeReports(reports);
}
