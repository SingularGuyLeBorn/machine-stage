import type { BuildLayer, GeometrySpec, MateSpec, PartDefinition } from "../../registry/types";
import { KJ } from "./constants";
import {
  HYDRAULICS,
  NOZZLE_LOCAL,
  add,
  along,
  hydraulicLength,
  hydraulicNodeName,
  nodeOrigin,
  restDirection,
  rotationFromY,
  scale,
  sideSign,
  type DockSpec,
  type HydraulicSpec,
  type Side,
  type Vec3,
} from "./rig";

// ============================================================================
// models/kingjoe/helpers —— 零件生成器
//
// 纪律：
//   · 每个零件有唯一 partId，尺寸/位置全部引用 constants / rig；
//   · 所有 «贴着/套着/穿过» 的配合都留 5–20mm 间隙或做成开孔管件，
//     让穿模检测在装配态与全程对接扫掠里都能真的归零；
//   · 重复件用 instances + instance_nodes + instance_layout，不手写 N 份。
// ============================================================================

export interface DraftPart extends PartDefinition {
  layer: BuildLayer;
  /** 生成顺序（同层内排序用）。 */
  seq: number;
}

const MODULE_RANK: Record<string, number> = { legs: 0, stomach: 1, chest: 2, ship: 3 };

export class KingJoeParts {
  readonly drafts: DraftPart[] = [];
  private seq = 0;

  add(
    input: Omit<PartDefinition, "build_layer" | "build_order"> & {
      layer: BuildLayer;
    },
  ): void {
    this.drafts.push({
      ...input,
      build_layer: input.layer,
      build_order: 0,
      layer: input.layer,
      seq: this.seq++,
    });
  }

  /** 按层排序 → 层内按 腿/腹/胸/头 组装；build_order 全局单调、层间留出校验区间。 */
  finalize(): PartDefinition[] {
    const sorted = [...this.drafts].sort(
      (a, b) =>
        a.build_layer - b.build_layer ||
        (MODULE_RANK[a.assembly] ?? 9) - (MODULE_RANK[b.assembly] ?? 9) ||
        a.seq - b.seq,
    );
    const starts: Record<number, number> = { 1: 100, 2: 300, 3: 400, 4: 500, 5: 600 };
    const counters: Record<number, number> = { ...starts };
    let previous = 99;
    for (const draft of sorted) {
      const floor = Math.max(starts[draft.build_layer] ?? 600, previous + 1);
      counters[draft.build_layer] = Math.max(counters[draft.build_layer] ?? floor, floor);
      const order = counters[draft.build_layer]!;
      counters[draft.build_layer] = order + 1;
      previous = order;
      draft.build_order = order;
    }
    return sorted.map(({ layer: _layer, seq: _seq, ...part }) => part);
  }
}

export const pid = (assembly: string, name: string): string => `kingjoe.${assembly}.${name}`;

export function local(node: string, world: Vec3): Vec3 {
  const origin = nodeOrigin(node);
  return [world[0] - origin[0], world[1] - origin[1], world[2] - origin[2]];
}

export function absMate(position: Vec3, rotation?: Vec3): MateSpec {
  return rotation ? { type: "absolute", position, rotation } : { type: "absolute", position };
}

/** 贴到目标节点原点的局部位置（node 已给定时使用）。 */
export function mateAt(node: string, worldPosition: Vec3, rotation?: Vec3): MateSpec {
  return absMate(local(node, worldPosition), rotation);
}

// ---------------------------------------------------------------------------
// 液压缸：每缸 8 个具名件（缸体 / 后盖 / 导向套 / 活塞 / 活塞杆 / 耳环 / 销轴×2 / 密封）
// ---------------------------------------------------------------------------

const GLAND_L = 0.06;
const CAP_T = 0.035;
const PIN_GAP = 0.085;

