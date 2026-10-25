import { useEffect, useRef, useState, type ReactNode } from "react";
import { useStageStore } from "../state/stageStore";

// ============================================================================
// CockpitControlsPanel —— 座舱操作面板
//
// 左列键位、右列可直接点击的动作，全部走 store 的 cockpitCommand，
// 由 WalkController 在下一帧消费。按住类按键（W/S/A/D）派发合成键盘事件，
// 保持与真实键盘完全相同的滑行/转向/油门手感。
// ============================================================================

const PHASE_LABEL: Record<string, string> = {
  taxi: "滑行",
  arming: "弹射准备",
  launch: "电磁弹射",
  airborne: "离舰爬升",
  combat: "武器试射",
  complete: "完成",
};

/** 按住生效、松开释放：派发 keydown/keyup，和真键盘共用一套输入。 */
function HoldKeyButton({ code, label }: { code: string; label: string }) {
  const holding = useRef(false);
  const cleanup = useRef<(() => void) | null>(null);

  const release = () => {
    if (!holding.current) return;
    holding.current = false;
    cleanup.current?.();
    cleanup.current = null;
    window.dispatchEvent(new KeyboardEvent("keyup", { code, bubbles: true }));
  };

  useEffect(() => release, []);

  return (
    <button
      type="button"
      className="cockpit-controls__pad"
      data-key={code}
      title={`按住 ${code.replace("Key", "")} · ${label}`}
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={(event) => {
        if (event.button !== 0 || holding.current) return;
        event.preventDefault();
        holding.current = true;
        window.dispatchEvent(new KeyboardEvent("keydown", { code, bubbles: true, cancelable: true }));
        const up = () => release();
        window.addEventListener("pointerup", up);
        cleanup.current = () => window.removeEventListener("pointerup", up);
      }}
      onPointerCancel={release}
      onLostPointerCapture={release}
    >
      <kbd>{code.replace("Key", "")}</kbd>
      <span>{label}</span>
    </button>
  );
}

function ActionButton({
  children,
  onClick,
  disabled,
  on,
  primary,
  title,
  action,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  on?: boolean;
  primary?: boolean;
  title?: string;
  action?: string;
}) {
  const className = [
    "cockpit-controls__action",
    on ? "is-on" : "",
    primary ? "is-primary" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button
      type="button"
      className={className}
      data-action={action}
      aria-pressed={on}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      {children}
    </button>
  );
}

