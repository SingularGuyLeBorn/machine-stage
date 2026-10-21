// 四把枪的射击循环冒烟：逐时间步跑 animate，断言无异常、实例矩阵全有限。
// 覆盖「运动学可演示」这条验收：机构在各相位都能算出场。
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { buildModel, type AssembledModel } from "@/three/parts";
import { animateAk47, AK47_MOTION_PARTS } from "../ak47/motion";
import { AK47_BUILDERS, makeAk47Layouts, makeAk47Registry } from "../ak47/registry";
import { animateM249, M249_MOTION_PARTS } from "../m249/motion";
import { M249_BUILDERS, makeM249Layouts, makeM249Registry } from "../m249/registry";
import { animateM2hb, M2HB_MOTION_PARTS } from "../m2hb/motion";
import { M2HB_BUILDERS, makeM2hbLayouts, makeM2hbRegistry } from "../m2hb/registry";
import { animateM134, M134_MOTION_PARTS } from "../m134/motion";
import { M134_BUILDERS, makeM134Layouts, makeM134Registry } from "../m134/registry";

interface GunCase {
  name: string;
  build: () => AssembledModel;
  animate: (assembled: AssembledModel, seconds: number, mode: "auto" | "semi" | "idle") => void;
  motionParts: string[];
  period: number;
}

const CASES: GunCase[] = [
  {
    name: "ak47",
    build: () => buildModel(makeAk47Registry(), { builders: AK47_BUILDERS, instanceLayouts: makeAk47Layouts(), warnMissingLayout: false }),
    animate: (a, s, m) => animateAk47(a, s, m),
    motionParts: AK47_MOTION_PARTS,
    period: 1.8,
  },
  {
    name: "m249",
    build: () => buildModel(makeM249Registry(), { builders: M249_BUILDERS, instanceLayouts: makeM249Layouts(), warnMissingLayout: false }),
    animate: (a, s, m) => animateM249(a, s, m),
    motionParts: M249_MOTION_PARTS,
    period: 1.4,
  },
  {
    name: "m2hb",
    build: () => buildModel(makeM2hbRegistry(), { builders: M2HB_BUILDERS, instanceLayouts: makeM2hbLayouts(), warnMissingLayout: false }),
    animate: (a, s, m) => animateM2hb(a, s, m),
    motionParts: M2HB_MOTION_PARTS,
    period: 2.2,
  },
  {
    name: "m134",
    build: () => buildModel(makeM134Registry(), { builders: M134_BUILDERS, instanceLayouts: makeM134Layouts(), warnMissingLayout: false }),
    animate: (a, s, m) => animateM134(a, s, m),
    motionParts: M134_MOTION_PARTS,
    period: 0.6,
  },
];

describe("枪械线射击循环冒烟", () => {
  for (const gun of CASES) {
    it(`${gun.name}：连发 3 个周期逐帧无异常、矩阵全有限`, () => {
      const assembled = gun.build();
      const matrix = new THREE.Matrix4();
      const frames = 72;
      const total = gun.period * 3;
      for (let i = 0; i <= frames; i++) {
        const t = (i / frames) * total;
        assembled.resetNodes();
        gun.animate(assembled, t, "auto");
        assembled.syncInstances();
        for (const partId of gun.motionParts) {
          const handle = assembled.getPart(partId);
          if (!handle) continue;
          for (const inst of handle.instances) {
            assembled.instanceMatrix(handle, inst.index, matrix);
            expect(
              matrix.elements.every((v) => Number.isFinite(v)),
              `${gun.name} ${partId}[${inst.index}] @t=${t.toFixed(2)}`,
            ).toBe(true);
          }
        }
      }
      assembled.dispose();
    });

    it(`${gun.name}：单发/停机模式也能算出场且复位`, () => {
      const assembled = gun.build();
      for (const mode of ["semi", "idle"] as const) {
        for (const t of [0, gun.period * 0.5, gun.period * 0.99]) {
          assembled.resetNodes();
          gun.animate(assembled, t, mode);
          assembled.syncInstances();
        }
      }
      assembled.dispose();
    });
  }
});
