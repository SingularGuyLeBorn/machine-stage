import { resolveConstants } from "./expression";
import type { ModelRegistry } from "./types";

// ============================================================================
// registry/validate —— 注册表静态校验（CI 与运行时双方言）
// 装配前必须通过；错误（error）阻断构建，警告（warn）提示但不阻断。
// ============================================================================

export interface ValidationIssue {
  level: "error" | "warn";
  code: string;
  message: string;
  partId?: string;
}

const ID_PATTERN = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/;
const NODE_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/;
const LAYER_RANGE: Record<number, [number, number]> = {
  1: [100, 199],
  2: [200, 299],
  3: [300, 399],
  4: [400, 499],
  5: [500, 599],
};

export const BUILD_LAYER_LABELS: Record<number, { name_cn: string; name_en: string }> = {
  1: { name_cn: "核心机构", name_en: "core mechanism" },
  2: { name_cn: "传动支撑", name_en: "drive & support" },
  3: { name_cn: "内衬内饰", name_en: "interior" },
  4: { name_cn: "外壳蒙皮", name_en: "shell & armor" },
  5: { name_cn: "表面附件", name_en: "surface & accessories" },
};

export function validateRegistry(registry: ModelRegistry): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const error = (code: string, message: string, partId?: string) =>
    issues.push({ level: "error", code, message, partId });
  const warn = (code: string, message: string, partId?: string) =>
    issues.push({ level: "warn", code, message, partId });

  // 常量表
  let constants: Record<string, number> = {};
  try {
    constants = resolveConstants(registry.constants);
  } catch (cause) {
    error("E011", `常量表求值失败：${(cause as Error).message}`);
  }

  const assemblyIds = new Set(registry.assemblies.map((a) => a.id));
  const materialIds = new Set(Object.keys(registry.materials));
  const nodeNames = new Set(registry.nodes.map((n) => n.name));
  const parentNames = new Set<string>(["root"]);

  // 节点表
  for (const node of registry.nodes) {
    if (!NODE_PATTERN.test(node.name)) {
      error("E020", `节点名 "${node.name}" 不符合命名规范（大驼峰）`);
    }
    if (!nodeNames.has(node.parent) && node.parent !== "root") {
      error("E021", `节点 "${node.name}" 的父节点 "${node.parent}" 不存在`);
    }
    parentNames.add(node.name);
  }
  // 节点环检测
  {
    const parentOf = new Map(registry.nodes.map((n) => [n.name, n.parent] as const));
    for (const node of registry.nodes) {
      const seen = new Set<string>([node.name]);
      let cursor = node.parent;
      while (cursor && cursor !== "root") {
        if (seen.has(cursor)) {
          error("E022", `节点层级存在环：${node.name} → … → ${cursor}`);
          break;
        }
        seen.add(cursor);
        cursor = parentOf.get(cursor) ?? "root";
      }
    }
  }

  // 零件表
  const seenIds = new Set<string>();
  const seenOrders = new Map<number, string>();
  const expandedIds = new Set<string>();
  for (const part of registry.parts) {
    const where = part.id;
    if (!ID_PATTERN.test(part.id)) {
      error("E001", `零件 ID "${part.id}" 不符合 <model>.<assembly>.<part> 格式`, where);
    } else if (!part.id.startsWith(`${registry.model}.`)) {
      error("E001", `零件 ID "${part.id}" 的模型前缀不是 "${registry.model}."`, where);
    }
    if (seenIds.has(part.id)) error("E002", `零件 ID 重复："${part.id}"`, where);
    seenIds.add(part.id);

    if (!assemblyIds.has(part.assembly)) {
      error("E003", `零件 "${part.id}" 的 assembly "${part.assembly}" 未在 assemblies 中声明`, where);
    }
    if (!materialIds.has(part.material)) {
      error("E004", `零件 "${part.id}" 的材质 "${part.material}" 未在 materials 中声明`, where);
    }
    if (!BUILD_LAYER_LABELS[part.build_layer]) {
      error("E006", `零件 "${part.id}" 的 build_layer=${part.build_layer} 越界（1..5）`, where);
    } else {
      const [lo, hi] = LAYER_RANGE[part.build_layer];
      if (part.build_order < lo || part.build_order > hi) {
        warn(
          "W002",
          `零件 "${part.id}" 的 build_order=${part.build_order} 不在 L${part.build_layer} 区间 [${lo}, ${hi}]`,
          where,
        );
      }
    }
    if (seenOrders.has(part.build_order)) {
      error(
        "E007",
        `build_order=${part.build_order} 被 "${seenOrders.get(part.build_order)}" 与 "${part.id}" 重复占用`,
        where,
      );
    } else {
      seenOrders.set(part.build_order, part.id);
    }
    if (!part.name_cn?.trim() || !part.name_en?.trim()) {
      warn("W001", `零件 "${part.id}" 缺少 name_cn 或 name_en（手册原名）`, where);
    }
    if (part.node && !nodeNames.has(part.node)) {
      error("E005", `零件 "${part.id}" 的 node "${part.node}" 未声明`, where);
    }
    if (part.instances !== undefined) {
      if (part.instances < 2) {
        error("E008", `零件 "${part.id}" 声明 instances=${part.instances}，重复件至少为 2`, where);
      }
      if (!part.indexed) error("E008", `零件 "${part.id}" 有实例但未标记 indexed=true`, where);
      if (part.dual) {
        warn("W003", `零件 "${part.id}" 同时使用 instances 与 dual，建议拆分为两个零件`, where);
      }
    } else if (part.indexed) {
      error("E008", `零件 "${part.id}" 标记 indexed=true 但未声明 instances`, where);
    }
    if (part.instance_nodes) {
      if (part.instances === undefined || part.instance_nodes.length !== part.instances) {
        error("E009", `零件 "${part.id}" 的 instance_nodes 长度与 instances 不一致`, where);
      }
      for (const nodeName of part.instance_nodes) {
        if (!nodeNames.has(nodeName)) {
          error("E005", `零件 "${part.id}" 的 instance_nodes 引用未声明节点 "${nodeName}"`, where);
        }
      }
    }
    if (part.mate && part.mate.type !== "absolute") {
      const target = (part.mate as { to: string }).to;
      if (!seenIds.has(target) && !nodeNames.has(target)) {
        // 允许引用尚未解析的零件（拓扑解析会兜底报错），这里只检查两者都不存在的情况
        const willExist = registry.parts.some(
          (p) => p.id === target || (p.dual && `${p.id}_l` === target) || (p.dual && `${p.id}_r` === target),
        );
        if (!willExist) {
          error("E010", `零件 "${part.id}" 的 mate.to "${target}" 既不是零件也不是节点`, where);
        }
      }
    }
    // dual 展开命名与重复检查
    if (part.dual) {
      for (const suffix of ["_l", "_r"] as const) {
        const expanded = `${part.id}${suffix}`;
        if (expandedIds.has(expanded)) error("E012", `双侧件展开 ID 重复："${expanded}"`, where);
        expandedIds.add(expanded);
      }
    } else {
      if (expandedIds.has(part.id)) error("E012", `零件 ID 重复："${part.id}"`, where);
      expandedIds.add(part.id);
    }
    if (part.mate && part.mate.type !== "absolute" && "to" in part.mate) {
      const target = part.mate.to;
      if (target === part.id) error("E010", `零件 "${part.id}" 的 mate 指向自身`, where);
    }
  }

  // 命名规范：双侧件必须成对（xxx_l + xxx_r）
  for (const id of expandedIds) {
    if (id.endsWith("_l") && !expandedIds.has(`${id.slice(0, -2)}_r`)) {
      error("E012", `左侧件 "${id}" 缺少配对的 _r 右件`);
    }
    if (id.endsWith("_r") && !expandedIds.has(`${id.slice(0, -2)}_l`)) {
      error("E012", `右侧件 "${id}" 缺少配对的 _l 左件`);
    }
  }

  void constants;
  return issues;
}

export function formatIssues(issues: ValidationIssue[]): string {
  return issues
    .map((issue) => `[${issue.level === "error" ? "E" : "W"}${issue.code}] ${issue.message}`)
    .join("\n");
}
