import type { InstanceLayout } from "../../../assembler/assembler";
import { repeatNode, type PartBuilder } from "../build";
import { addCylinder } from "./cylinder";
import type { HydraulicSpec } from "../spec";
import * as THREE from "three";
import { JOINT_STD, PELVIS_NODE } from "../spec";

// ============================================================================
// t800/segments/arms —— 双臂（肩球窝 + 肩驱动缸 ×2 + 肱骨 + 肘 + 前臂双杆 +
//                        腕 + 手：掌骨 ×5 / 指骨 ×15 / 液压腱）
//
// 参考图读法：肩窝是**球头座**（球窝关节），上臂是一根粗铬钢管 + 外露驱动缸，
// 肘是圆盘铰链，前臂是**尺桡双杆**（能轴向旋转），手是 5 根细长指骨 + 腱索。
//
// 坐标：+X 前、+Y 上、+Z 右。左右臂沿 Z 镜像（z → -z）。
// ============================================================================

/** 臂的关键节点位置（模型坐标，右侧；左侧沿 Z 镜像）。 */
export const ARM_POINTS = {
  /** 肩窝中心 */
  shoulder: [0.0, 1.885, 0.168] as [number, number, number],
  /** 肘关节中心 */
  elbow: [-0.012, 1.605, 0.205] as [number, number, number],
  /** 腕关节中心 */
  wrist: [-0.022, 1.345, 0.222] as [number, number, number],
  /** 掌根（手掌起点） */
  palm: [-0.026, 1.283, 0.226] as [number, number, number],
  /** 指尖 */
  fingertip: [-0.034, 1.145, 0.232] as [number, number, number],
};

/** 手指的 5 根指在 Z 上的排布（相对掌根，mm）：拇指偏前，其余四指依次排开。 */
const FINGER_Z = [-0.026, -0.008, 0.008, 0.024, 0.038];

/** 手指各节长度（m）：食指/中指/无名指/小指 三节，拇指 两节。 */
const FINGER_SEGMENTS = [0.028, 0.022, 0.018];

/** 肩/肘 驱动缸的 A/B 球心（右侧；左侧沿 Z 镜像）。 */
interface ArmCylinderSeed {
  key: string;
  cn: string;
  /** 缸体挂哪一段（shoulder / elbow） */
  parent: "shoulder" | "elbow" | "wrist";
  /** 活塞杆挂哪一段 */
  child: "shoulder" | "elbow" | "wrist";
  A: [number, number, number];
  B: [number, number, number];
  rBody: number;
  lc: number;
  lr: number;
}

const ARM_CYLINDER_SEEDS: ArmCylinderSeed[] = [
  {
    key: "shoulder_flex",
    cn: "肩前屈缸",
    parent: "shoulder",
    child: "elbow",
    A: [0.052, 1.868, 0.176],
    B: [0.042, 1.706, 0.2],
    rBody: 0.017,
    lc: 0.45,
    lr: 0.5,
  },
  {
    key: "shoulder_ext",
    cn: "肩后伸缸",
    parent: "shoulder",
    child: "elbow",
    A: [-0.052, 1.858, 0.176],
    B: [-0.046, 1.712, 0.196],
    rBody: 0.015,
    lc: 0.45,
    lr: 0.5,
  },
  {
    key: "elbow",
    cn: "肘驱动缸",
    parent: "elbow",
    child: "wrist",
    A: [0.052, 1.628, 0.2],
    B: [0.014, 1.472, 0.238],
    rBody: 0.016,
    lc: 0.45,
    lr: 0.5,
  },
];

/** 生成一条手臂的驱动缸规格（左侧沿 Z 镜像）。 */
export function armCylinders(side: 1 | -1): HydraulicSpec[] {
  const z = (v: number) => side * v;
  return ARM_CYLINDER_SEEDS.map((seed) => ({
    key: seed.key,
    name_cn: seed.cn,
    name_en: seed.cn,
    parent: seed.parent as never,
    child: seed.child as never,
    A: [seed.A[0], seed.A[1], z(seed.A[2])] as [number, number, number],
    B: [seed.B[0], seed.B[1], z(seed.B[2])] as [number, number, number],
    normalA: [0, 0, side] as [number, number, number],
    normalB: [0, 0, side] as [number, number, number],
    rBody: seed.rBody,
    lc: seed.lc,
    lr: seed.lr,
  }));
}

