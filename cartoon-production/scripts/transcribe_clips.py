#!/usr/bin/env python3
"""Free local transcription of every clip's audio (Whisper small.en via sherpa-onnx, CPU).

Usage: SQUISH_SCRATCH=<scratch> python3 -I transcribe_clips.py
Writes <scratch>/stt/transcripts.tsv : code <TAB> text
"""
import os, sys, subprocess
import numpy as np
import sherpa_onnx

S = os.environ["SQUISH_SCRATCH"]
M = f"{S}/asr/sherpa-onnx-whisper-small.en"
rec = sherpa_onnx.OfflineRecognizer.from_whisper(
    encoder=f"{M}/small.en-encoder.int8.onnx", decoder=f"{M}/small.en-decoder.int8.onnx",
    tokens=f"{M}/small.en-tokens.txt", language="en", task="transcribe", num_threads=4)
out = open(f"{S}/stt/transcripts.tsv", "w")
for line in open(f"{S}/codes.tsv"):
    code, did, name = line.rstrip("\n").split("\t")
    pcm = subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-i", f"{S}/raw/{did}.mp4", "-t", "28",
                          "-vn", "-ac", "1", "-ar", "16000", "-f", "s16le", "-"], capture_output=True).stdout
    a = np.frombuffer(pcm, dtype=np.int16).astype(np.float32) / 32768.0
    st = rec.create_stream(); st.accept_waveform(16000, a); rec.decode_stream(st)
    text = st.result.text.strip()
    out.write(f"{code}\t{text}\n"); out.flush()
    print(code, text, flush=True)
