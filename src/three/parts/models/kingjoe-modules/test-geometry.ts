// 测试用外轮廓提取：有向体积为负的闭合边界是内腔，不参与外形包络判断。
import * as THREE from "three";

export function exteriorGeometry(source: THREE.BufferGeometry): THREE.BufferGeometry {
  const p = source.getAttribute("position"),
    index = source.index!;
  const keys = Array.from({ length: p.count }, (_, i) =>
    [p.getX(i), p.getY(i), p.getZ(i)].map((v) => Math.round(v * 1e5)).join(","),
  );
  const parent = Array.from({ length: index.count / 3 }, (_, i) => i);
  const root = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const seen = new Map<string, number>();
  for (let f = 0; f < parent.length; f++)
    for (let c = 0; c < 3; c++) {
      const key = keys[index.getX(f * 3 + c)],
        previous = seen.get(key);
      if (previous !== undefined) parent[root(f)] = root(previous);
      else seen.set(key, f);
    }
  const volume = new Map<number, number>();
  const a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    c = new THREE.Vector3();
  for (let f = 0; f < parent.length; f++) {
    a.fromBufferAttribute(p, index.getX(f * 3));
    b.fromBufferAttribute(p, index.getX(f * 3 + 1));
    c.fromBufferAttribute(p, index.getX(f * 3 + 2));
    const r = root(f);
    volume.set(r, (volume.get(r) ?? 0) + a.dot(b.cross(c)) / 6);
  }
  const kept: number[] = [];
  for (let f = 0; f < parent.length; f++)
    if ((volume.get(root(f)) ?? 0) > 0)
      kept.push(index.getX(f * 3), index.getX(f * 3 + 1), index.getX(f * 3 + 2));
  const result = source.clone();
  result.setIndex(kept);
  result.clearGroups();
  return result;
}
