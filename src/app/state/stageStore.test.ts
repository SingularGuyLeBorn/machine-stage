import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildModel, type ClippingReport } from "@/three/parts";
import { findModel } from "../catalog";
import {
  buildFilterOf,
  buildOrdersOf,
  faultFromError,
  filterReportsByProgress,
  formatReportMeasure,
  reportKey,
  formLabel,
  useStageStore,
} from "./stageStore";

// ============================================================================
// stageStore 单测：构建滑杆 / 参数覆盖 / 扫描 / 视图 / 状态机 / 报告×进度 / 布局 / 故障
// 扫描是异步的（先让浏览器画「扫描中」），这里用假定时器驱动。
// ============================================================================

const buildTestModel = (overrides: Record<string, number> = {}) => {
  const registry = findModel("test").registry!;
  return buildModel(
    { ...registry, constants: { ...registry.constants, ...overrides } },
    { instanceLayouts: findModel("test").layouts, warnMissingLayout: false },
  );
};

/** 合成一条实例级报告（只测过滤/联动，不跑真实检测）。 */
const makeReport = (partA: string, partB: string, depth = 1): ClippingReport => ({
  type: "clipping",
  phase: "static",
  a: `${partA}[0]`,
  b: `${partB}[1]`,
  depth_mm: depth,
  point: [0, 0, 0],
  frame: null,
  severity: "error",
  hint: "检查 GAP 常量",
  aLayer: 1,
  bLayer: 1,
});

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
    activeReport: null,
    isolation: null,
    allReports: [],
    reports: [],
    scanPhase: "idle",
    scanKind: null,
    scanMs: null,
    views: {
      explode: false,
      xray: false,
      internalsOnly: false,
      localXray: false,
      labels: false,
      grid: false,
      shadow: true,
      rain: false,
      thermal: false,
      underwater: false,
      sea: true,
    },
    layout: {
      left: { width: 272, open: true },
      right: { width: 324, open: true },
      drawer: { open: false, width: 360 },
    },
    machineState: "idle",
    focus: null,
    home: null,
    notice: null,
    fault: null,
  });
};

describe("stageStore 构建滑杆", () => {
  beforeEach(resetStore);

  it("buildOrdersOf 去重升序", () => {
    expect(buildOrdersOf("test")).toEqual([101, 301, 302]);
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

  it("attach 后按需静态扫描：故意重叠 1mm → 实例级报告", async () => {
    vi.useFakeTimers();
    const model = buildTestModel({ GAP: 0.001 });
    useStageStore.getState().attach(model);
    expect(useStageStore.getState().scanPhase).toBe("idle");
    useStageStore.getState().runScan("static");
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
    useStageStore.getState().runScan("static");
    vi.runAllTimers();
    expect(useStageStore.getState().reports).toHaveLength(1);

    const good = buildTestModel({ GAP: -0.002 });
    useStageStore.getState().attach(good);
    useStageStore.getState().runScan("static");
    vi.runAllTimers();
    expect(useStageStore.getState().reports).toEqual([]);
    bad.dispose();
    good.dispose();
  });

  it("扫描中重建装配 → 旧扫描作废，状态机不卡在 scanning", () => {
    vi.useFakeTimers();
    const bad = buildTestModel({ GAP: 0.001 });
    useStageStore.getState().attach(bad);
    useStageStore.getState().runScan("static");
    expect(useStageStore.getState().machineState).toBe("scanning");

    const good = buildTestModel({ GAP: -0.002 });
    useStageStore.getState().attach(good);
    vi.runAllTimers();
    const state = useStageStore.getState();
    expect(state.scanPhase).toBe("idle");
    expect(state.machineState).toBe("idle");
    expect(state.reports).toEqual([]);
    bad.dispose();
    good.dispose();
  });

  it("同一装配重复静态扫描 → 复用上次结果，不再重跑", () => {
    vi.useFakeTimers();
    const model = buildTestModel({ GAP: 0.001 });
    useStageStore.getState().attach(model);
    useStageStore.getState().runScan("static");
    vi.runAllTimers();
    const first = useStageStore.getState().reports;
    expect(first).toHaveLength(1);

    useStageStore.getState().runScan("static");
    const second = useStageStore.getState();
    expect(second.scanPhase).toBe("ready");
    expect(second.scanMs).toBe(0);
    expect(second.reports).toEqual(first);
    expect(second.notice).toContain("复用");
    model.dispose();
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

  it("切换模型与清除旧装配是同一次状态更新，读数不会读取别的模型", () => {
    const old = buildTestModel();
    useStageStore.setState({ assembled: old, stats: { parts: 3, triangles: 100 } });
    const observed: Array<{ id: string; hasModel: boolean }> = [];
    const unsubscribe = useStageStore.subscribe((state) =>
      observed.push({ id: state.modelId, hasModel: state.assembled !== null }),
    );
    try {
      useStageStore.getState().setModel("hmt");
      expect(observed).toEqual([{ id: "hmt", hasModel: false }]);
      expect(useStageStore.getState().stats).toBeNull();
    } finally {
      unsubscribe();
      old.dispose();
    }
  });

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
    useStageStore.getState().setModel("j20");
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
      views: {
        explode: true,
        xray: true,
        internalsOnly: true,
        localXray: true,
        labels: true,
        grid: true,
        shadow: false,
        rain: true,
        thermal: true,
        underwater: true,
        sea: false,
      },
    });
    useStageStore.getState().setModel("test");
    const state = useStageStore.getState();
    expect(state.modelId).toBe("test");
    expect(state.overrides).toEqual({});
    expect(state.views).toEqual({
      explode: false,
      xray: false,
      internalsOnly: false,
      localXray: false,
      labels: false,
      grid: false,
      shadow: true,
      rain: false,
      thermal: false,
      underwater: false,
      sea: true,
    });
    expect(state.selectedPart).toBeNull();
    expect(state.buildIndex).toBe(buildOrdersOf("test").length);
    expect(state.reports).toEqual([]);
  });
});

