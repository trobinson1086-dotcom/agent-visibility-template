#!/usr/bin/env python3
"""Episode 4 — Squish Man and the Courage Star (clips only). Engine copied from the Episode 1 build, following the Google Flow clips' own storyline (owner-approved
3 Nov 2026): Squish Man and Pudy at the Puppy Parade, Pudy goes missing, Squish Man follows the paw
prints, Mrs. Whiskers helps, and the friends are reunited.

Voices: the clips' own dialogue, two narration lines from the owner's CapCut edit (lv_0), and the
ElevenLabs "Clara" narration lines already generated. Gaps use the owner's Book 1 spread art.
"""
import subprocess, os, sys, textwrap

S = os.environ.get("SQUISH_SCRATCH") or sys.exit("set SQUISH_SCRATCH")
RAW, SP, NARR, OUT = f"{S}/raw", f"{S}/spreads", f"{S}/narr", f"{S}/ep4"
LV = f"{S}/big/18HYg4fOk24DSkrahXdj3L4m05401C5tJ.mp4"   # owner's CapCut Book 1 edit
FONT, LOGO = f"{S}/assets/Fredoka.ttf", f"{S}/assets/logo_alpha.png"
for d in ("scenes", "tmp"): os.makedirs(f"{OUT}/{d}", exist_ok=True)
codes, THEME = {}, None
for l in open(f"{S}/codes.tsv"):
    c, i, n = l.rstrip("\n").split("\t"); codes[c] = f"{RAW}/{i}.mp4"
    if "Theme" in n: THEME = codes[c]
codes["LV"] = LV
W, H, FPS = 1920, 1080, 24
ENC = ["-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
       "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2"]

def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode: sys.exit(" ".join(cmd)[:300] + "\n" + r.stderr[-2500:])

def caps_vf(tag, caps):
    f = []
    for k, (t0, t1, text) in enumerate(caps):
        p = f"{OUT}/tmp/{tag}_{k}.txt"; open(p, "w").write("\n".join(textwrap.wrap(text, 44)))
        a = f"if(lt(t,{t0}+0.25),(t-{t0})/0.25,if(gt(t,{t1}-0.25),({t1}-t)/0.25,1))"
        f.append(f"drawtext=fontfile={FONT}:textfile={p}:fontsize=52:fontcolor=white:borderw=5:"
                 f"bordercolor=0x14246b:line_spacing=10:text_align=center:box=1:boxcolor=0x0b1640@0.55:"
                 f"boxborderw=24:x=(w-text_w)/2:y=h-text_h-64:alpha='{a}':enable='between(t,{t0},{t1})'")
    return f

SFX = {"bell": ("0.35*sin(2*PI*1318*t)*exp(-4*mod(t,0.62))+0.28*sin(2*PI*659*t)*exp(-3*mod(t,0.62))", 2.0),
       "chime": ("0.3*sin(2*PI*1568*t)*exp(-5*t)+0.3*sin(2*PI*2093*t)*exp(-5*(t-0.18))*gte(t,0.18)", 1.2)}
for k, (e, d) in SFX.items():
    run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-f", "lavfi", "-i", f"aevalsrc='{e}':s=48000:d={d}",
         "-af", "aformat=channel_layouts=stereo", f"{OUT}/tmp/sfx_{k}.wav"])

FILL = (f"split[a][b];[a]scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},"
        f"boxblur=30:3,eq=brightness=-0.12:saturation=1.2[bg];[b]scale=-2:{H}[fg];[bg][fg]overlay=(W-w)/2:0,setsar=1")

def clip(n, code, ss, dur, caps, own=-16, hold=0.0, crop_bottom=0):
    """Vertical clip on blurred fill. own = loudness of the clip's own audio (None = muted).
    hold = seconds to freeze on the last frame (to fit narration)."""
    src_len = dur - hold
    tp = f",tpad=stop_mode=clone:stop_duration={hold}" if hold else ""
    cb = f"crop=iw:ih-{crop_bottom}:0:0," if crop_bottom else ""
    vf = (f"[0:v]fps={FPS},{cb}{FILL}{tp}" + "".join("," + x for x in caps_vf(n, caps)) +
          f",fade=in:st=0:d=0.25,fade=out:st={dur-0.25}:d=0.25[v]")
    lvl = "volume=0" if own is None else f"loudnorm=I={own}:TP=-2"
    af = (f"[0:a]asetpts=N/SR/TB,{lvl},aresample=48000,aformat=channel_layouts=stereo,"
          f"afade=in:d=0.2,afade=out:st={src_len-0.3}:d=0.3,apad=whole_dur={dur}[a]")
    run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-ss", str(ss), "-t", str(src_len), "-i", codes[code],
         "-filter_complex", vf + ";" + af, "-map", "[v]", "-map", "[a]", "-t", str(dur), *ENC, f"{OUT}/scenes/{n}.mp4"])

