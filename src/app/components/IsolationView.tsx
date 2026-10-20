import { Html, OrbitControls } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { type AssembledModel, type ClippingReport, type PartHandle } from "@/three/parts";
import { formatReportMeasure, reportKey, reportPartIds, formLabel, useStageStore } from "../state/stageStore";

// ============================================================================
// IsolationView —— 隔离小视图（一对穿透零件对比 / 单件聚焦）
//
// 独立 Scene：只把目标零件的实例搬进来（共享几何、不复制、不释放），A 红 B 蓝，
// 穿透点画小球 + 标注线（带 partId 与 depth_mm），相机自动框选联合包围盒。
// 与「飞到穿透点」并存：那边是整机里定位，这里是关起门来对比。
// ============================================================================

const COLOR_A = "#c0392b";
const COLOR_B = "#2f6fdc";
const COLOR_SINGLE = "#3f6f9f";

/** 零件实例的世界矩阵（装配器持有；token 变化时重算）。 */
function useInstanceMatrices(
  handle: PartHandle | null,
  assembled: AssembledModel | null,
  token: string,
): THREE.Matrix4[] {
  return useMemo(() => {
    if (!handle || !assembled) return [];
    const out: THREE.Matrix4[] = [];
    for (const instance of handle.instances) {
      out.push(assembled.instanceMatrix(handle, instance.index, new THREE.Matrix4()));
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handle, assembled, token]);
}

function PartInstances({
  handle,
  color,
  matrices,
  opacity,
}: {
  handle: PartHandle;
  color: string;
  matrices: THREE.Matrix4[];
  opacity: number;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(color),
        metalness: 0.25,
        roughness: 0.42,
        envMapIntensity: 0.6,
        transparent: opacity < 1,
        opacity,
        side: THREE.DoubleSide,
      }),
    [color, opacity],
  );

  useEffect(() => () => material.dispose(), [material]);

  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    for (let i = 0; i < matrices.length; i++) mesh.setMatrixAt(i, matrices[i]);
    mesh.count = matrices.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [matrices]);

  return (
    <instancedMesh
      ref={ref}
      args={[handle.geometry, material, Math.max(matrices.length, 1)]}
      frustumCulled={false}
      raycast={() => null}
    />
  );
}

/** 联合包围盒：几何包围盒 × 实例矩阵。 */
function useUnionBounds(entries: Array<{ handle: PartHandle; matrices: THREE.Matrix4[] }>): THREE.Box3 {
  return useMemo(() => {
    const box = new THREE.Box3();
    const scratch = new THREE.Box3();
    for (const entry of entries) {
      entry.handle.geometry.computeBoundingBox();
      const local = entry.handle.geometry.boundingBox;
      if (!local) continue;
      for (const matrix of entry.matrices) {
        scratch.copy(local).applyMatrix4(matrix);
        box.union(scratch);
      }
    }
    return box;
  }, [entries]);
}

function boundRadius(bounds: THREE.Box3): number {
  if (bounds.isEmpty()) return 0.05;
  // 下限 5mm：螺栓/贴花这类小件也要能占到画面的大部分高度
  return Math.max(bounds.getSize(new THREE.Vector3()).length() * 0.5, 0.005);
}

/** 相机自动框选（换目标 / 换报告都重来一次）。 */
function FitView({ bounds, token }: { bounds: THREE.Box3; token: string }) {
  const camera = useThree((state) => state.camera);
  const controls = useThree((state) => state.controls) as
    { target: THREE.Vector3; update: () => void } | null | undefined;

  useEffect(() => {
    if (bounds.isEmpty()) return;
    const center = bounds.getCenter(new THREE.Vector3());
    const radius = boundRadius(bounds);
    const direction = new THREE.Vector3(0.9, 0.62, 1).normalize();
    const perspective = camera as THREE.PerspectiveCamera;
    const vFov = THREE.MathUtils.degToRad(perspective.fov ?? 32);
    const aspect = perspective.aspect || 1;
    // 以较小的视场角为准，保证宽/高两个方向都不裁切；1.25 = 留一圈边
    const fitFov = Math.min(vFov, 2 * Math.atan(Math.tan(vFov / 2) * aspect));
    const distance = Math.max((radius / Math.sin(fitFov / 2)) * 1.25, 0.006);
    camera.position.copy(center).addScaledVector(direction, distance);
    camera.lookAt(center);
    if (controls) {
      controls.target.copy(center);
      controls.update();
    }
    // 换目标/换报告/换画布尺寸（aspect）都重新取景；controls 挂载后也要再跑一次，
    // 否则 OrbitControls 会把 target 拉回原点，小件会跑到画面角落（旧版"看不清"的根因）。
  }, [bounds, token, camera, controls]);

  return null;
}

/** 穿透点：小球 + 竖直标注线 + 标签（partId 与 depth_mm）。 */
function PenetrationMarker({ report, radius }: { report: ClippingReport; radius: number }) {
  const lineLength = Math.max(radius * 1.4, 0.05);
  const lineWidth = Math.max(radius * 0.012, 0.0008);
  const [partA, partB] = reportPartIds(report);
  return (
    <group position={[report.point[0], report.point[1], report.point[2]]}>
      <mesh>
        <sphereGeometry args={[Math.max(radius * 0.05, 0.005), 20, 16]} />
        <meshBasicMaterial color={COLOR_A} />
      </mesh>
      <mesh position={[0, lineLength * 0.5, 0]}>
        <cylinderGeometry args={[lineWidth, lineWidth, lineLength, 8]} />
        <meshBasicMaterial color="#8a9099" />
      </mesh>
      <Html position={[0, lineLength, 0]} center style={{ pointerEvents: "none" }}>
        <div className="iso__tag">
          <strong>
            {partA} ↔ {partB}
          </strong>
          <span className="num">
            {report.depth_mm !== null
              ? `穿透深度 ${report.depth_mm.toFixed(2)} mm`
              : `${formatReportMeasure(report)}（${formLabel(report.form)}）`}
          </span>
        </div>
      </Html>
    </group>
  );
}

