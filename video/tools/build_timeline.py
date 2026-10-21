"""Build data/timeline.json: shots, cues, subtitles and chapters, all anchored to words in the narration.

Anchors are (unit, phrase, offset): the time the phrase starts in the narration track, plus offset.
Special phrases: "^" = unit start, "$" = unit end.
"""
import difflib
import json
import re

NARR = json.load(open("audio/narration.json", encoding="utf-8"))
SCRIPT = json.load(open("data/script.json", encoding="utf-8"))
UNITS = {u["id"]: u for u in SCRIPT["units"]}
NU = {u["id"]: u for u in NARR["units"]}
DIG = dict(zip("0123456789", "零一二三四五六七八九"))
FPS = 30


def norm(s):
    s = re.sub(r"\d", lambda m: DIG[m.group(0)], s)
    return [c for c in s if "一" <= c <= "鿿" or c.isalnum()]


def char_times(uid):
    """per-script-character (start, end) times, aligned through the ASR transcript of the chosen take"""
    nu = NU[uid]
    script_chars = norm(UNITS[uid]["tts"])
    asr = [(c, a, b) for c, a, b in nu["chars"]]
    asr_norm = [norm(c)[0] if norm(c) else c for c, _, _ in asr]
    sm = difflib.SequenceMatcher(a=script_chars, b=asr_norm, autojunk=False)
    m = {}
    for blk in sm.get_matching_blocks():
        for k in range(blk.size):
            m[blk.a + k] = blk.b + k
    times = []
    for i in range(len(script_chars)):
        if i in m:
            _, a, b = asr[m[i]]
            times.append((a, b))
        else:
            times.append(None)
    # interpolate gaps (unmatched chars, e.g. English words) between known neighbours
    n = len(times)
    for i in range(n):
        if times[i] is None:
            lo = next((j for j in range(i - 1, -1, -1) if times[j]), None)
            hi = next((j for j in range(i + 1, n) if times[j]), None)
            t0 = times[lo][1] if lo is not None else nu["start"]
            t1 = times[hi][0] if hi is not None else nu["end"]
            span_lo = lo if lo is not None else -1
            span_hi = hi if hi is not None else n
            f = (i - span_lo) / (span_hi - span_lo)
            tt = t0 + (t1 - t0) * f
            times[i] = (tt, tt + 0.15)
    return script_chars, times


CT = {uid: char_times(uid) for uid in UNITS}


def at(uid, phrase="^", off=0.0):
    nu = NU[uid]
    if phrase == "^":
        return nu["start"] + off
    if phrase == "$":
        return nu["end"] + off
    chars, times = CT[uid]
    p = norm(phrase)
    s = "".join(chars)
    k = s.find("".join(p))
    if k < 0:
        raise SystemExit(f"phrase {phrase!r} not found in {uid}: {s}")
    return times[k][0] + off


