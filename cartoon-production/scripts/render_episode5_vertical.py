#!/usr/bin/env python3
"""VERTICAL 9:16 version (owner request 4 Nov 2026: no blurred side margins, just the original picture).
Same clips, order, timing, voices, music and captions as the 16:9 cut; the widescreen intro and end card are
rebuilt from the owner's vertical Maple Hollow logo clips (K25, K27) with the same theme music.

Episode 5 — The Great Maple Hollow Derby (Squish car cartoon clips only). Built with the Episode 4 engine. — Squish Man and the Courage Star (clips only). Engine copied from the Episode 1 build, following the Google Flow clips' own storyline (owner-approved
3 Nov 2026): Squish Man and Pudy at the Puppy Parade, Pudy goes missing, Squish Man follows the paw
prints, Mrs. Whiskers helps, and the friends are reunited.

Voices: the clips' own dialogue, two narration lines from the owner's CapCut edit (lv_0), and the
ElevenLabs "Clara" narration lines already generated. Gaps use the owner's Book 1 spread art.
"""
import subprocess, os, sys, textwrap

S = os.environ.get("SQUISH_SCRATCH") or sys.exit("set SQUISH_SCRATCH")
RAW, SP, NARR, OUT = f"{S}/raw", f"{S}/spreads", f"{S}/narr", f"{S}/ep5v"
LV = f"{S}/big/18HYg4fOk24DSkrahXdj3L4m05401C5tJ.mp4"   # owner's CapCut Book 1 edit
FONT, LOGO = f"{S}/assets/Fredoka.ttf", f"{S}/assets/logo_alpha.png"
for d in ("scenes", "tmp"): os.makedirs(f"{OUT}/{d}", exist_ok=True)
codes, THEME = {}, None
for l in open(f"{S}/codes.tsv"):
    c, i, n = l.rstrip("\n").split("\t"); codes[c] = f"{RAW}/{i}.mp4"
    if "Theme" in n: THEME = codes[c]
codes["LV"] = LV
# Squish car cartoon folder (Drive 1_A1DLNSwJX5eM_j3bnyNz7V1pQLnjIEh), numbered K01..K90 by upload order
for k, l in enumerate(open(f"{S}/car/list.tsv")):
    codes[f"K{k+1:02d}"] = f"{S}/car/clips/" + l.split("\t")[1]
W, H, FPS = 1080, 1920, 24
ENC = ["-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
       "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2"]

def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode: sys.exit(" ".join(cmd)[:300] + "\n" + r.stderr[-2500:])

def caps_vf(tag, caps):
    f = []
    for k, (t0, t1, text) in enumerate(caps):
        p = f"{OUT}/tmp/{tag}_{k}.txt"; open(p, "w").write("\n".join(textwrap.wrap(text, 30)))
        a = f"if(lt(t,{t0}+0.25),(t-{t0})/0.25,if(gt(t,{t1}-0.25),({t1}-t)/0.25,1))"
        f.append(f"drawtext=fontfile={FONT}:textfile={p}:fontsize=58:fontcolor=white:borderw=5:"
                 f"bordercolor=0x14246b:line_spacing=10:text_align=center:box=1:boxcolor=0x0b1640@0.55:"
                 f"boxborderw=24:x=(w-text_w)/2:y=h-text_h-200:alpha='{a}':enable='between(t,{t0},{t1})'")
    return f

SFX = {"bell": ("0.35*sin(2*PI*1318*t)*exp(-4*mod(t,0.62))+0.28*sin(2*PI*659*t)*exp(-3*mod(t,0.62))", 2.0),
       "chime": ("0.3*sin(2*PI*1568*t)*exp(-5*t)+0.3*sin(2*PI*2093*t)*exp(-5*(t-0.18))*gte(t,0.18)", 1.2)}
for k, (e, d) in SFX.items():
    run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-f", "lavfi", "-i", f"aevalsrc='{e}':s=48000:d={d}",
         "-af", "aformat=channel_layouts=stereo", f"{OUT}/tmp/sfx_{k}.wav"])

FILL = f"scale={W}:{H}:flags=lanczos,setsar=1"   # sources are 720x1280 (9:16): fills the frame, nothing added

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
        pre = f"[0:v]{FILL},scale=1620:2880"
    else:
        c = crop or f"trunc(ih*9/16/2)*2:ih:(iw-ih*9/16)/2:0"
        pre = f"[0:v]crop={c},scale=1620:2880"
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

