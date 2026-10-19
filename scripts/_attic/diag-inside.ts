// 涓存椂锛氭寜閾惰鍧愭爣 (u,r) 鎺㈡祴缂镐綋鏉愭枡鍒嗗竷锛堝皠绾垮鍋讹紝DoubleSide锛?import * as THREE from "three";
import { makeEngineRegistry, makeEngineLayouts } from "../../src/three/parts/models/tiger/engine/registry";
import { tigerKitBuilders } from "../../src/three/parts/models/tiger/engine/kits";
import { buildModel } from "../../src/three/parts/assembler/assembler";

const registry = makeEngineRegistry();
const model = buildModel(registry, {
  builders: tigerKitBuilders,
  instanceLayouts: makeEngineLayouts(),
  warnMissingLayout: false,
});

const id = process.argv[2] ?? "tiger.cylinder.block";
const index = Number(process.argv[3] ?? 0);
const handle = model.parts.find((h) => h.def.id === id)!;
const geometry = handle.geometry.clone();
geometry.applyMatrix4(model.instanceMatrix(handle, index, new THREE.Matrix4()));
const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
const ray = new THREE.Raycaster();
const dir = new THREE.Vector3(1, 0.117, 0.031).normalize();

function count(p: THREE.Vector3): number {
  ray.set(p, dir);
  const list = ray.intersectObject(mesh, false);
  const seen = new Set<string>();
  let n = 0;
  for (const hit of list) {
    const key = `${hit.point.x.toFixed(6)},${hit.point.y.toFixed(6)},${hit.point.z.toFixed(6)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    n += 1;
  }
  return n;
}

const x = Number(process.argv[4] ?? 0.341);
for (const [u, r] of [
  [0.22, 0],
  [0.22, -0.0267],
  [0.22, -0.06],
  [0.22, -0.0715],
  [0.22, -0.08],
  [0.22, -0.087],
  [0.24, -0.0267],
  [0.3, 0],
  [0.4, 0],
  [0.44, 0],
] as Array<[number, number]>) {
  const y = 0.866 * u + 0.5 * r;
  const z = -0.5 * u + 0.866 * r;
  const n = count(new THREE.Vector3(x, y, z));
  console.log(`u=${u} r=${r} -> hits=${n} ${n % 2 === 1 ? "MATERIAL" : "void"}`);
}
