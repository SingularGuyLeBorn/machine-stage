import bpy
import bmesh
import base64
import array
import json
import math
import os
import sys
from mathutils import Vector
from mathutils.bvhtree import BVHTree

# ============================================================================
# Blender：整机单件补缝
#
# 1) 补开放边界：对原皮壳的边界环做 holes_fill（贴边、不凸出）。
# 2) 补甲片缝隙/脚部空档：用 1.0 倍实心外包络，取“离原皮表面 > threshold”
#    的下半身/髋部三角面，作为缝隙处的实心金属膜；胸甲彩虹区(y>yMax)和双手
#    区不取，避免盖住细节。
# 输出一份补面几何，供 app 追加到同一个 partId。不新增盒体/零件。
# ============================================================================

argv = sys.argv
argv = argv[argv.index("--") + 1 :] if "--" in argv else []
if len(argv) < 3:
    raise SystemExit("usage: blender -p patch.py -- <shell.json> <envelope.json> <patch.json> [threshold] [yMax]")
SHELL_JSON, ENV_JSON, OUT_JSON = argv[0], argv[1], argv[2]
THRESHOLD = float(argv[3]) if len(argv) > 3 else 0.004
Y_MAX = float(argv[4]) if len(argv) > 4 else 4.2


def log(*args):
    print("[whole-gaps]", *args, flush=True)


def f32(arr):
    return base64.b64encode(array.array("f", arr).tobytes()).decode()


def u32(arr):
    return base64.b64encode(array.array("I", arr).tobytes()).decode()


with open(SHELL_JSON, "r", encoding="utf-8") as f:
    shell = json.load(f)
sp = shell["positions"]
si = shell["indices"]
verts = [(sp[i], -sp[i + 2], sp[i + 1]) for i in range(0, len(sp), 3)]
faces = [(si[i], si[i + 1], si[i + 2]) for i in range(0, len(si), 3)]

bpy.ops.wm.read_factory_settings(use_empty=True)
mesh = bpy.data.meshes.new("shell")
mesh.from_pydata(verts, [], faces)
mesh.validate(verbose=False)
mesh.update()
obj = bpy.data.objects.new("shell", mesh)
bpy.context.collection.objects.link(obj)

bm = bmesh.new()
bm.from_mesh(mesh)
bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=1e-5)
bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
bm.edges.ensure_lookup_table()
boundary_before = sum(1 for e in bm.edges if e.is_boundary)
log("boundary before", boundary_before)

