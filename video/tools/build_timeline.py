"""Build data/timeline.json for the realistic film (engine2): shots, cues, subtitles, chapters and dips to black,
all anchored to words in the narration (audio/narration.json, made by tools/tts_select.py).

Anchors: A(unit, phrase, offset) = the time the phrase starts in the narration, plus offset. "^" = unit start,
"$" = unit end. A shot whose scene module does not exist yet becomes a slate (previews only).
Subtitle chunks that are quotations (“...”) are shown in the quote style (large, mid-frame).
"""
import difflib
import json
import os
import re
import sys

NARR = json.load(open("audio/narration.json", encoding="utf-8"))
SCRIPT = json.load(open("data/script.json", encoding="utf-8"))
UNITS = {u["id"]: u for u in SCRIPT["units"]}
NU = {u["id"]: u for u in NARR["units"]}
DIG = dict(zip("0123456789", "零一二三四五六七八九"))
FPS = 24


def norm(s):
    s = re.sub(r"\d", lambda m: DIG[m.group(0)], s)
    return [c for c in s.lower() if "一" <= c <= "鿿" or c.isalnum()]


def char_times(uid):
    """per-script-character (start, end) times, aligned through the ASR transcript of the chosen take"""
    nu = NU[uid]
    script_chars = norm(UNITS[uid]["tts"])
    asr = [(c, a, b) for c, a, b in nu["chars"]]
    asr_norm = [(norm(c) or [c])[0] for c, _, _ in asr]
    sm = difflib.SequenceMatcher(a=script_chars, b=asr_norm, autojunk=False)
    m = {}
    for blk in sm.get_matching_blocks():
        for k in range(blk.size):
            m[blk.a + k] = blk.b + k
    times = [(asr[m[i]][1], asr[m[i]][2]) if i in m else None for i in range(len(script_chars))]
    n = len(times)
    for i in range(n):
        if times[i] is None:
            lo = next((j for j in range(i - 1, -1, -1) if times[j]), None)
            hi = next((j for j in range(i + 1, n) if times[j]), None)
            t0 = times[lo][1] if lo is not None else nu["start"]
            t1 = times[hi][0] if hi is not None else nu["end"]
            f = (i - (lo if lo is not None else -1)) / ((hi if hi is not None else n) - (lo if lo is not None else -1))
            tt = t0 + (t1 - t0) * f
            times[i] = (tt, tt + 0.15)
    return script_chars, times


CT = {uid: char_times(uid) for uid in UNITS}


def A(uid, phrase="^", off=0.0):
    nu = NU[uid]
    if phrase == "^":
        return nu["start"] + off
    if phrase == "$":
        return nu["end"] + off
    chars, times = CT[uid]
    p = "".join(norm(phrase))
    s = "".join(chars)
    k = s.find(p)
    if k < 0:
        raise SystemExit(f"phrase {phrase!r} not found in {uid}: {s}")
    return times[k][0] + off


END = NARR["duration"]


def shot(scene, start, end, p=None, cues=None, fadeIn=0.0, fadeOut=0.0, label=None):
    return dict(scene=scene, start=start, end=end, p=p or {}, cues=cues or {}, fadeIn=fadeIn, fadeOut=fadeOut, label=label)


