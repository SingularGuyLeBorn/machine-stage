"""HMT 实体装配加工。输入 scripts/export-hmt.ts --raw；无减面、无碰撞豁免。
依赖：numpy、manifold3d==3.5.4。所有结果仍按原始零件拆解。
优先保留可见罩壳、走线和轴件，在承接件加工插口、接缝与紧固件孔。
超过 25% 的切除另列，必须逐项回查设计，不能直接当验收通过。
"""
from pathlib import Path
import json,time,hashlib
import numpy as np
import manifold3d as m
from hmt_mesh_patch import make_patch
from hmt_solid import connected_material_regions
ROOT=Path(__file__).resolve().parents[1]
META=ROOT/'qa-out/hmt-mesh.json'
OUTPUT=ROOT/'src/three/parts/models/hmt/machined.generated.json'
CLEARANCE=0.00022

def surface_clearance(s):
 # 完整承接表面的法向斜接偏置；锐角、回折或不稳定处回退到精确实体包络。
 # 只生成加工刀具体积，不改原件采样密度，也不删减原始面。
 mesh=s.to_mesh();v=mesh.vert_properties[:,:3].astype('float64');t=mesh.tri_verts
 normals=np.cross(v[t[:,1]]-v[t[:,0]],v[t[:,2]]-v[t[:,0]])
 lengths=np.linalg.norm(normals,axis=1)
 if np.any(lengths<1e-15):return None
 normals/=lengths[:,None];direction=np.zeros_like(v)
 for k in range(3):np.add.at(direction,t[:,k],normals)
 direction/=np.maximum(np.linalg.norm(direction,axis=1)[:,None],1e-30)
 alignment=np.ones(len(v))
 for k in range(3):np.minimum.at(alignment,t[:,k],np.einsum('ij,ij->i',direction[t[:,k]],normals))
 if alignment.min()<.2:return None
 shifted=v+direction*(CLEARANCE/alignment)[:,None]
 out=m.Manifold(m.Mesh(np.ascontiguousarray(shifted,dtype='float32'),np.ascontiguousarray(t,dtype='uint32')))
 if out.status()!=m.Error.NoError or out.volume()<s.volume():return None
 if (s-out).volume()>1e-14:return None
 return out+s

def priority(p):
 name=p['id'];mat=p['material']
 if mat=='opticCore':return 125
 if mat=='optic':return 124
 if mat=='fastener':return 120
 # 线束连续，插座围绕线束加工轴孔；不能按名称排序反过来截断导线。
 if 'harness_socket' in name:return 72
 if '.harness_' in name:return 110
 if '_pin_' in name:return 118
 if any(word in name for word in ('hands.knuckle','hands.thumb_hinge','feet.toe_joint')):return 115
 if any(word in name for word in ('_wire','_cable','_harness','_tendon','_spring')):return 110
 if name=='hmt.head.cranium':return 35
 if 'lining' in name:return 50
 if p['layer']==4:
  if any(word in name for word in ('carapace','forehead','pauldron','palm')):return 100
  if any(word in name for word in ('side','flank','collar','crown','rear','back')):return 88
  return 94
 if any(word in name for word in ('_shaft','_pin','_polished','_rim')):return 83
 if any(word in name for word in ('_race','_eye','_collar')):return 77
 if any(word in name for word in ('rotor','_cap','disc')):return 65
 return 72

