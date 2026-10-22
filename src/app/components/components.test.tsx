// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SideColumn } from "../App";
import { findModel } from "../catalog";
import { buildOrdersOf, splitReports, useStageStore } from "../state/stageStore";
import type { ClippingReport } from "@/three/parts";
import { ActionPanel } from "./ActionPanel";
import { BuildSlider } from "./BuildSlider";
import { ClippingDock, ClippingPanel } from "./ClippingPanel";
import { ErrorBoundary } from "./ErrorBoundary";
import { FaultPanel } from "./FaultPanel";
import { ModelList } from "./ModelList";
import { ParamsPanel } from "./ParamsPanel";
import { PartInfoCard } from "./PartInfoCard";
import { PartTree } from "./PartTree";
import { StateMachine } from "./StateMachine";

// ============================================================================
// 组件测试（jsdom）：不渲染 Canvas，只验证面板与 store 的交互契约。
// ============================================================================

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
    reportPartition: { active: [], expected: [] },
    scanPhase: "idle",
    scanKind: null,
    scanMs: null,
    views: {
      explode: false,
      xray: false,
      internalsOnly: false,
      labels: false,
      grid: false,
      shadow: true,
      rain: false,
      thermal: false,
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

/** 三条示例报告：同零件对（家族 ×2）+ 跨零件一条，用于卡片折叠/过滤测试。 */
const sampleReports = (): ClippingReport[] => {
  const base = {
    type: "clipping" as const,
    phase: "static" as const,
    frame: null,
    severity: "error" as const,
    hint: "检查 GAP 常量",
    aLayer: 1 as const,
    bLayer: 1 as const,
  };
  return [
    { ...base, a: "test.frame.box[0]", b: "test.frame.box[1]", depth_mm: 1, point: [0.5, 0.5, 0] },
    { ...base, a: "test.frame.box[0]", b: "test.frame.box[1]", depth_mm: 2, point: [0.6, 0.5, 0] },
    { ...base, a: "test.frame.pillar[0]", b: "test.frame.box[0]", depth_mm: 0.5, point: [1, 1, 0] },
  ];
};

beforeEach(resetStore);
afterEach(cleanup);

/** 写入一组报告：raw/reports/reportPartition 一起给（面板读的是分层后的派生值）。 */
const withReports = (reports: ClippingReport[], modelId = "test") =>
  useStageStore.setState({
    modelId,
    allReports: reports,
    reports,
    reportPartition: splitReports(modelId, reports),
    scanPhase: "ready",
    scanKind: "static",
  });

describe("ModelList", () => {
  it("已交付模型可点切换，计划模型禁用", () => {
    render(<ModelList />);
    expect(screen.getByText("框架自检台")).toBeDefined();
    const tiger = screen.getByText("虎式坦克 Tiger I").closest("button")!;
    expect(tiger.disabled).toBe(false);
    const j20 = screen.getByText("歼-20").closest("button")!;
    expect(j20.disabled).toBe(true);
  });
});

describe("PartTree", () => {
  const openTree = () => fireEvent.click(screen.getByRole("button", { name: "展开零件树" }));

  it("面板默认收起，展开后才渲染零件树", () => {
    render(<PartTree />);
    expect(screen.getByText("3 个注册零件")).toBeDefined();
    expect(screen.queryByText("测试总成")).toBeNull();
    openTree();
    expect(screen.getByText("测试总成")).toBeDefined();
  });

  it("总成默认折叠，点总成才展开；点击零件 → 选中", () => {
    render(<PartTree />);
    openTree();
    expect(screen.getByText("3 个注册零件")).toBeDefined();
    expect(screen.queryByText("立柱")).toBeNull();
    const head = screen.getByText("测试总成").closest("button")!;
    expect(head.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(head);
    expect(screen.getByText("立柱")).toBeDefined();
    expect(head.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(screen.getByText("立柱").closest("button")!);
    expect(useStageStore.getState().selectedPart).toBe("test.frame.pillar");
    expect(screen.getByText("×2")).toBeDefined();
  });

  it("再次点击总成后零件隐藏", () => {
    render(<PartTree />);
    openTree();
    fireEvent.click(screen.getByText("测试总成"));
    fireEvent.click(screen.getByText("测试总成"));
    expect(screen.queryByText("立柱")).toBeNull();
  });

  it("点零件 → 选中 + 打开单件隔离小视图", () => {
    render(<PartTree />);
    openTree();
    fireEvent.click(screen.getByText("测试总成"));
    fireEvent.click(screen.getByText("立柱").closest("button")!);
    expect(useStageStore.getState().selectedPart).toBe("test.frame.pillar");
    expect(useStageStore.getState().isolation).toEqual({ kind: "part", partId: "test.frame.pillar" });
  });

  it("外部选中（视口点实体 / 报告点选）会展开所在总成并滚入视野", () => {
    render(<PartTree />);
    openTree();
    expect(screen.queryByText("立柱")).toBeNull();
    // 模拟视口选中：store 变化 → 左树自动展开
    act(() => useStageStore.getState().selectPart("test.frame.pillar"));
    expect(screen.getByText("立柱")).toBeDefined();
    expect(screen.getByText("立柱").closest("button")!.getAttribute("aria-current")).toBe("true");
  });
});

describe("PartInfoCard", () => {
  it("选中零件后在中部卡片显示名称 / partId / 层，并可隔离或清除", () => {
    act(() => useStageStore.getState().selectPart("test.frame.pillar"));
    render(<PartInfoCard />);
    expect(screen.getByText("立柱")).toBeDefined();
    expect(screen.getByText("test.frame.pillar")).toBeDefined();
    expect(screen.getByText("传动支撑")).toBeDefined();
    fireEvent.click(screen.getByText("隔离查看"));
    expect(useStageStore.getState().isolation).toEqual({ kind: "part", partId: "test.frame.pillar" });
    fireEvent.click(screen.getByLabelText("清除选中"));
    expect(useStageStore.getState().selectedPart).toBeNull();
  });
});

describe("BuildSlider", () => {
  it("显示当前层与已装配件数，逐件前进", () => {
    render(<BuildSlider />);
    expect(screen.getByText(/已装配/).textContent).toContain("3/3");
    fireEvent.click(screen.getByLabelText("回退一件"));
    expect(useStageStore.getState().buildIndex).toBe(2);
    expect(screen.getByText(/已装配/).textContent).toContain("2/3");
    fireEvent.click(screen.getByLabelText("前进一件"));
    expect(useStageStore.getState().buildIndex).toBe(3);
  });

  it("拖滑杆到 0 件时显示未开始构建", () => {
    render(<BuildSlider />);
    const slider = screen.getByLabelText("构建进度") as HTMLInputElement;
    fireEvent.change(slider, { target: { value: "0" } });
    expect(useStageStore.getState().buildIndex).toBe(0);
    expect(screen.getByText("未开始构建")).toBeDefined();
  });

  it("选中零件后读数跟随选中件，并可一键把进度对齐到它", () => {
    render(<BuildSlider />);
    // 未选中 → 显示当前装配件
    expect(screen.getByText(/已装配/).textContent).toContain("当前");
    act(() => {
      useStageStore.getState().setBuildIndex(1);
      useStageStore.getState().selectPart("test.frame.fin");
    });
    const counts = screen.getByText(/已装配/);
    expect(counts.textContent).toContain("选中 翼片");
    expect(counts.textContent).toContain("第 3 件");
    expect(counts.textContent).toContain("未装配");
    fireEvent.click(screen.getByTitle(/对齐到选中零件/));
    expect(useStageStore.getState().buildIndex).toBe(3);
  });
});

describe("ClippingPanel", () => {
  it("无报告时显示未豁免 = 0 的验收通过文案", () => {
    render(<ClippingPanel />);
    expect(screen.getByText(/未豁免报告 = 0/)).toBeDefined();
  });

  it("0 件时提示未开始构建", () => {
    useStageStore.getState().setBuildIndex(0);
    render(<ClippingPanel />);
    expect(screen.getByText(/未开始构建/)).toBeDefined();
  });

  it("报告按 partId 家族聚合，默认收起只显示族名与数量", () => {
    withReports(sampleReports());
    render(<ClippingPanel />);
    // 家族名是零件级 ID（不含实例下标）
    expect(screen.getAllByText("test.frame.box").length).toBe(2);
    expect(screen.getByText("×2")).toBeDefined();
    // 收起态不出现 hint / 常量链
    expect(screen.queryByText("检查 GAP 常量")).toBeNull();
    expect(screen.queryByText("GAP")).toBeNull();
  });

  it("展开族后出现实例级卡片、hint 与可读常量链", () => {
    withReports(sampleReports());
    render(<ClippingPanel />);
    fireEvent.click(screen.getAllByTitle("展开该族的逐条报告")[0]);
    expect(screen.getAllByText("test.frame.box[0]").length).toBeGreaterThan(0);
    expect(screen.getAllByText("检查 GAP 常量").length).toBe(2);
    // 常量渲染成「名字 = 值 m」
    expect(screen.getAllByText("GAP").length).toBe(2);
  });

  it("工具条：全部展开 / 全部收起 / 按层过滤", () => {
    withReports(sampleReports());
    render(<ClippingPanel />);
    fireEvent.click(screen.getByText("全部展开"));
    expect(screen.getAllByText("检查 GAP 常量").length).toBe(3);
    fireEvent.click(screen.getByText("全部收起"));
    expect(screen.queryByText("检查 GAP 常量")).toBeNull();

    const select = screen.getByLabelText("按层过滤") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "1" } });
    expect(screen.getAllByText("test.frame.box").length).toBeGreaterThan(0);
  });

  it("点「飞到穿透点」→ 选中 A 件 + 相机飞过去；点「隔离对比」→ 打开小视图", () => {
    withReports(sampleReports());
    render(<ClippingPanel />);
    fireEvent.click(screen.getByText("全部展开"));

    fireEvent.click(screen.getAllByTitle("飞到穿透点并选中 A 件")[0]);
    let state = useStageStore.getState();
    expect(state.selectedPart).toBe("test.frame.box");
    expect(state.focus!.center).toEqual([0.5, 0.5, 0]);

    fireEvent.click(screen.getAllByTitle("在隔离小视图里对比这两件")[1]);
    state = useStageStore.getState();
    expect(state.isolation?.kind).toBe("pair");
    expect(state.activeReport).toBe(1);
  });

  it("构造性接触走白名单：未豁免 = 0，已豁免收起可展开（带依据）", () => {
    withReports(
      [
        {
          type: "clipping",
          phase: "static",
          frame: null,
          severity: "error",
          a: "tiger.piston_rod.connecting_rod[0]",
          b: "tiger.piston_rod.rod_cap[0]",
          depth_mm: 0.5,
          form: "face_mate",
          point: [0, 0, 0],
          hint: "",
          aLayer: 2,
          bLayer: 2,
        },
      ],
      "tiger",
    );
    render(<ClippingPanel />);
    expect(screen.getByText(/未豁免报告 = 0/)).toBeDefined();
    // 收起态只给计数，不摊理由
    expect(screen.getByText(/已按白名单豁免/)).toBeDefined();
    expect(screen.queryByText("conrod-split-face")).toBeNull();
    fireEvent.click(screen.getByText("已豁免构造性接触"));
    expect(screen.getByText("conrod-split-face")).toBeDefined();
    expect(screen.getByText(/剖分面/)).toBeDefined();
    expect(screen.getAllByTitle("在隔离小视图里对比这两件").length).toBe(1);
  });

  it("豁免族里注入 5mm 真重叠 → 计入未豁免（深度守门），不进已豁免区", () => {
    withReports(
      [
        {
          type: "clipping",
          phase: "static",
          frame: null,
          severity: "error",
          a: "tiger.piston_rod.connecting_rod[0]",
          b: "tiger.piston_rod.rod_cap[0]",
          depth_mm: 5,
          form: "bearing_overlap",
          point: [0, 0, 0],
          hint: "",
          aLayer: 2,
          bLayer: 2,
        },
      ],
      "tiger",
    );
    render(<ClippingPanel />);
    expect(screen.queryByText(/未豁免报告 = 0/)).toBeNull();
    expect(screen.queryByText("已豁免构造性接触")).toBeNull();
    expect(screen.getAllByText(/5\.00mm/).length).toBeGreaterThan(0);
  });
});