# ---------------------------------------------------------------- the shot list (docs/ep01-storyboard-v2.md)
def storyboard():
    S = []
    # hook
    S.append(shot("go_place", 0.0, A("H1", "为什么", -0.08), p=dict(cam="hero", slow=2.6), cues=dict(contact=A("H1", "冠军", 0.05))))
    S.append(shot("dish", A("H1", "为什么", -0.08), A("H1", "$", 0.5), cues=dict(slip=A("H1", "为什么", 0.25), impact=A("H1", "碗", 0.0))))
    S.append(shot("go_board", A("H1", "$", 0.5), A("H2", "$", 1.35), p=dict(mode="still", n=37, cam="macro", key=6)))
    # 1 第37手
    S.append(shot("hall", A("A01", "^", -0.7), A("A02", "^", -0.12), p=dict(mode="wide"), cues=dict(date=A("A01", "^", 0.0)), fadeIn=0.6))
    S.append(shot("hall", A("A02", "^", -0.12), A("A02", "另一边", -0.12), p=dict(mode="lee"), cues=dict(lee=A("A02", "李世石", -0.3))))
    S.append(shot("hall", A("A02", "另一边", -0.12), A("A03", "^", -0.12), p=dict(mode="machine"), cues=dict(alphago=A("A02", "alphago", -0.2))))
    S.append(shot("scorecard", A("A03", "^", -0.12), A("A04", "$", 0.55), cues=dict(five=A("A03", "五比零", -0.1), four=A("A03", "四比一", -0.1), lose=A("A04", "输了", -0.12)), fadeIn=0.25))
    S.append(shot("hall", A("A04", "$", 0.55), A("A05", "$", 0.3), p=dict(mode="empty"), cues=dict(rise=A("A05", "起身", -0.15)), fadeIn=0.3))
    S.append(shot("go_place", A("A05", "$", 0.3), A("A06", "$", 0.95), p=dict(slow=2.2, camera=dict(pos=[0.018, 0.03, -0.095], look=[0.111, 0.009, 0.0], fov=16), label=dict(text="第 37 手", size=104, y=280)),
                  cues=dict(contact=A("A06", "一手", 0.1), label=A("A06", "第三十七手", -0.05))))
    S.append(shot("commentary", A("A06", "$", 0.95), A("A07", "$", 0.6), cues=dict(strange=A("A07", "很奇怪", -0.7), place=A("A07", "很奇怪", 0.8), mistake=A("A07", "我以为", 0.0)), fadeIn=0.3))
    S.append(shot("hall", A("A07", "$", 0.6), A("A08", "$", 0.45), p=dict(mode="pov"), cues=dict(think=A("A08", "盯着棋盘", 0.0)), fadeIn=0.3))
    tw = A("A09", "万分之一", -0.05)
    S.append(shot("go_board", A("A08", "$", 0.45), A("A10", "$", 0.75), p=dict(mode="heat", cam="top"),
                  cues=dict(heat=A("A09", "alphago", -0.3), count=tw - 1.8, fade=A("A10", "这不像", 0.4), stone=A("A10", "可它还是", 0.35), close=A("A10", "下了", 0.0)), fadeIn=0.3))
    S.append(shot("go_board", A("A10", "$", 0.75), A("A11", "$", 0.45), p=dict(mode="lapse", cam="angle", **{"from": 37, "to": 200}),
                  cues=dict(a=A("A11", "^", 0.2), b=A("A11", "$", 0.0), curve=A("A11", "alphago", -0.15)), fadeIn=0.25))
    S.append(shot("go_place", A("A11", "$", 0.45), A("A12", "$", 0.9), p=dict(side="W", color="W", n=211, move=211, at=[0.15, -0.219], slow=1.6,
                  camera=dict(pos=[0.5, 0.12, -0.02], look=[0.13, 0.01, -0.2], fov=26)), cues=dict(contact=A("A12", "投子", 0.15)), fadeIn=0.2))
    S.append(shot("go_board", A("A12", "$", 0.9), A("A13", "$", 1.2), p=dict(mode="still", n=211, cam="top", dim=0.55, exposure=0.8), fadeIn=0.4))
    # 2 拿不起的棋子
    S.append(shot("go_place", A("A13", "$", 1.2), A("B15", "$", 0.6), p=dict(cam="reveal", slow=2.0, revealDur=3.6),
                  cues=dict(contact=A("B14", "细节", 0.2), reveal=A("B15", "并不是", -0.4)), fadeIn=0.5))
    S.append(shot("hall", A("B15", "$", 0.6), A("B16", "他看着", -0.1), p=dict(mode="watch", caption=dict(name="黄士杰", en="AJA HUANG · DEEPMIND", role="DeepMind 工程师")),
                  cues=dict(screen=A("B16", "^", 0.6), aja=A("B16", "黄士杰", -0.2)), fadeIn=0.25))
    t0, t1, t2 = A("B16", "他看着", -0.1), A("B16", "用自己的手", -0.1), A("B16", "落下了", -0.1)
    S.append(shot("go_place", t0, t1, p=dict(move=39, cam="top", slow=1.0, push=0.05), cues=dict(contact=t1 - 0.25)))
    S.append(shot("go_place", t1, t2, p=dict(move=41, cam="hero", slow=1.0, push=0.05), cues=dict(contact=t2 - 0.3)))
    S.append(shot("go_place", t2, A("B16", "$", 0.7), p=dict(move=43, cam="low", slow=1.2, push=0.08), cues=dict(contact=A("B16", "每一颗", 0.2))))
    S.append(shot("botreach", A("B16", "$", 0.7), A("B17", "$", 1.2), cues=dict(freeze=A("B17", "拿不起", -0.1)), fadeIn=0.35))
    S.append(shot("botstage", A("B17", "$", 1.2), A("B18", "今天的", -0.1), p=dict(mode="years"),
                  cues=dict(roll=A("B18", "^", 0.1), land=A("B18", "转眼", 0.2), light=A("B18", "十年过去", 0.2)), fadeIn=0.4))
    S.append(shot("botstage", A("B18", "今天的", -0.1), A("B18", "可它", -0.1), p=dict(mode="labels"),
                  cues=dict(flip=A("B18", "翻跟头", -0.05), run=A("B18", "跑半马", -0.05))))
    S.append(shot("dish", A("B18", "可它", -0.1), A("B18", "$", 0.5), p=dict(seed=19), cues=dict(slip=A("B18", "可它", 0.2), impact=A("B18", "碗", 0.0))))
    S.append(shot("titlecard", A("B19", "$", 0.3), A("B19", "$", 3.25), cues=dict(title=A("B19", "$", 0.75)), fadeIn=0.5, fadeOut=0.0))
    # 3 五个小时
    S.append(shot("cart", A("C20", "^", -0.4), A("C21", "^", -0.1), p=dict(mode="room"), cues=dict(title=A("C20", "^", 0.1)), fadeIn=0.6))
    S.append(shot("cart", A("C21", "^", -0.1), A("C21", "$", 0.5), p=dict(mode="crawl"),
                  cues=dict(five=A("C21", "五个小时", -0.6), stop=A("C21", "每走一米", 0.0), photo=A("C21", "拍照", 0.0), think=A("C21", "再想", 0.0))))
    S.append(shot("balance", A("C21", "$", 0.5), A("C22", "$", 0.5), cues=dict(name=A("C22", "莫拉维克", -0.2), easy=A("C22", "让电脑下棋", 0.0), hard=A("C22", "难的是", 0.0),
                  look=A("C22", "看一眼", 0.0), walk=A("C22", "走两步", 0.0), grab=A("C22", "伸手拿", 0.0)), fadeIn=0.3))
    S.append(shot("go_place", A("C22", "$", 0.5), A("C23", "$", 0.9), p=dict(cam="hero", slow=2.4, key=7), cues=dict(contact=A("C23", "一只人的手", 0.4)), fadeIn=0.4))
    # 4 把世界摆成棋盘
    S.append(shot("factory_grid", A("D24", "^", -0.4), A("D24", "$", 0.4), p=dict(mode="match"), cues=dict(factory=A("D24", "工厂里的", -0.1)), fadeIn=0.5))
    S.append(shot("unimate", A("D24", "$", 0.4), A("D25", "$", 0.4), p=dict(mode="work"), cues=dict(title=A("D25", "^", 0.1), open=A("D25", "从压铸机里", -0.5), grip=A("D25", "夹出", 0.0), hot=A("D25", "滚烫的", 0.0)), fadeIn=0.3))
    S.append(shot("unimate", A("D25", "$", 0.4), A("D26", "$", 0.4), p=dict(mode="blind"), cues=dict(dark=A("D26", "看不见", -0.3))))
    S.append(shot("unimate", A("D26", "$", 0.4), A("D27", "$", 0.4), p=dict(mode="repeat"), cues=dict(each=A("D27", "每个零件", 0.0), same=A("D27", "同一个位置", 0.0))))
    S.append(shot("factory_grid", A("D27", "$", 0.4), A("D28", "$", 0.6), p=dict(mode="board"), cues=dict(board=A("D28", "一张棋盘", -0.1)), fadeIn=0.3))
    S.append(shot("warehouse", A("D28", "$", 0.6), A("D30", "那就在", -0.1), p=dict(mode="wide"), fadeIn=0.3))
    S.append(shot("warehouse", A("D30", "那就在", -0.1), A("D30", "$", 0.3), p=dict(mode="low"), cues=dict(codes=A("D30", "二维码", -0.3), grid=A("D30", "格子里", -0.1))))
    S.append(shot("vacuum", A("D30", "$", 0.3), A("D31", "$", 0.3), cues=dict(floor=A("D31", "地板", -0.2)), fadeIn=0.25))
    S.append(shot("dishwasher", A("D31", "$", 0.3), A("D32", "$", 0.4), cues=dict(slot=A("D32", "碗插进", -0.1), close=A("D32", "关门", -0.1), spray=A("D32", "喷水", -0.1)), fadeIn=0.25))
    S.append(shot("grids", A("D32", "$", 0.4), A("D33", "$", 1.1), cues=dict(**{"not": A("D33", "靠的大多不是", 0.0)}, but=A("D33", "而是我们", 0.0), simple=A("D33", "变简单了", -0.1)), fadeIn=0.3))
    # 5 棋盘之外
    S.append(shot("home", A("D33", "$", 1.1), A("E34", "$", 0.4), p=dict(mode="grid"), cues=dict(**{"break": A("E34", "你家", -0.15)}), fadeIn=0.5))
    S.append(shot("home", A("E34", "$", 0.4), A("E35", "$", 0.5), p=dict(mode="days"), cues=dict(shirt=A("E35", "衣服随手", -0.1), cat=A("E35", "猫还会", 0.0), days=A("E35", "每一天", -0.1)), fadeIn=0.3))
    S.append(shot("botgen", A("E35", "$", 0.5), A("E36", "$", 0.35), cues=dict(robot=A("E36", "改机器人", -0.2)), fadeIn=0.3))
    S.append(shot("design", A("E36", "$", 0.35), A("E37", "$", 0.4), cues=dict(door=A("E37", "门把手", -0.15), stairs=A("E37", "楼梯", -0.15), pan=A("E37", "锅铲", -0.15), robot=A("E37", "那干脆", 0.0)), fadeIn=0.25))
    S.append(shot("gala", A("E37", "$", 0.4), A("E38", "还在半马", -0.15), p=dict(mode="stage"), fadeIn=0.3))
    S.append(shot("gala", A("E38", "还在半马", -0.15), A("E38", "$", 0.35), p=dict(mode="race"), cues=dict(win=A("E38", "跑赢了", 0.0))))
    S.append(shot("twoways", A("E38", "$", 0.35), A("E39", "$", 0.45), cues=dict(bowls=A("E39", "和面对", -0.1), two=A("E39", "是两回事", -0.1)), fadeIn=0.3))
    S.append(shot("teleop", A("E39", "$", 0.45), A("E40", "$", 0.3), cues=dict(human=A("E40", "背后还要靠", -0.1), far=A("E40", "在远处", 0.0)), fadeIn=0.3))
    S.append(shot("go_place", A("E40", "$", 0.3), A("E41", "$", 1.1), p=dict(cam="hero", slow=2.0), cues=dict(contact=A("E41", "那位工程师", 0.2)), fadeIn=0.6))
    # 6 那只手
    S.append(shot("go_place", A("E41", "$", 1.1), A("F42", "也能洗碗", -0.1), p=dict(cam="low", slow=1.6, key=7.5), cues=dict(contact=A("F42", "一颗棋子", 0.1)), fadeIn=0.5))
    S.append(shot("hands", A("F42", "也能洗碗", -0.1), A("F42", "拧开瓶盖", -0.1), p=dict(mode="wash")))
    S.append(shot("hands", A("F42", "拧开瓶盖", -0.1), A("F42", "接住", -0.25), p=dict(mode="cap"), cues=dict(twist=A("F42", "拧开瓶盖", 0.15))))
    S.append(shot("hands", A("F42", "接住", -0.25), A("F42", "$", 0.7), p=dict(mode="catch", slow=5), cues=dict(catch=A("F42", "杯子", 0.0))))
    S.append(shot("factory_grid", A("F42", "$", 0.7), A("F43", "$", 0.6), p=dict(mode="cold"), fadeIn=0.4))
    S.append(shot("homebot", A("F43", "$", 0.6), A("F44", "$", 0.8), fadeIn=0.4))
    S.append(shot("ending", A("F44", "$", 0.8), END, cues=dict(slip=A("F45", "不会出现", -0.3), place=A("F45", "厨房里", 0.4), card=A("F45", "$", 0.9)), fadeIn=0.5))
    return S


