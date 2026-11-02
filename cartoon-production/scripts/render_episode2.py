#!/usr/bin/env python3
"""Episode 2 — Squish Man's Big Dream Adventure, built from the owner's Book 2 Flow clips,
keeping each clip's own narration and Squish Man / Pudy dialogue. Order follows the Book 2 text.
"""
import subprocess, os, sys, textwrap

S = os.environ.get("SQUISH_SCRATCH") or sys.exit("set SQUISH_SCRATCH")
REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
RAW, OUT = f"{S}/raw", f"{S}/ep2"
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

def caps_vf(tag, caps):
    f = []
    for k, (t0, t1, text) in enumerate(caps):
        p = f"{OUT}/tmp/{tag}_{k}.txt"; open(p, "w").write("\n".join(textwrap.wrap(text, 44)))
        a = f"if(lt(t,{t0}+0.25),(t-{t0})/0.25,if(gt(t,{t1}-0.25),({t1}-t)/0.25,1))"
        f.append(f"drawtext=fontfile={FONT}:textfile={p}:fontsize=52:fontcolor=white:borderw=5:"
                 f"bordercolor=0x14246b:line_spacing=10:text_align=center:box=1:boxcolor=0x0b1640@0.55:"
                 f"boxborderw=24:x=(w-text_w)/2:y=h-text_h-64:alpha='{a}':enable='between(t,{t0},{t1})'")
    return f

CHIME = f"{OUT}/tmp/chime.wav"
run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-f", "lavfi", "-i",
     "aevalsrc='0.3*sin(2*PI*1568*t)*exp(-5*t)+0.3*sin(2*PI*2093*t)*exp(-5*(t-0.18))*gte(t,0.18)':s=48000:d=1.2",
     "-af", "aformat=channel_layouts=stereo", CHIME])

def fill(label, crop_bottom=0):
    cb = f"crop=iw:ih-{crop_bottom}:0:0," if crop_bottom else ""
    return (f"[{label}]{cb}split[a][b];[a]scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},"
            f"boxblur=30:3,eq=brightness=-0.12:saturation=1.2[bg];[b]scale=-2:{H}[fg];"
            f"[bg][fg]overlay=(W-w)/2:0,setsar=1,fps={FPS}")

def clip(n, code, ss, dur, caps, audio_from=None, crop_bottom=0):
    """Vertical clip on blurred fill; its own audio (narration/dialogue) loudness-normalized."""
    asrc = codes[audio_from[0]] if audio_from else codes[code]
    ass = audio_from[1] if audio_from else ss
    vf = fill("0:v", crop_bottom) + "".join("," + x for x in caps_vf(n, caps)) + \
         f",fade=in:st=0:d=0.25,fade=out:st={dur-0.25}:d=0.25[v]"
    af = (f"[1:a]asetpts=N/SR/TB,loudnorm=I=-16:TP=-2,aresample=48000,aformat=channel_layouts=stereo,"
          f"afade=in:d=0.2,afade=out:st={dur-0.3}:d=0.3,apad=whole_dur={dur}[a]")
    run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-ss", str(ss), "-t", str(dur), "-i", codes[code],
         "-ss", str(ass), "-t", str(dur), "-i", asrc,
         "-filter_complex", vf + ";" + af, "-map", "[v]", "-map", "[a]", "-t", str(dur), *ENC, f"{OUT}/scenes/{n}.mp4"])