export function CockpitControlsPanel() {
  const cockpit = useStageStore((state) => state.cockpit);
  const walkLocked = useStageStore((state) => state.walkLocked);
  const requestCockpitCommand = useStageStore((state) => state.requestCockpitCommand);
  const [open, setOpen] = useState(true);

  const show = () => {
    setOpen(true);
    if (document.pointerLockElement) document.exitPointerLock();
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== "KeyH" || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
      event.preventDefault();
      setOpen((value) => {
        if (!value && document.pointerLockElement) document.exitPointerLock();
        return !value;
      });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!cockpit?.active) return null;

  const phase = cockpit.phase;
  const inCombat = phase === "combat";
  const inTaxi = phase === "taxi";
  const airborne = phase === "arming" || phase === "launch" || phase === "airborne";

  const lockLook = () => {
    const canvas = document.querySelector<HTMLCanvasElement>(".viewport__canvas canvas");
    const request = canvas?.requestPointerLock?.bind(canvas) as (() => Promise<void> | void) | undefined;
    try {
      const value = request?.();
      if (value instanceof Promise) value.catch(() => {});
    } catch {
      // 浏览器拒绝指针锁时仍可用拖拽环视。
    }
    setOpen(false);
  };

  if (!open) {
    return (
      <button type="button" className="cockpit-controls__tab" onClick={show} title="打开座舱操作面板（H）">
        操作面板 <kbd>H</kbd>
      </button>
    );
  }

  return (
    <section className="cockpit-controls" aria-label="座舱操作面板">
      <header className="cockpit-controls__head">
        <span className="cockpit-controls__title">座舱操作</span>
        <span className="cockpit-controls__phase">{PHASE_LABEL[phase] ?? phase}</span>
        <button
          type="button"
          className="cockpit-controls__fold"
          onClick={() => setOpen(false)}
          title="收起面板（H）"
        >
          H
        </button>
      </header>

      <div className="cockpit-controls__section">
        <div className="cockpit-controls__caption">
          <span>{inTaxi ? "滑行操控" : "飞行操控"}</span>
          <span>按住生效</span>
        </div>
        <div className="cockpit-controls__pads">
          <HoldKeyButton code="KeyW" label={inTaxi ? "滑行" : "加速"} />
          <HoldKeyButton code="KeyS" label={inTaxi ? "刹车" : "减速"} />
          <HoldKeyButton code="KeyA" label="左转" />
          <HoldKeyButton code="KeyD" label="右转" />
        </div>
      </div>

      {inTaxi ? (
        <div className="cockpit-controls__section">
          <div className="cockpit-controls__caption">
            <span>弹射流程</span>
            <span>{cockpit.aligned ? "已对准滑梭" : "对准 2 号位"}</span>
          </div>
          <div className="cockpit-controls__rows">
            <div className="cockpit-controls__row">
              <span className="cockpit-controls__key">F</span>
              <span className="cockpit-controls__label">
                报告塔台
                <small>{cockpit.aligned ? "请求弹射，进入倒计时" : "先对准滑梭才能报告"}</small>
              </span>
              <ActionButton
                action="report"
                onClick={() => requestCockpitCommand("report")}
                disabled={!cockpit.aligned}
                on={cockpit.aligned}
                primary
                title="报告塔台准备就绪（F）"
              >
                准备就绪
              </ActionButton>
            </div>
            <div className="cockpit-controls__row">
              <span className="cockpit-controls__key">鼠标</span>
              <span className="cockpit-controls__label">
                360° 环视
                <small>{walkLocked ? "鼠标已锁定" : "点击画面可锁定鼠标"}</small>
              </span>
              <ActionButton action="look" onClick={lockLook} disabled={walkLocked} title="锁定鼠标环视">
                {walkLocked ? "已锁定" : "锁定"}
              </ActionButton>
            </div>
            <div className="cockpit-controls__row">
              <span className="cockpit-controls__key">Esc</span>
              <span className="cockpit-controls__label">退出座舱</span>
              <ActionButton action="exit" onClick={() => requestCockpitCommand("exit")} title="回到甲板漫游">
                退出
              </ActionButton>
            </div>
          </div>
        </div>
      ) : null}

      {airborne ? (
        <div className="cockpit-controls__section">
          <div className="cockpit-controls__caption">
            <span>自动程序</span>
            <span>{PHASE_LABEL[phase]}</span>
          </div>
          <div className="cockpit-controls__status">
            {phase === "arming"
              ? `挡焰板升起，储能充电${cockpit.countdown > 0 ? ` · ${Math.ceil(cockpit.countdown)}` : ""}，即将弹射。`
              : phase === "launch"
                ? "电磁弹射中，保持坐姿。"
                : "离舰爬升中，即将进入武器试射空域。"}
          </div>
          <div className="cockpit-controls__rows">
            <div className="cockpit-controls__row">
              <span className="cockpit-controls__key">Esc</span>
              <span className="cockpit-controls__label">退出座舱</span>
              <ActionButton action="exit" onClick={() => requestCockpitCommand("exit")}>退出</ActionButton>
            </div>
          </div>
        </div>
      ) : null}

      {inCombat ? (
        <div className="cockpit-controls__section">
          <div className="cockpit-controls__caption">
            <span>武器与系统</span>
            <span>{cockpit.targetCount} 目标</span>
          </div>
          <div className="cockpit-controls__rows">
            <div className="cockpit-controls__row">
              <span className="cockpit-controls__key">R</span>
              <span className="cockpit-controls__label">
                锁定 / 切换目标
                <small>{cockpit.lock ? "已锁定，再按切换" : "机头附近搜索"}</small>
              </span>
              <ActionButton action="lock" onClick={() => requestCockpitCommand("lock")} on={cockpit.lock}>
                {cockpit.lock ? "切换" : "锁定"}
              </ActionButton>
            </div>
            <div className="cockpit-controls__row">
              <span className="cockpit-controls__key">Space</span>
              <span className="cockpit-controls__label">
                发射
                <small>{cockpit.weapon === "AIM9" ? `AIM-9 × ${cockpit.aim9}` : `机炮 ${cockpit.gunAmmo} 发`}</small>
              </span>
              <ActionButton
                action="fire"
                onClick={() => requestCockpitCommand("fire")}
                disabled={cockpit.weapon === "AIM9" ? cockpit.aim9 <= 0 : cockpit.gunAmmo <= 0}
                primary
                title="发射当前武器（Space）"
              >
                发射
              </ActionButton>
            </div>
            <div className="cockpit-controls__row">
              <span className="cockpit-controls__key">1 / 2</span>
              <span className="cockpit-controls__label">选择武器</span>
              <span className="cockpit-controls__seg">
                <ActionButton
                  action="weapon-gun"
                  onClick={() => requestCockpitCommand("weapon", "GUN")}
                  on={cockpit.weapon === "GUN"}
                  title="机炮（1）"
                >
                  机炮
                </ActionButton>
                <ActionButton
                  action="weapon-aim9"
                  onClick={() => requestCockpitCommand("weapon", "AIM9")}
                  on={cockpit.weapon === "AIM9"}
                  title="AIM-9（2）"
                >
                  AIM-9
                </ActionButton>
              </span>
            </div>
            <div className="cockpit-controls__row">
              <span className="cockpit-controls__key">C</span>
              <span className="cockpit-controls__label">
                干扰弹
                <small>MJU-7A × {cockpit.flares}</small>
              </span>
              <ActionButton
                action="flare"
                onClick={() => requestCockpitCommand("flare")}
                disabled={cockpit.flares <= 0}
                title="投放干扰弹（C）"
              >
                投放
              </ActionButton>
            </div>
            <div className="cockpit-controls__row">
              <span className="cockpit-controls__key">P</span>
              <span className="cockpit-controls__label">
                自动驾驶
                <small>{cockpit.autopilot ? "高度保持开启" : "手动飞行，注意海面"}</small>
              </span>
              <ActionButton
                action="autopilot"
                onClick={() => requestCockpitCommand("autopilot")}
                on={cockpit.autopilot}
                title="切换自动驾驶（P）"
              >
                {cockpit.autopilot ? "ON" : "OFF"}
              </ActionButton>
            </div>
            <div className="cockpit-controls__row">
              <span className="cockpit-controls__key">鼠标</span>
              <span className="cockpit-controls__label">360° 环视</span>
              <ActionButton action="look" onClick={lockLook} disabled={walkLocked} title="锁定鼠标环视">
                {walkLocked ? "已锁定" : "锁定"}
              </ActionButton>
            </div>
            <div className="cockpit-controls__row">
              <span className="cockpit-controls__key">Esc</span>
              <span className="cockpit-controls__label">退出座舱</span>
              <ActionButton action="exit" onClick={() => requestCockpitCommand("exit")} title="回到甲板漫游">
                退出
              </ActionButton>
            </div>
          </div>
        </div>
      ) : null}

      <div className="cockpit-controls__note">
        {walkLocked
          ? "鼠标已锁定：按 Esc 释放后才能点击按钮，再按 H 收起面板。"
          : "点击画面重新锁定鼠标环视 · 按 H 收起面板。"}
      </div>
    </section>
  );
}
