import type { AssembledModel } from "../../assembler/assembler";
import { Box3, Vector3 } from "three";
import { getModuleEffects, hideModuleEffects } from "./effects";
import { updateModuleIllumination } from "./illumination";

export const MODULE_KEYS = ["legs", "pelvis", "chest", "head_arms"] as const;
export type ModuleKey = (typeof MODULE_KEYS)[number];
export type Offset = [number, number, number];
export type Openings = Record<ModuleKey, number>;
const clamp = (x: number) => Math.max(0, Math.min(1, x));
export const smooth = (x: number) => {
  const t = clamp(x);
  return t * t * (3 - 2 * t);
};

export function moduleOffsets(gap: number): Record<ModuleKey, Offset> {
  return {
    head_arms: [-gap, 1.1, -0.9],
    chest: [0.3, 0.2, 3.4],
    pelvis: [-0.8, -1.4, 2],
    legs: [gap, -0.6, -0.5],
  };
}

/** 从原位直接沿不同的空间曲线飞出，整段连续，没有竖直/横向切段。 */
export function flightOffset(key: ModuleKey, openness: number, gap = 3.8): Offset {
  const u = clamp(openness),
    v = 1 - u;
  // [OM-FREEPLAY] 四条飞行曲线按部件体积安排，控制点不构成停靠点。
  const controls: Record<ModuleKey, [Offset, Offset]> = {
    legs: [
      [0.7, -0.8, -0.35],
      [gap * 0.8, -0.9, -0.7],
    ],
    pelvis: [
      [-0.002, 1.6, 0.003],
      [-0.1, 1.4, 2.3],
    ],
    chest: [
      [0.002, 3, 0.005],
      [0.4, 2.5, 3.6],
    ],
    head_arms: [
      [0, 2.6, -1.3],
      [0, 4.8, -2.4],
    ],
  };
  const [a, b] = controls[key],
    end = moduleOffsets(gap)[key];
  const pose = [0, 1, 2].map(
    (i) => 3 * v * v * u * a[i]! + 3 * v * u * u * b[i]! + u * u * u * end[i]!,
  ) as Offset;
  if (key === "head_arms") {
    const bend = smooth((u - 0.15) / 0.45);
    pose[0] *= bend;
    pose[2] = -0.5 * pose[1] + (pose[2] + 0.5 * pose[1]) * bend - 0.8 * Math.sin(Math.PI * u) ** 2 * bend;
  } else if (key === "pelvis" || key === "chest") {
    const bend = smooth((u - 0.1) / 0.5);
    pose[0] *= bend;
    pose[2] *= bend;
  }
  return pose;
}
export function modulePose(openness: number | Openings, gap = 3.8): Record<ModuleKey, Offset> {
  const pose = Object.fromEntries(
    MODULE_KEYS.map((key) => [
      key,
      flightOffset(key, typeof openness === "number" ? openness : openness[key], gap),
    ]),
  ) as Record<ModuleKey, Offset>;
  // 脱榫期间跟随下方模块的真实位置退出，避免下方的运动反向顶入上方。
  for (let rank = 1; rank < MODULE_KEYS.length; rank++) {
    const key = MODULE_KEYS[rank]!,
      lower = MODULE_KEYS[rank - 1]!;
    const u = typeof openness === "number" ? openness : openness[key];
    const follow = key === "head_arms" ? 1 - smooth((u - 0.7) / 0.3) : 1 - smooth((u - 0.45) / 0.55);
    for (let i = 0; i < 3; i++) pose[key][i]! += pose[lower][i]! * follow;
  }
  return pose;
}

export function moduleMotionBounds(model: AssembledModel): Box3 {
  const bounds = new Box3().setFromObject(model.root);
  for (let i = 0; i <= 100; i++) {
    const pose = modulePose(i / 100, model.constants.DISPLAY_SPACING!);
    for (const key of MODULE_KEYS) {
      const g = model.getPart(`kingjoemodules.${key}.body`)!.geometry;
      g.computeBoundingBox();
      bounds.union(g.boundingBox!.clone().translate(new Vector3(...pose[key])));
    }
  }
  // [OM-FREEPLAY] 覆盖远距轻倾与悬浮的最大包络，防止合体取景裁掉天线。
  return bounds.expandByScalar(0.75);
}

// [OM-FREEPLAY] 先让腿部就位，再腹盆、胸甲、头肩依次完成近距放电和吸合。
export const DOCK_DELAYS: Openings = { legs: 0, pelvis: 1.2, chest: 7.6, head_arms: 14 };
export const COMBINE_DURATION = 20.8;
export function combineOpenness(time: number): number {
  const t = Math.max(0, time);
  if (t < 2.2) return 1 - 0.84 * smooth(t / 2.2);
  const near = t - 2.2,
    ramp = 0.18,
    slow = 3.2,
    endSpeed = 0.006;
  const speed = (0.142 - (endSpeed * slow) / 2) / ((ramp + slow) / 2);
  if (near < ramp) return 0.16 - (0.5 * speed * near * near) / ramp;
  if (near < ramp + slow) {
    const q = near - ramp;
    return 0.16 - 0.5 * speed * ramp - speed * q + ((0.5 * (speed - endSpeed)) / slow) * q * q;
  }
  const pull = near - ramp - slow;
  if (pull < 0.32) {
    const q = pull / 0.32;
    return (
      0.018 * (2 * q * q * q - 3 * q * q + 1) -
      0.006 * 0.32 * (q * q * q - 2 * q * q + q) -
      0.1 * 0.32 * (q * q * q - q * q)
    );
  }
  const bounce = pull - 0.32;
  return bounce >= 0.9
    ? 0
    : 0.009 *
        Math.exp(-5 * bounce) *
        Math.sin((Math.PI * bounce) / 0.3) ** 2 *
        (1 - smooth((bounce - 0.65) / 0.25));
}
export function separationOpenness(time: number): number {
  return smooth(time / 3.9);
}

