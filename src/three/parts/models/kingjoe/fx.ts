import * as THREE from "three";
import type { AssembledModel } from "../../assembler/assembler";
import { DOCKS, NOZZLE_LOCAL, nodeOrigin } from "./rig";

// ============================================================================
// models/kingjoe/fx —— 对接电弧 / 怪光线 / 喷口焰（不参与零件树与检测）
//
// 特效是场景级对象，不是「零件」：没有实体碰撞，不参与穿模/悬空检测，
// 随 AssembledModel.dispose 一起释放。电弧锚点从对接面节点实时取，
// 所以合体/分离全程电弧都跟着真实的销/环位置走，而不是贴一张固定贴图。
// ============================================================================

export interface KingJoeFxFrame {
  time: number;
  /** 每个对接面的电弧强度 0..1。 */
  arcs: Record<string, number>;
  /** 每个模块的喷口推力 0..1。 */
  thrusters: Record<string, number>;
  /** 怪光线：0..1 强度；charge 控制充能光晕。 */
  beamShip: number;
  beamChest: number;
  charge: number;
  /** 锁死闪光 0..1。 */
  flashes: Record<string, number>;
  /** 残缺合体时铺一块地面承影盘（特效件，不参与零件检测）。 */
  floor?: boolean;
}

const ARC_SEGMENTS = 9;

interface ArcRig {
  dock: (typeof DOCKS)[number];
  chains: THREE.LineSegments[];
  ring: THREE.Mesh;
  light: THREE.PointLight;
}

interface BeamRig {
  group: THREE.Group;
  core: THREE.Mesh;
  glow: THREE.Mesh;
  muzzle: THREE.Mesh;
  coreMaterial: THREE.MeshBasicMaterial;
  glowMaterial: THREE.MeshBasicMaterial;
  node: string;
  local: THREE.Vector3;
}

interface ThrusterRig {
  group: THREE.Group;
  flame: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  node: string;
  local: THREE.Vector3;
}

