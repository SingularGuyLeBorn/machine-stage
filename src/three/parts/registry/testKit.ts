import * as THREE from "three";
import type { InstanceLayout } from "../assembler/assembler";
import type { ModelRegistry } from "./types";

// ============================================================================
// registry/testKit —— M-A 框架底座自检台
//
// 总体设计第 8 节验收：能加载一张只有 3 个零件的测试表并输出实例级报告
// `test.box[0] ↔ test.box[1]`（两个实例故意重叠 1mm）。
// 本表同时用于单元测试与 UI 演示，参数可调（gap）以覆盖重叠 / 接触 / 分离。
// ============================================================================

export interface TestKitOptions {
  /** 实例间名义间隙（米）：0.001 = 重叠 1mm；0 = 恰好接触；负数 = 分离。 */
  gap?: number;
}

export const TEST_KIT_LAYOUT = "testKit.instanceRow";

/** 沿 X 排列的实例行：i 号实例位于 i*(BOX - gap)。 */
export const testKitLayouts: Record<string, InstanceLayout> = {
  [TEST_KIT_LAYOUT]: ({ index, constants }) => {
    const step = constants.BOX - constants.GAP;
    return new THREE.Matrix4().makeTranslation(index * step, 0, 0);
  },
};

export function makeTestRegistry(options: TestKitOptions = {}): ModelRegistry {
  const gap = options.gap ?? 0.001;
  return {
    model: "test",
    title: "框架自检台",
    subtitle: "M-A 验收测试表",
    source_notes: "仅用于框架验收：3 个零件，覆盖重叠 / 接触 / 分离与实例级报告。",
    constants: {
      BOX: 1,
      GAP: gap,
      PILLAR_Y: "BOX+0.5",
      PILLAR_R: 0.12,
      PILLAR_H: 0.5,
      FIN_W: 0.4,
      FIN_H: 0.3,
      FIN_T: 0.02,
    },
    assemblies: [{ id: "frame", name_cn: "测试总成", name_en: "test frame", explode: [0, 1, 0] }],
    nodes: [
      {
        // 转子轴线 = 立柱顶面中心（PILLAR_Y+PILLAR_H/2），翼片坐在立柱顶上同轴旋转
        name: "TestRotor",
        parent: "root",
        pivot: [2.5, "PILLAR_Y+PILLAR_H/2", 0],
        motion: "rotate",
        axis: "y",
      },
    ],
    materials: {
      probe: { base: "#c8ccd0", metalness: 0.5, roughness: 0.5, preset: "none" },
      probe_dark: { base: "#7a8087", metalness: 0.2, roughness: 0.7, preset: "none" },
    },
    parts: [
      {
        id: "test.frame.box",
        name_cn: "基准盒",
        name_en: "base box",
        assembly: "frame",
        build_layer: 1,
        build_order: 101,
        geometry: { type: "box", w: "BOX", h: "BOX", d: "BOX", bevel: 0.01 },
        material: "probe",
        instances: 2,
        indexed: true,
        instance_layout: TEST_KIT_LAYOUT,
        mate: { type: "absolute", position: [0, "BOX/2", 0] },
        hint: "两个基准盒实例重叠：检查 GAP 常量（名义应为负的装配间隙）",
      },
      {
        id: "test.frame.pillar",
        name_cn: "立柱",
        name_en: "pillar",
        assembly: "frame",
        build_layer: 2,
        build_order: 201,
        geometry: { type: "cylinder", r: "PILLAR_R", h: "PILLAR_H", bevel: 0.01 },
        material: "probe_dark",
        mate: { type: "absolute", position: [2.5, "PILLAR_Y", 0] },
        source: "自检台占位尺寸",
      },
      {
        id: "test.frame.fin",
        name_cn: "翼片（可动）",
        name_en: "rotor fin",
        assembly: "frame",
        build_layer: 2,
        build_order: 202,
        geometry: { type: "plate", w: "FIN_W", h: "FIN_H", t: "FIN_T" },
        material: "probe",
        node: "TestRotor",
        // 锚点装配：贴在立柱顶面上，改 PILLAR_Y / PILLAR_H 时自动跟随
        mate: { type: "anchor", to: "test.frame.pillar", anchor: "top", offset: [0, "FIN_H/2", 0] },
      },
    ],
  };
}
