// 璇婃柇锛氳閰?tiger 鍙戝姩鏈猴紝杈撳嚭鏁存満鍖呭洿鐩?+ 鎵剧缇?婕傛诞闆朵欢锛堢洃宸ヨ剼鏈紝鎸佺画缁存姢锛?// 鐢ㄦ硶锛歯px tsx scripts/diag-bounds.ts
// 鍒ゅ畾锛?//   绂荤兢   鈥斺€?闆朵欢涓績璺濇暣鏈轰腑蹇?> 1.5m
//   瓒呭ぇ   鈥斺€?闆朵欢瀵硅绾?> 2m
//   婕傛诞   鈥斺€?瀹炰緥鐩掑埌銆屽叾浣欐墍鏈夊疄渚嬬洅銆嶇殑鏈€灏忚窛绂?> 8mm锛堥€愬疄渚嬪垽瀹氾紝鑳芥姄鍒板彔閿欎綅鐨勫疄渚嬶級
import * as THREE from "three";
import { makeEngineRegistry, makeEngineLayouts } from "../../src/three/parts/models/tiger/engine/registry";
import { tigerKitBuilders } from "../../src/three/parts/models/tiger/engine/kits";
import { buildModel } from "../../src/three/parts/assembler/assembler";

const registry = makeEngineRegistry();
const model = buildModel(registry, {
  builders: tigerKitBuilders,
  instanceLayouts: makeEngineLayouts(),
  warnMissingLayout: false,
});

/** 涓€涓浂浠剁殑涓栫晫鍖呭洿鐩掞紙瀹炰緥绾у睍寮€锛涚煩闃靛垪涓诲簭鎵嬬畻锛屼笉渚濊禆 Box3 瀹炰緥锛夈€?*/
interface PartBox {
  name: string;
  min: [number, number, number];
  max: [number, number, number];
}

const mul = (m: ArrayLike<number>, p: [number, number, number]): [number, number, number] => [
  m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
  m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
  m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
];

model.root.updateMatrixWorld(true);
const partBoxes: PartBox[] = [];
/** 閫愬疄渚嬬洅锛堝崟瀹炰緥闆朵欢灏辨槸闆朵欢鐩掓湰韬級锛氭紓娴娴嬬殑鍒ゅ畾鍗曚綅銆?*/
const floatBoxes: PartBox[] = [];
model.root.traverse((o) => {
  const mesh = o as THREE.Mesh & { count?: number };
  if (!mesh.isMesh && !(mesh as THREE.InstancedMesh).isInstancedMesh) return;
  if (!mesh.geometry) return;
  if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
  const bb = mesh.geometry.boundingBox!;
  const corners: Array<[number, number, number]> = [];
  for (const x of [bb.min.x, bb.max.x])
    for (const y of [bb.min.y, bb.max.y]) for (const z of [bb.min.z, bb.max.z]) corners.push([x, y, z]);
  const world = mesh.matrixWorld.elements;
  const instanced = mesh as THREE.InstancedMesh;
  const count = instanced.isInstancedMesh ? instanced.count : 1;
  const instArr = instanced.isInstancedMesh ? instanced.instanceMatrix.array : null;
  const name = mesh.name || "(anon)";
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < count; i++) {
    const inst = instArr ? Array.from(instArr.slice(i * 16, i * 16 + 16)) : null;
    const imin: [number, number, number] = [Infinity, Infinity, Infinity];
    const imax: [number, number, number] = [-Infinity, -Infinity, -Infinity];
    for (const c of corners) {
      const p = mul(world, inst ? mul(inst, c) : c);
      for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k], p[k]);
        max[k] = Math.max(max[k], p[k]);
        imin[k] = Math.min(imin[k], p[k]);
        imax[k] = Math.max(imax[k], p[k]);
      }
    }
    if (count > 1) floatBoxes.push({ name: `${name}[${i}]`, min: imin, max: imax });
  }
  if (count === 1) floatBoxes.push({ name, min, max });
  partBoxes.push({ name, min, max });
});

const total = new THREE.Box3();
for (const b of partBoxes) {
  total.expandByPoint(new THREE.Vector3(...b.min));
  total.expandByPoint(new THREE.Vector3(...b.max));
}
const center = total.getCenter(new THREE.Vector3());
const size = total.getSize(new THREE.Vector3());
console.log(
  "WHOLE min=",
  total.min.toArray().map((v) => v.toFixed(3)),
);
console.log(
  "WHOLE max=",
  total.max.toArray().map((v) => v.toFixed(3)),
);
console.log(
  "WHOLE center=",
  center.toArray().map((v) => v.toFixed(3)),
  " size=",
  size.toArray().map((v) => v.toFixed(3)),
);

