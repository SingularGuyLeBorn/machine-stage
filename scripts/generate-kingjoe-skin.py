#!/usr/bin/env python3
"""
生成金古桥真实网格的分件数据（个人参考，不商用）。

输入：
  · GLB：带 40 骨骼蒙皮的真实网格（POSITION/NORMAL/TEXCOORD_0/JOINTS_0/WEIGHTS_0）
  · OBJ：同一份网格的顶点/面（用于核对顶点顺序）
输出：
  · src/three/parts/models/kingjoe-skin/segments.generated.json

做法：
  1. 按面连通性切出 459 个独立壳（真实网格本身就是一堆分开的装甲/关节件）。
  2. 每个壳按蒙皮权重的主导骨骼 + 空间区域归类（大腿/小腿/足/骨盆/胸/头/臂/手/指）。
  3. Spine 壳在腹部/胸部/头部之间按面中心 y 分块；胸/头是四段飞船的切面。
  4. 每个块生成独立 partId 数据；几何写入所属模块的局部坐标。
  5. 材质按位置/关节带分配哑光银灰、深色关节、黑底。
"""

from __future__ import annotations

import argparse
import base64
import re
import json
import struct
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np

DEFAULT_GLB = Path(r"E:/Downloads/JGQ/kingjoe-glb/King_Joe.glb")
DEFAULT_OBJ = Path(r"D:/FunnyProjects/kingjoe-refs/kingjoe-mesh.obj")
DEFAULT_OUT = Path(__file__).resolve().parents[1] / "src/three/parts/models/kingjoe-skin/segments.generated.json"

MODULE_PIVOTS = {
    "legs": (0.0, 0.0, 0.0),
    "stomach": (0.0, 3.45, 0.0),
    "chest": (0.0, 4.55, 0.0),
    "ship": (0.0, 5.65, 0.0),
}
MODULE_NODES = {
    "legs": "KJLegsModule",
    "stomach": "KJStomachModule",
    "chest": "KJChestModule",
    "ship": "KJShipModule",
}

SEMANTIC_NAMES = {
    "thigh_l": ("左大腿", "left thigh"),
    "thigh_r": ("右大腿", "right thigh"),
    "calf_l": ("左小腿", "left calf"),
    "calf_r": ("右小腿", "right calf"),
    "foot_l": ("左足", "left foot"),
    "foot_r": ("右足", "right foot"),
    "hip_pod_l": ("左髋鼓", "left hip drum"),
    "hip_pod_r": ("右髋鼓", "right hip drum"),
    "pelvis": ("骨盆", "pelvis"),
    "abdomen_l": ("左腹甲", "left abdomen"),
    "abdomen_r": ("右腹甲", "right abdomen"),
    "torso_l": ("左胸甲", "left chest shell"),
    "torso_r": ("右胸甲", "right chest shell"),
    "shoulder_pod_l": ("左肩筒", "left shoulder pod"),
    "shoulder_pod_r": ("右肩筒", "right shoulder pod"),
    "clavicle_l": ("左锁骨", "left clavicle"),
    "clavicle_r": ("右锁骨", "right clavicle"),
    "upperarm_l": ("左上臂", "left upper arm"),
    "upperarm_r": ("右上臂", "right upper arm"),
    "forearm_l": ("左小臂", "left forearm"),
    "forearm_r": ("右小臂", "right forearm"),
    "hand_l": ("左手", "left hand"),
    "hand_r": ("右手", "right hand"),
    "elbow_guard_l": ("左肘护甲", "left elbow guard"),
    "elbow_guard_r": ("右肘护甲", "right elbow guard"),
    "wrist_guard_l": ("左腕护甲", "left wrist guard"),
    "wrist_guard_r": ("右腕护甲", "right wrist guard"),
    "head": ("头部", "head"),
    "head_detail": ("头部细节", "head detail"),
    "chest_detail_l": ("胸部细节", "chest detail"),
    "chest_detail_r": ("胸部细节", "chest detail"),
}