def still(n, img, dur, caps, crop=None, yfrac=0.55, push=0.07, freeze_clip=None):
    frames = int(dur * FPS)
    if freeze_clip:
        code, at = freeze_clip; img = f"{OUT}/tmp/{n}.png"
        run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-ss", str(at), "-i", codes[code], "-frames:v", "1", img])
        pre = f"[0:v]{FILL},scale=2880:1620"
    else:
        c = crop or f"iw:trunc(iw*9/16/2)*2:0:(ih-iw*9/16)*{yfrac}"
        pre = f"[0:v]crop={c},scale=2880:1620"
    vf = (pre + f",zoompan=z='1+{push}*on/{frames}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={frames}:s={W}x{H}:fps={FPS}"
          + ",setsar=1" + "".join("," + x for x in caps_vf(n, caps)) + f",fade=in:st=0:d=0.3,fade=out:st={dur-0.3}:d=0.3[v]")
    run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-loop", "1", "-t", str(dur), "-i", img,
         "-f", "lavfi", "-t", str(dur), "-i", "anullsrc=r=48000:cl=stereo",
         "-filter_complex", vf, "-map", "[v]", "-map", "1:a", "-t", str(dur), *ENC, f"{OUT}/scenes/{n}.mp4"])

def card(n, dur, lines, bg_code, bg_ss, theme_ss, logo_y=130, bg_img=None):
    p = f"{OUT}/tmp/{n}.txt"; open(p, "w").write(lines)
    if bg_img:
        bg_in = ["-loop", "1", "-t", str(dur), "-i", bg_img]
        bgf = f"[0:v]crop=iw:trunc(iw*9/16/2)*2:0:(ih-iw*9/16)*0.5,scale={W}:{H},boxblur=10:1,eq=brightness=-0.08,setsar=1,fps={FPS}[bg]"
    else:
        bg_in = ["-ss", str(bg_ss), "-t", str(dur), "-i", codes[bg_code]]
        bgf = f"[0:v]scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},boxblur=18:2,setsar=1,fps={FPS}[bg]"
    vf = (bgf + f";[1:v]format=rgba,scale=1100:-1[lg];[bg][lg]overlay=(W-w)/2:{logo_y},"
          f"drawtext=fontfile={FONT}:textfile={p}:fontsize=64:fontcolor=white:borderw=6:bordercolor=0x14246b:"
          f"line_spacing=18:text_align=center:x=(w-text_w)/2:y=h-text_h-100,"
          f"fade=in:st=0:d=0.5,fade=out:st={dur-0.7}:d=0.7[v]")
    af = (f"[2:a]atrim={theme_ss}:{theme_ss+dur},asetpts=N/SR/TB,loudnorm=I=-17:TP=-2,aresample=48000,"
          f"afade=in:d=0.6,afade=out:st={dur-1.5}:d=1.5[a]")
    run(["ffmpeg", "-nostdin", "-v", "error", "-y", *bg_in, "-loop", "1", "-t", str(dur), "-i", LOGO, "-i", THEME,
         "-filter_complex", vf + ";" + af, "-map", "[v]", "-map", "[a]", "-t", str(dur), *ENC, f"{OUT}/scenes/{n}.mp4"])

# extra voice/SFX items, placed relative to a scene's start (may run into the next scene)
def N(name, at): return ("file", f"{NARR}/{name}.mp3", 0, None, at, "voice")
def A(code, a, b, at): return ("file", codes[code], a, b, at, "voice")
def X(name, at, vol=1.0): return ("file", f"{OUT}/tmp/sfx_{name}.wav", 0, None, at, f"sfx:{vol}")

