"""Model the episode's home humanoid robot (original design) and export a posable GLB.

The body starts from the MakeHuman base mesh (CC0) so the proportions are human: it is reposed from the
A-pose to a relaxed standing pose with MakeHuman's own skin weights, cut into rigid segments at the joints,
and each segment is closed, remeshed and smoothed into a clean shell with rounded ends. Head, neck, joints
and soles are modelled on top.

Design: warm-grey knit soft goods over the torso, pelvis, upper arms and thighs; pearl-white shells on the
shoulders, forearms, hands, shins and feet; graphite joints; a dark glass face with soft light eyes.

Hierarchy: every joint is an empty named J_<joint>, its parts parented to it. Limb joints are world-aligned in
the rest pose; finger joints carry their own frame (local X = flexion axis, + curls toward the palm).
Meshes are named by material: W_ white shell, G_ graphite, K_ knit, V_ visor glass, R_ rubber, L_ light,
P_ dark pad. White hand parts carry a colour attribute: R = palm-side pad mask.
Blender axes: Z up, robot faces -Y, its left side is +X. (three.js after export: Y up, faces +Z.)

run: /opt/venvs/blender/bin/python blender/build_robot.py
"""
import json
import math
import os
from collections import defaultdict

import bpy  # noqa: I001  (bpy must be imported before bmesh)
import bmesh
import numpy as np
from mathutils import Matrix, Vector

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MH = os.path.join(ROOT, "assets/mh")
OUT = os.path.join(ROOT, "assets/models/robot_home.glb")
NB = 13380  # body vertices come first in base.obj

# ---------------------------------------------------------------- MakeHuman data (decimetres, Y up, faces +Z)
V, faces = [], []
cur = None
for line in open(os.path.join(MH, "base.obj")):
    if line.startswith("v "):
        V.append(tuple(map(float, line.split()[1:4])))
    elif line.startswith("g "):
        cur = line[2:].strip()
    elif line.startswith("f ") and cur == "body":
        faces.append([int(t.split("/")[0]) - 1 for t in line.split()[1:]])
V = np.array(V)
skel = json.load(open(os.path.join(MH, "default.mhskel")))
wts = json.load(open(os.path.join(MH, "default_weights.mhw")))["weights"]
BONES = sorted(wts)
BI = {b: i for i, b in enumerate(BONES)}
W = np.zeros((NB, len(BONES)))
for b, lst in wts.items():
    for vi, wt in lst:
        if vi < NB:
            W[vi, BI[b]] = wt
W /= W.sum(1, keepdims=True)


def jpos(name):
    return V[skel["joints"][name]].mean(0)


def head(b):
    return jpos(skel["bones"][b]["head"])


def tail(b):
    return jpos(skel["bones"][b]["tail"])


def unit(v):
    return v / np.linalg.norm(v)


def rot_between(a, b):
    a, b = unit(a), unit(b)
    v = np.cross(a, b)
    c = float(np.dot(a, b))
    if np.linalg.norm(v) < 1e-9:
        return np.eye(3)
    k = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]])
    return np.eye(3) + k + k @ k * (1 / (1 + c))


def axis_angle(axis, ang):
    x, y, z = unit(np.asarray(axis, float))
    c, s = math.cos(ang), math.sin(ang)
    C = 1 - c
    return np.array([[c + x * x * C, x * y * C - z * s, x * z * C + y * s],
                     [y * x * C + z * s, c + y * y * C, y * z * C - x * s],
                     [z * x * C - y * s, z * y * C + x * s, c + z * z * C]])


def signed_angle(a, b, axis):
    axis = unit(axis)
    a = unit(a - axis * np.dot(a, axis))
    b = unit(b - axis * np.dot(b, axis))
    return math.atan2(np.dot(np.cross(a, b), axis), np.dot(a, b))


def half_rotation(R):
    ang = math.acos(max(-1.0, min(1.0, (np.trace(R) - 1) / 2)))
    ax = np.array([R[2, 1] - R[1, 2], R[0, 2] - R[2, 0], R[1, 0] - R[0, 1]])
    return axis_angle(ax, ang * 0.5) if np.linalg.norm(ax) > 1e-9 else np.eye(3)


