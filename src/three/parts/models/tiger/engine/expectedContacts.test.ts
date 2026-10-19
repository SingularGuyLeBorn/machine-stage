import { describe, expect, it } from "vitest";
import { buildModel, detectStatic, partitionExpectedContacts } from "@/three/parts";
import { findModel } from "@/app/catalog";

// ============================================================================
// L1 验收口径：未豁免报告 = 0（不是总报告 = 0）
//
// · 全模型静态检测的每一条都必须命中登记过的构造性接触（轴承配合/压装/剖分/插接）；
// · 往未登记的零件对里注入 5mm 真重叠 → 恰好只多报那一条，其余仍被豁免。
// 这两条一起构成「白名单不过度豁免」的守门：真缺陷会被报出来，正确装配不被改坏。
// ============================================================================

const model = findModel("tiger");
const rules = model.registry!.expectedContacts ?? [];

const build = (registry = model.registry!) =>
  buildModel(registry, {
    builders: model.builders,
    instanceLayouts: model.layouts,
    warnMissingLayout: false,
  });

describe("tiger/engine 白名单验收", () => {
  it("全模型静态报告全部命中已登记豁免族（未豁免 = 0）", () => {
    const built = build();
    const reports = detectStatic(built);
    const split = partitionExpectedContacts(reports, rules);
    // 失败时把未豁免的零件对打出来，方便直接定位真缺陷。
    expect(
      split.active.map((item) => `${item.report.a} ↔ ${item.report.b} @${item.report.depth_mm}mm`),
    ).toEqual([]);
    expect(split.expected.length).toBeGreaterThan(100);
    built.dispose();
  }, 180_000);

  it("注入 5mm 真重叠（油尺推进曲轴箱壁）→ 只报那一条", () => {
    const registry = model.registry!;
    const patched = {
      ...registry,
      parts: registry.parts.map((part) =>
        part.id === "tiger.crankcase.dipstick"
          ? {
              ...part,
              // 油尺中心线从壁外 10mm 推到壁外 4mm：管面吃进壁面 5mm。
              mate: {
                type: "absolute" as const,
                position: ["DIPSTICK_X", "DIPSTICK_Y", "-(CASE_HALF_W+0.004)"] as [string, string, string],
              },
            }
          : part,
      ),
    };
    const built = build(patched);
    const split = partitionExpectedContacts(detectStatic(built), rules);
    expect(split.active).toHaveLength(1);
    const refs = [split.active[0].report.a, split.active[0].report.b].sort();
    expect(refs).toEqual(["tiger.crankcase.dipstick", "tiger.crankcase.shell"]);
    expect(split.active[0].report.depth_mm).toBeGreaterThan(4);
    built.dispose();
  }, 180_000);
});
