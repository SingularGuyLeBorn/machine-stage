import * as THREE from "three";
import type { AssembledModel } from "../../assembler/assembler";

// [OM-FREEPLAY] 密集折线电束分成亮芯与细分支，使用折面条带而非圆柱光炮。
const STEPS = 32;
/** 双束向内收 28% 半间距，末端保留 72% 间距；共同下倾约 4°，不会交叉。 */
export function redRayEnd(
  start: THREE.Vector3,
  other: THREE.Vector3,
  forward: THREE.Vector3,
  up: THREE.Vector3,
): THREE.Vector3 {
  const inward = other.clone().sub(start).multiplyScalar(0.14);
  return start.clone().addScaledVector(forward, 4.5).add(inward).addScaledVector(up, -0.32);
}
function ribbon(): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array((STEPS + 1) * 6), 3));
  const index: number[] = [];
  for (let i = 0; i < STEPS; i++) {
    const k = i * 2;
    index.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
  }
  g.setIndex(index);
  return g;
}
class PedanRays {
  group = new THREE.Group();
  strands = Array.from({ length: 24 }, (_, i) => {
    const mesh = new THREE.Mesh(
      ribbon(),
      new THREE.MeshBasicMaterial({
        color: i % 3 === 0 ? 0xfff0cf : 0xff3329,
        side: THREE.DoubleSide,
        transparent: true,
        depthWrite: false,
        blending: THREE.NormalBlending,
        toneMapped: false,
      }),
    );
    mesh.frustumCulled = false;
    this.group.add(mesh);
    return mesh;
  });
  constructor(private model: AssembledModel) {
    this.group.name = "kingjoe-pedan-z-rays";
    model.root.add(this.group);
    this.group.visible = false;
    const dispose = model.dispose.bind(model);
    model.dispose = () => {
      for (const mesh of this.strands) {
        mesh.geometry.dispose();
        mesh.material.dispose();
      }
      this.group.removeFromParent();
      dispose();
    };
  }
  update(seconds: number, module: string | null, yellow: number, redPower: number): void {
    this.group.visible = (!!module && redPower > 0.01) || yellow > 0.01;
    if (!this.group.visible) return;
    const origins: THREE.Vector3[] = [];
    if (module) {
      for (const suffix of ["l", "r"]) {
        const node = this.model.getNode(`Antenna_${module}_${suffix}`)!;
        origins.push(this.model.root.worldToLocal(node.localToWorld(new THREE.Vector3(0, 0.93, 0))));
      }
    } else {
      origins.push(
        this.model.root.worldToLocal(
          this.model.getNode("Module_head_arms")!.localToWorld(new THREE.Vector3(0, 6.195, 0.66)),
        ),
      );
    }
    // 光束顶点写在模型根节点局部空间；方向也必须去掉根节点的世界变换。
    const moduleMatrix = new THREE.Matrix4()
      .copy(this.model.root.matrixWorld)
      .invert()
      .multiply(this.model.getNode(`Module_${module ?? "head_arms"}`)!.matrixWorld);
    for (const [j, mesh] of this.strands.entries()) {
      const start = origins[j % origins.length]!;
      const heading = new THREE.Vector3(0, 0, 1).transformDirection(moduleMatrix);
      const across = new THREE.Vector3(1, 0, 0).transformDirection(moduleMatrix),
        up = new THREE.Vector3(0, 1, 0).transformDirection(moduleMatrix);
      const length = module ? 4.5 : 5.8 * yellow;
      const end = module
        ? redRayEnd(start, origins[(j + 1) % 2]!, heading, up)
        : start.clone().addScaledVector(heading, length);
      const attr = mesh.geometry.getAttribute("position");
      for (let i = 0; i <= STEPS; i++) {
        const t = i / STEPS,
          envelope = Math.pow(Math.sin(Math.PI * t), 0.35);
        const zig = (i % 2 === 0 ? 1 : -1) * (0.06 + (j % 6) * 0.012) * envelope;
        const p = start
          .clone()
          .lerp(end, t)
          .addScaledVector(across, zig + Math.sin(seconds * 19 + j * 2.3 + i * 0.8) * 0.025 * envelope)
          .addScaledVector(
            up,
            ((j % 5) - 2) * 0.035 * envelope + Math.cos(seconds * 17 + i + j) * 0.015 * envelope,
          );
        const width = j % 3 === 0 ? 0.006 : 0.003;
        const a = p.clone().addScaledVector(up, width),
          b = p.clone().addScaledVector(up, -width);
        attr.setXYZ(i * 2, a.x, a.y, a.z);
        attr.setXYZ(i * 2 + 1, b.x, b.y, b.z);
      }
      attr.needsUpdate = true;
      mesh.material.color.set(
        module ? (j % 3 === 0 ? 0xff5030 : 0xe51912) : j % 3 === 0 ? 0xffef65 : 0xffbd0c,
      );
      mesh.material.opacity = (module ? redPower : yellow) * (0.65 + 0.3 * Math.sin(seconds * 24 + j) ** 2);
    }
  }
}
const cache = new WeakMap<AssembledModel, PedanRays>();
export function updatePedanRays(
  model: AssembledModel,
  seconds: number,
  module: string | null,
  yellow: number,
  redPower: number,
): void {
  let rays = cache.get(model);
  if (!rays) {
    rays = new PedanRays(model);
    cache.set(model, rays);
  }
  rays.update(seconds, module, yellow, redPower);
}
