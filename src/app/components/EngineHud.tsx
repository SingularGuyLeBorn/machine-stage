import { useEffect, useState } from "react";
import {
  TIGER_CRANK_END,
  TIGER_PREHEAT_END,
  TIGER_RUNUP_END,
  tigerEngineRpmAt,
} from "@/three/parts/models/tiger/motion";
import { useStageStore } from "../state/stageStore";

// ============================================================================
// EngineHud —— 发动机冷启动的阶段 / 水温 / 转速读数
//
// 时间轴与 motion.ts 的 tigerEngineRpmAt / tigerCrankAngleAt 同源：
//   0–1.6s 预热（曲轴不转） → 1.6–3.4s 起动机拖动 → 3.4s 点火 →
//   3.4–5.4s 暖机 → 650rpm 怠速。水温是简化模型（冷车 18°C，点火后指数升温）。
// ============================================================================

export function EngineHud() {
  const machineState = useStageStore((state) => state.machineState);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (machineState !== "engine_start") {
      setSeconds(0);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = () => {
      setSeconds((performance.now() - start) / 1000);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [machineState]);

  if (machineState !== "engine_start") return null;

  const rpm = tigerEngineRpmAt(seconds);
  const phase =
    seconds < TIGER_PREHEAT_END
      ? "预热"
      : seconds < TIGER_CRANK_END
        ? "起动机拖动"
        : seconds < TIGER_CRANK_END + 0.8
          ? "点火"
          : seconds < TIGER_RUNUP_END
            ? "暖机"
            : "怠速";
  const temp =
    seconds < TIGER_CRANK_END
      ? 18 + (seconds / TIGER_CRANK_END) * 7
      : 25 + 55 * (1 - Math.exp(-(seconds - TIGER_CRANK_END) / 7));
  const warm = Math.min(100, ((temp - 18) / 67) * 100);

  return (
    <>
      <span className="engine-hud">
        <i className="engine-hud__dot" aria-hidden />
        发动机 {phase}
      </span>
      <span>
        水温 <span className="num">{temp.toFixed(0)}°C</span>
      </span>
      <span>
        转速 <span className="num">{rpm.toFixed(0)} rpm</span>
      </span>
      <span className="engine-hud__bar" title="暖机进度">
        <i style={{ width: `${warm}%` }} />
      </span>
    </>
  );
}
