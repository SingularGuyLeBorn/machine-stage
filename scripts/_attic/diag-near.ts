// 涓存椂锛氬畾浣嶅３浣撲笂鏌愪笘鐣岀偣闄勮繎鐨勪笁瑙掑舰锛堟墦鍗伴《鐐广€乽/r 鍧愭爣锛?import * as THREE from "three";
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
geometry.applyMatrix4(model.instanceMatrix(handle, 0, new THREE.Matrix4()));
const pos = geometry.getAttribute("position");
const target = new THREE.Vector3(
  Number(process.argv[2] ?? 0.3697),
  Number(process.argv[3] ?? 0.15398),
  Number(process.argv[4] ?? -0.1689),
);
const uOf = (y: number, z: number) => 0.866 * y - 0.5 * z;
const rOf = (y: number, z: number) => 0.5 * y + 0.866 * z;
const near: Array<{ line: string; dist: number }> = [];
for (let i = 0; i < pos.count; i += 3) {
  const a = new THREE.Vector3().fromBufferAttribute(pos, i);
  const b = new THREE.Vector3().fromBufferAttribute(pos, i + 1);
  const c = new THREE.Vector3().fromBufferAttribute(pos, i + 2);
  const tri = new THREE.Triangle(a, b, c);
  const closest = tri.closestPointToPoint(target, new THREE.Vector3());
  const dist = closest.distanceTo(target);
  if (dist < 0.02) {
    near.push({
      dist,
      line: `tri ${i / 3} d=${dist.toFixed(4)}: ${[a, b, c]
        .map(
          (v) =>
            `(x=${v.x.toFixed(3)} y=${v.y.toFixed(4)} z=${v.z.toFixed(4)} u=${uOf(v.y, v.z).toFixed(4)} r=${rOf(v.y, v.z).toFixed(4)})`,
        )
        .join(" ")}`,
    });
  }
}
near.sort((p, q) => p.dist - q.dist);
console.log(near.slice(0, 10).map((n) => n.line).join("\n"));
console.log("hits", near.length);
