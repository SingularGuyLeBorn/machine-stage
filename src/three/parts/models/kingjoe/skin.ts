import * as THREE from "three";
import type { GeometryBuilder } from "../../assembler/geometry";
import raw from "../kingjoe-skin/segments.generated.json";
import { mergeGeometries } from "../../kernel/geometry";
import { KJ } from "./constants";
import { KingJoeParts, pid } from "./helpers";
import type { Side, Vec3 } from "./rig";

// ============================================================================
// models/kingjoe/skin —— 真实网格皮
//
// 复用 models/kingjoe-skin/segments.generated.json（GLB 蒙皮切出的 578 件），
// 把它们从「四段静态模块」重新挂到真实关节节点上：
//   大腿→hip / 小腿→knee / 足→ankle / 上臂→arm / 前臂→forearm / 手指→finger；
//   骨盆→stomach / 上腹→waist / 胸与肩荚→chest / 头→ship。
// 源网格面朝 -Z，本项目面朝 +Z：镜像 z 并翻转绕序；顶点再平移到所属节点局部。
// 奥特曼 IP：个人参考，不做商用。
// ============================================================================

interface GeneratedPart {
  key: string;
  assembly: "legs" | "stomach" | "chest" | "ship";
  node: string;
  semantic: string;
  bone: string;
  name_cn: string;
  name_en: string;
  material: string;
  faces: number;
  verts: number;
  bbox: number[];
}

interface GeneratedSegment {
  key: string;
  position: string;
  normal: string;
  uv: string;
  index: string;
}

const GENERATED = raw as unknown as { parts: (GeneratedPart & GeneratedSegment)[] };
const SEGMENTS = new Map<string, GeneratedSegment>(GENERATED.parts.map((part) => [part.key, part]));

/** 皮肤模块的原始切面高度（生成 JSON 的局部原点）。 */
const SKIN_MODULE_Y = { legs: 0, stomach: 3.45, chest: 4.55, ship: 5.65 } as const;

/** GLB 骨架真实关节（项目坐标：+X 右、+Y 上、+Z 前；左臂/左腿为负 X）。 */
const REAL_JOINT = {
  hip: { l: [-0.3454, 2.9377, 0.0006], r: [0.3454, 2.9377, 0.0006] },
  knee: { l: [-0.5381, 1.6971, 0.0203], r: [0.5381, 1.6971, 0.0203] },
  ankle: { l: [-0.7318, 0.4735, -0.207], r: [0.7318, 0.4735, -0.207] },
  shoulder: { l: [-0.7043, 4.8718, 0.0503], r: [0.7043, 4.8718, 0.0503] },
  elbow: { l: [-1.1903, 3.9567, 0.0397], r: [1.1903, 3.9567, 0.0397] },
  wrist: { l: [-1.4766, 3.3831, 0.3576], r: [1.4766, 3.3831, 0.3576] },
  finger0: { l: [-1.4317, 3.2021, 0.659], r: [1.4317, 3.2021, 0.659] },
  finger1: { l: [-1.6278, 3.0587, 0.6126], r: [1.6278, 3.0587, 0.6126] },
  finger2: { l: [-1.6575, 2.9801, 0.4124], r: [1.6575, 2.9801, 0.4124] },
} as const;

interface Placement {
  assembly: GeneratedPart["assembly"];
  node: string;
  translate: Vec3;
}

function sideOf(semantic: string): Side | null {
  if (semantic.endsWith("_l")) return "l";
  if (semantic.endsWith("_r")) return "r";
  return null;
}

function modulePlacement(assembly: GeneratedPart["assembly"]): Placement {
  return { assembly, node: assembly, translate: [0, 0, 0] };
}

function jointPlacement(
  part: GeneratedPart,
  node: string,
  joint: { l: readonly [number, number, number]; r: readonly [number, number, number] },
): Placement {
  const side = sideOf(part.semantic) ?? "l";
  const origin = joint[side];
  const my = SKIN_MODULE_Y[part.assembly];
  // 源顶点是模块局部坐标：世界 y = y + my + shift；节点世界 y = joint + shift，
  // 位移 = my - joint（shift 抵消）。
  return { assembly: part.assembly, node, translate: [-origin[0], my - origin[1], -origin[2]] };
}

