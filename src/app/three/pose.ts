import * as THREE from "three";
import {
  instanceKey,
  parseInstanceKey,
  resolveSpec,
  type AssembledModel,
  type DamageState,
  type PartHandle,
} from "@/three/parts";

// ============================================================================
// app/three/pose —— 视口姿态层（爆炸图 / 透视 / 选中高亮）
//
// 只改「显示」，不改装配结果：所有函数都能被 clearPose() 还原成注册表装配态。
// 爆炸方向由总成声明的 explode 向量决定（外壳最远、核心不动）。
// ============================================================================

/** 每层之间的爆炸间距（米）：层号越大离核心越远。 */
export const EXPLODE_STEP_M = 0.3;

const explodeDirections = new WeakMap<AssembledModel, Map<string, THREE.Vector3>>();

function directionMap(assembled: AssembledModel): Map<string, THREE.Vector3> {
  const cached = explodeDirections.get(assembled);
  if (cached) return cached;
  const map = new Map<string, THREE.Vector3>();
  for (const assembly of assembled.registry.assemblies) {
    const resolved = assembly.explode
      ? (resolveSpec(assembly.explode, assembled.constants) as [number, number, number])
      : [0, 1, 0];
    const dir = new THREE.Vector3(resolved[0], resolved[1], resolved[2]);
    if (dir.lengthSq() === 0) dir.set(0, 1, 0);
    map.set(assembly.id, dir.normalize());
  }
  explodeDirections.set(assembled, map);
  return map;
}

const scratchVector = new THREE.Vector3();
const scratchQuaternion = new THREE.Quaternion();
const scratchMatrixA = new THREE.Matrix4();
const scratchMatrixB = new THREE.Matrix4();
const scratchMatrixC = new THREE.Matrix4();
const EMPTY_PARTS: ReadonlySet<string> = new Set();

/** 零件层的爆炸偏移（模型空间）。 */
export function explodeOffsetOf(
  assembled: AssembledModel,
  handle: PartHandle,
  factor: number,
): THREE.Vector3 {
  // 零件级方向：ERA 夹层这类需要沿各自法线分层，不受总成方向影响。
  if (handle.def.explode) {
    const resolved = resolveSpec(handle.def.explode.direction, assembled.constants) as [
      number,
      number,
      number,
    ];
    const distance =
      handle.def.explode.distance === undefined
        ? EXPLODE_STEP_M
        : Number(resolveSpec(handle.def.explode.distance, assembled.constants));
    scratchVector.set(resolved[0], resolved[1], resolved[2]);
    if (scratchVector.lengthSq() === 0) scratchVector.set(0, 1, 0);
    return scratchVector.normalize().multiplyScalar(distance * factor);
  }
  const dir = directionMap(assembled).get(handle.assembly) ?? new THREE.Vector3(0, 1, 0);
  return scratchVector.copy(dir).multiplyScalar((handle.buildLayer - 1) * EXPLODE_STEP_M * factor);
}

/**
 * 爆炸图：非实例件改矩阵（父节点局部），实例件改实例矩阵（模型空间）。
 * 幂等：每帧调用安全。
 *
 * 实例件分三种基准：
 *   · 挂节点的 → 本帧 syncInstances 刚写入的绝对位姿；
 *   · 动画件（motionParts，如负重轮）→ animate 本帧刚写入的位姿；
 *   · 静态件 → restMatrix（不能读当前矩阵，否则每帧叠加会飞走）。
 */
