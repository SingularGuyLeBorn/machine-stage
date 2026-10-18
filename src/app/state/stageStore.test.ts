import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildModel } from "@/three/parts";
import { findModel } from "../catalog";
import { buildOrdersOf, useStageStore } from "./stageStore";

// ============================================================================
// stageStore 单测：构建滑杆 / 参数覆盖 / 扫描 / 视图 / 状态机
// 扫描是异步的（先让浏览器画「扫描中」），这里用假定时器驱动。
// ============================================================================

const buildTestModel = (overrides: Record<string, number> = {}) => {
  const registry = findModel("test").registry!;
  return buildModel(
    { ...registry, constants: { ...registry.constants, ...overrides } },
    { instanceLayouts: findModel("test").layouts, warnMissingLayout: false },
  );
};

const resetStore = () => {
  useStageStore.setState({
    modelId: "test",
    overrides: {},
    rebuildToken: 0,
    assembled: null,
    stats: null,
    buildIndex: buildOrdersOf("test").length,
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
  });
};

describe("stageStore 构建滑杆", () => {
  beforeEach(resetStore);

  it("buildOrdersOf 去重升序", () => {
    expect(buildOrdersOf("test")).toEqual([101, 201, 202]);
  });

  it("0 件 / 中间件 / 全部：按 build_order 逐件展开", () => {
    const model = buildTestModel();
    useStageStore.getState().attach(model);
    const store = useStageStore.getState();

    store.setBuildIndex(0);
    expect(model.parts.every((handle) => !handle.object.visible)).toBe(true);

    store.setBuildIndex(1);
    const visibleAfterOne = model.parts
      .filter((handle) => handle.object.visible)
      .map((handle) => handle.partId);
    expect(visibleAfterOne).toEqual(["test.frame.box"]);

    store.setBuildIndex(3);
    expect(model.parts.every((handle) => handle.object.visible)).toBe(true);
    model.dispose();
  });

  it("advanceBuild 在两端截断", () => {
    useStageStore.getState().setBuildIndex(0);
    useStageStore.getState().advanceBuild(-1);
    expect(useStageStore.getState().buildIndex).toBe(0);
    useStageStore.getState().setBuildIndex(3);
    useStageStore.getState().advanceBuild(5);
    expect(useStageStore.getState().buildIndex).toBe(3);
  });
});

describe("stageStore 参数与扫描", () => {
  beforeEach(() => {
    resetStore();
    vi.useRealTimers();
  });

  it("setParam 记录覆盖并触发重建；resetParams 清空", () => {
    useStageStore.getState().setParam("GAP", -0.002);
    expect(useStageStore.getState().overrides).toEqual({ GAP: -0.002 });
    expect(useStageStore.getState().rebuildToken).toBe(1);
    useStageStore.getState().resetParams();
    expect(useStageStore.getState().overrides).toEqual({});
    expect(useStageStore.getState().rebuildToken).toBe(2);
  });

  it("attach 后自动静态扫描：故意重叠 1mm → 实例级报告", async () => {
    vi.useFakeTimers();
    const model = buildTestModel({ GAP: 0.001 });
    useStageStore.getState().attach(model);
    expect(useStageStore.getState().scanPhase).toBe("scanning");
    vi.runAllTimers();
    const state = useStageStore.getState();
    expect(state.scanPhase).toBe("ready");
    expect(state.scanKind).toBe("static");
    expect(state.reports).toHaveLength(1);
    expect([state.reports[0].a, state.reports[0].b].sort()).toEqual([
      "test.frame.box[0]",
      "test.frame.box[1]",
    ]);
    expect(state.reports[0].depth_mm).toBeCloseTo(1, 1);
    model.dispose();
  });

  it("修复间隙后重扫 → 报告清空（验收闭环）", () => {
    vi.useFakeTimers();
    const bad = buildTestModel({ GAP: 0.001 });
    useStageStore.getState().attach(bad);
    vi.runAllTimers();
    expect(useStageStore.getState().reports).toHaveLength(1);

    const good = buildTestModel({ GAP: -0.002 });
    useStageStore.getState().attach(good);
    vi.runAllTimers();
    expect(useStageStore.getState().reports).toEqual([]);
    bad.dispose();
    good.dispose();
  });

  it("旧的扫描结果不会污染新模型（重建竞态防护）", () => {
    vi.useFakeTimers();
    const bad = buildTestModel({ GAP: 0.001 });
    useStageStore.getState().attach(bad);
    const good = buildTestModel({ GAP: -0.002 });
    useStageStore.getState().attach(good); // 覆盖：旧扫描回调应被丢弃
    vi.runAllTimers();
    expect(useStageStore.getState().reports).toEqual([]);
    bad.dispose();
    good.dispose();
  });

  it("扫掠扫描带帧号（翼片与立柱无干涉 → 空报告）", () => {
    vi.useFakeTimers();
    const model = buildTestModel();
    useStageStore.getState().attach(model);
    vi.runAllTimers();
    useStageStore.getState().runScan("sweep");
    vi.runAllTimers();
    const state = useStageStore.getState();
    expect(state.scanKind).toBe("sweep");
    expect(state.reports).toEqual([]);
    model.dispose();
  });
});

