"""Model the episode's home robot: a slender, gender-neutral humanoid in the manner of the Tesla Bot concept — a white
satin body with fine panel seams, and a glossy black head, neck and shoulder yoke.

The figure comes from Blender's CC0 Human Base Meshes bundle, whose realistic male and female bodies share one
topology. It is a blend of the two (the male's chest, so it is flat; the female's crotch, so it is smooth), with
slightly longer legs (the navel near 0.618 of the height), the arms lowered close to the body, slimmer arms, thighs and
waist, and chest, back, seat, knees and neck smoothed into clean surfaces. The head and the boots are designed: a
featureless mannequin head with a human head's proportions (cranium, flattened face, a jaw tapering to the chin) and
smooth flat-soled boots, both built from blended smooth solids so their glossy surfaces reflect cleanly.

Shader data for engine2/bot.js in COLOR_0, each channel a signed distance d in metres stored as 0.5 + d / 0.1:
  body   r = the black yoke (d > 0 inside)   g = the front panel (lines from the armpits over the hips to the knees)
         b = the abdomen panel, shin and forearm bands   a = the armholes
  head   r = black everywhere   g = the face plate (drawn only if the material asks)
  shoes  r = white   g = the sole's edge
Panels are regions with d < 0; a seam is drawn where |d| is small. Each channel holds non-touching regions only, so the
per-vertex values interpolate cleanly across every triangle.

Needs the bundle in assets/hbm/ (tools/fetch_assets.sh).
run: /opt/venvs/blender/bin/python blender/build_bot.py
"""
import math
import os

import bpy  # noqa: I001
import bmesh
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BUNDLE = os.path.join(ROOT, "assets/hbm/human_base_meshes_bundle.blend")
OUT = os.path.join(ROOT, "assets/models/bot.glb")
H0 = 1.69  # both bodies are scaled to this height before they are blended
DEBUG = os.environ.get("BOT_DEBUG")

bpy.ops.wm.open_mainfile(filepath=BUNDLE, load_ui=False, use_scripts=False)


