import bpy, json, numpy as np, os, math, sys, hashlib
requested = next((set(a.split("=",1)[1].split(",")) for a in sys.argv if a.startswith("--views=")),set())
from mathutils import Matrix, Vector
from pathlib import Path
root=str(Path(__file__).resolve().parents[1])
source_dir=Path(next((a.split('=',1)[1] for a in sys.argv if a.startswith('--mesh-dir=')),root+'/qa-out'))
output_dir=Path(next((a.split('=',1)[1] for a in sys.argv if a.startswith('--output-dir=')),root+'/qa-out'));output_dir.mkdir(parents=True,exist_ok=True)
meta=json.load(open(source_dir/'hmt-mesh.json',encoding='utf-8'))
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
materials={}
for name,spec in meta['materials'].items():
 m=bpy.data.materials.new(name);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF')
 rgb=[int(spec['base'].lstrip('#')[i:i+2],16)/255 for i in (0,2,4)]
 rgb=[v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in rgb]
 p.inputs['Base Color'].default_value=(*rgb,1);p.inputs['Metallic'].default_value=spec['metalness'];p.inputs['Roughness'].default_value=spec['roughness']
 if spec.get('pbr')=='brushed':
  nodes=m.node_tree.nodes;links=m.node_tree.links
  uv=nodes.new('ShaderNodeTexCoord');mapping=nodes.new('ShaderNodeVectorMath');mapping.operation='MULTIPLY';mapping.inputs[1].default_value=(*spec.get('repeat',[1,1]),1);links.new(uv.outputs['UV'],mapping.inputs[0])
  for suffix,kind in [('Roughness','roughness'),('NormalGL','normal')]:
   tex=nodes.new('ShaderNodeTexImage');tex.image=bpy.data.images.load(root+'/public/textures/metal/Metal009/Metal009_1K-JPG_'+suffix+'.jpg',check_existing=True);tex.image.colorspace_settings.name='Non-Color';links.new(mapping.outputs[0],tex.inputs['Vector'])
   if kind=='roughness':
    scale=nodes.new('ShaderNodeMath');scale.operation='MULTIPLY';scale.inputs[1].default_value=spec['roughness'];links.new(tex.outputs['Color'],scale.inputs[0]);links.new(scale.outputs[0],p.inputs['Roughness'])
   else:
    normal=nodes.new('ShaderNodeNormalMap');normal.inputs['Strength'].default_value=spec.get('normalScale',.55);links.new(tex.outputs['Color'],normal.inputs['Color']);links.new(normal.outputs[0],p.inputs['Normal'])
 if 'emissive' in spec:p.inputs['Emission Color'].default_value=(*rgb,1);p.inputs['Emission Strength'].default_value=spec.get('emissiveIntensity',1)
 materials[name]=m
f=open(source_dir/'hmt-mesh.bin','rb')
# glTF/Three Y up → Blender Z up, preserving handedness.
convert=Matrix(((1,0,0,0),(0,0,-1,0),(0,1,0,0),(0,0,0,1)))
mesh_cache={}
for number,p in enumerate(meta['pieces']):
 f.seek(p['offset']);n=p['vertices'];count=p['indices'];v=np.frombuffer(f.read(n*12),dtype='<f4').copy();norm=np.frombuffer(f.read(n*12),dtype='<f4').reshape(-1,3).copy();ind=np.frombuffer(f.read(count*4),dtype='<u4').copy()
 transform=convert@Matrix(np.asarray(p['matrix']).reshape(4,4).T.tolist())
 if p['id'].endswith('_r'):
  # 把镜像还原到共享几何，再通过对象矩阵还原镜像；顶点和 UV 不减精度。
  v.reshape(-1,3)[:,0]*=-1;norm[:,0]*=-1;ind=ind.reshape(-1,3)[:,[0,2,1]].ravel()
  transform=transform@Matrix.Diagonal((-1,1,1,1))
 print('piece',number,p['id'],n,count,flush=True)
 # 完全相同的网格共享数据块，零件对象、变换和拆解归属保持独立。
 digest=hashlib.sha256()
 for data in (v,norm,ind):digest.update(data.tobytes())
 if p.get('uvOffset') is not None:
  f.seek(p['uvOffset']);digest.update(f.read(n*8))
 digest.update(p['material'].encode());key=digest.hexdigest()
 if key in mesh_cache:
  obj=bpy.data.objects.new(p['id'],mesh_cache[key]);bpy.context.collection.objects.link(obj);obj.matrix_world=transform
  continue
 mesh=bpy.data.meshes.new(p['id']);mesh.vertices.add(n);mesh.vertices.foreach_set('co',v);mesh.loops.add(count);mesh.loops.foreach_set('vertex_index',ind);mesh.polygons.add(count//3);mesh.polygons.foreach_set('loop_start',np.arange(0,count,3,dtype=np.int32));mesh.polygons.foreach_set('loop_total',np.full(count//3,3,dtype=np.int32));mesh.polygons.foreach_set('use_smooth',np.ones(count//3,dtype=np.bool_));mesh.update(calc_edges=True)
 if p.get('uvOffset') is not None:
  f.seek(p['uvOffset']);uv=np.frombuffer(f.read(n*8),dtype='<f4').reshape(-1,2);layer=mesh.uv_layers.new(name='UVMap');layer.data.foreach_set('uv',uv[ind].ravel())
 # 只向面片质量正常的曲面传递源法线；零面积轴心面交给 Blender 自身处理。
 tri=ind.reshape(-1,3);coords=v.reshape(-1,3)
 area2=np.linalg.norm(np.cross(coords[tri[:,1]]-coords[tri[:,0]],coords[tri[:,2]]-coords[tri[:,0]]),axis=1)
 if np.all(area2>1e-12) or (p['layer']==4 and p['material'] in ('armor','darkArmor') and not p['id'].startswith('hmt.feet.')):
  mesh.normals_split_custom_set_from_vertices(norm.tolist())
 obj=bpy.data.objects.new(p['id'],mesh);bpy.context.collection.objects.link(obj);obj.matrix_world=transform;mesh.materials.append(materials[p['material']])
 mesh_cache[key]=mesh
 if number%250==0:print('import',number,flush=True)
f.close()
scene=bpy.context.scene
scene.render.engine='CYCLES';scene.cycles.samples=40;scene.cycles.use_denoising=True
if '--gpu' in sys.argv:
 preferences=bpy.context.preferences.addons['cycles'].preferences;preferences.compute_device_type='CUDA';preferences.get_devices()
 for device in preferences.devices:device.use=device.type=='CUDA'
 if not any(device.use for device in preferences.devices):raise RuntimeError('未发现 CUDA 渲染设备')
 scene.cycles.device='GPU'
scene.render.resolution_x=950;scene.render.resolution_y=1250;scene.render.resolution_percentage=100
scene.world.use_nodes=True;wn=scene.world.node_tree;wn.nodes.clear();out=wn.nodes.new('ShaderNodeOutputWorld');bg=wn.nodes.new('ShaderNodeBackground');env=wn.nodes.new('ShaderNodeTexEnvironment');env.image=bpy.data.images.load(root+r'\public\hdr\studio_small_08_1k.hdr');bg.inputs[1].default_value=.35;wn.links.new(env.outputs[0],bg.inputs[0]);wn.links.new(bg.outputs[0],out.inputs[0])
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.002));floor=bpy.context.object
mat=bpy.data.materials.new('floor');mat.use_nodes=True;mat.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(.055,.058,.062,1);mat.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=.7;floor.data.materials.append(mat)
def area(name,pos,power,size,sy):
 light=bpy.data.lights.new(name,'AREA');light.energy=power;light.shape='RECTANGLE';light.size=size;light.size_y=sy;obj=bpy.data.objects.new(name,light);bpy.context.collection.objects.link(obj);obj.location=pos;obj.rotation_euler=(Vector((0,0,1.3))-obj.location).to_track_quat('-Z','Y').to_euler()
