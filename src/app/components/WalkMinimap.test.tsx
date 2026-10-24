// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WalkMinimap } from "./WalkMinimap";
import { useStageStore } from "../state/stageStore";

describe("WalkMinimap", () => {
  afterEach(cleanup);

  beforeEach(() => {
    useStageStore.setState({
      modelId: "carrier",
      walkArea: "deck",
      walkPose: { x: 1.6, z: -1, yaw: Math.PI },
    });
  });

  it("甲板显示区域名、坐标和舰体小地图", () => {
    render(<WalkMinimap />);
    expect(screen.getByLabelText("飞行甲板 小地图")).toBeInTheDocument();
    expect(screen.getByText("飞行甲板")).toBeInTheDocument();
    expect(screen.getByText("x 1.6 · z -1.0")).toBeInTheDocument();
    expect(screen.getByText("艏 ↑")).toBeInTheDocument();
  });

  it("舱室切换后显示本舱小地图；坦克显示俯视", () => {
    const { rerender } = render(<WalkMinimap />);
    useStageStore.setState({ walkArea: "hangar", walkPose: { x: 1.6, z: -9, yaw: Math.PI } });
    rerender(<WalkMinimap />);
    expect(screen.getByLabelText("机库 小地图")).toBeInTheDocument();
    useStageStore.setState({
      modelId: "tiger",
      walkArea: "exterior",
      walkPose: { x: 0, z: 4, yaw: 0 },
    });
    rerender(<WalkMinimap />);
    expect(screen.getByLabelText("车外 小地图")).toBeInTheDocument();
    expect(screen.getByText("俯视")).toBeInTheDocument();
  });
});
