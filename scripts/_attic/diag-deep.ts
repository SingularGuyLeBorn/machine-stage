// 璇婃柇锛氭寚瀹氶浂浠跺鐨?鏈€娣变簰鐩稿祵鍏ラ噰鏍风偣"锛堟墦鍗颁笘鐣屽潗鏍?+ 鍙屼晶灞€閮ㄥ潗鏍囷級
// 鐢ㄦ硶锛歯px tsx scripts/diag-deep.ts "tiger.cylinder.head" "tiger.valvetrain.valve" [鏁伴噺涓婇檺]
import * as THREE from "three";
import { makeEngineRegistry, makeEngineLayouts } from "../../src/three/parts/models/tiger/engine/registry";
import { tigerKitBuilders } from "../../src/three/parts/models/tiger/engine/kits";
import { buildModel } from "../../src/three/parts/assembler/assembler";
import { getBVH } from "../../src/three/parts/solver/detect";
import { formatReportRef } from "../../src/three/parts/solver/report";

const needleA = process.argv[2] ?? "";
const needleB = process.argv[3] ?? "";
const maxPairs = Number(process.argv[4] ?? 3);

const registry = makeEngineRegistry();
const model = buildModel(registry, {
  builders: tigerKitBuilders,
  instanceLayouts: makeEngineLayouts(),
  warnMissingLayout: false,
});
model.root.updateMatrixWorld(true);

interface Body {
  ref: string;
  id: string;
  matrix: THREE.Matrix4;
  geometry: THREE.BufferGeometry;
}
const bodies: Body[] = [];
for (const handle of model.parts) {
  const instances = handle.instanced ? handle.instances : [{ index: 0 }];
  for (const instance of instances) {
    bodies.push({
      ref: formatReportRef(handle, instance.index),
      id: handle.def.id,
      matrix: model.instanceMatrix(handle, instance.index, new THREE.Matrix4()),
      geometry: handle.geometry,
    });
  }
}
console.log(`瀹炰緥鎬绘暟 ${bodies.length}锛屾煡鎵?${needleA} x ${needleB}`);

const rays = [
  new THREE.Vector3(0.5773, 0.5774, 0.5773),
  new THREE.Vector3(-0.3015, 0.7745, 0.5547),
  new THREE.Vector3(0.1231, -0.6002, 0.7902),
].map((d) => d.normalize());
const ray = new THREE.Ray();
const hitInfo = { point: new THREE.Vector3(), distance: 0, faceIndex: -1 };

function inside(point: THREE.Vector3, bvh: ReturnType<typeof getBVH>): boolean {
  let votes = 0;
  let tested = 0;
  for (const dir of rays) {
    ray.set(point, dir);
    const hits = bvh.raycast(ray, THREE.DoubleSide);
    let onSurface = false;
    for (const hit of hits) if (hit.distance < 1e-6) onSurface = true;
    if (onSurface) continue;
    tested++;
    if (hits.length % 2 === 1) votes++;
  }
  return tested > 0 && votes * 2 > tested;
}

function samplesOf(geometry: THREE.BufferGeometry, budget = 2500): THREE.Vector3[] {
  const position = geometry.getAttribute("position") as THREE.BufferAttribute;
  const points: THREE.Vector3[] = [];
  const count = position.count;
  const stride = Math.max(1, Math.floor(count / budget));
  for (let i = 0; i < count; i += stride) points.push(new THREE.Vector3().fromBufferAttribute(position, i));
  return points;
}

interface Impact {
  depth: number;
  world: THREE.Vector3;
  localA: THREE.Vector3;
  localB: THREE.Vector3;
}

function probe(bodyA: Body, bodyB: Body): Impact[] {
  const bvhB = getBVH(bodyB.geometry);
  const bvhA = getBVH(bodyA.geometry);
  const toB = new THREE.Matrix4().copy(bodyB.matrix).invert().multiply(bodyA.matrix);
  const toA = new THREE.Matrix4().copy(bodyA.matrix).invert().multiply(bodyB.matrix);
  const invA = new THREE.Matrix4().copy(bodyA.matrix).invert();
  const invB = new THREE.Matrix4().copy(bodyB.matrix).invert();
  const out: Impact[] = [];
  const local = new THREE.Vector3();
  for (const sample of samplesOf(bodyA.geometry)) {
    local.copy(sample).applyMatrix4(toB);
    if (!inside(local, bvhB)) continue;
    const info = bvhB.closestPointToPoint(local, hitInfo as never, 0, Infinity);
    if (!info) continue;
    const world = local.clone().applyMatrix4(bodyB.matrix);
    out.push({ depth: info.distance, world, localA: sample.clone(), localB: local.clone() });
  }
  for (const sample of samplesOf(bodyB.geometry)) {
    local.copy(sample).applyMatrix4(toA);
    if (!inside(local, bvhA)) continue;
    const info = bvhA.closestPointToPoint(local, hitInfo as never, 0, Infinity);
    if (!info) continue;
    const world = local.clone().applyMatrix4(bodyA.matrix);
    out.push({ depth: info.distance, world, localA: sample.clone().applyMatrix4(toA), localB: sample.clone() });
  }
  return out.sort((a, b) => b.depth - a.depth);
}

const aIds = bodies.filter((b) => b.id === needleA);
const bIds = bodies.filter((b) => b.id === needleB);
console.log(`A 瀹炰緥 ${aIds.length}锛孊 瀹炰緥 ${bIds.length}`);

let shown = 0;
for (const a of aIds) {
  for (const b of bIds) {
    if (shown >= maxPairs) break;
    const impacts = probe(a, b);
    if (impacts.length === 0) continue;
    shown++;
    console.log(`\n== ${a.ref} x ${b.ref}锛氬祵鍏ラ噰鏍风偣 ${impacts.length}锛屾渶娣?${(impacts[0].depth * 1000).toFixed(2)}mm`);
    for (const hit of impacts.slice(0, 6)) {
      const f = (v: THREE.Vector3) => `(${v.x.toFixed(4)}, ${v.y.toFixed(4)}, ${v.z.toFixed(4)})`;
      console.log(`  ${(hit.depth * 1000).toFixed(2)}mm world${f(hit.world)}  A鏈湴${f(hit.localA)}  B鏈湴${f(hit.localB)}`);
    }
  }
  if (shown >= maxPairs) break;
}
if (shown === 0) console.log("锛堟湭鎵惧埌宓屽叆閲囨牱鐐光€斺€斿彲鑳芥槸鍏遍潰/鎺犺Е鎴栨棤鎺ヨЕ锛?);
