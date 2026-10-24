// 航母门禁：注册表 → 装配 → 悬空/孤岛/kit 连通 → 静态穿模（可跳过）→ 起降动画采样。
// 用法：npx tsx scripts/diag-carrier.ts [--skip-static]
import { buildModel } from "../src/three/parts/assembler/assembler";
import { validateRegistry } from "../src/three/parts/registry/validate";
import { detectFloatingIslands, detectUnsupportedParts } from "../src/three/parts/solver/support";
import { detectKitIslands } from "../src/three/parts/solver/kitConnectivity";
import { detectStatic } from "../src/three/parts/solver/detect";
import { partitionExpectedContacts } from "../src/three/parts/solver/whitelist";
import { makeCarrierRegistry, CARRIER_LAYOUTS, carrierBuilders } from "../src/three/parts/models/carrier/registry";
import { animateCarrier, carrierFlightPhase } from "../src/three/parts/models/carrier/motion";

const skipStatic = process.argv.includes("--skip-static");
const registry = makeCarrierRegistry();
const errors = validateRegistry(registry).filter((issue) => issue.level === "error");
const built = buildModel(registry, {
  builders: carrierBuilders,
  instanceLayouts: CARRIER_LAYOUTS,
  warnMissingLayout: false,
});
const instances = built.parts.reduce((sum, handle) => sum + handle.instances.length, 0);
const byLayer = new Map<number, number>();
for (const part of built.parts) byLayer.set(part.buildLayer, (byLayer.get(part.buildLayer) ?? 0) + 1);
const triangles = built.parts.reduce((sum, handle) => {
  const index = handle.geometry.getIndex();
  return sum + (index ? index.count / 3 : handle.geometry.getAttribute("position").count / 3);
}, 0);

console.log("福建舰门禁");
console.log(`  零件定义 ${registry.parts.length} / 展开 ${built.parts.length} / 实例 ${instances}`);
console.log(`  节点 ${registry.nodes.length} / 总成 ${registry.assemblies.length} / 白名单 ${registry.expectedContacts?.length ?? 0} 条`);
console.log(`  分层 ${[...byLayer.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => `L${k}=${v}`).join(" ")}`);
console.log(`  三角面 ${Math.round(triangles).toLocaleString("en-US")}`);
console.log(`  注册表校验：${errors.length} 错`);
for (const issue of errors.slice(0, 12)) console.log(`    ${issue.code} ${issue.path ?? ""} ${issue.message}`);

const support = detectUnsupportedParts(built, { maxGapM: 0.02, ignoreDonorPartIds: ["carrier.hull.hull_shell"] });
console.log(`  悬空：${support.length} 条`);
for (const row of support) console.log(`    ${row.ref} 距最近 ${row.nearest} ${row.gap_mm.toFixed(1)}mm`);

const islands = detectFloatingIslands(built, { maxGapM: 0.02 });
console.log(`  悬空孤岛：${islands.islands.length} 组 / ${islands.islandInstances} 件（最大连通分量 ${islands.rootedSize}/${islands.total}）`);
for (const island of islands.islands) console.log(`    ${island.size} 件：${island.refs.slice(0, 6).join(", ")}`);

const kitIslands = detectKitIslands(built, { maxGapM: 0.02 });
console.log(`  合并件内部悬空：${kitIslands.length} 处`);
for (const row of kitIslands.slice(0, 8)) console.log(`    ${row.partId} ${row.orphanPieces} 子块`);

let unexcused = 0;
if (!skipStatic) {
  const started = performance.now();
  const clips = detectStatic(built, {});
  const split = partitionExpectedContacts(clips, registry.expectedContacts ?? []);
  unexcused = split.active.length;
  console.log(`  静态穿模：${clips.length} 报告 / 未豁免 ${unexcused} / 已豁免 ${split.expected.length}（${((performance.now() - started) / 1000).toFixed(1)}s）`);
  for (const { report } of split.active.slice(0, 30)) {
    console.log(`    ${report.depth_mm === null ? "—" : `${report.depth_mm.toFixed(2)}mm`} [${report.form}] ${report.a} ↔ ${report.b}`);
  }
}

// 起降闭环采样：飞机/滑梭/拦阻索/尾钩都要真的动。
const sample = (t: number) => {
  built.resetNodes();
  animateCarrier(built, t, "flight_ops");
  built.root.updateMatrixWorld(true);
  const aircraft = built.getNode("CV_Aircraft")!;
  const shuttle = built.getNode("CV_Shuttle")!;
  const hook = built.getNode("CV_AircraftHook")!;
  return {
    phase: carrierFlightPhase(t),
    aircraft: aircraft.position.clone(),
    shuttleZ: shuttle.position.z,
    hook: hook.rotation.x,
    wireL: built.getNode("CV_Wire_2_L")!.rotation.y,
    wing: built.getNode("CV_AircraftWingL")!.rotation.z,
  };
};
console.log("  起降闭环采样：");
for (const t of [0, 3.5, 5, 9, 15, 17.8, 19, 22.5, 27]) {
  const s = sample(t);
  console.log(
    `    t=${t.toString().padStart(4)}s ${s.phase.padEnd(9)} ` +
      `飞机(${s.aircraft.x.toFixed(2)},${s.aircraft.y.toFixed(2)},${s.aircraft.z.toFixed(2)}) ` +
      `滑梭z=${s.shuttleZ.toFixed(2)} 钩=${s.hook.toFixed(2)} 索=${s.wireL.toFixed(2)} 翼=${s.wing.toFixed(2)}`,
  );
}

built.dispose();
process.exit(
  errors.length > 0 || support.length > 0 || islands.islands.length > 0 || kitIslands.length > 0 || unexcused > 0
    ? 1
    : 0,
);
