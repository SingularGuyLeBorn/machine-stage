"""平面分体验证。python -m pip install manifold3d==3.5.4 numpy

只读取已有闭合内核；不把未闭合外皮混入结果。生成时强制检查拓扑和体积。
运行：python scripts/build-kingjoe-plane-split.py [--height 3.45]
"""
import argparse
import base64
import json
from pathlib import Path
from collections import Counter

import manifold3d as manifold
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "src/three/parts/models/kingjoe-whole/core.generated.json"
OUT = ROOT / "src/three/parts/models/kingjoe-plane/split.generated.json"


def decode(value, dtype):
    return np.frombuffer(base64.b64decode(value), dtype=dtype).reshape(-1, 3)


def encode(value, dtype):
    return base64.b64encode(np.asarray(value, dtype=dtype).tobytes()).decode()


def inspect(vertices, faces):
    edges = Counter()
    direction = Counter()
    for face in faces:
        for a, b in zip(face, np.roll(face, -1)):
            a, b = int(a), int(b)
            edges[min(a, b), max(a, b)] += 1
            direction[min(a, b), max(a, b)] += 1 if a < b else -1
    assert all(n == 2 for n in edges.values()), "有开边或非流形边"
    assert all(n == 0 for n in direction.values()), "面绕序不一致"
    tri = vertices[faces].astype(np.float64)
    assert np.all(np.linalg.norm(np.cross(tri[:, 1]-tri[:, 0], tri[:, 2]-tri[:, 0]), axis=1) > 1e-12)
    volume = np.einsum('ij,ij->i', tri[:, 0], np.cross(tri[:, 1], tri[:, 2])).sum() / 6
    assert volume > 0
    return float(volume)


def main():
    parser = argparse.ArgumentParser()
    # [OM-FREEPLAY] 第一刀沿用已有腹部模块的 3.45m 高度，仅作横切验证，不是最终飞船分界。
    parser.add_argument('--height', type=float, default=3.45)
    height = parser.parse_args().height
    data = json.loads(SOURCE.read_text())
    vertices = decode(data['position'], '<f4')
    faces = decode(data['index'], '<u4')
    vertices, inverse = np.unique(vertices, axis=0, return_inverse=True)
    faces = inverse[faces].astype(np.uint32)
    original_volume = inspect(vertices, faces)
    solid = manifold.Manifold(manifold.Mesh(vertices, faces))
    assert solid.status() == manifold.Error.NoError, str(solid.status())
    upper, lower = solid.split_by_plane((0, 1, 0), height)
    parts = []
    for key, body in [('lower', lower), ('upper', upper)]:
        assert not body.is_empty(), '切面必须在模型内部'
        mesh = body.to_mesh()
        p, idx = mesh.vert_properties[:, :3], mesh.tri_verts
        volume = inspect(p, idx)
        cap = np.all(np.abs(p[idx, 1] - height) < 1e-6, axis=1)
        assert cap.any(), '没有生成截面'
        cap_tri = p[idx[cap]].astype(np.float64)
        cross = np.cross(cap_tri[:, 1]-cap_tri[:, 0], cap_tri[:, 2]-cap_tri[:, 0])
        assert np.all(cross[:, 1] * (1 if key == 'lower' else -1) > 0)
        ordered = np.concatenate([idx[~cap], idx[cap]])
        parts.append(dict(key=key, position=encode(p, '<f4'), index=encode(ordered, '<u4'),
                          surface_indices=int((~cap).sum()*3), cap_indices=int(cap.sum()*3),
                          volume=volume, cap_area=float(np.linalg.norm(cross, axis=1).sum()/2),
                          components=len(body.decompose()), boundary_edges=0, nonmanifold_edges=0))
    assert abs(sum(p['volume'] for p in parts) - original_volume) < 1e-5
    assert abs(parts[0]['cap_area'] - parts[1]['cap_area']) < 1e-5
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(dict(height=height, source_volume=original_volume, parts=parts), indent=2) + '\n')
    print(json.dumps(dict(height=height, source_volume=original_volume,
                         parts=[{k:v for k,v in p.items() if k not in ('position','index')} for p in parts]), indent=2))


if __name__ == '__main__':
    main()
