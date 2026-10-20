import type { InstanceLayout } from "../../../assembler/assembler";
import { instanceLayout, repeatNode, type PartBuilder } from "../build";
import {
  BONES,
  JOINT_STD,
  JOINT_Y,
  NODES,
  T800_HYDRAULICS,
  mountKitParams,
} from "../spec";
import { addCylinder } from "./cylinder";

// ============================================================================
// t800/segments/upper —— 髋关节 + 大腿
//
// 髋：骨盆基座板 / 髋轭 / 髋窝座（叉耳 ×2）/ 髋球头座（关节盘）/ 铰链销 /
//     主轴承 ×2 / 密封 ×2 / 保持环 ×2 / 角度传感器 / 螺栓圈
// 大腿：股骨主骨（中空方管梁 + 四处安装凸台）/ 前护甲 / 侧护甲 ×2 /
//       液压硬管 ×4 / 管接头 ×8 / 管卡 ×4
//
// 实例件一律带 instance_nodes：装配器只在这种模式下让实例跟着节点动，
// 位置/朝向由布局函数给（模型坐标 → 节点局部）。
// ============================================================================

const Z90: [number, number, number] = [90, 0, 0];

export function buildUpper(builder: PartBuilder, layouts: Record<string, InstanceLayout>): void {
  // ---- 髋关节（骨盆段，固定）----
  builder.add({
    id: "t800.hip.pelvis",
    cn: "骨盆基座板",
    en: "Pelvis base plate",
    asm: "hip",
    geom: { type: "box", w: 0.34, h: 0.06, d: 0.24, bevel: 0.01 },
    mat: "frame",
    layer: 1,
    node: NODES.base,
    at: [0, 1.53, 0],
    hint: "整条腿的固定基座（根件，不参与悬空判定）",
  });
  builder.add({
    id: "t800.hip.yoke",
    cn: "髋轭",
    en: "Hip yoke",
    asm: "hip",
    geom: {
      type: "kit",
      kit: "t800Bone",
      params: {
        w: 0.32,
        d: 0.12,
        h: 0.146,
        corner: 0.012,
        bore: 0.02,
        cheekR: JOINT_STD.cheekR,
        cheekT: JOINT_STD.cheekT,
        cheekBore: JOINT_STD.cheekBore,
        cheekTop: JOINT_STD.cheekTop,
        cheeks: [],
        mounts: [mountKitParams("hip_flex_a", 1.425), mountKitParams("hip_ext_a", 1.425)],
      },
    },
    mat: "bone",
    layer: 1,
    node: NODES.base,
    at: [0, 1.425, 0],
    hint: "髋轭侧面即髋部两缸的安装面（z=±60mm），与大腿侧 52mm 长凸台齐平",
  });
  builder.add({
    id: "t800.hip.rib",
    cn: "髋部加强板",
    en: "Hip stiffener plate",
    asm: "hip",
    geom: { type: "plate", w: 0.1, h: 0.09, t: 0.012, bevel: 0.003 },
    mat: "chrome",
    layer: 3,
    node: NODES.base,
    at: [0.166, 1.42, 0],
    rot: [0, 90, 0],
  });
  builder.add({
    id: "t800.hip.socket",
    cn: "髋窝座（叉耳）",
    en: "Hip socket clevis",
    asm: "hip",
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
    node: NODES.base,
    at: [0, JOINT_Y.hip, 0],
    inst: 2,
    layout: "t800.hip.socket",
    instNodes: repeatNode(NODES.base, 2),
    hint: "两片叉耳夹住髋球头座，轴承孔压入主轴承",
  });
  layouts["t800.hip.socket"] = instanceLayout(NODES.base, [
    [0, JOINT_Y.hip, -0.036],
    [0, JOINT_Y.hip, 0.036],
  ]);
  builder.add({
    id: "t800.hip.ballhead",
    cn: "髋球头座",
    en: "Hip ball head seat",
    asm: "hip",
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
    node: NODES.hip,
    at: [0, JOINT_Y.hip, 0],
    hint: "球头座插销插入股骨管腔，绕髋铰链销摆动",
  });
  builder.add({
    id: "t800.hip.pin",
    cn: "髋铰链销",
    en: "Hip hinge pin",
    asm: "hip",
    geom: { type: "cylinder", r: JOINT_STD.pinR, h: JOINT_STD.pinLen, segments: 24, bevel: 0.0015 },
    mat: "chrome",
    layer: 2,
    node: NODES.base,
    at: [0, JOINT_Y.hip, 0],
    rot: [90, 0, 0],
    hint: "贯穿两片叉耳与球头座的横向销轴",
  });
  builder.add({
    id: "t800.hip.bushings",
    cn: "髋主轴承",
    en: "Hip main bearing",
    asm: "hip",
    geom: {
      type: "tube",
      rOuter: JOINT_STD.bushOuter,
      rInner: JOINT_STD.bushBore,
      h: JOINT_STD.bushLen,
      segments: 28,
    },
    mat: "brass",
    layer: 2,
    node: NODES.base,
    at: [0, JOINT_Y.hip, 0],
    rot: [90, 0, 0],
    inst: 2,
    layout: "t800.hip.bushings",
    instNodes: repeatNode(NODES.base, 2),
    hint: "压入叉耳轴承孔（0.5mm 配合间隙），内孔走销轴",
  });
  layouts["t800.hip.bushings"] = instanceLayout(
    NODES.base,
    [
      [0, JOINT_Y.hip, -0.036],
      [0, JOINT_Y.hip, 0.036],
    ],
    Z90,
  );
  builder.add({
    id: "t800.hip.seals",
    cn: "髋密封",
    en: "Hip seal",
    asm: "hip",
    geom: { type: "tube", rOuter: 0.021, rInner: 0.0162, h: 0.004, segments: 28 },
    mat: "rubber",
    layer: 4,
    node: NODES.base,
    at: [0, JOINT_Y.hip, 0],
    rot: [90, 0, 0],
    inst: 2,
    layout: "t800.hip.seals",
    instNodes: repeatNode(NODES.base, 2),
    hint: "叉耳外端面的防尘密封",
  });
  layouts["t800.hip.seals"] = instanceLayout(
    NODES.base,
    [
      [0, JOINT_Y.hip, -0.0485],
      [0, JOINT_Y.hip, 0.0485],
    ],
    Z90,
  );
  builder.add({
    id: "t800.hip.retainers",
    cn: "髋保持环",
    en: "Hip retainer ring",
    asm: "hip",
    geom: { type: "tube", rOuter: 0.021, rInner: 0.0163, h: 0.005, segments: 28 },
    mat: "dark_chrome",
    layer: 4,
    node: NODES.base,
    at: [0, JOINT_Y.hip, 0],
    rot: [90, 0, 0],
    inst: 2,
    layout: "t800.hip.retainers",
    instNodes: repeatNode(NODES.base, 2),
    hint: "压住密封与轴肩，限制销轴轴向窜动",
  });
  layouts["t800.hip.retainers"] = instanceLayout(
    NODES.base,
    [
      [0, JOINT_Y.hip, -0.0535],
      [0, JOINT_Y.hip, 0.0535],
    ],
    Z90,
  );
  builder.add({
    id: "t800.hip.sensor",
    cn: "髋角度传感器",
    en: "Hip angle sensor",
    asm: "hip",
    geom: { type: "cylinder", r: 0.012, h: 0.028, segments: 20, bevel: 0.0015 },
    mat: "servo",
    layer: 5,
    node: NODES.base,
    at: [0.11, 1.44, 0.074],
    rot: [90, 0, 0],
    hint: "读取髋关节转角，驱动伺服阀闭环",
  });
  builder.add({
    id: "t800.hip.bolts",
    cn: "骨盆螺栓圈",
    en: "Pelvis bolt circle",
    asm: "fasteners",
    geom: { type: "boltCircle", count: 4, radius: 0.04, boltR: 0.006, boltH: 0.01 },
    mat: "dark_chrome",
    layer: 4,
    node: NODES.base,
    at: [0.11, 1.56, 0],
    hint: "骨盆基座板的固定螺栓圈（与躯干接口，避开阀块）",
  });

  // ---- 髋部两根驱动缸（缸体挂骨盆，活塞杆挂大腿）----
  for (const spec of T800_HYDRAULICS.filter((item) => item.parent === "base")) {
    addCylinder(builder, spec, { asm: "hip", prefix: "cyl", label: spec.name_cn });
  }

  // ---- 大腿（股骨主骨）----
  const femur = BONES.femur;
  const femurHeight = femur.top - femur.bottom;
  const femurCenter = (femur.top + femur.bottom) / 2;
  builder.add({
    id: "t800.thigh.femur",
    cn: "股骨主骨",
    en: "Femur main bone",
    asm: "thigh",
    geom: {
      type: "kit",
      kit: "t800Bone",
      params: {
        w: femur.w,
        d: femur.d,
        h: femurHeight,
        corner: femur.corner,
        bore: femur.bore,
        cheekR: JOINT_STD.cheekR,
        cheekT: JOINT_STD.cheekT,
        cheekBore: JOINT_STD.cheekBore,
        cheekTop: JOINT_STD.cheekTop,
        cheeks: [],
        mounts: [
          mountKitParams("hip_flex_b", femurCenter),
          mountKitParams("hip_ext_b", femurCenter),
          mountKitParams("knee_main_a", femurCenter),
          mountKitParams("knee_comp_a", femurCenter),
        ],
      },
    },
    mat: "bone",
    layer: 1,
    node: NODES.hip,
    at: [0, femurCenter, 0],
    hint: "中空方管梁，管腔贯穿全骨；四处安装凸台 cast 在骨面上",
  });
  builder.add({
    id: "t800.thigh.armor_front",
    cn: "股骨前护甲",
    en: "Femur front armor",
    asm: "thigh",
    geom: { type: "plate", w: 0.1, h: 0.3, t: 0.006, bevel: 0.002 },
    mat: "chrome",
    layer: 3,
    node: NODES.hip,
    at: [0.051, 1.01, 0],
    rot: [0, 90, 0],
    hint: "贴在股骨 +X 侧面",
  });
  builder.add({
    id: "t800.thigh.armor_side",
    cn: "股骨侧护甲",
    en: "Femur side armor",
    asm: "thigh",
    geom: { type: "plate", w: 0.024, h: 0.24, t: 0.006, bevel: 0.002 },
    mat: "chrome",
    layer: 3,
    node: NODES.hip,
    at: [0, 1.01, 0],
    inst: 2,
    layout: "t800.thigh.armor_side",
    instNodes: repeatNode(NODES.hip, 2),
    hint: "贴在股骨 ±Z 侧面的中央护条（宽度避开两侧安装凸台）",
  });
  layouts["t800.thigh.armor_side"] = instanceLayout(NODES.hip, [
    [0, 1.01, -0.0375],
    [0, 1.01, 0.0375],
  ]);
  builder.add({
    id: "t800.thigh.lines",
    cn: "股骨液压硬管",
    en: "Femur hard line",
    asm: "thigh",
    geom: { type: "cylinder", r: 0.005, h: 0.28, segments: 14 },
    mat: "dark_chrome",
    layer: 4,
    node: NODES.hip,
    at: [0, 1.0, 0],
    inst: 4,
    layout: "t800.thigh.lines",
    instNodes: repeatNode(NODES.hip, 4),
    hint: "沿股骨前后侧走管，两端各有一个卡套接头",
  });
  layouts["t800.thigh.lines"] = instanceLayout(NODES.hip, [
    [0.065, 1.0, 0.02],
    [0.065, 1.0, -0.02],
    [-0.065, 1.0, 0.02],
    [-0.065, 1.0, -0.02],
  ]);
  builder.add({
    id: "t800.thigh.fittings",
    cn: "股骨管接头",
    en: "Femur line fitting",
    asm: "thigh",
    geom: { type: "tube", rOuter: 0.009, rInner: 0.0052, h: 0.014, segments: 16 },
    mat: "brass",
    layer: 4,
    node: NODES.hip,
    at: [0, 1.0, 0],
    inst: 8,
    layout: "t800.thigh.fittings",
    instNodes: repeatNode(NODES.hip, 8),
    hint: "硬管两端卡套接头（内孔 0.2mm 间隙包住硬管）",
  });
  layouts["t800.thigh.fittings"] = instanceLayout(NODES.hip, [
    [0.065, 1.14, 0.02],
    [0.065, 0.86, 0.02],
    [0.065, 1.14, -0.02],
    [0.065, 0.86, -0.02],
    [-0.065, 1.14, 0.02],
    [-0.065, 0.86, 0.02],
    [-0.065, 1.14, -0.02],
    [-0.065, 0.86, -0.02],
  ]);
  builder.add({
    id: "t800.thigh.clamps",
    cn: "股骨管卡",
    en: "Femur line clamp",
    asm: "thigh",
    geom: { type: "tube", rOuter: 0.0075, rInner: 0.0052, h: 0.008, segments: 16 },
    mat: "brass",
    layer: 4,
    node: NODES.hip,
    at: [0, 1.0, 0],
    inst: 4,
    layout: "t800.thigh.clamps",
    instNodes: repeatNode(NODES.hip, 4),
    hint: "卡箍抱住硬管（内孔 0.2mm 间隙），把管固定在护甲上",
  });
  layouts["t800.thigh.clamps"] = instanceLayout(NODES.hip, [
    [0.065, 1.07, 0.02],
    [0.065, 0.93, 0.02],
    [-0.065, 1.07, -0.02],
    [-0.065, 0.93, -0.02],
  ]);

  builder.add({
    id: "t800.thigh.rib",
    cn: "股骨后加强板",
    en: "Femur rear stiffener",
    asm: "thigh",
    geom: { type: "plate", w: 0.08, h: 0.22, t: 0.006, bevel: 0.002 },
    mat: "chrome",
    layer: 3,
    node: NODES.hip,
    at: [-0.051, 1.0, 0],
    rot: [0, -90, 0],
    hint: "股骨后侧的加强板（贴骨面）",
  });
  builder.add({
    id: "t800.thigh.harness",
    cn: "大腿传感线束",
    en: "Thigh harness",
    asm: "thigh",
    geom: { type: "cylinder", r: 0.005, h: 0.2, segments: 12 },
    mat: "rubber",
    layer: 5,
    node: NODES.hip,
    at: [-0.0595, 1.0, 0],
    hint: "沿股骨后加强板走的中段线束",
  });
  builder.add({
    id: "t800.thigh.straps",
    cn: "股骨护甲压条",
    en: "Femur armor strap",
    asm: "thigh",
    geom: { type: "box", w: 0.014, h: 0.008, d: 0.02, bevel: 0.0015 },
    mat: "brass",
    layer: 4,
    node: NODES.hip,
    at: [0, 0, 0],
    inst: 2,
    layout: "t800.thigh.straps",
    instNodes: repeatNode(NODES.hip, 2),
    hint: "把前护甲压在骨面上的压条（实例族）",
  });
  layouts["t800.thigh.straps"] = instanceLayout(NODES.hip, [
    [0.0615, 1.1, 0],
    [0.0615, 0.9, 0],
  ]);

  // ---- 膝部两根驱动缸（缸体挂大腿，活塞杆挂小腿）----
  for (const spec of T800_HYDRAULICS.filter((item) => item.parent === "hip")) {
    addCylinder(builder, spec, { asm: "thigh", prefix: "cyl", label: spec.name_cn });
  }
}
