import * as THREE from "three";
import type { PartDefinition } from "../../registry/types";
import type { GeometryBuilder } from "../../assembler/geometry";

// 参考照片：内缘近直，外上肩内收、下叶外展；黑边包住云斑彩玻璃，没有横向格栅。
const controls = [
  [0.14, 5.08],
  [0.51, 5.08],
  [0.59, 4.96],
  [0.65, 4.79],
  [0.79, 4.62],
  [0.8, 4.36],
  [0.71, 4.04],
  [0.55, 4.08],
  [0.3, 4.22],
  [0.16, 4.34],
];
const center = new THREE.Vector2(0.47, 4.59);
const curve = new THREE.CatmullRomCurve3(
  controls.map(([x, y]) => new THREE.Vector3(x, y, 0)),
  true,
  "centripetal",
);
const edge = curve
  .getPoints(100)
  .slice(0, -1)
  .map((p) => new THREE.Vector2(p.x, p.y));
const front = (x: number) => 0.81 + 0.1 * (1 - (Math.abs(x) / 1.02) ** 2);

function glassColor(x: number, y: number): THREE.Color {
  // [OM-FREEPLAY] 用连续云斑与细颗粒近似参考的虹彩玻璃，固定种子避免每次加载换花纹。
  const blobs = [
    [0.29, 4.91, 0.13, 0.24, 0xf2d64d],
    [0.66, 4.25, 0.18, 0.18, 0xe4d55a],
    [0.7, 4.62, 0.14, 0.19, 0xbd365b],
    [0.23, 4.48, 0.13, 0.16, 0xd84566],
    [0.58, 4.82, 0.15, 0.14, 0x247bba],
    [0.42, 4.23, 0.17, 0.12, 0x38b8c1],
  ];
  const result = new THREE.Color(0x2498aa).multiplyScalar(0.24);
  let total = 0.24;
  for (const [cx, cy, sx, sy, hex] of blobs) {
    const weight = Math.exp(-((x - cx!) ** 2 / sx! ** 2 + (y - cy!) ** 2 / sy! ** 2));
    result.add(new THREE.Color(hex).multiplyScalar(weight));
    total += weight;
  }
  const grain = Math.sin(Math.floor(x * 180) * 127.1 + Math.floor(y * 180) * 311.7) * 43758.5453;
  return result.multiplyScalar((0.82 + 0.25 * (grain - Math.floor(grain))) / total);
}

function windowSolid(side: number, glass: boolean): THREE.BufferGeometry {
  const positions: number[] = [],
    colors: number[] = [],
    indices: number[] = [];
  const n = edge.length,
    layers = glass ? 25 : 12,
    shrink = glass ? 0.8 : 1;
  // 从中心到边缘的同心环，前后共享侧壁；彩窗本身也是封闭实体。
  const add = (p: THREE.Vector2, depth: number) => {
    positions.push(side * p.x, p.y, front(p.x) + depth);
    const color = glass ? glassColor(p.x, p.y) : new THREE.Color(0xffffff);
    colors.push(color.r, color.g, color.b);
  };
  add(center, glass ? 0.03 : 0.016);
  for (let ring = 1; ring <= layers; ring++)
    for (const p of edge) {
      const q = center.clone().lerp(p, (shrink * ring) / layers);
      add(q, glass ? 0.03 : 0.016);
    }
  for (let i = 0; i < n; i++) indices.push(0, 1 + i, 1 + ((i + 1) % n));
  for (let ring = 1; ring < layers; ring++)
    for (let i = 0; i < n; i++) {
      const a = 1 + (ring - 1) * n + i,
        b = 1 + (ring - 1) * n + ((i + 1) % n);
      indices.push(a, a + n, b, b, a + n, b + n);
    }
  const back = positions.length / 3,
    frontIndices = [...indices];
  // 背面同样细分曲率，不能用跨越整块凸面的单个平面扇形冒充贴合面。
  for (let i = 0; i < back; i++) {
    positions.push(positions[3 * i]!, positions[3 * i + 1]!, positions[3 * i + 2]! - (glass ? 0.012 : 0.03));
    colors.push(colors[3 * i]!, colors[3 * i + 1]!, colors[3 * i + 2]!);
  }
  for (let i = 0; i < frontIndices.length; i += 3)
    indices.push(back + frontIndices[i]!, back + frontIndices[i + 2]!, back + frontIndices[i + 1]!);
  for (let i = 0; i < n; i++) {
    const a = 1 + (layers - 1) * n + i,
      b = 1 + (layers - 1) * n + ((i + 1) % n),
      c = back + a,
      d = back + b;
    indices.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  // 控制点为顺时针；左右镜像需要同步反转面绕序。
  if (side > 0)
    for (let i = 0; i < indices.length; i += 3)
      [indices[i + 1], indices[i + 2]] = [indices[i + 2]!, indices[i + 1]!];
  g.setIndex(indices);
  g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return g;
}
export const chestWindowBuilders: Record<string, GeometryBuilder> = {};
export const chestWindowParts: PartDefinition[] = [];
for (const side of [-1, 1])
  for (const glass of [false, true]) {
    const suffix = `${glass ? "glass" : "rim"}_${side < 0 ? "l" : "r"}`,
      kit = `kjWindow_${suffix}`;
    chestWindowBuilders[kit] = () => windowSolid(side, glass);
    chestWindowParts.push({
      id: `kingjoemodules.chest.${suffix}`,
      name_cn: glass ? "虹彩云斑玻璃" : "彩窗圆润黑边",
      name_en: suffix,
      assembly: "chest",
      node: "Module_chest",
      build_layer: glass ? 5 : 4,
      build_order: 21 + chestWindowParts.length,
      geometry: { type: "kit", kit },
      material: glass ? `kjm_glass_${side < 0 ? "l" : "r"}` : "kjm_window_rim",
      mate: { type: "absolute", position: [0, 0, 0] },
    });
  }

// 内层光学总成复用外窗边界与曲率，避免两份轮廓逐渐漂移。
export const chestWindowProfile = { center, edge, front };
