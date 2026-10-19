// 诊断：静态穿模报告构成分析 + 零件对展开口径（唯一保留的门禁脚本，见 scripts/README）
//
// 用法：
//   npx tsx scripts/diag-clips.ts              # 全模型
//   npx tsx scripts/diag-clips.ts 1            # 只统计 buildLayer ≤ 1 的零件对（层验收口径）
//   npx tsx scripts/diag-clips.ts --recheck    # 追加：33 条豁免规则复核 → docs/qa/whitelist-recheck.md
import { writeFileSync } from "node:fs";
import { buildModel } from "../src/three/parts/assembler/assembler";
import { makeTigerLayouts, makeTigerRegistry, tigerBuilders } from "../src/three/parts/models/tiger/registry";
import { detectStatic, planPairs } from "../src/three/parts/solver/detect";
import type { ClippingReport } from "../src/three/parts/solver/report";
import {
  DEFAULT_MAX_DEPTH_MM,
  matchesPartId,
  partitionExpectedContacts,
} from "../src/three/parts/solver/whitelist";

const registry = makeTigerRegistry();
const expectedContacts = registry.expectedContacts ?? [];
const model = buildModel(registry, {
  builders: tigerBuilders,
  instanceLayouts: makeTigerLayouts(),
  warnMissingLayout: false,
});

// 可选参数：只统计 buildLayer ≤ N 的零件对（任务书 §3.4「该层穿模验收」口径）
const layerLimit = Number(process.argv[2] ?? 0);
const filter =
  layerLimit > 0 ? (handle: { buildLayer: number }) => handle.buildLayer <= layerLimit : undefined;

const started = performance.now();
const reports = detectStatic(model, { minDepthM: 0.0005, ...(filter ? { filter } : {}) });
const elapsed = Math.round(performance.now() - started);

// ---- 零件对展开口径：报告数是「实例级」，零件对去重是另一口径 ----
const plan = planPairs(model, { ...(filter ? { filter } : {}) });
const partIdOf = (ref: string) => ref.split("[")[0];
const distinctPartPairs = new Set(reports.map((r) => [partIdOf(r.a), partIdOf(r.b)].sort().join(" ↔ ")));
console.log(`耗时: ${elapsed} ms`);
console.log(
  `总报告数（实例级）: ${reports.length}${layerLimit > 0 ? `（仅 L1..L${layerLimit} 零件对）` : "（全部）"}`,
);
console.log(
  `零件对展开: 实例(body) ${plan.bodies.length} → AABB 候选对 ${plan.pairs.length} → ` +
    `相交报告 ${reports.length}（实例级）→ 去重零件对 ${distinctPartPairs.size} 组`,
);

// ---- 深度口径：只统计实测深度；null = 测不出（贴合 / 同心配合面），不参与数值分层 ----
const depthOf = (report: ClippingReport) => report.depth_mm ?? -1;
const formTally = { bearing_overlap: 0, face_mate: 0, suspect: 0, displaced: 0 } as Record<string, number>;
let measured = 0;
for (const report of reports) {
  formTally[report.form ?? "unknown"] = (formTally[report.form ?? "unknown"] ?? 0) + 1;
  if (report.depth_mm !== null) measured++;
}
console.log(
  `深度口径: 实测 ${measured} / 测不出 ${reports.length - measured}；` +
    `形态: 配合面 ${formTally.bearing_overlap} · 贴合 ${formTally.face_mate} · ` +
    `存疑穿透 ${formTally.suspect} · 错位穿透 ${formTally.displaced}`,
);

const deep = reports.filter((r) => depthOf(r) > 10);
const mid = reports.filter((r) => depthOf(r) > 2 && depthOf(r) <= 10);
const shallow = reports.filter((r) => depthOf(r) > 0 && depthOf(r) <= 2);
console.log(
  `深度 >10mm(真缺陷级): ${deep.length}  2-10mm: ${mid.length}  ≤2mm(装配接触级): ${shallow.length}`,
);

// ---- 实测深度 TOP12 ----
const byDepth = [...reports].filter((r) => r.depth_mm !== null).sort((a, b) => depthOf(b) - depthOf(a));
console.log("--- 实测深度 TOP12 ---");
const pointText = (report: ClippingReport) =>
  `@(${report.point.map((v) => (v * 1000).toFixed(0)).join(",")})mm`;
