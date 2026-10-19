// 璇婃柇锛氱┛閫忕湡鐩告祴閲忥紙鍙锛屼笉鏀逛换浣曢」鐩唬鐮侊級
// 鍒ゆ嵁锛歜vhcast 涓夎褰㈢浉浜ょ殑銆屼氦绾挎鎬婚暱搴︺€嶁€斺€?//   鍏遍潰璐村悎鏃朵氦绾块€€鍖?鈮?0锛坈oplanar 璀﹀憡锛夛紱鐪熺┛閫忔椂浜ょ嚎鏈夐暱搴︺€?import * as THREE from "three";
import { MeshBVH } from "three-mesh-bvh";
import { makeEngineRegistry, makeEngineLayouts } from "../../src/three/parts/models/tiger/engine/registry";
import { tigerKitBuilders } from "../../src/three/parts/models/tiger/engine/kits";
import { buildModel } from "../../src/three/parts/assembler/assembler";

// ---- 1. BVH 缂撳瓨锛堝繀椤诲湪浣跨敤鍓嶅０鏄庯級----
const bvhCache = new Map<THREE.BufferGeometry, MeshBVH>();
function getCachedBVH(g: THREE.BufferGeometry): MeshBVH {
  let b = bvhCache.get(g);
  if (!b) {
    if (!g.boundingBox) g.computeBoundingBox();
    b = new MeshBVH(g);
    bvhCache.set(g, b);
  }
  return b;
}

// ---- 2. 瑁呴厤 ----
const registry = makeEngineRegistry();
const model = buildModel(registry, {
  builders: tigerKitBuilders,
  instanceLayouts: makeEngineLayouts(),
  warnMissingLayout: false,
});

// ---- 3. 鏀堕泦瀹炰綋锛堝惈 InstancedMesh 閫愬疄渚嬪睍寮€锛?---
interface Body {
  name: string;
  geometry: THREE.BufferGeometry;
  matrix: THREE.Matrix4;
  box: THREE.Box3;
  bvh: MeshBVH;
}
const bodies: Body[] = [];
model.root.updateMatrixWorld(true);
model.root.traverse((o) => {
  const mesh = o as THREE.Mesh;
  if (!mesh.isMesh || !mesh.geometry) return;
  const im = mesh as unknown as THREE.InstancedMesh;
  if (im.isInstancedMesh) {
    const m = new THREE.Matrix4();
    for (let i = 0; i < im.count; i++) {
      im.getMatrixAt(i, m);
      const world = new THREE.Matrix4().multiplyMatrices(im.matrixWorld, m);
      const box = new THREE.Box3().setFromBufferAttribute(im.geometry.getAttribute("position")).applyMatrix4(world);
      bodies.push({ name: `${im.name}#${i}`, geometry: im.geometry, matrix: world, box, bvh: getCachedBVH(im.geometry) });
    }
  } else {
    const box = new THREE.Box3().setFromBufferAttribute(mesh.geometry.getAttribute("position")).applyMatrix4(mesh.matrixWorld);
    bodies.push({ name: mesh.name, geometry: mesh.geometry, matrix: mesh.matrixWorld.clone(), box, bvh: getCachedBVH(mesh.geometry) });
  }
});

// ---- 4. 娴嬮噺涓€瀵癸細鐩镐氦涓夎褰㈡暟 + 浜ょ嚎鎬婚暱锛坢m锛?---
function measurePair(a: Body, b: Body): { tris: number; lineMm: number } {
  const mBtoA = new THREE.Matrix4().copy(a.matrix).invert().multiply(b.matrix);
  let tris = 0;
  let lineLen = 0;
  const line = new THREE.Line3();
  a.bvh.bvhcast(b.bvh, mBtoA, {
    intersectsTriangles(ta, tb) {
      if (ta.intersectsTriangle(tb, line)) {
        tris++;
        lineLen += line.start.distanceTo(line.end);
      }
      return false;
    },
  });
  return { tris, lineMm: lineLen * 1000 };
}

console.log("鎬诲疄浣撴暟:", bodies.length);

// ---- 5. 鍏稿瀷瀵规牳鏌?----
const familySamples: [RegExp, RegExp, string][] = [
  [/crankcase.*shell|shell.*crankcase/i, /piston/i, "鏇茶酱绠卞３浣?鈫?娲诲锛堢敤鎴锋埅鍥鹃偅瀵癸級"],
  [/crank_pin/i, /connecting_rod/i, "鏇叉焺閿€ 鈫?杩炴潌锛堣酱鎵块厤鍚堬級"],
  [/cylinder.*head|head.*cylinder/i, /valve/i, "缂哥洊 鈫?姘旈棬锛堟皵闂ㄥ骇锛?],
  [/crankcase/i, /cylinder/i, "鏇茶酱绠?鈫?缂镐綋锛堣创鍚堥潰锛?],
];
for (const [pa, pb, label] of familySamples) {
  const a = bodies.find((b) => pa.test(b.name));
  const b = bodies.find((b) => pb.test(b.name));
  if (!a || !b) continue;
  const r = measurePair(a, b);
  const verdict = r.lineMm > 0.1 ? "鈽呯湡绌块€? : r.tris > 0 ? "鍏遍潰鎺ヨЕ锛堥潪绌块€忥級" : "鍒嗙";
  console.log(`${label}\n   ${a.name} 鈫?${b.name}  鐩镐氦涓夎褰?${r.tris}  浜ょ嚎鎬婚暱=${r.lineMm.toFixed(3)}mm  鈫?${verdict}`);
}

// ---- 6. 鍏ㄥ眬缁熻 ----
let truePen = 0, contact = 0, tested = 0;
for (let i = 0; i < bodies.length; i++) {
  for (let j = i + 1; j < bodies.length; j++) {
    const a = bodies[i], b = bodies[j];
    if (!a.box.intersectsBox(b.box)) continue;
    const r = measurePair(a, b);
    if (r.tris > 0) {
      tested++;
      if (r.lineMm > 0.1) truePen++; else contact++;
      if (r.lineMm > 0.1 && truePen <= 10) {
        console.log(`  鈽呯湡绌块€? ${a.name} 鈫?${b.name}  浜ょ嚎=${r.lineMm.toFixed(2)}mm`);
      }
    }
  }
}
console.log(`鐩镐氦瀵?${tested}  鐪熺┛閫?${truePen}  鍏遍潰鎺ヨЕ=${contact}`);
