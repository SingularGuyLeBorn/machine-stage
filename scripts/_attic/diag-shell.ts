// 璇婃柇锛氭洸杞寸澹充綋鎴潰椤剁偣浜戯紙deck 鍖猴級锛岀‘璁や笅绉?寮€妲藉悗鐨勭湡瀹炶疆寤?// 鐢ㄦ硶锛歯px tsx scripts/diag-shell.ts [yMin]
import * as THREE from "three";
import { makeEngineRegistry, makeEngineLayouts } from "../../src/three/parts/models/tiger/engine/registry";
import { tigerKitBuilders } from "../../src/three/parts/models/tiger/engine/kits";
import { buildModel } from "../../src/three/parts/assembler/assembler";

const yMin = Number(process.argv[2] ?? 0.19);
const id = process.argv[3] ?? "tiger.crankcase.shell";

const registry = makeEngineRegistry();
const model = buildModel(registry, {
  builders: tigerKitBuilders,
  instanceLayouts: makeEngineLayouts(),
  warnMissingLayout: false,
});
model.root.updateMatrixWorld(true);

const handle = model.parts.find((h) => h.def.id === id);
if (!handle) throw new Error(`鏈壘鍒伴浂浠?${id}`);
const geometry = handle.geometry;
const position = geometry.getAttribute("position") as THREE.BufferAttribute;
console.log(`涓夎闈?${position.count / 3}锛岄《鐐?${position.count}`);
geometry.computeBoundingBox();
const box = geometry.boundingBox!;
console.log(
  `bbox x[${box.min.x.toFixed(4)}, ${box.max.x.toFixed(4)}] y[${box.min.y.toFixed(4)}, ${box.max.y.toFixed(4)}] z[${box.min.z.toFixed(4)}, ${box.max.z.toFixed(4)}]`,
);

// (y,z) 鍘婚噸锛?.1mm 缃戞牸锛夛紝鍙湅 deck 鍖?const grid = new Set<string>();
const points: Array<[number, number]> = [];
for (let i = 0; i < position.count; i++) {
  const y = position.getY(i);
  const z = position.getZ(i);
  if (y < yMin) continue;
  const key = `${Math.round(y * 1e4)}:${Math.round(z * 1e4)}`;
  if (grid.has(key)) continue;
  grid.add(key);
  points.push([y, z]);
}
points.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
console.log(`deck 鍖?y鈮?{yMin}) 鍘婚噸椤剁偣 ${points.length} 涓細`);
for (const [y, z] of points) {
  const u = 0.8660254037844386 * y + 0.5 * z; // 缂歌酱鏂瑰悜鎶曞奖锛堚垝z bank 渚э級
  const uPlus = 0.8660254037844386 * y - 0.5 * z;
  console.log(`  y=${y.toFixed(5)} z=${z.toFixed(5)}  u(-z)=${u.toFixed(5)} u(+z)=${uPlus.toFixed(5)}`);
}