export function IsolationView() {
  const isolation = useStageStore((state) => state.isolation);
  const assembled = useStageStore((state) => state.assembled);
  const modelId = useStageStore((state) => state.modelId);
  const reports = useStageStore((state) => state.reports);
  const closeIsolation = useStageStore((state) => state.closeIsolation);
  const stepReport = useStageStore((state) => state.stepReport);
  const requestViewReset = useStageStore((state) => state.requestViewReset);

  const report = useMemo(() => {
    if (isolation?.kind !== "pair") return null;
    return reports.find((item) => reportKey(item) === isolation.key) ?? null;
  }, [isolation, reports]);

  const partIds = useMemo(() => {
    if (!isolation) return [] as string[];
    if (isolation.kind === "part") return [isolation.partId];
    return report ? reportPartIds(report) : [];
  }, [isolation, report]);

  const token = `${modelId}:${isolation?.kind ?? "none"}:${partIds.join(",")}`;

  const handleA = assembled?.getPart(partIds[0] ?? "") ?? null;
  const handleB = assembled?.getPart(partIds[1] ?? "") ?? null;
  const matricesA = useInstanceMatrices(handleA, assembled, token);
  const matricesB = useInstanceMatrices(handleB, assembled, token);
  const bounds = useUnionBounds(
    useMemo(() => {
      const entries: Array<{ handle: PartHandle; matrices: THREE.Matrix4[] }> = [];
      if (handleA) entries.push({ handle: handleA, matrices: matricesA });
      if (handleB) entries.push({ handle: handleB, matrices: matricesB });
      return entries;
    }, [handleA, matricesA, handleB, matricesB]),
  );

  if (!isolation || (!handleA && !handleB)) return null;

  const pair = isolation.kind === "pair" && report !== null && Boolean(handleA && handleB);
  const title = pair && report ? `${report.a} ↔ ${report.b}` : (handleA ?? handleB)!.partId;
  const index = pair && report ? reports.findIndex((item) => reportKey(item) === reportKey(report)) : -1;

  return (
    <section className="iso" aria-label="隔离小视图">
      <header className="iso__head">
        <span className="iso__dot" data-kind={pair ? "pair" : "single"} aria-hidden />
        <h3 className="iso__title" title={title}>
          {title}
        </h3>
        {pair ? (
          <span className="badge num">
            第 {index + 1}/{reports.length}
          </span>
        ) : (
          <span className="badge badge--plain">单件聚焦</span>
        )}
        <div className="iso__spacer" />
        <div className="iso__legend" aria-hidden>
          <span className="iso__chip" data-color={pair ? "a" : "single"} />
          <span>A</span>
          {pair ? (
            <>
              <span className="iso__chip" data-color="b" />
              <span>B</span>
            </>
          ) : null}
        </div>
        {pair ? (
          <div className="btn-row">
            <button
              type="button"
              className="btn btn--sm"
              aria-label="上一个报告"
              title="上一个报告"
              onClick={() => stepReport(-1)}
            >
              <ChevronLeft size={13} aria-hidden />
            </button>
            <button
              type="button"
              className="btn btn--sm"
              aria-label="下一个报告"
              title="下一个报告"
              onClick={() => stepReport(1)}
            >
              <ChevronRight size={13} aria-hidden />
            </button>
          </div>
        ) : null}
        <button
          type="button"
          className="btn btn--sm"
          title="关闭小视图，回到整机视角"
          onClick={() => {
            closeIsolation();
            requestViewReset();
          }}
        >
          <X size={12} aria-hidden />
          返回整机
        </button>
      </header>

      <div className="iso__canvas">
        <Canvas dpr={[1, 2]} camera={{ position: [0.6, 0.4, 0.6], fov: 32, near: 0.001, far: 20 }}>
          <color attach="background" args={["#eef1f5"]} />
          <ambientLight intensity={0.55} />
          <directionalLight position={[2.5, 3, 2]} intensity={1.5} />
          <directionalLight position={[-2, 1.2, -2.5]} intensity={0.55} color="#dfe7f2" />
          {handleA ? (
            <PartInstances
              key={`${handleA.partId}:a`}
              handle={handleA}
              color={pair ? COLOR_A : COLOR_SINGLE}
              matrices={matricesA}
              opacity={1}
            />
          ) : null}
          {pair && handleB ? (
            <PartInstances
              key={`${handleB.partId}:b`}
              handle={handleB}
              color={COLOR_B}
              matrices={matricesB}
              opacity={0.92}
            />
          ) : null}
          {pair && report ? <PenetrationMarker report={report} radius={boundRadius(bounds)} /> : null}
          <FitView bounds={bounds} token={token} />
          <OrbitControls makeDefault enableDamping dampingFactor={0.12} minDistance={0.005} maxDistance={8} />
        </Canvas>
      </div>
      <span className="iso__hint">拖动旋转 · 滚轮缩放 · 右下角可拖大</span>
    </section>
  );
}
