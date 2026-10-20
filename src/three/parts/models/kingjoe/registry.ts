import type { InstanceLayout } from "../../assembler/assembler";
import type { GeometryBuilder } from "../../assembler/geometry";
import type { ModelRegistry } from "../../registry/types";
import { KINGJOE_CONSTANTS } from "./constants";
import { KINGJOE_MATERIALS } from "./materials";
import { KINGJOE_NODES } from "./nodes";
import { DOCKS } from "./rig";
import { KingJoeParts, addAxialDock } from "./helpers";
import { addShipParts } from "./ship";
import { addChestParts } from "./chest";
import { addStomachParts } from "./stomach";
import { addLegsParts } from "./legs";
import { KINGJOE_LAYOUTS } from "./layouts";
import { kingjoeBuilders } from "./kits";

// ============================================================================
// models/kingjoe —— 金古桥整机注册表
//
// 四体：King Ship（头）/ King Chest（胸 + 双臂）/ King Stomach（腹）/ King Legs（腿 + 足）。
// 三对轴向对接面 + 双肩锁：锥形导向销 → 圆柱定位销 → 端面贴合 → 锁环咬合 → 传感器。
// 所有零件几何/位置由 constants + rig 派生；重复件（喷口叶片/锁爪/锥销/线圈/瓷片/
// 铆钉圈）走 instances + instance_layout，不手写副本。
// ============================================================================

export function makeKingJoeRegistry(): ModelRegistry {
  const builder = new KingJoeParts();
  addLegsParts(builder);
  addStomachParts(builder);
  addChestParts(builder);
  addShipParts(builder);
  for (const dock of DOCKS) addAxialDock(builder, dock);
  const parts = builder.finalize();

  return {
    model: "kingjoe",
    title: "金古桥 King Joe",
    subtitle: "四体分离合体 · 佩丹尼姆镜面装甲 · 锥销/锁环对接 · 反重力 · 怪光线",
    source_notes: [
      "原作：宇宙ロボット キングジョー（『ウルトラセブン』第14/15話，1968，圆谷）。",
      "公开设定：身高 55m / 体重 48000t / 四体分离合体 / 额头破坏光线 / 佩丹尼姆合金。",
      "展示尺度 1:6.7（合体全高 8.16m）；造型参考 refs/kingjoe-55th.jpg、",
      "refs/kingjoe-official-list.jpg、refs/kingjoe-two-types.jpg（银甲、金环、眼带、",
      "彩色胸口镶嵌、巨型肩荚、鼓形髋荚、三指爪、四喷口飞船形态）。",
      "四体参数差异（装甲厚度/关节行程/喷口位置）由 KJ 常量表给出；",
      "对接机构按 220mm 环座 + 160mm 销入 56mm 承座孔 + 锁环 30° 咬合设计。",
    ].join("\n"),
    constants: {
      ...KINGJOE_CONSTANTS,
      // 装配回放/查询用的派生数字
      SHIP_TOP: KINGJOE_CONSTANTS.SHIP_Y + KINGJOE_CONSTANTS.SHIP_H,
      ROBOT_HEIGHT: KINGJOE_CONSTANTS.SHIP_Y + KINGJOE_CONSTANTS.SHIP_H,
    },
    assemblies: [
      { id: "ship", name_cn: "King Ship 头部飞船", name_en: "King Ship", explode: [0, 3.2, 0] },
      { id: "chest", name_cn: "King Chest 胸部飞船 + 双臂", name_en: "King Chest", explode: [0, 1.8, 0] },
      { id: "stomach", name_cn: "King Stomach 腹部飞船", name_en: "King Stomach", explode: [0, 0.8, 0] },
      { id: "legs", name_cn: "King Legs 腿部飞船", name_en: "King Legs", explode: [0, -1.4, 0] },
    ],
    nodes: KINGJOE_NODES,
    materials: KINGJOE_MATERIALS,
    parts,
  };
}

export function makeKingJoeLayouts(): Record<string, InstanceLayout> {
  return KINGJOE_LAYOUTS;
}

export const kingjoeModelBuilders: Record<string, GeometryBuilder> = kingjoeBuilders;
