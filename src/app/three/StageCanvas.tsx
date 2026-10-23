import { ContactShadows, Environment, Grid, Html, Lightformer, OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Bloom, EffectComposer, N8AO, Vignette } from "@react-three/postprocessing";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import {
  buildModel,
  createMaterialLibrary,
  formatIssues,
  validateRegistry,
  type AssembledModel,
} from "@/three/parts";
import { findModel, type StageModel } from "../catalog";
import { buildOrdersOf, faultFromError, useStageStore } from "../state/stageStore";
import { applyDamage, applyDetach, applyExplode, applyHighlight, applyXray, clearPose } from "./pose";
import { applyInternalVisibility, isInternalPart, isXrayShellPart } from "./internal";
import { createLocalXray } from "./localXray";
import { Weather } from "./Weather";
import { setArmourWet } from "@/three/parts/kernel/armourSurface";
import { TigerVfx } from "./vfx/TigerVfx";
import { MbtVfx } from "./vfx/MbtVfx";
import { applyTigerLidPose, effectiveLidOpen, lidAt } from "@/three/parts/models/tiger/lids";
import { firstPersonView, type CameraMode } from "./viewpoints";
import { setAk47Mode } from "@/three/parts/models/ak47/motion";
import { setM249Mode } from "@/three/parts/models/m249/motion";
import { setM2hbMode } from "@/three/parts/models/m2hb/motion";
import { setM134Mode } from "@/three/parts/models/m134/motion";

// ============================================================================
// StageCanvas —— 中栏 3D 视口
//
// 装配结果由命令式 three 对象持有（装配器输出），这里只做三件事：
//   1) 注册表 → AssembledModel → 场景（重建时先卸载再释放）
//   2) 每帧纪律：resetNodes → 动画 → syncInstances → 姿态层（爆炸/透视/高亮）
//   3) 交互：拾取高亮、相机聚焦（零件树 / 穿模报告点击）
// 光照为程序化 studio（Lightformer + ACES + SSAO），不依赖 HDR 资产。
// ============================================================================

const HOME_DIRECTION = new THREE.Vector3(1.05, 0.78, 1.15).normalize();

/** motionParts 每帧都要用 → 按模型缓存成 Set，避免 useFrame 里反复分配。 */
const motionPartSets = new WeakMap<StageModel, ReadonlySet<string>>();
function motionPartsOf(model: StageModel): ReadonlySet<string> | undefined {
  if (!model.motionParts?.length) return undefined;
  let set = motionPartSets.get(model);
  if (!set) {
    set = new Set(model.motionParts);
    motionPartSets.set(model, set);
  }
  return set;
}

const MODEL_CACHE_LIMIT = 3;
interface CachedBuild {
  assembled: AssembledModel;
  library: ReturnType<typeof createMaterialLibrary>;
  stats: { parts: number; triangles: number };
  home: { center: [number, number, number]; radius: number } | null;
  floor: { y: number; footprint: number } | null;
  lastUsed: number;
  warmed: boolean;
}

export function StageCanvas() {
  return (
    <Canvas
      shadows
      dpr={[1, 1.5]}
      camera={{ position: [4.6, 3.4, 5.2], fov: 34, near: 0.05, far: 200 }}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
    >
      <color attach="background" args={["#e9ecf0"]} />
      <Studio />
      <StageRuntime />
      <TigerVfx />
      <MbtVfx />
      <CameraRig />
      <StageEffects />
    </Canvas>
  );
}

/** 程序化 studio 环境：三面柔光箱 + 顶部条形光 + 暗底，无外部 HDR 资产。
 *  明暗对比是金属感的来源——环境若是一块均匀灰，金属反射出来就是灰塑料。 */
