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
    cn: "骨盆框板",
    en: "Pelvis frame plate",
    asm: "hip",
    geom: { type: "box", w: 0.34, h: 0.014, d: 0.24, bevel: 0.004 },
    mat: "frame",
    layer: 1,
    node: NODES.base,
    at: [0, 1.53, 0],
    hint: "骨盆是开放框板（前侧挖空看穿内部），不是整块壳",
  });
  builder.add({
    id: "t800.hip.yoke",
    cn: "髋轭",
    en: "Hip yoke",
    asm: "hip",
    geom: {
      type: "merge",
      parts: [
        { type: "box", w: 0.018, h: 0.15, d: 0.11, bevel: 0.004, at: [-0.13, 0, 0] },
        { type: "box", w: 0.018, h: 0.15, d: 0.11, bevel: 0.004, at: [0.13, 0, 0] },
        { type: "box", w: 0.28, h: 0.016, d: 0.11, bevel: 0.004, at: [0, 0.067, 0] },
        { type: "box", w: 0.28, h: 0.014, d: 0.1, bevel: 0.004, at: [0, -0.0645, 0] },
        {
          type: "kit",
          kit: "t800Boss",
          params: { faceR: 0.016, len: 0.016, boreR: 0.002, boreDepth: 0.0005, dir: 1 },
          at: [0.13, -0.035, 0.071],
        },
        {
          type: "kit",
          kit: "t800Boss",
          params: { faceR: 0.016, len: 0.016, boreR: 0.002, boreDepth: 0.0005, dir: -1 },
          at: [-0.13, -0.035, -0.071],
        },
      ],
    },
    mat: "bone",
    layer: 1,
    node: NODES.base,
    at: [0, 1.425, 0],
    hint: "髋轭是 U 形开口架（两侧立板 + 上下横梁 + 两个缸安装凸台），中间全开：髋销、球头座、缸耳全露着",
  });
  builder.add({
    id: "t800.hip.rib_bolt",
    cn: "髋部加强板螺栓",
    en: "Hip rib bolt",
    asm: "hip",
    geom: { type: "cylinder", r: 0.005, h: 0.006, segments: 12, bevel: 0.0008 },
    mat: "dark_chrome",
    layer: 4,
    node: NODES.base,
    at: [0.158, 1.42, 0],
    rot: [0, 0, 90],
    hint: "把髋部加强板锁在髋轭上的螺栓头",
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
    at: [0.149, 1.42, 0],
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
    mat: "mirror",
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
    mat: "mirror",
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
    geom: { type: "boltCircle", count: 4, radius: 0.02, boltR: 0.006, boltH: 0.01 },
    mat: "dark_chrome",
    layer: 4,
    node: NODES.base,
    at: [-0.13, 1.5367, -0.06],
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
        rail: 0.013,
        ringT: 0.009,
        ringCount: 5,
        endT: 0.014,
        bodyX: femur.bodyX,
        endScale: femur.endScale,
        endBottomX: femur.endBottomX,
        // 外侧曲面装甲板：与骨段同一零件，凸台从中穿出（参考图的"外皮"做法）
        shell: {
          z0: 0.0355,
          thickness: 0.005,
          levels: [
            { y: 0.2355, halfW: 0.082, bow: 0.022, bulgeF: 0.004, bulgeB: 0.004 },
            { y: 0.1927, halfW: 0.081, bow: 0.0235, bulgeF: 0.009, bulgeB: 0.006 },
            { y: 0.15, halfW: 0.079, bow: 0.024, bulgeF: 0.014, bulgeB: 0.008 },
            { y: 0.075, halfW: 0.077, bow: 0.0238, bulgeF: 0.018, bulgeB: 0.009 },
            { y: 0.0, halfW: 0.075, bow: 0.023, bulgeF: 0.02, bulgeB: 0.009 },
            { y: -0.075, halfW: 0.072, bow: 0.021, bulgeF: 0.019, bulgeB: 0.008 },
            { y: -0.15, halfW: 0.068, bow: 0.018, bulgeF: 0.015, bulgeB: 0.007 },
            { y: -0.1927, halfW: 0.065, bow: 0.015, bulgeF: 0.009, bulgeB: 0.005 },
            { y: -0.2355, halfW: 0.062, bow: 0.012, bulgeF: 0.004, bulgeB: 0.004 },
          ],
        },
        endTopScale: femur.endTopScale,
        padW: 0.05,
        padH: 0.05,
        padT: 0.016,
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
    hint: "中空方管梁 + 外骨骼环箍 ×5 + 四角纵肋：管路与关节机构从环箍之间看得见",
  });
  builder.add({
    id: "t800.thigh.armor_front",
    cn: "股骨前护板",
    en: "Femur front guard",
    asm: "thigh",
    geom: { type: "plate", w: 0.02, h: 0.11, t: 0.006, bevel: 0.002 },
    mat: "chrome",
    layer: 3,
    node: NODES.hip,
    at: [0.117, 1.21, 0],
    rot: [0, 90, 0],
    hint: "只护大腿上段正面的局部护板（不包全身），髋缸与骨面全露",
  });
  builder.add({
    id: "t800.thigh.armor_side",
    cn: "股骨侧护条",
    en: "Femur side strip",
    asm: "thigh",
    geom: { type: "plate", w: 0.02, h: 0.24, t: 0.006, bevel: 0.002 },
    mat: "chrome",
    layer: 3,
    node: NODES.hip,
    at: [0, 1.01, 0],
    inst: 2,
    layout: "t800.thigh.armor_side",
    instNodes: repeatNode(NODES.hip, 2),
    hint: "只在骨段两侧夹一条窄护条（宽 20mm，避开安装凸台），不遮骨架",
  });
  layouts["t800.thigh.armor_side"] = instanceLayout(NODES.hip, [
    [0.055, 1.01, -0.0395],
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
    [0.125, 1.0, 0.02],
    [0.125, 1.0, -0.02],
    [-0.013, 1.0, 0.02],
    [-0.013, 1.0, -0.02],
  ]);
  builder.add({
    id: "t800.thigh.fittings",
    cn: "股骨管接头",
    en: "Femur line fitting",
    asm: "thigh",
    geom: { type: "tube", rOuter: 0.0055, rInner: 0.0053, h: 0.014, segments: 16 },
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
    [0.125, 1.14, 0.02],
    [0.125, 0.86, 0.02],
    [0.125, 1.14, -0.02],
    [0.125, 0.86, -0.02],
    [-0.013, 1.14, 0.02],
    [-0.013, 0.86, 0.02],
    [-0.013, 1.14, -0.02],
    [-0.013, 0.86, -0.02],
  ]);
  builder.add({
    id: "t800.thigh.clamps",
    cn: "股骨管卡",
    en: "Femur line clamp",
    asm: "thigh",
    geom: { type: "tube", rOuter: 0.0062, rInner: 0.0053, h: 0.008, segments: 16 },
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
    [0.125, 1.07, 0.02],
    [0.125, 0.93, 0.02],
    [-0.013, 1.07, -0.02],
    [-0.013, 0.93, -0.02],
  ]);

  builder.add({
    id: "t800.thigh.rib",
    cn: "股骨后加强条",
    en: "Femur rear rib",
    asm: "thigh",
    geom: { type: "plate", w: 0.02, h: 0.2, t: 0.006, bevel: 0.002 },
    mat: "chrome",
    layer: 3,
    node: NODES.hip,
    at: [-0.007, 1.0, 0],
    rot: [0, -90, 0],
    hint: "股骨后侧的窄加强条（背面也只留一条，不包壳）",
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
    at: [-0.07, 1.0, 0.066],
    hint: "沿股骨后加强条走的中段线束（外露可见）",
  });

  // ---- 大腿前缘：成束的细铬钢活塞杆（参考图：轮廓起伏来自密集杆+活塞的排列）----
  builder.add({
    id: "t800.thigh.piston_rods",
    cn: "大腿前束活塞杆",
    en: "Femur front piston rod bank",
    asm: "thigh",
    geom: {
      type: "merge",
      parts: [
        { type: "cylinder", r: 0.006, h: 0.24, segments: 12, at: [0, 0, 0] },
        { type: "cylinder", r: 0.008, h: 0.03, segments: 14, at: [0, 0.098, 0] },
        { type: "cylinder", r: 0.0075, h: 0.024, segments: 12, at: [0, -0.108, 0] },
        { type: "sphere", r: 0.007, segments: 12, at: [0, 0.122, 0] },
      ],
    },
    mat: "chrome",
    layer: 2,
    node: NODES.hip,
    at: [0, 1.0, 0],
    inst: 6,
    layout: "t800.thigh.piston_rods",
    instNodes: repeatNode(NODES.hip, 6),
    hint: "大腿前缘 6 根细铬钢活塞杆成束排布：股四头肌的弧度由机构排列形成，不是肉块",
  });
  layouts["t800.thigh.piston_rods"] = instanceLayout(NODES.hip, [
    [0.126, 1.0, -0.042],
    [0.134, 1.0, -0.056],
    [0.124, 1.0, -0.07],
  ]);
  builder.add({
    id: "t800.thigh.hose_bank",
    cn: "大腿波纹软管束",
    en: "Femur hose bank",
    asm: "thigh",
    geom: { type: "cylinder", r: 0.0045, h: 0.12, segments: 10 },
    mat: "rubber",
    layer: 5,
    node: NODES.hip,
    at: [0, 1.0, 0],
    inst: 2,
    layout: "t800.thigh.hose_bank",
    instNodes: repeatNode(NODES.hip, 2),
    hint: "沿骨面走的软管束（参考图：大量波纹软管）",
  });
  layouts["t800.thigh.hose_bank"] = instanceLayout(NODES.hip, [
    [0.09, 0.84, -0.047],
    [0.01, 0.84, -0.047],
  ]);

  // ---- 膝部两根驱动缸（缸体挂大腿，活塞杆挂小腿）----
  for (const spec of T800_HYDRAULICS.filter((item) => item.parent === "hip")) {
    addCylinder(builder, spec, { asm: "thigh", prefix: "cyl", label: spec.name_cn });
  }
}
