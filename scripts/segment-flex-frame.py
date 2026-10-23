"""把闭合贴壁骨架切成硬段与褶皱柔性段；保留输入，输出独立派生网格。
依赖 numpy、manifold3d。输入为带 structure 数组的 JSON；每项含 key/owner/kind、
base64 little-endian Float32 position 和 Uint32 index。仅修改明确指定的骨架集合。
"""
import argparse, base64, hashlib, json
from pathlib import Path
import numpy as np
import manifold3d as m


def unpack(piece):
    pos = np.frombuffer(base64.b64decode(piece['position']), '<f4').reshape(-1, 3)
    tri = np.frombuffer(base64.b64decode(piece['index']), '<u4').reshape(-1, 3)
    unique, inverse = np.unique(pos, axis=0, return_inverse=True)
    body = m.Manifold(m.Mesh(np.ascontiguousarray(unique), np.ascontiguousarray(inverse[tri], dtype=np.uint32)))
    if body.status() != m.Error.NoError:
        raise ValueError(f"{piece['key']}: 输入不是闭合实体")
    return body


def pack(body):
    mesh = body.simplify(1e-5).to_mesh()
    pos = np.asarray(mesh.vert_properties[:, :3], dtype='<f4')
    tri = np.asarray(mesh.tri_verts, dtype='<u4')
    # 布尔端面可能产生比 Float32 精度更短的边；仅收缩退化面的最短边。
    # 禁止全局按宽容差焊接，那会把相邻但独立的褶皱粘在一起。
    for _ in range(100):
        points = pos[tri].astype(float)
        zero = np.where(np.linalg.norm(np.cross(points[:, 1]-points[:, 0], points[:, 2]-points[:, 0]), axis=1) == 0)[0]
        if not len(zero):
            break
        for face in tri[zero].copy():
            a, b = min(((face[0], face[1]), (face[1], face[2]), (face[2], face[0])), key=lambda pair: np.linalg.norm(pos[pair[0]]-pos[pair[1]]))
            if np.linalg.norm(pos[a]-pos[b]) > 1e-5:
                raise ValueError('退化面不是短边造成，保留原骨架')
            tri[tri == b] = a
        tri = tri[(tri[:, 0] != tri[:, 1]) & (tri[:, 1] != tri[:, 2]) & (tri[:, 2] != tri[:, 0])]
    points = pos[tri].astype(float)
    normal = np.cross(points[:, 1] - points[:, 0], points[:, 2] - points[:, 0])
    if np.any(np.linalg.norm(normal, axis=1) == 0):
        raise ValueError('Float32 导出出现退化面')
    _, inverse = np.unique(pos, axis=0, return_inverse=True)
    top = inverse[tri]
    edges = np.concatenate([top[:, [0, 1]], top[:, [1, 2]], top[:, [2, 0]]])
    _, counts = np.unique(np.sort(edges, axis=1), axis=0, return_counts=True)
    if np.any(counts != 2) or body.volume() <= 0:
        raise ValueError('导出网格开边或非正体积')
    enc = lambda a: base64.b64encode(a.tobytes()).decode()
    return dict(position=enc(pos), index=enc(tri))