function Studio() {
  return (
    <>
      <ambientLight intensity={0.3} />
      <directionalLight
        castShadow
        position={[5.5, 8.5, 4.5]}
        intensity={1.9}
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0006}
        shadow-normalBias={0.012}
      >
        <orthographicCamera attach="shadow-camera" args={[-5, 5, 5, -5, 0.1, 40]} />
      </directionalLight>
      <directionalLight position={[-6, 3.5, -4.5]} intensity={0.34} color="#dfe7f2" />
      <Environment resolution={128} frames={1}>
        <color attach="background" args={["#aab2bc"]} />
        <Lightformer
          form="rect"
          intensity={3.4}
          position={[0, 6.5, 1.5]}
          rotation-x={Math.PI / 2}
          scale={[9, 5, 1]}
        />
        <Lightformer
          form="rect"
          intensity={2.0}
          position={[-6.5, 3, 2]}
          rotation-y={Math.PI / 2}
          scale={[6, 4, 1]}
        />
        <Lightformer
          form="rect"
          intensity={1.4}
          position={[6.5, 2.5, -2]}
          rotation-y={-Math.PI / 2}
          scale={[6, 4, 1]}
        />
        <Lightformer form="ring" intensity={1.1} position={[0, 3, -7]} scale={4} />
        {/* 暗底：给金属一条明确的地平线，反射里才有明暗分界 */}
        <Lightformer
          form="rect"
          color="#1d2126"
          intensity={0.16}
          position={[0, -3.2, 0]}
          rotation-x={-Math.PI / 2}
          scale={[16, 12, 1]}
        />
      </Environment>
      <SceneEnvIntensity value={1.4} />
    </>
  );
}

/** 环境反射总强度（three r163+ 的 Scene.environmentIntensity）。 */
function SceneEnvIntensity({ value }: { value: number }) {
  const scene = useThree((state) => state.scene);
  useEffect(() => {
    scene.environmentIntensity = value;
  }, [scene, value]);
  return null;
}

function StageEffects() {
  const xray = useStageStore((state) => state.views.xray);
  // 透视时物体大量重叠，AO/Bloom 意义不大且会放大混合开销；直接走默认帧缓冲。
  const localXray = useStageStore((state) => state.views.localXray);
  if (xray || localXray) return null;
  return (
    <EffectComposer multisampling={4}>
      <N8AO halfRes quality="medium" aoRadius={0.45} intensity={1.15} distanceFalloff={0.9} color="#26303c" />
      <Bloom luminanceThreshold={0.88} luminanceSmoothing={0.22} intensity={0.55} mipmapBlur />
      <Vignette offset={0.32} darkness={0.28} />
    </EffectComposer>
  );
}