# ---------------------------------------------------------------- repose: A-pose -> relaxed standing (MH coords)
T = {}  # bone -> (R, pivot_old, pivot_new): v' = pivot_new + R (v - pivot_old)
J = {}  # rest-pose joint positions and a few directions (MH coords)
SIDES = {"L": 1, "R": -1}
WIDEN = 0.19  # shoulder joints from +-0.168 to +-0.2 m
DROP = np.array([0.0, -0.3, 0.0])  # elbow, forearm and hand 3 cm lower
for sd, s in SIDES.items():
    S, E, Wr = head(f"upperarm01.{sd}"), head(f"lowerarm01.{sd}"), head(f"wrist.{sd}")
    Ru = rot_between(E - S, np.array([s * 0.13, -1.0, -0.06]))
    E2 = S + Ru @ (E - S)
    tf = unit(np.array([s * 0.05, -1.0, 0.2]))  # forearm ~11 degrees forward
    Rf = rot_between(Ru @ (Wr - E), tf) @ Ru
    # palm normal of the A-pose hand; twist the forearm so the palm faces the thigh, a little backward
    fwd = unit(head(f"finger3-1.{sd}") - Wr)
    side = unit(head(f"finger2-1.{sd}") - head(f"finger5-1.{sd}"))
    n = unit(np.cross(fwd, side))
    a, b, tip = head(f"finger3-1.{sd}"), head(f"finger3-2.{sd}"), tail(f"finger3-3.{sd}")
    straight = a + unit(b - a) * np.linalg.norm(tip - a)
    palm = n if np.dot(tip - straight, n) > 0 else -n
    want = unit(np.array([-s * 1.0, 0.0, -0.35]))
    Rf = axis_angle(tf, signed_angle(Rf @ palm, want, tf)) @ Rf
    W2 = E2 + Rf @ (Wr - E)
    shift = np.array([S[0] * WIDEN, 0.0, 0.0])  # broader shoulders: the whole arm moves out
    S2, E2, W2 = S + shift, E2 + shift + DROP, W2 + shift + DROP  # and a longer upper arm
    for b in ("upperarm01", "upperarm02"):
        T[f"{b}.{sd}"] = (Ru, S, S2)
    for b in ("lowerarm01", "lowerarm02"):
        T[f"{b}.{sd}"] = (Rf, E, E2)
    for b in BONES:
        if b.endswith(f".{sd}") and b.startswith(("wrist", "metacarpal", "finger")):
            T[b] = (Rf, Wr, W2)
    T[f"shoulder01.{sd}"] = (half_rotation(Ru), S, S)  # the deltoid follows the arm half way
    J[f"shoulder_{sd}"], J[f"elbow_{sd}"], J[f"wrist_{sd}"] = S2, E2, W2
    J[f"palm_{sd}"] = Rf @ palm

    H, K, A = head(f"upperleg01.{sd}"), head(f"lowerleg01.{sd}"), head(f"foot.{sd}")
    Rt = rot_between(K - H, np.array([-s * 0.035, -1.0, 0.0]))
    K2 = H + Rt @ (K - H)
    Rs = rot_between(Rt @ (A - K), np.array([0.0, -1.0, -0.015])) @ Rt
    A2 = K2 + Rs @ (A - K)
    Rft = axis_angle((0, 1, 0), s * math.radians(6))
    for b in ("upperleg01", "upperleg02"):
        T[f"{b}.{sd}"] = (Rt, H, H)
    for b in ("lowerleg01", "lowerleg02"):
        T[f"{b}.{sd}"] = (Rs, K, K2)
    for b in BONES:
        if b.endswith(f".{sd}") and b.startswith(("foot", "toe")):
            T[b] = (Rft, A, A2)
    J[f"hip_{sd}"], J[f"knee_{sd}"], J[f"ankle_{sd}"] = H, K2, A2
    # finger joints (rest pose) and their flexion axes from MakeHuman's bone rotation planes
    for f in range(1, 6):
        for k in range(1, 4):
            bn = f"finger{f}-{k}.{sd}"
            J[f"f{f}{k}_{sd}"] = W2 + Rf @ (head(bn) - Wr)
            if k == 3:
                J[f"f{f}4_{sd}"] = W2 + Rf @ (tail(bn) - Wr)
            p = [jpos(x) for x in skel["planes"][f"{bn}____plane"]]
            J[f"flex{f}{k}_{sd}"] = Rf @ unit(np.cross(p[1] - p[0], p[2] - p[0]))

P = np.zeros((NB, 3))
for b, i in BI.items():
    if not W[:, i].any():
        continue
    if b in T:
        R, p0, p1 = T[b]
        P += W[:, i:i + 1] * ((V[:NB] - p0) @ R.T + p1)
    else:
        P += W[:, i:i + 1] * V[:NB]
LAB = np.array(BONES)[W.argmax(1)]
J["root"] = head("spine05")
J["neck"] = head("neck01")


# ---------------------------------------------------------------- Blender space (metres, Z up, faces -Y)
def bl(p):
    return Vector((p[0] * 0.1, -p[2] * 0.1, p[1] * 0.1))


def bld(d):
    return Vector((d[0], -d[2], d[1])).normalized()


PB = [bl(p) for p in P]
JB = {k: (bld(v) if k.startswith(("flex", "palm")) else bl(v)) for k, v in J.items()}

bpy.ops.wm.read_factory_settings(use_empty=True)
SC = bpy.context.scene


# ---------------------------------------------------------------- helpers
def link(ob, parent=None):
    SC.collection.objects.link(ob)
    if parent is not None:
        ob.parent = parent
        ob.matrix_parent_inverse = parent.matrix_world.inverted()
    return ob


def joint(name, loc, parent=None, frame=None):
    e = bpy.data.objects.new(f"J_{name}", None)
    e.empty_display_size = 0.03
    m = Matrix.Translation(loc)
    if frame is not None:
        m = m @ frame.to_4x4()
    link(e, parent)
    e.matrix_world = m
    bpy.context.view_layer.update()
    return e


def activate(ob):
    for o in SC.objects:
        o.select_set(False)
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)


def apply_mods(ob):
    activate(ob)
    for m in list(ob.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)


def smooth_shade(ob):
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


def finish(ob, sub=2, bevel=None, solid=None):
    if solid:
        m = ob.modifiers.new("solid", "SOLIDIFY")
        m.thickness = solid
        m.offset = 0
    if bevel:
        m = ob.modifiers.new("bevel", "BEVEL")
        m.width = bevel
        m.segments = 3
        m.limit_method = "ANGLE"
    if sub:
        m = ob.modifiers.new("sub", "SUBSURF")
        m.levels = m.render_levels = sub
    apply_mods(ob)
    return smooth_shade(ob)


