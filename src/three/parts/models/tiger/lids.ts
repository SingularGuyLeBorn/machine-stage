import * as THREE from "three";
import type { AssembledModel } from "../../assembler/assembler";

// ============================================================================
// 可动盖板：舱盖 / 加油口盖
//
// 每块盖板只登记铰链轴、静止姿态与开合角；交互状态由 app 层存，
// 这里负责把 0..1 的开合量变成实例矩阵（带缓动）。
// ============================================================================

export type TigerLidKind = "hull" | "turret" | "fuel";

export interface TigerLidSpec {
  key: string;
  partId: string;
  instance: number;
  kind: TigerLidKind;
  name_cn: string;
  /** 铰链点在零件局部坐标。 */
  pivot: readonly [number, number, number];
  /** 铰链轴（零件局部坐标，旋转后取父空间方向）。 */
  axis: "x" | "z";
  closedAngle: number;
  openAngle: number;
  /** 注册表静止姿态是否就是开启姿态（前舱盖建模时立起）。 */
  restOpen: boolean;
  defaultOpen: boolean;
  /** 关闭时整体抬升，避开甲板开口。 */
  closedLift?: number;
  /** 开合行程秒数。 */
  duration?: number;
  /** 固定在盖板上的独立零件（如装填手潜望镜），跟随铰链一起转。 */
  attachments?: readonly string[];
}

const HULL_HATCH = "tiger.hull.hatch_lid";
const LOADER_HATCH = "tiger.turret.loader_hatch";
const CUPOLA_HATCH = "tiger.turret.cupola_hatch";
const FUEL_LID = "tiger.hull.fuel_cap_lid";

export const TIGER_LIDS: readonly TigerLidSpec[] = [
  {
    key: `${HULL_HATCH}#0`,
    partId: HULL_HATCH,
    instance: 0,
    kind: "hull",
    name_cn: "无线电员舱盖",
    pivot: [0, 0, 0],
    axis: "z",
    closedAngle: 0,
    openAngle: 90,
    restOpen: true,
    defaultOpen: true,
    closedLift: 0.014,
  },
  {
    key: `${HULL_HATCH}#1`,
    partId: HULL_HATCH,
    instance: 1,
    kind: "hull",
    name_cn: "驾驶员舱盖",
    pivot: [0, 0, 0],
    axis: "z",
    closedAngle: 0,
    openAngle: 90,
    restOpen: true,
    defaultOpen: true,
    closedLift: 0.014,
  },
  {
    key: `${LOADER_HATCH}#0`,
    partId: LOADER_HATCH,
    instance: 0,
    kind: "turret",
    name_cn: "装填手舱盖",
    pivot: [0.25, 0.036, 0],
    axis: "z",
    closedAngle: 0,
    openAngle: -85,
    restOpen: false,
    defaultOpen: false,
    duration: 0.72,
    attachments: ["tiger.turret.loader_periscope"],
  },
  {
    key: `${CUPOLA_HATCH}#0`,
    partId: CUPOLA_HATCH,
    instance: 0,
    kind: "turret",
    name_cn: "车长塔顶盖",
    pivot: [0.22, 0.036, 0],
    axis: "z",
    closedAngle: 0,
    openAngle: -95,
    restOpen: false,
    defaultOpen: false,
    duration: 0.66,
  },
  {
    key: `${FUEL_LID}#0`,
    partId: FUEL_LID,
    instance: 0,
    kind: "fuel",
    name_cn: "右燃油加注口盖",
    pivot: [0, 0, 0],
    axis: "x",
    closedAngle: 0,
    openAngle: 72,
    restOpen: false,
    defaultOpen: false,
    duration: 0.55,
  },
  {
    key: `${FUEL_LID}#1`,
    partId: FUEL_LID,
    instance: 1,
    kind: "fuel",
    name_cn: "左燃油加注口盖",
    pivot: [0, 0, 0],
    axis: "x",
    closedAngle: 0,
    openAngle: 72,
    restOpen: false,
    defaultOpen: false,
    duration: 0.55,
  },
];

export const TIGER_LID_PART_IDS = [
  ...new Set(TIGER_LIDS.flatMap((lid) => [lid.partId, ...(lid.attachments ?? [])])),
];

const lidsByPart = new Map<string, TigerLidSpec[]>();
for (const lid of TIGER_LIDS) {
  const list = lidsByPart.get(lid.partId) ?? [];
  list.push(lid);
  lidsByPart.set(lid.partId, list);
}

