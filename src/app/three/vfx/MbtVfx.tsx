import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import type { AssembledModel } from "@/three/parts";
import { useStageStore } from "@/app/state/stageStore";

// ============================================================================
// MbtVfx —— MBT-90 多相爆炸（照片级 flipbook + 烟团/火花/冲击波/点光）
//
// 素材：OpenGameArt "Photo Realistic Explosions" (fscopel, CC-BY 3.0)
//       RedUp / Round Up Blue / Lave Blob 序列帧打包成图集；
//       烟环来自 Kenney Particle Pack (CC0)。见 public/vfx/CREDITS.md。
//
// 事件：era_hit / blowout / detonation / fire / hunter_killer 的炮口焰。
// 旧的手搓球体 fx 在 motion 里已经不再显示，避免叠两层。
// ============================================================================

interface Atlas {
  texture: THREE.Texture;
  cols: number;
  rows: number;
  frames: number;
}

interface Assets {
  fireball: Atlas;
  red: Atlas;
  blue: Atlas;
  smoke: THREE.Texture;
  smokeRing: THREE.Texture;
  flash: THREE.Texture;
  spark: THREE.Texture;
  dispose(): void;
}

interface AtlasLayer {
  kind: "atlas";
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  atlas: Atlas;
  delay: number;
  duration: number;
  from: [number, number, number];
  to: [number, number, number];
  opacity: number;
  spin: number;
  rise: number;
  drift: [number, number, number];
  billboard: boolean;
  align?: THREE.Vector3;
}

interface SimpleLayer {
  kind: "simple";
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  delay: number;
  duration: number;
  from: [number, number, number];
  to: [number, number, number];
  opacity: number;
  spin: number;
  rise: number;
  drift: [number, number, number];
  billboard: boolean;
  align?: THREE.Vector3;
}

type Layer = AtlasLayer | SimpleLayer;

interface SparkState {
  points: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  positions: Float32Array;
  velocities: Float32Array;
  life: Float32Array;
  last: number;
  duration: number;
}

interface LightState {
  light: THREE.PointLight;
  intensity: number;
  duration: number;
}

class Burst {
  start: number;
  readonly position: THREE.Vector3;
  readonly layers: Layer[] = [];
  sparks: SparkState | null = null;
  light: LightState | null = null;
  private group: THREE.Group;

  constructor(group: THREE.Group, position: THREE.Vector3, start: number) {
    this.group = group;
    this.position = position.clone();
    this.start = start;
  }

  addLayer(layer: Layer): void {
    this.group.add(layer.mesh);
    this.layers.push(layer);
  }

  addSparks(sparks: SparkState): void {
    this.group.add(sparks.points);
    this.sparks = sparks;
  }

  addLight(light: LightState): void {
    this.group.add(light.light);
    this.light = light;
  }

