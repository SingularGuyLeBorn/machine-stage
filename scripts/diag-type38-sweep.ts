import { buildModel } from "../src/three/parts/assembler/assembler";
import { detectSweep } from "../src/three/parts/solver/detect";
import { partitionExpectedContacts } from "../src/three/parts/solver/whitelist";
import { type38Builders, type38Layouts, type38Registry } from "../src/three/parts/models/guns7/type38/registry";
import { animateType38 } from "../src/three/parts/models/guns7/type38/motion";

const fps = Number(process.argv[2] ?? 10);
const duration = Number(process.argv[3] ?? 15.6);
const model = buildModel(type38Registry, {
  builders: type38Builders,
  instanceLayouts: type38Layouts,
  warnMissingLayout: false,
});

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
    animateType38(model, t, "auto");
  },
});
console.warn = originalWarn;
const split = partitionExpectedContacts(reports, type38Registry.expectedContacts ?? []);
console.log(
  `sweep ${duration}s @ ${fps}fps: reports ${reports.length}, expected ${split.expected.length}, ACTIVE ${split.active.length}`,
);
const fmt = (r: (typeof reports)[number]) =>
  `${r.frame === null ? "  —  " : String(r.frame).padStart(4)}f ${r.depth_mm === null ? "  —  " : r.depth_mm.toFixed(2).padStart(6)}mm [${r.form}] ${r.a} <> ${r.b}`;
for (const item of split.active
  .sort((a, b) => (b.report.depth_mm ?? 99) - (a.report.depth_mm ?? 99))
  .slice(0, 80)) {
  console.log(fmt(item.report));
}