/** 手臂节点名（左右各一套）。 */
export function armNodes(side: 1 | -1) {
  const s = side > 0 ? "R" : "L";
  return {
    shoulder: `T800Shoulder${s}`,
    elbow: `T800Elbow${s}`,
    wrist: `T800Wrist${s}`,
    finger: `T800Finger${s}`,
  };
}

/** 手臂节点的 pivot（右侧；左侧 z 取反）。 */
export function armPivots(side: 1 | -1) {
  const p = ARM_POINTS;
  const z = (v: number) => side * v;
  return [
    { name: armNodes(side).shoulder, pivot: [p.shoulder[0], p.shoulder[1], z(p.shoulder[2])] as [number, number, number] },
    { name: armNodes(side).elbow, pivot: [p.elbow[0], p.elbow[1], z(p.elbow[2])] as [number, number, number] },
    { name: armNodes(side).wrist, pivot: [p.wrist[0], p.wrist[1], z(p.wrist[2])] as [number, number, number] },
    { name: armNodes(side).finger, pivot: [p.palm[0], p.palm[1], z(p.palm[2])] as [number, number, number] },
  ];
}

/** 节点 pivot 表（模型坐标；左侧沿 Z 镜像）。 */
function armPivotsOf(side: 1 | -1): Record<string, [number, number, number]> {
  const z = (v: number) => side * v;
  const p = ARM_POINTS;
  const n = armNodes(side);
  return {
    [n.shoulder]: [p.shoulder[0], p.shoulder[1], z(p.shoulder[2])],
    [n.elbow]: [p.elbow[0], p.elbow[1], z(p.elbow[2])],
    [n.wrist]: [p.wrist[0], p.wrist[1], z(p.wrist[2])],
    [n.finger]: [p.palm[0], p.palm[1], z(p.palm[2])],
  };
}

/** 布局：给模型坐标的位置，产出相对该节点 pivot 的偏移。 */
function armLayout(
  pivots: Record<string, [number, number, number]>,
  node: string,
  positions: Array<[number, number, number]>,
): InstanceLayout {
  return ({ index }) => {
    const p = positions[index] ?? positions[0];
    const pivot = pivots[node] ?? [0, 0, 0];
    return new THREE.Matrix4().makeTranslation(p[0] - pivot[0], p[1] - pivot[1], p[2] - pivot[2]);
  };
}