def intro16(n, code, ss, dur, lines):
    """Native 16:9 theme video (Theme With Logo) with the episode title over it."""
    p = f"{OUT}/tmp/{n}.txt"; open(p, "w").write(lines)
    vf = (f"[0:v]scale={W}:{H},setsar=1,fps={FPS},drawtext=fontfile={FONT}:textfile={p}:fontsize=66:fontcolor=white:"
          f"borderw=6:bordercolor=0x14246b:line_spacing=16:text_align=center:x=(w-text_w)/2:y=h-text_h-90:"
          f"alpha='if(lt(t,2.0),0,min(1,(t-2.0)/0.5))',fade=in:st=0:d=0.5,fade=out:st={dur-0.6}:d=0.6[v]")
    af = f"[0:a]asetpts=N/SR/TB,loudnorm=I=-17:TP=-2,aresample=48000,afade=in:d=0.3,afade=out:st={dur-1.2}:d=1.2[a]"
    run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-ss", str(ss), "-t", str(dur), "-i", codes[code],
         "-filter_complex", vf + ";" + af, "-map", "[v]", "-map", "[a]", "-t", str(dur), *ENC, f"{OUT}/scenes/{n}.mp4"])

SC = []
def add(n, d, caps, extra=()): SC.append((n, d, caps, list(extra)))
def C(n, code, caps, ss=0, dur=8, **kw): clip(n, code, ss, dur, caps, **kw); add(n, dur, caps)

C("01_hook", "C65", [(0.4, 7.6, "“To achieve your dreams, you must believe in yourself.”")])
intro16("02_intro", "TL", 0, 10, "Episode 4\nSquish Man and the Courage Star"); add("02_intro", 10, [])
C("03_courage", "C53", [(0.3, 7.7, "Squish Man knew he needed courage. He had to keep dreaming big dreams.")])
C("04_stars", "C51", [(0.3, 3.4, "Squish Man looked up at the stars."), (5.4, 7.7, "Pudy smiled with support.")])
C("05_ready", "C56", [(0.3, 7.7, "As Squish Man learned, dreams take courage. Luckily, he had Pudy by his side. Together, they were ready.")])
C("06_impossible", "C54", [(0.3, 7.7, "To find his big dream, Squish Man had to believe in the impossible.")], crop_bottom=90)
C("07_star", "C58", [], ss=3, dur=5, own=None)
c = [(0.3, 3.2, "Let's make a wish on the star!"), (3.4, 6.6, "Close your eyes… one, two, three!")]
still("08_wish", None, 7, c, freeze_clip=("C58", 5.2), push=0.06); add("08_wish", 7, c, [X("chime", 6.0, 0.8)])
C("09_follow", "C88", [(0.4, 4.0, "“Follow your dreams.”")])
C("10_fear", "C70", [(0.3, 7.7, "Squish Man was frozen with fear on the Rainbow Bridge, but with a gentle glow from Dreamstar, he found his courage.")])
C("11_edge", "C73", [(0.3, 7.7, "He stood at the edge of the Rainbow Bridge. The golden clouds began to part, revealing a world beyond his wildest dreams.")])
C("12_rainbow", "C72", [], dur=6, own=-28)
C("13_friends", "C89", [(0.4, 3.9, "Then, from high above, two familiar friends appeared."), (4.1, 7.7, "At last, the friends were reunited.")])
C("14_path", "C78", [], dur=6, own=-28)
C("15_castle", "C81", [], dur=6, own=-28)
C("16_fountain", "C83", [(0.3, 7.7, "The fountain reveals Squish Man's greatest dream: a dream of courage and kindness that lights up his whole world.")])
C("17_brave", "C59", [(0.3, 7.7, "Squish Man knew he had to be brave. Together, they found the strength to keep going.")])
C("18_together", "C60", [(0.3, 7.7, "Together, they could face any big dream adventure.")])
C("19_closer", "C50", [(0.4, 4.6, "“We are now one step closer to the dream.”")])
C("20_possible", "C63", [(0.3, 7.7, "Squish Man knew his big dream was closer than ever. With Pudy by his side, anything was possible.")])
C("21_believe", "C57", [(0.3, 7.7, "If you just believe in yourself, big dreams really do come true.")], crop_bottom=90)
c = [(0.3, 5.6, "Little paws can chase BIG dreams! Believe in yourself!")]
still("22_lesson", None, 6, c, freeze_clip=("C57", 7.5), push=0.05); add("22_lesson", 6, c, [X("chime", 0.2, 0.7)])
C("23_outro_meet", "C37", [(0.3, 4.8, "Discover the magic of Maple Hollow! Meet Squish Man, the tiny hero with a big heart!")], dur=5.0)
C("24_outro_books", "C44", [(0.3, 7.7, "Discover five amazing adventures! Join Squish Man and his friends for stories filled with kindness and Maple Hollow fun!")])
card("25_end", 9, "Want more Squish Man adventures?\nAsk a grown-up to visit SquishMan.com!", None, 0, 38.0, logo_y=110,
     bg_img=f"{SP}/Spread_24_Adventure_Awaits.png")
