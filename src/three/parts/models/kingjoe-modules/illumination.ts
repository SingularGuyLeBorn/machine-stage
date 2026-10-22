import { MeshStandardMaterial } from "three";
import type { AssembledModel } from "../../assembler/assembler";
import { pedanPower, QUIET_ACTIVITY, type PedanActivity } from "./machinery";

// [OM-FREEPLAY] 参照金古桥发光影像的暖黄头灯和虹彩胸窗；周期与强度为本展示台原创。
// 光源写在玻璃材质中，避免外贴球体穿过眼带，底光始终存在。
const clocks = new WeakMap<MeshStandardMaterial, { time: { value: number }; power: { value: number } }>();
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
        clock = { time: { value: seconds }, power: { value: 0 } };
        clocks.set(material, clock);
        const uniform = clock;
        material.onBeforeCompile = (shader) => {
          shader.uniforms.kjTime = uniform.time;
          shader.uniforms.kjPower = uniform.power;
          shader.vertexShader = "varying vec3 kjPosition;\n" + shader.vertexShader;
          shader.vertexShader = shader.vertexShader.replace(
            "#include <begin_vertex>",
            "#include <begin_vertex>\nkjPosition = position;",
          );
          shader.fragmentShader =
            "uniform float kjTime;\nuniform float kjPower;\nvarying vec3 kjPosition;\n" +
            shader.fragmentShader;
          const light = visor
            ? `
            vec2 p = vec2(kjPosition.x, kjPosition.y - 6.195);
            float a = kjTime * 1.35;
            float dots = 0.0;
            for(int row=0;row<2;row++) {
              for(int trail=0;trail<3;trail++) {
                float phase=a-float(trail)*0.34+float(row)*3.14159265;
                vec2 center=vec2(0.205*cos(phase), (row==0 ? 0.041 : -0.041)+0.016*sin(phase));
                vec2 q=abs(p-center)/vec2(0.022,0.018);
                float square=1.0-smoothstep(0.55,1.55,max(q.x,q.y));
                dots+=square*(trail==0 ? 1.0 : trail==1 ? 0.38 : 0.16);
              }
            }
            totalEmissiveRadiance += vec3(0.20, 0.23, 0.055) + vec3(1.0, 0.78, 0.18) * dots * (2.5 + kjPower * 1.6);
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
        material.customProgramCacheKey = () => `kingjoe-optics-${visor ? "visor" : side}`;
        material.needsUpdate = true;
      }
      clock.time.value = seconds;
      clock.power.value = pedanPower(
        seconds,
        visor ? "brain" : side < 0 ? "modulator_l" : "modulator_r",
        activity,
      );
    }
  }
}
