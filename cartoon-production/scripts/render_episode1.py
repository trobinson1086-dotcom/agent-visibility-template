#!/usr/bin/env python3
"""Episode 1 — The Missing Puppy Parade: full cut (1920x1080, 24 fps).

Pictures: owner's Flow clips (9:16, centred on a blurred fill) + owner's Book 1
spread illustrations (16:9 crop with a slow storybook camera move).
Sound: clip audio, synthesized SFX (bell, pop, chime), theme song on the open and
end cards and as a low music bed. Narration slots are timed to the captions so a
voice track can be dropped in later (see NARRATION.md output).

Outputs in <scratch>/ep1/: episode MP4, numbered scene MP4s, SRT, stems (music,
fx+clip ambience), scene list.
"""
import subprocess, os, sys, textwrap, json

S = os.environ.get("SQUISH_SCRATCH") or sys.exit("set SQUISH_SCRATCH")
RAW, SP, OUT = f"{S}/raw", f"{S}/spreads", f"{S}/ep1"
FONT, LOGO = f"{S}/assets/Fredoka.ttf", f"{S}/assets/logo_alpha.png"
os.makedirs(f"{OUT}/scenes", exist_ok=True); os.makedirs(f"{OUT}/tmp", exist_ok=True)
codes, THEME = {}, None
for l in open(f"{S}/codes.tsv"):
    c, i, n = l.rstrip("\n").split("\t"); codes[c] = f"{RAW}/{i}.mp4"
    if "Theme" in n: THEME = codes[c]
W, H, FPS = 1920, 1080, 24
ENC = ["-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
       "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2"]

def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode: sys.exit(" ".join(cmd)[:400] + "\n" + r.stderr[-2500:])

def caps_vf(tag, caps, size=52):
    f = []
    for k, (t0, t1, text) in enumerate(caps):
        p = f"{OUT}/tmp/{tag}_{k}.txt"; open(p, "w").write("\n".join(textwrap.wrap(text, 44)))
        a = f"if(lt(t,{t0}+0.25),(t-{t0})/0.25,if(gt(t,{t1}-0.25),({t1}-t)/0.25,1))"
        f.append(f"drawtext=fontfile={FONT}:textfile={p}:fontsize={size}:fontcolor=white:borderw=5:"
                 f"bordercolor=0x14246b:line_spacing=10:text_align=center:box=1:boxcolor=0x0b1640@0.55:"
                 f"boxborderw=24:x=(w-text_w)/2:y=h-text_h-64:alpha='{a}':enable='between(t,{t0},{t1})'")
    return f

# ---- synthesized sound effects (generated here; no third-party audio) ----
SFX = {
    "bell": ("0.35*sin(2*PI*1318*t)*exp(-4*mod(t,0.62))+0.28*sin(2*PI*659*t)*exp(-3*mod(t,0.62))", 2.0),
    "pop": ("0.9*sin(2*PI*(260-2600*t)*t)*exp(-22*t)", 0.35),
    "chime": ("0.3*sin(2*PI*1568*t)*exp(-5*t)+0.3*sin(2*PI*2093*t)*exp(-5*(t-0.18))*gte(t,0.18)", 1.2),
}
for k, (e, d) in SFX.items():
    run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-f", "lavfi", "-i", f"aevalsrc='{e}':s=48000:d={d}",
         "-af", "aformat=channel_layouts=stereo", f"{OUT}/tmp/sfx_{k}.wav"])

def sfx_inputs(sfx):
    args, mix = [], []
    for j, (name, at) in enumerate(sfx):
        args += ["-i", f"{OUT}/tmp/sfx_{name}.wav"]
        mix.append((j, at))
    return args, mix

def finish_audio(base_label, sfx_mix, first_idx, dur):
    """Mix scene base audio with SFX placed at given times."""
    if not sfx_mix:
        return f"[{base_label}]atrim=0:{dur},apad=whole_dur={dur}[a]"
    parts, labels = [], [f"[{base_label}]"]
    for j, at in sfx_mix:
        parts.append(f"[{first_idx+j}:a]adelay={int(at*1000)}|{int(at*1000)}[s{j}]"); labels.append(f"[s{j}]")
    return ";".join(parts) + f";{''.join(labels)}amix=inputs={len(labels)}:normalize=0,atrim=0:{dur},apad=whole_dur={dur}[a]"

