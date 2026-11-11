#!/usr/bin/env python3
"""Render five 9:16 YouTube Shorts from the original Episode 1 master (read-only).

Each Short = list of source segments (start, end, framing keyframes) cut from
episode1.mp4, smart-reframed to a 9:16 window (no bars, no blur fill), joined with
short audio fades, then captioned with Fredoka Bold.

Usage: python3 -I render_shorts.py <scratch> [short numbers...]
"""
import json, os, subprocess, sys, textwrap

S = sys.argv[1]
SRC = f"{S}/src/episode1.mp4"
FONT = f"{S}/assets/Fredoka.ttf"
OUT = os.environ.get("SHORTS_OUT", f"{S}/Squish_Man_Episode_1_Promo_Shorts")
TMP = f"{S}/work"
W, H, FPS = 1080, 1920, 30
CW = 608                       # 9:16 window inside the 1920x1080 source (1080*9/16 = 607.5)

def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode:
        print(r.stderr[-3000:]); raise SystemExit(1)

def xexpr(keys, a):
    """Piecewise-linear crop x (pixels) from [(src_time, centre_fraction)], t relative to segment start."""
    pts = [(t - a, min(max(c, 0.16), 0.84) * 1920 - CW / 2) for t, c in keys]
    if len(pts) == 1:
        return f"{pts[0][1]:.1f}"
    e = f"{pts[-1][1]:.1f}"
    for (t0, x0), (t1, x1) in reversed(list(zip(pts, pts[1:]))):
        # ease in/out between keyframes so pans feel like a camera operator, not a robot
        u = f"((t-{t0:.3f})/{t1 - t0:.3f})"
        ease = f"(3*{u}*{u}-2*{u}*{u}*{u})"
        e = f"if(lt(t,{t1:.3f}),{x0:.1f}+({x1 - x0:.1f})*{ease},{e})"
    return f"if(lt(t,{pts[0][0]:.3f}),{pts[0][1]:.1f},{e})"

def cut(i, a, b, keys, fin=0.08, fout=0.12):
    """One reframed segment, video + audio, with tiny audio fades so joins never click."""
    d = b - a
    p = f"{TMP}/seg_{i:02d}.mp4"
    vf = (f"crop={CW}:1080:'{xexpr(keys, a)}':0,scale={W}:{H}:flags=lanczos,setsar=1,fps={FPS},format=yuv420p")
    af = f"afade=t=in:d={fin},afade=t=out:st={d - fout:.3f}:d={fout},aresample=48000"
    run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-ss", f"{a:.3f}", "-i", SRC, "-t", f"{d:.3f}",
         "-vf", vf, "-af", af, "-c:v", "libx264", "-preset", "medium", "-crf", "14",
         "-c:a", "pcm_s16le", "-ar", "48000", p])
    return p, d

def wrap(text, n=20):
    return "\n".join(textwrap.wrap(text, n))

def dt(tag, k, text, size, color, border, y, t0, t1, box=None, fade=0.2, n=20):
    p = f"{TMP}/{tag}_{k}.txt"
    open(p, "w").write(wrap(text, n))
    a = f"if(lt(t,{t0}+{fade}),(t-{t0})/{fade},if(gt(t,{t1}-{fade}),({t1}-t)/{fade},1))"
    s = (f"drawtext=fontfile={FONT}:textfile={p}:fontsize={size}:fontcolor={color}:borderw={max(4, size // 9)}:"
         f"bordercolor={border}:line_spacing={size // 6}:text_align=center:x=(w-text_w)/2:y={y}:"
         f"alpha='{a}':enable='between(t,{t0},{t1})'")
    if box:
        s += f":box=1:boxcolor={box}:boxborderw={size // 3}"
    return s

