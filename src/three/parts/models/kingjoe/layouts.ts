import * as THREE from "three";
import type { InstanceLayout } from "../../assembler/assembler";
import { KJ } from "./constants";
import { HYDRAULICS, hydraulicLength, hydraulicNodeName } from "./rig";

// ============================================================================
// models/kingjoe/layouts —— 重复件分布
//   · 对接销/座/锁爪/钩：沿 Y 轴圆周均布；
//   · 反重力线圈：沿核心轴向叠 6 层；
//   · 喷口叶片：3 片沿喷管轴线 120° 分布（带 35° 导流角）；
//   · 胸口镶嵌：双 3×4 彩色像素阵列（蓝/玫红/琥珀三色轮流）。
// ============================================================================

const TAU = Math.PI * 2;

function ringLayout(radius: number, offsetDeg = 0): InstanceLayout {
  return ({ index, count }) => {
    const angle = (index / Math.max(count, 1)) * TAU + THREE.MathUtils.degToRad(offsetDeg);
    return new THREE.Matrix4()
      .makeRotationY(angle)
      .multiply(new THREE.Matrix4().makeTranslation(radius, 0, 0));
  };
}

const dockPins = ringLayout(KJ.DOCK_R_PIN, 45);
const dockDowels = ringLayout(KJ.DOCK_R_DOWEL, 0);
const dockLugs: InstanceLayout = ({ index, count }) =>
  new THREE.Matrix4().makeRotationY((index / Math.max(count, 1)) * TAU + THREE.MathUtils.degToRad(45));
const dockHooks = ringLayout(0.55, 0);
const agPosts = ringLayout(0.26, 0);

const mirrorX =
  (offset: number): InstanceLayout =>
  ({ index }) =>
    new THREE.Matrix4().makeTranslation(index === 0 ? -offset : offset, 0, 0);

const agPostsSmall = ringLayout(0.156, 0);
const agPostsSmall04 = ringLayout(0.104, 0);
const agCoilsSmall34: InstanceLayout = ({ index, count }) =>
  new THREE.Matrix4().makeTranslation(0, (index - (count - 1) / 2) * 0.032, 0);

const agCoils08: InstanceLayout = ({ index, count }) =>
  new THREE.Matrix4().makeTranslation(0, (index - (count - 1) / 2) * 0.06, 0);

const agCoilsSmall: InstanceLayout = ({ index, count }) =>
  new THREE.Matrix4().makeTranslation(0, (index - (count - 1) / 2) * 0.038, 0);
const sidePanels: InstanceLayout = ({ index }) =>
  new THREE.Matrix4()
    .makeTranslation(index === 0 ? -0.53 : 0.53, 0, 0)
    .multiply(new THREE.Matrix4().makeRotationY(index === 0 ? -Math.PI / 2 : Math.PI / 2));
const sideLouvers: InstanceLayout = ({ index }) =>
  new THREE.Matrix4()
    .makeTranslation(index === 0 ? -0.565 : 0.565, 0, 0.12)
    .multiply(new THREE.Matrix4().makeRotationY(index === 0 ? -Math.PI / 2 : Math.PI / 2));

const agCoils: InstanceLayout = ({ index, count }) =>
  new THREE.Matrix4().makeTranslation(0, (index - (count - 1) / 2) * 0.08, 0);

const nozzleBlades: InstanceLayout = ({ index, count }) => {
  const angle = (index / Math.max(count, 1)) * TAU;
  return new THREE.Matrix4()
    .makeRotationZ(angle)
    .multiply(new THREE.Matrix4().makeTranslation(0.075, 0, -0.22))
    .multiply(new THREE.Matrix4().makeRotationZ(THREE.MathUtils.degToRad(35)));
};