def along(axis):
    """rotation taking +Z to axis"""
    return Vector((0, 0, 1)).rotation_difference(Vector(axis).normalized()).to_matrix()


def place(ob, loc, rot=None):
    if rot is not None:
        ob.data.transform(rot.to_4x4())
    ob.location = loc
    return ob


def new_prim(name, op, **kw):
    op(location=(0, 0, 0), **kw)
    ob = bpy.context.object
    ob.name = name
    return ob


def ellipsoid(name, r, loc, rot=None, segs=48, rings=24):
    ob = new_prim(name, bpy.ops.mesh.primitive_uv_sphere_add, segments=segs, ring_count=rings, radius=1)
    ob.data.transform(Matrix.Diagonal((*r, 1)))
    return smooth_shade(place(ob, loc, rot))


def cyl(name, r, depth, loc, axis=(0, 0, 1), segs=48, r2=None):
    if r2 is None:
        ob = new_prim(name, bpy.ops.mesh.primitive_cylinder_add, vertices=segs, radius=r, depth=depth)
    else:
        ob = new_prim(name, bpy.ops.mesh.primitive_cone_add, vertices=segs, radius1=r, radius2=r2, depth=depth)
    return place(ob, loc, along(axis))


def torus(name, R, r, loc, axis=(0, 0, 1)):
    ob = new_prim(name, bpy.ops.mesh.primitive_torus_add, major_radius=R, minor_radius=r, major_segments=72, minor_segments=14)
    return smooth_shade(place(ob, loc, along(axis)))


def loft(name, rings, segs=48, cap=(True, True)):
    """rings: [(z, rx, ry, cx, cy), ...] bottom->top; a smooth tube through elliptical sections."""
    bm = bmesh.new()
    loops = []
    for z, rx, ry, cx, cy in rings:
        loops.append([bm.verts.new((cx + rx * math.cos(2 * math.pi * k / segs), cy + ry * math.sin(2 * math.pi * k / segs), z)) for k in range(segs)])
    for i in range(len(loops) - 1):
        for k in range(segs):
            bm.faces.new((loops[i][k], loops[i][(k + 1) % segs], loops[i + 1][(k + 1) % segs], loops[i + 1][k]))
    if cap[0]:
        bm.faces.new(list(reversed(loops[0])))
    if cap[1]:
        bm.faces.new(loops[-1])
    me = bpy.data.meshes.new(name)
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    return link(bpy.data.objects.new(name, me))


def dome(name, r, loc, frame, cuts, thickness=0.005):
    """an ellipsoidal shell (radii r in `frame`) trimmed by planar cuts [(normal, d)]: keeps n . p >= d (local, unit-scaled)"""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=96, v_segments=48, radius=1.0)
    for n, d in cuts:
        n = Vector(n).normalized()
        bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=n * d, plane_no=n, clear_inner=True)
    bm.transform(Matrix.Diagonal((*r, 1)))
    bm.transform(frame.to_4x4())
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = link(bpy.data.objects.new(name, me))
    ob.location = loc
    so = ob.modifiers.new("solid", "SOLIDIFY")
    so.thickness, so.offset = thickness, -1.0
    bv = ob.modifiers.new("bevel", "BEVEL")
    bv.width, bv.segments, bv.limit_method, bv.angle_limit = thickness * 0.45, 3, "ANGLE", math.radians(40)
    apply_mods(ob)
    return smooth_shade(ob)


def reparent(ob, parent):
    bpy.context.view_layer.update()
    mw = ob.matrix_world.copy()
    ob.parent = parent
    ob.matrix_parent_inverse = parent.matrix_world.inverted()
    ob.matrix_world = mw
    return ob


# ---------------------------------------------------------------- body segments from the reposed mesh
FACE_LAB = [BONES[int(W[f].sum(0).argmax())] for f in faces]


def seg_dist(p, a, b):
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / ab.length_squared))
    return (p - (a + ab * t)).length


def body_part(name, core, near=(), axis=None, radius=0.0, planes=(), voxel=0.004, smooth=12, factor=0.6):
    """Cut a rigid segment out of the reposed body: faces labelled with `core` bones (plus `near` bones inside a
    capsule around `axis`), trimmed by `planes` [(point, normal)] keeping the normal side, closed, remeshed and
    smoothed into a shell with rounded ends."""
    core, near = set(core), set(near)
    bm = bmesh.new()
    vmap = {}
    for f, lab in zip(faces, FACE_LAB):
        if lab not in core:
            if lab not in near:
                continue
            c = sum((PB[i] for i in f), Vector()) / len(f)
            if axis is not None and seg_dist(c, *axis) > radius:
                continue
        vs = []
        for i in f:
            if i not in vmap:
                vmap[i] = bm.verts.new(PB[i])
            vs.append(vmap[i])
        try:
            bm.faces.new(vs)
        except ValueError:
            pass
    for co, no in planes:
        bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=co, plane_no=no, clear_inner=True)
    # largest connected piece only
    seen, comps = set(), []
    for f0 in bm.faces:
        if f0 in seen:
            continue
        stack, comp = [f0], []
        seen.add(f0)
        while stack:
            f = stack.pop()
            comp.append(f)
            for e in f.edges:
                for g in e.link_faces:
                    if g not in seen:
                        seen.add(g)
                        stack.append(g)
        comps.append(comp)
    comps.sort(key=len, reverse=True)
    for comp in comps[1:]:
        bmesh.ops.delete(bm, geom=comp, context="FACES")
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    bmesh.ops.holes_fill(bm, edges=bm.edges[:], sides=0)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = link(bpy.data.objects.new(name, me))
    rm = ob.modifiers.new("remesh", "REMESH")
    rm.mode = "VOXEL"
    rm.voxel_size = voxel
    rm.adaptivity = 0
    if smooth:
        sm = ob.modifiers.new("smooth", "SMOOTH")
        sm.factor = factor
        sm.iterations = smooth
    apply_mods(ob)
    return smooth_shade(ob)


