import { MeshStandardMaterial } from "three";
import type { AssembledModel } from "../../assembler/assembler";

// [OM-FREEPLAY] 参照金古桥发光影像的暖黄头灯和虹彩胸窗；周期与强度为本展示台原创。
// 光源写在玻璃材质中，避免外贴球体穿过眼带，底光始终存在。
const clocks = new WeakMap<MeshStandardMaterial, { value: number }>();
export function updateModuleIllumination(model: AssembledModel, seconds: number): void {
  for (const [id, visor, side] of [
    ["ship.visor_glass", true, 0],
    ["chest.glass_l", false, -1],
    ["chest.glass_r", false, 1],
  ] as const) {
    const part = model.getPart(`kingjoemodules.${id}`);
    if (!part) continue;
    const materials = Array.isArray(part.object.material) ? part.object.material : [part.object.material];
    for (const material of materials) {
      if (!(material instanceof MeshStandardMaterial)) continue;
      let clock = clocks.get(material);
      if (!clock) {
        clock = { value: seconds };
        clocks.set(material, clock);
        const uniform = clock;
        material.onBeforeCompile = (shader) => {
          shader.uniforms.kjTime = uniform;
          shader.vertexShader = "varying vec3 kjPosition;\n" + shader.vertexShader;
          shader.vertexShader = shader.vertexShader.replace(
            "#include <begin_vertex>",
            "#include <begin_vertex>\nkjPosition = position;",
          );
          shader.fragmentShader = "uniform float kjTime;\nvarying vec3 kjPosition;\n" + shader.fragmentShader;
          const light = visor
            ? `
            vec2 p = vec2(kjPosition.x, kjPosition.y - 6.195);
            float a = kjTime * 1.35;
            vec2 orbit = vec2(0.205 * cos(a), 0.057 * sin(a));
            float d1 = length((p - orbit) / vec2(0.028, 0.023));
            float d2 = length((p + orbit) / vec2(0.028, 0.023));
            float dots = exp(-d1*d1) + exp(-d2*d2);
            float halo = exp(-d1*d1*0.12) + exp(-d2*d2*0.12);
            totalEmissiveRadiance += vec3(0.30, 0.32, 0.07) + vec3(1.0, 0.78, 0.18) * (dots * 3.2 + halo * 0.32);
          `
            : `
            float wave = 0.5 + 0.5 * sin(kjTime * 2.1 + ${side.toFixed(1)} * 1.3 + kjPosition.y * 3.0);
            totalEmissiveRadiance += diffuseColor.rgb * (0.35 + 2.1 * wave * wave);
          `;
          shader.fragmentShader = shader.fragmentShader.replace(
            "#include <emissivemap_fragment>",
            "#include <emissivemap_fragment>\n" + light,
          );
        };
        material.customProgramCacheKey = () => `kingjoe-optics-${visor ? "visor" : side}`;
        material.needsUpdate = true;
      }
      clock.value = seconds;
    }
  }
}
