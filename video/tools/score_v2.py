"""The v2.2 score and sound design, locked to the narration and the film's timeline.

Writes audio/music.wav and audio/sfx.wav (48 kHz stereo). D minor; the "stone" motif A4-D5-E5-F5 (then E5-D5) is
the thread: first sparse in the hook, whole at Lee Sedol's words, recalled at the operator's hands, and resolved to
D major as the robot catches the bowl. Instruments: the KW upright piano (audiolib), VSCO-2 CE string sections, harp,
glockenspiel and timpani (tools/vsco.py, CC0), a few soft synth layers. Run in the asr venv from video/:
  python tools/score_v2.py
"""
import json
import sys

import numpy as np
import soundfile as sf

sys.path.insert(0, "tools")
import build_timeline as BT  # noqa: E402  (narration anchors)
import vsco  # noqa: E402
from audiolib import (SR, Track, bq, bell, env_adsr, impact, limiter, noise, pad, piano, pulse, reverb, reverb_ir,  # noqa: E402
                      riser, shimmer, stereo, stone_click, sub, tick, whoosh)

TL = json.load(open("data/timeline.json", encoding="utf-8"))
DUR = TL["duration"] + 2.0
A = BT.A
T = {k: Track(DUR) for k in ["piano", "strings", "harp", "perc", "synth", "sfx", "amb"]}
RNG = np.random.default_rng(11)


def shots(scene, mode=None):
    return [s for s in TL["shots"] if s["scene"] == scene and (mode is None or s["p"].get("mode") == mode)]


def cue(s, name, default=None):
    """a shot's cue, in film seconds (timeline.json stores cues as absolute times)"""
    v = s["cues"].get(name)
    return v if v is not None else default


# ------------------------------------------------------------------ writing helpers
SEC = {"vn": "violins", "va": "violas", "vc": "cellos", "cb": "basses"}
RANGE = {"vn": (55, 100), "va": (48, 88), "vc": (36, 76), "cb": (28, 60)}


def strings(t0, t1, notes, vel=0.35, attack=0.8, release=1.6, gain=1.0):
    """notes: list of (section, midi). Each sustained from t0 to t1."""
    for sec, m in notes:
        lo, hi = RANGE[sec]
        m = max(lo, min(hi, m))
        T["strings"].add(t0, vsco.strings(SEC[sec], m, max(0.3, t1 - t0), vel, attack, release), gain * 0.55, pan={"vn": -0.35, "va": 0.25, "vc": 0.4, "cb": 0.1}[sec])


def chord(t0, t1, name, vel=0.35, attack=0.9, release=1.8, gain=1.0, voices="full"):
    CH = {
        "Dm": [("cb", 38), ("vc", 50), ("va", 57), ("vn", 65), ("vn", 69)],
        "Dm9": [("cb", 38), ("vc", 50), ("va", 57), ("vn", 64), ("vn", 65)],
        "Bb": [("cb", 34), ("vc", 46), ("va", 53), ("vn", 62), ("vn", 65)],
        "Bbmaj7": [("cb", 34), ("vc", 46), ("va", 57), ("vn", 62), ("vn", 65)],
        "F": [("cb", 41), ("vc", 48), ("va", 57), ("vn", 65), ("vn", 69)],
        "C": [("cb", 36), ("vc", 48), ("va", 55), ("vn", 64), ("vn", 67)],
        "Csus2": [("cb", 36), ("vc", 48), ("va", 55), ("vn", 62), ("vn", 67)],
        "Gm": [("cb", 43), ("vc", 50), ("va", 58), ("vn", 62), ("vn", 67)],
        "Am": [("cb", 45), ("vc", 52), ("va", 57), ("vn", 64), ("vn", 69)],
        "D": [("cb", 38), ("vc", 50), ("va", 57), ("vn", 66), ("vn", 69)],
        "Dlow": [("cb", 26), ("vc", 38), ("va", 50)],
    }
    notes = CH[name]
    if voices == "low":
        notes = [n for n in notes if n[0] in ("cb", "vc", "va")]
    elif voices == "high":
        notes = [n for n in notes if n[0] in ("va", "vn")]
    strings(t0, t1, notes, vel, attack, release, gain)


def pno(t, m, vel=0.4, dur=2.5, gain=0.8, release=1.2):
    T["piano"].add(t, piano(m, vel, dur=dur, release=release), gain)


def motif(t0, notes, step=0.55, vel=0.38, gain=0.85, durs=None):
    for i, m in enumerate(notes):
        if m is None:
            continue
        pno(t0 + i * step, m, vel, dur=(durs[i] if durs else step * 1.8), gain=gain)


def harp_arp(t0, t1, notes, every=0.18, vel=0.45, gain=0.8):
    t, i = t0, 0
    while t < t1:
        T["harp"].add(t, vsco.harp(notes[i % len(notes)], vel * (1.0 if i % 4 == 0 else 0.8), 3.0), gain, pan=0.3 * np.sin(i))
        t += every
        i += 1


def glk(t, m, vel=0.35, gain=0.7):
    T["harp"].add(t, vsco.glock(m, vel), gain, pan=0.2)