function placementOf(part: GeneratedPart): Placement {
  const s = part.semantic;
  if (s.startsWith("head")) return modulePlacement("ship");
  if (s.startsWith("torso") || s.startsWith("shoulder_pod") || s.startsWith("clavicle")) {
    return modulePlacement("chest");
  }
  if (s.startsWith("abdomen")) {
    return {
      assembly: "stomach",
      node: "waist",
      translate: [0, SKIN_MODULE_Y.stomach - (SKIN_MODULE_Y.stomach + KJ.WAIST_OFFSET), 0],
    };
  }
  if (s.startsWith("pelvis")) return modulePlacement("stomach");
  if (s.startsWith("hip_pod")) return modulePlacement("legs");
  if (s.startsWith("thigh")) return jointPlacement(part, `hip_${sideOf(s)}`, REAL_JOINT.hip);
  if (s.startsWith("calf")) return jointPlacement(part, `knee_${sideOf(s)}`, REAL_JOINT.knee);
  if (s.startsWith("foot")) return jointPlacement(part, `ankle_${sideOf(s)}`, REAL_JOINT.ankle);
  if (s.startsWith("upperarm")) return jointPlacement(part, `arm_${sideOf(s)}`, REAL_JOINT.shoulder);
  if (s.startsWith("elbow_guard")) {
    const side = sideOf(s)!;
    const followsForearm = part.bone.includes("Forearm");
    return followsForearm
      ? jointPlacement(part, `forearm_${side}`, REAL_JOINT.elbow)
      : jointPlacement(part, `arm_${side}`, REAL_JOINT.shoulder);
  }
  if (s.startsWith("forearm")) return jointPlacement(part, `forearm_${sideOf(s)}`, REAL_JOINT.elbow);
  if (s.startsWith("hand") || s.startsWith("wrist_guard")) {
    return jointPlacement(part, `hand_${sideOf(s)}`, REAL_JOINT.wrist);
  }
  const finger = /^finger(\d)/.exec(s);
  if (finger) {
    const index = Number(finger[1]) as 0 | 1 | 2;
    const joint = index === 0 ? REAL_JOINT.finger0 : index === 1 ? REAL_JOINT.finger1 : REAL_JOINT.finger2;
    return jointPlacement(part, `finger_${sideOf(s)}_${index}`, joint);
  }
  // 兜底：按生成器给的 assembly 挂模块，避免丢件。
  return modulePlacement(part.assembly);
}

function decodeBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function typed<T extends Float32Array | Uint32Array>(
  bytes: Uint8Array,
  Ctor: new (buffer: ArrayBuffer) => T,
): T {
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  return new Ctor(copy.buffer);
}

const geometryCache = new Map<string, THREE.BufferGeometry>();

