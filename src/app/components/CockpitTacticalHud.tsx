import { useStageStore } from "../state/stageStore";

// ============================================================================
// CockpitTacticalHud —— 座舱战术 HUD（DOM + CSS/SVG）
//
// 按 F-15 / web-flight-simulator 的布局拆成：
//   航向带（顶） / 俯仰梯（中，随 roll 旋转、随 pitch 平移）
//   IAS（左） / ASL 与升降速度（右）
//   武器状态（右下，当前是待机，不接武器仿真）
//   RWR / PULL UP（左上，待机/告警）
// 全部是 HTML/SVG，改布局不碰 WebGL 着色器。
// ============================================================================

const PITCH_MARKS = [-40, -30, -20, -10, -5, 5, 10, 20, 30, 40];

function WeaponStatus() {
  const cockpit = useStageStore((state) => state.cockpit);
  if (!cockpit) return null;
  const active = cockpit.phase === "combat";
  return (
    <div className="tac-weapons" aria-label="武器状态">
      <div className="tac-weapons__row">
        <span className="tac-weapons__label">GUN</span>
        <b>{cockpit.gunAmmo}</b>
        <span className="tac-weapons__unit">RDS</span>
      </div>
      <div className={`tac-weapons__row${cockpit.weapon === "AIM9" ? " is-selected" : ""}`}>
        <span className="tac-weapons__label">AIM-9</span>
        <b>{cockpit.aim9}</b>
        <span className="tac-weapons__unit">MSL</span>
      </div>
      <div className="tac-weapons__row">
        <span className="tac-weapons__label">FLARE</span>
        <b>{cockpit.flares}</b>
        <span className="tac-weapons__unit">MJU-7A</span>
      </div>
      <div className="tac-weapons__standby">
        {active ? `IN FLIGHT ${cockpit.missileCount} · ${cockpit.weapon === "AIM9" ? "IR" : "GUN"}` : "武器系统待命"}
      </div>
    </div>
  );
}


function RadarScope() {
  const cockpit = useStageStore((state) => state.cockpit);
  if (!cockpit) return null;
  const contacts = cockpit.radarContacts;
  const maxRange = 8000;
  return (
    <div className="tac-radar" aria-label="火控雷达">
      <div className="tac-radar__head">
        <span>RDR</span>
        <b>{cockpit.lock ? "STT" : "RWS"}</b>
        <small>8 KM</small>
      </div>
      <svg viewBox="0 0 160 160" className="tac-radar__scope">
        <circle cx="80" cy="80" r="72" className="tac-radar__ring" />
        <circle cx="80" cy="80" r="49" className="tac-radar__ring" />
        <circle cx="80" cy="80" r="26" className="tac-radar__ring" />
        <path d="M 80 8 V 152 M 8 80 H 152" className="tac-radar__cross" />
        <path d="M 80 80 L 80 8 A 72 72 0 0 1 141 44 Z" className="tac-radar__sweep" />
        {contacts.map((contact, index) => {
          const range = Math.min(1, contact.range / maxRange);
          const bearing = (contact.bearing * Math.PI) / 180;
          const x = 80 + Math.sin(bearing) * range * 72;
          const y = 80 - Math.cos(bearing) * range * 72;
          return (
            <g key={index}>
              <circle
                cx={x}
                cy={y}
                r={contact.locked ? 4 : 2.2}
                className={contact.locked ? "tac-radar__contact is-locked" : "tac-radar__contact"}
              />
              {contact.locked ? <circle cx={x} cy={y} r="7" className="tac-radar__lock-ring" /> : null}
            </g>
          );
        })}
        <path d="M 76 80 H 84 M 80 76 V 84" className="tac-radar__own" />
      </svg>
      <div className="tac-radar__foot">
        <span>{contacts.length} CONTACT</span>
        <span>{cockpit.targetCount} TGT</span>
      </div>
    </div>
  );
}