describe("ClippingDock", () => {
  it("收起态是带数量的边缘按钮，点开成抽屉，可关闭", () => {
    withReports(sampleReports());
    render(<ClippingDock />);
    const tab = screen.getByTitle("打开穿模报告抽屉");
    expect(tab.textContent).toContain("3");
    fireEvent.click(tab);
    expect(useStageStore.getState().layout.drawer.open).toBe(true);
  });

  it("展开态渲染面板并提供收起按钮", () => {
    withReports(sampleReports());
    useStageStore.setState({
      layout: { ...useStageStore.getState().layout, drawer: { open: true, width: 360 } },
    });
    render(<ClippingDock />);
    expect(screen.getByText(/未豁免报告/)).toBeDefined();
    fireEvent.click(screen.getByLabelText("收起报告抽屉"));
    expect(useStageStore.getState().layout.drawer.open).toBe(false);
  });
});

describe("FaultPanel / ErrorBoundary（白屏防御）", () => {
  it("无故障时不渲染任何东西", () => {
    const { container } = render(<FaultPanel />);
    expect(container.firstChild).toBeNull();
  });

  it("显示出错环节、消息、堆栈与重载按钮", () => {
    useStageStore.getState().reportFault({
      scope: "装配 虎式坦克",
      message: "未知常量 PLUG_TIP_R",
      stack: "Error: 未知常量 PLUG_TIP_R\n  at tiger.valvetrain.spark_plug",
    });
    render(<FaultPanel />);
    expect(screen.getByRole("alert")).toBeDefined();
    expect(screen.getByText(/运行故障 · 装配 虎式坦克/)).toBeDefined();
    expect(screen.getByText("未知常量 PLUG_TIP_R")).toBeDefined();
    expect(screen.getByText(/at tiger.valvetrain.spark_plug/)).toBeDefined();
    expect(screen.getByTitle(/重新加载页面/)).toBeDefined();
    fireEvent.click(screen.getByLabelText("关闭错误面板"));
    expect(useStageStore.getState().fault).toBeNull();
  });

  it("边界捕获渲染期异常 → 写入 store（不白屏、不重复渲染卡片）", () => {
    const Boom = () => {
      throw new Error("渲染期爆炸");
    };
    const { container } = render(
      <ErrorBoundary scope="界面">
        <Boom />
      </ErrorBoundary>,
    );
    expect(container.firstChild).toBeNull();
    expect(useStageStore.getState().fault?.message).toBe("渲染期爆炸");
    expect(useStageStore.getState().fault?.scope).toBe("界面");
  });
});