ASSEMBLY_OF = {
    "thigh_l": "legs", "thigh_r": "legs", "calf_l": "legs", "calf_r": "legs",
    "foot_l": "legs", "foot_r": "legs", "hip_pod_l": "legs", "hip_pod_r": "legs",
    "pelvis": "stomach", "abdomen_l": "stomach", "abdomen_r": "stomach",
    "torso_l": "chest", "torso_r": "chest",
    "shoulder_pod_l": "chest", "shoulder_pod_r": "chest",
    "clavicle_l": "chest", "clavicle_r": "chest",
    "upperarm_l": "chest", "upperarm_r": "chest",
    "forearm_l": "chest", "forearm_r": "chest",
    "hand_l": "chest", "hand_r": "chest",
    "elbow_guard_l": "chest", "elbow_guard_r": "chest",
    "wrist_guard_l": "chest", "wrist_guard_r": "chest",
    "head": "ship", "head_detail": "ship",
    "chest_detail_l": "chest", "chest_detail_r": "chest",
}
for side in ("l", "r"):
    for i in range(3):
        for seg, suffix in ((0, ""), (1, "_1"), (2, "_2")):
            key = f"finger{i}{suffix}_{side}"
            SEMANTIC_NAMES[key] = (f"{'左' if side == 'l' else '右'}手第{i + 1}指{seg + 1}节",
                                   f"{'left' if side == 'l' else 'right'} finger {i + 1} segment {seg + 1}")
            ASSEMBLY_OF[key] = "chest"

BONE_SEMANTIC = {
    "Bip001 L Thigh_03": "thigh_l",
    "Bip001 R Thigh_06": "thigh_r",
    "Bip001 L Calf_04": "calf_l",
    "Bip001 R Calf_07": "calf_r",
    "Bip001 L Foot_05": "foot_l",
    "Bip001 R Foot_08": "foot_r",
    "Bip001 L Clavicle_010": "clavicle_l",
    "Bip001 R Clavicle_027": "clavicle_r",
    "Bip001 L UpperArm_w_011": "upperarm_l",
    "Bip001 R UpperArm_w_028": "upperarm_r",
    "Bip001 LUpArmTwist_024": "upperarm_l",
    "Bip001 RUpArmTwist_040": "upperarm_r",
    "Bip001 LUpArmTwist1_025": "upperarm_l",
    "Bip001 RUpArmTwist1_041": "upperarm_r",
    "Bip001 L Forearm_012": "forearm_l",
    "Bip001 R Forearm_029": "forearm_r",
    "Bip001 L Hand_013": "hand_l",
    "Bip001 R Hand_030": "hand_r",
    "Bone002_026": "elbow_guard_l",
    "Bone004_042": "elbow_guard_r",
    "Bone003_023": "wrist_guard_l",
    "Bone005_039": "wrist_guard_r",
}


def parse_glb(path: Path):
    data = path.read_bytes()
    off = 12
    js = None
    bins = []
    while off < len(data):
        clen, ctype = struct.unpack_from("<II", data, off)
        off += 8
        chunk = data[off:off + clen]
        off += clen
        if ctype == 0x4E4F534A:
            js = json.loads(chunk)
        elif ctype == 0x004E4942:
            bins.append(chunk)
    if js is None:
        raise RuntimeError("GLB 缺少 JSON chunk")
    prim = js["meshes"][0]["primitives"][0]
    ctx = {"js": js, "bin": bins[0]}

    def get(ai: int):
        a = js["accessors"][ai]
        bv = js["bufferViews"][a["bufferView"]]
        start = bv.get("byteOffset", 0) + a.get("byteOffset", 0)
        n = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}[a["type"]]
        fmt, size = {5126: ("f", 4), 5125: ("I", 4), 5123: ("H", 2), 5121: ("B", 1)}[a["componentType"]]
        stride = bv.get("byteStride", n * size)
        return [struct.unpack_from("<" + fmt * n, ctx["bin"], start + k * stride) for k in range(a["count"])]

    pos = np.array(get(prim["attributes"]["POSITION"]), dtype=np.float64)
    nrm = np.array(get(prim["attributes"]["NORMAL"]), dtype=np.float64)
    uv = np.array(get(prim["attributes"]["TEXCOORD_0"]), dtype=np.float64)
    jt = np.array(get(prim["attributes"]["JOINTS_0"]), dtype=np.int32)
    wt = np.array(get(prim["attributes"]["WEIGHTS_0"]), dtype=np.float64)
    idx = np.array([x[0] for x in get(prim["indices"])], dtype=np.int32)
    joint_nodes = js["skins"][0]["joints"]
    names = [js["nodes"][j].get("name", f"joint{j}") for j in joint_nodes]
    return pos, nrm, uv, jt, wt, idx, names


