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
# [OM-FREEPLAY] 参考图无尺寸：沿原壳截面放样，前后退层比侧向收缩更明显。
# 每圈为：左右比例、前侧比例、后侧比例、侧边高度、中央脊高；圈间共享顶点连接成一张壳面。
PELVIS_TOP = [
    (1.04, 1.04, 1.04, 3.93, 3.93),
    (0.99, 1.00, 1.00, 4.04, 4.26),
    (0.94, 0.78, 0.80, 4.04, 4.26),
    (0.86, 0.68, 0.64, 4.26, 4.40),
    (0.80, 0.40, 0.42, 4.26, 4.40),
    # 宽肩面先向内缓收，再接短小顶座；末圈等高，封顶为一整块平面。
    (0.48, 0.30, 0.29, 4.40, 4.45),
    (0.30, 0.23, 0.20, 4.47, 4.47),
    (0.26, 0.20, 0.17, 4.52, 4.52),
]
# 下方按向下的局部深度放样，保持中央深、两侧浅的对应凹凸。
PELVIS_BOTTOM = [
    (1.04, 1.04, 1.04, -0.01, -0.01),
    (0.99, 1.00, 1.00, 0.12, 0.28),
    (0.90, 0.78, 0.82, 0.12, 0.28),
    (0.74, 0.59, 0.56, 0.30, 0.47),
    (0.28, 0.25, 0.22, 0.44, 0.47),
]


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


def chest_envelope():
    """前脸是宽肩双肺，浅中缝；U 形凹槽留在上表面后侧，不能贯穿前脸。"""
    # [OM-FREEPLAY] 按照片比例放样：前缘仅浅凹，后部颈槽圆滑过渡，前后不再等截面挤出。
    count = 49
    xs, zs = np.linspace(-2,2,count), np.linspace(-2,2,count)
    points = []
    for z in zs:
        front = np.clip((z+.12)/.65,0,1)
        front = front*front*(3-2*front)
        for x in xs:
            edge = .25*min(abs(x)/.95,1)**6
            dip = (.27*(1-front)+.035*front)*np.exp(-(x/(.32-.16*front))**2)
            points.append([x,5.30-dip-edge,z])
    faces = []
    for j in range(count-1):
        for i in range(count-1):
            a=j*count+i; b=a+1; c=a+count; d=c+1
            faces.extend([(a,c,b),(b,c,d)])
    ring = list(range(count))+[j*count+count-1 for j in range(1,count)]+list(range(count*count-2,count*(count-1)-1,-1))+[j*count for j in range(count-2,0,-1)]
    floor = len(points); points.append([0,-10,0])
    for i,a in enumerate(ring):
        b=ring[(i+1)%len(ring)]
        ia=len(points);points.extend([[*points[a]],[*points[b]]]);points[ia][1]=points[ia+1][1]=-10
        faces.extend([(a,b,ia),(b,ia+1,ia),(floor,ia,ia+1)])
    # 焊接底圈顶点，保持顶面、侧壁、底面严格闭合。
    v=np.asarray(points,dtype=np.float32); _,first,inv=np.unique(v,axis=0,return_index=True,return_inverse=True)
    shell=paint(m.Manifold(m.Mesh(v[first],np.asarray(inv[np.asarray(faces)],dtype=np.uint32))))
    assert shell.status()==m.Error.NoError and shell.volume()>0
    tenons = [paint(m.Manifold.cylinder(.56,.085,.075,32).rotate((-90,0,0)).translate((x,5.0,.02))) for x in [-.31,.31]]
    return union([shell,*tenons])


def shoulder_armour():
    """沿原倾斜肩根加圆润护甲，直接并入头臂实体。"""
    return union([paint(m.Manifold.sphere(1,48).scale((.29,.31,.35))
                       .rotate((0,0,side*24)).translate((side*.84,5.05,-.04))) for side in [-1,1]])


