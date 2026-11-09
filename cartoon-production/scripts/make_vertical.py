#!/usr/bin/env python3
"""Make a VERTICAL 9:16 (1080x1920) renderer from one of the Episode 1-4 render scripts.

Owner request (5 Nov 2026): no blurred side margins, just the original picture, full screen.
The episode's scene list (clips, order, timing, captions, voices, music, sound effects) is kept as is;
only the framing functions are replaced:
  - vertical clips fill the frame (no blurred fill);
  - book spreads/pages (landscape or square) become a full-height vertical window that pans slowly
    across the picture, so nothing is hidden behind margins;
  - the widescreen theme intro and SquishMan.com end card are rebuilt from the owner's vertical
    Maple Hollow logo clips (car-cartoon folder K25 / K27) with the same theme music and text.

Usage: python3 -I make_vertical.py render_episode2.py render_episode2_vertical.py
"""
import re, sys

src, dst = sys.argv[1], sys.argv[2]
s = open(src).read()

def rep(a, b, count=1):
    global s
    assert a in s, f"{src}: not found: {a[:80]}"
    s = s.replace(a, b, count)

rep("W, H, FPS = 1920, 1080, 24", "W, H, FPS = 1080, 1920, 24")
# output folder and file names: epN -> epNvert, add _VERTICAL_1080x1920
m = re.search(r'f"\{S\}/(ep\d+c?)"', s); ep = m.group(1)
rep(f'f"{{S}}/{ep}"', f'f"{{S}}/{ep[:3]}vert"')
s = re.sub(r'(SquishMan_E0\d_[A-Za-z_]+?)_1080p\.mp4', r'\1_VERTICAL_1080x1920.mp4', s)
s = re.sub(r'(SquishMan_E0\d)\.en\.srt', r'\1_VERTICAL.en.srt', s)
s = re.sub(r'(Audio_E0\d)_', r'\1v_', s)
s = s.replace('"""', '"""VERTICAL 9:16 version built by make_vertical.py from ' + src + ' (owner request 5 Nov 2026).\n\n', 1)