def expanded(s):
 # 仅在加工刀具上按源导出精度清除共面碎片；原零件不减面。
 # 额外 0.1 微米包络补偿刀具清理误差，保证不缩小 0.22 mm 的目标间隙。
 mesh=s.to_mesh();v=mesh.vert_properties[:,:3].copy();tri=mesh.tri_verts.astype('uint32')
 key=hashlib.sha256(v.tobytes()+tri.tobytes()+str(CLEARANCE).encode()+b'bounded-clearance-v2').hexdigest()
 folder=ROOT/'qa-out/hmt-clearance-cache';folder.mkdir(exist_ok=True)
 path=folder/(key+'.npz')
 if path.exists():
  cached=np.load(path);return m.Manifold(m.Mesh64(cached['v'],cached['t']))
 cleaned=s.as_original().simplify(1e-7)
 components=[part for part in cleaned.decompose() if part.volume()>0]
 if not components:components=[s]
 tool=m.Manifold.cube((2*(CLEARANCE+1e-7),)*3,True)
 print('间隙包络',s.num_tri(),'清理刀具后',sum(p.num_tri() for p in components),'连通体',len(components),flush=True)
 out=m.Manifold.batch_boolean([part.minkowski_sum(tool) for part in components],m.OpType.Add)+s
 out=out.as_original().simplify(1e-9)
 if out.status()!=m.Error.NoError:raise RuntimeError('加工间隙网格不闭合')
 data=out.to_mesh64();np.savez_compressed(path,v=data.vert_properties[:,:3],t=data.tri_verts)
 return out

