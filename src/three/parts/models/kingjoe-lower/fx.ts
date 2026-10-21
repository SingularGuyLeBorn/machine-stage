import * as THREE from "three";
import type { AssembledModel } from "../../assembler/assembler";
import { JOINT_RADIUS, LOWER_TOP } from "./constants";

// ============================================================================
// models/kingjoe-lower/fx —— 髋缝电弧 / 锁死闪光（不参与零件树与检测）
//
// 6 条电弧从下半身髋环拉到上半身骨盆下缘；上半身提起时拉长、拉断，
// 合体下降时重新接通，锁死瞬间闪一下。锚点从 lower/upper 节点实时取，
// 所以电弧跟着真实髋缝走，不是贴图。随 AssembledModel.dispose 释放。
// ============================================================================

export interface KingJoeLowerFxFrame {
  time: number;
  /** 电弧强度 0..1。 */
  arc: number;
  /** 锁死闪光 0..1。 */
  flash: number;
}

const CHAINS = 8;
const SEGMENTS = 9;

function pseudo(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export class KingJoeLowerFx {
  readonly group = new THREE.Group();
  private readonly chains: THREE.LineSegments[] = [];
  private readonly ring: THREE.Mesh;
  private readonly ringMaterial: THREE.MeshBasicMaterial;
  private readonly flashCore: THREE.Mesh;
  private readonly flashMaterial: THREE.MeshBasicMaterial;
  private readonly light: THREE.PointLight;
  private readonly ownedGeometries = new Set<THREE.BufferGeometry>();
  private readonly ownedMaterials = new Set<THREE.Material>();

  constructor() {
    this.group.name = "kingjoe-lower.fx";
    this.group.visible = false;

    for (let chain = 0; chain < CHAINS; chain++) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(SEGMENTS * 2 * 3), 3));
      const material = new THREE.LineBasicMaterial({
        color: 0xbff4ff,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      this.ownedGeometries.add(geometry);
      this.ownedMaterials.add(material);
      const line = new THREE.LineSegments(geometry, material);
      line.frustumCulled = false;
      this.group.add(line);
      this.chains.push(line);
    }

    const ringGeometry = new THREE.TorusGeometry(JOINT_RADIUS + 0.2, 0.03, 8, 48);
    ringGeometry.rotateX(Math.PI / 2);
    this.ownedGeometries.add(ringGeometry);
    this.ringMaterial = new THREE.MeshBasicMaterial({
      color: 0x9fe9ff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.ownedMaterials.add(this.ringMaterial);
    this.ring = new THREE.Mesh(ringGeometry, this.ringMaterial);
    this.group.add(this.ring);

    const flashGeometry = new THREE.SphereGeometry(0.1, 20, 14);
    this.ownedGeometries.add(flashGeometry);
    this.flashMaterial = new THREE.MeshBasicMaterial({
      color: 0xd8fbff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.ownedMaterials.add(this.flashMaterial);
    this.flashCore = new THREE.Mesh(flashGeometry, this.flashMaterial);
    this.flashCore.visible = false;
    this.group.add(this.flashCore);

    this.light = new THREE.PointLight(0x8fdcff, 0, 4.5, 2);
    this.group.add(this.light);
  }

  update(assembled: AssembledModel, frame: KingJoeLowerFxFrame): void {
    const intensity = Math.min(1, Math.max(0, frame.arc));
    const flash = Math.min(1, Math.max(0, frame.flash));
    const visible = intensity > 0.01 || flash > 0.01;
    this.group.visible = visible;
    if (!visible) return;

    const lower = assembled.getNode("lower");
    const upper = assembled.getNode("upper");
    if (!lower || !upper) return;

    assembled.root.updateMatrixWorld(true);
    const rootInverse = new THREE.Matrix4().copy(assembled.root.matrixWorld).invert();
    const toLocal = (point: THREE.Vector3): THREE.Vector3 => point.applyMatrix4(rootInverse);
    const lowerY = LOWER_TOP + 0.02;
    const upperY = LOWER_TOP + 0.07;

    for (let chain = 0; chain < CHAINS; chain++) {
      const line = this.chains[chain]!;
      const material = line.material as THREE.LineBasicMaterial;
      material.opacity = Math.min(1, intensity * 0.92 + flash * 0.8);
      const angle = (chain / CHAINS) * Math.PI * 2 + frame.time * 0.35;
      const radialX = Math.cos(angle);
      const radialZ = Math.sin(angle);
      const lowerAnchor = toLocal(
        lower.localToWorld(
          new THREE.Vector3(radialX * JOINT_RADIUS, lowerY, radialZ * JOINT_RADIUS),
        ),
      );
      const upperAnchor = toLocal(
        upper.localToWorld(
          new THREE.Vector3(
            Math.cos(angle + 0.4) * JOINT_RADIUS,
            upperY,
            Math.sin(angle + 0.4) * JOINT_RADIUS,
          ),
        ),
      );
      const positions = line.geometry.getAttribute("position") as THREE.BufferAttribute;
      for (let segment = 0; segment < SEGMENTS; segment++) {
        const t0 = segment / SEGMENTS;
        const t1 = (segment + 1) / SEGMENTS;
        const jitter = (t: number, offset: number): THREE.Vector3 => {
          const point = lowerAnchor.clone().lerp(upperAnchor, t);
          const seed = frame.time * 13.7 + chain * 7.3 + segment * 3.1 + offset;
          const amp = 0.035 + intensity * 0.09;
          // 电弧中段向外弓出，避免整段藏在髋甲里面。
          const bulge = Math.sin(Math.PI * t) * (0.16 + intensity * 0.26);
          point.x += radialX * bulge + (pseudo(seed) - 0.5) * amp;
          point.z += radialZ * bulge + (pseudo(seed + 9) - 0.5) * amp;
          point.y += (pseudo(seed + 17) - 0.5) * amp * 0.35;
          return point;
        };
        const p0 = jitter(t0, 0);
        const p1 = jitter(t1, 1);
        positions.setXYZ(segment * 2, p0.x, p0.y, p0.z);
        positions.setXYZ(segment * 2 + 1, p1.x, p1.y, p1.z);
      }
      positions.needsUpdate = true;
      line.visible = true;
    }

    const center = toLocal(lower.localToWorld(new THREE.Vector3(0, lowerY, 0)));
    this.ring.position.copy(center);
    this.ring.scale.setScalar(0.75 + intensity * 0.35 + flash * 0.15);
    this.ringMaterial.opacity = Math.min(1, intensity * 0.75 + flash * 0.75);
    this.ring.visible = true;
    this.flashCore.visible = flash > 0.01;
    this.flashCore.position.copy(center);
    this.flashCore.position.z += 0.55;
    this.flashCore.position.y += 0.02;
    this.flashCore.scale.setScalar(1 + flash * 1.2);
    this.flashMaterial.opacity = flash * 0.8;
    this.light.position.copy(center);
    this.light.position.y += 0.06;
    this.light.intensity = intensity * 10 + flash * 24;
  }

  dispose(): void {
    for (const geometry of this.ownedGeometries) geometry.dispose();
    for (const material of this.ownedMaterials) material.dispose();
  }
}

const fxRegistry = new WeakMap<AssembledModel, KingJoeLowerFx>();

export function getKingJoeLowerFx(assembled: AssembledModel): KingJoeLowerFx {
  let fx = fxRegistry.get(assembled);
  if (!fx) {
    fx = new KingJoeLowerFx();
    assembled.root.add(fx.group);
    const originalDispose = assembled.dispose.bind(assembled);
    assembled.dispose = () => {
      fx?.dispose();
      fx?.group.removeFromParent();
      originalDispose();
    };
    fxRegistry.set(assembled, fx);
  }
  return fx;
}
