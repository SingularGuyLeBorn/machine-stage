import { buildModel, detectStatic, detectSweep, detectUnsupportedParts, partitionExpectedContacts } from "../src/three/parts";
import { makeKingJoeThreeLayouts, makeKingJoeThreeRegistry } from "../src/three/parts/models/kingjoe-three/registry";
import { kingjoeThreeBuilders } from "../src/three/parts/models/kingjoe-three/kits";
import {
  animateKingJoeThree,
  resetKingJoeThreeMotion,
  COMBINE_DURATION,
  SEPARATE_DURATION,
} from "../src/three/parts/models/kingjoe-three/motion";

const registry = makeKingJoeThreeRegistry();
const model = buildModel(registry, {
  builders: kingjoeThreeBuilders,
  instanceLayouts: makeKingJoeThreeLayouts(),
  warnMissingLayout: false,
});

function list(label: string, reports: ReturnType<typeof detectStatic>) {
  const part = partitionExpectedContacts(reports, registry.expectedContacts ?? []);
  console.log(`--- ${label}: reports=${reports.length} active=${part.active.length}`);
  for (const report of reports) {
    console.log(
      `${report.a} <-> ${report.b} | form=${report.form} depth=${report.depth_mm?.toFixed(2)} frame=${report.frame ?? "-"} point=${report.point?.map((v) => v.toFixed(3)).join(",")}`,
    );
  }
}

resetKingJoeThreeMotion(model);
model.resetNodes();
model.root.updateMatrixWorld(true);
list("idle", detectStatic(model, { minDepthM: 0.0005 }));
console.log("unsupported", detectUnsupportedParts(model).map((r) => `${r.ref} gap=${r.gap_mm.toFixed(1)}`));

resetKingJoeThreeMotion(model);
model.resetNodes();
animateKingJoeThree(model, 0, "separated");
model.root.updateMatrixWorld(true);
list("separated", detectStatic(model, { minDepthM: 0.0005 }));

for (const state of ["separating", "combining"] as const) {
  resetKingJoeThreeMotion(model);
  model.resetNodes();
  animateKingJoeThree(model, 0, state === "combining" ? "separated" : "idle");
  model.root.updateMatrixWorld(true);
  const sweep = detectSweep(model, {
    duration: state === "combining" ? COMBINE_DURATION + 0.2 : SEPARATE_DURATION + 0.2,
    fps: 30,
    applyPose: (t) => {
      model.resetNodes();
      animateKingJoeThree(model, t, state);
    },
  });
  list(state, sweep);
}

model.dispose();
