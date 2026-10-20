import * as THREE from "three";
import type { InstanceLayout } from "../../../assembler/assembler";
import { instanceLayout, repeatNode, type PartBuilder } from "../build";
import { NODE_PIVOT, NODES, STUD, T800_STUDS } from "../spec";

// ============================================================================
// t800/segments/systems —— 液压站（阀块 / 伺服阀 / 蓄能器 / 管路）+ 紧固件族
//
// 伺服阀每关节一只，直接决定「关节角 → 液压缸行程」的闭环。
// 球头螺栓 12 件实例化，跟着各自骨段节点走，是缸体/杆端耳环与骨面之间的唯一连接件。
// ============================================================================


export function buildSystems(builder: PartBuilder, layouts: Record<string, InstanceLayout>): void {
  // ===================== 液压站（装在骨盆顶板上方）=====================
  builder.add({
    id: "t800.hydraulics.block",
    cn: "分配阀块",
    en: "Manifold block",
    asm: "hydraulics",
    geom: { type: "box", w: 0.1, h: 0.05, d: 0.12, bevel: 0.005 },
    mat: "frame",
    layer: 1,
    node: NODES.base,
    at: [0, 1.562, -0.04],
    hint: "三关节伺服阀的共用油路块，坐在骨盆顶板上",
  });
  builder.add({
    id: "t800.hydraulics.servos",
    cn: "伺服阀",
    en: "Servo valve",
    asm: "hydraulics",
    geom: { type: "cylinder", r: 0.012, h: 0.032, segments: 18, bevel: 0.0015 },
    mat: "servo",
    layer: 2,
    node: NODES.base,
    at: [0, 1.562, 0],
    inst: 3,
    layout: "t800.hydraulics.servos",
    instNodes: repeatNode(NODES.base, 3),
    hint: "髋 / 膝 / 踝各一只伺服阀，闭环控制缸的伸缩量",
  });
  layouts["t800.hydraulics.servos"] = instanceLayout(NODES.base, [
    [-0.03, 1.562, 0.032],
    [0, 1.562, 0.032],
    [0.03, 1.562, 0.032],
  ]);
  builder.add({
    id: "t800.hydraulics.accumulator",
    cn: "蓄能器",
    en: "Accumulator",
    asm: "hydraulics",
    geom: { type: "cylinder", r: 0.028, h: 0.12, segments: 24, bevel: 0.004 },
    mat: "dark_chrome",
    layer: 2,
    node: NODES.base,
    at: [-0.02, 1.647, -0.04],
    hint: "吸收屈伸冲击，保证活塞行程平顺（不出现瞬动）；立在阀块顶面",
  });
  builder.add({
    id: "t800.hydraulics.clamps",
    cn: "蓄能器管卡",
    en: "Accumulator clamp",
    asm: "hydraulics",
    geom: { type: "tube", rOuter: 0.031, rInner: 0.0285, h: 0.008, segments: 24 },
    mat: "brass",
    layer: 4,
    node: NODES.base,
    at: [-0.02, 1.67, -0.04],
    inst: 2,
    layout: "t800.hydraulics.clamps",
    instNodes: repeatNode(NODES.base, 2),
  });
  layouts["t800.hydraulics.clamps"] = instanceLayout(NODES.base, [
    [-0.02, 1.682, -0.04],
    [-0.02, 1.612, -0.04],
  ]);
  builder.add({
    id: "t800.hydraulics.gauge",
    cn: "压力表",
    en: "Pressure gauge",
    asm: "hydraulics",
    geom: { type: "cylinder", r: 0.018, h: 0.016, segments: 24, bevel: 0.002 },
    mat: "brass",
    layer: 5,
    node: NODES.base,
    at: [0.03, 1.605, 0],
    rot: [90, 0, 0],
    hint: "读缸压（表盘坐在阀块顶面）",
  });
  builder.add({
    id: "t800.hydraulics.supply",
    cn: "主供油管",
    en: "Supply line",
    asm: "hydraulics",
    geom: { type: "cylinder", r: 0.008, h: 0.06, segments: 16 },
    mat: "brass",
    layer: 3,
    node: NODES.base,
    at: [-0.03, 1.567, -0.111],
    hint: "供油管向下接骨盆轭，再经大腿/小腿硬管到各缸",
  });
  builder.add({
    id: "t800.hydraulics.return",
    cn: "回油管",
    en: "Return line",
    asm: "hydraulics",
    geom: { type: "cylinder", r: 0.008, h: 0.06, segments: 16 },
    mat: "brass",
    layer: 3,
    node: NODES.base,
    at: [0.03, 1.567, -0.111],
  });
  builder.add({
    id: "t800.hydraulics.harness",
    cn: "传感线束",
    en: "Sensor harness",
    asm: "hydraulics",
    geom: { type: "cylinder", r: 0.006, h: 0.3, segments: 12 },
    mat: "rubber",
    layer: 5,
    node: NODES.base,
    at: [0.05, 1.5435, 0.1],
    rot: [0, 0, 90],
    hint: "沿骨盆框板前缘走的信号束（外露可见），接角度传感器与伺服阀",
  });

  builder.add({
    id: "t800.hydraulics.pump",
    cn: "液压泵",
    en: "Hydraulic pump",
    asm: "hydraulics",
    geom: { type: "cylinder", r: 0.026, h: 0.052, segments: 24, bevel: 0.003 },
    mat: "gunmetal",
    layer: 2,
    node: NODES.base,
    at: [0.09, 1.563, 0.04],
    hint: "腿段液压泵（躯干主泵的分支），驱动六根缸",
  });
  builder.add({
    id: "t800.hydraulics.tank",
    cn: "油箱",
    en: "Reservoir tank",
    asm: "hydraulics",
    geom: { type: "cylinder", r: 0.028, h: 0.05, segments: 24, bevel: 0.003 },
    mat: "frame",
    layer: 2,
    node: NODES.base,
    at: [0.02, 1.612, 0.04],
    hint: "腿段油箱，给六根缸供油",
  });
  builder.add({
    id: "t800.hydraulics.pressure_sensor",
    cn: "缸压传感器",
    en: "Cylinder pressure sensor",
    asm: "hydraulics",
    geom: { type: "cylinder", r: 0.009, h: 0.026, segments: 16, bevel: 0.0012 },
    mat: "servo",
    layer: 5,
    node: NODES.base,
    at: [0, 1.5997, 0],
    hint: "监测主缸缸压，配合蓄能器做冲击吸收",
  });
  builder.add({
    id: "t800.hydraulics.filter",
    cn: "回油滤清器",
    en: "Return line filter",
    asm: "hydraulics",
    geom: { type: "cylinder", r: 0.02, h: 0.055, segments: 20, bevel: 0.003 },
    mat: "gunmetal",
    layer: 2,
    node: NODES.base,
    at: [0.145, 1.5642, 0.04],
    hint: "回油路上的滤清器（装在骨盆框板上）",
  });
  builder.add({
    id: "t800.hydraulics.relief",
    cn: "溢流阀",
    en: "Relief valve",
    asm: "hydraulics",
    geom: { type: "cylinder", r: 0.010, h: 0.03, segments: 16, bevel: 0.0012 },
    mat: "brass",
    layer: 2,
    node: NODES.base,
    at: [-0.03, 1.602, 0],
    hint: "系统限压，防止屈伸末端憋压",
  });

  // ===================== 紧固件族 =====================
  builder.add({
    id: "t800.fasteners.stud",
    cn: "球头螺栓",
    en: "Ball stud",
    asm: "fasteners",
    geom: {
      type: "merge",
      parts: [
        { type: "sphere", r: STUD.ballR, segments: 24 },
        {
          type: "cylinder",
          r: STUD.shaftR,
          h: STUD.shaftLen,
          segments: 14,
          at: [0, -STUD.shaftLen / 2, 0],
        },
      ],
    },
    mat: "chrome",
    layer: 3,
    at: [0, 0, 0],
    inst: 12,
    layout: "t800.fasteners.stud",
    instNodes: T800_STUDS.map((stud) => stud.node),
    hint: "12 个球头螺栓：球心在安装面外 28mm，插入凸台盲孔；耳环孔轴与销轴同轴",
  });
  layouts["t800.fasteners.stud"] = ({ index }: { index: number }) => {
    const stud = T800_STUDS[index];
    const pivot = NODE_PIVOT[stud.node] ?? [0, 0, 0];
    const ball = new THREE.Vector3(...stud.ball);
    const normal = new THREE.Vector3(...stud.normal).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
    const position = ball.clone().sub(new THREE.Vector3(...pivot));
    return new THREE.Matrix4().compose(position, q, new THREE.Vector3(1, 1, 1));
  };
  builder.add({
    id: "t800.fasteners.washers",
    cn: "密封垫圈族",
    en: "Seal washer",
    asm: "fasteners",
    geom: { type: "tube", rOuter: 0.0055, rInner: 0.0052, h: 0.002, segments: 14 },
    mat: "rubber",
    layer: 4,
    node: NODES.knee,
    at: [0, 0.38, 0],
    inst: 4,
    layout: "t800.fasteners.washers",
    instNodes: repeatNode(NODES.knee, 4),
    hint: "硬管接头处的密封垫圈（实例族）",
  });
  layouts["t800.fasteners.washers"] = instanceLayout(NODES.knee, [
    [0.02, 0.2515, 0.02],
    [0.02, 0.4915, 0.02],
    [0.02, 0.2515, -0.02],
    [0.02, 0.4915, -0.02],
  ]);
  builder.add({
    id: "t800.hip.tie_rod",
    cn: "骨盆拉杆",
    en: "Pelvis tie rod",
    asm: "hip",
    geom: { type: "cylinder", r: 0.005, h: 0.09, segments: 14 },
    mat: "chrome",
    layer: 2,
    node: NODES.base,
    at: [-0.14, 1.542, 0.06],
    rot: [0, 0, 90],
    hint: "骨盆顶板上的横向拉杆（与躯干接口的抗扭件）",
  });
  builder.add({
    id: "t800.foot.sole_screws",
    cn: "足底螺钉",
    en: "Sole screw",
    asm: "foot",
    geom: { type: "cylinder", r: 0.004, h: 0.002, segments: 12, bevel: 0.0004 },
    mat: "dark_chrome",
    layer: 4,
    node: NODES.ankle,
    at: [0, 0, 0],
    inst: 4,
    layout: "t800.foot.sole_screws",
    instNodes: repeatNode(NODES.ankle, 4),
    hint: "足底板的固定螺钉（实例族）",
  });
  layouts["t800.foot.sole_screws"] = instanceLayout(NODES.ankle, [
    [0.2, 0.0105, 0.03],
    [0.2, 0.0105, -0.03],
    [-0.06, 0.0105, 0.03],
    [-0.06, 0.0105, -0.03],
  ]);
}
