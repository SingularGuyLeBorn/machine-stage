import type { NodeDef } from "../../registry/types";
import { KJ } from "./constants";
import { hydraulicNodeName } from "./rig";
import { HYDRAULICS, NOZZLE_LOCAL, restDirection, rotationFromY, sideSign, type Side } from "./rig";

// ============================================================================
// models/kingjoe/nodes —— 可动节点骨架
//
// 四体舱段是 root 下的四个平移节点；关节节点按真实层级嵌套
// （hip → knee → ankle、arm → forearm → hand → finger），
// 液压杆节点是 root 下的「求解节点」：缸筒挂在上级、耳环挂在关节，
// 每帧由 motion 按缸筒出口与耳环实际距离重新定位。
// ============================================================================

const modules: NodeDef[] = [
  { name: "legs", parent: "root", motion: "translate", note: "King Legs 腿部飞船" },
  {
    name: "stomach",
    parent: "root",
    pivot: [0, KJ.STOMACH_Y, 0],
    motion: "translate",
    note: "King Stomach 腹部飞船",
  },
  {
    name: "chest",
    parent: "root",
    pivot: [0, KJ.CHEST_Y, 0],
    motion: "translate",
    note: "King Chest 胸部飞船",
  },
  { name: "ship", parent: "root", pivot: [0, KJ.SHIP_Y, 0], motion: "translate", note: "King Ship 头部飞船" },
];

const waist: NodeDef = {
  name: "waist",
  parent: "stomach",
  pivot: [0, 0.49, 0],
  motion: "rotate",
  axis: "y",
  note: "腰部转轴：上腹/胸/头绕腰鼓旋转，腿↔腹接口不动",
};

const locks: NodeDef[] = [
  { name: "stomachLock", parent: "stomach", pivot: [0, -0.06, 0], motion: "rotate", axis: "y" },
  { name: "chestLock", parent: "chest", pivot: [0, -0.06, 0], motion: "rotate", axis: "y" },
  { name: "shipLock", parent: "ship", pivot: [0, -0.06, 0], motion: "rotate", axis: "y" },
  {
    name: "shoulderLockL",
    parent: "chest",
    pivot: [-KJ.SHOULDER_X, KJ.SHOULDER_Y, 0],
    motion: "rotate",
    axis: "x",
  },
  {
    name: "shoulderLockR",
    parent: "chest",
    pivot: [KJ.SHOULDER_X, KJ.SHOULDER_Y, 0],
    motion: "rotate",
    axis: "x",
  },
];

const nozzles: NodeDef[] = (["ship", "chest", "stomach", "legs"] as const).flatMap((module) =>
  NOZZLE_LOCAL[module].map((position, index) => ({
    name: `${module}Nozzle${index}`,
    parent: module === "stomach" ? "waist" : module,
    pivot: module === "stomach" ? [position[0], position[1] - 0.49, position[2]] : position,
    motion: "rotate" as const,
    note: `${module} 第 ${index + 1} 喷口方向节`,
  })),
);

function legNodes(side: Side): NodeDef[] {
  const s = sideSign(side);
  return [
    { name: `hip_${side}`, parent: "legs", pivot: [KJ.LEG_X * s, KJ.HIP_Y, 0], motion: "rotate", axis: "x" },
    {
      name: `knee_${side}`,
      parent: `hip_${side}`,
      pivot: [0, KJ.KNEE_Y - KJ.HIP_Y, 0],
      motion: "rotate",
      axis: "x",
    },
    {
      name: `ankle_${side}`,
      parent: `knee_${side}`,
      pivot: [0, KJ.ANKLE_Y - KJ.KNEE_Y, 0],
      motion: "rotate",
      axis: "x",
    },
  ];
}

function armNodes(side: Side): NodeDef[] {
  const s = sideSign(side);
  const out: NodeDef[] = [
    {
      name: `arm_${side}`,
      parent: "chest",
      pivot: [KJ.SHOULDER_X * s, KJ.SHOULDER_Y, 0],
      motion: "rotate",
      axis: "x",
    },
    {
      name: `forearm_${side}`,
      parent: `arm_${side}`,
      pivot: [0, -KJ.UPPER_ARM_L, 0],
      motion: "rotate",
      axis: "x",
    },
    {
      name: `hand_${side}`,
      parent: `forearm_${side}`,
      pivot: [0, -KJ.FOREARM_L, 0],
      motion: "rotate",
      axis: "x",
    },
  ];
  for (let finger = 0; finger < 3; finger++) {
    const x = (finger - 1) * 0.13;
    out.push({
      name: `finger_${side}_${finger}`,
      parent: `hand_${side}`,
      pivot: [x, -0.43, 0.06],
      motion: "rotate",
      axis: "x",
    });
  }
  return out;
}

const rods: NodeDef[] = HYDRAULICS.map((spec) => ({
  name: hydraulicNodeName(spec.id, spec.side),
  parent: "root",
  pivot: spec.exit,
  rest_rotation: rotationFromY(restDirection(spec)),
  motion: "translate",
  note: `${spec.joint} 活塞杆`,
}));

export const KINGJOE_NODES: NodeDef[] = [
  ...modules,
  waist,
  ...locks,
  ...nozzles,
  ...legNodes("l"),
  ...legNodes("r"),
  ...armNodes("l"),
  ...armNodes("r"),
  ...rods,
];
