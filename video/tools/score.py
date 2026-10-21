"""Compose the original score + sound design, locked to the film timeline.

Writes audio/music.wav and audio/sfx.wav (48 kHz stereo). Key: D minor / F major, 96 BPM.
"""
import json

import numpy as np
import soundfile as sf

from audiolib import (SR, Track, bell, bq, cello, delay, impact, kick, pad, piano, pluck, pulse, reverb, reverb_ir,
                      riser, shimmer, stone_click, sub, tick, whoosh, noise, env_adsr, stereo)

TL = json.load(open("data/timeline.json", encoding="utf-8"))
DUR = TL["duration"] + 1.5
BEAT = 60 / 96


def shots(scene):
    return [s for s in TL["shots"] if s["scene"] == scene]


def S(scene, k=0):
    return shots(scene)[k]


def cue(scene, name, k=0):
    s = S(scene, k)
    return s["start"] + s["p"]["cue"][name]


# chords (midi)
CH = {
    "Dm9": ([50, 53, 57, 64], 38), "Bbmaj7": ([46, 50, 53, 57], 34), "Fmaj9": ([53, 57, 60, 64, 67], 41),
    "Csus2": ([48, 55, 62, 64], 36), "Gm9": ([55, 58, 62, 65, 69], 43), "Am7": ([57, 60, 64, 67], 45),
    "Dm": ([50, 53, 57, 62], 38), "F": ([53, 57, 60, 65], 41), "Bb": ([46, 50, 53, 58], 34), "C": ([48, 52, 55, 60], 36),
}

T = {k: Track(DUR) for k in ["piano", "cello", "pad", "synth", "drums", "sfx"]}


def chord_bed(t0, t1, names, bright=0.6, gain=0.5, with_cello=True, cello_dyn="pp"):
    """sustained pad (+cello bass) cycling through chords, each for an equal share of [t0,t1)"""
    seg = (t1 - t0) / len(names)
    for i, nm in enumerate(names):
        notes, bass = CH[nm]
        st = t0 + i * seg
        T["pad"].add(st, pad(notes, seg + 0.3, a=1.2 if i == 0 else 0.6, r=1.6, bright=bright), gain)
        if with_cello:
            m = bass + 12 if bass < 36 else bass
            T["cello"].add(st, cello(m, seg + 0.2, cello_dyn, attack=0.6, release=1.2), 0.5 * gain)


def chord_grid(t0, t1, names, bright=0.55, gain=0.35, with_cello=True):
    """pad (+cello) on the same 2-bar grid as arp(): chord k occupies [t0 + k*8 beats, ...)"""
    bar2 = 8 * BEAT
    k = 0
    while t0 + k * bar2 < t1:
        st = t0 + k * bar2
        dur = min(bar2, t1 - st)
        notes, bass = CH[names[k % len(names)]]
        T["pad"].add(st, pad(notes, dur + 0.25, a=0.8 if k == 0 else 0.35, r=1.2, bright=bright), gain)
        if with_cello:
            T["cello"].add(st, cello(bass + 12 if bass < 36 else bass, dur + 0.15, "pp", attack=0.5, release=1.0), 0.5 * gain)
        k += 1