export function applyExplode(
  assembled: AssembledModel,
  factor: number,
  motionParts: ReadonlySet<string> = EMPTY_PARTS,
): void {
  if (factor === 0) {
    clearExplode(assembled, motionParts);
    return;
  }
  assembled.root.updateMatrixWorld(true);
  for (const handle of assembled.parts) {
    const offset = explodeOffsetOf(assembled, handle, factor);
    if (!handle.instanced) {
      const object = handle.object;
      const parent = object.parent;
      if (!parent) continue;
      // 模型空间偏移 → 父节点局部空间（父节点都是刚体：只有平移与旋转）
      parent.getWorldQuaternion(scratchQuaternion).invert();
      const localOffset = offset.clone().applyQuaternion(scratchQuaternion);
      object.matrixAutoUpdate = false;
      // 动画件（可动舱盖）用本帧位姿；静态件用静止局部矩阵，避免爆炸偏移逐帧叠加
      const base = motionParts.has(handle.partId)
        ? scratchMatrixB.copy(object.matrix)
        : handle.instances[0].localMatrix;
      object.matrix
        .copy(scratchMatrixA.makeTranslation(localOffset.x, localOffset.y, localOffset.z))
        .multiply(base);
      // 战损变体与完好件同父节点/同局部 TRS：爆炸偏移也要跟上
      for (const variant of Object.values(handle.damageObjects)) {
        if (!variant) continue;
        variant.matrixAutoUpdate = false;
        variant.matrix.copy(object.matrix);
      }
    } else {
      const animated = motionParts.has(handle.partId);
      for (const instance of handle.instances) {
        const base =
          instance.node || animated
            ? assembled.instanceMatrix(handle, instance.index, scratchMatrixB)
            : instance.restMatrix;
        scratchMatrixB.copy(base).premultiply(scratchMatrixA.makeTranslation(offset.x, offset.y, offset.z));
        handle.setInstanceMatrix(instance.index, scratchMatrixB);
      }
    }
  }
  assembled.root.updateMatrixWorld(true);
}

/**
 * 还原爆炸位移（非实例件恢复 TRS 驱动，实例件回到静止装配位）。
 * motionParts 是动画每帧写入的实例（履带/负重轮/舱盖…），绝不能在这里复位——
 * 否则爆炸关闭时每帧都会把行进/悬挂姿态抹回静止位，看起来就是「履带和轮子不动」。
 */
export function clearExplode(
  assembled: AssembledModel,
  motionParts: ReadonlySet<string> = EMPTY_PARTS,
): void {
  let touched = false;
  for (const handle of assembled.parts) {
    if (!handle.instanced) {
      if (!handle.object.matrixAutoUpdate) {
        handle.object.matrixAutoUpdate = true;
        handle.object.updateMatrix();
        touched = true;
      }
      for (const variant of Object.values(handle.damageObjects)) {
        if (variant && !variant.matrixAutoUpdate) {
          variant.matrixAutoUpdate = true;
          variant.updateMatrix();
          touched = true;
        }
      }
    } else {
      if (motionParts.has(handle.partId)) continue;
      for (const instance of handle.instances) {
        if (!instance.node) {
          handle.setInstanceMatrix(instance.index, instance.restMatrix);
          touched = true;
        }
      }
    }
  }
  if (touched) assembled.root.updateMatrixWorld(true);
}

interface XrayState {
  /** 被透视件 → 原始材质（一件可能是多材质数组） */
  originals: Map<THREE.Object3D, THREE.Material | THREE.Material[]>;
  clones: THREE.Material[];
}

const xrayStates = new WeakMap<AssembledModel, XrayState>();

/**
 * 透视（X 光）：只把「外壳」换成半透明幽灵壳，内部件保持不透明。
 *
 * 旧实现把所有零件的共享材质改成透明：MBT/ED 近千个零件、数百万三角面
 * 全部进入透明排序 + 混合，实测 1600 宽只剩 22fps。现在给外壳克隆独立材质，
 * 内部件的原材质完全不动，透明层数量降到外壳级。
 */
