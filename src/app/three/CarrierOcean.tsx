import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useStageStore } from "../state/stageStore";
import { shouldShowOcean } from "./oceanVisibility";

// ============================================================================
// CarrierOcean —— 航母专用 GPU 频谱海
//
// 参考 OceanThreejs / WaterThreeJS / Open Water 的做法取一个实时可跑的折中：
//   · JONSWAP/Phillips 风浪谱离散成 12 组深水 Gerstner 涌浪（HSL 近似色散）；
//   · 6 组高频细节波在片元里补碎浪法线，距离衰减避免摩尔纹；
//   · Jacobian/坡度 + 值噪声生成波峰白浪；
//   · 船体周围用解析距离场叠加开尔文尾流、艏浪与艉部翻涌泡沫；
//   · Schlick 菲涅耳 + 天空梯度反射 + GGX 太阳高光 + 次表面青绿色；
//   · 极坐标 LOD 网格跟随相机，近处 1m 级、远处 3.8km 水平线。
// ============================================================================

const SEA_LEVEL = 1.8;
const WIND_ANGLE = 0.62;
const WAVELENGTHS = [220, 152, 104, 71, 49, 34, 23, 16, 11, 7.5, 5.2, 3.4];
const AMPLITUDES = [0.42, 0.33, 0.26, 0.2, 0.15, 0.11, 0.08, 0.058, 0.04, 0.027, 0.018, 0.012];
const DIRECTIONS = [-0.95, -0.8, -0.64, -0.48, -0.3, -0.12, 0.08, 0.24, 0.4, 0.56, 0.72, 0.9];

const WAVE_GLSL = WAVELENGTHS.map((wavelength, index) => {
  const angle = WIND_ANGLE + DIRECTIONS[index]!;
  const x = Math.sin(angle);
  const z = Math.cos(angle);
  return `  vec4(${x.toFixed(5)}, ${z.toFixed(5)}, ${wavelength.toFixed(2)}, ${AMPLITUDES[index]!.toFixed(4)})`;
}).join(",\n");

