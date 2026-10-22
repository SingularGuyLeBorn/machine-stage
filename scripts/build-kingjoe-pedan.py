"""从已确认四分体外壳加工内部设备舱与可动关节，保留外表面属性。

先用 Blender 执行 scripts/build-kingjoe-modules.py，输出 qa-out/kingjoe-source-shells.json。
再运行 python scripts/build-kingjoe-pedan.py，仅写 pedan.generated.json 与 qa-out 缓存。
--reuse-lower 只在下三模块及壁厚参数未改时复用缓存；--export-only 只重新序列化缓存。
依赖与既有 fuse 脚本相同：manifold3d、numpy。尺寸为用户批准的原创佩丹结构。
"""
import sys
sys.dont_write_bytecode = True
import base64
import importlib.util
import json
import gc
from pathlib import Path
import numpy as np
import manifold3d as m

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('fusion', ROOT / 'scripts/fuse-kingjoe-modules.py')
fusion = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fusion)
cache=ROOT/'qa-out/pedan-shapes.npz'

def arm_region(side,height=4.96):
    main=m.Manifold.cube((10,height+10,20)).translate((.75 if side>0 else -10.75,-10,-10))
    # 肩根内缘弯到 X=±0.731；原直切线把这一片切成仅靠边接触的悬片。
    # 仅在肩根末端 80mm 向内让出完整归属，避免事后把薄片硬并到上臂。
    root=m.Manifold.cube((10,height-4.88,20)).translate((.73 if side>0 else -10.73,4.88,-10))
    return main+root

def connect_restored(body):
    """沿原模型接头补短连接，分块比较顶点，避免恢复细节时占用大块内存。"""
    for _ in range(100):
        pieces=sorted([p for p in body.decompose() if p.volume()>1e-9],key=lambda p:p.volume(),reverse=True)
        if len(pieces)==1: return pieces[0]
        main=np.unique(pieces[0].to_mesh().vert_properties[:,:3],axis=0)
        nearest=None
        for piece in pieces[1:]:
            other=np.unique(piece.to_mesh().vert_properties[:,:3],axis=0)
            for start in range(0,len(other),8):
                delta=other[start:start+8,None,:]-main[None,:,:]
                dist=np.einsum('ijk,ijk->ij',delta,delta)
                j,k=np.unravel_index(np.argmin(dist),dist.shape)
                if nearest is None or dist[j,k]<nearest[0]: nearest=(float(dist[j,k]),other[start+j],main[k])
        gap=nearest[0]**.5
        assert gap<.32,('原单体接头缺失',gap)
        body=fusion.union([*pieces,fusion.capsule(nearest[1],nearest[2],min(.10,max(.035,gap*.55)))])
    raise RuntimeError('原单体头部接头未能闭合')

