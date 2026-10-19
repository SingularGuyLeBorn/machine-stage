// 璇婃柇锛氭鏌ユ煇闆朵欢鍑犱綍鍦ㄥ眬閮ㄨ酱鍚戝瓟鍖哄煙鏄惁娈嬬暀鏉愭枡锛堥晽瀛旇濉?/ 涓夎闈㈢墖璺ㄨ繃瀛斿績锛?// 鐢ㄦ硶锛歯px tsx scripts/diag-hole.ts <partId> [axis=xyz] [sampleRadius]
import * as THREE from "three";
import { makeEngineRegistry, makeEngineLayouts } from "../../src/three/parts/models/tiger/engine/registry";
import { tigerKitBuilders } from "../../src/three/parts/models/tiger/engine/kits";
import { buildModel } from "../../src/three/parts/assembler/assembler";

const id = process.argv[2];
const axis = (process.argv[3] ?? "x") as "x" | "y" | "z";
const sampleR = Number(process.argv[4] ?? 0.045);

const registry = makeEngineRegistry();
const model = buildModel(registry, {
  builders: tigerKitBuilders,
  instanceLayouts: makeEngineLayouts(),
  warnMissingLayout: false,
});

const handle = model.getPart(id);
if (!handle) {
  console.log("MISSING", id);
  process.exit(1);
}
const pos = handle.geometry.getAttribute("position") as THREE.BufferAttribute;

// 鍙栦笁瑙掑舰鍦ㄨ杞村瀭鐩村钩闈笂鐨勪簩缁存姇褰憋紙杞村悜鍧愭爣鍗曠嫭淇濈暀锛?const proj = (i: number): THREE.Vector2 => {
  const x = pos.getX(i);
  const y = pos.getY(i);
  const z = pos.getZ(i);
  if (axis === "x") return new THREE.Vector2(y, z);
  if (axis === "y") return new THREE.Vector2(x, z);
  return new THREE.Vector2(x, y);
};

let minVert = Infinity;
let minTri = Infinity;
let worst = "";
const triCount = pos.count / 3;
for (let t = 0; t < triCount; t += 1) {
  const a = proj(t * 3);
  const b = proj(t * 3 + 1);
  const c = proj(t * 3 + 2);
  for (const p of [a, b, c]) minVert = Math.min(minVert, p.length());
  // 蹇界暐閫€鍖栦笁瑙掑舰锛堜袱鐐归噸鍚?/ 闈㈢Н瓒嬮浂锛夛紝鍚﹀垯銆岀偣鍦ㄤ笁瑙掑舰鍐呫€嶅垽瀹氫細璇懡涓?  const area = Math.abs((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y)) / 2;
  if (area < 1e-6) continue;
  // 鍘熺偣鍒颁簩缁翠笁瑙掑舰鐨勬渶灏忚窛绂?  const d = Math.min(
    distanceToSegment(new THREE.Vector2(0, 0), a, b),
    distanceToSegment(new THREE.Vector2(0, 0), b, c),
    distanceToSegment(new THREE.Vector2(0, 0), c, a),
  );
  const insideTri =
    sameSide(new THREE.Vector2(0, 0), a, b, c) &&
    sameSide(new THREE.Vector2(0, 0), b, a, c) &&
    sameSide(new THREE.Vector2(0, 0), c, a, b);
  const dd = insideTri ? 0 : d;
  if (dd < minTri) {
    minTri = dd;
    worst = `tri#${t} area=${area.toExponential(2)} a=(${a.x.toFixed(4)},${a.y.toFixed(4)}) b=(${b.x.toFixed(4)},${b.y.toFixed(4)}) c=(${c.x.toFixed(4)},${c.y.toFixed(4)})`;
  }
}

function distanceToSegment(p: THREE.Vector2, a: THREE.Vector2, b: THREE.Vector2): number {
  const ab = b.clone().sub(a);
  const len2 = ab.lengthSq();
  const t = len2 === 0 ? 0 : THREE.MathUtils.clamp(p.clone().sub(a).dot(ab) / len2, 0, 1);
  return a.clone().addScaledVector(ab, t).distanceTo(p);
}

function sameSide(p: THREE.Vector2, a: THREE.Vector2, b: THREE.Vector2, c: THREE.Vector2): boolean {
  const ab = b.clone().sub(a);
  const ac = c.clone().sub(a);
  const ap = p.clone().sub(a);
  const cross1 = ab.x * ac.y - ab.y * ac.x;
  const cross2 = ab.x * ap.y - ab.y * ap.x;
  return cross1 * cross2 >= 0;
}

console.log(
  `${id}: verts=${pos.count} 涓夎=${triCount} 杞村悜=${axis} 椤剁偣鏈€灏忓崐寰?${minVert.toFixed(4)} 涓夎闈㈡渶灏忓崐寰?${minTri.toFixed(4)}锛堥噰鏍烽槇鍊?${sampleR}锛塦,
);
console.log("   鏈€杩戜笁瑙掑舰:", worst);
