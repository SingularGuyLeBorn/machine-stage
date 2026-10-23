import type { Material } from "three";

// 显示层（高亮/透视）可以叠加克隆；模型动画始终拥有最底层材质的着色器。
// 用弱引用记录来源，避免把 Material 塞入 userData 后被 clone() 深拷贝。
const sources = new WeakMap<Material, Material>();

export function displayMaterialSource(material: Material): Material {
  return sources.get(material) ?? material;
}

export function cloneDisplayMaterial(material: Material): Material {
  const clone = material.clone();
  sources.set(clone, displayMaterialSource(material));
  clone.onBeforeCompile = function (shader, renderer) {
    material.onBeforeCompile.call(this, shader, renderer);
  };
  clone.customProgramCacheKey = () => material.customProgramCacheKey();
  return clone;
}