def clip(n, code, ss, dur, caps=(), sfx=()):
    vf = (f"[0:v]split[a][b];[a]scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},"
          f"boxblur=30:3,eq=brightness=-0.12:saturation=1.2[bg];[b]scale=-2:{H}[fg];"
          f"[bg][fg]overlay=(W-w)/2:0,setsar=1,fps={FPS}" + "".join("," + x for x in caps_vf(n, caps)) +
          f",fade=in:st=0:d=0.25,fade=out:st={dur-0.25}:d=0.25[v]")
    sa, mix = sfx_inputs(sfx)
    af = (f"[0:a]asetpts=N/SR/TB,loudnorm=I=-24:TP=-3,aresample=48000,aformat=channel_layouts=stereo,"
          f"afade=in:d=0.25,afade=out:st={dur-0.25}:d=0.25[base];" + finish_audio("base", mix, 1, dur))
    run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-ss", str(ss), "-t", str(dur), "-i", codes[code], *sa,
         "-filter_complex", vf + ";" + af, "-map", "[v]", "-map", "[a]", "-t", str(dur), *ENC, f"{OUT}/scenes/{n}.mp4"])

def still(n, img, dur, caps=(), sfx=(), crop=None, yfrac=0.55, push=0.07, freeze_clip=None):
    """Storybook camera move on one of the owner's illustrations (or a frozen clip frame)."""
    src = f"{SP}/{img}" if img else None
    if freeze_clip:
        code, at = freeze_clip; src = f"{OUT}/tmp/{n}.png"
        run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-ss", str(at), "-i", codes[code], "-frames:v", "1", src])
    frames = int(dur * FPS)
    c = crop or f"iw:trunc(iw*9/16/2)*2:0:(ih-iw*9/16)*{yfrac}"
    if freeze_clip:  # vertical frame: blurred fill like the clips
        pre = (f"[0:v]split[a][b];[a]scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},boxblur=30:3,"
               f"eq=brightness=-0.12[bg];[b]scale=-2:{H}[fg];[bg][fg]overlay=(W-w)/2:0,scale=2880:1620")
    else:
        pre = f"[0:v]crop={c},scale=2880:1620"
    zp = (f",zoompan=z='1+{push}*on/{frames}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={frames}:s={W}x{H}:fps={FPS}")
    vf = pre + zp + ",setsar=1" + "".join("," + x for x in caps_vf(n, caps)) + \
         f",fade=in:st=0:d=0.3,fade=out:st={dur-0.3}:d=0.3[v]"
    sa, mix = sfx_inputs(sfx)
    # inputs: 0 image, 1 silence, 2.. sfx
    af =f"[1:a]anull[base];" + finish_audio("base", mix, 2, dur)
    run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-loop", "1", "-t", str(dur), "-i", src,
         "-f", "lavfi", "-t", str(dur), "-i", "anullsrc=r=48000:cl=stereo", *sa,
         "-filter_complex", vf + ";" + af, "-map", "[v]", "-map", "[a]", "-t", str(dur), *ENC, f"{OUT}/scenes/{n}.mp4"])

def card(n, dur, lines, bg_img=None, bg_clip=None, theme_ss=0.0, logo_y=130):
    p = f"{OUT}/tmp/{n}.txt"; open(p, "w").write(lines)
    if bg_clip:
        code, ss = bg_clip; bg_in = ["-ss", str(ss), "-t", str(dur), "-i", codes[code]]
        bgf = f"[0:v]scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},boxblur=18:2,setsar=1,fps={FPS}[bg]"
    else:
        bg_in = ["-loop", "1", "-t", str(dur), "-i", f"{SP}/{bg_img}"]
        bgf = f"[0:v]crop=iw:trunc(iw*9/16/2)*2:0:(ih-iw*9/16)*0.5,scale={W}:{H},boxblur=10:1,eq=brightness=-0.08,setsar=1,fps={FPS}[bg]"
    vf = (bgf + f";[1:v]format=rgba,scale=1100:-1[lg];[bg][lg]overlay=(W-w)/2:{logo_y},"
          f"drawtext=fontfile={FONT}:textfile={p}:fontsize=64:fontcolor=white:borderw=6:bordercolor=0x14246b:"
          f"line_spacing=18:text_align=center:x=(w-text_w)/2:y=h-text_h-100,"
          f"fade=in:st=0:d=0.5,fade=out:st={dur-0.7}:d=0.7[v]")
    af = (f"[2:a]atrim={theme_ss}:{theme_ss+dur},asetpts=N/SR/TB,loudnorm=I=-18:TP=-2,aresample=48000,"
          f"afade=in:d=0.6,afade=out:st={dur-1.5}:d=1.5[a]")
    run(["ffmpeg", "-nostdin", "-v", "error", "-y", *bg_in, "-loop", "1", "-t", str(dur), "-i", LOGO, "-i", THEME,
         "-filter_complex", vf + ";" + af, "-map", "[v]", "-map", "[a]", "-t", str(dur), *ENC, f"{OUT}/scenes/{n}.mp4"])

