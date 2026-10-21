import * as THREE from "three";
import type { InstanceLayout } from "../../assembler/assembler";
import type { ModelRegistry } from "../../registry/types";
import { KINGJOE_SKIN_MATERIALS } from "../kingjoe-skin/materials";
import lower from "./lower.generated.json";
import { JOINT_RADIUS, KINGJOE_LOWER_CONSTANTS } from "./constants";

// ============================================================================
// models/kingjoe-lower/registry —— 髋缝两体拆分（King Legs ↔ 上身）
//
// 参考分体玩具：下半身是 King Legs 腿体飞船（腿+髋鼓），上半身从骨盆起。
// 分界不是平面切的：髋鼓围住骨盆中柱，中柱本身就是源结构的中央定位榫。
// 髋缝另加 4 组楔榫（下半身髋座）与 4 组榫槽（上半身骨盆内壁）；
// 合体时藏在髋腔/骨盆壳内，分离时上半身沿 +Y 提起，榫头从槽底退出。
// 上半身含骨盆，所以提起 1.3m 后中柱才完全离开髋腔。
// 奥特曼 IP：个人参考，不做商用。
// ============================================================================

interface BodyPart {
  materials: string[];
  groups: Array<{ start: number; count: number; material: string }>;
  bbox: number[];
  tris: number;
}

interface LowerData {
  meta: {
    source_handles: number;
    source_triangles: number;
    lower: BodyPart;
    upper: BodyPart;
  };
}

const DATA = lower as unknown as LowerData;

/** 4 组榫头/榫槽沿髋缝 45° 对角分布；切向为榫宽、径向为榫厚。 */
export function makeKingJoeLowerLayouts(): Record<string, InstanceLayout> {
  const ring: InstanceLayout = ({ index, count }) => {
    const angle = (index / Math.max(count, 1)) * Math.PI * 2 + THREE.MathUtils.degToRad(45);
    const radius = JOINT_RADIUS;
    return new THREE.Matrix4()
      .makeTranslation(Math.sin(angle) * radius, 0, Math.cos(angle) * radius)
      .multiply(new THREE.Matrix4().makeRotationY(angle));
  };
  return { kjHipJointRing: ring };
}

