import type { AssembledModel, PartHandle } from "@/three/parts";
import type { ExpectedContactRule } from "@/three/parts/registry/types";
import type { ClippingReport } from "@/three/parts/solver/report";
import { detectSweep } from "@/three/parts/solver/detect";
import { partitionExpectedContacts } from "@/three/parts/solver/whitelist";
import { applyTigerLidPose, resetTigerLidPose, TIGER_LIDS } from "./lids";
import { animateTiger } from "./motion";

// ============================================================================
// models/tiger/sweep —— 动态穿模扫描（全状态矩阵）
//
// 为什么需要它：`detectSweep` 只是底层采样器——应用里原来的「动画扫掠」只摆了当前状态的
// 一条时间轴（而且没传 state，实际只扫到悬挂默认动画），炮塔回转、击发后坐、行进履带、
// 装填弹、殉爆抛塔这些都不会被扫到。这里把「每个动画状态 = 一个场景」编排成矩阵：
//   · 每个场景按 fps 采样，逐帧 resetNodes → animate(state) → 舱盖目标位姿；
//   · 舱盖场景让盖板从闭合平滑转到全开（真实扫掠过中间每一帧）；
//   · 装填场景临时摘掉演示弹的 fx 标签，让弹/弹丸/空筒作为真实零件参与检测；
//   · 报告按注册表 expectedContacts 分层：未豁免 = 真缺陷候选。
// 输出可直接喂给 CLI（scripts/diag-sweep.ts）或界面（stageStore.runScan("sweep")）。
// ============================================================================

export interface TigerSweepScenario {
  id: string;
  label: string;
  /** 机器状态（catalog states 的 id）。 */
  state: string;
  /** 采样时长（秒）。 */
  duration: number;
  /** 场景内舱盖目标（缺省=闭合；lids 场景=全开）。 */
  lidOverrides?: Record<string, boolean>;
  /** 临时摘掉 fx 标签、参与结构检测的零件（装填演示件）。 */
  includeFx?: string[];
}

const LOADING_DEMO_PARTS = [
  "tiger.interior.loading_round_case",
  "tiger.interior.loading_round_shell",
  "tiger.interior.ejected_case",
];

const ALL_LIDS_OPEN = Object.fromEntries(TIGER_LIDS.map((lid) => [lid.key, true]));

export const TIGER_SWEEP_SCENARIOS: TigerSweepScenario[] = [
  { id: "suspension", label: "悬挂演示", state: "running", duration: 4 },
  { id: "driving", label: "行进演示", state: "driving", duration: 7.6 },
  { id: "aiming", label: "炮塔瞄准", state: "aiming", duration: 8 },
  { id: "firing", label: "主炮击发", state: "firing", duration: 6 },
  { id: "mg", label: "机枪连射", state: "mg_firing", duration: 3.2 },
  {
    id: "loading",
    label: "装填演示",
    state: "loading",
    duration: 5.2,
    includeFx: LOADING_DEMO_PARTS,
  },
  { id: "engine", label: "发动机启动", state: "engine_start", duration: 6 },
  { id: "hit", label: "受击（重）", state: "hit_heavy", duration: 2 },
  { id: "detonation", label: "弹药殉爆", state: "detonation", duration: 4.6 },
  { id: "lids", label: "舱盖全开", state: "idle", duration: 1.0, lidOverrides: ALL_LIDS_OPEN },
];

export interface TigerSweepScenarioReport {
  scenario: TigerSweepScenario;
  frames: number;
  ms: number;
  reports: ClippingReport[];
  unexcused: ClippingReport[];
  expected: ClippingReport[];
}

export interface TigerSweepResult {
  scenarios: TigerSweepScenarioReport[];
  /** 所有场景的原始报告（每对运动件只记首次碰撞帧）。 */
  reports: ClippingReport[];
  /** 未命中 expectedContacts 的报告（真缺陷候选）。 */
  unexcused: ClippingReport[];
  expected: ClippingReport[];
  samples: number;
  ms: number;
}

export interface TigerSweepOptions {
  scenarios?: readonly TigerSweepScenario[];
  /** 每个场景的采样帧率（默认 30）。 */
  fps?: number;
  /** 只扫描部分零件（例如构建滑杆进度内）。 */
  filter?: (handle: PartHandle) => boolean;
  onScenario?: (report: TigerSweepScenarioReport, index: number) => void;
}

/**
 * 跑全状态动态扫描。调用会同步占用主线程，调用方负责给 UI 留一帧（setTimeout/rAF）。
 * 结束后模型会复位到静止装配态（与 detectSweep 的约定一致）。
 */
export function runTigerSweep(
  assembled: AssembledModel,
  expectedContacts: readonly ExpectedContactRule[],
  options: TigerSweepOptions = {},
): TigerSweepResult {
  const scenarios = options.scenarios ?? TIGER_SWEEP_SCENARIOS;
  const fps = options.fps ?? 30;
  const startedAll = performance.now();
  const results: TigerSweepScenarioReport[] = [];
  let samples = 0;

  for (const [index, scenario] of scenarios.entries()) {
    const started = performance.now();
    const savedTags = new Map<string, string[] | undefined>();
    for (const id of scenario.includeFx ?? []) {
      const handle = assembled.getPart(id);
      if (!handle) continue;
      savedTags.set(id, handle.def.tags ? [...handle.def.tags] : undefined);
      Object.assign(handle.def, { tags: [] });
    }
    resetTigerLidPose();
    let reports: ClippingReport[] = [];
    try {
      reports = detectSweep(assembled, {
        duration: scenario.duration,
        fps,
        ...(options.filter ? { filter: options.filter } : {}),
        applyPose: (t) => {
          assembled.resetNodes();
          animateTiger(assembled, t, scenario.state);
          // 舱盖是真实交互件：按帧时间平滑推进，扫过开启途中的每一帧
          applyTigerLidPose(assembled, scenario.state, scenario.lidOverrides ?? {}, 1 / fps);
        },
      });
    } finally {
      for (const [id, tags] of savedTags) {
        const handle = assembled.getPart(id);
        if (handle) Object.assign(handle.def, { tags });
      }
      assembled.resetNodes();
      assembleRest(assembled);
    }
    const frames = Math.max(2, Math.round(scenario.duration * fps) + 1);
    samples += frames;
    const split = partitionExpectedContacts(reports, expectedContacts);
    const scenarioReport: TigerSweepScenarioReport = {
      scenario,
      frames,
      ms: Math.round(performance.now() - started),
      reports,
      unexcused: split.active.map((item) => item.report),
      expected: split.expected.map((item) => item.report),
    };
    results.push(scenarioReport);
    options.onScenario?.(scenarioReport, index);
  }

  const reports = results.flatMap((r) => r.reports);
  return {
    scenarios: results,
    reports,
    unexcused: results.flatMap((r) => r.unexcused),
    expected: results.flatMap((r) => r.expected),
    samples,
    ms: Math.round(performance.now() - startedAll),
  };
}

function assembleRest(assembled: AssembledModel): void {
  animateTiger(assembled, 0);
  resetTigerLidPose();
  assembled.syncInstances();
  assembled.root.updateMatrixWorld(true);
}
