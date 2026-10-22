// MBT-90 动画扫掠门禁：按状态采样并跑 detectSweep，未豁免 > 0 退出 1。
//
// 用法：
//   npx tsx scripts/diag-mbt-sweep.ts                         # aim 3s @6fps
//   npx tsx scripts/diag-mbt-sweep.ts --state hunter_killer --duration 6
//   npx tsx scripts/diag-mbt-sweep.ts --state loading --duration 6 --fps 5
import { buildModel } from "../src/three/parts/assembler/assembler";
import { detectSweep } from "../src/three/parts/solver/detect";
import { partitionExpectedContacts } from "../src/three/parts/solver/whitelist";
import { makeMbtRegistry, makeMbtLayouts, mbtBuilders } from "../src/three/parts/models/mbt/registry";
import { animateMbt } from "../src/three/parts/models/mbt/motion";

const args = process.argv.slice(2);
const arg = (name: string, fallback: string) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1]! : fallback;
};
const state = arg("state", "aim");
const fps = Number(arg("fps", "6"));
const duration = Number(arg("duration", "3"));

const registry = makeMbtRegistry();
const built = buildModel(registry, {
  builders: mbtBuilders,
  instanceLayouts: makeMbtLayouts(),
  warnMissingLayout: false,
});

console.log(`MBT-90 扫掠：${state} · ${duration}s @${fps}fps`);
const started = performance.now();
const reports = detectSweep(built, {
  duration,
  fps,
  applyPose: (t) => {
    built.resetNodes();
    animateMbt(built, t, state);
  },
});
const split = partitionExpectedContacts(reports, registry.expectedContacts ?? []);
console.log(
  `  报告 ${reports.length} / 未豁免 ${split.active.length} / 已豁免 ${split.expected.length}（${(
    (performance.now() - started) / 1000
  ).toFixed(1)}s）`,
);

for (const { report } of split.active.slice(0, 40)) {
  const t = report.frame === null ? "" : `@${((report.frame / Math.round(duration * fps)) * duration).toFixed(2)}s`;
  console.log(
    `  ${t} ${report.depth_mm === null ? "—" : `${report.depth_mm.toFixed(2)}mm`} ` +
      `[${report.form}] ${report.a} ↔ ${report.b}`,
  );
}
if (split.active.length === 0) console.log("  未豁免 0");
built.dispose();
process.exit(split.active.length > 0 ? 1 : 0);
