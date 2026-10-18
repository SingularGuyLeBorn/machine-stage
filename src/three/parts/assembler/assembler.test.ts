import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { makeTestRegistry, testKitLayouts } from "../registry/testKit";
import { validateRegistry } from "../registry/validate";
import { buildModel } from "./assembler";

const flushErrors = (registry: ReturnType<typeof makeTestRegistry>) =>
  validateRegistry(registry).filter((issue) => issue.level === "error");

describe("assembler 装配器", () => {
  it("测试表可通过校验并完成装配", () => {
    const registry = makeTestRegistry();
    expect(flushErrors(registry)).toEqual([]);
    const model = buildModel(registry, { instanceLayouts: testKitLayouts });
    expect(model.parts.length).toBe(3);
    // 节点树
    const rotor = model.getNode("TestRotor");
    expect(rotor).toBeDefined();
    expect(rotor!.parent).toBe(model.root);
    expect(rotor!.position.y).toBeCloseTo(1.75, 6); // PILLAR_Y + PILLAR_H/2 = 1.5+0.25
    model.dispose();
  });

  it("实例矩阵按布局生成，实例级可寻址", () => {
    const registry = makeTestRegistry({ gap: 0.001 });
    const model = buildModel(registry, { instanceLayouts: testKitLayouts });
    const box = model.getPart("test.frame.box")!;
    expect(box.instanced).toBe(true);
    expect(box.instances.length).toBe(2);
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    model.instanceMatrix(box, 0, matrix);
    position.setFromMatrixPosition(matrix);
    expect(position.x).toBeCloseTo(0, 9);
    model.instanceMatrix(box, 1, matrix);
    position.setFromMatrixPosition(matrix);
    expect(position.x).toBeCloseTo(0.999, 6); // BOX - GAP（instanceMatrix 存储为 float32）
    model.dispose();
  });

  it("Mate 锚点定位：改常量 → 派生位置自动跟随", () => {
    const makeWith = (pillarDelta: number) => {
      const registry = makeTestRegistry();
      registry.constants.PILLAR_Y = `BOX+${pillarDelta}`;
      return buildModel(registry, { instanceLayouts: testKitLayouts });
    };
    const low = makeWith(0.5);
    const high = makeWith(1.5);
    expect(low.getPart("test.frame.pillar")!.object.position.y).toBeCloseTo(1.5, 9);
    expect(high.getPart("test.frame.pillar")!.object.position.y).toBeCloseTo(2.5, 9);
    low.dispose();
    high.dispose();
  });

  it("锚点装配：立柱抬高 1m → 转子轴与翼片一起跟着抬（不靠手写坐标）", () => {
    const makeWith = (pillarY: string) => {
      const registry = makeTestRegistry();
      registry.constants.PILLAR_Y = pillarY;
      return buildModel(registry, { instanceLayouts: testKitLayouts });
    };
    const low = makeWith("BOX+0.5");
    const high = makeWith("BOX+1.5");
    // 翼片底面贴在立柱顶面：立柱中心 +0.25 → 顶面，再 +FIN_H/2 → 板中心
    const centerY = (model: ReturnType<typeof buildModel>) => {
      const box = model.partBounds(model.getPart("test.frame.fin")!, new THREE.Box3());
      return box.getCenter(new THREE.Vector3()).y;
    };
    expect(centerY(low)).toBeCloseTo(1.75 + 0.15, 6);
    expect(centerY(high)).toBeCloseTo(2.75 + 0.15, 6);
    const rotor = low.getNode("TestRotor")!;
    expect(rotor.position.y).toBeCloseTo(1.75, 9);
    low.dispose();
    high.dispose();
  });

  it("双侧件展开：_l 在前、_r 镜像（x 取反）", () => {
    const registry = makeTestRegistry();
    registry.parts.push({
      id: "test.frame.fender",
      name_cn: "翼子板",
      name_en: "fender",
      assembly: "frame",
      build_layer: 4,
      build_order: 401,
      geometry: { type: "plate", w: 0.6, h: 0.2, t: 0.01 },
      material: "probe",
      dual: true,
      mate: { type: "absolute", position: [1.2, 1.8, 0], rotation: [0, 10, 0] },
    });
    const model = buildModel(registry, { instanceLayouts: testKitLayouts });
    const left = model.parts.find((handle) => handle.partId === "test.frame.fender_l")!;
    const right = model.parts.find((handle) => handle.partId === "test.frame.fender_r")!;
    expect(left).toBeDefined();
    expect(right).toBeDefined();
    const leftIndex = model.parts.indexOf(left);
    const rightIndex = model.parts.indexOf(right);
    expect(leftIndex).toBeLessThan(rightIndex);
    expect(left.object.position.x).toBeCloseTo(1.2, 9);
    expect(right.object.position.x).toBeCloseTo(-1.2, 9);
    // 镜像旋转：ry → -ry
    expect(left.object.rotation.y).toBeCloseTo(THREE.MathUtils.degToRad(10), 9);
    expect(right.object.rotation.y).toBeCloseTo(THREE.MathUtils.degToRad(-10), 9);
    // 几何镜像：x 包围盒翻转
    left.geometry.computeBoundingBox();
    right.geometry.computeBoundingBox();
    expect(left.geometry.boundingBox!.min.x).toBeCloseTo(-right.geometry.boundingBox!.max.x, 9);
    model.dispose();
  });

  it("构建滑杆：阈值只隐藏阈值以上的零件", () => {
    const registry = makeTestRegistry();
    const model = buildModel(registry, { instanceLayouts: testKitLayouts });
    model.setBuildThreshold(101);
    expect(model.getPart("test.frame.box")!.object.visible).toBe(true);
    expect(model.getPart("test.frame.pillar")!.object.visible).toBe(false);
    model.setBuildThreshold(null);
    expect(model.getPart("test.frame.pillar")!.object.visible).toBe(true);
    model.dispose();
  });

  it("可动节点：resetNodes 清除姿态残留", () => {
    const registry = makeTestRegistry();
    const model = buildModel(registry, { instanceLayouts: testKitLayouts });
    const rotor = model.getNode("TestRotor")!;
    rotor.rotation.y = 0.7;
    expect(rotor.rotation.y).toBeCloseTo(0.7, 9);
    model.resetNodes();
    expect(rotor.rotation.y).toBe(0);
    expect(rotor.position.y).toBeCloseTo(1.75, 9);
    model.dispose();
  });

  it("dispose 释放场景与几何", () => {
    const registry = makeTestRegistry();
    const model = buildModel(registry, { instanceLayouts: testKitLayouts });
    const root = model.root;
    model.dispose();
    expect(root.children.length).toBe(0);
  });
});
