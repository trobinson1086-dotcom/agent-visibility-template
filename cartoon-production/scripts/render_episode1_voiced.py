#!/usr/bin/env python3
"""Episode 1 — voiced cut. Narration (ElevenLabs "Clara") + character dialogue cut from the
owner's Flow clips, placed on a global voice track; video scenes as in render_episode1.py.

Missing narration lines simply stay caption-only: drop a file into <scratch>/narr/<scene>.mp3
(names in NARR below) and re-run.
"""
import subprocess, os, sys, textwrap, json

S = os.environ.get("SQUISH_SCRATCH") or sys.exit("set SQUISH_SCRATCH")
RAW, SP, NARR, OUT = f"{S}/raw", f"{S}/spreads", f"{S}/narr", f"{S}/ep1v"
FONT, LOGO = f"{S}/assets/Fredoka.ttf", f"{S}/assets/logo_alpha.png"
for d in ("scenes", "tmp"): os.makedirs(f"{OUT}/{d}", exist_ok=True)
codes, THEME = {}, None
for l in open(f"{S}/codes.tsv"):
    c, i, n = l.rstrip("\n").split("\t"); codes[c] = f"{RAW}/{i}.mp4"
    if "Theme" in n: THEME = codes[c]
W, H, FPS = 1920, 1080, 24
ENC = ["-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
       "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2"]

def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode: sys.exit(" ".join(cmd)[:300] + "\n" + r.stderr[-2500:])

def dur_of(p):
    return float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", p],
                                capture_output=True, text=True).stdout)

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
       "pop": ("0.9*sin(2*PI*(260-2600*t)*t)*exp(-22*t)", 0.35),
       "chime": ("0.3*sin(2*PI*1568*t)*exp(-5*t)+0.3*sin(2*PI*2093*t)*exp(-5*(t-0.18))*gte(t,0.18)", 1.2)}
for k, (e, d) in SFX.items():
    run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-f", "lavfi", "-i", f"aevalsrc='{e}':s=48000:d={d}",
         "-af", "aformat=channel_layouts=stereo", f"{OUT}/tmp/sfx_{k}.wav"])

# ---- video scene renderers (audio = clip ambience only; voices go on the global track) ----
def clip(n, code, ss, dur, caps, gain_db=-26):
    vf = (f"[0:v]split[a][b];[a]scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},"
          f"boxblur=30:3,eq=brightness=-0.12:saturation=1.2[bg];[b]scale=-2:{H}[fg];"
          f"[bg][fg]overlay=(W-w)/2:0,setsar=1,fps={FPS}" + "".join("," + x for x in caps_vf(n, caps)) +
          f",fade=in:st=0:d=0.25,fade=out:st={dur-0.25}:d=0.25[v]")
    vol = "volume=0" if gain_db is None else f"loudnorm=I={gain_db}:TP=-6"
    af = (f"[0:a]asetpts=N/SR/TB,{vol},aresample=48000,aformat=channel_layouts=stereo,"
          f"afade=in:d=0.25,afade=out:st={dur-0.25}:d=0.25,apad=whole_dur={dur}[a]")
    run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-ss", str(ss), "-t", str(dur), "-i", codes[code],
         "-filter_complex", vf + ";" + af, "-map", "[v]", "-map", "[a]", "-t", str(dur), *ENC, f"{OUT}/scenes/{n}.mp4"])

