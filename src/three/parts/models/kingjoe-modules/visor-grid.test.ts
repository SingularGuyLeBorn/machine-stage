import { describe, expect, it } from "vitest";
import { VISOR_GRID, visorHighlights } from "./visor-grid";
describe("固定四排头屏", () => {
  it("四排等宽，48 格固定地址；两组三连亮区逐格循环，不产生游离坐标", () => {
    expect(VISOR_GRID.rows).toBe(4);
    expect(VISOR_GRID.width / VISOR_GRID.columns).toBeCloseTo(VISOR_GRID.height / VISOR_GRID.rows, 12);
    const visited = new Set<number>();
    for (let step = 0; step < 48; step++) {
      const cells = visorHighlights(step / VISOR_GRID.stepsPerSecond);
      expect(new Set(cells).size).toBe(6);
      for (const [i, cell] of cells.entries()) {
        expect(Number.isInteger(cell)).toBe(true);
        expect(Math.floor(cell / (VISOR_GRID.columns * 2))).toBe(Math.floor(i / 3));
        visited.add(cell);
      }
      expect(visorHighlights((step + 0.9) / VISOR_GRID.stepsPerSecond)).toEqual(cells);
      const next = visorHighlights((step + 1) / VISOR_GRID.stepsPerSecond);
      expect(next[1]).toBe(cells[0]);
      expect(next[2]).toBe(cells[1]);
      expect(next[4]).toBe(cells[3]);
      expect(next[5]).toBe(cells[4]);
    }
    expect(visited.size).toBe(VISOR_GRID.rows * VISOR_GRID.columns);
  });
});