def vcard(n, code, dur, text, aud_src, aud_ss, size=64, fade_in_at=2.0):
    """Vertical title card: the owner's vertical Maple Hollow logo clip (held on its last frame if needed),
    the theme music and the text at the bottom."""
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

SC = []
def add(n, d, caps, extra=()): SC.append((n, d, caps, list(extra)))
def C(n, code, caps, ss=0, dur=8, extra=(), **kw): clip(n, code, ss, dur, caps, **kw); add(n, dur, caps, extra)
def two(a, b=None, d=8.0):
    """Captions: one line for the whole clip, or two halves."""
    if b is None: return [(0.3, d - 0.3, a)]
    return [(0.3, d / 2 - 0.1, a), (d / 2 + 0.1, d - 0.3, b)]
def reuse(n, src, d, caps):
    """Scene already rendered for Episode 4 (same engine): the book outro and end card."""
    import shutil; shutil.copy(f"{S}/ep4/scenes/{src}.mp4", f"{OUT}/scenes/{n}.mp4"); add(n, d, caps)

# Cold open
C("01_hook", "K37", two("Pudy, look! The starting line! Maybe we'll race someday.", "We can do anything together."))
vcard("02_intro", "K25", 10, "Episode 5\nThe Great\nMaple Hollow Derby", codes["TL"], 0); add("02_intro", 10, [])
# Act 1: exploring Maple Hollow, ending at Derby Hill and the dream of racing
C("03_roses", "K28", two("Look, Pudy! Roses! They're beautiful, Squish Man!", "Beauty bloomed all around."))
C("04_hall", "K29", two("Let's see Mayor's Hall. Look at that big star!", "Maple Hollow welcomed everyone."))
C("05_bakery", "K30", two("Across the bridge, a sweet surprise awaited.", "Pudy, look! The bakery! Something smells delicious."))
C("06_home", "K32", two("Come see my home, Squish. I'd love to, Pudy!", "Home was just around the corner."))
C("07_house", "K34", two("Come on, Squish, it's right ahead. Wow, Pudy, your house!", "Welcome to my home."))
C("08_derbyhill", "K35", two("One more place, Pudy. Let's see Derby Hill.", "Another adventure was waiting."))
C("09_world", "K36", two("What a beautiful world, Pudy! And even better with friends!", "Every great adventure begins with a little kindness."))
C("10_track", "K38", two("Wow, look at that track! It's Derby Hill.", "Adventure was everywhere."))
C("11_trophy", "K39", two("Pudy, what's that? It's the Derby Trophy!", "Maybe we'll win someday."), extra=[X("chime", 3.0, 0.6)])
C("12_someday", "K40", two("Someday, I'll race. I'll cheer for you.", "Every big dream starts small."))
C("13_soon", "K41", two("One day, I'll be out there. And I'll be right beside you.", "And soon, that day would come."))
# Act 2: Derby Day
C("14_derbyday", "K42", two("Maple Hollow woke up wrapped in ribbons.", "Derby Day! Derby Day!"), extra=[X("bell", 4.0, 0.5)])
C("15_ready", "K43", two("Squish Man couldn't wait!", "Are you ready, Pudy? Ready, buddy!", 6.3), dur=6.3)
C("16_friends", "K44", two("Their friends were waiting."))
C("17_mayor", "K45", two("Mayor Thompson welcomed everyone.", "Today, just do your best. Have fun and help each other."))
C("18_places", "K46", two("Racers, take your places! The race was about to begin.", "Here we go, Pudy!"))
C("19_go", "K47", two("Ready, Pudy? Ready, set, go!", "And they're off!"))
C("20_underway", "K48", two("The Derby was underway!", "You're doing great, Pudy! You too, Squish!"))
C("21_trouble", "K50", two("But trouble waited ahead. Pudy! Look out!", "The track is blocked."))
C("22_challenge", "K49", two("The racers faced a challenge.", "We can solve this together. Let's help each other."))
C("23_push", "K08", two("Everybody, lend a paw! Together, we can do it!", "Every little push helped."))
C("24_lastpush", "K09", two("One last push! We did it, Squish!", "Together, they saved the race."))
C("25_clear", "K10", two("The track is clear! Let's finish together.", "And the Derby continued."))
C("26_finish", "K11", two("The finish line was near.", "We did it together! Best race ever!"), extra=[X("chime", 5.6, 0.7)])
C("27_awards", "K02", two("It was time for the awards. Today, everyone is a winner", "because of your teamwork. We did it together!"), extra=[X("bell", 0.2, 0.4)])
# Act 3: going home at sunset
C("28_wonderful", "K03", two("What a wonderful Derby Day!", "That was amazing, Pudy! And we did it together!"))
C("29_bestpart", "K04", two("Helping our friends was the best part.", "Because friendship makes every adventure special."))
C("30_ending", "K05", two("The wonderful Derby Day was ending.", "I'm glad we raced together. Me too, Squish Man."))
C("31_tomorrow", "K06", two("Another adventure tomorrow?", "Always, best friend."))
C("32_goodnight", "K07", two("Good night, Pudy! Good night, Squish Man!", "Every adventure is better together."))
c = [(0.3, 5.6, "Friends win together! Lend a paw and help each other.")]
still("33_lesson", None, 6, c, freeze_clip=("K02", 6.5), push=0.05); add("33_lesson", 6, c, [X("chime", 0.2, 0.7)])
# Outro: the books and the shop, then the SquishMan.com card
C("34_ended", "K24", two("And so another adventure ended.", d=6), dur=6, own=-18)
C("35_outro_meet", "C37", [(0.3, 4.8, "Discover the magic of Maple Hollow! Meet Squish Man, the tiny hero with a big heart!")], dur=5.0)
C("36_outro_books", "C44", [(0.3, 7.7, "Discover five amazing adventures! Join Squish Man and his friends for stories filled with kindness and Maple Hollow fun!")])
C("37_shop", "K90", two("Want your own Squish Man gear?", "Ask your grown-up to visit squishman.com and shop the Squish Squad Collection!"))
vcard("38_end", "K27", 9, "Want more Squish Man adventures?\nAsk a grown-up to visit\nSquishMan.com!", THEME, 38.0, size=56, fade_in_at=0.3)
add("38_end", 9, [(0.0, 9.0, "Want more Squish Man adventures? Ask a grown-up to visit SquishMan.com!")])

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
voice = f"{OUT}/Audio_E05v_extra_voices_fx.wav"
run(["ffmpeg", "-nostdin", "-v", "error", "-y", *args, "-filter_complex",
     ";".join(parts) + ";" + "".join(f"[i{k}]" for k in range(len(items))) +
     f"amix=inputs={len(items)}:normalize=0,apad=whole_dur={total},atrim=0:{total}[v]", "-map", "[v]", voice])
