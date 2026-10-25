"""区分连通的材料实体与封闭内孔边界；内孔不是第二块断开的材料。"""
import manifold3d as m
import numpy as np

def connected_material_regions(s):
 parts=s.decompose();outer=[p for p in parts if p.volume()>0]
 voids=[p for p in parts if p.volume()<0]
 if voids:
  body=m.Manifold.batch_boolean(outer,m.OpType.Add)
  for void in voids:
   mesh=void.to_mesh64();tri=np.ascontiguousarray(mesh.tri_verts[:,[0,2,1]])
   cavity=m.Manifold(m.Mesh64(mesh.vert_properties.copy(),tri.copy()))
   if (cavity-body).volume()>1e-14:raise RuntimeError('内孔边界超出承接实体')
 return len(outer)
