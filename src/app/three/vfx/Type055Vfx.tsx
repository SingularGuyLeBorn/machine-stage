import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useStageStore } from "@/app/state/stageStore";
import { VLS_HEROES } from "@/three/parts/models/type055/vls";

// ============================================================================
// Type055Vfx —— 导弹终端爆炸（照片级 flipbook）
//
// 复用 public/vfx 下已署名的素材：
//   explosion-fireball.png  fscopel, CC-BY 3.0（24 帧图集 6×4）
//   smoke_ring.png          Kenney Particle Pack, CC0
// 发射时按导弹节点的淡出时刻在其终点触发空爆/掠海爆炸，只开一个池子，
// 不增加常驻 draw call 压力。
// ============================================================================

const POOL = 8;
const ATLAS_COLS = 6;
const ATLAS_ROWS = 4;
const ATLAS_FRAMES = 24;
const BURST_LIFE = 1.6;

const BURST_SCALE: Record<string, number> = { hhq9b: 17, yj18: 22, yj21: 28 };
const BURST_TINT: Record<string, [number, number, number]> = {
  hhq9b: [1.35, 0.82, 0.55],
  yj18: [1.3, 0.72, 0.45],
  yj21: [1.45, 0.92, 0.62],
};

interface Burst {
  age: number;
  life: number;
  scale: number;
  active: boolean;
}

interface Assets {
  fireball: THREE.Texture;
  smoke: THREE.Texture;
}

