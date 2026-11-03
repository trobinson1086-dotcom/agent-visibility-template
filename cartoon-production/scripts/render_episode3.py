#!/usr/bin/env python3
"""Episode 3 — Squish Man and Pudy to the Rescue (clips only). Engine copied from the Episode 1 build, following the Google Flow clips' own storyline (owner-approved
3 Nov 2026): Squish Man and Pudy at the Puppy Parade, Pudy goes missing, Squish Man follows the paw
prints, Mrs. Whiskers helps, and the friends are reunited.

Voices: the clips' own dialogue, two narration lines from the owner's CapCut edit (lv_0), and the
ElevenLabs "Clara" narration lines already generated. Gaps use the owner's Book 1 spread art.
"""
import subprocess, os, sys, textwrap

S = os.environ.get("SQUISH_SCRATCH") or sys.exit("set SQUISH_SCRATCH")
RAW, SP, NARR, OUT = f"{S}/raw", f"{S}/spreads", f"{S}/narr", f"{S}/ep3"
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

c = [(0.6, 7.6, "“Look! That little puppy seems lost.”")]
clip("01_hook", "C06", 0, 8, c); add("01_hook", 8, c)
intro16("02_intro", "TL", 0, 10, "Episode 3\nSquish Man and Pudy to the Rescue"); add("02_intro", 10, [])
c = [(5.0, 7.7, "“We stick together, okay?”")]
clip("03_parade", "C03", 0, 8, c); add("03_parade", 8, c)
clip("04_worried", "C15", 0, 8, [], own=-28); add("04_worried", 8, [])
c = [(0.6, 3.0, "“Pudy, that little puppy seems lost.”"), (4.0, 7.7, "“We have to help.”")]
clip("05_help", "C07", 0, 8, c); add("05_help", 8, c)
clip("06_square", "W1", 3.3, 6.7, [], own=-28); add("06_square", 6.7, [])
clip("07_street", "W2", 2.6, 7.4, [], own=-28); add("07_street", 7.4, [])
clip("08_prints", "W3", 3.5, 6.5, [], own=None); add("08_prints", 6.5, [])
c = [(0.3, 3.0, "Can you find the paw prints?"), (3.2, 5.7, "Point to them! Great job!")]
still("09_find", None, 6, c, freeze_clip=("W3", 6.0), push=0.05); add("09_find", 6, c, [X("chime", 3.1, 0.8)])
clip("10_fence", "W4", 3.5, 6.5, [], own=-28); add("10_fence", 6.5, [])
clip("11_gate", "W5", 2.6, 7.4, [], own=-28); add("11_gate", 7.4, [])
c = [(0.6, 3.2, "“Squish, look! The paw prints lead this way!”"), (3.3, 5.6, "“Come on, we're getting closer!”"),
     (5.7, 8.7, "“I'm right with you, Squish Man! Let's find those puppies!”")]
clip("12_closer", "W6", 1.2, 8.8, c); add("12_closer", 8.8, c)
clip("13_trail", "C18", 0, 7, [], own=-28); add("13_trail", 7, [])
clip("14_trail2", "C21", 2, 6, [], own=-28); add("14_trail2", 6, [])
c = [(3.0, 4.6, "“You never gave up on me.”"), (5.9, 7.9, "“Thank you, Squish Man.”")]
clip("15_found", "C33", 0, 8, c); add("15_found", 8, c)
clip("16_together", "C34", 2, 6, [], own=None); add("16_together", 6, [])
c = [(0.3, 5.6, "When friends help together, no one gets left behind!")]
still("17_lesson", None, 6, c, freeze_clip=("C34", 7.5), push=0.05); add("17_lesson", 6, c, [X("chime", 0.2, 0.7)])
c = [(0.3, 7.7, "The adventure doesn't have to end here. There are even more adventures waiting for you in The Amazing Adventures of Squish Man!")]
clip("18_outro_books", "C43", 0, 8, c); add("18_outro_books", 8, c)
c = [(0.3, 7.7, "There's even more waiting for your family at SquishMan.com: English and Spanish adventures!")]
clip("19_outro_site", "C42", 0, 8, c); add("19_outro_site", 8, c)
card("20_end", 9, "Want more Squish Man adventures?\nAsk a grown-up to visit SquishMan.com!", None, 0, 38.0, logo_y=110,
     bg_img=f"{SP}/Spread_24_Adventure_Awaits.png")
add("20_end", 9, [(0.0, 9.0, "Want more Squish Man adventures? Ask a grown-up to visit SquishMan.com!")])

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
voice = f"{OUT}/Audio_E03_extra_voices_fx.wav"
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
t_open = SC[0][1] + SC[1][1]; t_end = total - SC[-1][1] - 16
bed = f"{OUT}/Audio_E03_music_bed.wav"
run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-stream_loop", "-1", "-i", bedloop, "-t", str(total), "-filter_complex",
     f"[0:a]loudnorm=I=-30:TP=-9,aresample=48000,volume='if(lt(t,{t_open})+gt(t,{t_end}),0,1)':eval=frame[a]", "-map", "[a]", bed])
final = f"{OUT}/SquishMan_E03_Squish_Man_and_Pudy_to_the_Rescue_1080p.mp4"
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
open(f"{OUT}/SquishMan_E03.en.srt", "w").write("\n".join(srt))
print(final, total)
