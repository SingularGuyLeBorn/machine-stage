import { buildModel } from "../src/three/parts/assembler/assembler";
import { detectStatic } from "../src/three/parts/solver/detect";
import { partitionExpectedContacts } from "../src/three/parts/solver/whitelist";
import {
  makeKingJoeModuleRegistry,
  kingjoeModuleBuilders,
} from "../src/three/parts/models/kingjoe-modules/registry";
import { animateKingJoeModules } from "../src/three/parts/models/kingjoe-modules/motion";
import { Matrix4 } from "three";
import { mkdirSync, writeFileSync } from "node:fs";
const registry = makeKingJoeModuleRegistry(),
  model = buildModel(registry, { builders: kingjoeModuleBuilders });
const state = process.argv[2] ?? "idle",
  time = Number(process.argv[3] ?? 3);
animateKingJoeModules(model, 0, state);
animateKingJoeModules(model, time, state);
model.syncInstances();
mkdirSync("qa-out", { recursive: true });
writeFileSync(
  "qa-out/pedan-pose.json",
  JSON.stringify(
    model.parts
      .filter((p) => p.partId.endsWith(".body") || /\.(upper|fore|leg)_[lr]$/.test(p.partId))
      .map((p) => ({
        key: p.partId.endsWith(".body") ? p.assembly : p.partId.split(".").at(-1),
        matrix: model.instanceMatrix(p, 0, new Matrix4()).toArray(),
      })),
  ),
);
const active = partitionExpectedContacts(
  detectStatic(model, {
    minDepthM: 0.0005,
    analysisBudget: 2000,
    filter: process.argv.includes("--external") ? (p) => !p.def.tags?.includes("internal") : undefined,
  }),
  registry.expectedContacts ?? [],
).active;
console.log(
  JSON.stringify(
    active.map(({ report: r }) => ({ a: r.a, b: r.b, depth: r.depth_mm, form: r.form })),
    null,
    2,
  ),
);
console.log("PARTS", model.parts.length, "ACTIVE", active.length);
model.dispose();
