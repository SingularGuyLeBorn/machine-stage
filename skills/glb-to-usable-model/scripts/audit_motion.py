"""检查实际导出的动画姿态。poses: [{time, matrices:{partName: row-major 4x4}}]。"""
import argparse,json
from pathlib import Path
import numpy as np
from mesh_audit import solid

def audit_motion(parts,frames,tolerance=1e-7):
    if tolerance<0 or not frames:raise ValueError('需要非空姿态及非负体积容差')
    bodies={p['name']:solid(p) for p in parts}
    if len(bodies)!=len(parts):raise ValueError('part 名称重复')
    worst={}
    for frame in frames:
        moved={}
        for key,body in bodies.items():
            matrix=np.asarray(frame['matrices'][key],dtype=float)
            if matrix.shape!=(4,4) or not np.isfinite(matrix).all() or not np.allclose(matrix[3],[0,0,0,1]):raise ValueError('需要有限的仿射 4x4 矩阵')
            if abs(np.linalg.det(matrix[:3,:3]))<1e-10:raise ValueError('零尺度姿态')
            moved[key]=body.transform(matrix[:3])
        entries=list(moved.items())
        for i,(ka,a) in enumerate(entries):
            for kb,b in entries[i+1:]:
                value=abs((a^b).volume());pair=f'{ka} / {kb}'
                if pair not in worst or value>worst[pair]['volume']:worst[pair]={'volume':value,'time':frame.get('time')}
    return {'frames':len(frames),'volume_tolerance':tolerance,'pairs':worst,
            'passed':all(r['volume']<=tolerance for r in worst.values()),
            'scope':'仅这些采样姿态；非连续碰撞证明。容差单位为输入长度单位的三次方。'}

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('input');p.add_argument('poses');p.add_argument('--out',required=True)
    p.add_argument('--volume-tolerance',type=float,default=1e-7);p.add_argument('--overwrite',action='store_true');a=p.parse_args();out=Path(a.out)
    if out.exists() and not a.overwrite:p.error('输出已存在')
    result=audit_motion(json.loads(Path(a.input).read_text(encoding='utf-8'))['parts'],json.loads(Path(a.poses).read_text(encoding='utf-8')),a.volume_tolerance)
    out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(f"motion passed={result['passed']} → {out}");raise SystemExit(0 if result['passed'] else 2)
