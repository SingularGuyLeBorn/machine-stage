import * as THREE from "three";
import type { GeometryBuilder } from "../../assembler/geometry";
import { mergeGeometries } from "../../kernel/geometry";
import lowerData from "./lower.generated.json";

// ============================================================================
// models/kingjoe-lower/kits —— 下半身皮肤 + 髋缝楔榫
//
// 皮肤：按源装甲自然归属分「腿体飞船 / 骨盆以上」，组内保留原材质 group。
// 榫卯：4 组楔榫（下半身髋环）插入 4 组榫槽（上半身骨盆）；合体时藏在髋腔，
//       分离时上半身沿 +Y 提起，榫头从槽底退出。骨盆中柱是中央定位榫。
// ============================================================================

interface BodyPart {
  materials: string[];
  groups: Array<{ start: number; count: number; material: string }>;
}

interface LowerData {
  meta: { lower: BodyPart; upper: BodyPart };
  parts: Record<"lower" | "upper", { position: string; normal: string; uv: string; index: string }>;
}

const DATA = lowerData as unknown as LowerData;

function decodeBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const aligned = new Uint8Array(bytes.length);
  aligned.set(bytes);
  return aligned.buffer;
}

function bodyBuilder(part: "lower" | "upper"): GeometryBuilder {
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

/** 楔形榫：底部 0.20m、顶部 0.14m，高 0.24m，径向厚 0.06m；宽端在下，沿 +Y 插入/退出。 */
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

/**
 * 榫槽：左右两条斜导轨 + 顶部横梁，槽口朝下。
 * 底部内宽 0.21m、顶部内宽 0.15m（对 0.20→0.14 的楔榫留 5mm 侧隙）；
 * 槽底开口无横梁 —— 上半身提起时榫头从槽底退出。
 */
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

export const kingjoeLowerBuilders: Record<string, GeometryBuilder> = {
  kjLowerBody: bodyBuilder("lower"),
  kjUpperBody: bodyBuilder("upper"),
  kjHipTenon: tenonBuilder,
  kjHipSocket: socketBuilder,
};
