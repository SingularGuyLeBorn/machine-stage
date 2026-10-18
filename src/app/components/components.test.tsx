// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findModel } from "../catalog";
import { buildOrdersOf, useStageStore } from "../state/stageStore";
import { ActionPanel } from "./ActionPanel";
import { BuildSlider } from "./BuildSlider";
import { ClippingPanel } from "./ClippingPanel";
import { ModelList } from "./ModelList";
import { ParamsPanel } from "./ParamsPanel";
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

beforeEach(resetStore);
afterEach(cleanup);

describe("ModelList", () => {
  it("已交付模型可点切换，计划模型禁用", () => {
    render(<ModelList />);
    expect(screen.getByText("框架自检台")).toBeDefined();
    const tiger = screen.getByText("虎式坦克 Tiger I").closest("button")!;
    expect(tiger.disabled).toBe(true);
    const m2hb = screen.getByText("M2HB 重机枪").closest("button")!;
    expect(m2hb.disabled).toBe(true);
  });
});

describe("PartTree", () => {
  it("按总成折叠渲染零件，点击 → 选中", () => {
    render(<PartTree />);
    expect(screen.getByText("测试总成")).toBeDefined();
    expect(screen.getByText("3 个注册零件")).toBeDefined();
    const pillar = screen.getByText("立柱").closest("button")!;
    fireEvent.click(pillar);
    expect(useStageStore.getState().selectedPart).toBe("test.frame.pillar");
    // 重复件标注实例数量
    expect(screen.getByText("×2")).toBeDefined();
  });

  it("折叠总成后零件隐藏", () => {
    render(<PartTree />);
    fireEvent.click(screen.getByText("测试总成"));
    expect(screen.queryByText("立柱")).toBeNull();
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
});

describe("ClippingPanel", () => {
  it("无报告时显示验收通过文案", () => {
    render(<ClippingPanel />);
    expect(screen.getByText(/实例级穿模报告为空/)).toBeDefined();
  });

  it("有报告时显示实例级引用与提示，点击飞到穿透点并选中 A 件", () => {
    useStageStore.setState({
      reports: [
        {
          type: "clipping",
          phase: "static",
          a: "test.frame.box[0]",
          b: "test.frame.box[1]",
          depth_mm: 1,
          point: [0.5, 0.5, 0],
          frame: null,
          severity: "error",
          hint: "检查 GAP 常量",
          aLayer: 1,
          bLayer: 1,
        },
      ],
      scanPhase: "ready",
      scanKind: "static",
      scanMs: 9,
    });
    render(<ClippingPanel />);
    expect(screen.getByText("test.frame.box[0]")).toBeDefined();
    expect(screen.getByText("1.00mm")).toBeDefined();
    fireEvent.click(screen.getByText("检查 GAP 常量").closest("button")!);
    const state = useStageStore.getState();
    expect(state.selectedPart).toBe("test.frame.box");
    expect(state.focus!.center).toEqual([0.5, 0.5, 0]);
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

describe("ParamsPanel", () => {
  it("数值常量可改，派生常量只读", () => {
    render(<ParamsPanel />);
    const gap = screen.getByLabelText("GAP") as HTMLInputElement;
    fireEvent.change(gap, { target: { value: "-0.01" } });
    expect(useStageStore.getState().overrides.GAP).toBeCloseTo(-0.01, 9);
    // PILLAR_Y 是表达式派生 → 只读展示
    expect(screen.getByText("BOX+0.5")).toBeDefined();
    expect(screen.getByText("派生（只读）")).toBeDefined();
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
