import { buildModel } from "../src/three/parts/assembler/assembler";
import { detectSweep } from "../src/three/parts/solver/detect";
import { partitionExpectedContacts } from "../src/three/parts/solver/whitelist";
import { makeM2hbRegistry, M2HB_BUILDERS, makeM2hbLayouts } from "../src/three/parts/models/m2hb/registry";
import { animateM2hb, M2HB_MOTION_PARTS } from "../src/three/parts/models/m2hb/motion";

const fps = Number(process.argv[2] ?? 20);
const duration = Number(process.argv[3] ?? 2.2);
const registry = makeM2hbRegistry();
const model = buildModel(registry, { builders: M2HB_BUILDERS, instanceLayouts: makeM2hbLayouts(), warnMissingLayout: false });
const originalWarn = console.warn;
console.warn = (...args: unknown[]) => {
  if (String(args[0] ?? "").includes("coplanar")) return;
  originalWarn(...args);
};
const reports = detectSweep(model, {
  duration,
  fps,
  applyPose: (t) => {
    model.resetNodes();
    animateM2hb(model, t, "auto");
  },
});
console.warn = originalWarn;
const split = partitionExpectedContacts(reports, registry.expectedContacts ?? []);
console.log(`sweep ${duration}s @ ${fps}fps: reports ${reports.length}, expected ${split.expected.length}, ACTIVE ${split.active.length}`);
const fmt = (r: (typeof reports)[number]) =>
  `${r.frame === null ? "  -  " : String(r.frame).padStart(4)}f ${r.depth_mm === null ? "  -  " : r.depth_mm.toFixed(2).padStart(6)}mm [${r.form}] ${r.a} <> ${r.b}`;
for (const item of split.active.sort((a, b) => (b.report.depth_mm ?? 99) - (a.report.depth_mm ?? 99)).slice(0, 180)) console.log(fmt(item.report));
console.log(`motion parts: ${M2HB_MOTION_PARTS.length}`);
