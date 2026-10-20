import type { InstanceLayout } from "../../../assembler/assembler";
import { instanceLayout, repeatNode, type PartBuilder } from "../build";
import {
  BONES,
  JOINT_STD,
  JOINT_X,
  JOINT_Y,
  NODES,
  STUD,
  T800_HYDRAULICS,
  mountKitParams,
} from "../spec";
import { addCylinder } from "./cylinder";

// ============================================================================
// t800/segments/lower —— 膝关节 + 小腿 + 踝关节 + 足部
//
// 膝：叉耳（×2）/ 关节盘 / 铰链销 / 衬套 ×2 / 卡环 ×2 / 前后护罩 / 销端盖
// 小腿：胫骨主骨（中空方管梁 + 踝驱动缸凸台）/ 前护甲 / 侧护甲 ×2 /
//       液压硬管 ×4 / 管接头 ×8 / 管卡 ×4
// 踝：叉耳（×2）/ 关节盘 / 铰链销 / 衬套 ×2 / 卡环 ×2 / 角度传感器
// 足：踝连接座 / 跟骨 / 跖骨 ×3 / 趾骨 / 趾甲护片 / 减震垫 ×2 / 防滑钉 ×4 / 足底板
// ============================================================================

/** 踝连接座中心高度（足部主体）。 */
const HOUSING_CENTER_Y = 0.063;
const Z90: [number, number, number] = [90, 0, 0];

