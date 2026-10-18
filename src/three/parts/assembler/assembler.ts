import * as THREE from "three";
import { mirrorGeometry } from "../kernel/geometry";
import { resolveConstants } from "../registry/expression";
import type { BuildLayer, MateSpec, ModelRegistry, NodeDef, PartDefinition } from "../registry/types";
import { buildGeometry, resolveSpec, type GeometryBuilder } from "./geometry";

// ============================================================================
// assembler —— 注册表 → 场景树（M-A 框架底座核心）
//
// 流程：解析常量 → 建节点树 → 展开双侧件 → 拓扑解析 Mate → 生成几何/材质 →
//       装配网格（静态件普通 Mesh / 重复件 InstancedMesh / 可动件挂节点。
// 每帧纪律：resetNodes() → 应用动画 → syncInstances()（防止姿态残留）。
// ============================================================================

export interface InstanceLayoutArgs {
  part: PartDefinition;
  partId: string;
  index: number;
  count: number;
  constants: Record<string, number>;
  /** 实例所属节点名（有 instance_nodes 时）；布局矩阵应相对该节点。 */
  node: string | null;
}

/** 实例分布函数（模型代码注册）：返回实例相对「零件装配位」或「所属节点」的偏移矩阵。 */
export type InstanceLayout = (args: InstanceLayoutArgs) => THREE.Matrix4;

export interface BuildOptions {
  builders?: Record<string, GeometryBuilder>;
  materials?: Record<string, THREE.Material>;
  instanceLayouts?: Record<string, InstanceLayout>;
  /** 静默默认布局时是否告警（测试用 test registry 时置 false）。 */
  warnMissingLayout?: boolean;
}

interface ExpandedPart {
  def: PartDefinition;
  id: string;
  mirrored: boolean;
}

export interface AssembledInstance {
  index: number;
  node: string | null;
  /** 静止位姿下模型空间的矩阵。 */
  restMatrix: THREE.Matrix4;
  /** 相对所属节点的本地矩阵（node 驱动）。 */
  localMatrix: THREE.Matrix4;
}

export interface PartHandle {
  def: PartDefinition;
  partId: string;
  mirrored: boolean;
  assembly: string;
  buildLayer: BuildLayer;
  buildOrder: number;
  object: THREE.Mesh | THREE.InstancedMesh;
  instanced: boolean;
  /** 零件主节点（instanced 且每实例不同节点时为 null）。 */
  node: string | null;
  geometry: THREE.BufferGeometry;
  instances: AssembledInstance[];
  /** 写入实例矩阵（模型空间）。 */
  setInstanceMatrix(index: number, matrix: THREE.Matrix4): void;
}

export interface AssembledModel {
  registry: ModelRegistry;
  root: THREE.Group;
  constants: Record<string, number>;
  nodes: Map<string, THREE.Group>;
  nodeRest: Map<string, THREE.Matrix4>;
  parts: PartHandle[];
  partsByAssembly: Map<string, PartHandle[]>;
  getPart(partId: string): PartHandle | undefined;
  getNode(name: string): THREE.Group | undefined;
  /** 所有节点回到静止位姿（每条动画采样前统一调用）。 */
  resetNodes(): void;
  /** 同步「骑在节点上」的实例矩阵。 */
  syncInstances(): void;
  /** 当前实例矩阵（模型空间，活跃位姿）。 */
  instanceMatrix(handle: PartHandle, index: number, target: THREE.Matrix4): THREE.Matrix4;
  /** 构建滑杆：仅显示 build_order <= threshold 的零件；null = 全部显示。 */
  setBuildThreshold(threshold: number | null): void;
  /** 零件包围盒（模型空间，活跃位姿）。 */
  partBounds(handle: PartHandle, target: THREE.Box3): THREE.Box3;
  dispose(): void;
}

const ANCHOR_TOKENS = new Set(["center", "top", "bottom", "front", "back", "left", "right"]);