  update(time: number, camera: THREE.Camera): boolean {
    const age = time - this.start;
    let alive = false;
    for (const layer of this.layers) {
      const u = (age - layer.delay) / layer.duration;
      if (u < 0) {
        layer.mesh.visible = false;
        alive = true;
        continue;
      }
      if (u >= 1) {
        layer.mesh.visible = false;
        continue;
      }
      alive = true;
      layer.mesh.visible = true;
      const eased = 1 - Math.pow(1 - u, 3);
      const scale = layer.from.map((from, i) => from + (layer.to[i]! - from) * eased) as [
        number,
        number,
        number,
      ];
      layer.mesh.scale.set(scale[0], scale[1], scale[2]);
      layer.mesh.position.set(
        this.position.x + layer.drift[0] * eased,
        this.position.y + layer.drift[1] * eased + layer.rise * eased,
        this.position.z + layer.drift[2] * eased,
      );
      if (layer.align) {
        layer.mesh.quaternion.setFromUnitVectors(FORWARD, layer.align);
      } else if (layer.billboard) {
        layer.mesh.quaternion.copy(camera.quaternion);
        if (layer.spin) layer.mesh.rotateZ(layer.spin * u);
      }
      const fadeIn = Math.min(1, u / 0.08);
      const fadeOut = 1 - smoothstep(0.55, 1, u);
      const alpha = layer.opacity * fadeIn * fadeOut;
      if (layer.kind === "atlas") {
        layer.mesh.material.uniforms.uOpacity!.value = alpha;
        layer.mesh.material.uniforms.uFrame!.value = Math.min(
          layer.atlas.frames - 1,
          Math.floor(u * layer.atlas.frames),
        );
      } else {
        layer.mesh.material.opacity = alpha;
      }
    }

    if (this.sparks) {
      const dt = Math.min(0.05, Math.max(0, time - this.sparks.last));
      this.sparks.last = time;
      const { positions, velocities, life } = this.sparks;
      for (let i = 0; i < life.length; i++) {
        if (life[i]! <= 0) continue;
        life[i] = Math.max(0, life[i]! - dt);
        const k = i * 3;
        velocities[k + 1] = velocities[k + 1]! - 9.8 * dt;
        const drag = Math.max(0, 1 - dt * 0.55);
        velocities[k] = velocities[k]! * drag;
        velocities[k + 1] = velocities[k + 1]! * drag;
        velocities[k + 2] = velocities[k + 2]! * drag;
        positions[k] = positions[k]! + velocities[k]! * dt;
        positions[k + 1] = positions[k + 1]! + velocities[k + 1]! * dt;
        positions[k + 2] = positions[k + 2]! + velocities[k + 2]! * dt;
      }
      this.sparks.points.geometry.getAttribute("position").needsUpdate = true;
      this.sparks.points.material.opacity = Math.max(0, 1 - age / this.sparks.duration);
      if (age < this.sparks.duration) alive = true;
    }

    if (this.light) {
      const u = age / this.light.duration;
      this.light.light.intensity = u >= 1 ? 0 : this.light.intensity * Math.pow(1 - u, 2);
      if (u < 1) alive = true;
    }

    if (age >= 12) return false;
    return alive;
  }

  dispose(): void {
    for (const layer of this.layers) {
      this.group.remove(layer.mesh);
      layer.mesh.geometry.dispose();
      layer.mesh.material.dispose();
    }
    if (this.sparks) {
      this.group.remove(this.sparks.points);
      this.sparks.points.geometry.dispose();
      this.sparks.points.material.dispose();
    }
    if (this.light) {
      this.group.remove(this.light.light);
      this.light.light.dispose();
    }
  }
}

const FORWARD = new THREE.Vector3(0, 0, 1);

function smoothstep(min: number, max: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - min) / (max - min)));
  return t * t * (3 - 2 * t);
}

function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

