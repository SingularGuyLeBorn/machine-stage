// 璇婃柇锛氭墦鍗颁袱闆朵欢瀹炰緥闂寸殑鐪熷疄涓夎褰氦鐐癸紙瀹氫綅銆屽菇鐏电浉浜ゃ€嶏級
// 鐢ㄦ硶锛歯px tsx scripts/diag-tri.ts <partIdA> <partIdB>
import * as THREE from "three";
import { makeEngineRegistry, makeEngineLayouts } from "../../src/three/parts/models/tiger/engine/registry";
import { tigerKitBuilders } from "../../src/three/parts/models/tiger/engine/kits";
import { buildModel } from "../../src/three/parts/assembler/assembler";
import { getBVH } from "../../src/three/parts/solver/detect";

const [idA, idB] = process.argv.slice(2);
const registry = makeEngineRegistry();
const model = buildModel(registry, {
  builders: tigerKitBuilders,
  instanceLayouts: makeEngineLayouts(),
  warnMissingLayout: false,
});

const hA = model.getPart(idA);
const hB = model.getPart(idB);
if (!hA || !hB) {
  console.log("MISSING", !hA ? idA : idB);
  process.exit(1);
}
const bvhA = getBVH(hA.geometry);
const bvhB = getBVH(hB.geometry);
const line = new THREE.Line3();
let total = 0;
const fmtTri = (tri: { a: THREE.Vector3; b: THREE.Vector3; c: THREE.Vector3 }) =>
  [
    [tri.a.x, tri.a.y, tri.a.z],
    [tri.b.x, tri.b.y, tri.b.z],
    [tri.c.x, tri.c.y, tri.c.z],
  ]
    .map((v) => `(${v.map((n) => n.toFixed(4)).join(",")})`)
    .join(" ");
for (const ia of hA.instances) {
  for (const ib of hB.instances) {
    const bToA = new THREE.Matrix4().copy(ia.restMatrix).invert().multiply(ib.restMatrix);
    let n = 0;
    bvhA.bvhcast(bvhB, bToA, {
      intersectsTriangles(triA, triB) {
        if (triA.intersectsTriangle(triB, line)) {
          n += 1;
          if (n <= 4) {
            const p = line.start.clone().applyMatrix4(ia.restMatrix);
            const areaA = triA.getArea();
            const areaB = triB.getArea();
            console.log(
              `  [${ia.index}x${ib.index}] @ (${p.x.toFixed(5)}, ${p.y.toFixed(5)}, ${p.z.toFixed(5)})  areaA=${areaA.toExponential(2)} areaB=${areaB.toExponential(2)}`,
            );
            console.log(`      A: ${fmtTri(triA)}`);
            console.log(`      B: ${fmtTri(triB)}`);
          }
        }
        return false;
      },
    });
    if (n > 0) console.log(`  [${ia.index}x${ib.index}] 浜ょ偣涓夎褰㈠鏁?= ${n}`);
    total += n;
  }
}
console.log(`${idA} x ${idB}: 瀹炰緥瀵逛氦鐐规€绘暟 = ${total}`);
