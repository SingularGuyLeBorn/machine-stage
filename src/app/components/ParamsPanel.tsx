import { Gauge, RotateCcw } from "lucide-react";
import { useMemo } from "react";
import { resolveConstants } from "@/three/parts";
import { findModel } from "../catalog";
import { useStageStore } from "../state/stageStore";

// ============================================================================
// ParamsPanel —— 参数面板（改常量 → 实时重建 → 重新检测穿模）
//
// 数值常量给滑杆（范围来自 catalog 声明）；派生常量（表达式）只读展示解析值，
// 因为它们是单一真值源的推导结果，不允许手改。
// ============================================================================

const HEURISTIC = { min: 0, max: 1, step: 0.001 };

export function ParamsPanel() {
  const modelId = useStageStore((state) => state.modelId);
  const overrides = useStageStore((state) => state.overrides);
  const setParam = useStageStore((state) => state.setParam);
  const resetParams = useStageStore((state) => state.resetParams);

  const model = findModel(modelId);
  const registry = model.registry;

  const resolved = useMemo(() => {
    if (!registry) return {};
    try {
      return resolveConstants({ ...registry.constants, ...overrides });
    } catch {
      return {};
    }
  }, [registry, overrides]);

  const entries = useMemo(() => Object.entries(registry?.constants ?? {}), [registry]);
  const overrideCount = Object.keys(overrides).length;

  return (
    <section className="panel panel--grow">
      <header className="panel__head">
        <Gauge size={14} className="muted" aria-hidden />
        <h2 className="panel__title">参数（单一真值源）</h2>
        <span className="panel__count">{overrideCount > 0 ? `${overrideCount} 项覆盖` : "默认值"}</span>
        <button
          type="button"
          className="btn btn--sm btn--ghost"
          onClick={resetParams}
          disabled={overrideCount === 0}
          title="恢复注册表默认值"
        >
          <RotateCcw size={12} aria-hidden />
        </button>
      </header>
      <div className="panel__body panel__body--flush">
        {entries.length === 0 ? <div className="empty">该模型尚未登记常量表</div> : null}
        {entries.map(([name, value]) => {
          const isDerived = typeof value === "string";
          const current = overrides[name] ?? (typeof value === "number" ? value : (resolved[name] ?? 0));
          const range = model.paramRanges?.[name] ?? {
            ...HEURISTIC,
            min: typeof value === "number" && value < 0 ? value * 3 : 0,
            max: typeof value === "number" && Math.abs(value) > 0 ? Math.abs(value) * 4 : 1,
            step: 0.001,
          };
          return (
            <div className="param" key={name}>
              <span className="param__name">{name}</span>
              <span className="param__value">
                {resolved[name] !== undefined ? resolved[name].toFixed(4) : "—"}
                <span className="muted"> m</span>
              </span>
              {isDerived ? (
                <span className="param__derived">
                  <code>{value as string}</code>
                  <span>派生（只读）</span>
                </span>
              ) : (
                <div className="param__control">
                  <input
                    className="slider"
                    type="range"
                    min={range.min}
                    max={range.max}
                    step={range.step}
                    value={current}
                    aria-label={name}
                    style={{
                      ["--fill" as string]: `${((current - range.min) / Math.max(range.max - range.min, 1e-9)) * 100}%`,
                    }}
                    onChange={(event) => setParam(name, Number(event.target.value))}
                  />
                  <input
                    className="num param__input"
                    style={{
                      width: 72,
                      height: 24,
                      padding: "0 6px",
                      border: "1px solid var(--line-strong)",
                      borderRadius: "var(--radius-sm)",
                    }}
                    type="number"
                    step={range.step}
                    value={current}
                    aria-label={`${name} 精确值`}
                    onChange={(event) => setParam(name, Number(event.target.value))}
                  />
                </div>
              )}
            </div>
          );
        })}
        {model.notes?.length ? (
          <div className="notes">
            {model.notes.map((note) => (
              <div key={note}>· {note}</div>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