def timp(t, vel=0.5, gain=0.9, drum=2):
    T["perc"].add(t, vsco.timpani(vel, drum), gain)


def pulses(t0, t1, notes, bpm=110, vel=0.35, gain=0.5, every=0.25, accent=4):
    beat = 60 / bpm * every * 4
    t, i = t0, 0
    while t < t1:
        m = notes[i % len(notes)]
        T["synth"].add(t, pulse(m, 0.12, vel * (1.0 if i % accent == 0 else 0.7)), gain, pan=(-0.25 if i % 2 else 0.25))
        t += beat
        i += 1


def silence(t0, t1):
    """carve a hole in the music (the mix is built per track, so this fades every music track over [t0, t1])"""
    for k in ["piano", "strings", "harp", "perc", "synth"]:
        b = T[k].buf
        i0, i1 = int(t0 * SR), int(t1 * SR)
        f = int(0.12 * SR)
        g = np.ones(len(b), np.float32)
        g[max(0, i0 - f): i0] = np.linspace(1, 0, len(g[max(0, i0 - f): i0]))
        g[i0: i1] = 0
        g[i1: i1 + f] = np.linspace(0, 1, len(g[i1: i1 + f]))
        b *= g[:, None]


# ------------------------------------------------------------------ sound design
def porcelain_break(vel=0.9, seed=3):
    r = np.random.default_rng(seed)
    n = int(1.6 * SR)
    t = np.arange(n) / SR
    y = np.zeros(n, np.float32)
    # the crack: a bright broadband burst
    y += bq(r.uniform(-1, 1, n).astype(np.float32) * np.exp(-t / 0.012), "highpass", 1800) * 0.9
    # the shards: many short, high, inharmonic pings scattered over the first half second
    for k in range(48):
        st = int(r.uniform(0, 0.55) ** 1.8 * SR)
        f = r.uniform(2400, 9500)
        d = r.uniform(0.02, 0.12)
        m = int(min(n - st, 0.4 * SR))
        tt = np.arange(m) / SR
        ping = np.sin(2 * np.pi * f * tt) * np.exp(-tt / d) * r.uniform(0.08, 0.35)
        ping += np.sin(2 * np.pi * f * 1.73 * tt) * np.exp(-tt / (d * 0.6)) * r.uniform(0.03, 0.12)
        y[st: st + m] += ping
    # the body hitting stone: a low thud
    y += np.sin(2 * np.pi * np.cumsum(180 + 120 * np.exp(-t / 0.02)) / SR) * np.exp(-t / 0.05) * 0.5
    return stereo(y * vel)


def magnet_click(vel=0.7):
    n = int(0.25 * SR)
    t = np.arange(n) / SR
    y = bq(noise(n) * np.exp(-t / 0.002), "bandpass", [900, 4000]) * 0.8 + np.sin(2 * np.pi * 620 * t) * np.exp(-t / 0.03) * 0.3
    return stereo(y * vel)


def room_tone(dur, lp=500, vel=0.05, seed=1):
    n = int(dur * SR)
    r = np.random.default_rng(seed)
    x = r.uniform(-1, 1, (n, 2)).astype(np.float32)
    return bq(bq(x, "lowpass", lp), "highpass", 40) * vel


def hum(dur, f=60, vel=0.04):
    n = int(dur * SR)
    t = np.arange(n) / SR
    y = (np.sin(2 * np.pi * f * t) + 0.5 * np.sin(2 * np.pi * 2 * f * t) + 0.25 * np.sin(2 * np.pi * 3 * f * t)) * vel
    return stereo(y.astype(np.float32))


def water_run(dur, vel=0.12, seed=2):
    n = int(dur * SR)
    r = np.random.default_rng(seed)
    x = r.uniform(-1, 1, (n, 2)).astype(np.float32)
    y = bq(bq(x, "highpass", 900), "lowpass", 7000)
    # bubbling: random amplitude modulation
    am = np.convolve(r.uniform(0.4, 1.0, n), np.ones(600) / 600, mode="same")[:, None]
    return y * am * vel


def projector(dur, vel=0.06):
    n = int(dur * SR)
    t = np.arange(n) / SR
    clack = (np.sin(2 * np.pi * 24 * t) > 0.92).astype(np.float32)
    y = bq(noise(n) * (0.3 + 0.7 * clack), "bandpass", [600, 3000]) * vel + bq(noise(n), "lowpass", 300) * vel * 0.6
    return stereo(y)


def sparks(dur, vel=0.08, seed=5):
    n = int(dur * SR)
    r = np.random.default_rng(seed)
    y = np.zeros(n, np.float32)
    for k in range(int(dur * 6)):
        st = int(r.uniform(0, dur) * SR)
        m = int(min(n - st, r.uniform(0.05, 0.4) * SR))
        burst = r.uniform(-1, 1, m).astype(np.float32) * (r.uniform(0, 1, m) > 0.7) * np.exp(-np.arange(m) / (0.1 * SR))
        y[st: st + m] += burst
    return stereo(bq(y, "highpass", 2500) * vel)


