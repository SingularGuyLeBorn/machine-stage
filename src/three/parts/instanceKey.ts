// ============================================================================
// 实例键 —— UI 选中 / 单实例拆解用的「零件 + 实例序号」字符串
//
// 报告里的实例引用是 `part[3]`（求解器口径）；这里用 `part#3`，避免两套语义混在
// 同一个字符串里（报告 key 还带 a/b 两端）。
// ============================================================================

/** 实例键：`partId#index`。 */
export function instanceKey(partId: string, index: number): string {
  return `${partId}#${index}`;
}

/** 解析实例键；非法输入返回 null（不抛，UI 侧容错）。 */
export function parseInstanceKey(key: string): { partId: string; index: number } | null {
  const at = key.lastIndexOf("#");
  if (at <= 0) return null;
  const index = Number(key.slice(at + 1));
  if (!Number.isInteger(index) || index < 0) return null;
  return { partId: key.slice(0, at), index };
}
