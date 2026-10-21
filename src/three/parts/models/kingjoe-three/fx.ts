import * as THREE from "three";
import type { AssembledModel } from "../../assembler/assembler";
import { ABDOMEN_LOW, HEAD_LOW, WAIST_SEAT_Y } from "./constants";

// ============================================================================
// models/kingjoe-three/fx —— 腰缝/颈根/双腕电弧 + 锁死闪光
//
// 场景级 FX，不参与零件树/穿模/悬空检测。腰缝 6 条、颈根 4 条、双腕各 2 条；
// 锚点从 lower/torso/headhands 节点实时取，三组分开时电弧跟着拉长、拉断。
// ============================================================================

export interface KingJoeThreeFxFrame {
  time: number;
  waist: number;
  head: number;
  flash: number;
}

const SEGMENTS = 8;

interface ChainRig {
  line: THREE.LineSegments;
  material: THREE.LineBasicMaterial;
  kind: "waist" | "neck" | "wrist";
  index: number;
  count: number;
}

function pseudo(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export class KingJoeThreeFx {
  readonly group = new THREE.Group();
  private readonly chains: ChainRig[] = [];
  private readonly ring: THREE.Mesh;
  private readonly ringMaterial: THREE.MeshBasicMaterial;
  private readonly flashCore: THREE.Mesh;
  private readonly flashMaterial: THREE.MeshBasicMaterial;
  private readonly light: THREE.PointLight;
  private readonly ownedGeometries = new Set<THREE.BufferGeometry>();
  private readonly ownedMaterials = new Set<THREE.Material>();

  constructor() {
    this.group.name = "kingjoe-three.fx";
    this.group.visible = false;

    const addChains = (kind: ChainRig["kind"], count: number) => {
      for (let index = 0; index < count; index++) {
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
        this.chains.push({ line, material, kind, index, count });
      }
    };
    addChains("waist", 6);
    addChains("neck", 4);
    addChains("wrist", 4);

    const ringGeometry = new THREE.TorusGeometry(0.67, 0.025, 8, 48);
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

  update(assembled: AssembledModel, frame: KingJoeThreeFxFrame): void {
    const waist = Math.min(1, Math.max(0, frame.waist));
    const head = Math.min(1, Math.max(0, frame.head));
    const flash = Math.min(1, Math.max(0, frame.flash));
    const visible = waist > 0.01 || head > 0.01 || flash > 0.01;
    this.group.visible = visible;
    if (!visible) return;

    const lower = assembled.getNode("lower");
    const torso = assembled.getNode("torso");
    const headhands = assembled.getNode("headhands");
    if (!lower || !torso || !headhands) return;

    assembled.root.updateMatrixWorld(true);
    const rootInverse = new THREE.Matrix4().copy(assembled.root.matrixWorld).invert();
    const toLocal = (point: THREE.Vector3): THREE.Vector3 => point.applyMatrix4(rootInverse);
    const nodeLocal = (node: THREE.Object3D, x: number, y: number, z: number): THREE.Vector3 =>
      toLocal(node.localToWorld(new THREE.Vector3(x, y, z)));

    const neckY = HEAD_LOW + 0.14;
    for (const chain of this.chains) {
      const intensity = chain.kind === "waist" ? waist : head;
      const opacity = Math.min(1, intensity * 0.9 + flash * 0.4);
      chain.material.opacity = opacity;
      chain.line.visible = intensity > 0.01 || flash > 0.01;
      if (!chain.line.visible) continue;

      let lowerAnchor: THREE.Vector3;
      let upperAnchor: THREE.Vector3;
      let radialX: number;
      let radialZ: number;
      let bulgeBase: number;
      const angle = (chain.index / chain.count) * Math.PI * 2 + frame.time * 0.35;
      if (chain.kind === "waist") {
        radialX = Math.cos(angle);
        radialZ = Math.sin(angle);
        lowerAnchor = nodeLocal(lower, radialX * 0.55, WAIST_SEAT_Y + 0.02, radialZ * 0.55);
        upperAnchor = nodeLocal(torso, radialX * 0.55, ABDOMEN_LOW + 0.02, radialZ * 0.55);
        bulgeBase = 0.18 + intensity * 0.22;
      } else if (chain.kind === "neck") {
        radialX = Math.cos(angle);
        radialZ = Math.sin(angle);
        lowerAnchor = nodeLocal(torso, radialX * 0.42, neckY, radialZ * 0.42);
        upperAnchor = nodeLocal(headhands, radialX * 0.42, neckY, radialZ * 0.42);
        bulgeBase = 0.12 + intensity * 0.2;
      } else {
        const side = chain.index < 2 ? -1 : 1;
        const variant = chain.index % 2;
        const x = side * (1.46 + variant * 0.12);
        lowerAnchor = nodeLocal(torso, x, 3.42 - variant * 0.06, 0.12 + variant * 0.08);
        upperAnchor = nodeLocal(headhands, x, 3.42 - variant * 0.06, 0.12 + variant * 0.08);
        radialX = side;
        radialZ = 0.2;
        bulgeBase = 0.14 + intensity * 0.2;
      }

      const positions = chain.line.geometry.getAttribute("position") as THREE.BufferAttribute;
      for (let segment = 0; segment < SEGMENTS; segment++) {
        const t0 = segment / SEGMENTS;
        const t1 = (segment + 1) / SEGMENTS;
        const jitter = (t: number, offset: number): THREE.Vector3 => {
          const point = lowerAnchor.clone().lerp(upperAnchor, t);
          const seed = frame.time * 13.7 + chain.index * 7.3 + segment * 3.1 + offset + (chain.kind === "waist" ? 0 : 31);
          const amp = 0.03 + intensity * 0.08;
          const bulge = Math.sin(Math.PI * t) * bulgeBase;
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
    }

    const waistCenter = nodeLocal(lower, 0, WAIST_SEAT_Y + 0.02, 0);
    this.ring.position.copy(waistCenter);
    this.ring.scale.setScalar(0.85 + waist * 0.25 + flash * 0.15);
    this.ringMaterial.opacity = Math.min(1, waist * 0.65 + flash * 0.7);
    this.ring.visible = waist > 0.01 || flash > 0.01;
    this.flashCore.visible = flash > 0.01;
    this.flashCore.position.copy(waistCenter);
    this.flashCore.position.z += 0.6;
    this.flashCore.scale.setScalar(1 + flash * 1.2);
    this.flashMaterial.opacity = flash * 0.8;
    this.light.position.copy(waistCenter);
    this.light.position.y += 0.06;
    this.light.intensity = waist * 8 + head * 3 + flash * 22;
  }

  dispose(): void {
    for (const geometry of this.ownedGeometries) geometry.dispose();
    for (const material of this.ownedMaterials) material.dispose();
  }
}

const fxRegistry = new WeakMap<AssembledModel, KingJoeThreeFx>();

export function getKingJoeThreeFx(assembled: AssembledModel): KingJoeThreeFx {
  let fx = fxRegistry.get(assembled);
  if (!fx) {
    fx = new KingJoeThreeFx();
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
