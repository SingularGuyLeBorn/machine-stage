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
import { buildOrdersOf, faultFromError, useStageStore } from "../state/stageStore";
import { applyDamage, applyDetach, applyExplode, applyHighlight, applyXray, clearPose } from "./pose";
import { applyInternalVisibility, isInternalPart, isXrayShellPart } from "./internal";
import { createLocalXray } from "./localXray";
import { Weather } from "./Weather";
import { setArmourWet } from "@/three/parts/kernel/armourSurface";
import { TigerVfx } from "./vfx/TigerVfx";
import { MbtVfx } from "./vfx/MbtVfx";
import { Type055Vfx } from "./vfx/Type055Vfx";
import { BridgeSkybox, CommandExterior, CommandScreens } from "./vfx/CommandScreens";
import { applyTigerLidPose, effectiveLidOpen, lidAt } from "@/three/parts/models/tiger/lids";
import { firstPersonView, type CameraMode, isCarrierInteriorMode } from "./viewpoints";
import { WalkGate } from "./WalkController";
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
// 光照为 HDRI 摄影棚环境（Poly Haven CC0）+ ACES + Bloom，HDR 资产在 public/hdr。
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

const originalRaycasts = new WeakMap<THREE.Object3D, THREE.Object3D["raycast"]>();
function setPickable(object: THREE.Object3D, pickable: boolean): void {
  if (pickable) {
    const original = originalRaycasts.get(object);
    if (original) object.raycast = original;
  } else if (!originalRaycasts.has(object)) {
    originalRaycasts.set(object, object.raycast);
    object.raycast = () => {};
  }
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
  const heavy = useStageStore((state) => state.modelId === "carrier");
  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <Canvas
        shadows
        dpr={heavy ? [0.9, 1.1] : [1, 1.5]}
        camera={{ position: [4.6, 3.4, 5.2], fov: 34, near: 0.05, far: 4000 }}
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
        <color attach="background" args={["#e9ecf0"]} />
        <Suspense fallback={null}>
          <Studio />
        </Suspense>
        <StageFog />
        <StageRuntime />
        <TigerVfx />
        <MbtVfx />
        <Type055Vfx />
        <CommandScreens />
        <CommandExterior />
        <BridgeSkybox />
        <CameraRig />
        <WalkGate />
        <CarrierCameraFloor />
        {!qaNoFx && <StageEffects />}
      </Canvas>
      <WarmupOverlay />
    </div>
  );
}

/** 重模型加载提示：装配与着色器编译期间用 DOM 层盖住画面，避免低端 GPU 看起来像卡死/黑屏。 */
function WarmupOverlay() {
  const assembling = useStageStore((state) => state.assembling);
  const warming = useStageStore((state) => state.shaderWarming);
  const heavy = useStageStore((state) => state.modelId === "carrier");
  if (!assembling && !warming) return null;
  const title = assembling ? "正在装配模型…" : "舰体着色器编译中…";
  const hint = assembling
    ? heavy
      ? "福建舰 5 千余件 / 300 万三角面 · 首次切换要数秒，完成后自动进入"
      : "正在构建零件几何，请稍候"
    : "首次加载 300 万三角面，低端 GPU 需要数秒";
  return (
    <div
      className="stage-loading"
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 6,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(12, 20, 28, 0.34)",
        color: "#eef6fb",
        font: "500 14px/1.6 'Microsoft YaHei', sans-serif",
        letterSpacing: "0.05em",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          padding: "14px 22px",
          borderRadius: 10,
          border: "1px solid rgba(160, 200, 220, 0.28)",
          background: "rgba(8, 16, 22, 0.72)",
          boxShadow: "0 10px 30px rgba(0,0,0,0.3)",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 15, marginBottom: 4 }}>{title}</div>
        <div style={{ opacity: 0.7, fontSize: 12 }}>{hint}</div>
      </div>
    </div>
  );
}

/** 座舱第一人称：隐藏座舱盖玻璃，避免从内部看到一整面反射罩。 */
function CockpitCanopyVisibility() {
  const assembled = useStageStore((state) => state.assembled);
  const cameraMode = useStageStore((state) => state.cameraMode);
  useEffect(() => {
    const canopy = assembled?.getPart("carrier.aircraft.canopy");
    if (!canopy) return;
    canopy.object.visible = cameraMode !== "cockpit";
    return () => {
      canopy.object.visible = true;
    };
  }, [assembled, cameraMode]);
  return null;
}