def servo(dur=0.5, vel=0.05, f0=900, f1=1400):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = np.linspace(f0, f1, n)
    y = np.sin(2 * np.pi * np.cumsum(f) / SR) * env_adsr(n, a=0.05, d=0.05, s=1, r=0.1) + bq(noise(n), "bandpass", [f0, f1 * 2]) * 0.3
    return stereo(y * vel)


def hiss_whoosh(t, vel=0.18, dur=0.8, up=True):
    T["sfx"].add(t - dur * 0.6, whoosh(dur, vel, up), 0.8)


# ======================================================================== SCORE
END = TL["duration"]

# ---- hook -------------------------------------------------------------------------------------------------------
gp0 = TL["shots"][0]
t_contact = cue(gp0, "contact")
dish0 = shots("dish")[0]
t_slip, t_imp = cue(dish0, "slip"), cue(dish0, "impact")
h2_end = A("H2", "$", 0.75)
strings(0.0, t_slip + 0.6, [("cb", 38), ("vc", 50)], vel=0.25, attack=2.5, release=0.6)
pno(t_contact + 0.05, 74, 0.34, dur=3.0)
pno(t_contact + 0.75, 69, 0.26, dur=3.0)
T["sfx"].add(t_contact - 0.01, stone_click(0.95), 0.85, pan=0.1)
strings(t_slip, t_imp, [("vn", 88), ("vn", 81)], vel=0.2, attack=1.4, release=0.15)
T["synth"].add(t_imp - 1.6, riser(1.6, 0.3), 0.35)
silence(t_imp - 0.08, t_imp + 0.25)
T["sfx"].add(t_imp - 0.005, porcelain_break(1.0, 3), 1.0, pan=0.05)
timp(t_imp, 0.75, 0.9)
T["sfx"].add(t_slip - 0.3, water_run(t_imp - t_slip + 1.5, 0.06), 0.8)
motif(A("H2", "^", 0.1), [69, 74, 76, 77, None, 76, 74], step=0.5, vel=0.36, durs=[1.2, 1.2, 1.2, 2.5, 0, 1.2, 3.5])
chord(A("H2", "^", 0.0), h2_end, "Dm", vel=0.22, attack=1.2, release=0.8, voices="low")
T["harp"].add(A("H2", "一颗棋子", 0.0), vsco.harp(86, 0.4), 0.6)

# ---- 1 第37手 -------------------------------------------------------------------------------------------------------
hall_wide = shots("hall", "wide")[0]
a02 = A("A02", "^", -0.1)
chord(hall_wide["start"], A("A02", "另一边", 0.0), "Dm9", vel=0.25, attack=2.0, release=1.2, voices="high")
strings(hall_wide["start"], A("A03", "^", 0.0), [("cb", 38)], vel=0.2, attack=2.0, release=1.0)
pno(A("A01", "^", 0.1), 57, 0.3, dur=3)
pno(A("A01", "首尔", 0.0), 62, 0.28, dur=3)
chord(A("A02", "另一边", 0.0), A("A03", "^", 0.2), "Bbmaj7", vel=0.25, attack=1.0, release=1.0, voices="high")
glk(A("A02", "alphago", 0.0), 93, 0.3)
T["amb"].add(hall_wide["start"], room_tone(A("A05", "$", 0.5) - hall_wide["start"], 400, 0.05), 1.0)
# A03: confidence, a light harp in F; A04: the loss
harp_arp(A("A03", "^", 0.0), A("A04", "^", -0.1), [65, 69, 72, 77, 72, 69], every=0.2, vel=0.35, gain=0.55)
chord(A("A03", "^", 0.0), A("A04", "^", 0.0), "F", vel=0.22, attack=0.8, release=0.8, voices="high")
sc = shots("scorecard")[0]
t_lose = cue(sc, "lose")
timp(t_lose, 0.45, 0.7)
strings(t_lose, A("A05", "$", 0.3), [("vc", 45), ("cb", 33)], vel=0.28, attack=0.3, release=1.5)
T["sfx"].add(t_lose + 0.12, stone_click(0.7), 0.6)
# A05: an hour; the clock
empty = shots("hall", "empty")[0]
for k in range(int(empty["end"] - empty["start"])):
    T["sfx"].add(empty["start"] + 0.3 + k, tick(0.25, 2600), 0.35, pan=-0.3)
