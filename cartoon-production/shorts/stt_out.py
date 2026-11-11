import sys, subprocess, numpy as np, sherpa_onnx
S, V = sys.argv[1], sys.argv[2]; M=f"{S}/asr/sherpa-onnx-whisper-small.en"
rec=sherpa_onnx.OfflineRecognizer.from_whisper(encoder=f"{M}/small.en-encoder.int8.onnx",decoder=f"{M}/small.en-decoder.int8.onnx",tokens=f"{M}/small.en-tokens.txt",language="en",task="transcribe",num_threads=4)
pcm=subprocess.run(["ffmpeg","-nostdin","-v","error","-i",V,"-vn","-ac","1","-ar","16000","-f","s16le","-"],capture_output=True).stdout
a=np.frombuffer(pcm,dtype=np.int16).astype(np.float32)/32768; t=0.0
while (t+0.5)*16000<len(a):
    st=rec.create_stream(); st.accept_waveform(16000,a[int(t*16000):int((t+2)*16000)]); rec.decode_stream(st)
    print(f"{t:4.1f}-{t+2:4.1f} {st.result.text.strip()}", flush=True); t+=1.0
