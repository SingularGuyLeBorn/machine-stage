import * as THREE from "three";

// ============================================================================
// kernel/armourSurface —— 虎式 L5 表面层（防磁涂层 / 迷彩 / 战场痕迹）
//
// 全部走着色器：不动主体几何（红线），也不依赖 UV —— 图案按世界坐标算，
// 跨板连续（每块装甲板 UV 各拉 0..1，贴图会在板缝处错位）。
//
//   · Zimmerit：只作用于竖直面（车顶/顶盖不涂），竖向手抹棱沿「水平切线」排布，
//     法线按高度场梯度扰动；棱线用低频噪声摆动，避免机器般的等距条纹；
//   · 迷彩：两组高频噪声阈值出「暗绿 / 红棕」细碎条纹，边界用细噪声打碎并留软边；
//   · 战场痕迹：下缘泥浆、锈斑、车尾熏黑、朝上面浮尘；粗糙度随磨损/泥浆变化。
//
// 法线不能用固定世界 X：前甲板（法线 X）会因此在整面上一成不变。这里按
// cross(up, normal) 取每个面的水平切线，侧甲/前甲都得到正确的竖向棱线。
// ============================================================================

export interface ArmourSurfaceOptions {
  zimmerit: boolean;
  camo: boolean;
  grime: boolean;
}

const VERTEX_HEAD = /* glsl */ `
varying vec3 vArmourWorld;
varying vec3 vArmourNormal;
`;

const VERTEX_BODY = /* glsl */ `
  {
    vec4 armourWorld = vec4(transformed, 1.0);
    vec3 armourNormal = normal;
    #ifdef USE_INSTANCING
      armourWorld = instanceMatrix * armourWorld;
      armourNormal = mat3(instanceMatrix) * armourNormal;
    #endif
    vArmourWorld = (modelMatrix * armourWorld).xyz;
    vArmourNormal = normalize(mat3(modelMatrix) * armourNormal);
  }
`;

const FRAGMENT_HEAD = /* glsl */ `
varying vec3 vArmourWorld;
varying vec3 vArmourNormal;
float armourHash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.11, 0.17, 0.23));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float armourNoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(armourHash(i), armourHash(i + vec3(1, 0, 0)), f.x),
        mix(armourHash(i + vec3(0, 1, 0)), armourHash(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(armourHash(i + vec3(0, 0, 1)), armourHash(i + vec3(1, 0, 1)), f.x),
        mix(armourHash(i + vec3(0, 1, 1)), armourHash(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}
float armourFbm(vec3 p) {
  return 0.55 * armourNoise(p) + 0.28 * armourNoise(p * 2.03 + 7.1) + 0.17 * armourNoise(p * 4.01 + 3.7);
}
`;