export function addHydraulic(builder: KingJoeParts, spec: HydraulicSpec): void {
  const assembly =
    spec.id.startsWith("hip") || spec.id.startsWith("knee") || spec.id.startsWith("ankle") ? "legs" : "chest";
  const prefix = pid(assembly, `hyd_${spec.id}_${spec.side}`);
  const dir = restDirection(spec);
  const rotation = rotationFromY(dir);
  const rodNode = hydraulicNodeName(spec.id, spec.side);
  const L = hydraulicLength(spec);
  const barrelLen = KJ.HYD_BARREL_L;
  const barrelCenter = add(spec.exit, scale(dir, -(GLAND_L + 0.002 + barrelLen / 2)));
  const capCenter = add(spec.exit, scale(dir, -(GLAND_L + 0.004 + barrelLen + CAP_T / 2)));
  const glandCenter = add(spec.exit, scale(dir, -GLAND_L / 2));
  const pistonCenter = add(spec.exit, scale(dir, -(GLAND_L + barrelLen * 0.58)));
  const sealCenter = add(spec.exit, scale(dir, GLAND_L * 0.35));

  builder.add({
    id: `${prefix}_barrel`,
    name_cn: `${spec.joint}缸体`,
    name_en: `${spec.joint} cylinder barrel`,
    assembly,
    layer: 1,
    geometry: {
      type: "tube",
      rOuter: KJ.HYD_BARREL_R,
      rInner: KJ.HYD_BARREL_RI,
      h: barrelLen,
      segments: 20,
    },
    material: "joint_steel",
    node: spec.barrelNode,
    mate: mateAt(spec.barrelNode, barrelCenter, rotation),
    hint: `${spec.id}/${spec.side} 缸体与杆件同轴；检查 HYD_BARREL_* 与 rig 出口 E`,
    source: "液压缸零件级拆解：缸体/后盖/导向套/活塞/活塞杆/耳环/销/密封",
  });
  builder.add({
    id: `${prefix}_cap`,
    name_cn: `${spec.joint}缸后盖`,
    name_en: `${spec.joint} cylinder rear cap`,
    assembly,
    layer: 1,
    geometry: { type: "cylinder", r: KJ.HYD_BARREL_R + 0.012, h: CAP_T, segments: 20, bevel: 0.004 },
    material: "silver_dark",
    node: spec.barrelNode,
    mate: mateAt(spec.barrelNode, capCenter, rotation),
  });
  builder.add({
    id: `${prefix}_gland`,
    name_cn: `${spec.joint}导向套`,
    name_en: `${spec.joint} rod gland`,
    assembly,
    layer: 2,
    geometry: { type: "tube", rOuter: KJ.HYD_GLAND_R, rInner: 0.052, h: GLAND_L, segments: 20 },
    material: "gold_dark",
    node: spec.barrelNode,
    mate: mateAt(spec.barrelNode, glandCenter, rotation),
    hint: "导向套内孔大于活塞杆 34mm 杆径，杆件回缩时从内孔滑入",
  });
  builder.add({
    id: `${prefix}_piston`,
    name_cn: `${spec.joint}活塞`,
    name_en: `${spec.joint} piston`,
    assembly,
    layer: 2,
    geometry: { type: "cylinder", r: KJ.HYD_PISTON_R, h: KJ.HYD_PISTON_H, segments: 18, bevel: 0.002 },
    material: "copper",
    node: spec.barrelNode,
    mate: mateAt(spec.barrelNode, pistonCenter, rotation),
  });
  builder.add({
    id: `${prefix}_rod`,
    name_cn: `${spec.joint}活塞杆`,
    name_en: `${spec.joint} piston rod`,
    assembly,
    layer: 2,
    geometry: { type: "cylinder", r: KJ.HYD_ROD_R, h: L, segments: 16, bevel: 0.0015 },
    material: "silver_bright",
    node: rodNode,
    mate: absMate([0, L / 2, 0]),
    hint: "活杆节点原点在缸筒出口，+Y 指向耳环；motion 按实际缸长平移",
  });
  builder.add({
    id: `${prefix}_clevis`,
    name_cn: `${spec.joint}耳环`,
    name_en: `${spec.joint} rod clevis`,
    assembly,
    layer: 2,
    geometry: {
      type: "merge",
      parts: [
        { type: "box", w: 0.026, h: 0.15, d: 0.06, bevel: 0.004, at: [-0.055, 0.045, 0] },
        { type: "box", w: 0.026, h: 0.15, d: 0.06, bevel: 0.004, at: [0.055, 0.045, 0] },
        { type: "box", w: 0.15, h: 0.02, d: 0.06, bevel: 0.004, at: [0, 0.015, 0] },
      ],
    },
    material: "silver_dark",
    node: rodNode,
    mate: absMate([0, L, 0]),
  });
  builder.add({
    id: `${prefix}_pin`,
    name_cn: `${spec.joint}耳环销`,
    name_en: `${spec.joint} clevis pin`,
    assembly,
    layer: 2,
    geometry: { type: "cylinder", r: 0.014, h: 0.05, segments: 12, bevel: 0.002 },
    material: "silver_bright",
    node: rodNode,
    mate: absMate([-PIN_GAP, L + 0.06, 0], [0, 0, 90]),
    instances: 2,
    indexed: true,
    instance_nodes: [rodNode, rodNode],
    instance_layout: `kjClevisPin_${spec.id}_${spec.side}`,
  });
  builder.add({
    id: `${prefix}_seal`,
    name_cn: `${spec.joint}杆密封`,
    name_en: `${spec.joint} rod seal`,
    assembly,
    layer: 2,
    geometry: {
      type: "tube",
      rOuter: KJ.HYD_GLAND_R + 0.012,
      rInner: KJ.HYD_GLAND_R + 0.002,
      h: 0.014,
      segments: 20,
    },
    material: "rubber",
    node: spec.barrelNode,
    mate: mateAt(spec.barrelNode, sealCenter, rotation),
  });

  if (spec.mount) {
    const clampCenter = add(spec.exit, scale(dir, -(GLAND_L + barrelLen * 0.38)));
    const ux = spec.mount[0] - clampCenter[0];
    const uy = spec.mount[1] - clampCenter[1];
    const uz = spec.mount[2] - clampCenter[2];
    const len = Math.hypot(ux, uy, uz) || 1;
    const u: Vec3 = [ux / len, uy / len, uz / len];
    const outerR = KJ.HYD_BARREL_R + 0.03;
    const start = add(clampCenter, scale(u, outerR + 0.027));
    const end = add(spec.mount, scale(u, -0.023));
    builder.add({
      id: `${prefix}_clamp`,
      name_cn: `${spec.joint}缸抱箍`,
      name_en: `${spec.joint} cylinder clamp`,
      assembly,
      layer: 2,
      geometry: { type: "tube", rOuter: outerR, rInner: KJ.HYD_BARREL_R + 0.001, h: 0.05, segments: 20 },
      material: "gold_dark",
      node: spec.barrelNode,
      mate: mateAt(spec.barrelNode, clampCenter, rotation),
    });
    builder.add({
      id: `${prefix}_bracket`,
      name_cn: `${spec.joint}缸支架`,
      name_en: `${spec.joint} cylinder bracket`,
      assembly,
      layer: 2,
      geometry: {
        type: "weld",
        from: local(spec.barrelNode, start),
        to: local(spec.barrelNode, end),
        radius: 0.022,
        seed: 13,
      },
      material: "silver_dark",
      node: spec.barrelNode,
      mate: absMate([0, 0, 0]),
    });
  }
}

