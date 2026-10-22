import * as THREE from "three";
import { MeshBVH } from "three-mesh-bvh";
import type { AssembledModel } from "../../assembler/assembler";
import type { Openings } from "./motion";

export const CONTACT_PAIRS = [
  ["legs", "pelvis"],
  ["pelvis", "chest"],
  ["chest", "head_arms"],
] as const;
interface SurfaceTriangle {
  a: THREE.Vector3;
  b: THREE.Vector3;
  c: THREE.Vector3;
  normal: THREE.Vector3;
  area: number;
}

/** 从实际网格的共面接触面采样，包含弧面和退层侧壁，不使用固定圆环锚点。 */
export function contactTriangles(
  lower: THREE.BufferGeometry,
  upper: THREE.BufferGeometry,
): SurfaceTriangle[] {
  const copy = upper.clone(),
    tree = new MeshBVH(copy),
    result: SurfaceTriangle[] = [];
  const p = lower.getAttribute("position"),
    index = lower.index!;
  for (let i = 0; i < index.count; i += 3) {
    const [a, b, c] = [0, 1, 2].map((j) => new THREE.Vector3().fromBufferAttribute(p, index.getX(i + j))) as [
      THREE.Vector3,
      THREE.Vector3,
      THREE.Vector3,
    ];
    const samples = [
      a,
      b,
      c,
      a.clone().lerp(b, 0.5),
      b.clone().lerp(c, 0.5),
      c.clone().lerp(a, 0.5),
      a
        .clone()
        .add(b)
        .add(c)
        .multiplyScalar(1 / 3),
    ];
    if (!samples.every((v) => tree.closestPointToPoint(v)!.distance < 2e-5)) continue;
    const tri = new THREE.Triangle(a, b, c),
      normal = tri.getNormal(new THREE.Vector3());
    if (normal.y > 0.12) result.push({ a, b, c, normal, area: tri.getArea() });
  }
  copy.dispose();
  return result;
}

export function randomSurfacePoint(faces: SurfaceTriangle[], random: () => number): THREE.Vector3 {
  let area = random() * faces.reduce((sum, f) => sum + f.area, 0),
    face = faces[faces.length - 1]!;
  for (const f of faces) {
    area -= f.area;
    if (area <= 0) {
      face = f;
      break;
    }
  }
  const u = Math.sqrt(random()),
    v = random();
  return face.a
    .clone()
    .multiplyScalar(1 - u)
    .addScaledVector(face.b, u * (1 - v))
    .addScaledVector(face.c, u * v);
}

const SEGMENTS = 12,
  SIDES = 5;
function tube(): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array((SEGMENTS + 1) * SIDES * 3), 3));
  const indices: number[] = [];
  for (let j = 0; j < SEGMENTS; j++)
    for (let k = 0; k < SIDES; k++) {
      const a = j * SIDES + k,
        b = j * SIDES + ((k + 1) % SIDES),
        c = a + SIDES,
        d = b + SIDES;
      indices.push(a, b, c, b, d, c);
    }
  g.setIndex(indices);
  return g;
}
function writeTube(g: THREE.BufferGeometry, points: THREE.Vector3[], radius: number): void {
  const attr = g.getAttribute("position");
  for (let i = 0; i <= SEGMENTS; i++) {
    const dir = points[Math.min(SEGMENTS, i + 1)]!.clone()
      .sub(points[Math.max(0, i - 1)]!)
      .normalize();
    const u = new THREE.Vector3(1, 0, 0).cross(dir).normalize();
    if (u.lengthSq() < 0.1) u.set(0, 0, 1);
    const v = dir.clone().cross(u).normalize();
    for (let j = 0; j < SIDES; j++) {
      const angle = (j / SIDES) * Math.PI * 2;
      const p = points[i]!.clone()
        .addScaledVector(u, Math.cos(angle) * radius)
        .addScaledVector(v, Math.sin(angle) * radius);
      attr.setXYZ(i * SIDES + j, p.x, p.y, p.z);
    }
  }
  attr.needsUpdate = true;
}

class ModuleEffects {
  readonly group = new THREE.Group();
  readonly rigs;
  constructor(private readonly model: AssembledModel) {
    this.group.name = "kingjoemodules.contact-arcs";
    this.group.visible = false;
    this.rigs = CONTACT_PAIRS.map(([lower, upper]) => {
      const low = model.getPart(`kingjoemodules.${lower}.body`)!.geometry.clone();
      const high = model.getPart(`kingjoemodules.${upper}.body`)!.geometry.clone();
      const faces = contactTriangles(low, high),
        lowTree = new MeshBVH(low),
        highTree = new MeshBVH(high);
      // [OM-FREEPLAY] 每个接口最多六束短寿命电弧，白芯蓝晕；不添加悬浮光圈。
      const chains = Array.from({ length: 6 }, () => {
        const core = new THREE.Mesh(
          tube(),
          new THREE.MeshBasicMaterial({
            color: 0xe8fbff,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          }),
        );
        const glow = new THREE.Mesh(
          tube(),
          new THREE.MeshBasicMaterial({
            color: 0x39baff,
            transparent: true,
            opacity: 0.25,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          }),
        );
        core.frustumCulled = glow.frustumCulled = false;
        this.group.add(glow, core);
        return { core, glow };
      });
      const light = new THREE.PointLight(0x69cbff, 0, 2.8);
      this.group.add(light);
      return { lower, upper, faces, low, high, lowTree, highTree, chains, light };
    });
    model.root.add(this.group);
    const dispose = model.dispose.bind(model);
    model.dispose = () => {
      this.dispose();
      dispose();
    };
  }