for (const r of byDepth.slice(0, 12)) {
  console.log(
    `${r.depth_mm!.toFixed(2).padStart(7)}mm  [${r.form}] 交线 ${(r.intersection_mm ?? 0).toFixed(1)}mm  ${pointText(r)}  ${r.a}  ↔  ${r.b}`,
  );
}

// ---- 未测出深度（贴合/配合面）交线 TOP8 ----
const byLine = [...reports]
  .filter((r) => r.depth_mm === null)
  .sort((a, b) => (b.intersection_mm ?? 0) - (a.intersection_mm ?? 0));
if (byLine.length > 0) {
  console.log("--- 未测出深度 · 交线 TOP8（配合面尺度） ---");
  for (const r of byLine.slice(0, 8)) {
    console.log(`${(r.intersection_mm ?? 0).toFixed(1).padStart(7)}mm  [${r.form}]  ${r.a}  ↔  ${r.b}`);
  }
}

// ---- 按零件家族聚合 ----
const fam = new Map<string, ClippingReport[]>();
for (const r of reports) {
  const key = `${partIdOf(r.a)} ↔ ${partIdOf(r.b)}`;
  fam.set(key, [...(fam.get(key) ?? []), r]);
}
console.log("--- 报告家族 TOP10 ---");
for (const [k, v] of [...fam.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 10)) {
  console.log(`${v.length}  ${k}`);
}

console.log("--- 报告家族（全部，数量降序；max = 家族内最深实测深度） ---");
for (const [k, v] of [...fam.entries()].sort((a, b) => b[1].length - a[1].length)) {
  const depths = v.map((r) => r.depth_mm).filter((d): d is number => d !== null);
  const maxDepth = depths.length > 0 ? `${Math.max(...depths).toFixed(2)}mm` : "—（测不出）";
  const form = v[0].form ?? "?";
  console.log(`${String(v.length).padStart(3)}  max ${maxDepth.padStart(12)}  [${form}]  ${k}`);
}

// ---- 白名单分层：未豁免 = 真缺陷候选（验收口径「未豁免报告 = 0」） ----
const split = partitionExpectedContacts(reports, expectedContacts);
console.log(`--- 白名单分层: 未豁免 ${split.active.length} / 已豁免 ${split.expected.length} ---`);
if (split.active.length > 0) {
  console.log("--- 未豁免（真缺陷候选，按深度降序） ---");
  const activeSorted = [...split.active].sort((a, b) => depthOf(b.report) - depthOf(a.report));
  for (const item of activeSorted) {
    const r = item.report;
    const depth = r.depth_mm === null ? "  未测出" : `${r.depth_mm.toFixed(2)}mm`;
    console.log(`${depth.padStart(10)}  [${r.form}]  ${pointText(r)}  ${r.a}  ↔  ${r.b}`);
  }
}
const famTally = new Map<string, number>();
for (const hit of split.expected) famTally.set(hit.rule.family, (famTally.get(hit.rule.family) ?? 0) + 1);
console.log("--- 已豁免族计数（docs/qa/whitelist/README.md 表格口径） ---");
for (const rule of expectedContacts) {
  console.log(`${String(famTally.get(rule.family) ?? 0).padStart(3)}  ${rule.family}`);
}

