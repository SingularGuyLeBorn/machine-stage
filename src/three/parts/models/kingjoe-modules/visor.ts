import * as THREE from "three";
import { MeshBVH } from "three-mesh-bvh";
import type { GeometryBuilder } from "../../assembler/geometry";
import type { PartDefinition } from "../../registry/types";

// 剧照：玻璃随头壳后倾，上窄下宽、圆角，浅绿磨砂透光，内部为纵向亮纹。
// [OM-FREEPLAY] 剧照分辨率不足以量取尺寸；以下轮廓按现有头壳比例拟合，亮纹仅作光学近似。
const center = new THREE.Vector3(0, 6.195, 0);
const boundary = new THREE.CatmullRomCurve3(
  [
    [-0.29, 6.09],
    [-0.337, 6.12],
    [-0.31, 6.21],
    [-0.248, 6.285],
    [-0.16, 6.307],
    [0, 6.314],
    [0.16, 6.307],
    [0.248, 6.285],
    [0.31, 6.21],
    [0.337, 6.12],
    [0.29, 6.09],
    [0, 6.086],
  ].map(([x, y]) => new THREE.Vector3(x, y, 0)),
  true,
  "centripetal",
)
  .getPoints(160)
  .slice(0, -1);

function opticalColor(x: number, y: number, radius: number) {
  const v = (y - 6.09) / 0.22;
  const color = new THREE.Color("#477f78").lerp(
    new THREE.Color("#a2cbb3"),
    0.58 * Math.exp(-((x / 0.23) ** 2)) + 0.12 * Math.sin(v * Math.PI),
  );
  let light = 0;
  // 半透磨砂下的纵向光带；有宽窄和亮暗变化，不做黑色百叶或高亮霓虹栅栏。
  for (const [cx, width, intensity] of [
    [-0.245, 0.009, 0.22],
    [-0.171, 0.014, 0.35],
    [-0.092, 0.012, 0.47],
    [-0.015, 0.019, 0.37],
    [0.075, 0.011, 0.42],
    [0.156, 0.014, 0.27],
    [0.232, 0.008, 0.22],
  ]) {
    const bend = 0.009 * Math.sin(v * Math.PI * 1.3 + cx * 8);
    light +=
      intensity *
      Math.exp(-(((x - cx - bend) / width) ** 2)) *
      Math.sin(Math.PI * THREE.MathUtils.clamp(v, 0, 1)) ** 0.55;
  }
  color.lerp(new THREE.Color("#e0ead3"), Math.min(0.72, light));
  const grain = Math.sin(Math.floor(x * 1500) * 127.1 + Math.floor(y * 1500) * 311.7) * 43758.5453;
  return color.multiplyScalar((0.97 + 0.06 * (grain - Math.floor(grain))) * (1 - 0.24 * radius ** 8));
}

// 对现有头壳在 x=±0.34、y=6.08..6.32 的 2806 个射线采样做偶对称曲面拟合。
// 前表面消除源三角网格的折痕；金属框背面仍用真实头壳交点，避免拟合误差造成悬空。
function smoothSurface(x: number, worldY: number) {
  const y = worldY - 6.2;
  return (
    0.580358514 -
    0.537482766 * y -
    2.846785718 * y ** 2 -
    11.328739523 * y ** 3 +
    x ** 2 * (-0.281105383 - 2.694272707 * y + 32.155569576 * y ** 2) -
    4.234116217 * x ** 4
  );
}

export function makeVisorBuilders(headBuilder: GeometryBuilder): Record<string, GeometryBuilder> {
  return Object.fromEntries(
    ["housing", "seal", "glass"].map((kind) => [
      `kjVisor_${kind}`,
      (spec, context) => {
        const source = headBuilder(spec, context);
        const tree = new MeshBVH(source);
        const glass = kind === "glass",
          seal = kind === "seal";
        const rings = glass ? 56 : 24,
          shrink = glass ? 0.88 : seal ? 0.94 : 1;
        const depth = glass ? 0.038 : seal ? 0.032 : 0;
        const thickness = glass ? 0.012 : seal ? 0.006 : 0.032;
        const positions: number[] = [],
          colors: number[] = [],
          indices: number[] = [];
        const rear: number[] = [];
        const add = (p: THREE.Vector3, r: number) => {
          const hit = tree.raycastFirst(
            new THREE.Ray(new THREE.Vector3(p.x, p.y, 2), new THREE.Vector3(0, 0, -1)),
            THREE.DoubleSide,
          );
          if (!hit) throw new Error("眼带轮廓超出头壳安装面");
          const surface = smoothSurface(p.x, p.y);
          positions.push(p.x, p.y, surface + depth + thickness + (glass ? 0.008 * (1 - r * r) : 0));
          rear.push(glass || seal ? surface + depth : hit.point.z - 0.008);
          const c = glass ? opticalColor(p.x, p.y, r) : new THREE.Color(0xffffff);
          colors.push(c.r, c.g, c.b);
        };
        add(center, 0);
        const n = boundary.length;
        for (let ring = 1; ring <= rings; ring++)
          for (const p of boundary) add(center.clone().lerp(p, (shrink * ring) / rings), ring / rings);
        for (let i = 0; i < n; i++) indices.push(0, 1 + ((i + 1) % n), 1 + i);
        for (let ring = 1; ring < rings; ring++)
          for (let i = 0; i < n; i++) {
            const a = 1 + (ring - 1) * n + i,
              b = 1 + (ring - 1) * n + ((i + 1) % n);
            indices.push(a, b, a + n, b, b + n, a + n);
          }
        const back = positions.length / 3,
          frontIndices = [...indices];
        // 框背贴真实头壳，玻璃与密封层共用拟合曲面；各层都有细分背面和封闭侧壁。
        for (let i = 0; i < back; i++) {
          positions.push(positions[3 * i], positions[3 * i + 1], rear[i]);
          colors.push(colors[3 * i], colors[3 * i + 1], colors[3 * i + 2]);
        }
        for (let i = 0; i < frontIndices.length; i += 3)
          indices.push(back + frontIndices[i], back + frontIndices[i + 2], back + frontIndices[i + 1]);
        for (let i = 0; i < n; i++) {
          const a = 1 + (rings - 1) * n + i,
            b = 1 + (rings - 1) * n + ((i + 1) % n);
          indices.push(a, b, back + a, b, back + b, back + a);
        }
        source.dispose();
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
        geometry.setIndex(indices);
        geometry.computeVertexNormals();
        return geometry;
      },
    ]),
  );
}

export const visorParts: PartDefinition[] = ["housing", "seal", "glass"].map((kind, i) => ({
  id: `kingjoemodules.ship.visor_${kind}`,
  name_cn: ["眼带贴壳金属边框", "眼带薄密封边", "浅绿磨砂眼带玻璃"][i],
  name_en: `visor ${kind}`,
  assembly: "head_arms",
  node: "Module_head_arms",
  build_layer: ([4, 5, 5] as const)[i],
  build_order: 14 + i,
  geometry: { type: "kit", kit: `kjVisor_${kind}` },
  material: ["kjr_silver", "kjm_visor_seal", "kjm_visor_glass"][i],
  mate: { type: "absolute", position: [0, 0, 0] },
}));