function canvasTexture(size: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  draw(ctx);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function makeSmokeTexture(): THREE.CanvasTexture {
  return canvasTexture(128, (ctx) => {
    const rand = seeded(13);
    for (let i = 0; i < 38; i++) {
      const x = 24 + rand() * 80;
      const y = 24 + rand() * 80;
      const r = 10 + rand() * 24;
      const puff = ctx.createRadialGradient(x, y, 0, x, y, r);
      puff.addColorStop(0, "rgba(230,228,220,0.2)");
      puff.addColorStop(0.55, "rgba(170,166,158,0.12)");
      puff.addColorStop(1, "rgba(100,96,90,0)");
      ctx.fillStyle = puff;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    ctx.globalCompositeOperation = "destination-in";
    const mask = ctx.createRadialGradient(64, 64, 22, 64, 64, 62);
    mask.addColorStop(0, "rgba(255,255,255,1)");
    mask.addColorStop(0.72, "rgba(255,255,255,0.8)");
    mask.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = mask;
    ctx.fillRect(0, 0, 128, 128);
  });
}

function makeFlashTexture(): THREE.CanvasTexture {
  return canvasTexture(256, (ctx) => {
    const rand = seeded(31);
    const core = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    core.addColorStop(0, "rgba(255,255,255,1)");
    core.addColorStop(0.18, "rgba(255,248,220,1)");
    core.addColorStop(0.45, "rgba(255,200,100,0.65)");
    core.addColorStop(1, "rgba(255,120,20,0)");
    ctx.fillStyle = core;
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2 + rand() * 0.3;
      ctx.save();
      ctx.translate(128, 128);
      ctx.rotate(angle);
      const length = 48 + rand() * 76;
      const ray = ctx.createLinearGradient(0, 0, length, 0);
      ray.addColorStop(0, "rgba(255,250,230,0.9)");
      ray.addColorStop(1, "rgba(255,150,40,0)");
      ctx.fillStyle = ray;
      ctx.beginPath();
      ctx.moveTo(0, -4);
      ctx.lineTo(length, 0);
      ctx.lineTo(0, 4);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  });
}

function makeSparkTexture(): THREE.CanvasTexture {
  return canvasTexture(64, (ctx) => {
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 31);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.25, "rgba(255,235,170,1)");
    gradient.addColorStop(0.6, "rgba(255,150,40,0.75)");
    gradient.addColorStop(1, "rgba(255,80,0,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
  });
}

function atlasMaterial(
  atlas: Atlas,
  tint: [number, number, number],
  alphaMode: boolean,
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: atlas.texture },
      uCols: { value: atlas.cols },
      uRows: { value: atlas.rows },
      uFrame: { value: 0 },
      uOpacity: { value: 0 },
      uTint: { value: new THREE.Color(tint[0], tint[1], tint[2]) },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap;
      uniform float uCols;
      uniform float uRows;
      uniform float uFrame;
      uniform float uOpacity;
      uniform vec3 uTint;
      varying vec2 vUv;
      void main() {
        vec2 cell = vec2(1.0 / uCols, 1.0 / uRows);
        float col = mod(uFrame, uCols);
        float row = floor(uFrame / uCols + 0.00001);
        vec2 uv = (vUv + vec2(col, uRows - 1.0 - row)) * cell;
        vec4 tex = texture2D(uMap, uv);
        vec3 rgb = pow(max(tex.rgb, vec3(0.0)), vec3(2.2)) * uTint;
        ${
          alphaMode
            ? "float lum = max(tex.r, max(tex.g, tex.b)); gl_FragColor = vec4(rgb * uOpacity, clamp(lum, 0.0, 1.0) * uOpacity);"
            : "gl_FragColor = vec4(rgb * uOpacity, tex.a * uOpacity);"
        }
      }
    `,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    blending: alphaMode ? THREE.NormalBlending : THREE.AdditiveBlending,
  });
}

async function loadAssets(): Promise<Assets> {
  const loader = new THREE.TextureLoader();
  const load = async (url: string) => {
    const texture = await loader.loadAsync(url);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    return texture;
  };
  const [red, blue, fireball, smokeRing] = await Promise.all([
    load("/vfx/explosion-red.png"),
    load("/vfx/explosion-blue.png"),
    load("/vfx/explosion-fireball.png"),
    load("/vfx/smoke_ring.png"),
  ]);
  const smoke = makeSmokeTexture();
  const flash = makeFlashTexture();
  const spark = makeSparkTexture();
  return {
    fireball: { texture: fireball, cols: 6, rows: 4, frames: 24 },
    red: { texture: red, cols: 6, rows: 3, frames: 18 },
    blue: { texture: blue, cols: 5, rows: 4, frames: 19 },
    smoke,
    smokeRing,
    flash,
    spark,
    dispose() {
      red.dispose();
      blue.dispose();
      fireball.dispose();
      smokeRing.dispose();
      smoke.dispose();
      flash.dispose();
      spark.dispose();
    },
  };
}

/** 世界坐标：ERA 命中块 / 泄压口 / 炮口。 */
function effectOrigin(
  assembled: AssembledModel,
  kind: "era" | "blowout" | "detonation" | "muzzle",
): { position: THREE.Vector3; normal: THREE.Vector3 } | null {
  assembled.root.updateMatrixWorld(true);
  if (kind === "era") {
    const handle = assembled.getPart("mbt90.hull.era_glacis_casing");
    const index = 12;
    if (handle && handle.instances[index]) {
      const matrix = assembled.instanceMatrix(handle, index, new THREE.Matrix4());
      const position = new THREE.Vector3().setFromMatrixPosition(matrix);
      assembled.root.localToWorld(position);
      const normal = new THREE.Vector3(0, 0.832, 0.554).applyQuaternion(
        assembled.root.getWorldQuaternion(new THREE.Quaternion()),
      );
      return { position, normal };
    }
  }
  if (kind === "blowout" || kind === "detonation") {
    const handle = assembled.getPart(
      kind === "detonation" ? "mbt90.interior.detonation_fire" : "mbt90.interior.blowout_fire",
    );
    if (handle) {
      return { position: handle.object.getWorldPosition(new THREE.Vector3()), normal: new THREE.Vector3(0, 1, 0) };
    }
  }
  const muzzle = assembled.getPart("mbt90.interior.muzzle_flash");
  if (muzzle) {
    return {
      position: muzzle.object.getWorldPosition(new THREE.Vector3()),
      normal: new THREE.Vector3(0, 0, 1).applyQuaternion(muzzle.object.getWorldQuaternion(new THREE.Quaternion())),
    };
  }
  return null;
}

function makeSparks(
  assets: Assets,
  position: THREE.Vector3,
  count: number,
  speed: number,
  start: number,
  size: number,
): SparkState {
  const positions = new Float32Array(count * 3);
  const velocities = new Float32Array(count * 3);
  const life = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const k = i * 3;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const s = speed * (0.25 + Math.random() * 0.9);
    positions[k] = position.x;
    positions[k + 1] = position.y;
    positions[k + 2] = position.z;
    velocities[k] = Math.sin(phi) * Math.cos(theta) * s;
    velocities[k + 1] = Math.abs(Math.cos(phi)) * s * 0.9 + 0.8;
    velocities[k + 2] = Math.sin(phi) * Math.sin(theta) * s;
    life[i] = 0.45 + Math.random() * 0.95;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    size,
    map: assets.spark,
    color: 0xffb060,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });
  const points = new THREE.Points(geometry, material);
  return { points, positions, velocities, life, last: start, duration: 1.5 };
}

function addAtlasLayer(
  burst: Burst,
  atlas: Atlas,
  tint: [number, number, number],
  options: {
    delay?: number;
    duration: number;
    from: [number, number, number];
    to: [number, number, number];
    opacity: number;
    spin?: number;
    rise?: number;
    drift?: [number, number, number];
    billboard?: boolean;
    alpha?: boolean;
  },
): void {
  const material = atlasMaterial(atlas, tint, options.alpha ?? false);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
  mesh.renderOrder = 60;
  mesh.frustumCulled = false;
  burst.addLayer({
    kind: "atlas",
    mesh,
    atlas,
    delay: options.delay ?? 0,
    duration: options.duration,
    from: options.from,
    to: options.to,
    opacity: options.opacity,
    spin: options.spin ?? 0,
    rise: options.rise ?? 0,
    drift: options.drift ?? [0, 0, 0],
    billboard: options.billboard ?? true,
  });
}

function addSimpleLayer(
  burst: Burst,
  texture: THREE.Texture,
  color: number,
  blending: THREE.Blending,
  options: {
    delay?: number;
    duration: number;
    from: [number, number, number];
    to: [number, number, number];
    opacity: number;
    spin?: number;
    rise?: number;
    drift?: [number, number, number];
    billboard?: boolean;
    align?: THREE.Vector3;
  },
): void {
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    color,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
  mesh.renderOrder = 59;
  mesh.frustumCulled = false;
  burst.addLayer({
    kind: "simple",
    mesh,
    delay: options.delay ?? 0,
    duration: options.duration,
    from: options.from,
    to: options.to,
    opacity: options.opacity,
    spin: options.spin ?? 0,
    rise: options.rise ?? 0,
    drift: options.drift ?? [0, 0, 0],
    billboard: options.billboard ?? true,
    align: options.align,
  });
}

function buildBurst(
  group: THREE.Group,
  assets: Assets,
  kind: "era" | "blowout" | "detonation" | "muzzle",
  position: THREE.Vector3,
  normal: THREE.Vector3,
  start: number,
): Burst {
  const scale = kind === "detonation" ? 2.4 : kind === "blowout" ? 1.5 : kind === "muzzle" ? 0.55 : 0.62;
  const outward = kind === "era" ? 0.32 : kind === "muzzle" ? 0.08 : 0.3;
  const burst = new Burst(
    group,
    position.clone().addScaledVector(normal.clone().normalize(), outward),
    start,
  );
  const smokeCount = kind === "detonation" ? 11 : kind === "blowout" ? 8 : kind === "muzzle" ? 2 : 5;

  if (kind === "muzzle") {
    addAtlasLayer(burst, assets.red, [1, 0.55, 0.22], {
      duration: 0.32,
      from: [0.18, 0.18, 1],
      to: [1.5, 1.5, 1],
      opacity: 0.95,
      spin: 0.8,
    });
    addSimpleLayer(burst, assets.flash, 0xffd9a0, THREE.AdditiveBlending, {
      duration: 0.16,
      from: [0.2, 0.2, 1],
      to: [1.35, 1.35, 1],
      opacity: 0.85,
    });
  } else {
    addAtlasLayer(burst, assets.fireball, [1, 0.42, 0.14], {
      duration: kind === "blowout" ? 1.5 : kind === "detonation" ? 2 : 1.4,
      from: kind === "blowout" ? [0.35, 0.5, 1] : [scale * 0.45, scale * 0.45, 1],
      to: kind === "blowout" ? [1.6, 4.0, 1] : [scale * 3.1, scale * 3.1, 1],
      opacity: kind === "detonation" ? 0.85 : 0.92,
      spin: 0.35,
      rise: scale * (kind === "blowout" ? 1.2 : 0.35),
      alpha: true,
    });
    addAtlasLayer(burst, assets.red, [1, 0.2, 0.03], {
      delay: 0.03,
      duration: kind === "blowout" ? 1.1 : 0.9,
      from: kind === "blowout" ? [0.45, 0.6, 1] : [scale * 0.6, scale * 0.6, 1],
      to: kind === "blowout" ? [2.0, 4.2, 1] : [scale * 4.3, scale * 3.8, 1],
      opacity: kind === "detonation" ? 0.3 : 0.45,
      spin: -0.5,
      rise: scale * 0.25,
    });
    if (kind === "era" || kind === "detonation") {
      addAtlasLayer(burst, assets.blue, [0.4, 0.62, 1], {
        duration: kind === "detonation" ? 0.8 : 0.55,
        from: [scale * 0.25, scale * 0.25, 1],
        to: [scale * 2.2, scale * 2.2, 1],
        opacity: 0.48,
        spin: 1.1,
      });
    }
    addSimpleLayer(burst, assets.flash, 0xffe0b0, THREE.AdditiveBlending, {
      duration: kind === "detonation" ? 0.26 : 0.17,
      from: [scale * 0.18, scale * 0.18, 1],
      to: [scale * 0.95, scale * 0.95, 1],
      opacity: 0.55,
    });
    addSimpleLayer(burst, assets.smokeRing, 0xb59a76, THREE.AdditiveBlending, {
      delay: 0.02,
      duration: kind === "detonation" ? 0.8 : 0.5,
      from: [scale * 0.3, scale * 0.3, 1],
      to: [scale * (kind === "detonation" ? 3.4 : 2.6), scale * (kind === "detonation" ? 3.4 : 2.6), 1],
      opacity: 0.2,
      billboard: false,
      align: normal.clone().normalize(),
    });
  }

  for (let i = 0; i < smokeCount; i++) {
    const angle = Math.random() * Math.PI * 2;
    const radius = (0.25 + Math.random() * 0.75) * scale;
    addSimpleLayer(burst, assets.smoke, 0x2c2a26, THREE.NormalBlending, {
      delay: 0.14 + Math.random() * 0.3,
      duration: (kind === "detonation" ? 3.6 : 2.6) + Math.random() * 0.9,
      from: [scale * 0.5, scale * 0.5, 1],
      to: [scale * (1.8 + Math.random() * 1.4), scale * (1.8 + Math.random() * 1.4), 1],
      opacity: 0.4 + Math.random() * 0.16,
      spin: (Math.random() - 0.5) * 0.9,
      rise: scale * (0.8 + Math.random() * 1.1),
      drift: [Math.cos(angle) * radius, 0.05, Math.sin(angle) * radius],
      billboard: true,
    });
  }

  const sparkCount = kind === "detonation" ? 150 : kind === "blowout" ? 70 : kind === "muzzle" ? 24 : 60;
  burst.addSparks(
    makeSparks(
      assets,
      burst.position,
      sparkCount,
      kind === "detonation" ? 9 : kind === "muzzle" ? 4 : 6,
      start,
      kind === "detonation" ? 0.075 : 0.045,
    ),
  );
  const light = new THREE.PointLight(0xffa050, 0, 16, 2);
  light.position.copy(burst.position).add(new THREE.Vector3(0, 0.5 * scale, 0));
  burst.addLight({
    light,
    intensity: kind === "detonation" ? 70 : kind === "blowout" ? 35 : kind === "muzzle" ? 14 : 28,
    duration: kind === "detonation" ? 0.9 : 0.55,
  });
  return burst;
}

export function MbtVfx() {
  const modelId = useStageStore((state) => state.modelId);
  const machineState = useStageStore((state) => state.machineState);
  const assembled = useStageStore((state) => state.assembled);
  const camera = useThree((state) => state.camera);
  const groupRef = useRef<THREE.Group>(null);
  const assetsRef = useRef<Assets | null>(null);
  const [assets, setAssets] = useState<Assets | null>(null);
  const burstsRef = useRef<Burst[]>([]);
  const lastStateRef = useRef<string | null>(null);

  useEffect(() => {
    if (modelId !== "mbt90") {
      for (const burst of burstsRef.current) burst.dispose();
      burstsRef.current = [];
      lastStateRef.current = null;
      setAssets(null);
      return;
    }
    if (assetsRef.current) {
      setAssets(assetsRef.current);
      return;
    }
    let cancelled = false;
    loadAssets()
      .then((loaded) => {
        if (cancelled) {
          loaded.dispose();
          return;
        }
        assetsRef.current = loaded;
        setAssets(loaded);
      })
      .catch((error) => console.warn("MBT VFX 贴图加载失败", error));
    return () => {
      cancelled = true;
    };
  }, [modelId]);

  useEffect(() => {
    if (!assets || !assembled || modelId !== "mbt90" || !groupRef.current) return;
    if (machineState === lastStateRef.current) return;
    lastStateRef.current = machineState;
    const spawn = (kind: "era" | "blowout" | "detonation" | "muzzle") => {
      const origin = effectOrigin(assembled, kind);
      if (!origin) return;
      burstsRef.current.push(
        buildBurst(groupRef.current!, assets, kind, origin.position, origin.normal, performance.now() / 1000),
      );
    };
    let interval: ReturnType<typeof setInterval> | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    if (machineState === "era_hit") spawn("era");
    else if (machineState === "blowout") spawn("blowout");
    else if (machineState === "detonation") spawn("detonation");
    else if (machineState === "fire") {
      spawn("muzzle");
      interval = setInterval(() => spawn("muzzle"), 4500);
    } else if (machineState === "hunter_killer") {
      timeout = setTimeout(() => spawn("muzzle"), 5200);
    }
    return () => {
      if (interval) clearInterval(interval);
      if (timeout) clearTimeout(timeout);
      // 状态已切走：不强行清掉正在燃烧的粒子，让它们自然收尾。
    };
  }, [machineState, modelId, assembled, assets]);

  useEffect(() => {
    const group = groupRef.current;
    return () => {
      for (const burst of burstsRef.current) burst.dispose();
      burstsRef.current = [];
      assetsRef.current?.dispose();
      assetsRef.current = null;
      group?.clear();
    };
  }, []);

  useFrame(() => {
    const group = groupRef.current;
    if (!group) return;
    const time = performance.now() / 1000;
    const alive: Burst[] = [];
    for (const burst of burstsRef.current) {
      if (burst.update(time, camera)) alive.push(burst);
      else burst.dispose();
    }
    burstsRef.current = alive;
  });

  return <group ref={groupRef} />;
}
