"""Rig the home robot (assets/models/bot.glb, built by blender/build_bot.py) for posing and animation.

Output: assets/models/bot_rig.glb — the same three meshes, untouched (every original accessor, COLOR_0 included, is
copied byte for byte), plus one skeleton:
  B_body   skinned (4 influences per vertex, 16-bit weights)
  B_shoes  skinned to foot_L/R and toe_L/R (the shoe flexes across the ball of the foot)
  B_head   rigid: a child of the head joint
The joints are placed from the geometry (cross-section centroids along each limb, the narrowest section at the wrist,
the shoulder cap, the shoes' soles, the fingers' centre lines). The body's weights start from Blender's heat
weighting (bone heat) and are then reshaped: each limb's share is redistributed along the limb with smooth bands
centred on the joints, the spine's share likewise along the spine, the fingers get their own weights from their
centre lines, and junctions are smoothed. Helper bones (twist and mid-joint bones, names starting with "x_") carry
weights too; engine2/botrig.js drives them from the main joints.

Joint frames (glTF / three.js space: x = the robot's left, y = up, z = forward): the trunk, neck, head and clavicles
are axis-aligned; each limb bone's local y runs up the limb (toward its parent) and its local x is the hinge axis,
oriented so that a positive rotation about x flexes the joint (see engine2/botrig.js for the pose conventions).

run: /opt/venvs/blender/bin/python blender/rig_bot.py [in.glb] [out.glb]
"""
import heapq
import json
import math
import os
import struct
import sys

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
args = [a for a in sys.argv[1:] if not a.startswith("-")]
SRC = args[0] if len(args) > 0 else os.path.join(ROOT, "assets/models/bot.glb")
OUT = args[1] if len(args) > 1 else os.path.join(ROOT, "assets/models/bot_rig.glb")
CACHE = os.environ.get("RIG_CACHE")  # a .npz to keep the heat weights in between runs (development only)
DEBUG = os.environ.get("RIG_DEBUG")


# ================================================================ GLB in and out
CT = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
NC = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}


def read_glb(path):
    f = open(path, "rb").read()
    assert f[:4] == b"glTF"
    jl = struct.unpack("<I", f[12:16])[0]
    J = json.loads(f[20:20 + jl])
    o = 20 + jl
    bl = struct.unpack("<I", f[o:o + 4])[0]
    return J, bytearray(f[o + 8:o + 8 + bl])


def accessor(J, B, i):
    a = J["accessors"][i]
    v = J["bufferViews"][a["bufferView"]]
    n = NC[a["type"]]
    dt = np.dtype(CT[a["componentType"]])
    off = v.get("byteOffset", 0) + a.get("byteOffset", 0)
    stride = v.get("byteStride", 0)
    assert stride in (0, n * dt.itemsize), "interleaved buffers are not expected"
    return np.frombuffer(bytes(B), dt, a["count"] * n, off).reshape(a["count"], n)


def add_accessor(J, B, arr, ctype, typ, target=None, normalized=False, minmax=False):
    """append arr to the binary chunk as a new bufferView + accessor; returns the accessor index"""
    while len(B) % 4:
        B.append(0)
    data = np.ascontiguousarray(arr, dtype=CT[ctype]).tobytes()
    bv = {"buffer": 0, "byteOffset": len(B), "byteLength": len(data)}
    if target:
        bv["target"] = target
    B.extend(data)
    J["bufferViews"].append(bv)
    a = {"bufferView": len(J["bufferViews"]) - 1, "componentType": ctype, "count": int(len(arr)), "type": typ}
    if normalized:
        a["normalized"] = True
    if minmax:
        a["min"] = np.asarray(arr).min(0).tolist()
        a["max"] = np.asarray(arr).max(0).tolist()
    J["accessors"].append(a)
    return len(J["accessors"]) - 1


def write_glb(path, J, B):
    while len(B) % 4:
        B.append(0)
    J["buffers"] = [{"byteLength": len(B)}]
    js = json.dumps(J, separators=(",", ":")).encode()
    js += b" " * ((4 - len(js) % 4) % 4)
    total = 12 + 8 + len(js) + 8 + len(B)
    with open(path, "wb") as f:
        f.write(struct.pack("<III", 0x46546C67, 2, total))
        f.write(struct.pack("<II", len(js), 0x4E4F534A) + js)
        f.write(struct.pack("<II", len(B), 0x004E4942) + bytes(B))


def to_blender(P):  # glTF (y up, the robot faces +z) -> Blender (z up, faces -y)
    return np.stack([P[:, 0], -P[:, 2], P[:, 1]], 1)


def to_gltf(p):
    p = np.asarray(p, float)
    return np.stack([p[..., 0], p[..., 2], -p[..., 1]], -1)


J0, B0 = read_glb(SRC)
MESH = {}  # name -> (node index, primitive, P (blender coords), F)
for ni, nd in enumerate(J0["nodes"]):
    if "mesh" in nd:
        pr = J0["meshes"][nd["mesh"]]["primitives"][0]
        P = to_blender(accessor(J0, B0, pr["attributes"]["POSITION"]).astype(float))
        F = accessor(J0, B0, pr["indices"]).reshape(-1, 3).astype(np.int64)
        MESH[nd["name"]] = (ni, pr, P, F)