if '--export-only' not in sys.argv:
    source = json.loads((ROOT / 'src/three/parts/models/kingjoe-modules/modules.generated.json').read_text(encoding='utf-8'))
    bodies = {p['key']: fusion.source_body(p) for p in source['parts']}

    # [OM-FREEPLAY] 关节切面位于原肩下及肘环内，零位拼回保持原外形；不是官方内部图纸。
    segments = dict(bodies)
    joints = []
    for side, suffix in [(-1, 'l'), (1, 'r')]:
        shoulder = [side * 1.03, 4.96, 0.34]
        # 肩根沿护甲下缘分件，避免斜平面/球面切穿波纹护套后留下尖楔。
        region=arm_region(side)
        arm=segments['head_arms'] ^ fusion.paint(region,4)
        segments['head_arms']=segments['head_arms']-arm
        upper,fore=arm.split_by_plane((0,1,0),4.02)
        segments['upper_'+suffix] = upper
        segments['fore_'+suffix] = fore
        joints += [dict(key='upper_'+suffix, module='head_arms', parent='Module_head_arms', pivot=shoulder,radius=.36),
                   dict(key='fore_'+suffix, module='head_arms', parent='Joint_upper_'+suffix, pivot=[side*1.25,4.02,0.28],radius=.34)]
    
    # 关节分界留下的护甲小块归相邻活动肢体，不能把它们悬空留在固定架上。
    for fixed in ['head_arms']:
        components=sorted(segments[fixed].decompose(),key=lambda b:b.volume(),reverse=True)
        segments[fixed]=components[0]
        for piece in components[1:]:
            if piece.volume()<1e-8: continue
            box=piece.bounding_box()
            cx,cy=(box[0]+box[3])/2,(box[1]+box[4])/2
            suffix='l' if cx<0 else 'r'
            owner=('leg_' if fixed=='legs' else ('upper_' if cy>4.02 else 'fore_'))+suffix
            segments[owner]=segments[owner]+piece
    
    # 以原单体模型使用的 GLB 源壳恢复头部圆筒、圆盘、支架和后部细节。
    # 原四分体融合时的运动避让扫掠误削了侧筒；不能用大凸包吞掉原细节。
    # 先拆原四肢再修头壳，避免头部布尔运算改变肩肘切面拓扑。
    source_path=ROOT/'qa-out/kingjoe-source-shells.json'
    if not source_path.exists():
        raise RuntimeError('请先用 Blender 运行 scripts/build-kingjoe-modules.py，恢复原 GLB 闭合源壳')
    original=json.loads(source_path.read_text(encoding='utf-8'))
    raw=fusion.union([fusion.source_body(p) for p in original['parts'] if p['key'] in ['torso','head_arms']])
    # 中央颈口和双榫配合面保留原状；侧筒与背面从原单体恢复。
    high=m.Manifold.cube((20,10,20)).translate((-10,5.57,-10))
    sides=fusion.union([m.Manifold.cube((10,10,20)).translate((x,5.25,-10)) for x in [.72,-10.72]])
    back=m.Manifold.cube((20,10,9.45)).translate((-10,5.25,-10))
    repair=fusion.union([high,sides,back])
    # 恢复件沿已确认胸甲留配对余量，原侧筒不能穿进胸甲上缘。
    restored=fusion.union([segments['head_arms']-repair,(raw ^ repair)-bodies['chest']])
    segments['head_arms']=connect_restored(restored)
    del raw, original, restored, repair, high, sides, back
    gc.collect()

    # 外壳只沿关节分界分件，严禁用球形座孔切除肩部、肘部或头侧原外表面。
    # 关节轴心置于切面前缘，弯曲时向前让位；承力件安放在壳内。
    # 设备舱先验证完全位于实体内，再挖空；不允许切坏已确认外壳和三组配合面。
    room_specs = [
        ('brain','head_arms',[0,5.91,0.02],[.45,.37,.45]),
        ('energy','pelvis',[0,3.77,0],[.72,.26,.66]),
        ('modulator_l','chest',[-.48,4.77,.65],[.44,.38,.24]),
        ('modulator_r','chest',[.48,4.77,.65],[.44,.38,.24]),
    ]
    for side,suffix in [(-1,'l'),(1,'r')]:
        room_specs += [
            ('drive_'+suffix,'legs',[side*.66,1.03,-.12],[.36,.83,.39]),
            ('thigh_'+suffix,'legs',[side*.59,2.22,0],[.32,.67,.32]),
            ('servo_'+suffix,'upper_'+suffix,[side*1.12,4.48,0.04],[.21,.45,.24]),
            ('wrist_'+suffix,'fore_'+suffix,[side*1.3,3.56,.12],[.22,.39,.24]),
        ]
    rooms=[]
    for key, owner, center, dims in room_specs:
        dims=np.array(dims)
        for attempt in range(12):
            void = m.Manifold.cube(tuple(dims),True).translate(center)
            outside=(void-segments[owner]).volume()
            if outside < 1e-9: break
            dims *= .86
        if outside > 1e-9 or min(dims)<.055:
            raise RuntimeError(f'{key} 设备舱不能完整放进原壳体: {dims}, outside={outside}')
        rooms.append(dict(key=key,owner=owner,center=center,size=dims.tolist()))
        print('room',key,dims.tolist(),flush=True)
    
    # 由真实实体向内等距收缩生成壳体内壁。薄细节保留实心，外表面一律不动。
    # [OM-FREEPLAY] 25mm 名义壁厚、28mm 肋宽和 160mm 肋距属于原创制造尺寸。
    # 使用立方体腐蚀，确保所有方向至少有 25mm 材料，不靠缩放包围盒猜内腔。
    structures=[]
    cavities={}
    lower_cache={}
    if '--reuse-lower' in sys.argv:
        # 仅迭代头部时复用完全未改的腿、腹盆、胸甲，降低布尔内存峰值。
        meta=json.loads(cache.with_suffix('.json').read_text(encoding='utf-8'))
        with np.load(cache) as saved:
            for i,p in enumerate(meta['shapes']):
                owner=p.get('owner',p['key'])
                if owner not in ['legs','pelvis','chest']: continue
                shape=m.Manifold(m.Mesh(saved[f'p{i}'],saved[f't{i}'],merge_from_vert=saved[f'f{i}'],merge_to_vert=saved[f'm{i}']))
                if 'owner' in p: structures.append(dict(**p,body=shape))
                else: lower_cache[owner]=shape
    for key,solid in list(segments.items()):
        if key in lower_cache:
            segments[key]=lower_cache[key]
            continue
        plain=solid.set_properties(0,lambda p,old:[]).simplify(1e-7)
        print('hollow',key,plain.num_tri(),flush=True)
        cavity=plain.minkowski_difference(m.Manifold.cube((.05,.05,.05),True))
        cavities[key]=cavity
        segments[key]=solid-fusion.paint(cavity,4)
        # 内壁贴合肋：肋的外侧就是内壁表面，不再把设备缩成远离外壳的小盒子。
        inner=cavity.minkowski_difference(m.Manifold.cube((.056,.056,.056),True))
        band=cavity-inner
        bounds=cavity.bounding_box()
        count=max(1,int((bounds[4]-bounds[1])/.16))
        for i in range(count):
            y=bounds[1]+(i+.5)*(bounds[4]-bounds[1])/count
            rib=band ^ m.Manifold.cube((10,.028,10),True).translate((0,y,0))
            for component in rib.decompose():
                if component.volume()>1e-7 and component.min_gap(segments[key],.002)<.001:
                    structures.append(dict(key=f'{key}_rib_{len(structures)}',owner=key,kind='rib',body=component))
        # 四列贴壳纵向加强筋与横肋相接；在横肋处断开，避免叠放实体。
        ribs=m.Manifold.batch_boolean([p['body'] for p in structures if p['owner']==key],m.OpType.Add)
        for axis in [0,2]:
            for sign in [-1,1]:
                mid=(bounds[axis]+bounds[axis+3])/2
                at=mid+sign*(bounds[axis+3]-bounds[axis])*.22
                dims=[10,10,10];dims[axis]=.026
                center=[0,0,0];center[axis]=at
                rail=(band ^ m.Manifold.cube(dims,True).translate(center))-ribs
                for component in rail.decompose():
                    if component.volume()>1e-7:
                        structures.append(dict(key=f'{key}_rail_{len(structures)}',owner=key,kind='rail',body=component))
        print('structure',key,'cavity',round(cavity.volume(),4),'parts',sum(p['owner']==key for p in structures),flush=True)
    
    arrays={}
    shapes=[dict(key=k,body=v) for k,v in segments.items()]+structures
    for i,p in enumerate(shapes):
        mesh=p['body'].to_mesh()
        arrays[f'p{i}']=mesh.vert_properties
        arrays[f't{i}']=mesh.tri_verts
        arrays[f'f{i}']=mesh.merge_from_vert
        arrays[f'm{i}']=mesh.merge_to_vert
    cache.parent.mkdir(exist_ok=True)
    np.savez(cache,**arrays)
    cache.with_suffix('.json').write_text(json.dumps(dict(count=len(segments),shapes=[{k:v for k,v in p.items() if k!='body'} for p in shapes],joints=joints,rooms=rooms)),encoding='utf-8')