function StageRuntime() {
  const modelId = useStageStore((state) => state.modelId);
  const rebuildToken = useStageStore((state) => state.rebuildToken);
  const overrides = useStageStore((state) => state.overrides);
  const views = useStageStore((state) => state.views);
  const buildIndex = useStageStore((state) => state.buildIndex);
  const selectedPart = useStageStore((state) => state.selectedPart);
  const damageSeed = useStageStore((state) => state.damageSeed);
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  const rootScene = useThree((state) => state.scene);
  const [scene, setScene] = useState<{ assembled: AssembledModel; seq: number } | null>(null);
  const seqRef = useRef(0);
  const [labelPoints, setLabelPoints] = useState<
    Array<{ id: string; name: string; position: [number, number, number] }>
  >([]);
  const [buildError, setBuildError] = useState<string | null>(null);
  // 模型「地面」：包围盒底 + 水平footprint（接触阴影与网格都锚在这里，避免
  // 阴影板切在机体中间、网格从模型腰部穿出）。
  const [stageFloor, setStageFloor] = useState<{ y: number; footprint: number } | null>(null);
  const localXrayRef = useRef<ReturnType<typeof createLocalXray> | null>(null);
  const clockRef = useRef(0);
  const realTimeRef = useRef(0);
  const lastStateRef = useRef<string | null>(null);
  const cacheRef = useRef(new Map<string, CachedBuild>());
  const currentKeyRef = useRef<string | null>(null);
  const assembled = scene?.assembled ?? null;

  // ---- 注册表 → 场景 ----
  const variantId = useStageStore((state) => state.variantId);
  useEffect(() => {
    const model = findModel(modelId);
    // 变体优先：有 variants 时用选中的那个（原型 / 机械拆解版）
    const variant = model.variants?.find((item) => item.id === variantId) ?? model.variants?.[0];
    const source = variant?.registry ?? model.registry;
    if (!source) return;
    const store = useStageStore.getState();
    const key = `${modelId}|${variantId}|${damageSeed}|${JSON.stringify(overrides)}`;
    const previousKey = currentKeyRef.current;
    const cache = cacheRef.current;
    setBuildError(null);

    const warmShaders = (target: AssembledModel) => {
      const warm = () => {
        if (useStageStore.getState().assembled !== target) return;
        gl.compileAsync(rootScene, camera).catch(() => {});
        const cached = cache.get(key);
        if (cached) cached.warmed = true;
      };
      // 在首帧/交互之后再异步预热隐藏的 FX/内部件材质，避免点动作时才编译着色器。
      if (typeof window.requestIdleCallback === "function") {
        window.requestIdleCallback(warm, { timeout: 1500 });
      } else {
        window.setTimeout(warm, 160);
      }
    };

    const mount = (
      target: AssembledModel,
      stats: { parts: number; triangles: number },
      home: { center: [number, number, number]; radius: number } | null,
      floor: { y: number; footprint: number } | null,
    ) => {
      seqRef.current += 1;
      setScene({ assembled: target, seq: seqRef.current });
      store.setStats(stats);
      // 重建/复用都保留当前构建进度（改参数不该把玩家从 L2 拉回整车）
      store.setBuildIndex(store.buildIndex);
      store.attach(target);
      if (home) {
        store.setHome(home.center, home.radius);
        setStageFloor(floor);
        if (store.preserveViewOnRebuild) {
          useStageStore.setState({ preserveViewOnRebuild: false });
        } else {
          store.requestViewReset();
        }
      }
      clockRef.current = 0;
      lastStateRef.current = null;
      currentKeyRef.current = key;
      warmShaders(target);
    };

    const cleanupFor = (target: AssembledModel) => () => {
      store.detach();
      applyXray(target, false);
      clearPose(target);
    };

    const cached = cache.get(key);
    if (cached) {
      cached.lastUsed = performance.now();
      // 复用前把上一次的姿态层清干净；cache 内保留装配几何和材质库。
      applyXray(cached.assembled, false);
      clearPose(cached.assembled);
      cached.assembled.resetNodes();
      model.animate?.(cached.assembled, 0, "idle");
      cached.assembled.root.position.set(0, 0, 0);
      cached.assembled.root.rotation.set(0, 0, 0);
      cached.assembled.root.updateMatrixWorld(true);
      mount(cached.assembled, cached.stats, cached.home, cached.floor);
      console.log(`[perf] 缓存命中 ${model.title}（${cache.size} 个模型）`);
      return cleanupFor(cached.assembled);
    }

    const registry: typeof source = {
      ...source,
      constants: { ...source.constants, ...overrides },
    };
    const errors = validateRegistry(registry).filter((issue) => issue.level === "error");
    if (errors.length > 0) {
      setBuildError(formatIssues(errors));
      useStageStore.getState().setNotice(`注册表校验未通过：${errors.length} 个错误`);
      return;
    }
    // 装配可能抛（常量拼写、kit 参数、几何自检……）。这里必须捕获：
    // effect 里抛出的异常会冒泡到 React，没有边界就是整页白屏。
    let library: ReturnType<typeof createMaterialLibrary>;
    let next: AssembledModel;
    const tMat = performance.now();
    try {
      library = createMaterialLibrary(registry.materials);
      const tBuild = performance.now();
      next = buildModel(registry, {
        builders: model.builders,
        materials: library.materials,
        instanceLayouts: variant?.layouts ?? model.layouts,
        warnMissingLayout: false,
      });
      console.log(
        `[perf] 材质库 ${Math.round(tBuild - tMat)}ms · 装配 ${Math.round(performance.now() - tBuild)}ms`,
      );
    } catch (error) {
      useStageStore.getState().reportFault(faultFromError(`装配 ${model.title}`, error));
      return;
    }
    if (model.presentationScale) next.root.scale.set(...model.presentationScale);
    next.root.traverse((object) => {
      if ((object as THREE.Mesh).isMesh) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });
    // 特效件（tags: fx）默认不可见，由动画在需要时切 visible；否则首帧会先闪一下。
    for (const handle of next.parts) {
      if (handle.def.tags?.includes("fx")) handle.object.visible = false;
    }
    let triangles = 0;
    for (const handle of next.parts) {
      const geometry = handle.geometry;
      const count = geometry.index ? geometry.index.count / 3 : geometry.getAttribute("position").count / 3;
      triangles += count * (handle.instanced ? handle.instances.length : 1);
    }
    // 全车体包围盒 → 复位视角基准 + 地面锚点（排除 fx 特效件，避免炮口焰把取景拉远）
    const bounds = new THREE.Box3();
    for (const handle of next.parts) {
      if (handle.def.tags?.includes("fx")) continue;
      bounds.union(next.partBounds(handle, new THREE.Box3()));
    }
    let home: CachedBuild["home"] = null;
    let floor: CachedBuild["floor"] = null;
    if (!bounds.isEmpty()) {
      const frame = model.framingBounds?.(next) ?? bounds;
      const center = frame.getCenter(new THREE.Vector3());
      const frameSize = frame.getSize(new THREE.Vector3());
      const size = bounds.getSize(new THREE.Vector3());
      home = {
        center: [center.x, center.y, center.z],
        radius: Math.max(frameSize.length() * 0.5, 0.5),
      };
      floor = { y: bounds.min.y, footprint: Math.max(size.x, size.z) };
    }
    const stats = { parts: next.parts.length, triangles: Math.round(triangles) };
    cache.set(key, {
      assembled: next,
      library,
      stats,
      home,
      floor,
      lastUsed: performance.now(),
      warmed: false,
    });
    // 只淘汰既不是正在显示、也不是刚装配的缓存项。
    while (cache.size > MODEL_CACHE_LIMIT) {
      let victimKey: string | null = null;
      let oldest = Infinity;
      for (const [candidateKey, entry] of cache) {
        if (candidateKey === key || candidateKey === previousKey) continue;
        if (entry.lastUsed < oldest) {
          oldest = entry.lastUsed;
          victimKey = candidateKey;
        }
      }
      if (!victimKey) break;
      const victim = cache.get(victimKey)!;
      cache.delete(victimKey);
      applyXray(victim.assembled, false);
      clearPose(victim.assembled);
      victim.assembled.dispose();
      victim.library.dispose();
      console.log(`[perf] 缓存淘汰 ${victimKey}`);
    }
    mount(next, stats, home, floor);
    return cleanupFor(next);
  }, [modelId, variantId, rebuildToken, overrides, damageSeed, gl, rootScene, camera]);

  // 组件卸载时释放所有缓存模型；模型切换时只是缓存/复用，不立即销毁。
  useEffect(() => {
    return () => {
      for (const entry of cacheRef.current.values()) {
        applyXray(entry.assembled, false);
        clearPose(entry.assembled);
        entry.assembled.dispose();
        entry.library.dispose();
      }
      cacheRef.current.clear();
      currentKeyRef.current = null;
    };
  }, []);

  // ---- 每帧纪律 ----
  // AK-47 / M249 射击模式跟随状态机（单发/连发/停机）
  const machineState = useStageStore((state) => state.machineState);
  const currentModelId = useStageStore((state) => state.modelId);
  useEffect(() => {
    const mode = machineState === "running" ? "auto" : machineState === "semi" ? "semi" : "idle";
    if (currentModelId === "ak47") setAk47Mode(mode);
    if (currentModelId === "m249") setM249Mode(mode);
    if (currentModelId === "m2hb") setM2hbMode(mode);
    if (currentModelId === "m134") setM134Mode(mode);
  }, [machineState, currentModelId]);

  useFrame((_state, delta) => {
    realTimeRef.current += Math.min(delta, 0.05);
    if (!assembled) return;
    const store = useStageStore.getState();
    const model = findModel(assembled.registry.model);
    const state = store.machineState;
    // King Joe 等多形态模型用 animatedStates 显式声明时钟推进状态；
    // 其余模型沿用主线的规则：除 idle/scanning 外都推进（悬挂/击发/受损等）。
    const running = model.animatedStates
      ? model.animatedStates.includes(state)
      : state !== "idle" && state !== "scanning";
    // 切换机器状态时重置动画时钟：击发必须从 0s 开始，悬挂演示也应从头起步。
    if (state !== lastStateRef.current) {
      lastStateRef.current = state;
      clockRef.current = 0;
    }
    if (running) {
      clockRef.current += Math.min(delta, 0.05);
    }
    assembled.resetNodes();
    // 停机时传 0：悬挂回到装配态（否则会停在上一帧的抬起位）
    model.animate?.(
      assembled,
      model.animationClock === "continuous" ? realTimeRef.current : running ? clockRef.current : 0,
      state,
    );
    // 舱盖/加油口盖是交互件：用真实帧时间平滑开合，不跟机器状态时钟走
    setArmourWet(store.views.rain);
    if (store.modelId === "tiger") {
      applyTigerLidPose(assembled, state, store.lidOverrides, delta);
      const wiper = store.views.rain ? assembled.getNode("VisorWiper") : null;
      if (wiper) wiper.rotation.x = 0.05 + 0.5 * (0.5 - 0.5 * Math.cos(realTimeRef.current * 2.6));
    }
    assembled.syncInstances();
    const motionParts = motionPartsOf(model);
    // 每帧都要给爆炸姿态一个目标值：关掉爆炸时必须回 0，否则模型会停在半爆炸态
    applyExplode(assembled, store.views.explode ? 1 : 0, motionParts);
    if (model.detachOffset) {
      applyDetach(assembled, store.detached, {
        motionParts,
        offsetOf: model.detachOffset,
      });
    }
    assembled.root.updateMatrixWorld(true);
    localXrayRef.current?.update(camera, gl);
  });
  const selectedXray = useMemo(() => {
    const part = selectedPart ? assembled?.getPart(selectedPart) : undefined;
    return !views.localXray && !!part && isInternalPart(modelId, part);
  }, [assembled, selectedPart, modelId, views.localXray]);
  // ---- 透视 / 战损 / 高亮 ----
  useEffect(() => {
    if (!assembled) return;
    applyHighlight(assembled, null, null);
    // 外壳才做幽灵壳；内部件保持不透明，避免近千层透明混合。
    // 选中内部件时自动幽灵化外壳，保证从零件树聚焦内部件时能看见。
    applyXray(
      assembled,
      !views.internalsOnly && !views.localXray && (views.xray || selectedXray),
      (handle) => !isInternalPart(modelId, handle) || isXrayShellPart(modelId, handle),
    );
    const lens =
      views.localXray && modelId === "kingjoemodules"
        ? createLocalXray(
            assembled.parts.filter((part) => !isInternalPart(modelId, part)).map((part) => part.object),
            gl.domElement,
          )
        : null;
    localXrayRef.current = lens;
    return () => {
      applyHighlight(assembled, null, null);
      lens?.dispose();
      if (localXrayRef.current === lens) localXrayRef.current = null;
      applyXray(assembled, false);
    };
  }, [assembled, views.xray, views.localXray, views.internalsOnly, modelId, selectedXray, gl]);

  const damage = useStageStore((state) => state.damage);
  useEffect(() => {
    if (!assembled) return;
    applyDamage(assembled, damage);
  }, [assembled, damage]);

  const selectedInstance = useStageStore((state) => state.selectedInstance);
  const hoveredPart = useStageStore((state) => state.hoveredPart);
  const hoveredInstance = useStageStore((state) => state.hoveredInstance);
  useEffect(() => {
    if (!assembled) return;
    applyHighlight(
      assembled,
      selectedPart,
      views.localXray ? null : hoveredPart,
      selectedInstance,
      hoveredInstance,
    );
  }, [
    assembled,
    selectedPart,
    selectedInstance,
    hoveredPart,
    hoveredInstance,
    views.localXray,
    views.xray,
    views.internalsOnly,
  ]);

  // ---- 总成标签 ----
  useEffect(() => {
    if (!assembled || !views.labels) {
      setLabelPoints([]);
      return;
    }
    const box = new THREE.Box3();
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    const points: Array<{ id: string; name: string; position: [number, number, number] }> = [];
    for (const assembly of assembled.registry.assemblies) {
      box.makeEmpty();
      for (const handle of assembled.partsByAssembly.get(assembly.id) ?? []) {
        if (!handle.object.visible) continue;
        box.union(assembled.partBounds(handle, new THREE.Box3()));
      }
      if (box.isEmpty()) continue;
      box.getCenter(center);
      box.getSize(size);
      points.push({
        id: assembly.id,
        name: assembly.name_cn,
        position: [center.x, center.y + size.y * 0.5 + 0.12, center.z],
      });
    }
    setLabelPoints(points);
  }, [assembled, views.labels, rebuildToken]);

  const hoverPart = useStageStore((state) => state.hoverPart);

  const pickPart = (partId: string, instance: number | null) => {
    const store = useStageStore.getState();
    store.selectPart(partId, instance);
    const lid = lidAt(partId, instance);
    if (!lid) return;
    const open = effectiveLidOpen(lid, store.lidOverrides, store.machineState);
    store.setLidOpen(lid.key, !open);
  };

  // ---- 渲染剔除：外部视角不画装甲内部件；透视/爆炸/构建回放/选中内部件时显示 ----
  useEffect(() => {
    if (!assembled) return;
    const selectedHandle = selectedPart ? assembled.getPart(selectedPart) : undefined;
    const selectedInternal = selectedHandle ? isInternalPart(modelId, selectedHandle) : false;
    const showInternals =
      views.xray ||
      views.localXray ||
      views.explode ||
      buildIndex < buildOrdersOf(modelId).length ||
      selectedInternal;
    camera.layers.enable(0);
    camera.layers.disable(2);
    applyInternalVisibility(modelId, assembled, showInternals, views.internalsOnly);
  }, [
    assembled,
    modelId,
    camera,
    views.xray,
    views.localXray,
    views.internalsOnly,
    views.explode,
    buildIndex,
    selectedPart,
  ]);

  // QA 钩子：开发模式或 ?qa=1 时暴露只读场景引用，用于自动化截图/录屏/相机机位。
  const three = useThree();
  useEffect(() => {
    const qa = import.meta.env.DEV || new URLSearchParams(window.location.search).has("qa");
    if (!qa) return;
    (window as unknown as { __stage?: unknown }).__stage = {
      store: useStageStore,
      assembled,
      scene: three.scene,
      camera: three.camera,
      controls: three.controls,
      gl: three.gl,
      setCamera: (position: [number, number, number], target: [number, number, number]) => {
        three.camera.position.set(...position);
        const controls = three.controls as { target?: THREE.Vector3; update?: () => void } | null;
        if (controls?.target) controls.target.set(...target);
        controls?.update?.();
        three.camera.lookAt(new THREE.Vector3(...target));
      },
    };
  }, [assembled, three]);

  if (!assembled && !buildError) return null;

  return (
    <>
      {views.grid ? (
        <Grid
          position={[0, (stageFloor?.y ?? 0) - 0.004, 0]}
          args={[40, 40]}
          cellSize={0.25}
          cellThickness={0.5}
          cellColor="#d3d9e1"
          sectionSize={1}
          sectionThickness={1}
          sectionColor="#bcc4cf"
          fadeDistance={26}
          fadeStrength={1.2}
          followCamera={false}
          raycast={() => null}
        />
      ) : null}
      <Weather assembled={assembled} />
      {assembled ? (
        <AssembledObject
          key={`assembled:${scene?.seq ?? 0}`}
          assembled={assembled}
          onSelect={pickPart}
          onHover={hoverPart}
          onFocus={(partId) => useStageStore.getState().requestFocus(partId)}
        />
      ) : null}
      {assembled && views.shadow ? (
        <ContactShadow
          key={`shadow:${scene?.seq ?? 0}`}
          y={(stageFloor?.y ?? 0) - 0.004}
          scale={Math.max((stageFloor?.footprint ?? 1.2) * 2, 2.4)}
        />
      ) : null}
      {labelPoints.map((point) => (
        <Html
          key={point.id}
          position={point.position}
          center
          zIndexRange={[20, 0]}
          style={{ pointerEvents: "none" }}
        >
          <div className="scene-label">{point.name}</div>
        </Html>
      ))}
      {buildError ? (
        <Html position={[0, 1.2, 0]} center>
          <div className="scene-error">
            <strong>注册表校验未通过</strong>
            <pre>{buildError}</pre>
          </div>
        </Html>
      ) : null}
    </>
  );
}

