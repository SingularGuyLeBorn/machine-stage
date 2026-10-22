import bpy
import bmesh
import json
import math
import os
import sys
from mathutils import Vector

# ============================================================================
# Blender：整机单件内部实心核
#
# 输入：整机单件的壳几何（scripts/export-kingjoe-whole-fill / 手工导出）
# 输出：一个闭合实体核（模型坐标，base64），供 app 把单件内部填满。
# 只做实体化，不切、不加外壳零件。
# ============================================================================

argv = sys.argv
argv = argv[argv.index("--") + 1 :] if "--" in argv else []
if len(argv) < 4:
    raise SystemExit("usage: blender -b -P blender-fill-whole.py -- <shell.json> <core.json> <voxel> <shrink> [render.jpg]")
IN_JSON, OUT_JSON = argv[0], argv[1]
VOXEL = float(argv[2])
SHRINK = float(argv[3])
RENDER = argv[4] if len(argv) > 4 else None


def log(*args):
    print("[whole-fill]", *args, flush=True)


def read_mesh():
    with open(IN_JSON, "r", encoding="utf-8") as f:
        data = json.load(f)
    p = data["positions"]
    idx = data["indices"]
    verts = [(p[i], -p[i + 2], p[i + 1]) for i in range(0, len(p), 3)]
    faces = [(idx[i], idx[i + 1], idx[i + 2]) for i in range(0, len(idx), 3)]
    return verts, faces


def make_object(verts, faces):
    mesh = bpy.data.meshes.new("whole_shell")
    mesh.from_pydata(verts, [], faces)
    mesh.validate(verbose=False)
    mesh.update()
    obj = bpy.data.objects.new("whole_shell", mesh)
    bpy.context.collection.objects.link(obj)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()
    return obj


def stats(mesh):
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.normal_update()
    boundary = sum(1 for e in bm.edges if len(e.link_faces) != 2)
    nonmanifold = sum(1 for e in bm.edges if len(e.link_faces) > 2)
    volume = bm.calc_volume(signed=True)
    tris = sum(len(f.verts) - 2 for f in bm.faces)
    bm.free()
    return {"verts": len(mesh.vertices), "faces": len(mesh.polygons), "tris": tris,
            "boundary_edges": boundary, "nonmanifold_edges": nonmanifold, "signed_volume": volume}


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.unit_settings.system = "METRIC"
    verts, faces = read_mesh()
    obj = make_object(verts, faces)
    log("shell", stats(obj.data))

    remesh = obj.modifiers.new("voxel", "REMESH")
    remesh.mode = "VOXEL"
    remesh.voxel_size = VOXEL
    remesh.use_smooth_shade = True
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.modifier_apply(modifier=remesh.name)
    log("remesh", stats(obj.data))

    smooth = obj.modifiers.new("smooth", "SMOOTH")
    smooth.factor = 0.5
    smooth.iterations = 6
    bpy.ops.object.modifier_apply(modifier=smooth.name)
    log("smooth", stats(obj.data))

    # 内缩，保证核藏在原皮里面；内部仍然是闭合实体。
    me = obj.data
    xs = [v.co.x for v in me.vertices]
    ys = [v.co.y for v in me.vertices]
    zs = [v.co.z for v in me.vertices]
    center = Vector(((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2, (min(zs) + max(zs)) / 2))
    for v in me.vertices:
        v.co = center + (v.co - center) * SHRINK
    me.update()
    log("shrunk", stats(me))

    bm = bmesh.new()
    bm.from_mesh(me)
    bm.normal_update()
    bm.faces.ensure_lookup_table()
    positions = []
    normals = []
    indices = []
    vertex_map = {}
    for face in bm.faces:
        loop_index = []
        for v in list(face.verts):
            x, y, z = v.co.x, v.co.z, -v.co.y
            n = v.normal
            key = (round(x, 5), round(y, 5), round(z, 5), round(n.x, 4), round(n.y, 4), round(n.z, 4))
            index = vertex_map.get(key)
            if index is None:
                index = len(positions) // 3
                vertex_map[key] = index
                positions.extend((x, y, z))
                normals.extend((n.x, n.z, -n.y))
            loop_index.append(index)
        for i in range(1, len(loop_index) - 1):
            indices.extend((loop_index[0], loop_index[i], loop_index[i + 1]))
    bm.free()

    xs = positions[0::3]
    ys = positions[1::3]
    zs = positions[2::3]
    meta = {
        "source": "King_Joe whole single-part shell → closed solid core",
        "voxel": VOXEL,
        "shrink": SHRINK,
        "verts": len(positions) // 3,
        "tris": len(indices) // 3,
        "bbox": [min(xs), min(ys), min(zs), max(xs), max(ys), max(zs)],
        "closed": stats(me)["boundary_edges"] == 0,
        "boundary_edges": stats(me)["boundary_edges"],
        "nonmanifold_edges": stats(me)["nonmanifold_edges"],
        "volume": stats(me)["signed_volume"],
    }
    f32 = lambda arr: __import__("base64").b64encode(__import__("array").array("f", arr).tobytes()).decode()
    u32 = lambda arr: __import__("base64").b64encode(__import__("array").array("I", arr).tobytes()).decode()
    output = {"meta": meta, "position": f32(positions), "normal": f32(normals), "index": u32(indices)}
    os.makedirs(os.path.dirname(os.path.abspath(OUT_JSON)), exist_ok=True)
    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(output, f)
    log("wrote", OUT_JSON, os.path.getsize(OUT_JSON) / 1024, "KB", meta)

    if RENDER:
        render(obj, RENDER)


def render(obj, path):
    grey = bpy.data.materials.new("core-grey")
    grey.use_nodes = True
    bsdf = grey.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (0.22, 0.25, 0.28, 1)
    bsdf.inputs["Metallic"].default_value = 0.6
    bsdf.inputs["Roughness"].default_value = 0.55
    obj.data.materials.append(grey)
    for poly in obj.data.polygons:
        poly.material_index = 0

    bpy.ops.mesh.primitive_plane_add(size=30, location=(0, 0, -0.02))
    bpy.context.object.data.materials.append(grey)
    bpy.ops.object.light_add(type="SUN", location=(4, -5, 9))
    bpy.context.object.data.energy = 4
    bpy.ops.object.light_add(type="AREA", location=(-4, -3, 6))
    bpy.context.object.data.energy = 900
    bpy.context.object.data.size = 8
    bpy.ops.object.camera_add(location=(7.5, -11, 6.5))
    cam = bpy.context.object
    cam.data.lens = 55
    target = Vector((0, 0, 3.2))
    cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.camera = cam
    world = bpy.data.worlds.new("World")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.82, 0.84, 0.87, 1)
    world.node_tree.nodes["Background"].inputs[1].default_value = 0.8
    bpy.context.scene.world = world
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 24
    scene.render.resolution_x = 900
    scene.render.resolution_y = 900
    scene.render.filepath = os.path.abspath(path)
    bpy.ops.render.render(write_still=True)
    log("rendered", os.path.abspath(path))


main()