# ---------------------------------------------------------------- storyboard
A = at
END = NARR["duration"]
SB = [
    dict(scene="go", start=0.0, end=A("U03", "^", 0.05), p=dict(mode="open"),
         cues=dict(heat=A("U01", "^", 0.1), ghost=A("U01", "拿不起", -0.3), dateIn=A("U02", "^", -0.1),
                   handIn=A("U02", "很少有人", -0.4), whoIn=A("U02", "都是一位", 0.0), place=A("U02", "放到棋盘上", 0.35))),
    dict(scene="now", start=A("U03", "^", 0.05), end=A("U04", "$", 0.55), fadeIn=0.25,
         cues=dict(flip=A("U03", "翻跟头", -0.35), run=A("U03", "跑半马", -0.05), sink=A("U03", "可它", -0.2))),
    dict(scene="title", start=A("U04", "$", 0.35), end=A("U05", "^", -0.05), fadeIn=0.35, fadeOut=0.3, p=dict(atmos=0.5), cues=dict(title=A("U04", "$", 0.75))),
    dict(scene="cart", start=A("U05", "^", -0.25), end=A("U06", "$", 0.35), fadeIn=0.3,
         cues=dict(five=A("U06", "五个小时", -0.1), stop=A("U06", "每走一米", 0.0), think=A("U06", "再想", 0.0))),
    dict(scene="moravec", start=A("U07", "^", -0.1), end=A("U07", "$", 0.45), fadeIn=0.3,
         cues=dict(say=A("U07", "他后来总结", 0.0), easy=A("U07", "让电脑下棋", 0.0), hard=A("U07", "难的是", 0.0),
                   look=A("U07", "看一眼", 0.0), walk=A("U07", "走两步", 0.0), grab=A("U07", "伸手拿", 0.0))),
    dict(scene="factory", start=A("U08", "^", -0.1), end=A("U11", "$", 0.4), fadeIn=0.3,
         cues=dict(unimate=A("U09", "^", -0.1), blind=A("U09", "它没有眼睛", -0.05), same=A("U10", "^", 0.0),
                   board=A("U11", "^", -0.2), boardWord=A("U11", "一张棋盘", -0.1))),
    dict(scene="simple", start=A("U12", "^", -0.1), end=A("U12", "$", 0.2), fadeIn=0.25, p=dict(mode="bridge")),
    dict(scene="warehouse", start=A("U13", "^", -0.1), end=A("U13", "$", 0.25), fadeIn=0.25),
    dict(scene="floor", start=A("U14", "^", -0.1), end=A("U14", "$", 0.3), fadeIn=0.25,
         cues=dict(only=A("U14", "那就只交给", 0.0), floor=A("U14", "地板", -0.1))),
    dict(scene="dish", start=A("U15", "^", -0.1), end=A("U15", "$", 0.35), fadeIn=0.25,
         cues=dict(person=A("U15", "会洗碗的", 0.0), box=A("U15", "而是造了个盒子", 0.0), slot=A("U15", "碗插进格子", 0.0),
                   close=A("U15", "关门", -0.05), spray=A("U15", "喷水", -0.05))),
    dict(scene="simple", start=A("U16", "^", -0.1), end=A("U16", "$", 0.9), fadeIn=0.3, p=dict(mode="merge"),
         cues=dict(**{"not": A("U16", "靠的大多不是", 0.0)}, but=A("U16", "而是我们", 0.0))),
    dict(scene="home", start=A("U17", "^", -0.1), end=A("U18", "$", 0.45), fadeIn=0.3, p=dict(tint="warm"),
         cues=dict(home=A("U17", "你家", -0.15), bowls=A("U18", "^", -0.1), shirt=A("U18", "衣服随手", -0.05),
                   cat=A("U18", "猫还会", 0.0), days=A("U18", "每一天", 0.0))),
    dict(scene="turn", start=A("U19", "^", -0.1), end=A("U19", "$", 0.25), fadeIn=0.25,
         cues=dict(lift=A("U19", "改不了世界", -0.05), robot=A("U19", "那就改机器人", 0.0))),
    dict(scene="design", start=A("U20", "^", -0.1), end=A("U20", "$", 0.3), fadeIn=0.25, p=dict(tint="warm"),
         cues=dict(door=A("U20", "门把手", -0.05), stairs=A("U20", "楼梯", -0.05), pan=A("U20", "锅铲", -0.05), morph=A("U20", "那干脆", 0.1))),
    dict(scene="gala", start=A("U21", "^", -0.1), end=A("U21", "$", 0.3), fadeIn=0.25,
         cues=dict(race=A("U21", "还在半马", -0.1))),
    dict(scene="twoways", start=A("U22", "^", -0.1), end=A("U22", "$", 0.35), fadeIn=0.25,
         cues=dict(bowls=A("U22", "和面对", 0.0), two=A("U22", "是两回事", -0.1))),
    dict(scene="teleop", start=A("U23", "^", -0.1), end=A("U23", "$", 0.6), fadeIn=0.25,
         cues=dict(human=A("U23", "背后还要靠", 0.0), far=A("U23", "在远处", 0.0))),
    dict(scene="go", start=A("U24", "^", -0.25), end=A("U24", "$", 0.35), fadeIn=0.4, p=dict(mode="callback", handStays=True),
         cues=dict(handIn=A("U24", "^", -1.6), place=A("U24", "$", 9.0), heat=-9, ghost=-9)),
    dict(scene="hands", start=A("U25", "^", -0.1), end=A("U25", "$", 0.5), fadeIn=0.3, p=dict(tint="warm"),
         cues=dict(wash=A("U25", "也能洗碗", 0.15), cap=A("U25", "拧开瓶盖", -0.05), catch=A("U25", "接住", -0.15), free=A("U25", "它从来", -0.1))),
    dict(scene="ending", start=A("U26", "^", -0.1), end=END, fadeIn=0.3,
         cues=dict(next=A("U27", "^", -0.1), card=A("U27", "$", 0.7))),
]
CHAPTERS = [
    dict(num="02", title="五个小时", start=A("U05", "^", 0.2), end=A("U07", "$", 0.4)),
    dict(num="03", title="把世界摆成棋盘", start=A("U08", "^", 0.2), end=A("U16", "$", 0.6)),
    dict(num="04", title="棋盘之外", start=A("U17", "^", 0.2), end=A("U23", "$", 0.5)),
    dict(num="05", title="那只手", start=A("U24", "^", 0.2), end=A("U27", "$", 0.2)),
]