/** 装配体对象：object 每份装配体唯一，key 变化时整体重挂（R3F 的 primitive 不会替换 object）。 */
function AssembledObject({
  assembled,
  onSelect,
  onHover,
  onFocus,
}: {
  assembled: AssembledModel;
  onSelect: (partId: string, instance: number | null) => void;
  onHover: (partId: string | null, instance: number | null) => void;
  onFocus: (partId: string) => void;
}) {
  useEffect(() => {
    return () => {
      document.body.style.cursor = "";
    };
  }, []);

  return (
    <primitive
      object={assembled.root}
      onPointerOver={(event: ThreeEvent<PointerEvent>) => {
        event.stopPropagation();
        const partId = event.object.name;
        if (!partId) return;
        onHover(partId, event.instanceId ?? null);
        document.body.style.cursor = lidAt(partId, event.instanceId) ? "pointer" : "";
      }}
      onPointerOut={() => {
        onHover(null, null);
        document.body.style.cursor = "";
      }}
      onClick={(event: ThreeEvent<MouseEvent>) => {
        event.stopPropagation();
        if (event.delta > 6) return;
        const partId = event.object.name;
        if (partId) onSelect(partId, event.instanceId ?? null);
      }}
      onDoubleClick={(event: ThreeEvent<MouseEvent>) => {
        event.stopPropagation();
        if (event.delta > 6) return;
        const partId = event.object.name;
        if (!partId || lidAt(partId, event.instanceId)) return;
        onFocus(partId);
      }}
    />
  );
}