def shell_from(src, name, planes, offset=0.004, thickness=0.004, bevel=0.0018, smooth=0):
    """a hard shell laid over part of another surface: the region kept by `planes`, lifted by `offset`."""
    bm = bmesh.new()
    bm.from_mesh(src.data)
    bm.transform(src.matrix_world)
    for co, no in planes:
        bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=co, plane_no=no, clear_inner=True)
    bm.normal_update()
    for v in bm.verts:
        v.co += v.normal * offset
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = link(bpy.data.objects.new(name, me))
    if smooth:  # relax the shell's own surface (its open rim stays put)
        sm = ob.modifiers.new("smooth", "LAPLACIANSMOOTH")
        sm.iterations, sm.lambda_factor, sm.use_volume_preserve, sm.use_normalized = smooth, 0.8, True, True
    so = ob.modifiers.new("solid", "SOLIDIFY")
    so.thickness, so.offset, so.use_rim = thickness, 1.0, True
    bv = ob.modifiers.new("bevel", "BEVEL")
    bv.width, bv.segments, bv.limit_method, bv.angle_limit = bevel, 2, "ANGLE", math.radians(50)
    apply_mods(ob)
    return smooth_shade(ob)


def plane(point, normal, offset=0.0):
    n = Vector(normal).normalized()
    return (Vector(point) + n * offset, n)


# ---------------------------------------------------------------- design: rounded-rectangle shell lofts
SEG = 64
Z0 = min(p.z for p in PB)  # the soles stand here


def H_(h):
    """height above the ground -> Blender z (before the final ground shift)"""
    return Z0 + h


def sec_points(a, b, n, segs=SEG):
    pts = []
    for k in range(segs):
        t = 2 * math.pi * k / segs
        c, s_ = math.cos(t), math.sin(t)
        pts.append((a * math.copysign(abs(c) ** (2 / n), c), b * math.copysign(abs(s_) ** (2 / n), s_)))
    return pts


def frame_along(d, side=Vector((1, 0, 0))):
    """local z along d, local x toward `side`; for a limb pointing down, local y is the robot's front"""
    d = d.normalized()
    x = (side - d * side.dot(d)).normalized()
    return Matrix((x, d.cross(x), d)).transposed()


DOWN = frame_along(Vector((0, 0, -1)))


def sloft(name, origin, frame, secs, ends=(0.5, 0.5), sub=2, segs=SEG, arc=None, thickness=0.004):
    """Loft through superellipse sections [(t, a, b, n, cx, cy)] stacked along the frame's z; rounded ends.
    With arc=(deg0, deg1) only that part of the way round is built (90 = local +y, the robot's front for limbs)
    and given a thickness inward: an armour plate."""
    secs = [list(x) for x in secs]

    def shrink(x, dt, k):
        return [x[0] + dt, x[1] * k, x[2] * k, x[3], x[4], x[5]]

    if ends[0]:
        r = min(secs[0][1], secs[0][2]) * ends[0]
        secs = [shrink(secs[0], -r, 0.42), shrink(secs[0], -r * 0.7, 0.8)] + secs
    if ends[1]:
        r = min(secs[-1][1], secs[-1][2]) * ends[1]
        secs = secs + [shrink(secs[-1], r * 0.7, 0.8), shrink(secs[-1], r, 0.42)]
    bm = bmesh.new()
    if arc is None:
        loops = [[bm.verts.new((x[4] + px, x[5] + py, x[0])) for px, py in sec_points(x[1], x[2], x[3], segs)] for x in secs]
        for i in range(len(loops) - 1):
            for k in range(segs):
                bm.faces.new((loops[i][k], loops[i][(k + 1) % segs], loops[i + 1][(k + 1) % segs], loops[i + 1][k]))
        bm.faces.new(list(reversed(loops[0])))
        bm.faces.new(loops[-1])
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    else:
        m = segs // 2 + 1
        ths = [math.radians(arc[0] + (arc[1] - arc[0]) * k / (m - 1)) for k in range(m)]

        def pt(x, t):
            c, s_ = math.cos(t), math.sin(t)
            return (x[4] + x[1] * math.copysign(abs(c) ** (2 / x[3]), c), x[5] + x[2] * math.copysign(abs(s_) ** (2 / x[3]), s_), x[0])
        loops = [[bm.verts.new(pt(x, t)) for t in ths] for x in secs]
        for i in range(len(loops) - 1):  # winding gives outward normals
            for k in range(m - 1):
                bm.faces.new((loops[i][k], loops[i][k + 1], loops[i + 1][k + 1], loops[i + 1][k]))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = link(bpy.data.objects.new(name, me))
    ob.data.transform(frame.to_4x4())
    ob.location = origin
    if sub:
        m = ob.modifiers.new("sub", "SUBSURF")
        m.levels = m.render_levels = sub
    if arc is not None:
        so = ob.modifiers.new("solid", "SOLIDIFY")
        so.thickness, so.offset, so.use_rim = thickness, -1.0, True
        bv = ob.modifiers.new("bevel", "BEVEL")
        bv.width, bv.segments, bv.limit_method, bv.angle_limit = thickness * 0.35, 2, "ANGLE", math.radians(50)
    apply_mods(ob)
    return smooth_shade(ob)