# ---------------- Episode 1 timeline (text: Book 1 final; puppy unnamed) ----------------
SC = []  # (name, dur, caps, kind)
def add(n, d, caps=(), kind="story"): SC.append((n, d, list(caps), kind))

# Hook
c = [(0.3, 3.8, "Oh no! Where did the little puppy go?")]
clip("01_hook", "C16", 0, 4, c); add("01_hook", 4, c)
# Opening titles
card("02_title", 8, "Episode 1\nThe Missing Puppy Parade", bg_clip=("C01", 0), theme_ss=0.0, logo_y=140)
add("02_title", 8, [], "card")
c = [(0.4, 6.6, "In a cozy little town where the flowers grew tall, there lived the smallest, fluffiest hero of them all.")]
still("03_town", "Spread_01_Meet_Squish_Man.png", 7, c); add("03_town", 7, c)
c = [(0.4, 6.6, "His name was Squish Man. His fur was snow-white and soft as a cloud, and his heart was even bigger than his bark.")]
still("04_hero", "Spread_02_Hero_Portrait.png", 7, c, yfrac=0.4); add("04_hero", 7, c)
c = [(4.0, 7.8, "Every year, Maple Hollow held its biggest celebration — the Puppy Parade!")]
clip("05_parade", "C08", 0, 8, c); add("05_parade", 8, c)
c = [(0.4, 5.6, "Squish Man practiced his best trot in front of the mirror until everything was just right.")]
still("06_mirror", "Spread_04_Practicing_His_Trot.png", 6, c, yfrac=0.45); add("06_mirror", 6, c)
c = [(0.4, 6.6, "His very best friend, a tiny puppy, could hardly sit still. “This is my FIRST parade, Squish Man!”")]
still("07_friend", "Spread_05_Peanut_the_Puppy.png", 7, c); add("07_friend", 7, c)
c = [(0.6, 6.6, "But when the parade bell rang — DING! DING! DING! — the little puppy was nowhere to be found.")]
still("08_bell", "Spread_06_The_Bell_Rings.png", 7, c, sfx=[("bell", 0.5)], crop="720:404:690:40", push=0.04)
add("08_bell", 7, c)
c = [(0.3, 3.8, "“Puppy?” Squish Man called. “Where are you?”")]
clip("09_leash", "C16", 0, 4, c); add("09_leash", 4, c)
c = [(0.4, 6.6, "The other dogs began to whisper. But Squish Man didn't whisper. Squish Man decided to help.")]
still("10_decide", "Spread_07_Deciding_to_Help.png", 7, c); add("10_decide", 7, c)
c = [(0.3, 2.3, "Can you spot the clue?"), (2.7, 4.6, "Paw prints! Great job!")]
still("11_clue", None, 5, c, sfx=[("chime", 2.6)], freeze_clip=("C12", 0.4), push=0.05); add("11_clue", 5, c, "interactive")
c = [(0.3, 3.8, "“Follow the paw prints,” Squish Man told himself, “one careful step at a time.”")]
clip("12_track", "C16", 4, 4, c); add("12_track", 4, c)
clip("13_sniff", "C17", 0, 6, []); add("13_sniff", 6, [])
c = [(0.4, 5.8, "“Looking for someone, dear?” purred Mrs. Whiskers. “A puppy went that way — toward the roses.”")]
clip("14_whiskers", "C23", 2, 6, c); add("14_whiskers", 6, c)
c = [(0.3, 3.8, "Squish Man raced on, past the fountain, under the maple tree…")]
clip("15_roses", "C24", 2, 4, c); add("15_roses", 4, c)
c = [(0.3, 3.4, "Oh! A squirrel! What should Squish Man do next?"),
     (3.8, 8.6, "He remembered: his friend needed him. He shook his fluffy head and turned back to the trail.")]