function InteriorFillLight() {
  const cameraMode = useStageStore((state) => state.cameraMode);
  const modelId = useStageStore((state) => state.modelId);
  if (!isCarrierInteriorMode(cameraMode)) return null;
  // 舱内是封闭空间，主光/HDRI 被围壁遮挡；进入内部视角时补一层柔和环境光。
  // 机舱里还有大量金属转子，单靠环境光会发黑，再补一盏舱顶点光。
  return (
    <>
      <ambientLight
        intensity={cameraMode === "engine_room" ? 0.85 : cameraMode === "bridge" || cameraMode === "cic" ? 0.5 : 1.05}
        color="#eaf5ff"
      />
      {cameraMode === "engine_room" ? (
        <>
          <pointLight position={[0, 9.2, -34]} intensity={2.3} distance={24} decay={1.35} color="#dbe9f5" />
          <pointLight position={[-6.2, 8.1, -27]} intensity={1.6} distance={12} decay={1.3} color="#e6f1fa" />
          <pointLight position={[-4.2, 8.1, -35]} intensity={1.4} distance={12} decay={1.3} color="#e6f1fa" />
          <pointLight position={[5.2, 8.1, -40]} intensity={1.4} distance={12} decay={1.3} color="#e6f1fa" />
        </>
      ) : null}
      {cameraMode === "cic" ? (
        modelId === "carrier" ? (
          <>
            <pointLight position={[24.9, 41.6, -36.0]} intensity={2.4} distance={9} decay={1.35} color="#d4e2ea" />
            <pointLight position={[24.9, 41.6, -42.0]} intensity={2.1} distance={9} decay={1.35} color="#d4e2ea" />
            <pointLight position={[24.9, 41.2, -34.6]} intensity={1.4} distance={6} decay={1.45} color="#5ed6d6" />
          </>
        ) : (
          <>
            <pointLight position={[0, 20.75, 13.5]} intensity={1.8} distance={11} decay={1.35} color="#c7dee8" />
            <pointLight position={[0, 20.75, 21.5]} intensity={1.6} distance={11} decay={1.35} color="#c7dee8" />
            <pointLight position={[0, 20.4, 26.3]} intensity={1.2} distance={7} decay={1.45} color="#5ed6d6" />
            <pointLight position={[0, 19.4, 10.5]} intensity={0.7} distance={8} decay={1.5} color="#4f8f9f" />
          </>
        )
      ) : null}
      {cameraMode === "crew" || cameraMode === "crew_berth" || cameraMode === "crew_mess" ? (
        modelId === "carrier" ? (
          <>
            <pointLight position={[0, 13.3, 63]} intensity={2.0} distance={10} decay={1.35} color="#e8dfcf" />
            <pointLight position={[-4.2, 13.0, 42]} intensity={1.7} distance={8} decay={1.4} color="#d9e4e8" />
            <pointLight position={[-4.2, 13.0, 58]} intensity={1.7} distance={8} decay={1.4} color="#e8dfcf" />
            <pointLight position={[-4.2, 13.0, 78]} intensity={1.6} distance={8} decay={1.4} color="#d9e4e8" />
            <pointLight position={[4.2, 13.0, 40]} intensity={1.8} distance={8} decay={1.4} color="#e8dfcf" />
            <pointLight position={[4.2, 13.0, 55]} intensity={1.7} distance={8} decay={1.4} color="#d9e4e8" />
            <pointLight position={[4.2, 13.0, 70]} intensity={1.9} distance={8} decay={1.4} color="#e8f1f5" />
            <pointLight position={[4.2, 13.0, 86]} intensity={1.6} distance={8} decay={1.4} color="#e8dfcf" />
          </>
        ) : (
          <>
            <pointLight position={[0, 4.4, 5.6]} intensity={1.0} distance={9} decay={1.3} color="#dfe9ee" />
            <pointLight position={[0, 4.4, 0]} intensity={0.9} distance={9} decay={1.3} color="#d9e4e8" />
            <pointLight position={[0, 4.4, -5.6]} intensity={1.0} distance={9} decay={1.3} color="#dfe9ee" />
            <pointLight position={[-2.8, 4.35, -6.4]} intensity={2.1} distance={7} decay={1.3} color="#e8dfcf" />
            <pointLight position={[-2.8, 4.35, -2.0]} intensity={1.8} distance={7} decay={1.3} color="#d9e4e8" />
            <pointLight position={[-2.8, 4.35, 2.2]} intensity={1.6} distance={7} decay={1.3} color="#e8dfcf" />
            <pointLight position={[-2.8, 4.35, 6.4]} intensity={1.5} distance={7} decay={1.3} color="#d9e4e8" />
            <pointLight position={[2.8, 4.35, -6.2]} intensity={1.25} distance={7} decay={1.3} color="#f4ecdc" />
            <pointLight position={[2.8, 4.35, -2.0]} intensity={1.5} distance={7} decay={1.3} color="#e8f1f5" />
            <pointLight position={[2.8, 4.35, 2.0]} intensity={1.5} distance={7} decay={1.3} color="#e8f1f5" />
            <pointLight position={[2.8, 4.35, 6.2]} intensity={1.7} distance={7} decay={1.3} color="#e8dfcf" />
          </>
        )
      ) : null}
      {cameraMode === "workshop" ? (
        modelId === "carrier" ? (
          <>
            <pointLight position={[-13.0, 28.0, -62.0]} intensity={2.2} distance={14} decay={1.35} color="#e8f1f5" />
            <pointLight position={[-18.0, 28.0, -66.0]} intensity={2.0} distance={14} decay={1.4} color="#f0e7d6" />
            <pointLight position={[-18.0, 26.0, -60.0]} intensity={1.6} distance={12} decay={1.4} color="#d9e4e8" />
            <pointLight position={[-15.5, 24.5, -70.0]} intensity={1.4} distance={11} decay={1.4} color="#e8f1f5" />
          </>
        ) : (
          <>
            <pointLight position={[7.0, 7.1, -27]} intensity={1.6} distance={10} decay={1.35} color="#e8f1f5" />
            <pointLight position={[6.0, 7.1, -31]} intensity={1.4} distance={10} decay={1.4} color="#f0e7d6" />
            <pointLight position={[7.5, 6.6, -33]} intensity={1.2} distance={8} decay={1.4} color="#d9e4e8" />
          </>
        )
      ) : null}
      {cameraMode === "magazine" ? (
        <>
          <pointLight position={[-8.0, 15.5, -14.0]} intensity={2.2} distance={16} decay={1.35} color="#e8f1f5" />
          <pointLight position={[-10.0, 15.5, -36.0]} intensity={2.0} distance={18} decay={1.4} color="#f0e7d6" />
          <pointLight position={[-6.0, 15.0, -55.0]} intensity={1.8} distance={16} decay={1.4} color="#d9e4e8" />
        </>
      ) : null}
      {cameraMode === "bridge" ? (
        modelId === "carrier" ? (
          <>
            <pointLight position={[24.9, 46.9, -36.0]} intensity={2.4} distance={8} decay={1.35} color="#f2ecdf" />
            <pointLight position={[24.9, 46.9, -42.0]} intensity={2.2} distance={8} decay={1.35} color="#dcebf2" />
            <pointLight position={[24.9, 46.5, -33.5]} intensity={2.0} distance={10} decay={1.3} color="#e8f3f8" />
          </>
        ) : (
          <>
            <pointLight position={[0, 25.9, 27]} intensity={1.7} distance={12} decay={1.4} color="#f0eadc" />
            <pointLight position={[0, 23.7, 31.6]} intensity={1.3} distance={9} decay={1.4} color="#cfe4ee" />
            <pointLight position={[0, 24.4, 39]} intensity={2.2} distance={18} decay={1.3} color="#e6f1f6" />
          </>
        )
      ) : null}
    </>
  );
}

