"""Blender 后台运行：保留 GLB 原面，按参考图归组、闭合源壳体。

blender -b -P scripts/build-kingjoe-modules.py
输入由已有 GLB 解析器读取；不用体素重建，不改旧动画模型。
随后运行 python scripts/fuse-kingjoe-modules.py 融合连接结构并切分共用接口。
"""
import base64
import importlib.util
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

import bpy
import bmesh
import numpy as np
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('skin', ROOT / 'scripts/generate-kingjoe-skin.py')
skin = importlib.util.module_from_spec(spec)
spec.loader.exec_module(skin)
OUT = ROOT / 'qa-out/kingjoe-source-shells.json'


def components(bm):
    remaining = set(bm.verts)
    result = []
    while remaining:
        start = remaining.pop()
        found, queue = {start}, [start]
        while queue:
            for edge in queue.pop().link_edges:
                for v in edge.verts:
                    if v in remaining:
                        remaining.remove(v)
                        found.add(v)
                        queue.append(v)
        result.append(found)
    return result


def volume(faces):
    return sum(f.verts[0].co.dot(f.verts[i].co.cross(f.verts[i+1].co)) / 6
               for f in faces for i in range(1, len(f.verts)-1))


def close(bm):
    boundary = [e for e in bm.edges if e.is_boundary]
    if boundary:
        new = bmesh.ops.holes_fill(bm, edges=boundary, sides=0)['faces']
        for face in new:
            face.material_index = MATERIALS.index('kjr_cap')
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    assert all(e.is_manifold for e in bm.edges), '开放边或非流形边'
    for verts in components(bm):
        faces = {f for v in verts for f in v.link_faces}
        vol = volume(faces)
        assert abs(vol) > 1e-10, '零体积壳体'
        if vol < 0:
            bmesh.ops.reverse_faces(bm, faces=list(faces))
    bm.normal_update()


MATERIALS = ['kjr_silver', 'kjr_silver_dark', 'kjr_dark', 'kjr_black', 'kjr_cap']