def main():
 start=time.time();meta=json.loads(META.read_text());pieces=meta['pieces'];solids=[];bounds=[];mats=[];original_meshes=[];original_normals=[]
 if meta.get('kind')!='source':raise RuntimeError('必须先运行 export-hmt.ts --raw，禁止对已加工模型重复加工')
 with open(ROOT/'qa-out/hmt-mesh.bin','rb') as f:
  for p in pieces:
   f.seek(p['offset']);n=p['vertices'];v=np.frombuffer(f.read(n*12),dtype='<f4').reshape(-1,3).copy()
   original_normals.append(np.frombuffer(f.read(n*12),dtype='<f4').reshape(-1,3).copy())
   tri=np.frombuffer(f.read(p['indices']*4),dtype='<u4').reshape(-1,3).copy()
   original_meshes.append((v,tri))
   mesh=m.Mesh(v,tri,tolerance=1e-7);mesh.merge();s=m.Manifold(mesh)
   if s.status()!=m.Error.NoError:raise RuntimeError(p['id']+' '+str(s.status()))
   mat=np.array(p['matrix']).reshape(4,4).T;mats.append(mat);s=s.transform(mat[:3,:]);solids.append(s);bounds.append(s.bounding_box())
 features={}
 for i,p in enumerate(pieces):
  if p['id'] not in ('hmt.head.forehead','hmt.head.forehead_lining'):continue
  drills=[]
  for side in [-1,1]:
   for row in range(11):
    x=side*(0.053-row*0.00045);y=-0.015+row*0.0028
    drills.append(m.Manifold.cube((0.004,0.0008,0.12),True).translate((x,y,0.03)).transform(mats[i][:3,:]))
  features[i]=drills
 order=sorted(range(len(pieces)),key=lambda i:(-priority(pieces[i]),pieces[i]['id']))
 b=np.array(bounds);done=[];result=[];audit=[];severe=[];clearance_tools={}
 print('载入闭合零件',len(solids),round(time.time()-start,1),flush=True)
 for step,i in enumerate(order):
  candidates=[j for j in done if np.all(b[i,:3]-CLEARANCE<b[j,3:]) and np.all(b[j,:3]-CLEARANCE<b[i,3:])]
  s=solids[i];original=s.volume();active=list(features.get(i,[]))
  # 刀具只需覆盖当前零件包围盒，外留四倍间隙。裁掉远处曲面不改变相减结果，
  # 避免一个小轴承与整片高密度腿甲做多刀具全域布尔。
  crop=m.Manifold.cube(tuple(b[i,3:]-b[i,:3]+8*CLEARANCE)).translate(tuple(b[i,:3]-4*CLEARANCE))
  for j in candidates:
   overlap=s^solids[j]
   if overlap.volume()>1e-16:
    print('配合',step,pieces[i]['id'],pieces[j]['id'],overlap.num_tri(),flush=True)
    if j not in clearance_tools:clearance_tools[j]=surface_clearance(solids[j])
    tool=clearance_tools[j]
    active.append((tool if tool is not None else expanded(overlap))^crop)
  if active:
   print('局部相减',step,pieces[i]['id'],'刀具面',sum(t.num_tri() for t in active),flush=True)
   s=m.Manifold.batch_boolean([s,*active],m.OpType.Subtract)
   if s.status()!=m.Error.NoError:raise RuntimeError(pieces[i]['id']+' 加工失败')
   # 验收对象是实际 float32 导出，不是布尔内核的双精度中间体。
   # 每件落到导出精度后检查已装配件，残余相交仍用相同间隙刀具修配。
   for precision_pass in range(4):
    local_check=s.transform(np.linalg.inv(mats[i])[:3,:]).to_mesh()
    export_mesh=m.Mesh(local_check.vert_properties[:,:3].copy(),local_check.tri_verts.copy(),tolerance=1e-7)
    export_mesh.merge();quantized=m.Manifold(export_mesh).transform(mats[i][:3,:])
    residuals=[]
    for j in candidates:
     overlap=quantized^solids[j]
     if overlap.volume()>1e-12:
      print('导出精度修配',pieces[i]['id'],pieces[j]['id'],overlap.volume(),flush=True)
      residuals.append(overlap)
    if not residuals:
     s=quantized
     break
    if precision_pass==3:raise RuntimeError(pieces[i]['id']+' 导出精度下仍有实体相交')
    s=m.Manifold.batch_boolean([quantized,*[expanded(r) for r in residuals]],m.OpType.Subtract)
   remaining=s.volume();removed=1-remaining/original
   audit.append({'id':pieces[i]['id'],'removed':removed,'tools':len(active)})
   # 线束、弹簧及支撑连杆必须保持连续实体；零穿模不能靠截断功能件获得。
   if any(word in pieces[i]['id'] for word in ('wire','cable','harness','tendon','rib_signal','spring','neck_strut_mount','waist.oblique_','red_crossbar','bus_mount','bus_socket')) and connected_material_regions(s)!=1:
    print('功能件被截断',pieces[i]['id'],flush=True)
    severe.append(pieces[i]['id'])
   if s.is_empty() or removed>.5:
    print('严重装配冲突',pieces[i]['id'],removed,flush=True)
    severe.append(pieces[i]['id'])
    if s.is_empty():continue
   local=s.transform(np.linalg.inv(mats[i])[:3,:]).calculate_normals(0,45).to_mesh()
   props=local.vert_properties
   result.append({'id':pieces[i]['id'],'data':make_patch(*original_meshes[i],props[:,:3],props[:,3:6],local.tri_verts,original_normals[i])})
   solids[i]=s
  done.append(i)
  if step%100==0:print('加工',step,'修配',len(result),'秒',round(time.time()-start,1),flush=True)
 sources=['registry.ts','geometry.ts','restPose.ts']
 hashes={name:hashlib.sha256((ROOT/'src/three/parts/models/hmt'/name).read_bytes()).hexdigest() for name in sources}
 (ROOT/'qa-out/machining-audit.json').write_text(json.dumps(sorted(audit,key=lambda a:-a['removed']),indent=2))
 if severe:raise RuntimeError('修正源尺寸后再生成：'+', '.join(severe))
 OUTPUT.write_text(json.dumps({'format':'triangle-patch-v1','clearance':CLEARANCE,'sources':hashes,'parts':result},separators=(',',':')),encoding='utf8')
 (ROOT/'qa-out/machining-audit.json').write_text(json.dumps(sorted(audit,key=lambda a:-a['removed']),indent=2))
 print('完成',len(result),'高切除量',sum(a['removed']>.25 for a in audit),'耗时',round(time.time()-start,1),flush=True)
if __name__=='__main__':main()