CHAPTERS = [("01", "第37手", "A01"), ("02", "拿不起的棋子", "B14"), ("03", "五个小时", "C20"), ("04", "把世界摆成棋盘", "D24"), ("05", "棋盘之外", "E34"), ("06", "那只手", "F42")]


def blacks():
    # dips to black between chapters and around the title
    return [
        dict(at=A("H2", "$", 0.75), **{"in": 0.5}, hold=0.25, out=0.6),
        dict(at=A("B19", "^", -0.45), **{"in": 0.3}, hold=0.0, out=0.0),
        dict(at=A("B19", "$", 2.85), **{"in": 0.4}, hold=0.2, out=0.6),
        dict(at=A("C23", "$", 0.4), **{"in": 0.4}, hold=0.2, out=0.5),
        dict(at=A("D33", "$", 0.6), **{"in": 0.45}, hold=0.2, out=0.5),
        dict(at=A("E41", "$", 0.6), **{"in": 0.45}, hold=0.2, out=0.6),
    ]


def subtitles(quote_units=("A07", "A13")):
    out = []
    for u in SCRIPT["units"]:
        uid = u["id"]
        chunks = u["sub"].split("|")
        chars, times = CT[uid]
        pos = 0
        spans = []
        for ch in chunks:
            plain = re.sub(r"[【】〔〕]", "", ch)
            n = len(norm(plain))
            k0, k1 = pos, min(len(chars), pos + n) - 1
            spans.append((times[k0][0], times[max(k0, k1)][1], ch))
            pos += n
        for i, (s, e, ch) in enumerate(spans):
            end = min(spans[i + 1][0] - 0.02, max(e + 0.25, s + 0.9)) if i + 1 < len(spans) else e + 0.35
            segs = []
            for m in re.finditer(r"【([^】]*)】|〔([^〕]*)〕|([^【〔]+)", ch):
                if m.group(1):
                    segs.append(dict(t=m.group(1), c="gold"))
                elif m.group(2):
                    segs.append(dict(t=m.group(2), c="cyan"))
                else:
                    segs.append(dict(t=m.group(3)))
            sub = dict(start=round(s - 0.06, 3), end=round(end, 3), segs=segs)
            plain = re.sub(r"[【】〔〕]", "", ch)
            if uid in quote_units and ("“" in plain or "”" in plain or (uid == "A13" and i > 0)):
                sub["style"] = "quote"
            out.append(sub)
    return out


