// MBT-90 整机门禁：注册表校验 → 装配 → 悬空 → 静态穿模（白名单分层）。
//
// 用法：npx tsx scripts/diag-mbt.ts [--skip-static]
// 退出码：0 = 全部通过；1 = 有未豁免穿模 / 悬空 / 校验错误。
import { buildModel } from "../src/three/parts/assembler/assembler";
import { validateRegistry } from "../src/three/parts/registry/validate";
import { detectFloatingIslands, detectUnsupportedParts } from "../src/three/parts/solver/support";
import { detectKitIslands } from "../src/three/parts/solver/kitConnectivity";
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

// 成对支撑会把「互相靠近的一团悬空件」当成有支撑；连通性检查补这个洞。
const islands = detectFloatingIslands(built, { maxGapM: 0.02 });
console.log(
  `  悬空孤岛：${islands.islands.length} 组 / ${islands.islandInstances} 件（最大连通分量 ${islands.rootedSize}/${islands.total}）`,
);
for (const island of islands.islands.slice(0, 10)) {
  console.log(`    ${island.size} 件：${island.refs.join(", ")}`);
}

// 件级支撑看不到合并 kit 内部断开（例如烟幕器上排两管）：单独扫子块连通。
const kitIslands = detectKitIslands(built, { maxGapM: 0.02 });
console.log(`  合并件内部悬空：${kitIslands.length} 处`);
for (const row of kitIslands.slice(0, 12)) {
  console.log(
    `    ${row.partId}（${row.name}）${row.orphanPieces} 子块 / ${row.instances} 实例，` +
      `最近外部零件 ${row.gap_mm === null ? "—" : `${row.gap_mm.toFixed(1)}mm`}，最大子块 ${row.size_mm.toFixed(1)}mm`,
  );
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
  const grouped = new Map<string, { a: string; b: string; count: number; depth: number; forms: Set<string> }>();
  for (const row of split.active) {
    const key = `${row.report.a} ↔ ${row.report.b}`;
    const entry = grouped.get(key) ?? { a: row.report.a, b: row.report.b, count: 0, depth: 0, forms: new Set<string>() };
    entry.count += 1;
    entry.depth = Math.max(entry.depth, row.report.depth_mm ?? 0);
    entry.forms.add(row.report.form);
    grouped.set(key, entry);
  }
  const topGroups = [...grouped.values()].sort((x, y) => y.depth - x.depth || y.count - x.count);
  for (const row of topGroups.slice(0, 30)) {
    console.log(`    ${row.a} ↔ ${row.b} ×${row.count} 最深 ${row.depth.toFixed(2)}mm [${[...row.forms].join(",")}]`);
  }
}

built.dispose();
process.exit(
  errors.length > 0 ||
    support.length > 0 ||
    islands.islands.length > 0 ||
    kitIslands.length > 0 ||
    unexcused > 0
    ? 1
    : 0,
);
