import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useStageStore } from "../state/stageStore";
import { isCarrierInteriorMode } from "./viewpoints";

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
    float collar = smoothstep(1.3, 1.02, hullEdge) * smoothstep(0.9, 1.01, hullEdge);
    float bowFoam = smoothstep(1.0, 0.0, abs(lateral - 0.8)) * smoothstep(1.05, 0.9, abs(longitudinal - 0.92));
    float sternWash = smoothstep(-0.82, -1.0, rel.y / uShip.z) * smoothstep(0.6, 0.0, abs(lateral - 0.7));
    float kelvin = smoothstep(0.16, 0.0, abs(abs(rel.x) - 0.36 * max(0.0, 0.6 - rel.y / uShip.z) * uShip.z));
    kelvin *= smoothstep(0.55, 0.1, abs(lateral)) * smoothstep(-0.2, -0.9, rel.y / uShip.z);
    float shipFoam = clamp(collar * 0.42 + bowFoam * 0.32 + sternWash * 0.34 + kelvin * 0.18, 0.0, 1.0);
    shipFoam *= smoothstep(0.3, 0.7, foamNoise + 0.2);
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

function polarOceanGeometry(rings = 150, segments = 360, radius = 3800): THREE.BufferGeometry {
  const positions: number[] = [0, 0, 0];
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
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);
  const material = useRef<THREE.ShaderMaterial | null>(null);
  const mesh = useRef<THREE.Mesh | null>(null);
  const setUnderwaterActive = useStageStore((state) => state.setUnderwaterActive);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uSunDir: { value: new THREE.Vector3(-0.42, 0.58, 0.31).normalize() },
      uSunColor: { value: new THREE.Color(0xffefd0).multiplyScalar(1.15) },
      uShip: { value: new THREE.Vector4(0, 0, 160, 39) },
      uUnderwater: { value: 0 },
    }),
    [],
  );

  useEffect(() => {
    if (modelId !== "carrier" || !assembled) return;
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
    // 船体世界包围盒 → 尾流坐标（/8 编辑尺度 × presentationScale）。
    assembled.root.updateMatrixWorld(true);
    const center = new THREE.Vector3(0, SEA_LEVEL, 0).applyMatrix4(assembled.root.matrixWorld);
    const size = new THREE.Vector3(40, 0, 9.6).multiplyScalar(7.9);
    (shaderMaterial.uniforms.uShip!.value as THREE.Vector4).set(center.x, center.z, size.x / 2, size.z / 2);
    return () => {
      scene.remove(ocean);
      ocean.geometry.dispose();
      shaderMaterial.dispose();
      material.current = null;
      mesh.current = null;
      useStageStore.getState().setUnderwaterActive(false);
    };
  }, [assembled, modelId, scene, uniforms]);

  useFrame((_state, delta) => {
    const ocean = mesh.current;
    const shaderMaterial = material.current;
    if (!ocean || !shaderMaterial) return;
    const visible = seaOn && !isCarrierInteriorMode(cameraMode);
    ocean.visible = visible;
    if (!visible) {
      shaderMaterial.uniforms.uUnderwater!.value = 0;
      setUnderwaterActive(false);
      return;
    }
    shaderMaterial.uniforms.uTime!.value += Math.min(delta, 0.05);
    // 无穷海面：网格跟着相机水平移动，波的相位以世界坐标计算，所以图案不会跟着滑。
    ocean.position.x = camera.position.x;
    ocean.position.z = camera.position.z;
    ocean.position.y = new THREE.Vector3(0, SEA_LEVEL, 0).applyMatrix4(assembled!.root.matrixWorld).y;
    const underwater = camera.position.y < ocean.position.y - 0.35;
    shaderMaterial.uniforms.uUnderwater!.value = underwater ? 1 : 0;
    setUnderwaterActive(underwater);
  });

  return null;
}
