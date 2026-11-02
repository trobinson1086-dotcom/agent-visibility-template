#!/usr/bin/env python3
"""Render the Book 1 approval preview (16:9, 1920x1080) from vertical Flow clips.

Each segment: the 9:16 clip centered at full height over a blurred, darkened
fill of itself; book-text captions in Fredoka; loudness-normalized audio.
Segments are concatenated with short fades. Also writes an SRT.
"""
import subprocess, os, sys, textwrap

S = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW, OUT = f"{S}/raw", f"{S}/preview"
FONT = f"{S}/assets/Fredoka.ttf"
LOGO = f"{S}/assets/logo_alpha.png"
os.makedirs(f"{OUT}/seg", exist_ok=True)
codes = dict(l.split("\t")[:2] for l in open(f"{S}/codes.tsv"))
THEME = f"{RAW}/{codes['C02']}.mp4" if False else None
for l in open(f"{S}/codes.tsv"):
    c, i, n = l.rstrip("\n").split("\t")
    if "Theme" in n: THEME = f"{RAW}/{i}.mp4"

W, H, FPS = 1920, 1080, 24

def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode: sys.exit(r.stderr[-2000:])

def txtfile(name, text):
    p = f"{OUT}/seg/{name}.txt"
    open(p, "w").write(text)
    return p

def caption_filters(seg, caps):
    """caps: list of (t0, t1, text). Lower-third, white Fredoka w/ navy outline on soft box."""
    f = []
    for k, (t0, t1, text) in enumerate(caps):
        wrapped = "\n".join(textwrap.wrap(text, 46))
        p = txtfile(f"{seg}_{k}", wrapped)
        a = f"if(lt(t,{t0}+0.25),(t-{t0})/0.25,if(gt(t,{t1}-0.25),({t1}-t)/0.25,1))"
        f.append(
            f"drawtext=fontfile={FONT}:textfile={p}:fontsize=50:fontcolor=white:"
            f"borderw=5:bordercolor=0x14246b:line_spacing=10:text_align=center:"
            f"box=1:boxcolor=0x0b1640@0.55:boxborderw=24:"
            f"x=(w-text_w)/2:y=h-text_h-70:alpha='{a}':enable='between(t,{t0},{t1})'")
    return f

def fill(src_label="0:v"):
    return (f"[{src_label}]split[a][b];"
            f"[a]scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},boxblur=30:3,eq=brightness=-0.12:saturation=1.2[bg];"
            f"[b]scale=-2:{H}[fg];[bg][fg]overlay=(W-w)/2:0,setsar=1,fps={FPS}")

def clip_seg(name, code, ss, dur, caps=(), extra=(), audio_gain=1.0):
    vf = fill() + "".join("," + x for x in list(extra) + caption_filters(name, caps))
    vf += f",fade=in:st=0:d=0.3,fade=out:st={dur-0.3}:d=0.3[v]"
    af = (f"[0:a]atrim=0:{dur},asetpts=N/SR/TB,loudnorm=I=-20:TP=-2,volume={audio_gain},"
          f"afade=in:d=0.3,afade=out:st={dur-0.3}:d=0.3,aresample=48000[a]")
    run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-ss", str(ss), "-t", str(dur),
         "-i", f"{RAW}/{codes[code]}.mp4", "-filter_complex", vf + ";" + af,
         "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-preset", "medium", "-crf", "18",
         "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-ac", "2", f"{OUT}/seg/{name}.mp4"])

def card_seg(name, code, ss, dur, theme_ss, lines, logo_y=120):
    """Logo + text card over a blurred clip, theme song audio."""
    p = txtfile(name, lines)
    vf = (f"[0:v]scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},boxblur=20:2,"
          f"eq=brightness=-0.05,setsar=1,fps={FPS}[bg];"
          f"[1:v]format=rgba,scale=1100:-1[lg];"
          f"[bg][lg]overlay=(W-w)/2:{logo_y},"
          f"drawtext=fontfile={FONT}:textfile={p}:fontsize=64:fontcolor=white:borderw=6:"
          f"bordercolor=0x14246b:line_spacing=18:text_align=center:x=(w-text_w)/2:y=h-text_h-110,"
          f"fade=in:st=0:d=0.5,fade=out:st={dur-0.6}:d=0.6[v]")
    af = (f"[2:a]atrim={theme_ss}:{theme_ss+dur},asetpts=N/SR/TB,loudnorm=I=-18:TP=-2,"
          f"afade=in:d=0.8,afade=out:st={dur-1.2}:d=1.2,aresample=48000[a]")
    run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-ss", str(ss), "-t", str(dur), "-i", f"{RAW}/{codes[code]}.mp4",
         "-loop", "1", "-t", str(dur), "-i", LOGO, "-i", THEME, "-filter_complex", vf + ";" + af,
         "-map", "[v]", "-map", "[a]", "-t", str(dur), "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p",
         "-c:a", "aac", "-b:a", "192k", "-ac", "2", f"{OUT}/seg/{name}.mp4"])