def verify_obj(path: Path, pos: np.ndarray, idx: np.ndarray):
    if not path.exists():
        print(f"OBJ 不存在，跳过核对：{path}")
        return
    verts = []
    faces = []
    with path.open("r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            if line.startswith("v "):
                verts.append(tuple(float(x) for x in line.split()[1:4]))
            elif line.startswith("f "):
                toks = line.split()[1:]
                faces.append(tuple(int(t.split("/")[0]) - 1 for t in toks))
    if len(verts) != len(pos) or len(faces) * 3 != len(idx):
        print(f"OBJ 与 GLB 计数不同：obj v={len(verts)} f={len(faces)} / glb v={len(pos)} tri={len(idx)//3}")
        return
    vmax = np.abs(np.array(verts) - pos).max()
    # OBJ 可能包含四边形；仅核对顶点与三角形索引
    obj_tri = []
    for face in faces:
        if len(face) != 3:
            print("OBJ 含非三角面，跳过索引核对")
            break
        obj_tri.extend(face)
    else:
        imax = np.abs(np.array(obj_tri) - idx).max()
        print(f"OBJ 核对：顶点最大误差 {vmax:.6f}，索引最大误差 {imax}（0 表示同一份网格）")


def bone_weight_table(jt, wt, names):
    out = []
    for i in range(len(jt)):
        acc = defaultdict(float)
        for k in range(4):
            if wt[i, k] > 0:
                acc[names[int(jt[i, k])]] += float(wt[i, k])
        out.append(acc)
    return out


def component_faces(idx: np.ndarray):
    parent = list(range(7224))

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[rb] = ra

    for t in range(0, len(idx), 3):
        a, b, c = (int(idx[t]), int(idx[t + 1]), int(idx[t + 2]))
        union(a, b); union(b, c)
    roots = [find(i) for i in range(7224)]
    face_root = []
    comp_faces = defaultdict(list)
    for f, t in enumerate(range(0, len(idx), 3)):
        root = roots[int(idx[t])]
        face_root.append(root)
        comp_faces[root].append(f)
    return roots, face_root, comp_faces


def region_of_spine_face(centroid):
    x, y, z = centroid
    if abs(x) > 0.8 and y > 4.9:
        return "shoulder_pod_l" if x < 0 else "shoulder_pod_r"
    if y >= 5.65:
        return "head"
    if y >= 4.55:
        return "torso_l" if x < 0 else "torso_r"
    return "abdomen_l" if x < 0 else "abdomen_r"


def material_for(semantic, bbox):
    x0, y0, z0, x1, y1, z1 = bbox
    cx = (x0 + x1) / 2
    if y0 < 0.08 and y1 < 0.16:
        return "kjr_black"
    # 膝/踝/肘/腕的深色关节带
    if 0.25 < y0 and y1 < 0.78:
        return "kjr_dark"
    if 1.35 < y0 and y1 < 1.92 and 0.2 < abs(cx) < 1.2:
        return "kjr_dark"
    if 3.5 < y0 and y1 < 4.35 and 0.85 < abs(cx) < 1.55:
        return "kjr_dark"
    if 3.15 < y0 and y1 < 3.7 and 1.15 < abs(cx) < 1.9:
        return "kjr_dark"
    if semantic.startswith("finger"):
        return "kjr_silver_dark"
    if semantic in ("pelvis", "elbow_guard_l", "elbow_guard_r", "wrist_guard_l", "wrist_guard_r"):
        return "kjr_silver_dark"
    return "kjr_silver"


def encode_f32(arr):
    return base64.b64encode(np.asarray(arr, dtype="<f4").tobytes()).decode("ascii")


def encode_u32(arr):
    return base64.b64encode(np.asarray(arr, dtype="<u4").tobytes()).decode("ascii")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--glb", type=Path, default=DEFAULT_GLB)
    ap.add_argument("--obj", type=Path, default=DEFAULT_OBJ)
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = ap.parse_args()
    pos, nrm, uv, jt, wt, idx, names = parse_glb(args.glb)
    verify_obj(args.obj, pos, idx)
    wtable = bone_weight_table(jt, wt, names)
    roots, face_root, comp_faces = component_faces(idx)

    # finger 骨骼映射：Finger01 → 第1指第2节，Finger22 → 第3指第3节
    for nm in names:
        m = re.search(r"Finger(\d)(\d)?", nm)
        if not m:
            continue
        chain, seg = int(m.group(1)), int(m.group(2) or 0)
        side = "l" if " L " in f" {nm} " else "r"
        BONE_SEMANTIC[nm] = f"finger{chain}" + ("" if seg == 0 else f"_{seg}") + f"_{side}"

    # 组件级主导骨骼
    comp_info = {}
    for root, faces in comp_faces.items():
        verts = set()
        for f in faces:
            t = f * 3
            verts.update(int(x) for x in idx[t:t + 3])
        bone_sum = defaultdict(float)
        for v in verts:
            for bone, weight in wtable[v].items():
                bone_sum[bone] += weight
        bone = max(bone_sum, key=bone_sum.get) if bone_sum else "Bip001 Spine_09"
        pts = pos[list(verts)]
        bbox = [float(pts[:, 0].min()), float(pts[:, 1].min()), float(pts[:, 2].min()),
                float(pts[:, 0].max()), float(pts[:, 1].max()), float(pts[:, 2].max())]
        comp_info[root] = {"faces": faces, "verts": verts, "bone": bone, "bbox": bbox,
                           "bone_sum": dict(bone_sum)}

    # 每个面 → semantic：取该面三顶点权重和最大的骨骼，再按空间分躯干/胸/头
    face_semantic = {}
    for f, root in enumerate(face_root):
        t = f * 3
        tri = pos[idx[t:t + 3]]
        centroid = tri.mean(axis=0)
        bone_sum = defaultdict(float)
        for v in idx[t:t + 3]:
            for bone, weight in wtable[int(v)].items():
                bone_sum[bone] += weight
        bone = max(bone_sum, key=bone_sum.get) if bone_sum else comp_info[root]["bone"]
        if bone == "Bip001 Spine_09":
            sem = region_of_spine_face(centroid)
        elif bone == "Bip001 Pelvis_02":
            if centroid[1] < 3.55 and abs(centroid[0]) > 0.55:
                sem = "hip_pod_l" if centroid[0] < 0 else "hip_pod_r"
            else:
                sem = "pelvis"
        else:
            sem = BONE_SEMANTIC.get(bone)
            if sem is None:
                sem = "chest_detail_l" if centroid[0] < 0 else "chest_detail_r"
        face_semantic[f] = sem

    # 每个 (semantic, component) 一个 chunk；同一个 component 被 y 面切开也自然分块
    chunks = defaultdict(list)
    for f, root in enumerate(face_root):
        chunks[(face_semantic[f], root)].append(f)

    # 按 semantic 收集 chunk，主壳给 base key，其他 `_pN`
    sem_chunks = defaultdict(list)
    for (sem, root), faces in chunks.items():
        sem_chunks[sem].append((root, faces))
    parts = []
    counters = defaultdict(Counter)
    for sem, items in sem_chunks.items():
        items.sort(key=lambda it: len(it[1]), reverse=True)
        for i, (root, faces) in enumerate(items):
            key = sem if i == 0 else f"{sem}_p{i + 1}"
            info = comp_info[root]
            bbox = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9]
            verts = set()
            for f in faces:
                t = f * 3
                for v in idx[t:t + 3]:
                    verts.add(int(v))
                    for k in range(3):
                        bbox[k] = min(bbox[k], pos[v, k]); bbox[3 + k] = max(bbox[3 + k], pos[v, k])
            assembly = ASSEMBLY_OF.get(sem)
            if assembly is None:
                assembly = "chest"
                sem = "chest_detail_" + ("l" if bbox[0] < 0 else "r")
                key = sem if i == 0 else f"{sem}_p{i + 1}"
            pivot = np.array(MODULE_PIVOTS[assembly], dtype=np.float64)
            # 保留 chunk 内的原始顶点顺序
            ordered = []
            seen = set()
            for f in faces:
                t = f * 3
                for v in idx[t:t + 3]:
                    v = int(v)
                    if v not in seen:
                        seen.add(v); ordered.append(v)
            vmap = {v: i for i, v in enumerate(ordered)}
            local = pos[ordered] - pivot
            normals = nrm[ordered]
            uvs = uv[ordered]
            index = []
            for f in faces:
                t = f * 3
                index.extend(vmap[int(v)] for v in idx[t:t + 3])
            name_cn, name_en = SEMANTIC_NAMES.get(sem, (sem, sem))
            if i > 0:
                name_cn += f"装甲片 {i + 1}"
                name_en += f" plate {i + 1}"
            material = material_for(sem, bbox)
            parts.append({
                "key": key,
                "assembly": assembly,
                "node": MODULE_NODES[assembly],
                "semantic": sem,
                "bone": info["bone"],
                "name_cn": name_cn,
                "name_en": name_en,
                "material": material,
                "faces": len(faces),
                "verts": len(ordered),
                "bbox": [round(v, 4) for v in bbox],
                "position": encode_f32(local),
                "normal": encode_f32(normals),
                "uv": encode_f32(uvs),
                "index": encode_u32(index),
            })
    # 按 assembly 顺序排序
    order = {"legs": 0, "stomach": 1, "chest": 2, "ship": 3}
    parts.sort(key=lambda p: (order.get(p["assembly"], 9), p["semantic"], p["key"]))

    meta = {
        "source": "King_Joe GLB / OBJ（个人参考，不商用）",
        "source_glb": str(args.glb),
        "source_obj": str(args.obj),
        "model": "kingjoeskin",
        "vertices": int(len(pos)),
        "triangles": int(len(idx) // 3),
        "components": len(comp_faces),
        "module_pivots": MODULE_PIVOTS,
        "module_nodes": MODULE_NODES,
        "bbox": [round(float(pos[:, k].min()), 5) for k in range(3)] + [round(float(pos[:, k].max()), 5) for k in range(3)],
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps({"meta": meta, "parts": parts}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {args.out} ({args.out.stat().st_size / 1024:.1f} KB)")
    print(f"components={len(comp_faces)} parts={len(parts)} verts={len(pos)} tris={len(idx)//3}")
    by_ass = Counter(p["assembly"] for p in parts)
    print("assemblies", dict(by_ass))
    print("semantics", dict(Counter(p["semantic"] for p in parts).most_common(20)))
    missing = [s for s in ASSEMBLY_OF if s not in sem_chunks]
    print("semantics without chunks", missing)


if __name__ == "__main__":
    main()