// ---------------------------------------------------------------------------
// 轴向对接环（上模块底面 pin/锁环 + 下模块顶面 socket/钩）
// ---------------------------------------------------------------------------

export function addAxialDock(builder: KingJoeParts, dock: DockSpec): void {
  // 胸↔腹接口的下半部分随腰部上段旋转；腿↔腹接口仍在腹部底端（不动）。
  const dockLowerNode = dock.id === "chest_stomach" ? "waist" : dock.lowerNode;
  const upperOrigin = nodeOrigin(dock.upperNode);
  const lowerOrigin = nodeOrigin(dockLowerNode);
  const upperPrefix = pid(dock.upper, `dock_${dock.id}`);
  const lowerPrefix = pid(dock.lower, `dock_${dock.id}`);
  const upperYLocal = dock.upperY - upperOrigin[1];
  const lowerTopLocal = dock.lowerTopY - lowerOrigin[1];
  const collarH = dock.collarH;

  // —— 上模块：接口承力块 / 底面框 / 锥销 / 定位销 / 锁环 / 锁爪 / 导轨 / 传感器 ——
  builder.add({
    id: `${upperPrefix}_block`,
    name_cn: "对接承力块",
    name_en: "dock interface block",
    assembly: dock.upper,
    layer: 1,
    geometry: { type: "cylinder", r: 0.78, h: 0.18, segments: 40, bevel: 0.012 },
    material: "joint_steel",
    node: dock.upperNode,
    mate: absMate([0, upperYLocal + 0.13, 0]),
    hint: "上模块通过 780mm 承力块把对接载荷传入骨架；销/锁环都不直接吃主结构弯矩",
  });
  builder.add({
    id: `${upperPrefix}_base_frame`,
    name_cn: "对接底面框",
    name_en: "dock base frame",
    assembly: dock.upper,
    layer: 1,
    geometry: { type: "tube", rOuter: 0.8, rInner: 0.44, h: 0.04, segments: 40 },
    material: "silver_dark",
    node: dock.upperNode,
    mate: absMate([0, upperYLocal + 0.24, 0]),
  });
  builder.add({
    id: `${upperPrefix}_guide_pin`,
    name_cn: "锥形导向销",
    name_en: "tapered guide pin",
    assembly: dock.upper,
    layer: 1,
    geometry: { type: "cylinder", r: 0.03, rTop: KJ.PIN_R, h: KJ.PIN_LEN, segments: 16 },
    material: "silver_bright",
    node: dock.upperNode,
    mate: absMate([0, upperYLocal - 0.062, 0]),
    instances: 4,
    indexed: true,
    instance_layout: "kjDockPins",
    hint: "锥形销先粗导向；销径 45mm / 座孔 56mm，单边 11mm 导入间隙",
  });
  builder.add({
    id: `${upperPrefix}_dowel`,
    name_cn: "圆柱定位销",
    name_en: "cylindrical locating dowel",
    assembly: dock.upper,
    layer: 2,
    geometry: { type: "cylinder", r: KJ.DOWEL_R, h: KJ.DOWEL_LEN, segments: 14 },
    material: "silver",
    node: dock.upperNode,
    mate: absMate([0, upperYLocal - 0.032, 0]),
    instances: 2,
    indexed: true,
    instance_layout: "kjDockDowels",
  });
  builder.add({
    id: `${upperPrefix}_contact_seal`,
    name_cn: "端面密封环",
    name_en: "face seal ring",
    assembly: dock.upper,
    layer: 4,
    geometry: { type: "tube", rOuter: 0.48, rInner: 0.44, h: 0.016, segments: 36 },
    material: "rubber",
    node: dock.upperNode,
    mate: absMate([0, upperYLocal + 0.015, 0]),
  });
  builder.add({
    id: `${upperPrefix}_lock_ring`,
    name_cn: "锁环",
    name_en: "locking collar",
    assembly: dock.upper,
    layer: 2,
    geometry: { type: "tube", rOuter: KJ.DOCK_RING_RO, rInner: KJ.DOCK_RING_RI, h: 0.05, segments: 36 },
    material: "gold",
    node: dock.lockNode,
    mate: absMate([0, 0, 0]),
    hint: "锁环绕 Y 轴旋 30°；凸爪从环下方伸到锁钩上方 7mm 处",
  });
  builder.add({
    id: `${upperPrefix}_lock_lug`,
    name_cn: "锁环凸爪",
    name_en: "lock lug",
    assembly: dock.upper,
    layer: 2,
    geometry: {
      type: "merge",
      parts: [
        { type: "box", w: 0.025, h: 0.05, d: 0.1, bevel: 0.004, at: [0.655, -0.022, 0] },
        { type: "box", w: 0.13, h: 0.02, d: 0.1, bevel: 0.004, at: [0.6, -0.043, 0] },
      ],
    },
    material: "gold_dark",
    node: dock.lockNode,
    mate: absMate([0, 0, 0]),
    instances: 4,
    indexed: true,
    instance_nodes: [dock.lockNode, dock.lockNode, dock.lockNode, dock.lockNode],
    instance_layout: "kjDockLugs",
  });
  builder.add({
    id: `${upperPrefix}_lock_bearing`,
    name_cn: "锁环轴承",
    name_en: "lock ring bearing",
    assembly: dock.upper,
    layer: 2,
    geometry: { type: "tube", rOuter: 0.55, rInner: 0.525, h: 0.04, segments: 32 },
    material: "joint_steel",
    node: dock.lockNode,
    mate: absMate([0, 0.045, 0]),
  });
  builder.add({
    id: `${upperPrefix}_lock_seat`,
    name_cn: "锁环固定座",
    name_en: "lock ring seat",
    assembly: dock.upper,
    layer: 1,
    geometry: { type: "tube", rOuter: 0.64, rInner: 0.56, h: 0.07, segments: 32 },
    material: "silver_dark",
    node: dock.upperNode,
    mate: absMate([0, upperYLocal + 0.003, 0]),
  });
  builder.add({
    id: `${upperPrefix}_align_rail`,
    name_cn: "对接导轨",
    name_en: "alignment rail",
    assembly: dock.upper,
    layer: 2,
    geometry: { type: "box", w: 0.06, h: 0.24, d: 0.05, bevel: 0.006 },
    material: "silver_dark",
    node: dock.upperNode,
    mate: absMate([0, upperYLocal - 0.09, 0.1]),
    instances: 2,
    indexed: true,
    instance_layout: "kjMirrorX074",
  });
  builder.add({
    id: `${upperPrefix}_sensor`,
    name_cn: "对接到位传感器",
    name_en: "dock proximity sensor",
    assembly: dock.upper,
    layer: 4,
    geometry: { type: "cylinder", r: 0.035, h: 0.03, segments: 12, bevel: 0.003 },
    material: "sensor_red",
    node: dock.upperNode,
    mate: absMate([0, upperYLocal + 0.025, 0]),
    instances: 2,
    indexed: true,
    instance_layout: "kjMirrorX07",
  });

  // —— 下模块：顶承盘 / 环座 / 锥销座 / 销孔 / 锁钩 / 导轨承块 ——
  builder.add({
    id: `${lowerPrefix}_base`,
    name_cn: "对接基盘",
    name_en: "dock base disk",
    assembly: dock.lower,
    layer: 1,
    geometry: { type: "cylinder", r: 0.55, h: 0.03, segments: 40, bevel: 0.004 },
    material: "joint_steel",
    node: dockLowerNode,
    mate: absMate([0, lowerTopLocal + 0.015, 0]),
  });
  builder.add({
    id: `${lowerPrefix}_collar`,
    name_cn: "对接环座",
    name_en: "dock collar",
    assembly: dock.lower,
    layer: 1,
    geometry: { type: "tube", rOuter: 0.52, rInner: 0.44, h: collarH - 0.03, segments: 40 },
    material: "silver_dark",
    node: dockLowerNode,
    mate: absMate([0, lowerTopLocal + 0.03 + (collarH - 0.03) / 2, 0]),
    source: "环座高 220mm，锥销完全落在环座高度内，销尖不触及下模块顶板",
  });
  builder.add({
    id: `${lowerPrefix}_socket`,
    name_cn: "锥销承座",
    name_en: "pin socket",
    assembly: dock.lower,
    layer: 2,
    geometry: { type: "tube", rOuter: KJ.SOCKET_RO, rInner: KJ.SOCKET_RI, h: collarH - 0.06, segments: 16 },
    material: "gold_dark",
    node: dockLowerNode,
    mate: absMate([0, lowerTopLocal + 0.03 + (collarH - 0.06) / 2, 0]),
    instances: 4,
    indexed: true,
    instance_layout: "kjDockPins",
  });
  builder.add({
    id: `${lowerPrefix}_dowel_bore`,
    name_cn: "定位销孔",
    name_en: "dowel bore",
    assembly: dock.lower,
    layer: 2,
    geometry: { type: "tube", rOuter: KJ.BORE_RO, rInner: KJ.BORE_RI, h: collarH - 0.06, segments: 16 },
    material: "joint_steel",
    node: dockLowerNode,
    mate: absMate([0, lowerTopLocal + 0.03 + (collarH - 0.06) / 2, 0]),
    instances: 2,
    indexed: true,
    instance_layout: "kjDockDowels",
  });
  builder.add({
    id: `${lowerPrefix}_hook`,
    name_cn: "锁钩",
    name_en: "lock hook",
    assembly: dock.lower,
    layer: 2,
    geometry: { type: "box", w: 0.06, h: 0.04, d: 0.12, bevel: 0.006 },
    material: "gold",
    node: dockLowerNode,
    mate: absMate([0, lowerTopLocal + 0.09, 0]),
    instances: 4,
    indexed: true,
    instance_layout: "kjDockHooks",
  });
  builder.add({
    id: `${lowerPrefix}_guide_block`,
    name_cn: "导轨承块",
    name_en: "guide block",
    assembly: dock.lower,
    layer: 2,
    geometry: { type: "box", w: 0.09, h: 0.18, d: 0.08, bevel: 0.008 },
    material: "silver_dark",
    node: dockLowerNode,
    mate: absMate([0, lowerTopLocal + 0.09, -0.1]),
    instances: 2,
    indexed: true,
    instance_layout: "kjMirrorX074",
  });
}

