import { describe, expect, it } from "vitest";
import { buildModel, detectStatic, partitionExpectedContacts } from "@/three/parts";
import type { AssembledModel } from "@/three/parts";
import { makeKingJoeRegistry, makeKingJoeLayouts, kingjoeModelBuilders } from "./registry";
import { animateKingJoe, type KingJoeState } from "./motion";

const states: KingJoeState[] = [
  "idle",
  "formation",
  "combining",
  "robot",
  "firing",
  "separation",
  "crippled",
  "damaged",
];
const keyframes = [0, 1, 2, 2.5, 3, 3.8, 4.2, 4.8, 5.5, 6, 7.2, 8.2, 9.5];

function activeReports(registry: ReturnType<typeof makeKingJoeRegistry>, model: AssembledModel) {
  const reports = detectStatic(model, { minDepthM: 0.0005 });
  return partitionExpectedContacts(reports, registry.expectedContacts ?? []).active;
}

describe("kingjoe motion", () => {
  it("每种形态的关键姿态机构-皮零穿插", () => {
    const registry = makeKingJoeRegistry();
    const model = buildModel(registry, {
      builders: kingjoeModelBuilders,
      instanceLayouts: makeKingJoeLayouts(),
      warnMissingLayout: false,
    });
    for (const state of states) {
      model.resetNodes();
      animateKingJoe(model, 0, state);
      model.root.updateMatrixWorld(true);
      expect(activeReports(registry, model), `state ${state}`).toEqual([]);
    }
    // 腰部关节关键帧：上腹/胸/头绕 waist 转，腿↔腹接口不动
    model.resetNodes();
    animateKingJoe(model, 0, "robot");
    for (const t of [1.5, 3, 3.05, 4.5, 6.05]) {
      model.resetNodes();
      animateKingJoe(model, t, "robot");
      model.root.updateMatrixWorld(true);
      expect(activeReports(registry, model), `robot waist t=${t}`).toEqual([]);
    }
    // 合体关键帧（含三段对接、锁环、展开）
    model.resetNodes();
    animateKingJoe(model, 0, "combining");
    for (const t of keyframes) {
      model.resetNodes();
      animateKingJoe(model, t, "combining");
      model.root.updateMatrixWorld(true);
      expect(activeReports(registry, model), `combining t=${t}`).toEqual([]);
    }
    model.dispose();
  }, 120_000);

  it("合体等待中的模块持续上下浮动并缓慢向最终位靠近", () => {
    const registry = makeKingJoeRegistry();
    const model = buildModel(registry, {
      builders: kingjoeModelBuilders,
      instanceLayouts: makeKingJoeLayouts(),
      warnMissingLayout: false,
    });
    const sample = (t: number) => {
      model.resetNodes();
      animateKingJoe(model, t, "combining");
      return {
        chest: model.getNode("chest")!.position.clone(),
        ship: model.getNode("ship")!.position.clone(),
      };
    };
    sample(0); // 固定合体本地时钟，后续采样用绝对秒
    const a = sample(1.6);
    const b = sample(2.2);
    const c = sample(3.0);
    // 头部在 5.2s 才轮到：等待期间有横向漂移。
    expect(Math.abs(a.ship.x - b.ship.x) + Math.abs(a.ship.z - b.ship.z)).toBeGreaterThan(0.002);
    // 等待期轨迹 = 持续浮动 + 缓慢下降基线；去掉线性趋势后仍应有明显振荡。
    const waitProfile = (key: "chest" | "ship", from: number, to: number) => {
      const ts: number[] = [];
      const ys: number[] = [];
      for (let t = from; t <= to + 1e-9; t += 0.1) {
        ts.push(t);
        ys.push(sample(t)[key].y);
      }
      const n = ts.length;
      const meanT = ts.reduce((sum, v) => sum + v, 0) / n;
      const meanY = ys.reduce((sum, v) => sum + v, 0) / n;
      let num = 0;
      let den = 0;
      for (let i = 0; i < n; i++) {
        num += (ts[i] - meanT) * (ys[i] - meanY);
        den += (ts[i] - meanT) ** 2;
      }
      const slope = num / den;
      const residuals = ys.map((y, i) => y - (meanY + slope * (ts[i] - meanT)));
      return { slope, range: Math.max(...residuals) - Math.min(...residuals) };
    };
    const chestWait = waitProfile("chest", 1.6, 3.0);
    const shipWait = waitProfile("ship", 1.6, 4.4);
    expect(chestWait.range).toBeGreaterThan(0.05);
    expect(shipWait.range).toBeGreaterThan(0.05);
    expect(chestWait.slope).toBeLessThan(-0.05);
    expect(shipWait.slope).toBeLessThan(-0.03);
    expect(c.ship.y).toBeLessThan(a.ship.y + 0.05);
    // 合体前段必须是三维靠拢：从编队位横向/纵深飞向对接轴，而不是原地垂直升降。
    const poseAt = (t: number) => {
      model.resetNodes();
      animateKingJoe(model, t, "combining");
      return {
        chest: model.getNode("chest")!.position.clone(),
        ship: model.getNode("ship")!.position.clone(),
        chestRot: model.getNode("chest")!.rotation.clone(),
        shipRot: model.getNode("ship")!.rotation.clone(),
      };
    };
    const horizontal = (p: { x: number; z: number }, q: { x: number; z: number }) =>
      Math.abs(p.x - q.x) + Math.abs(p.z - q.z);
    const early = poseAt(0.2);
    const arrive = poseAt(1.3);
    expect(horizontal(early.chest, arrive.chest)).toBeGreaterThan(0.5);
    expect(horizontal(early.ship, arrive.ship)).toBeGreaterThan(0.3);
    // 等待期间保持飞行倾斜（俯仰/滚转/偏航），而不是冻结姿态。
    const waitA = poseAt(2.2);
    const tilt =
      Math.abs(waitA.chestRot.x) +
      Math.abs(waitA.chestRot.z) +
      Math.abs(waitA.shipRot.x) +
      Math.abs(waitA.shipRot.z);
    expect(tilt).toBeGreaterThan(0.05);
    model.dispose();
  }, 120_000);

  it("战损：装甲板脱落、液压喷溅与战后姿态零穿插", () => {
    const registry = makeKingJoeRegistry();
    const model = buildModel(registry, {
      builders: kingjoeModelBuilders,
      instanceLayouts: makeKingJoeLayouts(),
      warnMissingLayout: false,
    });
    for (const t of [0, 0.3, 0.6, 1, 1.4, 1.8, 2.6]) {
      model.resetNodes();
      animateKingJoe(model, t, "damaged");
      model.root.updateMatrixWorld(true);
      expect(activeReports(registry, model), `damaged t=${t}`).toEqual([]);
    }
    model.dispose();
  }, 120_000);

  it("编队纵队↔楔形变换与楔形起步合体零穿插", () => {
    const registry = makeKingJoeRegistry();
    const model = buildModel(registry, {
      builders: kingjoeModelBuilders,
      instanceLayouts: makeKingJoeLayouts(),
      warnMissingLayout: false,
    });
    for (const t of [0, 2.8, 5.7, 8.5, 11.4]) {
      model.resetNodes();
      animateKingJoe(model, t, "formation");
      model.root.updateMatrixWorld(true);
      expect(activeReports(registry, model), `formation morph t=${t}`).toEqual([]);
    }
    // 从楔形编队直接进入合体：快照应接住上一帧形态，而不是跳回纵队
    model.resetNodes();
    animateKingJoe(model, 5.7, "formation");
    for (const t of [0, 0.4, 1, 1.4, 2]) {
      model.resetNodes();
      animateKingJoe(model, t, "combining");
      model.root.updateMatrixWorld(true);
      expect(activeReports(registry, model), `combining from wedge t=${t}`).toEqual([]);
    }
    model.dispose();
  }, 120_000);
});
