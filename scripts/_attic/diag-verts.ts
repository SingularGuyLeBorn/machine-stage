// 涓存椂锛氬垪鍑哄３浣撳嚑浣曚腑閮紙|x|<0.49锛夊敮涓€ z 鍊硷紝鏍稿鎴潰杞粨
import * as THREE from "three";
import { makeEngineRegistry, makeEngineLayouts } from "../../src/three/parts/models/tiger/engine/registry";
import { tigerKitBuilders } from "../../src/three/parts/models/tiger/engine/kits";
import { buildModel } from "../../src/three/parts/assembler/assembler";

const registry = makeEngineRegistry();
const model = buildModel(registry, {
  builders: tigerKitBuilders,
  instanceLayouts: makeEngineLayouts(),
  warnMissingLayout: false,
});
const handle = model.parts.find((h) => h.def.id === "tiger.crankcase.shell")!;
const pos = handle.geometry.getAttribute("position");
const zs = new Set<string>();
const ys = new Set<string>();
for (let i = 0; i < pos.count; i += 1) {
  const x = pos.getX(i);
  if (Math.abs(x) > 0.49) continue;
  zs.add(pos.getZ(i).toFixed(4));
  ys.add(pos.getY(i).toFixed(4));
}
console.log("z:", [...zs].sort().join(" "));
console.log("y:", [...ys].sort().join(" "));