/** 生成一条手臂（side = 1 右，-1 左；左侧沿 Z 镜像）。 */
export function buildArm(
  builder: PartBuilder,
  layouts: Record<string, InstanceLayout>,
  side: 1 | -1,
): void {
  const suffix = side > 0 ? "_right" : "_left";
  const pivots = armPivotsOf(side);
  const z = (v: number) => side * v;
  const P = ARM_POINTS;
  const nodes = armNodes(side);

  // ================= 肩：球窝关节 =================
  builder.add({
    id: `t800.arm${suffix}.shoulder_socket`,
    cn: `肩窝座（${side > 0 ? "右" : "左"}）`,
    en: `Shoulder socket (${suffix})`,
    asm: "arm",
    geom: { type: "tube", rOuter: 0.036, rInner: 0.027, h: 0.03, segments: 28 },
    mat: "gunmetal",
    layer: 2,
    node: PELVIS_NODE,
    modelSpace: true,
    at: [P.shoulder[0], P.shoulder[1], z(P.shoulder[2])],
    rot: [90, 0, 0],
    hint: "肩窝座：球窝关节的外壳，扣在锁骨末端",
  });
  builder.add({
    id: `t800.arm${suffix}.shoulder_ball`,
    cn: `肩球头（${side > 0 ? "右" : "左"}）`,
    en: `Shoulder ball (${suffix})`,
    asm: "arm",
    geom: { type: "sphere", r: 0.026, segments: 24 },
    mat: "mirror",
    layer: 2,
    node: nodes.shoulder,
    modelSpace: true,
    at: [P.shoulder[0], P.shoulder[1], z(P.shoulder[2])],
    hint: "肱骨上端的球头：坐在肩窝里，可绕肩窝摆动",
  });
  builder.add({
    id: `t800.arm${suffix}.shoulder_bearing`,
    cn: `肩轴承环（${side > 0 ? "右" : "左"}）`,
    en: `Shoulder bearing ring (${suffix})`,
    asm: "arm",
    geom: { type: "tube", rOuter: 0.03, rInner: 0.0262, h: 0.012, segments: 28 },
    mat: "brass",
    layer: 3,
    node: nodes.shoulder,
    modelSpace: true,
    at: [P.shoulder[0], P.shoulder[1], z(P.shoulder[2])],
    rot: [90, 0, 0],
    hint: "肩轴承环：抱住球头（0.4mm 径向间隙）",
  });
  builder.add({
    id: `t800.arm${suffix}.shoulder_seal`,
    cn: `肩密封（${side > 0 ? "右" : "左"}）`,
    en: `Shoulder seal (${suffix})`,
    asm: "arm",
    geom: { type: "tube", rOuter: 0.032, rInner: 0.029, h: 0.004, segments: 24 },
    mat: "rubber",
    layer: 4,
    node: nodes.shoulder,
    modelSpace: true,
    at: [P.shoulder[0], P.shoulder[1], z(P.shoulder[2] + 0.016)],
    rot: [90, 0, 0],
    hint: "肩窝外圈的防尘密封",
  });

  // ================= 肱骨：铬钢粗管 =================
  const upperLen = P.shoulder[1] - P.elbow[1] - 0.055;
  const upperMid: [number, number, number] = [
    (P.shoulder[0] + P.elbow[0]) / 2,
    (P.shoulder[1] + P.elbow[1]) / 2 - 0.04,
    z((P.shoulder[2] + P.elbow[2]) / 2),
  ];
  builder.add({
    id: `t800.arm${suffix}.humerus`,
    cn: `肱骨（${side > 0 ? "右" : "左"}）`,
    en: `Humerus (${suffix})`,
    asm: "arm",
    geom: {
      type: "merge",
      parts: [
        { type: "cylinder", r: 0.026, h: upperLen - 0.03, segments: 24, bevel: 0.002 },
        { type: "cylinder", r: 0.03, h: 0.02, segments: 24, bevel: 0.002, at: [0, (upperLen - 0.03) / 2, 0] },
        { type: "cylinder", r: 0.023, h: 0.018, segments: 24, bevel: 0.002, at: [0, -(upperLen - 0.03) / 2, 0] },
      ],
    },
    mat: "chrome",
    layer: 1,
    node: nodes.shoulder,
    modelSpace: true,
    at: upperMid,
    rot: side > 0 ? [0, 0, 0] : [0, 0, 0],
    hint: "上臂主骨：上粗下细的铬钢管（肩球头 → 肘叉耳）",
  });
  builder.add({
    id: `t800.arm${suffix}.humerus_line`,
    cn: `上臂硬管（${side > 0 ? "右" : "左"}）`,
    en: `Upper arm hard line (${suffix})`,
    asm: "arm",
    geom: { type: "cylinder", r: 0.005, h: upperLen - 0.08, segments: 12 },
    mat: "dark_chrome",
    layer: 4,
    node: nodes.shoulder,
    modelSpace: true,
    at: [upperMid[0] + 0.03, upperMid[1], upperMid[2]],
    hint: "沿肱骨外侧走的液压硬管",
  });

  // ================= 肘：圆盘铰链 =================
  builder.add({
    id: `t800.arm${suffix}.elbow_clevis`,
    cn: `肘叉耳（${side > 0 ? "右" : "左"}）`,
    en: `Elbow clevis (${suffix})`,
    asm: "arm",
    geom: {
      type: "kit",
      kit: "t800RoundCheek",
      params: { outerR: 0.03, boreR: JOINT_STD.cheekBore, thickness: JOINT_STD.cheekT },
    },
    mat: "gunmetal",
    layer: 2,
    node: nodes.elbow,
    modelSpace: true,
    at: [P.elbow[0], P.elbow[1], z(P.elbow[2])],
    inst: 2,
    layout: `t800.arm${suffix}.elbow_clevis`,
    instNodes: repeatNode(nodes.elbow, 2),
    hint: "两片叉耳夹住肘关节盘",
  });
  layouts[`t800.arm${suffix}.elbow_clevis`] = armLayout(pivots, nodes.elbow, [
      [0, 0, z(0.026)],
      [0, 0, z(-0.026)],
    ],
  );
  builder.add({
    id: `t800.arm${suffix}.elbow_disc`,
    cn: `肘关节盘（${side > 0 ? "右" : "左"}）`,
    en: `Elbow disc (${suffix})`,
    asm: "arm",
    geom: {
      type: "kit",
      kit: "t800JointDisc",
      params: {
        r: 0.021,
        len: 0.04,
        boreR: 0.011,
        stubR: 0.01,
        stubDrop: 0.024,
      },
    },
    mat: "mirror",
    layer: 2,
    node: nodes.elbow,
    modelSpace: true,
    at: [P.elbow[0], P.elbow[1], z(P.elbow[2])],
    hint: "肘关节盘：镜面铬圆盘，铰链轴沿 Z",
  });
  builder.add({
    id: `t800.arm${suffix}.elbow_pin`,
    cn: `肘铰链销（${side > 0 ? "右" : "左"}）`,
    en: `Elbow hinge pin (${suffix})`,
    asm: "arm",
    geom: { type: "cylinder", r: 0.011, h: 0.08, segments: 20, bevel: 0.001 },
    mat: "mirror",
    layer: 2,
    node: nodes.elbow,
    modelSpace: true,
    at: [P.wrist[0], P.wrist[1], z(P.wrist[2])],
    rot: [90, 0, 0],
    hint: "贯穿两片叉耳与关节盘的横向销轴",
  });

  // ================= 前臂：尺桡双杆（可轴向旋转）=====================
  const foreLen = P.elbow[1] - P.wrist[1] - 0.03;
  const foreMid: [number, number, number] = [
    (P.elbow[0] + P.wrist[0]) / 2,
    (P.elbow[1] + P.wrist[1]) / 2 - 0.015,
    z((P.elbow[2] + P.wrist[2]) / 2),
  ];
  for (const [i, dz] of [0.018, -0.016].entries()) {
    builder.add({
      id: `t800.arm${suffix}.forearm_${i === 0 ? "radius" : "ulna"}`,
      cn: `${i === 0 ? "桡骨" : "尺骨"}（${side > 0 ? "右" : "左"}）`,
      en: `${i === 0 ? "Radius" : "Ulna"} (${suffix})`,
      asm: "arm",
      geom: { type: "cylinder", r: 0.013, h: foreLen - 0.02, segments: 20, bevel: 0.0015 },
      mat: "chrome",
      layer: 1,
      node: nodes.elbow,
      modelSpace: true,
      at: [foreMid[0], foreMid[1], foreMid[2] + z(dz)],
      hint: "前臂双杆：桡骨可绕尺骨轴向旋转（旋前/旋后）",
    });
  }
  builder.add({
    id: `t800.arm${suffix}.pronation_ring`,
    cn: `前臂旋转齿圈（${side > 0 ? "右" : "左"}）`,
    en: `Pronation ring (${suffix})`,
    asm: "arm",
    geom: { type: "tube", rOuter: 0.019, rInner: 0.014, h: 0.008, segments: 28 },
    mat: "dark_chrome",
    layer: 3,
    node: nodes.elbow,
    modelSpace: true,
    at: [foreMid[0], foreMid[1] + 0.04, foreMid[2]],
    hint: "桡尺之间的旋转齿圈：前臂能绕自身轴转",
  });

  // ================= 腕：多轴节 =================
  builder.add({
    id: `t800.arm${suffix}.wrist_disc`,
    cn: `腕关节盘（${side > 0 ? "右" : "左"}）`,
    en: `Wrist disc (${suffix})`,
    asm: "arm",
    geom: {
      type: "kit",
      kit: "t800JointDisc",
      params: { r: 0.016, len: 0.03, boreR: 0.009, stubR: 0.008, stubDrop: 0.016 },
    },
    mat: "mirror",
    layer: 2,
    node: nodes.wrist,
    modelSpace: true,
    at: [0, 0, 0],
    hint: "腕关节盘",
  });
  builder.add({
    id: `t800.arm${suffix}.wrist_pin`,
    cn: `腕铰链销（${side > 0 ? "右" : "左"}）`,
    en: `Wrist hinge pin (${suffix})`,
    asm: "arm",
    geom: { type: "cylinder", r: 0.009, h: 0.05, segments: 18, bevel: 0.001 },
    mat: "mirror",
    layer: 2,
    node: nodes.wrist,
    modelSpace: true,
    at: [0, 0, 0],
    rot: [90, 0, 0],
  });

  // ================= 手：掌骨 ×5 + 指骨 ×15 + 腱索 =================
  builder.add({
    id: `t800.arm${suffix}.palm`,
    cn: `掌骨板（${side > 0 ? "右" : "左"}）`,
    en: `Palm plate (${suffix})`,
    asm: "hand",
    geom: { type: "plate", w: 0.075, h: 0.085, t: 0.009, bevel: 0.002 },
    mat: "chrome",
    layer: 1,
    node: nodes.finger,
    modelSpace: true,
    at: [P.palm[0], P.palm[1] - 0.04, z(P.palm[2])],
    rot: [0, 0, 0],
    hint: "手掌的扁平基板，5 根掌骨从它向前伸出",
  });
  // 5 根掌骨
  builder.add({
    id: `t800.arm${suffix}.metacarpal`,
    cn: `掌骨（实例族 ×5）`,
    en: `Metacarpal family (${suffix})`,
    asm: "hand",
    geom: { type: "cylinder", r: 0.0055, h: 0.052, segments: 12, bevel: 0.001 },
    mat: "chrome",
    layer: 2,
    node: nodes.finger,
    modelSpace: true,
    at: [0, 0, 0],
    inst: 5,
    layout: `t800.arm${suffix}.metacarpal`,
    instNodes: repeatNode(nodes.finger, 5),
    hint: "5 根掌骨：从掌板向前伸出，指骨接在它们头上",
  });
  layouts[`t800.arm${suffix}.metacarpal`] = armLayout(pivots, nodes.finger, FINGER_Z.map((dz) => [P.palm[0] - 0.012, P.palm[1] - 0.012, z(P.palm[2] + dz)] as [number, number, number]),
  );
  // 15 根指骨：三种指节各一族，每族 5 根
  const phalanxNames = ["近节", "中节", "远节"];
  for (let seg = 0; seg < FINGER_SEGMENTS.length; seg++) {
    builder.add({
      id: `t800.arm${suffix}.phalanx${seg}`,
      cn: `指骨·${phalanxNames[seg]}（实例族 ×5）`,
      en: `Phalanx ${seg + 1} family (${suffix})`,
      asm: "hand",
      geom: { type: "cylinder", r: 0.0042, h: FINGER_SEGMENTS[seg], segments: 10, bevel: 0.0008 },
      mat: "chrome",
      layer: 2,
      node: nodes.finger,
      modelSpace: true,
      at: [0, 0, 0],
      inst: 5,
      layout: `t800.arm${suffix}.phalanx${seg}`,
      instNodes: repeatNode(nodes.finger, 5),
      hint: "每指三节指骨（远节最短），关节处球头相连",
    });
    layouts[`t800.arm${suffix}.phalanx${seg}`] = armLayout(pivots, nodes.finger, FINGER_Z.map((dz, i) => {
        // 沿掌骨方向向下排布，逐节缩短
        let x = P.palm[0] - 0.012 - 0.02;
        let y = P.palm[1] - 0.012;
        for (let k = 0; k < seg; k++) {
          x -= FINGER_SEGMENTS[k] * 0.32;
          y -= FINGER_SEGMENTS[k] * 0.9;
        }
        // 拇指（i=0）略短
        void i;
        return [x, y, z(P.palm[2] + dz)] as [number, number, number];
      }),
    );
  }
  // 5 根液压腱：从腕部拉到各指
  builder.add({
    id: `t800.arm${suffix}.tendons`,
    cn: `手指液压腱（实例族 ×5）`,
    en: `Finger tendon family (${suffix})`,
    asm: "hand",
    geom: { type: "cylinder", r: 0.0016, h: 0.11, segments: 8 },
    mat: "brass",
    layer: 4,
    node: nodes.finger,
    modelSpace: true,
    at: [0, 0, 0],
    inst: 5,
    layout: `t800.arm${suffix}.tendons`,
    instNodes: repeatNode(nodes.finger, 5),
    hint: "每指一根腱索：从腕部拉到指根，屈指时收紧",
  });
  layouts[`t800.arm${suffix}.tendons`] = armLayout(pivots, nodes.finger, FINGER_Z.map((dz) => [P.palm[0] + 0.012, P.palm[1] - 0.03, z(P.palm[2] + dz)] as [number, number, number]),
  );

  // ================= 手臂驱动缸（肩 ×2 + 肘 ×1）====================
  for (const spec of armCylinders(side)) {
    addCylinder(builder, spec, { asm: "arm", prefix: `cyl${suffix}`, label: spec.name_cn });
    // 缸 A 端的铰接座：焊在骨段上，球头销插进来
    builder.add({
      id: `t800.arm${suffix}.bracket_${spec.key}`,
      cn: `${spec.name_cn}安装座（${side > 0 ? "右" : "左"}）`,
      en: `${spec.name_cn} bracket (${suffix})`,
      asm: "arm",
      geom: { type: "box", w: 0.022, h: 0.022, d: 0.02, bevel: 0.002 },
      mat: "gunmetal",
      layer: 3,
      node: nodes.shoulder,
      modelSpace: true,
      at: [spec.A[0], spec.A[1], spec.A[2]],
      hint: "驱动缸 A 端的铰接座：焊在骨段上，球头销插进来",
    });
  }
}