export function buildLower(builder: PartBuilder, layouts: Record<string, InstanceLayout>): void {
  // ===================== 膝关节 =====================
  builder.add({
    id: "t800.knee.socket",
    cn: "膝叉耳",
    en: "Knee clevis",
    asm: "knee",
    geom: {
      type: "kit",
      kit: "t800Cheek",
      params: {
        r: JOINT_STD.cheekR,
        boreR: JOINT_STD.cheekBore,
        thickness: JOINT_STD.cheekT,
        top: JOINT_STD.cheekTop,
      },
    },
    mat: "gunmetal",
    layer: 2,
    node: NODES.hip,
    at: [JOINT_X.knee, JOINT_Y.knee, 0],
    inst: 2,
    layout: "t800.knee.socket",
    instNodes: repeatNode(NODES.hip, 2),
    hint: "两片叉耳 cast 在股骨末端，夹住膝关节盘",
  });
  layouts["t800.knee.socket"] = instanceLayout(NODES.hip, [
    [JOINT_X.knee, JOINT_Y.knee, -0.036],
    [JOINT_X.knee, JOINT_Y.knee, 0.036],
  ]);
  builder.add({
    id: "t800.knee.disc",
    cn: "膝关节盘",
    en: "Knee joint disc",
    asm: "knee",
    geom: {
      type: "kit",
      kit: "t800JointDisc",
      params: {
        r: JOINT_STD.discR,
        len: JOINT_STD.discLen,
        boreR: JOINT_STD.boreR,
        stubR: JOINT_STD.stubR,
        stubDrop: JOINT_STD.stubDrop,
      },
    },
    mat: "chrome",
    layer: 2,
    node: NODES.knee,
    at: [JOINT_X.knee, JOINT_Y.knee, 0],
    hint: "关节盘插销插入胫骨管腔，绕膝铰链销摆动",
  });
  builder.add({
    id: "t800.knee.pin",
    cn: "膝铰链销",
    en: "Knee hinge pin",
    asm: "knee",
    geom: { type: "cylinder", r: JOINT_STD.pinR, h: JOINT_STD.pinLen, segments: 24, bevel: 0.0015 },
    mat: "chrome",
    layer: 2,
    node: NODES.hip,
    at: [JOINT_X.knee, JOINT_Y.knee, 0],
    rot: [90, 0, 0],
  });
  builder.add({
    id: "t800.knee.bushings",
    cn: "膝衬套",
    en: "Knee bushing",
    asm: "knee",
    geom: {
      type: "tube",
      rOuter: JOINT_STD.bushOuter,
      rInner: JOINT_STD.bushBore,
      h: JOINT_STD.bushLen,
      segments: 28,
    },
    mat: "brass",
    layer: 2,
    node: NODES.hip,
    at: [JOINT_X.knee, JOINT_Y.knee, 0],
    rot: [90, 0, 0],
    inst: 2,
    layout: "t800.knee.bushings",
    instNodes: repeatNode(NODES.hip, 2),
  });
  layouts["t800.knee.bushings"] = instanceLayout(
    NODES.hip,
    [
      [JOINT_X.knee, JOINT_Y.knee, -0.036],
      [JOINT_X.knee, JOINT_Y.knee, 0.036],
    ],
    Z90,
  );
  builder.add({
    id: "t800.knee.circlips",
    cn: "膝卡环",
    en: "Knee circlip",
    asm: "knee",
    geom: {
      type: "tube",
      rOuter: JOINT_STD.clipOuter,
      rInner: JOINT_STD.clipBore,
      h: JOINT_STD.clipT,
      segments: 28,
    },
    mat: "dark_chrome",
    layer: 4,
    node: NODES.hip,
    at: [JOINT_X.knee, JOINT_Y.knee, 0],
    rot: [90, 0, 0],
    inst: 2,
    layout: "t800.knee.circlips",
    instNodes: repeatNode(NODES.hip, 2),
    hint: "销轴端部卡环，限制轴向窜动",
  });
  layouts["t800.knee.circlips"] = instanceLayout(
    NODES.hip,
    [
      [JOINT_X.knee, JOINT_Y.knee, -0.0485],
      [JOINT_X.knee, JOINT_Y.knee, 0.0485],
    ],
    Z90,
  );
  builder.add({
    id: "t800.knee.guard_front",
    cn: "膝前护罩",
    en: "Knee front guard",
    asm: "knee",
    geom: { type: "plate", w: 0.058, h: 0.13, t: 0.008, bevel: 0.0025 },
    mat: "chrome",
    layer: 3,
    node: NODES.knee,
    at: [0.0175, 0.6, 0],
    rot: [0, 90, 0],
    hint: "盖住胫骨上端，把前侧补偿缸的冲击面保护起来",
  });
  builder.add({
    id: "t800.knee.guard_back",
    cn: "膝后护罩",
    en: "Knee rear guard",
    asm: "knee",
    geom: { type: "plate", w: 0.058, h: 0.13, t: 0.008, bevel: 0.0025 },
    mat: "chrome",
    layer: 3,
    node: NODES.knee,
    at: [-0.0875, 0.615, 0],
    rot: [0, 90, 0],
  });
  builder.add({
    id: "t800.knee.guard_bracket",
    cn: "膝护罩支架",
    en: "Knee guard bracket",
    asm: "knee",
    geom: { type: "box", w: 0.006, h: 0.03, d: 0.03, bevel: 0.0015 },
    mat: "gunmetal",
    layer: 3,
    node: NODES.knee,
    at: [0, 0, 0],
    inst: 2,
    layout: "t800.knee.guard_bracket",
    instNodes: repeatNode(NODES.knee, 2),
    hint: "把前后护罩固定在胫骨上的支架（实例族）",
  });
  layouts["t800.knee.guard_bracket"] = instanceLayout(NODES.knee, [
    [0.0175, 0.51, 0],
    [-0.0875, 0.51, 0],
  ]);
  builder.add({
    id: "t800.knee.boot",
    cn: "膝销端盖",
    en: "Knee pin end cap",
    asm: "knee",
    geom: { type: "tube", rOuter: 0.018, rInner: 0.0165, h: 0.004, segments: 24 },
    mat: "rubber",
    layer: 4,
    node: NODES.knee,
    at: [JOINT_X.knee, JOINT_Y.knee, 0.0535],
    rot: [90, 0, 0],
    hint: "膝销外端的防尘端盖（内孔 0.5mm 间隙套在销轴上）",
  });

  // ===================== 小腿 =====================
  const tibia = BONES.tibia;
  const tibiaHeight = tibia.top - tibia.bottom;
  const tibiaCenter = (tibia.top + tibia.bottom) / 2;
  builder.add({
    id: "t800.shin.tibia",
    cn: "胫骨主骨",
    en: "Tibia main bone",
    asm: "shin",
    geom: {
      type: "kit",
      kit: "t800Bone",
      params: {
        w: tibia.w,
        d: tibia.d,
        h: tibiaHeight,
        corner: tibia.corner,
        bore: tibia.bore,
        cheekR: JOINT_STD.cheekR,
        cheekT: JOINT_STD.cheekT,
        cheekBore: JOINT_STD.cheekBore,
        cheekTop: JOINT_STD.cheekTop,
        cheeks: [],
        rail: 0.013,
        ringT: 0.009,
        ringCount: 5,
        endT: 0.014,
        bodyX: tibia.bodyX,
        endScale: tibia.endScale,
        endBottomX: tibia.endBottomX,
        endTopScale: tibia.endTopScale,
        padW: 0.034,
        padH: 0.034,
        padT: 0.016,
        mounts: [
          mountKitParams("ankle_l_a", tibiaCenter),
          mountKitParams("ankle_r_a", tibiaCenter),
        ],
      },
    },
    mat: "bone",
    layer: 1,
    node: NODES.knee,
    at: [0, tibiaCenter, 0],
    hint: "中空方管梁 + 外骨骼环箍 ×5 + 四角纵肋：踝驱动缸与硬管从骨架间露出来",
  });
  builder.add({
    id: "t800.shin.armor_front",
    cn: "胫骨前护板",
    en: "Tibia front guard",
    asm: "shin",
    geom: { type: "plate", w: 0.02, h: 0.1, t: 0.006, bevel: 0.002 },
    mat: "chrome",
    layer: 3,
    node: NODES.knee,
    at: [0.0155, 0.44, 0],    rot: [0, 90, 0],
    hint: "只护胫骨上段正面的局部护板，其余全露",
  });
  builder.add({
    id: "t800.shin.armor_side",
    cn: "胫骨侧护条",
    en: "Tibia side strip",
    asm: "shin",
    geom: { type: "plate", w: 0.024, h: 0.22, t: 0.006, bevel: 0.002 },
    mat: "chrome",
    layer: 3,
    node: NODES.knee,
    at: [0, 0.375, 0],
    inst: 2,
    layout: "t800.shin.armor_side",
    instNodes: repeatNode(NODES.knee, 2),
    hint: "只在骨段两侧夹一条窄护条，不遮骨架",
  });
  layouts["t800.shin.armor_side"] = instanceLayout(NODES.knee, [
    [0, 0.375, -0.0382],
    [0, 0.375, 0.0382],
  ]);
  builder.add({
    id: "t800.shin.lines",
    cn: "胫骨液压硬管",
    en: "Tibia hard line",
    asm: "shin",
    geom: { type: "cylinder", r: 0.005, h: 0.24, segments: 14 },
    mat: "dark_chrome",
    layer: 4,
    node: NODES.knee,
    at: [0, 0.38, 0],
    inst: 4,
    layout: "t800.shin.lines",
    instNodes: repeatNode(NODES.knee, 4),
  });
  layouts["t800.shin.lines"] = instanceLayout(NODES.knee, [
    [0.02, 0.38, 0.02],
    [0.02, 0.38, -0.02],
    [-0.09, 0.38, 0.02],
    [-0.09, 0.38, -0.02],
  ]);
  builder.add({
    id: "t800.shin.fittings",
    cn: "胫骨管接头",
    en: "Tibia line fitting",
    asm: "shin",
    geom: { type: "tube", rOuter: 0.0055, rInner: 0.0052, h: 0.014, segments: 16 },
    mat: "brass",
    layer: 4,
    node: NODES.knee,
    at: [0, 0.38, 0],
    inst: 8,
    layout: "t800.shin.fittings",
    instNodes: repeatNode(NODES.knee, 8),
  });
  layouts["t800.shin.fittings"] = instanceLayout(NODES.knee, [
    [0.02, 0.5, 0.02],
    [0.02, 0.26, 0.02],
    [0.02, 0.5, -0.02],
    [0.02, 0.26, -0.02],
    [-0.09, 0.5, 0.02],
    [-0.09, 0.26, 0.02],
    [-0.09, 0.5, -0.02],
    [-0.09, 0.26, -0.02],
  ]);
  builder.add({
    id: "t800.shin.clamps",
    cn: "胫骨管卡",
    en: "Tibia line clamp",
    asm: "shin",
    geom: { type: "tube", rOuter: 0.0055, rInner: 0.0052, h: 0.008, segments: 16 },
    mat: "brass",
    layer: 4,
    node: NODES.knee,
    at: [0, 0.38, 0],
    inst: 4,
    layout: "t800.shin.clamps",
    instNodes: repeatNode(NODES.knee, 4),
  });
  layouts["t800.shin.clamps"] = instanceLayout(NODES.knee, [
    [0.02, 0.44, 0.02],
    [0.02, 0.32, 0.02],
    [-0.09, 0.44, -0.02],
    [-0.09, 0.32, -0.02],
  ]);

  builder.add({
    id: "t800.shin.rib",
    cn: "胫骨后加强条",
    en: "Tibia rear rib",
    asm: "shin",
    geom: { type: "plate", w: 0.025, h: 0.18, t: 0.006, bevel: 0.002 },
    mat: "chrome",
    layer: 3,
    node: NODES.knee,
    at: [-0.0945, 0.375, 0],
    rot: [0, -90, 0],
    hint: "胫骨后侧的窄加强条（背面也只留一条，不包壳）",
  });
  builder.add({
    id: "t800.shin.harness",
    cn: "小腿传感线束",
    en: "Shin harness",
    asm: "shin",
    geom: { type: "cylinder", r: 0.005, h: 0.16, segments: 12 },
    mat: "rubber",
    layer: 5,
    node: NODES.knee,
    at: [-0.096, 0.375, 0.0305],
    hint: "沿胫骨后加强条走的下段线束（外露可见）",
  });

  // ===================== 踝关节 =====================
  builder.add({
    id: "t800.ankle.socket",
    cn: "踝叉耳",
    en: "Ankle clevis",
    asm: "ankle",
    geom: {
      type: "kit",
      kit: "t800Cheek",
      params: {
        r: JOINT_STD.cheekR,
        boreR: JOINT_STD.cheekBore,
        thickness: JOINT_STD.cheekT,
        top: JOINT_STD.cheekTop,
      },
    },
    mat: "gunmetal",
    layer: 2,
    node: NODES.knee,
    at: [0, JOINT_Y.ankle, 0],
    inst: 2,
    layout: "t800.ankle.socket",
    instNodes: repeatNode(NODES.knee, 2),
  });
  layouts["t800.ankle.socket"] = instanceLayout(NODES.knee, [
    [0, JOINT_Y.ankle, -0.036],
    [0, JOINT_Y.ankle, 0.036],
  ]);
  builder.add({
    id: "t800.ankle.disc",
    cn: "踝关节盘",
    en: "Ankle joint disc",
    asm: "ankle",
    geom: {
      type: "kit",
      kit: "t800JointDisc",
      params: {
        r: JOINT_STD.discR,
        len: JOINT_STD.discLen,
        boreR: JOINT_STD.boreR,
        stubR: JOINT_STD.stubR,
        stubDrop: JOINT_STD.stubDrop,
      },
    },
    mat: "chrome",
    layer: 2,
    node: NODES.ankle,
    at: [0, JOINT_Y.ankle, 0],
  });
  builder.add({
    id: "t800.ankle.pin",
    cn: "踝铰链销",
    en: "Ankle hinge pin",
    asm: "ankle",
    geom: { type: "cylinder", r: JOINT_STD.pinR, h: JOINT_STD.pinLen, segments: 24, bevel: 0.0015 },
    mat: "chrome",
    layer: 2,
    node: NODES.knee,
    at: [0, JOINT_Y.ankle, 0],
    rot: [90, 0, 0],
  });
  builder.add({
    id: "t800.ankle.bushings",
    cn: "踝衬套",
    en: "Ankle bushing",
    asm: "ankle",
    geom: {
      type: "tube",
      rOuter: JOINT_STD.bushOuter,
      rInner: JOINT_STD.bushBore,
      h: JOINT_STD.bushLen,
      segments: 28,
    },
    mat: "brass",
    layer: 2,
    node: NODES.knee,
    at: [0, JOINT_Y.ankle, 0],
    rot: [90, 0, 0],
    inst: 2,
    layout: "t800.ankle.bushings",
    instNodes: repeatNode(NODES.knee, 2),
  });
  layouts["t800.ankle.bushings"] = instanceLayout(
    NODES.knee,
    [
      [0, JOINT_Y.ankle, -0.036],
      [0, JOINT_Y.ankle, 0.036],
    ],
    Z90,
  );
  builder.add({
    id: "t800.ankle.circlips",
    cn: "踝卡环",
    en: "Ankle circlip",
    asm: "ankle",
    geom: {
      type: "tube",
      rOuter: JOINT_STD.clipOuter,
      rInner: JOINT_STD.clipBore,
      h: JOINT_STD.clipT,
      segments: 28,
    },
    mat: "dark_chrome",
    layer: 4,
    node: NODES.knee,
    at: [0, JOINT_Y.ankle, 0],
    rot: [90, 0, 0],
    inst: 2,
    layout: "t800.ankle.circlips",
    instNodes: repeatNode(NODES.knee, 2),
  });
  layouts["t800.ankle.circlips"] = instanceLayout(
    NODES.knee,
    [
      [0, JOINT_Y.ankle, -0.0485],
      [0, JOINT_Y.ankle, 0.0485],
    ],
    Z90,
  );
  builder.add({
    id: "t800.ankle.sensor",
    cn: "踝角度传感器",
    en: "Ankle angle sensor",
    asm: "ankle",
    geom: { type: "cylinder", r: 0.011, h: 0.024, segments: 18, bevel: 0.0012 },
    mat: "servo",
    layer: 5,
    node: NODES.knee,
    at: [-0.038, 0.24, 0.0465],
    rot: [90, 0, 0],
    hint: "读取踝关节转角（与髋/膝传感器同一总线）",
  });

  // ===================== 足部 =====================
  builder.add({
    id: "t800.foot.housing",
    cn: "踝连接座",
    en: "Ankle mounting housing",
    asm: "foot",
    geom: {
      type: "kit",
      kit: "t800Bone",
      params: {
        w: 0.15,
        d: 0.068,
        h: 0.085,
        corner: 0.012,
        bore: 0.016,
        cheekR: JOINT_STD.cheekR,
        cheekT: JOINT_STD.cheekT,
        cheekBore: JOINT_STD.cheekBore,
        cheekTop: JOINT_STD.cheekTop,
        cheeks: [],
        ringT: 0.009,
        ringCount: 2,
        bodyX: 0,
        endScale: 0.8,
        endTopScale: 0.8,
        padW: 0.034,
        padH: 0.034,
        padT: 0.016,
        mounts: [
          {
            y: 0.07 - HOUSING_CENTER_Y,
            x: -0.055,
            side: 1,
            out: 0.026,
            faceR: STUD.faceR,
            boreR: STUD.bossBore,
            boreDepth: STUD.bossBoreDepth,
            embed: 0.028,
          },
          {
            y: 0.07 - HOUSING_CENTER_Y,
            x: -0.055,
            side: -1,
            out: 0.026,
            faceR: STUD.faceR,
            boreR: STUD.bossBore,
            boreDepth: STUD.bossBoreDepth,
            embed: 0.028,
          },
        ],
      },
    },
    mat: "bone",
    layer: 1,
    node: NODES.ankle,
    at: [0, HOUSING_CENTER_Y, 0],
    hint: "踝连接座：方管梁 + 环箍 + 角肋的开放骨架，踝销与缸耳全露",
  });
  builder.add({
    id: "t800.foot.calcaneus",
    cn: "跟骨",
    en: "Calcaneus",
    asm: "foot",
    geom: { type: "box", w: 0.05, h: 0.05, d: 0.09, bevel: 0.006 },
    mat: "bone",
    layer: 1,
    node: NODES.ankle,
    at: [-0.112, 0.035, 0],
    hint: "跟骨承担踝冲击，向后下方撑住足底",
  });
  builder.add({
    id: "t800.foot.metatarsals",
    cn: "跖骨",
    en: "Metatarsal",
    asm: "foot",
    geom: { type: "box", w: 0.14, h: 0.038, d: 0.024, bevel: 0.005 },
    mat: "chrome",
    layer: 1,
    node: NODES.ankle,
    at: [0, 0, 0],
    inst: 3,
    layout: "t800.foot.metatarsals",
    instNodes: repeatNode(NODES.ankle, 3),
  });
  layouts["t800.foot.metatarsals"] = instanceLayout(NODES.ankle, [
    [0.155, 0.04, -0.032],
    [0.155, 0.04, 0],
    [0.155, 0.04, 0.032],
  ]);
  builder.add({
    id: "t800.ankle.stop_pin",
    cn: "踝限位销",
    en: "Ankle stop pin",
    asm: "ankle",
    geom: { type: "cylinder", r: 0.005, h: 0.03, segments: 14, bevel: 0.0008 },
    mat: "chrome",
    layer: 2,
    node: NODES.knee,
    at: [-0.005, 0.19, 0],
    rot: [0, 0, 90],
    hint: "踝背屈限位销，限制足部相对小腿的最大转角",
  });
  builder.add({
    id: "t800.foot.toe",
    cn: "趾骨",
    en: "Toe bone",
    asm: "foot",
    geom: { type: "box", w: 0.06, h: 0.036, d: 0.085, bevel: 0.006 },
    mat: "chrome",
    layer: 1,
    node: NODES.ankle,
    at: [0.255, 0.032, 0],
  });
  builder.add({
    id: "t800.foot.heel_plate",
    cn: "跟骨护板",
    en: "Heel guard plate",
    asm: "foot",
    geom: { type: "plate", w: 0.05, h: 0.04, t: 0.008, bevel: 0.002 },
    mat: "chrome",
    layer: 3,
    node: NODES.ankle,
    at: [-0.141, 0.035, 0],
    rot: [0, 90, 0],
    hint: "包住跟骨后端的护板（1mm 间隙）",
  });
  builder.add({
    id: "t800.foot.toecap",
    cn: "趾甲护片",
    en: "Toe cap plate",
    asm: "foot",
    geom: { type: "plate", w: 0.05, h: 0.03, t: 0.006, bevel: 0.002 },
    mat: "dark_chrome",
    layer: 3,
    node: NODES.ankle,
    at: [0.255, 0.0655, 0],
    rot: [0, 90, 0],
    hint: "盖在趾骨顶面（0.5mm 胶层）",
  });
  builder.add({
    id: "t800.foot.sole",
    cn: "足底板",
    en: "Sole plate",
    asm: "foot",
    geom: { type: "plate", w: 0.34, h: 0.1, t: 0.008, bevel: 0.003 },
    mat: "gunmetal",
    layer: 3,
    node: NODES.ankle,
    at: [0.075, 0.005, 0],
    rot: [90, 0, 0],
    hint: "足底承力板（0.34×0.10m），跟骨到趾骨整段托底",
  });
  builder.add({
    id: "t800.foot.pads",
    cn: "减震垫",
    en: "Damping pad",
    asm: "foot",
    geom: { type: "box", w: 0.1, h: 0.012, d: 0.06, bevel: 0.003 },
    mat: "rubber",
    layer: 3,
    node: NODES.ankle,
    at: [0, 0, 0],
    inst: 2,
    layout: "t800.foot.pads",
    instNodes: repeatNode(NODES.ankle, 2),
    hint: "前后两块减震垫，抬足时接地",
  });
  layouts["t800.foot.pads"] = instanceLayout(NODES.ankle, [
    [0.12, 0.015, -0.034],
    [0.12, 0.015, 0.034],
  ]);
  builder.add({
    id: "t800.foot.studs",
    cn: "防滑钉",
    en: "Traction stud",
    asm: "foot",
    geom: { type: "cylinder", r: 0.01, h: 0.01, segments: 14, bevel: 0.0015 },
    mat: "dark_chrome",
    layer: 4,
    node: NODES.ankle,
    at: [0, 0, 0],
    inst: 4,
    layout: "t800.foot.studs",
    instNodes: repeatNode(NODES.ankle, 4),
    hint: "四颗防滑钉，钉尖低于足底 10mm",
  });
  layouts["t800.foot.studs"] = instanceLayout(NODES.ankle, [
    [0.19, -0.005, -0.03],
    [0.19, -0.005, 0.03],
    [0.06, -0.005, -0.03],
    [0.06, -0.005, 0.03],
  ]);

  // ===================== 踝部两根驱动缸 =====================
  for (const spec of T800_HYDRAULICS.filter((item) => item.parent === "knee")) {
    addCylinder(builder, spec, { asm: "shin", prefix: "cyl", label: spec.name_cn });
  }
}