def page(n, img, dur, caps, audio_from=None, chime_at=None):
    """A portrait book page (or still) on a blurred fill with a slow push-in."""
    frames = int(dur * FPS)
    vf = (f"[0:v]scale=1080:-2,setsar=1[p];" + fill("p").replace(f",fps={FPS}", "") +
          f",scale=2880:1620,zoompan=z='1+0.05*on/{frames}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={frames}:s={W}x{H}:fps={FPS}"
          + "".join("," + x for x in caps_vf(n, caps)) + f",fade=in:st=0:d=0.3,fade=out:st={dur-0.3}:d=0.3[v]")
    ins = ["-loop", "1", "-t", str(dur), "-i", img]
    if audio_from:
        ins += ["-ss", str(audio_from[1]), "-t", str(dur), "-i", codes[audio_from[0]]]
        af = f"[1:a]loudnorm=I=-16:TP=-2,aresample=48000,aformat=channel_layouts=stereo,afade=out:st={dur-0.4}:d=0.4,apad=whole_dur={dur}[a]"
    else:
        ins += ["-f", "lavfi", "-t", str(dur), "-i", "anullsrc=r=48000:cl=stereo"]
        af = "[1:a]anull[a0];"
        if chime_at is not None:
            ins += ["-i", CHIME]
            af = f"[2:a]adelay={int(chime_at*1000)}|{int(chime_at*1000)}[c];[1:a][c]amix=inputs=2:normalize=0,apad=whole_dur={dur}[a]"
        else:
            af = f"[1:a]apad=whole_dur={dur}[a]"
    run(["ffmpeg", "-nostdin", "-v", "error", "-y", *ins, "-filter_complex", vf + ";" + af,
         "-map", "[v]", "-map", "[a]", "-t", str(dur), *ENC, f"{OUT}/scenes/{n}.mp4"])

def freeze(n, code, at, dur, caps, chime_at=None):
    still = f"{OUT}/tmp/{n}.png"
    run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-ss", str(at), "-i", codes[code], "-frames:v", "1", still])
    page(n, still, dur, caps, chime_at=chime_at)

def card(n, dur, lines, bg_code, bg_ss, theme_ss, logo_y=130):
    p = f"{OUT}/tmp/{n}.txt"; open(p, "w").write(lines)
    vf = (f"[0:v]scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},boxblur=18:2,setsar=1,fps={FPS}[bg];"
          f"[1:v]format=rgba,scale=1100:-1[lg];[bg][lg]overlay=(W-w)/2:{logo_y},"
          f"drawtext=fontfile={FONT}:textfile={p}:fontsize=64:fontcolor=white:borderw=6:bordercolor=0x14246b:"
          f"line_spacing=18:text_align=center:x=(w-text_w)/2:y=h-text_h-100,"
          f"fade=in:st=0:d=0.5,fade=out:st={dur-0.7}:d=0.7[v]")
    af = (f"[2:a]atrim={theme_ss}:{theme_ss+dur},asetpts=N/SR/TB,loudnorm=I=-17:TP=-2,aresample=48000,"
          f"afade=in:d=0.6,afade=out:st={dur-1.5}:d=1.5[a]")
    run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-ss", str(bg_ss), "-t", str(dur), "-i", codes[bg_code],
         "-loop", "1", "-t", str(dur), "-i", LOGO, "-i", THEME,
         "-filter_complex", vf + ";" + af, "-map", "[v]", "-map", "[a]", "-t", str(dur), *ENC, f"{OUT}/scenes/{n}.mp4"])

SC = []
def add(n, d, caps): SC.append((n, d, caps))
def C(n, code, caps, ss=0, dur=8, **kw): clip(n, code, ss, dur, caps, **kw); add(n, dur, caps)

