"""将原装甲并成连通实体，再从同一躯干划分阶梯嵌合接口。

python scripts/fuse-kingjoe-modules.py
前置：Blender 运行 build-kingjoe-modules.py；Python 安装 manifold3d==3.5.4、numpy。
"""
import base64
import json
from pathlib import Path
import numpy as np
import manifold3d as m

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'qa-out/kingjoe-source-shells.json'
OUT = ROOT / 'src/three/parts/models/kingjoe-modules/modules.generated.json'
MATERIALS = ['kjr_silver', 'kjr_silver_dark', 'kjr_dark', 'kjr_black', 'kjr_cap']
# [OM-FREEPLAY] 原 GLB 没有分体接口尺寸；沿髋座上沿、胸甲下沿和头肩下沿设置共用平面。
# 颈部切面高于原上臂内侧接头的最高点 5.221m，保留完整手臂且不在接触面留下孔。
HIP, WAIST, NECK = 3.55, 3.95, 5.25
# [OM-FREEPLAY] 按参考图的中央山脊、两侧斜坡和前后退层确定轮廓；照片无尺寸，以下比例为拟合值。
# 每层依次为：底高、两侧肩高、中央峰高、半宽、峰顶半宽、后沿、前沿。正面为 +Z。
PELVIS_TOP = [
    (WAIST-0.01, 4.08, 4.28, 0.55, 0, -0.30, 0.50),
    (4.04, 4.22, 4.46, 0.39, 0.04, -0.18, 0.29),
    (4.20, 4.42, 4.52, 0.20, 0.12, -0.08, 0.14),
]
# 下方以向下为正的局部深度描述；也是中央深、两侧浅，前后宽度不对称。
PELVIS_BOTTOM = [
    (-0.01, 0.16, 0.34, 0.62, 0, -0.28, 0.54),
    (0.06, 0.30, 0.47, 0.38, 0.10, -0.12, 0.28),
]
NECK_REAR_BOTTOM, NECK_FRONT_TOP = 4.8, 5.48


def decode(s, dtype, width):
    return np.frombuffer(base64.b64decode(s), dtype=dtype).reshape(-1, width)


def union(bodies):
    result = m.Manifold.batch_boolean(bodies, m.OpType.Add)
    assert result.status() == m.Error.NoError, str(result.status())
    return result


def paint(body, material=0):
    return body.set_properties(6, lambda p, old: [0, 0, 0, 0, 0, material]).calculate_normals(0, 55)


def source_body(part):
    pos = decode(part['position'], '<f4', 3)
    norm = decode(part['normal'], '<f4', 3)
    uv = decode(part['uv'], '<f4', 2)
    idx = decode(part['index'], '<u4', 3)
    mat = np.zeros((len(pos), 1), dtype=np.float32)
    for g in part['groups']:
        mat[idx.reshape(-1)[g['start']:g['start']+g['count']]] = MATERIALS.index(g['material'])
    _, first, inv = np.unique(pos, axis=0, return_index=True, return_inverse=True)
    canonical = first[inv].astype(np.uint32)
    duplicate = np.where(canonical != np.arange(len(pos)))[0].astype(np.uint32)
    mesh = m.Mesh(np.ascontiguousarray(np.column_stack([pos, norm, uv, mat]), dtype=np.float32), idx.copy(),
                  merge_from_vert=duplicate, merge_to_vert=canonical[duplicate])
    body = m.Manifold(mesh)
    assert body.status() == m.Error.NoError, (part['key'], str(body.status()))
    return union(body.decompose())