function pseudo(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export class KingJoeFx {
  readonly group = new THREE.Group();
  private readonly arcs: ArcRig[] = [];
  private readonly beams: BeamRig[] = [];
  private readonly thrusters: ThrusterRig[] = [];
  private floor!: THREE.Mesh;
  private readonly ownedGeometries = new Set<THREE.BufferGeometry>();
  private readonly ownedMaterials = new Set<THREE.Material>();

  constructor() {
    this.group.name = "kingjoe.fx";
    this.group.visible = false;

    const floorGeometry = new THREE.CircleGeometry(7, 64);
    floorGeometry.rotateX(-Math.PI / 2);
    this.ownedGeometries.add(floorGeometry);
    const floorMaterial = new THREE.MeshStandardMaterial({
      color: "#e2e6ea",
      roughness: 0.94,
      metalness: 0,
    });
    this.ownedMaterials.add(floorMaterial);
    this.floor = new THREE.Mesh(floorGeometry, floorMaterial);
    this.floor.position.y = -0.02;
    this.floor.receiveShadow = true;
    this.floor.visible = false;
    this.group.add(this.floor);

    const arcMaterial = () =>
      new THREE.LineBasicMaterial({
        color: 0xbff4ff,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
    for (const dock of DOCKS) {
      const chains: THREE.LineSegments[] = [];
      for (let chain = 0; chain < 4; chain++) {
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(ARC_SEGMENTS * 2 * 3);
        geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        this.ownedGeometries.add(geometry);
        const material = arcMaterial();
        this.ownedMaterials.add(material);
        const line = new THREE.LineSegments(geometry, material);
        line.frustumCulled = false;
        this.group.add(line);
        chains.push(line);
      }
      const ringGeometry = new THREE.TorusGeometry(0.66, 0.02, 8, 48);
      ringGeometry.rotateX(Math.PI / 2);
      this.ownedGeometries.add(ringGeometry);
      const ringMaterial = new THREE.MeshBasicMaterial({
        color: 0x9fe9ff,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      this.ownedMaterials.add(ringMaterial);
      const ring = new THREE.Mesh(ringGeometry, ringMaterial);
      this.group.add(ring);
      const light = new THREE.PointLight(0x8fdcff, 0, 4.5, 2);
      this.group.add(light);
      this.arcs.push({ dock, chains, ring, light });
    }

    const makeBeam = (node: string, local: [number, number, number]): BeamRig => {
      const group = new THREE.Group();
      const coreGeometry = new THREE.CylinderGeometry(0.026, 0.038, 1, 16, 1, true);
      const glowGeometry = new THREE.CylinderGeometry(0.06, 0.16, 1, 20, 1, true);
      this.ownedGeometries.add(coreGeometry);
      this.ownedGeometries.add(glowGeometry);
      const coreMaterial = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const glowMaterial = new THREE.MeshBasicMaterial({
        color: 0x59c9ff,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      this.ownedMaterials.add(coreMaterial);
      this.ownedMaterials.add(glowMaterial);
      const core = new THREE.Mesh(coreGeometry, coreMaterial);
      const glow = new THREE.Mesh(glowGeometry, glowMaterial);
      for (const mesh of [core, glow]) {
        mesh.rotation.x = Math.PI / 2;
        mesh.position.z = 0.5;
        mesh.visible = false;
        group.add(mesh);
      }
      const muzzleGeometry = new THREE.SphereGeometry(0.09, 16, 12);
      this.ownedGeometries.add(muzzleGeometry);
      const muzzleMaterial = new THREE.MeshBasicMaterial({
        color: 0xd9f6ff,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      this.ownedMaterials.add(muzzleMaterial);
      const muzzle = new THREE.Mesh(muzzleGeometry, muzzleMaterial);
      muzzle.visible = false;
      group.add(muzzle);
      this.group.add(group);
      return {
        group,
        core,
        glow,
        muzzle,
        coreMaterial,
        glowMaterial,
        node,
        local: new THREE.Vector3(...local),
      };
    };
    this.beams.push(makeBeam("ship", [0, 0.81, 0.66]));
    this.beams.push(makeBeam("chest", [0, 1.28, 0.71]));

    const flameGeometry = new THREE.ConeGeometry(0.11, 0.9, 12, 1, true);
    this.ownedGeometries.add(flameGeometry);
    for (const module of ["ship", "chest", "stomach", "legs"] as const) {
      NOZZLE_LOCAL[module].forEach((position, index) => {
        const group = new THREE.Group();
        const material = new THREE.MeshBasicMaterial({
          color: 0x62c8ff,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        this.ownedMaterials.add(material);
        const flame = new THREE.Mesh(flameGeometry, material);
        flame.rotation.x = -Math.PI / 2;
        flame.position.z = -0.55;
        flame.visible = false;
        group.add(flame);
        this.group.add(group);
        this.thrusters.push({
          group,
          flame,
          material,
          node: `${module}Nozzle${index}`,
          local: new THREE.Vector3(...position),
        });
      });
    }
  }

  update(assembled: AssembledModel, frame: KingJoeFxFrame): void {
    assembled.root.updateMatrixWorld(true);
    const rootInverse = new THREE.Matrix4().copy(assembled.root.matrixWorld).invert();
    const toLocal = (point: THREE.Vector3): THREE.Vector3 => point.applyMatrix4(rootInverse);
    const nodeWorld = (name: string, local: THREE.Vector3): THREE.Vector3 => {
      const node = assembled.getNode(name);
      if (!node) return new THREE.Vector3();
      const world = node.localToWorld(local.clone());
      return toLocal(world);
    };
    const nodeQuat = (name: string): THREE.Quaternion => {
      const node = assembled.getNode(name);
      if (!node) return new THREE.Quaternion();
      const quat = new THREE.Quaternion();
      node.getWorldQuaternion(quat);
      const rootQuat = new THREE.Quaternion();
      assembled.root.getWorldQuaternion(rootQuat);
      return rootQuat.invert().multiply(quat);
    };

    let anyVisible = false;
    this.floor.visible = Boolean(frame.floor);
    if (frame.floor) anyVisible = true;

    for (const rig of this.arcs) {
      const intensity = frame.arcs[rig.dock.id] ?? 0;
      const upper = nodeWorld(rig.dock.upperNode, new THREE.Vector3(0, -0.06, 0));
      const lowerLocalY = rig.dock.lowerTopY - nodeOrigin(rig.dock.lowerNode)[1];
      const lower = nodeWorld(rig.dock.lowerNode, new THREE.Vector3(0, lowerLocalY, 0));
      const visible = intensity > 0.01;
      rig.light.position.copy(lower);
      rig.light.position.y += 0.05;
      rig.light.intensity = visible ? intensity * 7 : 0;
      rig.ring.position.copy(lower);
      rig.ring.position.y += 0.02;
      rig.ring.scale.setScalar(0.6 + intensity * 0.6);
      (rig.ring.material as THREE.MeshBasicMaterial).opacity = visible ? intensity * 0.7 : 0;
      rig.ring.visible = visible;
      if (!visible) {
        for (const chain of rig.chains) chain.visible = false;
        anyVisible = anyVisible || false;
        continue;
      }
      anyVisible = true;
      const flash = frame.flashes[rig.dock.id] ?? 0;
      const radius = 0.6;
      for (let chain = 0; chain < rig.chains.length; chain++) {
        const line = rig.chains[chain]!;
        line.visible = true;
        const material = line.material as THREE.LineBasicMaterial;
        material.opacity = Math.min(1, intensity * 0.95 + flash * 0.6);
        const positions = line.geometry.getAttribute("position") as THREE.BufferAttribute;
        const baseAngle = (chain / rig.chains.length) * Math.PI * 2 + frame.time * 0.8;
        const upperAnchor = new THREE.Vector3(
          upper.x + Math.cos(baseAngle) * radius,
          upper.y,
          upper.z + Math.sin(baseAngle) * radius,
        );
        const lowerAnchor = new THREE.Vector3(
          lower.x + Math.cos(baseAngle + 0.35) * radius,
          lower.y,
          lower.z + Math.sin(baseAngle + 0.35) * radius,
        );
        for (let segment = 0; segment < ARC_SEGMENTS; segment++) {
          const t0 = segment / ARC_SEGMENTS;
          const t1 = (segment + 1) / ARC_SEGMENTS;
          const jitter = (t: number, offset: number): THREE.Vector3 => {
            const a = upperAnchor.clone().lerp(lowerAnchor, t);
            const seed = frame.time * 11.3 + chain * 7.1 + segment * 3.7 + offset;
            const amp = 0.16 * Math.sin(Math.PI * t) * (0.4 + intensity * 0.8);
            a.x += (pseudo(seed) - 0.5) * amp;
            a.y += (pseudo(seed + 9) - 0.5) * amp * 0.3;
            a.z += (pseudo(seed + 17) - 0.5) * amp;
            return a;
          };
          const p0 = jitter(t0, 0);
          const p1 = jitter(t1, 1);
          positions.setXYZ(segment * 2, p0.x, p0.y, p0.z);
          positions.setXYZ(segment * 2 + 1, p1.x, p1.y, p1.z);
        }
        positions.needsUpdate = true;
      }
    }

    for (const beam of this.beams) {
      const strength = beam.node === "ship" ? frame.beamShip : frame.beamChest;
      const visible = strength > 0.01 || frame.charge > 0.3;
      beam.group.visible = visible;
      beam.group.position.copy(nodeWorld(beam.node, beam.local));
      beam.group.quaternion.copy(nodeQuat(beam.node));
      const length = 0.4 + strength * 10.5;
      beam.core.visible = strength > 0.01;
      beam.glow.visible = strength > 0.01;
      beam.muzzle.visible = strength > 0.01;
      beam.core.scale.set(0.7, length, 0.7);
      beam.glow.scale.set(0.8, length, 0.8);
      beam.coreMaterial.opacity = strength * 0.95;
      beam.glowMaterial.opacity = strength * 0.45;
      beam.muzzle.scale.setScalar(0.5 + strength * 0.9);
      (beam.muzzle.material as THREE.MeshBasicMaterial).opacity = strength * 0.8;
      if (visible) anyVisible = true;
    }

    for (const thruster of this.thrusters) {
      const module = thruster.node.split("Nozzle")[0] ?? "ship";
      const throttle = frame.thrusters[module] ?? 0;
      const visible = throttle > 0.02;
      thruster.group.visible = visible;
      if (!visible) continue;
      anyVisible = true;
      thruster.group.position.copy(nodeWorld(thruster.node, new THREE.Vector3(0, 0, 0)));
      thruster.group.quaternion.copy(nodeQuat(thruster.node));
      const length = 0.35 + throttle * 1.15;
      thruster.flame.scale.set(0.7 + throttle * 0.5, length, 0.7 + throttle * 0.5);
      thruster.flame.position.z = -0.28 - length * 0.35;
      thruster.material.opacity = 0.22 + throttle * 0.6;
    }

    this.group.visible = anyVisible;
  }

  dispose(): void {
    for (const geometry of this.ownedGeometries) geometry.dispose();
    for (const material of this.ownedMaterials) material.dispose();
    this.group.removeFromParent();
  }
}

const fxRegistry = new WeakMap<AssembledModel, KingJoeFx>();

export function getKingJoeFx(assembled: AssembledModel): KingJoeFx {
  let fx = fxRegistry.get(assembled);
  if (!fx) {
    fx = new KingJoeFx();
    assembled.root.add(fx.group);
    fxRegistry.set(assembled, fx);
    const originalDispose = assembled.dispose.bind(assembled);
    assembled.dispose = () => {
      fx?.dispose();
      originalDispose();
    };
  }
  return fx;
}
