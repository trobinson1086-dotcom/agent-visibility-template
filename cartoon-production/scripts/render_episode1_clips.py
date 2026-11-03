#!/usr/bin/env python3
"""Episode 1 — The Missing Puppy Parade, following the Google Flow clips' own storyline (owner-approved
3 Nov 2026): Squish Man and Pudy at the Puppy Parade, Pudy goes missing, Squish Man follows the paw
prints, Mrs. Whiskers helps, and the friends are reunited.

Voices: the clips' own dialogue, two narration lines from the owner's CapCut edit (lv_0), and the
ElevenLabs "Clara" narration lines already generated. Gaps use the owner's Book 1 spread art.
"""
import subprocess, os, sys, textwrap

S = os.environ.get("SQUISH_SCRATCH") or sys.exit("set SQUISH_SCRATCH")
RAW, SP, NARR, OUT = f"{S}/raw", f"{S}/spreads", f"{S}/narr", f"{S}/ep1c"
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

def clip(n, code, ss, dur, caps, own=-16, hold=0.0):
    """Vertical clip on blurred fill. own = loudness of the clip's own audio (None = muted).
    hold = seconds to freeze on the last frame (to fit narration)."""
    src_len = dur - hold
    tp = f",tpad=stop_mode=clone:stop_duration={hold}" if hold else ""
    vf = (f"[0:v]fps={FPS},{FILL}{tp}" + "".join("," + x for x in caps_vf(n, caps)) +
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

SC = []
def add(n, d, caps, extra=()): SC.append((n, d, caps, list(extra)))

c = [(0.5, 3.8, "“Squish Man? Is that you?”")]
clip("01_hook", "C16", 0, 4, c, own=-30); add("01_hook", 4, c, [A("C24", 2.8, 5.5, 0.6)])
card("02_title", 8, "Episode 1\nThe Missing Puppy Parade", "C01", 0, 0.0, logo_y=140); add("02_title", 8, [])
c = [(0.4, 8.6, "In a cozy little town where the flowers grew tall, there lived the smallest, fluffiest hero of them all.")]
still("03_town", f"{SP}/Spread_01_Meet_Squish_Man.png", 9, c); add("03_town", 9, c, [N("03_town", 0.5)])
c = [(0.4, 9.6, "His name was Squish Man. His fur was snow-white and soft as a cloud, and his heart was even bigger than his bark!")]
still("04_hero", f"{SP}/Spread_02_Hero_Portrait.png", 10, c, yfrac=0.4); add("04_hero", 10, c, [N("04_hero", 0.4)])
c = [(3.4, 9.6, "Every year, Maple Hollow held its biggest celebration… the Puppy Parade! Balloons! Streamers! And a hundred wagging tails!")]
clip("05_parade", "C08", 0, 10, c, own=None, hold=2.0); add("05_parade", 10, c, [N("05_parade", 0.3)])
c = [(0.3, 9.5, "The two friends waited excitedly. Soon, the Puppy Parade would begin.")]
clip("06_friends", "LV", 72.7, 9.9, c); add("06_friends", 9.9, c)
c = [(4.9, 7.6, "“We stick together, okay?”")]
clip("07_together", "C05", 0, 8, c); add("07_together", 8, c)
clip("08_wander", "C10", 0, 8, [], own=None); add("08_wander", 8, [])
c = [(0.4, 5.6, "DING! DING! DING! The parade was about to start… but where was Pudy?")]
still("09_bell", f"{SP}/Spread_06_The_Bell_Rings.png", 6, c, crop="720:404:690:40", push=0.04)
add("09_bell", 6, c, [X("bell", 0.4, 0.5)])
c = [(0.2, 6.9, "Squish Man knew one thing for sure. His friend needed help. He began searching.")]
clip("10_search", "LV", 95.0, 7.1, c); add("10_search", 7.1, c)
c = [(0.3, 4.4, "Can you spot the clue?"), (4.6, 7.4, "Paw prints! Great job!")]
still("11_clue", None, 7.8, c, freeze_clip=("C12", 0.4), push=0.05)
add("11_clue", 7.8, c, [N("11a_clue", 0.3), X("chime", 4.4, 0.8), N("11b_clue", 4.7)])
clip("12_sniff", "C16", 4, 4, [], own=-28); add("12_sniff", 4, [])
c = [(0.6, 7.0, "“Follow the paw prints,” Squish Man told himself. “One careful step at a time.”")]
clip("13_track", "C17", 0, 8, c, own=-30); add("13_track", 8, c, [N("12_track", 0.6)])
clip("14_trail", "C22", 2, 6, [], own=-28); add("14_trail", 6, [(1.8, 6.0, "Old Mrs. Whiskers the cat was sunning herself on the fence.")], [N("14_whiskers", 1.8)])
c = [(0.0, 5.6, "“Looking for someone, dear? A puppy went that way… toward the roses.”")]
clip("15_whiskers", "C23", 2, 6, c, own=-30); add("15_whiskers", 6, c)
c = [(0.7, 3.6, "“Squish Man? Is that you?”")]
clip("16_voice", "C24", 2, 6, c); add("16_voice", 6, c)
c = [(0.2, 4.0, "“Squish Man! You found me!”"), (4.1, 7.0, "“There she is!”")]
clip("17_found", "C26", 3, 7.2, c, own=None, hold=2.2); add("17_found", 7.2, c, [A("C26", 0.0, 7.0, 0.0)])
c = [(1.9, 7.8, "“I knew you'd come for me! Best friends always find each other.”")]
clip("18_bestfriends", "C25", 0, 8, c); add("18_bestfriends", 8, c)
c = [(1.6, 6.3, "“I chased a butterfly and got lost.” / “That explains the paw prints!”")]
clip("19_butterfly", "C27", 0, 8, c); add("19_butterfly", 8, c)
c = [(1.6, 7.4, "“Thank you for finding me, Squish Man!” / “Now let's get you home.”")]
clip("20_home", "C28", 0, 8, c); add("20_home", 8, c)
c = [(0.8, 7.6, "“I'm so happy we're going home!” / “You're safe now, Pudy.”")]
clip("21_safe", "C30", 0, 8, c); add("21_safe", 8, c)
c = [(0.8, 7.6, "“Thank you for helping find me.” / “Anytime, Pudy. Stay close to your best friend.”")]
clip("22_bestfriend", "C31", 0, 8, c); add("22_bestfriend", 8, c)
c = [(0.4, 6.6, "That night, Squish Man smiled. He hadn't been the biggest dog in Maple Hollow… but he had the biggest heart.")]
still("23_bed", f"{SP}/Spread_22_Bedtime.png", 7, c); add("23_bed", 7, c)
c = [(0.4, 5.6, "You don't have to be big to do something big!")]
still("24_lesson", f"{SP}/Spread_24_Adventure_Awaits.png", 6, c); add("24_lesson", 6, c, [X("chime", 0.3, 0.7)])
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
    parts.append(f"[{k}:a]aresample=48000,aformat=channel_layouts=stereo,{lvl}afade=in:d=0.04,adelay={ms}|{ms}[i{k}]")
voice = f"{OUT}/Audio_E01_extra_voices_fx.wav"
run(["ffmpeg", "-nostdin", "-v", "error", "-y", *args, "-filter_complex",
     ";".join(parts) + ";" + "".join(f"[i{k}]" for k in range(len(items))) +
     f"amix=inputs={len(items)}:normalize=0,apad=whole_dur={total},atrim=0:{total}[v]", "-map", "[v]", voice])
bed_src = [codes[c] for c in ("C12", "C14", "C15", "C17", "C19")]
bargs = sum((["-i", p] for p in bed_src), [])
prev, steps = "[0:a]", []
for i in range(1, len(bed_src)):
    lab = f"[x{i}]" if i < len(bed_src) - 1 else ""
    steps.append(f"{prev}[{i}:a]acrossfade=d=1.5{lab}"); prev = lab
bedloop = f"{OUT}/tmp/bedloop.wav"
run(["ffmpeg", "-nostdin", "-v", "error", "-y", *bargs, "-filter_complex", ";".join(steps), "-ar", "48000", "-ac", "2", bedloop])
t_open = SC[0][1] + SC[1][1]; t_end = total - SC[-1][1]
bed = f"{OUT}/Audio_E01_music_bed.wav"
run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-stream_loop", "-1", "-i", bedloop, "-t", str(total), "-filter_complex",
     f"[0:a]loudnorm=I=-30:TP=-9,aresample=48000,volume='if(lt(t,{t_open})+gt(t,{t_end}),0,1)':eval=frame[a]", "-map", "[a]", bed])
final = f"{OUT}/SquishMan_E01_The_Missing_Puppy_Parade_1080p.mp4"
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
open(f"{OUT}/SquishMan_E01.en.srt", "w").write("\n".join(srt))
print(final, total)
