"""blender -b --python blender_export.py -- input.glb --out scene.json
将当前导入姿态烘焙到世界坐标，用于分析/切分原型；保留逐角法线、UV、材质索引和来源。
原 GLB 的骨架、动画、贴图仍是事实源，本 JSON 不能替代它。
"""
import argparse, hashlib, json, sys
from pathlib import Path
import bpy

def main():
    if not bpy.app.background: raise RuntimeError('请在独立 blender -b 进程运行，不能清空交互工作场景')
    p=argparse.ArgumentParser();p.add_argument('input');p.add_argument('--out',required=True)
    p.add_argument('--frame',type=int,default=1);p.add_argument('--overwrite',action='store_true')
    a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);src=Path(a.input).resolve();out=Path(a.out)
    if out.exists() and not a.overwrite:p.error('输出已存在')
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(src));bpy.context.scene.frame_set(a.frame)
    deps=bpy.context.evaluated_depsgraph_get();parts=[]
    bone_shapes={bone.custom_shape for rig in bpy.context.scene.objects if rig.type=='ARMATURE' for bone in rig.pose.bones if bone.custom_shape}
    for obj in sorted(bpy.context.scene.objects,key=lambda o:o.name):
        if obj.type!='MESH' or obj in bone_shapes:continue
        evaluated=obj.evaluated_get(deps);mesh=evaluated.to_mesh(preserve_all_data_layers=True,depsgraph=deps)
        try:
            mesh.calc_loop_triangles();matrix=evaluated.matrix_world;normal_matrix=matrix.to_3x3().inverted().transposed()
            if abs(matrix.to_3x3().determinant())<1e-12:raise ValueError(f'{obj.name}: 零尺度变换')
            pos=[];norm=[];uv=[];tri=[];mats=[];source_vertices=[];source_faces=[]
            active_uv=mesh.uv_layers.active
            for face in mesh.loop_triangles:
                loops=list(face.loops)
                if matrix.to_3x3().determinant()<0:loops.reverse()
                ids=[]
                for li in loops:
                    vi=mesh.loops[li].vertex_index;ids.append(len(pos));source_vertices.append(vi)
                    pos.append(list(matrix@mesh.vertices[vi].co))
                    norm.append(list((normal_matrix@mesh.corner_normals[li].vector).normalized()))
                    uv.append(list(active_uv.data[li].uv) if active_uv else [0,0])
                tri.append(ids);mats.append(face.material_index);source_faces.append(face.polygon_index)
            parts.append({'name':obj.name,'positions':pos,'triangles':tri,
                'attributes':{'normals':norm,'uv':uv,'face_material':mats},
                'materials':[slot.material.name if slot.material else None for slot in obj.material_slots],
                'source':{'object':obj.name,'mesh':obj.data.name,'vertex':source_vertices,'polygon':source_faces,
                          'parent':obj.parent.name if obj.parent else None,'hide_render':obj.hide_render,'hide_viewport':obj.hide_viewport}})
        finally:evaluated.to_mesh_clear()
    payload={'schema':'glb-workbench/v1','units':'meter','axis':'Blender world: Z up; do not silently relabel Y up',
      'source_sha256':hashlib.sha256(src.read_bytes()).hexdigest(),'frame':a.frame,'parts':parts,
      'excluded_bone_display_helpers':[obj.name for obj in bone_shapes]}
    out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(payload,ensure_ascii=False),encoding='utf-8')
    print(f'EXPORTED {len(parts)} objects → {out}')

if __name__=='__main__':main()
