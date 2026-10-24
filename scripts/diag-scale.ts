// 尺寸审计：按模型/总成输出长×宽×高（模型单位，另附 displayScale 后的米数）。
// 用途：核对 1 单位 = 1 米、航母/舰载机/坦克实际尺寸与相对比例。
import * as THREE from "three";
import { buildModel } from "../src/three/parts/assembler/assembler";
import { CATALOG, findModel } from "../src/app/catalog";

const PRESENT_SCALE = 1; // 载体模型默认；presentationScale 存在时用它

function measure(modelId: string) {
  const model = findModel(modelId);
  if (!model?.registry) {
    console.log(`${modelId}: 未找到可装配的注册表`);
    return;
  }
  const built = buildModel(model.registry, {
    builders: model.builders,
    instanceLayouts: model.layouts,
    warnMissingLayout: false,
  });
  model.animate?.(built, 0, "idle");
  built.syncInstances();
  built.root.updateMatrixWorld(true);
  const scale = model.presentationScale ?? [PRESENT_SCALE, PRESENT_SCALE, PRESENT_SCALE];
  const groups = new Map<string, THREE.Box3>();
  const total = new THREE.Box3();
  let zMinPart = "", zMaxPart = "", xMinPart = "", xMaxPart = "";
  for (const handle of built.parts) {
    if (handle.def.tags?.includes("fx")) continue;
    const box = built.partBounds(handle, new THREE.Box3());
    if (box.isEmpty()) continue;
    total.union(box);
    if (!zMinPart || box.min.z <= total.min.z) zMinPart = handle.partId;
    if (!zMaxPart || box.max.z >= total.max.z) zMaxPart = handle.partId;
    if (!xMinPart || box.min.x <= total.min.x) xMinPart = handle.partId;
    if (!xMaxPart || box.max.x >= total.max.x) xMaxPart = handle.partId;
    const key = handle.partId.includes("scale_figure")
      ? "scale_figure_1.8m"
      : handle.assembly === "aircraft" && /\.(hangar)?parked/.test(handle.partId)
        ? "aircraft_parked"
        : handle.assembly || "default";
    const group = groups.get(key);
    if (group) group.union(box);
    else groups.set(key, box.clone());
  }
  const fmt = (b: THREE.Box3) => {
    const s = b.getSize(new THREE.Vector3());
    return `${(s.x * scale[0]).toFixed(2)} × ${(s.y * scale[1]).toFixed(2)} × ${(s.z * scale[2]).toFixed(2)} m (X×Y×Z)`;
  };
  console.log(`\n${model.title} [${model.id}]  零件 ${built.parts.length}`);
  if (model.presentationScale) {
    console.log(`  presentationScale: ${model.presentationScale.join(" / ")}`);
  }
  console.log(`  整机: ${fmt(total)}  zRange ${total.min.z.toFixed(2)}..${total.max.z.toFixed(2)}  xRange ${total.min.x.toFixed(2)}..${total.max.x.toFixed(2)}`);
  console.log(`  极端: zMin ${zMinPart}=${total.min.z.toFixed(2)} zMax ${zMaxPart}=${total.max.z.toFixed(2)} xMin ${xMinPart}=${total.min.x.toFixed(2)} xMax ${xMaxPart}=${total.max.x.toFixed(2)}`);
  for (const [assembly, box] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`  ${assembly.padEnd(18)} ${fmt(box)}`);
  }
  built.dispose?.();
}

for (const id of ["carrier", "tiger", "mbt90", "ed90", "j20"]) {
  if (CATALOG.some((m) => m.id === id)) measure(id);
}