// ---------------------------------------------------------------------------
// 反重力发生器（外壳框 + 6 悬浮线圈 + 能量核心 + 稳定环 + 冷却套 + 管路）
// ---------------------------------------------------------------------------

export function addAntigravity(
  builder: KingJoeParts,
  module: string,
  center: Vec3,
  scale = 1,
  nodeName = module,
): void {
  const prefix = pid(module, "ag");
  const node = nodeName;
  const H = KJ.AG_H * scale;
  const top = add(center, [0, H / 2, 0]);
  const bottom = add(center, [0, -H / 2, 0]);
  const small = scale < 0.8;

  builder.add({
    id: `${prefix}_top_plate`,
    name_cn: "反重力顶板",
    name_en: "antigrav top plate",
    assembly: module,
    layer: 1,
    geometry: { type: "cylinder", r: 0.31 * scale, h: 0.03, segments: 32, bevel: 0.003 },
    material: "joint_steel",
    node,
    mate: absMate(top),
  });
  builder.add({
    id: `${prefix}_bottom_plate`,
    name_cn: "反重力底板",
    name_en: "antigrav bottom plate",
    assembly: module,
    layer: 1,
    geometry: { type: "cylinder", r: 0.31 * scale, h: 0.03, segments: 32, bevel: 0.003 },
    material: "joint_steel",
    node,
    mate: absMate(bottom),
  });
  builder.add({
    id: `${prefix}_post`,
    name_cn: "反重力框架立柱",
    name_en: "antigrav cage post",
    assembly: module,
    layer: 1,
    geometry: { type: "cylinder", r: Math.max(0.014, 0.026 * scale), h: H - 0.05, segments: 12 },
    material: "silver_dark",
    node,
    mate: absMate(center),
    instances: 4,
    indexed: true,
    instance_layout: small ? (scale < 0.45 ? "kjAgPostsSmall04" : "kjAgPostsSmall") : "kjAgPosts",
  });
  builder.add({
    id: `${prefix}_core`,
    name_cn: "能量核心",
    name_en: "energy core",
    assembly: module,
    layer: 3,
    geometry: {
      type: "cylinder",
      r: 0.06 * scale,
      h: Math.max(0.12, H - 0.08 * scale),
      segments: 18,
      bevel: 0.002,
    },
    material: "servo_blue",
    node,
    mate: absMate(center),
    tags: ["fx"],
  });
  builder.add({
    id: `${prefix}_coil`,
    name_cn: "悬浮线圈",
    name_en: "levitation coil",
    assembly: module,
    layer: 3,
    geometry: {
      type: "kit",
      kit: "kjTorus",
      params: { radius: 0.11 * scale, tube: Math.max(0.014, 0.035 * scale), segments: 26 },
    },
    material: "copper",
    node,
    mate: absMate(center),
    instances: KJ.AG_COIL_COUNT,
    indexed: true,
    instance_layout: small
      ? scale < 0.45
        ? "kjAgCoilsSmall34"
        : "kjAgCoilsSmall"
      : scale < 0.9
        ? "kjAgCoils08"
        : "kjAgCoils",
  });
}

