import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { resolveSpec } from "../../assembler/geometry";
import { resolveConstants } from "../../registry/expression";
import type { GeometrySpec } from "../../registry/types";
import { makeHmtRegistry } from "./registry";
import { shellHeight } from "./geometry";

describe("用户确认体态后的装甲改版", () => {
  const registry = makeHmtRegistry({ machined: false });
  const constants = resolveConstants(registry.constants);
  const params = (id: string) => {
    const part = registry.parts.find((p) => p.id === id)!;
    expect(part, id).toBeDefined();
    const spec = resolveSpec(part.geometry, constants) as GeometrySpec;
    if (spec.type !== "kit") throw new Error(id + " 必须是实体壳体");
    return spec.params!;
  };
  it("保持用户确认的完整体态源不变", () => {
    expect(
      createHash("sha256")
        .update(readFileSync(new URL("restPose.ts", import.meta.url)))
        .digest("hex"),
    ).toBe("110ff98ae8d73ff693151c1b4fc25eed72d15f7873f7cb0e7c99e4373025b1e7");
  });
  it("分片不切断窗口，每组窗口只有一个归属", () => {
    for (const id of ["arms.fore_shell", "legs.thigh"]) {
      const proximal = params(`hmt.${id}_l`);
      const distal = params(`hmt.${id}_distal_l`);
      const bottom = Math.min(...(proximal.outline as number[][]).map((p) => p[1]));
      const top = Math.max(...(distal.outline as number[][]).map((p) => p[1]));
      expect(bottom - top).toBeGreaterThan(0.0029);
      for (const hole of proximal.holes as number[][][])
        expect(Math.min(...hole.map((p) => p[1]))).toBeGreaterThan(bottom);
      for (const hole of distal.holes as number[][][])
        expect(Math.max(...hole.map((p) => p[1]))).toBeLessThan(top);
    }
  });
  it("三节腰甲、每腿两套缸筒和独立拇指甲齐全，旧重叠下甲和线束移除", () => {
    const ids = new Set(registry.parts.map((p) => p.id));
    for (const i of [0, 1, 2]) expect(ids.has(`hmt.waist.vertebra_${i}`)).toBe(true);
    for (const side of ["l", "r"]) {
      for (const drive of ["knee_drive", "knee_drive_outer"]) {
        for (const part of ["barrel", "shaft"])
          expect(ids.has(`hmt.legs.${drive}_${part}_${side}`)).toBe(true);
      }
      expect(ids.has(`hmt.hands.thumb_root_guard_${side}`)).toBe(true);
    }
    expect([...ids].some((id) => id.startsWith("hmt.pelvis.crotch"))).toBe(false);
    expect(registry.parts.some((p) => p.name_cn === "沿机构布置的线束")).toBe(false);
  });
  it.each([
    "hmt.back.carapace",
    "hmt.head.occipital",
    "hmt.hands.palm_l",
    "hmt.waist.rear_link_1",
    "hmt.chest.pectoral_plate_l",
  ])("%s 棱线改变实体高度，且展示尺度缩放保持比例", (id) => {
    const p = params(id);
    const part = registry.parts.find((part) => part.id === id)!;
    const smaller = resolveSpec(
      part.geometry,
      resolveConstants({ ...registry.constants, HEIGHT: 1.8 }),
    ) as GeometrySpec;
    if (smaller.type !== "kit") throw new Error("护甲必须是实体壳体");
    const deltas: number[] = [];
    for (const [x, y] of p.outline as number[][]) {
      const px = x * 0.5,
        py = y * 0.5;
      deltas.push(shellHeight(p, px, py) - shellHeight({ ...p, relief: "none" }, px, py));
      const scaled =
        shellHeight(smaller.params!, px * 0.75, py * 0.75) -
        shellHeight({ ...smaller.params!, relief: "none" }, px * 0.75, py * 0.75);
      expect(scaled).toBeCloseTo(deltas[deltas.length - 1] * 0.75, 7);
    }
    expect(Math.max(...deltas)).toBeGreaterThan(0.001);
    expect(Math.max(...deltas) - Math.min(...deltas)).toBeGreaterThan(0.0005);
  });
});