OVERRIDE = r'''
# ======== vertical 9:16 overrides (make_vertical.py) ========
import os, textwrap as _tw
for _k, _l in enumerate(open(f"{S}/car/list.tsv")):          # owner's car-cartoon folder clips (K25/K27 logo clips)
    codes.setdefault(f"K{_k+1:02d}", f"{S}/car/clips/" + _l.split("\t")[1])
FILL = f"scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},setsar=1"   # 9:16 sources fill the frame

def fill(label, crop_bottom=0):
    cb = f"crop=iw:ih-{crop_bottom}:0:0," if crop_bottom else ""
    return f"[{label}]{cb}{FILL},fps={FPS}"

def caps_vf(tag, caps):
    f = []
    for k, (t0, t1, text) in enumerate(caps):
        p = f"{OUT}/tmp/{tag}_{k}.txt"; open(p, "w").write("\n".join(_tw.wrap(text, 30)))
        a = f"if(lt(t,{t0}+0.25),(t-{t0})/0.25,if(gt(t,{t1}-0.25),({t1}-t)/0.25,1))"
        f.append(f"drawtext=fontfile={FONT}:textfile={p}:fontsize=58:fontcolor=white:borderw=5:"
                 f"bordercolor=0x14246b:line_spacing=10:text_align=center:box=1:boxcolor=0x0b1640@0.55:"
                 f"boxborderw=24:x=(w-text_w)/2:y=h-text_h-200:alpha='{a}':enable='between(t,{t0},{t1})'")
    return f

# Book pictures: (x-window centre at start, at end) as a share of the picture width; a == b means a slow push-in.
PAN = {"Spread_01_Meet_Squish_Man.png": (0.40, 0.56), "Spread_02_Hero_Portrait.png": (0.52, 0.52),
       "Spread_06_The_Bell_Rings.png": (0.36, 0.70), "Spread_22_Bedtime.png": (0.28, 0.42),
       "Spread_24_Adventure_Awaits.png": (0.33, 0.55), "page-02.jpg": (0.30, 0.70)}
PAGE_BOX = {"page-02.jpg": "744:888:110:38"}     # the page itself inside its blurred preview image

def _picture_vf(img, dur, push):
    """Full-height 9:16 window over a still picture: pans across it, or pushes in slowly."""
    frames = int(dur * FPS); base = os.path.basename(img)
    pre = f"[0:v]crop={PAGE_BOX[base]}," if base in PAGE_BOX else "[0:v]"
    a, b = PAN.get(base, (0.5, 0.5))
    if a == b:
        return (pre + f"crop=trunc(ih*9/16/2)*2:ih:max(0\\,min(iw-ow\\,iw*{a}-ow/2)):0,scale=1620:2880,"
                f"zoompan=z='1+{push}*on/{frames}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={frames}:s={W}x{H}:fps={FPS},setsar=1")
    return (pre + f"fps={FPS},crop=trunc(ih*9/16/2)*2:ih:'max(0,min(iw-ow,iw*({a}+({b}-{a})*t/{dur})-ow/2))':0,"
            f"scale={W}:{H}:flags=lanczos,setsar=1")

def still(n, img, dur, caps, crop=None, yfrac=0.55, push=0.07, freeze_clip=None):
    frames = int(dur * FPS)
    if freeze_clip:
        code, at = freeze_clip; img = f"{OUT}/tmp/{n}.png"
        run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-ss", str(at), "-i", codes[code], "-frames:v", "1", img])
        pre = (f"[0:v]{FILL},scale=1620:2880,zoompan=z='1+{push}*on/{frames}':x='iw/2-(iw/zoom/2)':"
               f"y='ih/2-(ih/zoom/2)':d={frames}:s={W}x{H}:fps={FPS},setsar=1")
    else:
        pre = _picture_vf(img, dur, push)
    vf = pre + "".join("," + x for x in caps_vf(n, caps)) + f",fade=in:st=0:d=0.3,fade=out:st={dur-0.3}:d=0.3[v]"
    run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-loop", "1", "-t", str(dur), "-i", img,
         "-f", "lavfi", "-t", str(dur), "-i", "anullsrc=r=48000:cl=stereo",
         "-filter_complex", vf, "-map", "[v]", "-map", "1:a", "-t", str(dur), *ENC, f"{OUT}/scenes/{n}.mp4"])

def page(n, img, dur, caps, audio_from=None, chime_at=None):
    """Episode 2: a book page or a frozen frame, full screen, with its narration or a chime."""
    import cv2 as _cv
    h0, w0 = _cv.imread(img).shape[:2]
    frames = int(dur * FPS)
    if w0 / h0 < 0.6:      # a vertical clip frame
        vf = (f"[0:v]{FILL},scale=1620:2880,zoompan=z='1+0.05*on/{frames}':x='iw/2-(iw/zoom/2)':"
              f"y='ih/2-(ih/zoom/2)':d={frames}:s={W}x{H}:fps={FPS},setsar=1")
    else:
        vf = _picture_vf(img, dur, 0.05)
    vf += "".join("," + x for x in caps_vf(n, caps)) + f",fade=in:st=0:d=0.3,fade=out:st={dur-0.3}:d=0.3[v]"
    ins = ["-loop", "1", "-t", str(dur), "-i", img]
    if audio_from:
        ins += ["-ss", str(audio_from[1]), "-t", str(dur), "-i", codes[audio_from[0]]]
        af = f"[1:a]loudnorm=I=-16:TP=-2,aresample=48000,aformat=channel_layouts=stereo,afade=out:st={dur-0.4}:d=0.4,apad=whole_dur={dur}[a]"
    else:
        ins += ["-f", "lavfi", "-t", str(dur), "-i", "anullsrc=r=48000:cl=stereo"]
        if chime_at is not None:
            ins += ["-i", CHIME]
            af = f"[2:a]adelay={int(chime_at*1000)}|{int(chime_at*1000)}[c];[1:a][c]amix=inputs=2:normalize=0,apad=whole_dur={dur}[a]"
        else:
            af = f"[1:a]apad=whole_dur={dur}[a]"
    run(["ffmpeg", "-nostdin", "-v", "error", "-y", *ins, "-filter_complex", vf + ";" + af,
         "-map", "[v]", "-map", "[a]", "-t", str(dur), *ENC, f"{OUT}/scenes/{n}.mp4"])

def vcard(n, code, dur, text, aud_src, aud_ss, size=64, fade_in_at=2.0):
    """Vertical title card: the owner's vertical Maple Hollow logo clip, theme music, text at the bottom."""
    p = f"{OUT}/tmp/{n}.txt"; open(p, "w").write(text)
    src_len = min(dur, 8.0)
    vf = (f"[0:v]fps={FPS},{FILL},tpad=stop_mode=clone:stop_duration={max(0, dur-src_len)},"
          f"drawtext=fontfile={FONT}:textfile={p}:fontsize={size}:fontcolor=white:borderw=6:bordercolor=0x14246b:"
          f"line_spacing=16:text_align=center:x=(w-text_w)/2:y=h-text_h-220:"
          f"alpha='if(lt(t,{fade_in_at}),0,min(1,(t-{fade_in_at})/0.5))',fade=in:st=0:d=0.5,fade=out:st={dur-0.7}:d=0.7[v]")
    af = (f"[1:a]atrim={aud_ss}:{aud_ss+dur},asetpts=N/SR/TB,loudnorm=I=-17:TP=-2,aresample=48000,"
          f"afade=in:d=0.4,afade=out:st={dur-1.2}:d=1.2[a]")
    run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-t", str(src_len), "-i", codes[code], "-i", aud_src,
         "-filter_complex", vf + ";" + af, "-map", "[v]", "-map", "[a]", "-t", str(dur), *ENC, f"{OUT}/scenes/{n}.mp4"])

def intro16(n, code, ss, dur, lines):
    """Theme intro: same theme audio and episode title, on the vertical Maple Hollow logo clip."""
    title = "\n".join("\n".join(_tw.wrap(l, 22)) for l in lines.split("\n"))
    vcard(n, "K25", dur, title, codes[code], ss)

def card(n, dur, lines, *args, **kw):
    """SquishMan.com end card: same text and theme music, on the vertical logo + website clip."""
    text = "\n".join("\n".join(_tw.wrap(l, 26)) for l in lines.split("\n"))
    vcard(n, "K27", dur, text, THEME, 38.0, size=56, fade_in_at=0.3)
# ======== end of vertical overrides ========
'''
rep("\nSC = []", OVERRIDE + "\nSC = []")
# the scene list must still be the original one
open(dst, "w").write(s)
print("wrote", dst, "->", ep[:3] + "vert")
