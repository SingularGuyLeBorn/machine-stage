// 光线技能的供能时序；纯数学采样可直接用于浏览器、测试和离线验收。
// [OM-FREEPLAY] 延迟与包络是当前金古桥展示的艺术取值，不是官方技术设定。
export const TRANSIT_DELAY = { core: 0, legs: 0, chest: 0.38, arms: 0.55, head: 0.78, screen: 1.05 };
const smooth = (x) => {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
};
export function transitArrival(time, delay) {
  return time === null ? 1 : smooth((time - delay) / 0.32);
}
export function sampleTransit(time, delay) {
  if (time === null || time < 0) return 0;
  const local = time - delay;
  const envelope = smooth(local / 0.32) * (1 - smooth((local - 3.8) / 0.65));
  // 同一波形沿阶段延迟，增强时也不把变化的速度乘绝对时间。
  return envelope * (0.82 + 0.18 * Math.cos((local * Math.PI * 2) / 0.72) ** 2);
}