def still(n, img, dur, caps, crop=None, yfrac=0.55, push=0.07, freeze_clip=None):
    src = f"{SP}/{img}" if img else None
    if freeze_clip:
        code, at = freeze_clip; src = f"{OUT}/tmp/{n}.png"
        run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-ss", str(at), "-i", codes[code], "-frames:v", "1", src])
        pre = (f"[0:v]split[a][b];[a]scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},boxblur=30:3,"
               f"eq=brightness=-0.12[bg];[b]scale=-2:{H}[fg];[bg][fg]overlay=(W-w)/2:0,scale=2880:1620")
    else:
        c = crop or f"iw:trunc(iw*9/16/2)*2:0:(ih-iw*9/16)*{yfrac}"
        pre = f"[0:v]crop={c},scale=2880:1620"
    frames = int(dur * FPS)
    vf = (pre + f",zoompan=z='1+{push}*on/{frames}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={frames}:s={W}x{H}:fps={FPS}"
          + ",setsar=1" + "".join("," + x for x in caps_vf(n, caps)) + f",fade=in:st=0:d=0.3,fade=out:st={dur-0.3}:d=0.3[v]")
    run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-loop", "1", "-t", str(dur), "-i", src,
         "-f", "lavfi", "-t", str(dur), "-i", "anullsrc=r=48000:cl=stereo",
         "-filter_complex", vf, "-map", "[v]", "-map", "1:a", "-t", str(dur), *ENC, f"{OUT}/scenes/{n}.mp4"])

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
    af = (f"[2:a]atrim={theme_ss}:{theme_ss+dur},asetpts=N/SR/TB,loudnorm=I=-17:TP=-2,aresample=48000,"
          f"afade=in:d=0.6,afade=out:st={dur-1.5}:d=1.5[a]")
    run(["ffmpeg", "-nostdin", "-v", "error", "-y", *bg_in, "-loop", "1", "-t", str(dur), "-i", LOGO, "-i", THEME,
         "-filter_complex", vf + ";" + af, "-map", "[v]", "-map", "[a]", "-t", str(dur), *ENC, f"{OUT}/scenes/{n}.mp4"])

# ---- voice items: ("narr", file) or ("clip", code, start, end) placed at scene-relative time ----
def V_narr(name, at): return ("narr", f"{NARR}/{name}.mp3", at)
def V_clip(code, a, b, at): return ("clip", code, a, b, at)
def V_sfx(name, at, vol=1.0): return ("sfx", name, at, vol)

SC = []  # (name, dur, caps, voices)
def add(n, d, caps, voices=()): SC.append((n, d, caps, [v for v in voices if v[0] != "narr" or os.path.exists(v[1])]))

c = [(0.2, 3.9, "Oh no! Where did the little puppy go?")]
clip("01_hook", "C16", 0, 4, c); add("01_hook", 4, c, [V_narr("01_hook", 0.2)])
card("02_title", 8, "Episode 1\nThe Missing Puppy Parade", bg_clip=("C01", 0), theme_ss=0.0, logo_y=140)
add("02_title", 8, [])
c = [(0.4, 8.6, "In a cozy little town where the flowers grew tall, there lived the smallest, fluffiest hero of them all.")]
still("03_town", "Spread_01_Meet_Squish_Man.png", 9, c); add("03_town", 9, c, [V_narr("03_town", 0.5)])
c = [(0.4, 9.6, "His name was Squish Man. His fur was snow-white and soft as a cloud, and his heart was even bigger than his bark!")]
still("04_hero", "Spread_02_Hero_Portrait.png", 10, c, yfrac=0.4); add("04_hero", 10, c, [V_narr("04_hero", 0.4)])
c = [(3.2, 7.8, "Every year, Maple Hollow held its biggest celebration… the Puppy Parade! Balloons! Streamers! And a hundred wagging tails!")]
clip("05_parade", "C08", 0, 8, c, gain_db=None); add("05_parade", 8, c, [V_narr("05_parade", 0.3)])
c = [(1.9, 5.6, "Squish Man practiced his best trot in front of the mirror until everything was just right.")]
still("06_mirror", "Spread_04_Practicing_His_Trot.png", 6, c, yfrac=0.45); add("06_mirror", 6, c)
c = [(0.4, 3.3, "His very best friend, a tiny puppy, could hardly sit still. “This is my FIRST parade!”"), (3.5, 6.2, "“We stick together, okay?”")]
still("07_friend", "Spread_05_Peanut_the_Puppy.png", 6.5, c); add("07_friend", 6.5, c, [V_clip("C03", 5.0, 7.2, 3.5)])
c = [(0.4, 7.1, "But when the parade bell rang… DING! DING! DING! …the little puppy was nowhere to be found.")]
still("08_bell", "Spread_06_The_Bell_Rings.png", 7.5, c, crop="720:404:690:40", push=0.04)
add("08_bell", 7.5, c, [V_narr("08_bell", 0.4), V_sfx("bell", 1.2, 0.35)])
c = [(0.1, 3.9, "“Puppy?” Squish Man called. “Where are you?”")]
clip("09_leash", "C16", 0, 4, c, gain_db=-30); add("09_leash", 4, c, [V_narr("09_leash", 0.1)])
c = [(0.3, 8.6, "The other dogs began to whisper. “Maybe he ran off.” But Squish Man didn't whisper. Squish Man decided to help!")]
still("10_decide", "Spread_07_Deciding_to_Help.png", 9, c); add("10_decide", 9, c, [V_narr("10_decide", 0.3)])
c = [(0.3, 4.4, "Can you spot the clue?"), (4.6, 7.4, "Paw prints! Great job!")]
still("11_clue", None, 7.8, c, freeze_clip=("C12", 0.4), push=0.05)
add("11_clue", 7.8, c, [V_narr("11a_clue", 0.3), V_sfx("chime", 4.4, 0.8), V_narr("11b_clue", 4.7)])
clip("12_sniff", "C16", 4, 4, []); add("12_sniff", 4, [])
c = [(0.6, 7.0, "“Follow the paw prints,” Squish Man told himself. “One careful step at a time.”")]
clip("13_track", "C17", 0, 8, c, gain_db=-32); add("13_track", 8, c, [V_narr("12_track", 0.6)])
c = [(0.3, 5.9, "Old Mrs. Whiskers the cat was sunning herself on the fence. “Looking for someone, dear? A puppy went that way… toward the roses.”")]
clip("14_whiskers", "C23", 2, 6, c, gain_db=-32); add("14_whiskers", 6, c, [V_narr("14_whiskers", 0.3)])
c = [(0.0, 3.7, "“…A puppy went that way… toward the roses.”")]
clip("15_roses", "C24", 2, 6, c, gain_db=None); add("15_roses", 6, c)
c = [(0.3, 4.9, "Squish Man raced on, past the fountain, under the maple tree…"),
     (5.1, 7.6, "Oh! A squirrel! What should Squish Man do next?"),
     (7.8, 11.6, "He remembered: his friend needed him! He shook his fluffy head and turned back to the trail.")]