def freeze_seg(name, code, at, dur, caps):
    """Interactive pause: hold one frame with a slow push-in so kids can answer."""
    still = f"{OUT}/seg/{name}.png"
    run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-ss", str(at), "-i", f"{RAW}/{codes[code]}.mp4", "-frames:v", "1", still])
    zoom = f"zoompan=z='1+0.0015*on':x='iw/2-(iw/zoom/2)':y='ih*0.75-(ih/zoom/2)':d={int(dur*FPS)}:s=720x1280:fps={FPS}"
    vf = f"[0:v]{zoom}[z];" + fill("z") + "".join("," + x for x in caption_filters(name, caps))
    vf += f",fade=in:st=0:d=0.3,fade=out:st={dur-0.3}:d=0.3[v]"
    run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-loop", "1", "-i", still, "-f", "lavfi", "-t", str(dur),
         "-i", "anullsrc=r=48000:cl=stereo", "-filter_complex", vf, "-map", "[v]", "-map", "1:a",
         "-t", str(dur), "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k",
         f"{OUT}/seg/{name}.mp4"])

# ---- Book 1 preview timeline (text from the published/final Book 1) ----
SEGS = []
def add(name, dur, caps=()): SEGS.append((name, dur, caps))

card_seg("s01_open", "C01", 0, 5.0, 0.0,
         "Episode 1\nThe Missing Puppy Parade", logo_y=150); add("s01_open", 5.0)
c = [(4.2, 7.9, "Every year, Maple Hollow held its biggest celebration — the Puppy Parade!")]
clip_seg("s02_parade", "C08", 0, 8.0, c); add("s02_parade", 8.0, c)
c = [(0.4, 3.8, "But when the parade bell rang — DING DING DING — the little puppy was nowhere to be found!")]
clip_seg("s03_leash", "C16", 0, 4.0, c); add("s03_leash", 4.0, c)
c = [(0.3, 2.0, "Can you spot the clue?"), (2.4, 4.0, "Paw prints! Great job!")]
freeze_seg("s04_clue", "C12", 0.4, 4.0, c); add("s04_clue", 4.0, c)
c = [(0.3, 3.6, "“Follow the paw prints,” Squish Man told himself, “one careful step at a time.”")]
clip_seg("s05_track", "C16", 4.0, 4.0, c); add("s05_track", 4.0, c)
c = [(0.4, 5.8, "“Looking for someone, dear?” purred Mrs. Whiskers. “A puppy went that way — toward the roses.”")]
clip_seg("s06_whiskers", "C23", 2.0, 6.0, c); add("s06_whiskers", 6.0, c)
c = [(0.3, 3.8, "What should Squish Man do next?")]
clip_seg("s07_roses", "C24", 2.0, 4.0, c); add("s07_roses", 4.0, c)
c = [(0.4, 5.7, "“I wasn’t going anywhere without my friend.”")]
clip_seg("s08_found", "C33", 2.0, 6.0, c); add("s08_found", 6.0, c)
card_seg("s09_end", "C34", 2.0, 7.0, 38.0,
         "Want more Squish Man adventures?\nAsk a grown-up to visit SquishMan.com!", logo_y=110)
add("s09_end", 7.0, [(0.0, 7.0, "Want more Squish Man adventures? Ask a grown-up to visit SquishMan.com!")])

# concat
lst = f"{OUT}/seg/list.txt"
open(lst, "w").write("".join(f"file '{OUT}/seg/{n}.mp4'\n" for n, _, _ in SEGS))
final = f"{OUT}/SquishMan_E01_Preview_16x9.mp4"
run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", lst,
     "-c:v", "libx264", "-crf", "19", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k",
     "-movflags", "+faststart", final])

# SRT
def ts(t): return f"{int(t//3600):02d}:{int(t%3600//60):02d}:{int(t%60):02d},{int(round(t%1*1000)):03d}"
t, k, srt = 0.0, 1, []
for n, d, caps in SEGS:
    for a, b, text in caps:
        srt.append(f"{k}\n{ts(t+a)} --> {ts(t+b)}\n{text}\n"); k += 1
    t += d
open(f"{OUT}/SquishMan_E01_Preview.en.srt", "w").write("\n".join(srt))
print(final, t)