T["sfx"].add(cue(empty, "rise"), servo(0.6, 0.02, 220, 180), 0.6)
# A06: move 37 — the strings build into it; at the contact a wide F major opens
gp37 = [s for s in shots("go_place") if s["p"].get("label")][0]
t37 = cue(gp37, "contact")
strings(A("A06", "^", -0.3), t37, [("vc", 50), ("va", 57), ("vn", 69)], vel=0.32, attack=3.0, release=0.4)
T["sfx"].add(t37 - 0.01, stone_click(1.0), 0.95)
chord(t37, A("A07", "^", 0.6), "F", vel=0.42, attack=0.25, release=2.5, gain=1.1)
pno(t37 + 0.02, 53, 0.5, dur=4)
pno(t37 + 0.02, 65, 0.45, dur=4)
lab = cue(gp37, "label")
timp(lab, 0.4, 0.6)
harp_arp(lab, lab + 0.7, [65, 69, 72, 77, 81, 84], every=0.11, vel=0.4, gain=0.6)
# A07: the commentators — a held high cluster, then a long silence before "我以为"
com = shots("commentary")[0]
strings(com["start"], cue(com, "place"), [("vn", 76), ("vn", 77)], vel=0.18, attack=1.5, release=0.6)
pno(cue(com, "strange") + 0.5, 74, 0.3, dur=3)
T["sfx"].add(cue(com, "place"), magnet_click(0.8), 0.8, pan=0.2)
strings(cue(com, "mistake") - 0.2, com["end"] + 0.5, [("vc", 45)], vel=0.22, attack=0.8, release=1.2)
T["amb"].add(com["start"], room_tone(com["end"] - com["start"], 900, 0.04, 4), 1.0)
# A08: heartbeat and a racing clock
pov = shots("hall", "pov")[0]
t = pov["start"] + 0.3
while t < pov["end"]:
    timp(t, 0.18, 0.35, drum=1)
    t += 1.05
k, t = 0, pov["start"] + 0.2
while t < pov["end"]:
    T["sfx"].add(t, tick(0.18, 2800), 0.28, pan=0.3)
    k += 1
    t += max(0.07, 0.6 * 0.88 ** k)
strings(pov["start"], pov["end"] + 0.3, [("cb", 38), ("vc", 50)], vel=0.2, attack=1.5, release=0.8)
# A09-A10: the machine's view — shimmer, glock sparks, 1/10,000; the stone; a cold descent
heat = shots("go_board", "heat")[0]
th = cue(heat, "heat")
T["synth"].add(th - 0.3, whoosh(1.4, 0.18, True), 0.6)
T["synth"].add(th, shimmer(3.0, 0.22, 88), 0.5)
strings(th, cue(heat, "fade") + 1.0, [("vn", 93)], vel=0.12, attack=1.5, release=1.5)
glk(cue(heat, "count") + 1.8, 93, 0.45)
glk(cue(heat, "count") + 1.85, 81, 0.25)
strings(cue(heat, "fade"), heat["end"] + 0.5, [("vc", 46), ("cb", 34)], vel=0.22, attack=1.2, release=1.5)
T["sfx"].add(cue(heat, "stone"), stone_click(0.9), 0.85)
pno(cue(heat, "stone") + 0.05, 62, 0.34, dur=3)
pno(cue(heat, "stone") + 0.05, 69, 0.3, dur=3)
# A11: the game runs away — harp ostinato under a long string crescendo
lapse = shots("go_board", "lapse")[0]
harp_arp(lapse["start"], lapse["end"], [62, 65, 69, 74, 69, 65], every=0.16, vel=0.4, gain=0.55)
strings(lapse["start"], lapse["end"] + 0.2, [("vc", 50), ("va", 57), ("vn", 65), ("vn", 74)], vel=0.42, attack=lapse["end"] - lapse["start"], release=0.3)
t = lapse["start"] + 0.3
while t < lapse["end"]:
    T["sfx"].add(t, stone_click(0.25 + 0.2 * RNG.random()), 0.3, pan=RNG.uniform(-0.5, 0.5))
    t += 0.22 + 0.1 * RNG.random()
# A12: resignation — everything stops; one low note
resign = [s for s in shots("go_place") if s["p"].get("side") == "W"][0]
silence(resign["start"] - 0.05, resign["start"] + 0.4)
strings(resign["start"] + 0.3, resign["end"] + 1.0, [("cb", 38), ("vc", 38)], vel=0.25, attack=0.8, release=1.5)
T["sfx"].add(cue(resign, "contact"), stone_click(0.6), 0.7)
timp(cue(resign, "contact") + 0.05, 0.25, 0.5)
# A13: Lee's words — the motif, whole and tender
fin = [s for s in shots("go_board", "still") if s["p"].get("n") == 211][0]
motif(fin["start"] + 0.6, [69, 74, 76, 77, None, 76, 74, None, 72, 74, 76, 74], step=0.62, vel=0.34, durs=[1.5, 1.5, 1.5, 3, 0, 1.5, 3, 0, 1.5, 1.5, 1.5, 4])
chord(fin["start"] + 0.4, A("A13", "我改变了", 0.0), "Dm", vel=0.2, attack=2.0, release=1.0, voices="low")
chord(A("A13", "我改变了", 0.0), fin["end"] + 0.6, "F", vel=0.24, attack=1.5, release=1.6)
pno(A("A13", "创造力", 0.0), 53, 0.35, dur=4)

# ---- 2 拿不起的棋子 --------------------------------------------------------------------------------------------------
rev = [s for s in shots("go_place") if s["p"].get("cam") == "reveal"][0]
strings(rev["start"], cue(rev, "reveal"), [("cb", 38), ("vc", 45)], vel=0.2, attack=1.5, release=0.6)
for k in range(5):
    pno(rev["start"] + 0.5 + k * 0.9, 69, 0.22, dur=1.0)
