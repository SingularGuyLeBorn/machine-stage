import type { InstanceLayout } from "../../../assembler/assembler";
import { repeatNode, type PartBuilder } from "../build";
import * as THREE from "three";

// ============================================================================
// t800/segments/head —— 铬钢头骨（眼眶 / 鼻腔 / 牙列 / 红色光学眼 / 下颌 /
//                        头盖顶板 + CPU）
//
// 参考图读法：T-800 的头是**铬钢壳**，正面有两个凹陷的红色光学眼窝，
// 一副外露的金属牙列，下颌可开合；后脑勺有一块可拆的头盖板，里面是 CPU。
//
// 坐标：+X 前、+Y 上、+Z 右。
// ============================================================================

/** 头骨关键点（模型坐标）。 */
export const HEAD_POINTS = {
  /** 颅腔中心 */
  cranium: [0.012, 2.044, 0] as [number, number, number],
  /** 面部（鼻/口）中心 */
  face: [0.088, 1.985, 0] as [number, number, number],
  /** 光学眼中心 */
  eye: [0.098, 2.048, 0.034] as [number, number, number],
  /** 牙列中心 */
  teeth: [0.108, 1.978, 0] as [number, number, number],
  /** 下颌铰点 */
  jawPivot: [0.056, 1.938, 0.046] as [number, number, number],
};

/** 头骨节点名。 */
export const HEAD_NODES = {
  skull: "T800Skull",
  jaw: "T800Jaw",
  eye: "T800Eye",
};

/** 头骨节点 pivot 表（模型坐标）。 */
const HEAD_PIVOTS: Record<string, [number, number, number]> = {
  [HEAD_NODES.skull]: HEAD_POINTS.cranium,
  [HEAD_NODES.jaw]: HEAD_POINTS.jawPivot,
  [HEAD_NODES.eye]: HEAD_POINTS.eye,
};

/** 布局：模型坐标 → 节点局部偏移。 */
function headLayout(
  node: string,
  positions: Array<[number, number, number]>,
): InstanceLayout {
  return ({ index }) => {
    const p = positions[index] ?? positions[0];
    const pivot = HEAD_PIVOTS[node] ?? [0, 0, 0];
    return new THREE.Matrix4().makeTranslation(p[0] - pivot[0], p[1] - pivot[1], p[2] - pivot[2]);
  };
}

