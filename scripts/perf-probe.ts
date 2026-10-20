// 性能探针：拆解装配与首帧各阶段耗时
import { performance } from "node:perf_hooks";
import { buildModel } from "../src/three/parts/assembler/assembler";
import { makeT800Layouts, makeT800Registry, t800Builders } from "../src/three/parts/models/t800/registry";

let t = performance.now();
const registry = makeT800Registry();
const tRegistry = performance.now() - t;

t = performance.now();
const model = buildModel(registry, {
  builders: t800Builders,
  instanceLayouts: makeT800Layouts(),
  warnMissingLayout: false,
});
const tBuild = performance.now() - t;

t = performance.now();
model.resetNodes();
model.syncInstances();
model.root.updateMatrixWorld(true);
const tSync = performance.now() - t;

// 几何体总量
let tris = 0;
let verts = 0;
for (const part of model.parts) {
  const g = part.geometry;
  verts += g.attributes.position.count;
  const idx = g.index ? g.index.count : g.attributes.position.count;
  tris += idx / 3;
}
console.log(`注册表构建      ${tRegistry.toFixed(0)} ms`);
console.log(`装配（几何构建） ${tBuild.toFixed(0)} ms  parts=${model.parts.length}`);
console.log(`首帧同步        ${tSync.toFixed(0)} ms`);
console.log(`三角面 ${(tris / 1000).toFixed(0)}k  顶点 ${(verts / 1000).toFixed(0)}k`);

// 每帧的实例同步成本
t = performance.now();
for (let i = 0; i < 60; i++) {
  model.resetNodes();
  model.syncInstances();
  model.root.updateMatrixWorld(true);
}
console.log(`每帧同步 x60    ${(performance.now() - t).toFixed(0)} ms  → ${((performance.now() - t) / 60).toFixed(2)} ms/帧`);
