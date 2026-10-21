"""Small sample-based + synthesis toolkit for the score and sound design (48 kHz stereo float32)."""
import glob
import os
import re

import numpy as np
import soundfile as sf
from scipy.signal import butter, fftconvolve, resample_poly, sosfilt

SR = 48000
RNG = np.random.default_rng(7)
SAMPLES = os.environ.get("SAMPLES", "/opt/work/music/samples")
NOTE = {"C": 0, "C#": 1, "D": 2, "D#": 3, "E": 4, "F": 5, "F#": 6, "G": 7, "G#": 8, "A": 9, "A#": 10, "B": 11}


def n2m(name):
    m = re.match(r"([A-G]#?|[A-G]b)(-?\d)", name)
    p, o = m.group(1), int(m.group(2))
    if "b" in p:
        p = {"Db": "C#", "Eb": "D#", "Gb": "F#", "Ab": "G#", "Bb": "A#"}[p]
    return NOTE[p] + 12 * (o + 1)


def mhz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def stereo(x):
    return np.stack([x, x], 1) if x.ndim == 1 else x


def tosr(x, sr):
    if sr == SR:
        return x
    from math import gcd
    g = gcd(sr, SR)
    return resample_poly(x, SR // g, sr // g, axis=0).astype(np.float32)


def bq(x, kind, f, order=2):
    sos = butter(order, f, btype=kind, fs=SR, output="sos")
    return sosfilt(sos, x, axis=0).astype(np.float32)


def env_adsr(n, a=0.01, d=0.1, s=0.8, r=0.3, sus_len=None):
    a_n, d_n, r_n = int(a * SR), int(d * SR), int(r * SR)
    sus = n - a_n - d_n - r_n if sus_len is None else int(sus_len * SR)
    sus = max(0, sus)
    e = np.concatenate([np.linspace(0, 1, max(1, a_n)), np.linspace(1, s, max(1, d_n)), np.full(sus, s), np.linspace(s, 0, max(1, r_n))])
    if len(e) < n:
        e = np.pad(e, (0, n - len(e)))
    return e[:n].astype(np.float32)


class Track:
    """A stereo buffer you can place sounds onto by time."""

    def __init__(self, dur):
        self.buf = np.zeros((int(dur * SR) + SR, 2), np.float32)

    def add(self, t, x, gain=1.0, pan=0.0):
        x = stereo(np.asarray(x, np.float32))
        i = int(round(t * SR))
        if i < 0:
            x = x[-i:]
            i = 0
        j = min(len(self.buf), i + len(x))
        if j <= i:
            return
        l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
        self.buf[i:j, 0] += x[: j - i, 0] * gain * l * 1.414
        self.buf[i:j, 1] += x[: j - i, 1] * gain * r * 1.414


# ------------------------------------------------------------------ samplers
_PIANO = None


def _load_piano():
    global _PIANO
    _PIANO = {}
    for f in glob.glob(os.path.join(SAMPLES, "upright/*/samples/*.flac")):
        name = os.path.basename(f)[:-5]
        m = re.match(r"([A-G]#?\d)v([LH])", name)
        if not m:
            continue
        y, sr = sf.read(f, dtype="float32")
        _PIANO[(n2m(m.group(1)), m.group(2))] = tosr(stereo(y), sr)


def piano(midi, vel=0.6, dur=2.0, release=0.6):
    if _PIANO is None:
        _load_piano()
    layer = "H" if vel > 0.55 else "L"
    keys = sorted({k[0] for k in _PIANO if k[1] == layer})
    src = min(keys, key=lambda k: abs(k - midi))
    y = _PIANO[(src, layer)]
    ratio = 2 ** ((midi - src) / 12)
    if abs(ratio - 1) > 1e-4:
        idx = np.arange(0, len(y) - 1, ratio)
        y = np.stack([np.interp(idx, np.arange(len(y)), y[:, c]) for c in (0, 1)], 1).astype(np.float32)
    n = min(len(y), int((dur + release) * SR))
    y = y[:n].copy()
    k = int(dur * SR)
    if k < n:
        y[k:] *= np.exp(-np.arange(n - k) / (release * SR / 5))[:, None]
    g = 0.55 + 0.45 * vel if layer == "H" else 0.7 + 0.5 * vel
    return y * g


_CELLO = None


def _load_cello():
    global _CELLO
    _CELLO = {}
    for f in glob.glob(os.path.join(SAMPLES, "cello/notes/cello_*_*.wav")):
        _, dyn, m = os.path.basename(f)[:-4].split("_")
        y, sr = sf.read(f, dtype="float32")
        _CELLO[(int(m), dyn)] = tosr(stereo(y), sr)


def cello(midi, dur=4.0, dyn="pp", attack=0.5, release=1.2):
    if _CELLO is None:
        _load_cello()
    keys = sorted({k[0] for k in _CELLO if k[1] == dyn}) or sorted({k[0] for k in _CELLO})
    src = min(keys, key=lambda k: abs(k - midi))
    y = _CELLO.get((src, dyn)) if (src, dyn) in _CELLO else _CELLO[(src, "pp")]
    ratio = 2 ** ((midi - src) / 12)
    if abs(ratio - 1) > 1e-4:
        idx = np.arange(0, len(y) - 1, ratio)
        y = np.stack([np.interp(idx, np.arange(len(y)), y[:, c]) for c in (0, 1)], 1).astype(np.float32)
    # skip the bow attack transient, loop the steady middle with crossfades for long notes
    body = y[int(0.25 * SR): max(int(0.25 * SR) + SR, len(y) - int(0.4 * SR))]
    need = int((dur + release) * SR)
    out = np.zeros((need, 2), np.float32)
    pos, xf = 0, int(0.35 * SR)
    while pos < need:
        seg = body[: min(len(body), need - pos)].copy()
        if pos > 0:
            seg[:xf] *= np.linspace(0, 1, min(xf, len(seg)))[:, None][: len(seg[:xf])]
        if len(seg) > xf:
            seg[-xf:] *= np.linspace(1, 0, xf)[:, None]
        out[pos: pos + len(seg)] += seg
        pos += max(1, len(seg) - xf)
    e = env_adsr(need, a=attack, d=0.2, s=1.0, r=release)
    return out * e[:, None]


# ------------------------------------------------------------------ synths
def soft_saw(f, n, harmonics=10, bright=1.0):
    t = np.arange(n) / SR
    y = np.zeros(n, np.float32)
    for h in range(1, harmonics + 1):
        if f * h > 9000:
            break
        y += np.sin(2 * np.pi * f * h * t + RNG.uniform(0, 6.28)) * (1 / h) * np.exp(-(h - 1) * 0.18 / bright)
    return y


def pad(midis, dur, a=1.6, r=2.4, bright=0.8, detune=0.004):
    n = int((dur + r) * SR)
    L = np.zeros(n, np.float32)
    R = np.zeros(n, np.float32)
    for m in midis:
        f = mhz(m)
        for d, side in ((-detune, 0), (0.0, 2), (detune, 1)):
            v = soft_saw(f * (1 + d), n, 9, bright)
            if side == 0:
                L += v * 0.8; R += v * 0.4
            elif side == 1:
                R += v * 0.8; L += v * 0.4
            else:
                L += v * 0.6; R += v * 0.6
    y = np.stack([L, R], 1) / max(1, len(midis) * 2.2)
    e = env_adsr(n, a=a, d=0.5, s=0.9, r=r)
    lfo = 1 + 0.06 * np.sin(2 * np.pi * 0.17 * np.arange(n) / SR)
    y = y * (e * lfo)[:, None]
    return bq(y, "lowpass", 2200 * bright + 400)


def pluck(midi, dur=1.2, bright=0.5):
    """Karplus-Strong plucked string"""
    f = mhz(midi)
    N = int(SR / f)
    n = int(dur * SR)
    buf = RNG.uniform(-1, 1, N).astype(np.float32)
    buf = bq(np.concatenate([buf, buf]), "lowpass", 1500 + 4000 * bright)[:N]
    out = np.zeros(n, np.float32)
    decay = 0.996
    for i in range(n):
        out[i] = buf[i % N]
        buf[i % N] = decay * 0.5 * (buf[i % N] + buf[(i + 1) % N])
    out *= env_adsr(n, a=0.002, d=0.05, s=1, r=0.2)
    return stereo(out * 0.6)


def bell(midi, dur=2.5, vel=0.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = mhz(midi)
    y = np.zeros(n, np.float32)
    for k, (ratio, amp, dec) in enumerate([(1, 1, 1.6), (2.0, 0.35, 1.0), (3.01, 0.18, 0.6), (4.2, 0.08, 0.35)]):
        y += amp * np.sin(2 * np.pi * f * ratio * t) * np.exp(-t / dec)
    y *= env_adsr(n, a=0.004, d=0.1, s=1, r=0.2) * vel * 0.4
    return stereo(y)


def pulse(midi, dur=0.18, vel=0.6):
    """soft mallet (marimba-like): fundamental + quickly decaying 4th partial"""
    n = int((dur + 0.45) * SR)
    t = np.arange(n) / SR
    f = mhz(midi)
    y = np.sin(2 * np.pi * f * t) * np.exp(-t / 0.28) + 0.35 * np.sin(2 * np.pi * 4 * f * t) * np.exp(-t / 0.03) + 0.12 * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t / 0.12)
    y *= env_adsr(n, a=0.002, d=0.05, s=1, r=0.08)
    return stereo(bq(y * vel * 0.5, "lowpass", 2600))


def sub(midi, dur, a=1.0, r=1.5, vel=0.6):
    n = int((dur + r) * SR)
    t = np.arange(n) / SR
    y = np.sin(2 * np.pi * mhz(midi) * t) * env_adsr(n, a=a, d=0.3, s=1, r=r) * vel
    return stereo(y.astype(np.float32))


def kick(vel=0.7):
    n = int(0.5 * SR)
    t = np.arange(n) / SR
    f = 45 + 80 * np.exp(-t / 0.035)
    y = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.18)
    return stereo((y * vel).astype(np.float32))


