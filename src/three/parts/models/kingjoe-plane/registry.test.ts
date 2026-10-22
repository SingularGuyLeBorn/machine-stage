import { describe, expect, it } from "vitest";
import { buildModel, validateRegistry } from "@/three/parts";
import { kingjoePlaneBuilders, makeKingJoePlaneRegistry, planeStats, poseKingJoePlane } from "./registry";

describe("金古桥平整封口", () => {
  it("逐条验证实际输出边的闭合、绕序、体积和截面方向", () => {
    const registry = makeKingJoePlaneRegistry();
    expect(validateRegistry(registry).filter((e) => e.level === "error")).toEqual([]);
    const model = buildModel(registry, { builders: kingjoePlaneBuilders });
    let totalVolume = 0;
    const areas: number[] = [];
    for (const part of model.parts) {
      const p = part.geometry.getAttribute("position");
      const n = part.geometry.getAttribute("normal");
      const capStart = part.geometry.groups[1]!.start;
      const keys = Array.from({ length: p.count }, (_, i) => `${p.getX(i)},${p.getY(i)},${p.getZ(i)}`);
      const edges = new Map<string, { count: number; direction: number }>();
      let volume = 0;
      let area = 0;
      for (let i = 0; i < p.count; i += 3) {
        const a = [p.getX(i), p.getY(i), p.getZ(i)];
        const b = [p.getX(i + 1), p.getY(i + 1), p.getZ(i + 1)];
        const c = [p.getX(i + 2), p.getY(i + 2), p.getZ(i + 2)];
        volume +=
          (a[0]! * (b[1]! * c[2]! - b[2]! * c[1]!) +
            a[1]! * (b[2]! * c[0]! - b[0]! * c[2]!) +
            a[2]! * (b[0]! * c[1]! - b[1]! * c[0]!)) /
          6;
        for (let j = 0; j < 3; j++) {
          const ka = keys[i + j]!;
          const kb = keys[i + ((j + 1) % 3)]!;
          const key = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
          const edge = edges.get(key) ?? { count: 0, direction: 0 };
          edge.count++;
          edge.direction += ka < kb ? 1 : -1;
          edges.set(key, edge);
        }
        if (i >= capStart) {
          const crossY = (b[2]! - a[2]!) * (c[0]! - a[0]!) - (b[0]! - a[0]!) * (c[2]! - a[2]!);
          const sign = part.partId.includes("lower") ? 1 : -1;
          expect(crossY * sign).toBeGreaterThan(0);
          area += Math.abs(crossY) / 2;
          for (let j = 0; j < 3; j++) {
            expect(p.getY(i + j)).toBeCloseTo(planeStats.height, 6);
            expect([n.getX(i + j), n.getY(i + j), n.getZ(i + j)]).toEqual([0, sign, 0]);
          }
        }
      }
      expect([...edges.values()].filter((e) => e.count !== 2 || e.direction !== 0)).toEqual([]);
      expect(volume).toBeGreaterThan(0);
      totalVolume += volume;
      areas.push(area);
    }
    expect(totalVolume).toBeCloseTo(planeStats.source_volume, 5);
    expect(areas[0]).toBeCloseTo(areas[1]!, 6);
    poseKingJoePlane(model, 0, "idle");
    expect(model.getNode("PlaneUpper")!.position.y).toBe(model.constants.INSPECTION_GAP);
    poseKingJoePlane(model, 0, "closed");
    expect(model.getNode("PlaneUpper")!.position.y).toBe(0);
    model.dispose();
  });
});
