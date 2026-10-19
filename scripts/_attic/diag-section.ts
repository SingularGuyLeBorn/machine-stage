// 璇婃柇锛氶浂浠跺嚑浣曚笌 x=planeX 骞抽潰鐨勭湡瀹炰氦绾挎锛堟墦鍗?y,z 绾挎锛岀敤浜庢牳瀵规埅闈㈣疆寤擄級
// 鐢ㄦ硶锛歯px tsx scripts/diag-section.ts [partId] [planeX]
import * as THREE from "three";
import { makeEngineRegistry, makeEngineLayouts } from "../../src/three/parts/models/tiger/engine/registry";
import { tigerKitBuilders } from "../../src/three/parts/models/tiger/engine/kits";
import { buildModel } from "../../src/three/parts/assembler/assembler";

const id = process.argv[2] ?? "tiger.crankcase.shell";
const planeX = Number(process.argv[3] ?? 0.15);

const registry = makeEngineRegistry();
const model = buildModel(registry, {
  builders: tigerKitBuilders,
  instanceLayouts: makeEngineLayouts(),
  warnMissingLayout: false,
});
const handle = model.parts.find((h) => h.def.id === id);
if (!handle) throw new Error(`鏈壘鍒伴浂浠?${id}`);
const geometry = handle.geometry.clone();
geometry.applyMatrix4(model.instanceMatrix(handle, 0, new THREE.Matrix4()));
geometry.computeBoundingBox();
const box = geometry.boundingBox!;
console.log(
  `${id}: 涓夎闈?${geometry.getAttribute("position").count / 3}锛宐box ` +
    `x[${box.min.x.toFixed(4)}, ${box.max.x.toFixed(4)}] ` +
    `y[${box.min.y.toFixed(4)}, ${box.max.y.toFixed(4)}] ` +
    `z[${box.min.z.toFixed(4)}, ${box.max.z.toFixed(4)}]`,
);

const pos = geometry.getAttribute("position");
const verts: Array<[THREE.Vector3, THREE.Vector3, THREE.Vector3]> = [];
for (let i = 0; i < pos.count; i += 3) {
  verts.push([
    new THREE.Vector3().fromBufferAttribute(pos, i),
    new THREE.Vector3().fromBufferAttribute(pos, i + 1),
    new THREE.Vector3().fromBufferAttribute(pos, i + 2),
  ]);
}

/** 姹備笁瑙掑舰杈逛笌骞抽潰 x = planeX 鐨勪氦鐐癸紙鍚鐐瑰宸級 */
function edgeHits(a: THREE.Vector3, b: THREE.Vector3): THREE.Vector3[] {
  const da = a.x - planeX;
  const db = b.x - planeX;
  const out: THREE.Vector3[] = [];
  if (Math.abs(da) < 1e-9) out.push(a.clone());
  if (Math.abs(db) < 1e-9) out.push(b.clone());
  if (Math.abs(da) > 1e-9 && Math.abs(db) > 1e-9 && da * db < 0) {
    const t = da / (da - db);
    out.push(new THREE.Vector3().lerpVectors(a, b, t));
  }
  return out;
}

const segs: Array<{ p: [number, number]; q: [number, number] }> = [];
for (const [a, b, c] of verts) {
  const pts: THREE.Vector3[] = [...edgeHits(a, b), ...edgeHits(b, c), ...edgeHits(c, a)];
  const uniq: THREE.Vector3[] = [];
  for (const p of pts) {
    if (!uniq.some((u) => u.distanceToSquared(p) < 1e-12)) uniq.push(p);
  }
  if (uniq.length === 2) {
    const [p, q] = uniq;
    segs.push({ p: [p.y, p.z], q: [q.y, q.z] });
  } else if (uniq.length > 2) {
    console.log(`  璀﹀憡锛氫笁瑙掑舰涓庡钩闈氦浜?${uniq.length} 鐐癸紙鍏遍潰锛塦);
  }
}

segs.sort((s1, s2) => {
  const a1 = Math.atan2(s1.p[0] - 0.1, s1.p[1]);
  const a2 = Math.atan2(s2.p[0] - 0.1, s2.p[1]);
  return a1 - a2;
});
console.log(`x=${planeX} 鎴潰锛?{segs.length} 鏉＄嚎娈礰);
for (const s of segs) {
  console.log(
    `  (${s.p[0].toFixed(4)}, ${s.p[1].toFixed(4)}) 鈫?(${s.q[0].toFixed(4)}, ${s.q[1].toFixed(4)})`,
  );
}
