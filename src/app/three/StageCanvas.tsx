import { ContactShadows, Environment, Grid, Html, OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { RectAreaLightUniformsLib } from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";
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
import { Weather } from "./Weather";
import { setArmourWet } from "@/three/parts/kernel/armourSurface";
import { TigerVfx } from "./vfx/TigerVfx";
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

export function StageCanvas() {
  return (
    <Canvas
      shadows
      dpr={[1, 1.5]}
      camera={{ position: [4.6, 3.4, 5.2], fov: 34, near: 0.05, far: 200 }}
      gl={{
        antialias: true,
        toneMapping: THREE.ACESFilmicToneMapping,
        // QA 时允许 canvas.toDataURL() 直接读像素，绕开 headless 合成器的残影。
        preserveDrawingBuffer: qaNoFx,
      }}
      onCreated={({ gl }) => {
        // 摄影棚 HDRI 本身亮度很高；ACES + 1.0 曝光会把烤蓝钢压成纯白。
        gl.toneMappingExposure = 0.9;
      }}
    >
      <color attach="background" args={["#dce0e6"]} />
      <Suspense fallback={null}>
        <Studio />
      </Suspense>
      <StageRuntime />
      <TigerVfx />
      <CameraRig />
      {!qaNoFx && <StageEffects />}
    </Canvas>
  );
}

/** Studio 环境：真实 HDRI 环境反射 + 定向硬光/阴影。
 *
 *  金属的识别度来自「它反射到了什么」。程序化 Lightformer 只能给几块纯色
 *  亮斑，反射在枪管上仍像塑料；这里换成 Poly Haven 的 CC0 摄影棚 HDRI
 *  （studio_small_08_1k.hdr），柔光箱、暗部、地面明暗分界都是真实拍摄的，
 *  金属表面才能出现连续、带方向的高光。定向光只负责阴影和轮廓，不负责
 *  主导反射。 */
function Studio() {
  return (
    <>
      <ambientLight intensity={0.1} />
      <directionalLight
        castShadow
        position={[5.5, 8.5, 4.5]}
        intensity={1.0}
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0005}
        shadow-normalBias={0.01}
      >
        <orthographicCamera attach="shadow-camera" args={[-5, 5, 5, -5, 0.1, 40]} />
      </directionalLight>
      <directionalLight position={[-6, 3.5, -4.5]} intensity={0.25} color="#dfe7f2" />
      {/* 右前方补光：机匣观察窗/抛壳窗内部在主光背面，纯 PBR 金属会黑成一片。
          这盏无阴影点光模拟展示台的低强度补光，让枪机、闭锁面读得出来。 */}
      <pointLight position={[1.35, 0.95, 0.75]} intensity={2.0} distance={3.2} decay={2} color="#e8eef8" />
      {/* 顶部柔光箱：金属机匣/机盖顶面在 HDRI 顶部是暗区，纯 metalness=1 时
          会黑成一片，弧形机盖的拱面和冲压折边读不出来。用大面积 RectAreaLight
          模拟摄影棚顶灯，只加宽而柔和的高光，不制造点状爆白。 */}
      <TopFill />
      <Environment
        files="/hdr/studio_small_08_1k.hdr"
        background={false}
        environmentIntensity={1.1}
        environmentRotation={[0, 0.42, 0]}
      />
      <SceneEnvIntensity value={1.1} />
    </>
  );
}

/** 顶部大面积柔光：让机匣/机盖顶面的金属高光连续，而不是黑成一片。 */
function TopFill() {
  const scene = useThree((state) => state.scene);
  useEffect(() => {
    RectAreaLightUniformsLib.init();
    const light = new THREE.RectAreaLight(0xf3f6ff, 1.1, 1.25, 0.8);
    light.name = "stage-top-fill";
    light.position.set(0, 1.45, 0.35);
    light.lookAt(0, 0.18, 0);
    scene.add(light);
    return () => {
      scene.remove(light);
      light.dispose();
    };
  }, [scene]);
  return null;
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
      <Bloom luminanceThreshold={0.95} luminanceSmoothing={0.25} intensity={0.3} mipmapBlur />
      <Vignette offset={0.32} darkness={0.28} />
    </EffectComposer>
  );
}

