// 临时勘察：列出与 L4 候选板体（地板 / 侧板 / 前板 / 后板 / 防火墙）AABB 相交的零件
import { buildModel } from "../src/three/parts/assembler/assembler";
import { makeTigerLayouts, makeTigerRegistry, tigerBuilders } from "../src/three/parts/models/tiger/registry";
import { planPairs } from "../src/three/parts/solver/detect";
import * as THREE from "three";

const registry = makeTigerRegistry();
const model = buildModel(registry, {
  builders: tigerBuilders,
  instanceLayouts: makeTigerLayouts(),
  warnMissingLayout: false,
});

const plan = planPairs(model);

/** 候选板体（世界坐标 AABB），留 0.05 余量用于找"太近"的零件 */
const probes: Array<{ name: string; box: THREE.Box3; note: string }> = [
  {
    name: "前装甲板(内-4.40 外-4.50)",
    box: new THREE.Box3(new THREE.Vector3(-4.5, -0.4, -0.97), new THREE.Vector3(-4.4, 1.05, 0.97)),
    note: "",
  },
  {
    name: "侧板右(z 0.90..0.9625)",
    box: new THREE.Box3(new THREE.Vector3(-4.4, -0.345, 0.9), new THREE.Vector3(0.83, 1.05, 0.9625)),
    note: "",
  },
  {
    name: "侧板左(z -0.9625..-0.90)",
    box: new THREE.Box3(new THREE.Vector3(-4.4, -0.345, -0.9625), new THREE.Vector3(0.83, 1.05, -0.9)),
    note: "",
  },
  {
    name: "地板(y -0.335..-0.305)",
    box: new THREE.Box3(new THREE.Vector3(-4.4, -0.335, -0.9), new THREE.Vector3(0.83, -0.305, 0.9)),
    note: "",
  },
  {
    name: "后装甲板(内0.83 外0.91)",
    box: new THREE.Box3(new THREE.Vector3(0.83, -0.4, -0.97), new THREE.Vector3(0.91, 1.05, 0.97)),
    note: "",
  },
  {
    name: "防火墙(x -0.78..-0.72)",
    box: new THREE.Box3(new THREE.Vector3(-0.78, -0.4, -0.9), new THREE.Vector3(-0.72, 1.05, 0.9)),
    note: "",
  },
  {
    name: "顶甲板(y 1.05..1.075，L4-b 待建)",
    box: new THREE.Box3(new THREE.Vector3(-4.5, 1.045, -0.97), new THREE.Vector3(0.91, 1.09, 0.97)),
    note: "L4-b 顶甲板下表面 1.05；空滤顶 1.056 与座圈口径待这里定",
  },
  {
    name: "炮塔座圈(x -1.65..-0.35、y 1.00..1.10，L4-b 待建)",
    box: new THREE.Box3(new THREE.Vector3(-1.65, 1.0, -0.97), new THREE.Vector3(-0.35, 1.1, 0.97)),
    note: "L4-b 座圈开口直径 φ1650 的候选范围",
  },
];

for (const probe of probes) {
  const hits = plan.bodies.filter((b) => probe.box.intersectsBox(b.box));
  console.log(`\n=== ${probe.name} —— 相交 ${hits.length} 体 ===`);
  const byId = new Map<string, { n: number; min: number[]; max: number[] }>();
  for (const b of hits) {
    const id = b.ref.split("[")[0]!;
    const cur = byId.get(id) ?? {
      n: 0,
      min: [Infinity, Infinity, Infinity],
      max: [-Infinity, -Infinity, -Infinity],
    };
    cur.n++;
    for (let i = 0; i < 3; i++) {
      cur.min[i] = Math.min(cur.min[i], b.box.min.getComponent(i));
      cur.max[i] = Math.max(cur.max[i], b.box.max.getComponent(i));
    }
    byId.set(id, cur);
  }
  for (const [id, v] of byId) {
    const f = (x: number) => x.toFixed(3);
    console.log(
      `  ${id.padEnd(42)} 体 ${String(v.n).padStart(3)}  x ${f(v.min[0])}..${f(v.max[0])}  y ${f(v.min[1])}..${f(v.max[1])}  z ${f(v.min[2])}..${f(v.max[2])}`,
    );
  }
}