/** 加油口底座也能点开对应的盖板（盖板小，点底座更好点）。 */
const LID_ALIASES: Record<string, string> = {
  "tiger.hull.fuel_cap": FUEL_LID,
};

export function lidAt(partId: string | null | undefined, instance?: number | null): TigerLidSpec | undefined {
  if (!partId) return undefined;
  const targetPart = LID_ALIASES[partId] ?? partId;
  const list = lidsByPart.get(targetPart);
  if (!list) return undefined;
  const index = instance ?? 0;
  return list.find((lid) => lid.instance === index) ?? (instance == null ? list[0] : undefined);
}

export function effectiveLidOpen(
  lid: TigerLidSpec,
  overrides: Record<string, boolean>,
  machineState: string | undefined,
): boolean {
  if (lid.kind === "hull" && machineState === "aiming") return false;
  if (lid.kind === "fuel" && machineState === "refuel") return true;
  return overrides[lid.key] ?? lid.defaultOpen;
}

const openFractions = new Map<string, number>();

export function resetTigerLidPose(): void {
  openFractions.clear();
}

const pivotScratch = new THREE.Vector3();
const axisScratch = new THREE.Vector3();
const tPlus = new THREE.Matrix4();
const tMinus = new THREE.Matrix4();
const liftMatrix = new THREE.Matrix4();
const rotation = new THREE.Matrix4();
const hingeTransform = new THREE.Matrix4();
const posed = new THREE.Matrix4();
const attachmentPosed = new THREE.Matrix4();

/** 每帧调用（在 model.animate 之后、syncInstances 之前）：平滑开合并写回盖板位姿。 */
export function applyTigerLidPose(
  assembled: AssembledModel,
  machineState: string | undefined,
  overrides: Record<string, boolean>,
  deltaSeconds: number,
): void {
  const dt = Math.min(Math.max(deltaSeconds, 0), 0.05);
  for (const lid of TIGER_LIDS) {
    const handle = assembled.getPart(lid.partId);
    const instance = handle?.instances[lid.instance];
    if (!handle || !instance) continue;

    const target = effectiveLidOpen(lid, overrides, machineState) ? 1 : 0;
    let open = openFractions.get(lid.key) ?? (lid.restOpen ? 1 : 0);
    if (lid.kind === "hull" && machineState === "aiming") {
      // 炮塔回转前必须落盖；直接落位，避免长身管扫过立起的盖板
      open = 0;
    } else {
      const step = dt / (lid.duration ?? 0.65);
      const diff = target - open;
      open += Math.sign(diff) * Math.min(Math.abs(diff), step);
    }
    openFractions.set(lid.key, open);

    const eased = open * open * (3 - 2 * open);
    const angle = THREE.MathUtils.degToRad(
      (lid.openAngle - lid.closedAngle) * (eased - (lid.restOpen ? 1 : 0)),
    );
    const lift = (lid.closedLift ?? 0) * (1 - eased);

    // 实例件写模型空间；非实例件挂节点时写节点局部空间
    const base = handle.instanced
      ? instance.restMatrix
      : instance.node
        ? instance.localMatrix
        : instance.restMatrix;

    pivotScratch.set(lid.pivot[0], lid.pivot[1], lid.pivot[2]).applyMatrix4(base);
    axisScratch
      .set(lid.axis === "x" ? 1 : 0, 0, lid.axis === "z" ? 1 : 0)
      .transformDirection(base);
    rotation.makeRotationAxis(axisScratch, angle);
    tPlus.makeTranslation(pivotScratch.x, pivotScratch.y, pivotScratch.z);
    tMinus.makeTranslation(-pivotScratch.x, -pivotScratch.y, -pivotScratch.z);
    liftMatrix.makeTranslation(0, lift, 0);

    hingeTransform.copy(liftMatrix).multiply(tPlus).multiply(rotation).multiply(tMinus);
    posed.copy(hingeTransform).multiply(base);
    handle.setInstanceMatrix(lid.instance, posed);

    for (const partId of lid.attachments ?? []) {
      const attachment = assembled.getPart(partId);
      const attachmentInstance = attachment?.instances[0];
      if (!attachment || !attachmentInstance) continue;
      const attachmentBase = attachment.instanced
        ? attachmentInstance.restMatrix
        : attachmentInstance.node
          ? attachmentInstance.localMatrix
          : attachmentInstance.restMatrix;
      attachmentPosed.copy(hingeTransform).multiply(attachmentBase);
      attachment.setInstanceMatrix(0, attachmentPosed);
    }
  }
}
