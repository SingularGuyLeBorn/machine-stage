// 璇婃柇锛氭寜闆朵欢鍚嶈繃婊ら潤鎬佺┛妯℃姤鍛婏紝鎵撳嵃姣忔潯鎶ュ憡鐨勪唬琛ㄧ┛閫忕偣锛堝畾浣嶇敤锛?// 鐢ㄦ硶锛歯px tsx scripts/diag-pair.ts [杩囨护璇峕
import { makeEngineRegistry, makeEngineLayouts } from "../../src/three/parts/models/tiger/engine/registry";
import { tigerKitBuilders } from "../../src/three/parts/models/tiger/engine/kits";
import { buildModel } from "../../src/three/parts/assembler/assembler";
import { detectStatic } from "../../src/three/parts/solver/detect";

const needles = process.argv.slice(2).filter((a) => a.length > 0);

const registry = makeEngineRegistry();
const model = buildModel(registry, {
  builders: tigerKitBuilders,
  instanceLayouts: makeEngineLayouts(),
  warnMissingLayout: false,
});

const reports = detectStatic(model, { minDepthM: 0.0005 });
const hits = reports.filter(
  (r) => needles.length === 0 || needles.some((n) => r.a.includes(n) || r.b.includes(n)),
);
console.log(`鎬绘姤鍛?${reports.length}锛岃繃婊?"${needles.join("|")}" 鍛戒腑 ${hits.length}`);

for (const r of hits) {
  const est = r.estimated ? " est" : "";
  console.log(
    `${String(r.depth_mm.toFixed(1)).padStart(7)}mm${est}  ${r.a} <-> ${r.b}  @ (${r.point.join(", ")})`,
  );
}
