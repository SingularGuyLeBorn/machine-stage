import { describe, expect, it } from "vitest";
import { Matrix4, Vector3 } from "three";
import { buildModel } from "../../assembler/assembler";
import { makeKingJoeModuleRegistry, kingjoeModuleBuilders } from "./registry";
import { animateKingJoeModules } from "./motion";
import { CUFF } from "./joint-covers";

describe("肩肘柔性护套密封", () => {
  it("静止和抬臂时两端保有安装长度，相邻褶皱外弧不拉开透光缝", () => {
    const model = buildModel(makeKingJoeModuleRegistry(), { builders: kingjoeModuleBuilders });
    try {
      for (const [state, time] of [
        ["closed", 2],
        ["beam", 1.2],
        ["beam", 2.1],
        ["beam", 3.5],
        ["separation", 0.6],
        ["separation", 4.5],
        ["combining", 19],
        ["combining", 22],
      ] as const) {
        animateKingJoeModules(model, 0, state);
        animateKingJoeModules(model, time, state);
        for (const side of ["l", "r"])
          for (const kind of ["upper", "fore"]) {
            const dims = kind === "upper" ? CUFF.shoulder : CUFF.elbow;
            const nodes = Array.from({ length: CUFF.layers }, (_, i) =>
              model.getNode(`Cuff_${kind}_${side}_${i}`)!,
            );
            expect(
              nodes[0]!.position.distanceTo(nodes.at(-1)!.position),
              `${state}/${kind} 两端不能叠在同一断面`,
            ).toBeGreaterThan(0.07);
            const inverses = nodes.map((n) => new Matrix4().copy(n.matrixWorld).invert());
            const contains = (world: Vector3, i: number) => {
              const p = world.clone().applyMatrix4(inverses[i]!);
              const rho = Math.hypot(p.x / dims.rx, p.z / dims.rz);
              // .87 是外表面最小收口半径，保守只取每圈始终存在的环形材料。
              return Math.abs(p.y) <= CUFF.halfThickness + 1e-6 && rho >= 0.55 - 1e-6 && rho <= 0.87 + 1e-6;
            };
            for (let i = 0; i < nodes.length - 1; i++)
              for (let j = 0; j < 24; j++) {
                const angle = (j * Math.PI) / 12;
                const ringPoint = new Vector3(
                  dims.rx * 0.76 * Math.cos(angle),
                  0,
                  dims.rz * 0.76 * Math.sin(angle),
                );
                const midpoint = ringPoint
                  .clone()
                  .applyMatrix4(nodes[i]!.matrixWorld)
                  .lerp(ringPoint.clone().applyMatrix4(nodes[i + 1]!.matrixWorld), 0.5);
                expect(
                  contains(midpoint, i) || contains(midpoint, i + 1),
                  `${state}/${time}/${kind}_${side}/圈${i}/方向${j}`,
                ).toBe(true);
              }
          }
      }
    } finally {
      model.dispose();
    }
  }, 20000);
});
