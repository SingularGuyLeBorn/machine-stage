import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { buildModel, detectStatic, validateRegistry } from "@/three/parts";
import { makeKingJoeModuleRegistry, kingjoeModuleBuilders, moduleData, poseKingJoeModules } from "./registry";
import skin from "../kingjoe-skin/segments.generated.json";

function vertexKey(x: number, y: number, z: number): string {
  return [x, y, z].map((v) => Math.round(v * 1e5)).join(",");
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

  it("原双臂顶点仍全部属于头肩模块，四肢不会进入横切路径", () => {
    const model = buildModel(registry, { builders: kingjoeModuleBuilders });
    const p = model.parts
      .find((p) => p.partId === "kingjoemodules.head_arms.body")!
      .geometry.getAttribute("position");
    const vertices = new Set(
      Array.from({ length: p.count }, (_, i) => vertexKey(p.getX(i), p.getY(i), p.getZ(i))),
    );
    const arms = skin.parts.filter((s) =>
      /upperarm|forearm|hand|finger|elbow_guard|wrist_guard/.test(s.semantic),
    );
    expect(arms.length).toBeGreaterThan(50);
    for (const arm of arms) {
      const bytes = Buffer.from(arm.position, "base64");
      const pos = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.length / 4);
      for (let i = 0; i < pos.length; i += 3) {
        const target = new THREE.Vector3(-pos[i]!, pos[i + 1]! + 4.55, -pos[i + 2]!);
        if (!vertices.has(vertexKey(target.x, target.y, target.z))) {
          // 源分件的局部 Float32 坐标还原及焊接会产生微米级差异；核查真实距离避免量化边界误报。
          let nearest = Infinity;
          for (let j = 0; j < p.count; j++) {
            nearest = Math.min(nearest, target.distanceTo(new THREE.Vector3().fromBufferAttribute(p, j)));
          }
          expect(nearest, `${arm.key} 顶点遗漏`).toBeLessThan(1e-5);
        }
      }
    }
    const limbSources = moduleData.audit.filter((a) =>
      /Arm|Hand|Finger|Forearm|Clavicle|Bone00/.test(a.bone),
    );
    expect(limbSources.every((a) => a.module === "head_arms" && !a.cut)).toBe(true);
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
