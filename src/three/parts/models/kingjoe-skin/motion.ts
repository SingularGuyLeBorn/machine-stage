import type { AssembledModel } from "../../assembler/assembler";

// ============================================================================
// models/kingjoe-skin/motion —— 静态分件参考卡的四模块展开
//
// 只做“四体分件/合拢”查看：四个模块沿 Y 轴展开，不改皮肤件本身。
// 阻尼合体/锥销/锁环/电弧/怪光线由主模型 models/kingjoe 承担。
// ============================================================================

export type KingJoeSkinState = "idle" | "separated";

const MODULES = [
  { node: "KJLegsModule", rest: 0, offset: -1.4, phase: 0 },
  { node: "KJStomachModule", rest: 3.45, offset: -0.5, phase: 1.1 },
  { node: "KJChestModule", rest: 4.55, offset: 0.9, phase: 2.2 },
  { node: "KJShipModule", rest: 5.65, offset: 2.2, phase: 3.3 },
] as const;

export function animateKingJoeSkin(
  assembled: AssembledModel,
  seconds: number,
  state: KingJoeSkinState = "idle",
): void {
  const progress = state === "separated" ? Math.min(1, Math.max(0, seconds) / 0.9) : 0;
  const eased = progress * progress * (3 - 2 * progress);
  for (const { node, rest, offset, phase } of MODULES) {
    const group = assembled.getNode(node);
    if (!group) continue;
    const hover = state === "separated" ? Math.sin(seconds * 1.1 + phase) * 0.018 : 0;
    group.position.set(0, rest + offset * eased + hover * eased, 0);
    group.rotation.set(0, Math.sin(seconds * 0.8 + phase) * 0.04 * eased, 0);
  }
}