describe("stageStore 报告 × 构建进度联动", () => {
  beforeEach(resetStore);

  const idsAtOrder = (order: number) =>
    findModel("test")
      .registry!.parts.filter((part) => part.build_order === order)
      .map((part) => part.id);

  it("拖滑杆减少零件 → 报告按候选集重算，数量单调不增；拖到 0 清空", () => {
    const orders = buildOrdersOf("test");
    const early = idsAtOrder(orders[0])[0];
    const late = idsAtOrder(orders[orders.length - 1])[0];
    const all = [makeReport(early, early), makeReport(late, late)];
    useStageStore.setState({ allReports: all });

    useStageStore.getState().setBuildIndex(orders.length);
    expect(useStageStore.getState().reports).toHaveLength(2);

    const counts: number[] = [];
    for (let index = orders.length; index >= 0; index--) {
      useStageStore.getState().setBuildIndex(index);
      counts.push(useStageStore.getState().reports.length);
    }
    for (let i = 1; i < counts.length; i++) expect(counts[i]).toBeLessThanOrEqual(counts[i - 1]);
    expect(counts[counts.length - 1]).toBe(0);
    expect(useStageStore.getState().reports).toEqual([]);
  });

  it("进度回退时越界的报告选中项自动复位", () => {
    const orders = buildOrdersOf("test");
    const early = idsAtOrder(orders[0])[0];
    useStageStore.setState({
      allReports: [makeReport(early, early)],
      reports: [makeReport(early, early)],
      activeReport: 0,
    });
    useStageStore.getState().setBuildIndex(0);
    expect(useStageStore.getState().reports).toEqual([]);
    expect(useStageStore.getState().activeReport).toBeNull();
  });

  it("buildFilterOf 用 build_order 阈值给出候选集，全量进度返回 null", () => {
    const orders = buildOrdersOf("test");
    const filter = buildFilterOf("test", 1)!;
    expect(filter({ buildOrder: orders[0] } as never)).toBe(true);
    expect(filter({ buildOrder: orders[1] } as never)).toBe(false);
    expect(buildFilterOf("test", orders.length)).toBeNull();
    expect(buildFilterOf("test", 0)!({ buildOrder: orders[0] } as never)).toBe(false);
  });

  it("filterReportsByProgress 保持原顺序（只删不改）", () => {
    const orders = buildOrdersOf("test");
    const early = idsAtOrder(orders[0])[0];
    const late = idsAtOrder(orders[orders.length - 1])[0];
    const all = [makeReport(early, late, 3), makeReport(early, early, 2), makeReport(late, late, 1)];
    const filtered = filterReportsByProgress(all, "test", 1);
    expect(filtered.map((report) => report.depth_mm)).toEqual([2]);
    expect(filterReportsByProgress(all, "test", orders.length)).toEqual(all);
  });
});

