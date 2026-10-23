// 航母外形/外板专项穿模审计：绕开“carrier.* ↔ carrier.*”整船豁免，
// 只看舷侧、甲板缘、外走道、外板列板等外露件之间的真实重叠。
// 用法：npx tsx scripts/diag-carrier-exterior.ts [--min 20]
import { writeFileSync } from "node:fs";
import { buildModel } from "../src/three/parts/assembler/assembler";
import { detectStatic } from "../src/three/parts/solver/detect";
import { partitionExpectedContacts } from "../src/three/parts/solver/whitelist";
import type { ClippingReport } from "../src/three/parts/solver/report";
import { makeCarrierRegistry, CARRIER_LAYOUTS, carrierBuilders } from "../src/three/parts/models/carrier/registry";

const minDepth = Number(process.argv[process.argv.indexOf("--min") + 1]) || 20;
const registry = makeCarrierRegistry();
const built = buildModel(registry, {
  builders: carrierBuilders,
  instanceLayouts: CARRIER_LAYOUTS,
  warnMissingLayout: false,
});

const WATCHED =
  /^(carrier\.(deck\.(sponson|flight_deck|runway|launch|cat_|emals|elevator|safety_net|arrestor|deck_rail)|hull\.(shell|underwater|segment|detail_(strake|bilge_keel|stringer|gusset|sea_chest|docking_plug|plate_seam|weld))|surface\.(catwalk|boat|anchor|deck_rail|hull_number|life_|tie_chain)|island\.[a-z]+_(base|platform|foundation)))/;

const partId = (ref: string) => ref.split("[")[0]!;
const reports = detectStatic(built, {});
if (process.argv.includes("--dump")) {
  writeFileSync("docs/qa/carrier-static-report.json", JSON.stringify(reports));
  console.log(`已导出 ${reports.length} 条报告 → docs/qa/carrier-static-report.json`);
}
const watched = reports.filter((report) => WATCHED.test(partId(report.a)) || WATCHED.test(partId(report.b)));

type Row = {
  key: string;
  count: number;
  max: number;
  forms: Set<string>;
  sample: ClippingReport;
};
const rows = new Map<string, Row>();
for (const report of watched) {
  const key = [partId(report.a), partId(report.b)].sort().join(" ↔ ");
  const depth = report.depth_mm ?? -1;
  const row = rows.get(key);
  if (!row) {
    rows.set(key, { key, count: 1, max: depth, forms: new Set([report.form ?? "?"]), sample: report });
  } else {
    row.count++;
    row.forms.add(report.form ?? "?");
    if (depth > row.max) {
      row.max = depth;
      row.sample = report;
    }
  }
}

const sorted = [...rows.values()].sort((a, b) => b.max - a.max);
console.log(`外露件穿模审计：${watched.length} 报告 / ${rows.size} 零件对（阈值 ${minDepth}mm）`);
console.log("--- 深度超过阈值的零件对 ---");
let flagged = 0;
for (const row of sorted) {
  if (row.max < minDepth) continue;
  flagged++;
  const r = row.sample;
  const p = r.point.map((v) => (v * 1000).toFixed(0)).join(",");
  console.log(
    `${row.max.toFixed(1).padStart(8)}mm ×${String(row.count).padStart(3)} [${[...row.forms].join("/")}] ` +
      `@(${p})mm  ${row.key}  交线 ${(r.intersection_mm ?? 0).toFixed(1)}mm`,
  );
}
if (flagged === 0) console.log(`（无：所有外露件实测重叠均 ≤ ${minDepth}mm）`);
console.log("--- 未测出深度的外露件接触（前 20，按交线长度） ---");
for (const row of sorted.filter((r) => r.max < 0).slice(0, 20)) {
  const r = row.sample;
  console.log(`${(r.intersection_mm ?? 0).toFixed(1).padStart(8)}mm ×${row.count}  ${row.key}`);
}
if (process.argv.includes("--active")) {
  const split = partitionExpectedContacts(reports, registry.expectedContacts ?? []);
  const groups = new Map<string, { count: number; max: number; forms: Set<string>; sample: ClippingReport }>();
  for (const { report } of split.active) {
    const key = [partId(report.a), partId(report.b)].sort().join(" ↔ ");
    const depth = report.depth_mm ?? -1;
    const row = groups.get(key);
    if (!row) groups.set(key, { count: 1, max: depth, forms: new Set([report.form ?? "?"]), sample: report });
    else {
      row.count++;
      row.forms.add(report.form ?? "?");
      if (depth > row.max) {
        row.max = depth;
        row.sample = report;
      }
    }
  }
  console.log(`--- 未豁免全部 ${split.active.length} 条 / ${groups.size} 对（按深度） ---`);
  for (const row of [...groups.values()].sort((a, b) => b.max - a.max)) {
    const r = row.sample;
    console.log(
      `${row.max.toFixed(1).padStart(8)}mm ×${String(row.count).padStart(3)} [${[...row.forms].join("/")}] ` +
        `${[partId(r.a), partId(r.b)].sort().join(" ↔ ")}`,
    );
  }
}
built.dispose();
