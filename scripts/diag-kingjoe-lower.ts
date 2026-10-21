import { buildModel, detectStatic, detectSweep, detectUnsupportedParts, partitionExpectedContacts } from "../src/three/parts";
import { makeKingJoeLowerRegistry, makeKingJoeLowerLayouts } from "../src/three/parts/models/kingjoe-lower/registry";
import { kingjoeLowerBuilders } from "../src/three/parts/models/kingjoe-lower/kits";
import {
  animateKingJoeLower,
  resetKingJoeLowerMotion,
  COMBINE_DURATION,
  SEPARATE_DURATION,
} from "../src/three/parts/models/kingjoe-lower/motion";

const registry = makeKingJoeLowerRegistry();
const model = buildModel(registry, {
  builders: kingjoeLowerBuilders,
  instanceLayouts: makeKingJoeLowerLayouts(),
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

resetKingJoeLowerMotion(model);
model.resetNodes();
model.root.updateMatrixWorld(true);
list("idle", detectStatic(model, { minDepthM: 0.0005 }));
console.log("unsupported", detectUnsupportedParts(model).map((r) => `${r.ref} gap=${r.gap_mm.toFixed(1)}`));

resetKingJoeLowerMotion(model);
model.resetNodes();
animateKingJoeLower(model, 0, "separated");
model.root.updateMatrixWorld(true);
list("separated", detectStatic(model, { minDepthM: 0.0005 }));

for (const state of ["separating", "combining"] as const) {
  resetKingJoeLowerMotion(model);
  model.resetNodes();
  // 合体从分离位开始；分离从合体位开始，这样两条扫掠都真的在动。
  animateKingJoeLower(model, 0, state === "combining" ? "separated" : "idle");
  model.root.updateMatrixWorld(true);
  const sweep = detectSweep(model, {
    duration: state === "combining" ? COMBINE_DURATION + 0.2 : SEPARATE_DURATION + 0.2,
    fps: 30,
    applyPose: (t) => {
      model.resetNodes();
      animateKingJoeLower(model, t, state);
    },
  });
  list(state, sweep);
}

model.dispose();
