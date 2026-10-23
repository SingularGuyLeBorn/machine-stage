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

// [OM-FREEPLAY] 传播延迟与蓄能时长为展示取值；红束局部时钟从分体展开两秒后起算。
// 双天线使用同一延迟，不混入零件索引相位，尖端充满后才允许发射。
export const RED_FEED_DELAY = { core: 0, mount: 0.25, tip: 0.55, fire: 1.2 };
export function sampleRedTransit(time, delay = 0) {
  if (time === null || time < 0) return 0;
  const charge = smooth((time - delay) / 0.55);
  const fire = smooth((time - RED_FEED_DELAY.fire) / 0.18);
  return charge * (1 - fire * 0.12 + fire * 0.12 * Math.cos((time - RED_FEED_DELAY.fire) * 5) ** 2);
}
export function redRayPower(time) {
  return time === null ? 0 : smooth((time - RED_FEED_DELAY.fire) / 0.18);
}