/** 解析锚点字符串 → 单位符号（-1/0/1）×3。 */
export function parseAnchor(anchor: string | undefined): { x: -1 | 0 | 1; y: -1 | 0 | 1; z: -1 | 0 | 1 } {
  const result = { x: 0 as -1 | 0 | 1, y: 0 as -1 | 0 | 1, z: 0 as -1 | 0 | 1 };
  if (!anchor) return result;
  for (const rawToken of anchor.split("-")) {
    const token = rawToken.trim().toLowerCase();
    if (!token || token === "center") continue;
    if (!ANCHOR_TOKENS.has(token))
      throw new Error(`assembler：未知锚点 token "${token}"（anchor="${anchor}"）`);
    if (token === "left") result.x = -1;
    else if (token === "right") result.x = 1;
    else if (token === "top") result.y = 1;
    else if (token === "bottom") result.y = -1;
    else if (token === "front") result.z = 1;
    else if (token === "back") result.z = -1;
  }
  return result;
}

/** 取包围盒上的锚点。 */
export function anchorPoint(box: THREE.Box3, anchor: string | undefined): THREE.Vector3 {
  const sign = parseAnchor(anchor);
  const target = new THREE.Vector3();
  target.x = sign.x < 0 ? box.min.x : sign.x > 0 ? box.max.x : (box.min.x + box.max.x) / 2;
  target.y = sign.y < 0 ? box.min.y : sign.y > 0 ? box.max.y : (box.min.y + box.max.y) / 2;
  target.z = sign.z < 0 ? box.min.z : sign.z > 0 ? box.max.z : (box.min.z + box.max.z) / 2;
  return target;
}

function isPartRef(to: string): boolean {
  return to.includes(".");
}

/**
 * 几何自检：NaN / Infinity 顶点不会报错，只会变成「看不见或破面的零件」，
 * 白白浪费一整轮排查。这里在装配期就指名零件炸掉。
 * 常见成因：声明里引用了未定义的常量名（resolveSpec 对解析失败的字符串保持原样）。
 */
export function assertFiniteGeometry(geometry: THREE.BufferGeometry, owner: string): void {
  const position = geometry.getAttribute("position");
  if (!position) {
    throw new Error(`装配器：零件 "${owner}" 的几何缺少 position 属性`);
  }
  const array = position.array as ArrayLike<number>;
  for (let i = 0; i < array.length; i++) {
    if (!Number.isFinite(array[i])) {
      const vertex = Math.floor(i / 3);
      const axis = "xyz"[i % 3] ?? "?";
      throw new Error(
        `装配器：零件 "${owner}" 的几何含非有限坐标（顶点 ${vertex} 的 ${axis} 分量 = ${array[i]}）。` +
          "多为 geometry/mate 里引用了未定义常量或表达式无法解析，请检查该零件的声明。",
      );
    }
  }
}

