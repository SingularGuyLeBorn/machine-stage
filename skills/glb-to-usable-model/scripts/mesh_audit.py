"""位置焊接只用于诊断；不覆盖原有 UV/法线接缝。numpy 必需，manifold3d 可选。"""
import argparse, json
from collections import defaultdict
from pathlib import Path
import numpy as np

def arrays(part):
    p=np.asarray(part['positions'],dtype=np.float64);f=np.asarray(part['triangles'],dtype=np.int64)
    if p.ndim!=2 or p.shape[1]!=3 or f.ndim!=2 or f.shape[1]!=3 or not len(f):raise ValueError('需要非空 Nx3 坐标与 Mx3 三角索引')
    if not np.isfinite(p).all() or f.min()<0 or f.max()>=len(p):raise ValueError('坐标非有限或索引越界')
    return p,f

def audit(part,epsilon=1e-6):
    if epsilon<=0:raise ValueError('epsilon 必须为正，单位与输入一致')
    p,f=arrays(part)
    _,first,inv=np.unique(np.floor(p/epsilon+.5).astype(np.int64),axis=0,return_index=True,return_inverse=True)
    v=p[first];t=inv[f];edges=defaultdict(list);adj=defaultdict(set)
    area=np.linalg.norm(np.cross(v[t[:,1]]-v[t[:,0]],v[t[:,2]]-v[t[:,0]]),axis=1)/2
    degenerate=int(np.count_nonzero(area<=epsilon**2))
    for ti,face in enumerate(t):
        for a,b in zip(face,np.roll(face,-1)):
            edges[tuple(sorted((int(a),int(b))))].append((ti,1 if a<b else -1))
    for entries in edges.values():
        for i,_ in entries:adj[i].update(j for j,_ in entries if i!=j)
    unseen=set(range(len(t)));volumes=[];component_faces=[]
    while unseen:
        group=[];queue=[unseen.pop()]
        while queue:
            i=queue.pop();group.append(i);new=adj[i]&unseen;unseen-=new;queue.extend(new)
        q=v[t[group]];origin=q[0,0];q=q-origin
        volumes.append(float(np.einsum('ij,ij->i',q[:,0],np.cross(q[:,1],q[:,2])).sum()/6));component_faces.append(len(group))
    boundary=sum(len(e)==1 for e in edges.values());nonmanifold=sum(len(e)>2 for e in edges.values())
    winding=sum(len(e)==2 and sum(s for _,s in e)!=0 for e in edges.values())
    issues=[]
    for name,value in [('boundary_edges',boundary),('nonmanifold_edges',nonmanifold),('winding_edges',winding),('degenerate_faces',degenerate)]:
        if value:issues.append(name)
    if any(abs(vv)<=epsilon**3 for vv in volumes):issues.append('zero_volume_component')
    if any(vv<0 for vv in volumes):issues.append('negative_component_review_cavity_or_winding')
    return {'name':part.get('name'),'vertices':len(p),'welded_vertices':len(v),'triangles':len(t),
        'bounds':[p.min(0).tolist(),p.max(0).tolist()],'epsilon':epsilon,'boundary_edges':boundary,
        'nonmanifold_edges':nonmanifold,'winding_edges':winding,'degenerate_faces':degenerate,
        'components':len(volumes),'component_faces':component_faces,'signed_volumes':volumes,
        'issues':issues,'note':'位置量化不是距离聚类；未证明自交为空。负壳可能是合法内腔，不能自动删除。'}

def solid(part):
    import manifold3d as m
    p,f=arrays(part)
    # 合并完全相同的位置：原数据的逐角属性仍由调用方另存。
    v,inv=np.unique(p.astype(np.float32),axis=0,return_inverse=True)
    body=m.Manifold(m.Mesh(v,np.asarray(inv[f],dtype=np.uint32)))
    if body.status()!=m.Error.NoError or body.is_empty():raise ValueError(f"{part.get('name')}: 不能作为闭合布尔实体: {body.status()}")
    return body

def as_part(name,body):
    mesh=body.to_mesh()
    return {'name':name,'positions':mesh.vert_properties[:,:3].tolist(),'triangles':mesh.tri_verts.tolist()}

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('input');p.add_argument('--out',required=True)
    p.add_argument('--epsilon',type=float,default=1e-6);p.add_argument('--overwrite',action='store_true')
    a=p.parse_args();out=Path(a.out)
    if out.exists() and not a.overwrite:p.error('输出已存在')
    data=json.loads(Path(a.input).read_text(encoding='utf-8'));result=[audit(part,a.epsilon) for part in data['parts']]
    out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(f"{len(result)} parts; {sum(bool(r['issues']) for r in result)} need review → {out}")
    raise SystemExit(2 if any(r['issues'] for r in result) else 0)