describe("ActionPanel", () => {
  it("机构状态动作切换 machineState", () => {
    render(<ActionPanel />);
    fireEvent.click(screen.getByText("转子运转"));
    expect(useStageStore.getState().machineState).toBe("running");
    fireEvent.click(screen.getByText("停机"));
    expect(useStageStore.getState().machineState).toBe("idle");
  });

  it("展示动作切视图；自检动作写参数覆盖", () => {
    render(<ActionPanel />);
    fireEvent.click(screen.getByText("爆炸视图"));
    expect(useStageStore.getState().views.explode).toBe(true);
    fireEvent.click(screen.getByText("注入 1mm 重叠"));
    expect(useStageStore.getState().overrides.GAP).toBeCloseTo(0.001, 9);
    fireEvent.click(screen.getByText("修复装配间隙"));
    expect(useStageStore.getState().overrides.GAP).toBeCloseTo(-0.002, 9);
  });
});

describe("StateMachine", () => {
  it("当前状态高亮", () => {
    render(<StateMachine />);
    const idle = screen.getByText("待机").closest(".sm__node")!;
    expect(idle.getAttribute("data-active")).toBe("true");
    useStageStore.getState().setMachineState("running");
    cleanup();
    render(<StateMachine />);
    expect(screen.getByText("转子运转").closest(".sm__node")!.getAttribute("data-active")).toBe("true");
  });
});

