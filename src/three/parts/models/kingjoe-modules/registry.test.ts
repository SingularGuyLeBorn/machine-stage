import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { buildModel, detectStatic, validateRegistry, partitionExpectedContacts } from "@/three/parts";
import { makeKingJoeModuleRegistry, kingjoeModuleBuilders, moduleData, poseKingJoeModules } from "./registry";
import skin from "../kingjoe-skin/segments.generated.json";
import { MeshBVH } from "three-mesh-bvh";

function vertexKey(x: number, y: number, z: number): string {
  return [x, y, z].map((v) => Math.round(v * 1e5)).join(",");
}

function connectedCount(triangles: THREE.Vector3[][]): number {
  const graph = new Map<string, Set<string>>();
  for (const tri of triangles) {
    const keys = tri.map((v) => vertexKey(v.x, v.y, v.z));
    for (const key of keys) {
      const neighbors = graph.get(key) ?? new Set<string>();
      keys.forEach((other) => neighbors.add(other));
      graph.set(key, neighbors);
    }
  }
  let count = 0;
  const remaining = new Set(graph.keys());
  while (remaining.size) {
    count++;
    const queue = [remaining.values().next().value!];
    while (queue.length) {
      const key = queue.pop()!;
      if (!remaining.delete(key)) continue;
      queue.push(...graph.get(key)!);
    }
  }
  return count;
}

function triangles(geometry: THREE.BufferGeometry): THREE.Vector3[][] {
  const p = geometry.getAttribute("position");
  const index = geometry.index!;
  return Array.from({ length: index.count / 3 }, (_, i) =>
    [0, 1, 2].map((k) => new THREE.Vector3().fromBufferAttribute(p, index.getX(i * 3 + k))),
  );
}

function contactSurface(geometry: THREE.BufferGeometry, mate: THREE.BufferGeometry, label: string) {
  const target = mate.clone();
  const tree = new MeshBVH(target);
  const faces = triangles(geometry).filter(([a, b, c]) => {
    const center = a!
      .clone()
      .add(b!)
      .add(c!)
      .multiplyScalar(1 / 3);
    const samples = [
      center,
      a!,
      b!,
      c!,
      a!.clone().lerp(b!, 0.5),
      b!.clone().lerp(c!, 0.5),
      c!.clone().lerp(a!, 0.5),
    ];
    // 弧形肩面与外壳在浅角度相交，过宽容差会把邻近外表面误收为接触面。
    return samples.every((p) => tree.closestPointToPoint(p)!.distance < 1e-6);
  });
  target.dispose();
  expect(connectedCount(faces), `${label} 接触面必须连续`).toBe(1);
  const edges = new Map<string, { count: number; a: THREE.Vector3; b: THREE.Vector3 }>();
  let area = 0;
  for (const [a, b, c] of faces) {
    area += new THREE.Triangle(a!, b!, c!).getArea();
    for (const [u, v] of [
      [a!, b!],
      [b!, c!],
      [c!, a!],
    ]) {
      const key = [vertexKey(u!.x, u!.y, u!.z), vertexKey(v!.x, v!.y, v!.z)].sort().join("|");
      const edge = edges.get(key) ?? { count: 0, a: u!, b: v! };
      edge.count++;
      edges.set(key, edge);
    }
  }
  const boundary = [...edges.values()].filter((e) => e.count === 1);
  // 连同阶梯侧壁和槽底计算：凹槽不是穿孔，整个接口只能有一圈外边界。
  expect(connectedCount(boundary.map((e) => [e.a, e.b])), `${label} 接口不能有穿孔`).toBe(1);
  const degree = new Map<string, number>();
  for (const edge of boundary)
    for (const v of [edge.a, edge.b]) {
      const key = vertexKey(v.x, v.y, v.z);
      degree.set(key, (degree.get(key) ?? 0) + 1);
    }
  expect(
    [...degree.entries()].filter(([, d]) => d !== 2),
    `${label} 边界分叉`,
  ).toEqual([]);
  return { boundary, area, faces };
}