def armour(name, origin, frame, secs, arc, ends=(0.5, 0.5), core=0.94, parent=None, plates=None, plate_secs=None, plate_ends=None):
    """white armour plate(s) over a dark core of the same shape"""
    inner = [(t, a * core, b * core, n, cx, cy) for t, a, b, n, cx, cy in secs]
    reparent(sloft(f"D_{name}", origin, frame, inner, ends=ends), parent)
    for i, ar in enumerate(plates or [arc]):
        reparent(sloft(f"W_{name}{i or ''}", origin, frame, plate_secs or secs, ends=plate_ends or ends, arc=ar, thickness=0.0045), parent)


def mirror_arc(arc, s):
    return arc if s > 0 else (180 - arc[1], 180 - arc[0])


def band(name, origin, frame, t, a, b, n=2.6, h=0.008, cx=0.0, cy=0.0):
    """a thin ring band (accent stripe / rib) hugging a section"""
    return sloft(name, origin, frame, [(t - h / 2, a, b, n, cx, cy), (t + h / 2, a, b, n, cx, cy)], ends=(0.25, 0.25), sub=1)


def surface_point(ob, origin, direction):
    """first hit of a ray on an object (world space): (point, normal)"""
    bpy.context.view_layer.update()
    mi = ob.matrix_world.inverted()
    ok, loc, nrm, _ = ob.ray_cast(mi @ origin, (mi.to_3x3() @ direction).normalized())
    assert ok, f"ray missed {ob.name}"
    return ob.matrix_world @ loc, (ob.matrix_world.to_3x3() @ nrm).normalized()


def pill(name, at, normal, w, h, up=Vector((0, 0, 1)), depth=0.0012):
    """a rounded light/decal sitting on a surface"""
    ob = sloft(name, Vector(), Matrix.Identity(3), [(-depth / 2, w / 2, h / 2, 2.6, 0, 0), (depth / 2, w / 2, h / 2, 2.6, 0, 0)], ends=(0.2, 0.2), sub=1, segs=32)
    z = normal.normalized()
    x = up.cross(z).normalized()
    ob.data.transform(Matrix((x, z.cross(x), z)).transposed().to_4x4())
    ob.location = at + z * (depth * 0.5)
    return ob


# ---------------------------------------------------------------- skeleton (rest pose)
root = joint("root", JB["root"])
z_waist = H_(1.01)
spine = joint("spine", Vector((0, JB["root"].y, z_waist)), root)
neck_base = Vector((0, JB["neck"].y + 0.004, H_(1.415)))
neck = joint("neck", neck_base, spine)
headj = joint("head", neck_base + Vector((0, -0.004, 0.055)), neck)
cy0 = JB["root"].y  # body centre line (front-back)

# ---- head: helmet with a black glass face screen, soft eyes, ear lights
TOP = H_(1.685)
head_secs = [(0.01, 0.052, 0.062, 2.4, 0, -0.004), (0.028, 0.07, 0.083, 2.4, 0, -0.002), (0.06, 0.08, 0.094, 2.4, 0, 0),
             (0.1, 0.083, 0.098, 2.4, 0, 0), (0.14, 0.081, 0.096, 2.4, 0, 0.001), (0.17, 0.074, 0.088, 2.4, 0, 0.003),
             (0.193, 0.06, 0.074, 2.4, 0, 0.004), (0.205, 0.042, 0.054, 2.4, 0, 0.004)]
helmet = reparent(sloft("W_head", Vector((0, cy0 + 0.004, TOP)), DOWN, head_secs, ends=(0.42, 0.35)), headj)
hc = Vector((0, cy0 + 0.004, TOP - 0.105))
screen = shell_from(helmet, "V_face", [plane((0, hc.y - 0.03, 0), (0, -1, 0)), plane((0, 0, hc.z + 0.045), (0, 0, -1)),
                                      plane((0, 0, hc.z - 0.072), (0, 0, 1)), plane((0.071, 0, hc.z), (-1, 0, -0.12)),
                                      plane((-0.071, 0, hc.z), (1, 0, -0.12))], offset=0.0012, thickness=0.0025, bevel=0.001)
reparent(screen, headj)
for sd, s in SIDES.items():
    p, n = surface_point(screen, Vector((s * 0.029, hc.y - 0.3, hc.z + 0.006)), Vector((0, 1, 0)))
    reparent(pill(f"L_eye_{sd}", p, n, 0.021, 0.0145), headj)
    ear = Vector((s * 0.083, hc.y + 0.006, hc.z - 0.004))
    reparent(finish(cyl(f"G_ear_{sd}", 0.026, 0.016, ear, (s, 0, 0), r2=0.022), sub=1, bevel=0.003), headj)
    reparent(torus(f"T_earring_{sd}", 0.0195, 0.0017, ear + Vector((s * 0.0085, 0, 0)), (1, 0, 0)), headj)