const clevisPins: Record<string, InstanceLayout> = {};
for (const spec of HYDRAULICS) {
  const L = hydraulicLength(spec);
  const local = new THREE.Matrix4().makeTranslation(0, L + 0.06, 0);
  clevisPins[`kjClevisPin_${spec.id}_${spec.side}`] = ({ index }) =>
    local
      .clone()
      .multiply(new THREE.Matrix4().makeTranslation(0, 0, 0))
      .multiply(new THREE.Matrix4().makeTranslation(index === 0 ? -0.105 : 0.105, 0, 0))
      .multiply(new THREE.Matrix4().makeRotationZ(Math.PI / 2));
  // 注：液压布局不引用节点名，保留 hydraulicNodeName 的调用点给 tree-shaking 与类型检查
  void hydraulicNodeName(spec.id, spec.side);
}

// —— 胸口彩色镶嵌：两块 3×4 阵列 ——
export const MOSAIC_TILE_W = 0.13;
export const MOSAIC_TILE_H = 0.085;
export const MOSAIC_GAP = 0.012;
export const MOSAIC_BACK_Z = 0.64;
export const MOSAIC_TILE_Z = 0.6825;

export interface MosaicSlot {
  x: number;
  y: number;
  z: number;
  color: "blue" | "rose" | "amber" | "green" | "cyan" | "violet";
}

function buildMosaicSlots(): MosaicSlot[] {
  const slots: MosaicSlot[] = [];
  const panelX = [-0.63, 0.63];
  for (let panel = 0; panel < 2; panel++) {
    for (let row = 0; row < 6; row++) {
      for (let col = 0; col < 4; col++) {
        const palette = ["blue", "rose", "amber", "green", "cyan", "violet"] as const;
        const color = palette[(panel * 3 + row * 2 + col) % palette.length]!;
        slots.push({
          x: panelX[panel]! + (col - 1.5) * (MOSAIC_TILE_W + MOSAIC_GAP),
          y: 0.95 + (row - 2.5) * (MOSAIC_TILE_H + MOSAIC_GAP),
          z: MOSAIC_TILE_Z,
          color,
        });
      }
    }
  }
  return slots;
}

export const MOSAIC_SLOTS = buildMosaicSlots();

function mosaicLayout(color: MosaicSlot["color"]): InstanceLayout {
  const filtered = MOSAIC_SLOTS.filter((slot) => slot.color === color);
  return ({ index }) => {
    const slot = filtered[index] ?? filtered[0]!;
    return new THREE.Matrix4().makeTranslation(slot.x, slot.y, slot.z);
  };
}

export const MOSAIC_COUNTS = {
  blue: MOSAIC_SLOTS.filter((slot) => slot.color === "blue").length,
  rose: MOSAIC_SLOTS.filter((slot) => slot.color === "rose").length,
  amber: MOSAIC_SLOTS.filter((slot) => slot.color === "amber").length,
  green: MOSAIC_SLOTS.filter((slot) => slot.color === "green").length,
  cyan: MOSAIC_SLOTS.filter((slot) => slot.color === "cyan").length,
  violet: MOSAIC_SLOTS.filter((slot) => slot.color === "violet").length,
};

const shoulderBosses: InstanceLayout = ({ index }) =>
  new THREE.Matrix4()
    .makeTranslation(index === 0 ? -2.095 : 2.095, 0, 0)
    .multiply(new THREE.Matrix4().makeRotationZ(Math.PI / 2));

const shoulderRings: InstanceLayout = ({ index }) =>
  new THREE.Matrix4()
    .makeTranslation(index === 0 ? -2.085 : 2.085, 0, 0)
    .multiply(new THREE.Matrix4().makeRotationZ(Math.PI / 2));

const chestSides: InstanceLayout = ({ index }) =>
  new THREE.Matrix4()
    .makeTranslation(index === 0 ? -0.64 : 0.64, 0, 0)
    .multiply(new THREE.Matrix4().makeRotationY(index === 0 ? -Math.PI / 2 : Math.PI / 2));

const podRims: InstanceLayout = ({ index }) =>
  new THREE.Matrix4().makeTranslation(index === 0 ? -1.62 : 1.62, 0, 0);

