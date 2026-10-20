import type { PartBuilder } from "../build";
import { CYL, HYDRAULIC_NODE, cylinderDims, cylinderLayout, type HydraulicSpec } from "../spec";

// ============================================================================
// t800/segments/cylinder —— 液压缸的 10 件工厂
//
// 每根缸拆到：缸体 / 缸底盖 / 导向套 / 杆密封 / 防尘圈 / 耳环A / 活塞杆 /
// 活塞 / 活塞密封 / 耳环B。缸体挂父段节点（静止朝 B），活塞杆挂子段节点
// （静止朝 A）；两节点各自由动画按 |AB| 重新瞄准，于是「露出杆长 = |AB| - 缸长」
// 是几何结果而不是写死的位移。
// ============================================================================

export interface CylinderOptions {
  /** 所属总成（按父段归属） */
  asm: string;
  /** 零件前缀（同一段内唯一） */
  prefix: string;
  /** 缸体所在段的中文名（用于零件名） */
  label: string;
}

export function addCylinder(builder: PartBuilder, spec: HydraulicSpec, options: CylinderOptions): void {
  const dims = cylinderDims(spec);
  const layout = cylinderLayout(spec);
  const cylNode = HYDRAULIC_NODE(spec, "cyl");
  const rodNode = HYDRAULIC_NODE(spec, "rod");
  const { asm, prefix, label } = options;
  const id = `t800.${asm}.${prefix}_${spec.key}`;

  // ---- 缸体侧（挂父段节点，局部 +Y = A→B）----
  builder.add({
    id: `${id}_eye_a`,
    cn: `${label}缸端耳环`,
    en: `${spec.name_en} barrel-end eye`,
    asm,
    geom: {
      type: "kit",
      kit: "t800Eye",
      params: {
        outerR: CYL.eyeOuter,
        boreR: CYL.eyeBore,
        width: CYL.eyeWidth,
        clear: CYL.eyeClear,
        collarR: CYL.eyeCollarR,
        collarH: CYL.eyeCollarH,
        neckR: CYL.eyeNeckR,
        neckLen: CYL.eyeNeckLen,
      },
    },
    mat: "chrome",
    layer: 2,
    node: cylNode,
    local: true,
    at: [0, 0, 0],
    hint: "耳环孔轴 = 局部 X（= 安装销轴），球头销同轴；颈沿 +Y 接缸底盖",
  });
  builder.add({
    id: `${id}_cap`,
    cn: `${label}缸底盖`,
    en: `${spec.name_en} end cap`,
    asm,
    geom: { type: "cylinder", r: spec.rBody, h: CYL.capH, segments: 28, bevel: 0.0012 },
    mat: "gunmetal",
    layer: 2,
    node: cylNode,
    local: true,
    at: [0, layout.capStart + CYL.capH / 2, 0],
    hint: "缸底盖封住缸体后端，内腔与活塞间留出全行程余量",
  });
  builder.add({
    id: `${id}_body`,
    cn: `${label}缸体`,
    en: `${spec.name_en} barrel`,
    asm,
    geom: {
      type: "tube",
      rOuter: spec.rBody,
      rInner: dims.bore,
      h: layout.glandStart - layout.barrelStart - 0.001,
      segments: 32,
    },
    mat: "dark_chrome",
    layer: 2,
    node: cylNode,
    local: true,
    at: [0, (layout.barrelStart + layout.glandStart - 0.001) / 2, 0],
    hint: "缸长 = lc × |AB|；关节转动时缸体不缩放，缩放的是活塞杆",
  });
  builder.add({
    id: `${id}_clamp`,
    cn: `${label}缸体卡箍`,
    en: `${spec.name_en} barrel clamp`,
    asm,
    geom: {
      type: "tube",
      rOuter: spec.rBody + 0.004,
      rInner: spec.rBody + 0.0006,
      h: 0.012,
      segments: 28,
    },
    mat: "dark_chrome",
    layer: 2,
    node: cylNode,
    local: true,
    at: [0, layout.capStart + 0.03, 0],
    hint: "把缸体固定在骨段上的卡箍（内孔 0.6mm 间隙）",
  });
  builder.add({
    id: `${id}_gland`,
    cn: `${label}导向套`,
    en: `${spec.name_en} gland`,
    asm,
    geom: {
      type: "tube",
      rOuter: spec.rBody + CYL.glandBulge,
      rInner: dims.bore + 0.0006,
      h: CYL.glandH,
      segments: 32,
    },
    mat: "brass",
    layer: 2,
    node: cylNode,
    local: true,
    at: [0, layout.glandStart + CYL.glandH / 2, 0],
    hint: "导向套压入缸口，内孔比缸膛小 0.6mm 形成滑动导向面",
  });
  builder.add({
    id: `${id}_rod_seal`,
    cn: `${label}杆密封`,
    en: `${spec.name_en} rod seal`,
    asm,
    geom: {
      type: "tube",
      rOuter: dims.bore - 0.0004,
      rInner: dims.rodR + 0.0003,
      h: CYL.sealH,
      segments: 28,
    },
    mat: "rubber",
    layer: 4,
    node: cylNode,
    local: true,
    at: [0, layout.mouth - 0.010, 0],
    hint: "0.4mm 装配间隙（低于检测阈值的配合公差）",
  });
  builder.add({
    id: `${id}_wiper`,
    cn: `${label}防尘圈`,
    en: `${spec.name_en} wiper`,
    asm,
    geom: {
      type: "tube",
      rOuter: dims.bore - 0.0004,
      rInner: dims.rodR + 0.0003,
      h: CYL.wiperH,
      segments: 28,
    },
    mat: "rubber",
    layer: 4,
    node: cylNode,
    local: true,
    at: [0, layout.mouth - 0.002, 0],
    hint: "防尘圈坐在导向套口部，随杆往复刮拭",
  });

  // ---- 杆侧（挂子段节点，局部 +Y = B→A）----
  builder.add({
    id: `${id}_eye_b`,
    cn: `${label}杆端耳环`,
    en: `${spec.name_en} rod-end eye`,
    asm,
    geom: {
      type: "kit",
      kit: "t800Eye",
      params: {
        outerR: CYL.eyeOuter,
        boreR: CYL.eyeBore,
        width: CYL.eyeWidth,
        clear: CYL.eyeClear,
        collarR: CYL.eyeCollarR,
        collarH: CYL.eyeCollarH,
        neckR: CYL.eyeNeckR,
        neckLen: CYL.eyeNeckLen,
      },
    },
    mat: "chrome",
    layer: 2,
    node: rodNode,
    local: true,
    at: [0, 0, 0],
    hint: "杆端耳环：球头销坐孔内，颈接活塞杆台肩",
  });
  builder.add({
    id: `${id}_rod`,
    cn: `${label}活塞杆`,
    en: `${spec.name_en} piston rod`,
    asm,
    geom: {
      type: "merge",
      parts: [
        {
          type: "cylinder",
          r: dims.rodR,
          h: layout.barrelEnd - layout.barrelStart === 0 ? 0.1 : spec.lr * dims.L,
          segments: 28,
          bevel: 0.0008,
          at: [0, layout.rodStart + (spec.lr * dims.L) / 2, 0],
        },
        {
          type: "tube",
          rOuter: 0.019,
          rInner: dims.rodR + 0.0006,
          h: CYL.rodCollarH,
          segments: 28,
          at: [0, layout.rodStart + CYL.rodCollarH / 2, 0],
        },
      ],
    },
    mat: "chrome",
    layer: 2,
    node: rodNode,
    local: true,
    at: [0, 0, 0],
    hint: "杆长 = lr × |AB|；露出长度随关节角自动伸缩，动画不写死位移",
  });
  builder.add({
    id: `${id}_piston`,
    cn: `${label}活塞`,
    en: `${spec.name_en} piston`,
    asm,
    geom: {
      type: "tube",
      rOuter: dims.pistonR,
      rInner: dims.rodR + 0.0006,
      h: CYL.pistonH,
      segments: 28,
    },
    mat: "gunmetal",
    layer: 3,
    node: rodNode,
    local: true,
    at: [0, layout.pistonFromB, 0],
    hint: "活塞随杆同步移动；与缸膛留 1mm 径向间隙",
  });
  builder.add({
    id: `${id}_piston_seal`,
    cn: `${label}活塞密封`,
    en: `${spec.name_en} piston seal`,
    asm,
    geom: {
      type: "tube",
      rOuter: dims.bore - 0.0004,
      rInner: dims.pistonR - 0.0003,
      h: CYL.pistonSealH,
      segments: 28,
    },
    mat: "rubber",
    layer: 4,
    node: rodNode,
    local: true,
    at: [0, layout.pistonFromB, 0],
    hint: "活塞密封环：内压 0.3mm、外径 0.4mm 间隙",
  });
}
