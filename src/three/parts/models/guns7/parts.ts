import type { PartDefinition } from "../../registry/types";

// ============================================================================
// models/guns7/parts —— 零件声明小工具
//
// build_order：模型内全局唯一、≥100。各模型按「先核心机构、后外壳」的顺序
// 依次取号；构建滑杆因此是从枪机/击发机构开始，最后长到枪托与附件。
// ============================================================================

export function makeOrder(start = 100): () => number {
  let order = start;
  return () => order++;
}

export interface AmmoSpec {
  model: string;
  count: number;
  layout: string;
  caseRimR: number;
  caseBodyR: number;
  caseNeckR: number;
  caseLen: number;
  shoulder: number;
  extractorGroove: boolean;
  bulletR: number;
  bulletLen: number;
  leadR: number;
  leadLen: number;
  steelR: number;
  steelLen: number;
  propR: number;
  propLen: number;
  primerR: number;
  primerH: number;
  /** 弹头在壳颈内的插入深度（米）。 */
  seatDepth?: number;
  sourceNote: string;
}

/** 生成一发弹的六个独立零件声明（弹头被甲 + 铅芯 + 钢芯 + 弹壳 + 发射药 + 底火）。 */
export function ammoPartDefs(order: () => number, spec: AmmoSpec): PartDefinition[] {
  const seat = spec.seatDepth ?? spec.bulletLen * 0.36;
  const bulletCenter = spec.caseLen + spec.bulletLen / 2 - seat;
  const prefix = `${spec.model}.ammo`;
  const common = {
    assembly: "ammo",
    build_layer: 2 as const,
    instances: spec.count,
    indexed: true as const,
    instance_layout: spec.layout,
  };
  return [
    {
      id: `${prefix}.case`,
      name_cn: "弹壳（黄铜）",
      name_en: "Cartridge case, brass",
      ...common,
      build_order: order(),
      geometry: {
        type: "kit",
        kit: "cartridgeCase",
        params: {
          rimR: spec.caseRimR,
          baseR: spec.caseBodyR,
          neckR: spec.caseNeckR,
          len: spec.caseLen,
          shoulder: spec.shoulder,
          extractorGroove: spec.extractorGroove,
        },
      },
      material: "brass_case",
      mate: { type: "absolute" },
      source: spec.sourceNote,
    },
    {
      id: `${prefix}.bullet`,
      name_cn: "弹头被甲（铜）",
      name_en: "Bullet jacket, gilding metal",
      ...common,
      build_order: order(),
      geometry: {
        type: "kit",
        kit: "ammoBullet",
        params: { r: spec.bulletR, len: spec.bulletLen },
      },
      material: "copper_jacket",
      mate: { type: "absolute", position: [0, 0, bulletCenter] },
      source: "弹头被甲：铜锌合金被甲，包住铅芯与钢芯；击发后随膛线旋转飞离枪口。",
    },
    {
      id: `${prefix}.lead_core`,
      name_cn: "铅芯",
      name_en: "Lead core",
      ...common,
      build_order: order(),
      geometry: {
        type: "kit",
        kit: "ammoCore",
        params: { r: spec.leadR, len: spec.leadLen, pointed: false },
      },
      material: "lead_core",
      mate: { type: "absolute", position: [0, 0, bulletCenter - spec.bulletLen * 0.03] },
      source: "铅芯：被甲内的软铅套，保证弹头质量分布与气密。",
    },
    {
      id: `${prefix}.steel_core`,
      name_cn: "钢芯",
      name_en: "Steel penetrator core",
      ...common,
      build_order: order(),
      geometry: {
        type: "kit",
        kit: "ammoCore",
        params: { r: spec.steelR, len: spec.steelLen, pointed: true },
      },
      material: "steel_core",
      mate: { type: "absolute", position: [0, 0, bulletCenter + spec.bulletLen * 0.04] },
      source: "钢芯：弹头内部的硬化钢侵彻体，与铅芯同轴但独立成件。",
    },
    {
      id: `${prefix}.propellant`,
      name_cn: "发射药柱",
      name_en: "Propellant charge",
      ...common,
      build_order: order(),
      geometry: {
        type: "kit",
        kit: "propellantCharge",
        params: { r: spec.propR, len: spec.propLen },
      },
      material: "propellant",
      mate: { type: "absolute", position: [0, 0, spec.caseLen * 0.5] },
      source: "发射药：颗粒火药柱（展示用整柱），击发后 2~3ms 内燃尽。",
    },
    {
      id: `${prefix}.primer`,
      name_cn: "底火",
      name_en: "Primer (Berdan)",
      ...common,
      build_order: order(),
      geometry: {
        type: "kit",
        kit: "primerCap",
        params: { r: spec.primerR, h: spec.primerH },
      },
      material: "primer",
      mate: { type: "absolute", position: [0, 0, 0.0002] },
      source: "底火：击针撞击发火，点燃发射药；弹壳底部独立件，击发后与弹壳一同抛出。",
    },
  ];
}

/** 弹药零件的 ID 列表（motionParts / 动画循环共用）。 */
export function ammoPartIds(model: string): string[] {
  return ["case", "bullet", "lead_core", "steel_core", "propellant", "primer"].map(
    (name) => `${model}.ammo.${name}`,
  );
}

/** 弹药各件相对弹壳底面的轴向偏移（动画用，参数必须与 ammoPartDefs 同源）。 */
export function ammoOffsets(spec: Pick<AmmoSpec, "caseLen" | "bulletLen" | "seatDepth">): Record<string, number> {
  const seat = spec.seatDepth ?? spec.bulletLen * 0.36;
  const bulletCenter = spec.caseLen + spec.bulletLen / 2 - seat;
  return {
    case: 0,
    bullet: bulletCenter,
    lead_core: bulletCenter - spec.bulletLen * 0.03,
    steel_core: bulletCenter + spec.bulletLen * 0.04,
    propellant: spec.caseLen * 0.5,
    primer: 0.0002,
  };
}

/** 通用构造性接触：弹药六件同轴嵌套 + 壳内发射药/底火。 */
export function ammoExpectedContacts(model: string) {
  const p = `${model}.ammo`;
  const nested: Array<[string, string]> = [
    [`${p}.case`, `${p}.bullet`],
    [`${p}.case`, `${p}.lead_core`],
    [`${p}.case`, `${p}.steel_core`],
    [`${p}.case`, `${p}.propellant`],
    [`${p}.case`, `${p}.primer`],
    [`${p}.bullet`, `${p}.lead_core`],
    [`${p}.bullet`, `${p}.steel_core`],
    [`${p}.lead_core`, `${p}.steel_core`],
  ];
  return nested.map(([a, b]) => ({
    family: `${model}-ammo-nested`,
    a,
    b,
    reason: "弹药六分件按真实结构同轴嵌套（被甲包铅芯/钢芯、弹头坐入壳颈、药柱与底火在壳内）",
    maxDepthMm: 40,
    allowDisplaced: true,
    allowSuspect: true,
  }));
}
