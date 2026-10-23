import { MeshStandardMaterial } from "three";
import { VISOR_GRID, visorHighlights } from "./visor-grid";
import type { AssembledModel } from "../../assembler/assembler";
import { pedanPower, QUIET_ACTIVITY, type PedanActivity } from "./machinery";

// [OM-FREEPLAY] 参照金古桥发光影像的暖黄头灯和虹彩胸窗；周期与强度为本展示台原创。
// 光源写在玻璃材质中，避免外贴球体穿过眼带，底光始终存在。
const clocks = new WeakMap<
  MeshStandardMaterial,
  { time: { value: number }; power: { value: number }; cells: { value: number[] } }
>();
export function updateModuleIllumination(
  model: AssembledModel,
  seconds: number,
  activity: PedanActivity = QUIET_ACTIVITY,
): void {
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
        clock = { time: { value: seconds }, power: { value: 0 }, cells: { value: visorHighlights(seconds) } };
        clocks.set(material, clock);
        const uniform = clock;
        material.onBeforeCompile = (shader) => {
          shader.uniforms.kjTime = uniform.time;
          shader.uniforms.kjPower = uniform.power;
          shader.uniforms.kjCells = uniform.cells;
          shader.vertexShader = "varying vec3 kjPosition;\n" + shader.vertexShader;
          shader.vertexShader = shader.vertexShader.replace(
            "#include <begin_vertex>",
            "#include <begin_vertex>\nkjPosition = position;",
          );
          shader.fragmentShader =
            "uniform float kjCells[6];\nuniform float kjTime;\nuniform float kjPower;\nvarying vec3 kjPosition;\n" +
            shader.fragmentShader;
          const light = visor
            ? `
            vec2 grid = (vec2(kjPosition.x, kjPosition.y - ${VISOR_GRID.centerY}) / vec2(${VISOR_GRID.width}, ${VISOR_GRID.height}) + 0.5) * vec2(${VISOR_GRID.columns}.0, ${VISOR_GRID.rows}.0);
            vec2 cell = floor(grid);
            vec2 local = abs(fract(grid) - 0.5);
            float block = 1.0 - smoothstep(0.34, 0.47, max(local.x,local.y));
            float inside = step(0.0,grid.x) * step(0.0,grid.y) * (1.0-step(${VISOR_GRID.columns}.0,grid.x)) * (1.0-step(${VISOR_GRID.rows}.0,grid.y));
            float glow = 0.0;
            for(int i=0;i<6;i++) {
              float weight = (i==0 || i==3) ? 1.0 : (i==1 || i==4) ? 0.38 : 0.16;
              vec2 center=vec2(mod(kjCells[i],${VISOR_GRID.columns}.0),floor(kjCells[i]/${VISOR_GRID.columns}.0))+0.5;
              vec2 delta=grid-center;
              // 在固定格子中心发光，但把光散射到相邻区域，近景也不出现清晰方形边框。
              glow += exp(-dot(delta,delta)*3.2)*weight;
            }
            diffuseColor.rgb *= 0.2 + inside * block * 0.012;
            totalEmissiveRadiance = vec3(0.012,0.019,0.012) + inside * vec3(1.0,0.78,0.18) * glow * (1.8+kjPower);

          `
            : `
            // 玻璃与背后的左右调制核心共用功率，不再各自呼吸。
            diffuseColor.rgb *= mix(0.055,1.0,min(1.0,kjPower*3.0));
            totalEmissiveRadiance += diffuseColor.rgb * kjPower * 2.5;
          `;
          shader.fragmentShader = shader.fragmentShader.replace(
            "#include <emissivemap_fragment>",
            "#include <emissivemap_fragment>\n" + light,
          );
        };
        material.customProgramCacheKey = () => `kingjoe-optics-${visor ? "visor-diffused-grid-v3" : side}`;
        material.needsUpdate = true;
      }
      clock.time.value = seconds;
      if (visor) clock.cells.value = visorHighlights(seconds);
      clock.power.value = pedanPower(
        seconds,
        visor ? "brain" : side < 0 ? "modulator_l" : "modulator_r",
        activity,
      );
    }
  }
}