else:
    meta=json.loads(cache.with_suffix('.json').read_text(encoding='utf-8'))
    arrays=np.load(cache)
    shapes=meta['shapes']
    for i,p in enumerate(shapes):
        vp=arrays[f'p{i}'];tri=arrays[f't{i}']
        _,first,inv=np.unique(vp[:,:3],axis=0,return_index=True,return_inverse=True)
        canonical=first[inv].astype(np.uint32)
        duplicate=np.where(canonical!=np.arange(len(vp)))[0].astype(np.uint32)
        p['body']=m.Manifold(m.Mesh(vp,tri,merge_from_vert=arrays[f'f{i}'],merge_to_vert=arrays[f'm{i}']))
    segments={p['key']:p['body'] for p in shapes[:meta['count']]}
    structures=shapes[meta['count']:]
    joints=meta['joints'];rooms=meta['rooms']

def export(key, body):
    assert body.status()==m.Error.NoError, (key,body.status())
    if key == 'head_arms':
        # Float32 的共面分界重建后必须仍遵守原分区，不能把肩根薄片反填进活动臂。
        for side in [-1,1]:
            region=arm_region(side,float(np.float32(4.96)))
            body=body-fusion.paint(region,4)

    appearance=body.to_mesh().vert_properties
    # 属性缝与极短边在 Float32 下会折叠：先清理拓扑，再恢复原外表面属性。
    cleaned=body.set_properties(0,lambda p,old:[]).simplify(1e-4 if '_rail_' in key or '_rib_' in key else 1e-7)
    # 不分解后只保留正体：那会把内腔重新填实。保留完整有向边界。
    mesh=cleaned.to_mesh()
    vp,tri=mesh.vert_properties,mesh.tri_verts
    _,first,inv=np.unique(vp[:,:3],axis=0,return_index=True,return_inverse=True)
    vp=vp[first];tri=inv[tri].astype(np.uint32)
    tri=tri[(tri[:,0]!=tri[:,1]) & (tri[:,1]!=tri[:,2]) & (tri[:,0]!=tri[:,2])]
    # Float32 可把极短边压成共线三角形。只收拢退化面的最短边，不做全局栅格焊接。
    # 全局粗焊接曾把肩根邻近但不同的边并起来，造成凹陷/凸片，因此严禁恢复该做法。
    for _ in range(100):
        pts=vp[tri,:3].astype(float)
        areas=np.linalg.norm(np.cross(pts[:,1]-pts[:,0],pts[:,2]-pts[:,0]),axis=1)
        zero=np.where(areas==0)[0]
        if not len(zero): break
        for fi in zero:
            face=tri[fi]
            pairs=[(face[0],face[1]),(face[1],face[2]),(face[2],face[0])]
            a,b=min(pairs,key=lambda ij:np.linalg.norm(vp[ij[0],:3]-vp[ij[1],:3]))
            if np.linalg.norm(vp[a,:3]-vp[b,:3])>=1e-5 and ('_rail_' in key or '_rib_' in key):
                print('discard degenerate structural sliver',key,flush=True)
                return None
            assert np.linalg.norm(vp[a,:3]-vp[b,:3])<1e-5,(key,'long degenerate')
            tri[tri==b]=a
        tri=tri[(tri[:,0]!=tri[:,1]) & (tri[:,1]!=tri[:,2]) & (tri[:,0]!=tri[:,2])]
    # 布尔求交偶尔留下仅共用一条边的碎屑；它不是可制造的独立梁，禁止导出。
    # 仅剔除新生成的骨架碎屑，原外壳遇到同类错误必须失败，不能删外表面。
    _,canonical=np.unique(np.round(vp[:,:3].astype(float),12),axis=0,return_inverse=True)
    top=canonical[tri]
    edges=np.concatenate([top[:,[0,1]],top[:,[1,2]],top[:,[2,0]]])
    _,counts=np.unique(np.sort(edges,axis=1),axis=0,return_counts=True)
    if np.any(counts!=2) and ('_rail_' in key or '_rib_' in key):
        print('discard nonmanifold structural sliver',key,flush=True)
        return None
    checked=m.Manifold(m.Mesh(np.ascontiguousarray(vp),np.ascontiguousarray(tri)))
    assert checked.status()==m.Error.NoError,(key,checked.status())
    if abs(checked.volume()-cleaned.volume())>=1e-5 and ('_rail_' in key or '_rib_' in key):
        print('discard unstable structural sliver',key,flush=True)
        return None
    assert abs(checked.volume()-cleaned.volume())<1e-5,(key,checked.volume(),cleaned.volume())
    # 不对分解后的边界重新 union/compose；内腔的负向边界必须保留。
    # 同一位置在硬边两侧可有不同法线，必须按当前三角面选取，不能任取一侧。
    lookup={}
    for i,p in enumerate(appearance): lookup.setdefault(tuple(p[:3]),[]).append(i)
    attrs=[];candidates=[]
    for point in vp:
        nearest=lookup.get(tuple(point[:3]))
        if nearest is None: nearest=[np.argmin(np.sum((appearance[:,:3]-point[:3])**2,axis=1))]
        candidates.append(appearance[nearest,3:])
        attrs.append(appearance[nearest[0],3:])
    attrs=np.array(attrs)
    pos,norm,uv,idx,groups=[],[],[],[],[]
    vertices={}
    material=np.round(np.median(attrs[tri,5],axis=1)).astype(int)
    for mat in sorted(set(material)):
        start=len(idx)
        for face in tri[material==mat]:
            pts=vp[face,:3].astype(float)
            n=np.cross(pts[1]-pts[0],pts[2]-pts[0]); length=np.linalg.norm(n)
            assert length>0,(key,'degenerate')
            n/=length
            for vi in face:
                row=vp[vi]
                options=candidates[vi]
                compatible=options[np.round(options[:,5]).astype(int)==mat]
                if len(compatible): options=compatible
                attr=options[np.argmax(options[:,:3]@n)]
                vn=attr[:3];vn=vn if np.linalg.norm(vn)>.5 and np.dot(vn,n)>.1 else n
                # 共享属性完全相同的顶点，保留硬边；避免每个三角形复制三份数据。
                identity=(int(vi),*map(float,vn),*map(float,attr[3:5]))
                vertex=vertices.get(identity)
                if vertex is None:
                    vertex=len(pos)//3;vertices[identity]=vertex
                    pos.extend(row[:3]);uv.extend(attr[3:5]);norm.extend(vn)
                idx.append(vertex)
        groups.append(dict(material=fusion.MATERIALS[mat],start=start,count=len(idx)-start))
    enc=lambda values,dtype:base64.b64encode(np.asarray(values,dtype=dtype).tobytes()).decode()
    return dict(key=key,position=enc(pos,'<f4'),normal=enc(norm,'<f4'),uv=enc(uv,'<f4'),index=enc(idx,'<u4'),groups=groups)

structure=[]
for p in structures:
    mesh=export(p['key'],fusion.paint(p['body'],4))
    if mesh is not None: structure.append(dict(**mesh,owner=p['owner'],kind=p['kind']))
output=dict(parts=[export(key,body) for key,body in segments.items()],joints=joints,rooms=rooms,structure=structure)
dest=ROOT / 'src/three/parts/models/kingjoe-modules/pedan.generated.json'
dest.write_text(json.dumps(output,separators=(',',':'))+'\n',encoding='utf-8')
print('exported',[(key,round(body.volume(),5)) for key,body in segments.items()],flush=True)