const vertexShader = /* glsl */ `
  uniform float uTime;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying float vHeight;
  varying float vSlope;
  varying float vDistance;

  const vec4 WAVES[${WAVELENGTHS.length}] = vec4[${WAVELENGTHS.length}](
${WAVE_GLSL}
  );

  void main() {
    vec3 baseWorld = (modelMatrix * vec4(position, 1.0)).xyz;
    vec2 p = baseWorld.xz;
    float height = 0.0;
    vec2 grad = vec2(0.0);
    for (int i = 0; i < ${WAVELENGTHS.length}; i++) {
      vec4 wave = WAVES[i];
      float k = 6.28318530718 / wave.z;
      float c = sqrt(9.81 / k);
      float phase = k * dot(wave.xy, p) - k * c * uTime + float(i) * 1.37;
      height += wave.w * sin(phase);
      grad += wave.w * k * wave.xy * cos(phase);
    }
    vec3 displaced = position;
    displaced.y += height;
    vec4 world = modelMatrix * vec4(displaced, 1.0);
    vWorld = world.xyz;
    vNormalW = normalize(vec3(-grad.x, 1.0, -grad.y));
    vHeight = height;
    vSlope = length(grad);
    vDistance = distance(cameraPosition, world.xyz);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform vec4 uShip; // x,z: center; w: half beam; z: half length
  uniform float uUnderwater;
  uniform float uSail;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying float vHeight;
  varying float vSlope;
  varying float vDistance;

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float valueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float value = 0.0;
    float weight = 0.5;
    for (int i = 0; i < 4; i++) {
      value += valueNoise(p) * weight;
      p = p * 2.03 + vec2(11.7, 5.3);
      weight *= 0.5;
    }
    return value;
  }

  vec3 skyColor(vec3 direction) {
    float y = clamp(direction.y, -0.2, 1.0);
    vec3 horizon = vec3(0.58, 0.65, 0.7);
    vec3 zenith = vec3(0.22, 0.33, 0.44);
    vec3 color = mix(horizon, zenith, pow(clamp(y, 0.0, 1.0), 0.55));
    float sun = pow(max(dot(normalize(direction), uSunDir), 0.0), 600.0);
    color += uSunColor * sun * 0.9;
    return color;
  }

  void main() {
    vec2 p = vWorld.xz;
    // 细碎波：只影响法线，且随距离淡出，避免远处一片噪声。
    float detailFade = 1.0 - smoothstep(260.0, 1500.0, vDistance);
    vec2 detailGrad = vec2(0.0);
    if (detailFade > 0.001) {
      vec2 dirs[6] = vec2[6](
        vec2(0.86, -0.5), vec2(-0.21, 0.98), vec2(0.97, 0.24),
        vec2(-0.7, -0.71), vec2(0.45, 0.89), vec2(-0.94, 0.34)
      );
      float lengths[6] = float[6](3.1, 2.2, 1.55, 1.05, 0.72, 0.48);
      float amps[6] = float[6](0.0045, 0.0032, 0.0022, 0.0015, 0.001, 0.0006);
      for (int i = 0; i < 6; i++) {
        vec2 dir = normalize(dirs[i]);
        float k = 6.28318530718 / lengths[i];
        float c = sqrt(9.81 / k);
        float phase = k * dot(dir, p) - k * c * uTime + float(i) * 2.1;
        detailGrad += amps[i] * k * dir * cos(phase);
      }
      detailGrad *= detailFade;
    }
    vec3 n = normalize(vec3(vNormalW.x - detailGrad.x, vNormalW.y, vNormalW.z - detailGrad.y));
    vec3 view = normalize(cameraPosition - vWorld);
    float facing = clamp(dot(n, view), 0.0, 1.0);
    float fresnel = 0.02 + 0.98 * pow(1.0 - facing, 5.0);

    vec3 reflection = skyColor(reflect(-view, n));
    vec3 deep = vec3(0.005, 0.024, 0.034);
    vec3 shallow = vec3(0.014, 0.08, 0.1);
    vec3 water = mix(deep, shallow, smoothstep(-0.7, 1.5, vHeight));
    // 次表面散射：浪峰朝太阳方向的透光。
    float sss = pow(max(dot(-view, uSunDir), 0.0), 3.5) * smoothstep(0.15, 1.6, vHeight);
    water += vec3(0.02, 0.16, 0.13) * sss * 0.8;

    vec3 halfDir = normalize(uSunDir + view);
    float sunSpec = pow(max(dot(n, halfDir), 0.0), 260.0) * (0.3 + 1.7 * fresnel);
    float sparkle = pow(max(dot(n, halfDir), 0.0), 900.0) * smoothstep(0.4, 0.8, fbm(p * 0.8 + uTime * 0.07)) * 1.6;
    vec3 color = mix(water, reflection, clamp(0.12 + fresnel * 0.78, 0.12, 0.88));
    color += uSunColor * sunSpec * 1.15 + uSunColor * sparkle;

    // 波峰白浪：坡度 + 高度 + 噪声，稀疏分布在浪尖。
    float foamNoise = fbm(p * 0.21 + vec2(uTime * 0.012, -uTime * 0.01));
    float crest = smoothstep(0.19, 0.31, vSlope + (foamNoise - 0.5) * 0.035);
    crest *= smoothstep(0.25, 1.35, vHeight + foamNoise * 0.28) * 0.58;

    // 船体周围泡沫：艏浪、舷侧白边、艉部翻涌和开尔文尾迹。
    vec2 rel = p - uShip.xy;
    float longitudinal = abs(rel.y) / uShip.z;
    float lateral = abs(rel.x) / uShip.w;
    float hullEdge = max(longitudinal, lateral);
    float collar = (1.0 - smoothstep(1.02, 1.3, hullEdge)) * smoothstep(0.9, 1.01, hullEdge);
    float bowFoam = (1.0 - smoothstep(0.0, 1.0, abs(lateral - 0.8))) * (1.0 - smoothstep(0.9, 1.05, abs(longitudinal - 0.92)));
    float sternWash = (1.0 - smoothstep(-1.0, -0.82, rel.y / uShip.z)) * (1.0 - smoothstep(0.0, 0.6, abs(lateral - 0.7)));
    float kelvin = 1.0 - smoothstep(0.0, 0.16, abs(abs(rel.x) - 0.36 * max(0.0, 0.6 - rel.y / uShip.z) * uShip.z));
    kelvin *= (1.0 - smoothstep(0.1, 0.55, abs(lateral))) * (1.0 - smoothstep(-0.9, -0.2, rel.y / uShip.z));
    float shipFoam = clamp(collar * 0.42 + bowFoam * 0.32 + sternWash * 0.34 + kelvin * 0.18, 0.0, 1.0);
    shipFoam *= smoothstep(0.3, 0.7, foamNoise + 0.2);
    // 航行艉迹：船移动时在船后拉出逐渐展宽的泡沫带（uSail 由舰体实际位移驱动）。
    float trailZ = rel.y / uShip.z;
    float trailMask = (1.0 - smoothstep(-1.12, -0.92, trailZ)) * smoothstep(-3.4, -1.2, trailZ);
    float trailWidth = mix(0.1, 0.42, clamp(-trailZ - 1.0, 0.0, 1.0));
    float trailFoam = 1.0 - smoothstep(0.0, trailWidth, abs(rel.x) / uShip.w);
    trailFoam *= uSail * trailMask * (0.55 + 0.45 * fbm(vec2(rel.x * 0.17, rel.y * 0.07) + uTime * 0.12));
    shipFoam = clamp(shipFoam + trailFoam * 0.9, 0.0, 1.0);
    float foam = clamp(crest + shipFoam * 0.8, 0.0, 1.0);
    // 泡沫不是纯白贴片：保留一点海水的青灰，远处不会亮成一条灯带。
    vec3 foamColor = vec3(0.68, 0.76, 0.77);
    color = mix(color, foamColor, foam * 0.8);

    // 远处融进地平线，遮掉网格边缘。
    vec3 horizon = skyColor(normalize(vWorld - cameraPosition));
    float horizonFade = smoothstep(2100.0, 3700.0, vDistance);
    color = mix(color, horizon, horizonFade * 0.9);

    float alpha = mix(0.86, 0.985, fresnel);
    alpha = max(alpha, foam * 0.96);
    alpha = mix(alpha, 1.0, horizonFade);
    // 水下仰视：水面从内侧看是深青色半透水墙，不再反射天空。
    if (uUnderwater > 0.5) {
      vec3 underDeep = vec3(0.006, 0.05, 0.075);
      vec3 underShallow = vec3(0.045, 0.23, 0.27);
      vec3 under = mix(underDeep, underShallow, clamp(vHeight * 0.3 + 0.45, 0.0, 1.0));
      under += uSunColor * sunSpec * 0.25 + uSunColor * sparkle * 0.2;
      under = mix(under, foamColor, foam * 0.45);
      color = under;
      alpha = mix(0.9, 1.0, horizonFade);
    }
    gl_FragColor = vec4(color, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/** 艉迹泡沫带：从舰艉向后展开的透明白沫面，跟舰体一起平移；停船淡出。 */
function makeWakeGeometry(halfBeam: number, halfLength: number): THREE.BufferGeometry {
  const rows = 30;
  const length = 420;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= rows; i++) {
    const t = i / rows;
    const z = -halfLength - t * length;
    const w = halfBeam * (0.55 + t * 1.35);
    positions.push(-w, 0, z, w, 0, z);
    uvs.push(0, t, 1, t);
    if (i < rows) {
      const a = i * 2;
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

/** 水下穹顶：从水面往下看不是一块纯色背景，而是上层透光、深处变暗的水体。 */
const underwaterDomeVertex = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const underwaterDomeFragment = /* glsl */ `
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform float uTime;
  varying vec3 vDir;
  void main() {
    float y = vDir.y;
    vec3 deep = vec3(0.008, 0.04, 0.052);
    vec3 mid = vec3(0.02, 0.1, 0.12);
    vec3 upper = vec3(0.06, 0.23, 0.26);
    vec3 color = mix(deep, mid, smoothstep(-0.75, 0.08, y));
    color = mix(color, upper, smoothstep(0.16, 0.9, y));
    float sun = pow(max(dot(normalize(vDir), uSunDir), 0.0), 5.0);
    color += uSunColor * sun * 0.16;
    // 上层水体的缓慢晃动，读起来像有厚度的水，而不是一张贴图。
    float wave = sin(vDir.x * 26.0 + uTime * 0.35) * sin(vDir.z * 21.0 - uTime * 0.28);
    color += upper * wave * 0.016 * smoothstep(0.1, 0.8, y);
    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/** 海床：低对比沙脊/暗礁，远处融进深水；只在相机入水时显示。 */
const seabedVertex = /* glsl */ `
  varying vec3 vWorld;
  varying float vDistance;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vDistance = distance(cameraPosition, world.xyz);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const seabedFragment = /* glsl */ `
  uniform float uTime;
  varying vec3 vWorld;
  varying float vDistance;
  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float valueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0;
    float w = 0.5;
    for (int i = 0; i < 4; i++) {
      v += valueNoise(p) * w;
      p = p * 2.07 + vec2(7.3, 3.1);
      w *= 0.5;
    }
    return v;
  }
  void main() {
    vec2 p = vWorld.xz;
    float broad = fbm(p * 0.012);
    float fine = fbm(p * 0.12 + vec2(uTime * 0.004, 0.0));
    float ripple = 0.5 + 0.5 * sin(p.x * 0.34 + p.y * 0.11 + broad * 9.0);
    vec3 sand = mix(vec3(0.05, 0.07, 0.064), vec3(0.115, 0.132, 0.116), broad);
    vec3 rock = mix(vec3(0.022, 0.036, 0.04), vec3(0.048, 0.06, 0.058), fine);
    vec3 color = mix(rock, sand, smoothstep(0.32, 0.72, broad));
    color *= 0.8 + 0.2 * ripple;
    color += vec3(0.01, 0.025, 0.022) * smoothstep(0.55, 0.95, fine);
    // 水面聚焦下的缓慢焦散，让海床读起来是“在水下”，而不是一块干沙地。
    float caustic = pow(max(0.0, sin(p.x * 0.21 + uTime * 0.32 + broad * 6.0) * sin(p.y * 0.18 - uTime * 0.27)), 6.0);
    color += vec3(0.022, 0.055, 0.05) * caustic * smoothstep(0.1, 0.6, fine);
    // 距离衰减与场景 FogExp2 同密度，让海床、舰体、水体穹顶融成同一片深水。
    float deepFade = clamp(1.0 - exp(-pow(vDistance * 0.01, 2.0)), 0.0, 0.88);
    color = mix(color, vec3(0.004, 0.03, 0.042), deepFade);
    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/** 水下悬浮颗粒（海雪）：跟随相机的近场粒子层，给水下提供尺度与纵深。 */
const marineSnowVertex = /* glsl */ `
  attribute float aSeed;
  uniform float uTime;
  uniform float uPixelRatio;
  varying float vAlpha;
  void main() {
    vec3 p = position;
    float span = 42.0;
    p.y = mod(p.y + uTime * (0.18 + aSeed * 0.22) + span, span) - span * 0.82;
    p.x += sin(uTime * 0.24 + aSeed * 19.7) * 0.9;
    p.z += cos(uTime * 0.2 + aSeed * 27.3) * 0.9;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    float d = max(-mv.z, 0.1);
    gl_PointSize = clamp((0.09 + aSeed * 0.13) * uPixelRatio * 260.0 / d, 1.0, 6.5);
    vAlpha = (1.0 - smoothstep(9.0, 52.0, d)) * smoothstep(0.4, 2.6, d) * (0.22 + aSeed * 0.55);
    gl_Position = projectionMatrix * mv;
  }
`;

const marineSnowFragment = /* glsl */ `
  varying float vAlpha;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    if (length(c) > 0.5) discard;
    float a = (1.0 - smoothstep(0.06, 0.5, length(c))) * vAlpha;
    gl_FragColor = vec4(vec3(0.62, 0.83, 0.86), a * 0.8);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/** 水下光束：从水面斜射进深水的加法光幕，配合悬浮颗粒读出水的体积。 */
const godRayVertex = /* glsl */ `
  varying vec2 vUv;
  varying float vNear;
  void main() {
    vUv = uv;
    vec3 origin = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    vNear = smoothstep(6.0, 18.0, distance(cameraPosition, origin));
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const godRayFragment = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv;
  varying float vNear;
  void main() {
    float edge = smoothstep(0.0, 0.3, vUv.x) * (1.0 - smoothstep(0.7, 1.0, vUv.x));
    float depth = pow(vUv.y, 2.1) * smoothstep(0.0, 0.14, vUv.y);
    float bands = 0.5 + 0.5 * sin(vUv.x * 21.0 + uTime * 0.32) * sin(vUv.x * 9.0 - uTime * 0.21);
    float shimmer = 0.72 + 0.28 * sin(vUv.y * 16.0 - uTime * 0.27);
    float alpha = edge * depth * (0.07 + 0.11 * bands * shimmer) * vNear;
    gl_FragColor = vec4(vec3(0.46, 0.74, 0.76), alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function makeGodRayGeometry(): THREE.PlaneGeometry {
  const geometry = new THREE.PlaneGeometry(1, 1);
  geometry.translate(0, -0.5, 0);
  return geometry;
}

function makeMarineSnowGeometry(count = 3200): THREE.BufferGeometry {
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 92;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 42;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 92;
    seeds[i] = Math.random();
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

const wakeVertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const wakeFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uSail;
  varying vec2 vUv;
  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float valueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0;
    float w = 0.5;
    for (int i = 0; i < 3; i++) {
      v += valueNoise(p) * w;
      p = p * 2.03 + vec2(9.7, 4.3);
      w *= 0.5;
    }
    return v;
  }
  void main() {
    float across = abs(vUv.x * 2.0 - 1.0);
    float edge = 1.0 - smoothstep(0.55, 1.0, across);
    float fade = smoothstep(0.0, 0.05, vUv.y) * (1.0 - smoothstep(0.55, 1.0, vUv.y));
    float n = fbm(vec2(vUv.x * 9.0, vUv.y * 18.0 - uTime * 0.55));
    float center = 1.0 - smoothstep(0.0, 0.55, across);
    float alpha = edge * fade * uSail * (0.18 + 0.42 * n);
    alpha += center * fade * uSail * (0.1 + 0.16 * n);
    gl_FragColor = vec4(vec3(0.83, 0.9, 0.92), clamp(alpha, 0.0, 0.62));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function polarOceanGeometry(rings = 150, segments = 360, radius = 3800): THREE.BufferGeometry {  const positions: number[] = [0, 0, 0];
  const indices: number[] = [];
  const ringStride = segments;
  for (let r = 1; r <= rings; r++) {
    const t = r / rings;
    const distance = 0.6 + radius * Math.pow(t, 3.15);
    for (let s = 0; s < segments; s++) {
      const angle = (s / segments) * Math.PI * 2;
      positions.push(Math.cos(angle) * distance, 0, Math.sin(angle) * distance);
    }
  }
  const center = 0;
  const first = 1;
  for (let s = 0; s < segments; s++) {
    indices.push(center, first + ((s + 1) % segments), first + s);
  }
  for (let r = 1; r < rings; r++) {
    const inner = 1 + (r - 1) * ringStride;
    const outer = 1 + r * ringStride;
    for (let s = 0; s < segments; s++) {
      const next = (s + 1) % segments;
      // 从上方看逆时针；配合 FrontSide。
      indices.push(inner + s, outer + next, outer + s);
      indices.push(inner + s, inner + next, outer + next);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

export function CarrierOcean() {
  const modelId = useStageStore((state) => state.modelId);
  const assembled = useStageStore((state) => state.assembled);
  const cameraMode = useStageStore((state) => state.cameraMode);
  const seaOn = useStageStore((state) => state.views.sea);
  const walkArea = useStageStore((state) => state.walkArea);
  const cockpitActive = useStageStore((state) => Boolean(state.cockpit?.active));
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);
  const material = useRef<THREE.ShaderMaterial | null>(null);
  const mesh = useRef<THREE.Mesh | null>(null);
  const wakeMesh = useRef<THREE.Mesh | null>(null);
  const wakeMaterial = useRef<THREE.ShaderMaterial | null>(null);
  const domeMesh = useRef<THREE.Mesh | null>(null);
  const domeMaterial = useRef<THREE.ShaderMaterial | null>(null);
  const seabedMesh = useRef<THREE.Mesh | null>(null);
  const seabedMaterial = useRef<THREE.ShaderMaterial | null>(null);
  const snowPoints = useRef<THREE.Points | null>(null);
  const snowMaterial = useRef<THREE.ShaderMaterial | null>(null);
  const rayGroup = useRef<THREE.Group | null>(null);
  const rayMaterial = useRef<THREE.ShaderMaterial | null>(null);
  const raySeeds = useRef<{ x: number; z: number; width: number; height: number; tilt: number }[]>([]);
  const wakeStrength = useRef(0);
  const lastShip = useRef(new THREE.Vector3(Number.NaN, 0, Number.NaN));
  const cameraLocal = useRef(new THREE.Vector3());
  const setUnderwaterActive = useStageStore((state) => state.setUnderwaterActive);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uSunDir: { value: new THREE.Vector3(-0.42, 0.58, 0.31).normalize() },
      uSunColor: { value: new THREE.Color(0xffefd0).multiplyScalar(1.15) },
      uShip: { value: new THREE.Vector4(0, 0, 160, 39) },
      uUnderwater: { value: 0 },
      uSail: { value: 0 },
    }),
    [],
  );

  useEffect(() => {
    if ((modelId !== "carrier" && modelId !== "type055") || !assembled) return;
    const shaderMaterial = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms,
      transparent: true,
      depthWrite: true,
      side: THREE.DoubleSide,
      toneMapped: true,
    });
    material.current = shaderMaterial;
    const ocean = new THREE.Mesh(polarOceanGeometry(), shaderMaterial);
    ocean.name = "carrier-ocean-gpu";
    ocean.frustumCulled = false;
    ocean.renderOrder = 1;
    mesh.current = ocean;
    scene.add(ocean);
    lastShip.current.set(Number.NaN, 0, Number.NaN);
    wakeStrength.current = 0;
    const isCarrier = modelId === "carrier";
    const halfBeam = isCarrier ? 4.8 * 7.9 : 10;
    const halfLength = isCarrier ? 20.35 * 7.9 : 90;
    const wakeShader = new THREE.ShaderMaterial({
      vertexShader: wakeVertexShader,
      fragmentShader: wakeFragmentShader,
      uniforms: { uTime: { value: 0 }, uSail: { value: 0 } },
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      toneMapped: true,
    });
    const wake = new THREE.Mesh(makeWakeGeometry(halfBeam, halfLength), wakeShader);
    wake.name = "carrier-wake-gpu";
    wake.frustumCulled = false;
    wake.renderOrder = 2;
    wakeMaterial.current = wakeShader;
    wakeMesh.current = wake;
    scene.add(wake);

    const domeShader = new THREE.ShaderMaterial({
      vertexShader: underwaterDomeVertex,
      fragmentShader: underwaterDomeFragment,
      uniforms: {
        uSunDir: uniforms.uSunDir,
        uSunColor: uniforms.uSunColor,
        uTime: { value: 0 },
      },
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      toneMapped: true,
    });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(900, 24, 16), domeShader);
    dome.name = "carrier-underwater-dome";
    dome.frustumCulled = false;
    dome.renderOrder = -10;
    dome.visible = false;
    domeMaterial.current = domeShader;
    domeMesh.current = dome;
    scene.add(dome);

    const seabedShader = new THREE.ShaderMaterial({
      vertexShader: seabedVertex,
      fragmentShader: seabedFragment,
      uniforms: { uTime: { value: 0 } },
      side: THREE.FrontSide,
      toneMapped: true,
    });
    const seabed = new THREE.Mesh(new THREE.CircleGeometry(2400, 64), seabedShader);
    seabed.name = "carrier-seabed";
    seabed.rotation.x = -Math.PI / 2;
    seabed.frustumCulled = false;
    seabed.renderOrder = 0;
    seabed.visible = false;
    seabedMaterial.current = seabedShader;
    seabedMesh.current = seabed;
    scene.add(seabed);

    const snowShader = new THREE.ShaderMaterial({
      vertexShader: marineSnowVertex,
      fragmentShader: marineSnowFragment,
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
      },
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      toneMapped: true,
    });
    const snow = new THREE.Points(makeMarineSnowGeometry(), snowShader);
    snow.name = "carrier-marine-snow";
    snow.frustumCulled = false;
    snow.renderOrder = 3;
    snow.visible = false;
    snowMaterial.current = snowShader;
    snowPoints.current = snow;
    scene.add(snow);

    const rays = new THREE.Group();
    rays.name = "carrier-god-rays";
    rays.visible = false;
    const rayShader = new THREE.ShaderMaterial({
      vertexShader: godRayVertex,
      fragmentShader: godRayFragment,
      uniforms: { uTime: { value: 0 } },
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      toneMapped: true,
    });
    const rayGeometry = makeGodRayGeometry();
    const seeds: { x: number; z: number; width: number; height: number; tilt: number }[] = [];
    for (let i = 0; i < 14; i++) {
      const angle = (i / 14) * Math.PI * 2 + Math.random() * 0.35;
      const radius = 22 + Math.random() * 62;
      const seed = {
        x: Math.cos(angle) * radius,
        z: Math.sin(angle) * radius,
        width: 6 + Math.random() * 10,
        height: 22 + Math.random() * 18,
        tilt: 0.04 + Math.random() * 0.1,
      };
      const ray = new THREE.Mesh(rayGeometry, rayShader);
      ray.frustumCulled = false;
      ray.renderOrder = 4;
      ray.scale.set(seed.width, seed.height, 1);
      rays.add(ray);
      seeds.push(seed);
    }
    rayGroup.current = rays;
    rayMaterial.current = rayShader;
    raySeeds.current = seeds;
    scene.add(rays);

    return () => {
      scene.remove(ocean);
      ocean.geometry.dispose();
      shaderMaterial.dispose();
      scene.remove(wake);
      wake.geometry.dispose();
      wakeShader.dispose();
      scene.remove(dome);
      dome.geometry.dispose();
      domeShader.dispose();
      scene.remove(seabed);
      seabed.geometry.dispose();
      seabedShader.dispose();
      scene.remove(snow);
      snow.geometry.dispose();
      snowShader.dispose();
      scene.remove(rays);
      rayGeometry.dispose();
      rayShader.dispose();
      material.current = null;
      mesh.current = null;
      wakeMesh.current = null;
      wakeMaterial.current = null;
      domeMesh.current = null;
      domeMaterial.current = null;
      seabedMesh.current = null;
      seabedMaterial.current = null;
      snowPoints.current = null;
      snowMaterial.current = null;
      rayGroup.current = null;
      rayMaterial.current = null;
      raySeeds.current = [];
      useStageStore.getState().setUnderwaterActive(false);
    };
  }, [assembled, modelId, scene, uniforms]);

  useFrame((_state, delta) => {
    const ocean = mesh.current;
    const shaderMaterial = material.current;
    const wake = wakeMesh.current;
    const wakeShader = wakeMaterial.current;
    if (!ocean || !shaderMaterial || !assembled) return;
    // 只更新根节点矩阵；船开动时尾流中心必须每帧跟船，不能只在装配时算一次。
    assembled.root.updateWorldMatrix(true, false);
    cameraLocal.current.copy(camera.position);
    assembled.root.worldToLocal(cameraLocal.current);
    const visible = shouldShowOcean({
      modelId,
      seaOn,
      cameraMode,
      walkArea,
      cockpitActive,
      cameraLocal: cameraLocal.current,
    });
    ocean.visible = visible;
    if (wake) wake.visible = visible;
    if (!visible) {
      shaderMaterial.uniforms.uUnderwater!.value = 0;
      shaderMaterial.uniforms.uSail!.value = 0;
      if (wakeShader) wakeShader.uniforms.uSail!.value = 0;
      if (domeMesh.current) domeMesh.current.visible = false;
      if (seabedMesh.current) seabedMesh.current.visible = false;
      if (snowPoints.current) snowPoints.current.visible = false;
      if (rayGroup.current) rayGroup.current.visible = false;
      setUnderwaterActive(false);
      return;
    }
    // 只更新根节点矩阵；船开动时尾流中心必须每帧跟船，不能只在装配时算一次。
    const isCarrier = modelId === "carrier";
    const seaLocalY = isCarrier ? SEA_LEVEL : 6.6;
    const center = new THREE.Vector3(0, seaLocalY, 0).applyMatrix4(assembled.root.matrixWorld);
    const halfBeam = isCarrier ? 4.8 * 7.9 : 10;
    const halfLength = isCarrier ? 20.35 * 7.9 : 90;
    (shaderMaterial.uniforms.uShip!.value as THREE.Vector4).set(center.x, center.z, halfBeam, halfLength);
    let targetSail = 0;
    if (Number.isFinite(lastShip.current.x)) {
      const moved = Math.hypot(center.x - lastShip.current.x, center.z - lastShip.current.z);
      targetSail = Math.min(1, moved / Math.max(delta, 1e-3) / 5);
    }
    wakeStrength.current = Math.max(targetSail, wakeStrength.current - delta * 0.9);
    const sailValue = wakeStrength.current;
    shaderMaterial.uniforms.uSail!.value = sailValue;
    if (wake && wakeShader) {
      wake.position.set(center.x, center.y + 0.05, center.z);
      wake.rotation.y = assembled.root.rotation.y;
      wakeShader.uniforms.uTime!.value += Math.min(delta, 0.05);
      wakeShader.uniforms.uSail!.value = sailValue;
    }
    lastShip.current.set(center.x, center.y, center.z);
    shaderMaterial.uniforms.uTime!.value += Math.min(delta, 0.05);
    // 无穷海面：网格跟着相机水平移动，波的相位以世界坐标计算，所以图案不会跟着滑。
    ocean.position.x = camera.position.x;
    ocean.position.z = camera.position.z;
    ocean.position.y = center.y;
    const underwater = camera.position.y < ocean.position.y - 0.35;
    shaderMaterial.uniforms.uUnderwater!.value = underwater ? 1 : 0;
    setUnderwaterActive(underwater);

    const dome = domeMesh.current;
    const seabed = seabedMesh.current;
    const snow = snowPoints.current;
    if (dome) {
      dome.visible = underwater;
      dome.position.copy(camera.position);
      if (domeMaterial.current) domeMaterial.current.uniforms.uTime!.value += Math.min(delta, 0.05);
    }
    if (seabed) {
      seabed.visible = underwater;
      seabed.position.set(camera.position.x, center.y - 34, camera.position.z);
      if (seabedMaterial.current) seabedMaterial.current.uniforms.uTime!.value += Math.min(delta, 0.05);
    }
    if (snow) {
      snow.visible = underwater;
      snow.position.set(camera.position.x, center.y - 8, camera.position.z);
      if (snowMaterial.current) snowMaterial.current.uniforms.uTime!.value += Math.min(delta, 0.05);
    }
    const rays = rayGroup.current;
    if (rays) {
      rays.visible = underwater;
      if (underwater) {
        const dt = Math.min(delta, 0.05);
        if (rayMaterial.current) rayMaterial.current.uniforms.uTime!.value += dt;
        for (let i = 0; i < rays.children.length; i++) {
          const seed = raySeeds.current[i];
          const ray = rays.children[i];
          if (!seed || !ray) continue;
          const wx = camera.position.x + seed.x;
          const wz = camera.position.z + seed.z;
          ray.position.set(wx, ocean.position.y, wz);
          ray.rotation.y = Math.atan2(camera.position.x - wx, camera.position.z - wz);
          ray.rotation.z = seed.tilt + Math.sin(rayMaterial.current!.uniforms.uTime!.value * 0.12 + i) * 0.02;
        }
      }
    }
  });

  return null;
}
