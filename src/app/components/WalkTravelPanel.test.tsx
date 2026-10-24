// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WalkTravelPanel } from "./WalkTravelPanel";
import { useStageStore } from "../state/stageStore";

describe("WalkTravelPanel", () => {
  afterEach(cleanup);
  beforeEach(() => {
    useStageStore.setState({
      modelId: "carrier",
      walkArea: "deck",
      walkTravelOpen: true,
      walkFading: false,
      walkTravel: null,
    });
  });

  it("列出区域与关键位置，点击会写入快速前往请求", () => {
    render(<WalkTravelPanel />);
    expect(screen.getByRole("dialog", { name: "快速前往" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^航海舰桥/ })).toBeInTheDocument();
    const hotspot = screen.getByText("应急拦阻网控制台").closest("button")!;
    fireEvent.click(hotspot);
    const travel = useStageStore.getState().walkTravel;
    expect(travel?.area).toBe("deck");
    expect(travel?.nonce).toBe(1);
    expect(useStageStore.getState().walkTravelOpen).toBe(false);
  });

  it("T 按钮只负责开关，面板关闭时不渲染列表", () => {
    render(<WalkTravelPanel />);
    fireEvent.click(screen.getByRole("button", { name: /^快速前往/ }));
    expect(screen.queryByRole("dialog", { name: "快速前往" })).toBeNull();
  });
});
