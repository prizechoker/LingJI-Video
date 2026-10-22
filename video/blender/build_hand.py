"""Build a rigged, realistic right hand from the MakeHuman base mesh (CC0) and export it as GLB.

Canonical frame (metres): wrist joint at the origin, a right hand lying flat, palm down, fingers away
from the viewer. In Blender (Z up) that is fingers +Y, palm -Z; after the glTF export (Y up) three.js
sees fingers -Z, palm -Y.
Bones: hand, f1_1..f1_3 (thumb), f2..f5 _1.._3 (index..little). Each bone's local X axis is
its flexion axis, so a positive rotation about X curls the finger toward the palm.
A vertex colour attribute marks the fingernails (R channel) for the skin shader.

run: /opt/venvs/blender/bin/python blender/build_hand.py
"""
import math
import os
import sys
from collections import defaultdict

import bpy
from mathutils import Matrix, Vector
from mathutils.geometry import intersect_point_line

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OBJ = os.path.join(ROOT, "assets/mh/base.obj")
OUT = os.path.join(ROOT, "assets/models/hand_mh_r.glb")

# ---------------------------------------------------------------- read the base mesh
V, VT, body = [], [], []
joint_ids = defaultdict(set)
cur = None
for line in open(OBJ):
    if line.startswith("v "):
        V.append(Vector(tuple(map(float, line.split()[1:4]))))
    elif line.startswith("vt "):
        VT.append(tuple(map(float, line.split()[1:3])))
    elif line.startswith("g "):
        cur = line[2:].strip()
    elif line.startswith("f "):
        toks = [t.split("/") for t in line.split()[1:]]
        vi = [int(t[0]) - 1 for t in toks]
        if cur == "body":
            ti = [int(t[1]) - 1 if len(t) > 1 and t[1] else -1 for t in toks]
            body.append((vi, ti))
        elif cur and cur.startswith("joint"):
            joint_ids[cur].update(vi)
J = {n[6:]: sum((V[i] for i in ids), Vector()) / len(ids) for n, ids in joint_ids.items()}  # 'joint-r-hand' -> 'r-hand'

wrist, elbow = J["r-hand"], J["r-elbow"]
fwd = (J["r-finger-3-1"] - wrist).normalized()
side = (J["r-finger-2-1"] - J["r-finger-5-1"]).normalized()  # little -> index
n = fwd.cross(side).normalized()
# palm side = the side the relaxed fingertips curl toward
a, b, tip = J["r-finger-3-1"], J["r-finger-3-2"], J["r-finger-3-4"]
straight = a + (b - a).normalized() * (tip - a).length
if (tip - straight).dot(n) < 0:
    n = -n
palm = n  # palm normal (points out of the palm)
side = palm.cross(fwd).normalized()  # re-orthogonalise

# canonical frame (Blender axes): fwd -> +Y, palm -> -Z, x completes a right-handed basis
R = Matrix((
    tuple(side),          # x <- palm x fwd
    tuple(fwd),           # y <- fingers
    tuple(-palm),         # z <- back of the hand (palm faces -Z)
))
S = 0.1  # MakeHuman units are decimetres


def tf(p):
    return (R @ (p - wrist)) * S


# ---------------------------------------------------------------- cut out hand + forearm
axis = (wrist - elbow).normalized()
keep_v = set()
for i, p in enumerate(V):
    if p.x > -3.0:  # stay on the right arm
        continue
    if (p - wrist).dot(axis) < -0.95:  # keep ~9.5 cm of forearm
        continue
    keep_v.add(i)
faces = [(vi, ti) for vi, ti in body if all(v in keep_v for v in vi)]
used = sorted({v for vi, _ in faces for v in vi})
remap = {v: k for k, v in enumerate(used)}
verts = [tf(V[v]) for v in used]
polys = [[remap[v] for v in vi] for vi, _ in faces]

bpy.ops.wm.read_factory_settings(use_empty=True)
me = bpy.data.meshes.new("hand")
me.from_pydata(verts, [], polys)
me.update()
uv = me.uv_layers.new(name="UVMap")
for poly, (vi, ti) in zip(me.polygons, faces):
    for li, t in zip(poly.loop_indices, ti):
        if t >= 0:
            uv.data[li].uv = VT[t]
ob = bpy.data.objects.new("Hand", me)
bpy.context.scene.collection.objects.link(ob)
bpy.context.view_layer.objects.active = ob
ob.select_set(True)
for p in me.polygons:
    p.use_smooth = True

# smooth it: one level of subdivision, applied
sub = ob.modifiers.new("sub", "SUBSURF")
sub.levels = sub.render_levels = 1
bpy.ops.object.modifier_apply(modifier="sub")
print("hand verts", len(ob.data.vertices), "faces", len(ob.data.polygons))