// 外部视角下舰桥/情报中心必须能透过玻璃看到舱内。舱室是封闭体，主光进不去，
// 这里常驻两盏低功率点光（带距离衰减，不影响舰体外观），不再用海景贴图背板遮丑。
function CommandCabinShowcaseLight() {
  const cameraMode = useStageStore((state) => state.cameraMode);
  const modelId = useStageStore((state) => state.modelId);
  if (isCarrierInteriorMode(cameraMode)) return null;
  if (modelId === "carrier") {
    return (
      <>
        <pointLight position={[24.9, 48.1, -38.2]} intensity={2.6} distance={7} decay={1.35} color="#f4ecdd" />
        <pointLight position={[24.9, 48.1, -41.8]} intensity={2.2} distance={7} decay={1.35} color="#dcebf2" />
        <pointLight position={[24.9, 41.4, -36.2]} intensity={1.6} distance={7} decay={1.4} color="#dcebf2" />
      </>
    );
  }
  if (modelId === "type055") {
    return (
      <>
        <pointLight position={[-2.0, 23.2, 28.0]} intensity={1.5} distance={11} decay={1.35} color="#f0eadc" />
        <pointLight position={[2.0, 23.2, 28.0]} intensity={1.5} distance={11} decay={1.35} color="#dcebf2" />
        <pointLight position={[0, 20.9, 18.0]} intensity={1.3} distance={12} decay={1.35} color="#dcebf2" />
      </>
    );
  }
  return null;
}