  update(time: number, openings: Openings): void {
    this.group.visible = Object.values(openings).some((u) => u > 0.0001 && u < 0.24);
    if (!this.group.visible) return;
    for (let dock = 0; dock < this.rigs.length; dock++) {
      const rig = this.rigs[dock]!;
      const low = this.model.getNode(`Module_${rig.lower}`)!.position;
      const high = this.model.getNode(`Module_${rig.upper}`)!.position;
      const delta = high.clone().sub(low),
        distance = delta.length();
      const charge = Math.min(1, Math.max(0, (0.24 - openings[rig.upper]) / 0.2));
      const strength = charge * Math.min(1, distance / 0.025);
      const ready = openings[rig.lower] < 0.025 && distance < 1.5 && distance > 0.001;
      let lit = 0;
      rig.chains.forEach(({ core, glow }, chain) => {
        let seed = (Math.floor(time * 17 + chain * 0.37) * 104729 + dock * 7919 + chain * 997 + 1) >>> 0;
        const random = () => {
          seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
          return seed / 4294967296;
        };
        core.visible = glow.visible =
          ready &&
          strength > 0.01 &&
          chain < 1 + Math.floor(charge * 5) &&
          random() > 0.16 &&
          rig.faces.length > 0;
        if (!core.visible) return;
        let point: THREE.Vector3 | undefined;
        // 剔除会穿过凸台内部的连线，仅在相向且已露出的接触面间放电。
        for (let attempt = 0; attempt < 32; attempt++) {
          const p = randomSurfacePoint(rig.faces, random),
            dir = delta.clone().normalize();
          const lowerRay = new THREE.Ray(p.clone().addScaledVector(dir, 0.0001), dir);
          const upperRay = new THREE.Ray(p.clone().addScaledVector(dir, -0.0001), dir.clone().negate());
          const a = rig.lowTree.raycastFirst(lowerRay, THREE.DoubleSide),
            b = rig.highTree.raycastFirst(upperRay, THREE.DoubleSide);
          if ((!a || a.distance > distance - 0.0002) && (!b || b.distance > distance - 0.0002)) {
            point = p;
            break;
          }
        }
        if (!point) {
          core.visible = glow.visible = false;
          return;
        }
        const lowPoint = point.clone().add(low),
          highPoint = point.clone().add(high);
        // 初期只在接口旁冒出细短电花，再逐渐增长为跨越间隙的电弧。
        const reach = Math.min(1, 0.08 + charge * 1.35);
        const a = chain % 2 === 0 ? lowPoint : highPoint,
          b = a.clone().lerp(chain % 2 === 0 ? highPoint : lowPoint, reach);
        const points = Array.from({ length: SEGMENTS + 1 }, (_, i) => {
          const u = i / SEGMENTS,
            p = a.clone().lerp(b, u),
            jitter = Math.sin(Math.PI * u) ** 2 * Math.min(0.12, distance * 0.16) * charge;
          p.x += (random() - 0.5) * jitter;
          p.z += (random() - 0.5) * jitter;
          return p;
        });
        writeTube(core.geometry, points, 0.0015 + 0.004 * charge);
        writeTube(glow.geometry, points, 0.003 + 0.014 * charge);
        core.material.opacity = strength * (0.65 + random() * 0.35);
        glow.material.opacity = strength * 0.25;
        rig.light.position.copy(a).lerp(b, 0.5);
        lit++;
      });
      rig.light.intensity = lit * 0.5 * strength;
    }
  }

  dispose(): void {
    this.rigs.forEach((r) => {
      r.low.dispose();
      r.high.dispose();
      r.chains.forEach((c) => {
        c.core.geometry.dispose();
        c.glow.geometry.dispose();
        c.core.material.dispose();
        c.glow.material.dispose();
      });
    });
    this.group.removeFromParent();
  }
}
const effects = new WeakMap<AssembledModel, ModuleEffects>();
export function getModuleEffects(model: AssembledModel): ModuleEffects {
  let fx = effects.get(model);
  if (!fx) {
    fx = new ModuleEffects(model);
    effects.set(model, fx);
  }
  return fx;
}
export function hideModuleEffects(model: AssembledModel): void {
  const fx = effects.get(model);
  if (fx) fx.group.visible = false;
}