# ================================================================ geometry
def sstep(v, a, b):
    t = np.clip((np.asarray(v, float) - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def unit(v):
    v = np.asarray(v, float)
    return v / np.linalg.norm(v)


def weld(P, F, tol=1e-6):
    """one vertex per position (the export splits vertices along the UV seams)"""
    key = np.round(P / tol).astype(np.int64)
    _, idx, inv = np.unique(key, axis=0, return_index=True, return_inverse=True)
    inv = inv.ravel()
    return P[idx], inv[F], inv


def components(n, E):
    lab = np.arange(n)
    while True:
        m = np.minimum(lab[E[:, 0]], lab[E[:, 1]])
        old = lab.copy()
        np.minimum.at(lab, E[:, 0], m)
        np.minimum.at(lab, E[:, 1], m)
        lab = lab[lab]
        if (lab == old).all():
            return lab


def edges_of(F):
    E = np.sort(np.concatenate([F[:, [0, 1]], F[:, [1, 2]], F[:, [2, 0]]]), 1)
    return np.unique(E, axis=0)


def section(U, F, c, n, tri_mask=None):
    """the closed loops where the plane through c (normal n) cuts the mesh: [{c: area centroid, area, pts}]"""
    n = unit(n)
    d = (U - c) @ n
    s = d[F] > 0
    cr = s.any(1) & ~s.all(1)
    if tri_mask is not None:
        cr &= tri_mask
    T = F[cr]
    es = np.stack([np.sort(T[:, [a, b]], 1) for a, b in ((0, 1), (1, 2), (2, 0))], 1)
    ok = (d[es[:, :, 0]] > 0) != (d[es[:, :, 1]] > 0)
    good = ok.sum(1) == 2
    pair = es[good][ok[good]].reshape(-1, 2, 2)
    N = len(U) + 1
    keys = pair[:, :, 0] * N + pair[:, :, 1]
    uk, inv = np.unique(keys.ravel(), return_inverse=True)
    inv = inv.reshape(-1, 2)
    ev = np.stack([uk // N, uk % N], 1)
    ta = d[ev[:, 0]] / (d[ev[:, 0]] - d[ev[:, 1]])
    X = U[ev[:, 0]] + (U[ev[:, 1]] - U[ev[:, 0]]) * ta[:, None]
    adj = [[] for _ in range(len(uk))]
    for a, b in inv:
        adj[a].append(b)
        adj[b].append(a)
    seen = np.zeros(len(uk), bool)
    u = unit(np.cross(n, [1, 0, 0] if abs(n[0]) < 0.9 else [0, 1, 0]))
    v = np.cross(n, u)
    loops = []
    for s0 in range(len(uk)):
        if seen[s0]:
            continue
        loop, prev, cur = [s0], -1, s0
        seen[s0] = True
        while True:
            nx = [k for k in adj[cur] if k != prev and not seen[k]]
            if not nx:
                break
            prev, cur = cur, nx[0]
            seen[cur] = True
            loop.append(cur)
        pts = X[loop]
        q = np.stack([(pts - c) @ u, (pts - c) @ v], 1)
        q2 = np.roll(q, -1, 0)
        cr_ = q[:, 0] * q2[:, 1] - q2[:, 0] * q[:, 1]
        A = cr_.sum() / 2
        if abs(A) < 1e-10:
            continue
        cen = c + ((q[:, 0] + q2[:, 0]) * cr_).sum() / (6 * A) * u + ((q[:, 1] + q2[:, 1]) * cr_).sum() / (6 * A) * v
        loops.append({"c": cen, "area": abs(A), "pts": pts})
    return loops


def loop_near(U, F, c, n, tri_mask=None, maxd=0.06, min_area=2e-5):
    L = [l_ for l_ in section(U, F, c, n, tri_mask) if l_["area"] > min_area]
    if not L:
        return None
    l_ = min(L, key=lambda l_: np.linalg.norm(l_["c"] - c))
    return l_ if np.linalg.norm(l_["c"] - c) < maxd else None


def fit_line(pts):
    pts = np.asarray(pts)
    c = pts.mean(0)
    d = np.linalg.svd(pts - c)[2][0]
    return c, d


def closest_between(c1, d1, c2, d2):
    """midpoint of the closest points of two lines"""
    w = c1 - c2
    a, b, cc, d_, e = d1 @ d1, d1 @ d2, d2 @ d2, d1 @ w, d2 @ w
    den = a * cc - b * b
    s = (b * e - cc * d_) / den
    t = (a * e - b * d_) / den
    return (c1 + s * d1 + c2 + t * d2) / 2


def dijkstra(n, E, L, sources, limit=np.inf):
    """geodesic (edge-path) distances from the source vertices"""
    adj = [[] for _ in range(n)]
    for (a, b), w in zip(E, L):
        adj[a].append((b, w))
        adj[b].append((a, w))
    dist = np.full(n, np.inf)
    h = []
    for s in sources:
        dist[s] = 0.0
        h.append((0.0, int(s)))
    heapq.heapify(h)
    while h:
        d, a = heapq.heappop(h)
        if d > dist[a] or d > limit:
            continue
        for b, w in adj[a]:
            nd = d + w
            if nd < dist[b]:
                dist[b] = nd
                heapq.heappush(h, (nd, b))
    return dist


# ---------------------------------------------------------------- the meshes
BODY_NODE, BODY_PR, BP, BF = MESH["B_body"]
U, FW, WELD = weld(BP, BF)  # welded body (U: unique positions, WELD: original vertex -> welded)
EW = edges_of(FW)
LAB = components(len(U), EW)
main_lab = np.bincount(LAB).argmax()
STRAY = LAB != main_lab  # a small piece left inside the head by the build (hidden): rides on the head
x, y, z = U.T
HEAD_NODE, _, HP, HF = MESH["B_head"]
SHOE_NODE, SHOE_PR, SP, SF = MESH["B_shoes"]
print(f"body {len(BP)} verts ({len(U)} welded, {STRAY.sum()} stray), head {len(HP)}, shoes {len(SP)}")


# ================================================================ joints (Blender coordinates: z up, faces -y)
def torso_slice(zc):
    L = section(U, FW, np.array([0, 0, zc]), [0, 0, 1])
    L = [l_ for l_ in L if abs(l_["c"][0]) < 0.05 and l_["area"] > 1e-4]
    return max(L, key=lambda l_: l_["area"])


JNT = {}
mid = np.abs(x) < 0.004
CROTCH = z[mid & ~STRAY & (z < 1.0)].min()
# --- spine: on the mid-plane, set in from the back (the vertebral column lies behind the body's centre)
for name, zc, back in (("hips", 0.935, None), ("spine", 1.05, 0.055), ("chest", 1.20, 0.064)):
    t = torso_slice(zc)
    yb = t["pts"][:, 1].max()
    JNT[name] = np.array([0.0, (t["c"][1] + 0.012) if back is None else yb - back, zc])
neck_c = [torso_slice(zc)["c"] for zc in (1.46, 1.48, 1.50)]
JNT["neck"] = np.array([0.0, torso_slice(1.44)["c"][1], 1.44])
JNT["head"] = np.array([0.0, np.mean([c[1] for c in neck_c]) + 0.004, 1.535])
JNT["head_end"] = np.array([0.0, JNT["head"][1], HP[:, 2].max()])

SIDES = {"L": 1, "R": -1}
SHOE = {}
for sd, s in SIDES.items():
    side_tri = (U[FW][:, :, 0].mean(1) * s) > 0.12
    # --- arm: centre lines of the upper arm and forearm from perpendicular sections; they meet at the elbow
    e0, w0, g0 = np.array([s * 0.212, 0.013, 1.116]), np.array([s * 0.223, -0.062, 0.88]), np.array([s * 0.16, 0.0, 1.37])
    for _ in range(2):
        df, du = unit(w0 - e0), unit(g0 - e0)
        fc = [loop_near(U, FW, e0 + df * t, df, side_tri) for t in np.arange(0.05, 0.19, 0.01)]
        uc = [loop_near(U, FW, e0 + du * t, du, side_tri) for t in np.arange(0.02, 0.135, 0.01)]
        cf, dfl = fit_line([l_["c"] for l_ in fc if l_])
        cu, dul = fit_line([l_["c"] for l_ in uc if l_])
        e0 = closest_between(cf, dfl, cu, dul)
        dfl = dfl if dfl @ df > 0 else -dfl
        # the wrist: the narrowest section of the forearm's far end
        ts = np.arange(0.20, 0.30, 0.0025)
        ar = [loop_near(U, FW, e0 + dfl * t, dfl, side_tri) for t in ts]
        A = np.array([l_["area"] if l_ else np.inf for l_ in ar])
        k = int(np.argmin(A))
        w0 = ar[k]["c"]
    elbow, wrist = e0, w0
    # --- shoulder: the centre of the shoulder cap (a sphere through its outer surface), on the upper arm's line
    cap = (s * x > 0.17) & (z > 1.37) & (z < 1.47) & ~STRAY
    q = U[cap]
    sol = np.linalg.lstsq(np.c_[2 * q, np.ones(len(q))], (q ** 2).sum(1), rcond=None)[0]
    gh = sol[:3].copy()
    JNT["upperarm_" + sd] = gh
    JNT["forearm_" + sd] = elbow
    JNT["hand_" + sd] = wrist
    # the sternoclavicular joint: beside the top of the sternum
    front = U[(np.abs(z - 1.40) < 0.004) & (np.abs(x) < 0.01)][:, 1].min()
    JNT["clavicle_" + sd] = np.array([s * 0.024, front + 0.03, 1.40])
    # --- leg
    tl = []
    for zc in np.arange(0.58, 0.785, 0.02):
        L = [l_ for l_ in section(U, FW, np.array([0, 0, zc]), [0, 0, 1]) if s * l_["c"][0] > 0.03 and s * l_["c"][0] < 0.16]
        tl.append(max(L, key=lambda l_: l_["area"])["c"])
    ct, dt_ = fit_line(tl)
    zh = CROTCH + 0.078
    hx = ct + dt_ * (zh - ct[2]) / dt_[2]
    hs = torso_slice(zh)
    hip = np.array([hx[0] - s * 0.004, (hs["pts"][:, 1].min() + hs["pts"][:, 1].max()) / 2 + 0.004, zh])
    zs = np.arange(0.38, 0.545, 0.005)
    legA = []
    for zc in zs:
        L = [l_ for l_ in section(U, FW, np.array([0, 0, zc]), [0, 0, 1]) if s * l_["c"][0] > 0.03]
        legA.append(max(L, key=lambda l_: l_["area"]))
    kz = zs[int(np.argmin([l_["area"] for l_ in legA]))] + 0.035
    kl = max([l_ for l_ in section(U, FW, np.array([0, 0, kz]), [0, 0, 1]) if s * l_["c"][0] > 0.03], key=lambda l_: l_["area"])
    knee = kl["c"] + np.array([0, 0.004, 0])
    al = max([l_ for l_ in section(U, FW, np.array([0, 0, 0.12]), [0, 0, 1]) if s * l_["c"][0] > 0.03], key=lambda l_: l_["area"])
    ankle = np.array([al["c"][0], al["c"][1], 0.072])
    # --- the shoe: its sole's long axis, the ball of the foot at 70 % of its length from the heel
    sq = SP[s * SP[:, 0] > 0]
    sole = sq[sq[:, 2] < 0.004]
    sc = sole[:, :2].mean(0)
    ax2 = np.linalg.svd(sole[:, :2] - sc)[2][0]
    ax2 = ax2 if ax2[1] < 0 else -ax2  # forward is -y
    pr = (sq[:, :2] - sc) @ ax2
    heel, tip = pr.min(), pr.max()
    ball2 = sc + ax2 * (heel + 0.70 * (tip - heel))
    fwd = np.array([ax2[0], ax2[1], 0.0])
    SHOE[sd] = {"fwd": fwd, "centre": np.array([sc[0], sc[1], 0.0]), "heel": heel, "tip": tip,
                "ball": heel + 0.70 * (tip - heel)}
    JNT["thigh_" + sd] = hip
    JNT["shin_" + sd] = knee
    JNT["foot_" + sd] = ankle
    JNT["toe_" + sd] = np.array([ball2[0], ball2[1], 0.018])
    JNT["toe_end_" + sd] = np.array([*(sc + ax2 * tip), 0.018])

# ---------------------------------------------------------------- the hands: digits from geodesic distance to the wrist
FINGERS = ("thumb", "index", "middle", "ring", "pinky")
DIGITS = {}
for sd, s in SIDES.items():
    w, e = JNT["hand_" + sd], JNT["forearm_" + sd]
    da = unit(w - e)
    hand = ((U - w) @ da > -0.01) & (s * x > 0.14) & (np.linalg.norm(U - w, axis=1) < 0.25) & ~STRAY
    idx = np.where(hand)[0]
    remap = -np.ones(len(U), int)
    remap[idx] = np.arange(len(idx))
    Eh = remap[EW]
    Eh = Eh[(Eh >= 0).all(1)]
    Hh = U[idx]
    Lh = np.linalg.norm(Hh[Eh[:, 0]] - Hh[Eh[:, 1]], axis=1)
    radial = np.linalg.norm((Hh - w) - np.outer((Hh - w) @ da, da), axis=1)
    src = np.where((np.abs((Hh - w) @ da) < 0.003) & (radial < 0.04))[0]
    g = dijkstra(len(idx), Eh, Lh, src)  # (the thigh, also in the box, is not reached)
    # local maxima of g (within 1.5 cm of the surface path): the five tips
    order = np.argsort(-g)
    tips = []
    for i in order:
        if not np.isfinite(g[i]):
            continue
        if all(np.linalg.norm(Hh[i] - Hh[j]) > 0.016 for j in tips):
            # a true tip: no vertex within 2 cm is farther from the wrist
            near = np.linalg.norm(Hh - Hh[i], axis=1) < 0.02
            if g[near].max() <= g[i] + 1e-9:
                tips.append(i)
        if len(tips) == 5:
            break
    assert len(tips) == 5, tips
    # name them: the thumb is the one farthest toward the front and the palm (shortest geodesic), the fingers in
    # order from the front (index) to the back (pinky)
    tipP = Hh[tips]
    th = int(np.argmin(g[tips]))
    rest = [t_ for k, t_ in enumerate(tips) if k != th]
    rest.sort(key=lambda t_: Hh[t_][1])  # forward is -y: index first
    named = dict(zip(FINGERS, [tips[th]] + rest))
    hand_len = np.linalg.norm(Hh[named["middle"]] - w)
    for f, ti in named.items():
        dt_tip = dijkstra(len(idx), Eh, Lh, [ti], limit=0.08)
        cents = [Hh[ti]]
        for a in np.arange(0.006, 0.08, 0.003):
            ring = np.abs(dt_tip - a) < 0.0015
            if ring.sum() < 6:
                break
            c = Hh[ring].mean(0)
            rad = np.linalg.norm(Hh[ring] - c, axis=1).max()
            if rad > (0.016 if f != "thumb" else 0.02):
                break  # the ring has spread into the palm
            cents.append(c)
        cents = np.array(cents)
        DIGITS[f + "_" + sd] = {"tip": Hh[ti], "cents": cents, "g": g[ti]}
    DIGITS["hand_len_" + sd] = hand_len
    DIGITS["hand_idx_" + sd] = idx


def along_polyline(pts, dist):
    """the point at arc length dist along the polyline (extrapolated straight beyond its end)"""
    seg = np.linalg.norm(np.diff(pts, axis=0), axis=1)
    cum = np.concatenate([[0], np.cumsum(seg)])
    if dist <= cum[-1]:
        k = min(np.searchsorted(cum, dist) - 1, len(seg) - 1)
        k = max(k, 0)
        return pts[k] + (pts[k + 1] - pts[k]) * (dist - cum[k]) / seg[k]
    d = unit(pts[-1] - pts[max(len(pts) - 4, 0)])
    return pts[-1] + d * (dist - cum[-1])


# finger lengths (MCP joint to tip) as fractions of the hand's length; joints along each finger at human proportions
FLEN = {"index": 0.44, "middle": 0.50, "ring": 0.47, "pinky": 0.37}
for sd, s in SIDES.items():
    hl = DIGITS["hand_len_" + sd]
    for f in FINGERS:
        D = DIGITS[f + "_" + sd]
        c = D["cents"]
        if f == "thumb":
            # tip pad + distal phalanx, proximal phalanx, metacarpal (to the CMC joint near the wrist)
            ip = along_polyline(c, 0.026)
            mcp = along_polyline(c, 0.026 + 0.030)
            cmc = along_polyline(c, 0.026 + 0.030 + 0.044)
            D["joints"] = [cmc, mcp, ip, D["tip"]]
        else:
            L = FLEN[f] * hl
            mcp = along_polyline(c, L)
            pip = along_polyline(c, L * 0.55)
            dip = along_polyline(c, L * 0.27)
            D["joints"] = [mcp, pip, dip, D["tip"]]
        for k, nm in enumerate((f + "1_", f + "2_", f + "3_")):
            JNT[nm + sd] = D["joints"][k]
        JNT[f + "_end_" + sd] = D["joints"][3]
    # the hand's far end (for its bone): the middle finger's knuckle
    JNT["hand_end_" + sd] = JNT["middle1_" + sd]

for k in sorted(JNT):
    print(f"  {k:14s} {np.round(JNT[k], 4).tolist()}")


# ================================================================ bone heat weights (Blender) for the main bones
# Each heat bone is a segment; the segments are chosen to cover the body's parts (the hips' runs down into the pelvis,
# the hand's to the middle fingertip, so the whole hand is "hand" here and the fingers are split off later).
def heat_segments():
    """{name: [(head, tail), ...]}: a bone may have several segments (the trunk's fill its volume, so that every part
    of the trunk's surface is nearer a trunk bone than a limb's)"""
    def tc(zc):  # the trunk's centre (front to back) at a height
        t = torso_slice(zc)["pts"]
        return np.array([0.0, (t[:, 1].min() + t[:, 1].max()) / 2, zc])

    S = {
        "hips": [(tc(0.86), tc(1.0))] + [(tc(0.92) + [s * 0.075, 0, 0], tc(1.02) + [s * 0.085, 0, 0]) for s in (1, -1)],
        "spine": [(tc(1.0), tc(1.14))] + [(tc(1.02) + [s * 0.08, 0, 0], tc(1.14) + [s * 0.075, 0, 0]) for s in (1, -1)],
        "chest": [(tc(1.14), tc(1.40))] + [(tc(1.14) + [s * 0.08, 0, 0], tc(1.34) + [s * 0.075, 0, 0]) for s in (1, -1)],
        "neck": [(JNT["neck"], JNT["head"])],
        "head": [(JNT["head"], JNT["head_end"])],
    }
    for sd in SIDES:
        S["clavicle_" + sd] = [(JNT["clavicle_" + sd], JNT["upperarm_" + sd])]
        S["upperarm_" + sd] = [(JNT["upperarm_" + sd], JNT["forearm_" + sd])]
        S["forearm_" + sd] = [(JNT["forearm_" + sd], JNT["hand_" + sd])]
        S["hand_" + sd] = [(JNT["hand_" + sd], JNT["middle_end_" + sd])]
        S["thigh_" + sd] = [(JNT["thigh_" + sd], JNT["shin_" + sd])]
        S["shin_" + sd] = [(JNT["shin_" + sd], JNT["foot_" + sd])]
        S["foot_" + sd] = [(JNT["foot_" + sd], JNT["toe_end_" + sd])]
    return S


HEAT = list(heat_segments())


def heat_weights():
    import bpy

    bpy.ops.wm.read_factory_settings(use_empty=True)
    keep = np.where(~STRAY)[0]
    remap = -np.ones(len(U), int)
    remap[keep] = np.arange(len(keep))
    Fm = remap[FW]
    Fm = Fm[(Fm >= 0).all(1)]
    me = bpy.data.meshes.new("body")
    me.from_pydata(U[keep].tolist(), [], Fm.tolist())
    me.update()
    ob = bpy.data.objects.new("body", me)
    sc = bpy.context.scene
    sc.collection.objects.link(ob)
    arm = bpy.data.armatures.new("rig")
    ao = bpy.data.objects.new("rig", arm)
    sc.collection.objects.link(ao)
    bpy.context.view_layer.objects.active = ao
    bpy.ops.object.mode_set(mode="EDIT")
    for nm, segs in heat_segments().items():
        for k, (h, t) in enumerate(segs):
            b = arm.edit_bones.new(nm + ("" if k == 0 else f"~{k}"))
            b.head, b.tail = tuple(h), tuple(t)
    bpy.ops.object.mode_set(mode="OBJECT")
    ob.select_set(True)
    ao.select_set(True)
    bpy.context.view_layer.objects.active = ao
    bpy.ops.object.parent_set(type="ARMATURE_AUTO")
    W = np.zeros((len(U), len(HEAT)), np.float32)
    gi = {g.index: HEAT.index(g.name.split("~")[0]) for g in ob.vertex_groups}
    for v in me.vertices:
        for g in v.groups:
            W[keep[v.index], gi[g.group]] += g.weight
    return W


if CACHE and os.path.exists(CACHE):
    WH = np.load(CACHE)["W"]
else:
    import time
    t0 = time.time()
    WH = heat_weights()
    print(f"heat weights {time.time() - t0:.1f} s")
    if CACHE:
        np.savez_compressed(CACHE, W=WH)
s_ = WH.sum(1)
print("heat: verts without weight", int(((s_ < 1e-6) & ~STRAY).sum()), " sum range", s_[~STRAY].min(), s_[~STRAY].max())


# ================================================================ reshaping the weights
class Graph:
    """umbrella smoothing of per-vertex values over the welded body's edges"""

    def __init__(self, E, n):
        self.E = E
        self.deg = np.maximum(np.bincount(E.ravel(), minlength=n).astype(float), 1)

    def lap(self, X):
        acc = np.zeros_like(X)
        np.add.at(acc, self.E[:, 0], X[self.E[:, 1]])
        np.add.at(acc, self.E[:, 1], X[self.E[:, 0]])
        return acc / (self.deg[:, None] if X.ndim == 2 else self.deg) - X

    def smooth(self, X, iters, w=1.0, lam=0.5):
        w = np.asarray(w, float)
        if X.ndim == 2 and w.ndim == 1:
            w = w[:, None]
        for _ in range(iters):
            X = X + lam * w * self.lap(X)
        return X


G = Graph(EW, len(U))
WH = WH / np.maximum(WH.sum(1, keepdims=True), 1e-9)
hw = {nm: WH[:, i] for i, nm in enumerate(HEAT)}
# the parts' shares: torso, each clavicle, arm and leg (heat weights decide where one part gives way to the next)
PARTS = ["torso"] + [p + "_" + sd for sd in SIDES for p in ("clav", "arm", "leg")]
S = np.zeros((len(U), len(PARTS)))
S[:, 0] = hw["hips"] + hw["spine"] + hw["chest"] + hw["neck"] + hw["head"]
for sd in SIDES:
    S[:, PARTS.index("clav_" + sd)] = hw["clavicle_" + sd]
    S[:, PARTS.index("arm_" + sd)] = hw["upperarm_" + sd] + hw["forearm_" + sd] + hw["hand_" + sd]
    S[:, PARTS.index("leg_" + sd)] = hw["thigh_" + sd] + hw["shin_" + sd] + hw["foot_" + sd]
# smooth the junctions (shoulders, armpits, hips, groin), not the limbs' far ends
junction = ((z > 1.15) & (np.abs(x) < 0.26)) | ((z > 0.70) & (z < 1.08))
S = G.smooth(S, 40, junction & ~STRAY)
S = np.clip(S, 0, None)
S /= np.maximum(S.sum(1, keepdims=True), 1e-9)

BONES = {}  # name -> weight array over the welded body


def put(name, w):
    BONES[name] = BONES.get(name, 0) + w


# --- torso: hips, spine, chest along the height; the neck and head above, the neck's share fading out sideways
r_neck = np.hypot(x, y - JNT["neck"][1])
b1 = sstep(z, JNT["spine"][2] - 0.07, JNT["spine"][2] + 0.07)
b2 = sstep(z, JNT["chest"][2] - 0.07, JNT["chest"][2] + 0.07)
nk = sstep(z, JNT["neck"][2] - 0.025, JNT["neck"][2] + 0.03) * (1 - sstep(r_neck, 0.06, 0.09))
hd = sstep(z, JNT["head"][2] - 0.03, JNT["head"][2] + 0.005)

FING = ("index", "middle", "ring", "pinky")


def seg_dist(P_, a, b):
    ab = b - a
    t_ = np.clip((P_ - a) @ ab / (ab @ ab), 0, 1)
    return np.linalg.norm(P_ - (a + np.outer(t_, ab)), axis=1), t_


def three_way(t, lo, hi, overlap=0.1):
    """a partition of unity (a, b, c) along t: a below lo, b around the middle (a half-way helper bone), c above hi"""
    m, h = (lo + hi) / 2, (hi - lo) * overlap
    t1, t2 = sstep(t, lo, m + h), sstep(t, m - h, hi)
    return 1 - t1, t1 - t2, t2


def along(t, knots):
    """a partition of unity over len(knots) nodes: each is 1 at its knot, easing to its neighbours' knots"""
    W = []
    for k in range(len(knots)):
        w = np.ones(len(t))
        if k > 0:
            w = w * sstep(t, knots[k - 1], knots[k])
        if k < len(knots) - 1:
            w = w * (1 - sstep(t, knots[k], knots[k + 1]))
        W.append(w)
    return W


def junction_split(share, rest_cols, steps=2):
    """the part's share -> (the in-between helpers' weights..., the part's own): the helpers turn by 1/steps,
    2/steps, ... of the part's swing; the other parts give way in proportion"""
    W = along(share, list(np.linspace(0.0, 1.0, steps + 1)))
    k = W[0] / np.maximum(1 - share, 1e-9)
    for c in rest_cols:
        S[:, c] *= np.where(share < 1 - 1e-9, k, 0.0)
    return W[1:]


HELPERS = {}  # helper joints: name -> (parent, position (blender), frame of)
for sd, s in SIDES.items():
    gh, el, wr = JNT["upperarm_" + sd], JNT["forearm_" + sd], JNT["hand_" + sd]
    hp, kn, an = JNT["thigh_" + sd], JNT["shin_" + sd], JNT["foot_" + sd]
    HELPERS["x_shoulder_" + sd] = ("clavicle_" + sd, gh, "upperarm_" + sd)
    HELPERS["x_shoulder2_" + sd] = ("clavicle_" + sd, gh, "upperarm_" + sd)
    HELPERS["x_uatwist_" + sd] = ("upperarm_" + sd, gh, "upperarm_" + sd)
    HELPERS["x_uatwist2_" + sd] = ("upperarm_" + sd, gh + 0.5 * (el - gh), "upperarm_" + sd)
    HELPERS["x_elbow_" + sd] = ("upperarm_" + sd, el, "forearm_" + sd)
    HELPERS["x_fatwist1_" + sd] = ("forearm_" + sd, el + 0.5 * (wr - el), "forearm_" + sd)
    HELPERS["x_fatwist2_" + sd] = ("forearm_" + sd, el + 0.8 * (wr - el), "forearm_" + sd)
    HELPERS["x_hip_" + sd] = ("hips", hp, "thigh_" + sd)
    HELPERS["x_knee_" + sd] = ("thigh_" + sd, kn, "shin_" + sd)
for k, (_, p_, _) in HELPERS.items():
    JNT[k] = p_

for sd, s in SIDES.items():
    ca, cc, cl = PARTS.index("arm_" + sd), PARTS.index("clav_" + sd), PARTS.index("leg_" + sd)
    gh, el, wr = JNT["upperarm_" + sd], JNT["forearm_" + sd], JNT["hand_" + sd]
    hp, kn, an = JNT["thigh_" + sd], JNT["shin_" + sd], JNT["foot_" + sd]
    # --- the shoulder: torso and clavicle -> half the arm's swing -> the arm
    xs, xs2, A = junction_split(S[:, ca].copy(), [0, cc] + [PARTS.index(p + "_" + o) for o in SIDES if o != sd for p in ("clav", "arm")], 3)
    put("x_shoulder_" + sd, xs)
    put("x_shoulder2_" + sd, xs2)
    # --- the leg's junction likewise: pelvis -> half the hip's rotation -> the thigh
    xh, Lg = junction_split(S[:, cl].copy(), [0] + [PARTS.index("leg_" + o) for o in SIDES if o != sd])
    put("x_hip_" + sd, xh)
    # --- the arm: twist spread along the upper arm, the elbow's band (with a half-way bone), twist spread along the
    #     forearm, the wrist's band just past the narrowest section
    du, df = unit(el - gh), unit(wr - el)
    wu, wx, wf = three_way((U - el) @ unit(du + df), -0.035, 0.035)
    tu = (U - gh) @ du / np.linalg.norm(el - gh)
    for nm, w in zip(("x_uatwist_", "x_uatwist2_", "upperarm_"), along(tu, [0.15, 0.5, 0.85])):
        put(nm + sd, A * wu * w)
    put("x_elbow_" + sd, A * wx)
    dh = unit(JNT["hand_end_" + sd] - wr)
    s_w = sstep((U - wr) @ unit(df + dh), -0.012, 0.018)
    tf = (U - el) @ df / np.linalg.norm(wr - el)
    for nm, w in zip(("forearm_", "x_fatwist1_", "x_fatwist2_"), along(tf, [0.2, 0.5, 0.8])):
        put(nm + sd, A * wf * (1 - s_w) * w)
    H = A * wf * s_w
    # --- hand and digits
    th = [JNT["thumb1_" + sd], JNT["thumb2_" + sd], JNT["thumb3_" + sd], JNT["thumb_end_" + sd]]
    d_t = np.min([seg_dist(U, th[k], th[k + 1])[0] for k in range(3)], 0)
    m_t = 1 - sstep(d_t, 0.013, 0.026)
    dfs = []
    for f in FING:
        jj = [JNT[f + "1_" + sd], JNT[f + "2_" + sd], JNT[f + "3_" + sd], JNT[f + "_end_" + sd]]
        back = jj[0] - unit(jj[1] - jj[0]) * 0.04  # (the finger's line continued into the palm)
        dfs.append(np.min([seg_dist(U, a, b)[0] for a, b in ((back, jj[0]), (jj[0], jj[1]), (jj[1], jj[2]), (jj[2], jj[3]))], 0))
    dfs = np.array(dfs)
    m_f = np.exp(-(dfs / 0.008) ** 2)
    m_f /= np.maximum(m_f.sum(0), 1e-12)
    m_f *= 1 - m_t
    hand_left = H.copy()
    for f, m in [("thumb", m_t)] + [(f, m_f[k]) for k, f in enumerate(FING)]:
        jj = [JNT[f + "1_" + sd], JNT[f + "2_" + sd], JNT[f + "3_" + sd], JNT[f + "_end_" + sd]]
        d1, d2, d3 = unit(jj[1] - jj[0]), unit(jj[2] - jj[1]), unit(jj[3] - jj[2])
        w1 = (0.012, 0.012) if f == "thumb" else (0.012, 0.008)
        c1 = sstep((U - jj[0]) @ d1, -w1[0], w1[1])
        c2 = sstep((U - jj[1]) @ unit(d1 + d2), -0.006, 0.006)
        c3 = sstep((U - jj[2]) @ unit(d2 + d3), -0.005, 0.005)
        base = H * m * c1
        hand_left -= base
        put(f + "1_" + sd, base * (1 - c2))
        put(f + "2_" + sd, base * c2 * (1 - c3))
        put(f + "3_" + sd, base * c2 * c3)
    put("hand_" + sd, hand_left)
    # --- leg: the knee's band (with a half-way bone); the leg's end inside the shoe's collar follows the foot
    dt_, ds_ = unit(kn - hp), unit(an - kn)
    wt, wk, ws = three_way((U - kn) @ unit(dt_ + ds_), -0.04, 0.04)
    s_a = 0.8 * (1 - sstep(z, 0.095, 0.175))
    put("thigh_" + sd, Lg * wt)
    put("x_knee_" + sd, Lg * wk)
    put("shin_" + sd, Lg * ws * (1 - s_a))
    put("foot_" + sd, Lg * ws * s_a)
# (the torso's and clavicles' shares, reduced where the helpers took theirs)
T = S[:, 0]
put("hips", T * (1 - b1))
put("spine", T * b1 * (1 - b2))
put("chest", T * b2 * (1 - nk))
put("neck", T * b2 * nk * (1 - hd))
put("head", T * b2 * nk * hd)
for sd in SIDES:
    put("clavicle_" + sd, S[:, PARTS.index("clav_" + sd)])

for nm in BONES:
    BONES[nm] = np.where(STRAY, 0.0, BONES[nm])
BONES["head"] = BONES["head"] + STRAY


# ================================================================ the skeleton: hierarchy, frames (glTF space)
def orth(v, axis):
    v = np.asarray(v, float) - axis * (np.asarray(v, float) @ axis)
    return unit(v)


def limb_frame(joint, child, d_flex):
    """y up the bone (toward its parent), z against the way flexion moves the bone's far end, x = y cross z"""
    Y = unit(joint - child)
    Z = -orth(d_flex, Y)
    return np.stack([np.cross(Y, Z), Y, Z], 1)


SKEL = [("hips", None), ("spine", "hips"), ("chest", "spine"), ("neck", "chest"), ("head", "neck")]
for sd in SIDES:
    SKEL += [("clavicle_" + sd, "chest"), ("upperarm_" + sd, "clavicle_" + sd), ("forearm_" + sd, "upperarm_" + sd),
             ("hand_" + sd, "forearm_" + sd)]
    for f in FINGERS:
        SKEL += [(f + "1_" + sd, "hand_" + sd), (f + "2_" + sd, f + "1_" + sd), (f + "3_" + sd, f + "2_" + sd)]
    SKEL += [("thigh_" + sd, "hips"), ("shin_" + sd, "thigh_" + sd), ("foot_" + sd, "shin_" + sd), ("toe_" + sd, "foot_" + sd)]

SKEL += [(k, v[0]) for k, v in HELPERS.items()]
POS = {k: to_gltf(v) for k, v in JNT.items()}
ROT = {}
FWD = np.array([0.0, 0.0, 1.0])
for nm, _ in SKEL:
    if nm in HELPERS:
        continue
    base, sd = (nm.rsplit("_", 1) + [""])[:2] if "_" in nm else (nm, "")
    s = SIDES.get(sd, 1)
    if sd == "" or base == "clavicle":
        ROT[nm] = np.eye(3)
    elif base in ("upperarm", "forearm"):
        ROT[nm] = limb_frame(POS[nm], POS[{"upperarm": "forearm_", "forearm": "hand_"}[base] + sd], FWD)
    elif base == "thigh":  # (the hip flexes in the sagittal plane)
        ROT[nm] = limb_frame(POS[nm], POS["shin_" + sd], FWD)
    elif base == "shin":  # (the knee's hinge is square to the foot: a bent knee tracks over the toes)
        ROT[nm] = limb_frame(POS[nm], POS["foot_" + sd], -to_gltf(SHOE[sd]["fwd"]))
    elif base in ("foot", "toe"):
        f = to_gltf(SHOE[sd]["fwd"])
        Y = np.array([0.0, 1.0, 0.0])
        ROT[nm] = np.stack([np.cross(f, Y), Y, -f], 1)
    else:  # the hand and the digits: flexion toward the palm (the thumb's across it, toward the little finger)
        k = unit(POS["index1_" + sd] - POS["pinky1_" + sd])
        Yh = unit(POS["hand_" + sd] - POS["middle1_" + sd])
        palm = s * unit(np.cross(k, Yh))
        if base == "hand":
            ROT[nm] = limb_frame(POS[nm], POS["middle1_" + sd], palm)
        else:
            f, i = base[:-1], int(base[-1])
            nxt = POS[(f + str(i + 1) + "_" + sd) if i < 3 else (f + "_end_" + sd)]
            ROT[nm] = limb_frame(POS[nm], nxt, unit(palm - k) if f == "thumb" else palm)
for k, v in HELPERS.items():
    ROT[k] = ROT[v[2]]
PARENT = dict(SKEL)


def quat(R):
    """rotation matrix -> quaternion [x, y, z, w]"""
    m = R
    tr = m[0, 0] + m[1, 1] + m[2, 2]
    if tr > 0:
        S_ = math.sqrt(tr + 1.0) * 2
        q = [(m[2, 1] - m[1, 2]) / S_, (m[0, 2] - m[2, 0]) / S_, (m[1, 0] - m[0, 1]) / S_, 0.25 * S_]
    elif m[0, 0] > m[1, 1] and m[0, 0] > m[2, 2]:
        S_ = math.sqrt(1.0 + m[0, 0] - m[1, 1] - m[2, 2]) * 2
        q = [0.25 * S_, (m[0, 1] + m[1, 0]) / S_, (m[0, 2] + m[2, 0]) / S_, (m[2, 1] - m[1, 2]) / S_]
    elif m[1, 1] > m[2, 2]:
        S_ = math.sqrt(1.0 + m[1, 1] - m[0, 0] - m[2, 2]) * 2
        q = [(m[0, 1] + m[1, 0]) / S_, 0.25 * S_, (m[1, 2] + m[2, 1]) / S_, (m[0, 2] - m[2, 0]) / S_]
    else:
        S_ = math.sqrt(1.0 + m[2, 2] - m[0, 0] - m[1, 1]) * 2
        q = [(m[0, 2] + m[2, 0]) / S_, (m[1, 2] + m[2, 1]) / S_, 0.25 * S_, (m[1, 0] - m[0, 1]) / S_]
    q = np.array(q)
    return (q / np.linalg.norm(q)).tolist()


# ================================================================ the weights, 4 per vertex
NAMES = [nm for nm, _ in SKEL]
Wb = np.zeros((len(U), len(NAMES)))
for nm, w in BONES.items():
    Wb[:, NAMES.index(nm)] = np.clip(w, 0, None)
Wb /= Wb.sum(1, keepdims=True)


def top4(W, scale):
    k = np.argsort(-W, 1)[:, :4]
    w = np.take_along_axis(W, k, 1)
    w /= w.sum(1, keepdims=True)
    q = np.round(w * scale).astype(np.int64)
    q[:, 0] += scale - q.sum(1)  # (exact sums: the largest takes the rounding)
    k = np.where(q > 0, k, 0)
    return k, q


bj, bw = top4(Wb[WELD], 65535)  # back to the exported (unwelded) vertex order
lost = 1 - np.sort(Wb, 1)[:, -4:].sum(1)
print(f"weights: max share beyond the top 4 {lost.max():.3f} (verts > 2 %: {(lost > 0.02).sum()})")

# the shoes: rigid to the foot, flexing across the ball of the foot into the toe bone
sj = np.zeros((len(SP), 4), np.int64)
sw = np.zeros((len(SP), 4), np.int64)
for sd, s in SIDES.items():
    m = s * SP[:, 0] > 0
    sh = SHOE[sd]
    along = (SP[m] - sh["centre"]) @ sh["fwd"]
    t_ = sstep(along, sh["ball"] - 0.022, sh["ball"] + 0.018)
    q = np.round(t_ * 255).astype(np.int64)
    sj[m, 0], sj[m, 1] = NAMES.index("foot_" + sd), NAMES.index("toe_" + sd)
    sw[m, 0], sw[m, 1] = 255 - q, q

# ================================================================ write the glTF
J, B = json.loads(json.dumps(J0)), bytearray(B0)
first = len(J["nodes"])
WROT = {nm: ROT[nm] for nm in NAMES}
for nm in NAMES:
    p = PARENT[nm]
    if p is None:
        t_, R = POS[nm], ROT[nm]
    else:
        t_, R = ROT[p].T @ (POS[nm] - POS[p]), ROT[p].T @ ROT[nm]
    nd = {"name": nm, "translation": np.round(t_, 6).tolist()}
    if not np.allclose(R, np.eye(3)):
        nd["rotation"] = quat(R)
    J["nodes"].append(nd)
for nm in NAMES:
    if PARENT[nm] is not None:
        J["nodes"][first + NAMES.index(PARENT[nm])].setdefault("children", []).append(first + NAMES.index(nm))
ibm = []
for nm in NAMES:
    M = np.eye(4)
    M[:3, :3] = ROT[nm].T
    M[:3, 3] = -ROT[nm].T @ POS[nm]
    ibm.append(M.T.ravel())  # (column-major)
J["skins"] = [{"name": "bot", "joints": list(range(first, first + len(NAMES))), "skeleton": first,
               "inverseBindMatrices": add_accessor(J, B, np.array(ibm, np.float32), 5126, "MAT4")}]
for node, jj, ww, ct in ((BODY_NODE, bj, bw, 5123), (SHOE_NODE, sj, sw, 5121)):
    pr = J["meshes"][J["nodes"][node]["mesh"]]["primitives"][0]
    pr["attributes"]["JOINTS_0"] = add_accessor(J, B, jj, 5121, "VEC4", 34962)
    pr["attributes"]["WEIGHTS_0"] = add_accessor(J, B, ww, ct, "VEC4", 34962, normalized=True)
    J["nodes"][node]["skin"] = 0
# the head: rigid, a child of the head joint (its vertices stay where they are: the node undoes the joint's transform)
hj = first + NAMES.index("head")
Rh, ph = ROT["head"], POS["head"]
J["nodes"][HEAD_NODE]["translation"] = (-Rh.T @ ph).tolist()
if not np.allclose(Rh, np.eye(3)):
    J["nodes"][HEAD_NODE]["rotation"] = quat(Rh.T)
J["nodes"][hj].setdefault("children", []).append(HEAD_NODE)
J["scenes"][0]["nodes"] = [n for n in J["scenes"][0]["nodes"] if n != HEAD_NODE] + [first]
J["asset"]["generator"] = "LingJI blender/rig_bot.py"
J["extras"] = {"joints": {nm: np.round(POS[nm], 5).tolist() for nm in NAMES}}
write_glb(OUT, J, B)
print("wrote", OUT, os.path.getsize(OUT), "bytes,", len(NAMES), "joints")

# ================================================================ data for engine2/botrig.js's pose functions
# (the leg chain's rest transforms and the left sole's contact points, for placing the feet on the floor without
# loading the model; botrig.js checks them against the file's extras)
CHAIN = ["hips", "thigh_L", "shin_L", "foot_L", "toe_L"]
legrest = {}
for nm in CHAIN:
    nd = J["nodes"][first + NAMES.index(nm)]
    legrest[nm] = [round(v, 5) for v in nd["translation"]] + [round(v, 6) for v in nd.get("rotation", [0, 0, 0, 1])]
sh = SHOE["L"]
qL = SP[SP[:, 0] > 0]
alongL = (qL - sh["centre"]) @ sh["fwd"]
side_ax = np.array([-sh["fwd"][1], sh["fwd"][0], 0.0])
acrossL = (qL - sh["centre"]) @ side_ax
pts = []
for a_ in np.arange(sh["heel"] + 0.002, sh["tip"] - 0.001, 0.012):
    for c_ in (-0.022, 0.0, 0.022):
        m = (np.abs(alongL - a_) < 0.004) & (np.abs(acrossL - c_) < 0.006) & (qL[:, 2] < 0.05)
        if m.any():
            pts.append(qL[m][np.argmin(qL[m][:, 2])])
for a_ in (sh["heel"], sh["tip"]):  # the rounded heel and toe: their profiles
    for zz in (0.006, 0.014, 0.024):
        m = (np.abs(qL[:, 2] - zz) < 0.002) & (np.abs(acrossL) < 0.008)
        q_ = qL[m]
        pts.append(q_[np.argmin(q_ @ sh["fwd"])] if a_ == sh["heel"] else q_[np.argmax(q_ @ sh["fwd"])])
pts = np.array(pts)
ball_along = sh["ball"]
sole = {"foot": [], "toe": []}
for p_ in pts:
    a_ = (p_ - sh["centre"]) @ sh["fwd"]
    b_ = "toe_L" if a_ > ball_along else "foot_L"
    loc = ROT[b_].T @ (to_gltf(p_) - POS[b_])
    sole["toe" if b_ == "toe_L" else "foot"].append([round(v, 4) for v in loc])
J["extras"]["legrest"] = legrest
J["extras"]["sole"] = sole
# points on the hands, each in a bone's local frame: the palm's centre, a grip point (where a held object's centre
# sits in a curled hand), the fingertips
pts = {}
for sd, s in SIDES.items():
    k = unit(POS["index1_" + sd] - POS["pinky1_" + sd])
    Yh = unit(POS["hand_" + sd] - POS["middle1_" + sd])
    palm_n = s * unit(np.cross(k, Yh))
    c = (POS["hand_" + sd] * 0.35 + (POS["index1_" + sd] + POS["middle1_" + sd] + POS["ring1_" + sd] + POS["pinky1_" + sd]) * 0.65 / 4)
    loc = lambda b, p_: [round(v, 4) for v in ROT[b].T @ (p_ - POS[b])]
    pts["palm_" + sd] = ["hand_" + sd, loc("hand_" + sd, c + palm_n * 0.012)]
    pts["grip_" + sd] = ["hand_" + sd, loc("hand_" + sd, c + palm_n * 0.045)]
    for f in FINGERS:
        pts[f + "_tip_" + sd] = [f + "3_" + sd, loc(f + "3_" + sd, POS[f + "_end_" + sd])]
J["extras"]["points"] = pts
write_glb(OUT, J, B)
print("LEGREST =", json.dumps(legrest))
print("SOLE =", json.dumps(sole))