def main():
    shots = []
    for i, s in enumerate(storyboard()):
        start, end = s["start"], s["end"]
        scene = s["scene"]
        p = dict(s["p"])
        if not os.path.exists(f"shots/{scene}.js"):
            p = dict(label=f"{scene} {json.dumps(s['p'], ensure_ascii=False)[:60]}")
            scene = "slate"
        cues = {k: round(v, 3) for k, v in s["cues"].items()}
        shots.append(dict(id=f"s{i:02d}", scene=scene, start=round(start, 3), end=round(end, 3), fadeIn=s["fadeIn"], fadeOut=s["fadeOut"], p=p, cues=cues))
    chapters = []
    for num, title, uid in CHAPTERS:
        t0 = A(uid, "^", -0.2)
        chapters.append(dict(num=num, title=title, start=round(t0, 3), end=round(t0 + 6.0, 3)))
    tl = dict(fps=FPS, duration=round(END, 3), grain=0.06, shots=shots, subtitles=subtitles(), chapters=chapters, blacks=blacks(),
              disclosure=dict(text="旁白为 AI 合成 · 画面为三维重现", start=1.0, end=6.0))
    json.dump(tl, open("data/timeline.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    for s in shots:
        print(f"{s['id']} {s['scene']:12s} {s['start']:7.2f} -> {s['end']:7.2f} ({s['end'] - s['start']:5.2f}s) {s['p'].get('mode', '')} {s['cues']}")
    bad = [(a['id'], b['id']) for a, b in zip(shots, shots[1:]) if b['start'] - a['end'] > 0.02 or b['start'] < a['start']]
    print("duration", END, "shots", len(shots), "subs", len(tl["subtitles"]), "gaps/overlaps:", bad or "none")


if __name__ == "__main__":
    main()