def lung_front():
    """照片中的连体双肺前甲：宽平上缘、圆侧肩、中央下缘上提，四周滚圆。"""
    xs=np.linspace(-1.02,1.02,97)
    upper=[(x,5.29-.25*(abs(x)/1.02)**4) for x in xs]
    lower=[(x,3.94+.35*np.exp(-(x/.32)**2)+.12*(abs(x)/1.02)**6) for x in xs]
    outline=m.CrossSection([lower+list(reversed(upper))])
    outline=outline.offset(-.18,m.JoinType.Round).offset(.18,m.JoinType.Round)
    vertices=[]; rings=128
    center=np.array([0,4.64])
    for z in np.linspace(.32,.81,17):
        inset=.075*(1-np.sqrt(max(0,1-((z-.565)/.245)**2)))
        poly=np.asarray(outline.offset(-inset,m.JoinType.Round).to_polygons()[0])-center
        for angle in np.linspace(0,2*np.pi,rings,endpoint=False):
            direction=np.array([np.cos(angle),np.sin(angle)])
            hits=[]
            for a,b in zip(poly,np.roll(poly,-1,axis=0)):
                matrix=np.column_stack([direction,a-b])
                if abs(np.linalg.det(matrix))<1e-10:continue
                distance,t=np.linalg.solve(matrix,a)
                if distance>0 and -1e-7<=t<=1+1e-7:hits.append(distance)
            x,y=center+direction*min(hits);vertices.append([x,y,z])
    faces=[]
    for layer in range(16):
        for i in range(rings):
            a=layer*rings+i;b=layer*rings+(i+1)%rings
            faces.extend([(a,b,a+rings),(b,b+rings,a+rings)])
    back=len(vertices);vertices.append([*center,.32])
    for i in range(rings):
        j=(i+1)%rings
        faces.append((back,j,i))
    previous=16*rings
    edge=np.asarray(vertices[previous:previous+rings])
    for factor in [.8,.6,.4,.2]:
        start=len(vertices)
        vertices.extend([[*(center+(v[:2]-center)*factor),.81] for v in edge])
        for i in range(rings):
            j=(i+1)%rings
            faces.extend([(previous+i,previous+j,start+i),(previous+j,start+j,start+i)])
        previous=start
    front=len(vertices);vertices.append([*center,.81])
    for i in range(rings):faces.append((front,previous+i,previous+(i+1)%rings))
    # 前脸的两个叶面随横向弧度鼓起，中央形成脊线，不能是一块倒角平板。
    for p in vertices:
        p[2]+=.10*(1-(abs(p[0])/1.02)**2)*max(0,(p[2]-.32)/.49)
    body=m.Manifold(m.Mesh(np.asarray(vertices,dtype=np.float32),np.asarray(faces,dtype=np.uint32)))
    assert body.status()==m.Error.NoError and body.volume()>0
    return paint(body).calculate_normals(0,65)


def shell_contour(body, height):
    """由原外壳截面取得闭合轮廓，去掉布尔求交的微小共线碎边。"""
    polygons = body.rotate((90,0,0)).slice(height).to_polygons()
    points = np.concatenate(polygons) * [1,-1]
    outline = np.asarray(hull2(np.round(points,5)))
    # 按射线重采样保持左右脊线固定，退台沿整圈外壳走，不把正面山形挤出成板。
    ring = []
    for angle in np.linspace(0,2*np.pi,64,endpoint=False):
        direction = np.array([np.cos(angle),np.sin(angle)])
        distances = []
        for a,b in zip(outline,np.roll(outline,-1,axis=0)):
            matrix = np.column_stack([direction,a-b])
            if abs(np.linalg.det(matrix)) < 1e-10:
                continue
            distance,t = np.linalg.solve(matrix,a)
            if distance > 0 and -1e-8 <= t <= 1+1e-8:
                distances.append(distance)
        ring.append(direction * min(distances))
    return np.asarray(ring)