describe("stageStore 视图 / 状态机 / 聚焦", () => {
  beforeEach(resetStore);

  it("toggleView 与 setView", () => {
    useStageStore.getState().toggleView("explode");
    expect(useStageStore.getState().views.explode).toBe(true);
    useStageStore.getState().setView("explode", false);
    expect(useStageStore.getState().views.explode).toBe(false);
  });

  it("setMachineState 只接受注册表声明的状态", () => {
    useStageStore.getState().setMachineState("running");
    expect(useStageStore.getState().machineState).toBe("running");
    useStageStore.getState().setMachineState("不存在");
    expect(useStageStore.getState().machineState).toBe("running");
  });

  it("requestFocus 用零件包围盒中心，nonce 递增", () => {
    const model = buildTestModel();
    useStageStore.getState().attach(model);
    useStageStore.getState().requestFocus("test.frame.pillar");
    const focus = useStageStore.getState().focus!;
    expect(focus.center[0]).toBeCloseTo(2.5, 3);
    expect(focus.center[1]).toBeCloseTo(1.5, 3);
    expect(focus.resetAngle).toBe(false);
    useStageStore.getState().focusPoint([1, 2, 3], 0.5);
    expect(useStageStore.getState().focus!.nonce).toBe(focus.nonce + 1);
    model.dispose();
  });

  it("requestViewReset 用整机基准并复位方位角", () => {
    useStageStore.getState().setHome([0.5, 1, 0], 1.2);
    useStageStore.getState().requestViewReset();
    const focus = useStageStore.getState().focus!;
    expect(focus.center).toEqual([0.5, 1, 0]);
    expect(focus.radius).toBe(1.2);
    expect(focus.resetAngle).toBe(true);
  });
});

describe("stageStore 模型切换", () => {
  beforeEach(resetStore);

  it("未交付模型不可选、重复选同一模型为空操作", () => {
    useStageStore.getState().setModel("tiger");
    expect(useStageStore.getState().modelId).toBe("test");
    useStageStore.getState().setParam("GAP", 0.01);
    useStageStore.getState().setModel("test");
    expect(useStageStore.getState().overrides).toEqual({ GAP: 0.01 });
    expect(useStageStore.getState().rebuildToken).toBe(1);
  });

  it("切到另一个已交付模型时重置会话状态（覆盖 / 视图 / 进度 / 选择）", () => {
    useStageStore.setState({
      modelId: "m2hb",
      overrides: { GAP: 0.01 },
      buildIndex: 0,
      selectedPart: "test.frame.box",
      views: { explode: true, xray: true, labels: true },
    });
    useStageStore.getState().setModel("test");
    const state = useStageStore.getState();
    expect(state.modelId).toBe("test");
    expect(state.overrides).toEqual({});
    expect(state.views).toEqual({ explode: false, xray: false, labels: false });
    expect(state.selectedPart).toBeNull();
    expect(state.buildIndex).toBe(buildOrdersOf("test").length);
    expect(state.reports).toEqual([]);
  });
});