export function applyArmourSurface(
  material: THREE.MeshStandardMaterial,
  options: ArmourSurfaceOptions,
): void {
  const { zimmerit, camo, grime } = options;
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${VERTEX_HEAD}`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>\n${VERTEX_BODY}`);

    let fragment = shader.fragmentShader.replace(
      "#include <common>",
      `#include <common>\n${FRAGMENT_HEAD}`,
    );

    // 竖直面掩码：1 = 侧甲/前甲/尾板；0 = 顶盖/甲板/底甲
    const verticalMask = `float armourVertical = 1.0 - smoothstep(0.45, 0.85, abs(vArmourNormal.y));`;

    if (zimmerit) {
      fragment = fragment.replace(
        "#include <normal_fragment_maps>",
        /* glsl */ `#include <normal_fragment_maps>
        {
          ${verticalMask}
          // 每个面的水平切线：侧甲沿 X、前甲沿 Z，顶面不涂防磁
          vec3 armourHorizontal = abs(vArmourNormal.x) > 0.55 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
          float armourCoord = dot(vArmourWorld.xz, normalize(armourHorizontal.xz));
          float ridge = armourCoord * 72.0
            + 1.35 * sin(vArmourWorld.y * 5.0 + armourFbm(vArmourWorld * 1.3) * 2.2)
            + 1.05 * sin(armourCoord * 3.1 + vArmourWorld.y * 1.7)
            + 2.9 * armourFbm(vArmourWorld * 2.4)
            + 1.1 * armourFbm(vArmourWorld * 0.9 + vec3(3.3));
          float dh = cos(ridge);
          // 顶面法线≈+Y 时 cross(up,normal) 长度为 0，必须给退化面一个确定切线，
          // 否则 normalize(0) = NaN，整块顶盖/壳体会变黑或直接不可见。
          vec3 horizontalAxis = cross(vec3(0.0, 1.0, 0.0), vArmourNormal);
          float horizontalLen = length(horizontalAxis);
          vec3 tangent = horizontalLen > 0.0001
            ? horizontalAxis / horizontalLen
            : vec3(1.0, 0.0, 0.0);
          vec3 perturbWorld = tangent * dh + vec3(0.0, 1.0, 0.0) * 0.35 * cos(ridge * 0.7 + 1.7);
          vec3 perturbView = (viewMatrix * vec4(perturbWorld * armourVertical, 0.0)).xyz;
          normal = normalize(normal + perturbView * 0.62);

          // 手抹涂层的细小表面粗糙（顶面也有，只弱一些）
          float micro = armourFbm(vArmourWorld * 19.0) - 0.5;
          vec3 microView = (viewMatrix * vec4(tangent * micro, 0.0)).xyz;
          normal = normalize(normal + microView * 0.065);
        }`,
      );
    }

    if (camo || grime) {
      fragment = fragment.replace(
        "#include <color_fragment>",
        /* glsl */ `#include <color_fragment>
        {
          ${verticalMask}
          ${
            zimmerit
              ? `// 防磁棱的高度场同时压暗谷底，让凹凸在平光下也可读
          {
            vec3 hAxis = abs(vArmourNormal.x) > 0.55 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
            float coord = dot(vArmourWorld.xz, normalize(hAxis.xz));
            float ridgeH = cos(coord * 72.0
              + 1.35 * sin(vArmourWorld.y * 5.0 + armourFbm(vArmourWorld * 1.3) * 2.2)
              + 1.05 * sin(coord * 3.1 + vArmourWorld.y * 1.7)
              + 2.9 * armourFbm(vArmourWorld * 2.4)
              + 1.1 * armourFbm(vArmourWorld * 0.9 + vec3(3.3)));
            float relief = clamp(ridgeH * 0.5 + 0.5, 0.0, 1.0);
            diffuseColor.rgb *= mix(1.0, 0.80 + 0.26 * relief, armourVertical);
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.024, 0.020, 0.014), (1.0 - relief) * armourVertical * 0.30);
          }`
              : ""
          }
          ${
            camo
              ? `// 迷彩：三组高频噪声 + 细碎条纹/喷绘软边；不再是大块硬边贴纸
          float camoWarp = (armourFbm(vArmourWorld * vec3(8.5, 2.6, 8.0) + vec3(1.7)) - 0.5) * 0.20;
          float camoA = armourFbm(vArmourWorld * vec3(4.6, 1.5, 4.4) + vec3(3.1) + camoWarp);
          float camoB = armourFbm(vArmourWorld * vec3(3.6, 1.2, 5.1) + vec3(11.7, 5.3, 2.1) - camoWarp);
          float camoBreak = (armourFbm(vArmourWorld * 29.0) - 0.5) * 0.095;
          float camoFine = (armourFbm(vArmourWorld * 54.0 + vec3(4.0, 1.3, 8.0)) - 0.5) * 0.075;
          // 喷绘软边：阈值区间拉宽（0.15~0.18），边界上再叠一层细噪声做雾化
          float greenEdge = smoothstep(0.47, 0.65, camoA + camoBreak + camoFine);
          float green = greenEdge * (0.94 - 0.10 * (armourFbm(vArmourWorld * 85.0) - 0.5));
          float brownEdge = smoothstep(0.50, 0.70, camoB + camoBreak - camoFine);
          float brown = brownEdge * (1.0 - green) * 0.92;
          float olive = smoothstep(0.52, 0.72, camoA * 0.68 + camoB * 0.32 + camoBreak * 0.5) * (1.0 - green) * (1.0 - brown) * 0.55;
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.034, 0.050, 0.018), green);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.066, 0.028, 0.012), brown);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.042, 0.040, 0.018), olive);`
              : ""
          }
          ${
            grime
              ? `// 战场痕迹：下缘泥浆/飞溅、锈斑与竖向锈痕、车尾熏黑、朝上面浮尘、
          // 高密度掉漆斑（露出深色金属）——让 v2 的「贴纸感」再压一层
          float up = smoothstep(0.55, 0.90, vArmourNormal.y);
          float low = (1.0 - smoothstep(-0.35, 0.58, vArmourWorld.y)) * armourVertical;
          float mudN = smoothstep(0.22, 0.72, armourFbm(vArmourWorld * 4.1));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.050, 0.040, 0.026), low * mudN * 0.82);
          float splat = low * smoothstep(0.70, 0.87, armourFbm(vArmourWorld * 19.0 + vec3(6.0)));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.038, 0.030, 0.020), splat * 0.55);
          float rust = smoothstep(0.78, 0.91, armourFbm(vArmourWorld * 12.5 + vec3(5.0)))
            * (0.35 + 0.65 * armourVertical) * (1.0 - low * 0.6);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.070, 0.023, 0.008), rust * 0.48);
          float rustStreak = smoothstep(0.80, 0.93, armourFbm(vec3(vArmourWorld.x * 9.0, vArmourWorld.y * 1.7, vArmourWorld.z * 9.0) + vec3(7.0)))
            * (0.35 + 0.65 * armourVertical);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.058, 0.020, 0.007), rustStreak * 0.30);
          float sootBand = smoothstep(0.20, 0.70, vArmourWorld.x)
            * (1.0 - smoothstep(0.80, 1.32, vArmourWorld.y))
            * smoothstep(0.26, 0.76, armourFbm(vArmourWorld * 4.2 + vec3(9.0)));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.010, 0.010, 0.009), sootBand * 0.42);
          float dust = up * smoothstep(0.18, 0.70, armourFbm(vArmourWorld * 2.6 + vec3(2.0)));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.155, 0.130, 0.090), dust * 0.22);
          float chip = smoothstep(0.855, 0.945, armourFbm(vArmourWorld * 27.0 + vec3(3.2, 8.1, 1.4)))
            * (0.35 + 0.65 * max(up, armourVertical));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.048, 0.041, 0.031), chip * 0.62);
          float chipCore = smoothstep(0.91, 0.97, armourFbm(vArmourWorld * 31.0 + vec3(1.2, 4.4, 7.7)));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.020, 0.018, 0.015), chipCore * 0.45);`
              : ""
          }
        }`,
      );
    }

    // 粗糙度随磨损/涂层/泥浆变化：平板不再像一块塑料
    fragment = fragment.replace(
      "#include <roughnessmap_fragment>",
      /* glsl */ `#include <roughnessmap_fragment>
      {
        ${verticalMask}
        float grain = armourFbm(vArmourWorld * 9.0);
        float low = (1.0 - smoothstep(-0.35, 0.58, vArmourWorld.y)) * armourVertical;
        float mudN = smoothstep(0.22, 0.72, armourFbm(vArmourWorld * 4.1));
        float chipR = smoothstep(0.855, 0.945, armourFbm(vArmourWorld * 27.0 + vec3(3.2, 8.1, 1.4)));
        roughnessFactor = clamp(
          roughnessFactor + 0.15 * grain + 0.10 * low * mudN + 0.05 * armourVertical + 0.07 * chipR,
          0.40,
          1.0
        );
      }`,
    );

    shader.fragmentShader = fragment;
  };
  material.customProgramCacheKey = () =>
    `armour-surface-v4-${zimmerit ? 1 : 0}${camo ? 1 : 0}${grime ? 1 : 0}`;
}