function AircraftStatus() {
  const cockpit = useStageStore((state) => state.cockpit);
  if (!cockpit) return null;
  return (
    <div className="tac-aircraft" aria-label="飞机状态">
      <div><span>THR</span><b>{cockpit.throttle}%</b></div>
      <div><span>FUEL</span><b>{cockpit.fuel}%</b></div>
      <div><span>ENG</span><b>{cockpit.engineRpm}%</b></div>
      <div><span>G</span><b>{cockpit.gLoad.toFixed(1)}</b></div>
      <div><span>GEAR</span><b>{cockpit.gearDown ? "DOWN" : "UP"}</b></div>
      <div><span>A/P</span><b>{cockpit.autopilot ? "ALT" : "OFF"}</b></div>
      <div><span>MSL</span><b>{cockpit.aim9}</b></div>
      <div><span>IN FLT</span><b>{cockpit.missileCount}</b></div>
    </div>
  );
}
export function CockpitTacticalHud() {
  const cockpit = useStageStore((state) => state.cockpit);
  if (!cockpit?.active) return null;
  const pitch = cockpit.pitch;
  const roll = cockpit.roll;
  const heading = cockpit.heading;
  const locked = cockpit.lock;
  const phaseLabel =
    cockpit.phase === "taxi"
      ? "滑行"
      : cockpit.phase === "arming"
        ? "弹射准备"
        : cockpit.phase === "launch"
          ? "电磁弹射"
          : cockpit.phase === "airborne"
            ? "离舰爬升"
            : cockpit.phase === "combat"
              ? "武器试射"
              : "完成";

  const headingTicks = [];
  for (let angle = -180; angle <= 540; angle += 10) {
    const major = angle % 30 === 0;
    headingTicks.push(
      <span
        key={angle}
        className={`tac-heading__tick${major ? " is-major" : ""}`}
        style={{ left: `calc(50% + ${(angle - heading) * 3.2}px)` }}
      >
        {major ? String(((angle % 360) + 360) % 360).padStart(3, "0") : ""}
      </span>,
    );
  }

  return (
    <div className="tac-hud" aria-label="战术 HUD">
      <div className="tac-warn">
        <span className={cockpit.autopilot ? "is-ok" : ""}>A/P {cockpit.autopilot ? "ALT HOLD" : "MANUAL"}</span>
        <span className={cockpit.rwr ? "is-alert" : ""}>RWR {cockpit.rwr ? "● 被锁定" : "— 待机"}</span>
        <span className={cockpit.pullUp ? "is-alert" : ""}>{cockpit.pullUp ? "PULL UP" : "GPWS — 待机"}</span>
      </div>

      <div className="tac-heading">
        <div className="tac-heading__window">{headingTicks}</div>
        <span className="tac-heading__caret" aria-hidden />
        <b>{String(heading).padStart(3, "0")}</b>
        <small>HDG</small>
      </div>

      <svg className="tac-pitch" viewBox="0 0 260 320" aria-hidden>
        <g transform={`translate(130 160) rotate(${-roll}) translate(0 ${pitch * 2.8})`}>
          <line x1={-110} x2={-28} y1={0} y2={0} className="tac-pitch__horizon" />
          <line x1={28} x2={110} y1={0} y2={0} className="tac-pitch__horizon" />
          {PITCH_MARKS.map((mark) => {
            const y = -mark * 2.8;
            const width = Math.abs(mark) >= 20 ? 38 : 26;
            return (
              <g key={mark} transform={`translate(0 ${y})`} className={`tac-pitch__mark${mark < 0 ? " is-negative" : ""}`}>
                <line x1={-width} x2={-10} y1={0} y2={0} />
                <line x1={10} x2={width} y1={0} y2={0} />
                <text x={width + 5} y={3}>{Math.abs(mark)}</text>
              </g>
            );
          })}
        </g>
        <g transform="translate(130 160)" className="tac-pitch__boresight">
          <path d="M -18 0 L -6 0 M 6 0 L 18 0 M 0 -18 L 0 -6 M 0 6 L 0 18" />
          <circle r="2.2" />
        </g>
      </svg>

      <div className="tac-ias">
        <small>IAS</small>
        <b>{Math.round(cockpit.speed)}</b>
        <span>km/h</span>
      </div>
      <div className="tac-alt">
        <small>ASL</small>
        <b>{cockpit.altitude.toLocaleString("en-US")}</b>
        <span>m</span>
        <em>{cockpit.verticalSpeed >= 0 ? "+" : ""}{cockpit.verticalSpeed} m/s</em>
      </div>

      <div
        className={`tac-lock${locked ? " is-locked" : ""}${cockpit.lockScreen ? " is-projected" : ""}`}
        style={
          cockpit.lockScreen
            ? {
                left: `${(cockpit.lockScreen[0] * 0.5 + 0.5) * 100}%`,
                top: `${(-cockpit.lockScreen[1] * 0.5 + 0.5) * 100}%`,
              }
            : undefined
        }
      >
        <span>{locked ? "LOCK" : "NO LOCK"}</span>
        <small>{cockpit.targetCount > 0 ? `${cockpit.targetCount} TGT` : "SEARCH"}</small>
      </div>

      <WeaponStatus />
      {cockpit.phase === "combat" ? <RadarScope /> : null}
      <AircraftStatus />

      <div className="tac-wez">
        <div className="tac-wez__head">
          <span>WEZ</span>
          <b>{locked ? `${cockpit.targetRange >= 1000 ? (cockpit.targetRange / 1000).toFixed(1) + "km" : cockpit.targetRange + "m"}` : "— — —"}</b>
        </div>
        <div className="tac-wez__bar">
          <i className="tac-wez__rmin" />
          <i className="tac-wez__nez" />
          <i className="tac-wez__rmax" />
          <span className="tac-wez__marker" style={{ left: locked && cockpit.wezMax > 0 ? `${Math.min(100, Math.max(0, (cockpit.targetRange / cockpit.wezMax) * 100))}%` : "50%" }} />
        </div>
        <div className="tac-wez__labels">
          <span>RMIN {Math.round(cockpit.wezMin / 100) / 10}km</span>
          <span>NEZ {Math.round(cockpit.nez / 100) / 10}km</span>
          <span>RMAX {Math.round(cockpit.wezMax / 100) / 10}km</span>
        </div>
        <small>Vc {locked ? cockpit.closure : 0} m/s</small>
      </div>

      <div className="tac-mission">
        <span>{phaseLabel}</span>
        {cockpit.phase === "taxi" || cockpit.phase === "arming" ? (
          <>
            <span>2 号弹射位</span>
            <span>距滑梭 {cockpit.distance.toFixed(1)}</span>
            <span className={cockpit.aligned ? "is-ok" : "is-warn"}>{cockpit.aligned ? "● 已对准" : "○ 未对准"}</span>
          </>
        ) : null}
        {cockpit.phase === "arming" && cockpit.countdown > 0 ? <strong>{Math.ceil(cockpit.countdown)}</strong> : null}
      </div>
    </div>
  );
}
