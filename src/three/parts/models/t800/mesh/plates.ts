import * as THREE from "three";

// ============================================================================
// t800/mesh/plates —— 运行时把一块光滑网格切成护板
//
// 「机械版」模型里，一个 GLB 切出来的光滑整块要被换成机械器件组合。
// 外轮廓由**护板**保持（护板拼起来 = 原表面），内部留给骨架/轴承/螺栓/缸。
//
// 切法：以包围盒最长轴为轴向 → 面按「轴向段 × 周向扇区」归格 →
// 每格抽成一块薄板（沿横截面中心方向内缩一点厚度）。
// ============================================================================

/** 一块护板。 */
export interface Plate {
  geometry: THREE.BufferGeometry;
  /** 该板在部位局部坐标里的中心 */
  center: THREE.Vector3;
}

/** 把一个部位的网格切成护板。 */
export function splitBoneIntoPlates(geometry: THREE.BufferGeometry): Plate[] {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  const mn = [box.min.x, box.min.y, box.min.z];
  const mx = [box.max.x, box.max.y, box.max.z];
  const size = [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]];

  const position = geometry.attributes.position;
  const index = geometry.index;
  if (!index) return [];
  const idx = index.array;
  const idxAttr = index;

  // 长轴 = 骨段长度方向
  let axis = 0;
  if (size[1] > size[axis]) axis = 1;
  if (size[2] > size[axis]) axis = 2;
  const length = size[axis];
  const cross = Math.min(
    ...[0, 1, 2].filter((k) => k !== axis).map((k) => size[k]),
  );
  // 太小的件（销、镜片…）不切
  if (length < 0.03 || cross < 0.01) return [];

  const nT = Math.max(1, Math.min(14, Math.round(length / 0.05)));
  const nTheta = Math.max(4, Math.min(16, Math.round((size[(axis + 1) % 3] + size[(axis + 2) % 3]) / 0.04)));
  const thickness = Math.max(0.0015, Math.min(0.005, cross * 0.05));

  // 每个面归到一格（面心在轴向/周向的坐标）
  const cells = new Map<number, number[]>();
  for (let f = 0; f < idx.length; f += 3) {
    const p = (i: number, k: number) => position.getComponent(idxAttr.getX(i), k);
    const t = (p(idx[f], axis) + p(idx[f + 1], axis) + p(idx[f + 2], axis)) / 3;
    const a1 = (axis + 1) % 3;
    const a2 = (axis + 2) % 3;
    const u = (p(idx[f], a1) + p(idx[f + 1], a1) + p(idx[f + 2], a1)) / 3;
    const v = (p(idx[f], a2) + p(idx[f + 1], a2) + p(idx[f + 2], a2)) / 3;
    const theta = Math.atan2(v - (mn[a2] + mx[a2]) / 2, u - (mn[a1] + mx[a1]) / 2);
    const ti = Math.max(0, Math.min(nT - 1, Math.floor(((t - mn[axis]) / length) * nT)));
    const thi = Math.max(
      0,
      Math.min(nTheta - 1, Math.floor(((theta + Math.PI) / (2 * Math.PI)) * nTheta)),
    );
    const key = ti * nTheta + thi;
    const list = cells.get(key) ?? [];
    list.push(f);
    cells.set(key, list);
  }

  const plates: Plate[] = [];
  for (const faces of cells.values()) {
    if (faces.length < 2) continue;
    // 「局部覆盖」：每格里只保留**外侧**那部分面（内圈让开），
    // 于是护板只盖住骨头的外轮廓，内部机械器件从敞口露出来。
    // 这样外形仍与源网格吻合（外表面完整），但不是"整面糊死"。
    const cellR = faces.map((f) => faceRadius(f));
    const rMax = Math.max(...cellR);
    const keep = faces.filter((_, k) => cellR[k] >= rMax * 0.62);
    if (keep.length < 2) continue;

    const pos: number[] = [];
    const out: number[] = [];
    const map = new Map<number, number>();
    const push = (v: number): number => {
      let id = map.get(v);
      if (id !== undefined) return id;
      id = pos.length / 3;
      map.set(v, id);
      const px = position.getX(v);
      const py = position.getY(v);
      const pz = position.getZ(v);
      const p = [px, py, pz];
      // 朝横截面中心内缩 → 板有厚度（外表面仍是原网格）
      const comp = [0, 1, 2].map((k) => (k === axis ? 0 : p[k] - (mn[k] + mx[k]) / 2));
      const len = Math.hypot(comp[0], comp[1], comp[2]) || 1;
      const shrink = Math.min(thickness, len * 0.35);
      const s = shrink / len;
      pos.push(px - comp[0] * s, py - comp[1] * s, pz - comp[2] * s);
      return id;
    };
    for (const f of keep) {
      const a = push(idxAttr.getX(f));
      const b = push(idxAttr.getX(f + 1));
      const c = push(idxAttr.getX(f + 2));
      out.push(a, b, c);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(out);
    g.computeVertexNormals();
    g.computeBoundingBox();
    const center = (g.boundingBox ?? new THREE.Box3()).getCenter(new THREE.Vector3());
    // 几何以自身中心为原点（与零件装配位一致）
    g.translate(-center.x, -center.y, -center.z);
    plates.push({ geometry: g, center });
  }
  return plates;

  /** 面心到长轴线的距离（径向位置）。 */
  function faceRadius(f: number): number {
    const a1 = (axis + 1) % 3;
    const a2 = (axis + 2) % 3;
    const cx =
      (position.getX(idxAttr.getX(f)) +
        position.getX(idxAttr.getX(f + 1)) +
        position.getX(idxAttr.getX(f + 2))) /
      3;
    const cy =
      (position.getY(idxAttr.getX(f)) +
        position.getY(idxAttr.getX(f + 1)) +
        position.getY(idxAttr.getX(f + 2))) /
      3;
    const cz =
      (position.getZ(idxAttr.getX(f)) +
        position.getZ(idxAttr.getX(f + 1)) +
        position.getZ(idxAttr.getX(f + 2))) /
      3;
    void cz;
    const u = cx - (mn[a1] + mx[a1]) / 2;
    const v = cy - (mn[a2] + mx[a2]) / 2;
    return Math.hypot(u, v);
  }
}