def main():
    pos, nrm, uv, jt, wt, indices, names = skin.parse_glb(skin.DEFAULT_GLB)
    bm = bmesh.new()
    normal_layer = bm.loops.layers.float_vector.new('source_normal')
    uv_layer = bm.loops.layers.uv.new('source_uv')
    bone_layer = bm.faces.layers.int.new('bone')
    source_layer = bm.faces.layers.int.new('source_face')
    for p in pos:
        bm.verts.new(p)
    bm.verts.ensure_lookup_table()
    for fi, tri in enumerate(indices.reshape(-1, 3)):
        face = bm.faces.new([bm.verts[int(i)] for i in tri])
        weights = Counter()
        for vi in tri:
            for j, w in zip(jt[vi], wt[vi]):
                weights[int(j)] += float(w)
        face[bone_layer] = weights.most_common(1)[0][0]
        face[source_layer] = fi+1
        bbox = [*pos[tri].min(0), *pos[tri].max(0)]
        sem = skin.BONE_SEMANTIC.get(names[face[bone_layer]], 'head')
        face.material_index = MATERIALS.index(skin.material_for(sem, bbox))
        for loop, vi in zip(face.loops, tri):
            loop[normal_layer] = nrm[vi]
            loop[uv_layer].uv = uv[vi]
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=1e-5)
    bm.verts.index_update()
    bm.faces.index_update()
    source_components = sorted(components(bm), key=lambda vs: min(v.index for v in vs))
    modules = defaultdict(list)
    audit = []
    for ci, verts in enumerate(source_components):
        faces = {f for v in verts for f in v.link_faces}
        dominant = Counter(names[f[bone_layer]] for f in sorted(faces, key=lambda f: f.index)).most_common(1)[0][0]
        coords = np.array([v.co[:] for v in verts])
        center = (coords.min(0)+coords.max(0))/2
        if any(s in dominant for s in ['Arm', 'Forearm', 'Hand', 'Finger', 'Clavicle', 'Bone00']):
            group = 'head_arms'
        elif any(s in dominant for s in ['Thigh', 'Calf', 'Foot']):
            group = 'legs'
        elif 'Pelvis' in dominant:
            # 髋鼓前后两半都随腿走；以是否横跨中线区分中间腹盆，不用面中心阈值误分前后壳。
            lateral = coords[:, 0].min() > 0 or coords[:, 0].max() < 0
            group = 'legs' if lateral and coords[:, 1].max() < 3.7 else 'pelvis'
        elif abs(center[0]) > 0.8 and center[1] > 4.9:
            group = 'head_arms'
        else:
            group = 'torso'
        part = bm.copy()
        # 拷贝保留原顶点顺序；只删非当前连通壳，防止封口跨越独立零件。
        keep = {v.index for v in verts}
        bmesh.ops.delete(part, geom=[v for v in part.verts if v.index not in keep], context='VERTS')
        backup = part.copy()
        thickened = False
        try:
            close(part)
        except AssertionError:
            part.free()
            part = backup.copy()
            # [OM-FREEPLAY] 开放护甲带不能用一张跨内部边的大面封口；沿内侧增厚 4mm，保留外轮廓。
            original_faces = set(part.faces)
            bmesh.ops.solidify(part, geom=list(part.faces), thickness=-0.004)
            for face in part.faces:
                if face not in original_faces:
                    face.material_index = MATERIALS.index('kjr_silver_dark')
            thickened = True
            close(part)
        backup.free()
        original_volume = volume(part.faces)
        before = sum(1 for f in part.faces if f[part.faces.layers.int.get('source_face')])
        modules[group].append(part.copy())
        audit.append(dict(component=ci, bone=dominant, module=group, original_faces=before,
                          cut=False, thickened=thickened, volume=original_volume,
                          bbox=[*coords.min(0).tolist(), *coords.max(0).tolist()]))
        part.free()
    bm.free()
    output = []
    for key in ['legs', 'pelvis', 'torso', 'head_arms']:
        positions, normals, uvs, index = [], [], [], []
        buckets = defaultdict(list)
        total_volume = 0
        for part in modules[key]:
            total_volume += volume(part.faces)
            bmesh.ops.triangulate(part, faces=list(part.faces))
            assert all(e.is_manifold and e.is_contiguous for e in part.edges), '三角化后拓扑不闭合'
            assert all(f.calc_area() > 1e-12 for f in part.faces), '三角化产生退化面'
            nl = part.loops.layers.float_vector.get('source_normal')
            ul = part.loops.layers.uv.get('source_uv')
            for f in part.faces:
                base = len(positions)//3
                for loop in f.loops:
                    p = loop.vert.co
                    n = loop[nl].normalized() if f.material_index != 4 and loop[nl].length > 0 else f.normal
                    if n.dot(f.normal) < 0:
                        n = -n
                    # 原模型面朝 -Z；旋转 180° 到项目正面，与原皮卡保持一致。
                    positions.extend((-p.x, p.y, -p.z))
                    normals.extend((-n.x, n.y, -n.z))
                    uvs.extend(loop[ul].uv[:])
                buckets[f.material_index].extend((base, base+1, base+2))
            part.free()
        groups = []
        for mat, triangles in sorted(buckets.items()):
            groups.append(dict(material=MATERIALS[mat], start=len(index), count=len(triangles)))
            index.extend(triangles)
        enc = lambda a, t: base64.b64encode(np.asarray(a, dtype=t).tobytes()).decode()
        output.append(dict(key=key, position=enc(positions, '<f4'), normal=enc(normals, '<f4'),
                           uv=enc(uvs, '<f4'), index=enc(index, '<u4'), groups=groups,
                           volume=total_volume, components=len(modules[key])))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(dict(parts=output, audit=audit), indent=2)+'\n')
    print('MODULES', [(p['key'], p['components'], p['volume']) for p in output], flush=True)


main()

