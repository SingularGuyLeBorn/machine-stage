import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { CORE_MODES, CORE_LIMIT, sampleCore } from "./core-dynamics.mjs";
import { buildModel } from "../../assembler/assembler";
import { makeKingJoeModuleRegistry, kingjoeModuleBuilders } from "./registry";
import { animateKingJoeModules } from "./motion";

describe("多体核心的有界运动、呼吸与细电流", () => {
  it("三种轨迹可复现、连续变速，中心和伴核在长时间采样中不相撞", () => {
    for (const mode of CORE_MODES) {
      let minSpeed = Infinity,
        maxSpeed = 0,
        minBreath = 1,
        maxBreath = 0,
        arcCount = 0;
      for (let i = 0; i < 800; i++) {
        const time = i * 0.15,
          sample = sampleCore(time, 17, mode),
          next = sampleCore(time + 0.0001, 17, mode);
        expect(sampleCore(time, 17, mode)).toEqual(sample);
        minBreath = Math.min(minBreath, sample.breath);
        maxBreath = Math.max(maxBreath, sample.breath);
        if (sample.arc > 0.01) arcCount++;
        for (const [j, body] of sample.bodies.entries()) {
          const point = new THREE.Vector3(...body.position);
          expect(point.length() + body.radius).toBeLessThan(CORE_LIMIT);
          expect(point.length() - body.radius).toBeGreaterThan(0.19 * sample.coreScale);
          const speed = point.distanceTo(new THREE.Vector3(...next.bodies[j].position)) / 0.0001;
          minSpeed = Math.min(minSpeed, speed);
          maxSpeed = Math.max(maxSpeed, speed);
          expect(speed).toBeLessThan(2);
          for (const other of sample.bodies.slice(j + 1))
            expect(point.distanceTo(new THREE.Vector3(...other.position))).toBeGreaterThan(
              body.radius + other.radius,
            );
        }
      }
      expect(maxSpeed / minSpeed).toBeGreaterThan(1.3);
      expect(minBreath).toBeLessThan(0.01);
      expect(maxBreath).toBeGreaterThan(0.99);
      expect(arcCount).toBeGreaterThan(0);
      expect(arcCount).toBeLessThan(80);
    }
  });
  it("实际注册部件随所属分体运动，能量团和伴核的渲染顶点留在设备包络内", () => {
    const registry = makeKingJoeModuleRegistry();
    const model = buildModel(registry, { builders: kingjoeModuleBuilders });
    try {
      const nuclei = model.parts.filter(
        (p) => p.def.tags?.includes("orbital-core") && p.def.name_en === "plasma",
      );
      expect(nuclei.length).toBeGreaterThan(12);
      expect(
        new Set(nuclei.map((p) => (p.def.geometry as { params: Record<string, number> }).params.mode)).size,
      ).toBe(3);
      for (const time of [0.2, 1.7, 3.4]) {
        model.resetNodes();
        animateKingJoeModules(model, time, "beam");
        model.syncInstances();
        for (const nucleus of nuclei) {
          const params = (nucleus.def.geometry as { params: Record<string, number> }).params;
          const base = model.getNode(nucleus.def.node!)!.parent!;
          const prefix = nucleus.partId.slice(0, -"plasma".length);
          const inverse = base.matrixWorld.clone().invert();
          for (const part of model.parts.filter((p) => p.partId.startsWith(prefix))) {
            const vertices = part.geometry.getAttribute("position");
            for (const instance of part.instances) {
              const matrix = inverse
                .clone()
                .multiply(model.root.matrixWorld)
                .multiply(model.instanceMatrix(part, instance.index, new THREE.Matrix4()));
              for (let i = 0; i < vertices.count; i++)
                expect(
                  new THREE.Vector3().fromBufferAttribute(vertices, i).applyMatrix4(matrix).length(),
                  part.partId,
                ).toBeLessThan(params.envelope * CORE_LIMIT);
            }
          }
          const sample = sampleCore(time, params.seed, CORE_MODES[params.mode]);
          const arc = model.getNode(`${base.name}_arc`)!;
          const a = arc.localToWorld(new THREE.Vector3());
          const b = arc.localToWorld(new THREE.Vector3(0, 1, 0));
          const source =
            sample.source < 0
              ? base.getWorldPosition(new THREE.Vector3())
              : model.getNode(`${base.name}_body_${sample.source}`)!.getWorldPosition(new THREE.Vector3());
          const target = model
            .getNode(`${base.name}_body_${sample.target}`)!
            .getWorldPosition(new THREE.Vector3());
          expect(a.distanceTo(source)).toBeLessThan(1e-6);
          expect(b.distanceTo(target)).toBeLessThan(1e-6);
        }
      }
    } finally {
      model.dispose();
    }
  }, 20000);
});
