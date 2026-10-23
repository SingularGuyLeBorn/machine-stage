// 随形硬骨架保留贴壁轮廓，短连接区替换为真实闭合褶皱；柔动在端面处归零。
import * as THREE from "three";
import type { GeometryBuilder } from "../../assembler/geometry";
import type { AssembledModel } from "../../assembler/assembler";
import frame from "./flex-frame.generated.json";

export const flexibleFrame = new Map(frame.pieces.map((piece) => [piece.key, piece]));
export function flexProfile(at: number, zones: { center: number; width: number }[]): [number, number] {
  const zone = zones.find((z) => Math.abs(at - z.center) <= z.width / 2 + 1e-6);
  if (!zone) return [0, 0];
  const u = THREE.MathUtils.clamp((at - zone.center) / zone.width + 0.5, 0, 1);
  return [Math.sin(Math.PI * u) ** 2, (Math.PI * Math.sin(2 * Math.PI * u)) / zone.width];
}

export const flexFrameBuilders: Record<string, GeometryBuilder> = {};
for (const [index, piece] of frame.pieces.entries()) {
  for (const kind of ["rigid", "soft"] as const) {
    const key = kind === "rigid" ? `kjModule_${piece.key}` : `kjFlex_${piece.key}`;
    flexFrameBuilders[key] = () => {
      const decode = (value: string) => Uint8Array.from(atob(value), (c) => c.charCodeAt(0)).buffer;
      const geometry = new THREE.BufferGeometry();
      const vertices = new THREE.BufferAttribute(new Float32Array(decode(piece[kind].position)), 3);
      geometry.setAttribute("position", vertices);
      geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(decode(piece[kind].index)), 1));
      geometry.computeVertexNormals();
      if (kind === "soft") {
        const profile = [],
          axis = [],
          thin = [];
        for (let i = 0; i < vertices.count; i++) {
          profile.push(...flexProfile(vertices.array[i * 3 + piece.axis], piece.zones), index * 0.7);
          for (let j = 0; j < 3; j++) {
            axis.push(j === piece.axis ? 1 : 0);
            thin.push(j === piece.thin ? 1 : 0);
          }
        }
        geometry.setAttribute("flexProfile", new THREE.Float32BufferAttribute(profile, 3));
        geometry.setAttribute("flexAxis", new THREE.Float32BufferAttribute(axis, 3));
        geometry.setAttribute("flexThin", new THREE.Float32BufferAttribute(thin, 3));
      }
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      return geometry;
    };
  }
}

const clocks = new WeakMap<AssembledModel, { value: number }>();
export function updateFlexibleFrame(model: AssembledModel, seconds: number): void {
  let clock = clocks.get(model);
  if (!clock) {
    clock = { value: seconds };
    clocks.set(model, clock);
    const materials = new Set(
      model.parts
        .filter((p) => p.def.tags?.includes("flex-frame"))
        .map((p) => p.object.material as THREE.MeshStandardMaterial),
    );
    for (const material of materials) {
      const time = clock;
      material.onBeforeCompile = (shader) => {
        shader.uniforms.flexTime = time;
        shader.vertexShader =
          "uniform float flexTime; attribute vec3 flexProfile; attribute vec3 flexAxis; attribute vec3 flexThin;\n" +
          shader.vertexShader;
        // [OM-FREEPLAY] 1mm 的端部锁定柔动仅表达材料感，不是承力或软体物理求解。
        shader.vertexShader = shader.vertexShader.replace(
          "#include <beginnormal_vertex>",
          `#include <beginnormal_vertex>
           float flexWave=0.001*sin(flexTime*1.1+flexProfile.z);
           objectNormal-=flexAxis*(flexWave*flexProfile.y*dot(objectNormal,flexThin));`,
        );
        shader.vertexShader = shader.vertexShader.replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
           transformed+=flexThin*(flexWave*flexProfile.x);`,
        );
      };
      material.customProgramCacheKey = () => "pedan-flex-frame-v1";
      material.needsUpdate = true;
    }
  }
  clock.value = seconds;
}
