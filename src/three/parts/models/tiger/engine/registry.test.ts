// 回归：tiger HL230 注册表必须能通过校验与装配，且几何/实例矩阵全部有限。
// 背景：曾出现两处静默破图——布局表达式求值器缺失（装配期 throw → 白屏）与
// 轮廓常量名拼错（resolveSpec 保留字符串 → NaN 顶点）。这两类问题必须在这里暴露。
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { buildModel, validateRegistry } from "@/three/parts";
import { findModel } from "@/app/catalog";

describe("tiger/engine 注册表回归", () => {
  const model = findModel("tiger");
  const registry = model.registry!;

  it("validateRegistry 零 issue", () => {
    expect(validateRegistry(registry)).toEqual([]);
  });

  it("装配成功，且所有几何顶点、包围盒与实例矩阵均为有限值", () => {
    const built = buildModel(registry, {
      builders: model.builders,
      instanceLayouts: model.layouts,
      warnMissingLayout: false,
    });

    expect(built.parts.length).toBeGreaterThan(0);

    const bad: string[] = [];
    const matrix = new THREE.Matrix4();
    const bounds = new THREE.Box3();

    for (const handle of built.parts) {
      const position = handle.geometry.getAttribute("position") as { array: ArrayLike<number> };
      let nan = 0;
      for (let i = 0; i < position.array.length; i++) {
        if (!Number.isFinite(position.array[i])) nan++;
      }
      const box = handle.geometry.boundingBox;
      const boxBad = !box || !Number.isFinite(box.min.x) || !Number.isFinite(box.max.x);
      if (nan > 0 || boxBad) bad.push(`${handle.partId} nan=${nan} box=${boxBad}`);

      for (const instance of handle.instances) {
        built.instanceMatrix(handle, instance.index, matrix);
        if (!matrix.elements.every((value) => Number.isFinite(value))) {
          bad.push(`${handle.partId}[${instance.index}] matrix`);
          continue;
        }
        built.partBounds(handle, bounds);
        if (Number.isNaN(bounds.min.x) || Number.isNaN(bounds.max.x)) {
          bad.push(`${handle.partId}[${instance.index}] bounds`);
        }
      }
    }

    expect(bad).toEqual([]);
    built.dispose();
  });
});