area('softbox',(-2,-3,4),180,1.4,3.8);area('strip',(2,-1,2.4),90,.55,3.3);area('rim',(0,2,3.6),240,2.4,.65)
bpy.ops.object.camera_add();cam=bpy.context.object;scene.camera=cam;cam.data.type='ORTHO';cam.data.ortho_scale=2.8;cam.data.lens=70
scene.view_settings.view_transform='AgX'
cam.location=(3,-7,1.8);cam.rotation_euler=(Vector((0,0,1.18))-cam.location).to_track_quat('-Z','Y').to_euler()
if '--no-save' not in sys.argv:bpy.ops.wm.save_as_mainfile(filepath=str(output_dir/'hmt-current.blend'))
for name,pos in [('front',(0,-7,1.5)),('three-quarter',(3,-7,1.8)),('reference',(-4.8,-7,2.4)),('side',(7,0,1.5)),('back',(2,7,1.7))]:
 if requested and name not in requested:continue
 cam.location=pos;cam.rotation_euler=(Vector((0,0,1.18))-cam.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=str(output_dir/('hmt-'+name+'.png'));bpy.ops.render.render(write_still=True)

# 近景仍使用同一个实际模型，不修图，不替换零件。
for name,part,scale,offset in [('head','hmt.head.forehead',.45,(.5,-3,.7)),('head-side','hmt.head.forehead',.45,(3,-.7,.5)),('shoulder','hmt.shoulder.pauldron_l',.40,(1,-3,.3)),('waist','hmt.waist.vertebra_1',.53,(1,-3,.12)),('chest','hmt.chest.carapace',.87,(1,-4,.7)),('hand','hmt.hands.palm_l',.34,(.5,-3,.12)),('legs','hmt.legs.thigh_l',1.2,(1,-4,.1)),('head-back','hmt.head.occipital',.34,(.6,3,.35)),('back-detail','hmt.back.carapace',.88,(1,4,.4)),('waist-back','hmt.waist.rear_link_1',.50,(.6,3,.2)),('elbow','hmt.arms.upper_elbow_fork_l',.40,(.7,-3,.2)),('knee-back','hmt.legs.thigh_l',.66,(.8,4,.1))]:
 if requested and name not in requested:continue
 target=bpy.data.objects[part].matrix_world.translation.copy()
 if name=='legs':target.z-=.30
 if name=='knee-back':target.z-=.25
 cam.data.ortho_scale=scale;cam.location=target+Vector(offset);cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=str(output_dir/('hmt-'+name+'.png'));bpy.ops.render.render(write_still=True)

# 隐藏外甲与外表紧固件，检查同一装配中的驱动器、线束和承力骨架。
if not requested or 'internal' in requested:
 for p in meta['pieces']:bpy.data.objects[p['id']].hide_render=p['layer']>=4 or 'lining' in p['id']
 target=Vector((0,0,1.65));cam.data.ortho_scale=1.25;cam.location=target+Vector((2,-5,.6));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler()
 scene.render.filepath=str(output_dir/'hmt-internal.png');bpy.ops.render.render(write_still=True)