function inverseClose(from: number): number {
  if (from >= 1) return 0;
  let lo = 0,
    hi = 5.9;
  for (let i = 0; i < 24; i++) {
    const m = (lo + hi) / 2;
    if (combineOpenness(m) > from) lo = m;
    else hi = m;
  }
  return (lo + hi) / 2;
}
interface Playback {
  state: string;
  start: number;
  from: Openings;
  open: Openings;
}
const playback = new WeakMap<AssembledModel, Playback>();
const all = (u: number) => Object.fromEntries(MODULE_KEYS.map((k) => [k, u])) as Openings;

export function animateKingJoeModules(model: AssembledModel, seconds: number, state = "idle"): void {
  let entry = playback.get(model);
  if (!entry || entry.state !== state) {
    const from = entry?.open ?? all(state === "separation" || state === "closed" ? 0 : 1);
    entry = { state, start: seconds, from: { ...from }, open: { ...from } };
    playback.set(model, entry);
  }
  const time = Math.max(0, seconds - entry.start);
  for (const key of MODULE_KEYS) {
    const from = entry.from[key];
    if (state === "combining") {
      const elapsed = (time - DOCK_DELAYS[key]) * (key === "legs" ? 6.8 / 1.2 : 1);
      // 等待期间也沿原飞行曲线慢慢接近；正式进场从等待终点继续，无跳位。
      // [OM-FREEPLAY] 预靠近最多占开放行程的 10%，保留充分的模块间距。
      const drift = DOCK_DELAYS[key] > 0 ? Math.min(0.1, Math.max(0, from - 0.65)) : 0;
      const waiting = from - drift * smooth(time / Math.max(0.001, DOCK_DELAYS[key]));
      entry.open[key] =
        from <= 1e-8 ? 0 : elapsed < 0 ? waiting : combineOpenness(elapsed + inverseClose(from - drift));
    } else if (state === "separation")
      entry.open[key] = from + (1 - from) * separationOpenness(time * (key === "head_arms" ? 3.9 / 2.3 : 1));
    else entry.open[key] = state === "closed" ? 0 : 1;
  }
  const pose = modulePose(entry.open, model.constants.DISPLAY_SPACING!);
  for (const key of MODULE_KEYS) {
    const node = model.getNode(`Module_${key}`)!;
    node.position.set(...pose[key]);
    // 以本体中心轻倾而不是绕世界原点翻转；脱榫/吸合近场严格恢复原配合姿态。
    // 悬浮仅依赖绝对时钟与开放量，同一时刻反向播放也不会跳动。
    const float = smooth((entry.open[key] - 0.4) / 0.6);
    const phase = MODULE_KEYS.indexOf(key) * 1.73;
    node.rotation.set(
      float * (0.065 * Math.sin(seconds * 0.69 + phase)),
      float * (0.08 * Math.sin(seconds * 0.43 + phase)),
      float * (0.09 * Math.cos(seconds * 0.57 + phase)),
    );
    const geometry = model.getPart(`kingjoemodules.${key}.body`)!.geometry;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    const center = geometry.boundingBox!.getCenter(new Vector3());
    node.position.add(center.clone().sub(center.applyQuaternion(node.quaternion)));
    node.position.x += float * 0.045 * Math.sin(seconds * 0.63 + phase);
    node.position.y +=
      float * (0.11 * Math.sin(seconds * 1.1 + phase) + 0.035 * Math.sin(seconds * 1.79 + phase));
    node.position.z += float * 0.045 * Math.cos(seconds * 0.71 + phase);
    const deployment = smooth((entry.open[key] - 0.05) / 0.8);
    for (const side of [-1, 1]) {
      const antenna = model.getNode(`Antenna_${key}_${side < 0 ? "l" : "r"}`);
      if (antenna) {
        antenna.scale.y = 0.001 + 0.999 * deployment;
        antenna.visible = deployment > 0.001;
      }
      if (key === "legs") {
        const vane = model.getNode(`LegVane_${side < 0 ? "l" : "r"}`);
        if (vane) vane.rotation.z = -side * deployment * 1.65;
      }
    }
  }
  updateModuleIllumination(model, seconds);
  if (state === "combining" || state === "separation") {
    model.root.updateMatrixWorld(true);
    getModuleEffects(model).update(seconds, entry.open);
  } else hideModuleEffects(model);
}
