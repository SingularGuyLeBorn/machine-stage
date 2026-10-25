import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { setImmediate as yieldToRunner } from "node:timers/promises";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { Box3, Raycaster, Vector3 } from "three";
import { buildModel } from "../../assembler/assembler";
import { resolveSpec } from "../../assembler/geometry";
import { validateRegistry } from "../../registry/validate";
import { detectStatic } from "../../solver/detect";
import { detectFloatingIslands, detectUnsupportedParts } from "../../solver/support";
import { applyExplode, clearExplode, explodeOffsetOf } from "@/app/three/pose";
import { makeHmtRegistry } from "./registry";
import { hmtBuilders, shellPoint } from "./geometry";
import machining from "./machined.generated.json";

const build = () => buildModel(makeHmtRegistry(), { builders: hmtBuilders });

describe("HMT 参考重建", () => {
  let model: ReturnType<typeof build>;
  // 高密度壳体装配只做一次，所有检查使用同一份实际几何。
  beforeAll(() => {
    model = build();
  }, 120_000);
  afterAll(() => model.dispose());
  // 高密度网格的连续同步检查会占满事件循环；每个用例后让测试进程发送完成报告。
  // 只让出事件循环，不增加固定等待时间，也不改变任何几何断言或阈值。
  afterEach(() => yieldToRunner());
  it("加工数据来自当前形体与姿态，未沿用旧版修配结果", () => {
    for (const [name, hash] of Object.entries(machining.sources)) {
      expect(
        createHash("sha256")
          .update(readFileSync(new URL(name, import.meta.url)))
          .digest("hex"),
        name,
      ).toBe(hash);
    }
  });
  it("注册表合法且不使用碰撞豁免", () => {
    const registry = makeHmtRegistry();
    expect(validateRegistry(registry)).toEqual([]);
    expect(registry.expectedContacts ?? []).toEqual([]);
  });
  // 每层独立报告并使用既有超时，避免五次完整扫描共用一个用例的时间额度。
  it.each([1, 2, 3, 4, 5])(
    "L%s 实际装配无穿模",
    (layer) => {
      const reports = detectStatic(model, { filter: (p) => p.buildLayer <= layer });
      expect(reports.map((r) => `${r.a} ↔ ${r.b}`)).toEqual([]);
    },
    120_000,
  );
  it("全部零件属于一个有支撑的装配组件", () => {
    expect(detectUnsupportedParts(model)).toEqual([]);
    expect(detectFloatingIslands(model).components).toBe(1);
  }, 120_000);

  it("胸甲开窗是通孔，旁边护板仍有实体", () => {
    const plate = model.getPart("hmt.chest.carapace")!;
    model.root.updateMatrixWorld(true);
    const ray = new Raycaster(
      new Vector3(0.122, 0.062, 0.5).applyMatrix4(plate.object.matrixWorld),
      new Vector3(0, 0, -1).transformDirection(plate.object.matrixWorld),
    );
    expect(ray.intersectObject(plate.object, false)).toHaveLength(0);
    ray.ray.origin.set(0.205, -0.02, 0.5).applyMatrix4(plate.object.matrixWorld);
    expect(ray.intersectObject(plate.object, false).length).toBeGreaterThan(0);
  }, 120_000);

  it("三节腰部铸造甲从正面分别可见，不被相邻护甲或缸体遮住", () => {
    const source = makeHmtRegistry({ machined: false });
    model.root.updateMatrixWorld(true);
    for (const i of [0, 1, 2]) {
      const id = `hmt.waist.vertebra_${i}`;
      const plate = model.getPart(id)!;
      const def = source.parts.find((part) => part.id === id)!;
      const spec = resolveSpec(def.geometry, model.constants) as { params: Record<string, unknown> };
      const point = shellPoint(spec.params, 0, 0).applyMatrix4(plate.object.matrixWorld);
      const ray = new Raycaster(point.clone().add(new Vector3(0, 0, 1)), new Vector3(0, 0, -1));
      const hits = ray.intersectObjects(
        model.parts.map((part) => part.object),
        false,
      );
      expect(hits[0]?.object, id).toBe(plate.object);
    }
  }, 120_000);

  it("液压缸有连续轴孔，活塞杆实际伸入缸内", () => {
    model.root.updateMatrixWorld(true);
    const barrel = model.getPart("hmt.legs.knee_drive_barrel_l")!;
    const shaft = model.getPart("hmt.legs.knee_drive_shaft_l")!;
    const spec = barrel.def.geometry;
    if (spec.type !== "kit") throw new Error("缸筒需要参数化几何");
    const source = (
      spec.kit === "hmt_machined"
        ? JSON.parse(String(spec.params!.sourceJson))
        : resolveSpec(spec, model.constants)
    ) as {
      params: { from: number[]; to: number[] };
    };
    const a = new Vector3().fromArray(source.params.from),
      b = new Vector3().fromArray(source.params.to);
    const direction = b.clone().sub(a).normalize();
    const ray = new Raycaster(a.clone().addScaledVector(direction, -0.02), direction);
    expect(ray.intersectObject(barrel.object, false)).toHaveLength(0);
    const hits = ray.intersectObject(shaft.object, false);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].point.distanceTo(a)).toBeLessThan(a.distanceTo(b));
  });

  it("面甲微槽和头顶散热阵列均为贯穿几何", () => {
    for (const [id, point] of [
      ["hmt.head.forehead", [0.05075, -0.001, 0.3]],
      ["hmt.head.crown", [0, -0.004, 0.3]],
    ] as const) {
      const plate = model.getPart(id)!;
      model.root.updateMatrixWorld(true);
      const ray = new Raycaster(
        new Vector3(...point).applyMatrix4(plate.object.matrixWorld),
        new Vector3(0, 0, -1).transformDirection(plate.object.matrixWorld),
      );
      expect(ray.intersectObject(plate.object, false), id).toHaveLength(0);
    }
  });

  it("展示高度同步缩放几何与装配，不只修改读数", () => {
    const registry = makeHmtRegistry();
    registry.constants.HEIGHT = 1.8;
    const smaller = buildModel(registry, { builders: hmtBuilders });
    try {
      const a = new Box3().setFromObject(model.root).getSize(new Vector3());
      const b = new Box3().setFromObject(smaller.root).getSize(new Vector3());
      expect(b.x / a.x).toBeCloseTo(0.75, 3);
      expect(b.y / a.y).toBeCloseTo(0.75, 3);
      expect(b.z / a.z).toBeCloseTo(0.75, 3);
    } finally {
      smaller.dispose();
    }
  }, 120_000);

  it("双侧护板向外镜像拆开，反复拆装恢复原位", () => {
    const left = model.getPart("hmt.arms.fore_side_l")!;
    const right = model.getPart("hmt.arms.fore_side_r")!;
    const l = explodeOffsetOf(model, left, 1).clone();
    const r = explodeOffsetOf(model, right, 1).clone();
    expect(l.x).toBeGreaterThan(0);
    expect(r.x).toBeLessThan(0);
    expect(r.length()).toBeCloseTo(l.length(), 6);
    const before = model.parts.map((p) => p.object.matrix.clone());
    for (let i = 0; i < 3; i++) {
      applyExplode(model, 1);
      clearExplode(model);
    }
    model.parts.forEach((part, i) => expect(part.object.matrix.equals(before[i])).toBe(true));
  }, 120_000);
});
