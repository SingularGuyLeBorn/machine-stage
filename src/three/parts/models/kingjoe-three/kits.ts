import * as THREE from "three";
import type { GeometryBuilder } from "../../assembler/geometry";
import { mergeGeometries } from "../../kernel/geometry";
import threeData from "./three.generated.json";

// ============================================================================
// models/kingjoe-three/kits —— 三体皮 + 腰缝楔榫
//
// 皮肤：按源装甲归属分「腿+髋 / 腹+胸 / 头+双手」，组内保留原材质 group。
// 榫卯：下半身腰顶 4 组楔榫插进躯干骨盆内壁 4 组榫槽；合体藏在腹甲腔，
//       分离时躯干沿 +Y 提起。头+双手另沿 +Z/+Y 离开肩颈/手腕。
// ============================================================================

interface BodyPart {
  materials: string[];
  groups: Array<{ start: number; count: number; material: string }>;
}

interface Data {
  meta: Record<"lower" | "torso" | "headhands", BodyPart>;
  parts: Record<"lower" | "torso" | "headhands", { position: string; normal: string; uv: string; index: string }>;
}

const DATA = threeData as unknown as Data;

function decodeBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const aligned = new Uint8Array(bytes.length);
  aligned.set(bytes);
  return aligned.buffer;
}

function bodyBuilder(part: "lower" | "torso" | "headhands"): GeometryBuilder {
  return () => {
    const data = DATA.parts[part];
    const meta = DATA.meta[part];
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(decodeBuffer(data.position)), 3));
    geometry.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(decodeBuffer(data.normal)), 3));
    geometry.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(decodeBuffer(data.uv)), 2));
    geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(decodeBuffer(data.index)), 1));
    meta.groups.forEach((group, index) => geometry.addGroup(group.start, group.count, index));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  };
}

/** 楔形榫：底 0.20 / 顶 0.14 / 高 0.24m，径向厚 0.06m；宽端在下。 */
const tenonBuilder: GeometryBuilder = () => {
  const shape = new THREE.Shape();
  shape.moveTo(-0.1, 0);
  shape.lineTo(0.1, 0);
  shape.lineTo(0.07, 0.24);
  shape.lineTo(-0.07, 0.24);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.06, bevelEnabled: false, steps: 1 });
  geometry.translate(0, 0, -0.03);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
};

/** 榫槽：槽口朝下的倒锥槽，底部开口无横梁；侧隙 5mm。 */
const socketBuilder: GeometryBuilder = () => {
  const rail = (sign: 1 | -1) => {
    const shape = new THREE.Shape();
    shape.moveTo(sign * 0.15, 0);
    shape.lineTo(sign * 0.105, 0);
    shape.lineTo(sign * 0.075, 0.26);
    shape.lineTo(sign * 0.12, 0.26);
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.08, bevelEnabled: false, steps: 1 });
    geometry.translate(0, 0, -0.04);
    return geometry;
  };
  const left = rail(-1);
  const right = rail(1);
  const bridge = new THREE.BoxGeometry(0.26, 0.04, 0.08);
  bridge.translate(0, 0.28, 0);
  const merged = mergeGeometries([left, right, bridge]);
  left.dispose();
  right.dispose();
  bridge.dispose();
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
};

export const kingjoeThreeBuilders: Record<string, GeometryBuilder> = {
  kjThreeLower: bodyBuilder("lower"),
  kjThreeTorso: bodyBuilder("torso"),
  kjThreeHeadHands: bodyBuilder("headhands"),
  kjWaistTenon: tenonBuilder,
  kjWaistSocket: socketBuilder,
};
