// MBT-90 整机门禁：注册表校验 → 装配 → 悬空 → 静态穿模（白名单分层）。
//
// 用法：npx tsx scripts/diag-mbt.ts [--skip-static]
// 退出码：0 = 全部通过；1 = 有未豁免穿模 / 悬空 / 校验错误。
import { buildModel } from "../src/three/parts/assembler/assembler";
import { validateRegistry } from "../src/three/parts/registry/validate";
import { detectUnsupportedParts } from "../src/three/parts/solver/support";
import { detectStatic } from "../src/three/parts/solver/detect";
import { partitionExpectedContacts } from "../src/three/parts/solver/whitelist";
import { makeMbtRegistry, makeMbtLayouts, mbtBuilders } from "../src/three/parts/models/mbt/registry";

const skipStatic = process.argv.includes("--skip-static");
const registry = makeMbtRegistry();
const errors = validateRegistry(registry).filter((issue) => issue.level === "error");
const built = buildModel(registry, {
  builders: mbtBuilders,
  instanceLayouts: makeMbtLayouts(),
  warnMissingLayout: false,
});
const instances = built.parts.reduce((sum, handle) => sum + handle.instances.length, 0);
const byLayer = new Map<number, number>();
for (const part of built.parts) byLayer.set(part.buildLayer, (byLayer.get(part.buildLayer) ?? 0) + 1);
const triangles = built.parts.reduce((sum, handle) => {
  const index = handle.geometry.getIndex();
  if (index) return sum + index.count / 3;
  return sum + handle.geometry.getAttribute("position").count / 3;
}, 0);

console.log("MBT-90 门禁");
console.log(`  零件定义 ${registry.parts.length} / 展开 ${built.parts.length} / 实例 ${instances}`);
console.log(`  节点 ${registry.nodes.length} / 总成 ${registry.assemblies.length} / 白名单 ${registry.expectedContacts?.length ?? 0} 条`);
console.log(
  `  分层 ${[...byLayer.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => `L${k}=${v}`).join(" ")}`,
);
console.log(`  三角面 ${Math.round(triangles).toLocaleString("en-US")}`);
console.log(`  注册表校验：${errors.length} 错`);
for (const issue of errors.slice(0, 10)) console.log(`    ${issue.code} ${issue.path ?? ""} ${issue.message}`);

const support = detectUnsupportedParts(built, { maxGapM: 0.02 });
console.log(`  悬空：${support.length} 条`);
for (const row of support.slice(0, 10)) {
  console.log(`    ${row.ref} 距最近 ${row.nearest} ${row.gap_mm.toFixed(1)}mm`);
}

let unexcused = 0;
if (!skipStatic) {
  const started = performance.now();
  const clips = detectStatic(built, {});
  const split = partitionExpectedContacts(clips, registry.expectedContacts ?? []);
  unexcused = split.active.length;
  console.log(
    `  静态穿模：${clips.length} 报告 / 未豁免 ${unexcused} / 已豁免 ${split.expected.length}（${((performance.now() - started) / 1000).toFixed(1)}s）`,
  );
  for (const row of split.active.slice(0, 10)) {
    console.log(
      `    ${row.report.a} ↔ ${row.report.b} ${row.report.depth_mm === null ? "—" : row.report.depth_mm.toFixed(2)}mm [${row.report.form}]`,
    );
  }
}

built.dispose();
process.exit(errors.length > 0 || support.length > 0 || unexcused > 0 ? 1 : 0);
