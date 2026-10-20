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

/**
 * 缸体的"肌肉"外形：起止点明确的**非对称**纺锤。
 *
 * 这是终结者腿的关键形体感来源 —— 缸体本身就是肌肉（股四头肌 / 小腿肚），
 * 骨架在肌肉之间连接。直筒缸只会让整条腿读成"细杆 + 零散件"。
 *
 * 真实肌肉解剖：上端（起于骨盆/股骨）粗壮，往下（止于膝/跟腱）逐渐收窄。
 * 所以鼓包的峰值偏向 A 端（起点），B 端留一条长收口 —— 用偏斜正弦实现：
 *   r(t) = rEnd + (rMax - rEnd) · sin(π · t^skew)，skew < 1 时峰值前移到 t≈0.28。
 *
 * 内膛保持等径（活塞导向面），外形按正弦鼓胀。
 */
function muscleProfile(
  bore: number,
  rEnd: number,
  rMax: number,
  length: number,
  skew = 0.55,
): Array<[number, number]> {
  const profile: Array<[number, number]> = [];
  const rim = Math.min(0.014, length * 0.12);
  const body = Math.max(length - 2 * rim, 0.001);
  profile.push([bore, 0]);
  profile.push([rEnd, 0]);
  profile.push([rEnd, rim]);
  const steps = 16;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const r = rEnd + (rMax - rEnd) * Math.sin(Math.PI * Math.pow(t, skew));
    profile.push([r, rim + t * body]);
  }
  profile.push([rEnd, length]);
  profile.push([bore, length]);
  profile.push([bore, 0]);
  return profile;
}

export function addCylinder(builder: PartBuilder, spec: HydraulicSpec, options: CylinderOptions): void {
  const dims = cylinderDims(spec);
  const layout = cylinderLayout(spec);
  const cylNode = HYDRAULIC_NODE(spec, "cyl");
  const rodNode = HYDRAULIC_NODE(spec, "rod");
  const { asm, prefix, label } = options;
  const id = `t800.${asm}.${prefix}_${spec.key}`;
  const barrelLength = layout.glandStart - layout.barrelStart - 0.001;
  const rEnd = spec.rBody * 0.72;
  const bodyProfile = muscleProfile(dims.bore, rEnd, spec.rBody, barrelLength);

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
    geom: { type: "cylinder", r: rEnd, h: CYL.capH, segments: 28, bevel: 0.0012 },
    mat: "chrome",
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
      type: "merge",
      parts: [{ type: "lathe", profile: bodyProfile, segments: 32 }],
    },
    mat: "chrome",
    layer: 2,
    node: cylNode,
    local: true,
    at: [0, layout.barrelStart, 0],
    hint: "缸体是解剖形「肌肉块」：上段粗壮、往下收窄成肌腱（缸长 = lc × |AB|，缸体不缩放，缩放的是活塞杆）",
  });
  builder.add({
    id: `${id}_clamp`,
    cn: `${label}缸体卡箍`,
    en: `${spec.name_en} barrel clamp`,
    asm,
    geom: {
      type: "tube",
      rOuter: rEnd + 0.005,
      rInner: rEnd + 0.0006,
      h: 0.012,
      segments: 28,
    },
    mat: "chrome",
    layer: 2,
    node: cylNode,
    local: true,
    at: [0, layout.barrelStart + 0.006, 0],
    hint: "把缸体固定在骨段上的卡箍（卡在收细的根部，内孔 0.6mm 间隙）",
  });
  builder.add({
    id: `${id}_gland`,
    cn: `${label}导向套`,
    en: `${spec.name_en} gland`,
    asm,
    geom: {
      type: "tube",
      rOuter: rEnd - 0.002,
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
      rOuter: dims.rodR + 0.0012,
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
      rOuter: dims.rodR + 0.0012,
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
          rOuter: Math.min(spec.rBody * 0.5, CYL.eyeBore - 0.001),
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
