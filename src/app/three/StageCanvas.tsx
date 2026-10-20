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
import { faultFromError, useStageStore } from "../state/stageStore";
import { applyDamage, applyDetach, applyExplode, applyHighlight, applyXray, clearPose } from "./pose";
import { TigerVfx } from "./vfx/TigerVfx";
import { applyTigerLidPose, effectiveLidOpen, lidAt } from "@/three/parts/models/tiger/lids";

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

export function StageCanvas() {
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: [4.6, 3.4, 5.2], fov: 34, near: 0.05, far: 200 }}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
    >
      <color attach="background" args={["#e9ecf0"]} />
      <Studio />
      <StageRuntime />
      <TigerVfx />
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
        intensity={1.7}
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0006}
        shadow-normalBias={0.012}
      >
        <orthographicCamera attach="shadow-camera" args={[-5, 5, 5, -5, 0.1, 40]} />
      </directionalLight>
      <directionalLight position={[-6, 3.5, -4.5]} intensity={0.34} color="#dfe7f2" />
      <Environment resolution={256} frames={1}>
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
      <SceneEnvIntensity value={1.15} />
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
  const [scene, setScene] = useState<{ assembled: AssembledModel; seq: number } | null>(null);
  const seqRef = useRef(0);
  const [labelPoints, setLabelPoints] = useState<
    Array<{ id: string; name: string; position: [number, number, number] }>
  >([]);
  const [buildError, setBuildError] = useState<string | null>(null);
  // 模型「地面」：包围盒底 + 水平footprint（接触阴影与网格都锚在这里，避免
  // 阴影板切在机体中间、网格从模型腰部穿出）。
  const [stageFloor, setStageFloor] = useState<{ y: number; footprint: number } | null>(null);
  const clockRef = useRef(0);
  const lastStateRef = useRef<string | null>(null);
  const assembled = scene?.assembled ?? null;

  // ---- 注册表 → 场景 ----
  useEffect(() => {
    const model = findModel(modelId);
    if (!model.registry) return;
    const registry: typeof model.registry = {
      ...model.registry,
      constants: { ...model.registry.constants, ...overrides },
    };
    const errors = validateRegistry(registry).filter((issue) => issue.level === "error");
    if (errors.length > 0) {
      setBuildError(formatIssues(errors));
      useStageStore.getState().setNotice(`注册表校验未通过：${errors.length} 个错误`);
      return;
    }
    setBuildError(null);
    // 装配可能抛（常量拼写、kit 参数、几何自检……）。这里必须捕获：
    // effect 里抛出的异常会冒泡到 React，没有边界就是整页白屏。
    let library: ReturnType<typeof createMaterialLibrary>;
    let next: AssembledModel;
    try {
      library = createMaterialLibrary(registry.materials);
      next = buildModel(registry, {
        builders: model.builders,
        materials: library.materials,
        instanceLayouts: model.layouts,
        warnMissingLayout: false,
      });
    } catch (error) {
      useStageStore.getState().reportFault(faultFromError(`装配 ${model.title}`, error));
      return;
    }
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
    const store = useStageStore.getState();
    seqRef.current += 1;
    setScene({ assembled: next, seq: seqRef.current });
    store.setStats({ parts: next.parts.length, triangles: Math.round(triangles) });
    // 重建时保留当前构建进度（改参数不该把玩家从 L2 拉回整车）
    store.setBuildIndex(store.buildIndex);
    store.attach(next);
    // 全车体包围盒 → 复位视角基准 + 地面锚点（排除 fx 特效件，避免炮口焰把取景拉远）
    const bounds = new THREE.Box3();
    for (const handle of next.parts) {
      if (handle.def.tags?.includes("fx")) continue;
      bounds.union(next.partBounds(handle, new THREE.Box3()));
    }
    if (!bounds.isEmpty()) {
      const center = bounds.getCenter(new THREE.Vector3());
      const size = bounds.getSize(new THREE.Vector3());
      store.setHome([center.x, center.y, center.z], Math.max(size.length() * 0.5, 0.5));
      setStageFloor({ y: bounds.min.y, footprint: Math.max(size.x, size.z) });
      if (store.preserveViewOnRebuild) {
        useStageStore.setState({ preserveViewOnRebuild: false });
      } else {
        store.requestViewReset();
      }
    }
    clockRef.current = 0;

    return () => {
      // React 会先卸载子节点（<primitive>）再执行本清理，所以这里释放是安全的。
      // 注意：释放必须放在「构建 effect」而不是子组件的 effect 里 —— StrictMode 会
      // 双调用子组件 effect，那样会把正在使用的模型误释放（场景里只剩空 Group）。
      store.detach();
      clearPose(next);
      next.dispose();
      library.dispose();
    };
  }, [modelId, rebuildToken, overrides]);

  // ---- 每帧纪律 ----
  useFrame((_state, delta) => {
    if (!assembled) return;
    const store = useStageStore.getState();
    const model = findModel(store.modelId);
    const state = store.machineState;
    const running =
      state === "running" ||
      state === "driving" ||
      state === "firing" ||
      state === "mg_firing" ||
      state === "aiming" ||
      state === "refuel" ||
      state === "engine_start" ||
      state === "burning" ||
      state === "detonation" ||
      state === "hit_light" ||
      state === "hit_heavy" ||
      state === "hit_oblique" ||
      state === "hit_ricochet";
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
    model.animate?.(assembled, running ? clockRef.current : 0, state);
    // 舱盖/加油口盖是交互件：用真实帧时间平滑开合，不跟机器状态时钟走
    if (store.modelId === "tiger") {
      applyTigerLidPose(assembled, state, store.lidOverrides, delta);
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
  });
  // ---- 透视 / 战损 / 高亮 ----
  useEffect(() => {
    if (!assembled) return;
    applyXray(assembled, views.xray);
  }, [assembled, views.xray]);

  const damage = useStageStore((state) => state.damage);
  useEffect(() => {
    if (!assembled) return;
    applyDamage(assembled, damage);
  }, [assembled, damage]);

  const selectedPart = useStageStore((state) => state.selectedPart);
  const selectedInstance = useStageStore((state) => state.selectedInstance);
  const hoveredPart = useStageStore((state) => state.hoveredPart);
  const hoveredInstance = useStageStore((state) => state.hoveredInstance);
  useEffect(() => {
    if (!assembled) return;
    applyHighlight(assembled, selectedPart, hoveredPart, selectedInstance, hoveredInstance);
  }, [assembled, selectedPart, selectedInstance, hoveredPart, hoveredInstance]);

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

  // 开发期自检钩子（QA 截图 / 控制台调试；生产构建不写）
  const three = useThree();
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as { __stage?: unknown }).__stage = {
      store: useStageStore,
      assembled,
      scene: three.scene,
      camera: three.camera,
      controls: three.controls,
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
      resolution={512}
    />
  );
}

/** 相机聚焦：零件树 / 穿模报告点击 → 平滑飞行；重置视角 → 回到初始方位。 */
function CameraRig() {
  const camera = useThree((state) => state.camera);
  const controls = useThree((state) => state.controls) as
    { target: THREE.Vector3; update: () => void } | null | undefined;
  const focus = useStageStore((state) => state.focus);
  const flight = useRef<{
    fromPosition: THREE.Vector3;
    toPosition: THREE.Vector3;
    fromTarget: THREE.Vector3;
    toTarget: THREE.Vector3;
    duration: number;
    elapsed: number;
  } | null>(null);

  useEffect(() => {
    if (!focus || !controls) return;
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
      duration: 0.55,
      elapsed: 0,
    };
  }, [focus, camera, controls]);

  useFrame((_state, delta) => {
    const current = flight.current;
    if (!current || !controls) return;
    current.elapsed += delta;
    const t = Math.min(1, current.elapsed / current.duration);
    const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    camera.position.lerpVectors(current.fromPosition, current.toPosition, eased);
    controls.target.lerpVectors(current.fromTarget, current.toTarget, eased);
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