const perPart = partBoxes.map((b) => {
  const c = [0, 1, 2].map((k) => (b.min[k] + b.max[k]) / 2) as [number, number, number];
  const s = [0, 1, 2].map((k) => b.max[k] - b.min[k]);
  return {
    name: b.name,
    c,
    size: Math.hypot(...s),
    dist: Math.hypot(c[0] - center.x, c[1] - center.y, c[2] - center.z),
  };
});

// 鏋佸€间欢锛氭暣鏈哄寘鍥寸洅鐢辫皝鎾戝嚭鏉ワ紙浣庝綅/鍓嶄綅鏈€鍙枒锛屽鍗婃槸閿欎綅闆朵欢锛?const lowest = [...partBoxes].sort((a, b) => a.min[1] - b.min[1]).slice(0, 5);
const frontmost = [...partBoxes].sort((a, b) => b.max[0] - a.max[0]).slice(0, 5);
console.log("--- 鏈€浣?5 浠?");
for (const b of lowest) console.log(`  ${b.name}  minY=${b.min[1].toFixed(3)}`);
console.log("--- 鏈€鍓嶏紙+X锛? 浠?");
for (const b of frontmost) console.log(`  ${b.name}  maxX=${b.max[0].toFixed(3)}`);

// 绂荤兢闆朵欢锛氫腑蹇冭窛鍘熺偣 > 1.5m锛堝彂鍔ㄦ満鏈韩绾?1.3m锛?const outliers = perPart.filter((p) => p.dist > 1.5).sort((a, b) => b.dist - a.dist);
console.log("--- 绂荤兢闆朵欢锛堜腑蹇冭窛 > 1.5m锛?", outliers.length);
for (const p of outliers.slice(0, 15)) {
  console.log(`  ${p.name}  center=(${p.c.map((v) => v.toFixed(2)).join(",")})  dist=${p.dist.toFixed(2)}`);
}
// 瓒呭ぇ闆朵欢锛氬昂瀵?> 2m锛堝紓甯告媺浼镐篃浼氭拺鐖嗗寘鍥寸洅锛?const giants = perPart.filter((p) => p.size > 2).sort((a, b) => b.size - a.size);
console.log("--- 瓒呭ぇ闆朵欢锛堝瑙掔嚎 > 2m锛?", giants.length);
for (const p of giants.slice(0, 15)) {
  console.log(`  ${p.name}  size=${p.size.toFixed(2)}`);
}

// 婕傛诞瀹炰緥锛氫笌銆屾渶杩戠殑鍏跺畠瀹炰緥銆嶄篃闅旂潃绌洪殭锛堥槇鍊?8mm锛?const gap = (a: PartBox, b: PartBox): number => {
  let s = 0;
  for (let k = 0; k < 3; k++) {
    const g = Math.max(b.min[k] - a.max[k], a.min[k] - b.max[k]);
    if (g > 0) s += g * g;
  }
  return Math.sqrt(s);
};
const floats: Array<{ name: string; gap_mm: number; nearest: string }> = [];
for (let i = 0; i < floatBoxes.length; i++) {
  let best = Infinity;
  let nearest = "";
  for (let j = 0; j < floatBoxes.length; j++) {
    if (i === j) continue;
    const d = gap(floatBoxes[i], floatBoxes[j]);
    if (d < best) {
      best = d;
      nearest = floatBoxes[j].name;
    }
  }
  if (best > 0.008) floats.push({ name: floatBoxes[i].name, gap_mm: +(best * 1000).toFixed(1), nearest });
}
floats.sort((a, b) => b.gap_mm - a.gap_mm);
console.log("--- 婕傛诞瀹炰緥锛堜笌鏈€杩戝疄渚嬩粛鏈?> 8mm 绌洪殭锛?", floats.length);
for (const f of floats.slice(0, 20)) {
  console.log(`  ${f.name}  绌洪殭=${f.gap_mm}mm  鏈€杩?${f.nearest}`);
}

if (outliers.length || giants.length || floats.length) {
  process.exitCode = 1; // 渚?CI/鐩戝伐鑴氭湰鍒ゅ畾
}
