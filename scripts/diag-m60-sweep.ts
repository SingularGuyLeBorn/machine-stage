import { buildModel } from "../src/three/parts/assembler/assembler";
import { detectSweep } from "../src/three/parts/solver/detect";
import { partitionExpectedContacts } from "../src/three/parts/solver/whitelist";
import { makeM60Registry, M60_BUILDERS, makeM60Layouts } from "../src/three/parts/models/guns7/m60/registry";
import { animateM60, M60_MOTION_PARTS } from "../src/three/parts/models/guns7/m60/motion";

const fps = Number(process.argv[2] ?? 20);
const duration = Number(process.argv[3] ?? 1.4);
const registry = makeM60Registry();
const model = buildModel(registry, { builders: M60_BUILDERS, instanceLayouts: makeM60Layouts(), warnMissingLayout: false });
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
    animateM60(model, t, "auto");
  },
});
console.warn = originalWarn;
const split = partitionExpectedContacts(reports, registry.expectedContacts ?? []);
console.log(`sweep ${duration}s @ ${fps}fps: reports ${reports.length}, expected ${split.expected.length}, ACTIVE ${split.active.length}`);
const fmt = (r: (typeof reports)[number]) =>
  `${r.frame === null ? "  -  " : String(r.frame).padStart(4)}f ${r.depth_mm === null ? "  -  " : r.depth_mm.toFixed(2).padStart(6)}mm [${r.form}] ${r.a} <> ${r.b}`;
for (const item of split.active.sort((a, b) => (b.report.depth_mm ?? 99) - (a.report.depth_mm ?? 99)).slice(0, 180)) console.log(fmt(item.report));
console.log(`motion parts: ${M60_MOTION_PARTS.length}`);