function Studio() {
  return (
    <>
      <ambientLight intensity={0.12} />
      <hemisphereLight args={["#dfe7ef", "#1b2025", 0.2]} />
      <InteriorFillLight />
      <CommandCabinShowcaseLight />
      <CockpitCanopyVisibility />
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

/** 航母海面铺到千米级，远处用与背景同色的大气雾把海面矩形边缘化开，形成海天线。 */
function StageFog() {
  const scene = useThree((state) => state.scene);
  const modelId = useStageStore((state) => state.modelId);
  useEffect(() => {
    if (modelId !== "carrier") {
      scene.fog = null;
      return;
    }
    scene.fog = new THREE.Fog("#e9ecf0", 620, 2200);
    return () => {
      scene.fog = null;
    };
  }, [scene, modelId]);
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
  const xray = useStageStore((state) => state.views.xray);
  // 透视/局部透视时物体大量重叠，AO/Bloom 意义不大且会放大混合开销；
  // 航母是万件、500 万三角面：EffectComposer 的场景 Pass 在本机会输出黑帧，
  // 直接走默认帧缓冲，同时省掉 Bloom/Vignette 的全屏开销。
  const localXray = useStageStore((state) => state.views.localXray);
  const heavy = useStageStore((state) => state.modelId === "carrier");
  if (xray || localXray || heavy) return null;
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
  const buildIndex = useStageStore((state) => state.buildIndex);
  const selectedPart = useStageStore((state) => state.selectedPart);
  const damageSeed = useStageStore((state) => state.damageSeed);
  const cameraMode = useStageStore((state) => state.cameraMode);
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
    if (!source) {
      useStageStore.getState().setAssembling(false);
      return;
    }
    const store = useStageStore.getState();
    const key = `${modelId}|${variantId}|${damageSeed}|${worn ? "worn" : "new"}|${JSON.stringify(overrides)}`;
    const previousKey = currentKeyRef.current;
    const cache = cacheRef.current;
    setBuildError(null);

    const warmShaders = (target: AssembledModel) => {
      const store = useStageStore.getState();
      store.setShaderWarming(true);
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        const cached = cache.get(key);
        if (cached) cached.warmed = true;
        if (useStageStore.getState().assembled === target) {
          useStageStore.getState().setShaderWarming(false);
        }
      };
      const warm = () => {
        if (useStageStore.getState().assembled !== target) {
          finish();
          return;
        }
        // compileAsync 会一次性编译全部可见/隐藏材质；DOM 提示层先绘制，再开始编译。
        void gl.compileAsync(rootScene, camera).catch(() => {}).finally(() => window.setTimeout(finish, 140));
      };
      // 先让加载提示完成一帧绘制，再开始编译，避免低端 GPU 看起来像直接卡死。
      window.setTimeout(warm, 80);
      // 兜底：驱动异常/编译 Promise 不返回时不把提示层永久留在画面上。
      window.setTimeout(finish, 12000);
    };

    const mount = (
      target: AssembledModel,
      stats: { parts: number; triangles: number },
      home: { center: [number, number, number]; radius: number } | null,
      floor: { y: number; footprint: number } | null,
      warm = true,
    ) => {
      seqRef.current += 1;
      setScene({ assembled: target, seq: seqRef.current });
      store.setStats(stats);
      store.setAssembling(false);
      // 重建/复用都保留当前构建进度（改参数不该把玩家从 L2 拉回整车）
      store.setBuildIndex(store.buildIndex);
      store.attach(target);
      if (home) {
        store.setHome(home.center, home.radius);
        setStageFloor(floor);
        if (store.preserveViewOnRebuild) {
          useStageStore.setState({ preserveViewOnRebuild: false });
        } else {
          // 模型切换直接切到取景位：航母与坦克的尺度差上百倍，飞行动画会让相机穿过船体。
          store.requestViewReset(true);
        }
      }
      clockRef.current = 0;
      lastStateRef.current = null;
      currentKeyRef.current = key;
      // 小模型（测试台/枪械）不需要整场景 compileAsync：它们首帧本来就不慢，
      // 反而会让“着色器编译中”提示无故停留十几秒。缓存已预热的模型也不重复编译。
      if (warm && stats.parts >= 1000) warmShaders(target);
      else store.setShaderWarming(false);
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
      mount(cached.assembled, cached.stats, cached.home, cached.floor, !cached.warmed);
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
      useStageStore.getState().setAssembling(false);
      useStageStore.getState().setNotice(`注册表校验未通过：${errors.length} 个错误`);
      return;
    }
    // 装配可能抛（常量拼写、kit 参数、几何自检……）。这里必须捕获：
    // effect 里抛出的异常会冒泡到 React，没有边界就是整页白屏。
    const runBuild = (): AssembledModel | null => {
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
        useStageStore.getState().setAssembling(false);
        useStageStore.getState().reportFault(faultFromError(`装配 ${model.title}`, error));
        return null;
      }
      if (model.presentationScale) next.root.scale.set(...model.presentationScale);
      // 只让结构大件投影：1.1 万件小螺栓/铆钉/盖板逐个进 shadow pass 会把 055 拖到 20fps，
      // 而且它们本身的投影在整舰尺度上不可见。
      const worldScale = Math.max(Math.abs(next.root.scale.x), Math.abs(next.root.scale.y), Math.abs(next.root.scale.z)) || 1;
      next.root.traverse((object) => {
        if ((object as THREE.Mesh).isMesh) {
          object.castShadow = false;
          object.receiveShadow = true;
        }
      });
      for (const handle of next.parts) {
        if (handle.def.tags?.includes("internal")) continue;
        if (!handle.geometry.boundingSphere) handle.geometry.computeBoundingSphere();
        const radius = handle.geometry.boundingSphere?.radius ?? 0;
        handle.object.castShadow = radius * worldScale > 0.8;
      }
      // 特效件（tags: fx）默认不可见，由动画在需要时切 visible；否则首帧会先闪一下。
      // 海面/尾流同用 fx 标签（不参与结构检测、不撑大取景），但需要常显。
      for (const handle of next.parts) {
        if (handle.def.tags?.includes("fx") && !handle.def.id.startsWith("carrier.sea.")) {
          handle.object.visible = false;
        }
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
        // 取景/地面/阴影都在世界空间计算：presentationScale 把编辑尺度换算成米。
        const presentation = model.presentationScale ?? [1, 1, 1];
        const scaleMatrix = new THREE.Matrix4().makeScale(presentation[0], presentation[1], presentation[2]);
        const frame = (model.framingBounds?.(next) ?? bounds).clone().applyMatrix4(scaleMatrix);
        const worldBounds = bounds.clone().applyMatrix4(scaleMatrix);
        const center = frame.getCenter(new THREE.Vector3());
        const frameSize = frame.getSize(new THREE.Vector3());
        const size = worldBounds.getSize(new THREE.Vector3());
        home = {
          center: [center.x, center.y, center.z],
          radius: Math.max(frameSize.length() * 0.5, 0.5),
        };
        floor = { y: worldBounds.min.y, footprint: Math.max(size.x, size.z) };
      }
      const stats = { parts: next.parts.length, triangles: Math.round(triangles) };
      cache.set(key, { assembled: next, library, stats, home, floor, lastUsed: performance.now(), warmed: false });
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
      return next;
    };

    // 大型模型先让加载提示绘制一帧、再开始同步装配，避免切换时整页无响应。
    // 5000+ 件的装配约 1-2s，提示层提前出现比装配完再提示更有意义。
    if (source.parts.length >= 1000) {
      store.setAssembling(true);
      let built: AssembledModel | null = null;
      const timer = window.setTimeout(() => {
        built = runBuild();
      }, 140);
      return () => {
        window.clearTimeout(timer);
        if (built) cleanupFor(built)();
      };
    }
    const built = runBuild();
    return built ? cleanupFor(built) : undefined;
  }, [modelId, variantId, rebuildToken, overrides, damageSeed, worn, gl, rootScene, camera]);

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
  // 舰载机换成 fight-stage 的 j20.ts 原模型：仅浏览器运行时挂载（j20 需要 canvas 贴图），
  // 旧 J-15 零件保留为碰撞代理/零件树但不再渲染。动态 import 让非航母模型不加载这份代码。
  useEffect(() => {
    if (!assembled || modelId !== "carrier") return;
    let disposeMount: (() => void) | undefined;
    let cancelled = false;
    import("@/three/parts/models/carrier/j20Mount")
      .then(({ mountCarrierJ20 }) => {
        if (!cancelled) disposeMount = mountCarrierJ20(assembled);
      })
      .catch((error) => console.warn("J20 挂载失败，保留原舰载机", error));
    return () => {
      cancelled = true;
      disposeMount?.();
    };
  }, [assembled, modelId]);

  // 舰员换成真正的人形蒙皮模型（Quaternius CC0，运行时挂载）；旧方块人已从注册表移除。
  useEffect(() => {
    if (!assembled || (modelId !== "type055" && modelId !== "carrier")) return;
    let disposeMount: (() => void) | undefined;
    let cancelled = false;
    import("@/app/three/crewMount")
      .then(({ mountCrewFigures }) => {
        if (cancelled) return;
        disposeMount = mountCrewFigures(assembled, modelId as "type055" | "carrier");
      })
      .catch((error) => console.warn("舰员人物挂载失败", error));
    return () => {
      cancelled = true;
      disposeMount?.();
    };
  }, [assembled, modelId]);

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
      store.energyBoost,
      store.energyWidth,
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

  // ---- 海面开关：海面/白浪/艏浪/尾流统一显隐；关掉后可绕到舰体下方检查 ----
  // 进入舰内视角时也必须隐藏：海面是无限大平面，会穿进弹药库/生活区等水下舱室。
  useEffect(() => {
    if (!assembled) return;
    const showSea = views.sea && !isCarrierInteriorMode(cameraMode);
    for (const handle of assembled.parts) {
      if (!handle.partId.startsWith("carrier.sea.")) continue;
      handle.object.visible = showSea;
      setPickable(handle.object, showSea);
      for (const variant of Object.values(handle.damageObjects)) {
        if (!variant) continue;
        variant.visible = showSea;
        setPickable(variant, showSea);
      }
    }
  }, [assembled, views.sea, cameraMode, rebuildToken]);

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
      selectedInternal ||
      // 舰内第一人称（舰桥/情报中心/机舱/反应堆/弹药库/机库）必须看到舱内部件。
      // walk 漫游会走进舱内/车内，同样不能把 internal 零件从场景树摘掉。
      cameraMode === "walk" ||
      (modelId === "carrier" && isCarrierInteriorMode(cameraMode));
    camera.layers.enable(0);
    camera.layers.disable(2);
    applyInternalVisibility(modelId, assembled, showInternals, views.internalsOnly);
    // 航母内部件一万余件：外部视角仅靠 layer 仍会参与矩阵/视锥遍历，
    // 这里把内部件从场景树摘下；透视、爆炸、选中内部件或进入舱内视角时挂回。
    if (modelId === "carrier") {
      for (const handle of assembled.parts) {
        if (!isInternalPart("carrier", handle)) continue;
        if (!showInternals) {
          const parent = handle.object.parent;
          if (parent) {
            handle.object.userData.__internalParent = parent;
            parent.remove(handle.object);
          }
          setPickable(handle.object, false);
          continue;
        }
        const parent = handle.object.userData.__internalParent as THREE.Object3D | undefined;
        if (parent && handle.object.parent !== parent) parent.add(handle.object);
        handle.object.visible = true;
        setPickable(handle.object, true);
      }
    }
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
    cameraMode,
  ]);

  // QA 钩子：开发模式或 ?qa=1 时暴露只读场景引用，用于自动化截图/录屏/相机机位。
  const three = useThree();
  useEffect(() => {
    const qa = import.meta.env.DEV || new URLSearchParams(window.location.search).has("qa");
    if (!qa) return;
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
      setCamera: (position: [number, number, number], target: [number, number, number]) => {
        three.camera.position.set(...position);
        const controls = three.controls as { target?: THREE.Vector3; update?: () => void } | null;
        if (controls?.target) controls.target.set(...target);
        controls?.update?.();
        three.camera.lookAt(new THREE.Vector3(...target));
      },
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

  // 网格随模型尺度（航母 316m / 坦克 8m）调整，避免大舰下网格细得看不见。
  const gridSpan = Math.max(40, (stageFloor?.footprint ?? 1.2) * 1.4);
  return (
    <>
      {views.grid ? (
        <Grid
          position={[0, (stageFloor?.y ?? 0) - 0.004, 0]}
          args={[gridSpan, gridSpan]}
          cellSize={gridSpan / 160}
          cellThickness={0.5}
          cellColor="#d3d9e1"
          sectionSize={gridSpan / 16}
          sectionThickness={1}
          sectionColor="#bcc4cf"
          fadeDistance={gridSpan * 0.65}
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
      <PartIsolationVisibility />
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
/**
 * 单件隔离：主视口只保留被隔离的零件。此前“隔离查看”只在右下小窗显示，
 * 舰体/机匣仍会挡住内部零件，导致点开燃机零件看不到。
 */
function PartIsolationVisibility() {
  const assembled = useStageStore((state) => state.assembled);
  const modelId = useStageStore((state) => state.modelId);
  const isolation = useStageStore((state) => state.isolation);
  const partId = isolation?.kind === "part" ? isolation.partId : null;

  useEffect(() => {
    if (!assembled || assembled.root.name !== modelId || !partId) return;
    const previous = new Map<(typeof assembled.parts)[number], boolean>();
    for (const handle of assembled.parts) {
      previous.set(handle, handle.object.visible);
      handle.object.visible = false;
    }
    const target = assembled.getPart(partId);
    if (target) target.object.visible = previous.get(target) ?? true;
    return () => {
      for (const [handle, visible] of previous) handle.object.visible = visible;
    };
  }, [assembled, modelId, partId]);

  return null;
}

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
        if (useStageStore.getState().cameraMode === "walk") return;
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
        if (useStageStore.getState().cameraMode === "walk") return;
        const partId = event.object.name;
        if (partId) onSelect(partId, event.instanceId ?? null);
      }}
      onDoubleClick={(event: ThreeEvent<MouseEvent>) => {
        event.stopPropagation();
        if (event.delta > 6) return;
        if (useStageStore.getState().cameraMode === "walk") return;
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

/** 航母外部视角护栏：防止拖动/平移把相机压到海面下或舰体内部造成黑屏。 */
function CarrierCameraFloor() {
  const modelId = useStageStore((state) => state.modelId);
  const cameraMode = useStageStore((state) => state.cameraMode);
  const camera = useThree((state) => state.camera);
  const seaOn = useStageStore((state) => state.views.sea);
  const controls = useThree((state) => state.controls) as
    | { target: THREE.Vector3; update: () => void }
    | null;
  useFrame(() => {
    if (modelId !== "carrier" || cameraMode !== "orbit" || !controls) return;
    let changed = false;
    // 海面可见时把相机压在水面以上；关掉海面后允许降到舰底以下做完整 360° 检查。
    const floorY = seaOn ? 24 : 2;
    if (camera.position.y < floorY) {
      camera.position.y = floorY;
      changed = true;
    }
    if (controls.target.y < floorY) {
      controls.target.y = floorY;
      changed = true;
    }
    if (controls.target.y > 120) {
      controls.target.y = 120;
      changed = true;
    }
    const maxTargetXZ = 220;
    if (Math.abs(controls.target.x) > maxTargetXZ) {
      controls.target.x = Math.sign(controls.target.x) * maxTargetXZ;
      changed = true;
    }
    if (Math.abs(controls.target.z) > maxTargetXZ) {
      controls.target.z = Math.sign(controls.target.z) * maxTargetXZ;
      changed = true;
    }
    if (changed) controls.update();
  });
  return null;
}

/** 相机聚焦：零件树 / 穿模报告点击 → 平滑飞行；重置视角 → 回到初始方位。
 *  第一人称（潜望镜）时接管相机：关掉 OrbitControls，眼点由 viewpoints 从零件包围盒派生；
 *  退出时先记住的自由视角原路飞回，不把人甩到别的方位。 */
function CameraRig() {
  const modelId = useStageStore((state) => state.modelId);
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  const controls = useThree((state) => state.controls) as
    | { target: THREE.Vector3; update: () => void; enabled: boolean; maxDistance?: number; minDistance?: number }
    | null
    | undefined;
  const focus = useStageStore((state) => state.focus);
  const cameraMode = useStageStore((state) => state.cameraMode);
  const setCameraMode = useStageStore((state) => state.setCameraMode);
  const machineState = useStageStore((state) => state.machineState);
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
  const look = useRef({ yaw: 0, pitch: 0, dragging: false, x: 0, y: 0, zoom: 1 });
  const perspective = camera as THREE.PerspectiveCamera;

  useEffect(() => {
    look.current.yaw = 0;
    look.current.pitch = 0;
    look.current.dragging = false;
    look.current.zoom = 1;
    // 进入机库内部视角就切到机库作业状态（防火门打开），从任意视角直接切过来都生效。
    if (cameraMode === "hangar" && useStageStore.getState().machineState !== "hangar") {
      useStageStore.getState().setMachineState("hangar");
    }
  }, [cameraMode]);

  // 点「弹射/拦阻闭环」后自动切到跟拍，完整看到滑行、弹射、爬升、进近、拦阻。
  const previousMachineState = useRef(machineState);
  useEffect(() => {
    if (
      machineState === "flight_ops" &&
      previousMachineState.current !== "flight_ops" &&
      assembled?.getNode("CV_Aircraft")
    ) {
      setCameraMode("flight");
    }
    previousMachineState.current = machineState;
  }, [machineState, assembled, setCameraMode]);

  // 舰船内部第一人称：鼠标拖拽环视（舰桥里能转头看海图桌/座椅/侧窗）。
  useEffect(() => {
    if (!isCarrierInteriorMode(cameraMode)) return;
    const el = gl.domElement;
    const down = (event: PointerEvent) => {
      if (event.button !== 0) return;
      look.current.dragging = true;
      look.current.x = event.clientX;
      look.current.y = event.clientY;
    };
    const move = (event: PointerEvent) => {
      if (!look.current.dragging) return;
      const dx = event.clientX - look.current.x;
      const dy = event.clientY - look.current.y;
      look.current.x = event.clientX;
      look.current.y = event.clientY;
      look.current.yaw -= dx * 0.005;
      // 与自由视角一致：往下拖 = 往下看（之前的符号是反的）。
      look.current.pitch = THREE.MathUtils.clamp(look.current.pitch + dy * 0.004, -1.25, 1.25);
    };
    const up = () => {
      look.current.dragging = false;
    };
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const factor = Math.exp(event.deltaY * 0.0011);
      look.current.zoom = THREE.MathUtils.clamp(look.current.zoom * factor, 0.45, 2.6);
    };
    el.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    el.addEventListener("wheel", wheel, { passive: false });
    return () => {
      el.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      el.removeEventListener("wheel", wheel);
    };
  }, [cameraMode, gl]);

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
    // 航母这类百米级包围球若沿用 34° 视场，复位距离会拉到 ~700m，首帧容易落在背景穹顶之外。
    // 大模型重置时切到 56° 取景，把复位距离压到 ~410m，既装得下全舰也不会黑屏。
    const baseFov = (camera as THREE.PerspectiveCamera).fov ?? 34;
    const fov = focus.radius > 60 ? Math.max(baseFov, 56) : baseFov;
    if ((camera as THREE.PerspectiveCamera).fov !== fov) {
      (camera as THREE.PerspectiveCamera).fov = fov;
      (camera as THREE.PerspectiveCamera).updateProjectionMatrix();
    }
    // 1.15 ≈ 让包围球填满 ~85% 视锥（1.65 会把整机拉得又小又远，像展示柜角落里的玩具）
    const distance = Math.max(0.35, (focus.radius * 1.15) / Math.tan(THREE.MathUtils.degToRad(fov / 2)));
    const toPosition = target.clone().addScaledVector(direction, distance);
    // 航母真实尺度 316m：远裁剪面/轨道缩放上限按取景半径扩展，否则整舰会被裁掉。
    const far = Math.max(200, distance + focus.radius * 4);
    if (perspective.far < far) {
      perspective.far = far;
      perspective.updateProjectionMatrix();
    }
    const maxDistance = Math.max(200, distance * 20);
    if (controls.maxDistance !== undefined) controls.maxDistance = maxDistance;
    if (controls.minDistance !== undefined) controls.minDistance = Math.max(0.1, focus.radius * 0.01);
    if (focus.instant) {
      camera.position.copy(toPosition);
      controls.target.copy(target);
      controls.update();
      flight.current = null;
      useStageStore.setState({ focus: null });
      return;
    }
    flight.current = {
      fromPosition: camera.position.clone(),
      toPosition,
      fromTarget: currentTarget,
      toTarget: target,
      fromFov: fov,
      toFov: fov,
      duration: 0.55,
      elapsed: 0,
    };
  }, [focus, camera, controls, cameraMode]);

  useFrame((_state, delta) => {
    // —— 跟拍舰载机：以 CV_Aircraft 节点位姿为基准，完整覆盖弹射/拦阻闭环 ——
    if (cameraMode === "flight" && assembled) {
      const node = assembled.getNode("CV_Aircraft");
      if (node) {
        const targetPos = node.getWorldPosition(new THREE.Vector3());
        const rotation = node.getWorldQuaternion(new THREE.Quaternion());
        const desiredPosition = targetPos
          .clone()
          .add(new THREE.Vector3(0, 12, -34).applyQuaternion(rotation));
        const desiredTarget = targetPos
          .clone()
          .add(new THREE.Vector3(0, 2.4, 8).applyQuaternion(rotation));
        const k = 1 - Math.exp(-4.5 * delta);
        camera.position.lerp(desiredPosition, k);
        lookTarget.current.lerp(desiredTarget, k);
        const targetFov = 52;
        if (Math.abs(perspective.fov - targetFov) > 1e-3) {
          perspective.fov += (targetFov - perspective.fov) * k;
          perspective.updateProjectionMatrix();
        }
        camera.lookAt(lookTarget.current);
        return;
      }
    }

    // —— 第一人称：眼点由零件包围盒派生（已是世界空间），窄视场，平滑跟随 ——
    const view = firstPersonView(cameraMode, assembled);
    if (view) {
      const k = 1 - Math.exp(-12 * delta);
      camera.position.lerp(view.position, k);
      const baseDir = view.target.clone().sub(view.position).normalize();
      const rotation = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(look.current.pitch, look.current.yaw, 0, "YXZ"),
      );
      baseDir.applyQuaternion(rotation);
      const distance = Math.max(1, view.target.distanceTo(view.position));
      const desiredTarget = view.position.clone().addScaledVector(baseDir, distance);
      lookTarget.current.lerp(desiredTarget, k);
      const targetFov = THREE.MathUtils.clamp(view.fov * look.current.zoom, 18, 100);
      if (Math.abs(perspective.fov - targetFov) > 1e-3) {
        perspective.fov += (targetFov - perspective.fov) * k;
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
  const seaOn = useStageStore((state) => state.views.sea);
  return (
    <OrbitControls
      makeDefault
      target={target}
      enableDamping
      dampingFactor={0.12}
      minDistance={0.1}
      maxDistance={2000}
      minPolarAngle={modelId === "carrier" ? 0.02 : 0.04}
      maxPolarAngle={modelId === "carrier" ? (seaOn ? 1.55 : Math.PI - 0.06) : Math.PI / 2 - 0.015}
    />
  );
}
