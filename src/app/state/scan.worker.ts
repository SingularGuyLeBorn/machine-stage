import { buildModel, detectStatic, detectSweep } from "@/three/parts";
import { setDamageSeed } from "@/three/parts/models/tiger/damage/plan";
import { findModel } from "../catalog";

// ============================================================================
// scan.worker —— 穿模扫描放到 Worker
//
// detectStatic/detectSweep 对 MBT/ED 要跑几十秒；在主线程会冻结拖动/按钮。
// Worker 内重建一份无材质的装配模型并跑检测，主线程只收报告。
// static 可以按 pairShard 拆给多个 Worker 并行，各自只分析自己那份候选对。
// ============================================================================

interface ScanRequest {
  modelId: string;
  variantId: string;
  overrides: Record<string, number>;
  kind: "static" | "sweep";
  state: string;
  /** 主线程的构建回放进度：与同步路径一样只扫当前可见零件。 */
  buildIndex: number;
  /** 随机破口种子：保证 Worker 重建出的损坏几何与主线程一致。 */
  damageSeed: number;
  /** 并行分片（static 用）；缺省 = 全量。 */
  shardIndex?: number;
  shardCount?: number;
}

const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<ScanRequest>) => void) | null;
  postMessage: (data: unknown) => void;
};

workerScope.onmessage = async (event) => {
  const { modelId, variantId, overrides, kind, state, buildIndex, damageSeed, shardIndex, shardCount } =
    event.data;
  try {
    const model = findModel(modelId);
    await model.prepare?.(new AbortController().signal, () => {});
    const variant = model.variants?.find((item) => item.id === variantId) ?? model.variants?.[0];
    const source = variant?.registry ?? model.registry;
    if (!source) throw new Error(`模型 ${modelId} 没有注册表`);
    setDamageSeed(damageSeed);
    const registry = {
      ...source,
      constants: { ...source.constants, ...overrides },
    };
    const built = buildModel(registry, {
      builders: model.builders,
      instanceLayouts: variant?.layouts ?? model.layouts,
      warnMissingLayout: false,
    });
    built.resetNodes();
    model.animate?.(built, 0);
    const orders = [...new Set(registry.parts.map((part) => part.build_order))].sort((a, b) => a - b);
    const threshold =
      buildIndex >= orders.length
        ? null
        : buildIndex <= 0
          ? Number.NEGATIVE_INFINITY
          : orders[buildIndex - 1];
    const filter =
      threshold === null ? undefined : (handle: { buildOrder: number }) => handle.buildOrder <= threshold;
    const pairShard =
      shardCount && shardCount > 1 ? { index: shardIndex ?? 0, count: shardCount } : undefined;
    const started = performance.now();
    const reports =
      kind === "sweep"
        ? detectSweep(built, {
            duration: 3,
            fps: 30,
            filter,
            pairShard,
            applyPose: (t) => {
              built.resetNodes();
              model.animate?.(built, t, state);
            },
          })
        : detectStatic(built, { filter, pairShard });
    built.dispose();
    workerScope.postMessage({ reports, scanMs: Math.round(performance.now() - started) });
  } catch (error) {
    workerScope.postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
};