def noise(n):
    return RNG.uniform(-1, 1, n).astype(np.float32)


def tick(vel=0.5, f=3200):
    n = int(0.06 * SR)
    t = np.arange(n) / SR
    y = (np.sin(2 * np.pi * f * t) * 0.6 + noise(n) * 0.4) * np.exp(-t / 0.006)
    return stereo(bq(y * vel, "highpass", 1200))


def whoosh(dur=0.9, vel=0.5, up=True):
    n = int(dur * SR)
    x = noise(n)
    t = np.linspace(0, 1, n)
    out = np.zeros(n, np.float32)
    # sweep a band-pass by chunks
    chunk = 1024
    for i in range(0, n, chunk):
        u = t[i] if up else 1 - t[i]
        fc = 300 + 5000 * u ** 2
        seg = x[max(0, i - 2048): i + chunk]
        sos = butter(2, [fc * 0.7, min(fc * 1.4, 20000)], btype="bandpass", fs=SR, output="sos")
        y = sosfilt(sos, seg)
        out[i: i + chunk] = y[-len(out[i: i + chunk]):]
    e = np.sin(np.pi * t) ** 1.5
    y = out * e * vel
    L = y * np.linspace(1.2, 0.6, n)
    R = y * np.linspace(0.6, 1.2, n)
    return np.stack([L, R], 1).astype(np.float32)