// ---- 豁免规则复核（判定树口径）→ docs/qa/whitelist-recheck.md ----
// 口径：规则先按零件 id 模式匹配（不看形态/深度），再看这些报告落到哪个形态——
//   凡落 suspect / displaced 的，判定树已把它们从豁免区挪出（这就是「藏着的真穿透」清单）。
if (process.argv.includes("--recheck")) {
  const pairMatches = (rule: (typeof expectedContacts)[number], report: ClippingReport) =>
    (matchesPartId(rule.a, report.a) && matchesPartId(rule.b, report.b)) ||
    (matchesPartId(rule.a, report.b) && matchesPartId(rule.b, report.a));
  const formOrder = ["bearing_overlap", "face_mate", "suspect", "displaced"] as const;
  const rows: string[] = [];
  const leaks: string[] = [];
  expectedContacts.forEach((rule, index) => {
    const matched = reports.filter((report) => pairMatches(rule, report));
    const exempted = split.expected.filter((hit) => hit.rule === rule);
    const forms = new Map<string, number>();
    for (const report of matched)
      forms.set(report.form ?? "unknown", (forms.get(report.form ?? "unknown") ?? 0) + 1);
    const formText =
      formOrder
        .filter((form) => (forms.get(form) ?? 0) > 0)
        .map((form) => `${form}×${forms.get(form)}`)
        .join(" · ") || "—";
    const bad = (forms.get("suspect") ?? 0) + (forms.get("displaced") ?? 0);
    const verdict =
      matched.length === 0
        ? "— 未命中（族空转）"
        : bad > 0
          ? `✘ ${bad} 条 suspect/displaced（真穿透，已挪出豁免区）`
          : "✔ 全部为配合面/贴合面";
    rows.push(
      `| ${index + 1} | \`${rule.family}\` | \`${rule.a}\` ↔ \`${rule.b}\` | ${rule.reason} | ` +
        `${rule.maxDepthMm ?? DEFAULT_MAX_DEPTH_MM} | ${exempted.length}/${matched.length} | ${formText} | ${verdict} |`,
    );
    if (bad > 0) {
      for (const report of matched.filter((r) => r.form === "suspect" || r.form === "displaced")) {
        leaks.push(
          `- \`${report.a}\` ↔ \`${report.b}\`：形态 **${report.form}**，` +
            `交线 ${(report.intersection_mm ?? 0).toFixed(2)}mm，` +
            `${report.depth_mm === null ? "深度测不出" : `深度 ${report.depth_mm.toFixed(2)}mm`}` +
            `（族 \`${rule.family}\`）`,
        );
      }
    }
  });
  const doc = [
    "# 豁免规则复核清单（判定树口径）",
    "",
    "> 生成命令：`npx tsx scripts/diag-clips.ts --recheck`（本文件由脚本生成，不要手改）。",
    `> 本轮数据：总报告 ${reports.length} / 未豁免 ${split.active.length} / 已豁免 ${split.expected.length}` +
      `（含引擎模型全量实例对）。`,
    "",
    "## 判定树口径",
    "",
    "```",
    "相交对（bvhcast 命中）",
    " ├─ 绕轴闭合 且 交线来自贴合壁对（法向近平行） → bearing_overlap（同心配合面）  → 配合接触，可豁免",
    " ├─ 其余且 depth_mm 可测（≥ 0.5mm）          → displaced（错位穿透）           → 未豁免，报",
    " └─ 其余且 depth_mm = null                    → 交线退化(<0.1mm) = face_mate（共面贴合）→ 可豁免",
    "                                                否则 = suspect（存疑穿透）      → 未豁免，报",
    "```",
    "",
    "- 形态与深度是**两道守门**：`suspect` / `displaced` 无视豁免规则（守门值对它们无效）；",
    "- `depth_mm = null` 不再等于放行：null 必须过形态分流，分不出的一律进未豁免区；",
    "- 「命中」列 = 按零件 id 模式匹配到的报告数，括号外为**仍在豁免区**的条数。",
    "",
    "## 复核表",
    "",
    "| # | 豁免族 | 零件对（规则） | 依据 | 守门值(mm) | 豁免/命中 | 形态分布 | 结论 |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ...rows,
    "",
    "## 漏网清单（族内被判 suspect / displaced 的报告）",
    "",
    ...(leaks.length > 0 ? leaks : ["（空：复核表里没有族落进 suspect / displaced）"]),
    "",
    "## 未豁免清单（本轮，验收口径：未豁免 = 0）",
    "",
    ...(split.active.length > 0
      ? split.active.map(
          (item) =>
            `- \`${item.report.a}\` ↔ \`${item.report.b}\`：形态 **${item.report.form ?? "unknown"}**，` +
            `交线 ${(item.report.intersection_mm ?? 0).toFixed(2)}mm，` +
            `${item.report.depth_mm === null ? "深度测不出" : `深度 ${item.report.depth_mm.toFixed(2)}mm`}`,
        )
      : ["（空：未豁免 = 0）"]),
    "",
  ].join("\n");
  writeFileSync("docs/qa/whitelist-recheck.md", doc, "utf8");
  console.log(`--- 豁免规则复核已写入 docs/qa/whitelist-recheck.md（漏网 ${leaks.length} 条） ---`);
}

model.dispose();
