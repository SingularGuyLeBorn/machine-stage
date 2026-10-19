// 璇婃柇锛氭洸杞寸澹充綋鎴潰鎺㈤拡锛堟部 X 灏勭嚎濂囧伓锛?M'=鏉愭枡 '.'=绌猴級锛屼笌鏈熸湜鍊煎鐓?import * as THREE from "three";
import { makeEngineRegistry, makeEngineLayouts } from "../../src/three/parts/models/tiger/engine/registry";
import { tigerKitBuilders } from "../../src/three/parts/models/tiger/engine/kits";
import { buildModel } from "../../src/three/parts/assembler/assembler";

const registry = makeEngineRegistry();
const model = buildModel(registry, {
  builders: tigerKitBuilders,
  instanceLayouts: makeEngineLayouts(),
  warnMissingLayout: false,
});

function materialProbe(id: string): (y: number, z: number) => boolean {
  const handle = model.parts.find((h) => h.def.id === id)!;
  const geometry = handle.geometry.clone();
  geometry.applyMatrix4(model.instanceMatrix(handle, 0, new THREE.Matrix4()));
  const mesh = new THREE.Mesh(geometry);
  const raycaster = new THREE.Raycaster();
  const origin = new THREE.Vector3();
  return (y, z) => {
    origin.set(-2, y, z);
    raycaster.set(origin, new THREE.Vector3(1, 0, 0));
    const list = raycaster.intersectObject(mesh, false);
    const seen = new Set<string>();
    let hits = 0;
    for (const hit of list) {
      const key = String(Math.round(hit.point.x * 1e6));
      if (seen.has(key)) continue;
      seen.add(key);
      hits++;
    }
    return hits % 2 === 1;
  };
}

const probe = materialProbe("tiger.crankcase.shell");
const cases: Array<[string, number, number, "M" | "V"]> = [
  ["璋蜂腑蹇冿紙鏃犱腑鑴婏級", 0.19, 0.0, "V"],
  ["璋蜂腑蹇冧笂閮?, 0.13, 0.0, "V"],
  ["澧欎綋 L(+z)", 0.0, 0.145, "M"],
  ["澧欎綋 R(-z)", -0.05, -0.145, "M"],
  ["搴曞３", -0.16, 0.0, "M"],
  ["搴曞３搴曢潰涓?, -0.18, 0.0, "V"],
  ["鍐呭浠ュ唴锛堣胺锛?, 0.02, -0.13, "V"],
  ["鍐呭鏉愭枡", 0.02, -0.14, "M"],
  ["鐢叉澘澶栫紭鏉垮唴閮?, 0.135, -0.17, "M"],
  ["鐢叉澘澶栫紭鏉夸笂鏂癸紙鍑€绌猴級", 0.16, -0.17, "V"],
  ["鐢叉澘澶栫紭鏉?rim 涓婃柟", 0.15, -0.186, "V"],
  ["鏃ф枩闈㈠尯锛堝凡鍓婂钩锛?, 0.145, -0.155, "V"],
  ["澧欓《鍐呬晶", 0.1, -0.145, "M"],
  ["澧欓《涓婃柟", 0.125, -0.145, "V"],
  ["+z 鐢叉澘澶栫紭鏉垮唴閮?, 0.135, 0.17, "M"],
  ["+z 澧欓《涓婃柟", 0.125, 0.145, "V"],
  ["+z 鐢叉澘澶栫紭鏉夸笂鏂?, 0.16, 0.17, "V"],
  ["鍓嶇闈㈠锛坸 鏂瑰悜鏃犲叧锛夊簳澹?, -0.155, 0.0, "M"],
  ["璋峰簳涓婃柟 20mm", -0.1, 0.0, "V"],
  ["璋峰簳锛堝簳鏉垮唴锛?, -0.162, 0.0, "M"],
];

let failed = 0;
for (const [name, y, z, want] of cases) {
  const got = probe(y, z) ? "M" : "V";
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}: (y=${y}, z=${z}) got=${got} want=${want}`);
}
console.log(`\n${cases.length - failed}/${cases.length} 閫氳繃`);

// ---- y 鍒囩墖鎵弿锛氭墦鍗版瘡琛屾潗鏂欏尯闂寸殑 z 鑼冨洿锛?.5mm 姝ラ暱锛?----
console.log("\n=== 鏉愭枡鍖洪棿鎵弿锛坺 浠?-0.20 鍒?0.20锛屾闀?0.5mm锛?==");
for (const y of [-0.15, -0.05, 0.05, 0.1, 0.12, 0.13, 0.135, 0.14, 0.145, 0.15, 0.155]) {
  const runs: Array<[number, number]> = [];
  let start: number | null = null;
  for (let z = -0.2; z <= 0.2 + 1e-9; z += 0.0005) {
    const solid = probe(y, Number(z.toFixed(5)));
    if (solid && start === null) start = z;
    if (!solid && start !== null) {
      runs.push([start, z - 0.0005]);
      start = null;
    }
  }
  if (start !== null) runs.push([start, 0.2]);
  console.log(
    `y=${y.toFixed(3)}: ${runs.map(([a, b]) => `${a.toFixed(3)}~${b.toFixed(3)}`).join("  ") || "锛堝叏绌猴級"}`,
  );
}