export function addNozzles(
  builder: KingJoeParts,
  module: string,
  options: { parentNode?: string; yOffset?: number } = {},
): void {
  const parentNode = options.parentNode ?? module;
  const yOffset = options.yOffset ?? 0;
  NOZZLE_LOCAL[module].forEach((position, index) => {
    const node = `${module}Nozzle${index}`;
    const prefix = pid(module, `nozzle_${index}`);
    builder.add({
      id: `${prefix}_bell`,
      name_cn: `第 ${index + 1} 喷管`,
      name_en: `nozzle bell ${index + 1}`,
      assembly: module,
      layer: 2,
      geometry: {
        type: "lathe",
        profile: [
          [0.1, 0],
          [0.12, 0.08],
          [0.15, 0.22],
          [0.18, 0.34],
          [0.15, 0.34],
        ],
        segments: 24,
      },
      material: "silver_dark",
      node,
      mate: absMate([0, 0, 0], [-90, 0, 0]),
    });
    builder.add({
      id: `${prefix}_blade`,
      name_cn: `第 ${index + 1} 喷口调节叶片`,
      name_en: `nozzle vane ${index + 1}`,
      assembly: module,
      layer: 2,
      geometry: { type: "box", w: 0.12, h: 0.016, d: 0.16, bevel: 0.003 },
      material: "gold_dark",
      node,
      mate: absMate([0, 0, 0]),
      instances: 3,
      indexed: true,
      instance_nodes: [node, node, node],
      instance_layout: "kjNozzleBlades",
    });
    builder.add({
      id: `${prefix}_gimbal`,
      name_cn: `第 ${index + 1} 喷口方向环`,
      name_en: `nozzle gimbal ring ${index + 1}`,
      assembly: module,
      layer: 2,
      geometry: { type: "tube", rOuter: 0.17, rInner: 0.13, h: 0.05, segments: 24 },
      material: "joint_steel",
      node,
      mate: absMate([0, 0, -0.04], [-90, 0, 0]),
    });
    const outSign = position[0] < 0 ? -1 : 1;
    const actuatorLocal: Vec3 = [
      position[0] + outSign * 0.19,
      position[1] + 0.15 + yOffset,
      position[2] - 0.1,
    ];
    builder.add({
      id: `${prefix}_actuator`,
      name_cn: `第 ${index + 1} 喷口作动器`,
      name_en: `nozzle actuator ${index + 1}`,
      assembly: module,
      layer: 2,
      geometry: { type: "cylinder", r: 0.034, h: 0.13, segments: 14, bevel: 0.003 },
      material: "silver",
      node: parentNode,
      mate: absMate(actuatorLocal),
    });
  });
}

