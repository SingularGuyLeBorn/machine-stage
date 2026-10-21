import * as THREE from "three";
import {
  buildModel,
  detectStatic,
  detectUnsupportedParts,
  partitionExpectedContacts,
  validateRegistry,
} from "@/three/parts";
import {
  makeKingJoeLayouts,
  makeKingJoeRegistry,
  kingjoeModelBuilders,
} from "@/three/parts/models/kingjoe/registry";

const registry = makeKingJoeRegistry();
const errors = validateRegistry(registry).filter((i) => i.level === "error");
console.log(`parts=${registry.parts.length} errors=${errors.length}`);
if (errors.length) console.log(errors.slice(0, 10));

const model = buildModel(registry, {
  builders: kingjoeModelBuilders,
  instanceLayouts: makeKingJoeLayouts(),
  warnMissingLayout: false,
});
model.resetNodes();
model.syncInstances();
model.root.updateMatrixWorld(true);

const world = new THREE.Box3().setFromObject(model.root);
const size = world.getSize(new THREE.Vector3());
console.log(
  `bbox min=(${world.min.toArray().map((v) => v.toFixed(3))}) max=(${world.max.toArray().map((v) => v.toFixed(3))}) size=(${size.toArray().map((v) => v.toFixed(3))})`,
);

const box = new THREE.Box3();
const rows: { id: string; min: THREE.Vector3; max: THREE.Vector3; cy: number; skin: boolean }[] = [];
for (const handle of model.parts) {
  box.copy(model.partBounds(handle, new THREE.Box3()));
  if (box.isEmpty()) continue;
  rows.push({
    id: handle.partId,
    min: box.min.clone(),
    max: box.max.clone(),
    cy: (box.min.y + box.max.y) / 2,
    skin: handle.partId.includes(".skin_"),
  });
}
const outliers = rows.filter(
  (r) => Math.max(Math.abs(r.min.x), Math.abs(r.max.x)) > 1.5 || r.min.y < -0.05 || r.max.y > 7.0,
);
console.log(`\noutliers (|x|>1.5 or y outside 0..7): ${outliers.length}`);
for (const r of outliers.slice(0, 120)) {
  console.log(
    `${r.skin ? "SKIN" : "MECH"} ${r.id} x[${r.min.x.toFixed(2)},${r.max.x.toFixed(2)}] y[${r.min.y.toFixed(2)},${r.max.y.toFixed(2)}] z[${r.min.z.toFixed(2)},${r.max.z.toFixed(2)}]`,
  );
}

const reports = detectStatic(model, { minDepthM: 0.0005 });
const split = partitionExpectedContacts(reports, registry.expectedContacts ?? []);
console.log(`\nreports=${reports.length} expected=${split.expected.length} active=${split.active.length}`);

console.log("sample active:");
for (const { report } of split.active.slice(0, 12))
  console.log(" ", report.a, "<>", report.b, report.depth_mm);

const byMech = new Map<string, { count: number; max: number; peer: string }>();
for (const { report } of split.active) {
  const aSkin = report.a.includes(".skin_");
  const bSkin = report.b.includes(".skin_");
  if (aSkin && bSkin) continue;
  const mech = aSkin ? report.b : bSkin ? report.a : `${report.a} <> ${report.b}`;
  const peer = aSkin ? report.a : bSkin ? report.b : "";
  const entry = byMech.get(mech) ?? { count: 0, max: 0, peer: "" };
  entry.count++;
  if (report.depth_mm > entry.max) {
    entry.max = report.depth_mm;
    entry.peer = peer;
  }
  byMech.set(mech, entry);
}
console.log(
  `\nmechanism-vs-skin active pairs: ${byMech.size} parts, ${[...byMech.values()].reduce((n, v) => n + v.count, 0)} reports`,
);
for (const [id, v] of [...byMech.entries()].sort((a, b) => b[1].max - a[1].max).slice(0, 80)) {
  console.log(`${v.max.toFixed(1)}mm x${v.count} ${id}  (peer ${v.peer})`);
}

const nonSkin = split.active.filter(
  ({ report }) => !report.a.includes(".skin_") && !report.b.includes(".skin_"),
);
console.log(`\nmechanism-mechanism active=${nonSkin.length}`);
for (const { report } of nonSkin.slice(0, 20))
  console.log(`  ${report.a} <> ${report.b} ${report.depth_mm}mm`);

const support = detectUnsupportedParts(model);
console.log(`\nunsupported=${support.length}`);
for (const r of support.slice(0, 30))
  console.log(`  ${r.ref} gap=${r.gap_mm.toFixed(1)} nearest=${r.nearest}`);
model.dispose();