# Book 2 order (book spread in brackets). Captions = what is actually said in each clip.
C("01_hook", "C48", [(0.3, 7.7, "“Always believe in your dreams. They might just come true.”")])
card("02_title", 8, "Episode 2\nSquish Man's Big Dream Adventure", "C46", 0, 0.0, logo_y=140); add("02_title", 8, [])
C("03_window", "C46", [(0.3, 7.7, "Squish Man knew that a brighter tomorrow starts with a dream. He gazed at the stars, ready for a big adventure.")])   # [1]
C("04_pudy", "C52", [(0.3, 7.7, "Squish Man had big dreams. Pudy reminded him to have courage.")])
c = [(0.3, 7.7, "But Squish Man knew he needed courage. The courage to keep on dreaming.")]
page("05_mirror", f"{REPO}/public/assets/previews/book2/page-02.jpg", 8, c, audio_from=("C47", 0)); add("05_mirror", 8, c)  # [2]
C("06_believe", "C64", [(0.3, 4.6, "“You must believe in yourself. Your dreams are waiting for you.”"), (4.8, 7.7, "“I will believe, Pudy.”")])
C("07_star", "C86", [(0.3, 5.0, "Pudy smiled, knowing big adventures were ahead. Then a magical, glowing star appeared."), (5.1, 7.7, "“Ready for a big adventure, Squish Man?”")])  # [3-4]
C("08_star2", "C87", [(0.3, 7.7, "“Never give up on your big dreams. Shoot for the stars! Big adventures start with a little paw.”")])  # [5]
C("09_fly", "C66", [(0.3, 7.7, "“Adventure looks better together! Up, up, and away!”")])  # [6]
C("10_bridge", "C67", [(0.3, 7.7, "“Every big adventure starts with a single step. Your dreams are closer than you think.”")])  # [7]
C("11_scared", "C90", [(0.3, 7.7, "Squish Man was a little bit scared, but the giant smiling star was getting closer.")])  # [8]
c = [(0.3, 2.8, "Squish Man is scared. Can you help him be brave?"), (3.0, 5.8, "Take a big, deep breath with him… in… and out!")]
freeze("12_breathe", "C68", 3.0, 6, c, chime_at=0.2); add("12_breathe", 6, c)
C("13_step", "C69", [(0.3, 7.7, "Squish Man was frozen with fear. He looked at Dreamstar and took a deep breath. Then he took one brave step forward.")])
C("14_across", "C71", [(0.3, 7.7, "Squish Man walked confidently along the Rainbow Bridge. The clouds began to part, revealing a magical golden glow.")])  # [9]
C("15_journey", "C74", [(0.3, 7.7, "And so, Squish Man began his journey, following the star toward his biggest dream.")])
C("16_friends", "C75", [(0.3, 7.7, "Together, they followed the light of big dreams.")])  # [10]
C("17_garden", "C76", [(0.3, 7.7, "Beyond the golden archway, a magnificent garden appeared.")])
C("18_wish", "C77", [(0.3, 7.7, "A magical wish was hidden inside the star, and it softly filled his heart with pure wonder.")])
C("19_stairs", "C79", [(0.3, 7.7, "Step by step, he climbed toward the glowing sky, ready for his big dream adventure.")])  # [14-18]
C("20_castle", "C80", [(0.3, 7.7, "Floating brightly in the sky was the kingdom of dreams.")])  # [19-20]
C("21_fountain", "C82", [(0.3, 7.7, "He stood beside the fountain of wishes. Then the star touched the water. He saw his own courage reflected back.")])  # [21-22]
C("22_hero", "C84", [(0.3, 7.7, "The fountain shimmers with a magical light, revealing his greatest dream: to be a brave hero.")])
C("23_heart", "C85", [(0.3, 7.7, "The heart gives a special gift of love… and dreams really do come true.")])
C("24_home", "C61", [(0.3, 7.7, "Even when the road is long, a true friend gives you the strength to keep going.")])  # [23-24]
c = [(0.3, 3.3, "Little paws can chase BIG dreams!"), (3.5, 7.7, "What's one BIG dream you have? Say it out loud!")]
freeze("25_challenge", "C49", 6.0, 8, c, chime_at=3.4); add("25_challenge", 8, c)
card("26_end", 9, "Want more Squish Man adventures?\nAsk a grown-up to visit SquishMan.com!", "C91", 0, 38.0, logo_y=110)
add("26_end", 9, [(0.0, 9.0, "Want more Squish Man adventures? Ask a grown-up to visit SquishMan.com!")])

lst = f"{OUT}/tmp/list.txt"
open(lst, "w").write("".join(f"file '{OUT}/scenes/{n}.mp4'\n" for n, *_ in SC))
final = f"{OUT}/SquishMan_E02_Big_Dream_Adventure_1080p.mp4"
run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", lst, "-c:v", "copy",
     "-af", "loudnorm=I=-16:LRA=11:TP=-1.5,aresample=48000", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", final])
def ts(x): return f"{int(x//3600):02d}:{int(x%3600//60):02d}:{int(x%60):02d},{int(round(x%1*1000)):03d}"
t, k, srt = 0.0, 1, []
for n, d, caps in SC:
    for a, b, text in caps:
        srt.append(f"{k}\n{ts(t+a)} --> {ts(t+b)}\n{text}\n"); k += 1
    t += d
open(f"{OUT}/SquishMan_E02.en.srt", "w").write("\n".join(srt))
print(final, t)
