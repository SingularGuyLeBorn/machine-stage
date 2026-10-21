import {
  buildModel,
  detectStatic,
  detectUnsupportedParts,
  partitionExpectedContacts,
  validateRegistry,
} from "@/three/parts";
import {
  makeKingJoeRegistry,
  makeKingJoeLayouts,
  kingjoeModelBuilders,
} from "@/three/parts/models/kingjoe/registry";

const registry = makeKingJoeRegistry();
const issues = validateRegistry(registry);
const errors = issues.filter((i) => i.level === "error");
const warnings = issues.filter((i) => i.level === "warn");
console.log(
  `parts=${registry.parts.length} nodes=${registry.nodes.length} errors=${errors.length} warnings=${warnings.length}`,
);
if (errors.length) console.log(errors.slice(0, 20));
if (warnings.length) console.log(warnings.slice(0, 20));
const byAssembly = new Map<string, number>();
for (const p of registry.parts) byAssembly.set(p.assembly, (byAssembly.get(p.assembly) ?? 0) + 1);
console.log("by assembly", [...byAssembly.entries()]);
const layers = new Map<number, number>();
for (const p of registry.parts) layers.set(p.build_layer, (layers.get(p.build_layer) ?? 0) + 1);
console.log("by layer", [...layers.entries()]);
let instances = 0;
for (const p of registry.parts) instances += p.instances ?? 1;
console.log(`instances=${instances}`);

const model = buildModel(registry, {
  builders: kingjoeModelBuilders,
  instanceLayouts: makeKingJoeLayouts(),
  warnMissingLayout: false,
});
model.resetNodes();
model.syncInstances();
model.root.updateMatrixWorld(true);
let triangles = 0;
for (const handle of model.parts) {
  const g = handle.geometry;
  const c = g.index ? g.index.count / 3 : g.getAttribute("position").count / 3;
  triangles += c * (handle.instanced ? handle.instances.length : 1);
}
console.log(`built triangles=${Math.round(triangles)}`);
const staticReports = detectStatic(model, { minDepthM: 0.0005 });
const split = partitionExpectedContacts(staticReports, registry.expectedContacts ?? []);
console.log(
  `static raw=${staticReports.length} expected=${split.expected.length} active=${split.active.length}`,
);
for (const { report: r } of split.active.slice(0, 25))
  console.log(
    `  ${r.a} <-> ${r.b} depth=${r.depth_mm} form=${r.form} point=${r.point.map((n) => n.toFixed(2)).join(",")}`,
  );
const support = detectUnsupportedParts(model);
console.log(`unsupported=${support.length}`);
for (const r of support.slice(0, 25))
  console.log(`  ${r.ref} gap=${r.gap_mm.toFixed(1)} nearest=${r.nearest}`);
model.dispose();