describe("参考图四模块闭合分体", () => {
  const registry = makeKingJoeModuleRegistry();

  it("剧照眼带沿头壳后倾，金属框背面贴壳，玻璃保留纵向透光而没有横向百叶", () => {
    const model = buildModel(registry, { builders: kingjoeModuleBuilders });
    const head = model.getPart("kingjoemodules.head_arms.body")!.geometry.clone();
    const tree = new MeshBVH(head);
    const frame = model.getPart("kingjoemodules.ship.visor_housing")!;
    const glass = model.getPart("kingjoemodules.ship.visor_glass")!;
    expect(model.getPart("kingjoemodules.ship.visor_louvers")).toBeUndefined();
    expect(glass.def.node).toBe("Module_head_arms");
    const p = frame.geometry.getAttribute("position");
    const half = p.count / 2;
    for (let i = half; i < p.count; i += 23) {
      const ray = new THREE.Ray(new THREE.Vector3(p.getX(i), p.getY(i), 2), new THREE.Vector3(0, 0, -1));
      const hit = tree.raycastFirst(ray, THREE.DoubleSide)!;
      expect(hit.point.z - p.getZ(i)).toBeCloseTo(0.008, 5);
      expect(p.getZ(i - half)).toBeGreaterThan(hit.point.z);
    }
    glass.geometry.computeBoundingBox();
    const size = glass.geometry.boundingBox!.getSize(new THREE.Vector3());
    expect(size.y).toBeGreaterThan(0.19);
    expect(size.z).toBeGreaterThan(0.11);
    const colors = glass.geometry.getAttribute("color");
    const green = Array.from({ length: colors.count }, (_, i) => colors.getY(i));
    expect(Math.max(...green) - Math.min(...green)).toBeGreaterThan(0.2);
    expect(registry.materials.kjm_visor_glass.emissiveIntensity ?? 0).toBe(0);
    head.dispose();
    model.dispose();
  });

  it("实际渲染几何逐边闭合且绕序一致，包含所有附加细节", () => {
    expect(validateRegistry(registry).filter((e) => e.level === "error")).toEqual([]);
    const model = buildModel(registry, { builders: kingjoeModuleBuilders });
    for (const part of model.parts) {
      const geometry = part.geometry;
      const p = geometry.getAttribute("position");
      const index = geometry.index;
      const edges = new Map<string, { count: number; orientation: number }>();
      const keys = Array.from({ length: p.count }, (_, i) => vertexKey(p.getX(i), p.getY(i), p.getZ(i)));
      let signedVolume = 0;
      for (let i = 0; i < (index?.count ?? p.count); i += 3) {
        const ids = [0, 1, 2].map((k) => (index ? index.getX(i + k) : i + k));
        const [a, b, c] = ids.map((j) => new THREE.Vector3().fromBufferAttribute(p, j));
        const cross = b!.clone().sub(a!).cross(c!.clone().sub(a!));
        expect(cross.length(), `${part.partId}: 退化面`).toBeGreaterThan(1e-12);
        signedVolume += a!.dot(b!.clone().cross(c!)) / 6;
        for (let k = 0; k < 3; k++) {
          const ka = keys[ids[k]!]!;
          const kb = keys[ids[(k + 1) % 3]!]!;
          const key = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
          const edge = edges.get(key) ?? { count: 0, orientation: 0 };
          edge.count++;
          edge.orientation += ka < kb ? 1 : -1;
          edges.set(key, edge);
        }
      }
      const invalid = [...edges.entries()].filter(([, e]) => e.count !== 2 || e.orientation !== 0);
      expect(invalid, `${part.partId}: 开边/非流形边/绕序错误`).toEqual([]);
      expect(signedVolume, `${part.partId}: 非正体积`).toBeGreaterThan(0);
    }
    model.dispose();
  }, 20000);

  it("四个主体各自只有一个连通实体，头臂和髋腿不能仅在节点树内归组", () => {
    const model = buildModel(registry, { builders: kingjoeModuleBuilders });
    for (const part of model.parts.filter((p) => p.partId.endsWith(".body"))) {
      expect(connectedCount(triangles(part.geometry)), part.partId).toBe(1);
    }
    model.dispose();
  });

  it("三对立体接触面连续无孔，台阶侧壁和槽底均与另一半吻合", () => {
    const model = buildModel(registry, { builders: kingjoeModuleBuilders });
    const body = (key: string) =>
      model.parts.find((p) => p.partId === `kingjoemodules.${key}.body`)!.geometry;
    for (const [lower, upper] of [
      ["legs", "pelvis"],
      ["pelvis", "chest"],
      ["chest", "head_arms"],
    ] as const) {
      const a = contactSurface(body(lower), body(upper), `${lower}->${upper}`),
        b = contactSurface(body(upper), body(lower), `${upper}->${lower}`);
      // 颈部与肩臂共面区域会跨越整块三角面，完整三角形子集的面积不能代表裁剪后的接口面积。
      // 新前甲与腹盆外侧也相贴，三角形会跨接触区边界；仅未改的髋接口比较整面面积。
      if (lower === "legs") expect(a.area, `${lower}/${upper} 面积`).toBeCloseTo(b.area, 4);
      // 腹盆退台随壳体轮廓起伏，不要求它退化为多个水平平面。
      const heights = a.faces.flatMap((t) => t.map((v) => v.y));
      expect(Math.max(...heights) - Math.min(...heights), `${lower}/${upper} 立体接口深度`).toBeGreaterThan(
        0.4,
      );
      for (const [from, to] of [
        [a, b],
        [b, a],
      ])
        for (const edge of from!.boundary) {
          if (lower !== "legs") continue;
          const distance = Math.min(
            ...to!.boundary.map((e) =>
              new THREE.Line3(e.a, e.b)
                .closestPointToPoint(edge.a, true, new THREE.Vector3())
                .distanceTo(edge.a),
            ),
          );
          expect(distance, `${lower}/${upper} 边界`).toBeLessThan(2e-5);
        }
    }
    model.dispose();
  });

  it("胸甲圆 U 口及双榫与头肩的凹槽逐点吻合", () => {
    const model = buildModel(registry, { builders: kingjoeModuleBuilders });
    const geometry = model.getPart("kingjoemodules.chest.body")!.geometry.clone();
    const mate = model.getPart("kingjoemodules.head_arms.body")!.geometry.clone();
    const tree = new MeshBVH(geometry),
      other = new MeshBVH(mate);
    for (const [x, z, min, max] of [
      [0, 0.45, 5.28, 5.3],
      [0, -0.2, 5.02, 5.05],
      [-0.5, 0.6, 5.28, 5.3],
      [0.5, 0.6, 5.28, 5.3],
      [-0.31, -0.16, 5.55, 5.57],
      [0.31, -0.16, 5.55, 5.57],
    ]) {
      const hit = tree.raycastFirst(
        new THREE.Ray(new THREE.Vector3(x, 6, z), new THREE.Vector3(0, -1, 0)),
        THREE.DoubleSide,
      )!;
      expect(hit.point.y).toBeGreaterThan(min!);
      expect(hit.point.y).toBeLessThan(max! + 1e-6);
      expect(other.closestPointToPoint(hit.point)!.distance).toBeLessThan(2e-5);
    }
    geometry.dispose();
    mate.dispose();
    model.dispose();
  });

  it("腹盆上下凸台有真实高度，胸甲双榫嵌入头肩凹槽", () => {
    const model = buildModel(registry, { builders: kingjoeModuleBuilders });
    const body = (key: string) =>
      model.parts.find((p) => p.partId === `kingjoemodules.${key}.body`)!.geometry;
    const contains = (key: string, point: THREE.Vector3) => {
      const geometry = body(key).clone();
      const tree = new MeshBVH(geometry);
      const hits = tree.raycast(
        new THREE.Ray(point, new THREE.Vector3(0.829, 0.337, 0.447).normalize()),
        THREE.DoubleSide,
      );
      const inside = new Set(hits.map((hit) => Math.round(hit.distance * 1e6))).size % 2 === 1;
      geometry.dispose();
      return inside;
    };
    const pelvis = body("pelvis");
    pelvis.computeBoundingBox();
    expect(pelvis.boundingBox!.min.y).toBeCloseTo(3.08, 4);
    expect(pelvis.boundingBox!.max.y).toBeCloseTo(4.52, 4);
    for (const [owner, other, p] of [
      ["pelvis", "chest", [0, 4.3, 0.08]],
      ["chest", "pelvis", [0.44, 4.3, 0.08]],
      ["pelvis", "legs", [0, 3.18, 0.08]],
      ["legs", "pelvis", [0.5, 3.18, 0.08]],
      ["chest", "head_arms", [0.31, 5.38, -0.07]],
      ["head_arms", "chest", [0, 5.1, -0.2]],
    ] as const) {
      const point = new THREE.Vector3(...p);
      expect(contains(owner, point), `${owner} 应包含凸台内部`).toBe(true);
      expect(contains(other, point), `${other} 应留出嵌入凹槽`).toBe(false);
    }
    model.dispose();
  });

  it("腹盆山脊中央高、两侧斜落，前后退层不等同于同心圆盘", () => {
    const model = buildModel(registry, { builders: kingjoeModuleBuilders });
    const geometry = model.parts.find((p) => p.partId === "kingjoemodules.pelvis.body")!.geometry.clone();
    const tree = new MeshBVH(geometry);
    const topAt = (x: number, z: number) =>
      tree.raycastFirst(
        new THREE.Ray(new THREE.Vector3(x, 5, z), new THREE.Vector3(0, -1, 0)),
        THREE.DoubleSide,
      )!.point.y;
    expect(topAt(0, 0)).toBeCloseTo(4.52, 4);
    expect(topAt(0, 0) - topAt(-0.3, 0)).toBeGreaterThan(0.12);
    expect(topAt(0, 0) - topAt(0.3, 0)).toBeGreaterThan(0.12);
    // 同一层正面轮廓是斜面；前后分层保留台肩，而非把四周按同一半径缩小。
    const shoulderDrop = topAt(0.22, 0.2) - topAt(0.32, 0.2);
    expect(shoulderDrop).toBeGreaterThan(0.02);
    expect(shoulderDrop).toBeLessThan(0.05); // 宽厚缓肩，不再收成尖帽斜面。
    expect(topAt(0, 0.4) - topAt(0, -0.4)).toBeGreaterThan(0.07);
    expect(topAt(0, 0.2) - topAt(0, 0.5)).toBeGreaterThan(0.07);
    // 退层前沿必须随外壳向两侧回弯；旧山形板的正面是同一 Z 平面，无法通过此检查。
    const frontAt = (x: number) =>
      tree.raycastFirst(
        new THREE.Ray(new THREE.Vector3(x, 4.16, 2), new THREE.Vector3(0, 0, -1)),
        THREE.DoubleSide,
      )!.point.z;
    expect(frontAt(0) - frontAt(0.3)).toBeGreaterThan(0.07);
    expect(frontAt(0.3) - frontAt(0.45)).toBeGreaterThan(0.08);
    expect(frontAt(-0.3)).toBeCloseTo(frontAt(0.3), 2);
    geometry.dispose();
    model.dispose();
  });

  it("腹盆顶部为有限面积的小平顶，下面宽肩承托，胸甲同步留出平底凹槽", () => {
    const model = buildModel(registry, { builders: kingjoeModuleBuilders });
    const geometries = ["pelvis", "chest"].map((key) =>
      model.parts.find((p) => p.partId === `kingjoemodules.${key}.body`)!.geometry.clone(),
    );
    const [pelvis, chest] = geometries.map((g) => new MeshBVH(g));
    for (const x of [-0.08, 0, 0.08])
      for (const z of [-0.03, 0, 0.03]) {
        const point = new THREE.Vector3(x, 4.52, z);
        const hit = pelvis!.raycastFirst(
          new THREE.Ray(new THREE.Vector3(x, 5, z), new THREE.Vector3(0, -1, 0)),
          THREE.DoubleSide,
        )!;
        expect(hit.point.y).toBeCloseTo(4.52, 5);
        expect(hit.face!.normal.y).toBeCloseTo(1, 5);
        expect(chest!.closestPointToPoint(point)!.distance).toBeLessThan(1e-6);
      }
    const flatArea = triangles(geometries[0]!)
      .filter((t) => t.every((v) => Math.abs(v.y - 4.52) < 1e-6))
      .reduce((sum, [a, b, c]) => sum + new THREE.Triangle(a!, b!, c!).getArea(), 0);
    expect(flatArea).toBeGreaterThan(0.025);
    expect(flatArea).toBeLessThan(0.09);
    for (const x of [-0.3, 0.3]) {
      const shoulder = pelvis!.raycastFirst(
        new THREE.Ray(new THREE.Vector3(x, 5, 0.15), new THREE.Vector3(0, -1, 0)),
        THREE.DoubleSide,
      )!;
      expect(shoulder.point.y).toBeGreaterThan(4.32);
      expect(shoulder.point.y).toBeLessThan(4.47);
    }
    geometries.forEach((g) => g.dispose());
    model.dispose();
  });

  it("原双臂全部包含于头肩实体，布尔融合仅消去内部面，不截断手臂", () => {
    const model = buildModel(registry, { builders: kingjoeModuleBuilders });
    const geometry = model.parts.find((p) => p.partId === "kingjoemodules.head_arms.body")!.geometry.clone();
    const tree = new MeshBVH(geometry);
    const arms = skin.parts.filter((s) =>
      /upperarm|forearm|hand|finger|elbow_guard|wrist_guard/.test(s.semantic),
    );
    expect(arms.length).toBeGreaterThan(50);
    let upperArmSamples = 0;
    let exposedUpperArmSamples = 0;
    for (const arm of arms) {
      const bytes = Buffer.from(arm.position, "base64");
      const pos = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.length / 4);
      for (let i = 0; i < pos.length; i += 3) {
        const target = new THREE.Vector3(-pos[i]!, pos[i + 1]! + 4.55, -pos[i + 2]!);
        const nearest = tree.closestPointToPoint(target)!;
        if (/upperarm/.test(arm.semantic)) {
          upperArmSamples++;
          if (nearest.distance < 1e-4) exposedUpperArmSamples++;
        }
        if (nearest.distance > 2e-5) {
          // 最近点可能位于凹边，单个面的法线不足以判断内外；用穿过闭合表面的次数判断包含关系。
          const hits = tree.raycast(
            new THREE.Ray(target, new THREE.Vector3(0.829, 0.337, 0.447).normalize()),
            THREE.DoubleSide,
          );
          const distances = [...new Set(hits.map((hit) => Math.round(hit.distance * 1e6)))];
          // 源壳焊接与布尔简化累计允许 0.1mm 数值误差。
          expect(nearest.distance < 1e-4 || distances.length % 2 === 1, `${arm.key} 原表面在实体外`).toBe(
            true,
          );
        }
      }
    }
    // 大臂既要保留，也必须仍是外表面；不能被额外填入的避让体埋住。
    expect(exposedUpperArmSamples / upperArmSamples).toBeGreaterThan(0.7);
    const limbSources = moduleData.audit.filter((a) =>
      /Arm|Hand|Finger|Forearm|Clavicle|Bone00/.test(a.bone),
    );
    expect(limbSources.every((a) => a.module === "head_arms" && !a.cut)).toBe(true);
    geometry.dispose();
    model.dispose();
  });

  it("肩筒下方不再外挂竖直胶囊，直接保留原上臂斜接轮廓", () => {
    const model = buildModel(registry, { builders: kingjoeModuleBuilders });
    const geometry = model.parts.find((p) => p.partId === "kingjoemodules.head_arms.body")!.geometry.clone();
    const tree = new MeshBVH(geometry);
    for (const side of [-1, 1]) {
      // 旧胶囊占据的位置应留空；双臂完整且与头肩连通由上面的实体测试同时约束。
      const point = new THREE.Vector3(side * 1.2, 5.1, 0);
      const hits = tree.raycast(
        new THREE.Ray(point, new THREE.Vector3(0.829, 0.337, 0.447).normalize()),
        THREE.DoubleSide,
      );
      expect(new Set(hits.map((hit) => Math.round(hit.distance * 1e6))).size % 2).toBe(0);
      expect(tree.closestPointToPoint(point)!.distance).toBeGreaterThan(0.07);
    }
    geometry.dispose();
    model.dispose();
  });

  it("合体时胸甲不覆盖大臂外侧，颈肩接口不扩大前后遮挡", () => {
    const model = buildModel(registry, { builders: kingjoeModuleBuilders });
    poseKingJoeModules(model, 0, "closed");
    model.syncInstances();
    model.root.updateMatrixWorld(true);
    const geometries = ["head_arms", "chest"].map((key) => {
      const part = model.getPart(`kingjoemodules.${key}.body`)!;
      return part.geometry.clone().applyMatrix4(model.instanceMatrix(part, 0, new THREE.Matrix4()));
    });
    const [head, chest] = geometries.map((g) => new MeshBVH(g));
    const sourceTriangles = skin.parts
      .filter((p) => /upperarm/.test(p.semantic))
      .flatMap((arm) => {
        const decode = (value: string) => {
          const bytes = Buffer.from(value, "base64");
          return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length);
        };
        const positions = new Float32Array(decode(arm.position));
        const indices = new Uint32Array(decode(arm.index));
        return Array.from({ length: indices.length / 3 }, (_, i) => {
          const vertices = [0, 1, 2].map((k) => {
            const j = indices[i * 3 + k]! * 3;
            return new THREE.Vector3(-positions[j]!, positions[j + 1]! + 4.55, -positions[j + 2]!);
          });
          return new THREE.Triangle(vertices[0]!, vertices[1]!, vertices[2]!);
        });
      });
    // [OM-FREEPLAY] 前后上限来自本次已确认前壳的合体视线检查，保留少量采样余量；
    // 正面允许前壳对大臂内缘的自然投影重叠，左右外侧则不允许被胸甲遮住。
    for (const [label, towardViewer, maximum] of [
      ["正面", new THREE.Vector3(0, 0, 1), 0.48],
      ["背面", new THREE.Vector3(0, 0, -1), 0.18],
      ["左侧", new THREE.Vector3(-1, 0, 0), 0],
      ["右侧", new THREE.Vector3(1, 0, 0), 0],
    ] as const) {
      const sides = [
        { visible: 0, hidden: 0 },
        { visible: 0, hidden: 0 },
      ];
      for (const triangle of sourceTriangles) {
        const facing = triangle.getNormal(new THREE.Vector3()).dot(towardViewer);
        if (facing <= 0.05) continue;
        const center = triangle.getMidpoint(new THREE.Vector3());
        const ray = new THREE.Ray(
          center.clone().addScaledVector(towardViewer, 10),
          towardViewer.clone().negate(),
        );
        const sourceHit = head!.raycastFirst(ray, THREE.DoubleSide);
        if (!sourceHit || Math.abs(sourceHit.distance - 10) > 0.0002) continue;
        const area = triangle.getArea() * facing;
        const side = sides[center.x < 0 ? 0 : 1]!;
        side.visible += area;
        const blocker = chest!.raycastFirst(ray, THREE.DoubleSide);
        if (blocker && blocker.distance < 10 - 0.0002) side.hidden += area;
      }
      const visibleSides = sides.filter((s) => s.visible > 0.01);
      expect(visibleSides.length, `${label} 必须覆盖可见大臂`).toBe(towardViewer.z === 0 ? 1 : 2);
      for (const side of visibleSides)
        expect(side.hidden / side.visible, `${label} 胸甲遮挡比例`).toBeLessThanOrEqual(maximum);
    }
    geometries.forEach((g) => g.dispose());
    model.dispose();
  });

  it("胸甲上窄下展，云斑彩窗沿弧面闭合且不是横向色条", () => {
    const model = buildModel(registry, { builders: kingjoeModuleBuilders });
    const body = model.parts.find((p) => p.partId === "kingjoemodules.chest.body")!.geometry;
    const p = body.getAttribute("position");
    const widthAt = (low: number, high: number) => {
      let width = 0;
      for (let i = 0; i < p.count; i++)
        if (p.getZ(i) > 0.78 && p.getY(i) > low && p.getY(i) < high)
          width = Math.max(width, Math.abs(p.getX(i)));
      return width;
    };
    expect(widthAt(4.1, 4.5)).toBeGreaterThan(widthAt(5.0, 5.15) + 0.1);
    const windows = model.parts.filter((p) => /chest\.glass/.test(p.partId));
    expect(windows).toHaveLength(2);
    for (const window of windows) {
      const positions = window.geometry.getAttribute("position");
      const colors = window.geometry.getAttribute("color");
      const red: number[] = [];
      for (let i = 0; i < positions.count; i++)
        if (Math.abs(positions.getY(i) - 4.6) < 0.01) red.push(colors.getX(i));
      // 同一高度横向也有明显色团变化，不能退回仅随高度着色的条纹。
      expect(Math.max(...red) - Math.min(...red)).toBeGreaterThan(0.12);
      expect(registry.materials[window.def.material]!.vertexColors).toBe(true);
    }
    expect(registry.parts.some((p) => /chest.*(louver|grille|spine)/.test(p.id))).toBe(false);
    model.dispose();
  });

  it("整机和展开保持细节与所属模块同行，原模型轮廓尺寸不变", () => {
    const model = buildModel(registry, { builders: kingjoeModuleBuilders });
    poseKingJoeModules(model, 0, "closed");
    model.syncInstances();
    model.root.updateMatrixWorld(true);
    const bounds = new THREE.Box3();
    for (const part of model.parts.filter((p) => p.partId.endsWith(".body")))
      bounds.union(model.partBounds(part, new THREE.Box3()));
    const size = bounds.getSize(new THREE.Vector3());
    expect(size.x).toBeCloseTo(3.683, 2);
    expect(size.y).toBeCloseTo(6.618, 2);
    expect(size.z).toBeCloseTo(2.086, 2);
    poseKingJoeModules(model, 0, "idle");
    model.syncInstances();
    model.root.updateMatrixWorld(true);
    expect(model.getNode("ModuleHeadDetails")!.parent).toBe(model.getNode("Module_head_arms"));
    expect(
      registry.parts.filter((p) => /chest\.(glass|rim)/.test(p.id)).every((p) => p.node === "Module_chest"),
    ).toBe(true);
    expect(
      partitionExpectedContacts(detectStatic(model, { minDepthM: 0.0005 }), registry.expectedContacts ?? [])
        .active,
    ).toEqual([]);
    model.dispose();
  });
});