def shell_interface(contour, levels):
    """整圈侧壁、退台、中央脊面共享顶点放样；不再叠加独立棱柱。"""
    width = max(abs(contour[:,0]))
    vertices = []
    for sx,front,back,side,peak in levels:
        for x,z in contour:
            ridge = 1-abs(x)/width
            vertices.append([x*sx,side+(peak-side)*ridge,z*(front if z>=0 else back)])
    count = len(contour)
    faces = []
    for layer in range(len(levels)-1):
        for i in range(count):
            a,b = layer*count+i,layer*count+(i+1)%count
            faces.extend([(a,a+count,b),(b,a+count,b+count)])
    bottom,top = len(vertices),len(vertices)+1
    vertices.extend([[0,levels[0][4],0],[0,levels[-1][4],0]])
    for i in range(count):
        j=(i+1)%count
        faces.extend([(bottom,i,j),(top,(len(levels)-1)*count+j,(len(levels)-1)*count+i)])
    mesh = m.Mesh(np.asarray(vertices,dtype=np.float32),np.asarray(faces,dtype=np.uint32))
    body = m.Manifold(mesh)
    assert body.status()==m.Error.NoError and body.volume()>0
    # 接口是腹盆壳面的延续，采用原银灰材质；法线保留台阶折边、平滑同一圈侧壁。
    return paint(body).calculate_normals(0,35)


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
    # 曲面榫槽交角浅，精简时保留接口精度，随后仍按浏览器精度检查闭合性。
    appearance = body.to_mesh().vert_properties
    props = {}
    for row in appearance:
        props.setdefault(tuple(np.round(row[:3],6)), []).append(row[3:])
    tolerance = 1e-8 if key == 'head_arms' else 1e-6
    body = body.set_properties(0, lambda p, old: []).set_tolerance(tolerance).simplify(tolerance)
    body = union([p for p in body.decompose() if p.volume()>1e-10])
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
    if len(checked.decompose())>1:
        fragments=checked.decompose()
        tiny=[p for p in fragments if abs(p.volume())<1e-10]
        assert len(fragments)-len(tiny)==1, (key,[(p.volume(),p.bounding_box()) for p in fragments])
        checked=union([p for p in fragments if abs(p.volume())>=1e-10])
        clean=checked.to_mesh();vp,faces=clean.vert_properties,clean.tri_verts
    assert len(checked.decompose()) == 1, key
    positions, normals, uvs, groups, indices = [],[],[],[],[]
    buckets = {}
    for tri in faces:
        p = vp[tri,:3].astype(float)
        face_normal = np.cross(p[1]-p[0],p[2]-p[0])
        assert np.linalg.norm(face_normal) > 1e-12, (key, p.tolist())
        face_normal /= np.linalg.norm(face_normal)
        levels = [HIP,WAIST]
        # 腹盆接口的弧形壳面保留其原材质与法线，不按水平坐标重涂为深色平板。
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
    interface_trunk=trunk
    middle_space = paint(m.Manifold.cube((20,WAIST-HIP,20)).translate((-10,HIP,-10)),4)
    top_mold = shell_interface(shell_contour(interface_trunk,WAIST),PELVIS_TOP)
    bottom_mold = shell_interface(shell_contour(interface_trunk,HIP),PELVIS_BOTTOM).mirror((0,1,0)).translate((0,HIP,0))
    leg_mask = union([union([p.translate((0,.002,0)),p.translate((0,-4,0))]).hull()
                      for p in bodies['legs'].decompose()])
    pelvis_mask=union([middle_space,top_mold,bottom_mold])-leg_mask
    pelvis,remainder=interface_trunk.split(pelvis_mask)
    trunk,legs=remainder.split_by_plane((0,1,0),(HIP+WAIST)/2)
    # 只重塑胸甲正面；原头部、四肢及背部的 GLB 表面仍然保留。
    front_plate=lung_front()
    front_region=paint(m.Manifold.cube((2.8,1.37,2)).translate((-1.4,3.925,.34)))
    front_owner=paint(m.Manifold.cube((2.8,1.36,2)).translate((-1.4,3.932,.30)))
    collar=front_plate.translate((0,.16,-.02)) ^ paint(m.Manifold.cube((4,.35,3)).translate((-2,5.12,-1)))
    trunk=union([trunk-front_region,front_plate-pelvis_mask,collar])
    # 先按基准高度分开，再转移同一段实体形成凹凸互补结构；不分别近似雕刻两面。
    leg_connections = []
    # 原上臂根部直接接入头肩后半，保留原 GLB 的倾斜肩颈，不另挂竖直肩座。
    arms = union([bodies['head_arms'],shoulder_armour()])
    # 圆肩护甲本身作配对模具，取消向上拉伸的方形避让槽。
    # 肩根内侧用圆滑的扫掠面配对，避免原低模手臂的棱角在胸甲留下方槽及倒扣。
    round_seats=[]
    for side in [-1,1]:
        seat=m.Manifold.sphere(1,32).scale((.41,.50,.57)).translate((side*.82,5.09,-.01))
        round_seats.append(paint(union([seat,seat.translate((0,1.5,0))]).hull()))
    seats=union(round_seats)
    rounded_sweeps=[]
    shoulder_zone=m.Manifold.cube((20,10,20)).translate((-10,4.0,-10))
    for piece in bodies['head_arms'].decompose():
        sweep=union([piece,piece.translate((0,2,-1))]).hull() ^ shoulder_zone
        if not sweep.is_empty():rounded_sweeps.append(paint(sweep.hull().minkowski_sum(m.Manifold.sphere(.035,16))))
    # 榫与槽共用后倾模具，沿上后方退出；圆肩避让面同向扫掠，允许从起步就斜向飞出。
    neck_mask=union([chest_envelope()-seats,front_owner]).transform([[1,0,0,0],[0,1,0,0],[0,-.5,1,2.6]])
    below_head,head=trunk.split(neck_mask-arms-union(rounded_sweeps))
    head = union([head,arms])
    head = union([piece for piece in head.decompose() if piece.volume()>1e-10])
    assert len(head.decompose()) == 1, [(p.volume(),p.bounding_box()) for p in head.decompose()]
    head_connections = []
    # 双臂完整保留；躯干为原上臂让出空间，不反向削掉手臂内侧。
    below_head = below_head - arms
    # 腿部向下的扫掠保护原髋鼓完整轮廓，并为腹盆留下可竖直脱开的凹槽。
    chest=below_head
    chest = union([p for p in chest.decompose() if abs(p.volume())>1e-10])
    pelvis = union([p for p in pelvis.decompose() if p.volume()>1e-10])
    legs = union([p for p in legs.decompose() if p.volume()>1e-10])
    result = [('legs',legs,leg_connections),('pelvis',pelvis,[]),('chest',chest,[]),('head_arms',head,head_connections)]
    # 拼回时无重叠体积，也不因凹槽加工丢掉体积。
    assembled = union([trunk,arms,legs,pelvis])
    partition = union([b for _,b,_ in result])
    # 前甲曲面采用 Float32 放样，容差与下方最终网格审核一致。
    assert abs(sum(b.volume() for _,b,_ in result)-partition.volume()) < 1e-5
    assert abs((assembled-partition).volume()) < 1e-4
    assert abs((partition-assembled).volume()) < 1e-4
    print('final',[(k,len(b.decompose()),b.volume()) for k,b,_ in result],flush=True)
    for key,body,_ in result:
        if len(body.decompose()) != 1:
            raise RuntimeError(f'{key} 存在分离壳: {[(p.volume(),p.bounding_box()) for p in body.decompose()]}')
    exported = [export(*r) for r in result]
    exported_bodies = [source_body(p) for p in exported]
    print('per body export',[(key,(body-out).volume(),(out-body).volume()) for (key,body,_),out in zip(result,exported_bodies)],flush=True)
    overlap = max((a ^ b).volume() for i,a in enumerate(exported_bodies) for b in exported_bodies[i+1:])
    exported_union = union(exported_bodies)
    missing = (assembled-exported_union).volume()
    extra = (exported_union-assembled).volume()
    # Float32 导出后再做一次实体验证，不能只检查高精度生成阶段。
    print('export audit',dict(overlap=overlap,missing=missing,extra=extra),flush=True)
    assert overlap < 1e-5 and missing < 1e-4 and extra < 1e-4, '导出网格未保持无重叠、无缺损的嵌合关系'
    output = dict(hip=HIP,waist=WAIST,neck=NECK,
                  interfaces=dict(pelvis_top=PELVIS_TOP,pelvis_bottom=PELVIS_BOTTOM,
                                  neck_shape='rounded_u_twin_tenons',tenon_centers=[-.31,.31],tenon_top=5.56),
                  parts=exported,audit=source['audit'],trunk_connections=trunk_connections,
                  validation=dict(max_overlap=overlap,missing_volume=missing,extra_volume=extra))
    OUT.write_text(json.dumps(output,indent=2)+'\n')


if __name__ == '__main__':
    main()