def split_frame(body, kind, min_span=.36, gap_ratio=.12, folds=5, max_gap=.085):
    bounds = np.array(body.bounding_box()).reshape(2, 3)
    size = bounds[1] - bounds[0]
    axis = int(np.argmax(size))
    if size[axis] < min_span:
        return None
    thin = int(np.argmin(size))
    if thin == axis:
        return None
    # 自由设计取值：保留多数硬段，连接区不超过整体长度的四分之一。
    width = min(max_gap, size[axis] * gap_ratio)
    bands = []
    zones = []
    collars = []
    def slab(at, length):
        dims = size + .02
        dims[axis] = length
        center = bounds.mean(axis=0)
        center[axis] = at
        return m.Manifold.cube(tuple(dims), True).translate(tuple(center))
    for fraction in (1/3, 2/3):
        at = bounds[0, axis] + size[axis] * fraction
        band = body ^ slab(at, width)
        if band.is_empty() or band.volume() < 1e-8:
            continue
        bands.append(band)
        zones.append(dict(center=float(at), width=float(width)))
        # 只沿原件最薄方向收腰，避免把前后两根肋一起向包围盒中心缩走。
        center = bounds.mean(axis=0)
        scale = np.ones(3); scale[thin] = .58
        core = band.translate(tuple(-center)).scale(tuple(scale)).translate(tuple(center))
        rings = [band ^ slab(at + (j/(folds-1)-.5)*width, width/(folds*2.4)) for j in range(folds)]
        collars.append(m.Manifold.batch_boolean([core, *rings], m.OpType.Add))
    if not bands:
        return None
    cut = m.Manifold.batch_boolean(bands, m.OpType.Add)
    rigid = body - cut
    soft = m.Manifold.batch_boolean(collars, m.OpType.Add)
    if rigid.is_empty() or soft.is_empty():
        return None
    # 硬段与连接区必须真实分开；切下的总体积必须守恒。
    if abs(body.volume()-rigid.volume()-cut.volume()) > 1e-6 or (rigid ^ soft).volume() > 1e-8:
        raise ValueError('分段体积关系不成立')
    return dict(rigid=pack(rigid), soft=pack(soft), axis=axis, thin=thin, zones=zones, folds=folds,
                originalVolume=body.volume(), rigidVolume=rigid.volume(), softVolume=soft.volume())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('input', nargs='?', type=Path)
    parser.add_argument('--out', type=Path)
    parser.add_argument('--min-span', type=float, default=.36)
    parser.add_argument('--gap-ratio', type=float, default=.12)
    parser.add_argument('--max-gap', type=float, default=.085)
    parser.add_argument('--folds', type=int, default=5)
    parser.add_argument('--self-test', action='store_true')
    args = parser.parse_args()
    if args.self_test:
        result = split_frame(m.Manifold.cube((1,.028,.08), True), 'rib')
        assert result and 0 < result['softVolume'] < result['originalVolume']*.25
        assert split_frame(m.Manifold.cube((.1,.02,.03)), 'rib') is None
        print('柔性分段自检通过'); return
    if not args.input or not args.out or args.input.resolve() == args.out.resolve():
        parser.error('需要不同的输入和输出路径')
    if not np.isfinite(args.min_span) or args.min_span <= 0:
        parser.error('min-span 必须是正有限数')
    if not np.isfinite(args.gap_ratio) or not 0 < args.gap_ratio <= .2:
        parser.error('gap-ratio 必须在 (0, 0.2] 内，给硬段保留跨度')
    if not np.isfinite(args.max_gap) or args.max_gap <= 0 or not 3 <= args.folds <= 12:
        parser.error('max-gap 必须为正有限数，folds 必须在 3～12 内')
    source = json.loads(args.input.read_text(encoding='utf-8'))
    result, retained = [], []
    for piece in source['structure']:
        if piece['kind'] not in ('rib', 'rail'):
            retained.append(dict(key=piece['key'], reason='不属于横肋或纵梁')); continue
        try:
            divided = split_frame(unpack(piece), piece['kind'], args.min_span, args.gap_ratio, args.folds, args.max_gap)
        except ValueError as error:
            # 失败时保留原件，不删除坏片掩盖原件缺失；报告交由调用者复查。
            retained.append(dict(key=piece['key'], reason=str(error))); continue
        if divided:
            result.append(dict(key=piece['key'], owner=piece['owner'], **divided))
        else:
            retained.append(dict(key=piece['key'], reason='跨度不足或切面没有有效材料'))
    output = dict(sourceSha256=hashlib.sha256(args.input.read_bytes()).hexdigest(),
                  settings=dict(minSpan=args.min_span, gapRatio=args.gap_ratio, maxGap=args.max_gap, folds=args.folds),
                  pieces=result, retained=retained)
    args.out.write_text(json.dumps(output, separators=(',', ':'))+'\n', encoding='utf-8')
    print(json.dumps(dict(segmented=len(result), retained=len(retained), owners=sorted(set(p['owner'] for p in result)))))

if __name__ == '__main__':
    main()