add("25_end", 9, [(0.0, 9.0, "Want more Squish Man adventures? Ask a grown-up to visit SquishMan.com!")])

# ---- assemble ----
lst = f"{OUT}/tmp/list.txt"
open(lst, "w").write("".join(f"file '{OUT}/scenes/{n}.mp4'\n" for n, *_ in SC))
dry = f"{OUT}/tmp/dry.mp4"
run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", dry])
total = sum(d for _, d, *_ in SC)
items, t = [], 0.0
for n, d, caps, extra in SC:
    for it in extra: items.append((it, t))
    t += d
args, parts = [], []
for k, ((_, src, a, b, at, kind), t0) in enumerate(items):
    if b is not None: args += ["-ss", str(a), "-t", str(b - a)]
    args += ["-i", src]
    lvl = "loudnorm=I=-16:TP=-2," if kind == "voice" else f"volume={kind.split(':')[1]},"
    ms = int((t0 + at) * 1000)
    # lead each sound with real silence: adelay after loudnorm loses its offset (ffmpeg 6.1), which shifted every
    # sound earlier by the first sound's delay
    parts.append(f"[{k}:a]aresample=48000,aformat=channel_layouts=stereo,{lvl}aresample=48000,"
                 f"aformat=sample_rates=48000:channel_layouts=stereo,afade=in:d=0.04[x{k}];"
                 f"anullsrc=r=48000:cl=stereo:d={max(ms, 1) / 1000:.3f}[s{k}];[s{k}][x{k}]concat=n=2:v=0:a=1[i{k}]")
voice = f"{OUT}/Audio_E04_extra_voices_fx.wav"
run(["ffmpeg", "-nostdin", "-v", "error", "-y", *args, "-filter_complex",
     ";".join(parts) + ";" + "".join(f"[i{k}]" for k in range(len(items))) +
     f"amix=inputs={len(items)}:normalize=0,apad=whole_dur={total},atrim=0:{total}[v]", "-map", "[v]", voice])
bed_src = [codes[c] for c in ("C72", "C78", "C81", "C12", "C17")]
bargs = sum((["-i", p] for p in bed_src), [])
prev, steps = "[0:a]", []
for i in range(1, len(bed_src)):
    lab = f"[x{i}]" if i < len(bed_src) - 1 else ""
    steps.append(f"{prev}[{i}:a]acrossfade=d=1.5{lab}"); prev = lab
bedloop = f"{OUT}/tmp/bedloop.wav"
run(["ffmpeg", "-nostdin", "-v", "error", "-y", *bargs, "-filter_complex", ";".join(steps), "-ar", "48000", "-ac", "2", bedloop])
t_open = SC[0][1] + SC[1][1]; t_end = total - SC[-1][1] - 16
bed = f"{OUT}/Audio_E04_music_bed.wav"
run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-stream_loop", "-1", "-i", bedloop, "-t", str(total), "-filter_complex",
     f"[0:a]loudnorm=I=-30:TP=-9,aresample=48000,volume='if(lt(t,{t_open})+gt(t,{t_end}),0,1)':eval=frame[a]", "-map", "[a]", bed])
final = f"{OUT}/SquishMan_E04_Squish_Man_and_the_Courage_Star_1080p.mp4"
run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-i", dry, "-i", bed, "-i", voice, "-filter_complex",
     "[0:a]asplit[sc][sk];[2:a]asplit[vk][vm];[sk][vk]amix=inputs=2:normalize=0[key];"
     "[1:a][key]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=400[duck];"
     "[sc][duck][vm]amix=inputs=3:normalize=0,loudnorm=I=-16:LRA=11:TP=-1.5,aresample=48000[a]",
     "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", final])
def ts(x): return f"{int(x//3600):02d}:{int(x%3600//60):02d}:{int(x%60):02d},{int(round(x%1*1000)):03d}"
t, k, srt = 0.0, 1, []
for n, d, caps, _ in SC:
    for a, b, text in caps:
        srt.append(f"{k}\n{ts(t+a)} --> {ts(t+b)}\n{text}\n"); k += 1
    t += d
open(f"{OUT}/SquishMan_E04.en.srt", "w").write("\n".join(srt))
print(final, total)
