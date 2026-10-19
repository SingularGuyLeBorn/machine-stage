// 璇婃柇锛氭洸杞寸澹充綋 deck 鍖烘埅闈㈡潗鏂欏浘锛堟部 X 灏勭嚎濂囧伓鍒ゅ畾锛?#' = 鏉愭枡锛?// 鐢ㄦ硶锛歯px tsx scripts/diag-shellmap.ts [y0 y1 z0 z1 step]
import * as THREE from "three";
import { makeEngineRegistry, makeEngineLayouts } from "../../src/three/parts/models/tiger/engine/registry";
import { tigerKitBuilders } from "../../src/three/parts/models/tiger/engine/kits";
import { buildModel } from "../../src/three/parts/assembler/assembler";

const [y0, y1, z0, z1, step] = [
  Number(process.argv[2] ?? 0.12),
  Number(process.argv[3] ?? 0.24),
  Number(process.argv[4] ?? -0.2),
  Number(process.argv[5] ?? 0.2),
  Number(process.argv[6] ?? 0.002),
];
const id = process.argv[7] ?? "tiger.crankcase.shell";

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
const raycaster = new THREE.Raycaster();
raycaster.far = 4;
const origin = new THREE.Vector3();

const insideMaterial = (y: number, z: number): boolean => {
  let hits = 0;
  for (const x0 of [-2, -1.9]) {
    origin.set(x0, y, z);
    raycaster.set(origin, new THREE.Vector3(1, 0, 0));
    const list = raycaster.intersectObject(new THREE.Mesh(geometry), false);
    // 鍚岃窛绂诲叡闈㈠弻闈㈣鏁帮細鎸変綅缃幓閲?    const seen = new Set<string>();
    for (const hit of list) {
      const key = `${Math.round(hit.point.x * 1e6)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      hits++;
    }
    return hits % 2 === 1;
  }
  return false;
};

const rows: string[] = [];
const header = `y\\z  ${Array.from({ length: Math.round((z1 - z0) / step) + 1 }, (_, i) => {
  const z = z0 + i * step;
  return (i % 5 === 0 ? String(Math.round(z * 100)).padStart(4, " ") : "    ");
}).join("")}`;
for (let y = y1; y >= y0 - 1e-9; y -= step) {
  let row = y.toFixed(3).padStart(5, " ") + " ";
  for (let z = z0; z <= z1 + 1e-9; z += step) {
    row += insideMaterial(y, Number(z.toFixed(5))) ? "  ##" : "  . ";
  }
  rows.push(row);
}
console.log(header);
console.log(rows.join("\n"));
