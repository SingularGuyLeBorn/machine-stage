// 航母动画扫掠门禁：按状态连续采样并跑 detectSweep，未豁免 > 0 退出 1。
//
// 用法：
//   npx tsx scripts/diag-carrier-sweep.ts                          # flight_ops 30s @2fps
//   npx tsx scripts/diag-carrier-sweep.ts --state ciws --duration 8 --fps 2
import { buildModel } from "../src/three/parts/assembler/assembler";
import { detectSweep } from "../src/three/parts/solver/detect";
import { partitionExpectedContacts } from "../src/three/parts/solver/whitelist";
import { makeCarrierRegistry, CARRIER_LAYOUTS, carrierBuilders } from "../src/three/parts/models/carrier/registry";
import { animateCarrier } from "../src/three/parts/models/carrier/motion";

const args = process.argv.slice(2);
const arg = (name: string, fallback: string) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1]! : fallback;
};
const state = arg("state", "flight_ops");
const fps = Number(arg("fps", "2"));
const duration = Number(arg("duration", "30"));

const registry = makeCarrierRegistry();
const built = buildModel(registry, {
  builders: carrierBuilders,
  instanceLayouts: CARRIER_LAYOUTS,
  warnMissingLayout: false,
});

console.log(`福建舰扫掠：${state} · ${duration}s @${fps}fps`);
const started = performance.now();
const reports = detectSweep(built, {
  duration,
  fps,
  applyPose: (t) => {
    built.resetNodes();
    animateCarrier(built, t, state);
  },
});
const split = partitionExpectedContacts(reports, registry.expectedContacts ?? []);
console.log(
  `  报告 ${reports.length} / 未豁免 ${split.active.length} / 已豁免 ${split.expected.length}（${(
    (performance.now() - started) / 1000
  ).toFixed(1)}s）`,
);

for (const { report } of split.active.slice(0, 60)) {
  const t = report.frame === null ? "" : `@${((report.frame / Math.round(duration * fps)) * duration).toFixed(2)}s`;
  console.log(
    `  ${t} ${report.depth_mm === null ? "—" : `${report.depth_mm.toFixed(2)}mm`} ` +
      `[${report.form}] ${report.a} ↔ ${report.b}`,
  );
}
const norm = (id: string) => id.replace(/\d+/g, "#").replace(/\[#\]/g, "[#]");
const groups = new Map<string, { count: number; max: number; sample: string }>();
for (const { report } of split.active) {
  const key = `${norm(report.a)} ↔ ${norm(report.b)}`;
  const prev = groups.get(key);
  const depth = report.depth_mm ?? 0;
  if (prev) {
    prev.count += 1;
    if (depth > prev.max) prev.max = depth;
  } else {
    groups.set(key, { count: 1, max: depth, sample: `${report.a} ↔ ${report.b}` });
  }
}
console.log("  按配对归并：");
for (const [key, row] of [...groups.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 50)) {
  console.log(`    ×${row.count.toString().padStart(4)} max ${row.max.toFixed(1)}mm  ${key}`);
}
if (split.active.length === 0) console.log("  未豁免 0");
built.dispose();
process.exit(split.active.length > 0 ? 1 : 0);