/** QA 截图开关：?qa-nofx=1 时跳过 Bloom/Vignette，避免 SwiftShader 后处理把
 *  截图合成成残影；正式展示不带这个参数，效果不变。 */
const qaNoFx =
  import.meta.env.DEV &&
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).has("qa-nofx");

function StageRuntime() {
  const modelId = useStageStore((state) => state.modelId);
  const rebuildToken = useStageStore((state) => state.rebuildToken);
  const worn = useStageStore((state) => state.worn);
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
  const realTimeRef = useRef(0);
  const lastStateRef = useRef<string | null>(null);
  const assembled = scene?.assembled ?? null;

  // ---- 注册表 → 场景 ----
  const variantId = useStageStore((state) => state.variantId);
  useEffect(() => {
    const model = findModel(modelId);
    // 变体优先：有 variants 时用选中的那个（原型 / 机械拆解版）
    const variant = model.variants?.find((item) => item.id === variantId) ?? model.variants?.[0];
    const source = variant?.registry ?? model.registry;
    if (!source) return;
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
    setBuildError(null);
    // 装配可能抛（常量拼写、kit 参数、几何自检……）。这里必须捕获：
    // effect 里抛出的异常会冒泡到 React，没有边界就是整页白屏。
    let library: ReturnType<typeof createMaterialLibrary>;
    let next: AssembledModel;
    const tMat = performance.now();
    try {
      library = createMaterialLibrary(registry.materials);
      if (worn) {
        for (const material of Object.values(library.materials)) {
          material.color.multiplyScalar(0.55);
          material.roughness = Math.min(1, material.roughness + 0.18);
          material.envMapIntensity = Math.max(0.4, material.envMapIntensity - 0.6);
        }
      }
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
  }, [modelId, variantId, rebuildToken, overrides, worn]);

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
    const model = findModel(store.modelId);
    const state = store.machineState;
    // running = 机构运转中（连发/单发演示都推进时钟；idle/scanning 传 0 回装配态）
    const running = state !== "idle" && state !== "scanning";
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
      // 当前目录项本体：QA 可在控制台替换 animate() 把机构钉在指定相位，
      // 不必依赖动态 import（HMR 会生成第二份模块实例，改了不生效）。
      // 用 getter：切模型时 assembled 可能被复用，effect 不重跑，直接读会永远停在 test。
      get model() {
        return findModel(useStageStore.getState().modelId);
      },
      assembled,
      scene: three.scene,
      camera: three.camera,
      controls: three.controls,
      gl: three.gl,
    };
  }, [assembled, three]);

  // M134 观察窗检查灯：只在加特林右前方补一点无阴影白光，让 6 套枪机的
  // 圆柱面/闭锁凸笋在深色机匣里读得出来。命令式挂到 scene 上，跟随模型
  // 切换增删；不用 JSX 灯是为了避开装配体重建时的场景清理。
  useEffect(() => {
    if (modelId !== "m134") return;
    const light = new THREE.PointLight(0xeef2f8, 0.8, 0.9, 2);
    light.name = "m134-inspection-light";
    light.position.set(0.4, 0.43, -0.06);
    three.scene.add(light);
    return () => {
      three.scene.remove(light);
      light.dispose();
    };
  }, [modelId, three.scene]);

  // AK / RPK 抛壳窗检查灯：从右前方补一点冷白光，照进加长后的抛壳窗，
  // 让枪机框圆柱面、拉机柄和回转枪机头在深色机匣里读得出来。
  useEffect(() => {
    if (modelId !== "ak47" && modelId !== "rpk") return;
    // 用面光源而不是点光：点光在抛壳窗旁边的烤蓝钢板上打出一个白点，
    // 面光在平板上形成柔和的长方形柔光箱反射，枪机框圆柱面也能读出圆度。
    RectAreaLightUniformsLib.init();
    const light = new THREE.RectAreaLight(0xeef3ff, 1.05, 0.34, 0.14);
    light.name = "ak-inspection-light";
    light.position.set(0.16, 0.30, -0.07);
    light.lookAt(0, 0.30, -0.07);
    three.scene.add(light);
    return () => {
      three.scene.remove(light);
      light.dispose();
    };
  }, [modelId, three.scene]);

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
