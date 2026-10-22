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
            float cellId = cell.y * ${VISOR_GRID.columns}.0 + cell.x;
            float glow = 0.0;
            for(int i=0;i<6;i++) {
              float weight = (i==0 || i==3) ? 1.0 : (i==1 || i==4) ? 0.38 : 0.16;
              glow += (1.0-step(0.5,abs(cellId-kjCells[i]))) * weight;
            }
            // 暗格仍可辨认，格间暗缝始终固定；边缘轻微柔化，不再加自由漂移的亮点。
            diffuseColor.rgb *= 0.2 + inside * block * 0.6;
            totalEmissiveRadiance = vec3(0.016,0.023,0.012) + inside * block * (vec3(0.16,0.20,0.065) + vec3(1.0,0.78,0.18) * glow * (1.8+kjPower));
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
        material.customProgramCacheKey = () => `kingjoe-optics-${visor ? "visor-grid-v2" : side}`;
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