describe("stageStore 隔离小视图", () => {
  beforeEach(resetStore);

  it("打开报告隔离：key 与 activeReport 同源；stepReport 环绕", () => {
    const orders = buildOrdersOf("test");
    const early = findModel("test").registry!.parts.find((part) => part.build_order === orders[0])!.id;
    useStageStore.setState({
      allReports: [makeReport(early, early, 1), makeReport(early, early, 2)],
    });
    useStageStore.getState().setBuildIndex(orders.length);
    useStageStore.getState().openReportIsolation(0);
    let state = useStageStore.getState();
    expect(state.isolation).toEqual({ kind: "pair", key: reportKey(state.reports[0]) });
    expect(state.activeReport).toBe(0);

    useStageStore.getState().stepReport(1);
    state = useStageStore.getState();
    expect(state.activeReport).toBe(1);
    expect(state.isolation).toEqual({ kind: "pair", key: reportKey(state.reports[1]) });

    useStageStore.getState().stepReport(1); // 末尾 +1 → 回到第一条
    expect(useStageStore.getState().activeReport).toBe(0);

    useStageStore.getState().closeIsolation();
    expect(useStageStore.getState().isolation).toBeNull();
  });

  it("单件隔离 + 点零件树会清掉报告选中（同一选中源）", () => {
    const orders = buildOrdersOf("test");
    const early = findModel("test").registry!.parts.find((part) => part.build_order === orders[0])!.id;
    useStageStore.setState({ allReports: [makeReport(early, early)] });
    useStageStore.getState().setBuildIndex(orders.length);
    useStageStore.getState().openReportIsolation(0);
    expect(useStageStore.getState().activeReport).toBe(0);

    useStageStore.getState().openPartIsolation("test.frame.box");
    expect(useStageStore.getState().isolation).toEqual({ kind: "part", partId: "test.frame.box" });
    useStageStore.getState().selectPart("test.frame.box");
    expect(useStageStore.getState().activeReport).toBeNull();
  });
});

describe("stageStore 布局自由化", () => {
  beforeEach(resetStore);

  it("栏宽钳制在可读范围内，收起 / 展开翻转 open", () => {
    useStageStore.getState().setColumnWidth("left", 10);
    expect(useStageStore.getState().layout.left.width).toBe(188);
    useStageStore.getState().setColumnWidth("left", 900);
    expect(useStageStore.getState().layout.left.width).toBe(520);
    useStageStore.getState().setColumnWidth("right", 300.4);
    expect(useStageStore.getState().layout.right.width).toBe(300);

    useStageStore.getState().toggleColumn("right");
    expect(useStageStore.getState().layout.right.open).toBe(false);
    useStageStore.getState().toggleColumn("right");
    expect(useStageStore.getState().layout.right.open).toBe(true);
  });

  it("报告抽屉：开关与宽度钳制", () => {
    expect(useStageStore.getState().layout.drawer.open).toBe(false);
    useStageStore.getState().setDrawer(true);
    expect(useStageStore.getState().layout.drawer.open).toBe(true);
    useStageStore.getState().setDrawerWidth(1000);
    expect(useStageStore.getState().layout.drawer.width).toBe(620);
    useStageStore.getState().setDrawerWidth(100);
    expect(useStageStore.getState().layout.drawer.width).toBe(288);
  });
});

describe("报告卡片文案（交线法口径：深度不许冒充 · 形态判定树）", () => {
  it("实测深度优先；测不出时给「交线 XXmm」+ 形态标签", () => {
    const measured = makeReport("tiger.a", "tiger.b", 7.61);
    expect(formatReportMeasure(measured)).toBe("7.61mm");

    const unmeasurable: ClippingReport = {
      ...makeReport("tiger.a", "tiger.b"),
      depth_mm: null,
      estimated: true,
      intersection_mm: 1970.49,
      form: "face_mate",
    };
    expect(formatReportMeasure(unmeasurable)).toBe("交线 1970.5mm");
    expect(formLabel(unmeasurable.form)).toBe("共面贴合");

    const fit: ClippingReport = { ...unmeasurable, intersection_mm: 87.1, form: "bearing_overlap" };
    expect(formLabel(fit.form)).toBe("绕轴闭合·配合面");
    const displaced: ClippingReport = { ...unmeasurable, form: "displaced" };
    expect(formLabel(displaced.form)).toBe("局部成团·错位穿透");
    const suspect: ClippingReport = { ...unmeasurable, intersection_mm: 112.56, form: "suspect" };
    expect(formLabel(suspect.form)).toBe("成团·存疑穿透");

    // 连交线也没有（超预算早退）：只给形态词，绝不出现 AABB 假数字
    const bare: ClippingReport = { ...unmeasurable, intersection_mm: undefined };
    expect(formatReportMeasure(bare)).toBe("交线 —");
    expect(formLabel(undefined)).toBe("形态未知");
  });

  it("reportKey 用占位符区分 null 深度（不把 null 拼成 0，也不与实测 0 撞 key）", () => {
    const measured = makeReport("tiger.a", "tiger.b", 1);
    const unmeasurable: ClippingReport = { ...measured, depth_mm: null };
    const otherShape: ClippingReport = { ...unmeasurable, form: "bearing_overlap" };

    expect(reportKey(unmeasurable)).not.toContain("null");
    expect(reportKey(unmeasurable)).toBe(reportKey(otherShape));
    expect(reportKey(unmeasurable)).not.toBe(reportKey(makeReport("tiger.a", "tiger.b", 0)));
  });
});

