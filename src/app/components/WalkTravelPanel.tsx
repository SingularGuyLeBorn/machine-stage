import { useMemo } from "react";
import { useStageStore } from "../state/stageStore";
import { walkConfigOf, walkDestinationsOf, type WalkDestination } from "../three/walk";

// ============================================================================
// WalkTravelPanel —— 漫游快速前往
//
// T 或右上角按钮打开；区域/关键交互点点击后走与门户相同的淡入淡出传送。
// 面板打开时 WalkController 暂停移动与 F，避免点按钮时人还在走。
// ============================================================================

export function WalkTravelPanel() {
  const open = useStageStore((state) => state.walkTravelOpen);
  const setOpen = useStageStore((state) => state.setWalkTravelOpen);
  const requestTravel = useStageStore((state) => state.requestWalkTravel);
  const fading = useStageStore((state) => state.walkFading);
  const currentArea = useStageStore((state) => state.walkArea);
  const modelId = useStageStore((state) => state.modelId);
  const config = walkConfigOf(modelId);

  const destinations = useMemo(
    () => (config ? walkDestinationsOf(modelId, config) : { areas: [], hotspots: [] }),
    [config, modelId],
  );

  if (!config) return null;

  const travel = (destination: WalkDestination) => {
    if (fading) return;
    setOpen(false);
    requestTravel(destination.area, destination.pos, destination.yaw);
  };

  return (
    <>
      <button
        type="button"
        className="btn btn--sm walk-travel-toggle"
        onClick={() => {
          setOpen(!open);
          if (document.pointerLockElement) document.exitPointerLock();
        }}
      >
        快速前往 <kbd>T</kbd>
      </button>

      {open ? (
        <div className="walk-travel" role="dialog" aria-label="快速前往">
          <div className="walk-travel__head">
            <div>
              <strong>快速前往</strong>
              <span>T 开关 · Esc 关闭 · 点击即传送</span>
            </div>
            <button
              type="button"
              className="walk-travel__close"
              aria-label="关闭快速前往"
              onClick={() => setOpen(false)}
            >
              ×
            </button>
          </div>

          <section className="walk-travel__section">
            <h3>区域</h3>
            <div className="walk-travel__grid">
              {destinations.areas.map((destination) => (
                <button
                  key={destination.id}
                  type="button"
                  className={`walk-travel__item${destination.area === currentArea ? " is-active" : ""}`}
                  disabled={fading}
                  title={destination.hint}
                  onClick={() => travel(destination)}
                >
                  <span>{destination.label}</span>
                  {destination.area === currentArea ? <em>当前</em> : <small>{destination.hint}</small>}
                </button>
              ))}
            </div>
          </section>

          {destinations.hotspots.length > 0 ? (
            <section className="walk-travel__section">
              <h3>关键位置</h3>
              <div className="walk-travel__hotspots">
                {destinations.hotspots.map((destination) => (
                  <button
                    key={destination.id}
                    type="button"
                    className="walk-travel__item walk-travel__item--wide"
                    disabled={fading}
                    onClick={() => travel(destination)}
                  >
                    <span>{destination.label}</span>
                    <small>{destination.hint}</small>
                  </button>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