def subtitles():
    out = []
    order = [u["id"] for u in SCRIPT["units"]]
    for uid in order:
        u = UNITS[uid]
        chunks = u["sub"].split("|")
        chars, times = CT[uid]
        flat = "".join(chars)
        pos = 0
        spans = []
        for ch in chunks:
            plain = re.sub(r"[【】〔〕]", "", ch)
            n = len(norm(plain))
            k0, k1 = pos, min(len(chars), pos + n) - 1
            spans.append((times[k0][0], times[max(k0, k1)][1], ch))
            pos += n
        for i, (s, e, ch) in enumerate(spans):
            nxt = spans[i + 1][0] if i + 1 < len(spans) else e + 0.35
            end = min(nxt - 0.02, max(e + 0.25, s + 0.9)) if i + 1 < len(spans) else e + 0.35
            segs = []
            for m in re.finditer(r"【([^】]*)】|〔([^〕]*)〕|([^【〔]+)", ch):
                if m.group(1):
                    segs.append(dict(t=m.group(1), c="gold"))
                elif m.group(2):
                    segs.append(dict(t=m.group(2), c="cyan"))
                else:
                    segs.append(dict(t=m.group(3)))
            out.append(dict(start=round(s - 0.06, 3), end=round(end, 3), segs=segs))
    return out


def main():
    shots = []
    for s in SB:
        start, end = s["start"], s["end"]
        p = dict(s.get("p", {}))
        if "cues" in s:
            p["cue"] = {k: round(v - start, 3) for k, v in s["cues"].items()}
        shots.append(dict(scene=s["scene"], start=round(start, 3), end=round(end, 3), fadeIn=s.get("fadeIn", 0), fadeOut=s.get("fadeOut", 0.3), p=p))
    tl = dict(
        fps=FPS, duration=round(END, 3), shots=shots, subtitles=subtitles(),
        chapters=[{k: (round(v, 3) if isinstance(v, float) else v) for k, v in c.items()} for c in CHAPTERS],
        disclosure=dict(text="旁白为 AI 合成", start=0.4, end=5.0),
    )
    json.dump(tl, open("data/timeline.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    for s in shots:
        print(f"{s['scene']:10s} {s['start']:7.2f} -> {s['end']:7.2f}  ({s['end'] - s['start']:5.2f}s)  {s['p'].get('cue', {})}")
    print("duration", END, "subs", len(tl["subtitles"]))


if __name__ == "__main__":
    main()
