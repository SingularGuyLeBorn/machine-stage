// 有界多体展示轨迹；纯函数、无逐帧积分和随机数，可在浏览器与离线采样脚本中复用。
// [OM-FREEPLAY] 轨道半径、频率、相位与放电周期是原创佩丹场设计，并非真实引力解。
export const CORE_MODES = ["orbit", "triad", "hierarchy"];
export const CORE_LIMIT = 0.58;
const tau = Math.PI * 2;
const mod = (x, n) => ((x % n) + n) % n;
function turn([x, y, z], tilt, precession) {
  const yy = y * Math.cos(tilt) - z * Math.sin(tilt);
  const zz = y * Math.sin(tilt) + z * Math.cos(tilt);
  return [
    x * Math.cos(precession) + zz * Math.sin(precession),
    yy,
    -x * Math.sin(precession) + zz * Math.cos(precession),
  ];
}
export function coreBreath(time, seed) {
  const phase = mod(seed, 4) * 1.63;
  const wave = 0.5 + 0.5 * Math.sin(time * 0.95 + phase + 0.35 * Math.sin(time * 0.43 + phase));
  return wave * wave;
}
export function sampleCore(time, seed, mode = "triad") {
  if (!CORE_MODES.includes(mode)) throw new Error(`未知核心模式: ${mode}`);
  const phase = seed * 0.73;
  const breath = coreBreath(time, seed);
  const angle =
    mode === "orbit"
      ? time * 0.55 + 0.3 * Math.sin(time * 0.47 + phase)
      : time * 0.45 + 0.65 * Math.sin(time * 0.71 + phase) + 0.2 * Math.sin(time * 1.13 + phase);
  const tilt = 0.45 + 0.45 * Math.sin(time * 0.31 + phase);
  const precession = time * 0.13 + 0.25 * Math.sin(time * 0.37 + phase);
  const drift = [
    0.012 * Math.sin(time * 0.67 + phase),
    0.012 * Math.sin(time * 0.83 + phase),
    0.012 * Math.cos(time * 0.53 + phase),
  ];
  const bodies = [];
  for (let group = 0; group < 3; group++) {
    const p =
      angle +
      phase +
      (group * tau) / 3 +
      (mode === "orbit" ? 0 : 0.18 * Math.sin(time * (0.61 + group * 0.13) + group));
    const radius =
      mode === "hierarchy"
        ? 0.4 + 0.025 * Math.sin(time * 0.79 + group + phase)
        : 0.385 + 0.045 * Math.sin(time * (0.63 + group * 0.11) + group + phase);
    const hub = [radius * Math.cos(p), 0.025 * Math.sin(time * 0.73 + group + phase), radius * Math.sin(p)];
    const count = mode === "hierarchy" ? 2 : 1;
    for (let member = 0; member < count; member++) {
      const local = [...hub];
      if (count === 2) {
        const binary = time * (1.45 + group * 0.21) + 0.4 * Math.sin(time * 0.87 + group) + member * Math.PI;
        const offset = turn(
          [0.055 * Math.cos(binary), 0, 0.055 * Math.sin(binary)],
          0.6 + group * 0.65,
          group * 0.8,
        );
        for (let j = 0; j < 3; j++) local[j] += offset[j];
      }
      const position = turn(local, tilt, precession).map((v, j) => v + drift[j]);
      bodies.push({
        position,
        radius: count === 2 ? 0.037 : 0.075,
        spin: [time * (1.1 + group * 0.23), -time * (0.7 + member * 0.3), p * 0.35],
      });
    }
  }
  const period = 5.7 + mod(seed, 5) * 0.31;
  const clock = time / period + seed * 0.173;
  const arcPhase = mod(clock, 1);
  const arc = arcPhase < 0.055 ? Math.sin((Math.PI * arcPhase) / 0.055) ** 2 : 0;
  const target = mod(Math.floor(clock), bodies.length);
  return {
    bodies,
    breath,
    coreScale: 0.68 + 0.55 * breath,
    arc,
    target,
    source: mod(Math.floor(clock), 2) === 0 ? -1 : mod(target + 1, bodies.length),
  };
}