still("16_squirrel", "Spread_11_Turning_Back.png", 12, c); add("16_squirrel", 12, c, [V_narr("15_roses", 0.3)])
c = [(0.4, 3.8, "The paw prints led to an old garden gate, tangled with ivy. And there… a small, scared whimper."),
     (4.0, 7.2, "“Squish Man? Is that you?”")]
still("17_gate", "Spread_12_The_Garden_Gate.png", 7.6, c); add("17_gate", 7.6, c, [V_clip("C24", 2.8, 5.5, 4.0)])
c = [(0.6, 3.6, "“I chased a butterfly and got lost.”"), (3.7, 6.2, "“That explains the paw prints!”")]
still("18_stuck", "Spread_13_Peanut_Is_Stuck.png", 6.6, c); add("18_stuck", 6.6, c, [V_clip("C27", 1.7, 6.3, 0.6)])
c = [(0.4, 6.6, "“Don't worry,” Squish Man said gently. “I'm small too. That's my superpower.”")]
still("19_squeeze", "Spread_14.png", 7, c); add("19_squeeze", 7, c)
c = [(0.3, 3.2, "“On the count of three, we wiggle together.”"), (3.3, 7.7, "Count with me! One… two… three!")]
still("20_wiggle", "Spread_15_Wiggling_Together.png", 8.2, c); add("20_wiggle", 8.2, c, [V_narr("20_wiggle", 0.3)])
c = [(0.3, 4.6, "With one big squish and a POP, the little puppy popped free!")]
still("21_pop", "Spread_16_Popped_Free.png", 5, c, push=0.10); add("21_pop", 5, c, [V_sfx("pop", 0.2)])
c = [(0.5, 2.6, "“I knew you'd come for me!”"), (2.8, 6.6, "“Best friends always find each other.”")]
still("22_reunion", "Spread_17_Tender_Reunion.png", 7, c, yfrac=0.45); add("22_reunion", 7, c, [V_clip("C25", 2.0, 7.8, 0.5)])
c = [(0.5, 3.0, "“Thank you for finding me, Squish Man!”"), (3.1, 6.6, "“Now let's get you home.”")]
still("23_race", "Spread_18_Racing_Back.png", 7, c); add("23_race", 7, c, [V_clip("C28", 1.7, 7.2, 0.5)])
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
add("29_end", 9, [(0.0, 9.0, "Want more Squish Man adventures? Ask a grown-up to visit SquishMan.com!")])

# ---- assemble picture + scene audio ----
lst = f"{OUT}/tmp/list.txt"
open(lst, "w").write("".join(f"file '{OUT}/scenes/{n}.mp4'\n" for n, *_ in SC))
dry = f"{OUT}/tmp/dry.mp4"
run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", dry])
total = sum(d for _, d, *_ in SC)

