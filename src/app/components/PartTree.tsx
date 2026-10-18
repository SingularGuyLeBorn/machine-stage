import { ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { BUILD_LAYER_LABELS } from "@/three/parts";
import { findModel } from "../catalog";
import { useStageStore } from "../state/stageStore";

// ============================================================================
// PartTree —— 零件树（按总成折叠；点零件 → 选中 + 相机聚焦）
//
// 数据全部来自注册表：组装顺序按 build_order，重复件标注实例数量。
// ============================================================================

interface TreePart {
  id: string;
  nameCn: string;
  nameEn: string;
  layer: number;
  order: number;
  instances?: number;
  dual?: boolean;
}

interface TreeGroup {
  id: string;
  nameCn: string;
  nameEn: string;
  parts: TreePart[];
  layers: number[];
}

function buildTree(modelId: string): { groups: TreeGroup[]; total: number } {
  const registry = findModel(modelId).registry;
  if (!registry) return { groups: [], total: 0 };
  const groups: TreeGroup[] = registry.assemblies.map((assembly) => ({
    id: assembly.id,
    nameCn: assembly.name_cn,
    nameEn: assembly.name_en,
    parts: [],
    layers: [],
  }));
  const byId = new Map(groups.map((group) => [group.id, group]));
  for (const part of registry.parts) {
    const group = byId.get(part.assembly);
    if (!group) continue;
    group.parts.push({
      id: part.id,
      nameCn: part.name_cn,
      nameEn: part.name_en,
      layer: part.build_layer,
      order: part.build_order,
      instances: part.instances,
      dual: part.dual,
    });
  }
  for (const group of groups) {
    group.parts.sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
    group.layers = [...new Set(group.parts.map((part) => part.layer))].sort((a, b) => a - b);
  }
  return { groups, total: registry.parts.length };
}

export function PartTree() {
  const modelId = useStageStore((state) => state.modelId);
  const selectedPart = useStageStore((state) => state.selectedPart);
  const selectPart = useStageStore((state) => state.selectPart);
  const requestFocus = useStageStore((state) => state.requestFocus);
  const hoverPart = useStageStore((state) => state.hoverPart);
  const tree = useMemo(() => buildTree(modelId), [modelId]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const toggle = (groupId: string) =>
    setCollapsed((previous) => ({ ...previous, [groupId]: !previous[groupId] }));

  return (
    <section className="panel panel--grow">
      <header className="panel__head">
        <h2 className="panel__title">零件树</h2>
        <span className="panel__count">{tree.total} 个注册零件</span>
      </header>
      <div className="panel__body">
        {tree.groups.length === 0 ? <div className="empty">该模型尚未登记注册表</div> : null}
        <div className="tree">
          {tree.groups.map((group) => {
            const open = !collapsed[group.id];
            return (
              <div key={group.id}>
                <button
                  type="button"
                  className="tree__group-head"
                  aria-expanded={open}
                  onClick={() => toggle(group.id)}
                >
                  <span className="tree__chevron" data-open={open}>
                    <ChevronRight size={13} aria-hidden />
                  </span>
                  {group.nameCn}
                  <span className="badge badge--plain">
                    {group.parts.length} 件 · L{group.layers.join("/")}
                  </span>
                </button>
                {open ? (
                  <div className="tree__group-body">
                    {group.parts.map((part) => (
                      <button
                        key={part.id}
                        type="button"
                        className="tree__part"
                        aria-current={part.id === selectedPart}
                        title={`${part.id} · ${BUILD_LAYER_LABELS[part.layer]?.name_cn ?? ""}`}
                        onMouseEnter={() => hoverPart(part.id)}
                        onMouseLeave={() => hoverPart(null)}
                        onClick={() => {
                          selectPart(part.id);
                          requestFocus(part.id);
                        }}
                      >
                        <span className="tree__layer" data-layer={part.layer} />
                        <span className="tree__name">{part.nameCn}</span>
                        <span className="tree__meta">
                          {part.instances ? `×${part.instances}` : part.dual ? "L/R" : ""}
                          <span className="num">{part.order}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