export function buildHead(builder: PartBuilder, layouts: Record<string, InstanceLayout>): void {
  const P = HEAD_POINTS;

  // ================= 颅腔（铬钢壳）====================
  builder.add({
    id: "t800.head.cranium",
    cn: "颅腔",
    en: "Cranium",
    asm: "head",
    geom: {
      type: "kit",
      kit: "t800Skull",
      params: { r: 0.086, faceDepth: 0.052, faceWidth: 0.052, jawDrop: 0.05 },
    },
    mat: "chrome",
    layer: 1,
    node: HEAD_NODES.skull,
    modelSpace: true,
    at: [P.cranium[0], P.cranium[1], P.cranium[2]],
    hint: "头骨主壳：半球形颅腔 + 前方_face 平面（参考图的铬钢头）",
  });

  // ================= 头盖顶板（可拆）====================
  builder.add({
    id: "t800.head.top_plate",
    cn: "头盖顶板",
    en: "Cranial top plate",
    asm: "head",
    geom: { type: "plate", w: 0.075, h: 0.062, t: 0.005, bevel: 0.0015 },
    mat: "dark_chrome",
    layer: 3,
    node: HEAD_NODES.skull,
    modelSpace: true,
    at: [P.cranium[0] - 0.132, P.cranium[1] + 0.055, P.cranium[2]],
    rot: [0, 0, 18],
    hint: "后脑勺可拆的顶板：掀开能看到里面的 CPU",
  });

  // ================= CPU（顶板内，可拆出）====================
  builder.add({
    id: "t800.head.cpu",
    cn: "CPU 核心",
    en: "CPU core",
    asm: "head",
    geom: {
      type: "merge",
      parts: [
        { type: "box", w: 0.052, h: 0.03, d: 0.042, bevel: 0.003 },
        { type: "cylinder", r: 0.006, h: 0.012, segments: 12, at: [0, 0.019, 0] },
      ],
    },
    mat: "gunmetal",
    layer: 4,
    node: HEAD_NODES.skull,
    modelSpace: true,
    at: [P.cranium[0] - 0.128, P.cranium[1] - 0.006, P.cranium[2]],
    hint: "头盖下的 CPU：终结者 2 里可以整块取出的那颗脑",
  });
  builder.add({
    id: "t800.head.cpu_leds",
    cn: "CPU 指示灯（实例族）",
    en: "CPU indicator family",
    asm: "head",
    geom: { type: "cylinder", r: 0.0022, h: 0.003, segments: 8 },
    mat: "servo",
    layer: 5,
    node: HEAD_NODES.skull,
    modelSpace: true,
    at: [0, 0, 0],
    inst: 6,
    layout: "t800.head.cpu_leds",
    instNodes: repeatNode(HEAD_NODES.skull, 6),
    hint: "CPU 面板上的红色状态灯",
  });
  layouts["t800.head.cpu_leds"] = headLayout(HEAD_NODES.skull, Array.from({ length: 6 }, (_, i) => [
      P.cranium[0] - 0.128,
      P.cranium[1] - 0.006 + 0.02,
      P.cranium[2] - 0.015 + i * 0.006,
    ] as [number, number, number]),
  );

  // ================= 光学眼 ×2（透镜 + 发光体 + 眼窝）====================
  for (const side of [1, -1] as const) {
    const tag = side > 0 ? "R" : "L";
    builder.add({
      id: `t800.head.eye_socket${side > 0 ? "" : "_left"}`,
      cn: `眼窝（${side > 0 ? "右" : "左"}）`,
      en: `Eye socket (${tag})`,
      asm: "head",
      geom: { type: "tube", rOuter: 0.021, rInner: 0.016, h: 0.012, segments: 24 },
      mat: "gunmetal",
      layer: 3,
      node: HEAD_NODES.eye,
      modelSpace: true,
      at: [P.eye[0] - 0.004, P.eye[1], side * P.eye[2]],
      rot: [0, 90, 0],
      hint: "光学眼的凹窝（镜面黑）",
    });
    builder.add({
      id: `t800.head.eye_lens${side > 0 ? "" : "_left"}`,
      cn: `眼透镜（${side > 0 ? "右" : "左"}）`,
      en: `Eye lens (${tag})`,
      asm: "head",
      geom: { type: "sphere", r: 0.014, segments: 20 },
      mat: "mirror",
      layer: 2,
      node: HEAD_NODES.eye,
      modelSpace: true,
      at: [P.eye[0], P.eye[1], side * P.eye[2]],
      hint: "红色光学眼的透镜",
    });
    builder.add({
      id: `t800.head.eye_emitter${side > 0 ? "" : "_left"}`,
      cn: `眼发光体（${side > 0 ? "右" : "左"}）`,
      en: `Eye emitter (${tag})`,
      asm: "head",
      geom: { type: "cylinder", r: 0.009, h: 0.008, segments: 16, bevel: 0.001 },
      mat: "servo",
      layer: 2,
      node: HEAD_NODES.eye,
      modelSpace: true,
      at: [P.eye[0] - 0.004, P.eye[1], side * P.eye[2]],
      rot: [0, 90, 0],
      hint: "红色发光体：T-800 的标志性红眼",
    });
  }

  // ================= 鼻腔 =================
  builder.add({
    id: "t800.head.nasal",
    cn: "鼻腔框",
    en: "Nasal frame",
    asm: "head",
    geom: { type: "tube", rOuter: 0.016, rInner: 0.011, h: 0.016, segments: 20 },
    mat: "gunmetal",
    layer: 3,
    node: HEAD_NODES.skull,
    modelSpace: true,
    at: [P.face[0] - 0.012, P.face[1] + 0.022, P.face[2]],
    rot: [0, 90, 0],
    hint: "鼻孔的金属框",
  });

  // ================= 牙列（上 14 + 下 14，逐颗实例化）====================
  builder.add({
    id: "t800.head.teeth_upper",
    cn: "上颌牙列（实例族 ×14）",
    en: "Upper teeth family (×14)",
    asm: "head",
    geom: { type: "box", w: 0.009, h: 0.012, d: 0.008, bevel: 0.001 },
    mat: "chrome",
    layer: 2,
    node: HEAD_NODES.skull,
    modelSpace: true,
    at: [0, 0, 0],
    inst: 14,
    layout: "t800.head.teeth_upper",
    instNodes: repeatNode(HEAD_NODES.skull, 14),
    hint: "上颌 14 颗牙：沿牙弓排成弧",
  });
  layouts["t800.head.teeth_upper"] = headLayout(HEAD_NODES.skull, Array.from({ length: 14 }, (_, i) => {
      const a = (i / 13 - 0.5) * 1.5;
      return [
        P.teeth[0] - 0.004 - Math.cos(a) * 0.004,
        P.teeth[1] + 0.004,
        P.teeth[2] + Math.sin(a) * 0.034,
      ] as [number, number, number];
    }),
  );
  builder.add({
    id: "t800.head.teeth_lower",
    cn: "下颌牙列（实例族 ×14）",
    en: "Lower teeth family (×14)",
    asm: "head",
    geom: { type: "box", w: 0.008, h: 0.011, d: 0.007, bevel: 0.001 },
    mat: "chrome",
    layer: 2,
    node: HEAD_NODES.jaw,
    modelSpace: true,
    at: [0, 0, 0],
    inst: 14,
    layout: "t800.head.teeth_lower",
    instNodes: repeatNode(HEAD_NODES.jaw, 14),
    hint: "下颌 14 颗牙：跟着下颌张合",
  });
  layouts["t800.head.teeth_lower"] = headLayout(HEAD_NODES.jaw, Array.from({ length: 14 }, (_, i) => {
      const a = (i / 13 - 0.5) * 1.5;
      return [
        P.teeth[0] - 0.004 - Math.cos(a) * 0.004,
        P.teeth[1] - 0.012,
        P.teeth[2] + Math.sin(a) * 0.032,
      ] as [number, number, number];
    }),
  );

  // ================= 下颌（可张合）====================
  builder.add({
    id: "t800.head.jaw",
    cn: "下颌骨",
    en: "Mandible",
    asm: "head",
    geom: {
      type: "kit",
      kit: "t800Jaw",
      params: { r: 0.03, width: 0.062, length: 0.075 },
    },
    mat: "chrome",
    layer: 2,
    node: HEAD_NODES.jaw,
    modelSpace: true,
    at: [P.jawPivot[0], P.jawPivot[1], P.jawPivot[2]],
    hint: "下颌：绕耳侧铰点开合（液压驱动）",
  });
  builder.add({
    id: "t800.head.jaw_hinge",
    cn: "下颌铰链（实例族 ×2）",
    en: "Jaw hinge family (×2)",
    asm: "head",
    geom: { type: "cylinder", r: 0.006, h: 0.014, segments: 12 },
    mat: "gunmetal",
    layer: 3,
    node: HEAD_NODES.jaw,
    modelSpace: true,
    at: [0, 0, 0],
    inst: 2,
    layout: "t800.head.jaw_hinge",
    instNodes: repeatNode(HEAD_NODES.jaw, 2),
    hint: "下颌两侧的铰链销",
  });
  layouts["t800.head.jaw_hinge"] = headLayout(HEAD_NODES.jaw, [
      [P.jawPivot[0], P.jawPivot[1], P.jawPivot[2]],
      [P.jawPivot[0], P.jawPivot[1], -P.jawPivot[2]],
    ],
  );
}
