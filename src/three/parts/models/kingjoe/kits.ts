import * as THREE from "three";
import type { GeometryBuilder } from "../../assembler/geometry";

// ============================================================================
// models/kingjoe/kits —— 佩丹星机加工件
//   kjChamferPlate：切角装甲板（可开矩形/圆形孔），倒角控制在板厚 8%；
//   kjTorus：悬浮线圈/密封环（水平放置，轴为 +Y）；
//   kjSpike：锥形天线/刺。
// ============================================================================

type Params = Record<string, unknown>;

function num(params: Params | undefined, key: string, fallback?: number): number {
  const value = params?.[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (fallback !== undefined) return fallback;
  throw new Error(`kingjoe kit：参数 "${key}" 必须是数值`);
}

const kjChamferPlate: GeometryBuilder = (spec) => {
  const params = (spec as { params?: Params }).params;
  const w = num(params, "w");
  const h = num(params, "h");
  const t = num(params, "t", 0.04);
  const corner = num(params, "corner", Math.min(w, h) * 0.14);
  const bevel = Math.min(num(params, "bevel", 0.004), t * 0.3, corner * 0.5);
  const hw = w / 2 - bevel;
  const hh = h / 2 - bevel;
  const c = Math.min(corner, hw, hh);
  const shape = new THREE.Shape();
  shape.moveTo(-hw + c, -hh);
  shape.lineTo(hw - c, -hh);
  shape.lineTo(hw, -hh + c);
  shape.lineTo(hw, hh - c);
  shape.lineTo(hw - c, hh);
  shape.lineTo(-hw + c, hh);
  shape.lineTo(-hw, hh - c);
  shape.lineTo(-hw, -hh + c);
  shape.closePath();

  const holes = params?.holes;
  if (Array.isArray(holes)) {
    for (const raw of holes) {
      if (!Array.isArray(raw) || raw.length !== 3) continue;
      const [x, y, r] = raw.map(Number);
      if (r <= 0) continue;
      const path = new THREE.Path();
      path.absarc(x, y, r + bevel, 0, Math.PI * 2, true);
      shape.holes.push(path);
    }
  }
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(t - bevel * 2, 0.001),
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 14,
  });
  geometry.translate(0, 0, -t / 2 + bevel);
  geometry.computeVertexNormals();
  return geometry;
};

const kjTorus: GeometryBuilder = (spec) => {
  const params = (spec as { params?: Params }).params;
  const radius = num(params, "radius", 0.2);
  const tube = num(params, "tube", 0.03);
  const segments = num(params, "segments", 28);
  const radialSegments = num(params, "radialSegments", 8);
  const geometry = new THREE.TorusGeometry(radius, tube, radialSegments, segments);
  geometry.rotateX(Math.PI / 2);
  return geometry;
};

const kjSpike: GeometryBuilder = (spec) => {
  const params = (spec as { params?: Params }).params;
  const r = num(params, "r", 0.02);
  const h = num(params, "h", 0.2);
  const segments = num(params, "segments", 12);
  return new THREE.ConeGeometry(r, h, segments);
};

export const kingjoeBuilders: Record<string, GeometryBuilder> = {
  kjChamferPlate,
  kjTorus,
  kjSpike,
};