# ---- global voice track ----
items, t = [], 0.0
for n, d, caps, voices in SC:
    for v in voices:
        if v[0] == "narr":
            items.append((v[1], 0, None, t + v[2], 1.0, "narr"))
        elif v[0] == "clip":
            items.append((codes[v[1]], v[2], v[3], t + v[4], 1.0, "dlg"))
        else:
            items.append((f"{OUT}/tmp/sfx_{v[1]}.wav", 0, None, t + v[2], v[3], "sfx"))
    t += d
args, parts = [], []
for k, (src, a, b, at, vol, kind) in enumerate(items):
    if kind == "dlg": args += ["-ss", str(a), "-t", str(b - a)]
    args += ["-i", src]
    norm = "loudnorm=I=-16:TP=-2," if kind in ("narr", "dlg") else ""
    parts.append(f"[{k}:a]aresample=48000,aformat=channel_layouts=stereo,{norm}volume={vol},"
                 f"afade=in:d=0.04,adelay={int(at*1000)}|{int(at*1000)}[i{k}]")
mix = ";".join(parts) + ";" + "".join(f"[i{k}]" for k in range(len(items))) + \
      f"amix=inputs={len(items)}:normalize=0,apad=whole_dur={total},atrim=0:{total}[v]"
voice = f"{OUT}/Audio_E01_voice_track.wav"
run(["ffmpeg", "-nostdin", "-v", "error", "-y", *args, "-filter_complex", mix, "-map", "[v]", "-ar", "48000", voice])

# ---- music bed: instrumental from the owner's own music-only Book 1 clips (theme song has vocals) ----
bed_src = [codes[c] for c in ("C12", "C14", "C15", "C17", "C19")]
bargs = sum((["-i", p] for p in bed_src), [])
prev, steps = "[0:a]", []
for i in range(1, len(bed_src)):
    lab = f"[x{i}]" if i < len(bed_src) - 1 else ""
    steps.append(f"{prev}[{i}:a]acrossfade=d=1.5{lab}"); prev = lab
chain = ";".join(steps)
bedloop = f"{OUT}/tmp/bedloop.wav"
run(["ffmpeg", "-nostdin", "-v", "error", "-y", *bargs, "-filter_complex", chain, "-ar", "48000", "-ac", "2", bedloop])
t_open = SC[0][1] + SC[1][1]; t_end = total - SC[-1][1]
bed = f"{OUT}/Audio_E01_music_bed.wav"
run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-stream_loop", "-1", "-i", bedloop, "-t", str(total), "-filter_complex",
     f"[0:a]loudnorm=I=-30:TP=-9,aresample=48000,volume='if(lt(t,{t_open})+gt(t,{t_end}),0,1)':eval=frame[a]",
     "-map", "[a]", bed])

# ---- final mix: duck bed + ambience under voices ----
final = f"{OUT}/SquishMan_E01_The_Missing_Puppy_Parade_VOICED_1080p.mp4"
run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-i", dry, "-i", bed, "-i", voice, "-filter_complex",
     "[0:a][1:a]amix=inputs=2:normalize=0[amb];[2:a]asplit[vk][vm];"
     "[amb][vk]sidechaincompress=threshold=0.03:ratio=6:attack=20:release=400[duck];"
     "[duck][vm]amix=inputs=2:normalize=0,loudnorm=I=-16:LRA=11:TP=-1.5,aresample=48000[a]",
     "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", final])

def ts(x): return f"{int(x//3600):02d}:{int(x%3600//60):02d}:{int(x%60):02d},{int(round(x%1*1000)):03d}"
t, k, srt = 0.0, 1, []
for n, d, caps, _ in SC:
    for a, b, text in caps:
        srt.append(f"{k}\n{ts(t+a)} --> {ts(t+b)}\n{text}\n"); k += 1
    t += d
open(f"{OUT}/SquishMan_E01.en.srt", "w").write("\n".join(srt))
missing = [n for n in ("06_mirror", "07_friend", "16a_squirrel", "16b_squirrel", "17_gate", "18_stuck", "19_squeeze",
                       "21_pop", "22_reunion", "23_race", "24_cheer", "25_modest", "26_finale", "27_bed", "28_lesson", "29_end")
           if not os.path.exists(f"{NARR}/{n}.mp3")]
json.dump({"total": total, "voice_items": len(items), "narration_missing": missing}, open(f"{OUT}/status.json", "w"), indent=1)
print(final, total, len(items), "missing:", len(missing))