still("16_squirrel", "Spread_11_Turning_Back.png", 9, c); add("16_squirrel", 9, c, "interactive")
c = [(0.4, 7.6, "The paw prints led to an old garden gate, tangled with ivy. And there — a small, scared whimper. “Squish Man? Is that you?”")]
still("17_gate", "Spread_12_The_Garden_Gate.png", 8, c); add("17_gate", 8, c)
c = [(0.4, 6.6, "The little puppy had chased a butterfly — and gotten stuck between the fence posts.")]
still("18_stuck", "Spread_13_Peanut_Is_Stuck.png", 7, c); add("18_stuck", 7, c)
c = [(0.4, 6.6, "“Don't worry,” Squish Man said gently. “I'm small too. That's my superpower.”")]
still("19_squeeze", "Spread_14.png", 7, c); add("19_squeeze", 7, c)
c = [(0.3, 3.4, "“On the count of three, we wiggle together.”"), (3.7, 7.8, "Count with me! One… two… three!")]
still("20_wiggle", "Spread_15_Wiggling_Together.png", 8, c); add("20_wiggle", 8, c, "interactive")
c = [(0.4, 5.6, "With one big squish and a POP, the little puppy popped free!")]
still("21_pop", "Spread_16_Popped_Free.png", 6, c, sfx=[("pop", 0.2)], push=0.10); add("21_pop", 6, c)
c = [(0.4, 6.6, "“You found me,” the puppy whispered. “I wasn't going anywhere without my friend,” said Squish Man.")]
still("22_reunion", "Spread_17_Tender_Reunion.png", 7, c, yfrac=0.45); add("22_reunion", 7, c)
c = [(0.4, 6.6, "They raced back through the park, past Mrs. Whiskers, who winked — just as the parade music began.")]
still("23_race", "Spread_18_Racing_Back.png", 7, c); add("23_race", 7, c)
c = [(0.4, 5.6, "The whole town cheered! “Squish Man saved him!”")]
still("24_cheer", "Spread_19_The_Whole_Town_Cheers.png", 6, c); add("24_cheer", 6, c)
c = [(0.4, 7.6, "“I just did what a friend does,” Squish Man said softly. But everyone knew — that was exactly what made him a hero.")]
still("25_modest", "Spread_20_Modest_Hero.png", 8, c); add("25_modest", 8, c)
c = [(0.4, 6.6, "As the parade marched on, Squish Man felt his heart grow three sizes bigger.")]
still("26_finale", "Spread_21_Parade_Finale.png", 7, c); add("26_finale", 7, c)
c = [(0.4, 7.6, "That night, Squish Man smiled. He hadn't been the biggest dog at the parade. But he had the biggest heart.")]
still("27_bed", "Spread_22_Bedtime.png", 8, c); add("27_bed", 8, c)
c = [(0.4, 7.6, "You don't have to be big to do something big — you just have to have the courage to help.")]
still("28_lesson", "Spread_23_Closing_Dream_Image.png", 8, c, yfrac=0.6); add("28_lesson", 8, c)
card("29_end", 9, "Want more Squish Man adventures?\nAsk a grown-up to visit SquishMan.com!",
     bg_img="Spread_24_Adventure_Awaits.png", theme_ss=38.0, logo_y=110)
add("29_end", 9, [(0.0, 9.0, "Want more Squish Man adventures? Ask a grown-up to visit SquishMan.com!")], "card")

# ---------------- assemble ----------------
lst = f"{OUT}/tmp/list.txt"
open(lst, "w").write("".join(f"file '{OUT}/scenes/{n}.mp4'\n" for n, *_ in SC))
dry = f"{OUT}/tmp/dry.mp4"
run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", dry])
total = sum(d for _, d, *_ in SC)
# music bed: theme song looped, low, silent under the two cards (they already carry the theme)
t_title_end = SC[0][1] + SC[1][1]; t_end_start = total - SC[-1][1]
bed = f"{OUT}/Audio_E01_music_bed.wav"
run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-stream_loop", "-1", "-i", THEME, "-t", str(total), "-filter_complex",
     f"[0:a]loudnorm=I=-27:TP=-8,aresample=48000,"
     f"volume='if(lt(t,{t_title_end})+gt(t,{t_end_start}),0,1)':eval=frame,afade=in:st={t_title_end}:d=2[a]",
     "-map", "[a]", bed])
fx = f"{OUT}/Audio_E01_fx_and_clip_sound.wav"
run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-i", dry, "-vn", "-ar", "48000", fx])
final = f"{OUT}/SquishMan_E01_The_Missing_Puppy_Parade_1080p.mp4"
run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-i", dry, "-i", bed, "-filter_complex",
     "[0:a][1:a]amix=inputs=2:normalize=0,loudnorm=I=-16:LRA=11:TP=-1.5,aresample=48000[a]", "-map", "0:v", "-map", "[a]",
     "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", final])

def ts(t): return f"{int(t//3600):02d}:{int(t%3600//60):02d}:{int(t%60):02d},{int(round(t%1*1000)):03d}"
t, k, srt, rows = 0.0, 1, [], []
for n, d, caps, kind in SC:
    rows.append({"scene": n, "start": round(t, 2), "duration": d, "kind": kind, "text": " / ".join(x[2] for x in caps)})
    for a, b, text in caps:
        srt.append(f"{k}\n{ts(t+a)} --> {ts(t+b)}\n{text}\n"); k += 1
    t += d
open(f"{OUT}/SquishMan_E01.en.srt", "w").write("\n".join(srt))
json.dump(rows, open(f"{OUT}/scenes.json", "w"), indent=1)
print(final, total)