def phrases(text, limit=28):
    """Split a line into balanced subtitle phrases (one or two short lines each), preferring punctuation breaks."""
    import math
    if len(text) <= limit:
        return [text]
    k = math.ceil(len(text) / limit)
    target = len(text) / k
    words, out, cur = text.split(), [], ""
    for i, w in enumerate(words):
        cur = (cur + " " + w).strip()
        nxt = words[i + 1] if i + 1 < len(words) else None
        if nxt is None:
            break
        rest = len(" ".join(words[i + 1:]))
        punct = w[-1] in ",.!?;"
        if (punct and len(cur) >= target * 0.6 and rest >= 8) or len(cur) + 1 + len(nxt) > target * 1.2:
            out.append(cur); cur = ""
    out.append(cur)
    return out

def render(n, spec):
    os.makedirs(TMP, exist_ok=True)
    parts, src_map, t = [], [], 0.0
    for i, (a, b, keys) in enumerate(spec["segments"]):
        p, d = cut(n * 10 + i, a, b, keys)
        parts.append(p); src_map.append((t, a, b)); t += d
    total = t
    lst = f"{TMP}/list_{n}.txt"
    open(lst, "w").write("".join(f"file '{p}'\n" for p in parts))
    joined = f"{TMP}/joined_{n}.mov"
    run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", joined])

    def out_t(src_t):
        """Map an episode timestamp to the Short's timeline."""
        for o, a, b in src_map:
            if a - 0.05 <= src_t <= b + 0.05:
                return round(o + (src_t - a), 2)
        raise ValueError(f"short {n}: {src_t} not in any segment")

    f = []
    # title banner (first seconds)
    f.append(dt(f"t{n}", 0, spec["title"], 126, "0xFFD52A", "0x17315d", "230", 0.15, spec.get("title_end", 3.2), n=12))
    # dialogue captions (episode times -> short times)
    k = 0
    for s0, s1, text in spec["captions"]:
        a, b = out_t(s0), out_t(s1)
        parts = phrases(text)
        tot = sum(len(x) for x in parts)
        t = a
        for x in parts:   # short phrases, timed in proportion to their length
            d = (b - a) * len(x) / tot
            f.append(dt(f"c{n}", k, x, 60, "white", "0x14246b", "h*0.80-text_h", round(t, 2), round(t + d, 2),
                        box="0x0b1640@0.50", fade=0.08, n=30))
            t += d; k += 1
    # rotating product-name chips (real store products only)
    ch = spec.get("chips")
    if ch:
        cols = ["0xE5398D@0.92", "0x1D4FA8@0.92", "0x7B3FC4@0.92", "0x0F9D9A@0.92", "0xF07C1A@0.92"]
        for i, item in enumerate(ch["items"]):
            c0 = round(ch["start"] + i * ch["each"], 2); c1 = round(c0 + ch["each"], 2)
            f.append(dt(f"p{n}", i, item, 76, "white", "0x14246b", "330", c0, c1, box=cols[i % len(cols)], fade=0.1, n=18))
    # end call to action
    e0 = round(total - spec.get("end_len", 3.3), 2)
    f.append(dt(f"e{n}", 0, spec["end"], spec.get("end_size", 90), "0xFFD52A", "0x17315d", "h*0.30", e0, total + 1,
                box="0xb3121b@0.80", fade=0.25, n=spec.get("end_wrap", 16)))
    final = f"{OUT}/{spec['file']}"
    run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-i", joined, "-vf", ",".join(f),
         "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-profile:v", "high", "-level", "4.2",
         "-pix_fmt", "yuv420p", "-r", str(FPS), "-g", "60", "-movflags", "+faststart",
         "-af", "alimiter=limit=0.84:attack=2:release=60:level=false", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2", final])
    return final, total, src_map

SPECS = json.load(open(os.environ.get("SHORTS_SPEC", f"{S}/scripts/shorts.json")))
os.makedirs(OUT, exist_ok=True)
want = sys.argv[2:] or list(SPECS)
report = {}
for k in want:
    final, total, src_map = render(int(k), SPECS[k])
    report[k] = {"file": final, "duration": round(total, 2), "segments": src_map}
    print(k, final, round(total, 2), flush=True)
json.dump(report, open(f"{TMP}/report_{'_'.join(want)}.json", "w"), indent=1)
