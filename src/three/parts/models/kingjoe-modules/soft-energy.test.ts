import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { cloneDisplayMaterial } from "../../kernel/displayMaterial";
import { addEnergyProgress, updateSoftEnergy } from "./soft-energy";

describe("内部柔边流光", () => {
  it("显示克隆共享动画时钟，重复更新不叠 shader，普通金属不受影响", () => {
    const source = new THREE.MeshStandardMaterial();
    const metal = new THREE.MeshStandardMaterial();
    const clone = cloneDisplayMaterial(source);
    updateSoftEnergy(source, 1);
    const key = source.customProgramCacheKey();
    const shader = {
      vertexShader: THREE.ShaderLib.standard.vertexShader,
      fragmentShader: THREE.ShaderLib.standard.fragmentShader,
      uniforms: {},
    } as Parameters<typeof source.onBeforeCompile>[0];
    clone.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
    const clock = shader.uniforms.pedanSoftTime;
    expect(clock.value).toBe(1);
    updateSoftEnergy(source, 2);
    expect(clock.value).toBe(2);
    expect(source.customProgramCacheKey()).toBe(key);
    expect(source.transparent).toBe(true);
    expect(source.depthWrite).toBe(false);
    expect(metal.transparent).toBe(false);
    expect(metal.depthWrite).toBe(true);
    source.dispose();
    clone.dispose();
    metal.dispose();
  });
  it("环周向和微电流轴向均有连续归一化坐标，不改变圆环法线", () => {
    const ring = addEnergyProgress(new THREE.TorusGeometry(0.048, 0.003 * 3.2, 16, 48), "x");
    const arc = addEnergyProgress(new THREE.CylinderGeometry(0.004, 0.004, 1, 12, 18), "y");
    for (const geometry of [ring, arc]) {
      const p = geometry.getAttribute("energyProgress");
      expect(p.count).toBe(geometry.getAttribute("position").count);
      expect(Math.min(...p.array)).toBe(0);
      expect(Math.max(...p.array)).toBe(1);
    }
    ring.computeBoundingBox();
    expect(ring.boundingBox!.max.z).toBeCloseTo(0.003 * 3.2);
    ring.dispose();
    arc.dispose();
  });
});
