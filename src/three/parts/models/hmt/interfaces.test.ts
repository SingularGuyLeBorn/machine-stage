import { describe, expect, it } from "vitest";
import { Euler, Matrix4, Quaternion, Vector3 } from "three";
import { resolveSpec } from "../../assembler/geometry";
import { evaluateVec3, resolveConstants } from "../../registry/expression";
import { makeHmtRegistry } from "./registry";
import { shellPoint } from "./geometry";
import type { GeometrySpec } from "../../registry/types";
import { createHmtRestPose } from "./restPose";

describe("标注参考对应的腰椎与腕口关系", () => {
  const registry = makeHmtRegistry({ machined: false });
  const constants = resolveConstants(registry.constants);
  const part = (id: string) => registry.parts.find((p) => p.id === `hmt.${id}`)!;
  const params = (id: string) => {
    const spec = resolveSpec(part(id).geometry, constants) as GeometrySpec;
    if (spec.type !== "kit") throw new Error(id + " 缺少几何参数");
    return spec.params! as Record<string, unknown>;
  };
  const matrix = (id: string) => {
    const mate = part(id).mate;
    if (mate?.type !== "absolute") throw new Error("检查装配后的绝对落点");
    return new Matrix4().compose(
      new Vector3(...evaluateVec3(mate.position, constants)),
      new Quaternion().setFromEuler(
        new Euler(
          ...(evaluateVec3(mate.rotation!, constants).map((v) => (v * Math.PI) / 180) as [
            number,
            number,
            number,
          ]),
        ),
      ),
      new Vector3(1, 1, 1),
    );
  };
  const outline = (id: string) =>
    (params(id).outline as number[][]).map(([x, y]) => shellPoint(params(id), x, y).applyMatrix4(matrix(id)));

  it("三节腹甲近乎竖直，连续覆盖胸廓下缘到骨盆上缘", () => {
    const bounds = [0, 1, 2].map((i) => {
      const id = `waist.vertebra_${i}`,
        points = outline(id);
      const up = new Vector3(0, 1, 0).transformDirection(matrix(id));
      expect(up.angleTo(new Vector3(0, 1, 0))).toBeLessThan((5 * Math.PI) / 180);
      return {
        low: Math.min(...points.map((p) => p.y)),
        high: Math.max(...points.map((p) => p.y)),
        center: new Vector3().setFromMatrixPosition(matrix(id)),
      };
    });
    expect(bounds[0].low).toBeLessThan(1.335);
    expect(bounds[2].high).toBeGreaterThan(1.6);
    for (let i = 0; i < 2; i++) {
      expect(bounds[i + 1].low - bounds[i].high).toBeGreaterThan(0.002);
      expect(bounds[i + 1].low - bounds[i].high).toBeLessThan(0.015);
      expect(Math.abs(bounds[i + 1].center.z - bounds[i].center.z)).toBeLessThan(0.01);
    }
  });

  it("背侧连接舌伸入上下凹槽的高度范围，且保留独立零件", () => {
    for (let i = 0; i < 2; i++) {
      const a = outline(`waist.rear_link_${i}`),
        b = outline(`waist.rear_link_${i}_coupler`),
        c = outline(`waist.rear_link_${i + 1}`);
      expect(Math.min(...b.map((p) => p.y))).toBeLessThan(Math.max(...a.map((p) => p.y)));
      expect(Math.max(...b.map((p) => p.y))).toBeGreaterThan(Math.min(...c.map((p) => p.y)));
      const loop = params(`waist.rear_link_${i}`).outline as number[][];
      const middle = loop.filter(([x]) => Math.abs(x) < 0.018);
      const ears = loop.filter(([x]) => Math.abs(x) > 0.035);
      expect(Math.max(...ears.map((p) => p[1])) - Math.max(...middle.map((p) => p[1]))).toBeGreaterThan(
        0.015,
      );
    }
  });

  it("中央脊柱各段首尾接续，从骨盆穿过腰节直到胸肩承力节点", () => {
    const segments = [0, 1, 2, 3, 4].map((i) => params(`waist.spine_core_${i}`));
    for (let i = 0; i < 4; i++)
      expect(
        new Vector3(...(segments[i].to as [number, number, number])).distanceTo(
          new Vector3(...(segments[i + 1].from as [number, number, number])),
        ),
      ).toBeLessThan(1e-7);
    expect((segments[4].to as number[])[1] - (segments[0].from as number[])[1]).toBeGreaterThan(0.65);
    for (let i = 0; i < 5; i++) expect(part(`torso.spine_rib_mount_${i}_l`)).toBeDefined();
  });

  it("双腕弧片覆盖整圈，仅保留窄分缝，并保留凹凸上沿与拇指桥翼", () => {
    for (const side of ["l", "r"]) {
      for (const face of ["dorsal", "volar"]) expect(part(`hands.wrist_${face}_guard_${side}`)).toBeDefined();
      const sectors = Array.from({ length: 8 }, (_, i) => params(`hands.wrist_cuff_${i}_${side}`));
      let coverage = 0;
      for (let i = 0; i < 8; i++) {
        const start = Number(sectors[i].start_turns),
          span = Number(sectors[i].span_turns);
        coverage += span;
        const next = Number(sectors[(i + 1) % 8].start_turns) + (i === 7 ? 1 : 0);
        expect(next - start - span).toBeGreaterThan(0);
        expect((next - start - span) * 360).toBeLessThan(2);
        expect(Number(sectors[i].height)).toBeGreaterThan(0.04);
      }
      expect(coverage * 360).toBeGreaterThan(347);
      expect(part(`hands.thumb_bridge_${side}`)).toBeDefined();
      const loop = params(`hands.wrist_dorsal_guard_${side}`).outline as number[][];
      const rim = loop.slice(0, 9).map((p) => p[1]);
      expect(Math.max(...rim) - Math.min(...rim)).toBeGreaterThan(0.03);
    }
  });

  it("踝部嵌片有独立实体和拆解定义，尺寸留在母壳窗口内", () => {
    const hole = (params("legs.shin_l").holes as number[][][])[2];
    for (const side of ["l", "r"]) {
      const inset = params(`legs.shin_ankle_insert_${side}`).outline as number[][];
      for (const axis of [0, 1]) {
        expect(Math.min(...inset.map((p) => p[axis]))).toBeGreaterThan(Math.min(...hole.map((p) => p[axis])));
        expect(Math.max(...inset.map((p) => p[axis]))).toBeLessThan(Math.max(...hole.map((p) => p[axis])));
      }
      expect(part(`legs.shin_ankle_insert_${side}`).explode).toBeDefined();
    }
  });

  it("立领前低后高，颈轴周围留出空间，腰侧甲跨越前后空档", () => {
    const inverse = createHmtRestPose().chest.clone().invert();
    const tops: number[] = [];
    for (let i = 0; i < 8; i++) {
      const points = outline(`chest.collar_ring_${i}`).map((v) => v.applyMatrix4(inverse));
      const top = Math.max(...points.map((v) => v.y));
      tops.push(top);
      expect(Math.min(...points.map((v) => Math.hypot(v.x, v.z + 0.031)))).toBeGreaterThan(0.08);
      // 正前片避让胸骨上缘，侧后片保持更高的竖直覆盖。
      expect(top - Math.min(...points.map((v) => v.y))).toBeGreaterThan(i === 0 ? 0.075 : 0.085);
    }
    expect(tops[4] - tops[0]).toBeGreaterThan(0.05);
    for (const side of ["left", "right"])
      for (let i = 0; i < 2; i++) {
        const points = outline(`waist.lateral_scale_${i}_${side}`);
        expect(Math.max(...points.map((v) => v.z)) - Math.min(...points.map((v) => v.z))).toBeGreaterThan(
          0.1,
        );
      }
  });
});
