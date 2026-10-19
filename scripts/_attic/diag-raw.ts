// 涓存椂锛氭墦鍗板３浣?kit 鐨勫師濮嬪嚑浣曪紙鏈 instance 鐭╅樀锛夋埅闈笌 bbox
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
const geometry = handle.geometry.clone();
geometry.computeBoundingBox();
const box = geometry.boundingBox!;
console.log(
  `raw bbox x[${box.min.x.toFixed(4)}, ${box.max.x.toFixed(4)}] ` +
    `y[${box.min.y.toFixed(4)}, ${box.max.y.toFixed(4)}] ` +
    `z[${box.min.z.toFixed(4)}, ${box.max.z.toFixed(4)}]`,
);
const m = model.instanceMatrix(handle, 0, new THREE.Matrix4());
console.log("instanceMatrix:", m.elements.map((v) => v.toFixed(3)).join(","));