/** 接地阴影（软 AO 贴地）：锚在模型包围盒底（stageFloor），重建时重新烘焙两帧。 */
function ContactShadow({ y, scale }: { y: number; scale: number }) {
  return (
    <ContactShadows
      position={[0, y, 0]}
      opacity={0.42}
      scale={scale}
      blur={2.4}
      far={4}
      frames={2}
      resolution={256}
    />
  );
}

/** 相机聚焦：零件树 / 穿模报告点击 → 平滑飞行；重置视角 → 回到初始方位。
 *  第一人称（潜望镜）时接管相机：关掉 OrbitControls，眼点由 viewpoints 从零件包围盒派生；
 *  退出时先记住的自由视角原路飞回，不把人甩到别的方位。 */
function CameraRig() {
  const camera = useThree((state) => state.camera);
  const controls = useThree((state) => state.controls) as
    { target: THREE.Vector3; update: () => void; enabled: boolean } | null | undefined;
  const focus = useStageStore((state) => state.focus);
  const cameraMode = useStageStore((state) => state.cameraMode);
  const assembled = useStageStore((state) => state.assembled);
  const flight = useRef<{
    fromPosition: THREE.Vector3;
    toPosition: THREE.Vector3;
    fromTarget: THREE.Vector3;
    toTarget: THREE.Vector3;
    fromFov: number;
    toFov: number;
    duration: number;
    elapsed: number;
  } | null>(null);
  /** 进入第一人称前的自由视角（退出时飞回来）。 */
  const savedView = useRef<{
    position: THREE.Vector3;
    target: THREE.Vector3;
    fov: number;
  } | null>(null);
  const previousMode = useRef<CameraMode>("orbit");
  /** 第一人称视线目标（平滑用）。 */
  const lookTarget = useRef(new THREE.Vector3(0, 0.8, 0));
  const perspective = camera as THREE.PerspectiveCamera;

  // 模式切换：进第一人称存下自由视角并交出控制权；回自由视角把相机交还 OrbitControls。
  useEffect(() => {
    if (!controls) return;
    const entering = cameraMode !== "orbit" && previousMode.current === "orbit";
    const leaving = cameraMode === "orbit" && previousMode.current !== "orbit";
    if (entering) {
      savedView.current = {
        position: camera.position.clone(),
        target: controls.target.clone(),
        fov: perspective.fov,
      };
      flight.current = null;
      controls.enabled = false;
      // 视线目标从当前朝向前方 1m 起算，避免进第一人称时先甩一下
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
      lookTarget.current.copy(camera.position).addScaledVector(forward, 1);
    } else if (leaving) {
      const back = savedView.current;
      controls.enabled = true;
      // target 先接到当前视线，避免 OrbitControls 接管瞬间把镜头拉向旧目标
      controls.target.copy(lookTarget.current);
      if (back) {
        flight.current = {
          fromPosition: camera.position.clone(),
          toPosition: back.position.clone(),
          fromTarget: controls.target.clone(),
          toTarget: back.target.clone(),
          fromFov: perspective.fov,
          toFov: back.fov,
          duration: 0.6,
          elapsed: 0,
        };
      }
      savedView.current = null;
    }
    previousMode.current = cameraMode;
  }, [cameraMode, camera, controls, perspective]);

  useEffect(() => {
    if (!focus || !controls || cameraMode !== "orbit") return;
    const target = new THREE.Vector3(focus.center[0], focus.center[1], focus.center[2]);
    const currentTarget = controls.target.clone();
    const direction = focus.resetAngle
      ? HOME_DIRECTION.clone()
      : new THREE.Vector3().subVectors(camera.position, currentTarget);
    if (direction.lengthSq() < 1e-8) direction.copy(HOME_DIRECTION);
    direction.normalize();
    const fov = (camera as THREE.PerspectiveCamera).fov ?? 34;
    // 1.15 ≈ 让包围球填满 ~85% 视锥（1.65 会把整机拉得又小又远，像展示柜角落里的玩具）
    const distance = Math.max(0.35, (focus.radius * 1.15) / Math.tan(THREE.MathUtils.degToRad(fov / 2)));
    flight.current = {
      fromPosition: camera.position.clone(),
      toPosition: target.clone().addScaledVector(direction, distance),
      fromTarget: currentTarget,
      toTarget: target,
      fromFov: fov,
      toFov: fov,
      duration: 0.55,
      elapsed: 0,
    };
  }, [focus, camera, controls, cameraMode]);

  useFrame((_state, delta) => {
    // —— 第一人称：眼点由零件包围盒派生（已是世界空间），窄视场，平滑跟随 ——
    const view = firstPersonView(cameraMode, assembled);
    if (view) {
      const k = 1 - Math.exp(-12 * delta);
      camera.position.lerp(view.position, k);
      lookTarget.current.lerp(view.target, k);
      if (Math.abs(perspective.fov - view.fov) > 1e-3) {
        perspective.fov += (view.fov - perspective.fov) * k;
        perspective.updateProjectionMatrix();
      }
      camera.lookAt(lookTarget.current);
      return;
    }

    const current = flight.current;
    if (!current || !controls) return;
    current.elapsed += delta;
    const t = Math.min(1, current.elapsed / current.duration);
    const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    camera.position.lerpVectors(current.fromPosition, current.toPosition, eased);
    controls.target.lerpVectors(current.fromTarget, current.toTarget, eased);
    if (Math.abs(current.toFov - perspective.fov) > 1e-3) {
      perspective.fov = current.fromFov + (current.toFov - current.fromFov) * eased;
      perspective.updateProjectionMatrix();
    }
    camera.lookAt(controls.target);
    controls.update();
    if (t >= 1) flight.current = null;
  });

  const target = useMemo(() => new THREE.Vector3(0, 0.8, 0), []);
  return (
    <OrbitControls
      makeDefault
      target={target}
      enableDamping
      dampingFactor={0.12}
      minDistance={0.5}
      maxDistance={40}
    />
  );
}