export function applyXray(
  assembled: AssembledModel,
  enabled: boolean,
  ghostPart: (handle: PartHandle) => boolean = () => true,
): void {
  const existing = xrayStates.get(assembled);
  if (!enabled) {
    if (!existing) return;
    for (const [object, original] of existing.originals) {
      (object as THREE.Mesh).material = original;
    }
    for (const clone of existing.clones) clone.dispose();
    xrayStates.delete(assembled);
    return;
  }
  if (existing) return;

  const state: XrayState = { originals: new Map(), clones: [] };
  const cloneOf = new Map<THREE.Material, THREE.Material>();
  for (const handle of assembled.parts) {
    if (!ghostPart(handle)) continue;
    const object = handle.object;
    const original = object.material;
    const source = Array.isArray(original) ? original : [original];
    const ghosted = source.map((material) => {
      if (!(material instanceof THREE.MeshStandardMaterial)) return material;
      const cached = cloneOf.get(material);
      if (cached) return cached;
      const clone = material.clone();
      clone.transparent = true;
      clone.opacity = 0.16;
      clone.depthWrite = false;
      clone.side = THREE.DoubleSide;
      clone.needsUpdate = true;
      cloneOf.set(material, clone);
      state.clones.push(clone);
      return clone;
    });
    state.originals.set(object, original);
    object.material = Array.isArray(original) ? ghosted : ghosted[0]!;
  }
  xrayStates.set(assembled, state);
}

/** 选中/悬停高亮：part 级换材质克隆；给了实例序号时只染那一个实例（instanceColor）。 */
const highlightTints = new WeakMap<AssembledModel, Array<{ handle: PartHandle; index: number }>>();
const SELECT_TINT = new THREE.Color(1.8, 3.4, 6.0);
const HOVER_TINT = new THREE.Color(1.3, 1.6, 2.0);
const NO_TINT = new THREE.Color(1, 1, 1);

function instanceColorsOf(handle: PartHandle): THREE.InstancedBufferAttribute | null {
  const mesh = handle.object;
  if (!(mesh as THREE.InstancedMesh).isInstancedMesh) return null;
  const instanced = mesh as THREE.InstancedMesh;
  if (!instanced.instanceColor) {
    const colors = new Float32Array(handle.instances.length * 3).fill(1);
    instanced.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);
  }
  return instanced.instanceColor;
}

function tintInstance(handle: PartHandle, index: number, color: THREE.Color): void {
  const attribute = instanceColorsOf(handle);
  if (!attribute || index < 0 || index >= handle.instances.length) return;
  color.toArray(attribute.array as Float32Array, index * 3);
  attribute.needsUpdate = true;
}

export function applyHighlight(
  assembled: AssembledModel,
  selectedPartId: string | null,
  hoveredPartId: string | null,
  selectedInstance: number | null = null,
  hoveredInstance: number | null = null,
): void {
  // 先清掉上一帧染过的实例
  for (const entry of highlightTints.get(assembled) ?? []) {
    tintInstance(entry.handle, entry.index, NO_TINT);
  }
  highlightTints.set(assembled, []);

  const accent = new THREE.Color("#2f6ea8");
  const selectedHandle = selectedPartId ? assembled.getPart(selectedPartId) : undefined;
  const hoveredHandle = hoveredPartId ? assembled.getPart(hoveredPartId) : undefined;
  const instanceSelected =
    selectedHandle?.instanced && selectedInstance !== null && selectedHandle.instances[selectedInstance]
      ? selectedHandle
      : null;

  for (const handle of assembled.parts) {
    const wanted =
      handle === instanceSelected
        ? 0
        : handle.partId === selectedPartId
          ? 0.34
          : handle.partId === hoveredPartId
            ? 0.16
            : 0;
    const object = handle.object;
    const current = object.material as THREE.Material;
    const isClone = object.userData.__highlight === true;
    if (wanted === 0) {
      if (isClone) {
        const original = object.userData.__originalMaterial as THREE.Material;
        current.dispose();
        object.material = original;
        object.userData.__highlight = false;
        delete object.userData.__originalMaterial;
      }
      continue;
    }
    let material: THREE.MeshStandardMaterial;
    if (!isClone) {
      const original = current as THREE.MeshStandardMaterial;
      object.userData.__originalMaterial = original;
      material = original.clone();
      object.userData.__highlight = true;
      object.material = material;
    } else {
      material = current as THREE.MeshStandardMaterial;
    }
    material.emissive = accent;
    material.emissiveIntensity = wanted;
  }

  // 实例级染色：悬停淡、选中亮；同一实例时选中优先
  const tinted: Array<{ handle: PartHandle; index: number }> = [];
  const hoverInstanceTarget =
    hoveredHandle?.instanced && hoveredInstance !== null && hoveredHandle.instances[hoveredInstance]
      ? hoveredHandle
      : null;
  if (hoverInstanceTarget && hoveredInstance !== null) {
    tintInstance(hoverInstanceTarget, hoveredInstance, HOVER_TINT);
    tinted.push({ handle: hoverInstanceTarget, index: hoveredInstance });
  }
  if (instanceSelected && selectedInstance !== null) {
    tintInstance(instanceSelected, selectedInstance, SELECT_TINT);
    tinted.push({ handle: instanceSelected, index: selectedInstance });
  }
  highlightTints.set(assembled, tinted);
}