const podStacks: InstanceLayout = ({ index }) => {
  const side = index < 4 ? -1 : 1;
  const i = index % 4;
  const z = i < 2 ? -0.18 : 0.18;
  const x = side * (i % 2 === 0 ? 1.56 : 1.84);
  return new THREE.Matrix4().makeTranslation(x, 0, z);
};

const podSpikes: InstanceLayout = ({ index }) => {
  const side = index < 2 ? -1 : 1;
  const i = index % 2;
  return new THREE.Matrix4()
    .makeTranslation(side * 2.21, 0.23 + i * 0.18, -0.3 + i * 0.6)
    .multiply(new THREE.Matrix4().makeRotationZ(side > 0 ? -Math.PI / 2 : Math.PI / 2));
};

const armClevis: InstanceLayout = ({ index }) =>
  new THREE.Matrix4().makeTranslation(index === 0 ? -0.17 : 0.17, 0, 0);
const forearmClevis: InstanceLayout = ({ index }) =>
  new THREE.Matrix4().makeTranslation(index === 0 ? -0.18 : 0.18, 0, 0);
const handClevis: InstanceLayout = ({ index }) =>
  new THREE.Matrix4().makeTranslation(index === 0 ? -0.15 : 0.15, 0, 0);

const armDrumCaps: InstanceLayout = ({ index }) =>
  new THREE.Matrix4()
    .makeTranslation(index === 0 ? -0.19 : 0.19, 0, 0)
    .multiply(new THREE.Matrix4().makeRotationZ(Math.PI / 2));
const elbowCaps: InstanceLayout = ({ index }) =>
  new THREE.Matrix4()
    .makeTranslation(index === 0 ? -0.18 : 0.18, 0, 0)
    .multiply(new THREE.Matrix4().makeRotationZ(Math.PI / 2));
const wristCaps: InstanceLayout = ({ index }) =>
  new THREE.Matrix4()
    .makeTranslation(index === 0 ? -0.15 : 0.15, 0, 0)
    .multiply(new THREE.Matrix4().makeRotationZ(Math.PI / 2));

const backRibs: InstanceLayout = ({ index }) => new THREE.Matrix4().makeTranslation((index - 1) * 0.55, 0, 0);

const shoulderAxles: InstanceLayout = ({ index }) =>
  new THREE.Matrix4()
    .makeTranslation(index === 0 ? -2.3 : 2.3, 0, 0)
    .multiply(new THREE.Matrix4().makeRotationZ(Math.PI / 2));

const shoulderDockRings: InstanceLayout = ({ index }) =>
  new THREE.Matrix4()
    .makeTranslation(index === 0 ? -2.16 : 2.16, 0, 0)
    .multiply(new THREE.Matrix4().makeRotationZ(Math.PI / 2));

const shoulderFaceSeals: InstanceLayout = ({ index }) =>
  new THREE.Matrix4()
    .makeTranslation(index === 0 ? -2.1415 : 2.1415, 0, 0)
    .multiply(new THREE.Matrix4().makeRotationZ(Math.PI / 2));

const shoulderDockSensors: InstanceLayout = ({ index }) => {
  const side = index < 2 ? -1 : 1;
  const diagonal = index % 2 === 0 ? 1 : -1;
  return new THREE.Matrix4()
    .makeTranslation(side * 2.1415, diagonal * 0.212, diagonal * 0.212)
    .multiply(new THREE.Matrix4().makeRotationZ(Math.PI / 2));
};

const fingerGap3: InstanceLayout = ({ index }) =>
  new THREE.Matrix4().makeTranslation((index - 1) * 0.13, 0, 0);

const shoulderLugs: InstanceLayout = ({ index, partId }) =>
  new THREE.Matrix4()
    .makeTranslation(partId.endsWith("_l") ? 0.11 : -0.11, 0, 0)
    .multiply(new THREE.Matrix4().makeRotationX((index / 2) * Math.PI + Math.PI / 4))
    .multiply(new THREE.Matrix4().makeTranslation(0, 0.32, 0));

