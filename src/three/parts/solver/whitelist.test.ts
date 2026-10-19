import { describe, expect, it } from "vitest";
import type { ClippingReport, ExpectedContactRule } from "@/three/parts";
import {
  DEFAULT_MAX_DEPTH_MM,
  expectedContactFamilies,
  matchExpectedContact,
  matchesPartId,
  partitionExpectedContacts,
} from "./whitelist";

// ============================================================================
// 报告分层：构造性接触豁免（未豁免 = 0 是终点，总报告 = 0 不是）
// ============================================================================

const report = (a: string, b: string, depth_mm = 0.5): ClippingReport => ({
  type: "clipping",
  phase: "static",
  a,
  b,
  depth_mm,
  point: [0, 0, 0],
  frame: null,
  severity: "error",
  hint: "",
});

const rules: ExpectedContactRule[] = [
  { family: "rod-split", a: "x.piston_rod.rod", b: "x.piston_rod.cap", reason: "剖分面贴合" },
  { family: "cams", a: "x.valvetrain.camshaft_*", b: "x.cylinder.block", reason: "轴在孔里" },
  { family: "wide", a: "x.wide.a", b: "x.wide.b", reason: "允许深配合", maxDepthMm: 8 },
];

describe("solver/whitelist 零件模式", () => {
  it("精确 id 匹配，实例下标忽略", () => {
    expect(matchesPartId("x.rod", "x.rod")).toBe(true);
    expect(matchesPartId("x.rod", "x.rod[7]")).toBe(true);
    expect(matchesPartId("x.rod", "x.rod_cap")).toBe(false);
  });

  it("`*` 结尾 = 前缀匹配", () => {
    expect(matchesPartId("x.camshaft_*", "x.camshaft_l")).toBe(true);
    expect(matchesPartId("x.camshaft_*", "x.camshaft_r[2]")).toBe(true);
    expect(matchesPartId("x.camshaft_*", "x.camshaft")).toBe(false);
  });
});

describe("solver/whitelist 命中与分层", () => {
  it("A/B 顺序无关", () => {
    expect(matchExpectedContact(report("x.piston_rod.rod[1]", "x.piston_rod.cap[1]"), rules)).not.toBeNull();
    expect(matchExpectedContact(report("x.piston_rod.cap", "x.piston_rod.rod"), rules)).not.toBeNull();
  });

  it("通配规则命中左右件", () => {
    expect(matchExpectedContact(report("x.cylinder.block", "x.valvetrain.camshaft_l"), rules)?.family).toBe(
      "cams",
    );
    expect(
      matchExpectedContact(report("x.valvetrain.camshaft_r", "x.cylinder.block[0]"), rules)?.family,
    ).toBe("cams");
  });

  it("未登记的零件对 = 未豁免（真缺陷候选）", () => {
    expect(matchExpectedContact(report("x.rod", "x.flywheel"), rules)).toBeNull();
  });

  it("深度守门：豁免族里超过贴面量级的深度照报", () => {
    expect(
      matchExpectedContact(report("x.piston_rod.rod", "x.piston_rod.cap", DEFAULT_MAX_DEPTH_MM), rules),
    ).not.toBeNull();
    expect(matchExpectedContact(report("x.piston_rod.rod", "x.piston_rod.cap", 5), rules)).toBeNull();
    // 逐条规则可以放宽（如过盈压装本身就有几毫米咬合）
    expect(matchExpectedContact(report("x.wide.a", "x.wide.b", 5), rules)?.family).toBe("wide");
    expect(matchExpectedContact(report("x.wide.a", "x.wide.b", 9), rules)).toBeNull();
  });

  it("分层保留原始下标，且总数守恒", () => {
    const reports = [
      report("x.rod", "x.piston_rod.cap", 3), // 真缺陷（深度超守门）
      report("x.piston_rod.rod", "x.piston_rod.cap"),
      report("x.cylinder.block", "x.valvetrain.camshaft_l"),
      report("x.rod", "x.flywheel"),
    ];
    const split = partitionExpectedContacts(reports, rules);
    expect(split.active.map((item) => item.index)).toEqual([0, 3]);
    expect(split.expected.map((item) => item.index)).toEqual([1, 2]);
    expect(split.active[0].report.depth_mm).toBe(3);
    expect(split.expected[0].rule.family).toBe("rod-split");
    expect(split.active.length + split.expected.length).toBe(reports.length);
  });

  it("空规则 = 全部未豁免（缺省不豁免任何报告）", () => {
    const split = partitionExpectedContacts([report("x.a", "x.b")], []);
    expect(split.active).toHaveLength(1);
    expect(split.expected).toHaveLength(0);
  });

  it("已豁免按豁免族聚合，reason 随族给出", () => {
    const hits = partitionExpectedContacts(
      [
        report("x.cylinder.block", "x.valvetrain.camshaft_l"),
        report("x.cylinder.block", "x.valvetrain.camshaft_r"),
        report("x.piston_rod.rod", "x.piston_rod.cap"),
      ],
      rules,
    ).expected;
    const families = expectedContactFamilies(hits);
    expect(families.map((item) => item.family)).toEqual(["cams", "rod-split"]);
    expect(families[0].items).toHaveLength(2);
    expect(families[0].reason).toContain("轴在孔里");
  });
});