# ---------------------------------------------------------------- skeleton
Jt = {k: tf(v) for k, v in J.items() if k.startswith("r-")}
palm_t = Vector((0, 0, -1))
arm = bpy.data.armatures.new("HandRig")
rig = bpy.data.objects.new("HandRig", arm)
bpy.context.scene.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode="EDIT")
eb = arm.edit_bones
fore_dir = (tf(elbow) - tf(wrist)).normalized()
forearm = eb.new("forearm")
forearm.head = fore_dir * 0.09
forearm.tail = Vector((0, 0, 0))
forearm.align_roll(palm_t)
root = eb.new("hand")
root.head = Vector((0, 0, 0))
root.tail = Jt["r-finger-3-1"]
root.parent = forearm
root.align_roll(palm_t)
BONES = [("forearm", None), ("hand", None)]
for k in range(1, 6):
    parent = root
    for s in range(1, 4):
        h, t = Jt[f"r-finger-{k}-{s}"], Jt[f"r-finger-{k}-{s + 1}"]
        bn = eb.new(f"f{k}_{s}")
        bn.head, bn.tail = h, t
        bn.parent = parent
        bn.use_connect = s > 1
        # flexion axis: local Z toward the palm (thumb: toward the palm centre), so bending is about local X
        if k == 1:
            target = (palm_t + (Jt["r-finger-3-1"] * 0.5 - h).normalized() * 0.8).normalized()
        else:
            target = palm_t
        bn.align_roll(target)
        parent = bn
        BONES.append((bn.name, None))
bpy.ops.object.mode_set(mode="OBJECT")

# ---------------------------------------------------------------- skin weights (heat), then fingernail mask
bpy.ops.object.select_all(action="DESELECT")
ob.select_set(True)
rig.select_set(True)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.parent_set(type="ARMATURE_AUTO")
empty = [g.name for g in ob.vertex_groups if not any(g.index in [x.group for x in v.groups] for v in ob.data.vertices)]
print("vertex groups", len(ob.vertex_groups), "empty", empty)

col = ob.data.color_attributes.new(name="Col", type="FLOAT_COLOR", domain="POINT")
for v in ob.data.vertices:
    m = 0.0
    for k in range(1, 6):
        h, t = Jt[f"r-finger-{k}-3"], Jt[f"r-finger-{k}-4"]
        seg = t - h
        L = seg.length
        q, u = intersect_point_line(v.co, h, t)
        u = max(0.0, min(1.2, u))
        radial = v.co - (h + seg * min(u, 1.0))
        dorsal = radial.dot(Vector((0, 0, 1)))  # back of the hand is +Z
        lateral = radial - Vector((0, 0, 1)) * dorsal - seg.normalized() * radial.dot(seg.normalized())
        width = 0.0042 if k == 5 else 0.0052 if k == 1 else 0.0048
        # nail plate: dorsal surface, from ~35% along the distal phalanx to just past the tip
        along = max(0.0, 1.0 - abs(u - 0.78) / 0.42)
        across = max(0.0, 1.0 - (lateral.length / width) ** 2)
        up = 1.0 if dorsal > 0.0035 else max(0.0, (dorsal - 0.0015) / 0.002)
        m = max(m, min(1.0, along * 1.6) * across * up)
    col.data[v.index].color = (min(1.0, m), 0.0, 0.0, 1.0)

# ambient occlusion baked into the G channel (creases between the fingers, under the palm), rest pose
import addon_utils
addon_utils.enable("cycles", default_set=True)
sc = bpy.context.scene
sc.render.engine = "CYCLES"
sc.cycles.device = "CPU"
sc.cycles.samples = 64
ao = ob.data.color_attributes.new(name="AO", type="FLOAT_COLOR", domain="POINT")
ob.data.color_attributes.active_color = ao
mat = bpy.data.materials.new("bake")
mat.use_nodes = True
ob.data.materials.append(mat)
bpy.ops.object.select_all(action="DESELECT")
ob.select_set(True)
bpy.context.view_layer.objects.active = ob
bpy.ops.object.bake(type="AO", target="VERTEX_COLORS")
aov = [ao.data[i].color[0] for i in range(len(ob.data.vertices))]
print("ao range", round(min(aov), 3), round(max(aov), 3))
for i, a in enumerate(aov):
    c = col.data[i].color
    col.data[i].color = (c[0], a, 0.0, 1.0)
ob.data.color_attributes.active_color = col
ob.data.color_attributes.remove(ao)
ob.data.materials.clear()

bpy.ops.object.select_all(action="DESELECT")
ob.select_set(True)
rig.select_set(True)
os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", use_selection=True, export_skins=True,
                          export_animations=False, export_morph=False, export_vertex_color="ACTIVE", export_leaf_bone=True,
                          export_all_vertex_colors=True)
print("wrote", OUT, os.path.getsize(OUT))
print("forearm dir (blender axes):", tuple(round(c, 4) for c in fore_dir))
print("joints (m):", {k: tuple(round(c, 4) for c in v) for k, v in Jt.items() if k in ("r-hand", "r-finger-1-4", "r-finger-3-1", "r-finger-3-4", "r-finger-5-4")})
