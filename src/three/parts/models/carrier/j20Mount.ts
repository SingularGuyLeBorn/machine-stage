import * as THREE from "three";
import type { AssembledModel } from "../../assembler/assembler";
import { AIRCRAFT_SCALE_Z } from "./aircraft";
import { buildJ20 } from "./j20/j20";
import type { CodeCharacter } from "./j20/types";

// 用 fight-stage 的 j20.ts 原模型替换航母现役机与甲板/机库停放机。
// j20.ts 以米建模（机长 20.4m，原点在三轮着地中心，机头 +Z）；航母编辑尺度 1:8，
// 根节点缩放 1/8。母节点还带 AIRCRAFT_SCALE_Z(≈0.914) 的 z 缩放，这里反向补偿。
// 旧 J-15 零件保留在注册表里做碰撞代理/零件树，但不再渲染。
// 停放机有 8 架，直接克隆会让 draw call 翻 8 倍；这里把每块 J20 网格做成
// InstancedMesh（8 个停放位共享几何），现役机保留完整细节。
const J20_SCALE = 1 / 8;
const FX_NAME = /^(Flame|MissileFlame|Smoke|Boom)/;

function prepare(root: THREE.Group): void {
  root.scale.set(J20_SCALE, J20_SCALE, J20_SCALE / AIRCRAFT_SCALE_Z);
  root.position.set(0, 0, 0);
  root.traverse((object) => {
    if (FX_NAME.test(object.name) || object.name.startsWith("hotspot:")) object.visible = false;
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
  });
}

export function mountCarrierJ20(assembled: AssembledModel): () => void {
  const aircraft = assembled.getNode("CV_Aircraft");
  if (!aircraft) return () => {};

  let character: CodeCharacter;
  try {
    character = buildJ20();
  } catch (error) {
    console.warn("J20 模型构建失败，保留原舰载机", error);
    return () => {};
  }
  const source = character.root;
  prepare(source);
  source.updateMatrixWorld(true);

  assembled.root.updateMatrixWorld(true);
  const rootInverse = new THREE.Matrix4().copy(assembled.root.matrixWorld).invert();
  const sourceWorld = source.matrixWorld.clone();
  const sourceInverse = sourceWorld.clone().invert();
  const parkedMatrices: THREE.Matrix4[] = [];
  // 只替换甲板现役机/停放机；机库内仍用折叠翼 J-15（J20 展开翼展 13m，机库净宽
  // 与第一人称机位都会被机翼顶到，硬塞进去反而穿模）。
  for (let i = 1; i <= 4; i++) {
    const parent = assembled.getNode(`CV_Aircraft_parked_${i}`);
    if (!parent) continue;
    parent.updateMatrixWorld(true);
    parkedMatrices.push(new THREE.Matrix4().multiplyMatrices(rootInverse, parent.matrixWorld));
  }

  const instanced: THREE.InstancedMesh[] = [];
  if (parkedMatrices.length > 0) {
    const meshes: THREE.Mesh[] = [];
    source.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.isMesh && mesh.visible) meshes.push(mesh);
    });
    const scratch = new THREE.Matrix4();
    for (const mesh of meshes) {
      const meshLocal = new THREE.Matrix4().multiplyMatrices(sourceInverse, mesh.matrixWorld);
      const srcInstanced = mesh as THREE.InstancedMesh;
      if (srcInstanced.isInstancedMesh) {
        // 机内原有的实例件（铆钉列）：每个停放位单独复制一份，保留原实例分布。
        for (const parking of parkedMatrices) {
          const out = new THREE.InstancedMesh(srcInstanced.geometry, srcInstanced.material, srcInstanced.count);
          for (let j = 0; j < srcInstanced.count; j++) {
            srcInstanced.getMatrixAt(j, scratch);
            scratch.premultiply(meshLocal).premultiply(sourceWorld).premultiply(parking);
            out.setMatrixAt(j, scratch);
          }
          out.instanceMatrix.needsUpdate = true;
          out.castShadow = true;
          out.receiveShadow = true;
          out.frustumCulled = false;
          assembled.root.add(out);
          instanced.push(out);
        }
        continue;
      }
      const out = new THREE.InstancedMesh(mesh.geometry, mesh.material, parkedMatrices.length);
      parkedMatrices.forEach((parking, index) => {
        scratch.multiplyMatrices(parking, sourceWorld).multiply(meshLocal);
        out.setMatrixAt(index, scratch);
      });
      out.instanceMatrix.needsUpdate = true;
      out.castShadow = true;
      out.receiveShadow = true;
      out.frustumCulled = false;
      assembled.root.add(out);
      instanced.push(out);
    }
  }

  aircraft.add(source);

  const hidden: Array<{ object: THREE.Object3D; visible: boolean }> = [];
  for (const handle of assembled.parts) {
    if (!handle.partId.startsWith("carrier.aircraft.")) continue;
    if (handle.partId.startsWith("carrier.aircraft.hangarparked")) continue;
    hidden.push({ object: handle.object, visible: handle.object.visible });
    handle.object.visible = false;
  }

  return () => {
    aircraft.remove(source);
    for (const mesh of instanced) {
      assembled.root.remove(mesh);
      mesh.dispose();
    }
    for (const item of hidden) item.object.visible = item.visible;
    character.dispose();
  };
}
