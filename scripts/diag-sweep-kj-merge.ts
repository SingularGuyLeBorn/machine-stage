import { buildModel, detectSweep, detectUnsupportedParts, matchExpectedContact } from "@/three/parts";
import {
  makeKingJoeRegistry,
  makeKingJoeLayouts,
  kingjoeModelBuilders,
} from "@/three/parts/models/kingjoe/registry";
import { animateKingJoe, type KingJoeState } from "@/three/parts/models/kingjoe/motion";

const registry = makeKingJoeRegistry();
const model = buildModel(registry, {
  builders: kingjoeModelBuilders,
  instanceLayouts: makeKingJoeLayouts(),
  warnMissingLayout: false,
});
const rules = registry.expectedContacts ?? [];

function sweep(state: KingJoeState, duration: number, fps = 15) {
  model.resetNodes();
  animateKingJoe(model, 0, state);
  const supports = detectUnsupportedParts(model);
  const t0 = Date.now();
  const reports = detectSweep(model, {
    duration,
    fps,
    analysisBudget: 80,
    applyPose: (t) => {
      model.resetNodes();
      animateKingJoe(model, t, state);
    },
  });
  const active = reports.filter((report) => !matchExpectedContact(report, rules));
  console.log(
    `${state}: ${duration}s@${fps}fps raw=${reports.length} active=${active.length} in ${Date.now() - t0}ms; unsupported(t0)=${supports.length}`,
  );
  for (const r of active.slice(0, 20)) {
    console.log(`   ${r.a} <-> ${r.b} ${r.depth_mm?.toFixed(1)} form=${r.form} frame=${r.frame}`);
  }
  return active.length;
}

let total = 0;
total += sweep("combining", 10);
total += sweep("separation", 4);
total += sweep("robot", 6);
total += sweep("firing", 3);
total += sweep("formation", 3);
total += sweep("crippled", 3);
total += sweep("damaged", 3);
console.log(`TOTAL ACTIVE=${total}`);
model.dispose();
