import { useEffect, useMemo, useRef, useState } from "react";
import { useStageStore } from "../state/stageStore";

// ============================================================================
// TowerRadio —— 弹射体验的塔台通讯
//
// 不是聊天气泡：一条持续无线电频段 + 打字机报文 + 角色/情绪状态 + 事件 toast。
// 报文更新时不重排整页，只重排 3 条以内的通讯记录。
// ============================================================================

interface RadioLine {
  id: number;
  speaker: string;
  role: string;
  text: string;
  tone: "calm" | "focused" | "urgent" | "warm";
}

const TONE_LABEL: Record<RadioLine["tone"], string> = {
  calm: "平稳",
  focused: "专注",
  urgent: "急促",
  warm: "松弛",
};

function classify(message: string): RadioLine["tone"] {
  if (/弹射|离舰|挡焰板|储能|3…|2…|1…/.test(message)) return "urgent";
  if (/未|偏离|边线|继续|距滑梭|退回/.test(message)) return "calm";
  if (/收到|顺利|准备就绪/.test(message)) return "warm";
  return "focused";
}

export function TowerRadio() {
  const cockpit = useStageStore((state) => state.cockpit);
  const message = cockpit?.message ?? "";
  const [typed, setTyped] = useState("");
  const [history, setHistory] = useState<RadioLine[]>([]);
  const [toast, setToast] = useState<{ id: number; speaker: string; text: string; tone: RadioLine["tone"] } | null>(null);
  const serial = useRef(0);
  const lastMessage = useRef<string | null>(null);
  const toastTimer = useRef<number | null>(null);

  const line = useMemo<RadioLine>(() => {
    const fromPilot = message.startsWith("你：");
    const text = message.replace(/^(你：|塔台：)/, "");
    return {
      id: serial.current,
      speaker: fromPilot ? "你" : "塔台 · 周",
      role: fromPilot ? "飞行员 / PLT" : "航行管制 / TOWER",
      text,
      tone: classify(text),
    };
  }, [message]);

  useEffect(() => {
    if (!message || message === lastMessage.current) return;
    lastMessage.current = message;
    serial.current += 1;
    const entry: RadioLine = { ...line, id: serial.current };
    setHistory((previous) => [entry, ...previous].slice(0, 3));
    setTyped("");
    setToast({ id: entry.id, speaker: entry.speaker, text: entry.text, tone: entry.tone });
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2800);
    // line 跟随 message，一个 message 只记一条。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message]);

  useEffect(() => {
    if (!message) return;
    const text = line.text;
    setTyped("");
    let index = 0;
    const timer = window.setInterval(() => {
      index += 1;
      setTyped(text.slice(0, index));
      if (index >= text.length) window.clearInterval(timer);
    }, 24);
    return () => window.clearInterval(timer);
  }, [line.text, message]);

  useEffect(() => {
    return () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    };
  }, []);

  if (!cockpit?.active) return null;
  return (
    <>
      <section className={`tower-radio tower-radio--${line.tone}`} aria-label="塔台通讯">
        <header className="tower-radio__head">
          <span className="tower-radio__avatar" aria-hidden>{line.speaker.startsWith("你") ? "你" : "周"}</span>
          <span className="tower-radio__signal" aria-hidden>
            <i />
            <i />
            <i />
          </span>
          <div className="tower-radio__ident">
            <strong>{line.speaker}</strong>
            <span>{line.role}</span>
          </div>
          <span className="tower-radio__emotion">{TONE_LABEL[line.tone]}</span>
        </header>
        <p className="tower-radio__message">
          <span className="tower-radio__cursor" aria-hidden />
          {typed}
          <span className="tower-radio__caret" aria-hidden />
        </p>
        {history.length > 1 ? (
          <ol className="tower-radio__log" aria-label="通讯记录">
            {history.slice(1).map((item) => (
              <li key={item.id}>
                <span>{item.speaker}</span>
                {item.text}
              </li>
            ))}
          </ol>
        ) : null}
      </section>

      {toast ? (
        <div className={`tower-toast tower-toast--${toast.tone}`} role="status" key={toast.id}>
          <span className="tower-toast__beam" aria-hidden />
          <div>
            <strong>{toast.speaker}</strong>
            <p>{toast.text}</p>
          </div>
        </div>
      ) : null}
    </>
  );
}