// ---------------------------------------------------------------------------
// 小工具
// ---------------------------------------------------------------------------

/** 一圈螺栓头（合并几何，单件多实例视觉）。 */
export function boltRingPart(
  builder: KingJoeParts,
  options: {
    id: string;
    name_cn: string;
    name_en: string;
    assembly: string;
    node: string;
    world: Vec3;
    count: number;
    radius: number;
    boltR?: number;
    boltH?: number;
    layer?: BuildLayer;
    rotation?: Vec3;
  },
): void {
  builder.add({
    id: options.id,
    name_cn: options.name_cn,
    name_en: options.name_en,
    assembly: options.assembly,
    layer: options.layer ?? 4,
    geometry: {
      type: "boltCircle",
      count: options.count,
      radius: options.radius,
      boltR: options.boltR ?? 0.012,
      boltH: options.boltH ?? 0.016,
    },
    material: "silver_bright",
    node: options.node,
    mate: mateAt(options.node, options.world, options.rotation),
  });
}

/** 一条铆钉带（合并几何）。 */
export function rivetStripPart(
  builder: KingJoeParts,
  options: {
    id: string;
    name_cn: string;
    name_en: string;
    assembly: string;
    node: string;
    world: Vec3;
    count: number;
    spacing: number;
    rotation?: Vec3;
    layer?: BuildLayer;
  },
): void {
  builder.add({
    id: options.id,
    name_cn: options.name_cn,
    name_en: options.name_en,
    assembly: options.assembly,
    layer: options.layer ?? 4,
    geometry: { type: "rivets", count: options.count, spacing: options.spacing, radius: 0.008 },
    material: "silver_bright",
    node: options.node,
    mate: mateAt(options.node, options.world, options.rotation),
  });
}

/** 两点之间的圆管（油管/线束）。 */
export function tubeBetween(
  builder: KingJoeParts,
  options: {
    id: string;
    name_cn: string;
    name_en: string;
    assembly: string;
    node: string;
    from: Vec3;
    to: Vec3;
    radius?: number;
    material?: string;
    layer?: BuildLayer;
  },
): void {
  builder.add({
    id: options.id,
    name_cn: options.name_cn,
    name_en: options.name_en,
    assembly: options.assembly,
    layer: options.layer ?? 3,
    geometry: {
      type: "weld",
      from: local(options.node, options.from),
      to: local(options.node, options.to),
      radius: options.radius ?? 0.018,
      seed: 17,
    },
    material: options.material ?? "rubber",
    node: options.node,
    mate: absMate([0, 0, 0]),
  });
}

// 防 tree-shaking 误删（这些工具与生成器同源）
export const __hydraulicCount = HYDRAULICS.length;
export const __sideSign = sideSign;
export const __along = along;
export { sideSign as signOfSide };
export type { Side, Vec3, GeometrySpec };