# neck: graphite column with two rings
reparent(finish(cyl("G_neck", 0.031, 0.075, neck_base + Vector((0, -0.002, 0.03))), sub=1), neck)
for k in range(2):
    reparent(torus(f"D_neckring{k}", 0.0325, 0.004, neck_base + Vector((0, -0.002, 0.018 + k * 0.02))), neck)

# ---- torso: white chest plate, graphite ribbed core, white hip unit
chest_secs = [(0.0, 0.065, 0.055, 3.4, 0, 0), (0.012, 0.115, 0.074, 3.4, 0, 0.0), (0.04, 0.158, 0.088, 3.4, 0, 0.004),
              (0.085, 0.178, 0.096, 3.4, 0, 0.008), (0.145, 0.176, 0.098, 3.4, 0, 0.01), (0.205, 0.16, 0.094, 3.4, 0, 0.008),
              (0.26, 0.136, 0.088, 3.4, 0, 0.004), (0.3, 0.116, 0.082, 3.4, 0, 0.0)]
# chest plate front and back: from below the collar to the lower ribs, the collar and the flanks stay dark
plate = [(0.045, 0.16, 0.089, 3.4, 0, 0.0045), (0.085, 0.178, 0.096, 3.4, 0, 0.008), (0.145, 0.176, 0.098, 3.4, 0, 0.01),
         (0.205, 0.16, 0.094, 3.4, 0, 0.008), (0.245, 0.142, 0.09, 3.4, 0, 0.005)]
armour("chest", Vector((0, cy0, H_(1.43))), DOWN, chest_secs, None, ends=(0.14, 0.25), core=0.955, parent=spine,
       plates=[(16, 164), (200, 340)], plate_secs=plate, plate_ends=(0.18, 0.22))
chest = bpy.data.objects["W_chest"]
# status light strip, left chest
p, n = surface_point(chest, Vector((0.065, cy0 - 0.4, H_(1.305))), Vector((0, 1, 0)))
reparent(pill("T_status", p, n, 0.034, 0.0055), spine)
# battery pack on the back with vent slots
pb, nb = surface_point(bpy.data.objects["W_chest1"], Vector((0, cy0 + 0.4, H_(1.27))), Vector((0, -1, 0)))
pack = sloft("W_pack", Vector((0, pb.y - 0.006, H_(1.39))), DOWN,
             [(0.0, 0.1, 0.03, 3.4, 0, -0.02), (0.06, 0.104, 0.032, 3.4, 0, -0.022), (0.2, 0.1, 0.03, 3.4, 0, -0.02), (0.24, 0.09, 0.026, 3.4, 0, -0.018)], ends=(0.3, 0.3))
reparent(pack, spine)
for k in range(3):
    p, n = surface_point(pack, Vector((0, cy0 + 0.4, H_(1.345 - k * 0.016))), Vector((0, -1, 0)))
    reparent(pill(f"D_vent{k}", p, n, 0.12, 0.0055, depth=0.002), spine)
# core (abdomen): dark, with graphite ribs
reparent(sloft("D_core", Vector((0, cy0, H_(1.16))), DOWN, [(0.0, 0.1, 0.078, 2.6, 0, 0), (0.07, 0.092, 0.072, 2.6, 0, 0), (0.15, 0.1, 0.078, 2.6, 0, 0)], ends=(0, 0)), spine)
for k, h in enumerate((1.112, 1.088, 1.064)):
    reparent(band(f"G_rib{k}", Vector((0, cy0, H_(h))), DOWN, 0.0, 0.098, 0.077, h=0.008), spine)
reparent(band("G_waist", Vector((0, cy0, z_waist)), DOWN, 0.0, 0.114, 0.087, n=2.8, h=0.01), spine)
# hip unit
armour("pelvis", Vector((0, cy0, H_(1.0))), DOWN,
       [(0.0, 0.122, 0.084, 3.2, 0, 0), (0.04, 0.135, 0.09, 3.2, 0, 0.002), (0.09, 0.128, 0.086, 3.2, 0, 0.002),
        (0.12, 0.098, 0.07, 3.2, 0, 0)], None, ends=(0.2, 0.35), core=0.97, parent=root,
       plates=[(48, 132), (228, 312)], plate_secs=[(0.0, 0.122, 0.084, 3.2, 0, 0), (0.04, 0.135, 0.09, 3.2, 0, 0.002),
                                                   (0.068, 0.134, 0.089, 3.2, 0, 0.002)], plate_ends=(0.2, 0.3))

