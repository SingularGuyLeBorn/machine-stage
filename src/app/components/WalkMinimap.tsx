import { useMemo } from "react";
import { useStageStore } from "../state/stageStore";
import { walkConfigOf, type WalkArea, type WalkMapFeature } from "../three/walk";

// ============================================================================
// WalkMinimap —— 第一人称漫游右上角小地图
//
// 俯视朝向：模型 +Z（舰艏/车体上方）朝屏幕上方；玩家朝向用箭头表示。
// 甲板显示舰体轮廓 + 舰岛/跑道/升降机/拦阻网；舱室显示本舱范围与交互点。
// 只订阅 walkArea/walkPose，10Hz 位姿更新不会带动整个 Viewport 重渲染。
// ============================================================================

interface Bounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

function extend(bounds: Bounds, x: number, z: number): void {
  bounds.minX = Math.min(bounds.minX, x);
  bounds.maxX = Math.max(bounds.maxX, x);
  bounds.minZ = Math.min(bounds.minZ, z);
  bounds.maxZ = Math.max(bounds.maxZ, z);
}

function featurePoints(feature: WalkMapFeature): Array<[number, number]> {
  if (feature.points) return feature.points;
  if (feature.rect) {
    const [minX, minZ, maxX, maxZ] = feature.rect;
    return [
      [minX, minZ],
      [maxX, minZ],
      [maxX, maxZ],
      [minX, maxZ],
    ];
  }
  if (feature.at) return [feature.at];
  return [];
}

function mapBounds(area: WalkArea, features: WalkMapFeature[]): Bounds {
  const bounds: Bounds = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  if (area.polygon) for (const [x, z] of area.polygon) extend(bounds, x, z);
  if (area.rect) {
    extend(bounds, area.rect[0], area.rect[2]);
    extend(bounds, area.rect[1], area.rect[3]);
  }
  for (const feature of features) for (const [x, z] of featurePoints(feature)) extend(bounds, x, z);
  if (!Number.isFinite(bounds.minX)) return { minX: -5, maxX: 5, minZ: -5, maxZ: 5 };
  return bounds;
}

function pointsAttr(points: Array<[number, number]>): string {
  return points.map(([x, z]) => `${x},${-z}`).join(" ");
}

function featureCenter(feature: WalkMapFeature): [number, number] | null {
  if (feature.at) return feature.at;
  const points = featurePoints(feature);
  if (points.length === 0) return null;
  const sum = points.reduce((acc, [x, z]) => [acc[0] + x, acc[1] + z], [0, 0]);
  return [sum[0] / points.length, sum[1] / points.length];
}

const MARKER_COLOR: Record<string, string> = {
  portal: "#67d7ff",
  doors: "#ffd15c",
  barrier: "#ff6b5c",
  jbd: "#ffa94d",
  mount: "#d58bff",
  dismount: "#a9b7c6",
};

