import * as THREE from "three";
import type { InstanceLayout } from "../../assembler/assembler";
import type { ModelRegistry } from "../../registry/types";
import { KINGJOE_SKIN_MATERIALS } from "../kingjoe-skin/materials";
import threeData from "./three.generated.json";
import { JOINT_RADIUS, KINGJOE_THREE_CONSTANTS } from "./constants";

// ============================================================================
// models/kingjoe-three/registry —— 三体拆分
//
// 下半身 = 腿部+髋部（legs + pelvis，含骨盆中柱/髋鼓）
// 躯干   = 腹部+胸部（abdomen + chest 非手部件，含肩臂/锁骨/肘腕护甲）
// 头手   = 脑袋+两只手（ship.head + chest.hand/finger）
//
// 接缝全部沿用源网格的自然边界：腰缝（骨盆/腹甲）、颈根（头/肩荚）、
// 双腕（手/腕护甲）。腰缝保留 4 组楔榫/榫槽；头手组沿 +Z 先脱离肩颈/手腕，
// 再沿 +Y 提起。没有平面切割、没有新增外凸块。
// 奥特曼 IP：个人参考，不做商用。
// ============================================================================

interface BodyPart {
  materials: string[];
  groups: Array<{ start: number; count: number; material: string }>;
  bbox: number[];
  tris: number;
}

interface ThreeData {
  meta: {
    source_handles: number;
    source_triangles: number;
    lower: BodyPart;
    torso: BodyPart;
    headhands: BodyPart;
  };
}

const DATA = threeData as unknown as ThreeData;

export function makeKingJoeThreeLayouts(): Record<string, InstanceLayout> {
  const ring: InstanceLayout = ({ index, count }) => {
    const angle = (index / Math.max(count, 1)) * Math.PI * 2 + THREE.MathUtils.degToRad(45);
    const radius = JOINT_RADIUS;
    return new THREE.Matrix4()
      .makeTranslation(Math.sin(angle) * radius, 0, Math.cos(angle) * radius)
      .multiply(new THREE.Matrix4().makeRotationY(angle));
  };
  return { kjWaistJointRing: ring };
}