for sd, s in SIDES.items():
    S, E, Wr = JB[f"shoulder_{sd}"], JB[f"elbow_{sd}"], JB[f"wrist_{sd}"]
    du, df = (E - S).normalized(), (Wr - E).normalized()
    Lu, Lf = (E - S).length, (Wr - E).length
    pal = JB[f"palm_{sd}"]
    sh = joint(f"shoulder_{sd}", S, spine)
    el = joint(f"elbow_{sd}", E, sh)
    wr = joint(f"wrist_{sd}", Wr, el)
    # shoulder: graphite actuator under a white cap
    up = -du
    lat = Vector((s, 0, 0))
    lat = (lat - up * lat.dot(up)).normalized()
    frame = Matrix((lat, up.cross(lat), up)).transposed()
    reparent(dome(f"W_shcap_{sd}", (0.061, 0.064, 0.064), S + up * 0.006, frame, [((0, 0, 1), -0.25), ((1, 0, 0.35), -0.45)], 0.005), sh)
    reparent(ellipsoid(f"G_shoulder_{sd}", (0.052, 0.052, 0.052), S), sh)
    fu = frame_along(du)
    armour(f"upperarm_{sd}", S, fu, [(0.05, 0.048, 0.05, 2.6, 0, 0), (0.09, 0.052, 0.054, 2.6, 0, 0),
                                     (0.16, 0.049, 0.051, 2.6, 0, 0), (Lu - 0.04, 0.041, 0.043, 2.6, 0, 0)], mirror_arc((-115, 115), s), ends=(0.6, 0.6), parent=sh)
    reparent(band(f"A_armband_{sd}", S, fu, 0.066, 0.0515, 0.0535, h=0.012), sh)
    # elbow: graphite hinge with silver caps
    reparent(finish(cyl(f"G_elbow_{sd}", 0.035, 0.078, E, (1, 0, 0)), sub=1, bevel=0.005), el)
    for k in (-1, 1):
        reparent(finish(cyl(f"S_elbowcap{k}_{sd}", 0.022, 0.004, E + Vector((k * 0.04, 0, 0)), (1, 0, 0)), sub=1, bevel=0.0012), el)
    ff = frame_along(df)
    armour(f"forearm_{sd}", E, ff, [(0.035, 0.044, 0.047, 2.6, 0, 0), (0.075, 0.048, 0.05, 2.6, 0, 0),
                                    (0.14, 0.043, 0.044, 2.6, 0, 0), (Lf - 0.03, 0.032, 0.03, 2.6, 0, 0)], mirror_arc((-105, 105), s), ends=(0.6, 0.5), parent=el)
    reparent(band(f"A_forearmband_{sd}", E, ff, Lf - 0.052, 0.0365, 0.0355, h=0.014), el)
    reparent(torus(f"G_wristring_{sd}", 0.024, 0.0075, Wr - df * 0.004, df), wr)

    # ---- hand: palm + rigid phalanges from the human hand, palm-side pads marked in a colour attribute
    palm_planes = [plane(Wr, df, 0.004)]
    for f in range(2, 6):
        d1 = (JB[f"f{f}2_{sd}"] - JB[f"f{f}1_{sd}"]).normalized()
        palm_planes.append(plane(JB[f"f{f}1_{sd}"], -d1, 0.0018))
    palm = reparent(body_part(f"W_palm_{sd}", [f"wrist.{sd}"] + [f"metacarpal{i}.{sd}" for i in range(1, 5)],
                              [f"lowerarm02.{sd}"] + [f"finger{f}-1.{sd}" for f in range(1, 6)], (Wr, JB[f"f31_{sd}"]), 0.05,
                              palm_planes, voxel=0.0016, smooth=6), wr)
    palm["pad_dir"] = tuple(pal)
    palm["pad_axis"] = (*Wr, *JB[f"f31_{sd}"])
    palm["pad_off"] = 0.002
    for f in range(1, 6):
        par = wr
        for k in range(1, 4):
            a, b = JB[f"f{f}{k}_{sd}"], JB[f"f{f}{k + 1}_{sd}"]
            d = (b - a).normalized()
            fx = Vector(JB[f"flex{f}{k}_{sd}"])
            fx = (fx - d * fx.dot(d)).normalized()
            pad = fx.cross(d)  # rotating about +fx moves the segment toward `pad`
            ref = pal if f > 1 else (JB[f"f31_{sd}"] - a).normalized()
            if pad.dot(ref) < 0:
                fx, pad = -fx, -pad
            j = joint(f"f{f}{k}_{sd}", a, par, Matrix((fx, d, fx.cross(d))).transposed())
            pl = [plane(a, d, 0.0016)]
            if k < 3:
                nxt = (JB[f"f{f}{k + 2}_{sd}"] - b).normalized()
                pl.append(plane(b, -(d + nxt).normalized(), 0.0016))
            near = [f"finger{f}-{kk}.{sd}" for kk in (k - 1, k + 1) if 1 <= kk <= 3]
            if k == 1:
                near += [f"metacarpal{i}.{sd}" for i in range(1, 5)] + [f"wrist.{sd}"]
            seg = reparent(body_part(f"W_f{f}{k}_{sd}", [f"finger{f}-{k}.{sd}"], near, (a, b), 0.014 if f > 1 else 0.018, pl, voxel=0.0009, smooth=6), j)
            seg["pad_dir"] = tuple(pad)
            seg["pad_axis"] = (*a, *b)
            seg["pad_off"] = 0.0003
            if k > 1 or f > 1:  # knuckle: a small graphite hinge across the joint
                width = 0.017 if f > 1 else 0.019
                reparent(finish(cyl(f"G_knuckle{f}{k}_{sd}", 0.0052 if f > 1 else 0.006, width * 0.82, a, fx, segs=32), sub=1, bevel=0.0012), j)
            par = j

    # ---- leg
    Hp, K, A = JB[f"hip_{sd}"], JB[f"knee_{sd}"], JB[f"ankle_{sd}"]
    dt, ds = (K - Hp).normalized(), (A - K).normalized()
    Lt, Ls = (K - Hp).length, (A - K).length
    hp = joint(f"hip_{sd}", Hp, root)
    kn = joint(f"knee_{sd}", K, hp)
    an = joint(f"ankle_{sd}", A, kn)
    hipact = Vector((s * 0.148, Hp.y, Hp.z))
    reparent(finish(cyl(f"G_hip_{sd}", 0.05, 0.062, hipact, (1, 0, 0)), sub=1, bevel=0.006), hp)
    reparent(finish(cyl(f"A_hipcap_{sd}", 0.032, 0.005, hipact + Vector((s * 0.032, 0, 0)), (1, 0, 0)), sub=1, bevel=0.0015), hp)
    ft = frame_along(dt)
    armour(f"thigh_{sd}", Hp, ft, [(0.035, 0.074, 0.078, 2.8, 0, 0.004), (0.1, 0.08, 0.084, 2.8, 0, 0.006),
                                   (0.22, 0.072, 0.077, 2.8, 0, 0.004), (Lt - 0.065, 0.056, 0.06, 2.8, 0, 0.0)], mirror_arc((-35, 160), s), ends=(0.5, 0.6), parent=hp)
    reparent(finish(cyl(f"G_knee_{sd}", 0.048, 0.1, K, (1, 0, 0)), sub=1, bevel=0.007), kn)
    for k in (-1, 1):
        reparent(finish(cyl(f"S_kneecap{k}_{sd}", 0.029, 0.004, K + Vector((k * 0.051, 0, 0)), (1, 0, 0)), sub=1, bevel=0.0012), kn)
    kf = Matrix(((1, 0, 0), (0, 0, 1), (0, -1, 0))).transposed()  # local z -> forward (-Y)
    reparent(dome(f"W_kneecap_{sd}", (0.042, 0.05, 0.03), K + Vector((0, -0.03, 0.006)), kf, [((0, 0, 1), -0.05)], 0.0045), kn)
    fs = frame_along(ds)
    armour(f"shin_{sd}", K, fs, [(0.055, 0.05, 0.058, 2.8, 0, -0.006), (0.13, 0.052, 0.064, 2.8, 0, -0.012),
                                 (0.24, 0.044, 0.052, 2.8, 0, -0.005), (Ls - 0.055, 0.034, 0.037, 2.8, 0, 0)], (-18, 198), ends=(0.5, 0.5), parent=kn)
    reparent(band(f"A_shinband_{sd}", K, fs, Ls - 0.08, 0.0385, 0.0425, n=2.8, h=0.014), kn)
    reparent(finish(cyl(f"G_ankle_{sd}", 0.028, 0.072, A, (1, 0, 0)), sub=1, bevel=0.004), an)
    # foot: rounded shoe shell on a rubber sole, toes out a little
    toe = Vector((s * math.sin(math.radians(6)), -math.cos(math.radians(6)), 0))
    ffr = frame_along(toe)  # local x = +X, local y = up
    fo = Vector((A.x, A.y, Z0))
    shoe = [(-0.07, 0.04, 0.032, 2.8, 0, 0.04), (-0.03, 0.046, 0.04, 2.8, 0, 0.046), (0.03, 0.05, 0.034, 2.8, 0, 0.04),
            (0.09, 0.05, 0.026, 2.8, 0, 0.032), (0.14, 0.044, 0.019, 2.8, 0, 0.026)]
    reparent(sloft(f"W_foot_{sd}", fo, ffr, shoe, ends=(0.5, 0.6)), an)
    reparent(sloft(f"R_sole_{sd}", fo, ffr, [(t, a + 0.003, 0.008, 3.2, 0, 0.008) for t, a, b, n, cx, cy in shoe], ends=(0.35, 0.4), sub=1), an)


