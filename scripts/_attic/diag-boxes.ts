// 璇婃柇锛氭墦鍗版寚瀹氶浂浠跺悇瀹炰緥鐨勪笘鐣屽寘鍥寸洅锛堝畾浣嶈閰嶉敊浣?/ 鏈濆悜闂锛?import * as THREE from "three";
import { makeEngineRegistry, makeEngineLayouts } from "../../src/three/parts/models/tiger/engine/registry";
import { tigerKitBuilders } from "../../src/three/parts/models/tiger/engine/kits";
import { buildModel } from "../../src/three/parts/assembler/assembler";

const registry = makeEngineRegistry();
const model = buildModel(registry, {
  builders: tigerKitBuilders,
  instanceLayouts: makeEngineLayouts(),
  warnMissingLayout: false,
});
model.root.updateMatrixWorld(true);

const ids = process.argv.slice(2);
const list =
  ids.length > 0
    ? ids
    : [
        "tiger.crankshaft.crank_pin",
        "tiger.crankshaft.crank_web",
        "tiger.crankshaft.main_journal",
        "tiger.crankcase.bearing_support",
        "tiger.crankcase.mount",
        "tiger.crankcase.rib",
        "tiger.crankcase.oil_pump",
        "tiger.crankcase.oil_filter",
        "tiger.crankcase.sump",
        "tiger.crankcase.drain_plug",
        "tiger.crankcase.oil_filler",
        "tiger.crankcase.nameplate",
        "tiger.crankcase.timing_cover",
        "tiger.crankcase.flywheel_housing",
        "tiger.crankshaft.flywheel",
        "tiger.crankshaft.ring_gear",
        "tiger.crankshaft.tail_shaft",
      ];

const fmt = (n: number) => n.toFixed(4).padStart(9);
for (const id of list) {
  const h = model.getPart(id);
  if (!h) {
    console.log(id, "MISSING");
    continue;
  }
  const pos = h.geometry.getAttribute("position") as THREE.BufferAttribute;
  const bbox = new THREE.Box3(
    new THREE.Vector3(pos.getX(0), pos.getY(0), pos.getZ(0)),
    new THREE.Vector3(pos.getX(0), pos.getY(0), pos.getZ(0)),
  );
  for (let i = 1; i < pos.count; i += 1) {
    bbox.expandByPoint(new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)));
  }
  console.log(
    `\n== ${id}  local x[${fmt(bbox.min.x)},${fmt(bbox.max.x)}] y[${fmt(bbox.min.y)},${fmt(bbox.max.y)}] z[${fmt(bbox.min.z)},${fmt(bbox.max.z)}]  instances=${h.instances.length}`,
  );
  for (const inst of h.instances.slice(0, 15)) {
    const b = bbox.clone().applyMatrix4(inst.restMatrix);
    console.log(
      `  [${String(inst.index).padStart(2)}] x[${fmt(b.min.x)},${fmt(b.max.x)}] y[${fmt(b.min.y)},${fmt(b.max.y)}] z[${fmt(b.min.z)},${fmt(b.max.z)}]`,
    );
  }
}
