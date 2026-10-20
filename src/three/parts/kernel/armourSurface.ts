import * as THREE from "three";

// ============================================================================
// kernel/armourSurface —— 虎式 L5 表面层（防磁涂层 / 迷彩 / 战场痕迹）
//
// 全部走着色器：不动主体几何（红线），也不依赖 UV —— 图案按世界坐标算，
// 跨板连续（每块装甲板 UV 各拉 0..1，贴图会在板缝处错位）。
//
//   · Zimmerit：竖向手抹棱，沿 X 变化、沿 Y/Z 缓慢摆动，法线按高度场梯度扰动；
//   · 迷彩：两组低频噪声阈值出「绿 / 棕」不规则条纹，覆盖约 35%；
//   · 战场痕迹：下缘泥浆带、稀疏锈斑、发动机舱后段熏黑（都按世界坐标 + 噪声）。
// ============================================================================

export interface ArmourSurfaceOptions {
  zimmerit: boolean;
  camo: boolean;
  grime: boolean;
}

const VERTEX_HEAD = /* glsl */ `
varying vec3 vArmourWorld;
`;

const VERTEX_BODY = /* glsl */ `
  {
    vec4 armourWorld = vec4(transformed, 1.0);
    #ifdef USE_INSTANCING
      armourWorld = instanceMatrix * armourWorld;
    #endif
    vArmourWorld = (modelMatrix * armourWorld).xyz;
  }
`;

const FRAGMENT_HEAD = /* glsl */ `
varying vec3 vArmourWorld;
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

    if (zimmerit) {
      fragment = fragment.replace(
        "#include <normal_fragment_maps>",
        /* glsl */ `#include <normal_fragment_maps>
        {
          float ridge = vArmourWorld.x * 68.0
            + 1.15 * sin(vArmourWorld.y * 5.0)
            + 0.85 * sin(vArmourWorld.z * 7.0)
            + 2.2 * armourFbm(vArmourWorld * 2.3);
          float dh = cos(ridge);
          vec3 perturbWorld = vec3(dh, 0.0, 0.4 * cos(ridge * 0.7 + 1.7));
          vec3 perturbView = (viewMatrix * vec4(perturbWorld, 0.0)).xyz;
          normal = normalize(normal + perturbView * 0.17);
        }`,
      );
    }

    if (camo || grime) {
      fragment = fragment.replace(
        "#include <color_fragment>",
        /* glsl */ `#include <color_fragment>
        {
          ${
            camo
              ? `// 迷彩：绿 / 棕两组低频条纹（线性空间色值）
          float camoA = armourFbm(vArmourWorld * vec3(0.55, 0.32, 0.55) + vec3(3.1));
          float camoB = armourFbm(vArmourWorld * vec3(0.42, 0.30, 0.42) + vec3(11.7, 5.3, 2.1));
          float green = smoothstep(0.52, 0.60, camoA) * 0.88;
          float brown = smoothstep(0.55, 0.63, camoB) * (1.0 - green) * 0.8;
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.055, 0.075, 0.026), green);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.105, 0.045, 0.018), brown);`
              : ""
          }
          ${
            grime
              ? `// 战场痕迹：下缘泥浆 / 锈斑 / 车尾熏黑
          float low = 1.0 - smoothstep(-0.55, 0.45, vArmourWorld.y);
          float mudNoise = smoothstep(0.18, 0.72, armourFbm(vArmourWorld * 3.1));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.085, 0.065, 0.042), low * mudNoise * 0.6);
          float rust = smoothstep(0.74, 0.88, armourFbm(vArmourWorld * 11.0))
            * (1.0 - smoothstep(0.1, 0.9, vArmourWorld.y));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.11, 0.035, 0.012), rust * 0.45);
          float sootBand = smoothstep(0.15, 0.55, vArmourWorld.x)
            * (1.0 - smoothstep(0.85, 1.35, vArmourWorld.y))
            * smoothstep(0.25, 0.8, armourFbm(vArmourWorld * 4.0));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.012, 0.012, 0.011), sootBand * 0.35);`
              : ""
          }
        }`,
      );
    }

    shader.fragmentShader = fragment;
  };
  material.customProgramCacheKey = () => `armour-surface-${zimmerit ? 1 : 0}${camo ? 1 : 0}${grime ? 1 : 0}`;
}