# ---------------------------------------------------------------- pad masks (white hand parts)
bpy.context.view_layer.update()
for ob in SC.objects:
    if ob.type == "MESH" and "pad_dir" in ob:
        # the pad is the palm-side half of the part: signed distance from its mid-plane along the pad direction
        pd = Vector(ob["pad_dir"])
        ax = ob["pad_axis"]
        a, b = Vector(ax[:3]), Vector(ax[3:])
        off = ob["pad_off"]
        col = ob.data.color_attributes.new(name="Col", type="FLOAT_COLOR", domain="POINT")
        mw = ob.matrix_world
        for v in ob.data.vertices:
            p = mw @ v.co
            ab = b - a
            t = max(0.0, min(1.0, (p - a).dot(ab) / ab.length_squared))
            d = (p - (a + ab * t)).dot(pd) - off
            m = max(0.0, min(1.0, d / 0.0016 + 0.5))
            col.data[v.index].color = (m * m * (3 - 2 * m), 0.0, 0.0, 1.0)
        ob.data.color_attributes.active_color = col

# stand on the ground
zmin = min((ob.matrix_world @ v.co).z for ob in SC.objects if ob.type == "MESH" for v in ob.data.vertices)
root.location.z -= zmin
bpy.context.view_layer.update()

# ---------------------------------------------------------------- export
for o in SC.objects:
    o.select_set(True)
os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", use_selection=True, export_apply=True, export_materials="NONE",
                          export_vertex_color="ACTIVE", export_all_vertex_colors=True, export_extras=True)
tris = sum(len(o.data.polygons) for o in SC.objects if o.type == "MESH")
top = max((ob.matrix_world @ v.co).z for ob in SC.objects if ob.type == "MESH" for v in ob.data.vertices)
print("wrote", OUT, os.path.getsize(OUT), "faces", tris, "objects", len(SC.objects), "height", round(top, 3))