def riser(dur=2.0, vel=0.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    u = t / dur
    f = 180 * 2 ** (u * 2.5)
    tone = np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.25
    nz = bq(noise(n), "highpass", 800) * 0.6
    y = (tone + nz * u) * (u ** 2) * vel
    return stereo(bq(y, "lowpass", 9000))


def impact(vel=0.8):
    n = int(3.0 * SR)
    t = np.arange(n) / SR
    boom = np.sin(2 * np.pi * np.cumsum(38 + 50 * np.exp(-t / 0.08)) / SR) * np.exp(-t / 0.9)
    hit = bq(noise(n), "lowpass", 2500) * np.exp(-t / 0.05) * 0.4
    return stereo(((boom + hit) * vel).astype(np.float32))


def stone_click(vel=0.8):
    """a go stone landing on wood: bright click + short woody body"""
    n = int(0.35 * SR)
    t = np.arange(n) / SR
    click = noise(n) * np.exp(-t / 0.0012)
    modes = sum(a * np.sin(2 * np.pi * f * t) * np.exp(-t / d) for f, a, d in ((2350, 0.5, 0.018), (3900, 0.3, 0.012), (1100, 0.35, 0.03), (520, 0.4, 0.05)))
    y = bq(click * 0.8, "highpass", 1500) + modes * 0.6
    return stereo((y * vel).astype(np.float32))


def shimmer(dur=2.0, vel=0.3, base=86):
    n = int(dur * SR)
    out = np.zeros(n, np.float32)
    for k in range(18):
        st = int(RNG.uniform(0, 0.7) * n)
        m = base + RNG.choice([0, 3, 5, 7, 10, 12, 15])
        b = bell(m, dur=1.2, vel=RNG.uniform(0.2, 0.5))[:, 0]
        j = min(n, st + len(b))
        out[st:j] += b[: j - st]
    return stereo(out * vel)


# ------------------------------------------------------------------ fx
def reverb_ir(rt60=2.6, pre=0.02, lp=6000, seed=3):
    r = np.random.default_rng(seed)
    n = int(rt60 * SR)
    t = np.arange(n) / SR
    decay = np.exp(-6.9 * t / rt60)
    irs = []
    for c in range(2):
        x = r.uniform(-1, 1, n) * decay
        x = bq(x.astype(np.float32), "lowpass", lp)
        x = np.concatenate([np.zeros(int(pre * SR), np.float32), x])
        irs.append(x / np.sqrt(np.sum(x ** 2)))
    return np.stack(irs, 1)


def reverb(x, ir, wet=0.3):
    x = stereo(x)
    y = np.stack([fftconvolve(x[:, c], ir[:, c])[: len(x)] for c in (0, 1)], 1).astype(np.float32)
    return x * (1 - wet) + y * wet


def delay(x, t=0.469, fb=0.35, mix=0.25):
    x = stereo(x)
    d = int(t * SR)
    y = x.copy()
    tap = x.copy()
    for k in range(1, 5):
        tap = np.pad(tap, ((d, 0), (0, 0)))[: len(x)] * fb
        tap = tap[:, ::-1]  # ping-pong
        y += tap * mix / fb
    return y


def limiter(x, ceiling=0.89, release=0.08):
    """simple look-ahead peak limiter"""
    peak = np.max(np.abs(x), 1)
    look = int(0.004 * SR)
    pk = np.maximum.accumulate(np.pad(peak, (0, look))[look:][::-1])[::-1] if False else peak
    g = np.minimum(1.0, ceiling / np.maximum(pk, 1e-9))
    # smooth gain (fast attack, slow release)
    out = np.empty_like(g)
    cur = 1.0
    a_rel = np.exp(-1 / (release * SR))
    for i in range(len(g)):
        cur = g[i] if g[i] < cur else a_rel * cur + (1 - a_rel) * g[i]
        out[i] = cur
    shifted = np.pad(out, (0, look))[look:]
    gg = np.minimum(out, shifted)
    return x * gg[:, None]
