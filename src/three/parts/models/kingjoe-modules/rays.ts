import * as THREE from "three";
import type { AssembledModel } from "../../assembler/assembler";

// 原创佩丹折线光束：每个发射口一条连续 Z 字实体，不用多股错位叠线。
const STEPS = 32;
/** [OM-FREEPLAY] 近距胸口目标：红束末端保留 46% 间距，前伸 3.2、下落 0.7，不交叉。 */
export function redRayEnd(
  start: THREE.Vector3,
  other: THREE.Vector3,
  forward: THREE.Vector3,
  up: THREE.Vector3,
): THREE.Vector3 {
  const inward = other.clone().sub(start).multiplyScalar(0.27);
  return start.clone().addScaledVector(forward, 3.2).add(inward).addScaledVector(up, -0.7);
}
/** [OM-FREEPLAY] 头屏光束从屏幕向近处胸高目标下倾，包络控制伸出长度。 */
export function yellowRayEnd(
  start: THREE.Vector3,
  forward: THREE.Vector3,
  up: THREE.Vector3,
  power: number,
): THREE.Vector3 {
  return start
    .clone()
    .addScaledVector(forward, 3.8 * power)
    .addScaledVector(up, -1.3 * power);
}
// 每束只有一条中心折线，四边实体截面沿中心线构建；加粗截面，不叠加错位 Z。
const SECTION = 4;
function ribbon(): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array((STEPS + 1) * SECTION * 3), 3));
  const index: number[] = [];
  for (let i = 0; i < STEPS; i++)
    for (let face = 0; face < SECTION; face++) {
      const a = i * SECTION + face,
        b = i * SECTION + ((face + 1) % SECTION);
      index.push(a, b, a + SECTION, b, b + SECTION, a + SECTION);
    }
  index.push(0, 2, 1, 0, 3, 2);
  const end = STEPS * SECTION;
  index.push(end, end + 1, end + 2, end, end + 2, end + 3);
  g.setIndex(index);
  return g;
}
class PedanRays {
  group = new THREE.Group();
  strands = Array.from({ length: 3 }, () => {
    const mesh = new THREE.Mesh(
      ribbon(),
      new THREE.MeshBasicMaterial({
        color: 0xff4930,
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
  update(
    seconds: number,
    module: string | null,
    yellow: number,
    redPower: number,
    boostAt: (position: number) => number,
    widthScale: number,
  ): void {
    this.group.visible = (!!module && redPower > 0.01) || yellow > 0.01;
    if (!this.group.visible) return;
    const origins: THREE.Vector3[] = [];
    if (module)
      for (const suffix of ["l", "r"]) {
        const node = this.model.getNode(`Antenna_${module}_${suffix}`)!;
        origins.push(this.model.root.worldToLocal(node.localToWorld(new THREE.Vector3(0, 0.93, 0))));
      }
    else
      origins.push(
        this.model.root.worldToLocal(
          this.model.getNode("Module_head_arms")!.localToWorld(new THREE.Vector3(0, 6.195, 0.66)),
        ),
      );
    const moduleMatrix = new THREE.Matrix4()
      .copy(this.model.root.matrixWorld)
      .invert()
      .multiply(this.model.getNode(`Module_${module ?? "head_arms"}`)!.matrixWorld);
    const heading = new THREE.Vector3(0, 0, 1).transformDirection(moduleMatrix);
    const across = new THREE.Vector3(1, 0, 0).transformDirection(moduleMatrix);
    const up = new THREE.Vector3(0, 1, 0).transformDirection(moduleMatrix);
    for (const [j, mesh] of this.strands.entries()) {
      mesh.visible = module ? j < 2 : j === 2;
      if (!mesh.visible) continue;
      const start = origins[module ? j : 0]!;
      const end = module
        ? redRayEnd(start, origins[1 - j]!, heading, up)
        : yellowRayEnd(start, heading, up, yellow);
      const attr = mesh.geometry.getAttribute("position");
      for (let i = 0; i <= STEPS; i++) {
        const t = i / STEPS,
          envelope = Math.pow(Math.sin(Math.PI * t), 0.35);
        // [OM-FREEPLAY] 黄色实体截面比红色宽；加力波逐段把截面放大到 2.1 倍，折线条数不变。
        const zig = (i % 2 === 0 ? 1 : -1) * (module ? 0.115 : 0.16) * envelope;
        const p = start
          .clone()
          .lerp(end, t)
          .addScaledVector(across, zig)
          .addScaledVector(up, Math.sin(seconds * 17 + i * 0.6) * 0.008 * envelope);
        const radius = (module ? 0.018 : 0.045) * widthScale * (1 + 1.1 * boostAt(t));
        for (let k = 0; k < SECTION; k++) {
          const angle = Math.PI / 4 + (k * Math.PI) / 2;
          const vertex = p
            .clone()
            .addScaledVector(up, Math.cos(angle) * radius)
            .addScaledVector(across, Math.sin(angle) * radius);
          attr.setXYZ(i * SECTION + k, vertex.x, vertex.y, vertex.z);
        }
      }
      attr.needsUpdate = true;
      mesh.material.color.set(module ? 0xff3c28 : 0xffd22b);
      mesh.material.opacity = (module ? redPower : yellow) * (0.88 + 0.1 * boostAt(0));
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
  boostAt: (position: number) => number = () => 0,
  widthScale = 1,
): void {
  let rays = cache.get(model);
  if (!rays) {
    rays = new PedanRays(model);
    cache.set(model, rays);
  }
  rays.update(seconds, module, yellow, redPower, boostAt, widthScale);
}
