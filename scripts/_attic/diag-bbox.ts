// 涓存椂锛氭墦鍗拌嫢骞查浂浠剁殑涓栫晫 bbox 涓庡疄渚嬬煩闃?import * as THREE from "three";
import { makeEngineRegistry, makeEngineLayouts } from "../../src/three/parts/models/tiger/engine/registry";
import { tigerKitBuilders } from "../../src/three/parts/models/tiger/engine/kits";
import { buildModel } from "../../src/three/parts/assembler/assembler";

const registry = makeEngineRegistry();
const model = buildModel(registry, {
  builders: tigerKitBuilders,
  instanceLayouts: makeEngineLayouts(),
  warnMissingLayout: false,
});
const ids = ["tiger.cylinder.block", "tiger.cylinder.liner", "tiger.piston_rod.piston"];
for (const id of ids) {
  const handle = model.parts.find((h) => h.def.id === id)!;
  const count = model.instanceCount(handle);
  for (let i = 0; i < Math.min(count, 2); i += 1) {
    const geometry = handle.geometry.clone();
    const m = model.instanceMatrix(handle, i, new THREE.Matrix4());
    geometry.applyMatrix4(m);
    geometry.computeBoundingBox();
    const b = geometry.boundingBox!;
    console.log(
      `${id}[${i}] bbox x[${b.min.x.toFixed(4)},${b.max.x.toFixed(4)}] ` +
        `y[${b.min.y.toFixed(4)},${b.max.y.toFixed(4)}] z[${b.min.z.toFixed(4)},${b.max.z.toFixed(4)}]`,
    );
    const e = m.elements;
    console.log(
      `  m: [${e[0].toFixed(3)} ${e[4].toFixed(3)} ${e[8].toFixed(3)} ${e[12].toFixed(3)}] [` +
        `${e[1].toFixed(3)} ${e[5].toFixed(3)} ${e[9].toFixed(3)} ${e[13].toFixed(3)}] [` +
        `${e[2].toFixed(3)} ${e[6].toFixed(3)} ${e[10].toFixed(3)} ${e[14].toFixed(3)}]`,
    );
  }
}
