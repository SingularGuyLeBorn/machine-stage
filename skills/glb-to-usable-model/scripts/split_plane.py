"""共享平面切分的几何原型。显式 --geometry-only：不会假装保留材质、UV、骨骼。"""
import argparse,json
from pathlib import Path
import numpy as np
from mesh_audit import solid,as_part,audit

def split(part,normal,offset):
    n=np.asarray(normal,dtype=float);length=np.linalg.norm(n)
    if not np.isfinite(n).all() or length<1e-12 or not np.isfinite(offset):raise ValueError('平面参数无效')
    body=solid(part);a,b=body.split_by_plane(n/length,offset/length)
    if a.is_empty() or b.is_empty():raise ValueError('平面没有将实体分成两个非空部分')
    parts=[as_part(part['name']+'_positive',a),as_part(part['name']+'_negative',b)]
    for out in parts:
        report=audit(out)
        if report['issues']:raise ValueError(f"导出精度下审计失败: {report}")
    scale=max(abs(body.volume()),1e-12);overlap=abs((a^b).volume());difference=abs((body-(a+b)).volume())+abs(((a+b)-body).volume())
    if overlap>scale*1e-6 or difference>scale*1e-6:raise ValueError('共享切分体积守恒失败')
    return parts,{'source_volume':body.volume(),'overlap_volume':overlap,'symmetric_difference_volume':difference}

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('input');p.add_argument('--part',required=True)
    p.add_argument('--normal',type=float,nargs=3,required=True);p.add_argument('--offset',type=float,required=True)
    p.add_argument('--out',required=True);p.add_argument('--geometry-only',action='store_true');p.add_argument('--overwrite',action='store_true')
    a=p.parse_args();out=Path(a.out)
    if not a.geometry_only:p.error('此脚本仅验证闭合切面；必须显式 --geometry-only')
    if out.exists() and not a.overwrite:p.error('输出已存在')
    data=json.loads(Path(a.input).read_text(encoding='utf-8'));matches=[v for v in data['parts'] if v['name']==a.part]
    if len(matches)!=1:p.error('part 名称必须唯一且存在')
    parts,report=split(matches[0],a.normal,a.offset)
    out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps({'schema':'glb-workbench/v1','units':data.get('units'),
      'attribute_policy':'geometry-only prototype; not a finished visual asset','parts':parts,'validation':report}),encoding='utf-8')
    print(json.dumps(report))