export function WalkMinimap() {
  const modelId = useStageStore((state) => state.modelId);
  const areaId = useStageStore((state) => state.walkArea);
  const pose = useStageStore((state) => state.walkPose);
  const config = walkConfigOf(modelId);
  const area = config?.areas[areaId];

  const map = useMemo(() => {
    if (!config || !area) return null;
    const features = area.mapFeatures ?? [];
    const bounds = mapBounds(area, features);
    const span = Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ, 1);
    const pad = span * 0.06;
    const view = {
      x: bounds.minX - pad,
      y: -(bounds.maxZ + pad),
      w: bounds.maxX - bounds.minX + pad * 2,
      h: bounds.maxZ - bounds.minZ + pad * 2,
    };
    const interactions = config.interactions.filter((item) => item.area === areaId);
    let nearestId: string | null = null;
    let nearest = Infinity;
    for (const interaction of interactions) {
      const distance = Math.hypot(interaction.pos[0] - pose.x, interaction.pos[1] - pose.z);
      if (distance <= interaction.radius && distance < nearest) {
        nearest = distance;
        nearestId = interaction.id;
      }
    }
    const isShip = modelId === "carrier" || modelId === "type055";
    const font = span * 0.045;
    const markerR = span * 0.016;
    return { view, features, interactions, nearestId, isShip, font, markerR, span };
  }, [area, areaId, config, modelId, pose.x, pose.z]);

  if (!config || !area || !map) return null;
  const { view, features, interactions, nearestId, isShip, font, markerR, span } = map;
  const px = pose.x;
  const py = -pose.z;
  // 三角形默认朝屏幕上方；yaw=π（朝舰艏/+Z）时应朝上。
  const headingDeg = (pose.yaw * 180) / Math.PI + 180;
  const playerR = markerR * 2.0;
  const arrow = markerR * 3.4;

  return (
    <div className="walk-minimap" role="img" aria-label={`${area.label} 小地图`}>
      <div className="walk-minimap__head">
        <span className="walk-minimap__title">小地图</span>
        <span className="walk-minimap__area">{area.label}</span>
        <span className="walk-minimap__dir">{isShip ? "艏 ↑" : "俯视"}</span>
      </div>
      <svg className="walk-minimap__svg" viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`} preserveAspectRatio="xMidYMid meet">
        <defs>
          <pattern id="wm-grid" width={span * 0.05} height={span * 0.05} patternUnits="userSpaceOnUse">
            <path d={`M ${span * 0.05} 0 L 0 0 0 ${span * 0.05}`} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={span * 0.002} />
          </pattern>
          <clipPath id="wm-clip">
            {area.polygon ? (
              <polygon points={pointsAttr(area.polygon)} />
            ) : area.rect ? (
              <rect
                x={area.rect[0]}
                y={-area.rect[3]}
                width={area.rect[1] - area.rect[0]}
                height={area.rect[3] - area.rect[2]}
              />
            ) : null}
          </clipPath>
        </defs>

        {area.polygon ? (
          <polygon
            points={pointsAttr(area.polygon)}
            fill="rgba(255,255,255,0.08)"
            stroke="rgba(230,240,250,0.62)"
            strokeWidth={span * 0.004}
          />
        ) : area.rect ? (
          <rect
            x={area.rect[0]}
            y={-area.rect[3]}
            width={area.rect[1] - area.rect[0]}
            height={area.rect[3] - area.rect[2]}
            fill="rgba(255,255,255,0.07)"
            stroke="rgba(230,240,250,0.55)"
            strokeWidth={span * 0.004}
            rx={span * 0.006}
          />
        ) : null}
        <g clipPath="url(#wm-clip)">
          <rect x={view.x} y={view.y} width={view.w} height={view.h} fill="url(#wm-grid)" />
        </g>

        {features.map((feature, index) => {
          if (feature.kind === "label") {
            if (!feature.at) return null;
            return (
              <text
                key={`label-${index}`}
                x={feature.at[0]}
                y={-feature.at[1]}
                fill="rgba(235,244,252,0.7)"
                fontSize={font * 0.9}
                textAnchor="middle"
                dominantBaseline="middle"
              >
                {feature.label}
              </text>
            );
          }
          const points = featurePoints(feature);
          if (points.length < 2) return null;
          const common = {
            fill: feature.kind === "runway" ? "rgba(104,176,255,0.2)" : feature.kind === "zone" ? "rgba(255,196,87,0.2)" : "rgba(210,225,240,0.17)",
            stroke:
              feature.kind === "runway"
                ? "rgba(126,196,255,0.7)"
                : feature.kind === "zone"
                  ? "rgba(255,204,102,0.7)"
                  : feature.kind === "line"
                    ? "rgba(255,104,90,0.85)"
                    : "rgba(210,225,240,0.5)",
            strokeWidth: feature.kind === "line" ? span * 0.012 : span * 0.003,
          };
          const center = featureCenter(feature);
          return (
            <g key={`feature-${index}`}>
              {feature.kind === "line" ? (
                <polyline points={pointsAttr(points)} {...common} fill="none" />
              ) : (
                <polygon points={pointsAttr(points)} {...common} />
              )}
              {feature.label && center && feature.kind !== "line" ? (
                <text
                  x={center[0]}
                  y={-center[1]}
                  fill="rgba(240,247,253,0.86)"
                  fontSize={font * 0.82}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontWeight={600}
                >
                  {feature.label}
                </text>
              ) : null}
            </g>
          );
        })}

        {interactions.map((interaction) => {
          const color = MARKER_COLOR[interaction.kind] ?? "#9fb1c4";
          const isNearest = interaction.id === nearestId;
          return (
            <g key={interaction.id}>
              {isNearest ? (
                <circle
                  cx={interaction.pos[0]}
                  cy={-interaction.pos[1]}
                  r={markerR * 2.6}
                  fill="none"
                  stroke="rgba(255,255,255,0.9)"
                  strokeWidth={span * 0.004}
                />
              ) : null}
              <circle cx={interaction.pos[0]} cy={-interaction.pos[1]} r={markerR * (isNearest ? 1.5 : 1)} fill={color} opacity={0.95} />
            </g>
          );
        })}

        <g transform={`translate(${px} ${py}) rotate(${headingDeg})`}>
          <circle r={playerR} fill="rgba(16,30,40,0.85)" stroke="rgba(255,255,255,0.9)" strokeWidth={span * 0.004} />
          <path d={`M 0 ${-arrow} L ${arrow * 0.62} ${arrow * 0.55} L 0 ${arrow * 0.24} L ${-arrow * 0.62} ${arrow * 0.55} Z`} fill="#7fe7ff" stroke="rgba(6,18,26,0.8)" strokeWidth={span * 0.003} />
        </g>
      </svg>
      <div className="walk-minimap__foot">
        <span>
          x {pose.x.toFixed(1)} · z {pose.z.toFixed(1)}
        </span>
        <span>{interactions.length} 个交互点</span>
      </div>
    </div>
  );
}