T["sfx"].add(cue(rev, "contact"), stone_click(0.8), 0.75)
chord(cue(rev, "reveal"), rev["end"] + 0.4, "Gm", vel=0.3, attack=0.6, release=1.2)
T["synth"].add(cue(rev, "reveal") - 0.5, whoosh(0.9, 0.12, True), 0.5)
# B16: the engineer's hands — a piano ostinato, stones landing
watch = shots("hall", "watch")[0]
b16_end = A("B16", "$", 0.6)
t, i = watch["start"], 0
seq = [50, 57, 62, 65, 62, 57]
while t < b16_end:
    pno(t, seq[i % 6] + 12, 0.28 + (0.06 if i % 6 == 0 else 0), dur=0.6, gain=0.6)
    t += 0.3
    i += 1
chord(watch["start"], b16_end, "Dm", vel=0.25, attack=1.5, release=1.0, voices="low")
for s in [x for x in shots("go_place") if x["p"].get("move") in (39, 41, 43)]:
    T["sfx"].add(cue(s, "contact"), stone_click(0.85), 0.8, pan=RNG.uniform(-0.3, 0.3))
# B17: it could not pick up a stone — one high note, then nothing
br = shots("botreach")[0]
silence(br["start"], br["start"] + 0.3)
strings(br["start"] + 0.2, br["end"] + 0.2, [("vn", 86)], vel=0.15, attack=1.2, release=1.0)
T["sfx"].add(br["start"] + 0.5, servo(1.6, 0.025, 600, 420), 0.6)
silence(cue(br, "freeze") + 0.6, br["end"] + 0.05)
strings(cue(br, "freeze"), br["end"] + 0.4, [("vn", 86)], vel=0.12, attack=0.05, release=1.0)
# B18: ten years — harp climbing, strings swelling; brighter at the robots' feats; cut at the bowl
yrs = shots("botstage", "years")[0]
lab2 = shots("botstage", "labels")[0]
dish1 = shots("dish")[1]
harp_arp(yrs["start"], lab2["end"], [62, 65, 69, 74, 77, 81, 74, 69], every=0.14, vel=0.42, gain=0.55)
strings(yrs["start"], cue(yrs, "land"), [("vc", 50), ("va", 57), ("vn", 69), ("vn", 74)], vel=0.4, attack=cue(yrs, "land") - yrs["start"], release=0.2)
chord(cue(yrs, "land"), lab2["end"], "F", vel=0.42, attack=0.3, release=0.4, gain=1.0)
timp(cue(yrs, "land"), 0.5, 0.7)
glk(cue(lab2, "flip"), 89, 0.35)
glk(cue(lab2, "run"), 93, 0.35)
silence(cue(dish1, "slip") - 0.1, cue(dish1, "impact") + 0.2)
strings(cue(dish1, "slip"), cue(dish1, "impact"), [("vn", 88)], vel=0.18, attack=1.0, release=0.1)
T["sfx"].add(cue(dish1, "impact") - 0.005, porcelain_break(0.95, 9), 0.95)
timp(cue(dish1, "impact"), 0.6, 0.8)
# B19: "为什么？" — silence, then the title
title = shots("titlecard")[0]
silence(A("B19", "^", -0.3), cue(title, "title") - 0.05)
tt = cue(title, "title")
timp(tt, 0.85, 1.0, drum=4)
T["perc"].add(tt, impact(0.55), 0.6)
chord(tt, title["end"] + 0.5, "Dm", vel=0.5, attack=0.15, release=2.5, gain=1.2)
strings(tt, title["end"] + 0.5, [("cb", 26)], vel=0.4, attack=0.2, release=2.5)
pno(tt, 38, 0.6, dur=5)
pno(tt, 50, 0.5, dur=5)

# ---- 3 五个小时 -----------------------------------------------------------------------------------------------------
cart = shots("cart")
c0, c1 = cart[0]["start"], cart[-1]["end"]
T["amb"].add(c0, projector(c1 - c0, 0.05), 1.0)
mb = [74, 77, 81, 79, 77, 74, 72, 74]
for k in range(int((c1 - c0) / 0.45)):
    glk(c0 + 0.3 + k * 0.45, mb[k % len(mb)], 0.18 + (0.08 if k % 4 == 0 else 0), 0.55)
strings(c0, c1, [("cb", 38), ("vc", 50)], vel=0.18, attack=2.0, release=1.0)
if len(cart) > 1 and cart[1]["cues"].get("five") is not None:
    timp(cue(cart[1], "five"), 0.35, 0.6)
    t = cue(cart[1], "five")
    for k in range(30):
        T["sfx"].add(t + k * 0.05, tick(0.12, 3000), 0.2)
bal = shots("balance")[0]
for k, m in enumerate([65, 69, 72, 69]):
    pno(cue(bal, "easy", bal["start"] + 2) + k * 0.22, m + 12, 0.3, dur=0.4, gain=0.6)
