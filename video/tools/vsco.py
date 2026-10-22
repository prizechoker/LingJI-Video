"""Sampled instruments from the VSCO-2 Community Edition (CC0, https://github.com/sgossner/VSCO-2-CE): string sections,
contrabass, harp, glockenspiel, timpani. Sample names use the C3 = MIDI 60 convention (one octave above scientific
pitch). Files are loaded on first use and cached. 48 kHz stereo float32, like tools/audiolib.py.

  VSCO=/path/to/vsco-2-ce  (default /home/user/sgossner/vsco-2-ce)
"""
import glob
import os
import re

import numpy as np
import soundfile as sf

from audiolib import SR, env_adsr, tosr, stereo, NOTE

ROOT = os.environ.get("VSCO", "/home/user/sgossner/vsco-2-ce")
FAMILIES = {
    "violins": ("Strings/Violin Section/susVib/*.wav", r"_([A-G]#?-?\d)_v(\d)"),
    "violas": ("Strings/Viola Section/susvib/*.wav", r"_([A-G]#?-?\d)_v(\d)"),
    "cellos": ("Strings/Cello Section/susvib/*.wav", r"_([A-G]#?-?\d)_v(\d)"),
    "basses": ("Strings/Solo Contrabass/SusNV/*.wav", r"_([A-G]#?-?\d)_v(\d)"),
    "harp": ("Strings/Harp/*.wav", r"_([A-G]#?-?\d)_(\w+)\.wav"),
    "glock": ("Percussion/Glock/*.wav", r"_([A-G]#?-?\d)\.wav"),
}
_INDEX = {}
_CACHE = {}


def name2midi(n):
    m = re.match(r"([A-G]#?)(-?\d)", n)
    return NOTE[m.group(1)] + 12 * (int(m.group(2)) + 1) + 12  # C3 = 60 naming


def index(fam):
    if fam not in _INDEX:
        pat, rx = FAMILIES[fam]
        out = []
        for f in sorted(glob.glob(os.path.join(ROOT, pat))):
            m = re.search(rx, os.path.basename(f))
            if not m:
                continue
            dyn = m.group(2) if len(m.groups()) > 1 else "1"
            dyn = int(dyn) if dyn.isdigit() else {"p": 1, "mp": 1, "mf": 2, "f": 3, "ff": 4}.get(dyn, 2)
            out.append((name2midi(m.group(1)), dyn, f))
        _INDEX[fam] = out
    return _INDEX[fam]


def load(f):
    if f not in _CACHE:
        y, sr = sf.read(f, dtype="float32")
        y = tosr(stereo(y), sr)
        # trim the silence before the note
        a = np.max(np.abs(y), 1)
        k = int(np.argmax(a > 0.02 * a.max()))
        _CACHE[f] = y[max(0, k - int(0.004 * SR)):]
    return _CACHE[f]


def pick(fam, midi, vel):
    idx = index(fam)
    dyns = sorted({d for _, d, _ in idx})
    want = dyns[min(len(dyns) - 1, int(vel * len(dyns)))]
    cands = [x for x in idx if x[1] == want] or idx
    m, d, f = min(cands, key=lambda x: (abs(x[0] - midi), x[0] < midi))
    return m, load(f)


def shift(y, semis):
    if abs(semis) < 1e-3:
        return y
    ratio = 2 ** (semis / 12)
    i = np.arange(0, len(y) - 1, ratio)
    return np.stack([np.interp(i, np.arange(len(y)), y[:, c]) for c in (0, 1)], 1).astype(np.float32)


def strings(fam, midi, dur, vel=0.4, attack=0.4, release=1.2):
    """a sustained section note of any length: the sample's steady part looped with long crossfades"""
    src, y = pick(fam, midi, vel)
    y = shift(y, midi - src)
    need = int((dur + release) * SR)
    L = len(y)
    if L >= need:
        out = y[:need].copy()
    else:
        tail, xf = int(1.2 * SR), int(0.8 * SR)
        body = y[int(1.0 * SR): L - tail]
        out = np.zeros((need, 2), np.float32)
        p = L - tail - xf
        out[:p + xf] = y[:p + xf]
        fin, fout = np.sqrt(np.linspace(0, 1, xf))[:, None], np.sqrt(np.linspace(1, 0, xf))[:, None]
        while p < need:
            out[p: p + xf] *= fout[: len(out[p: p + xf])]
            seg = body[: min(len(body), need - p)].copy()
            n = min(xf, len(seg))
            seg[:n] *= fin[:n]
            out[p: p + len(seg)] += seg
            if len(seg) <= xf:
                break
            p += len(seg) - xf
    e = env_adsr(need, a=attack, d=0.3, s=1.0, r=release)
    return out * e[:, None] * (0.6 + 0.6 * vel)


def harp(midi, vel=0.5, dur=4.0):
    src, y = pick("harp", midi, vel)
    y = shift(y, midi - src)[: int(dur * SR)].copy()
    y[-int(0.3 * SR):] *= np.linspace(1, 0, int(0.3 * SR))[:, None]
    return y * (0.4 + 0.8 * vel)


def glock(midi, vel=0.4, dur=3.0):
    src, y = pick("glock", midi, vel)
    y = shift(y, midi - src)[: int(dur * SR)].copy()
    y[-int(0.3 * SR):] *= np.linspace(1, 0, int(0.3 * SR))[:, None]
    return y * vel


def timpani(vel=0.6, drum=2):
    fs = sorted(glob.glob(os.path.join(ROOT, f"Percussion/Timpani/Timpani{drum}_Hit_v*_rr1_Sum.wav")))
    if not fs:
        fs = sorted(glob.glob(os.path.join(ROOT, "Percussion/Timpani/Timpani*_Hit_*.wav")))
    f = fs[min(len(fs) - 1, int(vel * len(fs)))]
    return load(f) * (0.5 + 0.6 * vel)


def timp_roll(dur=3.0, vel=0.5):
    fs = sorted(glob.glob(os.path.join(ROOT, "Percussion/Timpani/Rolls/*.wav")))
    if not fs:
        return np.zeros((int(dur * SR), 2), np.float32)
    y = load(fs[min(len(fs) - 1, 1)])[: int(dur * SR)].copy()
    n = len(y)
    y *= np.linspace(0.2, 1, n)[:, None] ** 2
    return y * vel
