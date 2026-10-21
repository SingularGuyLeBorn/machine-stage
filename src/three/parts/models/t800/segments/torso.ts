import type { InstanceLayout } from "../../../assembler/assembler";
import { repeatNode, type PartBuilder } from "../build";
import { SPINE_NODES, VERTEBRAE, perNodeLayout } from "./spine";

// ============================================================================
// t800/segments/torso —— 胸廓 + 肩带 + 胸部动力单元
//
// 参考图读法：
//   · 肋骨 12 对，每根是**从脊柱后侧绕到胸骨前侧**的弧形细管，围成开口的笼子；
//   · 胸骨是一块前正中竖板，收住两侧肋弓；
//   · 锁骨是 S 形细管，从胸骨上端绕到肩窝；肩胛骨是背面的扁板；
//   · 胸口正中挂一块可拆的动力单元（燃料电池外壳 + 电芯 + 控制板）。
//
// 坐标：+X 前、+Y 上、+Z 右。
// ============================================================================

/** 肋骨 12 对：自上而下 [高度, 前后半径, 左右半径, 下垂量]。 */
const RIB_PROFILE: Array<[number, number, number, number]> = [
  [1.886, 0.076, 0.063, 0.026],
  [1.863, 0.094, 0.080, 0.030],
  [1.839, 0.108, 0.094, 0.034],
  [1.816, 0.120, 0.106, 0.036],
  [1.792, 0.128, 0.115, 0.036],
  [1.769, 0.134, 0.120, 0.034],
  [1.745, 0.138, 0.123, 0.031],
  [1.722, 0.139, 0.123, 0.028],
  [1.698, 0.137, 0.120, 0.024],
  [1.675, 0.132, 0.114, 0.020],
  [1.651, 0.124, 0.105, 0.016],
  [1.628, 0.113, 0.093, 0.012],
];

/** 肋骨分成 4 组（半径渐变用组区分），每组 3 根。 */
const RIB_GROUPS = 4;