def arp(t0, t1, names, vel=0.5, octave=0, every=BEAT / 2, gain=0.6):
    """8th-note arpeggio through chord tones; chords change every 2 bars"""
    t, i = t0, 0
    bar2 = 8 * BEAT
    while t < t1:
        nm = names[int((t - t0) // bar2) % len(names)]
        notes = CH[nm][0]
        pat = [0, 2, 1, 3, 2, 1, 3, 2]
        m = notes[pat[i % 8] % len(notes)] + 12 + octave
        acc = 1.0 if i % 4 == 0 else 0.75
        T["synth"].add(t, pulse(m, 0.16, vel * acc), gain, pan=(-0.3 if i % 2 else 0.3))
        t += every
        i += 1


def drums(t0, t1, vel=0.4, half=False):
    t = t0
    k = 0
    while t < t1:
        if (k % 2 == 0) or not half:
            T["drums"].add(t, kick(vel), 0.8)
        T["drums"].add(t + BEAT / 2, bq(stereo(noise(int(0.05 * SR)) * np.exp(-np.arange(int(0.05 * SR)) / (0.008 * SR))), "highpass", 6000), vel * 0.18)
        t += BEAT
        k += 1


def motif(t0, notes, step=1.25, vel=0.4, gain=0.8):
    for i, m in enumerate(notes):
        if m is None:
            continue
        T["piano"].add(t0 + i * step, piano(m, vel, dur=step * 1.6, release=1.2), gain)


def roll(t, notes, vel=0.45, spread=0.07, gain=0.8, dur=3.0):
    for i, m in enumerate(notes):
        T["piano"].add(t + i * spread, piano(m, vel, dur=dur), gain)


# ======================================================================== SCORE
go0 = S("go", 0)
t_now = S("now")["start"]
t_place = cue("go", "place")
# --- cold open: low drone, AI "thinking" pings, sparse piano; warm resolution when the hand places the stone
T["cello"].add(0.0, cello(38, t_place + 1.0, "pp", attack=1.5, release=1.6), 0.55)
T["pad"].add(0.0, pad(CH["Dm9"][0], t_place, a=2.0, r=1.4, bright=0.45), 0.42)
T["drums"].add(0.0, sub(38, t_place, a=2.0, r=1.0, vel=0.3), 0.45)
motif(0.5, [69, None, 74, 76, 77, None, 76, 72, 74], step=1.15, vel=0.32, gain=0.75)
for k in range(10):
    tt = cue("go", "heat") + 0.4 + k * 0.55
    if tt < cue("go", "ghost"):
        T["synth"].add(tt, bell(93 + [0, 3, 7, 10, 5][k % 5], 1.2, 0.25), 0.5, pan=[-0.5, 0.4, -0.2, 0.6, 0.0][k % 5])
T["synth"].add(cue("go", "ghost"), bell(86, 2.5, 0.35), 0.6)
T["sfx"].add(t_place - 0.02, stone_click(0.95), 0.9, pan=0.15)
roll(t_place + 0.05, [46, 53, 57, 62, 65], vel=0.42, gain=0.8, dur=3.5)
T["pad"].add(t_place, pad(CH["Bbmaj7"][0], t_now - t_place + 0.4, a=0.4, r=1.0, bright=0.6), 0.45)
T["cello"].add(t_place, cello(46, t_now - t_place + 0.3, "pp", attack=0.4, release=0.9), 0.45)

# --- ten years later: flip/run energy, then the sink deflates it
flip, run, sink = cue("now", "flip"), cue("now", "run"), cue("now", "sink")
title_start = S("title")["start"]
T["sfx"].add(t_now - 0.25, whoosh(0.8, 0.35), 0.8)
arp(flip - BEAT * 2, sink, ["Dm", "Bb"], vel=0.5, gain=0.55)
drums(flip, sink, vel=0.45)
T["sfx"].add(flip + 0.1, whoosh(1.0, 0.4, up=True), 0.7, pan=-0.2)
T["pad"].add(flip - 0.4, pad(CH["Dm"][0], sink - flip + 0.4, a=0.4, r=0.4, bright=0.8), 0.35)
T["synth"].add(sink, pluck(62, 1.0, 0.4), 0.5)
T["synth"].add(sink + 0.32, pluck(61, 1.2, 0.3), 0.45)
for k in range(4):
    T["sfx"].add(sink + 0.6 + k * 0.83, tick(0.25, 5200), 0.85, pan=-0.4)  # water drip, the only sound left
# a low floor under the deflation so it reads as a held breath, not a dropout
T["cello"].add(sink + 0.4, cello(38, title_start - sink + 0.6, "pp", attack=1.2, release=0.8), 0.75)
T["pad"].add(sink + 0.3, pad(CH["Dm"][0], title_start - sink + 0.4, a=1.0, r=0.8, bright=0.3), 0.2)
# --- "为什么？" -> title
title = S("title")
title_start = title["start"]
T["sfx"].add(title["start"] - 1.6, riser(1.9, 0.45), 0.55)
t_title = cue("title", "title")
T["sfx"].add(t_title - 0.05, impact(0.7), 0.45)
T["synth"].add(t_title, shimmer(2.6, 0.32, 86), 0.45)
T["pad"].add(t_title - 0.05, pad(CH["Dm9"][0], title["end"] - t_title + 0.6, a=0.15, r=1.4, bright=0.55), 0.5)
T["cello"].add(t_title - 0.05, cello(38, title["end"] - t_title + 0.4, "pp", attack=0.2, release=1.2), 0.55)

# --- Stanford cart: playful pizzicato ostinato, clock ticks, camera clicks, thinking beeps
cart = S("cart")
c0, c1 = cart["start"], cart["end"]
pat = [62, 65, 69, 67, 65, 62, 64, 60]
t, i = c0 + 0.2, 0
while t < c1 - 0.3:
    T["synth"].add(t, pluck(pat[i % 8], 0.9, 0.35), 0.55, pan=(-0.35 if i % 2 else 0.35))
    t += BEAT / 2
    i += 1
T["pad"].add(c0, pad(CH["Dm"][0], c1 - c0, a=0.8, r=1.0, bright=0.4), 0.28)
five = cue("cart", "five")
t = five
while t < c1 - 0.5:
    T["sfx"].add(t, tick(0.3, 2600), 0.45, pan=0.6)
    t += 0.125
stop = cue("cart", "stop")
for k in range(9):
    T["sfx"].add(stop + 0.15 + k * 0.11, tick(0.5, 4200), 0.5, pan=-0.2)
think = cue("cart", "think")
for k in range(5):
    T["synth"].add(think + k * 0.3, bell(88 + (k % 2) * 3, 0.4, 0.25), 0.35)

# --- Moravec: contemplative piano chords + balance thud
mv = S("moravec")
m0, m1 = mv["start"], mv["end"]
chord_bed(m0, m1 + 0.4, ["Gm9", "Bbmaj7", "Fmaj9"], bright=0.45, gain=0.42)
for k, nm in enumerate(["Gm9", "Bbmaj7", "Fmaj9"]):
    roll(m0 + 0.2 + k * (m1 - m0) / 3, [n + 12 for n in CH[nm][0][1:4]], vel=0.3, gain=0.6, dur=2.5)
T["sfx"].add(cue("moravec", "hard") + 0.6, impact(0.35), 0.5)
for k, nm in enumerate(["look", "walk", "grab"]):
    T["synth"].add(cue("moravec", nm), bell([81, 84, 86][k], 1.6, 0.35), 0.55, pan=[-0.3, 0, 0.3][k])

# --- arranged world (factory -> dishwasher): steady pulse, chords Dm-Bb-F-C, machine textures
fa = S("factory")
f0, f1 = fa["start"], S("dish")["end"]
arp(f0, f1, ["Dm", "Bb", "F", "C"], vel=0.42, gain=0.5)
drums(f0 + 4 * BEAT, f1, vel=0.32, half=True)
chord_grid(f0, f1, ["Dm9", "Bbmaj7", "Fmaj9", "Csus2"], bright=0.5, gain=0.32)
uni = cue("factory", "unimate")
T["sfx"].add(uni - 0.4, whoosh(0.8, 0.3), 0.6)
for k in range(6):  # hydraulic grabs
    tg = uni + 0.6 + 0.43 + k * 2.4
    if tg < fa["end"]:
        T["sfx"].add(tg, bq(stereo(noise(int(0.5 * SR)) * env_adsr(int(0.5 * SR), 0.01, 0.1, 0.4, 0.3)), "bandpass", [600, 3000]), 0.12)
        T["sfx"].add(tg, kick(0.25), 0.35)
for k in range(30):  # welding crackle
    T["sfx"].add(f0 + 0.2 + k * 0.13 + (k % 3) * 0.03, tick(0.2, 6000 + (k % 5) * 400), 0.25, pan=(k % 7 - 3) / 4)
bw = cue("factory", "boardWord")
T["sfx"].add(bw - 0.05, impact(0.45), 0.55)
T["synth"].add(bw, shimmer(1.8, 0.28, 86), 0.5)
dsh = S("dish")
T["sfx"].add(cue("dish", "close"), stone_click(0.6), 0.6)
sp = cue("dish", "spray")
T["sfx"].add(sp, bq(stereo(noise(int(1.6 * SR)) * env_adsr(int(1.6 * SR), 0.1, 0.3, 0.7, 0.6)), "bandpass", [1500, 8000]), 0.12)
for s in shots("simple") + [S("warehouse"), S("floor"), dsh]:
    T["sfx"].add(s["start"] - 0.3, whoosh(0.6, 0.25), 0.45)

# --- the insight: build and resolve
ins = S("simple", 1)
but = cue("simple", "but", 1)
# suspended bed under "所以…靠的大多不是机器变聪明": hold Bbmaj7, piano heartbeat on D
T["pad"].add(ins["start"] - 0.3, pad(CH["Bbmaj7"][0], but - ins["start"] + 0.6, a=0.6, r=0.8, bright=0.45), 0.42)
T["cello"].add(ins["start"] - 0.3, cello(46, but - ins["start"] + 0.5, "pp", attack=0.6, release=0.8), 0.45)
t = ins["start"]
while t < but - 0.4:
    T["piano"].add(t, piano(62, 0.25, dur=0.6, release=0.6), 0.55)
    t += BEAT * 2
T["sfx"].add(but - 1.8, riser(1.9, 0.4), 0.55)
T["sfx"].add(but + 0.15, impact(0.5), 0.6)
roll(but + 0.15, [41, 48, 53, 57, 60, 64], vel=0.5, gain=0.85, dur=4.0)
T["pad"].add(but + 0.1, pad(CH["Fmaj9"][0], ins["end"] - but + 0.6, a=0.3, r=2.0, bright=0.7), 0.55)
T["cello"].add(but + 0.1, cello(53, ins["end"] - but + 0.4, "mf", attack=0.5, release=1.6), 0.45)
T["cello"].add(but + 0.1, cello(41, ins["end"] - but + 0.4, "pp", attack=0.5, release=1.6), 0.5)
T["synth"].add(but + 0.2, shimmer(3.0, 0.3, 86), 0.55)

# --- home: warm solo piano (F major), playful cat
ho = S("home")
h0, h1 = ho["start"], ho["end"]
mel = [65, 69, 72, 69, 67, 64, 60, 62, 65, 69, 67, 65]
for k, m in enumerate(mel):
    tt = h0 + 0.3 + k * BEAT * 1.5
    if tt < h1 - 0.5:
        T["piano"].add(tt, piano(m, 0.33, dur=1.4, release=1.0), 0.7)
bass = [41, 36, 38, 34]
for k in range(int((h1 - h0) / (BEAT * 4)) + 1):
    T["piano"].add(h0 + 0.3 + k * BEAT * 4, piano(bass[k % 4], 0.28, dur=2.4, release=1.2), 0.6)
T["pad"].add(h0, pad(CH["F"][0], h1 - h0, a=1.0, r=1.4, bright=0.35), 0.25)
cat = cue("home", "cat")
for k, m in enumerate([72, 76, 79, 84]):
    T["synth"].add(cat + k * 0.06, pluck(m, 0.6, 0.6), 0.4)
T["sfx"].add(cat + 0.85, kick(0.18), 0.4)
days = cue("home", "days")
for k in range(3):
    T["sfx"].add(days + k * 0.75, whoosh(0.35, 0.18), 0.4)

# --- humanoids: pulse returns; gala bells; race finish
tu, ga = S("turn"), S("gala")
u0, u1 = tu["start"], ga["end"]
arp(u0, u1, ["Dm", "Bb", "F", "C"], vel=0.48, gain=0.55)
drums(S("design")["start"] + 2 * BEAT, u1, vel=0.4)
chord_grid(u0, u1, ["Dm9", "Bbmaj7", "Fmaj9", "Csus2"], bright=0.55, gain=0.3)
for k in range(10):
    T["synth"].add(ga["start"] + 0.2 + k * 0.25, bell(84 + [0, 4, 7, 12][k % 4], 0.9, 0.3), 0.4, pan=(k % 5 - 2) / 3)
T["sfx"].add(cue("gala", "race") - 0.3, whoosh(0.7, 0.3), 0.5)

# --- two ways + teleop: thin out, tension
tw, te = S("twoways"), S("teleop")
T["pad"].add(tw["start"], pad(CH["Gm9"][0], te["end"] - tw["start"], a=0.8, r=1.6, bright=0.4), 0.38)
T["cello"].add(tw["start"], cello(43, te["end"] - tw["start"], "pp", attack=0.8, release=1.4), 0.45)
t = tw["start"] + 0.2
while t < cue("twoways", "bowls"):
    T["sfx"].add(t, tick(0.2, 3000), 0.3, pan=-0.6)
    t += 0.18
hu = cue("teleop", "human")
for k in range(16):
    T["synth"].add(hu + 0.3 + k * 0.17, bell(96 + (k % 3) * 2, 0.25, 0.15), 0.3, pan=-0.8 + k * 0.1)

# --- the hand returns: the opening motif, now with cello, warm
cb, hs = S("go", 1), S("hands")
k0, k1 = cb["start"], hs["end"]
motif(k0 + 0.3, [69, 74, 76, 77, 76, 74, 72, 69, 72, 74], step=BEAT * 2, vel=0.42, gain=0.85)
chord_bed(k0, k1, ["Fmaj9", "Csus2", "Dm9", "Bbmaj7"], bright=0.55, gain=0.38, with_cello=False)
seg = (k1 - k0) / 4
for k, m in enumerate([57, 55, 53, 50]):
    T["cello"].add(k0 + k * seg + 0.1, cello(m, seg + 0.2, "mf" if k in (1, 2) else "pp", attack=0.7, release=1.2), 0.5)
T["sfx"].add(cue("hands", "wash"), bq(stereo(noise(int(1.1 * SR)) * env_adsr(int(1.1 * SR), 0.1, 0.2, 0.8, 0.3)), "bandpass", [900, 6000]), 0.1)
T["sfx"].add(cue("hands", "cap") + 0.2, tick(0.4, 1800), 0.5)
T["sfx"].add(cue("hands", "cap") + 0.5, tick(0.4, 1700), 0.5)
T["sfx"].add(cue("hands", "catch") + 0.75, kick(0.3), 0.45)

# --- ending: cool chord for the past, warm for the future, end card
en = S("ending")
e0, nx, cd = en["start"], cue("ending", "next"), cue("ending", "card")
T["pad"].add(e0, pad(CH["Dm9"][0], nx - e0 + 0.3, a=0.6, r=1.0, bright=0.5), 0.45)
T["cello"].add(e0, cello(38, nx - e0 + 0.3, "pp", attack=0.5, release=1.0), 0.5)
roll(nx, [41, 48, 53, 57, 60, 64, 67], vel=0.5, gain=0.85, dur=4.5)
T["pad"].add(nx, pad(CH["Fmaj9"][0], DUR - nx, a=0.5, r=2.5, bright=0.65), 0.5)
T["cello"].add(nx, cello(53, cd - nx + 1.0, "mf", attack=0.6, release=2.0), 0.45)
T["synth"].add(nx + 0.3, shimmer(3.0, 0.25, 86), 0.5)
T["sfx"].add(cd - 0.05, impact(0.4), 0.5)
motif(cd + 0.4, [69, 74, 76, 77], step=1.0, vel=0.33, gain=0.75)

# ======================================================================== MIX STEMS
ir_long = reverb_ir(3.0, 0.03, 5500, 3)
ir_mid = reverb_ir(1.6, 0.015, 7000, 5)
piano_w = reverb(delay(bq(T["piano"].buf, "lowpass", 7000), BEAT * 0.75, 0.3, 0.12), ir_long, 0.32)
cello_w = reverb(T["cello"].buf, ir_long, 0.35)
pad_w = reverb(T["pad"].buf, ir_long, 0.4)
synth_w = reverb(delay(T["synth"].buf, BEAT * 0.75, 0.32, 0.18), ir_long, 0.3)
drums_w = reverb(T["drums"].buf, ir_mid, 0.15)
music = piano_w * 0.9 + cello_w * 0.8 + pad_w * 0.7 + synth_w * 0.7 + drums_w * 0.7
music = bq(music, "highpass", 32)
# gentle dip where the voice lives (2-4 kHz)
voiceband = bq(music, "bandpass", [1800, 4200])
music = music - 0.3 * voiceband
sfx = reverb(T["sfx"].buf, ir_mid, 0.25)
n = int(TL["duration"] * SR) + int(1.0 * SR)
music, sfx = music[:n], sfx[:n]
# fade the tail
fade = int(2.0 * SR)
music[-fade:] *= np.linspace(1, 0, fade)[:, None]
sf.write("audio/music.wav", music.astype(np.float32), SR, subtype="FLOAT")
sf.write("audio/sfx.wav", sfx.astype(np.float32), SR, subtype="FLOAT")
print("music peak", float(np.abs(music).max()), "sfx peak", float(np.abs(sfx).max()), "dur", n / SR)
