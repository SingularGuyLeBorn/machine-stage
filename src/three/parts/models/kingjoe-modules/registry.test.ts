import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { buildModel, detectStatic, validateRegistry } from "@/three/parts";
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
    return samples.every((p) => tree.closestPointToPoint(p)!.distance < 3e-5);
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
  expect(connectedCount(boundary.map((e) => [e.a, e.b])), "接口不能有穿孔").toBe(1);
  const degree = new Map<string, number>();
  for (const edge of boundary)
    for (const v of [edge.a, edge.b]) {
      const key = vertexKey(v.x, v.y, v.z);
      degree.set(key, (degree.get(key) ?? 0) + 1);
    }
  expect([...degree.values()].every((d) => d === 2)).toBe(true);
  return { boundary, area, faces };
}

describe("参考图四模块闭合分体", () => {
  const registry = makeKingJoeModuleRegistry();

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
  });

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
      // 两对腹盆接口逐面核对面积；颈部另用三维探针直接核对前后错层。
      if (lower !== "chest") expect(a.area, `${lower}/${upper} 面积`).toBeCloseTo(b.area, 4);
      const horizontal = new Set(
        a.faces
          .filter((t) => Math.max(...t.map((v) => v.y)) - Math.min(...t.map((v) => v.y)) < 1e-5)
          .map((t) => Math.round(t[0]!.y * 1e4)),
      );
      expect(horizontal.size, `${lower}/${upper} 具有台肩与顶底面`).toBeGreaterThanOrEqual(2);
      for (const [from, to] of [
        [a, b],
        [b, a],
      ])
        for (const edge of from!.boundary) {
          if (lower === "chest") continue;
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

  it("颈部三个水平面及前后半颈的竖直分界在两件上逐点重合", () => {
    const model = buildModel(registry, { builders: kingjoeModuleBuilders });
    const geometries = ["chest", "head_arms"].map((key) =>
      model.parts.find((p) => p.partId === `kingjoemodules.${key}.body`)!.geometry.clone(),
    );
    const trees = geometries.map((g) => new MeshBVH(g));
    const probes: THREE.Vector3[] = [];
    for (const x of [-0.2, 0, 0.2]) {
      for (const z of [0.1, 0.2]) probes.push(new THREE.Vector3(x, 5.48, z));
      for (const z of [-0.2, -0.4]) probes.push(new THREE.Vector3(x, 4.8, z));
      probes.push(new THREE.Vector3(x, 5.25, 0.55));
      for (const y of [4.9, 5.1, 5.38]) probes.push(new THREE.Vector3(x, y, 0));
    }
    for (const p of probes)
      for (const tree of trees)
        expect(tree.closestPointToPoint(p)!.distance, `颈部接口 ${p.toArray()}`).toBeLessThan(2e-5);
    geometries.forEach((g) => g.dispose());
    model.dispose();
  });

  it("腹盆上下凸台有真实高度，颈部前半归胸部、后半归头肩", () => {
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
      ["chest", "head_arms", [0, 5.38, 0.2]],
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
    expect(topAt(0, 0) - topAt(-0.3, 0)).toBeGreaterThan(0.2);
    expect(topAt(0, 0) - topAt(0.3, 0)).toBeGreaterThan(0.2);
    // 同一层正面轮廓是斜面；前后分层保留台肩，而非把四周按同一半径缩小。
    expect(topAt(0.22, 0.2) - topAt(0.32, 0.2)).toBeGreaterThan(0.05);
    expect(topAt(0, 0.2) - topAt(0, -0.2)).toBeGreaterThan(0.1);
    expect(topAt(0, 0.2) - topAt(0, 0.4)).toBeGreaterThan(0.1);
    geometry.dispose();
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
    for (const arm of arms) {
      const bytes = Buffer.from(arm.position, "base64");
      const pos = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.length / 4);
      for (let i = 0; i < pos.length; i += 3) {
        const target = new THREE.Vector3(-pos[i]!, pos[i + 1]! + 4.55, -pos[i + 2]!);
        const nearest = tree.closestPointToPoint(target)!;
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
      expect(tree.closestPointToPoint(point)!.distance).toBeGreaterThan(0.1);
    }
    geometry.dispose();
    model.dispose();
  });

  it("整机和展开保持细节与所属模块同行，原模型轮廓尺寸不变", () => {
    const model = buildModel(registry, { builders: kingjoeModuleBuilders });
    poseKingJoeModules(model, 0, "closed");
    model.syncInstances();
    model.root.updateMatrixWorld(true);
    const size = new THREE.Box3().setFromObject(model.root).getSize(new THREE.Vector3());
    expect(size.x).toBeCloseTo(3.683, 2);
    expect(size.y).toBeCloseTo(6.618, 2);
    expect(size.z).toBeCloseTo(2.086, 2);
    poseKingJoeModules(model, 0, "idle");
    model.syncInstances();
    model.root.updateMatrixWorld(true);
    expect(model.getNode("ModuleHeadDetails")!.parent).toBe(model.getNode("Module_head_arms"));
    expect(model.getNode("ModuleChestDetails")!.parent).toBe(model.getNode("Module_chest"));
    expect(detectStatic(model, { minDepthM: 0.0005 })).toEqual([]);
    model.dispose();
  });
});
