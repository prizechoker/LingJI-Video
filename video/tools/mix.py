"""Mix narration + score + sound design into the final soundtrack (48 kHz stereo, -14 LUFS, -1 dBTP)."""
import json

import librosa
import numpy as np
import pyloudnorm as pyln
import soundfile as sf
from scipy.ndimage import maximum_filter1d
from scipy.signal import butter, sosfilt

SR = 48000


def bq(x, kind, f, order=2):
    return sosfilt(butter(order, f, btype=kind, fs=SR, output="sos"), x, axis=0)


def env_follow(x, attack=0.01, release=0.15, rate=SR):
    a = np.exp(-1 / (attack * rate))
    r = np.exp(-1 / (release * rate))
    e = np.empty_like(x)
    cur = 0.0
    for i, v in enumerate(x):
        cur = a * cur + (1 - a) * v if v > cur else r * cur + (1 - r) * v
        e[i] = cur
    return e


def compress(x, thr_db=-22, ratio=2.5, attack=0.008, release=0.12, makeup_db=0):
    mono = np.abs(x).max(1) if x.ndim > 1 else np.abs(x)
    # subsample the detector for speed, then upsample the gain
    k = 48
    det = env_follow(maximum_filter1d(mono, k)[::k], attack, release, rate=SR / k)
    lvl = 20 * np.log10(np.maximum(det, 1e-6))
    over = np.maximum(0, lvl - thr_db)
    gr_db = -over * (1 - 1 / ratio) + makeup_db
    g = 10 ** (gr_db / 20)
    g = np.repeat(g, k)[: len(x)]
    return x * (g[:, None] if x.ndim > 1 else g)


def rms_compress(x, thr_db=-21, ratio=4.0, attack=0.02, release=0.35):
    """bus compressor with an RMS (loudness-like) detector: tames hits and swells, leaves the texture alone"""
    k = 48
    pw = (x ** 2).mean(1)
    pw = pw[: len(pw) // k * k].reshape(-1, k).mean(1)
    env = env_follow(pw, attack, release, rate=SR / k)
    lvl = 10 * np.log10(np.maximum(env, 1e-12))
    gr_db = -np.maximum(0, lvl - thr_db) * (1 - 1 / ratio)
    g = np.repeat(10 ** (gr_db / 20), k)
    g = np.pad(g, (0, len(x) - len(g)), mode="edge")
    return x * g[:, None]


def deess(x, f=6500, thr_db=-30, ratio=4):
    band = bq(x, "highpass", f, 4)
    rest = x - band
    return rest + compress(band, thr_db, ratio, 0.002, 0.05)


def limiter(x, ceiling_db=-1.2, release=0.06):
    c = 10 ** (ceiling_db / 20)
    peak = np.abs(x).max(1)
    look = int(0.003 * SR)
    pk = maximum_filter1d(peak, 2 * look + 1)
    g = np.minimum(1.0, c / np.maximum(pk, 1e-9))
    r = np.exp(-1 / (release * SR))
    out = np.empty_like(g)
    cur = 1.0
    for i in range(len(g)):
        cur = g[i] if g[i] < cur else r * cur + (1 - r) * g[i]
        out[i] = cur
    return x * out[:, None]


meter = pyln.Meter(SR)
narr, sr = sf.read("audio/narration_raw.wav", dtype="float32")
narr = librosa.resample(narr, orig_sr=sr, target_sr=SR)
music, _ = sf.read("audio/music.wav", dtype="float32")
sfx, _ = sf.read("audio/sfx.wav", dtype="float32")
n = max(len(narr), len(music))
pad = lambda a: np.pad(a, ((0, n - len(a)),) + ((0, 0),) * (a.ndim - 1))
narr, music, sfx = pad(narr), pad(music), pad(sfx)

# ---- voice chain: high-pass, warmth + presence, de-ess, gentle compression
v = bq(narr, "highpass", 75, 2)
v = v + 0.18 * bq(v, "bandpass", [160, 320]) + 0.22 * bq(v, "bandpass", [2500, 5000])
v = deess(v, 6800, -32, 3.5)
v = compress(v, -24, 2.2, 0.006, 0.15)
v_l = meter.integrated_loudness(np.stack([v, v], 1))
v = v * 10 ** ((-16.5 - v_l) / 20)
voice = np.stack([v, v], 1)

# ---- ducking: speech envelope pulls the music down ~9 dB, sfx ~3 dB
speech = env_follow(maximum_filter1d(np.abs(v), 480)[::48], 0.12, 1.2, rate=SR / 48)
speech = np.repeat(speech, 48)[:n]
act = np.clip(speech / (np.percentile(speech[speech > 1e-4], 60) + 1e-9), 0, 1)
duck_m = 10 ** (-9.0 * act / 20)
duck_s = 10 ** (-3.0 * act / 20)

# ---- music leveller: the score's soft passages sit ~20 dB under its swells, which under a voice and ducking falls
# below hearing on a phone; lift them (slowly, up to 12 dB) toward the body of the score, leave silences silent
k = 480
mp = (music ** 2).mean(1)
mp = mp[: len(mp) // k * k].reshape(-1, k).mean(1)
win = int(2.0 * SR / k)
env_db = 10 * np.log10(np.convolve(mp, np.ones(win) / win, mode="same") + 1e-12)
lift = np.clip(-30.0 - env_db, 0, 12) * (env_db > -62)
sm = int(1.5 * SR / k)
lift = np.convolve(lift, np.ones(sm) / sm, mode="same")
lift = np.pad(np.repeat(lift, k), (0, len(music) - len(lift) * k), mode="edge")
music = music * (10 ** (lift / 20))[:, None]
m_l = meter.integrated_loudness(music + 1e-9)
music = music * 10 ** ((-19.0 - m_l) / 20)
s_l = meter.integrated_loudness(sfx + 1e-9)
sfx = sfx * 10 ** ((-25.0 - s_l) / 20)
# bus compression on music + sfx: hits and swells stay below the voice instead of jumping over it
bed = rms_compress(music * duck_m[:, None] + sfx * duck_s[:, None], thr_db=-21, ratio=4.0)
mix = voice + bed

# ---- master
mix = bq(mix, "highpass", 25, 2)
l0 = meter.integrated_loudness(mix)
g0 = 10 ** ((-14.0 - l0) / 20)
mix = limiter(mix * g0, -1.2)
# the limiter shaves a little loudness off the peaks: correct once and limit again
l1 = meter.integrated_loudness(mix)
mix = limiter(mix * 10 ** ((-14.0 - l1) / 20), -1.2)
l1 = meter.integrated_loudness(mix)
# bed stem (music + sfx as heard under the voice), for review plots
sf.write("audio/bed.wav", (bed * g0).astype(np.float32), SR, subtype="PCM_24")
sf.write("audio/mix.wav", mix.astype(np.float32), SR, subtype="PCM_24")
sf.write("audio/voice_proc.wav", (voice * g0).astype(np.float32), SR, subtype="PCM_24")
stats = dict(lufs=round(float(l1), 2), peak_db=round(float(20 * np.log10(np.abs(mix).max())), 2), voice_lufs=round(float(meter.integrated_loudness(voice * g0)), 2),
             music_under_voice_db=round(float(20 * np.log10(np.mean(duck_m[act > 0.8]) + 1e-9)), 1))
json.dump(stats, open("audio/mix_stats.json", "w"), indent=1)
print(stats)