xs = [v.co.x for v in bm.verts]
ys = [v.co.y for v in bm.verts]
zs = [v.co.z for v in bm.verts]
center = Vector(((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2, (min(zs) + max(zs)) / 2))
# 模型坐标的包围盒中心，用于朝外判断。
model_center = Vector(((min(xs) + max(xs)) / 2, (min(zs) + max(zs)) / 2, -(min(ys) + max(ys)) / 2))

# BVH of the original shell for distance queries.
bvh = BVHTree.FromPolygons(verts, faces, all_triangles=True)

patch_positions = []
patch_normals = []
patch_indices = []
patch_map = {}


def add_triangle(a, b, c, n=None):
    if n is None:
        u = b - a
        v = c - a
        n = u.cross(v)
        if n.length < 1e-12:
            return
        n.normalize()
    base = len(patch_positions) // 3
    for point in (a, b, c):
        key = (round(point.x, 5), round(point.y, 5), round(point.z, 5))
        index = patch_map.get(key)
        if index is None:
            index = len(patch_positions) // 3
            patch_map[key] = index
            patch_positions.extend((point.x, point.y, point.z))
            patch_normals.extend((n.x, n.y, n.z))
        patch_indices.append(index)


# --- 1) 开放边界补面 ---
patch_faces = set()
for attempt in range(4):
    bm.edges.ensure_lookup_table()
    boundary = [e for e in bm.edges if e.is_boundary]
    if not boundary:
        break
    result = bmesh.ops.holes_fill(bm, edges=boundary, sides=0)
    added = result.get("faces", [])
    log("boundary fill", attempt, "faces", len(added))
    if not added:
        break
    patch_faces.update(added)
bm.edges.ensure_lookup_table()
boundary_after = sum(1 for e in bm.edges if e.is_boundary)
log("boundary after", boundary_after)

bm.faces.ensure_lookup_table()
bm.normal_update()
selected = [f for f in bm.faces if f in patch_faces]
for f in selected:
    f.normal_update()
    if f.normal.dot(f.calc_center_median() - center) < 0:
        f.normal_flip()
bmesh.ops.triangulate(bm, faces=selected)
bm.normal_update()
boundary_tris = 0
for face in selected:
    loop = [Vector((v.co.x, v.co.z, -v.co.y)) for v in face.verts]
    n = Vector((face.normal.x, face.normal.z, -face.normal.y))
    for i in range(1, len(loop) - 1):
        add_triangle(loop[0], loop[i], loop[i + 1], n)
        boundary_tris += 1
bm.free()
log("boundary patch tris", boundary_tris)

# --- 2) 甲片缝隙 / 脚部空档：1.0 实心外包络中远离原皮的面 ---
with open(ENV_JSON, "r", encoding="utf-8") as f:
    env = json.load(f)
ep = array.array("f")
ep.frombytes(base64.b64decode(env["position"]))
en = array.array("f")
en.frombytes(base64.b64decode(env["normal"]))
ei = array.array("I")
ei.frombytes(base64.b64decode(env["index"]))
env_positions = [
    Vector((ep[i], -ep[i + 2], ep[i + 1])) for i in range(0, len(ep), 3)
]  # model -> Blender (x,-z,y)
env_normals = [Vector((en[i], -en[i + 2], en[i + 1])) for i in range(0, len(en), 3)]
env_indices = ei
gap_tris = 0
gap_candidates = 0
for t in range(0, len(env_indices), 3):
    ia, ib, ic = env_indices[t], env_indices[t + 1], env_indices[t + 2]
    a, b, c = env_positions[ia], env_positions[ib], env_positions[ic]
    center_bl = (a + b + c) / 3
    model_x, model_y, model_z = center_bl.x, center_bl.z, -center_bl.y
    if model_y >= Y_MAX:
        continue
    # 双手区域保持原样，不把手指缝焊成一块。
    if 2.2 <= model_y <= 3.6 and abs(model_x) >= 1.15:
        continue
    hit = bvh.find_nearest(center_bl)
    if hit is None or hit[3] is None:
        continue
    gap_candidates += 1
    if hit[3] <= THRESHOLD:
        continue
    n = (b - a).cross(c - a)
    if n.length < 1e-12:
        continue
    n.normalize()
    face_center_model = Vector((center_bl.x, center_bl.z, -center_bl.y))
    n_model = Vector((n.x, n.z, -n.y))
    if n_model.dot(face_center_model - model_center) < 0:
        n_model.negate()
    add_triangle(
        Vector((a.x, a.z, -a.y)),
        Vector((b.x, b.z, -b.y)),
        Vector((c.x, c.z, -c.y)),
        n_model,
    )
    gap_tris += 1
log("gap candidates", gap_candidates, "gap tris", gap_tris, "threshold", THRESHOLD, "yMax", Y_MAX)

xs = patch_positions[0::3]
ys = patch_positions[1::3]
zs = patch_positions[2::3]
meta = {
    "source": "King_Joe whole shell boundary fill + solid envelope gap patches",
    "boundary_before": boundary_before,
    "boundary_after": boundary_after,
    "boundary_tris": boundary_tris,
    "gap_tris": gap_tris,
    "threshold": THRESHOLD,
    "y_max": Y_MAX,
    "tris": len(patch_indices) // 3,
    "verts": len(patch_positions) // 3,
    "bbox": [min(xs), min(ys), min(zs), max(xs), max(ys), max(zs)],
}
output = {"meta": meta, "position": f32(patch_positions), "normal": f32(patch_normals), "index": u32(patch_indices)}
os.makedirs(os.path.dirname(os.path.abspath(OUT_JSON)), exist_ok=True)
with open(OUT_JSON, "w", encoding="utf-8") as f:
    json.dump(output, f)
log("wrote", OUT_JSON, os.path.getsize(OUT_JSON) / 1024, "KB", meta)
