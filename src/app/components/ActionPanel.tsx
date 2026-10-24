import { Activity, Info } from "lucide-react";
import { useMemo } from "react";
import * as THREE from "three";
import { findModel, type StageAction } from "../catalog";
import { useStageStore } from "../state/stageStore";

// ============================================================================
// ActionPanel —— 右栏动作区（按「机构 / 展示 / 自检」分组）
//
// 动作是声明式的（catalog 里登记 kind），这里只做分发，不写模型逻辑。
// ============================================================================

export function ActionPanel() {
  const modelId = useStageStore((state) => state.modelId);
  const machineState = useStageStore((state) => state.machineState);
  const energyWidth = useStageStore((state) => state.energyWidth);
  const energyBoost = useStageStore((state) => state.energyBoost);
  const damage = useStageStore((state) => state.damage);
  const variantId = useStageStore((state) => state.variantId);
  const views = useStageStore((state) => state.views);
  const cameraMode = useStageStore((state) => state.cameraMode);
  const scanPhase = useStageStore((state) => state.scanPhase);

  const model = findModel(modelId);

  const groups = useMemo(() => {
    const map = new Map<string, StageAction[]>();
    for (const action of model.actions ?? []) {
      const list = map.get(action.group) ?? [];
      list.push(action);
      map.set(action.group, list);
    }
    return [...map.entries()];
  }, [model]);

  const dispatch = (action: StageAction) => {
    const store = useStageStore.getState();
    switch (action.kind) {
      case "energy-boost":
        store.toggleEnergyBoost();
        break;
      case "machine-state":
        store.setMachineState(
          store.machineState === action.state ? (model.states?.[0]?.id ?? "idle") : action.state,
        );
        break;
      case "damage":
        store.setDamage(action.level);
        break;
      case "view-toggle":
        store.toggleView(action.view);
        break;
      case "param":
        if (action.value === null) store.resetParams();
        else store.setParam(action.param, action.value);
        break;
      case "scan":
        store.runScan(action.scanKind);
        break;
      case "reset-view":
        store.requestViewReset();
        break;
      case "reroll-damage":
        store.rerollDamage();
        break;
      case "focus-node": {
        const node = store.assembled?.getNode(action.node);
        if (!node) break;
        const p = node.getWorldPosition(new THREE.Vector3());
        const [ox, oy, oz] = action.offset ?? [0, 0, 0];
        store.setCameraMode("orbit");
        store.focusPoint([p.x + ox, p.y + oy, p.z + oz], action.radius ?? 10, true);
        break;
      }
      case "camera":
        // 再点一次同一模式 = 回到自由视角（和机构按钮的「再点停机」同一手感）
        store.setCameraMode(store.cameraMode === action.mode ? "orbit" : action.mode);
        break;
      case "variant":
        store.setVariant(action.variant);
        break;
      case "planned":
        store.setNotice(action.note);
        break;
    }
  };

  const pressedOf = (action: StageAction): boolean => {
    if (action.kind === "energy-boost") return energyBoost;
    if (action.kind === "machine-state") return machineState === action.state;
    if (action.kind === "damage") return damage === action.level;
    if (action.kind === "view-toggle") return views[action.view];
    if (action.kind === "camera") return cameraMode === action.mode;
    if (action.kind === "variant") return variantId === action.variant;
    return false;
  };

  return (
    <section className="panel">
      <header className="panel__head">
        <Activity size={14} className="muted" aria-hidden />
        <h2 className="panel__title">动作</h2>
        <span className="panel__count">{model.milestone}</span>
      </header>
      <div className="panel__body">
        {groups.length === 0 ? (
          <div className="empty">
            <Info size={13} aria-hidden />
            <div>该模型尚未登记动作（等 M-B 虎式发动机接入）</div>
          </div>
        ) : null}
        {groups.map(([group, actions]) => (
          <div key={group} className="action-group">
            <div className="action-group__label">{group}</div>
            <div className="action-grid">
              {actions.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  className="btn"
                  aria-pressed={pressedOf(action)}
                  disabled={action.kind === "scan" && scanPhase === "scanning"}
                  title={action.kind === "scan" ? "对当前装配做实例级干涉检测" : undefined}
                  onClick={() => dispatch(action)}
                >
                  {action.label}
                </button>
              ))}
            </div>
          </div>
        ))}
        {model.actions?.some((action) => action.kind === "energy-boost") ? (
          <div className="action-group">
            <label className="action-group__label" htmlFor="energy-width">
              光线粗细 · {energyWidth.toFixed(2)}×
            </label>
            <input
              id="energy-width"
              type="range"
              min={0.25}
              max={3}
              step={0.05}
              value={energyWidth}
              aria-label="光线粗细"
              style={{ width: "100%" }}
              onChange={(event) => useStageStore.getState().setEnergyWidth(Number(event.target.value))}
            />
            <div className="notes">红色、黄色光束实时调整；加力在此基础上增强。</div>
          </div>
        ) : null}
        {model.actions && model.actions.length > 0 ? (
          <div className="notes">
            动作按钮只改状态：机构状态驱动节点动画，展示状态改视口姿态层，自检动作改参数并触发穿模检测。
          </div>
        ) : null}
      </div>
    </section>
  );
}
