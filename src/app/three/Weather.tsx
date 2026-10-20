import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { AssembledModel } from "@/three/parts";
import { useStageStore } from "@/app/state/stageStore";

// ============================================================================
// app/three/Weather —— 环境交互层（雨天 + 履带甩泥）
//
// 两个独立的轻量粒子系统，不引额外依赖：
//   rain  900 条雨丝（LineSegments，竖直短线），在车体周围 16×8×16 的盒子里循环下落；
//   mud   160 颗泥块（Points），只在「行进」状态从两条履带的后接地点抛出，
//         带抛物线 + 重力 + 生命期；车体转向前进时用 root 的四元数把速度转到世界系。
// 粒子系统不参与穿模/支撑检测（只是渲染层）。
// ============================================================================

const RAIN_COUNT = 900;
const RAIN_BOX = { x: 9, y: 8, z: 9 };
const RAIN_SPEED = 8.5;
const RAIN_LENGTH = 0.22;

const MUD_COUNT = 160;
const MUD_GRAVITY = 9.8;
const MUD_LIFE = 0.9;

interface MudParticle {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
}

export function Weather({ assembled }: { assembled: AssembledModel | null }) {
  const rainEnabled = useStageStore((state) => state.views.rain);

  const rain = useMemo(() => {
    const positions = new Float32Array(RAIN_COUNT * 2 * 3);
    const speeds = new Float32Array(RAIN_COUNT);
    for (let i = 0; i < RAIN_COUNT; i++) {
      const x = (Math.random() * 2 - 1) * RAIN_BOX.x;
      const y = Math.random() * RAIN_BOX.y;
      const z = (Math.random() * 2 - 1) * RAIN_BOX.z;
      const length = RAIN_LENGTH * (0.6 + Math.random() * 0.8);
      positions.set([x, y, z, x + 0.02, y + length, z], i * 6);
      speeds[i] = RAIN_SPEED * (0.8 + Math.random() * 0.4);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return { geometry, positions, speeds };
  }, []);

  const mud = useMemo(() => {
    const positions = new Float32Array(MUD_COUNT * 3).fill(-999);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const particles: MudParticle[] = Array.from({ length: MUD_COUNT }, () => ({
      position: new THREE.Vector3(0, -999, 0),
      velocity: new THREE.Vector3(),
      life: 0,
      maxLife: MUD_LIFE,
    }));
    return { geometry, positions, particles, cursor: 0 };
  }, []);

  const rainRef = useRef<THREE.LineSegments>(null);
  const mudRef = useRef<THREE.Points>(null);
  const spawnAcc = useRef(0);
  const worldPoint = useMemo(() => new THREE.Vector3(), []);
  const worldVelocity = useMemo(() => new THREE.Vector3(), []);
  const forward = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    if (rainRef.current) rainRef.current.visible = rainEnabled;
    if (mudRef.current) mudRef.current.visible = true;

    if (rainEnabled) {
      const { positions, speeds } = rain;
      for (let i = 0; i < RAIN_COUNT; i++) {
        const base = i * 6;
        const fall = speeds[i]! * dt;
        positions[base + 1] -= fall;
        positions[base + 4] -= fall;
        if (positions[base + 1] < 0) {
          const x = (Math.random() * 2 - 1) * RAIN_BOX.x;
          const z = (Math.random() * 2 - 1) * RAIN_BOX.z;
          const y = RAIN_BOX.y + Math.random() * 1.5;
          const length = RAIN_LENGTH * (0.6 + Math.random() * 0.8);
          positions.set([x, y, z, x + 0.02, y + length, z], base);
        }
      }
      (rain.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    }

    const state = useStageStore.getState().machineState;
    const driving = state === "driving" && assembled;
    if (driving) {
      // 泥块从两条履带的后接地点抛出：模型系 +X 是车尾，z ±1.49 是履带中心
      spawnAcc.current += dt * 180; // 每秒约 180 颗
      const count = Math.min(6, Math.floor(spawnAcc.current));
      spawnAcc.current -= count;
      const root = assembled!.root;
      forward.set(1, 0, 0).applyQuaternion(root.quaternion);
      for (let n = 0; n < count; n++) {
        const particle = mud.particles[mud.cursor % MUD_COUNT]!;
        mud.cursor = (mud.cursor + 1) % MUD_COUNT;
        const side = n % 2 === 0 ? 1 : -1;
        worldPoint.set(0.85 + Math.random() * 0.15, -1.02, side * 1.49);
        root.localToWorld(worldPoint);
        particle.position.copy(worldPoint);
        worldVelocity
          .set(1.1 + Math.random() * 1.4, 1.2 + Math.random() * 1.1, side * (0.2 + Math.random() * 0.6))
          .applyQuaternion(root.quaternion);
        particle.velocity.copy(worldVelocity);
        particle.life = MUD_LIFE * (0.7 + Math.random() * 0.5);
        particle.maxLife = particle.life;
      }
    }
    // 更新泥块
    let mudAlive = false;
    for (let i = 0; i < MUD_COUNT; i++) {
      const particle = mud.particles[i]!;
      if (particle.life <= 0) {
        mud.positions[i * 3 + 1] = -999;
        continue;
      }
      particle.life -= dt;
      particle.velocity.y -= MUD_GRAVITY * dt;
      particle.position.addScaledVector(particle.velocity, dt);
      mudAlive = true;
      if (particle.position.y < -1.12) {
        particle.life = 0;
        mud.positions[i * 3 + 1] = -999;
        continue;
      }
      mud.positions[i * 3] = particle.position.x;
      mud.positions[i * 3 + 1] = particle.position.y;
      mud.positions[i * 3 + 2] = particle.position.z;
    }
    if (mudAlive || driving) {
      (mud.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    }
  });

  return (
    <group>
      <lineSegments ref={rainRef} geometry={rain.geometry} frustumCulled={false} visible={false}>
        <lineBasicMaterial color="#aebccb" transparent opacity={0.5} depthWrite={false} />
      </lineSegments>
      <points ref={mudRef} geometry={mud.geometry} frustumCulled={false}>
        <pointsMaterial color="#4d3a26" size={0.042} sizeAttenuation transparent opacity={0.95} />
      </points>
    </group>
  );
}
