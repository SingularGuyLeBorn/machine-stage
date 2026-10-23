import * as THREE from "three";
import { cloneDisplayMaterial } from "@/three/parts/kernel/displayMaterial";

/** 局部透视只替换外壳材质；内部零件、原材质和模型几何都不改。 */
export function createLocalXrayMaterials(shells: THREE.Mesh[]) {
  const uniforms = {
    localXrayCenter: { value: new THREE.Vector2() },
    localXrayRadius: { value: 0 },
    localXrayActive: { value: 0 },
  };
  const originals = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  const clones = new Map<THREE.Material, THREE.Material>();
  const cloneMaterial = (original: THREE.Material) => {
    let clone = clones.get(original);
    if (clone) return clone;
    clone = cloneDisplayMaterial(original);
    clone.onBeforeCompile = function (shader, renderer) {
      // 保留金属表面的既有着色器，再叠加观察窗裁切。
      original.onBeforeCompile.call(this, shader, renderer);
      Object.assign(shader.uniforms, uniforms);
      shader.fragmentShader =
        "uniform vec2 localXrayCenter;\nuniform float localXrayRadius;\nuniform float localXrayActive;\n" +
        shader.fragmentShader.replace(
          /void\s+main\s*\(\s*(?:void\s*)?\)\s*\{/,
          "$&\nif (localXrayActive > 0.5 && distance(gl_FragCoord.xy, localXrayCenter) < localXrayRadius) discard;",
        );
    };
    clone.customProgramCacheKey = () => `${original.customProgramCacheKey()}|local-xray-v1`;
    clones.set(original, clone);
    return clone;
  };
  for (const shell of shells) {
    originals.set(shell, shell.material);
    shell.material = Array.isArray(shell.material)
      ? shell.material.map(cloneMaterial)
      : cloneMaterial(shell.material);
  }
  return {
    uniforms,
    dispose() {
      for (const [shell, original] of originals) shell.material = original;
      for (const clone of clones.values()) clone.dispose();
      originals.clear();
      clones.clear();
    },
  };
}

export function createLocalXray(shells: THREE.Mesh[], canvas: HTMLCanvasElement) {
  const materials = createLocalXrayMaterials(shells);
  const raycaster = new THREE.Raycaster();
  Object.assign(raycaster, { firstHitOnly: true });
  const pointer = new THREE.Vector2();
  const bufferSize = new THREE.Vector2();
  let clientX = 0,
    clientY = 0,
    inside = false,
    buttons = 0;
  const ring = document.createElement("div");
  ring.dataset.localXray = "window";
  ring.setAttribute("aria-hidden", "true");
  // [OM-FREEPLAY] 细青色圆框提示观察范围，不加亮底，避免盖住低亮能量流。
  ring.style.cssText =
    "position:fixed;pointer-events:none;display:none;border:1px solid rgba(95,190,202,.8);border-radius:50%;transform:translate(-50%,-50%);box-sizing:border-box;z-index:20;box-shadow:0 0 0 3px rgba(55,105,120,.10)";
  document.body.appendChild(ring);
  const hide = () => {
    materials.uniforms.localXrayActive.value = 0;
    ring.style.display = "none";
  };
  const track = (event: PointerEvent) => {
    clientX = event.clientX;
    clientY = event.clientY;
    buttons = event.buttons;
    inside = event.pointerType !== "touch";
    if (buttons) hide();
  };
  const leave = () => {
    inside = false;
    hide();
  };
  canvas.addEventListener("pointermove", track);
  canvas.addEventListener("pointerdown", track);
  canvas.addEventListener("pointerup", track);
  canvas.addEventListener("pointerleave", leave);
  canvas.addEventListener("pointercancel", leave);
  window.addEventListener("blur", leave);
  return {
    update(camera: THREE.Camera, renderer: THREE.WebGLRenderer) {
      const rect = canvas.getBoundingClientRect();
      const x = clientX - rect.left,
        y = clientY - rect.top;
      if (
        !inside ||
        buttons ||
        x < 0 ||
        y < 0 ||
        x > rect.width ||
        y > rect.height ||
        !rect.width ||
        !rect.height
      ) {
        hide();
        return;
      }
      pointer.set((x / rect.width) * 2 - 1, 1 - (y / rect.height) * 2);
      raycaster.setFromCamera(pointer, camera);
      // 只检查可见外壳，避开上万个内部件，也不改原有点击/旋转交互。
      const hit = shells.some((shell) => {
        if (!shell.layers.test(camera.layers)) return false;
        let object: THREE.Object3D | null = shell;
        while (object) {
          if (!object.visible) return false;
          object = object.parent;
        }
        return raycaster.intersectObject(shell, false).length > 0;
      });
      if (!hit) {
        hide();
        return;
      }
      // [OM-FREEPLAY] 半径 86 CSS 像素，窄视口相应缩小；DPR 变化不改变视觉尺寸。
      const radius = Math.min(86, rect.width * 0.2, rect.height * 0.2);
      renderer.getDrawingBufferSize(bufferSize);
      materials.uniforms.localXrayCenter.value.set(
        (x / rect.width) * bufferSize.x,
        (1 - y / rect.height) * bufferSize.y,
      );
      materials.uniforms.localXrayRadius.value = (radius * bufferSize.x) / rect.width;
      materials.uniforms.localXrayActive.value = 1;
      ring.style.display = "block";
      ring.style.left = `${clientX}px`;
      ring.style.top = `${clientY}px`;
      ring.style.width = ring.style.height = `${radius * 2}px`;
    },
    dispose() {
      canvas.removeEventListener("pointermove", track);
      canvas.removeEventListener("pointerdown", track);
      canvas.removeEventListener("pointerup", track);
      canvas.removeEventListener("pointerleave", leave);
      canvas.removeEventListener("pointercancel", leave);
      window.removeEventListener("blur", leave);
      ring.remove();
      materials.dispose();
    },
  };
}
