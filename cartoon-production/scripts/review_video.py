#!/usr/bin/env python3
"""Review one downloaded video: specs, a frame strip across its whole length, and a local
Whisper transcript in ~25 s chunks (with timestamps).

Usage: SQUISH_SCRATCH=<scratch> python3 -I review_video.py <video> <out_prefix> [frames]
"""
import os, sys, subprocess, json
import numpy as np, sherpa_onnx

S = os.environ["SQUISH_SCRATCH"]
src, out = sys.argv[1], sys.argv[2]
nframes = int(sys.argv[3]) if len(sys.argv) > 3 else 24
pr = json.loads(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration:stream=codec_type,width,height,r_frame_rate",
                                "-of", "json", src], capture_output=True, text=True).stdout)
dur = float(pr["format"]["duration"])
v = next(s for s in pr["streams"] if s["codec_type"] == "video")
print(f"duration {dur:.1f}s  {v['width']}x{v['height']}  {v['r_frame_rate']}  audio={'yes' if any(s['codec_type']=='audio' for s in pr['streams']) else 'no'}")
cols = 8
subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-i", src, "-vf",
                f"fps={nframes}/{dur},scale=-2:200,drawtext=fontfile={S}/assets/Fredoka.ttf:text='%{{pts\\:hms}}':x=4:y=4:fontsize=16:fontcolor=yellow:box=1:boxcolor=black,"
                f"tile={cols}x{(nframes+cols-1)//cols}:padding=2", "-frames:v", "1", f"{out}_frames.png"], check=True)
M = f"{S}/asr/sherpa-onnx-whisper-small.en"
rec = sherpa_onnx.OfflineRecognizer.from_whisper(encoder=f"{M}/small.en-encoder.int8.onnx", decoder=f"{M}/small.en-decoder.int8.onnx",
                                                 tokens=f"{M}/small.en-tokens.txt", language="en", task="transcribe", num_threads=4)
pcm = subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-i", src, "-vn", "-ac", "1", "-ar", "16000", "-f", "s16le", "-"],
                     capture_output=True).stdout
a = np.frombuffer(pcm, np.int16).astype(np.float32) / 32768
lines = []
for s in range(0, len(a), 16000 * 25):
    st = rec.create_stream(); st.accept_waveform(16000, a[s:s + 16000 * 25]); rec.decode_stream(st)
    t = s // 16000
    lines.append(f"{t//60:02d}:{t%60:02d}  {st.result.text.strip()}")
open(f"{out}_transcript.txt", "w").write("\n".join(lines))
print("\n".join(lines))
