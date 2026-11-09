#!/usr/bin/env python3
"""Polished series outro from the owner's "squish outro.mp4" (Drive: Squish Edited Cartoons, 5 Nov 2026).

The source is a 4:06 CapCut compilation of promo clips. This edit keeps the owner's clips, voices and music,
puts them in a clear order (theme -> books -> learning -> Squish Squad -> farewell), removes the duplicates,
a line that starts mid-sentence, three of the five store pitches, split-screen collages, a frame with an AI
"Disney" glitch (3:52) and the CapCut watermark end screen, and joins the parts with soft crossfades.
Output: vertical 1080x1920, 24 fps, -16 LUFS, to match the vertical episodes.

Usage: SQUISH_SCRATCH=<scratch> python3 -I build_outro.py
"""
import os, subprocess, sys

S = os.environ.get("SQUISH_SCRATCH") or sys.exit("set SQUISH_SCRATCH")
SRC = f"{S}/outro_src/squish_outro.mp4"
OUT = f"{S}/outro_build"; os.makedirs(OUT, exist_ok=True)
SONG = None
for l in open(f"{S}/codes.tsv"):
    c, i, n = l.rstrip("\n").split("\t")
    if c == "C02": SONG = f"{S}/raw/{i}.mp4"          # owner's Squish Man theme song
W, H, FPS, XF = 1080, 1920, 24, 0.4
ENC = ["-c:v", "libx264", "-preset", "medium", "-crf", "17", "-pix_fmt", "yuv420p",
       "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2"]
LOOK = f"scale={W}:{H}:force_original_aspect_ratio=increase:flags=lanczos,crop={W}:{H},setsar=1,fps={FPS},eq=saturation=1.06:contrast=1.03"
AUD = "aresample=48000,aformat=sample_rates=48000:channel_layouts=stereo"

def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode: sys.exit(" ".join(cmd)[:400] + "\n" + r.stderr[-2000:])

# (name, start, duration) in the source, in the new order
PARTS = [("01_theme", 0.0, 14.2), ("02_walk", 32.1, 8.0), ("03_five_adventures", 108.57, 8.0),
         ("04_book_covers", 129.93, 7.0), ("05_puppy_parade_book", 76.57, 8.0), ("06_learning_book", 69.3, 7.27),
         ("07_beyond_stories", 116.57, 8.0), ("08_squish_squad", 136.93, 8.0), ("09_gear", 166.97, 8.0),
         ("10_not_the_end", 100.57, 8.0), ("11_next_adventure", 84.57, 8.0)]
files = []
for n, ss, d in PARTS:
    out = f"{OUT}/{n}.mp4"
    if n == "04_book_covers":   # source audio is only giggles: keep them softly under the owner's theme song
        run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-ss", str(ss), "-t", str(d), "-i", SRC, "-ss", "20", "-t", str(d), "-i", SONG,
             "-filter_complex", f"[0:v]{LOOK}[v];[0:a]{AUD},loudnorm=I=-26:TP=-4[g];[1:a]{AUD},loudnorm=I=-18:TP=-2[m];"
             f"[g][m]amix=inputs=2:normalize=0,afade=in:d=0.5,afade=out:st={d-0.6}:d=0.6[a]",
             "-map", "[v]", "-map", "[a]", "-t", str(d), *ENC, out])
    else:
        run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-ss", str(ss), "-t", str(d), "-i", SRC,
             "-filter_complex", f"[0:v]{LOOK}[v];[0:a]{AUD},loudnorm=I=-16:TP=-1.5,apad=whole_dur={d}[a]",
             "-map", "[v]", "-map", "[a]", "-t", str(d), *ENC, out])
    files.append((out, d))

# Closing: "Being small never means you can't do something big." (source 226.0-233.67) over the clean sunset shots
# (234.0-236.4 and 238.2-240.0), ending on the SquishMan.com logo card (fully shown at 240.85) held for 4 s.
close = f"{OUT}/12_closing.mp4"; cd = 2.4 + 1.8 + 4.0
run(["ffmpeg", "-nostdin", "-v", "error", "-y",
     "-ss", "234.0", "-t", "2.4", "-i", SRC, "-ss", "238.2", "-t", "1.8", "-i", SRC, "-ss", "240.85", "-i", SRC,
     "-ss", "226.0", "-t", "7.67", "-i", SRC,
     "-filter_complex",
     f"[0:v]{LOOK}[a0];[1:v]{LOOK}[a1];[2:v]{LOOK},trim=end_frame=1,tpad=stop_mode=clone:stop_duration=4,setpts=PTS-STARTPTS[a2];"
     f"[a0][a1][a2]concat=n=3:v=1:a=0[v];"
     f"[3:a]{AUD},loudnorm=I=-16:TP=-1.5,adelay=200|200,apad=whole_dur={cd},afade=out:st={cd-1.5}:d=1.5[a]",
     "-map", "[v]", "-map", "[a]", "-t", str(cd), *ENC, close])
files.append((close, cd))

# Join with soft crossfades
args, fc, t = [], [], 0.0
for f, _ in files: args += ["-i", f]
vprev, aprev = "[0:v]", "[0:a]"
t = files[0][1]
for k in range(1, len(files)):
    off = t - XF
    vl, al = (f"[v{k}]", f"[a{k}]") if k < len(files) - 1 else ("[vx]", "[ax]")
    fc.append(f"{vprev}[{k}:v]xfade=transition=fade:duration={XF}:offset={off:.3f}{vl}")
    fc.append(f"{aprev}[{k}:a]acrossfade=d={XF}{al}")
    vprev, aprev = vl, al
    t = off + files[k][1]
fc.append(f"[vx]fade=in:st=0:d=0.5,fade=out:st={t-0.8:.3f}:d=0.8[v];[ax]loudnorm=I=-16:TP=-1.5,{AUD}[a]")
final = f"{S}/deliver/SquishMan_Outro_VERTICAL_1080x1920.mp4"
os.makedirs(os.path.dirname(final), exist_ok=True)
run(["ffmpeg", "-nostdin", "-v", "error", "-y", *args, "-filter_complex", ";".join(fc), "-map", "[v]", "-map", "[a]",
     *ENC, "-movflags", "+faststart", final])
print(final, round(t, 2))
