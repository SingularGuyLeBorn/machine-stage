import { buildModel } from "../src/three/parts/assembler/assembler";
import { detectStatic, planPairs } from "../src/three/parts/solver/detect";
import { partitionExpectedContacts } from "../src/three/parts/solver/whitelist";
import { AK47_BUILDERS, makeAk47Layouts, makeAk47Registry } from "../src/three/parts/models/guns7/ak47/registry";

const registry = makeAk47Registry();
const model = buildModel(registry, {
  builders: AK47_BUILDERS,
  instanceLayouts: makeAk47Layouts(),
  warnMissingLayout: false,
});
const plan = planPairs(model);
const reports = detectStatic(model, plan);
const split = partitionExpectedContacts(reports, registry.expectedContacts ?? []);
for (const item of split.active) {
  const r = item.report;
  console.log(
    JSON.stringify({
      a: r.a,
      b: r.b,
      form: r.form,
      depth: r.depth_mm,
      intersection: r.intersection_mm,
      extent: r.extent_mm,
      point: r.point,
    }),
  );
}