function skinGeometry(key: string, translate: Vec3): THREE.BufferGeometry {
  const cacheKey = `${key}|${translate.join(",")}`;
  const cached = geometryCache.get(cacheKey);
  if (cached) return cached;
  const part = SEGMENTS.get(key);
  if (!part) throw new Error(`kjSkinSegment：找不到真实网格分件 "${key}"`);
  const position = typed<Float32Array>(decodeBase64(part.position), Float32Array);
  const normal = typed<Float32Array>(decodeBase64(part.normal), Float32Array);
  const uv = typed<Float32Array>(decodeBase64(part.uv), Float32Array);
  const index = typed<Uint32Array>(decodeBase64(part.index), Uint32Array);
  const [tx, ty, tz] = translate;
  for (let i = 0; i < position.length; i += 3) {
    position[i] += tx;
    position[i + 1] += ty;
    position[i + 2] = -position[i + 2] + tz;
    normal[i + 2] = -normal[i + 2];
  }
  // 镜像 z 后翻转绕序，保持外表面朝向。
  for (let i = 0; i < index.length; i += 3) {
    const tmp = index[i + 1]!;
    index[i + 1] = index[i + 2]!;
    index[i + 2] = tmp;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(position, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(normal, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometryCache.set(cacheKey, geometry);
  return geometry;
}

const MATERIAL_KEY: Record<string, { key: string; cn: string }> = {
  kjr_silver: { key: "silver", cn: "亮银" },
  kjr_silver_dark: { key: "silver_dark", cn: "银灰" },
  kjr_dark: { key: "dark", cn: "暗钢" },
  kjr_black: { key: "black", cn: "黑" },
  kjr_gold: { key: "gold", cn: "金" },
};

interface SkinLabel {
  key: string;
  cn: string;
  en: string;
}

/** 把生成器的细分语义归并为验收要求的身體部位。 */
function groupLabel(part: GeneratedPart): SkinLabel {
  const s = part.semantic;
  const side = sideOf(s);
  const lr = side === "r" ? "右" : "左";
  if (s.startsWith("head")) return { key: "head", cn: "头", en: "head" };
  if (s.startsWith("torso") || s.startsWith("shoulder_pod") || s.startsWith("clavicle")) {
    return { key: "chest", cn: "胸·肩荚躯干", en: "chest & shoulder pods" };
  }
  if (s.startsWith("abdomen")) return { key: "abdomen", cn: "上腹", en: "upper abdomen" };
  if (s.startsWith("pelvis")) return { key: "pelvis", cn: "骨盆", en: "pelvis" };
  if (s.startsWith("hip_pod")) return { key: `hip_skirt_${side}`, cn: `${lr}髋裙`, en: `${side} hip skirt` };
  if (s.startsWith("thigh")) return { key: `thigh_${side}`, cn: `${lr}大腿`, en: `${side} thigh` };
  if (s.startsWith("calf")) return { key: `shin_${side}`, cn: `${lr}小腿`, en: `${side} shin` };
  if (s.startsWith("foot")) return { key: `foot_${side}`, cn: `${lr}足`, en: `${side} foot` };
  if (s.startsWith("upperarm")) return { key: `upperarm_${side}`, cn: `${lr}上臂`, en: `${side} upper arm` };
  if (s.startsWith("elbow_guard")) {
    return part.bone.includes("Forearm")
      ? { key: `forearm_${side}`, cn: `${lr}前臂`, en: `${side} forearm` }
      : { key: `upperarm_${side}`, cn: `${lr}上臂`, en: `${side} upper arm` };
  }
  if (s.startsWith("forearm")) return { key: `forearm_${side}`, cn: `${lr}前臂`, en: `${side} forearm` };
  if (s.startsWith("hand") || s.startsWith("wrist_guard")) {
    return { key: `hand_${side}`, cn: `${lr}手`, en: `${side} hand` };
  }
  const finger = /^finger(\d)/.exec(s);
  if (finger) {
    return {
      key: `finger_${side}_${finger[1]}`,
      cn: `${lr}指 ${Number(finger[1]) + 1}`,
      en: `${side} finger ${Number(finger[1]) + 1}`,
    };
  }
  return { key: s.replace(/[^a-z0-9_]/gi, "_"), cn: part.name_cn, en: part.name_en };
}

interface SkinGroup {
  label: SkinLabel;
  assembly: GeneratedPart["assembly"];
  node: string;
  translate: Vec3;
  material: string;
  keys: string[];
  faces: number;
  bones: Set<string>;
}

const GROUPS: SkinGroup[] = (() => {
  const map = new Map<string, SkinGroup>();
  for (const part of GENERATED.parts) {
    const placement = placementOf(part);
    const label = groupLabel(part);
    const groupKey = `${label.key}|${placement.node}|${placement.translate.join(",")}|${part.material}`;
    let group = map.get(groupKey);
    if (!group) {
      group = {
        label,
        assembly: placement.assembly,
        node: placement.node,
        translate: placement.translate,
        material: part.material,
        keys: [],
        faces: 0,
        bones: new Set(),
      };
      map.set(groupKey, group);
    }
    group.keys.push(part.key);
    group.faces += part.faces;
    group.bones.add(part.bone);
  }
  return [...map.values()];
})();

const groupGeometryCache = new Map<string, THREE.BufferGeometry>();

const skinGroupBuilder: GeometryBuilder = (spec) => {
  const params = (spec as unknown as { params?: { keys?: string[]; translate?: number[] } }).params;
  const keys = Array.isArray(params?.keys)
    ? params.keys.filter((key): key is string => typeof key === "string")
    : [];
  if (!keys.length) throw new Error("kjSkinGroup：缺少 params.keys");
  const raw = params?.translate;
  const translate: Vec3 = [
    typeof raw?.[0] === "number" ? raw[0] : 0,
    typeof raw?.[1] === "number" ? raw[1] : 0,
    typeof raw?.[2] === "number" ? raw[2] : 0,
  ];
  const cacheKey = `${keys.join("|")}@${translate.join(",")}`;
  const cached = groupGeometryCache.get(cacheKey);
  if (cached) return cached;
  const geometries = keys.map((key) => skinGeometry(key, translate));
  const merged = mergeGeometries(geometries);
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  groupGeometryCache.set(cacheKey, merged);
  return merged;
};

export const kjSkinBuilders: Record<string, GeometryBuilder> = { kjSkinGroup: skinGroupBuilder };

const materialCounts = (() => {
  const counts = new Map<string, Set<string>>();
  for (const group of GROUPS) {
    const set = counts.get(group.label.key) ?? new Set<string>();
    set.add(group.material);
    counts.set(group.label.key, set);
  }
  return counts;
})();

/** 把真实网格皮按身體部位合并后加入整机注册表。 */
export function addKingJoeSkin(builder: KingJoeParts): void {
  for (const group of GROUPS) {
    const material = MATERIAL_KEY[group.material] ?? { key: group.material, cn: "" };
    const multi = (materialCounts.get(group.label.key)?.size ?? 1) > 1;
    builder.add({
      id: pid(group.assembly, `skin_${group.label.key}_${material.key}`),
      name_cn: `皮·${group.label.cn}${multi && material.cn ? `·${material.cn}` : ""}`,
      name_en: `skin ${group.label.en}${multi ? ` (${material.key})` : ""}`,
      assembly: group.assembly,
      layer: 5,
      geometry: {
        type: "kit",
        kit: "kjSkinGroup",
        params: { keys: group.keys, translate: group.translate },
      },
      material: group.material,
      node: group.node,
      mate: { type: "absolute", position: [0, 0, 0] },
      tags: ["skin", "real-mesh"],
      source: `真实网格蒙皮合并 · ${group.keys.length} 片 / ${group.faces} 面 · 主导骨 ${[...group.bones].join("、")}`,
    });
  }
}
