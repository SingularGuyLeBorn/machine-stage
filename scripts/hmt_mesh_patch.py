"""只保存加工改变的三角形；未加工曲面仍由原始参数生成，精度与细节不变。"""
import base64,gzip,struct
import numpy as np
from scipy.spatial import cKDTree

def make_patch(original_v,original_tri,vertices,normals,triangles,original_normals):
 distances,mapping=cKDTree(original_v).query(vertices)
 # 只复用数值上未移动的源面，不能把靠近切边的新顶点吸回旧位置而复活穿插。
 matched=(distances[triangles]==0).all(axis=1)
 # 用位置归一的顶点编号匹配，兼容 UV 与法线的接缝重复顶点。
 _,canonical=np.unique(original_v,axis=0,return_inverse=True)
 original={tuple(sorted(t)):i for i,t in enumerate(canonical[original_tri])}
 keep=set();extra=[]
 for i,(t,okay) in enumerate(zip(canonical[mapping[triangles]],matched)):
  index=original.get(tuple(sorted(t)),-1) if okay else -1
  if index>=0:keep.add(index)
  else:extra.append(i)
 deleted=np.array([i for i in range(len(original_tri)) if i not in keep],dtype='<u4')
 newtri=triangles[extra];used,reverse=np.unique(newtri,return_inverse=True)
 pos=vertices[used].copy();near=distances[used]==0;pos[near]=original_v[mapping[used[near]]]
 n=normals[used].copy();source_n=original_normals[mapping[used]]
 # 布尔重排后的原曲面顶点沿用源切线法线；孔壁与切面保留自己的硬边法线。
 smooth=(distances[used]<4e-7) & (np.einsum('ij,ij->i',n,source_n)>.8)
 n[smooth]=source_n[smooth]
 newtri=reverse.reshape(-1,3).astype('<u4')
 header=struct.pack('<IIIII',len(original_v),len(original_tri),len(deleted),len(pos),newtri.size)
 blob=header+deleted.tobytes()+pos.astype('<f4').tobytes()+n.astype('<f4').tobytes()+newtri.tobytes()
 return base64.b64encode(gzip.compress(blob,compresslevel=6,mtime=0)).decode()