describe("布局自由化（栏宽 / 收起 / 细条）", () => {
  it("收起后只剩细条，点细条按钮回到栏位", () => {
    render(
      <div className="layout">
        <SideColumn side="left" label="零件">
          <div>左栏内容</div>
        </SideColumn>
        <div className="column column--center">视口</div>
      </div>,
    );
    expect(screen.getByText("左栏内容")).toBeDefined();
    fireEvent.click(screen.getByLabelText("收起零件"));
    expect(useStageStore.getState().layout.left.open).toBe(false);
    expect(screen.queryByText("左栏内容")).toBeNull();
    fireEvent.click(screen.getByLabelText("展开零件"));
    expect(useStageStore.getState().layout.left.open).toBe(true);
    expect(screen.getByText("左栏内容")).toBeDefined();
  });

  it("拖拽条按指针位置改栏宽并钳制范围", () => {
    render(
      <div className="layout">
        <SideColumn side="left" label="零件">
          <div>左栏内容</div>
        </SideColumn>
      </div>,
    );
    const resizer = screen.getByLabelText("调整左栏宽度");
    const pointer = (type: string, clientX: number) =>
      fireEvent(resizer, new MouseEvent(type, { clientX, bubbles: true }));
    pointer("pointerdown", 200);
    pointer("pointermove", 420);
    expect(useStageStore.getState().layout.left.width).toBe(420);
    pointer("pointermove", 5000);
    expect(useStageStore.getState().layout.left.width).toBe(520);
    pointer("pointermove", 10);
    expect(useStageStore.getState().layout.left.width).toBe(188);
    pointer("pointerup", 10);
    pointer("pointermove", 300);
    expect(useStageStore.getState().layout.left.width).toBe(188); // 松手后不再跟随
  });
});