export function makeKingJoeThreeRegistry(): ModelRegistry {
  return {
    model: "kingjoethree",
    title: "金古桥 King Joe · 三体拆分",
    subtitle: "腿部+髋部 ↔ 腹部+胸部 ↔ 脑袋+双手 · 腰缝楔榫 · 三体分离/合体电弧",
    source_notes: [
      "三组：下半身=腿部+髋部（legs 总成 + pelvis）；躯干=腹部+胸部（abdomen + chest 非手部件，含肩臂/锁骨/肘腕护甲）；头手=脑袋+两只手（ship.head + chest.hand/finger）。",
      "接缝沿用源网格自然边界：腰缝（骨盆/腹甲，约 3.99–4.22m）、颈根（头/肩荚）、双腕（手/腕护甲）；不切三角形、不焊接、不布尔、不体素重拓扑。",
      "腰缝保留 4 组楔榫/榫槽（下半身腰顶，藏在腹甲腔）；躯干先提起 0.6m 退出。头手组因为手在腕部，先沿 +Z 脱离肩颈/手腕，再沿 +Y 提起 1.6m。",
      "光影：腰缝、颈根、双腕三处电弧；分离时拉断，合体末段重新接通并锁死闪光。FX 不参与零件树/穿模/悬空检测。",
      "本卡是三体分组验证；四体编队/飞散/怪光线在主卡「金古桥 King Joe」，髋缝两体版本在「髋缝两体拆分」卡。",
      "版权：奥特曼 IP；本工程仅个人参考，不做商用。",
    ].join("\n"),
    constants: KINGJOE_THREE_CONSTANTS,
    assemblies: [
      { id: "lower", name_cn: "下半身（腿部+髋部）", name_en: "legs + hips", explode: [0, -0.5, 0] },
      { id: "torso", name_cn: "躯干（腹部+胸部）", name_en: "abdomen + chest", explode: [0, 0.7, 0] },
      { id: "headhands", name_cn: "头手（脑袋+双手）", name_en: "head + hands", explode: [0, 1.4, 0.4] },
    ],
    nodes: [
      { name: "lower", parent: "root", pivot: [0, 0, 0], motion: "translate", note: "腿+髋，站在地面不动" },
      { name: "torso", parent: "root", pivot: [0, 0, 0], motion: "translate", note: "分离时沿 +Y 提起" },
      { name: "headhands", parent: "root", pivot: [0, 0, 0], motion: "translate", note: "分离时先 +Z 再 +Y，离开肩颈/手腕" },
    ],
    materials: KINGJOE_SKIN_MATERIALS,
    parts: [
      {
        id: "kingjoethree.lower.body",
        name_cn: "下半身皮肤（腿部+髋部）",
        name_en: "lower body skin (legs + hips)",
        assembly: "lower",
        build_layer: 3,
        build_order: 100,
        geometry: { type: "kit", kit: "kjThreeLower" },
        material: DATA.meta.lower.materials[0]!,
        materialGroups: DATA.meta.lower.materials,
        node: "lower",
        mate: { type: "absolute", position: [0, 0, 0] },
        tags: ["skin"],
        source: `真实网格腿+骨盆：${DATA.meta.lower.tris} 三角 / ${DATA.meta.lower.materials.length} 材质组`,
      },
      {
        id: "kingjoethree.torso.body",
        name_cn: "躯干皮肤（腹部+胸部）",
        name_en: "torso skin (abdomen + chest)",
        assembly: "torso",
        build_layer: 3,
        build_order: 101,
        geometry: { type: "kit", kit: "kjThreeTorso" },
        material: DATA.meta.torso.materials[0]!,
        materialGroups: DATA.meta.torso.materials,
        node: "torso",
        mate: { type: "absolute", position: [0, 0, 0] },
        tags: ["skin"],
        source: `真实网格腹+胸+肩臂：${DATA.meta.torso.tris} 三角 / ${DATA.meta.torso.materials.length} 材质组`,
      },
      {
        id: "kingjoethree.headhands.body",
        name_cn: "头手皮肤（脑袋+双手）",
        name_en: "head + hands skin",
        assembly: "headhands",
        build_layer: 3,
        build_order: 102,
        geometry: { type: "kit", kit: "kjThreeHeadHands" },
        material: DATA.meta.headhands.materials[0]!,
        materialGroups: DATA.meta.headhands.materials,
        node: "headhands",
        mate: { type: "absolute", position: [0, 0, 0] },
        tags: ["skin"],
        source: `真实网格头+双手：${DATA.meta.headhands.tris} 三角 / ${DATA.meta.headhands.materials.length} 材质组`,
      },
      {
        id: "kingjoethree.lower.waist_seat",
        name_cn: "腰缝榫座",
        name_en: "waist tenon seat",
        assembly: "lower",
        build_layer: 4,
        build_order: 110,
        geometry: { type: "cylinder", r: 0.55, h: 0.05, segments: 48 },
        material: "kjr_silver_dark",
        node: "lower",
        mate: { type: "absolute", position: [0, "WAIST_SEAT_Y", 0] },
        tags: ["joint"],
        source: "落在骨盆柱顶的榫座，合体藏在腹甲内",
      },
      {
        id: "kingjoethree.lower.waist_tenon",
        name_cn: "腰缝楔榫 ×4",
        name_en: "waist wedge tenons (x4)",
        assembly: "lower",
        build_layer: 4,
        build_order: 111,
        geometry: { type: "kit", kit: "kjWaistTenon" },
        material: "kjr_gold",
        node: "lower",
        mate: { type: "absolute", position: [0, "JOINT_TENON_BASE", 0] },
        instances: 4,
        indexed: true,
        instance_layout: "kjWaistJointRing",
        tags: ["joint"],
        source: "楔形榫（底 0.20 / 顶 0.14 / 高 0.24m），宽端在下；躯干提起时从槽底退出",
      },
      {
        id: "kingjoethree.torso.waist_socket",
        name_cn: "腰缝榫槽 ×4",
        name_en: "waist mortise sockets (x4)",
        assembly: "torso",
        build_layer: 4,
        build_order: 112,
        geometry: { type: "kit", kit: "kjWaistSocket" },
        material: "kjr_dark",
        node: "torso",
        mate: { type: "absolute", position: [0, "JOINT_SOCKET_BASE", 0] },
        instances: 4,
        indexed: true,
        instance_layout: "kjWaistJointRing",
        tags: ["joint"],
        source: "槽口朝下的倒锥榫槽（侧隙 5mm），嵌在腹甲腔内；分离时随躯干升起",
      },
    ],
    expectedContacts: [
      // 骨盆中柱/髋鼓与腹甲是源网格自带髋部互锁；中间还有腰缝楔榫座。
      {
        family: "kingjoethree-natural-waist",
        a: "kingjoethree.lower.body",
        b: "kingjoethree.torso.body",
        reason: "骨盆中柱伸入腹甲腔（源网格自带中央定位榫，躯干提起时退出）",
        maxDepthMm: 40,
        anyForm: true,
      },
      // 榫座/楔榫合体时藏在腹甲腔内；源腹甲是层叠壳。
      {
        family: "kingjoethree-hidden-joint",
        a: "kingjoethree.lower.waist_seat",
        b: "kingjoethree.torso.body",
        reason: "榫座合体时藏于腹甲腔内，分离时露出",
        maxDepthMm: 240,
        anyForm: true,
      },
      {
        family: "kingjoethree-hidden-joint",
        a: "kingjoethree.lower.waist_tenon",
        b: "kingjoethree.torso.body",
        reason: "楔榫合体时藏在腹甲腔/榫槽内，分离时从槽底退出",
        maxDepthMm: 280,
        anyForm: true,
      },
      {
        family: "kingjoethree-hidden-joint",
        a: "kingjoethree.torso.waist_socket",
        b: "kingjoethree.torso.body",
        reason: "榫槽嵌在腹甲内壁（合体隐藏，x-ray 可见）",
        maxDepthMm: 280,
        anyForm: true,
      },
      // 头/手与躯干在颈根、双腕处是源关节点：合体时壳层互嵌。
      {
        family: "kingjoethree-natural-head-wrist",
        a: "kingjoethree.headhands.body",
        b: "kingjoethree.torso.body",
        reason: "颈根/双腕源关节壳互嵌（合体时头与手分别坐在肩荚/腕护甲上）",
        maxDepthMm: 800,
        anyForm: true,
      },
    ],
  };
}
