import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { resolveSpec } from "../../assembler/geometry";
import { resolveConstants } from "../../registry/expression";
import type { GeometrySpec } from "../../registry/types";
import { hmtBuilders, shellPoint, shellHeight } from "./geometry";
import { makeHmtRegistry } from "./registry";
import { createHmtRestPose } from "./restPose";

describe("HMT 壳体几何", () => {
  it("腕周弧片有朝外绕序、正体积和贯通内腔", () => {
    const g = hmtBuilders.hmt_cuff(
      {
        type: "kit",
        kit: "hmt_cuff",
        params: {
          rx: 0.046,
          rz: 0.056,
          height: 0.05,
          wall: 0.005,
          hem: 0.009,
          start_turns: 0.8 / 360,
          span_turns: 43.4 / 360,
        },
      },
      { constants: {} },
    );
    try {
      const p = g.getAttribute("position"),
        ix = g.index!;
      let volume = 0;
      for (let i = 0; i < ix.count; i += 3) {
        const a = new Vector3().fromBufferAttribute(p, ix.getX(i)),
          b = new Vector3().fromBufferAttribute(p, ix.getX(i + 1)),
          c = new Vector3().fromBufferAttribute(p, ix.getX(i + 2));
        volume += a.dot(b.cross(c)) / 6;
      }
      expect(volume).toBeGreaterThan(0.00001);
      for (let i = 0; i < p.count; i++)
        expect(Math.hypot(p.getX(i) / 0.046, p.getZ(i) / 0.056)).toBeGreaterThanOrEqual(0.99999);
    } finally {
      g.dispose();
    }
  });
  it("双手指骨在实际装配坐标中向掌心弯曲，末节仍低于根节", () => {
    const registry = makeHmtRegistry({ machined: false });
    const constants = resolveConstants(registry.constants);
    const pose = createHmtRestPose();
    for (const side of [1, -1])
      for (let finger = 0; finger < 4; finger++) {
        const suffix = side === 1 ? "l" : "r";
        const inverse = pose.sides.get(side)!.hand.clone().invert();
        const endpoints = [0, 2].map((segment) => {
          const part = registry.parts.find(
            (p) => p.id === `hmt.hands.finger_core_${finger}_${segment}_${suffix}`,
          )!;
          const spec = resolveSpec(part.geometry, constants) as GeometrySpec;
          if (spec.type !== "kit") throw new Error("指骨必须使用实体杆件");
          return new Vector3(
            ...(spec.params![segment === 0 ? "from" : "to"] as [number, number, number]),
          ).applyMatrix4(inverse);
        });
        expect(endpoints[1].z).toBeLessThan(endpoints[0].z - 0.03);
        expect(endpoints[1].y).toBeLessThan(endpoints[0].y - 0.06);
      }
  });

  it.each(["limb", "shin"])("%s 腿甲横向弯曲后，实际表面法线仍与两个切向垂直", (form) => {
    const params = {
      outline: [
        [-0.08, -0.19],
        [0.08, -0.19],
        [0.08, 0.19],
        [-0.08, 0.19],
      ],
      holes: [],
      thickness: 0.012,
      bevel: 0.001,
      corner: 0.004,
      rise: 0.035,
      width: 0.08,
      round: 0.007,
      edge: 0.006,
      form,
    };
    const g = hmtBuilders.hmt_shell({ type: "kit", kit: "hmt_shell", params }, { constants: {} });
    try {
      const p = g.getAttribute("position"),
        n = g.getAttribute("normal");
      let checked = 0;
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i),
          x = p.getX(i) - params.width * (form === "shin" ? 0.22 : 0.14) * Math.sin(y / (params.width * 1.8));
        if (
          Math.abs(x) > 0.06 ||
          Math.abs(y) > 0.15 ||
          Math.abs(p.getZ(i) - shellHeight(params, x, y) - params.thickness) > 1e-7
        )
          continue;
        const normal = new Vector3().fromBufferAttribute(n, i),
          e = 0.0003;
        const dx = shellPoint(params, x + e, y)
          .sub(shellPoint(params, x - e, y))
          .normalize();
        const dy = shellPoint(params, x, y + e)
          .sub(shellPoint(params, x, y - e))
          .normalize();
        expect(Math.abs(normal.dot(dx))).toBeLessThan(0.001);
        expect(Math.abs(normal.dot(dy))).toBeLessThan(0.001);
        checked++;
      }
      expect(checked).toBeGreaterThan(100);
    } finally {
      g.dispose();
    }
  });
  it("胸部宽面与胸翼接缝曲率连续，中央面保持低曲率", () => {
    const params = { form: "chest", width: 0.26, rise: 0.097, round: 0.007 };
    const at = (x: number) => shellHeight(params, x, 0.015);
    const second = (x: number, step: number) =>
      (2 * at(x) - 5 * at(x + step) + 4 * at(x + 2 * step) - at(x + 3 * step)) / step ** 2;
    for (const ax of [params.width * 0.1, params.width * 0.33]) {
      const x = Math.sqrt((ax + params.round) ** 2 - params.round ** 2);
      const left = second(x, -0.0001);
      const right = second(x, 0.0001);
      expect(Math.abs(left - right)).toBeLessThan(0.05);
    }
    expect(second(0, 0.0001)).toBeCloseTo(-0.64 / params.width, 5);
  });
  it("平直护板的大面法线不被边缘倒角拖歪", () => {
    const g = hmtBuilders.hmt_shell(
      {
        type: "kit",
        kit: "hmt_shell",
        params: {
          outline: [
            [-0.1, -0.12],
            [0.1, -0.12],
            [0.1, 0.12],
            [-0.1, 0.12],
          ],
          holes: [],
          thickness: 0.012,
          bevel: 0.001,
          corner: 0.004,
          rise: 0,
          width: 0.1,
          round: 0.005,
          edge: 0.012,
        },
      },
      { constants: {} },
    );
    try {
      const p = g.getAttribute("position"),
        n = g.getAttribute("normal");
      let checked = 0;
      for (let i = 0; i < p.count; i++)
        if (Math.abs(p.getZ(i) - 0.012) < 1e-8) {
          expect(n.getZ(i)).toBeCloseTo(1, 6);
          checked++;
        }
      expect(checked).toBeGreaterThan(100);
    } finally {
      g.dispose();
    }
  });
  it("头部放样绕序朝外，侧壁和上下端盖形成正体积", () => {
    const geometry = hmtBuilders.hmt_loft(
      {
        type: "kit",
        kit: "hmt_loft",
        params: {
          sections: [
            [0, 0.1, 0.1, 0],
            [0.2, 0.1, 0.1, 0],
          ],
        },
      },
      { constants: {} },
    );
    try {
      const p = geometry.getAttribute("position"),
        index = geometry.index!;
      let volume = 0;
      const a = new Vector3(),
        b = new Vector3(),
        c = new Vector3();
      for (let i = 0; i < index.count; i += 3) {
        a.fromBufferAttribute(p, index.getX(i));
        b.fromBufferAttribute(p, index.getX(i + 1));
        c.fromBufferAttribute(p, index.getX(i + 2));
        volume += a.dot(b.cross(c)) / 6;
      }
      expect(volume).toBeCloseTo(Math.PI * 0.1 ** 2 * 0.2, 5);
    } finally {
      geometry.dispose();
    }
  });
  it("所有护甲窗口顶点都在各自轮廓内，避免孔边越过壳体外缘", () => {
    const registry = makeHmtRegistry({ machined: false }),
      constants = resolveConstants(registry.constants);
    function inside(point: number[], loop: number[][]) {
      let result = false;
      for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
        const a = loop[i],
          b = loop[j];
        if (
          a[1] > point[1] !== b[1] > point[1] &&
          point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0]
        )
          result = !result;
      }
      return result;
    }
    for (const part of registry.parts) {
      const spec = resolveSpec(part.geometry, constants) as GeometrySpec;
      if (spec.type !== "kit" || spec.kit !== "hmt_shell") continue;
      const outline = spec.params!.outline as number[][];
      for (const loop of spec.params!.holes as number[][][])
        for (const point of loop) expect(inside(point, outline), part.id + " 孔边超出轮廓").toBe(true);
    }
  });
  it("带反向输入窗口的壳体仍为一致朝向的闭合实体", () => {
    const g = hmtBuilders.hmt_shell(
      {
        type: "kit",
        kit: "hmt_shell",
        params: {
          outline: [
            [-0.1, -0.1],
            [-0.1, 0.1],
            [0.1, 0.1],
            [0.1, -0.1],
          ],
          holes: [
            [
              [-0.03, -0.03],
              [-0.03, 0.03],
              [0.03, 0.03],
              [0.03, -0.03],
            ],
          ],
          thickness: 0.012,
          bevel: 0.001,
          corner: 0.004,
          rise: 0.02,
          rim: 0.002,
          width: 0.1,
          round: 0.005,
          edge: 0.012,
        },
      },
      { constants: {} },
    );
    try {
      const p = g.getAttribute("position"),
        index = g.index!,
        edges = new Map<string, { count: number; balance: number }>();
      const key = (i: number) => [p.getX(i), p.getY(i), p.getZ(i)].map((v) => v.toFixed(7)).join(",");
      for (let i = 0; i < index.count; i += 3) {
        const triangle = [key(index.getX(i)), key(index.getX(i + 1)), key(index.getX(i + 2))];
        for (let j = 0; j < 3; j++) {
          const a = triangle[j],
            b = triangle[(j + 1) % 3],
            k = a < b ? a + "|" + b : b + "|" + a;
          const e = edges.get(k) ?? { count: 0, balance: 0 };
          e.count++;
          e.balance += a < b ? 1 : -1;
          edges.set(k, e);
        }
      }
      expect([...edges.values()].every((e) => e.count === 2 && e.balance === 0)).toBe(true);
    } finally {
      g.dispose();
    }
  });
});