describe("ParamsPanel", () => {
  it("数值常量可改，表达式派生的常量只给「自动」标记", () => {
    render(<ParamsPanel />);
    const gap = screen.getByLabelText("GAP") as HTMLInputElement;
    fireEvent.change(gap, { target: { value: "-0.01" } });
    expect(useStageStore.getState().overrides.GAP).toBeCloseTo(-0.01, 9);
    // PILLAR_Y 是表达式派生 → 无滑杆，只有解析值与锁形「自动」标记
    expect(screen.getByText("BOX+0.5")).toBeDefined();
    expect(screen.getByText("自动")).toBeDefined();
    expect(screen.queryByText(/只读/)).toBeNull();
    expect(screen.queryByLabelText("PILLAR_Y")).toBeNull();
  });

  it("重置按钮恢复默认值", () => {
    useStageStore.getState().setParam("BOX", 1.5);
    render(<ParamsPanel />);
    expect(screen.getByText("1 项覆盖")).toBeDefined();
    fireEvent.click(screen.getByTitle("恢复注册表默认值"));
    expect(useStageStore.getState().overrides).toEqual({});
  });

  it("模型备注与单值真值源说明可见", () => {
    render(<ParamsPanel />);
    expect(screen.getByText(/单一真值源/)).toBeDefined();
    expect(findModel("test").notes!.length).toBeGreaterThan(0);
  });
});
