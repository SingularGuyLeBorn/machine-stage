// 动态穿模扫描（全状态矩阵）——把每个动画状态按时间轴采样后逐帧做碰撞检测。
//
// 用法：
//   npx tsx scripts/diag-sweep.ts                  # 全部 10 个场景，30 fps
//   npx tsx scripts/diag-sweep.ts --fps 24         # 降采样（更快）
//   npx tsx scripts/diag-sweep.ts --only firing,loading,driving
//   npx tsx scripts/diag-sweep.ts --json docs/qa/sweep-report.json
//
// 退出码：0 = 所有场景未豁免 0；1 = 有未豁免（真缺陷候选）。
import { writeFileSync } from "node:fs";
import { buildModel } from "../src/three/parts/assembler/assembler";
import { makeTigerLayouts, makeTigerRegistry, tigerBuilders } from "../src/three/parts/models/tiger/registry";
import {
  runTigerSweep,
  TIGER_SWEEP_SCENARIOS,
  type TigerSweepScenario,
} from "../src/three/parts/models/tiger/sweep";
import type { ClippingReport } from "../src/three/parts/solver/report";

const args = process.argv.slice(2);
const arg = (name: string, fallback?: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const fps = Number(arg("fps", "30"));
const only = arg("only")?.split(",").filter(Boolean);
const jsonPath = arg("json");

const registry = makeTigerRegistry();
const expectedContacts = registry.expectedContacts ?? [];
const assembled = buildModel(registry, {
  builders: tigerBuilders,
  instanceLayouts: makeTigerLayouts(),
  warnMissingLayout: false,
});

const scenarios: TigerSweepScenario[] = TIGER_SWEEP_SCENARIOS.filter(
  (scenario) => !only || only.includes(scenario.id),
);
if (scenarios.length === 0) {
  console.error(`没有匹配的场景；可选：${TIGER_SWEEP_SCENARIOS.map((s) => s.id).join(", ")}`);
  process.exit(2);
}

console.log(`动态扫掠：${scenarios.length} 个场景 · ${fps} fps · 规则 ${expectedContacts.length} 条`);
console.log("场景            帧数   报告  未豁免  已豁免   最深      耗时");
const result = runTigerSweep(assembled, expectedContacts, {
  scenarios,
  fps,
  onScenario: (report) => {
    const deepest = report.reports.reduce(
      (max, r) => Math.max(max, r.depth_mm ?? 0),
      0,
    );
    console.log(
      `${report.scenario.id.padEnd(14)}${String(report.frames).padStart(5)}  ` +
        `${String(report.reports.length).padStart(5)}  ${String(report.unexcused.length).padStart(6)}  ` +
        `${String(report.expected.length).padStart(6)}  ${deepest.toFixed(2).padStart(7)}mm  ${report.ms} ms`,
    );
  },
});

const timeOf = (scenario: TigerSweepScenario, report: ClippingReport) => {
  const frames = Math.max(2, Math.round(scenario.duration * fps) + 1);
  return ((report.frame ?? 0) / (frames - 1)) * scenario.duration;
};
if (result.unexcused.length > 0) {
  console.log(`--- 未豁免（真缺陷候选） ${result.unexcused.length} 条 ---`);
  for (const entry of result.scenarios) {
    for (const report of entry.unexcused) {
      const t = timeOf(entry.scenario, report);
      console.log(
        `${entry.scenario.id}@${t.toFixed(2)}s  ` +
          `${report.depth_mm === null ? "未测出" : `${report.depth_mm.toFixed(2)}mm`}  ` +
          `[${report.form}]  ${report.a}  ↔  ${report.b}`,
      );
    }
  }
} else {
  console.log("--- 未豁免 0：所有场景逐帧零穿模 ---");
}

if (jsonPath) {
  const payload = {
    fps,
    samples: result.samples,
    ms: result.ms,
    scenarios: result.scenarios.map((entry) => ({
      id: entry.scenario.id,
      label: entry.scenario.label,
      frames: entry.frames,
      ms: entry.ms,
      reports: entry.reports.map((report) => ({
        t: Number(timeOf(entry.scenario, report).toFixed(3)),
        a: report.a,
        b: report.b,
        depth_mm: report.depth_mm,
        form: report.form,
        point: report.point,
      })),
      unexcused: entry.unexcused.length,
      expected: entry.expected.length,
    })),
  };
  writeFileSync(jsonPath, JSON.stringify(payload, null, 2));
  console.log(`报告已写出：${jsonPath}`);
}

assembled.dispose();
process.exit(result.unexcused.length > 0 ? 1 : 0);