def evaluated(name, level):
    o = bpy.data.objects[name]
    for m in o.modifiers:
        if m.type in ("MULTIRES", "SUBSURF"):
            m.levels = level
    me = bpy.data.meshes.new_from_object(o.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    me.transform(o.matrix_world)
    return me


me = evaluated("GEO-body_male_realistic", 1)
fe = evaluated("GEO-body_female_realistic", 1)
for o in list(bpy.data.objects):
    bpy.data.objects.remove(o)
SC = bpy.context.scene


def arrays(me):
    n = len(me.vertices)
    P = np.empty(n * 3)
    me.vertices.foreach_get("co", P)
    E = np.empty(len(me.edges) * 2, dtype=np.int64)
    me.edges.foreach_get("vertices", E)
    return P.reshape(n, 3), E.reshape(-1, 2)


def normalised(P):
    P = P - np.array([P[:, 0].mean(), 0.0, P[:, 2].min()])
    return P * (H0 / P[:, 2].max())


def sstep(v, a, b):
    t = np.clip((v - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def ball(P, c, r0, r1):
    """1 within r0 of c, 0 beyond r1"""
    return 1 - sstep(np.linalg.norm(P - np.asarray(c, float), axis=1), r0, r1)


def unit(v):
    return v / np.linalg.norm(v)


class Smoother:
    """umbrella-operator smoothing on a mesh's vertex graph"""

    def __init__(self, E, n):
        self.E = E
        self.deg = np.maximum(np.bincount(E.ravel(), minlength=n).astype(float), 1)

    def lap(self, X):
        acc = np.zeros_like(X)
        np.add.at(acc, self.E[:, 0], X[self.E[:, 1]])
        np.add.at(acc, self.E[:, 1], X[self.E[:, 0]])
        return acc / self.deg[:, None] - X

    def relax(self, X, w, iters, lam=0.5):
        w = np.asarray(w, float)[:, None]
        for _ in range(iters):
            X += lam * w * self.lap(X)

    def taubin(self, X, w, iters, lam=0.5, mu=-0.53):
        w = np.asarray(w, float)[:, None]
        for i in range(iters):
            X += (lam if i % 2 == 0 else mu) * w * self.lap(X)

    def thin_plate(self, X, free, iters, lam=0.06):
        """fair the free vertices: minimise the squared Laplacian with the rest held, so a hole is filled smoothly
        and tangent-continuously with its surroundings (a membrane first, which converges much faster)"""
        f = np.asarray(free, float)[:, None]
        for _ in range(iters // 4):
            X += 0.5 * f * self.lap(X)
        for _ in range(iters):
            X -= lam * f * self.lap(self.lap(X))


# ---------------------------------------------------------------- the blend
Pm, E = arrays(me)
Pm = normalised(Pm)
Pf = normalised(arrays(fe)[0])
n = len(Pm)
S = Smoother(E, n)
wm = np.full(n, 0.55)
for s in (1, -1):  # the male chest: flat, no breasts to remove
    wm += (1 - wm) * ball(Pm, (s * 0.085, -0.1, 1.22), 0.08, 0.14)
wm *= 1 - ball(Pm, (0, -0.06, 0.77), 0.075, 0.12)  # the female crotch: smooth
# the two bodies' vertex orders disagree at a few fingertips and toes: there, the male's alone
wm += (1 - wm) * np.maximum(sstep(np.abs(Pm[:, 0]), 0.28, 0.33), 1 - sstep(Pm[:, 2], 0.03, 0.06))
P = wm[:, None] * Pm + (1 - wm[:, None]) * Pf
x, y, z = P[:, 0], P[:, 1], P[:, 2]  # views: P is only ever changed in place


def transfer(J):
    """a joint located on the male figure, carried along with the flesh around it into the blend"""
    sel = np.linalg.norm(Pm - J, axis=1) < 0.07
    return J + (P[sel] - Pm[sel]).mean(0)


def rot_y(pivot, angle, w):
    """turn about +Y through pivot by angle * w (per vertex); a positive angle turns +X toward -Z"""
    a = angle * w
    ca, sa = np.cos(a), np.sin(a)
    rx, rz = P[:, 0] - pivot[0], P[:, 2] - pivot[2]
    P[:, 0] = pivot[0] + ca * rx + sa * rz
    P[:, 2] = pivot[2] - sa * rx + ca * rz


def rot_y_point(p, pivot, angle):
    ca, sa = math.cos(angle), math.sin(angle)
    rx, rz = p[0] - pivot[0], p[2] - pivot[2]
    return np.array([pivot[0] + ca * rx + sa * rz, p[1], pivot[2] - sa * rx + ca * rz])


# ---------------------------------------------------------------- arms: lowered close to the body
JOINTS = {}
ARM = np.zeros(n)  # 1 on the arms (they ride along rigidly when the legs are lengthened)
for s in (1, -1):
    shoulder = transfer(np.array([s * 0.185, 0.0, 1.405]))
    elbow = transfer(np.array([s * 0.292, 0.0, 1.095]))
    wrist = transfer(np.array([s * 0.41, -0.105, 0.82]))
    hand_end = wrist + unit(wrist - elbow) * 0.2

    def near(a, b, r):
        """1 within r of the segment a-b (the limb), fading to 0 over 2 cm"""
        ab = b - a
        t_ = np.clip((P - a) @ ab / (ab @ ab), 0, 1)
        return 1 - sstep(np.linalg.norm(P - (a + np.outer(t_, ab)), axis=1), r, r + 0.02)

    fore = np.maximum(near(elbow, wrist, 0.075), near(wrist, hand_end, 0.12)) * (s * x > 0.1)  # (the thumb too)
    arm = np.maximum(near(shoulder, elbow, 0.065), fore)
    ARM = np.maximum(ARM, arm)
    a1 = s * math.radians(11.5)  # the hanging arm swings in toward the body
    rot_y(shoulder, a1, sstep((P - shoulder) @ unit(elbow - shoulder), -0.025, 0.075) * arm)
    elbow, wrist = rot_y_point(elbow, shoulder, a1), rot_y_point(wrist, shoulder, a1)
    hand_end = rot_y_point(hand_end, shoulder, a1)
    a2 = s * math.radians(11.0)
    rot_y(elbow, a2, sstep((P - elbow) @ unit(wrist - elbow), -0.03, 0.035) * fore)
    JOINTS[s] = {"shoulder": shoulder, "elbow": elbow, "wrist": rot_y_point(wrist, elbow, a2)}

# ---------------------------------------------------------------- body: neutral and clean
fwd = -y


def fit_front(sel, u, v, h, deg_u=4, deg_v=4, rounds=5, clip_hi=0.003):
    """a smooth polynomial surface h(u, v) through the selection, ignoring bumps that stand proud of it"""
    U, Vv, Hh = u[sel], v[sel], h[sel]

    def basis(U, Vv):
        return np.stack([U ** i * Vv ** j for i in range(0, deg_u + 1, 2) for j in range(deg_v + 1)], 1)

    w = np.ones(len(U))
    for _ in range(rounds):
        c = np.linalg.lstsq(basis(U, Vv) * w[:, None], Hh * w, rcond=None)[0]
        w = np.where(Hh - basis(U, Vv) @ c > clip_hi, 0.05, 1.0)
    return lambda U, Vv: basis(U, Vv) @ c


# chest and abdomen: no pecs, no abs, no navel
tf = fit_front((z > 0.92) & (z < 1.4) & (fwd > 0.0) & (np.abs(x) < 0.19) & (ARM < 0.3), x, z - 1.16, fwd, deg_u=6)
wt = sstep(fwd, 0.0, 0.03) * sstep(z, 0.92, 0.98) * (1 - sstep(z, 1.35, 1.4)) * (1 - sstep(np.abs(x), 0.15, 0.19)) * (ARM < 0.3)
P[:, 1] = y + (-tf(x, z - 1.16) - y) * wt
# the upper back: no shoulder blades or spine, one smooth panel
bf = fit_front((z > 1.0) & (z < 1.38) & (y > 0.0) & (np.abs(x) < 0.17) & (ARM < 0.3), x, z - 1.2, y, deg_u=6)
wb = sstep(y, 0.0, 0.03) * sstep(z, 1.0, 1.06) * (1 - sstep(z, 1.33, 1.38)) * (1 - sstep(np.abs(x), 0.13, 0.17)) * (ARM < 0.3)
P[:, 1] = y + (bf(x, z - 1.2) - y) * wb
S.taubin(P, (z > 0.85) & (z < 1.44) & (np.abs(x) < 0.21), 30)
# the pelvis front: one smooth surface, no mound, the groin creases filled
pf = fit_front((z > 0.78) & (z < 0.98) & (fwd > -0.01) & (np.abs(x) < 0.13) & (ARM < 0.5), x, z - 0.88, fwd, deg_u=4, deg_v=3)
wt = sstep(fwd, -0.01, 0.02) * sstep(z, 0.77, 0.81) * (1 - sstep(z, 0.95, 0.99)) * (1 - sstep(np.abs(x), 0.1, 0.13)) * (ARM < 0.5)
P[:, 1] = y + np.minimum(-pf(x, z - 0.88) - y, 0.0) * wt  # (only ever outward, toward the viewer)
# the seat: half as much of it (the bulge beyond a line from the back of the thigh to the small of the back)
y_line = np.interp(z, [0.7, 1.03], [0.063, 0.052])
seat = sstep(z, 0.7, 0.76) * (1 - sstep(z, 0.98, 1.04)) * (1 - sstep(np.abs(x), 0.14, 0.18)) * (ARM < 0.5)
P[:, 1] = y - 0.5 * np.maximum(y - y_line, 0) * seat
# the abdomen no further forward than the lower chest: most of what stands in front of that line goes
line = np.interp(z, [0.86, 0.91, 0.97, 1.04, 1.12, 1.2], [-0.102, -0.111, -0.118, -0.123, -0.127, -0.128])
ahead = 0.004 * np.logaddexp(0, (line - y) / 0.004)  # (a soft max(0, .), so no crease where it starts)
P[:, 1] = y + 0.75 * ahead * sstep(z, 0.85, 0.9) * (1 - sstep(z, 1.14, 1.22)) * (ARM < 0.3)
S.taubin(P, (np.abs(x) < 0.05) * sstep(z, 0.63, 0.66) * (1 - sstep(z, 0.8, 0.84)) * sstep(-y, 0.02, 0.05), 80)
S.taubin(P, ARM * (z > 0.75), 90)  # arms: soft, not muscular
S.taubin(P, ARM * (z < 0.8), 12)  # hands: no knuckle creases or nails
S.taubin(P, (z > 0.36) * (z < 0.62) * (ARM < 0.5), 24)  # knees: no kneecap detail
S.taubin(P, (z > 0.68) * (z < 1.05) * (ARM < 0.5), 20)  # pelvis and seat
S.relax(P, (1 - sstep(np.abs(x), 0.02, 0.045)) * sstep(y, 0.02, 0.05) * sstep(z, 0.74, 0.78) * (1 - sstep(z, 0.95, 1.0)), 60)  # the seat's cleft
S.taubin(P, (z > 0.14) * (z < 0.76) * (ARM < 0.5), 30)  # legs: no hamstrings, no calves
S.taubin(P, np.ones(n), 6)
# slimmer limbs: arms and thighs drawn in toward their axes (each slice's centre), the thighs leaving a gap
zbins = np.round(z / 0.01).astype(int)
for s in (1, -1):
    side = s * x > 0.0
    J = JOINTS[s]
    for part, sel, k, w_ in (
        ("arm", side & (ARM > 0.5), 0.87, sstep(z, J["wrist"][2] + 0.03, J["wrist"][2] + 0.08) * (1 - sstep(z, J["shoulder"][2] - 0.12, J["shoulder"][2] - 0.04))),
        ("thigh", side & (ARM < 0.5), 0.9, sstep(z, 0.42, 0.56) * (1 - sstep(z, 0.72, 0.8))),
    ):
        cx, cy = np.zeros(n), np.zeros(n)
        for b in np.unique(zbins[sel]):
            ss = sel & (zbins == b)
            cx[ss], cy[ss] = x[ss].mean(), y[ss].mean()
        f = np.where(sel, 1 - (1 - k) * w_, 1.0)
        P[:, 0] = np.where(sel, cx + (x - cx) * f, x)
        P[:, 1] = np.where(sel, cy + (y - cy) * f, y)
S.taubin(P, (ARM > 0.3) | ((z > 0.4) & (z < 0.82)), 10)
# a slimmer waist and pelvis
P[:, 0] = x * (1 - 0.08 * sstep(z, 0.76, 0.88) * (1 - sstep(z, 1.12, 1.27)) * (ARM < 0.5))
# feet: the toes melt into a smooth front, like a shoe
S.relax(P, (z < 0.05) * sstep(-y, 0.06, 0.1), 120)
S.taubin(P, z < 0.09, 30)

# ---------------------------------------------------------------- longer legs: below the hips the figure stretches 3%
zz = np.linspace(0.0, 2.0, 4001)
lift = np.concatenate([[0.0], np.cumsum(0.03 * (1 - sstep(zz[1:], 0.75, 0.95)) * np.diff(zz))])
LIFT = lift[-1]
dz = np.interp(z, zz, lift)
P[:, 2] += dz + (LIFT - dz) * ARM  # the arms ride up with the shoulders
for J in JOINTS.values():
    for k_ in J:
        J[k_] = J[k_] + np.array([0, 0, LIFT])

# ---------------------------------------------------------------- the neck: slimmer and 1.2 cm longer
mid = np.abs(x) < 0.006
CHIN = z[mid & (y < -0.12) & (z > 1.4 + LIFT)].min()  # the underside of the chin, front
THROAT = y[mid & (np.abs(z - (CHIN - 0.01)) < 0.004) & (y < 0)].min()  # front of the neck just under the jaw
ZS = np.linspace(CHIN - 0.12, CHIN + 0.1, 45)  # the neck's centre line (front-back), measured
yc = []
for zs in ZS:
    sel = (np.abs(z - zs) < 0.004) & mid
    sel_f = sel & (y > THROAT - 0.004)  # (the neck, not the jaw in front of it)
    yc.append((y[sel_f].min() + y[sel].max()) / 2 if sel_f.any() else np.nan)
yc = np.array(yc)
ok = ~np.isnan(yc)
yc = np.polyval(np.polyfit(ZS[ok], yc[ok], 2), ZS)  # (a smooth line: slice measurements are noisy)
# the original head comes off: the jaw in front of the throat, and everything above a plane rising toward the nape
# (1.5 cm up inside the new head, so the cut edge stays hidden)
CUT = ((z > CHIN - 0.008) & (y < THROAT - 0.003)) | (z > CHIN + 0.024 + 0.5 * (y - THROAT))
CUT &= np.abs(x) < 0.14
old = (z > CHIN + 0.06) & (np.abs(x) < 0.12) & CUT  # the old cranium (above the nose), for placing the new head
YC_OLD = (np.percentile(y[old & (z > CHIN + 0.12)], 1) + y[old].max()) / 2
NECK_LEN = 0.012
neck = (1 - sstep(np.abs(x), 0.08, 0.13)) * sstep(z, CHIN - 0.075, CHIN - 0.03)
k_neck = 1 - 0.12 * neck
ycz = np.interp(z, ZS, yc)
P[:, 0] = x * k_neck
P[:, 1] = ycz + (y - ycz) * k_neck
P[:, 2] += NECK_LEN * (1 - sstep(np.abs(x), 0.08, 0.13)) * sstep(z, CHIN - 0.06, CHIN)
neck_w = (1 - sstep(np.abs(x), 0.07, 0.1)) * sstep(z, CHIN - 0.1, CHIN - 0.07) * ~CUT
S.relax(P, neck_w * sstep(-(y - ycz), 0.02, 0.04), 40)  # the throat: no Adam's apple
S.taubin(P, neck_w, 240)  # a plain column (it is glossy black: every ripple shows)
# carried more upright: the neck tilts back about its base, taking the head with it
NECK_TILT = math.radians(6.0)
PIVOT = np.array([0.0, float(np.interp(CHIN - 0.075, ZS, yc)), CHIN - 0.075])


def tilt_back(Q, w):
    a = NECK_TILT * w
    ry, rz = Q[:, 1] - PIVOT[1], Q[:, 2] - PIVOT[2]
    Q[:, 1] = PIVOT[1] + np.cos(a) * ry + np.sin(a) * rz
    Q[:, 2] = PIVOT[2] - np.sin(a) * ry + np.cos(a) * rz


tilt_back(P, (1 - sstep(np.abs(x), 0.07, 0.11)) * sstep(z, CHIN - 0.075, CHIN - 0.01))

# ---------------------------------------------------------------- head: a designed mannequin head, featureless
# Smooth solids blended with smooth min/max (signed distances): a cranium and a face-and-jaw volume, the face a
# little flattened, the jaw tapering to the chin, its underside rising toward the neck. Meshed by bisecting rays
# from the centre (the shape is star-shaped about it), so the surface is as fair as the functions.
def smin(a, b, k):
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0, 1)
    return b * (1 - h) + a * h - k * h * (1 - h)


def smax(a, b, k):
    return -smin(-a, -b, k)


def ellipsoid(p, c, r):
    q = (p - np.asarray(c)) / np.asarray(r)
    k0 = np.linalg.norm(q, axis=1)
    return k0 * (k0 - 1) / np.maximum(np.linalg.norm(q / np.asarray(r), axis=1), 1e-9)


# head-local: y forward, z up from the chin, metres (a human head's proportions)
HEAD = dict(cy=-0.016, cz=0.136, cw=0.077, cd=0.099, ch=0.088,  # cranium
            jy=0.022, jz=0.072, jw=0.066, jd=0.072, jh=0.082, kj=0.035,  # face and jaw
            face=0.092, kf=0.04, jw0=0.077, taper=0.45, tz=0.065, kt=0.018, under=0.35, chin_y=0.076, ku=0.02)


def head_sdf(p, H=HEAD):
    x, y, z = p[:, 0], p[:, 1], p[:, 2]
    d = smin(ellipsoid(p, (0, H["cy"], H["cz"]), (H["cw"], H["cd"], H["ch"])),
             ellipsoid(p, (0, H["jy"], H["jz"]), (H["jw"], H["jd"], H["jh"])), H["kj"])
    d = smax(d, y - H["face"], H["kf"])
    half = H["jw0"] - H["taper"] * np.maximum(0, H["tz"] - z)
    d = smax(d, (np.abs(x) - half) / math.hypot(1, H["taper"]), H["kt"])
    return smax(d, ((H["chin_y"] - y) * H["under"] - z) / math.hypot(1, H["under"]), H["ku"])


def radial_mesh(fn, c, level=6, rmax=0.2):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=level, radius=1.0)
    V = np.array([v.co[:] for v in bm.verts])
    F = [tuple(v.index for v in f.verts) for f in bm.faces]
    bm.free()
    V /= np.linalg.norm(V, axis=1)[:, None]
    lo, hi = np.zeros(len(V)), np.full(len(V), np.nan)
    for t_ in np.linspace(0.002, rmax, 200):  # the first exit along each ray, then bisect
        out = fn(c + V * t_) > 0
        hi[out & np.isnan(hi)] = t_
        lo = np.where(np.isnan(hi), t_, lo)
    for _ in range(30):
        mid_ = (lo + hi) / 2
        out = fn(c + V * mid_[:, None]) > 0
        hi, lo = np.where(out, mid_, hi), np.where(out, lo, mid_)
    return c + V * ((lo + hi) / 2)[:, None], F


HP, HF = radial_mesh(head_sdf, np.array([0.0, 0.0, 0.11]), level=7)
HP[:, 1] *= -1  # the figure faces -y
HF = [f[::-1] for f in HF]
# 1/8 of the figure; the chin where the old chin was (plus the longer neck), centred on the old head
HEAD_H = 0.215
HP = (HP - np.array([0.0, (HP[:, 1].min() + HP[:, 1].max()) / 2, HP[:, 2].min()])) * (HEAD_H / np.ptp(HP[:, 2]))
HP += np.array([0.0, YC_OLD, CHIN + NECK_LEN])
tilt_back(HP, np.ones(len(HP)))
hm2 = bpy.data.meshes.new("B_head")
hm2.from_pydata([tuple(v) for v in HP], [], HF)
hm2.update()
head = bpy.data.objects.new("B_head", hm2)
SC.collection.objects.link(head)

# ---------------------------------------------------------------- shoes: smooth boots in place of the bare feet
# Designed like the head (blended solids, meshed by bisecting rays); flat-soled, with a collar a little wider than
# the ankle, so the leg's cut end (just below the collar's top) is hidden and the collar reads as the shoe's edge.
SHOE_TOP = 0.115
SHOE_K = 0.92  # (the foot's size against a human foot's)


def shoe_sdf(p):
    u, v, w = p[:, 0], p[:, 1], p[:, 2]  # across, forward (to the toes), up; the ankle's centre at u = v = 0
    f = p / SHOE_K
    d = ellipsoid(f, (0, -0.022, 0.046), (0.037, 0.046, 0.05))  # heel
    d = smin(d, ellipsoid(f, (0, 0.05, 0.036), (0.04, 0.1, 0.037)), 0.03)  # instep
    d = smin(d, ellipsoid(f, (0, 0.128, 0.024), (0.042, 0.055, 0.026)), 0.03) * SHOE_K  # toe box
    d = smin(d, (np.hypot(u / 0.041, v / 0.056) - 1) * 0.041, 0.022)  # collar round the ankle
    d = smax(d, w - SHOE_TOP, 0.007)
    return smax(d, -w, 0.006)


SP, SF = radial_mesh(shoe_sdf, np.array([0.0, 0.04, 0.05]), level=7, rmax=0.3)
FEET = []
shoe_verts, shoe_faces = [], []
for s in (1, -1):
    side = (s * x > 0.02) & (ARM < 0.5)
    ank = side & (np.abs(z - 0.11) < 0.004)
    ax_c, ay_c = x[ank].mean(), y[ank].mean()
    toe = side & (z < 0.06)
    tip = P[toe][np.argmin(y[toe])]
    ang = math.atan2(tip[0] - ax_c, -(tip[1] - ay_c))  # toe-out: the shoe points from the ankle to the toes
    ca, sa = math.cos(ang), math.sin(ang)
    Q = SP.copy()
    Q[:, 0] *= s
    # shoe-local forward is +v; the figure's forward is -y
    wx = Q[:, 0] * ca + Q[:, 1] * sa
    wy = Q[:, 0] * sa - Q[:, 1] * ca
    shoe_faces += [tuple(i + len(shoe_verts) for i in (f[::-1] if s > 0 else f)) for f in SF]  # (local -> world mirrors once)
    shoe_verts += list(np.stack([ax_c + wx, ay_c + wy, Q[:, 2]], 1))
    FEET.append((s, ax_c, ay_c, math.degrees(ang)))
print("feet (side, ankle x, ankle y, toe-out deg)", [tuple(round(v, 3) for v in f_) for f_ in FEET])
sm = bpy.data.meshes.new("B_shoes")
sm.from_pydata([tuple(v) for v in shoe_verts], [], shoe_faces)
sm.update()
shoes = bpy.data.objects.new("B_shoes", sm)
SC.collection.objects.link(shoes)
CUT |= (z < SHOE_TOP - 0.025) & (ARM < 0.5)  # the bare feet go

# ---------------------------------------------------------------- body without its old head
me.vertices.foreach_set("co", P.ravel())
me.update()
arm_attr = me.attributes.new("arm", "FLOAT", "POINT")
arm_attr.data.foreach_set("value", ARM)
bmb = bmesh.new()
bmb.from_mesh(me)
bmb.verts.ensure_lookup_table()
bmesh.ops.delete(bmb, geom=[bmb.verts[i] for i in np.where(CUT)[0]], context="VERTS")
bmb.to_mesh(me)
bmb.free()
body = bpy.data.objects.new("B_body", me)
SC.collection.objects.link(body)
for ob, lv in ((body, 1), (head, 0), (shoes, 0)):
    bpy.context.view_layer.objects.active = ob
    if lv:
        m = ob.modifiers.new("sub", "SUBSURF")
        m.levels = m.render_levels = lv
        bpy.ops.object.modifier_apply(modifier="sub")
    for p in ob.data.polygons:
        p.use_smooth = True

TOP = max(np.asarray([v.co.z for v in head.data.vertices]).max(), 0)
print(f"LIFT {LIFT:.4f}  CHIN {CHIN:.3f}  THROAT {THROAT:.3f}  height {TOP:.3f}")
for s in (1, -1):
    print("joints", s, {k_: v.round(3).tolist() for k_, v in JOINTS[s].items()})


# ---------------------------------------------------------------- shader data
def poly_sdf(Q2, poly):
    """signed distance from 2D points to a closed polygon (negative inside)"""
    a, b = poly, np.roll(poly, -1, 0)
    ab = b - a
    d = np.full(len(Q2), np.inf)
    inside = np.zeros(len(Q2), bool)
    for i in range(len(a)):
        ap = Q2 - a[i]
        t_ = np.clip(ap @ ab[i] / (ab[i] @ ab[i]), 0, 1)
        d = np.minimum(d, np.linalg.norm(ap - np.outer(t_, ab[i]), axis=1))
        crosses = (a[i, 1] > Q2[:, 1]) != (b[i, 1] > Q2[:, 1])
        xint = a[i, 0] + (Q2[:, 1] - a[i, 1]) * ab[i, 0] / np.where(ab[i, 1] == 0, 1e-12, ab[i, 1])
        inside ^= crosses & (Q2[:, 0] < xint)
    return np.where(inside, -d, d)


def projected(Q, N, f2d, axes=(0, 2), mirror=True, h=1e-4):
    """a 2D signed distance, seen along the remaining axis, turned into a distance along the surface: divided by the
    length of its gradient in the surface's tangent plane (so lines keep their width where the surface turns away)"""
    def at(dq):
        Q_ = Q + dq
        u = np.abs(Q_[:, axes[0]]) if mirror else Q_[:, axes[0]]
        return f2d(np.stack([u, Q_[:, axes[1]]], 1))

    d0 = at(0)
    g = np.zeros_like(Q)
    for ax_ in axes:
        dq = np.zeros(3)
        dq[ax_] = h
        g[:, ax_] = (at(dq) - d0) / h
    gt = g - (g * N).sum(1)[:, None] * N
    return d0 / np.maximum(np.linalg.norm(gt, axis=1), 0.25)


def smooth_curve(pts, k=24):
    """a dense closed polygon through the points (Catmull-Rom)"""
    pts = np.asarray(pts, float)
    out = []
    m = len(pts)
    for i in range(m):
        p0, p1, p2, p3 = pts[(i - 1) % m], pts[i], pts[(i + 1) % m], pts[(i + 2) % m]
        for t_ in np.linspace(0, 1, k, endpoint=False):
            t2, t3 = t_ * t_, t_ * t_ * t_
            out.append(0.5 * (2 * p1 + (-p0 + p2) * t_ + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    return np.array(out)


FAR = 0.05
L = LIFT


def body_channels(Q, N, armw):
    qx, qy, qz = Q[:, 0], Q[:, 1], Q[:, 2]
    ax_ = np.abs(qx)
    # armholes: a near-vertical plane at each shoulder (d < 0 on the torso side)
    n_arm = unit(np.array([1.0, 0.0, 0.12]))
    d_arm = np.stack([ax_, qy, qz], 1) @ n_arm - np.array([0.166, 0.0, 1.36 + L]) @ n_arm
    d_seam_arm = np.where(qz > 1.31 + L, d_arm, np.where(armw > 0.5, FAR, -FAR))
    # the yoke: above a line across the upper chest (lower down the back), inside the armholes
    back = sstep(qy - 0.0, -0.04, 0.05)
    zb = (1.315 + L + 0.16 * ax_ + 0.7 * ax_ ** 2) * (1 - back) + (1.28 + L + 0.12 * ax_ + 0.7 * ax_ ** 2) * back
    yoke = np.minimum(qz - zb, -d_arm)
    # the front panel: from the armpits down the sides of the waist, over the hips, across the thighs to the inner
    # knees; in front of each limb's mid-depth
    zbin = np.round(qz / 0.01).astype(int)
    ymid = np.zeros(len(Q))
    for zb_ in np.unique(zbin):  # each limb's mid-depth, slice by slice
        sel = zbin == zb_
        for side in (qx > 0, qx <= 0):
            ss = sel & side & (armw < 0.5)
            if ss.any():
                ymid[ss] = (qy[ss].min() + qy[ss].max()) / 2
    knee = 0.53 - 0.018 * np.clip((qy - ymid) / 0.05, -1, 1)  # the knee line, higher over the kneecap
    c_pts = [(-0.05, 1.9), (0.136, 1.9), (0.134, 1.36 + L), (0.124, 1.22 + L), (0.108, 1.08 + L), (0.112, 1.0 + L),
             (0.135, 0.92), (0.14, 0.84), (0.128, 0.75), (0.104, 0.66), (0.08, 0.59), (0.058, 0.5), (-0.05, 0.5)]
    front = smooth_curve(c_pts, 6)
    d_front = projected(Q, N, lambda q: poly_sdf(q, front))
    d_front = np.maximum(d_front, np.maximum(qy - ymid - 0.004, knee - qz))
    d_front = np.where(armw > 0.5, FAR, d_front)
    # the abdomen panel (inside the front panel) and the bands round the shins and forearms
    u_pts = [(-0.05, 1.9), (0.136, 1.9), (0.134, 1.36 + L), (0.124, 1.22 + L), (0.108, 1.08 + L), (0.092, 0.99 + L),
             (0.05, 0.962 + L), (0.0, 0.958 + L), (-0.05, 0.958 + L)]
    d_abd = projected(Q, N, lambda q: poly_sdf(q, smooth_curve(u_pts, 6)))
    d_abd = np.where((qy < ymid) & (armw < 0.5), d_abd, FAR)
    d_shin = np.maximum(-qz, qz - knee)  # (its lower edge is the shoe's collar)
    d_shin = np.where(armw < 0.5, d_shin, FAR)
    d_fore = np.full(len(Q), FAR)
    for s in (1, -1):
        e, w_ = JOINTS[s]["elbow"], JOINTS[s]["wrist"]
        da = unit(w_ - e)
        band = np.maximum((e + da * 0.035 - Q) @ da, (Q - (w_ - da * 0.012)) @ da)
        d_fore = np.where((s * qx > 0) & (armw > 0.5), band, d_fore)
    d_b = np.minimum(np.minimum(d_abd, d_shin), d_fore)
    return yoke, d_front, d_b, d_seam_arm


def head_channels(Q, N):
    hcx = 0.0
    hc_y = (Q[:, 1].min() + Q[:, 1].max()) / 2
    z0 = Q[:, 2].min()
    # the face plate, seen from the front: brow to chin, between the temples
    plate = [(0.0, z0 + 0.15), (0.045, z0 + 0.147), (0.057, z0 + 0.125), (0.058, z0 + 0.085), (0.05, z0 + 0.045),
             (0.032, z0 + 0.018), (0.0, z0 + 0.008)]
    plate = plate + [(-p[0], p[1]) for p in reversed(plate[1:-1])]
    d_face = projected(Q, N, lambda q: poly_sdf(q, smooth_curve(plate, 16)), mirror=False)
    d_face = np.where(Q[:, 1] < hc_y - 0.02, d_face, FAR)
    return np.full(len(Q), FAR), d_face, np.full(len(Q), FAR), np.full(len(Q), FAR)


def write_channels(ob, chans):
    col = ob.data.color_attributes.new(name="Col", type="FLOAT_COLOR", domain="POINT")
    c = np.stack([np.clip(0.5 + np.clip(ch, -FAR, FAR) / (2 * FAR), 0, 1) for ch in chans], 1)
    col.data.foreach_set("color", c.ravel())
    ob.data.color_attributes.active_color = col


def verts_normals(ob):
    m = ob.data
    Q = np.empty(len(m.vertices) * 3)
    m.vertices.foreach_get("co", Q)
    N = np.empty(len(m.vertices) * 3)
    m.vertices.foreach_get("normal", N)
    return Q.reshape(-1, 3), N.reshape(-1, 3)


Qb, Nb = verts_normals(body)
armw = np.empty(len(Qb))
body.data.attributes["arm"].data.foreach_get("value", armw)
write_channels(body, body_channels(Qb, Nb, armw))
body.data.attributes.remove(body.data.attributes["arm"])
write_channels(head, head_channels(*verts_normals(head)))
Qs, _ = verts_normals(shoes)
write_channels(shoes, (np.full(len(Qs), -FAR), Qs[:, 2] - 0.012, np.full(len(Qs), FAR), np.full(len(Qs), FAR)))  # (the sole's edge)
for ob in (body, head, shoes):
    ob.select_set(True)
os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", use_selection=True, export_materials="NONE",
                          export_vertex_color="ACTIVE", export_all_vertex_colors=True)
print("wrote", OUT, os.path.getsize(OUT))