export function makeKingJoeLowerRegistry(): ModelRegistry {
  return {
    model: "kingjoelower",
    title: "金古桥 King Joe · 髋缝两体拆分",
    subtitle: "King Legs 腿体 ↔ 骨盆以上 · 4 组隐藏楔榫 · 分离/合体电弧 · 非平面自然接缝",
    source_notes: [
      "参考分体玩具：King Legs 腿体飞船是下半身（腿+髋鼓），上半身从骨盆开始；髋鼓整体留在下半身。",
      "拆分依据：源网格的腿体总成与骨盆分界（腿体最高约 3.60m，骨盆中柱最低约 2.57m）；骨盆中柱伸进髋腔，是源结构自带的中央定位榫。",
      "髋缝硬件：下半身中央榫口承座 + 4 组楔榫，上半身 4 组榫槽；合体时藏在上半身骨盆壳/髋腔内，分离时上半身沿 +Y 提起 1.3m 退出。",
      "没有平面切口、没有新增外凸块；两组皮肤内部保留原三角形/UV/材质分组，不焊接、不布尔、不体素重拓扑。",
      "动作：分离时上身提离并拉断电弧；合体时上身下降，最后一段重新接通电弧并锁死闪光；两体全程零未豁免穿模。",
      "四体编队/分离/怪光线在主卡「金古桥 King Joe」；本卡只演示 King Legs ↔ 上半身这一道髋缝。",
      "版权：奥特曼 IP；本工程仅个人参考，不做商用。",
    ].join("\n"),
    constants: KINGJOE_LOWER_CONSTANTS,
    assemblies: [
      { id: "lower", name_cn: "下半身（King Legs 腿体）", name_en: "lower body (King Legs)", explode: [0, -0.6, 0] },
      { id: "upper", name_cn: "上半身（骨盆以上）", name_en: "upper body (pelvis and up)", explode: [0, 1.0, 0] },
    ],
    nodes: [
      { name: "lower", parent: "root", pivot: [0, 0, 0], motion: "translate", note: "腿体飞船，站在地面不动" },
      { name: "upper", parent: "root", pivot: [0, 0, 0], motion: "translate", note: "分离时沿 +Y 提起" },
    ],
    materials: KINGJOE_SKIN_MATERIALS,
    parts: [
      {
        id: "kingjoelower.lower.body",
        name_cn: "下半身皮肤（King Legs 腿体）",
        name_en: "lower body skin (King Legs)",
        assembly: "lower",
        build_layer: 3,
        build_order: 100,
        geometry: { type: "kit", kit: "kjLowerBody" },
        material: DATA.meta.lower.materials[0]!,
        materialGroups: DATA.meta.lower.materials,
        node: "lower",
        mate: { type: "absolute", position: [0, 0, 0] },
        tags: ["skin"],
        source: `真实网格腿体总成：${DATA.meta.lower.tris} 三角 / ${DATA.meta.lower.materials.length} 材质组（腿+髋鼓）`,
      },
      {
        id: "kingjoelower.upper.body",
        name_cn: "上半身皮肤（骨盆以上）",
        name_en: "upper body skin (pelvis and up)",
        assembly: "upper",
        build_layer: 3,
        build_order: 101,
        geometry: { type: "kit", kit: "kjUpperBody" },
        material: DATA.meta.upper.materials[0]!,
        materialGroups: DATA.meta.upper.materials,
        node: "upper",
        mate: { type: "absolute", position: [0, 0, 0] },
        tags: ["skin"],
        source: `真实网格骨盆以上：${DATA.meta.upper.tris} 三角 / ${DATA.meta.upper.materials.length} 材质组（含骨盆中柱）`,
      },
      {
        id: "kingjoelower.lower.hip_seat",
        name_cn: "髋缝承座（中央榫口）",
        name_en: "hip socket seat (central mortise port)",
        assembly: "lower",
        build_layer: 4,
        build_order: 110,
        geometry: { type: "tube", rOuter: "JOINT_SEAT_R_OUTER", rInner: "JOINT_SEAT_R_INNER", h: 0.06, segments: 48 },
        material: "kjr_dark",
        node: "lower",
        mate: { type: "absolute", position: [0, "JOINT_COLLAR_Y", 0] },
        tags: ["joint"],
        source: "髋腔口的环形承座：中央榫口让骨盆中柱穿过；合体藏在骨盆壳内，分离后是髋部插口",
      },
      {
        id: "kingjoelower.lower.hip_tenon",
        name_cn: "髋缝楔榫 ×4",
        name_en: "hip wedge tenons (x4)",
        assembly: "lower",
        build_layer: 4,
        build_order: 111,
        geometry: { type: "kit", kit: "kjHipTenon" },
        material: "kjr_gold",
        node: "lower",
        mate: { type: "absolute", position: [0, "JOINT_TENON_BASE", 0] },
        instances: 4,
        indexed: true,
        instance_layout: "kjHipJointRing",
        tags: ["joint"],
        source: "楔形榫（底 0.20 / 顶 0.14 / 高 0.24m），宽端在下；上半身提起时从榫槽底部退出",
      },
      {
        id: "kingjoelower.upper.hip_socket",
        name_cn: "髋缝榫槽 ×4",
        name_en: "hip mortise sockets (x4)",
        assembly: "upper",
        build_layer: 4,
        build_order: 112,
        geometry: { type: "kit", kit: "kjHipSocket" },
        material: "kjr_dark",
        node: "upper",
        mate: { type: "absolute", position: [0, "JOINT_SOCKET_BASE", 0] },
        instances: 4,
        indexed: true,
        instance_layout: "kjHipJointRing",
        tags: ["joint"],
        source: "槽口朝下的倒锥榫槽（侧隙 5mm），嵌在骨盆壳内；合体时套住楔榫，分离时随上半身升起",
      },
    ],
    expectedContacts: [
      // 髋鼓围住骨盆中柱是源网格自带的髋部互锁：合体时两片源壳在髋腔里互嵌，
      // 这是拆分沿用的真实接缝，不是新切面；深度上限按髋部源壳实测给。
      {
        family: "kingjoelower-natural-hip",
        a: "kingjoelower.lower.body",
        b: "kingjoelower.upper.body",
        reason: "骨盆中柱/髋鼓是源网格自带髋部互锁，分离时中柱沿髋腔退出",
        maxDepthMm: 800,
        anyForm: true,
      },
      // 承座/楔榫/榫槽合体时藏在髋腔与骨盆壳内；分离过程中沿髋腔滑出。
      // 深度上限按硬件尺寸给，超过即真缺陷照报。
      {
        family: "kingjoelower-hidden-joint",
        a: "kingjoelower.lower.hip_seat",
        b: "kingjoelower.lower.body",
        reason: "承座嵌在髋腔口（合体隐藏，分离后是髋部插口）",
        maxDepthMm: 180,
        anyForm: true,
      },
      {
        family: "kingjoelower-hidden-joint",
        a: "kingjoelower.lower.hip_seat",
        b: "kingjoelower.upper.body",
        reason: "承座合体时藏在骨盆下缘壳体内，中柱穿过中央榫口",
        maxDepthMm: 500,
        anyForm: true,
      },
      {
        family: "kingjoelower-hidden-joint",
        a: "kingjoelower.lower.hip_tenon",
        b: "kingjoelower.upper.body",
        reason: "楔榫合体时藏在骨盆壳/髋腔内，分离时从槽底退出",
        maxDepthMm: 320,
        anyForm: true,
      },
      {
        family: "kingjoelower-hidden-joint",
        a: "kingjoelower.upper.hip_socket",
        b: "kingjoelower.upper.body",
        reason: "榫槽嵌在骨盆内壁（合体隐藏，x-ray 可见）",
        maxDepthMm: 320,
        anyForm: true,
      },
    ],
  };
}