describe("stageStore 运行故障（白屏防御）", () => {
  beforeEach(resetStore);

  it("faultFromError 覆盖 Error / 字符串 / 对象 / undefined", () => {
    const fromError = faultFromError("装配", new Error("boom"));
    expect(fromError.scope).toBe("装配");
    expect(fromError.message).toBe("boom");
    expect(fromError.stack).toContain("boom");

    expect(faultFromError("全局", "字符串错误").message).toBe("字符串错误");
    expect(faultFromError("全局", { code: 7 }).message).toBe('{"code":7}');
    expect(faultFromError("全局", undefined).message).toBe("undefined");
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(faultFromError("全局", circular).message).toBe("[object Object]");
  });

  it("reportFault / clearFault，切模型时清空故障", () => {
    useStageStore.getState().reportFault({ scope: "渲染", message: "WebGL 上下文丢失" });
    expect(useStageStore.getState().fault?.message).toBe("WebGL 上下文丢失");
    useStageStore.getState().clearFault();
    expect(useStageStore.getState().fault).toBeNull();

    useStageStore.getState().reportFault({ scope: "装配", message: "灯丝断了" });
    useStageStore.getState().setModel("tiger");
    expect(useStageStore.getState().fault).toBeNull();
    expect(useStageStore.getState().modelId).toBe("tiger");
  });
});

describe("stageStore 实例检查器（负重轮单拆）", () => {
  it("selectPart 记住实例序号；toggleDetach 连带 6 颗轮毂螺栓，再点一次装回", () => {
    const model = findModel("tiger");
    const assembled = buildModel(model.registry!, {
      builders: model.builders,
      instanceLayouts: model.layouts,
      warnMissingLayout: false,
    });
    useStageStore.setState({ modelId: "tiger", assembled, detached: [] });

    useStageStore.getState().selectPart("tiger.suspension.wheel", 20);
    expect(useStageStore.getState().selectedPart).toBe("tiger.suspension.wheel");
    expect(useStageStore.getState().selectedInstance).toBe(20);
    expect(useStageStore.getState().hoveredInstance).toBeNull();

    useStageStore.getState().toggleDetach("tiger.suspension.wheel", 20);
    const keys = useStageStore.getState().detached;
    expect(keys).toContain("tiger.suspension.wheel#20");
    expect(keys.filter((key) => key.startsWith("tiger.suspension.hub_bolt#"))).toHaveLength(6);

    useStageStore.getState().toggleDetach("tiger.suspension.wheel", 20);
    expect(useStageStore.getState().detached).toHaveLength(0);
    assembled.dispose();
  });
});

describe("内部观察模式互斥", () => {
  beforeEach(resetStore);
  it("任何入口启用一种模式都关闭另两种，关闭自身不改变其他视图", () => {
    const modes = ["localXray", "xray", "internalsOnly"] as const;
    useStageStore.getState().toggleView("grid");
    for (const from of modes) {
      for (const to of modes) {
        resetStore();
        useStageStore.getState().toggleView("grid");
        useStageStore.getState().toggleView(from);
        useStageStore.getState().toggleView(to);
        const views = useStageStore.getState().views;
        for (const mode of modes) expect(views[mode]).toBe(from !== to && mode === to);
        expect(views.grid).toBe(true);
      }
    }
  });
});

describe("光线加力开关", () => {
  it("加力保持当前发射状态与模型实例，换模型清零且不支持的模型不能开启", () => {
    const store = useStageStore.getState();
    store.setModel("kingjoemodules");
    store.setMachineState("ray_chest");
    const before = useStageStore.getState().assembled;
    store.setEnergyWidth(1.8);
    expect(useStageStore.getState().energyWidth).toBe(1.8);
    store.setEnergyWidth(Number.NaN);
    expect(useStageStore.getState().energyWidth).toBe(1.8);
    store.setEnergyWidth(9);
    expect(useStageStore.getState().energyWidth).toBe(3);
    store.toggleEnergyBoost();
    expect(useStageStore.getState().energyBoost).toBe(true);
    expect(useStageStore.getState().machineState).toBe("ray_chest");
    expect(useStageStore.getState().assembled).toBe(before);
    store.toggleEnergyBoost();
    expect(useStageStore.getState().energyBoost).toBe(false);
    store.toggleEnergyBoost();
    store.setModel("test");
    expect(useStageStore.getState().energyWidth).toBe(1);
    expect(useStageStore.getState().energyBoost).toBe(false);
    store.toggleEnergyBoost();
    expect(useStageStore.getState().energyBoost).toBe(false);
  });
});
