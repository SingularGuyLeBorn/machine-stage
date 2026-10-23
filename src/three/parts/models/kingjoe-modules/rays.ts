import * as THREE from "three";
import type { AssembledModel } from "../../assembler/assembler";
import { createRayMaterial } from "./ray-material";

// 原创佩丹折线光束：每个发射口一条连续 Z 字光带，柔边和流动交给材质。
const BENDS = 32;
export const RAY_SUBDIVISIONS = 6;
const STEPS = BENDS * RAY_SUBDIVISIONS;
// [OM-FREEPLAY] 连续的多频扰动：索引决定空间纹理，时间只让纹理流动，避免逐帧随机闪烁。
const grain = (index: number, seconds: number) =>
  0.58 * Math.sin(index * 2.399 + seconds * 13) +
  0.28 * Math.sin(index * 5.71 - seconds * 23) +
  0.14 * Math.sin(index * 11.13 + seconds * 31);
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
// 四个截面采样点保留毛边/锚点测量；只渲染一面对着相机的光带，消除封闭实体的厚重感。
const SECTION = 4;
function ribbon(): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array((STEPS + 1) * SECTION * 3), 3));
  for (const name of ["beamCenter", "beamTangent"])
    g.setAttribute(name, new THREE.BufferAttribute(new Float32Array((STEPS + 1) * SECTION * 3), 3));
  g.setAttribute("beamRadius", new THREE.BufferAttribute(new Float32Array((STEPS + 1) * SECTION), 1));
  const uv = new Float32Array((STEPS + 1) * SECTION * 2);
  for (let i = 0; i <= STEPS; i++)
    for (let k = 0; k < SECTION; k++) {
      uv[(i * SECTION + k) * 2] = i / STEPS;
      uv[(i * SECTION + k) * 2 + 1] = k === 0 || k === 3 ? -1 : 1;
    }
  g.setAttribute("beamUv", new THREE.BufferAttribute(uv, 2));
  const index: number[] = [];
  for (let i = 0; i < STEPS; i++) {
    const a = i * SECTION,
      b = a + 1;
    index.push(a, b, a + SECTION, b, b + SECTION, a + SECTION);
  }
  g.setIndex(index);
  return g;
}
class PedanRays {
  group = new THREE.Group();
  strands = Array.from({ length: 3 }, () => {
    const mesh = new THREE.Mesh(ribbon(), createRayMaterial());
    mesh.frustumCulled = false;
    // [OM-FREEPLAY] 少量短弧贴在主干边缘，只延伸局部，不复制一整束 Z。
    const sparks = new THREE.LineSegments(
      new THREE.BufferGeometry().setAttribute(
        "position",
        new THREE.BufferAttribute(new Float32Array(12 * 3 * 2 * 3), 3),
      ),
      new THREE.LineBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false }),
    );
    sparks.frustumCulled = false;
    mesh.add(sparks);
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
        const sparks = mesh.children[0] as THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
        sparks.geometry.dispose();
        sparks.material.dispose();
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
      const centers = mesh.geometry.getAttribute("beamCenter");
      const radii = mesh.geometry.getAttribute("beamRadius");
      const tangents = mesh.geometry.getAttribute("beamTangent");
      for (let i = 0; i <= STEPS; i++) {
        const t = i / STEPS,
          envelope = i === 0 || i === STEPS ? 0 : Math.pow(Math.sin(Math.PI * t), 0.35);
        // [OM-FREEPLAY] 黄色光带比红色宽；加力波逐段把宽度放大到 2.1 倍，折线条数不变。
        const segment = Math.floor(i / RAY_SUBDIVISIONS);
        const fraction = (i % RAY_SUBDIVISIONS) / RAY_SUBDIVISIONS;
        const zig = (segment % 2 === 0 ? 1 : -1) * (1 - 2 * fraction) * (module ? 0.115 : 0.16) * envelope;
        const radius = (module ? 0.018 : 0.045) * widthScale * (1 + 1.1 * boostAt(t));
        const p = start
          .clone()
          .lerp(end, t)
          .addScaledVector(across, zig)
          .addScaledVector(across, grain(i + j * 71, seconds) * radius * 0.45 * envelope)
          .addScaledVector(up, grain(i + 103 + j * 71, seconds) * radius * 0.55 * envelope);
        for (let k = 0; k < SECTION; k++) {
          const angle = Math.PI / 4 + (k * Math.PI) / 2;
          const noise = grain(i + k * 47 + j * 71, seconds);
          const raggedRadius =
            radius * (1 + envelope * (0.55 * noise + 1.2 * Math.pow(Math.max(0, noise), 7)));
          const vertex = p
            .clone()
            .addScaledVector(up, Math.cos(angle) * raggedRadius)
            .addScaledVector(across, Math.sin(angle) * raggedRadius);
          attr.setXYZ(i * SECTION + k, vertex.x, vertex.y, vertex.z);
          centers.setXYZ(i * SECTION + k, p.x, p.y, p.z);
          radii.setX(i * SECTION + k, raggedRadius);
        }
      }
      attr.needsUpdate = true;
      for (let i = 0; i <= STEPS; i++) {
        const before = Math.max(0, i - 1) * SECTION,
          after = Math.min(STEPS, i + 1) * SECTION;
        for (let k = 0; k < SECTION; k++)
          tangents.setXYZ(
            i * SECTION + k,
            centers.getX(after) - centers.getX(before),
            centers.getY(after) - centers.getY(before),
            centers.getZ(after) - centers.getZ(before),
          );
      }
      centers.needsUpdate = radii.needsUpdate = tangents.needsUpdate = true;
      mesh.material.uniforms.tint!.value.set(module ? 0xff3c28 : 0xffd22b);
      mesh.material.uniforms.power!.value = (module ? redPower : yellow) * (0.88 + 0.1 * boostAt(0));
      mesh.material.uniforms.flowTime!.value = seconds;
      const sparks = mesh.children[0] as THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
      const sparkPositions = sparks.geometry.getAttribute("position");
      for (let s = 0; s < 12; s++) {
        const section = 8 + s * 15;
        const base = new THREE.Vector3().fromBufferAttribute(attr, section * SECTION + (s % SECTION));
        const pulse = Math.pow(Math.max(0, Math.sin(seconds * 9 + s * 2.399)), 6);
        const length = (module ? 0.07 : 0.11) * widthScale * pulse * (1 + 0.4 * boostAt(section / STEPS));
        let previous = base;
        for (let n = 0; n < 3; n++) {
          const next = base
            .clone()
            .addScaledVector(up, ((length * (n + 1)) / 3) * (s % 2 ? 1 : -1))
            .addScaledVector(across, length * (n % 2 ? -0.28 : 0.38))
            .addScaledVector(heading, length * (n + 1) * 0.3);
          const index = (s * 3 + n) * 2;
          sparkPositions.setXYZ(index, previous.x, previous.y, previous.z);
          sparkPositions.setXYZ(index + 1, next.x, next.y, next.z);
          previous = next;
        }
      }
      sparkPositions.needsUpdate = true;
      sparks.material.color.copy(mesh.material.uniforms.tint!.value);
      sparks.material.opacity = mesh.material.uniforms.power!.value * 0.22;
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