/** 单实例拆解：按 key 把实例沿模型空间平移（选中轮子 →「拆下」）。幂等：每帧可调。 */
const appliedDetach = new WeakMap<AssembledModel, Set<string>>();

export function applyDetach(
  assembled: AssembledModel,
  detached: readonly string[],
  options: {
    motionParts?: ReadonlySet<string>;
    offsetOf: (partId: string, index: number, count: number) => [number, number, number] | null;
  },
): void {
  const previous = appliedDetach.get(assembled) ?? new Set<string>();
  const next = new Set(detached);
  appliedDetach.set(assembled, next);

  // 装回：动画件每帧由 animate 重写，这里只还原静态件
  for (const key of previous) {
    if (next.has(key)) continue;
    const parsed = parseInstanceKey(key);
    if (!parsed) continue;
    const handle = assembled.getPart(parsed.partId);
    const instance = handle?.instances[parsed.index];
    if (!handle || !instance) continue;
    if (options.motionParts?.has(handle.partId)) continue;
    handle.setInstanceMatrix(parsed.index, instance.restMatrix);
  }

  if (next.size === 0) return;
  for (const handle of assembled.parts) {
    if (!handle.instanced) continue;
    let carriesKey = false;
    for (const key of next) {
      if (key.startsWith(`${handle.partId}#`)) {
        carriesKey = true;
        break;
      }
    }
    if (!carriesKey) continue;
    const animated = options.motionParts?.has(handle.partId) ?? false;
    for (const instance of handle.instances) {
      if (!next.has(instanceKey(handle.partId, instance.index))) continue;
      const offset = options.offsetOf(handle.partId, instance.index, handle.instances.length);
      if (!offset) continue;
      const base =
        instance.node || animated
          ? assembled.instanceMatrix(handle, instance.index, scratchMatrixB)
          : instance.restMatrix;
      handle.setInstanceMatrix(
        instance.index,
        scratchMatrixC
          .copy(base)
          .premultiply(scratchMatrixA.makeTranslation(offset[0], offset[1], offset[2])),
      );
    }
  }
}

/** 战损形态：只切预制变体的可见性；碰撞/支撑检测仍按完好几何。 */
export function applyDamage(assembled: AssembledModel, state: DamageState): void {
  for (const handle of assembled.parts) {
    if (Object.keys(handle.damageObjects).length === 0) continue;
    handle.setDamageState(state);
  }
}

/** 还原全部姿态层（切模型 / 重建 / 卸载时调用）。 */
export function clearPose(assembled: AssembledModel): void {
  clearExplode(assembled);
  applyXray(assembled, false);
  applyHighlight(assembled, null, null);
  appliedDetach.delete(assembled);
}