bed_src = [codes[c] for c in ("C72", "C78", "C81", "C12", "C17")]  # owner clips' music, as in Episode 4
bargs = sum((["-i", p] for p in bed_src), [])
prev, steps = "[0:a]", []
for i in range(1, len(bed_src)):
    lab = f"[x{i}]" if i < len(bed_src) - 1 else ""
    steps.append(f"{prev}[{i}:a]acrossfade=d=1.5{lab}"); prev = lab
bedloop = f"{OUT}/tmp/bedloop.wav"
run(["ffmpeg", "-nostdin", "-v", "error", "-y", *bargs, "-filter_complex", ";".join(steps), "-ar", "48000", "-ac", "2", bedloop])
t_open = SC[0][1] + SC[1][1]; t_end = total - SC[-1][1] - 27  # no bed under the ending, outros and shop clip (own audio)
bed = f"{OUT}/Audio_E05v_music_bed.wav"
run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-stream_loop", "-1", "-i", bedloop, "-t", str(total), "-filter_complex",
     f"[0:a]loudnorm=I=-30:TP=-9,aresample=48000,volume='if(lt(t,{t_open})+gt(t,{t_end}),0,1)':eval=frame[a]", "-map", "[a]", bed])
final = f"{OUT}/SquishMan_E05_The_Great_Maple_Hollow_Derby_VERTICAL_1080x1920.mp4"
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
open(f"{OUT}/SquishMan_E05_VERTICAL.en.srt", "w").write("\n".join(srt))
print(final, total)
