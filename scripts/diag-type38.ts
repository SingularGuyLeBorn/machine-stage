import { buildModel } from "../src/three/parts/assembler/assembler";
import { detectStatic, planPairs } from "../src/three/parts/solver/detect";
import { detectUnsupportedParts } from "../src/three/parts/solver/support";
import { partitionExpectedContacts } from "../src/three/parts/solver/whitelist";
import { formatIssues, validateRegistry } from "../src/three/parts/registry/validate";
import { type38Builders, type38Layouts, type38Registry } from "../src/three/parts/models/guns7/type38/registry";

const issues = validateRegistry(type38Registry);
console.log(`validate: ${issues.filter((i) => i.level === "error").length} errors, ${issues.filter((i) => i.level === "warn").length} warns`);
if (issues.length) console.log(formatIssues(issues));
console.log(`parts: ${type38Registry.parts.length} definitions`);
const model = buildModel(type38Registry, {
  builders: type38Builders,
  instanceLayouts: type38Layouts,
  warnMissingLayout: false,
});
console.log(`handles: ${model.parts.size}; instances: ${model.parts.reduce((n, p) => n + p.instances.length, 0)}`);
const plan = planPairs(model);
const reports = detectStatic(model, plan);
const split = partitionExpectedContacts(reports, type38Registry.expectedContacts ?? []);
console.log(`static reports: ${reports.length}; expected: ${split.expected.length}; ACTIVE: ${split.active.length}`);
const fmt = (r: (typeof reports)[number]) =>
  `${r.depth_mm === null ? "  —  " : r.depth_mm.toFixed(2).padStart(6)}mm [${r.form}] ${r.a} <> ${r.b}`;
for (const item of split.active.sort((a, b) => (b.report.depth_mm ?? 99) - (a.report.depth_mm ?? 99)).slice(0, 80)) {
  console.log(fmt(item.report));
}
const support = detectUnsupportedParts(model);
console.log(`unsupported: ${support.length}`);
for (const s of support.slice(0, 60)) {
  console.log(`${(s.gap_m * 1000).toFixed(1).padStart(6)}mm  ${s.partId}`);
}