export function buildModel(registry: ModelRegistry, options: BuildOptions = {}): AssembledModel {
  const constants = resolveConstants(registry.constants);
  const builders = { ...options.builders };
  const geometryContext = { constants, builders };
  const root = new THREE.Group();
  root.name = registry.model;
  const geometryCache = new Map<string, THREE.BufferGeometry>();
  const ownedGeometries = new Set<THREE.BufferGeometry>();

  const getGeometry = (
    spec: unknown,
    mirrored: boolean,
    cacheKey: string,
    owner: string,
  ): THREE.BufferGeometry => {
    const key = mirrored ? `${cacheKey}#mirror` : cacheKey;
    const cached = geometryCache.get(key);
    if (cached) return cached;
    const resolved = resolveSpec(spec, constants);
    let built: THREE.BufferGeometry;
    try {
      built = buildGeometry(resolved as never, geometryContext);
    } catch (error) {
      throw new Error(`装配器：零件 "${owner}" 的几何构建失败（${(error as Error).message}）`, {
        cause: error,
      });
    }
    if (mirrored) built = mirrorGeometry(built);
    assertFiniteGeometry(built, owner);
    built.computeBoundingBox();
    built.computeBoundingSphere();
    geometryCache.set(key, built);
    ownedGeometries.add(built);
    return built;
  };

  // ---- 节点树 ----
  const nodes = new Map<string, THREE.Group>();
  const nodeRest = new Map<string, THREE.Matrix4>();
  const nodeDefs = new Map<string, NodeDef>(registry.nodes.map((def) => [def.name, def]));
  const createNode = (name: string): THREE.Group => {
    const existing = nodes.get(name);
    if (existing) return existing;
    const def = nodeDefs.get(name);
    if (!def) throw new Error(`assembler：节点 "${name}" 未在注册表中声明`);
    const parent = def.parent === "root" ? root : createNode(def.parent);
    const group = new THREE.Group();
    group.name = name;
    if (def.pivot) {
      const resolved = resolveSpec(def.pivot, constants) as [number, number, number];
      group.position.set(resolved[0], resolved[1], resolved[2]);
    }
    if (def.rest_rotation) {
      // 静止姿态旋转：静态装配检测看到的就是这个姿态（如 V 型发动机列倾角）
      const euler = resolveSpec(def.rest_rotation, constants) as [number, number, number];
      group.quaternion.setFromEuler(
        new THREE.Euler(
          THREE.MathUtils.degToRad(euler[0]),
          THREE.MathUtils.degToRad(euler[1]),
          THREE.MathUtils.degToRad(euler[2]),
          "XYZ",
        ),
      );
    }
    parent.add(group);
    group.updateMatrix();
    nodes.set(name, group);
    nodeRest.set(name, group.matrix.clone());
    return group;
  };
  for (const def of registry.nodes) createNode(def.name);

  // ---- 双侧件展开 ----
  const expanded: ExpandedPart[] = [];
  for (const def of registry.parts) {
    if (def.dual) {
      // 双侧件先左后右（索引分配规则，见框架文档第 3 节）
      expanded.push({ def, id: `${def.id}_l`, mirrored: false });
      expanded.push({ def, id: `${def.id}_r`, mirrored: true });
    } else {
      expanded.push({ def, id: def.id, mirrored: false });
    }
  }
  expanded.sort((a, b) => a.def.build_order - b.def.build_order || a.id.localeCompare(b.id));
  const byId = new Map(expanded.map((item) => [item.id, item]));

  // ---- 拓扑解析 Mate ----
  // 语义（框架文档第 4 节）：
  //   absolute          → 相对「所属节点」的装配原点（无节点 = 模型原点）
  //   anchor / coaxial  → 目标在模型空间的锚点 + 偏移，再折算到所属节点局部坐标系
  // 双侧件（dual）在「mate 表达所在的空间」内镜像：位置 x 取反，欧拉角 (rx, -ry, -rz)。
  const resolvedLocal = new Map<string, THREE.Matrix4>();
  const resolvedModel = new Map<string, THREE.Matrix4>();
  const resolvedGeometry = new Map<string, THREE.BufferGeometry>();
  const visiting = new Set<string>();
  const identityMatrix = new THREE.Matrix4();

  const nodeRestMatrix = (name: string | undefined): THREE.Matrix4 =>
    name ? (nodeRest.get(name) ?? identityMatrix) : identityMatrix;

  const geometryFor = (item: ExpandedPart): THREE.BufferGeometry => {
    const cached = resolvedGeometry.get(item.id);
    if (cached) return cached;
    const geometry = getGeometry(
      item.def.geometry,
      item.mirrored,
      JSON.stringify(item.def.geometry),
      item.id,
    );
    resolvedGeometry.set(item.id, geometry);
    return geometry;
  };

  const composeMatrix = (
    position: THREE.Vector3,
    rotation: [number, number, number],
    mirrored: boolean,
  ): THREE.Matrix4 => {
    const p = mirrored ? new THREE.Vector3(-position.x, position.y, position.z) : position.clone();
    const r: [number, number, number] = mirrored ? [rotation[0], -rotation[1], -rotation[2]] : rotation;
    const quaternion = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(
        THREE.MathUtils.degToRad(r[0]),
        THREE.MathUtils.degToRad(r[1]),
        THREE.MathUtils.degToRad(r[2]),
        "XYZ",
      ),
    );
    return new THREE.Matrix4().compose(p, quaternion, new THREE.Vector3(1, 1, 1));
  };

  const modelMatrixOf = (id: string): THREE.Matrix4 => {
    const cached = resolvedModel.get(id);
    if (cached) return cached;
    const item = byId.get(id);
    if (!item) throw new Error(`assembler：零件 "${id}" 不存在（检查 dual 展开后的 _l/_r 命名）`);
    const matrix = new THREE.Matrix4().multiplyMatrices(nodeRestMatrix(item.def.node), resolveLocal(id));
    resolvedModel.set(id, matrix);
    return matrix;
  };

  const modelBoxOf = (item: ExpandedPart): THREE.Box3 => {
    const matrix = modelMatrixOf(item.id);
    const geometry = geometryFor(item);
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    const box = new THREE.Box3().copy(geometry.boundingBox!);
    box.applyMatrix4(matrix);
    return box;
  };

  const resolveLocal = (id: string): THREE.Matrix4 => {
    const cached = resolvedLocal.get(id);
    if (cached) return cached;
    if (visiting.has(id)) {
      throw new Error(`assembler：mate 循环引用（${[...visiting].join(" → ")} → ${id}）`);
    }
    const item = byId.get(id);
    if (!item) throw new Error(`assembler：零件 "${id}" 不存在（检查 dual 展开后的 _l/_r 命名）`);
    visiting.add(id);
    try {
      const matrix = resolveMate(item);
      resolvedLocal.set(id, matrix);
      return matrix;
    } finally {
      visiting.delete(id);
    }
  };

  const resolveMate = (item: ExpandedPart): THREE.Matrix4 => {
    const mate: MateSpec = item.def.mate ?? { type: "absolute" };
    const nodeRest4 = nodeRestMatrix(item.def.node);
    if (mate.type === "absolute") {
      const pos = resolveSpec(mate.position ?? [0, 0, 0], constants) as [number, number, number];
      const rot = mate.rotation
        ? (resolveSpec(mate.rotation, constants) as [number, number, number])
        : ([0, 0, 0] as [number, number, number]);
      // 节点局部空间直接给出
      return composeMatrix(new THREE.Vector3(pos[0], pos[1], pos[2]), rot, item.mirrored);
    }
    const offset = resolveSpec(mate.offset ?? [0, 0, 0], constants) as [number, number, number];
    let center: THREE.Vector3;
    if (isPartRef(mate.to)) {
      const targetItem = byId.get(mate.to);
      if (!targetItem) throw new Error(`assembler：mate.to 引用的零件 "${mate.to}" 不存在`);
      const box = modelBoxOf(targetItem);
      center = mate.type === "anchor" ? anchorPoint(box, mate.anchor) : box.getCenter(new THREE.Vector3());
    } else {
      // 引用节点：以节点装配原点（pivot）为锚
      center = createNode(mate.to).position.clone();
    }
    const modelPosition = center.add(new THREE.Vector3(offset[0], offset[1], offset[2]));
    const rot = mate.rotation
      ? (resolveSpec(mate.rotation, constants) as [number, number, number])
      : ([0, 0, 0] as [number, number, number]);
    const modelMatrix = composeMatrix(modelPosition, rot, item.mirrored);
    return new THREE.Matrix4().copy(nodeRest4).invert().multiply(modelMatrix);
  };

  // ---- 装配 ----
  const fallbackMaterial = new THREE.MeshStandardMaterial({
    color: 0x9aa0a6,
    metalness: 0.4,
    roughness: 0.6,
  });
  const materialFor = (name: string): THREE.Material => options.materials?.[name] ?? fallbackMaterial;
  const parts: PartHandle[] = [];
  const partsByAssembly = new Map<string, PartHandle[]>();
  const nodeRestInverse = new Map<string, THREE.Matrix4>();
  for (const [name, matrix] of nodeRest) {
    nodeRestInverse.set(name, new THREE.Matrix4().copy(matrix).invert());
  }

  for (const item of expanded) {
    const matrix = modelMatrixOf(item.id);
    const geometry = geometryFor(item);
    const material = materialFor(item.def.material);
    const count = item.def.instances ?? 1;
    const instanceNodes = item.def.instance_nodes ?? null;
    const layout = item.def.instance_layout ? options.instanceLayouts?.[item.def.instance_layout] : undefined;
    if (item.def.instances && item.def.instances > 1 && !layout && !instanceNodes) {
      if (options.warnMissingLayout !== false) {
        console.warn(
          `assembler：零件 "${item.id}" 有 ${item.def.instances} 个实例但未提供 instance_layout，全部叠加在原点`,
        );
      }
    }

    const instances: AssembledInstance[] = [];
    let handle: PartHandle;

    if (count > 1) {
      const instanced = new THREE.InstancedMesh(geometry, material, count);
      instanced.name = item.id;
      instanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      for (let i = 0; i < count; i++) {
        const node = instanceNodes ? instanceNodes[i] : null;
        const nodeMatrix = node ? new THREE.Matrix4().copy(nodeRestMatrix(node)) : new THREE.Matrix4();
        const delta = layout
          ? layout({ part: item.def, partId: item.id, index: i, count, constants, node })
          : new THREE.Matrix4();
        // 语义：instance_nodes 时布局为「该节点局部」偏移（mate 不参与）；
        //       否则布局叠加在零件装配位（mate）之上，二者同处一个坐标系。
        const local = instanceNodes
          ? delta.clone()
          : new THREE.Matrix4().copy(resolveLocal(item.id)).multiply(delta);
        const rest = new THREE.Matrix4().multiplyMatrices(nodeMatrix, local);
        instances.push({ index: i, node, restMatrix: rest, localMatrix: local });
        instanced.setMatrixAt(i, rest);
      }
      instanced.instanceMatrix.needsUpdate = true;
      instanced.computeBoundingSphere();
      instanced.frustumCulled = !instanceNodes;
      instanced.matrixAutoUpdate = true;
      root.add(instanced);
      handle = {
        def: item.def,
        partId: item.id,
        mirrored: item.mirrored,
        assembly: item.def.assembly,
        buildLayer: item.def.build_layer,
        buildOrder: item.def.build_order,
        object: instanced,
        instanced: true,
        node: instanceNodes ? null : (item.def.node ?? null),
        geometry,
        instances,
        setInstanceMatrix: (index, value) => {
          instanced.setMatrixAt(index, value);
          instanced.instanceMatrix.needsUpdate = true;
        },
      };
    } else {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = item.id;
      const parentNode = item.def.node ? nodes.get(item.def.node) : undefined;
      if (item.def.node && !parentNode)
        throw new Error(`assembler：零件 "${item.id}" 的节点 "${item.def.node}" 不存在`);
      const nodeMatrixInverse = item.def.node
        ? (nodeRestInverse.get(item.def.node) ?? new THREE.Matrix4())
        : new THREE.Matrix4();
      const local = new THREE.Matrix4().multiplyMatrices(nodeMatrixInverse, matrix);
      // 分解为 TRS：.position/.quaternion 可读，同时矩阵与装配解一致
      local.decompose(mesh.position, mesh.quaternion, mesh.scale);
      mesh.updateMatrix();
      mesh.matrixWorldNeedsUpdate = true;
      (parentNode ?? root).add(mesh);
      instances.push({
        index: 0,
        node: item.def.node ?? null,
        restMatrix: matrix,
        localMatrix: local.clone(),
      });
      handle = {
        def: item.def,
        partId: item.id,
        mirrored: item.mirrored,
        assembly: item.def.assembly,
        buildLayer: item.def.build_layer,
        buildOrder: item.def.build_order,
        object: mesh,
        instanced: false,
        node: item.def.node ?? null,
        geometry,
        instances,
        setInstanceMatrix: (index, value) => {
          if (index !== 0) throw new Error(`assembler：静态零件 "${item.id}" 只有一个实例`);
          value.decompose(mesh.position, mesh.quaternion, mesh.scale);
          mesh.updateMatrix();
          mesh.matrixWorldNeedsUpdate = true;
        },
      };
    }
    parts.push(handle);
    const list = partsByAssembly.get(handle.assembly) ?? [];
    list.push(handle);
    partsByAssembly.set(handle.assembly, list);
  }

  root.updateMatrixWorld(true);

  const scratch = new THREE.Matrix4();
  const rootInverse = new THREE.Matrix4();

  const instanceMatrix = (handle: PartHandle, index: number, target: THREE.Matrix4): THREE.Matrix4 => {
    if (!handle.instanced) {
      rootInverse.copy(root.matrixWorld).invert();
      return target.multiplyMatrices(rootInverse, handle.object.matrixWorld);
    }
    const instance = handle.instances[index];
    if (instance.node) {
      const node = nodes.get(instance.node)!;
      rootInverse.copy(root.matrixWorld).invert();
      return target.multiplyMatrices(rootInverse, node.matrixWorld).multiply(instance.localMatrix);
    }
    (handle.object as THREE.InstancedMesh).getMatrixAt(index, target);
    return target;
  };

  const assembled: AssembledModel = {
    registry,
    root,
    constants,
    nodes,
    nodeRest,
    parts,
    partsByAssembly,
    getPart: (partId) => parts.find((handle) => handle.partId === partId),
    getNode: (name) => nodes.get(name),
    resetNodes: () => {
      for (const [name, group] of nodes) {
        // 静止姿态 = nodeRest 的完整 TRS（含 rest_rotation），不是「无旋转」
        nodeRest.get(name)!.decompose(group.position, group.quaternion, group.scale);
        group.updateMatrix();
      }
      root.updateMatrixWorld(true);
    },
    syncInstances: () => {
      root.updateMatrixWorld(true);
      for (const handle of parts) {
        if (!handle.instanced) continue;
        for (const instance of handle.instances) {
          if (!instance.node) continue;
          const node = nodes.get(instance.node)!;
          rootInverse.copy(root.matrixWorld).invert();
          scratch.multiplyMatrices(rootInverse, node.matrixWorld).multiply(instance.localMatrix);
          handle.setInstanceMatrix(instance.index, scratch);
        }
      }
    },
    instanceMatrix,
    setBuildThreshold: (threshold) => {
      for (const handle of parts) {
        handle.object.visible = threshold === null || handle.buildOrder <= threshold;
      }
    },
    partBounds: (handle, target) => {
      target.makeEmpty();
      if (!handle.geometry.boundingBox) handle.geometry.computeBoundingBox();
      const box = new THREE.Box3();
      if (!handle.instanced) {
        rootInverse.copy(root.matrixWorld).invert();
        box
          .copy(handle.geometry.boundingBox!)
          .applyMatrix4(scratch.multiplyMatrices(rootInverse, handle.object.matrixWorld));
        target.union(box);
      } else {
        for (const instance of handle.instances) {
          instanceMatrix(handle, instance.index, scratch);
          box.copy(handle.geometry.boundingBox!).applyMatrix4(scratch);
          target.union(box);
        }
      }
      return target;
    },
    dispose: () => {
      for (const handle of parts) {
        handle.object.removeFromParent();
        if (handle.instanced) (handle.object as THREE.InstancedMesh).dispose();
      }
      for (const geometry of ownedGeometries) geometry.dispose();
      for (const node of nodes.values()) node.removeFromParent();
      geometryCache.clear();
      resolvedGeometry.clear();
      fallbackMaterial.dispose();
    },
  };

  return assembled;
}