const emitterLenses: InstanceLayout = ({ index }) =>
  new THREE.Matrix4()
    .makeRotationZ((index / 4) * TAU)
    .multiply(new THREE.Matrix4().makeTranslation(0.075, 0, 0));

const visorSlats: InstanceLayout = ({ index, count }) =>
  new THREE.Matrix4().makeTranslation((index - (count - 1) / 2) * 0.145, 0, 0);
const crestFins: InstanceLayout = ({ index, count }) =>
  new THREE.Matrix4().makeTranslation((index - (count - 1) / 2) * 0.19, 0, 0);
const shipCheeks: InstanceLayout = ({ index }) =>
  new THREE.Matrix4()
    .makeTranslation(index === 0 ? -0.68 : 0.68, 0, 0)
    .multiply(new THREE.Matrix4().makeRotationY(index === 0 ? Math.PI / 2 : -Math.PI / 2));
const shipAntennae: InstanceLayout = ({ index }) =>
  new THREE.Matrix4().makeTranslation(index === 0 ? -0.55 : 0.55, 0, 0);

export const KINGJOE_LAYOUTS: Record<string, InstanceLayout> = {
  kjDockPins: dockPins,
  kjDockDowels: dockDowels,
  kjDockLugs: dockLugs,
  kjDockHooks: dockHooks,
  kjMirrorX07: mirrorX(0.7),
  kjMirrorX074: mirrorX(0.74),
  kjMirrorX058: mirrorX(0.58),
  kjMirrorX056: mirrorX(0.56),
  kjMirrorX02: mirrorX(0.2),
  kjMirrorX019: mirrorX(0.19),
  kjMirrorX018: mirrorX(0.18),
  kjMirrorX048: mirrorX(0.48),
  kjMirrorX162: mirrorX(1.62),
  kjChestSides: chestSides,
  kjShoulderBosses: shoulderBosses,
  kjShoulderRings: shoulderRings,
  kjPodRims: podRims,
  kjPodStacks: podStacks,
  kjPodSpikes: podSpikes,
  kjArmClevis: armClevis,
  kjArmDrumCaps: armDrumCaps,
  kjForearmClevis: forearmClevis,
  kjHandClevis: handClevis,
  kjElbowCaps: elbowCaps,
  kjWristCaps: wristCaps,
  kjBackRibs: backRibs,
  kjShoulderAxles: shoulderAxles,
  kjShoulderDockRings: shoulderDockRings,
  kjShoulderFaceSeals: shoulderFaceSeals,
  kjShoulderDockSensors: shoulderDockSensors,
  kjMirrorX066: mirrorX(0.66),
  kjMirrorX072: mirrorX(0.63),
  kjMirrorX098: mirrorX(0.96),
  kjMirrorX068: mirrorX(0.68),
  kjMirrorX116: mirrorX(1.16),
  kjFingerGap3: fingerGap3,
  kjShoulderLugs: shoulderLugs,
  kjEmitterLenses: emitterLenses,
  kjVisorSlats: visorSlats,
  kjCrestFins: crestFins,
  kjShipCheeks: shipCheeks,
  kjShipAntennae: shipAntennae,
  kjAgPosts: agPosts,
  kjAgPostsSmall: agPostsSmall,
  kjAgCoilsSmall: agCoilsSmall,
  kjAgCoils08: agCoils08,
  kjAgCoilsSmall34: agCoilsSmall34,
  kjAgPostsSmall04: agPostsSmall04,
  kjSidePanels: sidePanels,
  kjSideLouvers: sideLouvers,
  kjAgCoils: agCoils,
  kjNozzleBlades: nozzleBlades,
  kjMosaicBlue: mosaicLayout("blue"),
  kjMosaicRose: mosaicLayout("rose"),
  kjMosaicAmber: mosaicLayout("amber"),
  kjMosaicGreen: mosaicLayout("green"),
  kjMosaicCyan: mosaicLayout("cyan"),
  kjMosaicViolet: mosaicLayout("violet"),
  ...clevisPins,
};