export function buildTorso(builder: PartBuilder, layouts: Record<string, InstanceLayout>): void {
  // ================= 肋骨 12 对（4 组 × 3 根，左右各一套）=====================
  for (const side of [1, -1] as const) {
    const suffix = side > 0 ? "" : "_left";
    for (let g = 0; g < RIB_GROUPS; g++) {
      const from = g * 3;
      const rows = RIB_PROFILE.slice(from, from + 3);
      const avgRz = rows.reduce((s, r) => s + r[2], 0) / rows.length;
      const avgDrop = rows.reduce((s, r) => s + r[3], 0) / rows.length;
      const avgVertR = VERTEBRAE[5 + from][2];
      builder.add({
        id: `t800.torso.ribs${suffix}_${g}`,
        cn: `肋骨组 ${g + 1}${side > 0 ? "（右）" : "（左）"}`,
        en: `Rib set ${g + 1} (${side > 0 ? "right" : "left"})`,
        asm: "torso",
        geom: {
          type: "kit",
          kit: "t800Rib",
          params: {
            rx: 0.09,
            rootX: -(1.05 * avgVertR + 0.022),
            xEnd: 0.13,
            rz: avgRz,
            startDeg: 180,
            endDeg: 0,
            r: 0.0075,
            rEnd: 0.006,
            drop: avgDrop,
          },
          ...(side < 0 ? { mirror: "z" as const } : {}),
        },
        mat: "chrome",
        layer: 2,
        node: SPINE_NODES[5 + from],
        local: true,
        at: [0, 0, 0],
        inst: rows.length,
        layout: `t800.torso.ribs${suffix}_${g}`,
        instNodes: SPINE_NODES.slice(5 + from, 5 + from + rows.length),
        hint: "从脊柱后侧绕到胸骨前侧的弧形肋管；12 对逐根实例化，半径自上而下渐变",
      });
      layouts[`t800.torso.ribs${suffix}_${g}`] = perNodeLayout(
        rows.map(([y], i) => {
          const vert = VERTEBRAE[5 + from + i];
          return [vert[1], y, side < 0 ? 0.02 : 0] as [number, number, number];
        }),
      );
    }
  }

  // ================= 胸骨 =================
  builder.add({
    id: "t800.torso.sternum",
    cn: "胸骨",
    en: "Sternum",
    asm: "torso",
    geom: { type: "box", w: 0.014, h: 0.2, d: 0.048, bevel: 0.004 },
    mat: "chrome",
    layer: 2,
    node: SPINE_NODES[6],
    local: true,
    at: [0.1415, 0, 0],
    hint: "前正中竖板：收住两侧肋弓",
  });

  // ================= 锁骨 =================
  for (const side of [1, -1] as const) {
    builder.add({
      id: `t800.torso.clavicle${side > 0 ? "" : "_left"}`,
      cn: `锁骨（${side > 0 ? "右" : "左"}）`,
      en: `Clavicle (${side > 0 ? "right" : "left"})`,
      asm: "torso",
      geom: {
        type: "kit",
        kit: "t800Clavicle",
        params: { side, xFront: 0.1, xBack: -0.02, z: 0.15, r: 0.0085 },
        ...(side < 0 ? { mirror: "z" as const } : {}),
      },
      mat: "chrome",
      layer: 2,
      node: SPINE_NODES[23],
      local: true,
      at: [0.05, -0.05, 0],
      hint: "S 形细管：从胸骨上端绕到肩窝",
    });
  }

  // ================= 肩胛骨 =================
  for (const side of [1, -1] as const) {
    builder.add({
      id: `t800.torso.scapula${side > 0 ? "" : "_left"}`,
      cn: `肩胛骨（${side > 0 ? "右" : "左"}）`,
      en: `Scapula (${side > 0 ? "right" : "left"})`,
      asm: "torso",
      geom: { type: "plate", w: 0.1, h: 0.13, t: 0.007, bevel: 0.002 },
      mat: "chrome",
      layer: 3,
      node: SPINE_NODES[23],
      local: true,
      at: [-0.06, -0.06, 0.045],
      rot: [0, 18, 0],
      hint: "背面扁板：肩带的结构件",
    });
  }

  // ================= 胸部动力单元（可拆）=====================
  builder.add({
    id: "t800.torso.power_cell",
    cn: "燃料电池外壳",
    en: "Fuel cell housing",
    asm: "torso",
    geom: { type: "box", w: 0.055, h: 0.085, d: 0.05, bevel: 0.005 },
    mat: "dark_chrome",
    layer: 3,
    node: SPINE_NODES[9],
    local: true,
    at: [0.085, -0.015, 0],
    hint: "胸口正中的可拆动力单元（终结者2 可拆出）",
  });
  builder.add({
    id: "t800.torso.cells",
    cn: "电芯（实例族）",
    en: "Cell stack family",
    asm: "torso",
    geom: { type: "cylinder", r: 0.006, h: 0.045, segments: 16, bevel: 0.001 },
    mat: "brass",
    layer: 4,
    node: SPINE_NODES[9],
    local: true,
    at: [0.028, -0.015, 0],
    inst: 6,
    layout: "t800.torso.cells",
    instNodes: repeatNode(SPINE_NODES[9], 6),
    hint: "电芯排：动力单元里一列圆柱电池",
  });
  layouts["t800.torso.cells"] = perNodeLayout(
    Array.from({ length: 6 }, (_, i) => [0, 0, -0.02 + i * 0.014] as [number, number, number]),
  );

  // ================= 胸腔液压管路 =================
  builder.add({
    id: "t800.torso.chest_lines",
    cn: "胸腔管路（实例族）",
    en: "Chest line family",
    asm: "torso",
    geom: { type: "cylinder", r: 0.005, h: 0.12, segments: 12 },
    mat: "dark_chrome",
    layer: 4,
    node: SPINE_NODES[8],
    local: true,
    at: [-0.045, 0, 0],
    inst: 6,
    layout: "t800.torso.chest_lines",
    instNodes: repeatNode(SPINE_NODES[8], 6),
    hint: "胸腔两侧的管路束（从脊柱绕到胸前动力单元）",
  });
  layouts["t800.torso.chest_lines"] = perNodeLayout(
    Array.from({ length: 6 }, (_, i) => [0, 0, -0.05 + i * 0.02] as [number, number, number]),
  );
}

/** 肩窝高度 / 半宽（肩关节球头的安装点）。 */
export const SHOULDER_Y = 1.885;
export const SHOULDER_Z = 0.165;
/** 胸骨前表面 x。 */
export const STERNUM_X = 0.112;