function atlasMaterial(texture: THREE.Texture): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: texture },
      uCols: { value: ATLAS_COLS },
      uRows: { value: ATLAS_ROWS },
      uFrame: { value: 0 },
      uOpacity: { value: 0 },
      uTint: { value: new THREE.Color(1.35, 0.82, 0.55) },
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
        vec3 rgb = max(tex.rgb, vec3(0.0)) * uTint;
        float lum = max(tex.r, max(tex.g, tex.b));
        gl_FragColor = vec4(rgb, clamp(lum, 0.0, 1.0) * uOpacity);
      }
    `,
    transparent: true,
    // 白天爆炸主体用普通混合：加法混合在亮天空上会被冲成粉白烟团。
    // 高亮闪光由单独的白热 flash 层负责。
    blending: THREE.NormalBlending,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
  });
}

export function Type055Vfx() {
  const modelId = useStageStore((state) => state.modelId);
  const machineState = useStageStore((state) => state.machineState);
  const assembled = useStageStore((state) => state.assembled);
  const [assets, setAssets] = useState<Assets | null>(null);

  useEffect(() => {
    let alive = true;
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");
    Promise.all([loader.loadAsync("/vfx/explosion-fireball.png"), loader.loadAsync("/vfx/smoke_ring.png")])
      .then(([fireball, smoke]) => {
        if (!alive) {
          fireball.dispose();
          smoke.dispose();
          return;
        }
        fireball.colorSpace = THREE.SRGBColorSpace;
        smoke.colorSpace = THREE.SRGBColorSpace;
        setAssets({ fireball, smoke });
      })
      .catch(() => setAssets(null));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      assets?.fireball.dispose();
      assets?.smoke.dispose();
    };
  }, [assets]);

  const materials = useMemo(
    () => (assets ? Array.from({ length: POOL }, () => atlasMaterial(assets.fireball)) : []),
    [assets],
  );

  const bursts = useRef<Burst[]>(
    Array.from({ length: POOL }, () => ({ age: 0, life: 0, scale: 1, active: false })),
  );
  const groups = useRef<Array<THREE.Group | null>>([]);
  const fires = useRef<Array<THREE.Mesh | null>>([]);
  const rings = useRef<Array<THREE.Mesh | null>>([]);
  const light = useRef<THREE.PointLight>(null);
  const sparkCount = POOL * 30;
  const sparkGeo = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(sparkCount * 3), 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(sparkCount * 3), 3));
    return geometry;
  }, [sparkCount]);
  const sparkMat = useMemo(
    () =>
      new THREE.PointsMaterial({
        size: 0.9,
        sizeAttenuation: true,
        vertexColors: true,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [],
  );
  const sparks = useRef(
    Array.from({ length: sparkCount }, () => ({ live: false, age: 0, life: 0, vx: 0, vy: 0, vz: 0 })),
  );
  useEffect(() => () => {
    sparkGeo.dispose();
    sparkMat.dispose();
  }, [sparkGeo, sparkMat]);
  const nextSlot = useRef(0);
  const prevScale = useRef(new Map<string, number>());
  const spawned = useRef(new Set<string>());
  const world = useMemo(() => new THREE.Vector3(), []);

  useFrame((state, delta) => {
    const dt = Math.min(0.05, delta);
    const launch = modelId === "type055" && machineState === "launch" && assembled;

    if (launch && assembled) {
      for (const hero of VLS_HEROES) {
        const node = assembled.getNode(`CV_055_VlsMissile_${hero.tag}`);
        if (!node) continue;
        // 导弹本体会在终点淡出；滑翔体只是子节点，自身 scale 不变。
        const scale = node.scale.x;
        const posNode = assembled.getNode(`CV_055_VlsGlider_${hero.tag}`) ?? node;
        const prev = prevScale.current.get(hero.tag) ?? 0;
        if (scale > 0.8) spawned.current.delete(hero.tag);
        if (prev > 0.4 && scale <= 0.4 && scale > 0.001 && !spawned.current.has(hero.tag)) {
          spawned.current.add(hero.tag);
          const slot = nextSlot.current % POOL;
          nextSlot.current += 1;
          posNode.getWorldPosition(world);
          const burst = bursts.current[slot]!;
          burst.age = 0;
          burst.life = BURST_LIFE;
          burst.scale = BURST_SCALE[hero.type] ?? 18;
          burst.active = true;
          const group = groups.current[slot];
          if (group) {
            group.position.copy(world);
            group.visible = true;
          }
          const mat = materials[slot];
          const tint = BURST_TINT[hero.type] ?? [1.35, 0.82, 0.55];
          mat?.uniforms.uTint!.value.setRGB(tint[0], tint[1], tint[2]);
          const position = sparkGeo.getAttribute("position") as THREE.BufferAttribute;
          const color = sparkGeo.getAttribute("color") as THREE.BufferAttribute;
          const start = slot * 30;
          for (let j = 0; j < 30; j++) {
            const spark = sparks.current[start + j]!;
            const a = Math.random() * Math.PI * 2;
            const b = Math.acos(2 * Math.random() - 1);
            const speed = 18 + Math.random() * 42;
            spark.live = true;
            spark.age = 0;
            spark.life = 0.5 + Math.random() * 0.6;
            spark.vx = Math.sin(b) * Math.cos(a) * speed;
            spark.vy = Math.abs(Math.cos(b)) * speed * 0.9 + 6;
            spark.vz = Math.sin(b) * Math.sin(a) * speed;
            position.setXYZ(start + j, world.x, world.y, world.z);
            color.setXYZ(start + j, tint[0], tint[1], tint[2]);
          }
          position.needsUpdate = true;
          color.needsUpdate = true;
        }
        prevScale.current.set(hero.tag, scale);
      }
    } else {
      prevScale.current.clear();
      spawned.current.clear();
    }

    let newest: Burst | null = null;
    for (let i = 0; i < POOL; i++) {
      const burst = bursts.current[i]!;
      if (!burst.active) continue;
      burst.age += dt;
      const u = burst.age / burst.life;
      const group = groups.current[i];
      const fire = fires.current[i];
      const ring = rings.current[i];
      if (!group || !fire || !ring) continue;
      if (u >= 1) {
        burst.active = false;
        group.visible = false;
        continue;
      }
      if (!newest || burst.age < newest.age) newest = burst;
      const eased = 1 - Math.pow(1 - u, 2.2);
      const fadeIn = Math.min(1, u / 0.06);
      // 前 45% 保持实体火球，再切入烟云淡出；否则整段都像半透明粉烟。
      const fadeOut = u < 0.45 ? 1 : Math.pow(1 - (u - 0.45) / 0.55, 1.25);
      const alpha = fadeIn * fadeOut;
      const mat = fire.material as THREE.ShaderMaterial;
      mat.uniforms.uFrame!.value = Math.min(ATLAS_FRAMES - 1, Math.floor(u * ATLAS_FRAMES));
      mat.uniforms.uOpacity!.value = alpha;
      fire.quaternion.copy(state.camera.quaternion);
      fire.scale.setScalar(burst.scale * (0.62 + 1.45 * eased));
      ring.quaternion.copy(state.camera.quaternion);
      ring.scale.setScalar(burst.scale * (0.9 + 2.2 * eased));
      (ring.material as THREE.MeshBasicMaterial).opacity = 0.05 * fadeOut;
      group.visible = true;
    }

    {
      const position = sparkGeo.getAttribute("position") as THREE.BufferAttribute;
      const color = sparkGeo.getAttribute("color") as THREE.BufferAttribute;
      let changed = false;
      for (let i = 0; i < sparkCount; i++) {
        const spark = sparks.current[i]!;
        if (!spark.live) continue;
        spark.age += dt;
        if (spark.age >= spark.life) {
          spark.live = false;
          color.setXYZ(i, 0, 0, 0);
          changed = true;
          continue;
        }
        const k = Math.max(0, 1 - dt * 1.4);
        spark.vx *= k;
        spark.vz *= k;
        spark.vy = spark.vy * k - 9.8 * dt;
        position.setXYZ(
          i,
          position.getX(i) + spark.vx * dt,
          position.getY(i) + spark.vy * dt,
          position.getZ(i) + spark.vz * dt,
        );
        const fade = 1 - spark.age / spark.life;
        color.setXYZ(i, 1.8 * fade, 0.85 * fade, 0.35 * fade);
        changed = true;
      }
      if (changed) {
        position.needsUpdate = true;
        color.needsUpdate = true;
      }
    }

    if (light.current) {
      if (newest) {
        const fade = Math.pow(1 - newest.age / newest.life, 3);
        light.current.intensity = 90 * fade;
        light.current.position.copy(groups.current[bursts.current.indexOf(newest)]?.position ?? light.current.position);
      } else {
        light.current.intensity = 0;
      }
    }
  });

  if (!assets) return null;

  return (
    <group>
      {Array.from({ length: POOL }, (_, i) => (
        <group
          key={i}
          name="type055-explosion"
          ref={(node) => {
            groups.current[i] = node;
          }}
          visible={false}
        >
          <mesh
            ref={(node) => {
              fires.current[i] = node;
            }}
            material={materials[i]!}
            renderOrder={40}
          >
            <planeGeometry args={[1, 1]} />
          </mesh>
          <mesh
            ref={(node) => {
              rings.current[i] = node;
            }}
            renderOrder={39}
          >
            <planeGeometry args={[1, 1]} />
            <meshBasicMaterial
              map={assets.smoke}
              transparent
              opacity={0}
              depthWrite={false}
              side={THREE.DoubleSide}
              color="#c8d2d6"
            />
          </mesh>
        </group>
      ))}
      <points geometry={sparkGeo} material={sparkMat} frustumCulled={false} renderOrder={41} />
      <pointLight ref={light} intensity={0} distance={320} decay={1.7} color="#ffb066" />
    </group>
  );
}
