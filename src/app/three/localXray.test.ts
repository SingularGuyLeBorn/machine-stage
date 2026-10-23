// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { createLocalXray, createLocalXrayMaterials } from "./localXray";
import { applyHighlight } from "./pose";
import type { AssembledModel, PartHandle } from "@/three/parts";
import { updateModuleIllumination } from "@/three/parts/models/kingjoe-modules/illumination";

describe("局部 X 光", () => {
  it("彩窗动画继续更新底层能量，不覆盖局部裁切着色器", () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    const original = mesh.material;
    const model = {
      getPart: (id: string) => (id === "kingjoemodules.chest.glass_l" ? { object: mesh } : undefined),
    } as unknown as AssembledModel;
    const lens = createLocalXrayMaterials([mesh]);
    const hook = mesh.material.onBeforeCompile;
    updateModuleIllumination(model, 1);
    const shader = {
      uniforms: {} as Record<string, { value: unknown }>,
      vertexShader: "#include <begin_vertex>",
      fragmentShader: "void main() {\n#include <emissivemap_fragment>\n}",
    };
    mesh.material.onBeforeCompile(
      shader as THREE.WebGLProgramParametersWithUniforms,
      {} as THREE.WebGLRenderer,
    );
    updateModuleIllumination(model, 2);
    expect(mesh.material.onBeforeCompile).toBe(hook);
    expect(shader.uniforms.kjTime.value).toBe(2);
    expect(shader.fragmentShader).toContain("localXrayActive > 0.5");
    expect(shader.fragmentShader).toContain("kjPower * 2.5");
    lens.dispose();
    expect(mesh.material).toBe(original);
    mesh.geometry.dispose();
    original.dispose();
  });
  it("只替换外壳，保留表面着色器和共享材质，并完整恢复", () => {
    const material = new THREE.MeshStandardMaterial({ color: "gold" });
    const prior = vi.fn();
    material.onBeforeCompile = prior;
    const a = new THREE.Mesh(new THREE.BoxGeometry(), material);
    const b = new THREE.Mesh(a.geometry, material);
    const internal = new THREE.Mesh(a.geometry, material);
    const lens = createLocalXrayMaterials([a, b]);
    expect(a.material).not.toBe(material);
    expect(b.material).toBe(a.material);
    expect(internal.material).toBe(material);
    const shader = {
      uniforms: {},
      vertexShader: "",
      fragmentShader: "void main() { gl_FragColor = vec4(1.0); }",
    };
    a.material.onBeforeCompile(shader as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer);
    expect(prior).toHaveBeenCalledOnce();
    expect(shader.fragmentShader).toContain("gl_FragCoord.xy");
    expect(shader.uniforms).toMatchObject(lens.uniforms);
    const lensMaterial = a.material;
    const part = { partId: "shell", object: a, instanced: false } as unknown as PartHandle;
    const assembled = { parts: [part], getPart: () => part } as unknown as AssembledModel;
    applyHighlight(assembled, "shell", null);
    expect(a.material).not.toBe(lensMaterial);
    const highlightedShader = { uniforms: {}, vertexShader: "", fragmentShader: "void main() {}" };
    a.material.onBeforeCompile(
      highlightedShader as THREE.WebGLProgramParametersWithUniforms,
      {} as THREE.WebGLRenderer,
    );
    expect(highlightedShader.fragmentShader).toContain("localXrayActive > 0.5");
    expect(a.material.customProgramCacheKey()).toBe(lensMaterial.customProgramCacheKey());
    applyHighlight(assembled, null, null);
    expect(a.material).toBe(lensMaterial);
    const dispose = vi.spyOn(a.material, "dispose");
    lens.dispose();
    expect(a.material).toBe(material);
    expect(b.material).toBe(material);
    expect(dispose).toHaveBeenCalledOnce();
    a.geometry.dispose();
    material.dispose();
  });

  it("悬停命中显示，空白/拖动/离开/失焦隐藏，DPR 与释放均正确", () => {
    const canvas = document.createElement("canvas");
    canvas.getBoundingClientRect = () => ({ left: 10, top: 20, width: 400, height: 400 }) as DOMRect;
    document.body.appendChild(canvas);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    const original = mesh.material;
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.z = 3;
    camera.updateMatrixWorld();
    const lens = createLocalXray([mesh], canvas);
    const renderer = {
      getDrawingBufferSize: (target: THREE.Vector2) => target.set(800, 800),
    } as THREE.WebGLRenderer;
    const ring = document.querySelector<HTMLElement>("[data-local-xray]")!;
    const pointer = (type: string, x = 210, buttons = 0) => {
      const event = new MouseEvent(type, { clientX: x, clientY: 220, buttons });
      Object.defineProperty(event, "pointerType", { value: "mouse" });
      canvas.dispatchEvent(event);
      lens.update(camera, renderer);
    };
    pointer("pointermove");
    expect(ring.style.display).toBe("block");
    const shader = {
      uniforms: {} as Record<string, { value: unknown }>,
      vertexShader: "",
      fragmentShader: "void main() { gl_FragColor = vec4(1.0); }",
    };
    mesh.material.onBeforeCompile(shader as THREE.WebGLProgramParametersWithUniforms, renderer);
    expect(shader.uniforms.localXrayCenter.value).toEqual(new THREE.Vector2(400, 400));
    expect(shader.uniforms.localXrayRadius.value).toBe(160);
    pointer("pointerdown", 210, 1);
    expect(ring.style.display).toBe("none");
    pointer("pointerup");
    expect(ring.style.display).toBe("block");
    pointer("pointermove", 409);
    expect(ring.style.display).toBe("none");
    pointer("pointermove");
    pointer("pointerleave");
    expect(ring.style.display).toBe("none");
    pointer("pointermove");
    window.dispatchEvent(new Event("blur"));
    expect(ring.style.display).toBe("none");
    lens.dispose();
    expect(document.querySelector("[data-local-xray]")).toBeNull();
    expect(mesh.material).toBe(original);
    mesh.geometry.dispose();
    original.dispose();
    canvas.remove();
  });
});
