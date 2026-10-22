// 用户要求四排等宽固定块；两组三连亮区只切换格子的亮度。
// [OM-FREEPLAY] 每排 12 格、每秒推进 5 格；两组分别沿上下两排的矩形路径循环。
export const VISOR_GRID = {
  rows: 4,
  columns: 12,
  width: 0.432,
  height: 0.144,
  centerY: 6.195,
  stepsPerSecond: 5,
};
export function visorHighlights(seconds: number): number[] {
  const n = VISOR_GRID.columns;
  const step = Math.floor(Math.max(0, seconds) * VISOR_GRID.stepsPerSecond);
  return Array.from({ length: 6 }, (_, i) => {
    const band = Math.floor(i / 3),
      trail = i % 3;
    const phase = (((step + band * n - trail) % (2 * n)) + 2 * n) % (2 * n);
    const row = band * 2 + (phase < n ? 0 : 1);
    const col = phase < n ? phase : 2 * n - 1 - phase;
    return row * n + col;
  });
}
