import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { GeometryBuilder } from "../../assembler/geometry";

/** 把跨折线的三角形精确切开；普通细分只逼近折线，会造成金属高光波纹。 */
function splitAtCreases(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const position = g.getAttribute("position"),
    uv = g.getAttribute("uv");
  const positions: number[] = [],
    uvs: number[] = [];
  for (let i = 0; i < position.count; i += 3) {
    let polygons = [
      [0, 1, 2].map((j) => [
        position.getX(i + j),
        position.getY(i + j),
        position.getZ(i + j),
        uv.getX(i + j),
        uv.getY(i + j),
      ]),
    ];
    for (const axis of [0, 1]) {
      polygons = polygons.flatMap((poly) => {
        if (!poly.some((p) => p[axis] < 0) || !poly.some((p) => p[axis] > 0)) return [poly];
        return [-1, 1].map((sign) => {
          const clipped: number[][] = [];
          for (let k = 0; k < poly.length; k++) {
            const a = poly[k],
              b = poly[(k + 1) % poly.length];
            if (a[axis] * sign >= 0) clipped.push(a);
            if (a[axis] * b[axis] < 0) {
              const t = -a[axis] / (b[axis] - a[axis]);
              clipped.push(a.map((v, j) => v + (b[j] - v) * t));
            }
          }
          return clipped;
        });
      });
    }
    for (const poly of polygons)
      for (let j = 1; j < poly.length - 1; j++)
        for (const p of [poly[0], poly[j], poly[j + 1]]) {
          positions.push(...p.slice(0, 3));
          uvs.push(...p.slice(3));
        }
  }
  const result = new THREE.BufferGeometry();
  result.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  result.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  return result;
}

/** HMT 的带开窗折面护板、截面放样和端点连杆；参数全部由注册表解析。 */
export const hmtBuilders: Record<string, GeometryBuilder> = {
  hmt_panel: (spec) => {
    if (spec.type !== "kit") throw new Error("HMT 护板需要 kit 参数");
    const p = spec.params!;
    const outline = p.outline as number[][];
    const shape = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
    for (const hole of (p.holes ?? []) as number[][][]) {
      shape.holes.push(new THREE.Path(hole.map(([x, y]) => new THREE.Vector2(x, y))));
    }
    const thickness = Number(p.thickness);
    const bevel = Number(p.bevel);
    const g = new THREE.ExtrudeGeometry(shape, {
      depth: thickness - bevel * 2,
      bevelEnabled: true,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 2,
      curveSegments: 4,
      steps: 1,
    });
    const tessellated = splitAtCreases(g);
    g.dispose();
    const pos = tessellated.getAttribute("position");
    const width = Number(p.width);
    const rise = Number(p.rise);
    const slope = Number(p.slope);
    const fold = Number(p.fold ?? 0);
    // 折脊是整个有厚度壳体的形变，孔壁和背面一起跟随，不叠贴假黑窗。
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const ridge = rise * Math.max(0, 1 - Math.abs(x) / width);
      pos.setZ(i, pos.getZ(i) + bevel + ridge + y * slope + Math.abs(y) * fold);
    }
    // 折板保持分面法线；把折脊与孔壁平均会让整片金属呈现软塌的高光。
    tessellated.computeVertexNormals();
    return tessellated;
  },
  hmt_link: (spec) => {
    if (spec.type !== "kit") throw new Error("HMT 连杆需要 kit 参数");
    const p = spec.params!;
    const from = new THREE.Vector3(...(p.from as [number, number, number]));
    const to = new THREE.Vector3(...(p.to as [number, number, number]));
    const delta = to.clone().sub(from);
    const g = new THREE.CylinderGeometry(Number(p.radius), Number(p.radius), delta.length(), 24);
    g.applyQuaternion(
      new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()),
    );
    g.translate(...from.add(to).multiplyScalar(0.5).toArray());
    return g;
  },
  hmt_spring: (spec) => {
    if (spec.type !== "kit") throw new Error("HMT 弹簧需要 kit 参数");
    const p = spec.params!;
    const turns = Number(p.turns);
    const radius = Number(p.radius);
    const height = Number(p.height);
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= turns * 24; i++) {
      const t = i / (turns * 24);
      pts.push(
        new THREE.Vector3(
          Math.cos(t * turns * Math.PI * 2) * radius,
          (t - 0.5) * height,
          Math.sin(t * turns * Math.PI * 2) * radius,
        ),
      );
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const tube = new THREE.TubeGeometry(curve, turns * 24, Number(p.wire), 6, false);
    // 端部封帽使独立弹簧也是封闭实体。
    const caps = [0, 1].map((t) => {
      const cap = new THREE.CircleGeometry(Number(p.wire), 6);
      const tangent = curve.getTangent(t).multiplyScalar(t === 0 ? -1 : 1);
      cap.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), tangent));
      cap.translate(...curve.getPoint(t).toArray());
      return cap;
    });
    const merged = mergeGeometries([tube, ...caps]);
    tube.dispose();
    caps.forEach((g) => g.dispose());
    return merged;
  },
  hmt_loft: (spec) => {
    if (spec.type !== "kit") throw new Error("HMT 放样需要 kit 参数");
    const sections = spec.params!.sections as number[][];
    const segments = 32;
    const vertices: number[] = [];
    const indices: number[] = [];
    for (const [y, rx, rz, cz] of sections) {
      for (let j = 0; j < segments; j++) {
        const a = (j / segments) * Math.PI * 2;
        vertices.push(rx * Math.sin(a), y, cz + rz * Math.cos(a));
      }
    }
    for (let i = 0; i < sections.length - 1; i++) {
      for (let j = 0; j < segments; j++) {
        const a = i * segments + j,
          b = i * segments + ((j + 1) % segments);
        indices.push(a, b, a + segments, b, b + segments, a + segments);
      }
    }
    for (const end of [0, sections.length - 1]) {
      const [y, , , z] = sections[end];
      const center = vertices.length / 3;
      vertices.push(0, y, z);
      for (let j = 0; j < segments; j++) {
        const a = end * segments + j,
          b = end * segments + ((j + 1) % segments);
        if (end === 0) indices.push(center, b, a);
        else indices.push(center, a, b);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(Array((vertices.length / 3) * 2).fill(0), 2));
    g.setIndex(indices);
    g.computeVertexNormals();
    return g;
  },
};
