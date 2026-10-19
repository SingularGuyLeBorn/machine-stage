import type { InstanceLayout } from "../../assembler/assembler";
import type { GeometryBuilder } from "../../assembler/geometry";
import type { ModelRegistry } from "../../registry/types";
import { makeEngineLayouts, makeEngineRegistry } from "./engine/registry";
import { tigerKitBuilders } from "./engine/kits";
import { makeRunningLayouts, makeRunningRegistry } from "./running/registry";
import { tigerRunningKitBuilders } from "./running/kits";
import { makeTransmissionLayouts, makeTransmissionRegistry } from "./transmission/registry";
import { tigerTransmissionKitBuilders } from "./transmission/kits";
import { makeInteriorLayouts, makeInteriorRegistry } from "./interior/registry";
import { tigerInteriorKitBuilders } from "./interior/kits";
import { makeHullLayouts, makeHullRegistry } from "./hull/registry";
import { tigerHullKitBuilders } from "./hull/kits";

// ============================================================================
// models/tiger —— 虎式 I 整机注册表（分层合并）
//
// 每层一个 registry（L1 发动机 engine/、L2 行动装置 running/、L2 传动装置 transmission/…），
// 这里只做合并：constants / assemblies / nodes / materials / parts / expectedContacts 各自拼接。
// 分层的意义：层内自洽（层内静态零报告），层间只在接口处（机脚 ↔ 车体、主动轮 ↔ 履带、
// 传动轴 ↔ 发动机尾轴）对齐；层不齐时上层不落地，避免把问题混在一起排查。
// ============================================================================

export function makeTigerRegistry(): ModelRegistry {
  const engine = makeEngineRegistry();
  const running = makeRunningRegistry();
  const transmission = makeTransmissionRegistry();
  const interior = makeInteriorRegistry();
  const hull = makeHullRegistry();
  return {
    ...engine,
    title: "虎式坦克 Tiger I",
    subtitle:
      "L1 发动机（HL230 P45）+ L2 行动装置（履带 / 负重轮 / 扭杆悬挂）+ L2 传动装置（Olvar 变速箱 / 传动轴 / L 600 C 转向机）+ L3 内衬内饰（驾驶舱 / 无线电员席）+ L4 车体外壳（地板 / 侧板 / 前后装甲板 / 发动机隔板）",
    source_notes: [
      engine.source_notes ?? "",
      running.source_notes ?? "",
      transmission.source_notes ?? "",
      interior.source_notes ?? "",
      hull.source_notes ?? "",
    ]
      .filter(Boolean)
      .join("\n"),
    constants: {
      ...engine.constants,
      ...running.constants,
      ...transmission.constants,
      ...interior.constants,
      ...hull.constants,
    },
    assemblies: [
      ...engine.assemblies,
      ...running.assemblies,
      ...transmission.assemblies,
      ...interior.assemblies,
      ...hull.assemblies,
    ],
    nodes: [...engine.nodes, ...running.nodes],
    materials: {
      ...engine.materials,
      ...running.materials,
      ...transmission.materials,
      ...interior.materials,
      ...hull.materials,
    },
    parts: [...engine.parts, ...running.parts, ...transmission.parts, ...interior.parts, ...hull.parts],
    expectedContacts: [
      ...(engine.expectedContacts ?? []),
      ...(running.expectedContacts ?? []),
      ...(transmission.expectedContacts ?? []),
      ...(interior.expectedContacts ?? []),
      ...(hull.expectedContacts ?? []),
    ],
  };
}

export function makeTigerLayouts(): Record<string, InstanceLayout> {
  return {
    ...makeEngineLayouts(),
    ...makeRunningLayouts(),
    ...makeTransmissionLayouts(),
    ...makeInteriorLayouts(),
    ...makeHullLayouts(),
  };
}

export const tigerBuilders: Record<string, GeometryBuilder> = {
  ...tigerKitBuilders,
  ...tigerRunningKitBuilders,
  ...tigerTransmissionKitBuilders,
  ...tigerInteriorKitBuilders,
  ...tigerHullKitBuilders,
};
