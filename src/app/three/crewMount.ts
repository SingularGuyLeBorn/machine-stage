import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { AssembledModel } from "@/three/parts/assembler/assembler";
import {
  CARRIER_CREW_FIGURES,
  CREW_MODEL_URLS,
  CREW_PALETTES,
  CREW_SHIP_SCALE,
  TYPE055_CREW_FIGURES,
  type CrewFigureDef,
  type CrewModelId,
  type CrewPalette,
} from "@/three/parts/models/crewFigures";

// ============================================================================
// 舰员人物：真正的人形蒙皮网格（Quaternius CC0，约 1.86m 高，带面部/手指/
// 服装分件），替代原先的方块+球体拼装人。每个角色都有独立蒙皮骨架和动画，
// 不是同一个模型复制粘贴：Worker / Suit / Casual / Security 四种体型与服装，
// 按岗位重新配色，并在餐厅、厨房、医务、住舱、走廊、健身区使用不同待机动作。
// ============================================================================

const loader = new GLTFLoader();
const sourceCache = new Map<CrewModelId, Promise<GLTF>>();

function loadModel(model: CrewModelId): Promise<GLTF> {
  let cached = sourceCache.get(model);
  if (!cached) {
    cached = loader.loadAsync(CREW_MODEL_URLS[model]);
    sourceCache.set(model, cached);
  }
  return cached;
}

function recolorMaterial(
  material: THREE.Material,
  model: CrewModelId,
  palette: CrewPalette,
): THREE.Material {
  const next = material.clone();
  const p = CREW_PALETTES[palette];
  const name = material.name;
  const set = (hex: string, roughness = 0.82) => {
    const std = next as THREE.MeshStandardMaterial;
    if (std.color) std.color.set(hex);
    if (std.roughness !== undefined) std.roughness = roughness;
    if (std.metalness !== undefined) std.metalness = 0;
    if (std.envMapIntensity !== undefined) std.envMapIntensity = 0.35;
  };
  if (model === "worker-male" || model === "worker-female") {
    if (name === "Worker_Yellow") set(p.main);
    else if (name === "Worker_Vest") set(p.vest);
    else if (name === "Grey") set(p.pants);
    else if (name === "Black") set("#15181b");
  } else if (model === "suit-male" || model === "suit-female") {
    if (name === "Suit") set(p.main, 0.72);
    else if (name === "Tie") set(p.accent, 0.6);
    else if (name === "White") set(p.shirt ?? "#e7e2d4");
    else if (name === "Grey") set(p.pants);
    else if (name === "Black") set("#15181b", 0.42);
  } else if (model === "casual-male") {
    if (name === "Purple") set(p.main);
    else if (name === "LightBlue") set(p.pants);
    else if (name === "White") set(p.shirt ?? "#d8d4c8");
    else if (name === "Red_Dark") set(p.accent);
  } else if (model === "security") {
    if (name === "Swat") set(p.main, 0.84);
    else if (name === "Swat_Black") set(p.vest, 0.8);
    else if (name === "Visor") set("#0b1116", 0.22);
    else if (name === "Grey") set(p.pants);
    else if (name === "Black") set("#101315");
  }
  return next;
}

function prepareFigure(root: THREE.Object3D, model: CrewModelId, palette: CrewPalette): void {
  root.traverse((object) => {
    // 手枪是手部挂件，舰内生活区不携带，直接隐藏（不删除骨架）。
    if (/pistol|gun/i.test(object.name)) {
      object.visible = false;
      return;
    }
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.material = Array.isArray(mesh.material)
      ? mesh.material.map((m) => recolorMaterial(m, model, palette))
      : recolorMaterial(mesh.material, model, palette);
  });
}

export function mountCrewFigures(assembled: AssembledModel, modelId: "type055" | "carrier"): () => void {
  const ship = CREW_SHIP_SCALE[modelId];
  const figures = modelId === "carrier" ? CARRIER_CREW_FIGURES : TYPE055_CREW_FIGURES;
  const wrappers: THREE.Group[] = [];
  const mixers: THREE.AnimationMixer[] = [];
  let disposed = false;
  let raf = 0;
  let last = performance.now();

  const tick = (now: number) => {
    if (disposed) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    for (const mixer of mixers) mixer.update(dt);
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  const build = async () => {
    const models = Array.from(new Set(figures.map((f) => f.model)));
    const loaded = new Map<CrewModelId, GLTF>();
    await Promise.all(
      models.map(async (m) => {
        try {
          loaded.set(m, await loadModel(m));
        } catch (error) {
          console.warn(`舰员模型 ${m} 加载失败`, error);
        }
      }),
    );
    if (disposed) return;
    assembled.root.updateMatrixWorld(true);
    figures.forEach((def: CrewFigureDef, index) => {
      const gltf = loaded.get(def.model);
      if (!gltf) return;
      const root = cloneSkeleton(gltf.scene);
      prepareFigure(root, def.model, def.palette);
      const wrapper = new THREE.Group();
      wrapper.name = `crew-figure-${index}`;
      wrapper.position.set(def.x, ship.floorY, def.z);
      wrapper.rotation.y = THREE.MathUtils.degToRad(def.yaw);
      wrapper.scale.setScalar(ship.scale);
      wrapper.add(root);
      assembled.root.add(wrapper);
      wrappers.push(wrapper);
      const mixer = new THREE.AnimationMixer(root);
      const clips = gltf.animations;
      const clip =
        clips.find((c) => c.name === (def.animation ?? "Idle_Neutral")) ??
        clips.find((c) => c.name === "Idle_Neutral") ??
        clips.find((c) => /idle/i.test(c.name)) ??
        clips[0];
      if (clip) {
        const action = mixer.clipAction(clip);
        action.setLoop(THREE.LoopRepeat, Infinity);
        action.time = (index * 0.73) % Math.max(0.01, clip.duration);
        action.play();
      }
      mixers.push(mixer);
    });
  };
  void build();

  return () => {
    disposed = true;
    cancelAnimationFrame(raf);
    for (const wrapper of wrappers) assembled.root.remove(wrapper);
    for (const mixer of mixers) mixer.stopAllAction();
  };
}
