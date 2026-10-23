import * as THREE from "three";

// 内部能量保留注册零件、实例节点、圆环法线与真实双端；只改变光学轮廓。
// 扩宽后的闭合圆管提供软边采样空间，不能把机械承力环也套用这个材质。
const clocks = new WeakMap<THREE.Material, { value: number }>();
export function updateSoftEnergy(material: THREE.MeshStandardMaterial, seconds: number): void {
  let clock = clocks.get(material);
  if (!clock) {
    clock = { value: seconds };
    clocks.set(material, clock);
    const previous = material.onBeforeCompile;
    const previousKey = material.customProgramCacheKey();
    const uniform = clock;
    material.transparent = true;
    material.depthWrite = false;
    material.onBeforeCompile = function (shader, renderer) {
      previous.call(this, shader, renderer);
      shader.uniforms.pedanSoftTime = uniform;
      shader.vertexShader =
        `attribute float energyProgress; varying float vEnergyProgress;\n${shader.vertexShader}`.replace(
          "#include <begin_vertex>",
          "#include <begin_vertex>\nvEnergyProgress = energyProgress;",
        );
      shader.fragmentShader =
        `uniform float pedanSoftTime; varying float vEnergyProgress;\n${shader.fragmentShader}`.replace(
          "#include <opaque_fragment>",
          `
          // 视线与管面法线决定横向距离：中心有芯、边缘衰减；圆环保持自身平面，不整体朝相机转。
          float facing = abs(dot(normal, normalize(vViewPosition)));
          float across2 = max(0.0, 1.0 - facing * facing);
          float core = exp(-12.0 * across2);
          float halo = exp(-3.0 * across2) * smoothstep(0.0, 0.22, facing);
          float packet = pow(0.5 + 0.5 * sin(vEnergyProgress * 25.132741 - pedanSoftTime * 6.0), 3.0);
          // [OM-FREEPLAY] 最高透明度有限、最低载波不断；动感来自亮纹前进，不提升全局辉光。
          diffuseColor.a *= (0.28 * halo + 0.72 * core) * (0.48 + 0.52 * packet) * 0.82;
          outgoingLight = mix(diffuseColor.rgb * 0.9 + totalEmissiveRadiance * 0.25,
            diffuseColor.rgb + vec3(0.12), core * packet * 0.22);
          #include <opaque_fragment>
        `,
        );
    };
    material.customProgramCacheKey = () => `${previousKey}|pedan-soft-energy-v1`;
    material.needsUpdate = true;
  }
  clock.value = seconds;
}

/** 只给能量几何附带归一化流动坐标；环按周向，电流按根部到前端。 */
export function addEnergyProgress(geometry: THREE.BufferGeometry, axis: "x" | "y"): THREE.BufferGeometry {
  const uv = geometry.getAttribute("uv");
  const progress = new Float32Array(uv.count);
  for (let i = 0; i < uv.count; i++) progress[i] = axis === "x" ? uv.getX(i) : uv.getY(i);
  geometry.setAttribute("energyProgress", new THREE.BufferAttribute(progress, 1));
  return geometry;
}
