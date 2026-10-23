import * as THREE from "three";

// Z 主干只画一条朝向相机的光带。横向透明度连续衰减，避免实体管的硬轮廓和面片感。
export function createRayMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      tint: { value: new THREE.Color(0xff4930) },
      power: { value: 0 },
      flowTime: { value: 0 },
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.NormalBlending,
    toneMapped: false,
    vertexShader: `
      attribute vec3 beamCenter;
      attribute vec3 beamTangent;
      attribute float beamRadius;
      attribute vec2 beamUv;
      varying vec2 vBeam;
      void main() {
        vec4 center = modelViewMatrix * vec4(beamCenter, 1.0);
        vec3 tangent = mat3(modelViewMatrix) * beamTangent;
        vec2 side = vec2(-tangent.y, tangent.x);
        // 正对光束时投影切线接近零，固定退化方向，避免 NaN 或整条消失。
        side = length(side) > 0.0001 ? normalize(side) : vec2(1.0, 0.0);
        center.xy += side * beamUv.y * beamRadius * 2.7;
        gl_Position = projectionMatrix * center;
        vBeam = beamUv;
      }
    `,
    // [OM-FREEPLAY] 窄亮芯与宽淡晕共用同一像素着色，不叠多条 Z、不提高全局 bloom。
    fragmentShader: `
      uniform vec3 tint;
      uniform float power;
      uniform float flowTime;
      varying vec2 vBeam;
      void main() {
        float edge = abs(vBeam.y);
        float halo = exp(-5.0 * edge * edge) * (1.0 - smoothstep(0.65, 1.0, edge));
        float core = exp(-16.0 * edge * edge);
        // 相位沿根部到尖端前移，保留最低连续亮度，不把 Z 切成虚线。
        float packet = pow(0.5 + 0.5 * sin(vBeam.x * 88.0 - flowTime * 11.0), 3.0);
        float grain = 0.94 + 0.06 * sin(vBeam.x * 751.0 - flowTime * 23.0 + vBeam.y * 9.0);
        float alpha = power * (0.28 * halo + 0.72 * core) * (0.72 + 0.28 * packet) * grain;
        vec3 light = mix(tint, vec3(1.0), core * (0.08 + 0.12 * packet));
        gl_FragColor = vec4(light, alpha);
        #include <colorspace_fragment>
      }
    `,
  });
}