strings(cue(bal, "hard", bal["start"] + 4), bal["end"] + 0.5, [("cb", 26), ("vc", 38)], vel=0.35, attack=0.4, release=1.5)
timp(cue(bal, "hard", bal["start"] + 4), 0.5, 0.7, drum=4)
for nm, m in (("look", 69), ("walk", 72), ("grab", 77)):
    if bal["cues"].get(nm) is not None:
        pno(cue(bal, nm), m, 0.33, dur=1.5)
c23 = [s for s in shots("go_place") if s["start"] > bal["start"]][0]
T["sfx"].add(cue(c23, "contact"), stone_click(0.9), 0.85)
motif(c23["start"] + 0.5, [69, 74, 76, 77, None, 76, 74], step=0.55, vel=0.33, durs=[1.2, 1.2, 1.2, 2.5, 0, 1.2, 3.0])
chord(c23["start"], c23["end"] + 0.4, "F", vel=0.25, attack=1.5, release=1.2)

# ---- 4 把世界摆成棋盘 -----------------------------------------------------------------------------------------------
fac = shots("factory_grid")
d0 = fac[0]["start"]
grids = shots("grids")[0]
uni = shots("unimate")
blind = [s for s in uni if s["p"].get("mode") == "blind"][0]
rep = [s for s in uni if s["p"].get("mode") == "repeat"][0]
pulses(d0 + 0.4, blind["start"], [50, 50, 57, 50, 53, 50, 57, 62], bpm=112, vel=0.3, gain=0.42)
pulses(rep["start"], grids["end"] - 0.6, [50, 50, 57, 50, 53, 50, 57, 62], bpm=112, vel=0.32, gain=0.42)
strings(d0, blind["start"], [("cb", 38), ("vc", 50)], vel=0.25, attack=1.5, release=0.6)
T["amb"].add(d0, hum(blind["start"] - d0, 50, 0.025) + room_tone(blind["start"] - d0, 700, 0.06, 7), 1.0)
T["sfx"].add(d0 + 1.0, sparks(blind["start"] - d0 - 1.0, 0.07), 0.8)
work = [s for s in uni if s["p"].get("mode") == "work"][0]
if work["cues"].get("hot") is not None:
    strings(cue(work, "hot"), work["end"], [("vc", 45)], vel=0.35, attack=0.5, release=1.0)
    T["sfx"].add(cue(work, "hot") - 0.3, whoosh(1.2, 0.12, False), 0.6)
strings(blind["start"], blind["end"] + 0.3, [("cb", 26)], vel=0.3, attack=0.3, release=1.2)
timp(rep["start"] + 0.1, 0.35, 0.6)
brd = [s for s in fac if s["p"].get("mode") == "board"][0]
if brd["cues"].get("board") is not None:
    chord(cue(brd, "board"), brd["end"] + 0.6, "Bb", vel=0.35, attack=0.2, release=1.2)
    timp(cue(brd, "board"), 0.5, 0.7)
wh = shots("warehouse")
harp_arp(wh[0]["start"], shots("dishwasher")[0]["end"], [62, 69, 74, 69], every=0.268, vel=0.3, gain=0.4)
T["amb"].add(wh[0]["start"], servo(wh[-1]["end"] - wh[0]["start"], 0.01, 300, 340), 0.8)
vac = shots("vacuum")[0]
T["amb"].add(vac["start"], bq(stereo(noise(int((vac["end"] - vac["start"]) * SR)) * 0.03), "bandpass", [200, 1600]), 0.8)
dw = shots("dishwasher")[0]
if dw["cues"].get("close") is not None:
    T["sfx"].add(cue(dw, "close"), impact(0.15), 0.4)
if dw["cues"].get("spray") is not None:
    T["sfx"].add(cue(dw, "spray"), water_run(dw["end"] - cue(dw, "spray") + 0.5, 0.12, 4), 0.8)
chord(grids["start"], cue(grids, "simple", grids["start"] + 4), "Dm", vel=0.3, attack=2.5, release=0.3, voices="high")
ts = cue(grids, "simple", grids["start"] + 4)
chord(ts, grids["end"] + 1.0, "F", vel=0.45, attack=0.3, release=2.5, gain=1.1)
pno(ts, 53, 0.45, dur=4)
pno(ts, 69, 0.4, dur=4)
harp_arp(ts, ts + 0.6, [65, 69, 72, 77, 81], every=0.1, vel=0.4, gain=0.5)

