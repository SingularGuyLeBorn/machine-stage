import { buildModel, detectSweep, detectUnsupportedParts } from "@/three/parts";
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
function sweep(state: KingJoeState, duration: number, fps = 30) {
  model.resetNodes();
  animateKingJoe(model, 0, state);
  const supports = detectUnsupportedParts(model);
  const t0 = Date.now();
  const reports = detectSweep(model, {
    duration,
    fps,
    analysisBudget: 40,
    applyPose: (t) => {
      model.resetNodes();
      animateKingJoe(model, t, state);
    },
  });
  console.log(
    `${state}: sweep ${duration}s@${fps}fps -> ${reports.length} reports in ${Date.now() - t0}ms; unsupported(t0)=${supports.length}`,
  );
  for (const r of reports.slice(0, 15))
    console.log(`   ${r.a} <-> ${r.b} ${r.depth_mm?.toFixed(1)} form=${r.form} frame=${r.frame}`);
}
sweep("combining", 10);
sweep("separation", 4);
sweep("robot", 6);
sweep("firing", 3);
sweep("formation", 3);
sweep("crippled", 3);
sweep("damaged", 3);
model.dispose();
