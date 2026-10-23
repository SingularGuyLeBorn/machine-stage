import type * as THREE from "three";

// 纯代码角色的统一契约：生成器在运行时构建几何、材质与关键帧轨道，返回该结构交给 CodeModel 播放。
export interface CodeGlowPulse {
  material: THREE.MeshStandardMaterial;
  base: number;
  amp: number;
  speed: number;
  phase: number;
}

export interface CodeCharacter {
  root: THREE.Group;
  clips: THREE.AnimationClip[];
  placement: { scale: number; position: [number, number, number] };
  glow: CodeGlowPulse[];
  dispose: () => void;
}

// 交互热点约定：以 hotspot:<动作名> 命名的隐形网格挂在部件上，
// 点击时由 CodeModel 拾取并播放对应动作。
export const HOTSPOT_PREFIX = "hotspot:";
