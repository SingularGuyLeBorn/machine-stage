import type { AssembledModel } from "../../assembler/assembler";
import type { KingJoeState } from "./motion";
import { kingJoeSoundEvents, type KingJoeSoundEvent } from "./soundScore";

// ============================================================================
// models/kingjoe/audio —— 程序化音效（无外部音频资产）
//
// 锁环咔哒、重踏步、伺服、充能与怪光线全部用 Web Audio 现场合成；
// 与 soundScore 的事件谱同步，不另设独立时间轴。
// 音频引擎只在浏览器创建；测试/服务端环境自动退化为空实现。
// ============================================================================

type AudioContextCtor = typeof AudioContext;

function audioContextCtor(): AudioContextCtor | null {
  if (typeof window === "undefined") return null;
  const ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
  return ctor ?? null;
}

export class KingJoeAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private streamNode: MediaStreamAudioDestinationNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private previous: KingJoeState | null = null;
  private previousT = 0;
  private chargeOsc: OscillatorNode | null = null;
  private chargeGain: GainNode | null = null;
  private disposed = false;

  constructor() {
    if (typeof window === "undefined") return;
    (window as unknown as { __kingjoeAudio?: KingJoeAudio }).__kingjoeAudio = this;
    window.addEventListener("pointerdown", this.unlock, { once: true, passive: true });
  }

  private unlock = (): void => {
    this.ensure();
  };

  /** 幂等创建/恢复 AudioContext；录屏前也可主动调用。 */
  ensure(): AudioContext | null {
    if (this.disposed) return null;
    if (!this.ctx) {
      const Ctor = audioContextCtor();
      if (!Ctor) return null;
      let ctx: AudioContext;
      try {
        ctx = new Ctor();
      } catch {
        return null;
      }
      const master = ctx.createGain();
      master.gain.value = 0.55;
      master.connect(ctx.destination);
      const streamNode = ctx.createMediaStreamDestination();
      master.connect(streamNode);
      this.ctx = ctx;
      this.master = master;
      this.streamNode = streamNode;
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  get stream(): MediaStream | null {
    this.ensure();
    return this.streamNode?.stream ?? null;
  }

  update(state: KingJoeState, t: number): void {
    const events = kingJoeSoundEvents(state, this.previous, this.previousT, t);
    this.previous = state;
    this.previousT = t;
    if (!events.length) return;
    const ctx = this.ensure();
    if (!ctx) return;
    for (const event of events) this.play(ctx, event);
  }

  dispose(): void {
    this.disposed = true;
    if (typeof window !== "undefined") {
      window.removeEventListener("pointerdown", this.unlock);
      if ((window as unknown as { __kingjoeAudio?: KingJoeAudio }).__kingjoeAudio === this) {
        delete (window as unknown as { __kingjoeAudio?: KingJoeAudio }).__kingjoeAudio;
      }
    }
    this.stopCharge();
    if (this.ctx) void this.ctx.close();
    this.ctx = null;
    this.master = null;
    this.streamNode = null;
    this.noiseBuffer = null;
  }

  private play(ctx: AudioContext, event: KingJoeSoundEvent): void {
    const s = Math.min(1.3, Math.max(0, event.strength));
    switch (event.kind) {
      case "lock": {
        const at = ctx.currentTime + 0.005;
        this.noiseHit(ctx, at, "bandpass", 950, 5, 0.5 * s, 0.13);
        this.noiseHit(ctx, at + 0.055, "bandpass", 1850, 9, 0.3 * s, 0.09);
        this.tone(ctx, "sine", at, 92, 58, 0.42 * s, 0.24);
        this.tone(ctx, "triangle", at, 2500, 2000, 0.1 * s, 0.045);
        break;
      }
      case "unlock": {
        const at = ctx.currentTime + 0.005;
        this.noiseHit(ctx, at, "bandpass", 600, 4, 0.42 * s, 0.18);
        this.noiseHit(ctx, at + 0.04, "highpass", 1600, 0.7, 0.2 * s, 0.26);
        this.tone(ctx, "sine", at, 78, 46, 0.38 * s, 0.3);
        break;
      }
      case "footstep": {
        const at = ctx.currentTime + 0.005;
        this.noiseHit(ctx, at, "lowpass", 220, 0.8, 0.34 * s, 0.16);
        this.tone(ctx, "sine", at, 64, 38, 0.5 * s, 0.26);
        break;
      }
      case "servo": {
        const at = ctx.currentTime + 0.005;
        this.tone(ctx, "sawtooth", at, 92, 138, 0.055 * s, 0.48);
        this.noiseHit(ctx, at, "highpass", 900, 0.7, 0.035 * s, 0.4);
        break;
      }
      case "charge": {
        this.stopCharge();
        const at = ctx.currentTime + 0.005;
        const osc = ctx.createOscillator();
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(120, at);
        osc.frequency.exponentialRampToValueAtTime(720, at + 1.05);
        const filter = ctx.createBiquadFilter();
        filter.type = "bandpass";
        filter.frequency.setValueAtTime(420, at);
        filter.frequency.exponentialRampToValueAtTime(1500, at + 1.05);
        filter.Q.value = 1.4;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.0001, at);
        gain.gain.exponentialRampToValueAtTime(0.075 * s, at + 0.85);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + 1.06);
        osc.connect(filter).connect(gain).connect(this.master!);
        osc.start(at);
        osc.stop(at + 1.1);
        this.chargeOsc = osc;
        this.chargeGain = gain;
        break;
      }
      case "beam": {
        this.stopCharge();
        const at = ctx.currentTime + 0.005;
        this.noiseHit(ctx, at, "highpass", 900, 0.7, 0.42 * s, 0.5);
        this.tone(ctx, "sine", at, 74, 32, 0.5 * s, 0.45);
        this.tone(ctx, "square", at, 940, 180, 0.07 * s, 0.13);
        break;
      }
    }
  }

  private stopCharge(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    if (this.chargeGain) {
      const now = ctx.currentTime;
      this.chargeGain.gain.cancelScheduledValues(now);
      this.chargeGain.gain.setValueAtTime(Math.max(0.0001, this.chargeGain.gain.value), now);
      this.chargeGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.03);
    }
    if (this.chargeOsc) {
      try {
        this.chargeOsc.stop(ctx.currentTime + 0.04);
      } catch {
        /* 已停止 */
      }
    }
    this.chargeOsc = null;
    this.chargeGain = null;
  }

  private noiseHit(
    ctx: AudioContext,
    at: number,
    type: BiquadFilterType,
    frequency: number,
    q: number,
    gainValue: number,
    duration: number,
  ): void {
    const source = ctx.createBufferSource();
    source.buffer = this.noise(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, gainValue), at + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    source.connect(filter).connect(gain).connect(this.master!);
    source.start(at);
    source.stop(at + duration + 0.03);
  }

  private tone(
    ctx: AudioContext,
    type: OscillatorType,
    at: number,
    from: number,
    to: number,
    gainValue: number,
    duration: number,
  ): void {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, at);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), at + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, gainValue), at + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    osc.connect(gain).connect(this.master!);
    osc.start(at);
    osc.stop(at + duration + 0.03);
  }

  private noise(ctx: AudioContext): AudioBuffer {
    if (this.noiseBuffer) return this.noiseBuffer;
    const length = Math.floor(ctx.sampleRate * 0.5);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let seed = 48271;
    for (let i = 0; i < length; i++) {
      seed = (seed * 16807) % 2147483647;
      data[i] = (seed / 2147483647) * 2 - 1;
    }
    this.noiseBuffer = buffer;
    return buffer;
  }
}

const registry = new WeakMap<AssembledModel, KingJoeAudio>();

export function getKingJoeAudio(assembled: AssembledModel): KingJoeAudio {
  let audio = registry.get(assembled);
  if (!audio) {
    audio = new KingJoeAudio();
    registry.set(assembled, audio);
    const originalDispose = assembled.dispose.bind(assembled);
    assembled.dispose = () => {
      audio?.dispose();
      originalDispose();
    };
  }
  return audio;
}
