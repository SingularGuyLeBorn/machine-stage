// ED-90 电驱坦克门禁：注册表校验 → 装配 → 悬空/孤岛 → 静态穿模。
// 用法：npx tsx scripts/diag-edrive.ts [--skip-static]
import { buildModel } from "../src/three/parts/assembler/assembler";
import { validateRegistry } from "../src/three/parts/registry/validate";
import { detectFloatingIslands, detectUnsupportedParts } from "../src/three/parts/solver/support";
import { detectStatic } from "../src/three/parts/solver/detect";
import { partitionExpectedContacts } from "../src/three/parts/solver/whitelist";
import { edriveBuilders, makeEdriveLayouts, makeEdriveRegistry } from "../src/three/parts/models/edrive/registry";

const skipStatic = process.argv.includes("--skip-static");
const registry = makeEdriveRegistry();
const errors = validateRegistry(registry).filter((issue) => issue.level === "error");
const built = buildModel(registry, {
  builders: edriveBuilders,
  instanceLayouts: makeEdriveLayouts(),
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

console.log("ED-90 门禁");
console.log(`  零件定义 ${registry.parts.length} / 展开 ${built.parts.length} / 实例 ${instances}`);
console.log(`  节点 ${registry.nodes.length} / 总成 ${registry.assemblies.length} / 白名单 ${registry.expectedContacts?.length ?? 0} 条`);
console.log(`  分层 ${[...byLayer.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => `L${k}=${v}`).join(" ")}`);
console.log(`  三角面 ${Math.round(triangles).toLocaleString("en-US")}`);
console.log(`  注册表校验：${errors.length} 错`);
for (const issue of errors.slice(0, 12)) console.log(`    ${issue.code} ${issue.path ?? ""} ${issue.message}`);

const support = detectUnsupportedParts(built, { maxGapM: 0.02 });
console.log(`  悬空：${support.length} 条`);
for (const row of support.slice(0, 12)) console.log(`    ${row.ref} 距最近 ${row.nearest} ${row.gap_mm.toFixed(1)}mm`);
const islands = detectFloatingIslands(built, { maxGapM: 0.02 });
console.log(`  悬空孤岛：${islands.islands.length} 组 / ${islands.islandInstances} 件（最大连通分量 ${islands.rootedSize}/${islands.total}）`);
for (const island of islands.islands.slice(0, 10)) console.log(`    ${island.size} 件：${island.refs.join(", ")}`);

let unexcused = 0;
if (!skipStatic) {
  const started = performance.now();
  const clips = detectStatic(built, {});
  const split = partitionExpectedContacts(clips, registry.expectedContacts ?? []);
  unexcused = split.active.length;
  console.log(`  静态穿模：${clips.length} 报告 / 未豁免 ${unexcused} / 已豁免 ${split.expected.length}（${((performance.now() - started) / 1000).toFixed(1)}s）`);
  const grouped = new Map<string, { a: string; b: string; count: number; depth: number; forms: Set<string> }>();
  for (const row of split.active) {
    const key = `${row.report.a} ↔ ${row.report.b}`;
    const entry = grouped.get(key) ?? { a: row.report.a, b: row.report.b, count: 0, depth: 0, forms: new Set<string>() };
    entry.count += 1;
    entry.depth = Math.max(entry.depth, row.report.depth_mm ?? 0);
    entry.forms.add(row.report.form);
    grouped.set(key, entry);
  }
  for (const row of [...grouped.values()].sort((x, y) => y.depth - x.depth || y.count - x.count).slice(0, 30)) {
    console.log(`    ${row.a} ↔ ${row.b} ×${row.count} 最深 ${row.depth.toFixed(2)}mm [${[...row.forms].join(",")}]`);
  }
}

built.dispose();
process.exit(errors.length > 0 || support.length > 0 || islands.islands.length > 0 || unexcused > 0 ? 1 : 0);