def hull2(points):
    pts = sorted(set(map(tuple, points)))
    cross = lambda a,b,c: (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
    def chain(seq):
        result = []
        for p in seq:
            while len(result)>1 and cross(result[-2],result[-1],p) <= 0:
                result.pop()
            result.append(p)
        return result
    return chain(pts)[:-1]+chain(pts[::-1])[:-1]


def torso_core(body):
    vertical = body.rotate((90, 0, 0))
    # 内部填充按实际横截面包络放样，避免用大盒子盖住外皮或把整机体素化。
    levels = [2.8, 2.95, 3.1, 3.3, HIP, 3.7, WAIST, 4.15, 4.35, 4.55, 4.8, 5.0, NECK, 5.4, 5.65, 5.9, 6.15]
    sections = []
    for y in levels:
        polys = vertical.slice(y).to_polygons()
        if not polys:
            continue
        ring = hull2(np.concatenate(polys))
        sections.append(np.array([(x,y,-z) for x,z in ring]))
    return paint(union([m.Manifold.hull_points(np.concatenate([a,b])) for a,b in zip(sections,sections[1:])]))


def capsule(a, b, radius):
    return paint(union([m.Manifold.sphere(radius, 16).translate(a), m.Manifold.sphere(radius,16).translate(b)]).hull())


def interface_prism(low, high, rx, rz, z=0.08):
    """颈部前半的有界连接块。"""
    return paint(m.Manifold.cylinder(high-low, 1, 1, 8).scale((rx,rz,1))
                 .rotate((-90,0,0)).translate((0,low,z)),4)


def ridge_prism(base, shoulder, peak, half_width, ridge_half_width, back, front):
    """正面是中央隆起的山脊；沿前后方向退层，不使用绕轴生成的同心圆盘。"""
    profile = [(-half_width,base),(half_width,base),(half_width,shoulder)]
    profile += [(ridge_half_width,peak),(-ridge_half_width,peak)] if ridge_half_width else [(0,peak)]
    profile += [(-half_width,shoulder)]
    return paint(m.CrossSection([profile]).extrude(front-back).translate((0,0,back)),4)


def connect(body, name):
    """填补原资产接头缝，不接受剩余悬浮岛。大间隙必须回到结构设计处理。"""
    connections = []
    for iteration in range(100):
        pieces = sorted(body.decompose(), key=lambda p:p.volume(), reverse=True)
        if len(pieces) == 1:
            return body, connections
        main = pieces[0].to_mesh().vert_properties[:,:3].astype(np.float64)
        closest = None
        for i, piece in enumerate(pieces[1:], 1):
            other = piece.to_mesh().vert_properties[:,:3].astype(np.float64)
            for start in range(0,len(other),64):
                delta = other[start:start+64,None,:]-main[None,:,:]
                dist = np.einsum('ijk,ijk->ij',delta,delta)
                j,k = np.unravel_index(np.argmin(dist),dist.shape)
                item = (float(dist[j,k]), other[start+j], main[k], i)
                if closest is None or item[0] < closest[0]:
                    closest = item
        d, a, b, _ = closest
        gap = d**0.5
        assert gap < 0.32, f'{name} 结构缺失，间距 {gap:.3f}m，需要建连接座'
        # [OM-FREEPLAY] 无尺寸的细小接头沿最近间隙补实心连接，半径 3.5–10cm；不拉伸原装甲。
        radius = min(0.10, max(0.035, gap*0.55))
        body = union([body, capsule(a,b,radius)])
        connections.append(dict(gap=gap, a=a.tolist(), b=b.tolist(), radius=radius))
    raise RuntimeError(f'{name} 未能收敛为单实体')


def export(key, body, connections):
    # 以 0.01mm 容差清除布尔共面求交产生的微小边，再编码成浏览器 Float32。
    appearance = body.to_mesh().vert_properties
    props = {}
    for row in appearance:
        props.setdefault(tuple(np.round(row[:3],6)), []).append(row[3:])
    body = body.set_properties(0, lambda p, old: []).set_tolerance(1e-5).simplify(1e-5)
    assert len(body.decompose()) == 1, key
    mesh = body.to_mesh()
    vp, faces = mesh.vert_properties, mesh.tri_verts
    # 浏览器用 Float32；焊接 10 微米内的数值碎边，再验证流形，不能把零面积三角面带进渲染。
    _, first, inv = np.unique(np.floor(vp[:,:3].astype(float)*1e5+0.5),axis=0,return_index=True,return_inverse=True)
    vp = vp[first]
    faces = inv[faces].astype(np.uint32)
    faces = faces[(faces[:,0]!=faces[:,1]) & (faces[:,1]!=faces[:,2]) & (faces[:,0]!=faces[:,2])]
    checked = m.Manifold(m.Mesh(np.ascontiguousarray(vp),np.ascontiguousarray(faces)))
    assert checked.status() == m.Error.NoError, (key, str(checked.status()))
    assert len(checked.decompose()) == 1, key
    positions, normals, uvs, groups, indices = [],[],[],[],[]
    buckets = {}
    for tri in faces:
        p = vp[tri,:3].astype(float)
        face_normal = np.cross(p[1]-p[0],p[2]-p[0])
        assert np.linalg.norm(face_normal) > 1e-12, (key, p.tolist())
        face_normal /= np.linalg.norm(face_normal)
        levels = [HIP,WAIST,NECK,NECK_REAR_BOTTOM,NECK_FRONT_TOP]
        levels += [y for tier in PELVIS_TOP for y in tier[:3]]
        levels += [HIP-y for tier in PELVIS_BOTTOM for y in tier[:3]]
        cap = any(np.max(np.abs(p[:,1]-y)) < 2e-6 for y in levels)
        attrs = []
        for vi in tri:
            options = props.get(tuple(np.round(vp[vi,:3],6)))
            if options is None:
                nearest = np.argmin(np.linalg.norm(appearance[:,:3]-vp[vi,:3], axis=1))
                options = [appearance[nearest,3:]]
            attrs.append(max(options, key=lambda a:np.dot(a[:3],face_normal)))
        mat = 4 if cap else int(round(float(np.median([a[5] for a in attrs]))))
        base = len(positions)//3
        for vi, attr in zip(tri,attrs):
            row = vp[vi]
            n = attr[:3].astype(float)
            if mat == 4 or np.linalg.norm(n)<0.01:
                n = face_normal
            else:
                n /= np.linalg.norm(n)
            positions.extend(row[:3]); normals.extend(n); uvs.extend(attr[3:5])
        buckets.setdefault(mat,[]).extend([base,base+1,base+2])
    for mat, ids in sorted(buckets.items()):
        groups.append(dict(material=MATERIALS[mat],start=len(indices),count=len(ids)))
        indices.extend(ids)
    enc = lambda a,t:base64.b64encode(np.asarray(a,dtype=t).tobytes()).decode()
    return dict(key=key,position=enc(positions,'<f4'),normal=enc(normals,'<f4'),uv=enc(uvs,'<f4'),
                index=enc(indices,'<u4'),groups=groups,volume=body.volume(),components=1,connections=connections)


def main():
    source = json.loads(SOURCE.read_text())
    bodies = {p['key']:source_body(p) for p in source['parts']}
    print('source islands', {k:len(v.decompose()) for k,v in bodies.items()},flush=True)
    trunk = union([bodies['torso'],bodies['pelvis']])
    trunk = union([trunk,torso_core(trunk),bodies['legs']])
    trunk, trunk_connections = connect(trunk,'躯干')
    # 先按基准高度分开，再转移同一段实体形成凹凸互补结构；不分别近似雕刻两面。
    neck_front, _ = interface_prism(NECK-0.1,NECK_FRONT_TOP,0.62,0.46,0).split_by_plane((0,0,1),0)
    # 后半颈一直归到后背外表面，形成真正的前后错层分界，而非在平面内部挖一个盲孔。
    neck_rear = paint(m.Manifold.cube((20,NECK+0.1-NECK_REAR_BOTTOM,10))
                      .translate((-10,NECK_REAR_BOTTOM,-10)),4)
    # 模具在内部重叠后再求交，避免把独立计算的共面薄片拼在一起造成数值断层。
    upper_space = paint(m.Manifold.cube((20,10,20)).translate((-10,NECK,-10)),4)
    head, below_head = trunk.split(union([upper_space,neck_rear])-neck_front)
    leg_connections = []
    # 原上臂根部直接接入头肩后半，保留原 GLB 的倾斜肩颈，不另挂竖直肩座。
    arms = bodies['head_arms']
    head = union([head,arms])
    assert len(head.decompose()) == 1, '原上臂根部必须直接连入头肩实体'
    head_connections = []
    # 双臂完整保留；躯干为原上臂让出空间，不反向削掉手臂内侧。
    below_head = below_head - arms
    middle_space = paint(m.Manifold.cube((20,WAIST-HIP,20)).translate((-10,HIP,-10)),4)
    top_mold = [ridge_prism(*tier) for tier in PELVIS_TOP]
    bottom_mold = [ridge_prism(*tier).mirror((0,1,0)).translate((0,HIP,0)) for tier in PELVIS_BOTTOM]
    pelvis, remainder = below_head.split(union([middle_space,*top_mold,*bottom_mold]))
    chest, legs = remainder.split_by_plane((0,1,0),(HIP+WAIST)/2)
    result = [('legs',legs,leg_connections),('pelvis',pelvis,[]),('chest',chest,[]),('head_arms',head,head_connections)]
    # 拼回时无重叠体积，也不因凹槽加工丢掉体积。
    assembled = union([trunk,arms])
    partition = union([b for _,b,_ in result])
    assert abs(sum(b.volume() for _,b,_ in result)-partition.volume()) < 1e-7
    assert (assembled-partition).volume() < 1e-7
    assert (partition-assembled).volume() < 1e-7
    print('final',[(k,len(b.decompose()),b.volume()) for k,b,_ in result],flush=True)
    for key,body,_ in result:
        if len(body.decompose()) != 1:
            raise RuntimeError(f'{key} 存在分离壳: {[(p.volume(),p.bounding_box()) for p in body.decompose()]}')
    exported = [export(*r) for r in result]
    exported_bodies = [source_body(p) for p in exported]
    overlap = max((a ^ b).volume() for i,a in enumerate(exported_bodies) for b in exported_bodies[i+1:])
    exported_union = union(exported_bodies)
    missing = (assembled-exported_union).volume()
    extra = (exported_union-assembled).volume()
    # Float32 导出后再做一次实体验证，不能只检查高精度生成阶段。
    print('export audit',dict(overlap=overlap,missing=missing,extra=extra),flush=True)
    assert overlap < 1e-5 and missing < 1e-4 and extra < 1e-4, '导出网格未保持无重叠、无缺损的嵌合关系'
    output = dict(hip=HIP,waist=WAIST,neck=NECK,
                  interfaces=dict(pelvis_top=PELVIS_TOP,pelvis_bottom=PELVIS_BOTTOM,
                                  neck_rear_bottom=NECK_REAR_BOTTOM,neck_front_top=NECK_FRONT_TOP),
                  parts=exported,audit=source['audit'],trunk_connections=trunk_connections,
                  validation=dict(max_overlap=overlap,missing_volume=missing,extra_volume=extra))
    OUT.write_text(json.dumps(output,indent=2)+'\n')


if __name__ == '__main__':
    main()



