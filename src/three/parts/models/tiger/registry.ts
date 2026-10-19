import type { InstanceLayout } from "../../assembler/assembler";
import type { GeometryBuilder } from "../../assembler/geometry";
import type { ModelRegistry } from "../../registry/types";
import { makeEngineLayouts, makeEngineRegistry } from "./engine/registry";
import { tigerKitBuilders } from "./engine/kits";
import { makeRunningLayouts, makeRunningRegistry } from "./running/registry";
import { tigerRunningKitBuilders } from "./running/kits";

// ============================================================================
// models/tiger —— 虎式 I 整机注册表（分层合并）
//
// 每层一个 registry（L1 发动机 engine/、L2 行动装置 running/…），这里只做合并：
// constants / assemblies / nodes / materials / parts / expectedContacts 各自拼接。
// 分层的意义：层内自洽（层内静态零报告），层间只在接口处（机脚 ↔ 车体、主动轮 ↔ 履带）
// 对齐；层不齐时上层不落地，避免把问题混在一起排查。
// ============================================================================

export function makeTigerRegistry(): ModelRegistry {
  const engine = makeEngineRegistry();
  const running = makeRunningRegistry();
  return {
    ...engine,
    title: "虎式坦克 Tiger I",
    subtitle: "L1 发动机（HL230 P45）+ L2 行动装置（履带 / 负重轮 / 扭杆悬挂）",
    source_notes: [engine.source_notes ?? "", running.source_notes ?? ""].filter(Boolean).join("\n"),
    constants: { ...engine.constants, ...running.constants },
    assemblies: [...engine.assemblies, ...running.assemblies],
    nodes: [...engine.nodes, ...running.nodes],
    materials: { ...engine.materials, ...running.materials },
    parts: [...engine.parts, ...running.parts],
    expectedContacts: [...(engine.expectedContacts ?? []), ...(running.expectedContacts ?? [])],
  };
}

export function makeTigerLayouts(): Record<string, InstanceLayout> {
  return { ...makeEngineLayouts(), ...makeRunningLayouts() };
}

export const tigerBuilders: Record<string, GeometryBuilder> = {
  ...tigerKitBuilders,
  ...tigerRunningKitBuilders,
};
