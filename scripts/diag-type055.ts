import { buildModel } from "../src/three/parts/assembler/assembler";
import { detectStatic } from "../src/three/parts/solver/detect";
import { detectUnsupportedParts, detectFloatingIslands } from "../src/three/parts/solver/support";
import { detectKitIslands } from "../src/three/parts/solver/kitConnectivity";
import { partitionExpectedContacts } from "../src/three/parts/solver/whitelist";
import { makeType055Registry, makeType055Layouts, TYPE055_BUILDERS } from "../src/three/parts/models/type055/registry";

const registry = makeType055Registry();
const built = buildModel(registry, {
  builders: TYPE055_BUILDERS,
  instanceLayouts: makeType055Layouts(),
  warnMissingLayout: false,
});
console.log(`055 门禁：${built.parts.length} 零件`);
const unsupported = detectUnsupportedParts(built, { maxGapM: 0.02 });
console.log(`悬空：${unsupported.length}`);
for (const row of unsupported.slice(0, 20)) console.log(`  ${row.gap_mm.toFixed(1)}mm ${row.ref}`);
const islands = detectFloatingIslands(built, { maxGapM: 0.02 });
console.log(`悬空孤岛：${islands.islands.length} 组 / ${islands.islandInstances} 件`);
const kit = detectKitIslands(built, { maxGapM: 0.02 });
console.log(`合并件内部悬空：${kit.length}`);
const reports = detectStatic(built, {});
const split = partitionExpectedContacts(reports, registry.expectedContacts ?? []);
console.log(`静态穿模：${reports.length} / 未豁免 ${split.active.length}`);
for (const { report } of split.active.slice(0, 30)) {
  console.log(`  ${report.depth_mm?.toFixed(1) ?? "—"}mm ${report.a} ↔ ${report.b}`);
}
built.dispose();