# ---- 5 棋盘之外 -----------------------------------------------------------------------------------------------------
home = shots("home")
e0 = home[0]["start"]
gen = shots("botgen")[0]
# a warm waltz in F at home (84 bpm, 3/4)
beat = 60 / 84
t, i = e0 + 0.4, 0
waltz = [("F", 41, [57, 60, 65]), ("Bb", 46, [58, 62, 65]), ("F", 41, [57, 60, 65]), ("C", 48, [55, 60, 64])]
while t < gen["start"]:
    nm, bass, up = waltz[(i // 3) % 4]
    if i % 3 == 0:
        pno(t, bass, 0.32, dur=beat * 2.5, gain=0.6)
    else:
        for m in up:
            pno(t, m, 0.2, dur=beat * 0.8, gain=0.45)
    t += beat
    i += 1
mel = [69, 72, 77, 76, 74, 72, 74, 69]
for k, m in enumerate(mel):
    if e0 + 1.0 + k * beat * 3 < gen["start"]:
        T["strings"].add(e0 + 1.0 + k * beat * 3, vsco.strings("violas", m - 12, beat * 2.6, 0.3, 0.3, 0.8), 0.45, pan=0.2)
if home[0]["cues"].get("break") is not None:
    T["sfx"].add(cue(home[0], "break") - 0.05, porcelain_break(0.25, 21) * 0.5, 0.4)
if len(home) > 1 and home[1]["cues"].get("cat") is not None:
    glk(cue(home[1], "cat"), 84, 0.3)
    glk(cue(home[1], "cat") + 0.12, 91, 0.25)
T["amb"].add(e0, room_tone(gen["start"] - e0, 350, 0.04, 9), 1.0)
# robot generation: a riser into the scan
T["synth"].add(cue(gen, "robot") - 1.5, riser(1.6, 0.3), 0.4)
chord(gen["start"], cue(gen, "robot"), "Dm9", vel=0.25, attack=1.5, release=0.3, voices="high")
chord(cue(gen, "robot"), gen["end"] + 0.4, "Bbmaj7", vel=0.38, attack=0.3, release=1.0)
T["synth"].add(cue(gen, "robot"), shimmer(2.0, 0.18, 86), 0.45)
des = shots("design")[0]
for nm, m in (("door", 72), ("stairs", 76), ("pan", 79)):
    if des["cues"].get(nm) is not None:
        T["harp"].add(cue(des, nm), vsco.harp(m, 0.45), 0.6)
chord(des["start"], des["end"] + 0.3, "F", vel=0.25, attack=1.5, release=0.8)
if des["cues"].get("robot") is not None:
    chord(cue(des, "robot"), des["end"] + 0.3, "C", vel=0.35, attack=0.6, release=1.0)
# gala and race
stage = shots("gala", "stage")[0]
race = shots("gala", "race")[0]
for k in range(int((stage["end"] - stage["start"]) / (60 / 120))):
    t = stage["start"] + k * 60 / 120
    timp(t, 0.3 if k % 2 == 0 else 0.15, 0.5, drum=3)
chord(stage["start"], race["start"], "F", vel=0.4, attack=0.3, release=0.5)
glk(stage["start"] + 0.1, 89, 0.35)
pulses(race["start"], cue(race, "win"), [50, 57, 50, 62], bpm=150, vel=0.35, gain=0.45)
strings(race["start"], cue(race, "win"), [("vc", 50), ("vn", 74)], vel=0.4, attack=1.0, release=0.1)
silence(cue(race, "win") - 0.02, cue(race, "win") + 0.25)
T["perc"].add(cue(race, "win"), impact(0.5), 0.6)
chord(cue(race, "win"), race["end"] + 0.4, "Dm9", vel=0.3, attack=0.05, release=1.2, voices="high")
# two ways, and the operator
tw = shots("twoways")[0]
strings(tw["start"], tw["end"], [("cb", 38), ("vn", 76), ("vn", 77)], vel=0.22, attack=1.0, release=0.3)
pulses(tw["start"], cue(tw, "bowls", tw["start"] + 2.5), [62], bpm=106, vel=0.25, gain=0.3, every=0.5)
silence(cue(tw, "two", tw["end"] - 1) + 0.6, tw["end"] + 0.2)
tel = shots("teleop")[0]
strings(tel["start"], tel["end"] + 0.4, [("cb", 26), ("vc", 45)], vel=0.28, attack=1.0, release=1.2)
chord(cue(tel, "human"), tel["end"] + 0.4, "Am", vel=0.25, attack=0.6, release=1.2, voices="high")
T["sfx"].add(tel["start"] + 0.6, servo(1.2, 0.02, 500, 700), 0.6)
T["synth"].add(cue(tel, "human") - 0.3, whoosh(0.8, 0.14, False), 0.5)
e41 = [s for s in shots("go_place") if s["start"] > tel["start"]][0]
motif(e41["start"] + 0.6, [69, 74, 76, 77], step=0.6, vel=0.32, durs=[1.4, 1.4, 1.4, 3.5])
T["sfx"].add(cue(e41, "contact"), stone_click(0.9), 0.85)
chord(e41["start"], e41["end"] + 0.4, "Dm", vel=0.22, attack=1.5, release=1.0, voices="low")

# ---- 6 那只手 ------------------------------------------------------------------------------------------------------
f42 = [s for s in shots("go_place") if s["start"] > e41["start"]][0]
handshots = shots("hands")
f_end = handshots[-1]["end"]
prog = ["Dm", "Bb", "F", "C"]
seg = (f_end - f42["start"]) / 4
for k, nm in enumerate(prog):
    chord(f42["start"] + k * seg, f42["start"] + (k + 1) * seg + 0.2, nm, vel=0.3 + 0.06 * k, attack=0.8 if k == 0 else 0.4, release=0.6)
motif(f42["start"] + 0.4, [69, 74, 76, 77, 79, 77, 76, 74, 72, 74, 76, 81], step=seg * 4 / 13, vel=0.36)
T["sfx"].add(cue(f42, "contact"), stone_click(0.85), 0.8)
for s in handshots:
    if s["p"].get("mode") == "wash":
        T["sfx"].add(s["start"], water_run(s["end"] - s["start"] + 0.3, 0.1, 6), 0.8)
    if s["p"].get("mode") == "cap" and s["cues"].get("twist") is not None:
        for k in range(2):
            T["sfx"].add(cue(s, "twist") + k * 1.0 + 0.2, bq(stereo(noise(int(0.25 * SR)) * 0.2), "bandpass", [1500, 5000]), 0.4)
    if s["p"].get("mode") == "catch" and s["cues"].get("catch") is not None:
        T["sfx"].add(cue(s, "catch"), stone_click(0.4) * 0.6, 0.6)
        chord(cue(s, "catch"), s["end"] + 0.6, "F", vel=0.45, attack=0.2, release=1.5, gain=1.1)
        pno(cue(s, "catch"), 53, 0.45, dur=4)
cold = [s for s in fac if s["p"].get("mode") == "cold"][0]
strings(cold["start"], cold["end"] + 0.3, [("vn", 74), ("vn", 81)], vel=0.2, attack=0.6, release=1.0)
T["amb"].add(cold["start"], hum(cold["end"] - cold["start"], 50, 0.02), 1.0)
hb = shots("homebot")[0]
chord(hb["start"], hb["end"] + 0.4, "Bbmaj7", vel=0.25, attack=1.0, release=0.8)
chord(hb["start"] + (hb["end"] - hb["start"]) * 0.5, hb["end"] + 0.6, "F", vel=0.32, attack=1.2, release=1.2)
end = shots("ending")[0]
ts, tp, tc = cue(end, "slip", end["start"] + 1), cue(end, "place", end["start"] + 4), cue(end, "card", END - 3.5)
motif(end["start"] + 0.3, [69, 74, 76, 77], step=0.55, vel=0.3, durs=[1.2, 1.2, 1.2, 2.0])
strings(end["start"], ts + 0.3, [("vc", 50), ("va", 57)], vel=0.2, attack=1.2, release=0.3)
strings(ts, ts + 0.9, [("vn", 88)], vel=0.15, attack=0.3, release=0.2)
silence(ts + 0.1, ts + 0.9)
T["sfx"].add(ts + 0.85, stone_click(0.35) * 0.4, 0.5)
# the catch: D major
chord(ts + 0.9, END + 1.5, "D", vel=0.35, attack=1.0, release=2.5, gain=1.05)
pno(ts + 0.9, 50, 0.38, dur=5)
pno(ts + 0.9, 66, 0.32, dur=5)
motif(tp - 0.4, [74, 78, 81, None, 78, 74], step=0.5, vel=0.3, durs=[1.2, 1.2, 2.5, 0, 1.2, 4])
T["sfx"].add(tp, stone_click(0.3) * 0.5, 0.5)
pno(tc, 38, 0.45, dur=6)
pno(tc, 50, 0.4, dur=6)
pno(tc + 0.08, 66, 0.35, dur=6)
pno(tc + 0.16, 69, 0.35, dur=6)
pno(tc + 0.24, 74, 0.33, dur=6)
harp_arp(tc, tc + 0.9, [62, 66, 69, 74, 78, 81, 86], every=0.12, vel=0.35, gain=0.5)
T["amb"].add(end["start"], room_tone(END - end["start"], 350, 0.035, 12), 1.0)

# ---- transitions: soft whooshes into the dips
for b in TL.get("blacks", []):
    T["sfx"].add(b["at"], whoosh(0.9, 0.08, False), 0.4)

# ======================================================================== render
ir_hall = reverb_ir(rt60=3.2, pre=0.03, lp=7000, seed=5)
ir_room = reverb_ir(rt60=1.8, pre=0.015, lp=6000, seed=6)
music = (reverb(T["strings"].buf, ir_hall, 0.38) * 0.9 + reverb(T["piano"].buf, ir_hall, 0.3) * 0.85 + reverb(T["harp"].buf, ir_hall, 0.4) * 0.7
         + reverb(T["perc"].buf, ir_hall, 0.3) * 0.8 + reverb(T["synth"].buf, ir_hall, 0.35) * 0.6)
music = bq(music, "highpass", 30)
music = music / max(1e-6, np.abs(music).max()) * 0.8
music = limiter(music, 0.89)
sfx = reverb(T["sfx"].buf, ir_room, 0.18) + T["amb"].buf
sfx = sfx / max(1e-6, np.abs(sfx).max()) * 0.85
n = int(DUR * SR)
sf.write("audio/music.wav", music[:n], SR)
sf.write("audio/sfx.wav", sfx[:n], SR)
print("music", round(len(music) / SR, 1), "s  peak", round(float(np.abs(music).max()), 3), " sfx peak", round(float(np.abs(sfx).max()), 3))
